import collections, hashlib, json, pathlib
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2700-2799-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
EVID=REPO/'docs/pr-evidence/pr418-localization-2026-11-02'
def sha(x):
 if isinstance(x,str): x=x.encode('utf-8')
 return hashlib.sha256(x).hexdigest()
def writej(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf8')
# Classify all seven protected-literal mismatch findings.
assessments=[
 {'sourcePosition':2704,'sourceId':'components.RequestList.RequestItem.olid','locale':'de','protectedLiteral':'Open Library','currentTarget':'Open-Library-ID','proposedTarget':'Open-Library-ID','determination':'overbroad-literal-rule','hold':False,'reason':'Keep the current target. Duden D146 calls for hyphens in compounds with multi-part names and gives “Rio-de-la-Plata-Bucht” as an example; Open-Library-ID follows that pattern. The checker’s exact-space requirement for “Open Library” is overbroad in German compounding; the translation itself is supported.'},
 {'sourcePosition':2757,'sourceId':'components.RequestModal.AdvancedRequester.binderyDefaults','locale':'hi','protectedLiteral':'Bindery','currentTarget':'बाइंडरी प्रोफ़ाइल, फ़ोल्डर और खोज के लिए अपने स्वयं के अधिग्रहण डिफ़ॉल्ट का उपयोग करता है।','proposedTarget':'Bindery प्रोफ़ाइल, फ़ोल्डर और खोज के लिए अपनी अलग डिफ़ॉल्ट अधिग्रहण सेटिंग्स इस्तेमाल करता है।','determination':'true-target-defect','hold':False,'reason':'The current transliterates the service name. Source caller code tests `selectedIsBindery` and conditionally presents this description for that service; retaining Bindery preserves which service the UI refers to. Not an overbroad literal rule.'},
 {'sourcePosition':2796,'sourceId':'components.RequestModal.Book.noEbookServer','locale':'hi','protectedLiteral':'Bookshelf','currentTarget':'कोई बुक बुकशेल्फ़ सेवा कॉन्फ़िगर नहीं की गई है. पुस्तक अनुरोध अनुपलब्ध हैं.','proposedTarget':'पुस्तकों के लिए कोई Bookshelf सेवा कॉन्फ़िगर नहीं है। पुस्तकों के अनुरोध उपलब्ध नहीं हैं।','determination':'true-target-defect','hold':False,'reason':'The source identifies the named Bookshelf service; the current transliterates the service brand and redundantly says book/bookshelf. The source caller is the missing-ebook-service message in the book request modal. Not an overbroad literal rule.'},
 {'sourcePosition':2796,'sourceId':'components.RequestModal.Book.noEbookServer','locale':'vi','protectedLiteral':'Bookshelf','currentTarget':'Không có dịch vụ Giá sách Sách nào được định cấu hình. Yêu cầu sách không có sẵn.','proposedTarget':'Chưa cấu hình dịch vụ Bookshelf cho sách. Yêu cầu sách không khả dụng.','determination':'true-target-defect','hold':False,'reason':'The current translates the named Bookshelf service as “bookshelf” and repeats the generic book noun. The source caller selects this message for a missing ebook service in the book request modal. Not an overbroad literal rule.'},
 {'sourcePosition':2797,'sourceId':'components.RequestModal.Book.noIsbnCandidates','locale':'ja','protectedLiteral':'Bookshelf','currentTarget':'有効な ISBN 候補が見つかりませんでした。本棚はタイトル マッチングに戻ります。','proposedTarget':'有効な ISBN 候補が見つかりませんでした。Bookshelfはタイトルとの照合に切り替えます。','determination':'true-target-defect','hold':False,'reason':'The source names Bookshelf as the service that switches to title matching; the current 本棚 means a physical shelf and loses the service identity. Not an overbroad literal rule.'},
 {'sourcePosition':2797,'sourceId':'components.RequestModal.Book.noIsbnCandidates','locale':'pt_BR','protectedLiteral':'Bookshelf','currentTarget':'Nenhum candidato válido a ISBN foi encontrado. A estante voltará à correspondência de títulos.','proposedTarget':'Nenhum candidato válido a ISBN foi encontrado. O Bookshelf usará a correspondência por título como alternativa.','determination':'true-target-defect','hold':False,'reason':'The source names the Bookshelf service; the current translates it as estante and makes the service itself appear to be a physical shelf. Not an overbroad literal rule.'},
 {'sourcePosition':2797,'sourceId':'components.RequestModal.Book.noIsbnCandidates','locale':'vi','protectedLiteral':'Bookshelf','currentTarget':'Không tìm thấy ứng cử viên ISBN hợp lệ nào. Giá sách sẽ quay lại khớp tiêu đề.','proposedTarget':'Không tìm thấy ứng viên ISBN hợp lệ nào. Bookshelf sẽ chuyển sang đối sánh theo tiêu đề.','determination':'true-target-defect','hold':False,'reason':'The source names the Bookshelf service; the current translates it as Giá sách (“bookshelf”) and says it “returns” to title matching. The proposal preserves the service identity and describes the fallback. Not an overbroad literal rule.'}
]
# Attach exact source row, caller context, and the relevant caller pin set to every finding.
ctx_by_id={json.loads(line)['sourceId']:json.loads(line) for line in (OUT/'caller-contexts.jsonl').read_text(encoding='utf8').splitlines() if line}
cells={(r['sourcePosition'],r['locale']):r for r in (json.loads(line) for line in (OUT/'source-current-cells.jsonl').read_text(encoding='utf8').splitlines() if line)}
for a in assessments:
 c=cells[(a['sourcePosition'],a['locale'])]; ctx=ctx_by_id[a['sourceId']]
 a.update({'source':c['source'],'sourceHash':c['sourceHash'],'currentTargetHash':c['currentTargetHash'],
  'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],
  'callerPaths':ctx['callerPaths'],'callerUseStatus':ctx['callerUseStatus'],
  'callerLineReferences':[{'file':r['file'],'line':r['line'],'lineSha256':r['lineSha256'],'lineText':r['lineText']} for r in ctx['pinnedLineRefs']],
  'externalEvidenceRefs':['duden_name_compound','openlibrary'] if a['locale']=='de' else []})
writej(OUT/'protected-literal-assessment.json',{'schemaVersion':1,'count':len(assessments),
 'trueTargetDefects':sum(a['determination']=='true-target-defect' for a in assessments),
 'overbroadLiteralRules':sum(a['determination']=='overbroad-literal-rule' for a in assessments),
 'holds':sum(a['hold'] for a in assessments),'allCasesClassified':len(assessments)==7 and all(a['determination'] in {'true-target-defect','overbroad-literal-rule'} and not a['hold'] for a in assessments),
 'assessments':assessments})
# Attach assessments to the main summary and structural validation packet.
summary=json.loads((OUT/'summary.json').read_text(encoding='utf8'))
summary['protectedLiteralMismatchDetails']=[{**a,'missing':[a['protectedLiteral']]} for a in assessments]
summary['protectedLiteralAssessments']={'total':len(assessments),'trueTargetDefects':sum(a['determination']=='true-target-defect' for a in assessments),'overbroadRuleCases':sum(a['determination']=='overbroad-literal-rule' for a in assessments),'holds':sum(a['hold'] for a in assessments),'assessmentFile':'protected-literal-assessment.json'}
summary['protectedLiteralTrueTargetDefectCount']=sum(a['determination']=='true-target-defect' for a in assessments)
summary['protectedLiteralOverbroadRuleCount']=sum(a['determination']=='overbroad-literal-rule' for a in assessments)
writej(OUT/'summary.json',summary)
validation=json.loads((OUT/'structural-validation.json').read_text(encoding='utf8'))
validation['protectedLiteralMismatchAssessments']=assessments
validation['checks'].pop('allFinalProtectedLiteralsExact',None)
validation['checks']['allFinalProtectedLiteralsExactOrDocumentedLocaleException']=summary['protectedLiteralMismatchCellsFinal']==0 and summary.get('protectedLiteralRuleRawMissesFinal')==1 and summary.get('protectedLiteralLocaleExceptionCells')==1
validation['checks']['allSevenProtectedLiteralMismatchesClassified']=len(assessments)==7 and all(a['determination'] in {'true-target-defect','overbroad-literal-rule'} and not a['hold'] for a in assessments)
validation['checks']['allSixTrueTargetDefectsCorrected']=summary['protectedLiteralTrueTargetDefectCount']==6 and all(a['proposedTarget']!=a['currentTarget'] for a in assessments if a['determination']=='true-target-defect')
writej(OUT/'structural-validation.json',validation)
# Index every prior JSONL record set in the Seerr localization evidence root with positions <= W2699.
files=[]; primary_refs=[]; any_positions=collections.Counter(); primary_positions=collections.Counter(); row_ref_count=0
position_keys=('sourcePosition','sourceIdPosition','position','sourceIndex','catalogPosition')
primary_name_tokens=('primary-ledger','primary-review-ledger','primary-review-corrections','primary-0500','primary-0600','semantic-review-ledger')
for p in sorted(EVID.rglob('*.jsonl')):
 raw=p.read_bytes()
 lines=raw.decode('utf-8').splitlines()
 scoped=[]; primaryfile=any(tok in str(p).lower() for tok in primary_name_tokens)
 dispositions=collections.defaultdict(collections.Counter); locales=collections.Counter(); ids=set(); all_line_count=0
 for line_no,line in enumerate(lines,1):
  if not line.strip(): continue
  row=json.loads(line); all_line_count+=1
  pos=next((row.get(k) for k in position_keys if isinstance(row.get(k),int)),None)
  if pos is None or not (0<=pos<=2699): continue
  any_positions[pos]+=1
  sid=row.get('sourceId') or row.get('id')
  if sid: ids.add(sid)
  loc=row.get('locale')
  if loc: locales[loc]+=1
  dispfields={k:v for k,v in row.items() if ('disposition' in k.lower() or k in {'status','decision','primaryDecision','independentVerdict','applicationAction','crossReviewOutcome'}) and isinstance(v,(str,int,bool))}
  for k,v in dispfields.items(): dispositions[k][str(v)]+=1
  scoped.append({'line':line_no,'position':pos,'sourceId':sid,'locale':loc})
  if primaryfile:
   primary_positions[pos]+=1
   primary_refs.append({'path':p.relative_to(REPO).as_posix(),'line':line_no,'sourcePosition':pos,'sourceId':sid,'locale':loc,
      'rowSha256':sha(line.encode('utf-8')),'sourceHash':row.get('sourceHash'),'sourceTextSha256':row.get('sourceTextSha256'),
      'currentTargetHash':row.get('currentTargetHash'),'candidateTargetHash':row.get('candidateTargetHash') or row.get('proposedTargetHash'),
      'finalTargetHash':row.get('finalTargetHash'),'dispositionFields':dispfields})
 if scoped:
  files.append({'path':p.relative_to(REPO).as_posix(),'sha256':sha(raw),'bytes':len(raw),'jsonlRows':all_line_count,
    'rowsAtPositions0To2699':len(scoped),'minPosition':min(x['position'] for x in scoped),'maxPosition':max(x['position'] for x in scoped),
    'uniqueSourceIds':len(ids),'localeRowCounts':dict(sorted(locales.items())),
    'dispositionValueCounts':{k:dict(v) for k,v in sorted(dispositions.items())},
    'primaryDispositionLedgerFile':primaryfile})
gaps_primary=[x for x in range(2700) if not primary_positions[x]]
gaps_evidence=[x for x in range(2700) if not any_positions[x]]
idx={'schemaVersion':1,'repository':'snapetech-org/SeerrNG','pullRequest':418,'inputHead':'6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118','inputTree':'44cf1a02d645026872759fa04a7506ee738381e5',
 'scope':{'priorSourcePositionsThroughInclusive':2699,'newWindow':[2700,2799]},
 'preservationStatement':'No earlier repository evidence file was modified. This index preserves the exact hashes and line-level row identities of the historical primary ledger files and content-addresses every JSONL evidence file with rows through W2699. Records are indexed by sourcePosition/sourceIdPosition/position/sourceIndex/catalogPosition, whichever is present. Repeated evidence rows are intentionally not deduplicated.',
 'coverage':{'priorEvidenceFilesIndexed':len(files),'allIndexedRowsThroughW2699IncludingRepeats':sum(f['rowsAtPositions0To2699'] for f in files),
   'primaryLedgerRowRefs':len(primary_refs),'primaryLedgerPositionsRepresented':len(primary_positions),'primaryLedgerMissingPositions':gaps_primary,
   'anyPriorEvidencePositionsRepresented':len(any_positions),'positionsWithNoPriorJsonlEvidence':gaps_evidence,
   'note':'Coverage gaps identify absent indexed records, not assumed decisions. No missing disposition was inferred or carried forward.'},
 'evidenceFileManifest':files,'priorPrimaryDispositionRowRefs':primary_refs,
 'previousWindowPacket':{'path':'docs/pr-evidence/pr418-localization-2026-11-02/window-2600-2699/primary',
   'referenceFiles':json.loads((OUT/'prior-history-through-W2699.json').read_text())['previousWindowPacketRefs']},
 'newWindowPriorLookup':{'path':'prior-disposition-boundary.json','sha256':sha((OUT/'prior-disposition-boundary.json').read_bytes()),
   'matchingRows':1200,'exactLivePriorDispositions':0,'reviewRequiredMatches':1190,'reuseEquivalenceCandidates':10}}
writej(OUT/'prior-disposition-history-index.json',idx)
prior=json.loads((OUT/'prior-history-through-W2699.json').read_text(encoding='utf8'))
prior['historyIndex']={'path':'prior-disposition-history-index.json','sha256':sha((OUT/'prior-disposition-history-index.json').read_bytes()),'bytes':(OUT/'prior-disposition-history-index.json').stat().st_size,
  'indexedFiles':len(files),'indexedRowsThroughW2699IncludingRepeatEvidence':sum(f['rowsAtPositions0To2699'] for f in files),
  'primaryDispositionRowRefs':len(primary_refs),'primaryLedgerPositionsRepresented':len(primary_positions),'primaryLedgerMissingPositions':gaps_primary,
  'positionsWithNoPriorJsonlEvidence':gaps_evidence}
writej(OUT/'prior-history-through-W2699.json',prior)
# Refresh compact final README. The full review evidence remains in the ledgers above.
reads=json.loads((OUT/'live-localization-prs-end.json').read_text(encoding='utf8'))
prlines='\n'.join(f"- {r['repository']} PR #{r['pullRequest']}: `{r['head']}` (tree `{r['tree']}`), {r['currentCatalogFileCount']} catalog paths." for r in reads['pullRequests'])
README=f'''# SeerrNG PR #418 primary localization review — W2700–W2799

## Exact input and scope

- Live PR: {reads['pullRequests'][3]['url']}
- Exact head: `{reads['seerrSourceAndLocaleCatalogContent'][0]['blob'] and '6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118'}`
- Exact tree: `44cf1a02d645026872759fa04a7506ee738381e5`
- Source catalog blob (`src/i18n/locale/en.json`): `{reads['seerrSourceAndLocaleCatalogContent'][0]['blob']}`; SHA-256 `{reads['seerrSourceAndLocaleCatalogContent'][0]['sha256']}`.
- Window: source positions 2700–2799, 100 source IDs, 12 locales, 1,200 reviewed cells.
- Boundaries: W2699 `components.RequestList.RequestItem.mapTvSeasons` (“Map TV seasons”); W2700 `components.RequestList.RequestItem.mbid` (“MusicBrainz ID”); W2799 `components.RequestModal.Book.pages` (“Pages”); W2800 `components.RequestModal.Book.pendingRequestFormat` (“Pending {{format}} Request”).

## Review result

- Primary dispositions: {json.dumps(summary['dispositions'],ensure_ascii=False)}.
- Candidate edits: {len(json.loads((OUT/'candidate-proposals.jsonl').read_text(encoding='utf8').splitlines()[0]) if False else '{}')}.
- Placeholder and markup mismatches in the source/current pair: {summary['placeholderMismatchesCurrent']} and {summary['markupMismatchesCurrent']}; in proposed final targets: {summary['placeholderMismatchesFinal']} and {summary['markupMismatchesFinal']}.
- ICU cells checked: {summary['icuCheckedCells']}; invalid profiles: {summary['icuInvalidCells']}.
- Spanish: {summary['spanishRows']} cells reviewed; {summary['spanishDirectAddressRows']} direct-address entries are formal `usted`; none are informal. Neutral/label entries are marked not applicable.
- Protected-literal checker mismatches: seven total, six true target defects and one overbroad exact-string rule; no cases are held. Keep German `Open-Library-ID`: [Duden D146](https://www.duden.de/sprachwissen/rechtschreibregeln/namen) gives `Rio-de-la-Plata-Bucht` as an example of hyphenating a compound with a multi-part name, supporting this German compound. The six corrected defects are Hindi Bindery transliteration; Hindi and Vietnamese Bookshelf-service translations at W2796; Japanese, Brazilian Portuguese, and Vietnamese Bookshelf translations at W2797. See `protected-literal-assessment.json` and `summary.json`.
- Native-speaker signoff is outstanding; none is claimed.

## Caller and catalog pins

- 100/100 source IDs have exact-head caller-context rows, 472 caller line references across six files. All caller file blobs, line hashes, and adjacent text were rechecked at the exact head/tree. The caller search is targeted to the source group and does not claim a complete runtime call graph.
- All 13 English/locale catalog blob IDs and content SHA-256 values were rechecked at the exact head. `live-localization-prs-end.json` also contains a current seven-PR head/tree and catalog-path snapshot.
- Seven-PR current snapshot:
{prlines}

## Prior history and boundaries

- `prior-disposition-history-index.json` hashes every prior JSONL evidence file with rows through W2699 and records line-level hashes for the historical primary disposition rows. It does not copy or rewrite repository evidence. Prior primary ledgers cover 2,500 source positions and have no primary ledger entries for positions 100–299; the broader index records 135 positions with no prior JSONL evidence. Missing positions are listed explicitly; no decision is inferred for gaps.
- The previous W2600–W2699 packet is preserved by path and SHA-256 in `prior-history-through-W2699.json`. The selected-window prior audit found 1,200 same-source lookup records: 1,190 still review-required, 10 equivalence candidates, and zero exact live prior dispositions reused.
- The window begins immediately after W2699 and ends immediately before W2800.

## Evidence and operational boundary

- `source-current-cells.jsonl`, `caller-contexts.jsonl`, and the manifest pin the exact input values; `primary-review-ledger.jsonl` contains all 1,200 cell decisions, with exact hashes, rationale, caller refs, and placeholder/markup/protected-literal checks.
- `candidate-proposals.jsonl` contains each material correction/refinement and source references. `candidate-targets.json` is the complete proposed value matrix.
- Material language claims have linked authoritative sources in `language-sources.json` (RAE, Taiwan Ministry of Education dictionary, MusicBrainz and Open Library official sites, and relevant national-language references).
- This packet is sealed in task-scoped scratch. No repository or PR files were edited; no project tests, builds, security scans, CI jobs, browser sessions, commits, pushes, or releases were run for this subtask.
'''
# Fix values best computed directly.
proposal_count=sum(1 for x in (OUT/'candidate-proposals.jsonl').read_text(encoding='utf8').splitlines() if x)
README=README.replace(f"- Candidate edits: {len(json.loads((OUT/'candidate-proposals.jsonl').read_text(encoding='utf8').splitlines()[0]) if False else '{}')}.",f'- Candidate edits: {proposal_count} proposed corrections/refinements.')
(OUT/'README.md').write_text(README,encoding='utf8')
print(json.dumps({'protectedLiteralAssessments':len(assessments),'priorEvidenceFilesIndexed':len(files),'priorEvidenceRowsWithRepeats':sum(f['rowsAtPositions0To2699'] for f in files),'primaryDispositionRowRefs':len(primary_refs),'primaryLedgerPositionsRepresented':len(primary_positions),'primaryLedgerMissingPositions':gaps_primary,'positionsWithNoPriorJsonlEvidence':gaps_evidence,'proposalCount':proposal_count},ensure_ascii=False,indent=2))
