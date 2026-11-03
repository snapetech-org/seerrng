#!/usr/bin/env python3
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

PACKET = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[5]
EXPECTED_HEAD = "7f652dc9b529506fded0064f73cf4a4d32dba1a9"
EXPECTED_TREE = "9a42f2efdc0f64e99928a4994304413036b8a315"


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def git_bytes(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=REPO)


assert git("rev-parse", "HEAD") == EXPECTED_HEAD
assert git("rev-parse", "HEAD^{tree}") == EXPECTED_TREE

ledger = [json.loads(line) for line in (PACKET / "ratified/ratified-review.jsonl").read_text().splitlines()]
plan = [json.loads(line) for line in (PACKET / "ratified/apply-plan.jsonl").read_text().splitlines()]
planned_readback = [json.loads(line) for line in (PACKET / "ratified/ratified-readback.jsonl").read_text().splitlines()]
assert len(ledger) == len(planned_readback) == 240
assert len(plan) == 49
by_cell = {(row["position"], row["locale"]): row for row in ledger}
assert len(by_cell) == 240
plan_by_cell = {(row["position"], row["locale"]): row for row in plan}
assert len(plan_by_cell) == 49
counts = Counter(row["ratifiedDisposition"] for row in ledger)
assert counts == Counter({"accept-current": 131, "correction": 24, "refinement": 25, "hold-context": 60}), counts

files_before = {}
files_current = {}
catalogs = {}
for row in ledger:
    path = row["catalogPath"]
    if path not in files_before:
        baseline = git_bytes("show", f"HEAD:{path}")
        current_raw = (REPO / path).read_bytes()
        assert hashlib.sha256(baseline).hexdigest() == row["catalogFileSha256"], f"catalog file hash mismatch: {path}"
        assert git("rev-parse", f"HEAD:{path}") == row["catalogGitBlob"], f"catalog blob mismatch: {path}"
        files_before[path] = baseline
        files_current[path] = current_raw
        catalogs[path] = json.loads(current_raw)
    current = catalogs[path][row["id"]]
    assert current in {row["currentTarget"], row["finalTarget"]}
    assert sha(row["source"]) == row["sourceSha256"]
    assert sha(row["currentTarget"]) == row["currentTargetSha256"]
    assert sha(row["finalTarget"]) == row["finalTargetSha256"]
    assert row["placeholderParity"] is True
    assert row["protectedLiteralOccurrencesPinned"] is True
    assert row["eligibility"] in {"eligible", "hold-context"}
    if row["ratifiedDisposition"] == "hold-context":
        assert row["callerExists"] is False
        assert row["finalTarget"] == row["currentTarget"] == current

readback_by_cell = {(row["position"], row["locale"]): row for row in planned_readback}
assert len(readback_by_cell) == 240
for row in ledger:
    rb = readback_by_cell[(row["position"], row["locale"])]
    assert rb["exactReadbackMatch"] is True
    assert rb["expectedCurrentTargetSha256"] == row["currentTargetSha256"]
    assert rb["expectedFinalTargetSha256"] == row["finalTargetSha256"]
    assert rb["plannedFinalTarget"] == row["finalTarget"]

expected_paths = {row["catalogPath"] for row in ledger}
packet_prefix = PACKET.relative_to(REPO).as_posix() + "/"
allowed = expected_paths | {packet_prefix}
status = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=REPO, text=True).splitlines()
for line in status:
    changed = line[3:]
    assert changed in expected_paths or changed.startswith(packet_prefix), f"unrelated worktree change: {line}"

files_updated = dict(files_current)
apply_rows = []
already_applied = 0
for row in plan:
    ledger_row = by_cell[(row["position"], row["locale"])]
    assert row["id"] == ledger_row["id"]
    assert row["catalogPath"] == ledger_row["catalogPath"]
    assert row["currentTarget"] == ledger_row["currentTarget"]
    assert row["currentTargetSha256"] == ledger_row["currentTargetSha256"]
    assert row["finalTarget"] == ledger_row["finalTarget"]
    assert row["finalTargetSha256"] == ledger_row["finalTargetSha256"]
    path = row["catalogPath"]
    actual = json.loads(files_updated[path])[row["id"]]
    if actual == row["finalTarget"]:
        already_applied += 1
    else:
        assert actual == row["currentTarget"]
        raw = files_updated[path].decode("utf-8")
        key = json.dumps(row["id"], ensure_ascii=False)
        old = json.dumps(row["currentTarget"], ensure_ascii=False)
        new = json.dumps(row["finalTarget"], ensure_ascii=False)
        pattern = re.compile(r"(?m)^([ \t]*" + re.escape(key) + r"[ \t]*:[ \t]*)" + re.escape(old) + r"([ \t]*,?[ \t]*)$")
        raw, n = pattern.subn(lambda m: m.group(1) + new + m.group(2), raw)
        assert n == 1, (row["id"], row["locale"], n)
        files_updated[path] = raw.encode("utf-8")
    apply_rows.append({
        "position": row["position"],
        "id": row["id"],
        "locale": row["locale"],
        "catalogPath": path,
        "expectedCurrentTargetSha256": row["currentTargetSha256"],
        "finalTarget": row["finalTarget"],
        "finalTargetSha256": row["finalTargetSha256"],
        "disposition": row["disposition"],
        "selectedFrom": row["selectedFrom"],
        "rationale": row["rationale"],
    })

for path, raw in files_updated.items():
    if raw != (REPO / path).read_bytes():
        (REPO / path).write_bytes(raw)

final_readback = []
for row in ledger:
    path = row["catalogPath"]
    data = json.loads((REPO / path).read_text())
    actual = data[row["id"]]
    assert actual == row["finalTarget"], (row["position"], row["locale"])
    assert sha(actual) == row["finalTargetSha256"]
    placeholders = sorted(re.findall(r"\{[^{}]+\}", actual))
    assert placeholders == sorted(row["sourcePlaceholders"]), (row["position"], row["locale"], placeholders)
    for protected in row["currentProtectedLiterals"]:
        assert protected in actual, (row["position"], row["locale"], protected)
    final_readback.append({
        "position": row["position"],
        "id": row["id"],
        "locale": row["locale"],
        "catalogPath": path,
        "disposition": row["ratifiedDisposition"],
        "finalTargetSha256": sha(actual),
        "matchesFinalTarget": True,
    })

expected_changes = {(row["catalogPath"], row["id"]) for row in plan}
actual_changes = set()
for path, baseline in files_before.items():
    before = json.loads(baseline)
    after = json.loads((REPO / path).read_bytes())
    assert list(before) == list(after), f"catalog key order changed: {path}"
    for key in before:
        if before[key] != after[key]:
            actual_changes.add((path, key))
assert actual_changes == expected_changes

direct_files = sorted(files_before)
reference_keys = set(json.loads((REPO / "src/i18n/locale/en.json").read_text()).keys())
assert len(direct_files) == 12
for path in direct_files:
    data = json.loads((REPO / path).read_text())
    assert len(data) == 9494
    assert set(data) == reference_keys

(PACKET / "application/apply-plan.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in apply_rows))
(PACKET / "application/readback.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in final_readback))
(PACKET / "application/summary.json").write_text(json.dumps({
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "window": "W3300-W3319",
    "inputHead": EXPECTED_HEAD,
    "inputTree": EXPECTED_TREE,
    "reviewedCells": len(ledger),
    "dispositions": dict(counts),
    "appliedChanges": len(apply_rows),
    "alreadyAppliedOnRerun": already_applied,
    "changedCatalogs": len(files_updated),
    "catalogKeyCount": 9494,
    "exactKeySetParity": True,
    "perCatalogKeyOrderPreserved": True,
    "readbackRows": len(final_readback),
    "readbackMismatches": 0,
    "heldCellsUnchanged": 60,
    "testsBuildsScansCI": False,
    "workflowFilesChanged": False,
    "nativeSpeakerApproval": False,
    "headedBrowserAcceptance": False
}, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({
    "appliedChanges": len(apply_rows),
    "alreadyAppliedOnRerun": already_applied,
    "reviewedCells": len(final_readback),
    "dispositions": dict(counts),
    "readbackMismatches": 0
}, ensure_ascii=False))
