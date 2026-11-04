#!/usr/bin/env python3
import hashlib
import json
import pathlib
import subprocess
from collections import Counter

repo = pathlib.Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source")
primary = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-primary-20261104")
cross = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-cross-20261104")
out = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-apply-20261104/application")
pin = "a456dd66aad34cb23f432cb3c189bb8083bbbe96"
tree = "7a5447e5f08e84c392899a6e1400d1df73b1143b"

def stop(message):
    raise SystemExit("GUARD FAILED: " + message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def git(*args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()

def git_blob(path):
    return subprocess.check_output(["git", "-C", str(repo), "hash-object", str(path)], text=True).strip()

if git("rev-parse", "HEAD") != pin:
    stop("source worktree HEAD differs from pinned PR head")
if git("rev-parse", "HEAD^{tree}") != tree:
    stop("source worktree tree differs from pin")
if git("status", "--porcelain"):
    stop("source worktree is not clean before application")

target_cells = read_jsonl(primary / "candidate-free-input/current-target-cells.jsonl")
cross_cells = read_jsonl(cross / "cross-review-cells.jsonl")
selected = read_jsonl(cross / "selected-proposals.jsonl")
holds = read_jsonl(cross / "hash-only-holds.jsonl")
if len(target_cells) != 240 or len(cross_cells) != 240:
    stop("expected 240 target and cross-review cells")
key = lambda row: (row["position"], row["locale"])
target_by_key = {key(row): row for row in target_cells}
cross_by_key = {key(row): row for row in cross_cells}
selected_by_key = {key(row): row for row in selected}
hold_by_key = {key(row): row for row in holds}
if len(target_by_key) != 240 or len(cross_by_key) != 240:
    stop("duplicate source-position/locale record")
if len(selected_by_key) != len(selected) or len(hold_by_key) != len(holds):
    stop("duplicate selected or held record")
if set(target_by_key) != set(cross_by_key):
    stop("candidate-free and cross cell sets differ")

counts = Counter(row["crossDisposition"] for row in cross_cells)
if counts != Counter({"KEEP_CURRENT": 218, "SELECT_UPDATE": 10, "HOLD_HASH_ONLY": 12}):
    stop("unexpected cross disposition counts: " + repr(counts))
if len(selected) != 10 or len(holds) != 12:
    stop("selected update or hash-only hold count differs")
if set(selected_by_key) != {key(row) for row in cross_cells if row["crossDisposition"] == "SELECT_UPDATE"}:
    stop("selected proposal keys do not match cross dispositions")
if set(hold_by_key) != {key(row) for row in cross_cells if row["crossDisposition"] == "HOLD_HASH_ONLY"}:
    stop("hash-only hold keys do not match cross dispositions")

catalog_paths = sorted({row["catalogPath"] for row in target_cells})
catalogs = {}
pre_catalogs = []
for rel in catalog_paths:
    path = repo / rel
    raw = path.read_bytes()
    rows = [row for row in target_cells if row["catalogPath"] == rel]
    if any(row["catalogFileSha256"] != sha(raw) for row in rows):
        stop("catalog preimage SHA differs from packet: " + rel)
    if any(row["catalogGitBlob"] != git_blob(path) for row in rows):
        stop("catalog preimage Git blob differs from packet: " + rel)
    data = json.loads(raw.decode("utf-8"))
    if (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8") != raw:
        stop("catalog formatting would change on serialization: " + rel)
    original = json.loads(raw.decode("utf-8"))
    pre_catalogs.append({
        "path": rel,
        "sha256": sha(raw),
        "gitBlob": git_blob(path),
        "keyCount": len(data),
        "keyOrderSha256": sha(json.dumps(list(data.keys()), ensure_ascii=False, separators=(",", ":")).encode("utf-8")),
    })
    catalogs[rel] = {"path": path, "raw": raw, "data": data, "original": original, "keyOrder": list(data.keys()), "preBlob": git_blob(path)}

readback = []
for row in target_cells:
    k = key(row)
    cross_row = cross_by_key[k]
    rel = row["catalogPath"]
    data = catalogs[rel]["data"]
    source_id = row["sourceId"]
    if row["sourceIdSha256"] != cross_row["sourceIdSha256"]:
        stop("source identity mismatch at " + repr(k))
    if source_id not in data:
        stop("missing target key " + source_id)
    current = data[source_id]
    current_hash = sha(current.encode("utf-8"))
    if current_hash != row["currentTargetSha256"] or current_hash != cross_row["currentTargetSha256"]:
        stop("current target hash mismatch at " + repr(k))
    if cross_row["crossDisposition"] == "SELECT_UPDATE":
        proposal = selected_by_key[k]
        if current != proposal["currentTarget"] or current_hash != proposal["currentTargetSha256"]:
            stop("selected proposal preimage mismatch at " + repr(k))
        target_value = proposal["target"]
        target_hash = sha(target_value.encode("utf-8"))
        if target_hash != proposal["targetSha256"]:
            stop("selected target hash mismatch at " + repr(k))
        checks = proposal["tokenChecks"]
        if not all(check.get("matches") for check in checks.values()):
            stop("selected target token check failed at " + repr(k))
        if any(literal not in target_value for literal in proposal["sourceTokens"]["protectedLiterals"]):
            stop("selected target omitted protected literal at " + repr(k))
        data[source_id] = target_value
        expected_hash = target_hash
        applied = True
    elif cross_row["crossDisposition"] == "HOLD_HASH_ONLY":
        hold = hold_by_key[k]
        if current_hash != hold["currentTargetSha256"]:
            stop("hold hash differs from sealed hold at " + repr(k))
        expected_hash = current_hash
        applied = False
    else:
        if cross_row["crossDisposition"] != "KEEP_CURRENT":
            stop("unknown cross disposition at " + repr(k))
        expected_hash = current_hash
        applied = False
    readback.append({
        "position": row["position"],
        "sourceId": source_id,
        "sourceIdSha256": row["sourceIdSha256"],
        "locale": row["locale"],
        "catalogPath": rel,
        "crossDisposition": cross_row["crossDisposition"],
        "preimageTargetSha256": current_hash,
        "selectedTargetSha256": expected_hash if applied else None,
        "postimageTargetSha256": expected_hash,
        "postimageMatchesPlan": True,
        "protectedLiteralsPreserved": True,
    })

readback_by_key = {key(row): row for row in readback}

# No source or target changes are written until every pinned input is validated.
for rel, entry in catalogs.items():
    if list(entry["data"].keys()) != entry["keyOrder"]:
        stop("catalog key order changed in planned output: " + rel)
    for row in target_cells:
        if row["catalogPath"] != rel:
            continue
        k = key(row)
        after_value = entry["data"][row["sourceId"]]
        if sha(after_value.encode("utf-8")) != readback_by_key[k]["postimageTargetSha256"]:
            stop("planned value hash mismatch at " + repr(k))
    for name, value in entry["original"].items():
        selected_keys = {row["sourceId"] for row in selected if row["catalogPath"] == rel}
        if name not in selected_keys and entry["data"][name] != value:
            stop("unselected catalog key changed: " + rel + ":" + name)

out.mkdir(parents=True, exist_ok=True)
changed_by_locale = Counter()
for row in selected:
    changed_by_locale[row["locale"]] += 1
for rel, entry in catalogs.items():
    rendered = (json.dumps(entry["data"], ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    entry["path"].write_bytes(rendered)

# Read back every target cell after writing.
post_catalogs = []
post_by_key = {}
for rel, entry in catalogs.items():
    raw = entry["path"].read_bytes()
    data = json.loads(raw.decode("utf-8"))
    if list(data.keys()) != entry["keyOrder"]:
        stop("readback catalog key order differs: " + rel)
    post_catalogs.append({
        "path": rel,
        "preSha256": sha(entry["raw"]),
        "preGitBlob": entry["preBlob"],
        "postSha256": sha(raw),
        "postGitBlob": git_blob(entry["path"]),
        "keyCount": len(data),
    })
    entry["post"] = data
for row in target_cells:
    k = key(row)
    cross_row = cross_by_key[k]
    expected = selected_by_key[k]["target"] if k in selected_by_key else row["currentTarget"]
    actual = catalogs[row["catalogPath"]]["post"][row["sourceId"]]
    if actual != expected:
        stop("application readback value mismatch at " + repr(k))
    post_hash = sha(actual.encode("utf-8"))
    if post_hash != readback_by_key[k]["postimageTargetSha256"]:
        stop("application readback hash mismatch at " + repr(k))
    if cross_row["crossDisposition"] == "HOLD_HASH_ONLY" and actual != row["currentTarget"]:
        stop("held value changed at " + repr(k))

(out / "application-readback.jsonl").write_text(
    "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in readback),
    encoding="utf-8",
)
(out / "catalog-preimages.json").write_text(json.dumps(pre_catalogs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(out / "catalog-postimages.json").write_text(json.dumps(post_catalogs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
summary = {
    "artifact": "SeerrNG PR #418 W3960-W3979 exact application readback",
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "window": "W3960-W3979",
    "baseHead": pin,
    "baseTree": tree,
    "sourceCount": 20,
    "localeCount": 12,
    "cellCount": 240,
    "appliedUpdates": len(selected),
    "retainedCurrent": counts["KEEP_CURRENT"],
    "heldHashOnly": len(holds),
    "changesByLocale": dict(sorted(changed_by_locale.items())),
    "readbackMatches": len(readback),
    "catalogPathsChanged": sorted({row["catalogPath"] for row in selected}),
    "keyOrdersPreserved": True,
    "unselectedValuesPreserved": True,
    "protectedLiteralTokenCheckFailures": 0,
    "testsBuildsScansCI": False,
    "workflowsChanged": False,
    "browserAcceptance": False,
    "nativeSpeakerApproval": False,
}
(out / "application-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
