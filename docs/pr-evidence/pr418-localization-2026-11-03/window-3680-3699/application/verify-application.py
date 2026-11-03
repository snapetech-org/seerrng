#!/usr/bin/env python3
"""Portable verifier for W3680-W3699 catalog application and evidence."""
from collections import defaultdict
import hashlib,json,re,subprocess,sys
from pathlib import Path

APP=Path(__file__).resolve().parent
WINDOW=APP.parent
REPO=WINDOW.parents[3]
CROSS=WINDOW/"cross-audit"
BASE="a2f015c040f933eff38e6ef3d9b1ac6050c4957d"
BASE_TREE="9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe"
def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode("utf-8")).hexdigest()
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def git(*args): return subprocess.check_output(["git","-C",str(REPO),*args],text=True).strip()
def git_bytes(*args): return subprocess.check_output(["git","-C",str(REPO),*args])
def check_sums(folder,checksum_name="SHA256SUMS.txt"):
    sums=folder/checksum_name; listed={}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        d,n=line.split(None,1); listed[n.strip().lstrip("*")]=d
    actual={p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file() and p.relative_to(folder).as_posix()!=checksum_name}
    assert set(listed)==actual,(folder,set(listed)-actual,actual-set(listed))
    for name,digest in listed.items(): assert sha((folder/name).read_bytes())==digest,(folder,name)
    return len(listed)

assert REPO.is_dir()
assert git("rev-parse",f"{BASE}^{{tree}}")==BASE_TREE
head=git("rev-parse","HEAD")
if head!=BASE:
    assert git("rev-parse","HEAD^")==BASE, "expected one application commit directly on the audited head"
status_lines=git("status","--porcelain").splitlines()

# Verify the sealed audit packet and its copied source/caller/catalog evidence first.
cross=subprocess.run([sys.executable,str(CROSS/"verify-cross-audit.py")],capture_output=True,text=True)
assert cross.returncode==0,cross.stdout+cross.stderr
app_hash_count=check_sums(APP)
window_hash_count=check_sums(WINDOW)

plans=jl(APP/"apply-plan.jsonl"); crossplans=jl(CROSS/"update-plan.jsonl")
noops=jl(CROSS/"no-op-plan.jsonl"); ledger=jl(CROSS/"cross-ledger.jsonl")
readback=jl(APP/"catalog-readback.jsonl"); holds=jl(APP/"prior-hold-readback.jsonl")
inv=j(APP/"catalog-invariants.json"); result=j(APP/"application-result.json")
assert plans==crossplans and len(plans)==37 and len(noops)==203 and len(ledger)==len(readback)==240
assert result["baseHead"]==BASE and result["baseTree"]==BASE_TREE
assert result["updates"]==37 and result["noOps"]==203 and result["reviewedCells"]==240 and result["readbackMatches"]==240
assert result["priorHoldReattestations"]==12 and result["catalogCount"]==13 and result["catalogKeyCountPerFile"]==9494
assert result["workflowFiles"]=="untouched" and not result["testsBuildsCI"].startswith("run")
pins=j(CROSS/"evidence/candidate-free-input/file-pins.json")["catalogFiles"]
assert len(pins)==13
base_catalogs={}; result_catalogs={}
expected_by_file=defaultdict(set)
for plan in plans: expected_by_file[plan["catalogPath"]].add(plan["sourceId"])
for rel,pin in pins.items():
    raw=git_bytes("show",f"{BASE}:{rel}")
    assert sha(raw)==pin["sha256"] and git("rev-parse",f"{BASE}:{rel}")==pin["gitBlob"]
    before=json.loads(raw); after=json.loads((REPO/rel).read_text(encoding="utf-8"))
    assert list(before)==list(after) and len(before)==len(after)==pin["keyCount"]==9494
    changed={k for k in before if before[k]!=after[k]}
    assert changed==expected_by_file[rel],(rel,changed,expected_by_file[rel])
    assert all(before[k]==after[k] for k in before if k not in expected_by_file[rel])
    base_catalogs[rel]=before; result_catalogs[rel]=after
observed_inv={x["catalogPath"]:x for x in inv["catalogs"]}
assert set(observed_inv)==set(pins)
for rel,pin in pins.items():
    x=observed_inv[rel]
    assert x["baseSha256"]==pin["sha256"] and x["baseGitBlob"]==pin["gitBlob"]
    assert x["resultSha256"]==sha((REPO/rel).read_bytes())
    assert x["resultGitBlob"]==git("hash-object",str(REPO/rel))
    assert x["keyCount"]==9494 and x["keySetPreserved"] and x["keyOrderPreserved"] and x["nonTargetValuesPreserved"]

plan_by_key={(x["position"],x["locale"]):x for x in plans}
ledger_by_key={(x["position"],x["locale"]):x for x in ledger}
read_by_key={(x["position"],x["locale"]):x for x in readback}
noop_by_key={(x["position"],x["locale"]):x for x in noops}
assert set(ledger_by_key)==set(read_by_key)
assert set(plan_by_key).isdisjoint(noop_by_key) and set(plan_by_key)|set(noop_by_key)==set(ledger_by_key)
for key,row in ledger_by_key.items():
    rel=row["catalogPath"]; sid=row["sourceId"]
    before=base_catalogs[rel][sid]; after=result_catalogs[rel][sid]; read=read_by_key[key]
    assert before==row["currentTarget"] and sha(before)==row["currentTargetSha256"]
    assert after==row["crossTarget"] and sha(after)==row["crossTargetSha256"]
    assert read["beforeTarget"]==before and read["afterTarget"]==after and read["matches"] is True
    assert read["updated"]==(key in plan_by_key)
    assert read["sourceSha256"]==row["sourceSha256"] and read["callerContextSummarySha256"]==row["callerContextSummarySha256"]
    assert read["protectedLiteralsMatch"] and read["placeholdersMatch"] and read["numericValuesMatch"]
    p=plan_by_key.get(key) or noop_by_key[key]
    assert p["target"]==after and p["targetSha256"]==sha(after)
assert sum(1 for r in readback if r["updated"])==37
assert sum(1 for x in observed_inv.values() for _ in x["changedSourceIds"])==37

cross_holds=jl(CROSS/"prior-hold-reattestation.jsonl")
assert len(holds)==len(cross_holds)==12
for h,x in zip(holds,cross_holds):
    assert h["position"]==x["position"]==3632 and h["locale"]==x["locale"]
    assert h["sourceId"]==x["sourceId"]=="components.Settings.BookshelfPathMigration.author"
    assert h["sourceSha256"]==x["sourceSha256"] and h["currentTargetSha256"]==x["currentTargetSha256"]==h["priorTargetSha256"]==x["priorTargetSha256"]
    rel=f"src/i18n/locale/{h['locale']}.json"
    value=result_catalogs[rel][h["sourceId"]]
    assert sha(value)==h["currentTargetSha256"] and h["targetTextIncluded"] is False and h["retained"] is True

# The committed change set contains only the 9 reviewed catalog files and this evidence packet.
changed=git("diff-tree","--no-commit-id","--name-only","-r",f"{BASE}..HEAD").splitlines() if head!=BASE else git("diff","--name-only",BASE).splitlines()
assert changed
assert not any(x.startswith(".github/workflows/") for x in changed)
allowed={x["catalogPath"] for x in plans}
evidence_prefix="docs/pr-evidence/pr418-localization-2026-11-03/window-3680-3699/"
assert all(x in allowed or x.startswith(evidence_prefix) for x in changed),changed
if head==BASE:
    for line in status_lines:
        path=line[2:].strip().rstrip("/")
        assert path in allowed or path==evidence_prefix.rstrip("/") or path.startswith(evidence_prefix),line
else:
    assert not status_lines, status_lines

print(json.dumps({"result":"PASS","head":head,"tree":git("rev-parse","HEAD^{tree}"),"reviewedCells":240,"updates":37,"noOps":203,
    "priorHolds":12,"catalogs":13,"keyCountPerCatalog":9494,"readbackMismatches":0,"nonTargetChanges":0,
    "workflowChanges":0,"crossAudit":cross.stdout.strip(),"applicationChecksummedFiles":app_hash_count,
    "windowChecksummedFiles":window_hash_count},ensure_ascii=False,indent=2))
