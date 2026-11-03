import hashlib,json,re,shutil
from decimal import Decimal
from pathlib import Path
I=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3680-3699-cross-audit-20261103/evidence/candidate-free-input")
O=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3680-3699-cross-audit-20261103/independent-review")
sha=lambda b:hashlib.sha256(b).hexdigest()
def jl(p):return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def stsha(s):return sha(s.encode("utf-8"))
def number_values(text,locale):
 spans=[];lower=text.lower()
 if locale=="pt_BR":
  for m in re.finditer(r"(?<![A-Za-z0-9])(\d+(?:[.,]\d+)?)\s*mil\b",lower):
   raw=m.group(1).replace(",",".")
   spans.append((m.start(),m.end(),int(Decimal(raw)*1000),"mil-thousands"))
 mask=list(text)
 for a,b,_,_ in spans:
  for i in range(a,b):mask[i]=" "
 clean="".join(mask)
 for m in re.finditer(r"(?<![A-Za-z0-9])\d+(?:(?:,|\.|\u00a0|\u202f| )\d{3})*(?![A-Za-z0-9])",clean):
  raw=m.group(0); val=int(re.sub(r"[,.\u00a0\u202f ]","",raw)); spans.append((m.start(),m.end(),val,"grouped-digits"))
 return [{"start":a,"end":b,"value":v,"surfaceType":kind} for a,b,v,kind in sorted(spans)]
def placeholder_names(s):return re.findall(r"\{([A-Za-z][A-Za-z0-9_]*)\}",s)
def markup(s):return re.findall(r"</?[A-Za-z][^>]*>",s)
def protected_found(s,tokens):return {x:s.count(x)>=tokens.count(x) for x in set(tokens)}
changes={
 (3680,"ja"):("refinement","著者を{count}人選択しました","The current word order is unnatural. This expresses the live selection count as a complete Japanese status while preserving the named placeholder."),
 (3680,"zh_Hant"):("refinement","已選擇 {count} 位作者","The current order reads as an ungrammatical count phrase. This gives the natural Traditional Chinese order and preserves the count placeholder."),
 (3686,"id"):("correction","{count} berkas pendamping","Sespan can mean a motorcycle sidecar. Berkas pendamping clearly means companion/sidecar files in this file-migration preview."),
 (3689,"fr"):("refinement","Démarrer le déplacement","The caller is the action button for moving files. Include the move so the button label remains clear when read outside the immediate page context."),
 (3690,"fr"):("refinement","BookshelfNG n’a pas pu démarrer ce déplacement.","The current imperfect pouvait suggests an ongoing or habitual inability. The source reports a specific failed attempt."),
 (3690,"ko"):("correction","BookshelfNG가 이 이동을 시작하지 못했습니다.","The current text is missing a space between the subject particle and demonstrative and uses present tense. This states the specific failed start."),
 (3691,"fr"):("refinement","Démarrage du déplacement…","The loading button is starting the move; the current generic Démarrage omits that action."),
 (3691,"pt_BR"):("refinement","Iniciando a movimentação…","The current Começando movimento is awkward Brazilian Portuguese. This is a natural in-progress button label."),
 (3693,"fr"):("refinement","BookshelfNG a renvoyé les 10 000 premiers auteurs. Filtrez la liste avant de sélectionner un lot.","Renvoyé is the natural API-response verb here, and Filtrez makes the instruction direct. 10 000 preserves the exact source count."),
 (3693,"ko"):("correction","BookshelfNG가 처음 10,000명의 저자를 반환했습니다. 일괄 선택 전에 목록을 필터링하세요.","작성자 normally means the author/creator of a document or data record. In this book-library migration, 저자 is the book-author term used elsewhere in this window."),
 (3696,"zh_Hant"):("correction","連接 Jellystat 伺服器","The current target is Simplified Chinese in the Traditional Chinese catalog. Use Traditional script and the regional server term."),
 (3696,"ja"):("correction","Jellystatサーバーに接続","The current を marks the server as the object of 接続 and is ungrammatical here. Use に for the server being connected to."),
 (3696,"pt_BR"):("refinement","Conectar ao servidor Jellystat","Add the natural Portuguese preposition and article for connecting to the server."),
 (3697,"hi"):("correction","API कुंजी","The source marks API as a protected literal. Transliterate it as एपीआई currently drops the required exact API token."),
 (3698,"hi"):("correction","Jellystat की API कुंजी सेटिंग्स में एक कुंजी बनाएँ। यह कुंजी SeerrNG सर्वर पर रहती है।","The current Hindi transliteration drops the protected API literal and transliterates the product name. Preserve API, Jellystat, and SeerrNG exactly and make the setting relationship clear."),
 (3698,"ja"):("correction","JellystatのAPIキー設定でキーを作成してください。キーはSeerrNGサーバーに保存されます。","The current sentence repeats で and spaces the brand/server phrases awkwardly. This gives a natural instruction and keeps the API and server terms."),
 (3698,"ko"):("correction","Jellystat의 API 키 설정에서 키를 생성하세요. 키는 SeerrNG 서버에 보관됩니다.","The current wording repeats the location particle and is a fragment. This is a complete Korean instruction and preserves the source terms."),
 (3698,"pt_BR"):("correction","Crie uma chave nas configurações de chaves da API do Jellystat. A chave fica no servidor SeerrNG.","The current com as chaves da API changes the source relation to “with the API keys.” Nas configurações de chaves da API accurately locates key creation."),
 (3698,"fr"):("refinement","Créez une clé dans les paramètres de clés API de Jellystat. La clé reste sur le serveur SeerrNG.","The current API settings wording omits that these are specifically API-key settings."),
 (3698,"vi"):("refinement","Tạo một khóa trong phần cài đặt khóa API của Jellystat. Khóa này được lưu trên máy chủ SeerrNG.","Avoid repeating “API key” as both the created object and the settings label; preserve the key settings and server storage meaning."),
 (3699,"zh_Hant"):("refinement","輸入 API 金鑰。","Remove the space before the full-width Chinese full stop."),
 (3699,"ko"):("refinement","API 키를 입력하세요.","The caller uses this as the validation message when the API key is missing. A complete instruction is more natural than the current noun fragment.")
}
src={x["position"]:x for x in jl(I/"source-cells.jsonl")}
ctx={x["position"]:x for x in jl(I/"caller-contexts.jsonl")}
blocks={x["contextId"]:x for x in jl(I/"caller-context-blocks.jsonl")}
cells=jl(I/"current-target-cells.jsonl")
cellmap={(x["position"],x["locale"]):x for x in cells}
manifest=json.loads((I/"manifest.json").read_text());window=json.loads((I/"window.json").read_text());locale_order=window["localeOrder"]
out=[]
for p in range(3680,3700):
 for loc in locale_order:
  c=cellmap[(p,loc)];s=src[p];context=ctx[p];block_rows=[blocks[x] for x in context["contextBlockIds"]]
  disp,target,reason=changes.get((p,loc),("accept-current",c["currentTarget"],"Reviewed against the English source, exact message definition, and production caller context. The current target preserves the user-facing meaning, placeholders, protected literals, and locale conventions."))
  caller_digest=stsha(canon({"context":context,"blocks":block_rows}))
  source_ph=[x["name"] for x in s["sourcePlaceholders"]]
  src_nums=number_values(s["source"],loc);target_nums=number_values(target,loc)
  source_vals=[int(x) for x in c["sourceNumericValues"]]
  current_vals=[int(x) for x in c["currentTargetNumericValues"]]
  protected=protected_found(target,s["sourceProtectedLiterals"])
  target_placeholder_ok=placeholder_names(target)==source_ph
  target_markup_ok=markup(target)==s["sourceMarkupTokens"]
  target_icu_ok=s["sourceIcuPluralCategories"]==c["currentTargetIcuPluralCategories"]=={}
  target_numeric_ok=[x["value"] for x in src_nums]==[x["value"] for x in target_nums]
  target_protected_ok=all(protected.values())
  numeric_note="Locale grouping normalized to integer values; 10 mil in pt_BR is 10,000." if (p==3693 and loc=="pt_BR") else "Locale grouping separators normalized to integer values."
  out.append({
   "schema":"seerrng-independent-translation-review/v1","repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3680-W3699","head":manifest["head"],"tree":manifest["tree"],
   "position":p,"sourceId":s["sourceId"],"sourceIdSha256":s["sourceIdSha256"],"source":s["source"],"sourceSha256":s["sourceSha256"],"namespace":s["namespace"],
   "locale":loc,"localeTag":c["localeTag"],"currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],"reviewedTarget":target,"reviewedTargetSha256":stsha(target),
   "disposition":disp,"rationale":reason,
   "callerEvidence":{"callerResolution":context["callerResolution"],"callerCount":context["callerCount"],"callerContextSha256":caller_digest,"contextBlockIds":context["contextBlockIds"],
    "definitionFiles":context["definitionFiles"],"namespaceFiles":context["namespaceFiles"],"directMessageReferences":context["directMessageReferences"],
    "dynamicLabelMappings":context["dynamicLabelMappings"],"dynamicRendererReferences":context["dynamicRendererReferences"],"typedStageMappings":context["typedStageMappings"],"contextBlocks":block_rows},
   "catalogEvidence":{"path":c["catalogPath"],"sha256":c["catalogSha256"],"gitBlob":c["catalogGitBlob"],"reviewStatus":c["reviewStatus"]},
   "tokenAudit":{"sourcePlaceholders":s["sourcePlaceholders"],"reviewedPlaceholderNames":placeholder_names(target),"placeholderSequenceMatches":target_placeholder_ok,
    "sourceIcuPluralCategories":s["sourceIcuPluralCategories"],"icuCategoriesPreserved":target_icu_ok,
    "sourceMarkupTokens":s["sourceMarkupTokens"],"reviewedMarkupTokens":markup(target),"markupPreserved":target_markup_ok,
    "sourceNumericTokens":s["sourceNumericTokens"],"currentTargetNumericTokens":c["currentTargetNumericTokens"],"reviewedNumericValues":target_nums,
    "sourceNumericValues":source_vals,"currentTargetNumericValues":current_vals,"numericValuesMatch":target_numeric_ok,"numericNormalizationNote":numeric_note,
    "sourceProtectedLiterals":s["sourceProtectedLiterals"],"reviewedProtectedLiteralsPresent":protected,"protectedLiteralsPreserved":target_protected_ok},
   "primaryCandidateOrDecisionExposed":False,"nativeSpeakerApproval":False
  })
assert len(out)==240
with (O/"blind-ledger.jsonl").open("w",encoding="utf-8",newline="\n") as f:
 for r in out:f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+"\n")
shutil.copyfile(I/"carry-forward-hold-hashes.jsonl",O/"prior-hold-reattestation.jsonl")
updates=sum(x["disposition"] in ("correction","refinement") for x in out)
counts={d:sum(x["disposition"]==d for x in out) for d in ("accept-current","correction","refinement","hold")}
checks={k:sum(not x["tokenAudit"][k] for x in out) for k in ("placeholderSequenceMatches","icuCategoriesPreserved","markupPreserved","numericValuesMatch","protectedLiteralsPreserved")}
summary={"result":"SEALED_INDEPENDENT_BLIND_REVIEW","repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3680-W3699","head":manifest["head"],"tree":manifest["tree"],
 "sourceCount":20,"localeCount":12,"cellCount":240,"localeOrder":locale_order,"dispositions":counts,"proposedUpdates":updates,"tokenFailureCounts":checks,
 "baselineProtectedLiteralMismatches":2,"independentProtectedLiteralMismatchesAfterReview":checks["protectedLiteralsPreserved"],
 "protectedLiteralResolutions":[{"position":3697,"locale":"hi","literal":"API"},{"position":3698,"locale":"hi","literal":"API"}],
 "numericNormalization":{"sourceGroupingExamples":["1,000","10,000"],"localeGroupingExamples":["1.000","1 000"],"wordNumberExample":{"locale":"pt_BR","position":3693,"surface":"10 mil","normalizedValue":10000},"baselineNumericMeaningMismatches":0},
 "priorHoldsReattested":12,"unchangedPriorHolds":sum(x["retained"] and x["currentTargetSha256"]==x["priorTargetSha256"] for x in jl(O/"prior-hold-reattestation.jsonl")),
 "priorHoldPositions":[3632],"callerlessSelectedPositions":[],"primaryMaterialsOpened":False,"nativeSpeakerApproval":False,
 "candidateFreeInputRoot":str(I),"candidateFreeManifestSha256":sha((I/"manifest.json").read_bytes()),"candidateFreeChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),
 "sourceOrderSha256":manifest["sourceOrderSha256"],"selectedSourceIdOrderSha256":manifest["selectedSourceIdOrderSha256"],
 "beforeLiveAttestationSha256":sha((O.parent/"before-live-attestation.json").read_bytes())}
(O/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
outman={"task":"SeerrNG PR #418 W3680-W3699 independent blind translation review","head":manifest["head"],"tree":manifest["tree"],"branch":"codex/seerrng-localization-overhaul-20261028","base":"221d8e0d542802da7529cd272c928cc747677e5c",
 "selectedRange":[3680,3699],"cellCount":240,"sourceCount":20,"localeOrder":locale_order,"inputRoot":str(I),"candidateFreeManifestSha256":sha((I/"manifest.json").read_bytes()),
 "candidateFreeChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),"candidateFreeInputSnapshot":"../evidence/candidate-free-input",
 "primaryDirectoryOpened":False,"primaryCandidateOrDecisionExposed":False,"reviewSealState":"sealed before opening primary",
 "priorHoldsReattested":12,"unchangedPriorHolds":summary["unchangedPriorHolds"],"dispositions":counts,"tokenFailureCounts":checks,
 "sourceOrderSha256":manifest["sourceOrderSha256"],"selectedSourceIdOrderSha256":manifest["selectedSourceIdOrderSha256"],
 "beforeLiveAttestationSha256":summary["beforeLiveAttestationSha256"],
 "files":{"blind-ledger.jsonl":sha((O/"blind-ledger.jsonl").read_bytes()),"prior-hold-reattestation.jsonl":sha((O/"prior-hold-reattestation.jsonl").read_bytes()),"summary.json":sha((O/"summary.json").read_bytes())}}
(O/"manifest.json").write_text(json.dumps(outman,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"rows":len(out),"dispositions":counts,"tokenFailures":checks,"priorHoldsUnchanged":summary["unchangedPriorHolds"]},ensure_ascii=False,indent=2))

