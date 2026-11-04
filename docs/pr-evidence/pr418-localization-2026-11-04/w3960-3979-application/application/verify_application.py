#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import subprocess
from collections import Counter

BASE_HEAD = "a456dd66aad34cb23f432cb3c189bb8083bbbe96"
BASE_TREE = "7a5447e5f08e84c392899a6e1400d1df73b1143b"
EXPECTED_PRODUCT = "cb812bd21cf99964a4a7335830294ebdbdc6df34"

def stop(message):
    raise SystemExit("VERIFY FAILED: " + message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def git(repo, *args, input_bytes=None):
    return subprocess.check_output(["git", "-C", str(repo), *args], input=input_bytes).strip()

def git_raw(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])

parser = argparse.ArgumentParser()
parser.add_argument("--repo", required=True, help="Checkout containing the product and evidence commits")
parser.add_argument("--product-commit", default=EXPECTED_PRODUCT)
args = parser.parse_args()
repo = pathlib.Path(args.repo).resolve()
evidence = pathlib.Path(__file__).resolve().parent.parent
app = evidence / "application"

if git(repo, "rev-parse", BASE_HEAD + "^{tree}").decode() != BASE_TREE:
    stop("review source tree differs from the exact input tree")
if args.product_commit != EXPECTED_PRODUCT:
    stop("unexpected product commit")
if git(repo, "merge-base", "--is-ancestor", args.product_commit, "HEAD") is None:
    stop("product commit is not an ancestor of the evidence checkout")
product_parent = git(repo, "rev-parse", args.product_commit + "^").decode()
if product_parent != BASE_HEAD:
    stop("product commit parent differs from the reviewed input head")

changed = set(git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", args.product_commit).decode().splitlines())
target_cells = read_jsonl(evidence / "candidate-free-input/current-target-cells.jsonl")
cross_cells = read_jsonl(evidence / "cross-review/cross-review-cells.jsonl")
selected = read_jsonl(evidence / "cross-review/selected-proposals.jsonl")
holds = read_jsonl(evidence / "cross-review/hash-only-holds.jsonl")
readback = read_jsonl(app / "application-readback.jsonl")
if not (len(target_cells) == len(cross_cells) == len(readback) == 240):
    stop("expected 240 target, cross, and readback cells")
if len(selected) != 10 or len(holds) != 12:
    stop("selected update or hash-only hold count differs")

key = lambda row: (row["position"], row["locale"])
target_by_key = {key(row): row for row in target_cells}
cross_by_key = {key(row): row for row in cross_cells}
selected_by_key = {key(row): row for row in selected}
hold_by_key = {key(row): row for row in holds}
readback_by_key = {key(row): row for row in readback}
if any(len(mapping) != expected for mapping, expected in [(target_by_key, 240), (cross_by_key, 240), (selected_by_key, 10), (hold_by_key, 12), (readback_by_key, 240)]):
    stop("duplicate cell key")
counts = Counter(row["crossDisposition"] for row in cross_cells)
if counts != Counter({"KEEP_CURRENT": 218, "SELECT_UPDATE": 10, "HOLD_HASH_ONLY": 12}):
    stop("cross disposition counts differ")
if changed != {row["catalogPath"] for row in selected}:
    stop("product commit changed unexpected catalog paths")

preimages = json.loads((app / "catalog-preimages.json").read_text(encoding="utf-8"))
postimages = json.loads((app / "catalog-postimages.json").read_text(encoding="utf-8"))
pre_by_path = {row["path"]: row for row in preimages}
post_by_path = {row["path"]: row for row in postimages}
if set(pre_by_path) != set(post_by_path) or len(pre_by_path) != 12:
    stop("catalog pre/post image sets differ")
for rel, before in pre_by_path.items():
    raw = git_raw(repo, "show", BASE_HEAD + ":" + rel)
    if sha(raw) != before["sha256"] or git(repo, "rev-parse", BASE_HEAD + ":" + rel).decode() != before["gitBlob"]:
        stop("review catalog preimage differs: " + rel)
    before_data = json.loads(raw.decode("utf-8"))
    if len(before_data) != before["keyCount"]:
        stop("review catalog key count differs: " + rel)
    raw_after = git_raw(repo, "show", args.product_commit + ":" + rel)
    if sha(raw_after) != post_by_path[rel]["postSha256"]:
        stop("product catalog postimage differs: " + rel)
    if git(repo, "hash-object", "--stdin", input_bytes=raw_after).decode() != post_by_path[rel]["postGitBlob"]:
        stop("product catalog blob differs: " + rel)
    after_data = json.loads(raw_after.decode("utf-8"))
    if list(before_data.keys()) != list(after_data.keys()) or len(after_data) != before["keyCount"]:
        stop("catalog key order or count changed: " + rel)

for k, row in target_by_key.items():
    cross = cross_by_key[k]
    selected_row = selected_by_key.get(k)
    expected = selected_row["target"] if selected_row else row["currentTarget"]
    product_raw = git(repo, "show", args.product_commit + ":" + row["catalogPath"])
    product_data = json.loads(product_raw.decode("utf-8"))
    actual = product_data[row["sourceId"]]
    actual_hash = sha(actual.encode("utf-8"))
    expected_hash = sha(expected.encode("utf-8"))
    if actual_hash != expected_hash:
        stop("product value differs from selected/readback target at " + repr(k))
    rb = readback_by_key[k]
    if rb["postimageTargetSha256"] != actual_hash or not rb["postimageMatchesPlan"]:
        stop("application readback differs at " + repr(k))
    if cross["crossDisposition"] == "HOLD_HASH_ONLY":
        if row["currentTargetSha256"] != hold_by_key[k]["currentTargetSha256"] or actual_hash != row["currentTargetSha256"]:
            stop("hash-only hold was changed at " + repr(k))

print(json.dumps({
    "result": "PASS",
    "baseHead": BASE_HEAD,
    "productCommit": args.product_commit,
    "cellsReadBack": len(readback),
    "updated": len(selected),
    "retained": counts["KEEP_CURRENT"],
    "hashOnlyHolds": len(holds),
    "catalogs": len(pre_by_path),
    "changedPaths": sorted(changed),
}, ensure_ascii=False))
