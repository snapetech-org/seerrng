from pathlib import Path
import json,hashlib,re,collections,subprocess,datetime
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
REPO_NAME='snapetech-org/SeerrNG'; PR=418
HEAD='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2'; TREE='a09117211080bbd89d32959f17d93b02a82b966f'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode('utf-8')).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def ph(s):
 result=[];i=0
 while i<len(s):
  if s[i]!='{':i+=1;continue
  depth=1;j=i+1
  while j<len(s) and depth:
   if s[j]=='{':depth+=1
   elif s[j]=='}':depth-=1
   j+=1
  if depth:return None
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',s[i+1:j-1])
  if m:result.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return sorted(result,key=lambda x:(x['name'],x['kind']))
def tags(s):return re.findall(r'</?[A-Za-z][^>]*>',s)
def icu(s):return sorted(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s)))
def writej(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(p,rows):p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
# Require captured post-review state to be present and still exact for Seerr.
start=json.loads((OUT/'live-localization-prs-start.json').read_text())
end=json.loads((OUT/'live-localization-prs-end.json').read_text())
assert subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=OUT,text=True,capture_output=True).returncode==0
assert start['phase']=='before' and end['phase']=='after'
assert len(start['pullRequests'])==7 and len(end['pullRequests'])==7
assert end['exactSeerrHeadAndTreeStillPinned'],end
assert all(x['state']=='OPEN' for x in start['pullRequests']+end['pullRequests'])
source_window=json.loads((OUT/'source-window.json').read_text())
assert source_window['head']==HEAD and source_window['tree']==TREE
assert source_window['sourcePositionRange']==[2500,2599] and len(source_window['sourceList'])==100
cells=[json.loads(x) for x in (OUT/'source-current-cells.jsonl').read_text().splitlines()]
contexts=[json.loads(x) for x in (OUT/'caller-contexts.jsonl').read_text().splitlines()]
assert len(cells)==1200 and len(contexts)==100
context_by_id={x['sourceId']:x for x in contexts}
input_by_key={(x['sourcePosition'],x['locale']):x for x in cells}
assert len(input_by_key)==1200
reviews=[]
for n in range(1,5):
 path=OUT/f'batch-{n:02}-review.jsonl'
 rows=[json.loads(s) for s in path.read_text().splitlines()]
 assert len(rows)==300 and len({(x['sourcePosition'],x['locale']) for x in rows})==300,(path,len(rows))
 reviews.extend(rows)
assert len(reviews)==1200 and len({(x['sourcePosition'],x['locale']) for x in reviews})==1200
assert {(x['sourcePosition'],x['locale']) for x in reviews}==set(input_by_key)
ledger=[]; corrections=[]; counts=collections.Counter(); per_locale=collections.defaultdict(collections.Counter)
confidence=collections.Counter(); reviewer_by_locale=collections.defaultdict(set)
current_ph_mismatch=sum(x['placeholderParity']!='exact' for x in cells)
current_markup_mismatch=sum(x['markupParity']!='exact' for x in cells)
current_protected_mismatch=sum(bool(x.get('protectedLiteralExactMissing')) for x in cells)
final_ph_mismatch=final_markup_mismatch=final_protected_mismatch=0
source_icu_count=0
integrity_issues=[]
for review in reviews:
 key=(review['sourcePosition'],review['locale']);cell=input_by_key[key]
 sid=cell['sourceId'];loc=cell['locale'];ctx=context_by_id[sid]
 assert sha(canon(ctx))==cell['callerContextSha256'],(key,'caller context hash mismatch')
 assert review['sourceId']==sid and review['currentTargetHash']==cell['currentTargetHash'],(key,'cell pin mismatch')
 if review.get('sourceTextSha256') is not None: assert review['sourceTextSha256']==cell['sourceTextSha256'],(key,'source hash mismatch')
 if review.get('callerContextSha256') is not None: assert review['callerContextSha256']==cell['callerContextSha256'],(key,'caller hash mismatch')
 disp=review['disposition'];target=review.get('finalTarget')
 assert disp in {'accept-current','propose-correction','propose-refinement','hold'},(key,disp)
 if disp=='accept-current': assert target==cell['currentTarget'],(key,'accept-current differs')
 if disp in {'propose-correction','propose-refinement'}: assert isinstance(target,str) and target!=cell['currentTarget'],(key,'no-op/missing correction')
 if disp=='hold': assert target is None,(key,'hold has target')
 target_ph=ph(target) if target is not None else []
 target_tags=tags(target) if target is not None else []
 target_icu=icu(target) if target is not None else []
 candidate_missing=[x for x in cell['protectedLiterals'] if target is not None and x not in target]
 candidate_ph='exact' if target is not None and target_ph==ph(cell['source']) else ('not-applicable' if target is None else 'mismatch')
 candidate_markup='exact' if target is not None and target_tags==tags(cell['source']) else ('not-applicable' if target is None else 'mismatch')
 if target is not None:
  if candidate_ph!='exact': integrity_issues.append({'key':key,'issue':'placeholder'})
  if candidate_markup!='exact': integrity_issues.append({'key':key,'issue':'markup'})
  if candidate_missing: integrity_issues.append({'key':key,'issue':'protected','missing':candidate_missing})
  if not set(cell['sourceIcuPluralCategories']).issubset(target_icu): integrity_issues.append({'key':key,'issue':'icu-source-branch-missing'})
  if cell['sourceIcuPluralCategories'] and 'other' not in target_icu: integrity_issues.append({'key':key,'issue':'icu-other-missing'})
  if candidate_ph!='exact': final_ph_mismatch+=1
  if candidate_markup!='exact': final_markup_mismatch+=1
  if candidate_missing: final_protected_mismatch+=1
 if cell['sourceIcuPluralCategories']: source_icu_count+=1
 final_hash=sha(target) if target is not None else None
 row={**cell,
  'disposition':disp,'finalTarget':target,'finalTargetHash':final_hash,'targetHash':final_hash,
  'rationale':review['rationale'],'confidence':review.get('confidence','moderate'),
  'reviewer':review.get('reviewer','primary-static-semantic-review'),
  'callerContext':ctx,'callerUseStatus':ctx['callerUseStatus'],
  'candidatePlaceholderParity':candidate_ph,'candidateMarkupParity':candidate_markup,
  'sourceIcuPluralCategories':cell['sourceIcuPluralCategories'],'finalIcuPluralCategories':target_icu,
  'candidateProtectedLiteralMissing':candidate_missing,
  'candidateProtectedLiteralExactMissing':candidate_missing,
  'finalTargetPlaceholders':target_ph,'finalTargetMarkup':target_tags,
  'priorDispositionOverridden':False}
 ledger.append(row);counts[disp]+=1;per_locale[loc][disp]+=1;confidence[row['confidence']]+=1;reviewer_by_locale[loc].add(row['reviewer'])
 if disp in {'propose-correction','propose-refinement'}:
  corrections.append({'sourcePosition':cell['sourcePosition'],'sourceId':sid,'locale':loc,'source':cell['source'],'sourceTextSha256':cell['sourceTextSha256'],
   'currentTarget':cell['currentTarget'],'currentTargetHash':cell['currentTargetHash'],'candidateTarget':target,'candidateTargetHash':final_hash,
   'candidatePlaceholderParity':candidate_ph,'candidateMarkupParity':candidate_markup,
   'sourceIcuPluralCategories':cell['sourceIcuPluralCategories'],'candidateIcuPluralCategories':target_icu,
   'protectedLiterals':cell['protectedLiterals'],'candidateProtectedLiteralMissing':candidate_missing,
   'callerContextRef':sid,'callerContextSha256':cell['callerContextSha256'],'callerUseStatus':ctx['callerUseStatus'],
   'disposition':disp,'rationale':row['rationale'],'confidence':row['confidence'],'reviewer':row['reviewer'],
   'priorDisposition':cell.get('priorDisposition'),'priorDispositionOverridden':False})
assert not integrity_issues, integrity_issues[:20]
assert len(ledger)==1200 and len(corrections)==counts['propose-correction']+counts['propose-refinement']
assert current_ph_mismatch==0 and current_markup_mismatch==0
assert final_ph_mismatch==0 and final_markup_mismatch==0 and final_protected_mismatch==0
writejl(OUT/'primary-review-ledger.jsonl',ledger)
writejl(OUT/'correction-candidates.jsonl',corrections)
writej(OUT/'candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(corrections),'candidateTargets':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'disposition':x['disposition'],'candidateTarget':x['candidateTarget'],'candidateTargetHash':x['candidateTargetHash']} for x in corrections]})
writej(OUT/'review-plan.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(corrections),'candidates':corrections})
source_ids=[(x['sourcePosition'],x['sourceId'],x['source']) for x in cells if x['locale']=='ar']
source_icu_unique=len({x['sourcePosition'] for x in cells if any(p['kind'] in {'plural','select','selectordinal'} for p in x['sourcePlaceholders'])})
parity=json.loads((OUT/'catalog-parity.json').read_text())
prior=json.loads((OUT/'prior-disposition-boundary.json').read_text())
cross_rows=[json.loads(s) for s in (OUT/'batch-03-crossreview.jsonl').read_text().splitlines()]
cross_adj=[json.loads(s) for s in (OUT/'batch-03-crossreview-adjudication.jsonl').read_text().splitlines()]
assert len(cross_rows)==300 and len({(x['sourcePosition'],x['locale']) for x in cross_rows})==300
assert len(cross_adj)==sum(x['crossReviewDisposition']=='revise' for x in cross_rows)
cross_by_key={(x['sourcePosition'],x['locale']):x for x in cross_rows}
adj_by_key={(x['sourcePosition'],x['locale']):x for x in cross_adj}
for review in reviews:
 if review['locale'] not in {'ja','ko','pt_BR'}: continue
 k=(review['sourcePosition'],review['locale']);x=cross_by_key[k]
 if x['crossReviewDisposition']=='agree':
  assert sha(review['finalTarget'])==x['primaryFinalTargetHash'],(k,'agreed target changed after cross-review')
 elif x['crossReviewDisposition']=='revise':
  a=adj_by_key[k]
  assert review['reviewer']=='primary-static-semantic-review-adjudicated-crossreview'
  assert a['priorPrimaryTargetHash']==x['primaryFinalTargetHash']
  assert a['recommendedTargetHash']==sha(x['recommendedTarget'])
  assert a['finalPrimaryTargetHash']==sha(review['finalTarget']) and a['finalPrimaryTarget']==review['finalTarget']
  assert a['adjudication'].startswith('adopted as a correction after primary semantic review')
  if a['primaryRefinement']:
   assert a['finalPrimaryTargetHash']!=a['recommendedTargetHash']
  else: assert a['finalPrimaryTargetHash']==a['recommendedTargetHash']
 else: raise AssertionError((k,'unadjudicated cross-review hold'))
assert all(x['crossReviewDisposition']!='hold' for x in cross_rows)
start_heads={(x['repository'],x['number']):x['headRefOid'] for x in start['pullRequests']}
end_heads={(x['repository'],x['number']):x['headRefOid'] for x in end['pullRequests']}
summary={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
 'capturedAfterUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'executionEnvironment':{'host':'kspld0','scratchPath':str(OUT),'scratchMount':'/mnt/disks/scratch','freeSpaceAtStart':'4.3T'},
 'inputPostReviewAnnotation':{'change':'Recognized source token `PDFs` as protected literal `PDF` in plural contexts.','sourceCurrentValuesChanged':False,'sourceCurrentHashesChanged':False,'reviewDecisionsChanged':False,'all1200ReviewRowsRevalidatedAgainstRefreshedInputs':True},
 'scope':{'sourcePositionRange':[2500,2599],'sourceIds':100,'locales':LOCALES,'cells':len(ledger)},
 'sourceIdListSha256':sha(canon(source_ids)),'sourceWithIcuPluralOrSelect':source_icu_unique,
 'counts':dict(counts),'proposalCount':len(corrections),'correctionCount':counts.get('propose-correction',0),'refinementCount':counts.get('propose-refinement',0),
 'perLocale':{loc:dict(per_locale[loc]) for loc in LOCALES},'explicitHoldCount':counts.get('hold',0),'confidenceCounts':dict(confidence),
 'reviewersByLocale':{loc:sorted(reviewer_by_locale[loc]) for loc in LOCALES},
 'callerContextRows':len(contexts),'callerReferences':sum(len(c['pinnedLineRefs']) for c in contexts),
 'callerFiles':len({f['path'] for c in contexts for f in c['callerFiles']}),
 'callerGaps':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in contexts if not c['pinnedLineRefs']],
 'callerDefinitionOnly':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in contexts if c['callerUseStatus']!='direct-or-helper-reference-found'],
 'placeholderParityMismatchesCurrent':current_ph_mismatch,'markupParityMismatchesCurrent':current_markup_mismatch,
 'placeholderParityMismatchesFinal':final_ph_mismatch,'markupParityMismatchesFinal':final_markup_mismatch,
 'currentProtectedLiteralMismatchCells':current_protected_mismatch,'finalProtectedLiteralMismatchCells':final_protected_mismatch,
 'sourceIcuCells':source_icu_unique,'sourceIcuPluralCategoriesByCell':{'|'.join(k):v for k,v in collections.Counter(tuple(x['sourceIcuPluralCategories']) for x in cells if x['sourceIcuPluralCategories']).items()},
 'finalIcuPluralCategoryVariants':{'|'.join(k):v for k,v in collections.Counter(tuple(x['finalIcuPluralCategories']) for x in ledger if x['finalIcuPluralCategories']).items()},
 'priorBoundary':prior,'catalogKeySetParity':parity['allLocalesExactKeySetParity'],'localeCatalogOrderDifferences':parity['localesWithOrderDifferences'],
 'sourceWindowDoesNotOverlapPreviousWindow':{'priorEndPosition':2499,'currentStartPosition':2500,'currentEndPosition':2599,'nextPosition':2600,'uniqueSourceIds':len({x['sourceId'] for x in source_window['sourceList']}),
  'evidence':'source-boundaries.json records adjacent English insertion-order positions 2499/2500 and 2599/2600; the W2400 packet covers only 2400–2499.'},
 'liveLocalizationPullRequestsStart':start,'liveLocalizationPullRequestsEnd':end,
 'allSevenPullRequestHeadsUnchanged':end['allSevenHeadsAndStatesUnchanged'],
 'exactSeerrHeadAndTreeStillPinned':end['exactSeerrHeadAndTreeStillPinned'],
 'nativeSpeakerApproval':False,'nativeSpeakerReviewOutstanding':True,
 'browserReview':False,'repositoryModified':False,'testsBuildsScansCiRun':False,'workflowFilesTouched':False,
 'crossReview':{'batch03':{'file':'batch-03-crossreview.jsonl','present':(OUT/'batch-03-crossreview.jsonl').exists(),
   'reviewedCells':len(cross_rows),'dispositions':dict(collections.Counter(x['crossReviewDisposition'] for x in cross_rows)),
   'adjudicationFile':'batch-03-crossreview-adjudication.jsonl','adjudicatedRevisions':len(cross_adj),
   'adjudication':'all revise recommendations adopted after primary semantic review; agree decisions retain the primary target; no holds'},
   'nativeSpeakerReview':False}}
writej(OUT/'summary.json',summary)
reattest={'passed':end['exactSeerrHeadAndTreeStillPinned'],'exactHead':HEAD,'exactTree':TREE,
 'pullRequestState':next(x['state'] for x in end['pullRequests'] if x['number']==PR),
 'isDraft':next(x['isDraft'] for x in end['pullRequests'] if x['number']==PR),
 'headRefName':next(x['headRefName'] for x in end['pullRequests'] if x['number']==PR),
 'remoteHead':next(x['remoteBranchOid'] for x in end['pullRequests'] if x['number']==PR),
 'repositoryState':end['seerrWorktree'],'allSevenPullRequests':end['pullRequests'],
 'allSevenHeadsUnchanged':end['allSevenHeadsAndStatesUnchanged'],'allSevenChangesFromBefore':end['changesFromBefore'],
 'sourceIds':100,'localeCells':len(ledger),'sourceTextHashes':100,'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'callerDefinitionOnly':summary['callerDefinitionOnly'],'candidateCount':len(corrections),'sourceIdListSha256':summary['sourceIdListSha256']}
writej(OUT/'final-reattestation.json',reattest)
# Complete reviewer-facing description; all generated files stay in task scratch.
readme=f'''# SeerrNG PR #418 primary semantic review: W2500–2599\n\nReviewed SeerrNG PR #418 at exact head `{HEAD}` and tree `{TREE}`. The scope is positions 2500–2599, zero-based English-catalog insertion order, 100 source IDs × 12 locales = 1,200 cells. The adjacent boundary keys and the exact source catalog hashes are in `source-boundaries.json` and `source-window.json`. This window starts immediately after W2400–2499 at position 2500; the next key is position 2600.\n\nThe primary review proposes {len(corrections)} corrections, accepts {counts.get('accept-current',0)} current strings, and holds {counts.get('hold',0)} cells. Per-locale totals and integrity counts are in `summary.json`. All cells have source/current string hashes, locale-catalog pins, caller-context hashes and exact line references. All {len(contexts)} source IDs have direct-or-helper references in the pinned caller files; the ledger records the bounded search note and each reference.\n\nCurrent placeholder mismatches: {current_ph_mismatch}; current markup mismatches: {current_markup_mismatch}; current protected-literal mismatch cells: {current_protected_mismatch}. Final proposed/accepted targets have placeholder mismatches: {final_ph_mismatch}; markup mismatches: {final_markup_mismatch}; protected-literal mismatches: {final_protected_mismatch}. Source ICU plural branches are preserved; locale-specific additional plural categories are permitted. Locale key-set parity is {parity['allLocalesExactKeySetParity']}.\n\nBatch 03 received an independent 300-cell cross-review: {dict(collections.Counter(x['crossReviewDisposition'] for x in cross_rows))}. The primary reviewer adjudicated all {len(cross_adj)} revise recommendations as corrections after checking source and caller context and validating placeholders, markup, protected literals, and ICU branches. The complete independent ledger and primary adjudication are `batch-03-crossreview.jsonl` and `batch-03-crossreview-adjudication.jsonl`.\n\nAll seven localization PR/repo state snapshots are in `live-localization-prs-start.json` and `live-localization-prs-end.json`. Seerr #418 remained at the requested exact head/tree and the worktree remained clean through final reattestation: {end['exactSeerrHeadAndTreeStillPinned']}. Other PR head/state changes from the start snapshot, if any, are recorded in the end snapshot. Prior packets were scanned for exact live source+final-target dispositions; {prior['exactLivePriorDispositions']} exact dispositions were reused.\n\nThis is a static, machine-assisted primary review. It is not native-speaker approval; native-speaker review remains outstanding. No repository or PR files were edited, and no tests, builds, scans, CI jobs, or browser work were performed.\n\n## Files\n\n- `primary-review-ledger.jsonl`: one full-pinned primary decision per locale cell.\n- `correction-candidates.jsonl`, `candidate-targets.json`, `review-plan.json`: proposed corrections and exact hashes.\n- `source-current-cells.jsonl`, `caller-contexts.jsonl`, `source-window.json`, `source-boundaries.json`: frozen exact-head inputs and caller evidence.\n- `batch-01-review.jsonl` through `batch-04-review.jsonl`: reviewer judgments by locale batch.\n- `batch-03-crossreview.jsonl`, `batch-03-crossreview-adjudication.jsonl`: independent review of batch 03 and primary adjudication of its recommendations.\n- `live-localization-prs-start.json`, `live-localization-prs-end.json`, `final-reattestation.json`: before/after PR and worktree state.\n- `SHA256SUMS`: checksums for every file in this task packet (except the checksum file itself and its detached `.sha256`).\n'''
(OUT/'README.md').write_text(readme)
# Hash every task packet file except the checksum listing and its detached digest.
files=sorted(p for p in OUT.rglob('*') if p.is_file() and p.name not in {'SHA256SUMS','SHA256SUMS.sha256'})
(OUT/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files))
(OUT/'SHA256SUMS.sha256').write_text(f'{sha((OUT/"SHA256SUMS").read_bytes())}  SHA256SUMS\n')
print(json.dumps({'summary':{'counts':dict(counts),'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],'exactSeerrHeadAndTreeStillPinned':end['exactSeerrHeadAndTreeStillPinned']},'candidateCount':len(corrections),'ledgerRows':len(ledger),'integrityIssues':len(integrity_issues),'sha256sumEntries':len(files),'sha256sumFileSha256':sha((OUT/'SHA256SUMS').read_bytes()),'output':str(OUT)},ensure_ascii=False,indent=2))
