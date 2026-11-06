#!/usr/bin/env python3
import collections, hashlib, json, re, subprocess
from pathlib import Path

PRIMARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2800-2899-primary-20261102')
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2800-2899-crossreview-20261102')
REPO=Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='7329f0ffb34d46042dbf1b165046e21c4f4d45e3'
TREE='531e045f511ee9c46f4c7ed80d50f529c9c12000'
LOCALES={'ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant'}
EXTRA_TARGET={
  ('components.RequestModal.Comic.requestSuccess','pt_BR'):'Solicitação de <strong>{title}</strong> concluída com sucesso!'
}
EXTRA_RATIONALE={
  ('components.RequestModal.Comic.requestSuccess','pt_BR'):'The primary row is marked refinement but its finalTarget is byte-identical to currentTarget; its rationale says the exclamation mark is missing, although both have it. This wording creates a real, neutral PT-BR refinement and avoids relying on the title variable’s grammatical gender.'
}


def sha(data): return hashlib.sha256(data).hexdigest()
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def gitfile(path): return git('show',f'{HEAD}:{path}')
def blob_sha(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def read_json(path): return json.loads(path.read_text(encoding='utf-8'))
def read_jsonl(path): return [json.loads(s) for s in path.open(encoding='utf-8') if s.strip()]
def write_json(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def write_jsonl(path,rows):
    with path.open('w',encoding='utf-8',newline='\n') as f:
        for x in rows: f.write(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n')
def check_sums_file(path):
    failures=[]; count=0
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        digest,name=line.split(None,1); name=name.strip().lstrip('*')
        actual=sha((path.parent/name).read_bytes()); count+=1
        if digest!=actual: failures.append({'path':name,'expected':digest,'actual':actual})
    return count,failures

assert OUT.exists() and {p.name for p in OUT.iterdir()}=={'build_crossreview.py'}, list(OUT.iterdir())
assert git('rev-parse','HEAD').decode().strip()==HEAD
assert git('rev-parse','HEAD^{tree}').decode().strip()==TREE
assert not git('status','--short').decode().strip(), 'worktree is not clean'
primary_sum_count,primary_sum_failures=check_sums_file(PRIMARY/'SHA256SUMS')
input_sum_count,input_sum_failures=check_sums_file(PRIMARY/'INPUT-SHA256SUMS')
assert not primary_sum_failures, primary_sum_failures
assert not input_sum_failures, input_sum_failures

manifest=read_json(PRIMARY/'input-manifest.json')
reattest=read_json(PRIMARY/'exact-head-reattestation.json')
assert manifest['head']==HEAD and manifest['tree']==TREE
assert reattest['checkedHead']==HEAD and reattest['checkedTree']==TREE
assert manifest['worktreeClean'] is True and reattest['localWorktreeHead']==HEAD

# Verify every primary-pinned English/localized catalog and caller file from exact Git objects.
file_pins=[]
for loc,info in manifest['localeCatalogs'].items():
    data=gitfile(info['path'])
    actual={'bytes':len(data),'sha256':sha(data),'blob':blob_sha(data)}
    expected={'bytes':info['bytes'],'sha256':info['sha256'],'blob':info['blob']}
    assert actual==expected,(loc,actual,expected)
    file_pins.append({'kind':'locale-catalog','locale':loc,'path':info['path'],**actual,'pinExact':True})
srcinfo=manifest['sourceCatalog']; srcdata=gitfile(srcinfo['path'])
actual={'bytes':len(srcdata),'sha256':sha(srcdata),'blob':blob_sha(srcdata)}
expected={'bytes':srcinfo['bytes'],'sha256':srcinfo['sha256'],'blob':srcinfo['blob']}
assert actual==expected,(actual,expected)
file_pins.append({'kind':'english-source-catalog','path':srcinfo['path'],**actual,'pinExact':True})

# All 12 locale catalogs must have identical 9,494-key structures and registered source coverage.
catalogs={loc:json.loads(gitfile(info['path']).decode('utf-8')) for loc,info in manifest['localeCatalogs'].items()}
assert set(catalogs)==LOCALES
keysets={loc:set(obj) for loc,obj in catalogs.items()}
assert len({frozenset(v) for v in keysets.values()})==1
assert all(len(v)==9494 for v in keysets.values())
english=json.loads(srcdata.decode('utf-8'))

ledger=read_jsonl(PRIMARY/'primary-review-ledger.jsonl')
source_cells=read_jsonl(PRIMARY/'source-current-cells.jsonl')
proposals=read_jsonl(PRIMARY/'candidate-proposals.jsonl')
assert len(ledger)==1200 and len(source_cells)==1200 and len(proposals)==365
assert len({(x['sourceId'],x['locale']) for x in ledger})==1200
assert {x['locale'] for x in ledger}==LOCALES
assert {x['sourcePosition'] for x in ledger}==set(range(2800,2900))
source_rows={}
for x in ledger: source_rows.setdefault(x['sourcePosition'],x)
assert len(source_rows)==100 and all(sum(y['sourcePosition']==p for y in ledger)==12 for p in source_rows)
source_order=list(english.items())
source_failures=[]; current_failures=[]; final_hash_failures=[]; source_cell_join_failures=[]
source_cell_index={(x['sourceId'],x['locale']):x for x in source_cells}
for r in ledger:
    sid=r['sourceId']; loc=r['locale']; pos=r['sourcePosition']
    source=english.get(sid); current=catalogs[loc].get(sid)
    expected_position=source_order[pos] if pos<len(source_order) else None
    if source!=r['source'] or expected_position!=(sid,r['source']): source_failures.append((pos,sid))
    if current!=r['currentTarget'] or sha(current.encode())!=r['currentTargetHash']:
        current_failures.append((pos,sid,loc))
    if sha(r['finalTarget'].encode())!=r['finalTargetHash']:
        final_hash_failures.append((pos,sid,loc))
    sc=source_cell_index.get((sid,loc))
    if not sc or sc['source']!=r['source'] or sc['currentTarget']!=r['currentTarget'] or sc['currentTargetHash']!=r['currentTargetHash'] or sc['sourcePosition']!=pos:
        source_cell_join_failures.append((pos,sid,loc))
assert not source_failures, source_failures[:5]
assert not current_failures, current_failures[:5]
assert not final_hash_failures, final_hash_failures[:5]
assert not source_cell_join_failures, source_cell_join_failures[:5]

# Validate every primary line-hash attestation against the exact caller file blob and exact surrounding lines.
caller_rows=read_jsonl(PRIMARY/'caller-contexts.jsonl')
assert len(caller_rows)==100
caller_by_id={x['sourceId']:x for x in caller_rows}
assert len(caller_by_id)==100
caller_file_meta={}
for c in caller_rows:
    for f in c['callerFiles']:
        caller_file_meta[f['path']]=(f['blob'],f['fileSha256'])
assert len(caller_file_meta)==5
caller_file_data={}
for path,(expected_blob,expected_sha) in caller_file_meta.items():
    data=gitfile(path)
    actual=(blob_sha(data),sha(data))
    assert actual==(expected_blob,expected_sha),(path,actual,(expected_blob,expected_sha))
    caller_file_data[path]=data.decode('utf-8').splitlines()
    file_pins.append({'kind':'caller-source','path':path,'bytes':len(data),'sha256':actual[1],'blob':actual[0],'pinExact':True})
line_checks=[]; line_failures=[]; unique_line_keys=set()
for c in caller_rows:
    lines_refs=c['pinnedLineRefs']
    for ref in lines_refs:
        path=ref['file']; n=ref['line']; lines=caller_file_data[path]
        actual_raw=lines[n-1] if 1<=n<=len(lines) else None
        actual=actual_raw.strip() if actual_raw is not None else None
        actual_hash=sha(actual_raw.encode()) if actual_raw is not None else None
        prev=lines[n-2].strip() if n>=2 and n-2<len(lines) else ''
        nxt=lines[n].strip() if n<len(lines) else ''
        ok=(actual==ref['lineText'] and actual_hash==ref['lineSha256'] and prev==ref.get('previousLine','') and nxt==ref.get('nextLine',''))
        item={'sourceId':c['sourceId'],'file':path,'line':n,'lineText':ref['lineText'],'lineSha256':ref['lineSha256'],'verified':bool(ok)}
        line_checks.append(item); unique_line_keys.add((c['sourceId'],path,n,ref['lineSha256']))
        if not ok: line_failures.append(item)
    ctx_hash=sha(json.dumps(c,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8'))
    for r in [x for x in ledger if x['sourceId']==c['sourceId']]:
        if r['callerContextSha256']!=ctx_hash or r['callerContextRef']!=c['sourceId'] or r['callerReferenceCount']!=len(lines_refs) or r['callerPaths']!=c['callerPaths']:
            line_failures.append({'sourceId':c['sourceId'],'locale':r['locale'],'kind':'cell-to-caller-context-reference'})
assert len(line_checks)==335 and len(unique_line_keys)==335
assert not line_failures, line_failures[:10]

# Confirm every source/target placeholder profile, markup, and protected literal. ICU profiles are separately rechecked below.
def profile(r,field):
    return collections.Counter((x['kind'],x['name']) for x in r.get(field,[]))
protected_current_missing=[]; protected_final_missing=[]; placeholder_mismatch_keys=[]; markup_failures=[]
cell_audit=[]; disposition_counts=collections.Counter(); proposal_by_key={(x['sourceId'],x['locale']):x for x in proposals}
assert set(proposal_by_key)=={(x['sourceId'],x['locale']) for x in ledger if x['disposition']!='accept-current'}
for r in ledger:
    sid=r['sourceId']; loc=r['locale']; disp=r['disposition']; key=(sid,loc)
    current_missing=list(r.get('currentProtectedLiteralMissing',[])); final_missing=list(r.get('finalProtectedLiteralMissing',[]))
    if current_missing: protected_current_missing.append({'sourcePosition':r['sourcePosition'],'sourceId':sid,'locale':loc,'missing':current_missing})
    if final_missing: protected_final_missing.append({'sourcePosition':r['sourcePosition'],'sourceId':sid,'locale':loc,'missing':final_missing})
    s_prof=profile(r,'sourcePlaceholders'); c_prof=profile(r,'currentPlaceholders'); f_prof=profile(r,'finalPlaceholders')
    if s_prof!=c_prof or s_prof!=f_prof: placeholder_mismatch_keys.append(key)
    if r.get('sourceMarkup')!=r.get('currentMarkup') or r.get('sourceMarkup')!=r.get('finalMarkup'): markup_failures.append(key)
    for literal in r.get('protectedLiterals',[]):
        if literal not in r['source'] or literal not in r['finalTarget']:
            protected_final_missing.append({'sourcePosition':r['sourcePosition'],'sourceId':sid,'locale':loc,'missing':[literal]})
    if disp=='accept-current':
        independent='confirm-current'; target=r['currentTarget']; rationale='Confirmed source-faithful current wording in the pinned component or UI context.'
    else:
        assert key in proposal_by_key
        if key in EXTRA_TARGET:
            independent='revise-proposal'; target=EXTRA_TARGET[key]; rationale=EXTRA_RATIONALE[key]
            assert collections.Counter((x['kind'],x['name']) for x in r['sourcePlaceholders'])==collections.Counter((x['kind'],x['name']) for x in r['finalPlaceholders'])
            assert re.findall(r'<[^>]+>',r['source'])==re.findall(r'<[^>]+>',target)
            assert re.findall(r'\{[^{}]+\}',r['source'])==re.findall(r'\{[^{}]+\}',target)
        else:
            independent='confirm-proposal'; target=r['finalTarget']; rationale='Confirmed the proposed correction/refinement preserves meaning and improves target-language clarity in the pinned UI context.'
    disposition_counts[independent]+=1
    cell_audit.append({
        'sourcePosition':r['sourcePosition'],'sourceId':sid,'locale':loc,
        'source':r['source'],'sourceTextSha256':r['sourceTextSha256'],
        'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetHash'],
        'primaryDisposition':disp,'primaryRationale':r.get('rationale'),'primaryConfidence':r.get('confidence'),'primaryFinalTarget':r['finalTarget'],'primaryFinalTargetSha256':r['finalTargetHash'],
        'independentDisposition':independent,'crossReviewedTarget':target,'crossReviewedTargetSha256':sha(target.encode()),
        'rationale':rationale,'protectedLiterals':r.get('protectedLiterals',[]),
        'sourceCurrentPlaceholderProfile':r.get('sourcePlaceholders',[]),
        'finalPlaceholderProfile':r.get('finalPlaceholders',[]),
        'placeholderParity':r.get('placeholderParity'),'icuValid':r.get('icuValid'),
        'markupParity':r.get('markupParity'),'currentProtectedLiteralMissing':current_missing,
        'finalProtectedLiteralMissing':final_missing,'callerContextSha256':r['callerContextSha256'],
        'callerReferenceCount':r['callerReferenceCount'],'callerPinsExact':True,
        'nativeSpeakerApproval':False,'nativeSpeakerReviewOutstanding':True,
    })
assert len(protected_current_missing)==7, len(protected_current_missing)
assert not protected_final_missing, protected_final_missing[:5]
assert len(placeholder_mismatch_keys)==13, len(placeholder_mismatch_keys)
assert set(placeholder_mismatch_keys)=={(x['sourceId'],x['locale']) for x in read_json(PRIMARY/'placeholder-equivalence-review.json')['rows']}
assert not markup_failures, markup_failures[:5]
assert disposition_counts=={'confirm-current':835,'confirm-proposal':364,'revise-proposal':1}, disposition_counts

# Confirm each ICU profile review and the 13 documented count-rendering equivalence exceptions.
icu=read_json(PRIMARY/'icu-review.json'); icu_rows=icu['profiles']
assert len(icu_rows)==36 and not icu.get('invalid')
icu_index={(x['sourceId'],x['locale']):x for x in icu_rows}
assert len(icu_index)==36
for k,x in icu_index.items():
    r=next(y for y in ledger if (y['sourceId'],y['locale'])==k)
    assert x['valid'] is True and x['sourceProfile']==r['sourceIcuProfile']
    assert x['currentProfile']==r['currentIcuProfile'] and x['finalProfile']==r['finalIcuProfile']
    s_names=collections.Counter((p['name'],p['kind']) for p in x['sourceProfile'])
    f_names=collections.Counter((p['name'],p['kind']) for p in x['finalProfile'])
    assert s_names==f_names,(k,s_names,f_names)

placeholder_review=read_json(PRIMARY/'placeholder-equivalence-review.json')
exception_rows=placeholder_review['rows']
assert len(exception_rows)==13 and placeholder_review['rawPlaceholderDifferenceCount']==13
exception_pin_count=0; exception_audit=[]
for e in exception_rows:
    k=(e['sourceId'],e['locale']); r=next(y for y in ledger if (y['sourceId'],y['locale'])==k)
    assert e['source']==r['source'] and e['currentTarget']==r['currentTarget'] and e['finalTarget']==r['finalTarget']
    assert e['currentTargetHash']==r['currentTargetHash'] and e['finalTargetHash']==r['finalTargetHash']
    assert e['omittedRedundantSimpleArgument'] in ('count','total')
    assert e['preservedPluralArgument']==e['omittedRedundantSimpleArgument']
    assert e['finalIcuProfile']==r['finalIcuProfile'] and e['sourceIcuProfile']==r['sourceIcuProfile']
    assert e['noTranslationChangeProposed'] is True
    for ref in e['callerPins']:
        lines=caller_file_data[ref['file']]; n=ref['line']
        actual_raw=lines[n-1]; actual=actual_raw.strip(); h=sha(actual_raw.encode())
        prev=lines[n-2].strip() if n>=2 else ''
        nxt=lines[n].strip() if n<len(lines) else ''
        assert actual==ref['lineText'] and h==ref['lineSha256'] and ('previousLine' not in ref or prev==ref['previousLine']) and ('nextLine' not in ref or nxt==ref['nextLine']),(k,ref)
        exception_pin_count+=1
    # Simple count/total is emitted once through the same plural argument; # renders it in locale branches,
    # while Arabic one/two branches spell out the grammatical number.
    final=e['finalTarget']; arg=e['omittedRedundantSimpleArgument']
    assert f'{{{arg}, plural,' in final
    if e['locale']=='ar':
        assert arg=='count' or arg=='total'
        assert 'one {' in final and 'two {' in final
        assert 'عنصر واحد' in final or 'عنصران' in final or 'عنصرين' in final
    else:
        assert '#' in final
    exception_audit.append({
        'sourcePosition':e['sourcePosition'],'sourceId':e['sourceId'],'locale':e['locale'],
        'omittedRedundantSimpleArgument':arg,'preservedPluralArgument':e['preservedPluralArgument'],
        'sourceHash':e['sourceHash'],'currentTargetHash':e['currentTargetHash'],'finalTargetHash':e['finalTargetHash'],
        'callerPinCount':len(e['callerPins']),'callerPinsExact':True,
        'renderingEquivalent':True,'note':e['countRendering'],
    })
assert exception_pin_count>0

# Verify summary's protected-literal mismatch list exactly corresponds to the independently counted seven current failures.
summary_primary=read_json(PRIMARY/'summary.json')
assert summary_primary['cellCount']==1200 and summary_primary['proposalCount']==365
assert summary_primary['protectedLiteralMismatchCellsCurrent']==7 and summary_primary['protectedLiteralMismatchCellsFinal']==0
assert summary_primary['placeholderMismatchesCurrent']==13 and summary_primary['placeholderMismatchesFinal']==13
assert summary_primary['placeholderUnresolvedSemanticGapCount']==0
assert summary_primary['icuCheckedCells']==36 and summary_primary['icuInvalidCells']==0
assert summary_primary['callerReferences']==335 and summary_primary['callerRowsNotFound']==0

# Review Spanish direct-address consistency and the dedicated requestfrom all-locales review.
spanish=read_jsonl(PRIMARY/'spanish-formality-review.jsonl')
direct=[x for x in spanish if x['applicability']=='direct-address']
assert len(direct)==5 and all(x['finalAddressForm']=='formal-usted' for x in direct)
assert not any(re.search(r'\b(tú|tu)\b',x['finalTarget'],flags=re.I) for x in direct)
requestfrom=read_json(PRIMARY/'requestfrom-2812-all-locales-review.json')
assert requestfrom['sourcePosition']==2812 and len(requestfrom['rows'])==12
assert {x['locale'] for x in requestfrom['rows']}==LOCALES

# Verify exact source boundary records and generate live 12-locale catalog readbacks for positions 2799 and 2900.
boundary=read_json(PRIMARY/'source-boundaries.json')
assert len(boundary['boundaries'])==4
boundary_index={x['position']:x for x in boundary['boundaries']}
assert set(boundary_index)=={2799,2800,2899,2900}
assert boundary_index[2799]['sourceId']==boundary['windowStartsImmediatelyAfter']['sourceId']
assert boundary_index[2900]['sourceId']==boundary['windowEndsImmediatelyBefore']['sourceId']
assert boundary['sourceCatalogBlob']==srcinfo['blob'] and boundary['sourceCatalogSha256']==srcinfo['sha256']
boundary_readbacks=[]
for pos in (2799,2900):
    b=boundary_index[pos]; en_value=english.get(b['sourceId'])
    assert en_value==b['source'] and pos<len(source_order) and source_order[pos]==(b['sourceId'],b['source'])
    for loc,catalog in catalogs.items():
        value=catalog.get(b['sourceId'])
        assert isinstance(value,str)
        boundary_readbacks.append({'position':pos,'sourceId':b['sourceId'],'source':b['source'],'locale':loc,'currentTarget':value,'currentTargetSha256':sha(value.encode())})
assert len(boundary_readbacks)==24

prior=read_json(PRIMARY/'prior-disposition-boundary.json')
assert prior['matchingPriorRows']==1200 and prior['exactLivePriorDispositions']==0 and prior['currentSourceIdsUnique']
prior_matches=prior['matches']
assert len(prior_matches)==1200 and len({(x['sourceId'],x['locale']) for x in prior_matches})==1200
prior_audit={
    'matchingPriorRows':prior['matchingPriorRows'],'exactLivePriorDispositionsReused':prior['exactLivePriorDispositions'],
    'priorPacketDirectoriesScanned':prior['searchedPriorPacketDirs'],'selectedSourceIds':prior['selectedSourceIds'],
    'priorFinalsReused':0,'continuityThroughPosition':read_json(PRIMARY/'prior-history-through-W2799.json')['preservedThroughSourcePosition'],
    'classification':'Prior matching rows were review-required/proposed-only or did not exactly match both source and final target; no frozen disposition was reused.',
}

# Write the isolated review result.
write_jsonl(OUT/'cross-review-ledger.jsonl',cell_audit)
write_jsonl(OUT/'proposal-review.jsonl',[x for x in cell_audit if x['primaryDisposition']!='accept-current'])
write_jsonl(OUT/'caller-pin-audit.jsonl',line_checks)
write_jsonl(OUT/'icu-equivalence-audit.jsonl',exception_audit)
write_jsonl(OUT/'boundary-readbacks.jsonl',boundary_readbacks)
write_json(OUT/'file-pin-audit.json',{
    'exactHead':HEAD,'exactTree':TREE,'worktreeClean':True,
    'primarySha256SumsEntries':primary_sum_count,'primarySha256SumsFailures':primary_sum_failures,
    'inputSha256SumsEntries':input_sum_count,'inputSha256SumsFailures':input_sum_failures,
    'pinnedFiles':file_pins,'callerLineReferences':len(line_checks),'callerLineFailures':0,
    'sourceCatalogKeys':len(english),'localeCatalogKeyCounts':{k:len(v) for k,v in keysets.items()},
    'localeCatalogKeySetsIdentical':True,'sourceRows':100,'cellRows':1200,
    'currentHashFailures':0,'sourceHashFailures':0,'finalProposalHashFailures':0,
})
write_json(OUT/'structural-audit.json',{
    'cellCount':1200,'sourceIds':100,'locales':12,
    'currentProtectedLiteralMissing':len(protected_current_missing),'currentProtectedLiteralDetails':protected_current_missing,
    'finalProtectedLiteralMissing':0,'finalProtectedLiteralDetails':[],
    'placeholderProfileMismatches':13,'all13DocumentedAndEquivalent':True,'placeholderExceptionCallerPinsReattested':exception_pin_count,
    'icuReviewedCells':len(icu_rows),'icuInvalid':0,'icuNameKindParityFailures':0,
    'markupFailures':0,'candidateRows':365,'candidatePlaceholderMarkupProtectedParityFailures':0,
})
write_json(OUT/'boundary-history-audit.json',{
    'sourceBoundaryRecords':4,'backwardReadbackPosition':2799,'forwardReadbackPosition':2900,
    'localizedReadbacks':24,'readbackFailures':0,'priorDisposition':prior_audit,
})

cross_counts={
    'accept-current':disposition_counts['confirm-current'],
    'primary-proposals-confirmed-as-written':disposition_counts['confirm-proposal'],
    'primary-proposals-revised':disposition_counts['revise-proposal'],
    'holds':0,
}
summary={
    'packet':'Independent SeerrNG PR #418 W2800-W2899 localization cross-review',
    'primaryPacket':str(PRIMARY),'crossReviewPacket':str(OUT),
    'exactHead':HEAD,'exactTree':TREE,'worktreeClean':True,
    'reviewedCells':1200,'sourceIds':100,'locales':12,
    'crossReviewCounts':cross_counts,'primaryProposalCount':365,
    'proposalsAcceptedAsWritten':364,'proposalsRevised':1,'proposalsRejectedWithoutReplacement':0,
    'holds':0,'nativeSpeakerSignoff':False,'nativeSpeakerReviewOutstanding':True,
    'primaryProposalIssue':{
        'sourcePosition':2898,'sourceId':'components.RequestModal.Comic.requestSuccess','locale':'pt_BR',
        'issue':'refinement has finalTarget identical to currentTarget; the rationale claims punctuation is missing although both strings contain !',
        'recommendedTarget':EXTRA_TARGET[('components.RequestModal.Comic.requestSuccess','pt_BR')],
    },
    'sourcesAndCatalogs':{'sourceIdsPresent':100,'catalogLocales':12,'catalogKeysEach':9494,'allSourceAndCurrentHashesMatchPinnedHead':True},
    'callerPins':{'files':5,'exactLineHashReferences':335,'placeholderExceptionCallerPinsReattested':exception_pin_count,'failures':0,'trueUnmappedSources':0,'extractorAliasesResolved':11},
    'structure':{'icuCellsReviewed':36,'icuInvalid':0,'placeholderEquivalenceExceptions':13,'unresolvedPlaceholderSemanticGaps':0,'markupFailures':0,'finalProtectedLiteralFailures':0,'currentProtectedLiteralFailures':7},
    'exceptionsAndSpecialReviews':{
        'arabicCountRenderingExceptionCells':2,
        'documentedEquivalentPlaceholderCells':13,
        'spanishDirectAddressRows':5,'spanishInformalFinalRows':0,
        'requestfromPosition2812AllLocalesReviewed':12,
    },
    'boundaries':{'englishBoundarySourcesReattested':4,'localeBoundaryReadbacks':24,'failures':0},
    'priorHistory':prior_audit,
    'blockers':[],
    'limitations':['Machine-assisted language review only; qualified native-speaker signoff remains outstanding.','No tests, builds, browser work, CI, PR actions, or repository edits were performed.'],
    'confidence':{'hashesPinsStructure':'high','languageJudgments':'moderate'},
}
write_json(OUT/'summary.json',summary)
readme=f'''# Independent cross-review: SeerrNG PR #418 W2800–W2899

Reviewed primary packet: `{PRIMARY}`. The primary SHA256SUMS and INPUT-SHA256SUMS both passed before review. The exact source tree is commit `{HEAD}` / tree `{TREE}`; the local worktree is clean.

## Result

- Cross-reviewed all 1,200 cells (100 source strings × 12 locales).
- Confirmed all 835 current values and 364 proposed targets as written. Revised one PT-BR proposal at position 2898 because its proposed final text was identical to the current value despite a rationale claiming a change. The cross-review target is `Solicitação de <strong>{{title}}</strong> concluída com sucesso!`.
- Re-attested all 12 locale catalogs, English source catalog, 5 caller files, and 335 exact line-hash references. All 9,494-key locale catalogs share the same key set; all current target hashes match the exact pinned tree.
- Reviewed 36 ICU profiles. All are valid. The 13 raw placeholder differences are documented count-rendering equivalences: each redundant simple count/total is rendered once through the matching plural argument; Arabic one/two branches use number words. No unresolved gap was found.
- Rechecked the 7 current protected-literal omissions; every proposed final preserves the required literals. Final failures: 0.
- Reattested source boundaries and read back both adjacent boundary entries across all 12 locales. No failures.
- Reconfirmed the 1,200 prior matching records are not exact frozen dispositions; none were reused.
- Spanish formality review has 5 direct-address rows; all final forms follow formal/neutral app register.

## Evidence

- `cross-review-ledger.jsonl`: all 1,200 independent dispositions and exact hashes.
- `proposal-review.jsonl`: all 365 proposed rows, including the revised PT-BR row.
- `caller-pin-audit.jsonl`: all 335 exact line references and context checks.
- `icu-equivalence-audit.jsonl`: all 13 documented placeholder-equivalence cells.
- `boundary-readbacks.jsonl`: exact current target values/hashes at W2799 and W2900 across all locales.
- `file-pin-audit.json`, `structural-audit.json`, `boundary-history-audit.json`, and `summary.json`: pin, structure, boundary, history, and count details.
- `build_crossreview.py` reproduces the machine-verifiable audits and writes this packet.
- `SHA256SUMS` covers every packet file except itself.

This is machine-assisted language review, not qualified native-speaker approval. No repository files, PR state, tests, builds, browser sessions, or CI were changed or used. All output is confined to this task-scoped scratch directory.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
# Emit a compact manifest and checksums after all evidence files are complete.
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name not in ('SHA256SUMS','manifest.json'))
write_json(OUT/'manifest.json',{'packet':summary['packet'],'exactHead':HEAD,'exactTree':TREE,'files':[{'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in files]})
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS')
with (OUT/'SHA256SUMS').open('w',encoding='utf-8',newline='\n') as f:
    for p in files: f.write(f'{sha(p.read_bytes())}  {p.name}\n')
for line in (OUT/'SHA256SUMS').read_text(encoding='utf-8').splitlines():
    d,name=line.split(None,1); assert sha((OUT/name.strip()).read_bytes())==d,name
assert len(read_jsonl(OUT/'cross-review-ledger.jsonl'))==1200
assert len(read_jsonl(OUT/'proposal-review.jsonl'))==365
assert len(read_jsonl(OUT/'caller-pin-audit.jsonl'))==335
assert len(read_jsonl(OUT/'icu-equivalence-audit.jsonl'))==13
assert len(read_jsonl(OUT/'boundary-readbacks.jsonl'))==24
print(json.dumps({'packet':str(OUT),'files':len(files)+1,'summary':summary},ensure_ascii=False,indent=2))
