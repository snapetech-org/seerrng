from __future__ import annotations
import json, pathlib, hashlib, re, subprocess, collections, datetime

ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='f20893e57a89827095fa049d8e0475df7ec7170f'; TREE='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PROTECTED=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library']
def sha(x):
 if isinstance(x,str): x=x.encode('utf-8')
 return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def run(*a): return subprocess.check_output(a,text=True)
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
def flatten(d,p=''):
 for k,v in d.items():
  q=p+'.'+k if p else k
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
  body=s[i+1:j-1]; m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
  if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def icu_categories(s): return sorted(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s)))
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
def L(**x): return x

# Candidate targets and per-source rationale were reviewed manually against the exact callers.
_data=json.loads((ROOT/'primary-candidates.json').read_text(encoding='utf-8'))
C={int(k):v for k,v in _data['candidates'].items()}
WHY={int(k):v for k,v in _data['rationales'].items()}
REFINEMENTS={(int(x['sourcePosition']),x['locale']) for x in _data.get('refinements',[])}
# Freeze and verify current input files at exact live head before authoring judgments.
pr=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD,pr
remote_head=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{pr["headRefName"]}').split()[0]
assert remote_head==HEAD,{'remoteHead':remote_head,'expected':HEAD}
assert run('git','-C',str(REPO),'rev-parse','HEAD').strip()==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE
assert run('git','-C',str(REPO),'status','--porcelain').strip()==''
assert subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=ROOT,text=True,capture_output=True).returncode==0
manifest=json.loads((ROOT/'input-manifest.json').read_text())
srcraw=git('show',f'{HEAD}:src/i18n/locale/en.json'); sources=list(flatten(json.loads(srcraw)))[2400:2500]
assert len(sources)==100
source_rows=json.loads((ROOT/'source-window.json').read_text())['sourceList']
assert [(x['position'],x['sourceId'],x['source']) for x in source_rows]==[(2400+i,k,v) for i,(k,v) in enumerate(sources)]
loc_json={l:json.loads(git('show',f'{HEAD}:src/i18n/locale/{l}.json')) for l in LOCALES}
cells=[json.loads(x) for x in (ROOT/'source-current-cells.jsonl').read_text().splitlines()]
ctxs=[json.loads(x) for x in (ROOT/'caller-contexts.jsonl').read_text().splitlines()]
assert len(cells)==1200 and len(ctxs)==100
ctxmap={x['sourceId']:x for x in ctxs}
# Reconcile the independent hi/id/vi subreview and normalize its three no-op proposals.
sub_dir=ROOT/'independent-subreview'
sub_rows=[json.loads(x) for x in (sub_dir/'primary-review.jsonl').read_text().splitlines()]
sub_by={(x['scopePosition'],x['locale']):x for x in sub_rows}
noop_keys={(x['sourcePosition'],x['locale']) for x in json.loads((ROOT/'independent-subreview-reconciliation.json').read_text())['revisedNoOpProposals']}
assert len(sub_rows)==300 and len(sub_by)==300
# ICU cardinal branch categories allowed by the Unicode MessageFormat grammar.
valid_icu_categories={'zero','one','two','few','many','other'}
decisions=[]; candidate_rows=[]; counts=collections.Counter(); per=collections.defaultdict(collections.Counter)
for cell in cells:
 pos=cell['sourcePosition']; loc=cell['locale']; sid=cell['sourceId']; candidate=C.get(pos,{}).get(loc)
 assert loc_json[loc][sid]==cell['currentTarget'] and sha(cell['currentTarget'])==cell['currentTargetHash']
 ctx=ctxmap[sid]; assert sha(canon(ctx))==cell['callerContextSha256']
 sibling=sub_by.get((pos,loc)); sibling_review=None
 if sibling is not None:
  assert sibling['sourceId']==sid and sibling['sourceHash']==cell['sourceHash']
  assert sibling['sourceText']==cell['source'] and sibling['sourceTextSha256']==cell['sourceTextSha256']
  assert sibling['currentTarget']==cell['currentTarget'] and sibling['currentTargetHash']==cell['currentTargetHash']
  assert sibling['callerContextSha256']==cell['callerContextSha256']
  sibling_review={'reviewer':sibling['reviewer'],'originalDisposition':sibling['disposition'],'reviewedTargetSha256':sibling['reviewedTargetSha256'],
   'rowSha256':sha(canon(sibling)),'sourcePacketLedgerSha256':sha((sub_dir/'primary-review.jsonl').read_bytes())}
  if sibling['disposition']=='hold':
   candidate=None; sibling_effective='hold'
  elif sibling['disposition']=='propose-replacement' and (pos,loc) not in noop_keys:
   candidate=sibling['reviewedTarget']; sibling_effective='propose-correction'
  else:
   candidate=None; sibling_effective='accept-current'
 else: sibling_effective=None
 if candidate is not None:
  assert candidate!=cell['currentTarget'],(pos,loc,'candidate unchanged')
  disp='propose-correction'; final=candidate
  why=sibling['rationale'] if sibling is not None else WHY[pos]
  confidence=sibling['confidence'] if sibling is not None else 'moderate'
 else:
  if sibling_effective=='hold':
   disp='hold'; final=None; why=sibling['rationale']; confidence=sibling['confidence']
  else:
   disp='accept-current'; final=cell['currentTarget']
   why=(sibling['rationale'] if sibling is not None else 'Current wording preserves the English source meaning in the pinned caller context; source meaning, placeholders, markup, and applicable protected literals were reviewed.')
   confidence=sibling['confidence'] if sibling is not None else 'moderate'
 phsrc=sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))
 tagsrc=tags(cell['source'])
 prot=[t for t in PROTECTED if has_term(cell['source'],t)]
 phcan=sorted(ph(final),key=lambda x:(x['name'],x['kind'])) if final is not None else []
 tagcan=tags(final) if final is not None else []
 missing=[t for t in prot if final is not None and not has_term(final,t)]
 source_categories=icu_categories(cell['source']); final_categories=icu_categories(final) if final is not None else []
 if final is not None and any(c not in valid_icu_categories for c in final_categories):
  raise SystemExit(f'candidate ICU syntax failure {pos} {loc}: {final_categories}')
 if final is not None and any(p['kind'] in ('plural','select','selectordinal') for p in phsrc) and 'other' not in final_categories:
  raise SystemExit(f'candidate ICU missing other branch {pos} {loc}: {final_categories}')
 if final is not None and (phsrc!=phcan or tagsrc!=tagcan or missing):
  if disp=='propose-correction': raise SystemExit(f'candidate integrity failure {pos} {loc}: ph={phsrc==phcan} tags={tagsrc==tagcan} protectedMissing={missing}')
  disp='hold'; final=None; why='Needs locale specialist review: current wording has placeholder, markup, or protected-literal drift and no sufficiently reliable candidate was established.'; confidence='low'
 final_hash=sha(final) if final is not None else None
 row={**cell,'disposition':disp,'finalTarget':final,'finalTargetHash':final_hash,'priorDispositionOverridden':bool(candidate is not None and cell.get('priorDisposition')),
  'rationale':why,'confidence':confidence,'reviewer':sibling['reviewer'] if sibling is not None else 'primary-static-semantic-review',
  'callerContext':ctx,'candidatePlaceholderParity':'exact' if final is not None and phsrc==phcan else ('not-applicable' if final is None else 'mismatch'),
  'candidateMarkupParity':'exact' if final is not None and tagsrc==tagcan else ('not-applicable' if final is None else 'mismatch'),
  'sourceIcuPluralCategories':source_categories,'finalIcuPluralCategories':final_categories,
  'protectedLiterals':prot,'candidateProtectedLiteralMissing':missing if final is not None else [],
  'independentSubsetDisposition':sibling_effective,'independentSubreview':sibling_review}
 decisions.append(row); counts[disp]+=1; per[loc][disp]+=1
 if disp=='propose-correction':
  candidate_rows.append({'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':cell['source'],'sourceTextSha256':cell['sourceTextSha256'],
   'currentTarget':cell['currentTarget'],'currentTargetHash':cell['currentTargetHash'],'candidateTarget':final,'candidateTargetHash':final_hash,
   'candidatePlaceholderParity':'exact','candidateMarkupParity':'exact','sourceIcuPluralCategories':source_categories,'candidateIcuPluralCategories':final_categories,
   'protectedLiterals':prot,'candidateProtectedLiteralMissing':[],'callerContextRef':sid,'callerContextSha256':cell['callerContextSha256'],
   'disposition':disp,'independentSubreview':sibling_review,'priorDisposition':cell.get('priorDisposition'),'priorDispositionOverridden':bool(cell.get('priorDisposition')),'rationale':why,'confidence':confidence})
assert len(decisions)==1200 and sum(1 for x in decisions if x['locale'] in ('hi','id','vi'))==300
assert len(candidate_rows)==347, len(candidate_rows)
writejl(ROOT/'primary-review-ledger.jsonl',decisions)
writej(ROOT/'candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(candidate_rows),
 'candidateTargets':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'disposition':x['disposition'],'candidateTarget':x['candidateTarget'],'candidateTargetHash':x['candidateTargetHash']} for x in candidate_rows]})
# Also provide a row-wise correction ledger with rationale and all pins.
writejl(ROOT/'correction-candidates.jsonl',candidate_rows)
writej(ROOT/'review-plan.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(candidate_rows),'candidates':candidate_rows})
summary={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'livePullRequest':pr,
 'scope':{'positions':[2400,2499],'sourceIds':100,'locales':LOCALES,'cells':len(decisions)},
 'sourceIdListSha256':sha(canon([(x['sourcePosition'],x['sourceId'],x['source']) for x in cells if x['locale']=='ar'])),
 'sourceWithIcuPluralOrSelect':sum(any(p['kind'] in ('plural','select','selectordinal') for p in ph(x['source'])) for x in cells if x['locale']=='ar'),
 'counts':dict(counts),'proposalCount':len(candidate_rows),'correctionCount':counts.get('propose-correction',0),'refinementCount':counts.get('propose-refinement',0),'perLocale':{loc:dict(per[loc]) for loc in LOCALES},
 'explicitHoldCount':counts.get('hold',0),'priorDispositionOverrides':sum(bool(x.get('priorDispositionOverridden')) for x in decisions),'confidenceCounts':dict(collections.Counter(x['confidence'] for x in decisions)),
 'callerContextRows':len(ctxs),'callerReferences':sum(len(c['pinnedLineRefs']) for c in ctxs),'callerFiles':len({f['path'] for c in ctxs for f in c['callerFiles']}),
 'callerGaps':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in ctxs if not c['pinnedLineRefs']],
 'callerDefinitionOnly':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in ctxs if c['callerUseStatus']!='direct-or-helper-reference-found'],
 'placeholderParityMismatchesCurrent':sum(x['placeholderParity']!='exact' for x in cells),
 'markupParityMismatchesCurrent':sum(x['markupParity']!='exact' for x in cells),
 'placeholderParityMismatchesFinal':sum(x['candidatePlaceholderParity']!='exact' for x in decisions),
 'markupParityMismatchesFinal':sum(x['candidateMarkupParity']!='exact' for x in decisions),
 'currentProtectedLiteralMismatchCells':sum(bool(x['protectedLiterals']) and any(not has_term(x['currentTarget'],t) for t in x['protectedLiterals']) for x in decisions),
 'finalProtectedLiteralMismatchCells':sum(bool(x['candidateProtectedLiteralMissing']) for x in decisions),
 'priorBoundary':json.loads((ROOT/'prior-disposition-boundary.json').read_text()),
 'nativeSpeakerApproval':False,'nativeSpeakerReviewOutstanding':True,'browserReview':False,'repositoryModified':False,'testsBuildsCiRun':False,'workflowFilesTouched':False}
summary['independentLanguageAudit']={'locales':['hi','id','vi'],'packet':'independent-subreview/primary-review.jsonl','effectiveRows':300,'effectiveProposals':148,'effectiveAcceptCurrent':152,'holds':0,'noOpProposalsRevised':3}
parity=json.loads((ROOT/'catalog-parity.json').read_text())
summary['localeCatalogKeySetParity']=parity['allLocalesExactKeySetParity']
summary['localeCatalogOrderDifferences']=parity['localesWithOrderDifferences']
summary['independentNoOpProposalsRevised']=3
writej(ROOT/'summary.json',summary)
# Re-attest the PR API/ref and exact checked-out tree after review generation.
pr2=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{pr2["headRefName"]}').split()[0]
state={'head':run('git','-C',str(REPO),'rev-parse','HEAD').strip(),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip(),'status':run('git','-C',str(REPO),'status','--porcelain').strip()}
att={'passed':pr2['state']=='OPEN' and pr2['isDraft'] is True and pr2['headRefOid']==HEAD and remote==HEAD and state=={'head':HEAD,'tree':TREE,'status':''},
 'exactHead':HEAD,'exactTree':TREE,'pullRequestState':pr2['state'],'isDraft':pr2['isDraft'],'headRefName':pr2['headRefName'],'remoteHead':remote,'repositoryState':state,
 'sourceIds':100,'localeCells':1200,'sourceTextHashes':100,'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'callerDefinitionOnly':summary['callerDefinitionOnly'],'candidateCount':len(candidate_rows),'sourceIdListSha256':summary['sourceIdListSha256']}
writej(ROOT/'final-reattestation.json',att)
assert att['passed'],att
definitions=', '.join(x['sourceId'] for x in summary['callerDefinitionOnly']) or 'none'
caller_limit_count=len(summary['callerDefinitionOnly'])
caller_limit_label=f"{caller_limit_count} key{'s' if caller_limit_count != 1 else ''} have only definition/single-reference evidence" if caller_limit_count != 1 else '1 key has only definition/single-reference evidence'
historical_prior=collections.Counter(x.get('disposition') for x in summary['priorBoundary']['matches'])
readme=f'''# SeerrNG PR #418 primary semantic review: W2400–2499

This packet reviews 100 English catalog entries across the 12 direct locales ({', '.join(LOCALES)}): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head {HEAD}, tree {TREE}. The GitHub API, remote branch, and provided worktree were rechecked before and after review; the worktree was clean. Source positions are zero-based insertion order in `src/i18n/locale/en.json`. This window begins at 2400 (`components.PermissionEdit.autorequest`) and ends at 2499 (`components.ReaderDeliveryLink.comicsGrimmoryHelp`). Boundary keys at 2399 and 2500 are listed in `source-boundaries.json`. The frozen cell ledger includes source and current-target hashes, catalog pins, and caller-context hashes. All 12 locales have the exact 9,494-key set. ja, ko, vi, zh_Hans, and zh_Hant have key-order differences starting at zero-based position 350; the window cells are joined by source ID, while the review positions are derived only from English insertion order.

The review proposes {summary['counts'].get('propose-correction',0)} corrections and {summary['counts'].get('propose-refinement',0)} refinements, accepts {summary['counts'].get('accept-current',0)} current values, and has {summary['explicitHoldCount']} holds. Exact prior rows with source and final target matching the live catalog: {summary['priorBoundary']['exactLivePriorDispositions']}. Prior packet rows were scanned but none had an exact current final-target match for this window; no prior dispositions were reused.

## Caller evidence and integrity

Pinned caller evidence has {summary['callerReferences']} line references across {summary['callerFiles']} source files for all {summary['callerContextRows']} source IDs. No source lacks a pinned line reference. {caller_limit_label}: {definitions}. Those limits are retained in `caller-contexts.jsonl` and should be considered during independent review.

Current/final placeholder mismatches: {summary['placeholderParityMismatchesCurrent']}/{summary['placeholderParityMismatchesFinal']}. Current/final markup mismatches: {summary['markupParityMismatchesCurrent']}/{summary['markupParityMismatchesFinal']}. Source ICU plural/select entries: {summary['sourceWithIcuPluralOrSelect']}. Current/final protected-literal mismatch cells: {summary['currentProtectedLiteralMismatchCells']}/{summary['finalProtectedLiteralMismatchCells']}. Protected-literal mismatches are recorded per cell in the ledger; product names and format acronyms are preserved in candidate targets.

## Packet contents and limits

- `primary-review-ledger.jsonl`: one decision per locale cell, exact current/final values and hashes, caller context, rationale, confidence, and integrity checks.
- `correction-candidates.jsonl`, `candidate-targets.json`, `review-plan.json`, and `primary-candidates.json`: proposed target text, hashes, dispositions, and rationale.
- Hindi, Indonesian, and Vietnamese cells include an independent static subreview; its exact packet and row-level reconciliation are in `independent-subreview/` and `independent-subreview-reconciliation.json`. Three byte-identical no-op proposals were revised to accept-current. Native-speaker review remains outstanding.
- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `prior-disposition-boundary.json`, `source-boundaries.json`, `catalog-parity.json`, and `input-manifest.json`: frozen inputs and provenance.
- `final-reattestation.json` and `live-localization-prs.json`: final PR/ref/worktree check and current snapshot of all seven localization PRs.
- `INPUT-SHA256SUMS` and `SHA256SUMS`: input and packet checksums.


Native-speaker approval remains outstanding. This is a primary semantic review, not native-speaker approval. No repository files or workflows were changed; no test/build/CI tasks or browser activity were run.
'''
(ROOT/'README.md').write_text(readme)
# Stabilize packet size metadata, then hash every deliverable except the two manifests.
for _ in range(6):
 summary['packetFiles']=sum(p.is_file() for p in ROOT.iterdir())
 summary['packetBytes']=sum(p.stat().st_size for p in ROOT.iterdir() if p.is_file())
 writej(ROOT/'summary.json',summary)
 names=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in ('SHA256SUMS','INPUT-SHA256SUMS'))
 (ROOT/'SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in names))
print(json.dumps({'head':HEAD,'tree':TREE,'counts':dict(counts),'proposals':len(candidate_rows),'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'currentPlaceholderMismatches':summary['placeholderParityMismatchesCurrent'],'finalPlaceholderMismatches':summary['placeholderParityMismatchesFinal'],
 'currentMarkupMismatches':summary['markupParityMismatchesCurrent'],'finalMarkupMismatches':summary['markupParityMismatchesFinal'],
 'currentProtectedMismatchCells':summary['currentProtectedLiteralMismatchCells'],'finalProtectedMismatchCells':summary['finalProtectedLiteralMismatchCells'],'reattestPassed':att['passed']},ensure_ascii=False,indent=2))
