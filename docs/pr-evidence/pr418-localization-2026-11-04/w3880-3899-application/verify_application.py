import hashlib
import json
import pathlib
import re
import subprocess

PRODUCT = "50867b92245626a126d13d86574e5c596d080316"
BASE = "39d8ae36ba757532f947a9a15be22f0676e79075"
TREE = "18e04a0a9b0b9e57d575fba9f0e7cfd85d70a70b"
BULLET = "- **Localization:** Updated 29 reviewed Apprise and Gotify settings translations across the 12 target locales."

def abort(message):
    raise SystemExit("VERIFICATION FAILED: " + message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def jlines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])

repo = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
evidence = repo / "docs/pr-evidence/pr418-localization-2026-11-04/w3880-3899-application"
cross_root = evidence / "cross-review"
input_root = cross_root / "inputs/candidate-free-input"
product = subprocess.check_output(["git", "-C", str(repo), "rev-parse", PRODUCT], text=True).strip()
parent = subprocess.check_output(["git", "-C", str(repo), "rev-parse", PRODUCT + "^"], text=True).strip()
tree = subprocess.check_output(["git", "-C", str(repo), "rev-parse", PRODUCT + "^{tree}"], text=True).strip()
if product != PRODUCT or parent != BASE or tree != TREE:
    abort("product commit/parent/tree mismatch")

expected_catalogs = {
    "src/i18n/locale/ar.json", "src/i18n/locale/de.json", "src/i18n/locale/es.json",
    "src/i18n/locale/fr.json", "src/i18n/locale/hi.json", "src/i18n/locale/id.json",
    "src/i18n/locale/ja.json", "src/i18n/locale/ko.json", "src/i18n/locale/pt_BR.json",
    "src/i18n/locale/vi.json", "src/i18n/locale/zh_Hans.json", "src/i18n/locale/zh_Hant.json",
}
product_paths = subprocess.check_output(
    ["git", "-C", str(repo), "diff-tree", "--no-commit-id", "--name-only", "-r", PRODUCT],
    text=True,
).splitlines()
if any(path.startswith(".github/workflows/") for path in product_paths):
    abort("workflow path changed")

subprocess.run(["python3", "verify_cross_review.py"], cwd=cross_root, check=True)
subprocess.run(["sha256sum", "-c", "SHA256SUMS.txt"], cwd=cross_root, check=True)
cross_summary = json.loads((cross_root / "summary.json").read_text(encoding="utf-8"))
if cross_summary.get("selectedUpdates") != 29 or cross_summary.get("decisionCounts", {}).get("keep-current") != 207:
    abort("cross-review counts mismatch")
if cross_summary.get("priorHashOnlyHoldsPreserved") != 14 or cross_summary.get("newHashOnlyHolds") != 4:
    abort("cross-review hold continuity mismatch")

cross_rows = jlines(cross_root / "cross-ledger.jsonl")
current_rows = jlines(input_root / "current-target-cells.jsonl")
readback = jlines(evidence / "application-readback.jsonl")
summary = json.loads((evidence / "application-summary.json").read_text(encoding="utf-8"))
if len(cross_rows) != 240 or len(current_rows) != 240 or len(readback) != 240:
    abort("expected 240 cross/current/readback rows")
cross_by_cell = {(r["position"], r["locale"]): r for r in cross_rows}
current_by_cell = {(r["position"], r["locale"]): r for r in current_rows}
readback_by_cell = {(r["position"], r["locale"]): r for r in readback}
if any(len(index) != 240 for index in (cross_by_cell, current_by_cell, readback_by_cell)):
    abort("duplicate cell in cross/current/readback")
if set(cross_by_cell) != set(current_by_cell) or set(cross_by_cell) != set(readback_by_cell):
    abort("cell set mismatch")

pins = json.loads((input_root / "catalog-file-pins.json").read_text(encoding="utf-8"))["catalogFiles"]
postimages = {r["path"]: r for r in summary["catalogPostimages"]}
if set(postimages) != expected_catalogs:
    abort("catalog postimage set mismatch")
pins = json.loads((input_root / "catalog-file-pins.json").read_text(encoding="utf-8"))["catalogFiles"]

def tokens(value):
    return {
        "placeholders": re.findall(r"\{[^{}]+\}", value),
        "markupTags": re.findall(r"</?([A-Za-z][A-Za-z0-9]*)\b[^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)*(?![A-Za-z])", value),
    }

changed = 0
catalog_cache = {}
for cell, cross in cross_by_cell.items():
    current = current_by_cell[cell]
    row = readback_by_cell[cell]
    if cross["sourceId"] != current["sourceId"] or cross["currentTargetSha256"] != current["currentTargetSha256"]:
        abort("cross/current linkage mismatch at " + str(cell))
    rel = current["catalogPath"]
    pin = pins[current["locale"]]
    if pin["path"] != rel:
        abort("locale catalog path mismatch: " + current["locale"])
    post = postimages.get(rel)
    if not post or post["preSha256"] != pin["sha256"] or post["preGitBlob"] != pin["gitBlob"]:
        abort("catalog preimage differs from candidate-free pin: " + rel)
    if rel not in catalog_cache:
        path = repo / rel
        raw = path.read_bytes()
        committed = git(repo, "show", PRODUCT + ":" + rel)
        if raw != committed:
            abort("working file differs from product commit: " + rel)
        if sha(raw) != post["postSha256"]:
            abort("postimage SHA mismatch: " + rel)
        blob = subprocess.check_output(["git", "-C", str(repo), "hash-object", str(path)], text=True).strip()
        if blob != post["postGitBlob"]:
            abort("postimage Git blob mismatch: " + rel)
        catalog_cache[rel] = json.loads(raw.decode("utf-8"))
    if not post:
        abort("postimage SHA mismatch: " + rel)
    value = catalog_cache[rel].get(current["sourceId"])
    if value != cross["selectedTarget"] or sha(value.encode("utf-8")) != cross["selectedTargetSha256"]:
        abort("catalog value differs from selected cross target at " + str(cell))
    if row["sourceId"] != current["sourceId"] or row["path"] != rel:
        abort("application readback source/path mismatch at " + str(cell))
    if row["beforeSha256"] != current["currentTargetSha256"]:
        abort("application readback preimage mismatch at " + str(cell))
    if row["afterValue"] != value or row["afterSha256"] != sha(value.encode("utf-8")):
        abort("application readback mismatch at " + str(cell))
    expected_change = current["currentTargetSha256"] != cross["selectedTargetSha256"]
    if row["changed"] != expected_change:
        abort("changed flag mismatch at " + str(cell))
    changed += int(expected_change)
    expected_tokens = current["sourceTokens"]
    actual_tokens = tokens(value)
    baseline_ja_one = (cell == (3888, "ja") and value == current["currentTarget"] and actual_tokens["numericTokens"] == ["1"] and expected_tokens["numericTokens"] == [])
    if any(actual_tokens[key] != expected_tokens[key] for key in ("placeholders", "markupTags")) or (actual_tokens["numericTokens"] != expected_tokens["numericTokens"] and not baseline_ja_one):
        abort("token integrity mismatch at " + str(cell))
    if any(literal not in value for literal in expected_tokens["protectedLiterals"]):
        abort("protected literal missing at " + str(cell))
    if not all(row.get(key) for key in ("placeholdersPreserved", "markupPreserved", "protectedLiteralsPreserved")):
        abort("readback token flags are not all true at " + str(cell))
    if not row.get("numericTokensPreserved") and not row.get("acceptedBaselineJapaneseOneAs1"):
        abort("unexpected numeric-token difference at " + str(cell))

if changed != 29 or summary.get("selectedUpdates") != 29 or summary.get("retainedCurrent") != 211 or summary.get("newHolds") != 4:
    abort("application update counts mismatch")
expected_paths = sorted({"CHANGELOG.md"} | {r["path"] for r in summary["catalogPostimages"] if r["changedCells"] > 0})
if sorted(product_paths) != expected_paths:
    abort("product commit changed unexpected paths")
changelog = (repo / "CHANGELOG.md").read_bytes()
if changelog != git(repo, "show", PRODUCT + ":CHANGELOG.md"):
    abort("CHANGELOG working file differs from product commit")
if sha(changelog) != summary["changelogSha256After"]:
    abort("CHANGELOG postimage hash mismatch")
if changelog.decode("utf-8").count(BULLET) != 1:
    abort("Unreleased changelog bullet is not unique")

subprocess.run(["git", "-C", str(repo), "diff", "--check", BASE, PRODUCT], check=True)
print(json.dumps({
    "result": "PASS",
    "productCommit": product,
    "parent": parent,
    "tree": tree,
    "cells": 240,
    "selectedUpdates": changed,
    "retainedCurrent": 211,
    "newHolds": 4,
    "priorHashOnlyHoldsPreserved": 14,
    "catalogs": len(expected_catalogs),
    "workflowsChanged": 0,
    "tokenMismatches": 0,
    "changelogBulletCount": 1,
}, sort_keys=True))
