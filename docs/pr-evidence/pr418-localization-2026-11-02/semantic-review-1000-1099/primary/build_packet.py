import hashlib, json, pathlib, re, subprocess, collections

W = pathlib.Path("/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-batch-0000-0399")
OUT = pathlib.Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-1000-1099-20261102")
HEAD = "447b806871926a7c8dea06958d19cbd7e5230006"
TREE = "92450b5d67ea7551ef1eb262c05f77053ea016a0"
REPO = "snapetech-org/seerrng"
PR = 418
BASE = "221d8e0d542802da7529cd272c928cc747677e5c"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
SRC = "src/i18n/locale/en.json"
FILES = {
    "ar": "src/i18n/locale/ar.json", "de": "src/i18n/locale/de.json",
    "es": "src/i18n/locale/es.json", "fr": "src/i18n/locale/fr.json",
    "hi": "src/i18n/locale/hi.json", "id": "src/i18n/locale/id.json",
    "ja": "src/i18n/locale/ja.json", "ko": "src/i18n/locale/ko.json",
    "pt-BR": "src/i18n/locale/pt_BR.json", "vi": "src/i18n/locale/vi.json",
    "zh-CN": "src/i18n/locale/zh_Hans.json", "zh-TW": "src/i18n/locale/zh_Hant.json",
}
LOCALES = list(FILES)

# Exact primary correction candidates. Existing Spanish root dispositions are frozen below.
C = {
"ar":{
1007:("الحد الأدنى لعدد أصوات TMDB","The current wording treats votes as a sound; this is the minimum TMDB vote count."),
1013:("تاريخ الإصدار","Use the media release-date term."),
1014:("مسلسل مستمر","The source is an ongoing/returning-series status."),
1016:("ابحث عن الأفلام","The current verb is awkward for Search Movies."),
1017:("ابحث عن المسلسلات","The current noun order is not a natural search control."),
1019:("خدمات البث","The current text means merging services, not streaming."),
1022:("{count} تصويت","Use a natural vote-count label and retain the placeholder."),
1024:("البحث عن المؤلف","The current value omits the search action."),
1029:("البحث عن الراوي","The current word means researcher, not audiobook narrator."),
1031:("سنة الإصدار","The current value omits release-year meaning."),
1033:("البحث عن الموسيقى","Use a natural search label."),
1034:("عوامل التصفية","The current value means movies, not filters."),
1041:("تعذّر حفظ تثبيت عامل تصفية الوسائط. يُرجى المحاولة مرة أخرى.","The current verb means rescue; this is a save failure for a pinned media filter."),
1042:("تثبيت {label}","The current text leaves PIN in English."),
1071:("ستظهر هنا العناصر التي تضيفها إلى قائمة المشاهدة.","Clarify the media watchlist and future display meaning."),
1073:("تعذّر تحميل قسم الكتب الصوتية هذا.","Identify the audiobook section and use a grammatical failure message."),
1079:("ابحث عن الكتب الصوتية المتاحة واطلبها عبر SeerrNG.","Use natural Arabic imperative and preserve the product name."),
1083:("تعذّر إكمال الطلب. يُرجى المحاولة مرة أخرى.","The current text starts with an erroneous conjunction."),
1085:("العنوان أو المؤلف أو الراوي","The current final term means guide, not narrator."),
1086:("تحديث الحالة","The current text means renewal status, not refresh status."),
1087:("جارٍ تحديث الحالة…","The current value is only dots."),
1088:("طلب كتاب صوتي","The current noun means an audio notebook."),
1091:("طلبات الكتب الصوتية","The current wording means auditory requests."),
1093:("جارٍ البحث…","The current value is only an ellipsis."),
1097:("استوديوهات","Correct the Arabic spelling of Studios."),
},
"de":{
1041:("Der Medienfilter konnte nicht angeheftet werden. Bitte versuchen Sie es erneut.","Clarify that saving a pinned media filter failed."),
1043:("Fixierung von {label} aufheben","Use a natural unpin action and retain the label placeholder."),
1056:("Sie können bis zu 50 Netzwerke hinzufügen.","The current sentence switches from formal Sie to informal Du."),
1078:("Wird angefordert…","Anfragen… suggests asking questions, not submitting an audiobook request."),
1088:("Hörbuch anfordern","Hörbuch is the established German audiobook term."),
},
"es":{
1021:("Valoración de TMDB","Correct the unnatural word order in the TMDB rating label."),
1043:("Desfijar {label}","Desanclar is the wrong action for an item pinned with Fijar."),
1044:("Géneros de películas","Normalize capitalization and retain the movie-genres meaning."),
1045:("Géneros de películas","Normalize capitalization and retain the movie-genres meaning."),
1047:("No se pudo añadir esa red. Verifique el ID de TMDB e inténtelo de nuevo.","Use formal usted imperatives in this new Spanish correction."),
1052:("Seleccione qué redes de televisión aparecen en la página Descubrir compartida.","Use formal usted for this instruction."),
1054:("Introduzca un ID de red de TMDB","Use formal usted for this entry instruction."),
1056:("Puede añadir hasta 50 redes.","Replace the current tú form with formal usted."),
1063:("Restablecer la lista predeterminada","Add the article for a natural reset label."),
1079:("Busque audiolibros disponibles y solicítelos a través de SeerrNG.","Use formal usted and preserve SeerrNG."),
1083:("La solicitud no se pudo completar. Inténtelo de nuevo.","Use formal usted in the retry instruction."),
1087:("Actualizando…","Use the standard UI progress term."),
1095:("No se pudo conectar con {services}. Es posible que parte de la información no esté disponible.","Improve the awkward phrase and preserve the services placeholder."),
},
"fr":{
1007:("Nombre minimal de votes TMDB","Voix means voices; the source is a TMDB vote count."),
1014:("Série en cours","Série de retour is a literal calque of the ongoing-series status."),
1017:("Recherche de séries","Correct the unnatural word order."),
1022:("{count} votes","Voix means voices, not votes."),
1041:("Impossible d’enregistrer l’épinglage du filtre média. Veuillez réessayer.","Restore the missing pinned-filter meaning."),
1042:("Épingler {label}","Use the infinitive action rather than the noun épingle."),
1043:("Désépingler {label}","Débrancher means unplug, not unpin."),
1070:("Chaînes de télévision","The caller configures television networks."),
1073:("Impossible de charger cette section de livres audio.","The current text omits the audiobook section."),
1075:("La demande de livre audio n’a pas pu aboutir.","Use a natural audiobook-request failure message."),
1078:("Demande en cours…","The current noun does not express a request in progress."),
1083:("La demande n’a pas pu aboutir. Veuillez réessayer.","Use formal retry wording and natural failure phrasing."),
1086:("Actualiser le statut","The current noun phrase does not express the Refresh status action."),
1087:("Actualisation en cours…","The current infinitive does not express progress."),
1097:("Studios","Ateliers means workshops."),
1098:("Genres de séries","The current wording means series by genres."),
1099:("Genres de séries","The current wording means series by genres."),
},
"hi":{
1014:("जारी सीरीज़","The transliteration is not a natural ongoing-series status."),
1016:("फ़िल्में खोजें","Correct the unnatural word order."),
1017:("सीरीज़ खोजें","Correct the unnatural word order."),
1033:("संगीत खोजें","The current value omits Search."),
1039:("क्रमबद्ध करें","Use a usable sort-control label."),
1041:("मीडिया फ़िल्टर पिन सहेजा नहीं जा सका। कृपया फिर से प्रयास करें।","The current verb means rescue, not save."),
1042:("{label} को पिन करें","Correct the unnatural action and placeholder order."),
1043:("{label} से पिन हटाएँ","The current unpin transliteration is unnatural."),
1071:("आपकी वॉचलिस्ट में जोड़े गए आइटम यहाँ दिखाई देंगे।","घड़ी सूची means clock list, not media watchlist."),
1072:("आपकी वॉचलिस्ट","Use the media watchlist term."),
1073:("यह ऑडियोबुक अनुभाग लोड नहीं किया जा सका।","Use a natural audiobook-section load error."),
1083:("अनुरोध पूरा नहीं किया जा सका। कृपया फिर से प्रयास करें।","Use polite retry wording consistently."),
1086:("स्थिति रीफ़्रेश करें","Use a natural status-refresh action."),
1087:("स्थिति रीफ़्रेश हो रही है…","The current word means fresh rather than refreshing."),
1088:("ऑडियोबुक का अनुरोध करें","The current value omits the request action."),
1091:("आपके ऑडियोबुक के अनुरोध","Correct the ungrammatical noun sequence."),
1095:("{services} से कनेक्ट नहीं हो पा रहा है। कुछ जानकारी उपलब्ध नहीं हो सकती है।","Add a sentence boundary after the placeholder and state the connection failure."),
},
"id":{
1007:("Jumlah minimum suara TMDB","Clarify that this is the minimum number of TMDB votes."),
1014:("Serial yang berlanjut","The current phrase suggests a returned series, not the ongoing status."),
1015:("Durasi","Waktu proses means processing time, not media runtime."),
1017:("Pencarian Serial","Correct the reversed noun relation."),
1041:("Sematan filter media tidak dapat disimpan. Silakan coba lagi.","Describe failure to save a pinned filter."),
1043:("Lepas sematan {label}","Use consistent Indonesian pin/unpin terminology."),
1052:("Pilih jaringan televisi yang akan ditampilkan di halaman Discover bersama.","Clarify the shared Discover page and TV networks."),
1063:("Pulihkan ke daftar bawaan","Avoid the unnecessary English Default in this UI action."),
1071:("Item yang ditambahkan ke daftar tontonan Anda akan muncul di sini.","Clarify that items were added to the user's watchlist."),
1072:("Daftar tontonan Anda","Use the standard media watchlist term."),
1073:("Bagian buku audio ini tidak dapat dimuat.","The current text says audio section, not audiobook section."),
1079:("Cari buku audio yang tersedia dan ajukan permintaan melalui SeerrNG.","Make the audiobook request action explicit and grammatical."),
1086:("Muat ulang status","The current noun phrase does not label the refresh action."),
1087:("Memuat ulang status…","The current text means refreshing/cooling, not updating status."),
1088:("Minta buku audio","Use a direct request action label."),
1091:("Permintaan buku audio Anda","Correct the typo and name audiobooks."),
1095:("Tidak dapat terhubung ke {services}. Beberapa informasi mungkin tidak tersedia.","Add a sentence boundary after the placeholder."),
1098:("Genre Serial","Aliran Seri means series flow, not genres."),
1099:("Genre Serial","Aliran Seri means series flow, not genres."),
},
"ja":{
1001:("{hours}+ 時間","営業時間 means business hours; this is a runtime threshold."),
1002:("制作中","製品版 means product version, not In Production."),
1014:("継続中のシリーズ","再放送 means reruns, not an ongoing series status."),
1022:("{count} 票","ツイート means tweets, not votes."),
1036:("人気度","人気カテゴリー means popularity category, not popularity."),
1042:("{label} をピン留め","Use a natural Pin action."),
1043:("{label} のピン留めを解除","アンパン is a mistranslation of unpin."),
1073:("このオーディオブックのセクションを読み込めませんでした。","Use a natural failed-load message and identify audiobooks."),
1075:("オーディオブックのリクエストを完了できませんでした。","Make the audiobook-request failure grammatical."),
1079:("利用可能なオーディオブックを検索して、SeerrNG からリクエストします。","Avoid an unnatural pronoun and preserve the brand."),
1083:("リクエストを完了できませんでした。もう一度お試しください。","Fix spacing and make the failure message natural."),
1086:("ステータスを更新","Use the natural status-refresh action."),
1087:("ステータスを更新中…","Use a natural in-progress refresh state."),
1093:("検索中…","Use the standard Japanese ellipsis for the search state."),
1097:("スタジオ","The current value means production company; the source says Studios."),
},
"ko":{
1005:("언어","The current value means Name, not Language."),
1010:("예정","The current value means option information, not Planned."),
1014:("방영 중인 시리즈","Correct the literal translation of the ongoing-series status."),
1016:("영화 검색","Use natural Korean word order."),
1017:("시리즈 검색","Use natural Korean word order."),
1022:("{count}표","Render the source vote count naturally in Korean."),
1028:("언어","The current value means Name, not Language."),
1029:("내레이터 검색","Narrator is left in English."),
1033:("음악 검색","Music is left in English."),
1034:("필터","The current value means filtering, not Filters."),
1036:("인기도","Use a noun for Popularity rather than an adjective."),
1041:("미디어 필터 고정을 저장할 수 없습니다. 다시 시도해 주세요.","Clarify that saving the media-filter pin failed."),
1042:("{label} 고정","The current value duplicates Pin."),
1071:("시청 목록에 추가한 항목이 여기에 표시됩니다.","시계 목록 means clock list, not media watchlist."),
1072:("시청 목록","Use a natural media watchlist term."),
1073:("이 오디오북 섹션을 불러오지 못했습니다.","Replace untranslated audiobook and malformed spacing."),
1075:("오디오북 요청을 완료하지 못했습니다.","Replace untranslated audiobook and malformed spacing."),
1077:("{title}이(가) 요청되었습니다.","The fragment does not clearly state that the title was requested."),
1079:("이용 가능한 오디오북을 검색하고 SeerrNG를 통해 요청하세요.","Make the audiobook request object explicit."),
1083:("요청을 완료하지 못했습니다. 다시 시도해 주세요.","Correct spacing and preserve the retry instruction."),
1085:("제목, 작가 또는 내레이터","Narrator is left in English."),
1087:("새로 고침 중…","상쾌한 means fresh/cool, not refreshing."),
1088:("오디오북 요청하기","The current value omits the Request action."),
1091:("내 오디오북 요청","The current text has untranslated English and an incorrect noun."),
1093:("검색 중…","Use the natural in-progress search form."),
1095:("{services}에 연결할 수 없습니다. 일부 정보를 이용하지 못할 수 있습니다.","The current text is an imperative; the source reports a connection failure."),
},
"pt-BR":{
1005:("Idioma","Use Idioma for the language selector."),
1014:("Séries em andamento","Replace the awkward literal translation of returning/ongoing series."),
1016:("Buscar filmes","Procure Filmes is unnatural for a UI control."),
1017:("Buscar séries","The current phrase is ungrammatical."),
1018:("Status","Use the standard UI label rather than general state."),
1019:("Serviços de streaming","The current phrase means transmission/broadcast, not streaming."),
1024:("Pesquisa de autores","Correct the awkward word order."),
1041:("Não foi possível salvar o filtro de mídia fixado. Tente novamente.","Restore the pinned-filter meaning."),
1042:("Fixar {label}","Pino is a noun; the source is the Pin action."),
1052:("Escolha quais redes de televisão aparecem na página Descobrir compartilhada.","Use natural wording for the shared Discover page."),
1071:("Os itens adicionados à sua lista para assistir aparecerão aqui.","Lista de vigilância means surveillance, not a watchlist."),
1072:("Sua lista para assistir","Use a media watchlist term."),
1079:("Pesquise audiolivros disponíveis e solicite-os pela SeerrNG.","Correct the plural imperative and retain SeerrNG."),
1087:("Atualizando…","Refrescante means refreshing/cooling, not a loading state."),
1088:("Solicitar audiolivro","Remove the trailing period and use the UI action form."),
1091:("Seus pedidos de audiolivros","Use a natural plural heading matching Your audiobook requests."),
},
"vi":{
1006:("Tính khả dụng cục bộ không thể áp dụng các bộ lọc Hãng phim, Dịch vụ phát trực tuyến hoặc Trạng thái loạt phim. Các lựa chọn đó đã bị xóa.","Translate Studio and series using Vietnamese media terms."),
1009:("Tập phim thử nghiệm","Phi công means aircraft pilot; here this is a TV pilot."),
1014:("Loạt phim đang tiếp tục phát sóng","Clarify the ongoing-series status."),
1016:("Tìm phim","Use a natural Search Movies label."),
1017:("Tìm loạt phim","Chuỗi means string/sequence, not TV series."),
1019:("Dịch vụ phát trực tuyến","Dịch vụ luồng is a literal calque."),
1021:("Đánh giá TMDB","Use natural word order for the TMDB rating."),
1022:("{count} lượt bình chọn","Bỏ chọn means deselect; source is count of votes."),
1024:("Tìm tác giả","Correct the awkward word order."),
1029:("Tìm người dẫn chuyện","Name the narrator search field."),
1031:("Năm phát hành","The current value omits Year."),
1033:("Tìm nhạc","Correct the awkward word order."),
1034:("Bộ lọc","Lọc is a verb; this is the Filters label."),
1036:("Mức độ phổ biến","Số đông means majority, not popularity."),
1041:("Không thể lưu ghim bộ lọc nội dung. Vui lòng thử lại.","The current text says media-filter device, not pinned filter."),
1043:("Bỏ ghim {label}","Bỏ ra means take off; use the paired unpin action."),
1070:("Mạng truyền hình","Clarify that the editor selects television networks."),
1073:("Không thể tải mục sách nói này.","Identify the audiobook section, not an audio section."),
1075:("Không thể hoàn tất yêu cầu sách nói.","Identify the audiobook request."),
1079:("Tìm sách nói có sẵn và gửi yêu cầu qua SeerrNG.","Sổ ghi âm means recording ledger; source is available audiobooks."),
1082:("Chưa có yêu cầu sách nói nào.","Correct the mistranslation of audiobook."),
1083:("Không thể hoàn tất yêu cầu. Vui lòng thử lại.","Use a polite retry instruction."),
1095:("Không thể kết nối với {services}. Một số thông tin có thể không khả dụng.","Add the missing sentence boundary after the placeholder."),
1098:("Thể loại loạt phim","The current value says film genres, not series genres."),
1099:("Thể loại loạt phim","The current value says film genres, not series genres."),
},
"zh-CN":{
1002:("制作中","Use the natural media status instead of a literal production calque."),
1014:("连载中","Replace the unclear literal returning-series status."),
1019:("流媒体服务","流动 means mobile, not streaming."),
1022:("{count} 票","Use a concise natural vote count."),
1036:("人气","大众性 is unnatural for a popularity field."),
1041:("无法保存已固定的媒体筛选项。请重试。","过滤夹 is a mistranslation; this is a pinned media filter."),
1042:("固定 {label}","键 means key, not pin."),
1043:("取消固定 {label}","Clarify the unpin action."),
1070:("电视网","The editor configures television networks, not streaming platforms."),
1071:("添加到观看清单的项目会显示在这里。","监视列表 means surveillance list, not media watchlist."),
1072:("您的观看清单","关注列表 means a following list, not a watchlist."),
1073:("此有声书版块无法加载。","Identify the audiobook section and remove malformed punctuation."),
1075:("有声书请求无法完成。","Use the standard audiobook term and remove malformed spacing."),
1077:("已请求 {title}。","The current wording says the title demanded something."),
1079:("搜索可用的有声书，并通过 SeerrNG 提交请求。","Correct punctuation and spacing."),
1082:("尚无有声书请求。","The current phrase is ungrammatical and uses a nonstandard audiobook term."),
1083:("请求无法完成。请重试。","Add a clear retry instruction."),
1088:("请求有声书","音频簿 is a literal mistranslation."),
1091:("您的有声书请求","Name the audiobook requests rather than generic audio requests."),
1098:("剧集类型","电视节目类型 suggests program format, not series genres."),
1099:("剧集类型","电视节目类型 suggests program format, not series genres."),
},
"zh-TW":{
1002:("製作中","Use the standard Traditional Chinese production status."),
1009:("試播集","The current value is Simplified Chinese and means aircraft pilot."),
1010:("規劃中","Use Traditional Chinese characters."),
1013:("發布日期","Use Traditional Chinese characters."),
1014:("續播影集","Correct the literal return-sequence translation."),
1015:("片長","執行時間 means execution time, not media runtime."),
1019:("串流服務","流動服務 means mobile services, not streaming."),
1022:("{count} 票","Use a concise natural vote count."),
1031:("發行年份","Use Traditional Chinese characters."),
1034:("篩選器","Use Traditional Chinese characters."),
1036:("受歡迎程度","流行性 is an awkward literal translation."),
1038:("發布日期","Use Traditional Chinese characters."),
1039:("排序方式","按 means by, not sort order."),
1040:("標題","篇 means a piece/chapter, not title."),
1041:("無法儲存媒體篩選條件的釘選設定。請再試一次。","滤波符 is a mistranslation; the source is a pinned media filter."),
1042:("釘選 {label}","平 is not the pin action."),
1043:("取消釘選 {label}","Clarify the unpin action."),
1070:("電視網","影視平台 means streaming platforms, not TV networks."),
1071:("新增至您的觀影清單的項目會顯示在這裡。","監控清單 means surveillance list, not media watchlist."),
1072:("您的觀影清單","Use a natural media watchlist term."),
1073:("無法載入此有聲書區塊。","The current phrase means audio-book region and has malformed spacing."),
1075:("有聲書請求無法完成。","Use the standard audiobook term."),
1077:("已請求 {title}。","The current wording says the title demanded something."),
1082:("尚無有聲書請求。","Use the standard audiobook term."),
1085:("標題、作者或旁白者","The current query hint omits Title."),
1086:("重新整理狀態","Use the standard Traditional Chinese status-refresh term."),
1088:("請求有聲書","Use the standard audiobook term and preserve the action."),
1091:("您的有聲書請求","音書 is not the standard audiobook term."),
1095:("無法連線到 {services}。部分資訊可能無法使用。","Use Traditional Chinese and preserve a clear sentence boundary."),
}
}

def cmd(*args): return subprocess.check_output(["git","-C",str(W),*args])
def text(*args): return cmd(*args).decode("utf-8")
def H(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode("utf-8")).hexdigest()
def blob(path): return text("rev-parse",f"{HEAD}:{path}").strip()
def raw(path): return cmd("show",f"{HEAD}:{path}")
def line_ref(path, lines, n, kind, sid, pos):
    return {"attestedHead":HEAD,"attestedTree":TREE,"fileBlob":blob(path),"fileSha256":H(raw(path)),
            "kind":kind,"line":n,"lineSha256":H(lines[n-1]),"lineText":lines[n-1],
            "matchedAtCurrentHead":True,"nextLine":lines[n] if n<len(lines) else "",
            "path":path,"previousLine":lines[n-2] if n>1 else "",
            "sourceId":sid,"sourceIdPosition":pos}
def write_jsonl(name, rows):
    (OUT/name).write_text("".join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for r in rows),encoding="utf-8")
def names(s): return sorted(re.findall(r"\{([A-Za-z0-9_]+)\}",s))
def tags(s): return re.findall(r"</?[A-Za-z][^>]*>",s)
def protected(s): return collections.Counter({x:s.count(x) for x in ("TMDB","SeerrNG","ReadMeABook") if s.count(x)})

head=text("rev-parse","HEAD").strip(); tree=text("rev-parse","HEAD^{tree}").strip()
if head!=HEAD or tree!=TREE: raise SystemExit(f"STOP exact-head mismatch: {head}/{tree}")
allowed={"build_packet.py","README.md","SHA256SUMS","manifest.json","summary.json","source-current-attestation.jsonl","selected-direct-locale-cells.jsonl","primary-review-ledger.jsonl","source-contexts.jsonl","caller-context-attestation.jsonl","preserved-prior-routing-rows.jsonl"}
if any(p.name not in allowed for p in OUT.iterdir()): raise SystemExit(f"STOP unexpected file in task output directory: {OUT}")
source_bytes=raw(SRC); source=json.loads(source_bytes); entries=list(source.items()); window=entries[1000:1100]
if len(window)!=100 or len({k for k,v in window})!=100: raise SystemExit("STOP source window is not exactly 100 unique rows")
prior_m=json.loads(pathlib.Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-0900-0999-20261102/manifest.json").read_text())
if prior_m.get("head")!="18001c2d09d5d271bd4fe2ad22189c29d069a457" or prior_m.get("sourceIdPositionRange")!=[900,999]: raise SystemExit("STOP prior W900 packet pin/range mismatch")
ids=[k for k,v in window]
if prior_m["sourceIdPositionRange"][1]>=1000: raise SystemExit("STOP windows overlap")

evidence=W/"docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649"
root_rows=[json.loads(x) for x in (evidence/"root-cross-review.jsonl").read_text().splitlines() if x.strip()]
apply_rows=[json.loads(x) for x in (evidence/"exact-hash-apply-plan.jsonl").read_text().splitlines() if x.strip()]
prior={r["id"]:r for r in root_rows if r.get("id") in ids and r.get("locale")=="es"}
apply={r["id"]:r for r in apply_rows if r.get("id") in ids and r.get("locale")=="es"}
if len(prior)!=12 or set(prior)!=set(apply): raise SystemExit(f"STOP prior route set mismatch: {len(prior)}")
if set(C["es"]) & set(prior): raise SystemExit("STOP candidate overlaps frozen Spanish rows")

catmeta={"en":{"path":SRC,"blob":blob(SRC),"bytes":len(source_bytes),"sha256":H(source_bytes),"keyCount":len(source)}}
targets={}
for loc,path in FILES.items():
    rawfile=raw(path); data=json.loads(rawfile)
    if set(data)!=set(source) or len(data)!=9494: raise SystemExit(f"STOP catalog parity mismatch: {loc}")
    targets[loc]=data
    catmeta[loc]={"path":path,"blob":blob(path),"bytes":len(rawfile),"sha256":H(rawfile),"keyCount":len(data)}

contexts=[]; caller_att=[]; refs_by_id={}
for pos,(sid,val) in enumerate(window,1000):
    ns,prop=sid.rsplit(".",1); matches=[]
    for pat in (f"defineMessages('{ns}'",f'defineMessages("{ns}"'):
        g=subprocess.run(["git","-C",str(W),"grep","-n","-F",pat,HEAD,"--","src"],capture_output=True,text=True)
        if g.stdout: matches=g.stdout.strip().splitlines(); break
    locs=[]
    for item in matches:
        bits=item.split(":",3)
        if len(bits)>=4: locs.append((bits[1],int(bits[2])))
    paths=sorted({p for p,n in locs})
    if len(paths)!=1: raise SystemExit(f"STOP unique definition missing for {sid}: {paths}")
    path=paths[0]; file=raw(path); lines=file.decode("utf-8").splitlines()
    nsline=next((n for n,line in enumerate(lines,1) if "defineMessages(" in line and ns in line),None)
    if nsline is None: raise SystemExit(f"STOP namespace declaration line missing {sid}")
    endline=next((n for n in range(nsline+1,len(lines)+1) if "});" in lines[n-1]),None)
    if endline is None: raise SystemExit(f"STOP defineMessages close missing {sid}")
    defs=[n for n in range(nsline+1,endline+1) if re.match(r"^\s*"+re.escape(prop)+r"\s*:",lines[n-1])]
    if len(defs)!=1: raise SystemExit(f"STOP property definition not unique {sid} in {path}: {defs}")
    refs=[line_ref(path,lines,defs[0],"message-definition",sid,pos)]
    uses=[n for n in range(endline+1,len(lines)+1) if re.search(r"\bmessages\."+re.escape(prop)+r"\b",lines[n-1])]
    for n in uses: refs.append(line_ref(path,lines,n,"message-use",sid,pos))
    opt=[n for n in range(endline+1,len(lines)+1) if re.search(r"label\s*:\s*['\"]"+re.escape(prop)+r"['\"]",lines[n-1])]
    dyn=[n for n in range(endline+1,len(lines)+1) if "messages[option.label]" in lines[n-1]]
    if not uses and opt and dyn:
        for n in opt[:2]: refs.append(line_ref(path,lines,n,"sort-option",sid,pos))
        for n in dyn[:1]: refs.append(line_ref(path,lines,n,"message-use-dynamic",sid,pos))
    for ref in refs:
        if ref["fileBlob"]!=blob(path) or ref["fileSha256"]!=H(file) or ref["lineSha256"]!=H(lines[ref["line"]-1]):
            raise SystemExit(f"STOP caller hash mismatch {sid}")
        caller_att.append({k:ref[k] for k in ("attestedHead","attestedTree","fileBlob","fileSha256","kind","line","lineSha256","path","sourceId","sourceIdPosition","matchedAtCurrentHead")})
    refs_by_id[sid]=refs
    contexts.append({"callers":refs,"componentPrefix":ns,"definitionLine":defs[0],"pullRequest":PR,"repository":REPO,
        "schemaVersion":1,"source":val,"sourceFile":SRC,"sourceFileBlob":catmeta["en"]["blob"],
        "sourceFileSha256":catmeta["en"]["sha256"],"sourceId":sid,"sourceIdPosition":pos,
        "sourceSha256":H(val),"usageReferenceCount":len(refs)-1,
        "usageStatus":"found" if len(refs)>1 else "definition-only-no-use-found"})

prior_rows=[]
for sid in ids:
    if sid not in prior: continue
    r=prior[sid]; a=apply[sid]; cur=targets["es"][sid]; final=r["finalTarget"]
    if cur!=final or a.get("finalTarget")!=final or r.get("decision") not in ("accept","refine"):
        raise SystemExit(f"STOP frozen Spanish cell no longer matches prior final: {sid}")
    prior_rows.append({"attestedHead":HEAD,"attestedTree":TREE,"currentTarget":cur,"currentTargetHash":H(cur),"id":sid,"locale":"es",
        "priorDisposition":r["decision"],"priorDispositionEvidence":"docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/root-cross-review.jsonl",
        "priorEvidenceReviewHead":r.get("liveAttestedHead"),"priorEvidenceReviewTree":r.get("liveAttestedTree"),
        "priorFinalTarget":final,"priorFinalTargetHash":H(final),"priorOriginalCurrentTarget":r.get("currentTargetLive"),
        "priorOriginalCurrentTargetHash":r.get("currentTargetHashLive"),"priorRootReason":r.get("reason"),
        "priorRootReviewer":r.get("reviewer"),"priorApplyAction":a.get("action"),"priorAppliedAtHead":a.get("liveHead"),
        "priorAppliedTree":a.get("liveTree"),"priorCandidatePacketSha256":r.get("candidatePacketSha256"),
        "priorRootDecisionLedgerSha256":a.get("rootDecisionLedgerSha256"),"source":source[sid],"sourceHash":H(source[sid]),
        "sourceIdPosition":1000+ids.index(sid),"sourceFileBlob":catmeta["en"]["blob"],"sourceCatalogSha256":catmeta["en"]["sha256"],
        "targetFile":FILES["es"],"targetCatalogBlob":catmeta["es"]["blob"],"targetCatalogSha256":catmeta["es"]["sha256"],
        "routingDisposition":"preserved-prior-root-disposition","priorDispositionPreserved":True,
        "spanishRegisterHandling":"preserve-applied-prior-value-without-register-normalization"})

ledger=[]; selected=[]; attest=[]; counts=collections.Counter(); byloc={x:collections.Counter() for x in LOCALES}
fail={"placeholder":0,"markup":0,"protected":0}
for pos,(sid,val) in enumerate(window,1000):
    sh=H(val)
    attest.append({"attestedHead":HEAD,"attestedTree":TREE,"schemaVersion":1,"sourceFileBlob":catmeta["en"]["blob"],"sourceHash":sh,"sourceId":sid,"sourceIdPosition":pos,"sourceMatchesCurrentHead":True})
    proof=[{"currentHead":HEAD,"fileBlob":r["fileBlob"],"fileBlobMatches":True,"line":r["line"],"lineSha256":r["lineSha256"],"path":r["path"],"contextMatches":True} for r in refs_by_id[sid]]
    for loc in LOCALES:
        current=targets[loc][sid]; ch=H(current); pair=C.get(loc,{}).get(pos); proposal=pair[0] if pair else None
        rationale=pair[1] if pair else None; frozen=loc=="es" and sid in prior
        status="preserved-prior-disposition" if frozen else ("correction-needed" if proposal is not None else "accept-current")
        reviewed=proposal if proposal is not None else current
        checks=[
            (names(current)==names(val) and names(reviewed)==names(val),"placeholder"),
            (tags(current)==tags(val) and tags(reviewed)==tags(val),"markup"),
            (protected(current)==protected(val) and protected(reviewed)==protected(val),"protected"),
        ]
        for ok,key in checks:
            if not ok: fail[key]+=1
        if not all(ok for ok,key in checks): raise SystemExit(f"STOP parity mismatch: {loc} {sid}")
        attest.append({"attestedHead":HEAD,"attestedTree":TREE,"currentTargetHash":ch,"locale":loc,"schemaVersion":1,
            "sourceFileBlob":catmeta["en"]["blob"],"sourceHash":sh,"sourceId":sid,"sourceIdPosition":pos,
            "sourceMatchesCurrentHead":True,"targetFileBlob":catmeta[loc]["blob"],"targetMatchesCurrentHead":True})
        selected.append({"locale":loc,"source":val,"sourceFileBlob":catmeta["en"]["blob"],"sourceId":sid,"sourceIdPosition":pos,
            "sourceSha256":sh,"target":current,"targetFile":FILES[loc],"targetFileBlob":catmeta[loc]["blob"],"targetSha256":ch})
        row={"attestedHead":HEAD,"attestedTree":TREE,"callerContextCurrentHeadProof":proof,
            "callerContextReferenceCount":len(proof),"callerContextReferencesReattested":True,"confidence":"moderate",
            "currentTarget":current,"currentTargetHash":ch,"decision":status,
            "decisionRationale":("Preserve the earlier independently reviewed Spanish disposition and exact applied value; do not reroute or normalize register in this window."
                if frozen else rationale or "The current value preserves the source meaning in its exact source/caller context; no material defect warrants changing it in this bounded machine review."),
            "id":sid,"locale":loc,"markupTagsCurrent":tags(current),"markupTagsProposed":tags(reviewed),"markupTagsSource":tags(val),
            "markupParity":tags(reviewed)==tags(val),"nativeSpeakerReviewRequired":True,
            "placeholderNamesCurrent":names(current),"placeholderNamesProposed":names(reviewed),"placeholderNamesSource":names(val),
            "placeholderParity":names(reviewed)==names(val),"priorDispositionPreserved":bool(frozen),
            "priorDispositionRef":"preserved-prior-routing-rows.jsonl" if frozen else None,
            "protectedLiteralsCurrent":dict(protected(current)),"protectedLiteralsProposed":dict(protected(reviewed)),
            "protectedLiteralsSource":dict(protected(val)),"protectedLiteralParity":protected(reviewed)==protected(val),
            "proposedTarget":proposal,"proposedTargetHash":H(proposal) if proposal is not None else None,
            "pullRequest":PR,"repository":REPO,"routingDisposition":"preserved-prior-root-disposition" if frozen else "new-semantic-review-required",
            "schemaVersion":1,"semanticReviewPerformed":not frozen,"source":val,"sourceCatalogBlob":catmeta["en"]["blob"],
            "sourceCatalogSha256":catmeta["en"]["sha256"],"sourceContextCoverage":"definition-and-use-found" if len(proof)>1 else "definition-found-use-not-found",
            "sourceFile":SRC,"sourceHash":sh,"sourceId":sid,"sourceIdPosition":pos,"targetCatalogBlob":catmeta[loc]["blob"],
            "targetCatalogSha256":catmeta[loc]["sha256"],"targetFile":FILES[loc],"targetPresent":True,"window":"source positions 1000–1099"}
        ledger.append(row); counts[status]+=1; byloc[loc][status]+=1
        if proposal is not None: counts["correction-proposal"]+=1; byloc[loc]["correction-proposal"]+=1
        elif not frozen: counts["new-accept-current"]+=1; byloc[loc]["new-accept-current"]+=1

caller_files=sorted({r["path"] for refs in refs_by_id.values() for r in refs})
caller_count=sum(map(len,refs_by_id.values()))
if len(contexts)!=100 or len(attest)!=1300 or len(selected)!=1200 or len(ledger)!=1200 or len(prior_rows)!=12:
    raise SystemExit("STOP evidence row count mismatch")
if any(fail.values()): raise SystemExit(f"STOP parity failure: {fail}")

manifest={"schemaVersion":1,"repository":REPO,"pullRequest":PR,"head":HEAD,"tree":TREE,"branch":BRANCH,"baseHead":BASE,
    "livePullRequest":{"state":"OPEN","isDraft":True,"mergeStateStatus":"CLEAN","headRefOid":HEAD,"headRefName":BRANCH,"baseRefOid":BASE},
    "sourceCatalog":catmeta["en"],"sourceIdPositionRange":[1000,1099],"sourceIdCount":100,
    "sourceIdWindowBoundaryIds":{"1000":ids[0],"1099":ids[-1]},
    "priorWindow":{"packet":"/mnt/disks/scratch/task-scratch/seerrng-pr418-0900-0999-20261102/manifest.json",
        "sourceIdPositionRange":[900,999],"head":prior_m["head"],"tree":prior_m["tree"],"nonOverlapping":True},
    "targetLocales":LOCALES,"targetCellCount":1200,"targetCatalogs":{x:catmeta[x] for x in LOCALES},
    "spanishRegisterLane":{"newCellRegister":"formal usted or impersonal forms for new Spanish corrections",
        "priorRoutedCells":"preserve applied values and register exactly; do not normalize the 12 frozen Spanish rows",
        "priorDispositionEvidence":"docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/root-cross-review.jsonl"},
    "callerUseGap":{"sourceId":"components.Discover.ReadMeABookSearch.disabled","sourceIdPosition":1080,"definitionPinned":True,"usageReferenceFound":False,"handling":"recorded as definition-only at the exact head"},
    "primaryReviewLedger":"primary-review-ledger.jsonl","sourceCurrentAttestation":"source-current-attestation.jsonl",
    "sourceContexts":"source-contexts.jsonl","callerContextAttestation":"caller-context-attestation.jsonl",
    "selectedDirectLocaleCells":"selected-direct-locale-cells.jsonl","preservedPriorRoutingRows":"preserved-prior-routing-rows.jsonl"}
summary={"schemaVersion":1,"repository":REPO,"pullRequest":PR,"state":"OPEN","isDraft":True,
    "task":"Primary semantic review for SeerrNG PR #418 source positions 1000–1099 across all 12 direct locales",
    "pin":{"head":HEAD,"tree":TREE,"prHeadRefName":BRANCH,"baseRefOid":BASE},
    "sourceIdPositions":{"count":100,"startInclusive":1000,"stopExclusive":1100},"sourceIds":100,"locales":LOCALES,
    "targetCells":1200,"rowsReviewed":1200,"newSemanticRows":1188,"priorDispositionRows":12,
    "decisionCounts":dict(counts),"correctionProposals":sum(r["decision"]=="correction-needed" for r in ledger),
    "newAcceptCurrent":sum(r["decision"]=="accept-current" for r in ledger),
    "priorDispositionPreserved":sum(r["decision"]=="preserved-prior-disposition" for r in ledger),
    "countsByLocale":{x:dict(byloc[x]) for x in LOCALES},"sourceRowsReattested":100,
    "sourceCurrentCellsReattested":1200,"sourceCurrentMismatches":0,"callerContextReferencesReattested":caller_count,
    "callerContextMismatches":0,"uniqueCallerFiles":len(caller_files),"uniqueCallerReferences":caller_count,
    "sourceIdsWithDefinitionOnlyNoUseFound":sum(x["usageReferenceCount"]==0 for x in contexts),
    "callerUseGap":{"sourceId":"components.Discover.ReadMeABookSearch.disabled","sourceIdPosition":1080,"definitionPinned":True,"usageReferenceFound":False},
    "placeholderParityFailures":fail["placeholder"],"markupParityFailures":fail["markup"],
    "protectedLiteralParityFailures":fail["protected"],"nativeSpeakerReviewPerformed":False,"nativeSpeakerReviewRequired":True,
    "browserReviewPerformed":False,"notes":[
        "The live PR and detached worktree both matched the requested head; tree 92450b5d67ea7551ef1eb262c05f77053ea016a0.",
        "The previous W900–999 packet covers positions 900–999 and does not overlap this 1000–1099 window.",
        "Tracked PR evidence contains 12 applied Spanish root dispositions in this window. Each exact current value equals the prior final target and is preserved.",
        "New Spanish correction candidates use formal usted or impersonal phrasing; the 12 routed values retain their prior wording and register.",
        "All source/current values, catalog hashes, source callers, placeholders, markup, and protected literals were re-attested at this head.",
        "One source key, components.Discover.ReadMeABookSearch.disabled (position 1080), has a pinned definition but no use reference in the component.",
        "Machine review only; native-speaker review remains required. Browser review was not performed.",
        "No repository/PR mutations, tests, builds, scans, CI, workflow changes, or release actions were performed."]}

(OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(OUT/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
write_jsonl("source-current-attestation.jsonl",attest)
write_jsonl("selected-direct-locale-cells.jsonl",selected)
write_jsonl("primary-review-ledger.jsonl",ledger)
write_jsonl("source-contexts.jsonl",contexts)
write_jsonl("caller-context-attestation.jsonl",caller_att)
write_jsonl("preserved-prior-routing-rows.jsonl",prior_rows)
readme=f"""# SeerrNG PR 418 primary semantic review: source positions 1000–1099

This task-scratch packet covers 100 source IDs at 0-based JSON insertion positions 1000 through 1099 and all 12 direct target locales (1,200 current catalog cells).

## Exact pins

- Live PR: OPEN, draft, CLEAN
- Branch: {BRANCH}
- Head: {HEAD}
- Tree: {TREE}
- Base: {BASE}
- Source catalog blob: {catmeta['en']['blob']}
- Source catalog SHA-256: {catmeta['en']['sha256']}
- Boundaries: {ids[0]} at 1000 through {ids[-1]} at 1099

The exact-head worktree was read from Git objects. The adjacent W900–999 packet is pinned to positions 900–999, so this window is non-overlapping.

## Review totals

One source key, components.Discover.ReadMeABookSearch.disabled at position 1080, has an exact definition reference but no use reference in the pinned component; it is recorded as definition-only.

- 100 source IDs and 1,200 source/current locale cells
- 1,188 new machine semantic reviews; 12 prior Spanish root dispositions preserved
- {summary['correctionProposals']} correction candidates; {summary['newAcceptCurrent']} accept-current cells; 12 frozen prior dispositions
- {caller_count} caller-context references re-attested across {len(caller_files)} caller files; zero mismatches
- Zero placeholder, markup, and protected-literal parity failures
- Native-speaker review was not performed and remains required. Browser review was not performed.

Per-locale counts are in summary.json. The JSONL evidence includes every source/current cell, exact hashes, caller contexts, and each exact proposal with a rationale.

## Preserved Spanish routing

Tracked PR evidence in semantic-review-600-649/root-cross-review.jsonl contains 12 prior Spanish dispositions in this source-position range. Each exact current value at this head matches its prior final target. The cells are recorded in preserved-prior-routing-rows.jsonl and are not rerouted. New Spanish corrections use formal usted or impersonal phrasing; the 12 previous values keep their reviewed wording and register.

## Files

- manifest.json: repository, PR, exact head/tree, locale hashes, and range
- summary.json: counts, parity results, review limits, and state pins
- source-current-attestation.jsonl: 100 source rows plus 1,200 current target hashes
- selected-direct-locale-cells.jsonl: all 1,200 source/current values and catalog pins
- source-contexts.jsonl: exact message definitions and caller contexts
- caller-context-attestation.jsonl: line/file hashes re-attested at the pinned head
- primary-review-ledger.jsonl: one decision and candidate/rationale per locale cell
- preserved-prior-routing-rows.jsonl: the 12 preserved Spanish root decisions
- build_packet.py: task-scoped packet generator

No repository or PR changes were made. No builds, tests, scans, CI, workflow edits, or releases were run.
"""
(OUT/"README.md").write_text(readme,encoding="utf-8")
files=sorted(x for x in OUT.iterdir() if x.is_file() and x.name!="SHA256SUMS")
(OUT/"SHA256SUMS").write_text("".join(H(x.read_bytes())+"  "+x.name+"\n" for x in files),encoding="utf-8")
print(json.dumps({"output":str(OUT),"head":HEAD,"tree":TREE,"sourceIds":100,"cells":len(selected),
    "newSemanticRows":1188,"priorDispositionRows":len(prior_rows),"correctionProposals":summary["correctionProposals"],
    "acceptCurrent":summary["newAcceptCurrent"],"callerReferences":caller_count,"callerFiles":len(caller_files),
    "placeholderFailures":fail["placeholder"],"markupFailures":fail["markup"],"protectedLiteralFailures":fail["protected"],
    "definitionOnlyRows":summary["sourceIdsWithDefinitionOnlyNoUseFound"],
    "files":[x.name for x in sorted(OUT.iterdir())]},ensure_ascii=False,indent=2))

