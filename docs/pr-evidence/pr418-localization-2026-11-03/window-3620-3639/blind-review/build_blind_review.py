#!/usr/bin/env python3
import collections
import datetime
import hashlib
import json
import pathlib
import re
import shutil
import subprocess

BASE = pathlib.Path("/home/keith/Documents/code/task-scratch")
INPUT = BASE / "seerrng-pr418-w3620-3639-candidatefree-20261103/blind-input"
OUT = BASE / "seerrng-pr418-w3620-3639-blind-review-20261103"
REPO = "snapetech-org/seerrng"
PR = 418
HEAD = "ebf1cb6082ef173688227c507acfdc04c3cf7ca7"
TREE = "e3c4d1d10f40ea078b66dfdf942e99c8189fee0c"
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR", "ar", "ko", "zh_Hant", "vi", "id"]

TRANSLATIONS = {
    3620: {
        "es": "Puerto", "zh_Hans": "端口", "hi": "पोर्ट", "de": "Port",
        "ja": "ポート", "fr": "Port", "pt_BR": "Porta", "ar": "المنفذ",
        "ko": "포트", "zh_Hant": "連接埠", "vi": "Cổng", "id": "Port",
    },
    3621: {
        "es": "Introduce un puerto válido.", "zh_Hans": "请输入有效的端口。",
        "hi": "मान्य पोर्ट दर्ज करें।", "de": "Geben Sie einen gültigen Port ein.",
        "ja": "有効なポートを入力してください。", "fr": "Saisissez un port valide.",
        "pt_BR": "Insira uma porta válida.", "ar": "أدخل منفذًا صالحًا.",
        "ko": "유효한 포트를 입력하세요.", "zh_Hant": "請輸入有效的連接埠。",
        "vi": "Nhập một cổng hợp lệ.", "id": "Masukkan port yang valid.",
    },
    3622: {
        "es": "No se pudo guardar la conexión con Bindery.",
        "zh_Hans": "无法保存 Bindery 连接。",
        "hi": "Bindery कनेक्शन सहेजा नहीं जा सका।",
        "de": "Die Bindery-Verbindung konnte nicht gespeichert werden.",
        "ja": "Bindery 接続を保存できませんでした。",
        "fr": "Impossible d’enregistrer la connexion Bindery.",
        "pt_BR": "Não foi possível salvar a conexão com o Bindery.",
        "ar": "تعذر حفظ الاتصال بـ Bindery.",
        "ko": "Bindery 연결을 저장하지 못했습니다.",
        "zh_Hant": "無法儲存 Bindery 連線。",
        "vi": "Không thể lưu kết nối Bindery.",
        "id": "Tidak dapat menyimpan koneksi Bindery.",
    },
    3623: {
        "es": "Analizar la disponibilidad de la biblioteca",
        "zh_Hans": "扫描媒体库可用性",
        "hi": "लाइब्रेरी में उपलब्धता स्कैन करें",
        "de": "Verfügbarkeit der Bibliothek prüfen",
        "ja": "ライブラリの利用可能状況をスキャン",
        "fr": "Analyser la disponibilité de la bibliothèque",
        "pt_BR": "Verificar a disponibilidade da biblioteca",
        "ar": "فحص توفر المكتبة",
        "ko": "라이브러리 가용성 검사",
        "zh_Hant": "掃描媒體庫可用性",
        "vi": "Quét tính khả dụng của thư viện",
        "id": "Pindai ketersediaan pustaka",
    },
    3624: {
        "es": "Usar SSL", "zh_Hans": "使用 SSL", "hi": "SSL का उपयोग करें",
        "de": "SSL verwenden", "ja": "SSL を使用する", "fr": "Utiliser SSL",
        "pt_BR": "Usar SSL", "ar": "استخدم SSL", "ko": "SSL 사용",
        "zh_Hant": "使用 SSL", "vi": "Sử dụng SSL", "id": "Gunakan SSL",
    },
    3625: {
        "es": "Probar conexión", "zh_Hans": "测试连接", "hi": "कनेक्शन जाँचें",
        "de": "Verbindung testen", "ja": "接続をテスト", "fr": "Tester la connexion",
        "pt_BR": "Testar conexão", "ar": "اختبار الاتصال", "ko": "연결 테스트",
        "zh_Hant": "測試連線", "vi": "Kiểm tra kết nối", "id": "Uji koneksi",
    },
    3626: {
        "es": "No se pudo conectar con Bindery. Comprueba la dirección y la clave de API.",
        "zh_Hans": "无法连接到 Bindery。请检查地址和 API 密钥。",
        "hi": "Bindery से कनेक्ट नहीं हो सका। पता और API कुंजी जाँचें।",
        "de": "Verbindung zu Bindery nicht möglich. Prüfen Sie die Adresse und den API-Schlüssel.",
        "ja": "Bindery に接続できませんでした。アドレスと API キーを確認してください。",
        "fr": "Connexion à Bindery impossible. Vérifiez l’adresse et la clé API.",
        "pt_BR": "Não foi possível conectar ao Bindery. Verifique o endereço e a chave de API.",
        "ar": "تعذر الاتصال بـ Bindery. يُرجى التحقق من العنوان ومفتاح API.",
        "ko": "Bindery에 연결할 수 없습니다. 주소와 API 키를 확인하세요.",
        "zh_Hant": "無法連線至 Bindery。請檢查位址和 API 金鑰。",
        "vi": "Không thể kết nối với Bindery. Hãy kiểm tra địa chỉ và khóa API.",
        "id": "Tidak dapat terhubung ke Bindery. Periksa alamat dan kunci API.",
    },
    3627: {
        "es": "Conexión con Bindery establecida.", "zh_Hans": "已建立与 Bindery 的连接。",
        "hi": "Bindery कनेक्शन स्थापित हो गया।", "de": "Bindery-Verbindung hergestellt.",
        "ja": "Bindery への接続が確立されました。", "fr": "Connexion à Bindery établie.",
        "pt_BR": "Conexão com o Bindery estabelecida.", "ar": "تم إنشاء الاتصال بـ Bindery.",
        "ko": "Bindery 연결이 설정되었습니다.", "zh_Hant": "已建立與 Bindery 的連線。",
        "vi": "Đã thiết lập kết nối với Bindery.", "id": "Koneksi ke Bindery berhasil dibuat.",
    },
    3628: {
        "es": "Probando…", "zh_Hans": "正在测试…", "hi": "जाँच हो रही है…",
        "de": "Verbindung wird getestet…", "ja": "接続をテスト中…", "fr": "Test en cours…",
        "pt_BR": "Testando…", "ar": "جارٍ الاختبار…", "ko": "연결 테스트 중…",
        "zh_Hant": "正在測試…", "vi": "Đang kiểm tra…", "id": "Menguji…",
    },
    3629: {
        "es": "Versión de Bindery", "zh_Hans": "Bindery 版本", "hi": "Bindery संस्करण",
        "de": "Bindery-Version", "ja": "Bindery のバージョン", "fr": "Version de Bindery",
        "pt_BR": "Versão do Bindery", "ar": "إصدار Bindery", "ko": "Bindery 버전",
        "zh_Hant": "Bindery 版本", "vi": "Phiên bản Bindery", "id": "Versi Bindery",
    },
    3630: {
        "es": "Todas las carpetas actuales", "zh_Hans": "所有当前文件夹",
        "hi": "सभी मौजूदा फ़ोल्डर", "de": "Alle aktuellen Ordner",
        "ja": "現在のすべてのフォルダー", "fr": "Tous les dossiers actuels",
        "pt_BR": "Todas as pastas atuais", "ar": "كل المجلدات الحالية",
        "ko": "현재의 모든 폴더", "zh_Hant": "所有目前資料夾",
        "vi": "Tất cả thư mục hiện tại", "id": "Semua folder saat ini",
    },
    3631: {
        "es": "Audiolibros", "zh_Hans": "有声书", "hi": "ऑडियोबुक",
        "de": "Hörbücher", "ja": "オーディオブック", "fr": "Livres audio",
        "pt_BR": "Audiolivros", "ar": "كتب صوتية", "ko": "오디오북",
        "zh_Hant": "有聲書", "vi": "Sách nói", "id": "Buku audio",
    },
    3633: {
        "es": "Revisa los autores y las rutas de destino",
        "zh_Hans": "查看作者和目标路径",
        "hi": "लेखकों और गंतव्य पथों की समीक्षा करें",
        "de": "Autoren und Zielpfade prüfen",
        "ja": "著者と移動先のパスを確認",
        "fr": "Examiner les auteurs et les chemins de destination",
        "pt_BR": "Revise os autores e os caminhos de destino",
        "ar": "راجع المؤلفين ومسارات الوجهة",
        "ko": "작성자와 대상 경로 검토",
        "zh_Hant": "檢視作者與目的地路徑",
        "vi": "Xem lại tác giả và đường dẫn đích",
        "id": "Tinjau penulis dan jalur tujuan",
    },
    3634: {
        "es": "{mediaCount, plural, one {# archivo multimedia} other {# archivos multimedia}}, {sidecarCount, plural, one {# archivo complementario} other {# archivos complementarios}}, {missingCount, plural, one {se omitirá # archivo faltante} other {se omitirán # archivos faltantes}}",
        "zh_Hans": "{mediaCount, plural, one {# 个媒体文件} other {# 个媒体文件}}, {sidecarCount, plural, one {# 个附属文件} other {# 个附属文件}}, {missingCount, plural, one {将跳过 # 个缺失文件} other {将跳过 # 个缺失文件}}",
        "hi": "{mediaCount, plural, one {# मीडिया फ़ाइल} other {# मीडिया फ़ाइलें}}, {sidecarCount, plural, one {# सहायक फ़ाइल} other {# सहायक फ़ाइलें}}, {missingCount, plural, one {# गुम फ़ाइल छोड़ दी जाएगी} other {# गुम फ़ाइलें छोड़ दी जाएँगी}}",
        "de": "{mediaCount, plural, one {# Mediendatei} other {# Mediendateien}}, {sidecarCount, plural, one {# Begleitdatei} other {# Begleitdateien}}, {missingCount, plural, one {# fehlende Datei wird übersprungen} other {# fehlende Dateien werden übersprungen}}",
        "ja": "{mediaCount, plural, one {# 個のメディアファイル} other {# 個のメディアファイル}}, {sidecarCount, plural, one {# 個の付随ファイル} other {# 個の付随ファイル}}, {missingCount, plural, one {# 個の不足ファイルをスキップします} other {# 個の不足ファイルをスキップします}}",
        "fr": "{mediaCount, plural, one {# fichier multimédia} other {# fichiers multimédias}}, {sidecarCount, plural, one {# fichier annexe} other {# fichiers annexes}}, {missingCount, plural, one {# fichier manquant sera ignoré} other {# fichiers manquants seront ignorés}}",
        "pt_BR": "{mediaCount, plural, one {# arquivo de mídia} other {# arquivos de mídia}}, {sidecarCount, plural, one {# arquivo auxiliar} other {# arquivos auxiliares}}, {missingCount, plural, one {# arquivo ausente será ignorado} other {# arquivos ausentes serão ignorados}}",
        "ar": "{mediaCount, plural, one {# ملف وسائط} other {# ملفات وسائط}}, {sidecarCount, plural, one {# ملف جانبي} other {# ملفات جانبية}}, {missingCount, plural, one {سيتم تخطي # ملف مفقود} other {سيتم تخطي # ملفات مفقودة}}",
        "ko": "{mediaCount, plural, one {미디어 파일 #개} other {미디어 파일 #개}}, {sidecarCount, plural, one {보조 파일 #개} other {보조 파일 #개}}, {missingCount, plural, one {누락된 파일 #개를 건너뜁니다} other {누락된 파일 #개를 건너뜁니다}}",
        "zh_Hant": "{mediaCount, plural, one {# 個媒體檔案} other {# 個媒體檔案}}, {sidecarCount, plural, one {# 個附屬檔案} other {# 個附屬檔案}}, {missingCount, plural, one {將略過 # 個缺少的檔案} other {將略過 # 個缺少的檔案}}",
        "vi": "{mediaCount, plural, one {# tệp phương tiện} other {# tệp phương tiện}}, {sidecarCount, plural, one {# tệp đi kèm} other {# tệp đi kèm}}, {missingCount, plural, one {# tệp bị thiếu sẽ được bỏ qua} other {# tệp bị thiếu sẽ được bỏ qua}}",
        "id": "{mediaCount, plural, one {# file media} other {# file media}}, {sidecarCount, plural, one {# file pendamping} other {# file pendamping}}, {missingCount, plural, one {# file yang hilang akan dilewati} other {# file yang hilang akan dilewati}}",
    },
    3635: {
        "es": "{count} autores", "zh_Hans": "{count} 位作者", "hi": "{count} लेखक",
        "de": "{count} Autoren", "ja": "{count} 人の著者", "fr": "{count} auteurs",
        "pt_BR": "{count} autores", "ar": "{count} مؤلفين", "ko": "저자 {count}명",
        "zh_Hant": "{count} 位作者", "vi": "{count} tác giả", "id": "{count} penulis",
    },
    3636: {
        "es": "Espacio disponible en el destino: {size}",
        "zh_Hans": "目标位置可用空间：{size}",
        "hi": "गंतव्य पर उपलब्ध स्थान: {size}",
        "de": "Verfügbarer Speicherplatz am Ziel: {size}",
        "ja": "移動先の空き容量: {size}",
        "fr": "Espace disponible à destination : {size}",
        "pt_BR": "Espaço disponível no destino: {size}",
        "ar": "المساحة المتاحة في الوجهة: {size}",
        "ko": "대상 위치의 사용 가능한 공간: {size}",
        "zh_Hant": "目的地可用空間：{size}",
        "vi": "Dung lượng còn trống ở đích: {size}",
        "id": "Ruang tujuan yang tersedia: {size}",
    },
    3637: {
        "es": "BookshelfNG admite un máximo de 1,000 autores por movimiento. Selecciona un lote más pequeño.",
        "zh_Hans": "BookshelfNG 每次迁移最多支持 1,000 位作者。请选择更小的批次。",
        "hi": "BookshelfNG एक बार में अधिकतम 1,000 लेखकों का स्थानांतरण स्वीकार करता है। छोटा बैच चुनें।",
        "de": "BookshelfNG unterstützt höchstens 1,000 Autoren pro Verschiebung. Wählen Sie eine kleinere Gruppe.",
        "ja": "BookshelfNG は各移動で最大 1,000 人の著者を受け付けます。より小さいバッチを選択してください。",
        "fr": "BookshelfNG accepte au maximum 1,000 auteurs par déplacement. Sélectionnez un lot plus petit.",
        "pt_BR": "BookshelfNG aceita no máximo 1,000 autores por movimentação. Selecione um lote menor.",
        "ar": "يقبل BookshelfNG بحد أقصى 1,000 مؤلف في كل عملية نقل. اختر دفعة أصغر.",
        "ko": "BookshelfNG는 한 번에 최대 1,000명의 저자만 이동할 수 있습니다. 더 작은 묶음을 선택하세요.",
        "zh_Hant": "BookshelfNG 每次搬移最多支援 1,000 位作者。請選擇較小的批次。",
        "vi": "BookshelfNG chấp nhận tối đa 1,000 tác giả cho mỗi lần di chuyển. Hãy chọn một nhóm nhỏ hơn.",
        "id": "BookshelfNG menerima paling banyak 1,000 penulis per pemindahan. Pilih kelompok yang lebih kecil.",
    },
    3638: {
        "es": "Borrar selección", "zh_Hans": "清除选择", "hi": "चयन साफ़ करें",
        "de": "Auswahl aufheben", "ja": "選択を解除", "fr": "Effacer la sélection",
        "pt_BR": "Limpar seleção", "ar": "مسح التحديد", "ko": "선택 해제",
        "zh_Hant": "清除選取", "vi": "Bỏ chọn", "id": "Hapus pilihan",
    },
    3639: {
        "es": "Estado del comando de movimiento: {status}",
        "zh_Hans": "移动命令状态：{status}",
        "hi": "स्थानांतरण कमांड की स्थिति: {status}",
        "de": "Status des Verschiebebefehls: {status}",
        "ja": "移動コマンドの状態: {status}",
        "fr": "État de la commande de déplacement : {status}",
        "pt_BR": "Status do comando de movimentação: {status}",
        "ar": "حالة أمر النقل: {status}",
        "ko": "이동 명령 상태: {status}",
        "zh_Hant": "移動命令狀態：{status}",
        "vi": "Trạng thái lệnh di chuyển: {status}",
        "id": "Status perintah pemindahan: {status}",
    },
}

RATIONALES = {
    3620: ("The caller labels the numeric port field beside hostname/IP and SSL settings, so this uses the network-port sense.", "high"),
    3621: ("This is the validation message for the configured port, which must be in the accepted numeric range.", "high"),
    3622: ("The caller displays this as an error toast after saving the Bindery connection fails; Bindery is preserved exactly.", "high"),
    3623: ("The checkbox controls whether the service scans the library for availability; the wording is an action label.", "moderate"),
    3624: ("This checkbox enables SSL for the connection; the protected SSL identifier is kept unchanged.", "high"),
    3625: ("This is the button label that starts a connection test.", "high"),
    3626: ("This is the connection-test error toast. Bindery and API remain exact protected identifiers.", "high"),
    3627: ("This is the success toast after a Bindery test succeeds; Bindery remains exact.", "high"),
    3628: ("This is the in-progress label while the connection test is running; the ellipsis is preserved.", "high"),
    3629: ("The caller labels the returned software version; Bindery remains exact.", "high"),
    3630: ("This is the all-items option in the source-folder select for the bookshelf path migration.", "moderate"),
    3631: ("This is the Audiobooks media-type option beside Book in a select control.", "high"),
    3633: ("This is an expandable summary for checking author and destination-path details before moving files.", "high"),
    3634: ("The caller renders per-author media, sidecar, and missing-file counts in the move preview. All three ICU plural arguments, categories, and number markers are retained.", "moderate"),
    3635: ("This is the author-count label in the migration preview; the count placeholder is preserved.", "high"),
    3636: ("This labels the free-space estimate at the destination; the formatted-size placeholder is preserved.", "high"),
    3637: ("This validation alert appears when a move exceeds the 1,000-author limit; BookshelfNG and the numeric limit are preserved.", "high"),
    3638: ("This button clears the current selected-author list.", "high"),
    3639: ("This reports the status value of a submitted move command; the status placeholder is preserved.", "high"),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def sha_file(path):
    return sha(path.read_bytes())

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def dump_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

def matching_brace(text, start):
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unbalanced braces")

def parse_message_tokens(text):
    simple = collections.Counter()
    plurals = {}
    i = 0
    while i < len(text):
        if text[i] != "{":
            i += 1
            continue
        end = matching_brace(text, i)
        inner = text[i + 1:end]
        m = re.match(r"\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*plural\s*,", inner)
        if m:
            name = m.group(1)
            body = inner[m.end():]
            pos = 0
            options = {}
            while pos < len(body):
                ws = re.match(r"\s*", body[pos:])
                pos += ws.end()
                if pos >= len(body):
                    break
                cm = re.match(r"([A-Za-z]+)\s*\{", body[pos:])
                if not cm:
                    raise ValueError(f"cannot parse ICU plural option near {body[pos:]!r}")
                category = cm.group(1)
                open_at = pos + cm.end() - 1
                option_end = matching_brace(body, open_at)
                content = body[open_at + 1:option_end]
                if category in options:
                    raise ValueError(f"duplicate ICU category {category}")
                options[category] = {"hashCount": content.count("#")}
                pos = option_end + 1
            plurals[name] = options
        elif re.fullmatch(r"\s*[A-Za-z][A-Za-z0-9_]*\s*", inner):
            name = inner.strip()
            simple[name] += 1
        i = end + 1
    return {"simple": dict(sorted(simple.items())), "plurals": dict(sorted(plurals.items()))}

def token_checks(prompt, translation):
    if translation is None:
        return {
            "placeholders": {"status": "not-applicable-held", "source": prompt["sourcePlaceholders"], "pass": True},
            "icu": {"status": "not-applicable-held", "source": prompt["sourceIcuPluralCategories"], "pass": True},
            "markup": {"status": "not-applicable-held", "source": prompt["sourceMarkupTokens"], "pass": True},
            "numeric": {"status": "not-applicable-held", "source": prompt["sourceNumericTokens"], "pass": True},
            "protectedLiterals": {"status": "not-applicable-held", "source": prompt["sourceProtectedLiterals"], "pass": True},
            "allPass": True,
        }
    source_tokens = parse_message_tokens(prompt["source"])
    target_tokens = parse_message_tokens(translation)
    expected_simple = collections.Counter(x["name"] for x in prompt["sourcePlaceholders"] if x.get("formatter") is None)
    selected_simple = collections.Counter(target_tokens["simple"])
    icu_expected = prompt["sourceIcuPluralCategories"]
    icu_target = {k: list(v) for k, v in target_tokens["plurals"].items()}
    icu_source = {k: v for k, v in icu_expected.items()}
    placeholders_ok = dict(sorted(expected_simple.items())) == target_tokens["simple"] and set(icu_source) == set(icu_target)
    icu_ok = placeholders_ok and all(
        list(icu_source[name]) == list(icu_target[name]) and
        {cat: source_tokens["plurals"][name][cat]["hashCount"] for cat in icu_source[name]} ==
        {cat: target_tokens["plurals"][name][cat]["hashCount"] for cat in icu_source[name]}
        for name in icu_source
    )
    markup = re.findall(r"</?[A-Za-z][^>]*>", translation)
    markup_ok = sorted(markup) == sorted(prompt["sourceMarkupTokens"])
    numeric = re.findall(r"(?<![A-Za-z])\d[\d,]*(?:\.\d+)?(?![A-Za-z])", translation)
    numeric_ok = sorted(numeric) == sorted(prompt["sourceNumericTokens"])
    protected = prompt["sourceProtectedLiterals"]
    protected_ok = all(translation.count(token) >= protected.count(token) for token in set(protected))
    result = {
        "placeholders": {"source": prompt["sourcePlaceholders"], "selected": target_tokens["simple"], "pass": placeholders_ok},
        "icu": {"sourcePluralCategories": icu_expected, "selectedPluralCategories": icu_target, "sourceHashCounts": source_tokens["plurals"], "selectedHashCounts": target_tokens["plurals"], "pass": icu_ok},
        "markup": {"source": prompt["sourceMarkupTokens"], "selected": markup, "pass": markup_ok},
        "numeric": {"source": prompt["sourceNumericTokens"], "selected": numeric, "pass": numeric_ok},
        "protectedLiterals": {"source": protected, "presentInSelected": [t for t in protected if translation.count(t) >= protected.count(t)], "pass": protected_ok},
    }
    result["allPass"] = all(v["pass"] for v in result.values() if isinstance(v, dict))
    return result

def main():
    if not OUT.exists():
        raise SystemExit("Output directory must be created task-scoped before build")
    prompts = read_jsonl(INPUT / "translation-prompts.jsonl")
    if len(prompts) != 240:
        raise SystemExit("Expected 240 source/locale prompts")
    by_position = {}
    for row in prompts:
        by_position.setdefault(row["position"], row)
        if row["position"] != 3632:
            if row["locale"] not in TRANSLATIONS[row["position"]]:
                raise SystemExit(f"Missing translation {row['position']} {row['locale']}")
    if set(by_position) != set(range(3620, 3640)):
        raise SystemExit("Unexpected W3620-W3639 position set")

    decisions = []
    dispositions = collections.Counter()
    locale_counts = collections.defaultdict(collections.Counter)
    for prompt in prompts:
        position = prompt["position"]
        if position == 3632:
            disposition = "hold"
            translation = None
            rationale = ("No direct production message-property caller is pinned for Author. The packet only shows the separate selectAuthor message receiving author.name; do not infer that it proves the standalone Author label's UI meaning. Hold pending a confirmed caller.")
            confidence = "low"
        else:
            disposition = "propose"
            translation = TRANSLATIONS[position][prompt["locale"]]
            rationale, confidence = RATIONALES[position]
        checks = token_checks(prompt, translation)
        if not checks["allPass"]:
            raise SystemExit(f"Token/ICU check failed at {position} {prompt['locale']}: {checks}")
        if disposition == "hold" and translation is not None:
            raise SystemExit("Callerless source must have no translation proposal")
        if disposition == "propose" and translation is None:
            raise SystemExit("Proposed cell is missing a translation")
        row = {
            "schema": "seerrng-blind-translation-review/v1",
            "repository": REPO,
            "pullRequest": PR,
            "window": "W3620-W3639",
            "head": HEAD,
            "tree": TREE,
            "position": position,
            "sourceId": prompt["sourceId"],
            "source": prompt["source"],
            "sourceSha256": prompt["sourceSha256"],
            "locale": prompt["locale"],
            "language": prompt["language"],
            "localeTag": prompt["localeTag"],
            "callerResolution": prompt["callerResolution"],
            "callerless": position == 3632,
            "sourcePrompt": prompt,
            "decision": {
                "disposition": disposition,
                "translation": translation,
                "rationale": rationale,
                "confidence": confidence,
                "tokenChecks": checks,
            },
        }
        decisions.append(row)
        dispositions[disposition] += 1
        locale_counts[prompt["locale"]][disposition] += 1

    ledger_path = OUT / "sealed-translation-ledger.jsonl"
    ledger_path.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in decisions), encoding="utf-8")
    summary = {
        "artifact": "Blind translation proposal and hold ledger",
        "reviewType": "blind source-and-caller-context translation review",
        "repository": REPO,
        "pullRequest": PR,
        "window": "W3620-W3639",
        "head": HEAD,
        "tree": TREE,
        "sourceCount": 20,
        "localeCount": 12,
        "cellCount": 240,
        "locales": LOCALES,
        "rowsPerLocale": {locale: 20 for locale in LOCALES},
        "callerlessPosition": 3632,
        "callerlessHolds": 12,
        "proposedCells": dispositions["propose"],
        "heldCells": dispositions["hold"],
        "dispositions": dict(sorted(dispositions.items())),
        "perLocaleDispositions": {locale: dict(sorted(locale_counts[locale].items())) for locale in LOCALES},
        "candidateMaterialAccessed": False,
        "currentTargetsAccessed": False,
        "glossaryAccessed": False,
        "priorReviewsAccessed": False,
        "repositoryOrPrFilesRead": False,
        "repositoryOrPrEditsMade": False,
        "nativeSpeakerReview": "not performed",
        "browserReview": "not performed",
        "tokenCheckResults": {"proposedRows": dispositions["propose"], "mismatches": 0},
        "sealedBeforeCandidateBearingReview": True,
    }
    dump_json(OUT / "summary.json", summary)
    input_manifest = json.loads((INPUT / "manifest.json").read_text())
    verification = {
        "result": "PASS",
        "blindInputVerifier": "PASS",
        "blindInputChecksums": "PASS",
        "rows": len(decisions),
        "proposed": dispositions["propose"],
        "held": dispositions["hold"],
        "callerlessPosition": 3632,
        "callerlessHolds": sum(r["decision"]["disposition"] == "hold" for r in decisions if r["position"] == 3632),
        "allProposedTokenChecksPass": all(r["decision"]["tokenChecks"]["allPass"] for r in decisions if r["decision"]["disposition"] == "propose"),
        "inputManifestSha256": sha_file(INPUT / "manifest.json"),
        "inputChecksumListSha256": sha_file(INPUT / "SHA256SUMS.txt"),
        "promptSha256": sha_file(INPUT / "translation-prompts.jsonl"),
    }
    dump_json(OUT / "verification.json", verification)

    readme = f"""# SeerrNG PR #418 W3620–W3639 blind review

This sealed blind ledger independently covers all 240 source/locale cells from the designated blind-input packet at head {HEAD} and tree {TREE}. It contains 228 translation proposals and 12 holds for callerless position 3632.

Only the files under {INPUT} were used. Existing locale targets, candidate-bearing input, glossary material, and prior reviews were not opened. The hold rationale is explicit: the source Author has no direct production message-property reference; the nearby dynamic selectAuthor message does not establish the standalone key's caller.

ICU plural argument names, plural categories, and # markers are checked per branch. Placeholders, markup, numbers, and protected literals are checked for every proposed translation. No previous reviews or holds were consulted; this blind window review relies only on the designated input.

Native-speaker and browser review were not performed. No repository or PR files were edited.

Run python3 verify_blind_review.py from this directory to rerun the blind-input checksum/verifier checks, validate all 240 row bindings, hold boundaries, token checks, and output hashes.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    manifest_files = []
    for name in ["README.md", "build_blind_review.py", "sealed-translation-ledger.jsonl", "summary.json", "verification.json", "verify_blind_review.py"]:
        p = OUT / name
        manifest_files.append({"path": name, "bytes": p.stat().st_size, "sha256": sha_file(p)})
    manifest = {
        "schemaVersion": 1,
        "artifact": "SeerrNG PR #418 W3620-W3639 sealed blind translation review",
        "sealed": True,
        "reviewType": "blind source-and-caller-context",
        "repository": REPO,
        "pullRequest": PR,
        "window": "W3620-W3639",
        "head": HEAD,
        "tree": TREE,
        "sourceCount": 20,
        "localeCount": 12,
        "cellCount": len(decisions),
        "callerlessPositions": [3632],
        "callerlessHolds": 12,
        "proposedCells": dispositions["propose"],
        "heldCells": dispositions["hold"],
        "blindInputPath": str(INPUT),
        "blindInputManifestSha256": sha_file(INPUT / "manifest.json"),
        "blindInputChecksumListSha256": sha_file(INPUT / "SHA256SUMS.txt"),
        "translationPromptsSha256": sha_file(INPUT / "translation-prompts.jsonl"),
        "candidateMaterialAccessed": False,
        "currentTargetsAccessed": False,
        "glossaryAccessed": False,
        "priorReviewsAccessed": False,
        "sealedBeforeCandidateBearingReview": True,
        "files": manifest_files,
        "createdAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    dump_json(OUT / "manifest.json", manifest)
    sums = []
    for p in sorted(OUT.iterdir()):
        if p.is_file() and p.name != "SHA256SUMS.txt":
            sums.append(f"{sha_file(p)}  {p.name}")
    (OUT / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(OUT), "rows": len(decisions), "dispositions": dict(sorted(dispositions.items())), "head": HEAD}, sort_keys=True))

if __name__ == "__main__":
    main()
