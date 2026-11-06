#!/usr/bin/env python3
"""Portable integrity and semantic verifier for SeerrNG W3720-W3739 cross-audit."""
import argparse, collections, hashlib, json, re, subprocess, sys
from pathlib import Path

HEAD="1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e"
TREE="6a51f3fb1d1f65c12bfe82bf47834626aa364488"
WINDOW="W3720-W3739"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
EXPECTED_REPO=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3700-3719-apply-20261103/repo")
HEADER=re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?")
CAT=re.compile(r"(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{")
MARKUP=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM=re.compile(r"(?<!\d)[+-]?\d+(?:[,. \u00a0\u202f]\d{3})*(?:%?)(?!\d)")

def req(ok,msg):
    if not ok: raise SystemExit("FAIL: "+msg)
def sha(data): return hashlib.sha256(data).hexdigest()
def readj(p): return json.loads(p.read_text(encoding="utf-8"))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
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
            name,fmt=m.group(1),m.group(2)
            cats=[x.group(1) for x in CAT.finditer(body[m.end():])] if fmt in ("plural","select","selectordinal") else []
            out.append({"name":name,"formatter":fmt or None,"pluralCategories":cats})
        i=k
    return out
def cmap(ts): return {x["name"]:sorted(x["pluralCategories"]) for x in ts if x["pluralCategories"]}
def nums(s):
    s=re.sub(r"(?<!\w)(\d+)\s+mil\b",lambda m:str(int(m.group(1))*1000),s,flags=re.I)
    return [re.sub(r"\D","",x) for x in NUM.findall(s)]
def token_state(c,target,b):
    src,cur=c["source"],c["currentTarget"]
    si,ci,ti=icu(src),icu(cur),icu(target)
    sp=[(x["name"],x["formatter"]) for x in si]; tp=[(x["name"],x["formatter"]) for x in ti]
    required=c["sourceProtectedLiterals"]
    named=b.get("namedLiteralAudit",{}).get("sourceTerms",[])
    permission=b.get("namedLiteralAudit",{}).get("localizedManageRequestsLabel") if c["position"]==3720 else None
    return {
      "placeholders":{"source":sp,"selected":tp,"preservedInOrder":sp==tp},
      "icuPluralCategories":{"source":cmap(si),"current":cmap(ci),"selected":cmap(ti),"preserved":cmap(si)==cmap(ti)},
      "markup":{"source":MARKUP.findall(src),"selected":MARKUP.findall(target),"preserved":MARKUP.findall(src)==MARKUP.findall(target)},
      "numericValues":{"source":nums(src),"current":nums(cur),"selected":nums(target),"preserved":nums(src)==nums(target)},
      "protectedLiterals":{"requiredFromSource":required,"selectedPresent":[x for x in required if x in target],"missing":[x for x in required if x not in target]},
      "namedBrandTerms":{"required":named,"missing":[x for x in named if x not in target]},
      "localizedManageRequestsLabel":{"required":permission,"present":permission is None or permission in target},
      "allChecksPass":sp==tp and cmap(si)==cmap(ti) and MARKUP.findall(src)==MARKUP.findall(target) and nums(src)==nums(target) and all(x in target for x in required+named) and (permission is None or permission in target),
    }
def verify_packet_dir(path):
    manifest=readj(path/"manifest.json")
    listed={x["path"]:x for x in manifest["files"]}
    actual={p.relative_to(path).as_posix() for p in path.rglob("*") if p.is_file()}-{"manifest.json","SHA256SUMS.txt"}
    nested_sum_files={n for n in actual if Path(n).name=="SHA256SUMS.txt"}
    req(set(listed)==actual,f"packet manifest inventory {path}")
    for name,item in listed.items():
        p=path/name
        req(p.is_file() and sha(p.read_bytes())==item["sha256"] and p.stat().st_size==item["byteCount"],f"packet manifest hash {path}/{name}")
    sums={}
    for line in (path/"SHA256SUMS.txt").read_text().splitlines():
        m=re.fullmatch(r"([0-9a-f]{64})  (.+)",line)
        req(m is not None,f"malformed packet checksum line {path}")
        h,name=m.groups(); req(name not in sums,f"duplicate packet checksum {path}/{name}"); sums[name]=h
    expected=(actual-nested_sum_files)|{"manifest.json"}
    req(set(sums)==expected,f"packet checksum inventory {path}")
    for name,h in sums.items(): req(sha((path/name).read_bytes())==h,f"packet checksum {path}/{name}")
    return manifest

def verify_sums_only(path):
    entries={}
    for line in (path/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        m=re.fullmatch(r"([0-9a-f]{64})  (.+)",line); req(m is not None,f"malformed directory checksum {path}")
        h,n=m.groups(); req(n not in entries,f"duplicate directory checksum {path}/{n}"); entries[n]=h
        q=path/n; req(q.is_file() and sha(q.read_bytes())==h,f"directory checksum mismatch {path}/{n}")
    actual={q.relative_to(path).as_posix() for q in path.rglob("*") if q.is_file()}-{"SHA256SUMS.txt"}
    req(actual-set(entries)=={n for n in actual if Path(n).name=="SHA256SUMS.txt"},f"directory checksum inventory {path}")
    return len(entries)

def compare_trees(a,b):
    fa={p.relative_to(a).as_posix():p for p in a.rglob("*") if p.is_file()}
    fb={p.relative_to(b).as_posix():p for p in b.rglob("*") if p.is_file()}
    req(set(fa)==set(fb),f"packet copy file set differs: {a} vs {b}")
    for n in fa: req(fa[n].read_bytes()==fb[n].read_bytes(),f"packet copy differs: {n}")
    return len(fa)
def root_sums(root):
    entries={}
    for line in (root/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        m=re.fullmatch(r"([0-9a-f]{64})  (.+)",line); req(m is not None,"root checksum malformed")
        h,n=m.groups(); req(n not in entries,"duplicate root checksum"); entries[n]=h
        p=root/n; req(p.is_file() and sha(p.read_bytes())==h,"root checksum mismatch "+n)
    actual={p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}-{"SHA256SUMS.txt"}
    req(set(entries)==actual,"root checksum inventory mismatch")
    manifest=readj(root/"manifest.json")
    listed={x["path"]:x for x in manifest["files"]}
    req(set(listed)==actual-{"manifest.json"},"root manifest inventory mismatch")
    for n,item in listed.items():
        p=root/n; req(sha(p.read_bytes())==item["sha256"] and p.stat().st_size==item["byteCount"],"root manifest hash mismatch "+n)
    return manifest

def verify(root,repo=None,run_nested=True):
    root=root.resolve()
    manifest=root_sums(root)
    req((manifest["repository"],manifest["pullRequest"],manifest["window"],manifest["head"],manifest["tree"])==("snapetech-org/seerrng",418,WINDOW,HEAD,TREE),"root pin mismatch")
    cf=verify_packet_dir(root/"candidate-free-input")
    pm=verify_packet_dir(root/"primary-packet"/"primary-review")
    p_root=verify_sums_only(root/"primary-packet")
    bm=verify_packet_dir(root/"blind-packet"/"blind-review")
    b_root=verify_packet_dir(root/"blind-packet")
    req((cf["head"],cf["tree"],cf["cellCount"],cf["priorHoldCount"])==(HEAD,TREE,240,12),"candidate-free pin/count")
    req((pm["head"],pm["tree"],pm["cellCount"])==(HEAD,TREE,240),"primary pin/count")
    req((bm["head"],bm["tree"],bm["cellCount"])==(HEAD,TREE,240),"blind pin/count")
    orig_primary=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3720-3739-primary-20261103")
    orig_blind=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3720-3739-blind-20261103")
    n_primary=compare_trees(orig_primary,root/"primary-packet")
    n_blind=compare_trees(orig_blind,root/"blind-packet")
    n_cf=compare_trees(orig_primary/"candidate-free-input",root/"candidate-free-input")
    compare_trees(orig_blind/"input"/"candidate-free-input",root/"candidate-free-input")
    # The nested primary copy also contains candidate-free input; require exact equality.
    compare_trees(root/"primary-packet"/"candidate-free-input",root/"candidate-free-input")
    compare_trees(root/"blind-packet"/"input"/"candidate-free-input",root/"candidate-free-input")
    before=readj(root/"live-PR-attestation-before.json"); after=readj(root/"live-PR-attestation-after.json")
    for record in (before,after):
        req((record["repository"],record["pullRequest"],record["state"],record["isDraft"],record["branch"],record["head"],record["tree"])==("snapetech-org/seerrng",418,"OPEN",True,"codex/seerrng-localization-overhaul-20261028",HEAD,TREE),"live attestation exact PR/head state")
        req(record["branchRef"]==HEAD and record["pullRef"]==HEAD,"live branch/pull refs")
        req(record["baseRefName"]=="main","base branch")
    req(before["baseRefDivergence"]==after["baseRefDivergence"],"base divergence changed during audit")
    req(before["prBodySha256"]==after["prBodySha256"] and before["prBodyBytes"]==after["prBodyBytes"],"PR body drift during audit")
    req((after["baseRefDivergence"]["aheadBy"],after["baseRefDivergence"]["behindBy"])==(143,0),"recorded base divergence")
    cells=readjl(root/"candidate-free-input"/"current-target-cells.jsonl")
    sources={x["position"]:x for x in readjl(root/"candidate-free-input"/"source-cells.jsonl")}
    ctx={x["position"]:x for x in readjl(root/"candidate-free-input"/"caller-contexts.jsonl")}
    block_rows=readjl(root/"candidate-free-input"/"caller-context-blocks.jsonl")
    route=[x for x in block_rows if "sourcePosition" not in x]
    blocks=collections.defaultdict(list)
    for x in block_rows:
        if "sourcePosition" in x: blocks[x["sourcePosition"]].append(x)
    P={(x["position"],x["locale"]):x for x in readjl(root/"primary-packet"/"primary-review"/"primary-ledger.jsonl")}
    B={(x["position"],x["locale"]):x for x in readjl(root/"blind-packet"/"blind-review"/"blind-ledger.jsonl")}
    C={(x["position"],x["locale"]):x for x in cells}
    L=readjl(root/"cross-audit-ledger.jsonl")
    req(len(L)==240 and len(C)==240 and len(P)==240 and len(B)==240,"240-cell count")
    expected_order=sorted(C,key=lambda k:(k[0],LOCALES.index(k[1])))
    req([(x["position"],x["locale"]) for x in L]==expected_order,"cross ledger order/coverage")
    tdiff=[]; ddiff=[]; changed=[]; common_changed=[]
    final=collections.Counter(); sources_count=collections.Counter(); baseline=collections.Counter(); selected=collections.Counter()
    for row in L:
        key=(row["position"],row["locale"]); c,p,b=C[key],P[key],B[key]
        req((row["head"],row["tree"],row["window"])==(HEAD,TREE,WINDOW),"cell exact pin "+str(key))
        req(row["sourceId"]==c["sourceId"]==p["sourceId"]==b["sourceId"] and row["source"]==c["source"]==p["source"]==b["source"],"source identity/content "+str(key))
        req(row["sourceSha256"]==c["sourceSha256"]==p["sourceSha256"]==b["sourceSha256"]==sha(row["source"].encode()),"source hash "+str(key))
        req(row["currentTarget"]==c["currentTarget"]==p["currentTarget"]==b["currentTarget"],"current target "+str(key))
        req(row["currentTargetSha256"]==c["currentTargetSha256"]==p["currentTargetSha256"]==b["currentTargetSha256"]==sha(row["currentTarget"].encode()),"current target hash "+str(key))
        req(row["catalogPath"]==c["catalogPath"]==p["catalogPath"]==b["catalogPath"],"catalog path "+str(key))
        req(row["catalogGitBlob"]==c["catalogGitBlob"]==p["catalogGitBlob"]==b["catalogGitBlob"],"catalog blob "+str(key))
        req(row["catalogSha256"]==c["catalogSha256"]==p["catalogSha256"]==b["catalogFileSha256"],"catalog file pin "+str(key))
        req(row["primary"]["decision"]==p["decision"] and row["primary"]["selectedTarget"]==p["selectedTarget"] and row["primary"]["selectedTargetSha256"]==p["selectedTargetSha256"] and row["primary"]["rationale"]==p["rationale"],"primary evidence "+str(key))
        req(row["blind"]["disposition"]==b["disposition"] and row["blind"]["selectedTarget"]==b["selectedTarget"] and row["blind"]["selectedTargetSha256"]==b["selectedTargetSha256"] and row["blind"]["rationale"]==b["rationale"] and row["blind"]["namedLiteralAudit"]==b["namedLiteralAudit"],"blind evidence "+str(key))
        want_td=p["selectedTarget"]!=b["selectedTarget"]; want_dd=p["decision"]!=b["disposition"]
        req(row["primaryBlindTargetDisagreement"]==want_td and row["primaryBlindDispositionDisagreement"]==want_dd,"difference flags "+str(key))
        req(row["selectedTargetSha256"]==sha(row["selectedTarget"].encode()),"selected hash "+str(key))
        if row["selectionSource"]=="consensus": req(p["selectedTarget"]==b["selectedTarget"]==row["selectedTarget"],"consensus selection "+str(key))
        elif row["selectionSource"]=="primary": req(row["selectedTarget"]==p["selectedTarget"],"primary selection "+str(key))
        elif row["selectionSource"]=="blind": req(row["selectedTarget"]==b["selectedTarget"],"blind selection "+str(key))
        elif row["selectionSource"]=="current": req(row["selectedTarget"]==c["currentTarget"],"current selection "+str(key))
        else: req(False,"invalid selection source "+str(key))
        req((row["selectedTarget"]==c["currentTarget"])==(row["crossAuditDisposition"]=="accept-current"),"cross disposition/current target "+str(key))
        req(row["crossAuditDisposition"] in ("accept-current","correction","refinement"),"invalid disposition "+str(key))
        req(row["callerEvidence"]["callerCount"]==ctx[key[0]]["callerCount"] and row["callerEvidence"]["callerResolution"]==ctx[key[0]]["callerResolution"],"caller summary "+str(key))
        req(row["callerEvidence"]["directMessageReferences"]==ctx[key[0]]["directMessageReferences"] and row["callerEvidence"]["contextBlockIds"]==ctx[key[0]]["contextBlockIds"],"caller reference evidence "+str(key))
        req(row["callerEvidence"]["pinnedContextBlocks"]==blocks[key[0]] and row["callerEvidence"]["componentRoutingEvidence"]==route,"pinned context blocks "+str(key))
        req(row["tokenAudit"]==token_state(c,row["selectedTarget"],b),"token audit recomputation "+str(key))
        req(row["tokenAudit"]["allChecksPass"],"token/literal failure "+str(key))
        if key[0]==3720:
            permission=b["namedLiteralAudit"]["localizedManageRequestsLabel"]
            req(permission and permission in row["selectedTarget"],"localized Manage Requests literal "+str(key))
        if want_td: tdiff.append(row)
        if want_dd: ddiff.append(row)
        if row["selectedTargetSha256"]!=row["currentTargetSha256"]: changed.append(row)
        if p["selectedTarget"]==b["selectedTarget"] and row["selectedTargetSha256"]!=row["currentTargetSha256"]: common_changed.append(row)
        final[row["crossAuditDisposition"]]+=1; sources_count[row["selectionSource"]]+=1
        si,ci=icu(row["source"]),icu(row["currentTarget"])
        baseline["placeholder"]+=int([(x["name"],x["formatter"]) for x in si]!=[(x["name"],x["formatter"]) for x in ci])
        baseline["markup"]+=int(MARKUP.findall(row["source"])!=MARKUP.findall(row["currentTarget"]))
        baseline["numeric"]+=int(nums(row["source"])!=nums(row["currentTarget"]))
        baseline["protectedLiteral"]+=int(any(x not in row["currentTarget"] for x in c["sourceProtectedLiterals"]))
        a=row["tokenAudit"]
        selected["placeholder"]+=int(not a["placeholders"]["preservedInOrder"])
        selected["icuPluralCategories"]+=int(not a["icuPluralCategories"]["preserved"])
        selected["markup"]+=int(not a["markup"]["preserved"])
        selected["numeric"]+=int(not a["numericValues"]["preserved"])
        selected["protectedLiteral"]+=int(bool(a["protectedLiterals"]["missing"]))
    req(len(tdiff)==46 and len(ddiff)==28 and len(changed)==50 and len(common_changed)==7,"reconciliation counts")
    req(dict(final)=={"accept-current":190,"correction":34,"refinement":16},"cross decision counts")
    req(dict(baseline)=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1} and not any(selected.values()),"baseline/final token counts")
    target_file=readjl(root/"target-disagreements.jsonl"); changed_file=readjl(root/"changed-selections.jsonl")
    req(target_file==tdiff and changed_file==changed,"derived row inventories")
    req(all((x["position"],x["locale"]) in {(3723,"de"),(3724,"ar"),(3727,"id")} for x in tdiff if x["selectionSource"]=="current"),"current-value tie-break inventory")
    req({(x["position"],x["locale"]) for x in tdiff if x["selectionSource"]=="current"}=={(3723,"de"),(3724,"ar"),(3727,"id")},"three current overrides")
    carries=readjl(root/"candidate-free-input"/"carry-forward-hold-hashes.jsonl")
    pcarry=readjl(root/"primary-packet"/"primary-review"/"carried-holds-reattestation.jsonl")
    bcarry=readjl(root/"blind-packet"/"blind-review"/"carry-forward-hold-reattestation.jsonl")
    crosscarry=readjl(root/"carried-hold-reattestation.jsonl")
    req(len(carries)==len(pcarry)==len(bcarry)==len(crosscarry)==12,"carried hold count")
    for x in crosscarry:
        k=(x["position"],x["locale"],x["sourceId"])
        a=next(y for y in carries if (y["position"],y["locale"],y["sourceId"])==k)
        b=next(y for y in pcarry if (y["position"],y["locale"],y["sourceId"])==k)
        d=next(y for y in bcarry if (y["position"],y["locale"],y["sourceId"])==k)
        req(x["retained"] and x["callerless"] and x["targetTextIncluded"] is False and not any(x.get(z) for z in ("target","targetText")),"carried hold privacy/retention")
        req(a["currentTargetSha256"]==a["priorTargetSha256"]==a["previousApplicationTargetSha256"]==x["currentTargetSha256"]==b["currentTargetSha256"]==d["currentTargetSha256"],"carried hold hash lineage "+str(k))
        req(b["hashesAgree"] and d["matches"],"nested hold reattestation "+str(k))
    summary=readj(root/"cross-audit-summary.json")
    req(summary["cellCount"]==240 and summary["primaryBlindTargetDisagreements"]==46 and summary["primaryBlindDispositionDisagreements"]==28 and summary["selectedTargetChanges"]==50 and summary["retainedCurrent"]==190 and summary["newWindowHolds"]==0,"cross summary counts")
    req(summary["crossDispositionCounts"]==dict(final) and summary["carriedCallerlessHoldsReattested"]==12,"summary counts/holds")
    nested_result=readj(root/"verifier-results.json")
    recorded=nested_result["results"]
    req(recorded["candidateFree"]["result"]["result"]=="PASS" and recorded["primary"]["result"]["result"]=="PASS" and recorded["blind"]["result"]["pass"] is True,"recorded nested verifier results")
    ran=False
    if run_nested:
        if repo is None: repo=EXPECTED_REPO
        repo=repo.resolve()
        req(repo.is_dir(),"pinned repository checkout missing")
        head=subprocess.check_output(["git","-C",str(repo),"rev-parse","HEAD"],text=True).strip()
        tree=subprocess.check_output(["git","-C",str(repo),"rev-parse","HEAD^{tree}"],text=True).strip()
        req((head,tree)==(HEAD,TREE),"pinned repository checkout drift")
        jobs=[
          ["python3",str(root/"primary-packet"/"verify_candidate_free.py"),"--input",str(root/"candidate-free-input"),"--repo",str(repo)],
          ["python3",str(root/"primary-packet"/"primary-review"/"verify_primary.py"),"--input",str(root/"candidate-free-input"),"--output",str(root/"primary-packet"/"primary-review")],
          ["python3",str(root/"blind-packet"/"blind-review"/"verify_blind_review.py")],
        ]
        outs=[]
        for i,cmd in enumerate(jobs):
            cwd=str(root/"blind-packet"/"blind-review") if i==2 else str(root)
            result=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True)
            req(result.returncode==0,f"nested verifier failed: {cmd[1]}: {result.stdout} {result.stderr}")
            outs.append(json.loads(result.stdout))
        req(outs[0]["result"]=="PASS" and outs[1]["result"]=="PASS" and outs[2]["pass"] is True,"nested verifier result")
        ran=True
    return {"result":"PASS","head":HEAD,"tree":TREE,"cells":len(L),"targetDisagreements":len(tdiff),"dispositionDisagreements":len(ddiff),"crossCounts":dict(final),"selectedChanges":len(changed),"sharedChanged":len(common_changed),"carriedHolds":len(crosscarry),"baselineTokenMismatches":dict(baseline),"selectedTokenFailures":dict(selected),"packetFilesByteCompared":{"primary":n_primary,"blind":n_blind,"candidateFree":n_cf},"nestedVerifiersRerun":ran}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",type=Path,default=Path(__file__).resolve().parent)
    ap.add_argument("--repo",type=Path,default=None)
    ap.add_argument("--skip-nested",action="store_true",help="verify sealed packet offline without executing the source-checkout verifiers")
    a=ap.parse_args()
    print(json.dumps(verify(a.root,a.repo,not a.skip_nested),ensure_ascii=False,indent=2))
if __name__=="__main__": main()
