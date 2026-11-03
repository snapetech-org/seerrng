#!/usr/bin/env python3
"""Reconcile SeerrNG W3340-W3359 primary and blind reviews at the pinned head."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path


PRIMARY = Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-w3340-3359-primary-20261103")
BLIND = Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-w3340-3359-independent-blind-20261103")
OUT = Path(__file__).resolve().parent
REPO = Path("/mnt/disks/scratch/task-worktrees/localization-20261103/seerrng-pr418-w3220-apply-20261103")
EXPECTED_HEAD = "266d8fff4beb56eab17c9de0f6560c619577e3de"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def verify_manifest(root: Path, manifest: str = "SHA256SUMS.txt") -> None:
    for line in (root / manifest).read_text(encoding="utf-8").splitlines():
        expected, rel = line.split("  ", 1)
        assert sha((root / rel).read_bytes()) == expected, f"checksum mismatch: {root / rel}"


def catalog_value(catalog: dict, message_id: str) -> str:
    return catalog[message_id]


def main() -> None:
    primary_summary = json.loads((PRIMARY / "primary-review/summary.json").read_text(encoding="utf-8"))
    blind_summary = json.loads((BLIND / "summary.json").read_text(encoding="utf-8"))
    input_dir = PRIMARY / "clean-input"
    window = json.loads((input_dir / "window.json").read_text(encoding="utf-8"))
    assert window["head"] == EXPECTED_HEAD
    assert primary_summary["exactHead"] == EXPECTED_HEAD
    assert blind_summary["head"] == EXPECTED_HEAD
    assert subprocess.check_output(["git", "-C", str(REPO), "rev-parse", "HEAD"], text=True).strip() == EXPECTED_HEAD
    live_branch = window["livePr"]["headRef"]
    assert subprocess.check_output(["git", "-C", str(REPO), "ls-remote", "origin", f"refs/heads/{live_branch}"], text=True).split()[0] == EXPECTED_HEAD

    verify_manifest(PRIMARY)
    verify_manifest(input_dir)
    verify_manifest(PRIMARY / "primary-review")
    verify_manifest(BLIND)

    inputs = read_rows(input_dir / "review-input.jsonl")
    primary_rows = read_rows(PRIMARY / "primary-review/primary-review.jsonl")
    blind_rows = read_rows(BLIND / "blind-review.jsonl")
    contexts = read_rows(input_dir / "caller-contexts.jsonl")
    assert len(inputs) == len(primary_rows) == len(blind_rows) == 240
    key = lambda row: (row["id"], row["locale"])
    input_map = {key(row): row for row in inputs}
    primary_map = {key(row): row for row in primary_rows}
    blind_map = {key(row): row for row in blind_rows}
    assert len(input_map) == len(primary_map) == len(blind_map) == 240
    assert set(input_map) == set(primary_map) == set(blind_map)

    contexts_by_id: dict[str, set[str]] = {}
    for context in contexts:
        assert sha(context["context"].encode("utf-8")) == context["contextSha256"]
        contexts_by_id.setdefault(context["id"], set()).add(context["contextSha256"])

    catalog_cache: dict[str, dict] = {}
    for path, pin in window["localeCatalogPins"].items():
        raw = subprocess.check_output(["git", "-C", str(REPO), "show", f"HEAD:{path}"])
        assert sha(raw) == pin["sha256"]
        assert subprocess.check_output(["git", "-C", str(REPO), "rev-parse", f"HEAD:{path}"], text=True).strip() == pin["gitBlob"]
        data = json.loads(raw)
        assert len(data) == pin["keyCount"] == 9494
        catalog_cache[path] = data
    for path, pin in window["callerFiles"].items():
        raw = subprocess.check_output(["git", "-C", str(REPO), "show", f"HEAD:{path}"])
        assert sha(raw) == pin["sha256"]
        assert subprocess.check_output(["git", "-C", str(REPO), "rev-parse", f"HEAD:{path}"], text=True).strip() == pin["gitBlob"]

    ratified_rows = []
    apply_items = []
    for cell_key, item in sorted(input_map.items(), key=lambda pair: (pair[1]["position"], pair[1]["locale"])):
        p = primary_map[cell_key]
        b = blind_map[cell_key]
        assert item["source"] == p["source"] == b["source"]
        assert item["sourceSha256"] == p["sourceSha256"] == b["sourceSha256"]
        assert sha(item["source"].encode("utf-8")) == item["sourceSha256"]
        assert item["currentTarget"] == p["currentTarget"] == b["currentTarget"]
        assert item["currentTargetSha256"] == p["currentTargetSha256"] == b["currentTargetSha256"]
        assert sha(item["currentTarget"].encode("utf-8")) == item["currentTargetSha256"]
        assert item["callerContextHashes"] == p["callerContextHashes"] == b["callerContextHashes"]
        assert set(item["callerContextHashes"]) == contexts_by_id.get(item["id"], set())
        assert p["targetSha256"] == sha(p["target"].encode("utf-8"))
        assert b["blindTargetSha256"] == sha(b["blindTarget"].encode("utf-8"))
        assert p["placeholderParity"] is True and p["markupParity"] is True
        assert p["numericTokensPreserved"] is True and b["numericMeaningReviewed"] is True
        assert b["placeholderParity"] is True
        assert p["qualifiedNativeSpeakerApproval"] is False and b["nativeSpeakerApproval"] is False

        path = item["catalogPath"]
        assert catalog_cache[path][item["id"]] == item["currentTarget"]
        root_target = item["currentTarget"]
        root_disposition = "ACCEPT_CURRENT"
        root_rationale = "Both reviews accept the exact current value in this pinned production context; retain the no-op."

        if item["id"] == "components.Requests.manageRequests":
            assert p["verdict"] == "hold-context" and b["disposition"] == "hold-no-direct-caller"
            root_disposition = "HOLD_NO_DIRECT_CALLER"
            root_rationale = "Both reviews found no direct production caller for this message ID; the 12 locale values remain unapproved and unchanged."
        elif b["disposition"] == "refinement" and b["blindTarget"] != item["currentTarget"]:
            root_target = b["blindTarget"]
            root_disposition = "APPLY_BLIND_REFINEMENT"
            root_rationale = b["rationale"]
            if item["id"] == "components.Requests.incomplete" and item["locale"] == "ko":
                root_rationale = "Use the blind candidate because 미완료 clearly marks an unfinished request status; 불완전 can imply an imperfect item."
            elif item["id"].startswith("components.Requests.last") and item["locale"] == "ko":
                root_rationale = "Use the compact recent-period filter label 최근 with the source duration; it fits the pinned date-range selector and avoids the awkward current wording."
            elif item["id"].startswith("components.Requests.last") and item["locale"] == "hi":
                root_rationale = "Use the direct period phrase as a standalone filter option; the current oblique plural expects a following postposition in ordinary prose."
            elif item["id"] == "components.Requests.library":
                root_rationale = "The pinned caller displays an in-progress request status; this candidate explicitly expresses the ongoing add-to-library action."
            elif item["id"] == "components.Requests.loadingTitle":
                root_rationale = "Use sentence-style capitalization for the common noun and retain the source ellipsis as the loading indicator."
        elif item["id"] == "components.Requests.last6Months" and item["locale"] == "ar" and p["verdict"] == "correction":
            root_target = p["target"]
            root_disposition = "APPLY_PRIMARY_CORRECTION"
            root_rationale = "Retain the explicit numeric token 6 from the source in this date-range label; the candidate preserves the six-month duration and uses the catalog’s digit style."

        assert sha(root_target.encode("utf-8")) == (
            b["blindTargetSha256"] if root_target == b["blindTarget"] else p["targetSha256"] if root_target == p["target"] else sha(root_target.encode("utf-8"))
        )
        source_digits = re.findall(r"\d+", item["source"])
        target_digits = re.findall(r"\d+", root_target)
        assert source_digits == target_digits, (cell_key, source_digits, target_digits)
        if item["sourcePlaceholders"]:
            assert set(item["sourcePlaceholders"]) == set(re.findall(r"\{[^{}]+\}", root_target))
        for literal in item["sourceProtectedLiterals"]:
            assert literal in root_target

        target_hash = sha(root_target.encode("utf-8"))
        record = {
            "position": item["position"], "id": item["id"], "locale": item["locale"],
            "catalogPath": path, "source": item["source"], "sourceSha256": item["sourceSha256"],
            "currentTarget": item["currentTarget"], "currentTargetSha256": item["currentTargetSha256"],
            "primaryVerdict": p["verdict"], "primaryTarget": p["target"], "primaryTargetSha256": p["targetSha256"],
            "blindDisposition": b["disposition"], "blindTarget": b["blindTarget"], "blindTargetSha256": b["blindTargetSha256"],
            "callerContextHashes": item["callerContextHashes"], "rootDisposition": root_disposition,
            "rootTarget": root_target, "rootTargetSha256": target_hash, "rootRationale": root_rationale,
        }
        ratified_rows.append(record)
        if root_target != item["currentTarget"]:
            apply_items.append({
                "position": item["position"], "id": item["id"], "locale": item["locale"], "catalogPath": path,
                "currentTarget": item["currentTarget"], "currentTargetSha256": item["currentTargetSha256"],
                "target": root_target, "targetSha256": target_hash, "rootDisposition": root_disposition,
            })

    counts = Counter(row["rootDisposition"] for row in ratified_rows)
    assert counts == Counter({"ACCEPT_CURRENT": 208, "APPLY_BLIND_REFINEMENT": 19, "APPLY_PRIMARY_CORRECTION": 1, "HOLD_NO_DIRECT_CALLER": 12})
    assert len(apply_items) == 20
    root_ledger_path = OUT / "ratified-ledger.jsonl"
    root_ledger_path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in ratified_rows), encoding="utf-8")
    apply_plan = {
        "title": "Exact-hash apply plan: SeerrNG PR #418 W3340-W3359",
        "repository": "snapetech-org/seerrng", "pullRequest": 418,
        "head": EXPECTED_HEAD, "tree": window["tree"], "window": "W3340-W3359",
        "approvedChangeCount": len(apply_items), "items": apply_items,
    }
    (OUT / "apply-plan.json").write_text(json.dumps(apply_plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "repository": "snapetech-org/seerrng", "pullRequest": 418,
        "head": EXPECTED_HEAD, "tree": window["tree"], "window": "W3340-W3359",
        "cellCount": len(ratified_rows), "sourceCount": 20, "localeCount": 12,
        "rootDispositionCounts": dict(counts), "approvedChangeCount": len(apply_items),
        "changedCatalogCount": len({item["catalogPath"] for item in apply_items}),
        "noDirectCallerHoldCells": 12, "placeholderMarkupNumericProtectedMismatches": 0,
        "orderedCatalogKeySequencesMatch": False,
        "catalogKeyCount": 9494, "catalogCountIncludingEnglish": 13,
        "nativeSpeakerApproval": False, "headedBrowserAcceptance": False,
        "primaryOnlyApprovedCorrection": {"id": "components.Requests.last6Months", "locale": "ar", "target": "آخر 6 أشهر"},
        "unresolvedDisagreements": [],
        "repositoryOrPullRequestMutated": False,
        "testsBuildsScansCI": False,
    }
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md = f"""# Root ratification: SeerrNG PR #418 W3340–W3359

## Provenance

- Exact baseline head/tree: `{EXPECTED_HEAD}` / `{window['tree']}`.
- Reconciled 240 unique cells from the exact-head primary packet, candidate-free input, and independent blind ledger. Source/current hashes, caller-context hashes, all 55 context rows, 13 catalog pins, and all six caller file pins match the live head.
- Catalog key sets have 9,494 keys; locale catalogs retain the two pre-existing ordered-key hash groups.

## Root decisions

- 208 cells: accept current.
- 19 cells: apply the independently proposed refinements.
- 1 cell: apply the primary Arabic `Last 6 months` correction, retaining the literal digit `6`.
- 12 cells: hold `components.Requests.manageRequests` because no direct production caller is pinned.
- Total applied values: 20 across {summary['changedCatalogCount']} catalogs. All reviewed source-number sequences, placeholders, and protected literals are preserved.

For Korean time-range filters, root selected the blind wording `최근 {{n}}` consistently across 7, 14, and 30 days and 6 months. For the Korean `Incomplete` status, root selected `미완료` because it describes an unfinished request more directly than the existing “imperfect” reading. The blind `Loading Title…` refinements use sentence-style capitalization and preserve the ellipsis.

This is machine-assisted review, not qualified native-speaker approval. Headed product-browser acceptance is not established. No tests, builds, scans, CI dispatches, workflow changes, merge, release, or tag actions were performed.
"""
    (OUT / "summary.md").write_text(md, encoding="utf-8")
    print(f"Ratified {len(ratified_rows)} cells: {counts}; approved changes={len(apply_items)} across {summary['changedCatalogCount']} catalogs.")


if __name__ == "__main__":
    main()
