#!/usr/bin/env python3
"""Apply SeerrNG W2800-W2899 independent decisions at the pinned PR head."""
from __future__ import annotations
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path

SCRIPT = Path(__file__).resolve()
WINDOW = SCRIPT.parents[1]
ROOT = SCRIPT.parents[5]
APP = SCRIPT.parent
EXPECTED_HEAD = "7329f0ffb34d46042dbf1b165046e21c4f4d45e3"
EXPECTED_TREE = "531e045f511ee9c46f4c7ed80d50f529c9c12000"
LOCALES = ["ar", "de", "es", "fr", "hi", "id", "ja", "ko", "pt_BR", "vi", "zh_Hans", "zh_Hant"]


def sha(value: str | bytes) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_checksums(directory: Path, names: list[str]) -> None:
    for name in names:
        subprocess.run(["sha256sum", "-c", name], cwd=directory, check=True, stdout=subprocess.DEVNULL)


def main() -> None:
    assert git("rev-parse", "HEAD") == EXPECTED_HEAD
    assert git("rev-parse", "HEAD^{tree}") == EXPECTED_TREE
    primary = WINDOW / "primary"
    cross = WINDOW / "crossreview"
    verify_checksums(primary, ["SHA256SUMS", "INPUT-SHA256SUMS"])
    verify_checksums(cross, ["SHA256SUMS"])

    primary_summary = load_json(primary / "summary.json")
    cross_summary = load_json(cross / "summary.json")
    assert primary_summary["exactHead"] == EXPECTED_HEAD
    assert primary_summary["exactTree"] == EXPECTED_TREE
    assert cross_summary["exactHead"] == EXPECTED_HEAD
    assert cross_summary["exactTree"] == EXPECTED_TREE
    assert primary_summary["cellCount"] == cross_summary["reviewedCells"] == 1200
    assert primary_summary["sourcePositionRange"] == [2800, 2899]
    assert primary_summary["localeCount"] == cross_summary["locales"] == 12
    assert cross_summary["crossReviewCounts"] == {
        "accept-current": 835,
        "primary-proposals-confirmed-as-written": 364,
        "primary-proposals-revised": 1,
        "holds": 0,
    }
    assert cross_summary["nativeSpeakerSignoff"] is False
    assert cross_summary["blockers"] == []

    snapshot = load_json(APP / "pr-snapshot-before-apply.json")
    assert snapshot["applicationHead"] == EXPECTED_HEAD
    assert snapshot["applicationTree"] == EXPECTED_TREE
    assert len(snapshot["allSevenPullRequests"]) == 7
    assert all(p["state"] == "OPEN" for p in snapshot["allSevenPullRequests"])

    rows = read_jsonl(cross / "cross-review-ledger.jsonl")
    assert len(rows) == 1200
    assert len({(r["sourcePosition"], r["locale"]) for r in rows}) == 1200
    assert {r["locale"] for r in rows} == set(LOCALES)
    english = load_json(ROOT / "src/i18n/locale/en.json")
    catalogs = {locale: load_json(ROOT / f"src/i18n/locale/{locale}.json") for locale in LOCALES}
    assert len(english) == 9494
    key_order = {locale: list(catalog) for locale, catalog in catalogs.items()}
    assert all(len(catalog) == 9494 and set(catalog) == set(english) for catalog in catalogs.values())

    pins = load_json(cross / "file-pin-audit.json")["pinnedFiles"]
    catalog_pins = {p["locale"]: p for p in pins if p.get("kind") == "locale-catalog"}
    assert set(catalog_pins) == set(LOCALES)
    for locale in LOCALES:
        raw = (ROOT / f"src/i18n/locale/{locale}.json").read_bytes()
        pin = catalog_pins[locale]
        assert sha(raw) == pin["sha256"]
        assert len(raw) == pin["bytes"]
        assert git("rev-parse", f"{EXPECTED_HEAD}:{pin['path']}") == pin["blob"]

    plan = []
    full_readback = []
    english_identical_rows = 0
    for row in rows:
        locale = row["locale"]
        key = row["sourceId"]
        source = english.get(key)
        current = catalogs[locale].get(key)
        assert isinstance(source, str) and isinstance(current, str)
        assert sha(source) == row["sourceTextSha256"], (locale, key, "source hash")
        assert current == row["currentTarget"] and sha(current) == row["currentTargetSha256"], (locale, key, "current hash")
        final = row["crossReviewedTarget"]
        assert isinstance(final, str) and sha(final) == row["crossReviewedTargetSha256"]
        assert row["callerPinsExact"] is True
        assert row["icuValid"] is True
        assert row["markupParity"] == "exact"
        assert row["finalProtectedLiteralMissing"] == []
        assert row["finalPlaceholderProfile"] is not None
        assert row["independentDisposition"] in {"confirm-current", "confirm-proposal", "revise-proposal"}
        full_readback.append({
            "sourcePosition": row["sourcePosition"], "sourceId": key, "locale": locale,
            "sourceHash": row["sourceTextSha256"], "currentTargetHash": row["currentTargetSha256"],
            "finalTarget": final, "finalTargetHash": row["crossReviewedTargetSha256"],
            "independentDisposition": row["independentDisposition"],
            "callerContextSha256": row["callerContextSha256"], "callerPinsExact": row["callerPinsExact"],
            "placeholderParity": row["placeholderParity"], "icuValid": row["icuValid"],
            "markupParity": row["markupParity"], "finalProtectedLiteralMissing": row["finalProtectedLiteralMissing"],
            "readback": "pending",
        })
        if current != final:
            plan.append({
                "sourcePosition": row["sourcePosition"], "sourceId": key, "locale": locale,
                "source": source, "sourceHash": row["sourceTextSha256"],
                "catalogPath": f"src/i18n/locale/{locale}.json",
                "currentTarget": current, "currentTargetHash": row["currentTargetSha256"],
                "finalTarget": final, "finalTargetHash": row["crossReviewedTargetSha256"],
                "independentDisposition": row["independentDisposition"],
                "rationale": row["rationale"], "callerContextSha256": row["callerContextSha256"],
            })
        if source == current:
            english_identical_rows += 1
    assert len(plan) == 365, len(plan)
    assert sum(r["sourcePosition"] == 2898 and r["locale"] == "pt_BR" for r in plan) == 1
    ptbr = next(r for r in plan if r["sourcePosition"] == 2898 and r["locale"] == "pt_BR")
    assert ptbr["finalTarget"] == "Solicitação de <strong>{title}</strong> concluída com sucesso!"
    assert Counter(r["locale"] for r in plan) == Counter(primary_summary["proposalsByLocale"])

    # Persist the reviewed plan and full decision ledger before making catalog writes.
    (APP / "exact-hash-apply-plan.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in plan), encoding="utf-8")
    (APP / "full-window-apply-plan.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in full_readback), encoding="utf-8")
    preapply = []
    for locale in LOCALES:
        path = ROOT / f"src/i18n/locale/{locale}.json"
        raw = path.read_bytes()
        preapply.append({
            "locale": locale, "path": str(path.relative_to(ROOT)), "bytes": len(raw), "sha256": sha(raw),
            "gitBlob": git("rev-parse", f"{EXPECTED_HEAD}:{path.relative_to(ROOT)}"),
            "keyCount": len(catalogs[locale]), "keyOrderSha256": sha("\n".join(key_order[locale])),
        })
    (APP / "catalog-preapply-pins.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in preapply), encoding="utf-8")

    changed_counts = Counter()
    for row in plan:
        locale = row["locale"]
        key = row["sourceId"]
        assert catalogs[locale][key] == row["currentTarget"]
        catalogs[locale][key] = row["finalTarget"]
        changed_counts[locale] += 1
    for locale in LOCALES:
        path = ROOT / f"src/i18n/locale/{locale}.json"
        path.write_text(json.dumps(catalogs[locale], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    readback_by_key = {(r["sourceId"], r["locale"]): r for r in full_readback}
    for row in rows:
        locale, key = row["locale"], row["sourceId"]
        actual = catalogs[locale][key]
        assert actual == row["crossReviewedTarget"]
        assert sha(actual) == row["crossReviewedTargetSha256"]
        readback_by_key[(key, locale)]["readback"] = "exact-match"
    postapply = []
    for locale in LOCALES:
        path = ROOT / f"src/i18n/locale/{locale}.json"
        raw = path.read_bytes()
        catalog = load_json(path)
        assert len(catalog) == 9494 and set(catalog) == set(english)
        assert list(catalog) == key_order[locale]
        postapply.append({
            "locale": locale, "path": str(path.relative_to(ROOT)), "bytes": len(raw), "sha256": sha(raw),
            "keyCount": len(catalog), "keyOrderPreserved": True,
            "changedCells": changed_counts[locale],
        })
    assert sum(changed_counts.values()) == 365
    assert len(readback_by_key) == 1200 and all(r["readback"] == "exact-match" for r in full_readback)
    (APP / "full-window-readback.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in full_readback), encoding="utf-8")
    write_json(APP / "catalog-postapply-attestation.json", {
        "repository": "snapetech-org/SeerrNG", "pullRequest": 418,
        "inputHead": EXPECTED_HEAD, "inputTree": EXPECTED_TREE,
        "reviewedCells": 1200, "changedCells": 365, "changedLocaleCatalogs": 12,
        "keyCounts": {r["locale"]: r["keyCount"] for r in postapply},
        "keyOrderPreserved": all(r["keyOrderPreserved"] for r in postapply),
        "fullWindowReadbackExact": len(readback_by_key) == 1200 and all(r["readback"] == "exact-match" for r in full_readback),
        "localeFileAttestations": postapply,
        "nativeSpeakerApproval": False,
        "testsBuildScansCiOrBrowserRun": False,
    })
    write_json(APP / "apply-summary.json", {
        "repository": "snapetech-org/SeerrNG", "pullRequest": 418,
        "window": "W2800-W2899", "inputHead": EXPECTED_HEAD, "inputTree": EXPECTED_TREE,
        "reviewedCells": 1200, "unchangedAcceptedCells": 835,
        "changedCells": 365, "changedLocaleCatalogs": 12,
        "proposalsConfirmedAsWritten": 364, "independentRevisions": 1,
        "nativeSpeakerApproval": False,
    })
    print(json.dumps({"reviewedCells": 1200, "changedCells": 365, "changedPerLocale": dict(changed_counts), "allReadbacksExact": True, "catalogKeyCounts": {r["locale"]: r["keyCount"] for r in postapply}, "keyOrderPreserved": True, "reviewedEnglishIdenticalCells": english_identical_rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
