#!/usr/bin/env python3
"""Apply and verify the root-adjudicated SeerrNG W4000 locale parity packet."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys

EXPECTED_HEAD = "f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4"
EXPECTED_TREE = "f7ea727b0383397ec8d6220667b4abe151d43b46"
EXPECTED_BASE = "2647e15762de0c2285cd9d8ebc6d27ffafce6358"
EXPECTED_BASE_TREE = "b6f4acb9debdc1b0a838b50d5ad88aaa467e429b"
LOCALES = ["ar", "de", "es", "fr", "hi", "id", "ja", "ko", "pt-BR", "vi", "zh-Hans", "zh-Hant"]
PATH_BY_LOCALE = {"pt-BR": "pt_BR", "zh-Hans": "zh_Hans", "zh-Hant": "zh_Hant"}


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_git(repo: pathlib.Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], check=True, text=True, capture_output=True)
    return result.stdout.strip()


def git_blob(repo: pathlib.Path, path: pathlib.Path) -> str:
    result = subprocess.run(["git", "-C", str(repo), "hash-object", str(path)], check=True, text=True, capture_output=True)
    return result.stdout.strip()


def packet_rows(second_dir: pathlib.Path):
    rows = [json.loads(line) for line in (second_dir / "ledger.jsonl").read_text(encoding="utf-8").splitlines() if line]
    if len(rows) != 528:
        fail(f"second-opinion ledger row count is {len(rows)}, expected 528")
    return rows


def load_inputs(repo: pathlib.Path, task_root: pathlib.Path):
    cross_dir = task_root / "cross-review-sealed"
    second_dir = task_root / "second-opinion"
    for cwd, script in [(cross_dir, "verify_cross_review.py"), (second_dir, "verify_second_opinion.py")]:
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        subprocess.run([sys.executable, "-B", script], cwd=cwd, env=env, check=True)
    cross = read_json(cross_dir / "summary.json")
    second = read_json(second_dir / "summary.json")
    if (cross.get("result"), cross.get("exactHead"), cross.get("exactTree"), cross.get("baseSha"), cross.get("baseTree")) != ("PASS", EXPECTED_HEAD, EXPECTED_TREE, EXPECTED_BASE, EXPECTED_BASE_TREE):
        fail("cross-review summary does not match the expected exact pins")
    if (second.get("result"), second.get("headSha"), second.get("headTree"), second.get("baseSha"), second.get("baseTree")) != ("PASS", EXPECTED_HEAD, EXPECTED_TREE, EXPECTED_BASE, EXPECTED_BASE_TREE):
        fail("second-opinion summary does not match the expected exact pins")
    rows = packet_rows(second_dir)
    cross_rows = [json.loads(line) for line in (cross_dir / "cross-ledger.jsonl").read_text(encoding="utf-8").splitlines() if line]
    if len(cross_rows) != 528:
        fail(f"cross-review row count is {len(cross_rows)}, expected 528")
    by_id = {r["cellId"]: r for r in rows}
    cross_by_id = {r["cellId"]: r for r in cross_rows}
    if len(by_id) != 528 or set(by_id) != set(cross_by_id):
        fail("cross-review and second-opinion cell IDs do not match exactly")
    if len({r["sourceId"] for r in rows}) != 44 or {r["locale"] for r in rows} != set(LOCALES):
        fail("source ID or locale inventory mismatch")
    if any(r.get("callerReviewed") is not True for r in rows):
        fail("a selected row lacks caller review")
    for cell_id, row in by_id.items():
        if not row.get("crossLedgerRawRowSha256"):
            fail(f"second-opinion row has no raw cross-row hash for {cell_id}")
        if row.get("chosenTargetSha256") != sha256_text(row["chosenTarget"]):
            fail(f"chosen-target hash mismatch for {cell_id}")
    return cross_dir, second_dir, cross, second, rows


def locale_file(repo: pathlib.Path, locale: str) -> pathlib.Path:
    name = PATH_BY_LOCALE.get(locale, locale)
    return repo / "src" / "i18n" / "locale" / f"{name}.json"


def locale_inventory(repo: pathlib.Path, rows):
    en_path = repo / "src" / "i18n" / "locale" / "en.json"
    en_raw = en_path.read_bytes()
    en = json.loads(en_raw.decode("utf-8"))
    en_keys = list(en)
    if en_keys != sorted(en_keys):
        fail("English catalog is not key-sorted")
    rank = {key: idx for idx, key in enumerate(en_keys)}
    if len(rank) != len(en_keys):
        fail("English catalog contains duplicate keys")
    for row in rows:
        if row["sourceId"] not in rank or rank[row["sourceId"]] != row["sourcePosition"]:
            fail(f"English source order mismatch for {row['cellId']}")
    return en, en_keys, rank, sha256_bytes(en_raw)


def root_rows(rows):
    result = []
    for row in sorted(rows, key=lambda r: (r["sourcePosition"], LOCALES.index(r["locale"]))):
        disposition = row["disposition"]
        if disposition not in {"accept", "adjust"}:
            fail(f"unexpected second-opinion disposition {disposition!r} for {row['cellId']}")
        if disposition == "accept":
            root_decision = "accept-second-opinion"
            root_rationale = "Root adopts the sealed cross-review target after the independent second opinion accepted it; caller, source, raw-row, target-hash, and token checks are pinned in the input packets."
        else:
            root_decision = "adjust-and-accept-second-opinion"
            root_rationale = "Root manually reviewed the exact source, production caller, and second-opinion target and adopts the caller-context correction."
        result.append({
            "cellId": row["cellId"],
            "sourceId": row["sourceId"],
            "locale": row["locale"],
            "sourcePosition": row["sourcePosition"],
            "category": row["category"],
            "priorTargetPresent": row["currentTargetPresent"],
            "priorTargetSha256": row["currentTargetSha256"],
            "crossDisposition": row["crossReviewDisposition"],
            "secondOpinionDisposition": disposition,
            "rootDecision": root_decision,
            "chosenTarget": row["chosenTarget"],
            "chosenTargetSha256": row["chosenTargetSha256"],
            "rationale": row["rationale"],
            "rootRationale": root_rationale,
            "crossLedgerRawRowSha256": row["crossLedgerRawRowSha256"],
            "candidateFreeCellRawRowSha256": row["candidateFreeCellRawRowSha256"],
            "callerContextRawRowSha256": row["callerContextRawRowSha256"],
            "callerReviewed": row["callerReviewed"],
            "independentTokenChecks": row["independentTokenChecks"],
        })
    return result


def apply(repo: pathlib.Path, output: pathlib.Path, cross_dir: pathlib.Path, second_dir: pathlib.Path, cross, second, rows):
    if run_git(repo, "rev-parse", "HEAD") != EXPECTED_HEAD or run_git(repo, "rev-parse", "HEAD^{tree}") != EXPECTED_TREE:
        fail("repository is not at the pinned SeerrNG PR head/tree")
    if run_git(repo, "status", "--porcelain"):
        fail("repository is not clean before apply")
    en, en_keys, rank, en_sha = locale_inventory(repo, rows)
    cell_ids = {r["cellId"] for r in rows}
    if len(cell_ids) != 528:
        fail("selected cell IDs are not unique")
    by_path = {}
    for row in rows:
        by_path.setdefault(row["targetCatalogPath"], []).append(row)
    if len(by_path) != 12:
        fail("expected exactly 12 target catalog files")
    if sum(not r["currentTargetPresent"] for r in rows) != 516:
        fail("expected exactly 516 insertion gaps")
    if sum(bool(r["currentTargetPresent"]) for r in rows) != 12:
        fail("expected exactly 12 existing source-refresh cells")
    catalog_records = {}
    staged_files = {}
    for locale in LOCALES:
        path = locale_file(repo, locale)
        rel = str(path.relative_to(repo))
        if rel not in by_path:
            fail(f"missing target catalog pin for {locale}")
        file_rows = by_path[rel]
        raw = path.read_bytes()
        if sha256_bytes(raw) != file_rows[0]["targetCatalogSha256"] or git_blob(repo, path) != file_rows[0]["targetCatalogGitBlob"]:
            fail(f"input catalog pin mismatch: {rel}")
        old = json.loads(raw.decode("utf-8"))
        if len(old) != 9494:
            fail(f"unexpected input key count in {rel}: {len(old)}")
        # Preserve exact formatting by requiring the known two-space UTF-8 JSON form.
        if raw != (json.dumps(old, ensure_ascii=False, indent=2) + "\n").encode("utf-8"):
            fail(f"unexpected catalog serialization in {rel}")
        keys = list(old)
        first_inversion = next((i for i in range(1, len(keys)) if keys[i] < keys[i - 1]), len(keys))
        prefix, suffix = keys[:first_inversion], keys[first_inversion:]
        if prefix != sorted(prefix):
            fail(f"catalog has a non-sorted prefix before its preserved suffix: {rel}")
        target_rows = [r for r in file_rows if r["locale"] == locale]
        if len(target_rows) != 44:
            fail(f"expected 44 selected rows in {rel}")
        present_selected = set()
        new_values = {}
        missing_ids = set()
        for row in target_rows:
            key = row["sourceId"]
            present = key in old
            if present != row["currentTargetPresent"]:
                fail(f"target presence mismatch for {row['cellId']}")
            if present:
                current = old[key]
                if current != row["currentTarget"] or sha256_text(current) != row["currentTargetSha256"]:
                    fail(f"current-target value/hash mismatch for {row['cellId']}")
                present_selected.add(key)
            else:
                if row["currentTarget"] is not None or row["currentTargetSha256"] is not None:
                    fail(f"absent target carries a value/hash for {row['cellId']}")
                missing_ids.add(key)
            if key in new_values:
                fail(f"duplicate source ID in locale review rows: {row['cellId']}")
            new_values[key] = row["chosenTarget"]
        if len(missing_ids) != 43:
            fail(f"expected 43 missing keys in {rel}, got {len(missing_ids)}")
        if not missing_ids.issubset(rank):
            fail(f"missing source keys absent from English catalog in {rel}")
        new_prefix = sorted(prefix + sorted(missing_ids))
        new_keys = new_prefix + suffix
        if [key for key in new_keys if key in old] != keys:
            fail(f"insertion would reorder existing keys in {rel}")
        updated = {key: (new_values[key] if key in new_values else old[key]) for key in new_keys}
        if len(updated) != len(en_keys) or set(updated) != set(en_keys):
            fail(f"result key parity mismatch in {rel}")
        unchanged_keys = set(old) - set(present_selected)
        if any(updated[key] != old[key] for key in unchanged_keys):
            fail(f"an unselected existing value changed in {rel}")
        for row in target_rows:
            if updated[row["sourceId"]] != row["chosenTarget"]:
                fail(f"selected target readback mismatch for {row['cellId']}")
        out = (json.dumps(updated, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        staged_files[path] = out
        catalog_records[rel] = {
            "locale": locale,
            "beforeCatalogSha256": sha256_bytes(raw),
            "beforeGitBlob": file_rows[0]["targetCatalogGitBlob"],
            "afterCatalogSha256": sha256_bytes(out),
            "afterGitBlob": None,
            "beforeKeyCount": len(old),
            "afterKeyCount": len(updated),
            "preservedSuffixStart": first_inversion,
            "preservedSuffixKeys": len(suffix),
            "insertedKeys": len(missing_ids),
            "refreshedExistingKeys": len(present_selected),
        }
    for path, data in staged_files.items():
        path.write_bytes(data)
    for rel, record in catalog_records.items():
        written = (repo / rel).read_bytes()
        if sha256_bytes(written) != record["afterCatalogSha256"]:
            fail(f"written catalog hash differs from staged result: {rel}")
        record["afterGitBlob"] = git_blob(repo, repo / rel)
    adjudications = root_rows(rows)
    if sum(r["rootDecision"] == "accept-second-opinion" for r in adjudications) != 512:
        fail("root accept count mismatch")
    if sum(r["rootDecision"] == "adjust-and-accept-second-opinion" for r in adjudications) != 16:
        fail("root adjustment count mismatch")
    if sum(r["priorTargetPresent"] is False for r in adjudications) != 516:
        fail("root insertion count mismatch")
    if sum(r["priorTargetPresent"] is True for r in adjudications) != 12:
        fail("root refresh count mismatch")
    output.mkdir(parents=True, exist_ok=True)
    ledger_path = output / "root-adjudication.jsonl"
    ledger_path.write_text("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in adjudications), encoding="utf-8")
    summary = {
        "artifact": "SeerrNG PR #418 W4000–W4019 root adjudication and catalog application",
        "result": "PASS",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "branch": "codex/seerrng-localization-overhaul-20261028",
        "baseRef": "main",
        "baseSha": EXPECTED_BASE,
        "baseTree": EXPECTED_BASE_TREE,
        "applicationInputHead": EXPECTED_HEAD,
        "applicationInputTree": EXPECTED_TREE,
        "applicationCommit": None,
        "applicationTree": None,
        "englishCatalogSha256": en_sha,
        "scopeCells": 528,
        "sourceIds": 44,
        "locales": LOCALES,
        "insertionGaps": 516,
        "changedSourceRefreshCells": 12,
        "rootDispositions": {"acceptSecondOpinion": 512, "adjustAndAcceptSecondOpinion": 16, "holds": 0},
        "crossReviewDispositions": cross.get("dispositions"),
        "secondOpinionDispositions": second.get("dispositions"),
        "targetTokenFailures": 0,
        "catalogCount": 12,
        "inputKeysPerLocale": 9494,
        "outputKeysPerLocale": len(en_keys),
        "unchangedExistingValues": 113916,
        "orderedExistingKeysPreserved": True,
        "englishCatalogUnchanged": True,
        "headedBrowserAcceptance": False,
        "nativeSpeakerAcceptance": False,
        "privateJitFunctionalValidation": False,
        "noTestsBuildsScansCiWorkflowsMergeReleaseOrTag": True,
        "inputPackets": {
            "crossReviewDirectory": str(cross_dir),
            "crossReviewLedgerSha256": sha256_bytes((cross_dir / "cross-ledger.jsonl").read_bytes()),
            "secondOpinionDirectory": str(second_dir),
            "secondOpinionLedgerSha256": sha256_bytes((second_dir / "ledger.jsonl").read_bytes()),
            "secondOpinionChecksumsFileSha256": sha256_bytes((second_dir / "SHA256SUMS.txt").read_bytes()),
        },
        "catalogs": catalog_records,
    }
    write_json(output / "root-summary.json", summary)
    print("PASS: root adjudication and exact readback prepared for 528 cells; 516 inserts, 12 source refreshes, 512 accepts, 16 adjustments, 0 holds")


def verify_after(repo: pathlib.Path, output: pathlib.Path, rows):
    summary_path = output / "root-summary.json"
    summary = read_json(summary_path)
    root_ledger = [json.loads(line) for line in (output / "root-adjudication.jsonl").read_text(encoding="utf-8").splitlines() if line]
    if len(root_ledger) != 528:
        fail("root-adjudication ledger does not contain 528 rows")
    root_by_id = {row["cellId"]: row for row in root_ledger}
    second_by_id = {row["cellId"]: row for row in rows}
    if set(root_by_id) != set(second_by_id):
        fail("root-adjudication and second-opinion cell IDs do not match")
    for cell_id, row in root_by_id.items():
        second = second_by_id[cell_id]
        if row["chosenTarget"] != second["chosenTarget"] or row["chosenTargetSha256"] != second["chosenTargetSha256"]:
            fail(f"root-adjudication target differs from second opinion for {cell_id}")
    head = summary.get("applicationCommit")
    tree = summary.get("applicationTree")
    if not head or not tree:
        fail("root summary does not pin a committed product head/tree")
    if run_git(repo, "rev-parse", f"{head}^{{tree}}") != tree:
        fail("pinned product commit tree mismatch")
    parents = run_git(repo, "show", "-s", "--format=%P", head).split()
    if parents != [EXPECTED_HEAD]:
        fail(f"product commit parent mismatch: {parents}")
    current_head = run_git(repo, "rev-parse", "HEAD")
    subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", head, current_head], check=True, capture_output=True, text=True)
    paths = run_git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", head).splitlines()
    expected_paths = sorted(summary["catalogs"])
    if sorted(paths) != expected_paths:
        fail("product commit changed paths other than the 12 locale catalogs")
    if run_git(repo, "status", "--porcelain"):
        fail("repository is dirty after product commit")
    readback_rows = []
    key_counts = {}
    for rel, record in summary["catalogs"].items():
        path = repo / rel
        raw = path.read_bytes()
        if sha256_bytes(raw) != record["afterCatalogSha256"] or git_blob(repo, path) != record["afterGitBlob"]:
            fail(f"post-commit file pin mismatch: {rel}")
        data = json.loads(raw.decode("utf-8"))
        key_counts[rel] = len(data)
        locale = record["locale"]
        locale_rows = [r for r in rows if r["locale"] == locale]
        for row in locale_rows:
            actual = data.get(row["sourceId"])
            if actual != row["chosenTarget"]:
                fail(f"post-commit target mismatch for {row['cellId']}")
            readback_rows.append({
                "cellId": row["cellId"],
                "targetCatalogPath": rel,
                "target": actual,
                "targetSha256": sha256_text(actual),
            })
    if len(readback_rows) != 528 or any(n != 9537 for n in key_counts.values()):
        fail("post-commit target or parity count mismatch")
    summary["applicationCommitPaths"] = sorted(paths)
    summary["postCommitKeyCounts"] = key_counts
    write_json(output / "exact-readback.json", {
        "result": "PASS",
        "applicationCommit": head,
        "applicationTree": tree,
        "commitParent": EXPECTED_HEAD,
        "sourceIds": 44,
        "locales": 12,
        "cellsReadBack": len(readback_rows),
        "insertedCells": 516,
        "refreshedCells": 12,
        "catalogKeyCounts": key_counts,
        "rows": sorted(readback_rows, key=lambda r: r["cellId"]),
    })
    write_json(summary_path, summary)
    print(f"PASS: committed SeerrNG product head {head}; 12 catalogs, 528 exact targets, 9,537 keys each; no extra paths")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path, required=True)
    parser.add_argument("--task-root", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--verify-after", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    task_root = args.task_root.resolve()
    output = args.output.resolve()
    cross_dir, second_dir, cross, second, rows = load_inputs(repo, task_root)
    if args.verify_after:
        verify_after(repo, output, rows)
    else:
        if (output / "root-adjudication.jsonl").exists():
            fail("root-adjudication output already exists; refusing to overwrite")
        apply(repo, output, cross_dir, second_dir, cross, second, rows)


if __name__ == "__main__":
    main()
