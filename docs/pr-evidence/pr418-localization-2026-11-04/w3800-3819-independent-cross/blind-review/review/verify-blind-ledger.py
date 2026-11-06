#!/usr/bin/env python3
"""Verify the independent W3800-W3819 blind review package.

The verifier reads only the candidate-free packet's source cells, current target
cells, caller-context index, and checksum list. Other packet files are hashed to
verify the sealed inventory; their contents are never opened or interpreted.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKET = ROOT / "input" / "candidate-free-input"
REVIEW = ROOT / "review"
HEAD = "154dbf7fd6b346d9c5bddf23c7c6283db9826313"
TREE = "a2f00bcc40b51a5643bbeb3e52ecdfc58a5718b9"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]
POSITIONS = list(range(3800, 3820))
EXPECTED_REVIEW_FILES = {"blind-ledger.jsonl", "summary.md", "verify-blind-ledger.py", "SHA256SUMS.txt"}
EXPECTED_SUMMED_FILES = {"blind-ledger.jsonl", "summary.md", "verify-blind-ledger.py"}

TOKEN_PATTERNS = {
    "placeholders": re.compile(r"\{[^{}]+\}"),
    "markupTags": re.compile(r"<[^>]+>"),
    "numericTokens": re.compile(r"(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?![A-Za-z0-9])"),
}


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_manifest(directory: Path, manifest_name: str, expected_names: set[str] | None = None) -> int:
    manifest = directory / manifest_name
    lines = manifest.read_text(encoding="utf-8").splitlines()
    seen: set[str] = set()
    for line in lines:
        digest, name = line.split("  ", 1)
        if Path(name).name != name or name in seen:
            raise ValueError(f"unsafe or duplicate checksum entry: {name}")
        seen.add(name)
        actual = sha256((directory / name).read_bytes())
        if actual != digest:
            raise ValueError(f"checksum mismatch: {name}")
    if expected_names is not None and seen != expected_names:
        raise ValueError(f"checksum file inventory differs: {sorted(seen)}")
    return len(seen)


def exact_present(text: str, token: str) -> bool:
    return re.search(r"(?<![A-Za-z0-9])" + re.escape(token) + r"(?![A-Za-z0-9])", text) is not None


def actual_tokens(text: str, kind: str, required: list[str]) -> list[str]:
    if kind == "protectedLiterals":
        return [token for token in required if exact_present(text, token)]
    return TOKEN_PATTERNS[kind].findall(text)


def expected_integrity(source: dict, current: str, reviewed: str) -> dict:
    requirements = {
        "placeholders": source["sourceTokens"]["placeholders"],
        "markupTags": source["sourceTokens"]["markupTags"],
        "numericTokens": source["sourceTokens"]["numericTokens"],
        "protectedLiterals": source["sourceTokens"]["protectedLiterals"],
    }
    output = {}
    for kind, required in requirements.items():
        current_found = actual_tokens(current, kind, required)
        reviewed_found = actual_tokens(reviewed, kind, required)
        output[kind] = {
            "required": required,
            "current": current_found,
            "currentMatches": current_found == required,
            "reviewed": reviewed_found,
            "reviewedMatches": reviewed_found == required,
        }
    return output


def main() -> int:
    packet_file_count = check_manifest(PACKET, "SHA256SUMS.txt")
    check_manifest(REVIEW, "SHA256SUMS.txt", EXPECTED_SUMMED_FILES)
    actual_review_files = {p.name for p in REVIEW.iterdir() if p.is_file()}
    if actual_review_files != EXPECTED_REVIEW_FILES:
        raise ValueError(f"unexpected review outputs: {sorted(actual_review_files)}")

    sources = read_jsonl(PACKET / "selected-source-cells.jsonl")
    targets = read_jsonl(PACKET / "current-target-cells.jsonl")
    callers = read_jsonl(PACKET / "caller-contexts.jsonl")
    ledger = read_jsonl(REVIEW / "blind-ledger.jsonl")
    if [row["position"] for row in sources] != POSITIONS:
        raise ValueError("source positions do not match W3800-W3819")
    if len(sources) != 20 or len(targets) != 240 or len(callers) != 20 or len(ledger) != 240:
        raise ValueError("unexpected source, target, caller, or ledger row count")

    source_by_pos = {row["position"]: row for row in sources}
    target_by_key = {(row["position"], row["locale"]): row for row in targets}
    caller_by_key = {(row["position"], row["sourceId"]): row for row in callers}
    if len(target_by_key) != 240 or {locale for _, locale in target_by_key} != set(LOCALES):
        raise ValueError("target cells do not cover the expected 12 locales")

    dispositions: dict[str, int] = {}
    confidence_values = {"high", "moderate", "low", "unknown"}
    current_mismatches = {k: 0 for k in ("placeholders", "markupTags", "numericTokens", "protectedLiterals")}
    reviewed_mismatches = {k: 0 for k in current_mismatches}
    seen: set[tuple[int, str]] = set()
    for row in ledger:
        key = (row["position"], row["locale"])
        if key in seen or key not in target_by_key:
            raise ValueError(f"duplicate or unexpected ledger cell: {key}")
        seen.add(key)
        source = source_by_pos[row["position"]]
        target = target_by_key[key]
        caller = caller_by_key[(row["position"], row["sourceId"])]
        if row["sourceId"] != source["sourceId"] or row["sourceText"] != source["sourceText"]:
            raise ValueError(f"source identity mismatch: {key}")
        if row["sourceTextSha256"] != source["sourceTextSha256"] or sha256(row["sourceText"].encode()) != row["sourceTextSha256"]:
            raise ValueError(f"source text hash mismatch: {key}")
        if row["currentTarget"] != target["currentTarget"] or row["currentTargetSha256"] != target["currentTargetSha256"]:
            raise ValueError(f"current target mismatch: {key}")
        if sha256(row["currentTarget"].encode()) != row["currentTargetSha256"]:
            raise ValueError(f"current target hash mismatch: {key}")
        if row["catalogPath"] != target["catalogPath"] or row["catalogSha256"] != target["catalogSha256"] or row["catalogGitBlob"] != target["catalogGitBlob"]:
            raise ValueError(f"catalog pin mismatch: {key}")
        if row["callerContextSha256"] != target["callerContextSha256"] or row["callerContextSha256"] != caller["callerContextSha256"]:
            raise ValueError(f"caller context pin mismatch: {key}")
        if row["confidence"] not in confidence_values or not row["rationale"].strip():
            raise ValueError(f"missing rationale or invalid confidence: {key}")

        disposition = row["disposition"]
        dispositions[disposition] = dispositions.get(disposition, 0) + 1
        if disposition == "accept-current":
            if row["proposedTarget"] is not None or row["reviewedTarget"] != row["currentTarget"]:
                raise ValueError(f"accepted value was not preserved: {key}")
        elif disposition in {"propose-correction", "propose-refinement"}:
            if not row["proposedTarget"] or row["reviewedTarget"] != row["proposedTarget"]:
                raise ValueError(f"proposal value missing or inconsistent: {key}")
        else:
            raise ValueError(f"unknown disposition: {disposition}")

        integrity = expected_integrity(source, row["currentTarget"], row["reviewedTarget"])
        if row["tokenIntegrity"] != integrity:
            raise ValueError(f"token integrity record mismatch: {key}")
        for kind, item in integrity.items():
            current_mismatches[kind] += not item["currentMatches"]
            reviewed_mismatches[kind] += not item["reviewedMatches"]
        source_classes = {
            "placeholders": "placeholders",
            "markupTags": "markupTags",
            "numericTokens": "numericTokens",
            "protectedLiterals": "protectedLiterals",
        }
        for kind, input_kind in source_classes.items():
            if target["tokenChecks"][input_kind]["matches"] != integrity[kind]["currentMatches"]:
                raise ValueError(f"packet token diagnostic mismatch: {key} {kind}")

    if len(seen) != 240:
        raise ValueError("ledger is missing target cells")
    if dispositions != {"accept-current": 213, "propose-correction": 5, "propose-refinement": 22}:
        raise ValueError(f"unexpected disposition totals: {dispositions}")
    if current_mismatches != {"placeholders": 0, "markupTags": 0, "numericTokens": 0, "protectedLiterals": 4}:
        raise ValueError(f"unexpected current token mismatches: {current_mismatches}")
    if any(reviewed_mismatches.values()):
        raise ValueError(f"reviewed values have token mismatches: {reviewed_mismatches}")

    summary = (REVIEW / "summary.md").read_text(encoding="utf-8")
    if HEAD not in summary or TREE not in summary or "After review (" not in summary or "0 deployments" not in summary:
        raise ValueError("summary does not include exact pins and post-review state")

    print(json.dumps({
        "result": "PASS",
        "packetFilesChecksumVerified": packet_file_count,
        "reviewFilesChecksumVerified": len(EXPECTED_SUMMED_FILES),
        "sourceIds": len(sources),
        "cells": len(ledger),
        "dispositions": dispositions,
        "currentTokenMismatches": current_mismatches,
        "reviewedTokenMismatches": reviewed_mismatches,
        "head": HEAD,
        "tree": TREE,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
