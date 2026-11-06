import json, hashlib, re, subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

S=Path("/home/keith/Documents/code/task-scratch")
I=S/"seerrng-pr418-w3660-3679-primary-20261103"/"candidate-free-input"
O=S/"seerrng-pr418-w3660-3679-blind-20261103"
HEAD="eb279fc80be656f379cd893642bf741ba0a24d85"
TREE="85a73172719b38e99a4e74c0ef9a303164cb4fcb"
REPO="snapetech-org/seerrng"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
if not O.is_dir(): raise SystemExit("Output directory missing")

def sha(b): return hashlib.sha256(b).hexdigest()
def shaf(p): return sha(p.read_bytes())
def jsonl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def write_json(p,x): p.write_text(json.dumps(x,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
def write_jsonl(p,xs): p.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True)+"\n" for x in xs),encoding="utf-8")
def key(x): return (int(x["position"]),x["locale"])
def token_names(source):
    return re.findall(r"\{([A-Za-z][A-Za-z0-9_]*)\}",source)
def markup_tokens(source):
    return re.findall(r"</?[A-Za-z][^<>]*>",source)
def numeric_tokens(source):
    return re.findall(r"(?<!\w)\d+(?:[.,]\d+)?%?(?!\w)",re.sub(r"\{[^{}]+\}","",source))

source_rows=jsonl(I/"source-cells.jsonl")
caller_rows=jsonl(I/"caller-contexts.jsonl")
context_blocks=jsonl(I/"caller-context-blocks.jsonl")
window=json.loads((I/"window.json").read_text(encoding="utf-8"))
prior=jsonl(I/"carry-forward-hold-hashes.jsonl")
if len(source_rows)!=20 or len(caller_rows)!=20 or len(prior)!=12:
    raise SystemExit("Candidate-free source/caller/prior-hold counts mismatch")
if [int(x["position"]) for x in source_rows]!=list(range(3660,3680)):
    raise SystemExit("Source window is not exact W3660-W3679")
if window.get("head")!=HEAD or window.get("tree")!=TREE or window.get("cellCount")!=240:
    raise SystemExit("Candidate-free window pin or count mismatch")
for item in prior:
    if item.get("retained") is not True or item.get("targetTextIncluded") is not False:
        raise SystemExit("Prior hold hash lineage failure")
source_map={int(x["position"]):x for x in source_rows}
caller_map={int(x["position"]):x for x in caller_rows}
block_map={x["contextId"]:x for x in context_blocks}
locale_info={x["catalogKey"]:x for x in window["localeInfo"]}
if set(locale_info)!=set(LOCALES):
    raise SystemExit("Locale registry mismatch")

T={
3660:{
"es":"{count} archivos multimedia","zh_Hans":"{count} 个媒体文件","hi":"{count} मीडिया फ़ाइलें","de":"{count} Mediendateien","ja":"{count} 件のメディアファイル","fr":"{count} fichiers multimédias","pt_BR":"{count} arquivos de mídia","ar":"{count} من ملفات الوسائط","ko":"미디어 파일 {count}개","zh_Hant":"{count} 個媒體檔案","vi":"{count} tệp phương tiện","id":"{count} file media"},
3661:{
"es":"Se omitirán {count} archivos faltantes","zh_Hans":"将跳过 {count} 个缺失文件","hi":"गायब {count} फ़ाइलें छोड़ दी जाएँगी","de":"{count} fehlende Dateien werden übersprungen","ja":"見つからないファイル {count} 件をスキップします","fr":"{count} fichiers manquants seront ignorés","pt_BR":"{count} arquivos ausentes serão ignorados","ar":"سيتم تخطي {count} من الملفات المفقودة","ko":"누락된 파일 {count}개를 건너뜁니다","zh_Hant":"將略過 {count} 個缺少的檔案","vi":"Bỏ qua {count} tệp bị thiếu","id":"{count} file yang hilang akan dilewati"},
3662:{
"es":"Página siguiente","zh_Hans":"下一页","hi":"अगला पृष्ठ","de":"Nächste Seite","ja":"次のページ","fr":"Page suivante","pt_BR":"Próxima página","ar":"الصفحة التالية","ko":"다음 페이지","zh_Hant":"下一頁","vi":"Trang tiếp","id":"Halaman berikutnya"},
3663:{
"es":"Ningún autor coincide con el formato y la carpeta seleccionados.","zh_Hans":"没有作者符合所选格式和文件夹。","hi":"चुने गए फ़ॉर्मैट और फ़ोल्डर से मेल खाने वाले कोई लेखक नहीं हैं।","de":"Keine Autoren entsprechen dem ausgewählten Format und Ordner.","ja":"選択した形式とフォルダーに一致する著者はいません。","fr":"Aucun auteur ne correspond au format et au dossier sélectionnés.","pt_BR":"Nenhum autor corresponde ao formato e à pasta selecionados.","ar":"لا يوجد مؤلفون يطابقون التنسيق والمجلد المحددين.","ko":"선택한 형식과 폴더에 일치하는 저자가 없습니다.","zh_Hant":"沒有作者符合所選的格式與資料夾。","vi":"Không có tác giả nào khớp với định dạng và thư mục đã chọn.","id":"Tidak ada penulis yang cocok dengan format dan folder yang dipilih."},
3664:{
"es":"BookshelfNG no incluyó entradas para archivos individuales.","zh_Hans":"BookshelfNG 未提供单个文件条目。","hi":"BookshelfNG ने अलग-अलग फ़ाइलों की प्रविष्टियाँ नहीं दीं।","de":"BookshelfNG hat keine einzelnen Dateieinträge bereitgestellt.","ja":"BookshelfNG から個別ファイルのエントリーが返されませんでした。","fr":"BookshelfNG n'a pas fourni d'entrées pour les fichiers individuels.","pt_BR":"O BookshelfNG não incluiu entradas de arquivos individuais.","ar":"لم يقدّم BookshelfNG إدخالات للملفات الفردية.","ko":"BookshelfNG에서 개별 파일 항목을 제공하지 않았습니다.","zh_Hant":"BookshelfNG 未提供個別檔案項目。","vi":"BookshelfNG không cung cấp mục nhập cho từng tệp riêng lẻ.","id":"BookshelfNG tidak menyertakan entri untuk file satu per satu."},
3665:{
"es":"Añade un servicio de BookshelfNG en Configuración → Servicios antes de migrar las rutas.","zh_Hans":"迁移路径前，请先在设置 → 服务中添加 BookshelfNG 服务。","hi":"पाथ माइग्रेट करने से पहले सेटिंग्स → सेवाएँ में BookshelfNG सेवा जोड़ें।","de":"Füge unter Einstellungen → Dienste einen BookshelfNG-Dienst hinzu, bevor du die Pfade migrierst.","ja":"パスを移行する前に、設定 → サービスでBookshelfNGサービスを追加してください。","fr":"Ajoutez un service BookshelfNG dans Paramètres → Services avant de migrer les chemins.","pt_BR":"Adicione um serviço do BookshelfNG em Configurações → Serviços antes de migrar os caminhos.","ar":"أضف خدمة BookshelfNG ضمن الإعدادات → الخدمات قبل ترحيل المسارات.","ko":"경로를 이전하기 전에 설정 → 서비스에서 BookshelfNG 서비스를 추가하세요.","zh_Hant":"遷移路徑前，請先在設定 → 服務中新增 BookshelfNG 服務。","vi":"Thêm dịch vụ BookshelfNG trong Cài đặt → Dịch vụ trước khi chuyển đường dẫn.","id":"Tambahkan layanan BookshelfNG di Pengaturan → Layanan sebelum memigrasikan jalur."},
3666:{
"es":"BookshelfNG no pudo informar del espacio libre en el destino.","zh_Hans":"BookshelfNG 无法报告目标位置的可用空间。","hi":"BookshelfNG गंतव्य की खाली जगह की जानकारी नहीं दे सका।","de":"BookshelfNG konnte den freien Speicherplatz am Ziel nicht ermitteln.","ja":"BookshelfNG から移行先の空き容量を取得できませんでした。","fr":"BookshelfNG n'a pas pu indiquer l'espace libre sur la destination.","pt_BR":"O BookshelfNG não conseguiu informar o espaço livre no destino.","ar":"تعذّر على BookshelfNG الإبلاغ عن المساحة المتاحة في الوجهة.","ko":"BookshelfNG에서 대상 위치의 여유 공간을 보고하지 못했습니다.","zh_Hant":"BookshelfNG 無法回報目的地的可用空間。","vi":"BookshelfNG không thể báo cáo dung lượng trống tại đích.","id":"BookshelfNG tidak dapat melaporkan ruang kosong di tujuan."},
3667:{
"es":"Página {page} de {pages}","zh_Hans":"第 {page} 页，共 {pages} 页","hi":"पृष्ठ {page} / {pages}","de":"Seite {page} von {pages}","ja":"ページ {page} / {pages}","fr":"Page {page} sur {pages}","pt_BR":"Página {page} de {pages}","ar":"الصفحة {page} من {pages}","ko":"페이지 {page} / {pages}","zh_Hant":"第 {page} 頁，共 {pages} 頁","vi":"Trang {page} / {pages}","id":"Halaman {page} dari {pages}"},
3668:{
"es":"Previsualizar movimiento","zh_Hans":"预览移动","hi":"स्थानांतरण का पूर्वावलोकन","de":"Verschiebung vorab ansehen","ja":"移動をプレビュー","fr":"Prévisualiser le déplacement","pt_BR":"Pré-visualizar movimentação","ar":"عاين النقل","ko":"이동 미리보기","zh_Hant":"預覽移動","vi":"Xem trước việc chuyển","id":"Pratinjau pemindahan"},
3669:{
"es":"BookshelfNG no pudo previsualizar este movimiento.","zh_Hans":"BookshelfNG 无法预览此次移动。","hi":"BookshelfNG इस स्थानांतरण का पूर्वावलोकन नहीं कर सका।","de":"BookshelfNG konnte diese Verschiebung nicht in der Vorschau anzeigen.","ja":"BookshelfNG でこの移動のプレビューを作成できませんでした。","fr":"BookshelfNG n'a pas pu prévisualiser ce déplacement.","pt_BR":"O BookshelfNG não conseguiu gerar uma prévia desta movimentação.","ar":"تعذّر على BookshelfNG معاينة هذا النقل.","ko":"BookshelfNG에서 이 이동을 미리 볼 수 없었습니다.","zh_Hant":"BookshelfNG 無法預覽這次移動。","vi":"BookshelfNG không thể xem trước việc chuyển này.","id":"BookshelfNG tidak dapat membuat pratinjau pemindahan ini."},
3670:{
"es":"Vista previa del movimiento","zh_Hans":"移动预览","hi":"स्थानांतरण का पूर्वावलोकन","de":"Vorschau der Verschiebung","ja":"移動のプレビュー","fr":"Aperçu du déplacement","pt_BR":"Prévia da movimentação","ar":"معاينة النقل","ko":"이동 미리보기","zh_Hant":"移動預覽","vi":"Bản xem trước việc chuyển","id":"Pratinjau pemindahan"},
3671:{
"es":"Creando vista previa…","zh_Hans":"正在生成预览…","hi":"पूर्वावलोकन बनाया जा रहा है…","de":"Vorschau wird erstellt…","ja":"プレビューを作成中…","fr":"Création de l'aperçu…","pt_BR":"Gerando prévia…","ar":"جارٍ إنشاء المعاينة…","ko":"미리보기를 만드는 중…","zh_Hant":"正在建立預覽…","vi":"Đang tạo bản xem trước…","id":"Membuat pratinjau…"},
3672:{
"es":"Página anterior","zh_Hans":"上一页","hi":"पिछला पृष्ठ","de":"Vorherige Seite","ja":"前のページ","fr":"Page précédente","pt_BR":"Página anterior","ar":"الصفحة السابقة","ko":"이전 페이지","zh_Hant":"上一頁","vi":"Trang trước","id":"Halaman sebelumnya"},
3673:{
"es":"BookshelfNG puso en cola el comando de movimiento {id}.","zh_Hans":"BookshelfNG 已将移动命令 {id} 加入队列。","hi":"BookshelfNG ने स्थानांतरण कमांड {id} को कतार में रखा।","de":"BookshelfNG hat den Verschiebebefehl {id} eingereiht.","ja":"BookshelfNG が移動コマンド {id} をキューに追加しました。","fr":"BookshelfNG a mis en file la commande de déplacement {id}.","pt_BR":"O BookshelfNG colocou na fila o comando de movimentação {id}.","ar":"أضاف BookshelfNG أمر النقل {id} إلى قائمة الانتظار.","ko":"BookshelfNG에서 이동 명령 ID {id}가 대기열에 추가되었습니다.","zh_Hant":"BookshelfNG 已將移動命令 {id} 排入佇列。","vi":"BookshelfNG đã xếp lệnh chuyển {id} vào hàng đợi.","id":"BookshelfNG mengantrekan perintah pemindahan {id}."},
3674:{
"es":"{count} archivos registrados","zh_Hans":"{count} 个已登记文件","hi":"{count} पंजीकृत फ़ाइलें","de":"{count} registrierte Dateien","ja":"登録済みファイル {count} 件","fr":"{count} fichiers enregistrés","pt_BR":"{count} arquivos registrados","ar":"{count} من الملفات المسجلة","ko":"등록된 파일 {count}개","zh_Hant":"{count} 個已登錄檔案","vi":"{count} tệp đã đăng ký","id":"{count} file terdaftar"},
3675:{
"es":"Espacio necesario para copiar: {size}","zh_Hans":"复制所需空间：{size}","hi":"कॉपी के लिए आवश्यक जगह: {size}","de":"Benötigter Speicherplatz zum Kopieren: {size}","ja":"コピーに必要な空き容量: {size}","fr":"Espace nécessaire à la copie : {size}","pt_BR":"Espaço necessário para cópia: {size}","ar":"المساحة المطلوبة للنسخ: {size}","ko":"복사에 필요한 공간: {size}","zh_Hant":"複製所需空間：{size}","vi":"Dung lượng cần để sao chép: {size}","id":"Ruang yang diperlukan untuk menyalin: {size}"},
3676:{
"es":"SeerrNG pide a BookshelfNG que genere una vista previa de cada autor seleccionado antes de moverlo. La vista previa muestra los archivos, los conflictos, los archivos faltantes y el espacio en disco necesario. Para iniciar el movimiento se requiere un token de vista previa nuevo.",
"zh_Hans":"SeerrNG 会先让 BookshelfNG 预览每位已选作者，再执行移动。预览会列出文件、冲突、缺失文件和所需磁盘空间。开始移动前必须获取新的预览令牌。",
"hi":"स्थानांतरण से पहले SeerrNG, BookshelfNG से हर चयनित लेखक के लिए पूर्वावलोकन माँगता है। पूर्वावलोकन में फ़ाइलें, टकराव, गायब फ़ाइलें और आवश्यक डिस्क स्थान दिखते हैं। स्थानांतरण शुरू करने के लिए नया पूर्वावलोकन टोकन ज़रूरी है।",
"de":"SeerrNG fordert BookshelfNG auf, vor einer Verschiebung für jeden ausgewählten Autor eine Vorschau zu erstellen. Die Vorschau zeigt Dateien, Konflikte, fehlende Dateien und den benötigten Speicherplatz. Zum Starten der Verschiebung ist ein neues Vorschau-Token erforderlich.",
"ja":"SeerrNGは移動前に、選択した各著者についてBookshelfNGにプレビューを依頼します。プレビューにはファイル、競合、見つからないファイル、必要なディスク容量が表示されます。移動を開始するには、新しいプレビュートークンが必要です。",
"fr":"SeerrNG demande à BookshelfNG de prévisualiser chaque auteur sélectionné avant tout déplacement. L'aperçu indique les fichiers, les conflits, les fichiers manquants et l'espace disque requis. Un nouveau jeton d'aperçu est nécessaire pour démarrer un déplacement.",
"pt_BR":"O SeerrNG solicita que o BookshelfNG gere uma prévia de cada autor selecionado antes da movimentação. A prévia informa os arquivos, conflitos, arquivos ausentes e o espaço em disco necessário. Para iniciar a movimentação, é necessário um novo token de prévia.",
"ar":"يطلب SeerrNG من BookshelfNG معاينة كل مؤلف محدد قبل النقل. تعرض المعاينة الملفات والتعارضات والملفات المفقودة ومساحة القرص المطلوبة. يتطلب بدء النقل رمز معاينة جديدًا.",
"ko":"SeerrNG는 이동 전에 선택한 각 저자를 BookshelfNG에 미리보기 요청합니다. 미리보기에는 파일, 충돌, 누락된 파일, 필요한 디스크 공간이 표시됩니다. 이동을 시작하려면 새 미리보기 토큰이 필요합니다.",
"zh_Hant":"SeerrNG 會在移動前要求 BookshelfNG 預覽每位已選作者。預覽會列出檔案、衝突、缺少的檔案及所需磁碟空間。開始移動需要新的預覽權杖。",
"vi":"SeerrNG yêu cầu BookshelfNG xem trước từng tác giả đã chọn trước khi chuyển tệp. Bản xem trước liệt kê tệp, xung đột, tệp bị thiếu và dung lượng ổ đĩa cần thiết. Cần có mã thông báo xem trước mới để bắt đầu chuyển.",
"id":"SeerrNG meminta BookshelfNG membuat pratinjau untuk setiap penulis yang dipilih sebelum pemindahan. Pratinjau menampilkan file, konflik, file yang hilang, dan ruang disk yang diperlukan. Memulai pemindahan memerlukan token pratinjau baru."},
3677:{
"es":"Filtrar autores","zh_Hans":"筛选作者","hi":"लेखक फ़िल्टर करें","de":"Autoren filtern","ja":"著者を絞り込む","fr":"Filtrer les auteurs","pt_BR":"Filtrar autores","ar":"تصفية المؤلفين","ko":"저자 필터","zh_Hant":"篩選作者","vi":"Lọc tác giả","id":"Filter penulis"},
3678:{
"es":"Seleccionar todos los autores coincidentes","zh_Hans":"选择所有匹配的作者","hi":"मेल खाने वाले सभी लेखकों को चुनें","de":"Alle passenden Autoren auswählen","ja":"一致する著者をすべて選択","fr":"Sélectionner tous les auteurs correspondants","pt_BR":"Selecionar todos os autores correspondentes","ar":"تحديد جميع المؤلفين المطابقين","ko":"일치하는 저자 모두 선택","zh_Hant":"選取所有符合條件的作者","vi":"Chọn tất cả tác giả phù hợp","id":"Pilih semua penulis yang cocok"},
3679:{
"es":"Seleccionar {author}","zh_Hans":"选择 {author}","hi":"{author} चुनें","de":"{author} auswählen","ja":"{author}を選択","fr":"Sélectionner {author}","pt_BR":"Selecionar {author}","ar":"تحديد {author}","ko":"{author} 선택","zh_Hant":"選取 {author}","vi":"Chọn {author}","id":"Pilih {author}"}
}
ROLES={
3660:"numeric count label in the move preview",
3661:"conditional count warning for files that will be skipped",
3662:"next-page pagination button",
3663:"empty state after filtering authors by format and folder",
3664:"preview completeness note when no individual file rows were returned",
3665:"prerequisite instruction linking Settings and Services",
3666:"destination free-space status",
3667:"live current-page indicator with page and total placeholders",
3668:"preview action button",
3669:"preview failure message",
3670:"preview heading",
3671:"busy-state button label",
3672:"previous-page pagination button",
3673:"queued command status with command-ID placeholder",
3674:"registered-file count label for an author",
3675:"required copy-space label with formatted-size placeholder",
3676:"safety explanation describing preview checks and a fresh-token requirement",
3677:"author filter field label and accessible navigation label",
3678:"bulk selection button",
3679:"per-author selection control with an author-name placeholder",
}
if set(T)!=set(source_map) or any(set(x)!=set(LOCALES) for x in T.values()):
    raise SystemExit("Translation matrix does not cover every source and locale")
for record in source_rows:
    pos=int(record["position"])
    ctx=caller_map[pos]
    if ctx["sourceId"]!=record["sourceId"] or ctx["sourceSha256"]!=record["sourceSha256"]:
        raise SystemExit("Source/caller identity mismatch")
    for block_id in ctx["contextBlockIds"]:
        if block_id not in block_map: raise SystemExit("Missing caller context block "+block_id)

# Build a source-only prompt packet, deliberately omitting current-target text.
prompt_rows=[]
for r in source_rows:
    ctx=caller_map[int(r["position"])]
    prompt_rows.append({
        "position":int(r["position"]),"sourceId":r["sourceId"],"sourceKey":r["sourceKey"],
        "source":r["source"],"sourceSha256":r["sourceSha256"],
        "sourcePlaceholders":r["sourcePlaceholders"],
        "sourceIcuPluralCategories":r["sourceIcuPluralCategories"],
        "sourceMarkupTokens":r["sourceMarkupTokens"],
        "sourceNumericTokens":r["sourceNumericTokens"],
        "sourceProtectedLiterals":r["sourceProtectedLiterals"],
        "callerCount":ctx["callerCount"],"callerResolution":ctx["callerResolution"],
        "contextBlockIds":ctx["contextBlockIds"],
        "directMessageReferences":ctx["directMessageReferences"],
        "dynamicRendererReferences":ctx["dynamicRendererReferences"],
        "routeContext":ctx["dynamicRendererReferences"],
        "role":ROLES[int(r["position"])],"locales":window["localeOrder"],
    })
BI=O/"blind-input"; BI.mkdir(exist_ok=True)
write_jsonl(BI/"translation-prompts.jsonl",prompt_rows)
write_jsonl(BI/"source-cells.jsonl",source_rows)
write_jsonl(BI/"caller-contexts.jsonl",caller_rows)
write_jsonl(BI/"caller-context-blocks.jsonl",context_blocks)
write_jsonl(O/"prior-hold-reattestation.jsonl",prior)

ledger=[]
for r in source_rows:
    pos=int(r["position"]); ctx=caller_map[pos]
    expected=Counter(token_names(r["source"]))
    required_protected=r["sourceProtectedLiterals"]
    for locale in LOCALES:
        proposal=T[pos][locale]
        actual=Counter(token_names(proposal))
        placeholder_ok=actual==expected
        mark_ok=Counter(markup_tokens(proposal))==Counter(r["sourceMarkupTokens"])
        numeric_ok=Counter(numeric_tokens(proposal))==Counter(r["sourceNumericTokens"])
        missing=[literal for literal in required_protected if proposal.count(literal)<1]
        icu_categories=Counter(r["sourceIcuPluralCategories"])
        icu_ok=(not icu_categories)
        if not (placeholder_ok and mark_ok and numeric_ok and not missing and icu_ok):
            raise SystemExit(f"Technical token check failed at {pos}/{locale}")
        li=locale_info[locale]
        ledger.append({
            "schemaVersion":1,"repository":REPO,"pullRequest":418,
            "window":"W3660-W3679","head":HEAD,"tree":TREE,
            "position":pos,"sourceId":r["sourceId"],"sourceKey":r["sourceKey"],
            "source":r["source"],"sourceSha256":r["sourceSha256"],
            "locale":locale,"localeTag":li["tag"],"languageName":li["nativeName"],
            "proposal":proposal,"proposalSha256":sha(proposal.encode("utf-8")),
            "reviewDisposition":"proposal","confidence":"moderate",
            "blindnessStatus":"target-exposure-limited" if (pos,locale)==(3660,"es") else "strictly-blind",
            "rationale":"Fresh source-based proposal for the pinned caller role: "+ROLES[pos]+".",
            "callerResolution":ctx["callerResolution"],"callerCount":ctx["callerCount"],
            "callerContextBlockIds":ctx["contextBlockIds"],
            "directMessageReferences":ctx["directMessageReferences"],
            "sourcePlaceholders":r["sourcePlaceholders"],
            "sourceIcuPluralCategories":r["sourceIcuPluralCategories"],
            "sourceMarkupTokens":r["sourceMarkupTokens"],
            "sourceNumericTokens":r["sourceNumericTokens"],
            "sourceProtectedLiterals":required_protected,
            "technicalChecks":{
                "placeholderMultiset":placeholder_ok,
                "placeholderOrderPreserved":token_names(proposal)==token_names(r["source"]),
                "icuPluralCategories":icu_ok,"markupTokens":mark_ok,
                "numericTokens":numeric_ok,"protectedLiterals":not missing,
                "missingProtectedLiterals":missing,
            },
        })
if len(ledger)!=240 or len({(x["position"],x["locale"]) for x in ledger})!=240:
    raise SystemExit("Blind ledger must cover exactly 240 unique cells")
write_jsonl(O/"translation-ledger.jsonl",ledger)

# Re-attest live PR state immediately before sealing.
pr=subprocess.run(["gh","pr","view","418","--repo",REPO,"--json","state,isDraft,headRefOid,headRefName,url,mergeStateStatus,updatedAt"],capture_output=True,text=True,check=True)
live=json.loads(pr.stdout)
tree=subprocess.run(["gh","api",f"repos/{REPO}/git/commits/{HEAD}","--jq",".tree.sha"],capture_output=True,text=True,check=True).stdout.strip()
if live["headRefOid"]!=HEAD or live["headRefName"]!="codex/seerrng-localization-overhaul-20261028" or live["state"]!="OPEN" or not live["isDraft"] or tree!=TREE:
    raise SystemExit("Live PR head/tree/branch changed before sealing")
att={
 "repository":REPO,"pullRequest":418,"url":live["url"],"state":live["state"],
 "isDraft":live["isDraft"],"headRefName":live["headRefName"],"head":HEAD,"tree":TREE,
 "mergeStateStatus":live["mergeStateStatus"],"updatedAt":live["updatedAt"],
 "attestedAtUTC":datetime.now(timezone.utc).isoformat(),
 "attestationMethod":"live gh pr view plus GitHub commit tree API","result":"PASS"}
write_json(O/"PR-attestation.json",att)

# Prior 12 holds contain only hashes; preserve the packet rows unchanged.
(O/"prior-hold-reattestation.jsonl").write_bytes((I/"carry-forward-hold-hashes.jsonl").read_bytes())

# Blind input contains no catalog targets or primary-review output.
bi_manifest={
 "schemaVersion":1,"packetType":"source-only-blind-input","repository":REPO,"pullRequest":418,
 "window":"W3660-W3679","head":HEAD,"tree":TREE,"sourceCount":20,"localeCount":12,"cellCount":240,
 "currentTargetTextIncluded":False,"primaryReviewOpened":False,
 "schemaInspectionNote":"One candidate-free current-target row for 3660/es was viewed before proposal generation while identifying input fields. Exposure could have influenced this cell wording and cannot be ruled out; it is marked target-exposure-limited. No primary candidate or decision was exposed.",
 "files":{}}
for p in sorted(BI.iterdir()):
    if p.name not in {"manifest.json","SHA256SUMS.txt"}: bi_manifest["files"][p.name]=shaf(p)
write_json(BI/"manifest.json",bi_manifest)
(BI/"README.md").write_text("""# Source-only blind input for SeerrNG PR #418 W3660-W3679

This packet was derived only from the candidate-free source and caller-context files. It contains the 20 English source records, their exact callers/routes and context blocks, and locale metadata. It contains no target strings, primary-review material, candidates, or decisions.

The PR is pinned to head eb279fc80be656f379cd893642bf741ba0a24d85 and tree 85a73172719b38e99a4e74c0ef9a303164cb4fcb. One candidate-free current-target row for 3660/es was viewed before prompt generation while identifying the packet schema. Exposure could have influenced that cell wording and cannot be ruled out; the cell is marked target-exposure-limited. No target text or primary-review material is included here.
""",encoding="utf-8")
(BI/"SHA256SUMS.txt").write_text("".join(shaf(p)+"  "+p.name+"\n" for p in sorted(BI.iterdir()) if p.name!="SHA256SUMS.txt"),encoding="utf-8")

# Copy the verified hash-only prior hold lineage.
prior_out=jsonl(O/"prior-hold-reattestation.jsonl")
if len(prior_out)!=12 or any(x.get("retained") is not True or x.get("targetTextIncluded") is not False for x in prior_out):
    raise SystemExit("Prior-hold lineage failed")

counts={
 "proposalCells":len(ledger),"sourceCount":20,"localeCount":12,
 "reviewDispositionCounts":dict(Counter(x["reviewDisposition"] for x in ledger)),
 "confidenceCounts":dict(Counter(x["confidence"] for x in ledger)),
 "callerlessSourcePositions":[r["position"] for r in caller_rows if r["callerCount"]==0],
 "ambiguousCallerSourcePositions":[r["position"] for r in caller_rows if "ambiguous" in r["callerResolution"].lower()],
 "priorHoldCount":len(prior_out),"priorHoldTargetTextIncluded":False,
 "tokenCoverage":{
   "placeholderCellCount":sum(bool(r["sourcePlaceholders"]) for r in source_rows)*12,
   "placeholderInstanceCount":sum(len(r["sourcePlaceholders"]) for r in source_rows)*12,
   "icuSourceCellCount":sum(bool(r["sourceIcuPluralCategories"]) for r in source_rows)*12,
   "markupSourceCellCount":sum(bool(r["sourceMarkupTokens"]) for r in source_rows)*12,
   "numericSourceCellCount":sum(bool(r["sourceNumericTokens"]) for r in source_rows)*12,
   "protectedLiteralCellCount":sum(bool(r["sourceProtectedLiterals"]) for r in source_rows)*12,
   "protectedLiteralInstanceCount":sum(len(r["sourceProtectedLiterals"]) for r in source_rows)*12,
   "placeholderMismatchCount":0,"icuPluralCategoryMismatchCount":0,
   "markupMismatchCount":0,"numericTokenMismatchCount":0,"protectedLiteralMismatchCount":0},
 "candidateFreeInputVerifier":"not provided; SHA256SUMS verified and blind verifier independently checks used input pins and packet coverage",
 "candidateFreeCurrentTargetSampleInspected":True,
 "strictlyBlindProposalCellCount":239,"targetExposureLimitedProposalCellCount":1,
 "targetExposureCell":{"position":3660,"locale":"es"},
 "primaryReviewOpened":False,"primaryCandidatesOrDecisionsOpened":False,
 "nativeSpeakerApproval":"not obtained","browserReview":"not performed",
 "repositoryOrCatalogFilesEdited":False,"testsBuildsCiReleaseTagOrMergeRun":False,
}
summary={
 "schemaVersion":1,"repository":REPO,"pullRequest":418,"window":"W3660-W3679",
 "head":HEAD,"tree":TREE,"result":"PASS",
 **counts,
}
write_json(O/"summary.json",summary)
(O/"README.md").write_text("""# SeerrNG PR #418 W3660-W3679 independent blind translation review

This packet contains 240 source-based proposals for 20 pinned English messages across 12 locales. Of these, 239 are strictly blind to current targets. The proposal for 3660/es is marked target-exposure-limited because one candidate-free target row was seen before proposal generation while identifying the input schema. All proposals were composed from source strings and direct caller/context evidence; caller resolution is available for all 20 sources.

The source-only prompt packet contains no target translations or primary-review material. One candidate-free current-target row (3660/es) was opened before prompt generation while identifying input fields. Its exposure could have influenced that cell wording and cannot be ruled out, so the cell is explicitly marked target-exposure-limited; the other 239 proposal cells are strictly blind. The primary-review directory and its candidates/decisions were not opened.

Twelve prior callerless holds at source position 3632 are preserved by their exact target hashes only; their text is omitted. Source placeholders, ICU plural categories, markup, numeric tokens, and protected literals were checked against every proposal. Native-speaker approval and browser review were not obtained.

Run verify_blind_review.py with Python 3. It checks the candidate-free packet checksums and pins, exact cell coverage, prior-hold hashes, technical tokens, blind-input and output seals.
""",encoding="utf-8")

# The verifier is written below; its contents are kept independent of translations.
verifier=r'''#!/usr/bin/env python3
import json,hashlib,re,sys
from collections import Counter
from pathlib import Path
R=Path(__file__).resolve().parent
S=Path("/home/keith/Documents/code/task-scratch")
I=S/"seerrng-pr418-w3660-3679-primary-20261103"/"candidate-free-input"
HEAD="eb279fc80be656f379cd893642bf741ba0a24d85"
TREE="85a73172719b38e99a4e74c0ef9a303164cb4fcb"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
def sha(b): return hashlib.sha256(b).hexdigest()
def shaf(p): return sha(p.read_bytes())
def jsonl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def key(r): return int(r["position"]),r["locale"]
def sums(d):
 n=0
 for line in (d/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
  if line.strip():
   expected,name=line.split(None,1); p=d/name.strip().lstrip("*")
   if not p.is_file() or shaf(p)!=expected: raise ValueError("checksum mismatch "+str(p))
   n+=1
 return n
def names(t): return re.findall(r"\{([A-Za-z][A-Za-z0-9_]*)\}",t)
def nums(t): return re.findall(r"(?<!\w)\d+(?:[.,]\d+)?%?(?!\w)",re.sub(r"\{[^{}]+\}","",t))
def marks(t): return re.findall(r"</?[A-Za-z][^<>]*>",t)
def main():
 m=json.loads((R/"manifest.json").read_text(encoding="utf-8"))
 if (m["head"],m["tree"])!=(HEAD,TREE): raise ValueError("manifest pin mismatch")
 for rel,exp in m["inputHashes"].items():
  if shaf(S/rel)!=exp: raise ValueError("input hash mismatch "+rel)
 for rel,exp in m["outputHashes"].items():
  if shaf(R/rel)!=exp: raise ValueError("output hash mismatch "+rel)
 inputChecks=sums(I); biChecks=sums(R/"blind-input"); outChecks=sums(R)
 if m["nativeSpeakerApproval"]!="not obtained": raise ValueError("native-speaker claim")
 src=jsonl(I/"source-cells.jsonl"); ctx=jsonl(I/"caller-contexts.jsonl")
 blocks=jsonl(I/"caller-context-blocks.jsonl"); rows=jsonl(R/"translation-ledger.jsonl")
 prompts=jsonl(R/"blind-input/translation-prompts.jsonl")
 prior=jsonl(R/"prior-hold-reattestation.jsonl")
 if len(src)!=20 or len(ctx)!=20 or len(rows)!=240 or len(prompts)!=20 or len(prior)!=12: raise ValueError("coverage count")
 if (R/"prior-hold-reattestation.jsonl").read_bytes()!=(I/"carry-forward-hold-hashes.jsonl").read_bytes(): raise ValueError("prior hold lineage differs")
 if any(x.get("retained") is not True or x.get("targetTextIncluded") is not False for x in prior): raise ValueError("prior hold status")
 sm={int(x["position"]):x for x in src}; cm={int(x["position"]):x for x in ctx}
 rm={key(x):x for x in rows}
 expected={(p,l) for p in range(3660,3680) for l in LOCALES}
 if set(rm)!=expected or len(rm)!=240: raise ValueError("cell key coverage")
 bm={x["contextId"]:x for x in blocks}
 for p in range(3660,3680):
  if cm[p]["callerCount"]<1 or any(x not in bm for x in cm[p]["contextBlockIds"]): raise ValueError("caller evidence "+str(p))
 for k,r in rm.items():
  s=sm[k[0]]; c=cm[k[0]]
  if r["sourceId"]!=s["sourceId"] or r["sourceSha256"]!=s["sourceSha256"] or r["source"]!=s["source"]: raise ValueError("source link "+repr(k))
  if r["callerContextBlockIds"]!=c["contextBlockIds"] or r["callerCount"]!=c["callerCount"]: raise ValueError("caller link "+repr(k))
  if r["reviewDisposition"]!="proposal" or "currentTarget" in r: raise ValueError("review disposition/separation "+repr(k))
  expected_blindness="target-exposure-limited" if k==(3660,"es") else "strictly-blind"
  if r.get("blindnessStatus")!=expected_blindness: raise ValueError("blindness status "+repr(k))
  if Counter(names(r["proposal"]))!=Counter(x["name"] for x in s["sourcePlaceholders"]): raise ValueError("placeholder mismatch "+repr(k))
  if Counter(marks(r["proposal"]))!=Counter(s["sourceMarkupTokens"]): raise ValueError("markup mismatch "+repr(k))
  if Counter(nums(r["proposal"]))!=Counter(s["sourceNumericTokens"]): raise ValueError("numeric mismatch "+repr(k))
  if any(r["proposal"].count(x)<1 for x in s["sourceProtectedLiterals"]): raise ValueError("protected literal missing "+repr(k))
  if s["sourceIcuPluralCategories"] and not r["technicalChecks"]["icuPluralCategories"]: raise ValueError("ICU plural mismatch "+repr(k))
  if r["proposalSha256"]!=sha(r["proposal"].encode("utf-8")): raise ValueError("proposal hash "+repr(k))
 att=json.loads((R/"PR-attestation.json").read_text(encoding="utf-8"))
 if (att["head"],att["tree"],att["state"],att["isDraft"])!=(HEAD,TREE,"OPEN",True): raise ValueError("live PR attestation mismatch")
 print(json.dumps({"result":"PASS","head":HEAD,"tree":TREE,"sourceCount":20,"localeCount":12,"proposalCells":len(rows),"strictlyBlindProposalCells":239,"targetExposureLimitedProposalCells":1,"reviewDispositionCounts":dict(Counter(x["reviewDisposition"] for x in rows)),"priorHoldsPreservedByHash":len(prior),"placeholderMismatchCount":0,"icuPluralCategoryMismatchCount":0,"markupMismatchCount":0,"numericTokenMismatchCount":0,"protectedLiteralMismatchCount":0,"candidateFreeChecksumFilesVerified":inputChecks,"blindInputChecksumFilesVerified":biChecks,"outputChecksumFilesVerified":outChecks},ensure_ascii=False,indent=2,sort_keys=True))
if __name__=="__main__":
 try: main()
 except Exception as e: print("FAIL: "+str(e),file=sys.stderr);sys.exit(1)
'''
(O/"verify_blind_review.py").write_text(verifier,encoding="utf-8")

# Pin only candidate-free artifacts actually used; no primary artifacts are read.
used={
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/SHA256SUMS.txt":I/"SHA256SUMS.txt",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/PR-attestation.json":I/"PR-attestation.json",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/manifest.json":I/"manifest.json",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/source-cells.jsonl":I/"source-cells.jsonl",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/caller-contexts.jsonl":I/"caller-contexts.jsonl",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/caller-context-blocks.jsonl":I/"caller-context-blocks.jsonl",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/window.json":I/"window.json",
 "seerrng-pr418-w3660-3679-primary-20261103/candidate-free-input/carry-forward-hold-hashes.jsonl":I/"carry-forward-hold-hashes.jsonl",
}
manifest={
 "schemaVersion":1,"packetType":"blind-translation-review","repository":REPO,"pullRequest":418,
 "window":"W3660-W3679","head":HEAD,"tree":TREE,"result":"PASS",
 "currentTargetTextUsedInProposals":"cannot-exclude-for-3660-es","candidateFreeTargetSampleInspected":True,
 "targetExposureCell":{"position":3660,"locale":"es"},
 "strictlyBlindProposalCellCount":239,"targetExposureLimitedProposalCellCount":1,
 "candidateFreeTargetInspectionNote":"One candidate-free target row for 3660/es was viewed before proposal generation while identifying the schema. Exposure could have influenced this cell wording and cannot be ruled out; it is marked target-exposure-limited. No primary candidate or decision was exposed.",
 "primaryReviewFolderOpened":False,"primaryCandidatesOrDecisionsOpened":False,
 "nativeSpeakerApproval":"not obtained","inputHashes":{k:shaf(p) for k,p in used.items()},
 "outputHashes":{}}
for p in sorted(O.rglob("*")):
 if p.is_file() and "__pycache__" not in p.relative_to(O).parts and p.relative_to(O).as_posix() not in {"manifest.json","SHA256SUMS.txt"}:
  manifest["outputHashes"][p.relative_to(O).as_posix()]=shaf(p)
write_json(O/"manifest.json",manifest)
# Root checksum covers every packet file except itself.
(O/"SHA256SUMS.txt").write_text("".join(shaf(p)+"  "+p.relative_to(O).as_posix()+"\n" for p in sorted(O.rglob("*")) if p.is_file() and p.name!="SHA256SUMS.txt" and "__pycache__" not in p.relative_to(O).parts),encoding="utf-8")
# Seal everything read-only.
for p in O.rglob("*"):
 if p.is_file(): p.chmod(0o444)
for p in sorted((x for x in O.rglob("*") if x.is_dir()),key=lambda x:len(x.parts),reverse=True): p.chmod(0o555)
O.chmod(0o555)
print(json.dumps({"output":str(O),"proposalCells":len(ledger),"sourceCount":20,"localeCount":12,"priorHolds":len(prior_out),"protectedLiteralChecks":counts["tokenCoverage"]["protectedLiteralInstanceCount"],"placeholderChecks":counts["tokenCoverage"]["placeholderInstanceCount"],"checksumSha256":shaf(O/"SHA256SUMS.txt"),"manifestSha256":shaf(O/"manifest.json")},ensure_ascii=False,indent=2,sort_keys=True))
