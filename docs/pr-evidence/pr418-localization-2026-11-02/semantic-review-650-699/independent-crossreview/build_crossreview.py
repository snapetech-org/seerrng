from __future__ import annotations
import collections, hashlib, importlib.util, json, pathlib, re, subprocess

packet = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-review-window-650-700-422072-20261102')
root_dir = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-root-crossreview-window650-699-422072-20261102')
out = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-independent-crossreview-window650-699-422072-20261102')
repo = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261030/seerrng-review-window-650-700-422072-20261102')
head = '422072d585074bdd7f8dd3046cbacede69203d6d'
tree = 'c7f3bffb628464e98188f3c8f8c4950d6038cee6'

def lines(path):
    return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def sha_text(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()
def git(*args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()

pr = json.loads(subprocess.check_output(['gh','pr','view','418','--repo','snapetech-org/seerrng','--json','state,isDraft,headRefOid,mergeStateStatus,url'], text=True))
assert pr['state'] == 'OPEN' and pr['isDraft'] is True and pr['mergeStateStatus'] == 'CLEAN'
assert pr['headRefOid'] == head, pr
assert git('rev-parse', f'{head}^{{tree}}') == tree
source_catalog = json.loads(subprocess.check_output(['git','-C',str(repo),'show',f'{head}:src/i18n/locale/en.json'],text=True))
target_catalog = json.loads(subprocess.check_output(['git','-C',str(repo),'show',f'{head}:src/i18n/locale/es.json'],text=True))
assert git('rev-parse', f'{head}:src/i18n/locale/en.json') == '12e04a118c30b71b3714291adeaf9fdb2735cee4'
assert git('rev-parse', f'{head}:src/i18n/locale/es.json') == 'bd957ccf3c2d3287aae2086c4c88a40f6c6c967a'

R = lines(root_dir/'root-crossreview-working.jsonl')
C = lines(packet/'candidate-ledger.jsonl')
H = lines(root_dir/'root-held-adjudications.jsonl')
held_inputs = lines(packet/'held-uncertain-cells.jsonl')
ctx = {r['id']: r for r in lines(packet/'source-contexts.jsonl')}
assert len(R) == len(C) == 283 and len(H) == len(held_inputs) == 6
assert [r['id'] for r in R] == [r['id'] for r in C]
assert {r['id'] for r in H} == {r['id'] for r in held_inputs}

helper_path = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261030/translation-tools/run_seerr_v13_translation_adapter_semantic_5a434217.py')
spec = importlib.util.spec_from_file_location('seerr_translation_helper', helper_path)
tr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tr)
tag_re = re.compile(r'</?[A-Za-z][A-Za-z0-9]*(?:\s+[^<>]+)?>')

# Refinements identified in independent caller review.
overrides = {
    'components.LiveTv.RecordingList.requestedBy': (
        'Solicitante',
        'The exact caller renders this as a standalone field label before the requester’s name. “Solicitante” identifies the person and avoids the gendered passive participle in “Solicitado por”.'
    ),
    'components.MagazineDetails.watchlistDeleted': (
        'Se quitó <strong>{title}</strong> de la lista de seguimiento con éxito.',
        'The exact target is a magazine title, whose grammatical gender may be feminine. The root target’s “eliminado” can disagree with {title}; the impersonal construction preserves the meaning and markup without gender agreement.'
    ),
    'components.MagazineDetails.watchlistSuccess': (
        'Se añadió <strong>{title}</strong> a la lista de seguimiento con éxito.',
        'The exact target is a magazine title, whose grammatical gender may be feminine. The root target’s “añadido” can disagree with {title}; the impersonal construction preserves the meaning and markup without gender agreement.'
    ),
    'components.MediaDetails.DetailDisclosure.pin': (
        'Mantener abierta la sección {label} en todas las páginas de detalles.',
        'The pinned component interpolates localized section labels such as “Etiquetas temáticas” and “Colección”. “Abierto” incorrectly imposes masculine singular agreement on {label}; making “la sección” the fixed subject avoids the mismatch while retaining the pinned-open behavior across detail pages.'
    ),
    'components.RequestList.RequestItem.requested': (
        'Fecha de solicitud',
        'The exact caller renders this as a field label immediately before the relative request date and requester. The source label is temporal; “Fecha de solicitud” is clear and avoids treating the request as a masculine-gendered item.'
    ),
    'components.RequestModal.Magazine.requested': (
        'Ya se solicitó',
        'The exact caller renders this as the status of a magazine request. The root target “Solicitado” uses masculine agreement for a feminine magazine; the impersonal status phrase preserves the requested state without gender mismatch.'
    ),
    'components.RequestModal.RequestFooterStatus.requested': (
        'Solicitud enviada',
        'This shared footer status is rendered for book, comic, magazine, music, television, movie, and sports requests. The request itself is feminine; this noun phrase is clear and avoids agreement with the varied media titles.'
    ),
    'components.RequestModal.requested': (
        'Ya se solicitó',
        'The shared modal status is rendered for multiple media types with different grammatical genders. The root target “Solicitado” may disagree with titles such as a series; the impersonal form preserves the already-requested status.'
    ),
    'components.RequestModal.requestpartial': (
        'Solicitudes enviadas: {created}; solicitudes fallidas: {failed}.',
        'The exact key is shared by movie, TV, and music collection modals. The values are numeric counts, so “solicitados/fallidos” leaves the implied noun ambiguous; explicit feminine “solicitudes” makes both counts grammatical and clear.'
    ),
    'components.RequestStatus.SoftwareRequests.submitted': (
        'Solicitud enviada el {date}',
        'The caller displays this in request metadata for PC games and ROMs. “Solicitado {date}” lacks a natural date preposition and can disagree with feminine ROM; the noun phrase is gender-neutral and identifies the request event.'
    ),
}
specific_accepts = {
    'components.RequestList.RequestItem.watchAheadEpisodeBadgeTooltip':
        'Concur: the pinned caller shows this tooltip only on a request with watchAheadParentRequestId, the Episode Queue child request. The implicit subject is an episode (masculine), so “Solicitado automáticamente” agrees.'
}

# Independent review ledger for all 283 candidates.
records = []
for i, (r, c) in enumerate(zip(R, C), 1):
    assert r['id'] == c['id'] and r['source'] == c['source']
    assert r['currentTarget'] == c['currentTarget'] and r['proposedTarget'] == c['proposedTarget']
    assert r['head'] == c['liveHead'] == head and r['tree'] == c['liveTree'] == tree
    assert source_catalog.get(r['id']) == r['source']
    assert target_catalog.get(r['id']) == r['currentTarget']
    for field, value in [('sourceHash', r['source']), ('currentTargetHash', r['currentTarget']), ('proposedTargetHash', r['proposedTarget']), ('rootFinalTargetHash', r['rootFinalTarget'])]:
        assert sha_text(value) == r[field], (i, r['id'], field)
    context = ctx[r['id']]
    assert context['source'] == r['source'] and context['sourceHash'] == r['sourceHash']
    assert context['liveHead'] == head and context['liveTree'] == tree
    assert all(x['fileBlobMatchesLive'] and x['liveFileBlob'] == x['fileBlob'] for x in context['callers'])
    assert tr.icu_signature(r['source']) == tr.icu_signature(r['rootFinalTarget']), (i, r['id'], 'root ICU')
    assert tag_re.findall(r['source']) == tag_re.findall(r['rootFinalTarget']), (i, r['id'], 'root markup sequence')
    required = tr.protected_values(r['source'])
    required_tags = collections.Counter({k:v for k,v in required.items() if tag_re.fullmatch(k)})
    required_literals = collections.Counter({k:v for k,v in required.items() if not tag_re.fullmatch(k)})
    assert collections.Counter(tag_re.findall(r['rootFinalTarget'])) == required_tags, (i, r['id'], 'root tags')
    assert tr.protected_literal_counts(r['rootFinalTarget'], required_literals) == required_literals, (i, r['id'], 'root protected literals')
    if r['rootDisposition'] == 'accept':
        assert r['rootFinalTarget'] == r['proposedTarget']
    if r['id'] in overrides:
        independent_target, rationale = overrides[r['id']]
        independent_disposition = 'refine'
    else:
        independent_target = r['rootFinalTarget']
        independent_disposition = 'accept'
        rationale = specific_accepts.get(r['id'],
            'Concur with root final target after independently checking the English source, current Spanish target, exact-head caller context, and ICU/protected-literal integrity. ' +
            (r['rootRationale'] if r['rootDisposition'] == 'refine' else 'The proposed correction preserves source meaning in this caller context.'))
    assert tr.icu_signature(r['source']) == tr.icu_signature(independent_target), (i, r['id'], 'independent ICU')
    assert tag_re.findall(r['source']) == tag_re.findall(independent_target), (i, r['id'], 'independent tags')
    assert collections.Counter(tag_re.findall(independent_target)) == required_tags, (i, r['id'], 'independent tag counts')
    assert tr.protected_literal_counts(independent_target, required_literals) == required_literals, (i, r['id'], 'independent protected literals')
    records.append({
        'schemaVersion': 1, 'reviewType': 'candidate', 'repository': 'snapetech-org/seerrng', 'pullRequest': 418,
        'locale': 'es', 'window': '650-699', 'candidateOrdinal': i, 'batchId': r['batchId'], 'id': r['id'],
        'head': head, 'tree': tree, 'source': r['source'], 'sourceHash': r['sourceHash'],
        'currentTarget': r['currentTarget'], 'currentTargetHash': r['currentTargetHash'],
        'proposedTarget': r['proposedTarget'], 'proposedTargetHash': r['proposedTargetHash'],
        'rootDisposition': r['rootDisposition'], 'rootFinalTarget': r['rootFinalTarget'], 'rootFinalTargetHash': r['rootFinalTargetHash'],
        'independentDisposition': independent_disposition, 'independentFinalTarget': independent_target,
        'independentFinalTargetHash': sha_text(independent_target), 'agreesWithRootFinal': independent_target == r['rootFinalTarget'],
        'independentRationale': rationale,
        'validation': {'exactLiveCatalogCellMatch': True, 'callerFilesMatchLive': True,
                       'callerCount': context['callsiteCount'], 'callerLocations': [f"{x['path']}:{x['line']}" for x in context['callers']],
                       'icuSignatureMatch': True, 'protectedInlineTagOrderMatch': True, 'protectedLiteralMatch': True,
                       'manualInlineTagException': r['id'] == 'components.RequestModal.QuotaDisplay.quotaLinkUser'}
    })

# Six held cells: independently inspect the values and caller composition. Four existing phrases are grammatical clauses, quota label is gender-neutral, and the mapping text needs its omitted algorithm restored.
for r in H:
    original = next(x for x in held_inputs if x['id'] == r['id'])
    assert r['head'] == head and r['tree'] == tree
    assert source_catalog.get(r['id']) == r['source'] and target_catalog.get(r['id']) == r['currentTarget']
    assert r['source'] == original['source'] and r['currentTarget'] == original['currentTarget']
    for field, value in [('sourceHash',r['source']),('currentTargetHash',r['currentTarget']),('rootFinalTargetHash',r['rootFinalTarget'])]:
        assert sha_text(value) == r[field], (r['id'],field)
    context = ctx[r['id']]
    assert context['source'] == r['source'] and context['sourceHash'] == r['sourceHash']
    assert context['liveHead'] == head and context['liveTree'] == tree
    assert all(x['fileBlobMatchesLive'] and x['liveFileBlob'] == x['fileBlob'] for x in context['callers'])
    assert tr.icu_signature(r['source']) == tr.icu_signature(r['rootFinalTarget'])
    assert tag_re.findall(r['source']) == tag_re.findall(r['rootFinalTarget'])
    required = tr.protected_values(r['source'])
    required_tags = collections.Counter({k:v for k,v in required.items() if tag_re.fullmatch(k)})
    required_literals = collections.Counter({k:v for k,v in required.items() if not tag_re.fullmatch(k)})
    assert collections.Counter(tag_re.findall(r['rootFinalTarget'])) == required_tags
    assert tr.protected_literal_counts(r['rootFinalTarget'], required_literals) == required_literals
    if r['id'] == 'components.MediaDetails.SeasonEpisodeTree.available':
        rationale = 'Agree: this value is interpolated as selectionDescription. The pinned Spanish catalog uses it in “episodios … que {selectionDescription}”; the value “están disponibles” is a clause, so it fits.'
    elif r['id'].startswith('components.MediaDetails.SeasonEpisodeTree.deselect'):
        rationale = 'Agree: SeasonEpisodeTree passes “están disponibles” or “se pueden solicitar” as selectionDescription, and the exact Spanish strings use “que {selectionDescription}”; the relative clause is grammatical.'
    elif r['id'] == 'components.QuotaSelector.unlimited':
        rationale = 'Agree: the value appears as both an option and a standalone profile label across quota types. “Sin límite” avoids agreement with omitted nouns.'
    else:
        rationale = 'Agree: the pinned modal copy must retain both the standard-order/TVDB check and alternate-order/selected-Sonarr-series check; root target restores the omitted distinction.'
    records.append({
        'schemaVersion':1, 'reviewType':'held-uncertain-adjudication', 'repository':'snapetech-org/seerrng', 'pullRequest':418,
        'locale':'es', 'window':'650-699', 'candidateOrdinal':None, 'batchId':r['batchId'], 'id':r['id'],
        'head':head, 'tree':tree, 'source':r['source'], 'sourceHash':r['sourceHash'],
        'currentTarget':r['currentTarget'], 'currentTargetHash':r['currentTargetHash'],
        'proposedTarget':None, 'proposedTargetHash':None,
        'rootDisposition':r['rootDisposition'], 'rootFinalTarget':r['rootFinalTarget'], 'rootFinalTargetHash':r['rootFinalTargetHash'],
        'independentDisposition':'accept', 'independentFinalTarget':r['rootFinalTarget'],
        'independentFinalTargetHash':r['rootFinalTargetHash'], 'agreesWithRootFinal':True,
        'independentRationale':rationale,
        'validation':{'exactLiveCatalogCellMatch':True,'callerFilesMatchLive':True,
                      'callerCount':context['callsiteCount'],'callerLocations':[f"{x['path']}:{x['line']}" for x in context['callers']],
                      'icuSignatureMatch':True,'protectedInlineTagOrderMatch':True,'protectedLiteralMatch':True,
                      'manualInlineTagException':False}
    })

ledger = out/'independent-crossreview.jsonl'
ledger.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in records),encoding='utf-8')
counts = collections.Counter((r['reviewType'],r['independentDisposition']) for r in records)
root_counts = collections.Counter(r['rootDisposition'] for r in R)
summary={
 'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'prUrl':pr['url'],
 'prState':pr['state'],'isDraft':pr['isDraft'],'mergeStateStatus':pr['mergeStateStatus'],
 'liveHead':head,'liveTree':tree,'sourceCatalogBlob':'12e04a118c30b71b3714291adeaf9fdb2735cee4','targetCatalogBlob':'bd957ccf3c2d3287aae2086c4c88a40f6c6c967a',
 'candidateRowsReviewed':len(R),'heldRowsAdjudicated':len(H),'totalRows':len(records),
 'rootCandidateDispositionCounts':dict(root_counts),
 'independentDispositionCounts':{f'{k[0]}:{k[1]}':v for k,v in counts.items()},
 'independentCandidateRefinements':[{'id':r['id'],'target':r['independentFinalTarget'],'targetSha256':r['independentFinalTargetHash'],'rationale':r['independentRationale']} for r in records if r['reviewType']=='candidate' and r['independentDisposition']=='refine'],
 'heldIndependentOutcomes':[{'id':r['id'],'disposition':r['independentDisposition'],'target':r['independentFinalTarget'],'targetSha256':r['independentFinalTargetHash']} for r in records if r['reviewType']=='held-uncertain-adjudication'],
 'validation':'All candidate and held source/current cells match the exact live catalog hashes; each caller context and referenced caller file is pinned to the live head; source/root-final/independent-final ICU signatures match; protected literals and inline tag order/multiplicity match. The single ProfileLink candidate used the packet’s manual exception; tags were checked explicitly in source order.',
 'nativeSpeakerApproval':False,'testsBuildsScansCiRun':False,'repositoryFilesChanged':False
}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'README.md').write_text('''# SeerrNG W650–699 independent cross-review\n\nThis is an independent, scratch-only review of the 283 candidate corrections and six previously held cells for PR #418. It makes no repository or catalog changes.\n\n- PR state at review: OPEN/DRAFT/CLEAN\n- Exact head/tree: `422072d585074bdd7f8dd3046cbacede69203d6d` / `c7f3bffb628464e98188f3c8f8c4950d6038cee6`\n- Source/Spanish catalog blobs: `12e04a118c30b71b3714291adeaf9fdb2735cee4` / `bd957ccf3c2d3287aae2086c4c88a40f6c6c967a`\n- Candidate rows independently reviewed: 283\n- Held cells adjudicated: 6\n- Independent refinements of root candidate targets: 10\n- Independent held-cell outcomes: four accepted unchanged, two accepted with root refinements.\n\n`independent-crossreview.jsonl` records exact source/current/proposed/root-final/independent-final strings and hashes, source/caller pins, structural checks, and reviewer dispositions. `summary.json` records counts and the proposed refinements.\n\nThe candidate and held cells were checked against the live English/Spanish catalogs at the pinned tree, the exact-head caller attestations, ICU signatures, protected literals, and markup order. The manual `ProfileLink` tag-boundary exception is called out in the row validation. Native-speaker approval is not claimed. No tests, builds, scans, CI, releases, tags, merges, or repository edits were performed.\n''',encoding='utf-8')

# Check packet's own frozen checksums without modifying it.
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=packet,stdout=subprocess.DEVNULL)
print('live PR',json.dumps(pr,sort_keys=True))
print('ledger rows',len(records),'candidate refs',sum(r['reviewType']=='candidate' and r['independentDisposition']=='refine' for r in records),'held',len(H))
print('ledger',ledger,'bytes',ledger.stat().st_size)
print('summary',out/'summary.json','bytes',(out/'summary.json').stat().st_size)
