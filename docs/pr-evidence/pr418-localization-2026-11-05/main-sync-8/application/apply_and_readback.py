#!/usr/bin/env python3
"""Apply and verify SeerrNG main-sync translations for eight source strings."""
from __future__ import annotations
import collections, copy, hashlib, json, subprocess, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
WINDOW=HERE.parent
REPO=HERE.parents[4]
HEAD="ca2309e960733a7486c55b9a761d82771be97cde"
TREE="8c5df06aaf1d703ff923bf1fdf8a21c901b9d26d"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
CATDIR="src/i18n/locale"
PLAN=HERE/"exact-hash-apply-plan.jsonl"
ROOT=WINDOW/"root-review"/"root-adjudication.jsonl"
CANDIDATE=WINDOW/"candidate-free"/"candidate-free.jsonl"
READBACK=HERE/"exact-target-readback.jsonl"
SUMMARY=HERE/"application-summary.json"
CATALOG_SUMMARY=HERE/"catalog-file-readback.json"
PRODUCT_PIN=HERE/"product-commit.json"

def sha(v): return hashlib.sha256(v.encode("utf-8") if isinstance(v,str) else v).hexdigest()
def read_jsonl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def git(*args): return subprocess.check_output(["git","-C",str(REPO),*args])
def target_line_index(lines,key):
    prefix=f'  {json.dumps(key,ensure_ascii=False)}: '
    hits=[i for i,line in enumerate(lines) if line.startswith(prefix)]
    if len(hits)>1: raise SystemExit("duplicate top-level JSON key: "+key)
    return hits[0] if hits else None

def insert_missing_values(original_text, additions, english_order):
    lines=original_text.splitlines(keepends=True)
    doc=json.loads(original_text)
    original_order=list(doc)
    if len(original_order)!=len(set(original_order)): raise SystemExit("duplicate target keys")
    positions={key:i for i,key in enumerate(english_order)}
    for key,value in sorted(additions.items(),key=lambda x:positions[x[0]]):
        if key in doc: raise SystemExit("target already exists: "+key)
        at=positions[key]
        later=[k for k in english_order[at+1:] if k in doc]
        if not later: raise SystemExit("no source-ordered insertion anchor for "+key)
        anchor=later[0]
        idx=target_line_index(lines,anchor)
        if idx is None: raise SystemExit("insertion anchor line missing: "+anchor)
        new_line=f'  {json.dumps(key,ensure_ascii=False)}: {json.dumps(value,ensure_ascii=False)},\n'
        lines.insert(idx,new_line)
        doc[key]=value
    updated="".join(lines)
    parsed=json.loads(updated)
    old_order_after=[k for k in parsed if k not in additions]
    if old_order_after!=original_order: raise SystemExit("existing key order changed")
    for key in original_order:
        if parsed[key]!=doc[key] and key not in additions: raise SystemExit("non-target value changed")
    return updated,parsed,original_order

def main():
    mode="verify" if "--verify-after" in sys.argv else "apply" if "--apply" in sys.argv else "preflight"
    current_head=git("rev-parse","HEAD").decode().strip(); current_tree=git("rev-parse","HEAD^{tree}").decode().strip()
    if mode!="verify" and (current_head,current_tree)!=(HEAD,TREE): raise SystemExit("input HEAD/tree mismatch")
    for args in [("diff","--quiet"),("diff","--cached","--quiet")]:
        if mode!="verify" and subprocess.run(["git","-C",str(REPO),*args]).returncode!=0: raise SystemExit("tracked worktree/index changes exist before apply")
    rows=read_jsonl(PLAN);root=read_jsonl(ROOT);candidate=read_jsonl(CANDIDATE)
    if len(rows)!=96 or len(root)!=96 or len(candidate)!=8: raise SystemExit("source/locale plan coverage mismatch")
    rowmap={(r["sourceId"],r["locale"]):r for r in rows}; rootmap={(r["sourceId"],r["locale"]):r for r in root}
    if len(rowmap)!=96 or set(rowmap)!=set(rootmap): raise SystemExit("duplicate or mismatched root cells")
    english_path=f"{CATDIR}/en.json"; english_raw=git("show",f"{HEAD}:{english_path}"); english=json.loads(english_raw); english_order=list(english)
    ids=list(dict.fromkeys(r["sourceId"] for r in rows))
    if len(ids)!=8 or len(english)!=9545: raise SystemExit("unexpected source ID/catalog count")
    if set(ids)!={r["id"] for r in candidate}: raise SystemExit("candidate-free source set mismatch")
    for r in rows:
        if r["sourceId"] not in english or sha(english[r["sourceId"]])!=r["sourceSha256"]: raise SystemExit("English source hash mismatch: "+r["sourceId"])
        if r["targetSha256"]!=sha(r["target"]): raise SystemExit("root target hash mismatch")
        if r["locale"] not in LOCALES: raise SystemExit("unexpected locale")
    prepared={}
    for locale in LOCALES:
        rel=f"{CATDIR}/{locale}.json"; base_raw=git("show",f"{HEAD}:{rel}"); path=REPO/rel; current_raw=path.read_bytes()
        if mode!="verify" and sha(current_raw)!=sha(base_raw): raise SystemExit("target catalog differs from pinned input: "+locale)
        before=json.loads(base_raw); additions={r["sourceId"]:r["target"] for r in rows if r["locale"]==locale}
        if len(additions)!=8 or set(additions)&set(before): raise SystemExit("expected eight missing targets in "+locale)
        if len(before)!=9537: raise SystemExit("unexpected base catalog size in "+locale)
        updated,parsed,old_order=insert_missing_values(base_raw.decode("utf-8"),additions,english_order)
        expected=copy.deepcopy(before); expected.update(additions)
        if parsed!=expected or set(parsed)!=set(english): raise SystemExit("preflight parity/content failure in "+locale)
        if [k for k in parsed if k not in additions]!=old_order: raise SystemExit("preflight key-order failure in "+locale)
        if any(not isinstance(v,str) or not v.strip() for v in parsed.values()): raise SystemExit("preflight empty or non-string value in "+locale)
        prepared[locale]={"path":path,"relative":rel,"base":base_raw,"current":current_raw,"updated":updated,"before":before,"expected":expected,"additions":additions}
    if mode=="preflight":
        preflight={"result":"PASS","inputHead":HEAD,"inputTree":TREE,"sourceIds":8,"locales":12,"targetCells":96,"allTargetKeysAbsent":True,"targetCatalogsParse":True,"sourceOrderedInsertionAnchorsFound":True,"existingOrderPreserved":True,"postInsertKeySetEqualsEnglish":True,"files":[{"path":v["relative"],"keysBefore":len(v["before"]),"keysAfter":len(v["expected"]),"baseSha256":sha(v["base"])} for v in prepared.values()]}
        (HERE/"preflight.json").write_text(json.dumps(preflight,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(json.dumps(preflight,ensure_ascii=False,indent=2)); return
    if mode=="apply":
        temps=[]
        try:
            for locale,v in prepared.items():
                tmp=v["path"].with_suffix(v["path"].suffix+".main-sync-8.tmp")
                tmp.write_text(v["updated"],encoding="utf-8"); json.loads(tmp.read_text(encoding="utf-8")); temps.append((tmp,v["path"]))
            for tmp,path in temps: tmp.replace(path)
        finally:
            for tmp,_ in temps:
                if tmp.exists(): tmp.unlink()
    readback=[];files=[]
    for locale,v in prepared.items():
        raw=v["path"].read_bytes(); current=json.loads(raw)
        if current!=v["expected"]: raise SystemExit("catalog content mismatch after apply: "+locale)
        if [k for k in current if k not in v["additions"]]!=list(v["before"]): raise SystemExit("existing key order changed: "+locale)
        if set(current)!=set(english): raise SystemExit("catalog key set differs from English: "+locale)
        files.append({"path":v["relative"],"keysBefore":len(v["before"]),"keysAfter":len(current),"sha256Before":sha(v["base"]),"sha256After":sha(raw),"keySetMatchesEnglish":True,"existingOrderPreserved":True})
        for key,value in v["additions"].items():
            r=rowmap[(key,locale)]
            if current[key]!=value or sha(current[key])!=r["targetSha256"]: raise SystemExit("exact target readback failure")
            readback.append({"sourceId":key,"locale":locale,"path":v["relative"],"sourceSha256":r["sourceSha256"],"target":value,"targetSha256":sha(value),"callerContextSha256":r["callerContextSha256"],"rootDisposition":r["rootDisposition"],"selectedFrom":r["selectedFrom"]})
    if len(readback)!=96: raise SystemExit("final target readback count mismatch")
    READBACK.write_text("".join(json.dumps(r,ensure_ascii=False,sort_keys=True)+"\n" for r in sorted(readback,key=lambda x:(x["sourceId"],x["locale"]))),encoding="utf-8")
    CATALOG_SUMMARY.write_text(json.dumps({"inputHead":HEAD,"inputTree":TREE,"catalogs":files},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    previous_summary=json.loads(SUMMARY.read_text(encoding="utf-8")) if SUMMARY.exists() else {}
    summary={"result":"PASS","inputHead":HEAD,"inputTree":TREE,"sourceIds":8,"localeCount":12,"targetCells":96,"changedCatalogFiles":12,"keysBeforePerCatalog":9537,"keysAfterPerCatalog":9545,"englishKeyCount":len(english),"keySetsMatchEnglish":True,"existingKeyOrderPreserved":True,"onlyMissingTargetsInserted":True,"targetReadbackCells":len(readback),"catalogFiles":files,"nativeSpeakerApproval":False,"mode":mode}
    if PRODUCT_PIN.exists():
        product=json.loads(PRODUCT_PIN.read_text(encoding="utf-8")); commit=product["productCommit"]
        actual_tree=git("rev-parse",f"{commit}^{{tree}}").decode().strip()
        if actual_tree!=product["productTree"]: raise SystemExit("product commit tree pin mismatch")
        if subprocess.run(["git","-C",str(REPO),"merge-base","--is-ancestor",commit,"HEAD"]).returncode!=0: raise SystemExit("product commit is not an ancestor of current HEAD")
        expected={(x["path"],x["sha256After"]) for x in product["catalogFiles"]}
        actual={(x["path"],sha((REPO/x["path"]).read_bytes())) for x in files}
        if expected!=actual: raise SystemExit("product catalog pins do not match verified files")
        summary.update({"productCommit":commit,"productTree":actual_tree,"verificationHead":previous_summary.get("verificationHead",current_head)})
    SUMMARY.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
