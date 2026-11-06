#!/usr/bin/env python3
import hashlib,json,re,datetime,os,subprocess,unicodedata
from pathlib import Path

BASE=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-primary-20261103")
INP=BASE/"candidate-free-input"
PRI=BASE/"primary-review"
BLIND=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-blind-20261103")
OUT=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-root-crossaudit-20261103")
BRANCH="codex/seerrng-localization-overhaul-20261028"
HEAD="30f626a4626d460f426666cde02f5c1ed17fa206"
TREE="9b2616780791c73eb176aca6ad53061f1f3587d8"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
PH=re.compile(r"\{[^{}\r\n]+\}")
MK=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")

# Independent final choice for each proposed update, with an explicit reconciliation reason.
CHANGES={
 (3582,"de"):("BackIssue-Server bearbeiten","Both reviewers selected this action label. The edit modal title needs an imperative; the compound BackIssue-Server is grammatical German.", "high","both"),
 (3584,"ar"):("عنوان اختياري يمكن لمستخدميك فتحه في متصفحهم.","Choose the blind wording because it retains the source's possessive your users. It also fixes the misspelled optional and browser terms; the current مصففهم means hairdresser/stylist.","high","blind"),
 (3585,"zh_Hant"):("請輸入有效的 HTTP 或 HTTPS URL。","Choose the primary correction: valid URL is better expressed as 有效的 than 合法, and the polite request fits this validation caller. HTTP, HTTPS, and URL remain exact.","moderate","primary"),
 (3586,"hi"):("होस्टनाम या IP पता","Both reviewers restored the protected literal IP. This field label must retain the exact protocol acronym.","high","both"),
 (3587,"es"):("Introduzca un nombre de host válido o una dirección IP válida.","Choose the blind correction. The current target omits una before dirección and does not repeat válida for the IP option.","high","blind"),
 (3588,"de"):("SeerrNG sendet den vollständigen ComicVine-Band an BackIssue. BackIssue nutzt eigene Quellen und Download-Einstellungen, um Ausgaben zu finden und zu verfolgen.","Accept the primary refinement: Band is the natural German term for a comic volume, and the rest preserves the source/BackIssue division of responsibilities.","moderate","primary"),
 (3588,"fr"):("SeerrNG envoie le volume complet de ComicVine à BackIssue. BackIssue utilise ses propres sources et paramètres de téléchargement pour trouver et suivre les numéros.","Accept the primary refinement because it fixes French noun/adjective order and makes the ComicVine relation grammatical.","moderate","primary"),
 (3588,"vi"):("SeerrNG gửi toàn bộ tập truyện ComicVine cho BackIssue. BackIssue dùng các nguồn và cài đặt tải xuống riêng để tìm và theo dõi từng số truyện.","Accept the primary refinement: tập truyện expresses a comics volume more clearly than the English loan volume; BackIssue remains responsible for finding/tracking issues.","moderate","primary"),
 (3588,"id"):("SeerrNG mengirim seluruh jilid ComicVine ke BackIssue. BackIssue menggunakan sumber dan pengaturan unduhannya sendiri untuk menemukan dan melacak nomor terbitan.","Accept the primary refinement: jilid localizes volume and nomor terbitan distinguishes issues that BackIssue finds/tracks.","moderate","primary"),
 (3590,"zh_Hans"):("请输入此服务器的名称。","Choose the primary instruction form over the blind's punctuation-only repair. The caller is a required-field validation, so 请输入 is an appropriate direct prompt.","high","primary"),
 (3590,"ja"):("このサーバーの名前を入力してください。","Choose the blind correction. The caller is required-field validation; 入力してください is a natural polite request, unlike the current declarative 入力します.","high","blind"),
 (3590,"ko"):("이 서버의 이름을 입력하세요.","Choose the blind correction. The caller is required-field validation; the possessive name-of-this-server form is natural, unlike the current directional 에 construction.","high","blind"),
 (3590,"zh_Hant"):("請輸入此伺服器的名稱。","Choose the primary instruction form over the blind's punctuation-only repair. The caller is a required-field validation, so 請輸入 is an appropriate direct prompt.","high","primary"),
 (3592,"id"):("Masukkan nomor port yang valid.","Accept the primary refinement. Dropping sebuah keeps the port validation meaning and makes this concise Indonesian UI instruction more natural.","moderate","primary"),
 (3594,"es"):("Mantenga sincronizada la disponibilidad de SeerrNG","Both reviewers selected this target. It removes the awkward en sincronización calque while preserving the checkbox instruction.","moderate","both"),
 (3594,"zh_Hans"):("让 SeerrNG 的可用状态保持同步","Choose the primary correction because the current wording attaches 同步 awkwardly. This states that SeerrNG availability should remain synchronized.","moderate","primary"),
 (3594,"ja"):("SeerrNG の可用性を同期した状態に保つ","Choose the blind wording because it preserves the source's keep-in-sync meaning; the primary alternative only says to synchronize availability.","moderate","blind"),
 (3594,"fr"):("Maintenir la disponibilité de SeerrNG synchronisée","Choose the blind wording for a formal settings label. It corrects the missing de and replaces the awkward en synchronisation construction.","moderate","blind"),
 (3594,"ko"):("SeerrNG의 가용성을 동기화된 상태로 유지","Accept the primary refinement. 동기화된 상태로 유지 is a grammatical way to express keeping availability in a synchronized state.","moderate","primary"),
 (3594,"zh_Hant"):("讓 SeerrNG 的可用狀態保持同步","Choose the primary correction because the current wording attaches 同步 awkwardly; the proposed sentence clearly expresses keeping the availability state synchronized.","moderate","primary"),
 (3594,"id"):("Jaga agar ketersediaan SeerrNG tetap tersinkronisasi","Accept the primary wording. Jaga agar … tetap tersinkronisasi clearly expresses keeping availability synchronized in Indonesian.","moderate","primary"),
 (3595,"es"):("Escanea la colección para buscar cómics existentes y muestra las descargas activas de BackIssue en el estado de la solicitud.","Choose the blind correction because it retains the scan action while clarifying that the scan searches for existing comics; this stays closer to the source than the primary's Busca.","moderate","blind"),
 (3595,"zh_Hans"):("扫描收藏库以查找现有漫画，并在请求状态中显示正在进行的 BackIssue 下载。","Synthesize the stronger parts of both proposals: 收藏库 makes the collection/library explicit, and 正在进行的 naturally describes active downloads; retain natural Chinese punctuation.","moderate","cross-audit synthesis"),
 (3595,"ja"):("コレクションをスキャンして既存のコミックを探し、リクエストのステータスにBackIssueの進行中のダウンロードを表示します。","Accept the primary refinement. 探し expresses finding comics in the scan, リクエスト is the usual UI term, and 進行中 describes active downloads.","moderate","primary"),
 (3595,"fr"):("Analysez la collection à la recherche des bandes dessinées existantes et affichez les téléchargements BackIssue actifs dans le statut de la demande.","Accept the primary correction. Its paired imperatives match the source's paired instructions and its phrasing clearly says to scan for existing comics.","moderate","primary"),
 (3595,"id"):("Pindai koleksi untuk menemukan komik yang sudah ada dan tampilkan unduhan BackIssue yang sedang aktif di status permintaan.","Choose the blind correction because it explicitly says to scan the collection to find existing comics; the primary wording still reads like scanning a collection of comics.","moderate","blind"),
 (3596,"id"):("Tidak dapat menyimpan server BackIssue.","Accept the primary refinement. Tidak dapat matches the more formal register of the adjacent BackIssue connection-failure message; Tak bisa is colloquial.","moderate","primary"),
 (3597,"ko"):("BackIssue에 연결할 수 없습니다. 주소와 API 키를 확인하세요.","Accept the primary refinement. It preserves the error and turns the abrupt 확인 fragment into a clear polite instruction.","moderate","primary"),
}

def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def jread(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def writejl(p,rows): p.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in rows),encoding="utf-8")
def verify_sums(d):
 for line in (d/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
  if line.strip():
   expected,name=line.split(None,1); name=name.strip().lstrip("*")
   assert sha((d/name).read_bytes())==expected,(str(d/name),"checksum")
def run(args): return subprocess.check_output(args,text=True).strip()

def main():
 assert OUT.exists() and {x.name for x in OUT.iterdir()}=={"build-root-crossaudit.py"},"Root output contains unexpected files"
 for d in (INP,PRI,BLIND): verify_sums(d)
 manifest=jread(INP/"manifest.json"); window=jread(INP/"window.json"); attest=jread(INP/"PR-attestation.json")
 assert manifest["head"]==window["head"]==HEAD and manifest["tree"]==window["tree"]==TREE
 assert manifest["window"]==window["window"]=="W3580-W3599"
 assert manifest["sourceRecordCount"]==20 and manifest["cellCount"]==240
 pr=json.loads(run(["gh","pr","view","418","--repo","snapetech-org/seerrng","--json","state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url"]))
 assert (pr["state"],pr["isDraft"],pr["headRefName"],pr["headRefOid"],pr["baseRefName"])==("OPEN",True,BRANCH,HEAD,"main")
 remote=run(["git","ls-remote","https://github.com/snapetech-org/SeerrNG.git",f"refs/heads/{BRANCH}","refs/pull/418/head"])
 refs={x.split()[1]:x.split()[0] for x in remote.splitlines()}
 assert refs=={f"refs/heads/{BRANCH}":HEAD,"refs/pull/418/head":HEAD}
 live={"state":pr["state"],"draft":pr["isDraft"],"branch":pr["headRefName"],"head":pr["headRefOid"],"tree":TREE,"baseRef":pr["baseRefName"],"baseSha":pr["baseRefOid"],"branchRef":refs[f"refs/heads/{BRANCH}"],"pullRef":refs["refs/pull/418/head"],"url":pr["url"],"verifiedAtUtc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
 PDIR=PRI; BDIR=BLIND
 ps=jread(PDIR/"summary.json"); bs=jread(BDIR/"summary.json")
 assert ps["head"]==bs["pin"]["head"]==HEAD and ps["tree"]==bs["pin"]["tree"]==TREE
 assert ps["candidateFreeManifestJsonSha256"]==sha((INP/"manifest.json").read_bytes())
 assert ps["candidateFreeChecksumListSha256"]==sha((INP/"SHA256SUMS.txt").read_bytes())
 assert bs["candidateFreeInput"]["manifestSha256"]==sha((INP/"manifest.json").read_bytes())
 assert bs["candidateFreeInput"]["checksumListSha256"]==sha((INP/"SHA256SUMS.txt").read_bytes())
 sources=jl(INP/"source-cells.jsonl"); cells=jl(INP/"current-target-cells.jsonl"); contexts=jl(INP/"caller-contexts.jsonl"); blocks=jl(INP/"caller-context-blocks.jsonl")
 P=jl(PDIR/"primary-ledger.jsonl"); B=jl(BDIR/"blind-ledger.jsonl")
 assert len(sources)==20 and len(cells)==240 and len(contexts)==20 and len(P)==240 and len(B)==240
 source_by={r["position"]:r for r in sources}; ctx_by={r["position"]:r for r in contexts}
 cell_by={(r["position"],r["locale"]):r for r in cells}; p_by={(r["position"],r["locale"]):r for r in P}; b_by={(r["position"],r["locale"]):r for r in B}
 assert len(cell_by)==len(p_by)==len(b_by)==240
 locale_info={r["catalogKey"]:r for r in window["localeInfo"]}
 block_ids={r["contextId"]:r for r in blocks}
 assert set(p_by)==set(cell_by)==set(b_by)
 assert [r["position"] for r in sources]==list(range(3580,3600))
 assert all(ctx_by[pos]["callerCount"]==1 and ctx_by[pos]["directMessageReferences"] for pos in range(3580,3600))
 assert window["callerlessSourcePositions"]==[] and jread(INP/"caller-resolution-findings.json")["callerlessSourcePositions"]==[]
 assert bs["counts"]=={"propose":16,"retain":224,"hold":0}
 assert ps["dispositions"]=={"accept-current":216,"refinement":22,"correction":2}
 assert ps["callerlessHolds"]==bs["callerlessHolds"]==0

 root_ledger=[]; disagreements=[]; updates=[]
 for pos in range(3580,3600):
  src=source_by[pos]; ctx=ctx_by[pos]
  for loc in LOCALES:
   key=(pos,loc); c=cell_by[key]; p=p_by[key]; b=b_by[key]
   assert c["sourceId"]==p["sourceId"]==b["sourceId"]==src["sourceId"]
   assert c["source"]==p["source"]==b["source"]==src["source"]
   assert c["sourceSha256"]==p["sourceSha256"]==b["sourceSha256"]==src["sourceSha256"]
   assert c["currentTarget"]==p["currentTarget"]==b["currentTarget"]
   assert c["currentTargetSha256"]==p["currentTargetSha256"]==b["currentTargetSha256"]==st(c["currentTarget"])
   assert p["catalogPath"]==b["catalogPath"]==c["catalogPath"]
   assert p["catalogGitBlob"]==b["catalogGitBlob"]==c["catalogGitBlob"]
   assert p["catalogSha256"]==b["catalogSha256"]==c["catalogSha256"]
   assert p["callerContext"]["directMessageReferences"]==ctx["directMessageReferences"]
   assert p["callerContext"]["callerCount"]==ctx["callerCount"]==b["callerCount"]
   assert b["callerRefs"]==ctx["directMessageReferences"]
   assert all(block_id in block_ids for block_id in ctx["contextBlockIds"])
   assert b["callerContextBlockIds"]==ctx["contextBlockIds"]
   assert p["head"]==HEAD and p["tree"]==TREE
   pt=p["finalTarget"]; bt=b["target"]; cur=c["currentTarget"]
   assert p["finalTargetSha256"]==st(pt) and b["targetSha256"]==st(bt)
   assert (p["finalTarget"]==cur)==(p["disposition"]=="accept-current")
   assert (b["target"]==cur)==(b["disposition"]=="retain")
   if key in CHANGES:
    target,reason,conf,source=CHANGES[key]
   else:
    assert pt==cur and bt==cur,(key,"unadjudicated proposal")
    target=cur
    reason="Both independent reviewers retain the exact current value; the pinned caller and locale context support its meaning, and no structural-token issue requires a change."
    conf="moderate"; source="retain"
   assert target is not None
   disagreement=(pt!=bt)
   if disagreement:
    assert key in CHANGES,(key,"proposal disagreement lacks resolution")
    resolution=reason
    disagreements.append({"position":pos,"sourceId":src["sourceId"],"locale":loc,"currentTarget":cur,"primaryDisposition":p["disposition"],"primaryTarget":pt,"blindDisposition":b["disposition"],"blindTarget":bt,"rootTarget":target,"resolutionKind":source,"resolution":resolution,"primaryTargetSha256":st(pt),"blindTargetSha256":st(bt),"rootTargetSha256":st(target)})
   else: resolution=None
   disp="hold" if ctx["callerCount"]==0 else ("retain-current" if target==cur else "propose-update")
   # Recompute structural constraints against candidate-free source tokens and final root choice.
   phs=src["sourcePlaceholders"]; mks=src["sourceMarkupTokens"]; nums=src["sourceNumericTokens"]; lits=src["sourceProtectedLiterals"]
   final_checks={"placeholdersPreserved":phs==PH.findall(target),"markupPreserved":mks==MK.findall(target),"numericTokensPreserved":nums==NUM.findall(target),"protectedLiteralsPreserved":all(t in target for t in lits)}
   assert all(final_checks.values()),(key,final_checks)
   baseline={"placeholder":c["placeholderTokenMismatch"],"markup":c["markupTokenMismatch"],"numeric":c["numericTokenMismatch"],"protectedLiteral":c["protectedLiteralMismatch"]}
   root_row={"window":"W3580-W3599","position":pos,"sourceId":src["sourceId"],"sourceIdSha256":src["sourceIdSha256"],"sourceKey":src["sourceKey"],"source":src["source"],"sourceSha256":src["sourceSha256"],"locale":loc,"localeTag":locale_info[loc]["tag"],"direction":locale_info[loc]["direction"],"catalogPath":c["catalogPath"],"catalogGitBlob":c["catalogGitBlob"],"catalogSha256":c["catalogSha256"],"currentTarget":cur,"currentTargetSha256":c["currentTargetSha256"],"primaryDisposition":p["disposition"],"primaryTarget":pt,"primaryTargetSha256":st(pt),"primaryConfidence":p["confidence"],"primaryRationale":p["rationale"],"blindDisposition":b["disposition"],"blindTarget":bt,"blindTargetSha256":st(bt),"blindConfidence":b["confidence"],"blindRationale":b["rationale"],"rootDisposition":disp,"rootTarget":target,"rootTargetSha256":st(target),"rootConfidence":conf,"rootRationale":reason,"rootDecisionBasis":source,"reviewerTargetsDisagree":disagreement,"disagreementResolution":resolution,"callerResolution":ctx["callerResolution"],"callerCount":ctx["callerCount"],"callerContextBlockIds":ctx["contextBlockIds"],"definitionFiles":ctx["definitionFiles"],"callerRefs":ctx["directMessageReferences"],"baselineStructuralMismatchFlags":baseline,"rootStructuralChecks":final_checks}
   root_ledger.append(root_row)
   if disp=="propose-update":
    updates.append({"position":pos,"sourceId":src["sourceId"],"sourceKey":src["sourceKey"],"locale":loc,"catalogPath":c["catalogPath"],"catalogGitBlob":c["catalogGitBlob"],"currentTarget":cur,"currentTargetSha256":c["currentTargetSha256"],"target":target,"targetSha256":st(target),"rootRationale":reason,"primaryDisposition":p["disposition"],"blindDisposition":b["disposition"],"reviewerTargetsDisagree":disagreement,"resolutionKind":source,"confidence":conf})
 assert len(root_ledger)==240 and len(updates)==28 and len(disagreements)>0
 assert len({(u["position"],u["locale"]) for u in updates})==len(updates)
 assert len({r["sourceId"] for r in sources})==20
 baseline_counts={"placeholder":sum(c["placeholderTokenMismatch"] for c in cells),"markup":sum(c["markupTokenMismatch"] for c in cells),"numeric":sum(c["numericTokenMismatch"] for c in cells),"protectedLiteral":sum(c["protectedLiteralMismatch"] for c in cells)}
 assert baseline_counts=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1}
 final_counts={"placeholder":sum(not r["rootStructuralChecks"]["placeholdersPreserved"] for r in root_ledger),"markup":sum(not r["rootStructuralChecks"]["markupPreserved"] for r in root_ledger),"numeric":sum(not r["rootStructuralChecks"]["numericTokensPreserved"] for r in root_ledger),"protectedLiteral":sum(not r["rootStructuralChecks"]["protectedLiteralsPreserved"] for r in root_ledger)}
 assert final_counts=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":0}
 OUT.mkdir(exist_ok=True)
 writejl(OUT/"root-decision-ledger.jsonl",root_ledger)
 writejl(OUT/"proposal-disagreements.jsonl",disagreements)
 plan={"schemaVersion":1,"planType":"proposal-only-no-authorization","repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3580-W3599","head":HEAD,"tree":TREE,"candidateFreeManifestSha256":sha((INP/"manifest.json").read_bytes()),"primaryChecksumListSha256":sha((PRI/"SHA256SUMS.txt").read_bytes()),"blindChecksumListSha256":sha((BLIND/"SHA256SUMS.txt").read_bytes()),"updateCount":len(updates),"holdCount":0,"authorizedForApplication":False,"updates":updates}
 writej(OUT/"application-plan-proposal.json",plan)
 bydisp={d:sum(r["rootDisposition"]==d for r in root_ledger) for d in ["propose-update","retain-current","hold"]}
 agreed=sum(r["primaryTarget"]==r["blindTarget"] and r["primaryTarget"]!=r["currentTarget"] for r in root_ledger)
 summ={"schemaVersion":1,"artifact":"SeerrNG PR #418 W3580-W3599 independent root cross-audit","repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3580-W3599","pin":{"head":HEAD,"tree":TREE,"branch":BRANCH,"state":"OPEN","draft":True,"baseRef":"main","baseSha":pr["baseRefOid"],"branchRef":refs[f"refs/heads/{BRANCH}"],"pullRef":refs["refs/pull/418/head"]},"candidateFreeInput":{"path":str(INP),"manifestSha256":sha((INP/"manifest.json").read_bytes()),"checksumListSha256":sha((INP/"SHA256SUMS.txt").read_bytes()),"sourceOrderSha256":manifest["sourceOrderSha256"]},"primary":{"path":str(PRI),"checksumListSha256":sha((PRI/"SHA256SUMS.txt").read_bytes()),"ledgerSha256":sha((PRI/"primary-ledger.jsonl").read_bytes()),"summarySha256":sha((PRI/"summary.json").read_bytes()),"proposalCount":ps["proposedChanges"]},"blind":{"path":str(BLIND),"checksumListSha256":sha((BLIND/"SHA256SUMS.txt").read_bytes()),"ledgerSha256":sha((BLIND/"blind-ledger.jsonl").read_bytes()),"summarySha256":sha((BLIND/"summary.json").read_bytes()),"proposalCount":bs["counts"]["propose"]},"sourceCount":20,"localeCount":12,"cellCount":240,"rootCounts":bydisp,"rootUpdates":len(updates),"reviewerTargetDisagreements":len(disagreements),"jointlyProposedSameTargetUpdates":agreed,"baselineStructuralMismatchCounts":baseline_counts,"finalStructuralMismatchCounts":final_counts,"callerlessSourceCount":0,"callerlessHolds":0,"priorWindowHoldCount":window["previousWindowHoldCount"],"holdsPreservedOutsideWindow":True,"deduplication":{"uniqueSourceIds":len({r["sourceId"] for r in sources})==20,"uniqueSourceLocaleCells":len(root_ledger)==len({(r["sourceId"],r["locale"]) for r in root_ledger}),"uniqueUpdates":len(updates)==len({(r["sourceId"],r["locale"]) for r in updates})},"nativeSpeakerReviewPending":True,"applicationAuthorized":False,"createdAtUtc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
 writej(OUT/"summary.json",summ)
 writej(OUT/"live-attestation.json",{"repository":pr["url"],"pullRequest":418,"state":pr["state"],"draft":pr["isDraft"],"branch":BRANCH,"head":HEAD,"tree":TREE,"baseRef":"main","baseSha":pr["baseRefOid"],"branchRef":refs[f"refs/heads/{BRANCH}"],"pullRef":refs["refs/pull/418/head"],"verifiedAtUtc":live["verifiedAtUtc"] if "verifiedAtUtc" in live else datetime.datetime.now(datetime.timezone.utc).isoformat()})
 manual="""# Manual audit evidence

## Pin and packet scope

The audit reconciled the checksum-pinned candidate-free, primary, and independent blind packets at SeerrNG PR #418 head 30f626a4626d460f426666cde02f5c1ed17fa206 / tree 9b2616780791c73eb176aca6ad53061f1f3587d8. Live PR metadata reports OPEN/draft; branch and pull refs still match. The 20 source IDs are zero-based positions 3580–3599, with 12 direct locales and 240 unique source-ID/locale cells.

Every selected source has one exact direct message-property caller in the pinned candidate-free context, under the BackIssue modal namespace except the final Bindery modal action. Caller refs, definition/caller block IDs, catalog path/blob/SHA, current target hash, and both review targets are retained in the root ledger.

## Structural and deduplication checks

The candidate-free baseline has zero placeholder, markup, and numeric mismatches, plus one protected-literal mismatch: Hindi position 3586 translated protected IP as आईपी. The root target restores exact IP. All 240 root targets preserve the source placeholder, markup, numeric, and protected-literal constraints; final mismatch counts are zero. Arabic remains the sole RTL locale. The 28 update keys are unique and do not duplicate any source-ID/locale cell.

## Reconciled proposal decisions

- Position 3584 Arabic: use مستخدميك (“your users”) from the blind proposal, preserving the possessive source detail while correcting the erroneous browser word.
- Position 3585 Traditional Chinese and 3587 Spanish: accept validation refinements. Use 有效的 rather than 合法 for a valid URL; add the missing Spanish article and repeat válida for both alternatives.
- Position 3588 German, French, Vietnamese, and Indonesian: accept primary terminology/grammar refinements for comic volume and issue. The source and helper context distinguish the ComicVine volume sent to BackIssue from the issues BackIssue finds and tracks.
- Position 3590: use the primary polite Chinese validation instructions; use the blind Japanese/Korean corrections because the exact callers are required-field validation and the current wording is declarative/grammatically awkward.
- Position 3592 Indonesian: accept the primary's concise port-number validation wording.
- Position 3594 availability sync: choose primary wording for Simplified/Traditional Chinese and Korean; blind wording for Japanese and formal French; both agree on Spanish. For Indonesian use the primary wording, which explicitly says to keep availability synchronized.
- Position 3595 sync help: choose blind Spanish and Indonesian because they preserve that the collection is scanned to find existing comics; choose primary French and Japanese imperative/terminology refinements. For Simplified Chinese synthesize 收藏库 (collection/library) with 正在进行的 (ongoing downloads), correcting its punctuation and collection relation.
- Positions 3596 Indonesian and 3597 Korean: accept the primary register/imperative refinements, matching the adjacent connection-error style and making the API-key instruction complete.

All other cells retain current values: both reviewers found them semantically adequate for the direct settings, validation, helper, toast, or modal-action context, and their protected service/protocol names remain intact. No callerless or unresolved cells remain in this window. No application or release is authorized by this packet; native-speaker review remains pending.
"""
 (OUT/"manual-audit-evidence.md").write_text(manual,encoding="utf-8")
 readme="""# SeerrNG PR #418 W3580-W3599 root cross-audit

This packet reconciles all 240 cells from the checksum-pinned candidate-free input, primary ledger, and independent blind ledger. It includes a root decision for every cell, exact reviewer targets and rationales, a separate disagreement ledger, and a proposal-only update plan. No repository or PR metadata was changed; the application plan is not authorization to apply.

The candidate-free source window uses zero-based positions. The live PR, branch, and pull refs were reattested at the pinned head/tree immediately before packet creation. The sealed upstream packets and their hashes are recorded in summary.json. Verify all local checksums with sha256sum -c SHA256SUMS.txt and run python3 verify-crossaudit.py.
"""
 (OUT/"README.md").write_text(readme,encoding="utf-8")
 verifier=r'''#!/usr/bin/env python3
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
TASK=ROOT.parent
INP=TASK/"seerrng-pr418-w3580-3599-primary-20261103"/"candidate-free-input"
PRI=TASK/"seerrng-pr418-w3580-3599-primary-20261103"/"primary-review"
BLIND=TASK/"seerrng-pr418-w3580-3599-blind-20261103"
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def sums(d):
 for line in (d/"SHA256SUMS.txt").read_text().splitlines():
  if line.strip():
   digest,name=line.split(None,1); name=name.strip().lstrip("*")
   assert sha((d/name).read_bytes())==digest,(str(d/name),"checksum")
for d in (INP,PRI,BLIND,ROOT): sums(d)
m=j(INP/"manifest.json"); w=j(INP/"window.json"); s=j(ROOT/"summary.json"); plan=j(ROOT/"application-plan-proposal.json")
P=jl(PRI/"primary-ledger.jsonl"); B=jl(BLIND/"blind-ledger.jsonl"); R=jl(ROOT/"root-decision-ledger.jsonl"); D=jl(ROOT/"proposal-disagreements.jsonl"); U=plan["updates"]
sources=jl(INP/"source-cells.jsonl"); cells=jl(INP/"current-target-cells.jsonl"); ctxs=jl(INP/"caller-contexts.jsonl")
assert m["head"]==s["pin"]["head"]==plan["head"]=="30f626a4626d460f426666cde02f5c1ed17fa206"
assert m["tree"]==s["pin"]["tree"]==plan["tree"]=="9b2616780791c73eb176aca6ad53061f1f3587d8"
assert len(sources)==20 and len(cells)==len(P)==len(B)==len(R)==240
assert s["candidateFreeInput"]["manifestSha256"]==sha((INP/"manifest.json").read_bytes())
assert s["primary"]["checksumListSha256"]==sha((PRI/"SHA256SUMS.txt").read_bytes())
assert s["blind"]["checksumListSha256"]==sha((BLIND/"SHA256SUMS.txt").read_bytes())
assert len({(r["position"],r["locale"]) for r in R})==240
pmap={(r["position"],r["locale"]):r for r in P}; bmap={(r["position"],r["locale"]):r for r in B}
cmap={(r["position"],r["locale"]):r for r in cells}; cmapx={r["position"]:r for r in ctxs}
PH=re.compile(r"\{[^{}\r\n]+\}"); MK=re.compile(r"</?[A-Za-z][^<>]*?/?>"); NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
for r in R:
 k=(r["position"],r["locale"]); p=pmap[k]; b=bmap[k]; c=cmap[k]; ctx=cmapx[r["position"]]
 assert r["sourceId"]==p["sourceId"]==b["sourceId"]==c["sourceId"]
 assert r["source"]==p["source"]==b["source"]==c["source"]
 assert r["currentTarget"]==p["currentTarget"]==b["currentTarget"]==c["currentTarget"]
 assert r["currentTargetSha256"]==st(r["currentTarget"])==c["currentTargetSha256"]
 assert r["primaryTarget"]==p["finalTarget"] and r["blindTarget"]==b["target"]
 assert r["primaryTargetSha256"]==st(r["primaryTarget"]) and r["blindTargetSha256"]==st(r["blindTarget"])
 assert r["rootTargetSha256"]==st(r["rootTarget"])
 assert r["callerRefs"]==ctx["directMessageReferences"]==b["callerRefs"]
 assert r["callerCount"]==ctx["callerCount"]==b["callerCount"]>0
 assert r["catalogPath"]==c["catalogPath"]==p["catalogPath"]==b["catalogPath"]
 assert r["catalogGitBlob"]==c["catalogGitBlob"]==p["catalogGitBlob"]==b["catalogGitBlob"]
 assert r["catalogSha256"]==c["catalogSha256"]==p["catalogSha256"]==b["catalogSha256"]
 src=next(x for x in sources if x["position"]==r["position"])
 assert r["rootStructuralChecks"]["placeholdersPreserved"]==(src["sourcePlaceholders"]==PH.findall(r["rootTarget"]))
 assert r["rootStructuralChecks"]["markupPreserved"]==(src["sourceMarkupTokens"]==MK.findall(r["rootTarget"]))
 assert r["rootStructuralChecks"]["numericTokensPreserved"]==(src["sourceNumericTokens"]==NUM.findall(r["rootTarget"]))
 assert r["rootStructuralChecks"]["protectedLiteralsPreserved"]==all(t in r["rootTarget"] for t in src["sourceProtectedLiterals"])
 assert all(r["rootStructuralChecks"].values())
assert s["rootCounts"]=={"propose-update":28,"retain-current":212,"hold":0}
assert s["rootUpdates"]==len(U)==28 and len({(r["position"],r["locale"]) for r in U})==28
assert s["reviewerTargetDisagreements"]==len(D)
assert plan["authorizedForApplication"] is False and plan["holdCount"]==0
assert s["baselineStructuralMismatchCounts"]=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1}
assert s["finalStructuralMismatchCounts"]=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":0}
assert s["deduplication"]["uniqueSourceIds"] and s["deduplication"]["uniqueSourceLocaleCells"] and s["deduplication"]["uniqueUpdates"]
assert all(x["rootDisposition"]=="propose-update" for x in R if x["rootTarget"]!=x["currentTarget"])
assert all(x["rootDisposition"]=="retain-current" for x in R if x["rootTarget"]==x["currentTarget"])
for x in D:
 k=(x["position"],x["locale"]); r=next(y for y in R if (y["position"],y["locale"])==k)
 assert x["primaryTarget"]==r["primaryTarget"] and x["blindTarget"]==r["blindTarget"] and x["rootTarget"]==r["rootTarget"]
# Check the root manifest points at every artifact other than its checksum list.
entries=[]
for line in (ROOT/"SHA256SUMS.txt").read_text().splitlines():
 d,n=line.split(None,1); entries.append((n.strip().lstrip("*"),d))
assert len(entries)==len({n for n,d in entries})
assert {n for n,d in entries}=={p.name for p in ROOT.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
for n,d in entries: assert sha((ROOT/n).read_bytes())==d,n
print(json.dumps({"result":"PASS","inputPrimaryBlindChecksums":"PASS","rootChecksums":"PASS","cells":len(R),"rootCounts":s["rootCounts"],"updates":len(U),"disagreements":len(D),"baselineMismatchCounts":s["baselineStructuralMismatchCounts"],"finalMismatchCounts":s["finalStructuralMismatchCounts"],"summarySha256":sha((ROOT/"summary.json").read_bytes()),"checksumListSha256":sha((ROOT/"SHA256SUMS.txt").read_bytes())},indent=2))
'''
 (OUT/"verify-crossaudit.py").write_text(verifier,encoding="utf-8")
 os.chmod(OUT/"verify-crossaudit.py",0o755)
 with (OUT/"SHA256SUMS.txt").open("w",encoding="utf-8") as f:
  for p in sorted((x for x in OUT.iterdir() if x.is_file() and x.name!="SHA256SUMS.txt"),key=lambda x:x.name):
   f.write(f"{sha(p.read_bytes())}  {p.name}\n")
 print(json.dumps({"output":str(OUT),"rootCounts":bydisp,"updates":len(updates),"disagreements":len(disagreements),"baseline":baseline_counts,"final":final_counts},ensure_ascii=False,indent=2))
if __name__=="__main__": main()

