import json,hashlib,pathlib,re
out=pathlib.Path(__file__).resolve().parent
inp=pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3600-3619-primary-20261103/candidate-free-input")
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((inp/"manifest.json").read_text())
for f in m["files"]:
 p=inp/f["path"]
 assert p.is_file() and sha(p)==f["sha256"] and p.stat().st_size==f["byteCount"],f["path"]
rows=[json.loads(x) for x in (out/"blind-ledger.jsonl").read_text().splitlines()]
summary=json.loads((out/"summary.json").read_text())
src={r["position"]:r for r in (json.loads(x) for x in (inp/"source-cells.jsonl").read_text().splitlines())}
cells={(r["position"],r["locale"]):r for r in (json.loads(x) for x in (inp/"current-target-cells.jsonl").read_text().splitlines())}
locales=summary["localeOrder"]; seen=set()
assert len(rows)==240
for r in rows:
 k=(r["position"],r["locale"]); assert k not in seen; seen.add(k)
 assert k in cells
 c=cells[k]; s=src[k[0]]
 assert r["sourceId"]==s["sourceId"] and r["source"]==s["source"] and r["sourceSha256"]==s["sourceSha256"]
 assert r["currentTarget"]==c["currentTarget"] and r["currentTargetSha256"]==c["currentTargetSha256"]
 t=r["reviewedTarget"]
 assert (r["disposition"]=="accept-current")== (t==r["currentTarget"])
 assert all(x in t for x in s.get("sourceProtectedLiterals",[])),(k,"protected")
 assert re.findall(r"\{[A-Za-z_][A-Za-z0-9_]*\}",t)==s.get("sourcePlaceholders",[]),(k,"placeholder")
 assert r["tokenAudit"]["protectedLiteralsPresent"] and r["tokenAudit"]["placeholdersMatch"]
 assert r["callerContext"]["callerCount"]==1
assert seen=={(p,l) for p in range(3600,3620) for l in locales}
counts={d:sum(r["disposition"]==d for r in rows) for d in ["accept-current","correction","refinement","hold"]}
assert counts==summary["dispositions"]=={"accept-current":221,"correction":16,"refinement":3,"hold":0}
assert summary["candidateFreeManifestJsonSha256"]==sha(inp/"manifest.json")
assert summary["candidateFreeChecksumListSha256"]==sha(inp/"SHA256SUMS.txt")
assert summary["primaryReviewDirectoryAccessed"] is False
print("PASS: 240/240 cells, source/caller lineage, targets and tokens; counts "+json.dumps(counts,sort_keys=True))
