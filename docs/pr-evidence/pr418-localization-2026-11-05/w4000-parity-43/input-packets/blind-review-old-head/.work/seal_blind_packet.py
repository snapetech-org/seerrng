#!/usr/bin/env python3
import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-20261105')
OUT = ROOT / 'blind-review'
WORK = OUT / '.work'
HEAD = '77d30ae742aad7245e6e419237fca6a544531e1f'
TREE = '2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
LOCALES = ['ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-Hans','zh-Hant']
CHANGED_ID = 'components.RequestModal.watchAheadActiveForRequest'
ROUTE = '/api/v1/integrations/discovery/trakt/callback'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_jsonl_raw(path):
    rows = {}
    for raw in path.read_bytes().splitlines():
        if not raw.strip():
            continue
        row = json.loads(raw)
        key = row.get('cellId') or (f"{row['sourceId']}::{row['locale']}" if 'sourceId' in row and 'locale' in row else row.get('sourceId') or row.get('sourceIdSha256') or row.get('position'))
        if key in rows:
            raise SystemExit(f'duplicate input row {key} in {path.name}')
        rows[key] = (row, sha(raw))
    return rows


def verify_candidate_checksums():
    sums_path = ROOT / 'SHA256SUMS.txt'
    listed = {}
    for line in sums_path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            raise SystemExit('malformed candidate-free checksum line')
        listed[parts[1].lstrip('*')] = parts[0]
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    if set(listed) != set(manifest['files']):
        raise SystemExit('candidate-free manifest/checksum inventory mismatch')
    for name, expected in listed.items():
        if sha((ROOT / name).read_bytes()) != expected:
            raise SystemExit(f'candidate-free checksum mismatch: {name}')
    return sha(sums_path.read_bytes()), len(listed)


def token_text(item):
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return item.get('raw') or item.get('text') or ''
    return str(item)


def token_check(source, target, tokens):
    checks = {}
    for field in ['placeholders','numericTokens','protectedLiterals','markupTags','inlineCode']:
        ok = True
        for item in tokens.get(field, []):
            tok = token_text(item)
            if field == 'placeholders' and tok and not tok.startswith('{'):
                tok = '{' + tok + '}'
            if not tok:
                continue
            required = source.count(tok)
            if target.count(tok) < required:
                ok = False
        checks[field] = ok
    checks['icuExpressions'] = True
    for expr in tokens.get('icuExpressions', []):
        arg = re.escape(expr['argument'])
        pattern = re.compile(r'\{' + arg + r'\s*,\s*plural\s*,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\s*\}')
        match = pattern.search(target)
        if not match or any(branch.count('#') != 1 for branch in match.groups()):
            checks['icuExpressions'] = False
    return checks


def load_candidates():
    input_hash, checksum_count = verify_candidate_checksums()
    gaps = read_jsonl_raw(ROOT / 'gap-cells.jsonl')
    changes = read_jsonl_raw(ROOT / 'changed-source-cells.jsonl')
    source_rows = {row['sourceId']: (row, rawsha) for row, rawsha in read_jsonl_raw(ROOT / 'gap-source-rows.jsonl').values()}
    contexts = {row['sourceId']: row for row, _ in read_jsonl_raw(ROOT / 'caller-contexts.jsonl').values()}
    source_order = [row for row, _ in read_jsonl_raw(ROOT / 'source-order-hashes.jsonl').values()]
    by_source_sha = {row['sourceIdSha256']: row for row in source_order}
    return input_hash, checksum_count, gaps, changes, source_rows, contexts, by_source_sha


def normalize_rows():
    input_hash, checksum_count, gaps, changes, source_rows, contexts, by_source_sha = load_candidates()
    latin = [json.loads(x) for x in (WORK / 'latin-review.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    other = [json.loads(x) for x in (WORK / 'other-locales-review.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    raw_proposals = latin + other
    proposals_by_key = {}
    for row in raw_proposals:
        key = row.get('cellId') or (f"{row['sourceId']}::{row['locale']}" if 'sourceId' in row and 'locale' in row else row.get('sourceId') or row.get('sourceIdSha256') or row.get('position'))
        if key in proposals_by_key:
            raise SystemExit(f'duplicate draft proposal {key}')
        proposals_by_key[key] = row
    if set(proposals_by_key) != set(gaps) | set(changes):
        missing = sorted((set(gaps) | set(changes)) - set(proposals_by_key))
        extra = sorted(set(proposals_by_key) - (set(gaps) | set(changes)))
        raise SystemExit(f'draft/input scope mismatch: missing={missing[:3]} extra={extra[:3]}')

    ledger = []
    proposals = []
    for key in sorted(set(gaps) | set(changes), key=lambda k: (k.split('::')[0], k.split('::')[1])):
        draft = proposals_by_key[key]
        if key in gaps:
            inp, rawsha = gaps[key]
            src = source_rows[inp['sourceId']][0]
            current = None
            current_sha = None
            source_text = inp['sourceText']
            source_text_sha = inp['sourceTextSha256']
            source_id_sha = inp['sourceIdSha256']
            source_row_sha = inp.get('sourceRowSha256') or src['sourceRowSha256']
            position = inp['sourcePosition']
            decision = 'translation-required'
            record_type = 'missing-target'
            source_tokens = inp['sourceTokens']
            target_catalog_sha = inp['targetCatalogSha256']
            if inp['currentTargetPresent'] or inp['currentTarget'] is not None:
                raise SystemExit(f'candidate-free gap unexpectedly has current target: {key}')
        else:
            inp, rawsha = changes[key]
            source_text = inp['currentEnglishSourceText']
            source_text_sha = inp['currentEnglishSourceSha256']
            source_id_sha = inp['sourceIdSha256']
            source_tokens = inp['sourceTokens']
            current = inp['currentTarget']
            current_sha = inp['currentTargetSha256']
            order = by_source_sha.get(source_id_sha)
            if not order:
                raise SystemExit(f'missing source-order pin for changed source: {key}')
            position = order['position']
            source_row_sha = order['sourceRecordSha256']
            target_catalog_sha = inp['targetCatalogSha256']
            decision = 'translation-refresh-required'
            record_type = 'changed-source-refresh'
            if not inp['currentTargetPresent'] or sha(current.encode('utf-8')) != current_sha:
                raise SystemExit(f'current target pin mismatch: {key}')
        context = contexts.get(draft['sourceId'])
        if not context:
            raise SystemExit(f'missing caller context for {key}')
        if inp['callerContextSha256'] != context['callerContextSha256']:
            raise SystemExit(f'caller context pin mismatch in candidate input: {key}')
        if draft.get('callerContextSha256') != context['callerContextSha256']:
            raise SystemExit(f'caller context pin mismatch in draft: {key}')
        if draft.get('exactHead') != HEAD or draft.get('exactTree') != TREE:
            raise SystemExit(f'exact head/tree mismatch: {key}')
        if draft.get('sourceTextSha256') != source_text_sha:
            raise SystemExit(f'source text hash mismatch: {key}')
        if draft.get('candidateFreeCellSha256') and draft['candidateFreeCellSha256'] != rawsha:
            raise SystemExit(f'draft candidate-row hash mismatch: {key}')
        target = draft['proposedTarget']
        if not isinstance(target, str) or not target.strip():
            raise SystemExit(f'empty proposal: {key}')
        if current is not None and target == current:
            raise SystemExit(f'refresh proposal repeats current stale value: {key}')
        checks = token_check(source_text, target, source_tokens)
        if not all(checks.values()):
            raise SystemExit(f'token check failed for {key}: {checks}')
        if draft['sourceId'] == 'discovery.accounts.traktSetup':
            if ROUTE not in target or '→' not in target:
                raise SystemExit(f'Trakt setup route/settings path missing: {key}')
        if draft['sourceId'] == 'discovery.accounts.traktCallbackFailed':
            if 'HTTPS' not in target or 'URL' not in target:
                raise SystemExit(f'Trakt callback literals missing: {key}')
        record = {
            'schemaVersion': 1,
            'reviewType': 'independent-blind-semantic-translation-review',
            'cellId': key,
            'sourceId': draft['sourceId'],
            'locale': draft['locale'],
            'sourcePosition': position,
            'recordType': record_type,
            'decision': decision,
            'sourceText': source_text,
            'sourceTextSha256': source_text_sha,
            'sourceIdSha256': source_id_sha,
            'sourceRowSha256': source_row_sha,
            'candidateFreeCellSha256': rawsha,
            'callerContextSha256': context['callerContextSha256'],
            'targetCatalogSha256': target_catalog_sha,
            'sourceTokens': source_tokens,
            'currentTarget': current,
            'currentTargetSha256': current_sha,
            'proposedTarget': target,
            'proposedTargetSha256': sha(target.encode('utf-8')),
            'rationale': draft['rationale'],
            'confidence': draft['confidence'],
            'tokenChecks': checks,
            'exactHead': HEAD,
            'exactTree': TREE,
        }
        if draft['locale'] == 'ar':
            record['bidiReview'] = {
                'direction': 'rtl',
                'explicitIsolatesPresent': any(ch in target for ch in '\u2066\u2067\u2068\u2069'),
                'visualBrowserOrderVerified': False,
                'note': 'RTL text and embedded Latin tokens were checked in source order. No directional isolate controls were inserted; rendered placement was not visually checked.'
            }
        ledger.append(record)
        proposals.append({
            'schemaVersion': 1,
            'cellId': key,
            'sourceId': draft['sourceId'],
            'locale': draft['locale'],
            'sourcePosition': position,
            'decision': decision,
            'proposedTarget': target,
            'proposedTargetSha256': record['proposedTargetSha256'],
            'sourceTextSha256': source_text_sha,
            'currentTargetSha256': current_sha,
            'candidateFreeCellSha256': rawsha,
            'callerContextSha256': context['callerContextSha256'],
            'confidence': draft['confidence'],
            'rationale': draft['rationale'],
            'exactHead': HEAD,
            'exactTree': TREE,
        })
    ledger.sort(key=lambda x:(x['sourcePosition'], LOCALES.index(x['locale'])))
    proposals.sort(key=lambda x:(x['sourcePosition'], LOCALES.index(x['locale'])))
    if len(ledger) != 528 or len(proposals) != 528:
        raise SystemExit(f'expected 528 reviewed cells, got {len(ledger)}')
    return ledger, proposals, input_hash, checksum_count


def write_jsonl(path, rows):
    path.write_text(''.join(json.dumps(r, ensure_ascii=False, sort_keys=True, separators=(',',':'))+'\n' for r in rows), encoding='utf-8')


def main():
    ledger, proposals, candidate_sha, candidate_file_count = normalize_rows()
    write_jsonl(OUT / 'ledger.jsonl', ledger)
    write_jsonl(OUT / 'proposals.jsonl', proposals)
    (OUT / 'holds.jsonl').write_text('', encoding='utf-8')
    before_path = OUT / 'head-attestation-before.json'
    before = json.loads(before_path.read_text(encoding='utf-8'))
    before['candidateFreeChecksumListSha256'] = candidate_sha
    before['candidateFreeChecksumFileCount'] = candidate_file_count
    before['reviewScope'] = {'missingTargetCells':516,'changedSourceRefreshCells':12,'totalCells':528,'callerlessCells':0}
    before_path.write_text(json.dumps(before, ensure_ascii=False, sort_keys=True, indent=2)+'\n',encoding='utf-8')
    counts = collections.Counter(r['decision'] for r in ledger)
    confidence = collections.Counter(r['confidence'] for r in ledger)
    summary = {
        'schemaVersion':1,
        'repository':'snapetech-org/seerrng',
        'pullRequest':418,
        'stateAtBeforeAttestation':'open/draft',
        'branch':'codex/seerrng-localization-overhaul-20261028',
        'exactHead':HEAD,
        'exactTree':TREE,
        'baseRef':'main',
        'baseSha':'2647e15762de0c2285cd9d8ebc6d27ffafce6358',
        'candidateFreeChecksumListSha256':candidate_sha,
        'candidateFreeChecksumFileCount':candidate_file_count,
        'independentBlindReview':True,
        'primaryReviewOrOtherProposalOutputsRead':False,
        'locales':LOCALES,
        'sourceIds':43,
        'missingTargetCells':516,
        'changedSourceRefreshCells':12,
        'totalCellsReviewed':528,
        'decisionCounts':dict(counts),
        'confidenceCounts':dict(confidence),
        'callerlessHashOnlyHolds':0,
        'holds':0,
        'proposals':528,
        'tokenChecks':{'allPassed':True,'placeholderCounts':True,'icuPluralStructureAndPoundSigns':True,'numericTokens':True,'protectedLiterals':True,'callbackRoute':True,'settingsArrow':True},
        'bidiReview':{'arabicRowsReviewed':44,'directionalIsolatesAdded':0,'visualBrowserOrderVerified':False,'note':'Arabic RTL wording and exact Latin literals/route were reviewed in text; browser rendering and clipboard directionality were not visually checked.'},
        'nativeSpeakerReviewPerformed':False,
        'confidenceLimitations':'AI semantic review only. No native-speaker or in-product visual review was performed; long help copy and region-specific phrasing remain moderate confidence.',
        'repositoryOrPrEdited':False,
        'testsBuildsScansCiOrWorkflowsRun':False,
        'candidateFreeVerifier':'PASS earlier on isolated candidate-only file copy with --repo local checkout; rerun before final seal.',
        'result':'PASS',
    }
    (OUT / 'summary.json').write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    readme = '''# SeerrNG PR #418 independent blind localization review\n\nThis packet reviews the candidate-free parity scope at PR head `77d30ae742aad7245e6e419237fca6a544531e1f` / tree `2c6fe4a0c1c33aa56b01f06a70702f68598509a7`. The live PR was open and draft at the before-review attestation on branch `codex/seerrng-localization-overhaul-20261028`; base `main` was `2647e15762de0c2285cd9d8ebc6d27ffafce6358`.\n\nThe review covers all 43 missing English IDs across 12 locales (516 new translations) plus all 12 current targets for the changed source `components.RequestModal.watchAheadActiveForRequest` (528 reviewed cells total). Every cell has a proposal. There are no callerless sources and no holds.\n\n`ledger.jsonl` records candidate row hashes, source/current text hashes, caller-context hashes, decisions, target text, rationale, confidence, token checks, and exact head/tree pins. `proposals.jsonl` is the compact target ledger; `holds.jsonl` is empty. The candidate-free inputs were checksum-verified against their own manifest. No primary, cross-review, or other proposal packet was opened.\n\nToken review preserves placeholders, the `{count, plural, one {{...}} other {{...}}}` ICU shape and `#` markers, numeric tokens, product literals, and the exact Trakt callback route. The Arabic rows retain RTL text with embedded Latin terms and route; no Unicode directional isolates were added, so rendered placement was not browser-verified.\n\nConfidence is 210 high and 318 moderate. No native-speaker pass was performed; longer copy and region-specific phrasing should receive that review before catalog application.\n\nRun the portable verifier from any directory:\n\n```sh\npython3 verify_blind_review.py\npython3 verify_blind_review.py --repo /path/to/seerrng\n```\n\nThe first command verifies the candidate-free input checksums and this packet offline. The optional repository argument checks that the exact pinned Git commit/tree and catalog blobs exist locally. Live PR/API and remote ref observations are preserved in the before and after attestations.\n\nThe repository and PR were not edited. No tests, builds, scans, CI, or workflows were run.\n'''
    (OUT / 'README.md').write_text(readme,encoding='utf-8')
    file_list = ['README.md','head-attestation-before.json','head-attestation-after.json','ledger.jsonl','proposals.jsonl','holds.jsonl','summary.json','verify_blind_review.py']
    manifest = {
        'artifact':'SeerrNG PR #418 independent blind semantic localization review',
        'schemaVersion':1,
        'repository':'snapetech-org/seerrng',
        'pullRequest':418,
        'branch':'codex/seerrng-localization-overhaul-20261028',
        'exactHead':HEAD,
        'exactTree':TREE,
        'baseRef':'main',
        'baseSha':summary['baseSha'],
        'candidateFreeChecksumListSha256':candidate_sha,
        'packetType':'independent-blind-review',
        'files':file_list,
        'missingTargetCells':516,
        'changedSourceRefreshCells':12,
        'totalReviewedCells':528,
        'proposalCount':528,
        'holdCount':0,
        'callerlessCellCount':0,
        'checksums':'SHA256SUMS.txt',
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'ledger':len(ledger),'proposals':len(proposals),'holds':0,'decisions':dict(counts),'confidence':dict(confidence),'candidateFreeChecksumListSha256':candidate_sha},ensure_ascii=False))

if __name__ == '__main__':
    main()
