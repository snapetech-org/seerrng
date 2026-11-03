from __future__ import annotations
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parent
def sha(s:str)->str:return hashlib.sha256(s.encode('utf-8')).hexdigest()
plan=[json.loads(x) for x in (p/'apply-plan-240-cells.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
rows=[json.loads(x) for x in (p/'readback-240-cells.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
s=json.loads((p/'summary.json').read_text(encoding='utf-8'))
assert len(plan)==len(rows)==240
assert all(x['matches'] for x in rows)
assert sum(x['changedFromParent'] for x in rows)==21
assert sum(x['selectedForApplication'] for x in plan)==21
assert s['readbackMatches']==240 and s['unplannedNonTargetChanges']==0
assert s['orderedCatalogKeysPreserved'] and s['finalDispositions']=={'accept-current':219,'correction':6,'refinement':15}
print({'cells':240,'selectedChanges':21,'allReadbacksMatch':True,'nonTargetChanges':0,'keyOrderPreserved':True})
