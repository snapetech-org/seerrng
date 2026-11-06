from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess

OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerr-chaptarr-new-correction-adjudication-20261102')
SEERR_REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
CHAP_REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-chaptarrng')
SEERR_HEAD='f20893e57a89827095fa049d8e0475df7ec7170f'; SEERR_TREE='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
CHAP_HEAD='175cff3a50569b67def345bb82332b30e9bb378c'; CHAP_TREE='e682581e3c577b62215658c374b15a9d3f8f8bd0'
SEERR_PRIMARY=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
SEERR_HIDVI=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-crossreview-20261102')
SEERR_OTHER=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-nine-locale-crossreview-20261102')
CHAP_PRIMARY=pathlib.Path('/mnt/disks/scratch/task-scratch/chaptarrng-pr190-window-0850-0899-primary-20261102')
CHAP_REVIEW=pathlib.Path('/mnt/disks/scratch/task-scratch/chaptarrng-pr190-window-0850-0899-crossreview-20261102')
SEERR_ADDITIONAL_TARGETS={
 (2496,'ko'):('Grimmory를 열고 라이브러리 플레이어에서 오디오북을 선택합니다. 오디오북의 진행 상황과 재생은 Grimmory에서 관리합니다.', 'revise', 'The submitted correction omitted the opening instruction to open Grimmory and choose an audiobook. This revised target localizes “Audiobook” while preserving both source clauses.'),
}


def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha_bytes(s.encode('utf-8'))
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def read_json(p): return json.loads(p.read_text(encoding='utf-8'))
def read_jsonl(p): return [json.loads(s) for s in p.read_text(encoding='utf-8').splitlines() if s]
def flatten(d,prefix=''):
 out={}
 for k,v in d.items():
  key=f'{prefix}.{k}' if prefix else k
  if isinstance(v,dict):out.update(flatten(v,key))
  else:out[key]=v
 return out
def pr_view(repo,n):
 obj=json.loads(subprocess.check_output(['gh','pr','view',str(n),'--repo',repo,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],text=True))
 return {'repository':repo,'pullRequest':n,**obj}
def worktree(repo):
 return {'head':subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),
         'tree':subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD^{tree}'],text=True).strip(),
         'branch':subprocess.check_output(['git','-C',str(repo),'branch','--show-current'],text=True).strip(),
         'statusPorcelain':subprocess.check_output(['git','-C',str(repo),'status','--porcelain=v1'],text=True).strip()}
def verify_manifest(directory,manifest):
 subprocess.run(['sha256sum','-c',manifest],cwd=directory,check=True,stdout=subprocess.DEVNULL)
def verify_file_and_line(repo,ref,expected_file_sha=None):
 raw=(repo/ref['file']).read_bytes()
 expected_file_sha=ref.get('fileSha256',expected_file_sha)
 assert expected_file_sha is not None and sha_bytes(raw)==expected_file_sha,(ref['file'],'file sha mismatch')
 lines=raw.decode('utf-8').splitlines()
 assert 1<=ref['line']<=len(lines),(ref['file'],ref['line'])
 actual=lines[ref['line']-1]
 text=ref['lineText']
 assert actual.strip()==text.strip(),(ref['file'],ref['line'],actual,text)
 assert ref['lineSha256'] in {sha_text(actual),sha_text(actual.strip()),sha_text(text),sha_text(text.strip())},(ref['file'],ref['line'],'line sha mismatch')
 return {'file':ref['file'],'fileSha256':sha_bytes(raw),'line':ref['line'],'lineSha256':ref['lineSha256'],'lineText':actual,'match':True}
def simple_placeholder_sig(text):
 # Caller packets also carry structured placeholder arrays; this catches named ICU variables and ordinary braces.
 found=[]; i=0
 while i<len(text):
  if text[i]!='{':i+=1;continue
  depth=1;j=i+1
  while j<len(text) and depth:
   if text[j]=='{':depth+=1
   elif text[j]=='}':depth-=1
   j+=1
  if depth:return None
  body=text[i+1:j-1]
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_.-]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
  if m:found.append((m.group(1),m.group(2) or 'simple'))
  i=j
 return sorted(found)
def markup_sig(text): return sorted(re.findall(r'</?[A-Za-z][^>]*>',text))

# Verify all supplied packet manifests. Chaptarr's INPUT manifest is repo-root relative and is verified from its pinned worktree below.
verify_manifest(SEERR_PRIMARY,'SHA256SUMS'); verify_manifest(SEERR_PRIMARY,'INPUT-SHA256SUMS')
verify_manifest(SEERR_HIDVI,'SHA256SUMS'); verify_manifest(SEERR_OTHER,'SHA256SUMS.txt')
verify_manifest(CHAP_PRIMARY,'SHA256SUMS'); verify_manifest(CHAP_REVIEW,'SHA256SUMS')
subprocess.run(['sha256sum','-c',str(CHAP_PRIMARY/'INPUT-SHA256SUMS')],cwd=CHAP_REPO,check=True,stdout=subprocess.DEVNULL)

# Fresh PR and clean worktree pins at beginning.
start_prs=[pr_view('snapetech-org/SeerrNG',418),pr_view('snapetech-org/ChaptarrNG',190)]
start_wts={'SeerrNG':worktree(SEERR_REPO),'ChaptarrNG':worktree(CHAP_REPO)}
assert (start_wts['SeerrNG']['head'],start_wts['SeerrNG']['tree'],start_wts['SeerrNG']['statusPorcelain'])==(SEERR_HEAD,SEERR_TREE,''),start_wts['SeerrNG']
assert (start_wts['ChaptarrNG']['head'],start_wts['ChaptarrNG']['tree'],start_wts['ChaptarrNG']['statusPorcelain'])==(CHAP_HEAD,CHAP_TREE,''),start_wts['ChaptarrNG']
for item,head in zip(start_prs,[SEERR_HEAD,CHAP_HEAD]):
 assert item['state']=='OPEN' and item['isDraft'] is True and item['headRefOid']==head,item

records=[]
# Seerr primary evidence and exact live catalogs/caller contexts.
seerr_primary_rows=read_jsonl(SEERR_PRIMARY/'primary-review-ledger.jsonl')
seerr_ctx_rows=read_jsonl(SEERR_PRIMARY/'caller-contexts.jsonl')
seerr_pmap={(r['sourcePosition'],r['locale']):r for r in seerr_primary_rows}
seerr_ctx={r['sourceId']:r for r in seerr_ctx_rows}
seerr_catalogs={}
for loc in ['en','ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']:
 path=SEERR_REPO/f'src/i18n/locale/{loc}.json'; seerr_catalogs[loc]=flatten(read_json(path))
# Gather only the exact 13 additional rows, from the two independent review packets.
seerr_findings=read_jsonl(SEERR_HIDVI/'findings.jsonl')
seerr_hidvi_ledger=read_jsonl(SEERR_HIDVI/'crossreview-ledger.jsonl')
seerr_hmap={(r['sourcePosition'],r['locale']):r for r in seerr_hidvi_ledger}
seerr_other_rows=read_jsonl(SEERR_OTHER/'cross-review.jsonl')
seerr_omap={(r['sourcePosition'],r['locale']):r for r in seerr_other_rows}
seerr_additions=[]
for f in seerr_findings:
 if f.get('kind')=='additional-correction':
  base=seerr_hmap[(f['sourcePosition'],f['locale'])]
  seerr_additions.append((f,base,'seerr-hidvi'))
for r in seerr_other_rows:
 if r.get('crossReviewDisposition')=='additional':
  seerr_additions.append((r,r,'seerr-other-nine'))
assert len(seerr_additions)==13,len(seerr_additions)
for item,base,packet in seerr_additions:
 pos=item['sourcePosition']; loc=item['locale']; sid=item['sourceId'] if 'sourceId' in item else base['sourceId']
 primary=seerr_pmap[(pos,loc)]; context=seerr_ctx[sid]
 source=base.get('sourceText',base.get('source'))
 if source is None: source=primary['source']
 current=item.get('currentTarget',base.get('currentTarget'))
 if current is None: current=base['currentTarget']
 target=item.get('finalTarget',item.get('reviewedTarget'))
 candidate_hash=item.get('finalTargetHash',item.get('reviewedTargetHash'))
 source_hash=item.get('sourceTextSha256')
 if source_hash is None: source_hash=base['sourceTextSha256']
 current_hash=item.get('currentTargetHash')
 if current_hash is None: current_hash=base.get('currentTargetHash')
 if current_hash is None: current_hash=base['currentTargetHash']
 context_hash=primary['callerContextSha256']
 assert sha_text(source)==source_hash==primary['sourceTextSha256'],(sid,loc,'source hash')
 assert sha_text(current)==current_hash==primary['currentTargetHash'],(sid,loc,'current hash')
 assert source==primary['source'] and current==primary['currentTarget'],(sid,loc,'input mismatch')
 assert seerr_catalogs['en'].get(sid)==source and seerr_catalogs[loc].get(sid)==current,(sid,loc,'live catalog mismatch')
 source_file=primary['sourceFile']; target_file=primary['localeFile']
 source_raw=(SEERR_REPO/source_file).read_bytes(); target_raw=(SEERR_REPO/target_file).read_bytes()
 assert sha_bytes(source_raw)==primary['sourceFileSha256']
 assert sha_bytes(target_raw)==primary['localeFileSha256']
 assert context_hash==primary['callerContextSha256']
 assert sha_bytes(canon(context))==context_hash,(sid,'caller context canonical hash mismatch')
 caller_file_sha={x['path']:x['fileSha256'] for x in context['callerFiles']}
 refs=[]
 for ref in context['pinnedLineRefs']: refs.append(verify_file_and_line(SEERR_REPO,ref,caller_file_sha.get(ref['file'])))
 caller_files=[]
 for ref in context['callerFiles']:
  raw=(SEERR_REPO/ref['path']).read_bytes(); assert sha_bytes(raw)==ref['fileSha256']
  blob=subprocess.check_output(['git','-C',str(SEERR_REPO),'rev-parse',f"HEAD:{ref['path']}"],text=True).strip()
  assert blob==ref['blob']
  caller_files.append({'path':ref['path'],'blob':blob,'fileSha256':sha_bytes(raw)})
 if packet=='seerr-hidvi':
  proposed=item['finalTarget']; proposed_hash=item['finalTargetHash']
  rationale=item['reason']
 else:
  proposed=item['reviewedTarget']; proposed_hash=item['reviewedTargetHash']
  rationale=item['crossReviewRationale']
 assert sha_text(proposed)==proposed_hash
 final,decision,why=SEERR_ADDITIONAL_TARGETS.get((pos,loc),(proposed,'accept',f'Accepted: independently confirms source meaning in pinned caller context. {rationale}'))
 src_ph=simple_placeholder_sig(source); fin_ph=simple_placeholder_sig(final)
 src_markup=markup_sig(source); fin_markup=markup_sig(final)
 assert src_ph==fin_ph and src_markup==fin_markup,(sid,loc,'placeholder/markup mismatch')
 protected=primary.get('protectedLiterals',[])
 if isinstance(protected,list) and protected and isinstance(protected[0],dict): protected=[x.get('literal') for x in protected]
 missing=[t for t in protected if t and t not in final]
 assert not missing,(sid,loc,'protected literal missing',missing)
 # Preserve exact familiar product literals from any source row even when the producer's policy list is empty.
 special=[t for t in ['Grimmory','BookOrbit','Komga','Plex','4K','Admin','OPDS','Sportarr','Whisparr'] if t in source]
 assert all(t in final for t in special),(sid,loc,'product literal changed',special)
 records.append({
  'cohort':'SeerrNG PR #418 W2400–W2499 additional-correction adjudication','repository':'snapetech-org/SeerrNG','pullRequest':418,'exactHead':SEERR_HEAD,'exactTree':SEERR_TREE,
  'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':source,'sourceTextSha256':source_hash,'currentTarget':current,'currentTargetSha256':current_hash,
  'proposalTarget':proposed,'proposalTargetSha256':proposed_hash,'proposalPacket':packet,'proposalRationale':rationale,
  'adjudication':decision,'adjudicatedTarget':final,'adjudicatedTargetSha256':sha_text(final),'rationale':why,
  'sourceCatalogFile':source_file,'sourceCatalogFileSha256':sha_bytes(source_raw),'sourceCatalogBlob':primary['sourceCatalogBlob'],
  'targetCatalogFile':target_file,'targetCatalogFileSha256':sha_bytes(target_raw),'targetCatalogBlob':primary['localeBlob'],
  'callerContextSha256':context_hash,'callerContextHashVerified':True,'callerFiles':caller_files,'callerLinePins':refs,
  'sourcePlaceholders':src_ph,'targetPlaceholders':fin_ph,'sourceMarkup':src_markup,'targetMarkup':fin_markup,'placeholderParity':'exact','markupParity':'exact',
  'protectedLiterals':protected+special,'protectedLiteralParity':'exact','currentCatalogValueVerified':True,'sourceCatalogValueVerified':True,
  'nativeSpeakerApproval':False,'browserApproval':False,
 })

# Chaptarr exact primary/crossreview rows, all 14 candidate proposals.
chap_candidates=read_jsonl(CHAP_REVIEW/'additional-corrections.jsonl')
chap_ledger=read_jsonl(CHAP_REVIEW/'cross-review-ledger.jsonl')
chap_lmap={(r['sourceOrdinal'],r['locale']):r for r in chap_ledger}
chap_primary=read_jsonl(CHAP_PRIMARY/'input-cells.jsonl')
chap_pmap={(r['sourceOrdinal'],r['locale']):r for r in chap_primary}
chap_catalogs={}
for loc in ['en','ar','de','es','hi','id','ja','ko','pt_BR','vi','zh_CN','zh_TW']:
 path=CHAP_REPO/f'src/NzbDrone.Core/Localization/Core/{loc}.json'; chap_catalogs[loc]=read_json(path)
for c in chap_candidates:
 pos=c['sourceOrdinal']; loc=c['locale']; sid=c['sourceId']
 row=chap_lmap[(pos,loc)]; p=chap_pmap[(pos,loc)]
 source=c['source']; current=c['currentTarget']; proposed=c['recommendedTarget']
 assert row['sourceOrdinal']==pos and row['sourceId']==sid and row['locale']==loc
 assert row['source']==source and row['currentTarget']==current
 assert sha_text(source)==c['sourceTextSha256']==row['sourceTextSha256']
 assert sha_text(current)==c['currentTargetSha256']==row['currentTargetSha256']
 assert sha_text(proposed)==c['recommendedTargetSha256']
 assert c['callerContextSha256']==row['callerContextSha256']
 refs=row['callerRefs']
 assert sha_bytes(canon(refs))==row['callerContextSha256'],(sid,loc,'caller ref canonical hash mismatch')
 source_file=row['sourceFile']; target_file=row['targetFile']
 source_raw=(CHAP_REPO/source_file).read_bytes(); target_raw=(CHAP_REPO/target_file).read_bytes()
 assert sha_bytes(source_raw)==row['sourceFileSha256']
 assert sha_bytes(target_raw)==row['targetFileSha256']
 assert chap_catalogs['en'].get(sid)==source and read_json(CHAP_REPO/row['targetFile']).get(sid)==current,(sid,loc,'live catalog key mismatch')
 assert p['sourceId']==sid and p['currentTarget']==current
 verified_refs=[verify_file_and_line(CHAP_REPO,ref) for ref in refs]
 final=proposed; decision='accept'; why='Accepted: the exact validator/validation caller confirms the intended quality-item or API-field meaning, and the target preserves the exact protected literals.'
 src_ph=simple_placeholder_sig(source); fin_ph=simple_placeholder_sig(final); src_markup=markup_sig(source); fin_markup=markup_sig(final)
 assert src_ph==fin_ph and src_markup==fin_markup,(sid,loc,'placeholder/markup mismatch')
 protected=c.get('protectedLiterals',[])
 assert all(t in source and t in final for t in protected),(sid,loc,'protected literal mismatch')
 if sid=='server.message.me4cb9b13f0b4': assert 'unmappedFiles.scope' in final
 if sid=='server.message.mec341ea80e66': assert '1' in final
 if sid=='server.message.mefbca50c53e7': assert ('私人' in final or 'private' in final.lower())
 records.append({
  'cohort':'ChaptarrNG PR #190 W850–W899 additional-correction adjudication','repository':'snapetech-org/ChaptarrNG','pullRequest':190,'exactHead':CHAP_HEAD,'exactTree':CHAP_TREE,
  'sourceOrdinal':pos,'sourceId':sid,'locale':loc,'source':source,'sourceTextSha256':c['sourceTextSha256'],'currentTarget':current,'currentTargetSha256':c['currentTargetSha256'],
  'proposalTarget':proposed,'proposalTargetSha256':c['recommendedTargetSha256'],'proposalPacket':'chaptarr-additional-corrections','proposalRationale':c['rationale'],
  'adjudication':decision,'adjudicatedTarget':final,'adjudicatedTargetSha256':sha_text(final),'rationale':why,
  'sourceCatalogFile':source_file,'sourceCatalogFileSha256':sha_bytes(source_raw),'sourceCatalogBlob':row['sourceFileBlob'],
  'targetCatalogFile':target_file,'targetCatalogFileSha256':sha_bytes(target_raw),'targetCatalogBlob':row['targetFileBlob'],
  'callerContextSha256':row['callerContextSha256'],'callerContextHashVerified':True,'callerFiles':[{'file':r['file'],'fileSha256':r['fileSha256']} for r in refs],'callerLinePins':verified_refs,
  'sourcePlaceholders':src_ph,'targetPlaceholders':fin_ph,'sourceMarkup':src_markup,'targetMarkup':fin_markup,'placeholderParity':'exact','markupParity':'exact',
  'protectedLiterals':protected,'protectedLiteralParity':'exact','currentCatalogValueVerified':True,'sourceCatalogValueVerified':True,
  'nativeSpeakerApproval':False,'browserApproval':False,
 })
assert len([r for r in records if r['cohort'].startswith('SeerrNG')])==13
assert len([r for r in records if r['cohort'].startswith('ChaptarrNG')])==14
assert len(records)==27

# Final fresh live PR/worktree reattestation, still no modifications.
end_prs=[pr_view('snapetech-org/SeerrNG',418),pr_view('snapetech-org/ChaptarrNG',190)]
end_wts={'SeerrNG':worktree(SEERR_REPO),'ChaptarrNG':worktree(CHAP_REPO)}
assert start_prs==end_prs
assert end_wts==start_wts

(OUT/'live-prs-start.json').write_text(json.dumps(start_prs,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(OUT/'live-prs-end.json').write_text(json.dumps(end_prs,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(OUT/'worktrees-start.json').write_text(json.dumps(start_wts,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(OUT/'worktrees-end.json').write_text(json.dumps(end_wts,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
with (OUT/'adjudication.jsonl').open('w',encoding='utf-8',newline='\n') as f:
 for r in records:f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n')
counts=collections.Counter(r['adjudication'] for r in records)
per=collections.defaultdict(collections.Counter)
for r in records: per[r['cohort'].split()[0]][r['adjudication']]+=1
summary={
 'scope':{'SeerrNG':13,'ChaptarrNG':14,'total':27},'counts':dict(counts),'perCohort':{k:dict(v) for k,v in per.items()},
 'seerrHead':SEERR_HEAD,'seerrTree':SEERR_TREE,'chaptarrHead':CHAP_HEAD,'chaptarrTree':CHAP_TREE,
 'packetChecksumsVerified':True,'sourceCurrentCatalogHashesReattested':27,'callerContextHashesReattested':27,'callerLinePinsReattested':sum(len(r['callerLinePins']) for r in records),
 'placeholderParityExact':27,'markupParityExact':27,'protectedLiteralParityExact':27,'holds':0,
 'revisedCandidate':{'sourceId':'components.ReaderDeliveryLink.audiobooksHelp','sourcePosition':2496,'locale':'ko','reason':'The added correction dropped the source instruction to open Grimmory and choose an audiobook; revised target preserves both sentences.'},
 'nativeSpeakerApproval':False,'browserReview':False,'testsBuildsCiRun':False,'repoEdits':False,
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
readme=f'''# Independent adjudication of additional localization corrections

Reviewed the new-correction cohorts only: SeerrNG PR #418 W2400–W2499 (five Vietnamese and eight ar/es/fr/ja/ko/zh cells) and ChaptarrNG PR #190 W850–W899 (14 cells). Both PRs were OPEN/DRAFT at the specified exact heads/trees before and after; both worktrees were clean and unchanged. All input packet manifests were verified. Source/current text and catalog hashes plus caller-context and caller-line pins were independently rechecked against the exact worktrees.

Adjudications: `{dict(counts)}`. One Seerr Korean proposal was revised because it omitted the first instruction from the source; the full revised value and hash are in `adjudication.jsonl`. The other 26 proposals are supported by the exact caller context and accepted. There are no holds.

All 27 reviewed final values preserve placeholders, markup, and applicable protected literals. This is static adjudication only, with no native-speaker or browser approval. No repository edits, tests, builds, or CI runs occurred.

Input packets:
- Seerr primary: `{SEERR_PRIMARY}`
- Seerr Hindi/Indonesian/Vietnamese cross-review: `{SEERR_HIDVI}`
- Seerr other-nine cross-review: `{SEERR_OTHER}`
- Chaptarr primary: `{CHAP_PRIMARY}`
- Chaptarr cross-review: `{CHAP_REVIEW}`
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
files=sorted(x for x in OUT.iterdir() if x.is_file() and x.name!='SHA256SUMS.txt')
with (OUT/'SHA256SUMS.txt').open('w',encoding='utf-8',newline='\n') as f:
 for p in files:f.write(f'{sha_bytes(p.read_bytes())}  {p.name}\n')
print(json.dumps({'out':str(OUT),'records':len(records),'counts':dict(counts),'perCohort':{k:dict(v) for k,v in per.items()},'linePins':summary['callerLinePinsReattested'],'manifestSha256':sha_bytes((OUT/'SHA256SUMS.txt').read_bytes()),'ledgerSha256':sha_bytes((OUT/'adjudication.jsonl').read_bytes())},ensure_ascii=False,indent=2))
