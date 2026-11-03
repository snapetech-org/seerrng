#!/usr/bin/env python3
"""Build the sealed SeerrNG W3680-W3699 independent cross-audit packet."""
from collections import Counter
from datetime import datetime, timezone
import hashlib, json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parent
I=ROOT/"evidence/candidate-free-input"
P=ROOT/"evidence/primary-review"
B=ROOT/"independent-review"
HEAD="a2f015c040f933eff38e6ef3d9b1ac6050c4957d"
TREE="9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe"
BRANCH="codex/seerrng-localization-overhaul-20261028"
REPO="snapetech-org/seerrng"
WINDOW="W3680-W3699"
PROTECTED=["SeerrNG","Audiobookshelf","ISBN","API","URL","HTTP","HTTPS","IP","SSL","BackIssue","Bindery","BookshelfNG","ComicVine","Plex","Jellyfin","BINDERY_ENFORCE_TENANCY","Auto-approve requests","library.view","library.manage","downloads.grab","Jellystat"]
HEADER=re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?")
CAT=re.compile(r"(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{")
MARKUP=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUMBER=re.compile(r"(?<![A-Za-z0-9])\d+(?:(?:,|\.|\u00a0|\u202f| )\d{3})*(?![A-Za-z0-9])")
PT_MIL=re.compile(r"(?<![A-Za-z0-9])(\d+(?:[.,]\d+)?)\s*mil\b",re.I)

# Every cell where reviewers did not make the same disposition/target is adjudicated here.
# Proposals marked current reject both proposed alternatives for this locale/caller.
OVERRIDES={
 (3680,"ja"):("primary","correction","A live selected-count status needs the author counter 人 and should describe the current selection state; 選択中 avoids implying a completed action."),
 (3680,"vi"):("primary","refinement","The live count label reads naturally in Vietnamese as Đã chọn {count} tác giả and keeps the count explicit."),
 (3680,"zh_Hant"):("primary","refinement","Use Traditional Chinese wording and the author counter 位; this gives a grammatical selected-author count."),
 (3681,"ja"):("primary","correction","The filtered result set contains authors, so 著者 and the people counter 人 preserve the source object more precisely than generic 項目 and 件."),
 (3681,"ko"):("primary","correction","Use the author counter 명 and state that select-all adds matching authors; this retains both 1,000 limits and the filter instruction."),
 (3681,"pt_BR"):("current","accept-current","Selecionar todos is a natural plural button label for the authors. The alternative Selecionar tudo is stylistic; the current target preserves both limits and the filter instruction."),
 (3683,"hi"):("primary","correction","The relative clause should say the database stores data for these authors. The current वाली construction is awkward and less clear about the database relationship."),
 (3686,"hi"):("current","accept-current","Sidecar names a specific companion-file type in this migration preview. Retain the familiar technical transliteration instead of broadening it to generic supporting files."),
 (3686,"id"):("blind","correction","Sespan can mean a motorcycle sidecar. Berkas pendamping clearly describes companion files in this migration preview."),
 (3686,"pt_BR"):("primary","correction","Keep sidecar as the technical file type in lowercase; the current title-style capitalization makes it look like a product name."),
 (3689,"fr"):("primary","correction","The caller is a file-move action button. Name the displacement in the label instead of leaving the generic Démarrer."),
 (3690,"es"):("primary","correction","Traslado is the natural file-move term here; it replaces the awkward literal movimiento while retaining the specific failed attempt."),
 (3690,"fr"):("primary","correction","Use the specific past inability and the natural file-move term déplacement."),
 (3690,"ko"):("blind","correction","Fix the missing Korean word boundary and state that this particular move failed to start."),
 (3691,"es"):("primary","correction","Use the file-move term traslado and preserve the source progress ellipsis."),
 (3691,"fr"):("primary","refinement","The identical proposals add the move being started to an otherwise generic progress label."),
 (3691,"pt_BR"):("primary","correction","The current phrase is awkward Brazilian Portuguese; Iniciando a movimentação is a natural in-progress label."),
 (3692,"hi"):("primary","refinement","स्थानांतरण gives a clear Hindi title for this library-path migration setting without changing the feature name."),
 (3693,"de"):("current","accept-current","Batch is standard German software terminology for this operation. Gruppe is broader than the source batch and does not improve precision."),
 (3693,"fr"):("primary","correction","Renvoyé is natural for an API response, Filtrez is a direct instruction, and the narrow no-break space formats 10,000 naturally in French."),
 (3693,"id"):("primary","refinement","Saring is a natural localized verb for filtering, and kelompok expresses the batch selection without relying on the English loanword."),
 (3693,"ja"):("primary","correction","The caller is a migration flow; specifying the authors to move makes the filtering instruction concrete while preserving the 10,000 limit."),
 (3693,"ko"):("primary","correction","저자 is the book-author term used by this feature, and the proposed text gives a direct filtering instruction before batch selection."),
 (3693,"pt_BR"):("primary","correction","Use the locale's 10.000 grouping and a direct imperative. The existing 10 mil is numerically equal but the sentence is a fragment."),
 (3695,"fr"):("primary","correction","The caller uses Connect as an action button, so the infinitive Connecter fits better than the noun Connexion."),
 (3695,"id"):("primary","refinement","Hubungkan is the clearer Indonesian action label for connecting the Jellystat service."),
 (3695,"ja"):("current","accept-current","接続 is a conventional concise Japanese UI action label. The alternative 接続する is also understandable but the added する is not needed."),
 (3696,"ja"):("blind","correction","The server is the destination of the connection, so Japanese requires に rather than the object marker を."),
 (3698,"fr"):("blind","correction","The current text says API settings but omits that these are API-key settings. The selected text restores that source detail."),
 (3698,"hi"):("blind","correction","Preserve the exact API and Jellystat literals. This wording locates key creation in Jellystat's API-key settings and retains server-side storage."),
 (3698,"ja"):("blind","correction","Remove the repeated で construction and unnecessary spaces; the selected sentence naturally locates the key in Jellystat's API-key settings."),
 (3698,"ko"):("primary","correction","Remove the duplicated location particle and make both key creation and server storage complete Korean sentences."),
 (3698,"pt_BR"):("primary","correction","Nas configurações de chaves de API do Jellystat accurately describes where to create the key; the current com as chaves da API changes that relation."),
 (3698,"vi"):("blind","refinement","Avoid repeating API key for both the new key and the settings label while retaining the Jellystat setting and server-storage details."),
 (3699,"ja"):("primary","correction","The required-field caller presents an instruction, so the polite request form 入力してください is clearer than the statement 入力します."),
 (3699,"ko"):("primary","correction","The Yup required-field caller needs a complete instruction; adding the particle and polite verb fixes the current noun fragment."),
 (3699,"pt_BR"):("primary","refinement","A chave de API is the natural Brazilian Portuguese phrase for an API key."),
 (3699,"zh_Hant"):("primary","refinement","Remove the space before the full-width Chinese full stop; the selected text preserves Traditional Chinese wording."),
}

def sha(b):
    if isinstance(b,str): b=b.encode("utf-8")
    return hashlib.sha256(b).hexdigest()

def canon(x):
    return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def write_json(path,obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")

def write_jsonl(path,rows):
    path.write_text("".join(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for row in rows),encoding="utf-8")

def check_sums(folder):
    sums=folder/"SHA256SUMS.txt"
    listed={}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        digest,name=line.split(None,1); listed[name.strip().lstrip("*")]=digest
    actual={p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file() and p.relative_to(folder).as_posix()!="SHA256SUMS.txt"}
    assert set(listed)==actual,(folder,set(listed)-actual,actual-set(listed))
    for name,digest in listed.items():
        assert sha((folder/name).read_bytes())==digest,(folder,name)
    return len(listed)

def icu(text):
    out=[]; i=0
    while i<len(text):
        if text[i]!="{": i+=1; continue
        start=i; depth=1; k=i+1
        while k<len(text) and depth:
            if text[k]=="{": depth+=1
            elif text[k]=="}": depth-=1
            k+=1
        if depth: break
        body=text[start+1:k-1]; m=HEADER.match(body)
        if m:
            name,fmt=m.group(1),m.group(2)
            cats=[x.group(1) for x in CAT.finditer(body[m.end():])] if fmt in ("plural","select","selectordinal") else []
            out.append({"name":name,"formatter":fmt or None,"pluralCategories":cats})
        i=k
    return out

def catmap(tokens):
    return {t["name"]:sorted(t["pluralCategories"]) for t in tokens if t["pluralCategories"]}

def sig(tokens):
    return Counter((t["name"],t["formatter"]) for t in tokens)

def protected(text):
    return [x for x in PROTECTED if x in text]

def numeric_tokens(text,locale):
    spans=[]; masked=list(text)
    if locale=="pt_BR":
        for m in PT_MIL.finditer(text):
            raw=m.group(0); value=int(float(m.group(1).replace(",","."))*1000)
            spans.append((m.start(),m.end(),raw,value))
            for i in range(m.start(),m.end()): masked[i]=" "
    masked_text="".join(masked)
    for m in NUMBER.finditer(masked_text):
        raw=m.group(0); value=int(re.sub(r"[,.\u00a0\u202f ]","",raw))
        spans.append((m.start(),m.end(),raw,value))
    spans.sort()
    return [{"surface":raw,"value":value} for _,__,raw,value in spans]

def token_audit(source,current,primary,blind,final,locale):
    s_i=icu(source); s_markup=MARKUP.findall(source); s_req=protected(source)
    variants={"current":current,"primary":primary,"blind":blind,"final":final}
    audits={}
    source_nums=numeric_tokens(source,"en")
    for name,text in variants.items():
        t_i=icu(text)
        nums=numeric_tokens(text,locale)
        audits[name]={
            "sha256":sha(text),
            "placeholderTokens":t_i,
            "placeholderMultisetMatchesSource":sig(t_i)==sig(s_i),
            "icuPluralCategories":catmap(t_i),
            "icuPluralCategoriesMatchSource":catmap(t_i)==catmap(s_i),
            "markupTokens":MARKUP.findall(text),
            "markupMatchesSource":MARKUP.findall(text)==s_markup,
            "numericTokens":nums,
            "numericValues":[x["value"] for x in nums],
            "numericValuesMatchSource":[x["value"] for x in source_nums]==[x["value"] for x in nums],
            "requiredProtectedLiterals":s_req,
            "protectedLiteralsPresent":{lit:(lit in text) for lit in s_req},
            "protectedLiteralsMatchSource":all(lit in text for lit in s_req),
        }
    return audits

def live_ok(path):
    x=j(path)
    assert x["expected"]["head"]==HEAD and x["expected"]["tree"]==TREE and x["expected"]["branch"]==BRANCH
    assert x["pr"]["number"]==418 and x["pr"]["state"]=="OPEN" and x["pr"]["isDraft"] is True
    assert x["pr"]["headRefName"]==BRANCH and x["pr"]["headRefOid"]==HEAD
    assert x["pr"]["baseRefName"]=="main" and x["pr"]["baseRefOid"]=="221d8e0d542802da7529cd272c928cc747677e5c"
    assert x["refs"].get(f"refs/heads/{BRANCH}")==HEAD and x["refs"].get("refs/pull/418/head")==HEAD
    assert x["headCommit"]==HEAD and x["headTree"]==TREE
    return x

def main():
    assert I.is_dir() and P.is_dir() and B.is_dir()
    cf_hashes=check_sums(I); primary_hashes=check_sums(P); blind_hashes=check_sums(B)
    im=j(I/"manifest.json"); pm=j(P/"manifest.json"); bm=j(B/"manifest.json")
    assert (im["repository"],im["pullRequest"],im["window"],im["head"],im["tree"])==(REPO,418,WINDOW,HEAD,TREE)
    assert (im["sourceRecordCount"],len(j(I/"window.json")["localeOrder"]),im["cellCount"])==(20,12,240)
    assert pm["candidateFreeInputManifestSha256"]==sha((I/"manifest.json").read_bytes())
    assert pm["candidateFreeInputChecksumListSha256"]==sha((I/"SHA256SUMS.txt").read_bytes())
    assert bm.get("primaryDirectoryOpened") is False
    assert bm.get("primaryCandidateOrDecisionExposed") is False
    live_ok(ROOT/"cross-audit-start-live-attestation.json")
    live_ok(ROOT/"before-live-attestation.json")
    after=ROOT/"after-live-attestation.json"
    if after.exists(): live_ok(after)

    sources=jl(I/"source-cells.jsonl"); cells=jl(I/"current-target-cells.jsonl")
    contexts=jl(I/"caller-contexts.jsonl"); blocks=jl(I/"caller-context-blocks.jsonl")
    p_rows=jl(P/"primary-ledger.jsonl"); b_rows=jl(B/"blind-ledger.jsonl")
    holds=jl(I/"carry-forward-hold-hashes.jsonl")
    blind_holds=jl(B/"prior-hold-reattestation.jsonl")
    assert len(sources)==20 and len(cells)==240 and len(contexts)==20 and len(p_rows)==240 and len(b_rows)==240
    assert len(holds)==len(blind_holds)==12
    source_by_pos={r["position"]:r for r in sources}
    cell_by_key={(r["position"],r["locale"]):r for r in cells}
    ctx_by_key={(r["position"],r["sourceId"]):r for r in contexts}
    block_by_id={r["contextId"]:r for r in blocks}
    p_by_key={(r["position"],r["locale"]):r for r in p_rows}
    b_by_key={(r["position"],r["locale"]):r for r in b_rows}
    assert len(cell_by_key)==len(p_by_key)==len(b_by_key)==240
    keys=set(cell_by_key)
    assert keys==set(p_by_key)==set(b_by_key)
    assert set(OVERRIDES).issubset(keys)

    for key in sorted(keys):
        c=cell_by_key[key]; s=source_by_pos[key[0]]; cx=ctx_by_key[(key[0],s["sourceId"])]
        p=p_by_key[key]; b=b_by_key[key]
        assert p["sourceId"]==b["sourceId"]==s["sourceId"]==c["sourceId"]
        assert p["source"]==b["source"]==s["source"]==c["source"]
        assert p["sourceSha256"]==b["sourceSha256"]==s["sourceSha256"]==c["sourceSha256"]==sha(s["source"])
        assert p["sourceIdSha256"]==b["sourceIdSha256"]==s["sourceIdSha256"]==c["sourceIdSha256"]==sha(s["sourceId"])
        assert p["currentTarget"]==b["currentTarget"]==c["currentTarget"]
        assert p["currentTargetSha256"]==b["currentTargetSha256"]==c["currentTargetSha256"]==sha(c["currentTarget"])
        assert (p["catalogPath"],p["catalogSha256"],p["catalogGitBlob"])==(c["catalogPath"],c["catalogSha256"],c["catalogGitBlob"])
        assert b["catalogEvidence"]["path"]==c["catalogPath"] and b["catalogEvidence"]["sha256"]==c["catalogSha256"] and b["catalogEvidence"]["gitBlob"]==c["catalogGitBlob"]
        assert p["callerContextIds"]==cx["contextBlockIds"]==b["callerEvidence"]["contextBlockIds"]
        assert p["callerResolution"]==cx["callerResolution"]==b["callerEvidence"]["callerResolution"]
        assert p["directCallerCount"]==cx["callerCount"]==b["callerEvidence"]["callerCount"] and cx["callerCount"]>0
        assert p["callerContextSha256"]==sha(canon(cx))
        bblocks={x["contextId"]:x for x in b["callerEvidence"]["contextBlocks"]}
        assert set(bblocks)==set(cx["contextBlockIds"])
        for block_id in cx["contextBlockIds"]:
            assert canon(bblocks[block_id])==canon(block_by_id[block_id]),(key,block_id)
        for row in (p,b):
            assert (row["repository"],row["pullRequest"],row["window"],row["head"],row["tree"])==(REPO,418,WINDOW,HEAD,TREE)

    prior=[]
    for h,bh in zip(holds,blind_holds):
        assert h["position"]==bh["position"]==3632 and h["locale"]==bh["locale"]
        assert h["sourceId"]==bh["sourceId"]=="components.Settings.BookshelfPathMigration.author"
        assert h["sourceSha256"]==bh["sourceSha256"] and h["currentTargetSha256"]==bh["currentTargetSha256"]==h["priorTargetSha256"]==bh["priorTargetSha256"]
        assert h["retained"] is True and bh["retained"] is True and h["callerless"] is True and bh["callerless"] is True
        assert h["targetTextIncluded"] is False and bh["targetTextIncluded"] is False
        assert (h["currentHead"],h["currentTree"])==(HEAD,TREE)
        prior.append({
            "schema":"seerrng-cross-audit-prior-hold-reattestation/v1","position":3632,"locale":h["locale"],
            "sourceId":h["sourceId"],"sourceSha256":h["sourceSha256"],"priorTargetSha256":h["priorTargetSha256"],
            "currentTargetSha256":h["currentTargetSha256"],"callerless":True,"retained":True,
            "originWindow":h["originWindow"],"carriedViaWindow":h["carriedViaWindow"],"currentHead":HEAD,"currentTree":TREE,
            "targetTextIncluded":False
        })

    ledger=[]; updates=[]; noops=[]; disagreements=[]
    primary_counts=Counter(); blind_counts=Counter(); final_counts=Counter(); selected=Counter()
    disposition_disagree=0; target_disagree=0; exact_proposal_agree=0; exact_current_agree=0
    baseline_protected_miss=0; final_protected_miss=0; numeric_cells=0; numeric_surface_diff=0
    for key in sorted(keys):
        c=cell_by_key[key]; s=source_by_pos[key[0]]; cx=ctx_by_key[(key[0],s["sourceId"])]
        p=p_by_key[key]; b=b_by_key[key]
        p_dec=p["decision"]; b_dec=b["disposition"]
        p_target=p.get("proposedTarget",p["currentTarget"])
        b_target=b["reviewedTarget"]
        p_changed=p_dec in ("correction","refinement")
        b_changed=b_dec in ("correction","refinement")
        assert p_changed==(p_target!=p["currentTarget"])
        assert b_changed==(b_target!=b["currentTarget"])
        primary_counts[p_dec]+=1; blind_counts[b_dec]+=1
        d_dis=p_dec!=b_dec; t_dis=p_target!=b_target
        disposition_disagree+=int(d_dis); target_disagree+=int(t_dis)
        if not d_dis and not t_dis:
            if p_dec=="accept-current": exact_current_agree+=1
            else: exact_proposal_agree+=1

        if key in OVERRIDES:
            choice,forced_decision,rationale=OVERRIDES[key]
            if choice=="current":
                final_target=c["currentTarget"]; final_decision="accept-current"; selected_from="cross-audit-current"
            elif choice=="primary":
                final_target=p_target; final_decision=forced_decision or p_dec; selected_from="primary"
            elif choice=="blind":
                final_target=b_target; final_decision=forced_decision or b_dec; selected_from="blind"
            else: raise AssertionError((key,choice))
            if choice in ("primary","blind"):
                assert final_target!=c["currentTarget"]
                assert final_decision in ("correction","refinement")
            else:
                assert final_target==c["currentTarget"]
        else:
            assert not d_dis and not t_dis,(key,p_dec,b_dec,p_target,b_target)
            final_target=p_target; final_decision=p_dec
            selected_from="both" if final_decision!="accept-current" else "both-accept-current"
            if final_decision=="accept-current":
                rationale="Both independent reviews accept the current target. It preserves the exact source meaning in the pinned caller, and the final placeholder, ICU, markup, numeric-value, and protected-literal checks pass."
            else:
                rationale="Both independent reviews selected the same correction/refinement and target; the exact source, direct caller and catalog pins agree, and all final technical-token checks pass."
        selected[selected_from]+=1
        final_counts[final_decision]+=1
        audits=token_audit(s["source"],c["currentTarget"],p_target,b_target,final_target,c["locale"])
        for name,a in audits.items():
            assert a["placeholderMultisetMatchesSource"] and a["icuPluralCategoriesMatchSource"] and a["markupMatchesSource"],(key,name,"structural token mismatch",a)
            assert a["numericValuesMatchSource"],(key,name,"numeric value mismatch",a)
            if name!="current": assert a["protectedLiteralsMatchSource"],(key,name,"protected literal mismatch",a)
        if any(not v for v in audits["current"]["protectedLiteralsPresent"].values()): baseline_protected_miss+=1
        if any(not v for v in audits["final"]["protectedLiteralsPresent"].values()): final_protected_miss+=1
        source_nums=numeric_tokens(s["source"],"en")
        current_nums=numeric_tokens(c["currentTarget"],c["locale"])
        if source_nums:
            numeric_cells+=1
            if [x["surface"] for x in source_nums] != [x["surface"] for x in current_nums]:
                numeric_surface_diff+=1

        context_pins=[]
        for bid in cx["contextBlockIds"]:
            block=block_by_id[bid]
            context_pins.append({"contextId":bid,"contextType":block["contextType"],"path":block["path"],"startLine":block["startLine"],"endLine":block["endLine"],"blockSha256":sha(canon(block)),"linePins":[{"line":x["line"],"lineSha256":x["lineSha256"]} for x in block["lines"]]})
        row={
            "schema":"seerrng-localization-cross-audit-cell/v1","repository":REPO,"pullRequest":418,"window":WINDOW,"head":HEAD,"tree":TREE,
            "position":c["position"],"sourceId":s["sourceId"],"sourceIdSha256":s["sourceIdSha256"],"sourceKey":s["sourceKey"],"namespace":s["namespace"],
            "source":s["source"],"sourceSha256":s["sourceSha256"],"locale":c["locale"],"localeTag":c["localeTag"],
            "catalogPath":c["catalogPath"],"catalogGitBlob":c["catalogGitBlob"],"catalogSha256":c["catalogSha256"],
            "currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],
            "primaryDecision":p_dec,"primaryTarget":p_target,"primaryTargetSha256":sha(p_target),"primaryRationale":p["rationale"],
            "blindDisposition":b_dec,"blindTarget":b_target,"blindTargetSha256":sha(b_target),"blindRationale":b["rationale"],
            "reviewerDispositionAgreement":not d_dis,"reviewerTargetAgreement":not t_dis,
            "reviewerDisagreementFields":[name for name,diff in (("disposition",d_dis),("target",t_dis)) if diff],
            "callerResolution":cx["callerResolution"],"directCallerCount":cx["callerCount"],"callerContextIds":cx["contextBlockIds"],
            "callerContextSummarySha256":sha(canon(cx)),"blindCallerContextEvidenceSha256":b["callerEvidence"]["callerContextSha256"],
            "callerContextBlockPins":context_pins,"callerDirectMessageReferences":cx["directMessageReferences"],
            "crossDecision":final_decision,"crossTarget":final_target,"crossTargetSha256":sha(final_target),"selectedSource":selected_from,
            "crossRationale":rationale,"tokenAudit":audits,"nativeSpeakerApproval":False
        }
        ledger.append(row)
        if d_dis or t_dis:
            disagreements.append({
                "schema":"seerrng-localization-cross-audit-disagreement/v1","position":c["position"],"sourceId":s["sourceId"],"locale":c["locale"],
                "primaryDecision":p_dec,"primaryTarget":p_target,"blindDisposition":b_dec,"blindTarget":b_target,
                "disagreementFields":row["reviewerDisagreementFields"],"crossDecision":final_decision,"crossTarget":final_target,
                "selectedSource":selected_from,"crossRationale":rationale
            })
        plan={
            "schema":"seerrng-localization-apply-plan/v1","action":"update","position":c["position"],"sourceId":s["sourceId"],"sourceSha256":s["sourceSha256"],
            "locale":c["locale"],"localeTag":c["localeTag"],"catalogPath":c["catalogPath"],"catalogGitBlob":c["catalogGitBlob"],
            "catalogSha256":c["catalogSha256"],"currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],
            "target":final_target,"targetSha256":sha(final_target),"decision":final_decision,"selectedSource":selected_from,"rationale":rationale,
            "head":HEAD,"tree":TREE,"applied":False
        }
        if final_target!=c["currentTarget"]:
            updates.append(plan)
        else:
            plan["action"]="no-op"
            noops.append(plan)

    assert len(ledger)==240 and len(disagreements)==38
    assert disposition_disagree==30 and target_disagree==34
    assert exact_current_agree==199 and exact_proposal_agree==3
    assert len(updates)==37 and len(noops)==203
    assert final_counts==Counter({"accept-current":203,"correction":27,"refinement":10})
    assert baseline_protected_miss==2 and final_protected_miss==0
    assert numeric_cells==24 and numeric_surface_diff==12
    assert sum(selected.values())==240
    expected={(pos,loc) for pos in range(3680,3700) for loc in j(I/"window.json")["localeOrder"]}
    assert keys==expected
    pt10=[r for r in ledger if r["position"]==3693 and r["locale"]=="pt_BR"][0]
    assert any(x["surface"].lower()=="10 mil" and x["value"]==10000 for x in pt10["tokenAudit"]["current"]["numericTokens"])
    assert [x["value"] for x in pt10["tokenAudit"]["final"]["numericTokens"]]==[10000]

    write_jsonl(ROOT/"cross-ledger.jsonl",ledger)
    write_jsonl(ROOT/"reviewer-disagreements.jsonl",disagreements)
    write_jsonl(ROOT/"update-plan.jsonl",updates)
    write_jsonl(ROOT/"no-op-plan.jsonl",noops)
    write_jsonl(ROOT/"prior-hold-reattestation.jsonl",prior)
    summary={
        "schemaVersion":1,"repository":REPO,"pullRequest":418,"window":WINDOW,"range":[3680,3699],"head":HEAD,"tree":TREE,
        "cellCount":len(ledger),"primaryDecisionCounts":dict(sorted(primary_counts.items())),"blindDecisionCounts":dict(sorted(blind_counts.items())),
        "crossDecisionCounts":dict(sorted(final_counts.items())),"finalUpdateCount":len(updates),"finalNoOpCount":len(noops),"newHoldCount":0,
        "carriedPriorHoldCount":len(prior),"carriedPriorHoldPosition":3632,"carriedPriorHoldHashesUnchanged":True,
        "reviewerDisagreementCounts":{"anyDispositionOrTarget":len(disagreements),"disposition":disposition_disagree,"targetText":target_disagree,
            "bothDispositionAndTarget":sum(1 for d in disagreements if len(d["disagreementFields"])==2),
            "agreementCurrent":exact_current_agree,"agreementNonCurrentProposal":exact_proposal_agree},
        "selectedSourceCounts":dict(sorted(selected.items())),
        "tokenChecks":{"baselineProtectedLiteralMissCells":baseline_protected_miss,"finalProtectedLiteralMissCells":final_protected_miss,
            "normalizedNumericCells":numeric_cells,"currentNumericSurfaceDifferences":numeric_surface_diff,"numericValueMismatchCells":0,
            "ptBR10MilNormalizedValue":10000,"placeholderMismatchCells":0,"icuPluralMismatchCells":0,"markupMismatchCells":0},
        "inputCounts":{"sourceIds":len(sources),"locales":len(j(I/"window.json")["localeOrder"]),"catalogCells":len(cells),"callerContexts":len(contexts),
            "directCallerlessPositions":0,"priorSelectedSourceIdExclusions":len(jl(I/"prior-selection-exclusions.jsonl"))},
        "nativeSpeakerReview":"not performed","browserReview":"not performed","repositoryOrPRFilesEdited":False,
        "evidenceNotes":["The nested primary-review/verify_primary.py copy assumes the task-root layout and fails when invoked from its nested location; the task-root verify_primary.py passed, and this cross-audit verifier independently validates the copied rows and pins."],
        "afterLiveAttestationPresent":(ROOT/"after-live-attestation.json").exists()
    }
    write_json(ROOT/"summary.json",summary)
    readme=f"""# SeerrNG PR #418 W3680–W3699 cross-audit

This packet independently reconciles all 240 target cells across 12 locales at PR head {HEAD} and tree {TREE}. The exact source, current target, direct caller, and catalog pins are carried per row in cross-ledger.jsonl. Candidate-free input is retained at evidence/candidate-free-input/, the sealed primary packet at evidence/primary-review/, and the independent blind packet at independent-review/.

The blind ledger was sealed before the primary review directory was opened. Cross-audit compared every source/locale key. {len(disagreements)} cells had a disposition or target difference: {disposition_disagree} disposition differences and {target_disagree} target-text differences. The ledger records both proposals, both rationales, the selected final target, and a per-cell adjudication rationale.

The final plan contains {len(updates)} proposed catalog updates and {len(noops)} no-ops. It preserves all {len(prior)} carried position-3632 callerless holds by hash; their target strings are omitted. No new holds were required. The two Hindi baseline omissions of the protected API literal are fixed in the selected targets. Numeric values were rechecked after locale grouping normalization: 1,000, 1.000, and 1 000 normalize equally, and pt_BR 10 mil normalizes to 10,000.

The cross-audit is machine-assisted and has not received native-speaker approval or browser review. The plan is not applied. No repository or PR files were edited, and no tests, builds, or CI were run.

Evidence note: the nested primary-review/verify_primary.py copy assumes the task-root layout and fails when invoked from its nested location. The task-root verify_primary.py passed; this cross-audit verifier independently validates the copied primary rows and pins.

Live PR/branch/pull refs were reattested at the start and end of the cross-audit. See cross-audit-start-live-attestation.json and after-live-attestation.json. The portable offline verifier is verify-cross-audit.py; it validates the copied evidence, all 240 row bindings, token checks, hold fingerprints, plans, live-attestation files, and checksums.
"""
    (ROOT/"README.md").write_text(readme,encoding="utf-8")
    file_rows=[]
    for path in sorted(x for x in ROOT.iterdir() if x.is_file() and x.name not in ("manifest.json","SHA256SUMS.txt")):
        file_rows.append({"path":path.name,"sha256":sha(path.read_bytes()),"byteCount":path.stat().st_size})
    input_hashes={"candidateFreeManifestSha256":sha((I/"manifest.json").read_bytes()),"candidateFreeChecksumListSha256":sha((I/"SHA256SUMS.txt").read_bytes()),
        "primaryManifestSha256":sha((P/"manifest.json").read_bytes()),"primaryChecksumListSha256":sha((P/"SHA256SUMS.txt").read_bytes()),
        "blindManifestSha256":sha((B/"manifest.json").read_bytes()),"blindChecksumListSha256":sha((B/"SHA256SUMS.txt").read_bytes())}
    manifest={
        "schemaVersion":1,"packetType":"sealed-independent-localization-cross-audit","repository":REPO,"pullRequest":418,"window":WINDOW,"range":[3680,3699],
        "head":HEAD,"tree":TREE,"branch":BRANCH,"cellCount":240,"localeCount":12,"sourceCount":20,"inputHashes":input_hashes,
        "inputFileCounts":{"candidateFree":cf_hashes,"primary":primary_hashes,"blind":blind_hashes},
        "liveAttestationFiles":["before-live-attestation.json","cross-audit-start-live-attestation.json"]+(["after-live-attestation.json"] if after.exists() else []),
        "carriedHoldCount":12,"reviewerDisagreementCount":len(disagreements),"updateCount":len(updates),"noOpCount":len(noops),
        "nativeSpeakerApproval":False,"browserReview":False,"repositoryOrPRFilesEdited":False,
        "sealedAtUTC":datetime.now(timezone.utc).isoformat(),"files":file_rows
    }
    write_json(ROOT/"manifest.json",manifest)
    root_files=sorted(x for x in ROOT.iterdir() if x.is_file() and x.name!="SHA256SUMS.txt")
    (ROOT/"SHA256SUMS.txt").write_text("".join(f"{sha(x.read_bytes())}  {x.name}\n" for x in root_files),encoding="utf-8")
    print(json.dumps({"result":"BUILT","head":HEAD,"tree":TREE,"cells":240,"reviewerDisagreements":len(disagreements),
        "dispositionDisagreements":disposition_disagree,"targetTextDifferences":target_disagree,"updates":len(updates),"noOps":len(noops),
        "finalDispositions":dict(final_counts),"priorHolds":len(prior),"baselineProtectedMissCells":baseline_protected_miss,
        "finalProtectedMissCells":final_protected_miss,"numericCells":numeric_cells,"ptBR10Mil":10000,
        "afterLiveAttestationPresent":after.exists()},ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()

