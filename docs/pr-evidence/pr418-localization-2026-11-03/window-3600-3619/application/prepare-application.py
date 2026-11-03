#!/usr/bin/env python3
"""Derive the exact apply plan from the sealed packets and pinned checkout."""
import collections, hashlib, json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
EV=HERE.parent
REPO=EV.parents[3]
IN=EV/'candidate-free-input'; PR=EV/'primary-review'; BL=EV/'blind-review'; CA=EV/'third-party-cross-audit'
HEAD='1fdec93d1b021e4ec7a7c2265230f59d81d2675e'; TREE='6234854dc0b1e7aee17ef2e819ffc2b5b2e386ce'
def sha(b): return hashlib.sha256(b).hexdigest()
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def verify_sums(d):
    expected={}
    for line in (d/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        if line.strip():
            h,n=line.split(None,1); expected[n.strip().lstrip('*')]=h
    actual={p.name for p in d.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
    assert set(expected)==actual,(d,'file inventory')
    for n,h in expected.items(): assert sha((d/n).read_bytes())==h,(d/n,'checksum')
    return sha((d/'SHA256SUMS.txt').read_bytes())
packet_sums={n:verify_sums(d) for n,d in [('candidateFreeInput',IN),('primaryReview',PR),('blindReview',BL),('crossAudit',CA)]}
assert j(IN/'manifest.json')['head']==HEAD and j(IN/'manifest.json')['tree']==TREE
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()==HEAD
assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=REPO,text=True).strip()==TREE
assert subprocess.run(['git','diff','--quiet'],cwd=REPO).returncode==0
assert subprocess.run(['git','diff','--cached','--quiet'],cwd=REPO).returncode==0
P={(x['position'],x['locale']):x for x in jl(PR/'primary-ledger.jsonl')}
B={(x['position'],x['locale']):x for x in jl(BL/'blind-ledger.jsonl')}
X={(x['position'],x['locale']):x for x in jl(CA/'cross-audit-resolution-ledger.jsonl')}
C={(x['position'],x['locale']):x for x in jl(IN/'current-target-cells.jsonl')}
S={x['position']:x for x in jl(IN/'source-cells.jsonl')}
locales=j(IN/'window.json')['localeOrder']; expected={(p,l) for p in range(3600,3620) for l in locales}
assert set(P)==set(B)==set(X)==set(C)==expected and len(expected)==240
cells=[]
for key in sorted(expected):
    x=X[key]; p=P[key]; b=B[key]; c=C[key]; s=S[key[0]]
    assert x['source']==s['source']==p['source']==b['source']
    assert x['currentTarget']==c['currentTarget']==p['currentTarget']==b['currentTarget']
    assert x['crossAuditTargetSha256']==sha(x['crossAuditTarget'].encode('utf-8'))
    if x['targetAgreement']:
        assert x['crossAuditTarget']==p['finalTarget']==b['reviewedTarget']
    else:
        assert x['crossAuditTarget'] in (p['finalTarget'],b['reviewedTarget'])
    assert x['crossAuditDisposition'] in {'accept-current','correction','refinement','hold'}
    assert (x['crossAuditDisposition']=='accept-current')==(x['crossAuditTarget']==x['currentTarget'])
    assert x['crossAuditDisposition']!='hold'
    assert x['callerContext']['callerCount']>0 and x['callerContext']['exactPinnedContextBlocks']
    cells.append({'position':key[0],'locale':key[1],'localeTag':x['localeTag'],'sourceId':s['sourceId'],'source':s['source'],'sourceSha256':s['sourceSha256'],
      'catalogPath':p['catalogPath'],'catalogGitBlob':p['catalogGitBlob'],'catalogSha256':p['catalogSha256'],
      'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],
      'finalTarget':x['crossAuditTarget'],'finalTargetSha256':x['crossAuditTargetSha256'],'disposition':x['crossAuditDisposition'],
      'resolutionBasis':x['resolutionBasis'],'crossAuditRationale':x['crossAuditRationale'],
      'callerContext':x['callerContext']})
changes=[x for x in cells if x['finalTarget']!=x['currentTarget']]
counts=collections.Counter(x['disposition'] for x in cells)
assert len(changes)==25 and counts=={'accept-current':215,'correction':20,'refinement':5}
assert {x['catalogPath'] for x in cells}=={f'src/i18n/locale/{l}.json' for l in locales}
plan={'schemaVersion':1,'status':'APPROVED_FOR_APPLICATION_BY_USER_REQUEST','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3600-W3619',
 'parentHead':HEAD,'parentTree':TREE,'localeOrder':locales,'sourceCount':20,'cellCount':240,'dispositions':dict(sorted(counts.items())),
 'changeCount':len(changes),'changedCatalogCount':len({x['catalogPath'] for x in changes}),
 'candidateFreeManifestSha256':sha((IN/'manifest.json').read_bytes()),'candidateFreeChecksumListSha256':packet_sums['candidateFreeInput'],
 'primaryChecksumListSha256':packet_sums['primaryReview'],'blindChecksumListSha256':packet_sums['blindReview'],'crossAuditChecksumListSha256':packet_sums['crossAudit'],
 'candidateFreeHead':HEAD,'candidateFreeTree':TREE,
 'cells':cells,'changes':changes}
(HERE/'approved-application-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'PASS','parentHead':HEAD,'parentTree':TREE,'cells':len(cells),'changes':len(changes),'changedCatalogCount':plan['changedCatalogCount'],'dispositions':plan['dispositions'],'packetChecksumLists':packet_sums},ensure_ascii=False,indent=2))
