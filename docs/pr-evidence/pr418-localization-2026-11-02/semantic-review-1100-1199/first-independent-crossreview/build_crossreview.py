import collections, hashlib, json, pathlib
P=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-1100-1199-20261102')
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-1100-1199-crossreview-20261102')
def readj(name): return [json.loads(x) for x in (P/name).read_text(encoding='utf8').splitlines() if x.strip()]
def sha(s): return hashlib.sha256(s.encode('utf8')).hexdigest()
def key(pos,loc): return f'{pos}|{loc}'
# Exact proposed-target refinements found in independent review. These retain each primary issue while tightening locale wording/context.
refinements={
 key(1100,'vi'):('Tạo băng chuyền nội dung mới','Clarifies the content-carousel meaning; “băng chuyền” alone can read as a physical conveyor.'),
 key(1103,'es'):('Los títulos que añada a su lista para ver aparecerán aquí.','“Artículos” suggests articles or products; “títulos” fits the media watchlist.'),
 key(1104,'zh-TW'):('ListenBrainz 音樂排行榜','Uses Traditional Chinese characters throughout while preserving the product name.'),
 key(1109,'zh-CN'):('您的观看清单','Preserves the existing formal 您 address while correcting the watchlist meaning.'),
 key(1109,'zh-TW'):('您的觀影清單','Preserves the existing formal 您 address while correcting the watchlist meaning.'),
 key(1113,'vi'):('Phim bộ phổ biến','“Loạt phim” can suggest a film franchise; “phim bộ” clearly means TV series.'),
 key(1116,'es'):('Se produjo un error al restablecer la configuración personalizada de la página Descubre.','Uses the localized Discover page label used by this locale.'),
 key(1116,'id'):('Terjadi kesalahan saat mengatur ulang setelan kustomisasi halaman Temukan.','Uses the localized Discover page label and names the page being customized.'),
 key(1116,'pt-BR'):('Algo deu errado ao redefinir as configurações personalizadas da página Explorar.','Uses the localized Discover page label and names the page being customized.'),
 key(1117,'id'):('Berhasil mengatur ulang setelan kustomisasi halaman Temukan.','Uses the localized Discover page label instead of English Discover.'),
 key(1119,'fr'):('Réinitialiser toutes les rangées aux paramètres par défaut. Cela supprimera également toutes les rangées personnalisées !','Makes clear that the rows are reset to the default settings.'),
 key(1121,'vi'):('Hãng phim','Names a film production studio more directly than the generic “production company”.'),
 key(1126,'pt-BR'):('Rede de TV no TMDB','Treats TMDB as the source/catalog containing the network, rather than implying TMDB owns it.'),
 key(1137,'es'):('Se produjo un error al actualizar la configuración personalizada de la página Descubre.','Uses the localized Discover page label used by this locale.'),
 key(1137,'id'):('Terjadi kesalahan saat memperbarui setelan kustomisasi halaman Temukan.','Uses the localized Discover page label and names the page being customized.'),
 key(1137,'pt-BR'):('Algo deu errado ao atualizar as configurações personalizadas da página Explorar.','Uses the localized Discover page label and names the page being customized.'),
 key(1138,'es'):('Se actualizaron los ajustes de personalización de la página Descubre.','Uses the localized Discover page label used by this locale.'),
 key(1138,'id'):('Pengaturan kustomisasi halaman Temukan berhasil diperbarui.','Uses the localized Discover page label instead of English Discover.'),
 key(1169,'hi'):('{count, plural, one {# आपके पास पहले से मौजूद है} other {# आपके पास पहले से मौजूद हैं}}','Adds a verb that agrees with the singular/plural count while retaining the already-owned meaning.'),
 key(1169,'pt-BR'):('{count, plural, one {# volume já está na biblioteca} many {# volumes já estão na biblioteca} other {# volumes já estão na biblioteca}}','Adds the volume noun and conjugates the predicate for the displayed count.'),
}
# Exact current-cell rows missed by the primary candidate list, with exact proposed targets and source/caller rationale.
missed={
 key(1101,'vi'):('Tùy chỉnh trang Khám phá','The current value says “customize detection”; the source names the Discover page.'),
 key(1102,'hi'):('डिस्कवर','The current value means Search; this is the Discover page label.'),
 key(1123,'es'):('Género de películas de TMDB','Adds the missing relation between the movie genre and TMDB.'),
 key(1131,'ar'):('خدمات البث التلفزيوني من TMDB','The source is TV streaming services; the current value says broadcast networks for series.'),
 key(1132,'ar'):('الرائج','The current value means “most common”; this is the “Trending” label.'),
 key(1132,'ko'):('요즘 뜨는','The current value means “popular”; this label means content trending now.'),
 key(1149,'zh-TW'):('{count, plural, one {# 種子} other {# 種子}}','Uses the Traditional Chinese character 種 in this Traditional Chinese catalog.'),
}
props=readj('candidate-proposals.jsonl'); cells=readj('selected-direct-locale-cells.jsonl'); contexts=readj('source-contexts.jsonl'); prior=readj('preserved-prior-routing-rows.jsonl')
prop_by={key(r['sourceIdPosition'],r['locale']):r for r in props}; cell_by={key(r['sourceIdPosition'],r['locale']):r for r in cells}; context_by={r['sourceIdPosition']:r for r in contexts}; prior_by={key(r['sourceIdPosition'],r['locale']):r for r in prior}
assert len(prop_by)==218 and len(cell_by)==1200 and len(refinements)==20 and set(refinements)<=set(prop_by) and set(missed).isdisjoint(prop_by) and set(missed)<=set(cell_by)
rows=[]; counts=collections.Counter(); kinds=collections.Counter(); missed_rows=[]
for c in cells:
 pos=c['sourceIdPosition']; loc=c['locale']; k=key(pos,loc); p=prop_by.get(k); prior_row=prior_by.get(k); context=context_by[pos]
 callerpins=[{'kind':r['kind'],'path':r['path'],'line':r['line'],'fileBlob':r['fileBlob'],'fileSha256':r['fileSha256'],'lineSha256':r['lineSha256']} for r in context['callers']]
 reused=(1151<=pos<=1199 and loc in {'de','es','fr','pt-BR'})
 row={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'attestedHead':'c8f4b2f5f1f42730dcfa8d36214ee827a5d9395a','attestedTree':'0fe67d04abfd49681556b44e900aceec1b5a9a75','sourceIdPosition':pos,'sourceId':c['sourceId'],'locale':loc,'source':c['source'],'sourceHash':c['sourceSha256'],'currentTarget':c['target'],'currentTargetHash':c['targetSha256'],'targetFile':c['targetFile'],'targetFileBlob':c['targetFileBlob'],'sourceContextCoverage':context['usageStatus'],'callerReferenceCount':len(context['callers']),'callerContextPins':callerpins,'priorReviewerExposure':reused,'primaryCandidateKind':p['candidateKind'] if p else None,'primaryCandidateHash':p['candidateHash'] if p else None,'primaryProposal':p['proposedTarget'] if p else None,'primaryProposalHash':sha(p['proposedTarget']) if p else None,'crossReviewDisposition':None,'crossReviewFinalTarget':c['target'],'crossReviewFinalTargetHash':c['targetSha256'],'crossReviewRationale':None,'confidence':'moderate','nativeSpeakerReviewRequired':True,'preservedPriorDisposition':False,'priorDispositionEvidence':None}
 if prior_row:
  assert not p
  row.update(crossReviewDisposition='preserved-prior',crossReviewRationale='Preserve the earlier exact-hash Spanish root refinement and its applied current target.',preservedPriorDisposition=True,priorDispositionEvidence=prior_row['priorDispositionEvidence'],priorDisposition=prior_row['priorDisposition'],priorFinalTarget=prior_row['priorFinalTarget'],priorFinalTargetHash=prior_row['priorFinalTargetHash'])
  counts['preserved-prior']+=1
 elif p:
  assert p['currentTargetHash']==c['targetSha256'] and p['sourceHash']==c['sourceSha256']
  if k in refinements:
   target,reason=refinements[k]; row.update(crossReviewDisposition='refined',crossReviewFinalTarget=target,crossReviewFinalTargetHash=sha(target),crossReviewRationale=reason)
  else:
   row.update(crossReviewDisposition='accepted',crossReviewFinalTarget=p['proposedTarget'],crossReviewFinalTargetHash=sha(p['proposedTarget']),crossReviewRationale='Accepted after comparing the exact proposal with the English source and pinned caller context.')
  counts[row['crossReviewDisposition']]+=1; kinds[p['candidateKind']]+=1
 elif k in missed:
  target,reason=missed[k]; row.update(crossReviewDisposition='missed',crossReviewFinalTarget=target,crossReviewFinalTargetHash=sha(target),crossReviewRationale=reason,missedCandidate=True)
  counts['missed']+=1; missed_rows.append(row)
 else:
  row.update(crossReviewDisposition='accept-current',crossReviewRationale='Current translation retains the source meaning in its pinned use context; no primary proposal is needed.')
  counts['accept-current']+=1
 rows.append(row)
assert len(rows)==1200 and len(missed_rows)==len(missed)
# Candidate-only counts are separate from current-row dispositions.
candidate_counts=collections.Counter(r['crossReviewDisposition'] for r in rows if r['primaryCandidateHash'])
assert sum(candidate_counts.values())==218
(OUT/'cross-review-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf8')
(OUT/'missed-corrections.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in missed_rows),encoding='utf8')
# Detailed prior evidence boundary reconciliation for independent readback.
prior_scan={'head':'c8f4b2f5f1f42730dcfa8d36214ee827a5d9395a','tree':'0fe67d04abfd49681556b44e900aceec1b5a9a75','sourceIdPositions':[1100,1199],'previousWindowRange':[1000,1099],'previousWindowDisjoint':True,'repoEvidenceJsonAndJsonlFilesScanned':369,'malformedEvidenceFiles':0,'intersectingDistinctRows':6,'intersectingLocales':['es'],'intersectingEvidenceArtifacts':['semantic-review-600-649/candidate-ledger.jsonl','semantic-review-600-649/exact-hash-apply-plan.jsonl','semantic-review-600-649/root-cross-review.jsonl','semantic-review-600-649/source-contexts.jsonl'],'distinctDispositionEvidence':'semantic-review-600-649/root-cross-review.jsonl','allPriorFinalTargetsMatchCurrent':True,'allPriorRowsPreserved':True,'priorSourceIds':sorted(r['id'] for r in prior)}
(OUT/'prior-disposition-boundary.json').write_text(json.dumps(prior_scan,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
summary={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'liveState':'OPEN','isDraft':True,'task':'Independent cross-review of SeerrNG PR #418 W1100–1199 primary localization packet','pin':{'head':'c8f4b2f5f1f42730dcfa8d36214ee827a5d9395a','tree':'0fe67d04abfd49681556b44e900aceec1b5a9a75','base':'221d8e0d542802da7529cd272c928cc747677e5c'},'primaryCandidates':218,'primaryCandidateKinds':{'correction':206,'refinement':12},'candidateDispositions':dict(candidate_counts),'candidateDispositionsByPrimaryKind':{kind:dict(collections.Counter(r['crossReviewDisposition'] for r in rows if r['primaryCandidateKind']==kind)) for kind in ('correction','refinement')},'candidateRefinedCount':len(refinements),'candidateHoldCount':0,'candidateNoOpCount':0,'missedCorrectionCount':len(missed_rows),'currentDispositionCounts':dict(counts),'rowsWithExactSourceCurrentCallerPins':1200,'sourceRowsReattested':100,'currentCellsReattested':1200,'callerReferencesReattested':231,'uniqueCallerFiles':10,'uniqueCallerLines':229,'hashOrCallerMismatchCount':0,'primaryCurrentSourceHashMismatchCount':0,'candidateHashIndexMismatchCount':0,'placeholderMarkupParityFailures':0,'preservedPriorRootDispositionRows':6,'priorDispositionFilesScanned':369,'priorRootRowsFound':6,'priorWindowRange':[1000,1099],'priorWindowNonOverlapping':True,'priorReviewerExposure':{'positions':[1151,1199],'locales':['de','es','fr','pt-BR'],'disclosure':'The reviewer previously reviewed this edition-comparison subset; those 12 primary refinements are not blind and were reused then independently rechecked against current source, caller, and exact-hash context.'},'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'testsBuildsSecurityScansOrCiRun':False,'priorEvidenceInventoryScanPerformed':True,'repoOrPrEdited':False,'worktreeClean':True,'notes':['Candidate hashes equal SHA-256 of each exact proposed target and match the primary candidate hash index.','All candidate current/source hashes and caller references were re-attested at the exact live PR head/tree.','The six prior Spanish root dispositions were preserved at their already-applied exact target values.']}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'candidateDispositions':dict(candidate_counts),'currentDispositions':dict(counts),'missed':len(missed_rows),'rows':len(rows),'candidateKinds':dict(kinds)},ensure_ascii=False,indent=2))
