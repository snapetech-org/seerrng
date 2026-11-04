#!/usr/bin/env python3
"""Verify the committed W3820-W3839 cross-selected catalog application evidence."""
import hashlib, json, subprocess, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
EVIDENCE=HERE.parent
CROSS=EVIDENCE/"cross-audit"
APP=HERE
BASE="6c489a64782d31fee70a6aeef386c88527b33083"
BASE_TREE="9bbf55986a34e9a2bc0c4027205927df65f8754b"
CATALOG_COMMIT="3786de8f8334c6f69924e2f88e363f129d3b3943"
CATALOG_TREE="b4fbc12bace0fc1ac6a650badc444fe3fa0e8724"
HOLDS={
 ("ar",3828,"components.Settings.MylarModal.compatibilityNote"),
 ("id",3833,"components.Settings.MylarModal.enableSearchHelp"),
}

def fail(msg):
    raise SystemExit("FAIL: "+msg)

def sha(b):
    return hashlib.sha256(b).hexdigest()

def jsonl(p):
    return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]

def git(repo,*args):
    return subprocess.check_output(["git","-C",str(repo),*args])

def check_sums(root, sumfile):
    for line in sumfile.read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        expected, rel = line.split("  ",1)
        p=root/rel
        if not p.is_file() or sha(p.read_bytes())!=expected:
            fail(f"checksum mismatch: {rel}")

repo=Path(git(EVIDENCE,"rev-parse","--show-toplevel").decode().strip())
manifest=json.loads((APP/"application-manifest.json").read_text(encoding="utf-8"))
if manifest["baseHead"]!=BASE or manifest["baseTree"]!=BASE_TREE: fail("pinned base mismatch")
if manifest["catalogCommit"]!=CATALOG_COMMIT or manifest["catalogTree"]!=CATALOG_TREE: fail("catalog commit/tree mismatch")
if git(repo,"rev-parse",CATALOG_COMMIT).decode().strip()!=CATALOG_COMMIT: fail("catalog commit unavailable")
if git(repo,"rev-parse",f"{CATALOG_COMMIT}^").decode().strip()!=BASE: fail("catalog commit parent mismatch")
if git(repo,"rev-parse",f"{CATALOG_COMMIT}^{{tree}}").decode().strip()!=CATALOG_TREE: fail("catalog tree mismatch")
check_sums(APP,APP/"SHA256SUMS.txt")
check_sums(EVIDENCE,EVIDENCE/"SHA256SUMS.txt")
audit=subprocess.run([sys.executable,str(CROSS/"verify-cross-audit.py")],cwd=CROSS,capture_output=True,text=True)
if audit.returncode: fail("cross-audit verifier failed: "+audit.stdout+audit.stderr)
audit_summary=json.loads(audit.stdout)
if audit_summary.get("result")!="PASS" or audit_summary.get("checksumFilesCovered")!=83:
    fail("cross-audit summary mismatch")

ledger=jsonl(CROSS/"cross-audit-ledger.jsonl")
plan=jsonl(APP/"apply-plan.jsonl")
readback=jsonl(APP/"application-readback.jsonl")
if len(ledger)!=240 or len(plan)!=19 or len(readback)!=240: fail("row count mismatch")
keys=lambda r:(r["locale"],r["position"],r["sourceId"])
bykey={keys(r):r for r in ledger}
selected={keys(r):r for r in plan}
actual_rows={keys(r):r for r in readback}
if len(bykey)!=240 or len(selected)!=19 or len(actual_rows)!=240: fail("duplicate cell key")
if set(bykey)!=set(actual_rows): fail("readback cell set mismatch")
if not set(selected).issubset(bykey): fail("selection not in cross ledger")
if set(selected)&HOLDS: fail("a held cell was selected")
for k,p in selected.items():
    row=bykey[k]
    if row["crossAudit"]["disposition"]!="accept-primary-proposal": fail(f"selection disposition mismatch: {k}")
    if p["head"]!=BASE or p["tree"]!=BASE_TREE: fail(f"selection pin mismatch: {k}")
    if row["currentTarget"]!=p["oldValue"] or row["currentTargetSha256"]!=p["oldSha256"]: fail(f"old value/hash guard mismatch: {k}")
    if hashlib.sha256(p["oldValue"].encode()).hexdigest()!=p["oldSha256"]: fail(f"old hash invalid: {k}")
    if row["crossAudit"]["recommendedTarget"]!=p["newValue"] or row["crossAudit"]["recommendedTargetSha256"]!=p["newSha256"]: fail(f"new target mismatch: {k}")
    if hashlib.sha256(p["newValue"].encode()).hexdigest()!=p["newSha256"]: fail(f"new hash invalid: {k}")
    if row["callerEvidence"]["contextSha256"]!=p["callerContextSha256"]: fail(f"caller hash mismatch: {k}")
    if row["sourceTextSha256"]!=p["sourceTextSha256"]: fail(f"source hash mismatch: {k}")

selections=jsonl(APP/"cross-selection.jsonl")
if len(selections)!=19: fail("cross-selection count mismatch")
selection_by_key={keys(r):r for r in selections}
if len(selection_by_key)!=19: fail("duplicate cross-selection cell")
for k,p in selected.items():
    s=selection_by_key.get(k)
    if s is None or s["oldValue"]!=p["oldValue"] or s["newValue"]!=p["newValue"] or s["oldSha256"]!=p["oldSha256"] or s["newSha256"]!=p["newSha256"]:
        fail(f"cross-selection record mismatch: {k}")
pins=json.loads((CROSS/"evidence/candidate-free-input/catalog-file-pins.json").read_text(encoding="utf-8"))
pins_by_path={pin["path"]:pin for pin in pins["catalogFiles"].values()}
target_by_path={}
for p in plan:
    pin=pins_by_path.get(p["catalogPath"])
    if pin is None: fail(f"missing pinned catalog file: {p['catalogPath']}")
    if p["catalogSha256Before"]!=pin["sha256"] or p["catalogGitBlobBefore"]!=pin["gitBlob"]:
        fail(f"catalog file old-hash/blob guard mismatch: {p['catalogPath']}")
    if p["catalogPath"] not in target_by_path:
        target_by_path[p["catalogPath"]]={}
    target_by_path[p["catalogPath"]][p["sourceId"]]=p["newValue"]
for locale,pin in pins["catalogFiles"].items():
    path=pin["path"]
    before_path=CROSS/"evidence/pinned-tree"/path
    before_bytes=before_path.read_bytes()
    if sha(before_bytes)!=pin["sha256"]: fail(f"pinned catalog checksum mismatch: {path}")
    before=json.loads(before_bytes.decode("utf-8"))
    after_bytes=git(repo,"show",f"{CATALOG_COMMIT}:{path}")
    after=json.loads(after_bytes.decode("utf-8"))
    if list(before.keys())!=list(after.keys()): fail(f"key order/set changed: {path}")
    expected=dict(before)
    for source_id,value in target_by_path.get(path,{}).items():
        if source_id not in expected: fail(f"missing selected key: {path}:{source_id}")
        expected[source_id]=value
    if after!=expected: fail(f"unselected value changed: {path}")

for k,row in bykey.items():
    rb=actual_rows[k]
    path=row["localeCatalog"]["path"]
    after=json.loads(git(repo,"show",f"{CATALOG_COMMIT}:{path}").decode("utf-8"))
    actual=after[row["sourceId"]]
    p=selected.get(k)
    expected=p["newValue"] if p else row["currentTarget"]
    if actual!=expected or rb["actualAfterValue"]!=actual or rb["expectedAfterValue"]!=expected:
        fail(f"readback mismatch: {k}")
    if not rb["matchesExpected"]: fail(f"readback flag mismatch: {k}")
    is_hold=row["crossAudit"]["disposition"]=="hold-for-focused-review"
    if is_hold and (actual!=row["currentTarget"] or not rb["holdPreserved"]): fail(f"hold changed: {k}")
if not HOLDS.issubset(set(bykey)): fail("hold identifiers absent")
changed=git(repo,"diff-tree","--no-commit-id","--name-only","-r",CATALOG_COMMIT).decode().splitlines()
expected_files=sorted({p["catalogPath"] for p in plan})
if sorted(changed)!=expected_files: fail("catalog commit file set mismatch")
nums=git(repo,"diff","--numstat",f"{CATALOG_COMMIT}^",CATALOG_COMMIT).decode().splitlines()
if sum(int(line.split("\t")[0]) for line in nums)!=19 or sum(int(line.split("\t")[1]) for line in nums)!=19:
    fail("catalog commit change count mismatch")
workflows=git(repo,"diff","--name-only",f"{BASE}..{CATALOG_COMMIT}","--",".github/workflows").decode().splitlines()
if workflows: fail("workflow diff not empty")
print(json.dumps({
 "result":"PASS",
 "baseHead":BASE,
 "baseTree":BASE_TREE,
 "catalogCommit":CATALOG_COMMIT,
 "catalogTree":CATALOG_TREE,
 "readbackCells":len(readback),
 "appliedProposals":len(plan),
 "heldCellsPreserved":len(HOLDS),
 "catalogFilesChanged":len(expected_files),
 "catalogAdditions":19,
 "catalogDeletions":19,
 "catalogFilesWithKeysVerified":len(pins["catalogFiles"]),
 "workflowDiffFiles":0,
 "crossAuditChecksumsCovered":83,
 "validation":"evidence/readback verification only; no tests, builds, checks, CI, or visual deployment"
},ensure_ascii=False,indent=2))
