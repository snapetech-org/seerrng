#!/usr/bin/env python3
import hashlib,json,re,datetime,os,unicodedata
from pathlib import Path
BASE=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-primary-20261103")
INP=BASE/"candidate-free-input"
OUT=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-blind-20261103")
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
HEAD="30f626a4626d460f426666cde02f5c1ed17fa206"
TREE="9b2616780791c73eb176aca6ad53061f1f3587d8"
BRANCH="codex/seerrng-localization-overhaul-20261028"
PROPOSALS={
 (3582,"de"):("BackIssue-Server bearbeiten","The caller uses this text as the modal's edit title. The current German wording is an awkward noun phrase and omits the compound hyphen; this is the natural action label.","moderate"),
 (3584,"ar"):("عنوان اختياري يمكن لمستخدميك فتحه في متصفحهم.","The caller displays helper text for an optional external URL. The current Arabic has spelling errors and مصففهم means a hairdresser/stylist, not a browser; replace it with متصفحهم.","high"),
 (3586,"hi"):("होस्टनाम या IP पता","The hostname field label must preserve the protected literal IP exactly. The current Hindi transliteration आईपी is understandable, but drops the protected acronym required by the source.","high"),
 (3587,"es"):("Introduzca un nombre de host válido o una dirección IP válida.","This is a hostname field validation message. The current Spanish omits una before dirección and leaves válido unattached to the IP option; repeat the article and adjective for both alternatives.","high"),
 (3590,"zh_Hans"):("输入此服务器的名称。","This is a required-field validation message. Remove the stray space before the Chinese full stop.","high"),
 (3590,"ja"):("このサーバーの名前を入力してください。","The caller uses this as a required-field validation message. The current Japanese declarative 入力します is not a natural request; use the standard polite instruction.","high"),
 (3590,"ko"):("이 서버의 이름을 입력하세요.","This is a required-field validation message. The current 에 이름을 입력하십시오 construction reads as entering a name to the server; use the natural possessive form.","high"),
 (3590,"zh_Hant"):("輸入此伺服器的名稱。","This is a required-field validation message. Remove the stray space before the Chinese full stop.","high"),
 (3594,"es"):("Mantenga sincronizada la disponibilidad de SeerrNG","The caller displays a synchronization setting. The current en sincronización is awkward; sincronizada expresses keeping availability in sync.","moderate"),
 (3594,"fr"):("Maintenir la disponibilité de SeerrNG synchronisée","The caller displays a synchronization setting. The current phrase omits de after disponibilité and uses the awkward en synchronisation; use the natural synchronized-state construction.","moderate"),
 (3594,"ja"):("SeerrNG の可用性を同期した状態に保つ","The caller displays a synchronization setting. The current 同期で does not clearly express keeping availability in a synchronized state; make that relation explicit.","moderate"),
 (3594,"id"):("Jaga ketersediaan SeerrNG tetap sinkron","The caller displays a synchronization setting. The current dalam sinkronisasi is unnatural; tetap sinkron expresses keeping availability synchronized.","moderate"),
 (3595,"es"):("Escanea la colección para buscar cómics existentes y muestra las descargas activas de BackIssue en el estado de la solicitud.","This is helper text for the synchronization setting. The current la colección de cómics existentes says the collection itself consists of existing comics; para buscar makes clear that the collection is scanned to find existing comics.","moderate"),
 (3595,"zh_Hans"):("扫描收藏以查找现有漫画，并在请求状态中显示正在进行的 BackIssue 下载。","This is helper text for the synchronization setting. Correct the current collection-of-existing-comics construction and replace ASCII punctuation with Chinese punctuation.","moderate"),
 (3595,"ja"):("コレクションをスキャンして既存のコミックを検索し、リクエストのステータスにアクティブな BackIssue のダウンロードを表示します。","This is helper text for the synchronization setting. The current Japanese says the collection is a collection of existing comics; make clear that the collection is scanned to find comics.","moderate"),
 (3595,"id"):("Pindai koleksi untuk menemukan komik yang sudah ada dan tampilkan unduhan BackIssue yang sedang aktif di status permintaan.","This is helper text for the synchronization setting. The current wording describes scanning a collection of existing comics, rather than scanning the collection to find existing comics.","moderate"),
}
PH=re.compile(r"\{[^{}\r\n]+\}")
MK=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def readj(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def writejl(p,rows): p.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in rows),encoding="utf-8")
def verify_sums(p):
 for line in (p/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
  if line.strip():
   d,n=line.split(None,1); n=n.strip().lstrip("*"); assert sha((p/n).read_bytes())==d,(p/n,"checksum")
def main():
 assert INP.is_dir() and {x.name for x in OUT.iterdir()} <= {"build-blind-review.py","blind-ledger.jsonl","summary.json"}
 verify_sums(INP)
 m=readj(INP/"manifest.json"); w=readj(INP/"window.json"); att=readj(INP/"PR-attestation.json")
 assert m["head"]==w["head"]==HEAD and m["tree"]==w["tree"]==TREE and m["window"]==w["window"]=="W3580-W3599"
 assert att["head"]==HEAD and att["tree"]==TREE and att["state"]=="OPEN" and att["isDraft"] is True
 sources=jl(INP/"source-cells.jsonl"); cells=jl(INP/"current-target-cells.jsonl"); contexts=jl(INP/"caller-contexts.jsonl")
 assert len(sources)==20 and len(cells)==240 and len(contexts)==20
 assert [r["position"] for r in sources]==list(range(3580,3600))
 assert [r["catalogKey"] for r in w["localeInfo"]]==LOCALES
 src_by={r["position"]:r for r in sources}; ctx_by={r["position"]:r for r in contexts}
 cell_by={(r["position"],r["locale"]):r for r in cells}
 assert len(cell_by)==240 and all(c["callerCount"]>0 for c in contexts)
 assert w["callerlessSourcePositions"]==[] and readj(INP/"caller-resolution-findings.json")["callerlessSourcePositions"]==[]
 assert w["previousWindowHoldCount"]==0
 assert all(not any(k in c for k in ("proposal","proposedTarget","decision","selectedTarget")) for c in cells)
 ledger=[]
 for pos in range(3580,3600):
  src=src_by[pos]; ctx=ctx_by[pos]
  for loc in LOCALES:
   c=cell_by[(pos,loc)]; prop=PROPOSALS.get((pos,loc))
   if prop: target,reason,confidence=prop; disp="propose"; proposed=target
   else:
    target=c["currentTarget"]; proposed=None; disp="retain"; confidence="moderate"
    if pos in {3580,3582,3596,3597,3598,3599}: reason="The current wording names the requested BackIssue/Bindery server action clearly in its direct modal title or toast context. The protected service name is preserved."
    elif pos in {3581,3583,3589,3591,3592,3593}: reason="The current wording clearly labels the server setting or form field in the direct modal context; the technical term and intended action are preserved."
    elif pos==3584: reason="The current wording correctly explains that the optional address can be opened by users in a browser."
    elif pos in {3585,3586,3587}: reason="The current wording clearly describes the hostname/IP field or validation message, and preserves the protocol/IP terminology required by the source."
    elif pos==3588: reason="The current wording preserves the distinction that SeerrNG sends the complete ComicVine volume while BackIssue uses its own sources and download settings to find and track issues."
    elif pos==3590: reason="The current wording asks for a server name in the required-field validation context and uses natural punctuation."
    elif pos==3594: reason="The current wording expresses keeping SeerrNG availability synchronized in the settings context."
    elif pos==3595: reason="The current wording instructs the user to scan the collection for existing comics and describes active BackIssue downloads in request status."
    else: reason="The current translation preserves the source meaning in the exact direct caller context."
   src_tokens={"placeholders":src["sourcePlaceholders"],"markup":src["sourceMarkupTokens"],"numeric":src["sourceNumericTokens"],"protectedLiterals":src["sourceProtectedLiterals"]}
   tgt_tokens={"placeholders":PH.findall(target),"markup":MK.findall(target),"numeric":NUM.findall(target),"protectedLiterals":[t for t in src["sourceProtectedLiterals"] if t in target]}
   checks={"placeholdersPreserved":src_tokens["placeholders"]==tgt_tokens["placeholders"],"markupPreserved":src_tokens["markup"]==tgt_tokens["markup"],"numericTokensPreserved":src_tokens["numeric"]==tgt_tokens["numeric"],"protectedLiteralsPreserved":all(t in target for t in src_tokens["protectedLiterals"])}
   assert all(checks.values()),(pos,loc,checks)
   hidden=[{"index":i,"codePoint":f"U+{ord(ch):04X}","name":unicodedata.name(ch,"UNKNOWN"),"category":unicodedata.category(ch)} for i,ch in enumerate(target) if unicodedata.category(ch) in {"Cf","Cc","Cs"}]
   refs=ctx["directMessageReferences"]
   ledger.append({"window":"W3580-W3599","position":pos,"sourceId":src["sourceId"],"sourceIdSha256":src["sourceIdSha256"],"sourceKey":src["sourceKey"],"source":src["source"],"sourceSha256":src["sourceSha256"],"locale":loc,"localeTag":c["localeTag"],"catalogPath":c["catalogPath"],"catalogGitBlob":c["catalogGitBlob"],"catalogSha256":c["catalogSha256"],"currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],"disposition":disp,"target":target,"targetSha256":st(target),"proposedTarget":proposed,"proposedTargetSha256":st(target) if proposed is not None else None,"confidence":confidence,"rationale":reason,"callerResolution":ctx["callerResolution"],"callerCount":ctx["callerCount"],"callerContextBlockIds":ctx["contextBlockIds"],"definitionFiles":ctx["definitionFiles"],"callerRefs":refs,"sourceTokens":src_tokens,"targetTokens":tgt_tokens,"structuralChecks":checks,"baselineMismatchFlags":{"placeholder":c["placeholderTokenMismatch"],"markup":c["markupTokenMismatch"],"numeric":c["numericTokenMismatch"],"protectedLiteral":c["protectedLiteralMismatch"]},"hiddenFormatCharactersInFinalTarget":hidden})
 OUT.mkdir(parents=True,exist_ok=True)
 writejl(OUT/"blind-ledger.jsonl",ledger)
 counts={d:sum(r["disposition"]==d for r in ledger) for d in ["propose","retain","hold"]}
 baseline={"placeholderMismatchCount":sum(c["placeholderTokenMismatch"] for c in cells),"markupMismatchCount":sum(c["markupTokenMismatch"] for c in cells),"numericTokenMismatchCount":sum(c["numericTokenMismatch"] for c in cells),"protectedLiteralMismatchCount":sum(c["protectedLiteralMismatch"] for c in cells)}
 final={"placeholderMismatchCount":sum(not r["structuralChecks"]["placeholdersPreserved"] for r in ledger),"markupMismatchCount":sum(not r["structuralChecks"]["markupPreserved"] for r in ledger),"numericTokenMismatchCount":sum(not r["structuralChecks"]["numericTokensPreserved"] for r in ledger),"protectedLiteralMismatchCount":sum(not r["structuralChecks"]["protectedLiteralsPreserved"] for r in ledger)}
 assert counts=={"propose":16,"retain":224,"hold":0}
 assert baseline=={"placeholderMismatchCount":0,"markupMismatchCount":0,"numericTokenMismatchCount":0,"protectedLiteralMismatchCount":1}
 summary={"artifact":"SeerrNG PR #418 W3580-W3599 independent blind review","repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3580-W3599","pin":{"head":HEAD,"tree":TREE,"branch":BRANCH,"state":"OPEN","draft":True,"baseRef":"main","baseSha":w["baseSha"]},"candidateFreeInput":{"path":str(INP),"manifestSha256":sha((INP/"manifest.json").read_bytes()),"checksumListSha256":sha((INP/"SHA256SUMS.txt").read_bytes()),"packetType":"candidate-free-input"},"cells":240,"sourceCount":20,"localeCount":12,"localeOrder":LOCALES,"counts":counts,"callerlessSourceCount":0,"callerlessHolds":0,"existingHoldsWithinWindow":0,"priorWindowHoldCount":w["previousWindowHoldCount"],"holdsPreservedOutsideWindow":True,"baselineStructuralMismatchCounts":baseline,"finalStructuralMismatchCounts":final,"resolvedProtectedLiteralCell":[{"position":3586,"locale":"hi","sourceProtectedLiteral":"IP","target":next(r["target"] for r in ledger if r["position"]==3586 and r["locale"]=="hi")}],"finalTargetsWithHiddenFormatCharacters":sum(bool(r["hiddenFormatCharactersInFinalTarget"]) for r in ledger),"createdAtUtc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"notPerformed":["repository or PR edits","tests","builds","scans","CI","review of primary packet"]}
 writej(OUT/"summary.json",summary)
 writej(OUT/"PR-attestation.json",{"repository":att["repository"],"pullRequest":att["pullRequest"],"head":HEAD,"tree":TREE,"branch":BRANCH,"state":att["state"],"draft":att["isDraft"],"baseRef":att["baseRefName"],"baseSha":att["baseRefOid"],"branchRef":HEAD,"pullRef":HEAD,"sourceAttestationPath":str(INP/"PR-attestation.json"),"sourceAttestationSha256":sha((INP/"PR-attestation.json").read_bytes()),"candidateFreeManifestSha256":sha((INP/"manifest.json").read_bytes())})
 readme="""# SeerrNG PR #418 W3580-W3599 independent blind review

This review uses only the sealed candidate-free packet at ../seerrng-pr418-w3580-3599-primary-20261103/candidate-free-input. It does not use translation proposals or the primary review packet. The source positions are zero-based and cover 20 source IDs × 12 direct locales.

Each ledger row records the current target/hash, blind disposition, selected target/hash, confidence, rationale, direct caller and context-block references, catalog pins, and placeholder/markup/numeric/protected-literal checks. The one input protected-literal mismatch is the Hindi target at position 3586 translating IP as आईपी; the proposal restores the exact protected literal IP. There are no callerless cells or held dispositions in this window, and the prior window reports zero holds.

The supplied full candidate-free verifier reads repository and prior primary evidence, so this blind run verifies only the packet checksums and the candidate-free data itself; it does not invoke that external verifier. Run python3 verify-blind.py and sha256sum -c SHA256SUMS.txt from this directory.
"""
 (OUT/"README.md").write_text(readme,encoding="utf-8")
 verifier=r'''#!/usr/bin/env python3
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
INP=ROOT.parent/"seerrng-pr418-w3580-3599-primary-20261103"/"candidate-free-input"
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def verify_sums(d):
 for line in (d/"SHA256SUMS.txt").read_text().splitlines():
  if line.strip():
   expected,name=line.split(None,1); name=name.strip().lstrip("*")
   assert sha((d/name).read_bytes())==expected,(str(d/name),"checksum")
verify_sums(INP); verify_sums(ROOT)
m=j(INP/"manifest.json"); w=j(INP/"window.json"); a=j(INP/"PR-attestation.json")
s=j(ROOT/"summary.json"); ledger=jl(ROOT/"blind-ledger.jsonl")
sources=jl(INP/"source-cells.jsonl"); cells=jl(INP/"current-target-cells.jsonl"); ctxs=jl(INP/"caller-contexts.jsonl")
assert (m["head"],m["tree"],m["window"])==("30f626a4626d460f426666cde02f5c1ed17fa206","9b2616780791c73eb176aca6ad53061f1f3587d8","W3580-W3599")
assert (w["head"],w["tree"],w["range"])==(m["head"],m["tree"],[3580,3599])
assert a["head"]==m["head"] and a["tree"]==m["tree"] and a["state"]=="OPEN" and a["isDraft"] is True
assert len(sources)==20 and len(cells)==240 and len(ctxs)==20 and len(ledger)==240
assert s["candidateFreeInput"]["manifestSha256"]==sha((INP/"manifest.json").read_bytes())
assert s["candidateFreeInput"]["checksumListSha256"]==sha((INP/"SHA256SUMS.txt").read_bytes())
assert [r["position"] for r in sources]==list(range(3580,3600))
assert s["counts"]=={d:sum(r["disposition"]==d for r in ledger) for d in ("propose","retain","hold")}
assert sum(s["counts"].values())==240
src_by={r["position"]:r for r in sources}; cell_by={(r["position"],r["locale"]):r for r in cells}; ctx_by={r["position"]:r for r in ctxs}
assert len(cell_by)==240
PH=re.compile(r"\{[^{}\r\n]+\}"); MK=re.compile(r"</?[A-Za-z][^<>]*?/?>"); NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
for r in ledger:
 k=(r["position"],r["locale"]); c=cell_by[k]; src=src_by[r["position"]]; ctx=ctx_by[r["position"]]
 assert r["sourceId"]==src["sourceId"]==c["sourceId"] and r["source"]==src["source"]==c["source"]
 assert r["sourceSha256"]==src["sourceSha256"]==c["sourceSha256"]
 assert r["currentTarget"]==c["currentTarget"] and r["currentTargetSha256"]==c["currentTargetSha256"]==st(c["currentTarget"])
 assert r["catalogPath"]==c["catalogPath"] and r["catalogGitBlob"]==c["catalogGitBlob"] and r["catalogSha256"]==c["catalogSha256"]
 assert r["callerResolution"]==ctx["callerResolution"] and r["callerCount"]==ctx["callerCount"]>0
 assert r["callerContextBlockIds"]==ctx["contextBlockIds"] and r["definitionFiles"]==ctx["definitionFiles"] and r["callerRefs"]==ctx["directMessageReferences"]
 assert r["targetSha256"]==st(r["target"])
 if r["disposition"]=="propose": assert r["proposedTarget"]==r["target"] and r["proposedTargetSha256"]==r["targetSha256"]
 else: assert r["proposedTarget"] is None and r["proposedTargetSha256"] is None and r["target"]==r["currentTarget"]
 assert r["disposition"] in {"propose","retain","hold"}
 assert r["sourceTokens"]["placeholders"]==PH.findall(src["source"])==PH.findall(r["target"])
 assert r["sourceTokens"]["markup"]==MK.findall(src["source"])==MK.findall(r["target"])
 assert r["sourceTokens"]["numeric"]==NUM.findall(src["source"])==NUM.findall(r["target"])
 assert all(x in r["target"] for x in r["sourceTokens"]["protectedLiterals"])
 assert all(r["structuralChecks"].values())
assert s["counts"]=={"propose":16,"retain":224,"hold":0}
assert s["callerlessHolds"]==0 and s["existingHoldsWithinWindow"]==0 and s["priorWindowHoldCount"]==0
assert s["finalStructuralMismatchCounts"]=={"placeholderMismatchCount":0,"markupMismatchCount":0,"numericTokenMismatchCount":0,"protectedLiteralMismatchCount":0}
assert sum(bool(r["hiddenFormatCharactersInFinalTarget"]) for r in ledger)==s["finalTargetsWithHiddenFormatCharacters"]
print(json.dumps({"result":"PASS","candidateFreeChecksum":"PASS","blindChecksum":"PASS","cells":len(ledger),"counts":s["counts"],"baselineMismatchCounts":s["baselineStructuralMismatchCounts"],"finalMismatchCounts":s["finalStructuralMismatchCounts"],"holdCount":s["counts"]["hold"],"summarySha256":sha((ROOT/"summary.json").read_bytes()),"checksumListSha256":sha((ROOT/"SHA256SUMS.txt").read_bytes())},indent=2))
'''
 (OUT/"verify-blind.py").write_text(verifier,encoding="utf-8")
 os.chmod(OUT/"verify-blind.py",0o755)
 with (OUT/"SHA256SUMS.txt").open("w",encoding="utf-8") as f:
  for p in sorted((x for x in OUT.iterdir() if x.is_file() and x.name!="SHA256SUMS.txt"),key=lambda x:x.name):
   f.write(f"{sha(p.read_bytes())}  {p.name}\n")
 print(json.dumps({"output":str(OUT),"cells":len(ledger),"counts":counts,"baselineMismatches":baseline,"finalMismatches":final},ensure_ascii=False,indent=2))
if __name__=="__main__": main()

