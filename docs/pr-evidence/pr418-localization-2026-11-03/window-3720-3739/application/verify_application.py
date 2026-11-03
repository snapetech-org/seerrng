#!/usr/bin/env python3
"""Verify SeerrNG W3720-W3739 application from Git objects."""
from pathlib import Path
from collections import Counter
import hashlib,json,subprocess,sys
A=Path(__file__).resolve().parent;W=A.parent;R=A.parents[4]
BASE="1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e";BT="6a51f3fb1d1f65c12bfe82bf47834626aa364488"
CAT="e75479a69f61724ce22f9d626546af9f9ef289f3";CT="27ea330c330014efc60b8b16f6a536247a981248"
def die(s):raise SystemExit("FAIL: "+s)
def sha(b):return hashlib.sha256(b).hexdigest()
def j(p):return json.loads(p.read_text(encoding="utf-8"))
def jl(p):return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def git(*x):return subprocess.check_output(["git","-C",str(R),*x],text=True).strip()
def obj(rev,p):
 try:b=subprocess.check_output(["git","-C",str(R),"show",f"{rev}:{p}"])
 except subprocess.CalledProcessError:die("missing Git object "+p)
 return b,json.loads(b.decode("utf-8"))
def orderhash(d):return sha(json.dumps(list(d.keys()),ensure_ascii=False,separators=(",",":")).encode("utf-8"))
cross=W/"cross-audit";cf=W/"candidate-free-input"
def same(a,b):
 aa={x.relative_to(a).as_posix():x for x in a.rglob("*") if x.is_file()};bb={x.relative_to(b).as_posix():x for x in b.rglob("*") if x.is_file()}
 if set(aa)!=set(bb):die("packet copy inventory "+str(a))
 for n in aa:
  if aa[n].read_bytes()!=bb[n].read_bytes():die("packet copy byte mismatch "+n)
same(W/"candidate-free-input",cross/"candidate-free-input")
same(W/"primary-packet",cross/"primary-packet")
same(W/"blind-packet",cross/"blind-packet")
rec=j(A/"commit-record.json")
if [rec["parentHead"],rec["parentTree"],rec["catalogCommit"],rec["catalogTree"]]!=[BASE,BT,CAT,CT]:die("commit pins")
if git("rev-parse",BASE)!=BASE or git("rev-parse",f"{BASE}^{{tree}}")!=BT:die("parent Git object")
if git("rev-parse",CAT)!=CAT or git("rev-parse",f"{CAT}^{{tree}}")!=CT:die("catalog Git object")
if git("rev-list","--parents","-n","1",CAT).split()!=[CAT,BASE]:die("catalog parent")
if subprocess.run(["git","-C",str(R),"merge-base","--is-ancestor",CAT,"HEAD"]).returncode:die("catalog not ancestor of evidence head")
allow="--allow-uncommitted" in sys.argv
if allow:
 if git("rev-parse","HEAD")!=CAT or git("diff","--name-only"):die("uncommitted mode only at catalog head with clean tracked files")
 prefix=W.relative_to(R).as_posix()+"/"
 if any(not x.startswith(prefix) for x in git("ls-files","--others","--exclude-standard").splitlines()):die("uncommitted files outside evidence window")
elif git("status","--porcelain","--untracked-files=all"):die("worktree not clean")
if git("diff","--name-only",BASE,CAT,"--",".github/workflows"):die("workflow path changed")
pins=j(cf/"file-pins.json")["catalogFiles"]
source_path="src/i18n/locale/en.json";source_pin=pins[source_path]
en0,enbase=obj(BASE,source_path);en1,enafter=obj(CAT,source_path)
source_record=j(A/"catalog-invariants.json")["sourceEnglishCatalog"]
if en0!=en1 or sha(en0)!=source_pin["sha256"] or git("rev-parse",f"{BASE}:{source_path}")!=source_pin["gitBlob"] or orderhash(enbase)!=source_pin["orderedKeysSha256"]:die("English source catalog changed/pin")
if source_record!={"path":source_path,"sha256":sha(en0),"gitBlob":source_pin["gitBlob"],"keyCount":len(enbase),"orderedKeysSha256":orderhash(enbase),"sourceOnly":True}:die("English source pin record")
ledger=jl(cross/"cross-audit-ledger.jsonl");selected=jl(cross/"changed-selections.jsonl");plan=jl(A/"application-plan.jsonl");reads=jl(A/"application-readback.jsonl")
if (len(ledger),len(selected),len(plan),len(reads))!=(240,50,50,240):die("cell coverage")
cell=lambda x:(x["position"],x["locale"])
lm={cell(x):x for x in ledger};sm={cell(x):x for x in selected};pm={cell(x):x for x in plan};rm={cell(x):x for x in reads}
if len(lm)!=240 or len(sm)!=50 or len(pm)!=50 or len(rm)!=240:die("duplicate cell")
if set(sm)!={k for k,x in lm.items() if x["crossAuditDisposition"] in ("correction","refinement")}:die("selected set")
counts=Counter(x["crossAuditDisposition"] for x in ledger)
if counts!=Counter({"accept-current":190,"correction":34,"refinement":16}):die("disposition counts")
paths={x["catalogPath"] for x in selected}
if len(paths)!=12 or set(git("diff","--name-only",BASE,CAT).splitlines())!=paths:die("catalog commit path scope")
if len(pins)!=13 or set(pins)-{source_path}!=paths:die("source/locale pin coverage")
inv={x["catalogPath"]:x for x in j(A/"catalog-invariants.json")["catalogs"]}
if set(inv)!=paths:die("target invariant coverage")
cats={}
for p in paths:
 pin=pins[p];b0,d0=obj(BASE,p);b1,d1=obj(CAT,p);iv=inv[p]
 if len(d0)!=pin["keyCount"] or len(d1)!=pin["keyCount"] or list(d0)!=list(d1) or orderhash(d0)!=pin["orderedKeysSha256"]:die("catalog key order/count "+p)
 if sha(b0)!=pin["sha256"] or git("rev-parse",f"{BASE}:{p}")!=pin["gitBlob"]:die("catalog baseline pin "+p)
 if sha(b1)!=iv["afterSha256"] or git("rev-parse",f"{CAT}:{p}")!=iv["afterGitBlob"]:die("catalog final pin "+p)
 if iv["beforeSha256"]!=sha(b0) or iv["beforeGitBlob"]!=pin["gitBlob"] or iv["orderedKeysSha256"]!=orderhash(d0) or iv["nonTargetValuesPreserved"] is not True:die("catalog invariant record "+p)
 diff={k for k in d0 if d0[k]!=d1[k]};want={x["sourceId"] for x in selected if x["catalogPath"]==p}
 if diff!=want or len(diff)!=iv["selectedKeyCount"] or set(iv["selectedKeys"])!=want:die("catalog changed key set "+p)
 cats[p]=(d0,d1)
for k,x in lm.items():
 p=x["catalogPath"];key=x["sourceId"];old,new=cats[p]
 if old.get(key)!=x["currentTarget"] or sha(old[key].encode())!=x["currentTargetSha256"]:die("target preimage "+str(k))
 if new[key]!=x["selectedTarget"] or sha(new[key].encode())!=x["selectedTargetSha256"]:die("target final "+str(k))
 if x["tokenAudit"].get("allChecksPass") is not True:die("token audit "+str(k))
 q=rm[k]
 if (q["position"],q["locale"],q["sourceId"],q["catalogPath"],q["disposition"],q["preimageTarget"],q["preimageSha256"],q["readbackTarget"],q["readbackTargetSha256"],q["matches"])!=(x["position"],x["locale"],key,p,x["crossAuditDisposition"],x["currentTarget"],x["currentTargetSha256"],new[key],sha(new[key].encode()),True):die("readback row "+str(k))
 if x["crossAuditDisposition"]=="accept-current" and old[key]!=new[key]:die("accept-current changed")
 if x["crossAuditDisposition"] in ("correction","refinement"):
  a=sm[k];b=pm[k]
  if b["preimageTarget"]!=old[key] or b["preimageSha256"]!=sha(old[key].encode()) or b["selectedTarget"]!=new[key] or b["selectedTargetSha256"]!=sha(new[key].encode()):die("plan mismatch "+str(k))
  for f in ("catalogPath","sourceId","currentTarget","currentTargetSha256","selectedTarget","selectedTargetSha256","crossAuditDisposition"):
   if a.get(f)!=x.get(f):die("cross selection mismatch "+str(k)+"/"+f)
holds=jl(cf/"carry-forward-hold-hashes.jsonl");holdreads=jl(A/"prior-hold-readback.jsonl")
if len(holds)!=12 or len(holdreads)!=12:die("carried hold count")
hr={(x["position"],x["locale"],x["sourceId"]):x for x in holdreads}
for h in holds:
 p=h["catalogPath"];key=h["sourceId"];old,new=cats[p];k=(h["position"],h["locale"],key);q=hr.get(k)
 digest=sha(new[key].encode()) if key in new else None
 if digest!=h["currentTargetSha256"] or digest!=h["priorTargetSha256"] or not q or q["preserved"] is not True or q["readbackTargetSha256"]!=digest or q["targetTextIncluded"] is not False:die("carried hold "+str(k))
exclusions=jl(cf/"prior-selection-exclusions.jsonl");ex=j(A/"prior-selection-exclusion-readback.json")
if ex["records"]!=len(exclusions) or ex["sha256"]!=sha((cf/"prior-selection-exclusions.jsonl").read_bytes()) or ex["allRecordsRemainInSealedCrossPacket"] is not True:die("prior selection exclusion record")
pre=j(A/"application-preflight.json")
if pre["result"]!="PASS" or pre["parentHead"]!=BASE or pre["parentTree"]!=BT or pre["state"]!="OPEN" or pre["draft"] is not True or pre["sourceEnglishCatalogReattested"] is not True or pre["catalogFilesReattested"]!=12 or pre["targetPreimagesReattested"]!=240:die("preflight record")
summary=j(A/"application-verification.json")
expected={"result":"PASS","cellsReadBack":240,"selectedChanges":50,"corrections":34,"refinements":16,"acceptCurrent":190,"newWindowHolds":0,"carriedHoldsPreserved":12,"catalogFilesChanged":12,"catalogKeyCountsAndOrderPreserved":True,"nonTargetValuesPreserved":True,"selectedTokenFailures":0,"workflowsChanged":False}
for k,v in expected.items():
 if summary.get(k)!=v:die("application summary "+k)
print(json.dumps({"result":"PASS","parent":BASE,"parentTree":BT,"catalogCommit":CAT,"catalogTree":CT,"cellsReadBack":240,"selectedChanges":50,"corrections":34,"refinements":16,"acceptCurrent":190,"targetCatalogsChanged":12,"englishSourceCatalog":"unchanged and separately pinned","carriedHoldsPreserved":12,"selectedTokenFailures":0,"workflowChanges":False},indent=2))
