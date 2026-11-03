#!/usr/bin/env python3
import hashlib,json,re,subprocess
from pathlib import Path
O=Path(__file__).resolve().parent
I=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-primary-20261103/candidate-free-input")
P=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-primary-20261103/primary-review")
B=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-blind-20261103/review")
def sha(b): return hashlib.sha256(b).hexdigest()
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def PH(s): return re.findall(r"\{[^{}\r\n]+\}",s)
def MK(s): return re.findall(r"</?[A-Za-z][^<>]*?/?>",s)
def NUM(s): return re.findall(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)",s)
def required(x,msg):
    if not x: raise SystemExit("FAIL: "+msg)
subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=O,check=True,stdout=subprocess.DEVNULL)
required((O/"SHA256SUMS.sha256").read_text().split()[0]==sha((O/"SHA256SUMS.txt").read_bytes()),"checksum-list attestation")
for d,n in ((I,"SHA256SUMS.txt"),(P,"SHA256SUMS.txt"),(B,"SHA256SUMS.txt")):
    subprocess.run(["sha256sum","-c",n],cwd=d,check=True,stdout=subprocess.DEVNULL)
manifest=json.loads((O/"manifest.json").read_text()); summary=json.loads((O/"summary.json").read_text())
prov=json.loads((O/"provenance.json").read_text())
im=json.loads((I/"manifest.json").read_text())
for item in manifest["files"]:
    raw=(O/item["path"]).read_bytes()
    required(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"manifest file "+item["path"])
required(manifest["head"]=="351f2c09a4aaf6f223975fc1827cb9f77de7702d","head")
required(manifest["tree"]=="3d88008f6ea7dc6cbef21333d29a032469cd60cf","tree")
required(prov["candidateFreeManifestJsonSha256"]==sha((I/"manifest.json").read_bytes()),"candidate-free manifest SHA")
required(prov["candidateFreeChecksumListSha256"]==sha((I/"SHA256SUMS.txt").read_bytes()),"candidate-free checksum-list SHA")
required(prov["primaryChecksumListSha256"]==sha((P/"SHA256SUMS.txt").read_bytes()),"primary checksum-list SHA")
required(prov["blindChecksumListSha256"]==sha((B/"SHA256SUMS.txt").read_bytes()),"blind checksum-list SHA")
cells={(r["position"],r["locale"]):r for r in jl(I/"current-target-cells.jsonl")}
sources={r["position"]:r for r in jl(I/"source-cells.jsonl")}
contexts={r["position"]:r for r in jl(I/"caller-contexts.jsonl")}
cross={(r["position"],r["locale"]):r for r in jl(O/"cross-audit-ledger.jsonl")}
primary={(r["position"],r["locale"]):r for r in jl(P/"primary-ledger.jsonl")}
blind={(r["position"],r["locale"]):r for r in jl(B/"blind-ledger.jsonl")}
independent={(r["position"],r["locale"]):r for r in jl(O/"independent-review-ledger.jsonl")}
plans={(r["position"],r["locale"]):r for r in jl(O/"application-plan-proposal.jsonl")}
disagreements={(r["position"],r["locale"]):r for r in jl(O/"disagreements.jsonl")}
required(len(cells)==len(cross)==len(primary)==len(blind)==len(independent)==240,"240-cell coverage")
required(set(cells)==set(cross)==set(primary)==set(blind)==set(independent),"complete cell-key coverage")
primary_changes={k for k,r in primary.items() if r["disposition"] in ("correction","refinement")}
blind_changes={k for k,r in blind.items() if r["disposition"]=="propose"}
cross_changes={k for k,r in cross.items() if r["crossAuditDisposition"]=="select-change"}
required(len(primary_changes)==32 and len(blind_changes)==5 and len(primary_changes&blind_changes)==5,"review change counts")
required(len(plans)==32 and set(plans)==cross_changes==primary_changes,"plan/cross-audit change set")
required(set(disagreements)==primary_changes-blind_changes and len(disagreements)==27,"disagreement set")
required(len(primary_changes&blind_changes)==5 and all(primary[k]["finalTarget"]==blind[k]["target"] for k in blind_changes),"proposal agreement")
for key,c in cells.items():
    x=cross[key]; p=primary[key]; b=blind[key]; a=independent[key]; s=sources[key[0]]; ctx=contexts[key[0]]
    required(x["sourceId"]==c["sourceId"]==p["sourceId"]==b["sourceId"]==s["sourceId"],"source ID "+str(key))
    required(x["source"]==c["source"]==p["source"]==b["sourceText"]==s["source"],"source text "+str(key))
    required(x["sourceSha256"]==c["sourceSha256"]==p["sourceSha256"]==s["sourceSha256"],"source SHA "+str(key))
    required(x["currentTarget"]==c["currentTarget"]==p["currentTarget"]==b["currentTarget"],"current target "+str(key))
    required(x["currentTargetSha256"]==c["currentTargetSha256"]==p["currentTargetSha256"]==sha(c["currentTarget"].encode()),"current target SHA "+str(key))
    required(x["catalogPath"]==c["catalogPath"]==p["catalogPath"] and x["catalogSha256"]==c["catalogSha256"]==p["catalogSha256"] and x["catalogGitBlob"]==c["catalogGitBlob"]==p["catalogGitBlob"],"catalog pins "+str(key))
    required(x["callerCount"]==ctx["callerCount"]>0 and x["callerContextBlockIds"]==ctx["contextBlockIds"],"caller context "+str(key))
    target=x["crossAuditTarget"]
    required(x["crossAuditTargetSha256"]==sha(target.encode()),"cross target SHA "+str(key))
    required(PH(target)==s["sourcePlaceholders"] and MK(target)==s["sourceMarkupTokens"] and NUM(target)==s["sourceNumericTokens"],"placeholder/markup/numeric "+str(key))
    required(all(t in target for t in s["sourceProtectedLiterals"]),"protected literals "+str(key))
    required(x["placeholderSequenceMatches"] and x["markupSequenceMatches"] and x["numericSequenceMatches"] and x["protectedLiteralsPreserved"],"token checks "+str(key))
    if key in primary_changes:
        required(target==p["finalTarget"] and x["crossAuditDisposition"]=="select-change","selected primary target "+str(key))
        required(plans[key]["proposedTarget"]==target and plans[key]["currentTargetSha256"]==c["currentTargetSha256"],"application proposal row "+str(key))
    else:
        required(target==c["currentTarget"] and x["crossAuditDisposition"]=="accept-current","retained current target "+str(key))
    if key in blind_changes:
        required(b["target"]==p["finalTarget"],"blind/primary exact target "+str(key))
    if key in disagreements:
        d=disagreements[key]
        required(d["primaryTarget"]==p["finalTarget"] and d["blindTarget"]==c["currentTarget"] and d["unresolved"] is False,"disagreement resolution "+str(key))
required(summary["crossAuditDispositionCounts"]=={"select-change":32,"accept-current":208,"hold":0},"summary totals")
required(summary["proposedChangeCount"]==32 and summary["holds"]==0 and summary["unresolvedDisagreements"]==0,"summary holds/disagreements")
required(summary["placeholderMismatches"]==summary["markupMismatches"]==summary["numericTokenMismatches"]==summary["protectedLiteralMismatches"]==0,"summary token mismatches")
required(summary["applicationAuthorizationCreated"] is False and prov["applicationAuthorizationCreated"] is False,"no authorization")
required(im["head"]==manifest["head"] and im["tree"]==manifest["tree"],"input head/tree lineage")
print(json.dumps({"status":"PASS","head":manifest["head"],"tree":manifest["tree"],
 "cells":len(cross),"crossAuditChanges":len(plans),"disagreements":len(disagreements),
 "blindPrimaryConsensus":len(primary_changes&blind_changes),"holds":0,
 "candidateFreeManifestJsonSha256":prov["candidateFreeManifestJsonSha256"],
 "candidateFreeChecksumListSha256":prov["candidateFreeChecksumListSha256"],
 "crossAuditChecksumListSha256":sha((O/"SHA256SUMS.txt").read_bytes()),
 "crossAuditChecksumListAttestationSha256":sha((O/"SHA256SUMS.sha256").read_bytes())},indent=2))
