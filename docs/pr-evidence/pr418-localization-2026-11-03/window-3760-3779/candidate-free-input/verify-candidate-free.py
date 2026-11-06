#!/usr/bin/env python3
import hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
OUT=Path(__file__).resolve().parent
TASK=OUT.parent
REPO=TASK/'source-repo'
HEAD='d317a07ea0e5456b6d4660470c57d1f205cd0587'
TREE='c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008'
BRANCH='codex/seerrng-localization-overhaul-20261028'
BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'
ORDER=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
STEMS={'es':'es','zh-Hans':'zh_Hans','hi':'hi','de':'de','ja':'ja','fr':'fr','pt-BR':'pt_BR','ar':'ar','ko':'ko','zh-Hant':'zh_Hant','vi':'vi','id':'id'}
def sha(b):return hashlib.sha256(b).hexdigest()
def sha_text(s):return sha(s.encode('utf-8'))
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(p):return json.loads(p.read_text(encoding='utf-8'))
def jl(p):return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
    ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s); tags=re.findall(r'<\/?[A-Za-z][^>]*>',s); nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
    pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
    prot=[]
    for m in re.finditer(pat,s):
        if m.group(0) not in prot:prot.append(m.group(0))
    return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
def run(a):return subprocess.check_output(a,cwd=REPO,text=True).strip()
m=j(OUT/'manifest.json'); assert m['head']==HEAD and m['tree']==TREE and m['range']==[3760,3779]
assert m['candidateFreeInputOnly'] is True and m['proposalCount']==0 and m['dispositionFieldsIncluded'] is False
assert m['localeOrder']==list(ORDER) and m['cellCount']==240 and m['sourceCount']==9494
assert run(['git','rev-parse','HEAD'])==HEAD and run(['git','rev-parse','HEAD^{tree}'])==TREE and run(['git','status','--porcelain=v1'])==''
# Every packet file is covered by the packet checksum list.
sums={}
for line in (OUT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    digest,name=line.split(None,1); sums[name.lstrip('* ')]=digest
assert set(sums)=={p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
assert set(m['fileNames'])==set(sums)-{'manifest.json'}
for name,digest in sums.items(): assert sha((OUT/name).read_bytes())==digest,name
# PR/ref/deployment pins before and after inventory.
for name in ('PR-attestation.json','PR-attestation-after.json'):
    a=j(OUT/name); pr=a['pullRequest']
    assert pr['number']==418 and pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefName']==BRANCH and pr['headRefOid']==HEAD and pr['baseRefName']=='main' and pr['baseRefOid']==BASE
    assert a['branchRef']==HEAD and a['pullRef']==HEAD and a['tree']==TREE and a['deploymentsAtExpectedShaCount']==0
for name in ('remote-refs-before.tsv','remote-refs-after.tsv'):
    lines=(OUT/name).read_text().splitlines(); assert len(lines)==2 and lines[0].split('\t')[0]==HEAD and lines[1].split('\t')[0]==HEAD
for name in ('deployments-before.json','deployments-after.json'): assert j(OUT/name)['count']==0 and j(OUT/name)['sha']==HEAD
# Catalog locale mapping, byte pins, key sets, and exact current source/targets.
pins=j(OUT/'catalog-file-pins.json'); assert pins['localeOrder']==list(ORDER) and pins['catalogKeySetEqualsEnglish'] is True
mapping=pins['localeFileMapping']
assert mapping['zh-Hans']=={'configTag':'zh-CN','catalogFileStem':'zh_Hans','catalogPath':'src/i18n/locale/zh_Hans.json'}
assert mapping['zh-Hant']=={'configTag':'zh-TW','catalogFileStem':'zh_Hant','catalogPath':'src/i18n/locale/zh_Hant.json'}
assert mapping['pt-BR']=={'configTag':'pt-BR','catalogFileStem':'pt_BR','catalogPath':'src/i18n/locale/pt_BR.json'}
en=j(REPO/'src/i18n/locale/en.json'); keys=sorted(en); assert len(keys)==9494
catalogs={}
for loc in ('en',)+ORDER:
    pinfo=pins['catalogFiles'][loc]; raw=(REPO/pinfo['path']).read_bytes(); cat=j(REPO/pinfo['path']); catalogs[loc]=cat
    assert sha(raw)==pinfo['sha256'] and run(['git','rev-parse',f"HEAD:{pinfo['path']}"])==pinfo['gitBlob']
    assert sorted(cat)==keys and len(cat)==9494 and pinfo['keyCount']==9494
    assert sha_text('\n'.join(sorted(cat))+'\n')==pinfo['orderedKeySha256']
config=j(REPO/'config/i18n/locales.json'); cfg={Path(x['clientFile']).stem:x for x in config['locales']}
assert cfg['zh_Hans']['tag']=='zh-CN' and cfg['zh_Hant']['tag']=='zh-TW' and cfg['pt_BR']['tag']=='pt-BR'
# Runtime file pins cover current namespace, route, and locale registry context.
for f in j(OUT/'runtime-file-pins.json')['files']:
    raw=(REPO/f['path']).read_bytes(); assert sha(raw)==f['sha256'] and run(['git','rev-parse',f"HEAD:{f['path']}"])==f['gitBlob']
# Current source window exactly matches positions; the complete queue is hashed only.
sources=jl(OUT/'selected-source-cells.jsonl'); assert [r['position'] for r in sources]==list(range(3760,3780))
for r in sources:
    k=keys[r['position']]; assert r['sourceId']==k and r['sourceIdSha256']==sha_text(k) and r['sourceText']==en[k] and r['sourceTextSha256']==sha_text(en[k])
order=jl(OUT/'source-order-hashes.jsonl'); assert len(order)==9494 and [r['position'] for r in order]==list(range(9494))
for pos in list(range(3760))+list(range(3780,9494)):
    assert 'sourceId' not in order[pos] and 'sourceText' not in order[pos]
# Hash-only continuity: previous selected IDs/source texts and held targets are not copied.
prior=jl(OUT/'prior-selection-hash-reattestation.jsonl'); assert len(prior)==3760 and [r['position'] for r in prior]==list(range(3760))
assert all(r['sourceIdHashMatches'] and r['sourceTextHashMatches'] for r in prior)
assert all('sourceId' not in r and 'sourceText' not in r and 'target' not in r for r in prior)
holds=jl(OUT/'prior-hold-hash-reattestation.jsonl'); assert len(holds)==12
assert all(r['priorHoldPreserved'] and r['sourcePositionMatches'] and r['sourceTextHashMatches'] and r['targetHashMatches'] and r['targetTextIncluded'] is False for r in holds)
assert all('sourceId' not in r and 'currentTarget' not in r for r in holds)
# Resolver artifacts pin the namespace/property definition and rendered uses.
ctx=jl(OUT/'caller-contexts.jsonl'); blocks=jl(OUT/'caller-context-blocks.jsonl'); bmap={b['contextId']:b for b in blocks}
assert len(ctx)==20 and [r['position'] for r in ctx]==list(range(3760,3780))
for r in ctx:
    definition=next(bmap[x] for x in r['contextBlockIds'] if bmap[x]['contextType']=='message-definition')
    material={'sourceId':r['sourceId'],'namespace':r['namespace'],'definition':definition,'directMessageReferences':r['directMessageReferences'],'dynamicRendererReferences':r['dynamicRendererReferences']}
    assert r['callerContextSha256']==sha_text(canon(material))
    assert r['callerCount']==len(r['directMessageReferences']) and len(r['dynamicRendererReferences'])>0
    assert definition['sourceId']==r['sourceId'] and definition['namespace']==r['namespace']
findings=j(OUT/'caller-resolution-findings.json'); assert findings['callerlessSelectedSourceCount']==0
cells=jl(OUT/'current-target-cells.jsonl'); assert len(cells)==240 and [(r['position'],r['locale']) for r in cells]==[(p,l) for p in range(3760,3780) for l in ORDER]
counts=Counter()
for r in cells:
    k=keys[r['position']]; loc=r['locale']; target=catalogs[loc][k]
    assert r['sourceId']==k and r['sourceTextSha256']==sha_text(en[k]) and r['currentTarget']==target and r['currentTargetSha256']==sha_text(target)
    assert r['catalogPath']==pins['catalogFiles'][loc]['path'] and r['callerContextSha256']==ctx[r['position']-3760]['callerContextSha256']
    st=tokens(en[k]); tt=tokens(target); chk=r['tokenChecks']
    for token_name in ('placeholders','markupTags','numericTokens'):
        ok=st[token_name]==tt[token_name]; assert chk[token_name]['matches']==ok
        if not ok:counts[token_name]+=1
    missing=[x for x in st['protectedLiterals'] if x not in tt['protectedLiterals']]
    assert chk['protectedLiterals']['matches']==(not missing) and chk['protectedLiterals']['missingFromTarget']==missing
    if missing:counts['protectedLiterals']+=1
expected={k:m['baselineTokenMismatchCounts'][k] for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
assert {k:counts.get(k,0) for k in expected}==expected
assert expected=={'placeholders':0,'markupTags':0,'numericTokens':0,'protectedLiterals':3}
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'positions':[3760,3779],'cells':len(cells),'catalogs':12,'priorSelectionHashReattestations':len(prior),'priorSelectionMismatches':0,'priorHoldHashReattestations':len(holds),'priorHoldsUnchanged':sum(r['targetHashMatches'] for r in holds),'callerReferences':sum(r['callerCount'] for r in ctx),'callerlessPositions':[x['position'] for x in findings['callerlessSources']],'baselineTokenMismatchCounts':expected,'deploymentCounts':[0,0],'chineseCatalogPins':{loc:pins['catalogFiles'][loc] for loc in ('zh-Hans','zh-Hant')}},ensure_ascii=False,indent=2))
