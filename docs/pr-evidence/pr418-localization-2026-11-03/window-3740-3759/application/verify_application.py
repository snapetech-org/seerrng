#!/usr/bin/env python3
"""Verify SeerrNG W3740-W3759 application from pinned Git objects."""
from pathlib import Path
from collections import Counter
import hashlib,json,subprocess,sys
A=Path(__file__).resolve().parent;W=A.parent;R=A.parents[4]
BASE="8d0273ebc5eb51e9d5fee0ac9a0eb022eeed06c4";BT="163056b8255034e3ee3a99f25b63e190c88278ee"
CAT="b703ef4c13fee64d71aab8180531ff15de9a738e";CT="9626c77fc17fec31bdab8f34a9faf148a6187096"
X=W/"cross-audit";CF=X/"evidence/primary-packet/candidate-free-input"
def die(s):raise SystemExit("FAIL: "+s)
def require(v,s):
 if not v:die(s)
def sha(b):return hashlib.sha256(b).hexdigest()
def j(p):return json.loads(p.read_text(encoding="utf-8"))
def jl(p):return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def git(*args):return subprocess.check_output(["git","-C",str(R),*args])
def obj(rev,p):
 try:b=git("show",f"{rev}:{p}")
 except subprocess.CalledProcessError:die("missing Git object "+rev+":"+p)
 return b,json.loads(b.decode("utf-8"))
def orderhash(d):return sha(json.dumps(list(d.keys()),ensure_ascii=False,separators=(",",":")).encode("utf-8"))
def blob(rev,p):return git("rev-parse",f"{rev}:{p}").decode().strip()
rec=j(A/"commit-record.json"); pre=j(A/"application-preflight.json"); inv=j(A/"catalog-invariants.json"); summ=j(A/"application-verification.json")
require([rec["parentHead"],rec["parentTree"],rec["catalogCommit"],rec["catalogTree"]]==[BASE,BT,CAT,CT],"commit record pins")
require(git("rev-parse",BASE).decode().strip()==BASE and git("rev-parse",f"{BASE}^{{tree}}").decode().strip()==BT,"parent object")
require(git("rev-parse",CAT).decode().strip()==CAT and git("rev-parse",f"{CAT}^{{tree}}").decode().strip()==CT,"catalog object")
require(git("rev-list","--parents","-n","1",CAT).decode().split()==[CAT,BASE],"direct parent")
require(subprocess.run(["git","-C",str(R),"merge-base","--is-ancestor",CAT,"HEAD"]).returncode==0,"catalog commit not ancestor of current evidence head")
require(pre["result"]=="PASS" and pre["parentHead"]==BASE and pre["parentTree"]==BT and pre["state"]=="OPEN" and pre["draft"] is True and pre["branchRef"]==BASE and pre["pullRef"]==BASE and pre["deploymentsForParentHead"]==0,"preflight pins")
pins=j(CF/"file-pins.json")["catalogFiles"];source_path="src/i18n/locale/en.json"
require(len(pins)==13,"catalog pin count")
en0,enbase=obj(BASE,source_path);en1,enfinal=obj(CAT,source_path);ep=pins[source_path]
require(en0==en1 and sha(en0)==ep["sha256"] and blob(BASE,source_path)==ep["gitBlob"] and orderhash(enbase)==ep["orderedKeysSha256"],"English source catalog pin/immutability")
require(inv["sourceEnglishCatalog"]=={"path":source_path,"sha256":sha(en0),"gitBlob":ep["gitBlob"],"keyCount":len(enbase),"orderedKeysSha256":orderhash(enbase),"sourceOnly":True},"English catalog invariant")
ledger=jl(X/"cross-ledger.jsonl");cells=jl(CF/"current-target-cells.jsonl");plan=jl(A/"application-plan.jsonl");reads=jl(A/"application-readback.jsonl")
require((len(ledger),len(cells),len(plan),len(reads))==(240,240,54,240),"cell coverage")
cell=lambda x:(x["position"],x["locale"])
lm={cell(x):x for x in ledger};cm={cell(x):x for x in cells};pm={cell(x):x for x in plan};rm={cell(x):x for x in reads}
require((len(lm),len(cm),len(pm),len(rm))==(240,240,54,240),"duplicate cells")
require(set(lm)==set(cm)==set(rm),"readback coverage")
counts=Counter(x["disposition"] for x in ledger)
require(counts==Counter({"accept-current":186,"correction":29,"refinement":25}),"cross disposition counts")
selected={k:x for k,x in lm.items() if x["changed"]}
require(set(selected)==set(pm),"plan selection set")
paths={p for p,x in pins.items() if p!=source_path};path_changes={x["catalogPath"] for x in selected.values()}
require(len(paths)==12 and len(path_changes)==11 and set(x["path"] for x in inv["catalogs"] if x["selectedKeyCount"]>0)==path_changes,"locale/invariant catalog coverage")
require(set(git("diff","--name-only",BASE,CAT).decode().splitlines())==path_changes,"catalog commit path scope")
require(not git("diff","--name-only",BASE,CAT,"--",".github/workflows"),"workflow path changed")
ci={x["path"]:x for x in inv["catalogs"]};require(set(ci)==paths,"catalog invariant paths")
basecats={};finalcats={}
for p in sorted(paths):
 pin=pins[p];b0,d0=obj(BASE,p);b1,d1=obj(CAT,p);q=ci[p]
 require(sha(b0)==pin["sha256"] and blob(BASE,p)==pin["gitBlob"],"baseline catalog pin "+p)
 require(len(d0)==len(d1)==pin["keyCount"]==9494 and list(d0)==list(d1) and orderhash(d0)==pin["orderedKeysSha256"],"catalog keys/order "+p)
 require(q["beforeSha256"]==sha(b0) and q["afterSha256"]==sha(b1) and q["beforeGitBlob"]==blob(BASE,p) and q["afterGitBlob"]==blob(CAT,p) and q["keyCount"]==len(d0) and q["orderedKeysSha256"]==orderhash(d0) and q["nonTargetValuesPreserved"] is True,"catalog invariant "+p)
 want={x["sourceId"] for x in selected.values() if x["catalogPath"]==p};diff={k for k in d0 if d0[k]!=d1[k]}
 require(diff==want==set(q["selectedKeys"]) and len(diff)==q["selectedKeyCount"],"changed key set "+p)
 basecats[p]=d0;finalcats[p]=d1
for k,x in lm.items():
 c=cm[k];p=c["catalogPath"];key=x["sourceId"];old=basecats[p];new=finalcats[p]
 require(x["sourceIdSha256"]==c["sourceIdSha256"] and x["currentTargetSha256"]==c["currentTargetSha256"]==sha(c["currentTarget"].encode()),"cell preimage pin "+str(k))
 require(old[key]==c["currentTarget"],"preimage value "+str(k))
 expected=x["resolvedTarget"] if x["changed"] else c["currentTarget"]
 expected_hash=x["resolvedTargetSha256"]
 require(new[key]==expected and sha(new[key].encode())==expected_hash,"final target "+str(k))
 require(all(x["checks"].get(f) is True for f in ("placeholdersMatchSource","icuPluralCategoriesMatchSource","markupMatchesSource","numericTokensMatchSource","protectedLiteralsMatchSource")),"cross token/literal audit "+str(k))
 q=rm[k]
 required=(x["position"],x["locale"],key,p,x["disposition"],old[key],sha(old[key].encode()),expected,sha(expected.encode()),new[key],sha(new[key].encode()),True,x["changed"])
 actual=(q["position"],q["locale"],q["sourceId"],q["catalogPath"],q["disposition"],q["preimageTarget"],q["preimageSha256"],q["expectedTarget"],q["expectedTargetSha256"],q["readbackTarget"],q["readbackTargetSha256"],q["matches"],q["changed"])
 require(actual==required,"readback row "+str(k))
 if x["changed"]:
  z=pm[k]
  require(z["preimageTarget"]==old[key] and z["preimageSha256"]==sha(old[key].encode()) and z["selectedTarget"]==new[key] and z["selectedTargetSha256"]==sha(new[key].encode()) and z["disposition"]==x["disposition"] and z["selectionSource"]==x["resolution"],"plan row "+str(k))
# Only hashes for previous holds/selections are copied into application readbacks.
holds=jl(CF/"carry-forward-hold-hashes.jsonl");hr=jl(A/"prior-hold-readback.jsonl");require(len(holds)==len(hr)==12,"carried holds")
hrm={(x["position"],x["locale"],x["sourceId"]):x for x in hr}
for h in holds:
 k=(h["position"],h["locale"],h["sourceId"]);q=hrm.get(k);p=h["catalogPath"];key=h["sourceId"]
 digest=sha(finalcats[p][key].encode()) if key in finalcats[p] else None
 require(q is not None and q["preserved"] is True and q["targetTextIncluded"] is False and q["readbackTargetSha256"]==digest==h["currentTargetSha256"]==h["priorTargetSha256"]==h["previousApplicationTargetSha256"],"hash-only hold "+str(k))
prpath=CF/"lineage/prior-window-selection-reattestation.jsonl";prior=jl(prpath);q=j(A/"prior-selection-exclusion-readback.json")
require(len(prior)==q["recordCount"]==240 and sha(prpath.read_bytes())==q["sha256"] and q["allRecordsRemainInSealedCrossPacket"] is True and q["targetTextIncluded"] is False,"hash-only previous selections")
expected={"result":"PASS","cellsReadBack":240,"selectedChanges":54,"corrections":29,"refinements":25,"acceptCurrent":186,"newWindowHolds":0,"carriedHoldsPreserved":12,"priorSelectionsReattestedHashOnly":240,"catalogFilesChanged":11,"directLocaleCatalogsReviewed":12,"catalogKeyCountsAndOrderPreserved":True,"nonTargetValuesPreserved":True,"selectedTokenFailures":0,"selectedProtectedLiteralFailures":0,"workflowsChanged":False,"sourceEnglishCatalogUnchanged":True}
for k,v in expected.items():require(summ.get(k)==v,"summary field "+k)
print(json.dumps({"result":"PASS","parent":BASE,"parentTree":BT,"catalogCommit":CAT,"catalogTree":CT,"cellsReadBack":240,"selectedChanges":54,"corrections":29,"refinements":25,"acceptCurrent":186,"targetCatalogsChanged":11,"directLocalesReviewed":12,"englishSourceCatalog":"unchanged","carriedHoldsPreserved":12,"selectedTokenFailures":0,"workflowChanges":False},indent=2))
