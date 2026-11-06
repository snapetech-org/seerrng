#!/usr/bin/env python3
from pathlib import Path
import collections, hashlib, json

E=Path(__file__).resolve().parent
BASE='ebf1cb6082ef173688227c507acfdc04c3cf7ca7'
TREE='e3c4d1d10f40ea078b66dfdf942e99c8189fee0c'
repo='snapetech-org/seerrng'
cf=json.loads((E/'candidate-free-input/manifest.json').read_text())
crossm=json.loads((E/'cross-audit/manifest.json').read_text())
assert (cf['head'],cf['tree'],cf['repository'],cf['pullRequest'])==(BASE,TREE,repo,418)
assert (crossm['head'],crossm['tree'],crossm['repository'],crossm['pullRequest'])==(BASE,TREE,repo,418)
def rows(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
cells=rows(E/'candidate-free-input/current-target-cells.jsonl')
audits=rows(E/'cross-audit/cross-audit-ledger.jsonl')
assert len(cells)==len(audits)==240
idx=lambda arr,key:{(r['position'],r['locale']):r for r in arr}
ci,ai=idx(cells,None),idx(audits,None)
assert ci.keys()==ai.keys()
counts=collections.Counter()
plan=[]
changed=[]
for key in sorted(ci):
 c,a=ci[key],ai[key]
 assert a['repository']==repo and a['pullRequest']==418 and a['head']==BASE and a['tree']==TREE
 assert (a['sourceId'],a['source'],a['sourceSha256'])==(c['sourceId'],c['source'],c['sourceSha256'])
 assert (a['currentTarget'],a['currentTargetSha256'])==(c['currentTarget'],c['currentTargetSha256'])
 assert (a['catalogPath'],a['catalogSha256'],a['catalogGitBlob'])==(c['catalogPath'],c['catalogSha256'],c['catalogGitBlob'])
 if 'tokenAudit' in a:
  assert all(v=='PASS' for k,v in a['tokenAudit'].items() if k in ('icuRuntimeBranchCoverage','markup','numericValues','placeholders','protectedLiterals'))
 else:
  assert a['resolution']=='hold'
 assert c['sourceId']==a['namespace']+'.'+c['sourceKey']
 res=a['resolution']; counts[res]+=1
 assert res in ('retain-current','adopt-blind-proposal','cross-audit-target','hold')
 selected=a['resolvedTarget'] if a['resolvedTarget'] is not None else c['currentTarget']
 selected_hash=hashlib.sha256(selected.encode()).hexdigest()
 if a['resolvedTarget'] is not None:
  assert a['resolvedTargetSha256']==selected_hash
 if res=='hold':
  assert c['position']==3632 and a['callerless'] is True
  assert selected==c['currentTarget']
 else:
  assert not a['callerless']
 if selected!=c['currentTarget']:
  changed.append({'position':c['position'],'locale':c['locale'],'sourceId':c['sourceId'],'source':c['source'],'namespace':a['namespace'],'sourceKey':c['sourceKey'],'catalogPath':c['catalogPath'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'selectedTarget':selected,'selectedTargetSha256':selected_hash,'resolution':res,'sourceSha256':c['sourceSha256'],'callerContextSha256':a['callerContextSha256'],'catalogSha256':c['catalogSha256'],'catalogGitBlob':c['catalogGitBlob']})
 plan.append({'position':c['position'],'locale':c['locale'],'sourceId':c['sourceId'],'source':c['source'],'namespace':a['namespace'],'sourceKey':c['sourceKey'],'catalogPath':c['catalogPath'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'selectedTarget':selected,'selectedTargetSha256':selected_hash,'resolution':res,'changed':selected!=c['currentTarget'],'sourceSha256':c['sourceSha256'],'callerContextSha256':a['callerContextSha256'],'catalogSha256':c['catalogSha256'],'catalogGitBlob':c['catalogGitBlob']})
assert counts==collections.Counter({'retain-current':195,'adopt-blind-proposal':12,'cross-audit-target':21,'hold':12}),counts
assert len(changed)==33
assert {x['position'] for x in plan if x['resolution']=='hold'}=={3632}
doc={'schemaVersion':1,'repository':repo,'pullRequest':418,'branch':'codex/seerrng-localization-overhaul-20261028','baseHead':BASE,'baseTree':TREE,'reviewedCells':240,'resolutions':dict(sorted(counts.items())),'changedCells':33,'changedCatalogs':len({x['catalogPath'] for x in changed}),'updates':changed,'allCellReadbackPlan':plan}
(E/'apply-plan.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pass':True,'cells':240,'counts':dict(counts),'changes':len(changed),'catalogs':doc['changedCatalogs'],'holds':12},indent=2))
