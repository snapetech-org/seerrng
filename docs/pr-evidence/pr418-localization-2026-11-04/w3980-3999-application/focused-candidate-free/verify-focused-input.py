#!/usr/bin/env python3
import json, hashlib
from pathlib import Path
BASE=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3980-3999-primary-20261104/candidate-free-input")
HERE=Path(__file__).resolve().parent
obj=json.loads((HERE/"review-input.json").read_text())
manifest=json.loads((BASE/"manifest.json").read_text())
assert obj["binding"]["head"]==manifest["head"] and obj["binding"]["tree"]==manifest["tree"]
assert obj["binding"]["candidateFreeManifestSha256"]==hashlib.sha256((BASE/"manifest.json").read_bytes()).hexdigest()
def rows(path): return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]
src={int(x["position"]):x for x in rows(BASE/"selected-source-cells.jsonl")}
tgt={(int(x["position"]),x["locale"]):x for x in rows(BASE/"current-target-cells.jsonl")}
ctx={int(x["position"]):x for x in rows(BASE/"caller-contexts.jsonl")}
blocks={x["contextId"]:x for x in rows(BASE/"caller-context-blocks.jsonl")}
assert len(obj["cells"])==49 and len({(x["position"],x["locale"]) for x in obj["cells"]})==49
for c in obj["cells"]:
 p=int(c["position"]); loc=c["locale"]; s=src[p]; t=tgt[(p,loc)]; q=ctx[p]
 assert c["source"]["sourceId"]==s["sourceId"]==t["sourceId"]==q["sourceId"]
 assert c["source"]["sourceTextSha256"]==s["sourceTextSha256"]==t["sourceTextSha256"]
 assert c["currentTarget"]["currentTargetSha256"]==t["currentTargetSha256"]
 assert c["callerContext"]["callerContextSha256"]==q["callerContextSha256"]
 expected=[blocks[i] for i in q.get("contextBlockIds",[]) if i in blocks]
 assert c["callerContextBlocks"]==expected and not c["missingContextBlockIds"]
 assert not any(k.lower().startswith(("proposal","decision","rationale","disposition")) for k in c)
print(json.dumps({"result":"PASS","cells":len(obj["cells"]),"head":obj["binding"]["head"],"tree":obj["binding"]["tree"]},indent=2))
