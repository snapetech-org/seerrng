from pathlib import Path
import json, hashlib, re
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
PRIMARY_REFINEMENTS={('ja',2595):('リーダーサービスの他の利用者にもこのグループを表示','Keeps “other” attached to service users while aligning the service-user wording with adjacent help text.')}
def ph(s):
 result=[]; i=0
 while i<len(s):
  if s[i]!='{': i+=1; continue
  depth=1; j=i+1
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  if depth: return None
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',s[i+1:j-1])
  if m: result.append((m.group(1),m.group(2) or 'simple'))
  i=j
 return sorted(result)
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
inputs={(x['sourcePosition'],x['locale']):x for x in map(json.loads,(OUT/'batch-03-input.jsonl').open())}
primary={(x['sourcePosition'],x['locale']):x for x in map(json.loads,(OUT/'batch-03-review.jsonl').open())}
cross={(x['sourcePosition'],x['locale']):x for x in map(json.loads,(OUT/'batch-03-crossreview.jsonl').open())}
existing_adj_path=OUT/'batch-03-crossreview-adjudication.jsonl'
existing_adj={(x['sourcePosition'],x['locale']):x for x in map(json.loads,existing_adj_path.open())} if existing_adj_path.exists() else {}
assert set(inputs)==set(primary)==set(cross) and len(inputs)==300
revised=[]; output=[]
for k in sorted(primary):
 c=inputs[k]; p=primary[k]; x=cross[k]
 assert p['sourceId']==x['sourceId']==c['sourceId']
 assert p['currentTargetHash']==c['currentTargetHash']
 prior_record=existing_adj.get(k)
 prior_hash=prior_record['priorPrimaryTargetHash'] if prior_record else sha(p['finalTarget'])
 assert x['primaryFinalTargetHash']==prior_hash
 if x['crossReviewDisposition']=='revise':
  recommended=x['recommendedTarget']; target=recommended
  assert isinstance(target,str) and target != c['currentTarget'], (k,'missing/no-op target')
  refinement=PRIMARY_REFINEMENTS.get((k[1],k[0]))
  if refinement:
   target,why=refinement
  else: why=None
  rationale='Primary adjudication adopted the independent cross-review recommendation: '+x['rationale']
  if why: rationale='Primary adjudication adopted the independent cross-review recommendation with a focused terminology refinement: '+why+' Cross-review rationale: '+x['rationale']
  assert ph(target)==ph(c['source']), (k,'placeholder mismatch',ph(target),ph(c['source']))
  assert tags(target)==tags(c['source']), (k,'markup mismatch')
  missing=[t for t in c['protectedLiterals'] if t not in target]
  assert not missing, (k,'protected literals missing',missing)
  assert set(c['sourceIcuPluralCategories']).issubset(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',target))), (k,'ICU category mismatch')
  p={**p,'disposition':'propose-correction','finalTarget':target,
     'rationale':rationale,
     'confidence':x['confidence'],'reviewer':'primary-static-semantic-review-adjudicated-crossreview'}
  revised.append({'sourcePosition':k[0],'sourceId':c['sourceId'],'locale':k[1],
                  'sourceTextSha256':c['sourceTextSha256'],'currentTargetHash':c['currentTargetHash'],
                  'priorPrimaryDisposition':prior_record['priorPrimaryDisposition'] if prior_record else primary[k]['disposition'],'priorPrimaryTargetHash':prior_hash,
                  'crossReviewDisposition':x['crossReviewDisposition'],'recommendedTarget':recommended,
                  'recommendedTargetHash':sha(recommended),'finalPrimaryTarget':target,
                  'finalPrimaryTargetHash':sha(target),'primaryRefinement':why,
                  'rationale':x['rationale'],'confidence':x['confidence'],
                  'adjudication':'adopted as a correction after primary semantic review'+(' with a terminology refinement' if why else '')})
 elif x['crossReviewDisposition']=='agree':
  assert x['recommendedTarget'] is None
 elif x['crossReviewDisposition']=='hold':
  assert False, (k,'cross-review hold requires adjudication')
 else: raise AssertionError((k,x['crossReviewDisposition']))
 output.append(p)
assert len(revised)==36
(OUT/'batch-03-review.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in output))
(OUT/'batch-03-crossreview-adjudication.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in revised))
print(json.dumps({'batch03Rows':len(output),'adoptedIndependentRevisions':len(revised),
 'crossreviewerCounts':{'agree':sum(x['crossReviewDisposition']=='agree' for x in cross.values()),'revise':len(revised),'hold':sum(x['crossReviewDisposition']=='hold' for x in cross.values())},
 'allRecommendedAndRefinedTargetsValidated':True,'reviewerAttribution':'primary-static-semantic-review-adjudicated-crossreview'},indent=2))
