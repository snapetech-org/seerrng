import hashlib, json, re, subprocess
from pathlib import Path

ROOT=Path('/mnt/disks/scratch/task-worktrees/localization-20261030/seerrng-apply-f67039a778d38912')
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3180-3199-primary-20261103')
EXPECTED_HEAD='c03816972aab761a69b343abcdfe8a10f85aeabb'
EXPECTED_TREE='1ffc02d5d7dbbb14ab4706ce61bfcfda64592a01'
REPO='snapetech-org/SeerrNG'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
CHANGES={
'components.RequestStatus.SoftwareRequests.cancelled': {
 'hi':('रद्द किया गया','correction','The existing infinitive means “cancel”; this is a past-status label.'),
 'ja':('キャンセル済み','correction','Use a completed cancellation state rather than the generic action noun.'),
 'fr':('Annulée','refinement','The status refers to a demande, so feminine agreement fits the displayed request context.'),
 'ar':('ملغى','correction','The existing first-person verb is not a status label; use a masculine adjective for الطلب.'),
},
'components.RequestStatus.SoftwareRequests.clearCancelled': {
 'hi':('रद्द किया गया अनुरोध हटाएँ','correction','The current wording describes clearing a cancellation request rather than removing a cancelled request.'),
 'ja':('キャンセル済みのリクエストを削除','correction','Clarifies that the cancelled request record is deleted.'),
 'pt_BR':('Remover pedido cancelado','correction','The current value is a noun phrase with a period, not the removal action.'),
 'ar':('حذف الطلب الملغى','correction','The current word order and adjective imply a clear cancellation request.'),
 'ko':('취소된 요청 삭제','correction','The current label means “cancellation request”; make the cancelled request the object.'),
},
'components.RequestStatus.SoftwareRequests.clearCancelledDescription': {
 'zh_Hans':('这会从 Seerr 中移除已取消的请求及其保存的状态历史记录。不会删除已安装的软件。','correction','Repairs the missing connective/punctuation and makes the deletion boundary clear.'),
 'hi':('इससे Seerr से रद्द किया गया अनुरोध और उसका सहेजा गया स्थिति इतिहास हट जाएगा। इंस्टॉल किए गए सॉफ़्टवेयर को नहीं हटाया जाएगा।','correction','Removes the embedded English phrase and preserves the explicit statement that installed software is not deleted.'),
 'ko':('이 작업은 Seerr에서 취소된 요청과 저장된 상태 기록을 삭제합니다. 설치된 소프트웨어는 삭제하지 않습니다.','refinement','Adds the named application source and states the deletion boundary explicitly.'),
 'zh_Hant':('這會從 Seerr 移除已取消的要求及其儲存的狀態記錄。這不會刪除已安裝的軟體。','refinement','Repairs spacing and sentence flow while preserving both deletion and non-deletion claims.'),
 'id':('Tindakan ini menghapus permintaan yang dibatalkan beserta riwayat statusnya yang tersimpan dari Seerr. Perangkat lunak yang sudah terpasang tidak akan dihapus.','correction','The current Indonesian word order is ungrammatical and obscures the saved status-history relationship.'),
},
'components.RequestStatus.SoftwareRequests.clearCancelledTitle': {
 'zh_Hans':('要删除这项已取消的请求吗？','correction','Uses Chinese punctuation and asks about deleting the cancelled request.'),
 'hi':('क्या आप इस रद्द किए गए अनुरोध को हटाना चाहते हैं?','refinement','Makes the confirmation question idiomatic and preserves “this” and the cancelled state.'),
 'ja':('キャンセル済みのリクエストを削除しますか？','correction','Clarifies that the record is deleted, rather than cancelled again.'),
 'fr':('Supprimer cette demande annulée ?','refinement','Uses a natural confirmation title and French question-mark spacing.'),
 'ar':('هل تريد حذف هذا الطلب الملغى؟','correction','Replaces the dialectal “clear” verb with the deletion action used by the confirmation.'),
 'ko':('취소된 요청을 삭제하시겠습니까?','correction','The existing text says to cancel the request again and is not grammatical.'),
 'zh_Hant':('要移除這項已取消的要求嗎？','refinement','Repairs punctuation spacing and makes the confirmation action clear.'),
 'vi':('Xóa yêu cầu đã hủy này?','refinement','Adds “this” and aligns the phrase with the delete confirmation action.'),
},
'components.RequestStatus.SoftwareRequests.clearFailed': {
 'es':('No se pudo eliminar esta solicitud cancelada.','correction','“Incapaz de borrar” is not idiomatic here; use the standard impersonal error message.'),
 'zh_Hans':('无法移除这项已取消的请求。','correction','Removes erroneous punctuation spacing.'),
 'hi':('रद्द किया गया अनुरोध हटाया नहीं जा सका।','correction','The current value says the request could not be cancelled, not removed.'),
 'fr':('Impossible de supprimer cette demande annulée.','correction','The existing wording says the already cancelled request could not be cancelled again.'),
 'ar':('تعذّر حذف هذا الطلب الملغى.','correction','The current wording uses an incorrect verb for clearing/removing a request.'),
 'ko':('취소된 요청을 삭제할 수 없습니다.','correction','The existing value says the cancellation cannot be cancelled; this is a delete failure.'),
 'zh_Hant':('無法移除這項已取消的要求。','correction','Repairs the punctuation spacing.'),
},
'components.RequestStatus.SoftwareRequests.clearSuccess': {
 'zh_Hans':('已移除已取消的请求。','correction','The current wording says the request was cancelled rather than that the cancelled record was cleared.'),
 'hi':('रद्द किया गया अनुरोध हटा दिया गया।','correction','The current wording says the cancelled request was approved.'),
 'ja':('キャンセル済みのリクエストを削除しました。','correction','The current toast says the request was cancelled; the action actually deletes the cancelled record.'),
 'fr':('La demande annulée a été supprimée.','correction','The current toast only states that the request was cancelled, not removed.'),
 'pt_BR':('Pedido cancelado removido.','correction','The current toast says only “cancelled request” and omits that it was removed.'),
 'ar':('تم حذف الطلب الملغى.','correction','The current toast reports cancellation instead of deleting the already-cancelled record.'),
 'ko':('취소된 요청을 삭제했습니다.','correction','Repairs the current ungrammatical toast, which says to cancel the cancellation.'),
 'zh_Hant':('已移除已取消的要求。','correction','The current toast says the request was cancelled rather than removed.'),
 'vi':('Đã xóa yêu cầu đã hủy.','correction','The current toast says a cancellation was cancelled, rather than that the record was removed.'),
 'id':('Permintaan yang dibatalkan telah dihapus.','correction','The current toast reports cancellation but omits the successful removal.'),
},
'components.RequestStatus.SoftwareRequests.confirmAfterCheck': {
 'hi':('मैंने जाँच लिया है; आगे बढ़ें','refinement','Corrects the tense and gives a natural continue action.'),
 'fr':('J’ai vérifié ; continuer','correction','The existing French button contains the English word “continue”.'),
 'ko':('확인했습니다. 계속 진행','correction','Replaces the informal English loan and states the continue action naturally.'),
 'id':('Saya sudah memeriksa; lanjutkan','refinement','Uses the normal polite register for an application confirmation.'),
},
'components.RequestStatus.SoftwareRequests.datPartlyVerified': {
 'es':('DAT verificados: {verified} de {total}','correction','Fixes plural agreement and presents verified DAT files as a count.'),
 'zh_Hans':('已验证 {verified}/{total} 个 DAT','correction','The existing target contains stray text and fails to communicate the verified count.'),
 'hi':('कुल {total} DAT में से {verified} सत्यापित हैं','correction','Removes embedded English and expresses the count and total naturally.'),
 'ja':('全{total}件中{verified}件のDATを確認済み','correction','The current value incorrectly says “information”; express the verified count.'),
 'fr':('DAT vérifiés : {verified} sur {total}','refinement','Plural agreement reflects the counted DAT items.'),
 'pt_BR':('DAT verificados: {verified} de {total}','refinement','Uses plural agreement for the counted DAT files.'),
 'ar':('تم التحقق من {verified} من أصل {total} من ملفات DAT','correction','Removes an added “partially” claim and retains the DAT acronym.'),
 'zh_Hant':('已驗證 {verified}/{total} 個 DAT','correction','The current target contains a stray numeral and does not express the verified count.'),
 'vi':('Đã xác minh {verified}/{total} DAT','correction','The current value contains an unrelated word and the wrong verb.'),
 'id':('{verified} dari {total} DAT terverifikasi','correction','Removes the untranslated English word and forms a natural count label.'),
},
'components.RequestStatus.SoftwareRequests.datVerified': {
 'es':('DAT verificados','refinement','Plural agreement suits the badge shown when all reported DAT items are verified.'),
 'hi':('DAT सत्यापित','refinement','Preserves DAT as the file-type acronym instead of transliterating it.'),
 'fr':('DAT vérifiés','refinement','Plural agreement suits the verified-items badge.'),
 'pt_BR':('DATs verificados','refinement','Plural agreement suits the badge for all reported DAT files.'),
 'ar':('تم التحقق من ملفات DAT','correction','The current value translates DAT as “date”; keep it as the file-type acronym.'),
 'ko':('DAT 확인 완료','correction','“인증” means certification/authentication, not verification.'),
 'zh_Hans':('DAT 已验证','refinement','Makes the verification state explicit while preserving the acronym.'),
 'zh_Hant':('DAT 已驗證','refinement','Makes the verification state explicit while preserving the acronym.'),
 'vi':('DAT đã xác minh','correction','The current value means “determined,” not “verified.”'),
},
'components.RequestStatus.SoftwareRequests.downloadAllCopies': {
 'pt_BR':('Baixar todos os arquivos','refinement','Removes sentence punctuation from a button label and aligns it with the other infinitive labels.'),
},
'components.RequestStatus.SoftwareRequests.downloadCopies': {
 'ja':('コピーをダウンロード','refinement','Uses natural Japanese word order for the download action.'),
 'pt_BR':('Baixar cópias','refinement','Removes sentence punctuation and aligns the menu action with the other infinitive labels.'),
 'ar':('تنزيل النسخ','correction','Repairs the unnatural word order and clearly means “download copies”.'),
 'ko':('복사본 다운로드','correction','The current label omits “copies”.'),
},
'components.RequestStatus.SoftwareRequests.downloadCopy': {
 'ja':('コピーをダウンロード','correction','Repairs unnatural word order.'),
 'fr':('Télécharger une copie','correction','Adds the required article for a natural French action label.'),
 'pt_BR':('Baixar uma cópia','refinement','Adds the article for a natural Brazilian Portuguese action label.'),
 'ar':('تنزيل نسخة','correction','Repairs the current unnatural word order.'),
 'ko':('복사본 다운로드','correction','The current label omits “copy”.'),
 'vi':('Tải xuống bản sao','correction','The current value omits “copy”.'),
},
'components.RequestStatus.SoftwareRequests.downloadNamed': {
 'hi':('{name} डाउनलोड करें','refinement','Makes the accessible action label read naturally with the dynamic file name.'),
 'ja':('{name} をダウンロード','refinement','Places the dynamic file name before the Japanese download verb.'),
 'ar':('تنزيل {name}','refinement','Uses the natural noun/action order for a downloadable file name.'),
 'ko':('{name} 다운로드','refinement','Uses natural Korean word order for the accessible download label.'),
},
'components.RequestStatus.SoftwareRequests.downloading': {
 'es':('Descargando','correction','The current value is a noun/action rather than the ongoing download status.'),
 'zh_Hans':('正在下载','refinement','Makes the ongoing status explicit.'),
 'hi':('डाउनलोड हो रहा है','refinement','Expresses the active download status rather than the generic action.'),
 'de':('Wird heruntergeladen','correction','The current value is English; translate the active status.'),
 'ja':('ダウンロード中','refinement','Explicitly marks the operation as in progress.'),
 'fr':('Téléchargement en cours','refinement','Makes the in-progress status explicit.'),
 'ar':('جارٍ التنزيل','refinement','Expresses an active download rather than a bare noun.'),
 'ko':('다운로드 중','refinement','Explicitly marks the operation as in progress.'),
 'vi':('Đang tải xuống','refinement','Uses the standard in-progress download wording.'),
 'id':('Sedang mengunduh','refinement','Makes the in-progress status explicit.'),
},
'components.RequestStatus.SoftwareRequests.failureCode': {
 'es':('Código de error: {code}','refinement','“Código de error” is the established Spanish UI term for a failure code.'),
 'zh_Hans':('失败代码：{code}','refinement','Uses Chinese punctuation without a stray space.'),
 'ko':('실패 코드: {code}','correction','부호 means a sign/symbol here; use 코드 for a software failure code.'),
 'zh_Hant':('失敗代碼：{code}','refinement','Uses Chinese punctuation without a stray space.'),
},
'components.RequestStatus.SoftwareRequests.game': {
 'pt_BR':('Jogo de PC','refinement','Adds the natural preposition in the category label.'),
 'vi':('Trò chơi PC','refinement','Keeps the PC platform label concise and distinct from a generic computer game.'),
},
}

def sha(b): return hashlib.sha256(b).hexdigest()
def write_json(path, obj): path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n')
def write_jsonl(path, rows): path.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows))
def run(args): return subprocess.check_output(args,cwd=ROOT,text=True).strip()

pr=json.loads(run(['gh','pr','view','418','--repo',REPO,'--json','headRefOid,baseRefOid,state,isDraft,headRefName']))
head=run(['git','rev-parse','HEAD'])
tree=run(['git','rev-parse','HEAD^{tree}'])
if pr['headRefOid'] != EXPECTED_HEAD or head != EXPECTED_HEAD or tree != EXPECTED_TREE:
    raise SystemExit(f'Exact-head mismatch: PR={pr["headRefOid"]}, worktree={head}, tree={tree}')

src_dir=ROOT/'src/i18n/locale'
english=json.loads((src_dir/'en.json').read_text())
keys=sorted(english)
if len(keys)!=9494 or len(set(keys))!=len(keys): raise SystemExit('Unexpected English key set')
locales={loc:json.loads((src_dir/f'{loc}.json').read_text()) for loc in LOCALES}
for loc,obj in locales.items():
    if set(obj)!=set(english): raise SystemExit(f'Key mismatch for {loc}')

source_ids=[]
rows=[]
summary={'accept-current':0,'correction':0,'refinement':0,'hold':0}
change_counts={}
for pos in range(3180,3200):
    key=keys[pos]
    src=english[key]
    if not key.startswith('components.RequestStatus.SoftwareRequests.'):
        raise SystemExit(f'Unexpected key at {pos}: {key}')
    target_changes=CHANGES.get(key,{})
    source_ids.append({'position':pos,'id':key,'source':src,'sourceSha256':sha(src.encode())})
    for loc in LOCALES:
        cur=locales[loc][key]
        change=target_changes.get(loc)
        if change:
            target,disp,why=change
            if disp not in ('correction','refinement'): raise SystemExit(f'bad disposition {disp}')
            if target==cur: raise SystemExit(f'unchanged target incorrectly listed: {key}/{loc}')
            summary[disp]+=1
            change_counts[loc]=change_counts.get(loc,0)+1
        else:
            target,disp,why=cur,'accept-current','Current value preserves the source meaning in its caller context.'
            summary[disp]+=1
        rows.append({'position':pos,'id':key,'source':src,'sourceSha256':sha(src.encode()),'locale':loc,'current':cur,'currentSha256':sha(cur.encode()),'primaryDisposition':disp,'proposedTarget':target,'proposedTargetSha256':sha(target.encode()),'rationale':why,'confidence':'moderate' if disp!='accept-current' else 'moderate'})

# Pin definitions and use sites in the exact caller source.
caller=ROOT/'src/components/RequestStatus/SoftwareRequests.tsx'
caller_bytes=caller.read_bytes(); caller_text=caller_bytes.decode()
caller_sha=sha(caller_bytes)
lines=caller_text.splitlines()
fields=sorted({r['id'].rsplit('.',1)[1] for r in rows})
contexts=[]
for field in fields:
    for i,line in enumerate(lines,1):
        if re.search(r'\b'+re.escape(field)+r'\s*:',line):
            contexts.append({'idPrefix':'components.RequestStatus.SoftwareRequests','field':field,'file':'src/components/RequestStatus/SoftwareRequests.tsx','fileSha256':caller_sha,'line':i,'role':'message-definition','context':'\n'.join(lines[max(0,i-2):min(len(lines),i+3)])})
        if re.search(r'messages\.'+re.escape(field)+r'\b',line):
            contexts.append({'idPrefix':'components.RequestStatus.SoftwareRequests','field':field,'file':'src/components/RequestStatus/SoftwareRequests.tsx','fileSha256':caller_sha,'line':i,'role':'message-use','context':'\n'.join(lines[max(0,i-2):min(len(lines),i+3)])})
for field in ('cancelled','declined','downloading','failed'):
    for i,line in enumerate(lines,1):
        if 'messages[status]' in line:
            contexts.append({'idPrefix':'components.RequestStatus.SoftwareRequests','field':field,'file':'src/components/RequestStatus/SoftwareRequests.tsx','fileSha256':caller_sha,'line':i,'role':'dynamic-status-map','context':'\n'.join(lines[max(0,i-2):min(len(lines),i+3)])})

files={}
for loc in LOCALES+['en']:
    b=(src_dir/f'{loc}.json').read_bytes()
    files[f'src/i18n/locale/{loc}.json']={'sha256':sha(b),'keys':len(json.loads(b))}
source_boundaries={'repository':REPO,'pullRequest':418,'head':head,'tree':tree,'englishKeyCount':len(keys),'range':[3180,3199],'selectedKeyCount':20,'selectedCellCount':240,'catalogs':files,'callerFiles':{'src/components/RequestStatus/SoftwareRequests.tsx':{'sha256':caller_sha,'lineCount':len(lines)}},'callerSearchScope':'Message definitions and statically named uses in SoftwareRequests.tsx, plus dynamic status-label map for cancelled/declined/downloading/failed.'}
window={'repository':REPO,'pullRequest':418,'head':head,'tree':tree,'sourceOrderCount':len(keys),'range':[3180,3199],'sourceIds':source_ids,'catalogKeyCounts':{loc:len(locales[loc]) for loc in LOCALES},'localeOrder':LOCALES,'callerSearchScope':source_boundaries['callerSearchScope']}
proposals=[r for r in rows if r['primaryDisposition'] in ('correction','refinement')]
manifest={'repository':REPO,'pullRequest':418,'head':head,'tree':tree,'sourceOrderSha256':sha('\n'.join(keys).encode()),'englishCatalogSha256':sha((src_dir/'en.json').read_bytes()),'callerFileSha256':caller_sha,'range':[3180,3199],'localeOrder':LOCALES,'createdBy':'primary semantic review (machine-assisted)','nativeSpeakerApproval':False}
write_json(OUT/'window.json',window)
write_json(OUT/'manifest.json',manifest)
write_json(OUT/'summary.json',{'head':head,'tree':tree,'sourceIds':20,'cells':240,'dispositions':summary,'changesByLocale':change_counts,'proposalCount':len(proposals),'nativeSpeakerApproval':False})
write_json(OUT/'source-boundaries.json',source_boundaries)
write_jsonl(OUT/'source-current-cells.jsonl',rows)
write_jsonl(OUT/'primary-decisions.jsonl',rows)
write_json(OUT/'candidate-proposals.json',{'head':head,'tree':tree,'range':[3180,3199],'proposals':proposals})
write_jsonl(OUT/'caller-contexts.jsonl',contexts)

readme=f'''# SeerrNG PR #418 primary semantic review — W3180–W3199\n\nThis packet covers sorted source positions 3180–3199 (20 IDs, 240 locale cells) at exact PR head `{head}` / tree `{tree}`. The English key set contains {len(keys):,} keys; all 12 target catalogs have identical key sets.\n\nPrimary dispositions: {summary['accept-current']} accept-current, {summary['correction']} corrections, {summary['refinement']} refinements, {summary['hold']} holds. {len(proposals)} target proposals are pinned to exact source and current-value hashes. Caller definitions and message uses were captured from `src/components/RequestStatus/SoftwareRequests.tsx` (SHA-256 `{caller_sha}`).\n\nThis is machine-assisted primary review and does not establish native-speaker approval. No repository or PR files were changed; no tests, builds, scans, CI, or browser actions were run.\n'''
(OUT/'README.md').write_text(readme)
# Hash all packet files except the checksum file itself.
entries=[]
for p in sorted(OUT.iterdir()):
    if p.is_file() and p.name!='SHA256SUMS.txt': entries.append(f'{sha(p.read_bytes())}  {p.name}')
(OUT/'SHA256SUMS.txt').write_text('\n'.join(entries)+'\n')
print(json.dumps({'head':head,'tree':tree,'summary':summary,'changesByLocale':change_counts,'proposals':len(proposals),'callerContexts':len(contexts),'packet':str(OUT)},ensure_ascii=False,indent=2))
