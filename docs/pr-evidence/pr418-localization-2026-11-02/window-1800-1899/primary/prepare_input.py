from __future__ import annotations
import hashlib,json,pathlib,re,subprocess,collections
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1800-1899-primary-20261102')
REPO=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
HEAD='78a36214596544e1b3033c6a612ae5559db713e3'; TREE='ef83a00d078f0a4aed6269b4c23282dbf91fd6f7'
REPO_NAME='snapetech-org/seerrng'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PATHS={x:f'src/i18n/locale/{x}.json' for x in LOCALES}
PROTECTED_TERMS=['IPTV Tunerr','SeerrNG','Seerr','Jellyfin','Plex','HTTPS','HTTP','SSL','URL']
CALLERS={
 'components.IssueList':'src/components/IssueList/index.tsx',
 'components.IssueModal.CreateIssueModal':['src/components/IssueModal/CreateIssueModal/index.tsx','src/components/IssueModal/CreateIssueModal/SeriesEpisodeSelector.tsx','src/components/IssueModal/index.tsx'],
 'components.IssueModal':['src/components/IssueModal/constants.ts','src/components/IssueModal/CreateIssueModal/index.tsx','src/components/IssueModal/index.tsx'],
 'components.LanguageSelector':'src/components/LanguageSelector/index.tsx',
 'components.Layout.LanguagePicker':'src/components/Layout/LanguagePicker/index.tsx',
 'components.Layout.SearchInput':'src/components/Layout/SearchInput/index.tsx',
 'components.Layout.Sidebar':['src/components/Layout/Sidebar/navigation.tsx','src/components/Layout/Sidebar/index.tsx'],
 'components.Layout.ThemePicker':'src/components/Layout/ThemePicker/index.tsx',
 'components.Layout.UserDropdown.MiniQuotaDisplay':'src/components/Layout/UserDropdown/MiniQuotaDisplay/index.tsx',
 'components.Layout.UserDropdown':'src/components/Layout/UserDropdown/index.tsx',
 'components.Layout.UserWarnings':'src/components/Layout/UserWarnings/index.tsx',
 'components.Layout.VersionStatus':'src/components/Layout/VersionStatus/index.tsx',
 'components.ListView':'src/components/Common/ListView/index.tsx',
 'components.LiveTv.FollowedTeams':'src/components/LiveTv/FollowedTeams.tsx',
 'components.LiveTv.LiveTvButton':'src/components/LiveTv/LiveTvButton.tsx',
 'components.LiveTv.RecordingList':'src/components/LiveTv/RecordingList.tsx',
 'components.Login.JellyfinQuickConnectModal':'src/components/Login/JellyfinQuickConnectModal.tsx',
 'components.Login.OidcLoginButton':'src/components/Login/OidcLoginButton.tsx',
 'components.Login':['src/components/Setup/JellyfinSetup.tsx','src/components/Login/AddEmailModal.tsx','src/components/Login/JellyfinLogin.tsx','src/components/Login/LocalLogin.tsx','src/components/Login/PlexLoginButton.tsx','src/components/Login/index.tsx'],
}
def run(*args): return subprocess.check_output(args,text=True)
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def sha(s):
 if isinstance(s,str): s=s.encode('utf-8')
 return hashlib.sha256(s).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def blob(path): return run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{path}').strip()
def get(path): return git('show',f'{HEAD}:{path}')
def flatten(d,p=''):
 for k,v in d.items():
  q=f'{p}.{k}' if p else k
  if isinstance(v,dict): yield from flatten(v,q)
  else: yield q,v
def caller_paths(sid):
 for prefix,val in CALLERS.items():
  if sid.startswith(prefix+'.'):
   return [val] if isinstance(val,str) else val
 raise KeyError(sid)
def phs(s): return [{'name':m.group(1),'kind':m.group(2) or 'simple'} for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal))?\b',s)]
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def writej(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(path,rows): path.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
# Verify exact PR and clean pinned checkout before reading any review inputs.
pr=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid'))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD,pr
assert run('git','-C',str(REPO),'rev-parse','HEAD').strip()==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE
assert run('git','-C',str(REPO),'status','--porcelain').strip()==''
source_path='src/i18n/locale/en.json'; source_raw=get(source_path); source_blob=blob(source_path)
sources=dict(flatten(json.loads(source_raw))); ordered=list(sources.items())
assert len(ordered)>1899
selected=ordered[1800:1900]
assert len(selected)==100 and len({sid for sid,_ in selected})==100
loc_raw={loc:get(PATHS[loc]) for loc in LOCALES}; loc_json={loc:json.loads(loc_raw[loc]) for loc in LOCALES}; loc_blob={loc:blob(PATHS[loc]) for loc in LOCALES}
# Read exact historical frozen Spanish plan in the pinned PR tree and scan prior
# packet ledgers for same source IDs, including holds and any explicit disposition.
prior_path='docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/exact-hash-apply-plan.jsonl'
prior_bytes=get(prior_path); prior_file_sha=sha(prior_bytes); prior_rows=[]; prior_line_hash={}
for line in prior_bytes.splitlines():
 try: x=json.loads(line)
 except Exception: continue
 prior_rows.append(x)
 if x.get('id') or x.get('sourceId'):
  prior_line_hash[(x.get('id',x.get('sourceId')),x.get('locale'))]=sha(line)
prior_by={(x.get('id',x.get('sourceId')),x.get('locale')):x for x in prior_rows if x.get('id') or x.get('sourceId')}
selected_ids={sid for sid,_ in selected}
packet_hits=[]; ledger_files_scanned=0
for directory in OUT.parent.glob('seerrng-pr418-*'):
 if directory==OUT or not directory.is_dir(): continue
 for fp in directory.rglob('*.jsonl'):
  try: lines=fp.read_text(encoding='utf-8').splitlines()
  except Exception: continue
  has_hit=False
  for line in lines:
   try: x=json.loads(line)
   except Exception: continue
   sid=x.get('sourceId',x.get('id',x.get('catalogKey')))
   if sid in selected_ids:
    has_hit=True
    disp=next((x.get(k) for k in ('disposition','primaryDisposition','crossReviewDisposition','reviewDisposition','verdict','action') if x.get(k) is not None),None)
    packet_hits.append({'path':str(fp),'fileSha256':sha(fp.read_bytes()),'sourceId':sid,'locale':x.get('locale'),'disposition':disp,'row':x})
  if has_hit: ledger_files_scanned+=1
# Direct repository evidence from prior frozen plan is also considered.
for x in prior_rows:
 sid=x.get('id',x.get('sourceId'))
 if sid in selected_ids:
  packet_hits.append({'path':prior_path,'fileSha256':prior_file_sha,'sourceId':sid,'locale':x.get('locale'),'disposition':x.get('reviewDecision',x.get('action')),'row':x,'exactPlanRowSha256':prior_line_hash.get((sid,x.get('locale')))})
# Historical outcomes are preserved only if their source is identical and their
# exact final hash still matches the live locale cell.
prior_exact={}
for hit in packet_hits:
 x=hit['row']; sid=hit['sourceId']; loc=hit.get('locale')
 if not loc: continue
 final=x.get('finalTarget',x.get('targetText',x.get('priorTarget',x.get('proposal'))))
 if final is None: continue
 if x.get('source') not in (None,sources[sid]): continue
 if loc not in loc_json or sid not in loc_json[loc]: continue
 current=loc_json[loc][sid]
 final_hash=x.get('finalTargetHash',x.get('targetHash',x.get('priorTargetHash',x.get('proposalHash'))))
 if final_hash and sha(final)!=final_hash: continue
 if current==final and (not final_hash or sha(current)==final_hash):
  prior_exact[(sid,loc)]={'path':hit['path'],'sourceId':sid,'locale':loc,'priorDisposition':hit.get('disposition'),
    'priorFinalTarget':final,'priorFinalTargetHash':sha(final),'priorFileSha256':hit['fileSha256'],
    'priorRowSha256':hit.get('exactPlanRowSha256',sha(canon(x))),'priorSource':x.get('source',sources[sid]),'exactLiveMatch':True}
# Build exact caller evidence with relevant definitions and nearby callsites.
def sources_for(sid): return caller_paths(sid)
caller_records=[]; caller_by_id={}
for sid,_src in selected:
 paths=sources_for(sid); refs=[]; file_pins=[]; term=sid.split('.')[-1]
 for path in paths:
  raw=get(path); lines=raw.decode('utf-8').splitlines()
  file_pins.append({'path':path,'blob':blob(path),'fileSha256':sha(raw)})
  # Pin definition and direct use context. Exact leaf references are kept, capped
  # only to avoid a huge repeated ledger for ubiquitous words.
  for idx,line in enumerate(lines):
   if re.search(r'\b'+re.escape(term)+r'\b',line):
    if len(refs)>=30: break
    refs.append({'file':path,'line':idx+1,'lineText':line.strip(),'lineSha256':sha(line),
      'previousLine':lines[idx-1].strip() if idx else None,'nextLine':lines[idx+1].strip() if idx+1<len(lines) else None})
 ctx={'sourceId':sid,'callerPaths':paths,'callerFiles':file_pins,'searchTerms':[term],
   'pinnedLineRefs':refs,'callerUseStatus':'direct-or-helper-reference-found' if len(refs)>1 else 'definition-only-or-single-reference',
   'callerEvidenceNote':'Pinned component/helper source files and matching key/callsite lines at the exact PR tree; this is targeted source context, not a complete dynamic call graph.'}
 caller_records.append(ctx); caller_by_id[sid]=ctx
# Freeze all 1,200 values at exact head.
cells=[]; locale_infos={}; source_infos=[]
for position,(sid,src) in enumerate(selected,1800):
 old_for_sid={loc:prior_exact[(sid,loc)] for oldsid,loc in prior_exact if oldsid==sid}
 source_row={'sourcePosition':position,'sourceId':sid,'source':src,'sourceHash':sha(sid),'sourceTextSha256':sha(src),
   'sourceFile':source_path,'sourceCatalogBlob':source_blob,'sourceFileSha256':sha(source_raw),
   'callerContextRef':sid,'callerPaths':caller_by_id[sid]['callerPaths'],'callerContextSha256':sha(canon(caller_by_id[sid]))}
 source_infos.append(source_row)
 for loc in LOCALES:
  target=loc_json[loc][sid]; info=locale_infos.get(loc)
  if info is None: locale_infos[loc]={'path':PATHS[loc],'blob':loc_blob[loc],'sha256':sha(loc_raw[loc]),'bytes':len(loc_raw[loc])}
  prior=old_for_sid.get(loc)
  disposition='preserved-prior-disposition' if prior else 'review-required'
  if prior and prior['priorFinalTarget']!=target: raise SystemExit(f'prior final no longer exact at {position}/{loc}')
  cells.append({'sourcePosition':position,'sourceId':sid,'locale':loc,'source':src,'sourceHash':sha(sid),
   'sourceTextSha256':sha(src),'sourceFile':source_path,'sourceCatalogBlob':source_blob,'sourceFileSha256':sha(source_raw),
   'currentTarget':target,'currentTargetHash':sha(target),'localeFile':PATHS[loc],'localeBlob':loc_blob[loc],
   'localeFileSha256':sha(loc_raw[loc]),'callerContextRef':sid,'callerContextSha256':source_row['callerContextSha256'],
   'sourcePlaceholders':phs(src),'targetPlaceholders':phs(target),'placeholderParity':'exact' if sorted(phs(src),key=lambda x:(x['name'],x['kind']))==sorted(phs(target),key=lambda x:(x['name'],x['kind'])) else 'mismatch',
   'sourceMarkup':tags(src),'targetMarkup':tags(target),'markupParity':'exact' if tags(src)==tags(target) else 'mismatch',
   'protectedLiterals':sorted(set([x['name'] for x in phs(src)]+[token for token in PROTECTED_TERMS if token in src])),'priorDisposition':prior,'disposition':disposition,
   'targetText':target if prior else None,'targetHash':sha(target) if prior else None,
   'rationale':prior.get('priorDisposition') if prior else None})
# Preserve previous packet IDs / prior disposition boundary.
prior_boundary={'scopePositions':[1800,1899],'selectedSourceIds':len(selected_ids),'searchedPriorPacketDirs':len([d for d in OUT.parent.glob('seerrng-pr418-*') if d.is_dir() and d!=OUT]),
 'priorLedgerFilesWithMatches':ledger_files_scanned,'matchingPriorRows':len(packet_hits),'exactLivePriorDispositions':len(prior_exact),
 'matches':[{'sourceId':x['sourceId'],'locale':x['locale'],'path':x['path'],'disposition':x.get('disposition'),'priorFinalTargetHash':x.get('priorFinalTargetHash')} for x in packet_hits],
 'currentSourceIdsUnique':len(selected_ids)==100,'note':'Exact matching prior dispositions are preserved; historical rows with drift or mismatched source were not used as current decisions.'}
writej(OUT/'source-window.json',{'head':HEAD,'tree':TREE,'sourceList':[{'position':1800+i,'sourceId':sid,'source':src,'sourceHash':sha(src)} for i,(sid,src) in enumerate(selected)],'sourceCatalog':{'path':source_path,'blob':source_blob,'sha256':sha(source_raw),'bytes':len(source_raw)},'sourceCount':100,'sourcePositionRange':[1800,1899]})
writejl(OUT/'source-current-cells.jsonl',cells)
writejl(OUT/'caller-contexts.jsonl',caller_records)
writej(OUT/'prior-disposition-boundary.json',prior_boundary)
writej(OUT/'input-manifest.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'livePullRequest':pr,
 'scope':{'positions':[1800,1899],'sourceIds':100,'locales':LOCALES,'cells':len(cells)},
 'sourceCatalog':{'path':source_path,'blob':source_blob,'sha256':sha(source_raw),'bytes':len(source_raw)},
 'localeCatalogs':locale_infos,'callerContextRows':len(caller_records),'callerFiles':len({f['path'] for c in caller_records for f in c['callerFiles']}),
 'callerReferences':sum(len(c['pinnedLineRefs']) for c in caller_records),'priorFrozenRows':len(prior_exact),
 'priorEvidence':{'path':prior_path,'blob':blob(prior_path),'sha256':prior_file_sha},
 'primaryPacketDirectoriesScanned':prior_boundary['searchedPriorPacketDirs'],'matchingPriorRows':len(packet_hits),
 'worktree':str(REPO),'worktreeClean':True})
(OUT/'INPUT-SHA256SUMS').write_text(''.join(f'{sha((OUT/name).read_bytes())}  {name}\n' for name in ['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json']))
print(json.dumps({'head':HEAD,'tree':TREE,'sourceIds':100,'cells':len(cells),'currentPriorDispositionCount':len(prior_exact),'matchingPriorRows':len(packet_hits),'callerRows':len(caller_records),'callerRefs':sum(len(c['pinnedLineRefs']) for c in caller_records),'uniqueCallerFiles':len({f['path'] for c in caller_records for f in c['callerFiles']}),'sourceFirst':selected[0],'sourceLast':selected[-1],'output':str(OUT)},ensure_ascii=False,indent=2))
