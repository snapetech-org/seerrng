#!/usr/bin/env python3
from __future__ import annotations
import argparse, collections, hashlib, json, re, subprocess
from pathlib import Path

HEAD="77d30ae742aad7245e6e419237fca6a544531e1f"
TREE="2c6fe4a0c1c33aa56b01f06a70702f68598509a7"
BASE="2647e15762de0c2285cd9d8ebc6d27ffafce6358"
BASETREE="b6f4acb9debdc1b0a838b50d5ad88aaa467e429b"
OLDHEAD="ac193096ebfc0007183348b24e35bf6fee33f67a"
OLDTREE="93e71e7c52602ec3f8b76548fd12b2f5b4368b4c"
LOCALES=["es","zh-Hans","hi","de","ja","fr","pt-BR","ar","ko","zh-Hant","vi","id"]
ICU_TYPES=("plural","select","selectordinal","number","date","time")
PLACEHOLDER=re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
MARKUP=re.compile(r"</?[A-Za-z][^>]*>")
NUMBERS=re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])")
PROTECTED=re.compile(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])")
EXTRA=("SeerrNG","Seerr","BookshelfNG","ReadMeABook")
def need(ok,msg):
    if not ok: raise SystemExit("FAIL: "+msg)
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode("utf-8"))
def canon(o): return (json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode("utf-8")
def j(path): return json.loads(path.read_text(encoding="utf-8"))
def jl(path): return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
def icu(s):
    out=[]
    for start,ch in enumerate(s):
        if ch!="{": continue
        depth=0
        for end in range(start,len(s)):
            if s[end]=="{": depth+=1
            elif s[end]=="}":
                depth-=1
                if depth==0: break
        else: continue
        raw=s[start:end+1]
        m=re.match(r"^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*("+ "|".join(ICU_TYPES)+r")\b",raw)
        if m:
            sels=re.findall(r"(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{",raw)
            out.append({"argument":m.group(1),"formatType":m.group(2),"selectors":sels,"usesPound":"#" in raw,"raw":raw})
    return out
def tokens(s):
    p=list(dict.fromkeys(PROTECTED.findall(s))); p.extend(x for x in EXTRA if x in s and x not in p)
    return {"placeholders":PLACEHOLDER.findall(s),"icuExpressions":icu(s),"markupTags":MARKUP.findall(s),
      "numericTokens":NUMBERS.findall(s),"protectedLiterals":p,"inlineCode":re.findall(chr(96)+r"([^"+chr(96)+r"]+)"+chr(96),s)}
def git(repo,*args): return subprocess.check_output(["git","-C",str(repo),*args])
def check(src,tgt):
    a,b=tokens(src),tokens(tgt)
    shape=lambda q:[(x["argument"],x["formatType"],x["selectors"],x["usesPound"]) for x in q]
    checks={"placeholders":a["placeholders"]==b["placeholders"],"icuExpressions":shape(a["icuExpressions"])==shape(b["icuExpressions"]),
      "markupTags":a["markupTags"]==b["markupTags"],"numericTokens":a["numericTokens"]==b["numericTokens"],
      "protectedLiterals":all(x in b["protectedLiterals"] for x in a["protectedLiterals"]),
      "inlineCode":a["inlineCode"]==b["inlineCode"]}
    return checks
def verify_sums(packet):
    sums={}
    for line in (packet/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        h,name=line.split("  ",1)
        p=Path(name); need(not p.is_absolute() and ".." not in p.parts,"unsafe checksum path")
        need(name not in sums,"duplicate checksum path")
        sums[name]=h
    actual={p.relative_to(packet).as_posix() for p in packet.rglob("*") if p.is_file() and p.name!="SHA256SUMS.txt"}
    need(set(sums)==actual,"checksum inventory mismatch in "+str(packet))
    for name,h in sums.items(): need(sha((packet/name).read_bytes())==h,"checksum mismatch "+str(packet/name))
    return sums
def verify_main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--candidate-free",type=Path,default=Path("../candidate-free"))
    ap.add_argument("--primary",type=Path,default=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-primary-20261105/primary-review"))
    ap.add_argument("--blind",type=Path,default=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-blind-seal-20261105"))
    ap.add_argument("--repo",type=Path,help="exact-head Git worktree for catalog and caller object verification")
    args=ap.parse_args()
    here=Path(__file__).resolve().parent
    cf=args.candidate_free.resolve(); primary=args.primary.resolve(); blind=args.blind.resolve()
    sums=verify_sums(here); manifest=j(here/"manifest.json"); summary=j(here/"recommendations-summary.json")
    need(manifest["packetType"]=="cross-review" and manifest["window"]=="W4000-W4019","cross manifest identity")
    need(manifest["exactHead"]==HEAD and manifest["exactTree"]==TREE and manifest["baseSha"]==BASE and manifest["baseTree"]==BASETREE,"cross exact pins")
    need(set(manifest["files"])==set(sums),"cross manifest file inventory")
    need(sha((cf/"manifest.json").read_bytes())==manifest["candidateFreeManifestSha256"],"fresh candidate-free manifest pin")
    need(sha((cf/"SHA256SUMS.txt").read_bytes())==manifest["candidateFreeChecksumListSha256"],"fresh candidate-free checksum pin")
    verify_sums(cf)
    cf_manifest=j(cf/"manifest.json")
    need(cf_manifest["exactHead"]==HEAD and cf_manifest["exactTree"]==TREE and cf_manifest["selectedSourceCount"]==20 and cf_manifest["currentTargetCellCount"]==240,"fresh candidate-free identity")
    need(sha((primary/"manifest.json").read_bytes())==manifest["primaryManifestSha256"],"primary manifest pin")
    need(sha((primary/"SHA256SUMS.txt").read_bytes())==manifest["primaryChecksumListSha256"],"primary checksum-list pin")
    need(sha((blind/"blind-seal.json").read_bytes())==manifest["blindSealSha256"],"blind seal pin")
    need(sha((blind/"SHA256SUMS.txt").read_bytes())==manifest["blindChecksumListSha256"],"blind checksum-list pin")
    need(sha((blind/"blind-decision-ledger.jsonl").read_bytes())==manifest["blindLedgerSha256"],"blind decision ledger pin")
    verify_sums(primary); verify_sums(blind)
    pm=j(primary/"manifest.json"); bs=j(blind/"blind-seal.json")
    need((pm["head"],pm["tree"],bs["head"],bs["tree"])==(OLDHEAD,OLDTREE,OLDHEAD,OLDTREE),"old review packet pins")
    sources={r["sourceId"]:r for r in jl(cf/"selected-source-cells.jsonl")}
    cells={(r["sourceId"],r["locale"]):r for r in jl(cf/"current-target-cells.jsonl")}
    contexts={r["sourceId"]:r for r in jl(cf/"caller-contexts.jsonl")}
    ids_by_hash={r["sourceIdSha256"]:r["sourceId"] for r in sources.values()}
    primary_rows=jl(primary/"primary-ledger.jsonl")
    primary_by={(r.get("sourceId") or ids_by_hash[r["sourceIdSha256"]],r["locale"]):r for r in primary_rows}
    primary_props={(r["sourceId"],r["locale"]):r for r in jl(primary/"selected-proposals.jsonl")}
    primary_holds={(ids_by_hash[r["sourceIdSha256"]],r["locale"]):r for r in jl(primary/"hash-only-holds.jsonl")}
    blind_rows=jl(blind/"blind-decision-ledger.jsonl")
    blind_by={(r["sourceId"],r["locale"]):r for r in blind_rows}
    input_rows=jl(here/"input-reattestation.jsonl")
    input_by={r["cellId"]:r for r in input_rows}
    recs=jl(here/"recommendations.jsonl")
    need(len(sources)==20 and len(cells)==240 and len(input_rows)==240 and len(recs)==240,"240-cell coverage")
    need(len(primary_by)==240 and len(blind_by)==240 and len({r["cellId"] for r in recs})==240,"review source uniqueness")
    need(set(primary_by)==set(cells) and set(blind_by)==set(cells),"source/current review coverage")
    need(summary["recommendationsDifferentFromCurrent"]==50 and summary["hashOnlyHolds"]==12,"cross summary cell counts")
    decision_counts=collections.Counter(); source_counts=collections.Counter(); by_locale=collections.Counter(); changed=0
    for rec in recs:
        key=(rec["sourceId"],rec["locale"]); cell=cells[key]; src=sources[rec["sourceId"]]; ctx=contexts[rec["sourceId"]]
        pr=primary_by[key]; bl=blind_by[key]; reat=input_by[rec["cellId"]]
        need(rec["sourceIdSha256"]==src["sourceIdSha256"] and rec["sourceTextSha256"]==src["sourceTextSha256"],"cross source pin "+rec["cellId"])
        need(rec["currentCallerContextSha256"]==ctx["callerContextSha256"] and rec["previousCallerContextSha256"]==ctx["previousCallerContextSha256"],"cross caller context pin "+rec["cellId"])
        need(rec["inputReattestationSha256"]==reat["reattestationSha256"],"cross reattestation pin "+rec["cellId"])
        need(reat["sourceIdSha256"]==src["sourceIdSha256"] and reat["sourceTextSha256"]==src["sourceTextSha256"] and reat["currentTargetSha256"]==cell["currentTargetSha256"],"input hash binding "+rec["cellId"])
        for lane,row in (("primary",pr),("blind",bl)):
            need(row.get("sourceIdSha256")==src["sourceIdSha256"] and row.get("sourceTextSha256")==src["sourceTextSha256"] and row.get("currentTargetSha256")==cell["currentTargetSha256"],lane+" source/target hash binding "+rec["cellId"])
            need(row.get("callerContextSha256")==ctx["previousCallerContextSha256"],lane+" prior caller context binding "+rec["cellId"])
        need(rec["primaryDisposition"]==pr.get("primaryDisposition") and rec["blindDisposition"]==bl.get("disposition"),"recorded lane decisions "+rec["cellId"])
        is_hold=rec["decision"]=="hold"
        if is_hold:
            need(rec["sourceId"].endswith(".agentenabled"),"unexpected hold cell")
            need(rec.get("recommendationKind")=="hash-only-hold" and rec.get("holdCode")=="PRODUCT_TERM_UNRESOLVED","hold metadata")
            forbidden=("sourceText","currentTarget","primaryCandidate","blindCandidate","recommendedTarget")
            need(not any(k in rec for k in forbidden),"hold row must stay text-free")
            need(rec["currentTargetSha256"]==cell["currentTargetSha256"] and rec.get("primaryHoldHashOnly") is True,"hash-only hold target pin")
            need(key in primary_holds and primary_holds[key].get("hashOnly") is True,"primary hold pin")
            need(bl.get("disposition")=="hold" and bl.get("reviewTargetSha256")==cell["currentTargetSha256"],"blind hold pin")
        else:
            need(rec.get("recommendationKind")=="text","recommendation kind")
            need(rec.get("currentTarget")==cell["currentTarget"] and rec.get("currentTargetSha256")==cell["currentTargetSha256"],"current target text/hash "+rec["cellId"])
            ptext=pr.get("proposedTarget"); phash=pr.get("proposedTargetSha256")
            btext=bl.get("reviewTarget"); bhash=bl.get("reviewTargetSha256")
            need(rec.get("primaryCandidate")==ptext and rec.get("primaryCandidateSha256")==phash,"primary candidate binding "+rec["cellId"])
            need(rec.get("blindCandidate")==btext and rec.get("blindCandidateSha256")==bhash,"blind candidate binding "+rec["cellId"])
            need(rec["recommendedTargetSha256"]==shat(rec["recommendedTarget"]),"recommended target hash "+rec["cellId"])
            need(check(cell["sourceText"],rec["recommendedTarget"])==rec["tokenChecks"],"recommended token diagnostics "+rec["cellId"])
            if ptext is not None:
                need(phash==shat(ptext),"primary candidate hash "+rec["cellId"])
                need(check(cell["sourceText"],ptext)==rec.get("primaryCandidateTokenChecks"),"primary token diagnostics "+rec["cellId"])
            else: need(rec.get("primaryCandidateTokenChecks") is None,"empty primary token checks")
            need(bhash==shat(btext),"blind candidate hash "+rec["cellId"])
            need(check(cell["sourceText"],btext)==rec.get("blindCandidateTokenChecks"),"blind token diagnostics "+rec["cellId"])
            for value,checks,label in ((rec["recommendedTarget"],rec["tokenChecks"],"recommendation"),
              (ptext,rec.get("primaryCandidateTokenChecks"),"primary"),(btext,rec.get("blindCandidateTokenChecks"),"blind")):
                if value is None or checks is None or all(checks.values()): continue
                allowed=(rec["locale"]=="ja" and rec["sourceId"].endswith(".validationTypes") and
                  list(checks)==list(checks) and checks.get("numericTokens") is False and
                  all(v for k,v in checks.items() if k!="numericTokens") and tokens(value)["numericTokens"]==["1"])
                need(allowed,"unapproved token exception "+label+" "+rec["cellId"])
            if rec["recommendedTarget"]!=cell["currentTarget"]: changed+=1
            if rec["selectedSource"]=="current": need(rec["recommendedTarget"]==cell["currentTarget"],"current selection text")
            elif rec["selectedSource"]=="primary": need(rec["recommendedTarget"]==ptext,"primary selection text")
            elif rec["selectedSource"]=="blind": need(rec["recommendedTarget"]==btext,"blind selection text")
            elif rec["selectedSource"]=="primary+blind": need(rec["recommendedTarget"]==ptext==btext,"joint selection text")
            elif rec["selectedSource"]=="cross-adjustment": need(rec["recommendedTarget"] not in (cell["currentTarget"],ptext,btext),"adjustment is not new")
            else: need(False,"unknown selected source")
        clone=dict(rec); dig=clone.pop("reviewRecordSha256")
        need(sha(canon(clone))==dig,"review record hash "+rec["cellId"])
        decision_counts[rec["decision"]]+=1; by_locale[rec["locale"]]+=1
        source_counts[rec.get("selectedSource",rec.get("recommendationKind"))]+=1
    need(changed==50,"recommendation target changes")
    need(decision_counts==collections.Counter({"accept":215,"adjust":13,"hold":12}),"recommendation disposition counts")
    need(by_locale==collections.Counter({l:20 for l in LOCALES}),"locale cell counts")
    need(sum(1 for r in recs if r["sourceId"].endswith(".agentenabled") and r["decision"]=="hold")==12,"hash-only Agent holds")
    for att in (j(here/"attestations-before.json"),j(here/"attestations-after.json")):
        need(att["headRefOid"]==HEAD and att["headTree"]==TREE and att["baseRefOid"]==BASE and att["baseTree"]==BASETREE,"cross PR attestations")
        need(att["state"]=="OPEN" and att["isDraft"] is True,"cross PR state")
        need({(r["ref"],r["sha"]) for r in att["remoteRefs"]}=={
          ("refs/heads/main",BASE),("refs/heads/codex/seerrng-localization-overhaul-20261028",HEAD),("refs/pull/418/head",HEAD)},"cross remote refs")
    need(j(here/"attestations-before.json")["remoteRefs"]==j(here/"attestations-after.json")["remoteRefs"],"cross entry/exit refs changed")
    if args.repo:
        repo=args.repo.resolve()
        need(git(repo,"rev-parse",HEAD+"^{tree}").decode().strip()==TREE,"exact PR tree object")
        need(git(repo,"rev-parse",BASE+"^{tree}").decode().strip()==BASETREE,"exact base tree object")
        subprocess.check_call(["python3",str(cf/"verify_current_packet.py"),"--repo",str(repo)])
    print("PASS: sealed 240-cell W4000-W4019 cross-review, 50 wording changes, 12 text-free holds, old primary/blind inputs rebound to current source/targets, tokens and entry/exit refs"+("; exact Git verification" if args.repo else ""))
if __name__=="__main__": verify_main()
