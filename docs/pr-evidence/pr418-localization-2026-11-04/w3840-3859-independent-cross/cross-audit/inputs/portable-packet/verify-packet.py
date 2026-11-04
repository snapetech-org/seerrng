#!/usr/bin/env python3
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
HEAD="ba5bb93cdb4f107a8337aae228b7cd397e1140a6"
TREE="5420ae8fa33bda3619650757a2930a0114dbe4d1"
def sha(b):return hashlib.sha256(b).hexdigest()
checks={}
for line in (ROOT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    digest,name=line.split(None,1); checks[name.lstrip('* ')]=digest
actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
assert set(checks)==actual,(set(checks)^actual)
for name,digest in checks.items():assert sha((ROOT/name).read_bytes())==digest,name
cf=subprocess.run(['python3',str(ROOT/'candidate-free-input'/'verify-candidate-free.py')],capture_output=True,text=True,check=True)
pr=subprocess.run(['python3',str(ROOT/'primary-review'/'verify-primary-review.py')],capture_output=True,text=True,check=True)
cfr=json.loads(cf.stdout); prr=json.loads(pr.stdout); summary=json.loads((ROOT/'summary.json').read_text(encoding='utf-8'))
input_manifest=json.loads((ROOT/'candidate-free-input'/'manifest.json').read_text(encoding='utf-8'))
assert cfr['result']=='PASS' and prr['result']=='PASS'
assert cfr['head']==HEAD==prr['head']==summary['head'] and cfr['tree']==TREE==prr['tree']==summary['tree']
assert cfr['cells']==240 and prr['cells']==240 and prr['proposals']==44 and prr['holds']==0
assert summary['primaryReview']['dispositionCounts']=={k:prr['dispositions'].get(k,0) for k in ('accept-current','correction','refinement','hold')}
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'candidateFreeInputVerifier':'PASS','primaryReviewVerifier':'PASS','cells':240,'dispositions':prr['dispositions'],'proposals':prr['proposals'],'holds':prr['holds'],'candidateFreeChecksums':len(input_manifest['fileNames'])+1,'bundleFileChecksums':len(checks)},ensure_ascii=False,indent=2))
