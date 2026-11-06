#!/usr/bin/env python3
"""Read-only independent verifier for SeerrNG PR #418 W3320-W3339."""
from __future__ import annotations
import base64, csv, hashlib, json, re, subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE = Path('/mnt/disks/scratch/task-scratch')
PACKET = BASE / 'seerrng-pr418-w3320-3339-20261103-corrected'
CLEAN = PACKET / 'clean-input'
BLIND_INPUT = BASE / 'seerrng-pr418-w3320-3339-blind-input-20261103' / 'input'
PRIMARY = PACKET / 'primary-review'
BLIND = BASE / 'seerrng-pr418-w3320-3339-independent-blind-20261103'
RAT = PACKET / 'independent-ratification-20261103'
OUT = PACKET / 'independent-audit-20261103'
REPO = 'snapetech-org/SeerrNG'
EXPECTED_HEAD = '70caabc2f95df1a7de3f869111aea1df58522d96'
EXPECTED_TREE = 'daac9e9284adac648fd3f6147265c21c90cdddba'


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def gh_json(endpoint: str):
    raw = subprocess.check_output(['gh', 'api', endpoint])
    return json.loads(raw)


_BLOB_CACHE = {}


def remote_blob(blob_sha: str) -> bytes:
    if blob_sha in _BLOB_CACHE:
        return _BLOB_CACHE[blob_sha]
    obj = gh_json(f'repos/{REPO}/git/blobs/{blob_sha}')
    require(obj.get('sha') == blob_sha, f'GitHub blob object SHA mismatch: {blob_sha}')
    require(obj.get('encoding') == 'base64', f'unexpected blob encoding for {blob_sha}')
    data = base64.b64decode(obj['content'])
    require(git_blob(data) == blob_sha, f'computed Git blob SHA mismatch: {blob_sha}')
    _BLOB_CACHE[blob_sha] = data
    return data


def jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]


def keyed(rows, label):
    out = {}
    for row in rows:
        key = (row['position'], row['id'], row['locale'])
        require(key not in out, f'duplicate {label} row: {key}')
        out[key] = row
    require(len(out) == 240, f'{label} row count is {len(out)}, expected 240')
    return out


def verify_manifest(directory: Path):
    manifest = directory / 'SHA256SUMS.txt'
    entries = []
    for line in manifest.read_text(encoding='utf-8').splitlines():
        expected, rel = line.split('  ', 1)
        path = directory / rel
        require(path.is_file(), f'manifest file missing: {path}')
        actual = sha(path.read_bytes())
        require(actual == expected, f'manifest hash mismatch: {path}')
        entries.append({'path': rel, 'sha256': actual})
    return entries


def current_hash(key, locale, source, target):
    packed = json.dumps([key, locale, source, target], ensure_ascii=False, separators=(',', ':'))
    return sha(packed)


def main():
    require(not (OUT / 'audit.json').exists(), 'audit output already exists; refusing overwrite')
    window = json.loads((CLEAN / 'window.json').read_text(encoding='utf-8'))
    boundaries = json.loads((CLEAN / 'source-boundaries.json').read_text(encoding='utf-8'))
    require(window['head'] == EXPECTED_HEAD and window['tree'] == EXPECTED_TREE, 'packet head/tree differs from expected')
    require(boundaries['head'] == EXPECTED_HEAD and boundaries['tree'] == EXPECTED_TREE, 'boundary head/tree differs')
    require(window['range'] == [3320, 3339] and window['cellCount'] == 240, 'window range/count mismatch')
    require(window['strictBlindInputOnly'] is True, 'strict blind input marker missing')
    require(window['pullRequest'] == 418 and window['repository'].lower() == 'snapetech-org/seerrng', 'repository/PR pin mismatch')

    pr = gh_json(f'repos/{REPO}/pulls/418')
    require(pr['head']['sha'] == EXPECTED_HEAD, 'live PR head changed')
    commit = gh_json(f'repos/{REPO}/commits/{EXPECTED_HEAD}')
    require(commit['commit']['tree']['sha'] == EXPECTED_TREE, 'live PR tree changed')
    require(pr['head']['repo']['full_name'].lower() == REPO.lower(), 'live PR head repository mismatch')

    input_manifest = verify_manifest(CLEAN)
    blind_input_manifest = verify_manifest(BLIND_INPUT)
    primary_manifest = verify_manifest(PRIMARY)
    blind_manifest = verify_manifest(BLIND)
    rat_manifest = verify_manifest(RAT)
    input_file_names = sorted(p.name for p in CLEAN.iterdir() if p.is_file())
    blind_file_names = sorted(p.name for p in BLIND_INPUT.iterdir() if p.is_file())
    require(input_file_names == blind_file_names, 'clean and blind input file sets differ')
    input_file_hashes = {}
    for name in input_file_names:
        a, b = (CLEAN / name).read_bytes(), (BLIND_INPUT / name).read_bytes()
        require(a == b, f'clean and blind input differ byte-for-byte: {name}')
        input_file_hashes[name] = sha(a)

    input_rows = jsonl(CLEAN / 'review-input.jsonl')
    primary_rows = jsonl(PRIMARY / 'primary-review.jsonl')
    blind_rows = jsonl(BLIND / 'review-ledger.jsonl')
    rat_rows = jsonl(RAT / 'ratified-ledger.jsonl')
    inp, pri, bli, rat = (keyed(rows, label) for rows, label in [
        (input_rows, 'input'), (primary_rows, 'primary'), (blind_rows, 'blind'), (rat_rows, 'ratification')])
    plan_rows = list(csv.DictReader((RAT / 'apply-plan.csv').open(encoding='utf-8', newline='')))
    rat_csv = list(csv.DictReader((RAT / 'ratified-ledger.csv').open(encoding='utf-8', newline='')))
    require(len(plan_rows) == 17 and len(rat_csv) == 240, 'CSV ledger/plan row count mismatch')

    input_fields = set(input_rows[0])
    forbidden = sorted(k for k in input_fields if any(part in k.lower() for part in ('proposed', 'candidate', 'verdict', 'decision', 'rationale', 'primarytarget', 'blindtarget', 'ratifiedtarget')))
    require(not forbidden, f'candidate/review fields present in candidate-free input: {forbidden}')
    # eligibility is an explicit caller-gate disclosure, not a proposed translation.
    eligibility_counts = Counter(r['eligibility'] for r in input_rows)
    require(eligibility_counts == Counter({'eligible': 180, 'hold-context': 60}), 'candidate-free eligibility counts unexpected')

    source_ids = window['sourceIds']
    require(len(source_ids) == 20, 'source ID count mismatch')
    locales = window['localeOrder']
    require(len(locales) == 12 and len(set(locales)) == 12, 'locale order mismatch')
    require(set(inp) == set(pri) == set(bli) == set(rat), 'row identities differ across ledgers')
    for key, row in inp.items():
        p, b, r = pri[key], bli[key], rat[key]
        require(row['sourceSha256'] == sha(row['source']), f'source hash mismatch: {key}')
        require(row['currentTargetSha256'] == sha(row['currentTarget']), f'current target hash mismatch: {key}')
        require(row['currentCatalogTranslationHash'] == current_hash(row['id'], row['locale'], row['source'], row['currentTarget']), f'current catalog translation hash mismatch: {key}')
        for q, label in [(p, 'primary'), (b, 'blind'), (r, 'ratification')]:
            for field in ('position', 'id', 'locale', 'source', 'sourceSha256', 'currentTarget', 'currentTargetSha256', 'catalogPath', 'catalogFileSha256', 'catalogGitBlob', 'callerExists', 'directMessageReferences', 'callerContextHashes'):
                require(q[field] == row[field], f'{label} pin differs for {field}: {key}')
        require(p['targetSha256'] == sha(p['target']), f'primary target hash mismatch: {key}')
        require(b['proposedTargetSha256'] == sha(b['proposedTarget']), f'blind proposed target hash mismatch: {key}')
        require(r['primaryTarget'] == p['target'] and r['primaryTargetSha256'] == p['targetSha256'], f'ratification primary evidence mismatch: {key}')
        require(r['blindProposedTarget'] == b['proposedTarget'] and r['blindProposedTargetSha256'] == b['proposedTargetSha256'], f'ratification blind evidence mismatch: {key}')
        require(r['primaryVerdict'] == p['verdict'] and r['blindDecision'] == b['decision'], f'ratification decision evidence mismatch: {key}')
        require(r['ratifiedTargetSha256'] == sha(r['ratifiedTarget']), f'ratified target hash mismatch: {key}')
        require(r['currentCatalogTranslationHash'] == row['currentCatalogTranslationHash'], f'ratified current hash mismatch: {key}')
        require(r['catalogOrderedKeySha256'] == window['localeCatalogPins'][row['catalogPath']]['orderedKeySha256'], f'ordered-key pin mismatch: {key}')
        require(r['ratifiedDisposition'] == ('hold-context' if row['eligibility'] == 'hold-context' else ('approved-change' if r['ratifiedTarget'] != row['currentTarget'] else 'accept-current')), f'ratified disposition inconsistent: {key}')

    plan_by_key = {}
    for row in plan_rows:
        key = (int(row['position']), row['id'], row['locale'])
        require(key not in plan_by_key, f'duplicate apply-plan row: {key}')
        plan_by_key[key] = row
        source_row = inp[key]
        rat_row = rat[key]
        require(row['catalogPath'] == source_row['catalogPath'], f'apply path mismatch: {key}')
        require(row['sourceSha256'] == source_row['sourceSha256'], f'apply source pin mismatch: {key}')
        require(row['currentTarget'] == source_row['currentTarget'] and row['currentTargetSha256'] == source_row['currentTargetSha256'], f'apply current target mismatch: {key}')
        require(row['proposedTarget'] == rat_row['ratifiedTarget'], f'apply target differs from ratified target: {key}')
        require(row['proposedTargetSha256'] == sha(row['proposedTarget']) == rat_row['ratifiedTargetSha256'], f'apply target hash mismatch: {key}')
        require(row['applyStatus'] == 'planned; not applied', f'apply status unexpected: {key}')
        require(row['nativeSpeakerApprovalPending'].lower() == 'true', f'native-speaker pending flag missing: {key}')
        require(source_row['eligibility'] == 'eligible', f'held row appears in apply plan: {key}')
        require(rat_row['ratifiedTarget'] != source_row['currentTarget'], f'unchanged target appears in apply plan: {key}')
    changed_keys = {key for key, row in rat.items() if row['ratifiedTarget'] != row['currentTarget']}
    require(changed_keys == set(plan_by_key), 'apply plan does not exactly cover the ratified changes')

    held_keys = {row['id'] for row in input_rows if row['eligibility'] == 'hold-context'}
    require(held_keys == {
        'components.Requests.deleted', 'components.Requests.deleting', 'components.Requests.ebook',
        'components.Requests.ebookAndAudiobook', 'components.Requests.format'}, 'caller hold key set changed')
    holds = [row for row in rat_rows if row['ratifiedDisposition'] == 'hold-context']
    require(len(holds) == 60 and len({r['id'] for r in holds}) == 5, 'hold count/key count mismatch')
    require(all(r['ratifiedTarget'] == r['currentTarget'] and r['callerExists'] is False and r['directMessageReferences'] == 0 for r in holds), 'a caller hold was changed or lacks exact no-caller evidence')
    require(all(Counter(r['locale'] for r in holds)[loc] == 5 for loc in locales), 'hold locale coverage mismatch')

    primary_counts = Counter(r['verdict'] for r in primary_rows)
    blind_counts = Counter(r['decision'] for r in blind_rows)
    rat_counts = Counter(r['ratifiedDisposition'] for r in rat_rows)
    class_counts = Counter(r['adjudicationClass'] for r in rat_rows)
    require(primary_counts == Counter({'accept-current': 163, 'correction': 8, 'refinement': 9, 'hold-context': 60}), 'primary decision distribution mismatch')
    require(blind_counts == Counter({'keep': 167, 'revise-proposed': 13, 'hold-context': 60}), 'blind decision distribution mismatch')
    require(rat_counts == Counter({'accept-current': 163, 'approved-change': 17, 'hold-context': 60}), 'ratified disposition distribution mismatch')
    require(class_counts == Counter({'retain-current-agreement': 162, 'hold-preserved': 60, 'shared-change-agreement': 8, 'primary-only-change-accepted': 5, 'primary-wording-selected': 4, 'blind-only-proposal-retained-current': 1}), 'adjudication class distribution mismatch')
    for row in rat_rows:
        key = (row['position'], row['id'], row['locale'])
        if row['adjudicationClass'] == 'shared-change-agreement':
            require(row['primaryTarget'] == row['blindProposedTarget'] == row['ratifiedTarget'] != row['currentTarget'], f'shared change mismatch: {key}')
        if row['adjudicationClass'] == 'primary-only-change-accepted':
            require(row['primaryTarget'] == row['ratifiedTarget'] != row['currentTarget'] and row['blindProposedTarget'] == row['currentTarget'], f'primary-only change mismatch: {key}')
        if row['adjudicationClass'] == 'primary-wording-selected':
            require(row['ratifiedTarget'] == row['primaryTarget'] != row['currentTarget'] and row['blindProposedTarget'] != row['currentTarget'] and row['blindProposedTarget'] != row['primaryTarget'], f'primary wording selection mismatch: {key}')
        if row['adjudicationClass'] == 'blind-only-proposal-retained-current':
            require(row['ratifiedTarget'] == row['currentTarget'] == row['primaryTarget'] and row['blindProposedTarget'] != row['currentTarget'], f'blind-only retained-current mismatch: {key}')

    # Fetch exact files from the live PR tree and independently verify blob, file, key, and order pins.
    tree_obj = gh_json(f'repos/{REPO}/git/trees/{EXPECTED_TREE}?recursive=1')
    tree_entries = {item['path']: item['sha'] for item in tree_obj.get('tree', []) if item.get('type') == 'blob'}
    pinned_paths = list(window['localeCatalogPins']) + list(window['callerFiles'])
    if tree_obj.get('truncated'):
        for path in pinned_paths:
            content = gh_json(f'repos/{REPO}/contents/{path}?ref={EXPECTED_HEAD}')
            tree_entries[path] = content['sha']
    locale_objs = {}
    catalog_checks = []
    for path, pin in window['localeCatalogPins'].items():
        require(tree_entries.get(path) == pin['gitBlob'], f'live tree blob mismatch for {path}')
        data = remote_blob(pin['gitBlob'])
        require(sha(data) == pin['sha256'], f'catalog file hash mismatch for {path}')
        obj = json.loads(data)
        keys = list(obj)
        ordered_hash = sha('\n'.join(keys))
        require(len(keys) == pin['keyCount'] == 9494, f'catalog key count mismatch for {path}')
        require(ordered_hash == pin['orderedKeySha256'], f'catalog ordered-key hash mismatch for {path}')
        locale_objs[path] = obj
        catalog_checks.append({'path': path, 'gitBlob': pin['gitBlob'], 'sha256': pin['sha256'], 'keyCount': len(keys), 'orderedKeySha256': ordered_hash})
    english_path = 'src/i18n/locale/en.json'
    english_keys = list(locale_objs[english_path])
    english_set = set(english_keys)
    require(len(english_keys) == 9494 and len(english_set) == 9494, 'English catalog has duplicate/missing key count')
    catalog_sets_equal = all(set(obj) == english_set for obj in locale_objs.values())
    require(catalog_sets_equal, 'catalog key sets differ at live PR head')
    key_order_groups = {}
    window_positions = {}
    expected_sources = {item['position']: item for item in source_ids}
    for loc_path, obj in locale_objs.items():
        loc = Path(loc_path).stem
        require(all(row['id'] in obj for row in source_ids), f'window key missing in {loc_path}')
        for row in source_ids:
            require(obj[row['id']] == row['source'], f'English source text differs in {loc_path}: {row["id"]}') if loc == 'en' else None
        keys = list(obj)
        idx = {key: i for i, key in enumerate(keys)}
        positions = [idx[item['id']] for item in source_ids]
        require(positions == list(range(positions[0], positions[0] + 20)), f'window keys not contiguous/in source order in {loc_path}')
        window_positions[loc] = {'first': positions[0], 'last': positions[-1]}
        key_order_groups.setdefault(sha('\n'.join(keys)), []).append(loc)
    require(len(key_order_groups) == 2, 'catalog order hash group count differs from pin')
    for row in input_rows:
        obj = locale_objs[row['catalogPath']]
        require(obj[row['id']] == row['currentTarget'], f'current target does not match exact catalog at head: {(row["position"], row["id"], row["locale"])}')

    # All caller snippets/files are checked against the exact live PR tree.
    caller_checks = []
    for path, pin in window['callerFiles'].items():
        require(tree_entries.get(path) == pin['gitBlob'], f'live caller file blob mismatch for {path}')
        data = remote_blob(pin['gitBlob'])
        require(sha(data) == pin['sha256'], f'caller file hash mismatch for {path}')
        lines = data.decode('utf-8').splitlines()
        require(len(lines) == pin['lineCount'], f'caller line count mismatch for {path}')
        caller_checks.append({'path': path, 'gitBlob': pin['gitBlob'], 'sha256': pin['sha256'], 'lineCount': len(lines)})
    caller_rows = jsonl(CLEAN / 'caller-contexts.jsonl')
    for row in caller_rows:
        data = remote_blob(row['fileGitBlob'])
        require(sha(data) == row['fileSha256'], f'caller context file hash mismatch: {row["file"]}')
        lines = data.decode('utf-8').splitlines()
        start = row['contextStartLine'] - 1
        snippet = '\n'.join(lines[start:start + len(row['context'].split('\n'))])
        require(snippet == row['context'] and sha(snippet) == row['contextSha256'], f'caller context snippet mismatch: {row["id"]} {row["file"]}:{row["line"]}')

    approved = []
    for key in sorted(plan_by_key):
        row = plan_by_key[key]
        approved.append({'position': int(row['position']), 'id': row['id'], 'locale': row['locale'], 'currentTargetSha256': row['currentTargetSha256'], 'targetSha256': row['proposedTargetSha256'], 'changeClass': row['changeClass'], 'ratificationClass': row['adjudicationClass']})

    # Artifact chronology is evidence only; no access-control/audit log is present to prove process isolation.
    chronology = {}
    for name, path in [('blindInputManifest', BLIND_INPUT / 'SHA256SUMS.txt'), ('primaryLedger', PRIMARY / 'primary-review.jsonl'), ('blindLedger', BLIND / 'review-ledger.jsonl'), ('ratifiedLedger', RAT / 'ratified-ledger.jsonl')]:
        chronology[name] = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()

    report = {
        'auditTimeUtc': datetime.now(timezone.utc).isoformat(),
        'repository': REPO,
        'pullRequest': 418,
        'livePrState': pr['state'],
        'livePrDraft': pr['draft'],
        'liveHead': pr['head']['sha'],
        'liveTree': commit['commit']['tree']['sha'],
        'baseHead': pr['base']['sha'],
        'headRef': pr['head']['ref'],
        'window': [3320, 3339],
        'sourceRows': 20,
        'cells': 240,
        'manifestsVerified': {'cleanInput': len(input_manifest), 'blindInput': len(blind_input_manifest), 'primary': len(primary_manifest), 'blind': len(blind_manifest), 'ratification': len(rat_manifest)},
        'cleanInputIdenticalToBlindInput': True,
        'cleanInputFileSha256': input_file_hashes,
        'inputReviewCandidateFields': forbidden,
        'eligibilityMetadata': dict(eligibility_counts),
        'blindBoundary': {
            'proposedTranslationOrReviewFieldsInInput': False,
            'explicitCallerGateMetadataInInput': True,
            'candidateFreeInputProvidedToBlindPacketIsByteIdentical': True,
            'processIsolationIndependentlyAttestedByArtifacts': False,
            'chronologyUtc': chronology,
            'assessment': 'No candidate target text is present in either candidate-free input. The 60 caller-gate rows are explicitly marked hold-context before either review, so blind agreement on those holds is not independent evidence; the live caller pins separately verify the holds. The packet artifacts do not prove access isolation from the primary ledger, which existed before the blind ledger file was written.'
        },
        'primaryDispositions': dict(primary_counts),
        'blindDispositions': dict(blind_counts),
        'ratifiedDispositions': dict(rat_counts),
        'ratificationClasses': dict(class_counts),
        'approvedChanges': approved,
        'approvedChangeCount': len(approved),
        'holdIds': sorted(held_keys),
        'holdCount': len(holds),
        'allHoldsRetainCurrentAndHaveZeroDirectReferences': True,
        'catalogChecks': catalog_checks,
        'catalogKeySetParityVerifiedAtLiveHead': catalog_sets_equal,
        'catalogOrderGroups': key_order_groups,
        'reviewWindowActualCatalogPositions': window_positions,
        'windowOrderPreservedAcrossAllLocales': True,
        'fullCatalogOrderParity': False,
        'applyPlanChangesOnlyExistingValues': True,
        'callerFileChecks': caller_checks,
        'callerContextRowsVerified': len(caller_rows),
        'nativeSpeakerApproval': False,
        'applicationSafeFor17ValueOnlyChanges': True,
        'notes': [
            'Five catalogs (ja, ko, vi, zh_Hans, zh_Hant) have a different pre-existing full ordered-key hash; all 13 live catalog key sets are equal and all 20 reviewed IDs occur contiguously in the same relative order.',
            'The review-window positions in those five catalogs are 3301–3320 while other catalogs are 3320–3339; apply-plan rows are key-addressed, and all keys already exist.',
            'Application safety covers the 17 ratified localized value changes and unchanged 60 caller holds. It does not certify native-speaker approval or process-level blind isolation.'
        ]
    }
    (OUT / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    md = f'''# Independent read-only audit: SeerrNG PR #418 W3320–W3339

**Assessment: safe to apply the 17 ratified value changes** against the pinned head, with all 60 caller-gated cells retained unchanged. Confidence: high for hashes, catalog structure, and decision reproduction; moderate for independent-review process provenance.

- Live PR head/tree: `{report['liveHead']}` / `{report['liveTree']}`; PR state: `{report['livePrState']}`, draft: `{report['livePrDraft']}`.
- All five input/review/rationalization checksum manifests verify. Corrected clean input and the separate blind input are byte-identical across all six files. The primary, blind, and ratified ledgers join one-to-one over 240 cells, and all per-cell source/current/catalog/caller pins and target SHA-256 values recompute.
- The apply plan contains exactly 17 changed, existing locale values; each planned target and hash equals the ratified ledger. No held cell is in the plan. The 60 holds remain current across the five zero-direct-caller keys.
- Exact live catalog blobs, file hashes, 9,494-key counts, ordered-key hashes, and all 51 caller-context snippets match the packet. The 13 live catalog key sets are equal. Five catalogs have a pre-existing different full ordered-key hash, while the 20-key window remains contiguous and in the same relative order; the plan is key-addressed and changes no key or order.
- **Blind-boundary caveat:** the candidate-free input contains no proposed targets or review verdict/rationale fields, but it prelabels the 60 rows with `eligibility=hold-context` and exposes their caller-gate metadata. Therefore blind agreement is not independent evidence for those holds; the exact live caller pins support retaining them. The filesystem artifacts do not attest reviewer access isolation from the primary ledger, which predates the blind ledger file. This limits process-level independence claims but does not affect the reproducibility of the 17 candidate-free proposals or application integrity.
- Native-speaker approval remains outstanding. No repository, PR, or GitHub state was changed; no tests/builds/scans/CI were run.

See `audit.json` for the 17 exact source/target hashes, per-catalog/caller pins, disposition counts, and observed artifact chronology. Re-run with `python3 audit.py` from any machine with `gh` access to the repository.
'''
    (OUT / 'README.md').write_text(md, encoding='utf-8')
    files = [OUT / 'audit.py', OUT / 'audit.json', OUT / 'README.md']
    (OUT / 'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in files), encoding='utf-8')
    print(json.dumps({'audit': str(OUT / 'README.md'), 'liveHead': report['liveHead'], 'liveTree': report['liveTree'], 'approvedChanges': len(approved), 'holds': len(holds), 'catalogKeySetParity': catalog_sets_equal, 'blindBoundary': report['blindBoundary']['assessment']}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
