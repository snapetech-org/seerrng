#!/usr/bin/env python3
from __future__ import annotations
import argparse, collections, hashlib, json, re, subprocess
from pathlib import Path

HEAD="77d30ae742aad7245e6e419237fca6a544531e1f"
TREE="2c6fe4a0c1c33aa56b01f06a70702f68598509a7"
BASE="2647e15762de0c2285cd9d8ebc6d27ffafce6358"
BASETREE="b6f4acb9debdc1b0a838b50d5ad88aaa467e429b"
LOCALES=["es","zh-Hans","hi","de","ja","fr","pt-BR","ar","ko","zh-Hant","vi","id"]
PATHS={"en":"src/i18n/locale/en.json","es":"src/i18n/locale/es.json","zh-Hans":"src/i18n/locale/zh_Hans.json",
"hi":"src/i18n/locale/hi.json","de":"src/i18n/locale/de.json","ja":"src/i18n/locale/ja.json","fr":"src/i18n/locale/fr.json",
"pt-BR":"src/i18n/locale/pt_BR.json","ar":"src/i18n/locale/ar.json","ko":"src/i18n/locale/ko.json",
"zh-Hant":"src/i18n/locale/zh_Hant.json","vi":"src/i18n/locale/vi.json","id":"src/i18n/locale/id.json"}
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
def readj(p): return json.loads(p.read_text(encoding="utf-8"))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def icu(value):
    out=[]
    for start,ch in enumerate(value):
        if ch!="{": continue
        depth=0
        for end in range(start,len(value)):
            if value[end]=="{": depth+=1
            elif value[end]=="}":
                depth-=1
                if depth==0: break
        else: continue
        raw=value[start:end+1]
        m=re.match(r"^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*("+ "|".join(ICU_TYPES)+r")\b",raw)
        if m:
            sels=re.findall(r"(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{",raw)
            out.append({"argument":m.group(1),"formatType":m.group(2),"selectors":sels,"usesPound":"#" in raw,"raw":raw})
    return out
def tokens(value):
    protected=list(dict.fromkeys(PROTECTED.findall(value)))
    protected.extend(x for x in EXTRA if x in value and x not in protected)
    return {"placeholders":PLACEHOLDER.findall(value),"icuExpressions":icu(value),"markupTags":MARKUP.findall(value),
      "numericTokens":NUMBERS.findall(value),"protectedLiterals":protected,
      "inlineCode":re.findall(chr(96)+r"([^"+chr(96)+r"]+)"+chr(96),value)}
def token_checks(source,target):
    a,b=tokens(source),tokens(target)
    shape=lambda xs:[(x["argument"],x["formatType"],x["selectors"],x["usesPound"]) for x in xs]
    c={"placeholders":a["placeholders"]==b["placeholders"],"icuExpressions":shape(a["icuExpressions"])==shape(b["icuExpressions"]),
      "markupTags":a["markupTags"]==b["markupTags"],"numericTokens":a["numericTokens"]==b["numericTokens"],
      "protectedLiterals":all(x in b["protectedLiterals"] for x in a["protectedLiterals"]),
      "inlineCode":a["inlineCode"]==b["inlineCode"]}
    return {"checks":c,"allMatch":all(c.values()),"sourceTokens":a,"targetTokens":b,
      "missingProtectedLiterals":[x for x in a["protectedLiterals"] if x not in b["protectedLiterals"]]}
def git(repo,*args): return subprocess.check_output(["git","-C",str(repo),*args])
def parse_json(raw):
    dups=[]
    def pairs(ps):
        d={}
        for k,v in ps:
            if k in d: dups.append(k)
            d[k]=v
        return d
    obj=json.loads(raw,object_pairs_hook=pairs)
    need(isinstance(obj,dict) and not dups,"catalog JSON duplicate keys or non-object")
    return obj
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",type=Path,help="local SeerrNG Git worktree/object database for exact-head verification")
    args=ap.parse_args()
    here=Path(__file__).resolve().parent
    sums={}
    for line in (here/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        h,name=line.split("  ",1)
        p=Path(name); need(not p.is_absolute() and ".." not in p.parts,"unsafe checksum path")
        need(name not in sums,"duplicate checksum path")
        sums[name]=h
    actual={p.relative_to(here).as_posix() for p in here.rglob("*") if p.is_file() and p.name!="SHA256SUMS.txt"}
    need(set(sums)==actual,"checksum inventory differs from packet files")
    for name,h in sums.items(): need(sha((here/name).read_bytes())==h,"checksum mismatch "+name)
    manifest=readj(here/"manifest.json"); summary=readj(here/"summary.json")
    need(manifest["packetType"]=="candidate-free-current-input" and manifest["window"]=="W4000-W4019","manifest identity")
    need(manifest["exactHead"]==HEAD and manifest["exactTree"]==TREE and manifest["baseSha"]==BASE and manifest["baseTree"]==BASETREE,"manifest pins")
    need(manifest["translationProposalsIncluded"] is False and manifest["oldPrimaryOrBlindProposalsRead"] is False,"candidate-free provenance")
    need(set(manifest["files"])==set(sums),"manifest/checksum inventory")
    before=readj(here/"attestations-before.json"); after=readj(here/"attestations-after.json")
    for att in (before,after):
        need(att["headRefOid"]==HEAD and att["headTree"]==TREE and att["baseRefOid"]==BASE and att["baseTree"]==BASETREE,"attestation pins")
        need(att["state"]=="OPEN" and att["isDraft"] is True,"PR state")
        need({(r["ref"],r["sha"]) for r in att["remoteRefs"]}=={
          ("refs/heads/codex/seerrng-localization-overhaul-20261028",HEAD),
          ("refs/heads/main",BASE),("refs/pull/418/head",HEAD)},"remote refs")
    need(before["remoteRefs"]==after["remoteRefs"],"before/after refs differ")
    sources=readjl(here/"selected-source-cells.jsonl")
    cells=readjl(here/"current-target-cells.jsonl")
    contexts=readjl(here/"caller-contexts.jsonl")
    blocks=readjl(here/"caller-context-blocks.jsonl")
    need(len(sources)==20 and len({r["sourceId"] for r in sources})==20,"source inventory")
    need(len(cells)==240 and len({r["cellId"] for r in cells})==240,"cell inventory")
    need(len(contexts)==20 and {r["sourceId"] for r in contexts}=={r["sourceId"] for r in sources},"caller context coverage")
    need(len({(r["sourceId"],r["locale"]) for r in cells})==240,"duplicate source-locale cell")
    need(all(4000<=r["previousPosition"]<=4019 for r in sources),"prior W4000 source positions")
    need([r["previousPosition"] for r in sources]==list(range(4000,4020)),"prior W4000 sequence")
    need([r["currentPosition"] for r in sources]==list(range(sources[0]["currentPosition"],sources[0]["currentPosition"]+20)),"current source sequence")
    source_by={r["sourceId"]:r for r in sources}; context_by={r["sourceId"]:r for r in contexts}
    need([r["sourceId"] for r in cells]==[s["sourceId"] for s in sources for _ in LOCALES],"cell source order")
    need([r["locale"] for r in cells]==LOCALES*20,"cell locale order")
    for s in sources:
        need(shat(s["sourceId"])==s["sourceIdSha256"] and shat(s["sourceText"])==s["sourceTextSha256"],"source hashes "+s["sourceId"])
        need(s["exactHead"]==HEAD and s["exactTree"]==TREE,"source exact pin")
    for c in contexts:
        material={k:c[k] for k in ("exactHead","exactTree","sourceId","sourceIdSha256","sourceTextSha256","previousCallerContextSha256","currentFilePins","verifiedCallerLines")}
        need(sha(canon(material))==c["callerContextSha256"],"caller context hash "+c["sourceId"])
        need(c["sourceTextSha256"]==source_by[c["sourceId"]]["sourceTextSha256"],"caller/source binding "+c["sourceId"])
        need(bool(c["verifiedCallerLines"]),"caller line evidence "+c["sourceId"])
        for b in c["currentFilePins"]:
            need((here/"runtime-caller-file-pins.json").is_file(),"runtime file pin file missing")
            pinmap={x["path"]:x for x in readj(here/"runtime-caller-file-pins.json")["files"]}
            need(pinmap.get(b["path"],{}).get("sha256")==b["sha256"] and pinmap[b["path"]]["gitBlob"]==b["gitBlob"],"caller file pin "+b["path"])
    for b in blocks: need(b["verified"] is True and b["exactHead"]==HEAD and b["exactTree"]==TREE,"caller block exact pin")
    cell_by_id={r["cellId"]:r for r in cells}
    mismatch=collections.Counter()
    for c in cells:
        s=source_by[c["sourceId"]]; ctx=context_by[c["sourceId"]]
        need(c["exactHead"]==HEAD and c["exactTree"]==TREE,"cell exact pin "+c["cellId"])
        need(c["sourceText"]==s["sourceText"] and c["sourceTextSha256"]==s["sourceTextSha256"],"cell source binding "+c["cellId"])
        need(c["sourceIdSha256"]==s["sourceIdSha256"] and c["currentPosition"]==s["currentPosition"],"cell identity "+c["cellId"])
        need(c["currentTargetPresent"] is True and shat(c["currentTarget"])==c["currentTargetSha256"],"target value hash "+c["cellId"])
        need(c["callerContextSha256"]==ctx["callerContextSha256"],"caller hash binding "+c["cellId"])
        check=token_checks(c["sourceText"],c["currentTarget"])
        need(check==c["tokenChecks"] and tokens(c["currentTarget"])==c["targetTokens"],"token audit "+c["cellId"])
        if not check["allMatch"]:
            for k,v in check["checks"].items():
                if not v: mismatch[k]+=1
        clone=dict(c); digest=clone.pop("inputCellSha256")
        need(sha(canon(clone))==digest,"input cell hash "+c["cellId"])
    need(dict(mismatch)==readj(here/"token-audit.json")["mismatchCounts"],"token summary mismatch")
    need(summary["selectedSourceCount"]==20 and summary["cellCount"]==240 and summary["callerlessSources"]==0,"summary counts")
    if args.repo:
        repo=args.repo.resolve()
        need(git(repo,"rev-parse",HEAD+"^{tree}").decode().strip()==TREE,"exact source tree not available")
        need(git(repo,"rev-parse",BASE+"^{tree}").decode().strip()==BASETREE,"exact base tree not available")
        current_catalogs={}
        for loc,path in PATHS.items():
            raw=git(repo,"show",f"{HEAD}:{path}")
            pin=readj(here/"catalog-file-pins.json")["catalogs"][loc]
            need(sha(raw)==pin["sha256"] and git(repo,"rev-parse",f"{HEAD}:{path}").decode().strip()==pin["gitBlob"],"catalog blob/source hash "+loc)
            current_catalogs[loc]=parse_json(raw)
        en=current_catalogs["en"]; ids=list(en); positions={sid:i for i,sid in enumerate(ids)}
        need(len(ids)==9537,"current English source count")
        for s in sources:
            need(s["sourceId"] in en and en[s["sourceId"]]==s["sourceText"],"exact-head English value "+s["sourceId"])
            need(positions[s["sourceId"]]==s["currentPosition"],"exact-head English position "+s["sourceId"])
        for c in cells:
            need(current_catalogs[c["locale"]].get(c["sourceId"])==c["currentTarget"],"exact-head current target value "+c["cellId"])
        all_code_pins=readj(here/"runtime-caller-file-pins.json")["files"]
        for pin in all_code_pins:
            raw=git(repo,"show",f"{HEAD}:{pin['path']}")
            need(sha(raw)==pin["sha256"] and git(repo,"rev-parse",f"{HEAD}:{pin['path']}").decode().strip()==pin["gitBlob"],"exact-head caller blob "+pin["path"])
            lines=raw.decode("utf-8").splitlines()
            for c in contexts:
                for line in c["verifiedCallerLines"]:
                    if line["path"]==pin["path"]:
                        need(lines[line["line"]-1]==line["text"] and shat(lines[line["line"]-1])==line["lineSha256"],"exact-head caller line")
        need(len(blocks)>0,"caller block set empty")
    print("PASS: 20 selected W4000-W4019 source IDs, 240 current-target cells, caller/source pins, tokens, checksums, before/after refs"+("; exact Git catalog and caller objects" if args.repo else ""))
if __name__=="__main__": main()
