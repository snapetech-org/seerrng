#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
O=Path(__file__).resolve().parent
I=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-primary-20261103/candidate-free-input")
PROPOSALS={'3640': {'es': ['correction', 'No se pudo actualizar el estado del traslado. Es posible que el comando siga en ejecución.', "Replaces the awkward refrescar phrasing with a natural status update and keeps the command's possibly-running state.", 'high'], 'zh_Hans': ['correction', '无法刷新移动状态。命令可能仍在运行。', 'Removes spaces before Chinese punctuation and preserves that the command may still be running.', 'high'], 'hi': ['correction', 'स्थानांतरण की स्थिति ताज़ा नहीं की जा सकी। आदेश अभी भी चल रहा हो सकता है।', 'Replaces the English transliteration of the operation with Hindi wording and expresses the possible ongoing command accurately.', 'moderate'], 'fr': ['correction', 'Impossible d’actualiser l’état du déplacement. La commande est peut-être toujours en cours d’exécution.', 'Uses actualiser for refreshing status; renouveler suggests renewing it.', 'high'], 'pt_BR': ['correction', 'Não foi possível atualizar o status da movimentação. O comando ainda pode estar em execução.', 'Uses natural Brazilian Portuguese for the file-move status and an executing command.', 'high'], 'zh_Hant': ['correction', '無法更新移動狀態。命令可能仍在執行。', 'Removes spaces before Chinese punctuation and keeps the command status concise.', 'high'], 'id': ['correction', 'Status pemindahan tidak dapat diperbarui. Perintah mungkin masih berjalan.', 'Replaces the unnatural status pindah construction and keeps the possible ongoing state.', 'moderate']}, '3641': {'es': ['refinement', 'BookshelfNG completó el traslado de los archivos multimedia.', 'Names the moved media files explicitly instead of the broader medios.', 'high'], 'de': ['correction', 'BookshelfNG hat das Verschieben der Mediendateien abgeschlossen.', 'Umzug refers to moving house; Verschieben describes the file operation.', 'high'], 'fr': ['correction', 'BookshelfNG a terminé le déplacement des fichiers multimédias.', 'Replaces déménagement, which refers to a household move, with the file-move term déplacement.', 'high'], 'pt_BR': ['correction', 'O BookshelfNG concluiu a movimentação dos arquivos de mídia.', 'Replaces the awkward literal movimento da mídia with natural wording for moving media files.', 'high'], 'ko': ['refinement', 'BookshelfNG가 미디어 파일 이동을 완료했습니다.', 'Names the media files explicitly in this file-migration result.', 'moderate'], 'id': ['refinement', 'BookshelfNG menyelesaikan pemindahan berkas media.', 'Uses the explicit Indonesian term for media files and removes ambiguity in media.', 'moderate']}, '3642': {'fr': ['correction', 'Impossible de charger les détails de la bibliothèque Bookshelf. Vérifiez la connexion au service et réessayez.', 'The current French says the library itself could not load, while the source says its details failed to load.', 'high']}, '3643': {'es': ['refinement', 'Cargando la biblioteca de Bookshelf…', 'Uses sentence-case Spanish and a natural preposition for the Bookshelf library.', 'moderate'], 'hi': ['correction', 'Bookshelf लाइब्रेरी लोड हो रही है…', 'Repairs the ungrammatical mixed-English imperative-like phrase while preserving loading status.', 'moderate'], 'fr': ['refinement', 'Chargement de la bibliothèque Bookshelf…', 'Uses the standard ellipsis character and preserves the loading state.', 'moderate'], 'pt_BR': ['refinement', 'Carregando a biblioteca do Bookshelf…', 'Clarifies that the library belongs to Bookshelf and uses the standard ellipsis character.', 'moderate'], 'zh_Hant': ['refinement', '正在載入 Bookshelf 圖書館…', 'Uses a natural Traditional Chinese term for a book library and the standard ellipsis.', 'moderate']}, '3644': {'de': ['correction', 'Ich habe diese Vorschau geprüft und möchte, dass BookshelfNG diese Dateien verschiebt.', 'Uses the natural file-operation verb verschieben instead of the colloquial bewegt.', 'high'], 'ja': ['refinement', 'このプレビューを確認し、BookshelfNGにこれらのファイルを移動してほしいです。', 'Expresses the checkbox confirmation as wanting the service to move the files, rather than issuing an instruction.', 'moderate']}, '3646': {'es': ['correction', 'Los traslados se realizan dentro de una sola base de datos de BookshelfNG. Para consolidar una implementación antigua dividida, primero fusione o importe su biblioteca en la instancia de BookshelfNG que vaya a conservar. Después, use esta página para trasladar el formato seleccionado. Esta página no copia archivos ni registros de bases de datos entre instancias distintas de BookshelfNG.', 'Repairs the current sentence fragments and inconsistent infinitive/imperative forms while preserving the same-instance boundary.', 'high'], 'fr': ['correction', 'Les déplacements s’effectuent au sein d’une seule base de données BookshelfNG. Pour consolider une ancienne installation répartie, fusionnez d’abord sa bibliothèque avec l’instance BookshelfNG que vous souhaitez conserver, ou importez-la dans cette instance. Utilisez ensuite cette page pour déplacer le format sélectionné. Cette page ne copie ni fichiers ni enregistrements de base de données entre plusieurs instances BookshelfNG.', 'Makes the opening a complete sentence and replaces déménagement with the term for a file move.', 'high'], 'pt_BR': ['correction', 'As movimentações ocorrem dentro de um único banco de dados BookshelfNG. Para consolidar uma implantação antiga dividida, primeiro mescle ou importe a biblioteca para a instância do BookshelfNG que você pretende manter. Depois, use esta página para mover o formato selecionado. Esta página não copia arquivos nem registros do banco de dados entre instâncias diferentes do BookshelfNG.', 'Replaces the awkward literal Move-se and makes the steps consistent while preserving the one-database limitation.', 'high']}, '3647': {'es': ['correction', 'Ruta actual del formato', 'Vía is unnatural for a filesystem path label; ruta is the standard term.', 'high'], 'id': ['refinement', 'Jalur format saat ini', 'Uses jalur for a path, which is more precise than lokasi for this filesystem label.', 'moderate']}, '3648': {'es': ['correction', 'Mueva los archivos de libros o audiolibros a otra carpeta raíz administrada por la instancia seleccionada de BookshelfNG.', 'Uses the standard carpeta raíz term and keeps the selected instance relationship clear.', 'high'], 'pt_BR': ['correction', 'Mova arquivos de livros ou audiolivros para outra pasta raiz gerenciada pela instância selecionada do BookshelfNG.', 'Uses an imperative consistent with the source and standard Brazilian Portuguese wording for moving the files.', 'moderate'], 'ar': ['refinement', 'انقل ملفات الكتب أو الكتب الصوتية إلى مجلد جذري آخر تديره مثيل BookshelfNG المحدد.', 'Uses an explicit instance term and retains the root-folder and file-move meanings.', 'low']}, '3649': {'es': ['correction', 'Carpeta raíz de destino', 'Adds destino, which is missing from the current label.', 'high'], 'vi': ['correction', 'Thư mục gốc đích', 'Removes the added colon and includes the root-folder meaning of the source.', 'high'], 'id': ['refinement', 'Folder akar tujuan', 'Localizes the root-folder concept more clearly than the mixed phrase folder root.', 'moderate']}, '3650': {'es': ['correction', 'Solo están disponibles las carpetas raíz accesibles de esta instancia de BookshelfNG. BookshelfNG vuelve a comprobar los conflictos y el espacio en disco cuando comienza el traslado.', 'States availability directly, uses carpeta raíz, and uses traslado for moving files.', 'high'], 'de': ['correction', 'Nur zugängliche Stammordner dieser BookshelfNG-Instanz sind verfügbar. BookshelfNG überprüft Konflikte und Speicherplatz erneut, wenn die Verschiebung beginnt.', 'Replaces Umzug, which means moving house, with Verschiebung for this file operation.', 'high'], 'fr': ['correction', 'Seuls les dossiers racine accessibles depuis cette instance de BookshelfNG sont disponibles. BookshelfNG vérifie à nouveau les conflits et l’espace disque au démarrage du déplacement.', 'Localizes root folders and replaces déménagement with the term for a file move.', 'high'], 'pt_BR': ['correction', 'Somente as pastas raiz acessíveis nesta instância do BookshelfNG estão disponíveis. Quando a movimentação começa, o BookshelfNG verifica novamente os conflitos e o espaço em disco.', 'Uses natural Brazilian Portuguese for root folders and keeps the pre-move recheck explicit.', 'high'], 'ar': ['correction', 'لا تتوفر إلا المجلدات الجذرية التي يمكن الوصول إليها من مثيل BookshelfNG هذا. يعيد BookshelfNG فحص التعارضات والمساحة المتاحة على القرص عند بدء النقل.', 'Uses an instance term instead of a word that can mean a software copy or edition.', 'moderate'], 'id': ['refinement', 'Hanya folder akar yang dapat diakses dari instans BookshelfNG ini yang tersedia. BookshelfNG akan memeriksa konflik dan ruang disk lagi saat pemindahan dimulai.', 'Localizes the root-folder term and preserves the move-start validation point.', 'moderate']}, '3651': {'es': ['correction', 'Elija una carpeta raíz accesible', 'Replaces the literal de raíz with the standard Spanish compound carpeta raíz.', 'high'], 'id': ['refinement', 'Pilih folder akar yang dapat diakses', 'Uses Indonesian wording for a root folder instead of leaving root in English.', 'moderate']}, '3652': {'de': ['correction', 'Bookshelf-Migrationsanleitung lesen', 'Translates the generic words Migration Guide rather than leaving them in English.', 'high'], 'ja': ['refinement', 'Bookshelf の移行ガイドを読む', 'Uses the standard Japanese term for migration instead of the katakana loanword.', 'moderate'], 'zh_Hant': ['refinement', '閱讀 Bookshelf 遷移指南', 'Uses a standard Traditional Chinese migration term and keeps this as a concise link label.', 'moderate']}, '3654': {'es': ['refinement', 'BookshelfNG informó que falló el traslado de los archivos multimedia.', 'Names the moved media files and uses traslado for moving them.', 'high'], 'de': ['correction', 'BookshelfNG meldete, dass das Verschieben der Mediendateien fehlgeschlagen ist.', 'Replaces Umzug der Medien, which suggests moving house, with a precise file operation.', 'high'], 'id': ['correction', 'BookshelfNG melaporkan bahwa pemindahan media gagal.', 'Removes ini, which adds an unsupported this, and keeps the failure report concise.', 'high']}, '3656': {'ar': ['correction', 'تعارض', 'The existing word means struggle or conflict as a dispute; تعارض is the appropriate file-conflict label.', 'high']}, '3657': {'hi': ['correction', 'फ़ाइल नहीं मिली; छोड़ दी जाएगी', 'States that the missing file will be skipped; the current wording says it will be left.', 'moderate'], 'zh_Hans': ['correction', '缺失；将跳过', 'Uses Chinese punctuation and a concise missing-file status.', 'high'], 'zh_Hant': ['correction', '缺失；將跳過', 'Uses Chinese punctuation and a concise missing-file status.', 'high']}, '3658': {'es': ['correction', 'Listo para trasladar', 'Describes the file as ready to be moved, rather than ready to move itself.', 'high'], 'de': ['correction', 'Bereit zum Verschieben', 'Describes a file ready to be moved, not a household move.', 'high'], 'ja': ['correction', '移動可能', 'Uses a concise status meaning the file can be moved; the current phrase means preparing to move.', 'high'], 'fr': ['correction', 'Prêt à être déplacé', 'Describes the file as ready to be moved rather than ready to move around.', 'high'], 'pt_BR': ['correction', 'Pronto para ser movido', 'Describes a file ready to be moved, rather than ready to move itself.', 'high'], 'ar': ['correction', 'جاهز للنقل', 'Uses the file-transfer meaning of move instead of bodily movement.', 'high'], 'zh_Hant': ['refinement', '可移動', 'Adds the ready-to-move state that the current translation omits.', 'moderate'], 'vi': ['refinement', 'Sẵn sàng để di chuyển', 'Makes explicit that the files are ready to be moved.', 'moderate'], 'id': ['correction', 'Siap dipindahkan', 'Uses the passive file-move meaning rather than movement by the file itself.', 'high']}}
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
verify=subprocess.run([sys.executable,str(I.parent/"verify_candidate_free.py")],capture_output=True,text=True)
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
rationales={3640: 'Error status shown when refreshing the move-command status fails; the command may still be running.', 3641: 'Success message after BookshelfNG completes moving the selected media files.', 3642: 'Error toast when the selected BookshelfNG connection cannot load library details.', 3643: 'Loading status while the Bookshelf library data is being fetched.', 3644: 'Confirmation statement that the user reviewed the preview and authorizes moving the selected files.', 3645: 'Short status label for a file conflict detected in the preview.', 3646: 'Help text explaining moves within one BookshelfNG database and explicitly excluding cross-instance file or database copying.', 3647: "Label for the current format's filesystem path.", 3648: 'Description of moving book or audiobook files to another root managed by the selected instance.', 3649: 'Label for the destination root-folder selector.', 3650: 'Help text describing available roots and the move-start conflict and disk-space recheck.', 3651: 'Placeholder prompting selection of an accessible root folder.', 3652: 'Link label for the Bookshelf migration guide.', 3653: 'Media-format option label for books.', 3654: 'Error message after BookshelfNG reports the media-file move failed.', 3655: 'File status indicating that the destination already contains the file.', 3656: 'File status for an existing-path conflict.', 3657: 'File status explaining that a missing file will be skipped.', 3658: 'File status indicating that a file is ready to move.', 3659: 'Label for the media format.'}
rows=[]
for c in sorted(targets,key=lambda x:(x["position"],window["localeOrder"].index(x["locale"]))):
 pos,loc=c["position"],c["locale"]; s=by_pos[pos]; ctx=cx[(pos,s["sourceId"])]
 choice=PROPOSALS.get(str(pos),{}).get(loc)
 if ctx["callerCount"]==0:
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
 "callerResolution":ctx["callerResolution"],"directCallerCount":ctx["callerCount"],"callerless":ctx["callerCount"]==0,
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
assert dict(baseline)==json.loads(verify.stdout)["baselineTokenDiagnostics"]
assert counts==Counter({"accept-current":181,"correction":41,"refinement":18}),counts
summary={"schemaVersion":1,"repository":im["repository"],"pullRequest":im["pullRequest"],"window":im["window"],"head":im["head"],"tree":im["tree"],
"sourceCount":20,"localeCount":12,"cellCount":240,"decisionCounts":dict(counts),"confidenceCounts":dict(conf),
"holdCount":counts["hold"],"holdCells":[{"position":r["position"],"sourceId":r["sourceId"],"locale":r["locale"],"rationale":r["rationale"]} for r in rows if r["decision"]=="hold"],
"callerlessCellCount":sum(r["callerless"] for r in rows),
"baselineDiagnostics":dict(baseline),"reviewedDiagnostics":dict(reviewed),
"runtimePluralCategoryEvidence":runtime,"priorImmediateWindowHoldCount":0,"candidateFreeInputVerified":"PASS",
"nativeSpeakerReview":"not performed","browserReview":"not performed","repositoryOrPRFilesEdited":False}
lines(O/"primary-ledger.jsonl",rows)
dump(O/"summary.json",summary)
(O/"input-verification.txt").write_text("Candidate-free packet verifier ran before primary review generation.\n\n"+verify.stdout,encoding="utf-8")
(O/"README.md").write_text("# SeerrNG PR #418 W3640–W3659 primary semantic review\n\nThis sealed primary ledger reviews 240 exact source/current-target cells across 12 locales against the candidate-free packet pinned at head "+im["head"]+" and tree "+im["tree"]+". Every row includes catalog provenance and the pinned caller context. Each cell is marked accept-current, correction, refinement, or hold; proposedTarget appears only for corrections and refinements. All 240 reviewed cells have direct callers; no callerless hold was required.\n\nThe packet verifier ran before generation and is rerun by verify_primary.py. The output verifier checks source/current/caller bindings, ICU formatter shape and runtime plural-category coverage, placeholders, markup, numeric values, protected literals, manifest hashes, and checksums. Native-speaker and browser review were not performed.\n\nRun python3 verify_primary.py in this folder to verify the packet and sealed output.\n",encoding="utf-8")
m={"schemaVersion":1,"artifact":"SeerrNG PR #418 W3640-W3659 primary semantic review ledger","reviewType":"primary-semantic","sealed":True,
"repository":im["repository"],"pullRequest":im["pullRequest"],"window":im["window"],"head":im["head"],"tree":im["tree"],
"localeOrder":window["localeOrder"],"sourceCount":20,"localeCount":12,"cellCount":240,"inputPath":str(I),
"inputManifestSha256":sha((I/"manifest.json").read_bytes()),"inputChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),
"decisionCounts":dict(counts),"holdCount":counts["hold"],"candidateFreeInputVerifier":"PASS","createdAtUtc":datetime.now(timezone.utc).isoformat()}
m["files"]=[{"path":p.relative_to(O).as_posix(),"byteCount":p.stat().st_size,"sha256":sha(p.read_bytes())} for p in sorted(O.iterdir()) if p.is_file() and p.name not in ("manifest.json","SHA256SUMS.txt")]
dump(O/"manifest.json",m)
paths=sorted(p for p in O.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt")
(O/"SHA256SUMS.txt").write_text("".join(f"{sha(p.read_bytes())}  {p.name}\n" for p in paths),encoding="utf-8")
print(json.dumps({"built":True,"output":str(O),"cells":len(rows),"counts":dict(counts),"confidenceCounts":dict(conf),"baseline":dict(baseline),"reviewed":dict(reviewed)},ensure_ascii=False,indent=2))
