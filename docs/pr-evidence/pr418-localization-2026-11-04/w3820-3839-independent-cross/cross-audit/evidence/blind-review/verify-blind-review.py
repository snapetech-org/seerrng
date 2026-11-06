#!/usr/bin/env python3
"""Portable verifier for the W3820-W3839 candidate-free blind review.

Run with: python3 verify-blind-review.py
Uses only this directory and its copied candidate-free input/ subdirectory.
"""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / 'input'
EXPECTED_HEAD = '6c489a64782d31fee70a6aeef386c88527b33083'
EXPECTED_TREE = '9bbf55986a34e9a2bc0c4027205927df65f8754b'
EXPECTED_BASE = 'fa40534ccced75bde1125c14760514fcd5d7de4d'
EXPECTED_RANGE = list(range(3820, 3840))
EXPECTED_LOCALES = ['es', 'zh-Hans', 'hi', 'de', 'ja', 'fr', 'pt-BR', 'ar', 'ko', 'zh-Hant', 'vi', 'id']
EXPECTED_HOLDS = {
    (3824, 'hi'): ['protected_literal_missing'],
    (3828, 'ar'): ['terminology_spelling'],
    (3833, 'ar'): ['product_name_inconsistent'],
    (3829, 'ja'): ['product_name_localized'],
    (3829, 'ko'): ['untranslated_label_fragment'],
    (3836, 'hi'): ['protected_literal_missing'],
    (3830, 'vi'): ['terminology_inconsistency'],
    (3838, 'vi'): ['terminology_inconsistency'],
}
EXPECTED_OBSERVATIONS = {
    (3822, 'es'), (3825, 'zh-Hans'), (3827, 'zh-Hans'),
    (3835, 'zh-Hans'), (3835, 'zh-Hant'), (3833, 'pt-BR'),
    (3833, 'vi'), (3833, 'id'), (3830, 'id'),
}


def fail(message: str) -> None:
    raise SystemExit('FAIL: ' + message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def load_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]


def check_sha_manifest(directory: Path, manifest_path: Path, expected_names=None) -> None:
    listed = {}
    for number, line in enumerate(manifest_path.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or len(parts[0]) != 64:
            fail(f'malformed checksum line {manifest_path}:{number}')
        digest, name = parts
        name = name.lstrip('*')
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts or name in listed:
            fail(f'unsafe or duplicate checksum path {name!r} in {manifest_path}')
        path = directory / rel
        if not path.is_file():
            fail(f'missing checksum input {path}')
        if sha256(path.read_bytes()) != digest:
            fail(f'checksum mismatch for {path}')
        listed[name] = digest
    if expected_names is not None and set(listed) != set(expected_names):
        fail(f'checksum entry set mismatch in {manifest_path}')
    actual = {
        p.relative_to(directory).as_posix()
        for p in directory.rglob('*')
        if p.is_file() and p != manifest_path
    }
    if set(listed) != actual:
        fail(f'checksum manifest does not cover the exact file set in {directory}')


def main() -> None:
    packet_manifest_path = INPUT / 'SHA256SUMS.txt'
    if not packet_manifest_path.is_file():
        fail('copied candidate-free input is missing')
    packet_manifest = load_json(INPUT / 'manifest.json')
    packet_names = set(packet_manifest['fileNames']) | {'manifest.json'}
    check_sha_manifest(INPUT, packet_manifest_path, packet_names)

    window = load_json(INPUT / 'window.json')
    if window['head'] != EXPECTED_HEAD or window['tree'] != EXPECTED_TREE:
        fail('window pin differs from this blind review')
    if window['baseSha'] != EXPECTED_BASE or window['range'] != [3820, 3839]:
        fail('base or range pin differs from this blind review')
    if window['localeOrder'] != EXPECTED_LOCALES:
        fail('locale order differs from this blind review')
    if packet_manifest['head'] != EXPECTED_HEAD or packet_manifest['tree'] != EXPECTED_TREE:
        fail('manifest pin differs from this blind review')
    if packet_manifest['cellCount'] != 240 or packet_manifest['selectedSourceCount'] != 20 or packet_manifest['localeCount'] != 12:
        fail('candidate-free manifest count mismatch')
    if packet_manifest.get('candidateFreeInputOnly') is not True or packet_manifest.get('dispositionFieldsIncluded') is not False:
        fail('input is not the expected candidate-free packet')

    for name in ('PR-attestation.json', 'PR-attestation-after.json'):
        att = load_json(INPUT / name)
        pr = att['pullRequest']
        if att['branchRef'] != EXPECTED_HEAD or att['pullRef'] != EXPECTED_HEAD or att['tree'] != EXPECTED_TREE:
            fail(f'{name} does not attest the pinned head/tree')
        if pr['number'] != 418 or pr['state'] != 'OPEN' or not pr['isDraft']:
            fail(f'{name} does not attest the expected open draft PR')
        if pr['headRefOid'] != EXPECTED_HEAD or pr['baseRefOid'] != EXPECTED_BASE:
            fail(f'{name} PR head/base mismatch')
    for name in ('remote-refs-before.tsv', 'remote-refs-after.tsv'):
        refs = dict(line.split('\t', 1)[::-1] for line in (INPUT / name).read_text(encoding='utf-8').splitlines() if '\t' in line)
        if refs.get('refs/heads/codex/seerrng-localization-overhaul-20261028') != EXPECTED_HEAD or refs.get('refs/pull/418/head') != EXPECTED_HEAD:
            fail(f'{name} ref snapshot does not match the pinned head')

    sources = load_jsonl(INPUT / 'selected-source-cells.jsonl')
    targets = load_jsonl(INPUT / 'current-target-cells.jsonl')
    contexts = {x['position']: x for x in load_jsonl(INPUT / 'caller-contexts.jsonl')}
    if [x['position'] for x in sources] != EXPECTED_RANGE:
        fail('source positions are incomplete, duplicated, or out of order')
    if len(targets) != 240 or len(contexts) != 20:
        fail('input source/cell/context count mismatch')
    source_by_pos = {x['position']: x for x in sources}
    target_by_key = {(x['position'], x['locale']): x for x in targets}
    if len(target_by_key) != 240:
        fail('input target cell keys are not unique')
    expected_keys = {(pos, locale) for pos in EXPECTED_RANGE for locale in EXPECTED_LOCALES}
    if set(target_by_key) != expected_keys:
        fail('input does not contain the full 20 by 12 locale matrix')

    catalog_pins = load_json(INPUT / 'catalog-file-pins.json')['catalogFiles']
    for cell in targets:
        pos = cell['position']
        src = source_by_pos[pos]
        if cell['sourceId'] != src['sourceId'] or cell['sourceIdSha256'] != src['sourceIdSha256']:
            fail(f'source ID binding mismatch at {pos}/{cell["locale"]}')
        if cell['sourceTextSha256'] != src['sourceTextSha256'] or sha256(src['sourceText'].encode()) != src['sourceTextSha256']:
            fail(f'source text hash mismatch at {pos}/{cell["locale"]}')
        if sha256(cell['currentTarget'].encode()) != cell['currentTargetSha256']:
            fail(f'target text hash mismatch at {pos}/{cell["locale"]}')
        ctx = contexts[pos]
        if cell['callerContextSha256'] != ctx['callerContextSha256']:
            fail(f'caller context hash mismatch at {pos}/{cell["locale"]}')
        pin = catalog_pins[cell['locale']]
        if (cell['catalogPath'], cell['catalogGitBlob'], cell['catalogSha256']) != (pin['path'], pin['gitBlob'], pin['sha256']):
            fail(f'catalog pin mismatch at {pos}/{cell["locale"]}')

    ledger = load_jsonl(ROOT / 'blind-ledger.jsonl')
    ledger_by_key = {(x['position'], x['locale']): x for x in ledger}
    if len(ledger) != 240 or len(ledger_by_key) != 240 or set(ledger_by_key) != expected_keys:
        fail('ledger does not cover each target cell exactly once')
    for key, cell in target_by_key.items():
        row = ledger_by_key[key]
        src = source_by_pos[key[0]]
        expected_fields = {
            'head': EXPECTED_HEAD,
            'tree': EXPECTED_TREE,
            'sourceId': src['sourceId'],
            'sourceIdSha256': src['sourceIdSha256'],
            'sourceText': src['sourceText'],
            'sourceTextSha256': src['sourceTextSha256'],
            'currentTarget': cell['currentTarget'],
            'currentTargetSha256': cell['currentTargetSha256'],
            'callerContextSha256': cell['callerContextSha256'],
            'catalogPath': cell['catalogPath'],
            'catalogGitBlob': cell['catalogGitBlob'],
            'catalogSha256': cell['catalogSha256'],
            'tokenChecks': cell['tokenChecks'],
        }
        for field, value in expected_fields.items():
            if row.get(field) != value:
                fail(f'ledger {field} binding mismatch at {key}')
        if not row.get('reviewNote') or row.get('confidence') not in {'high', 'moderate', 'low', 'unknown'}:
            fail(f'ledger rationale or confidence missing at {key}')
        if row['decision'] not in {'accept', 'hold'}:
            fail(f'invalid decision at {key}')

    actual_holds = {key: row['issueCodes'] for key, row in ledger_by_key.items() if row['decision'] == 'hold'}
    if actual_holds != EXPECTED_HOLDS:
        fail(f'hold set differs from independently recorded review: {actual_holds}')
    if any(row['issueCodes'] for key, row in ledger_by_key.items() if key not in EXPECTED_HOLDS):
        fail('accepted row carries an issue code')
    actual_observations = {key for key, row in ledger_by_key.items() if row.get('nonblockingObservation')}
    if actual_observations != EXPECTED_OBSERVATIONS:
        fail('nonblocking observation set mismatch')

    token_mismatches = {'placeholders': [], 'markupTags': [], 'numericTokens': [], 'protectedLiterals': []}
    for key, cell in target_by_key.items():
        for kind, check in cell['tokenChecks'].items():
            if not check['matches']:
                token_mismatches[kind].append(key)
    if token_mismatches['placeholders'] or token_mismatches['markupTags'] or token_mismatches['numericTokens']:
        fail(f'unexpected placeholder/markup/numeric mismatch: {token_mismatches}')
    if set(token_mismatches['protectedLiterals']) != {(3824, 'hi'), (3836, 'hi')}:
        fail(f'protected-literal mismatch set changed: {token_mismatches["protectedLiterals"]}')
    if not set(token_mismatches['protectedLiterals']).issubset(actual_holds):
        fail('protected-literal mismatch was not held')

    baseline = load_json(INPUT / 'baseline-token-diagnostics.json')
    if baseline['cellCount'] != 240 or baseline['mismatchCounts'] != {
        'placeholders': 0, 'markupTags': 0, 'numericTokens': 0, 'protectedLiterals': 2
    }:
        fail('baseline token diagnostics mismatch')
    if load_json(INPUT / 'caller-resolution-findings.json')['callerlessSelectedSourceCount'] != 0:
        fail('one or more selected sources lack a caller')
    continuity = load_json(INPUT / 'manifest.json')
    if continuity['priorSelectedIdOrSourceTextHashMismatchCount'] != 0 or continuity['priorHoldHashMatches'] != 12:
        fail('prior hash-only continuity checks mismatch')

    summary = (ROOT / 'summary.md').read_text(encoding='utf-8')
    if '**232**' not in summary or '**8**' not in summary or '**9**' not in summary:
        fail('summary counts do not match ledger')
    output_manifest = ROOT / 'SHA256SUMS.txt'
    check_sha_manifest(ROOT, output_manifest)

    print(json.dumps({
        'result': 'PASS',
        'head': EXPECTED_HEAD,
        'tree': EXPECTED_TREE,
        'cells': len(ledger),
        'accepted': sum(row['decision'] == 'accept' for row in ledger),
        'held': len(actual_holds),
        'nonblockingObservations': len(actual_observations),
        'tokenMismatches': {name: len(values) for name, values in token_mismatches.items()},
        'inputAndOutputChecksums': 'PASS',
    }, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, KeyError, ValueError, json.JSONDecodeError) as exc:
        fail(f'{type(exc).__name__}: {exc}')
