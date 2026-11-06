#!/usr/bin/env python3
"""Verify the blind review against its colocated input packet using only stdlib."""
import hashlib
import json
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read_sha_list(path):
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        digest, name = line.split(None, 1)
        result[name.strip()] = digest
    return result

input_hashes = read_sha_list(BASE / "SHA256SUMS.txt")
for name, digest in input_hashes.items():
    assert sha256(BASE / name) == digest, f"input checksum mismatch: {name}"

review_hashes = read_sha_list(BASE / "blind-review-SHA256SUMS.txt")
for name, digest in review_hashes.items():
    assert sha256(BASE / name) == digest, f"review checksum mismatch: {name}"

input_bytes = (BASE / "review-input.json").read_bytes()
source = json.loads(input_bytes)
review = json.loads((BASE / "blind-review.json").read_text(encoding="utf-8"))
binding = review["binding"]
assert binding["reviewInputSha256"] == hashlib.sha256(input_bytes).hexdigest()
assert binding["inputChecksumListSha256"] == sha256(BASE / "SHA256SUMS.txt")
assert binding["inputFileSha256"] == input_hashes
for key in ("repository", "pullRequest", "head", "tree"):
    assert binding[key] == source["binding"][key], f"PR/input binding mismatch: {key}"

source_cells = {(c["position"], c["locale"]): c for c in source["cells"]}
review_cells = review["cells"]
assert len(source_cells) == 49 and len(review_cells) == 49
assert len({(c["position"], c["locale"]) for c in review_cells}) == 49
valid = {"accept", "correction", "refinement", "hold"}
for row in review_cells:
    key = (row["position"], row["locale"])
    assert key in source_cells, f"unexpected review cell: {key}"
    cell = source_cells[key]
    assert row["sourceId"] == cell["source"]["sourceId"]
    assert row["binding"]["sourceTextSha256"] == cell["source"]["sourceTextSha256"]
    assert row["binding"]["currentTargetSha256"] == cell["currentTarget"]["currentTargetSha256"]
    assert row["binding"]["callerContextSha256"] == cell["callerContext"]["callerContextSha256"]
    assert row["binding"]["contextBlockIds"] == cell["callerContext"]["contextBlockIds"]
    assert not cell["missingContextBlockIds"]
    assert row["disposition"] in valid
    has_proposal = "proposedText" in row
    assert has_proposal == (row["disposition"] in {"correction", "refinement"})
    assert row["confidence"] in {"high", "moderate", "low"}

from collections import Counter
by_decision = Counter(row["disposition"] for row in review_cells)
by_confidence = Counter(row["confidence"] for row in review_cells)
by_locale = Counter(row["locale"] for row in review_cells)
coverage = review["coverage"]
assert coverage["cells"] == len(review_cells)
assert coverage["decisionCounts"] == {k: by_decision.get(k, 0) for k in ("accept", "correction", "refinement", "hold")}
assert coverage["confidenceCounts"] == {k: by_confidence.get(k, 0) for k in ("high", "moderate", "low")}
assert coverage["locales"] == dict(sorted(by_locale.items()))
assert coverage["cellsWithSuppliedCallerContext"] == len(review_cells)
print(json.dumps({
    "result": "PASS",
    "cells": len(review_cells),
    "decisions": dict(by_decision),
    "confidence": dict(by_confidence),
    "head": binding["head"],
    "tree": binding["tree"],
    "reviewInputSha256": binding["reviewInputSha256"],
}, indent=2))
