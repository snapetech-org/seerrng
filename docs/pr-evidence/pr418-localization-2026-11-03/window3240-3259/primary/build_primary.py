import hashlib, json, pathlib, re
from collections import Counter
root=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-3259-20261103')
input_dir=root/'clean-input'
input_manifest_sha='cdb641f171f9118dc8080d0aab2d8df1b4a2acdceadbf3fbcafe39f6ecc7f84d'
rows=list(map(json.loads,(input_dir/'review-input.jsonl').read_text().splitlines()))
window=json.loads((input_dir/'window.json').read_text())
assert window['head']=='d514838bbcca18d7255ba04a0266c4a78b41a499'
assert window['tree']=='3c90e26e7e04e4e008ed43f4004dbb0048357f92'
# (source position, locale): (decision, proposed target, rationale)
changes={
(3240,'de'):('correction','Ihre Anfrage wurde genehmigt und wartet auf die Weiterleitung.','“Versand” can mean physical shipping; this request is waiting to be forwarded to its connected service.'),
(3240,'ja'):('correction','リクエストは承認され、送信されるのを待っています。','“発送” suggests physical shipment; the request is waiting to be sent to its connected service.'),
(3240,'fr'):('correction','Votre demande a été approuvée et attend d’être transmise.','“Expédition” suggests shipping; this request is waiting to be transmitted to its connected service.'),
(3240,'ko'):('correction','요청이 승인되었으며 전달을 기다리고 있습니다.','“발송” suggests physical shipment; the request is waiting to be forwarded.'),
(3241,'es'):('correction','El contenido solicitado está disponible.','“Los medios” reads as plural media outlets/devices; use a natural singular collective for requested media.'),
(3241,'de'):('refinement','Das angeforderte Medium ist verfügbar.','The source describes the requested media item as a singular collective; avoid changing it to plural media.'),
(3241,'vi'):('correction','Nội dung được yêu cầu đã có sẵn.','“Phương tiện” means a vehicle/means here; use the requested media/content sense.'),
(3242,'de'):('correction','Bindery hat diese Anfrage abgelehnt. Bitten Sie einen Administrator, sie in Bindery zu prüfen. Wenn Sie das Buch weiterhin möchten, versuchen Sie es hier erneut.','The current text mixes an informal “versuche” with an otherwise formal instruction; make the admin check and retry consistent.'),
(3242,'pt_BR'):('refinement','O Bindery recusou esta solicitação. Peça a um administrador que a revise no Bindery e tente novamente aqui se você ainda quiser o livro.','Replace the awkward passive “se o livro ainda for desejado” with a direct user-facing condition.'),
(3242,'id'):('refinement','Bindery menolak permintaan ini. Minta administrator meninjaunya di Bindery, lalu coba lagi di sini jika Anda masih menginginkan bukunya.','Make “if the book is still wanted” a natural direct condition and retain Bindery exactly.'),
(3243,'de'):('refinement','Die verknüpfte Anfrage ist in Bindery nicht mehr vorhanden. Bitten Sie einen Administrator, Bindery zu prüfen. Wenn Sie das Buch weiterhin möchten, versuchen Sie es hier erneut.','Use the natural “no longer present” phrasing and keep the formal address consistent.'),
(3243,'ja'):('refinement','Bindery にはリンクされたリクエストがもうありません。管理者に Bindery を確認してもらい、まだ本が必要ならここで再度リクエストしてください。','Make the “no longer” detail explicit and retain the linked-request meaning.'),
(3244,'fr'):('refinement','Le service de livres connecté n’a pas pu accepter cette demande. Vérifiez sa connexion et les paramètres du fournisseur de métadonnées, puis réessayez.','Use the natural plural “service de livres” and make the service connection/provider settings relationship clear.'),
(3244,'pt_BR'):('refinement','O serviço de livros conectado não conseguiu aceitar esta solicitação. Verifique a conexão e as configurações do provedor de metadados, depois tente novamente.','Use a natural plural for a book service and smooth the instruction.'),
(3244,'ar'):('correction','لم تتمكن خدمة الكتب المتصلة من قبول هذا الطلب. تحقّق من اتصالها وإعدادات موفّر البيانات الوصفية، ثم أعد المحاولة.','The current phrase says “connection provider”; the source asks to check the service connection and metadata-provider settings.'),
(3244,'zh_Hant'):('correction','連線的圖書服務無法接受此請求。請檢查其連線狀態和中繼資料提供者設定，然後重試。','Use Traditional Chinese forms for connection/settings and clarify the metadata-provider settings.'),
(3245,'de'):('correction','Der verbundene Buchdienst hat ein Download- oder Importproblem gemeldet. Bitten Sie einen Administrator, die Warteschlange oder die Protokolle zu prüfen und das Problem dort zu beheben. Versuchen Sie anschließend erneut, die Anfrage zu stellen.','The current “Bitte einen Administrator” is an incomplete instruction and switches to informal address; use a complete, consistent formal instruction.'),
(3245,'pt_BR'):('refinement','O serviço de livros conectado relatou um problema no download ou na importação. Peça a um administrador que verifique a fila ou os logs e corrija o problema lá; depois, tente a solicitação novamente.','Avoid the redundant “tente solicitar novamente” and make clear that the request itself can be retried after fixing the service.'),
(3246,'es'):('correction','No hay ninguna edición utilizable disponible en el servicio de libros conectado. Verifique la edición solicitada y el catálogo del servicio o las fuentes de adquisición; vuelva a intentarlo cuando estén disponibles.','Use the singular service catalog instead of “catálogo de servicios” and preserve the requested-edition condition.'),
(3246,'fr'):('refinement','Aucune édition utilisable n’est disponible auprès du service de livres connecté. Vérifiez l’édition demandée et le catalogue du service ou ses sources d’acquisition, puis réessayez lorsqu’ils seront prêts.','Use natural French for the connected book service and identify the service catalog/sources.'),
(3246,'pt_BR'):('refinement','Nenhuma edição utilizável está disponível no serviço de livros conectado. Verifique a edição solicitada e o catálogo do serviço ou suas fontes de aquisição; tente novamente quando estiverem disponíveis.','Use the natural plural service name and make the catalog belong to that service.'),
(3246,'zh_Hant'):('correction','連線的圖書服務目前沒有可用的版本。請檢查請求的版本以及服務目錄或取得來源，並在其準備就緒後重試。','Use Traditional Chinese connection terminology and make the availability/source relationship natural.'),
(3246,'vi'):('correction','Không có ấn bản nào có thể sử dụng được từ dịch vụ sách được kết nối. Hãy kiểm tra ấn bản được yêu cầu và danh mục dịch vụ hoặc các nguồn cung cấp, rồi thử lại khi chúng sẵn sàng.','“Nguồn thu thập” is an awkward calque for acquisition sources; use a natural sourcing term.'),
(3248,'zh_Hant'):('correction','連線的漫畫服務無法接受此請求。請檢查其連線狀態和 ComicVine 中繼資料設定，然後重試。','Use Traditional Chinese connection/settings terminology and preserve ComicVine exactly.'),
(3249,'zh_Hans'):('correction','连接的漫画服务报告下载或导入失败。请检查其队列或日志以查明原因，在该服务中修复问题，然后在此重试。','Replace the literal “fix it there” with a clear instruction to fix the issue in the service.'),
(3249,'zh_Hant'):('correction','連線的漫畫服務回報下載或匯入失敗。請檢查其佇列或日誌以查明原因，在該服務中修復問題，然後在此重試。','Use Traditional Chinese for “connected” and make the service where the issue should be fixed explicit.'),
(3249,'vi'):('refinement','Dịch vụ truyện tranh được kết nối báo lỗi tải xuống hoặc nhập vào thư viện. Hãy kiểm tra hàng đợi hoặc nhật ký để tìm nguyên nhân, khắc phục tại dịch vụ đó rồi thử lại tại đây.','Clarify that “import” is an import into the library and smooth the instruction.'),
(3250,'es'):('correction','No hay ninguna versión utilizable disponible en el servicio de cómics conectado. Verifique el cómic solicitado y el catálogo del servicio o las fuentes de adquisición, y vuelva a intentarlo cuando estén disponibles.','Use the singular service catalog instead of “catálogo de servicios” and retain the availability condition.'),
(3250,'ar'):('refinement','لا يتوفر إصدار قابل للاستخدام من خدمة القصص المصورة المتصلة. تحقّق من القصة المصوّرة المطلوبة وكتالوج الخدمة أو مصادر الحصول على المحتوى، ثم أعد المحاولة عندما تكون جاهزة.','Replace the awkward acquisition-source wording with clear sources for obtaining the content.'),
(3250,'zh_Hant'):('correction','連線的漫畫服務沒有可用的版本。請檢查請求的漫畫以及服務目錄或取得來源，並在其準備就緒後重試。','Use Traditional Chinese connection terminology and make the service catalog/source wording clear.'),
(3250,'vi'):('correction','Không có bản phát hành nào có thể sử dụng được từ dịch vụ truyện tranh được kết nối. Hãy kiểm tra truyện tranh được yêu cầu và danh mục dịch vụ hoặc các nguồn cung cấp, rồi thử lại khi chúng sẵn sàng.','“Nguồn thu thập” is an awkward calque for acquisition sources; use a natural sourcing term.'),
(3251,'vi'):('refinement','Không thể hoàn thành yêu cầu này.','Use the concise natural Vietnamese construction for an unsuccessful request.'),
(3252,'zh_Hans'):('correction','此请求已被拒绝。','“要求” means a requirement/demand here; use the request term.'),
(3252,'zh_Hant'):('correction','此請求已被拒絕。','“要求” reads as a requirement/demand; use the request term in Traditional Chinese.'),
(3252,'ja'):('correction','このリクエストは却下されました。','“要求” reads as a demand/requirement; use the app’s request term.'),
(3252,'pt_BR'):('refinement','Esta solicitação foi recusada.','Use the same natural request term as the rest of the request-status UI instead of “pedido.”'),
(3253,'ar'):('correction','حذف','The current “تحذف” is third-person feminine, not a button action; use the delete action label.'),
(3254,'es'):('correction','Seerr cancelará todo el trabajo activo que pueda identificar, limpiará los registros temporales de solicitudes y eliminará permanentemente esta entrada y su historial.','Repair the current clause, which incorrectly makes the temporary-record cleanup part of what Seerr can identify.'),
(3254,'zh_Hans'):('correction','Seerr 将取消其能够识别的所有活动工作，清理临时请求记录，并永久删除此条目及其历史记录。','Use Chinese punctuation and clarify that Seerr cancels identifiable active work, then cleans and deletes the request entry.'),
(3254,'hi'):('correction','Seerr उन सभी सक्रिय कार्यों को रद्द कर देगा जिन्हें वह पहचान सकता है, अस्थायी अनुरोध रिकॉर्ड साफ़ करेगा, और इस प्रविष्टि तथा उसके इतिहास को स्थायी रूप से हटा देगा।','The current wording wrongly says active work can identify temporary records; separate the three actions.'),
(3254,'de'):('refinement','Seerr bricht alle aktiven Vorgänge ab, die es erkennen kann, bereinigt temporäre Anfrageeinträge und entfernt diesen Eintrag samt Verlauf dauerhaft.','Use natural German for identifiable active processes and the entry’s history.'),
(3254,'ja'):('correction','Seerrは、検出可能な進行中の処理をすべてキャンセルし、一時的なリクエスト記録を整理してから、この項目とその履歴を完全に削除します。','The current sentence attaches the identify/cleanup clause to the wrong object; state the three actions in order.'),
(3254,'fr'):('refinement','Seerr annulera toutes les tâches actives qu’il peut détecter, nettoiera les enregistrements temporaires de demande, puis supprimera définitivement cette entrée et son historique.','Use “enregistrements” for request records; “dossiers” means folders.'),
(3254,'pt_BR'):('correction','Seerr cancelará todas as tarefas ativas que conseguir identificar, limpará os registros temporários de solicitação e removerá permanentemente esta entrada e seu histórico.','The current infinitive sequence can attach cleanup to the wrong clause; express the three actions separately.'),
(3254,'ar'):('correction','سيُلغي Seerr جميع العمليات النشطة التي يستطيع تحديدها، وينظف سجلات الطلبات المؤقتة، ويحذف هذا السجل وتاريخه نهائيًا.','Repair the malformed opening conjunction and separate identifiable work, temporary records, and permanent deletion.'),
(3254,'ko'):('correction','Seerr는 식별할 수 있는 모든 활성 작업을 취소하고, 임시 요청 기록을 정리한 뒤 이 항목과 그 이력을 영구적으로 삭제합니다.','The current target says Seerr can cancel work; the source says it will cancel work it can identify, then clean and permanently delete.'),
(3254,'zh_Hant'):('correction','Seerr 將取消其可識別的所有進行中作業、清理暫存的請求記錄，並永久刪除此項目及其歷史記錄。','Replace mixed Simplified Chinese and punctuation; keep the three destructive effects distinct.'),
(3254,'vi'):('correction','Seerr sẽ hủy mọi tác vụ đang chạy mà hệ thống có thể nhận diện, dọn dẹp các bản ghi yêu cầu tạm thời, rồi xóa vĩnh viễn mục này cùng lịch sử của nó.','Use natural Vietnamese for active work and cleanly separate the three effects.'),
(3254,'id'):('refinement','Seerr akan membatalkan semua pekerjaan aktif yang dapat dikenali olehnya, membersihkan catatan permintaan sementara, dan menghapus entri ini beserta riwayatnya secara permanen.','Make explicit that Seerr can identify the active work, while retaining all three deletion effects.'),
(3255,'es'):('correction','No se pudo eliminar esta entrada de solicitud.','Replace the awkward literal “Incapaz de borrar” with the natural error message.'),
(3255,'zh_Hans'):('refinement','无法删除此请求条目。','Remove the stray space before the Chinese full stop.'),
(3255,'hi'):('correction','इस अनुरोध प्रविष्टि को हटाया नहीं जा सका।','Complete the current sentence fragment and preserve the request-entry meaning.'),
(3255,'pt_BR'):('correction','Não foi possível excluir esta entrada de solicitação.','Replace the awkward “Incapaz de apagar” fragment with a natural error message.'),
(3255,'ar'):('refinement','تعذّر حذف سجل الطلب.','Clarify that the deleted object is the request entry/record, not the request itself.'),
(3255,'zh_Hant'):('refinement','無法刪除此請求項目。','Remove the stray space before the Chinese full stop.'),
(3255,'vi'):('refinement','Không thể xóa mục yêu cầu này.','Use the natural request-item phrasing instead of the literal “mục nhập yêu cầu.”'),
(3256,'es'):('correction','Se eliminó la entrada de la solicitud.','The current phrase means a request for an entry; state that the request entry was deleted.'),
(3256,'zh_Hans'):('correction','请求条目已删除。','The current word order reads as a request to delete an entry; state that the entry was deleted.'),
(3256,'hi'):('correction','अनुरोध की प्रविष्टि हटा दी गई।','Correct grammatical gender and make clear the request entry was deleted.'),
(3256,'ja'):('correction','リクエスト項目を削除しました。','The current phrase means a request to delete an entry; state that the request entry was deleted.'),
(3256,'fr'):('correction','Entrée de la demande supprimée.','Clarify that the request entry was deleted, not that a request for an entry was deleted.'),
(3256,'pt_BR'):('correction','Entrada da solicitação excluída.','The current phrase means an entry request was deleted; state that the request entry was deleted.'),
(3256,'ar'):('refinement','تم حذف سجل الطلب.','Use the request-record term instead of the ambiguous “طلب الدخول.”'),
(3256,'zh_Hant'):('correction','請求項目已刪除。','The current word order reads as a request to delete an item; state that the request entry was deleted.'),
(3256,'vi'):('correction','Đã xóa mục yêu cầu.','Repair the incorrect word order in the current translation.'),
(3256,'id'):('refinement','Entri permintaan telah dihapus.','Make the completed deletion status explicit and natural.'),
(3257,'es'):('correction','¿Eliminar esta entrada de solicitud?','Add the required opening question mark.'),
(3257,'zh_Hans'):('refinement','要删除此请求条目吗？','Use Chinese question punctuation without the stray ASCII space/question mark.'),
(3257,'ja'):('correction','リクエスト項目を削除しますか？','The current value is a noun phrase rather than the confirmation question in the source.'),
(3257,'fr'):('refinement','Supprimer cette entrée de demande ?','Use French spacing before the question mark and the natural request-entry phrase.'),
(3257,'ar'):('refinement','هل تريد حذف سجل الطلب؟','Make the deletion title a natural Arabic confirmation question.'),
(3257,'zh_Hant'):('refinement','要刪除請求項目嗎？','Use Traditional Chinese question punctuation without the stray ASCII space.'),
(3257,'vi'):('refinement','Bạn có muốn xóa mục yêu cầu này không?','Use a natural Vietnamese confirmation question.'),
(3257,'id'):('correction','Hapus entri permintaan?','The current “Permintaan Masuk” means an incoming request, not a request entry.'),
(3258,'zh_Hans'):('refinement','删除此请求及其状态历史记录。','Use the clearer status-history term and remove the stray space before punctuation.'),
(3258,'fr'):('refinement','Supprimez cette demande et son historique des statuts.','Use the natural French plural for the request’s status history.'),
(3258,'ar'):('correction','احذف هذا الطلب وسجل حالته.','The current “يحذف” is third-person, not the tooltip action; use an imperative.'),
(3258,'zh_Hant'):('refinement','刪除此請求及其狀態歷史紀錄。','Use Traditional Chinese punctuation and a natural status-history term.'),
(3259,'zh_Hans'):('correction','删除中…','The current value uses Traditional Chinese characters in the Simplified Chinese catalog.'),
}

assert len(rows)==240 and len({(x['position'],x['locale']) for x in rows})==240
assert set(changes).issubset({(x['position'],x['locale']) for x in rows})
def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def placeholders(s): return sorted(re.findall(r'\{[^{}]+\}',s))
protected=['Bindery','ComicVine','Seerr']
out=[]
for r in rows:
    k=(r['position'],r['locale'])
    if k in changes: decision,target,rationale=changes[k]
    else:
        decision='accept-current'; target=r['currentTarget']
        rationale='Current translation accurately conveys the source in this request-status/destructive-action context; retain it.'
    assert placeholders(target)==placeholders(r['source']),(k,'placeholder mismatch')
    for token in protected:
        if token in r['source']:
            assert token in target,(k,'protected literal mismatch',token,target)
    out.append({
      'position':r['position'],'id':r['id'],'locale':r['locale'],'source':r['source'],'sourceSha256':r['sourceSha256'],
      'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetSha256'],
      'catalogTranslationHash':r['catalogTranslationHash'],'catalogPath':r['catalogPath'],
      'catalogFileSha256':r['catalogFileSha256'],'catalogGitBlob':r['catalogGitBlob'],
      'callerContextHashes':r['callerContextHashes'],'decision':decision,'proposedTarget':target,
      'proposedTargetSha256':sha(target),'proposedCatalogTranslationHash':sha(json.dumps(target,ensure_ascii=False,separators=(',',':'))),
      'rationale':rationale,
    })
assert len(out)==240
counts=Counter(x['decision'] for x in out)
summary={'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3240-W3259',
 'exactBaseHead':window['head'],'exactBaseTree':window['tree'],'cleanInputManifestSha256':input_manifest_sha,
 'sourceIds':20,'locales':12,'cells':240,'decisions':dict(counts),
 'changedCells':sum(counts[x] for x in ('correction','refinement')),'holds':counts.get('hold-context',0),
 'sourceCurrentAndFinalHashesVerified':True,'placeholderMismatches':0,'protectedLiteralMismatches':0,
 'orderedCatalogs':'key sets and per-locale ordered-key pins retained; no key/order edits proposed',
 'independentBlindReview':'pending; primary proposals withheld until independent ledger is sealed',
 'nativeSpeakerApproval':False}
primary_dir=root/'primary'
(primary_dir/'primary-decisions.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in out))
(primary_dir/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(primary_dir/'README.md').write_text('''# SeerrNG PR #418 primary review: W3240–W3259\n\nThis private primary ledger reviews 20 exact source IDs × 12 locales (240 cells) at the pinned input head/tree. It includes one disposition and rationale per cell, exact source/current/catalog pins, proposed targets and target hashes. It is separate from the clean-input packet and must remain sealed until the independent blind review is complete.\n\nThe review used the pinned production definition, caller, and server-key mapping excerpts. No repository files were edited. Machine-assisted review does not establish native-speaker approval.\n''')
print(json.dumps({'decisions':dict(counts),'changed':summary['changedCells'],'primaryDir':str(primary_dir)},ensure_ascii=False,indent=2))
