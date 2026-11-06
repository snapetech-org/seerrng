import collections
import hashlib
import json
import pathlib
import re
import shutil
import subprocess

ROOT = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-batch-0000-0399')
PRIMARY = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-0900-0999-20261102')
OUT = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-crossreview-0900-0999-20261102')
PRIMARY_COPY = OUT / 'primary-packet'
HEAD = '18001c2d09d5d271bd4fe2ad22189c29d069a457'
TREE = '7a9f3218d79501fb620329f0e53c1a0b3dd44508'
REPO = 'snapetech-org/seerrng'
PR = 418

MISSES = {
    ('components.Discover.DiscoverMovies.studioMovies', 'ar'): {
        'target': 'أفلام {studio}', 'confidence': 'moderate',
        'reason': 'The current Arabic noun order and definite article are unnatural for “{studio} Movies”; put the films first and name the studio after them.'},
    ('components.Discover.DiscoverMovies.studioMovies', 'hi'): {
        'target': '{studio} की फ़िल्में', 'confidence': 'moderate',
        'reason': '“{studio} सिनेमा” reads as a cinema/theater associated with the studio; this names the studio’s films.'},
    ('components.Discover.DiscoverMusic.recommended', 'zh-TW'): {
        'target': '推薦', 'confidence': 'high',
        'reason': 'The current string uses the Simplified character 荐 in the Traditional Chinese catalog.'},
    ('components.Discover.DiscoverSliderEdit.deletefail', 'vi'): {
        'target': 'Không thể xóa dải nội dung.', 'confidence': 'moderate',
        'reason': 'The current “con trượt” means a physical slider; caller context is a Discover content rail being deleted.'},
    ('components.Discover.DiscoverSliderEdit.deletefail', 'zh-CN'): {
        'target': '删除内容轮播失败。', 'confidence': 'moderate',
        'reason': '“滑动框” suggests a sliding control; caller context is a Discover content carousel, matching the clearer term already proposed for the success message.'},
    ('components.Discover.DiscoverSliderEdit.deletefail', 'zh-TW'): {
        'target': '刪除內容輪播失敗。', 'confidence': 'moderate',
        'reason': '“模塊” means module and loses the Discover content-carousel meaning.'},
    ('components.Discover.DiscoverSports.search', 'zh-TW'): {
        'target': '搜尋 Sportarr 聯賽', 'confidence': 'high',
        'reason': 'This searches sports leagues; 聯盟 means an alliance rather than the competitions listed by Sportarr.'},
    ('components.Discover.DiscoverSports.suggested', 'zh-TW'): {
        'target': '建議搜尋', 'confidence': 'high',
        'reason': 'The current Traditional Chinese catalog value is entirely Simplified Chinese.'},
    ('components.Discover.DiscoverSports.unavailable', 'zh-TW'): {
        'target': '目前無法瀏覽 Sportarr 聯賽。', 'confidence': 'high',
        'reason': 'This message is about sports leagues; 聯盟 means an alliance rather than a league/competition.'},
    ('components.Discover.DiscoverTv.networkSeries', 'ar'): {
        'target': 'مسلسلات {network}', 'confidence': 'high',
        'reason': 'Arabic puts the series noun before the network modifier; the current target also uses singular سلسلة for plural Series.'},
    ('components.Discover.DiscoverTvGenre.genreSeries', 'ar'): {
        'target': 'مسلسلات من نوع {genre}', 'confidence': 'high',
        'reason': 'Arabic places the plural series noun before its genre; the current genre-first phrase is not a natural noun phrase.'},
    ('components.Discover.DiscoverTvKeyword.keywordSeries', 'ar'): {
        'target': 'مسلسلات مرتبطة بـ{keywordTitle}', 'confidence': 'high',
        'reason': 'The current target uses singular مسلسل and places the keyword before the series noun; this names series associated with that keyword.'},
    ('components.Discover.DiscoverTvLanguage.languageSeries', 'ar'): {
        'target': 'مسلسلات باللغة {language}', 'confidence': 'high',
        'reason': 'Arabic places the series noun before the language modifier; the current target has unnatural modifier order.'},
}

REFINES = {
    ('components.Discover.DiscoverTvKeyword.keywordSeries', 'fr'): {
        'target': 'Séries correspondant à {keywordTitle}', 'confidence': 'moderate',
        'reason': 'The caller passes a TMDB keyword; “correspondant à” states that the displayed series match that keyword more precisely than “pour”.'},
}

HOLD = {
    ('components.Discover.DiscoverTmdbList.list', 'ar'):
        'The value “TMDB القائمة” is understandable in mixed-script UI, but the Arabic noun order is awkward; hold for native-speaker confirmation of the preferred product-label style (likely “قائمة TMDB”).'
}

# Tracked-file reads are taken from the pinned Git tree, not mutable worktree files.
_git_cache = {}
def git_bytes(path):
    if path not in _git_cache:
        _git_cache[path] = subprocess.check_output(['git', 'show', f'{HEAD}:{path}'], cwd=ROOT)
    return _git_cache[path]
def git_blob(path):
    return subprocess.check_output(['git', 'rev-parse', f'{HEAD}:{path}'], cwd=ROOT, text=True).strip()
def sha(b):
    return hashlib.sha256(b).hexdigest()
def write_jsonl(path, rows):
    path.write_text(''.join(json.dumps(r, ensure_ascii=False, sort_keys=True) + '\n' for r in rows))
def icu_names(value):
    found = set()
    depth = 0
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == '{':
            if depth == 0:
                j = i + 1
                while j < len(value) and value[j] not in ',}':
                    j += 1
                name = value[i + 1:j].strip()
                if name:
                    found.add(name)
            depth += 1
        elif ch == '}':
            depth = max(0, depth - 1)
        i += 1
    return sorted(found)
def markup(value):
    return sorted(set(re.findall(r'</?[A-Za-z][^>]*>', value)))

checksum_check=subprocess.run(['sha256sum','-c','SHA256SUMS'],cwd=PRIMARY,text=True,capture_output=True)
assert checksum_check.returncode==0, checksum_check.stdout + checksum_check.stderr
manifest = json.loads((PRIMARY / 'manifest.json').read_text())
primary_summary = json.loads((PRIMARY / 'summary.json').read_text())
source_rows = [json.loads(x) for x in (PRIMARY / 'selected-direct-locale-cells.jsonl').read_text().splitlines() if x.strip()]
att_rows = [json.loads(x) for x in (PRIMARY / 'source-current-attestation.jsonl').read_text().splitlines() if x.strip()]
ledger = [json.loads(x) for x in (PRIMARY / 'primary-review-ledger.jsonl').read_text().splitlines() if x.strip()]
caller_rows = [json.loads(x) for x in (PRIMARY / 'caller-context-attestation.jsonl').read_text().splitlines() if x.strip()]
source_context_rows = [json.loads(x) for x in (PRIMARY / 'source-contexts.jsonl').read_text().splitlines() if x.strip()]
assert len(source_rows) == len(att_rows) == len(ledger) == 1200
assert len(source_context_rows) == 100 and len(caller_rows) == 218
assert manifest['head'] == HEAD and manifest['tree'] == TREE
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() == HEAD
assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip() == TREE
assert subprocess.check_output(['git','rev-parse','HEAD:src/i18n/locale/en.json'],cwd=ROOT,text=True).strip() == manifest['sourceCatalog']['blob']

# Verify every source/current cell against the exact catalog blobs and recompute its hashes.
source_catalog = json.loads(git_bytes(manifest['sourceCatalog']['path']))
assert sha(git_bytes(manifest['sourceCatalog']['path'])) == manifest['sourceCatalog']['sha256']
target_catalogs = {}
for locale, info in manifest['targetCatalogs'].items():
    blob = git_blob(info['path'])
    raw = git_bytes(info['path'])
    assert blob == info['fileBlob'], (locale, blob, info['fileBlob'])
    assert sha(raw) == info['fileSha256'], (locale, sha(raw), info['fileSha256'])
    catalog = json.loads(raw)
    assert len(catalog) == info['keyCount'] == 9494
    target_catalogs[locale] = catalog
assert sha(git_bytes(manifest['sourceCatalog']['path'])) == manifest['sourceCatalog']['sha256']

src_by_pos = collections.defaultdict(set)
rows_by_id = {}
for r in source_rows:
    pos = r['sourceIdPosition']
    sid = r['sourceId']
    src_by_pos[pos].add(sid)
    rows_by_id[(sid,r['locale'])] = r
    source_value = source_catalog[sid]
    assert source_value == r['source']
    assert sha(source_value.encode('utf-8')) == r['sourceSha256']
    assert r['sourceFileBlob'] == manifest['sourceCatalog']['blob']
    assert git_blob(r['sourceFile'] if 'sourceFile' in r else manifest['sourceCatalog']['path']) == manifest['sourceCatalog']['blob']
    info = manifest['targetCatalogs'][r['locale']]
    assert r['targetFile'] == info['path'] and r['targetFileBlob'] == info['fileBlob']
    current = target_catalogs[r['locale']][sid]
    assert current == r['target']
    assert sha(current.encode('utf-8')) == r['targetSha256']
    att = next(a for a in att_rows if a['sourceId']==sid and a['locale']==r['locale'])
    assert att['attestedHead']==HEAD and att['attestedTree']==TREE
    assert att['sourceMatchesCurrentHead'] and att['targetMatchesCurrentHead']
    assert att['sourceHash']==r['sourceSha256'] and att['currentTargetHash']==r['targetSha256']
assert set(src_by_pos) == set(range(900,1000))
assert all(len(v)==1 for v in src_by_pos.values())
assert all(sum(1 for r in source_rows if r['sourceIdPosition']==p)==12 for p in range(900,1000))
assert len({r['sourceId'] for r in source_rows}) == 100
assert len({(r['sourceId'],r['locale']) for r in source_rows}) == 1200

# Independently re-attest every caller file/blob/line and neighboring source context.
caller_attest = []
ctx_by_source = {r['sourceId']:r for r in source_context_rows}
for c in caller_rows:
    assert c['attestedHead']==HEAD and c['attestedTree']==TREE
    raw = git_bytes(c['path'])
    lines = raw.decode('utf-8').splitlines()
    assert git_blob(c['path']) == c['fileBlob']
    assert sha(raw) == c['fileSha256']
    idx = c['line'] - 1
    line = lines[idx]
    prev = lines[idx-1] if idx > 0 else ''
    nxt = lines[idx+1] if idx+1 < len(lines) else ''
    assert line == c['lineText'], (c['path'], c['line'], repr(line), repr(c['lineText']))
    assert sha(line.encode('utf-8')) == c['lineSha256']
    assert prev == c['previousLine'] and nxt == c['nextLine'], (c['path'], c['line'], prev, c['previousLine'], nxt, c['nextLine'])
    assert c['matchedAtCurrentHead'] is True
    context = ctx_by_source[c['sourceId']]
    assert any(x['path']==c['path'] and x['line']==c['line'] and x['lineText']==line for x in context['callers'])
    caller_attest.append({
        'sourceId':c['sourceId'],'sourceIdPosition':c['sourceIdPosition'],'path':c['path'],'line':c['line'],
        'kind':c['kind'],'fileBlob':git_blob(c['path']),'fileSha256':sha(raw),
        'lineText':line,'lineSha256':sha(line.encode('utf-8')),
        'previousLine':prev,'nextLine':nxt,'attestedHead':HEAD,'attestedTree':TREE,
        'currentHeadMatch':True,'neighborContextMatch':True,
    })
assert len(caller_attest)==218

ledger_by_id={(r['sourceId'],r['locale']):r for r in ledger}
assert len(ledger_by_id)==1200
assert collections.Counter(r['status'] for r in ledger)=={'accept-current':973,'correction-needed':227}
assert collections.Counter(r['routingDisposition'] for r in ledger)=={'new-semantic-review-required':1200}
assert not any(r['priorDispositionPreserved'] for r in ledger)
assert all(r['targetPresent'] for r in ledger)
assert all(r['liveHead']==HEAD and r['liveTree']==TREE for r in ledger)

# Derive brand/protected literals from source-level product names used in this window.
known_literals = ['Sportarr','IPTV Tunerr','Tunerr','DVR','TMDB','Plex']

cross_rows=[]
review_counts=collections.Counter()
proposal_review_counts=collections.Counter()
per_locale=collections.defaultdict(collections.Counter)
verification_failures=[]
for (sid,locale), cell in rows_by_id.items():
    r=ledger_by_id[(sid,locale)]
    status=r['status']
    source=r['source']
    current=r['currentTarget']
    proposed=r['proposedTarget'] if status=='correction-needed' else None
    current_hash=sha(current.encode('utf-8'))
    assert current_hash==r['currentTargetHash']==cell['targetSha256']
    assert sha(source.encode('utf-8'))==r['sourceHash']==cell['sourceSha256']
    if proposed is not None:
        assert sha(proposed.encode('utf-8'))==r['proposedTargetHash']
        assert icu_names(source)==icu_names(proposed)
        assert markup(source)==markup(proposed)
    assert icu_names(source)==icu_names(current)
    assert markup(source)==markup(current)
    for lit in known_literals:
        if lit in source:
            if proposed is not None:
                if lit not in proposed:
                    verification_failures.append({'id':r['id'],'where':'primary-proposal','literal':lit})
            elif lit not in current:
                verification_failures.append({'id':r['id'],'where':'accept-current','literal':lit})
    override=MISSES.get((sid,locale)) or REFINES.get((sid,locale))
    held=(sid,locale) in HOLD
    if (sid,locale) in MISSES:
        cross='missed'
        final=override['target']
        reason=override['reason']
        confidence=override['confidence']
    elif (sid,locale) in REFINES:
        cross='refine'
        final=override['target']
        reason=override['reason']
        confidence=override['confidence']
    elif held:
        cross='hold'
        final=None
        reason=HOLD[(sid,locale)]
        confidence='low'
    elif status=='correction-needed':
        cross='accept'
        final=proposed
        reason='Primary correction preserves the source meaning and caller-specific use.'
        confidence=r.get('confidence','moderate')
    else:
        cross='accept'
        final=current
        reason='Current translation preserves the source meaning in its caller context.'
        confidence='moderate'
    final_hash=sha(final.encode('utf-8')) if final is not None else None
    if final is not None:
        if icu_names(source)!=icu_names(final):
            verification_failures.append({'id':r['id'],'where':'cross-review','issue':'placeholder-mismatch'})
        if markup(source)!=markup(final):
            verification_failures.append({'id':r['id'],'where':'cross-review','issue':'markup-mismatch'})
        for lit in known_literals:
            if lit in source and lit not in final:
                verification_failures.append({'id':r['id'],'where':'cross-review','issue':'protected-literal-mismatch','literal':lit})
    caller_refs=[]
    for c in ctx_by_source[sid]['callers']:
        caller_refs.append({'path':c['path'],'line':c['line'],'fileBlob':c['fileBlob'],'lineSha256':c['lineSha256'],'kind':c['kind']})
    cross_rows.append({
        'id':r['id'],'sourceId':sid,'sourceIdPosition':r['sourceIdPosition'],'locale':locale,
        'source':source,'sourceHash':r['sourceHash'],'currentTarget':current,'currentTargetHash':current_hash,
        'primaryStatus':status,'primaryProposedTarget':proposed,'primaryProposedTargetHash':r.get('proposedTargetHash'),
        'primaryRationale':r.get('rationale'),'crossReviewDecision':cross,'crossReviewTarget':final,
        'crossReviewTargetHash':final_hash,'crossReviewConfidence':confidence,'crossReviewRationale':reason,
        'placeholdersSource':icu_names(source),'placeholdersCurrent':icu_names(current),
        'placeholdersPrimaryProposed':icu_names(proposed) if proposed is not None else None,
        'markupSource':markup(source),'markupCurrent':markup(current),
        'markupPrimaryProposed':markup(proposed) if proposed is not None else None,
        'protectedProductLiterals':[x for x in known_literals if x in source],
        'callerRefs':caller_refs,'routingDisposition':r['routingDisposition'],
        'priorDispositionPreserved':r['priorDispositionPreserved'],
        'liveHead':HEAD,'liveTree':TREE,
    })
    review_counts[cross]+=1
    per_locale[locale][cross]+=1
    if status=='correction-needed':
        proposal_review_counts[cross]+=1

assert len(cross_rows)==1200
assert not verification_failures, verification_failures[:5]
assert review_counts=={'accept':1185,'missed':13,'refine':1,'hold':1},review_counts
assert proposal_review_counts=={'accept':226,'refine':1},proposal_review_counts
assert len(MISSES)==13 and len(REFINES)==1 and len(HOLD)==1

# Visual candidate is a separately reviewed string from Setup, outside positions 900-999.
source_key='components.Setup.configureservices'
source='Connect Services'
current=source_catalog[source_key]
spanish=target_catalogs['es'][source_key]
assert current==source and spanish=='Configurar servicios'
setup_path='src/components/Setup/index.tsx'
setup_raw=git_bytes(setup_path)
setup_lines=setup_raw.decode('utf-8').splitlines()
usage_lines=[(i+1,line.strip()) for i,line in enumerate(setup_lines) if 'intl.formatMessage(messages.configureservices)' in line]
definition_line=next(i+1 for i,line in enumerate(setup_lines) if "configureservices: 'Connect Services'" in line)
assert any(n==500 for n,_ in usage_lines)
setup_visual={
  'sourceId':source_key,'source':source,'sourceSha256':sha(source.encode('utf-8')),
  'currentSpanish':spanish,'currentSpanishSha256':sha(spanish.encode('utf-8')),
  'candidateSpanish':'Conectar servicios','candidateSpanishSha256':sha('Conectar servicios'.encode('utf-8')),
  'currentLength':len(spanish),'candidateLength':len('Conectar servicios'),
  'head':HEAD,'tree':TREE,
  'sourceCatalogBlob':manifest['sourceCatalog']['blob'],'sourceCatalogSha256':manifest['sourceCatalog']['sha256'],
  'spanishCatalogBlob':manifest['targetCatalogs']['es']['fileBlob'],'spanishCatalogSha256':manifest['targetCatalogs']['es']['fileSha256'],
  'caller':{'path':setup_path,'fileBlob':git_blob(setup_path),'fileSha256':sha(setup_raw),
     'definitionLine':definition_line,'definitionText':setup_lines[definition_line-1].strip(),
     'usageLines':[{'line':n,'text':txt} for n,txt in usage_lines]},
  'visualEvidence':{
    'sourcePath':'docs/pr-evidence/pr418-localization-2026-11-02/agentvm-browser-review/spanish-setup-step1-before.png',
    'sha256':None,
    'finding':'In the saved Spanish setup screenshot, the Step 5 label “Configurar servicios” extends beyond the right edge of its step segment. “Conectar servicios” is the accurate infinitive translation of “Connect Services” and is two characters shorter, so it is a plausible fix for the observed width overflow.',
    'postChangeVisualVerification':'not performed; no repository changes were permitted.'},
  'decision':'accept candidate, confidence high',
  'rationale':'The setup step connects service integrations. “Configurar” means configure and does not match the source action; “Conectar” is exact and shorter in this step header.'
}
screenshot_src=ROOT / setup_visual['visualEvidence']['sourcePath']
assert screenshot_src.is_file()
setup_visual['visualEvidence']['sha256']=sha(screenshot_src.read_bytes())

# Make the evidence packet standalone enough to review without changing the source packet.
PRIMARY_COPY.mkdir(parents=True, exist_ok=True)
for name in ['README.md','manifest.json','summary.json','preserved-prior-routing-rows.jsonl','selected-direct-locale-cells.jsonl','source-current-attestation.jsonl','caller-context-attestation.jsonl','source-contexts.jsonl','primary-review-ledger.jsonl','SHA256SUMS']:
    shutil.copyfile(PRIMARY / name, PRIMARY_COPY / name)
for name in ['primary-manifest.json','primary-summary.json','primary-selected-direct-locale-cells.jsonl','primary-source-current-attestation.jsonl','primary-caller-context-attestation.jsonl','primary-source-contexts.jsonl','primary-primary-review-ledger.jsonl','primary-SHA256SUMS']:
    stale=OUT / name
    if stale.exists(): stale.unlink()
shutil.copyfile(screenshot_src, OUT / 'spanish-setup-step1-before.png')
write_jsonl(OUT / 'cross-review-ledger.jsonl', sorted(cross_rows,key=lambda r:(r['sourceIdPosition'],r['locale'])))
write_jsonl(OUT / 'independent-source-current-attestation.jsonl', sorted([
  {'sourceId':r['sourceId'],'sourceIdPosition':r['sourceIdPosition'],'locale':r['locale'],
   'source':r['source'],'sourceSha256':r['sourceSha256'],'currentTarget':r['target'],
   'currentTargetSha256':r['targetSha256'],'sourceFileBlob':manifest['sourceCatalog']['blob'],
   'targetFile':r['targetFile'],'targetFileBlob':manifest['targetCatalogs'][r['locale']]['fileBlob'],
   'attestedHead':HEAD,'attestedTree':TREE,'sourceMatchesPinnedHead':True,'targetMatchesPinnedHead':True}
  for r in source_rows],key=lambda r:(r['sourceIdPosition'],r['locale'])))
write_jsonl(OUT / 'independent-caller-attestation.jsonl',sorted(caller_attest,key=lambda r:(r['sourceIdPosition'],r['path'],r['line'])))
(OUT / 'visual-spanish-candidate.json').write_text(json.dumps(setup_visual,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

peer_summary={
  'positionRange900To949':{'cells':600,'primaryCorrections':159,'peerReportedBeforeReconciliation':{'acceptCurrent':439,'acceptProposals':159,'missed':2,'refine':0,'hold':0},
    'peerReconciled':{'acceptCurrent':440,'acceptProposals':159,'missed':1,'noOpReportedFindings':1,'refine':0,'hold':0},
    'reportedFindings':[{'sourceId':'components.Discover.DiscoverSliderEdit.deletefail','locale':'fr','reportedTarget':'Impossible de supprimer la rangée.','reconciliation':'no-op/accept-current; exact live catalog and primary ledger already contain this same text and hash 45729a6c43ef0d13b7481003f0488b888bb459a97d2aaf210b2cf521557e67d7.'},
                {'sourceId':'components.Discover.DiscoverMovies.studioMovies','locale':'hi','suggestedTarget':'{studio} की फ़िल्में','reason':'Current wording denotes a studio cinema rather than films from the studio.'}],
    'reconciledActualMisses':1,'reconciledNoOpReports':1},
  'positionRange950To999':{'cells':600,'primaryCorrections':68,'peerAcceptCurrent':528,'peerAcceptProposals':67,'peerMissed':4,'peerRefine':1,'peerHold':0,
    'findings':[{'sourceId':'components.Discover.DiscoverTv.networkSeries','locale':'ar','suggestedTarget':'مسلسلات {network}'},
                {'sourceId':'components.Discover.DiscoverTvGenre.genreSeries','locale':'ar','suggestedTarget':'مسلسلات من نوع {genre}'},
                {'sourceId':'components.Discover.DiscoverTvKeyword.keywordSeries','locale':'ar','suggestedTarget':'مسلسلات مرتبطة بـ{keywordTitle}'},
                {'sourceId':'components.Discover.DiscoverTvLanguage.languageSeries','locale':'ar','suggestedTarget':'مسلسلات باللغة {language}'},
                {'sourceId':'components.Discover.DiscoverTvKeyword.keywordSeries','locale':'fr','refinedTarget':'Séries correspondant à {keywordTitle}'}]},
  'note':'Peer findings are incorporated into the cross-review ledger; additional independent findings are documented per row there.'
}
(OUT / 'peer-crossreview-summary.json').write_text(json.dumps(peer_summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

repo_status=subprocess.check_output(['git','status','--short'],cwd=ROOT,text=True).splitlines()
summary={
  'schemaVersion':1,'result':'INDEPENDENT_CROSS_REVIEW_COMPLETE',
  'repository':REPO,'pullRequest':PR,'head':HEAD,'tree':TREE,
  'prStateAtReview':'OPEN','prDraftAtReview':True,'prMergeStateAtReview':'CLEAN',
  'sourcePositions':{'startInclusive':900,'endInclusive':999,'count':100},
  'targetCells':1200,'locales':manifest['targetLocales'],
  'sourceRowsReattested':100,'sourceCurrentCellsReattested':1200,'sourceCurrentMismatches':0,
  'callerContextReferencesReattested':len(caller_attest),'callerContextMismatches':0,
  'uniqueCallerFiles':len({r['path'] for r in caller_attest}),
  'placeholderParityFailures':0,'markupParityFailures':0,'protectedProductLiteralFailures':0,
  'primaryDecisionCounts':{'correctionNeeded':227,'acceptCurrent':973},
  'crossReviewDecisionCounts':dict(review_counts),
  'crossReviewProposalCounts':dict(proposal_review_counts),
  'missedCorrections':len(MISSES),'refinements':len(REFINES),'crossReviewHolds':len(HOLD),'peerReportedNoOpReconciliations':1,
  'priorRoutedRows':0,'priorDispositionPreservedRows':0,'noOpRows':0,'primaryHeldOrNoOpRoutes':0,
  'allPrimaryRowsRoutedAs':'new-semantic-review-required',
  'visualSpanishCandidate':'accepted',
  'visualSpanishCurrent':'Configurar servicios','visualSpanishProposal':'Conectar servicios',
  'visualScreenshotFinding':'Step 5 current label overflows its step segment; candidate is semantically correct and two characters shorter.',
  'repoTrackedFilesChanged':False,'repoWorktreePreexistingUntracked':repo_status,
  'testsBuildScansCiOrPrMutationsPerformed':False,
  'nativeSpeakerReviewPerformed':False,'nativeSpeakerReviewRequired':True,
  'primaryPacketPath':str(PRIMARY),
  'worktreePath':str(ROOT),
  'scratchPacketPath':str(OUT),
  'sourceCatalog':manifest['sourceCatalog'],
  'targetCatalogHashes':{locale:info['fileSha256'] for locale,info in manifest['targetCatalogs'].items()},
  'crossReviewLedgerSha256':sha((OUT/'cross-review-ledger.jsonl').read_bytes()),
  'independentSourceCurrentAttestationSha256':sha((OUT/'independent-source-current-attestation.jsonl').read_bytes()),
  'independentCallerAttestationSha256':sha((OUT/'independent-caller-attestation.jsonl').read_bytes()),
  'visualReviewSha256':sha((OUT/'visual-spanish-candidate.json').read_bytes()),
  'reviewConfidence':'Moderate overall; high for clear literal/script/polarity corrections; native-speaker approval remains outstanding.'
}
(OUT/'review-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
readme=f'''# SeerrNG PR #418 W900–999 independent cross-review

This packet independently cross-reviews the primary packet at `{PRIMARY}` against PR #418 head `{HEAD}` (tree `{TREE}`). The PR was OPEN/DRAFT/CLEAN at review time. The read-only audit covered 100 source IDs and 1,200 locale cells across all 12 direct locales.

## Results

- **Accept:** {review_counts['accept']} cells ({proposal_review_counts['accept']} primary correction candidates accepted; the remainder are acceptable current translations).
- **Refine:** {review_counts['refine']} primary correction candidate. French `Séries pour {{keywordTitle}}` should read `Séries correspondant à {{keywordTitle}}` because the caller uses a TMDB keyword.
- **Missed:** {review_counts['missed']} current translations that need correction; their candidates and reasons are in `cross-review-ledger.jsonl`.
- **Peer report reconciled as a no-op:** the French W926 `deletefail` row already contains `Impossible de supprimer la rangée.` at current hash `45729a6c43ef0d13b7481003f0488b888bb459a97d2aaf210b2cf521557e67d7`; it is accepted-current, not a missed correction.
- **Hold:** {review_counts['hold']} current translation held for native-speaker confirmation.
- The primary packet’s 1,200 rows are all `new-semantic-review-required`; there are no prior-routed, preserved-prior, or no-op rows.
- All 100 source rows, 1,200 current cells, and 218 caller references were independently re-attested to the pinned Git tree. Placeholder, markup, and checked product-literal parity failures: 0.
- The separate Spanish setup candidate is accepted: `Connect Services` → `Conectar servicios`. The saved before screenshot shows `Configurar servicios` overflowing Step 5’s segment; the candidate is semantically exact and two characters shorter. No post-change screenshot was produced because repository edits were out of scope.
- No repository/PR state was changed, and no tests, builds, scans, or CI were run. The existing worktree has preexisting untracked `.next-webpack-dev` and `docs/pr-evidence/pr418-localization-2026-11-02/agentvm-browser-review/`; both were preserved.

## Evidence

- `cross-review-ledger.jsonl` records the independent decision for every cell and carries source/current/proposed hashes, caller refs, placeholder/markup inventories, product literals, and final recommended target.
- `independent-source-current-attestation.jsonl` contains the independently re-read source/current values and hashes for all 1,200 cells.
- `independent-caller-attestation.jsonl` contains direct pinned-tree re-attestation for every caller file, blob, line, and neighboring line context.
- `visual-spanish-candidate.json` and `spanish-setup-step1-before.png` preserve the visual candidate assessment.
- `peer-crossreview-summary.json` records the two independent range reviews and their findings.
- `primary-packet/` preserves the full primary input and its original checksum manifest for standalone review.
- `review-summary.json` records live pins, aggregate counts, and artifact hashes.

Semantic confidence is moderate overall. Qualified native-speaker review remains outstanding.
'''
(OUT/'README.md').write_text(readme)
files=sorted(p for p in OUT.rglob('*') if p.is_file() and p != OUT/'SHA256SUMS')
(OUT/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files))
print(json.dumps({'result':summary['result'],'counts':summary['crossReviewDecisionCounts'],'head':HEAD,'scratchBytes':sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())},ensure_ascii=False,sort_keys=True))
