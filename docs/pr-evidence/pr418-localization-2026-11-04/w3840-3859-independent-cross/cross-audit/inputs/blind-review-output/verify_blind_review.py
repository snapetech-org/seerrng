#!/usr/bin/env python3
import collections,hashlib,json,re
from pathlib import Path
O=Path(__file__).resolve().parent
I=O.parent/"portable-packet"/"candidate-free-input"
H="ba5bb93cdb4f107a8337aae228b7cd397e1140a6"; T="5420ae8fa33bda3619650757a2930a0114dbe4d1"
def sh(b):return hashlib.sha256(b).hexdigest()
def j(p):return json.loads(p.read_text(encoding="utf-8"))
def jl(p):return [json.loads(s) for s in p.read_text(encoding="utf-8").splitlines() if s.strip()]
m=j(I/"manifest.json"); assert (m["head"],m["tree"],m["range"],m["cellCount"])==(H,T,[3840,3859],240)
for line in (I/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
 d,n=line.split(None,1); n=n.strip().lstrip("*"); assert sh((I/n).read_bytes())==d
inputs=jl(I/"current-target-cells.jsonl"); sources={x["position"]:x for x in jl(I/"selected-source-cells.jsonl")}; contexts={x["position"]:x for x in jl(I/"caller-contexts.jsonl")}
rows=jl(O/"blind-review-ledger.jsonl"); props=jl(O/"proposals.jsonl"); holds=jl(O/"holds.jsonl")
assert len(inputs)==len(rows)==240 and len(sources)==len(contexts)==20
by={(x["position"],x["locale"]):x for x in inputs}; assert len(by)==240
pat=r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])"
def toks(s):
 p=[]
 for z in re.findall(pat,s):
  if z not in p:p.append(z)
 return {"placeholders":re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}",s),"markupTags":re.findall(r"<\/?[A-Za-z][^>]*>",s),"numericTokens":re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])",re.sub(r"\{[^{}]+\}","",s)),"protectedLiterals":p}
seen=set(); valid={"accept-current","propose-correction","propose-refinement","hold"}
for r in rows:
 k=(r["position"],r["locale"]); assert k not in seen; seen.add(k); x=by[k]; s=sources[k[0]]; c=contexts[k[0]]
 assert r["decision"] in valid and r["head"]==H and r["tree"]==T
 assert (r["sourceId"],r["sourceIdSha256"],r["sourceText"],r["sourceTextSha256"])==(s["sourceId"],s["sourceIdSha256"],s["sourceText"],s["sourceTextSha256"])
 assert (r["currentTarget"],r["currentTargetSha256"])==(x["currentTarget"],x["currentTargetSha256"]) and sh(r["currentTarget"].encode())==r["currentTargetSha256"]
 assert r["callerContextSha256"]==x["callerContextSha256"]==c["callerContextSha256"]
 assert r["catalogFileSha256"]==x["catalogSha256"] and r["catalogPath"]==x["catalogPath"]
 assert sh(r["finalTarget"].encode())==r["finalTargetSha256"]
 src=toks(s["sourceText"]); fin=toks(r["finalTarget"])
 assert src["placeholders"]==fin["placeholders"] and src["markupTags"]==fin["markupTags"] and src["numericTokens"]==fin["numericTokens"]
 assert all(x in fin["protectedLiterals"] for x in src["protectedLiterals"])
 assert all(x in r["finalTarget"] for x in r["manualProtectedLiterals"])
 if r["decision"]=="accept-current": assert r["finalTarget"]==r["currentTarget"]
 elif r["decision"].startswith("propose-"): assert r["finalTarget"]!=r["currentTarget"]
 else: assert not any(x in r for x in ("sourceText","currentTarget","finalTarget","proposedTarget","decisionRationale"))
assert len(seen)==240 and len({r["position"] for r in rows})==20 and len({r["locale"] for r in rows})==12
assert len(props)==sum(r["decision"].startswith("propose-") for r in rows)
assert not holds
for p in props:
 r=next(x for x in rows if x["position"]==p["position"] and x["locale"]==p["locale"])
 assert p["proposedTarget"]==r["finalTarget"] and sh(p["proposedTarget"].encode())==p["proposedTargetSha256"]
 assert p["decisionRationale"]==r["decisionRationale"] and p["sourceTextSha256"]==r["sourceTextSha256"]
su=j(O/"summary.json"); assert su["nativeSpeakerSignoffClaimed"] is False and su["browserApprovalClaimed"] is False and su["cellCount"]==240
result={"result":"PASS","head":H,"tree":T,"cells":240,"acceptCurrent":sum(r["decision"]=="accept-current" for r in rows),"proposeCorrection":sum(r["decision"]=="propose-correction" for r in rows),"proposeRefinement":sum(r["decision"]=="propose-refinement" for r in rows),"hold":len(holds),"inputChecksumsVerified":True,"sourceCurrentCallerCatalogHashesLinked":True,"placeholdersMarkupNumericProtectedLiteralsPreserved":True,"nativeSpeakerApprovalClaimed":False,"browserApprovalClaimed":False}
(O/"verification.json").write_text(json.dumps(result,sort_keys=True,indent=2)+chr(10),encoding="utf-8")
print(json.dumps(result,sort_keys=True))
