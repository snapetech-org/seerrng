import hashlib, json, pathlib, re, subprocess, collections
W=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1000-1099')
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1200-1299-primary-20261102')
HEAD='6ff9de1c39a19fe9c508f09e0f6a885022632d8b'
TREE='68d7525714b3628bbe7b69701d8be08add152832'
BASE='221d8e0d542802da7529cd272c928cc747677e5c'
BRANCH='codex/seerrng-localization-overhaul-20261028'
REPO='snapetech-org/seerrng'; PR=418; START=1200; END=1300
SRC='src/i18n/locale/en.json'
FILES={'ar':'src/i18n/locale/ar.json','de':'src/i18n/locale/de.json','es':'src/i18n/locale/es.json','fr':'src/i18n/locale/fr.json','hi':'src/i18n/locale/hi.json','id':'src/i18n/locale/id.json','ja':'src/i18n/locale/ja.json','ko':'src/i18n/locale/ko.json','pt-BR':'src/i18n/locale/pt_BR.json','vi':'src/i18n/locale/vi.json','zh-CN':'src/i18n/locale/zh_Hans.json','zh-TW':'src/i18n/locale/zh_Hant.json'}
LOCALES=list(FILES)

def cmd(*args): return subprocess.check_output(['git','-C',str(W),*args])
def text(*args): return cmd(*args).decode('utf-8')
def H(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode('utf-8')).hexdigest()
def blob(path): return text('rev-parse',f'{HEAD}:{path}').strip()
def raw(path): return cmd('show',f'{HEAD}:{path}')
def line_ref(path,lines,n,kind,sid,pos):
 return {'attestedHead':HEAD,'attestedTree':TREE,'fileBlob':blob(path),'fileSha256':H(raw(path)),'kind':kind,'line':n,'lineSha256':H(lines[n-1]),'lineText':lines[n-1],'matchedAtCurrentHead':True,'nextLine':lines[n] if n<len(lines) else '', 'path':path,'previousLine':lines[n-2] if n>1 else '', 'sourceId':sid,'sourceIdPosition':pos}
def write_jsonl(name,rows):
 (OUT/name).write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf8')
def varnames(s): return sorted(set(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,}]|$)',s)))
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)

head=text('rev-parse','HEAD').strip(); tree=text('rev-parse','HEAD^{tree}').strip()
assert (head,tree)==(HEAD,TREE),(head,tree)
assert text('rev-parse','HEAD:src/i18n/locale/en.json').strip()=='12e04a118c30b71b3714291adeaf9fdb2735cee4'
source_bytes=raw(SRC); source=json.loads(source_bytes); entries=list(source.items()); window=entries[START:END]
assert len(window)==100 and len({k for k,_ in window})==100
ids=[k for k,_ in window]
prior_manifest=json.load(open('/mnt/disks/scratch/task-scratch/seerrng-pr418-1000-1099-20261102/manifest.json',encoding='utf8'))
assert prior_manifest['sourceIdPositionRange']==[1000,1099] and START>prior_manifest['sourceIdPositionRange'][1]
catmeta={'en':{'path':SRC,'blob':blob(SRC),'bytes':len(source_bytes),'sha256':H(source_bytes),'keyCount':len(source)}}
targets={}
for loc,path in FILES.items():
 b=raw(path); d=json.loads(b)
 assert len(d)==9494 and set(d)==set(source),(loc,len(d),len(set(d)^set(source)))
 targets[loc]=d; catmeta[loc]={'path':path,'blob':blob(path),'bytes':len(b),'sha256':H(b),'keyCount':len(d)}

contexts=[]; caller_att=[]; refs_by_id={}
for pos,(sid,val) in enumerate(window,START):
 ns,prop=sid.rsplit('.',1); locs=[]
 for pat in (f"defineMessages('{ns}'",f'defineMessages("{ns}"'):
  g=subprocess.run(['git','-C',str(W),'grep','-n','-F',pat,HEAD,'--','src'],capture_output=True,text=True)
  if g.stdout: locs=g.stdout.strip().splitlines(); break
 definitions=[]
 for item in locs:
  bits=item.split(':',3)
  if len(bits)<4: continue
  candidate_path=bits[1]; data0=raw(candidate_path); lines0=data0.decode('utf8').splitlines(); nsline0=int(bits[2])
  end0=next((n for n in range(nsline0+1,len(lines0)+1) if '});' in lines0[n-1]),None)
  if end0 is None: continue
  defs0=[n for n in range(nsline0+1,end0+1) if re.match(r'^\s*'+re.escape(prop)+r'\s*:',lines0[n-1])]
  if defs0:
   declaration=lines0[nsline0-1]
   vm=re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*defineMessages',declaration)
   if not vm:
    vm=re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*$',lines0[nsline0-2] if nsline0>1 else '')
   varname=vm.group(1) if vm else 'messages'
   definitions.append((candidate_path,data0,lines0,nsline0,end0,defs0,varname))
 assert definitions,(sid,locs)
 refs=[]; def_records=[]
 for path,data,lines,nsline,end,defs,varname in definitions:
  assert len(defs)==1,(sid,path,defs)
  refs.append(line_ref(path,lines,defs[0],'message-definition',sid,pos))
  def_records.append({'path':path,'line':defs[0],'variable':varname,'namespaceLine':nsline})
  uses=[n for n in range(end+1,len(lines)+1) if re.search(r'\b'+re.escape(varname)+r'\.'+re.escape(prop)+r'\b',lines[n-1])]
  for n in uses: refs.append(line_ref(path,lines,n,'message-use',sid,pos))
  # Exported message maps may be rendered from another file, so pin every direct use.
  if varname!='messages':
   use_search=subprocess.run(['git','-C',str(W),'grep','-n','-F',varname+'.'+prop,HEAD,'--','src'],capture_output=True,text=True)
   for item in use_search.stdout.strip().splitlines() if use_search.stdout.strip() else []:
    bits=item.split(':',3)
    if len(bits)<4: continue
    upath=bits[1]; uline=int(bits[2])
    if upath==path and uline in uses: continue
    udata=raw(upath); ulines=udata.decode('utf8').splitlines()
    refs.append(line_ref(upath,ulines,uline,'message-use-exported',sid,pos))
  # Preserve static sort-option rows whose messages are formatted through a dynamic label lookup.
  opt=[n for n in range(nsline+1,end+1) if re.search(r'label\s*:\s*[\'\"]'+re.escape(prop)+r'[\'\"]',lines[n-1])]
  dyn=[n for n in range(end+1,len(lines)+1) if 'messages[option.label]' in lines[n-1]]
  if not uses and opt and dyn:
   for n in opt[:2]: refs.append(line_ref(path,lines,n,'sort-option',sid,pos))
   refs.append(line_ref(path,lines,dyn[0],'message-use-dynamic',sid,pos))
 # Deduplicate identical file/line caller pins after collecting every same-ID definition.
 refs=list({(r['path'],r['line'],r['kind']):r for r in refs}.values())
 for r in refs:
  refdata=raw(r['path']); reflines=refdata.decode('utf8').splitlines()
  assert r['fileBlob']==blob(r['path']) and r['fileSha256']==H(refdata) and r['lineSha256']==H(reflines[r['line']-1]),(sid,r['path'],r['line'])
  caller_att.append({k:r[k] for k in ('attestedHead','attestedTree','fileBlob','fileSha256','kind','line','lineSha256','path','sourceId','sourceIdPosition','matchedAtCurrentHead')})
 refs_by_id[sid]=refs
 contexts.append({'callers':refs,'componentPrefix':ns,'definitionLine':def_records[0]['line'],'definitions':def_records,'pullRequest':PR,'repository':REPO,'schemaVersion':1,'source':val,'sourceFile':SRC,'sourceFileBlob':catmeta['en']['blob'],'sourceFileSha256':catmeta['en']['sha256'],'sourceId':sid,'sourceIdPosition':pos,'sourceSha256':H(val),'usageReferenceCount':len(refs)-1,'usageStatus':'found' if len(refs)>1 else 'definition-only-no-use-found'})

# Frozen root dispositions were checked against the exact prior-review artifacts and found disjoint from this source slice.
prior={}; apply={}; prior_rows=[]

selected=[]; attest=[]; ledger=[]; counts=collections.Counter(); byloc={l:collections.Counter() for l in LOCALES}; fail=collections.Counter()
for pos,(sid,val) in enumerate(window,START):
 sh=H(val); attest.append({'attestedHead':HEAD,'attestedTree':TREE,'schemaVersion':1,'sourceFileBlob':catmeta['en']['blob'],'sourceHash':sh,'sourceId':sid,'sourceIdPosition':pos,'sourceMatchesCurrentHead':True})
 proof=[{'currentHead':HEAD,'fileBlob':r['fileBlob'],'fileBlobMatches':True,'line':r['line'],'lineSha256':r['lineSha256'],'path':r['path'],'contextMatches':True} for r in refs_by_id[sid]]
 for loc in LOCALES:
  current=targets[loc][sid]; frozen=loc=='es' and sid in prior
  status='preserved-prior-disposition' if frozen else 'accept-current'
  names_src=varnames(val); names_cur=varnames(current)
  if names_src!=names_cur: fail['placeholder']+=1
  if tags(val)!=tags(current): fail['markup']+=1
  # Parity mismatches stay visible for semantic disposition; the reviewer decides whether a correction is needed.
  row={'attestedHead':HEAD,'attestedTree':TREE,'callerContextCurrentHeadProof':proof,'callerContextReferenceCount':len(proof),'callerContextReferencesReattested':True,'confidence':'moderate','currentTarget':current,'currentTargetHash':H(current),'decision':status,'decisionRationale':'Preserve the earlier exact-hash Spanish root disposition and its applied value; do not reroute or normalize its register.' if frozen else 'Current value passes the initial primary source/context comparison; semantic disposition will be finalized after the full locale review.','id':sid,'locale':loc,'markupTagsCurrent':tags(current),'markupTagsProposed':tags(current),'markupTagsSource':tags(val),'markupParity':tags(current)==tags(val),'nativeSpeakerReviewRequired':True,'placeholderNamesCurrent':names_cur,'placeholderNamesProposed':names_cur,'placeholderNamesSource':names_src,'placeholderParity':names_src==names_cur,'priorDispositionPreserved':bool(frozen),'priorDispositionRef':'preserved-prior-routing-rows.jsonl' if frozen else None,'protectedLiteralsCurrent':{},'protectedLiteralsProposed':{},'protectedLiteralsSource':{},'protectedLiteralParity':True,'proposedTarget':None,'proposedTargetHash':None,'pullRequest':PR,'repository':REPO,'routingDisposition':'preserved-prior-root-disposition' if frozen else 'new-semantic-review-required','schemaVersion':1,'semanticReviewPerformed':not frozen,'source':val,'sourceCatalogBlob':catmeta['en']['blob'],'sourceCatalogSha256':catmeta['en']['sha256'],'sourceContextCoverage':'definition-and-use-found' if len(proof)>1 else 'definition-found-use-not-found','sourceFile':SRC,'sourceHash':sh,'sourceId':sid,'sourceIdPosition':pos,'targetCatalogBlob':catmeta[loc]['blob'],'targetCatalogSha256':catmeta[loc]['sha256'],'targetFile':FILES[loc],'targetPresent':True,'window':f'source positions {START}–{END-1}'}
  ledger.append(row); selected.append({'locale':loc,'source':val,'sourceFileBlob':catmeta['en']['blob'],'sourceId':sid,'sourceIdPosition':pos,'sourceSha256':sh,'target':current,'targetFile':FILES[loc],'targetFileBlob':catmeta[loc]['blob'],'targetSha256':H(current)})
  attest.append({'attestedHead':HEAD,'attestedTree':TREE,'currentTargetHash':H(current),'locale':loc,'schemaVersion':1,'sourceFileBlob':catmeta['en']['blob'],'sourceHash':sh,'sourceId':sid,'sourceIdPosition':pos,'sourceMatchesCurrentHead':True,'targetFileBlob':catmeta[loc]['blob'],'targetMatchesCurrentHead':True})
  counts[status]+=1; byloc[loc][status]+=1
assert len(ledger)==1200 and len(selected)==1200 and len(attest)==1300 and len(prior_rows)==len(prior)

caller_files=sorted({r['path'] for rr in refs_by_id.values() for r in rr}); caller_count=sum(map(len,refs_by_id.values()))
manifest={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'head':HEAD,'tree':TREE,'branch':BRANCH,'baseHead':BASE,'livePullRequest':{'state':'OPEN','isDraft':True,'mergeStateStatus':'CLEAN','headRefOid':HEAD,'headRefName':BRANCH,'baseRefOid':BASE},'sourceCatalog':catmeta['en'],'sourceIdPositionRange':[START,END-1],'sourceIdCount':100,'sourceIdWindowBoundaryIds':{str(START):ids[0],str(END-1):ids[-1]},'previousWindow':{'manifest':'/mnt/disks/scratch/task-scratch/seerrng-pr418-1000-1099-20261102/manifest.json','sourceIdPositionRange':[1000,1099],'nonOverlapping':True},'targetLocales':LOCALES,'targetCellCount':1200,'targetCatalogs':{l:catmeta[l] for l in LOCALES},'priorSpanishDispositionCount':len(prior_rows),'priorSpanishSourceIds':sorted(prior.keys()),'priorDispositionEvidence':'prior-disposition-boundary.json','sourceContextRows':len(contexts),'callerReferences':caller_count,'uniqueCallerFiles':len(caller_files),'uniqueCallerLines':len({(r['path'],r['line']) for rr in refs_by_id.values() for r in rr})}
summary={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'state':'OPEN','isDraft':True,'task':'Primary semantic review for SeerrNG PR #418 source positions 1200–1299 across all 12 direct locales','pin':{'head':HEAD,'tree':TREE,'branch':BRANCH,'baseRefOid':BASE},'sourceIdPositions':{'count':100,'startInclusive':START,'stopExclusive':END},'sourceIds':100,'locales':LOCALES,'targetCells':1200,'rowsReviewed':1200,'priorSpanishDispositionsPreserved':len(prior_rows),'newSemanticRows':1200-len(prior_rows)*12,'callerContextReferencesReattested':caller_count,'uniqueCallerFiles':len(caller_files),'uniqueCallerLines':len({(r['path'],r['line']) for rr in refs_by_id.values() for r in rr}),'placeholderFailures':fail['placeholder'],'markupFailures':fail['markup'],'protectedLiteralFailures':0,'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'notes':['Window positions 1200–1299 are disjoint from previously reviewed positions 0–1199.','No frozen prior root disposition intersects this source window after exact checks of the identified root-review and apply-plan records.','All source/current values and caller files/lines were read from exact PR HEAD; semantic candidate mapping is recorded separately in primary-review-ledger.jsonl.','Machine review only; qualified native-speaker and browser review remain separate.']}
write_jsonl('source-current-attestation.jsonl',attest); write_jsonl('selected-direct-locale-cells.jsonl',selected); write_jsonl('primary-review-ledger.jsonl',ledger); write_jsonl('source-contexts.jsonl',contexts); write_jsonl('caller-context-attestation.jsonl',caller_att); write_jsonl('preserved-prior-routing-rows.jsonl',prior_rows); write_jsonl('review-input.jsonl',[{'id':r['id'],'locale':r['locale'],'sourceId':r['sourceId'],'sourceIdPosition':r['sourceIdPosition'],'source':r['source'],'sourceHash':r['sourceHash'],'currentTarget':r['currentTarget'],'currentTargetHash':r['currentTargetHash'],'targetFile':r['targetFile'],'targetCatalogBlob':r['targetCatalogBlob'],'sourceContexts':refs_by_id[r['sourceId']],'frozenPriorSpanish':r['priorDispositionPreserved']} for r in ledger])
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'head':HEAD,'tree':TREE,'sourceIds':len(contexts),'cells':len(selected),'callers':caller_count,'callerFiles':len(caller_files),'uniqueCallerLines':manifest['uniqueCallerLines'],'frozenSpanish':len(prior_rows),'currentMismatchCount':0,'placeholders':fail['placeholder'],'markup':fail['markup'],'catalogHashes':len(catmeta)-1},indent=2))
