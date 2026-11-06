from __future__ import annotations
import hashlib, json, pathlib, re, subprocess, collections, os

OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='f20893e57a89827095fa049d8e0475df7ec7170f'
TREE='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PATHS={x:f'src/i18n/locale/{x}.json' for x in LOCALES}
PROTECTED_TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library']
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
def has_term(text,term):
 if term in ('ROM','PC','4K'):
  suffix='s?' if term=='ROM' else ''
  return re.search(r'(?<![A-Za-z0-9])'+re.escape(term)+suffix+r'(?![A-Za-z0-9])',text) is not None
 return term.casefold() in text.casefold()
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
def writej(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(path,rows): path.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
pr=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD,pr
remote_head=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{pr["headRefName"]}').split()[0]
assert remote_head==HEAD,{'remoteHead':remote_head,'expected':HEAD}
assert run('git','-C',str(REPO),'rev-parse','HEAD').strip()==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE
assert run('git','-C',str(REPO),'status','--porcelain').strip()==''
source_path='src/i18n/locale/en.json'; source_raw=get(source_path); source_blob=blob(source_path)
sources=dict(flatten(json.loads(source_raw))); ordered=list(sources.items())
assert len(ordered)>2499
selected=ordered[2400:2500]
assert len(selected)==100 and len({sid for sid,_ in selected})==100
loc_raw={loc:get(PATHS[loc]) for loc in LOCALES}; loc_json={loc:json.loads(loc_raw[loc]) for loc in LOCALES}; loc_blob={loc:blob(PATHS[loc]) for loc in LOCALES}

# Freeze prior exact decisions across earlier primary/cross-review evidence only
# when source and final target both exactly match this live catalog.
selected_ids={sid for sid,_ in selected}
packet_hits=[]; ledger_files_scanned=0
for directory in OUT.parent.glob('seerrng-pr418-*'):
 if directory==OUT or not directory.is_dir() or directory.name.endswith('-hidvi-primary-20261102'): continue
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
    disp=next((x.get(k) for k in ('disposition','primaryDisposition','crossReviewDisposition','reviewDisposition','verdict','action','reviewDecision') if x.get(k) is not None),None)
    packet_hits.append({'path':str(fp),'fileSha256':sha(fp.read_bytes()),'sourceId':sid,'locale':x.get('locale'),'disposition':disp,'row':x})
  if has_hit: ledger_files_scanned+=1
prior_exact={}
for hit in packet_hits:
 x=hit['row']; sid=hit['sourceId']; loc=hit.get('locale')
 if not loc or loc not in loc_json or sid not in loc_json[loc]: continue
 final=x.get('finalTarget',x.get('targetText',x.get('priorFinalTarget',x.get('proposal',x.get('candidateTarget')))))
 if final is None or x.get('source') not in (None,sources[sid]): continue
 current=loc_json[loc][sid]
 final_hash=x.get('finalTargetHash',x.get('targetHash',x.get('priorFinalTargetHash',x.get('proposalHash',x.get('candidateTargetHash')))))
 if final_hash and sha(final)!=final_hash: continue
 if current==final and (not final_hash or sha(current)==final_hash):
  prior_exact[(sid,loc)]={'path':hit['path'],'sourceId':sid,'locale':loc,'priorDisposition':hit['disposition'],
   'priorFinalTarget':final,'priorFinalTargetHash':sha(final),'priorFileSha256':hit['fileSha256'],
   'priorRowSha256':sha(canon(x)),'priorSource':x.get('source',sources[sid]),'exactLiveMatch':True}
# Identify likely caller files by source group names, then pin exact leaf matches.
all_paths=run('git','-C',str(REPO),'ls-tree','-r','--name-only',HEAD,'src').splitlines()
code_paths=[p for p in all_paths if p.endswith(('.ts','.tsx','.js','.jsx')) and '.test.' not in p]
caller_records=[]; caller_by_id={}
for sid,_src in selected:
 parts=sid.split('.'); leaf=parts[-1]; groups=parts[1:-1]
 # Prefer exact basename of the last group; include basename-prefix matches for names such as DetailDisclosureButton.
 group=groups[-1] if groups else ''
 candidates=[]
 for p in code_paths:
  base=pathlib.PurePosixPath(p).stem
  dirs=pathlib.PurePosixPath(p).parts
  if base==group or base.startswith(group) or base.endswith(group) or group in dirs:
   candidates.append(p)
 # Component aliases in source keys do not always equal the component filename.
 if sid.startswith('components.MediaDetails.SeriesBrowser.'):
  candidates=['src/components/MediaDetails/SeriesSeasonEpisodeBrowser.tsx']
 if sid.startswith('components.MusicArtistFilter.'):
  candidates=['src/components/Discover/FilterPanel/MusicArtistSelector.tsx']
 if sid.startswith('components.MusicCollectionFilters.'):
  candidates=['src/components/CollectionDetails/MusicCollectionFilterRow.tsx']
 # If nested group strings exist, refine to a path containing the preceding group where possible.
 if len(groups)>1:
  prev=groups[-2]
  narrowed=[p for p in candidates if prev in pathlib.PurePosixPath(p).parts or f'/{prev}/' in p]
  if narrowed: candidates=narrowed
 files=[]; refs=[]
 for path in candidates:
  try: raw=get(path)
  except Exception: continue
  lines=raw.decode('utf-8').splitlines()
  found=False
  for idx,line in enumerate(lines):
   if re.search(r'\b'+re.escape(leaf)+r'\b',line):
    found=True
    refs.append({'file':path,'line':idx+1,'lineText':line.strip(),'lineSha256':sha(line),
     'previousLine':lines[idx-1].strip() if idx else None,'nextLine':lines[idx+1].strip() if idx+1<len(lines) else None})
  if found:
   files.append({'path':path,'blob':blob(path),'fileSha256':sha(raw)})
 if not files:
  # Preserve key/group trace with the mapped component paths, but do not claim a render call.
  files=[{'path':p,'blob':blob(p),'fileSha256':sha(get(p))} for p in candidates[:8]]
 ctx={'sourceId':sid,'callerPaths':[x['path'] for x in files],'callerFiles':files,
  'searchTerms':[leaf],'pinnedLineRefs':refs[:60],
  'callerUseStatus':'direct-or-helper-reference-found' if len(refs)>1 else ('definition-only-or-single-reference' if refs else 'caller-use-not-found'),
  'callerEvidenceNote':'Targeted search of the source group component file(s) at the exact PR tree; line refs include the exact key leaf. This is not a complete dynamic call graph.'}
 caller_records.append(ctx); caller_by_id[sid]=ctx
# Freeze every current cell and all catalog/caller hashes.
cells=[]; locale_infos={}; source_rows=[]
for position,(sid,src) in enumerate(selected,2400):
 ctx=caller_by_id[sid]
 source_rows.append({'sourcePosition':position,'sourceId':sid,'source':src,'sourceHash':sha(sid),'sourceTextSha256':sha(src),
  'sourceFile':source_path,'sourceCatalogBlob':source_blob,'sourceFileSha256':sha(source_raw),
  'callerContextRef':sid,'callerPaths':ctx['callerPaths'],'callerContextSha256':sha(canon(ctx))})
 for loc in LOCALES:
  target=loc_json[loc][sid]
  if loc not in locale_infos: locale_infos[loc]={'path':PATHS[loc],'blob':loc_blob[loc],'sha256':sha(loc_raw[loc]),'bytes':len(loc_raw[loc])}
  prior=prior_exact.get((sid,loc))
  cells.append({'sourcePosition':position,'sourceId':sid,'locale':loc,'source':src,'sourceHash':sha(sid),
   'sourceTextSha256':sha(src),'sourceFile':source_path,'sourceCatalogBlob':source_blob,'sourceFileSha256':sha(source_raw),
   'currentTarget':target,'currentTargetHash':sha(target),'localeFile':PATHS[loc],'localeBlob':loc_blob[loc],
   'localeFileSha256':sha(loc_raw[loc]),'callerContextRef':sid,'callerContextSha256':source_rows[-1]['callerContextSha256'],
   'sourcePlaceholders':ph(src),'targetPlaceholders':ph(target),'placeholderParity':'exact' if sorted(ph(src),key=lambda x:(x['name'],x['kind']))==sorted(ph(target),key=lambda x:(x['name'],x['kind'])) else 'mismatch',
   'sourceMarkup':tags(src),'targetMarkup':tags(target),'markupParity':'exact' if tags(src)==tags(target) else 'mismatch',
   'protectedLiterals':sorted(set([x['name'] for x in ph(src)]+[t for t in PROTECTED_TERMS if has_term(src,t)])),
   'priorDisposition':prior,'disposition':'preserved-prior-disposition' if prior else 'review-required',
   'targetText':prior['priorFinalTarget'] if prior else None,'targetHash':prior['priorFinalTargetHash'] if prior else None,
   'rationale':prior.get('priorDisposition') if prior else None})
prior_boundary={'scopePositions':[2400,2499],'selectedSourceIds':len(selected_ids),
 'searchedPriorPacketDirs':len([d for d in OUT.parent.glob('seerrng-pr418-*') if d.is_dir() and d!=OUT and not d.name.endswith('-hidvi-primary-20261102')]),
 'priorLedgerFilesWithMatches':ledger_files_scanned,'matchingPriorRows':len(packet_hits),'exactLivePriorDispositions':len(prior_exact),
 'matches':[{'sourceId':x['sourceId'],'locale':x['locale'],'path':x['path'],'disposition':x.get('disposition')} for x in packet_hits],
 'currentSourceIdsUnique':len(selected_ids)==100,
 'note':'Only exact source plus exact final-target matches were considered prior dispositions; unmatched, stale, proposed-only, or unverified rows remain review-required.'}
writej(OUT/'source-window.json',{'head':HEAD,'tree':TREE,'sourceList':[{'position':2400+i,'sourceId':sid,'source':src,'sourceHash':sha(sid)} for i,(sid,src) in enumerate(selected)],
 'sourceCatalog':{'path':source_path,'blob':source_blob,'sha256':sha(source_raw),'bytes':len(source_raw)},'sourceCount':100,'sourcePositionRange':[2400,2499]})
writejl(OUT/'source-current-cells.jsonl',cells); writejl(OUT/'caller-contexts.jsonl',caller_records)
writej(OUT/'prior-disposition-boundary.json',prior_boundary)
writej(OUT/'input-manifest.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'livePullRequest':pr,'remoteBranchHead':remote_head,
 'scope':{'positions':[2400,2499],'sourceIds':100,'locales':LOCALES,'cells':len(cells)},
 'sourceCatalog':{'path':source_path,'blob':source_blob,'sha256':sha(source_raw),'bytes':len(source_raw)},
 'localeCatalogs':locale_infos,'protectedTerms':PROTECTED_TERMS,'callerContextRows':len(caller_records),'callerFiles':len({f['path'] for c in caller_records for f in c['callerFiles']}),
 'callerReferences':sum(len(c['pinnedLineRefs']) for c in caller_records),'priorFrozenRows':len(prior_exact),
 'primaryPacketDirectoriesScanned':prior_boundary['searchedPriorPacketDirs'],'matchingPriorRows':len(packet_hits),
 'worktree':str(REPO),'worktreeClean':True})
names=['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json']
(OUT/'INPUT-SHA256SUMS').write_text(''.join(f'{sha((OUT/n).read_bytes())}  {n}\n' for n in names))
pr2=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
remote2=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{pr2["headRefName"]}').split()[0]
assert pr2['state']=='OPEN' and pr2['isDraft'] is True and pr2['headRefOid']==HEAD and remote2==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE and run('git','-C',str(REPO),'status','--porcelain').strip()==''
print(json.dumps({'head':HEAD,'tree':TREE,'remoteHead':remote2,'sourceIds':100,'cells':len(cells),'currentPriorDispositionCount':len(prior_exact),
 'matchingPriorRows':len(packet_hits),'callerRows':len(caller_records),'callerRefs':sum(len(c['pinnedLineRefs']) for c in caller_records),
 'callerFiles':len({f['path'] for c in caller_records for f in c['callerFiles']}),'callerGaps':sum(c['callerUseStatus']=='caller-use-not-found' for c in caller_records),
 'sourceFirst':selected[0],'sourceLast':selected[-1],'output':str(OUT)},ensure_ascii=False,indent=2))
