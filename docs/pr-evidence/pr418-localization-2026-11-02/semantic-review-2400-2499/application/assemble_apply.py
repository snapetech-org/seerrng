import collections
import hashlib
import json
import shutil
from pathlib import Path

REPO = Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
SCRATCH = Path('/mnt/disks/scratch/task-scratch')
PRIMARY = SCRATCH / 'seerrng-pr418-window-2400-2499-primary-20261102'
HIDVI = SCRATCH / 'seerrng-pr418-window-2400-2499-hidvi-crossreview-20261102'
NINE = SCRATCH / 'seerrng-pr418-window-2400-2499-nine-locale-crossreview-20261102'
ADJ = SCRATCH / 'seerr-chaptarr-new-correction-adjudication-20261102'
EVIDENCE = REPO / 'docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-2400-2499'
LOCALE_ROOT = REPO / 'src/i18n/locale'
EXPECTED_HEAD = 'f20893e57a89827095fa049d8e0475df7ec7170f'
EXPECTED_TREE = 'b5a5952fb4f8a37ea5a39286295f153ce9504f52'

sha = lambda value: hashlib.sha256(value.encode('utf-8')).hexdigest()

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]

def keyset_hash(keys):
    return hashlib.sha256('\n'.join(keys).encode('utf-8')).hexdigest()

assert not EVIDENCE.exists(), EVIDENCE
assert REPO.exists() and LOCALE_ROOT.exists()
primary_summary = read_json(PRIMARY / 'summary.json')
hidvi_summary = read_json(HIDVI / 'summary.json')
nine_summary = read_json(NINE / 'summary.json')
adj_summary = read_json(ADJ / 'summary.json')
for name, summary in [('primary', primary_summary), ('hidvi', hidvi_summary), ('nine', nine_summary), ('adjudication', adj_summary)]:
    head = summary.get('exactHead') or summary.get('head') or summary.get('seerrHead')
    tree = summary.get('exactTree') or summary.get('tree') or summary.get('seerrTree')
    assert (head, tree) == (EXPECTED_HEAD, EXPECTED_TREE), (name, head, tree)
assert primary_summary['counts'] == {'accept-current': 853, 'propose-correction': 347}
assert hidvi_summary['holds'] == 0 and not nine_summary['holds']
assert adj_summary['perCohort']['SeerrNG'] == {'accept': 12, 'revise': 1}

primary_rows = read_jsonl(PRIMARY / 'primary-review-ledger.jsonl')
hidvi_rows = read_jsonl(HIDVI / 'crossreview-ledger.jsonl')
nine_rows = read_jsonl(NINE / 'cross-review.jsonl')
adj_rows = [row for row in read_jsonl(ADJ / 'adjudication.jsonl') if row['repository'] == 'snapetech-org/SeerrNG']
assert len(primary_rows) == 1200 and len(hidvi_rows) == 300 and len(nine_rows) == 900 and len(adj_rows) == 13
pmap = {(row['sourcePosition'], row['locale']): row for row in primary_rows}
assert len(pmap) == 1200
amap = {(row['sourcePosition'], row['locale']): row for row in adj_rows}
assert len(amap) == 13

final_rows = []
seen = set()
locale_files = {}
for cohort, rows in [('hidvi', hidvi_rows), ('nine', nine_rows)]:
    for row in rows:
        position, locale = row['sourcePosition'], row['locale']
        cell = (position, locale)
        assert cell in pmap and cell not in seen
        seen.add(cell)
        primary = pmap[cell]
        assert row['sourceId'] == primary['sourceId']
        assert row['sourceTextSha256'] == primary['sourceTextSha256']
        assert row['currentTarget'] == primary['currentTarget']
        assert row['currentTargetHash'] == primary['currentTargetHash'] == sha(row['currentTarget'])
        filename = Path(primary['localeFile']).name
        locale_files[locale] = filename
        disposition = row['crossReviewVerdict'] if cohort == 'hidvi' else row['crossReviewDisposition']
        reviewed_target = row['finalTarget'] if cohort == 'hidvi' else row['reviewedTarget']
        reviewed_hash = row['finalTargetHash'] if cohort == 'hidvi' else row['reviewedTargetHash']
        assert reviewed_hash == sha(reviewed_target)
        assert row.get('placeholderParity', row.get('candidatePlaceholderParity', True)) in (True, 'exact')
        assert row.get('markupParity', row.get('candidateMarkupParity', True)) in (True, 'exact')
        adjudication = None
        if disposition in ('propose-additional-correction', 'additional'):
            adjudication = amap[cell]
            assert adjudication['adjudication'] in ('accept', 'revise')
            assert adjudication['exactHead'] == EXPECTED_HEAD and adjudication['exactTree'] == EXPECTED_TREE
            assert adjudication['sourceId'] == primary['sourceId']
            assert adjudication['currentTarget'] == primary['currentTarget']
            assert adjudication['currentTargetSha256'] == primary['currentTargetHash']
            assert adjudication['sourceTextSha256'] == primary['sourceTextSha256']
            assert adjudication['currentCatalogValueVerified'] is True
            assert adjudication['sourceCatalogValueVerified'] is True
            assert adjudication['callerContextHashVerified'] is True
            assert adjudication['placeholderParity'] == 'exact'
            assert adjudication['markupParity'] == 'exact'
            assert adjudication['protectedLiteralParity'] == 'exact'
            final_target = adjudication['adjudicatedTarget']
            assert sha(final_target) == adjudication['adjudicatedTargetSha256']
        else:
            final_target = reviewed_target
            if disposition in ('accept-current',):
                assert final_target == row['currentTarget']
            if disposition in ('accept-primary-proposal', 'accept-primary-correction', 'accept-primary-refinement'):
                assert final_target == primary['finalTarget']
            if cohort == 'nine' and disposition == 'accepted' and primary['disposition'] == 'propose-correction':
                assert final_target == primary['finalTarget']
            if cohort == 'nine' and disposition == 'accepted' and primary['disposition'] == 'accept-current':
                assert final_target == row['currentTarget']
        assert isinstance(final_target, str) and final_target.strip()
        final_rows.append({
            'sourcePosition': position,
            'sourceId': primary['sourceId'],
            'locale': locale,
            'localeFile': primary['localeFile'],
            'source': primary['source'],
            'sourceTextSha256': primary['sourceTextSha256'],
            'callerContextSha256': primary['callerContextSha256'],
            'currentTarget': row['currentTarget'],
            'currentTargetHash': row['currentTargetHash'],
            'primaryDisposition': primary['disposition'],
            'primaryTarget': primary['finalTarget'],
            'crossReviewCohort': cohort,
            'crossReviewDisposition': disposition,
            'crossReviewTarget': reviewed_target,
            'thirdPartyAdjudication': adjudication['adjudication'] if adjudication else None,
            'thirdPartyTarget': adjudication['adjudicatedTarget'] if adjudication else None,
            'finalTarget': final_target,
            'finalTargetHash': sha(final_target),
            'changed': final_target != row['currentTarget'],
        })
assert len(seen) == 1200 and len(final_rows) == 1200
assert len(amap) == 13 and all(row['thirdPartyAdjudication'] in ('accept', 'revise') for row in final_rows if row['crossReviewDisposition'] in ('propose-additional-correction', 'additional'))
assert not any(row['crossReviewDisposition'] in ('hold', 'retain-hold') for row in final_rows)

catalogs = {}
preapply = []
for locale, filename in sorted(locale_files.items()):
    path = LOCALE_ROOT / filename
    raw = path.read_text(encoding='utf-8')
    data = json.loads(raw)
    assert json.dumps(data, ensure_ascii=False, indent=2) + '\n' == raw, filename
    catalogs[filename] = {'path': path, 'raw': raw, 'data': data}
    keys = list(data.keys())
    assert len(keys) == 9494
    preapply.append({'locale': locale, 'file': str(path.relative_to(REPO)), 'sha256': hashlib.sha256(raw.encode('utf-8')).hexdigest(), 'keyCount': len(keys), 'orderedKeySetSha256': keyset_hash(keys)})
all_keys = [set(item['data'].keys()) for item in catalogs.values()]
assert all(keys == all_keys[0] for keys in all_keys)

for row in final_rows:
    item = catalogs[Path(row['localeFile']).name]
    data = item['data']
    assert data[row['sourceId']] == row['currentTarget'], (row['locale'], row['sourceId'], 'catalog readback mismatch')
    assert sha(data[row['sourceId']]) == row['currentTargetHash']
    if row['changed']:
        data[row['sourceId']] = row['finalTarget']

# Save full original inputs and independent decisions before writing catalogs.
EVIDENCE.mkdir(parents=True)
shutil.copytree(PRIMARY, EVIDENCE / 'primary')
shutil.copytree(HIDVI, EVIDENCE / 'crossreview-hidvi')
shutil.copytree(NINE, EVIDENCE / 'crossreview-nine')
shutil.copytree(ADJ, EVIDENCE / 'third-party-adjudication')
application = EVIDENCE / 'application'
application.mkdir()
shutil.copy2(Path(__file__), application / 'assemble_apply.py')

for filename, item in catalogs.items():
    before = item['raw']
    after = json.dumps(item['data'], ensure_ascii=False, indent=2) + '\n'
    if before != after:
        item['path'].write_text(after, encoding='utf-8')

readback = []
for row in final_rows:
    path = LOCALE_ROOT / Path(row['localeFile']).name
    data = read_json(path)
    value = data[row['sourceId']]
    assert value == row['finalTarget']
    assert sha(value) == row['finalTargetHash']
    row['readbackTargetHash'] = sha(value)
    readback.append(row)

# Confirm the catalog key sets and order remain intact after value-only updates.
post_files = []
for locale, filename in sorted(locale_files.items()):
    path = LOCALE_ROOT / filename
    raw = path.read_text(encoding='utf-8')
    data = json.loads(raw)
    assert json.dumps(data, ensure_ascii=False, indent=2) + '\n' == raw
    keys = list(data.keys())
    assert len(keys) == 9494 and set(keys) == all_keys[0]
    post_files.append({'locale': locale, 'file': str(path.relative_to(REPO)), 'sha256': hashlib.sha256(raw.encode('utf-8')).hexdigest(), 'keyCount': len(keys), 'orderedKeySetSha256': keyset_hash(keys)})

counts = collections.Counter((row['crossReviewCohort'], row['crossReviewDisposition']) for row in final_rows)
changed = sum(row['changed'] for row in final_rows)
assert changed == 360
summary = {
    'repository': 'snapetech-org/SeerrNG', 'pullRequest': 418, 'state': 'OPEN', 'draft': True,
    'exactInputHead': EXPECTED_HEAD, 'exactInputTree': EXPECTED_TREE,
    'sourcePositions': [2400, 2499], 'sourceIds': 100, 'cells': 1200,
    'primaryCounts': primary_summary['counts'],
    'crossReviewCounts': {f'{cohort}:{disposition}': count for (cohort, disposition), count in sorted(counts.items())},
    'thirdPartyAdditionalCorrections': {'accepted': 12, 'revised': 1, 'holds': 0},
    'finalChangedCells': changed, 'finalUnchangedCells': len(final_rows) - changed, 'finalHolds': 0,
    'callerReferences': 262, 'callerFiles': 4, 'placeholderMismatchesFinal': 0, 'markupMismatchesFinal': 0, 'protectedLiteralMismatchesFinal': 0,
    'catalogs': post_files, 'browserReview': 'blocked: no deployment exists for the exact input head; existing VM tabs were left untouched',
    'nativeSpeakerApproval': False, 'nativeSpeakerReviewOutstanding': True,
    'testsBuildsCiRun': False, 'workflowFilesTouched': False, 'mergeReleaseTag': False,
}
application.joinpath('catalog-preapply-pins.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True)+'\n' for row in preapply), encoding='utf-8')
application.joinpath('apply-plan.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True)+'\n' for row in final_rows), encoding='utf-8')
application.joinpath('apply-readback.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True)+'\n' for row in readback), encoding='utf-8')
application.joinpath('post-apply-catalog-attestation.json').write_text(json.dumps({'catalogs': post_files, 'allKeySetsEqual': True, 'keyCount': 9494}, ensure_ascii=False, indent=2, sort_keys=True)+'\n', encoding='utf-8')
application.joinpath('apply-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True)+'\n', encoding='utf-8')

readme = f'''# SeerrNG PR #418 semantic review: W2400–W2499\n\nThe exact input was PR head `{EXPECTED_HEAD}` / tree `{EXPECTED_TREE}`. Primary review covered 100 source IDs × 12 locales (1,200 cells): 853 accepted current values and 347 correction proposals.\n\nIndependent cross-review covered all 1,200 cells. Hindi, Indonesian, and Vietnamese had 147 accepted current values, 144 accepted primary proposals, four revised primary proposals, and five additional corrections. The other nine locales had 884 accepted outcomes, eight revised primary proposals, and eight additional corrections. A separate adjudication accepted 12 of the 13 new corrections and revised Korean `components.ReaderDeliveryLink.audiobooksHelp` to preserve both source instructions. No cells remain held.\n\nApplication changed {changed} catalog cells and retained {len(final_rows)-changed} existing values. All 12 catalogs preserve the 9,494-key set and each file's existing key order. Final placeholder, markup, and protected-literal mismatches: zero. Caller review covered 262 references in four files.\n\n`primary/`, `crossreview-hidvi/`, `crossreview-nine/`, and `third-party-adjudication/` preserve the source packets and their checksums. `application/` contains the exact plan, pre-apply pins, full readback, post-apply catalog attestation, and checksums.\n\nThis is static semantic review only. The current PR head has no exact-SHA deployment, so headed-browser acceptance is blocked; the existing Agent VM tabs were left untouched. Qualified native-speaker review is outstanding. No tests, builds, scans, CI runs, workflow edits, merges, releases, or tags were made.\n'''
(EVIDENCE / 'README.md').write_text(readme, encoding='utf-8')

# A deterministic recursive evidence manifest excluding its own file.
manifest = EVIDENCE / 'SHA256SUMS'
lines = []
for path in sorted(p for p in EVIDENCE.rglob('*') if p.is_file() and p != manifest):
    lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(EVIDENCE).as_posix()}")
manifest.write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(json.dumps({'evidence':str(EVIDENCE),'files':len(lines)+1,'summary':summary},ensure_ascii=False,indent=2))
