#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,re,collections
OUT=Path(__file__).resolve().parent
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
def tokens(text):
    found=[]; i=0
    while i<len(text):
        if text[i]!='{': i+=1; continue
        start=i; depth=1; j=i+1
        while j<len(text) and depth:
            if text[j]=='{': depth+=1
            elif text[j]=='}': depth-=1
            j+=1
        if depth: break
        content=text[start+1:j-1]; match=HEADER.match(content)
        if match:
            name,fmt=match.group(1),match.group(2); cats=[]
            if fmt in {'plural','select','selectordinal'}: cats=[m.group(1) for m in CAT.finditer(content[match.end():])]
            found.append({'name':name,'formatter':fmt or None,'pluralCategories':cats})
        i=j
    return found
def catmaps(ts): return {x['name']:sorted(x['pluralCategories']) for x in ts if x['pluralCategories']}
manifest=j(OUT/'manifest.json'); window=j(OUT/'window.json'); att=j(OUT/'PR-attestation.json')
assert (manifest['head'],manifest['tree'])==(att['head'],att['tree'])==('ebf1cb6082ef173688227c507acfdc04c3cf7ca7','e3c4d1d10f40ea078b66dfdf942e99c8189fee0c')
assert manifest['window']=='W3620-W3639' and manifest['range']==[3620,3639]
assert manifest['sourceRecordCount']==20 and manifest['cellCount']==240
listed={line.split(None,1)[1].strip().lstrip('*'):line.split(None,1)[0] for line in (OUT/'SHA256SUMS.txt').read_text().splitlines() if line.strip()}
assert set(listed)=={p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
for name,digest in listed.items(): assert sha((OUT/name).read_bytes())==digest,(name,'checksum')
manifest_files={x['path']:x for x in manifest['files']}
actual_files={p.relative_to(OUT).as_posix():p for p in OUT.rglob('*') if p.is_file() and p.name not in {'manifest.json','SHA256SUMS.txt'}}
assert set(manifest_files)==set(actual_files)
for name,path in actual_files.items(): assert sha(path.read_bytes())==manifest_files[name]['sha256'] and path.stat().st_size==manifest_files[name]['byteCount'],name
oldm=j(OUT/'lineage/prior-candidate-free-manifest.json'); oldw=j(OUT/'lineage/prior-window.json'); oldp=j(OUT/'lineage/prior-primary-summary.json')
app=j(OUT/'lineage/current-w3600-application-verification.json'); inv=j(OUT/'lineage/current-w3600-catalog-invariants.json'); hold=j(OUT/'lineage/hold-lineage.json')
assert oldm['window']=='W3600-W3619' and oldw['window']=='W3600-W3619' and oldp['window']=='W3600-W3619'
assert oldp['cells']==240 and oldp['callerlessHolds']==0
assert app['status']=='PASS' and app['window']=='W3600-W3619' and app['reviewedCells']==240
assert sum(app['dispositions'].values())==240 and app['dispositions'].get('hold',0)==0
assert len(inv['catalogs'])==13 and hold['currentWindowHoldCount']==0
assert window['sourceOrderSha256']==oldw['sourceOrderSha256']
excluded=jl(OUT/'prior-selection-exclusions.jsonl'); sources=jl(OUT/'source-cells.jsonl'); order=jl(OUT/'source-order.jsonl'); cells=jl(OUT/'current-target-cells.jsonl')
assert len(excluded)==3620 and len(sources)==20 and len(order)==22 and len(cells)==240
assert [x['position'] for x in excluded]==list(range(3620))
assert [x['position'] for x in sources]==list(range(3620,3640))
assert [x['position'] for x in order]==list(range(3619,3641))
assert order[0]['boundaryKind']=='previous' and order[-1]['boundaryKind']=='next'
assert order[0]['sourceId']==window['previousBoundary']['sourceId'] and order[-1]['sourceId']==window['nextBoundary']['sourceId']
assert sha('\n'.join(x['sourceId'] for x in excluded).encode())==window['priorSelectedSourceIdPrefixSha256']
assert sha('\n'.join(x['sourceId'] for x in sources).encode())==window['selectedSourceIdOrderSha256']
assert sha('\n'.join(x['sourceId'] for x in order[1:-1]).encode())==window['selectedSourceIdOrderSha256']
source_by_pos={x['position']:x for x in sources}; order_by_pos={x['position']:x for x in order}
for x in sources:
    assert x['sourceIdSha256']==st(x['sourceId']) and x['sourceSha256']==st(x['source'])
    assert tokens(x['source'])==x['sourcePlaceholders']
    assert catmaps(tokens(x['source']))==x['sourceIcuPluralCategories']
    y=order_by_pos[x['position']]; assert (x['sourceId'],x['source'],x['sourceSha256'])==(y['sourceId'],y['source'],y['sourceSha256'])
ctxs={(x['position'],x['sourceId']):x for x in jl(OUT/'caller-contexts.jsonl')}
blocks={x['contextId']:x for x in jl(OUT/'caller-context-blocks.jsonl')}
assert len(ctxs)==20
for c in ctxs.values():
    assert c['head']==manifest['head'] and c['tree']==manifest['tree']
    assert all(cid in blocks for cid in c['contextBlockIds'])
    for ref in c['directMessageReferences']:
        assert ref['contextBlockId'] in blocks
        block=blocks[ref['contextBlockId']]
        assert any(line['line']==ref['line'] and line['lineSha256']==ref['lineSha256'] and line['text']==ref['text'] for line in block['lines'])
for b in blocks.values():
    for line in b['lines']: assert line['lineSha256']==st(line['text'])
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>'); NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
assert len({(x['position'],x['locale']) for x in cells})==240
assert {x['locale'] for x in cells}==set(window['localeOrder'])
for c in cells:
    src=source_by_pos[c['position']]
    assert (c['sourceId'],c['source'],c['sourceSha256'])==(src['sourceId'],src['source'],src['sourceSha256'])
    assert c['currentTargetSha256']==st(c['currentTarget'])
    sh=tokens(c['source']); th=tokens(c['currentTarget'])
    assert sh==c['sourcePlaceholders'] and th==c['currentTargetPlaceholders']
    sid=[(x['name'],x['formatter']) for x in sh]; tid=[(x['name'],x['formatter']) for x in th]
    assert c['placeholderTokenMismatch']==(collections.Counter(sid)!=collections.Counter(tid))
    assert c['placeholderTokenSequenceMismatch']==(sid!=tid)
    assert c['sourceIcuPluralCategories']==catmaps(sh) and c['currentTargetIcuPluralCategories']==catmaps(th)
    assert c['icuPluralCategorySetDifference']==(catmaps(sh)!=catmaps(th))
    assert c['sourceMarkupTokens']==MK.findall(c['source']) and c['currentTargetMarkupTokens']==MK.findall(c['currentTarget'])
    assert c['markupTokenMismatch']==(c['sourceMarkupTokens']!=c['currentTargetMarkupTokens'])
    assert c['sourceNumericTokens']==NUM.findall(c['source']) and c['currentTargetNumericTokens']==NUM.findall(c['currentTarget'])
    assert c['numericTokenMismatch']==(c['sourceNumericTokens']!=c['currentTargetNumericTokens'])
    sp=[x for x in PROTECTED if x in c['source']]; tp=[x for x in PROTECTED if x in c['currentTarget']]
    assert sp==c['sourceProtectedLiterals'] and tp==c['currentTargetProtectedLiterals']
    assert c['protectedLiteralMismatch']==any(x not in c['currentTarget'] for x in sp)
    assert c['reviewStatus']=='unreviewed'
summary={'placeholderMismatchCount':sum(c['placeholderTokenMismatch'] for c in cells),'placeholderSequenceMismatchCount':sum(c['placeholderTokenSequenceMismatch'] for c in cells),'icuPluralCategorySetDifferenceCount':sum(c['icuPluralCategorySetDifference'] for c in cells),'markupMismatchCount':sum(c['markupTokenMismatch'] for c in cells),'numericTokenMismatchCount':sum(c['numericTokenMismatch'] for c in cells),'protectedLiteralMismatchCount':sum(c['protectedLiteralMismatch'] for c in cells)}
assert window['baselineTokenDiagnostics']==summary
assert not any(('target' in c or 'disposition' in c or 'proposal' in c) for c in cells)
print(json.dumps({'result':'PASS','head':manifest['head'],'tree':manifest['tree'],'range':[3620,3639],'sourceCount':len(sources),'cellCount':len(cells),'priorExcludedSourceIds':len(excluded),'previousBoundary':order[0]['sourceId'],'nextBoundary':order[-1]['sourceId'],'callerlessPositions':j(OUT/'caller-resolution-findings.json')['callerlessSourcePositions'],'baselineTokenDiagnostics':summary,'w3600ApplicationEvidence':'PASS','outputChecksumEntries':len(listed),'candidateProposalsIncluded':False},ensure_ascii=False,indent=2))
