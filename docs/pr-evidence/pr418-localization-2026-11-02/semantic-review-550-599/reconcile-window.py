#!/usr/bin/env python3
import collections, hashlib, importlib.util, json, re, subprocess
from pathlib import Path

ROOT = Path('/mnt/disks/scratch/task-worktrees/localization-20261030')
OUT = ROOT / 'semantic-results/seerrng-v13-5a434217-strict/manual-reconciliations/semantic-window-550-600-b693'
(OUT/'manual-batches').mkdir(parents=True, exist_ok=True)
BASE = ROOT / 'semantic-results/seerrng-v13-5a434217-strict'
REPO = ROOT / 'seerrng-apply-f67039a778d38912'
RUNNER_PATH = OUT / 'run_seerr_v17_live_b693.py'
CURRENT_HEAD = 'b6935b9f828078a4991b4cbb777b38ef0c0edce5'
CURRENT_TREE = '5006af403fd43976b2957e81bce47d4a3401a230'
APP_SOURCE_TREE = '2471ca52d8b94504879e5842e8ffae920a22e180'

MANUAL = {
    'existing-de-client-0254': {
        'id': 'utils.ApiMessage.m8648ea0141ed4a71e641',
        'target': 'Eine TVDB-ID und mindestens eine Staffelzuordnung sind erforderlich.',
        'reason': 'Use the standard German compound for season mapping; this fixes the malformed gender in the current “Staffelmapping”.',
        'reviewReason': 'Independent exact-head review approved Staffelzuordnung as the natural German term.',
    },
    'existing-de-client-0259': {
        'id': 'utils.ApiMessage.m97ce79cf1b448bb59c9a',
        'target': 'Der Log-Symlink verweist auf einen Pfad außerhalb des Log-Verzeichnisses: {value0}',
        'reason': 'Names the log symlink and states that it points outside the log directory, preserving {value0}.',
        'reviewReason': 'Independent exact-head review approved the Log-Symlink wording for the containment error.',
    },
    'existing-de-client-0260': {
        'id': 'utils.ApiMessage.m9bde48e18fdf8f603a9d',
        'target': 'Das Sonarr-Inventar ist unvollständig oder ungültig; ein sicherer Abgleich vor dem Löschen ist nicht möglich.',
        'reason': 'Uses Abgleich for deletion reconciliation; Abstimmung is a false friend meaning coordination/voting.',
        'reviewReason': 'Independent exact-head review approved the Abgleich wording for unsafe deletion reconciliation.',
    },
    'existing-de-client-0265': {
        'id': 'utils.ApiMessage.maa82785965f41146fadf',
        'target': 'Jede Staffelzuordnung muss zwei Staffelnummern enthalten.',
        'reason': 'Corrects the false compound Staffeluordnung and malformed plural Staffelnnummern.',
        'reviewReason': 'Independent exact-head review approved Staffelzuordnung and Staffelnummern.',
        'additionalCells': [{
            'id': 'utils.ApiMessage.mac9b6118fd805005c14b',
            'target': 'TMDB hat eine ungültige Staffelantwort zurückgegeben.',
            'reason': 'Uses Staffelantwort for a malformed season response; Staffelanfrage incorrectly means season request.',
            'reviewReason': 'Independent exact-head review confirmed response is the rejected data, not a request.',
        }],
    },
    'existing-de-client-0276': {
        'id': 'utils.ApiMessage.mcece9ac3fd00b832e02e',
        'target': 'Der Anbieter kann diese Anfrage in ihrem aktuellen Status nicht abbrechen. Prüfe den Anbieter oder den Download-Client.',
        'reason': 'Uses abbrechen for canceling a request in a current status while preserving the existing informal imperative.',
        'reviewReason': 'Independent exact-head review refined cancellation terminology to abbrechen and kept the existing informal tone.',
    },
    'existing-de-client-0278': {
        'id': 'utils.ApiMessage.md495abc4b8696989481c',
        'target': 'Einstellungsinstanz nicht gefunden',
        'reason': 'Uses the idiomatic singular compound Einstellungsinstanz instead of the awkward plural compound Einstellungeninstanz.',
        'reviewReason': 'Independent exact-head review approved Einstellungsinstanz as the idiomatic singular compound.',
    },
    'existing-de-client-0290': {
        'id': 'utils.ApiMessage.mf9195cbbdabacb3f761d',
        'target': 'Eine BookOrbit-Sammlung verwendet bereits den verwalteten Kobo-Sammlungsnamen.',
        'reason': 'The weak masculine compound Sammlungsname takes accusative n-declension: Sammlungsnamen.',
        'reviewReason': 'Independent exact-head review approved the Sammlungsnamen n-declension.',
        'normalization': 'Attempt 4 returned a top-level array with exact batch IDs; wrapped it in the required decisions object before strict parsing.',
    },
}

spec = importlib.util.spec_from_file_location('seerr_v17_live_b693', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
sha_bytes = lambda b: hashlib.sha256(b).hexdigest()
sha_text = lambda s: sha_bytes(s.encode('utf-8'))
read_json = lambda p: json.loads(Path(p).read_text(encoding='utf-8'))
write_json = lambda p, x: Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Re-attest frozen input and current PR metadata; then validate all 50 selected current cells.
identity, all_batches, availability = runner.input_identity()
selected = all_batches[550:600]
if len(selected) != 50:
    raise SystemExit(f'expected 50 selected batches, got {len(selected)}')
selection_check = runner.validate_live_selected(selected)
if selection_check['selectedCellCount'] != 1568 or not selection_check['selectedCellHashesMatchLive']:
    raise SystemExit(f'live selected-cell attestation failed: {selection_check}')
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip() != CURRENT_HEAD:
    raise SystemExit('live PR worktree head changed')
if subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=REPO,text=True).strip() != CURRENT_TREE:
    raise SystemExit('live PR worktree tree changed')
if subprocess.check_output(['git','status','--porcelain'],cwd=REPO,text=True).strip():
    raise SystemExit('live PR worktree is not clean')

invocation = read_json(BASE/'invocations/range-00550-00600.json')
if (invocation.get('batchStart'),invocation.get('batchStop'),invocation.get('livePrHeadAtRun'),invocation.get('livePrTreeAtRun')) != (550,600,CURRENT_HEAD,CURRENT_TREE):
    raise SystemExit('window invocation metadata does not match pinned range/head/tree')
preflight = read_json(OUT/'preflight.json')
if preflight.get('liveSelectionAttestation') != selection_check:
    raise SystemExit('saved preflight selection attestation differs from recomputed attestation')

# Validate all successful strict runner results against their exact requests and raw responses.
strict_batches = []
manual_batches = []
range_decisions = collections.Counter()
reconciliation_jsonl = []
manual_cell_rows = []
effective_by_batch = {}
selected_ids = [bid for bid,_ in selected]
if set(MANUAL) - set(selected_ids):
    raise SystemExit('manual reconciliation names a batch outside the frozen range')

for batch_id, rows in selected:
    result_path = BASE/'results'/f'{batch_id}.json'
    if result_path.is_file():
        saved = runner.validate_cached(result_path, identity, batch_id, rows)
        decisions = saved['decisions']
        effective_by_batch[batch_id] = decisions
        strict_batches.append(batch_id)
        range_decisions.update(d['verdict'] for d in decisions)
        continue
    if batch_id not in MANUAL:
        raise SystemExit(f'unresolved batch has no strict result or manual adjudication: {batch_id}')

    spec_row = MANUAL[batch_id]
    errors = sorted((BASE/'errors').glob(f'{batch_id}-attempt-*.json'))
    if len(errors) != 4:
        raise SystemExit(f'{batch_id}: expected exactly four preserved terminal attempts, got {len(errors)}')
    error_record = read_json(errors[-1])
    attempt = error_record.get('attempt')
    if attempt != 4:
        raise SystemExit(f'{batch_id}: latest failed attempt is not 4')
    request_path = BASE/'requests'/f'{batch_id}-attempt-{attempt}.json'
    response_path = BASE/'responses'/f'{batch_id}-attempt-{attempt}.json'
    request_doc = read_json(request_path)
    raw_request_rows = json.loads(request_doc['messages'][1]['content'], object_pairs_hook=runner.unique_object)
    if [runner.normalized_row(r) for r in raw_request_rows] != [runner.normalized_row(r) for r in rows]:
        raise SystemExit(f'{batch_id}: attempt-4 request does not match frozen batch rows')
    raw_bytes = response_path.read_bytes()
    response_doc = json.loads(raw_bytes, object_pairs_hook=runner.unique_object)
    content = response_doc['choices'][0]['message']['content'].strip()
    fence = chr(96)*3
    if content.startswith(fence):
        content = re.sub(r'^'+re.escape(fence)+r'(?:json)?\s*|\s*'+re.escape(fence)+r'$', '', content, flags=re.I)
    parsed = json.loads(content, object_pairs_hook=runner.unique_object)
    normalization = spec_row.get('normalization')
    if isinstance(parsed, list) and batch_id == 'existing-de-client-0290':
        parsed = {'decisions': parsed}
        normalization = spec_row['normalization']
    if not isinstance(parsed, dict) or set(parsed) != {'decisions'} or not isinstance(parsed['decisions'], list):
        raise SystemExit(f'{batch_id}: attempt-4 raw output cannot be normalized to one decisions array')
    decisions = parsed['decisions']
    primary_spec = {k:v for k,v in spec_row.items() if k not in ('additionalCells','normalization')}
    manual_specs = [primary_spec] + spec_row.get('additionalCells', [])
    row_by_id = {r['id']:r for r in rows}
    unchanged_ids = {d.get('id') for d in decisions
                     if d.get('verdict') == 'correct' and d.get('id') in row_by_id
                     and d.get('target') == row_by_id[d['id']]['target']}
    expected_manual_ids = {x['id'] for x in manual_specs}
    if unchanged_ids != expected_manual_ids:
        raise SystemExit(f'{batch_id}: unchanged-correction set {sorted(unchanged_ids)} differs from root-adjudicated rows {sorted(expected_manual_ids)}')
    overrides = {}
    manual_cells = []
    for cell_spec in manual_specs:
        matches = [d for d in decisions if d.get('id') == cell_spec['id']]
        if len(matches) != 1:
            raise SystemExit(f"{batch_id}: expected exactly one output for {cell_spec['id']}")
        model_decision = dict(matches[0])
        row = row_by_id.get(cell_spec['id'])
        if row is None or model_decision.get('verdict') != 'correct' or model_decision.get('target') != row['target']:
            raise SystemExit(f"{batch_id}/{cell_spec['id']}: not the exact unchanged-correction case")
        model_decision_sha = runner.canonical_sha(model_decision)
        model_decision['target'] = cell_spec['target']
        model_decision['confidence'] = 'high'
        model_decision['reason'] = cell_spec['reason']
        overrides[cell_spec['id']] = model_decision
        manual_cells.append({
            'schemaVersion':1,'batchId':batch_id,'domain':row['domain'],'locale':row['locale'],'id':row['id'],
            'source':row['source'],'sourceHash':row['sourceHash'],'currentTarget':row['target'],'currentTargetHash':row['targetHash'],
            'modelAttempt':attempt,'modelVerdict':'correct','modelTarget':matches[0].get('target'),
            'modelTargetHash':sha_text(matches[0].get('target','')),'manualTarget':cell_spec['target'],'manualTargetHash':sha_text(cell_spec['target']),
            'manualReason':cell_spec['reason'],'rootReviewReason':cell_spec['reviewReason'],'rootDisposition':'correction-needed',
            'modelDecisionSha256':model_decision_sha,'requestSha256':sha_bytes(request_path.read_bytes()),
            'rawResponseSha256':sha_bytes(raw_bytes),'rootAdjudicationSource':'parent independent exact-head review message',
            'currentPrHead':CURRENT_HEAD,'currentPrTree':CURRENT_TREE,'appSourceTree':APP_SOURCE_TREE,
            'nativeSpeakerApproval':False,'targetsApplied':False,
        })
    decisions = [overrides.get(d.get('id'), d) for d in decisions]
    encoded = json.dumps({'decisions': decisions}, ensure_ascii=False, separators=(',',':'))
    checked = runner.parse_decisions(encoded, rows)
    if len(checked) != len(rows):
        raise SystemExit(f'{batch_id}: strict parser failed full-row coverage after manual override')
    effective_by_batch[batch_id] = checked
    manual_batches.append(batch_id)
    range_decisions.update(d['verdict'] for d in checked)
    manual_cell_rows.extend(manual_cells)
    batch_evidence = {
        'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'batchId':batch_id,
        'currentPrHead':CURRENT_HEAD,'currentPrTree':CURRENT_TREE,'frozenHead':identity['head'],'frozenTree':identity['tree'],
        'semanticManifestSha256':identity['semanticManifestSha256'],'cellPlanSha256':identity['cellPlanSha256'],
        'sourceBundleManifestSha256':identity['sourceBundleManifestSha256'],'batchSha256':runner.batch_hash(batch_id,rows),
        'rowCount':len(rows),'requestFile':str(request_path),'requestSha256':sha_bytes(request_path.read_bytes()),
        'responseFile':str(response_path),'responseSha256':sha_bytes(raw_bytes),'attempt':attempt,
        'terminalRunnerError':error_record.get('error'),'manualNormalization':normalization,
        'manualCellIds':[x['id'] for x in manual_cells],'manualOverrideCount':len(manual_cells),
        'manualCells':manual_cells,'effectiveDecisionsSha256':runner.canonical_sha(checked),'effectiveDecisions':checked,
        'decisionSource':f'strict attempt-4 response with {len(manual_cells)} root-reviewed manual correction(s)',
        'nativeSpeakerApproval':False,'targetsApplied':False,
    }
    manual_path = OUT/'manual-batches'/f'{batch_id}.json'
    write_json(manual_path,batch_evidence)
    reconciliation_jsonl.append(batch_evidence)

if len(strict_batches) != 43 or len(manual_batches) != 7 or len(effective_by_batch) != 50:
    raise SystemExit(f'wrong batch accounting strict={len(strict_batches)} manual={len(manual_batches)}')
if sum(len(effective_by_batch[bid]) for bid in selected_ids) != 1568:
    raise SystemExit('effective decision row count differs from frozen 1568 cells')

# Build the exact-hash proposal ledger for root cross-review, plus a separate uncertainty ledger.
source_paths = {'client':'src/i18n/locale/en.json','server':'server/i18n/locale/en.json'}
source_blobs = {d:subprocess.check_output(['git','rev-parse',f'HEAD:{p}'],cwd=REPO,text=True).strip() for d,p in source_paths.items()}
source_shas = {d:sha_bytes((REPO/p).read_bytes()) for d,p in source_paths.items()}
target_file_by_group = {}
for bid,rows in selected:
    for row in rows:
        domain,locale=row['domain'],row['locale']
        if locale=='de': filename='de'
        elif locale=='es': filename='es'
        else: raise SystemExit(f'unexpected locale in range: {locale}')
        path=f"src/i18n/locale/{filename}.json" if domain=='client' else f"server/i18n/locale/{filename}.json"
        target_file_by_group[(domain,locale)]=path

target_blobs={g:subprocess.check_output(['git','rev-parse',f'HEAD:{p}'],cwd=REPO,text=True).strip() for g,p in target_file_by_group.items()}
target_shas={g:sha_bytes((REPO/p).read_bytes()) for g,p in target_file_by_group.items()}
proposal_rows=[]; held_rows=[]; accepted_rows=[]
for batch_id, rows in selected:
    decisions=effective_by_batch[batch_id]
    by_id={d['id']:d for d in decisions}
    for row in rows:
        d=by_id[row['id']]
        common={
            'schemaVersion':1,'batchId':batch_id,'domain':row['domain'],'locale':row['locale'],'id':row['id'],
            'source':row['source'],'sourceHash':row['sourceHash'],'currentTarget':row['target'],'currentTargetHash':row['targetHash'],
            'sourceFile':source_paths[row['domain']],'sourceCatalogBlob':source_blobs[row['domain']],
            'sourceCatalogFileSha256':source_shas[row['domain']],
            'targetFile':target_file_by_group[(row['domain'],row['locale'])],
            'targetCatalogBlob':target_blobs[(row['domain'],row['locale'])],
            'targetCatalogFileSha256':target_shas[(row['domain'],row['locale'])],
            'livePrHead':CURRENT_HEAD,'livePrTree':CURRENT_TREE,'appSourceTree':APP_SOURCE_TREE,
            'semanticManifestSha256':identity['semanticManifestSha256'],'cellPlanSha256':identity['cellPlanSha256'],
            'batchSha256':runner.batch_hash(batch_id,rows),'nativeSpeakerApproval':False,
        }
        manual_ids_for_batch = ({MANUAL[batch_id]['id']} | {x['id'] for x in MANUAL[batch_id].get('additionalCells', [])}) if batch_id in MANUAL else set()
        decision_source='root-manual-reconciliation' if d['id'] in manual_ids_for_batch else 'strict-runner'
        if d['verdict']=='correct':
            proposed=d['target']
            item={**common,'modelVerdict':d['verdict'],'modelConfidence':d.get('confidence'),'modelReason':d.get('reason'),
                  'proposedTarget':proposed,'proposedTargetHash':sha_text(proposed),'decisionSource':decision_source,
                  'status':'candidate-for-independent-root-cross-review'}
            proposal_rows.append(item)
        elif d['verdict']=='uncertain':
            held_rows.append({**common,'verdict':'uncertain','reason':d['reason'],'status':'held-for-further-review','decisionSource':decision_source})
        else:
            accepted_rows.append({**common,'verdict':'keep','status':'machine-review-accepted-current','decisionSource':decision_source})

proposal_rows.sort(key=lambda x:(x['batchId'],x['id']))
held_rows.sort(key=lambda x:(x['batchId'],x['id']))
accepted_rows.sort(key=lambda x:(x['batchId'],x['id']))
def write_jsonl(path,rows):
    Path(path).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf-8')
write_jsonl(OUT/'manual-adjudications.jsonl',manual_cell_rows)
write_jsonl(OUT/'manual-batch-reconciliations.jsonl',reconciliation_jsonl)
write_jsonl(OUT/'candidate-plan-for-root-cross-review.jsonl',proposal_rows)
write_jsonl(OUT/'held-uncertain-cells.jsonl',held_rows)
write_jsonl(OUT/'accepted-current-machine-decisions.jsonl',accepted_rows)

run_summary=read_json(BASE/'run-summary.json')
failures=run_summary.get('failedBatchesThisInvocation',[])
window_failures=[x for x in failures if x.get('batchId') in MANUAL]
if len(window_failures)!=7:
    raise SystemExit(f'run summary has {len(window_failures)} terminal failures in this window, expected 7')
summary={
 'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,
 'livePrHead':CURRENT_HEAD,'livePrTree':CURRENT_TREE,'appSourceTree':APP_SOURCE_TREE,
 'frozenHead':identity['head'],'frozenTree':identity['tree'],
 'semanticManifestSha256':identity['semanticManifestSha256'],'cellPlanSha256':identity['cellPlanSha256'],
 'sourceBundleManifestSha256':identity['sourceBundleManifestSha256'],
 'window':{'batchStart':550,'batchStopExclusive':600,'batchCount':50,'cellCount':1568},
 'strictRunnerBatches':len(strict_batches),'manuallyReconciledBatches':len(manual_batches),'unresolvedBatches':0,
 'strictRunnerBatchIds':strict_batches,'manualBatchIds':manual_batches,'terminalFailureCountBeforeManualReconciliation':len(window_failures),
 'manualDecisionCount':len(manual_cell_rows),'decisionCounts':dict(range_decisions),
 'candidateCount':len(proposal_rows),'heldUncertainCount':len(held_rows),'acceptedCurrentCount':len(accepted_rows),
 'currentSourceTargetSelectionAttestation':selection_check,
 'runnerScriptSha256':sha_bytes(RUNNER_PATH.read_bytes()),
 'preflightSha256':sha_bytes((OUT/'preflight.json').read_bytes()),
 'invocationSha256':sha_bytes((BASE/'invocations/range-00550-00600.json').read_bytes()),
 'runnerLogSha256':sha_bytes((OUT/'runner.log').read_bytes()),
 'runSummarySha256':sha_bytes((BASE/'run-summary.json').read_bytes()),
 'aggregateRunnerSummary':{k:run_summary.get(k) for k in ('completedBatches','pendingBatches','decisionCounts','targetsApplied','nativeSpeakerReview')},
 'manualAdjudicationsSha256':sha_bytes((OUT/'manual-adjudications.jsonl').read_bytes()),
 'manualBatchReconciliationsSha256':sha_bytes((OUT/'manual-batch-reconciliations.jsonl').read_bytes()),
 'candidatePlanSha256':sha_bytes((OUT/'candidate-plan-for-root-cross-review.jsonl').read_bytes()),
 'heldUncertainSha256':sha_bytes((OUT/'held-uncertain-cells.jsonl').read_bytes()),
 'acceptedCurrentSha256':sha_bytes((OUT/'accepted-current-machine-decisions.jsonl').read_bytes()),
 'targetsApplied':False,'catalogsModified':False,'testsBuildsCiRun':False,'nativeSpeakerApproval':False,
}
write_json(OUT/'range-reconciliation-summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
