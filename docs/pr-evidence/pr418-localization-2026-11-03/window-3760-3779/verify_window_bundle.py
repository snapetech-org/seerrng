#!/usr/bin/env python3
"""Verify the portable SeerrNG W3760-W3779 evidence window."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

W = Path(__file__).resolve().parent
R = W.parents[3]
BASE = "d317a07ea0e5456b6d4660470c57d1f205cd0587"
CATALOG = "61bc396b1bb4d79a96b5dedcf294fa44d3eeeb75"
CATALOG_TREE = "6ef5db45f9ddf444e056aabcfde5bcbe1d2623f7"

def die(message):
    raise SystemExit("FAIL: " + message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def run_git(*args):
    return subprocess.check_output(["git", "-C", str(R), *args])

def read_sums(root, sums_path):
    listed = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split("  ", 1)
        if name in listed:
            die("duplicate checksum entry " + name)
        listed[name] = digest
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p != sums_path}
    if set(listed) != actual:
        die("checksum file inventory mismatch in " + str(root))
    for name, digest in listed.items():
        if sha((root / name).read_bytes()) != digest:
            die("checksum mismatch " + str(root / name))
    return listed

allow = "--allow-uncommitted" in sys.argv
sums = W / "SHA256SUMS.txt"
root_sums = read_sums(W, sums)
manifest = json.loads((W / "manifest.json").read_text(encoding="utf-8"))
files = manifest["files"]
actual_without_manifest = set(root_sums) - {"manifest.json"}
if set(files) != actual_without_manifest:
    die("root manifest file inventory")
for name, metadata in files.items():
    raw = (W / name).read_bytes()
    if len(raw) != metadata["bytes"] or sha(raw) != metadata["sha256"]:
        die("root manifest file pin " + name)
if manifest["baselineHead"] != BASE or manifest["catalogCommit"] != CATALOG or manifest["catalogTree"] != CATALOG_TREE:
    die("window manifest commit pins")
if manifest["window"] != "W3760-W3779" or manifest["cellCount"] != 240 or manifest["selectedChanges"] != 12:
    die("window manifest coverage")

# All embedded packet checksums must match their exact file inventory.
for packet_name in ("candidate-free-input", "primary-review", "blind-review", "cross-audit"):
    packet = W / packet_name
    read_sums(packet, packet / "SHA256SUMS.txt")

cross = W / "cross-audit"
subprocess.run([sys.executable, str(cross / "verify-cross.py")], cwd=cross, check=True)
application = W / "application"
app = subprocess.run([sys.executable, str(application / "verify_application.py")], cwd=R, text=True, capture_output=True)
if app.returncode:
    die("application verifier: " + app.stdout + app.stderr)

head = run_git("rev-parse", "HEAD").decode().strip()
window_rel = W.relative_to(R).as_posix()
if allow:
    if head != CATALOG:
        die("uncommitted evidence mode must run at the catalog commit")
    status = run_git("status", "--porcelain", "--untracked-files=all").decode().splitlines()
    if any(line and not line[3:].startswith(window_rel + "/") for line in status):
        die("uncommitted changes outside evidence window")
    committed = "PENDING"
else:
    status = run_git("status", "--porcelain", "--untracked-files=all").decode()
    if status:
        die("repository is not clean")
    tracked = {line.decode() for line in run_git("ls-tree", "-r", "--name-only", head, "--", window_rel).splitlines()}
    expected = {f"{window_rel}/{name}" for name in root_sums} | {f"{window_rel}/SHA256SUMS.txt"}
    if tracked != expected:
        die("committed evidence path inventory")
    for path in expected:
        if run_git("show", f"{head}:{path}") != (R / path).read_bytes():
            die("committed evidence blob " + path)
    committed = "PASS"

print(json.dumps({
    "result": "PASS",
    "head": head,
    "windowFiles": len(root_sums) + 1,
    "manifestFiles": len(files),
    "reviewInputs": {"candidateFree": "PASS", "primary": "PASS", "blind": "PASS", "cross": "PASS"},
    "crossAuditVerifier": "PASS",
    "applicationVerifier": "PASS",
    "committedEvidenceBlobs": committed,
    "checksummedFiles": len(root_sums),
}, indent=2))
