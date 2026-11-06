#!/usr/bin/env python3
"""Verify SeerrNG W3740-W3759 evidence files and committed blobs."""
from pathlib import Path
import hashlib,json,subprocess,sys
W=Path(__file__).resolve().parent;R=W.parents[3]
def die(s):raise SystemExit("FAIL: "+s)
def sha(b):return hashlib.sha256(b).hexdigest()
allow="--allow-uncommitted" in sys.argv
sums=W/"SHA256SUMS.txt";listed={}
for line in sums.read_text(encoding="utf-8").splitlines():
 if not line.strip():continue
 h,n=line.split("  ",1)
 if n in listed:die("duplicate root checksum "+n)
 listed[n]=h
actual={p.relative_to(W).as_posix() for p in W.rglob("*") if p.is_file() and p!=sums}
if set(listed)!=actual:die("root checksum inventory")
for n,h in listed.items():
 if sha((W/n).read_bytes())!=h:die("root checksum "+n)
m=json.loads((W/"manifest.json").read_text(encoding="utf-8"));rows={x["path"]:x for x in m["files"]}
if set(rows)!=actual-{"manifest.json"}:die("root manifest inventory")
for n,x in rows.items():
 b=(W/n).read_bytes()
 if len(b)!=x["bytes"] or sha(b)!=x["sha256"]:die("root manifest hash "+n)
C=W/"cross-audit"; cs={}
for line in (C/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
 if not line.strip():continue
 h,n=line.split("  ",1)
 if n in cs:die("duplicate cross checksum "+n)
 cs[n]=h
ca={p.relative_to(C).as_posix() for p in C.rglob("*") if p.is_file() and p!=C/"SHA256SUMS.txt"}
if set(cs)!=ca:die("cross packet checksum inventory")
for n,h in cs.items():
 if sha((C/n).read_bytes())!=h:die("cross packet checksum "+n)
root=subprocess.run([sys.executable,str(C/"verify_cross.py")],cwd=C,text=True,capture_output=True)
if root.returncode:die("cross-audit verifier: "+root.stdout+root.stderr)
app=subprocess.run([sys.executable,str(W/"application"/"verify_application.py")],cwd=R,text=True,capture_output=True)
if app.returncode:die("application verifier: "+app.stdout+app.stderr)
head=subprocess.check_output(["git","-C",str(R),"rev-parse","HEAD"],text=True).strip()
if allow:
 if head!="b703ef4c13fee64d71aab8180531ff15de9a738e":die("uncommitted evidence mode must run at catalog commit")
 status=subprocess.check_output(["git","-C",str(R),"status","--porcelain","--untracked-files=all"],text=True).splitlines()
 if any(not x[3:].startswith(W.relative_to(R).as_posix()+"/") for x in status if x):die("uncommitted files outside evidence window")
 committed="PENDING"
else:
 if subprocess.check_output(["git","-C",str(R),"status","--porcelain","--untracked-files=all"],text=True):die("repository not clean")
 tracked={x.decode() for x in subprocess.check_output(["git","-C",str(R),"ls-tree","-r","--name-only",head,"--",W.relative_to(R).as_posix()]).splitlines()}
 expected={str(W.relative_to(R)/p) for p in actual}|{str(W.relative_to(R)/"SHA256SUMS.txt")}
 if tracked!=expected:die("committed evidence path inventory")
 for n in expected:
  if subprocess.check_output(["git","-C",str(R),"show",f"{head}:{n}"])!=(R/n).read_bytes():die("committed evidence blob "+n)
 committed="PASS"
print(json.dumps({"result":"PASS","head":head,"windowFiles":len(actual)+1,"manifestFiles":len(rows),"crossPacketFiles":len(ca)+1,"crossAuditVerifier":"PASS","applicationVerifier":"PASS","committedEvidenceBlobs":committed},indent=2))
