import collections
import hashlib
import json
import pathlib
import re
import subprocess

REPO = pathlib.Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3860-3879-input")
CROSS = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3860-3879-cross-20261104")
INPUT = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3860-3879-primary-20261104/candidate-free-input")
OUT = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3860-3879-application-20261104")
PIN = "12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e"
TREE = "b288494aa5a0842affc4e900d6ccb6b57d99c493"
EXPECTED_CHANGELOG_BULLET = "- **Localization:** Updated 36 reviewed Navidrome and Apprise settings translations across the 12 target locales."

def abort(message):
    raise SystemExit("GUARD FAILED: " + message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def jlines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def git(*args):
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()

def git_blob(path):
    return subprocess.check_output(["git", "-C", str(REPO), "hash-object", str(path)], text=True).strip()

def token_groups(value):
    return {
        "placeholders": re.findall(r"\{[^{}]+\}", value),
        "markupTags": re.findall(r"</?([A-Za-z][A-Za-z0-9]*)\b[^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)*(?![A-Za-z])", value),
    }

if git("rev-parse", "HEAD") != PIN:
    abort("worktree HEAD differs from pinned PR input")
if git("rev-parse", "HEAD^{tree}") != TREE:
    abort("worktree tree differs from pinned PR input")
if git("status", "--porcelain", "--untracked-files=all"):
    abort("worktree must be clean before applying")

cross_rows = jlines(CROSS / "cross-ledger.jsonl")
current_rows = jlines(INPUT / "current-target-cells.jsonl")
source_rows = jlines(INPUT / "selected-source-cells.jsonl")
if len(cross_rows) != 240 or len(current_rows) != 240 or len(source_rows) != 20:
    abort("unexpected cross/current/source record count")
cross_by_cell = {(r["position"], r["locale"]): r for r in cross_rows}
current_by_cell = {(r["position"], r["locale"]): r for r in current_rows}
if len(cross_by_cell) != 240 or len(current_by_cell) != 240:
    abort("duplicate cell records")
if set(cross_by_cell) != set(current_by_cell):
    abort("cross/current cell set mismatch")
if {r["position"] for r in current_rows} != set(range(3860, 3880)):
    abort("source positions differ from W3860-W3879")
if collections.Counter(r["locale"] for r in current_rows) != collections.Counter({locale: 20 for locale in {r["locale"] for r in current_rows}}):
    abort("unexpected per-locale cell count")

pins = json.loads((INPUT / "catalog-file-pins.json").read_text(encoding="utf-8"))["catalogFiles"]
target_locales = sorted({r["locale"] for r in current_rows})
if len(target_locales) != 12:
    abort("expected twelve target locales")
if set(target_locales) != {"es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"}:
    abort("target locale set differs from the rollout scope")

source_by_id = {r["sourceId"]: r for r in source_rows}
if len(source_by_id) != 20:
    abort("duplicate source records")
decision_counts = collections.Counter(r["decision"] for r in cross_rows)
if decision_counts != collections.Counter({
    "keep-current": 204,
    "select-blind-proposal": 26,
    "select-agreed-proposal": 7,
    "select-primary-proposal": 3,
}):
    abort("cross decision counts differ from sealed summary")
english_path = REPO / pins["en"]["path"]
english_raw = english_path.read_bytes()
if sha(english_raw) != pins["en"]["sha256"] or git_blob(english_path) != pins["en"]["gitBlob"]:
    abort("English catalog differs from pinned source")
english = json.loads(english_raw)
for source_id, row in source_by_id.items():
    if english.get(source_id) != row["sourceText"]:
        abort("English source value differs for " + source_id)
    if sha(english[source_id].encode("utf-8")) != row["sourceTextSha256"]:
        abort("English source hash differs for " + source_id)

selected = []
for key, cross in cross_by_cell.items():
    current = current_by_cell[key]
    for field in ("sourceId", "sourceIdSha256", "sourceTextSha256", "currentTargetSha256", "callerContextSha256"):
        if cross.get(field) != current.get(field):
            abort("cross/input linkage mismatch at " + str(key) + ": " + field)
    if sha(cross["sourceId"].encode("utf-8")) != cross["sourceIdSha256"]:
        abort("source ID hash mismatch at " + str(key))
    source = source_by_id.get(cross["sourceId"])
    if not source or cross["sourceText"] != source["sourceText"] or cross["sourceTextSha256"] != source["sourceTextSha256"]:
        abort("cross/source input mismatch at " + str(key))
    if cross.get("currentTarget") != current.get("currentTarget"):
        abort("current target text mismatch at " + str(key))
    if sha(cross["selectedTarget"].encode("utf-8")) != cross["selectedTargetSha256"]:
        abort("selected target hash mismatch at " + str(key))
    changed = cross["selectedTargetSha256"] != current["currentTargetSha256"]
    if changed:
        if not cross.get("selectedProposalSources"):
            abort("changed cell has no selected proposal source at " + str(key))
        selected.append(cross)
    elif cross["selectedTarget"] != current["currentTarget"]:
        abort("unchanged cell target text mismatch at " + str(key))
if len(selected) != 36:
    abort("expected exactly 36 selected target changes")
if len(cross_rows) - len(selected) != 204:
    abort("expected exactly 204 retained targets")
if any(r.get("hold") for r in cross_rows):
    abort("unexpected new hold in cross ledger")

files = {}
preimages = []
for locale in target_locales:
    pin = pins.get(locale)
    if not pin:
        abort("missing locale catalog pin: " + locale)
    rel = pin["path"]
    path = REPO / rel
    raw = path.read_bytes()
    if sha(raw) != pin["sha256"] or git_blob(path) != pin["gitBlob"]:
        abort("catalog preimage differs from pin: " + rel)
    data = json.loads(raw.decode("utf-8"))
    rendered_before = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if rendered_before.encode("utf-8") != raw:
        abort("catalog formatting would change on JSON round trip: " + rel)
    if len(data) != pin["keyCount"]:
        abort("catalog key count differs from pin: " + rel)
    key_sequence_hash = sha("\n".join(data.keys()).encode("utf-8"))
    if key_sequence_hash != pin["keySequenceSha256"]:
        abort("catalog key order differs from pin: " + rel)
    key_set_hash = sha("\n".join(sorted(data.keys())).encode("utf-8"))
    if key_set_hash != pin["sortedKeySetSha256"]:
        abort("catalog key set differs from pin: " + rel)
    relevant_current = [r for r in current_rows if r["locale"] == locale]
    relevant_cross = [cross_by_cell[(r["position"], r["locale"])] for r in relevant_current]
    for current, cross in zip(relevant_current, relevant_cross):
        if current["catalogPath"] != rel or current["catalogSha256"] != pin["sha256"] or current["catalogGitBlob"] != pin["gitBlob"]:
            abort("cell catalog pin mismatch for " + str((current["position"], locale)))
        source_id = current["sourceId"]
        if source_id not in data:
            abort("catalog key missing: " + source_id + " in " + rel)
        existing = data[source_id]
        if existing != current["currentTarget"] or sha(existing.encode("utf-8")) != current["currentTargetSha256"]:
            abort("catalog target differs from pinned current value: " + source_id + "/" + locale)
        tokens = current["sourceTokens"]
        target = cross["selectedTarget"]
        actual = token_groups(target)
        for group in ("placeholders", "markupTags", "numericTokens"):
            if actual[group] != tokens[group]:
                abort("selected target token mismatch: " + source_id + "/" + locale + "/" + group)
        if any(literal not in target for literal in tokens["protectedLiterals"]):
            abort("selected target omits protected literal: " + source_id + "/" + locale)
    files[rel] = {
        "path": path,
        "raw": raw,
        "data": data,
        "keyOrder": list(data.keys()),
        "preSha256": sha(raw),
        "preGitBlob": git_blob(path),
        "updates": [r for r in selected if r["locale"] == locale],
        "cells": relevant_current,
    }
    preimages.append({
        "locale": locale,
        "path": rel,
        "sha256": sha(raw),
        "gitBlob": git_blob(path),
        "keyCount": len(data),
        "keySequenceSha256": key_sequence_hash,
    })

changed_by_locale = collections.Counter()
readback = []
for cross in selected:
    current = current_by_cell[(cross["position"], cross["locale"])]
    rel = pins[cross["locale"]]["path"]
    data = files[rel]["data"]
    data[cross["sourceId"]] = cross["selectedTarget"]
    changed_by_locale[cross["locale"]] += 1

changelog = REPO / "CHANGELOG.md"
changelog_raw = changelog.read_bytes()
changelog_text = changelog_raw.decode("utf-8")
if changelog_text.count("## [Unreleased]") != 1:
    abort("expected exactly one Unreleased changelog section")
unreleased_start = changelog_text.index("## [Unreleased]")
next_section = changelog_text.find("\n## [", unreleased_start + len("## [Unreleased]"))
if next_section < 0:
    next_section = len(changelog_text)
unreleased = changelog_text[unreleased_start:next_section]
if EXPECTED_CHANGELOG_BULLET in unreleased:
    abort("localization changelog bullet already exists")
fixed_heading = "#### Fixed\n\n"
if unreleased.count(fixed_heading) != 1:
    abort("expected one Fixed subsection in Unreleased")
insert_at = unreleased_start + unreleased.index(fixed_heading) + len(fixed_heading)
changelog_after = changelog_text[:insert_at] + EXPECTED_CHANGELOG_BULLET + "\n" + changelog_text[insert_at:]
if changelog_after.count(EXPECTED_CHANGELOG_BULLET) != 1:
    abort("changelog bullet was not inserted exactly once")

for rel, entry in files.items():
    rendered = json.dumps(entry["data"], ensure_ascii=False, indent=2) + "\n"
    (REPO / rel).write_text(rendered, encoding="utf-8", newline="\n")

changelog.write_text(changelog_after, encoding="utf-8", newline="\n")

for current in current_rows:
    cross = cross_by_cell[(current["position"], current["locale"])]
    rel = pins[current["locale"]]["path"]
    after = files[rel]["data"][current["sourceId"]]
    if after != cross["selectedTarget"] or sha(after.encode("utf-8")) != cross["selectedTargetSha256"]:
        abort("readback target mismatch at " + str((current["position"], current["locale"])))
    tokens = token_groups(after)
    source_tokens = current["sourceTokens"]
    protected_ok = all(literal in after for literal in source_tokens["protectedLiterals"])
    if any(tokens[k] != source_tokens[k] for k in ("placeholders", "markupTags", "numericTokens")) or not protected_ok:
        abort("readback token mismatch at " + str((current["position"], current["locale"])))
    readback.append({
        "position": current["position"],
        "sourceId": current["sourceId"],
        "locale": current["locale"],
        "path": rel,
        "disposition": cross["decision"],
        "selectedProposalSources": cross["selectedProposalSources"],
        "beforeSha256": current["currentTargetSha256"],
        "afterValue": after,
        "afterSha256": sha(after.encode("utf-8")),
        "changed": current["currentTargetSha256"] != cross["selectedTargetSha256"],
        "placeholdersPreserved": True,
        "markupPreserved": True,
        "numericTokensPreserved": True,
        "protectedLiteralsPreserved": protected_ok,
    })

if len(readback) != 240 or sum(r["changed"] for r in readback) != 36:
    abort("readback count mismatch")

postimages = []
for rel, entry in files.items():
    path = entry["path"]
    after_raw = path.read_bytes()
    after = json.loads(after_raw.decode("utf-8"))
    if list(after.keys()) != entry["keyOrder"] or set(after) != set(entry["data"]):
        abort("catalog structure changed: " + rel)
    changed_keys = {r["sourceId"] for r in entry["updates"]}
    for key, value in entry["data"].items():
        if key not in changed_keys and after[key] != value:
            abort("unselected key changed: " + rel + ":" + key)
    postimages.append({
        "path": rel,
        "preSha256": entry["preSha256"],
        "preGitBlob": entry["preGitBlob"],
        "postSha256": sha(after_raw),
        "postGitBlob": git_blob(path),
        "keyCount": len(after),
        "changedCells": len(entry["updates"]),
    })

if changelog.read_text(encoding="utf-8") != changelog_after:
    abort("changelog readback mismatch")

changed_paths = subprocess.check_output(
    ["git", "-C", str(REPO), "diff", "--name-only", "HEAD"], text=True
).splitlines()
expected_paths = sorted(["CHANGELOG.md", *files.keys()])
if sorted(changed_paths) != expected_paths:
    abort("unexpected changed path set: " + repr(sorted(changed_paths)))

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "application-readback.jsonl").write_text(
    "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in readback),
    encoding="utf-8",
)
summary = {
    "schemaVersion": 1,
    "pullRequest": 418,
    "window": "W3860-W3879",
    "inputHead": PIN,
    "inputTree": TREE,
    "sourceCount": 20,
    "localeCount": 12,
    "cellCount": 240,
    "selectedUpdates": 36,
    "retainedCurrent": 204,
    "newHolds": 0,
    "priorHashOnlyHoldsPreserved": 14,
    "changedCellsByLocale": dict(sorted(changed_by_locale.items())),
    "catalogPreimages": preimages,
    "catalogPostimages": postimages,
    "englishSourceCatalogSha256": sha(english_raw),
    "englishSourceCatalogGitBlob": git_blob(english_path),
    "changelogSha256Before": sha(changelog_raw),
    "changelogSha256After": sha(changelog.read_bytes()),
    "changelogEntry": EXPECTED_CHANGELOG_BULLET,
    "readbackCells": len(readback),
    "placeholderMarkupNumericMismatches": 0,
    "protectedLiteralMismatches": 0,
    "releaseCreated": False,
    "workflowPathsChanged": 0,
    "testsBuildsScansCiRun": False,
    "browserOrNativeSignoffClaimed": False,
}
(OUT / "application-summary.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
(OUT / "catalog-preimages.json").write_text(
    json.dumps(preimages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps({
    "result": "PASS",
    "cells": 240,
    "selectedUpdates": 36,
    "retainedCurrent": 204,
    "holds": 0,
    "changedByLocale": dict(sorted(changed_by_locale.items())),
    "readback": len(readback),
    "tokenMismatches": 0,
    "protectedLiteralMismatches": 0,
    "catalogs": len(files),
    "changelogEntry": EXPECTED_CHANGELOG_BULLET,
}, ensure_ascii=False))
