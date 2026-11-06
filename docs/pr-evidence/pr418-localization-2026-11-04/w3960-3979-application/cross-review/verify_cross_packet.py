#!/usr/bin/env python3
"""Verify the SeerrNG PR #418 W3960-W3979 cross-review packet."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path("/home/keith/Documents/code/task-scratch")
DEFAULT_SOURCE = Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source")
DEFAULT_PRIMARY = ROOT / "seerrng-pr418-w3960-3979-primary-20261104/candidate-free-input"
DEFAULT_PRIMARY_REVIEW = ROOT / "seerrng-pr418-w3960-3979-primary-20261104/primary-review"
DEFAULT_BLIND = ROOT / "seerrng-pr418-w3960-3979-blind-20261104"
HEAD = "a456dd66aad34cb23f432cb3c189bb8083bbbe96"
TREE = "7a5447e5f08e84c392899a6e1400d1df73b1143b"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: Path) -> str:
    return sha(path.read_bytes())


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def verify_sums(directory: Path) -> int:
    count = 0
    for line in (directory / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative = line.split("  ", 1)
        actual = file_sha(directory / relative)
        if actual != expected:
            raise ValueError(f"checksum mismatch: {directory / relative}")
        count += 1
    return count


def verify_input_manifest(directory: Path) -> None:
    for line in (directory / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative = line.split("  ", 1)
        if file_sha(directory / relative) != expected:
            raise ValueError(f"input checksum mismatch: {directory / relative}")


def git(source: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=source, text=True).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-worktree", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--primary-input", type=Path, default=DEFAULT_PRIMARY)
    parser.add_argument("--primary-review", type=Path, default=DEFAULT_PRIMARY_REVIEW)
    parser.add_argument("--blind-packet", type=Path, default=DEFAULT_BLIND)
    args = parser.parse_args()

    checksum_count = verify_sums(HERE)
    for directory in (args.primary_input, args.primary_review, args.blind_packet):
        verify_input_manifest(directory)
    blind_input = args.blind_packet / "candidate-free-input"
    verify_input_manifest(blind_input)
    if file_sha(args.primary_input / "manifest.json") != file_sha(blind_input / "manifest.json"):
        raise ValueError("primary and blind candidate-free manifest hashes differ")
    if file_sha(args.primary_input / "SHA256SUMS.txt") != file_sha(blind_input / "SHA256SUMS.txt"):
        raise ValueError("primary and blind candidate-free checksum hashes differ")

    manifest = load_json(HERE / "manifest.json")
    summary = load_json(HERE / "summary.json")
    attestation = load_json(HERE / "input-attestation.json")
    live_before = load_json(HERE / "live-review-before.json")
    live_after = load_json(HERE / "live-review-after.json")
    cells = load_jsonl(HERE / "cross-review-cells.jsonl")
    selected = load_jsonl(HERE / "selected-proposals.jsonl")
    candidates = load_jsonl(HERE / "proposal-reconciliation.jsonl")
    holds = load_jsonl(HERE / "hash-only-holds.jsonl")
    noops = load_jsonl(HERE / "no-op-ledger.jsonl")

    head = git(args.source_worktree, "rev-parse", "HEAD^{commit}")
    tree = git(args.source_worktree, "rev-parse", "HEAD^{tree}")
    status = git(args.source_worktree, "status", "--porcelain=v1")
    if (head, tree, status) != (HEAD, TREE, ""):
        raise ValueError(f"source worktree pin/cleanliness mismatch: {(head, tree, status)!r}")
    refs_text = subprocess.check_output(
        ["git", "ls-remote", "origin", "refs/heads/codex/seerrng-localization-overhaul-20261028", "refs/pull/418/head", "refs/heads/main"],
        cwd=args.source_worktree,
        text=True,
    )
    refs = {line.split("\t", 1)[1]: line.split("\t", 1)[0] for line in refs_text.splitlines() if "\t" in line}
    if refs.get("refs/heads/codex/seerrng-localization-overhaul-20261028") != HEAD or refs.get("refs/pull/418/head") != HEAD:
        raise ValueError("live branch or pull ref does not match the pinned head")
    for field in ("state", "draft", "apiHead", "apiHeadRef", "apiBase", "apiBaseRef"):
        if live_before.get(field) != live_after.get(field):
            raise ValueError(f"recorded live PR state changed during review: {field}")
    if live_after.get("apiHead") != HEAD or live_after.get("apiBase") != attestation["baseSha"]:
        raise ValueError("recorded live PR API pins are incorrect")
    if live_after.get("sourceHeadTree") != [HEAD, TREE] or live_after.get("sourceWorktreeClean") is not True:
        raise ValueError("recorded post-review source tree status is incorrect")
    if attestation.get("liveApiAfter") != live_after or not attestation.get("liveApiHeadAndBaseUnchanged"):
        raise ValueError("input attestation does not include matching live after snapshot")

    keys = {(row["position"], row["locale"]) for row in cells}
    if len(cells) != 240 or len(keys) != 240:
        raise ValueError("expected 240 unique cell dispositions")
    cell_counts = Counter(row["crossDisposition"] for row in cells)
    if cell_counts != Counter({"KEEP_CURRENT": 218, "SELECT_UPDATE": 10, "HOLD_HASH_ONLY": 12}):
        raise ValueError(f"unexpected cell disposition counts: {cell_counts}")
    if len(selected) != 10 or len(holds) != 12 or len(noops) != 218 or len(candidates) != 17:
        raise ValueError("selected/hold/noop/candidate record counts do not match summary")
    if Counter(row["kind"] for row in selected) != Counter({"CORRECTION": 8, "REFINEMENT": 2}):
        raise ValueError("selected correction/refinement counts differ")
    if Counter(row["crossDisposition"] for row in candidates) != Counter({"SELECTED": 9, "NOT_SELECTED_ALTERNATIVE": 8}):
        raise ValueError("proposal candidate reconciliation counts differ")

    current_map = {(row["position"], row["locale"]): row for row in load_jsonl(args.primary_input / "current-target-cells.jsonl")}
    source_map = {row["position"]: row for row in load_jsonl(args.primary_input / "selected-source-cells.jsonl")}
    for row in selected:
        key = (row["position"], row["locale"])
        current = current_map[key]
        source = source_map[key[0]]
        if row["currentTargetSha256"] != current["currentTargetSha256"]:
            raise ValueError(f"selected current preimage mismatch at {key}")
        if row["sourceIdSha256"] != source["sourceIdSha256"] or row["sourceTextSha256"] != source["sourceTextSha256"]:
            raise ValueError(f"selected source mismatch at {key}")
        if sha(row["target"].encode("utf-8")) != row["targetSha256"]:
            raise ValueError(f"selected target hash mismatch at {key}")
        if not all(check["matches"] for check in row["tokenChecks"].values()):
            raise ValueError(f"selected target token failure at {key}")

    for row in holds:
        if any(k in row for k in ("sourceId", "sourceText", "currentTarget", "crossTarget")):
            raise ValueError("hold record is not hash-only")
        if row["position"] != 3979:
            raise ValueError("unexpected hold position")
    for row in cells:
        if row["crossDisposition"] == "HOLD_HASH_ONLY" and any(k in row for k in ("sourceId", "sourceText", "currentTarget", "crossTarget")):
            raise ValueError("hold cell ledger exposes text instead of hashes only")

    for name in [
        "prior-selection-hash-reattestation.jsonl",
        "prior-applied-target-hash-reattestation.jsonl",
        "prior-hold-hash-reattestation.jsonl",
        "prior-evidence-hash-index.json",
        "prior-catalog-application-summary.json",
    ]:
        if file_sha(HERE / "prior-lineage" / name) != file_sha(args.primary_input / name):
            raise ValueError(f"prior lineage copy mismatch: {name}")

    if manifest["head"] != HEAD or manifest["tree"] != TREE or summary["head"] != HEAD:
        raise ValueError("manifest/summary exact pin mismatch")
    if manifest["inputAttestationSha256"] != file_sha(HERE / "input-attestation.json"):
        raise ValueError("input attestation hash mismatch in manifest")
    for relative, expected in manifest["fileHashes"].items():
        if file_sha(HERE / relative) != expected:
            raise ValueError(f"manifest file hash mismatch: {relative}")

    print(json.dumps({
        "result": "PASS",
        "head": head,
        "tree": tree,
        "sourceWorktreeClean": True,
        "cells": len(cells),
        "selected": len(selected),
        "holds": len(holds),
        "kept": len(noops),
        "proposalCandidates": len(candidates),
        "inputChecksumSets": 4,
        "outputChecksums": checksum_count,
        "liveBranchAndPullRef": "PASS",
    }, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"verification failed: {exc}", file=sys.stderr)
        raise
