#!/usr/bin/env python3
import hashlib, json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CF = ROOT / "inputs/candidate-free-input"
PR = ROOT / "inputs/primary-review"
BL = ROOT / "inputs/blind-review"

def sha(b):
    return hashlib.sha256(b).hexdigest()

def shat(s):
    return sha(s.encode("utf-8"))

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def req(condition, message):
    if not condition:
        raise SystemExit("FAIL: " + message)

def verify_sums(folder):
    sums_file = folder / "SHA256SUMS.txt"
    req(sums_file.is_file(), "missing checksums " + str(folder))
    sums = {}
    for line in sums_file.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        sums[name.lstrip("* ")] = digest
    actual = {
        p.relative_to(folder).as_posix()
        for p in folder.rglob("*")
        if p.is_file() and p != sums_file
    }
    req(set(sums) == actual, "checksum inventory " + str(folder))
    for name, digest in sums.items():
        req(sha((folder / name).read_bytes()) == digest, "checksum " + str(folder / name))

# Validate all three sealed input packet byte inventories.
for folder in (CF, PR, BL):
    verify_sums(folder)
verify_sums(ROOT)

manifest = j(CF / "manifest.json")
primary_manifest = j(PR / "manifest.json")
blind_summary = j(BL / "blind-review-summary.json")
req(manifest["repository"] == "snapetech-org/SeerrNG" and manifest["pullRequest"] == 418, "candidate-free identity")
req(manifest["head"] == "12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e" and manifest["tree"] == "b288494aa5a0842affc4e900d6ccb6b57d99c493", "pinned head/tree")
req(manifest["range"] == [3860, 3879] and manifest["cellCount"] == 240 and manifest["candidateFreeInputOnly"] and manifest["proposalCount"] == 0, "candidate-free window/type")
req(primary_manifest["head"] == manifest["head"] and primary_manifest["tree"] == manifest["tree"] and primary_manifest["window"] == "W3860-W3879", "primary pin")
req(primary_manifest["candidateFreeInputSha256"] == sha((CF / "SHA256SUMS.txt").read_bytes()), "primary input linkage")
req(blind_summary["head"] == manifest["head"] and blind_summary["tree"] == manifest["tree"] and blind_summary["range"] == [3860, 3879], "blind pin")
req(blind_summary["candidateFreeManifestSha256"] == sha((CF / "manifest.json").read_bytes()), "blind manifest linkage")
req(blind_summary["candidateFreeSha256SumsSha256"] == sha((CF / "SHA256SUMS.txt").read_bytes()), "blind checksum linkage")
results = j(ROOT / "input-verifier-results.json")
req(results["candidateFree"]["result"] == results["primary"]["result"] == results["blind"]["result"] == "PASS", "input verifiers")
req(all(v == "PASS" for v in results["checksums"].values()), "input checksums")
req(results["candidateFree"]["catalogPinsVerifiedAgainstExactHeadWorktree"] is True, "exact-head catalog verification")
req(results["temporaryVerifierWorktree"]["removedAfterCatalogByteVerification"] is True, "temporary worktree cleanup")

sources = {x["position"]: x for x in jl(CF / "selected-source-cells.jsonl")}
cells = {(x["position"], x["locale"]): x for x in jl(CF / "current-target-cells.jsonl")}
primary_rows = {(x["position"], x["locale"]): x for x in jl(PR / "primary-ledger.jsonl")}
blind_rows = {(x["position"], x["locale"]): x for x in jl(BL / "blind-review-cells.jsonl")}
primary_props = {(x["position"], x["locale"]): x for x in jl(PR / "proposals.jsonl")}
blind_props = {(x["position"], x["locale"]): x for x in jl(BL / "blind-review-proposals.jsonl")}
ledger = jl(ROOT / "cross-ledger.jsonl")
reconciliation = jl(ROOT / "proposal-reconciliation.jsonl")
disagreements = jl(ROOT / "proposal-disagreements.jsonl")
holds = jl(ROOT / "holds.jsonl")
req(len(sources) == 20 and len(cells) == len(primary_rows) == len(blind_rows) == len(ledger) == 240, "cell coverage")
req(len(primary_props) == 16 and len(blind_props) == 35 and len(reconciliation) == 36, "proposal coverage")
req([(x["position"], x["locale"]) for x in ledger] == list(cells), "ledger order")
req(len({(x["position"], x["locale"]) for x in ledger}) == 240, "ledger duplicate keys")
req(not holds, "unexpected hash-only holds")

def expected_primary_proposal(p):
    return {
        "disposition": p["disposition"],
        "target": p["proposedTarget"],
        "targetSha256": p["proposedTargetSha256"],
        "rationale": p["rationale"],
        "confidence": p["confidence"],
    }

def expected_blind_proposal(p):
    return {
        "disposition": "revise-current",
        "target": p["recommendedTarget"],
        "targetSha256": p["recommendedTargetSha256"],
        "rationale": p["rationale"],
        "confidence": p["reviewConfidence"],
        "sourceRewriteSuggested": p.get("sourceRewriteSuggested"),
    }

keep = changed = 0
src_counts = Counter()
decision_by_key = {}
for row in ledger:
    key = (row["position"], row["locale"])
    c = cells[key]
    s = sources[row["position"]]
    p = primary_rows[key]
    b = blind_rows[key]
    pp = primary_props.get(key)
    bp = blind_props.get(key)
    req(row["sourceId"] == s["sourceId"] == c["sourceId"] == p["sourceId"] == b["sourceId"], "source ID linkage " + str(key))
    req(row["sourceText"] == s["sourceText"] == p["sourceText"] == b["sourceText"], "source text linkage " + str(key))
    req(row["sourceIdSha256"] == s["sourceIdSha256"] and row["sourceTextSha256"] == s["sourceTextSha256"], "source hashes " + str(key))
    req(row["currentTarget"] == c["currentTarget"] == p["currentTarget"] == b["currentTarget"], "current target linkage " + str(key))
    req(row["currentTargetSha256"] == c["currentTargetSha256"] == p["currentTargetSha256"] == b["currentTargetSha256"] == shat(row["currentTarget"]), "current target hash " + str(key))
    req(row["callerContextSha256"] == c["callerContextSha256"] == p["callerContextSha256"] == b["callerContextSha256"], "caller context linkage " + str(key))
    req(row["primaryDisposition"] == p["disposition"] and row["blindDisposition"] == b["reviewDisposition"], "review disposition linkage " + str(key))
    req(row["primaryProposal"] == (expected_primary_proposal(pp) if pp else None), "primary proposal exact linkage " + str(key))
    req(row["blindProposal"] == (expected_blind_proposal(bp) if bp else None), "blind proposal exact linkage " + str(key))
    req(row["selectedTargetSha256"] == shat(row["selectedTarget"]), "selected target hash " + str(key))
    req(row["hold"] is None, "hold field " + str(key))
    if row["decision"] == "keep-current":
        keep += 1
        req(pp is None and bp is None, "unreviewed current cell " + str(key))
        req(p["disposition"] == "accept-current" and b["reviewDisposition"] == "accept-current", "current decision mismatch " + str(key))
        req(row["selectedTarget"] == row["currentTarget"] and row["selectedProposalSources"] == [], "current target changed " + str(key))
    else:
        changed += 1
        candidates = {}
        if pp:
            candidates["primary"] = pp["proposedTarget"]
        if bp:
            candidates["blind"] = bp["recommendedTarget"]
        matched = [name for name, target in candidates.items() if target == row["selectedTarget"]]
        req(matched == row["selectedProposalSources"] and matched, "selected proposal linkage " + str(key))
        req(row["selectedTarget"] != row["currentTarget"], "redundant proposal selection " + str(key))
        src_counts["+".join(matched)] += 1
    decision_by_key[key] = row

expected_union = set(primary_props) | set(blind_props)
recon_keys = {(x["position"], x["locale"]) for x in reconciliation}
req(recon_keys == expected_union and len(recon_keys) == 36, "proposal reconciliation keys")
diff_keys = set()
for row in reconciliation:
    key = (row["position"], row["locale"])
    ledger_row = decision_by_key[key]
    pp = primary_props.get(key)
    bp = blind_props.get(key)
    req(row["selectedTarget"] == ledger_row["selectedTarget"] and row["selectedTargetSha256"] == ledger_row["selectedTargetSha256"], "reconciliation selected target " + str(key))
    req(row["primaryProposal"] == (expected_primary_proposal(pp) if pp else None), "reconciliation primary exact " + str(key))
    req(row["blindProposal"] == (expected_blind_proposal(bp) if bp else None), "reconciliation blind exact " + str(key))
    status = "same-target" if pp and bp and pp["proposedTargetSha256"] == bp["recommendedTargetSha256"] else "different-targets" if pp and bp else "primary-only" if pp else "blind-only"
    req(row["status"] == status, "proposal reconciliation status " + str(key))
    if status == "different-targets":
        diff_keys.add(key)
req({(x["position"], x["locale"]) for x in disagreements} == diff_keys and len(diff_keys) == 8, "disagreement coverage")
for row in disagreements:
    key = (row["position"], row["locale"])
    req(row["status"] == "different-targets", "disagreement status " + str(key))
    req(row["selectedTarget"] == decision_by_key[key]["selectedTarget"], "disagreement resolution " + str(key))

summary = j(ROOT / "summary.json")
req(summary["cells"] == 240 and summary["keepCurrent"] == keep == 204 and summary["selectedReviewedTargets"] == changed == 36, "decision counts")
req(summary["newHashOnlyHolds"] == 0 and summary["priorHashOnlyHoldsPreserved"] == 14, "hold lineage")
req(summary["proposalUnion"] == 36 and summary["sameTargetProposalAgreements"] == 7 and summary["differentTargetProposalDisagreements"] == 8, "proposal comparison counts")
req(summary["primaryOnlyProposals"] == 1 and summary["blindOnlyProposals"] == 20, "one-sided proposal counts")
req(summary["selectedProposalSources"] == dict(src_counts), "selected proposal source counts")
req(summary["nativeSpeakerApproval"] is False and summary["browserReview"] is False and summary["applicationPerformed"] is False, "review limitations")
req(summary.get("livePRAfter") == "PASS", "live PR reattestation")
for name in ("live-pr-before.json", "live-pr-after.json"):
    snap = j(ROOT / name)
    pr = snap["pullRequest"]
    req(pr["number"] == 418 and pr["state"] == "open" and pr["draft"] is True, "live PR state " + name)
    req(pr["headSha"] == manifest["head"] and pr["baseSha"] == manifest["baseSha"], "live PR SHAs " + name)
    req(pr["headRef"] == "codex/seerrng-localization-overhaul-20261028" and pr["baseRef"] == "main", "live PR refs " + name)
    req(pr["headRepository"] == "snapetech-org/seerrng", "live PR head repo " + name)
    req(snap["commitTree"] == manifest["tree"] and snap["branchRefSha"] == manifest["head"] and snap["pullRefSha"] == manifest["head"], "live PR refs/tree " + name)
    req(snap["deploymentCountAtExpectedHead"] == 0, "live deployment count " + name)
print(json.dumps({
    "result": "PASS",
    "head": manifest["head"],
    "tree": manifest["tree"],
    "window": manifest["range"],
    "cells": len(ledger),
    "keepCurrent": keep,
    "selectedReviewedTargets": changed,
    "proposalUnion": len(reconciliation),
    "sameTargetAgreements": 7,
    "differentTargetDisagreements": 8,
    "hashOnlyHolds": 0,
    "priorHashOnlyHoldsPreserved": 14,
    "livePRBeforeAndAfter": "PASS",
    "inputChecksumsAndLinkage": "PASS",
}, ensure_ascii=False, indent=2))
