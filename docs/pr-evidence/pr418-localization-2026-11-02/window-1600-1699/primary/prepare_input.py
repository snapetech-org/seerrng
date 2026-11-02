import hashlib, json, pathlib, subprocess, re
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-primary-20261102')
REPO=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
HEAD='5aceef6ed6e865ee89383738212d1ce1a5c1f552'
TREE='dd6e3495c44c2c14acf8a7a4b09a21e935ceb16d'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PATHS={x:f'src/i18n/locale/{x}.json' for x in ['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']}
CALLERS={
 'components.IssueDetails.IssueMediaSummary':'src/components/IssueDetails/IssueMediaSummary.tsx',
 'components.IssueDiscussion':'src/components/IssueDetails/IssueDiscussion.tsx',
 'components.IssueList.FocusedIssue':'src/components/IssueList/FocusedIssue.tsx',
 'components.IssueList.IssueItem':'src/components/IssueList/IssueItem/index.tsx',
 'components.IssueList':'src/components/IssueList/index.tsx',
}
def run(*args): return subprocess.check_output(args,text=True)
def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def get_blob(path): return run('git','-C',str(REPO),'show',f'{HEAD}:{path}')
def git_blob(path): return run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{path}').strip()
def flatten(d,p=''):
 for k,v in d.items():
  q=f'{p}.{k}' if p else k
  if isinstance(v,dict): yield from flatten(v,q)
  else: yield q,v
def lookup(d,key):
 return d[key]
def hx(obj): return hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def srcfile(sid):
 if '.affectedSummary.' in sid:
  return 'src/components/IssueList/IssueItem/issueAffectedSummary.ts'
 for prefix,path in CALLERS.items():
  if sid.startswith(prefix+'.'): return path
 raise KeyError(sid)
# source/current pinned catalog parse
source_raw=get_blob('src/i18n/locale/en.json')
source_blob=git_blob('src/i18n/locale/en.json')
sources=dict(flatten(json.loads(source_raw)))
ordered=list(sources.items())
selected=ordered[1600:1700]
assert len(selected)==100
locale_raw={loc:get_blob(PATHS[loc]) for loc in LOCALES}
locale_blobs={loc:git_blob(PATHS[loc]) for loc in LOCALES}
locale_json={loc:json.loads(locale_raw[loc]) for loc in LOCALES}
# Validate exact PR/worktree pin
assert run('git','-C',str(REPO),'rev-parse','HEAD').strip()==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE
# Historical frozen Spanish decisions approved via prior independent exact-hash plan
prior_path='docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/exact-hash-apply-plan.jsonl'
prior=[]
prior_raw=get_blob(prior_path)
prior_file_sha=sha(prior_raw)
prior_lines=prior_raw.splitlines()
for line in prior_lines:
 try: x=json.loads(line)
 except: continue
 if x.get('locale')=='es': prior.append(x)
prior_map={(x['id'],x['locale']):x for x in prior if x.get('id')}
prior_row_hashes={(x['id'],x['locale']):sha(line) for x,line in zip(prior,prior_lines) if x.get('id')}
# caller context, keyed by source ID
context_records=[]
texts={p:get_blob(p).splitlines() for p in set(srcfile(sid) for sid,_ in selected)}
for sid,src in selected:
 path=srcfile(sid); lines=texts[path]
 leaf=sid.split('.')[-1]
 # For a nested helper field, also search the immediate parent field name; all line refs stay in the exact caller file.
 search_terms=[leaf]
 if '.affectedSummary.' in sid: search_terms=['allSeasons','noneSelected','seasonCount','seasonNumber','specials']
 occurrences=[]
 for idx,line in enumerate(lines):
  if any(re.search(r'\b'+re.escape(term)+r'\b',line) for term in search_terms):
   # keep occurrences near definitions/rendering, excluding unrelated names if repeated excessively
   if len(occurrences)<20:
    occurrences.append({'line':idx+1,'lineText':line.strip(),'lineSha256':sha(line),'previousLine':lines[idx-1].strip() if idx else None,'nextLine':lines[idx+1].strip() if idx+1<len(lines) else None})
 ctx={'sourceId':sid,'callerPath':path,'callerBlob':git_blob(path),'callerFileSha256':sha('\n'.join(lines)+'\n'),'searchTerms':search_terms,'pinnedLineRefs':occurrences,'callerEvidenceNote':'Pinned definition/caller file at exact source tree; refs are matching key/callsite lines, not a complete dynamic call graph.'}
 context_records.append(ctx)
# placeholder inventory including ICU type pattern
phre=re.compile(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal))?\b')
def phs(s):
 return [{'name':m.group(1),'kind':m.group(2) or 'simple'} for m in phre.finditer(s)] if isinstance(s,str) else []
cells=[]
for position,(sid,src) in enumerate(selected,1600):
 for loc in LOCALES:
  target=lookup(locale_json[loc],sid)
  assert isinstance(src,str) and isinstance(target,str),(sid,loc,type(src),type(target))
  old=prior_map.get((sid,loc))
  prior_info=None
  disposition='review-required'
  rationale=None
  if old:
   # Prior recommendation must reference same English source. Current target must equal previously applied final target.
   assert old.get('source')==src and old.get('sourceHash')==sha(src),(sid,loc,'historical source mismatch')
   final=old.get('finalTarget')
   final_hash=old.get('finalTargetHash')
   assert sha(final)==final_hash,(sid,loc,'historical target hash mismatch')
   assert target==final and sha(target)==final_hash,(sid,loc,'live target differs from frozen disposition')
   disposition='preserved-prior-disposition'
   rationale=old.get('reviewReason')
   prior_info={'action':old.get('action'),'reviewDecision':old.get('reviewDecision'),'reviewer':old.get('reviewer'),'reviewReason':rationale,'priorCurrentTarget':old.get('currentTarget'),'priorCurrentTargetHash':old.get('currentTargetHash'),'priorProposal':old.get('proposal'),'priorProposalHash':old.get('proposalHash'),'priorTarget':final,'priorTargetHash':final_hash,'priorHead':old.get('liveHead'),'priorTree':old.get('liveTree'),'priorSourceHash':old.get('sourceHash'),'priorPlanSha256':old.get('candidatePacketSha256'),'priorEvidencePath':prior_path,'priorEvidenceBlob':git_blob(prior_path),'priorEvidenceFileSha256':prior_file_sha,'priorEvidenceRowSha256':prior_row_hashes[(sid,loc)],'priorRootDecisionLedgerSha256':old.get('rootDecisionLedgerSha256')}
  row={'sourcePosition':position,'sourceId':sid,'locale':loc,'source':src,'sourceHash':sha(src),'sourceFile':'src/i18n/locale/en.json','sourceCatalogBlob':source_blob,'sourceFileSha256':sha(source_raw),'currentTarget':target,'currentTargetHash':sha(target),'localeFile':PATHS[loc],'localeBlob':locale_blobs[loc],'localeFileSha256':sha(locale_raw[loc]),'disposition':disposition,'rationale':rationale,'confidence':'high' if old else None,'priorDisposition':prior_info,'callerContextRef':sid,'sourcePlaceholders':phs(src),'targetPlaceholders':phs(target),'placeholderParity':'exact' if sorted(phs(src),key=lambda x:(x['name'],x['kind']))==sorted(phs(target),key=lambda x:(x['name'],x['kind'])) else 'mismatch','markupSource':[],'markupTarget':[],'protectedLiterals':[],'targetText':None,'targetHash':None,'reviewNote':'pending semantic review' if not old else 'Frozen prior Spanish disposition; exact live source/target reattested.'}
  cells.append(row)
# Related catalog label used by the IssueDiscussion source phrase “Manage”.
manage_source=sources['i18n.manage']
manage_rows=[]
for loc in LOCALES:
 label=locale_json[loc]['i18n.manage']
 manage_rows.append({'contextId':'i18n.manage','locale':loc,'source':manage_source,'sourceHash':sha(manage_source),'sourceCatalogBlob':source_blob,'currentTarget':label,'currentTargetHash':sha(label),'localeFile':PATHS[loc],'localeBlob':locale_blobs[loc],'localeFileSha256':sha(locale_raw[loc]),'head':HEAD,'tree':TREE})
(OUT/'manage-labels.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in manage_rows))
# Write evidence
(OUT/'source-current-cells.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in cells))
(OUT/'caller-contexts.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in context_records))
print(json.dumps({'head':HEAD,'tree':TREE,'sourceIds':len(selected),'cells':len(cells),'priorFrozenCells':sum(r['disposition']=='preserved-prior-disposition' for r in cells),'localeCellCount':{l:sum(r['locale']==l for r in cells) for l in LOCALES},'placeholderMismatches':sum(r['placeholderParity']!='exact' for r in cells),'callerContextRows':len(context_records),'output':str(OUT)},ensure_ascii=False,indent=2))
