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
manifest_path = Path(__file__).resolve().parent / "root-application-manifest.json"
expected_head = "77d30ae742aad7245e6e419237fca6a544531e1f"

def git(*args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

head = git("rev-parse", "HEAD")
if head != expected_head:
    raise SystemExit(f"unexpected head: {head}")
pins = json.loads((input_dir / "catalog-file-pins.json").read_text(encoding="utf-8"))["catalogs"]
ledger = [json.loads(line) for line in ledger_path.read_text(encoding="utf-8").splitlines() if line]
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if len(ledger) != 240 or len(manifest["changedCells"]) != 62:
    raise SystemExit("wrong ledger/manifest counts")
expected_paths = set()
for locale, pin in pins.items():
    if locale == "en":
        continue
    path = repo / pin["path"]
    after_bytes = path.read_bytes()
    actual = json.loads(after_bytes.decode("utf-8"))
    before_bytes = subprocess.check_output(["git", "-C", str(repo), "show", f"{expected_head}:{pin['path']}"])
    before = json.loads(before_bytes.decode("utf-8"))
    rows = [r for r in ledger if r["locale"] == locale]
    if len(rows) != 20:
        raise SystemExit(f"wrong cell count for {locale}: {len(rows)}")
    changed_keys = {r["sourceId"] for r in rows if r["rootTarget"] != r.get("currentTarget")}
    expected_paths.add(pin["path"])
    for row in rows:
        key = row["sourceId"]
        if key not in actual or actual[key] != row["rootTarget"]:
            raise SystemExit(f"readback mismatch {locale}:{key}")
        if sha(actual[key].encode("utf-8")) != hashlib.sha256(row["rootTarget"].encode("utf-8")).hexdigest():
            raise SystemExit(f"target hash mismatch {locale}:{key}")
    if set(actual) != set(before) | (changed_keys - set(before)):
        raise SystemExit(f"catalog key set mismatch {locale}")
    for key in set(before) - changed_keys:
        if actual[key] != before[key]:
            raise SystemExit(f"unintended value change {locale}:{key}")
    before_order = list(before)
    filtered_after = [key for key in actual if key in before]
    if filtered_after != before_order:
        raise SystemExit(f"existing key order changed {locale}")
    if sha(after_bytes) != manifest["catalogs"][locale]["afterSha256"]:
        raise SystemExit(f"catalog output hash mismatch {locale}")

changed = git("diff", "--name-only").splitlines()
if set(changed) != expected_paths:
    raise SystemExit(f"changed path mismatch: {changed}")
if len(changed) != 12:
    raise SystemExit(f"expected 12 locale catalogs, got {len(changed)}")
print("PASS: 240 exact cells read back; 62 changed, 178 retained; 12 catalogs only; existing catalog values and relative key order preserved")
