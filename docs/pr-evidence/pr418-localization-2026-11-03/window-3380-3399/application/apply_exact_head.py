import hashlib,json,subprocess,sys
from pathlib import Path
repo=Path(sys.argv[1]).resolve()
root=Path(__file__).resolve().parent.parent
plan=[json.loads(x) for x in (root/"root-adjudication/apply-plan.jsonl").read_text(encoding="utf-8").splitlines()]
rows=[json.loads(x) for x in (root/"root-adjudication/root-adjudication.jsonl").read_text(encoding="utf-8").splitlines()]
expected="4d7de2c41b0e6df6cd0b7f7075c9cddd1c6ce160"
assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=repo,text=True).strip()==expected
idx={(r["position"],r["locale"]):r for r in rows}
for p in plan:
 path=repo/p["catalogPath"]; data=json.loads(path.read_text(encoding="utf-8")); current=data[p["sourceId"]]
 assert current==p["expectedCurrent"] and hashlib.sha256(current.encode()).hexdigest()==p["expectedCurrentSha256"]
 assert hashlib.sha256(idx[(p["position"],p["locale"])]["source"].encode()).hexdigest()==p["sourceSha256"]
 assert hashlib.sha256(p["newTarget"].encode()).hexdigest()==p["newTargetSha256"]
 data[p["sourceId"]]=p["newTarget"]; path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
for r in rows:
 data=json.loads((repo/r["targetCatalog"]).read_text(encoding="utf-8")); actual=data[r["sourceId"]]
 assert actual==r["selectedTarget"]
print(json.dumps({"inputHead":expected,"changes":len(plan),"readbackCells":len(rows)},indent=2))
