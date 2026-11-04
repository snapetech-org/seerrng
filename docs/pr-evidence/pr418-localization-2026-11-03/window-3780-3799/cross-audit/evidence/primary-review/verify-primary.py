#!/usr/bin/env python3
import hashlib,json,re
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent; I=(O/'../candidate-free-input').resolve()
HEAD='3f57a9a14857b56ec65fe5710050a881aab2730e'; TREE='12f6e8fe933d15155c8b6aa734065b8229dc2cbc'
BRANCH='codex/seerrng-localization-overhaul-20261028'; BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(root,n):return json.loads((root/n).read_text(encoding='utf-8'))
def jl(root,n):return [json.loads(x) for x in (root/n).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
 ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s); tags=re.findall(r'<\/?[A-Za-z][^>]*>',s); nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
 pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
 prot=[]
 for x in re.findall(pat,s):
  if x not in prot:prot.append(x)
 return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
m=j(O,'manifest.json'); cf=j(I,'manifest.json')
assert m['head']==HEAD and m['tree']==TREE and m['range']==[3780,3799] and m['window']=='W3780-W3799'
assert m['cellCount']==240 and m['localeOrder']==list(LOCALES) and m['candidateFreeManifestSha256']==sha((I/'manifest.json').read_bytes()) and m['candidateFreeChecksumListSha256']==sha((I/'SHA256SUMS.txt').read_bytes())
assert cf['head']==HEAD and cf['tree']==TREE
sums={}
for line in (O/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 d,n=line.split(None,1); sums[n.lstrip('* ')]=d
assert set(sums)=={x.name for x in O.iterdir() if x.is_file() and x.name!='SHA256SUMS.txt'}
for n,d in sums.items():assert sha((O/n).read_bytes())==d,n
for root in (I,O):
 sums2={}
 for line in (root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  d,n=line.split(None,1); sums2[n.lstrip('* ')]=d
 assert all(sha((root/n).read_bytes())==d for n,d in sums2.items())
for name in ('PR-attestation-before.json','PR-attestation-after.json'):
 a=j(O,name); p=a['pullRequest']
 assert p['number']==418 and p['state']=='OPEN' and p['isDraft'] is True and p['headRefName']==BRANCH and p['headRefOid']==HEAD and p['baseRefName']=='main' and p['baseRefOid']==BASE
 assert a['branchRef']==HEAD and a['pullRef']==HEAD and a['tree']==TREE and a['deploymentsAtExpectedShaCount']==0
for name in ('remote-refs-before.tsv','remote-refs-after.tsv'):
 assert all(x.split('\t')[0]==HEAD for x in (O/name).read_text().splitlines())
for name in ('deployments-before.json','deployments-after.json'):
 d=j(O,name); assert d['sha']==HEAD and d['count']==0
for name in ('prior-selection-hash-reattestation.jsonl','prior-hold-hash-reattestation.jsonl','prior-evidence-hash-index.json','caller-contexts.jsonl','caller-context-blocks.jsonl','catalog-file-pins.json','runtime-file-pins.json'):
 assert (O/name).read_bytes()==(I/name).read_bytes(),name
prior=jl(O,'prior-selection-hash-reattestation.jsonl'); assert len(prior)==3780 and all(x['sourceIdHashMatches'] and x['sourceTextHashMatches'] for x in prior)
assert all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in prior)
holds=jl(O,'prior-hold-hash-reattestation.jsonl'); assert len(holds)==12 and all(x['priorHoldPreserved'] and x['targetHashMatches'] and x['targetTextIncluded'] is False for x in holds)
assert all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in holds)
src={x['position']:x for x in jl(I,'selected-source-cells.jsonl')}
ctx={x['position']:x for x in jl(I,'caller-contexts.jsonl')}
cells={(x['position'],x['locale']):x for x in jl(I,'current-target-cells.jsonl')}
rows=jl(O,'primary-ledger.jsonl'); assert len(rows)==240
assert [(x['position'],x['locale']) for x in rows]==[(p,l) for p in range(3780,3800) for l in LOCALES]
counts=Counter(); proposals=set(); current_bad=Counter(); proposed_bad=Counter()
for r in rows:
 k=(r['position'],r['locale']); c=cells[k]; s=src[r['position']]; x=ctx[r['position']]
 assert r['head']==HEAD and r['tree']==TREE and r['sourceId']==s['sourceId']==c['sourceId'] and r['sourceText']==s['sourceText']
 assert r['sourceIdSha256']==s['sourceIdSha256'] and r['sourceTextSha256']==s['sourceTextSha256']==shat(r['sourceText'])
 assert r['currentTarget']==c['currentTarget'] and r['currentTargetSha256']==c['currentTargetSha256']==shat(r['currentTarget'])
 assert r['catalogPath']==c['catalogPath'] and r['catalogSha256']==c['catalogSha256'] and r['catalogGitBlob']==c['catalogGitBlob']
 assert r['callerContextSha256']==c['callerContextSha256']==x['callerContextSha256']
 assert r['callerContext']['directMessageReferences']==x['directMessageReferences'] and r['callerContext']['dynamicRendererReferences']==x['dynamicRendererReferences']
 st=tokens(r['sourceText']); ct=tokens(r['currentTarget'])
 for n in ('placeholders','markupTags','numericTokens'):
  if st[n]!=ct[n]:current_bad[n]+=1
 miss=[t for t in st['protectedLiterals'] if t not in ct['protectedLiterals']]
 if miss:current_bad['protectedLiterals']+=1
 assert r['currentTokenChecks']==c['tokenChecks']
 if r['proposedTarget'] is None:
  assert r['disposition']=='accept-current' and r['proposedTargetSha256'] is None and r['proposedTokenChecks'] is None
  assert not any(st[n]!=ct[n] for n in ('placeholders','markupTags','numericTokens')) and not miss
 else:
  assert r['disposition'] in ('correct','refine') and r['proposedTarget']!=r['currentTarget']
  proposals.add(k); assert r['proposedTargetSha256']==shat(r['proposedTarget']); pt=tokens(r['proposedTarget'])
  for n in ('placeholders','markupTags','numericTokens'):
   ok=st[n]==pt[n]; assert r['proposedTokenChecks'][n]['matches']==ok
   if not ok:proposed_bad[n]+=1
  missing=[t for t in st['protectedLiterals'] if t not in pt['protectedLiterals']]
  ok=not missing; assert r['proposedTokenChecks']['protectedLiterals']['matches']==ok
  if missing:proposed_bad['protectedLiterals']+=1
 counts[r['disposition']]+=1
assert counts==Counter({'accept-current':220,'correct':5,'refine':15})
assert len(proposals)==20 and current_bad==Counter({'protectedLiterals':1}) and not proposed_bad
assert proposals=={(3782,'zh-Hans'),(3782,'ko'),(3782,'zh-Hant'),(3784,'zh-Hans'),(3784,'zh-Hant'),(3785,'hi'),(3786,'hi'),(3786,'vi'),(3786,'ar'),(3787,'hi'),(3788,'hi'),(3789,'hi'),(3790,'ko'),(3791,'hi'),(3791,'ar'),(3791,'vi'),(3796,'es'),(3796,'pt-BR'),(3797,'pt-BR'),(3798,'ar')}
s=j(O,'summary.json'); assert s['decisionCounts']==dict(counts) and s['selectedChanges']==20 and s['selectedProposalTokenFailures']==0 and s['previousSelectedHashReattestations']==3780 and s['previousHoldHashMatches']==12
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':240,'dispositions':dict(counts),'proposals':len(proposals),'baselineTokenMismatches':dict(current_bad),'proposalTokenMismatches':dict(proposed_bad),'priorSelectionsHashOnly':3780,'priorHoldsUnchanged':12,'deployments':[0,0],'checksumFiles':len(sums)},ensure_ascii=False,indent=2))
