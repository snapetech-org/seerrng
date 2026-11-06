#!/usr/bin/env python3
import hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
OUT=Path(__file__).resolve().parent; INPUT=(OUT/'../candidate-free-input').resolve(); REPO=(OUT/'../source-repo').resolve()
HEAD='d317a07ea0e5456b6d4660470c57d1f205cd0587'; TREE='c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008'; BRANCH='codex/seerrng-localization-overhaul-20261028'; BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'; REPO_NAME='snapetech-org/SeerrNG'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b):return hashlib.sha256(b).hexdigest()
def sha_text(s):return sha(s.encode('utf-8'))
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
assert m['head']==HEAD and m['tree']==TREE and m['range']==[3760,3779] and m['cellCount']==240 and m['localeOrder']==list(LOCALES)
assert m['candidateFreeManifestSha256']==sha((INPUT/'manifest.json').read_bytes())
# Validate every primary packet checksum.
sums={}
for line in (OUT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    digest,name=line.split(None,1); sums[name.lstrip('* ')]=digest
assert set(sums)=={p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
for n,d in sums.items():assert sha((OUT/n).read_bytes())==d,n
# Exact pinned repository snapshot and current candidate-free input.
assert run(['git','rev-parse','HEAD'],REPO)==HEAD and run(['git','rev-parse','HEAD^{tree}'],REPO)==TREE and run(['git','status','--porcelain=v1'],REPO)==''
cfm=j(INPUT/'manifest.json'); assert cfm['head']==HEAD and cfm['tree']==TREE and cfm['cellCount']==240
source={(x['position'],x['locale']):x for x in jl(INPUT/'current-target-cells.jsonl')}
ctx={x['position']:x for x in jl(INPUT/'caller-contexts.jsonl')}; selected={x['position']:x for x in jl(INPUT/'selected-source-cells.jsonl')}
rows=jl(OUT/'primary-ledger.jsonl'); assert len(rows)==240
assert [(r['position'],r['locale']) for r in rows]==[(p,l) for p in range(3760,3780) for l in LOCALES]
counts=Counter(r['disposition'] for r in rows); assert counts==Counter({'accept-current':228,'correct':9,'refine':3})
assert sum(r['proposedTarget'] is not None for r in rows)==12
proposals=0; bad=Counter(); current_protected_mismatches=0
for r in rows:
    key=(r['position'],r['locale']); c=source[key]; s=selected[r['position']]; cx=ctx[r['position']]
    assert r['sourceId']==s['sourceId']==c['sourceId'] and r['sourceIdSha256']==s['sourceIdSha256']==c['sourceIdSha256']
    assert r['sourceText']==s['sourceText'] and r['sourceTextSha256']==s['sourceTextSha256']==sha_text(r['sourceText'])
    assert r['currentTarget']==c['currentTarget'] and r['currentTargetSha256']==c['currentTargetSha256']==sha_text(r['currentTarget'])
    assert r['catalogPath']==c['catalogPath'] and r['catalogSha256']==c['catalogSha256'] and r['catalogGitBlob']==c['catalogGitBlob']
    assert r['callerContextSha256']==c['callerContextSha256']==cx['callerContextSha256']
    assert r['callerContext']['namespace']==cx['namespace'] and r['callerContext']['directMessageReferences']==cx['directMessageReferences'] and r['callerContext']['dynamicRendererReferences']==cx['dynamicRendererReferences']
    st=tokens(r['sourceText']); ct=tokens(r['currentTarget']); pt=tokens(r['proposedTarget']) if r['proposedTarget'] is not None else None
    for name in ('placeholders','markupTags','numericTokens'):
        ok=st[name]==ct[name]
        assert r['currentTokenChecks'][name]['matches']==ok
        if not ok:bad['current-'+name]+=1
    missing=[x for x in st['protectedLiterals'] if x not in ct['protectedLiterals']]
    current_ok=not missing
    assert r['currentTokenChecks']['protectedLiterals']['matches']==current_ok
    if not current_ok:current_protected_mismatches+=1
    if r['disposition']=='accept-current':
        assert r['proposedTarget'] is None and r['proposedTargetSha256'] is None and r['proposedTokenChecks'] is None
        assert all(r['currentTokenChecks'][n]['matches'] for n in ('placeholders','markupTags','numericTokens','protectedLiterals'))
    else:
        assert r['disposition'] in ('correct','refine') and r['proposedTarget'] and r['proposedTarget']!=r['currentTarget']
        proposals+=1; assert r['proposedTargetSha256']==sha_text(r['proposedTarget'])
        for name in ('placeholders','markupTags','numericTokens','protectedLiterals'):
            ok=st[name]==pt[name] if name!='protectedLiterals' else all(x in pt[name] for x in st[name])
            assert r['proposedTokenChecks'][name]['matches']==ok and ok,(key,name)
assert proposals==12 and current_protected_mismatches==3
# Verify proposal row identities and exact proposal count at known correction sites.
assert {(r['position'],r['locale']) for r in rows if r['proposedTarget'] is not None}=={
 (3765,'hi'),(3765,'zh-Hant'),(3766,'vi'),(3767,'ko'),(3767,'id'),(3770,'es'),(3770,'hi'),(3770,'id'),(3774,'hi'),(3775,'fr'),(3775,'ko'),(3777,'hi')}
assert m['proposalTokenMismatchCounts']=={'placeholders':0,'markupTags':0,'numericTokens':0,'protectedLiterals':0}
assert m['priorSelectedHashReattestations']==3760 and m['priorSelectionHashMismatches']==0 and m['priorHoldHashReattestations']==12 and m['priorHoldsUnchanged']==12
# PR refs and deployments were reattested before and after.
for name in ('PR-attestation-before.json','PR-attestation-after.json'):
    a=j(OUT/name); pr=a['pullRequest']; assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD and pr['headRefName']==BRANCH and pr['baseRefName']=='main' and pr['baseRefOid']==BASE
    assert a['tree']==TREE and a['branchRef']==HEAD and a['pullRef']==HEAD and a['deploymentsAtExpectedShaCount']==0
for name in ('deployments-before.json','deployments-after.json'): assert j(OUT/name)['count']==0
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':len(rows),'dispositions':dict(counts),'proposals':proposals,'currentProtectedMismatchCells':current_protected_mismatches,'proposedTokenMismatches':dict(bad),'priorSelectionsHashReattested':3760,'priorHoldsUnchanged':12,'deployments':[0,0],'checksumFiles':len(sums)},ensure_ascii=False,indent=2))
