#!/usr/bin/env python3
"""Apply exact-hash ratified SeerrNG W3340-W3359 values and record readback."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "docs/pr-evidence/pr418-localization-2026-11-03/window-3340-3359"
EXPECTED_HEAD = "266d8fff4beb56eab17c9de0f6560c619577e3de"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def git_blob_at_head(path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"HEAD:{path}"], cwd=ROOT)


def dump_catalog(data: dict) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main() -> None:
    window = json.loads((EVIDENCE / "clean-input/window.json").read_text(encoding="utf-8"))
    plan = json.loads((EVIDENCE / "adjudication/apply-plan.json").read_text(encoding="utf-8"))
    ratified = read_rows(EVIDENCE / "adjudication/ratified-ledger.jsonl")
    inputs = read_rows(EVIDENCE / "clean-input/review-input.jsonl")
    assert window["head"] == plan["head"] == EXPECTED_HEAD
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() == EXPECTED_HEAD
    assert len(ratified) == len(inputs) == 240
    assert len(plan["items"]) == plan["approvedChangeCount"] == 20

    ratified_map = {(row["id"], row["locale"]): row for row in ratified}
    input_map = {(row["id"], row["locale"]): row for row in inputs}
    assert set(ratified_map) == set(input_map)
    baseline: dict[str, dict] = {}
    current: dict[str, dict] = {}
    for path, pin in window["localeCatalogPins"].items():
        raw = git_blob_at_head(path)
        assert sha(raw) == pin["sha256"], f"baseline catalog SHA mismatch: {path}"
        assert subprocess.check_output(["git", "rev-parse", f"HEAD:{path}"], cwd=ROOT, text=True).strip() == pin["gitBlob"]
        original = json.loads(raw)
        assert len(original) == pin["keyCount"] == 9494
        assert sha("\n".join(original).encode("utf-8")) == pin["orderedKeySha256"]
        assert dump_catalog(original) == raw, f"unexpected JSON format: {path}"
        live_raw = (ROOT / path).read_bytes()
        assert live_raw == raw, f"worktree changed before apply: {path}"
        baseline[path] = original
        current[path] = json.loads(live_raw)

    for path, pin in window["callerFiles"].items():
        raw = git_blob_at_head(path)
        assert sha(raw) == pin["sha256"], f"caller source SHA mismatch: {path}"
        assert subprocess.check_output(["git", "rev-parse", f"HEAD:{path}"], cwd=ROOT, text=True).strip() == pin["gitBlob"]

    updates: dict[tuple[str, str], str] = {}
    for item in plan["items"]:
        key = (item["id"], item["locale"])
        row = ratified_map[key]
        source = input_map[key]
        assert row["rootDisposition"] in ("APPLY_BLIND_REFINEMENT", "APPLY_PRIMARY_CORRECTION")
        assert item["catalogPath"] == source["catalogPath"] == row["catalogPath"]
        assert item["currentTarget"] == source["currentTarget"] == row["currentTarget"]
        assert item["currentTargetSha256"] == source["currentTargetSha256"] == row["currentTargetSha256"]
        assert item["target"] == row["rootTarget"] and item["targetSha256"] == row["rootTargetSha256"]
        assert sha(item["currentTarget"].encode("utf-8")) == item["currentTargetSha256"]
        assert sha(item["target"].encode("utf-8")) == item["targetSha256"]
        assert source["sourceSha256"] == sha(source["source"].encode("utf-8"))
        assert baseline[item["catalogPath"]][item["id"]] == item["currentTarget"]
        assert source["placeholderParity"] is True and source["protectedLiteralOccurrencesPinned"] is True
        assert re.findall(r"\d+", source["source"]) == re.findall(r"\d+", item["target"])
        tags = lambda value: re.findall(r"</?[A-Za-z][^>]*>", value)
        assert tags(source["source"]) == tags(item["target"])
        for token in source["sourceProtectedLiterals"]:
            assert token in item["target"], f"protected literal lost: {key} {token}"
        update_key = (item["catalogPath"], item["id"])
        assert update_key not in updates
        updates[update_key] = item["target"]

    planned = {(item["catalogPath"], item["id"]): item for item in plan["items"]}
    assert len(planned) == 20
    for source in inputs:
        path = source["catalogPath"]
        current_value = baseline[path][source["id"]]
        assert source["currentTarget"] == current_value
        assert sha(current_value.encode("utf-8")) == source["currentTargetSha256"]

    updated = {path: dict(data) for path, data in current.items()}
    for (path, message_id), target in updates.items():
        updated[path][message_id] = target

    readback_rows = []
    for key, source in sorted(input_map.items(), key=lambda pair: (pair[1]["position"], pair[1]["locale"])):
        row = ratified_map[key]
        path = source["catalogPath"]
        expected = row["rootTarget"]
        actual = updated[path][source["id"]]
        assert actual == expected
        readback_rows.append({
            "position": source["position"], "id": source["id"], "locale": source["locale"],
            "catalogPath": path, "sourceSha256": source["sourceSha256"],
            "inputCurrentTargetSha256": source["currentTargetSha256"],
            "rootDisposition": row["rootDisposition"], "expectedTarget": expected,
            "expectedTargetSha256": sha(expected.encode("utf-8")),
            "actualTarget": actual, "actualTargetSha256": sha(actual.encode("utf-8")),
            "changed": expected != source["currentTarget"],
        })

    changed_paths = sorted({path for path, _ in updates})
    for path in changed_paths:
        destination = ROOT / path
        payload = dump_catalog(updated[path])
        with tempfile.NamedTemporaryFile(prefix=f".{destination.name}.w3340-3359-", dir=destination.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)

    catalog_summaries = {}
    for path, data in updated.items():
        final_bytes = (ROOT / path).read_bytes()
        final = json.loads(final_bytes)
        assert list(final) == list(baseline[path])
        catalog_summaries[path] = {
            "keyCount": len(final),
            "orderedKeySha256": sha("\n".join(final).encode("utf-8")),
            "fileSha256": sha(final_bytes),
        }

    ordered_hash_groups: dict[str, list[str]] = {}
    for path, data in catalog_summaries.items():
        ordered_hash_groups.setdefault(data["orderedKeySha256"], []).append(path)
    readback = {
        "title": "Application readback: SeerrNG PR #418 W3340-W3359",
        "repository": "snapetech-org/seerrng", "pullRequest": 418,
        "baselineHead": EXPECTED_HEAD, "window": "W3340-W3359",
        "cellCount": len(readback_rows), "approvedChangeCount": len(updates),
        "verifiedCellCount": len(readback_rows), "mismatchCount": 0,
        "changedCatalogCount": len(changed_paths), "catalogs": catalog_summaries,
        "orderedKeyHashGroups": ordered_hash_groups, "rows": readback_rows,
    }
    (EVIDENCE / "readback.json").write_text(json.dumps(readback, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(updates)} exact-hash changes across {len(changed_paths)} catalogs; read back {len(readback_rows)} cells with zero mismatches.")


if __name__ == "__main__":
    main()
