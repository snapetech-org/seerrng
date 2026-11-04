#!/usr/bin/env python3
"""Verify the committed W3920-W3939 SeerrNG localization application."""
import argparse
import collections
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent

def fail(message):
    raise SystemExit(f"FAIL: {message}")

def sha(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def read_rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def load_unique(raw, label):
    duplicates = []
    def hook(pairs):
        out = collections.OrderedDict()
        for key, value in pairs:
            if key in out:
                duplicates.append(key)
            out[key] = value
        return out
    result = json.loads(raw.decode("utf-8"), object_pairs_hook=hook)
    if duplicates:
        fail(f"duplicate JSON key in {label}: {duplicates[0]}")
    return result

def git(repo, *args, input_bytes=None):
    return subprocess.check_output(["git", "-C", str(repo), *args], input=input_bytes)

def verify_sums(directory, sums_name):
    sums = directory / sums_name
    expected = {}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        name = name.lstrip(" *")
        path = (directory / name).resolve()
        if directory.resolve() not in path.parents:
            fail(f"checksum path escapes packet: {name}")
        if not path.is_file():
            fail(f"checksum file missing: {name}")
        actual = sha(path.read_bytes())
        if actual != digest:
            fail(f"checksum mismatch: {name}")
        expected[name] = digest
    listed = {p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file() and p != sums}
    if listed != set(expected):
        fail(f"checksum inventory mismatch in {directory.name}")
    return len(expected)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", help="repository worktree; defaults to this packet's enclosing repository")
    args = ap.parse_args()
    repo = pathlib.Path(args.repo).resolve() if args.repo else ROOT.parents[3]
    if git(repo, "rev-parse", "--show-toplevel").decode().strip() != str(repo):
        fail("--repo is not a Git worktree root")
    root_files = verify_sums(ROOT, "SHA256SUMS.txt")
    cross_files = verify_sums(ROOT / "cross-audit", "SHA256SUMS.txt")

    summary = read_json(ROOT / "application-summary.json")
    plan = read_json(ROOT / "cross-audit" / "apply-plan.json")
    pins_doc = read_json(ROOT / "catalog-preimages.json")
    postimages = read_json(ROOT / "catalog-postimages.json")
    if summary["repository"] != "snapetech-org/seerrng" or summary["pullRequest"] != 418:
        fail("repository / PR identity")
    base, product = summary["baseHead"], summary["productCommit"]
    if plan.get("head") != base or plan.get("tree") != summary["baseTree"]:
        fail("cross apply-plan base binding")
    if summary["productTree"] != git(repo, "rev-parse", f"{product}^{{tree}}").decode().strip():
        fail("product tree binding")
    if git(repo, "rev-parse", f"{base}^{{tree}}").decode().strip() != summary["baseTree"]:
        fail("base tree binding")
    parents = git(repo, "show", "-s", "--format=%P", "HEAD").decode().strip().split()
    if parents != [product]:
        fail("evidence commit must have the recorded product commit as its sole parent")
    if git(repo, "status", "--porcelain=v1").decode().strip():
        fail("repository worktree is not clean")

    pins = pins_doc["catalogFiles"]
    if len(pins) != 13 or len(postimages) != 13:
        fail("13-catalog inventory")
    post_by_locale = {r["locale"]: r for r in postimages}
    updates = plan["updates"]
    if len(updates) != 17 or summary["appliedUpdates"] != 17:
        fail("selected update count")
    update_map = {(r["position"], r["locale"]): r for r in updates}
    if len(update_map) != 17:
        fail("duplicate selected update")
    paths = {r["catalogPath"] for r in updates}
    if paths != set(summary["changedCatalogPaths"]) or len(paths) != 9:
        fail("selected catalog path inventory")
    changed = set(git(repo, "diff", "--name-only", base, product).decode().splitlines())
    if changed != paths:
        fail("product commit changed paths outside the nine selected locale catalogs")

    before_by_path, after_by_path = {}, {}
    for locale, pin in pins.items():
        path = pin["path"]
        before_raw = git(repo, "show", f"{base}:{path}")
        after_raw = git(repo, "show", f"{product}:{path}")
        if sha(before_raw) != pin["sha256"] or len(before_raw) != pin["byteCount"]:
            fail(f"preimage bytes {locale}")
        if git(repo, "hash-object", "--stdin", input_bytes=before_raw).decode().strip() != pin["gitBlob"]:
            fail(f"preimage Git blob {locale}")
        before = load_unique(before_raw, f"base {locale}")
        after = load_unique(after_raw, f"product {locale}")
        before_keys, after_keys = list(before), list(after)
        if len(before_keys) != pin["keyCount"] or len(after_keys) != pin["keyCount"]:
            fail(f"catalog key count {locale}")
        seq_hash = sha("\n".join(before_keys))
        set_hash = sha("\n".join(sorted(before_keys)))
        if seq_hash != pin["keySequenceSha256"] or set_hash != pin["sortedKeySetSha256"]:
            fail(f"pinned catalog key sequence/set {locale}")
        if before_keys != after_keys:
            fail(f"catalog key order changed {locale}")
        expected = before.copy()
        for u in updates:
            if u["catalogPath"] != path:
                continue
            old = before[u["sourceId"]]
            if sha(old) != u["expectedCurrentTargetSha256"]:
                fail(f"current-value SHA guard {u['position']} {locale}")
            if sha(u["proposedTarget"]) != u["proposedTargetSha256"]:
                fail(f"proposed-value SHA {u['position']} {locale}")
            if after[u["sourceId"]] != u["proposedTarget"]:
                fail(f"selected target differs from plan {u['position']} {locale}")
            expected[u["sourceId"]] = u["proposedTarget"]
        if list(expected) != after_keys or expected != after:
            fail(f"unselected catalog values changed {locale}")
        post = post_by_locale.get(locale)
        if not post:
            fail(f"postimage absent for {locale}")
        if (post["path"], post["byteCount"], post["sha256"], post["gitBlob"], post["keyCount"], post["keySequenceSha256"], post["sortedKeySetSha256"]) != (
            path, len(after_raw), sha(after_raw), git(repo, "hash-object", "--stdin", input_bytes=after_raw).decode().strip(), len(after_keys), sha("\n".join(after_keys)), sha("\n".join(sorted(after_keys)))):
            fail(f"postimage record {locale}")
        before_by_path[path], after_by_path[path] = before, after

    cross = read_rows(ROOT / "cross-audit" / "cross-ledger.jsonl")
    if len(cross) != 240:
        fail("cross ledger cell count")
    cross_map = {(r["position"], r["locale"]): r for r in cross}
    if len(cross_map) != 240:
        fail("duplicate cross ledger cell")
    holds = read_rows(ROOT / "cross-audit" / "unresolved-holds.jsonl")
    hold_map = {(r["position"], r["locale"]): r for r in holds}
    if len(hold_map) != 4 or len(holds) != 4:
        fail("current hash-only hold count")
    if any(set(r) != {"position","locale","sourceIdSha256","sourceTextSha256","currentTargetSha256","callerContextSha256","holdCode","holdReasonSha256","previousWindow","previousHeldPosition","matchingPriorSourceTextSha256","confidence"} for r in holds):
        fail("current hold records are not hash-only")
    readback = read_rows(ROOT / "application-readback.jsonl")
    rb_map = {(r["position"], r["locale"]): r for r in readback}
    if len(readback) != 240 or len(rb_map) != 240 or set(rb_map) != set(cross_map):
        fail("240-cell readback coverage")
    hold_fields = {"position","locale","catalogPath","sourceIdSha256","sourceTextSha256","currentTargetSha256","finalTargetSha256","callerContextSha256","crossDisposition","holdCode","holdReasonSha256","previousWindow","previousHeldPosition","matchingPriorSourceTextSha256","confidence","readback"}
    for key, cell in cross_map.items():
        row = rb_map[key]
        if row.get("readback") != "PASS" or row.get("crossDisposition") != cell["crossDisposition"]:
            fail(f"readback disposition {key}")
        if (row.get("sourceIdSha256"), row.get("sourceTextSha256"), row.get("currentTargetSha256"), row.get("callerContextSha256")) != (cell["sourceIdSha256"], cell["sourceTextSha256"], cell["currentTargetSha256"], cell["callerContextSha256"]):
            fail(f"readback source/current hash binding {key}")
        if key in hold_map:
            hold = hold_map[key]
            if set(row) != hold_fields or any(row.get(k) != hold.get(k) for k in hold):
                fail(f"hash-only hold record binding {key}")
            if row["crossDisposition"] != "HOLD" or row["finalTargetSha256"] != row["currentTargetSha256"]:
                fail(f"held value changed {key}")
            path = row["catalogPath"]
            before = before_by_path[path]
            after = after_by_path[path]
            matches = [name for name in before if sha(name) == row["sourceIdSha256"]]
            if len(matches) != 1:
                fail(f"hold source ID hash lookup {key}")
            name = matches[0]
            if (sha(before[name]), sha(after[name])) != (row["currentTargetSha256"], row["finalTargetSha256"]):
                fail(f"held target exact hash readback {key}")
            if any(k in row for k in ("sourceId","sourceText","currentTarget","finalTarget","proposedTarget","rationale","reason")):
                fail(f"hold text leaked {key}")
        else:
            if "sourceId" not in row or "currentTarget" not in row or "finalTarget" not in row:
                fail(f"non-held exact readback text missing {key}")
            name, path = row["sourceId"], row["catalogPath"]
            if sha(name) != row["sourceIdSha256"]:
                fail(f"readback source ID hash {key}")
            before = before_by_path[path]
            after = after_by_path[path]
            if name not in before or before[name] != row["currentTarget"] or sha(before[name]) != row["currentTargetSha256"]:
                fail(f"current target readback {key}")
            if after[name] != row["finalTarget"] or sha(after[name]) != row["finalTargetSha256"]:
                fail(f"final target readback {key}")
            update = update_map.get(key)
            if update:
                if row["crossDisposition"] != "SELECT_PROPOSAL" or row["finalTarget"] != update["proposedTarget"] or row["finalTargetSha256"] != update["proposedTargetSha256"]:
                    fail(f"selected proposal readback {key}")
            elif row["finalTarget"] != row["currentTarget"]:
                fail(f"unselected value changed {key}")
    if set(update_map) != {key for key, row in rb_map.items() if row["crossDisposition"] == "SELECT_PROPOSAL"}:
        fail("selected/readback cell set")

    historical_holds = read_rows(ROOT / "cross-audit" / "historical-hold-hashes.jsonl")
    historical_applied = read_rows(ROOT / "cross-audit" / "historical-applied-target-hashes.jsonl")
    if len(historical_holds) != 22 or len(historical_applied) != 197:
        fail("historical hash continuity counts")
    for item in historical_holds + historical_applied:
        forbidden = {"sourceText", "currentTarget", "targetText", "proposedTarget", "rationale"}
        if forbidden & set(item) or item.get("targetTextIncluded") is True:
            fail("historical hash record contains target/source text")
    if summary["crossDispositionCounts"] != {"KEEP":219,"SELECT_PROPOSAL":17,"HOLD":4}:
        fail("summary disposition counts")
    if summary["readbackCells"] != 240 or summary["catalogKeyOrderPreserved"] is not True:
        fail("summary readback/order statement")

    print(json.dumps({"result":"PASS","baseHead":base,"baseTree":summary["baseTree"],"productCommit":product,"evidenceCommit":git(repo,"rev-parse","HEAD").decode().strip(),"cells":240,"selectedUpdates":17,"changedCatalogs":9,"catalogsKeyOrderVerified":13,"currentHashOnlyHolds":4,"historicalHashOnlyHolds":22,"historicalAppliedTargetHashes":197,"readback":"PASS","checksummedFiles":root_files,"crossAuditFiles":cross_files},sort_keys=True))

if __name__ == "__main__":
    main()
