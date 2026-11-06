#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
import hashlib, json, re, subprocess, sys

T=Path(__file__).resolve().parent
I=T/'candidate-free-input'
O=T/'primary-review'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
# Each non-accept disposition is independently authored from the candidate-free W3660-W3679 cells.
P={
(3660,'hi'):('correction','{count} मीडिया फ़ाइलें','Uses the counted plural form फ़ाइलें; फ़ाइलों is an oblique form that needs a following postposition.','moderate'),
(3661,'es'):('correction','{count} archivos faltantes se omitirán','Removes the ungrammatical capitalized article after the count and uses a natural verb for skipped files.','high'),
(3661,'zh_Hans'):('refinement','{count} 缺失的文件将被跳过','Uses 缺失 for files absent from the migration preview; 丢失 can suggest files were lost.','moderate'),
(3661,'ja'):('correction','{count} 件の見つからないファイルはスキップされます','不足している suggests insufficient files; 見つからない expresses files that are missing.','high'),
(3661,'fr'):('correction','{count} fichiers manquants seront ignorés','Removes les after a numeral and uses natural French count syntax.','high'),
(3661,'zh_Hant'):('refinement','將略過 {count} 個缺少的檔案','Uses an idiomatic Traditional Chinese count phrase for files that are missing.','moderate'),
(3661,'vi'):('correction','{count} tệp bị thiếu sẽ được bỏ qua','Uses bị thiếu for missing files rather than bị mất, which means lost files.','high'),
(3663,'hi'):('refinement','चयनित प्रारूप और फ़ोल्डर से मेल खाने वाला कोई लेखक नहीं है।','Reshapes the subject and verb agreement into a natural statement that no author matches the selected format and folder.','moderate'),
(3663,'zh_Hans'):('refinement','没有作者符合所选格式和文件夹。','Removes the space before Chinese punctuation and uses a natural match construction.','high'),
(3663,'zh_Hant'):('refinement','沒有作者符合所選格式和資料夾。','Removes the space before Chinese punctuation and uses a natural Traditional Chinese match construction.','high'),
(3666,'es'):('correction','BookshelfNG no pudo informar sobre el espacio libre disponible en el destino','Uses the past inability expressed by the source; no podría is conditional.','high'),
(3666,'de'):('correction','BookshelfNG konnte den freien Speicherplatz am Ziel nicht melden.','Replaces the nonstandard Zielfreiraum with the usual term for available storage at the destination.','high'),
(3666,'fr'):('correction','BookshelfNG n’a pas pu indiquer l’espace libre disponible à destination.','Uses natural French for destination free space and the source’s inability statement.','high'),
(3666,'pt_BR'):('correction','O BookshelfNG não conseguiu informar o espaço livre no destino.','Replaces the conditional não poderia with a direct inability statement.','high'),
(3666,'ko'):('correction','BookshelfNG는 대상 위치의 여유 공간을 보고할 수 없었습니다.','Replaces 무료 공간, which means free-of-charge space, with 여유 공간 for available storage.','high'),
(3667,'ko'):('refinement','전체 {pages}페이지 중 {page}페이지','Uses natural Korean pagination wording while preserving both reordered placeholders.','moderate'),
(3668,'fr'):('refinement','Aperçu du déplacement','Uses déplacement for moving files; mouvement is broader and less specific in this settings flow.','moderate'),
(3668,'pt_BR'):('correction','Prévia da movimentação','Uses Brazilian Portuguese prévia and the natural term for a file move.','high'),
(3668,'ko'):('correction','이동 미리보기','Uses natural Korean word order for a move preview.','high'),
(3669,'ko'):('correction','BookshelfNG는 이 이동을 미리 볼 수 없었습니다.','Repairs spacing and phrasing while preserving the failed-preview meaning.','high'),
(3670,'es'):('correction','Vista previa del traslado','Avance means progress; vista previa means preview.','high'),
(3670,'hi'):('refinement','स्थानांतरण का पूर्वावलोकन','Adds the move context present in the source label.','moderate'),
(3671,'zh_Hans'):('refinement','正在生成预览…','Uses the natural ongoing-action form and the single-character ellipsis.','high'),
(3671,'zh_Hant'):('refinement','正在建立預覽…','Uses the natural ongoing-action form and the single-character ellipsis.','high'),
(3673,'fr'):('correction','BookshelfNG a mis en file d’attente la commande de déplacement {id}.','Repairs the fragment and states clearly that BookshelfNG queued the move command.','high'),
(3675,'de'):('refinement','Zum Kopieren benötigter Speicherplatz: {size}','Uses Speicherplatz for required storage instead of Kopierraum, which can mean a physical copy room.','moderate'),
(3675,'ko'):('correction','복사에 필요한 공간: {size}','Rephrases 필수 사본 공간, which reads as physical copy space, as space needed for copying.','high'),
(3676,'es'):('correction','SeerrNG solicita a BookshelfNG una vista previa de cada autor seleccionado antes de iniciar el traslado. La vista previa muestra los archivos, los conflictos, los archivos faltantes y el espacio en disco necesario. Para iniciar un traslado se requiere un token de vista previa nuevo.','Repairs pide BookshelfNG para, clarifies that the preview shows the listed checks, and includes the required fresh preview token.','high'),
(3676,'de'):('correction','SeerrNG bittet BookshelfNG, vor dem Verschieben eine Vorschau für jeden ausgewählten Autor zu erstellen. Die Vorschau zeigt Dateien, Konflikte, fehlende Dateien und den benötigten Speicherplatz. Zum Starten einer Verschiebung ist ein neues Vorschau-Token erforderlich.','Uses file-move wording and states that starting a move requires a new preview token.','high'),
(3676,'fr'):('correction','SeerrNG demande à BookshelfNG de prévisualiser chaque auteur sélectionné avant un déplacement. L’aperçu affiche les fichiers, les conflits, les fichiers manquants et l’espace disque nécessaire. Le démarrage d’un déplacement nécessite un nouveau jeton d’aperçu.','Replaces déménagement, a household move, with déplacement and uses afficher for what the preview shows.','high'),
(3676,'ko'):('correction','SeerrNG는 이동 전에 선택한 각 저자의 미리보기를 BookshelfNG에 요청합니다. 미리보기에는 파일, 충돌, 누락된 파일 및 필요한 디스크 공간이 표시됩니다. 이동을 시작하려면 새 미리보기 토큰이 필요합니다.','Repairs the unnatural request construction and replaces literal 신선한 with 새 for a fresh token.','moderate'),
(3678,'pt_BR'):('refinement','Selecione todos os autores correspondentes','Removes final punctuation from a button label.','high'),
(3678,'ja'):('correction','条件に一致する作者をすべて選択','Uses natural Japanese for all authors matching the selected criteria.','high'),
(3678,'zh_Hant'):('refinement','選取所有符合條件的作者','Uses a natural Traditional Chinese phrase for authors matching the current filters.','moderate'),
(3679,'ja'):('correction','{author}を選択','Uses natural Japanese object order for the select-author action.','high'),
}
MEANING={
3660:'counted media-file label',
3661:'counted status explaining that absent files will be skipped',
3662:'next-page navigation label',
3663:'empty-state message for authors matching the selected format and folder',
3664:'message that BookshelfNG omitted individual file entries',
3665:'instruction to add a BookshelfNG service before path migration',
3666:'error that BookshelfNG could not report destination free space',
3667:'page number and total-page label',
3668:'action to preview a file move',
3669:'error that BookshelfNG could not preview the move',
3670:'move-preview title',
3671:'in-progress preview status',
3672:'previous-page navigation label',
3673:'message that BookshelfNG queued a move command',
3674:'counted label for registered files',
3675:'label for storage required to copy files',
3676:'safety explanation requiring an individual preview and fresh token before each move',
3677:'filter-author control label',
3678:'select-all-matching-authors control label',
3679:'select-author control with a dynamic author value',
}
def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode('utf-8')).hexdigest()
def readj(p): return json.loads(p.read_text(encoding='utf-8'))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def writejl(p,xs): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in xs),encoding='utf-8')
def icu(s):
 out=[]; i=0
 while i<len(s):
  if s[i]!='{': i+=1; continue
  start=i; depth=1; k=i+1
  while k<len(s) and depth:
   if s[k]=='{': depth+=1
   elif s[k]=='}': depth-=1
   k+=1
  if depth: break
  body=s[start+1:k-1]; m=HEADER.match(body)
  if m:
   name,fmt=m.group(1),m.group(2); cats=[]
   if fmt in ('plural','select','selectordinal'): cats=[x.group(1) for x in CAT.finditer(body[m.end():])]
   out.append({'name':name,'formatter':fmt or None,'pluralCategories':cats})
  i=k
 return out
def catmap(ts): return {x['name']:sorted(x['pluralCategories']) for x in ts if x['pluralCategories']}
def token_sig(ts): return Counter((x['name'],x['formatter']) for x in ts)
def protected(s): return [x for x in PROTECTED if x in s]
def token_audit(source,current,reviewed,locale,position):
 stoks=icu(source); ctoks=icu(current); rtoks=icu(reviewed)
 s_nums=NUM.findall(source); c_nums=NUM.findall(current); r_nums=NUM.findall(reviewed)
 source_cats=catmap(stoks); reviewed_cats=catmap(rtoks)
 required=protected(source); present=protected(reviewed)
 return {
  'sourcePlaceholderTokens':stoks,'currentPlaceholderTokens':ctoks,'reviewedPlaceholderTokens':rtoks,
  'sourceCurrentPlaceholderMultisetMatches':token_sig(stoks)==token_sig(ctoks),
  'sourceReviewedPlaceholderMultisetMatches':token_sig(stoks)==token_sig(rtoks),
  'currentPlaceholderOrderDiffers':[x['name'] for x in ctoks]!=[x['name'] for x in stoks],
  'reviewedPlaceholderOrderDiffers':[x['name'] for x in rtoks]!=[x['name'] for x in stoks],
  'sourceIcuPluralCategories':source_cats,'reviewedIcuPluralCategories':reviewed_cats,
  'pluralCategoriesPreserved':source_cats==reviewed_cats,
  'sourceMarkupTokens':MK.findall(source),'reviewedMarkupTokens':MK.findall(reviewed),
  'markupPreserved':MK.findall(source)==MK.findall(reviewed),
  'sourceNumericTokens':s_nums,'currentNumericTokens':c_nums,'reviewedNumericTokens':r_nums,
  'numericTokenSurfaceMatchesSource':s_nums==r_nums,
  'numericValuesMatchSource':s_nums==r_nums,
  'requiredProtectedLiterals':required,'preservedProtectedLiterals':present,
  'missingProtectedLiterals':[x for x in required if x not in reviewed],
  'sourceLocale':locale,'sourcePosition':position
 }
assert not O.exists()
v=subprocess.run([sys.executable,str(T/'verify_candidate_free.py')],capture_output=True,text=True)
if v.returncode: raise SystemExit(v.stdout+v.stderr)
OUT=json.loads(v.stdout)
manifest=readj(I/'manifest.json'); window=readj(I/'window.json')
sources=readjl(I/'source-cells.jsonl'); cells=readjl(I/'current-target-cells.jsonl')
contexts=readjl(I/'caller-contexts.jsonl'); blocks=readjl(I/'caller-context-blocks.jsonl')
assert len(sources)==20 and len(cells)==240 and len(contexts)==20
src_by={x['position']:x for x in sources}
cell_by={(x['position'],x['locale']):x for x in cells}
ctx_by={(x['position'],x['sourceId']):x for x in contexts}
block_by={x['contextId']:x for x in blocks}
assert set(P)<=set(cell_by)
rows=[]
for c in cells:
 pos,loc=c['position'],c['locale']; s=src_by[pos]; ctx=ctx_by[(pos,s['sourceId'])]
 choice=P.get((pos,loc))
 if choice: decision,proposal,rationale,confidence=choice
 else:
  decision='accept-current'; proposal=None
  rationale=f"The current wording preserves the {MEANING[pos]}; its variables and protected product names remain intact."
  if c['placeholderTokenSequenceMismatch']:
   rationale+=' The target-language word order repositions placeholders while retaining each variable.'
  confidence='moderate' if loc in ('ar','hi','vi','id') or pos==3676 else 'high'
 reviewed=proposal if proposal is not None else c['currentTarget']
 audit=token_audit(s['source'],c['currentTarget'],reviewed,loc,pos)
 assert audit['sourceCurrentPlaceholderMultisetMatches'] and audit['sourceReviewedPlaceholderMultisetMatches'],(pos,loc,'placeholder multiset')
 assert audit['pluralCategoriesPreserved'] and audit['markupPreserved'],(pos,loc,'ICU or markup')
 assert audit['numericTokenSurfaceMatchesSource'] and audit['numericValuesMatchSource'],(pos,loc,'numeric literal')
 assert not audit['missingProtectedLiterals'],(pos,loc,'protected literal')
 if proposal is not None:
  assert proposal!=c['currentTarget']
  assert decision in ('correction','refinement')
 else:
  assert decision=='accept-current'
 context_sha=sha(json.dumps(ctx,ensure_ascii=False,sort_keys=True,separators=(',',':')))
 row={'schema':'seerrng-primary-cell-review/v1','repository':manifest['repository'],'pullRequest':manifest['pullRequest'],'window':manifest['window'],'head':manifest['head'],'tree':manifest['tree'],'position':pos,'sourceId':s['sourceId'],'sourceIdSha256':s['sourceIdSha256'],'source':s['source'],'sourceSha256':s['sourceSha256'],'namespace':s['namespace'],'sourceKey':s['sourceKey'],'locale':loc,'localeTag':c['localeTag'],'catalogPath':c['catalogPath'],'catalogGitBlob':c['catalogGitBlob'],'catalogSha256':c['catalogSha256'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'callerResolution':ctx['callerResolution'],'directCallerCount':ctx['callerCount'],'callerless':ctx['callerCount']==0,'callerContextSha256':context_sha,'callerContextIds':ctx['contextBlockIds'],'decision':decision,'rationale':rationale,'confidence':confidence,'reviewedTargetSha256':sha(reviewed),'tokenAudit':audit}
 if proposal is not None: row['proposedTarget']=proposal
 rows.append(row)
assert len(rows)==240 and len({(x['position'],x['locale']) for x in rows})==240
counts=Counter(x['decision'] for x in rows); confidence=Counter(x['confidence'] for x in rows)
assert counts==Counter({'accept-current':205,'correction':22,'refinement':13}),counts
assert sum(x['callerless'] for x in rows)==0
baseline={
 'placeholderMultisetMismatchCount':sum(not x['tokenAudit']['sourceCurrentPlaceholderMultisetMatches'] for x in rows),
 'placeholderSequenceDifferenceCount':sum(x['tokenAudit']['currentPlaceholderOrderDiffers'] for x in rows),
 'pluralCategoryMismatchCount':sum(not x['tokenAudit']['pluralCategoriesPreserved'] for x in rows),
 'markupMismatchCount':sum(not x['tokenAudit']['markupPreserved'] for x in rows),
 'numericTokenSurfaceMismatchCount':sum(not x['tokenAudit']['numericTokenSurfaceMatchesSource'] for x in rows),
 'protectedLiteralMismatchCount':sum(bool(x['tokenAudit']['missingProtectedLiterals']) for x in rows)
}
reviewed={
 'placeholderMultisetMismatchCount':sum(not x['tokenAudit']['sourceReviewedPlaceholderMultisetMatches'] for x in rows),
 'placeholderSequenceDifferenceCount':sum(x['tokenAudit']['reviewedPlaceholderOrderDiffers'] for x in rows),
 'pluralCategoryMismatchCount':sum(not x['tokenAudit']['pluralCategoriesPreserved'] for x in rows),
 'markupMismatchCount':sum(not x['tokenAudit']['markupPreserved'] for x in rows),
 'numericTokenSurfaceMismatchCount':sum(not x['tokenAudit']['numericTokenSurfaceMatchesSource'] for x in rows),
 'numericValueMismatchCount':sum(not x['tokenAudit']['numericValuesMatchSource'] for x in rows),
 'protectedLiteralMismatchCount':sum(bool(x['tokenAudit']['missingProtectedLiterals']) for x in rows)
}
assert baseline['placeholderMultisetMismatchCount']==0 and baseline['placeholderSequenceDifferenceCount']==2
assert reviewed['placeholderMultisetMismatchCount']==0 and reviewed['placeholderSequenceDifferenceCount']==2
assert reviewed['pluralCategoryMismatchCount']==reviewed['markupMismatchCount']==reviewed['numericTokenSurfaceMismatchCount']==reviewed['numericValueMismatchCount']==reviewed['protectedLiteralMismatchCount']==0
hold_lineage=readj(I/'lineage/hold-lineage.json')
assert hold_lineage['allPriorHoldTargetsReattested'] and hold_lineage['targetTextIncluded'] is False
assert hold_lineage['currentWindowHoldCount']==12 and len(hold_lineage['carryForwardHoldRows'])==12
O.mkdir()
writejl(O/'primary-ledger.jsonl',rows)
summary={'schemaVersion':1,'repository':manifest['repository'],'pullRequest':manifest['pullRequest'],'window':manifest['window'],'range':manifest['range'],'head':manifest['head'],'tree':manifest['tree'],'sourceCount':20,'localeCount':12,'cellCount':240,'decisionCounts':dict(counts),'confidenceCounts':dict(confidence),'holdCount':0,'holdCells':[],'callerlessCellCount':0,'baselineDiagnostics':baseline,'reviewedDiagnostics':reviewed,'validPlaceholderReorderings':[{'position':x['position'],'sourceId':x['sourceId'],'locale':x['locale'],'sourceOrder':[t['name'] for t in x['tokenAudit']['sourcePlaceholderTokens']],'currentOrder':[t['name'] for t in x['tokenAudit']['currentPlaceholderTokens']]} for x in rows if x['tokenAudit']['currentPlaceholderOrderDiffers']],'carryForwardHoldCount':12,'carryForwardHoldPositions':[3632],'candidateFreeInputVerified':'PASS','candidateFreeInputManifestSha256':sha((I/'manifest.json').read_bytes()),'candidateFreeInputChecksumListSha256':sha((I/'SHA256SUMS.txt').read_bytes()),'nativeSpeakerReview':'not performed','browserReview':'not performed','crossAudit':'not performed','repositoryOrPRFilesEdited':False}
writej(O/'summary.json',summary)
(O/'input-verification.txt').write_text('Candidate-free input verifier result (rerun before primary review generation):\n\n'+v.stdout,encoding='utf-8')
method={'reviewStage':'primary semantic review','input':'candidate-free input only','head':manifest['head'],'tree':manifest['tree'],'window':manifest['window'],'decisionDefinitions':{'accept-current':'Current target preserves source meaning in the pinned caller context.','correction':'Current target contains a semantic, grammar, or technical-term error.','refinement':'Current target is understandable but has a clear locale or style improvement.','hold':'A source-bound ambiguity or unresolved callerless case; none in this window.'},'placeholderPolicy':'Placeholder names and formatter signatures must be preserved as a multiset. Natural target-language reordering is allowed and recorded; two valid page/pages reorderings are present.','protectedLiteralPolicy':'All protected source literals must remain present in reviewed targets.','priorHoldPolicy':'Carry twelve prior position-3632 hold fingerprints by hash only; do not reuse prior target text as proposals.','crossAudit':'not performed','nativeSpeakerApproval':'not claimed'}
writej(O/'review-method.json',method)
(O/'README.md').write_text('# SeerrNG PR #418 W3660–W3679 primary semantic review\n\nThis sealed primary review covers all 240 source/current-target cells across 12 locales at head '+manifest['head']+' and tree '+manifest['tree']+'. The review ledger records an accept-current, correction, or refinement decision for each cell and includes proposals only for the latter two decisions. Exact source, catalog, and caller pins are inherited from the verified candidate-free input and referenced by hashes in every row.\n\nAll 20 source keys have direct callers. The twelve earlier position-3632 callerless holds are retained separately by exact target hash in the candidate-free lineage; their target text is not included as a proposal. Two page/pages placeholder order changes are valid target-language reorderings; each placeholder name remains present.\n\nThe verifier checks the candidate-free input, current PR/head/tree/catalog pins, all ledger bindings, proposals, structural tokens, manifest and SHA-256 checksums. Native-speaker approval, browser review, and cross-audit have not been performed. No repo or PR files were edited.\n',encoding='utf-8')
import shutil
shutil.copyfile(T/'verify_primary.py',O/'verify_primary.py')
packet_files=[O/'primary-ledger.jsonl',O/'summary.json',O/'input-verification.txt',O/'review-method.json',O/'README.md',O/'verify_primary.py']
mp={'schemaVersion':1,'packetType':'sealed-primary-semantic-review','repository':manifest['repository'],'pullRequest':418,'window':manifest['window'],'range':manifest['range'],'head':manifest['head'],'tree':manifest['tree'],'sourceCount':20,'localeCount':12,'cellCount':240,'decisionCounts':dict(counts),'holdCount':0,'carryForwardHoldCount':12,'candidateFreeInputPath':str(I),'candidateFreeInputManifestSha256':sha((I/'manifest.json').read_bytes()),'candidateFreeInputChecksumListSha256':sha((I/'SHA256SUMS.txt').read_bytes()),'candidateFreeVerifier':'PASS','nativeSpeakerReview':'not performed','browserReview':'not performed','crossAudit':'not performed','sealedAtUTC':datetime.now(timezone.utc).isoformat(),'files':[{'path':x.name,'sha256':sha(x.read_bytes()),'byteCount':x.stat().st_size} for x in packet_files]}
writej(O/'manifest.json',mp)
(O/'SHA256SUMS.txt').write_text(''.join(f'{sha(x.read_bytes())}  {x.name}\n' for x in sorted(O.iterdir()) if x.is_file() and x.name!='SHA256SUMS.txt'),encoding='utf-8')
print(json.dumps({'result':'primary packet sealed','output':str(O),'head':manifest['head'],'tree':manifest['tree'],'decisions':dict(counts),'confidence':dict(confidence),'baselineDiagnostics':baseline,'reviewedDiagnostics':reviewed,'manifestSha256':sha((O/'manifest.json').read_bytes()),'checksumListSha256':sha((O/'SHA256SUMS.txt').read_bytes())},ensure_ascii=False,indent=2))
