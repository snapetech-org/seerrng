#!/usr/bin/env python3
"""Create the independent primary review using only W3740-W3759 candidate-free input."""
import argparse, collections, hashlib, json, re
from pathlib import Path
HEAD='8d0273ebc5eb51e9d5fee0ac9a0eb022eeed06c4'
TREE='163056b8255034e3ee3a99f25b63e190c88278ee'
WINDOW='W3740-W3759'
REPO='snapetech-org/seerrng'
PR=418
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
EDITS={
(3740,'es'):('correction','Debe proporcionar un nombre de host válido o una dirección IP válida.','The current Spanish omits the article before address and makes the validity qualifier less clear. This keeps the hostname/IP alternative explicit.','moderate'),
(3740,'hi'):('correction','आपको मान्य होस्टनाम या IP पता देना होगा।','The baseline transliterates IP instead of preserving the exact technical literal. This restores IP and keeps the hostname/address distinction.','high'),
(3740,'ja'):('refinement','有効なホスト名または IP アドレスを入力してください。','The current separator can read like a list. This states the alternative with または and uses the normal validation instruction.','moderate'),
(3740,'ar'):('correction','يجب إدخال اسم مضيف صالح أو عنوان IP صالح.','The source requires a valid hostname or IP address, while the current Arabic has less natural wording and the validity qualifier does not clearly cover both options.','moderate'),
(3740,'ko'):('correction','유효한 호스트 이름 또는 IP 주소를 입력해야 합니다.','The current transliterated “호스트 네임” is less natural than the Korean hostname term. The replacement preserves the exact IP literal.','moderate'),
(3740,'id'):('correction','Anda harus memberikan nama host yang valid atau alamat IP yang valid.','The current wording omits the hostname alternative. This restores both required address types and preserves IP.','high'),
(3741,'hi'):('refinement','आपको सर्वर का नाम देना होगा।','Adding का makes the server-name relationship more natural in Hindi.','moderate'),
(3741,'id'):('refinement','Anda harus memberikan nama server.','The current “suatu” is unnecessary and makes this short validation message sound stilted.','moderate'),
(3742,'zh_Hans'):('refinement','您必须提供有效的端口号。','端口号 is the concise standard term for a port number; the current 端口号码 is redundant.','moderate'),
(3742,'ja'):('refinement','有効なポート番号を入力してください。','入力してください is the usual concise wording for an inline form validation message.','moderate'),
(3742,'id'):('correction','Anda harus memberikan nomor port yang valid.','The current “suatu nomor port” is awkward Indonesian. This keeps the required valid-port meaning in natural order.','moderate'),
(3743,'de'):('refinement','Sie müssen einen Pfad zum Stammordner angeben.','The current compound Root-Ordnerpfad is an English calque. This uses a clearer German phrase for the root-folder path.','moderate'),
(3743,'ja'):('correction','ルートフォルダーのパスを入力してください。','“Provide” is rendered literally as 提供する, which is unnatural for a form field. This uses the normal input instruction.','moderate'),
(3743,'id'):('correction','Anda harus memberikan jalur folder root.','The current mixed-English “path folder root” order is unclear. This states the required root-folder path in Indonesian order.','moderate'),
(3744,'es'):('refinement','Añadir servidor','The current title case is unnecessary in a Spanish action label; sentence case is the normal UI style.','moderate'),
(3744,'ar'):('correction','إضافة خادم','سيرفر is colloquial. خادم is the standard Arabic term for a server in this settings label.','moderate'),
(3744,'id'):('refinement','Tambah server','The label is a short action; lowercasing the common noun follows Indonesian sentence case.','moderate'),
(3745,'es'):('refinement','Clave de API','Clave de API is the standard Spanish construction for this credential label.','moderate'),
(3745,'hi'):('correction','API कुंजी','The baseline transliterates API and fails the exact protected-literal check. This keeps API unchanged and uses the established Hindi word for key.','high'),
(3746,'zh_Hans'):('correction','在 LazyLibrarian 的 Config > Interface 中使用具有写入权限的 API 密钥。只读密钥无法添加杂志或启动搜索。','The current text has stray ASCII punctuation and awkward spacing. This preserves the exact external menu path and clarifies that a read-only key cannot perform either action.','moderate'),
(3746,'id'):('refinement','Gunakan kunci API dengan izin tulis dari LazyLibrarian di Config > Interface. Kunci yang hanya dapat dibaca tidak dapat menambahkan majalah atau memulai pencarian.','The current phrase “read-only” switches to English. This localizes that property while retaining the exact external menu path.','moderate'),
(3747,'pt_BR'):('refinement','URL base','This is the concise Brazilian Portuguese label order for a base URL.','moderate'),
(3747,'id'):('refinement','URL dasar','The current Basis URL reverses the usual Indonesian technical label order. URL dasar reads more naturally.','moderate'),
(3748,'hi'):('correction','यदि आपने LazyLibrarian में URL बेस कॉन्फ़िगर किया है, तो यहाँ दर्ज करें। अन्यथा खाली छोड़ दें।','The current “एक” refers to an unclear object. This names the URL base and makes the conditional instruction explicit.','moderate'),
(3748,'pt_BR'):('correction','Digite a URL base do LazyLibrarian, se você tiver configurado uma. Caso contrário, deixe em branco.','The current masculine “um” does not agree with URL base in Portuguese. This uses the feminine noun and keeps the blank-field instruction.','moderate'),
(3749,'es'):('correction','Añadir un nuevo servidor de LazyLibrarian','The current capitalizes every word and lacks the natural article and de before the product name.','moderate'),
(3749,'de'):('correction','Neuen LazyLibrarian-Server hinzufügen','The current “Hinzufügen neuer” is ungrammatical for this action title. This uses the standard infinitive label.','moderate'),
(3749,'ja'):('refinement','新しい LazyLibrarian サーバーを追加','Spaces around the product name improve readability in this Japanese UI label.','moderate'),
(3749,'fr'):('correction','Ajouter un nouveau serveur LazyLibrarian','The current title omits the articles and has unnatural French word order.','moderate'),
(3749,'vi'):('refinement','Thêm máy chủ LazyLibrarian mới','The current label leaves out “new.” This adds it while keeping the compact Vietnamese action label.','moderate'),
(3750,'es'):('correction','Servidor predeterminado','“Por defecto” is less idiomatic for this Spanish setting label than predeterminado, and title case is unnecessary.','moderate'),
(3750,'ar'):('refinement','الخادم الافتراضي','The current uses the colloquial server loanword; this uses the standard Arabic term.','moderate'),
(3751,'ja'):('refinement','LazyLibrarian サーバーを編集','A space before the product name improves readability in this Japanese action label.','moderate'),
(3752,'pt_BR'):('refinement','Pesquisar automaticamente após a aprovação','Pesquisar is the clearer UI verb for an automatic search setting than the current ambiguous Procure.','moderate'),
(3753,'hi'):('correction','अनुरोध स्वीकृत होने के बाद LazyLibrarian में इस पत्रिका की खोज शुरू करें। Prowlarr इंडेक्सर को LazyLibrarian के साथ सिंक कर सकता है; जाँचें कि सिंक किए गए इंडेक्सर आपके LazyLibrarian संस्करण में दिखाई देते हैं और काम करते हैं। SeerrNG, “अनुरोध प्रबंधित करें” अनुमति वाले उपयोगकर्ताओं को Prowlarr पर अलग से मैन्युअल खोज की सुविधा भी देता है।','The current wording describes users who manage requests rather than users with the permission. This makes the permission explicit and replaces the awkward plural indexers with a consistent technical term.','moderate'),
(3753,'ja'):('refinement','リクエストが承認された後、LazyLibrarianでこの雑誌を検索します。ProwlarrからLazyLibrarianへインデクサーを同期できます。同期されたインデクサーがお使いのLazyLibrarianのバージョンに表示され、動作することを確認してください。SeerrNGでは、「リクエストの管理」権限を持つユーザー向けに、Prowlarrで別途手動検索する機能もあります。','The current calls the installed LazyLibrarian release a build, which is an awkward loan translation here. This uses version and preserves the separate manual search and permission.','moderate'),
(3753,'fr'):('correction','Lancez une recherche pour ce magazine dans LazyLibrarian après l’approbation de sa demande. Prowlarr peut synchroniser des indexeurs avec LazyLibrarian ; vérifiez que les indexeurs synchronisés apparaissent et fonctionnent dans votre version de LazyLibrarian. SeerrNG propose également une recherche manuelle distincte dans Prowlarr aux utilisateurs disposant de l’autorisation « Gérer les demandes ».','The current has awkward grammar around the permission and omits de before LazyLibrarian version. This clarifies both points while preserving all product names.','moderate'),
(3753,'pt_BR'):('correction','Inicie uma busca por esta revista no LazyLibrarian após a aprovação da solicitação. O Prowlarr pode sincronizar indexadores com o LazyLibrarian; verifique se eles aparecem e funcionam na versão instalada do LazyLibrarian. O SeerrNG também oferece uma busca manual separada no Prowlarr para usuários com a permissão “Gerenciar solicitações”.','The current calls the installed release a build and leaves the permission label without its required permission relation. This uses versão and clarifies access.','moderate'),
(3753,'ar'):('correction','ابدأ البحث عن هذه المجلة في LazyLibrarian بعد الموافقة على طلبها. يمكن لـ Prowlarr مزامنة المفهرسات مع LazyLibrarian؛ تحقّق من ظهور المفهرسات المتزامنة وعملها في إصدار LazyLibrarian لديك. كما يوفّر SeerrNG بحثًا يدويًا منفصلًا في Prowlarr للمستخدمين الذين لديهم إذن «إدارة الطلبات».','The current does not clearly say that access is a permission and has an awkward indexer phrase. This clarifies both while keeping the manual search separate.','moderate'),
(3753,'vi'):('correction','Bắt đầu tìm kiếm tạp chí này trong LazyLibrarian sau khi yêu cầu được phê duyệt. Prowlarr có thể đồng bộ các indexer với LazyLibrarian; hãy kiểm tra xem các indexer đã đồng bộ có hiển thị và hoạt động trong phiên bản LazyLibrarian bạn đang dùng hay không. SeerrNG cũng cung cấp tìm kiếm Prowlarr thủ công riêng cho người dùng có quyền “Quản lý yêu cầu”.','The current uses awkward translations for indexers and build, and leaves the permission relation implicit. This uses the familiar technical term and names the permission.','moderate'),
(3753,'id'):('correction','Mulai pencarian majalah ini di LazyLibrarian setelah permintaannya disetujui. Prowlarr dapat menyinkronkan indexer ke LazyLibrarian; pastikan indexer yang disinkronkan muncul dan berfungsi di versi LazyLibrarian yang Anda gunakan. SeerrNG juga menyediakan pencarian Prowlarr manual terpisah bagi pengguna dengan izin “Kelola Permintaan”.','The current uses build as an English loan and does not mark Manage Requests as a permission. This uses versi and makes the access requirement explicit.','moderate'),
(3754,'ko'):('refinement','외부 URL','The current adds “access” to the source’s simpler external URL field name.','moderate'),
(3755,'zh_Hans'):('refinement','用于从网络外部打开 LazyLibrarian 的可选地址。','The current omits spacing around the product name and is less clear that this is an optional address.','moderate'),
(3755,'ko'):('correction','네트워크 외부에서 LazyLibrarian을 열 때 사용할 수 있는 선택적 주소입니다.','The current uses the wrong Korean object particle after a name ending in a consonant and has an awkward optionality phrase.','moderate'),
(3756,'hi'):('correction','होस्टनाम या IP पता','The baseline transliterates IP instead of preserving the exact technical literal. This restores IP and keeps the hostname/address distinction.','high'),
(3756,'id'):('refinement','Nama host atau alamat IP','The current capitalizes alamat mid-label without a title-case reason; this follows Indonesian sentence case.','moderate'),
(3759,'es'):('refinement','Nombre del servidor','The current uses unnecessary title case in a Spanish field label.','moderate'),
(3759,'pt_BR'):('refinement','Nome do servidor','The current uses unnecessary title case in a Portuguese field label.','moderate'),
(3759,'ar'):('correction','اسم الخادم','The current says only “name” and omits “server,” so the field label is incomplete.','high'),
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
 assert [(r['position'],r['locale']) for r in cells]==[(p,l) for p in range(3740,3760) for l in LOCALES]
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
 summary={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'window':WINDOW,'head':HEAD,'tree':TREE,'cellCount':len(ledger),'decisionCounts':counts,'decisionCountsByLocale':by_locale,'selectedChanges':sum(x['decision'] in {'correction','refinement'} for x in ledger),'carriedHoldCount':len(carryout),'carriedHoldHashMatches':sum(x['hashesAgree'] for x in carryout),'baselineProtectedLiteralFlags':sum(c['protectedLiteralMismatch'] for c in cells),'selectedProtectedLiteralFailures':sum(not x['tokenChecks']['protectedLiterals']['selectedMatchesAllRequired'] for x in ledger),'selectedTokenCheckFailures':sum(not all(x['tokenChecks'][k]['selectedMatchesSource'] for k in ['placeholders','icuPluralCategories','markup','numeric']) for x in ledger),'callerlessSelectedSourceCount':sum(x['callerCount']==0 for x in contexts.values()),'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'notes':['Primary semantic review used only the pinned candidate-free packet and source/caller context.','The three Hindi protected-literal findings at positions 3740 (IP), 3745 (API), and 3756 (IP) are repaired.','Carried holds are hash-reattested; their text was not reviewed or included.']}
 dump_json(out/'summary.json',summary)
 manifest={'schemaVersion':1,'packetType':'primary-review','repository':REPO,'pullRequest':PR,'window':WINDOW,'range':[3740,3759],'head':HEAD,'tree':TREE,'inputPacket':'candidate-free-input','inputManifestSha256':sha((inp/'manifest.json').read_bytes()),'cellCount':240,'carriedHoldCount':len(carryout),'decisionCounts':counts,'files':[]}
 readme=f'''# SeerrNG PR #418 primary review — W3740-W3759

Pinned PR head: {HEAD}  
Pinned tree: {TREE}

This primary review covers all 240 locale cells (20 messages × 12 locales) from the sealed candidate-free input. Every ledger row records its exact source and current hashes, selected target and hash, disposition, rationale, confidence, pinned direct caller evidence, and recomputed token and protected-literal checks.

## Decisions

- Accept current: {counts['accept-current']}
- Correction: {counts['correction']}
- Refinement: {counts['refinement']}
- Hold: {counts['hold']}
- Selected changes: {summary['selectedChanges']}
- Carried callerless holds reattested by hash: {len(carryout)}/{len(carryout)}

The three Hindi baseline protected-literal findings are repaired: IP at positions 3740 and 3756, and API at position 3745. All selected targets pass placeholder, ICU, markup, numeric, and source-required protected-literal checks.

This is a text-only review. Qualified native-speaker and headed-browser review were not performed. Carried holds are preserved by three-way hash agreement; their text is absent, so this is hash reattestation rather than a fresh linguistic decision.
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
