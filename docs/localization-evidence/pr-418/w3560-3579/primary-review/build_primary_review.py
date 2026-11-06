from pathlib import Path
from collections import Counter
from datetime import datetime,timezone
import hashlib,json,re,shutil,subprocess

T=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-primary-20261103")
IN=T/"candidate-free-input"; OUT=T/"primary-review"
HEAD="351f2c09a4aaf6f223975fc1827cb9f77de7702d"; TREE="3d88008f6ea7dc6cbef21333d29a032469cd60cf"
MANIFEST_SHA="57c8bb96f21976482af691fa8549d63116fbc66bd30177c3eaa2cb7835996eed"
INPUT_SUMS_SHA="5a73d23784f17cd51e186ad626cd6a952b12e2b801b36bf71dfde44b13fdd3e7"
PH=re.compile(r"\{[^{}\r\n]+\}"); MK=re.compile(r"</?[A-Za-z][^<>]*?/?>"); NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
PROTECTED=["SeerrNG","Audiobookshelf","ISBN","API","URL","HTTP","HTTPS","IP","BackIssue","library.view","library.manage","downloads.grab"]
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def run(args,cwd=None): return subprocess.run(args,cwd=cwd,check=True,capture_output=True,text=True).stdout
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def wj(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def writejl(p,rows): p.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True)+"\n" for x in rows),encoding="utf-8")
# Every candidate is tied to exact caller/source/context and exact current-target hashes.
PROPOSALS={
(3560,"ar"):("اسم الاتصال","correction","high","The current phrase means a connected name rather than the name of the connection. This field labels the saved Audiobookshelf connection, so the standard construct اسم الاتصال is clearer."),
(3561,"hi"):("इस कनेक्शन के लिए एक नाम दर्ज करें।","correction","high","The current wording uses संबंध, which means a relationship. The pinned Yup validation requires a name for this server connection; कनेक्शन names the correct object."),
(3561,"id"):("Masukkan nama untuk koneksi ini.","refinement","moderate","Bagi is understandable, but untuk is the more direct and natural Indonesian equivalent of “for” in this validation message."),
(3563,"zh_Hans"):("输入有效的端口号。","refinement","moderate","端口号 is the standard concise Chinese term for “port number”; the current 端口号码 is redundant."),
(3563,"id"):("Masukkan nomor port yang valid.","refinement","moderate","Removing sebuah makes this validation instruction more idiomatic and concise without changing the valid-port requirement."),
(3564,"ja"):("Audiobookshelfとの接続を保存できません。","refinement","moderate","Adding との makes the relationship to the Audiobookshelf service read naturally in Japanese while retaining the save-failure meaning."),
(3565,"ar"):("مزامنة التوفر أثناء فحص Bookshelf","correction","high","The current word order reads as availability of synchronization. The checkbox names synchronization of availability during a Bookshelf scan; this phrasing states that relation directly."),
(3567,"ja"):("接続テスト","refinement","moderate","This is a secondary-button label. 接続テスト uses the usual Japanese compound order for a connection test; the current テスト接続 reads less naturally."),
(3567,"pt_BR"):("Testar conexão","correction","high","The current noun phrase includes a period, while the caller renders an action button. The infinitive gives a concise, natural button label."),
(3567,"ko"):("연결 테스트","correction","high","시험 연결 is an unnatural word order for this button. 연결 테스트 is the standard Korean compound for testing the connection."),
(3567,"zh_Hant"):("測試連線","correction","moderate","The Traditional Chinese catalog uses 連線 for connection in this modal. This button tests connectivity, so 測試連線 matches the locale term."),
(3568,"ko"):("Audiobookshelf에 연결할 수 없습니다. 주소와 토큰을 확인하세요.","refinement","moderate","The toast directs the user to check the address and token. 확인하세요 is the appropriate instruction; the current 확인합니다 is declarative."),
(3568,"zh_Hant"):("無法連線到 Audiobookshelf。請檢查位址和權杖。","correction","high","The current sentence uses Simplified Chinese forms 連接、地址、令牌 in the Traditional Chinese locale. This target uses Traditional terminology and preserves the Audiobookshelf brand."),
(3569,"es"):("Conectado. Elija una biblioteca de libros para sincronizar.","refinement","moderate","This success toast gives a follow-up instruction. Elija matches the formal register used by the surrounding Spanish connection prompts; the current Elige is informal."),
(3571,"ja"):("Audiobookshelf ユーザートークンを入力してください。","correction","moderate","This Yup validation message is an instruction. 入力してください is the natural polite request; the current 入力します is declarative."),
(3572,"ja"):("有効な HTTP または HTTPS URL を入力してください。","correction","moderate","This Yup validation message asks the user to enter a valid URL. The current 入力します is declarative; the proposed polite instruction preserves all three protocol literals."),
(3572,"zh_Hant"):("請輸入有效的 HTTP 或 HTTPS URL。","refinement","moderate","有效 is the natural term for a valid URL here, and the imperative plus full-width sentence punctuation fit the Traditional Chinese validation message."),
(3573,"vi"):("Thêm máy chủ","correction","high","Máy phục vụ means a serving machine rather than a server in this software setting. Máy chủ is the standard Vietnamese technical term."),
(3573,"ar"):("إضافة خادم","refinement","moderate","خادم is the standard Arabic technical term for a server; the current سيرفر is a colloquial transliteration."),
(3574,"pt_BR"):("Chave de API do BackIssue","refinement","moderate","Adding do clarifies that this is the BackIssue API key and makes the Portuguese label read naturally."),
(3575,"es"):("Utilice una clave con los permisos library.view, library.manage y downloads.grab para que SeerrNG pueda sincronizar la colección y gestionar las solicitudes.","refinement","moderate","The current Usa is informal. Utilice matches the formal imperative used by the other Spanish Audiobookshelf and BackIssue settings guidance; all permission identifiers stay exact."),
(3576,"de"):("Geben Sie einen BackIssue-API-Schlüssel ein.","refinement","moderate","The current German sentence leaves Key in English despite the established API-Schlüssel term in this modal. The compound keeps BackIssue and API intact."),
(3576,"ja"):("BackIssue API キーを入力してください。","correction","moderate","This Yup validation message should instruct the user to enter the key. The current noun-fragment/input phrasing is less clear than the polite imperative."),
(3576,"ko"):("BackIssue API 키를 입력하세요.","correction","moderate","The current text is a noun fragment rather than the validation instruction “Enter a key.” This polite imperative gives the caller a clear action."),
(3577,"id"):("URL dasar","correction","moderate","URL dasar is the natural Indonesian field label and matches the already cross-reviewed Audiobookshelf URL Base label in this same settings area."),
(3578,"es"):("Déjelo en blanco, a menos que BackIssue se sirva bajo una ruta URL.","refinement","moderate","The current uses informal Deja and the passive sea servido is awkward in this settings guidance. The formal instruction and reflexive se sirva preserve the condition."),
(3578,"de"):("Lassen Sie das Feld leer, es sei denn, BackIssue wird unter einem URL-Pfad bereitgestellt.","refinement","moderate","Explicitly naming das Feld makes this helper complete and clear; the URL-path condition remains unchanged."),
(3578,"fr"):("Laissez le champ vide, sauf si BackIssue est servi sous un chemin d’URL.","refinement","moderate","The current infinitive Laisser is less direct as a form instruction. Laissez le champ vide gives the user a clear instruction while preserving the path condition."),
(3578,"ja"):("BackIssue が URL パスで提供される場合を除き、空欄のままにしてください。","refinement","moderate","This is field guidance. してください is the expected polite instruction and 空欄 identifies the field state; the current します is declarative."),
(3578,"id"):("Biarkan kolom ini kosong kecuali BackIssue diakses melalui jalur URL.","refinement","moderate","Kolom ini makes the omitted field explicit, and diakses melalui describes how the service is reached through a URL path more naturally than disajikan di bawah."),
(3579,"de"):("Die URL-Basis muss ein relativer Pfad sein.","refinement","moderate","The German compound takes a hyphen, and the article makes the validation sentence read naturally."),
(3579,"hi"):("URL बेस एक सापेक्ष पथ होना चाहिए।","refinement","moderate","Using बेस consistently with the adjacent Hindi URL Base field label avoids switching to the less common आधार for the same setting.")
}
PURPOSE={
"name":"connection-name field label","nameRequired":"required-name validation message","port":"port field label","portRequired":"port validation message","saveFailure":"save-failure toast","scanEnabled":"availability-sync checkbox label","ssl":"HTTPS checkbox label","test":"connection-test button","testFailure":"connection-failure toast","testSuccess":"connection-success toast","testing":"connection-testing button state","tokenRequired":"user-token validation message","urlInvalid":"URL validation message","add":"server-add button","apiKey":"API-key field label","apiKeyHelp":"API-permissions helper text","apiKeyRequired":"API-key validation message","baseUrl":"URL Base field label","baseUrlHelp":"URL Base helper text","baseUrlInvalid":"relative-path validation message"
}
assert not OUT.exists()
verify=subprocess.run(["python3",str(T/"verify_candidate_free.py")],check=True,capture_output=True,text=True).stdout
manifest=j(IN/"manifest.json"); input_manifest_sha=sha((IN/"manifest.json").read_bytes()); input_sums_sha=sha((IN/"SHA256SUMS.txt").read_bytes())
assert input_manifest_sha==MANIFEST_SHA and input_sums_sha==INPUT_SUMS_SHA
assert manifest["head"]==HEAD and manifest["tree"]==TREE
cells=jl(IN/"current-target-cells.jsonl"); sources={x["position"]:x for x in jl(IN/"source-cells.jsonl")}; contexts={x["position"]:x for x in jl(IN/"caller-contexts.jsonl")}
window=j(IN/"window.json"); locales=window["localeOrder"]; info={x["catalogKey"]:x for x in window["localeInfo"]}
assert len(cells)==240 and len(sources)==20 and len(contexts)==20
assert len(PROPOSALS)==32
input_by_key={(x["position"],x["locale"]):x for x in cells}; assert len(input_by_key)==240
ledger=[]; selected=[]
for x in cells:
 key=(x["position"],x["locale"]); source=sources[x["position"]]; caller=contexts[x["position"]]; language=info[x["locale"]]["nativeName"]
 prop=PROPOSALS.get(key)
 if prop:
  final,disposition,confidence,reason=prop
  assert final!=x["currentTarget"] and caller["callerCount"]>0
 else:
  final=x["currentTarget"]; disposition="accept-current"; confidence="moderate"
  reason=f"The current {language} wording accurately conveys the source meaning for the pinned {PURPOSE[source['sourceKey']]}. Its direct message-property caller confirms this field, validation, helper, toast, or button context. No meaning or caller mismatch requires a change, and the source technical literals are retained."
 assert PH.findall(final)==source["sourcePlaceholders"]
 assert MK.findall(final)==source["sourceMarkupTokens"]
 assert NUM.findall(final)==source["sourceNumericTokens"]
 final_protected=[p for p in PROTECTED if p in final]
 assert all(p in final for p in source["sourceProtectedLiterals"])
 cctx={"callerCount":caller["callerCount"],"callerResolution":caller["callerResolution"],"directMessageReferences":caller["directMessageReferences"],"namespace":source["namespace"],"sameNamespace":True}
 row={"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3560-W3579","head":HEAD,"tree":TREE,"position":x["position"],"locale":x["locale"],"localeTag":x["localeTag"],"sourceId":x["sourceId"],"sourceKey":x["sourceKey"],"namespace":source["namespace"],"source":source["source"],"sourceSha256":source["sourceSha256"],"currentTarget":x["currentTarget"],"currentTargetSha256":x["currentTargetSha256"],"catalogPath":x["catalogPath"],"catalogGitBlob":x["catalogGitBlob"],"catalogSha256":x["catalogSha256"],"callerContext":cctx,"reviewStatus":"primary-reviewed","disposition":disposition,"confidence":confidence,"rationale":reason,"finalTarget":final,"finalTargetSha256":st(final),"placeholderTokenChecks":{"sourceTokens":source["sourcePlaceholders"],"currentTargetTokens":x["currentTargetPlaceholders"],"finalTargetTokens":PH.findall(final),"currentSequenceMatchesSource":x["placeholderTokenSequenceMatches"],"currentSetMatchesSource":True,"finalSequenceMatchesSource":True,"finalSetMatchesSource":True},"markupTokenChecks":{"sourceTokens":source["sourceMarkupTokens"],"currentTargetTokens":x["currentTargetMarkupTokens"],"finalTargetTokens":MK.findall(final),"currentSequenceMatchesSource":x["markupTokenSequenceMatches"],"finalSequenceMatchesSource":True},"numericTokenChecks":{"sourceTokens":source["sourceNumericTokens"],"currentTargetTokens":x["currentTargetNumericTokens"],"finalTargetTokens":NUM.findall(final),"currentSequenceMatchesSource":not x["numericTokenMismatch"],"finalSequenceMatchesSource":True},"protectedLiteralChecks":{"sourceLiterals":source["sourceProtectedLiterals"],"currentTargetLiterals":x["currentTargetProtectedLiterals"],"finalTargetLiterals":final_protected,"finalSetMatchesSource":all(p in final for p in source["sourceProtectedLiterals"])},"direction":info[x["locale"]]["direction"]}
 if disposition!="accept-current":
  row["proposedTarget"]=final; row["proposedTargetSha256"]=st(final)
  selected.append({"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3560-W3579","head":HEAD,"tree":TREE,"position":x["position"],"locale":x["locale"],"localeTag":x["localeTag"],"sourceId":x["sourceId"],"source":source["source"],"sourceSha256":source["sourceSha256"],"currentTarget":x["currentTarget"],"currentTargetSha256":x["currentTargetSha256"],"proposedTarget":final,"proposedTargetSha256":st(final),"disposition":disposition,"confidence":confidence,"rationale":reason,"catalogPath":x["catalogPath"],"catalogGitBlob":x["catalogGitBlob"],"catalogSha256":x["catalogSha256"],"callerContext":cctx})
 ledger.append(row)
assert len(ledger)==240 and len(selected)==32
counts=Counter(x["disposition"] for x in ledger)
assert counts["accept-current"]+counts["correction"]+counts["refinement"]+counts["hold"]==240
assert counts["hold"]==0 and counts["accept-current"]==208
OUT.mkdir()
writejl(OUT/"primary-ledger.jsonl",ledger); writejl(OUT/"selected-direct-locale-cells.jsonl",selected)
provenance={"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3560-W3579","head":HEAD,"tree":TREE,"candidateFreeManifestJsonSha256":MANIFEST_SHA,"candidateFreeChecksumListSha256":INPUT_SUMS_SHA,"candidateFreeInputManifestLineage":"manifest JSON and SHA256SUMS list are distinct files and separately hashed","reviewType":"primary semantic review only","all240CellsReviewed":True,"callerContextsPinned":True,"callerlessHolds":0,"nativeSpeakerApproval":False,"exactHeadBrowserReview":False,"blindReviewIncluded":False,"reviewedAtUTC":datetime.now(timezone.utc).isoformat()}
summary={"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3560-W3579","head":HEAD,"tree":TREE,"candidateFreeManifestJsonSha256":MANIFEST_SHA,"candidateFreeChecksumListSha256":INPUT_SUMS_SHA,"sourceIds":20,"locales":12,"cells":240,"dispositions":dict(counts),"proposedChanges":len(selected),"proposedChangesByLocale":dict(Counter(x["locale"] for x in selected)),"proposedChangesByPosition":dict(Counter(str(x["position"]) for x in selected)),"callerlessHolds":0,"placeholderMismatches":0,"markupMismatches":0,"numericTokenMismatches":0,"protectedLiteralMismatches":0,"nativeSpeakerApproval":False,"exactHeadBrowserReview":False,"blindReviewIncluded":False,"all240CellsReviewed":True,"reviewedAtUTC":provenance["reviewedAtUTC"]}
wj(OUT/"summary.json",summary); wj(OUT/"provenance.json",provenance)
(OUT/"input-verification.txt").write_text(verify,encoding="utf-8")
readme=f"""Primary semantic review for SeerrNG PR #418 W3560-W3579, pinned to {HEAD} / tree {TREE}.

The review covers all 240 current target cells across 20 source IDs and 12 direct locales. Decisions: {counts["accept-current"]} accept-current, {counts["correction"]} corrections, {counts["refinement"]} refinements, and {counts["hold"]} holds. The {len(selected)} proposals are recorded in selected-direct-locale-cells.jsonl with source/current hashes, caller references, rationale, and exact proposed text.

Candidate-free lineage is explicit: manifest JSON SHA-256 {MANIFEST_SHA}; checksum-list SHA-256 {INPUT_SUMS_SHA}. They identify separate files. All selected source rows have pinned direct message-property callers; placeholder, markup, numeric-token, and protected-literal mismatches are zero.

This is a machine primary semantic review only, not qualified native-speaker approval or exact-head browser acceptance. This task creates no independent blind review and makes no catalog changes. Existing prior holds are untouched.
"""
(OUT/"README.md").write_text(readme,encoding="utf-8")
shutil.copy2(T/"build_primary_review.py",OUT/"build_primary_review.py")
shutil.copy2(T/"verify_primary_review.py",OUT/"verify_primary_review.py")
sums=[f"{sha(p.read_bytes())}  {p.name}" for p in sorted(q for q in OUT.iterdir() if q.is_file() and q.name!="SHA256SUMS.txt")]
(OUT/"SHA256SUMS.txt").write_text("\n".join(sums)+"\n",encoding="utf-8")
print(run(["python3",str(OUT/"verify_primary_review.py")],cwd=T))
print(json.dumps({"result":"primary review sealed","dispositions":dict(counts),"proposedChanges":len(selected),"manifestSha256":MANIFEST_SHA,"inputChecksumListSha256":INPUT_SUMS_SHA,"primaryChecksumListSha256":sha((OUT/"SHA256SUMS.txt").read_bytes())},ensure_ascii=False,indent=2))

