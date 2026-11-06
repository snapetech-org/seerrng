#!/usr/bin/env python3
import hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
R=Path(__file__).resolve().parent
def sha(b):
 if isinstance(b,str): b=b.encode("utf-8")
 return hashlib.sha256(b).hexdigest()
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x]
def req(ok,msg):
 if not ok: raise SystemExit("FAIL: "+msg)
def tokens(s): return {"placeholders":re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}",s),"markupTags":re.findall(r"</?[A-Za-z][^>]*>",s),"numericTokens":re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])",s),"protectedLiterals":list(dict.fromkeys(re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify)(?![A-Za-z0-9])",s)))}
# Verify root and nested packet manifests.
for d in [R,R/"inputs/candidate-free-input",R/"inputs/primary-review",R/"inputs/blind-review"]:
 subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=d,check=True,stdout=subprocess.DEVNULL)
CF=R/"inputs/candidate-free-input"; P=R/"inputs/primary-review"; B=R/"inputs/blind-review"
cf=json.loads((CF/"manifest.json").read_text(encoding="utf-8")); pm=json.loads((P/"manifest.json").read_text(encoding="utf-8")); bp=json.loads((B/"review_packet.json").read_text(encoding="utf-8"))
req(cf["head"]==pm["head"]==bp["head"]=="39d8ae36ba757532f947a9a15be22f0676e79075" and cf["tree"]==pm["tree"]==bp["tree"]=="45e3ada0f565a07c675d1d75096f4266c4ef691e","input pin")
cur={(x["position"],x["locale"]):x for x in jl(CF/"current-target-cells.jsonl")}; src={x["position"]:x for x in jl(CF/"selected-source-cells.jsonl")}; ctx={x["position"]:x for x in jl(CF/"caller-contexts.jsonl")}
p={(x["position"],x["locale"]):x for x in jl(P/"primary-ledger.jsonl")}; b={(x["position"],x["locale"]):x for x in jl(B/"review-cells.jsonl")}; rows=jl(R/"cross-ledger.jsonl")
req(len(rows)==240 and len({(x["position"],x["locale"]) for x in rows})==240,"ledger coverage")
counts={"keep-current":0,"select-primary-proposal":0,"select-blind-proposal":0,"select-agreed-proposal":0,"hold":0}
for x in rows:
 k=(x["position"],x["locale"]); c=cur[k]; s=src[k[0]]; pr=p[k]; br=b[k]
 req(x["sourceId"]==s["sourceId"]==pr["sourceId"]==br["sourceId"] and x["sourceTextSha256"]==s["sourceTextSha256"]==pr["sourceTextSha256"]==br["sourceTextSha256"],"source binding "+str(k))
 req(x["currentTargetSha256"]==c["currentTargetSha256"]==pr["currentTargetSha256"]==br["currentTargetSha256"] and x["callerContextSha256"]==c["callerContextSha256"]==ctx[k[0]]["callerContextSha256"],"current/caller binding "+str(k))
 req(x["primaryDisposition"]==pr["disposition"] and x["blindDecision"]==br["decision"] and x["decision"]==x["crossDecision"] and x["hold"]==(x["crossDecision"]=="hold"),"review disposition "+str(k))
 pt=pr["reviewedTarget"] if pr["disposition"] in ("correction","refinement") else None; bt=br["proposal"] if br["decision"]=="propose" else None
 req(x["primaryTarget"]==pt and x["blindTarget"]==bt,"proposal binding "+str(k))
 target=x["selectedTarget"]; req(x["selectedTargetSha256"]==sha(target),"selected target hash "+str(k))
 if x["crossDecision"] in ("keep-current","hold"): req(target==c["currentTarget"],"current target retention "+str(k))
 else: req(target in [v for v in (pt,bt) if v is not None],"selected proposal source "+str(k))
 counts[x["crossDecision"]]+=1
 st=tokens(s["sourceText"]); tt=tokens(target); base=(k==(3888,"ja"))
 for name in ("placeholders","markupTags","numericTokens","protectedLiterals"):
  req(x["tokenIntegrity"]["source"][name]==st[name] and x["tokenIntegrity"]["selected"][name]==tt[name],"token evidence "+name+" "+str(k))
  if Counter(st[name])!=Counter(tt[name]): req(base and name=="numericTokens" and target==c["currentTarget"],"token mismatch "+name+" "+str(k))
req(counts=={"keep-current":207,"select-primary-proposal":13,"select-blind-proposal":9,"select-agreed-proposal":7,"hold":4},"decision counts")
req(len(jl(R/"holds.jsonl"))==4 and len(jl(R/"prior-holds-preserved.jsonl"))==14,"hold continuity")
rec=jl(R/"proposal-reconciliation.jsonl"); req(len(rec)==33,"proposal reconciliation coverage")
for name in ("live-pr-before.json","live-pr-after.json"):
 v=json.loads((R/name).read_text(encoding="utf-8")); req(v["headSha"]==v["branchSha"]==v["pullRefSha"]==cf["head"] and v["headTree"]==cf["tree"] and v["state"]=="open" and v["draft"] is True and v["checkRunCount"]==0 and v["statusCount"]==0 and v["deploymentCount"]==0,"live PR snapshot")
print(json.dumps({"result":"PASS","cells":240,"decisions":counts,"priorHoldsPreserved":14,"baselineJapaneseOneAs1":1},sort_keys=True))
