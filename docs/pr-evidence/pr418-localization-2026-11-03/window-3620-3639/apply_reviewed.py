#!/usr/bin/env python3
from pathlib import Path
import collections,hashlib,json,subprocess

E=Path(__file__).resolve().parent
REPO=E.parents[3]
BASE='ebf1cb6082ef173688227c507acfdc04c3cf7ca7'
TREE='e3c4d1d10f40ea078b66dfdf942e99c8189fee0c'
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()
def sha(b): return hashlib.sha256(b).hexdigest()
plan=json.loads((E/'apply-plan.json').read_text())
assert plan['baseHead']==BASE and plan['baseTree']==TREE
assert git('rev-parse','HEAD')==BASE and git('rev-parse','HEAD^{tree}')==TREE
status=git('status','--porcelain','--untracked-files=all').splitlines()
evidence_prefix=E.relative_to(REPO).as_posix()+'/'
assert all(line[3:].startswith(evidence_prefix) for line in status),status
changed={(x['sourceId'],x['locale']):x for x in plan['updates']}
assert len(changed)==33
all_rows=plan['allCellReadbackPlan']
assert len(all_rows)==240
catalog_paths=sorted({x['catalogPath'] for x in all_rows})
before={}
after={}
for path in catalog_paths:
 raw=subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=REPO)
 expected=[x for x in all_rows if x['catalogPath']==path]
 assert all(sha(raw)==x['catalogSha256'] for x in expected)
 assert all(git('rev-parse',f'{BASE}:{path}')==x['catalogGitBlob'] for x in expected)
 data=json.loads(raw.decode('utf-8'))
 assert raw.decode('utf-8')==json.dumps(data,ensure_ascii=False,indent=2)+'\n'
 before[path]=data
 after[path]=json.loads(raw.decode('utf-8'))
for x in plan['updates']:
 path=x['catalogPath']; key=x['sourceId']
 assert key in before[path]
 current=before[path][key]
 assert current==x['currentTarget'] and sha(current.encode())==x['currentTargetSha256']
 assert x['selectedTarget']!=current
 after[path][key]=x['selectedTarget']
for path,data in after.items():
 updates={x['sourceId']:x['selectedTarget'] for x in plan['updates'] if x['catalogPath']==path}
 for key,value in before[path].items():
  assert data[key]==updates.get(key,value),(path,key,'unexpected target')
 assert list(data)==list(before[path]) and set(data)==set(before[path])
 out=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
 (REPO/path).write_text(out,encoding='utf-8')
 for key,value in data.items():
  if key not in updates: assert value==before[path][key]
counts=collections.Counter(x['resolution'] for x in all_rows)
result={'schemaVersion':1,'status':'applied-uncommitted','reviewedBaseHead':BASE,'reviewedBaseTree':TREE,'cells':240,'resolutions':dict(sorted(counts.items())),'changedCells':33,'changedCatalogs':len(plan['changedCatalogs'] and {x['catalogPath'] for x in plan['updates']}),'nonTargetChanges':0,'keyOrderPreserved':True,'holds':12,'catalogs':{p:sha((REPO/p).read_bytes()) for p in catalog_paths},'testsBuildsScansCi':'not run'}
(E/'application-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pass':True,'base':BASE,'cells':240,'changes':33,'changedCatalogs':len({x['catalogPath'] for x in plan['updates']}),'nonTargetChanges':0,'holds':12},indent=2))
