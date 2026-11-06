import collections, hashlib, json, subprocess
from pathlib import Path
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1500-1599-primary-20261102')
W='/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499'
PREV=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1400-1499-primary-20261102')
HEAD='94bdd3f690fc54d37d17e04d29a443533af3fb0d'; TREE='17df3c6f626ac544990d2f8f2049daf95b4738ac'; OLDHEAD='0773321829173ea9fe6c765d16335c27c06c57a2'; OLDTREE='176872baf853ae7278c0c575111bb430026aa454'
BASE='221d8e0d542802da7529cd272c928cc747677e5c'; BRANCH='codex/seerrng-localization-overhaul-20261028'
EVIDENCE='docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649'
ROOT_CROSS=f'{EVIDENCE}/root-cross-review.jsonl'; APPLY=f'{EVIDENCE}/exact-hash-apply-plan.jsonl'; HOLDS=f'{EVIDENCE}/held-uncertain-cells.jsonl'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-CN','zh-TW']
GROUPS={'locale-a':['ar','de','es','fr','hi','id'],'locale-b':['ja','ko','pt-BR','vi','zh-CN','zh-TW']}
def git(*args): return subprocess.check_output(['git','-C',W,*args])
def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode('utf8')).hexdigest()
def readjl(path): return [json.loads(x) for x in Path(path).read_text(encoding='utf8').splitlines() if x.strip()]
def dumpj(path,obj): Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def dumpjl(path,rows): Path(path).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf8')
assert git('rev-parse','HEAD').decode().strip()==HEAD
assert git('rev-parse','HEAD^{tree}').decode().strip()==TREE
# Re-attest the adjacent prior window as the exact input inventory boundary.
prev_manifest=json.loads((PREV/'manifest.json').read_text(encoding='utf8'))
assert prev_manifest['head']==OLDHEAD and prev_manifest['tree']==OLDTREE
assert prev_manifest['sourceIdPositionRange']==[1400,1499]
assert prev_manifest['sourceCatalog']['blob']=='12e04a118c30b71b3714291adeaf9fdb2735cee4'
READBACK='docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-1400-1499/root-apply-readback.json'
readback=json.loads(git('show',f'{HEAD}:{READBACK}').decode('utf8'))
assert readback['baseHead']==OLDHEAD and readback['sourcePositionStart']==1400 and readback['sourcePositionStopExclusive']==1500
readback_map={(r['id'],r['locale']):r for r in readback['cells']}
assert len(readback_map)==450
prev_context=readjl(PREV/'source-contexts.jsonl')
prev_cells=readjl(PREV/'selected-direct-locale-cells.jsonl')
source=json.loads(git('show',f'{HEAD}:src/i18n/locale/en.json'))
entries=list(source.items()); source_blob=git('rev-parse',f'{HEAD}:src/i18n/locale/en.json').decode().strip()
assert len(entries)==9494 and len(prev_context)==100 and len(prev_cells)==1200
previous_mismatches=[]
for row in prev_context:
 pos=row['sourceIdPosition']; sid,val=entries[pos]
 if (sid,val,sha(val))!=(row['sourceId'],row['source'],row['sourceSha256']): previous_mismatches.append(['source',pos,sid])
previous_window_updated=0; previous_window_unchanged=0
for row in prev_cells:
 pos=row['sourceIdPosition']; sid,val=entries[pos]
 target=json.loads(git('show',f"{HEAD}:{row['targetFile']}"))
 applied=readback_map.get((sid,row['locale']))
 expected=applied['finalTarget'] if applied else row['target']
 if applied:
  previous_window_updated += int(expected!=row['target'])
 else:
  previous_window_unchanged += 1
 if sid!=row['sourceId'] or val!=row['source'] or sha(val)!=row['sourceSha256'] or target[sid]!=expected or (applied and sha(target[sid])!=applied['finalTargetHash']):
  previous_mismatches.append(['cell',row['locale'],pos,sid])
# Re-attest every W1400 catalog output recorded by the exact-head readback.
for path,pin in readback['catalogPinsAfter'].items():
 rawcat=git('show',f'{HEAD}:{path}')
 if sha(rawcat)!=pin['sha256'] or git('rev-parse',f'{HEAD}:{path}').decode().strip()!=pin['gitBlob']:
  previous_mismatches.append(['catalogPin',path])
assert not previous_mismatches,previous_mismatches
window=entries[1500:1600]; ids=[k for k,_ in window]
assert len(window)==100 and len(set(ids))==100
# Search all tracked PR evidence JSON/JSONL by exact source ID, not historical window number.
tracked=git('ls-tree','-r','--name-only',HEAD,'docs/pr-evidence/pr418-localization-2026-11-02').decode().splitlines()
parsed=0; matched_ids=set(); matched_rows=0
for path in tracked:
 if not path.endswith(('.json','.jsonl')): continue
 try: raw=git('show',f'{HEAD}:{path}').decode('utf8')
 except subprocess.CalledProcessError: continue
 try: rows=[json.loads(x) for x in raw.splitlines() if x.strip()] if path.endswith('.jsonl') else [json.loads(raw)]
 except Exception: continue
 parsed+=1
 for row in rows:
  if not isinstance(row,dict): continue
  sid=row.get('sourceId',row.get('id',row.get('source_id')))
  if sid in set(ids): matched_ids.add(sid); matched_rows+=1
root_rows=[json.loads(x) for x in git('show',f'{HEAD}:{ROOT_CROSS}').decode().splitlines() if x.strip()]
apply_rows=[json.loads(x) for x in git('show',f'{HEAD}:{APPLY}').decode().splitlines() if x.strip()]
hold_rows=[json.loads(x) for x in git('show',f'{HEAD}:{HOLDS}').decode().splitlines() if x.strip()]
root_map={(r.get('id'),r.get('locale')):r for r in root_rows}
apply_map={(r.get('id'),r.get('locale')):r for r in apply_rows}
hold_map={(r.get('id'),r.get('locale')):r for r in hold_rows}
base=readjl(OUT/'primary-review-ledger.jsonl')
all_inputs=readjl(OUT/'review-input-all-cells.jsonl')
# The direct-property scanner misses GameLibraryStatus messages routed through messages[status].
# Pin the exact dynamic call for the three statuses present in this source window.
contexts=readjl(OUT/'source-contexts.jsonl')
caller_att=readjl(OUT/'caller-context-attestation.jsonl')
ctxmap={x['sourceId']:x for x in contexts}
dynamic_status_ids=set()
caller_path='src/components/GameLibrary/index.tsx'; caller_bytes=git('show',f'{HEAD}:{caller_path}'); caller_lines=caller_bytes.decode('utf8').splitlines(); caller_line=411
assert 'intl.formatMessage(messages[status])' in caller_lines[caller_line-1]
line_ref={'attestedHead':HEAD,'attestedTree':TREE,'fileBlob':git('rev-parse',f'HEAD:{caller_path}').decode().strip(),'fileSha256':sha(caller_bytes),'kind':'message-use-dynamic-status','line':caller_line,'lineSha256':sha(caller_lines[caller_line-1]),'lineText':caller_lines[caller_line-1],'matchedAtCurrentHead':True,'nextLine':caller_lines[caller_line] if caller_line<len(caller_lines) else '','path':caller_path,'previousLine':caller_lines[caller_line-2] if caller_line>1 else ''}
for sid in dynamic_status_ids:
 ctx=ctxmap[sid]; pos=ctx['sourceIdPosition']
 assert 1500<=pos<1600 and ctx['source']==source[sid]
 ref={**line_ref,'sourceId':sid,'sourceIdPosition':pos}
 if not any((x['path'],x['line'],x['kind'])==(caller_path,caller_line,'message-use-dynamic-status') for x in ctx['callers']): ctx['callers'].append(ref)
 ctx['usageStatus']='found'; ctx['usageReferenceCount']=len(ctx['callers'])-1
 att={k:ref[k] for k in ('attestedHead','attestedTree','fileBlob','fileSha256','kind','line','lineSha256','path','sourceId','sourceIdPosition','matchedAtCurrentHead')}
 if not any((x['sourceId'],x['path'],x['line'],x['kind'])==(sid,caller_path,caller_line,'message-use-dynamic-status') for x in caller_att): caller_att.append(att)
for row in base:
 refs=ctxmap[row['sourceId']]['callers']
 row['callerContextCurrentHeadProof']=[{'currentHead':HEAD,'fileBlob':x['fileBlob'],'fileBlobMatches':True,'line':x['line'],'lineSha256':x['lineSha256'],'path':x['path'],'contextMatches':True} for x in refs]
 row['callerContextReferenceCount']=len(refs); row['callerContextReferencesReattested']=True
 row['sourceContextCoverage']='definition-and-use-found' if len(refs)>1 else ('definition-found-use-not-found' if len(refs)==1 else 'no-definition-or-use-found')
for row in all_inputs: row['sourceContexts']=ctxmap[row['id']]['callers']
dumpjl(OUT/'source-contexts.jsonl',contexts); dumpjl(OUT/'caller-context-attestation.jsonl',caller_att)
assert len(base)==len(all_inputs)==1200
base_map={(r['sourceId'],r['locale']):r for r in base}
current_by_key={(r['id'],r['locale']):r for r in all_inputs}
locale_files={'ar':'src/i18n/locale/ar.json','de':'src/i18n/locale/de.json','es':'src/i18n/locale/es.json','fr':'src/i18n/locale/fr.json','hi':'src/i18n/locale/hi.json','id':'src/i18n/locale/id.json','ja':'src/i18n/locale/ja.json','ko':'src/i18n/locale/ko.json','pt-BR':'src/i18n/locale/pt_BR.json','vi':'src/i18n/locale/vi.json','zh-CN':'src/i18n/locale/zh_Hans.json','zh-TW':'src/i18n/locale/zh_Hant.json'}
prior_records=[]; frozen={}
for r in root_rows:
 key=(r.get('id'),r.get('locale'))
 if key[0] not in set(ids): continue
 assert key[1]=='es' and key in current_by_key and key in apply_map
 live=current_by_key[key]; plan=apply_map[key]
 cur=live['currentTarget']; src=live['source']
 assert r['liveAttestedHead']=='2c5b7a5dcbe01707ac361e2d4ae06bf3681f99e2'
 assert r['source']==src and r['sourceHashLive']==sha(src)
 assert plan['source']==src and plan['sourceHash']==sha(src)
 assert plan['finalTarget']==cur and plan['finalTargetHash']==sha(cur)==live['currentTargetHash']
 assert r['finalTarget']==cur
 if r['decision']=='accept': assert r['proposedTargetLiveAttested']==cur and r['proposedTargetHashLiveAttested']==sha(cur)
 else: assert r['decision']=='refine' and r['finalTarget']==cur
 assert plan['reviewDecision']==r['decision'] and r['decision'] in {'accept','refine'}
 frozen[key]={'kind':'root-cross-review-and-applied-target','priorDecision':r['decision'],'root':r,'apply':plan}
 prior_records.append({'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'id':key[0],'locale':key[1],'sourceIdPosition':live['sourceIdPosition'],'source':src,'sourceHash':sha(src),'currentTarget':cur,'currentTargetHash':sha(cur),'priorWindow':'historical semantic-review window 600–649; historical index differs from current global en.json positions','priorRootReviewPath':ROOT_CROSS,'priorApplyPlanPath':APPLY,'priorRootDecision':r['decision'],'priorRootReview':r,'priorApplyPlan':plan,'exactCurrentTargetMatchesPriorFinal':True,'preservationReason':'The prior independent-root cross-review and exact-hash apply plan agree with the live current source and applied target; preserve the exact prior disposition.'})
for r in hold_rows:
 key=(r.get('id'),r.get('locale'))
 if key[0] not in set(ids): continue
 assert key[1]=='es' and key in current_by_key and key not in frozen
 live=current_by_key[key]; src=live['source']; cur=live['currentTarget']
 assert r['source']==src and r['sourceHash']==sha(src)
 assert r['currentTarget']==cur and r['currentTargetHashLive']==sha(cur)==live['currentTargetHash']
 assert r['liveAttestedHead']=='2c5b7a5dcbe01707ac361e2d4ae06bf3681f99e2'
 frozen[key]={'kind':'prior-hold','priorDecision':'hold','hold':r}
 prior_records.append({'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'id':key[0],'locale':key[1],'sourceIdPosition':live['sourceIdPosition'],'source':src,'sourceHash':sha(src),'currentTarget':cur,'currentTargetHash':sha(cur),'priorWindow':'historical semantic-review window 600–649; historical index differs from current global en.json positions','priorHoldPath':HOLDS,'priorRootDecision':'hold','priorHold':r,'exactCurrentTargetMatchesPriorHold':True,'preservationReason':'Preserve the exact prior hold because caller context did not resolve the singular/plural use; do not silently replace it with a new judgment.'})
assert len(frozen)==38 and len(prior_records)==38,(len(frozen),len(prior_records))
assert matched_ids=={k[0] for k in frozen},(sorted(matched_ids),sorted(k[0] for k in frozen))
assert len({x['id'] for x in prior_records})==38
# Assign preserved prior dispositions and construct final review inputs.
for row in base:
 key=(row['sourceId'],row['locale'])
 if key not in frozen: continue
 prior=frozen[key]
 row['decision']='preserved-prior-disposition'
 row['decisionRationale']=('Preserve the prior independent-root decision and exact applied target; source/current hashes still match at the pinned head.' if prior['priorDecision']!='hold' else 'Preserve the prior exact-hash hold; caller context did not resolve whether the singular source is a label or status, and no new disposition is substituted.')
 row['confidence']='high' if prior['priorDecision']!='hold' else 'moderate'
 row['semanticReviewPerformed']=False; row['routingDisposition']='preserved-prior-root-disposition'
 row['priorDispositionPreserved']=True; row['priorDispositionRef']=ROOT_CROSS+' + '+APPLY if prior['priorDecision']!='hold' else HOLDS
 row['priorRootDecision']=prior['priorDecision']; row['priorDispositionKind']=prior['kind']; row['priorEvidenceCurrentHashMatches']=True
 row['candidateKind']=None; row['proposedTarget']=None; row['proposedTargetHash']=None
# Rewrite initial arrays, excluding exactly 38 frozen exact-hash prior Spanish cells.
dumpjl(OUT/'primary-review-ledger.jsonl',base)
dumpjl(OUT/'preserved-prior-dispositions.jsonl',prior_records)
by_key={(r['id'],r['locale']):r for r in all_inputs}
all_out=[]; new=[]
for row in base:
 inp=by_key[(row['sourceId'],row['locale'])]
 inp['frozenPriorDisposition']=row['priorDispositionPreserved']
 inp['priorRootDecision']=row.get('priorRootDecision')
 all_out.append(inp)
 if not row['priorDispositionPreserved']: new.append(inp)
dumpjl(OUT/'review-input-all-cells.jsonl',all_out)
dumpjl(OUT/'review-input.jsonl',new)
assert len(new)==1162 and sum(x['locale'] in GROUPS['locale-a'] for x in new)==562
for name,locales in GROUPS.items():
 d=OUT/name; d.mkdir(exist_ok=True)
 rows=[x for x in new if x['locale'] in locales]
 dumpjl(d/'review-input.jsonl',rows)
 digest=sha((d/'review-input.jsonl').read_bytes())
 task={'schemaVersion':1,'task':'Primary semantic review; read-only exact-head localization evidence','repository':'snapetech-org/seerrng','pullRequest':418,'exactHead':HEAD,'exactTree':TREE,'worktree':W,'scope':{'sourcePositions':[1500,1599],'locales':locales,'assignedSemanticCells':len(rows),'sourceIds':100},'input':{'path':str(d/'review-input.jsonl'),'sha256':digest,'rows':len(rows)},'instructions':['Review every input row in the requested locale for meaning, grammar, naturalness, UI fit, and caller context; do not mark a cell corrected only to prefer another style.','Return one JSON object per row with keys id,sourceIdPosition,locale,source,sourceHash,currentTarget,currentTargetHash,targetFile,targetCatalogBlob,sourceContexts,exactHead,exactTree,disposition,recommendedTarget,recommendedTargetHash,rationale,confidence,inputAttestationMismatches.','Use accept-current, propose-correction, propose-refinement, or hold. For accept-current/hold set recommendedTarget and recommendedTargetHash to null. Every proposal must include exact replacement text and SHA-256 over exact UTF-8 text.','Keep placeholders, ICU syntax, markup, product names, and protected literals valid. Use caller-specific meaning when it resolves ambiguity; use hold when meaning cannot be confidently resolved.','Do not claim native-speaker approval or browser review. Do not edit repository/PR files, run tests/builds/scans/CI, or modify workflows.','Do not re-review or alter the 38 frozen prior Spanish dispositions; they are excluded from these inputs.']}
 dumpj(d/'task.json',task)
 (d/'README.md').write_text(f"# SeerrNG PR #418 W1500–1599 primary locale subpacket\n\n- Exact head `{HEAD}` / tree `{TREE}`.\n- Assigned locales: {', '.join(locales)}.\n- Semantic cells: {len(rows)} across 100 source IDs.\n- Input checksum: `{digest}`.\n- 38 exact prior Spanish decisions are preserved outside this review input.\n- Read-only semantic review; no repo edits or native-speaker signoff.\n",encoding='utf8')
 sums=['{}  {}'.format(sha((d/n).read_bytes()),n) for n in ['README.md','review-input.jsonl','task.json']]
 (d/'SHA256SUMS').write_text('\n'.join(sums)+'\n',encoding='utf8')
# Boundary record, including adjacent source/cell inventory and historical exact-ID dispositions.
boundary={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'head':HEAD,'tree':TREE,'sourceFile':'src/i18n/locale/en.json','sourceFileBlob':source_blob,'currentSourceKeyCount':len(entries),'currentWindow':{'startInclusive':1500,'endInclusive':1599,'sourceIds':ids,'sourceIdCount':100,'uniqueCount':len(set(ids))},'priorReviewedPositionCeiling':1499,'currentSourceSliceDisjointByPosition':True,'previousWindow':{'manifest':str(PREV/'manifest.json'),'sourceIdPositionRange':[1400,1499],'sourceContextRowsCompared':len(prev_context),'selectedLocaleCellsCompared':len(prev_cells),'mismatches':previous_mismatches,'checksumsVerified':True,'reattestedAfterApplicationAtHead':HEAD,'priorWindowAppliedRows':len(readback_map),'priorWindowChangedCurrentCells':previous_window_updated,'priorWindowUnchangedCurrentCells':previous_window_unchanged,'postApplyReadbackPath':READBACK},'priorEvidenceSearch':{'root':'docs/pr-evidence/pr418-localization-2026-11-02','trackedPaths':len(tracked),'jsonOrJsonlFilesParsed':parsed,'matchedEvidenceRows':matched_rows,'matchedSourceIds':sorted(matched_ids),'preservedCells':len(prior_records),'rootCrossReviewPath':ROOT_CROSS,'applyPlanPath':APPLY,'heldCellsPath':HOLDS,'result':'All 38 exact source-ID overlaps match prior Spanish root decisions and applied targets. The immediately previous W1400 source map and all 1,200 cells were re-attested after application at the current head; no row-map mismatches remain.'},'preservedPriorCells':prior_records,'preservedPriorDecisionCounts':dict(collections.Counter(x['priorRootDecision'] for x in prior_records)),'result':'pass'}
dumpj(OUT/'prior-disposition-boundary.json',boundary)
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf8'))
manifest.update({'callerReferences':sum(len(x['callers']) for x in readjl(OUT/'source-contexts.jsonl')),'uniqueCallerFiles':len({c['path'] for x in readjl(OUT/'source-contexts.jsonl') for c in x['callers']}),'uniqueCallerLines':len({(c['path'],c['line']) for x in readjl(OUT/'source-contexts.jsonl') for c in x['callers']}),'previousWindow':{'manifest':str(PREV/'manifest.json'),'sourceIdPositionRange':[1400,1499],'nonOverlapping':True,'sourceRowsCompared':100,'localeCellsCompared':1200,'mismatches':0,'reattestedAfterApplicationAtHead':HEAD,'appliedRows':len(readback_map),'changedCurrentCells':previous_window_updated,'unchangedCurrentCells':previous_window_unchanged,'postApplyReadbackPath':READBACK},'priorDispositionCellCount':len(prior_records),'priorDispositionSourceIds':sorted({r['id'] for r in prior_records}),'priorDispositionEvidence':'prior-disposition-boundary.json','priorDispositionTypes':dict(collections.Counter(x['priorRootDecision'] for x in prior_records)),'frozenPriorCells':len(prior_records),'semanticReviewInputRows':len(new),'sourceContextRows':100})
dumpj(OUT/'manifest.json',manifest)
summary=json.loads((OUT/'summary.json').read_text(encoding='utf8'))
summary.update({'task':'Primary semantic review for SeerrNG PR #418 source positions 1500–1599 across all 12 direct locales','sourceIdPositions':{'count':100,'startInclusive':1500,'stopExclusive':1600},'rowsReviewed':0,'priorDispositionCellsPreserved':len(prior_records),'newSemanticRows':len(new),'semanticReviewInputRows':len(new),'callerContextReferencesReattested':manifest['callerReferences'],'uniqueCallerFiles':manifest['uniqueCallerFiles'],'uniqueCallerLines':manifest['uniqueCallerLines'],'priorSourceIdIntersectionsPreserved':len(prior_records),'priorOverlaps':sorted({r['id'] for r in prior_records}),'priorDispositionTypes':dict(collections.Counter(x['priorRootDecision'] for x in prior_records)),'definitionOnlySourceIds':[x['sourceId'] for x in readjl(OUT/'source-contexts.jsonl') if x['usageStatus']!='found'],'definitionOnlyTargetCellCount':len([x for x in readjl(OUT/'source-contexts.jsonl') if x['usageStatus']!='found'])*12,'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'notes':['Source positions 1500–1599 use the exact insertion order of src/i18n/locale/en.json at the pinned head.','The previous W1400–1499 source inventory and all 1,200 prior cells were rechecked after its 450-row apply at this head with zero mismatches.','The full tracked PR evidence inventory was searched by source ID. Thirty-eight prior Spanish root-reviewed/applied decisions were exact-hash matched and frozen.','All 1,200 current/source values and caller pins were attested at exact head/tree; definition-only cases remain individually marked.','Machine-assisted semantic review only; native-speaker signoff and browser review are not claimed.']})
summary['primaryDispositions']={}; summary['candidateCount']=None; summary['countsByLocale']={}
dumpj(OUT/'summary.json',summary)
print(json.dumps({'head':HEAD,'tree':TREE,'sourceIds':len(ids),'cells':len(all_out),'semanticCells':len(new),'priorDispositionCells':len(prior_records),'priorDecisionCounts':dict(collections.Counter(x['priorRootDecision'] for x in prior_records)),'subpacketRows':{n:len([x for x in new if x['locale'] in ls]) for n,ls in GROUPS.items()},'definitionOnly':summary['definitionOnlySourceIds'],'callers':manifest['callerReferences'],'callerFiles':manifest['uniqueCallerFiles'],'callerLines':manifest['uniqueCallerLines'],'priorEvidencePaths':len(tracked),'priorEvidenceJsonFilesParsed':parsed,'matchedEvidenceRows':matched_rows,'result':'pass'},ensure_ascii=False,indent=2))
