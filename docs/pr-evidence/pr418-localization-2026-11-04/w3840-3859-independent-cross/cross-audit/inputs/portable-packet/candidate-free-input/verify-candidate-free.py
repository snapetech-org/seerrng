#!/usr/bin/env python3
import hashlib,json,re
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
HEAD='ba5bb93cdb4f107a8337aae228b7cd397e1140a6'
TREE='5420ae8fa33bda3619650757a2930a0114dbe4d1'
BRANCH='codex/seerrng-localization-overhaul-20261028'
BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
STEMS={'es':'es','zh-Hans':'zh_Hans','hi':'hi','de':'de','ja':'ja','fr':'fr','pt-BR':'pt_BR','ar':'ar','ko':'ko','zh-Hant':'zh_Hant','vi':'vi','id':'id'}
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode('utf-8'))
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(n): return json.loads((O/n).read_text(encoding='utf-8'))
def jl(n): return [json.loads(x) for x in (O/n).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
 ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s)
 tags=re.findall(r'<\/?[A-Za-z][^>]*>',s)
 nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
 pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
 prot=[]
 for x in re.findall(pat,s):
  if x not in prot: prot.append(x)
 return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
def require(cond,msg):
 if not cond: raise SystemExit('FAIL: '+msg)
m=j('manifest.json')
require(m['head']==HEAD and m['tree']==TREE and m['range']==[3840,3859] and m['window']=='W3840-W3859','pin/window mismatch')
require(m['candidateFreeInputOnly'] is True and m['proposalCount']==0 and m['dispositionFieldsIncluded'] is False,'not candidate-free')
sums={}
for line in (O/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 d,name=line.split(None,1); sums[name.lstrip('* ')]=d
require(set(sums)=={p.name for p in O.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'},'checksum inventory mismatch')
require(set(m['fileNames'])==set(sums)-{'manifest.json'},'manifest inventory mismatch')
for name,digest in sums.items(): require(sha((O/name).read_bytes())==digest,'checksum mismatch '+name)
for name in ('PR-attestation.json','PR-attestation-after.json'):
 a=j(name); pr=a['pullRequest']
 require(pr['number']==418 and pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefName']==BRANCH and pr['headRefOid']==HEAD and pr['baseRefName']=='main' and pr['baseRefOid']==BASE,'PR attestation mismatch '+name)
 require(a['branchRef']==HEAD and a['pullRef']==HEAD and a['tree']==TREE and a['deploymentsAtExpectedShaCount']==0,'live ref/tree/deployment mismatch '+name)
for name in ('remote-refs-before.tsv','remote-refs-after.tsv'):
 rows=(O/name).read_text(encoding='utf-8').splitlines()
 require(len(rows)==2 and all(x.split('\t')[0]==HEAD for x in rows),'remote ref file mismatch '+name)
for name in ('deployments-before.json','deployments-after.json'):
 d=j(name); require(d['sha']==HEAD and d['count']==0 and not d['deployments'],'deployment inventory mismatch '+name)
pins=j('catalog-file-pins.json')
require(pins['head']==HEAD and pins['tree']==TREE and pins['localeOrder']==list(LOCALES) and pins['sortedKeySetParityWithEnglish'] is True,'catalog pin scope mismatch')
require(pins['catalogKeyCount']==9494 and len(pins['catalogFiles'])==13,'catalog inventory count mismatch')
require(pins['localeFileMapping']['zh-Hans']=={'configTag':'zh-CN','catalogFileStem':'zh_Hans','catalogPath':'src/i18n/locale/zh_Hans.json'},'zh-Hans mapping mismatch')
require(pins['localeFileMapping']['zh-Hant']=={'configTag':'zh-TW','catalogFileStem':'zh_Hant','catalogPath':'src/i18n/locale/zh_Hant.json'},'zh-Hant mapping mismatch')
require(pins['localeFileMapping']['pt-BR']=={'configTag':'pt-BR','catalogFileStem':'pt_BR','catalogPath':'src/i18n/locale/pt_BR.json'},'pt-BR mapping mismatch')
en=pins['catalogFiles']['en']; en_seq=en['keySequenceSha256']; keyset=en['sortedKeySetSha256']
require(pins['englishKeySequenceSha256']==en_seq,'English key sequence hash mismatch')
require(all(pins['catalogFiles'][x]['keyCount']==9494 and pins['catalogFiles'][x]['sortedKeySetSha256']==keyset for x in ('en',)+LOCALES),'catalog key set/count mismatch')
diffs=[x for x in LOCALES if pins['catalogFiles'][x]['keySequenceSha256']!=en_seq]
require(diffs==pins['localeInsertionOrderDifferencesFromEnglish'],'catalog insertion order difference list mismatch')
runtime=j('runtime-file-pins.json')
require(runtime['head']==HEAD and runtime['tree']==TREE and len(runtime['files'])>=1,'runtime pins mismatch')
require(all(len(x['sha256'])==64 and len(x['gitBlob'])==40 for x in runtime['files']),'invalid runtime file pin')
contexts=jl('caller-contexts.jsonl'); blocks=jl('caller-context-blocks.jsonl'); bmap={b['contextId']:b for b in blocks}
require(len(contexts)==20 and [x['position'] for x in contexts]==list(range(3840,3860)),'caller context coverage mismatch')
for r in contexts:
 definition=next(bmap[x] for x in r['contextBlockIds'] if bmap[x]['contextType']=='message-definition')
 material={'sourceId':r['sourceId'],'namespace':r['namespace'],'definition':definition,'directMessageReferences':r['directMessageReferences'],'dynamicRendererReferences':r['dynamicRendererReferences']}
 require(r['callerContextSha256']==shat(canon(material)),'caller hash mismatch')
 require(r['callerCount']==len(r['directMessageReferences']) and len(r['dynamicRendererReferences'])>0,'caller resolution incomplete')
 for b in [definition]+[bmap[x] for x in r['contextBlockIds'] if bmap[x]['contextType']!='message-definition']:
  for line in b['lines']: require(line['lineSha256']==shat(line['text']),'caller block line hash mismatch')
 for ref in r['dynamicRendererReferences']+r['directMessageReferences']:
  require(ref['lineSha256']==shat(ref['text']),'caller reference hash mismatch')
findings=j('caller-resolution-findings.json')
require(findings['callerlessSelectedSourceCount']==0,'callerless sources present')
sources=jl('selected-source-cells.jsonl')
require([x['position'] for x in sources]==list(range(3840,3860)),'source rank range mismatch')
require(all(x['sourceId']==sorted([r['sourceId'] for r in sources])[i] for i,x in enumerate(sources)),'source ordering mismatch')
require(all(not any(k.lower().startswith(('disposition','proposal','rationale')) for k in x) for x in sources),'proposal/review data leaked into source packet')
source_by_pos={x['position']:x for x in sources}
order=jl('source-order-hashes.jsonl')
require(len(order)==9494 and [x['position'] for x in order]==list(range(9494)),'full source order hash inventory mismatch')
order_by_pos={x['position']:x for x in order}
for x in sources:
 require(x['sourceIdSha256']==order_by_pos[x['position']]['sourceIdSha256'] and x['sourceTextSha256']==order_by_pos[x['position']]['sourceTextSha256'],'selected source/order hash mismatch')
bounds=jl('source-window-boundaries-hash-only.jsonl')
require([x['position'] for x in bounds]==[3839,3840,3859,3860],'boundary positions mismatch')
require([x['kind'] for x in bounds]==['previous-selection-boundary','selected-start','selected-end','next-window-boundary'],'boundary kinds mismatch')
for x in bounds:
 require(x['sourceIdSha256']==order_by_pos[x['position']]['sourceIdSha256'] and x['sourceTextSha256']==order_by_pos[x['position']]['sourceTextSha256'],'boundary hash mismatch')
w=j('window.json')
require(w['window']=='W3840-W3859' and w['range']==[3840,3859] and w['sourceOrderCount']==9494 and w['nextBoundaryPosition']==3860,'window metadata mismatch')
require(w['priorSelectedSourceIdsReattested']==3840 and w['priorSelectedSourceIdOrSourceTextHashMismatches']==0,'prior selected source reattestation count mismatch')
cells=jl('current-target-cells.jsonl')
require(len(cells)==240 and [(x['position'],x['locale']) for x in cells]==[(p,l) for p in range(3840,3860) for l in LOCALES],'target cell set/order mismatch')
ctx_by_pos={x['position']:x for x in contexts}
counts=Counter()
for x in cells:
 s=source_by_pos[x['position']]; loc=x['locale']
 require(x['sourceId']==s['sourceId'] and x['sourceIdSha256']==s['sourceIdSha256'] and x['sourceTextSha256']==s['sourceTextSha256'],'target/source mismatch')
 require(x['callerContextSha256']==ctx_by_pos[x['position']]['callerContextSha256'],'target/caller mismatch')
 require(x['catalogPath']==pins['catalogFiles'][loc]['path'] and x['catalogSha256']==pins['catalogFiles'][loc]['sha256'] and x['catalogGitBlob']==pins['catalogFiles'][loc]['gitBlob'],'target/catalog pin mismatch')
 require(x['currentTargetSha256']==shat(x['currentTarget']),'target value hash mismatch')
 src=tokens(s['sourceText']); cur=tokens(x['currentTarget']); checks=x['tokenChecks']
 for name in ('placeholders','markupTags','numericTokens'):
  ok=src[name]==cur[name]; require(checks[name]['matches']==ok and checks[name]['source']==src[name] and checks[name]['target']==cur[name],'token check mismatch')
  if not ok: counts[name]+=1
 missing=[v for v in src['protectedLiterals'] if v not in cur['protectedLiterals']]
 require(checks['protectedLiterals']['matches']==(not missing) and checks['protectedLiterals']['missingFromTarget']==missing,'protected literal check mismatch')
 if missing: counts['protectedLiterals']+=1
expected=m['baselineTokenMismatchCounts']
require({k:counts.get(k,0) for k in expected}==expected,'baseline token summary mismatch')
prior=jl('prior-selection-hash-reattestation.jsonl')
require(len(prior)==3840 and [x['position'] for x in prior]==list(range(3840)),'prior source identity coverage mismatch')
require(all(x['sourceIdHashMatches'] and x['sourceTextHashMatches'] for x in prior),'prior source identity/text hash changed')
require(all(x['currentSourceIdSha256']==order_by_pos[x['position']]['sourceIdSha256'] and x['currentSourceTextSha256']==order_by_pos[x['position']]['sourceTextSha256'] for x in prior),'prior source identity/hash binding mismatch')
require(all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in prior),'prior source reattestation contains text')
holds=jl('prior-hold-hash-reattestation.jsonl')
require(len(holds)==14 and len({(x['position'],x['locale']) for x in holds})==14,'prior hold count/uniqueness mismatch')
require(all(x['priorHoldPreserved'] and x['sourcePositionMatches'] and x['sourceTextHashMatches'] and x['targetHashMatches'] and x['targetTextIncluded'] is False for x in holds),'prior hold hash reattestation mismatch')
require(all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in holds),'prior hold text leaked')
applied=jl('prior-applied-target-hash-reattestation.jsonl')
require(len(applied)==54 and len({(x['position'],x['locale']) for x in applied})==54,'prior application selection count/uniqueness mismatch')
require(all(x['sourcePositionMatches'] and x['sourceTextHashMatches'] and x['selectedTargetHashMatches'] for x in applied),'prior applied target reattestation mismatch')
require(all(not any(k in x for k in ('sourceId','sourceText','target','currentTarget')) for x in applied),'prior application text leaked')
catrows=jl('prior-catalog-application-reattestation.jsonl')
catsum=j('prior-catalog-application-summary.json')
require(len(catrows)==32 and catsum['plannedCells']==19 and catsum['selectedTargetHashesReattested']==19 and catsum['catalogFilesWithOrderVerified']==13 and catsum['unselectedValuesPreserved'] is True,'prior catalog application summary mismatch')
require(sum(x.get('targetHashMatches') is True for x in catrows)==19,'prior catalog selected hashes mismatch')
require(all(x.get('keySetAndOrderPreserved',True) and x.get('unselectedValuesPreserved',True) for x in catrows),'prior catalog key/order/value preservation mismatch')
idx=j('prior-evidence-hash-index.json')
require(idx['previousSelectedSourceIdCount']==3840 and idx['previousSelectedIdsAndSourceTextReattestedByHash']==3840,'prior source summary mismatch')
require(idx['previousAppliedTargetHashRows']==54 and idx['previousAppliedTargetsUnchangedByHash']==54,'prior application summary mismatch')
require(idx['previousHoldCount']==14 and idx['previousHoldTargetsUnchangedByHash']==14,'prior hold summary mismatch')
require(idx['previousCatalogApplicationCells']==19 and idx['previousCatalogApplicationTargetHashesMatched']==19 and idx['previousCatalogApplicationFilesVerified']==13,'prior catalog application summary mismatch')
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'window':[3840,3859],'sourceCount':20,'localeCount':12,'cells':len(cells),'priorSourceHashesReattested':len(prior),'priorAppliedTargetsReattested':len(applied),'priorHoldsReattested':len(holds),'priorCatalogApplicationTargets':19,'catalogFilesWithOrderVerified':13,'callerReferences':sum(x['callerCount'] for x in contexts),'callerlessSources':findings['callerlessSources'],'baselineTokenMismatchCounts':expected,'deployments':[0,0]},ensure_ascii=False,indent=2))
