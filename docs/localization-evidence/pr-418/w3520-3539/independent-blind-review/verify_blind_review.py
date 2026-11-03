from __future__ import annotations

import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3520-3539-independent-blind-20261103/review')
INPUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3520-3539-candidate-free-20261103/candidate-free-input')
EXPECTED_HEAD = '265171657d48ef56ee81cc1c6a5c3d07abe5d07e'
EXPECTED_TREE = '402984893883cf7afd106cd208f6027d7410f2fb'
EXPECTED_INPUT_MANIFEST_SHA = '9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63'
EXPECTED_INPUT_SUMS_SHA = '2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d'


def sha(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]


def verify_sum_list(directory: Path, sum_name: str) -> None:
    lines = (directory / sum_name).read_text(encoding='utf-8').splitlines()
    names = set()
    for line in lines:
        digest, name = line.split('  ', 1)
        assert name not in names, f'duplicate checksum entry: {name}'
        names.add(name)
        assert sha((directory / name).read_bytes()) == digest, f'checksum mismatch: {name}'
    expected = {path.name for path in directory.iterdir() if path.is_file() and path.name != sum_name}
    assert names == expected, {'missing': sorted(expected - names), 'extra': sorted(names - expected)}


verify_sum_list(INPUT, 'SHA256SUMS.txt')
verify_sum_list(ROOT, 'SHA256SUMS.txt')
manifest = read_json(INPUT / 'manifest.json')
window = read_json(INPUT / 'window.json')
queue = read_json(INPUT / 'queue-status.json')
input_attestation = read_json(INPUT / 'PR-attestation.json')
file_pins = read_json(INPUT / 'file-pins.json')
summary = read_json(ROOT / 'summary.json')
provenance = read_json(ROOT / 'provenance.json')
live = read_json(ROOT / 'live-attestation.json')

manifest_sha = sha((INPUT / 'manifest.json').read_bytes())
sums_sha = sha((INPUT / 'SHA256SUMS.txt').read_bytes())
assert manifest_sha == EXPECTED_INPUT_MANIFEST_SHA == provenance['candidateFreeInputManifestJSONSha256']
assert sums_sha == EXPECTED_INPUT_SUMS_SHA == provenance['candidateFreeInputSHA256SUMSListSha256']
assert manifest['packetType'] == 'candidate-free-input'
assert manifest['window'] == window['window'] == queue['nextWindow'] == 'W3520-W3539'
assert manifest['head'] == input_attestation['head'] == EXPECTED_HEAD
assert manifest['tree'] == input_attestation['headTree'] == EXPECTED_TREE
assert window['range'] == [3520, 3539]
assert live['head'] == live['remoteBranchHead'] == live['remotePullRefHead'] == EXPECTED_HEAD
assert live['headTree'] == EXPECTED_TREE and live['state'] == 'open' and live['draft'] is True
assert live['localWorktreeStatusClean'] is True
assert summary['head'] == provenance['head'] == EXPECTED_HEAD
assert summary['tree'] == provenance['tree'] == EXPECTED_TREE
assert summary['window'] == provenance['window'] == 'W3520-W3539'
assert provenance['candidateFreePacketChecksumVerified'] is True
assert provenance['candidateFreePacketOnlySemanticEvidence'] is True
assert provenance['otherReviewDecisionsConsulted'] is False
assert provenance['blindLedgerCreatedBeforeAnyComparison'] is True

sources = read_jsonl(INPUT / 'source-cells.jsonl')
source_order = read_jsonl(INPUT / 'source-order.jsonl')
cells = read_jsonl(INPUT / 'current-target-cells.jsonl')
contexts = {row['position']: row for row in read_jsonl(INPUT / 'caller-contexts.jsonl')}
blocks = {row['contextId']: row for row in read_jsonl(INPUT / 'caller-context-blocks.jsonl')}
findings = read_json(INPUT / 'caller-resolution-findings.json')['findings']
ledger = read_jsonl(ROOT / 'blind-ledger.jsonl')
source_by_pos = {row['position']: row for row in sources}
locale_info = {row['catalogKey']: row for row in window['localeInfo']}
locales = window['localeOrder']
input_cells = {(row['position'], row['locale']): row for row in cells}
review_cells = {(row['position'], row['locale']): row for row in ledger}

assert len(sources) == 20 and len(cells) == 240 and len(ledger) == 240
assert len(source_by_pos) == 20 and len(input_cells) == len(review_cells) == 240
assert set(source_by_pos) == set(range(3520, 3540))
assert set(review_cells) == {(position, locale) for position in range(3520, 3540) for locale in locales}
assert len(locales) == 12 and len(set(locales)) == 12
assert not findings
assert source_order[0]['position'] == 3519 and source_order[-1]['position'] == 3540
assert source_order[0]['boundaryKind'] == 'previous' and source_order[-1]['boundaryKind'] == 'next'
assert all(row['window'] == 'W3520-W3539' for row in sources)
assert all(row['window'] == 'W3520-W3539' for row in cells)
assert all(row['window'] == 'W3520-W3539' for row in contexts.values())
assert all(row['callerCount'] > 0 for row in contexts.values())
assert all(block_id.startswith('w3520-') for row in contexts.values() for block_id in row['contextBlockIds'])

placeholder = re.compile(r'\{[A-Za-z][A-Za-z0-9_]*\}')
counts = collections.Counter(row['recommendation'] for row in ledger)
changes = 0
for key, row in review_cells.items():
    original = input_cells[key]
    source = source_by_pos[row['position']]
    context = contexts[row['position']]
    assert row['head'] == EXPECTED_HEAD and row['tree'] == EXPECTED_TREE
    assert row['sourceId'] == original['sourceId'] == source['sourceId']
    assert row['sourceIdSha256'] == original['sourceIdSha256'] == source['sourceIdSha256']
    assert row['sourceKey'] == original['sourceKey'] == source['sourceKey']
    assert row['source'] == original['source'] == source['source']
    assert row['sourceSha256'] == original['sourceSha256'] == source['sourceSha256']
    assert row['currentTarget'] == original['currentTarget']
    assert row['currentTargetSha256'] == original['currentTargetSha256']
    assert row['catalogPath'] == original['catalogPath']
    assert row['catalogSha256'] == original['catalogSha256']
    assert row['catalogGitBlob'] == original['catalogGitBlob']
    assert row['localeTag'] == locale_info[row['locale']]['tag']
    assert row['localeNativeName'] == locale_info[row['locale']]['nativeName']
    assert row['localeDirection'] == locale_info[row['locale']]['direction']
    assert row['callerReferenceCount'] == context['callerCount'] > 0
    assert row['callerResolution'] == context['callerResolution']
    assert row['callerContextBlockIds'] == context['contextBlockIds']
    assert all(block_id in blocks for block_id in row['callerContextBlockIds'])
    assert len(row['callerEvidence']) == context['callerCount']
    assert row['window'] == 'W3520-W3539' and row['inputWindowLabelMismatch'] is False
    assert placeholder.findall(row['source']) == placeholder.findall(row['currentTarget']) == placeholder.findall(row['recommendedTarget'])
    assert row['placeholderCheck']['status'] == 'pass'
    assert row['recommendedTargetSha256'] == sha(row['recommendedTarget'])
    assert row['changeProposed'] == (row['recommendedTarget'] != row['currentTarget'])
    for evidence in row['callerEvidence']:
        ref = next(ref for ref in context['directMessageReferences'] if ref['path'] == evidence['path'] and ref['line'] == evidence['line'])
        pin = file_pins['callerFiles'][evidence['path']]
        assert evidence['lineSha256'] == ref['lineSha256']
        assert evidence['text'] == ref['text']
        assert evidence['callerFileSha256'] == pin['sha256']
        assert evidence['callerFileGitBlob'] == pin['gitBlob']
        block = next(blocks[block_id] for block_id in row['callerContextBlockIds'] if blocks[block_id]['path'] == evidence['path'] and any(line['line'] == evidence['line'] for line in blocks[block_id]['lines']))
        line = next(line for line in block['lines'] if line['line'] == evidence['line'])
        assert line['lineSha256'] == evidence['lineSha256'] and line['text'] == evidence['text']
    if row['recommendation'] == 'accept-current':
        assert row['recommendedTarget'] == row['currentTarget']
    else:
        changes += 1
    assert row['recommendation'] in {'accept-current', 'correction', 'refinement', 'hold'}

assert not any(row['recommendation'] == 'hold' for row in ledger)
assert dict(sorted(counts.items())) == summary['dispositionCounts']
assert changes == summary['proposedCatalogChanges']
assert summary['cellCount'] == 240 and summary['sourceCount'] == 20 and summary['localeCount'] == 12
assert summary['callerReferenceCount'] == sum(row['callerCount'] for row in contexts.values())
assert summary['callerResolutionHolds'] == 0 and summary['placeholderMismatches'] == 0
assert summary['inputWindowLabelAudit']['consistent'] is True
assert summary['inputWindowLabelAudit']['inconsistentFields'] == []
assert summary['candidateFreeInputManifestJSONSha256'] == manifest_sha
assert summary['candidateFreeInputSHA256SUMSListSha256'] == sums_sha

print(json.dumps({
    'status': 'verified',
    'head': EXPECTED_HEAD,
    'tree': EXPECTED_TREE,
    'cells': len(ledger),
    'sources': len(source_by_pos),
    'locales': len(locales),
    'callerReferences': summary['callerReferenceCount'],
    'dispositions': dict(sorted(counts.items())),
    'proposedChanges': changes,
    'candidateFreeManifestJSONSha256': manifest_sha,
    'candidateFreeSHA256SUMSListSha256': sums_sha,
    'windowLabelsConsistent': True,
    'checksums': 'pass',
}, ensure_ascii=False, indent=2))
