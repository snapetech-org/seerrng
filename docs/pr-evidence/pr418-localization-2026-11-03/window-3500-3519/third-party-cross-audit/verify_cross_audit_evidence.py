from __future__ import annotations
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parent
def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()
rows=[json.loads(x) for x in (p/'cross-audit-ledger.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
s=json.loads((p/'summary.json').read_text(encoding='utf-8'))
d=json.loads((p/'disagreement-and-hold-summary.json').read_text(encoding='utf-8'))
a=json.loads((p/'attestation.json').read_text(encoding='utf-8'))
assert len(rows)==240 and len({(r['position'],r['locale']) for r in rows})==240
assert s['finalDispositions']=={'accept-current':219,'correction':6,'refinement':15}
assert s['selectedChanges']==21 and sum(r['selectedForApplication'] for r in rows)==21
assert all(r['head']==s['head'] and r['tree']==s['tree'] for r in rows)
assert all(r['callerCount']>0 and r['placeholderSequenceMatchesSource'] and r['placeholderTokenSetMatchesSource'] for r in rows)
assert d['holdCount']==0 and a['remoteHeadVerified'] and a['checksumsVerified']
assert a['crossAuditLedgerSha256']==sha((p/'cross-audit-ledger.jsonl').read_bytes())
print({'rows':len(rows),'selectedChanges':21,'dispositionCounts':s['finalDispositions'],'dispositionDisagreements':d['dispositionDisagreementCount'],'targetDisagreements':d['targetDisagreementCount'],'holds':0,'allPlaceholdersPass':True})
