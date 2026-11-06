import json, hashlib, pathlib, subprocess, re, collections
O=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1800-1899-crossreview-by-agent-20261102/packet')
P=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1800-1899-primary-20261102')
W=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
REPO='snapetech-org/seerrng'; PR=418
HEAD='78a36214596544e1b3033c6a612ae5559db713e3'; TREE='ef83a00d078f0a4aed6269b4c23282dbf91fd6f7'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

def sha(b): return hashlib.sha256(b).hexdigest()
def jbytes(x): return json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
def git(*args): return subprocess.check_output(['git','-C',str(W),*args])
def read_git(path): return git('show',f'HEAD:{path}')
def blob(path): return git('rev-parse',f'HEAD:{path}').decode().strip()
def save(name,obj): (O/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def save_jsonl(name,rows): (O/name).write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in rows))
def placeholders(s): return collections.Counter(re.findall(r'\{[^{}]+\}',s))
def markup(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def live_pr():
  return json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo',REPO,'--json','state,isDraft,headRefOid,headRefName,baseRefName,baseRefOid,url'],text=True))

assert git('rev-parse','HEAD').decode().strip()==HEAD
assert git('rev-parse','HEAD^{tree}').decode().strip()==TREE
assert git('status','--porcelain').decode()==''
pr_before=live_pr()
assert pr_before['headRefOid']==HEAD and pr_before['state']=='OPEN' and pr_before['isDraft'] is True

# Load the exact packet input and validate its hashes before independent semantic review.
packet_manifest=json.loads((P/'input-manifest.json').read_text())
assert packet_manifest['head']==HEAD and packet_manifest['tree']==TREE
assert packet_manifest['scope']['positions']==[1800,1899] and packet_manifest['scope']['cells']==1200
source_rows=[json.loads(x) for x in (P/'source-current-cells.jsonl').read_text().splitlines()]
primary_rows=[json.loads(x) for x in (P/'primary-review-ledger.jsonl').read_text().splitlines()]
caller_rows=[json.loads(x) for x in (P/'caller-contexts.jsonl').read_text().splitlines()]
candidates=json.loads((P/'candidate-targets.json').read_text())
assert len(source_rows)==len(primary_rows)==1200 and len(caller_rows)==100
assert len({(x['sourcePosition'],x['locale']) for x in source_rows})==1200
assert len({(x['sourcePosition'],x['locale']) for x in primary_rows})==1200
assert len({x['sourceId'] for x in caller_rows})==100

# Independently re-read the exact source and locale catalogs, then the caller files and line pins.
source_path='src/i18n/locale/en.json'
source_bytes=read_git(source_path); source_catalog=json.loads(source_bytes); source_ids=list(source_catalog)
source_file={ 'path':source_path,'blob':blob(source_path),'sha256':sha(source_bytes),'bytes':len(source_bytes) }
assert source_file['blob']==packet_manifest['sourceCatalog']['blob'] and source_file['sha256']==packet_manifest['sourceCatalog']['sha256']
catalogs={}; catalog_files={}
for loc in LOCALES:
  f=f'src/i18n/locale/{loc}.json'; b=read_git(f); catalogs[loc]=json.loads(b)
  catalog_files[loc]={'path':f,'blob':blob(f),'sha256':sha(b),'bytes':len(b)}
  expected=packet_manifest['localeCatalogs'][loc]
  assert catalog_files[loc]['blob']==expected['blob'] and catalog_files[loc]['sha256']==expected['sha256']
source_key_rows=collections.defaultdict(list)
for x in source_rows: source_key_rows[x['sourceId']].append(x)
cell_integrity=[]
for x in source_rows:
  pos=x['sourcePosition']; loc=x['locale']; sid=x['sourceId']
  assert source_ids[pos]==sid and source_catalog[sid]==x['source']
  assert catalogs[loc][sid]==x['currentTarget']
  assert sha(x['source'].encode())==x['sourceTextSha256']
  assert sha(sid.encode())==x['sourceHash']
  assert sha(x['currentTarget'].encode())==x['currentTargetHash']
  cell_integrity.append((pos,loc,sid))
assert len({x[0] for x in cell_integrity})==100 and all(len(source_key_rows[sid])==12 for sid in source_key_rows)

caller_by_id={x['sourceId']:x for x in caller_rows}
caller_file_attest={}; caller_line_errors=[]
for row in caller_rows:
  assert row['sourceId'] in source_catalog and sha(jbytes(row))==next(x['callerContextSha256'] for x in primary_rows if x['sourceId']==row['sourceId'])
  for f in row['callerFiles']:
    path=f['path']; content=read_git(path); actual={'blob':blob(path),'fileSha256':sha(content)}
    if path in caller_file_attest and caller_file_attest[path]!=actual: caller_line_errors.append({'path':path,'reason':'inconsistent duplicate file pin'})
    caller_file_attest[path]=actual
    if actual['blob']!=f['blob'] or actual['fileSha256']!=f['fileSha256']: caller_line_errors.append({'path':path,'reason':'file pin mismatch'})
  for ref in row['pinnedLineRefs']:
    path=ref['file']; content=read_git(path); lines=content.decode('utf-8').splitlines(); n=ref['line']
    if n<1 or n>len(lines) or lines[n-1].strip()!=ref['lineText'] or sha(lines[n-1].encode())!=ref['lineSha256']:
      caller_line_errors.append({'sourceId':row['sourceId'],'path':path,'line':n,'reason':'caller line mismatch'})
assert not caller_line_errors, json.dumps(caller_line_errors,ensure_ascii=False)
for sid in source_catalog:
  pass

# Confirm the primary ledger and candidate map agree with the independently reread cells.
primary_by_key={(x['sourcePosition'],x['locale']):x for x in primary_rows}
source_by_key={(x['sourcePosition'],x['locale']):x for x in source_rows}
assert set(primary_by_key)==set(source_by_key)
for key,x in primary_by_key.items():
  s=source_by_key[key]
  assert x['sourceId']==s['sourceId'] and x['source']==s['source'] and x['currentTarget']==s['currentTarget']
  assert x['currentTargetHash']==s['currentTargetHash']
  assert x['callerContextRef']==s['callerContextRef'] and x['callerContextSha256']==s['callerContextSha256']
  assert x['candidateTargetHash']==sha(x['candidateTarget'].encode())
  mapped=candidates.get('targets',{}).get(str(key[0]),{}).get(key[1],s['currentTarget'])
  assert mapped==x['candidateTarget'], (key,'candidate map mismatch')
  assert placeholders(x['source'])==placeholders(s['currentTarget'])==placeholders(x['candidateTarget'])
  assert markup(x['source'])==markup(s['currentTarget'])==markup(x['candidateTarget'])
  assert not x.get('candidateProtectedLiteralMissing',[])

# Independent cross-review overrides based on source/caller semantics.
OVERRIDES={
 '1814|pt_BR':{'disposition':'propose-refinement','target':'Em breve na TV ao vivo — assista ou grave.','rationale':'The current “Logo na TV ao vivo” is understandable but awkward. This concise phrase preserves the near-future timing and the watch-or-record choice in the live-TV card.'},
 '1816|pt_BR':{'disposition':'propose-correction','target':'Gravar todas as exibições','rationale':'The current target leaves “airing” in English. The RecordingList option is a repeat-record action, so “exibições” expresses each broadcast.'},
 '1817|fr':{'disposition':'propose-correction','target':'Enregistre ce titre à chaque diffusion tant que la demande est active.','rationale':'The source describes a title being broadcast; current French makes the title itself the broadcaster. The candidate uses a natural passive broadcast construction.'},
 '1822|hi':{'disposition':'accept-current','target':None,'rationale':'The current Hindi means “view my recordings” and fits the button. The primary marked a correction but supplied the unchanged current target.'},
 '1824|fr':{'disposition':'propose-correction','target':'Enregistrements actifs uniquement','rationale':'This is the Active Only filter for recordings. Current French is singular and the primary candidate has feminine agreement for masculine plural “enregistrements”.'},
 '1837|hi':{'disposition':'propose-correction','target':'एक प्रसारण','rationale':'The primary candidate is Arabic script in the Hindi cell. “एक प्रसारण” is a Hindi rendering of the unclaimed “One Airing” label; runtime use remains unverified.'},
 '1837|vi':{'disposition':'accept-current','target':None,'rationale':'“Một lần phát sóng” is a sound Vietnamese rendering. The primary marked a correction but supplied the unchanged current target; this key remains unclaimed by the targeted caller scan.'},
 '1838|ar':{'disposition':'propose-correction','target':'التسجيلات','rationale':'RecordingList renders this label beside recording.completedCount, so it names the recordings counted, not a date. The current participle is awkward as a count label.'},
 '1838|de':{'disposition':'propose-correction','target':'Aufnahmen','rationale':'RecordingList renders this label beside recording.completedCount, so it names the completed recordings, not a recording date.'},
 '1838|es':{'disposition':'propose-correction','target':'Grabaciones','rationale':'RecordingList renders this label beside recording.completedCount, so it names the recordings counted, not their date.'},
 '1838|fr':{'disposition':'propose-correction','target':'Enregistrements','rationale':'RecordingList renders this label beside recording.completedCount, so it names the completed recordings, not a recording date.'},
 '1838|hi':{'disposition':'propose-correction','target':'रिकॉर्डिंग','rationale':'RecordingList renders this label beside recording.completedCount, so it names the recordings counted. The current “अभिलेख” means records/documents.'},
 '1838|id':{'disposition':'propose-correction','target':'Rekaman','rationale':'RecordingList renders this label beside recording.completedCount, so it names recordings, not a date. The current passive verb does not work as the count label.'},
 '1838|ja':{'disposition':'propose-correction','target':'録画数','rationale':'RecordingList renders this label beside recording.completedCount, so it denotes the number of completed video recordings, not the recording time.'},
 '1838|ko':{'disposition':'propose-correction','target':'녹화 건수','rationale':'RecordingList renders this label beside recording.completedCount, so it denotes a count of completed recordings, not recording time.'},
 '1838|pt_BR':{'disposition':'propose-correction','target':'Gravações','rationale':'RecordingList renders this label beside recording.completedCount, so it names the recordings counted, not a recording date.'},
 '1838|vi':{'disposition':'propose-correction','target':'Số bản ghi hình','rationale':'RecordingList renders this label beside recording.completedCount, so it denotes the number of completed video recordings, not the recording date.'},
 '1838|zh_Hans':{'disposition':'propose-correction','target':'已录制','rationale':'RecordingList renders this label beside recording.completedCount, so it describes completed recordings, not a timestamp.'},
 '1838|zh_Hant':{'disposition':'accept-current','target':None,'rationale':'The current “已錄製” describes the completed recordings counted by recording.completedCount. The primary candidate incorrectly changes it to “recording time”.'},
 '1894|vi':{'disposition':'propose-refinement','target':'Loại máy chủ','rationale':'The source is a server-type field in the login setup screen. “Loại máy chủ” is the usual Vietnamese interface term; current wording literally describes a serving machine.'},
 '1896|ja':{'disposition':'propose-correction','target':'ログインには成功しましたが、SeerrNG はブラウザーセッションを確立できませんでした。HTTPS を使用するか、認証済み HTTP セッションを有効にしてから、もう一度お試しください。','rationale':'The primary candidate omits the final instruction to try again. This target preserves the browser-session failure and both recovery choices, then includes the retry instruction.'},
 '1898|es':{'disposition':'propose-correction','target':'La configuración de Jellyfin se guardó, pero SeerrNG no pudo establecer una sesión del navegador. Reinicie SeerrNG después de cambiar la configuración del transporte y luego use HTTPS o habilite las sesiones HTTP autenticadas.','rationale':'The accepted current Spanish uses “se salvó”, which suggests rescue rather than saving configuration. This target uses the standard software term “se guardó”.'}
}

cross_rows=[]; source_caller_rows=[]; counts=collections.Counter(); per_locale=collections.defaultdict(collections.Counter); changed_primary=0; current_target_wins=0; cross_candidates=0; candidate_hash_errors=[]
for row in caller_rows:
  refs=row['pinnedLineRefs']
  source_caller_rows.append({'sourcePosition':source_ids.index(row['sourceId']),'sourceId':row['sourceId'],'source':source_catalog[row['sourceId']],'sourceSha256':sha(source_catalog[row['sourceId']].encode()),'callerClaim':'unclaimed' if row['callerUseStatus']=='definition-only-or-single-reference' else 'targeted-source-use-found','callerUseStatus':row['callerUseStatus'],'callerContextRef':row['sourceId'],'callerContextSha256':sha(jbytes(row)),'callerFiles':row['callerFiles'],'callerLineRefs':refs,'callerLineRefCount':len(refs),'callerClaimNote':'Targeted source-file references are not a complete dynamic call graph; unclaimed definitions are not asserted to render.' if row['callerUseStatus']=='unclaimed' else 'Pinned component/helper source references reattested against the live PR tree.'})
for key in sorted(primary_by_key):
  pos,loc=key; p=primary_by_key[key]; s=source_by_key[key]; sid=p['sourceId']
  ov=OVERRIDES.get(f'{pos}|{loc}')
  if ov:
    target=s['currentTarget'] if ov['target'] is None else ov['target']
    disposition=ov['disposition']; rationale=ov['rationale']; outcome='cross-review-override'
    if target==s['currentTarget'] and p['candidateTarget']!=s['currentTarget']: current_target_wins+=1
    if target!=p['candidateTarget']: changed_primary+=1
    if target!=s['currentTarget']: cross_candidates+=1
  else:
    target=p['candidateTarget']
    disposition=p['disposition']
    outcome='agree-primary'
    if disposition=='accept-current':
      target=s['currentTarget']; rationale='Independent review accepts the current wording against the pinned English source and caller context.'
    else:
      rationale='Independent review agrees with the proposed wording after checking the source meaning, caller context, placeholders, markup, and protected literals.'
  caller=caller_by_id[sid]
  target_hash=sha(target.encode())
  source_ph=placeholders(p['source']); current_ph=placeholders(s['currentTarget']); final_ph=placeholders(target)
  source_markup=markup(p['source']); current_markup=markup(s['currentTarget']); final_markup=markup(target)
  protected=p.get('protectedLiteralsExpected',[])
  protected_missing=[x for x in protected if x not in target]
  if source_ph!=current_ph or source_ph!=final_ph: raise SystemExit(f'placeholder mismatch at {pos}|{loc}')
  if source_markup!=current_markup or source_markup!=final_markup: raise SystemExit(f'markup mismatch at {pos}|{loc}')
  if protected_missing: raise SystemExit(f'protected literal mismatch at {pos}|{loc}: {protected_missing}')
  caller_status=caller['callerUseStatus']; caller_claim='unclaimed' if caller_status=='definition-only-or-single-reference' else 'targeted-source-use-found'
  row_out={'repository':REPO,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'sourcePosition':pos,'sourceId':sid,'source':p['source'],'sourceTextSha256':sha(p['source'].encode()),'sourceCatalogBlob':p['sourceCatalogBlob'],'sourceFile':p['sourceFile'],'sourceFileSha256':p['sourceFileSha256'],'locale':loc,'localeFile':p['localeFile'],'localeBlob':p['localeBlob'],'localeFileSha256':p['localeFileSha256'],'currentTarget':s['currentTarget'],'currentTargetHash':sha(s['currentTarget'].encode()),'primaryDisposition':p['disposition'],'primaryCandidateTarget':p['candidateTarget'],'primaryCandidateHash':p['candidateTargetHash'],'primaryFinalTarget':p['finalTarget'],'primaryFinalHash':p['finalTargetHash'],'primaryRationale':p['rationale'],'crossReviewOutcome':outcome,'crossDisposition':disposition,'finalTarget':target,'finalTargetHash':target_hash,'independentRationale':rationale,'confidence':'moderate','callerClaim':caller_claim,'callerUseStatus':caller_status,'callerContextRef':caller['sourceId'],'callerContextSha256':sha(jbytes(caller)),'callerFiles':caller['callerFiles'],'callerLineRefs':caller['pinnedLineRefs'],'sourcePlaceholders':sorted(source_ph.elements()),'currentPlaceholders':sorted(current_ph.elements()),'finalPlaceholders':sorted(final_ph.elements()),'placeholderParity':'exact','sourceMarkup':source_markup,'currentMarkup':current_markup,'finalMarkup':final_markup,'markupParity':'exact','protectedLiteralsExpected':protected,'protectedLiteralMissing':protected_missing,'nativeSpeakerApproval':False}
  cross_rows.append(row_out); counts[disposition]+=1; per_locale[loc][disposition]+=1
  if p['candidateTargetHash']!=sha(p['candidateTarget'].encode()): candidate_hash_errors.append({'sourcePosition':pos,'locale':loc})
assert not candidate_hash_errors
assert len(cross_rows)==1200 and len(source_caller_rows)==100

# Reattest frozen source/cells/caller pins and live PR after semantic review.
head_after=git('rev-parse','HEAD').decode().strip(); tree_after=git('rev-parse','HEAD^{tree}').decode().strip(); pr_after=live_pr()
assert head_after==HEAD and tree_after==TREE and pr_after['headRefOid']==HEAD and pr_after['state']=='OPEN' and pr_after['isDraft'] is True
assert git('status','--porcelain').decode()==''
recheck={'repository':REPO,'pullRequest':PR,'livePullRequestBefore':pr_before,'livePullRequestAfter':pr_after,'expectedHead':HEAD,'expectedTree':TREE,'headAfterReview':head_after,'treeAfterReview':tree_after,'worktreeClean':True,'worktreeStatus':'','sourceCatalog':source_file,'localeCatalogs':catalog_files,'sourceIdsAttested':100,'cellsAttested':1200,'callerSourceIdsAttested':100,'callerFilesAttested':len(caller_file_attest),'callerFilePins':caller_file_attest,'callerLineRefsAttested':sum(len(x['pinnedLineRefs']) for x in caller_rows),'callerLineErrors':caller_line_errors,'cellMismatches':[],'candidateMapRowsAttested':sum(x['candidateTarget']!=x['currentTarget'] for x in primary_rows),'candidateHashErrors':candidate_hash_errors,'unclaimedCallerKeys':sorted(x['sourceId'] for x in caller_rows if x['callerUseStatus']=='definition-only-or-single-reference'),'placeholders':'pass','markup':'pass','protectedLiteralFinalTargets':'pass','priorFrozenDispositionRows':0,'checks':'pass','checkedAtUtc':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip()}

save_jsonl('crossreview-cells.jsonl',cross_rows)
save_jsonl('crossreview-caller-pins.jsonl',source_caller_rows)
save('crossreview-findings.json',{'schemaVersion':1,'overrides':OVERRIDES,'overrideCount':len(OVERRIDES),'reviewNote':'Findings arise from independent source/caller review; source 1838 is specifically interpreted with the adjacent recording.completedCount value.'})
save('crossreview-reattestation.json',recheck)
per={loc:{k:per_locale[loc].get(k,0) for k in ('accept-current','propose-correction','propose-refinement','hold')} for loc in LOCALES}
summary={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'state':'OPEN','isDraft':True,'head':HEAD,'tree':TREE,'sourcePositionRange':[1800,1899],'sourceIds':100,'locales':LOCALES,'cells':len(cross_rows),'primaryDispositions':dict(collections.Counter(x['primaryDisposition'] for x in cross_rows)),'crossReviewDispositions':dict(counts),'perLocale':per,'primaryCandidatesIndependentlyAccepted':sum(x['crossReviewOutcome']=='agree-primary' and x['primaryDisposition']!='accept-current' for x in cross_rows),'crossReviewOverrides':len(OVERRIDES),'primaryCandidatesRevisedOrRejected':sum(x['primaryCandidateTarget']!=x['finalTarget'] for x in cross_rows),'primaryNoopDispositionErrors':sum(x['disposition']!='accept-current' and x['candidateTarget']==x['currentTarget'] for x in primary_rows),'crossReviewCandidates':cross_candidates,'cellsWhereCurrentBeatsPrimaryCandidate':current_target_wins,'callerRefs':sum(len(x['pinnedLineRefs']) for x in caller_rows),'callerFiles':len(caller_file_attest),'callerUseStatusDistribution':dict(collections.Counter(x['callerUseStatus'] for x in caller_rows)),'unclaimedCallerKeys':recheck['unclaimedCallerKeys'],'placeholders':'0 mismatches','markup':'0 mismatches','protectedLiteralFinalTargets':'0 mismatches','primaryCurrentProtectedLiteralMismatchCells':json.loads((P/'summary.json').read_text())['currentProtectedLiteralMismatchCells'],'holdCount':counts.get('hold',0),'confidence':'moderate','nativeSpeakerApproval':'outstanding','priorFrozenDispositionRows':0,'primaryPacketChecksumVerification':'pass','repositoryOrPrModified':False,'testsBuildsScansCIorBrowserRun':False,'workflowFilesTouched':False,'outputPath':str(O)}
save('summary.json',summary)
(O/'README.md').write_text(f'''# SeerrNG PR #418 W1800–1899 independent cross-review\n\n- PR #418 remained OPEN/DRAFT at `{HEAD}` / tree `{TREE}` before and after review.\n- Independently re-read the 100 source entries, all 1,200 current and candidate cells, 100 caller-context rows, {recheck['callerLineRefsAttested']} caller line pins, {len(caller_file_attest)} caller files, and the source/12 locale catalog blobs at that exact tree.\n- Input packet SHA256SUMS and INPUT-SHA256SUMS passed before review. The primary packet had no frozen exact prior dispositions for this window; rows labeled `semantic-review-required` were not treated as final translations.\n- Cross-review dispositions: {dict(counts)}. Primary wording was revised or rejected in {summary['primaryCandidatesRevisedOrRejected']} cells. The independent findings include a correction for the PT-BR repeat-airing option, two primary correction dispositions with unchanged targets, and the `Recorded` label: the caller displays it beside `recording.completedCount`, so date/time translations are incorrect.\n- Six keys have only definition/single-reference evidence in the targeted files: `{', '.join(recheck['unclaimedCallerKeys'])}`. Their lexical review is recorded without claiming runtime rendering.\n- Final targets retain placeholder, markup, and protected-literal parity. Confidence is moderate; native-speaker approval remains outstanding. No repository/PR edits, tests, builds, scans, CI, browser actions, or workflow edits were performed.\n''')
# Record exact packet and source-manifest hashes before sealing the output manifest.
artifact_files=sorted(x for x in O.iterdir() if x.is_file() and x.name not in {'SHA256SUMS','manifest.json'})
manifest={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'head':HEAD,'tree':TREE,'state':'OPEN','isDraft':True,'scope':{'positions':[1800,1899],'sourceIds':100,'locales':LOCALES,'cells':1200},'primaryPacket':{'path':str(P),'sha256sumsSha256':sha((P/'SHA256SUMS').read_bytes()),'inputSha256sumsSha256':sha((P/'INPUT-SHA256SUMS').read_bytes()),'inputManifestSha256':sha((P/'input-manifest.json').read_bytes()),'ledgerSha256':sha((P/'primary-review-ledger.jsonl').read_bytes()),'sourceCellsSha256':sha((P/'source-current-cells.jsonl').read_bytes()),'callerContextsSha256':sha((P/'caller-contexts.jsonl').read_bytes())},'independentReattestation':{'path':'crossreview-reattestation.json','sha256':sha((O/'crossreview-reattestation.json').read_bytes()),'checks':'pass'},'reviewCells':{'path':'crossreview-cells.jsonl','rows':len(cross_rows),'sha256':sha((O/'crossreview-cells.jsonl').read_bytes()),'dispositions':dict(counts)},'callerPins':{'path':'crossreview-caller-pins.jsonl','rows':len(source_caller_rows),'sha256':sha((O/'crossreview-caller-pins.jsonl').read_bytes()),'sourceIds':100,'callerRefs':recheck['callerLineRefsAttested'],'callerFiles':len(caller_file_attest)},'findings':{'path':'crossreview-findings.json','sha256':sha((O/'crossreview-findings.json').read_bytes()),'overrides':len(OVERRIDES)},'summarySha256':sha((O/'summary.json').read_bytes()),'readmeSha256':sha((O/'README.md').read_bytes()),'builderSha256':sha((O/'build_crossreview_packet.py').read_bytes()),'artifactFiles':{x.name:{'sha256':sha(x.read_bytes()),'bytes':x.stat().st_size} for x in artifact_files},'nativeSpeakerApproval':'outstanding','repositoryOrPrModified':False,'testsBuildsScansCIorBrowserRun':False,'workflowFilesTouched':False}
save('manifest.json',manifest)
# All packet files receive one final SHA256 manifest.
files=sorted(x for x in O.iterdir() if x.is_file() and x.name!='SHA256SUMS')
(O/'SHA256SUMS').write_text(''.join(f'{sha(x.read_bytes())}  {x.name}\n' for x in files))
print(json.dumps({'head':HEAD,'tree':TREE,'cells':len(cross_rows),'dispositions':dict(counts),'overrides':len(OVERRIDES),'revisedPrimaryTargets':summary['primaryCandidatesRevisedOrRejected'],'callerRefs':recheck['callerLineRefsAttested'],'callerFiles':len(caller_file_attest),'output':str(O)},ensure_ascii=False,indent=2))
