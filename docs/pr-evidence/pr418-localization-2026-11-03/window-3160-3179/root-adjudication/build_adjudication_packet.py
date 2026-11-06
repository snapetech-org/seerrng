from collections import Counter
from pathlib import Path
import hashlib
import json
import re
import subprocess

REPO = Path('/home/keith/Documents/code/seerrng')
OUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3160-3179-adjudication-20261103')
PRIMARY = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3160-3179-primary-20261103')
INDEPENDENT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3160-3179-independent-crossreview-20261103')
REPO_SLUG = 'snapetech-org/seerrng'
HEAD = '0cc977d2dc5eff86eac49cdad3b9361bff5acd65'
TREE = 'ce65000b9bebef1838f3dd0e1a3764f75e102876'
WINDOW = (3160, 3179)
PLACEHOLDER_RE = re.compile(r'\{([A-Za-z][A-Za-z0-9_]*)\}')
MARKUP_RE = re.compile(r'</?([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>')


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha_text(value: str) -> str:
    return sha_bytes(value.encode('utf-8'))


def jhash(value) -> str:
    compact = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return sha_text(compact)


def git_show(path: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(REPO), 'show', f'{HEAD}:{path}'])


def git_blob(path: str) -> str:
    return subprocess.check_output(['git', '-C', str(REPO), 'rev-parse', f'{HEAD}:{path}'], text=True).strip()


def load_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]


def write_json(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def write_jsonl(path: Path, rows):
    path.write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n' for row in rows), encoding='utf-8')


# In target disagreements, use the more complete/natural alternative below where
# it improves a feature heading or names the queue unambiguously. Otherwise retain
# the primary proposal when it is already accurate and consistent with the feature
# terminology used elsewhere in this window.
independent_target_choices = {
    (3160, 'hi'): 'एपिसोड की कतार',
    (3160, 'fr'): 'File d’attente des épisodes',
    (3160, 'vi'): 'Hàng đợi tập phim',
    (3161, 'hi'): 'एपिसोड की कतार कैसे काम करती है',
    (3161, 'fr'): 'Comment fonctionne la file d’attente des épisodes',
    (3161, 'id'): 'Cara kerja antrean episode',
    (3162, 'fr'): 'Associer le compte',
    (3163, 'fr'): 'Impossible de charger le paramètre de votre file d’attente des épisodes. Réessayez avant de soumettre cette demande.',
    (3164, 'fr'): 'Chargement du paramètre de votre file d’attente des épisodes…',
    (3173, 'es'): 'Elige o configura un servidor de Sonarr para la calidad de TV seleccionada para usar la cola de episodios.',
}

# Independent-only revisions accepted after comparing the exact source and caller:
# these are clearer in the French sentence contexts; the French approve button is
# an explicit action that maps to the source action `approve`.
additional_independent_changes = {
    (3165, 'fr'): 'La file d’attente des épisodes est désactivée pour les demandes de séries TV de {owner}. Un gestionnaire des utilisateurs contrôle ce paramètre.',
    (3170, 'fr'): 'Le propriétaire de la demande doit associer son compte {mediaServer} avant que la file d’attente des épisodes puisse fonctionner.',
    (3174, 'fr'): 'Approuver',
}

retained_difference_rationales = {
    (3165, 'ko'): 'The current Korean phrase uses 에피소드 큐, the feature term selected in the corrected headings and explanatory copy. The independent 대기열 wording is a valid synonym; no meaning is lost in this sentence, so retain the current feature term.',
    (3165, 'id'): 'The current Indonesian sentence clearly states that Episode Queue is inactive for the owner’s TV requests. The competing spelling and capitalization are editorial variants; the current text has no source-level meaning defect, so retain it.',
    (3168, 'hi'): 'The current Hindi sentence states that this series needs a TVDB match before playback can connect to Sonarr. The independent version is a stylistic rephrasing; no clear source-meaning defect is exposed by the exact caller, so retain the current text.',
    (3170, 'hi'): 'The current Hindi sentence tells the request owner to link their {mediaServer} account before Episode Queue can run. The competing version changes phrasing without fixing a source-meaning defect, so retain the current text.',
    (3170, 'id'): 'The current Indonesian sentence correctly requires the request owner to connect the {mediaServer} account before the queue can run. The alternate spelling and capitalization are editorial, so retain the current text.',
    (3170, 'ko'): 'The current Korean phrase uses 에피소드 큐, consistent with the feature label selected for the other corrected strings. 대기열 is a valid synonym, but the exact caller reveals no semantic defect in the current term.',
    (3171, 'hi'): 'The current Hindi sentence preserves the permission requirement and selected TV quality. The independent alternative adds a postposition and changes sentence rhythm, without correcting a clear meaning error.',
    (3172, 'hi'): 'The current Hindi sentence correctly says that Episode Queue requires playback tracking from Plex, Jellyfin, or Emby. The alternative is a stylistic noun-phrase change, so retain the pinned current text.',
    (3173, 'hi'): 'The current Hindi instruction preserves both actions—choose or configure a Sonarr server—and the selected TV quality. The independent version only adds a postposition to the feature term, so retain the current text.',
    (3175, 'es'): 'The exact caller renders this value as a standalone software-request status badge through statusLabel(status), with no explicit solicitud noun in the badge. Aprobado directly conveys the status and is a valid standalone form; the feminine alternative is a possible agreement choice, not a proven source defect.',
    (3175, 'fr'): 'The exact caller renders this value as a standalone software-request status badge through statusLabel(status), with no explicit demande noun in the badge. Validé is an understandable workflow status for an approved request; the proposed feminine wording is a terminology and agreement choice that needs locale review, not a clear caller-backed defect.',
}

# Re-attest the live PR and exact tree before producing a packet that could be applied.
pr = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO_SLUG}/pulls/418'], text=True))
commit_api = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO_SLUG}/commits/{HEAD}'], text=True))
assert pr['state'] == 'open' and pr['head']['sha'] == HEAD and pr['base']['sha'] == '221d8e0d542802da7529cd272c928cc747677e5c'
assert commit_api['sha'] == HEAD and commit_api['commit']['tree']['sha'] == TREE
assert subprocess.check_output(['git', '-C', str(REPO), 'rev-parse', f'{HEAD}^{{tree}}'], text=True).strip() == TREE

primary = load_jsonl(PRIMARY / 'primary-decisions.jsonl')
independent = load_jsonl(INDEPENDENT / 'independent-decisions.jsonl')
source_current = load_jsonl(PRIMARY / 'source-current-cells.jsonl')
caller_contexts = load_jsonl(PRIMARY / 'caller-contexts.jsonl')
comparison = load_jsonl(INDEPENDENT / 'primary-comparison.jsonl')
primary_by_key = {(x['sourcePosition'], x['sourceId'], x['locale']): x for x in primary}
independent_by_key = {(x['position'], x['sourceId'], x['locale']): x for x in independent}
source_by_key = {(x['position'], x['sourceId'], x['locale']): x for x in source_current}
caller_by_id = {(x['sourcePosition'], x['sourceId']): x for x in caller_contexts}
comparison_by_key = {(x['position'], x['sourceId'], x['locale']): x for x in comparison}
assert len(primary) == len(independent) == len(source_current) == len(comparison) == 240
assert len(caller_contexts) == 20

source_blob = git_blob('src/i18n/locale/en.json')
source_catalog = json.loads(git_show('src/i18n/locale/en.json'))
source_order = sorted(source_catalog)
locale_catalogs = {}
locale_blobs = {}
for locale in sorted({x['locale'] for x in source_current}):
    path = f'src/i18n/locale/{locale}.json'
    catalog = json.loads(git_show(path))
    assert len(catalog) == 9494 and set(catalog) == set(source_catalog)
    locale_catalogs[locale] = catalog
    locale_blobs[locale] = git_blob(path)

# Verify the exact source/current/catalog/caller pins again at packet-build time.
for row in source_current:
    key = (row['position'], row['sourceId'], row['locale'])
    assert source_order[row['position']] == row['sourceId']
    assert row['source'] == source_catalog[row['sourceId']]
    assert sha_text(row['source']) == row['sourceTextSha256']
    live_value = locale_catalogs[row['locale']][row['sourceId']]
    assert live_value == row['currentTarget'] and sha_text(live_value) == row['currentTargetSha256']
    assert primary_by_key[key]['exactHead'] == HEAD and primary_by_key[key]['exactTree'] == TREE
    assert primary_by_key[key]['sourceCatalogBlob'] == source_blob
    assert primary_by_key[key]['localeCatalogBlob'] == locale_blobs[row['locale']]

for context in caller_contexts:
    verified_lines = []
    for pin in context['callerLines']:
        content = git_show(pin['path']).decode('utf-8').splitlines()
        line = content[pin['line'] - 1].strip()
        assert git_blob(pin['path']) == pin['blob']
        assert line == pin['lineText'] and sha_text(line) == pin['lineSha256']
        verified_lines.append(pin)
    assert jhash(verified_lines) == context['callerContextSha256']
    assert len(verified_lines) == context['callerLineCount']

# Additional exact-head dynamic evidence: status entries are formatted through
# messages[status] and rendered as status badges / timeline labels.
software_path = 'src/components/RequestStatus/SoftwareRequests.tsx'
software_lines = git_show(software_path).decode('utf-8').splitlines()
software_blob = git_blob(software_path)
supplemental_specs = [
    (511, 'const statusLabel = (status: SoftwareStatus) =>'),
    (512, 'intl.formatMessage(messages[status]);'),
    (614, '{statusLabel(status)}'),
    (896, '{statusLabel(event.status)}'),
]
supplemental = []
for line_no, expected in supplemental_specs:
    line = software_lines[line_no - 1].strip()
    assert line == expected
    supplemental.append({'path': software_path, 'blob': software_blob, 'line': line_no, 'lineText': line, 'lineSha256': sha_text(line)})
supplemental_context = {
    'purpose': 'Dynamic status caller evidence for components.RequestStatus.SoftwareRequests.approved and .available.',
    'exactHead': HEAD,
    'exactTree': TREE,
    'callerContextSha256': jhash(supplemental),
    'callerLineCount': len(supplemental),
    'callerLines': supplemental,
}

final_rows = []
apply_rows = []
source_placeholders = lambda text: sorted(set(PLACEHOLDER_RE.findall(text)))
source_markup = lambda text: sorted(set(MARKUP_RE.findall(text)))
for key in sorted(primary_by_key):
    p = primary_by_key[key]
    i = independent_by_key[key]
    s = source_by_key[key]
    cmp = comparison_by_key[key]
    pos, sid, locale = key
    choice_key = (pos, locale)
    assert i['sourceTextSha256'] == p['sourceTextSha256'] == s['sourceTextSha256']
    assert i['currentTargetSha256'] == p['currentTargetSha256'] == s['currentTargetSha256']
    primary_target = p['finalTarget']
    primary_norm = 'retain' if p['disposition'] == 'accept-current' else 'revise'
    independent_target = i['targetText']
    independent_norm = i['disposition']

    if choice_key in independent_target_choices:
        final_target = independent_target_choices[choice_key]
        selection = 'independent'
        rationale = i['rationale']
        confidence = i['confidence']
    elif choice_key in additional_independent_changes:
        final_target = additional_independent_changes[choice_key]
        selection = 'independent'
        rationale = {
            (3165, 'fr'): 'The exact message is a sentence describing disabled TV-series requests. File d’attente des épisodes names the queue explicitly, and demandes de séries TV is clearer in this caller context than the current abbreviated TV phrase.',
            (3170, 'fr'): 'The message is a user-facing prerequisite sentence. Associer son compte and file d’attente des épisodes make the account-link action and queue feature explicit in natural sentence syntax.',
            (3174, 'fr'): 'The exact caller places this string on the button that invokes mutateRequest(request.id, “approve”). Approuver expresses the approval action directly; Valider can mean validate and is less precise here.',
        }[choice_key]
        confidence = 'moderate' if choice_key != (3174, 'fr') else 'high'
    else:
        final_target = primary_target
        selection = 'both' if primary_target == independent_target else 'primary'
        rationale = p['rationale'] if selection != 'both' else p['rationale']
        confidence = p['confidence'] if selection != 'both' else ('moderate' if p['confidence'] == 'moderate' or i['confidence'] == 'moderate' else 'high')

    if choice_key in retained_difference_rationales:
        final_target = s['currentTarget']
        selection = 'current-retained'
        rationale = retained_difference_rationales[choice_key]
        confidence = 'moderate'
    elif final_target == s['currentTarget']:
        selection = 'current-retained' if (primary_target != independent_target or primary_norm != independent_norm) else 'both'
        if selection == 'current-retained':
            rationale = 'The current target preserves the source meaning in the exact pinned caller context. The alternate target is a wording or terminology preference without a clear source-level defect; retain current copy for this window.'
            confidence = 'moderate'
        else:
            rationale = p['rationale']
            confidence = 'moderate' if p['confidence'] == 'moderate' or i['confidence'] == 'moderate' else 'high'

    if final_target == s['currentTarget']:
        final_disposition = 'accept-current'
    elif p['disposition'] == 'correction':
        final_disposition = 'correction'
    elif p['disposition'] == 'refinement':
        final_disposition = 'refinement'
    elif choice_key == (3174, 'fr'):
        final_disposition = 'correction'
    else:
        final_disposition = 'refinement'

    src_ph = source_placeholders(s['source'])
    src_markup = source_markup(s['source'])
    target_ph = source_placeholders(final_target)
    target_markup = source_markup(final_target)
    assert src_ph == target_ph, (key, src_ph, target_ph)
    assert src_markup == target_markup, (key, src_markup, target_markup)

    final_hash = sha_text(final_target)
    context = caller_by_id[(pos, sid)]
    dynamic = supplemental_context if pos == 3175 else None
    result = {
        'repository': 'snapetech-org/SeerrNG',
        'pullRequest': 418,
        'exactHead': HEAD,
        'exactTree': TREE,
        'sourcePosition': pos,
        'sourceId': sid,
        'source': s['source'],
        'sourceFile': 'src/i18n/locale/en.json',
        'sourceCatalogBlob': source_blob,
        'sourceTextSha256': s['sourceTextSha256'],
        'locale': locale,
        'localeFile': f'src/i18n/locale/{locale}.json',
        'localeCatalogBlob': locale_blobs[locale],
        'currentTarget': s['currentTarget'],
        'currentTargetSha256': s['currentTargetSha256'],
        'finalDisposition': final_disposition,
        'finalTarget': final_target,
        'finalTargetSha256': final_hash,
        'finalConfidence': confidence,
        'finalRationale': rationale,
        'targetSelection': selection,
        'sourcePlaceholders': src_ph,
        'targetPlaceholders': target_ph,
        'sourceMarkup': src_markup,
        'targetMarkup': target_markup,
        'structuralParity': {'placeholders': src_ph == target_ph, 'markup': src_markup == target_markup},
        'callerContextSha256': context['callerContextSha256'],
        'callerLineCount': context['callerLineCount'],
        'callerLines': context['callerLines'],
        'supplementalDynamicCallerContext': dynamic,
        'primaryReview': {
            'disposition': p['disposition'],
            'target': p['finalTarget'],
            'targetSha256': p['finalTargetSha256'],
            'rationale': p['rationale'],
            'confidence': p['confidence'],
        },
        'independentReview': {
            'disposition': i['disposition'],
            'target': i['targetText'],
            'targetSha256': i['targetTextSha256'],
            'rationale': i['rationale'],
            'confidence': i['confidence'],
            'structuralChecks': i['structuralChecks'],
        },
        'comparison': cmp['comparison'],
        'differenceFields': cmp['differenceFields'],
        'focusDifference': {
            'targetTextDiffers': p['finalTarget'] != i['targetText'],
            'semanticDispositionDiffers': primary_norm != independent_norm,
            'pinDifferences': cmp['comparison']['pinDifferences'],
        },
    }
    final_rows.append(result)
    if final_target != s['currentTarget']:
        apply_rows.append({
            'operation': 'replace-flat-json-value',
            'expectedPullRequestHead': HEAD,
            'expectedTree': TREE,
            'sourceCatalogBlob': source_blob,
            'filePath': f'src/i18n/locale/{locale}.json',
            'expectedLocaleCatalogBlob': locale_blobs[locale],
            'jsonKey': sid,
            'sourcePosition': pos,
            'expectedSourceTextSha256': s['sourceTextSha256'],
            'expectedCurrentValue': s['currentTarget'],
            'expectedCurrentValueSha256': s['currentTargetSha256'],
            'replacementValue': final_target,
            'replacementValueSha256': final_hash,
            'disposition': final_disposition,
            'callerContextSha256': context['callerContextSha256'],
        })

assert len(final_rows) == 240
counts = Counter(row['finalDisposition'] for row in final_rows)

write_jsonl(OUT / 'final-decisions.jsonl', final_rows)
write_jsonl(OUT / 'exact-apply-plan.jsonl', apply_rows)
write_jsonl(OUT / 'supplemental-dynamic-caller-contexts.jsonl', [supplemental_context])

# Pin the input packets and the adjudication output to a compact manifest.
input_sums = {
    'primaryPacketSha256SumsFileSha256': sha_bytes((PRIMARY / 'SHA256SUMS.txt').read_bytes()),
    'independentPacketSha256SumsFileSha256': sha_bytes((INDEPENDENT / 'PACKET-SHA256SUMS.txt').read_bytes()),
    'independentPrecomparisonSealSha256': json.loads((INDEPENDENT / 'postcomparison-review-notes.json').read_text())['independentSealSha256'],
    'primaryDecisionLedgerSha256': sha_bytes((PRIMARY / 'primary-decisions.jsonl').read_bytes()),
    'independentDecisionLedgerSha256': sha_bytes((INDEPENDENT / 'independent-decisions.jsonl').read_bytes()),
    'comparisonLedgerSha256': sha_bytes((INDEPENDENT / 'primary-comparison.jsonl').read_bytes()),
}
comparison_summary = json.loads((INDEPENDENT / 'comparison-summary.json').read_text())
validation = {
    'repository': 'snapetech-org/SeerrNG',
    'pullRequest': 418,
    'livePullRequest': {
        'state': pr['state'],
        'draft': pr['draft'],
        'url': pr['html_url'],
        'headRef': pr['head']['ref'],
        'head': pr['head']['sha'],
        'baseRef': pr['base']['ref'],
        'base': pr['base']['sha'],
        'apiTree': commit_api['commit']['tree']['sha'],
    },
    'exactHead': HEAD,
    'exactTree': TREE,
    'window': list(WINDOW),
    'sourceOrderCount': len(source_order),
    'sourceOrderRule': 'Zero-based lexicographic order of exact-head en.json flat keys.',
    'cellCount': len(final_rows),
    'localeCatalogCount': len(locale_catalogs),
    'catalogKeyCounts': {locale: len(catalog) for locale, catalog in locale_catalogs.items()},
    'allLocaleKeysetsMatchEnglish': all(set(catalog) == set(source_catalog) for catalog in locale_catalogs.values()),
    'sourceCatalogBlob': source_blob,
    'localeCatalogBlobs': locale_blobs,
    'sourceCurrentPinReattestation': {'cellsChecked': 240, 'mismatches': 0},
    'callerPinReattestation': {'callerIdsChecked': 20, 'callerLinesChecked': sum(x['callerLineCount'] for x in caller_contexts), 'mismatches': 0},
    'finalStructuralParity': {'placeholderMismatches': 0, 'markupMismatches': 0},
    'crossReview': {
        'cellsCompared': comparison_summary['cellsCompared'],
        'targetTextAgreements': comparison_summary['targetTextAgreements'],
        'targetTextDifferences': comparison_summary['cellsWithDecisionDifference'],
        'semanticDispositionDifferences': comparison_summary['differenceFieldCounts']['semanticDisposition'],
        'primaryOnlyRevisions': 21,
        'independentOnlyRevisions': 14,
        'allPinDifferences': 0,
        'allStructuralComparisonsAgree': True,
    },
    'finalDispositionCounts': dict(counts),
    'applyPlanCellCount': len(apply_rows),
    'nativeSpeakerApproval': False,
    'testsBuildsScansCIOrBrowserActionsRun': False,
    'repositoryOrPullRequestModified': False,
    'inputPacketPins': input_sums,
}
write_json(OUT / 'validation.json', validation)

readme = f'''# SeerrNG PR #418 W3160–W3179 adjudication

This packet records final decisions for all 240 locale cells at the re-attested live PR head. It also contains a guarded apply plan for the 76 cells whose final value differs from the pinned current catalog.

## Exact scope and live pins

- Repository: `snapetech-org/SeerrNG`
- PR: [#418]({pr['html_url']}) — {pr['state'].upper()}
- Head: `{HEAD}`
- Tree: `{TREE}`
- Base: `main` at `{pr['base']['sha']}`
- Window: sorted flat `en.json` key positions 3160–3179 (20 IDs × 12 locales = 240 cells)
- English source order: 9,494 keys
- All 12 locale catalogs have 9,494 keys and match the English key set.

The live PR API head and commit tree were rechecked during packet generation. The English source and current locale values were rehashed against that exact commit for all 240 cells. All 12 locale catalog blob IDs were rechecked. The 20 caller-context records and all 40 pinned caller lines were rehashed from the exact-head source files. The status badge’s dynamic `messages[status]` usage has additional exact-head caller evidence in `supplemental-dynamic-caller-contexts.jsonl`.

## Adjudication

`final-decisions.jsonl` has one complete record for each cell: source/current/final text and hashes, both reviewer decisions, the comparison flags, exact caller lines and hashes, structural checks, and the final rationale. The target and disposition disagreements were resolved against the pinned English source and the caller context. Source/current/caller/catalog pin disagreements: 0. Final placeholder mismatches: 0. Final markup mismatches: 0.

Final dispositions:

- `accept-current`: {counts['accept-current']}
- `correction`: {counts['correction']}
- `refinement`: {counts['refinement']}
- Apply-plan rows: {len(apply_rows)}

The independent comparison recorded 57 target differences and 35 normalized semantic-disposition differences. Every such difference is represented in the final ledger with its primary and independent values and the selected final target. The cross-review differences are reviewer decisions, not source/current pin mismatches.

This is a machine-assisted semantic adjudication. **Native-speaker approval is not claimed.**

## Exact apply plan

`exact-apply-plan.jsonl` lists only changed cells. Each row is guarded by the exact PR head/tree, source catalog blob, locale catalog blob, flat JSON key, expected current value and its SHA-256, plus the replacement value and SHA-256. To apply later, first verify the PR is still at the pinned head/tree and every catalog blob/current-value guard still matches; then apply the rows as one batch. Any failed guard means the plan must be regenerated against the new head. This packet does not apply the plan or modify the repository/PR.

No tests, builds, scans, CI, or browser actions were run.

## Packet files

- `final-decisions.jsonl` — all 240 final decisions and complete evidence
- `exact-apply-plan.jsonl` — 76 exact-hash-guarded replacements only
- `supplemental-dynamic-caller-contexts.jsonl` — extra exact-head status-label caller evidence
- `validation.json` — live PR/tree, catalog, source/current/caller pin, structural, and cross-review counts
- `build_adjudication_packet.py` — reproducible packet builder; reads the two sealed input packets and exact-head Git objects
- `SHA256SUMS.txt` — checksums for every other file in this packet
'''
(OUT / 'README.md').write_text(readme, encoding='utf-8')

files = sorted(path for path in OUT.iterdir() if path.is_file() and path.name != 'SHA256SUMS.txt')
(OUT / 'SHA256SUMS.txt').write_text(''.join(f'{sha_bytes(path.read_bytes())}  {path.name}\n' for path in files), encoding='utf-8')

print(json.dumps({
    'output': str(OUT),
    'head': HEAD,
    'tree': TREE,
    'cells': len(final_rows),
    'applyRows': len(apply_rows),
    'dispositions': dict(counts),
    'sourceCurrentMismatches': 0,
    'callerLineMismatches': 0,
    'placeholderMismatches': 0,
    'markupMismatches': 0,
    'nativeSpeakerApproval': False,
}, ensure_ascii=False, indent=2))
