#!/usr/bin/env python3
import hashlib,json,re
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
HEAD='3f57a9a14857b56ec65fe5710050a881aab2730e'
TREE='12f6e8fe933d15155c8b6aa734065b8229dc2cbc'
BRANCH='codex/seerrng-localization-overhaul-20261028'
BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
STEMS={'es':'es','zh-Hans':'zh_Hans','hi':'hi','de':'de','ja':'ja','fr':'fr','pt-BR':'pt_BR','ar':'ar','ko':'ko','zh-Hant':'zh_Hant','vi':'vi','id':'id'}
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(n):return json.loads((O/n).read_text(encoding='utf-8'))
def jl(n):return [json.loads(x) for x in (O/n).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
 ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s); tags=re.findall(r'<\/?[A-Za-z][^>]*>',s); nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
 pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
 prot=[]
 for x in re.findall(pat,s):
  if x not in prot:prot.append(x)
 return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
m=j('manifest.json')
assert m['head']==HEAD and m['tree']==TREE and m['range']==[3780,3799] and m['window']=='W3780-W3799'
assert m['candidateFreeInputOnly'] is True and m['proposalCount']==0 and m['dispositionFieldsIncluded'] is False
assert m['localeOrder']==list(LOCALES) and m['cellCount']==240 and m['sourceCount']==9494
# The packet checksum covers every file except its own checksum list.
sums={}
for line in (O/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 digest,name=line.split(None,1); sums[name.lstrip('* ')]=digest
assert set(sums)=={p.name for p in O.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
assert set(m['fileNames'])==set(sums)-{'manifest.json'}
for name,digest in sums.items():assert sha((O/name).read_bytes())==digest,name
# Saved exact live pins and zero-deployment before/after evidence.
for name in ('PR-attestation.json','PR-attestation-after.json'):
 a=j(name); p=a['pullRequest']
 assert p['number']==418 and p['state']=='OPEN' and p['isDraft'] is True and p['headRefName']==BRANCH and p['headRefOid']==HEAD and p['baseRefName']=='main' and p['baseRefOid']==BASE
 assert a['branchRef']==HEAD and a['pullRef']==HEAD and a['tree']==TREE and a['deploymentsAtExpectedShaCount']==0
for name in ('remote-refs-before.tsv','remote-refs-after.tsv'):
 rows=(O/name).read_text().splitlines(); assert len(rows)==2 and all(x.split('\t')[0]==HEAD for x in rows)
for name in ('deployments-before.json','deployments-after.json'):
 d=j(name); assert d['sha']==HEAD and d['count']==0 and not d['deployments']
# Canonical locale tags and file mapping are explicit; sorted key-set parity is not insertion-order parity.
pins=j('catalog-file-pins.json'); assert pins['localeOrder']==list(LOCALES) and pins['sortedKeySetParityWithEnglish'] is True
assert pins['catalogKeyCount']==9494 and len(pins['catalogFiles'])==13
assert pins['localeFileMapping']['zh-Hans']=={'configTag':'zh-CN','catalogFileStem':'zh_Hans','catalogPath':'src/i18n/locale/zh_Hans.json'}
assert pins['localeFileMapping']['zh-Hant']=={'configTag':'zh-TW','catalogFileStem':'zh_Hant','catalogPath':'src/i18n/locale/zh_Hant.json'}
assert pins['localeFileMapping']['pt-BR']=={'configTag':'pt-BR','catalogFileStem':'pt_BR','catalogPath':'src/i18n/locale/pt_BR.json'}
en_seq=pins['catalogFiles']['en']['keySequenceSha256']; keyset=pins['catalogFiles']['en']['sortedKeySetSha256']
assert pins['englishKeySequenceSha256']==en_seq
assert all(pins['catalogFiles'][x]['sortedKeySetSha256']==keyset for x in ('en',)+LOCALES)
assert all(pins['catalogFiles'][x]['keyCount']==9494 for x in ('en',)+LOCALES)
diffs=[x for x in LOCALES if pins['catalogFiles'][x]['keySequenceSha256']!=en_seq]
assert diffs==pins['localeInsertionOrderDifferencesFromEnglish']
# Runtime/catalog pins and caller context blocks are internally consistent.
runtime=j('runtime-file-pins.json'); assert runtime['head']==HEAD and runtime['tree']==TREE
assert len(runtime['files'])>=1 and all(len(x['sha256'])==64 and len(x['gitBlob'])==40 for x in runtime['files'])
ctx=jl('caller-contexts.jsonl'); blocks=jl('caller-context-blocks.jsonl'); bmap={b['contextId']:b for b in blocks}
assert len(ctx)==20 and [x['position'] for x in ctx]==list(range(3780,3800))
for r in ctx:
 definition=next(bmap[x] for x in r['contextBlockIds'] if bmap[x]['contextType']=='message-definition')
 material={'sourceId':r['sourceId'],'namespace':r['namespace'],'definition':definition,'directMessageReferences':r['directMessageReferences'],'dynamicRendererReferences':r['dynamicRendererReferences']}
 assert r['callerContextSha256']==shat(canon(material))
 assert r['callerCount']==len(r['directMessageReferences']) and len(r['dynamicRendererReferences'])>0
 for b in [definition]+[bmap[x] for x in r['contextBlockIds'] if bmap[x]['contextType']!='message-definition']:
  for line in b['lines']:assert line['lineSha256']==shat(line['text'])
 for ref in r['dynamicRendererReferences']+r['directMessageReferences']:assert ref['lineSha256']==shat(ref['text'])
findings=j('caller-resolution-findings.json'); assert findings['callerlessSelectedSourceCount']==0
# Selected source/caller and 240 targets are complete and contain no disposition/proposal fields.
sources=jl('selected-source-cells.jsonl'); assert [x['position'] for x in sources]==list(range(3780,3800))
assert all(not any(k.lower().startswith(('disposition','proposal','rationale')) for k in x) for x in sources)
assert all(sources[i]['sourceId']<sources[i+1]['sourceId'] for i in range(19))
source_by_pos={x['position']:x for x in sources}
cells=jl('current-target-cells.jsonl'); assert len(cells)==240
assert [(x['position'],x['locale']) for x in cells]==[(p,l) for p in range(3780,3800) for l in LOCALES]
counts=Counter()
for x in cells:
 s=source_by_pos[x['position']]; loc=x['locale']; assert x['sourceId']==s['sourceId'] and x['sourceIdSha256']==s['sourceIdSha256'] and x['sourceTextSha256']==s['sourceTextSha256']
 assert x['callerContextSha256']==ctx[x['position']-3780]['callerContextSha256']
 assert x['catalogPath']==pins['catalogFiles'][loc]['path'] and x['catalogSha256']==pins['catalogFiles'][loc]['sha256']
 assert x['currentTargetSha256']==shat(x['currentTarget'])
 src=tokens(s['sourceText']); cur=tokens(x['currentTarget']); checks=x['tokenChecks']
 for name in ('placeholders','markupTags','numericTokens'):
  ok=src[name]==cur[name]; assert checks[name]['matches']==ok
  if not ok:counts[name]+=1
 missing=[v for v in src['protectedLiterals'] if v not in cur['protectedLiterals']]
 assert checks['protectedLiterals']['matches']==(not missing) and checks['protectedLiterals']['missingFromTarget']==missing
 if missing:counts['protectedLiterals']+=1
expected={k:m['baselineTokenMismatchCounts'][k] for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
assert {k:counts.get(k,0) for k in expected}==expected
# Hash-only continuity stays text-free for previous selections and held targets.
prior=jl('prior-selection-hash-reattestation.jsonl'); assert len(prior)==3780 and [x['position'] for x in prior]==list(range(3780))
assert all(x['sourceIdHashMatches'] and x['sourceTextHashMatches'] for x in prior)
assert all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in prior)
holds=jl('prior-hold-hash-reattestation.jsonl'); assert len(holds)==12
assert all(x['priorHoldPreserved'] and x['sourcePositionMatches'] and x['sourceTextHashMatches'] and x['targetHashMatches'] and x['targetTextIncluded'] is False for x in holds)
assert all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in holds)
idx=j('prior-evidence-hash-index.json'); assert idx['previousSelectedSourceIdCount']==3780 and idx['previousSelectedIdsAndSourceTextReattestedByHash']==3780 and idx['previousHoldCount']==12 and idx['previousHoldTargetsUnchangedByHash']==12
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'positions':[3780,3799],'cells':len(cells),'localeCount':12,'priorSelectionHashReattestations':len(prior),'priorSelectionHashMismatches':0,'priorHoldHashReattestations':len(holds),'priorHoldsUnchanged':sum(x['targetHashMatches'] for x in holds),'callerReferences':sum(x['callerCount'] for x in ctx),'callerlessPositions':findings['callerlessSources'],'baselineTokenMismatchCounts':expected,'insertionOrderDifferencesFromEnglish':diffs,'deploymentCounts':[0,0]},ensure_ascii=False,indent=2))
