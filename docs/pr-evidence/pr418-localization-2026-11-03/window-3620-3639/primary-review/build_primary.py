#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
O=Path(__file__).resolve().parent
I=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3620-3639-candidatefree-20261103/candidate-free-input")
PROPOSALS=json.loads("{\"3623\":{\"ja\":[\"refinement\",\"ライブラリの利用可否を確認\",\"Uses natural Japanese for checking whether items are available in the library; this checkbox enables the availability scan.\",\"moderate\"]},\"3630\":{\"id\":[\"correction\",\"Semua folder saat ini\",\"Replaces kini, which can mean 'now', with saat ini for the 'current folders' dropdown option.\",\"high\"]},\"3633\":{\"ja\":[\"refinement\",\"著者と移動先のパスを確認する\",\"Uses 移動先 for the destination paths in this Bookshelf path-migration details summary.\",\"moderate\"],\"zh_Hant\":[\"correction\",\"檢視作者與目的地路徑\",\"Repairs the unnatural 目的路徑 and names the destination paths in the review summary.\",\"high\"],\"vi\":[\"correction\",\"Xem lại các tác giả và đường dẫn đích\",\"Replaces the incomplete đường dẫn đến with a complete term for destination paths.\",\"high\"]},\"3634\":{\"id\":[\"refinement\",\"{mediaCount, plural, other {# berkas media}}, {sidecarCount, plural, other {# berkas pendamping}}, {missingCount, plural, other {# berkas yang hilang akan dilewati}}\",\"Indonesian has only the other cardinal plural category; removes the unused duplicate one branches while keeping all three plural formatters and counts.\",\"moderate\"]},\"3635\":{\"es\":[\"refinement\",\"Número de autores: {count}\",\"Uses a count label so the single ICU-free string stays grammatical when count is one.\",\"high\"],\"zh_Hans\":[\"refinement\",\"作者数量：{count}\",\"Uses a natural count label for the author total.\",\"high\"],\"de\":[\"refinement\",\"Anzahl der Autoren: {count}\",\"Uses a count label so the single ICU-free string stays grammatical when count is one.\",\"high\"],\"ja\":[\"refinement\",\"著者数：{count}\",\"Uses a natural count label for the author total.\",\"high\"],\"fr\":[\"refinement\",\"Nombre d’auteurs : {count}\",\"Uses a count label so the single ICU-free string stays grammatical when count is one.\",\"high\"],\"pt_BR\":[\"refinement\",\"Número de autores: {count}\",\"Uses a count label so the single ICU-free string stays grammatical when count is one.\",\"high\"],\"zh_Hant\":[\"refinement\",\"作者數：{count}\",\"Uses a natural count label for the author total.\",\"high\"]},\"3636\":{\"de\":[\"refinement\",\"Verfügbarer Speicherplatz am Ziel: {size}\",\"Names storage capacity explicitly; the caller formats the available destination size as bytes.\",\"high\"],\"zh_Hans\":[\"refinement\",\"目标路径的可用存储空间：{size}\",\"Clarifies that the formatted destination value is available storage capacity.\",\"high\"],\"ko\":[\"correction\",\"대상 경로의 사용 가능한 저장 공간: {size}\",\"Replaces the vague 대상 공간 with the destination path's available storage space.\",\"high\"],\"id\":[\"refinement\",\"Ruang penyimpanan yang tersedia di tujuan: {size}\",\"Clarifies that the formatted destination value is available storage capacity.\",\"high\"],\"zh_Hant\":[\"refinement\",\"目的地可用儲存空間：{size}\",\"Clarifies that the formatted destination value is available storage capacity.\",\"high\"]},\"3637\":{\"es\":[\"refinement\",\"BookshelfNG permite trasladar como máximo 1.000 autores por operación. Seleccione un lote más pequeño.\",\"States the per-operation move limit directly while retaining Spanish thousands formatting.\",\"high\"],\"de\":[\"refinement\",\"BookshelfNG verschiebt pro Vorgang höchstens 1.000 Autoren. Wählen Sie eine kleinere Auswahl.\",\"States the move limit directly instead of saying the service accepts authors.\",\"high\"],\"hi\":[\"correction\",\"BookshelfNG एक बार में अधिकतम 1,000 लेखकों को स्थानांतरित कर सकता है। इससे छोटा बैच चुनें।\",\"Replaces the literal 'accepts authors' wording with the actual per-move limit.\",\"high\"],\"ja\":[\"correction\",\"BookshelfNGでは1回の移動につき最大1,000人の著者を処理できます。対象をもっと絞ってください。\",\"Replaces the literal acceptance wording with the move limit and a natural instruction to narrow the batch.\",\"high\"],\"fr\":[\"correction\",\"BookshelfNG peut déplacer au maximum 1000 auteurs par opération. Sélectionnez un lot plus petit.\",\"Replaces déménagement, which means a household move, with a file-move operation.\",\"high\"],\"pt_BR\":[\"refinement\",\"O BookshelfNG permite mover no máximo 1.000 autores por operação. Selecione um lote menor.\",\"States the per-operation move limit directly and keeps Brazilian Portuguese number formatting.\",\"high\"],\"vi\":[\"correction\",\"BookshelfNG chỉ cho phép chuyển tối đa 1.000 tác giả mỗi lần. Hãy chọn một nhóm nhỏ hơn.\",\"Replaces the literal acceptance wording with the actual move limit.\",\"high\"],\"id\":[\"correction\",\"BookshelfNG hanya dapat memindahkan maksimal 1.000 penulis per pemindahan. Pilih kelompok yang lebih kecil.\",\"Replaces the literal acceptance wording with the actual per-move limit.\",\"high\"]},\"3638\":{\"zh_Hant\":[\"correction\",\"清除選取項目\",\"Names the selected items rather than a selection area in this button that clears the selected authors.\",\"high\"],\"vi\":[\"correction\",\"Bỏ chọn\",\"Uses the standard concise deselect action for clearing the selected authors.\",\"high\"],\"id\":[\"correction\",\"Kosongkan pilihan\",\"Clarifies that the button clears the current selection, rather than deleting an option.\",\"high\"]},\"3639\":{\"zh_Hans\":[\"correction\",\"移动命令状态：{status}\",\"Removes the space before the colon and uses standard Chinese punctuation while preserving the status placeholder.\",\"high\"],\"zh_Hant\":[\"correction\",\"移動命令狀態：{status}\",\"Removes the space before the colon and uses standard Traditional Chinese punctuation while preserving the status placeholder.\",\"high\"]}}")
HEADER=re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?")
CAT=re.compile(r"(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{")
MK=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM=re.compile(r"(?<!\d)[+-]?\d+(?:[.,]\d+)*(?:%?)(?!\d)")
PROTECTED=["SeerrNG","Audiobookshelf","ISBN","API","URL","HTTP","HTTPS","IP","SSL","BackIssue","Bindery","BookshelfNG","ComicVine","Plex","Jellyfin","BINDERY_ENFORCE_TENANCY","Auto-approve requests","library.view","library.manage","downloads.grab"]
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode("utf-8")).hexdigest()
def j(n): return json.loads((I/n).read_text(encoding="utf-8"))
def jl(n): return [json.loads(x) for x in (I/n).read_text(encoding="utf-8").splitlines() if x.strip()]
def dump(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def lines(p,x): p.write_text("".join(json.dumps(r,ensure_ascii=False,sort_keys=True)+"\n" for r in x),encoding="utf-8")
def icu(s):
 out=[]; i=0
 while i<len(s):
  if s[i]!="{": i+=1; continue
  start=i; depth=1; k=i+1
  while k<len(s) and depth:
   if s[k]=="{": depth+=1
   elif s[k]=="}": depth-=1
   k+=1
  if depth: break
  body=s[start+1:k-1]; m=HEADER.match(body)
  if m:
   name,fmt=m.group(1),m.group(2); cats=[]
   if fmt in ("plural","select","selectordinal"): cats=[x.group(1) for x in CAT.finditer(body[m.end():])]
   out.append({"name":name,"formatter":fmt or None,"pluralCategories":cats})
  i=k
 return out
def catmap(ts): return {x["name"]:sorted(x["pluralCategories"]) for x in ts if x["pluralCategories"]}
def sig(ts): return [(x["name"],x["formatter"]) for x in ts]
def numval(token,source_ref):
 if re.fullmatch(r"\d{1,3},\d{3}",source_ref): return re.sub(r"\D","",token)
 if re.fullmatch(r"\d{1,3}[.]\d{3}",token): return re.sub(r"\D","",token)
 return token.replace(",","")
def numeric_values(src,tgt):
 if len(src)!=len(tgt): return None,None
 if not src: return [],[]
 return [numval(v,src[i]) for i,v in enumerate(src)],[numval(v,src[i]) for i,v in enumerate(tgt)]
verify=subprocess.run([sys.executable,str(I/"verify_candidate_free.py")],capture_output=True,text=True)
if verify.returncode: raise SystemExit(verify.stdout+verify.stderr)
if {p.name for p in O.iterdir() if p.is_file()}!={"build_primary.py","verify_primary.py"}: raise SystemExit("Output directory is not clean")
im=j("manifest.json"); window=j("window.json")
sources=jl("source-cells.jsonl"); targets=jl("current-target-cells.jsonl"); contexts=jl("caller-contexts.jsonl"); blocks=jl("caller-context-blocks.jsonl")
assert len(sources)==20 and len(targets)==240 and len(contexts)==20
by_pos={x["position"]:x for x in sources}; by_key={(x["position"],x["locale"]):x for x in targets}
cx={(x["position"],x["sourceId"]):x for x in contexts}; bx={x["contextId"]:x for x in blocks}
locale_info={x["catalogKey"]:x for x in window["localeInfo"]}
tags=[x["tag"] for x in window["localeInfo"]]
nodecode="const tags="+json.dumps(tags)+"; console.log(JSON.stringify({node:process.version,icu:process.versions.icu,categories:Object.fromEntries(tags.map(t=>[t,[...new Intl.PluralRules(t).resolvedOptions().pluralCategories].sort()]))}));"
node_run=subprocess.run(["node","-e",nodecode],capture_output=True,text=True)
if node_run.returncode: raise SystemExit(node_run.stderr)
runtime=json.loads(node_run.stdout)
dump(O/"runtime-icu-categories.json",runtime)
rationales={
3620:"Label for the Bindery connection port field.",
3621:"Validation error for the required port field; caller limits it to 1–65535.",
3622:"Error toast when saving the Bindery connection fails.",
3623:"Checkbox enabling a scan for library availability in the Bindery integration.",
3624:"Checkbox label enabling SSL for the Bindery connection.",
3625:"Button label for testing the Bindery connection.",
3626:"Error toast after a failed Bindery connection test.",
3627:"Success toast after the Bindery connection test succeeds.",
3628:"In-progress status text while the Bindery connection test runs.",
3629:"Label immediately before the reported Bindery version.",
3630:"Dropdown option for all existing source folders in the Bookshelf path migration.",
3631:"Book-format option for audiobooks in the migration filter.",
3632:"Hold: there is no direct message-property caller for this Author definition in the pinned component; the standalone noun's UI role is unresolved.",
3633:"Expandable details summary for reviewing author names and destination paths.",
3634:"Three ICU pluralized counts for media files, sidecar files, and missing files skipped in an author migration preview.",
3635:"Author count displayed in the move preview.",
3636:"Destination free-space value formatted as bytes.",
3637:"Validation alert for the 1,000-author per-move batch limit.",
3638:"Button that clears the selected authors.",
3639:"Status label followed by the current move-command status."
}
rows=[]
for c in sorted(targets,key=lambda x:(x["position"],window["localeOrder"].index(x["locale"]))):
 pos,loc=c["position"],c["locale"]; s=by_pos[pos]; ctx=cx[(pos,s["sourceId"])]
 choice=PROPOSALS.get(str(pos),{}).get(loc)
 if pos==3632:
  decision="hold"; proposal=None; rationale=rationales[pos]; confidence="low"
 elif choice:
  decision,proposal,rationale,confidence=choice
 else:
  decision="accept-current"; proposal=None; rationale=rationales[pos]; confidence="high"
 reviewed=proposal if decision in ("correction","refinement") else c["currentTarget"]
 src_icu=icu(s["source"]); current_icu=icu(c["currentTarget"]); reviewed_icu=icu(reviewed)
 runtime_cats=runtime["categories"][c["localeTag"]]
 reviewed_cats=catmap(reviewed_icu)
 coverage=all(set(runtime_cats).issubset(set(v)) for v in reviewed_cats.values())
 src_nums=NUM.findall(s["source"]); cur_nums=NUM.findall(c["currentTarget"]); rev_nums=NUM.findall(reviewed)
 sv,cv=numeric_values(src_nums,cur_nums); sv,rv=numeric_values(src_nums,rev_nums)
 required=s["sourceProtectedLiterals"]
 missing=[x for x in required if x not in reviewed]
 audit={
 "sourcePlaceholders":src_icu,"currentPlaceholders":current_icu,"reviewedPlaceholders":reviewed_icu,
 "placeholderFormatterSequencePreserved":sig(src_icu)==sig(reviewed_icu),
 "currentPluralCategoryMap":catmap(current_icu),"reviewedPluralCategoryMap":reviewed_cats,
 "runtimePluralCategories":runtime_cats,"runtimePluralCategoriesCovered":coverage,
 "sourceAndReviewedPluralCategoryMapsEqual":catmap(src_icu)==reviewed_cats,
 "sourceMarkupTokens":MK.findall(s["source"]),"currentMarkupTokens":MK.findall(c["currentTarget"]),"reviewedMarkupTokens":MK.findall(reviewed),
 "markupPreserved":MK.findall(s["source"])==MK.findall(reviewed),
 "sourceNumericTokens":src_nums,"currentNumericTokens":cur_nums,"reviewedNumericTokens":rev_nums,
  "packetSourceNumericTokens":s["sourceNumericTokens"],"packetCurrentNumericTokens":c["currentTargetNumericTokens"],"packetNumericTokenMismatch":c["numericTokenMismatch"],
 "reviewedNumericTokenSurfaceMatchesSource":src_nums==rev_nums,
 "reviewedNumericValuesMatchSource":sv==rv,
 "requiredProtectedLiterals":required,"preservedProtectedLiterals":[x for x in required if x in reviewed],"missingProtectedLiterals":missing
 }
 if not audit["placeholderFormatterSequencePreserved"] or not coverage or not audit["markupPreserved"] or not audit["reviewedNumericValuesMatchSource"] or missing:
  raise SystemExit(f"Reviewed target violates a structural check: {(pos,loc)} {audit}")
 cx_sha=sha(json.dumps(ctx,ensure_ascii=False,sort_keys=True,separators=(",",":")))
 row={"schema":"seerrng-primary-cell-review/v1","repository":im["repository"],"pullRequest":im["pullRequest"],"window":im["window"],
 "head":im["head"],"tree":im["tree"],"position":pos,"sourceId":s["sourceId"],"sourceIdSha256":s["sourceIdSha256"],"source":s["source"],"sourceSha256":s["sourceSha256"],
 "namespace":s["namespace"],"sourceKey":s["sourceKey"],"sourcePlaceholders":s["sourcePlaceholders"],"sourceIcuPluralCategories":s["sourceIcuPluralCategories"],
 "sourceMarkupTokens":s["sourceMarkupTokens"],"sourceNumericTokens":s["sourceNumericTokens"],"sourceProtectedLiterals":s["sourceProtectedLiterals"],
 "locale":loc,"localeTag":c["localeTag"],"catalogPath":c["catalogPath"],"catalogSha256":c["catalogSha256"],"catalogGitBlob":c["catalogGitBlob"],
 "currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],"reviewStatus":c["reviewStatus"],
 "callerResolution":ctx["callerResolution"],"directCallerCount":ctx["directCallerCount"],"callerless":ctx["directCallerCount"]==0,
 "callerContextSha256":cx_sha,"callerContext":ctx,"callerContextBlocks":[bx[q] for q in ctx["contextBlockIds"]],
 "placeholderTokenMismatch":c["placeholderTokenMismatch"],"placeholderTokenSequenceMismatch":c["placeholderTokenSequenceMismatch"],
 "icuPluralCategorySetDifference":c["icuPluralCategorySetDifference"],"markupTokenMismatch":c["markupTokenMismatch"],
 "numericTokenMismatch":c["numericTokenMismatch"],"protectedLiteralMismatch":c["protectedLiteralMismatch"],
 "decision":decision,"rationale":rationale,"confidence":confidence,"reviewedTargetSha256":sha(reviewed),"tokenAudit":audit}
 if decision in ("correction","refinement"): row["proposedTarget"]=proposal
 rows.append(row)
assert len(rows)==240
counts=Counter(x["decision"] for x in rows); conf=Counter(x["confidence"] for x in rows)
baseline=Counter(); reviewed=Counter()
for r in rows:
 a=r["tokenAudit"]
 baseline["placeholderMismatchCount"]+=r["placeholderTokenMismatch"]
 baseline["placeholderSequenceMismatchCount"]+=r["placeholderTokenSequenceMismatch"]
 baseline["icuPluralCategorySetDifferenceCount"]+=r["icuPluralCategorySetDifference"]
 baseline["markupMismatchCount"]+=r["markupTokenMismatch"]
 baseline["numericTokenMismatchCount"]+=r["numericTokenMismatch"]
 baseline["protectedLiteralMismatchCount"]+=r["protectedLiteralMismatch"]
 reviewed["placeholderMismatchCount"]+=not a["placeholderFormatterSequencePreserved"]
 reviewed["placeholderSequenceMismatchCount"]+=not a["placeholderFormatterSequencePreserved"]
 reviewed["icuPluralCategorySetDifferenceCount"]+=a["sourceAndReviewedPluralCategoryMapsEqual"] is False
 reviewed["icuRuntimeCoverageFailureCount"]+=not a["runtimePluralCategoriesCovered"]
 reviewed["markupMismatchCount"]+=not a["markupPreserved"]
 reviewed["numericTokenSurfaceMismatchCount"]+=not a["reviewedNumericTokenSurfaceMatchesSource"]
 reviewed["numericValueMismatchCount"]+=not a["reviewedNumericValuesMatchSource"]
 reviewed["protectedLiteralMismatchCount"]+=bool(a["missingProtectedLiterals"])
assert dict(baseline)==im["baselineTokenDiagnostics"]
assert counts==Counter({"accept-current":197,"correction":14,"refinement":17,"hold":12}),counts
summary={"schemaVersion":1,"repository":im["repository"],"pullRequest":im["pullRequest"],"window":im["window"],"head":im["head"],"tree":im["tree"],
"sourceCount":20,"localeCount":12,"cellCount":240,"decisionCounts":dict(counts),"confidenceCounts":dict(conf),
"holdCount":counts["hold"],"holdCells":[{"position":r["position"],"sourceId":r["sourceId"],"locale":r["locale"],"rationale":r["rationale"]} for r in rows if r["decision"]=="hold"],
"callerlessPosition3632":{"cells":12,"allHeld":True,"sourceId":by_pos[3632]["sourceId"]},
"baselineDiagnostics":dict(baseline),"reviewedDiagnostics":dict(reviewed),
"runtimePluralCategoryEvidence":runtime,"priorImmediateWindowHoldCount":0,"candidateFreeInputVerified":"PASS",
"nativeSpeakerReview":"not performed","browserReview":"not performed","repositoryOrPRFilesEdited":False}
lines(O/"primary-ledger.jsonl",rows)
dump(O/"summary.json",summary)
(O/"input-verification.txt").write_text("Candidate-free packet verifier ran before primary review generation.\n\n"+verify.stdout,encoding="utf-8")
(O/"README.md").write_text("# SeerrNG PR #418 W3620–W3639 primary semantic review\n\nThis sealed primary ledger reviews 240 exact source/current-target cells across 12 locales against the candidate-free packet pinned at head "+im["head"]+" and tree "+im["tree"]+". Every row includes catalog provenance and the pinned caller context. Each cell is marked accept-current, correction, refinement, or hold; proposedTarget appears only for corrections and refinements. All 12 locale cells at callerless position 3632 are held without proposals.\n\nThe packet verifier ran before generation and is rerun by verify_primary.py. The output verifier checks source/current/caller bindings, ICU formatter shape and runtime plural-category coverage, placeholders, markup, numeric values, protected literals, manifest hashes, and checksums. Native-speaker and browser review were not performed.\n\nRun python3 verify_primary.py in this folder to verify the packet and sealed output.\n",encoding="utf-8")
m={"schemaVersion":1,"artifact":"SeerrNG PR #418 W3620-W3639 primary semantic review ledger","reviewType":"primary-semantic","sealed":True,
"repository":im["repository"],"pullRequest":im["pullRequest"],"window":im["window"],"head":im["head"],"tree":im["tree"],
"localeOrder":im["localeOrder"],"sourceCount":20,"localeCount":12,"cellCount":240,"inputPath":str(I),
"inputManifestSha256":sha((I/"manifest.json").read_bytes()),"inputChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),
"decisionCounts":dict(counts),"holdCount":counts["hold"],"candidateFreeInputVerifier":"PASS","createdAtUtc":datetime.now(timezone.utc).isoformat()}
m["files"]=[{"path":p.relative_to(O).as_posix(),"byteCount":p.stat().st_size,"sha256":sha(p.read_bytes())} for p in sorted(O.iterdir()) if p.is_file() and p.name not in ("manifest.json","SHA256SUMS.txt")]
dump(O/"manifest.json",m)
paths=sorted(p for p in O.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt")
(O/"SHA256SUMS.txt").write_text("".join(f"{sha(p.read_bytes())}  {p.name}\n" for p in paths),encoding="utf-8")
print(json.dumps({"built":True,"output":str(O),"cells":len(rows),"counts":dict(counts),"confidenceCounts":dict(conf),"baseline":dict(baseline),"reviewed":dict(reviewed)},ensure_ascii=False,indent=2))
