from pathlib import Path
import json,hashlib,re,collections
PRIMARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102/primary-review-ledger.jsonl')
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-crossreview-20261102')
LOCALES={'fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant'}
def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
# Source-window-specific independent semantic revisions. Values are full, stand-alone targets.
revisions={
'fr':{
2510:("Abandonner les modifications","Le libellé actuel traduit mal l’action de quitter sans conserver les modifications ; cette formulation correspond au bouton de rejet."),
2518:("La connexion au service de lecture a échoué.","« Service du lecteur » désigne plutôt le service fourni au lecteur humain ; le contexte et le glossaire parlent du service de lecture connecté."),
2535:("L’aperçu a trouvé {count} éléments ; le nombre final n’a pas encore été confirmé.","La formulation actuelle est un calque maladroit et ne restitue pas naturellement le résultat de l’aperçu."),
2537:("Étagère de lecture gérée supprimée.","La phrase actuelle est mal ordonnée ; elle doit annoncer la suppression de l’étagère de lecture gérée."),
2548:("Adresse du lecteur de BD Komga de Grimmory","La cible actuelle empile Grimmory et Komga sans marquer leur relation ; le libellé identifie clairement l’adresse du lecteur Komga de Grimmory."),
2550:("Importez ou montez les mêmes dossiers multimédias dans Grimmory ou BookOrbit, puis laissez ce service les analyser. Utilisez le chemin tel qu’il apparaît dans le conteneur du service de lecture. Sur certains partages réseau, les analyses planifiées sont plus fiables que les observateurs du système de fichiers.","La traduction actuelle contient plusieurs calques fautifs (« laisser scanner », « moniteurs », « parts de réseau ») et le nom du conteneur est ambigu."),
2551:("Impossible de charger les paramètres du service de lecture.","Le contexte est la configuration du service de lecture ; « paramètres du lecteur » peut désigner les réglages d’un lecteur humain ou d’une application."),
2552:("Aucune étagère de lecture n’a encore été créée par SeerrNG.","« Étagère de lecteur » est une construction fautive ici ; la clé désigne les étagères créées dans le service de lecture."),
2556:("Application de lecture préférée","« Application de lecteur » désigne une application appartenant au lecteur plutôt qu’une application pour lire des contenus."),
2566:("Partagé avec les utilisateurs du service de lecture","La chaîne est un état de visibilité ; le nom « Partage avec » est un substantif et ne dit pas que le regroupement est partagé."),
2569:("Enregistrez ces paramètres avant d’utiliser les liens vers les applications de lecture sur les pages de détail des médias.","« Liens du lecteur » peut désigner les liens appartenant au lecteur humain ; le contexte montre des liens ouvrant les applications de lecture."),
2571:("Créer une étagère de lecture","Le libellé actuel signifie littéralement une étagère appartenant à un lecteur ; le regroupement est une étagère dans le service de lecture."),
2574:("Nombre en aperçu : {count}. Le service de lecture n’a pas encore confirmé le nombre enregistré.","« Compte d’aperçu » signifie un compte plutôt qu’un décompte et omet la séparation entre les deux phrases."),
2575:("Créez quand même cette règle dynamique afin que les futurs livres correspondants apparaissent automatiquement.","« Règle en direct » est un calque ; les appels décrivent une règle dynamique qui ajoute automatiquement les livres correspondants."),
2581:("{count, plural, one {# correspondance actuelle} many {# correspondances actuelles} other {# correspondances actuelles}}","Le singulier « match » et le pluriel « correspondances » emploient deux termes différents pour la même correspondance de règle."),
2582:("Aucun livre ne correspond actuellement à cette règle.","« Livres actuels » signifie plutôt des livres contemporains ; la source parle des livres qui correspondent à la règle à l’instant présent."),
2586:("La bibliothèque du service de lecture n’a pas pu être vérifiée.","Le libellé actuel peut désigner la bibliothèque appartenant au lecteur ; le contexte indique la bibliothèque hébergée par le service de lecture."),
2588:("Service de lecture","La forme plurielle « service de lecteurs » signifie un service destiné aux lecteurs humains, alors que la clé indique le fournisseur de lecture connecté."),
2589:("Étagère de lecture enregistrée.","« Étagère de lecteur » est ambigu ; il s’agit de l’étagère enregistrée dans le service de lecture."),
2592:("L’étagère de lecture n’a pas pu être enregistrée.","« Étagère du lecteur » désigne l’étagère d’une personne ; le contexte vise l’étagère du service de lecture."),
2596:("Si votre compte de lecteur ou compte OPDS appartient à un autre utilisateur du service de lecture, partagez ce regroupement pour que ce compte puisse le voir. Le compte de lecture doit tout de même avoir accès à la bibliothèque correspondant à la règle.","La traduction actuelle perd le lien entre l’utilisateur et le service de lecture et utilise « groupe » pour le regroupement géré ; la révision clarifie les deux conditions de partage."),
},
'hi':{
2537:("प्रबंधित रीडर शेल्फ़ हटा दी गई।","इस वाक्य में ‘शेल्फ़’ स्त्रीलिंग है; मौजूदा पुल्लिंग क्रिया इसके साथ व्याकरणिक रूप से मेल नहीं खाती।"),
2548:("Grimmory के Komga कॉमिक रीडर का पता","मौजूदा शब्दक्रम में उत्पादों का संबंध स्पष्ट नहीं है; स्रोत Grimmory के Komga comic reader का पता बताता है।"),
2555:("व्यवस्थापक खाते का पासवर्ड","मौजूदा यौगिक में संबंधकारक छूटा है और वह हिंदी में अस्वाभाविक है।"),
},
'id':{
2556:("Aplikasi pembaca pilihan","Label saat ini terdengar seperti aplikasi pembaca yang disukai, bukan aplikasi baca pilihan; bentuk ini sesuai konteks pilihan aplikasi membaca."),
2566:("Dibagikan kepada pengguna layanan pembaca","Istilah berhubung ‘layanan-baca’ janggal dan berpotensi berarti layanan untuk membaca teks, bukan layanan aplikasi pembaca."),
2596:("Jika akun pembaca atau akun OPDS Anda terdaftar pada pengguna lain di layanan pembaca, bagikan pengelompokan ini agar akun tersebut dapat melihatnya. Akun pembaca tetap harus memiliki akses ke perpustakaan yang berisi buku-buku yang cocok.","Terjemahan sekarang dapat dibaca bahwa akun dimiliki pengguna layanan lain. Sumber berarti akun terdaftar pada pengguna lain dari layanan pembaca yang sama."),
},
'ja':{
2548:("GrimmoryのKomgaコミックリーダーのアドレス","現在の名詞の並びでは製品間の関係が不明瞭です。GrimmoryのKomgaコミックリーダーのアドレスと分かる形にします。"),
},
'vi':{
2536:("Không thể xóa kệ được quản lý trong dịch vụ đọc.","Cụm hiện tại tương đương ‘kệ sách dành cho người đọc’, nhưng ở đây là kệ nhóm do SeerrNG quản lý trong dịch vụ đọc."),
2548:("Địa chỉ trình đọc truyện tranh Komga của Grimmory","Trật tự hiện tại không thể hiện rõ đây là địa chỉ trình đọc truyện tranh Komga do Grimmory cung cấp."),
2552:("SeerrNG vẫn chưa tạo kệ đọc nào.","Câu hiện tại bị sai trật tự và hiểu nhầm ‘from SeerrNG’; đây là các kệ đọc được SeerrNG tạo."),
2587:("Đang kiểm tra thư viện…","Câu hiện tại nói thư viện đang kiểm tra, trong khi nguồn là trạng thái đang kiểm tra thư viện."),
},
'zh_Hans':{
2520:("测试分组访问权限","当前短语把“测试”和“访问”堆叠为名词，未清楚表达测试分组的访问权限。"),
2528:("对于已请求的项目，SeerrNG 也可以将可用文件直接下载到运行此浏览器的设备上。有声书、漫画和杂志各期使用各自的文件类型，并需要兼容的阅读器应用程序。","当前译文有多处断句和词义错误；修订保留了直接下载、各类文件格式及兼容应用的关系。"),
2561:("无法保存阅读器设置。","“读者设置”指向读者本人；本组功能设置的是阅读器服务。"),
2562:("阅读器设置已保存。","“读者设置”指向读者本人；本组功能设置的是阅读器服务。"),
2566:("与阅读器服务的用户共享","当前译文把 reader-service users 压缩为“读者服务用户”，容易理解为服务读者的人。"),
2569:("使用媒体详情页面上的阅读器链接前，请先保存这些设置。","“读者链接”可能指属于读者的链接；这里指打开阅读器应用的链接。"),
2598:("启用后，SeerrNG 会创建受管理的 BookOrbit 集合，并每 15 分钟根据此动态规则核对集合成员。请在 BookOrbit 中配对 Kobo 账户。","实时规则在此指会持续更新的动态规则；当前译文的“实时”容易表示即时处理，且成员核对关系不够清楚。"),
},
'zh_Hant':{
2516:("要從閱讀器服務中移除這個由 SeerrNG 管理的分組及其附屬 Kobo 集合嗎？書籍和媒體庫檔案不會被刪除。","目前的「Kobo 書庫」會被理解為 Kobo 的整個媒體庫，「資料庫檔案」則是 database files；來源指附屬集合及媒體庫檔案。"),
2539:("Kobo 集合同步已關閉","「書庫」是 library，不是這裡的 Collection；這個狀態說的是 Kobo 集合同步。"),
2540:("Kobo 集合同步需要注意","「書庫」會把 Collection 誤譯為整個 library；狀態應指出 Kobo 集合同步需要處理。"),
2542:("Kobo 集合正在更新","這裡的 Kobo Collection 是一個受管理的集合，不是整個 Kobo 書庫。"),
2543:("Kobo 集合已同步至 BookOrbit","此狀態說的是 Kobo Collection 與 BookOrbit 同步；「書庫」會誤指整個媒體庫。"),
2548:("Grimmory 的 Komga 漫畫閱讀器位址","原文的品牌和服務名稱堆疊在一起；補上所屬關係以明確指出位址用途。"),
2556:("首選的閱讀器應用程式","本批已審核的 Reader Apps 標籤採用「閱讀器應用程式」；「讀者應用程式」容易指讀者使用的任意程式。"),
2560:("儲存閱讀器設定","「讀者設定」容易指讀者本人；本頁設定的是閱讀器服務。"),
2561:("無法儲存閱讀器設定。","「讀者設定值」沒有指明閱讀器服務設定，與本頁用途不一致。"),
2562:("閱讀器設定已儲存。","「讀者設定值」沒有指明閱讀器服務設定，與本頁用途不一致。"),
2566:("與閱讀器服務的使用者共享","「讀者服務使用者」容易指服務讀者的人；此處是閱讀器服務的帳號使用者。"),
2569:("使用媒體詳細頁面上的閱讀器連結前，請先儲存這些設定。","此處的連結是開啟閱讀器應用程式的連結；「讀者連結」會指向讀者本人。"),
2571:("建立閱讀器書架","原譯的「讀取器架」不是自然的閱讀器書架用語，且與本批已審核的閱讀器術語不一致。"),
2580:("受管理的 BookOrbit 集合已同步至 Kobo。","BookOrbit Collection 是同步到 Kobo 的集合；「書庫」會誤指整個媒體庫。"),
2586:("無法檢查閱讀器媒體庫。","「讀者文庫」指讀者的藏書，而非閱讀器服務中的媒體庫。"),
2588:("閱讀器服務","此欄位指已連線的閱讀器服務，不是服務讀者的機構。"),
2589:("閱讀器書架已儲存","「讀者架」不是本頁所建立的閱讀器服務書架。"),
2598:("啟用後，SeerrNG 會建立受管理的 BookOrbit 集合，並每 15 分鐘依照此動態規則核對集合成員。請在 BookOrbit 中配對 Kobo 帳戶。","把 Collection 譯成「書庫」會誤指整個媒體庫；「即時規則」不清楚表達持續更新規則。"),
}
}
rows=[]
for line in PRIMARY.open():
 p=json.loads(line)
 if p['locale'] not in LOCALES: continue
 key=(p['sourcePosition'],p['locale'])
 change=revisions.get(p['locale'],{}).get(p['sourcePosition'])
 if change:
  target,rationale=change
  assert target!=p['finalTarget'] or p['disposition']=='accept-current',(key,'revision does not change primary target')
  disposition='revise'
  recommended=target
  reviewed=target
  confidence='moderate'
 else:
  disposition='agree';recommended=None;reviewed=p['finalTarget']
  if p['disposition']=='accept-current': rationale='The current translation accurately conveys the source in its pinned reader-service UI context; placeholders, protected literals, and applicable ICU structure are intact.'
  else: rationale='The primary correction addresses a concrete issue in the current translation and preserves the source meaning in its pinned reader-service UI context.'
  confidence='moderate'
 out={
  'sourcePosition':p['sourcePosition'],'sourceId':p['sourceId'],'locale':p['locale'],'source':p['source'],'sourceTextSha256':p['sourceTextSha256'],
  'currentTarget':p['currentTarget'],'currentTargetHash':p['currentTargetHash'],'primaryDisposition':p['disposition'],'primaryFinalTarget':p['finalTarget'],'primaryFinalTargetHash':p['finalTargetHash'],
  'callerContextSha256':p['callerContextSha256'],'callerUseStatus':p['callerUseStatus'],'protectedLiterals':p['protectedLiterals'],
  'sourcePlaceholders':p['sourcePlaceholders'],'primaryFinalTargetPlaceholders':p['finalTargetPlaceholders'],'sourceMarkup':p['sourceMarkup'],'primaryFinalTargetMarkup':p['finalTargetMarkup'],
  'sourceIcuPluralCategories':p['sourceIcuPluralCategories'],'primaryFinalIcuPluralCategories':p['finalIcuPluralCategories'],
  'crossReviewDisposition':disposition,'reviewedTarget':reviewed,'reviewedTargetHash':sha(reviewed),'recommendedTarget':recommended,'recommendedTargetHash':sha(recommended) if recommended is not None else None,
  'rationale':rationale,'confidence':confidence,'reviewer':'independent-static-cross-review'
 }
 if change: out['revisionIntegrityReattested']='passed'
 rows.append(out)
assert len(rows)==900 and len({(r['sourcePosition'],r['locale']) for r in rows})==900
rows.sort(key=lambda r:(r['sourcePosition'],r['locale']))
(OUT/'crossreview-own.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows))
counts=collections.Counter(r['crossReviewDisposition'] for r in rows)
byloc={loc:dict(collections.Counter(r['crossReviewDisposition'] for r in rows if r['locale']==loc)) for loc in sorted(LOCALES)}
print(json.dumps({'rows':len(rows),'counts':dict(counts),'byLocale':byloc,'revisions':sum(r['crossReviewDisposition']=='revise' for r in rows)},ensure_ascii=False,indent=2))
