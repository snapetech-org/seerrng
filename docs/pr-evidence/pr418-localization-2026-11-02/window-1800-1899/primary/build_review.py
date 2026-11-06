import collections, datetime, hashlib, json, pathlib, re, subprocess

ROOT = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1800-1899-primary-20261102')
REPO = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
HEAD = '78a36214596544e1b3033c6a612ae5559db713e3'
TREE = 'ef83a00d078f0a4aed6269b4c23282dbf91fd6f7'
REPO_NAME = 'snapetech-org/seerrng'
PR = 418
LOCALES = ['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

WHY = {
 1800:'These are controls that add a sports team to the user’s followed teams; the label needs the follow action, not a literal sense of following/obeying.',
 1801:'This empty state appears when the user has not followed any teams; use the app sense of following a sports team.',
 1802:'The field labels a sports team, not staff or personnel.',
 1803:'This is the heading for teams the user follows; avoid “follow-up” and physical-following calques.',
 1805:'This action removes an existing team follow; negative commands such as “do not follow” miss the stop-following meaning.',
 1806:'The button/modal title says a program is currently airing on Live TV; use a natural status phrase.',
 1807:'The table header labels an airing’s date/time range, so it means broadcast time/schedule rather than air, aircraft, or flight.',
 1808:'This tooltip concerns permission to request TV program recordings; avoid audio-recording terms.',
 1809:'This is a table field label for the channel; remove a colon that the interface does not provide.',
 1812:'These values identify a TV season and episode; weather, events, benefits, poems, and book chapters are wrong meanings.',
 1813:'This button label marks an airing on Live TV; use the same natural status phrasing as the dialog title.',
 1814:'This tooltip describes an upcoming TV broadcast and offers watching or recording it; current flight/air/sound translations miss that meaning.',
 1815:'This is a button action to record a TV program, not a noun, music recording, or written record.',
 1816:'This button requests recording each time a program is broadcast; “air” must mean a TV airing.',
 1817:'The description says to record a title each time it is broadcast while the request remains active; keep the condition and direction clear.',
 1819:'This error is about requesting a TV recording, not an audio recording; preserve the failure meaning.',
 1820:'This toast confirms a TV recording request and says scheduling follows approval; fix audio-recording terms and agreement.',
 1821:'This status says the TV recording has been scheduled; avoid audio-recording terms and noun-only labels.',
 1822:'This navigation action opens the user’s TV recordings, not records, profiles, or audio recordings.',
 1823:'This error says a TV recording could not be updated; use the TV-recording sense and past failure.',
 1824:'This filter restricts the list to active recording requests; use a clear active-recordings label.',
 1825:'In the recording list, “Airs” labels a broadcast date/time, not air or air freight.',
 1826:'This is a channel filter meaning any channel; do not leave a placeholder or malformed phrase.',
 1827:'This is an approval action button, so use a verb rather than the noun “approval.”',
 1828:'This button cancels a TV recording request; make the recording action explicit.',
 1829:'This table label is simply Channel; remove the extra colon.',
 1831:'This empty-state message says no TV recordings exist yet; avoid audio-recording, records, or leftover English.',
 1832:'The help text points the user to a movie/series airing on Live TV, then the localized On Live TV button; preserve those actions and match the button label.',
 1833:'This filter scope means all TV recordings, not written records, disks, or audio recordings.',
 1834:'This error says TV recordings could not be loaded; avoid records/profile/audio meanings.',
 1835:'This filter scope means the user’s TV recordings, not written records or audio recordings.',
 1836:'This setup message concerns Live TV recording and names the protected IPTV Tunerr product; the French target misspells the product and the German target leaves a route label untranslated.',
 1837:'The source label is paired with “Every Airing” for a single broadcast; the definition-only caller remains unclaimed.',
 1838:'The caller renders this as a date/time column backed by recordedAt, so translate “Recorded” as the recording date/time rather than a status.',
 1839:'This table header asks who requested the recording; Hindi needs the noun “requester.”',
 1841:'This scope means recording every broadcast; current air/flight translations are incorrect.',
 1842:'This filter action means display all recordings; the Arabic target omits “all.”',
 1843:'These are status badges; use the completed/cancelled state rather than an infinitive command.',
 1844:'This status badge means the recording completed and was recorded; use a past/state form and avoid audio-recording terms.',
 1847:'This badge means waiting for approval; correct the Japanese misreading and Korean/ Vietnamese code-switching or wrong approval term.',
 1848:'This status means the TV recording is currently in progress, not a generic recording noun or audio recording.',
 1849:'This badge reports a scheduled state, not a schedule table or bare schedule noun.',
 1850:'This is the page title for TV recordings; do not translate it as written records, audio recordings, or collecting.',
 1851:'The button is busy while an operation runs; “Working…” means processing/in progress, not manual labor.',
 1853:'The Quick Connect modal instructs users to enter a code in their {mediaServerName} app; keep placeholder order grammatical and say app, not password/download.',
 1854:'This modal subtitle is an authentication action with Quick Connect; several current targets mean signing, subscribing, or signing up.',
 1855:'This is the Quick Connect feature title; Arabic currently says only “quickly.”',
 1856:'The caller is the OIDC login button; “provider” means identity provider, not a vendor/supplier.',
 1857:'This accessible label names the identity provider and says the guide opens in a new tab; preserve {provider} and the tab behavior.',
 1858:'This login error requires an administrator account; correct the untranslated Korean term and sign-up mistranslation.',
 1859:'This navigation action returns to the previous screen; Korean shortcut and Vietnamese “go away/home” wording are wrong.',
 1860:'This authentication error covers username or password; repair Spanish agreement and Korean phrasing.',
 1861:'The definition describes demo-mode credentials used to sign in; the caller is definition-only/single-reference, so its runtime display remains unclaimed.',
 1862:'The add-email form says the address completes the profile and supports notifications/local sign-in; do not change sign-in to subscription or registration.',
 1863:'This is the field label Email Address; Vietnamese needs the ordinary email-address term.',
 1865:'This login error names an email address or password; repair Spanish agreement and Brazilian Portuguese agreement.',
 1866:'This tooltip is attached to the email-address field and says that address need not belong to the media-server instance; preserve {mediaServerName}.',
 1868:'This is the Forgot Password link; Indonesian should not leave “Password” in English.',
 1872:'The login error says it could not connect to the named media-server; fix placeholder word order in Hindi, Indonesian, Korean, and Vietnamese.',
 1873:'This hint says to use the media-server username when no email is set in the profile; preserve {mediaServerName} and place it naturally.',
 1874:'This button continues authentication with a sign-in link, not a signal/reference or registration link.',
 1875:'This error is specifically about an unusable sign-in link; avoid sign-up/subscription wording and preserve the sign-in meaning.',
 1877:'This title describes signing in with a link that can be used once; avoid signing a document or an merely unique link.',
 1878:'This is a progress label for signing in; translate the in-progress state, not a signature or imperative.',
 1879:'This generic error occurred while signing in; Vietnamese currently says signing up.',
 1880:'This button signs in with the named app; Traditional Chinese should express “using {appName} to log in.”',
 1882:'This error reports that no administrator user exists on the server; use server/admin terms naturally.',
 1883:'This fragment introduces alternate sign-in methods; avoid sign-up, registration, or check-in meanings.',
 1885:'This technical error distinguishes successful Plex sign-in from failure to create a browser session; preserve Seerr, Plex, HTTPS, HTTP, and URL exactly.',
 1886:'This error says Plex sign-in could not be completed; avoid registration/subscription or English code-switching.',
 1887:'This is a network Port field label and is definition-only/single-reference in the targeted caller set; it is not a harbor.',
 1888:'This label names the Quick Connect authentication method; Arabic currently says only “quickly.”',
 1889:'This Quick Connect error asks the user to retry; the key has only its definition/single reference in the targeted caller set, so display remains unclaimed.',
 1890:'This button adds the email address; Korean “기타” means “other.”',
 1891:'This error occurred while saving form data; do not translate save as saving money or people.',
 1892:'This is an in-progress label while adding the email; Korean currently says “see more.”',
 1895:'The login succeeded but no browser session was established; avoid sign-up or browser-meeting translations.',
 1896:'This message explains successful sign-in followed by session failure and gives HTTPS/authenticated-HTTP alternatives; preserve SeerrNG, HTTPS, and HTTP.',
 1897:'The setup error says Jellyfin is already configured and gives restart/sign-in instructions; this definition-only key remains unclaimed.',
 1898:'The setup error explains that settings saved but the browser session failed, then gives restart/HTTPS/HTTP alternatives; this definition-only key remains unclaimed.',
 1899:'This is the sign-in action; Vietnamese currently says sign a document.'
}

def sha(value):
    if isinstance(value, str): value=value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def run(*args): return subprocess.check_output(args, text=True)
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def show(path): return git('show',f'{HEAD}:{path}')
def live_pr():
    return json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,baseRefOid,url'))
def tree_state():
    return {'head':run('git','-C',str(REPO),'rev-parse','HEAD').strip(),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip(),'status':run('git','-C',str(REPO),'status','--porcelain').strip()}
def require_live(pr,state):
    assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD,pr
    assert state['head']==HEAD and state['tree']==TREE and state['status']=='',state
def flatten(d,prefix=''):
    for k,v in d.items():
        q=f'{prefix}.{k}' if prefix else k
        if isinstance(v,dict): yield from flatten(v,q)
        else: yield q,v
def ph(text):
    out=[]; i=0
    while i<len(text):
        if text[i]!='{': i+=1; continue
        depth=1; j=i+1
        while j<len(text) and depth:
            if text[j]=='{': depth+=1
            elif text[j]=='}': depth-=1
            j+=1
        if depth: break
        body=text[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return out
def tags(text): return re.findall(r'</?[A-Za-z][^>]*>',text)
def loadjl(path): return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]
def canonical(value): return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')

def reattest_inputs():
    # Exact live PR and worktree before semantic review output is written.
    pr=live_pr(); state=tree_state(); require_live(pr,state)
    # Input checksum manifest, source order, all catalog blobs/bytes, cells and callers.
    check=subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=ROOT,text=True,capture_output=True)
    assert check.returncode==0,check.stdout+check.stderr
    manifest=json.loads((ROOT/'input-manifest.json').read_text(encoding='utf-8'))
    assert manifest['head']==HEAD and manifest['tree']==TREE and manifest['worktreeClean'] is True
    srcraw=show('src/i18n/locale/en.json'); srcjson=json.loads(srcraw); source_pairs=list(flatten(srcjson)); selected=source_pairs[1800:1900]
    source_rows=json.loads((ROOT/'source-window.json').read_text(encoding='utf-8'))['sourceList']
    assert len(selected)==100 and len(source_rows)==100
    assert [(r['position'],r['sourceId'],r['source']) for r in source_rows]==[(1800+i,k,v) for i,(k,v) in enumerate(selected)]
    src_catalog_info=manifest['sourceCatalog']
    assert run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{src_catalog_info["path"]}').strip()==src_catalog_info['blob']
    assert sha(srcraw)==src_catalog_info['sha256'] and len(srcraw)==src_catalog_info['bytes']
    locale_json={}; locale_info=manifest['localeCatalogs']
    for loc in LOCALES:
        info=locale_info[loc]; raw=show(info['path'])
        assert run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{info["path"]}').strip()==info['blob']
        assert sha(raw)==info['sha256'] and len(raw)==info['bytes']
        locale_json[loc]=json.loads(raw)
    cells=loadjl(ROOT/'source-current-cells.jsonl'); contexts=loadjl(ROOT/'caller-contexts.jsonl')
    assert len(cells)==1200 and len(contexts)==100
    for c in cells:
        assert locale_json[c['locale']][c['sourceId']]==c['currentTarget']
        assert sha(c['currentTarget'])==c['currentTargetHash']
    caller_files={}
    for ctx in contexts:
        for pin in ctx['callerFiles']:
            if pin['path'] not in caller_files:
                raw=show(pin['path']); blob=run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{pin["path"]}').strip()
                assert blob==pin['blob'] and sha(raw)==pin['fileSha256']
                caller_files[pin['path']]=raw.decode('utf-8').splitlines()
            lines=caller_files[pin['path']]
        for ref in ctx['pinnedLineRefs']:
            line=caller_files[ref['file']][ref['line']-1]
            assert line.strip()==ref['lineText'] and sha(line)==ref['lineSha256']
    boundary=json.loads((ROOT/'prior-disposition-boundary.json').read_text(encoding='utf-8'))
    assert boundary['scopePositions']==[1800,1899] and boundary['exactLivePriorDispositions']==0
    assert manifest['callerContextRows']==100 and manifest['callerReferences']==sum(len(x['pinnedLineRefs']) for x in contexts)
    return {'livePullRequest':pr,'worktree':state,'checkedAtUtc':now(),'sourceIdsReattested':100,'cellsReattested':1200,
      'callerRefsReattested':sum(len(x['pinnedLineRefs']) for x in contexts),'callerFilesReattested':len(caller_files),
      'sourceAndCellMismatches':0,'callerMismatches':0,'priorExactDispositions':0,'inputChecksums':'pass'}

pre=reattest_inputs()
inputs=loadjl(ROOT/'source-current-cells.jsonl')
contexts={x['sourceId']:x for x in loadjl(ROOT/'caller-contexts.jsonl')}
boundary=json.loads((ROOT/'prior-disposition-boundary.json').read_text(encoding='utf-8'))
history=collections.defaultdict(list)
for item in boundary.get('matches',[]):
    disp=item.get('disposition')
    if disp and disp!='semantic-review-required': history[(item.get('sourceId'),item.get('locale'))].append(item)
rule_data=json.loads((ROOT/'candidate-targets.json').read_text(encoding='utf-8'))
T={int(pos):targets for pos,targets in rule_data['targets'].items()}
REFINE=set(rule_data['refinements'])
review=[]; per_locale={loc:collections.Counter() for loc in LOCALES}
current_placeholder_mismatches=[]; current_markup_mismatches=[]; current_protected_mismatches=[]
for c in inputs:
    pos,loc,sid=c['sourcePosition'],c['locale'],c['sourceId']; ctx=contexts[sid]
    prior=c.get('priorDisposition')
    candidate=T.get(pos,{}).get(loc)
    if prior:
        target=prior['priorFinalTarget']; disposition='preserve-prior-disposition'; rationale='Exact frozen prior decision at the same source, locale, and final-target hash is preserved.'; confidence='high'
    elif candidate is not None:
        target=candidate
        disposition='propose-refinement' if f'{pos}|{loc}' in REFINE else 'propose-correction'
        rationale=WHY.get(pos,'The candidate corrects a semantic or grammatical mismatch in the current target for the pinned source/caller context.')
        confidence='moderate' if disposition=='propose-refinement' or ctx['callerUseStatus']!='direct-or-helper-reference-found' else 'high'
    else:
        target=c['currentTarget']; disposition='accept-current'
        if ctx['callerUseStatus']=='direct-or-helper-reference-found': rationale='The current target conveys the source meaning in its pinned caller context and preserves its structure; no material error was found.'
        else: rationale='The current target conveys the source meaning, but the targeted caller evidence is definition-only/single-reference; its runtime display remains unclaimed.'
        confidence='moderate'
    source_ph=ph(c['source']); target_ph=ph(target); current_ph=ph(c['currentTarget'])
    source_markup=tags(c['source']); target_markup=tags(target); current_markup=tags(c['currentTarget'])
    expected=c['protectedLiterals']; missing=[token for token in expected if token not in target]
    current_missing=[token for token in expected if token not in c['currentTarget']]
    if sorted(ph(c['source']),key=lambda x:(x['name'],x['kind']))!=sorted(current_ph,key=lambda x:(x['name'],x['kind'])): current_placeholder_mismatches.append((pos,loc))
    if source_markup!=current_markup: current_markup_mismatches.append((pos,loc))
    if current_missing: current_protected_mismatches.append({'sourcePosition':pos,'locale':loc,'missing':current_missing})
    assert sorted(source_ph,key=lambda x:(x['name'],x['kind']))==sorted(target_ph,key=lambda x:(x['name'],x['kind'])),(pos,loc,'placeholder',target)
    assert source_markup==target_markup,(pos,loc,'markup',target)
    assert not missing,(pos,loc,'protected',missing,target)
    caller_files=[{'path':x['path'],'blob':x['blob'],'fileSha256':x['fileSha256']} for x in ctx['callerFiles']]
    hist_refs=history.get((sid,loc),[])
    row={'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
      'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':c['source'],'sourceHash':c['sourceHash'],'sourceTextSha256':c['sourceTextSha256'],
      'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'candidateTarget':target,'candidateTargetHash':sha(target),
      'finalTarget':target,'finalTargetHash':sha(target),'candidateChanged':target!=c['currentTarget'],
      'sourceFile':c['sourceFile'],'sourceCatalogBlob':c['sourceCatalogBlob'],'sourceFileSha256':c['sourceFileSha256'],
      'localeFile':c['localeFile'],'localeBlob':c['localeBlob'],'localeFileSha256':c['localeFileSha256'],
      'callerContextRef':sid,'callerContextSha256':c['callerContextSha256'],'callerUseStatus':ctx['callerUseStatus'],
      'callerPaths':ctx['callerPaths'],'callerFiles':caller_files,'callerLineRefs':ctx['pinnedLineRefs'],
      'callerClaim':'unclaimed' if ctx['callerUseStatus']!='direct-or-helper-reference-found' else 'targeted-source-use-found',
      'priorDisposition':prior,'historicalDispositionReferences':hist_refs,
      'disposition':disposition,'rationale':rationale,'confidence':confidence,
      'sourcePlaceholders':source_ph,'candidatePlaceholders':target_ph,'placeholderParity':'exact',
      'sourceMarkup':source_markup,'candidateMarkup':target_markup,'markupParity':'exact',
      'protectedLiteralsExpected':expected,'protectedLiteralMissing':missing,'protectedLiteralParity':'exact',
      'currentProtectedLiteralMissing':current_missing,'nativeSpeakerApproval':False}
    review.append(row); per_locale[loc][disposition]+=1
assert len(review)==1200 and len({(x['sourceId'],x['locale']) for x in review})==1200
assert set((x['sourcePosition'] for x in review))==set(range(1800,1900))
assert set((x['locale'] for x in review))==set(LOCALES)
counts=collections.Counter(x['disposition'] for x in review)
# Count source keys whose pinned caller references are definition-only/single-reference, and cells they cover.
unclaimed=[x for x in contexts.values() if x['callerUseStatus']!='direct-or-helper-reference-found']
unclaimed_ids=sorted(x['sourceId'] for x in unclaimed)
unclaimed_cells=sum(1 for r in review if r['callerClaim']=='unclaimed')
assert len(unclaimed_ids)==6 and unclaimed_cells==72
assert not any(r['disposition']=='preserve-prior-disposition' for r in review)

(ROOT/'primary-review-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in review),encoding='utf-8')
# Recheck the remote PR/tree after reviewing all cells and before sealing the packet.
post_pr=live_pr(); post_state=tree_state(); require_live(post_pr,post_state)
final_reattest={'repository':REPO_NAME,'pullRequest':PR,'expectedHead':HEAD,'expectedTree':TREE,
  'beforeReview':pre,'afterReview':{'livePullRequest':post_pr,'worktree':post_state,'checkedAtUtc':now()},
  'sourceIdsReattested':100,'cellsReattested':1200,'callerRefsReattested':pre['callerRefsReattested'],
  'callerFilesReattested':pre['callerFilesReattested'],'sourceAndCellMismatches':0,'callerMismatches':0,
  'priorExactDispositions':0,'worktreeUnmodified':True,'repositoryModified':False}
(ROOT/'final-reattestation.json').write_text(json.dumps(final_reattest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
summary={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'state':'OPEN','isDraft':True,'head':HEAD,'tree':TREE,
  'sourcePositionRange':[1800,1899],'sourceIds':100,'locales':LOCALES,'cells':1200,
  'dispositionCounts':dict(sorted(counts.items())),'correctionCandidateCount':counts.get('propose-correction',0),
  'refinementCandidateCount':counts.get('propose-refinement',0),'holdCount':counts.get('hold',0),'holds':[],
  'priorFrozenDispositionCount':counts.get('preserve-prior-disposition',0),'priorMatchingReviewRows':boundary['matchingPriorRows'],
  'historicalNonFinalReferenceRows':sum(bool(r['historicalDispositionReferences']) for r in review),
  'historicalExactFinalTargetReferences':sum(bool(ref.get('priorFinalTargetHash')) for r in review for ref in r['historicalDispositionReferences']),
  'placeholderMismatchCount':sum(r['placeholderParity']!='exact' for r in review),
  'markupMismatchCount':sum(r['markupParity']!='exact' for r in review),
  'protectedLiteralMismatchCount':sum(r['protectedLiteralParity']!='exact' for r in review),
  'currentProtectedLiteralMismatchCount':len(current_protected_mismatches),'currentProtectedLiteralMismatchCells':current_protected_mismatches,
  'callerEvidence':{'sourceIds':100,'callerReferences':pre['callerRefsReattested'],'uniqueCallerFiles':pre['callerFilesReattested'],
    'directOrHelperReferenceKeys':100-len(unclaimed_ids),'definitionOnlyOrSingleReferenceKeys':unclaimed_ids,
    'definitionOnlyOrSingleReferenceCells':unclaimed_cells,'unclaimedCallerKeys':unclaimed_ids},
  'perLocale':{loc:dict(sorted(per_locale[loc].items())) for loc in LOCALES},
  'confidence':'moderate','confidenceNote':'Exact Git/source/caller and structural checks are high-confidence; semantic judgments are model-based and native-speaker approval remains outstanding.',
  'nativeSpeakerApproval':'outstanding','repoOrPullRequestModified':False,'testsBuildsScansCIorBrowserRun':False,
  'workflowFilesTouched':False,'outputPath':str(ROOT)}
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
readme=f'''# SeerrNG PR #418 primary semantic review: source positions 1800–1899

This packet reviews 100 English catalog entries across the 12 direct locales ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, and zh_Hant (1,200 cells).

## Pin and method

- PR #418 was OPEN/DRAFT at exact head {HEAD} and tree {TREE}. The same live values were rechecked after the review.
- Source positions are zero-based insertion order in the pinned flat `src/i18n/locale/en.json` catalog.
- Source, all 12 locale catalogs, all 1,200 current cells, 371 caller line references across 11 source files, and prior-disposition boundaries were re-attested at the exact tree.
- No exact prior final dispositions applied to this window. The earlier packet scan returned {boundary['matchingPriorRows']} rows marked `semantic-review-required` without a frozen final target; those were not treated as accepted translations. Two older `reuse-equivalence-decision` notes without target hashes remain linked as historical context only.
- Six keys have only a definition/single reference in the targeted caller files: {', '.join(unclaimed_ids)}. Their 72 locale cells remain in the ledger with `callerClaim: unclaimed`; this packet does not claim those strings render.

## Review summary

- Accept current: {counts.get('accept-current',0)}
- Propose correction: {counts.get('propose-correction',0)}
- Propose refinement: {counts.get('propose-refinement',0)}
- Holds: {counts.get('hold',0)}
- Candidate placeholder/ICU mismatches: 0
- Candidate markup mismatches: 0
- Candidate protected-literal mismatches: 0
- One current protected-literal typo was found at W1836 French (`IPTV Tuner`); the proposed target restores the exact product name `IPTV Tunerr`.

The primary ledger records exact current/candidate/final text and SHA-256, locale/source file pins, caller lines, disposition, rationale, confidence, and placeholder/markup/protected-literal checks for every cell. Six definition-only/single-reference keys are explicitly unclaimed. No holds remain because the source meaning is clear enough to translate even where runtime use was not found.

No repository/PR edits, tests, builds, security scans, CI, or browser actions were performed. This machine review is not native-speaker approval. `SHA256SUMS` covers all packet files.
'''
(ROOT/'README.md').write_text(readme,encoding='utf-8')
# Seal every retained input and review output other than the checksum manifest itself.
files=sorted(p for p in ROOT.iterdir() if p.is_file() and p.name!='SHA256SUMS')
(ROOT/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in files),encoding='utf-8')
print(json.dumps({'output':str(ROOT),'cells':len(review),'candidateCells':sum(1 for x in review if x['candidateChanged']),
 'counts':dict(sorted(counts.items())),'holds':counts.get('hold',0),'unclaimedCallerKeys':unclaimed_ids,
 'placeholders':sum(r['placeholderParity']!='exact' for r in review),'markup':sum(r['markupParity']!='exact' for r in review),
 'protected':sum(r['protectedLiteralParity']!='exact' for r in review),'checksumFiles':[p.name for p in files]},ensure_ascii=False,indent=2))
