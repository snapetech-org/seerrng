#!/usr/bin/env python3
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
INP=ROOT.parent/"seerrng-pr418-w3580-3599-primary-20261103"/"candidate-free-input"
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def verify_sums(d):
 for line in (d/"SHA256SUMS.txt").read_text().splitlines():
  if line.strip():
   expected,name=line.split(None,1); name=name.strip().lstrip("*")
   assert sha((d/name).read_bytes())==expected,(str(d/name),"checksum")
verify_sums(INP); verify_sums(ROOT)
m=j(INP/"manifest.json"); w=j(INP/"window.json"); a=j(INP/"PR-attestation.json")
s=j(ROOT/"summary.json"); ledger=jl(ROOT/"blind-ledger.jsonl")
sources=jl(INP/"source-cells.jsonl"); cells=jl(INP/"current-target-cells.jsonl"); ctxs=jl(INP/"caller-contexts.jsonl")
assert (m["head"],m["tree"],m["window"])==("30f626a4626d460f426666cde02f5c1ed17fa206","9b2616780791c73eb176aca6ad53061f1f3587d8","W3580-W3599")
assert (w["head"],w["tree"],w["range"])==(m["head"],m["tree"],[3580,3599])
assert a["head"]==m["head"] and a["tree"]==m["tree"] and a["state"]=="OPEN" and a["isDraft"] is True
assert len(sources)==20 and len(cells)==240 and len(ctxs)==20 and len(ledger)==240
assert s["candidateFreeInput"]["manifestSha256"]==sha((INP/"manifest.json").read_bytes())
assert s["candidateFreeInput"]["checksumListSha256"]==sha((INP/"SHA256SUMS.txt").read_bytes())
assert [r["position"] for r in sources]==list(range(3580,3600))
assert s["counts"]=={d:sum(r["disposition"]==d for r in ledger) for d in ("propose","retain","hold")}
assert sum(s["counts"].values())==240
src_by={r["position"]:r for r in sources}; cell_by={(r["position"],r["locale"]):r for r in cells}; ctx_by={r["position"]:r for r in ctxs}
assert len(cell_by)==240
PH=re.compile(r"\{[^{}\r\n]+\}"); MK=re.compile(r"</?[A-Za-z][^<>]*?/?>"); NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
for r in ledger:
 k=(r["position"],r["locale"]); c=cell_by[k]; src=src_by[r["position"]]; ctx=ctx_by[r["position"]]
 assert r["sourceId"]==src["sourceId"]==c["sourceId"] and r["source"]==src["source"]==c["source"]
 assert r["sourceSha256"]==src["sourceSha256"]==c["sourceSha256"]
 assert r["currentTarget"]==c["currentTarget"] and r["currentTargetSha256"]==c["currentTargetSha256"]==st(c["currentTarget"])
 assert r["catalogPath"]==c["catalogPath"] and r["catalogGitBlob"]==c["catalogGitBlob"] and r["catalogSha256"]==c["catalogSha256"]
 assert r["callerResolution"]==ctx["callerResolution"] and r["callerCount"]==ctx["callerCount"]>0
 assert r["callerContextBlockIds"]==ctx["contextBlockIds"] and r["definitionFiles"]==ctx["definitionFiles"] and r["callerRefs"]==ctx["directMessageReferences"]
 assert r["targetSha256"]==st(r["target"])
 if r["disposition"]=="propose": assert r["proposedTarget"]==r["target"] and r["proposedTargetSha256"]==r["targetSha256"]
 else: assert r["proposedTarget"] is None and r["proposedTargetSha256"] is None and r["target"]==r["currentTarget"]
 assert r["disposition"] in {"propose","retain","hold"}
 assert r["sourceTokens"]["placeholders"]==PH.findall(src["source"])==PH.findall(r["target"])
 assert r["sourceTokens"]["markup"]==MK.findall(src["source"])==MK.findall(r["target"])
 assert r["sourceTokens"]["numeric"]==NUM.findall(src["source"])==NUM.findall(r["target"])
 assert all(x in r["target"] for x in r["sourceTokens"]["protectedLiterals"])
 assert all(r["structuralChecks"].values())
assert s["counts"]=={"propose":16,"retain":224,"hold":0}
assert s["callerlessHolds"]==0 and s["existingHoldsWithinWindow"]==0 and s["priorWindowHoldCount"]==0
assert s["finalStructuralMismatchCounts"]=={"placeholderMismatchCount":0,"markupMismatchCount":0,"numericTokenMismatchCount":0,"protectedLiteralMismatchCount":0}
assert sum(bool(r["hiddenFormatCharactersInFinalTarget"]) for r in ledger)==s["finalTargetsWithHiddenFormatCharacters"]
print(json.dumps({"result":"PASS","candidateFreeChecksum":"PASS","blindChecksum":"PASS","cells":len(ledger),"counts":s["counts"],"baselineMismatchCounts":s["baselineStructuralMismatchCounts"],"finalMismatchCounts":s["finalStructuralMismatchCounts"],"holdCount":s["counts"]["hold"],"summarySha256":sha((ROOT/"summary.json").read_bytes()),"checksumListSha256":sha((ROOT/"SHA256SUMS.txt").read_bytes())},indent=2))
