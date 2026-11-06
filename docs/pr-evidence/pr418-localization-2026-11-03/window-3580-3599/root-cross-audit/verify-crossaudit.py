#!/usr/bin/env python3
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
TASK=ROOT.parent
if (TASK/"candidate-free-input").is_dir():
 INP=TASK/"candidate-free-input"
 PRI=TASK/"primary-review"
 BLIND=TASK/"blind-review"
else:
 INP=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-primary-20261103/candidate-free-input")
 PRI=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-primary-20261103/primary-review")
 BLIND=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-blind-20261103")
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def sums(d):
 for line in (d/"SHA256SUMS.txt").read_text().splitlines():
  if line.strip():
   digest,name=line.split(None,1); name=name.strip().lstrip("*")
   assert sha((d/name).read_bytes())==digest,(str(d/name),"checksum")
for d in (INP,PRI,BLIND,ROOT): sums(d)
m=j(INP/"manifest.json"); w=j(INP/"window.json"); s=j(ROOT/"summary.json"); plan=j(ROOT/"application-plan-proposal.json")
P=jl(PRI/"primary-ledger.jsonl"); B=jl(BLIND/"blind-ledger.jsonl"); R=jl(ROOT/"root-decision-ledger.jsonl"); D=jl(ROOT/"proposal-disagreements.jsonl"); U=plan["updates"]
sources=jl(INP/"source-cells.jsonl"); cells=jl(INP/"current-target-cells.jsonl"); ctxs=jl(INP/"caller-contexts.jsonl")
assert m["head"]==s["pin"]["head"]==plan["head"]=="30f626a4626d460f426666cde02f5c1ed17fa206"
assert m["tree"]==s["pin"]["tree"]==plan["tree"]=="9b2616780791c73eb176aca6ad53061f1f3587d8"
assert len(sources)==20 and len(cells)==len(P)==len(B)==len(R)==240
assert s["candidateFreeInput"]["manifestSha256"]==sha((INP/"manifest.json").read_bytes())
assert s["primary"]["checksumListSha256"]==sha((PRI/"SHA256SUMS.txt").read_bytes())
assert s["blind"]["checksumListSha256"]==sha((BLIND/"SHA256SUMS.txt").read_bytes())
assert len({(r["position"],r["locale"]) for r in R})==240
pmap={(r["position"],r["locale"]):r for r in P}; bmap={(r["position"],r["locale"]):r for r in B}
cmap={(r["position"],r["locale"]):r for r in cells}; cmapx={r["position"]:r for r in ctxs}
PH=re.compile(r"\{[^{}\r\n]+\}"); MK=re.compile(r"</?[A-Za-z][^<>]*?/?>"); NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
for r in R:
 k=(r["position"],r["locale"]); p=pmap[k]; b=bmap[k]; c=cmap[k]; ctx=cmapx[r["position"]]
 assert r["sourceId"]==p["sourceId"]==b["sourceId"]==c["sourceId"]
 assert r["source"]==p["source"]==b["source"]==c["source"]
 assert r["currentTarget"]==p["currentTarget"]==b["currentTarget"]==c["currentTarget"]
 assert r["currentTargetSha256"]==st(r["currentTarget"])==c["currentTargetSha256"]
 assert r["primaryTarget"]==p["finalTarget"] and r["blindTarget"]==b["target"]
 assert r["primaryTargetSha256"]==st(r["primaryTarget"]) and r["blindTargetSha256"]==st(r["blindTarget"])
 assert r["rootTargetSha256"]==st(r["rootTarget"])
 assert r["callerRefs"]==ctx["directMessageReferences"]==b["callerRefs"]
 assert r["callerCount"]==ctx["callerCount"]==b["callerCount"]>0
 assert r["catalogPath"]==c["catalogPath"]==p["catalogPath"]==b["catalogPath"]
 assert r["catalogGitBlob"]==c["catalogGitBlob"]==p["catalogGitBlob"]==b["catalogGitBlob"]
 assert r["catalogSha256"]==c["catalogSha256"]==p["catalogSha256"]==b["catalogSha256"]
 src=next(x for x in sources if x["position"]==r["position"])
 assert r["rootStructuralChecks"]["placeholdersPreserved"]==(src["sourcePlaceholders"]==PH.findall(r["rootTarget"]))
 assert r["rootStructuralChecks"]["markupPreserved"]==(src["sourceMarkupTokens"]==MK.findall(r["rootTarget"]))
 assert r["rootStructuralChecks"]["numericTokensPreserved"]==(src["sourceNumericTokens"]==NUM.findall(r["rootTarget"]))
 assert r["rootStructuralChecks"]["protectedLiteralsPreserved"]==all(t in r["rootTarget"] for t in src["sourceProtectedLiterals"])
 assert all(r["rootStructuralChecks"].values())
assert s["rootCounts"]=={"propose-update":28,"retain-current":212,"hold":0}
assert s["rootUpdates"]==len(U)==28 and len({(r["position"],r["locale"]) for r in U})==28
assert s["reviewerTargetDisagreements"]==len(D)
assert plan["authorizedForApplication"] is False and plan["holdCount"]==0
assert s["baselineStructuralMismatchCounts"]=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1}
assert s["finalStructuralMismatchCounts"]=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":0}
assert s["deduplication"]["uniqueSourceIds"] and s["deduplication"]["uniqueSourceLocaleCells"] and s["deduplication"]["uniqueUpdates"]
assert all(x["rootDisposition"]=="propose-update" for x in R if x["rootTarget"]!=x["currentTarget"])
assert all(x["rootDisposition"]=="retain-current" for x in R if x["rootTarget"]==x["currentTarget"])
for x in D:
 k=(x["position"],x["locale"]); r=next(y for y in R if (y["position"],y["locale"])==k)
 assert x["primaryTarget"]==r["primaryTarget"] and x["blindTarget"]==r["blindTarget"] and x["rootTarget"]==r["rootTarget"]
# Check the root manifest points at every artifact other than its checksum list.
entries=[]
for line in (ROOT/"SHA256SUMS.txt").read_text().splitlines():
 d,n=line.split(None,1); entries.append((n.strip().lstrip("*"),d))
assert len(entries)==len({n for n,d in entries})
assert {n for n,d in entries}=={p.name for p in ROOT.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
for n,d in entries: assert sha((ROOT/n).read_bytes())==d,n
print(json.dumps({"result":"PASS","inputPrimaryBlindChecksums":"PASS","rootChecksums":"PASS","cells":len(R),"rootCounts":s["rootCounts"],"updates":len(U),"disagreements":len(D),"baselineMismatchCounts":s["baselineStructuralMismatchCounts"],"finalMismatchCounts":s["finalStructuralMismatchCounts"],"summarySha256":sha((ROOT/"summary.json").read_bytes()),"checksumListSha256":sha((ROOT/"SHA256SUMS.txt").read_bytes())},indent=2))
