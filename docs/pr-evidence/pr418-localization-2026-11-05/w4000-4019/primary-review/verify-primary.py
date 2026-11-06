#!/usr/bin/env python3
"""Portable integrity verifier for SeerrNG PR #418 W4000-W4019 primary review."""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HEAD = "ac193096ebfc0007183348b24e35bf6fee33f67a"
TREE = "93e71e7c52602ec3f8b76548fd12b2f5b4368b4c"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]


def fail(message):
    raise SystemExit("FAIL: " + message)


def need(condition, message):
    if not condition:
        fail(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def shat(value):
    return sha(value.encode("utf-8"))


def j(path):
    return json.loads(path.read_text(encoding="utf-8"))


def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def tokens(value):
    protected = re.findall(
        r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])",
        value,
    )
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-free", required=True)
    cf = Path(parser.parse_args().candidate_free).resolve()
    manifest = j(ROOT / "manifest.json")
    expected_files = set(manifest["fileNames"])
    actual_files = {p.name for p in ROOT.iterdir() if p.is_file() and p.name not in {"manifest.json", "SHA256SUMS.txt"}}
    need(actual_files == expected_files and len(actual_files) == len(manifest["fileNames"]), "primary manifest file list")
    sums = {}
    for line in (ROOT / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        need(name not in sums, "duplicate primary checksum")
        sums[name] = digest
    need(set(sums) == actual_files | {"manifest.json"}, "primary checksum inventory")
    for name, digest in sums.items():
        need(sha((ROOT / name).read_bytes()) == digest, "primary checksum " + name)

    cf_manifest = j(cf / "manifest.json")
    cf_sums_sha = sha((cf / "SHA256SUMS.txt").read_bytes())
    need((manifest["head"], manifest["tree"], manifest["window"], manifest["candidateFreeManifestSha256"],
          manifest["candidateFreeChecksumManifestSha256"]) ==
         (HEAD, TREE, "W4000-W4019", sha((cf / "manifest.json").read_bytes()), cf_sums_sha), "candidate-free lineage pins")
    need((cf_manifest["head"], cf_manifest["tree"], cf_manifest["window"], cf_manifest["cellCount"]) ==
         (HEAD, TREE, "W4000-W4019", 240), "candidate-free packet identity")
    cf_sums = {}
    for line in (cf / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        cf_sums[name] = digest
    cf_actual = {p.name for p in cf.iterdir() if p.is_file() and p.name not in {"SHA256SUMS.txt", "manifest.json"}}
    need(set(cf_sums) == cf_actual | {"manifest.json"} and
         all(sha((cf / name).read_bytes()) == digest for name, digest in cf_sums.items()), "candidate-free copied input checksums")

    sources = {row["position"]: row for row in jl(cf / "selected-source-cells.jsonl")}
    cells = {(row["position"], row["locale"]): row for row in jl(cf / "current-target-cells.jsonl")}
    contexts = {row["sourceId"]: row for row in jl(cf / "caller-contexts.jsonl")}
    ledger = jl(ROOT / "primary-ledger.jsonl")
    need(len(sources) == 20 and len(cells) == 240 and len(contexts) == 20 and len(ledger) == 240,
         "primary/candidate-free coverage")
    expected_order = [(pos, locale) for pos in range(4000, 4020) for locale in LOCALES]
    need([(row["position"], row["locale"]) for row in ledger] == expected_order, "primary ledger order")
    proposals = jl(ROOT / "selected-proposals.jsonl")
    holds = jl(ROOT / "hash-only-holds.jsonl")
    proposal_by_key = {(row["position"], row["locale"]): row for row in proposals}
    hold_by_key = {(row["position"], row["locale"]): row for row in holds}
    need(len(proposal_by_key) == len(proposals) == 34 and len(hold_by_key) == len(holds) == 12, "proposal/hold uniqueness")
    counts = collections.Counter()
    for row in ledger:
        key = (row["position"], row["locale"])
        source, cell = sources[key[0]], cells[key]
        common = {"position": key[0], "locale": key[1], "sourceIdSha256": source["sourceIdSha256"],
                  "sourceTextSha256": source["sourceTextSha256"], "currentTargetSha256": cell["currentTargetSha256"],
                  "callerContextSha256": contexts[source["sourceId"]]["callerContextSha256"]}
        need(all(row[field] == value for field, value in common.items()), "primary row binding " + repr(key))
        if row["primaryDisposition"] == "HOLD":
            hold = hold_by_key.get(key)
            need(hold == row and row["hashOnly"] is True and row["holdCode"] == "PRODUCT_TERM_UNRESOLVED" and
                 all(k not in row for k in ("sourceId", "sourceText", "currentTarget", "target", "proposedTarget")),
                 "hash-only hold " + repr(key))
            need(key[0] == 4013, "unexpected hold position")
        else:
            need(row.get("sourceId") == source["sourceId"] and row.get("sourceText") == source["sourceText"] and
                 row.get("currentTarget") == cell["currentTarget"] and row.get("currentTokenChecks") == cell["tokenChecks"],
                 "primary current-cell binding " + repr(key))
            if row["primaryDisposition"] in ("CORRECTION", "REFINEMENT"):
                proposal = proposal_by_key.get(key)
                need(proposal == row and shat(row["proposedTarget"]) == row["proposedTargetSha256"], "proposal record " + repr(key))
                source_tokens, target_tokens = tokens(source["sourceText"]), tokens(row["proposedTarget"])
                need(source_tokens["placeholders"] == target_tokens["placeholders"] and
                     source_tokens["markupTags"] == target_tokens["markupTags"] and
                     source_tokens["numericTokens"] == target_tokens["numericTokens"] and
                     all(value in target_tokens["protectedLiterals"] for value in source_tokens["protectedLiterals"]),
                     "proposal token preservation " + repr(key))
                expected_checks = {
                    "placeholders": source_tokens["placeholders"] == target_tokens["placeholders"],
                    "markupTags": source_tokens["markupTags"] == target_tokens["markupTags"],
                    "numericTokens": source_tokens["numericTokens"] == target_tokens["numericTokens"],
                    "protectedLiterals": all(value in target_tokens["protectedLiterals"] for value in source_tokens["protectedLiterals"]),
                }
                need(row["proposalTokenChecks"] == expected_checks, "proposal check record " + repr(key))
            else:
                need(row["primaryDisposition"] == "ACCEPT_CURRENT" and key not in proposal_by_key,
                     "accept-current disposition " + repr(key))
                for token_field, check in row["currentTokenChecks"].items():
                    need(check["matches"] or key == (4007, "ja") and token_field == "numericTokens",
                         "unassessed current token mismatch " + repr(key))
                if key == (4007, "ja"):
                    need(row["numericTokenAssessment"]["meaningPreserved"] is True and
                         row["numericTokenAssessment"]["currentNumericTokens"] == ["1"], "Japanese numeric equivalent assessment")
        counts[row["primaryDisposition"]] += 1
    need(set(proposal_by_key) == {(r["position"], r["locale"]) for r in ledger if r["primaryDisposition"] in ("CORRECTION", "REFINEMENT")},
         "proposal/ledger set parity")
    need(set(hold_by_key) == {(4013, locale) for locale in LOCALES}, "held cells are precisely position 4013")
    need(dict(counts) == {"ACCEPT_CURRENT": 194, "CORRECTION": 27, "HOLD": 12, "REFINEMENT": 7}, "primary disposition totals")
    summary = j(ROOT / "primary-summary.json")
    need(summary["dispositionCounts"] == dict(counts) and summary["proposalCount"] == len(proposals) and
         summary["currentHashOnlyHolds"] == len(holds) and summary["blindPacketInspected"] is False and
         summary["crossReviewPerformed"] is False and summary["rootAdjudicationPerformed"] is False and
         summary["nativeSpeakerApproval"] is False and summary["browserAcceptance"] is False and
         summary["PRorCatalogEdits"] is False and summary["testsBuildsScansCI"] is False, "primary summary flags/counts")

    print(json.dumps({"result": "PASS", "window": "W4000-W4019", "head": HEAD, "tree": TREE,
                      "cells": len(ledger), "dispositionCounts": dict(counts), "proposalCount": len(proposals),
                      "hashOnlyHolds": len(holds), "candidateFreeManifestSha256": manifest["candidateFreeManifestSha256"],
                      "baselineJapaneseNumericEquivalentAccepted": True, "checksums": len(sums)},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
