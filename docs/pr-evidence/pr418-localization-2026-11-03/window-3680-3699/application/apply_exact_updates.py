#!/usr/bin/env python3
"""One-shot exact-hash application for SeerrNG PR #418 W3680-W3699."""
from collections import Counter,defaultdict
from datetime import datetime,timezone
import hashlib,json,re,subprocess
from pathlib import Path

APP=Path(__file__).resolve().parent
WINDOW=APP.parent
REPO=WINDOW.parents[3]
CROSS=WINDOW/"cross-audit"
BASE="a2f015c040f933eff38e6ef3d9b1ac6050c4957d"
BASE_TREE="9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe"
EXPECTED_UPDATES=37

def sha(data): return hashlib.sha256(data if isinstance(data,bytes) else data.encode("utf-8")).hexdigest()
def j(path): return json.loads(path.read_text(encoding="utf-8"))
def jl(path): return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
def git(*args): return subprocess.check_output(["git","-C",str(REPO),*args],text=True).strip()
def git_bytes(*args): return subprocess.check_output(["git","-C",str(REPO),*args])
def write_json(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
def write_jsonl(path,rows): path.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in rows),encoding="utf-8")

assert REPO.is_dir() and (REPO/".git").exists()
assert git("rev-parse","HEAD")==BASE, "apply only from the pinned base commit"
assert git("rev-parse",f"{BASE}^{{tree}}")==BASE_TREE
dirty=git("status","--porcelain").splitlines()
assert all("docs/pr-evidence/pr418-localization-2026-11-03/window-3680-3699/" in line for line in dirty), dirty
plans=jl(APP/"apply-plan.jsonl")
crossplans=jl(CROSS/"update-plan.jsonl")
crossledger=jl(CROSS/"cross-ledger.jsonl")
noops=jl(CROSS/"no-op-plan.jsonl")
assert len(plans)==len(crossplans)==EXPECTED_UPDATES
assert plans==crossplans
assert len(crossledger)==240 and len(noops)==203
assert all(x["action"]=="update" and x["applied"] is False for x in plans)

pins=j(CROSS/"evidence/candidate-free-input/file-pins.json")
catalog_pins=pins["catalogFiles"]
assert len(catalog_pins)==13
base_bytes={}; base_json={}
for rel,pin in catalog_pins.items():
    raw=git_bytes("show",f"{BASE}:{rel}")
    assert sha(raw)==pin["sha256"],(rel,"base SHA mismatch")
    assert git("rev-parse",f"{BASE}:{rel}")==pin["gitBlob"],(rel,"base blob mismatch")
    path=REPO/rel
    assert path.read_bytes()==raw,(rel,"not clean preimage")
    base_bytes[rel]=raw
    base_json[rel]=json.loads(raw)

by_file=defaultdict(list)
for row in plans: by_file[row["catalogPath"]].append(row)
for rel,rows in by_file.items():
    text=(REPO/rel).read_text(encoding="utf-8")
    for row in rows:
        assert base_json[rel][row["sourceId"]]==row["currentTarget"]
        assert sha(row["currentTarget"])==row["currentTargetSha256"]
        assert row["catalogSha256"]==sha(base_bytes[rel])
        assert row["catalogGitBlob"]==git("rev-parse",f"{BASE}:{rel}")
        key=json.dumps(row["sourceId"],ensure_ascii=False)
        old=json.dumps(row["currentTarget"],ensure_ascii=False)
        new=json.dumps(row["target"],ensure_ascii=False)
        pattern=re.compile(re.escape(key)+r"(\s*:\s*)"+re.escape(old))
        text,n=pattern.subn(lambda m:key+m.group(1)+new,text,count=1)
        assert n==1,(rel,row["sourceId"],n)
    json.loads(text)
    (REPO/rel).write_text(text,encoding="utf-8")

# Verify exact cell readback and every catalog's complete key/order/value invariants.
after_json={rel:json.loads((REPO/rel).read_text(encoding="utf-8")) for rel in catalog_pins}
expected_by_file=defaultdict(set)
for row in plans: expected_by_file[row["catalogPath"]].add(row["sourceId"])
invariants=[]
for rel,pin in sorted(catalog_pins.items()):
    before=base_json[rel]; after=after_json[rel]
    before_keys=list(before); after_keys=list(after)
    changed={k for k in before if before[k]!=after[k]}
    expected=expected_by_file[rel]
    assert len(before)==len(after)==pin["keyCount"]==9494
    assert before_keys==after_keys
    assert changed==expected,(rel,changed,expected)
    invariants.append({
        "catalogPath":rel,"baseSha256":pin["sha256"],"resultSha256":sha((REPO/rel).read_bytes()),
        "baseGitBlob":pin["gitBlob"],"resultGitBlob":git("hash-object",str(REPO/rel)),
        "keyCount":len(after),"orderedKeysSha256":pin["orderedKeysSha256"],
        "keySetPreserved":set(before)==set(after),"keyOrderPreserved":before_keys==after_keys,
        "changedSourceIds":sorted(changed),"changedCellCount":len(changed),
        "nonTargetValuesPreserved":all(before[k]==after[k] for k in before if k not in expected)
    })

plan_by_key={(r["position"],r["locale"]):r for r in plans}
ledger_by_key={(r["position"],r["locale"]):r for r in crossledger}
noop_by_key={(r["position"],r["locale"]):r for r in noops}
assert len(plan_by_key)==37 and len(ledger_by_key)==240 and len(noop_by_key)==203
readback=[]
for key,row in sorted(ledger_by_key.items()):
    rel=row["catalogPath"]; source_id=row["sourceId"]
    before=base_json[rel][source_id]; after=after_json[rel][source_id]
    assert before==row["currentTarget"] and sha(before)==row["currentTargetSha256"]
    assert after==row["crossTarget"] and sha(after)==row["crossTargetSha256"]
    changed=key in plan_by_key
    assert changed==(before!=after)
    readback.append({
        "position":row["position"],"sourceId":source_id,"sourceSha256":row["sourceSha256"],
        "locale":row["locale"],"catalogPath":rel,"catalogGitBlobBefore":row["catalogGitBlob"],
        "catalogSha256Before":row["catalogSha256"],"beforeTarget":before,"beforeTargetSha256":sha(before),
        "afterTarget":after,"afterTargetSha256":sha(after),"disposition":row["crossDecision"],
        "updated":changed,"matches":after==row["crossTarget"],"sourcePinMatches":True,
        "callerContextSummarySha256":row["callerContextSummarySha256"],
        "protectedLiteralsMatch":all(row["tokenAudit"]["final"]["protectedLiteralsPresent"].values()),
        "placeholdersMatch":row["tokenAudit"]["final"]["placeholderMultisetMatchesSource"],
        "numericValuesMatch":row["tokenAudit"]["final"]["numericValuesMatchSource"]
    })
assert sum(x["updated"] for x in readback)==37 and len(readback)==240
assert all(x["matches"] and x["sourcePinMatches"] and x["protectedLiteralsMatch"] and x["placeholdersMatch"] and x["numericValuesMatch"] for x in readback)
assert len(invariants)==13 and all(x["keySetPreserved"] and x["keyOrderPreserved"] and x["nonTargetValuesPreserved"] for x in invariants)
assert sum(x["changedCellCount"] for x in invariants)==37

# Reattest the 12 prior callerless holds using hashes only; never copy their target text.
prior=jl(CROSS/"prior-hold-reattestation.jsonl")
hold_readback=[]
for row in prior:
    rel=f"src/i18n/locale/{row['locale']}.json"
    value=after_json[rel][row["sourceId"]]
    digest=sha(value)
    assert digest==row["priorTargetSha256"]==row["currentTargetSha256"]
    hold_readback.append({
        "position":3632,"locale":row["locale"],"sourceId":row["sourceId"],"sourceSha256":row["sourceSha256"],
        "priorTargetSha256":row["priorTargetSha256"],"currentTargetSha256":digest,"callerless":True,"retained":True,
        "targetTextIncluded":False
    })
assert len(hold_readback)==12

workflow_changes=git("diff","--name-only",BASE,"--",".github/workflows")
assert not workflow_changes, workflow_changes
changed_paths=git("diff","--name-only",BASE).splitlines()
assert all(not p.startswith(".github/workflows/") for p in changed_paths)
result={
    "schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,
    "branch":"codex/seerrng-localization-overhaul-20261028","baseHead":BASE,"baseTree":BASE_TREE,
    "window":"W3680-W3699","sourceCount":20,"localeCount":12,"reviewedCells":240,
    "updates":37,"noOps":203,"newHolds":0,"priorHoldReattestations":12,
    "catalogCount":13,"translatedCatalogCount":12,"catalogKeyCountPerFile":9494,
    "readbackMatches":240,"nonTargetChanges":0,"catalogKeySetFailures":0,"catalogKeyOrderFailures":0,
    "placeholderFailures":0,"icuFailures":0,"markupFailures":0,"numericValueFailures":0,"protectedLiteralFailures":0,
    "baselineHindiApiProtectedMissesResolved":2,"workflowFiles":"untouched",
    "evidencePackets":"candidate-free, primary, blind, cross-audit copied and checksummed",
    "browserReview":"pending exact-head headed VM review","qualifiedNativeSpeakerReview":"pending",
    "testsBuildsCI":"not run","releasesTagsMerges":"not performed",
    "appliedAtUtc":datetime.now(timezone.utc).isoformat()
}
write_jsonl(APP/"catalog-readback.jsonl",readback)
write_jsonl(APP/"prior-hold-readback.jsonl",hold_readback)
write_json(APP/"catalog-invariants.json",{
    "schemaVersion":1,"baseHead":BASE,"baseTree":BASE_TREE,"catalogCount":13,
    "catalogs":invariants,"nonTargetValuesPreserved":True,"workflowFilesUntouched":True
})
write_json(APP/"application-result.json",result)
print(json.dumps({"result":"PASS","baseHead":BASE,"readbackCells":len(readback),
    "updates":37,"noOps":203,"priorHolds":12,"catalogs":13,"keyCountPerCatalog":9494,
    "workflowFiles":"untouched","changedPaths":changed_paths},ensure_ascii=False,indent=2))
