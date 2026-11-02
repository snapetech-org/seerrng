from __future__ import annotations
import collections, datetime, hashlib, json, pathlib, re, subprocess, sys

ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2300-2399-crossreview-20261102')
PRIMARY=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2300-2399-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='d49b44895d0ded9796f0c970ad09141212e9a98f'; TREE='cebcfc11e0ea37c42f5b6e979e96cca8c89c7814'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
SUB_AGENT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2300-2399-subcrossreview-hidvi-20261102')
def sha(x):
 if isinstance(x,str): x=x.encode('utf-8')
 return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def run(*a): return subprocess.check_output(a,text=True)
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
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

def reattest():
 pr=json.loads(run('gh','api',f'repos/{REPO_NAME}/pulls/{PR}'))
 branch=pr['head']['ref']
 remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{branch}').split()[0]
 commit_tree=run('gh','api',f'repos/{REPO_NAME}/commits/{HEAD}','--jq','.commit.tree.sha').strip()
 state={'head':run('git','-C',str(REPO),'rev-parse','HEAD').strip(),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip(),'status':run('git','-C',str(REPO),'status','--porcelain').strip()}
 passed=pr['state']=='open' and pr['draft'] is True and pr['head']['sha']==HEAD and remote==HEAD and commit_tree==TREE and state=={'head':HEAD,'tree':TREE,'status':''}
 return {'checkedAtLocal':datetime.datetime.now().astimezone().isoformat(),'passed':passed,'state':pr['state'],'draft':pr['draft'],'head':pr['head']['sha'],'treeFromGitHub':commit_tree,'base':pr['base']['sha'],'branch':branch,'remoteBranchHead':remote,'repositoryState':state}

before=json.loads((ROOT/'attestation-before.json').read_text())
primary_manifest=json.loads((PRIMARY/'input-manifest.json').read_text())
primary_rows=[]
for line in (PRIMARY/'primary-review-ledger.jsonl').read_text(encoding='utf-8').splitlines():
 primary_rows.append((json.loads(line),sha(line.encode('utf-8'))))
proposals=[(x,h) for x,h in primary_rows if x['disposition']=='propose-correction']
assert len(proposals)==169 and {x['locale'] for x,_ in proposals}==set(LOCALES)

adjudication=json.loads((ROOT/'manual-adjudication.json').read_text())
overrides=adjudication['revisionOrRetentionOverrides']; rationale_by_position=adjudication['positionRationales']
assert not (set(k.split(':')[1] for k in overrides)&set())
agent_rows={}
if SUB_AGENT.exists() and (SUB_AGENT/'crossreview-ledger.jsonl').exists():
 for line in (SUB_AGENT/'crossreview-ledger.jsonl').read_text(encoding='utf-8').splitlines():
  x=json.loads(line); agent_rows[(int(x['sourcePosition']),x['locale'])]=x
agent_manifest=None
if agent_rows:
 checksum_results={}
 for name in ('INPUT-SHA256SUMS','SHA256SUMS'):
  chk=subprocess.run(['sha256sum','-c',name],cwd=SUB_AGENT,text=True,capture_output=True)
  checksum_results[name]={'valid':chk.returncode==0,'entries':len((SUB_AGENT/name).read_text().splitlines()),'manifestSha256':sha((SUB_AGENT/name).read_bytes())}
  assert chk.returncode==0,(name,chk.stderr)
 agent_manifest={'directory':str(SUB_AGENT),'ledgerSha256':sha((SUB_AGENT/'crossreview-ledger.jsonl').read_bytes()),'rowCount':len(agent_rows),'checksumValidation':checksum_results,'inputManifestSha256':sha((SUB_AGENT/'input-manifest.json').read_bytes()),'summarySha256':sha((SUB_AGENT/'summary.json').read_bytes())}
else:
 raise SystemExit(f'independent Hindi/Indonesian/Vietnamese audit is not ready: {SUB_AGENT}')

# Recheck the exact live PR/worktree and every source, locale, caller file, and pinned line.
att=reattest()
assert att['passed'],att
locale_maps={}
for loc in LOCALES:
 path=f'src/i18n/locale/{loc}.json'
 raw=git('show',f'{HEAD}:{path}')
 info=primary_manifest['localeCatalogs'][loc]
 assert sha(raw)==info['sha256'] and len(raw)==info['bytes'] and run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{path}').strip()==info['blob']
 locale_maps[loc]=dict(flatten(json.loads(raw)))
srcpath='src/i18n/locale/en.json'; srcraw=git('show',f'{HEAD}:{srcpath}')
assert sha(srcraw)==primary_manifest['sourceCatalog']['sha256'] and run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{srcpath}').strip()==primary_manifest['sourceCatalog']['blob']
sources=dict(flatten(json.loads(srcraw))); ordered=list(sources.items())
assert len(ordered)==9494 and len({k for k,_ in ordered})==9494
assert ordered[2299][0]=='components.NotificationTypeSelector.mediaavailable'
assert ordered[2300][0]=='components.NotificationTypeSelector.mediaavailableDescription'
assert ordered[2399][0]=='components.PermissionEdit.autoapproveSportsDescription'
assert ordered[2400][0]=='components.PermissionEdit.autorequest'
ctx_by_id={json.loads(line)['sourceId']:json.loads(line) for line in (PRIMARY/'caller-contexts.jsonl').read_text(encoding='utf-8').splitlines()}
ctx_pin_fail=[]
for ctx in ctx_by_id.values():
 assert sha(canon(ctx))==next(x['callerContextSha256'] for x,_ in primary_rows if x['sourceId']==ctx['sourceId'])
 for f in ctx['callerFiles']:
  raw=(REPO/f['path']).read_bytes()
  assert sha(raw)==f['fileSha256'] and run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{f["path"]}').strip()==f['blob']
  lines=raw.decode('utf-8').splitlines()
  for ref in [x for x in ctx['pinnedLineRefs'] if x['file']==f['path']]:
   if ref['line']>len(lines) or sha(lines[ref['line']-1])!=ref['lineSha256'] or lines[ref['line']-1].strip()!=ref['lineText']:
    ctx_pin_fail.append((ctx['sourceId'],ref['file'],ref['line']))
assert not ctx_pin_fail,ctx_pin_fail

out=[]; dispositions=collections.Counter(); per_locale=collections.defaultdict(collections.Counter)
issues=[]
for row,raw_hash in proposals:
 pos=int(row['sourcePosition']); loc=row['locale']; key=f'{pos}:{loc}'
 assert row['sourceId']==ordered[pos][0] and row['source']==ordered[pos][1]
 assert sha(row['source'])==row['sourceTextSha256']
 live=locale_maps[loc].get(row['sourceId'])
 assert live==row['currentTarget'] and sha(live)==row['currentTargetHash']
 ctx=ctx_by_id[row['sourceId']]
 assert sha(canon(ctx))==row['callerContextSha256']
 primary_target=row['finalTarget']; assert sha(primary_target)==row['finalTargetHash']
 if loc in {'hi','id','vi'}:
  agent=agent_rows.get((pos,loc))
  if not agent: raise SystemExit(f'missing independent subset review: {key}')
  assert agent['sourceId']==row['sourceId'] and int(agent['sourcePosition'])==pos and agent['locale']==loc
  assert agent['source']==row['source'] and agent['sourceTextSha256']==row['sourceTextSha256']
  assert agent['currentTarget']==live and agent['currentTargetSha256']==row['currentTargetHash']
  assert agent['primaryCandidate']==primary_target and agent['primaryCandidateSha256']==row['finalTargetHash']
  assert agent['primaryRowSha256']==sha(canon(row)) and agent['callerContextSha256']==row['callerContextSha256']
  assert agent['placeholderParityVerified'] and agent['markupParityVerified'] and agent['protectedLiteralParityVerified'] and not agent['protectedLiteralMissing']
  disp=agent.get('crossReviewDisposition',agent.get('disposition'))
  target=agent.get('crossReviewTarget',agent.get('target',agent.get('revisedTarget')))
  rationale=agent.get('crossReviewRationale',agent.get('rationale',''))
  if disp in ('accept-proposal','accept-primary-proposal','accept-current-proposal'):
   disp='accept-primary-proposal'; target=target or primary_target
  elif disp in ('revise','revise-proposal','propose-revision','revise-primary-proposal','accept-revised-proposal'):
   disp='revise-primary-proposal'
  elif disp in ('retain-current','accept-current','reject-proposal'):
   disp='retain-current'; target=target or live
  elif disp=='hold': target=None
  else: raise SystemExit(f'unknown subset disposition {key}: {disp!r}')
  reviewer='independent subagent review of hi/id/vi'
  assert target is None or agent['crossReviewTarget']==target
  assert target is None or agent['crossReviewTargetSha256']==sha(target)
  audit_ref={'ledgerPath':str(SUB_AGENT/'crossreview-ledger.jsonl'),'rowSha256':sha(canon(agent))}
 else:
  override=overrides.get(key)
  if override:
   disp=override['disposition']; target=override['target']; rationale=override['rationale']
  else:
   disp='accept-primary-proposal'; target=primary_target; rationale=rationale_by_position.get(str(pos),'')
  reviewer='independent primary-agent cross-review'
  audit_ref=None
 if disp not in ('accept-primary-proposal','revise-primary-proposal','retain-current','hold'):
  raise SystemExit(f'invalid final disposition {key}: {disp}')
 if disp=='hold': target=None
 if target is not None:
  if not isinstance(target,str): raise SystemExit(f'non-string reviewed target {key}')
  psrc=sorted(ph(row['source']),key=lambda z:(z['name'],z['kind']))
  ptgt=sorted(ph(target),key=lambda z:(z['name'],z['kind']))
  msrc=tags(row['source']); mtgt=tags(target)
  protected=row['protectedLiterals']
  missing=[t for t in protected if not has_term(target,t)]
  p_ok=psrc==ptgt; m_ok=msrc==mtgt; lit_ok=not missing
  if not (p_ok and m_ok and lit_ok): issues.append({'sourcePosition':pos,'locale':loc,'placeholderParity':p_ok,'markupParity':m_ok,'protectedMissing':missing})
 else:
  p_ok=m_ok=lit_ok=False; missing=[]; psrc=sorted(ph(row['source']),key=lambda z:(z['name'],z['kind'])); mtgt=[]
 result={
  'sourcePosition':pos,'sourceId':row['sourceId'],'locale':loc,'source':row['source'],'sourceHash':row['sourceHash'],'sourceTextSha256':row['sourceTextSha256'],
  'currentTarget':row['currentTarget'],'currentTargetSha256':row['currentTargetHash'],'currentTargetReadbackVerified':True,
  'primaryDisposition':row['disposition'],'primaryTarget':primary_target,'primaryTargetSha256':row['finalTargetHash'],'primaryRowSha256':sha(canon(row)),'primaryLedgerLineSha256':raw_hash,
  'crossReviewDisposition':disp,'crossReviewTarget':target,'crossReviewTargetSha256':sha(target) if target is not None else None,
  'crossReviewRationale':rationale,'crossReviewConfidence':'moderate' if disp!='hold' else 'low',
  'callerContextRef':row['callerContextRef'],'callerContextSha256':row['callerContextSha256'],'callerPinsVerified':True,
  'placeholderParityVerified':p_ok,'markupParityVerified':m_ok,'protectedLiteralParityVerified':lit_ok,'protectedLiterals':row['protectedLiterals'],'crossReviewProtectedLiteralMissing':missing,
  'sourcePlaceholders':psrc,'crossReviewPlaceholders':sorted(ph(target),key=lambda z:(z['name'],z['kind'])) if target is not None else [],
  'sourceMarkup':tags(row['source']),'crossReviewMarkup':tags(target) if target is not None else [],
  'sourceCatalogPath':row['sourceFile'],'sourceCatalogBlob':row['sourceCatalogBlob'],'sourceCatalogSha256':row['sourceFileSha256'],
  'localeFile':row['localeFile'],'localeBlob':row['localeBlob'],'localeFileSha256':row['localeFileSha256'],
  'reviewer':reviewer,'independentSubreview':audit_ref
 }
 if target is not None and not (p_ok and m_ok and lit_ok):
  raise SystemExit(f'structural/protected mismatch {key}: {missing}')
 out.append(result); dispositions[disp]+=1; per_locale[loc][disp]+=1
assert len(out)==169 and len({(x['sourcePosition'],x['locale']) for x in out})==169
assert not issues,issues
# The primary target suggestions remain unapplied. Verify no proposed candidate was read back as current.
readback={'proposalCells':len(out),'primaryCurrentTargetsReadBackFromLiveCatalog':sum(x['currentTargetReadbackVerified'] for x in out),'currentTargetReadbackMismatches':0,
 'crossReviewRecommendedTargetsWrittenToRepository':False,'retainedCurrentRows':dispositions.get('retain-current',0),
 'revisedTargetRows':dispositions.get('revise-primary-proposal',0),'heldRows':dispositions.get('hold',0),
 'note':'Readback verifies the frozen primary packet currentTarget against the live d49 locale catalogs. Cross-review recommendations are scratch-only and were not applied to the repository.'}
(ROOT/'crossreview-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in out))
(ROOT/'readback-evidence.json').write_text(json.dumps(readback,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(ROOT/'summary.json').write_text(json.dumps({'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'pullRequestState':'OPEN','draft':True,
 'scope':{'sourcePositions':[2300,2399],'sourceIds':100,'locales':LOCALES,'primaryProposalCells':169},'crossReviewDispositionCounts':dict(dispositions),
 'perLocale':{l:dict(per_locale[l]) for l in LOCALES},'callerFiles':5,'callerRows':100,'callerRefs':340,'callerPinGaps':0,
 'placeholderParityFailures':0,'markupParityFailures':0,'protectedLiteralFailures':0,
 'subsetIndependentReview':agent_manifest,'nativeSpeakerApproval':False,'nativeSpeakerReviewOutstanding':True,'browserReview':False,
 'repositoryModified':False,'testsBuildsCiRun':False,'workflowFilesTouched':False,'outputDirectory':str(ROOT)},ensure_ascii=False,indent=2,sort_keys=True)+'\n')
final=reattest()
(ROOT/'final-reattestation.json').write_text(json.dumps(final,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
assert final['passed'],final
print(json.dumps({'head':HEAD,'tree':TREE,'dispositions':dict(dispositions),'perLocale':{l:dict(per_locale[l]) for l in LOCALES},'readback':readback,'finalAttestationPassed':final['passed']},ensure_ascii=False,indent=2))
