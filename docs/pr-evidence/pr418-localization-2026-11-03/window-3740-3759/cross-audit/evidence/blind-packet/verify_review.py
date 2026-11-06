#!/usr/bin/env python3
from pathlib import Path
import collections, hashlib, json, re
HERE=Path(__file__).resolve().parent
IN=HERE/"input"
HEAD="8d0273ebc5eb51e9d5fee0ac9a0eb022eeed06c4"
TREE="163056b8255034e3ee3a99f25b63e190c88278ee"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
TOKEN_RE=re.compile(r"\{[A-Za-z][A-Za-z0-9_]*\}")
NUMBER_RE=re.compile(r"(?<![A-Za-z0-9_])\d+(?:[.,]\d+)*(?:%?)(?![A-Za-z0-9_])")
MARKUP_RE=re.compile(r"</?[A-Za-z][^>]*>")
def fail(s): raise SystemExit("FAIL: "+s)
def ok(x,s):
    if not x: fail(s)
def sha(x):
    if isinstance(x,str): x=x.encode("utf-8")
    return hashlib.sha256(x).hexdigest()
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def jf(p): return json.loads(p.read_text(encoding="utf-8"))
def sums(root):
    p=root/"SHA256SUMS.txt"
    listed={}
    for line in p.read_text(encoding="utf-8").splitlines():
        h,rel=line.split("  ",1)
        ok(rel not in listed,"duplicate checksum "+rel)
        listed[rel]=h
    actual={x.relative_to(root).as_posix() for x in root.rglob("*") if x.is_file() and x!=p}
    ok(actual==set(listed),"checksum inventory "+str(root))
    for rel,h in listed.items(): ok(sha((root/rel).read_bytes())==h,"checksum "+rel)
def literal_present(term,text):
    return re.search(r"(?<![A-Za-z0-9])"+re.escape(term)+r"(?![A-Za-z0-9])",text) is not None
sums(HERE); sums(IN)
m=jf(HERE/"manifest.json"); im=jf(IN/"manifest.json"); att=jf(IN/"PR-attestation.json")
ok(m["head"]==HEAD and m["tree"]==TREE and im["head"]==HEAD and im["tree"]==TREE,"pinned head/tree")
ok(att["state"]=="OPEN" and att["isDraft"] is True and att["head"]==HEAD and att["tree"]==TREE,"candidate PR attestation")
ok(att["branchRef"]==HEAD and att["pullRef"]==HEAD and att["baseRefName"]=="main","candidate branch/pull refs")
ok(m["primaryReviewRead"] is False and m["crossReviewPerformed"] is False and m["catalogValuesApplied"] is False,"review boundary")
live=jf(HERE/"live-ref-check.json")
ok(sha((HERE/"live-ref-check.json").read_bytes())==m["finalLiveRefCheckSha256"],"live PR evidence hash")
ok(live["state"]=="OPEN" and live["isDraft"] is True and live["baseRefName"]=="main","live PR state")
ok(live["headRefOid"]==live["branchRef"]==live["pullRef"]==HEAD and live["tree"]==TREE,"live PR refs")
pins=jf(IN/"file-pins.json")
ok(pins["head"]==HEAD and pins["tree"]==TREE and len(pins["catalogFiles"])==13 and len(pins["runtimeFiles"])==30,"catalog/runtime pins")
win=jf(IN/"window.json")
ok(win["range"]==[3740,3759] and win["localeOrder"]==LOCALES and win["cellCount"]==240,"window manifest")
srcrows=jl(IN/"source-cells.jsonl")
src={r["position"]:r for r in srcrows}
cells0=jl(IN/"current-target-cells.jsonl")
cells={(r["position"],r["locale"]):r for r in cells0}
ctxrows=jl(IN/"caller-contexts.jsonl")
ctx={r["position"]:r for r in ctxrows}
blocks=jl(IN/"caller-context-blocks.jsonl")
byblock={b["contextId"]:b for b in blocks}
ok(len(src)==20 and set(src)==set(range(3740,3760)),"source scope")
ok(len(cells)==240 and set(cells)=={(p,l) for p in range(3740,3760) for l in LOCALES},"target scope")
ok(len(ctx)==20 and all(ctx[p]["callerCount"]>0 and ctx[p]["contextBlockIds"] for p in range(3740,3760)),"caller coverage")
for b in blocks:
    for line in b.get("lines",[]):
        ok(sha(line["text"])==line["lineSha256"],"caller line hash "+b["contextId"])
for p,cx in ctx.items():
    ok(all(bid in byblock for bid in cx["contextBlockIds"]),"caller block reference "+str(p))
    for ref in cx.get("directMessageReferences",[]):
        bid=ref.get("contextBlockId")
        ok(bid in byblock,"direct caller block "+str(p))
        ok(any(line["line"]==ref["line"] and line["lineSha256"]==ref["lineSha256"] for line in byblock[bid]["lines"]),"direct caller line pin "+str(p))
order=jl(IN/"source-order.jsonl")
ok(len(order)==22 and [r["position"] for r in order]==list(range(3739,3761)),"source order boundary")
ok([r["boundaryKind"] for r in order]==["previous"]+["selected"]*20+["next"],"source boundary markers")
for r in order[1:-1]:
    p=r["position"]; s=src[p]
    ok((r["sourceId"],r["sourceIdSha256"],r["sourceSha256"])==(s["sourceId"],s["sourceIdSha256"],s["sourceSha256"]),"source order pin "+str(p))
    ok(sha(s["sourceId"])==s["sourceIdSha256"] and sha(s["source"])==s["sourceSha256"],"source hash "+str(p))
ledger=jl(HERE/"blind-ledger.jsonl")
lm={(r["position"],r["locale"]):r for r in ledger}
ok(len(ledger)==240 and len(lm)==240 and set(lm)==set(cells),"ledger exact scope")
counts=collections.Counter(r["disposition"] for r in ledger)
expected={"accept-current":206,"correction":15,"refinement":19,"hold":0}
normalized={k:counts.get(k,0) for k in expected}
ok(normalized==expected and m["dispositionCounts"]==expected,"decision counts")
ok(m["currentHoldCount"]==0 and len(jl(HERE/"review-holds-hash-only.jsonl"))==0,"current holds")
baseline=jf(IN/"baseline-protected-literal-findings.json")
ok(baseline["count"]==3,"baseline literal finding count")
badkeys={(r["position"],r["locale"]) for r in baseline["rows"]}
seenbad=set()
for key,c in cells.items():
    r=lm[key]; s=src[key[0]]; cx=ctx[key[0]]
    ok(r["sourceId"]==s["sourceId"]==c["sourceId"] and r["sourceSha256"]==s["sourceSha256"]==c["sourceSha256"],"source pin "+str(key))
    ok(r["sourceIdSha256"]==s["sourceIdSha256"] and sha(s["sourceId"])==s["sourceIdSha256"],"source ID hash "+str(key))
    ok(r["currentTargetSha256"]==c["currentTargetSha256"]==sha(c["currentTarget"]),"target preimage "+str(key))
    ok(r["callerCount"]==cx["callerCount"] and r["callerContextBlockIds"]==cx["contextBlockIds"],"caller pin "+str(key))
    pin=pins["catalogFiles"].get(c["catalogPath"])
    ok(pin is not None and c["catalogSha256"]==pin["sha256"] and c["catalogGitBlob"]==pin["gitBlob"],"locale catalog pin "+str(key))
    ok(not c["placeholderTokenMismatch"] and not c["placeholderTokenSequenceMismatch"] and not c["numericTokenMismatch"] and not c["markupTokenMismatch"] and not c["icuPluralCategorySetDifference"],"nonliteral source token checks "+str(key))
    required=s["sourceProtectedLiterals"]
    actual_bad=any(not literal_present(term,c["currentTarget"]) for term in required)
    ok(bool(c["protectedLiteralMismatch"])==actual_bad,"protected literal audit "+str(key))
    if actual_bad: seenbad.add(key)
    target=r.get("proposedTarget")
    if r["disposition"] in ("correction","refinement"):
        ok(isinstance(target,str) and target and r.get("proposedTargetSha256")==sha(target),"proposal hash "+str(key))
        ok(collections.Counter(TOKEN_RE.findall(target))==collections.Counter(s["sourcePlaceholders"]),"proposal placeholders "+str(key))
        ok(collections.Counter(NUMBER_RE.findall(target))==collections.Counter(s["sourceNumericTokens"]),"proposal numbers "+str(key))
        ok(MARKUP_RE.findall(target)==s["sourceMarkupTokens"],"proposal markup "+str(key))
        ok(all(literal_present(term,target) for term in required),"proposal protected literals "+str(key))
    else:
        ok("proposedTarget" not in r and "proposedTargetSha256" not in r,"proposal omission "+str(key))
        ok(not actual_bad,"unrepaired protected literal "+str(key))
ok(seenbad==badkeys,"baseline protected-literal set")
for key in badkeys:
    ok(lm[key]["disposition"]=="correction","protected-literal disposition "+str(key))
prior_h=jl(HERE/"carried-holds-reattestation-hash-only.jsonl")
prior_s=jl(HERE/"prior-selections-reattestation-hash-only.jsonl")
ok(len(prior_h)==12 and len(prior_s)==240,"prior lineage counts")
for r in prior_h:
    ok(r["targetTextIncluded"] is False and r["callerless"] is True and r["retained"] is True,"prior hold hash-only")
    ok(r["currentTargetSha256"]==r["previousApplicationTargetSha256"],"prior hold hash chain")
for r in prior_s:
    ok(r["targetTextIncluded"] is False and r["matches"] is True,"prior selection hash-only")
    ok(r["currentTargetSha256"]==r["previousAppliedTargetSha256"],"prior selection hash chain")
carry=jl(IN/"carry-forward-hold-hashes.jsonl")
ok(len(carry)==12 and all(x["targetTextIncluded"] is False for x in carry),"candidate-free carried holds")
for r in carry:
    ok(r["currentTargetSha256"]==r["previousApplicationTargetSha256"]==r["priorTargetSha256"],"carried hold source hash chain")
excl=jl(IN/"prior-selection-exclusions.jsonl")
ok(len(excl)==3740 and len({r["position"] for r in excl})==3740,"prior selection prefix count")
ok(all("targetTextIncluded" not in r and "target" not in r for r in excl),"prior exclusions hash-only")
summary=jf(HERE/"rationale-summary.json")
ok(summary["priorReattestation"]["carriedHoldCount"]==12 and summary["priorReattestation"]["priorSelectionCount"]==240,"summary lineage counts")
print("PASS offline SeerrNG blind packet: 206 accept-current, 15 corrections, 19 refinements, 0 new holds; 12 carried holds and 240 prior selections hash-only; 240 exact target preimages and caller/source/catalog pins verified; baseline Hindi protected literals repaired; proposal tokens/literals and checksums pass.")
