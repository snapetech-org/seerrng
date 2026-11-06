#!/usr/bin/env python3
import hashlib, json
from pathlib import Path
ROOT=Path("/home/keith/Documents/code/task-scratch")
CF=ROOT/"seerrng-pr418-w3980-3999-primary-20261104/candidate-free-input"
CROSS=ROOT/"seerrng-pr418-w3980-3999-cross-review-20261104/cross-review.json"
FOCUSED=ROOT/"seerrng-pr418-w3980-3999-focused-candidate-free-20261105"
OUT=Path(__file__).resolve().parent
obj=json.loads((OUT/"root-adjudication.json").read_text())
x=json.loads(CROSS.read_text()); f=json.loads((FOCUSED/"blind-review.json").read_text())
def jl(p): return [json.loads(s) for s in p.read_text().splitlines() if s.strip()]
cur={(int(c["position"]),c["locale"]):c for c in jl(CF/"current-target-cells.jsonl")}
xc={(int(c["position"]),c["locale"]):c for c in x["cells"]}
fc={(int(c["position"]),c["locale"]):c for c in f["cells"]}
keys=set()
for group in ("apply","acceptCurrent","holds"):
 for c in obj["decisions"][group]:
  k=(int(c["position"]),c["locale"]); assert k not in keys; keys.add(k)
  assert k in cur and k in xc
  assert c["currentTargetSha256"]==cur[k]["currentTargetSha256"]==xc[k]["currentTargetSha256"]
  assert c["callerContextSha256"]==xc[k]["callerContextSha256"]
  if group=="apply":
   assert c["decision"]=="apply"
   assert hashlib.sha256(c["selectedTarget"].encode()).hexdigest()==c["selectedTargetSha256"]
   ct=xc[k].get("recommendedTarget")
   if c["selectedTarget"]!=ct:
    assert k in fc and fc[k].get("proposedText")==c["selectedTarget"]
  if group=="holds": assert c["decision"]=="hold" and c["position"]==3987
  if group=="acceptCurrent": assert c["decision"]=="accept-current" and c["currentTarget"]==cur[k]["currentTarget"]
assert len(keys)==240
assert len(obj["decisions"]["apply"])==43 and len(obj["decisions"]["acceptCurrent"])==185 and len(obj["decisions"]["holds"])==12
assert obj["reviewProcessExposure"]["crossReviewNotIndependent"] is True
print(json.dumps({"result":"PASS","cells":len(keys),"apply":43,"acceptCurrent":185,"holds":12,"head":obj["head"],"tree":obj["tree"]},indent=2))
