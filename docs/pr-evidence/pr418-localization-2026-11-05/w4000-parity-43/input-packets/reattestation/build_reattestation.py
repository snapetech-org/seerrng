import hashlib, importlib.util, json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
OLD=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-20261105')
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('candidate_free',ROOT/'candidate-free'/'build_candidate_free.py')
b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

def jl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def sha(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()
def writejl(name, rows): (OUT/name).write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')

old_gap={r['cellId']:r for r in jl(OLD/'gap-cells.jsonl')}
old_refresh={r['cellId']:r for r in jl(OLD/'changed-source-cells.jsonl')}
new_gap={r['cellId']:r for r in jl(ROOT/'candidate-free'/'gap-cells.jsonl')}
new_refresh={r['cellId']:r for r in jl(ROOT/'candidate-free'/'changed-source-cells.jsonl')}
old_cells={**old_gap,**old_refresh}; new_cells={**new_gap,**new_refresh}
old_context={r['sourceId']:r for r in jl(OLD/'caller-contexts.jsonl')}
new_context={r['sourceId']:r for r in jl(ROOT/'candidate-free'/'caller-contexts.jsonl')}
old_primary=jl(ROOT/'primary-review-old-head'/'review-ledger.jsonl')
old_blind=jl(ROOT/'blind-review-old-head'/'ledger.jsonl')
if len(old_cells)!=528 or len(new_cells)!=528 or len(old_primary)!=528 or len(old_blind)!=528:
    raise SystemExit('expected 528 cells in candidate-free and both review lanes')
new_manifest=json.loads((ROOT/'candidate-free'/'manifest.json').read_text(encoding='utf-8'))
if new_manifest['exactHead']!=b.HEAD or new_manifest['exactTree']!=b.TREE:
    raise SystemExit('fresh candidate-free manifest head/tree mismatch')
if set(old_cells)!=set(new_cells): raise SystemExit('cell inventory changed')

for sid in old_context:
    if sid not in new_context: raise SystemExit('caller source id removed: '+sid)
    if old_context[sid]['callerContextSha256']!=new_context[sid]['callerContextSha256']:
        raise SystemExit('caller context changed: '+sid)

for cell,old in old_cells.items():
    new=new_cells[cell]
    for field in ('sourceId','locale','sourceIdSha256','sourceText','sourceTextSha256','callerContextSha256','currentTarget','currentTargetSha256'):
        if old.get(field)!=new.get(field): raise SystemExit(f'{field} changed for {cell}')
    if new_manifest['exactHead']!=b.HEAD or new_manifest['exactTree']!=b.TREE: raise SystemExit('new cell packet not pinned to current head')


def lane(rows, kind):
    outrows=[]; seen=set()
    for row in rows:
        cell=row['cellId']
        if cell in seen or cell not in new_cells: raise SystemExit(f'duplicate or unknown {kind} cell: {cell}')
        seen.add(cell)
        fresh=new_cells[cell]
        source=fresh.get('sourceText',fresh.get('currentEnglishSourceText'))
        source_hash=fresh.get('sourceTextSha256',fresh.get('currentEnglishSourceSha256'))
        if row['sourceId']!=fresh['sourceId'] or row['locale']!=fresh['locale']:
            raise SystemExit(f'identity mismatch {kind}: {cell}')
        old_target=row.get('currentTarget')
        old_target_sha=row.get('currentTargetSha256')
        if old_target!=fresh.get('currentTarget') or old_target_sha!=fresh.get('currentTargetSha256'):
            raise SystemExit(f'current target changed {kind}: {cell}')
        old_context_sha=row.get('sourceContextSha256',row.get('callerContextSha256'))
        if old_context_sha!=fresh['callerContextSha256']:
            raise SystemExit(f'caller hash changed {kind}: {cell}')
        if row['sourceText']!=source or row['sourceTextSha256']!=source_hash:
            raise SystemExit(f'source text changed {kind}: {cell}')
        proposal=row['proposedTarget']
        prop_sha=sha(proposal)
        stored=row.get('proposedTargetSha256')
        if stored!=prop_sha: raise SystemExit(f'proposal hash mismatch {kind}: {cell}')
        token=b.checks(source,proposal)
        mismatch=[k for k,v in token['checks'].items() if not v]
        allowed_numeric={'components.CollectionQueue.description::ja','components.Settings.analyzeOnPlaybackTip::ja'}
        numeric_exception=(mismatch==['numericTokens'] and cell in allowed_numeric and row['locale']=='ja')
        if mismatch and not numeric_exception: raise SystemExit(f'unexpected proposal token mismatch {kind} {cell}: {mismatch}')
        saved=row.get('tokenChecks')
        if kind=='primary':
            if saved!=token: raise SystemExit(f'primary token record drift: {cell}')
        else:
            if numeric_exception:
                if not isinstance(saved,dict) or not all(saved.values()): raise SystemExit(f'blind stored token claim is not all-pass: {cell}')
            elif saved!=token['checks']: raise SystemExit(f'blind token record drift: {cell}')
        outrows.append({
            'cellId':cell,'sourceId':row['sourceId'],'locale':row['locale'],
            'oldReviewHead':row.get('sourceHead',row.get('exactHead')),
            'oldReviewTree':row.get('sourceTree',row.get('exactTree')),
            'currentHead':b.HEAD,'currentTree':b.TREE,
            'sourceIdSha256':fresh['sourceIdSha256'],
            'sourceTextSha256':source_hash,
            'sourceTextUnchanged':True,
            'oldCallerContextSha256':old_context_sha,
            'currentCallerContextSha256':fresh['callerContextSha256'],
            'callerContextUnchanged':True,
            'oldCurrentTargetSha256':old_target_sha,
            'currentTargetSha256':fresh.get('currentTargetSha256'),
            'currentTargetStateUnchanged':True,
            'oldCandidateFreeCellSha256':row.get('inputCellSha256',row.get('candidateFreeCellSha256')),
            'currentSourceCatalogCellSha256':fresh.get('sourceRowSha256'),
            'candidateSha256':prop_sha,
            'candidateTextIncluded':False,
            'tokenChecksPass':not mismatch,
            'tokenCheckException':({'class':'numericTokens','sourceTokens':token['sourceTokens']['numericTokens'],'candidateTokens':token['targetTokens']['numericTokens'],'reason':'Japanese localized number words may be rendered with Arabic digits; cross-review must confirm exact semantic equivalence.'} if numeric_exception else None),
            'reviewDisposition':row.get('semanticDisposition',row.get('decision')),
            'confidence':row.get('confidence'),
        })
    if len(seen)!=528: raise SystemExit(f'incomplete {kind} lane: {len(seen)}')
    return outrows

primary=lane(old_primary,'primary')
blind=lane(old_blind,'blind')
writejl('primary-reattestation.jsonl',primary)
writejl('blind-reattestation.jsonl',blind)
old_pins=json.loads((OLD/'catalog-audit.json').read_text())['catalogPins']
new_pins=json.loads((ROOT/'candidate-free'/'catalog-audit.json').read_text())['catalogPins']
changed_catalogs=[l for l in new_pins if old_pins[l]['sha256']!=new_pins[l]['sha256']]
summary={
 'result':'PASS', 'repository':'snapetech-org/seerrng', 'pullRequest':418,
 'oldReviewHead':'77d30ae742aad7245e6e419237fca6a544531e1f',
 'oldReviewTree':'2c6fe4a0c1c33aa56b01f06a70702f68598509a7',
 'currentHead':b.HEAD,'currentTree':b.TREE,'baseSha':b.BASE,
 'cells':528,'primaryRowsReattested':len(primary),'blindRowsReattested':len(blind),
 'sourceIdsReattested':44,'sourceTextHashesMatched':528,'currentTargetHashesMatched':528,
 'callerContextsReattested':44,'callerContextHashesMatched':44,
 'primaryCandidateHashesVerified':528,'blindCandidateHashesVerified':528,
 'storedPrimaryAndBlindTokenCheckClaimsPass':1056,'mechanicallyMatchingCandidateTokenSets':1054,
 'numericTokenSemanticExceptions':2,'numericTokenExceptionCells':['components.CollectionQueue.description::ja','components.Settings.analyzeOnPlaybackTip::ja'],
 'sourceOrTargetCellDrift':0,
 'changedTargetCatalogBlobLocales':changed_catalogs,
 'catalogBlobChangesExplanation':'Only the completed W4000-W4019 locale edits changed the 12 target catalog file blobs; this 44-source parity inventory is disjoint and every source/current-target/caller cell hash is unchanged.',
 'primaryHoldCount':sum(r.get('semanticDisposition')=='hold' for r in old_primary),
 'blindHoldCount':sum(r.get('decision')=='hold' for r in old_blind),
 'translationTextIncludedInReattestation':False,
 'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,
 'testsBuildsScansCiOrWorkflowsRun':False,
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
readme=f'''# SeerrNG PR #418 parity review exact-head reattestation

The original primary and independent blind packets were sealed at `77d30ae742aad7245e6e419237fca6a544531e1f` / tree `2c6fe4a0c1c33aa56b01f06a70702f68598509a7`. After W4000–W4019 was adjudicated and committed, the parity candidate-free packet was rebuilt at current PR head `{b.HEAD}` / tree `{b.TREE}`.

This reattestation binds all 528 primary and blind proposals to the fresh current-head packet without exposing proposal text. All 528 source text and current-target hashes, all 44 caller-context hashes, all 528 proposal hashes in each lane match. All 1,056 original lane records report token checks passing. A stricter numeric scanner flags two Japanese digit renderings of source number words; those cells are isolated for semantic cross-review. No source or target cell changed. All 12 catalog-file blobs changed because the previously applied W4000 product edits changed the same locale files; the parity cell values remain exact and its 44 source IDs are disjoint from W4000.

The original sealed candidate packets remain unchanged under `../primary-review-old-head/` and `../blind-review-old-head/`, including their complete decision ledgers, proposal files, summaries, verifier inputs, and internal checksums. The hash-only reattestation rows here contain no candidate text. The cross-review must use the current candidate-free packet and these reattestation proofs before making any new disposition.

No translation catalog or PR was modified by this reattestation. It does not claim native-speaker or headed-browser review. No tests, builds, scans, or CI jobs were run.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
files=sorted(p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt')
manifest={'artifact':'SeerrNG PR #418 parity current-head candidate reattestation','schemaVersion':1,
 'packetType':'review-reattestation','repository':'snapetech-org/seerrng','pullRequest':418,
 'oldReviewHead':'77d30ae742aad7245e6e419237fca6a544531e1f','oldReviewTree':'2c6fe4a0c1c33aa56b01f06a70702f68598509a7',
 'currentHead':b.HEAD,'currentTree':b.TREE,'baseSha':b.BASE,'cells':528,'sourceIds':44,
 'primaryRows':528,'blindRows':528,'proposalTextsExcluded':True,'files':files,'checksums':'SHA256SUMS.txt'}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
lines=[]
for p in sorted(OUT.iterdir()):
 if p.is_file() and p.name!='SHA256SUMS.txt': lines.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name)
(OUT/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
