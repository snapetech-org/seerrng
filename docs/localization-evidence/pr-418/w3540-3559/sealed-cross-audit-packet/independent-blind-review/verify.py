#!/usr/bin/env python3
"""Verify the blind ledger against the pinned candidate-free SeerrNG packet."""
import hashlib, json, re, sys
from pathlib import Path

INPUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3540-3559-blind-20261103/candidate-free-input')
OUT=Path(__file__).resolve().parent

def fail(msg):
    print('FAIL:',msg); sys.exit(1)
def hbytes(value): return hashlib.sha256(value).hexdigest()
def htext(value): return hbytes(value.encode('utf-8'))
def jsonl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines()]

manifest=json.loads((INPUT/'manifest.json').read_text(encoding='utf-8'))
window=json.loads((INPUT/'window.json').read_text(encoding='utf-8'))
att=json.loads((INPUT/'PR-attestation.json').read_text(encoding='utf-8'))
status=json.loads((INPUT/'queue-status.json').read_text(encoding='utf-8'))
if manifest['head']!='f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d' or manifest['tree']!='3ba2579c326f8dbac943ba43df77ddd5747a85a1': fail('candidate-free head/tree')
if att['head']!=manifest['head'] or att['headTree']!=manifest['tree'] or not att['pinsAgree']: fail('PR attestation pins')
if att['state']!='open' or att['merged'] or att['draft'] is not True: fail('PR state attestation')
if window['head']!=manifest['head'] or window['tree']!=manifest['tree'] or status['head']!=manifest['head'] or status['tree']!=manifest['tree']: fail('window/queue head/tree')
if hbytes((INPUT/'SHA256SUMS.txt').read_bytes())!='6b8b67e58028a0af79afad9a115a42b49233df18d2469227fe4153bece68ddb8': fail('candidate-free checksum-list digest')
for entry in manifest['files']:
    if hbytes((INPUT/entry['path']).read_bytes())!=entry['sha256']: fail('manifest file hash: '+entry['path'])
for line in (INPUT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    digest,name=line.split(None,1); name=name.lstrip('* ')
    if hbytes((INPUT/name).read_bytes())!=digest: fail('input checksum-list entry: '+name)

source_rows=jsonl(INPUT/'source-cells.jsonl')
order=jsonl(INPUT/'source-order.jsonl')
current=jsonl(INPUT/'current-target-cells.jsonl')
contexts=jsonl(INPUT/'caller-contexts.jsonl')
blocks=jsonl(INPUT/'caller-context-blocks.jsonl')
if len(source_rows)!=20 or len(current)!=240 or len(contexts)!=20: fail('input row counts')
if manifest['sourceRecordCount']!=20 or manifest['cellCount']!=240 or window['range']!=[3540,3559]: fail('manifest/window shape')
if manifest['head']!=window['head'] or manifest['sourceOrderSha256']!=window['sourceOrderSha256'] or status['sourceOrderSha256']!=manifest['sourceOrderSha256']: fail('source-order digest pins')
if len(order)!=22 or [r['position'] for r in order]!=list(range(3539,3561)): fail('boundary position coverage')
if order[0]['boundaryKind']!='previous' or order[-1]['boundaryKind']!='next' or any(r['boundaryKind']!='selected' for r in order[1:-1]): fail('boundary roles')
source_by_pos={r['position']:r for r in source_rows}
context_by_pos={r['position']:r for r in contexts}
if len(source_by_pos)!=20 or len(context_by_pos)!=20: fail('duplicate source/context position')
for pos in range(3540,3560):
    s=source_by_pos[pos]; o=order[pos-3539]
    for field in ('sourceId','source','sourceIdSha256','sourceSha256'):
        if s[field]!=o[field]: fail(f'source/order pin {pos}: {field}')
    if s['sourceSha256']!=htext(s['source']) or s['sourceIdSha256']!=htext(s['sourceId']): fail(f'source hash {pos}')
    c=context_by_pos[pos]
    if c['sourceId']!=s['sourceId'] or c['sourceSha256']!=s['sourceSha256'] or c['head']!=manifest['head'] or c['tree']!=manifest['tree']: fail(f'caller context source pin {pos}')
    if not c['callerCount'] or not c['contextBlockIds']: fail(f'missing caller context {pos}')
if order[0]['sourceId']!='components.Selector.searchStatus' or order[-1]['sourceId']!='components.Settings.AudiobookshelfModal.name': fail('boundary identities')
findings=json.loads((INPUT/'caller-resolution-findings.json').read_text(encoding='utf-8'))
if findings['findings'] or findings['callerlessSourcePositions']: fail('unresolved caller finding')

pins=json.loads((INPUT/'file-pins.json').read_text(encoding='utf-8'))
if len(pins['catalogFiles'])!=13 or len(pins['runtimeFiles'])!=3: fail('file pin counts')
locale_order=window['localeOrder']
if len(locale_order)!=12 or window['catalogKeySetEqualsEnglish'] is not True: fail('locale/key-set pin')
for locale_info in window['localeInfo']:
    locale=locale_info['catalogKey']; path='src/i18n/locale/'+locale_info['clientFile']
    pin=pins['catalogFiles'].get(path)
    if pin is None or pin['keyCount']!=9494: fail('catalog path/key count '+locale)
    if pin['orderedKeysSha256']!=window['catalogOrderedKeyHashes'][locale]: fail('catalog ordered-key pin '+locale)
    if locale_info['tag']!=next(r['localeTag'] for r in current if r['locale']==locale): fail('locale tag pin '+locale)
for path,pin in pins['runtimeFiles'].items():
    if pin['path']!=path or len(pin['sha256'])!=64 or not pin['gitBlob']: fail('runtime file pin '+path)

catalogs={path:pin for path,pin in pins['catalogFiles'].items()}
base={(r['position'],r['locale']):r for r in current}
if len(base)!=240: fail('duplicate target cell')
ledger=jsonl(OUT/'blind-ledger.jsonl')
expected=[(p,l) for p in range(3540,3560) for l in locale_order]
if len(ledger)!=240 or [(r['position'],r['locale']) for r in ledger]!=expected: fail('ledger coverage/order')
block_by_id={b['contextId']:b for b in blocks}
if len(block_by_id)!=len(blocks): fail('duplicate context block id')
for row in ledger:
    key=(row['position'],row['locale']); old=base[key]; src=source_by_pos[row['position']]; ctx=context_by_pos[row['position']]
    if row['sourceId']!=src['sourceId'] or row['sourceSha256']!=src['sourceSha256'] or row['sourceKey']!=src['sourceKey']: fail(f'ledger source identity {key}')
    if row['sourceIdSha256']!=htext(row['sourceId']) or row['sourceSha256']!=htext(row['source']): fail(f'ledger source hash {key}')
    if row['currentTarget']!=old['currentTarget'] or row['currentTargetSha256']!=old['currentTargetSha256'] or row['currentTargetSha256']!=htext(old['currentTarget']): fail(f'baseline target pin {key}')
    catalog_path=old['catalogPath']; pin=catalogs.get(catalog_path)
    if pin is None or old['catalogSha256']!=pin['sha256'] or old['catalogGitBlob']!=pin['gitBlob']: fail(f'cell catalog pin {key}')
    if row['targetSha256']!=htext(row['target']): fail(f'proposed target hash {key}')
    if row['disposition'] not in ('retain','propose'): fail(f'disposition {key}')
    if row['disposition']=='retain' and row['target']!=row['currentTarget']: fail(f'retained target changed {key}')
    if row['disposition']=='propose' and row['target']==row['currentTarget']: fail(f'empty proposal {key}')
    if not row['rationale'] or row['confidence'] not in ('high','moderate','low'): fail(f'rationale/confidence {key}')
    for field in ('sourcePlaceholders','sourceMarkupTokens','sourceNumericTokens','sourceProtectedLiterals'):
        if row[field]!=src[field]: fail(f'source token evidence {field} {key}')
    if row['targetPlaceholders']!=re.findall(r'\{[^{}]+\}',row['target']) or row['targetPlaceholders']!=row['sourcePlaceholders']: fail(f'placeholder mismatch {key}')
    if row['targetMarkupTokens']!=re.findall(r'<[^>]+>',row['target']) or row['targetMarkupTokens']!=row['sourceMarkupTokens']: fail(f'markup mismatch {key}')
    if row['targetNumericTokens']!=re.findall(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)',row['target']) or row['targetNumericTokens']!=row['sourceNumericTokens']: fail(f'numeric-token mismatch {key}')
    if not all(lit in row['target'] for lit in row['sourceProtectedLiterals']): fail(f'protected literal lost {key}')
    if row['callerResolution']!=ctx['callerResolution'] or row['callerCount']!=ctx['callerCount']: fail(f'caller resolution/count {key}')
    if row['directMessageReferences']!=ctx['directMessageReferences']: fail(f'direct caller reference {key}')
    if row['dynamicLabelMappings']!=ctx['dynamicLabelMappings'] or row['dynamicRendererReferences']!=ctx['dynamicRendererReferences'] or row['typedStageMappings']!=ctx['typedStageMappings']: fail(f'dynamic/literal context {key}')
    refs=row['callerContextBlockRefs']
    if [r['contextId'] for r in refs]!=ctx['contextBlockIds']: fail(f'context block references {key}')
    for ref in refs:
        b=block_by_id.get(ref['contextId'])
        if b is None or ref['path']!=b['path'] or ref['role']!=b['role'] or ref['startLine']!=b['startLine'] or ref['endLine']!=b['endLine'] or ref['lineSha256s']!=[ln['lineSha256'] for ln in b['lines']]: fail(f'context block pin {key}')
    if row['nativeSpeakerApproval'] is not False: fail(f'native speaker status {key}')
    if row['localeTag']!=old['localeTag'] or row['position']!=old['position']: fail(f'locale or position {key}')
counts={d:sum(r['disposition']==d for r in ledger) for d in ('propose','retain')}
if counts!={'propose':8,'retain':232}: fail('ledger counts '+str(counts))
summary=json.loads((OUT/'summary.json').read_text(encoding='utf-8'))
if summary['reviewedCells']!=240 or summary['proposals']!=8 or summary['retains']!=232 or summary['holds']!=0: fail('summary counts')
if summary['candidateFreeChecksumListSha256']!=hbytes((INPUT/'SHA256SUMS.txt').read_bytes()): fail('summary input checksum')
print(json.dumps({'status':'PASS','cells':240,'proposals':counts['propose'],'retains':counts['retain'],'holds':0,'candidateFreeChecksumListSha256':summary['candidateFreeChecksumListSha256'],'head':manifest['head'],'tree':manifest['tree'],'sourceOrderSha256':manifest['sourceOrderSha256']},sort_keys=True))
