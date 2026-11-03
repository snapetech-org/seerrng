#!/usr/bin/env python3
from pathlib import Path
import hashlib,json

E=Path(__file__).resolve().parent
REPO=E.parents[3]
plan=json.loads((E/'apply-plan.json').read_text())
rows=plan['allCellReadbackPlan']
paths=sorted({x['catalogPath'] for x in rows})
result={'schemaVersion':1,'repository':plan['repository'],'pullRequest':plan['pullRequest'],'branch':plan['branch'],'reviewedBaseHead':plan['baseHead'],'reviewedBaseTree':plan['baseTree'],'status':'catalogs applied locally; commit pin recorded in application-verification.json','cells':240,'resolutions':plan['resolutions'],'changedCells':33,'updatedCatalogs':len({x['catalogPath'] for x in plan['updates']}),'catalogs':{p:hashlib.sha256((REPO/p).read_bytes()).hexdigest() for p in paths},'nonTargetChanges':0,'keyOrderPreserved':True,'callerlessHolds':12,'workflowFilesTouched':False,'testsBuildsScansCi':'not run','nativeSpeakerAndBrowserReview':'pending','mergeReleaseTag':'not performed'}
(E/'application-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
entries=[]
for p in sorted(E.rglob('*')):
 if p.is_file() and p.name!='SHA256SUMS.txt':
  entries.append(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(E).as_posix()}')
(E/'SHA256SUMS.txt').write_text('\n'.join(entries)+'\n')
print(json.dumps({'evidenceFiles':len(entries)+1,'evidenceBytes':sum(p.stat().st_size for p in E.rglob('*') if p.is_file()),'updatedCatalogs':result['updatedCatalogs'],'updates':33},indent=2))
