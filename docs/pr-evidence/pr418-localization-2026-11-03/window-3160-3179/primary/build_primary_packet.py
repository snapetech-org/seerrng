from pathlib import Path
import hashlib,json,re,subprocess
OUT=Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-w3160-3179-primary-20261103")
REPO_DIR=Path("/home/keith/Documents/code/seerrng")
HEAD="0cc977d2dc5eff86eac49cdad3b9361bff5acd65"
TREE="ce65000b9bebef1838f3dd0e1a3764f75e102876"
REPO="snapetech-org/SeerrNG"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
def show(path): return subprocess.check_output(["git","show",f"{HEAD}:{path}"],cwd=REPO_DIR)
def blob(path): return subprocess.check_output(["git","rev-parse",f"{HEAD}:{path}"],text=True,cwd=REPO_DIR).strip()
def sha(s): return hashlib.sha256(s.encode("utf-8")).hexdigest()
def jhash(x): return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")).hexdigest()
def write_json(path,obj): Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def write_jsonl(path,rows): Path(path).write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True)+"\n" for x in rows),encoding="utf-8")
remote=json.loads(subprocess.check_output(["gh","api","repos/snapetech-org/seerrng/pulls/418"],text=True))
assert remote["state"]=="open" and remote["draft"] and remote["head"]["sha"]==HEAD
assert subprocess.check_output(["git","ls-remote","origin","refs/heads/codex/seerrng-localization-overhaul-20261028"],text=True,cwd=REPO_DIR).split()[0]==HEAD
assert subprocess.check_output(["git","rev-parse",f"{HEAD}^{{tree}}"],text=True,cwd=REPO_DIR).strip()==TREE
en=json.loads(show("src/i18n/locale/en.json")); keys=sorted(en)
assert len(keys)==9494 and list(json.loads(show("src/i18n/locale/en.json")))==keys
positions=list(range(3160,3180)); ids=[keys[i] for i in positions]
assert ids[0]=="components.RequestModal.watchAheadLabel" and ids[-1]=="components.RequestStatus.SoftwareRequests.cancel"
catalogs={"en":en}
for loc in LOCALES:
 obj=json.loads(show(f"src/i18n/locale/{loc}.json"))
 assert set(obj)==set(en) and len(obj)==9494,loc
 catalogs[loc]=obj
# Reviewed primary choices: (disposition, proposed value, rationale, confidence).
C="correction"; R="refinement"; H="high"; M="moderate"
spec={}
def setd(p,l,d,t,r,c=H): spec[(p,l)]=(d,t,r,c)
setd(3160,"zh_Hans",C,"剧集队列","The current value is malformed and omits the episode term; align it with the established Simplified Chinese feature term.")
setd(3160,"hi",C,"एपिसोड कतार","The current value says only Episode and drops Queue; use the complete feature name.")
setd(3160,"fr",C,"File d’épisodes","The current phrase means an episode request rather than an episode queue.")
setd(3160,"pt_BR",C,"Fila de episódios","The current word order is ungrammatical; use the natural Portuguese queue noun phrase.")
setd(3160,"ar",C,"قائمة انتظار الحلقات","The current value means “the fourth episode,” unrelated to this feature.")
setd(3160,"ko",C,"에피소드 큐","The current value means “category”; use the established Korean feature term.")
setd(3160,"zh_Hant",C,"集數佇列","The current phrase is malformed; use the established Traditional Chinese term.")
setd(3160,"vi",C,"Hàng đợi Tập phim","The current word order is unnatural; use the established Vietnamese feature term.")
setd(3161,"zh_Hans",C,"剧集队列如何运作","The current target leaves the feature name in English; use the established Simplified Chinese term.")
setd(3161,"hi",C,"एपिसोड कतार कैसे काम करती है","The current target omits its subject; use feminine agreement for कतार and name the feature.")
setd(3161,"de",C,"So funktioniert die Episodenwarteschlange","The current target mixes English product wording despite an established German feature term.")
setd(3161,"fr",C,"Fonctionnement de la file d’épisodes","The current target mixes English and French and does not name the queue naturally.")
setd(3161,"pt_BR",C,"Como funciona a fila de episódios","The current word order is ungrammatical and leaves the feature name unclear.")
setd(3161,"ar",C,"كيف تعمل قائمة انتظار الحلقات","The current target transliterates the English name; use clear Arabic wording.")
setd(3161,"ko",C,"에피소드 큐 작동 방식","The current target mixes English and uses 작품 (“work/artwork”) incorrectly.")
setd(3161,"zh_Hant",C,"集數佇列運作方式","The current target mixes English into the title; use the established Traditional Chinese term.")
setd(3161,"vi",C,"Hàng đợi tập phim hoạt động như thế nào","The current phrase says “program queue”; use the established episode-queue term.")
setd(3161,"id",C,"Cara kerja Antrian Episode","The current title mixes English with Indonesian; use a natural how-it-works heading.")
setd(3162,"hi",C,"खाता लिंक करें","The current word order is unnatural for a button; use a direct Hindi action label.")
setd(3162,"ja",C,"アカウントを連携","The current phrase is an unnatural noun sequence; use the account-linking verb.")
setd(3162,"fr",C,"Lier le compte","The current phrase means “account link,” not the action.")
setd(3162,"pt_BR",C,"Vincular conta","The current noun phrase does not express the action.")
setd(3162,"ar",C,"اربط الحساب","The current phrase is awkward as an action label.")
setd(3162,"ko",C,"계정 연결","The current word order is unnatural for an action.")
setd(3162,"vi",C,"Liên kết tài khoản","The current phrase is a noun description rather than an action.")
setd(3162,"id",C,"Tautkan akun","The current wording is missing the Indonesian action suffix.")
setd(3163,"es",R,"No se pudo cargar tu configuración de la cola de episodios. Inténtalo de nuevo antes de enviar esta solicitud.","Use sentence case and the established lowercase common-noun feature term.",M)
setd(3163,"zh_Hans",R,"无法加载您的剧集队列设置。请在提交此请求前重试。","Use the established Simplified Chinese term instead of “episode queuing.”",M)
setd(3163,"hi",R,"आपकी एपिसोड कतार की सेटिंग लोड नहीं हो सकी। इस अनुरोध को सबमिट करने से पहले फिर से प्रयास करें।","Add the genitive postposition for more natural Hindi.",M)
setd(3163,"de",C,"Ihre Einstellung für die Episodenwarteschlange konnte nicht geladen werden. Versuchen Sie es erneut, bevor Sie diese Anfrage senden.","Replace the awkward compound with the established German feature noun.")
setd(3163,"fr",R,"Impossible de charger le paramètre de votre file d’épisodes. Réessayez avant de soumettre cette demande.","Add the needed article and possessive relationship.",M)
setd(3163,"zh_Hant",C,"無法載入您的集數佇列設定。請在提交此請求前重試。","The current term does not identify episodes; use the established feature term.")
setd(3163,"vi",R,"Không thể tải cài đặt hàng đợi tập phim của bạn. Hãy thử lại trước khi gửi yêu cầu này.","Use sentence-case common nouns.",M)
setd(3164,"es",R,"Cargando tu configuración de la cola de episodios…","Use sentence case and the established lowercase feature term.",M)
setd(3164,"zh_Hans",R,"正在加载您的剧集队列设置…","Use the established Simplified Chinese feature term.",M)
setd(3164,"hi",R,"आपकी एपिसोड कतार की सेटिंग लोड हो रही है…","Add the genitive postposition for natural Hindi phrasing.",M)
setd(3164,"de",C,"Ihre Einstellung für die Episodenwarteschlange wird geladen…","Replace the awkward German compound with the established feature noun.")
setd(3164,"fr",R,"Chargement du paramètre de votre file d’épisodes…","Add the article and possessive relationship.",M)
setd(3164,"zh_Hant",C,"正在載入您的集數佇列設定…","Use the established Traditional Chinese feature term.")
setd(3164,"vi",R,"Đang tải cài đặt hàng đợi tập phim của bạn…","Use sentence-case common nouns and the complete feature term.",M)
setd(3165,"es",R,"La cola de episodios está desactivada para las solicitudes de TV de {owner}. Un administrador de usuarios controla esta configuración.","Use sentence case for the translated common-noun feature term.",M)
setd(3165,"zh_Hans",R,"已为{owner}的电视剧请求关闭剧集队列。此设置由用户管理员控制。","Use the established Simplified Chinese feature term consistently.",M)
setd(3165,"hi",R,"एपिसोड कतार {owner} के टीवी अनुरोधों के लिए बंद है। इस सेटिंग को उपयोगकर्ता प्रबंधक नियंत्रित करता है।","Improve Hindi agreement and the literal role wording.",M)
setd(3165,"de",C,"Die Episodenwarteschlange ist für TV-Anfragen von {owner} deaktiviert. Ein Benutzeradministrator steuert diese Einstellung.","Replace the inconsistent compound with the established German feature noun.")
setd(3165,"ar",R,"قائمة انتظار الحلقات معطلة لطلبات {owner} التلفزيونية. ويتحكم مسؤول المستخدمين في هذا الإعداد.","Use the established Arabic feature term and improve the role wording.",M)
setd(3165,"zh_Hant",R,"已為{owner}的電視節目請求關閉集數佇列。此設定由使用者管理員控制。","Use the established Traditional Chinese feature term.",M)
setd(3165,"vi",R,"Hàng đợi tập phim đã tắt đối với các yêu cầu TV của {owner}. Người quản lý người dùng kiểm soát cài đặt này.","Use sentence-case Vietnamese common nouns and the complete feature term.",M)
setd(3168,"ko",R,"에피소드 큐에서 재생을 Sonarr에 연결하려면 먼저 TVDB에서 이 시리즈와 일치하는 항목을 찾아야 합니다.","Use the established Korean feature term.",M)
setd(3168,"zh_Hant",R,"集數佇列必須先在 TVDB 中找到此影集，才能將播放狀態連結至 Sonarr。","Use the established Traditional Chinese feature term.",M)
setd(3168,"vi",R,"Hàng đợi tập phim cần tìm thấy phim bộ này trên TVDB trước khi có thể kết nối nội dung đang phát với Sonarr.","Use the complete Vietnamese feature term.",M)
setd(3170,"es",R,"El propietario de la solicitud debe vincular su cuenta de {mediaServer} antes de que la cola de episodios pueda ejecutarse.","Use sentence case for the translated common-noun feature term.",M)
setd(3170,"zh_Hans",R,"请求所有者必须先关联其 {mediaServer} 账户，剧集队列才能运行。","Use the established Simplified Chinese term instead of “episode queuing.”",M)
setd(3170,"de",C,"Der Anfragebesitzer muss sein {mediaServer}-Konto verknüpfen, bevor die Episodenwarteschlange ausgeführt werden kann.","Replace the inconsistent compound with the established German feature noun.")
setd(3170,"ar",R,"يجب على مالك الطلب ربط حساب {mediaServer} الخاص به قبل تشغيل قائمة انتظار الحلقات.","Use the established Arabic feature term.",M)
setd(3170,"zh_Hant",R,"請求擁有者必須先連結其 {mediaServer} 帳戶，集數佇列才能執行。","Use the established Traditional Chinese feature term.",M)
setd(3170,"vi",R,"Chủ sở hữu yêu cầu phải liên kết tài khoản {mediaServer} của họ trước khi hàng đợi tập phim có thể chạy.","Use sentence case for common nouns and the complete feature term.",M)
setd(3171,"ko",R,"에피소드 큐를 사용하려면 선택한 TV 품질을 요청할 권한이 있어야 합니다.","Use the established Korean feature term.",M)
setd(3171,"zh_Hant",R,"若要使用集數佇列，您必須有權請求所選的電視畫質。","Use the established Traditional Chinese feature term.",M)
setd(3171,"vi",R,"Bạn cần có quyền yêu cầu chất lượng TV đã chọn để sử dụng hàng đợi tập phim.","Use the complete Vietnamese feature term.",M)
setd(3172,"ko",R,"에피소드 큐를 사용하려면 Plex, Jellyfin 또는 Emby의 재생 추적이 필요합니다.","Use the established Korean feature term.",M)
setd(3172,"zh_Hant",R,"集數佇列需要 Plex、Jellyfin 或 Emby 的播放追蹤功能。","Use the established Traditional Chinese feature term.",M)
setd(3172,"vi",R,"Hàng đợi tập phim cần có tính năng theo dõi nội dung đang phát từ Plex, Jellyfin hoặc Emby.","Use the complete Vietnamese feature term.",M)
setd(3173,"es",R,"Elige o configura un servidor Sonarr para la calidad de TV seleccionada y así poder usar la cola de episodios.","Make the purpose relationship explicit rather than implying a separate “use” action.",M)
setd(3173,"ar",C,"اختر خادم Sonarr أو اضبطه لجودة التلفاز المحددة لاستخدام قائمة انتظار الحلقات.","The current verb means reconfigure; the source asks users to choose or configure a server.")
setd(3173,"ko",R,"에피소드 큐를 사용하려면 선택한 TV 품질에 사용할 Sonarr 서버를 선택하거나 구성하세요.","Use the established Korean feature term.",M)
setd(3173,"zh_Hant",R,"若要使用集數佇列，請為所選的電視畫質選擇或設定 Sonarr 伺服器。","Use the established Traditional Chinese feature term.",M)
setd(3173,"vi",R,"Hãy chọn hoặc cấu hình máy chủ Sonarr cho chất lượng TV đã chọn để sử dụng hàng đợi tập phim.","Use the complete Vietnamese feature term.",M)
setd(3176,"zh_Hans",C,"架构：{value}","The current term means general structure and uses awkward spaced punctuation; use the technical term and Chinese colon.")
setd(3176,"hi",R,"आर्किटेक्चर: {value}","Use the technical computing loanword instead of the building-design term.",M)
setd(3176,"ja",C,"アーキテクチャ: {value}","The current 建築 means building architecture; use the standard computing term.")
setd(3176,"ar",R,"المعمارية: {value}","Use the technical computing term rather than general structure.",M)
setd(3176,"ko",C,"아키텍처: {value}","The current word means architectural craft/building design; use the standard computing term.")
setd(3176,"zh_Hant",C,"架構：{value}","The current 建築 means building architecture and has awkward punctuation; use the technical term.")
assert len(spec)==73,("explicit decision count",len(spec))
# Source boundary and all direct-locale catalog pins.
ctx={}; source_paths={}
for pos,sid in zip(positions,ids):
 group,name=sid.rsplit(".",1)
 path=("src/components/RequestModal/TvRequestModal.tsx" if group=="components.RequestModal" else "src/components/RequestStatus/SoftwareRequests.tsx")
 source_paths[sid]=path
 lines=show(path).decode("utf-8").splitlines(); hits=[]
 for n,line in enumerate(lines,1):
  stripped=line.strip()
  if stripped.startswith(name+":") or re.search(rf"\bmessages\.{re.escape(name)}\b",line):
   text=line.strip(); hits.append({"blob":blob(path),"line":n,"lineText":text,"lineSha256":sha(text),"path":path})
 assert hits,sid
 ctx[sid]={"messageGroup":group,"sourceId":sid,"sourcePosition":pos,"callerLines":hits,"callerLineCount":len(hits),"callerContextSha256":jhash(hits)}
source_catalog_blob=blob("src/i18n/locale/en.json")
locale_blobs={l:blob(f"src/i18n/locale/{l}.json") for l in LOCALES}
cells=[]; decisions=[]; proposals=[]
placeholder_re=re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
markup_re=re.compile(r"</?([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>")
for pos,sid in zip(positions,ids):
 source=en[sid]; placeholders=sorted(set(placeholder_re.findall(source))); markup=sorted(set(markup_re.findall(source)))
 for loc in LOCALES:
  cur=catalogs[loc][sid]; plan=spec.get((pos,loc))
  if plan: disposition,target,rationale,confidence=plan
  else:
   disposition,target="accept-current",cur
   rationale="The current target preserves the source meaning in its exact caller context; no clear semantic defect was found, and placeholders and markup are intact."
   confidence="moderate"
  assert placeholders==sorted(set(placeholder_re.findall(target))),(sid,loc)
  assert markup==sorted(set(markup_re.findall(target))),(sid,loc)
  ch=sha(cur); th=sha(target)
  cells.append({"position":pos,"sourceId":sid,"source":source,"sourceTextSha256":sha(source),"sourceFile":"src/i18n/locale/en.json","locale":loc,"localeFile":f"src/i18n/locale/{loc}.json","currentTarget":cur,"currentTargetSha256":ch})
  c=ctx[sid]
  row={"repository":REPO,"pullRequest":418,"exactHead":HEAD,"exactTree":TREE,"sourceId":sid,"sourcePosition":pos,"source":source,"sourceTextSha256":sha(source),"sourceFile":"src/i18n/locale/en.json","sourceCatalogBlob":source_catalog_blob,"sourcePlaceholders":placeholders,"sourceMarkup":markup,"locale":loc,"localeFile":f"src/i18n/locale/{loc}.json","localeCatalogBlob":locale_blobs[loc],"currentTarget":cur,"currentTargetSha256":ch,"disposition":disposition,"finalTarget":target,"finalTargetSha256":th,"finalPlaceholders":sorted(set(placeholder_re.findall(target))),"finalMarkup":sorted(set(markup_re.findall(target))),"rationale":rationale,"confidence":confidence,"callerLines":c["callerLines"],"callerLineCount":c["callerLineCount"],"callerContextSha256":c["callerContextSha256"]}
  decisions.append(row)
  if disposition in {C,R}: proposals.append({"sourcePosition":pos,"sourceId":sid,"locale":loc,"currentTarget":cur,"currentTargetSha256":ch,"disposition":disposition,"proposedTarget":target,"proposedTargetSha256":th,"rationale":rationale,"confidence":confidence})
from collections import Counter
counts=dict(Counter(x["disposition"] for x in decisions))
assert len(cells)==len(decisions)==240 and sum(counts.values())==240
assert len(proposals)==len(spec)==73
catalog_counts={"en":len(en),**{l:len(catalogs[l]) for l in LOCALES}}
assert all(v==9494 for v in catalog_counts.values())
caller_count=sum(c["callerLineCount"] for c in ctx.values())
summary={"repository":REPO,"pullRequest":418,"exactHead":HEAD,"exactTree":TREE,"window":[3160,3179],"cells":240,"sourceOrderCount":9494,"catalogKeyCounts":catalog_counts,"allLocaleKeysetsMatchEnglish":True,"callerIdsWithTargetedReferences":20,"callerLineCount":caller_count,"sourceAndCurrentCellsReattestedAgainstNewHead":240,"sourceCurrentHashMismatches":0,"placeholderMismatches":0,"markupMismatches":0,"dispositions":counts,"candidateCells":len(proposals),"nativeSpeakerApproval":False,"reviewType":"primary machine-assisted semantic review"}
per_id=[{"position":p,"id":sid,"source":en[sid],"sourceSha256":sha(en[sid])} for p,sid in zip(positions,ids)]
window={"repository":REPO,"pullRequest":418,"head":HEAD,"tree":TREE,"sourceOrderCount":9494,"range":[3160,3179],"sourceIds":per_id,"catalogKeyCounts":catalog_counts,"localeOrder":LOCALES,"callerSearchScope":"Exact message definitions and identifier-based use lines in TvRequestModal.tsx and SoftwareRequests.tsx; not a full dynamic call graph."}
boundaries={"repository":REPO,"pullRequest":418,"head":HEAD,"tree":TREE,"sourceOrderCount":9494,"range":[3160,3179],"previousRange":[3140,3159],"nextRange":[3180,3199],"startId":ids[0],"endId":ids[-1],"allIdsSequential":True,"selectionRule":"Zero-based lexicographic order of exact-head en.json message IDs.","callerSearchScope":window["callerSearchScope"]}
write_jsonl(OUT/"source-current-cells.jsonl",cells)
write_jsonl(OUT/"caller-contexts.jsonl",[ctx[sid] for sid in ids])
write_jsonl(OUT/"primary-decisions.jsonl",decisions)
write_json(OUT/"candidate-proposals.json",{"repository":REPO,"pullRequest":418,"exactHead":HEAD,"exactTree":TREE,"window":[3160,3179],"proposalCount":len(proposals),"proposals":proposals})
write_json(OUT/"window.json",window); write_json(OUT/"source-boundaries.json",boundaries); write_json(OUT/"summary.json",summary)
readme=f"""# SeerrNG PR #418 primary semantic review — W3160–W3179

This packet covers sorted source positions 3160–3179 (20 IDs, 240 locale cells)
at head {HEAD}, tree {TREE}. The source queue is the sorted exact-head en.json
key set (9,494 keys); W3140–W3159 is the previous window and W3180–W3199 is next.

Primary dispositions: {counts.get('accept-current',0)} accept-current,
{counts.get('correction',0)} corrections, {counts.get('refinement',0)}
refinements, {counts.get('hold',0)} holds. Proposed targets are pinned to the
current catalog and exact message call sites. All 12 locale catalogs have 9,494
keys and key sets equal to English. Source/current hashes and caller pins were
reattested at this PR head; placeholder and markup checks report no mismatches.

This machine-assisted primary review does not establish native-speaker approval.
No repository or PR files were changed; no tests, builds, scans, CI, or browser
actions were run.
"""
(OUT/"README.md").write_text(readme,encoding="utf-8")
manifest={"repository":REPO,"pullRequest":418,"head":HEAD,"tree":TREE,"window":[3160,3179],"sourceOrderCount":9494,"catalogKeyCounts":catalog_counts,"sourceCatalogBlob":source_catalog_blob,"localeCatalogBlobs":locale_blobs,"cellCount":240,"callerIdCount":20,"callerLineCount":caller_count,"dispositions":counts,"candidateCells":len(proposals),"nativeSpeakerApproval":False}
write_json(OUT/"manifest.json",manifest)
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt")
(OUT/"SHA256SUMS.txt").write_text("".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in files),encoding="utf-8")
print(json.dumps({"path":str(OUT),"head":HEAD,"tree":TREE,"window":[3160,3179],"ids":len(ids),"cells":len(decisions),"callerLines":caller_count,"dispositions":counts,"candidates":len(proposals),"catalogKeys":catalog_counts},ensure_ascii=False,indent=2))
