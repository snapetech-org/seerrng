#!/usr/bin/env python3
import hashlib,json,re,sys
from pathlib import Path

def h(b): return hashlib.sha256(b).hexdigest()
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x]
def req(x,m):
    if not x: raise SystemExit('FAIL: '+m)
root=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-primary-20261103/candidate-free-input')
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
window=json.loads((root/'window.json').read_text(encoding='utf-8'))
att=json.loads((root/'PR-attestation.json').read_text(encoding='utf-8'))
# All listed packet files are checked without modifying or copying the input.
listed=set()
for line in (root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    expected,name=line.split('  ',1); listed.add(name)
    req(h((root/name).read_bytes())==expected,'packet checksum '+name)
req(len(listed)==12,'packet checksum entries')
req(manifest['repository']=='snapetech-org/seerrng' and manifest['pullRequest']==418,'manifest repo/PR')
req(manifest['head']=='351f2c09a4aaf6f223975fc1827cb9f77de7702d','manifest head')
req(manifest['tree']=='3d88008f6ea7dc6cbef21333d29a032469cd60cf','manifest tree')
req(manifest['sourceRecordCount']==20 and manifest['cellCount']==240,'manifest dimensions')
req(window['range']==[3560,3579] and window['sourceRecordCount']==20,'window range/count')
req(window['head']==manifest['head'] and window['tree']==manifest['tree'],'window pin')
req(att['head']==manifest['head'] and att['tree']==manifest['tree'],'packet PR attestation pin')
req(att['state']=='OPEN' and att['isDraft'] is True,'packet PR state')
source=jl(root/'source-cells.jsonl'); source_order=jl(root/'source-order.jsonl'); cells=jl(root/'current-target-cells.jsonl')
contexts=jl(root/'caller-contexts.jsonl'); blocks=jl(root/'caller-context-blocks.jsonl')
req(len(source)==20 and len(cells)==240 and len(contexts)==20,'source/cell/context row counts')
req(len(source_order)==22,'boundary/source order row count')
req([x['position'] for x in source]==list(range(3560,3580)),'source positions')
req([x['position'] for x in source_order]==[3559]+list(range(3560,3580))+[3580],'source order boundary sequence')
req(source_order[0]['boundaryKind']=='previous' and source_order[-1]['boundaryKind']=='next','boundary tags')
req(source_order[0]['sourceId']=='components.Settings.AudiobookshelfModal.libraryRequired','previous boundary source')
req(source_order[-1]['sourceId']=='components.Settings.BackIssueModal.create','next boundary source')
locale_order=window['localeOrder']; req(len(locale_order)==12 and len(set(locale_order))==12,'locale order')
smap={x['position']:x for x in source}; cmap={(x['position'],x['locale']):x for x in cells}
req(len(cmap)==240,'unique target cells')
req(set(cmap)=={(p,l) for p in range(3560,3580) for l in locale_order},'target coverage')
req(len({x['contextId'] for x in blocks})==len(blocks),'unique caller block ids')
bmap={x['contextId']:x for x in blocks}; ctxmap={x['position']:x for x in contexts}
for s in source:
    p=s['position']; c=ctxmap[p]
    req(c['sourceId']==s['sourceId'] and c['sourceKey']==s['sourceKey'] and c['sourceSha256']==s['sourceSha256'],'context/source link '+str(p))
    req(c['callerCount']>0 and c['directMessageReferences'],'direct caller '+str(p))
    req(all(bid in bmap for bid in c['contextBlockIds']),'context block ref '+str(p))
    req(s['sourceSha256']==h(s['source'].encode()),'source text hash '+str(p))
    req(s['sourceIdSha256']==h(s['sourceId'].encode()),'source ID hash '+str(p))
    order=source_order[p-3559]
    req(order['position']==p and order['sourceId']==s['sourceId'] and order['sourceSha256']==s['sourceSha256'],'ordered source link '+str(p))
for c in cells:
    p=c['position']; s=smap[p]
    req(c['head']==manifest['head'] and c['tree']==manifest['tree'],'cell pin '+str((p,c['locale'])))
    req(c['repository']=='snapetech-org/seerrng' and c['pullRequest']==418,'cell repo/PR')
    req(c['sourceId']==s['sourceId'] and c['source']==s['source'] and c['sourceSha256']==s['sourceSha256'],'cell/source link')
    req(c['sourceIdSha256']==s['sourceIdSha256'],'cell/source ID hash')
    req(c['currentTargetSha256']==h(c['currentTarget'].encode()),'target hash '+str((p,c['locale'])))
    req(c['reviewStatus']=='unreviewed','candidate-free review status')
    req(not c['placeholderTokenMismatch'] and not c['markupTokenMismatch'] and not c['numericTokenMismatch'] and not c['protectedLiteralMismatch'],'input mismatch flags '+str((p,c['locale'])))
    req(c['placeholderTokenSequenceMatches'] and c['markupTokenSequenceMatches'],'token sequence flags '+str((p,c['locale'])))
    src=smap[p]
    req(c['sourcePlaceholders']==src['sourcePlaceholders'] and c['sourceMarkupTokens']==src['sourceMarkupTokens'] and c['sourceNumericTokens']==src['sourceNumericTokens'] and c['sourceProtectedLiterals']==src['sourceProtectedLiterals'],'source token fields '+str((p,c['locale'])))
    for token in c['sourceProtectedLiterals']:
        req(token in c['currentTarget'],'protected literal '+token+' '+str((p,c['locale'])))
    ctx=ctxmap[p]
    for ref in ctx['directMessageReferences']:
        req(ref['lineSha256']==h(ref['text'].encode()),'caller line hash '+str((p,ref['path'],ref['line'])))
    for bid in ctx['contextBlockIds']:
        b=bmap[bid]
        for line in b['lines']:
            req(line['lineSha256']==h(line['text'].encode()),'context line hash '+str((p,bid,line['line'])))
# Catalog pin metadata is consistent with the runtime locale order and all cells.
pins=json.loads((root/'file-pins.json').read_text(encoding='utf-8'))['catalogFiles']
req(len(pins)==13 and 'src/i18n/locale/en.json' in pins,'catalog pin count')
for loc in locale_order:
    matches=[v for k,v in pins.items() if Path(k).stem==loc]
    req(len(matches)==1 and matches[0]['keyCount']==9494,'catalog pin '+loc)
    for c in cells:
        if c['locale']==loc:
            pin=pins[c['catalogPath']]
            req(c['catalogSha256']==pin['sha256'] and c['catalogGitBlob']==pin['gitBlob'],'cell catalog pin')
findings=json.loads((root/'caller-resolution-findings.json').read_text(encoding='utf-8'))
req(findings['sourceCount']==20 and findings['callerlessSourcePositions']==[] and findings['findings']==[],'caller-resolution findings')
print(json.dumps({'status':'PASS','sources':len(source),'locales':len(locale_order),'cells':len(cells),'callerless':0,'packetChecksums':len(listed)},indent=2))
