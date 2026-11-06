import hashlib,json,subprocess
from pathlib import Path
repo=Path(__file__).resolve().parents[4]
p=Path(__file__).parent
base="eb279fc80be656f379cd893642bf741ba0a24d85"
tree="85a73172719b38e99a4e74c0ef9a303164cb4fcb"
plans=[json.loads(x) for x in (p/"cross-audit/apply-plan.jsonl").read_text().splitlines() if x]
noops=[json.loads(x) for x in (p/"cross-audit/no-op-plan.jsonl").read_text().splitlines() if x]
readback=[json.loads(x) for x in (p/"catalog-readback.jsonl").read_text().splitlines() if x]
assert len(plans)==47 and len(noops)==193 and len(readback)==240
head=subprocess.check_output(["git","-C",str(repo),"rev-parse","HEAD"],text=True).strip()
if head != base:
 assert subprocess.check_output(["git","-C",str(repo),"rev-parse","HEAD^"],text=True).strip()==base
assert subprocess.check_output(["git","-C",str(repo),"rev-parse",f"{base}^{{tree}}"],text=True).strip()==tree
allrows=plans+noops
assert len({(r["catalogPath"],r["sourceId"]) for r in allrows})==240
files=sorted({r["catalogPath"] for r in allrows})
for rel in files:
 before=json.loads(subprocess.check_output(["git","-C",str(repo),"show",f"{base}:{rel}"]))
 after=json.loads((repo/rel).read_text())
 rows=[r for r in allrows if r["catalogPath"]==rel]
 assert hashlib.sha256(subprocess.check_output(["git","-C",str(repo),"show",f"{base}:{rel}"])).hexdigest()==rows[0]["catalogSha256"]
 assert subprocess.check_output(["git","-C",str(repo),"rev-parse",f"{base}:{rel}"],text=True).strip()==rows[0]["catalogGitBlob"]
 assert list(before)==list(after) and len(after)==9494
 changed=[k for k in before if before[k]!=after[k]]
 expected=[r["sourceId"] for r in plans if r["catalogPath"]==rel]
 assert set(changed)==set(expected) and len(changed)==len(expected)
 for r in rows:
  assert before[r["sourceId"]]==r["currentTarget"]
  want=r["selectedTarget"] if r in plans else r["currentTarget"]
  assert after[r["sourceId"]]==want
  assert hashlib.sha256(want.encode()).hexdigest()==(r["selectedTargetSha256"] if r in plans else r["currentTargetSha256"])
assert all(r["matches"] for r in readback)
print("PASS: 240 cells, 47 updates, 193 no-ops, 12 catalogs; base",base)
