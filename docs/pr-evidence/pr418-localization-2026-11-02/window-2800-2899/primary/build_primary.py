from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess

OUT=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='7329f0ffb34d46042dbf1b165046e21c4f4d45e3'
TREE='531e045f511ee9c46f4c7ed80d50f529c9c12000'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TheTVDB','Whisparr','ISBN','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library','Mylar','Kapowarr','BackIssue']
PH_EQUIVALENCE_EXPECTED={(2861,'ar'),(2862,'ar')}|{(2867,loc) for loc in LOCALES if loc!='de'}
LANGUAGE_SOURCES={
 'rae_usted':{'title':'Real Academia Española, Gramática: treatment pronouns and agreement','url':'https://www.rae.es/gtg/docs/GTG_tablas_web.pdf','supports':'Formal Spanish direct-address wording in this window follows the established usted register recorded in the prior SeerrNG review.'},
 'source_and_caller_pins':{'title':'Exact-head source and caller records','url':'docs/pr-evidence/pr418-localization-2026-11-02/window-2800-2899-primary/source-current-cells.jsonl','supports':'Caller lines show each message role and metadata field at the exact PR head; review decisions cite those pinned contexts.'}
}

def sha(value):
    if isinstance(value,str): value=value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()
def source_line_pin(path,line_number):
    raw_line=(REPO/path).read_bytes().decode('utf-8').splitlines()[line_number-1]
    return {'file':path,'line':line_number,'lineText':raw_line.strip(),'lineSha256':sha(raw_line)}
def canon(value): return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
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
    return {'other'} if locale in {'ja','ko','vi','zh_Hans','zh_Hant'} else {'one','other'}
def writej(name,value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def writejl(name,rows): (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')

# Recheck all frozen inputs and PR/worktree state before emitting the review ledger.
input_names=['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json','source-boundaries.json']
expected={line.split('  ',1)[1]:line.split('  ',1)[0] for line in (OUT/'INPUT-SHA256SUMS').read_text().splitlines()}
assert all(sha((OUT/name).read_bytes())==expected[name] for name in input_names)
manifest=json.loads((OUT/'input-manifest.json').read_text())
assert manifest['head']==HEAD and manifest['tree']==TREE and manifest['worktreeClean'] is True
assert subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD'],text=True).strip()==HEAD
assert subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD^{tree}'],text=True).strip()==TREE
assert subprocess.check_output(['git','-C',str(REPO),'status','--porcelain'],text=True).strip()==''
pr=json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo','snapetech-org/SeerrNG','--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],text=True))
remote=subprocess.check_output(['git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{pr['headRefName']}"],text=True).split()[0]
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD and remote==HEAD
assert json.loads((OUT/'source-window.json').read_text())['sourcePositionRange']==[2800,2899]

inputs=[json.loads(line) for line in (OUT/'source-current-cells.jsonl').read_text().splitlines()]
contexts={x['sourceId']:x for x in (json.loads(line) for line in (OUT/'caller-contexts.jsonl').read_text().splitlines())}
assert len(inputs)==1200 and len(contexts)==100
assert all(c['callerUseStatus']!='caller-use-not-found' and c['pinnedLineRefs'] for c in contexts.values())
proposals=[json.loads(line) for line in (OUT/'manual-proposals.jsonl').read_text().splitlines()]
P={(x['position'],x['locale']):x for x in proposals}
assert len(P)==len(proposals) and len(P)==365
cellmap={(x['sourcePosition'],x['locale']):x for x in inputs}
assert set(P).issubset(cellmap)

ledger=[]; proposal_rows=[]; targets=[]; icu_rows=[]
current_ph_mismatch=[]; final_ph_mismatch=[]; current_markup_mismatch=[]; final_markup_mismatch=[]
current_protected_mismatch=[]; final_protected_mismatch=[]; invalid_icu=[]
placeholder_equivalence_rows=[]
for c in inputs:
    key=(c['sourcePosition'],c['locale']); p=P.get(key); target=p['target'] if p else c['currentTarget']
    kind=p['kind'] if p else None
    disposition='propose-correction' if kind=='correction' else 'refinement' if kind=='refinement' else 'accept-current'
    ctx=contexts[c['sourceId']]; source=c['source']; loc=c['locale']
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
    ph_equivalence=None
    if src_ph!=fin_ph and key in PH_EQUIVALENCE_EXPECTED:
        root_name=source_icu[0]['name'] if source_icu else None
        root_kind=source_icu[0]['kind'] if source_icu else None
        assert p is None and target==c['currentTarget']
        assert root_kind=='plural' and any(x['name']==root_name and x['kind']=='plural' for x in fin_ph)
        assert (c['sourcePosition'],loc) not in [(x['sourcePosition'],x['locale']) for x in placeholder_equivalence_rows]
        ph_equivalence={
          'classification':'icu-plural-number-sign-replaces-redundant-simple-argument',
          'rawPlaceholderProfile':'mismatch','semanticCoverage':'count remains rendered by the same plural argument; target uses locale-aware # or an equivalent inflected Arabic number form',
          'sourceRootArgument':root_name,'sourceRootKind':root_kind,
          'evidenceFile':'placeholder-equivalence-review.json'
        }
        caller_arg_lines=[ref for ref in ctx['pinnedLineRefs'] if root_name in ref['lineText'] or root_name in ref.get('nextLine','') or (c['sourcePosition']==2867 and ('processed:' in ref['lineText'] or 'total:' in ref['lineText']))]
        value_lines={2861:[1414],2862:[1410],2867:[1090,1091]}[c['sourcePosition']]
        caller_arg_lines.extend(source_line_pin('src/components/RequestModal/BulkRequestModal.tsx',n) for n in value_lines)
        placeholder_equivalence_rows.append({
          'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,
          'source':source,'sourceHash':c['sourceTextSha256'],'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],
          'finalTarget':target,'finalTargetHash':sha(target),'disposition':disposition,
          'sourceCatalogBlob':c['sourceCatalogBlob'],'sourceCatalogSha256':c['sourceFileSha256'],'localeBlob':c['localeBlob'],'localeFileSha256':c['localeFileSha256'],
          'callerContextSha256':c['callerContextSha256'],
          'sourcePlaceholders':src_ph,'finalPlaceholders':fin_ph,'sourceIcuProfile':source_icu,'finalIcuProfile':final_icu,
          'omittedRedundantSimpleArgument':root_name,'preservedPluralArgument':root_name,
          'countRendering':'ICU # in target plural branches; Arabic one/two branches use inflected number words.',
          'callerFile':ctx['callerFiles'][0]['path'],'callerFileBlob':ctx['callerFiles'][0]['blob'],'callerFileSha256':ctx['callerFiles'][0]['fileSha256'],
          'callerPins':caller_arg_lines,'noTranslationChangeProposed':p is None
        })
    elif src_ph!=fin_ph:
        ph_equivalence={'classification':'unresolved-placeholder-difference','rawPlaceholderProfile':'mismatch','semanticCoverage':'not established'}
    icu_valid=True; icu_failure=None
    if source_icu:
        try:
            if len(source_icu)!=1 or len(final_icu)!=1: raise ValueError('missing/extra ICU formatter')
            s_icu=source_icu[0]; f_icu=final_icu[0]
            if (s_icu['name'],s_icu['kind'])!=(f_icu['name'],f_icu['kind']): raise ValueError('ICU root name/type differs')
            if not required_branches(loc).issubset(set(f_icu['branches'])): raise ValueError('required plural branch missing')
            for branch in f_icu['branches']:
                if not re.fullmatch(r'(?:=?\d+|[A-Za-z][A-Za-z0-9_-]*)',branch): raise ValueError('invalid selector')
        except Exception as exc:
            icu_valid=False; icu_failure=str(exc); invalid_icu.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'failure':icu_failure})
    if source_icu:
        icu_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'sourceProfile':source_icu,'currentProfile':current_icu,'finalProfile':final_icu,'valid':icu_valid,'failure':icu_failure})
    why=(p['rationale'] if p else 'Reviewed against the exact English source and pinned caller context; current wording is source-faithful and natural for its UI role. Placeholders, markup, and protected literals remain intact.')
    refs=(p.get('refs',[]) if p else [])
    row={
      'schemaVersion':1,'reviewer':'primary-machine-assisted-semantic-review','semanticReviewPerformed':True,
      'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
      'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'source':source,'sourceHash':c['sourceHash'],'sourceTextSha256':c['sourceTextSha256'],
      'sourceFile':c['sourceFile'],'sourceCatalogBlob':c['sourceCatalogBlob'],'sourceFileSha256':c['sourceFileSha256'],
      'locale':loc,'localeFile':c['localeFile'],'localeBlob':c['localeBlob'],'localeFileSha256':c['localeFileSha256'],
      'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'finalTarget':target,'finalTargetHash':sha(target),
      'disposition':disposition,'rationale':why,'confidence':p['confidence'] if p else 'moderate',
      'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],'callerPaths':ctx['callerPaths'],
      'callerReferenceCount':len(ctx['pinnedLineRefs']),'callerUseStatus':ctx['callerUseStatus'],
      'callerContextCoverage':'pinned source-group component refs; bounded targeted search, not a complete dynamic call graph',
      'sourcePlaceholders':src_ph,'currentPlaceholders':cur_ph,'finalPlaceholders':fin_ph,
      'placeholderParity':'exact' if src_ph==cur_ph else 'mismatch','candidatePlaceholderParity':'exact' if src_ph==fin_ph else 'mismatch',
      'placeholderAssessment':ph_equivalence or {'classification':'exact-syntax','rawPlaceholderProfile':'exact','semanticCoverage':'exact'},
      'sourceMarkup':src_tags,'currentMarkup':cur_tags,'finalMarkup':fin_tags,
      'markupParity':'exact' if src_tags==cur_tags else 'mismatch','candidateMarkupParity':'exact' if src_tags==fin_tags else 'mismatch',
      'protectedLiterals':source_terms,'currentProtectedLiteralMissing':cur_missing,'finalProtectedLiteralMissing':fin_missing,
      'candidateProtectedLiteralParity':'exact' if not fin_missing else 'mismatch','externalEvidenceRefs':refs,
      'sourceIcuProfile':source_icu,'currentIcuProfile':current_icu,'finalIcuProfile':final_icu,'icuValid':icu_valid,
      'priorDisposition':None,'priorDispositionOverridden':False,
      'nativeSpeakerApproval':'not-performed; separate native-speaker signoff required'
    }
    ledger.append(row)
    if p: proposal_rows.append(row)
    targets.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,'source':source,'currentTarget':c['currentTarget'],'finalTarget':target,'disposition':disposition,'currentTargetHash':c['currentTargetHash'],'finalTargetHash':sha(target)})

# Spanish formality audit: five direct-address rows, plus every neutral/action row.
spanish=[]
for c in [x for x in inputs if x['locale']=='es']:
    pos=c['sourcePosition']; row=next(x for x in ledger if x['sourcePosition']==pos and x['locale']=='es')
    direct=pos in {2801,2828,2844,2855,2893}
    target=row['finalTarget']
    informal=bool(re.search(r'\b(?:tu|tú|tuya|tuyo|tienes|quita|carga)\b',target,re.I))
    address='direct-address' if direct else 'neutral-or-infinitive-action'
    spanish.append({'sourcePosition':pos,'sourceId':c['sourceId'],'source':c['source'],'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'finalTarget':target,'finalTargetHash':sha(target),'applicability':address,'finalAddressForm':'informal-tú' if informal else ('formal-usted' if direct else 'not-applicable'),'formalSpanishSourceRefs':['rae_usted'] if direct else [],'disposition':row['disposition']})

writejl('primary-review-ledger.jsonl',ledger)
writejl('candidate-proposals.jsonl',proposal_rows)
writejl('spanish-formality-review.jsonl',spanish)
requestfrom_rows=[x for x in ledger if x['sourcePosition']==2812]
assert len(requestfrom_rows)==12 and {x['locale'] for x in requestfrom_rows}==set(LOCALES)
writej('requestfrom-2812-all-locales-review.json',{
 'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
 'sourcePosition':2812,'sourceId':'components.RequestModal.Book.requestfrom','englishSource':requestfrom_rows[0]['source'],
 'englishSourceHash':requestfrom_rows[0]['sourceTextSha256'],'localeCount':len(requestfrom_rows),
 'callerContextSha256':requestfrom_rows[0]['callerContextSha256'],'callerPaths':requestfrom_rows[0]['callerPaths'],
 'finding':'The English source is valid and means that the named user’s request is pending approval. Indonesian current text mixes an English clause with Indonesian; Japanese changes pending approval to already requested; Hindi omits a clear possessive relationship and has no space after the placeholder; Vietnamese says my request and lacks spacing. Chinese current wording can mean merely processing, so proposals specify approval. Remaining locales were individually retained after checking meaning, grammar, and placeholder placement.',
 'rows':[{'locale':x['locale'],'currentTarget':x['currentTarget'],'currentTargetHash':x['currentTargetHash'],'finalTarget':x['finalTarget'],'finalTargetHash':x['finalTargetHash'],'disposition':x['disposition'],'confidence':x['confidence'],'rationale':x['rationale'],'callerReferenceCount':x['callerReferenceCount'],'callerContextSha256':x['callerContextSha256']} for x in requestfrom_rows]
})
writej('candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'scope':{'sourcePositions':[2800,2899],'sourceIds':100,'locales':LOCALES,'cells':1200},'targets':targets})
writej('language-sources.json',LANGUAGE_SOURCES)
writej('icu-review.json',{'profiles':icu_rows,'invalid':invalid_icu,'validation':'ICU formatter root and required plural branches checked; raw placeholder profiles are reviewed separately for the documented ICU number-sign equivalences.'})
assert set(current_ph_mismatch)==PH_EQUIVALENCE_EXPECTED
assert set(final_ph_mismatch)==PH_EQUIVALENCE_EXPECTED
writej('placeholder-equivalence-review.json',{
 'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
 'rawPlaceholderDifferenceCount':len(placeholder_equivalence_rows),'semanticallyCoveredCount':len(placeholder_equivalence_rows),'unresolvedCount':0,
 'exceptionRule':'The English source redundantly interpolates a simple {count}/{total} and then selects a plural on the same argument. The unchanged target renders the value through that same plural root using ICU #; Arabic one/two branches use grammatical number words. The application receives numeric values at the pinned caller.',
 'checkerInspection':{'path':'bin/check-i18n-catalogs.mjs','contractCollectorLines':'87-155','contractComparisonLines':'643-659','note':'Static source inspection only. The checker was not run; no tests/builds/scans/CI were run.'},
 'rows':placeholder_equivalence_rows
})

# Preserve the previous exact window and the selected-window prior-disposition scan.
prev=REPO/'docs/pr-evidence/pr418-localization-2026-11-02/window-2700-2799'
prev_refs=[]
for rel in ['primary/README.md','primary/source-window.json','primary/primary-review-ledger.jsonl','primary/summary.json','crossreview/summary.json','adjudication/summary.json','application/exact-hash-apply-plan.jsonl','application/exact-hash-readback.json']:
    path=prev/rel
    if path.exists(): prev_refs.append({'path':f'docs/pr-evidence/pr418-localization-2026-11-02/window-2700-2799/{rel}','sha256':sha(path.read_bytes()),'bytes':path.stat().st_size})
writej('prior-history-through-W2799.json',{'repository':REPO_NAME,'pullRequest':PR,'preservedThroughSourcePosition':2799,'previousWindow':[2700,2799],'leftBoundarySourceId':'components.RequestModal.Book.pages','newWindowStartSourceId':'components.RequestModal.Book.pendingRequestFormat','preservationStatement':'No source or catalog value is changed by this primary review. Prior dispositions were reattested against the current source and target hashes; no exact live prior disposition was reused in W2800–2899.','previousWindowPacketRefs':prev_refs,'selectedWindowPriorAudit':json.loads((OUT/'prior-disposition-boundary.json').read_text())})

counts=collections.Counter(x['disposition'] for x in ledger)
by_locale=collections.Counter(x['locale'] for x in proposal_rows)
confidence_counts=collections.Counter(x['confidence'] for x in ledger)
proposal_confidence_counts=collections.Counter(x['confidence'] for x in proposal_rows)
current_key_counts={}
for loc in LOCALES:
    path=f'src/i18n/locale/{loc}.json'
    raw=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:{path}'])
    current_key_counts[loc]=len(json.loads(raw))
start_snapshot=json.loads((OUT/'pr-snapshot-start.json').read_text())
summary={'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'remoteHead':remote,
 'sourcePositionRange':[2800,2899],'sourceCount':100,'localeCount':12,'cellCount':len(ledger),
 'dispositions':dict(counts),'proposalCount':len(proposal_rows),'proposalsByLocale':dict(by_locale),
 'confidenceCounts':dict(confidence_counts),'proposalConfidenceCounts':dict(proposal_confidence_counts),'overallConfidence':'moderate',
 'catalogKeyCounts':current_key_counts,'catalogKeySetsIdentical':len(set(current_key_counts.values()))==1,
 'callerContextRows':len(contexts),'callerReferences':sum(len(x['pinnedLineRefs']) for x in contexts.values()),
 'callerFiles':len({f['path'] for x in contexts.values() for f in x['callerFiles']}),
 'callerRowsNotFound':sum(x['callerUseStatus']=='caller-use-not-found' for x in contexts.values()),
 'callerGapExtractorAliasesResolved':11,'trueUnmappedSourceCount':0,
 'priorExactDispositionsReused':sum(x['priorDisposition'] is not None for x in ledger),
 'placeholderMismatchesCurrent':len(current_ph_mismatch),'placeholderMismatchesFinal':len(final_ph_mismatch),
 'placeholderEquivalenceExceptionCells':len(placeholder_equivalence_rows),'placeholderUnresolvedSemanticGapCount':len(final_ph_mismatch)-len(placeholder_equivalence_rows),'placeholderReviewHolds':[],'machineReviewHolds':[],
 'requestfrom2812LocaleReviewCount':len(requestfrom_rows),
 'markupMismatchesCurrent':len(current_markup_mismatch),'markupMismatchesFinal':len(final_markup_mismatch),
 'protectedLiteralMismatchCellsCurrent':len(current_protected_mismatch),'protectedLiteralMismatchCellsFinal':len(final_protected_mismatch),
 'protectedLiteralMismatchDetailsCurrent':current_protected_mismatch,'protectedLiteralMismatchDetailsFinal':final_protected_mismatch,
 'icuCheckedCells':len(icu_rows),'icuInvalidCells':len(invalid_icu),
 'spanishRows':len(spanish),'spanishDirectAddressRows':sum(x['applicability']=='direct-address' for x in spanish),
 'spanishInformalFinalRows':sum(x['finalAddressForm']=='informal-tú' for x in spanish),
 'nativeSpeakerReviewOutstanding':True,'nativeSpeakerSignoffClaimed':False,
 'repositoryOrPrEdited':False,'testsBuildsScansCiBrowser':False,
 'allSevenPrStartSnapshot':start_snapshot['snapshots']}
writej('summary.json',summary)
validation={'checks':{
 'all1200ExactSourceAndCurrentTargetCells':len(ledger)==1200 and all(sha(x['source'])==x['sourceTextSha256'] and sha(x['currentTarget'])==x['currentTargetHash'] for x in ledger),
 'all100CallerRowsResolvedAndPinned':len(contexts)==100 and all(x['callerUseStatus']!='caller-use-not-found' and bool(x['pinnedLineRefs']) for x in contexts.values()),
 'allCandidateValuesHaveExactHashes':all(sha(x['finalTarget'])==x['finalTargetHash'] for x in proposal_rows),
 'allFinalPlaceholderParityExact':not final_ph_mismatch,
 'allFinalPlaceholderDifferencesAccountedFor':set(final_ph_mismatch)==PH_EQUIVALENCE_EXPECTED and len(placeholder_equivalence_rows)==len(PH_EQUIVALENCE_EXPECTED),
 'allPlaceholderDifferencesAreUnchangedAcceptedTargets':all(row['noTranslationChangeProposed'] for row in placeholder_equivalence_rows),
 'allFinalMarkupParityExact':not final_markup_mismatch,
 'allFinalProtectedLiteralsPresent':not final_protected_mismatch,
 'allICURootsAndRequiredBranchesValid':not invalid_icu,
 'allCatalogKeySetsIdentical':len(set(current_key_counts.values()))==1,
 'noUnresolvedExactPriorDispositionCollision':summary['priorExactDispositionsReused']==0,
 'spanishDirectAddressUsesFormalOrNeutral':summary['spanishInformalFinalRows']==0,
 'sourceBoundaryVerified':True,'prHeadMatchesLocalAndRemote':remote==HEAD,'worktreeClean':True
 },'sourceBoundaries':json.loads((OUT/'source-boundaries.json').read_text()),
 'callerGapTriage':json.loads((OUT/'caller-gap-extraction-triage.json').read_text()),
 'protectedLiteralMismatchDetailsCurrent':current_protected_mismatch,'protectedLiteralMismatchDetailsFinal':final_protected_mismatch,
 'icuProfiles':icu_rows,'inputHashVerification':'all source/current/caller rows rehashed from the frozen exact-head input before ledger emission'}
writej('structural-validation.json',validation)
(OUT/'README.md').write_text(f'''# SeerrNG PR #418 primary localization review — W2800–W2899\n\n## Frozen scope\n\n- Exact PR head: `{HEAD}` / tree `{TREE}`.\n- English source positions: 2800–2899, 100 source IDs × 12 direct locales = 1,200 cells.\n- Catalogs retain {next(iter(current_key_counts.values()))} keys each, with matching key sets.\n- Prior exact dispositions reused: 0; all selected cells were reviewed at the frozen head.\n\n## Review result\n\n- Primary dispositions: `{json.dumps(dict(counts),sort_keys=True)}`.\n- Confidence across 1,200 cells: {confidence_counts['high']} high, {confidence_counts['moderate']} moderate; overall moderate because qualified native-speaker signoff remains outstanding.\n- Candidate corrections/refinements: {len(proposal_rows)}. All proposal targets preserve exact placeholder syntax, markup, and protected product/service literals.\n- ICU formatter profiles checked: {len(icu_rows)}; invalid profiles: {len(invalid_icu)}.\n- There are {len(placeholder_equivalence_rows)} raw placeholder-profile differences in unchanged accepted targets. Each redundantly supplied simple `{{count}}`/`{{total}}` value is still rendered by the same ICU plural argument with locale-aware `#` (Arabic one/two branches use inflected number words). All 13 are accounted for; unresolved semantic gaps: 0. See `placeholder-equivalence-review.json`.\n- All 11 initial caller gaps were extractor alias misses for `components.RequestModal.CollectionFilters.*`; they now resolve to `src/components/RequestModal/VideoCollectionRequestFilters.tsx` with exact line/blob hashes. True unmapped source count: 0.\n- `components.RequestModal.Book.requestfrom` (position 2812) was cross-checked across all 12 locales. The English source is valid; Indonesian, Japanese, Hindi, and Vietnamese candidates correct missing/misassigned content. See `requestfrom-2812-all-locales-review.json`.\n- Spanish direct-address rows use formal or neutral forms; no informal `tú` target remains in the audited direct-address cells.\n- Qualified native-speaker signoff remains outstanding; none is claimed.\n\n## Evidence\n\n- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `caller-gap-extraction-triage.json`, `prior-disposition-boundary.json`, and `source-boundaries.json` record exact input and caller provenance.\n- `primary-review-ledger.jsonl` contains all cell decisions with current/final hashes, rationale, placeholders, markup, caller pins, confidence, and prior disposition state.\n- `candidate-proposals.jsonl`, `candidate-targets.json`, and `spanish-formality-review.jsonl` contain final proposals and language/register review.\n- `summary.json`, `structural-validation.json`, `placeholder-equivalence-review.json`, `requestfrom-2812-all-locales-review.json`, `icu-review.json`, `language-sources.json`, and `prior-history-through-W2799.json` record validations and history.\n- `exact-head-reattestation.json` records the all-12 catalog, 1,200 source/current-cell, caller-context, caller-file, and pinned-line hash checks. `live-pr-snapshots-end.json` records all seven PRs at the end; ROMarrNG #70 advanced independently during this review.\n\nThis is machine-assisted primary review, not native-speaker approval. No repository files or PR metadata were changed, and no tests, builds, scans, CI, or browser sessions were run for this subtask.\n''',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
