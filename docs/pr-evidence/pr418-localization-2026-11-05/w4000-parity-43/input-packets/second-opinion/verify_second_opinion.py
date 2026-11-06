#!/usr/bin/env python3
"""Verify the second-opinion ledger against the sealed candidate-free/cross-review inputs."""
from __future__ import annotations
import collections, hashlib, json, sys
from pathlib import Path
sys.dont_write_bytecode=True
TASK=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT=Path(__file__).resolve().parent
PACKET=TASK/'cross-review-sealed'; CF=TASK/'candidate-free'
sys.path.insert(0,str(OUT))
sys.path.insert(0,str(TASK/'cross-review'/'locale-c'))
import build_second_opinion as builder
import build_cross_review as util

def sha(data):
    if isinstance(data,str): data=data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()
def rows(path,key):
    values={}; hashes={}
    for raw in path.read_bytes().splitlines():
        if not raw.strip(): continue
        item=json.loads(raw); k=item[key]
        if k in values: raise ValueError(f'duplicate {key}: {k}')
        values[k]=item; hashes[k]=sha(raw)
    return values,hashes
def fail(msg): raise SystemExit('FAIL: '+msg)
def check_sums():
    listed={}
    for line in (OUT/'SHA256SUMS.txt').read_text().splitlines():
        if not line.strip(): continue
        digest,name=line.split('  ',1)
        p=Path(name)
        if p.is_absolute() or '..' in p.parts or name in listed: fail('unsafe or duplicate checksum entry '+name)
        target=OUT/p
        if not target.is_file() or sha(target.read_bytes())!=digest: fail('checksum mismatch '+name)
        listed[name]=digest
    actual={p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
    if set(listed)!=actual: fail('checksum inventory mismatch')

def main():
    check_sums()
    manifest=json.loads((PACKET/'manifest.json').read_text())
    cross,cross_raw=rows(PACKET/'cross-ledger.jsonl','cellId')
    gaps,gap_raw=rows(CF/'gap-cells.jsonl','cellId')
    changed,changed_raw=rows(CF/'changed-source-cells.jsonl','cellId')
    contexts,ctx_raw=rows(CF/'caller-contexts.jsonl','sourceId')
    candidate={**gaps,**changed}; raw={**gap_raw,**changed_raw}
    ledger=[json.loads(x) for x in (OUT/'ledger.jsonl').read_text().splitlines() if x.strip()]
    summary=json.loads((OUT/'summary.json').read_text())
    if len(ledger)!=528 or len({r['cellId'] for r in ledger})!=528: fail('ledger row count/uniqueness')
    if set(r['cellId'] for r in ledger)!=set(cross): fail('cell coverage')
    counts=collections.Counter(); ordered=sorted(ledger,key=lambda r:(r['sourcePosition'],r['locale']))
    if [x['cellId'] for x in ledger]!=[x['cellId'] for x in ordered]: fail('ledger ordering')
    refresh=0
    for r in ledger:
        cid=r['cellId']; c=candidate[cid]; x=cross[cid]; ctx=contexts[r['sourceId']]
        for key,want in {
          'prNumber':418,'headSha':manifest['exactHead'],'headTree':manifest['exactTree'],
          'baseSha':manifest['baseSha'],'baseTree':manifest['baseTree'],
          'sourceId':x['sourceId'],'locale':x['locale'],'sourcePosition':x['sourcePosition'],
          'category':x['category'],'cellStatus':x['cellStatus'],
          'sourceIdSha256':x['sourceIdSha256'],'localeSha256':sha(x['locale']),
          'sourceText':x['sourceText'],'sourceTextSha256':x['sourceTextSha256'],
          'callerContextSha256':ctx['callerContextSha256'],'callerContextRawRowSha256':ctx_raw[x['sourceId']],
          'callerContextEvidenceRowSha256':x['callerContextEvidenceRowSha256'],
          'candidateFreeCellSha256':x['candidateFreeCellSha256'],'candidateFreeCellRawRowSha256':raw[cid],
          'targetCatalogPath':c['targetCatalogPath'],'targetCatalogSha256':c['targetCatalogSha256'],
          'targetCatalogGitBlob':c['targetCatalogGitBlob'],
          'currentTargetPresent':x['currentTargetPresent'],'currentTarget':x['currentTarget'],
          'currentTargetSha256':x['currentTargetSha256'],'crossReviewDisposition':x['disposition'],
          'crossLedgerRawRowSha256':cross_raw[cid],
          'crossRecommendedTarget':x['recommendedTarget'],
          'crossRecommendedTargetSha256':x['recommendedTargetSha256'],
          'callerDefinition':ctx['definition'],'callerSites':ctx['sites'],
        }.items():
            if r.get(key)!=want: fail(f'{key} binding mismatch: {cid}')
        expected_src=c.get('sourceText',c.get('currentEnglishSourceText'))
        expected_src_hash=c.get('sourceTextSha256',c.get('currentEnglishSourceSha256'))
        if r['sourceText']!=expected_src or r['sourceTextSha256']!=expected_src_hash: fail('candidate-free source binding '+cid)
        if r['currentEnglishSourceText']!=c.get('currentEnglishSourceText') or r['currentEnglishSourceSha256']!=c.get('currentEnglishSourceSha256'): fail('current English source binding '+cid)
        if r['currentTargetSha256']!=c['currentTargetSha256'] or (r['currentTarget'] is not None and sha(r['currentTarget'])!=r['currentTargetSha256']): fail('current-target hash '+cid)
        expected_adjust=builder.ADJUSTMENTS.get(cid)
        if expected_adjust:
            if r['disposition']!='adjust' or (r['chosenTarget'],r['rationale'])!=expected_adjust: fail('adjustment map mismatch '+cid)
        else:
            if r['disposition']!='accept' or r['chosenTarget']!=x['recommendedTarget']: fail('accepted target mismatch '+cid)
        if sha(r['chosenTarget'])!=r['chosenTargetSha256']: fail('chosen target hash '+cid)
        checks=util.token_checks(r['sourceText'],r['chosenTarget'])
        if not checks['allMatch'] or checks!=r['independentTokenChecks']: fail('placeholder/token/markup check '+cid)
        if x['sourceId']=='components.CollectionQueue.existing4k' and '4K' not in r['chosenTarget']: fail('protected 4K '+cid)
        if x['sourceId']=='discovery.accounts.traktSetup' and '/api/v1/integrations/discovery/trakt/callback' not in r['chosenTarget']: fail('protected callback '+cid)
        if r['headedBrowserAcceptance'] is not False or r['nativeSpeakerAcceptance'] is not False: fail('review gate statement '+cid)
        counts[r['disposition']]+=1
        if r['category']=='changed-source-refresh':
            refresh+=1
            if not r['currentTargetPresent'] or not r['currentTargetSha256']: fail('refresh target hash missing '+cid)
            if '{count}' not in r['chosenTarget']: fail('refresh placeholder missing '+cid)
        elif r['currentTargetPresent'] or r['currentTarget'] is not None or r['currentTargetSha256'] is not None:
            fail('insertion target should be absent '+cid)
    if counts!=collections.Counter({'accept':512,'adjust':16}): fail(f'disposition counts {counts}')
    if refresh!=12: fail('refresh count')
    for key,want in {
      'artifact':'SeerrNG PR #418 W4000-W4019 parity second opinion','result':'PASS',
      'headSha':manifest['exactHead'],'headTree':manifest['exactTree'],
      'baseSha':manifest['baseSha'],'baseTree':manifest['baseTree'],'cells':528,
      'sourceIds':44,'locales':12,'insertionGaps':516,'changedSourceRefreshes':12,
      'dispositions':{'accept':512,'adjust':16},'holds':0,
      'targetTokenFailures':0,'crossLedgerRawRowsBound':528,
      'candidateFreeCellRawRowsBound':528,'callerContextRawRowsBound':528,
      'nativeSpeakerReviewPerformed':False,'headedBrowserReviewPerformed':False,
    }.items():
        if summary.get(key)!=want: fail('summary mismatch '+key)
    print('PASS: hash-bound second opinion covers all 528 cells at pinned SeerrNG PR #418 head/tree/base; 512 accept, 16 adjust, 0 hold; refresh hashes, caller/source bindings, and target token/markup checks verified.')

if __name__=='__main__': main()
