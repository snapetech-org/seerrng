from __future__ import annotations

import collections
import hashlib
import json
import subprocess
from pathlib import Path


EVIDENCE = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[5]
HEAD = "0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2"
TREE = "a09117211080bbd89d32959f17d93b02a82b966f"
LOCALES = ["ar", "de", "es", "fr", "hi", "id", "ja", "ko", "pt_BR", "vi", "zh_Hans", "zh_Hant"]
LEDGER = EVIDENCE / "crossreview" / "crossreview-ledger.jsonl"


def sha(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


assert git("rev-parse", "HEAD") == HEAD
assert git("rev-parse", "HEAD^{tree}") == TREE
status = git("status", "--short").splitlines()
assert all(line.startswith("?? docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-2500-2599") for line in status), status

for name in ("live-prs-before.json", "live-prs-after.json"):
    live = json.loads((EVIDENCE / "crossreview" / name).read_text(encoding="utf-8"))
    assert live["phase"] in {"before", "after"}
    assert len(live["pullRequests"]) == 7
    seerr = next(row for row in live["pullRequests"] if row["number"] == 418)
    assert seerr["repository"].lower() == "snapetech-org/seerrng"
    assert seerr["state"] == "OPEN" and seerr["isDraft"] is True
    assert seerr["headRefOid"] == HEAD and seerr["remoteBranchOid"] == HEAD and seerr["tree"] == TREE

rows = [json.loads(line) for line in LEDGER.read_text(encoding="utf-8").splitlines() if line.strip()]
assert len(rows) == 1200
assert len({(row["sourcePosition"], row["locale"]) for row in rows}) == 1200
assert collections.Counter(row["crossReviewDisposition"] for row in rows) == {
    "accept-current": 640,
    "accept-primary-correction": 473,
    "revise-primary": 87,
}

source_path = "src/i18n/locale/en.json"
source_catalog = json.loads((REPO / source_path).read_text(encoding="utf-8"))
old_catalogs: dict[str, dict] = {}
catalog_paths = {locale: f"src/i18n/locale/{locale}.json" for locale in LOCALES}
preapply = []
for locale, path in catalog_paths.items():
    raw = (REPO / path).read_bytes()
    catalog = json.loads(raw)
    assert raw == (json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    old_catalogs[locale] = catalog
    keys = list(catalog)
    preapply.append({
        "locale": locale,
        "path": path,
        "keyCount": len(keys),
        "fileSha256": sha(raw),
        "gitBlobOid": git("rev-parse", f"{HEAD}:{path}"),
        "orderedKeysSha256": sha("\n".join(keys)),
        "keySetSha256": sha("\n".join(sorted(keys))),
    })

write_jsonl(EVIDENCE / "application" / "catalog-preapply-pins.jsonl", preapply)
plan = []
for row in rows:
    locale = row["locale"]
    sid = row["sourceId"]
    source = source_catalog[sid]
    current = old_catalogs[locale][sid]
    assert source == row["source"] and sha(source) == row["sourceTextSha256"]
    assert current == row["currentTarget"] and sha(current) == row["currentTargetHash"]
    final = row["reviewedTarget"]
    assert sha(final) == row["reviewedTargetHash"]
    if row["crossReviewDisposition"] == "accept-current":
        assert final == current
    elif row["crossReviewDisposition"] == "accept-primary-correction":
        assert final == row["primaryTarget"]
    else:
        assert row["crossReviewDisposition"] == "revise-primary"
        assert final == row["recommendedTarget"]
    plan.append({
        "exactHead": HEAD,
        "exactTree": TREE,
        "sourcePosition": row["sourcePosition"],
        "sourceId": sid,
        "source": source,
        "sourceTextSha256": row["sourceTextSha256"],
        "locale": locale,
        "path": catalog_paths[locale],
        "callerContextSha256": row["callerContextSha256"],
        "crossReviewDisposition": row["crossReviewDisposition"],
        "primaryDisposition": row["primaryDisposition"],
        "currentTarget": current,
        "currentTargetSha256": row["currentTargetHash"],
        "finalTarget": final,
        "finalTargetSha256": row["reviewedTargetHash"],
        "changed": final != current,
        "rationale": row["reason"],
    })

assert len(plan) == 1200 and sum(row["changed"] for row in plan) == 560
write_jsonl(EVIDENCE / "application" / "apply-plan.jsonl", plan)

for row in plan:
    if row["changed"]:
        old_catalogs[row["locale"]][row["sourceId"]] = row["finalTarget"]

for locale, path in catalog_paths.items():
    old_keys = list(json.loads((REPO / path).read_text(encoding="utf-8")))
    assert old_keys == list(old_catalogs[locale])
    (REPO / path).write_text(json.dumps(old_catalogs[locale], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

readback = []
for row in plan:
    catalog = json.loads((REPO / row["path"]).read_text(encoding="utf-8"))
    actual = catalog[row["sourceId"]]
    assert actual == row["finalTarget"] and sha(actual) == row["finalTargetSha256"]
    readback.append({**row, "readbackTarget": actual, "readbackTargetSha256": sha(actual), "readbackMatches": True})
write_jsonl(EVIDENCE / "application" / "apply-readback.jsonl", readback)

postapply = []
for locale, path in catalog_paths.items():
    raw = (REPO / path).read_bytes()
    catalog = json.loads(raw)
    assert list(catalog) == list(old_catalogs[locale])
    postapply.append({
        "locale": locale,
        "path": path,
        "keyCount": len(catalog),
        "fileSha256": sha(raw),
        "gitBlobOid": git("hash-object", path),
        "orderedKeysSha256": sha("\n".join(catalog)),
        "keySetSha256": sha("\n".join(sorted(catalog))),
    })

write_json(EVIDENCE / "application" / "post-apply-catalog-attestation.json", {
    "repository": "snapetech-org/SeerrNG",
    "pullRequest": 418,
    "sourceHead": HEAD,
    "sourceTree": TREE,
    "changedCells": 560,
    "readbackCells": len(readback),
    "allReadbackMatches": True,
    "catalogs": postapply,
    "catalogKeySetParity": len({row["keySetSha256"] for row in postapply}) == 1,
    "catalogOrderParity": len({row["orderedKeysSha256"] for row in postapply}) == 1,
})

counts = collections.Counter(row["crossReviewDisposition"] for row in plan)
summary = {
    "repository": "snapetech-org/SeerrNG",
    "pullRequest": 418,
    "exactSourceHead": HEAD,
    "exactSourceTree": TREE,
    "window": [2500, 2599],
    "sourceIds": 100,
    "locales": 12,
    "cells": len(plan),
    "changedCells": sum(row["changed"] for row in plan),
    "retainedCells": len(plan) - sum(row["changed"] for row in plan),
    "dispositions": dict(sorted(counts.items())),
    "perLocaleChangedCells": dict(sorted(collections.Counter(row["locale"] for row in plan if row["changed"]).items())),
    "currentProtectedLiteralMismatchCells": 34,
    "finalProtectedLiteralMismatchCells": 0,
    "arabicIcuCountMarkerRepairs": [[2534, "ar"], [2581, "ar"]],
    "routeGlossaryReconciliation": "Arabic Reader Apps is rendered as تطبيقات القراءة, matching the exact title caller and two in-window breadcrumbs; the frozen review glossary value أجهزة قراءة meant reading devices.",
    "nativeSpeakerApproval": False,
    "headedBrowserReview": False,
    "testsBuildsScansOrCI": False,
    "workflowFilesTouched": False,
    "mergeReleaseOrTag": False,
}
write_json(EVIDENCE / "application" / "apply-summary.json", summary)
print(json.dumps(summary, ensure_ascii=False, indent=2))
