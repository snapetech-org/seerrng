import hashlib,json,pathlib,collections,datetime,re
R=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3420-3439-primary-20261103')
I=R/'candidate-free-input'; O=R/'primary-review'
def h(b): return hashlib.sha256(b).hexdigest()
def hs(s): return h(s.encode('utf-8'))
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl_bytes(p):
 b=p.read_bytes().splitlines(); return [json.loads(x) for x in b], [h(x) for x in b]
def canon(x): return json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True)
assert {x.name for x in O.iterdir()} <= {'build_review.py'}
# Review strictly from candidate-free packet.
window=j(I/'window.json'); manifest=j(I/'PR-attestation.json'); locale_order=window['localeOrder']
source_rows,_=jl_bytes(I/'source-cells.jsonl'); cells,_=jl_bytes(I/'current-target-cells.jsonl')
caller_rows,caller_row_hashes=jl_bytes(I/'caller-contexts.jsonl')
C={(x['position'],x['locale']):x for x in cells}; S={x['position']:x for x in source_rows}; CR={x['position']:x for x in caller_rows}; CRH={x['position']:h for x,h in zip(caller_rows,caller_row_hashes)}
assert len(C)==240 and len(S)==20 and len(CRH)==20
assert all(x['placeholderTokenSetMatchesSource'] for x in cells)
locale_order=window['localeOrder']
# Context-grounded recommendation rules. Keys 3421 and 3423 lack a production caller in the pinned scan and remain held.
HOLD_POS={3421:'The exact source key is present only as a message definition; no production direct reference or dynamic label mapping was resolved in the pinned Requests component. Hold pending caller identification.',3423:'The exact source key is present only as a message definition; no production direct reference or dynamic label mapping was resolved in the pinned Requests component. Hold pending caller identification.'}
PROPOSALS={
 (3431,'id'):('refinement','Urutkan berdasarkan','“Urutkan berdasarkan” is the standard concise Indonesian UI phrasing for a sort control. The current “Urut menurut” is understandable but stilted in this section heading.'),
 (3434,'ja'):('refinement','初版発行','The caller uses this sort label for book/audiobook and comic publication dates. “初版発行” is more specific to first publication than “初公開,” which suggests an initial public release.'),
 (3434,'pt_BR'):('correction','Primeira publicação','This is a book/comic sort label. The current masculine participle “Primeiro Publicado” is an awkward literal UI label; “Primeira publicação” is the natural noun phrase.'),
 (3434,'ko'):('correction','최초 출판','The caller uses this label for book/audiobook and comic publication dates. “게시” means posting, so the current wording can suggest an online post; “출판” restores publication meaning.')}
POSITION_RATIONALE={
 3420:'Used as a request lifecycle status. The current translation clearly describes an active searching state.',
 3422:'Used as the TV-series media type and filter. The current translation identifies series/TV shows in the locale.',
 3424:'Displayed before the configured provider name. The current translation labels the service/provider field.',
 3425:'Shown before an inline Books/Audiobooks format badge. The current fragment introduces the requests displayed for that format.',
 3426:'Formats completed and total media sizes. The current translation preserves both named values; locale-appropriate placeholder reordering is acceptable.',
 3427:'Sort option for requests by added date. The current label means date.',
 3428:'Music sort option. The current label means artist/performer.',
 3429:'Accessible sort-direction label paired with an upward direction. The current translation denotes ascending order.',
 3430:'Book/audiobook sort option. The current label means author.',
 3431:'Section heading for sort controls. The current translations are clear except the Indonesian wording proposed for refinement.',
 3432:'Accessible sort-direction label paired with a downward direction. The current translation denotes descending order.',
 3433:'Movie/TV sort option. The current label means director.',
 3434:'Book/audiobook and comic sort option for first publication date. Locale-specific proposed refinements clarify or naturalize this date label.',
 3435:'Common request sort option. The current translation means last modified.',
 3436:'Book/audiobook and comic sort option. The current label means publisher.',
 3437:'Movie/TV sort option. The current label denotes a rating/evaluation value.',
 3438:'Movie/TV/music sort option. The current label denotes release date.',
 3439:'Common request sort option. The current label means status.'}
# Simple structural token extractors for this window's source text and labels.
placeholder_re=re.compile(r'\{([A-Za-z_][A-Za-z0-9_]*)\}')
markup_re=re.compile(r'</?[A-Za-z][^>]*>')
numeric_re=re.compile(r'(?<!\w)\d+(?:[.,]\d+)*(?!\w)')
protected=['Seerr','ChaptarrNG','Bindery','Bookshelf','Radarr','Sonarr','Plex','Emby','Jellyfin','TMDb','IMDb','Open Library','ComicVine','MusicBrainz','TheTVDB','Trakt','Letterboxd','Prowlarr','Bazarr','Lidarr','Readarr','Whisparr','Sportarr','Audiobookshelf']
def edge_ws(s): return [len(s)-len(s.lstrip()),len(s)-len(s.rstrip())]
rows=[]
for key in sorted(C):
 c=C[key]; p=S[c['position']]; caller=CR[c['position']]
 assert c['sourceId']==p['sourceId'] and c['sourceSha256']==p['sourceSha256']
 assert c['head']==manifest['head'] and c['tree']==manifest['commitTree']
 assert c['currentTargetSha256']==hs(c['currentTarget'])
 hold=c['position'] in HOLD_POS
 prop=PROPOSALS.get(key)
 if hold: verdict='hold'; target=c['currentTarget']; proposed=None; rationale=HOLD_POS[c['position']]; confidence='high'
 elif prop:
  verdict,proposed,rationale=prop; target=proposed; confidence='moderate'
 else:
  verdict='accept-current'; proposed=None; target=c['currentTarget']; rationale=POSITION_RATIONALE[c['position']]; confidence='moderate'
 st=placeholder_re.findall(c['source']); ct=placeholder_re.findall(c['currentTarget']); et=placeholder_re.findall(target)
 assert sorted(st)==sorted(ct)==sorted(et)
 source_markup=markup_re.findall(c['source']); current_markup=markup_re.findall(c['currentTarget']); target_markup=markup_re.findall(target)
 source_nums=numeric_re.findall(c['source']); current_nums=numeric_re.findall(c['currentTarget']); target_nums=numeric_re.findall(target)
 source_protected=[x for x in protected if x in c['source']]; current_protected=[x for x in source_protected if x in c['currentTarget']]; target_protected=[x for x in source_protected if x in target]
 assert source_markup==current_markup==target_markup==[]
 assert source_nums==current_nums==target_nums==[]
 assert source_protected==current_protected==target_protected
 ctxrefs=caller['dynamicCallerLines'] + [x['line'] for x in caller['directMessageReferences']] + [x['line'] for x in caller['dynamicLabelMappings']]
 caller_status=caller['callerResolution']
 rows.append({'schemaVersion':1,'window':'W3420-W3439','repository':'snapetech-org/seerrng','pullRequest':418,'head':manifest['head'],'tree':manifest['commitTree'],'position':c['position'],'locale':c['locale'],'localeTag':c['localeTag'],'sourceId':c['sourceId'],'sourceKey':c['sourceKey'],'source':c['source'],'sourceSha256':c['sourceSha256'],'sourceIdSha256':c['sourceIdSha256'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'catalogPath':c['catalogPath'],'catalogSha256':c['catalogSha256'],'catalogGitBlob':c['catalogGitBlob'],'callerEvidence':{'packetFile':'caller-contexts.jsonl','packetSha256':h((I/'caller-contexts.jsonl').read_bytes()),'contextRowSha256':CRH[c['position']],'contextBlocksFile':'caller-context-blocks.jsonl','contextBlocksSha256':h((I/'caller-context-blocks.jsonl').read_bytes()),'contextBlockIds':caller['contextBlockIds'],'callerResolution':caller_status,'evidenceLines':sorted(set(ctxrefs)),'callerReferenceCount':caller['callerCount']},'verdict':verdict,'proposedTarget':proposed,'proposedTargetSha256':hs(proposed) if proposed is not None else None,'effectiveTarget':target,'effectiveTargetSha256':hs(target),'rationale':rationale,'confidence':confidence,'nativeSpeakerApproved':False,'integrityChecks':{'placeholders':{'source':st,'current':ct,'effective':et,'currentTokenSetMatchesSource':sorted(st)==sorted(ct),'effectiveTokenSetMatchesSource':sorted(st)==sorted(et),'sequenceOrderMayDifferByLocale':st!=ct},'markupTokens':{'source':source_markup,'current':current_markup,'effective':target_markup,'preserved':True},'numericTokens':{'source':source_nums,'current':current_nums,'effective':target_nums,'preserved':True},'protectedLiterals':{'source':source_protected,'currentPreserved':current_protected,'effectivePreserved':target_protected,'preserved':True},'edgeWhitespace':{'source':edge_ws(c['source']),'current':edge_ws(c['currentTarget']),'effective':edge_ws(target)}}})
counts=collections.Counter(r['verdict'] for r in rows)
assert counts=={'accept-current':212,'correction':2,'refinement':2,'hold':24},counts
assert len(rows)==240 and len({(r['position'],r['locale']) for r in rows})==240
assert collections.Counter(r['position'] for r in rows if r['verdict']=='hold')=={3421:12,3423:12}
# Validate proposal set and source/current row coverage.
assert {(r['position'],r['locale']) for r in rows if r['proposedTarget'] is not None}==set(PROPOSALS)
input_sum_hash=h((I/'SHA256SUMS.txt').read_bytes())
input_files={}
for line in (I/'SHA256SUMS.txt').read_text().splitlines():
 digest,name=line.split('  ',1); assert h((I/name).read_bytes())==digest; input_files[name]=digest
# Output is created only in task scratch.
(O/'primary-decisions.jsonl').write_text(''.join(canon(r)+'\n' for r in rows),encoding='utf-8')
summary={'schemaVersion':1,'artifact':'Primary semantic review — SeerrNG PR #418 W3420–W3439','reviewedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'reviewType':'primary','reviewerMode':'Candidate-free packet only; no primary/blind proposal artifacts were consulted.','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3420-W3439','head':manifest['head'],'tree':manifest['commitTree'],'liveAttestation':manifest,'candidateFreeInput':{'path':str(I),'sha256SumsFileSha256':input_sum_hash,'checksumsPass':True,'files':input_files,'sourceRows':20,'localeCount':12,'cellCount':240},'counts':{'totalCells':len(rows),'acceptCurrent':counts['accept-current'],'correction':counts['correction'],'refinement':counts['refinement'],'hold':counts['hold'],'nativeSpeakerApproval':False},'callerResolutionHolds':[{'position':pos,'sourceId':S[pos]['sourceId'],'locales':locale_order,'reason':HOLD_POS[pos]} for pos in sorted(HOLD_POS)],'proposals':[{'position':r['position'],'locale':r['locale'],'sourceId':r['sourceId'],'currentTarget':r['currentTarget'],'proposedTarget':r['proposedTarget'],'verdict':r['verdict'],'rationale':r['rationale']} for r in rows if r['proposedTarget'] is not None],'structuralReview':{'placeholderTokenSetMismatches':0,'currentPlaceholderOrderDiffs':sum(not c['placeholderTokenSequenceMatches'] for c in C.values()),'markupMismatches':0,'numericTokenMismatches':0,'protectedLiteralMismatches':0,'edgeWhitespaceMismatches':sum(1 for r in rows if r['integrityChecks']['edgeWhitespace']['current']!=r['integrityChecks']['edgeWhitespace']['source'])},'scopeNotes':['Definitions for components.Requests.selectUser and components.Requests.service have no production caller in the pinned Requests source; held all locale cells pending caller identification.','For sizeProgress, Hindi/Japanese/Korean reorder complete and total placeholders; all named tokens are preserved.','Primary machine review only; no native speaker approval.'],'repoOrPrChanged':False,'testsBuildsOrCiRun':False}
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
readme='''# Primary review — SeerrNG PR #418 W3420–W3439\n\nReviewed all 240 locale cells from the pinned candidate-free input packet only. The 20 IDs and source order match head `3f5ddfdddbeb77cf02cc9d14e00001c8d1aa61c6`, tree `1c48dc5ea6e8db6c2da546ec58e88d38eb8f9cc7`.\n\nDispositions: 212 accept current, 2 corrections, 2 refinements, 24 holds. Holds are all locales for `components.Requests.selectUser` (3421) and `components.Requests.service` (3423); exact production references were not resolved in the pinned caller scan. The remaining proposed changes clarify Indonesian “Sort By” and first-publication labels in Japanese, Brazilian Portuguese, and Korean. Placeholder token sets, markup, numeric tokens, protected literals, and edge whitespace were checked.\n\nThis is a machine primary review, not native-speaker approval. No repository/PR edits, tests, builds, or CI were performed.\n'''
(O/'README.md').write_text(readme,encoding='utf-8')
files=['primary-decisions.jsonl','summary.json','README.md','build_review.py']
manifest_out={'schemaVersion':1,'artifact':'SeerrNG PR #418 W3420-W3439 primary review','files':{n:hs((O/n).read_text(encoding='utf-8')) for n in files},'inputSha256SumsFileSha256':input_sum_hash}
(O/'OUTPUT-MANIFEST.json').write_text(json.dumps(manifest_out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
files_to_sum=files+['OUTPUT-MANIFEST.json']
(O/'SHA256SUMS.txt').write_text(''.join(f'{h((O/n).read_bytes())}  {n}\n' for n in files_to_sum),encoding='utf-8')
seal={'schemaVersion':1,'algorithm':'SHA-256','sha256SumsFile':'SHA256SUMS.txt','sha256SumsSha256':h((O/'SHA256SUMS.txt').read_bytes()),'head':manifest['head'],'tree':manifest['commitTree'],'cellCount':240}
(O/'SEAL.json').write_text(json.dumps(seal,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(O),'counts':dict(counts),'proposalCount':len(PROPOSALS),'inputSumsSha256':input_sum_hash,'ledgerSha256':hs((O/'primary-decisions.jsonl').read_text()),'summarySha256':hs((O/'summary.json').read_text()),'outputSumsSha256':seal['sha256SumsSha256']}))
