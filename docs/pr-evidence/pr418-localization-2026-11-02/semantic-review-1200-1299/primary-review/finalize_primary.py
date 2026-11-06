import collections
import hashlib
import json
import re
from pathlib import Path


ROOT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1200-1299-primary-20261102')
HEAD = '6ff9de1c39a19fe9c508f09e0f6a885022632d8b'
TREE = '68d7525714b3628bbe7b69701d8be08add152832'
LOCALE_FILES = {
    'ar': 'src/i18n/locale/ar.json',
    'de': 'src/i18n/locale/de.json',
    'es': 'src/i18n/locale/es.json',
    'fr': 'src/i18n/locale/fr.json',
    'hi': 'src/i18n/locale/hi.json',
    'id': 'src/i18n/locale/id.json',
    'ja': 'src/i18n/locale/ja.json',
    'ko': 'src/i18n/locale/ko.json',
    'pt-BR': 'src/i18n/locale/pt_BR.json',
    'vi': 'src/i18n/locale/vi.json',
    'zh-CN': 'src/i18n/locale/zh_Hans.json',
    'zh-TW': 'src/i18n/locale/zh_Hant.json',
}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def write_jsonl(path, rows):
    path.write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n' for row in rows), encoding='utf-8')


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def placeholders(text):
    return sorted(set(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,}]|$)', text)))


def markup(text):
    return re.findall(r'</?[A-Za-z][^>]*>', text)


def protected_literals(text):
    return {'SeerrNG': text.count('SeerrNG')} if 'SeerrNG' in text else {}


def main():
    base = read_jsonl(ROOT / 'primary-review-ledger.jsonl')
    inputs = read_jsonl(ROOT / 'review-input.jsonl')
    assert len(base) == len(inputs) == 1200
    assert all(row['attestedHead'] == HEAD and row['attestedTree'] == TREE for row in base)

    reviews = []
    for subdir in ('locale-a', 'locale-b'):
        packet = ROOT / subdir
        sha_file = packet / 'SHA256SUMS'
        assert sha_file.exists(), f'missing {sha_file}'
        entries = []
        for line in sha_file.read_text(encoding='utf-8').splitlines():
            digest, name = line.split(None, 1)
            name = name.lstrip('* ')
            entries.append((digest, name))
        for digest, name in entries:
            assert hashlib.sha256((packet / name).read_bytes()).hexdigest() == digest, (subdir, name)
        review = read_jsonl(packet / 'review.jsonl')
        assert len(review) == 600, (subdir, len(review))
        reviews.extend(review)

    assert len(reviews) == 1200
    key = lambda row: (row['id'], row['locale'])
    assert len({key(row) for row in reviews}) == 1200
    review_map = {key(row): row for row in reviews}
    input_map = {key(row): row for row in inputs}
    assert set(review_map) == set(input_map)

    addendum_count = 0
    addendum_keys = set()
    for subdir in ('locale-a', 'locale-b'):
        packet = ROOT / subdir
        addendum_path = packet / 'narrator-addendum.jsonl'
        if not addendum_path.exists():
            continue
        sums_path = packet / 'narrator-addendum-SHA256SUMS'
        assert sums_path.exists(), f'missing {sums_path}'
        for line in sums_path.read_text(encoding='utf-8').splitlines():
            digest, name = line.split(None, 1)
            name = name.lstrip('* ')
            assert hashlib.sha256((packet / name).read_bytes()).hexdigest() == digest, (subdir, name)
        for amendment in read_jsonl(addendum_path):
            ident = (amendment['id'], amendment['locale'])
            assert ident not in addendum_keys, ident
            addendum_keys.add(ident)
            review = review_map[ident]
            expected_prior = review.get('recommendedTarget') if review['disposition'].startswith('propose-') else review['currentTarget']
            assert amendment['exactHead'] == HEAD and amendment['exactTree'] == TREE, ident
            assert amendment['source'] == review['source'] and amendment['sourceHash'] == review['sourceHash'], ident
            assert amendment['currentTarget'] == review['currentTarget'] and amendment['currentTargetHash'] == review['currentTargetHash'], ident
            reviewed_against = amendment.get('reviewedAgainst', {})
            prior_target = amendment.get('priorReviewedTarget', reviewed_against.get('priorLocaleBTarget'))
            prior_disposition = amendment.get('priorDisposition', reviewed_against.get('priorLocaleBDisposition'))
            if prior_target is None:
                prior_target = expected_prior
            assert prior_target == expected_prior, ident
            assert prior_disposition == review['disposition'], ident
            final_disposition = amendment.get('finalDisposition', amendment.get('disposition'))
            final_target = amendment['finalTarget']
            final_hash = amendment['finalTargetHash']
            assert final_disposition in {'accept-current', 'propose-correction', 'propose-refinement', 'hold'}, ident
            if final_disposition.startswith('propose-'):
                assert sha(final_target) == final_hash, ident
            else:
                assert final_target == review['currentTarget'] and final_hash == review['currentTargetHash'], ident
            review['disposition'] = final_disposition
            review['recommendedTarget'] = final_target if final_disposition.startswith('propose-') else None
            review['recommendedTargetHash'] = final_hash if final_disposition.startswith('propose-') else None
            review['rationale'] = amendment['rationale']
            review['confidence'] = amendment['confidence']
            addendum_count += 1

    counts = collections.Counter()
    by_locale = {locale: collections.Counter() for locale in LOCALE_FILES}
    candidates = []
    for row in base:
        ident = key(row)
        review = review_map[ident]
        source_input = input_map[ident]
        assert review['exactHead'] == HEAD and review['exactTree'] == TREE, ident
        assert not review.get('inputAttestationMismatches'), ident
        assert row['sourceId'] == review['id'] == source_input['id']
        assert row['locale'] == review['locale'] == source_input['locale']
        assert row['source'] == review['source'] == source_input['source']
        assert row['sourceHash'] == review['sourceHash'] == source_input['sourceHash']
        assert row['currentTarget'] == review['currentTarget'] == source_input['currentTarget']
        assert row['currentTargetHash'] == review['currentTargetHash'] == source_input['currentTargetHash']
        assert row['targetFile'] == review['targetFile'] == source_input['targetFile']
        assert review['frozenPriorSpanish'] is False
        decision = review['disposition']
        assert decision in {'accept-current', 'propose-correction', 'propose-refinement', 'hold'}
        proposed = review.get('recommendedTarget')
        proposed_hash = review.get('recommendedTargetHash')
        if decision in {'accept-current', 'hold'}:
            assert proposed is None and proposed_hash is None, ident
            proposed = row['currentTarget']
        else:
            assert proposed is not None and proposed_hash == sha(proposed), ident
        src_names = placeholders(row['source'])
        cur_names = placeholders(row['currentTarget'])
        prop_names = placeholders(proposed)
        src_tags = markup(row['source'])
        cur_tags = markup(row['currentTarget'])
        prop_tags = markup(proposed)
        src_literals = protected_literals(row['source'])
        cur_literals = protected_literals(row['currentTarget'])
        prop_literals = protected_literals(proposed)
        placeholder_ok = src_names == cur_names == prop_names
        markup_ok = src_tags == cur_tags == prop_tags
        literal_ok = src_literals == cur_literals == prop_literals
        assert placeholder_ok and markup_ok and literal_ok, (ident, src_names, cur_names, prop_names, src_tags, cur_tags, prop_tags, src_literals, cur_literals, prop_literals)

        row['decision'] = decision
        row['decisionRationale'] = review['rationale']
        row['confidence'] = review['confidence']
        row['semanticReviewPerformed'] = True
        row['routingDisposition'] = 'new-primary-candidate' if decision.startswith('propose-') else ('primary-review-hold' if decision == 'hold' else 'primary-review-accept-current')
        row['candidateKind'] = {'propose-correction': 'correction', 'propose-refinement': 'refinement'}.get(decision)
        row['proposedTarget'] = proposed if decision.startswith('propose-') else None
        row['proposedTargetHash'] = proposed_hash if decision.startswith('propose-') else None
        row['placeholderNamesCurrent'] = cur_names
        row['placeholderNamesProposed'] = prop_names
        row['placeholderNamesSource'] = src_names
        row['placeholderParity'] = placeholder_ok
        row['markupTagsCurrent'] = cur_tags
        row['markupTagsProposed'] = prop_tags
        row['markupTagsSource'] = src_tags
        row['markupParity'] = markup_ok
        row['protectedLiteralsCurrent'] = cur_literals
        row['protectedLiteralsProposed'] = prop_literals
        row['protectedLiteralsSource'] = src_literals
        row['protectedLiteralParity'] = literal_ok
        row['priorDispositionPreserved'] = False
        row['priorDispositionRef'] = None
        row['reviewSubpacket'] = 'locale-a/review.jsonl' if row['locale'] in {'ar', 'de', 'es', 'fr', 'hi', 'id'} else 'locale-b/review.jsonl'
        counts[decision] += 1
        by_locale[row['locale']][decision] += 1

        if decision.startswith('propose-'):
            candidate = {
                'attestedHead': HEAD,
                'attestedTree': TREE,
                'candidateHash': proposed_hash,
                'candidateKind': 'correction' if decision == 'propose-correction' else 'refinement',
                'confidence': review['confidence'],
                'currentTarget': row['currentTarget'],
                'currentTargetHash': row['currentTargetHash'],
                'id': row['sourceId'],
                'locale': row['locale'],
                'proposedTarget': proposed,
                'rationale': review['rationale'],
                'source': row['source'],
                'sourceCatalogBlob': row['sourceCatalogBlob'],
                'sourceCatalogSha256': row['sourceCatalogSha256'],
                'sourceHash': row['sourceHash'],
                'sourceIdPosition': row['sourceIdPosition'],
                'targetCatalogBlob': row['targetCatalogBlob'],
                'targetCatalogSha256': row['targetCatalogSha256'],
                'targetFile': row['targetFile'],
            }
            candidates.append(candidate)

    assert len({(row['id'], row['locale']) for row in base}) == 1200
    base.sort(key=lambda row: (row['sourceIdPosition'], list(LOCALE_FILES).index(row['locale'])))
    candidates.sort(key=lambda row: (row['sourceIdPosition'], list(LOCALE_FILES).index(row['locale'])))
    write_jsonl(ROOT / 'primary-review-ledger.jsonl', base)
    write_jsonl(ROOT / 'candidate-proposals.jsonl', candidates)
    write_jsonl(ROOT / 'candidate-hashes.jsonl', [
        {
            'candidateHash': row['candidateHash'],
            'currentTargetHash': row['currentTargetHash'],
            'id': row['id'],
            'locale': row['locale'],
            'sourceIdPosition': row['sourceIdPosition'],
        }
        for row in candidates
    ])

    manifest = read_json(ROOT / 'manifest.json')
    manifest['semanticDispositions'] = {
        'counts': dict(sorted(counts.items())),
        'candidateCount': len(candidates),
        'byLocale': {locale: dict(sorted(by_locale[locale].items())) for locale in LOCALE_FILES},
        'inputAttestationMismatches': 0,
        'placeholderFailures': 0,
        'markupFailures': 0,
        'protectedLiteralFailures': 0,
    }
    manifest['definitionOnlySourceIds'] = [
        row['sourceId'] for row in read_jsonl(ROOT / 'source-contexts.jsonl')
        if row['usageStatus'] == 'definition-only-no-use-found'
    ]
    manifest['definitionOnlyTargetCellCount'] = len(manifest['definitionOnlySourceIds']) * len(LOCALE_FILES)
    manifest['localeReviewSubpackets'] = {
        'locale-a': 'ar,de,es,fr,hi,id',
        'locale-b': 'ja,ko,pt-BR,vi,zh-CN,zh-TW',
    }
    manifest['narratorConsistencyAddendumRows'] = addendum_count
    write_json(ROOT / 'manifest.json', manifest)

    summary = read_json(ROOT / 'summary.json')
    summary.update({
        'rowsReviewed': len(base),
        'primaryDispositions': dict(sorted(counts.items())),
        'candidateCount': len(candidates),
        'primaryDispositionsByLocale': {locale: dict(sorted(by_locale[locale].items())) for locale in LOCALE_FILES},
        'priorSpanishDispositionsPreserved': 0,
        'definitionOnlySourceIds': manifest['definitionOnlySourceIds'],
        'definitionOnlyTargetCellCount': manifest['definitionOnlyTargetCellCount'],
        'narratorConsistencyAddendumRows': addendum_count,
        'placeholderFailures': 0,
        'markupFailures': 0,
        'protectedLiteralFailures': 0,
        'nativeSpeakerReviewPerformed': False,
        'notes': [
            'Source positions 1200–1299 use the exact insertion order of src/i18n/locale/en.json at the pinned head and are disjoint from reviewed positions 0–1199.',
            'No frozen prior disposition intersects the 100 source IDs after checks of prior review/apply evidence.',
            'All 1,200 source/current cells and caller pins were re-attested at the exact head/tree; 207 caller references across five files and 206 unique lines were pinned.',
            'Six source IDs have definition-only coverage with no direct caller found on this head, totaling 72 locale cells; these received individual dispositions with the source limitation recorded.',
            'All candidate/current/source placeholder names, markup tags, and the protected SeerrNG literal match.',
            'Machine-assisted primary review only; native-speaker signoff and browser review are not claimed.',
        ],
    })
    write_json(ROOT / 'summary.json', summary)

    readme = f'''# SeerrNG PR #418 primary semantic packet — source positions 1200–1299

## Pin and scope

- Live PR: `snapetech-org/seerrng#418`, open draft.
- Exact head: `{HEAD}`.
- Tree: `{TREE}`.
- Base: `221d8e0d542802da7529cd272c928cc747677e5c`.
- Source catalog: `src/i18n/locale/en.json`, blob `12e04a118c30b71b3714291adeaf9fdb2735cee4`.
- Source insertion positions: 1200–1299 inclusive, 100 IDs × 12 direct locales = 1,200 cells.
- The window is disjoint from reviewed positions 0–1199 and from all matching IDs in the reviewed root disposition evidence.

## Primary dispositions

| Disposition | Count |
| --- | ---: |
'''
    for disposition, count in sorted(counts.items()):
        readme += f'| {disposition} | {count} |\n'
    readme += f'''

There are {len(candidates)} exact-target candidates across both correction and refinement dispositions. Each candidate row records the current and proposed target hashes, source hash, locale, exact head/tree and language-specific rationale. They are review proposals and have not been applied to the repository.

## Caller and catalog re-attestation

- 1,200 current translation cells plus 100 English source rows are pinned.
- 207 caller references across five source files and 206 unique caller lines were re-attested at the exact head.
- All 12 target catalogs have 9,494 keys.
- Six source IDs have definition-only coverage with no direct use found at this head (five ExternalMediaManageSlideOver labels and FollowButton.unfollow); this accounts for 72 locale cells. Their status is recorded per cell.
- Candidate/current/source placeholder sets, markup tags and the `SeerrNG` product literal were checked; no parity failures remain.
- Prior frozen-disposition intersection count: zero.

## Limits

This packet is a machine-assisted primary semantic review. It has not received native-speaker signoff or browser review. No repo/PR files, workflows, tests, builds, scans, CI jobs, releases, tags or merges were changed or run.

## Packet files

- `manifest.json` — live PR, source/tree/catalog pins, window and disposition counts.
- `summary.json` — scope, counts, validation and review limitations.
- `source-current-attestation.jsonl` — exact source/current hash records.
- `selected-direct-locale-cells.jsonl` — 1,200 source/current locale rows.
- `source-contexts.jsonl` — source definitions, use references and context coverage.
- `caller-context-attestation.jsonl` — exact caller line/blob/hash records.
- `primary-review-ledger.jsonl` — complete per-cell disposition, proposal and parity records.
- `candidate-proposals.jsonl` and `candidate-hashes.jsonl` — exact proposal targets and hash index.
- `preserved-prior-routing-rows.jsonl` — empty; there are no intersecting frozen prior dispositions.
- `prior-disposition-boundary.json` — exact overlap scan evidence.
- `locale-a/` and `locale-b/` — checksum-verified locale subpackets with independent per-cell semantic reasoning and separate narrator-consistency addenda.
- `prepare_packet.py` and `finalize_primary.py` — scratch-only reproducibility tools.
- `SHA256SUMS` — integrity hashes for packet artifacts.
'''
    (ROOT / 'README.md').write_text(readme, encoding='utf-8')
    print(json.dumps({
        'rows': len(base),
        'dispositions': dict(sorted(counts.items())),
        'candidates': len(candidates),
        'definitionOnlySourceIds': manifest['definitionOnlySourceIds'],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
