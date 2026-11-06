#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent; E=O/'evidence'; C=E/'candidate-free-input'; P=E/'primary-review'; B=E/'blind-review'
HEAD='3f57a9a14857b56ec65fe5710050a881aab2730e'; TREE='12f6e8fe933d15155c8b6aa734065b8229dc2cbc'
BRANCH='codex/seerrng-localization-overhaul-20261028'; BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def j(root,n):return json.loads((root/n).read_text(encoding='utf-8'))
def jl(root,n):return [json.loads(x) for x in (root/n).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
 ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s); tags=re.findall(r'<\/?[A-Za-z][^>]*>',s); nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
 pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
 prot=[]
 for x in re.findall(pat,s):
  if x not in prot:prot.append(x)
 return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
m=j(O,'manifest.json')
sums={}
for line in (O/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 d,n=line.split(None,1); sums[n.lstrip('* ')]=d
all_files={x.relative_to(O).as_posix() for x in O.rglob('*') if x.is_file() and x.relative_to(O).as_posix()!='SHA256SUMS.txt'}
assert set(sums)==all_files
assert set(m['fileNames'])==all_files-{'manifest.json'}
for n,d in sums.items():assert sha((O/n).read_bytes())==d,n
assert m['head']==HEAD and m['tree']==TREE and m['range']==[3780,3799] and m['cellCount']==240
assert m['localeOrder']==list(LOCALES) and m['crossDispositionCounts']=={'accept-current':220,'select-proposal':20}
# Every copied input packet has its own full checksum and expected head.
for root in (C,P,B):
 inner={}
 for line in (root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  d,n=line.split(None,1); inner[n.lstrip('* ')]=d
 assert set(inner)=={x.name for x in root.iterdir() if x.is_file() and x.name!='SHA256SUMS.txt'}
 for n,d in inner.items():assert sha((root/n).read_bytes())==d,(root,n)
 assert j(root,'manifest.json')['head']==HEAD and j(root,'manifest.json')['tree']==TREE
# Run the portable candidate-free, primary, and blind verifiers from the copied evidence.
for root,tool in ((C,'verify-candidate-free.py'),(P,'verify-primary.py'),(B,'verify-blind.py')):
 subprocess.run([sys.executable,str(root/tool)],check=True,stdout=subprocess.DEVNULL)
im=m['inputPackets']
assert im['candidate-free']['manifestSha256']==sha((C/'manifest.json').read_bytes()) and im['candidate-free']['checksumListSha256']==sha((C/'SHA256SUMS.txt').read_bytes())
assert im['primary']['manifestSha256']==sha((P/'manifest.json').read_bytes()) and im['primary']['checksumListSha256']==sha((P/'SHA256SUMS.txt').read_bytes())
assert im['blind']['manifestSha256']==sha((B/'manifest.json').read_bytes()) and im['blind']['checksumListSha256']==sha((B/'SHA256SUMS.txt').read_bytes())
# Exact live PR/ref/tree/deployment snapshots before and after cross-review.
for name in ('live-attestation-before.json','live-attestation-after.json'):
 a=j(O,name); p=a['pullRequest']
 assert p['number']==418 and p['state']=='OPEN' and p['isDraft'] is True and p['headRefName']==BRANCH and p['headRefOid']==HEAD and p['baseRefName']=='main' and p['baseRefOid']==BASE
 assert a['branchRef']==HEAD and a['pullRef']==HEAD and a['tree']==TREE and a['deploymentsAtExpectedShaCount']==0
for name in ('remote-refs-before.tsv','remote-refs-after.tsv'):
 assert all(x.split('\t')[0]==HEAD for x in (O/name).read_text().splitlines())
for name in ('deployments-before.json','deployments-after.json'):
 d=j(O,name); assert d['sha']==HEAD and d['count']==0
src={x['position']:x for x in jl(C,'selected-source-cells.jsonl')}
ctx={x['position']:x for x in jl(C,'caller-contexts.jsonl')}
cur={(x['position'],x['locale']):x for x in jl(C,'current-target-cells.jsonl')}
primary={(x['position'],x['locale']):x for x in jl(P,'primary-ledger.jsonl')}
blind={(x['position'],x['locale']):x for x in jl(B,'blind-ledger.jsonl')}
rows=jl(O,'cross-ledger.jsonl'); assert len(rows)==240
assert [(x['position'],x['locale']) for x in rows]==[(p,l) for p in range(3780,3800) for l in LOCALES]
counts=Counter(); proposals=set(); current_bad=[]; proposal_differences=[]
for r in rows:
 k=(r['position'],r['locale']); c=cur[k]; s=src[k[0]]; x=ctx[k[0]]; p=primary[k]; b=blind[k]
 assert r['head']==HEAD and r['tree']==TREE
 assert r['sourceId']==s['sourceId']==c['sourceId']==p['sourceId']==b['sourceId']
 assert r['sourceIdSha256']==s['sourceIdSha256']==p['sourceIdSha256']==b['sourceIdSha256']
 assert r['sourceTextSha256']==s['sourceTextSha256']==c['sourceTextSha256']
 assert r['currentTarget']==c['currentTarget']==p['currentTarget']==b['currentTarget']
 assert r['currentTargetSha256']==c['currentTargetSha256']==p['currentTargetSha256']==b['currentTargetSha256']
 assert r['callerContextSha256']==c['callerContextSha256']==p['callerContextSha256']==b['callerContextSha256']==x['callerContextSha256']
 assert r['primaryDisposition']==p['disposition'] and r['blindDisposition']==b['disposition']
 assert r['primaryProposedTarget']==p['proposedTarget'] and r['blindProposedTarget']==b['proposedTarget']
 st=tokens(s['sourceText']); ct=tokens(c['currentTarget'])
 missing=[z for z in st['protectedLiterals'] if z not in ct['protectedLiterals']]
 if missing:current_bad.append(k)
 if r['crossDisposition']=='accept-current':
  assert p['proposedTarget'] is None and b['proposedTarget'] is None and r['selectedTarget'] is None and r['selectedTargetSha256'] is None
  assert r['selectedDisposition']=='accept-current' and not missing
 else:
  assert r['crossDisposition']=='select-proposal' and p['proposedTarget'] is not None and b['proposedTarget'] is not None
  assert r['selectedTarget'] is not None and r['selectedTargetSha256']==shat(r['selectedTarget']) and r['selectedTarget']!=c['currentTarget']
  assert r['selectedDisposition'] in ('correct','refine'); proposals.add(k)
  pt=tokens(r['selectedTarget'])
  for n in ('placeholders','markupTags','numericTokens'):assert st[n]==pt[n]
  assert all(x in pt['protectedLiterals'] for x in st['protectedLiterals'])
  if p['proposedTarget']!=b['proposedTarget']:
   proposal_differences.append(k); assert r['selectedTarget']==p['proposedTarget'] and r['selectionMethod']=='primary-wording-selected-after-meaning-review'
 counts[r['crossDisposition']]+=1
assert counts==Counter({'accept-current':220,'select-proposal':20}) and len(proposals)==20
assert current_bad==[(3785,'hi')]
assert proposal_differences==[(3784,'zh-Hant')]
assert m['selectedChanges']==20 and m['selectedProposalTokenFailures']==0 and m['priorSelectionHashReattestations']==3780 and m['priorHoldHashReattestations']==12 and m['priorHoldsUnchanged']==12
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':len(rows),'dispositions':dict(counts),'selectedChanges':len(proposals),'currentProtectedLiteralFailureCells':current_bad,'primaryBlindDispositionDisagreements':0,'exactTargetDifferencesResolved':proposal_differences,'selectedProposalTokenFailures':0,'priorSelectionsHashOnly':3780,'priorHoldsUnchanged':12,'deployments':[0,0],'checksummedFiles':len(sums)},ensure_ascii=False,indent=2))
