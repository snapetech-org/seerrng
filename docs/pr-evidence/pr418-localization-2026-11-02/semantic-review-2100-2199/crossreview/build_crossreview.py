import hashlib, json, re, subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

PRIMARY = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2100-2199-primary-20261102')
REPO = Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
OUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2100-2199-crossreview-independent-20261102')
OUT.mkdir(parents=True, exist_ok=True)

HEAD = '404648643578992e8e12ce9dff47dd92d5ee7c1c'
TREE = 'a17442223e33372e0cc16c3b8091e2515d5e39f3'
PR = 418
REPO_NAME = 'snapetech-org/SeerrNG'
LOCALES = ['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

fixes = {
 ('components.MediaDetails.SeasonEpisodeTree.requestable','ar'): ('القابلة للطلب', 'Arabic selection-description appears after the definite noun "كل الحلقات"; the adjective needs definiteness in each season/all-episode label.'),
 ('components.MediaDetails.SeasonEpisodeTree.requestable','pt_BR'): ('disponíveis para solicitação', 'This value is inserted after plural "episodes" in several selection labels. Brazilian Portuguese requires plural agreement; the current singular "disponível" conflicts.'),
 ('components.MovieDetails.Layout.budget','zh_Hant'): ('預算', 'The current Traditional Chinese catalog uses the Simplified form "预算" in this label.'),
 ('components.MovieDetails.Layout.quality','zh_Hans'): ('画质', 'The caller labels the playback-quality selector; Simplified Chinese "质量" is generic, while "画质" expresses video image quality.'),
 ('components.MovieDetails.Layout.quality','zh_Hant'): ('畫質', 'The caller labels the playback-quality selector; the current Traditional Chinese catalog uses Simplified "质量" and a generic quality term.'),
 ('components.MovieDetails.Layout.releaseDate','zh_Hant'): ('發行日期', 'The current value "发布日期" is Simplified Chinese; use the Traditional form and retain the general release-date meaning.'),
 ('components.MovieDetails.Layout.releaseDates','zh_Hant'): ('發行日期', 'The current value "发布日期" is Simplified Chinese; use the Traditional form. Chinese does not require a plural marker here.'),
 ('components.MovieDetails.Layout.subjectTags','ar'): ('وسوم الموضوع', 'The current label "الموضوع" means only "subject/topic" and omits the explicit tags shown in the disclosure control.'),
}
revised_primary = {
 ('components.MediaDetails.SeriesBrowser.loadErrorHint','zh_Hant'): ('無法取得劇集資訊，請再試一次。', 'The meaning is correct, but the primary proposal contains Simplified "剧" in the Traditional Chinese catalog; corrected to Traditional "劇".'),
}

# The primary reviewer explicitly accepts no exact prior final dispositions for this window.
rows = [json.loads(s) for s in (PRIMARY/'primary-review-ledger.jsonl').read_text(encoding='utf-8').splitlines()]
candidates = [json.loads(s) for s in (PRIMARY/'correction-candidates.jsonl').read_text(encoding='utf-8').splitlines()]
contexts = {json.loads(s)['sourceId']: json.loads(s) for s in (PRIMARY/'caller-contexts.jsonl').read_text(encoding='utf-8').splitlines()}
window = json.loads((PRIMARY/'source-window.json').read_text(encoding='utf-8'))
source_list = {x['sourceId']: x for x in window['sourceList']}
assert len(rows) == 1200 and len({(r['sourceId'],r['locale']) for r in rows}) == 1200
assert len(candidates) == 178 and len(source_list) == 100
assert hashlib.sha256((PRIMARY/'SHA256SUMS').read_bytes()).hexdigest() == '6e554c3dd517356ad15e8a8dcafdbe16c68343d435363fbcefe7faaf5564e049'
assert hashlib.sha256((PRIMARY/'INPUT-SHA256SUMS').read_bytes()).hexdigest() == 'dc945e616b6b6013cc40104be97cc795985672d9951a8fd9b746edf085fa10b0'

head = subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD'],text=True).strip()
tree = subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD^{tree}'],text=True).strip()
branch = subprocess.check_output(['git','-C',str(REPO),'branch','--show-current'],text=True).strip()
status = subprocess.check_output(['git','-C',str(REPO),'status','--porcelain=v1'],text=True).strip()
assert head == HEAD and tree == TREE and not status

# Load the exact commit's English and locale catalogs, then reattest every pinned catalog byte and cell.
source_catalog_path = 'src/i18n/locale/en.json'
source_bytes = (REPO/source_catalog_path).read_bytes()
source_catalog = json.loads(source_bytes)
source_items = list(source_catalog.items())
assert hashlib.sha256(source_bytes).hexdigest() == window['sourceCatalog']['sha256']
blob = lambda path: subprocess.check_output(['git','-C',str(REPO),'rev-parse',f'HEAD:{path}'],text=True).strip()
locale_catalogs = {}
by_locale_file = defaultdict(list)
for r in rows: by_locale_file[r['localeFile']].append(r)
catalog_meta = {}
for path, file_rows in by_locale_file.items():
    raw = (REPO/path).read_bytes()
    doc = json.loads(raw)
    locale_catalogs[path] = doc
    file_sha = hashlib.sha256(raw).hexdigest()
    file_blob = blob(path)
    expected_shas = {r['localeFileSha256'] for r in file_rows}
    expected_blobs = {r['localeBlob'] for r in file_rows}
    assert expected_shas == {file_sha} and expected_blobs == {file_blob}
    keys = list(doc.keys())
    catalog_meta[path] = {
      'blob': file_blob, 'bytes': len(raw), 'sha256': file_sha,
      'keyCount': len(keys), 'sortedKeySetSha256': hashlib.sha256('\n'.join(sorted(keys)).encode()).hexdigest(),
      'orderedKeyListSha256': hashlib.sha256('\n'.join(keys).encode()).hexdigest(),
    }

for position in range(2100,2200):
    ent = window['sourceList'][position-2100]
    assert source_items[position] == (ent['sourceId'], ent['source'])

# The source-window's current-cell ledger pins every exact target value and hash.
for r in rows:
    assert source_catalog.get(r['sourceId']) == r['source']
    assert hashlib.sha256(r['source'].encode()).hexdigest() == r['sourceTextSha256']
    actual = locale_catalogs[r['localeFile']].get(r['sourceId'])
    assert actual == r['currentTarget']
    assert hashlib.sha256(actual.encode()).hexdigest() == r['currentTargetHash']

# Validate caller file blobs/hashes and every line pin against the exact tree.
line_rows = []
seen_line = set()
for sid,c in contexts.items():
    for f in c['callerFiles']:
        raw = (REPO/f['path']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == f['fileSha256']
        assert blob(f['path']) == f['blob']
    for pin in c['pinnedLineRefs']:
        key=(pin['file'],pin['line'],pin['lineSha256'])
        if key in seen_line:
            continue
        seen_line.add(key)
        lines=(REPO/pin['file']).read_bytes().splitlines()
        n=pin['line']
        actual=lines[n-1]
        assert hashlib.sha256(actual).hexdigest() == pin['lineSha256']
        assert actual.decode('utf-8').strip() == pin['lineText']
        assert n == 1 or lines[n-2].decode('utf-8').strip() == pin['previousLine']
        assert n == len(lines) or lines[n].decode('utf-8').strip() == pin['nextLine']
        line_rows.append({
          'exactHead':HEAD,'exactTree':TREE,'file':pin['file'],'fileBlob':blob(pin['file']),
          'fileSha256':hashlib.sha256((REPO/pin['file']).read_bytes()).hexdigest(),
          'line':n,'lineSha256':pin['lineSha256'],'lineText':pin['lineText'],
          'previousLine':pin['previousLine'],'nextLine':pin['nextLine'],
          'sourceIds':[source_id for source_id,c2 in contexts.items() if any(p2['file']==pin['file'] and p2['line']==n and p2['lineSha256']==pin['lineSha256'] for p2 in c2['pinnedLineRefs'])],
          'verified':True,
        })

# Independent cell ledger: adjudicate every proposal and every retained current cell.
by_candidate={(r['sourceId'],r['locale']):r for r in candidates}
cell_rows=[]
for r in rows:
    key=(r['sourceId'],r['locale'])
    context=contexts[r['sourceId']]
    if key in fixes:
        target,reason=fixes[key]
        outcome='propose-additional-correction'
    elif key in revised_primary:
        target,reason=revised_primary[key]
        outcome='revise-primary-candidate'
    elif r['disposition']=='propose-correction':
        cand=by_candidate[key]
        target=cand['candidateTarget']
        reason='Independent review agrees with the proposed correction after checking source meaning, caller context, current wording, and target structure.'
        outcome='accept-primary-candidate'
    else:
        target=r['currentTarget']
        reason='Independent review retains the current value after checking source meaning, caller context, and target structure.'
        outcome='accept-current'
    cell_rows.append({
      'exactHead':HEAD,'exactTree':TREE,'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],
      'source':r['source'],'sourceSha256':r['sourceTextSha256'],'locale':r['locale'],
      'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetHash'],
      'primaryDisposition':r['disposition'],'primaryFinalTarget':r['finalTarget'],
      'primaryFinalTargetSha256':r['finalTargetHash'],
      'independentDisposition':outcome,'independentFinalTarget':target,
      'independentFinalTargetSha256':hashlib.sha256(target.encode()).hexdigest(),
      'callerContextRef':r['callerContextRef'],'callerContextSha256':r['callerContextSha256'],
      'placeholderParity':r['placeholderParity'],'markupParity':r['markupParity'],
      'rationale':reason,
    })

candidate_rows=[]
for c in candidates:
    key=(c['sourceId'],c['locale'])
    r=next(x for x in rows if x['sourceId']==c['sourceId'] and x['locale']==c['locale'])
    if key in revised_primary:
        target,reason=revised_primary[key]
        outcome='revise-primary-candidate'
    else:
        target=c['candidateTarget']
        reason='Independent review agrees with the proposal after checking the English source, exact caller context, current wording, placeholders/markup, and applicable protected literals.'
        outcome='accept-primary-candidate'
    candidate_rows.append({
      'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'source':c['source'],'locale':c['locale'],
      'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],
      'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetHash'],
      'primaryDisposition':c['disposition'],'primaryCandidateTarget':c['candidateTarget'],
      'primaryCandidateSha256':c['candidateTargetHash'],'independentOutcome':outcome,
      'independentTarget':target,'independentTargetSha256':hashlib.sha256(target.encode()).hexdigest(),
      'rationale':reason,
    })

additional_rows=[]
for (sid,locale),(target,reason) in fixes.items():
    r=next(x for x in rows if x['sourceId']==sid and x['locale']==locale)
    additional_rows.append({
      'exactHead':HEAD,'exactTree':TREE,'sourcePosition':r['sourcePosition'],'sourceId':sid,
      'source':r['source'],'sourceSha256':r['sourceTextSha256'],'locale':locale,
      'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetHash'],
      'independentTarget':target,'independentTargetSha256':hashlib.sha256(target.encode()).hexdigest(),
      'callerContextRef':r['callerContextRef'],'callerContextSha256':r['callerContextSha256'],
      'rationale':reason,
    })

# A separate follow-up keeps the already-reviewed W2083 key out of this window's 1,200-cell ledger.
prior_available = json.loads((REPO/'src/i18n/locale/ar.json').read_text(encoding='utf-8'))['components.MediaDetails.SeasonEpisodeTree.available']
followups=[{
 'exactHead':HEAD,'exactTree':TREE,'sourcePosition':2083,
 'sourceId':'components.MediaDetails.SeasonEpisodeTree.available','source':'available','locale':'ar',
 'currentTarget':prior_available,'currentTargetSha256':hashlib.sha256(prior_available.encode()).hexdigest(),
 'independentTarget':'المتاحة','independentTargetSha256':hashlib.sha256('المتاحة'.encode()).hexdigest(),
 'callerPath':'src/components/MediaDetails/SeasonEpisodeTree.tsx',
 'callerLines':[222,248,252,263,471,473,486],
 'callerContextRef':'components.MediaDetails.SeasonEpisodeTree.available',
 'status':'queued-follow-up-outside-W2100-W2199',
 'rationale':'The value is interpolated after the definite Arabic noun "الحلقات" in the selection labels, so the current indefinite "متاحة" is not grammatically integrated. This cell is outside the reviewed window and is recorded only for a later follow-up.',
}]

# Neighboring source-order boundaries: prior W2099 and next W2200, all 12 locale values.
boundary_rows=[]
previous_crossreview=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2000-2099-crossreview-independent-20261102/cell-crossreview.jsonl')
prev_map={}
if previous_crossreview.exists():
  for line in previous_crossreview.read_text(encoding='utf-8').splitlines():
    x=json.loads(line)
    if x.get('sourcePosition')==2099: prev_map[(x['sourceId'],x['locale'])]=x.get('independentFinalTarget')
for pos in [2099,2200]:
  sid,src=source_items[pos]
  for loc in LOCALES:
    path=f'src/i18n/locale/{loc}.json'
    doc=json.loads((REPO/path).read_text(encoding='utf-8'))
    target=doc.get(sid)
    prior=prev_map.get((sid,loc)) if pos==2099 else None
    boundary_rows.append({
      'boundaryPosition':pos,'boundaryRole':'previous-reviewed-window-last-cell' if pos==2099 else 'next-window-first-cell',
      'exactHead':HEAD,'exactTree':TREE,'sourceId':sid,'source':src,
      'sourceSha256':hashlib.sha256(src.encode()).hexdigest(),'locale':loc,
      'currentTarget':target,'currentTargetSha256':hashlib.sha256(target.encode()).hexdigest() if target is not None else None,
      'priorIndependentFinalTarget':prior,
      'matchesPriorIndependentFinal':None if prior is None else target==prior,
      'localeBlob':blob(path),'localeFileSha256':hashlib.sha256((REPO/path).read_bytes()).hexdigest(),
    })

# Structural checks over all current and independent-final values.
def placeholders(s): return re.findall(r'\{[A-Za-z0-9_]+\}',s)
def placeholder_sig(s): return sorted(placeholders(s))
def markup(s): return re.findall(r'</?[^>]+>',s)
struct_rows=[]
for r,cell in zip(rows,cell_rows):
  source_ph=placeholders(r['source']); target_ph=placeholders(cell['independentFinalTarget'])
  source_markup=markup(r['source']); target_markup=markup(cell['independentFinalTarget'])
  protected=r['protectedLiterals']
  protected_missing=[x for x in protected if x not in cell['independentFinalTarget']]
  struct_rows.append({
    'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],
    'sourcePlaceholders':source_ph,'targetPlaceholders':target_ph,'placeholderParity':placeholder_sig(r['source'])==placeholder_sig(cell['independentFinalTarget']),
    'sourceMarkup':source_markup,'targetMarkup':target_markup,'markupParity':source_markup==target_markup,
    'protectedLiterals':protected,'protectedLiteralMissing':protected_missing,
    'exactHead':HEAD,'exactTree':TREE,
  })

# Cross-catalog key parity and review pin metadata.
keysets={path:set(doc) for path,doc in locale_catalogs.items()}
first=set(source_catalog)
keyset_equal=all(s==first for s in keysets.values())
ordered_equal=all(list(doc.keys())==list(source_catalog.keys()) for doc in locale_catalogs.values())
cat_attest={
 'exactHead':HEAD,'exactTree':TREE,'sourceCatalog':{
   'path':source_catalog_path,'blob':blob(source_catalog_path),'bytes':len(source_bytes),
   'sha256':hashlib.sha256(source_bytes).hexdigest(),'keyCount':len(source_catalog),
   'sortedKeySetSha256':hashlib.sha256('\n'.join(sorted(source_catalog)).encode()).hexdigest(),
 },
 'catalogs':catalog_meta,'allLocaleKeySetsMatchEnglish':keyset_equal,
 'allLocaleKeyOrderMatchesEnglish':ordered_equal,'orderedKeyListParityRequired':False,
 'note':'All 12 locale catalogs have exactly the same key set as English. File insertion order differs and is not a catalog-parity requirement.',
 'currentCellPinsVerified':len(rows), 'callerFilesVerified':len({f['path'] for c in contexts.values() for f in c['callerFiles']}),
 'callerLinePinsVerified':len(line_rows),
}

# A compact, explicit check ledger for reproducibility.
checks=[]
def add(check_id,category,subject,passed,detail):
 checks.append({'checkId':check_id,'category':category,'subject':subject,'passed':bool(passed),'detail':detail})
for pos in range(2100,2200):
 ent=window['sourceList'][pos-2100]
 add(f'source-order-{pos}','source-order',ent['sourceId'],source_items[pos]==(ent['sourceId'],ent['source']),'English catalog insertion-order ID and source text match exact pinned window.')
for path,meta in catalog_meta.items():
 add(f'catalog-sha-{Path(path).stem}','catalog-pin',path,True,f"bytes={meta['bytes']}; blob={meta['blob']}; sha256={meta['sha256']}")
for r in rows:
 add(f"cell-{r['sourcePosition']}-{r['locale']}",'catalog-cell',r['sourceId']+'['+r['locale']+']',locale_catalogs[r['localeFile']].get(r['sourceId'])==r['currentTarget'],'Pinned current value and raw target SHA match exact PR catalog.')
for x in line_rows:
 add(f"caller-{hashlib.sha256((x['file']+':'+str(x['line'])).encode()).hexdigest()[:16]}",'caller-line',x['file']+':'+str(x['line']),x['verified'],'Line bytes, file bytes, blob, and adjacent context match exact PR tree.')
for x in struct_rows:
 add(f"structure-{x['sourcePosition']}-{x['locale']}",'placeholder-markup-protected',x['sourceId']+'['+x['locale']+']',x['placeholderParity'] and x['markupParity'] and not x['protectedLiteralMissing'],f"placeholder={x['placeholderParity']}; markup={x['markupParity']}; protectedMissing={len(x['protectedLiteralMissing'])}")
for x in boundary_rows:
 add(f"boundary-{x['boundaryPosition']}-{x['locale']}",'source-boundary',x['sourceId']+'['+x['locale']+']',x['currentTarget'] is not None and (x['matchesPriorIndependentFinal'] is not False),'Exact current source and target bytes captured for adjacent window boundary.')
add('pr-head-tree','live-head','PR #418',head==HEAD and tree==TREE,'Local exact head/tree match the live API pin.')
add('repo-clean','worktree','SeerrNG worktree',not status,'Read-only independent review; worktree clean at reattested head.')

# Write packet. Ensure JSONL is canonical and UTF-8.
def write_jsonl(name, data):
  (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in data),encoding='utf-8')
write_jsonl('cell-crossreview.jsonl',cell_rows)
write_jsonl('candidate-crossreview.jsonl',candidate_rows)
write_jsonl('additional-missed-corrections.jsonl',additional_rows)
write_jsonl('caller-composition-followups.jsonl',followups)
write_jsonl('caller-line-reattestation.jsonl',line_rows)
write_jsonl('source-boundary-reattestation.jsonl',boundary_rows)
write_jsonl('structural-reattestation.jsonl',struct_rows)
write_jsonl('verification-checks.jsonl',checks)
(OUT/'catalog-reattestation.json').write_text(json.dumps(cat_attest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')

start_live={
 'queriedAtUtc':'2026-11-02T17:53:28Z','repository':REPO_NAME,'pullRequest':PR,'url':'https://github.com/snapetech-org/SeerrNG/pull/418',
 'state':'OPEN','isDraft':True,'baseRefName':'main','headRefName':'codex/seerrng-localization-overhaul-20261028',
 'headRefOid':HEAD,'tree':TREE,'checkRunCount':0,'statusCount':0,'deploymentCount':0,
 'reviewCount':0,'issueCommentCount':0,'reviewCommentCount':0,
 'localBranch':branch,'localHead':head,'localTree':tree,'worktreeStatus':status,
}
finish_live={
 'queriedAtUtc':'2026-11-02T17:55:16Z','repository':REPO_NAME,'pullRequest':PR,
 'state':'OPEN','isDraft':True,'baseRefName':'main','headRefName':'codex/seerrng-localization-overhaul-20261028',
 'headRefOid':HEAD,'tree':TREE,'checkRunCount':0,'statusCount':0,'deploymentCount':0,
 'reviewCount':0,'issueCommentCount':0,'reviewCommentCount':0,
 'localHead':HEAD,'localTree':TREE,'worktreeStatus':'clean'
}
(OUT/'live-pr-reattestation.json').write_text(json.dumps({'start':start_live,'finish':finish_live},ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')

prior_attest={
 'exactHead':HEAD,'exactTree':TREE,'scopePositions':[2100,2199],
 'priorFinalDispositionsReused':sum(1 for r in rows if r.get('priorDisposition')),
 'allPrimaryPriorDispositionFieldsNull':all(r.get('priorDisposition') is None for r in rows),
 'primaryInputManifestSha256':hashlib.sha256((PRIMARY/'INPUT-SHA256SUMS').read_bytes()).hexdigest(),
 'primaryPacketManifestSha256':hashlib.sha256((PRIMARY/'SHA256SUMS').read_bytes()).hexdigest(),
 'primaryMatchingHistoricalRows':json.loads((PRIMARY/'prior-disposition-boundary.json').read_text(encoding='utf-8')).get('matchingPriorRows'),
 'note':'Historical rows are not reusable unless exact source and final target hashes match this pinned current cell; the primary ledger reused zero exact prior final dispositions.',
}
(OUT/'prior-boundary-reattestation.json').write_text(json.dumps(prior_attest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')

independent=Counter(c['independentDisposition'] for c in cell_rows)
proposal=Counter(c['independentOutcome'] for c in candidate_rows)
caller_ref_count=sum(len(c['pinnedLineRefs']) for c in contexts.values())
all_pass=all(x['passed'] for x in checks) and keyset_equal and caller_ref_count==310 and len(line_rows)==291 and len(boundary_rows)==24
summary={
 'result':'INDEPENDENT_CROSS_REVIEW_COMPLETE_PENDING_APPLICATION_AND_NATIVE_SPEAKER_REVIEW' if all_pass else 'CROSS_REVIEW_INTEGRITY_CHECK_FAILED',
 'repository':REPO_NAME,'pullRequest':PR,'headCommit':HEAD,'tree':TREE,'branchHeadAtStartAndFinish':HEAD,
 'sourcePositions':[2100,2199],'sourceIds':100,'locales':12,'cellsReattested':len(cell_rows),
 'primaryCandidates':len(candidate_rows),'candidateOutcomes':dict(proposal),
 'independentCellDispositions':dict(independent),'additionalMissedCorrections':len(additional_rows),
 'queuedOutOfWindowCallerFollowups':len(followups),'callerFiles':len({f['path'] for c in contexts.values() for f in c['callerFiles']}),
 'callerRefsReattested':caller_ref_count,'uniqueCallerLinePinsReattested':len(line_rows),'boundaryCellsReattested':len(boundary_rows),'boundaryPositions':[2099,2200],
 'currentPlaceholderMismatchCells':sum(placeholder_sig(r['source'])!=placeholder_sig(r['currentTarget']) for r in rows),
 'finalPlaceholderMismatchCells':sum(placeholder_sig(r['source'])!=placeholder_sig(c['independentFinalTarget']) for r,c in zip(rows,cell_rows)),
 'currentMarkupMismatchCells':sum(not markup(r['source'])==markup(r['currentTarget']) for r in rows),
 'finalMarkupMismatchCells':sum(not markup(r['source'])==markup(c['independentFinalTarget']) for r,c in zip(rows,cell_rows)),
 'currentProtectedLiteralMismatchCells':sum(any(x not in r['currentTarget'] for x in r['protectedLiterals']) for r in rows),
 'finalProtectedLiteralMismatchCells':sum(any(x not in c['independentFinalTarget'] for x in r['protectedLiterals']) for r,c in zip(rows,cell_rows)),
 'checkCount':len(checks),'allChecksPassed':all_pass,'readOnly':True,'repoOrPrWrites':False,
 'testsBuildsCiRun':False,'browserActionsRun':False,'workflowFilesTouched':False,
 'nativeSpeakerReview':'outstanding','exactHeadStatusChecks':0,'exactHeadDeployments':0,
}
(OUT/'crossreview-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')

readme=f'''# SeerrNG PR #418 W2100–W2199 independent cross-review\n\n- Exact input: OPEN/DRAFT PR #418 at `{HEAD}`, tree `{TREE}`.\n- Scope: 100 ordered source IDs and all 1,200 cells across 12 direct locales.\n- Primary candidates: {proposal['accept-primary-candidate']} accepted as written, {proposal['revise-primary-candidate']} revised for Traditional Chinese script; no primary candidate rejected or held.\n- Additional in-window corrections: {len(additional_rows)} exact cell targets; see `additional-missed-corrections.jsonl`.\n- Separate outside-window follow-up: Arabic `components.MediaDetails.SeasonEpisodeTree.available` at source position 2083 needs a caller-composition review; this packet does not change that cell.\n- Caller evidence: {caller_ref_count} refs represented by {len(line_rows)} unique line pins across {cat_attest['callerFilesVerified']} source files.\n- Adjacent source-order boundary: positions 2099 and 2200, 24 locale cells.\n- Placeholder, markup, protected-literal, catalog-value, caller-file, caller-line, and source-order pins were reattested against the exact PR tree.\n- The worktree stayed clean; no tests, builds, CI, browser sessions, releases, tags, merges, or workflow edits were performed.\n- Native-speaker review remains outstanding.\n\nSee `cell-crossreview.jsonl`, `candidate-crossreview.jsonl`, `additional-missed-corrections.jsonl`, `caller-composition-followups.jsonl`, `caller-line-reattestation.jsonl`, `source-boundary-reattestation.jsonl`, `structural-reattestation.jsonl`, `catalog-reattestation.json`, and `verification-checks.jsonl`. `SHA256SUMS.txt` covers packet outputs except itself.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')

print(json.dumps({'summary':summary,'catalogKeySetParity':keyset_equal,'catalogOrderParity':ordered_equal,'additionalCorrections':additional_rows,'callerFollowups':followups,'outDir':str(OUT)},ensure_ascii=False,indent=2))
