#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
P=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3660-3679-primary-20261103")
B=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3660-3679-blind-20261103")
def loadj(p): return json.loads(p.read_text())
def rows(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
def h(s): return hashlib.sha256(s.encode("utf-8")).hexdigest()
M=loadj(ROOT/"manifest.json")
assert M["head"]=="eb279fc80be656f379cd893642bf741ba0a24d85" and M["tree"]=="85a73172719b38e99a4e74c0ef9a303164cb4fcb"
T={(x["position"],x["locale"]):x for x in rows(P/"candidate-free-input/current-target-cells.jsonl")}
A={(x["position"],x["locale"]):x for x in rows(P/"primary-review/primary-ledger.jsonl")}
C={(x["position"],x["locale"]):x for x in rows(B/"translation-ledger.jsonl")}
L=rows(ROOT/"cross-audit-ledger.jsonl"); U=rows(ROOT/"apply-plan.jsonl"); N=rows(ROOT/"no-op-plan.jsonl")
assert len(L)==240 and len(U)==47 and len(N)==193 and len(rows(ROOT/"hold-plan.jsonl"))==0
assert len({(x["position"],x["locale"]) for x in L})==240
for x in L:
 k=(x["position"],x["locale"]); t=T[k]; a=A[k]; c=C[k]
 assert x["head"]==M["head"]==t["head"]==a["head"]==c["head"]
 assert x["tree"]==M["tree"]==t["tree"]==a["tree"]==c["tree"]
 assert x["currentTarget"]==t["currentTarget"] and x["currentTargetSha256"]==t["currentTargetSha256"]==h(t["currentTarget"])
 assert x["sourceSha256"]==t["sourceSha256"]==a["sourceSha256"]==c["sourceSha256"]
 assert x["selectedTargetSha256"]==h(x["selectedTarget"])
 assert x["primaryProposedTargetSha256"]==h(a.get("proposedTarget",a["currentTarget"]))
 assert x["primaryLedgerRowSha256"] in [h(line) for line in (P/"primary-review/primary-ledger.jsonl").read_text().splitlines() if line.strip()]
 assert x["blindProposalSha256"]==c["proposalSha256"]
 assert x["blindLedgerRowSha256"] in [h(line) for line in (B/"translation-ledger.jsonl").read_text().splitlines() if line.strip()]
 assert x["disposition"]==("update" if x["selectedTarget"]!=x["currentTarget"] else "no-op")
 if x["selectedFrom"]=="primary": assert x["selectedTarget"]==a.get("proposedTarget",a["currentTarget"])
 if x["selectedFrom"]=="convergent": assert x["selectedTarget"]==a.get("proposedTarget",a["currentTarget"])==c["proposal"]
 if x["selectedFrom"]=="blind": assert x["selectedTarget"]==c["proposal"] and c["blindnessStatus"]=="strictly-blind"
 if (x["position"],x["locale"])==(3660,"es"):
  assert c["blindnessStatus"]=="target-exposure-limited" and not x["blindProposalUsed"] and x["selectedFrom"]=="current"
assert sum(x["selectedFrom"]=="blind" for x in U)==18
assert sum(x["selectedFrom"]=="primary" for x in U)==17
assert sum(x["selectedFrom"]=="convergent" for x in U)==12
assert all(x["disposition"]=="update" for x in U) and all(x["disposition"]=="no-op" for x in N)
H=rows(ROOT/"prior-hold-reattestation.jsonl"); H0=rows(P/"candidate-free-input/carry-forward-hold-hashes.jsonl"); H1=rows(B/"prior-hold-reattestation.jsonl")
assert len(H)==len(H0)==len(H1)==12
assert sorted((x["position"],x["locale"],x["currentTargetSha256"]) for x in H)==sorted((x["position"],x["locale"],x["currentTargetSha256"]) for x in H0)==sorted((x["position"],x["locale"],x["currentTargetSha256"]) for x in H1)
assert all(x["position"]==3632 and x["targetTextIncluded"] is False and x["retained"] for x in H)
print(json.dumps({"result":"PASS","head":M["head"],"tree":M["tree"],"cells":len(L),"updates":len(U),"noOps":len(N),"newHolds":0,"priorHolds":len(H),"targetExposureLimited":"3660/es, not used"},indent=2))
