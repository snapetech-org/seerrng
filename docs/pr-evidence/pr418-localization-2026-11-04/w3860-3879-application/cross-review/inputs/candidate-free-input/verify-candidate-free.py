#!/usr/bin/env python3
import argparse,hashlib,json,re,subprocess
from pathlib import Path
from collections import Counter
O=Path(__file__).resolve().parent
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode())
def jl(n): return [json.loads(x) for x in (O/n).read_text(encoding="utf-8").splitlines() if x]
def j(n): return json.loads((O/n).read_text(encoding="utf-8"))
def req(x,m):
 if not x: raise SystemExit("FAIL: "+m)
def tokens(s):
 ph=re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}",s); tags=re.findall(r"<\/?[A-Za-z][^>]*>",s); nums=re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])",s); pat=r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise)(?![A-Za-z0-9])"; prot=[]
 for x in re.findall(pat,s):
  if x not in prot: prot.append(x)
 return {"placeholders":ph,"markupTags":tags,"numericTokens":nums,"protectedLiterals":prot}
m=j("manifest.json"); req(m["head"]=="12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e" and m["range"]==[3860,3879] and m["candidateFreeInputOnly"] and m["proposalCount"]==0 and not m["dispositionFieldsIncluded"],"manifest pin/type")
sums={}
for line in (O/"SHA256SUMS.txt").read_text().splitlines():
 d,n=line.split(None,1); sums[n.lstrip("* ")]=d
req(set(sums)=={p.name for p in O.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"},"checksum inventory")
for n,d in sums.items(): req(sha((O/n).read_bytes())==d,"checksum "+n)
win=j("window.json"); req(win["head"]==m["head"] and win["tree"]==m["tree"],"window pin")
src=jl("selected-source-cells.jsonl"); req(len(src)==20 and [x["position"] for x in src]==list(range(3860,3880)),"source range")
req(all(not any(k.lower().startswith(("disposition","proposal","rationale")) for k in x) for x in src),"source proposal leak")
order=jl("source-order-hashes.jsonl"); req(len(order)==9494 and [x["position"] for x in order]==list(range(9494)),"source order")
req(all(src[i]["sourceIdSha256"]==order[3860+i]["sourceIdSha256"] and src[i]["sourceTextSha256"]==order[3860+i]["sourceTextSha256"] for i in range(20)),"selected order binding")
cells=jl("current-target-cells.jsonl"); req(len(cells)==240 and [(x["position"],x["locale"]) for x in cells]==[(p,l) for p in range(3860,3880) for l in m["localeOrder"]],"cell order/count")
req(all(not any(k.lower().startswith(("disposition","proposal","rationale")) for k in x) for x in cells),"cell proposal leak")
ctx=jl("caller-contexts.jsonl"); blocks={x["contextId"]:x for x in jl("caller-context-blocks.jsonl")}; req(len(ctx)==20 and all(x["callerCount"]>0 for x in ctx),"caller coverage")
for c in ctx:
 d=next(blocks[z] for z in c["contextBlockIds"] if blocks[z]["contextType"]=="message-definition"); material={"sourceId":c["sourceId"],"namespace":c["namespace"],"definition":d,"directMessageReferences":c["directMessageReferences"],"dynamicRendererReferences":c["dynamicRendererReferences"]}; req(c["callerContextSha256"]==shat(json.dumps(material,ensure_ascii=False,sort_keys=True,separators=(",",":"))),"caller hash")
 for b in [blocks[z] for z in c["contextBlockIds"]]:
  for l in b["lines"]: req(l["lineSha256"]==shat(l["text"]),"caller line hash")
 for r in c["directMessageReferences"]+c["dynamicRendererReferences"]: req(r["lineSha256"]==shat(r["text"]),"reference line hash")
for c in cells:
 s=src[c["position"]-3860]; req(c["sourceId"]==s["sourceId"] and c["sourceTextSha256"]==s["sourceTextSha256"],"cell source binding"); req(c["currentTargetSha256"]==shat(c["currentTarget"]),"cell target hash"); st=tokens(s["sourceText"]); tt=tokens(c["currentTarget"]); req(c["sourceTokens"]==st,"source token record")
 for name in ("placeholders","markupTags","numericTokens"): req(c["tokenChecks"][name]=={"matches":st[name]==tt[name],"source":st[name],"target":tt[name]},"token check "+name)
 missing=[x for x in st["protectedLiterals"] if x not in tt["protectedLiterals"]]; req(c["tokenChecks"]["protectedLiterals"]=={"matches":not missing,"source":st["protectedLiterals"],"target":tt["protectedLiterals"],"missingFromTarget":missing},"protected literal check")
cat=j("catalog-file-pins.json"); req(cat["catalogKeyCount"]==9494 and len(cat["catalogFiles"])==13 and cat["localeOrder"]==m["localeOrder"] and cat["sortedKeySetParityWithEnglish"],"catalog pins")
prior=jl("prior-selection-hash-reattestation.jsonl"); req(len(prior)==3860 and all(x["sourceIdHashMatches"] and x["sourceTextHashMatches"] for x in prior),"prior source hash continuity")
app=jl("prior-applied-target-hash-reattestation.jsonl"); req(len(app)==100 and all(x["selectedTargetHashMatches"] for x in app),"prior selected targets")
h=jl("prior-hold-hash-reattestation.jsonl"); req(len(h)==14 and all(x["priorHoldPreserved"] and x["targetTextIncluded"] is False for x in h),"prior holds")
for n in ("PR-attestation.json","PR-attestation-after.json"):
 a=j(n); p=a["pullRequest"]; req(p["number"]==418 and p["state"]=="OPEN" and p["isDraft"] and p["headRefOid"]==m["head"] and p["baseRefOid"]==m["baseSha"] and a["tree"]==m["tree"] and a["deploymentsAtExpectedShaCount"]==0,"PR attestation")
if __import__("sys").argv[1:]:
 root=Path(__import__("sys").argv[2]); req(subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()==m["head"],"source worktree head"); req(subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD^{tree}"],text=True).strip()==m["tree"],"source worktree tree")
 for loc,pin in cat["catalogFiles"].items():
  p=root/pin["path"]; req(sha(p.read_bytes())==pin["sha256"],"source catalog bytes "+loc)
print(json.dumps({"result":"PASS","head":m["head"],"tree":m["tree"],"window":m["range"],"sourceCount":20,"cells":len(cells),"priorSelectedSourceHashes":len(prior),"priorAppliedTargets":len(app),"priorHolds":len(h),"callerReferences":sum(x["callerCount"] for x in ctx),"baselineTokenMismatchCounts":m["baselineTokenMismatchCounts"],"deployments":[0,0]},ensure_ascii=False,indent=2))
