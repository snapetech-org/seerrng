#!/usr/bin/env python3
"""Verify SeerrNG W3720-W3739 evidence bundle and committed Git blobs."""
from pathlib import Path
import hashlib,json,subprocess,sys
W=Path(__file__).resolve().parent;R=W.parents[3]
def die(s):raise SystemExit("FAIL: "+s)
def sha(b):return hashlib.sha256(b).hexdigest()
allow="--allow-uncommitted" in sys.argv
sums=W/"SHA256SUMS.txt";listed={}
for line in sums.read_text(encoding="utf-8").splitlines():
 if line.strip():
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
def same(a,b):
 aa={p.relative_to(a).as_posix():p for p in a.rglob("*") if p.is_file()};bb={p.relative_to(b).as_posix():p for p in b.rglob("*") if p.is_file()}
 if set(aa)!=set(bb):die("packet copy inventory "+str(a))
 for n in aa:
  if aa[n].read_bytes()!=bb[n].read_bytes():die("packet copy bytes "+n)
same(W/"candidate-free-input",W/"cross-audit"/"candidate-free-input")
same(W/"primary-packet",W/"cross-audit"/"primary-packet")
same(W/"blind-packet",W/"cross-audit"/"blind-packet")
c=W/"cross-audit";cs={}
for line in (c/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
 if line.strip():
  h,n=line.split("  ",1)
  if n in cs:die("duplicate cross checksum "+n)
  cs[n]=h
ca={p.relative_to(c).as_posix() for p in c.rglob("*") if p.is_file() and p!=c/"SHA256SUMS.txt"}
if set(cs)!=ca:die("cross packet checksum inventory")
for n,h in cs.items():
 if sha((c/n).read_bytes())!=h:die("cross packet checksum "+n)
cmd=[sys.executable,str(W/"application"/"verify_application.py")]+(["--allow-uncommitted"] if allow else [])
app=subprocess.run(cmd,cwd=R,text=True,capture_output=True)
if app.returncode:die("application verifier: "+app.stdout+app.stderr)
head=subprocess.check_output(["git","-C",str(R),"rev-parse","HEAD"],text=True).strip()
if not allow:
 tracked={x.decode() for x in subprocess.check_output(["git","-C",str(R),"ls-tree","-r","--name-only",head,"--",W.relative_to(R).as_posix()]).splitlines()}
 expected={str(W.relative_to(R)/p) for p in actual}|{str(W.relative_to(R)/"SHA256SUMS.txt")}
 if tracked!=expected:die("committed evidence path inventory")
 for n in expected:
  if subprocess.check_output(["git","-C",str(R),"show",f"{head}:{n}"])!=(R/n).read_bytes():die("committed evidence blob "+n)
print(json.dumps({"result":"PASS","head":head,"files":len(actual),"manifestFiles":len(rows),"crossFiles":len(ca),"applicationVerifier":"PASS","committedBlobs":"PENDING" if allow else "PASS"},indent=2))
print(app.stdout,end="")
