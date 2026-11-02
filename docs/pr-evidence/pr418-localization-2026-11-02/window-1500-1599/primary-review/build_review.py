from pathlib import Path
import json, hashlib, re, collections, shutil

ROOT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1500-1599-primary-20261102')
HEAD='94bdd3f690fc54d37d17e04d29a443533af3fb0d'
TREE='17df3c6f626ac544990d2f8f2049daf95b4738ac'
LOCALE_ORDER=['ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-CN','zh-TW']
GROUP_A={'ar','de','es','fr','hi','id'}
LOCALE_FILES={'ar':'src/i18n/locale/ar.json','de':'src/i18n/locale/de.json','es':'src/i18n/locale/es.json','fr':'src/i18n/locale/fr.json','hi':'src/i18n/locale/hi.json','id':'src/i18n/locale/id.json','ja':'src/i18n/locale/ja.json','ko':'src/i18n/locale/ko.json','pt-BR':'src/i18n/locale/pt_BR.json','vi':'src/i18n/locale/vi.json','zh-CN':'src/i18n/locale/zh_Hans.json','zh-TW':'src/i18n/locale/zh_Hant.json'}
def readjl(p): return [json.loads(s) for s in Path(p).read_text(encoding='utf8').splitlines() if s]
def writejl(p,rows): Path(p).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf8')
def writej(p,x): Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(s): return hashlib.sha256(s.encode('utf8')).hexdigest()

# Each entry is a deliberately actionable correction/refinement. Unlisted reviewable
# rows were inspected in caller context and accepted as semantically adequate.
TARGETS={
1500:{'ar':'أدخل حرفين على الأقل.'},
1501:{'ja':'SeerrNGカタログを検索','ko':'SeerrNG 카탈로그 검색','vi':'Tìm kiếm danh mục SeerrNG','zh-TW':'搜尋 SeerrNG 目錄'},
1502:{'ko':'검색 중…','zh-TW':'正在搜尋…'},
1504:{'ar':'استخدم هذه المطابقة','de':'Diese Zuordnung verwenden','hi':'इस मिलान का उपयोग करें','ja':'この一致候補を使用する','ko':'이 일치 항목 사용','pt-BR':'Usar esta correspondência','vi':'Dùng kết quả khớp này','zh-CN':'使用此匹配结果','zh-TW':'使用此比對結果'},
1505:{'ar':'إزالة الملف المحدد','ko':'선택한 파일 지우기','id':'Hapus file terpilih'},
1506:{'fr':'Exportez ou restaurez vos correspondances privées de titres pour les titres de Trakt, AniList, Simkl, MDBList, Plex, Jellyfin et Emby.','hi':'Trakt, AniList, Simkl, MDBList, Plex, Jellyfin और Emby के शीर्षकों के लिए अपने निजी शीर्षक-मिलान निर्यात या पुनर्स्थापित करें।','id':'Ekspor atau pulihkan kecocokan judul pribadi Anda untuk judul dari Trakt, AniList, Simkl, MDBList, Plex, Jellyfin, dan Emby.','ja':'Trakt、AniList、Simkl、MDBList、Plex、Jellyfin、Embyのタイトルに対する非公開の照合結果をエクスポートまたは復元します。','ko':'Trakt, AniList, Simkl, MDBList, Plex, Jellyfin, Emby 타이틀의 비공개 매칭을 내보내거나 복원합니다.','pt-BR':'Exporte ou restaure suas correspondências privadas de títulos do Trakt, AniList, Simkl, MDBList, Plex, Jellyfin e Emby.','vi':'Xuất hoặc khôi phục các kết quả đối sánh tiêu đề riêng tư của bạn cho Trakt, AniList, Simkl, MDBList, Plex, Jellyfin và Emby.','zh-CN':'导出或恢复您为 Trakt、AniList、Simkl、MDBList、Plex、Jellyfin 和 Emby 标题建立的私人匹配项。','zh-TW':'匯出或還原您為 Trakt、AniList、Simkl、MDBList、Plex、Jellyfin 和 Emby 標題建立的個人比對項目。'},
1507:{'ar':'تصدير مطابقات العناوين','fr':'Exporter les correspondances de titres','hi':'शीर्षक-मिलान निर्यात करें','ja':'タイトル照合結果をエクスポート','ko':'제목 매칭 내보내기','pt-BR':'Exportar correspondências de títulos','vi':'Xuất các kết quả đối sánh tiêu đề','zh-CN':'导出标题匹配项','zh-TW':'匯出標題比對項'},
1508:{'ar':'تعذّر تصدير مطابقات العناوين. حاول مرة أخرى.','fr':'Impossible d’exporter vos correspondances de titres. Réessayez.','hi':'आपके शीर्षक-मिलान निर्यात नहीं किए जा सके। फिर कोशिश करें।','id':'Kecocokan judul Anda tidak dapat diekspor. Coba lagi.','ja':'タイトルの照合結果をエクスポートできませんでした。もう一度お試しください。','ko':'제목 매칭을 내보내지 못했습니다. 다시 시도하세요.','pt-BR':'Não foi possível exportar suas correspondências de títulos. Tente novamente.','zh-CN':'无法导出您的标题匹配项。请重试。','zh-TW':'無法匯出您的標題比對結果，請再試一次。'},
1509:{'ar':'{name} يحتوي على {count} من مطابقات العناوين.','de':'{name} enthält {count} Titelzuordnungen.','fr':'{name} contient {count} correspondances de titres.','hi':'{name} में {count} शीर्षक-मिलान हैं।','id':'{name} berisi {count} kecocokan judul.','ja':'{name} にはタイトルの照合結果が {count} 件含まれています。','ko':'{name}에 제목 매칭 결과 {count}개가 들어 있습니다.','pt-BR':'{name} contém {count} correspondências de títulos.','vi':'{name} chứa {count} kết quả đối sánh tiêu đề.','zh-CN':'{name} 包含 {count} 条标题匹配记录。','zh-TW':'{name} 包含 {count} 筆標題比對結果。'},
1510:{'ar':'يجب ألا يتجاوز حجم ملف مطابقة العناوين 5 MiB.','fr':'Le fichier de correspondances de titres ne doit pas dépasser 5 MiB.','hi':'शीर्षक-मिलान फ़ाइल का आकार 5 MiB या उससे कम होना चाहिए।','id':'File pencocokan judul harus berukuran 5 MiB atau lebih kecil.','ja':'タイトル照合ファイルは5 MiB以下でなければなりません。','ko':'제목 매칭 파일은 5 MiB 이하여야 합니다.','pt-BR':'O arquivo de correspondências de títulos deve ter no máximo 5 MiB.','vi':'Tệp chứa các kết quả đối sánh tiêu đề không được vượt quá 5 MiB.','zh-CN':'标题匹配文件不得超过 5 MiB。','zh-TW':'標題比對檔案不得超過 5 MiB。'},
1511:{'ar':'استيراد مطابقات العناوين','hi':'शीर्षक-मिलान आयात करें','ja':'タイトル照合結果をインポート','ko':'제목 매칭 가져오기','pt-BR':'Importar correspondências de títulos','vi':'Nhập các kết quả đối sánh tiêu đề','zh-CN':'导入标题匹配项','zh-TW':'匯入標題比對項'},
1512:{'ar':'تضيف عملية الاستيراد مطابقات جديدة وتحدّث المطابقات التي لها عنصر المزوّد نفسه. وتظل جميع المطابقات المستوردة خاصة بحسابك.','fr':'L’importation ajoute de nouvelles correspondances et met à jour celles qui partagent le même élément fournisseur. Toutes les correspondances importées restent privées dans votre compte.','hi':'आयात से नए शीर्षक-मिलान जुड़ते हैं और उसी प्रदाता आइटम वाले मिलान अपडेट होते हैं। सभी आयातित मिलान आपके खाते में निजी रहते हैं।','id':'Impor menambahkan kecocokan baru dan memperbarui kecocokan dengan item penyedia yang sama. Semua kecocokan yang diimpor tetap bersifat pribadi di akun Anda.','ja':'インポートすると、新しいタイトル照合結果が追加され、同じプロバイダー項目の照合結果が更新されます。インポートされた照合結果はすべてアカウント内で非公開のままです。','ko':'가져오기는 새 제목 매칭을 추가하고 동일한 제공자 항목과 연결된 매칭을 업데이트합니다. 가져온 매칭은 모두 계정에서 비공개로 유지됩니다.','pt-BR':'A importação adiciona novas correspondências e atualiza as que têm o mesmo item do provedor. Todas as correspondências importadas permanecem privadas na sua conta.','vi':'Việc nhập sẽ thêm các kết quả đối sánh mới và cập nhật các kết quả có cùng mục nhà cung cấp. Tất cả kết quả được nhập vẫn riêng tư trong tài khoản của bạn.','zh-CN':'导入会添加新的标题匹配项，并更新具有相同服务项目的匹配项。所有导入的匹配项都仅对您的账户可见。','zh-TW':'匯入會新增標題比對項目，並更新具有相同服務項目的比對項目。所有匯入的比對項目都只對您的帳戶可見。'},
1513:{'ar':'تعذّر استيراد حزمة مطابقات العناوين. تحقق من الملف وحاول مرة أخرى.','fr':'Le pack de correspondances de titres n’a pas pu être importé. Vérifiez le fichier et réessayez.','hi':'शीर्षक-मिलान पैक आयात नहीं किया जा सका। फ़ाइल जाँचें और फिर कोशिश करें।','id':'Paket pencocokan judul tidak dapat diimpor. Periksa file dan coba lagi.','ja':'タイトル照合パックをインポートできませんでした。ファイルを確認して、もう一度お試しください。','ko':'제목 매칭 팩을 가져오지 못했습니다. 파일을 확인하고 다시 시도하세요.','pt-BR':'Não foi possível importar o pacote de correspondências de títulos. Verifique o arquivo e tente novamente.','vi':'Không thể nhập gói đối sánh tiêu đề. Kiểm tra tệp và thử lại.','zh-TW':'無法匯入標題比對套件。請檢查檔案後再試一次。'},
1514:{'ar':'اختر حزمة مطابقات العناوين من SeerrNG.','fr':'Choisissez un pack SeerrNG de correspondances de titres.','hi':'SeerrNG शीर्षक-मिलान पैक चुनें।','ja':'SeerrNGのタイトル照合パックを選択','ko':'SeerrNG 제목 매칭 팩 선택','pt-BR':'Escolha um pacote SeerrNG de correspondências de títulos.','vi':'Chọn gói đối sánh tiêu đề SeerrNG.','zh-TW':'選擇 SeerrNG 標題比對套件'},
1515:{'ar':'تم استيراد {imported} وتحديث {updated} وترك {unchanged} دون تغيير.','fr':'Correspondances importées : {imported}, mises à jour : {updated}, laissées inchangées : {unchanged}.','hi':'आयात किए गए: {imported}, अपडेट किए गए: {updated}, बिना बदले छोड़े गए: {unchanged}.','id':'Diimpor {imported}, diperbarui {updated}, dan {unchanged} dibiarkan tanpa perubahan.','ja':'インポート済み: {imported} 件、更新済み: {updated} 件、変更なし: {unchanged} 件。','pt-BR':'Importadas: {imported}, atualizadas: {updated}; sem alterações: {unchanged}.','vi':'Đã nhập {imported}, cập nhật {updated} và giữ nguyên {unchanged}.','zh-CN':'已导入 {imported} 项，已更新 {updated} 项，{unchanged} 项未更改。','zh-TW':'已匯入 {imported} 項、已更新 {updated} 項，{unchanged} 項維持不變。'},
1517:{'fr':'Choisissez un fichier JSON de correspondances de titres SeerrNG pris en charge.','hi':'SeerrNG का समर्थित शीर्षक-मिलान JSON फ़ाइल चुनें।','ja':'対応しているSeerrNGタイトル照合JSONファイルを選択','ko':'지원되는 SeerrNG 제목 매칭 JSON 파일 선택','vi':'Chọn một tệp JSON đối sánh tiêu đề SeerrNG được hỗ trợ.','zh-CN':'选择受支持的 SeerrNG 标题匹配 JSON 文件。','zh-TW':'選擇受支援的 SeerrNG 標題比對 JSON 檔案。'},
1518:{'ar':'تحتوي الحزم على معرّفات عناصر المزوّد ومطابقات الكتالوج فقط. ولا تتضمن بيانات اعتماد الحساب مطلقًا.','de':'Pakete enthalten nur IDs von Anbietereinträgen und Katalogzuordnungen. Kontozugangsdaten sind niemals enthalten.','fr':'Les packs contiennent uniquement les identifiants des éléments fournisseurs et les correspondances du catalogue. Les identifiants du compte ne sont jamais inclus.','ko':'팩에는 제공자 항목 ID와 카탈로그 매칭만 포함됩니다. 계정 인증 정보는 절대 포함되지 않습니다.','pt-BR':'Os pacotes contêm apenas IDs de itens dos provedores e correspondências no catálogo. As credenciais da conta nunca são incluídas.','vi':'Các gói chỉ chứa ID mục của nhà cung cấp và kết quả đối sánh trong danh mục. Thông tin đăng nhập tài khoản không bao giờ được đưa vào.','zh-CN':'数据包仅包含服务项目 ID 和目录匹配项，绝不会包含账户凭据。'},
1519:{'ar':'مطابقات العناوين الشخصية','de':'Persönliche Titelzuordnungen','hi':'व्यक्तिगत शीर्षक-मिलान','id':'Kecocokan judul pribadi','ja':'個人用タイトル照合','ko':'개인 제목 매칭','pt-BR':'Correspondências de títulos pessoais','vi':'Đối sánh tiêu đề cá nhân','zh-CN':'个人标题匹配项','zh-TW':'個人標題比對項'},
1520:{'ar':'تحتاج إلى صلاحية إدارة الطلبات للبحث في مواقع الفهرسة.','hi':'इंडेक्सर खोजने के लिए आपके पास अनुरोध प्रबंधन की अनुमति होनी चाहिए।','ja':'インデクサーを検索するには、リクエスト管理権限が必要です。','ko':'인덱서를 검색하려면 요청 관리 권한이 필요합니다.','vi':'Bạn cần quyền Quản lý yêu cầu để tìm kiếm trên các trình lập chỉ mục.','zh-CN':'您需要具备请求管理权限才能搜索索引器。','zh-TW':'您需要具備請求管理權限才能搜尋索引器。'},
1521:{'ar':'فئات مواقع الفهرسة','de':'Indexer-Kategorien','ja':'インデクサーカテゴリ','vi':'Danh mục các trình lập chỉ mục'},
1534:{'hi':'Prowlarr की सेटिंग खोलें','zh-TW':'開啟 Prowlarr 設定'},
1535:{'de':'Prowlarr konnte dieses Release nicht senden. Starten Sie eine neue Suche und versuchen Sie es erneut.','pt-BR':'O Prowlarr não conseguiu enviar este lançamento. Faça uma nova busca e tente novamente.','zh-TW':'Prowlarr 無法傳送此搜尋結果。請重新搜尋並再試一次。'},
1536:{'ar':'عدد التنزيلات','fr':'Téléchargements','hi':'डाउनलोड संख्या','id':'Unduhan','ja':'ダウンロード数','pt-BR':'Downloads','vi':'Lượt tải','zh-CN':'下载次数','zh-TW':'下載次數'},
1537:{'ar':'ابحث عن إصدارات في مواقع الفهرسة لديك على Prowlarr ضمن جميع فئات الوسائط في SeerrNG.','fr':'Recherchez des sorties dans vos indexeurs Prowlarr, dans toutes les catégories de médias de SeerrNG.','hi':'SeerrNG की हर मीडिया श्रेणी में अपने Prowlarr इंडेक्सर पर रिलीज़ खोजें।','ja':'すべてのSeerrNGメディアカテゴリで、Prowlarrのインデクサーからリリースを検索します。','ko':'SeerrNG의 모든 미디어 카테고리에서 Prowlarr 인덱서를 검색합니다.','vi':'Tìm kiếm các bản phát hành trên trình lập chỉ mục Prowlarr trong mọi danh mục phương tiện của SeerrNG.','zh-CN':'在 SeerrNG 的所有媒体类别中搜索 Prowlarr 索引器上的发布资源。','zh-TW':'在 SeerrNG 的所有媒體類別中搜尋 Prowlarr 索引器上的發布資源。'},
1538:{'id':'Pengunduh','vi':'Người tải xuống','zh-CN':'下载者','zh-TW':'下載者','ko':'다운로더 수'},
1540:{'ar':'تحميل مزيد من النتائج','ko':'결과 더 불러오기','vi':'Tải thêm kết quả','zh-CN':'加载更多结果','zh-TW':'載入更多結果'},
1542:{'ar':'نتائج البحث منفصلة عن طلبات SeerrNG. يمكنك إرسال نتيجة إلى عميل تنزيل مُعدّ في Prowlarr.','fr':'Les résultats de recherche sont indépendants des demandes SeerrNG. Vous pouvez envoyer un résultat à un client de téléchargement configuré dans Prowlarr.','hi':'खोज परिणाम SeerrNG अनुरोधों से अलग हैं। आप किसी परिणाम को Prowlarr में कॉन्फ़िगर किए गए डाउनलोड क्लाइंट को भेज सकते हैं।','id':'Hasil pencarian terpisah dari permintaan SeerrNG. Anda dapat mengirim hasil ke klien unduhan yang dikonfigurasi di Prowlarr.','ja':'検索結果はSeerrNGのリクエストとは別扱いです。結果をProwlarrで設定したダウンロードクライアントに送信できます。','ko':'검색 결과는 SeerrNG 요청과 별개입니다. 결과를 Prowlarr에 설정된 다운로드 클라이언트로 보낼 수 있습니다.','pt-BR':'Os resultados da busca são separados das solicitações do SeerrNG. Você pode enviar um resultado para um cliente de download configurado no Prowlarr.','vi':'Kết quả tìm kiếm tách biệt với các yêu cầu trong SeerrNG. Bạn có thể gửi một kết quả đến ứng dụng khách tải xuống đã cấu hình trong Prowlarr.','zh-CN':'搜索结果与 SeerrNG 请求相互独立。您可以将某条结果发送到在 Prowlarr 中配置的下载客户端。','zh-TW':'搜尋結果與 SeerrNG 請求各自獨立。您可以將某筆結果傳送到 Prowlarr 中設定的下載用戶端。'},
1543:{'ko':'Prowlarr에 연결되어 있지 않습니다.','zh-TW':'未連線到 Prowlarr。'},
1544:{'ar':'اطلب من مسؤول ربط Prowlarr ضمن الإعدادات > الخدمات.','id':'Tanyakan kepada administrator cara menghubungkan Prowlarr di Pengaturan > Layanan.','zh-TW':'請管理員前往「設定 > 服務」連接 Prowlarr。'},
1545:{'es':'No hay lanzamientos que coincidan con esta búsqueda.','fr':'Aucune sortie ne correspond à cette recherche.','hi':'इस खोज से मेल खाने वाली कोई रिलीज़ नहीं मिली।','ko':'이 검색과 일치하는 릴리스가 없습니다.','id':'Tidak ada rilis yang cocok dengan pencarian ini.','pt-BR':'Nenhum lançamento corresponde a esta busca.','zh-CN':'没有与此搜索匹配的发布资源。','zh-TW':'沒有符合此搜尋的發布資源。'},
1546:{'ar':'تحقق من مرشحات الفئات والمفهرسات المفعّلة في Prowlarr. نتائج البحث لا تضمن أن التطبيق يستطيع استيراد إصدار.','es':'Comprueba los filtros de categoría y los indexadores habilitados en Prowlarr. Los resultados de búsqueda no garantizan que una aplicación pueda importar un lanzamiento.','fr':'Vérifiez les filtres de catégorie et les indexeurs activés dans Prowlarr. Les résultats de recherche ne garantissent pas qu’une application puisse importer une sortie.','hi':'Prowlarr में श्रेणी फ़िल्टर और चालू इंडेक्सर जाँचें। खोज परिणाम यह सुनिश्चित नहीं करते कि कोई ऐप रिलीज़ आयात कर सकता है।','id':'Periksa filter kategori dan indexer yang diaktifkan di Prowlarr. Hasil pencarian tidak menjamin bahwa aplikasi dapat mengimpor rilis.','ja':'Prowlarrでカテゴリフィルターと有効なインデクサーを確認してください。検索結果があっても、アプリがリリースをインポートできるとは限りません。','ko':'Prowlarr에서 카테고리 필터와 활성 인덱서를 확인하세요. 검색 결과가 앱에서 릴리스를 가져올 수 있음을 보장하지는 않습니다.','vi':'Kiểm tra bộ lọc danh mục và các trình lập chỉ mục đang bật trong Prowlarr. Kết quả tìm kiếm không đảm bảo ứng dụng có thể nhập bản phát hành.','zh-CN':'请检查 Prowlarr 中的类别筛选条件和已启用的索引器。搜索结果并不保证应用能够导入相应资源。','zh-TW':'請檢查 Prowlarr 中的類別篩選條件和已啟用的索引器。搜尋結果不保證應用程式能匯入相應項目。'},
1547:{'ar':'افتح تفاصيل المفهرس','hi':'इंडेक्सर का विवरण खोलें','ja':'インデクサーの詳細を開く','ko':'인덱서 세부 정보 열기','vi':'Mở chi tiết trình lập chỉ mục','zh-CN':'打开索引器详情'},
1548:{'ko':'프로토콜','zh-CN':'协议','zh-TW':'協定'},
1549:{'ar':'تاريخ النشر','es':'Fecha de publicación','fr':'Date de publication','ja':'公開日','vi':'Ngày phát hành','zh-CN':'发布日期','zh-TW':'發布日期'},
1550:{'ar':'مصطلحات البحث','hi':'खोज शब्द','ja':'検索語','ko':'검색어','vi':'Từ khóa tìm kiếm','zh-CN':'搜索词','zh-TW':'搜尋詞'},
1551:{'ko':'제목, 저자, 앨범, 호, 또는 게임 이름','vi':'Tựa đề, tác giả, album nhạc, số phát hành hoặc tên trò chơi','zh-TW':'標題、作者、專輯、期號或遊戲名稱'},
1552:{'ar':'إرسال نتيجة لا يغيّر طلب SeerrNG. يتولى Prowlarr إرسال النتيجة إلى عميل التنزيل المُعدّ لديه.','fr':'L’envoi d’un résultat ne modifie pas une demande SeerrNG. Prowlarr le transmet au client de téléchargement configuré.','hi':'किसी परिणाम को भेजने से SeerrNG अनुरोध नहीं बदलता। Prowlarr उसे अपने कॉन्फ़िगर किए गए डाउनलोड क्लाइंट को भेजता है।','id':'Mengirim hasil tidak mengubah permintaan SeerrNG. Prowlarr meneruskan hasil tersebut ke klien unduhan yang dikonfigurasi.','ja':'結果を送信してもSeerrNGのリクエストは変更されません。Prowlarrが設定済みのダウンロードクライアントへ引き渡します。','ko':'결과를 보내도 SeerrNG 요청은 변경되지 않습니다. Prowlarr가 설정된 다운로드 클라이언트로 결과를 전달합니다.','pt-BR':'Enviar um resultado não altera uma solicitação do SeerrNG. O Prowlarr encaminha o resultado ao cliente de download configurado.','vi':'Việc gửi một kết quả không làm thay đổi yêu cầu SeerrNG. Prowlarr sẽ chuyển kết quả đó đến ứng dụng khách tải xuống đã cấu hình.','zh-CN':'发送结果不会更改 SeerrNG 请求。Prowlarr 会将该结果转交给已配置的下载客户端。','zh-TW':'傳送結果不會變更 SeerrNG 請求。Prowlarr 會將結果交給已設定的下載用戶端。'},
1553:{'ar':'أعاد Prowlarr عدد {count} من الإصدارات.','de':'Prowlarr hat {count} Releases zurückgegeben.','fr':'{count} résultats renvoyés par Prowlarr.','hi':'Prowlarr ने {count} रिलीज़ लौटाईं।','id':'Prowlarr mengembalikan {count} rilis.','ja':'Prowlarrから{count}件のリリースが返されました。','ko':'Prowlarr에서 릴리스 {count}개를 반환했습니다.','pt-BR':'O Prowlarr retornou {count} lançamentos.','vi':'Prowlarr đã trả về {count} bản phát hành.','zh-CN':'Prowlarr 返回了 {count} 个发布资源。','zh-TW':'Prowlarr 已傳回 {count} 個發布項目。'},
1554:{'ar':'ابحث في مواقع الفهرسة','fr':'Rechercher dans les indexeurs','hi':'इंडेक्सरों में खोजें','ja':'インデクサーを検索','ko':'인덱서 검색','pt-BR':'Buscar indexadores','vi':'Tìm kiếm các trình lập chỉ mục'},
1555:{'de':'Die Prowlarr-Suche ist fehlgeschlagen. Überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.','ko':'Prowlarr 검색에 실패했습니다. 연결을 확인하고 다시 시도하세요.'},
1556:{'ar':'جارٍ البحث في مواقع الفهرسة…','de':'Suche in Indexern…','fr':'Recherche en cours dans les indexeurs…','hi':'इंडेक्सरों में खोजा जा रहा है…','id':'Mencari di indexer…','ja':'インデクサーを検索中…','ko':'인덱서 검색 중…','pt-BR':'Procurando nos indexadores…','vi':'Đang tìm kiếm trên các trình lập chỉ mục…'},
1557:{'ar':'عدد الموزعين','fr':'Sources','hi':'सीडर्स','id':'Seeder','ja':'シーダー数','pt-BR':'Seeders','vi':'Người chia sẻ','zh-TW':'種子數'},
1561:{'ko':'크기'},
1563:{'id':'Tunggu satu menit sebelum mencari lagi.','ja':'検索上限に達しました。再検索する前に1分お待ちください。','ko':'검색 횟수 제한에 도달했습니다. 다시 검색하기 전에 1분 기다려 주세요.','vi':'Đã đạt giới hạn tìm kiếm. Chờ một phút rồi tìm kiếm lại.','zh-CN':'已达到搜索次数限制。请等待一分钟后再搜索。','zh-TW':'已達搜尋次數上限。請等候一分鐘後再搜尋。'},
1564:{'ar':'افتح بحثًا مُعبّأ مسبقًا. هذا لا يضيف إصدارًا إلى عميل التنزيل ولا يحمّله.','fr':'Ouvrez une recherche préremplie. Cela ne transmet pas de release à un client de téléchargement et ne la télécharge pas.','hi':'पहले से भरी हुई खोज खोलें। यह किसी रिलीज़ को डाउनलोड क्लाइंट को नहीं भेजता और न ही उसे डाउनलोड करता है।','id':'Buka pencarian yang sudah terisi. Tautan ini tidak mengunduh atau mengirim rilis ke klien unduhan.','ja':'検索語が入力済みの検索を開きます。このリンクはリリースを取得したりダウンロードしたりしません。','ko':'검색어가 미리 입력된 검색을 엽니다. 이 링크는 릴리스를 다운로드 클라이언트에 보내거나 다운로드하지 않습니다.','pt-BR':'Abra uma busca já preenchida. Isso não envia nem baixa um lançamento.','vi':'Mở tìm kiếm đã điền sẵn. Thao tác này không gửi bản phát hành đến trình tải xuống và cũng không tải xuống.','zh-CN':'打开已预填搜索词的搜索页。此操作不会将发布资源加入下载队列或下载。','zh-TW':'開啟已預填搜尋詞的搜尋頁。此操作不會將發布項目送入下載佇列或下載。'},
1565:{'ar':'ابحث في Prowlarr','fr':'Rechercher dans Prowlarr','hi':'Prowlarr खोजें','ko':'Prowlarr 검색','pt-BR':'Buscar no Prowlarr','zh-TW':'搜尋 Prowlarr'},

1579:{'ar':'تخلَّ عن هذه التعديلات واحتفظ بالتعليق المحفوظ.','hi':'इन बदलावों को छोड़ें और सहेजी गई टिप्पणी रखें।','id':'Buang perubahan ini dan pertahankan komentar yang tersimpan.','ko':'이 편집 내용을 취소하고 저장된 댓글을 유지합니다.','vi':'Hủy các chỉnh sửa này và giữ nguyên bình luận đã lưu.','zh-CN':'放弃这些编辑，并保留已保存的评论。','zh-TW':'捨棄這些編輯，保留已儲存的留言。'},
1580:{'hi':'हटाएं'},
1581:{'ar':'احذف هذا التعليق نهائيًا بعد التأكيد.','ko':'확인 후 이 댓글을 영구적으로 삭제합니다.','vi':'Xóa vĩnh viễn bình luận này sau khi xác nhận.'},
1582:{'ar':'حذف التعليق','vi':'Xóa bình luận','zh-CN':'删除评论','zh-TW':'刪除留言'},
1584:{'fr':'Modifiez votre commentaire sur ce problème.','vi':'Chỉnh sửa bình luận của bạn về vấn đề này.','zh-TW':'編輯您對此問題的留言。'},
1585:{'hi':'संपादित'},
1586:{'ar':'احفظ التغييرات على هذا التعليق.','ko':'이 댓글의 변경 사항을 저장합니다.','vi':'Lưu các thay đổi cho bình luận này.','zh-CN':'保存此评论的更改。','zh-TW':'儲存此留言的變更。'},
1587:{'hi':'आपको एक संदेश लिखना होगा।','zh-TW':'請輸入訊息。'},
1588:{'ar':'يجب ألا يتجاوز التعليق {maxLength, number} حرفًا.','fr':'Le commentaire doit compter au maximum {maxLength, number} caractères.','hi':'टिप्पणी {maxLength, number} वर्ण या उससे कम की होनी चाहिए।','ja':'コメントは{maxLength, number}文字以内で入力してください。','pt-BR':'O comentário deve ter no máximo {maxLength, number} caracteres.','zh-TW':'留言不得超過 {maxLength, number} 個字元。'},
}
REFINEMENTS={
(1504,'de'),(1504,'ja'),(1504,'zh-CN'),(1504,'zh-TW'),
(1506,'fr'),(1506,'ja'),(1506,'zh-CN'),(1506,'zh-TW'),
(1507,'ja'),(1507,'zh-CN'),(1510,'ja'),(1510,'zh-CN'),(1510,'zh-TW'),
(1511,'ja'),(1511,'zh-CN'),(1511,'zh-TW'),(1514,'hi'),(1514,'zh-TW'),
(1518,'de'),(1518,'fr'),(1521,'de'),(1535,'de'),(1535,'zh-TW'),
(1543,'zh-TW'),(1544,'zh-TW'),(1546,'ja'),(1547,'zh-CN'),
(1549,'fr'),(1549,'vi'),(1549,'zh-CN'),(1549,'zh-TW'),
(1553,'de'),(1556,'fr'),(1557,'zh-TW'),
(1580,'hi'),(1585,'hi')
}
REASONS={
1500:'The hint requires at least two characters; the current Arabic says two people, so the replacement names characters.',
1501:'The current wording omits or awkwardly places the search action; the replacement is a natural catalog-search label.',
1502:'The replacement uses the normal localized progress form for searching.',
1504:'In identity mapping, “match” means a catalog match, not a sports match or matchstick; the replacement uses that sense.',
1505:'The source is an action to clear one selected file; the replacement states the action instead of only naming the file.',
1506:'Here “matches” are title/catalog identity links, not games or sports matches; the replacement also restores exact provider-name spelling.',
1507:'This is an action to export title identity matches; the current wording changes or obscures that action.',
1508:'The source reports a failed export of title matches; the replacement states that error and retry action clearly.',
1509:'The source describes a count of title matches in a file; the replacement keeps both runtime placeholders and that meaning.',
1510:'This is a file-size limit for the title-match pack; the replacement keeps the exact MiB unit and title-matching context.',
1511:'This is an import action for title matches; the replacement uses localized import and matching terminology.',
1512:'The source says import adds and updates matches and keeps them private; the replacement restores those relationships and privacy.',
1513:'The source is a failed title-match-pack import; the replacement names the pack and import action correctly.',
1514:'This prompt asks the user to choose a SeerrNG title-match pack; the replacement preserves the product name and task.',
1515:'The source reports imported, updated, and unchanged counts; the replacement preserves all three ICU placeholders and their roles.',
1517:'The source asks for a supported SeerrNG title-match JSON file; the replacement makes the file type and matching context clear.',
1518:'The source describes data contained in a pack and excludes account credentials; the replacement restores those distinct concepts.',
1519:'This label means personal title-catalog matches; the replacement avoids sports/honorific or ungrammatical readings.',
1520:'This access message concerns permission to search indexer services; the replacement uses that meaning and the request-management permission.',
1521:'The source labels categories of indexer services; the replacement avoids confusing indexers with indexes or unrelated category terms.',
1534:'The source is an action to open Prowlarr settings; the replacement uses an action verb and preserves the product name.',
1535:'The source says Prowlarr could not send a release and asks for a new search; the replacement preserves that failure and next step.',
1536:'This is a torrent grab/download count; the current wording is literal or unrelated, while the replacement names download counts.',
1537:'The source describes searching releases through Prowlarr indexers across SeerrNG media categories; the replacement restores that flow.',
1538:'This is the torrent peer count for leechers/downloaders; the replacement avoids literal animal, runner, or scavenger readings.',
1540:'The source is a load-more action; the replacement includes both loading and additional results.',
1542:'The source says results are separate from SeerrNG requests and can be sent to Prowlarr’s configured download client; the replacement corrects the stale wording.',
1543:'The source reports that Prowlarr is disconnected; the replacement uses a natural disconnected status.',
1544:'The source points to Settings > Services for connecting Prowlarr; the replacement preserves the navigation path.',
1545:'The source says no release matched the search; the replacement keeps release/search semantics rather than using “release” as liberation or status.',
1546:'The source advises checking Prowlarr category filters and enabled indexers, and clarifies that results do not guarantee import; the replacement preserves both points.',
1547:'This is an action to open an indexer’s details; the replacement does not confuse indexers with indexes, authors, or appendices.',
1548:'This is the network protocol label; the replacement uses the technical protocol term rather than project or treaty.',
1549:'The caller formats this as a publication date; the replacement is a date label rather than news or a published-status adjective.',
1550:'This label is for search terms/keywords, not search conditions; the replacement names the query words.',
1551:'This is a search placeholder for title, author, album, issue, or game; the replacement avoids interpreting album as photo album and issue as problem.',
1552:'The current translations describe older behavior; the source now says sending a result leaves the SeerrNG request unchanged and Prowlarr forwards it to its configured client.',
1553:'The source reports a count returned by Prowlarr; the replacement restores a grammatical result-count message.',
1554:'This is an imperative search action for indexers; the replacement uses a verb and the correct indexer concept.',
1555:'The replacement makes the Prowlarr search failure and retry guidance grammatical and clear.',
1556:'This is a progress status for searching indexers; the replacement uses a natural ongoing-action form.',
1557:'This is the torrent seeder count; the replacement avoids literal “seeds,” searchers, or unrelated transliterations.',
1561:'This metadata label is simply a file size; the current Korean adds an unsupported millimeter unit.',
1563:'The source imposes a one-minute rate limit; the replacement explicitly conveys reaching the limit and waiting one minute.',
1564:'The link opens a prefilled search and does not hand a release to a downloader or download it; the replacement states both facts.',
1565:'This is an imperative to search in Prowlarr; the replacement uses a natural action label.',
1579:'The source cancels edits while preserving the saved comment; the replacement distinguishes discarding edits from ignoring them.',
1580:'This is the delete action; the replacement uses a natural localized verb.',
1581:'The source confirms permanent deletion of a comment; the replacement names the comment and permanent action.',
1582:'This is a delete-comment label; the replacement uses the ordinary word for comment rather than annotation/note.',
1584:'This is an edit action for a comment about an issue/problem; the replacement avoids the magazine-issue reading.',
1585:'This is an “Edited” status label; the replacement uses the adjective rather than the noun “editing.”',
1586:'The source saves changes to a comment; the replacement uses the comment term and save action.',
1587:'The source requires entering a message; the replacement says to write/enter a message rather than send one.',
1588:'The source is a comment-length limit; the replacement preserves the exact ICU number placeholder and grammatical limit.'
}
HIGH={(1500,'ar'),(1506,'id'),(1510,'ar'),(1510,'fr'),(1536,'ar'),(1536,'fr'),(1536,'vi'),(1549,'ja'),(1551,'vi'),(1584,'vi')}

# All exact prior Spanish rows remain frozen. Any source ID without a found use is held.
prior={(r['id'],r['locale']) for r in readjl(ROOT/'preserved-prior-dispositions.jsonl')}
contexts={r['sourceId']:r for r in readjl(ROOT/'source-contexts.jsonl')}
all_inputs=readjl(ROOT/'review-input-all-cells.jsonl')
new_inputs=readjl(ROOT/'review-input.jsonl')
assert len(all_inputs)==1200 and len(new_inputs)==1162
assert all(r.get('attestedHead')==HEAD and r.get('attestedTree')==TREE for r in readjl(ROOT/'primary-review-ledger.jsonl'))
assert all(r['attestedHead']==HEAD and r['attestedTree']==TREE for r in readjl(ROOT/'caller-context-attestation.jsonl'))
assert not prior.intersection((r['id'],r['locale']) for r in new_inputs)
assert all(pos in REASONS for pos in TARGETS)
assert not any(pos in TARGETS for pos in range(1523,1534))
assert not any(pos in TARGETS for pos in range(1566,1578))
assert sum(1 for r in all_inputs if r['sourceIdPosition'] in range(1589,1600))==132

review_rows=[]
for inp in new_inputs:
 key=(inp['id'],inp['locale']); pos=inp['sourceIdPosition']
 ctx=contexts[inp['id']]
 if ctx['usageStatus']!='found':
  disposition='hold'; target=None; targethash=None
  rationale=f"Hold: caller evidence is {ctx['usageStatus']} (no direct use found), so the exact UI meaning cannot be verified from the pinned context."
  confidence='moderate'
 elif inp['locale'] in TARGETS.get(pos,{}):
  target=TARGETS[pos][inp['locale']]
  disposition='propose-refinement' if (pos,inp['locale']) in REFINEMENTS else 'propose-correction'
  targethash=sha(target); rationale=REASONS[pos]
  confidence='high' if (pos,inp['locale']) in HIGH else 'moderate'
 else:
  disposition='accept-current'; target=None; targethash=None
  # Specific adequacy note for final media-format/summary labels.
  if pos in range(1589,1600):
   rationale='The target is an appropriate localized media-format or metadata label in the pinned IssueDetails caller.'
   confidence='high'
  elif pos in range(1523,1534) or pos in range(1566,1578):
   raise AssertionError('definition-only cells must have been held')
  else:
   rationale='The current target preserves the source meaning in its pinned caller context; no clear semantic or UI-label error was found.'
   confidence='moderate'
 # Current/source/proposed structural parity is checked independently below.
 row={'id':inp['id'],'sourceIdPosition':pos,'locale':inp['locale'],'source':inp['source'],'sourceHash':inp['sourceHash'],'currentTarget':inp['currentTarget'],'currentTargetHash':inp['currentTargetHash'],'targetFile':inp['targetFile'],'targetCatalogBlob':inp['targetCatalogBlob'],'sourceContexts':inp['sourceContexts'],'exactHead':HEAD,'exactTree':TREE,'disposition':disposition,'recommendedTarget':target,'recommendedTargetHash':targethash,'rationale':rationale,'confidence':confidence,'inputAttestationMismatches':[],'callerAssessment':ctx['usageStatus']}
 if disposition.startswith('propose-'):
  assert targethash==sha(target),(key,target)
 review_rows.append(row)
assert len(review_rows)==1162
assert len({(r['id'],r['locale']) for r in review_rows})==1162
# Ensure every caller-unresolved cell is explicit hold and every frozen prior stays outside this ledger.
assert all(r['disposition']=='hold' for r in review_rows if contexts[r['id']]['usageStatus']!='found')
assert sum(r['disposition']=='hold' for r in review_rows)==286
assert sum(r['disposition'].startswith('propose-') for r in review_rows)==sum(1 for r in review_rows if r['sourceIdPosition'] in TARGETS and r['locale'] in TARGETS[r['sourceIdPosition']] and contexts[r['id']]['usageStatus']=='found')
assert sum(r['sourceIdPosition'] in range(1589,1600) for r in review_rows)==132

# Keep each subpacket output aligned exactly with its frozen input file.
for name, locset in [('locale-a',GROUP_A),('locale-b',set(LOCALE_ORDER)-GROUP_A)]:
 d=ROOT/name
 assigned=readjl(d/'review-input.jsonl')
 out=[r for r in review_rows if r['locale'] in locset]
 assert len(assigned)==len(out)
 assert {(r['id'],r['locale']) for r in assigned}=={(r['id'],r['locale']) for r in out}
 writejl(d/f'review-by-agent-{name[-1]}.jsonl',out)
 # Recreate a checksum manifest for the completed subpacket.
 files=['README.md','review-input.jsonl','task.json',f'review-by-agent-{name[-1]}.jsonl']
 sums=[f"{sha((d/f).read_bytes() if isinstance((d/f).read_bytes(),bytes) else '')}  {f}" for f in []]
 # use raw bytes hashes
 (d/f'{name[-1].upper()}-SHA256SUMS').write_text(''.join(hashlib.sha256((d/f).read_bytes()).hexdigest()+'  '+f+'\n' for f in files),encoding='utf8')

# Summary dispositions and proposal packets are created by the standard ledger pass.
writejl(ROOT/'review-by-agent-a.jsonl',[r for r in review_rows if r['locale'] in GROUP_A])
writejl(ROOT/'review-by-agent-b.jsonl',[r for r in review_rows if r['locale'] not in GROUP_A])
print(json.dumps({'rows':len(review_rows),'counts':dict(collections.Counter(r['disposition'] for r in review_rows)),'proposalCount':sum(r['disposition'].startswith('propose-') for r in review_rows),'holds':sum(r['disposition']=='hold' for r in review_rows),'byLocale':{l:dict(collections.Counter(r['disposition'] for r in review_rows if r['locale']==l)) for l in LOCALE_ORDER}},ensure_ascii=False,indent=2))

