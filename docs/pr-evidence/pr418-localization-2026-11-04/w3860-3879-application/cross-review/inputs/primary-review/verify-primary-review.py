#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
O=Path(__file__).resolve().parent; I=O.parent/"candidate-free-input"
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode())
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x]
def req(x,m):
 if not x: raise SystemExit("FAIL: "+m)
sums={}
for line in (O/"SHA256SUMS.txt").read_text().splitlines():
 d,n=line.split(None,1); sums[n.lstrip("* ")]=d
req(set(sums)=={p.name for p in O.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"},"checksum inventory")
for n,d in sums.items(): req(sha((O/n).read_bytes())==d,"checksum "+n)
m=json.loads((O/"manifest.json").read_text()); im=json.loads((I/"manifest.json").read_text()); req(m["head"]==im["head"] and m["tree"]==im["tree"] and m["window"]=="W3860-W3879","primary pin"); req(m["candidateFreeInputSha256"]==sha((I/"SHA256SUMS.txt").read_bytes()),"candidate-free checksum pin")
ins={ (x["position"],x["locale"]):x for x in jl(I/"current-target-cells.jsonl") }; src={x["position"]:x for x in jl(I/"selected-source-cells.jsonl") }; rows=jl(O/"primary-ledger.jsonl"); props=jl(O/"proposals.jsonl"); holds=jl(O/"holds.jsonl")
req(len(rows)==240 and len({(x["position"],x["locale"]) for x in rows})==240,"ledger coverage")
req([(x["position"],x["locale"]) for x in rows]==list(ins),"ledger order")
req(len(props)==16 and len(holds)==0,"proposal/hold counts")
req([(x["position"],x["locale"]) for x in props]==[(x["position"],x["locale"]) for x in rows if x["disposition"]!="accept-current"],"proposal ledger linkage")
for x in rows:
 k=(x["position"],x["locale"]); c=ins[k]; s=src[x["position"]]; req(x["sourceId"]==s["sourceId"] and x["sourceText"]==s["sourceText"] and x["currentTarget"]==c["currentTarget"] and x["currentTargetSha256"]==c["currentTargetSha256"] and x["callerContextSha256"]==c["callerContextSha256"],"input linkage")
 for n in ("placeholders","markupTags","numericTokens","protectedLiterals"):
  cur=x["tokenIntegrity"][n]; base=c["tokenChecks"][n]; req(cur["current"]==base["target"] and cur["currentMatchesSource"]==base["matches"],"baseline token linkage "+n)
 req(x["reviewedTargetSha256"]==shat(x["reviewedTarget"]),"reviewed target hash")
 if x["disposition"]=="accept-current": req(x["proposedTarget"] is None and x["reviewedTarget"]==x["currentTarget"],"accept disposition")
 else: req(x["disposition"] in ("correction","refinement") and x["proposedTarget"]==x["reviewedTarget"] and x["proposedTargetSha256"]==x["reviewedTargetSha256"],"proposal linkage"); q=props[[(z["position"],z["locale"]) for z in props].index(k)]; req(q["reviewedTarget"]==x["reviewedTarget"] and q["rationale"]==x["rationale"],"proposal file linkage")
 for n in ("placeholders","markupTags","numericTokens","protectedLiterals"): req(x["tokenIntegrity"][n]["reviewedMatchesSource"],"reviewed token "+n)
req(sum(x["disposition"]=="accept-current" for x in rows)==224 and sum(x["disposition"]=="correction" for x in rows)==5 and sum(x["disposition"]=="refinement" for x in rows)==11,"disposition counts")
print(json.dumps({"result":"PASS","head":m["head"],"tree":m["tree"],"cells":len(rows),"acceptCurrent":224,"corrections":5,"refinements":11,"holds":0,"selected":len(props),"tokenMismatches":0},indent=2))
