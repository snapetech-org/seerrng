#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

TASK=Path(__file__).resolve().parent
I=TASK/"input/candidate-free-input"
O=TASK/"blind-review"
REPO=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3700-3719-apply-20261103/repo")
HEAD="1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e"
TREE="6a51f3fb1d1f65c12bfe82bf47834626aa364488"
BRANCH="codex/seerrng-localization-overhaul-20261028"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
NAMED=["Kapowarr","GetComics","Prowlarr","SeerrNG","FlareSolverr","Cloudflare","URL","API","SSL","IP"]

def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode("utf-8")).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def dump(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def dumpjl(p,rs): p.write_text("".join(json.dumps(r,ensure_ascii=False,separators=(",",":"))+"\n" for r in rs),encoding="utf-8")
def git(*args): return subprocess.check_output(["git","-C",str(REPO),*args],text=True).strip()
def blob(p): return subprocess.check_output(["git","-C",str(REPO),"hash-object",str(p)],text=True).strip()
def ph(s): return re.findall(r"\{[^{}]+\}",s)
def markup(s): return re.findall(r"</?[A-Za-z][^>]*>",s)
def numbers(s): return re.findall(r"(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?![A-Za-z0-9])",s)
def run(cmd): return subprocess.check_output(cmd,text=True).strip()
def require(ok,msg):
    if not ok: raise SystemExit("FAIL: "+msg)

if O.exists() and any(O.iterdir()): raise SystemExit("refusing to overwrite blind-review output")
if not I.is_dir(): raise SystemExit("candidate-free input copy missing")
subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=I,check=True,capture_output=True,text=True)
M=j(I/"manifest.json"); W=j(I/"window.json")
require(M["packetType"]=="candidate-free-input" and M["window"]=="W3720-W3739","candidate-free packet identity")
require((M["head"],M["tree"],M["range"],M["sourceRecordCount"],M["cellCount"])==(HEAD,TREE,[3720,3739],20,240),"candidate-free pins")

def check_live():
    h=git("rev-parse","HEAD"); t=git("rev-parse","HEAD^{tree}"); st=git("status","--porcelain=v1")
    require((h,t,st)==(HEAD,TREE,""),"clean exact-head checkout")
    pr=json.loads(run(["gh","api","repos/snapetech-org/seerrng/pulls/418"]))
    require(pr["state"]=="open" and pr["draft"] is True and pr["head"]["sha"]==HEAD and pr["head"]["ref"]==BRANCH and pr["head"]["repo"]["full_name"]=="snapetech-org/seerrng","live PR state/head")
    refs=subprocess.check_output(["git","-C",str(REPO),"ls-remote","origin",f"refs/heads/{BRANCH}","refs/pull/418/head"],text=True).splitlines()
    rm={x.split()[1]:x.split()[0] for x in refs}
    require(rm.get(f"refs/heads/{BRANCH}")==HEAD and rm.get("refs/pull/418/head")==HEAD,"live branch/pull refs")
    return pr,rm
pr,rm=check_live()
# Verify every source/catalog/runtime blob pin against the live checkout.
pins=j(I/"file-pins.json"); file_pin_rows=[]; catalogs={}
require((pins["head"],pins["tree"],pins["repository"],pins["pullRequest"])==(HEAD,TREE,"snapetech-org/seerrng",418),"file pin header")
for group in ("catalogFiles","runtimeFiles"):
    for rel,pin in pins[group].items():
        p=REPO/rel; raw=p.read_bytes(); digest=sha(raw); git_blob=blob(p)
        require((digest,git_blob,len(raw))==(pin["sha256"],pin["gitBlob"],pin["byteCount"]),"live file pin "+rel)
        if group=="catalogFiles": catalogs[rel]=json.loads(raw)
        file_pin_rows.append({"group":group,"path":rel,"declaredSha256":pin["sha256"],"currentSha256":digest,"declaredGitBlob":pin["gitBlob"],"currentGitBlob":git_blob,"byteCount":len(raw),"lineCount":pin.get("lineCount"),"unchanged":True})
# Recompute the exact English key queue, prior prefix, selected IDs, and both boundaries.
en=catalogs["src/i18n/locale/en.json"]; keys=list(en)
require(len(keys)==9494 and sha("\n".join(keys))==W["sourceOrderSha256"]==M["sourceOrderSha256"],"English source order hash/count")
exclude=jl(I/"prior-selection-exclusions.jsonl")
require(len(exclude)==3720 and [r["position"] for r in exclude]==list(range(3720)),"prior selected ID position sequence")
prior_ids=[r["sourceId"] for r in exclude]
require(prior_ids==keys[:3720] and sha("\n".join(prior_ids))==W["priorSelectedSourceIdPrefixSha256"]==M["priorSelectedSourceIdPrefixSha256"],"prior source ID prefix")
source_rows=jl(I/"source-cells.jsonl")
require(len(source_rows)==20 and [r["position"] for r in source_rows]==list(range(3720,3740)),"current source positions")
require([r["sourceId"] for r in source_rows]==keys[3720:3740] and sha("\n".join(r["sourceId"] for r in source_rows))==W["selectedSourceIdOrderSha256"],"current source ID order")
order_rows=jl(I/"source-order.jsonl")
require(len(order_rows)==22 and [r["sourceId"] for r in order_rows]==keys[3719:3741],"prior/current/next source boundaries")
require((order_rows[0]["position"],order_rows[0]["boundaryKind"])==(3719,"previous") and (order_rows[-1]["position"],order_rows[-1]["boundaryKind"])==(3740,"next"),"boundary labels")
require((W["previousBoundary"]["sourceId"],W["nextBoundary"]["sourceId"])==(keys[3719],keys[3740]),"window boundary metadata")
# Verify exact source definitions, caller lines, context blocks, and all 240 current values.
sources_by_id={r["sourceId"]:r for r in source_rows}; contexts=jl(I/"caller-contexts.jsonl"); blocks=jl(I/"caller-context-blocks.jsonl")
require(len(contexts)==20 and len(blocks)==41,"caller/source evidence counts")
ctx_by_id={r["sourceId"]:r for r in contexts}; block_by_id={r["contextId"]:r for r in blocks}
for src in source_rows:
    require(en[src["sourceId"]]==src["source"] and sha(src["source"])==src["sourceSha256"],"English source preimage "+src["sourceId"])
for c in contexts:
    require(c["sourceId"] in sources_by_id and c["callerCount"]>0,"all selected sources have callers "+c["sourceId"])
    require(all(b in block_by_id for b in c["contextBlockIds"]),"caller block references "+c["sourceId"])
for b in blocks:
    entries=b.get("lines",b.get("references",[]))
    for line in entries:
        p=REPO/line.get("path",b.get("path")); lines=p.read_text(encoding="utf-8").splitlines()
        require(1<=line["line"]<=len(lines),"caller line range "+b["contextId"])
        text=lines[line["line"]-1]
        require(text==line["text"] and sha(text)==line["lineSha256"],"caller line hash/text "+b["contextId"])
cells=jl(I/"current-target-cells.jsonl")
require(len(cells)==240 and {r["locale"] for r in cells}==set(LOCALES),"current target cell coverage")
locale_path={loc:f"src/i18n/locale/{loc}.json" for loc in LOCALES}
for loc,path in locale_path.items(): require(path in catalogs,"pinned locale catalog "+loc)
cell_by_key={(r["position"],r["locale"]):r for r in cells}
require(len(cell_by_key)==240,"unique current target cells")
for c in cells:
    require((c["head"],c["tree"],c["pullRequest"],c["repository"])==(HEAD,TREE,418,"snapetech-org/seerrng"),"cell head pin")
    require(c["sourceId"] in sources_by_id and c["source"]==sources_by_id[c["sourceId"]]["source"],"cell source pin")
    require(catalogs[c["catalogPath"]][c["sourceId"]]==c["currentTarget"],"live current target text")
    require(sha(c["currentTarget"])==c["currentTargetSha256"],"live current target hash")
    require((c["catalogSha256"],c["catalogGitBlob"])==(pins["catalogFiles"][c["catalogPath"]]["sha256"],pins["catalogFiles"][c["catalogPath"]]["gitBlob"]),"cell catalog file pin")
    require(c["reviewStatus"]=="unreviewed","candidate-free target state")
# Reattest every applied W3700-W3719 cell and every carried callerless hold.
prior_selection=jl(I/"lineage/prior-window-selection-reattestation.jsonl")
require(len(prior_selection)==240,"prior applied selection count")
prior_catalogs={loc:catalogs[locale_path[loc]] for loc in LOCALES}
selection_reattest=[]
for old in prior_selection:
    loc=old["locale"]; sid=old["sourceId"]
    current=prior_catalogs[loc].get(sid)
    require(current is not None and sha(current)==old["previousAppliedTargetSha256"]==old["currentTargetSha256"] and old["matches"] is True,"prior applied target reattestation "+sid+" "+loc)
    selection_reattest.append({"position":old["position"],"sourceId":sid,"sourceSha256":old["sourceSha256"],"locale":loc,"previousWindow":old["previousAppliedWindow"],"previousDisposition":old["previousDisposition"],"previousAppliedTargetSha256":old["previousAppliedTargetSha256"],"currentTargetSha256":sha(current),"currentHead":HEAD,"currentTree":TREE,"matches":True})
hold_hashes=jl(I/"carry-forward-hold-hashes.jsonl"); hold_app=jl(I/"lineage/prior-hold-application-reattestation.jsonl")
require(len(hold_hashes)==len(hold_app)==12,"carried hold lineage count")
hold_reattest=[]
for old,app in zip(hold_hashes,hold_app):
    require((old["position"],old["sourceId"],old["locale"],old["priorTargetSha256"])==(app["position"],app["sourceId"],app["locale"],app["previousApplicationTargetSha256"]),"hold lineage row alignment")
    current=prior_catalogs[old["locale"]].get(old["sourceId"])
    require(current is not None and sha(current)==old["priorTargetSha256"]==old["previousApplicationTargetSha256"]==old["currentTargetSha256"]==app["currentTargetSha256"],"carried hold target reattestation "+old["locale"])
    require(old["callerless"] and app["callerless"] and old["retained"] and app["retained"] and old["targetTextIncluded"] is False,"carried hold protection")
    hold_reattest.append({"originWindow":old["originWindow"],"carriedViaWindow":old["carriedViaWindow"],"position":old["position"],"sourceId":old["sourceId"],"sourceSha256":old["sourceSha256"],"locale":old["locale"],"priorTargetSha256":old["priorTargetSha256"],"previousApplicationTargetSha256":old["previousApplicationTargetSha256"],"currentTargetSha256":sha(current),"callerless":True,"retained":True,"currentHead":HEAD,"currentTree":TREE,"matches":True})
# Baseline token audit.
baseline=Counter()
for c in cells:
    baseline["placeholder"]+=int(c["placeholderTokenMismatch"])
    baseline["placeholderSequence"]+=int(c["placeholderTokenSequenceMismatch"])
    baseline["icuPluralCategory"]+=int(c["icuPluralCategorySetDifference"])
    baseline["markup"]+=int(c["markupTokenMismatch"])
    baseline["numeric"]+=int(c["numericTokenMismatch"])
    baseline["protectedLiteral"]+=int(c["protectedLiteralMismatch"])
expected_baseline={"placeholder":0,"placeholderSequence":0,"icuPluralCategory":0,"markup":0,"numeric":0,"protectedLiteral":1}
require(dict(baseline)==expected_baseline,"candidate-free baseline token diagnostics")
# Independent semantic decisions, keyed only by source position and locale.
D={}
def add(pos, targets, disposition, rationale, confidence="high"):
    for loc,target in targets.items():
        key=(pos,loc)
        require(key not in D,"duplicate decision "+str(key))
        D[key]={"disposition":disposition,"target":target,"rationale":rationale,"confidence":confidence}
add(3720,{"es":"Tras aprobarse una solicitud, compruebe automáticamente las fuentes de GetComics y los sitios espejo de Kapowarr. Kapowarr no usa indexadores de Prowlarr; SeerrNG ofrece una búsqueda manual independiente en Prowlarr a los usuarios con el permiso «Gestionar Solicitudes».","zh_Hans":"请求获批后，自动检查 Kapowarr 的 GetComics 和镜像源。Kapowarr 不使用 Prowlarr 索引器；SeerrNG 为拥有“请求管理”权限的用户提供单独的手动 Prowlarr 搜索。","hi":"अनुरोध स्वीकृत होने के बाद, Kapowarr के GetComics और मिरर स्रोतों की स्वचालित जाँच करें। Kapowarr, Prowlarr इंडेक्सरों का उपयोग नहीं करता; SeerrNG में “अनुरोध प्रबंधित करें” अनुमति वाले उपयोगकर्ताओं के लिए अलग मैन्युअल Prowlarr खोज उपलब्ध है।","fr":"Après l’approbation d’une demande, vérifiez automatiquement les sources GetComics et les sites miroirs de Kapowarr. Kapowarr n’utilise pas les indexeurs Prowlarr ; SeerrNG propose une recherche manuelle distincte dans Prowlarr aux utilisateurs disposant de l’autorisation « Gérer les demandes ».","pt_BR":"Após a aprovação de uma solicitação, verifique automaticamente as fontes do GetComics e os sites espelho do Kapowarr. O Kapowarr não usa indexadores do Prowlarr; o SeerrNG oferece uma busca manual separada no Prowlarr aos usuários com a permissão “Gerenciar Solicitações”.","ko":"요청이 승인되면 Kapowarr의 GetComics 및 미러 소스를 자동으로 확인합니다. Kapowarr는 Prowlarr 인덱서를 사용하지 않습니다. SeerrNG는 ‘요청 관리’ 권한이 있는 사용자를 위한 별도의 수동 Prowlarr 검색을 제공합니다.","vi":"Tự động kiểm tra các nguồn GetComics và trang mirror của Kapowarr sau khi yêu cầu được phê duyệt. Kapowarr không dùng bộ lập chỉ mục Prowlarr; SeerrNG cung cấp tính năng tìm kiếm Prowlarr thủ công riêng cho người dùng có quyền “Quản lý yêu cầu”.","id":"Setelah permintaan disetujui, periksa secara otomatis sumber GetComics dan situs mirror Kapowarr. Kapowarr tidak menggunakan pengindeks Prowlarr; SeerrNG menyediakan pencarian Prowlarr manual terpisah bagi pengguna dengan izin “Kelola Permintaan”."},"correction","The Kapowarr help text distinguishes automatic GetComics/mirror checks after approval from Prowlarr indexers and SeerrNG’s separate manual search. Correct broken source ordering or explicitly name the localized Manage Requests permission where the current fragment is unclear.","moderate")
add(3720,{"de":"Prüfen Sie nach der Genehmigung einer Anfrage automatisch Kapowarrs GetComics- und Spiegelquellen. Kapowarr verwendet keine Prowlarr-Indexer. SeerrNG bietet eine separate manuelle Prowlarr-Suche für Nutzer mit der Berechtigung „Anfragen verwalten“.","ja":"リクエストが承認された後、Kapowarr の GetComics とミラーソースを自動的に確認します。Kapowarr は Prowlarr インデクサーを使用しません。SeerrNG には、「リクエストを管理」権限を持つユーザー向けの別の手動 Prowlarr 検索があります。","ar":"بعد الموافقة على الطلب، تحقّق تلقائيًا من مصادر GetComics ومواقع المرايا في Kapowarr. لا يستخدم Kapowarr مفهرسات Prowlarr؛ ويوفّر SeerrNG بحثًا يدويًا منفصلًا في Prowlarr للمستخدمين الذين لديهم صلاحية «إدارة الطلبات»."},"refinement","The direct source definition confirms the Manage Requests permission label is localized. Use the exact localized permission name and make permission access explicit in the help text.","moderate")
add(3721,{"ar":"عنوان URL خارجي"},"correction","The source is the external URL field label. The current Arabic word order leaves “external” detached from URL; make it a natural Arabic noun phrase while preserving exact URL.","high")
add(3723,{"fr":"Kapowarr a besoin d’un conteneur FlareSolverr associé pour contourner la protection Cloudflare sur GetComics et ses hôtes miroirs. Configurez son URL dans Kapowarr même (Paramètres > Général), pas ici."},"correction","The settings note says FlareSolverr is paired with Kapowarr to get past Cloudflare on GetComics and mirror hosts. Replace the awkward literal “pass Cloudflare” with a clear bypass phrase; preserve product names and URL.","moderate")
add(3724,{"hi":"होस्टनाम या IP पता"},"correction","This required field accepts either a hostname or an IP address. Restore the protected exact IP literal omitted by the current Hindi translation.","high")
add(3726,{"ko":"Kapowarr 호스트/컨테이너의 폴더 경로입니다. 폴더가 아직 없으면 Kapowarr 호스트/컨테이너에서 생성합니다."},"correction","The caller describes a path on the Kapowarr host/container and says Kapowarr creates the folder if absent. The current Korean sentence has broken conditional/subject grammar; state the location and creation clearly.","moderate")
add(3728,{"ar":"اسم الخادم"},"correction","The pinned field label is Server Name. Current Arabic says only “name,” omitting that it is the server name.","high")
add(3730,{"id":"Aktifkan pemindaian"},"correction","This checkbox enables Kapowarr scanning. The current Indonesian “Aktifkan Pindai” pairs an imperative with a verb; use the noun for scanning.","high")
add(3730,{"vi":"Bật tính năng quét"},"refinement","The field enables the Kapowarr scan feature described by the neighboring help text. Add “feature” to make this short toggle label read naturally.","moderate")
add(3734,{"es":"¡La conexión con Kapowarr se estableció correctamente!"},"correction","The toast confirms that a test connection succeeded. Add the missing Spanish preposition and opening exclamation mark while keeping the success meaning.","high")
add(3735,{"zh_Hant":"您必須提供 API 金鑰"},"correction","The message is a required-field validation for an API key. The current zh-Hant cell contains Simplified Chinese characters and uses a less suitable key term; restore Traditional Chinese and preserve API.","high")
add(3737,{"hi":"URL के अंत में स्लैश (/) नहीं होना चाहिए।","ko":"URL은 끝에 슬래시(/)가 있으면 안 됩니다."},"correction","The validator rejects values ending in /. Current Hindi and Korean literalize “trailing slash” awkwardly; state the end condition directly and show the exact slash character.","high")
add(3737,{"pt_BR":"A URL não deve terminar com uma barra (/).","id":"URL tidak boleh diakhiri dengan garis miring."},"refinement","The exact validation checks URL.endsWith('/'). Make Portuguese concise and remove redundant “at the end” wording from Indonesian; both retain the slash constraint.","high")
add(3738,{"hi":"URL बेस की शुरुआत में स्लैश (/) होना चाहिए।","pt_BR":"A URL base deve começar com uma barra (/)."},"refinement","The validator checks startsWith('/'). Include the literal character so the field guidance tells users exactly which leading slash is required.","high")
add(3739,{"hi":"URL बेस के अंत में स्लैश (/) नहीं होना चाहिए।"},"correction","The validator rejects a URL base ending in /. The current Hindi uses an awkward transliteration of “trailing slash”; state the end condition directly and show the exact character.","high")
add(3739,{"pt_BR":"A URL base não deve terminar com uma barra (/)."},"refinement","This validation checks endsWith('/'). Remove redundant “no final” wording and show the exact slash character.","high")
WHY={
3720:"Direct caller renders this help paragraph in Kapowarr settings. It distinguishes GetComics/mirror checks after approval from Prowlarr indexers and the separate manual search for the localized Manage Requests permission.",
3721:"Direct caller is the external-URL form label.",
3722:"Direct caller is the help text for clickable external links when the host cannot be reached outside the network.",
3723:"Direct caller renders the FlareSolverr compatibility note above Kapowarr fields and tells the user where to configure its URL.",
3724:"Direct caller is the required Hostname or IP Address label.",
3725:"Direct caller is the required port field label.",
3726:"Direct caller explains the Root Folder path is on the Kapowarr host/container and is created if absent.",
3727:"Direct caller is the required Root Folder label.",
3728:"Direct caller is the required Server Name field label.",
3729:"Direct caller is the SSL checkbox label.",
3730:"Direct caller is the Enable Scan checkbox; adjacent help explains Kapowarr scanning.",
3731:"Direct caller explains the scan prevents requests for comics that are already available.",
3732:"Direct caller is an error toast if saving the Kapowarr server fails.",
3733:"Direct caller is an error toast if the Kapowarr connection test fails.",
3734:"Direct caller is a success toast after Kapowarr connection validation succeeds.",
3735:"Direct caller is the Yup validation message when the API Key field is empty.",
3736:"Direct caller is the Yup validation message when the application URL is invalid.",
3737:"Direct caller rejects application URLs ending in '/'.",
3738:"Direct caller requires URL Base to start with '/'.",
3739:"Direct caller rejects URL Base values ending in '/'."
}
rows=[]; counts=Counter(); baseline=Counter(); final=Counter(); named_failures=0
permission_labels={loc:catalogs[locale_path[loc]]["components.PermissionEdit.managerequests"] for loc in LOCALES}
for c in cells:
    pos,loc=c["position"],c["locale"]
    d=D.get((pos,loc),{"disposition":"accept-current","target":None,"rationale":WHY[pos],"confidence":"high"})
    disposition=d["disposition"]
    selected=d["target"] if disposition in ("correction","refinement") else c["currentTarget"]
    require(disposition in ("accept-current","correction","refinement"),"invalid disposition")
    require(disposition=="accept-current" or (selected and selected!=c["currentTarget"]),f"proposal no-op {pos} {loc}")
    source=c["source"]
    src_ph=ph(source); cur_ph=ph(c["currentTarget"]); sel_ph=ph(selected)
    src_markup=markup(source); cur_markup=markup(c["currentTarget"]); sel_markup=markup(selected)
    src_nums=numbers(source); cur_nums=numbers(c["currentTarget"]); sel_nums=numbers(selected)
    src_prot=c["sourceProtectedLiterals"]
    src_icu=c["sourceIcuPluralCategories"]; cur_icu=c["currentTargetIcuPluralCategories"]
    require(not src_icu and not cur_icu,"unexpected ICU plural structure requires manual review")
    token_checks={"placeholdersPreserved":src_ph==sel_ph,"placeholderSequencePreserved":src_ph==sel_ph,"icuPluralCategoriesPreserved":src_icu==cur_icu,"markupPreserved":src_markup==sel_markup,"numericTokensPreserved":src_nums==sel_nums,"protectedLiteralsPreserved":all(x in selected for x in src_prot)}
    require(all(token_checks.values()),f"selected token mismatch {pos} {loc}: {token_checks}")
    named=[x for x in NAMED if x in source]
    named_ok=all(x in selected for x in named)
    require(named_ok,f"named literal missing {pos} {loc}: {[x for x in named if x not in selected]}")
    localized_permission=permission_labels[loc] if pos==3720 else None
    if localized_permission: require(localized_permission in selected,"localized Manage Requests label missing "+loc)
    baseline["placeholder"]+=int(src_ph!=cur_ph)
    baseline["markup"]+=int(src_markup!=cur_markup)
    baseline["numeric"]+=int(src_nums!=cur_nums)
    baseline["protectedLiteral"]+=int(not all(x in c["currentTarget"] for x in src_prot))
    final["placeholder"]+=int(src_ph!=sel_ph)
    final["markup"]+=int(src_markup!=sel_markup)
    final["numeric"]+=int(src_nums!=sel_nums)
    final["protectedLiteral"]+=int(not all(x in selected for x in src_prot))
    named_failures+=int(not named_ok); counts[disposition]+=1
    cx=ctx_by_id[c["sourceId"]]
    row={"schema":"seerrng-blind-cell-review/v1","repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3720-W3739","head":HEAD,"tree":TREE,"position":pos,"sourceId":c["sourceId"],"sourceIdSha256":c["sourceIdSha256"],"source":source,"sourceSha256":c["sourceSha256"],"locale":loc,"localeTag":c["localeTag"],"catalogPath":c["catalogPath"],"catalogFileSha256":c["catalogSha256"],"catalogGitBlob":c["catalogGitBlob"],"currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],"callerContextBlockIds":cx["contextBlockIds"],"callerResolution":cx["callerResolution"],"callerCount":cx["callerCount"],"directMessageReferences":cx["directMessageReferences"],"dynamicLabelMappings":cx["dynamicLabelMappings"],"dynamicRendererReferences":cx["dynamicRendererReferences"],"containsCandidate":False,"verdict":None,"disposition":disposition,"rationale":d["rationale"],"confidence":d["confidence"],"selectedTarget":selected,"selectedTargetSha256":sha(selected),"tokenAudit":{"source":{"placeholders":src_ph,"icuPluralCategories":src_icu,"markup":src_markup,"numeric":src_nums,"protectedLiterals":src_prot},"current":{"placeholders":cur_ph,"icuPluralCategories":cur_icu,"markup":cur_markup,"numeric":cur_nums,"protectedLiterals":c["currentTargetProtectedLiterals"]},"selected":{"placeholders":sel_ph,"icuPluralCategories":src_icu,"markup":sel_markup,"numeric":sel_nums,"protectedLiterals":[x for x in src_prot if x in selected]},"checks":token_checks},"namedLiteralAudit":{"sourceTerms":named,"preserved":named_ok,"localizedManageRequestsLabel":localized_permission,"localizedPermissionLabelPresent":localized_permission in selected if localized_permission else None}}
    if disposition in ("correction","refinement"): row["proposedTarget"]=selected
    rows.append(row)
require(len(rows)==240 and len({(r["position"],r["locale"]) for r in rows})==240,"blind ledger size/uniqueness")
require(set(D)=={(r["position"],r["locale"]) for r in rows if r["disposition"]!="accept-current"},"decision map coverage")
require(dict(baseline)=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1},"baseline mismatch recheck")
require(not any(final.values()) and named_failures==0,"selected token/named-literal audit")
pr2,rm2=check_live()
require(rm==rm2,"live refs changed during review")
O.mkdir(parents=True,exist_ok=True)
dumpjl(O/"blind-ledger.jsonl",rows)
dumpjl(O/"file-pin-reattestation.jsonl",file_pin_rows)
dumpjl(O/"prior-window-selection-reattestation.jsonl",selection_reattest)
dumpjl(O/"carry-forward-hold-reattestation.jsonl",hold_reattest)
dump(O/"live-head-reattestation.json",{"repository":"snapetech-org/seerrng","pullRequest":418,"state":"OPEN","draft":True,"branch":BRANCH,"head":HEAD,"tree":TREE,"branchRef":rm2[f"refs/heads/{BRANCH}"],"pullRef":rm2["refs/pull/418/head"],"baseRef":pr2["base"]["ref"],"baseSha":pr2["base"]["sha"],"checkoutClean":True,"attestedAtUTC":datetime.now(timezone.utc).isoformat(),"candidateInputHead":M["head"],"candidateInputTree":M["tree"]})
dump(O/"input-verification.json",{"pass":True,"inputManifestSha256":sha((I/"manifest.json").read_bytes()),"inputChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),"candidateFreeInput":True,"primaryOrSummaryOutputAccessed":False,"sourceCount":20,"cellCount":240,"pinnedFilesReattested":len(file_pin_rows),"callerContextBlocksReattested":len(blocks),"priorSelectedIDsReattested":len(prior_ids),"priorWindowCellsReattested":len(selection_reattest),"carriedHoldsReattested":len(hold_reattest),"queueStart":3720,"queueEnd":3739,"nextBoundaryPosition":3740,"nextBoundarySourceId":keys[3740]})
summary={"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3720-W3739","head":HEAD,"tree":TREE,"sourceCount":20,"localeCount":12,"cellCount":240,"dispositionCounts":dict(counts),"correctionCount":counts["correction"],"refinementCount":counts["refinement"],"acceptCurrentCount":counts["accept-current"],"holdCount":0,"selectedTargetChanges":counts["correction"]+counts["refinement"],"baselineTokenMismatches":dict(baseline),"selectedTokenMismatches":dict(final),"baselineProtectedLiteralGap":{"position":3724,"locale":"hi","literal":"IP","repaired":True},"namedLiteralFailures":named_failures,"callerlessCurrentSourcePositions":[],"priorWindowCellsReattested":240,"priorWindowCellsUnchanged":True,"carriedCallerlessHoldsReattested":12,"carriedHoldsUnchanged":True,"priorSelectedSourceIdsReattested":3720,"nextBoundary":{"position":3740,"sourceId":keys[3740]},"candidateFreeInputVerified":True,"primaryOrSummaryOutputAccessed":False,"crossAuditOutputAccessed":False,"repositoryOrPRFilesEdited":False,"nativeSpeakerReview":"not performed","browserReview":"not performed"}
dump(O/"summary.json",summary)
readme="# SeerrNG PR #418 W3720–W3739 independent blind review\n\n"
readme+=f"This independent blind review covers 240 cells (20 source strings × 12 locales) at exact open/draft PR head {HEAD} / tree {TREE}. The next deterministic source-order window is positions 3720–3739; position 3740 is the next boundary.\n\n"
readme+=f"Dispositions: {counts['accept-current']} accept-current, {counts['correction']} corrections, {counts['refinement']} refinements, and 0 holds. The baseline protected-literal omission is corrected: Hindi at position 3724 now preserves the exact IP literal. Placeholder, ICU plural, markup, numeric, protected-literal, and named-product-literal checks pass at all selected targets.\n\n"
readme+="All 240 W3700–W3719 applied cells were independently reattested by current catalog hash. All twelve position-3632 callerless holds remain unchanged and were reattested. The candidate-free packet contains 3,720 prior source IDs; its complete prefix, selected IDs, source order, previous boundary, and next boundary were checked against the pinned English catalog. All 42 catalog/runtime file pins and all 41 caller-context blocks match the exact-head checkout.\n\n"
readme+="This packet was built only from the sealed candidate-free input, exact-head source/catalog/caller data, and current application catalogs needed for hash reattestation. No Seerr primary or summary ledger was opened. No repository or PR files were changed. Native-speaker and browser review were not performed.\n\nRun python3 verify_blind_review.py in this folder to verify the packet and live refs.\n"
(O/"README.md").write_text(readme,encoding="utf-8")
manifest={"schemaVersion":1,"artifact":"SeerrNG PR #418 W3720-W3739 independent blind review","sealed":False,"reviewType":"blind-semantic","repository":"snapetech-org/seerrng","pullRequest":418,"branch":BRANCH,"window":"W3720-W3739","head":HEAD,"tree":TREE,"sourceCount":20,"localeCount":12,"cellCount":240,"candidateFreeInputPath":"../input/candidate-free-input","inputManifestSha256":sha((I/"manifest.json").read_bytes()),"inputChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),"dispositionCounts":dict(counts),"selectedTargetChanges":counts["correction"]+counts["refinement"],"priorWindowCellsReattested":240,"carriedCallerlessHoldsReattested":12,"priorSelectedSourceIdsReattested":3720,"pinnedFilesReattested":len(file_pin_rows),"callerContextBlocksReattested":len(blocks),"primaryOrSummaryOutputAccessed":False,"crossAuditOutputAccessed":False,"nativeSpeakerReview":"not performed","browserReview":"not performed","files":[]}
dump(O/"manifest.json",manifest)
print(json.dumps({"built":True,"head":HEAD,"tree":TREE,"sources":20,"cells":240,"dispositions":dict(counts),"changes":counts["correction"]+counts["refinement"],"baselineTokenMismatches":dict(baseline),"selectedTokenMismatches":dict(final),"priorCellsReattested":len(selection_reattest),"carriedHoldsReattested":len(hold_reattest),"pinnedFilesReattested":len(file_pin_rows),"callerBlocksReattested":len(blocks),"nextBoundary":{"position":3740,"sourceId":keys[3740]}},ensure_ascii=False,indent=2))
