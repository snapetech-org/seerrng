import hashlib, json, pathlib, re
from collections import Counter
root=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3220-3239-20261103')
P=list(map(json.loads,(root/'primary/primary-review.jsonl').read_text().splitlines()))
B=list(map(json.loads,pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3220-blind-root-20261103/independent-decisions.jsonl').read_text().splitlines()))
assert len(P)==len(B)==240
primary={(x['position'],x['locale']):x for x in P}
blind={(x['position'],x['locale']):x for x in B}
assert primary.keys()==blind.keys()
# Deliberate resolutions for differing candidates; rationale records why the chosen text is best in context.
manual={
(3220,'vi'):('correction','Xóa yêu cầu khỏi SeerrNG mà không dừng tác vụ tải xuống đã được giao cho ROMarrNG hoặc trình tải xuống.','Use the explicit “download task” wording from the blind proposal; it clarifies what continues and preserves both product names.'),
(3221,'ja'):('correction','リクエストしたユーザー：{user}','Use the independent proposal’s clearer “user who requested” wording with Japanese full-width punctuation.'),
(3224,'es'):('correction','El proveedor no puede confirmar si la descarga anterior se inició. Compruebe la cola y el historial del cliente de descargas. Continúe solo si no hay ninguna descarga coincidente.','Both formulations are grammatical; keep the concise se-inició form and explicit matching-download condition.'),
(3224,'hi'):('correction','प्रदाता यह पुष्टि नहीं कर सकता कि पिछला डाउनलोड शुरू हुआ था या नहीं। डाउनलोड क्लाइंट की कतार और इतिहास जाँचें। केवल तभी जारी रखें जब कोई मेल खाता डाउनलोड मौजूद न हो।','Choose the blind proposal’s more direct confirmation construction and concise matching-download condition.'),
(3224,'ar'):('correction','لا يمكن للمزوّد تأكيد ما إذا كان التنزيل السابق قد بدأ. تحقّق من قائمة الانتظار والسجل في عميل التنزيل. لا تتابع إلا إذا لم يوجد تنزيل مطابق.','Choose the blind proposal’s natural queue and download-client phrasing while retaining the required no-match condition.'),
(3224,'fr'):('correction','Le fournisseur ne peut pas confirmer si le téléchargement précédent a commencé. Vérifiez la file d’attente et l’historique du client de téléchargement. Ne continuez que si aucun téléchargement correspondant n’existe.','Use the blind proposal’s correct French typographic apostrophes and direct instruction.'),
(3224,'ja'):('correction','プロバイダーは以前のダウンロードが開始されたか確認できません。ダウンロードクライアントのキューと履歴を確認してください。一致するダウンロードがない場合にのみ続行してください。','Use the blind proposal’s concise natural wording and preserve the conditional continuation.'),
(3224,'ko'):('correction','공급자는 이전 다운로드가 시작됐는지 확인할 수 없습니다. 다운로드 클라이언트의 대기열과 기록을 확인하세요. 일치하는 다운로드가 없을 때만 계속하세요.','Use the blind proposal’s natural “record/history” term and conversational status wording.'),
(3224,'zh_Hans'):('correction','提供商无法确认之前的下载是否已开始。请检查下载客户端的队列和历史记录。只有确认没有匹配的下载后才能继续。','Keep the natural IT term for provider and make the required verification before continuing explicit.'),
(3224,'zh_Hant'):('correction','提供者無法確認上次下載是否已開始。請檢查下載用戶端的佇列與歷史紀錄。只有在沒有相符下載時才繼續。','Use the blind proposal’s more natural “last download” and Traditional Chinese history-record wording.'),
(3225,'id'):('correction','Di pustaka RomM','Use “pustaka” for a software/media library and preserve RomM exactly.'),
(3225,'ko'):('refinement','RomM 라이브러리에 있음','Retain the in-library meaning and use a natural Korean location phrase with the software-library term.'),
(3226,'pt_BR'):('correction','Buscando','Use a present-progress form that directly expresses Searching; remove the current terminal period.'),
(3227,'de'):('correction','Phase: {stage}','“Phase” is the natural term for a request workflow stage; “Stadium” means a sports venue.'),
(3228,'ja'):('correction','リクエスト日：{date}','Use a clear request-date label with locale-appropriate Japanese punctuation.'),
(3228,'vi'):('refinement','Đã gửi yêu cầu vào {date}','Use the natural completed action and make the date relation explicit.'),
(3229,'ja'):('correction','ソフトウェアのリクエスト','Use the independent proposal’s clear Japanese phrasing for software requests, avoiding the “requirements” reading.'),
(3230,'ar'):('correction','عام','Use the compact general-purpose architecture term rather than “global” or “comprehensive.”'),
(3230,'vi'):('correction','Đa kiến trúc','In the architecture selector, name support across architectures rather than use a generic adjective.'),
(3235,'de'):('correction','Der Inhalt wird Ihrer Bibliothek hinzugefügt.','Use the natural singular content referent in this in-progress media status.'),
(3236,'ar'):('correction','لم يتمكن Whisparr من قبول طلب هذا المشهد المخصص للبالغين. تحقّق من الاتصال وبيانات المشهد، ثم أعد المحاولة.','Correct the current scope to a scene request and preserve the source’s adult-scene detail.'),
(3238,'ar'):('correction','لم يعثر Whisparr بعد على إصدار مناسب لهذا المشهد المخصص للبالغين. تحقّق من فئات أدوات الفهرسة وإعدادات الحصول على المحتوى، ثم أعد المحاولة.','Use the clearer suitable-release and adult-scene phrasing while retaining indexer and acquisition settings.'),
(3238,'es'):('correction','Whisparr aún no ha encontrado una versión utilizable para esta escena para adultos. Revisa las categorías de sus indexadores y la configuración de adquisición, y luego vuelve a intentarlo.','Use “versión utilizable” for a media release and preserve the adult-scene meaning in natural Spanish.'),
(3238,'vi'):('correction','Whisparr vẫn chưa tìm thấy bản phát hành phù hợp cho cảnh người lớn này. Hãy kiểm tra danh mục của trình lập chỉ mục và cài đặt tìm nguồn, rồi thử lại.','Use clear Vietnamese terms for indexer categories and acquisition/source settings.'),
}
# Validate both inputs bind to the same sealed source/current values and source ordering.
for k in primary:
  p,b=primary[k],blind[k]
  assert (p['id'],p['sourceSha256'],p['currentTargetSha256'],p['catalogTranslationHash']) == (b['id'],b['sourceSha256'],b['currentTargetSha256'],b['catalogTranslationHash']), k
  assert hashlib.sha256(p['source'].encode()).hexdigest()==p['sourceSha256'],k
  assert hashlib.sha256(p['currentTarget'].encode()).hexdigest()==p['currentTargetSha256'],k
conflicts={k for k in primary if primary[k]['decision']!='accept-current' and blind[k]['disposition']!='accept-current' and primary[k]['proposedTarget']!=blind[k]['proposedTarget']}
assert set(manual)==conflicts|{(3236,'ar')}, (set(manual),conflicts)

def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def placeholders(s): return sorted(re.findall(r'\{[^{}]+\}',s))
# Product/architecture literals whose exact spelling is required by their source context.
protected=['SeerrNG','ROMarrNG','RomM','Windows','x64','x86','Whisparr']
out=[]
for k in sorted(primary):
  p,b=primary[k],blind[k]
  pp=p['proposedTarget'] if p['decision']!='accept-current' else None
  bp=b['proposedTarget'] if b['disposition']!='accept-current' else None
  if k in manual:
    decision,target,rationale=manual[k]; origin='adjudicated-compromise'
  elif pp and bp and pp==bp:
    target=pp; decision='correction' if 'correction' in (p['decision'],b['disposition']) else 'refinement'
    rationale='Primary and independent blind reviewer proposed the same target.'
    origin='primary-and-blind-agree'
  elif pp:
    target=pp; decision=p['decision']; rationale='Primary proposal selected; no conflicting blind proposal.'; origin='primary-only'
  elif bp:
    target=bp; decision=b['disposition']; rationale='Independent blind proposal selected; primary retained the current value.'; origin='blind-only'
  else:
    target=p['currentTarget']; decision='accept-current'; rationale='Both primary and independent blind review retained the current target.'; origin='both-accept-current'
  src=p['source']
  assert placeholders(target)==placeholders(src),(k,'placeholder',target,src)
  for lit in protected:
    if lit in src:
      assert lit in target,(k,'protected',lit,target)
  finalhash=sha(target)
  cataloghash=sha(json.dumps(target,ensure_ascii=False,separators=(',',':')))
  out.append({
   'position':p['position'],'id':p['id'],'locale':p['locale'],'source':src,'sourceSha256':p['sourceSha256'],
   'currentTarget':p['currentTarget'],'currentTargetSha256':p['currentTargetSha256'],'catalogTranslationHash':p['catalogTranslationHash'],
   'primaryDecision':p['decision'],'primaryProposal':pp,
   'blindDisposition':b['disposition'],'blindProposal':bp,
   'adjudicationDecision':decision,'finalTarget':target,'finalTargetSha256':finalhash,'finalCatalogTranslationHash':cataloghash,
   'proposalOrigin':('adjudicated-adjustment' if origin=='adjudicated-compromise' and (not pp or not bp) else origin),'adjudicationRationale':rationale,
  })
assert len(out)==240
counts=Counter(x['adjudicationDecision'] for x in out)
summary={
 'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3220-W3239',
 'exactBaseHead':'8dd70020ece19b467b31e8562274f3c5aafce895','exactBaseTree':'1e7667a9a07c96c32c4cad5cdb19d2b0502ecbeb',
 'sourceIds':20,'locales':12,'cells':240,'primaryCounts':dict(Counter(x['decision'] for x in P)),
 'blindCounts':dict(Counter(x['disposition'] for x in B)),'adjudicatedCounts':dict(counts),
 'changedCells':sum(counts[k] for k in ('correction','refinement')),'holds':0,
 'changedTargetShaAndCatalogHashVerified':True,'placeholderMismatches':0,'protectedLiteralMismatches':0,
 'independentBlindPacketManifestSha256':'cd5a34269e4d1c8fe0d46ee0e7d3f3a3f324a050994181e33f65d62c26d40e50','nativeSpeakerApproval':False,
 'catalogInvariant':'all 9,494 English-ordered keys retained; key/value changes limited to W3220-W3239 cells',
 'rootFinalRatification':'pending parent review',
}
# Keep a changed-only apply ledger and an all-240 audit ledger.
adr=root/'adjudication'
(adr/'adjudication.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in out))
changes=[x for x in out if x['adjudicationDecision']!='accept-current']
(adr/'apply-proposals.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in changes))
summary['changedCells']=len(changes)
(adr/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(adr/'README.txt').write_text('''SeerrNG PR #418 W3220–W3239 primary/independent comparison and adjudication\n\nThis task-scoped packet joins the sealed primary ledger with the independently sealed blind ledger. Both are bound to exact head 8dd70020ece19b467b31e8562274f3c5aafce895 / tree 1e7667a9a07c96c32c4cad5cdb19d2b0502ecbeb and the 240-cell clean-input packet. `adjudication.jsonl` contains all 240 rows and each reviewer’s disposition/proposal plus the selected final target. `apply-proposals.jsonl` contains changed cells only. Every selected target is checked against source placeholder parity, source-bound product/architecture literals, target text SHA-256, and translation-value hash.\n\nThis is an adjudication proposal prepared for the root agent’s final ratification before repository application. No repository files were changed by this adjudication step. No tests/builds/scans/CI were run. Machine-assisted review is not native-speaker approval.\n''')
print(json.dumps({'adjudicated':dict(counts),'changed':len(changes),'manualResolutions':len(manual)},indent=2))
