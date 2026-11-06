import collections, hashlib, json, pathlib, subprocess
W=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1000-1099')
P=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-1100-1199-20261102')
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-1100-1199-crossreview-20261102')
HEAD='c8f4b2f5f1f42730dcfa8d36214ee827a5d9395a'; TREE='0fe67d04abfd49681556b44e900aceec1b5a9a75'
FILES={'ar':'ar.json','de':'de.json','es':'es.json','fr':'fr.json','hi':'hi.json','id':'id.json','ja':'ja.json','ko':'ko.json','pt-BR':'pt_BR.json','vi':'vi.json','zh-CN':'zh_Hans.json','zh-TW':'zh_Hant.json'}
def run(*args): return subprocess.check_output(args)
def git(*args): return run('git','-C',str(W),*args)
def sha(b): return hashlib.sha256(b).hexdigest()
def htext(s): return sha(s.encode('utf8'))
def jlines(name): return [json.loads(x) for x in (P/name).read_text(encoding='utf8').splitlines() if x]
pr=json.loads(run('gh','pr','view','418','--repo','snapetech-org/seerrng','--json','state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,mergeStateStatus').decode())
head=git('rev-parse','HEAD').decode().strip(); tree=git('rev-parse','HEAD^{tree}').decode().strip()
assert head==HEAD and tree==TREE,(head,tree)
assert pr['headRefOid']==HEAD and pr['baseRefOid']=='221d8e0d542802da7529cd272c928cc747677e5c' and pr['state']=='OPEN' and pr['isDraft'] is True,pr
assert pr['headRefName']=='codex/seerrng-localization-overhaul-20261028'
manifest=json.loads((P/'manifest.json').read_text(encoding='utf8'))
assert manifest['head']==HEAD and manifest['tree']==TREE
src_path='src/i18n/locale/en.json'; src_bytes=git('show',f'{HEAD}:{src_path}'); source=json.loads(src_bytes); entries=list(source.items()); window=entries[1100:1200]
assert len(window)==100
locales=list(FILES); targets={}; catalog_proofs={}
for loc,file in FILES.items():
 path='src/i18n/locale/'+file; b=git('show',f'{HEAD}:{path}'); d=json.loads(b)
 assert len(d)==9494 and set(d)==set(source)
 meta=manifest['targetCatalogs'][loc]
 assert git('rev-parse',f'{HEAD}:{path}').decode().strip()==meta['blob']
 assert sha(b)==meta['sha256'] and len(b)==meta['bytes'] and len(d)==meta['keyCount']
 targets[loc]=d; catalog_proofs[loc]={'path':path,'blob':meta['blob'],'sha256':sha(b),'keyCount':len(d),'bytes':len(b)}
assert git('rev-parse',f'{HEAD}:{src_path}').decode().strip()==manifest['sourceCatalog']['blob']
assert sha(src_bytes)==manifest['sourceCatalog']['sha256'] and len(source)==9494
att=jlines('source-current-attestation.jsonl'); cells=jlines('selected-direct-locale-cells.jsonl'); contexts=jlines('source-contexts.jsonl'); caller_att=jlines('caller-context-attestation.jsonl'); props=jlines('candidate-proposals.jsonl'); c_hashes=jlines('candidate-hashes.jsonl'); ledger=jlines('primary-review-ledger.jsonl'); prior=jlines('preserved-prior-routing-rows.jsonl')
assert len(att)==1300 and len(cells)==1200 and len(contexts)==100 and len(caller_att)==231 and len(props)==218 and len(c_hashes)==218 and len(ledger)==1200 and len(prior)==6
errs=[]
source_map={}; rows_map={}
for pos,(sid,val) in enumerate(window,1100):
 source_map[sid]=(pos,val)
 for r in contexts:
  if r['sourceId']==sid:
   assert r['sourceIdPosition']==pos and r['source']==val and r['sourceSha256']==htext(val) and r['sourceFileBlob']==manifest['sourceCatalog']['blob']
# Verify all source and target cell records against independently loaded git blobs.
for r in cells:
 sid=r['sourceId']; loc=r['locale']; pos=r['sourceIdPosition']; val=source[sid]; cur=targets[loc][sid]
 assert (pos,val)==source_map[sid]
 assert r['source']==val and r['sourceSha256']==htext(val) and r['target']==cur and r['targetSha256']==htext(cur)
 assert r['sourceFileBlob']==manifest['sourceCatalog']['blob'] and r['targetFileBlob']==manifest['targetCatalogs'][loc]['blob']
 rows_map[(sid,loc)]=r
# Check compact and full current/source attestation rows.
source_att={r['sourceId']:r for r in att if r.get('locale') is None}
cell_att={(r['sourceId'],r['locale']):r for r in att if r.get('locale') is not None}
assert len(source_att)==100 and len(cell_att)==1200
for sid,(pos,val) in source_map.items():
 r=source_att[sid]; assert r['sourceIdPosition']==pos and r['sourceHash']==htext(val) and r['sourceMatchesCurrentHead'] is True
for (sid,loc),r in cell_att.items():
 assert r['sourceHash']==htext(source[sid]) and r['currentTargetHash']==htext(targets[loc][sid]) and r['sourceMatchesCurrentHead'] is True and r['targetMatchesCurrentHead'] is True
# Independently reattest each caller's file blob, file hash and exact line bytes.
caller_count=0; unique_lines=set(); refs_by_id={}
for c in contexts:
 refs=c['callers']; refs_by_id[c['sourceId']]=refs
 for ref in refs:
  path=ref['path']; data=git('show',f"{HEAD}:{path}"); lines=data.decode('utf8').splitlines(); line=ref['line']
  assert ref['attestedHead']==HEAD and ref['attestedTree']==TREE and ref['matchedAtCurrentHead'] is True
  assert line<=len(lines) and ref['lineText']==lines[line-1]
  assert ref['fileBlob']==git('rev-parse',f'{HEAD}:{path}').decode().strip() and ref['fileSha256']==sha(data)
  assert ref['lineSha256']==htext(lines[line-1])
  caller_count+=1; unique_lines.add((path,line))
assert caller_count==231 and len({r['path'] for rr in refs_by_id.values() for r in rr})==10 and len(unique_lines)==229
assert len(caller_att)==caller_count
# Candidate source/current/proposal hashes and caller pin completeness.
prop_keys=set(); prop_hash_index=[]
for r in props:
 key=(r['id'],r['locale']); assert key not in prop_keys; prop_keys.add(key)
 assert r['attestedHead']==HEAD and r['attestedTree']==TREE
 cur=targets[r['locale']][r['id']]; val=source[r['id']]
 assert r['currentTarget']==cur and r['currentTargetHash']==htext(cur)
 assert r['source']==val and r['sourceHash']==htext(val)
 assert r['proposedTarget']!=cur and r['candidateKind'] in ('correction','refinement')
 assert r['targetCatalogBlob']==manifest['targetCatalogs'][r['locale']]['blob'] and r['sourceCatalogBlob']==manifest['sourceCatalog']['blob']
 prop_hash_index.append({'sourceIdPosition':r['sourceIdPosition'],'id':r['id'],'locale':r['locale'],'candidateHash':r['candidateHash'],'currentTargetHash':r['currentTargetHash'],'proposedTargetHash':htext(r['proposedTarget']),'sourceHash':r['sourceHash']})
 assert r['candidateHash']==htext(r['proposedTarget'])
 assert r['candidateHash']==next(x['candidateHash'] for x in c_hashes if x['id']==r['id'] and x['locale']==r['locale'])
 assert r['currentTargetHash']==next(x['currentTargetHash'] for x in c_hashes if x['id']==r['id'] and x['locale']==r['locale'])
assert len(prop_keys)==218
# Verify proposal parity by variable and markup inventory.
import re
def vars0(s): return sorted(set(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,}]|$)',s)))
def tags0(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
parity_fail=[]
for r in props:
 if vars0(r['source'])!=vars0(r['currentTarget']) or vars0(r['source'])!=vars0(r['proposedTarget']) or tags0(r['source'])!=tags0(r['currentTarget']) or tags0(r['source'])!=tags0(r['proposedTarget']): parity_fail.append((r['sourceIdPosition'],r['locale']))
# Compare all intersecting prior root rows and applied values.
evidence=W/'docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649'
root_rows=[json.loads(x) for x in (evidence/'root-cross-review.jsonl').read_text(encoding='utf8').splitlines() if x.strip()]
apply_rows=[json.loads(x) for x in (evidence/'exact-hash-apply-plan.jsonl').read_text(encoding='utf8').splitlines() if x.strip()]
prior_ids={sid for sid,_ in window}; overlaps=[r for r in root_rows if r.get('id') in prior_ids]
prior_by={(r['id'],r['locale']):r for r in prior}
assert len(overlaps)==6 and len(prior_by)==6
for o in overlaps:
 key=(o['id'],o['locale']); assert key in prior_by and o['locale']=='es'
 assert o['decision'] in ('accept','refine')
 cur=targets['es'][o['id']]; assert cur==o['finalTarget']==prior_by[key]['priorFinalTarget']
# Prior window source positions are disjoint and boundaries exact.
prev=json.loads(pathlib.Path(manifest['previousWindow']['manifest']).read_text(encoding='utf8'))
assert prev['sourceIdPositionRange']==[1000,1099] and set(source_map).isdisjoint(set(prev.get('sourceIds',[])))
# Cross-window IDs in current catalog positions are checked directly.
assert [window[0][0],window[-1][0]]==[manifest['sourceIdWindowBoundaryIds']['1100'],manifest['sourceIdWindowBoundaryIds']['1199']]
result={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'livePullRequest':pr,'head':head,'tree':tree,'baseRefOid':pr['baseRefOid'],'worktreeClean':not run('git','-C',str(W),'status','--porcelain').decode().strip(),'sourceCount':100,'cellCount':len(cells),'localeCatalogs':catalog_proofs,'currentSourceAttestationRows':len(att),'currentSourceHashMismatches':0,'sourceContextRows':len(contexts),'callerReferences':caller_count,'uniqueCallerFiles':10,'uniqueCallerLines':len(unique_lines),'callerPinMismatches':0,'candidateCount':len(props),'candidateKindCounts':dict(collections.Counter(r['candidateKind'] for r in props)),'candidateSourceCurrentHashMismatches':0,'candidateHashIndexMismatches':0,'candidateHashesRecomputedFromProposals':True,'primaryPacketChecksumsSha256':sha((P/'SHA256SUMS').read_bytes()),'placeholderOrMarkupParityFailures':parity_fail,'priorRootOverlapRows':len(overlaps),'priorSpanishRowsPreserved':len(prior),'priorWindowRange':prev['sourceIdPositionRange'],'priorWindowNonOverlapping':True,'reusedPriorReviewExposure':{'sourcePositions':[1151,1199],'locales':['de','es','fr','pt-BR'],'disclosed':True},'capturedAtUtc':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ']).decode().strip()}
(OUT/'reattestation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'candidate-hash-index.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in sorted(prop_hash_index,key=lambda x:(x['sourceIdPosition'],x['locale']))),encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ('localeCatalogs','livePullRequest')},ensure_ascii=False,indent=2))
