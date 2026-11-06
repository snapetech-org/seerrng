#!/usr/bin/env python3
"""Verify the exact-head SeerrNG W3800-W3819 cross-application evidence."""
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from pathlib import Path
EVIDENCE=Path(__file__).resolve().parent
ROOT=next((p for p in EVIDENCE.parents if (p/".git").exists()),None)
if ROOT is None: raise SystemExit("FAIL: repository root not found")
BASE="154dbf7fd6b346d9c5bddf23c7c6283db9826313"
PR_TREE="a2f00bcc40b51a5643bbeb3e52ecdfc58a5718b9"
PRIOR="bcc05ad54d1f35221160a3fd7cecc17a423e112d"
APP="df0de5f43bda3793eca746a4a3069f499e1fcf59"
APP_TREE="53b6ab2303ab8355dc93b37e897207dff02b7142"
EXPECTED_EVIDENCE_FILES={"POST-APPLICATION.md","post-application-readback.jsonl","post-application-manifest.json","verify-post-application.py"}
def sha(data): return hashlib.sha256(data).hexdigest()
def git(*args): return subprocess.check_output(["git","-C",str(ROOT),*args])
def jsonl(path): return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x]
def check_sums(directory,name,expected=None):
    seen=set()
    for line in (directory/name).read_text(encoding="utf-8").splitlines():
        digest,filename=line.split("  ",1)
        relative=Path(filename)
        if relative.is_absolute() or ".." in relative.parts or filename in seen: raise ValueError("unsafe checksum entry")
        seen.add(filename)
        if sha((directory/relative).read_bytes())!=digest: raise ValueError("checksum mismatch: "+filename)
    if expected is not None and seen!=expected: raise ValueError("unexpected evidence checksum inventory")
    return seen
def tokens(text,kind,required):
    if kind=="protectedLiterals": return [t for t in required if re.search(r"(?<![A-Za-z0-9])"+re.escape(t)+r"(?![A-Za-z0-9])",text)]
    patterns={"placeholders":r"\{[^{}]+\}","markupTags":r"<[^>]+>","numericTokens":r"(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?![A-Za-z0-9])"}
    return re.findall(patterns[kind],text)
def main():
    check_sums(EVIDENCE,"SHA256SUMS.txt")
    check_sums(EVIDENCE,"POST-APPLICATION-SHA256SUMS.txt",EXPECTED_EVIDENCE_FILES)
    manifest=json.loads((EVIDENCE/"post-application-manifest.json").read_text(encoding="utf-8"))
    if (manifest["catalogApplicationCommit"],manifest["catalogApplicationTree"],manifest["pinnedPrHead"],manifest["pinnedPrTree"])!=(APP,APP_TREE,BASE,PR_TREE): raise ValueError("application pin mismatch")
    if git("rev-parse",f"{APP}^{{tree}}").decode().strip()!=APP_TREE: raise ValueError("application tree mismatch")
    if git("rev-parse",f"{APP}^").decode().strip()!=PRIOR or git("rev-parse",f"{APP}^^").decode().strip()!=BASE: raise ValueError("application history mismatch")
    cross=jsonl(EVIDENCE/"cross-review/root-cross-ledger.jsonl")
    current=jsonl(EVIDENCE/"input/candidate-free-input/current-target-cells.jsonl")
    sources=jsonl(EVIDENCE/"input/candidate-free-input/selected-source-cells.jsonl")
    readback=jsonl(EVIDENCE/"post-application-readback.jsonl")
    if len(cross)!=240 or len(current)!=240 or len(sources)!=20 or len(readback)!=240: raise ValueError("row count mismatch")
    cby={(r["position"],r["locale"]):r for r in current}; sby={r["position"]:r for r in sources}
    xby={(r["position"],r["locale"]):r for r in cross}; rby={(r["position"],r["locale"]):r for r in readback}
    if len(rby)!=240: raise ValueError("duplicate readback rows")
    expected={}
    for key,row in xby.items():
        cur=cby[key]
        if row["catalogPath"]!=cur["catalogPath"] or row["sourceId"]!=cur["sourceId"] or row["currentTargetSha256"]!=cur["currentTargetSha256"]: raise ValueError("cross/candidate input mismatch")
        if sha(row["selectedTarget"].encode())!=row["selectedTargetSha256"]: raise ValueError("selected target hash mismatch")
        if row["selectedTarget"]!=row["currentTarget"]: expected[(row["catalogPath"],row["sourceId"])]=row["selectedTarget"]
        rb=rby[key]
        if not rb["matches"] or rb["selectedTarget"]!=row["selectedTarget"] or rb["readbackTarget"]!=row["selectedTarget"]: raise ValueError("catalog readback mismatch")
        if rb["selectedTargetSha256"]!=row["selectedTargetSha256"] or sha(rb["readbackTarget"].encode())!=rb["readbackTargetSha256"]: raise ValueError("readback hash mismatch")
        if rb["sourceTextSha256"]!=row["sourceTextSha256"] or rb["callerContextSha256"]!=row["callerContextSha256"]: raise ValueError("source/caller pin mismatch")
        for kind,required in sby[row["position"]]["sourceTokens"].items():
            if tokens(row["selectedTarget"],kind,required)!=required: raise ValueError("selected token mismatch: "+kind)
    if len(expected)!=35: raise ValueError("selected update count mismatch")
    paths=sorted({r["catalogPath"] for r in current}|{"src/i18n/locale/en.json"})
    actual={}
    for rel in paths:
        base=json.loads(git("show",f"{BASE}:{rel}").decode("utf-8")); app=json.loads(git("show",f"{APP}:{rel}").decode("utf-8"))
        if list(base.keys())!=list(app.keys()) or set(base)!=set(app): raise ValueError("catalog key sequence/set changed: "+rel)
        for key in base:
            if base[key]!=app[key]: actual[(rel,key)]=app[key]
    if actual!=expected: raise ValueError("non-selected or missing catalog value change")
    changed_paths=sorted({path for path,key in expected})
    diff=git("diff","--name-only",f"{BASE}..{APP}","--","src/i18n/locale").decode().splitlines()
    if sorted(diff)!=changed_paths: raise ValueError("catalog path diff mismatch")
    numstat=[x for x in git("diff","--numstat",f"{BASE}..{APP}","--","src/i18n/locale").decode().splitlines() if x]
    if sum(int(x.split("\t")[0]) for x in numstat)!=35 or sum(int(x.split("\t")[1]) for x in numstat)!=35: raise ValueError("catalog diff line count mismatch")
    if git("diff","--name-only",f"{BASE}..{APP}","--",".github/workflows").decode().strip(): raise ValueError("workflow diff present")
    if manifest["selectedUpdatesVsPinnedPrHead"]!=35 or manifest["readbackMismatches"]!=0 or manifest["nonTargetCatalogValueChanges"]!=0: raise ValueError("manifest count mismatch")
    print(json.dumps({"result":"PASS","applicationCommit":APP,"tree":APP_TREE,"readbackRows":len(readback),"selectedUpdates":len(expected),"changedCatalogs":len(changed_paths),"workflowFilesChanged":0},sort_keys=True))
if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("FAIL:",exc,file=sys.stderr); raise SystemExit(1)
