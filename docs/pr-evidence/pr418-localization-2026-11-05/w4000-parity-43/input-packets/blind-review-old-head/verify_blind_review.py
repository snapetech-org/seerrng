#!/usr/bin/env python3
"""Portable verifier for the SeerrNG PR #418 blind review packet."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

HEAD = '77d30ae742aad7245e6e419237fca6a544531e1f'
TREE = '2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
ROUTE = '/api/v1/integrations/discovery/trakt/callback'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def die(message):
    raise SystemExit('FAIL: ' + message)


def parse_sums(path):
    out = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            die(f'malformed checksum line in {path.name}')
        name = parts[1].lstrip('*')
        if name in out:
            die(f'duplicate checksum name: {name}')
        out[name] = parts[0]
    return out


def jsonl_rows(path, key_fn):
    rows = {}
    for raw in path.read_bytes().splitlines():
        if not raw.strip():
            continue
        row = json.loads(raw)
        key = key_fn(row)
        if key in rows:
            die(f'duplicate row key {key} in {path.name}')
        rows[key] = (row, sha(raw))
    return rows


def token_text(item):
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return item.get('raw') or item.get('text') or ''
    return str(item)


def token_checks(source, target, tokens):
    checks = {}
    for field in ('placeholders','numericTokens','protectedLiterals','markupTags','inlineCode'):
        ok = True
        for item in tokens.get(field, []):
            token = token_text(item)
            if field == 'placeholders' and token and not token.startswith('{'):
                token = '{' + token + '}'
            if token and target.count(token) < source.count(token):
                ok = False
        checks[field] = ok
    ok = True
    for expr in tokens.get('icuExpressions', []):
        arg = re.escape(expr['argument'])
        pattern = re.compile(r'\{' + arg + r'\s*,\s*plural\s*,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\s*\}')
        match = pattern.search(target)
        if not match or any(branch.count('#') != 1 for branch in match.groups()):
            ok = False
    checks['icuExpressions'] = ok
    return checks


def git(repo, *args):
    return subprocess.check_output(['git','-C',str(repo),*args],text=True,stderr=subprocess.STDOUT).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', type=Path, help='optional local repository for exact Git object checks')
    ap.add_argument('--candidate-free', type=Path, help='candidate-free packet directory; defaults to parent directory')
    args = ap.parse_args()
    packet = Path(__file__).resolve().parent
    candidate = (args.candidate_free or packet.parent).resolve()

    manifest = json.loads((packet/'manifest.json').read_text(encoding='utf-8'))
    summary = json.loads((packet/'summary.json').read_text(encoding='utf-8'))
    if manifest.get('exactHead') != HEAD or manifest.get('exactTree') != TREE:
        die('manifest exact head/tree mismatch')
    if summary.get('exactHead') != HEAD or summary.get('exactTree') != TREE:
        die('summary exact head/tree mismatch')
    if manifest.get('pullRequest') != 418 or manifest.get('packetType') != 'independent-blind-review':
        die('manifest identity mismatch')

    input_sums = parse_sums(candidate/'SHA256SUMS.txt')
    input_manifest = json.loads((candidate/'manifest.json').read_text(encoding='utf-8'))
    if set(input_sums) != set(input_manifest['files']):
        die('candidate-free manifest/checksum inventory mismatch')
    for name, expected in input_sums.items():
        path = candidate/name
        if not path.is_file() or sha(path.read_bytes()) != expected:
            die(f'candidate-free checksum mismatch: {name}')
    candidate_sum_hash = sha((candidate/'SHA256SUMS.txt').read_bytes())
    if candidate_sum_hash != manifest.get('candidateFreeChecksumListSha256'):
        die('candidate-free checksum-list pin mismatch')

    gap = jsonl_rows(candidate/'gap-cells.jsonl', lambda r:r['cellId'])
    changed = jsonl_rows(candidate/'changed-source-cells.jsonl', lambda r:r['cellId'])
    source_rows = jsonl_rows(candidate/'gap-source-rows.jsonl', lambda r:r['sourceId'])
    contexts = jsonl_rows(candidate/'caller-contexts.jsonl', lambda r:r['sourceId'])
    source_order = jsonl_rows(candidate/'source-order-hashes.jsonl', lambda r:r['position'])
    source_order_by_sha = {r['sourceIdSha256']:r for r,_ in source_order.values()}

    expected_keys = set(gap) | set(changed)
    if len(gap) != 516 or len(changed) != 12 or len(expected_keys) != 528:
        die(f'candidate-free cell counts mismatch: gaps={len(gap)} refresh={len(changed)}')
    ledger = jsonl_rows(packet/'ledger.jsonl', lambda r:r['cellId'])
    proposals = jsonl_rows(packet/'proposals.jsonl', lambda r:r['cellId'])
    if set(ledger) != expected_keys or set(proposals) != expected_keys:
        die('ledger/proposal scope does not match all candidate-free cells')
    if (packet/'holds.jsonl').read_bytes():
        die('holds.jsonl must be empty for this caller-complete scope')

    decision_counts = {}
    confidence_counts = {}
    locale_counts = {}
    for key in sorted(expected_keys):
        record, _ = ledger[key]
        proposal, _ = proposals[key]
        inp, raw_hash = (changed[key] if key in changed else gap[key])
        is_refresh = key in changed
        source_id = inp['sourceId']
        locale = inp['locale']
        if record.get('candidateFreeCellSha256') != raw_hash:
            die(f'candidate-free cell hash mismatch: {key}')
        if record.get('exactHead') != HEAD or record.get('exactTree') != TREE:
            die(f'exact head/tree mismatch: {key}')
        if record.get('cellId') != key or record.get('sourceId') != source_id or record.get('locale') != locale:
            die(f'cell identity mismatch: {key}')
        context = contexts[source_id][0]
        if record.get('callerContextSha256') != inp['callerContextSha256'] or record.get('callerContextSha256') != context['callerContextSha256']:
            die(f'caller-context binding mismatch: {key}')
        if record.get('sourceTokens') != inp['sourceTokens']:
            die(f'source token inventory mismatch: {key}')
        source_text = inp['currentEnglishSourceText'] if is_refresh else inp['sourceText']
        source_text_hash = inp['currentEnglishSourceSha256'] if is_refresh else inp['sourceTextSha256']
        source_id_hash = inp['sourceIdSha256']
        if record.get('sourceText') != source_text or record.get('sourceTextSha256') != source_text_hash:
            die(f'source text binding mismatch: {key}')
        if record.get('sourceIdSha256') != source_id_hash:
            die(f'source ID hash mismatch: {key}')
        if is_refresh:
            position_row = source_order_by_sha.get(source_id_hash)
            if not position_row:
                die(f'changed source missing source-order row: {key}')
            source_row_hash = position_row['sourceRecordSha256']
            position = position_row['position']
            if record.get('decision') != 'translation-refresh-required' or record.get('recordType') != 'changed-source-refresh':
                die(f'refresh decision mismatch: {key}')
            if record.get('currentTarget') != inp['currentTarget'] or record.get('currentTargetSha256') != inp['currentTargetSha256']:
                die(f'current target binding mismatch: {key}')
            if sha(inp['currentTarget'].encode('utf-8')) != inp['currentTargetSha256']:
                die(f'candidate current target hash mismatch: {key}')
        else:
            source_row_hash = source_rows[source_id][0]['sourceRowSha256']
            position = inp['sourcePosition']
            if record.get('decision') != 'translation-required' or record.get('recordType') != 'missing-target':
                die(f'missing-target decision mismatch: {key}')
            if record.get('currentTarget') is not None or record.get('currentTargetSha256') is not None:
                die(f'missing-target cell unexpectedly has current target: {key}')
        if record.get('sourceRowSha256') != source_row_hash or record.get('sourcePosition') != position:
            die(f'source row/position binding mismatch: {key}')
        if record.get('targetCatalogSha256') != inp.get('targetCatalogSha256'):
            die(f'target catalog pin mismatch: {key}')
        target = record.get('proposedTarget')
        if not isinstance(target, str) or not target.strip():
            die(f'empty proposed target: {key}')
        if is_refresh and target == inp['currentTarget']:
            die(f'refresh recommendation did not change stale target: {key}')
        if record.get('proposedTargetSha256') != sha(target.encode('utf-8')):
            die(f'proposed target hash mismatch: {key}')
        checks = token_checks(source_text, target, inp['sourceTokens'])
        if not all(checks.values()) or record.get('tokenChecks') != checks:
            die(f'token check failed or recorded incorrectly: {key} {checks}')
        if source_id == 'discovery.accounts.traktSetup' and (ROUTE not in target or '→' not in target):
            die(f'Trakt callback route or Settings arrow missing: {key}')
        if source_id == 'discovery.accounts.traktCallbackFailed' and ('HTTPS' not in target or 'URL' not in target):
            die(f'Trakt callback literals missing: {key}')
        if locale == 'ar':
            bidi = record.get('bidiReview', {})
            if bidi.get('direction') != 'rtl' or bidi.get('visualBrowserOrderVerified') is not False:
                die(f'Arabic bidi review record missing/incorrect: {key}')
            isolates = any(ch in target for ch in '\u2066\u2067\u2068\u2069')
            if bidi.get('explicitIsolatesPresent') != isolates:
                die(f'Arabic isolate inventory mismatch: {key}')
        if proposal.get('proposedTarget') != target or proposal.get('proposedTargetSha256') != record['proposedTargetSha256']:
            die(f'proposal/ledger target mismatch: {key}')
        if proposal.get('candidateFreeCellSha256') != raw_hash or proposal.get('callerContextSha256') != record['callerContextSha256']:
            die(f'proposal source binding mismatch: {key}')
        if proposal.get('exactHead') != HEAD or proposal.get('exactTree') != TREE:
            die(f'proposal exact pin mismatch: {key}')
        decision_counts[record['decision']] = decision_counts.get(record['decision'],0)+1
        confidence_counts[record['confidence']] = confidence_counts.get(record['confidence'],0)+1
        locale_counts[locale] = locale_counts.get(locale,0)+1

    if decision_counts != {'translation-required':516,'translation-refresh-required':12}:
        die(f'decision count mismatch: {decision_counts}')
    if len(locale_counts) != 12 or any(n != 44 for n in locale_counts.values()):
        die(f'locale cell count mismatch: {locale_counts}')
    if summary.get('decisionCounts') != decision_counts or summary.get('confidenceCounts') != confidence_counts:
        die('summary decision/confidence counts mismatch')
    if summary.get('totalCellsReviewed') != 528 or summary.get('holds') != 0 or summary.get('callerlessHashOnlyHolds') != 0:
        die('summary total/holds mismatch')

    output_sums = parse_sums(packet/'SHA256SUMS.txt')
    expected_files = set(manifest['files']) | {'manifest.json'}
    if set(output_sums) != expected_files:
        die('output checksum inventory does not match manifest')
    for name, expected in output_sums.items():
        path = packet/name
        if not path.is_file() or sha(path.read_bytes()) != expected:
            die(f'output checksum mismatch: {name}')
    for name in manifest['files']:
        if not (packet/name).is_file():
            die(f'manifest file missing: {name}')
    for att_name in ('head-attestation-before.json','head-attestation-after.json'):
        att = json.loads((packet/att_name).read_text(encoding='utf-8'))
        if att.get('head') != HEAD or att.get('tree') != TREE:
            die(f'{att_name} exact pin mismatch')
        if att.get('candidateFreeChecksumListSha256') != candidate_sum_hash:
            die(f'{att_name} candidate-free checksum pin mismatch')

    repo_result = 'not-requested'
    if args.repo:
        repo = args.repo.resolve()
        commit_type = git(repo,'cat-file','-t',HEAD)
        commit_tree = git(repo,'rev-parse',HEAD+'^{tree}')
        if commit_type != 'commit' or commit_tree != TREE:
            die(f'local exact commit/tree pin mismatch: {commit_type} {commit_tree}')
        audit = json.loads((candidate/'catalog-audit.json').read_text(encoding='utf-8'))
        for locale, pin in audit['catalogPins'].items():
            if git(repo,'cat-file','-t',pin['gitBlob']) != 'blob':
                die(f'local catalog blob missing for {locale}: {pin["gitBlob"]}')
        repo_result = 'PASS exact commit/tree and 13 catalog blob objects'
    print('PASS: 528 cells, all candidate-free and output checksums, source/caller/current-target bindings, token and route checks, 12 locale counts, exact PR pins' + (f'; {repo_result}' if args.repo else ''))

if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        die(exc.output.strip() or 'git object check failed')
