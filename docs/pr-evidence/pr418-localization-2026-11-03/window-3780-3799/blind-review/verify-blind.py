#!/usr/bin/env python3
import hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
OUT=Path(__file__).resolve().parent; INPUT=(OUT/'../candidate-free-input').resolve()
HEAD='3f57a9a14857b56ec65fe5710050a881aab2730e'; TREE='12f6e8fe933d15155c8b6aa734065b8229dc2cbc'; BRANCH='codex/seerrng-localization-overhaul-20261028'; BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'; REPO_NAME='snapetech-org/SeerrNG'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b):return hashlib.sha256(b).hexdigest()
def sha_text(s):return sha(s.encode('utf-8'))
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(p):return json.loads(p.read_text(encoding='utf-8'))
def jl(p):return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x]
def run(a,cwd=None):return subprocess.check_output(a,cwd=cwd,text=True).strip()
def tokens(s):
    ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s); tags=re.findall(r'<\/?[A-Za-z][^>]*>',s); nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
    pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
    prot=[]
    for m in re.finditer(pat,s):
        if m.group(0) not in prot:prot.append(m.group(0))
    return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
m=j(OUT/'manifest.json')
assert (INPUT/'SHA256SUMS.txt').is_file()
assert m['head']==HEAD and m['tree']==TREE and m['range']==[3780,3799] and m['cellCount']==240 and m['localeOrder']==list(LOCALES)
assert m['candidateFreeManifestSha256']==sha((INPUT/'manifest.json').read_bytes()) and m['candidateFreeChecksumListSha256']==sha((INPUT/'SHA256SUMS.txt').read_bytes()) and m['primaryOutputConsulted'] is False

# Check complete blind packet checksum coverage.
sums={}
for line in (OUT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    digest,name=line.split(None,1); sums[name.lstrip('* ')]=digest
assert set(sums)=={p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
for name,digest in sums.items():assert sha((OUT/name).read_bytes())==digest,name
# Prior lineage remains hash-only.
prior=jl(OUT/'prior-selection-hash-reattestation.jsonl'); assert len(prior)==3780 and all(r['sourceIdHashMatches'] and r['sourceTextHashMatches'] for r in prior)
assert all('sourceId' not in r and 'sourceText' not in r and 'target' not in r for r in prior)
holds=jl(OUT/'prior-hold-hash-reattestation.jsonl'); assert len(holds)==12 and all(r['targetTextIncluded'] is False and r['targetHashMatches'] for r in holds)
assert all('sourceId' not in r and 'currentTarget' not in r for r in holds)
for name in ('caller-contexts.jsonl','caller-context-blocks.jsonl','catalog-file-pins.json','runtime-file-pins.json'):
    assert (OUT/name).read_bytes()==(INPUT/name).read_bytes(),name
pins=j(OUT/'catalog-file-pins.json')
assert pins['localeFileMapping']['zh-Hans']=={'configTag':'zh-CN','catalogFileStem':'zh_Hans','catalogPath':'src/i18n/locale/zh_Hans.json'}
assert pins['localeFileMapping']['zh-Hant']=={'configTag':'zh-TW','catalogFileStem':'zh_Hant','catalogPath':'src/i18n/locale/zh_Hant.json'}
source={(x['position'],x['locale']):x for x in jl(INPUT/'current-target-cells.jsonl')}; selected={x['position']:x for x in jl(INPUT/'selected-source-cells.jsonl')}; ctx={x['position']:x for x in jl(INPUT/'caller-contexts.jsonl')}
rows=jl(OUT/'blind-ledger.jsonl'); assert len(rows)==240
assert [(r['position'],r['locale']) for r in rows]==[(p,l) for p in range(3780,3800) for l in LOCALES]
counts=Counter(r['disposition'] for r in rows); assert counts==Counter({'accept-current':220,'correct':5,'refine':15})
proposal_set=set(); bad=Counter(); current_protected_bad=0
for r in rows:
    k=(r['position'],r['locale']); c=source[k]; s=selected[r['position']]; cx=ctx[r['position']]
    assert r['sourceId']==s['sourceId']==c['sourceId'] and r['sourceIdSha256']==s['sourceIdSha256']==c['sourceIdSha256']
    assert r['sourceText']==s['sourceText'] and r['sourceTextSha256']==s['sourceTextSha256']==sha_text(r['sourceText'])
    assert r['currentTarget']==c['currentTarget'] and r['currentTargetSha256']==c['currentTargetSha256']==sha_text(r['currentTarget'])
    assert r['catalogPath']==c['catalogPath'] and r['catalogSha256']==c['catalogSha256'] and r['catalogGitBlob']==c['catalogGitBlob']
    assert r['callerContextSha256']==c['callerContextSha256']==cx['callerContextSha256']
    assert r['callerContext']['directMessageReferences']==cx['directMessageReferences'] and r['callerContext']['dynamicRendererReferences']==cx['dynamicRendererReferences']
    st=tokens(r['sourceText']); ct=tokens(r['currentTarget']); current_checks=r['currentTokenChecks']
    for name in ('placeholders','markupTags','numericTokens'):
        ok=st[name]==ct[name]; assert current_checks[name]['matches']==ok
        if not ok:bad['current-'+name]+=1
    missing=[x for x in st['protectedLiterals'] if x not in ct['protectedLiterals']]
    assert current_checks['protectedLiterals']['matches']==(not missing)
    if missing:current_protected_bad+=1
    if r['proposedTarget'] is None:
        assert r['disposition']=='accept-current' and r['proposedTargetSha256'] is None and r['proposedTokenChecks'] is None
        assert all(current_checks[n]['matches'] for n in ('placeholders','markupTags','numericTokens','protectedLiterals'))
    else:
        assert r['disposition'] in ('correct','refine') and r['proposedTarget']!=r['currentTarget']
        proposal_set.add(k); assert r['proposedTargetSha256']==sha_text(r['proposedTarget']); pt=tokens(r['proposedTarget'])
        for name in ('placeholders','markupTags','numericTokens','protectedLiterals'):
            ok=st[name]==pt[name] if name!='protectedLiterals' else all(x in pt[name] for x in st[name])
            assert r['proposedTokenChecks'][name]['matches']==ok and ok,(k,name)
assert len(proposal_set)==20 and current_protected_bad==1
assert proposal_set=={(3782,'zh-Hans'),(3782,'ko'),(3782,'zh-Hant'),(3784,'zh-Hans'),(3784,'zh-Hant'),(3785,'hi'),(3786,'hi'),(3786,'vi'),(3786,'ar'),(3787,'hi'),(3788,'hi'),(3789,'hi'),(3790,'ko'),(3791,'hi'),(3791,'ar'),(3791,'vi'),(3796,'es'),(3796,'pt-BR'),(3797,'pt-BR'),(3798,'ar')}
# PR/ref/tree/deployment pins before and after the blind ledger.
for name in ('PR-attestation-before.json','PR-attestation-after.json'):
    a=j(OUT/name); pr=a['pullRequest']; assert pr['number']==418 and pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefName']==BRANCH and pr['headRefOid']==HEAD and pr['baseRefName']=='main' and pr['baseRefOid']==BASE
    assert a['tree']==TREE and a['branchRef']==HEAD and a['pullRef']==HEAD and a['deploymentsAtExpectedShaCount']==0
for name in ('remote-refs-before.tsv','remote-refs-after.tsv'):
    lines=(OUT/name).read_text().splitlines(); assert len(lines)==2 and all(x.split('\t')[0]==HEAD for x in lines)
for name in ('deployments-before.json','deployments-after.json'): assert j(OUT/name)['sha']==HEAD and j(OUT/name)['count']==0
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':len(rows),'dispositions':dict(counts),'proposals':len(proposal_set),'currentProtectedMismatchCells':current_protected_bad,'proposedTokenMismatches':dict(bad),'priorSelectionsHashOnly':3780,'priorHoldsUnchanged':12,'deployments':[0,0],'checksumFiles':len(sums)},ensure_ascii=False,indent=2))
