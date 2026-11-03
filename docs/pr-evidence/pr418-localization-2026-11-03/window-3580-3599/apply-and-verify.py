#!/usr/bin/env python3
import hashlib,json,subprocess,re,datetime,runpy,os
from pathlib import Path
WORK=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-apply-20261103/repo")
OUT=WORK/"docs/pr-evidence/pr418-localization-2026-11-03/window-3580-3599"
BASE="30f626a4626d460f426666cde02f5c1ed17fa206"
TREE="9b2616780791c73eb176aca6ad53061f1f3587d8"
BRANCH="codex/seerrng-localization-overhaul-20261028"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
PH=re.compile(r"\{[^{}\r\n]+\}")
MK=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode("utf-8"))
def run(args,cwd=WORK): return subprocess.check_output(args,cwd=cwd,text=True).strip()
def jread(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def verify_sums(d):
    for line in (d/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        h,n=line.split(None,1); n=n.strip().lstrip("*")
        assert sha((d/n).read_bytes())==h,(str(d/n),"checksum")
def paths():
    return {"input":OUT/"candidate-free-input","primary":OUT/"primary-review","blind":OUT/"blind-review","root":OUT/"root-cross-audit"}
def get_base(path):
    return subprocess.check_output(["git","show",f"{BASE}:{path}"],cwd=WORK)
def key_order(obj): return list(obj.keys())
def order_hash(keys): return sha(json.dumps(keys,ensure_ascii=False,separators=(",",":")).encode("utf-8"))
def check_preflight_and_live():
    pre=jread(OUT/"preflight.json")
    assert run(["git","rev-parse","HEAD"])==BASE
    assert run(["git","rev-parse","HEAD^{tree}"])==TREE
    assert run(["git","branch","--show-current"])==BRANCH
    pr=json.loads(run(["gh","api","repos/snapetech-org/seerrng/pulls/418"]))
    assert pr["state"]=="open" and pr["draft"] is True
    assert pr["head"]["ref"]==BRANCH and pr["head"]["sha"]==BASE and pr["base"]["ref"]=="main"
    refs=run(["git","ls-remote","origin",f"refs/heads/{BRANCH}","refs/pull/418/head"])
    rm={x.split()[1]:x.split()[0] for x in refs.splitlines()}
    assert rm=={f"refs/heads/{BRANCH}":BASE,"refs/pull/418/head":BASE}
    assert run(["gh","api",f"repos/snapetech-org/seerrng/git/commits/{BASE}","--jq",".tree.sha"])==TREE
    status=run(["git","status","--porcelain=v1"])
    prefix="?? docs/pr-evidence/pr418-localization-2026-11-03/window-3580-3599"
    assert all(line.startswith(prefix) for line in status.splitlines()),status
    assert run(["git","diff","--name-only"])==""
    assert run(["git","diff","--cached","--name-only"])==""
    assert pre["initialWorktreeCleanBeforeEvidenceCopy"] is True
    assert pre["head"]==BASE and pre["tree"]==TREE and pre["branchRef"]==BASE and pre["pullRef"]==BASE
    return pr,status
def edit_line(raw,source_id,current,target):
    key=json.dumps(source_id,ensure_ascii=False)
    lines=raw.decode("utf-8").splitlines(keepends=True)
    matches=[]
    pattern=re.compile(r"^(?P<pre>\s*"+re.escape(key)+r"\s*:\s*)(?P<value>\"(?:\\.|[^\"\\])*\")(?P<comma>,?)(?P<tail>\s*)$")
    for i,line in enumerate(lines):
        nl="\r\n" if line.endswith("\r\n") else "\n" if line.endswith("\n") else ""
        body=line[:-len(nl)] if nl else line
        m=pattern.match(body)
        if m:
            matches.append((i,nl,m))
    assert len(matches)==1,(source_id,len(matches))
    i,nl,m=matches[0]
    assert json.loads(m.group("value"))==current,(source_id,json.loads(m.group("value")),current)
    newval=json.dumps(target,ensure_ascii=False)
    lines[i]=m.group("pre")+newval+m.group("comma")+m.group("tail")+nl
    out="".join(lines).encode("utf-8")
    assert json.loads(out)[source_id]==target
    return out
def apply_exact():
    PK=paths()
    for d in PK.values(): verify_sums(d)
    input_manifest=jread(PK["input"]/"manifest.json")
    window=jread(PK["input"]/"window.json")
    pins=jread(PK["input"]/"file-pins.json")
    approved=jread(OUT/"approved-application-plan.json")
    auth=jread(OUT/"application-authorization.json")
    proposal=jread(PK["root"]/"application-plan-proposal.json")
    assert input_manifest["head"]==BASE and input_manifest["tree"]==TREE
    assert window["window"]=="W3580-W3599" and window["localeOrder"]==LOCALES
    assert approved["authorizedForApplication"] is True and approved["updateCount"]==28 and approved["holdCount"]==0
    assert auth["authorized"] is True and auth["scope"]["head"]==BASE and auth["scope"]["tree"]==TREE
    assert approved["rootProposalSha256"]==sha((PK["root"]/"application-plan-proposal.json").read_bytes())
    assert approved["updates"]==proposal["updates"]
    pr,status=check_preflight_and_live()
    assert len(approved["updates"])==28 and len({(x["position"],x["locale"]) for x in approved["updates"]})==28
    file_pins=pins["catalogFiles"]
    src={r["position"]:r for r in jl(PK["input"]/"source-cells.jsonl")}
    baseline={}
    for path,meta in file_pins.items():
        raw=get_base(path)
        assert sha(raw)==meta["sha256"] and len(raw)==meta["byteCount"],path
        assert (WORK/path).read_bytes()==raw,path
        obj=json.loads(raw)
        keys=key_order(obj)
        assert len(keys)==meta["keyCount"] and order_hash(keys)==meta["orderedKeysSha256"],path
        baseline[path]=obj
    by_path={}
    for u in approved["updates"]:
        path=u["catalogPath"]
        assert path in file_pins and u["sourceId"].rsplit(".",1)[-1]==u["sourceKey"]
        assert st(u["currentTarget"])==u["currentTargetSha256"] and st(u["target"])==u["targetSha256"]
        assert baseline[path][u["sourceId"]]==u["currentTarget"],(path,u["sourceId"])
        by_path.setdefault(path,[]).append(u)
    assert len(by_path)==11
    # Reattest live refs and clean baseline immediately before catalog writes.
    check_preflight_and_live()
    for path,updates in by_path.items():
        raw=(WORK/path).read_bytes()
        for u in updates:
            raw=edit_line(raw,u["sourceId"],u["currentTarget"],u["target"])
        (WORK/path).write_bytes(raw)
    verify_local_state(write_artifacts=True)
def verify_local_state(write_artifacts=False):
    PK=paths()
    for d in PK.values(): verify_sums(d)
    approved=jread(OUT/"approved-application-plan.json")
    pins=jread(PK["input"]/"file-pins.json")
    sources={r["position"]:r for r in jl(PK["input"]/"source-cells.jsonl")}
    root=jl(PK["root"]/"root-decision-ledger.jsonl")
    updates=approved["updates"]
    update_map={(u["position"],u["locale"]):u for u in updates}
    assert len(root)==240 and len(update_map)==28
    catalog_objs={}; invariants=[]
    for path,meta in pins["catalogFiles"].items():
        raw=(WORK/path).read_bytes()
        base_raw=get_base(path)
        base_obj=json.loads(base_raw); cur=json.loads(raw)
        base_keys=key_order(base_obj); cur_keys=key_order(cur)
        assert base_keys==cur_keys and len(cur_keys)==meta["keyCount"] and order_hash(cur_keys)==meta["orderedKeysSha256"],path
        expected_updates=[u for u in updates if u["catalogPath"]==path]
        expected_keys={u["sourceId"] for u in expected_updates}
        diffs=[k for k in base_keys if base_obj[k]!=cur[k]]
        assert set(diffs)==expected_keys,(path,diffs,expected_keys)
        for u in expected_updates: assert cur[u["sourceId"]]==u["target"],(path,u["sourceId"])
        catalog_objs[path]=cur
        invariants.append({"catalogPath":path,"preApplySha256":meta["sha256"],"postApplySha256":sha(raw),
            "preApplyGitBlob":meta["gitBlob"],"keyCount":len(cur_keys),"orderedKeysSha256":order_hash(cur_keys),
            "keyOrderPreserved":True,"changedKeys":sorted(diffs),"changedValueCount":len(diffs),
            "expectedChangedValueCount":len(expected_keys),"nonTargetValuesPreserved":len(diffs)==len(expected_keys)})
    readback=[]
    for r in root:
        key=(r["position"],r["locale"]); path=r["catalogPath"]
        actual=catalog_objs[path][r["sourceId"]]
        s=sources[r["position"]]
        checks={"targetMatches":actual==r["rootTarget"],"targetHashMatches":st(actual)==r["rootTargetSha256"],
          "placeholdersPreserved":s["sourcePlaceholders"]==PH.findall(actual),
          "markupPreserved":s["sourceMarkupTokens"]==MK.findall(actual),
          "numericTokensPreserved":s["sourceNumericTokens"]==NUM.findall(actual),
          "protectedLiteralsPreserved":all(t in actual for t in s["sourceProtectedLiterals"])}
        assert all(checks.values()),(key,checks)
        u=update_map.get(key)
        if r["rootDisposition"]=="propose-update":
            assert u is not None and u["target"]==actual and u["targetSha256"]==st(actual)
        else:
            assert u is None and r["rootDisposition"]=="retain-current" and actual==r["currentTarget"]
        readback.append({"position":r["position"],"sourceId":r["sourceId"],"locale":r["locale"],
          "catalogPath":path,"currentTarget":r["currentTarget"],"currentTargetSha256":r["currentTargetSha256"],
          "rootDisposition":r["rootDisposition"],"expectedTarget":r["rootTarget"],"expectedTargetSha256":r["rootTargetSha256"],
          "readbackTarget":actual,"readbackTargetSha256":st(actual),"checks":checks})
    assert len(readback)==240
    counts={d:sum(r["rootDisposition"]==d for r in root) for d in ["propose-update","retain-current","hold"]}
    assert counts=={"propose-update":28,"retain-current":212,"hold":0}
    assert sum(x["changedValueCount"] for x in invariants)==28
    if write_artifacts:
        (OUT/"readback-240-cells.jsonl").write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in readback),encoding="utf-8")
        (OUT/"catalog-invariants.json").write_text(json.dumps({"schemaVersion":1,"parentHead":BASE,"catalogCount":len(invariants),
            "catalogs":invariants,"keyOrdersPreserved":True,"nonTargetValuesPreserved":True,
            "totalChangedCatalogValues":28},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        status=run(["git","status","--porcelain=v1"])
        allowed={u["catalogPath"] for u in updates}
        for line in status.splitlines():
            if line.startswith("?? "): assert line[3:].startswith("docs/pr-evidence/pr418-localization-2026-11-03/window-3580-3599"),line
            else:
                path=line.split(maxsplit=1)[-1]
                assert path in allowed,(line,path)
        assert run(["git","diff","--check"])==""
        application={"schemaVersion":1,"status":"PASS","repository":"snapetech-org/seerrng","pullRequest":418,
          "window":"W3580-W3599","parentHead":BASE,"parentTree":TREE,"reviewedCells":240,
          "dispositions":counts,"appliedUpdates":28,"changedCatalogCount":len([x for x in invariants if x["changedValueCount"]]),
          "catalogInvariantCount":len(invariants),"orderedKeyAndCountChecks":"PASS","nonTargetValueChanges":0,
          "placeholderMismatches":0,"markupMismatches":0,"numericMismatches":0,"protectedLiteralMismatches":0,
          "livePrewriteRefsReattested":True,"worktreeStatusBeforeCommit":status.splitlines(),
          "testsBuildsScansCiDispatchesRun":False,"workflowFilesEdited":False,
          "createdAtUtc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
        (OUT/"application-verification.json").write_text(json.dumps(application,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return {"counts":counts,"readback":len(readback),"changedCatalogValues":28,"invariantCatalogs":len(invariants)}
def write_checksums():
    files=sorted(p for p in OUT.rglob("*") if p.is_file() and p!=OUT/"SHA256SUMS.txt")
    lines=[f"{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}" for p in files]
    (OUT/"SHA256SUMS.txt").write_text("\n".join(lines)+"\n",encoding="utf-8")
def verify():
    PK=paths()
    for d in PK.values(): verify_sums(d)
    verify_sums(OUT)
    pre=jread(OUT/"preflight.json"); approved=jread(OUT/"approved-application-plan.json")
    auth=jread(OUT/"application-authorization.json"); pins=jread(PK["input"]/"file-pins.json")
    root=jl(PK["root"]/"root-decision-ledger.jsonl"); rb=jl(OUT/"readback-240-cells.jsonl")
    inv=jread(OUT/"catalog-invariants.json")
    assert pre["head"]==BASE and pre["tree"]==TREE and pre["branchRef"]==BASE and pre["pullRef"]==BASE
    assert approved["authorizedForApplication"] and auth["authorized"] and approved["parentHead"]==BASE
    assert len(root)==len(rb)==240 and approved["updateCount"]==28
    assert inv["catalogCount"]==len(pins["catalogFiles"])
    # Reconcile current repository readback against sealed root decisions and baseline Git blobs.
    result=verify_local_state(write_artifacts=False)
    for r,actual in zip(root,rb):
        assert (actual["position"],actual["locale"],actual["sourceId"])==(r["position"],r["locale"],r["sourceId"])
        assert actual["expectedTarget"]==r["rootTarget"] and actual["readbackTarget"]==r["rootTarget"]
        assert all(actual["checks"].values())
    plan_keys={(u["position"],u["locale"]) for u in approved["updates"]}
    assert sum(x["rootDisposition"]=="propose-update" for x in root)==len(plan_keys)==28
    assert result["counts"]=={"propose-update":28,"retain-current":212,"hold":0}
    return {"result":"PASS","readbackCells":240,"updates":28,"retains":212,"holds":0,
      "catalogsWithChanges":11,"allCatalogInvariants":inv["catalogCount"],"rootDecisionLedgerSha256":sha((PK["root"]/"root-decision-ledger.jsonl").read_bytes()),
      "readbackSha256":sha((OUT/"readback-240-cells.jsonl").read_bytes())}
def main():
    result=verify_local_state(write_artifacts=True)
    verifier="from pathlib import Path\nimport runpy\nns=runpy.run_path(str(Path(__file__).with_name('apply-and-verify.py')))\nprint(ns['verify']())\n"
    (OUT/"verify-application.py").write_text(verifier,encoding="utf-8")
    write_checksums()
    print(json.dumps(verify(),ensure_ascii=False,indent=2))
    print(json.dumps({"readback":result},ensure_ascii=False))
if __name__=="__main__": main()
