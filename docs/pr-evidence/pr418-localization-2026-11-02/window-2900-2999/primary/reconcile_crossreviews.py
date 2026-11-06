import collections, hashlib, json, pathlib
OUT=pathlib.Path(__file__).resolve().parent
HEAD='58697945e3d3fb44c37d49db0cc0f88e3af110cc'; TREE='e3076937fe10b4dd3821ea573e8e5e21601fce7d'
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode()).hexdigest()
inputs={(x['sourcePosition'],x['locale']):x for x in map(json.loads,(OUT/'source-current-cells.jsonl').read_text().splitlines())}
contexts={x['sourceId']:x for x in map(json.loads,(OUT/'caller-contexts.jsonl').read_text().splitlines())}
proposals={(x['position'],x['locale']):x for x in map(json.loads,(OUT/'manual-proposals.jsonl').read_text().splitlines())}
first_changes=json.loads((OUT/'first-half-independent-reconciliation.json').read_text())
second_changes=json.loads((OUT/'second-half-independent-reconciliation.json').read_text())
first_added={(x['position'],x['locale']) for x in first_changes['independentDifferencesAdded']}
first_adjusted={(x['position'],x['locale']) for x in first_changes['primaryCandidatesReplacedOrAdjusted']}
second_added={(x['position'],x['locale']) for x in second_changes['independentNewRecommendations']}
second_adjusted={(x['new']['position'],x['new']['locale']) for x in second_changes['primaryCandidatesAdjusted']}
first=[json.loads(x) for x in (OUT/'subreview-2900-2949.jsonl').read_text().splitlines()]
second=[json.loads(x) for x in (OUT/'subreview-2950-2999.jsonl').read_text().splitlines()]
assert len(first)==len(second)==600
assert len({(x['sourcePosition'],x['locale']) for x in first+second})==1200
assert all(x['exactHead']==HEAD and x['exactTree']==TREE for x in first)
assert all(x['exactHead']==HEAD and x['exactTree']==TREE for x in second)
reconciled=[]; first_counts=collections.Counter(); second_counts=collections.Counter(); resolution_counts=collections.Counter()
for r in first:
 key=(r['sourcePosition'],r['locale']); c=inputs[key]; ctx=contexts[c['sourceId']]; p=proposals.get(key)
 assert r['sourceId']==c['sourceId'] and r['source']==c['source'] and r['sourceTextSha256']==c['sourceTextSha256']
 assert r['currentTarget']==c['currentTarget'] and r['currentTargetHash']==c['currentTargetHash']
 assert r['callerContextSha256']==c['callerContextSha256'] and r['callerPaths']==ctx['callerPaths']
 assert collections.Counter(r['callerLineHashes'])==collections.Counter(x['lineSha256'] for x in ctx['pinnedLineRefs'])
 assert r['nativeSpeakerApproval'] is False and r['placeholderParity']=='exact' and r['markupParity']=='exact'
 decision=r['decision']; first_counts[decision]+=1
 if decision=='accept':
  assert p is None
  resolution='agrees-accept-current'; final=c['currentTarget']; disposition='accept-current'
 else:
  assert decision in ('correction','refinement') and r['proposedTarget'] and p and p['target']==r['proposedTarget']
  assert r['proposedTargetHash']==sha(r['proposedTarget'])
  final=p['target']; disposition=p['kind']
  if key in first_added:
   resolution='new-independent-proposal-adopted'
   if key==(2914,'ja'): resolution='new-proposal-adopted-rationale-narrowed-to-spacing-refinement'
  elif key in first_adjusted: resolution='primary-candidate-adjusted-after-independent-review'
  else: resolution='independently-concurs-with-primary'
 resolution_counts[resolution]+=1
 reconciled.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':c['locale'],'sourceTextSha256':c['sourceTextSha256'],'currentTargetHash':c['currentTargetHash'],'independentReviewer':r['reviewer'],'independentDecision':decision,'independentFinalTarget':r['proposedTarget'],'independentFinalTargetHash':r['proposedTargetHash'],'independentRationale':r['rationale'],'primaryFinalTarget':final,'primaryFinalTargetHash':sha(final),'primaryDisposition':disposition,'resolution':resolution,'callerContextSha256':c['callerContextSha256'],'callerPaths':ctx['callerPaths'],'callerPinCount':len(ctx['pinnedLineRefs']),'hold':None,'nativeSpeakerApproval':'not-performed'})
for r in second:
 key=(r['sourcePosition'],r['locale']); c=inputs[key]; ctx=contexts[c['sourceId']]; p=proposals.get(key)
 assert r['sourceId']==c['sourceId'] and r['source']==c['source'] and r['sourceHash']==c['sourceTextSha256']
 assert r['currentTarget']==c['currentTarget'] and r['currentTargetHash']==c['currentTargetHash']
 assert r['callerContextSha256']==c['callerContextSha256'] and r['callerPaths']==ctx['callerPaths'] and r['callerUseStatus']==ctx['callerUseStatus']
 assert collections.Counter((x['file'],x['line'],x['lineSha256'],x['lineText']) for x in r['callerPins'])==collections.Counter((x['file'],x['line'],x['lineSha256'],x['lineText']) for x in ctx['pinnedLineRefs'])
 assert r['hold'] is None and r['nativeSpeakerApproval']=='not-performed'
 st=r['structuralReview']; assert st['topLevelPlaceholderParity'] and st['protectedLiteralsPresent'] and st['icuRootAndRequiredSelectorsPreserved']
 if not st['rawMarkupParity']:
  assert st['markupAssessment']=='icu-plural-branch-rich-text-equivalent' and r['sourcePosition'] in (2994,2995) and r['locale'] in ('ar','es','fr','pt_BR')
 else: assert st['markupAssessment']=='exact'
 v=r['independentVerdict']; second_counts[v]+=1
 if v=='accept-current':
  assert p is None
  resolution='agrees-accept-current'; final=c['currentTarget']; disposition='accept-current'
 elif v=='concur-primary-candidate':
  assert p and p['target']==r['primaryTarget']==r['independentFinalTarget']
  resolution='independently-concurs-with-primary'; final=p['target']; disposition=p['kind']
 elif v=='recommend-new-proposal':
  assert p and p['target']==r['independentFinalTarget'] and p['target']!=c['currentTarget'] and key in second_added
  resolution='new-independent-proposal-adopted'; final=p['target']; disposition=p['kind']
 elif v=='recommend-primary-candidate-adjustment':
  assert p and p['target']==r['independentFinalTarget'] and r['primaryTarget']!=p['target'] and key in second_adjusted
  resolution='primary-candidate-adjusted-after-independent-review'; final=p['target']; disposition=p['kind']
 else: raise AssertionError(v)
 assert r['independentFinalTargetHash']==sha(r['independentFinalTarget'])
 resolution_counts[resolution]+=1
 reconciled.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':c['locale'],'sourceTextSha256':c['sourceTextSha256'],'currentTargetHash':c['currentTargetHash'],'independentReviewer':r['reviewer'],'independentDecision':v,'independentFinalTarget':r['independentFinalTarget'],'independentFinalTargetHash':r['independentFinalTargetHash'],'independentRationale':r['independentRationale'],'priorPrimaryCandidate':r['primaryTarget'],'primaryFinalTarget':final,'primaryFinalTargetHash':sha(final),'primaryDisposition':disposition,'resolution':resolution,'callerContextSha256':c['callerContextSha256'],'callerPaths':ctx['callerPaths'],'callerPinCount':len(ctx['pinnedLineRefs']),'hold':None,'nativeSpeakerApproval':'not-performed'})
reconciled.sort(key=lambda x:(x['sourcePosition'],x['locale']))
assert len(reconciled)==1200 and all(x['hold'] is None for x in reconciled)
(OUT/'independent-review-reconciliation.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in reconciled))
summary={'repository':'snapetech-org/SeerrNG','pullRequest':418,'exactHead':HEAD,'exactTree':TREE,'sourceLocaleRowsReviewed':len(reconciled),'windowHalves':{'2900-2949':dict(first_counts),'2950-2999':dict(second_counts)},'reconciliationOutcomes':dict(resolution_counts),'proposalsBeforeIndependentReviews':241,'newIndependentProposalsAdopted':len(first_added)+len(second_added),'primaryCandidatesUpdatedAfterReview':len(first_adjusted)+len(second_adjusted),'finalProposalCount':len(proposals),'unresolvedHolds':0,'structuralFailures':0,'nativeSpeakerApprovalClaimed':False,'reviewerSignoff':'Machine-assisted primary plus two independent machine-assisted half-window reviews; qualified native-speaker signoff remains outstanding.','reviewArtifactHashes':{'subreview-2900-2949.jsonl':sha((OUT/'subreview-2900-2949.jsonl').read_bytes()),'subreview-2950-2999.jsonl':sha((OUT/'subreview-2950-2999.jsonl').read_bytes())}}
(OUT/'crossreview-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
