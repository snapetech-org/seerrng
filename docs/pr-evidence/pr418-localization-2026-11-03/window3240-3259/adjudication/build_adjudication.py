#!/usr/bin/env python3
"""Build the sealed W3240-W3259 root adjudication packet from pinned ledgers."""
from __future__ import annotations
import collections, hashlib, json, re
from pathlib import Path

OUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-adjudication-20261103')
INPUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-3259-20261103/clean-input')
PRIMARY = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-3259-20261103/primary')
BLIND = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-blind-root-20261103')
EXPECTED = {
    'head': 'd514838bbcca18d7255ba04a0266c4a78b41a499',
    'tree': '3c90e26e7e04e4e008ed43f4004dbb0048357f92',
    'input_window_sha256': '7811e601bd41292c99066948f6807d390b90b12cc3e487b4074e0f8df5917b9b',
    'input_checksum_list_sha256': 'cdb641f171f9118dc8080d0aab2d8df1b4a2acdceadbf3fbcafe39f6ecc7f84d',
    'primary_checksum_list_sha256': '3cfa04a6d6b6debeb945e5531070a83edfabb78a01b6e8e8efe05f717a16fb70',
    'blind_checksum_list_sha256': 'f007bd48230c916222e7187a127011ce178603639ecfd4ee4c581228fc3f9ce8',
}
# For the 77 cells where the sealed primary and blind reviewers differ, choose
# which reviewed wording to carry into the proposed adjudication. Every other
# cell is either agreement on the current value or an identical shared proposal.
CHOICE = {
    '3240:fr':'primary', '3240:ko':'blind',
    '3241:es':'primary', '3241:de':'primary', '3241:vi':'primary',
    '3242:hi':'blind', '3242:de':'blind', '3242:pt_BR':'primary', '3242:id':'primary',
    '3243:hi':'blind', '3243:de':'primary', '3243:ja':'primary', '3243:pt_BR':'blind', '3243:id':'blind',
    '3244:hi':'blind', '3244:fr':'primary', '3244:pt_BR':'primary', '3244:ko':'blind', '3244:zh_Hant':'primary',
    '3245:hi':'blind', '3245:de':'primary', '3245:pt_BR':'primary',
    '3246:es':'primary', '3246:fr':'primary', '3246:pt_BR':'primary', '3246:ar':'blind', '3246:ko':'blind', '3246:zh_Hant':'primary', '3246:vi':'blind',
    '3248:ko':'blind', '3248:zh_Hant':'primary',
    '3249:zh_Hans':'primary', '3249:zh_Hant':'primary', '3249:vi':'primary', '3249:id':'blind',
    '3250:es':'primary', '3250:ar':'primary', '3250:zh_Hant':'primary', '3250:vi':'blind',
    '3251:vi':'primary', '3252:ja':'primary', '3252:pt_BR':'primary', '3253:es':'blind',
    '3254:es':'primary', '3254:zh_Hans':'blind', '3254:hi':'primary', '3254:de':'blind', '3254:ja':'blind',
    '3254:fr':'root', '3254:pt_BR':'primary', '3254:ar':'primary', '3254:ko':'primary',
    '3254:zh_Hant':'primary', '3254:vi':'primary', '3254:id':'blind',
    '3255:de':'blind', '3255:ar':'primary', '3255:vi':'primary',
    '3256:es':'primary', '3256:hi':'blind', '3256:fr':'blind', '3256:pt_BR':'blind',
    '3256:ar':'root', '3256:es':'root', '3256:zh_Hant':'blind', '3256:vi':'blind', '3256:id':'primary',
    '3256:pt_BR':'root',
    '3257:es':'root', '3257:zh_Hans':'primary', '3257:hi':'blind', '3257:fr':'primary',
    '3257:pt_BR':'root', '3257:ar':'primary', '3257:vi':'primary',
    '3258:es':'primary', '3258:fr':'primary', '3258:zh_Hant':'primary', '3259:zh_Hans':'blind',
}
CUSTOM = {
    '3254:fr': ('Seerr annulera toutes les tâches en cours qu’il peut identifier, nettoiera les enregistrements temporaires liés à la demande, puis supprimera définitivement cette entrée et son historique.',
               'The source describes work the system can identify, cleanup of temporary request records, and permanent removal. This wording keeps the sequence explicit and makes the temporary records relate naturally to the request.'),
    '3256:ar': ('تم حذف سجل الطلب.',
                'The pinned caller confirms the deleted item is a persistent request record; سجل الطلب names that record, while إدخال الطلب can read as user input or an entry.'),
    '3256:es': ('Se eliminó el registro de la solicitud.',
                'Name the persistent request record explicitly and use the record term shared with the adjacent confirmation prompt.'),
    '3256:pt_BR': ('O registro da solicitação foi excluído.',
                   'Name the persistent request record explicitly and use the record term shared with the adjacent confirmation prompt.'),
    '3257:es': ('¿Eliminar el registro de la solicitud?',
                'Use the same record term as the deletion-success message in a grammatical confirmation prompt.'),
    '3257:pt_BR': ('Excluir o registro da solicitação?',
                   'Use the same record term as the deletion-success message in a grammatical confirmation prompt.'),
}
LOCALE_RANK = {}
PLACEHOLDER_RE = re.compile(r'\{[^{}]+\}|%[sdif]|\{\{[^{}]+\}\}')

def sha_bytes(b: bytes) -> str: return hashlib.sha256(b).hexdigest()
def sha_text(s: str) -> str: return sha_bytes(s.encode('utf-8'))
def translation_hash(s: str) -> str: return sha_text(json.dumps(s, ensure_ascii=False, separators=(',', ':')))
def read_json(path: Path): return json.loads(path.read_text(encoding='utf-8'))
def read_lines(path: Path): return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
def canonical(obj): return json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + '\n'
def target(decision, current):
    return current if decision in ('accept-current', 'accept_current') else decision

def verify_manifest(directory: Path, manifest: Path):
    for line in manifest.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        digest, name = line.split('  ', 1)
        actual = sha_bytes((directory / name).read_bytes())
        if digest != actual: raise ValueError(f'checksum mismatch: {directory / name}')

# Pin all sealed inputs before reading proposal data.
for d, fname, want in [
    (INPUT, 'SHA256SUMS.txt', EXPECTED['input_checksum_list_sha256']),
    (PRIMARY, 'SHA256SUMS.txt', EXPECTED['primary_checksum_list_sha256']),
    (BLIND, 'SHA256SUMS.txt', EXPECTED['blind_checksum_list_sha256']),
]:
    got = sha_bytes((d / fname).read_bytes())
    if got != want: raise ValueError(f'{fname} digest mismatch: {got} != {want}')
    verify_manifest(d, d / fname)
window = read_json(INPUT / 'window.json')
reattest = read_json(OUT / 'live-head-reattestation.json')
if sha_bytes((INPUT / 'window.json').read_bytes()) != EXPECTED['input_window_sha256']:
    raise ValueError('window manifest hash mismatch')
if window['head'] != EXPECTED['head'] or window['tree'] != EXPECTED['tree']:
    raise ValueError('base head/tree mismatch')
if reattest.get('reviewInputHead') != EXPECTED['head'] or reattest.get('reviewInputTree') != EXPECTED['tree']:
    raise ValueError('reattestation review base mismatch')
if reattest.get('reattestedPrHead') != 'c335cbd29244207e534f8a4f0d1e139d12c104c0' or reattest.get('reattestedTree') != 'baa8c358f7e0e286ebd4209f4fca9b62f78be5f6':
    raise ValueError('reattested PR base mismatch')
if not (reattest.get('allCatalogPinsMatched') and reattest.get('allSourceCurrentAndTranslationHashesMatched')
        and reattest.get('allCallerFilePinsMatched') and reattest.get('allCallerContextSnippetsMatched')
        and not reattest.get('relevantFilesChanged') and reattest.get('cellsReattested') == 240):
    raise ValueError('source/current/catalog/caller reattestation failed')
reattest_hash = sha_bytes((OUT/'live-head-reattestation.json').read_bytes())
if window['range'] != [3240, 3259] or window['cellCount'] != 240:
    raise ValueError('window scope mismatch')

input_rows = read_lines(INPUT / 'review-input.jsonl')
primary_rows = read_lines(PRIMARY / 'primary-decisions.jsonl')
blind_rows = read_lines(BLIND / 'independent-decisions.jsonl')
key = lambda x: (x['position'], x['locale'])
I = {key(x): x for x in input_rows}
P = {key(x): x for x in primary_rows}
B = {key(x): x for x in blind_rows}
if len(I) != 240 or len(P) != 240 or len(B) != 240 or set(I) != set(P) or set(I) != set(B):
    raise ValueError('row coverage mismatch')
locale_rank = {loc:i for i,loc in enumerate(window['localeOrder'])}

actual_conflicts = set()
for k in I:
    ir, p, b = I[k], P[k], B[k]
    for field in ('id','source','sourceSha256','currentTarget','currentTargetSha256','catalogTranslationHash'):
        if p.get(field) != ir.get(field) or b.get(field) != ir.get(field):
            raise ValueError(f'input/review mismatch {k} {field}')
    if p.get('catalogPath') is None or p.get('catalogTranslationHash') != ir['catalogTranslationHash']:
        raise ValueError(f'catalog pin mismatch {k}')
    if p.get('callerContextHashes') != ir.get('callerContextHashes'):
        raise ValueError(f'primary caller context mismatch {k}')
    if sorted(b.get('callerContextSha256s', [])) != sorted(ir.get('callerContextHashes', [])):
        raise ValueError(f'blind caller context mismatch {k}')
    if sha_text(ir['source']) != ir['sourceSha256'] or sha_text(ir['currentTarget']) != ir['currentTargetSha256']:
        raise ValueError(f'source/current hash mismatch {k}')
    p_target = ir['currentTarget'] if p['decision'] == 'accept-current' else p['proposedTarget']
    b_target = ir['currentTarget'] if b['disposition'] == 'accept-current' else b['proposedTarget']
    if p_target is None or b_target is None: raise ValueError(f'missing proposed target {k}')
    if p['proposedTarget'] is None or sha_text(p['proposedTarget']) != p['proposedTargetSha256']:
        raise ValueError(f'primary target hash mismatch {k}')
    if translation_hash(p['proposedTarget']) != p['proposedCatalogTranslationHash']:
        raise ValueError(f'primary translation hash mismatch {k}')
    if b.get('proposedTarget') is not None and b.get('proposedTargetSha256') is not None and sha_text(b['proposedTarget']) != b['proposedTargetSha256']:
        raise ValueError(f'blind target hash mismatch {k}')
    if p_target != b_target: actual_conflicts.add(f'{k[0]}:{k[1]}')

if actual_conflicts != set(CHOICE):
    missing, extra = sorted(actual_conflicts-set(CHOICE)), sorted(set(CHOICE)-actual_conflicts)
    raise ValueError(f'adjudication choices do not exactly cover disagreements: missing={missing}; extra={extra}')

# Construct the row-complete, readback-verifiable adjudication proposal.
rows=[]
for k in sorted(I, key=lambda z:(z[0], locale_rank[z[1]])):
    ir, p, b = I[k], P[k], B[k]
    keystr=f'{k[0]}:{k[1]}'
    p_target = ir['currentTarget'] if p['decision'] == 'accept-current' else p['proposedTarget']
    b_target = ir['currentTarget'] if b['disposition'] == 'accept-current' else b['proposedTarget']
    if p_target == b_target:
        final_target = p_target
        selection = 'independent-agreement'
        if final_target == ir['currentTarget']:
            rationale = 'Both sealed reviews independently accepted the current wording; retain it.'
        else:
            rationale = 'Both sealed reviews independently proposed this identical wording; adopt their shared proposal.'
    else:
        selection = CHOICE[keystr]
        if selection == 'primary':
            final_target = p_target
            rationale = 'Selected the sealed primary proposal after comparing both reviews. Basis: ' + p['rationale']
        elif selection == 'blind':
            final_target = b_target
            rationale = 'Selected the strict-blind proposal after comparing both reviews. Basis: ' + b['rationale']
        elif selection == 'root':
            final_target, rationale = CUSTOM[keystr]
        else: raise ValueError(f'unknown choice {selection}')
    if final_target == ir['currentTarget']:
        final_disp='accept-current'
    elif selection == 'root':
        final_disp='correction'
    else:
        reviewer_disps = {p['decision'], b['disposition']}
        final_disp = 'correction' if 'correction' in reviewer_disps else 'refinement'
    placeholders = sorted(PLACEHOLDER_RE.findall(ir['source']))
    if placeholders != sorted(b.get('placeholders', [])):
        raise ValueError(f'blind/source placeholder mismatch {k}')
    final_placeholders = sorted(PLACEHOLDER_RE.findall(final_target))
    if final_placeholders != placeholders:
        raise ValueError(f'final placeholder mismatch {k}: {placeholders} != {final_placeholders}')
    literals = b.get('protectedLiterals', [])
    if any(lit not in final_target for lit in literals):
        raise ValueError(f'protected literal mismatch {k}')
    rows.append({
        'position': ir['position'], 'id': ir['id'], 'locale': ir['locale'],
        'source': ir['source'], 'sourceSha256': ir['sourceSha256'],
        'currentTarget': ir['currentTarget'], 'currentTargetSha256': ir['currentTargetSha256'],
        'currentCatalogTranslationHash': ir['catalogTranslationHash'],
        'catalogPath': p['catalogPath'], 'catalogFileSha256': p['catalogFileSha256'],
        'catalogGitBlob': p['catalogGitBlob'], 'callerContextHashes': ir['callerContextHashes'],
        'primaryDecision': p['decision'], 'primaryTarget': p_target,
        'primaryTargetSha256': sha_text(p_target), 'primaryRationale': p['rationale'],
        'blindDisposition': b['disposition'], 'blindTarget': b_target,
        'blindTargetSha256': sha_text(b_target), 'blindRationale': b['rationale'],
        'protectedLiterals': literals, 'placeholders': placeholders,
        'finalDisposition': final_disp, 'finalTarget': final_target,
        'finalTargetSha256': sha_text(final_target),
        'finalCatalogTranslationHash': translation_hash(final_target),
        'selection': selection, 'adjudicationRationale': rationale,
    })

# Final structural audit: exactly 20 IDs x 12 locales, no duplicate cells, no holds.
if len(rows) != 240 or len({(r['position'],r['locale']) for r in rows}) != 240:
    raise ValueError('final row coverage invalid')
counts=collections.Counter(r['finalDisposition'] for r in rows)
selections=collections.Counter(r['selection'] for r in rows)
changed=sum(r['finalTarget'] != r['currentTarget'] for r in rows)
summary={
    'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3240-W3259',
    'baseHead':reattest['reattestedPrHead'],'baseTree':reattest['reattestedTree'],
    'reviewInputHead':EXPECTED['head'],'reviewInputTree':EXPECTED['tree'],
    'liveHeadReattestationSha256':reattest_hash,
    'sourceIds':20,'locales':12,'cells':len(rows),
    'sourceOrderCount':window['sourceOrderCount'],'sourceOrderSha256':window['sourceOrderSha256'],
    'finalDispositions':dict(counts),'selectionCounts':dict(selections),
    'changedCells':changed,'holds':0,
    'cleanInputWindowManifestSha256':EXPECTED['input_window_sha256'],
    'cleanInputChecksumListSha256':EXPECTED['input_checksum_list_sha256'],
    'primaryChecksumListSha256':EXPECTED['primary_checksum_list_sha256'],
    'blindChecksumListSha256':EXPECTED['blind_checksum_list_sha256'],
    'primaryDecisionLedgerSha256':sha_bytes((PRIMARY/'primary-decisions.jsonl').read_bytes()),
    'blindDecisionLedgerSha256':sha_bytes((BLIND/'independent-decisions.jsonl').read_bytes()),
    'nativeSpeakerApproval':False,'rootRatification':'pending',
    'allSourceCurrentAndCatalogPinsMatched':True,
    'placeholderMismatches':0,'protectedLiteralMismatches':0,
    'catalogKeySetOrOrderChangesProposed':False,
    'workflowChangesProposed':False,'testsBuildsScansOrCiRun':False,
    'applyAuthorized':False,
}
meta={
    'repository':'snapetech-org/seerrng','pullRequest':418,'window':[3240,3259],
    'baseHead':reattest['reattestedPrHead'],'baseTree':reattest['reattestedTree'],
    'reviewInputHead':EXPECTED['head'],'reviewInputTree':EXPECTED['tree'],
    'liveHeadReattestationFile':'live-head-reattestation.json','liveHeadReattestationSha256':reattest_hash,
    'sourceOrderCount':window['sourceOrderCount'],'sourceOrderSha256':window['sourceOrderSha256'],
    'cleanInputWindowManifestSha256':EXPECTED['input_window_sha256'],
    'cleanInputChecksumListSha256':EXPECTED['input_checksum_list_sha256'],
    'primaryChecksumListSha256':EXPECTED['primary_checksum_list_sha256'],
    'blindChecksumListSha256':EXPECTED['blind_checksum_list_sha256'],
    'catalogPins':window['localeCatalogPins'],
    'allLocaleKeyCounts':{path:p['keyCount'] for path,p in window['localeCatalogPins'].items()},
    'orderedCatalogKeyHashes':{path:p['orderedKeySha256'] for path,p in window['localeCatalogPins'].items()},
    'callerFilePins':window['callerFiles'],
    'nativeSpeakerApproval':False,'status':'proposal-sealed-awaiting-parent-ratification',
}
(OUT/'adjudication-proposal.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows),encoding='utf-8')
(OUT/'summary.json').write_text(canonical(summary),encoding='utf-8')
(OUT/'manifest.json').write_text(canonical(meta),encoding='utf-8')
readme=f'''# SeerrNG PR #418 W3240–W3259 adjudication proposal\n\nThis packet contains a proposed root adjudication for 240 translation cells (20 source IDs × 12 locales). The primary and blind reviews were based on head `{EXPECTED['head']}` and tree `{EXPECTED['tree']}`. Before ratification, every English source key/value, current locale target and translation hash, all 13 locale catalogs, all 6 caller files, and all 108 pinned caller snippets were re-attested at the live PR head `{reattest['reattestedPrHead']}` / tree `{reattest['reattestedTree']}`; only two earlier-window evidence files changed between those commits. The full re-attestation receipt is checksum-pinned in `manifest.json`.\n\nThe exact input, primary, and strict-blind review packets are checksum-pinned in `manifest.json`; the row ledger preserves both reviewer decisions, targets, and rationales alongside the selected target and its hash. Identical independent decisions were carried forward. Disagreements were adjudicated against the pinned production caller context; root-authored wording covers the French destructive-action message and five request-record labels/prompts. No repository files were edited. This remains a proposal pending parent ratification, and is not authorized for application.\n\nThe final audit covers all 240 cells, confirms source/current/catalog pin agreement, preserves the 9,494-key catalog structures, and reports zero placeholder or protected-literal mismatches. Native-speaker approval is not represented. No tests, builds, scans, or CI jobs were run.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
# The builder and all output files are included in the seal; the manifest itself is excluded.
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt')
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha_bytes(p.read_bytes())}  {p.name}\n' for p in files),encoding='utf-8')
print(canonical(summary),end='')
print('conflicts_adjudicated=',len(actual_conflicts),'cells=',len(rows))
