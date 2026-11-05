import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--repo", required=True, type=Path)
args = parser.parse_args()
repo = args.repo.resolve()
root = Path(__file__).resolve().parent.parent
input_dir = root / "candidate-free"
ledger_path = Path(__file__).resolve().parent / "root-adjudication.jsonl"
expected_head = "77d30ae742aad7245e6e419237fca6a544531e1f"
expected_tree = "2c6fe4a0c1c33aa56b01f06a70702f68598509a7"

def git(*args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

head = git("rev-parse", "HEAD")
tree = git("rev-parse", "HEAD^{tree}")
if (head, tree) != (expected_head, expected_tree):
    raise SystemExit(f"wrong entry ref: {head} / {tree}")
status = git("status", "--porcelain")
if status:
    raise SystemExit(f"worktree is not clean:\n{status}")

pins = json.loads((input_dir / "catalog-file-pins.json").read_text(encoding="utf-8"))["catalogs"]
english = json.loads((repo / pins["en"]["path"]).read_text(encoding="utf-8"))
english_order = {key: index for index, key in enumerate(english)}
ledger = [json.loads(line) for line in ledger_path.read_text(encoding="utf-8").splitlines() if line]
if len(ledger) != 240:
    raise SystemExit(f"expected 240 adjudications, got {len(ledger)}")

by_locale = {}
for row in ledger:
    locale = row["locale"]
    source_id = row["sourceId"]
    if source_id not in english_order:
        raise SystemExit(f"source missing from en catalog: {source_id}")
    by_locale.setdefault(locale, []).append(row)
if set(by_locale) != {locale for locale in pins if locale != "en"}:
    raise SystemExit(f"locale set mismatch: {sorted(by_locale)}")

manifest = {
    "application": "SeerrNG",
    "pr": 418,
    "entryHead": head,
    "entryTree": tree,
    "candidateFreeManifestSha256": sha((input_dir / "manifest.json").read_bytes()),
    "crossReviewManifestSha256": sha((root / "cross-review" / "manifest.json").read_bytes()),
    "rootAdjudicationSha256": sha(ledger_path.read_bytes()),
    "changedCells": [],
    "catalogs": {},
}

for locale, rows in sorted(by_locale.items()):
    pin = pins[locale]
    path = repo / pin["path"]
    before_bytes = path.read_bytes()
    if sha(before_bytes) != pin["sha256"]:
        raise SystemExit(f"catalog preimage mismatch for {locale}")
    if git("hash-object", pin["path"]) != pin["gitBlob"]:
        raise SystemExit(f"catalog Git blob mismatch for {locale}")
    data = json.loads(before_bytes.decode("utf-8"))
    existing_order = list(data)
    additions = []
    file_cells = []
    for row in rows:
        key = row["sourceId"]
        current = data.get(key)
        if key in data:
            if row.get("currentTarget") != current:
                raise SystemExit(f"current target mismatch {locale}:{key}")
            if row.get("currentTargetSha256") != sha(current.encode("utf-8")):
                raise SystemExit(f"current target hash mismatch {locale}:{key}")
        else:
            if row.get("currentTarget") is not None or row.get("currentTargetSha256") is not None:
                raise SystemExit(f"expected an absent current target {locale}:{key}")
            additions.append(key)
        target = row["rootTarget"]
        if not isinstance(target, str) or not target.strip():
            raise SystemExit(f"empty root target {locale}:{key}")
        if target != current:
            file_cells.append({
                "cellId": row["cellId"],
                "sourceId": key,
                "locale": locale,
                "rootDisposition": row["rootDisposition"],
                "rootTarget": target,
                "rootTargetSha256": sha(target.encode("utf-8")),
                "currentTarget": current,
                "currentTargetSha256": row.get("currentTargetSha256"),
                "sourceTextSha256": row["sourceTextSha256"],
                "rootOverride": row.get("rootOverride"),
            })
        data[key] = target
    # New keys are inserted at the corresponding source order in en.json, preserving every existing relative position.
    for key in sorted(additions, key=lambda k: english_order[k]):
        key_index = english_order[key]
        insertion = next((i for i, old_key in enumerate(data) if old_key != key and english_order.get(old_key, -1) > key_index), len(data) - 1)
        items = list(data.items())
        item = items.pop(next(i for i, pair in enumerate(items) if pair[0] == key))
        items.insert(insertion, item)
        data = dict(items)
    after_bytes = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.write_bytes(after_bytes)
    manifest["catalogs"][locale] = {
        "path": pin["path"],
        "beforeSha256": sha(before_bytes),
        "afterSha256": sha(after_bytes),
        "beforeGitBlob": pin["gitBlob"],
        "addedKeys": additions,
        "changedCellCount": len(file_cells),
        "keyCountBefore": len(existing_order),
        "keyCountAfter": len(data),
    }
    manifest["changedCells"].extend(file_cells)

if len(manifest["changedCells"]) != 62:
    raise SystemExit(f"expected 62 catalog cell updates/additions, got {len(manifest['changedCells'])}")
manifest["changedCellCount"] = len(manifest["changedCells"])
manifest["retainedCurrentCellCount"] = 178
manifest["heldCellCount"] = 0
manifest["resolvedFormerHoldCount"] = 12
manifest["changedTargetCountRecommendedByCrossReview"] = 50
manifest["allCells"] = [
    {"cellId": row["cellId"], "rootDisposition": row["rootDisposition"], "rootTarget": row["rootTarget"], "rootOverride": row.get("rootOverride")}
    for row in ledger
]
manifest_path = Path(__file__).resolve().parent / "root-application-manifest.json"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Applied {manifest['changedCellCount']} cells across {len(by_locale)} locale catalogs; retained 178 unchanged. Entry head/tree verified.")
