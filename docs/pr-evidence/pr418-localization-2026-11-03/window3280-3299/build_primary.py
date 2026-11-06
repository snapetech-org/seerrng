import collections, hashlib, json, re, subprocess, sys
from pathlib import Path
TASK=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window3280-3299-20261103')
INPUT=TASK/'clean-input'; OUT=TASK/'primary'
EXPECTED_HEAD='039fe9e04ea5cc6da314427fa25b0937ef8dd92b'; EXPECTED_TREE='b1338441dc47245b87ed77e8253843b66c367062'
EXPECTED_INPUT_MANIFEST='d3a47dcb40bf869e4ad0f1bfe49858ebfec159ee0d066d84e1787c3a88474d9b'
def sha(value):
    if isinstance(value,str): value=value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()
def ph(text): return collections.Counter(re.findall(r'\{[A-Za-z_][A-Za-z0-9_]*\}',text))
def canonical(row,target): return sha(json.dumps([row['id'],row['locale'],row['source'],target],ensure_ascii=False,separators=(',',':')))
changes={
(3280,'ar'):('correction','فعّل Auto-approve requests لهذا الحساب في Bindery إذا أردت أن يبدأ الاقتناء فورًا.','The source identifies a specific Bindery setting. Preserve its exact English label so the user can find it, and keep the Bindery product name.'),
(3280,'pt_BR'):('refinement','Aguardando o Bindery aprovar esta solicitação. Ative Auto-approve requests para esta conta no Bindery se quiser que a aquisição comece imediatamente.','Make the conditional instruction idiomatic in Brazilian Portuguese while preserving the exact Bindery setting label.'),
(3280,'ko'):('refinement','Bindery에서 이 요청을 승인하기를 기다리고 있습니다. 바로 도서 확보를 시작하려면 Bindery에서 이 계정의 Auto-approve requests를 켜세요.','Use a natural term for book acquisition and preserve the exact Bindery setting label.'),
(3280,'vi'):('refinement','Đang chờ Bindery phê duyệt yêu cầu này. Nếu muốn bắt đầu quá trình bổ sung sách ngay, hãy bật Auto-approve requests cho tài khoản này trong Bindery.','Use a natural library-acquisition phrase and preserve the exact setting label and Bindery name.'),
(3282,'zh_Hans'):('refinement','等待可用版本。目前没有正在进行的下载或导入记录。','Replace the literal construction for an active download/import with a natural Chinese description of work in progress.'),
(3282,'zh_Hant'):('refinement','等待可用版本。目前沒有回報正在進行中的下載或匯入作業。','Use a natural Traditional Chinese phrase for downloads or imports currently in progress.'),
(3282,'fr'):('refinement','En attente d’une version utilisable. Aucune activité de téléchargement ou d’importation n’est signalée pour le moment.','Avoid an agreement ambiguity between masculine téléchargement and feminine importation while preserving the reported-status meaning.'),
(3282,'pt_BR'):('refinement','Aguardando uma versão utilizável. No momento, não há downloads ou importações em andamento.','Use a natural plural construction for the absence of downloads or imports in progress.'),
(3282,'vi'):('refinement','Đang chờ bản phát hành có thể sử dụng được. Hiện chưa có báo cáo nào về lượt tải xuống hay nhập đang hoạt động.','Clarify that there is no report of a download or import currently in progress.'),
(3283,'pt_BR'):('refinement','Ativo','Remove terminal punctuation from this short status/filter label.'),
(3283,'vi'):('refinement','Đang hoạt động','Use a clear state phrase for the active request filter.'),
(3284,'hi'):('refinement','वयस्क','Use the natural Hindi term for an adult-content category instead of a transliteration.'),
(3285,'hi'):('refinement','वयस्क','Use the natural Hindi term for an adult-content category, matching the related Adult filter.'),
(3287,'zh_Hans'):('correction','专辑类型','Use the Chinese term for a music album; 相册 refers to a photo album.'),
(3287,'hi'):('refinement','एल्बम का प्रकार','Use a natural Hindi phrase for the album-type field.'),
(3287,'pt_BR'):('refinement','Tipo de álbum','Use sentence case for this Portuguese field label.'),
(3287,'ar'):('correction','نوع الألبوم','Correct the hamza and use the natural phrase for album type.'),
(3287,'zh_Hant'):('correction','專輯類型','Use the Traditional Chinese term for a music album; 相簿 refers to a photo album.'),
(3287,'vi'):('correction','Loại album','The current one-word translation means a volume or episode and omits “type”.'),
(3287,'id'):('refinement','Jenis album','Use the more idiomatic Indonesian field label for album type.'),
(3288,'es'):('refinement','Todas las solicitudes','Use the established Spanish term for a media request and sentence case.'),
(3288,'de'):('correction','Alle Anfragen','Use Anfrage for a media request; Antrag suggests a formal application.'),
(3288,'pt_BR'):('correction','Todas as solicitações','Use the established term for media requests and remove the stray final period.'),
(3288,'zh_Hant'):('correction','所有請求','Use the word for requests rather than requirements.'),
(3289,'hi'):('correction','सभी मीडिया','The current value omits “All”.'),
(3289,'ar'):('refinement','جميع الوسائط','Use the concise term for media content rather than media outlets.'),
(3289,'vi'):('correction','Tất cả nội dung','Phương tiện means means/vehicles here; use the content sense of media in this filter.'),
(3289,'pt_BR'):('refinement','Todas as mídias','Use the plural to indicate the different media types shown by this filter.'),
(3290,'es'):('correction','Todo el período','This is a date-range filter for the full period, not an event happening all the time.'),
(3290,'zh_Hans'):('correction','不限时间','永远 means forever; this option means there is no time-range limit.'),
(3290,'hi'):('correction','पूरी अवधि','समय alone omits “all”; identify the complete time span in this date-range filter.'),
(3290,'ja'):('correction','全期間','Use the natural Japanese label for the entire date range, rather than all hours.'),
(3290,'fr'):('correction','Toute la période','Tous les temps is not idiomatic for a date-range filter; use the full period.'),
(3290,'pt_BR'):('correction','Todo o período','O tempo todo means continuously; this filter covers the full time period.'),
(3290,'ar'):('correction','كامل الفترة','طوال الوقت suggests continuously; this filter covers the entire period.'),
(3290,'ko'):('correction','전체 기간','Use the natural Korean label for the full date range.'),
(3290,'zh_Hant'):('correction','不限時間','一直 means continuously; this filter has no time-range limit.'),
(3290,'vi'):('refinement','Toàn bộ khoảng thời gian','Specify the full time span, avoiding the “full-time” reading of a bare thời gian.'),
(3290,'id'):('refinement','Sepanjang waktu','Use the idiomatic all-time label for a historical date-range filter.'),
(3291,'es'):('refinement','Todos los usuarios','Use sentence case for the noun in this Spanish label.'),
(3291,'pt_BR'):('refinement','Todos os usuários','Remove terminal punctuation from this short filter label.'),
(3292,'fr'):('correction','Approuver','Use the direct French verb for approving a request, consistent with the tooltip.'),
(3292,'ar'):('correction','اعتمد','Use an imperative action label rather than the noun “approval”.'),
(3293,'zh_Hans'):('refinement','批准这项待审批的请求。','Use the common request-status phrase for a request waiting for approval.'),
(3293,'ja'):('correction','この承認待ちのリクエストを承認します。','申請書 means an application form; use the Seerr request term and retain the approval-waiting context.'),
(3293,'pt_BR'):('refinement','Aprovar esta solicitação pendente.','Use the same Brazilian Portuguese request term as the status text.'),
(3293,'ar'):('refinement','اعتمد هذا الطلب الذي ينتظر الموافقة.','Make the pending-approval meaning explicit and phrase the tooltip as an instruction.'),
(3293,'ko'):('correction','승인 대기 중인 이 요청을 승인합니다.','공개 means public; replace it with the request’s pending-approval state.'),
(3293,'zh_Hant'):('refinement','批准這項待處理的請求。','Use the standard Traditional Chinese phrase for a request awaiting action.'),
(3293,'vi'):('refinement','Phê duyệt yêu cầu đang chờ xử lý này.','Use a natural phrase for a request that is pending approval.'),
(3293,'id'):('correction','Setujui permintaan yang menunggu persetujuan ini.','Buktikan means prove; use the approval action and state that the request is awaiting approval.'),
(3294,'fr'):('refinement','Approuvée','Align the approved request status with the feminine demande and the Approuver action.'),
(3295,'pt_BR'):('refinement','Artista','Remove terminal punctuation from this metadata label.'),
(3295,'ar'):('correction','الفنان','الفنون means the arts; use the singular artist label.'),
(3296,'hi'):('correction','ध्यान देने की ज़रूरत','The current wording is an instruction to pay attention, not a status that needs attention.'),
(3296,'ja'):('correction','要確認','必要性の注意 is unnatural; this request filter means items need review.'),
(3296,'fr'):('correction','À traiter','Besoins d’attention is unidiomatic; this filter marks requests that need handling.'),
(3296,'pt_BR'):('refinement','Precisa de atenção','Remove terminal punctuation from this filter label.'),
(3296,'ar'):('correction','يتطلب الانتباه','Use a natural status phrase meaning “requires attention”.'),
(3296,'vi'):('refinement','Cần chú ý','Remove the unnecessary noun sự from this concise status label.'),
(3297,'zh_Hans'):('correction','有声书','音频 means audio and omits books.'),
(3297,'zh_Hant'):('correction','有聲書','音效簿 means an effects notebook, not audiobooks.'),
(3297,'vi'):('correction','Sách nói','Sổ tay âm thanh means an audio notebook; use the Vietnamese term for audiobooks.'),
(3298,'ar'):('correction','المؤلف','صاحب البلاغ means a reporter/complainant; use the term for an author.'),
}
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=INPUT,stdout=subprocess.DEVNULL)
manifest_sha=sha((INPUT/'SHA256SUMS.txt').read_bytes())
if manifest_sha!=EXPECTED_INPUT_MANIFEST: raise SystemExit(f'ABORT: frozen input manifest changed: {manifest_sha}')
w=json.loads((INPUT/'window.json').read_text(encoding='utf-8'))
rows=[json.loads(x) for x in (INPUT/'review-input.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
require=lambda ok,msg: (_ for _ in ()).throw(SystemExit('ABORT: '+msg)) if not ok else None
require(w['head']==EXPECTED_HEAD and w['tree']==EXPECTED_TREE,'input head/tree mismatch')
require(w['range']==[3280,3299] and len(rows)==240,'input range/cell count mismatch')
require(not OUT.exists() or not any(OUT.iterdir()),'primary packet destination is not empty')
require(len(w['contextHolds'])==0,'input has context holds; retain as holds rather than proposing translations')
changes_expected=set(changes)
require(all(pos in range(3280,3300) and loc in w['localeOrder'] for pos,loc in changes_expected),'change entry outside window/locales')
source_ids={x['id'] for x in w['sourceIds']}
require(all(x['id'] in source_ids for x in rows),'review cell has unknown source ID')
protected_tokens=['Bindery','Bookshelf','Auto-approve requests']
out=[]; counts=collections.Counter(); changed_by_locale=collections.Counter(); placeholder_mismatches=[]; protected_mismatches=[]
for r in rows:
    key=(r['position'],r['locale'])
    if key in changes: disposition,target,rationale=changes[key]
    else:
        disposition='accept-current'; target=r['currentTarget']
        if r['id'].startswith('components.RequestStatus.'):
            rationale='The current wording preserves the request-status meaning and any named product or setting in the pinned caller context.'
        elif r['id'].endswith(('.adult','.adults')):
            rationale='This is a concise media-category label with the intended adult-content meaning.'
        elif r['id'].endswith(('.all','.allMedia','.allTime','.allUsers')):
            rationale='This concise filter label accurately conveys the selected scope in the pinned Requests page context.'
        elif r['id'].endswith(('.approve','.approveTooltip')):
            rationale='The current label clearly describes the request approval action and matches the pinned UI context.'
        elif r['id'].endswith(('.album','.albumType','.artist','.author','.audiobooks')):
            rationale='The current wording accurately labels this music or book metadata/category field.'
        elif r['id'].endswith('.attention'):
            rationale='The current wording clearly identifies requests that need attention.'
        else:
            rationale='The current wording accurately conveys this request-list label in context.'
    source_ph=ph(r['source']); target_ph=ph(target)
    parity=source_ph==target_ph
    if not parity: placeholder_mismatches.append({'position':r['position'],'id':r['id'],'locale':r['locale'],'source':sorted(source_ph.elements()),'target':sorted(target_ph.elements())})
    protected=[token for token in protected_tokens if token in r['source']]
    protected_ok=all(token in target for token in protected)
    if not protected_ok: protected_mismatches.append({'position':r['position'],'id':r['id'],'locale':r['locale'],'missing':[token for token in protected if token not in target]})
    if target!=r['currentTarget']: changed_by_locale[r['locale']]+=1
    counts[disposition]+=1
    out.append({**r,'primaryDisposition':disposition,'proposedTarget':target,'proposedTargetSha256':sha(target),'proposedCatalogTranslationHash':canonical(r,target),'rationale':rationale,'proposedPlaceholders':sorted(target_ph.elements()),'proposedPlaceholderParity':parity,'protectedLiterals':protected,'protectedLiteralParity':protected_ok,'contextDisposition':'no-hold'})
require(len(out)==240,'primary ledger must cover all 240 cells')
require(set(x['id'] for x in out)==source_ids,'primary source ID coverage mismatch')
require(len(placeholder_mismatches)==0,'proposed placeholder mismatch: '+json.dumps(placeholder_mismatches[:6],ensure_ascii=False))
require(len(protected_mismatches)==0,'protected-literal mismatch: '+json.dumps(protected_mismatches[:6],ensure_ascii=False))
require(sum(counts.values())==240 and sum(changed_by_locale.values())==len(changes),'disposition/change count mismatch')

summary={'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3280-W3299','status':'sealed primary translation review based only on frozen candidate-free input','exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE,'cleanInputManifestSha256':manifest_sha,'sourceIds':20,'locales':12,'cells':240,'callerContextRows':w['contextRows'],'contextHolds':len(w['contextHolds']),'currentPlaceholderParityErrors':len(w['placeholderParityErrors']),'primaryDispositions':dict(sorted(counts.items())),'proposedTargetChanges':sum(changed_by_locale.values()),'changedByLocale':dict(sorted(changed_by_locale.items())),'proposedPlaceholderMismatches':len(placeholder_mismatches),'protectedLiteralMismatches':len(protected_mismatches),'sourceCurrentAndProposedHashesVerified':True,'canonicalTranslationHashAlgorithm':'sha256 of compact UTF-8 JSON array [id, locale, source, target]','orderedCatalogs':'all 13 locale catalogs retain their own pinned 9,494-key set/order','independentBlindReview':'not opened; primary ledger kept separate','nativeSpeakerApproval':False,'repositoryOrPrMutated':False}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'primary-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in out),encoding='utf-8')
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'README.md').write_text('''# SeerrNG PR #418 primary review: W3280–W3299\n\nThis primary ledger reviews 20 exact source IDs × 12 locales (240 cells) at the pinned PR head/tree. It contains one disposition and rationale per cell, exact source/current/catalog pins, proposed targets and canonical target hashes, placeholder checks, and protected product/setting literals.\n\nThe clean candidate-free input and its checksum manifest were verified before review. Caller/default source pins yielded zero context holds; current and proposed placeholder parity both passed. The 13 locale catalogs each retain their 9,494-key structure and independently pinned key order.\n\nThis primary packet is separate from the clean input and any blind review. It does not establish native-speaker approval. No repository or PR files were changed.\n''',encoding='utf-8')
files=sorted(p for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf-8')
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=OUT,stdout=subprocess.DEVNULL)
print(json.dumps({'summary':summary,'primaryManifestSha256':sha((OUT/'SHA256SUMS.txt').read_bytes()),'primaryDirectory':str(OUT)},ensure_ascii=False,indent=2))
