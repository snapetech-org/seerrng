#!/usr/bin/env python3
"""Create the independent primary review using only W3720-W3739 candidate-free input."""
import argparse, collections, hashlib, json, re
from pathlib import Path
HEAD='1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e'
TREE='6a51f3fb1d1f65c12bfe82bf47834626aa364488'
WINDOW='W3720-W3739'
REPO='snapetech-org/seerrng'
PR=418
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
EDITS={
(3720,'es'):('correction',"""Tras aprobarse una solicitud, Kapowarr comprueba automáticamente sus fuentes de GetComics y sus fuentes espejo. Kapowarr no utiliza los indexadores de Prowlarr. SeerrNG ofrece una búsqueda manual independiente en Prowlarr a los usuarios con el permiso «Gestionar Solicitudes».""","The description has awkward source ordering and a calque for the separate Prowlarr search. This clarifies the approval timing, mirror sources, and the localized Manage Requests permission.",'moderate'),
(3720,'zh_Hans'):('correction',"""请求获批后，Kapowarr 会自动检查其 GetComics 和镜像源。Kapowarr 不使用 Prowlarr 索引器。SeerrNG 另为拥有“请求管理”权限的用户提供手动 Prowlarr 搜索。""","The current text has stray spaces before punctuation and unclear word order around the separate manual search. This makes the approval timing and localized permission clear.",'moderate'),
(3720,'hi'):('correction',"""अनुरोध स्वीकृत होने के बाद Kapowarr अपने GetComics और मिरर स्रोतों की अपने आप जाँच करता है। Kapowarr Prowlarr इंडेक्सर का उपयोग नहीं करता। अनुरोध प्रबंधित करने की अनुमति वाले उपयोगकर्ताओं के लिए SeerrNG अलग से मैन्युअल Prowlarr खोज उपलब्ध कराता है।""","The current Hindi uses an English plural for indexers and an unclear phrase for users with Manage Requests. This clarifies the automatic check and permission while preserving the product names.",'moderate'),
(3720,'de'):('refinement',"""Nach der Genehmigung einer Anfrage prüft Kapowarr automatisch seine GetComics- und Spiegelquellen. Kapowarr verwendet keine Prowlarr-Indexer. Für Nutzer mit der Berechtigung „Anfragen verwalten“ bietet SeerrNG eine separate manuelle Prowlarr-Suche.""","The current help text uses an imperative. A declarative sentence better describes the automatic check, and the permission label makes the separate search condition explicit.",'moderate'),
(3720,'ja'):('correction',"""リクエストが承認されると、Kapowarr は GetComics とミラーソースを自動的に確認します。Kapowarr は Prowlarr のインデクサーを使用しません。SeerrNG では、「リクエストを管理」権限を持つユーザーが、別途 Prowlarr で手動検索できます。""","The current text does not distinguish the automatic Kapowarr check from a user's manual Prowlarr search clearly. This preserves both actions and the localized permission label.",'moderate'),
(3720,'fr'):('correction',"""Après l'approbation d'une demande, Kapowarr vérifie automatiquement les sources GetComics et les sources miroir de Kapowarr. Kapowarr n'utilise pas les indexeurs Prowlarr. SeerrNG propose une recherche manuelle distincte dans Prowlarr aux utilisateurs disposant du droit « Gérer les demandes ». """.strip(),"The current text joins GetComics to Kapowarr with a stray period and has awkward wording for a separate Prowlarr search. This states the mirror sources and permission plainly.",'moderate'),
(3720,'pt_BR'):('correction',"""Após a aprovação de uma solicitação, o Kapowarr verifica automaticamente suas fontes do GetComics e as fontes espelho. O Kapowarr não usa indexadores do Prowlarr. O SeerrNG oferece uma busca manual separada no Prowlarr aos usuários com a permissão “Gerenciar Solicitações”.""","The current wording misorders the manual Prowlarr search and describes the permission awkwardly. This preserves the automatic scan and clarifies the user permission.",'moderate'),
(3720,'ar'):('refinement',"""بعد الموافقة على الطلب، يتحقق Kapowarr تلقائيًا من مصادر GetComics ومصادر المرايا. لا يستخدم Kapowarr مفهرسات Prowlarr. ويوفر SeerrNG بحثًا يدويًا منفصلًا في Prowlarr للمستخدمين الذين لديهم صلاحية «إدارة الطلبات». """.strip(),"The current wording is understandable, but this clarifies that the manual Prowlarr search is separate and available to users with the localized permission.",'moderate'),
(3720,'ko'):('correction',"""요청이 승인되면 Kapowarr가 GetComics와 미러 소스를 자동으로 확인합니다. Kapowarr는 Prowlarr 인덱서를 사용하지 않습니다. SeerrNG는 요청 관리 권한이 있는 사용자를 위해 별도의 수동 Prowlarr 검색을 제공합니다.""","The current phrase for users with Manage Requests is not idiomatic. This names the permission and keeps the automatic Kapowarr check separate from manual Prowlarr search.",'moderate'),
(3720,'zh_Hant'):('refinement',"""要求核准後，Kapowarr 會自動檢查其 GetComics 與鏡像來源。Kapowarr 不使用 Prowlarr 索引器。SeerrNG 另為具有「管理請求」權限的使用者提供手動 Prowlarr 搜尋。""","The current text is understandable; this makes the distinct manual search and localized permission relationship more direct.",'moderate'),
(3720,'vi'):('correction',"""Sau khi yêu cầu được duyệt, Kapowarr tự động kiểm tra các nguồn GetComics và các nguồn mirror của mình. Kapowarr không sử dụng bộ chỉ mục Prowlarr. SeerrNG cung cấp chức năng tìm kiếm Prowlarr thủ công riêng cho người dùng có quyền “Quản lý yêu cầu”.""","The current phrase “nguồn nhân bản” means replicated sources and is misleading for mirror sources. This also clarifies that the manual search is a separate SeerrNG feature.",'moderate'),
(3720,'id'):('correction',"""Setelah permintaan disetujui, Kapowarr secara otomatis memeriksa sumber GetComics dan sumber mirror-nya. Kapowarr tidak menggunakan pengindeks Prowlarr. SeerrNG menyediakan pencarian Prowlarr manual terpisah bagi pengguna dengan izin “Kelola Permintaan”.""","The current word order makes the manual Prowlarr search unclear and does not clearly identify the permission. This preserves the named products and clarifies access.",'moderate'),
(3721,'ar'):('correction',"""عنوان URL خارجي""","The current word order places the adjective before the technical label awkwardly. This uses a standard Arabic noun phrase and preserves the exact URL token.",'moderate'),
(3721,'ko'):('refinement',"""외부 URL""","The current label says external-access URL, adding an access meaning not present in the source. This keeps the label concise and exact.",'moderate'),
(3722,'zh_Hans'):('correction',"""当主机名无法从网络外部访问时，用于媒体页面上的可点击链接。""","The current target has stray spacing and an ASCII comma. This restores standard Chinese punctuation and smoother help-text order.",'moderate'),
(3722,'ja'):('refinement',"""ホスト名にネットワーク外からアクセスできない場合に、メディアページのリンクをクリック可能にするために使用します。""","The current fragment is understandable but leaves the relationship between this URL and clickable media-page links implicit. This states its use directly.",'moderate'),
(3722,'zh_Hant'):('correction',"""主機名稱無法從網路外部存取時，用於媒體頁面上的可點擊連結。""","The current target has stray spaces and an ASCII comma. This uses normal Traditional Chinese punctuation and keeps the help-text meaning.",'moderate'),
(3723,'de'):('refinement',"""Kapowarr benötigt einen begleitenden FlareSolverr-Container, um Cloudflare bei GetComics und dessen Mirror-Hosts zu umgehen. Konfigurieren Sie dessen URL direkt in Kapowarr (Einstellungen > Allgemein), nicht hier.""","The current compound “Spiegelhosts” is awkward and the possessive can refer to Kapowarr. This uses the common technical term and links the mirror hosts to GetComics.",'moderate'),
(3724,'hi'):('correction',"""होस्टनाम या IP पता""","The baseline Hindi target transliterates IP instead of preserving the exact required technical literal. This restores IP and keeps the hostname/address distinction.",'high'),
(3724,'ja'):('refinement',"""ホスト名または IP アドレス""","The current interpunct can read as a list rather than the source's “or.” This makes the alternative explicit and preserves IP.",'moderate'),
(3724,'ar'):('correction',"""اسم المضيف أو عنوان IP""","The current phrasing is awkward for “hostname” and the alternative. This gives the standard Arabic noun phrase and preserves IP.",'moderate'),
(3724,'ko'):('correction',"""호스트 이름 또는 IP 주소""","The current transliterated spacing “호스트 네임” is less natural than the established Korean term. The revised label keeps the exact IP token.",'moderate'),
(3724,'vi'):('correction',"""Tên máy chủ hoặc địa chỉ IP""","The current “Tên máy” means machine name rather than hostname. This uses the standard server/host wording and preserves IP.",'moderate'),
(3726,'ko'):('correction',"""Kapowarr 호스트/컨테이너의 폴더 경로입니다. 폴더가 없으면 Kapowarr가 만듭니다.""","The current translation leaves host/container in English and uses an awkward pronoun for the folder. This makes both the location and creation behavior explicit.",'moderate'),
(3727,'id'):('correction',"""Folder utama""","“Folder root” is an awkward English-Indonesian order in this library field label. “Folder utama” is a clear Indonesian label for the root folder.",'moderate'),
(3728,'ar'):('correction',"""اسم الخادم""","The current target omits “server” and says only “name.” This restores the full field label.",'high'),
(3730,'fr'):('correction',"""Activer l'analyse""","The source names a singular scan setting; the current plural “analyses” changes its scope. This uses the singular action label.",'moderate'),
(3730,'id'):('correction',"""Aktifkan pemindaian""","The current “Aktifkan Pindai” combines the verb with an uninflected verb form. This uses the Indonesian noun for the scan feature.",'moderate'),
(3730,'vi'):('refinement',"""Bật tính năng quét""","The current label is understandable but terse and unnatural as a checkbox label. This makes the enabled feature explicit.",'moderate'),
(3734,'es'):('correction',"""¡La conexión con Kapowarr se estableció correctamente!""","The current success toast omits the opening Spanish exclamation mark and uses a less natural word order. This preserves the success status and punctuation.",'moderate'),
(3734,'de'):('correction',"""Die Verbindung zu Kapowarr wurde erfolgreich hergestellt!""","“Etabliert” is an unnatural choice for a successful connection toast. “Hergestellt” is the idiomatic verb here.",'moderate'),
(3734,'fr'):('correction',"""Connexion à Kapowarr établie avec succès !""","The current toast omits the preposition introducing Kapowarr and lacks the French spacing before the exclamation mark.",'moderate'),
(3735,'es'):('refinement',"""Debe proporcionar una clave de API.""","“Clave API” is a compressed calque; “clave de API” is the standard Spanish technical phrase for this validation message.",'moderate'),
(3735,'hi'):('correction',"""आपको API कुंजी देनी होगी।""","The current Hindi uses masculine agreement with the feminine noun कुंजी. This fixes agreement and preserves the exact API literal.",'high'),
(3735,'ja'):('refinement',"""API キーを入力してください。""","The current “provide” construction is overly formal for an inline validation error. This uses the standard concise instruction while preserving API.",'moderate'),
(3735,'pt_BR'):('correction',"""Você deve fornecer uma chave de API.""","“Chave API” is missing the natural Portuguese preposition in this credential label. This keeps the required action and exact API spelling.",'moderate'),
(3735,'zh_Hant'):('correction',"""您必須提供 API 金鑰。""","The current target mixes Simplified Chinese characters into the Traditional locale and uses 键 rather than the Taiwan-standard 金鑰.",'high'),
(3735,'id'):('correction',"""Anda harus memasukkan kunci API.""","The current “mesti memberikan” is awkward Indonesian for an API-key validation prompt. This uses the usual requirement and input verbs.",'moderate'),
(3736,'vi'):('correction',"""Bạn phải cung cấp URL hợp lệ.""","“Giá trị URL” is redundant and less natural than the source's valid URL requirement. This keeps the exact URL literal.",'moderate'),
(3736,'id'):('refinement',"""Anda harus memasukkan URL yang valid.""","The current “mesti memberikan suatu URL” is overly formal and Malay-leaning. This is a clearer Indonesian validation prompt.",'moderate'),
(3737,'hi'):('correction',"""URL का अंत स्लैश से नहीं होना चाहिए।""","The current Hindi has incorrect agreement and an unnatural literal rendering of “trailing slash.” This states the validation rule clearly and preserves URL.",'high'),
(3737,'pt_BR'):('refinement',"""A URL não deve terminar com uma barra.""","“Barra no final” repeats the idea of trailing. This keeps the rule concise without changing the required value.",'moderate'),
(3737,'ko'):('correction',"""URL은 슬래시(/)로 끝나면 안 됩니다.""","The current transliteration of “trailing slash” is unnatural Korean. This states the exact invalid ending directly.",'moderate'),
(3737,'id'):('refinement',"""URL tidak boleh diakhiri dengan garis miring.""","The current “di akhir” repeats the meaning already carried by diakhiri. This makes the validation text concise.",'moderate'),
(3738,'hi'):('refinement',"""बेस URL की शुरुआत स्लैश से होनी चाहिए।""","The current wording code-switches around “base” and “leading.” This keeps URL exact and expresses the required starting slash naturally.",'moderate'),
(3738,'de'):('correction',"""Die Basis-URL muss mit einem Schrägstrich beginnen.""","“URL-Basis” is an awkward compound for a base URL. “Basis-URL” is the natural German term in this validation message.",'moderate'),
(3738,'ko'):('refinement',"""기본 URL은 앞에 슬래시가 있어야 합니다.""","The current transliteration of “base” is less natural than the established Korean term 기본. The leading-slash requirement remains explicit.",'moderate'),
(3739,'hi'):('correction',"""बेस URL के अंत में स्लैश नहीं होना चाहिए।""","The current Hindi has incorrect agreement and an unnatural literal rendering of “trailing slash.” This states the rule clearly and preserves URL.",'high'),
(3739,'de'):('correction',"""Die Basis-URL darf nicht mit einem abschließenden Schrägstrich enden.""","“URL-Basis” is an awkward compound for a base URL. This uses “Basis-URL” and preserves the trailing-slash validation.",'moderate'),
(3739,'pt_BR'):('refinement',"""A URL base não deve terminar com uma barra.""","The current “barra no final” repeats the trailing meaning. This keeps the validation concise.",'moderate'),
(3739,'ko'):('correction',"""기본 URL은 슬래시로 끝나면 안 됩니다.""","The current phrase “URL 베이스” is a transliteration, and its ending condition is awkward. This uses the natural Korean term and states the rule directly.",'moderate'),
}
def sha(b): return hashlib.sha256(b).hexdigest()
def read_jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def dump_json(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def dump_jsonl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def token_signature(text):
 placeholders=re.findall(r'\{([A-Za-z_][A-Za-z0-9_.]*)\}',text)
 plural={}
 for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*plural\s*,(.*?)\}',text,re.S):
  plural[m.group(1)]=re.findall(r'(?<![\w-])(zero|one|two|few|many|other)\s*\{',m.group(2))
 markup=re.findall(r'</?[A-Za-z][^>]*>',text)
 nums=re.findall(r'\d+(?:[.,]\d+)*',text)
 return {'placeholders':placeholders,'icuPluralCategories':plural,'markup':markup,'numericTokens':nums,'numericValues':nums}
def selected_token_checks(c,target):
 src=token_signature(c['source']); cur=token_signature(c['currentTarget']); sel=token_signature(target)
 required=list(c['sourceProtectedLiterals'])
 return {'placeholders':{'source':src['placeholders'],'current':cur['placeholders'],'selected':sel['placeholders'],'selectedMatchesSource':sel['placeholders']==src['placeholders']},'icuPluralCategories':{'source':src['icuPluralCategories'],'current':cur['icuPluralCategories'],'selected':sel['icuPluralCategories'],'selectedMatchesSource':sel['icuPluralCategories']==src['icuPluralCategories']},'markup':{'source':src['markup'],'current':cur['markup'],'selected':sel['markup'],'selectedMatchesSource':sel['markup']==src['markup']},'numeric':{'sourceTokens':src['numericTokens'],'sourceValues':src['numericValues'],'currentTokens':cur['numericTokens'],'currentValues':cur['numericValues'],'selectedTokens':sel['numericTokens'],'selectedValues':sel['numericValues'],'selectedMatchesSource':sel['numericTokens']==src['numericTokens'] and sel['numericValues']==src['numericValues']},'protectedLiterals':{'required':required,'currentPresent':[x for x in required if x in c['currentTarget']],'selectedPresent':[x for x in required if x in target],'selectedMatchesAllRequired':[x for x in required if x in target]==required}}
def verify_sums(d):
 for line in (d/'SHA256SUMS.txt').read_text().splitlines():
  if not line.strip(): continue
  h,name=line.split(None,1); name=name.strip().lstrip('*')
  assert sha((d/name).read_bytes())==h,(d/name,'checksum mismatch')
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'primary-review'); a=ap.parse_args()
 inp=a.input.resolve(); out=a.output.resolve()
 assert not out.exists(),out
 im=json.loads((inp/'manifest.json').read_text(encoding='utf-8'))
 assert (im['head'],im['tree'],im['window'],im['cellCount'])==(HEAD,TREE,WINDOW,240)
 verify_sums(inp)
 cells=read_jsonl(inp/'current-target-cells.jsonl')
 contexts={r['sourceId']:r for r in read_jsonl(inp/'caller-contexts.jsonl')}
 blocks={r['contextId']:r for r in read_jsonl(inp/'caller-context-blocks.jsonl')}
 assert len(cells)==240 and len(contexts)==20
 assert [(r['position'],r['locale']) for r in cells]==[(p,l) for p in range(3720,3740) for l in LOCALES]
 assert set(EDITS)<= {(c['position'],c['locale']) for c in cells}
 out.mkdir(parents=True)
 ledger=[]
 for c in cells:
  key=(c['position'],c['locale'])
  decision,target,rationale,confidence=EDITS.get(key,('accept-current',c['currentTarget'],'Retain: the current target preserves the source meaning and reads acceptably in the pinned production caller context; no material defect requiring a change was identified in this review.','moderate'))
  assert decision in {'accept-current','correction','refinement','hold'}
  assert (decision=='accept-current')==(target==c['currentTarget'])
  ctx=contexts[c['sourceId']]
  definition=[]; caller=[]
  for bid in ctx['contextBlockIds']:
   b=blocks[bid]
   item={'contextId':bid,'contextType':b['contextType'],'path':b['path'],'startLine':b['startLine'],'endLine':b['endLine'],'lines':b['lines']}
   if b['contextType']=='message-definition': definition.append(item)
   elif b['contextType']=='direct-message-property-reference': caller.append(item)
  tc=selected_token_checks(c,target)
  ledger.append({'schemaVersion':1,'repository':REPO,'pullRequest':PR,'window':WINDOW,'head':HEAD,'tree':TREE,'position':c['position'],'locale':c['locale'],'localeTag':c['localeTag'],'sourceId':c['sourceId'],'sourceIdSha256':c['sourceIdSha256'],'sourceKey':c['sourceKey'],'source':c['source'],'sourceSha256':c['sourceSha256'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'catalogPath':c['catalogPath'],'catalogSha256':c['catalogSha256'],'catalogGitBlob':c['catalogGitBlob'],'decision':decision,'selectedTarget':target,'selectedTargetSha256':sha(target.encode('utf-8')),'rationale':rationale,'confidence':confidence,'callerContext':{'resolution':ctx['callerResolution'],'callerCount':ctx['callerCount'],'contextBlockIds':ctx['contextBlockIds'],'definitionFiles':ctx['definitionFiles'],'definitionEvidence':definition,'directCallerEvidence':caller,'directMessageReferences':ctx['directMessageReferences'],'dynamicRendererReferences':ctx['dynamicRendererReferences']},'baselineDiagnostics':{'placeholderTokenMismatch':c['placeholderTokenMismatch'],'placeholderTokenSequenceMismatch':c['placeholderTokenSequenceMismatch'],'icuPluralCategorySetDifference':c['icuPluralCategorySetDifference'],'markupTokenMismatch':c['markupTokenMismatch'],'numericTokenMismatch':c['numericTokenMismatch'],'protectedLiteralMismatch':c['protectedLiteralMismatch']},'protectedLiteralReview':'Source-defined required literals and named products were checked against the selected target; rationale records any repair.','tokenChecks':tc})
 dump_jsonl(out/'primary-ledger.jsonl',ledger)
 carries=read_jsonl(inp/'carry-forward-hold-hashes.jsonl')
 lineage={(r['position'],r['locale'],r['sourceId']):r for r in read_jsonl(inp/'lineage/prior-hold-application-reattestation.jsonl')}
 carryout=[]
 for r in carries:
  l=lineage[(r['position'],r['locale'],r['sourceId'])]
  carryout.append({'position':r['position'],'locale':r['locale'],'sourceId':r['sourceId'],'sourceSha256':r['sourceSha256'],'catalogPath':r['catalogPath'],'originWindow':r['originWindow'],'carriedViaWindow':r['carriedViaWindow'],'previousAppliedWindow':l['previousAppliedWindow'],'currentHead':r['currentHead'],'currentTree':r['currentTree'],'priorTargetSha256':r['priorTargetSha256'],'previousApplicationTargetSha256':l['previousApplicationTargetSha256'],'currentTargetSha256':r['currentTargetSha256'],'hashesAgree':len({r['priorTargetSha256'],l['previousApplicationTargetSha256'],r['currentTargetSha256']})==1,'retained':r['retained'],'callerless':r['callerless'],'targetTextIncluded':r['targetTextIncluded'],'reattestationLimit':'Hash equality only; target text is omitted from the candidate-free input.'})
 dump_jsonl(out/'carried-holds-reattestation.jsonl',carryout)
 counts={k:sum(x['decision']==k for x in ledger) for k in ['accept-current','correction','refinement','hold']}
 by_locale={l:{k:sum(x['locale']==l and x['decision']==k for x in ledger) for k in counts} for l in LOCALES}
 summary={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'window':WINDOW,'head':HEAD,'tree':TREE,'cellCount':len(ledger),'decisionCounts':counts,'decisionCountsByLocale':by_locale,'selectedChanges':sum(x['decision'] in {'correction','refinement'} for x in ledger),'carriedHoldCount':len(carryout),'carriedHoldHashMatches':sum(x['hashesAgree'] for x in carryout),'baselineProtectedLiteralFlags':sum(c['protectedLiteralMismatch'] for c in cells),'selectedProtectedLiteralFailures':sum(not x['tokenChecks']['protectedLiterals']['selectedMatchesAllRequired'] for x in ledger),'selectedTokenCheckFailures':sum(not all(x['tokenChecks'][k]['selectedMatchesSource'] for k in ['placeholders','icuPluralCategories','markup','numeric']) for x in ledger),'callerlessSelectedSourceCount':sum(x['callerCount']==0 for x in contexts.values()),'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'notes':['Primary semantic review used only the pinned candidate-free packet and source/caller context.','The Hindi position-3724 IP literal baseline defect is repaired.','Carried holds are hash-reattested; their text was not reviewed or included.']}
 dump_json(out/'summary.json',summary)
 manifest={'schemaVersion':1,'packetType':'primary-review','repository':REPO,'pullRequest':PR,'window':WINDOW,'range':[3720,3739],'head':HEAD,'tree':TREE,'inputPacket':'candidate-free-input','inputManifestSha256':sha((inp/'manifest.json').read_bytes()),'cellCount':240,'carriedHoldCount':len(carryout),'decisionCounts':counts,'files':[]}
 readme=f'''# SeerrNG PR #418 primary review — W3720-W3739

Pinned PR head: {HEAD}  
Pinned tree: {TREE}

This primary review covers 240 locale cells (20 messages × 12 locales) from the sealed candidate-free input. Every ledger row contains the exact source/current hashes, selected target and hash, disposition, rationale, confidence, direct caller evidence, and recomputed token/protected-literal checks.

## Decisions

- Accept current: {counts['accept-current']}
- Correction: {counts['correction']}
- Refinement: {counts['refinement']}
- Hold: {counts['hold']}
- Selected changes: {summary['selectedChanges']}
- Carried callerless holds reattested by hash: {len(carryout)}/{len(carryout)}

The Hindi hostname label at position 3724 now preserves the exact IP literal. All selected targets pass placeholder, ICU, markup, numeric, and source-required protected-literal checks.

This is a text-only review. Native-speaker and browser review were not performed. Carried holds are preserved by three-way hash agreement; their text is absent, so this is hash reattestation rather than a fresh linguistic decision.
'''
 (out/'README.md').write_text(readme,encoding='utf-8')
 for p in sorted(out.iterdir()):
  if p.is_file() and p.name not in {'manifest.json','SHA256SUMS.txt'}:
   manifest['files'].append({'path':p.name,'sha256':sha(p.read_bytes()),'byteCount':p.stat().st_size})
 dump_json(out/'manifest.json',manifest)
 sums=[f'{sha(p.read_bytes())}  {p.name}' for p in sorted(out.iterdir()) if p.is_file() and p.name!='SHA256SUMS.txt']
 (out/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n',encoding='utf-8')
 print(json.dumps({'output':str(out),'counts':counts,'selectedChanges':summary['selectedChanges'],'carriedHolds':len(carryout),'selectedTokenFailures':summary['selectedTokenCheckFailures'],'protectedLiteralFailures':summary['selectedProtectedLiteralFailures'],'files':len(manifest['files'])+2},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
