#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3540-3559-primary-20261103")
REPO = ROOT / "source/repo"
IN = ROOT / "candidate-free-input"
OUT = ROOT / "review"
EXPECTED_HEAD = "f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d"
EXPECTED_TREE = "3ba2579c326f8dbac943ba43df77ddd5747a85a1"
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR", "ar", "ko", "zh_Hant", "vi", "id"]
PROTECTED = ["SeerrNG", "Audiobookshelf", "ISBN", "API", "URL", "HTTP", "HTTPS", "IP"]
PLACEHOLDER = re.compile(r"\{[^{}]+\}")
MARKUP = re.compile(r"</?[A-Za-z][^>]*>")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]

def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, check=True, capture_output=True).stdout

# Candidate-free verifier is intentionally separate from this semantic ledger check.
subprocess.run(["python3", str(ROOT / "verify_candidate_free.py")], check=True, capture_output=True, text=True)
assert subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip() == EXPECTED_HEAD
assert subprocess.run(["git", "rev-parse", "HEAD^{tree}"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip() == EXPECTED_TREE
assert not subprocess.run(["git", "status", "--porcelain"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()

input_manifest_sha = sha((IN / "manifest.json").read_bytes())
input_sums_sha = sha((IN / "SHA256SUMS.txt").read_bytes())
expected_input_manifest_sha = "14d7c9313f4b1eb7a0160712c87bd07089a719bcb05c64fbd8493a31f143a102"
expected_input_sums_sha = "6b8b67e58028a0af79afad9a115a42b49233df18d2469227fe4153bece68ddb8"
assert input_manifest_sha == expected_input_manifest_sha
assert input_sums_sha == expected_input_sums_sha

sum_lines = (OUT / "SHA256SUMS.txt").read_text(encoding="ascii").splitlines()
assert sum_lines
sum_names = set()
for line in sum_lines:
    expected, name = line.split(maxsplit=1)
    name = name.strip().lstrip("*")
    path = OUT / name
    assert path.is_file()
    assert sha(path.read_bytes()) == expected, f"checksum mismatch: {name}"
    sum_names.add(name)
assert sum_names == {p.name for p in OUT.iterdir() if p.is_file() and p.name != "SHA256SUMS.txt"}

ledger = jl(OUT / "primary-ledger.jsonl")
selected = jl(OUT / "selected-direct-locale-cells.jsonl")
input_cells = jl(IN / "current-target-cells.jsonl")
input_sources = {r["position"]: r for r in jl(IN / "source-cells.jsonl")}
input_contexts = {r["position"]: r for r in jl(IN / "caller-contexts.jsonl")}
summary = j(OUT / "summary.json")
provenance = j(OUT / "provenance.json")
expected_counts = {"accept-current": 217, "correction": 9, "refinement": 14}
assert len(ledger) == 240
assert len(selected) == 23
assert summary["cells"] == 240 and summary["sourceIds"] == 20 and summary["locales"] == 12
assert summary["dispositions"] == expected_counts
assert summary["proposedChanges"] == 23
assert summary["callerlessHolds"] == 0 and summary["nativeSpeakerApproval"] is False
assert summary["exactHeadBrowserReview"] is False
assert summary["head"] == EXPECTED_HEAD and summary["tree"] == EXPECTED_TREE
assert summary["candidateFreeManifestJsonSha256"] == input_manifest_sha
assert summary["candidateFreeChecksumListSha256"] == input_sums_sha
assert provenance["candidateFreeManifestJsonSha256"] == input_manifest_sha
assert provenance["candidateFreeChecksumListSha256"] == input_sums_sha
assert provenance["candidateFreeInputManifestLineage"] == "manifest JSON and SHA256SUMS list are distinct files and separately hashed"
assert len(input_cells) == 240
input_by_key = {(x["position"], x["locale"]): x for x in input_cells}
assert len(input_by_key) == 240
ledger_by_key = {(x["position"], x["locale"]): x for x in ledger}
assert len(ledger_by_key) == 240 and set(ledger_by_key) == set(input_by_key)
selected_by_key = {(x["position"], x["locale"]): x for x in selected}
assert len(selected_by_key) == len(selected)
assert set(selected_by_key) == {k for k, row in ledger_by_key.items() if row["disposition"] != "accept-current"}
counts = {}
for key, row in ledger_by_key.items():
    input_row = input_by_key[key]
    source = input_sources[row["position"]]
    caller = input_contexts[row["position"]]
    assert row["head"] == EXPECTED_HEAD and row["tree"] == EXPECTED_TREE
    assert row["sourceId"] == input_row["sourceId"] == source["sourceId"]
    assert row["source"] == input_row["source"] == source["source"]
    assert row["sourceSha256"] == input_row["sourceSha256"] == source["sourceSha256"]
    assert row["currentTarget"] == input_row["currentTarget"]
    assert row["currentTargetSha256"] == input_row["currentTargetSha256"]
    assert row["catalogPath"] == input_row["catalogPath"]
    assert row["catalogGitBlob"] == input_row["catalogGitBlob"]
    assert row["catalogSha256"] == input_row["catalogSha256"]
    assert row["callerContext"]["callerCount"] == caller["callerCount"] > 0
    assert row["callerContext"]["directMessageReferences"] == caller["directMessageReferences"]
    assert row["rationale"].strip()
    assert row["finalTargetSha256"] == sha(row["finalTarget"].encode())
    assert row["finalTarget"] == row["currentTarget"] if row["disposition"] == "accept-current" else True
    assert row["placeholderTokenChecks"]["finalSequenceMatchesSource"] is True
    assert row["placeholderTokenChecks"]["finalSetMatchesSource"] is True
    assert row["markupTokenChecks"]["finalSequenceMatchesSource"] is True
    assert row["protectedLiteralChecks"]["finalSetMatchesSource"] is True
    counts[row["disposition"]] = counts.get(row["disposition"], 0) + 1
    if row["disposition"] != "accept-current":
        selected_row = selected_by_key[key]
        assert selected_row["currentTarget"] == row["currentTarget"]
        assert selected_row["proposedTarget"] == row["finalTarget"]
        assert selected_row["proposedTargetSha256"] == row["finalTargetSha256"]
        assert selected_row["disposition"] == row["disposition"]
        assert selected_row["rationale"] == row["rationale"]
assert counts == expected_counts
assert all(row["locale"] in LOCALES for row in ledger)
assert all(row["confidence"] in {"high", "moderate", "low"} for row in ledger)

print(json.dumps({
    "result": "PASS",
    "head": EXPECTED_HEAD,
    "tree": EXPECTED_TREE,
    "cells": len(ledger),
    "dispositions": counts,
    "selectedChanges": len(selected),
    "callerlessHolds": 0,
    "placeholderMarkupProtectedLiteralMismatches": 0,
    "candidateFreeManifestJsonSha256": input_manifest_sha,
    "candidateFreeChecksumListSha256": input_sums_sha,
    "primaryChecksumEntries": len(sum_lines),
    "primaryChecksumListSha256": sha((OUT / "SHA256SUMS.txt").read_bytes()),
}, indent=2))
