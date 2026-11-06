#!/usr/bin/env python3
"""Apply SeerrNG W1900–1999 cross-reviewed targets with exact-hash guards."""
from __future__ import annotations

import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parents[0]
CROSS = EVIDENCE.parent / "crossreview"
PINNED_HEAD = "aab1928ff83728d30a864b1ff24c5c812c7ca040"
PINNED_TREE = "00901677a18e5ebf8d92a1f195668289f8a6f928"
SOURCE_FILE = "src/i18n/locale/en.json"


def sha(value: str | bytes) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main() -> None:
    head = git("rev-parse", "HEAD")
    tree = git("rev-parse", "HEAD^{tree}")
    if (head, tree) != (PINNED_HEAD, PINNED_TREE):
        raise SystemExit(f"pinned head mismatch: {head} {tree}")

    ledger = read_jsonl(CROSS / "cross-review-ledger.jsonl")
    proposals = read_jsonl(CROSS / "exact-hash-proposals.jsonl")
    adjudications = read_jsonl(EVIDENCE / "root-adjudication.jsonl")
    adjudication_map = {(row["sourceId"], row["locale"]): row for row in adjudications}
    if len(ledger) != 1200 or len(proposals) != 280:
        raise SystemExit(f"unexpected packet size: {len(ledger)} cells, {len(proposals)} proposals")
    if len(adjudications) != 9 or len(adjudication_map) != 9:
        raise SystemExit("expected nine unique root adjudications of cross-review findings")

    source_catalog = json.loads((ROOT / SOURCE_FILE).read_text(encoding="utf-8"))
    file_blobs: dict[str, str] = {}
    cell_map: dict[tuple[str, str], dict] = {}
    for row in ledger:
        if row["head"] != PINNED_HEAD or row["tree"] != PINNED_TREE:
            raise SystemExit(f"row pin mismatch: {row['sourceId']} {row['locale']}")
        if row["pullRequest"] != 418 or row["repository"] != "snapetech-org/SeerrNG":
            raise SystemExit("repository or PR mismatch")
        if row["sourceFile"] != SOURCE_FILE:
            raise SystemExit(f"unexpected source catalog path: {row['sourceFile']}")

        for path, blob_field in ((SOURCE_FILE, "sourceCatalogBlob"), (row["localeFile"], "localeCatalogBlob")):
            expected_blob = row[blob_field]
            current_blob = git("rev-parse", f"HEAD:{path}")
            previous = file_blobs.setdefault(path, expected_blob)
            if previous != expected_blob or current_blob != expected_blob:
                raise SystemExit(f"catalog blob mismatch: {path}")

        key = row["sourceId"]
        if (key not in source_catalog or source_catalog[key] != row["source"]
                or sha(source_catalog[key]) != row["sourceTextSha256"]):
            raise SystemExit(f"source mismatch: {key}")
        target_catalog = json.loads((ROOT / row["localeFile"]).read_text(encoding="utf-8"))
        current = target_catalog.get(key)
        if current != row["currentTarget"] or sha(current) != row["currentTargetSha256"]:
            raise SystemExit(f"target mismatch: {row['locale']} {key}")
        validation = row["validation"]
        if validation.get("errors"):
            raise SystemExit(f"final structural validation failure: {row['locale']} {key}")
        if any(validation.get(name) != "exact" for name in ("markupParity", "placeholderParity", "protectedLiteralParity")):
            raise SystemExit(f"structural parity mismatch: {row['locale']} {key}")
        if row["sourcePlaceholders"] != row["finalPlaceholders"]:
            raise SystemExit(f"placeholder evidence mismatch: {row['locale']} {key}")
        if row["sourceMarkup"] != row["finalMarkup"]:
            raise SystemExit(f"markup evidence mismatch: {row['locale']} {key}")
        source_selectors = row["sourceIcuSelectors"]
        final_selectors = row["finalIcuSelectors"]
        source_selector_ids = sorted((item["argument"], item["type"]) for item in source_selectors)
        final_selector_ids = sorted((item["argument"], item["type"]) for item in final_selectors)
        if source_selector_ids != final_selector_ids or any(not item.get("categories") for item in final_selectors):
            raise SystemExit(f"ICU selector argument/type mismatch: {row['locale']} {key}")
        cell_map[(key, row["locale"])] = row

    updates: dict[str, dict[str, str]] = defaultdict(dict)
    plan: list[dict] = []
    for proposal in proposals:
        if proposal["head"] != PINNED_HEAD or proposal["tree"] != PINNED_TREE:
            raise SystemExit(f"proposal pin mismatch: {proposal['sourceId']} {proposal['locale']}")
        if proposal["repository"] != "snapetech-org/SeerrNG" or proposal["pullRequest"] != 418:
            raise SystemExit("proposal repository or PR mismatch")
        key = proposal["sourceId"]
        locale = proposal["locale"]
        row = cell_map.get((key, locale))
        if not row:
            raise SystemExit(f"proposal has no reviewed cell: {locale} {key}")
        if row["independentOutcome"] not in ("accept-correction", "accept-refinement", "propose-correction", "propose-refinement"):
            raise SystemExit(f"proposal has no final review disposition: {locale} {key}")
        if row["proposalKind"] != proposal["kind"] or row["callerClaim"] != proposal["callerClaim"]:
            raise SystemExit(f"proposal metadata mismatch: {locale} {key}")
        if proposal["origin"] == "primary-candidate-accepted":
            if row["independentOutcome"] not in ("accept-correction", "accept-refinement"):
                raise SystemExit(f"primary proposal lacks cross-review acceptance: {locale} {key}")
            if row["finalTarget"] != proposal["proposedTarget"] or row["finalTargetSha256"] != proposal["proposedTargetSha256"]:
                raise SystemExit(f"accepted primary target mismatch: {locale} {key}")
            final_target = proposal["proposedTarget"]
            root_disposition = "accept-cross-reviewed-primary"
            root_reason = None
        elif proposal["origin"] == "cross-review":
            adjudication = adjudication_map.pop((key, locale), None)
            if not adjudication:
                raise SystemExit(f"missing root adjudication: {locale} {key}")
            if row["independentOutcome"] not in ("propose-correction", "propose-refinement"):
                raise SystemExit(f"new cross-review finding outcome mismatch: {locale} {key}")
            if adjudication["crossReviewTarget"] != proposal["proposedTarget"] or adjudication["crossReviewTargetSha256"] != proposal["proposedTargetSha256"]:
                raise SystemExit(f"root adjudication proposal mismatch: {locale} {key}")
            if adjudication["currentTargetSha256"] != proposal["currentTargetSha256"]:
                raise SystemExit(f"root adjudication current hash mismatch: {locale} {key}")
            final_target = adjudication["finalTarget"]
            if sha(final_target) != adjudication["finalTargetSha256"]:
                raise SystemExit(f"root adjudication target hash mismatch: {locale} {key}")
            root_disposition = adjudication["rootDisposition"]
            root_reason = adjudication["reason"]
        else:
            raise SystemExit(f"unknown proposal origin: {proposal['origin']}")
        target_file = proposal["localeFile"]
        if target_file != row["localeFile"]:
            raise SystemExit(f"target path mismatch: {locale} {key}")
        if key in updates[target_file]:
            raise SystemExit(f"duplicate proposal: {target_file} {key}")
        if sha(proposal["currentTarget"]) != proposal["currentTargetSha256"]:
            raise SystemExit(f"old target hash mismatch: {locale} {key}")
        if sha(proposal["proposedTarget"]) != proposal["proposedTargetSha256"]:
            raise SystemExit(f"new target hash mismatch: {locale} {key}")
        updates[target_file][key] = final_target
        plan.append({
            "sourcePosition": proposal["sourcePosition"],
            "sourceId": key,
            "locale": locale,
            "localeFile": target_file,
            "expectedCurrent": proposal["currentTarget"],
            "expectedCurrentSha256": proposal["currentTargetSha256"],
            "crossReviewTarget": proposal["proposedTarget"],
            "crossReviewTargetSha256": proposal["proposedTargetSha256"],
            "target": final_target,
            "targetSha256": sha(final_target),
            "kind": proposal["kind"],
            "origin": proposal["origin"],
            "rootDisposition": root_disposition,
            "rootReason": root_reason,
            "callerClaim": proposal["callerClaim"],
            "callerUseStatus": proposal["callerUseStatus"],
            "callerContextRef": proposal["callerContextRef"],
            "callerContextSha256": proposal["callerContextSha256"],
            "reason": proposal["reason"],
        })

    if len(plan) != 280:
        raise SystemExit(f"expected 280 unique changes, found {len(plan)}")
    if adjudication_map:
        raise SystemExit(f"unused root adjudications: {sorted(adjudication_map)}")

    for locale_file, changes in updates.items():
        path = ROOT / locale_file
        catalog = json.loads(path.read_text(encoding="utf-8"))
        for key, target in changes.items():
            if catalog.get(key) != next(p["expectedCurrent"] for p in plan if p["localeFile"] == locale_file and p["sourceId"] == key):
                raise SystemExit(f"pre-write target changed: {locale_file} {key}")
            catalog[key] = target
        path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for item in plan:
        catalog = json.loads((ROOT / item["localeFile"]).read_text(encoding="utf-8"))
        actual = catalog[item["sourceId"]]
        if actual != item["target"] or sha(actual) != item["targetSha256"]:
            raise SystemExit(f"readback mismatch: {item['locale']} {item['sourceId']}")

    key_counts = {}
    for locale_file in sorted(updates):
        catalog = json.loads((ROOT / locale_file).read_text(encoding="utf-8"))
        key_counts[locale_file] = len(catalog)

    readback = {
        "schemaVersion": 1,
        "repository": "snapetech-org/SeerrNG",
        "pullRequest": 418,
        "inputHead": PINNED_HEAD,
        "inputTree": PINNED_TREE,
        "reviewedCellsReattested": len(ledger),
        "appliedCells": len(plan),
        "appliedCorrections": sum(item["kind"] == "correction" for item in plan),
        "appliedRefinements": sum(item["kind"] == "refinement" for item in plan),
        "primaryProposals": sum(item["origin"] == "primary-candidate-accepted" for item in plan),
        "crossReviewNewProposals": sum(item["origin"] == "cross-review" for item in plan),
        "crossReviewProposalsAcceptedByRoot": sum(item["origin"] == "cross-review" and item["rootDisposition"] == "accept" for item in plan),
        "crossReviewProposalsRevisedByRoot": sum(item["origin"] == "cross-review" and item["rootDisposition"] == "revise" for item in plan),
        "unclaimedCallerCellsAmongAppliedProposals": sum(item["callerClaim"] == "unclaimed" for item in plan),
        "catalogsChanged": len(key_counts),
        "catalogKeyCounts": key_counts,
        "allTargetsReadBackExactly": True,
        "sourcePlaceholdersMarkupProtectedLiteralsAndIcuReattested": True,
        "definitionOnlyOrSingleReferenceKeysRemainUnclaimed": 9,
        "nativeSpeakerApproval": False,
        "testsBuildsScansCIorBrowserRun": False,
        "workflowFilesTouched": False,
    }
    (EVIDENCE / "apply-plan.jsonl").write_text(
        "".join(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n" for item in plan),
        encoding="utf-8",
    )
    (EVIDENCE / "readback.json").write_text(
        json.dumps(readback, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(readback, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
