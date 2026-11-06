from __future__ import annotations
import collections, hashlib, json, re, subprocess
from pathlib import Path

OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2000-2099-crossreview-independent-20261102')
PRIMARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2000-2099-primary-20261102')
REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-readonly-w2000-2099-d897')
EXPECTED_HEAD='d897f04661802d7f47446e46602f1b521d33c52f'
EXPECTED_TREE='309b846c546923856ffde114fd3cf75a7c8de7a7'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PATHS={x:f'src/i18n/locale/{x}.json' for x in LOCALES}
PROTECTED_TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','4K','Metacritic','Trakt']
CHECKS=[]

def sha(x):
    if isinstance(x,str): x=x.encode('utf-8')
    return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def jread(p): return json.loads(p.read_text(encoding='utf-8'))
def jlread(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args],text=True).strip()
def gitbytes(path,rev='HEAD'): return subprocess.check_output(['git','-C',str(REPO),'show',f'{rev}:{path}'])
def flatten(d,p=''):
    for k,v in d.items():
        q=f'{p}.{k}' if p else k
        if isinstance(v,dict): yield from flatten(v,q)
        else: yield q,v
def getpath(d,path):
    if path in d: return d[path]
    cur=d
    for part in path.split('.'): cur=cur[part]
    return cur
def ph(s):
    out=[]; i=0
    while i<len(s):
        if s[i]!='{': i+=1; continue
        depth=1; j=i+1
        while j<len(s) and depth:
            if s[j]=='{': depth+=1
            elif s[j]=='}': depth-=1
            j+=1
        if depth: break
        body=s[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def balanced(s):
    depth=0
    for ch in s:
        if ch=='{': depth+=1
        elif ch=='}':
            depth-=1
            if depth<0:return False
    return depth==0
def plural_branches(s):
    out=[]
    for m in re.finditer(r'\{\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*plural\s*,',s):
        i=m.end(); cats=[]
        while i<len(s):
            while i<len(s) and s[i].isspace(): i+=1
            if i>=len(s) or s[i]=='}': break
            km=re.match(r'(=?-?\d+|[A-Za-z_][A-Za-z0-9_]*)\s*\{',s[i:])
            if not km: break
            key=km.group(1); start=i+km.end(); depth=1; j=start
            while j<len(s) and depth:
                if s[j]=='{': depth+=1
                elif s[j]=='}': depth-=1
                j+=1
            if depth: break
            cats.append({'key':key,'body':s[start:j-1]}); i=j
        out.append(cats)
    return out
def addcheck(name,ok,detail=None):
    CHECKS.append({'check':name,'passed':bool(ok),'detail':detail})
    if not ok: raise RuntimeError(f'check failed: {name}: {detail}')
def dumpj(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def dumpl(name,rows): (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf-8')

# Check both signed manifests before reading evidence.
def verify_sums(path):
    entries=[]
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        expected,name=line.split(None,1); name=name.lstrip('* ')
        actual=sha((path.parent/name).read_bytes())
        entries.append({'path':name,'expectedSha256':expected,'actualSha256':actual,'matches':actual==expected})
    return entries
primary_sum_entries=verify_sums(PRIMARY/'SHA256SUMS')
input_sum_entries=verify_sums(PRIMARY/'INPUT-SHA256SUMS')
addcheck('primary_packet_sums',all(x['matches'] for x in primary_sum_entries),len(primary_sum_entries))
addcheck('frozen_input_sums',all(x['matches'] for x in input_sum_entries),len(input_sum_entries))
primary_sums_sha=sha((PRIMARY/'SHA256SUMS').read_bytes())
input_sums_sha=sha((PRIMARY/'INPUT-SHA256SUMS').read_bytes())

# Live GitHub state, PR branch ref, and exact local object snapshot.
head=git('rev-parse','HEAD'); tree=git('rev-parse','HEAD^{tree}'); status=git('status','--porcelain')
addcheck('worktree_head',head==EXPECTED_HEAD,head)
addcheck('worktree_tree',tree==EXPECTED_TREE,tree)
addcheck('worktree_clean',status=='',status)
pr=json.loads(subprocess.check_output(['gh','api','repos/snapetech-org/SeerrNG/pulls/418'],text=True))
pr_state={'state':pr['state'],'draft':pr['draft'],'headCommit':pr['head']['sha'],'headRefName':pr['head']['ref'],'headTree':git('rev-parse',f"{pr['head']['sha']}^{{tree}}"),'baseRefName':pr['base']['ref'],'baseCommit':pr['base']['sha'],'url':pr['html_url']}
branch_api=subprocess.check_output(['gh','api','repos/snapetech-org/SeerrNG/git/ref/heads/codex/seerrng-localization-overhaul-20261028'],text=True)
branch=json.loads(branch_api)
branch_state={'ref':branch['ref'],'headCommit':branch['object']['sha']}
addcheck('live_pr_open_draft_exact_head_tree',pr_state['state']=='open' and pr_state['draft'] is True and pr_state['headCommit']==EXPECTED_HEAD and pr_state['headTree']==EXPECTED_TREE,pr_state)
addcheck('live_branch_exact_head',branch_state['headCommit']==EXPECTED_HEAD,branch_state)

# Reattest catalog blobs and bytes at exact tree.
manifest=jread(PRIMARY/'input-manifest.json')
source_path=manifest['sourceCatalog']['path']; source_raw=gitbytes(source_path)
source_blob=git('rev-parse',f'HEAD:{source_path}')
addcheck('source_catalog_blob',source_blob==manifest['sourceCatalog']['blob'],source_blob)
addcheck('source_catalog_bytes_sha',len(source_raw)==manifest['sourceCatalog']['bytes'] and sha(source_raw)==manifest['sourceCatalog']['sha256'],{'bytes':len(source_raw),'sha256':sha(source_raw)})
source_flat=list(flatten(json.loads(source_raw))); source_map=dict(source_flat)
addcheck('source_window_has_100_positions',len(jread(PRIMARY/'source-window.json')['sourceList'])==100,100)
locale_docs={}; locale_meta=[]
for loc in LOCALES:
    meta=manifest['localeCatalogs'][loc]; path=meta['path']; raw=gitbytes(path); blob=git('rev-parse',f'HEAD:{path}')
    addcheck(f'{loc}_catalog_blob',blob==meta['blob'],blob)
    addcheck(f'{loc}_catalog_file_sha',len(raw)==meta['bytes'] and sha(raw)==meta['sha256'],{'bytes':len(raw),'sha256':sha(raw)})
    locale_docs[loc]=json.loads(raw)
    locale_meta.append({'locale':loc,'path':path,'blob':blob,'bytes':len(raw),'sha256':sha(raw)})

window=jread(PRIMARY/'source-window.json'); source_rows=window['sourceList']
expected_slice=source_flat[2000:2100]
addcheck('zero_based_source_positions_2000_2099',len(expected_slice)==100 and [(r['sourceId'],r['source']) for r in source_rows]==expected_slice and [r['position'] for r in source_rows]==list(range(2000,2100)),len(expected_slice))
addcheck('source_window_sha_file_matches',window['sourceCatalog']['blob']==source_blob and window['sourceCatalog']['sha256']==sha(source_raw),window['sourceCatalog'])
source_by={r['sourceId']:r for r in source_rows}

# Full current-cell source/target attestation, all 1,200 values.
cells=jlread(PRIMARY/'source-current-cells.jsonl')
ledger=jlread(PRIMARY/'primary-review-ledger.jsonl')
candidates=jlread(PRIMARY/'correction-candidates.jsonl')
caller_contexts=jlread(PRIMARY/'caller-contexts.jsonl')
cand_json=jread(PRIMARY/'candidate-targets.json')
cell_by={(r['sourceId'],r['locale']):r for r in cells}
ledger_by={(r['sourceId'],r['locale']):r for r in ledger}
cand_by={(r['sourceId'],r['locale']):r for r in candidates}
ctx_by={r['sourceId']:r for r in caller_contexts}
addcheck('current_cells_1200',len(cells)==1200 and len(cell_by)==1200, len(cells))
addcheck('primary_ledger_1200',len(ledger)==1200 and set(ledger_by)==set(cell_by),len(ledger))
addcheck('12_locales_100_rows_each',collections.Counter(r['locale'] for r in cells)==collections.Counter({x:100 for x in LOCALES}),dict(collections.Counter(r['locale'] for r in cells)))
addcheck('candidate_count_383',len(candidates)==383 and len(cand_by)==383 and cand_json['candidateCount']==383, len(candidates))
addcheck('candidate_target_file_matches_jsonl',set((r['sourceId'],r['locale'],r['candidateTarget'],r['candidateTargetHash']) for r in candidates)==set((r['sourceId'],r['locale'],r['candidateTarget'],r['candidateTargetHash']) for r in cand_json['candidateTargets']),len(cand_json['candidateTargets']))

source_hash_mismatches=[]; target_hash_mismatches=[]; current_struct=[]; candidate_struct=[]
for key,c in cell_by.items():
    sid,loc=key; src=source_by[sid]; led=ledger_by[key]; target=getpath(locale_docs[loc],sid)
    sh=sha(src['source']); th=sha(target)
    expected_protected=sorted(set([x['name'] for x in ph(src['source'])]+[term for term in PROTECTED_TERMS if term.casefold() in src['source'].casefold()]))
    phs=ph(src['source']); pht=ph(target); ms=tags(src['source']); mt=tags(target)
    protected_missing=[term for term in expected_protected if term not in target]
    checks_ok=(c['source']==src['source'] and c['sourcePosition']==src['position'] and c['sourceTextSha256']==sh and c['sourceHash']==sha(sid) and c['sourceFileSha256']==manifest['sourceCatalog']['sha256'] and c['sourceCatalogBlob']==source_blob and c['currentTarget']==target and c['currentTargetHash']==th and c['localeBlob']==manifest['localeCatalogs'][loc]['blob'] and c['localeFileSha256']==manifest['localeCatalogs'][loc]['sha256'] and led['source']==src['source'] and led['sourceTextSha256']==sh and led['currentTarget']==target and led['currentTargetHash']==th and led['sourcePosition']==src['position'])
    addcheck(f'cell_exact_{sid}_{loc}',checks_ok,{'sourcePosition':src['position'],'sourceHash':sh,'targetHash':th})
    if c['sourcePlaceholders']!=phs or c['targetPlaceholders']!=pht: source_hash_mismatches.append(c['sourceId']+':'+loc)
    if c['placeholderParity'] != ('exact' if sorted(phs,key=lambda x:(x['name'],x['kind']))==sorted(pht,key=lambda x:(x['name'],x['kind'])) else 'mismatch'): target_hash_mismatches.append(c['id'] if 'id' in c else f'{sid}:{loc}')
    current_struct.append({'sourceId':sid,'sourcePosition':src['position'],'locale':loc,'source':src['source'],'sourceTextSha256':sh,'currentTarget':target,'currentTargetSha256':th,'placeholderSpecs':pht,'sourcePlaceholderSpecs':phs,'placeholderParity':'exact' if sorted(phs,key=lambda x:(x['name'],x['kind']))==sorted(pht,key=lambda x:(x['name'],x['kind'])) else 'mismatch','sourceMarkup':ms,'targetMarkup':mt,'markupParity':'exact' if ms==mt else 'mismatch','protectedLiterals':expected_protected,'protectedLiteralMissing':protected_missing,'primaryDisposition':led['disposition']})
    cand=cand_by.get(key)
    if cand:
        ct=cand['candidateTarget']; cph=ph(ct); ctags=tags(ct); cmiss=[term for term in expected_protected if term not in ct]
        ph_ok=sorted(cph,key=lambda x:(x['name'],x['kind']))==sorted(ph(src['source']),key=lambda x:(x['name'],x['kind']))
        ok=(sha(ct)==cand['candidateTargetHash'] and led['finalTarget']==ct and led['finalTargetHash']==sha(ct) and ph_ok and ctags==ms and not cmiss and cand['source']==src['source'] and cand['currentTarget']==target and cand['currentTargetHash']==th)
        addcheck(f'candidate_exact_structure_{sid}_{loc}',ok,{'targetHash':sha(ct),'placeholderParity':ph_ok,'markupParity':ctags==ms,'protectedLiteralMissing':cmiss})
        candidate_struct.append({'sourceId':sid,'sourcePosition':src['position'],'locale':loc,'candidateTarget':ct,'candidateTargetSha256':sha(ct),'placeholderSpecs':cph,'sourcePlaceholderSpecs':ph(src['source']),'placeholderParity':'exact' if ph_ok else 'mismatch','sourceMarkup':ms,'candidateMarkup':ctags,'markupParity':'exact' if ctags==ms else 'mismatch','protectedLiterals':expected_protected,'protectedLiteralMissing':cmiss})
addcheck('primary_current_placeholders_recomputed',not source_hash_mismatches,source_hash_mismatches[:10])

# Reattest all caller source files and every pinned line/neighbor.
caller_refs=[]; context_hash_mismatches=[]; unique_file_paths=set()
source_records_by_id={r['sourceId']:r for r in caller_contexts}
addcheck('caller_context_rows_100',len(caller_contexts)==100 and set(ctx_by)==set(source_by),len(caller_contexts))
for sid,ctx in ctx_by.items():
    ctx_sha=sha(canon(ctx)); unique_file_paths.update(f['path'] for f in ctx['callerFiles'])
    sw=source_by[sid]
    addcheck(f'caller_context_hash_{sid}',ctx_sha==sw['callerContextSha256'],ctx_sha)
    refs=ctx['pinnedLineRefs']
    for f in ctx['callerFiles']:
        raw=gitbytes(f['path']); blob=git('rev-parse',f'HEAD:{f["path"]}')
        ok=sha(raw)==f['fileSha256'] and blob==f['blob']
        addcheck(f'caller_file_{sid}_{f["path"]}',ok,{'blob':blob,'sha256':sha(raw)})
    for ref in refs:
        path=ref['file']; raw=gitbytes(path); lines=raw.decode('utf-8').splitlines(); idx=ref['line']-1
        exact=lines[idx] if 0<=idx<len(lines) else None
        prev=lines[idx-1].strip() if idx>0 else None
        nxt=lines[idx+1].strip() if 0<=idx+1<len(lines) else None
        ok=exact is not None and exact.strip()==ref['lineText'] and sha(exact)==ref['lineSha256'] and prev==ref['previousLine'] and nxt==ref['nextLine']
        addcheck(f'caller_ref_{sid}_{path}_{ref["line"]}',ok,{'file':path,'line':ref['line'],'lineSha256':sha(exact) if exact is not None else None})
        caller_refs.append({'sourceId':sid,'sourcePosition':source_by[sid]['position'],'file':path,'line':ref['line'],'lineText':ref['lineText'],'lineSha256':sha(exact) if exact is not None else None,'previousLine':prev,'nextLine':nxt,'verified':ok})
    ledger_context=next(r['callerContext'] for r in ledger if r['sourceId']==sid)
    addcheck(f'ledger_caller_context_{sid}',ledger_context==ctx,{'contextHash':ctx_sha})
addcheck('caller_refs_348',len(caller_refs)==348,len(caller_refs))
addcheck('caller_files_13',len(unique_file_paths)==13,sorted(unique_file_paths))
addcheck('all_sources_have_callers',all(ctx_by[sid]['pinnedLineRefs'] for sid in source_by),sum(not ctx_by[sid]['pinnedLineRefs'] for sid in source_by))

# Independently re-review primary candidates, revising the three where the proposed target
# still loses semantics or overstates the caller state.
revisions={
 ('components.MediaDetails.DetailDisclosure.unpin','fr'):('Désépingler {label}','The proposed “Détacher” means detach and does not name removing the pin. This button toggles a pinned disclosure, so use the established French verb for unpinning.'),
 ('components.MediaServerCollectionButton.unavailable','zh_Hans'):('合集在当前配置的媒体服务器上不可用。','The proposed “不支持合集” says the server does not support collections. The caller uses this generic unavailable message for multiple non-capability failure reasons, so keep the target neutral.'),
 ('components.MediaServerCollectionButton.unavailable','zh_Hant'):('目前設定的媒體伺服器無法使用合集功能。','The proposed “不支援合集” asserts lack of support. The caller uses this generic unavailable message for multiple non-capability failure reasons, so state that the feature is unavailable.'),
}
# Keys above are source IDs; normalize the collection-button namespace explicitly.
revisions={
 ('components.MediaDetails.DetailDisclosure.unpin','fr'):revisions[('components.MediaDetails.DetailDisclosure.unpin','fr')],
 ('components.MediaDetails.MediaServerCollectionButton.unavailable','zh_Hans'):revisions[('components.MediaServerCollectionButton.unavailable','zh_Hans')],
 ('components.MediaDetails.MediaServerCollectionButton.unavailable','zh_Hant'):revisions[('components.MediaServerCollectionButton.unavailable','zh_Hant')],
}
additional={
 ('components.MediaDetails.SeasonEpisodeTree.available','pt_BR'):('disponíveis','The selection description is inserted as an episode modifier in plural “episodes” labels and tooltips. Brazilian Portuguese needs plural agreement here; the current singular “disponível” is mismatched.'),
}
primary_outcomes=[]
for c in candidates:
    sid=c['sourceId']; loc=c['locale']; key=(sid,loc)
    if key in revisions:
        target,reason=revisions[key]; outcome='revise-primary-candidate'
    else:
        target=c['candidateTarget']; outcome='accept-primary-candidate'
        reason='Independent review agrees with the proposal after checking the English source, exact caller context, current wording, and target structure.'
    primary_outcomes.append({'sourceId':sid,'sourcePosition':c['sourcePosition'],'locale':loc,'source':c['source'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetHash'],'primaryDisposition':c['disposition'],'primaryCandidateTarget':c['candidateTarget'],'primaryCandidateSha256':c['candidateTargetHash'],'independentOutcome':outcome,'independentTarget':target,'independentTargetSha256':sha(target),'rationale':reason,'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],'confidence':('high' if key in revisions else c['confidence'])})
addcheck('all_383_candidates_adjudicated',len(primary_outcomes)==383 and len({(r['sourceId'],r['locale']) for r in primary_outcomes})==383,len(primary_outcomes))
addcheck('three_revised_primary_candidates',sum(r['independentOutcome']=='revise-primary-candidate' for r in primary_outcomes)==3,[(r['sourceId'],r['locale']) for r in primary_outcomes if r['independentOutcome']=='revise-primary-candidate'])

# Full final independent ledger for 1,200 cells. The three added findings are kept distinct
# from primary candidates and all remaining current values are retained.
final_by={}
for row in primary_outcomes: final_by[(row['sourceId'],row['locale'])]=row['independentTarget']
for key,(target,reason) in additional.items(): final_by[key]=target
full=[]; structural_final=[]
for cell in cells:
    sid=cell['sourceId']; loc=cell['locale']; key=(sid,loc); led=ledger_by[key]; src=source_by[sid]
    current=cell['currentTarget']; current_sha=sha(current)
    if key in additional:
        target,reason=additional[key]; disp='propose-additional-correction'
    elif key in final_by:
        target=final_by[key]
        if (sid,loc) in revisions: disp='revise-primary-candidate'; reason=revisions[(sid,loc)][1]
        else: disp='accept-primary-candidate'; reason='Independent review accepts the primary proposal in pinned caller context.'
    else:
        target=current; disp='accept-current'; reason='Independent review retains the current target in pinned context; source/current bytes and structural markers reattest exactly.'
    ph_s=ph(src['source']); ph_t=ph(target); mt_s=tags(src['source']); mt_t=tags(target)
    prot=sorted(set([x['name'] for x in ph_s]+[term for term in PROTECTED_TERMS if term.casefold() in src['source'].casefold()]))
    missing=[x for x in prot if x not in target]
    ok=sorted(ph_s,key=lambda x:(x['name'],x['kind']))==sorted(ph_t,key=lambda x:(x['name'],x['kind'])) and mt_s==mt_t and not missing and balanced(target)
    addcheck(f'final_structure_{sid}_{loc}',ok,{'placeholderMismatch':not (sorted(ph_s,key=lambda x:(x['name'],x['kind']))==sorted(ph_t,key=lambda x:(x['name'],x['kind']))),'markupMismatch':mt_s!=mt_t,'protectedLiteralMissing':missing,'balancedBraces':balanced(target)})
    structural_final.append({'sourceId':sid,'sourcePosition':src['position'],'locale':loc,'sourcePlaceholderSpecs':ph_s,'finalPlaceholderSpecs':ph_t,'placeholderParity':'exact' if sorted(ph_s,key=lambda x:(x['name'],x['kind']))==sorted(ph_t,key=lambda x:(x['name'],x['kind'])) else 'mismatch','sourceMarkup':mt_s,'finalMarkup':mt_t,'markupParity':'exact' if mt_s==mt_t else 'mismatch','protectedLiterals':prot,'protectedLiteralMissing':missing,'balancedBraces':balanced(target)})
    full.append({'sourceId':sid,'sourcePosition':src['position'],'locale':loc,'source':src['source'],'sourceSha256':sha(src['source']),'currentTarget':current,'currentTargetSha256':current_sha,'primaryDisposition':led['disposition'],'primaryFinalTarget':led['finalTarget'],'independentDisposition':disp,'independentFinalTarget':target,'independentFinalTargetSha256':sha(target),'rationale':reason,'callerContextRef':cell['callerContextRef'],'callerContextSha256':cell['callerContextSha256'],'exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE})
addcheck('full_independent_ledger_1200',len(full)==1200,len(full))
addcheck('one_supplemental_fix',sum(r['independentDisposition']=='propose-additional-correction' for r in full)==1,[(r['sourceId'],r['locale']) for r in full if r['independentDisposition']=='propose-additional-correction'])

# ICU plural category, branch, argument, and markup checks for the two plural messages.
icu_rows=[]
for pos in [2013,2018]:
 sid=next(x['sourceId'] for x in source_rows if x['position']==pos); source=source_map[sid]
 source_branches=plural_branches(source)
 addcheck(f'icu_source_{pos}_one_plural',len(source_branches)==1 and 'other' in {b['key'] for b in source_branches[0]},source_branches)
 for loc in LOCALES:
    cur=getpath(locale_docs[loc],sid)
    final=next(r['independentFinalTarget'] for r in full if r['sourceId']==sid and r['locale']==loc)
    current_branches=plural_branches(cur); final_branches=plural_branches(final)
    fkeys={b['key'] for b in final_branches[0]} if final_branches else set()
    required={'zero','one','two','few','many','other'} if loc=='ar' else {'other'}
    has_hash_ok=(pos!=2018 or (final_branches and all('#' in b['body'] for b in final_branches[0])))
    addcheck(f'icu_{pos}_{loc}_syntax_and_branches',balanced(final) and len(final_branches)==1 and 'other' in fkeys and required.issubset(fkeys) and has_hash_ok,{'branches':sorted(fkeys),'required':sorted(required),'hashEveryBranch':has_hash_ok})
    sigs=ph(final); srcs=ph(source)
    addcheck(f'icu_{pos}_{loc}_argument_signature',sorted(sigs,key=lambda x:(x['name'],x['kind']))==sorted(srcs,key=lambda x:(x['name'],x['kind'])),sigs)
    icu_rows.append({'sourcePosition':pos,'sourceId':sid,'locale':loc,'sourcePluralBranches':source_branches,'currentPluralBranches':current_branches,'independentPluralBranches':final_branches,'sourceArgumentSignature':srcs,'finalArgumentSignature':sigs,'finalHasOther':('other' in fkeys),'arabicSixCategoriesPresent':(loc!='ar' or required.issubset(fkeys)),'countMarkerInEachCountBranch':has_hash_ok,'currentMarkup':tags(cur),'finalMarkup':tags(final),'exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE})

# W1999 and W2100 insertion-order boundaries from the exact live source and all 12 catalogs.
boundary=[]
for pos in [1999,2100]:
    sid,src=source_flat[pos]; sh=sha(src)
    for loc in LOCALES:
        target=getpath(locale_docs[loc],sid)
        boundary.append({'boundaryPosition':pos,'sourceId':sid,'source':src,'sourceTextSha256':sh,'locale':loc,'currentTarget':target,'currentTargetSha256':sha(target),'localeBlob':manifest['localeCatalogs'][loc]['blob'],'localeFileSha256':manifest['localeCatalogs'][loc]['sha256'],'exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE})
addcheck('boundary_rows_24_and_ordinals',len(boundary)==24 and {r['boundaryPosition'] for r in boundary}=={1999,2100},len(boundary))

# Reattest exact prior disposition boundary: historical matches are context only, not exact reuse.
prior=jread(PRIMARY/'prior-disposition-boundary.json')
addcheck('prior_boundary_source_id_count',prior['selectedSourceIds']==100,prior.get('selectedSourceIds'))
addcheck('prior_exact_live_dispositions_zero',prior['exactLivePriorDispositions']==0,prior['exactLivePriorDispositions'])
addcheck('primary_no_holds_or_noops',sum(x['disposition']=='hold' for x in ledger)==0 and all(x['candidateTarget']!=x['currentTarget'] for x in candidates),{'holds':sum(x['disposition']=='hold' for x in ledger),'candidateNoops':sum(x['candidateTarget']==x['currentTarget'] for x in candidates)})

# End-state PR and branch requery after read-only checks.
pr_end=json.loads(subprocess.check_output(['gh','api','repos/snapetech-org/SeerrNG/pulls/418'],text=True))
branch_end=json.loads(subprocess.check_output(['gh','api','repos/snapetech-org/SeerrNG/git/ref/heads/codex/seerrng-localization-overhaul-20261028'],text=True))
end={'prState':pr_end['state'],'draft':pr_end['draft'],'headCommit':pr_end['head']['sha'],'headTree':git('rev-parse',f"{pr_end['head']['sha']}^{{tree}}"),'branchHead':branch_end['object']['sha']}
addcheck('end_live_pr_and_branch_unchanged',end=={'prState':'open','draft':True,'headCommit':EXPECTED_HEAD,'headTree':EXPECTED_TREE,'branchHead':EXPECTED_HEAD},end)

# Export full independent evidence ledgers.
dumpl('cell-crossreview.jsonl',full)
dumpl('candidate-crossreview.jsonl',primary_outcomes)
dumpl('additional-missed-corrections.jsonl',[{'sourceId':sid,'sourcePosition':source_by[sid]['position'],'locale':loc,'source':source_by[sid]['source'],'currentTarget':cell_by[(sid,loc)]['currentTarget'],'currentTargetSha256':cell_by[(sid,loc)]['currentTargetHash'],'independentTarget':target,'independentTargetSha256':sha(target),'rationale':reason,'callerContextRef':sid,'callerContextSha256':source_by[sid]['callerContextSha256'],'exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE} for (sid,loc),(target,reason) in additional.items()])
dumpl('caller-line-reattestation.jsonl',caller_refs)
dumpl('structural-reattestation.jsonl',current_struct+candidate_struct+structural_final)
dumpl('icu-structure-reattestation.jsonl',icu_rows)
dumpl('source-boundary-reattestation.jsonl',boundary)
dumpj('catalog-reattestation.json',{'repository':REPO_NAME,'pullRequest':PR,'headCommit':EXPECTED_HEAD,'tree':EXPECTED_TREE,'sourceCatalog':{'path':source_path,'blob':source_blob,'bytes':len(source_raw),'sha256':sha(source_raw)},'localeCatalogs':locale_meta,'orderedLeafCount':len(source_flat),'sourceWindowPositions':[2000,2099]})
dumpj('live-pr-reattestation.json',{'start':pr_state,'branchStart':branch_state,'finish':end,'unchangedAtPinnedHead':True})
dumpj('prior-boundary-reattestation.json',{'primaryPacketPath':str(PRIMARY/'prior-disposition-boundary.json'),'selectedSourceIds':prior['selectedSourceIds'],'historicalRowsFound':prior['matchingPriorRows'],'historicalRowsExactLiveDisposition':prior['exactLivePriorDispositions'],'priorPacketsScanned':prior['searchedPriorPacketDirs'],'interpretation':'historical rows are context only; no exact source+final-target disposition was reused'})
dumpl('verification-checks.jsonl',CHECKS)

counts=collections.Counter(r['independentDisposition'] for r in full)
proposal_counts=collections.Counter(r['independentOutcome'] for r in primary_outcomes)
summary={'result':'INDEPENDENT_CROSS_REVIEW_COMPLETE_PENDING_NATIVE_SPEAKER_REVIEW','repository':REPO_NAME,'pullRequest':PR,'headCommit':EXPECTED_HEAD,'tree':EXPECTED_TREE,'prOpenDraftAtStartAndFinish':True,'branchHeadAtStartAndFinish':EXPECTED_HEAD,'sourcePositions':[2000,2099],'boundaryPositions':[1999,2100],'cellsReattested':len(cells),'independentCellDispositions':dict(counts),'primaryCandidates':len(candidates),'primaryProposalOutcomes':dict(proposal_counts),'primaryCandidatesRevised':sum(x['independentOutcome']=='revise-primary-candidate' for x in primary_outcomes),'additionalMissedCorrections':len(additional),'independentChangedTargets':sum(x['independentDisposition'] in ('accept-primary-candidate','revise-primary-candidate','propose-additional-correction') for x in full),'holds':sum(x['independentDisposition']=='hold' for x in full),'candidateNoops':sum(x['candidateTarget']==x['currentTarget'] for x in candidates),'callerRefsReattested':len(caller_refs),'callerFiles':len(unique_file_paths),'boundaryCellsReattested':len(boundary),'icuPluralCellsReattested':len(icu_rows),'currentPlaceholderMismatchCells':sum(x['placeholderParity']!='exact' for x in current_struct),'currentMarkupMismatchCells':sum(x['markupParity']!='exact' for x in current_struct),'currentProtectedLiteralMismatchCells':sum(bool(x['protectedLiteralMissing']) for x in current_struct),'finalPlaceholderMismatchCells':sum(x['placeholderParity']!='exact' for x in structural_final),'finalMarkupMismatchCells':sum(x['markupParity']!='exact' for x in structural_final),'finalProtectedLiteralMismatchCells':sum(bool(x['protectedLiteralMissing']) for x in structural_final),'primarySha256ManifestSha256':primary_sums_sha,'inputSha256ManifestSha256':input_sums_sha,'allChecksPassed':all(x['passed'] for x in CHECKS),'checkCount':len(CHECKS),'nativeSpeakerReview':'outstanding','readOnly':True,'repoOrPrWrites':False}
dumpj('crossreview-summary.json',summary)
readme=f'''# SeerrNG PR #418 W2000–2099 independent cross-review\n\n- PR state at start and finish: OPEN/DRAFT, branch head `{EXPECTED_HEAD}`, tree `{EXPECTED_TREE}`.\n- Scope: 100 ordered English keys and all 1,200 locale cells, 383 primary candidates, 348 caller line pins across 13 files, and W1999/W2100 boundary cells.\n- Primary candidates: {proposal_counts.get('accept-primary-candidate',0)} accepted as written; {proposal_counts.get('revise-primary-candidate',0)} revised; no primary candidate was left unreviewed.\n- Additional missed correction: Brazilian Portuguese W2083 needs plural agreement (`disponíveis`) in the selection-description context.\n- Holds: {summary['holds']}; candidate no-ops: {summary['candidateNoops']}. No exact prior final disposition was reusable.\n- Structural reattestation covered ICU argument signatures, plural branches, `#` count markers, markup, protected literals, source and target hashes. Arabic plural categories are recorded explicitly.\n- Native-speaker approval remains outstanding. The packet is read-only; no repo or PR changes were made.\n\nSee `cell-crossreview.jsonl`, `candidate-crossreview.jsonl`, `additional-missed-corrections.jsonl`, `caller-line-reattestation.jsonl`, `icu-structure-reattestation.jsonl`, and `source-boundary-reattestation.jsonl`. `SHA256SUMS.txt` covers packet files except itself.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
files=sorted(x for x in OUT.iterdir() if x.is_file() and x.name!='SHA256SUMS.txt')
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(f.read_bytes())}  {f.name}\n' for f in files),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
print('packetFiles',len(files)+1,'packetBytes',sum(x.stat().st_size for x in OUT.iterdir() if x.is_file()))
