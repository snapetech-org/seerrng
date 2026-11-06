#!/usr/bin/env python3
"""Verify the W3960-W3979 primary semantic review packet."""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent

def fail(message):
    raise SystemExit("FAIL: " + message)

def need(condition, message):
    if not condition:
        fail(message)

def sha(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def verify_checksums(directory):
    sums_path = directory / "SHA256SUMS.txt"
    entries = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        need(name not in entries, "duplicate checksum path")
        p = directory / name
        need(p.is_file() and sha(p.read_bytes()) == digest, "checksum " + name)
        entries[name] = digest
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file() and p != sums_path}
    need(set(entries) == actual, "checksum inventory")
    return len(entries)

def token_fields(text):
    protected = re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])", text)
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", text),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", text),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", text),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate-free", required=True, help="sealed candidate-free input directory")
    ap.add_argument("--source-worktree", help="clean source worktree at the pinned head")
    args = ap.parse_args()
    cf = pathlib.Path(args.candidate_free).resolve()
    root_count = verify_checksums(ROOT)
    input_count = verify_checksums(cf)
    manifest = j(ROOT / "manifest.json")
    cf_manifest = j(cf / "manifest.json")
    need(manifest["status"] == "SEALED" and manifest["reviewCompleted"] is True, "primary manifest state")
    need(manifest["reviewMode"] == "primary semantic review only", "review mode")
    need(manifest["blindPacketInspected"] is False and manifest["blindPacketGenerated"] is False and manifest["crossReviewPerformed"] is False,
         "primary-only independence record")
    need(cf_manifest["window"] == "W3960-W3979" and cf_manifest["candidateFreeInputOnly"] is True and
         cf_manifest["proposalCount"] == 0 and cf_manifest["dispositionFieldsIncluded"] is False, "candidate-free input type")
    need(manifest["candidateFreeManifestSha256"] == sha((cf / "manifest.json").read_bytes()), "candidate-free manifest binding")
    need(manifest["candidateFreeChecksumManifestSha256"] == sha((cf / "SHA256SUMS.txt").read_bytes()), "candidate-free checksum binding")
    need((manifest["head"], manifest["tree"], manifest["head"]) ==
         (cf_manifest["head"], cf_manifest["tree"], "a456dd66aad34cb23f432cb3c189bb8083bbbe96"), "exact source pin")
    need((cf_manifest["head"], cf_manifest["tree"]) ==
         ("a456dd66aad34cb23f432cb3c189bb8083bbbe96", "7a5447e5f08e84c392899a6e1400d1df73b1143b"), "candidate-free pin")
    worktree_candidate = pathlib.Path(args.source_worktree).resolve() if args.source_worktree else pathlib.Path(manifest["sourceWorktree"]).resolve()
    worktree_status = "NOT_CHECKED"
    if args.source_worktree or worktree_candidate.exists():
        worktree = worktree_candidate
        top = subprocess.check_output(["git", "-C", str(worktree), "rev-parse", "--show-toplevel"], text=True).strip()
        head = subprocess.check_output(["git", "-C", str(worktree), "rev-parse", "HEAD"], text=True).strip()
        tree = subprocess.check_output(["git", "-C", str(worktree), "rev-parse", "HEAD^{tree}"], text=True).strip()
        status = subprocess.check_output(["git", "-C", str(worktree), "status", "--porcelain=v1"], text=True).strip()
        need(top == str(worktree) and head == manifest["head"] and tree == manifest["tree"] and not status, "source worktree pin/cleanliness")
        worktree_status = "CLEAN"

    locales = cf_manifest["localeOrder"]
    sources = {r["position"]: r for r in jl(cf / "selected-source-cells.jsonl")}
    cells = {(r["position"], r["locale"]): r for r in jl(cf / "current-target-cells.jsonl")}
    ledger = jl(ROOT / "primary-ledger.jsonl")
    proposals = jl(ROOT / "selected-proposals.jsonl")
    holds = jl(ROOT / "hash-only-holds.jsonl")
    need(len(sources) == 20 and set(sources) == set(range(3960,3980)), "source range coverage")
    expected_keys = {(p,l) for p in range(3960,3980) for l in locales}
    ledger_map = {(r["position"],r["locale"]):r for r in ledger}
    need(len(ledger) == 240 and len(ledger_map) == 240 and set(ledger_map) == expected_keys, "primary cell coverage/uniqueness")
    proposal_map = {(r["position"],r["locale"]):r for r in proposals}
    hold_map = {(r["position"],r["locale"]):r for r in holds}
    need(len(proposals) == 8 and len(proposal_map) == 8 and len(holds) == 12 and len(hold_map) == 12, "proposal/hold count")
    need(set(proposal_map) == {k for k,r in ledger_map.items() if r["primaryDisposition"] in ("CORRECTION","REFINEMENT")}, "proposal ledger set")
    need(set(hold_map) == {k for k,r in ledger_map.items() if r["primaryDisposition"] == "HOLD"}, "hold ledger set")
    dispositions = collections.Counter(r["primaryDisposition"] for r in ledger)
    need(dict(dispositions) == {"ACCEPT_CURRENT":220,"CORRECTION":6,"REFINEMENT":2,"HOLD":12}, "primary disposition counts")
    allowed_hold_fields = {"position","locale","sourceIdSha256","sourceTextSha256","currentTargetSha256","callerContextSha256",
                           "primaryDisposition","holdCode","holdReasonSha256","confidence","hashOnly","relatedPriorWindow"}
    for key, row in ledger_map.items():
        src = sources[key[0]]
        cell = cells[key]
        need((row["sourceIdSha256"],row["sourceTextSha256"],row["currentTargetSha256"],row["callerContextSha256"]) ==
             (src["sourceIdSha256"],src["sourceTextSha256"],cell["currentTargetSha256"],cell["callerContextSha256"]), "candidate cell hash binding " + str(key))
        if row["primaryDisposition"] == "HOLD":
            need(set(row) == allowed_hold_fields and row["hashOnly"] is True, "held cell is not hash-only " + str(key))
            need((row["position"] == 3979) and row["locale"] in locales and row["relatedPriorWindow"] == "W3940-W3959", "held cell identity " + str(key))
            need(row["holdCode"] == "TERMINOLOGY_CONTEXT_UNRESOLVED" and len(row["holdReasonSha256"]) == 64, "hold code/hash " + str(key))
            need(not any(name in row for name in ("sourceId","sourceText","currentTarget","proposedTarget","rationale","reason")), "hold text leak " + str(key))
            need((row["sourceTextSha256"] == src["sourceTextSha256"] and src["sourceText"] == "Enable Agent"), "held source binding " + str(key))
            if key in proposal_map:
                fail("hold is also proposed")
            continue
        need(row.get("sourceId") == src["sourceId"] and row.get("sourceText") == src["sourceText"] and row.get("currentTarget") == cell["currentTarget"],
             "non-hold exact text binding " + str(key))
        need(row.get("currentTokenChecks") == cell["tokenChecks"], "current token-check binding " + str(key))
        disposition = row["primaryDisposition"]
        numeric_equivalents = {(3962,"ja"),(3970,"ja"),(3972,"ja")}
        if disposition == "ACCEPT_CURRENT":
            need("proposedTarget" not in row and "proposedTargetSha256" not in row and key not in proposal_map, "accept-current includes proposal")
            if any(not item["matches"] for item in cell["tokenChecks"].values()):
                need(key in numeric_equivalents and row.get("numericTokenAssessment",{}).get("meaningPreserved") is True, "unresolved accepted token mismatch " + str(key))
            elif key in numeric_equivalents:
                fail("numeric equivalent missing from ledger " + str(key))
        else:
            proposal = proposal_map[key]
            need(proposal == row, "proposal differs from primary ledger " + str(key))
            target = row["proposedTarget"]
            need(sha(target) == row["proposedTargetSha256"], "proposed target hash " + str(key))
            src_tokens = token_fields(src["sourceText"])
            tgt_tokens = token_fields(target)
            for field in ("placeholders","markupTags","numericTokens","protectedLiterals"):
                need(src_tokens[field] == tgt_tokens[field], f"proposal {field} mismatch {key}")
            need(row.get("proposalTokenChecks") == {field: src_tokens[field] == tgt_tokens[field] for field in ("placeholders","markupTags","numericTokens","protectedLiterals")}, "proposal token-check flags " + str(key))
            need(row["confidence"] in ("high","moderate","low") and row.get("rationale"), "proposal rationale/confidence " + str(key))
    for key, row in hold_map.items():
        need(row == ledger_map[key] and row["primaryDisposition"] == "HOLD", "hash-only hold ledger binding " + str(key))
    summary = j(ROOT / "primary-summary.json")
    need(summary["cells"] == 240 and summary["sourceIds"] == 20 and summary["callerReferences"] == cf_manifest["callerReferenceCount"], "summary coverage")
    need(summary["dispositionCounts"] == dict(dispositions) and summary["proposalCount"] == 8 and summary["currentHashOnlyHolds"] == 12,
         "summary counts")
    need(summary["blindPacketInspected"] is False and summary["blindPacketGenerated"] is False and summary["crossReviewPerformed"] is False,
         "summary primary-only record")
    need(manifest["primarySummarySha256"] == sha((ROOT / "primary-summary.json").read_bytes()), "summary hash")
    need(manifest["primaryLedgerSha256"] == sha((ROOT / "primary-ledger.jsonl").read_bytes()), "ledger hash")
    need(manifest["selectedProposalsSha256"] == sha((ROOT / "selected-proposals.jsonl").read_bytes()), "proposals hash")
    need(manifest["hashOnlyHoldsSha256"] == sha((ROOT / "hash-only-holds.jsonl").read_bytes()), "holds hash")
    need(manifest["primaryDispositionCounts"] == dict(dispositions), "manifest disposition counts")
    print(json.dumps({"result":"PASS","window":"W3960-W3979","head":head,"tree":tree,"cells":len(ledger),
                      "dispositions":dict(dispositions),"proposals":len(proposals),"hashOnlyHolds":len(holds),
                      "callerReferences":cf_manifest["callerReferenceCount"],"priorSelected":3960,"priorAppliedTargetHashes":262,"priorHolds":50,
                      "candidateFreeFiles":input_count,"primaryFiles":root_count,"sourceWorktree":worktree_status},sort_keys=True))

if __name__ == "__main__":
    main()
