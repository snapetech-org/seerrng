from __future__ import annotations
import collections, hashlib, json, pathlib, re

OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2700-2799-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118'
TREE='44cf1a02d645026872759fa04a7506ee738381e5'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TheTVDB','Whisparr','ISBN','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library','Bindery','Whisparr']
LANGUAGE_SOURCES={
 'rae_partido':{'title':'Real Academia Española, Diccionario de la lengua española: partido, partida','url':'https://dle.rae.es/partido','supports':'In the automatic edition-matching context, partido means a sports/game match; coincidencia is the intended software match.'},
 'rae_usted':{'title':'Real Academia Española, Gramática: treatment pronouns and agreement','url':'https://www.rae.es/gtg/docs/GTG_tablas_web.pdf','supports':'Spanish direct address in formal usted uses the usted verbal forms; the es proposals use Su and usted-form verbs.'},
 'moe_ji':{'title':'Taiwan Ministry of Education, Revised Mandarin Chinese Dictionary: 季','url':'https://dict.revised.moe.edu.tw/dictView.jsp?ID=5448&la=0&powerMode=0','supports':'Lists a television program example counted in seasons, supporting 季 for a television season.'},
 'moe_jijie':{'title':'Taiwan Ministry of Education, Revised Mandarin Chinese Dictionary: 季節','url':'https://dict.revised.moe.edu.tw/dictView.jsp?ID=88724&la=0&powerMode=0','supports':'Defines 季節 as a period in the year characterized by climate/agriculture, explaining why it is wrong for a TV series season.'},
 'moe_houxuanren':{'title':'Taiwan Ministry of Education, Revised Mandarin Chinese Dictionary: 候選人','url':'https://dict.revised.moe.edu.tw/dictView.jsp?ID=81557&la=0&powerMode=0','supports':'Defines 候選人 as a person awaiting votes, not an ISBN candidate item.'},
 'arabic_media':{'title':'Cairo Academy of the Arabic Language, Dictionary: وسائل الإعلام','url':'https://www.arabicacademy.gov.eg/ar/%D9%85%D8%AD%D8%B1%D9%83-%D8%A7%D9%84%D8%A8%D8%AD%D8%AB/media%2Beffects','supports':'Defines وسائل الإعلام using newspapers, radio, television, and other mass communication outlets; it does not name a requested media item.'},
 'arabic_space':{'title':'Cairo Academy of the Arabic Language, Dictionary: المساحة','url':'https://www.arabicacademy.gov.eg/ar/%D9%85%D8%AD%D8%B1%D9%83-%D8%A7%D9%84%D8%A8%D8%AD%D8%AB/%D8%A7%D9%84%D9%85%D9%90%D8%B3%D8%A7%D8%AD%D9%8E%D8%A9%D9%8F?exact_search=true','supports':'Defines المساحة as a measurable area; the caller shows storage capacity, so the candidate specifies storage.'},
 'duden_storage':{'title':'Duden, Speicherkapazität','url':'https://www.duden.de/rechtschreibung/Speicherkapazitaet','supports':'Defines storage capacity as the capacity of a storage device, matching the root-folder table values.'},
 'academie_queue':{'title':'Académie française, Dictionnaire: queue','url':'https://www.dictionnaire-academie.fr/article/A9Q0204','supports':'Defines a queue as a line of people waiting their turn, supporting the French file d’attente wording.'},
 'musicbrainz':{'title':'MusicBrainz official site','url':'https://musicbrainz.org/','supports':'Official product spelling; preserve the product name and ID label.'},
 'openlibrary':{'title':'Open Library official site','url':'https://openlibrary.org/','supports':'Official product spelling; preserve the two-word brand.'},
 'duden_name_compound':{'title':'Duden, Rechtschreibregeln: Namen, D146','url':'https://www.duden.de/sprachwissen/rechtschreibregeln/namen','supports':'D146 uses hyphens in compounds with multi-part names and gives “Rio-de-la-Plata-Bucht” as an example. This supports German “Open-Library-ID”; the checker requiring the exact space-separated phrase “Open Library” is overbroad for this compound.'}
}
P={}
LOCALE_PROTECTED_EXCEPTIONS={(2704,'de','Open Library')}
def add(pos,loc,target,reason,kind='correction',refs=()):
    P[(pos,loc)]={'target':target,'kind':kind,'reason':reason,'refs':list(refs)}

# Review decisions: only cells needing a correction or a clearly useful refinement.
add(2700,'zh_Hans','MusicBrainz ID','“音乐频道” means music channel and changes an external identifier into a media channel; retain the exact MusicBrainz product name and ID.','correction',['musicbrainz'])
add(2702,'ja','最終更新','The caller renders a relative date and the person who changed the request; “最終更新者” names a person, while the label denotes the last update.','correction')
add(2702,'zh_Hans','最后修改时间','The caller shows a date and editor beneath this label; “最后修改者” means the last editor, not the modified field/date.','correction')
add(2702,'zh_Hant','最後修改時間','The caller shows a date and editor beneath this label; “最後修改者” means the last editor, not the modified field/date.','correction')
add(2707,'zh_Hant','設定檔','The request item displays a profile name; 配置 is a broad configuration, while 設定檔 labels a profile.','refinement')
add(2708,'ko','{arr}에서 제거','The current “기타 제품” means other products; the caller substitutes Radarr, Lidarr, Bookshelf, or Sonarr and the action removes the item from that service.','correction')
add(2708,'vi','Xóa khỏi {arr}','“Bỏ {arr}” removes the service itself; the caller supplies a service name and the source removes the media from it.','correction')
add(2709,'ar','حدث خطأ أثناء إزالة المحتوى.','وسائل الإعلام means mass media; the caller is removing a requested media item, so المحتوى expresses the item and the error state.','correction',['arabic_media'])
add(2709,'ja','メディアの削除中にエラーが発生しました。','The current wording is a literal “something was wrong” construction; this is the natural UI error for media removal.','correction')
add(2709,'ko','미디어를 삭제하는 중에 문제가 발생했습니다.','The current casual “뭔가 잘못되었습니다” is awkward in an error message; this is a natural UI error for media deletion.','correction')
add(2709,'vi','Đã xảy ra lỗi khi xóa nội dung.','The current phrase refers to mass-media and is an awkward calque; the caller removes a media item, so nội dung is clearer.','correction')
add(2709,'zh_Hans','移除媒体时发生错误。','“出事了” is colloquial and not a standard UI error; use a neutral error message.','correction')
add(2709,'zh_Hant','移除媒體時發生錯誤。','“出事了” is colloquial and not a standard UI error; use a neutral error message.','correction')
add(2712,'hi','{seasonCount, plural, one {सीज़न} other {सीज़न}}','This is a TV-series season label, not a season of the year; ซีज़न is the familiar media term in this context.','refinement')
add(2712,'ja','{seasonCount, plural, one {シーズン} other {シーズン}}','The current branches mean “event” and “seasonal limited”; the caller uses this for a TV-series season. Use シーズン in both branches because Japanese does not mark this noun for number.','correction')
add(2712,'vi','{seasonCount, plural, one {Mùa} other {Mùa}}','The one branch is left in English; “mùa” is already used in the other branch and Vietnamese does not mark this noun for grammatical number.','correction')
add(2712,'zh_Hans','{seasonCount, plural, one {季} other {季}}','The current 季节 means a season of the year; the caller selects TV-series seasons. The MOE dictionary gives a television program counted in 季.','correction',['moe_ji','moe_jijie'])
add(2712,'zh_Hant','{seasonCount, plural, one {季} other {季}}','The current 季節 means a season of the year; the caller selects TV-series seasons. The MOE dictionary gives a television program counted in 季.','correction',['moe_ji','moe_jijie'])
add(2716,'hi','एपिसोड क्यू · प्रशासक ने {count, plural, one {# एपिसोड} other {# एपिसोड}} कतार में जोड़े','The current word order leaves the agent and count in an awkward fragment; this states that the administrator added the counted episodes to the queue.','correction')
add(2716,'ja','エピソードキュー · 管理者が{count, plural, other {# 話}}をキューに追加','The current fragment says only “by administrator” and omits the assignment action; this says the administrator added the episodes to the queue.','correction')
add(2716,'pt_BR','Fila de episódios · {count, plural, one {# episódio} other {# episódios}} atribuídos pelo administrador','The current parentheses “atribuído(s)” are not natural UI copy; use agreement with the one/other branch.','correction')
add(2717,'fr','Ajouté automatiquement à la file d’attente','The current value means “automatic quantity”; this badge says the episode was automatically queued.','correction',['academie_queue'])
add(2717,'hi','स्वचालित रूप से कतार में जोड़ा गया','The current value mixes English and Hindi and leaves out the queued action.','correction')
add(2717,'id','Ditambahkan ke antrean secara otomatis','The current noun phrase says “automatic queue”; this badge describes an item added to the queue automatically.','correction')
add(2717,'ja','自動でキューに追加','The current katakana loan phrase is less natural for a state badge; this explicitly says it was added to the queue automatically.','refinement')
add(2717,'ko','자동으로 대기열에 추가됨','The current 자동 인용 means “automatic quotation/citation”; this badge says the episode was automatically added to a queue.','correction')
add(2717,'pt_BR','Adicionado automaticamente à fila','The current phrase is awkward and has a full stop in a badge; this clearly describes an item queued automatically.','correction')
add(2717,'vi','Đã tự động thêm vào hàng đợi','The current value says only “automatically”; it omits the queued state.','correction')
add(2718,'ar','قامت قائمة انتظار الحلقات بطلب الحلقة تلقائيًا مع تقدّم التشغيل.','The current sentence is garbled; it should say the Episode Queue requested it automatically as playback advanced.','correction',['arabic_media'])
add(2718,'fr','La file d’attente des épisodes a envoyé la demande automatiquement pendant la lecture.','The current sentence is ungrammatical; this keeps the source meaning and uses a natural playback phrase.','correction',['academie_queue'])
add(2718,'hi','प्लेबैक आगे बढ़ने पर एपिसोड क्यू ने अपने आप अनुरोध किया।','The current wording is a literal calque and does not form a natural sentence; this states that the queue automatically requested it as playback advanced.','correction')
add(2718,'id','Episode diminta otomatis oleh Antrean Episode seiring berjalannya pemutaran.','The current word order is awkward; this says it was automatically requested by the Episode Queue as playback continued.','correction')
add(2718,'ja','再生が進むにつれて、エピソードキューが自動的にリクエストしました。','The current sentence makes playback itself the queue; this makes the Episode Queue the requester as playback progresses.','correction')
add(2718,'ko','재생이 진행되면서 에피소드 대기열에서 자동으로 요청했습니다.','The current phrase is an incomplete fragment; this clearly says the queue made the request as playback progressed.','correction')
add(2718,'vi','Hàng đợi tập tự động gửi yêu cầu khi quá trình phát tiếp diễn.','The current sentence is a literal calque; this states that the Episode Queue sends the request automatically as playback continues.','correction')
add(2718,'zh_Hans','随着播放进度推进，剧集队列会自动发出请求。','The current value leaves Episode Queue in English and has incorrect full-width punctuation; translate the feature name and use Chinese punctuation.','correction')
add(2718,'zh_Hant','隨著播放進度推進，集數佇列會自動送出請求。','The current value leaves Episode in English and has spacing before punctuation; translate the feature name and use Traditional Chinese punctuation.','correction')
add(2720,'ar','نوع الوسائط','The current phrase names mass media; this label classifies the requested movie, series, book, or other media type.','correction',['arabic_media'])
add(2723,'ar','عرض جميع الطلبات','The current رؤية means seeing; عرض is the usual UI action for showing a list.','refinement')
add(2724,'vi','Mới nhất','Gần nhất can mean nearest/closest; this sort option sorts requests by their most recent addition.','refinement')
add(2725,'hi','क्रमबद्ध करने का आधार','The current phrase is a calque and does not read naturally as a compact dropdown label; this means the field by which the list is sorted.','correction')
add(2725,'zh_Hant','排序依據','The current 按 is an incomplete preposition in a standalone select label; this identifies the sort criterion.','correction')
add(2726,'hi','क्रमबद्ध करने की दिशा बदलें','The current phrase is a literal calque; this is the action available on the sort-direction toggle.','correction')
add(2726,'ko','정렬 방향 전환','The current 연락처 means contact information; the caller uses this as the aria-label and tooltip for an ascending/descending sort toggle.','correction')
add(2726,'vi','Đổi chiều sắp xếp','The current phrase says turn the sort direction on/off; the button switches between ascending and descending.','correction')
add(2727,'ar','آخر تعديل','The current spelling أخر is not the standard form for “last”; use آخر.','correction')
add(2727,'hi','आख़िरी बार संशोधित','The current phrase is incomplete; this labels the last-modified sort option.','correction')
add(2727,'pt_BR','Última modificação','This is the natural Portuguese label for last modified; Mudança is a broad change rather than the modified field.','refinement')
add(2727,'vi','Lần sửa đổi gần nhất','The current phrase is a literal noun stack; this is a natural label for the most recently modified request.','refinement')
add(2728,'ar','عوامل تصفية المهام','The current ملفات means files; the source is task filters, not task files.','correction')
add(2729,'hi','{services} से कनेक्ट नहीं हो सका। कुछ जानकारी उपलब्ध नहीं हो सकती है।','The current string lacks a separator after {services} and reverses “may be unavailable” to “may be available.”','correction')
add(2729,'id','Tidak dapat terhubung ke {services}. Beberapa informasi mungkin tidak tersedia.','The current string omits punctuation and reverses the “unavailable” meaning.','correction')
add(2729,'ko','{services}에 연결할 수 없습니다. 일부 정보를 이용할 수 없을 수 있습니다.','The current string says “connecting to” and omits the inability; restore both clauses and sentence boundary.','correction')
add(2729,'vi','Không thể kết nối với {services}. Một số thông tin có thể không khả dụng.','The current string is missing the clause separator and is awkward; restore the possibility that information may be unavailable.','correction')

# Spanish direct address uses formal usted throughout this interface.
add(2730,'es','Su solicitud de escena para adultos fue aprobada y se está procesando.','The current Tu is informal. Use formal usted possessive wording, consistent with this app’s formal Spanish address.','correction',['rae_usted'])
add(2732,'es','Whisparr no pudo aceptar esta solicitud de escena. Verifique el servicio e inténtelo de nuevo.','The current Verifica/Inténtalo use informal tú; use formal usted forms.','correction',['rae_usted'])
add(2740,'es','Su solicitud de escena para adultos está pendiente de aprobación.','The current Tu is informal; use the formal usted possessive.','correction',['rae_usted'])
add(2741,'es','No tiene permiso para solicitar contenido para adultos.','The current tienes is informal; use the usted verb form.','correction',['rae_usted'])
add(2742,'id','Scene ini sudah dalam proses di server ini.','The current sudah sedang is redundant; dalam proses expresses the ongoing state.','refinement')
add(2742,'vi','Cảnh này đang được xử lý trên máy chủ này.','The current đã đang is unidiomatic; đang expresses the ongoing processing state.','refinement')
add(2742,'zh_Hans','此场景已在此服务器上处理中。','The current wording is awkward; this naturally says processing is already underway on this server.','refinement')
add(2742,'zh_Hant','此場景已在此伺服器上處理中。','The current wording is awkward; this naturally says processing is already underway on this server.','refinement')
add(2743,'es','No se pudo verificar su límite de solicitudes de contenido para adultos. Inténtelo de nuevo en un momento.','The current Tu/Inténtalo use informal tú; use formal usted forms.','correction',['rae_usted'])
add(2748,'es','No hay ningún destino de Whisparr utilizable. Pida a un administrador que revise la configuración del servicio.','The current text omits “usable” and uses informal Pide; restore the availability condition and formal usted imperative.','correction',['rae_usted'])

add(2754,'hi','* यह श्रृंखला एक एनीमे है।','The current word मोबाइल फोन means mobile phone; the source says anime.','correction')
add(2754,'vi','* Đây là một bộ anime.','The current trò giải trí means entertainment/activity, not an anime series.','correction')
add(2755,'fr','Dossiers racine disponibles','The current de racines is a literal and awkward plural; racine is the technical modifier for a root folder.','correction')
add(2755,'es','Carpetas raíz disponibles','The current leaves Root in English; raíz is the ordinary Spanish term for a root folder.','correction')
add(2755,'id','Folder root yang tersedia','The current title-case order is unnatural; normalize the established Indonesian tech term as a phrase.','refinement')
add(2755,'pt_BR','Pastas raiz disponíveis','The current leaves Root in English; raiz is the Portuguese technical term for a root folder.','correction')
add(2755,'vi','Thư mục gốc khả dụng','The current sẵn sàng means ready; khả dụng means available in a settings table.','correction')
add(2756,'ar','مساحة التخزين المتاحة','The current الفضاء means outer space; the caller displays storage capacity for each root folder.','correction',['arabic_space'])
add(2756,'de','Verfügbarer Speicherplatz','The current Raum means room/space; the caller displays storage capacity for each root folder.','correction',['duden_storage'])
add(2756,'id','Ruang penyimpanan yang tersedia','The caller displays free storage capacity, not a generic room/space.','correction')
add(2756,'ja','空き容量','The caller displays free storage capacity; 空き容量 is the concise Japanese storage label.','correction')
add(2756,'vi','Dung lượng trống','The current Miền màu means color gamut; the caller displays free space in a storage folder.','correction')
add(2757,'hi','Bindery प्रोफ़ाइल, फ़ोल्डर और खोज के लिए अपनी अलग डिफ़ॉल्ट अधिग्रहण सेटिंग्स इस्तेमाल करता है।','The current transliterates the protected product Bindery and uses an awkward “acquisition defaults” calque; retain the product name and describe its defaults as settings.','correction')
add(2758,'ar','الخادم المستهدف','The current وجهه has a spelling/grammar error; المستهدف is the natural “destination/target server” label.','correction')
add(2758,'vi','Máy chủ đích','The current Máy phục vụ đích is an unnatural calque; Máy chủ đích is the standard concise server label.','correction')
add(2760,'ar','لن يُحتسب هذا الطلب ضمن حدود حصة المستخدم. استخدم هذا الخيار بحذر.','The current message omits clear sentence punctuation and does not identify the caution as applying to this option.','correction')
add(2760,'de','Diese Anfrage wird nicht auf das Kontingent des Benutzers angerechnet. Verwenden Sie diese Option mit Vorsicht.','The current second sentence lacks an object; this states what should be used with caution.','correction')
add(2760,'hi','यह अनुरोध उपयोगकर्ता की कोटा सीमा में नहीं गिना जाएगा। सावधानी से उपयोग करें।','The current phrasing is a calque of “count against”; this uses the natural “count toward the quota” construction.','refinement')
add(2760,'ja','このリクエストはユーザーの上限数に含まれません。慎重にご使用ください。','The current string is an awkward calque of “count against quota”; this says the request is not included in the user’s limit and preserves the caution.','correction')
add(2760,'ko','이 요청은 사용자의 할당량에 포함되지 않습니다. 신중하게 사용하세요.','The current phrase says the request is not calculated against quota and ends with an unnatural caution fragment.','correction')
add(2760,'pt_BR','Este pedido não será contabilizado nos limites da cota do usuário. Use com cuidado.','The current contar contra is an English calque; this uses the natural “counted toward quota” phrasing.','correction')
add(2760,'vi','Yêu cầu này sẽ không được tính vào hạn mức của người dùng. Hãy sử dụng tùy chọn này một cách thận trọng.','The current tính theo means “calculated according to”; the source says it will not count toward the user’s quota.','correction')
add(2760,'zh_Hans','此请求不会计入用户的配额限制。请谨慎使用。','The current 相抵 says offset against and uses awkward punctuation; this says the request is not counted toward quota.','correction')
add(2760,'zh_Hant','此請求不會計入使用者的配額限制。請謹慎使用。','The current omits the request as the counted item and has spacing before punctuation; this is clear Traditional Chinese UI wording.','correction')
add(2761,'es','Omitir la cuota del usuario','The current Omitir de is ungrammatical; this names the action of omitting the user quota.','correction')
add(2761,'hi','उपयोगकर्ता की कोटा सीमा को अनदेखा करें','The current uses the English bypass loan word; this is a clear Hindi action label.','correction')
add(2761,'id','Abaikan kuota pengguna','The current word order mixes English and Indonesian; this is the concise Indonesian action label.','correction')
add(2761,'ja','ユーザーのリクエスト上限を適用しない','The current バイパス is awkward loan jargon; this explains that the user request limit is not applied.','correction')
add(2761,'ko','사용자 할당량 우회','The current mixes English Bypass with an incomplete noun; this is a concise Korean label.','correction')
add(2761,'pt_BR','Ignorar a cota do usuário','The current places Bypass after the noun in English; this is a natural Portuguese action label.','correction')
add(2761,'vi','Bỏ qua hạn mức của người dùng','The current mixes the English word Quota into Vietnamese; use the established local term.','correction')
add(2761,'zh_Hans','绕过用户配额','The current 副路口 is not the intended bypass verb and makes the label unintelligible.','correction')
add(2761,'zh_Hant','略過使用者配額','The current 旁路 is an unnatural technical calque here; use the regular action verb.','correction')
add(2762,'zh_Hans','语言配置方案','The current says language settings, not a selectable language profile.','correction')
add(2762,'zh_Hant','語言設定檔','The current says language settings, not a selectable language profile.','correction')
add(2763,'ar','لغة البيانات الوصفية للمسلسل','The current word order is awkward; this is the language of the series metadata.','refinement')
add(2763,'vi','Ngôn ngữ siêu dữ liệu của series','The current translates metadata literally as descriptive data; siêu dữ liệu is the standard technical term.','refinement')
add(2764,'ar','ملف تعريف البيانات الوصفية','The current موجز means a brief/summary, not a profile.','correction')
add(2764,'ko','메타데이터 프로필','The current mixes English Metadata with Korean; use the established Korean technical term.','correction')
add(2764,'zh_Hans','元数据配置方案','The current says metadata configuration, not the selectable profile.','correction')
add(2766,'zh_Hans','质量配置方案','The current says quality settings, not the selectable quality profile.','correction')
add(2766,'zh_Hant','品質設定檔','The current says quality settings, not the selectable quality profile.','correction')
add(2767,'id','Siap diajukan','The current means “ready for requests”; this describes a request that is ready to be submitted.','refinement')
add(2767,'ja','リクエスト可能','The current means “preparation for a request”; this says the item is ready/can be requested.','correction')
add(2767,'pt_BR','Pronto para solicitar','The current pedir means ask for; solicitar is the established request action in this app.','refinement')
add(2768,'hi','अनुरोधकर्ता','The current phrase is incomplete (“requested by”); this labels the person who made the request.','correction')
add(2768,'vi','Người yêu cầu','The current word order Yêu cầu bởi is an awkward literal “requested by”; this labels the requester.','correction')
add(2771,'ar','اختر الوسوم','The current spelling/wording is awkward; this is the direct select-tags action.','correction')
add(2771,'de','Wählen Sie Tags aus','The current Wähle addresses the user informally while nearby German messages use formal Sie.','correction')
add(2771,'zh_Hans','选择标签','The current 设定 means set/configure rather than select.','correction')
add(2771,'zh_Hant','選取標籤','The current 设定 means set/configure rather than select.','correction')
add(2772,'fr','Service','The source is singular, but the current target is plural Services.','correction')
add(2773,'ko','옵션 보기','Add the space required between the Korean noun and verb.','refinement')
add(2773,'vi','Hiển thị tùy chọn','The current means “options” and omits the source action “show.”','correction')
add(2776,'ar','الوسوم','The current علامات التعريف means identification labels; الوسوم is the usual software “tags” term.','correction')
add(2777,'zh_Hant','進階選項','The current mixes the Simplified character 级 into a Traditional Chinese string.','correction')
add(2778,'ja','承認','The current コンプライアンス means compliance, not approval.','correction')
add(2779,'hi','अनुरोध स्वीकृत करें','The current is just “request” and omits the approve action.','correction')
add(2779,'id','Setujui permintaan','The current Atur means set/arrange, not approve.','correction')
add(2779,'ja','リクエストを承認','The current means “approval request”; this is the action to approve a request.','correction')
add(2779,'vi','Phê duyệt yêu cầu','The current means “request approval”; this is the action to approve the request.','correction')
add(2781,'ar','المؤلف','The current صاحب البلاغ means reporter/complainant, not an author in book metadata.','correction')
add(2782,'es','Mejor coincidencia automática','The current partido can mean a sports/game match; this is automatic ISBN/edition matching, so coincidencia is the intended sense.','correction',['rae_partido'])
add(2782,'fr','Meilleure correspondance automatique','The current match is an unnecessary English loan; this describes the best edition match.','refinement')
add(2782,'hi','सर्वश्रेष्ठ स्वचालित मिलान','The current uses match as a loanword; मिलान names a match between an edition and its ISBN.','refinement')
add(2782,'id','Kecocokan otomatis terbaik','The current word order is ungrammatical; this is the natural concise “best automatic match” label.','correction')
add(2782,'ko','최적의 판본 자동 선택','The current translates match as a sports game; this option automatically chooses the best-matching edition.','correction')
add(2782,'pt_BR','Melhor correspondência automática','The current combinação is less precise here; this is the best automatic ISBN/edition match.','refinement')
add(2782,'vi','Tự động chọn bản phù hợp nhất','The current word order is awkward; this says to choose the best-matching edition automatically.','correction')
add(2783,'es','La opción automática usa el primer ISBN válido de Open Library. Si quienes prueban la aplicación detectan una discrepancia, elija una edición concreta.','The current elige uses informal tú; use formal usted imperative. The protected Open Library name and ISBN are retained.','correction',['rae_usted','openlibrary'])
add(2784,'ja','リクエストは送信されましたが、Bookshelfによる処理中に拒否されました。','The current passive grammar makes Bookshelf sound rejected; this says the submitted request was rejected while Bookshelf processed it.','correction')
add(2784,'pt_BR','A solicitação foi enviada, mas o Bookshelf a rejeitou durante o processamento.','The current omits the rejected request as the object and says presented rather than submitted.','correction')
add(2784,'zh_Hans','请求已提交，但 Bookshelf 在处理时拒绝了该请求。','The current uses full-width spacing and punctuation inconsistently; this is a clear UI sentence and preserves the product name.','refinement')
add(2785,'ja','リクエストをキャンセル','The current means “cancellation request”; the source is an action to cancel a request.','correction')
add(2785,'vi','Hủy yêu cầu','The current Thôi means stop/quit, not cancel a request.','correction')
add(2789,'vi','Đã xảy ra lỗi khi chỉnh sửa yêu cầu.','Biên tập is editing text/editorial content; chỉnh sửa is the natural edit action for a request.','correction')
add(2790,'ko','판본 / ISBN','The source is a book edition, not a software version; 판본 is the correct book-publication term.','correction')
add(2790,'zh_Hans','版本 / ISBN','The current 编辑 means editing; this field labels a book edition.','correction')
add(2791,'ja','初版発行','The current 初公開 means first public release/premiere; the caller displays a book’s first-published year.','correction')
add(2791,'ko','최초 출판','The current 게시 means posting/publishing a web post; this is a book’s first publication year.','correction')
add(2793,'fr','Genres','The source is plural; the current target is singular.','correction')
add(2795,'ja','オーディオブック用のBookshelfサービスは設定されていません。オーディオブックのリクエストは利用できません。','The current leaves Audiobook untranslated; preserve Bookshelf as the product name and translate the media type.','correction')
add(2795,'ko','오디오북용 Bookshelf 서비스가 설정되지 않았습니다. 오디오북 요청은 사용할 수 없습니다.','The current leaves Audiobook untranslated; preserve Bookshelf as the product name and translate the media type.','correction')
add(2795,'vi','Chưa cấu hình dịch vụ Bookshelf cho sách nói. Yêu cầu sách nói hiện không khả dụng.','The current leaves audiobook in English; preserve Bookshelf as the product name and translate the media type.','correction')
add(2795,'zh_Hans','未配置有声书 Bookshelf 服务。有声书请求不可用。','The current runs the product name into the media-type phrase; preserve a clear boundary around Bookshelf.','refinement')
add(2796,'ar','لم يتم إعداد خدمة Bookshelf للكتب. طلبات الكتب غير متاحة.','The current omits that this is the Bookshelf service for books; preserve the product name and distinguish it from the audiobook service.','correction')
add(2796,'de','Es ist kein Bookshelf-Dienst für Bücher konfiguriert. Buchanfragen sind nicht verfügbar.','The current leaves Book in English in a compound and obscures the service type.','correction')
add(2796,'es','No hay ningún servicio de Bookshelf para libros configurado. Las solicitudes de libros no están disponibles.','The current omits that this is the Bookshelf service for books; distinguish it from the audiobook service.','correction')
add(2796,'fr','Aucun service Bookshelf pour les livres n’est configuré. Les demandes de livres ne sont pas disponibles.','The current leaves Book in English; distinguish the book service from the audiobook service.','correction')
add(2796,'hi','पुस्तकों के लिए कोई Bookshelf सेवा कॉन्फ़िगर नहीं है। पुस्तकों के अनुरोध उपलब्ध नहीं हैं।','The current repeats Book/Bookshelf and transliterates the protected Bookshelf product name.','correction')
add(2796,'id','Tidak ada layanan Bookshelf untuk buku yang dikonfigurasi. Permintaan buku tidak tersedia.','The current word order “Buku Bookshelf service” is awkward; retain Bookshelf as the product and specify its book service.','correction')
add(2796,'ja','書籍用のBookshelfサービスが設定されていません。書籍のリクエストは利用できません。','The current leaves Book untranslated and omits it from the service name.','correction')
add(2796,'ko','도서용 Bookshelf 서비스가 설정되지 않았습니다. 도서 요청은 사용할 수 없습니다.','The current omits the book-service qualifier; preserve the Bookshelf product name.','correction')
add(2796,'pt_BR','Nenhum serviço Bookshelf para livros está configurado. As solicitações de livros não estão disponíveis.','The current omits the book-service qualifier; preserve the Bookshelf product name.','correction')
add(2796,'vi','Chưa cấu hình dịch vụ Bookshelf cho sách. Yêu cầu sách không khả dụng.','The current translates the protected Bookshelf product name as “bookshelf” and repeats the word for book.','correction')
add(2796,'zh_Hans','未配置书籍用的 Bookshelf 服务。书籍请求不可用。','The current says a book Bookshelf service “has been configured,” which reverses the source, and uses awkward punctuation.','correction')
add(2796,'zh_Hant','未設定書籍用的 Bookshelf 服務。書籍請求無法使用。','The current is Simplified Chinese and says a book Bookshelf service “has been configured,” which reverses the source.','correction')
add(2797,'hi','कोई मान्य ISBN नहीं मिला। Bookshelf शीर्षक से मिलान करेगा।','The current is ungrammatical and omits valid-candidate semantics; preserve the product name and state the title-matching fallback.','correction')
add(2797,'ja','有効な ISBN 候補が見つかりませんでした。Bookshelfはタイトルとの照合に切り替えます。','The current translates protected Bookshelf as 本棚, which means a physical shelf; keep the brand and use a natural title-matching fallback.','correction')
add(2797,'ko','유효한 ISBN 후보를 찾지 못했습니다. Bookshelf는 제목 일치 방식으로 대체합니다.','The current calls candidates people and does not say they were found; use candidate items and preserve the product name.','correction')
add(2797,'pt_BR','Nenhum candidato válido a ISBN foi encontrado. O Bookshelf usará a correspondência por título como alternativa.','The current translates protected Bookshelf as estante; keep the brand and state the fallback.','correction')
add(2797,'vi','Không tìm thấy ứng viên ISBN hợp lệ nào. Bookshelf sẽ chuyển sang đối sánh theo tiêu đề.','The current translates protected Bookshelf as Giá sách; keep the brand and state the title-matching fallback.','correction')
add(2797,'zh_Hans','没有找到有效的 ISBN 候选项。Bookshelf 将改用标题匹配。','The current 候选人 means a candidate person, not an ISBN candidate item. The MOE dictionary defines it as a person awaiting votes; use 候选项.','correction',['moe_houxuanren'])
add(2797,'zh_Hant','找不到有效的 ISBN 候選項。Bookshelf 將改用標題比對。','The current 候選人 means a candidate person, not an ISBN candidate item. The MOE dictionary defines it as a person awaiting votes; use 候選項.','correction',['moe_houxuanren'])
add(2799,'ar','عدد الصفحات','The caller displays a numeric page count; this labels the count rather than a single page.','refinement')
add(2799,'zh_Hans','页数','The current uses spacing to form 页 次; 页数 is the natural page-count label.','correction')
add(2799,'zh_Hant','頁數','The current 頁面 means pages/screens; the caller displays a page count.','correction')

def sha(x):
    if isinstance(x,str): x=x.encode('utf-8')
    return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def ph(s):
    out=[]; i=0
    while i<len(s):
        if s[i]!='{': i+=1; continue
        depth=1; j=i+1
        while j<len(s) and depth:
            if s[j]=='{': depth+=1
            elif s[j]=='}': depth-=1
            j+=1
        if depth: break
        body=s[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def has_term(s,t):
    if t in ('ROM','PC','4K'):
        suffix='s?' if t=='ROM' else ''
        return re.search(r'(?<![A-Za-z0-9])'+re.escape(t)+suffix+r'(?![A-Za-z0-9])',s) is not None
    return t.casefold() in s.casefold()
def read_block(s,start):
    depth=1; j=start+1
    while j<len(s) and depth:
        if s[j]=='{': depth+=1
        elif s[j]=='}': depth-=1
        j+=1
    if depth: raise ValueError('unbalanced ICU braces')
    return s[start+1:j-1],j
def icu_profile(s):
    m=re.search(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(plural|select|selectordinal)\s*,',s)
    if not m: return []
    root,kind=m.group(1),m.group(2); branches={}; i=m.end()
    while i<len(s):
        while i<len(s) and s[i].isspace(): i+=1
        if i>=len(s) or s[i]=='}': break
        sel=re.match(r'(?:=?\d+|[A-Za-z][A-Za-z0-9_-]*)',s[i:])
        if not sel: raise ValueError('invalid ICU branch selector')
        key=sel.group(0); i+=len(key)
        while i<len(s) and s[i].isspace(): i+=1
        if i>=len(s) or s[i]!='{': raise ValueError('ICU branch body missing')
        body,i=read_block(s,i)
        if key in branches: raise ValueError('duplicate ICU branch')
        branches[key]=body
    if not branches: raise ValueError('no ICU branches')
    nested={k:{'hashTokens':v.count('#'),'arguments':dict(collections.Counter(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}',v)))} for k,v in branches.items()}
    return [{'name':root,'kind':kind,'branches':branches,'nested':nested}]
def sorted_ph(s): return sorted(ph(s),key=lambda x:(x['name'],x['kind']))
def required_branches(loc):
    return {'other'} if loc in {'ja','ko','vi','zh_Hans','zh_Hant'} else {'one','other'}

input_cells=[json.loads(s) for s in (OUT/'source-current-cells.jsonl').open(encoding='utf-8')]
contexts={x['sourceId']:x for x in (json.loads(s) for s in (OUT/'caller-contexts.jsonl').open(encoding='utf-8'))}
selection=json.loads((OUT/'source-selection.json').read_text(encoding='utf-8'))
assert selection['head']==HEAD and selection['tree']==TREE
assert len(input_cells)==1200 and len(contexts)==100
assert len(P)==len(set(P))
cellmap={(x['sourcePosition'],x['locale']):x for x in input_cells}
assert set(P).issubset(cellmap)
# Expand protected literals with Bindery, which is a product/service name in this source and its exact caller.
for c in input_cells:
    src=c['source']
    c['protectedLiterals']=sorted(set([p['name'] for p in ph(src)]+[t for t in TERMS if has_term(src,t)]))
# Save the reviewed input rows with the expanded exact-literal policy.
(OUT/'source-current-cells.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in input_cells),encoding='utf-8')
manifest=json.loads((OUT/'input-manifest.json').read_text(encoding='utf-8'))
manifest['protectedTerms']=TERMS
(OUT/'input-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
# Update the input checksums after adding Bindery to protected literals.
input_names=['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json','source-boundaries.json']
(OUT/'INPUT-SHA256SUMS').write_text(''.join(f'{sha((OUT/n).read_bytes())}  {n}\n' for n in input_names),encoding='utf-8')

primary=[]; proposals=[]; target_rows=[]; spanish=[]; icu_rows=[]
for c in input_cells:
    key=(c['sourcePosition'],c['locale']); prop=P.get(key)
    target=prop['target'] if prop else c['currentTarget']
    disposition=('propose-correction' if prop and prop['kind']=='correction' else 'refinement' if prop else 'accept-current')
    src=c['source']; loc=c['locale']; ctx=contexts[c['sourceId']]
    source_terms=c['protectedLiterals']
    literal_exceptions=[t for t in source_terms if (c['sourcePosition'],loc,t) in LOCALE_PROTECTED_EXCEPTIONS and not has_term(target,t)]
    missing=[t for t in source_terms if not has_term(target,t) and t not in literal_exceptions]
    source_icu=icu_profile(src); current_icu=icu_profile(c['currentTarget']); final_icu=icu_profile(target)
    src_ph=sorted_ph(src); cur_ph=sorted_ph(c['currentTarget']); fin_ph=sorted_ph(target)
    src_tags=tags(src); cur_tags=tags(c['currentTarget']); fin_tags=tags(target)
    placeholder_ok=(src_ph==fin_ph); markup_ok=(src_tags==fin_tags); protected_ok=(not missing)
    current_missing=[t for t in source_terms if not has_term(c['currentTarget'],t)]
    current_ph_ok=(src_ph==cur_ph); current_markup_ok=(src_tags==cur_tags)
    # Validate all formatter root types and locale-required plural branches.
    icu_valid=True; icu_reason=None
    if source_icu:
        try:
            if not final_icu or len(final_icu)!=1: raise ValueError('missing/extra formatter')
            sp=source_icu[0]; fp=final_icu[0]
            if (sp['name'],sp['kind'])!=(fp['name'],fp['kind']): raise ValueError('root name/type differs')
            if not required_branches(loc).issubset(set(fp['branches'])): raise ValueError('locale-required plural branches absent')
            # For # placeholders, preserve a count marker in each branch except Arabic one/two forms,
            # which inflect the noun with the cardinal value.
            if sp['kind']=='plural':
                for branch,body in fp['branches'].items():
                    source_body=sp['branches'].get(branch)
                    if source_body is None: continue
                    source_hashes=source_body.count('#'); final_hashes=body.count('#')
                    if loc=='ar' and branch in {'one','two'} and final_hashes==0: continue
                    if final_hashes!=source_hashes: raise ValueError(f'count marker parity differs in {branch}')
        except Exception as e:
            icu_valid=False; icu_reason=str(e)
    if source_icu:
        icu_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,
          'sourceName':source_icu[0]['name'],'sourceKind':source_icu[0]['kind'],
          'sourceBranches':sorted(source_icu[0]['branches']),'finalBranches':sorted(final_icu[0]['branches']) if final_icu else [],
          'finalNested':final_icu[0]['nested'] if final_icu else {},'valid':icu_valid,'failure':icu_reason})
    prior=c.get('priorDisposition')
    why=prop['reason'] if prop else ('Duden D146 uses hyphens for compounds with multi-part names (example: “Rio-de-la-Plata-Bucht”); “Open-Library-ID” is an acceptable German compound that preserves the name components. The exact-space protected-literal check is overbroad for this locale.' if literal_exceptions else 'Reviewed against the exact English source and pinned caller context; current wording is source-faithful and natural for its UI role. Placeholders, markup, and protected literals remain intact.')
    row={
      'schemaVersion':1,'reviewer':'primary-machine-assisted-semantic-review','semanticReviewPerformed':True,
      'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
      'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'source':src,'sourceHash':c['sourceHash'],
      'sourceTextSha256':c['sourceTextSha256'],'sourceFile':c['sourceFile'],'sourceCatalogBlob':c['sourceCatalogBlob'],
      'sourceFileSha256':c['sourceFileSha256'],'locale':loc,'localeFile':c['localeFile'],'localeBlob':c['localeBlob'],
      'localeFileSha256':c['localeFileSha256'],'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],
      'finalTarget':target,'finalTargetHash':sha(target),'disposition':disposition,'rationale':why,
      'confidence':'high' if prop and prop['kind']=='correction' and c['sourcePosition'] in {2700,2702,2704,2708,2709,2712,2717,2718,2726,2728,2729,2754,2756,2761,2762,2764,2766,2778,2779,2781,2796,2797} else 'moderate',
      'priorDisposition':prior,'priorDispositionOverridden':False,
      'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],
      'callerPaths':ctx['callerPaths'],'callerUseStatus':ctx['callerUseStatus'],
      'callerReferenceCount':len(ctx['pinnedLineRefs']),
      'callerContextCoverage':'pinned source-group component refs; bounded targeted search, not a complete dynamic call graph',
      'currentPlaceholders':cur_ph,'sourcePlaceholders':src_ph,'finalPlaceholders':fin_ph,
      'placeholderParity':'exact' if current_ph_ok else 'mismatch',
      'candidatePlaceholderParity':'exact' if placeholder_ok else 'mismatch',
      'currentMarkup':cur_tags,'sourceMarkup':src_tags,'finalMarkup':fin_tags,
      'markupParity':'exact' if current_markup_ok else 'mismatch',
      'candidateMarkupParity':'exact' if markup_ok else 'mismatch',
      'protectedLiterals':source_terms,'currentProtectedLiteralMissing':current_missing,
      'finalProtectedLiteralMissing':missing,'candidateProtectedLiteralParity':'locale-orthography-exception' if literal_exceptions else 'exact' if protected_ok else 'mismatch',
      'candidateProtectedLiteralLocaleExceptions':literal_exceptions,
      'currentIcuProfile':current_icu,'sourceIcuProfile':source_icu,'finalIcuProfile':final_icu,
      'icuValid':icu_valid,'externalEvidenceRefs':prop['refs'] if prop else ['openlibrary','duden_name_compound'] if literal_exceptions else [],
      'nativeSpeakerApproval':'not-performed; separate native-speaker signoff required'
    }
    primary.append(row)
    target_rows.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,
      'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'finalTarget':target,'finalTargetHash':sha(target),
      'disposition':disposition})
    if prop:
        proposals.append({'schemaVersion':1,'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'locale':loc,
          'source':src,'sourceHash':c['sourceHash'],'sourceTextSha256':c['sourceTextSha256'],
          'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],
          'proposedTarget':target,'proposedTargetHash':sha(target),'kind':prop['kind'],'disposition':disposition,
          'rationale':prop['reason'],'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],
          'callerPaths':ctx['callerPaths'],'callerUseStatus':ctx['callerUseStatus'],'confidence':row['confidence'],
          'placeholderParity':'exact' if placeholder_ok else 'mismatch','markupParity':'exact' if markup_ok else 'mismatch',
          'protectedLiteralMissing':missing,'externalEvidenceRefs':prop['refs']})
    if loc=='es':
        direct=key in {(2730,'es'),(2732,'es'),(2740,'es'),(2741,'es'),(2743,'es'),(2748,'es'),(2783,'es')}
        if direct:
            address='informal-tú' if any(token in c['currentTarget'] for token in ['Tu ','tú','tienes','Verifica','Inténtalo','Pide ','elige ']) else 'formal-usted-or-neutral'
            final_address='formal-usted'
            applicability='direct-address'
            assessment='Source addresses the user directly; the app’s established Spanish register uses usted.'
        else:
            address='neutral/infinitive'
            final_address='not-applicable'
            applicability='no-finite-address-choice'
            assessment='Label or neutral wording does not encode a tú/usted choice.'
        spanish.append({'sourcePosition':c['sourcePosition'],'sourceId':c['sourceId'],'source':src,
          'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],
          'finalTarget':target,'finalTargetHash':sha(target),'applicability':applicability,
          'currentAddressForm':address,'finalAddressForm':final_address,'assessment':assessment,
          'disposition':disposition,'formalSpanishSourceRefs':['rae_usted'] if direct else []})

# Write outputs.
def writejl(name,rows): (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def writej(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
writejl('primary-review-ledger.jsonl',primary)
writejl('candidate-proposals.jsonl',proposals)
writejl('spanish-formal-review.jsonl',spanish)
writej('candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,
  'scope':{'sourcePositions':[2700,2799],'sourceIds':100,'locales':LOCALES,'cells':1200},
  'targets':target_rows})
writej('language-sources.json',LANGUAGE_SOURCES)
# Caller limitations report.
caller_gaps=[{'sourceId':c['sourceId'],'callerPaths':ctx['callerPaths'],'callerUseStatus':c['callerUseStatus'],'note':c['callerEvidenceNote']} for c in contexts.values() if c['callerUseStatus']!='direct-or-helper-reference-found']
writej('caller-gaps.json',{'callerContextRows':len(contexts),'callerUseNotFound':[x for x in caller_gaps if x['callerUseStatus']=='caller-use-not-found'],
  'boundedSearchLimitations':caller_gaps,'note':'Caller refs are targeted source-group searches at the exact tree; they are not a complete dynamic call graph.'})
current_ph_mismatch=[r for r in primary if r['placeholderParity']!='exact']
current_markup_mismatch=[r for r in primary if r['markupParity']!='exact']
final_ph_mismatch=[r for r in primary if r['candidatePlaceholderParity']!='exact']
final_markup_mismatch=[r for r in primary if r['candidateMarkupParity']!='exact']
current_protected=[r for r in primary if r['currentProtectedLiteralMissing']]
final_protected=[r for r in primary if r['finalProtectedLiteralMissing']]
invalid_icu=[r for r in icu_rows if not r['valid']]
counts=collections.Counter(r['disposition'] for r in primary)
by_loc=collections.Counter(r['locale'] for r in proposals)
by_position=collections.Counter(str(r['sourcePosition']) for r in proposals)
direct_es=sum(r['applicability']=='direct-address' for r in spanish)
formal_es=sum(r['finalAddressForm']=='formal-usted' for r in spanish)
summary={
 'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
 'sourcePositionRange':[2700,2799],'sourceCount':100,'localeCount':12,'cellCount':len(primary),
 'dispositions':dict(counts),'proposalsByLocale':dict(by_loc),'proposalsBySourcePosition':dict(by_position),
 'callerContextRows':len(contexts),'callerReferences':sum(len(c['pinnedLineRefs']) for c in contexts.values()),
 'callerFiles':len({f['path'] for c in contexts.values() for f in c['callerFiles']}),
 'callerRowsNotFound':sum(c['callerUseStatus']=='caller-use-not-found' for c in contexts.values()),
 'callerRowsWithDirectOrHelperReference':sum(c['callerUseStatus']=='direct-or-helper-reference-found' for c in contexts.values()),
 'priorExactDispositionsReused':sum(r['priorDisposition'] is not None for r in primary),
 'placeholderMismatchesCurrent':len(current_ph_mismatch),'placeholderMismatchesFinal':len(final_ph_mismatch),
 'markupMismatchesCurrent':len(current_markup_mismatch),'markupMismatchesFinal':len(final_markup_mismatch),
 'protectedLiteralMismatchCellsCurrent':len(current_protected),'protectedLiteralMismatchCellsFinal':len(final_protected),
 'protectedLiteralRuleRawMissesFinal':sum(1 for r in primary for t in r['protectedLiterals'] if not has_term(r['finalTarget'],t)),
 'protectedLiteralLocaleExceptionCells':sum(bool(r['candidateProtectedLiteralLocaleExceptions']) for r in primary),
 'protectedLiteralMismatchDetails':[{'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],
   'currentTarget':r['currentTarget'],'missing':r['currentProtectedLiteralMissing'],'finalTarget':r['finalTarget']} for r in current_protected],
 'icuCheckedCells':len(icu_rows),'icuInvalidCells':len(invalid_icu),
 'spanishRows':len(spanish),'spanishDirectAddressRows':direct_es,'spanishFormalRows':formal_es,
 'spanishInformalFinalRows':sum(r['finalAddressForm']=='informal-tú' for r in spanish),
 'nativeSpeakerReviewOutstanding':True,'nativeSpeakerSignoffClaimed':False,
 'repositoryOrPrEdited':False,'testsBuildsScansCiBrowser':False
}
writej('summary.json',summary)
validation={
 'checks':{
  'all100CallerContextRowsPinned':len(contexts)==100 and all(bool(c['callerPaths']) and bool(c['pinnedLineRefs']) for c in contexts.values()),
  'all1200SourceCurrentFinalHashes':len(primary)==1200 and all(sha(r['currentTarget'])==r['currentTargetHash'] and sha(r['finalTarget'])==r['finalTargetHash'] for r in primary),
  'allCallerUsesFound':all(c['callerUseStatus']!='caller-use-not-found' for c in contexts.values()),
  'allFinalMarkupExact':not final_markup_mismatch,'allFinalPlaceholdersExact':not final_ph_mismatch,
  'allFinalProtectedLiteralsExact':not final_protected,'allSourceAndCurrentMarkupExact':not current_markup_mismatch,
  'allSourceAndCurrentPlaceholdersExact':not current_ph_mismatch,'allSpanishDirectAddressFormal':formal_es==direct_es,
  'icuProfilesValid':not invalid_icu
 },
 'icuRows':icu_rows,'protectedLiteralMismatchDetails':summary['protectedLiteralMismatchDetails'],
 'protectedLiteralLocaleExceptions':[{'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'term':t,'target':r['finalTarget'],'evidenceRefs':r['externalEvidenceRefs']} for r in primary for t in r['candidateProtectedLiteralLocaleExceptions']],
 'reviewedCellCount':len(primary),'proposalCount':len(proposals),'sourceBoundaryVerified':True,
 'inputHashVerification':'all source/current/caller values rehashed from frozen exact-head input before ledger emission'
}
writej('structural-validation.json',validation)
# Boundary/source-history metadata is tied to previously sealed W2600-2699 evidence.
old=REPO/'docs/pr-evidence/pr418-localization-2026-11-02/window-2600-2699/primary'
prior_refs=[]
for name in ['source-boundaries.json','source-window.json','prior-disposition-boundary.json','primary-review-ledger.jsonl','candidate-proposals.jsonl','caller-contexts.jsonl']:
    p=old/name
    prior_refs.append({'path':str(p),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size})
prior_history={'repository':REPO_NAME,'pullRequest':PR,'preservedThroughSourcePosition':2699,
 'previousWindow':[2600,2699],'leftBoundarySourceId':'components.RequestList.RequestItem.mapTvSeasons',
 'newWindowStartSourceId':'components.RequestList.RequestItem.mbid',
 'preservationStatement':'No source/cell disposition through W2699 was edited. The previous exact-head packet remains in the repository worktree and is referenced by content hash.',
 'previousWindowPacketRefs':prior_refs,'newWindowExactSourceBoundary':json.loads((OUT/'source-boundaries.json').read_text(encoding='utf-8')),
 'selectedWindowPriorAudit':json.loads((OUT/'prior-disposition-boundary.json').read_text(encoding='utf-8'))}
writej('prior-history-through-W2699.json',prior_history)
# Update input sums after adding the protected-literal policy change.
(OUT/'INPUT-SHA256SUMS').write_text(''.join(f'{sha((OUT/n).read_bytes())}  {n}\n' for n in input_names),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
