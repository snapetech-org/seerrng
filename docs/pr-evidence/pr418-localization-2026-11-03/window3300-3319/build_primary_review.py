import hashlib,json
from collections import Counter
from pathlib import Path
TASK=Path(__file__).resolve().parent
CLEAN=TASK/'clean-input'; OUT=TASK/'primary-private'
def sha(v):
    if isinstance(v,str): v=v.encode('utf-8')
    return hashlib.sha256(v).hexdigest()
proposals={
 (3302,'hi'):('correction','रद्द किया गया','The current infinitive means “to cancel”; this is a completed request status, so use a passive completed form.'),
 (3302,'fr'):('refinement','Annulée','The status describes a demande (feminine); match the feminine agreement used by the existing approved label.'),
 (3303,'ar'):('refinement','تغيير الخادم','Use the standard UI term for server; the current سيرفر is an unnecessary colloquial loan.'),
 (3303,'vi'):('correction','Đổi máy chủ','The existing máy phục vụ means a servicing machine; máy chủ is the Vietnamese UI term for a server.'),
 (3304,'zh_Hans'):('refinement','选择另一台服务器并重新提交此失败的请求。','Remove the space before punctuation and use the natural classifier for a server.'),
 (3304,'fr'):('refinement','Choisissez un autre serveur et soumettez à nouveau cette demande qui a échoué.','The current ratée is colloquial here; express the failed request directly and preserve resubmission.'),
 (3304,'pt_BR'):('refinement','Escolha outro servidor e envie novamente este pedido com falha.','Prefer the idiomatic “pedido com falha” over the Portugal-leaning falhado, keeping the established pedido term.'),
 (3304,'ar'):('correction','اختر خادمًا آخر وأعد تقديم هذا الطلب الذي فشل.','Fix the malformed verb construction and state that the request failed.'),
 (3304,'ko'):('correction','다른 서버를 선택하고 실패한 이 요청을 다시 제출하세요.','The current string leaves resubmit in English; translate the action as “submit again”.'),
 (3304,'zh_Hant'):('refinement','選擇另一台伺服器並重新提交此失敗的請求。','Remove the space before punctuation and use the natural classifier for a server.'),
 (3304,'vi'):('correction','Chọn một máy chủ khác và gửi lại yêu cầu không thành công này.','The current “khôi phục yêu cầu sai” means restore an incorrect request; state that the failed request is submitted again.'),
 (3308,'ja'):('refinement','完了','Use the concise status label, consistent with the locale’s other request-status labels; 完了しました reads as a full sentence.'),
 (3309,'ja'):('correction','国','カントリー is an unnatural English loan for the Country field; 国 is the ordinary label.'),
 (3310,'zh_Hans'):('refinement','创作者','创作者 is the established role term for a television creator; 创建者 reads as a generic record creator.'),
 (3310,'hi'):('refinement','रचनाकार','रचनाकार names the credited creator; निर्माता can instead suggest a producer.'),
 (3310,'ar'):('refinement','المُبدع','This credit is a work’s creator; المُبدع is more natural than the religiously loaded الخالق.'),
 (3310,'zh_Hant'):('refinement','創作者','創作者 is the usual credited-role term; 建立者 reads as a generic record creator.'),
 (3310,'vi'):('correction','Người sáng tạo','Tạo is a verb (“create”), not the person credited as the creator.'),
 (3311,'ja'):('refinement','拒否','A concise action label is more natural on this button than the infinitive 拒否する.'),
 (3312,'ja'):('correction','この保留中のリクエストを拒否します。','The current string says to close the application, not decline the pending request.'),
 (3312,'ar'):('correction','ارفض هذا الطلب المعلّق.','The current text says to decide on the request; it omits the decline action.'),
 (3312,'ko'):('correction','대기 중인 요청을 거절하세요.','The current text says to decide the pending request; it omits the decline action.'),
 (3312,'zh_Hant'):('refinement','拒絕此待處理的請求。','Improve the pending-request phrase and remove the space before punctuation.'),
 (3312,'vi'):('correction','Từ chối yêu cầu đang chờ này.','The current text says to cancel the pending request; decline and cancel are distinct actions.'),
 (3312,'id'):('correction','Tolak permintaan tertunda ini.','Batalkan means cancel; the source action is decline/refuse.'),
 (3313,'es'):('refinement','Rechazada','The status is an adjective for a feminine solicitud; match Cancelada in this locale.'),
 (3313,'fr'):('refinement','Refusée','The status modifies a feminine demande; match the feminine agreement used by Approuvée.'),
 (3316,'es'):('refinement','No se pudo eliminar esta entrada de solicitud.','Incapaz de borrar is an awkward literal construction for a UI error; use the conventional impersonal form.'),
 (3316,'zh_Hans'):('refinement','无法删除此请求条目。','Remove the stray space before punctuation and keep the failure statement concise.'),
 (3316,'de'):('correction','Dieser Anfrageeintrag kann nicht gelöscht werden.','The current subject and verb do not agree: Anfrageeintrag is singular, but kann nicht deleted is missing the subject form.'),
 (3316,'pt_BR'):('refinement','Não foi possível excluir esta entrada de solicitação.','Incapaz de is an awkward literal rendering; use the ordinary impersonal error message.'),
 (3316,'ar'):('refinement','تعذّر حذف سجل هذا الطلب.','Name the request record directly; the current wording omits the entry/record and uses an awkward unanchored “unable”.'),
 (3316,'zh_Hant'):('refinement','無法刪除此要求項目。','Remove the space before punctuation and retain the clear request-entry meaning.'),
 (3316,'vi'):('refinement','Không thể xoá mục yêu cầu này.','mục nhập is a form-field calque here; use the natural request-item phrase.'),
 (3317,'zh_Hans'):('correction','请求条目已删除。','The current word order reads like a request to delete an entry; state that the request entry was deleted.'),
 (3317,'hi'):('correction','अनुरोध प्रविष्टि हटा दी गई।','प्रविष्टि is feminine, so the current masculine हटाया दिया agreement is incorrect.'),
 (3317,'ja'):('correction','リクエスト項目を削除しました。','The current string means “request for entry deletion,” not that the request entry was deleted.'),
 (3317,'fr'):('correction',"L'entrée de la demande a été supprimée.",'The current phrase can mean a request for an entry; make the request entry the object that was removed.'),
 (3317,'pt_BR'):('refinement','O registro da solicitação foi excluído.','Clarify that the request record was deleted; the current “pedido de entrada” reads as an entry order.'),
 (3317,'ar'):('correction','تم حذف سجل الطلب.','الدخول means entrance/login; the source is the request record, not an access request.'),
 (3317,'zh_Hant'):('correction','要求項目已刪除。','The current wording reads as an instruction/request to delete an item; state the completed result.'),
 (3317,'vi'):('correction','Mục yêu cầu đã được xoá.','The current word order reads as a request to delete an item; state that the request item was deleted.'),
 (3317,'id'):('refinement','Entri permintaan telah dihapus.','Use the natural Indonesian noun phrase for a request entry.'),
}
hold_notes={
 'components.Requests.bookAndAudiobook':'No direct components.Requests production reference exists at the pinned head; retain all locale values unchanged until the source-ID use is established.',
 'components.Requests.delete':'The Requests namespace definition has no direct production reference; the separate RequestStatus namespace action is context only and does not establish this ID’s caller.',
 'components.Requests.deleteDescription':'No direct production reference to this Requests ID was found. The separate RequestStatus delete-description renderer is context only; keep all 12 cells held and unchanged pending caller resolution.',
 'components.Requests.deleteTitle':'No direct production reference to this Requests ID was found. The separate RequestStatus confirmation-title renderer is context only; keep all 12 cells held and unchanged pending caller resolution.',
 'components.Requests.deleteTooltip':'No direct production reference to this Requests ID was found. The separate RequestStatus tooltip renderer is context only; keep all 12 cells held and unchanged pending caller resolution.',
}
if OUT.exists(): raise SystemExit('ABORT: primary-private already exists; preserve existing output')
rows=[json.loads(line) for line in (CLEAN/'review-input.jsonl').read_text(encoding='utf-8').splitlines()]
window=json.loads((CLEAN/'window.json').read_text(encoding='utf-8'))
manifest_sha=sha((CLEAN/'SHA256SUMS.txt').read_bytes())
records=[]; counts=Counter(); per_id=Counter()
for cell in rows:
    key=(cell['position'],cell['locale'])
    if cell['eligibility']=='hold-context':
        disposition='hold-context'; candidate=None; why=hold_notes[cell['id']]
    elif key in proposals:
        disposition,candidate,why=proposals[key]
    else:
        disposition='accept-current'; candidate=None
        why='Current translation conveys the source meaning naturally in this locale and fits its pinned UI/caller context; no placeholder or protected-literal issue was found.'
    if candidate is not None:
        if sorted(__import__('re').findall(r'\{[A-Za-z_][A-Za-z0-9_]*\}',candidate)) != cell['sourcePlaceholders']:
            raise SystemExit(f'ABORT: proposal placeholder mismatch {cell["id"]}/{cell["locale"]}')
        for term in cell['sourceProtectedLiterals']:
            import re
            if not re.search(r'(?<![\w])'+re.escape(term)+r'(?![\w])',candidate,re.I):
                raise SystemExit(f'ABORT: proposal drops protected literal {term} {cell["id"]}/{cell["locale"]}')
    target=candidate if candidate is not None else cell['currentTarget']
    record={
      'position':cell['position'],'id':cell['id'],'locale':cell['locale'],
      'source':cell['source'],'sourceSha256':cell['sourceSha256'],
      'currentTarget':cell['currentTarget'],'currentTargetSha256':cell['currentTargetSha256'],
      'currentCatalogTranslationHash':cell['currentCatalogTranslationHash'],
      'primaryDisposition':disposition,'primaryReason':why,
      'primaryTarget':candidate,
      'primaryTargetSha256':sha(candidate) if candidate is not None else None,
      'primaryCatalogTranslationHash':sha(json.dumps([cell['id'],cell['locale'],cell['source'],target],ensure_ascii=False,separators=(',',':'))),
      'sourcePlaceholders':cell['sourcePlaceholders'],'currentPlaceholders':cell['currentPlaceholders'],
      'placeholderParity':cell['placeholderParity'],
      'sourceProtectedLiterals':cell['sourceProtectedLiterals'],'currentProtectedLiterals':cell['currentProtectedLiterals'],
      'callerContextHashes':cell['callerContextHashes'],'callerContextResolved':cell['callerContextResolved'],
      'callerExists':cell['callerExists'],'eligibility':cell['eligibility'],
      'inputManifestSha256':manifest_sha,
    }
    records.append(record); counts[disposition]+=1; per_id[(cell['id'],disposition)]+=1
assert len(records)==240 and len({(x['position'],x['locale']) for x in records})==240
assert counts['hold-context']==60 and sum(counts.values())==240
assert not [r for r in records if r['primaryDisposition']=='hold-context' and r['primaryTarget'] is not None]
OUT.mkdir(parents=True)
(OUT/'primary-review.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in records),encoding='utf-8')
summary={'repository':'snapetech-org/seerrng','pullRequest':418,'range':[3300,3319],'head':window['head'],'tree':window['tree'],'inputManifestSha256':manifest_sha,'sourceCount':20,'localeCount':12,'cellCount':240,'decisionCounts':dict(counts),'proposalCount':sum(1 for x in records if x['primaryTarget'] is not None),'holdIds':{k:12 for k in hold_notes},'callerContextHolds':60,'placeholderParityErrorsInInput':len(window['placeholderParityErrors']),'protectedTermOccurrenceCount':sum(bool(r['sourceProtectedLiterals']) for r in records),'nativeSpeakerApproval':False,'findings':'Machine-assisted primary review; held cells retain current values and have no candidate. Root/independent adjudication remains separate.'}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'README.md').write_text(f'''# Primary review: SeerrNG PR #418 W3300–W3319\n\nThis primary linguistic/context ledger reviews 240 cells (20 source IDs × 12 direct locales) at PR head `{window['head']}` / tree `{window['tree']}`. The clean input is pinned by SHA-256 `{manifest_sha}`. It includes exact source/current target hashes, canonical translation hashes, direct caller/context pins, placeholder schemas, and source/current protected-literal occurrences.\n\n## Disposition\n\n- Accept current: {counts['accept-current']}\n- Corrections: {counts['correction']}\n- Refinements: {counts['refinement']}\n- Hold for caller context: {counts['hold-context']}\n- Placeholder parity exceptions in the frozen input: {len(window['placeholderParityErrors'])}\n\nThe 60 held cells cover the 12 locales for `components.Requests.bookAndAudiobook`, `components.Requests.delete`, `components.Requests.deleteDescription`, `components.Requests.deleteTitle`, and `components.Requests.deleteTooltip`. At this exact head, each has a pinned message definition but no direct `components.Requests` production caller. Related `components.RequestStatus` action rendering was retained as context and does not prove a caller for these separately namespaced catalog IDs. Held current values remain unchanged; no proposal is supplied for them.\n\nThe input records the protected product literal `Seerr` in all 12 `deleteDescription` source/current cells; because those cells are held, their translations are not proposed here. Eligible candidate proposals are checked against source placeholders and protected literals before writing the ledger. Every accepted-current row has a primary rationale.\n\nThis is machine-assisted review, not native-speaker approval. Independent review and root adjudication remain separate. No repository or PR files were changed.\n''',encoding='utf-8')
files=sorted(x for x in OUT.rglob('*') if x.is_file() and x.name!='SHA256SUMS.txt')
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(x.read_bytes())}  {x.relative_to(OUT).as_posix()}\n' for x in files),encoding='utf-8')
print(json.dumps({'counts':dict(counts),'proposals':sum(1 for x in records if x['primaryTarget'] is not None),'inputManifestSha256':manifest_sha,'primaryManifestSha256':sha((OUT/'SHA256SUMS.txt').read_bytes()),'primaryDirectory':str(OUT)},ensure_ascii=False,indent=2))
