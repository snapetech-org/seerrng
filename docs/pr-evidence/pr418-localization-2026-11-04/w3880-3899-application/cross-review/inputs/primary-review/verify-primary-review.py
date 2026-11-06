#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from pathlib import Path
O=Path(__file__).resolve().parent; I=O.parent/"candidate-free-input"
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode())
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x]
def req(ok,msg):
 if not ok: raise SystemExit("FAIL: "+msg)
def tokens(s):
 return {"placeholders":re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}",s),"markupTags":re.findall(r"</?[A-Za-z][^>]*>",s),"numericTokens":re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])",s),"protectedLiterals":list(dict.fromkeys(re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify)(?![A-Za-z0-9])",s)))}
# Verify both packet checksum manifests before trusting their contents.
subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=O,check=True,stdout=subprocess.DEVNULL)
subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=I,check=True,stdout=subprocess.DEVNULL)
subprocess.run(["python3","verify-candidate-free.py","--source-worktree","/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3880-3899-input"],cwd=I,check=True,stdout=subprocess.DEVNULL)
m=json.loads((O/"manifest.json").read_text(encoding="utf-8")); im=json.loads((I/"manifest.json").read_text(encoding="utf-8"))
req(m["head"]==im["head"]=="39d8ae36ba757532f947a9a15be22f0676e79075" and m["tree"]==im["tree"]=="45e3ada0f565a07c675d1d75096f4266c4ef691e" and m["window"]=="W3880-W3899","head/window pin")
inputs={(x["position"],x["locale"]):x for x in jl(I/"current-target-cells.jsonl")}; sources={x["position"]:x for x in jl(I/"selected-source-cells.jsonl")}; contexts={x["position"]:x for x in jl(I/"caller-contexts.jsonl")}
rows=jl(O/"primary-ledger.jsonl"); proposals=jl(O/"proposals.jsonl"); holds=jl(O/"holds.jsonl")
req(len(rows)==240 and len({(r["position"],r["locale"]) for r in rows})==240,"ledger coverage")
req(len(proposals)==29 and len(holds)==0,"proposal/hold counts")
req(len(inputs)==240 and len(sources)==20 and len(contexts)==20 and all(c["callerCount"]>0 for c in contexts.values()),"input caller coverage")
counts={"accept-current":0,"correction":0,"refinement":0,"hold":0}; token_mismatch=0
for r in rows:
 k=(r["position"],r["locale"]); c=inputs[k]; s=sources[r["position"]]; ctx=contexts[r["position"]]
 req(r["sourceId"]==s["sourceId"] and r["sourceText"]==s["sourceText"] and r["sourceIdSha256"]==s["sourceIdSha256"] and r["sourceTextSha256"]==s["sourceTextSha256"],"source linkage "+str(k))
 req(r["currentTarget"]==c["currentTarget"] and r["currentTargetSha256"]==c["currentTargetSha256"] and r["callerContextSha256"]==c["callerContextSha256"]==ctx["callerContextSha256"],"current/caller linkage "+str(k))
 d=r["disposition"]; req(d in counts,"disposition "+str(k)); counts[d]+=1
 target=r["reviewedTarget"]
 req(r["reviewedTargetSha256"]==shat(target),"reviewed hash "+str(k))
 if d=="accept-current": req(r["proposedTarget"] is None and target==r["currentTarget"],"accept-current target "+str(k))
 else: req(d in ("correction","refinement") and r["proposedTarget"]==target and r["proposedTargetSha256"]==shat(target),"proposal linkage "+str(k))
 src_tokens=tokens(s["sourceText"]); reviewed=tokens(target)
 for name in ("placeholders","markupTags","numericTokens"):
  baseline_ja_one=(k==(3888,"ja") and name=="numericTokens")
  if reviewed[name]!=src_tokens[name] and not baseline_ja_one: token_mismatch+=1
  req(r["tokenIntegrity"][name]["source"]==src_tokens[name] and r["tokenIntegrity"][name]["reviewed"]==reviewed[name] and r["tokenIntegrity"][name]["reviewedMatchesSource"]==(reviewed[name]==src_tokens[name]),"token check "+name+" "+str(k))
  if baseline_ja_one: req(d=="accept-current" and reviewed==tokens(r["currentTarget"]) and reviewed[name]!=src_tokens[name] and r["tokenIntegrity"][name].get("acceptedEquivalentRendering"),"expected Japanese one-to-1 baseline "+str(k))
 missing=[x for x in src_tokens["protectedLiterals"] if x not in reviewed["protectedLiterals"]]
 req(not missing and r["tokenIntegrity"]["protectedLiterals"]["reviewedMatchesSource"],"protected literal "+str(k))
req(counts=={"accept-current":211,"correction":13,"refinement":16,"hold":0},"disposition totals")
req(token_mismatch==0,"selected target token mismatch")
req(sum(1 for r in rows if r["position"]==3888 and r["locale"]=="ja" and r["tokenIntegrity"]["numericTokens"]["currentMatchesSource"] is False)==1,"expected baseline Japanese one-to-1 diagnostic")
print(json.dumps({"result":"PASS","head":m["head"],"tree":m["tree"],"window":[3880,3899],"cells":240,"acceptCurrent":211,"corrections":13,"refinements":16,"holds":0,"proposals":29,"carriedPriorHashOnlyHolds":14,"proposedTargetTokenMismatches":0,"baselineJapaneseOneRenderedAs1":1},sort_keys=True))
