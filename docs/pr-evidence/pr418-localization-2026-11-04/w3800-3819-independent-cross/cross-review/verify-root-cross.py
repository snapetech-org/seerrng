#!/usr/bin/env python3
"""Verify the SeerrNG W3800–W3819 root cross-review packet."""
import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKET = ROOT / "input" / "candidate-free-input"
BLIND = ROOT / "blind-review"
PRIMARY = ROOT / "primary-review"
CROSS = ROOT / "cross-review"
HEAD = "154dbf7fd6b346d9c5bddf23c7c6283db9826313"
TREE = "a2f00bcc40b51a5643bbeb3e52ecdfc58a5718b9"


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def run(args, cwd):
    result = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise ValueError("command failed: " + " ".join(args) + "\n" + result.stdout)
    return result.stdout


def token_ok(row, selected, reviewer):
    if reviewer == "blind":
        info = row["tokenIntegrity"]
        expected_field = "reviewedMatches" if row.get("proposedTarget") is not None else "currentMatches"
        return all(value[expected_field] for value in info.values())
    checks = row.get("proposedTokenChecks") if row.get("proposedTarget") is not None else row.get("tokenChecks")
    if checks is None:
        checks = row.get("tokenChecks")
    return all(item.get("matches") is True for item in checks.values())


def main():
    run([sys.executable, str(PACKET / "verify-candidate-free.py")], PACKET)
    run([sys.executable, str(PRIMARY / "verify-primary.py")], PRIMARY)
    run([sys.executable, str(BLIND / "review" / "verify-blind-ledger.py")], BLIND / "review")
    for directory in (PACKET, PRIMARY, BLIND / "review"):
        run(["sha256sum", "-c", "SHA256SUMS.txt"], directory)

    manifest = json.loads((PACKET / "manifest.json").read_text(encoding="utf-8"))
    if manifest["head"] != HEAD or manifest["tree"] != TREE:
        raise ValueError("candidate-free exact pins differ")
    current = read_jsonl(PACKET / "current-target-cells.jsonl")
    sources = read_jsonl(PACKET / "selected-source-cells.jsonl")
    primary = read_jsonl(PRIMARY / "primary-ledger.jsonl")
    blind = read_jsonl(BLIND / "review" / "blind-ledger.jsonl")
    cross = read_jsonl(CROSS / "root-cross-ledger.jsonl")
    key = lambda x: (x["position"], x["locale"])
    maps = [{key(x): x for x in rows} for rows in (current, primary, blind, cross)]
    if any(len(mapping) != 240 for mapping in maps):
        raise ValueError("one or more ledgers do not have 240 unique cells")
    if not all(set(maps[0]) == set(mapping) for mapping in maps[1:]):
        raise ValueError("the four ledgers do not cover the same exact cells")
    source_map = {x["position"]: x for x in sources}
    counts = Counter()
    source_counts = Counter()
    proposals = updates = accepted_without_proposal = noops = 0
    protected_mismatch_baseline = 0
    for cell in sorted(maps[0]):
        c, p, b, x = (mapping[cell] for mapping in maps)
        if p["head"] != HEAD or p["tree"] != TREE or x["selectedTargetSha256"] != hashlib.sha256(x["selectedTarget"].encode()).hexdigest():
            raise ValueError(f"head/tree/selection hash mismatch: {cell}")
        s = source_map[cell[0]]
        for row in (p, b, x):
            if row["sourceId"] != c["sourceId"] or row["sourceTextSha256"] != c["sourceTextSha256"]:
                raise ValueError(f"source identity mismatch: {cell}")
        if x["sourceText"] != s["sourceText"] or x["sourceId"] != s["sourceId"]:
            raise ValueError(f"cross source-text mismatch: {cell}")
        for row in (p, b):
            if row["currentTarget"] != c["currentTarget"] or row["currentTargetSha256"] != c["currentTargetSha256"]:
                raise ValueError(f"reviewer current-target mismatch: {cell}")

        pp, bp = p.get("proposedTarget"), b.get("proposedTarget")
        proposals += bool(pp or bp)
        if pp and bp and pp == bp:
            chosen, source = pp, "independent-agreement"
        elif pp:
            chosen, source = pp, "primary"
        elif bp:
            chosen, source = bp, "independent-blind"
        else:
            chosen, source = c["currentTarget"], "current"
        if x["selectedTarget"] != chosen or x["selectedFrom"] != source:
            raise ValueError(f"selected text or source does not follow review cross-rule: {cell}")
        if x["selectedDisposition"] not in ("accept-current", "correction", "refinement"):
            raise ValueError(f"unsupported selection disposition: {cell}")
        if x["action"] == "update":
            if chosen == c["currentTarget"] or not pp and not bp:
                raise ValueError(f"invalid update row: {cell}")
            updates += 1
            reviewer, source_row = ("primary", p) if source in ("primary", "independent-agreement") else ("blind", b)
            if not token_ok(source_row, chosen, reviewer):
                raise ValueError(f"selected reviewer proposal fails token integrity: {cell}")
            if source_row.get("proposedTarget") != chosen:
                raise ValueError(f"selected value is not the cited review proposal: {cell}")
        elif x["action"] == "no-op":
            if chosen != c["currentTarget"] or x["selectedDisposition"] != "accept-current":
                raise ValueError(f"invalid no-op: {cell}")
            if pp or bp:
                noops += 1
            else:
                accepted_without_proposal += 1
            reviewer = "blind"
            if not token_ok(b, chosen, reviewer):
                raise ValueError(f"accepted current value fails token integrity: {cell}")
        else:
            raise ValueError(f"unsupported action: {cell}")
        counts[x["selectedDisposition"]] += 1
        source_counts[x["selectedFrom"]] += 1
        if not c["tokenChecks"]["protectedLiterals"]["matches"]:
            protected_mismatch_baseline += 1
        if not token_ok(b if source == "current" else (p if source in ("primary", "independent-agreement") else b), chosen, "blind" if source == "current" or source == "independent-blind" else "primary"):
            raise ValueError(f"selected value has token mismatch: {cell}")

    if (proposals, updates, accepted_without_proposal, noops) != (36, 35, 204, 1):
        raise ValueError(f"unexpected outcome totals: proposals={proposals}, updates={updates}, accepted={accepted_without_proposal}, noops={noops}")
    if protected_mismatch_baseline != 4:
        raise ValueError(f"unexpected protected-literal mismatch count: {protected_mismatch_baseline}")
    for pos, locale, literal in ((3804, "hi", "ID"), (3804, "fr", "ID"), (3804, "ar", "ID"), (3817, "hi", "IP")):
        row = maps[3][(pos, locale)]
        if literal not in row["selectedTarget"]:
            raise ValueError(f"required protected literal absent: {(pos, locale, literal)}")

    summary = json.loads((CROSS / "summary.json").read_text(encoding="utf-8"))
    if summary["head"] != HEAD or summary["tree"] != TREE or summary["cells"] != 240 or summary["selectedUpdates"] != 35:
        raise ValueError("summary pins or counts differ")
    print(json.dumps({
        "result": "PASS",
        "head": HEAD,
        "tree": TREE,
        "cells": len(cross),
        "proposalUnion": proposals,
        "selectedUpdates": updates,
        "acceptedCurrentWithoutProposal": accepted_without_proposal,
        "acceptedProposalNoOps": noops,
        "dispositions": dict(sorted(counts.items())),
        "selectedFrom": dict(sorted(source_counts.items())),
        "baselineProtectedLiteralMismatches": protected_mismatch_baseline,
        "selectedProtectedLiteralMismatches": 0,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
