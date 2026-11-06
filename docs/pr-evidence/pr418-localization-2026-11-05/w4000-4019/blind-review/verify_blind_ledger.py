#!/usr/bin/env python3
"""Portable verifier for the sealed W4000-W4019 blind ledger (stdlib only)."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

EXPECTED_HEAD = 'ac193096ebfc0007183348b24e35bf6fee33f67a'
EXPECTED_TREE = '93e71e7c52602ec3f8b76548fd12b2f5b4368b4c'
LOCALES = ['es', 'zh-Hans', 'hi', 'de', 'ja', 'fr', 'pt-BR', 'ar', 'ko', 'zh-Hant', 'vi', 'id']

def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def digest_text(text: str) -> str:
    return digest_bytes(text.encode('utf-8'))

def read_jsonl(path: pathlib.Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]

def verify_sums(directory: pathlib.Path, filename: str, exclude: set[str] = frozenset()):
    sums_path = directory / filename
    if not sums_path.is_file():
        raise ValueError(f'missing checksum file: {sums_path}')
    seen = set()
    for line in sums_path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        fields = line.split(maxsplit=1)
        if len(fields) != 2:
            raise ValueError(f'malformed checksum row: {line!r}')
        expected, name = fields[0], fields[1].lstrip('* ')
        if name in seen:
            raise ValueError(f'duplicate checksum entry: {name}')
        seen.add(name)
        if name in exclude:
            continue
        path = directory / name
        if not path.is_file():
            raise ValueError(f'checksum target missing: {name}')
        actual = digest_bytes(path.read_bytes())
        if actual != expected:
            raise ValueError(f'checksum mismatch: {name}')
    return seen

def tokens(text: str):
    return {
        'markupTags': re.findall(r'</?[A-Za-z][A-Za-z0-9]*>', text),
        'numericTokens': re.findall(r'\d+(?:[.,]\d+)*', text),
        'placeholders': re.findall(r'\{[^{}]+\}', text),
    }

def equal_multiset(a, b):
    return collections.Counter(a) == collections.Counter(b)

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--packet', type=pathlib.Path, required=True, help='candidate-free input packet directory')
    ap.add_argument('--artifact', type=pathlib.Path, required=True, help='sealed blind-review artifact directory')
    args = ap.parse_args()
    packet, artifact = args.packet.resolve(), args.artifact.resolve()
    try:
        verify_sums(packet, 'SHA256SUMS.txt')
        verify_sums(artifact, 'SHA256SUMS.txt')
        manifest = json.loads((packet / 'manifest.json').read_text(encoding='utf-8'))
        summary = json.loads((artifact / 'blind-summary.json').read_text(encoding='utf-8'))
        seal = json.loads((artifact / 'blind-seal.json').read_text(encoding='utf-8'))
        if manifest.get('head') != EXPECTED_HEAD or manifest.get('tree') != EXPECTED_TREE:
            raise ValueError('candidate-free packet does not match the pinned PR head/tree')
        if manifest.get('packetType') != 'candidate-free-input' or not manifest.get('candidateFreeInputOnly'):
            raise ValueError('input is not marked candidate-free')
        if manifest.get('proposalCount') != 0 or manifest.get('dispositionFieldsIncluded') is not False:
            raise ValueError('candidate-free input includes proposal/disposition material')
        if manifest.get('localeOrder') != LOCALES:
            raise ValueError('candidate-free locale order mismatch')
        sources = {r['position']: r for r in read_jsonl(packet / 'selected-source-cells.jsonl')}
        current = {(r['position'], r['locale']): r for r in read_jsonl(packet / 'current-target-cells.jsonl')}
        contexts = {r['position']: r for r in read_jsonl(packet / 'caller-contexts.jsonl')}
        rows = read_jsonl(artifact / 'blind-decision-ledger.jsonl')
        expected_keys = {(pos, loc) for pos in range(4000, 4020) for loc in LOCALES}
        row_keys = [(r.get('position'), r.get('locale')) for r in rows]
        if len(sources) != 20 or len(contexts) != 20 or len(current) != 240:
            raise ValueError('candidate-free packet has unexpected source/context/target counts')
        if len(rows) != 240 or len(set(row_keys)) != 240 or set(row_keys) != expected_keys:
            raise ValueError('ledger is not the exact unique 240-cell grid')
        counts = collections.Counter()
        for row in rows:
            key = (row['position'], row['locale'])
            pos, locale = key
            src, cur, ctx = sources[pos], current[key], contexts[pos]
            if locale not in LOCALES:
                raise ValueError(f'unexpected locale {locale}')
            if row.get('sourceId') != src['sourceId'] or row.get('sourceIdSha256') != src['sourceIdSha256']:
                raise ValueError(f'source ID binding mismatch at {key}')
            if row.get('sourceText') != src['sourceText'] or row.get('sourceTextSha256') != src['sourceTextSha256'] or digest_text(src['sourceText']) != src['sourceTextSha256']:
                raise ValueError(f'source text/hash binding mismatch at {key}')
            if row.get('callerContextSha256') != ctx['callerContextSha256'] or row.get('callerResolution') != ctx['callerResolution'] or row.get('definitionFiles') != ctx['definitionFiles']:
                raise ValueError(f'caller-context binding mismatch at {key}')
            if row.get('currentTarget') != cur['currentTarget'] or row.get('currentTargetSha256') != cur['currentTargetSha256'] or digest_text(cur['currentTarget']) != cur['currentTargetSha256']:
                raise ValueError(f'current-target binding mismatch at {key}')
            target = row.get('reviewTarget')
            if not isinstance(target, str) or not target:
                raise ValueError(f'missing reviewed target at {key}')
            if digest_text(target) != row.get('reviewTargetSha256'):
                raise ValueError(f'review-target hash mismatch at {key}')
            disposition = row.get('disposition')
            if disposition not in {'accept', 'correction', 'refinement', 'hold'}:
                raise ValueError(f'invalid disposition at {key}')
            counts[disposition] += 1
            if row.get('confidence') not in {'high', 'moderate', 'low', 'unknown'}:
                raise ValueError(f'invalid confidence at {key}')
            if not row.get('rationale') or not row.get('callerContextSummary'):
                raise ValueError(f'missing rationale/context at {key}')
            if disposition in {'accept', 'hold'} and target != cur['currentTarget']:
                raise ValueError(f'{disposition} does not preserve current target at {key}')
            if disposition in {'correction', 'refinement'} and target == cur['currentTarget']:
                raise ValueError(f'{disposition} does not provide a changed target at {key}')
            source_tokens = src['sourceTokens']
            expected_target_tokens = tokens(target)
            expected_target_tokens['protectedLiterals'] = [lit for lit in source_tokens['protectedLiterals'] if lit in target]
            if row.get('sourceTokens') != source_tokens or row.get('reviewTargetTokens') != expected_target_tokens:
                raise ValueError(f'token record mismatch at {key}')
            issues = []
            if not equal_multiset(expected_target_tokens['markupTags'], source_tokens['markupTags']): issues.append('markupTags')
            if not equal_multiset(expected_target_tokens['placeholders'], source_tokens['placeholders']): issues.append('placeholders')
            if not equal_multiset(expected_target_tokens['numericTokens'], source_tokens['numericTokens']): issues.append('numericTokens')
            if not equal_multiset(expected_target_tokens['protectedLiterals'], source_tokens['protectedLiterals']): issues.append('protectedLiterals')
            if row.get('tokenIssues') != issues:
                raise ValueError(f'token issue list mismatch at {key}')
            if any(kind != 'numericTokens' for kind in issues):
                raise ValueError(f'markup/placeholder/protected literal mismatch at {key}: {issues}')
            exception = row.get('numericSemanticEquivalence')
            if key == (4007, 'ja'):
                if disposition != 'accept' or '1つ以上' not in target or not isinstance(exception, dict):
                    raise ValueError('Japanese 1つ以上 semantic adjudication missing')
                if exception.get('type') != 'semantic-equivalence' or exception.get('sourceMeaning') != 'at least one notification type' or exception.get('targetForm') != '1つ以上':
                    raise ValueError('Japanese numeric semantic adjudication does not match')
            elif 'numericTokens' in issues or exception is not None:
                raise ValueError(f'unapproved numeric mismatch/exception at {key}')
            if pos == 4013 and disposition != 'hold':
                raise ValueError(f'Enable Agent must remain held at {key}')
            if pos != 4013 and disposition == 'hold':
                raise ValueError(f'unexpected hold at {key}')
        if dict(sorted(counts.items())) != summary.get('dispositionCounts'):
            raise ValueError('summary disposition counts do not match ledger')
        if summary.get('cellCount') != 240 or summary.get('sourceCount') != 20:
            raise ValueError('summary counts do not match ledger')
        if summary.get('head') != EXPECTED_HEAD or summary.get('tree') != EXPECTED_TREE:
            raise ValueError('summary PR pin mismatch')
        if summary.get('proposalFilesOpenedBeforeBlindCompletion') is not False or seal.get('proposalFilesOpenedBeforeBlindCompletion') is not False or seal.get('proposalFilesOpenedBeforeSeal') is not False:
            raise ValueError('blind seal does not attest proposal files remained unopened')
        if seal.get('ledgerCellCount') != 240 or seal.get('ledgerSha256') != digest_text((artifact / 'blind-decision-ledger.jsonl').read_text(encoding='utf-8')):
            raise ValueError('seal ledger binding mismatch')
        if seal.get('candidateFreePacketSha256SumsFileSha256') != digest_text((packet / 'SHA256SUMS.txt').read_text(encoding='utf-8')):
            raise ValueError('seal candidate-free packet binding mismatch')
        print('PASS: candidate-free packet hashes, pinned head/tree, exact 240-cell binding, target hashes, caller/source bindings, token rules, numeric semantic exception, hold positions, seal, and artifact checksums.')
        print('Counts:', ', '.join(f'{k}={counts[k]}' for k in ('accept', 'correction', 'refinement', 'hold')))
        return 0
    except Exception as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
