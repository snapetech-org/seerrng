#!/usr/bin/env python3
import hashlib, json, subprocess
from collections import Counter, defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
E=Path(__file__).resolve().parent
W=json.loads((E/"clean-input/window.json").read_text(encoding="utf-8"))
I=[json.loads(x) for x in (E/"clean-input/review-input.jsonl").read_text(encoding="utf-8").splitlines()]
P=[json.loads(x) for x in (E/"primary/primary-review.jsonl").read_text(encoding="utf-8").splitlines()]
R=[json.loads(x) for x in (E/"adjudication/ratified-ledger.jsonl").read_text(encoding="utf-8").splitlines()]
PLAN=json.loads((E/"apply-plan.json").read_text(encoding="utf-8"))
def sha(v):
    if isinstance(v,str):v=v.encode("utf-8")
    return hashlib.sha256(v).hexdigest()
def fsha(p):return sha(p.read_bytes())
def key(x):return (x["position"],x["id"],x["locale"])
head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
tree=subprocess.check_output(["git","rev-parse","HEAD^{tree}"],cwd=ROOT,text=True).strip()
assert head==W["head"]==PLAN["baseHead"],(head,W["head"])
assert tree==W["tree"]==PLAN["baseTree"],(tree,W["tree"])
assert len(I)==len(P)==len(R)==240
assert len({key(x) for x in I})==len({key(x) for x in P})==len({key(x) for x in R})==240
II={key(x):x for x in I};PP={key(x):x for x in P};RR={key(x):x for x in R}
PB={key(x):x for x in PLAN["changes"]}
assert len(PB)==17 and set(PB)=={k for k,x in RR.items() if x["ratifiedDisposition"]=="approved-change"}
source=json.loads((ROOT/"src/i18n/locale/en.json").read_text(encoding="utf-8"))
assert len(source)==9494
pins=W["localeCatalogPins"];assert len(pins)==13
pre={}
for rel,pin in pins.items():
    path=ROOT/rel
    assert fsha(path)==pin["sha256"],(rel,"file pin")
    cat=json.loads(path.read_text(encoding="utf-8"));keys=list(cat)
    assert len(cat)==pin["keyCount"]==9494,(rel,"key count")
    assert sha("\n".join(keys))==pin["orderedKeySha256"],(rel,"ordered keys")
    assert set(cat)==set(source),(rel,"key set")
    if rel.endswith("/en.json"):assert cat==source
    pre[rel]=keys
updates=defaultdict(dict);cells=[]
for k,r in RR.items():
    i,p=II[k],PP[k]
    assert r["id"] in source and source[r["id"]]==r["source"],k
    assert sha(source[r["id"]])==sha(r["source"])==r["sourceSha256"]==i["sourceSha256"]==p["sourceSha256"],k
    assert sha(r["currentTarget"])==r["currentTargetSha256"]==i["currentTargetSha256"]==p["currentTargetSha256"],k
    assert i["currentTarget"]==p["currentTarget"]==r["currentTarget"],k
    assert sha(r["ratifiedTarget"])==r["ratifiedTargetSha256"],k
    assert r["placeholderParity"] and r["markupParity"] and r["numericTokenParity"] and r["protectedLiteralsPreserved"],k
    if r["ratifiedDisposition"]=="approved-change":
        plan=PB[k]
        assert r["ratifiedTarget"]==plan["proposedTarget"] and sha(plan["proposedTarget"])==plan["proposedTargetSha256"],k
        assert r["catalogPath"]==plan["catalogPath"] and plan["nativeSpeakerApprovalPending"],k
        assert r["callerExists"] and r["directMessageReferences"]>0 and r["callerContextResolved"],k
        assert r["callerContextHashes"]==plan["callerContextHashes"],k
        cat=json.loads((ROOT/r["catalogPath"]).read_text(encoding="utf-8"))
        assert cat[r["id"]]==plan["currentTarget"] and sha(cat[r["id"]])==plan["currentTargetSha256"],k
        updates[r["catalogPath"]][r["id"]]=plan["proposedTarget"]
    else:
        assert r["ratifiedTarget"]==r["currentTarget"],k
    cells.append({"position":r["position"],"id":r["id"],"locale":r["locale"],"disposition":r["ratifiedDisposition"],"finalTargetSha256":r["ratifiedTargetSha256"]})
assert sum(r["ratifiedDisposition"]=="approved-change" for r in R)==17
assert sum(r["ratifiedDisposition"]=="accept-current" for r in R)==163
assert sum(r["ratifiedDisposition"]=="hold-context" for r in R)==60
assert len(updates)==11
for rel,values in updates.items():
    path=ROOT/rel;cat=json.loads(path.read_text(encoding="utf-8"))
    for k,v in values.items():cat[k]=v
    path.write_text(json.dumps(cat,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
errors=[];cats={}
for rel,pin in pins.items():
    path=ROOT/rel;cat=json.loads(path.read_text(encoding="utf-8"));keys=list(cat)
    oh=sha("\n".join(keys))
    if len(cat)!=pin["keyCount"] or set(cat)!=set(source):errors.append([rel,"key set/count"])
    if keys!=pre[rel] or oh!=pin["orderedKeySha256"]:errors.append([rel,"key order"])
    cats[rel]={"sha256":fsha(path),"keyCount":len(cat),"orderedKeySha256":oh}
for r in R:
    cat=json.loads((ROOT/r["catalogPath"]).read_text(encoding="utf-8"));v=cat.get(r["id"])
    if v!=r["ratifiedTarget"] or sha(v)!=r["ratifiedTargetSha256"]:errors.append([r["position"],r["id"],r["locale"],"readback"])
assert not errors,errors
result={"repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3320-W3339","baseHead":head,"baseTree":tree,"cellsReadBack":240,"approvedChanges":17,"changedByLocale":dict(sorted(Counter(x["locale"] for x in PLAN["changes"]).items())),"acceptCurrent":163,"callerContextHolds":60,"catalogCountIncludingEnglish":13,"directLocaleCatalogsChanged":len(updates),"keyCountPerCatalog":9494,"catalogOrderHashGroups":sorted(set(x["orderedKeySha256"] for x in pins.values())),"catalogStructureAndOrderErrors":0,"targetReadbackErrors":0,"placeholderMarkupNumericProtectedLiteralErrors":0,"catalogs":cats,"cells":cells,"nativeSpeakerApproval":False,"headedBrowserAcceptance":False,"testsBuildsScansOrCIRun":False}
(E/"readback.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({k:v for k,v in result.items() if k not in ("catalogs","cells")},ensure_ascii=False,indent=2))
