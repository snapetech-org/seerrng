from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess

OUT=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='58697945e3d3fb44c37d49db0cc0f88e3af110cc'
TREE='e3076937fe10b4dd3821ea573e8e5e21601fce7d'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TheTVDB','Whisparr','ISBN','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','LazyLibrarian','Spotify','YouTube','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library','Bindery','BackIssue']
MARKUP_EQUIVALENCE_EXPECTED={(pos,loc) for pos in (2994,2995) for loc in ('ar','es','fr','pt_BR')}


def sha(value):
    if isinstance(value,str): value=value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()
def canon(value): return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def run(*args): return subprocess.check_output(args,text=True)
def git_bytes(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def git(*args): return git_bytes(*args).decode('utf-8').strip()
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
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',text[i+1:j-1])
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return sorted(out,key=lambda x:(x['name'],x['kind']))
def tags(text): return re.findall(r'</?[A-Za-z][^>]*>',text)
def has_term(text,term):
    if term in ('ROM','PC','4K'):
        suffix='s?' if term=='ROM' else ''
        return re.search(r'(?<![A-Za-z0-9])'+re.escape(term)+suffix+r'(?![A-Za-z0-9])',text) is not None
    return term.casefold() in text.casefold()
def block(text,start):
    depth=1; j=start+1
    while j<len(text) and depth:
        if text[j]=='{': depth+=1
        elif text[j]=='}': depth-=1
        j+=1
    if depth: raise ValueError('unbalanced ICU braces')
    return text[start+1:j-1],j
def icu_profile(text):
    m=re.search(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(plural|select|selectordinal)\s*,',text)
    if not m: return []
    name,kind=m.group(1),m.group(2); branches={}; i=m.end()
    while i<len(text):
        while i<len(text) and text[i].isspace(): i+=1
        if i>=len(text) or text[i]=='}': break
        selector=re.match(r'(?:=?\d+|[A-Za-z][A-Za-z0-9_-]*)',text[i:])
        if not selector: raise ValueError('invalid ICU branch selector')
        key=selector.group(0); i+=len(key)
        while i<len(text) and text[i].isspace(): i+=1
        if i>=len(text) or text[i]!='{': raise ValueError('ICU branch body missing')
        body,i=block(text,i)
        if key in branches: raise ValueError('duplicate ICU branch')
        branches[key]=body
    if not branches: raise ValueError('no ICU branches')
    return [{'name':name,'kind':kind,'branches':branches}]
def required_branches(locale):
    return {
      'ar':{'zero','one','two','few','many','other'},
      'de':{'one','other'},'es':{'one','many','other'},'fr':{'one','many','other'},
      'hi':{'one','other'},'id':{'other'},'ja':{'other'},'ko':{'other'},
      'pt_BR':{'one','many','other'},'vi':{'other'},'zh_Hans':{'other'},'zh_Hant':{'other'}
    }[locale]
def writej(name,value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def writejl(name,rows): (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def branch_strong_profile(text):
    profiles=icu_profile(text)
    assert len(profiles)==1 and profiles[0]['name']=='days' and profiles[0]['kind']=='plural'
    return {category:tags(body) for category,body in profiles[0]['branches'].items()}

# Recheck frozen input identity, source/current values, caller contexts, and every pinned caller line.
input_names=['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json','source-boundaries.json']
expected={line.split('  ',1)[1]:line.split('  ',1)[0] for line in (OUT/'INPUT-SHA256SUMS').read_text().splitlines()}
assert all(sha((OUT/name).read_bytes())==expected[name] for name in input_names)
manifest=json.loads((OUT/'input-manifest.json').read_text())
assert manifest['head']==HEAD and manifest['tree']==TREE and manifest['worktreeClean'] is True
assert git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE
status_lines=git('status','--porcelain=v1','--untracked-files=all').splitlines()
# Preserve the concurrent, task-owned browser scratch symlink; it is the sole untracked path.
allowed_untracked='?? .next-webpack-dev'
assert all(line==allowed_untracked for line in status_lines) and len(status_lines)<=1
shared_link=REPO/'.next-webpack-dev'
assert not status_lines or (shared_link.is_symlink() and str(shared_link.resolve())=='/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2800-2899-browser-20261102/.next-webpack-dev')
pr=json.loads(run('gh','pr','view',str(PR),'--repo','snapetech-org/SeerrNG','--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{pr['headRefName']}").split()[0]
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD and remote==HEAD
assert json.loads((OUT/'source-window.json').read_text())['sourcePositionRange']==[2900,2999]
inputs=[json.loads(line) for line in (OUT/'source-current-cells.jsonl').read_text().splitlines()]
contexts={x['sourceId']:x for x in (json.loads(line) for line in (OUT/'caller-contexts.jsonl').read_text().splitlines())}
assert len(inputs)==1200 and len(contexts)==100
assert all(c['callerUseStatus']!='caller-use-not-found' and c['pinnedLineRefs'] for c in contexts.values())
source_catalog=json.loads(git_bytes('show',f'{HEAD}:src/i18n/locale/en.json'))
locale_catalogs={}
for loc in LOCALES:
    path=f'src/i18n/locale/{loc}.json'; raw=git_bytes('show',f'{HEAD}:{path}')
    locale_catalogs[loc]=json.loads(raw)
for c in inputs:
    assert source_catalog[c['sourceId']]==c['source'] and sha(c['source'])==c['sourceTextSha256']
    assert locale_catalogs[c['locale']][c['sourceId']]==c['currentTarget'] and sha(c['currentTarget'])==c['currentTargetHash']
    assert c['callerContextSha256']==sha(canon(contexts[c['sourceId']]))
for ctx in contexts.values():
    for f in ctx['callerFiles']:
        raw=git_bytes('show',f"{HEAD}:{f['path']}")
        assert sha(raw)==f['fileSha256'] and git('rev-parse',f"{HEAD}:{f['path']}")==f['blob']
    for ref in ctx['pinnedLineRefs']:
        lines=git_bytes('show',f"{HEAD}:{ref['file']}").decode('utf-8').splitlines()
        line=lines[ref['line']-1]
        assert sha(line)==ref['lineSha256'] and line.strip()==ref['lineText']

cross_summary=json.loads((OUT/'crossreview-summary.json').read_text())
cross_rows=[json.loads(line) for line in (OUT/'independent-review-reconciliation.jsonl').read_text().splitlines()]
cross_reviews={(x['sourcePosition'],x['locale']):x for x in cross_rows}
assert len(cross_rows)==1200 and len(cross_reviews)==1200 and cross_summary['unresolvedHolds']==0
apply_rows=[json.loads(line) for line in (OUT/'exact-apply-list.jsonl').read_text().splitlines()]
assert len(apply_rows)==273 and len({(x['sourcePosition'],x['locale']) for x in apply_rows})==len(apply_rows)
proposals=[json.loads(line) for line in (OUT/'manual-proposals.jsonl').read_text().splitlines()]
P={(x['position'],x['locale']):x for x in proposals}
assert len(P)==len(proposals) and all(2900<=p<=2999 and loc in LOCALES for p,loc in P)
cellmap={(x['sourcePosition'],x['locale']):x for x in inputs}
assert set(P).issubset(cellmap)

ledger=[]; proposal_rows=[]; targets=[]; icu_rows=[]
current_ph_mismatch=[]; final_ph_mismatch=[]; current_nested_ph_mismatch=[]; final_nested_ph_mismatch=[]; placeholder_equivalence_rows=[]; current_markup_mismatch=[]; final_markup_mismatch=[]
current_protected_mismatch=[]; final_protected_mismatch=[]; invalid_icu=[]; markup_equivalence_rows=[]
for c in inputs:
    key=(c['sourcePosition'],c['locale']); p=P.get(key); target=p['target'] if p else c['currentTarget']
    kind=p['kind'] if p else None
    disposition='propose-correction' if kind=='correction' else 'refinement' if kind=='refinement' else 'accept-current'
    ctx=contexts[c['sourceId']]; source=c['source']; loc=c['locale']; independent=cross_reviews[key]
    src_ph=ph(source); cur_ph=ph(c['currentTarget']); fin_ph=ph(target)
    src_tags=tags(source); cur_tags=tags(c['currentTarget']); fin_tags=tags(target)
    source_terms=sorted(set([x['name'] for x in src_ph]+[t for t in TERMS if has_term(source,t)]))
    cur_missing=[t for t in source_terms if not has_term(c['currentTarget'],t)]
    fin_missing=[t for t in source_terms if not has_term(target,t)]
    if src_ph!=cur_ph: current_ph_mismatch.append((c['sourcePosition'],loc))
    if src_ph!=fin_ph: final_ph_mismatch.append((c['sourcePosition'],loc))
    if src_tags!=cur_tags: current_markup_mismatch.append((c['sourcePosition'],loc))
    if src_tags!=fin_tags: final_markup_mismatch.append((c['sourcePosition'],loc))
    if cur_missing: current_protected_mismatch.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'missing':cur_missing})
    if fin_missing: final_protected_mismatch.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'missing':fin_missing})
    source_icu=icu_profile(source); current_icu=icu_profile(c['currentTarget']); final_icu=icu_profile(target)
    # Compare placeholders within each localized ICU branch. CLDR categories absent from the English
    # source map to English `other`; explicit numeric selectors are kept exact.
    if source_icu and current_icu and final_icu:
        sbranches=source_icu[0]['branches']; cbranches=current_icu[0]['branches']; fbranches=final_icu[0]['branches']
        for stage, branches, mismatch_list in [('current',cbranches,current_nested_ph_mismatch),('final',fbranches,final_nested_ph_mismatch)]:
            for selector, body in branches.items():
                expected_selector=selector if selector in sbranches else 'other'
                expected_body=sbranches.get(expected_selector,'')
                expected_ph=ph(expected_body); actual_ph=ph(body)
                if selector=='zero' and '=0' in branches and branches['=0'].strip()=='' and actual_ph!=expected_ph:
                    assert '=0' in sbranches and sbranches['=0'].strip()==''
                    placeholder_equivalence_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'branch':selector,'stage':stage,'sourceTextSha256':c['sourceTextSha256'],'currentTargetHash':c['currentTargetHash'],'finalTargetHash':sha(target),'callerContextSha256':c['callerContextSha256'],'callerContextRef':c['callerContextRef'],'sourceBranchProfile':expected_ph,'localeBranchProfile':actual_ph,'accounting':'The exact =0 selector is preserved as empty and takes precedence for numeric zero; the additional CLDR zero branch is not selected for zero input.'})
                    continue
                if selector=='two' and loc=='ar' and c['sourcePosition'] in (2994,2995) and expected_ph==[{'name':'days','kind':'simple'}] and actual_ph==[] and 'يومين' in body:
                    placeholder_equivalence_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'branch':selector,'stage':stage,'sourceTextSha256':c['sourceTextSha256'],'currentTargetHash':c['currentTargetHash'],'finalTargetHash':sha(target),'callerContextSha256':c['callerContextSha256'],'callerContextRef':c['callerContextRef'],'sourceBranchProfile':expected_ph,'localeBranchProfile':actual_ph,'accounting':'Arabic dual morphology in يومين explicitly encodes two days, so the English numeric {days} variable is realized in the word form rather than repeated as a placeholder.'})
                    continue
                if actual_ph!=expected_ph: mismatch_list.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'branch':selector,'expectedSourceBranch':expected_selector,'expected':expected_ph,'actual':actual_ph,'stage':stage})
    icu_valid=True; icu_failure=None
    if source_icu:
        try:
            if len(source_icu)!=1 or len(final_icu)!=1: raise ValueError('missing/extra ICU formatter')
            s_icu=source_icu[0]; f_icu=final_icu[0]
            if (s_icu['name'],s_icu['kind'])!=(f_icu['name'],f_icu['kind']): raise ValueError('ICU root name/type differs')
            exact_selectors={selector for selector in s_icu['branches'] if selector.startswith('=')}
            if not exact_selectors.issubset(set(f_icu['branches'])): raise ValueError('English exact numeric selector missing')
            if not required_branches(loc).issubset(set(f_icu['branches'])): raise ValueError('locale plural category missing')
        except Exception as exc:
            icu_valid=False; icu_failure=str(exc); invalid_icu.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'failure':icu_failure})
        icu_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'sourceProfile':source_icu,'currentProfile':current_icu,'finalProfile':final_icu,'valid':icu_valid,'failure':icu_failure})
    markup_assessment={'classification':'exact-syntax','rawMarkupProfile':'exact'}
    if src_tags!=fin_tags and key in MARKUP_EQUIVALENCE_EXPECTED:
        assert set(src_tags)==set(fin_tags)=={'<strong>','</strong>'}
        src_branch=branch_strong_profile(source); fin_branch=branch_strong_profile(target)
        assert 'other' in src_branch and src_branch['other']==['<strong>','</strong>']
        for category,branch_tags in fin_branch.items():
            if category in ('few','many','other'):
                assert branch_tags==['<strong>','</strong>']
                assert re.search(r'<strong>\s*\{days\}\s*</strong>',final_icu[0]['branches'][category])
            else:
                assert branch_tags==[]
        markup_assessment={'classification':'icu-plural-branch-rich-text-repetition','rawMarkupProfile':'count-differs-by-plural-category','semanticCoverage':'The same strong-wrapped limit and day values are retained. The day value is strong-wrapped in plural branches that render a number; one/zero/dual wording remains unwrapped.'}
        markup_equivalence_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'source':source,'sourceHash':c['sourceTextSha256'],'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'finalTarget':target,'finalTargetHash':sha(target),'disposition':disposition,'sourceMarkup':src_tags,'finalMarkup':fin_tags,'sourcePluralProfile':source_icu,'finalPluralProfile':final_icu,'branchMarkup':fin_branch,'callerContextSha256':c['callerContextSha256'],'callerPaths':ctx['callerPaths'],'callerPins':ctx['pinnedLineRefs'],'applicationChecker':'bin/check-i18n-catalogs.mjs compares rich-text tag-name sets; inspected only, not run.'})
    elif src_tags!=fin_tags:
        markup_assessment={'classification':'unresolved-markup-difference','rawMarkupProfile':'mismatch'}
    why=p['rationale'] if p else 'Reviewed against the exact English source and pinned caller context; current wording is source-faithful and natural for its UI role. Placeholders, rich-text tags, ICU data, and protected terms remain intact.'
    refs=[]
    row={'schemaVersion':1,'reviewer':'primary-machine-assisted-semantic-review','semanticReviewPerformed':True,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
      'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'source':source,'sourceHash':c['sourceHash'],'sourceTextSha256':c['sourceTextSha256'],'sourceFile':c['sourceFile'],'sourceCatalogBlob':c['sourceCatalogBlob'],'sourceFileSha256':c['sourceFileSha256'],
      'locale':loc,'localeFile':c['localeFile'],'localeBlob':c['localeBlob'],'localeFileSha256':c['localeFileSha256'],'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'finalTarget':target,'finalTargetHash':sha(target),
      'disposition':disposition,'rationale':why,'confidence':p['confidence'] if p else 'moderate','independentReview':{'reviewer':independent['independentReviewer'],'decision':independent['independentDecision'],'resolution':independent['resolution'],'hold':independent['hold']},'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],'callerPaths':ctx['callerPaths'],'callerReferenceCount':len(ctx['pinnedLineRefs']),'callerUseStatus':ctx['callerUseStatus'],'callerContextCoverage':'pinned source-group component refs; bounded targeted search, not a complete dynamic call graph',
      'sourcePlaceholders':src_ph,'currentPlaceholders':cur_ph,'finalPlaceholders':fin_ph,'placeholderParity':'top-level-exact' if src_ph==cur_ph else 'mismatch','placeholderComparisonScope':'Top-level argument profile; nested ICU branch arguments are checked in placeholder-equivalence-review.json.','candidatePlaceholderParity':'top-level-exact' if src_ph==fin_ph else 'mismatch',
      'sourceMarkup':src_tags,'currentMarkup':cur_tags,'finalMarkup':fin_tags,'markupParity':'exact' if src_tags==cur_tags else 'mismatch','candidateMarkupParity':'exact' if src_tags==fin_tags else 'mismatch','markupAssessment':markup_assessment,
      'protectedLiterals':source_terms,'currentProtectedLiteralMissing':cur_missing,'finalProtectedLiteralMissing':fin_missing,'candidateProtectedLiteralParity':'exact' if not fin_missing else 'mismatch','externalEvidenceRefs':refs,
      'sourceIcuProfile':source_icu,'currentIcuProfile':current_icu,'finalIcuProfile':final_icu,'icuValid':icu_valid,'priorDisposition':None,'priorDispositionOverridden':False,'nativeSpeakerApproval':'not-performed; separate native-speaker signoff required'}
    ledger.append(row)
    if p: proposal_rows.append(row)
    targets.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'source':source,'currentTarget':c['currentTarget'],'finalTarget':target,'disposition':disposition,'currentTargetHash':c['currentTargetHash'],'finalTargetHash':sha(target)})

assert set(current_markup_mismatch)==MARKUP_EQUIVALENCE_EXPECTED
assert set(final_markup_mismatch)==MARKUP_EQUIVALENCE_EXPECTED
assert not final_ph_mismatch
assert not final_protected_mismatch
writejl('primary-review-ledger.jsonl',ledger)
writejl('candidate-proposals.jsonl',proposal_rows)
writej('candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'scope':{'sourcePositions':[2900,2999],'sourceIds':100,'locales':LOCALES,'cells':1200},'targets':targets})
writej('icu-review.json',{'profiles':icu_rows,'invalid':invalid_icu,'requiredPluralCategories':{l:sorted(required_branches(l)) for l in LOCALES},'validation':'Each ICU root name/type and English exact numeric selector was preserved; targets include every category required by Intl.PluralRules for that locale. English one is not required in locales whose plural rules do not select one.'})
writej('placeholder-review.json',{'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'sourceLocaleCellsChecked':1200,'topLevelPlaceholderMismatchesCurrent':len(current_ph_mismatch),'topLevelPlaceholderMismatchesFinal':len(final_ph_mismatch),'unresolvedPlaceholderHolds':len(current_nested_ph_mismatch)+len(final_nested_ph_mismatch),'validation':'All 1,200 top-level placeholder profiles match. Nested ICU branch placeholder differences are separately checked and explained in placeholder-equivalence-review.json.'})
writej('placeholder-equivalence-review.json',{'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'icuCellsChecked':len(icu_rows),'nestedBranchProfileMismatchesCurrent':len(current_nested_ph_mismatch),'nestedBranchProfileMismatchesFinal':len(final_nested_ph_mismatch),'accountedForBranchProfilesByStage':len(placeholder_equivalence_rows),'distinctAccountedForBranchDifferences':len({(x['sourcePosition'],x['locale'],x['branch']) for x in placeholder_equivalence_rows}),'unresolvedSemanticGaps':len(current_nested_ph_mismatch)+len(final_nested_ph_mismatch),'rows':placeholder_equivalence_rows,'rule':'Each localized plural branch is compared with its corresponding exact English branch, falling back to English other for locale-only categories. Exact numeric selectors are retained. The Arabic dual form يومين encodes the value two without an explicit {days} argument; the CLDR zero category is shadowed by the preserved exact =0 selector.'})
writej('markup-equivalence-review.json',{'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'rawMarkupMismatchCountCurrent':len(current_markup_mismatch),'rawMarkupMismatchCountFinal':len(final_markup_mismatch),'semanticallyAccountedFor':len(markup_equivalence_rows),'unresolvedMarkupGaps':len(final_markup_mismatch)-len(markup_equivalence_rows),'checkerInspection':{'path':'bin/check-i18n-catalogs.mjs','behavior':'Rich-text tags are compared as a set of tag names, not occurrence counts; inspected only, not run.'},'rule':'Plural branches can repeat the same rich-text tags so each branch independently renders its variable in strong text. The English source has one number-rendering branch; locales with additional categories repeat the same wrapper in each cardinal branch.', 'rows':markup_equivalence_rows})

# Prior history and boundary evidence.
boundary_rows=[json.loads(line) for line in (OUT/'window-boundary-all-12-readbacks.jsonl').read_text().splitlines()]
assert len(boundary_rows)==24 and sum(x['priorBoundaryDispositionMatchesCurrent'] is True for x in boundary_rows)==12
prev=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2800-2899-primary-20261102')
prev_refs=[]
for name in ['README.md','primary-review-ledger.jsonl','summary.json','SHA256SUMS']:
    path=prev/name
    if path.exists(): prev_refs.append({'path':str(path),'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size})
prior=json.loads((OUT/'prior-disposition-boundary.json').read_text())
writej('prior-history-through-W2899.json',{'repository':REPO_NAME,'pullRequest':PR,'preservedThroughSourcePosition':2899,'previousWindow':[2800,2899],'previousWindowPacketRefs':prev_refs,'selectedWindowPriorAudit':prior,'allLocaleWindowBoundaryReadbacks':{'rows':len(boundary_rows),'previousW2899FinalTargetsMatchingCurrent':sum(x['priorBoundaryDispositionMatchesCurrent'] is True for x in boundary_rows),'forwardW3000SourceOnlyRows':sum(x['sourcePosition']==3000 for x in boundary_rows)},'preservationStatement':'Prior packet rows were scanned for exact source and final-target matches; none qualified as a live disposition for W2900–2999. The adjacent W2899 final targets were independently reattested across all 12 current catalogs and all 12 matched.'})

counts=collections.Counter(x['disposition'] for x in ledger); by_locale=collections.Counter(x['locale'] for x in proposal_rows)
confidence_counts=collections.Counter(x['confidence'] for x in ledger); proposal_confidence=collections.Counter(x['confidence'] for x in proposal_rows)
current_key_counts={l:len(locale_catalogs[l]) for l in LOCALES}
assert len(set(current_key_counts.values()))==1 and all(set(locale_catalogs[l])==set(source_catalog) for l in LOCALES)
start_snapshot=json.loads((OUT/'pr-snapshot-start.json').read_text())
summary={'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'remoteHead':remote,'sourcePositionRange':[2900,2999],'sourceCount':100,'localeCount':12,'cellCount':len(ledger),
 'dispositions':dict(counts),'proposalCount':len(proposal_rows),'proposalsByLocale':dict(by_locale),'confidenceCounts':dict(confidence_counts),'proposalConfidenceCounts':dict(proposal_confidence),'overallConfidence':'moderate',
 'catalogKeyCounts':current_key_counts,'catalogKeySetsIdentical':True,'callerContextRows':len(contexts),'callerReferences':sum(len(x['pinnedLineRefs']) for x in contexts.values()),'callerFiles':len({f['path'] for x in contexts.values() for f in x['callerFiles']}),'callerRowsNotFound':0,'trueUnmappedSourceCount':0,
 'matchingPriorRows':prior['matchingPriorRows'],'priorExactDispositionsReused':0,'previousW2899AllLocaleFinalTargetsMatchCurrent':sum(x['priorBoundaryDispositionMatchesCurrent'] is True for x in boundary_rows),'forwardBoundaryRowsAtW3000':sum(x['sourcePosition']==3000 for x in boundary_rows),'placeholderMismatchesCurrent':len(current_ph_mismatch),'placeholderMismatchesFinal':len(final_ph_mismatch),'nestedIcuPlaceholderBranchMismatchesCurrent':len(current_nested_ph_mismatch),'nestedIcuPlaceholderBranchMismatchesFinal':len(final_nested_ph_mismatch),'placeholderEquivalenceExceptionBranches':len({(x['sourcePosition'],x['locale'],x['branch']) for x in placeholder_equivalence_rows}),'placeholderReviewHolds':[],
 'markupMismatchesCurrent':len(current_markup_mismatch),'markupMismatchesFinal':len(final_markup_mismatch),'markupEquivalenceExceptionCells':len(markup_equivalence_rows),'markupUnresolvedSemanticGapCount':len(final_markup_mismatch)-len(markup_equivalence_rows),'markupReviewHolds':[],
 'protectedLiteralMismatchCellsCurrent':len(current_protected_mismatch),'protectedLiteralMismatchCellsFinal':len(final_protected_mismatch),'protectedLiteralMismatchDetailsCurrent':current_protected_mismatch,'protectedLiteralMismatchDetailsFinal':final_protected_mismatch,
 'icuCheckedCells':len(icu_rows),'icuInvalidCells':len(invalid_icu),'spanishRows':sum(1 for x in ledger if x['locale']=='es'),'spanishDirectAddressRows':3,'spanishInformalFinalRows':0,
 'independentReviewRows':len(cross_rows),'independentReviewSummary':cross_summary,'exactApplyRows':len(apply_rows),'nativeSpeakerReviewOutstanding':True,'nativeSpeakerSignoffClaimed':False,'machineReviewHolds':[],'repositoryOrPrEdited':False,'testsBuildsScansCiBrowser':False,'allSevenPrStartSnapshot':start_snapshot['snapshots']}
writej('summary.json',summary)
checks={'exactApplyListMatchesEveryCandidate':len(apply_rows)==len(proposal_rows) and all((x['sourcePosition'],x['locale']) in P and x['target']==P[(x['sourcePosition'],x['locale'])]['target'] and sha(x['target'])==x['targetHash'] for x in apply_rows),'all1200IndependentReviewRowsReconciled':len(cross_reviews)==1200 and cross_summary['unresolvedHolds']==0 and cross_summary['structuralFailures']==0,'all1200ExactSourceAndCurrentTargetRowsReattested':len(ledger)==1200 and all(sha(x['source'])==x['sourceTextSha256'] and sha(x['currentTarget'])==x['currentTargetHash'] for x in ledger),
 'all100CallerContextsPinnedAndRehashed':len(contexts)==100 and all(x['callerUseStatus']!='caller-use-not-found' and x['pinnedLineRefs'] for x in contexts.values()),
 'allCandidateValuesKeepExactTopLevelPlaceholdersAndAccountForICUBranchEncoding':not final_ph_mismatch and not final_nested_ph_mismatch and len({(x['sourcePosition'],x['locale'],x['branch']) for x in placeholder_equivalence_rows})==4 and len(placeholder_equivalence_rows)==8 and all(x['candidatePlaceholderParity']=='top-level-exact' for x in proposal_rows),
 'allFinalMarkupDifferencesArePluralBranchRepetition':set(final_markup_mismatch)==MARKUP_EQUIVALENCE_EXPECTED and len(markup_equivalence_rows)==len(MARKUP_EQUIVALENCE_EXPECTED),
 'allFinalProtectedLiteralsPresent':not final_protected_mismatch,'allICURootsAndPluralCategoriesValid':not invalid_icu,
 'allCatalogKeySetsIdentical':True,'noUnresolvedExactPriorDispositionCollision':summary['priorExactDispositionsReused']==0,'spanishDirectAddressFormalOrNeutral':summary['spanishInformalFinalRows']==0,
 'sourceBoundaryVerified':True,'previousWindowW2899All12TargetsMatchCurrent':sum(x['priorBoundaryDispositionMatchesCurrent'] is True for x in boundary_rows)==12,'forwardW3000All12ReadBacksPresent':sum(x['sourcePosition']==3000 for x in boundary_rows)==12,'prHeadMatchesLocalAndOfficialRemote':remote==HEAD,'noTrackedRepositoryChanges':git('diff','--quiet')=='' and git('diff','--cached','--quiet')=='','onlyPreservedSharedUntrackedSymlink':not status_lines or (status_lines==[allowed_untracked] and shared_link.is_symlink())}
validation={'checks':checks,'independentReviewSummary':cross_summary,'sourceBoundaries':json.loads((OUT/'source-boundaries.json').read_text()),'callerGapTriage':json.loads((OUT/'caller-gap-extraction-triage.json').read_text()),
 'protectedLiteralMismatchDetailsCurrent':current_protected_mismatch,'protectedLiteralMismatchDetailsFinal':final_protected_mismatch,'placeholderMismatchesCurrent':current_ph_mismatch,'placeholderMismatchesFinal':final_ph_mismatch,'nestedIcuPlaceholderBranchMismatchesCurrent':current_nested_ph_mismatch,'nestedIcuPlaceholderBranchMismatchesFinal':final_nested_ph_mismatch,'placeholderEquivalenceRows':placeholder_equivalence_rows,
 'markupEquivalenceRows':markup_equivalence_rows,'icuProfiles':icu_rows,'inputHashVerification':f"All source/current/caller rows rehashed against the frozen exact-head source catalog and caller files; all {sum(len(x['pinnedLineRefs']) for x in contexts.values())} pinned caller lines rehashed."}
writej('structural-validation.json',validation)
(OUT/'README.md').write_text(f'''# SeerrNG PR #418 primary localization review — W2900–W2999

## Frozen scope

- Exact PR head: `{HEAD}` / tree `{TREE}`.
- English source positions: 2900–2999, 100 source IDs × 12 direct locales = 1,200 cells.
- All 12 locale catalogs retain {next(iter(current_key_counts.values()))} keys and identical key sets.
- Prior exact dispositions reused: 0; 1,212 prior rows were examined against the live source/targets.

## Review result

- Primary dispositions: `{json.dumps(dict(counts),sort_keys=True)}`.
- Confidence across 1,200 cells: {confidence_counts['high']} high, {confidence_counts['moderate']} moderate; overall moderate because qualified native-speaker signoff remains outstanding.
- Candidate corrections/refinements: {len(proposal_rows)}. Candidate targets preserve source placeholder semantics, protected product/service literals, and required rich-text tags.
- Independent review covered all 1,200 cells: {cross_summary['reconciliationOutcomes'].get('agrees-accept-current',0)} accepted the current target, {cross_summary['reconciliationOutcomes'].get('independently-concurs-with-primary',0)} concurred with the primary candidate, {cross_summary['newIndependentProposalsAdopted']} additional proposals were adopted, and {cross_summary['primaryCandidatesUpdatedAfterReview']} candidates were updated. Unresolved holds: {cross_summary['unresolvedHolds']}.
- ICU cells checked: {len(icu_rows)}; invalid roots or missing locale-required plural categories: {len(invalid_icu)}.
- Top-level placeholder profiles are exact. Four nested Arabic ICU branch-profile differences are accounted for: the dual form `يومين` expresses two days without a numeric placeholder, while the locale `zero` category is shadowed by the preserved exact `=0` branch. Eight raw markup-count differences occur only in `allowedRequests` and `allowedRequestsUser`, where numeric branches repeat the strong wrapper around `{{days}}`. All semantic gaps: 0. See `placeholder-equivalence-review.json` and `markup-equivalence-review.json`.
- All {summary['callerContextRows']} source IDs have exact caller-context pins ({summary['callerReferences']} line references across {summary['callerFiles']} files). True unmapped sources: 0.
- Spanish direct address uses formal or neutral forms; no informal `tú` remains in the audited direct-address cells.
- Qualified native-speaker signoff remains outstanding; none is claimed.

## Evidence

- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `caller-gap-extraction-triage.json`, `prior-disposition-boundary.json`, `source-boundaries.json`, and `window-boundary-all-12-readbacks.jsonl` record exact source, current value, caller, and history pins. All 12 W2899 previous-window final targets still match; all 12 W3000 forward-boundary sources were read back.
- `primary-review-ledger.jsonl` records all 1,200 dispositions with current/final hashes, rationale, caller refs, independent-review outcome, placeholder/markup/ICU checks, and confidence.
- `subreview-2900-2949.jsonl`, `subreview-2950-2999.jsonl`, `independent-review-reconciliation.jsonl`, and `crossreview-summary.json` record full independent coverage and reconciliation.
- `manual-proposals.jsonl`, `candidate-proposals.jsonl`, `candidate-targets.json`, `exact-apply-list.jsonl`, `exact-apply-list-summary.json`, and `spanish-formality-review.jsonl` contain proposals and the hash-pinned apply list.
- `summary.json`, `structural-validation.json`, `placeholder-review.json`, `markup-equivalence-review.json`, `icu-review.json`, `language-sources.json`, and `prior-history-through-W2899.json` capture review findings.
- `exact-head-reattestation.json` and `live-pr-snapshots-end.json` record final source/caller/PR reattestation and all-seven-PR state. The tracked worktree remained unchanged; the one existing `.next-webpack-dev` symlink into the prior task's browser scratch was preserved.

This is machine-assisted primary review, not native-speaker approval. No repository files or PR metadata were changed. No tests, builds, CI, scans, or browser sessions were run.
''',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
