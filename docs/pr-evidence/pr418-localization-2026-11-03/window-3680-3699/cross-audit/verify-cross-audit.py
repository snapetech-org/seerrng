#!/usr/bin/env python3
"""Portable offline verifier for the sealed W3680-W3699 cross-audit packet."""
from collections import Counter
import hashlib, json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parent
I=ROOT/"evidence/candidate-free-input"; P=ROOT/"evidence/primary-review"; B=ROOT/"independent-review"
HEAD="a2f015c040f933eff38e6ef3d9b1ac6050c4957d"; TREE="9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe"
BRANCH="codex/seerrng-localization-overhaul-20261028"; REPO="snapetech-org/seerrng"; WINDOW="W3680-W3699"
PROTECTED=["SeerrNG","Audiobookshelf","ISBN","API","URL","HTTP","HTTPS","IP","SSL","BackIssue","Bindery","BookshelfNG","ComicVine","Plex","Jellyfin","BINDERY_ENFORCE_TENANCY","Auto-approve requests","library.view","library.manage","downloads.grab","Jellystat"]
HEADER=re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?")
CAT=re.compile(r"(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{")
MARKUP=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUMBER=re.compile(r"(?<![A-Za-z0-9])\d+(?:(?:,|\.|\u00a0|\u202f| )\d{3})*(?![A-Za-z0-9])")
PT_MIL=re.compile(r"(?<![A-Za-z0-9])(\d+(?:[.,]\d+)?)\s*mil\b",re.I)

def sha(b):
    if isinstance(b,str): b=b.encode("utf-8")
    return hashlib.sha256(b).hexdigest()
def canon(x):
    return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(s) for s in p.read_text(encoding="utf-8").splitlines() if s.strip()]
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
def sig(ts): return Counter((x["name"],x["formatter"]) for x in ts)
def catmap(ts): return {x["name"]:sorted(x["pluralCategories"]) for x in ts if x["pluralCategories"]}
def nums(text,locale):
    spans=[]; mask=list(text)
    if locale=="pt_BR":
        for m in PT_MIL.finditer(text):
            value=int(float(m.group(1).replace(",","."))*1000)
            spans.append((m.start(),m.end(),m.group(0),value))
            for i in range(m.start(),m.end()): mask[i]=" "
    for m in NUMBER.finditer("".join(mask)):
        raw=m.group(0); spans.append((m.start(),m.end(),raw,int(re.sub(r"[,.\u00a0\u202f ]","",raw))))
    return [{"surface":raw,"value":v} for _,__,raw,v in sorted(spans)]
def protected(text): return [x for x in PROTECTED if x in text]
def check_sums(folder):
    sums=folder/"SHA256SUMS.txt"; listed={}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if line.strip():
            digest,name=line.split(None,1); listed[name.strip().lstrip("*")]=digest
    actual={p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file() and p.relative_to(folder).as_posix()!="SHA256SUMS.txt"}
    assert set(listed)==actual,(str(folder),set(listed)-actual,actual-set(listed))
    for name,digest in listed.items(): assert sha((folder/name).read_bytes())==digest,(str(folder),name)
    return len(listed)
def check_live(path):
    x=j(path)
    assert x["expected"]["head"]==HEAD and x["expected"]["tree"]==TREE and x["expected"]["branch"]==BRANCH
    assert x["pr"]["number"]==418 and x["pr"]["state"]=="OPEN" and x["pr"]["isDraft"] is True
    assert x["pr"]["headRefName"]==BRANCH and x["pr"]["headRefOid"]==HEAD
    assert x["pr"]["baseRefName"]=="main" and x["pr"]["baseRefOid"]=="221d8e0d542802da7529cd272c928cc747677e5c"
    assert x["refs"].get(f"refs/heads/{BRANCH}")==HEAD and x["refs"].get("refs/pull/418/head")==HEAD
    assert x["headCommit"]==HEAD and x["headTree"]==TREE

def main():
    m=j(ROOT/"manifest.json"); s=j(ROOT/"summary.json")
    assert (m["repository"],m["pullRequest"],m["window"],m["head"],m["tree"])==(REPO,418,WINDOW,HEAD,TREE)
    root_list={}
    for line in (ROOT/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        digest,name=line.split(None,1); root_list[name.strip().lstrip("*")]=digest
    root_actual={p.name for p in ROOT.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
    assert set(root_list)==root_actual
    for name,digest in root_list.items(): assert sha((ROOT/name).read_bytes())==digest,name
    mf={x["path"]:x for x in m["files"]}
    assert set(mf)==root_actual-{"manifest.json"}
    for name,x in mf.items():
        p=ROOT/name
        assert p.is_file() and p.stat().st_size==x["byteCount"] and sha(p.read_bytes())==x["sha256"],name
    cfn=check_sums(I); pn=check_sums(P); bn=check_sums(B)
    assert (cfn,pn,bn)==(16,7,7)
    im=j(I/"manifest.json"); pm=j(P/"manifest.json"); bm=j(B/"manifest.json")
    assert sha((I/"manifest.json").read_bytes())==m["inputHashes"]["candidateFreeManifestSha256"]
    assert sha((I/"SHA256SUMS.txt").read_bytes())==m["inputHashes"]["candidateFreeChecksumListSha256"]
    assert sha((P/"manifest.json").read_bytes())==m["inputHashes"]["primaryManifestSha256"]
    assert sha((P/"SHA256SUMS.txt").read_bytes())==m["inputHashes"]["primaryChecksumListSha256"]
    assert sha((B/"manifest.json").read_bytes())==m["inputHashes"]["blindManifestSha256"]
    assert sha((B/"SHA256SUMS.txt").read_bytes())==m["inputHashes"]["blindChecksumListSha256"]
    assert bm["primaryDirectoryOpened"] is False and bm["primaryCandidateOrDecisionExposed"] is False
    for f in ["before-live-attestation.json","cross-audit-start-live-attestation.json","after-live-attestation.json"]:
        check_live(ROOT/f)

    sources=jl(I/"source-cells.jsonl"); cells=jl(I/"current-target-cells.jsonl"); contexts=jl(I/"caller-contexts.jsonl")
    blocks=jl(I/"caller-context-blocks.jsonl"); p_rows=jl(P/"primary-ledger.jsonl"); b_rows=jl(B/"blind-ledger.jsonl")
    ledger=jl(ROOT/"cross-ledger.jsonl"); updates=jl(ROOT/"update-plan.jsonl"); noops=jl(ROOT/"no-op-plan.jsonl")
    disagreements=jl(ROOT/"reviewer-disagreements.jsonl"); holds=jl(I/"carry-forward-hold-hashes.jsonl")
    hold_out=jl(ROOT/"prior-hold-reattestation.jsonl"); blind_holds=jl(B/"prior-hold-reattestation.jsonl")
    assert len(sources)==20 and len(cells)==len(ledger)==240 and len(contexts)==20
    assert len(p_rows)==len(b_rows)==240 and len(holds)==len(hold_out)==len(blind_holds)==12
    src={x["position"]:x for x in sources}; cur={(x["position"],x["locale"]):x for x in cells}
    cx={(x["position"],x["sourceId"]):x for x in contexts}; block={x["contextId"]:x for x in blocks}
    pp={(x["position"],x["locale"]):x for x in p_rows}; bb={(x["position"],x["locale"]):x for x in b_rows}
    ll={(x["position"],x["locale"]):x for x in ledger}
    assert set(ll)==set(cur)==set(pp)==set(bb)
    expected={(pos,loc) for pos in range(3680,3700) for loc in j(I/"window.json")["localeOrder"]}
    assert set(ll)==expected
    counts=Counter(); primary=Counter(); blind=Counter(); selected=Counter()
    d_diff=t_diff=both_diff=cur_agree=proposal_agree=base_api_miss=0
    for k,row in ll.items():
        c=cur[k]; source=src[k[0]]; context=cx[(k[0],source["sourceId"])]; pr=pp[k]; br=bb[k]
        pt=pr.get("proposedTarget",pr["currentTarget"]); bt=br["reviewedTarget"]
        assert row["sourceId"]==source["sourceId"]==pr["sourceId"]==br["sourceId"]
        assert row["source"]==source["source"]==pr["source"]==br["source"]
        assert row["sourceSha256"]==source["sourceSha256"]==pr["sourceSha256"]==br["sourceSha256"]==sha(source["source"])
        assert row["sourceIdSha256"]==source["sourceIdSha256"]==pr["sourceIdSha256"]==br["sourceIdSha256"]==sha(source["sourceId"])
        assert row["currentTarget"]==c["currentTarget"]==pr["currentTarget"]==br["currentTarget"]
        assert row["currentTargetSha256"]==c["currentTargetSha256"]==pr["currentTargetSha256"]==br["currentTargetSha256"]==sha(c["currentTarget"])
        assert (row["catalogPath"],row["catalogSha256"],row["catalogGitBlob"])==(c["catalogPath"],c["catalogSha256"],c["catalogGitBlob"])
        assert (pr["catalogPath"],pr["catalogSha256"],pr["catalogGitBlob"])==(c["catalogPath"],c["catalogSha256"],c["catalogGitBlob"])
        assert br["catalogEvidence"]["path"]==c["catalogPath"] and br["catalogEvidence"]["sha256"]==c["catalogSha256"] and br["catalogEvidence"]["gitBlob"]==c["catalogGitBlob"]
        context_ids=context["contextBlockIds"]
        assert row["callerContextIds"]==pr["callerContextIds"]==br["callerEvidence"]["contextBlockIds"]==context_ids
        assert row["callerContextSummarySha256"]==pr["callerContextSha256"]==sha(canon(context))
        assert context["callerCount"]==row["directCallerCount"]==pr["directCallerCount"]==br["callerEvidence"]["callerCount"]>0
        assert context["callerResolution"]==row["callerResolution"]==pr["callerResolution"]==br["callerEvidence"]["callerResolution"]
        bblocks={x["contextId"]:x for x in br["callerEvidence"]["contextBlocks"]}
        for cid in context_ids:
            assert canon(block[cid])==canon(bblocks[cid])
        assert row["primaryDecision"]==pr["decision"] and row["primaryTarget"]==pt and row["primaryTargetSha256"]==sha(pt)
        assert row["blindDisposition"]==br["disposition"] and row["blindTarget"]==bt and row["blindTargetSha256"]==sha(bt)
        dd=pr["decision"]!=br["disposition"]; td=pt!=bt
        assert row["reviewerDispositionAgreement"] is (not dd) and row["reviewerTargetAgreement"] is (not td)
        fields=[name for name,diff in (("disposition",dd),("target",td)) if diff]
        assert row["reviewerDisagreementFields"]==fields
        d_diff+=int(dd); t_diff+=int(td); both_diff+=int(dd and td)
        if not dd and not td:
            if pr["decision"]=="accept-current": cur_agree+=1
            else: proposal_agree+=1
        assert row["crossTargetSha256"]==sha(row["crossTarget"])
        assert row["crossTarget"]==c["currentTarget"] if row["crossDecision"]=="accept-current" else row["crossTarget"]!=c["currentTarget"]
        assert row["crossDecision"] in ("accept-current","correction","refinement")
        counts[row["crossDecision"]]+=1; primary[pr["decision"]]+=1; blind[br["disposition"]]+=1; selected[row["selectedSource"]]+=1
        source_i=icu(source["source"]); source_markup=MARKUP.findall(source["source"]); source_protected=protected(source["source"]); source_nums=nums(source["source"],"en")
        audits=row["tokenAudit"]
        variant={"current":c["currentTarget"],"primary":pt,"blind":bt,"final":row["crossTarget"]}
        for name,text in variant.items():
            tok=icu(text); aud=audits[name]
            assert aud["sha256"]==sha(text)
            assert aud["placeholderTokens"]==tok and sig(tok)==sig(source_i) and aud["placeholderMultisetMatchesSource"] is True
            assert catmap(tok)==catmap(source_i) and aud["icuPluralCategoriesMatchSource"] is True
            assert MARKUP.findall(text)==source_markup and aud["markupTokens"]==source_markup and aud["markupMatchesSource"] is True
            actual_nums=nums(text,c["locale"])
            assert aud["numericTokens"]==actual_nums and [n["value"] for n in actual_nums]==[n["value"] for n in source_nums]
            assert aud["numericValuesMatchSource"] is True
            actual_protected={lit:(lit in text) for lit in source_protected}
            assert aud["requiredProtectedLiterals"]==source_protected and aud["protectedLiteralsPresent"]==actual_protected
            if name!="current": assert all(actual_protected.values())
            else: base_api_miss+=int(any(not x for x in actual_protected.values()))
        assert row["crossRationale"]
    assert d_diff==30 and t_diff==34 and both_diff==26 and cur_agree==199 and proposal_agree==3
    assert len(disagreements)==38 and len(updates)==37 and len(noops)==203
    assert counts==Counter({"accept-current":203,"correction":27,"refinement":10})
    assert primary==Counter({"accept-current":202,"correction":27,"refinement":11})
    assert blind==Counter({"accept-current":218,"correction":10,"refinement":12})
    assert base_api_miss==2

    update_map={(x["position"],x["locale"]):x for x in updates}; noop_map={(x["position"],x["locale"]):x for x in noops}
    assert set(update_map).isdisjoint(noop_map) and set(update_map)|set(noop_map)==set(ll)
    for k,row in ll.items():
        plan=update_map.get(k) or noop_map[k]
        assert plan["target"]==row["crossTarget"] and plan["targetSha256"]==row["crossTargetSha256"]
        assert plan["decision"]==row["crossDecision"] and plan["applied"] is False
        assert (plan["catalogPath"],plan["catalogGitBlob"],plan["catalogSha256"])==(row["catalogPath"],row["catalogGitBlob"],row["catalogSha256"])
        assert (plan["currentTarget"],plan["currentTargetSha256"])==(row["currentTarget"],row["currentTargetSha256"])

    for h,bh,out in zip(jl(I/"carry-forward-hold-hashes.jsonl"),blind_holds,hold_out):
        assert h["locale"]==bh["locale"]==out["locale"] and h["position"]==bh["position"]==out["position"]==3632
        assert h["sourceId"]==bh["sourceId"]==out["sourceId"]=="components.Settings.BookshelfPathMigration.author"
        assert h["sourceSha256"]==bh["sourceSha256"]==out["sourceSha256"]
        assert h["priorTargetSha256"]==h["currentTargetSha256"]==bh["priorTargetSha256"]==bh["currentTargetSha256"]==out["priorTargetSha256"]==out["currentTargetSha256"]
        assert out["targetTextIncluded"] is False and out["callerless"] is True and out["retained"] is True

    assert s["cellCount"]==240 and s["finalUpdateCount"]==37 and s["finalNoOpCount"]==203
    assert s["reviewerDisagreementCounts"]["anyDispositionOrTarget"]==38
    assert s["reviewerDisagreementCounts"]["disposition"]==30 and s["reviewerDisagreementCounts"]["targetText"]==34
    assert s["tokenChecks"]["baselineProtectedLiteralMissCells"]==2 and s["tokenChecks"]["finalProtectedLiteralMissCells"]==0
    assert s["tokenChecks"]["normalizedNumericCells"]==24 and s["tokenChecks"]["ptBR10MilNormalizedValue"]==10000
    assert s["carriedPriorHoldCount"]==12 and s["carriedPriorHoldHashesUnchanged"] is True
    print(json.dumps({"result":"PASS","head":HEAD,"tree":TREE,"cells":len(ll),"disagreements":len(disagreements),
        "dispositionDifferences":d_diff,"targetDifferences":t_diff,"finalDispositions":dict(counts),"updates":len(updates),"noOps":len(noops),
        "priorHolds":12,"baselineProtectedMissCells":base_api_miss,"finalProtectedMissCells":0,"normalizedNumericCells":24,
        "ptBR10Mil":10000,"candidateFreeFiles":cfn,"primaryFiles":pn,"blindFiles":bn,"rootChecksummedFiles":len(root_list)},ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()

