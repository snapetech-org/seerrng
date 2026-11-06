import json, hashlib, pathlib, re, collections
ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-primary-20261102')
HEAD='5aceef6ed6e865ee89383738212d1ce1a5c1f552'; TREE='dd6e3495c44c2c14acf8a7a4b09a21e935ceb16d'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def add(pos,loc,target,reason,disp='propose-correction',conf='high'):
 DEC[(pos,loc)]={'disposition':disp,'targetText':target,'rationale':reason,'confidence':conf}
DEC={}
# IssueDiscussion comments and feedback. Manage is the app's issue-management section, comments remain comments.
for loc,target in {
'ar':'أضف هذا التعليق إلى المشكلة دون مغادرة قسم «إدارة».',
'de':'Fügen Sie diesen Kommentar zum Problem hinzu, ohne den Bereich „Verwalten“ zu verlassen.',
'es':'Añade este comentario al problema sin salir de la sección «Gestionar».',
'fr':'Ajoutez ce commentaire au problème sans quitter la section « Gérer ».',
'hi':'«प्रबंधन» अनुभाग छोड़े बिना यह टिप्पणी समस्या में जोड़ें।',
'id':'Tambahkan komentar ini ke masalah tanpa meninggalkan bagian “Kelola”.',
'ja':'管理ページを離れずに、このコメントを問題に追加します。',
'ko':'관리 페이지를 벗어나지 않고 이 댓글을 문제에 추가합니다.',
'pt_BR':'Adicione este comentário ao problema sem sair da seção “Gerenciar”.',
'vi':'Thêm bình luận này vào sự cố mà không rời khỏi mục “Quản lý”.',
'zh_Hans':'无需离开“管理”页面即可将此评论添加到问题中。',
'zh_Hant':'無須離開「管理」頁面即可將此留言新增至問題中。',
}.items(): add(1615,loc,target,'IssueDiscussion sits in the Manage area. The pinned i18n.manage catalog entry confirms the section context; the target references that section in natural localized wording and preserves the support-issue meaning.')
add(1614,'ar','إضافة تعليق','The Add Comment button needs the object “comment”; the current value only says “add.”')
add(1614,'de','Kommentar hinzufügen','The caller adds a discussion comment; “Kommentare/Anmerkungen” is less exact for this action.')
add(1614,'vi','Thêm bình luận','The discussion form adds a comment; “Ghi chú” means notes and omits the add action.')
add(1614,'zh_Hans','添加评论','This is the discussion form’s Add Comment button; “注释” means an annotation, not a comment.')
add(1614,'zh_Hant','新增留言','The discussion form’s action is to add a comment; “註解” means an annotation.')
add(1619,'de','Kommentare','In this Discussion section the heading names user comments; “Anmerkungen” suggests annotations.')
add(1619,'vi','Bình luận','The IssueDiscussion section contains user comments; “Chú thích” means notes/annotations.')
add(1619,'zh_Hant','留言','The IssueDiscussion section contains user comments; 註解 means annotation rather than a comment.')
add(1618,'vi','Thêm bình luận...','This is the comment textarea placeholder; “chú thích” means annotation rather than user comment.')
add(1618,'zh_Hans','添加评论...','This placeholder is for the IssueDiscussion comment textarea, not an annotation.')
add(1618,'zh_Hant','新增留言...','This placeholder is for the IssueDiscussion comment textarea, not an annotation.')
add(1625,'zh_Hans','添加前请输入评论。','The validation message asks for a comment before submission; use the same term as the comment field.')
add(1625,'zh_Hant','新增前請先輸入留言。','The validation message asks for a comment before submission; use the same term as the comment field.')
add(1625,'vi','Vui lòng nhập bình luận trước khi thêm.','The validation message refers to a submitted user comment; current phrase is understandable but can be more natural.',disp='propose-refinement',conf='moderate')
# Close/reopen help; preserve issue-report semantics.
for loc,target in {
'ar':'علِّم هذه المشكلة كمغلقة. احتفظ بوصفها وتعليقاتها وسجلها.',
'fr':'Marquez ce problème comme fermé. Conservez sa description, ses commentaires et son historique.',
'vi':'Đánh dấu sự cố này là đã đóng. Giữ lại phần mô tả, bình luận và lịch sử của sự cố.',
'zh_Hans':'将此问题标记为已关闭。保留其描述、评论和历史记录。',
'zh_Hant':'將此問題標記為已關閉。保留其描述、留言及歷史記錄。',
}.items(): add(1617,loc,target,'IssueDiscussion is a ticket/status action: mark the report closed and retain its description, comments, and history.')
add(1617,'ja','この問題をクローズ済みにします。説明、コメント、履歴は保持されます。','The help tooltip describes the close action and retaining issue history; current short text leaves out the explicit closed state.',disp='propose-refinement',conf='moderate')
add(1617,'ko','이 문제를 닫힌 상태로 표시합니다. 설명, 댓글 및 기록은 유지됩니다.','The caller changes an issue status; this wording states the closed state and retained history.',disp='propose-refinement',conf='moderate')
add(1617,'es','Marca este problema como cerrado. Conserva su descripción, comentarios e historial.','The caller closes a support issue. “Problema” makes the report sense explicit; the current “asunto” is valid but less direct.',disp='propose-refinement',conf='moderate')
for loc,target in {
'hi':'इस बंद समस्या को फिर से खोलें ताकि उस पर दोबारा कार्रवाई की जा सके। इसकी टिप्पणियाँ और इतिहास सुरक्षित रखें।',
'ja':'このクローズ済みの問題を再開して、再度対応できるようにします。コメントと履歴は保持されます。',
'ko':'이 닫힌 문제를 다시 열어 다시 조치할 수 있도록 합니다. 댓글과 기록은 유지됩니다.',
'vi':'Mở lại sự cố đã đóng này để có thể tiếp tục xử lý. Giữ lại bình luận và lịch sử của sự cố.',
'zh_Hant':'重新開啟這個已關閉的問題，以便再次處理。保留其留言和歷史記錄。',
}.items(): add(1624,loc,target,'The reopen tooltip describes reopening a closed support issue for further action while retaining its comments and history.')
add(1624,'es','Reabre este problema cerrado para que pueda volver a tratarse. Conserva sus comentarios e historial.','This is an imperative help tooltip for reopening a closed report; the current infinitive/formal imperative mix is awkward.',disp='propose-refinement',conf='moderate')
add(1624,'fr',"Rouvrez ce problème fermé afin qu'il puisse être traité à nouveau. Conservez ses commentaires et son historique.",'The tooltip instructs the user to reopen a closed support problem; question is less precise in this caller context.',disp='propose-refinement',conf='moderate')
add(1624,'pt_BR','Reabra este problema fechado para que volte a ser tratado. Mantenha seus comentários e histórico.','The tooltip instructs the user to reopen a closed support problem; problema is clearer than questão in this context.',disp='propose-refinement',conf='moderate')
# Comments/description and save feedback.
add(1620,'fr','Description','This is a section heading for the issue report description; the current phrase means a description of merchandise.')
add(1620,'ja','説明','This heading labels the report description; コンテンツ means content rather than description.')
add(1640,'fr','Description','This metadata label is the issue report description, not a goods description.')
add(1640,'ja','説明','This metadata label identifies the report description; コンテンツ means content.')
add(1626,'hi','परिवर्तन सहेज लिए गए।','This success message says changes have been saved; the current Hindi has incorrect agreement and a singular noun.')
add(1626,'ja','変更が保存されました。','The toast reports a completed save; the current noun fragment “saved changes” does not state that saving succeeded.')
add(1626,'vi','Đã lưu các thay đổi.','The toast reports saved changes; “tiết kiệm” means saving money, not saving data.')
# Placeholder-sensitive length message.
add(1627,'ar','يجب ألا يتجاوز التعليق {maxLength, number} حرفًا.','The form validation limits comment character count; the current word means people/characters as persons.')
add(1627,'fr','Le commentaire ne doit pas dépasser {maxLength, number} caractères.','The validation message states a maximum number of characters; current French is unidiomatic and lacks the “must not exceed” structure.')
add(1627,'hi','टिप्पणी की लंबाई {maxLength, number} वर्णों से अधिक नहीं होनी चाहिए।','This is a character limit error; fix agreement and keep the exact numeric ICU placeholder.')
add(1627,'ja','コメントは{maxLength, number}文字以内にしてください。','This form validation requires the comment to stay within the displayed character limit; current wording is garbled.')
add(1627,'pt_BR','O comentário deve ter no máximo {maxLength, number} caracteres.','In this validation message “characters” means text characters, not people/personagens; preserve the number placeholder.')
add(1627,'vi','Bình luận không được vượt quá {maxLength, number} ký tự.','The validation message limits text characters; current wording uses “nhân vật” (characters/people) and “Ghi chú” (notes).')
add(1627,'zh_Hans','评论不得超过 {maxLength, number} 个字符。','This validation message limits comment length; use the comment term used by the discussion UI.')
add(1627,'zh_Hant','留言不得超過 {maxLength, number} 個字元。','This validation message limits comment length; use a traditional Chinese comment term and retain the exact ICU placeholder.',disp='propose-refinement',conf='moderate')
# Focused ticket views and issue-list media/report distinction.
add(1628,'de','Alle Probleme anzeigen','FocusedIssue shows a specific support report; “Ausgaben” means media editions/issues.')
add(1628,'fr','Afficher tous les problèmes','FocusedIssue returns to the full support-issue list; “numéros” means numbered media issues.')
add(1629,'ar','هذه المشكلة غير متاحة، أو ليست لديك صلاحية لعرضها.','This message concerns access to a support issue; avoid assigning the viewer a feminine gender and use a direct access phrase.',disp='propose-refinement',conf='moderate')
add(1629,'fr',"Ce problème n'est pas disponible ou vous n'avez pas l'autorisation de le consulter.",'FocusedIssue reports an unavailable support issue; “numéro” incorrectly suggests a comic/magazine issue.')
add(1629,'vi','Sự cố này không khả dụng hoặc bạn không có quyền xem.','This is a support issue’s availability/permission message; “Số này” reads as an issue number.')
add(1629,'zh_Hans','此问题不可用，或者您没有查看权限。','The caller reports an unavailable support issue or lack of viewing permission; current wording says it cannot be solved.')
add(1629,'zh_Hant','此問題目前無法查看，或您沒有查看權限。','The caller reports an unavailable support issue or lack of viewing permission; current wording is clipped and uses the wrong referent.')
# Season summary message translations are used by IssueItem's affected-season summary helper.
add(1632,'pt_BR','Nenhuma selecionada','The helper summarizes selected seasons (temporadas, feminine), so the empty selection should agree with that noun.',disp='propose-refinement',conf='moderate')
# Creator/created-date metadata.
add(1637,'pt_BR','Fechado','This is a compact issue-status badge; the final period is unnecessary punctuation.',disp='propose-refinement',conf='moderate')
add(1661,'es','Desconocido','The placeholder follows the masculine issue-type label “Tipo”; the current feminine form does not agree.')
add(1638,'ar','منشئ المشكلة','The label precedes the issue creator’s name; the current phrase means “established under/by” and is not the creator label.')
add(1638,'ja','作成者','This label precedes the issue creator’s name; a concise “creator” label is natural in Japanese, unlike the current clause fragment.')
add(1639,'hi','निर्माण तिथि','The metadata label is when the issue was created; the current “तारीख” loses that meaning.')
add(1639,'vi','Ngày tạo','This label identifies the issue creation date; “Tạo” alone means create.')
add(1639,'ja','作成日','This compact metadata label means creation date; the current longer clause is awkward.')
# Issue-item detail tooltip and media fields.
for loc,target in {
'ar':'وسّع وصف المشكلة وتعليقاتها وإجراءاتها هنا أو اطوِها.',
'es':'Expande o contrae aquí la descripción, los comentarios y las acciones de este problema.',
'fr':'Développez ou réduisez ici la description, les commentaires et les actions de ce problème.',
'hi':'यहाँ इस समस्या का विवरण, टिप्पणियाँ और कार्रवाइयाँ खोलें या समेटें।',
'id':'Tampilkan atau sembunyikan deskripsi, komentar, dan tindakan untuk masalah ini di sini.',
'ja':'この問題の説明、コメント、操作をここで展開または折りたたみます。',
'ko':'여기에서 이 문제의 설명, 댓글 및 작업을 펼치거나 접습니다.',
'pt_BR':'Expanda ou recolha aqui a descrição, os comentários e as ações deste problema.',
'vi':'Mở rộng hoặc thu gọn phần mô tả, bình luận và thao tác của sự cố này tại đây.',
'zh_Hans':'在此展开或收起此问题的描述、评论和操作。',
'zh_Hant':'在此展開或收合此問題的描述、留言及操作。',
}.items(): add(1641,loc,target,'The IssueItem tooltip controls an accordion for a support issue; “expand/collapse” means show/hide its description, comments, and actions.')
add(1643,'ja','初刊日','This date label is for first publication of a book/comic, not a premiere; use publication terminology.')
add(1643,'ko','최초 발행','The metadata is a book/comic’s first publication; 게시 means posting rather than publication.')
add(1643,'pt_BR','Primeira publicação','This compact label names the first publication date; the current masculine “Primeiro Publicado” is an awkward fragment.',disp='propose-refinement',conf='moderate')
add(1645,'fr','Motif','The IssueItem displays one reason label/value; the singular “Motif” matches the source.',disp='propose-refinement',conf='moderate')
# Metadata labels for media issue count (comic/magazine issues), versus ticket details.
add(1649,'ar','تعذّر تحميل تفاصيل المشكلة.','This error is specifically about loading the issue report details; name the missing object in Arabic.')
add(1649,'ja','問題の詳細を読み込めませんでした。','This error reports failure to load the ticket details; the current text is grammatically awkward.')
add(1649,'ko','문제 세부 정보를 불러오지 못했습니다.','This reports a failure to load ticket details; 적재 means loading cargo rather than UI data.')
add(1649,'pt_BR','Não foi possível carregar os detalhes do problema.','This is a UI load error for a support issue, better expressed as an inability than “incapable.”',disp='propose-refinement',conf='moderate')
add(1649,'vi','Không thể tải chi tiết sự cố.','This error concerns issue report details; include the missing object instead of the generic “details.”',disp='propose-refinement',conf='moderate')
add(1649,'zh_Hans','无法加载问题详情。','This UI error reports failure to load a support issue’s details; current wording says “release details.”')
add(1649,'zh_Hant','無法載入問題詳細資訊。','This UI error reports failure to load a support issue’s details; current wording says “release details.”')
add(1650,'ar','جارٍ تحميل تفاصيل المشكلة…','The status announces loading of the support issue’s details; the current Arabic describes location-identification details.')
add(1650,'es','Cargando los detalles del problema…','This status is loading the support issue details; “edición” suggests a media edition.')
add(1650,'fr','Chargement des détails du problème…','This loading status concerns a support issue’s details; naming the object makes the message complete.',disp='propose-refinement',conf='moderate')
add(1650,'ja','問題の詳細を読み込んでいます…','This status announces that ticket details are loading; the current Japanese word order is unnatural.')
add(1650,'ko','문제 세부 정보를 불러오는 중…','This status announces loading ticket details; 선적 means shipping/loading cargo.')
add(1650,'vi','Đang tải chi tiết sự cố…','This status announces loading of the issue report details; the current message omits the object.')
add(1650,'zh_Hans','正在加载问题详情…','This status announces loading support issue details; use the UI term 加载 and a concise details term.')
add(1650,'zh_Hant','正在載入問題詳細資訊…','This status announces loading support issue details; use the UI term 載入 and traditional Chinese forms.')
# Open in external media manager, runtime names and format labels are preserved exactly.
add(1654,'hi','{arr} में खोलें','The button opens the linked service; Hindi word order places the app name before “में खोलें.”',disp='propose-refinement',conf='moderate')
add(1654,'id','Buka di {arr}','The source means open the media item in the named app; masuk is not the right preposition here.')
add(1654,'ja','{arr}で開く','The external-service button means open in the named app; current text omits “in” and the action.')
add(1654,'pt_BR','Abrir em {arr}','This button opens the item in the named external app; remove the stray period and use a neutral preposition.',disp='propose-refinement',conf='moderate')
add(1654,'vi','Mở bằng {arr}','The button means open the item using the named app; the current text omits that relation.',disp='propose-refinement',conf='moderate')
add(1654,'zh_Hant','在 {arr} 中開啟','The button opens the item in the named external app; remove the unsupported “server” literal.')
add(1655,'ar','افتح {format} في {arr}','The button is an imperative action to open the runtime format in the named app; current Arabic is a state adjective.')
add(1655,'hi','{arr} में {format} खोलें','The button opens the chosen runtime format in the named service; current Hindi uses an adjective and reversed relation.')
add(1655,'id','Buka {format} di {arr}','The button opens the named runtime format in the external app; replace the English preposition “in.”')
add(1655,'ko','{arr}에서 {format} 열기','The source opens the format in the named service; current Korean text changes the meaning to “etc. format in my account.”')
add(1655,'pt_BR','Abrir {format} em {arr}','The action opens the runtime format in the named service; remove the stray period.',disp='propose-refinement',conf='moderate')
add(1655,'vi','Mở {format} trong {arr}','The action opens the selected format in the named app; “in” should be localized.')
add(1655,'zh_Hans','在 {arr} 中打开 {format}','The action opens a runtime format in the named app; 输入 means input and is incorrect here.')
add(1655,'zh_Hant','在 {arr} 中開啟 {format}','The action opens a runtime format in the named app; replace the English “in” with natural Traditional Chinese syntax.')
add(1656,'ar','الصفحات','The metadata label is plural Pages; the current Arabic is singular page.')
add(1656,'zh_Hans','页数','This label gives the page count; 页数 is the concise metadata term, while 页次 means page sequence/number.')
add(1656,'zh_Hant','頁數','This label gives the page count; 頁數 is the concise metadata term.')
add(1657,'ar','تاريخ الإصدار','This metadata is the release date; the current Arabic only says “date.”',disp='propose-refinement',conf='moderate')
add(1657,'vi','Ngày phát hành','This metadata is the release date; “Phát hành” alone names an action.',disp='propose-refinement',conf='moderate')
add(1657,'zh_Hant','發行日期','This media metadata is the release date; replace the simplified 发布 with Traditional Chinese.')
add(1659,'hi','अवधि','The media-summary row shows play/runtime duration, so a duration label is clearer than transliterated software “runtime.”',disp='propose-refinement',conf='moderate')
add(1659,'ja','再生時間','This is a media duration label, not a software runtime; it should match the summary’s 再生時間 terminology.')
add(1659,'zh_Hans','时长','This field is media runtime/duration, not process execution time.')
add(1659,'zh_Hant','時長','This field is media runtime/duration, not process execution time.')
# Main issue-list filters.
add(1664,'ar','نوع الألبوم','This filter names the type of music album; add the definite article to the current label.',disp='propose-refinement',conf='moderate')
add(1664,'vi','Loại album','The filter is specifically the album type for music; “Tập” means an episode/volume.')
add(1664,'zh_Hans','专辑类型','The filter is for a music album, not a photo album; use 专辑 rather than 相册.')
add(1664,'zh_Hant','專輯類型','The filter is for a music album, not a photo album; use 專輯 rather than 相簿.')
add(1665,'fr','Tous les problèmes','This option filters support reports; “numéros” suggests comic or magazine issue numbers.')
add(1665,'pt_BR','Todos os problemas','This option selects all support issue reports; questões means questions and is less apt here.',disp='propose-refinement',conf='moderate')
add(1666,'hi','सभी मीडिया','This filter option means all media; the current value omits “all.”')
add(1667,'hi','संपूर्ण अवधि','This is the unbounded time filter; the current “समय” omits the all-time scope.')
add(1667,'ko','전체 기간','This filter means the whole time range, not “whole time” as an abstract duration.',disp='propose-refinement',conf='moderate')
add(1667,'pt_BR','Todo o período','This option means the entire time range; the current phrase is missing an article and is awkward.',disp='propose-refinement',conf='moderate')
add(1667,'vi','Toàn bộ thời gian','This filter covers the entire time range; “Mọi thời gian” is understandable but less natural as a UI option.',disp='propose-refinement',conf='moderate')
add(1667,'zh_Hans','不限时间','This option removes the time restriction; current “history” is a related but less exact label.',disp='propose-refinement',conf='moderate')
add(1667,'zh_Hant','不限時間','This option removes the time restriction; current “history” is a related but less exact label.',disp='propose-refinement',conf='moderate')
add(1674,'ar','عوامل التصفية','This is the filter section heading; the current word means movies.')
add(1674,'ko','필터','This is a heading for filter controls, not the activity “filtering.”',disp='propose-refinement',conf='moderate')
add(1674,'vi','Bộ lọc','This is a noun heading for filter controls; “Lọc” is the action “filter.”',disp='propose-refinement',conf='moderate')
add(1674,'zh_Hant','篩選條件','This is the filter-controls heading; replace simplified 过滤器 with natural Traditional Chinese wording.')
add(1675,'ja','初刊日','This date filter is for a book/comic’s first publication, not its premiere.')
add(1675,'ko','최초 발행','This filter uses a book/comic publication date; 게시 means posting.')
add(1675,'pt_BR','Primeira publicação','This filter is for a first-publication date; the current masculine fragment is awkward.',disp='propose-refinement',conf='moderate')
add(1676,'ar','آخر 14 يومًا','The time-filter label means the preceding 14 days; this spelling supplies the Arabic accusative tanwin.',disp='propose-refinement',conf='moderate')
add(1676,'hi','पिछले 14 दिन','The filter refers to the preceding two weeks; अंतिम means the final 14 days.')
add(1676,'ja','過去14日間','This time filter means the previous 14 days, not the final 14 days.')
add(1676,'ko','지난 14일','This time filter means the past 14 days; 마지막 means the final 14 days.')
add(1678,'ar','نوع المشكلة','This filter selects audio/video/subtitle/other issue-report type; name the report problem to avoid media-type ambiguity.',disp='propose-refinement',conf='moderate')
add(1678,'de','Art des Problems','This filter classifies support reports by audio/video/subtitle/other; Emissionsart means broadcast type.',disp='propose-correction',conf='high')
add(1678,'es','Tipo de problema','This filter classifies support reports by audio/video/subtitle/other; edición means a media edition.')
add(1678,'fr','Type de problème','This filter classifies support reports by audio/video/subtitle/other; émission means a broadcast/program type.')
add(1678,'hi','समस्या का प्रकार','This filter selects the type of support issue; the current calque is awkward and ambiguous.',disp='propose-refinement',conf='moderate')
add(1678,'id','Jenis masalah','This filter classifies support reports by audio/video/subtitle/other; “masalah” is more natural than the English-derived “isu.”',disp='propose-refinement',conf='moderate')
add(1678,'ja','問題の種類','This filter selects audio/video/subtitle/other support-problem type; 課題 suggests a task/assignment.')
add(1678,'zh_Hant','問題類型','This filter selects support-issue type; 發佈型態 means publication format.')
add(1679,'vi','Vấn đề','This is the support-issue list heading; Số reads as a number or serial issue.')
add(1679,'ko','문제','This is the support-issue list heading; 문제 is clearer and more natural than the bare English loanword 이슈.',disp='propose-refinement',conf='moderate')
# Remaining filter/detail labels with clear meaning errors or language-script mismatches.
add(1681,'zh_Hant','媒體篩選條件','This is the media-filter section label; replace the simplified filter characters with Traditional Chinese.')
add(1683,'ko','음악','The music media-filter button contains only a middle dot, so it does not label Music.')
add(1686,'ar','تاريخ الإصدار','This filter is by release date; the current label only says “date.”',disp='propose-refinement',conf='moderate')
add(1686,'vi','Ngày phát hành','This filter selects release dates; the current label only says “release.”',disp='propose-refinement',conf='moderate')
add(1686,'zh_Hant','發行日期','This filter selects the release date; replace the simplified 发布 with Traditional Chinese.')
add(1687,'ar','سنة الإصدار','This filter is by release year; current “year” omits the release qualifier.',disp='propose-refinement',conf='moderate')
add(1687,'vi','Năm phát hành','This filter selects release years; current “Phát hành” omits the year.')
add(1687,'zh_Hant','發行年份','This filter is the release year; replace simplified 发布 with Traditional Chinese.')
add(1687,'ko','출시 연도','This filter label means release year; the current spacing/form is less natural Korean.',disp='propose-refinement',conf='moderate')
add(1689,'ar','ابحث عن المشكلات','This is the search action for support issue reports; the current noun phrase means research issues.')
add(1689,'fr','Rechercher des problèmes','This is the search field’s placeholder/action for support reports; the current phrase means research problems.')
add(1689,'hi','समस्याएँ खोजें','This is a search action for support issue reports; the current word order is unnatural.')
add(1689,'id','Cari masalah','This is a search action for support issue reports; the noun phrase is less direct.',disp='propose-refinement',conf='moderate')
add(1689,'pt_BR','Buscar problemas','This is the search action for issue reports; questões can read as questions rather than problems.',disp='propose-refinement',conf='moderate')
add(1689,'vi','Tìm kiếm vấn đề','This is a search action for support reports; Số means a number/serial issue.')
add(1691,'hi','पिछले 7 दिन','The time filter means the previous seven days; अंतिम means the final seven days.')
add(1691,'ja','過去7日間','This time filter means the preceding seven days, not the final seven days.')
add(1691,'ko','지난 7일','This time filter means the past seven days; 마지막 means the final seven days.')
add(1691,'zh_Hant','過去 7 天','This time filter means the preceding seven days; use the usual past-period wording rather than 最後.')
add(1692,'de','Alle Probleme anzeigen','This action returns to all support issues; “Ausgaben” means media editions/issues.')
add(1692,'fr','Afficher tous les problèmes','This action returns to the support-issue list; “numéros” suggests comic/magazine issue numbers.')
add(1694,'ja','過去6か月','This filter means the preceding six months, not six months ago.')
add(1694,'zh_Hant','過去 6 個月','This filter means the preceding six months; 个月 is simplified Chinese.')
add(1695,'hi','इसके अनुसार क्रमबद्ध करें','This label introduces the sort criterion; the current passive fragment reads “sorted by.”',disp='propose-refinement',conf='moderate')
add(1695,'zh_Hant','排序方式','This label introduces sort options; the current “按” is an incomplete fragment.')
add(1696,'ja','日付','This sort option means date; 日程表 means schedule/timetable.')
# Build final primary ledger.
base=[json.loads(x) for x in (ROOT/'source-current-cells.jsonl').read_text().splitlines()]
ctx={json.loads(x)['sourceId']:json.loads(x) for x in (ROOT/'caller-contexts.jsonl').read_text().splitlines()}
manage={json.loads(x)['locale']:json.loads(x) for x in (ROOT/'manage-labels.jsonl').read_text().splitlines()}
prior_count=0
for r in base:
 key=(r['sourcePosition'],r['locale']); d=DEC.get(key)
 c=ctx[r['sourceId']]
 direct=[]
 leaf=r['sourceId'].split('.')[-1]
 for ref in c['pinnedLineRefs']:
  txt=ref['lineText']
  if f'messages.{leaf}' in txt or ('.affectedSummary.' in r['sourceId'] and leaf in txt): direct.append(ref['line'])
 r['callerUseStatus']='direct-or-helper-callsite-found' if direct else 'definition-only/no direct reference in pinned component file'
 r['callerLines']=sorted(set(direct)) or [x['line'] for x in c['pinnedLineRefs'][:2]]
 r['callerPath']=c['callerPath']; r['callerBlob']=c['callerBlob']; r['callerFileSha256']=c['callerFileSha256']
 if r['sourceId']=='components.IssueDiscussion.addHelp':
  r['relatedContextRef']='i18n.manage'
  r['relatedContextLabel']=manage[r['locale']]['currentTarget']
  r['relatedContextTargetHash']=manage[r['locale']]['currentTargetHash']
  r['relatedContextCatalogBlob']=manage[r['locale']]['localeBlob']
 if not direct: r['reviewNote']='Pinned message definition found but no direct matching reference was found in this component file; no claim that this key renders.'
 # Exact placeholders are an unordered multiset; keep output inventory canonical.
 norm=lambda xs: sorted(xs,key=lambda x:(x['name'],x['kind']))
 r['sourcePlaceholders']=norm(r['sourcePlaceholders']); r['targetPlaceholders']=norm(r['targetPlaceholders'])
 r['placeholderParity']='exact' if collections.Counter((x['name'],x['kind']) for x in r['sourcePlaceholders'])==collections.Counter((x['name'],x['kind']) for x in r['targetPlaceholders']) else 'mismatch'
 # Markup tags are none for this window.
 tagre=re.compile(r'</?[A-Za-z][^>]*>')
 r['markupSource']=tagre.findall(r['source']); r['markupCurrent']=tagre.findall(r['currentTarget'])
 r['markupParity']='exact' if r['markupSource']==r['markupCurrent'] else 'mismatch'
 r['protectedLiterals']=[x['name'] for x in r['sourcePlaceholders']]
 if d:
  if r['disposition']=='preserved-prior-disposition':
   prior_count+=1
   # frozen source/target must remain unchanged; prior target/hash and disposition come from exact attested plan
   r['targetText']=r['currentTarget']; r['targetHash']=r['currentTargetHash']
   r['reviewNote']='Exact prior Spanish disposition retained and live source/current target reattested.'
  else:
   r['disposition']=d['disposition']; r['rationale']=d['rationale']; r['confidence']=d['confidence']
   r['targetText']=d['targetText']; r['targetHash']=sha(d['targetText'])
   r['reviewNote']='Candidate reviewed against source and pinned component caller; exact placeholders and literals checked.'
 else:
  if r['disposition']=='preserved-prior-disposition':
   prior_count+=1; r['targetText']=r['currentTarget']; r['targetHash']=r['currentTargetHash']
  else:
   r['disposition']='accept-current'; r['targetText']=r['currentTarget']; r['targetHash']=r['currentTargetHash']
   key_name=r['sourceId'].split('.')[-1]
   if key_name in ('issueCount','minutes','seasonCount'):
    r['rationale']='The locale’s pluralized count preserves the count token and the caller displays this value as a count in the pinned component.'
   elif key_name in ('openarr','openarrFormat'):
    r['rationale']='The source is a button label for opening media in a runtime-named service; the current target keeps the exact runtime placeholders.'
   elif r['sourceId'].startswith('components.IssueDiscussion.'):
    r['rationale']='The current wording conveys the discussion form action/state or feedback message in the pinned issue-report context; required text placeholders are preserved.'
   elif r['sourceId'].startswith('components.IssueList.FocusedIssue') or key_name in ('issues','allIssues','searchIssues','showAllIssues','issueType'):
    r['rationale']='The current wording matches the pinned issue-list control or support-report context; no meaning-changing issue was found.'
   else:
    r['rationale']='The current label/message conveys the source meaning in the pinned caller context; no material semantic error was found.'
   r['confidence']='moderate'
 # Validate proposed placeholders against source; don't accept any candidate that changes ICU arguments.
 source_ph=[{'name':m.group(1),'kind':m.group(2) or 'simple'} for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal))?\b',r['source'])]
 target_ph=[{'name':m.group(1),'kind':m.group(2) or 'simple'} for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal))?\b',r['targetText'])]
 r['candidatePlaceholderParity']='exact' if collections.Counter((x['name'],x['kind']) for x in source_ph)==collections.Counter((x['name'],x['kind']) for x in target_ph) else 'mismatch'
 r['candidateMarkupParity']='exact' if tagre.findall(r['source'])==tagre.findall(r['targetText']) else 'mismatch'
 r['protectedLiteralParity']='exact' if r['candidatePlaceholderParity']=='exact' else 'mismatch'
 if not direct:
  r['reviewNote']='Pinned message definition found but no direct matching reference was found in this component file; no claim that this key renders.'
 if r['placeholderParity']!='exact' or r['candidatePlaceholderParity']=='mismatch' or r['markupParity']!='exact' or r['candidateMarkupParity']!='exact':
  r['reviewNote'] += ' CHECK REQUIRED: token/markup mismatch.'
# Write packet ledger only.
(ROOT/'primary-review-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in base))
# Summary
counts=collections.Counter(r['disposition'] for r in base)
summary={'schemaVersion':1,'task':'SeerrNG PR #418 primary semantic review W1600–1699, 12 direct locales','repository':'snapetech-org/seerrng','pullRequest':418,'livePullRequestState':'OPEN','livePullRequestDraft':True,'liveHead':HEAD,'liveTree':TREE,'rowCount':len(base),'sourceIds':len(set(r['sourceId'] for r in base)),'locales':LOCALES,'priorFrozenCount':prior_count,'candidateRowCount':sum(r['targetText']!=r['currentTarget'] for r in base),'dispositionCounts':dict(counts),'noDirectCallerSourceIds':sorted({r['sourceId'] for r in base if r['callerUseStatus']!='direct-or-helper-callsite-found'}),'callerEvidencePaths':sorted({r['callerPath'] for r in base}),'sourceCurrentInputSha256':sha((ROOT/'source-current-cells.jsonl').read_text()),'manageLabelsSha256':sha((ROOT/'manage-labels.jsonl').read_text()),'callerContextsSha256':sha((ROOT/'caller-contexts.jsonl').read_text()),'placeholderCurrentMismatches':sum(r['placeholderParity']!='exact' for r in base),'placeholderCandidateMismatches':sum(r['candidatePlaceholderParity']=='mismatch' for r in base),'protectedLiteralMismatches':sum(r['protectedLiteralParity']=='mismatch' for r in base),'markupMismatches':sum(r['candidateMarkupParity']!='exact' for r in base),'holds':counts.get('hold',0),'nativeSpeakerApproval':False,'browserOrRepoMutations':False}
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
print('candidate count',sum(r['targetText']!=r['currentTarget'] for r in base),'candidate rows')
print('decision-map rows',len(DEC),'prior frozen',prior_count)
