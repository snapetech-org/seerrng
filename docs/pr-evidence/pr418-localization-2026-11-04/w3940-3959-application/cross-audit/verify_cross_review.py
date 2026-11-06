#!/usr/bin/env python3
"""Portable integrity and exact-head verifier for the W3940-W3959 cross-audit."""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import sys

HEAD = "a0104b4c84a9c4561020ca72062171b22ffc49f2"
TREE = "aaa44c8019c58fde7ae796065e8aae7ac11d7a80"
WINDOW = "W3940-W3959"
BRANCH = "codex/seerrng-localization-overhaul-20261028"


def fail(message: str):
    raise SystemExit("FAIL: " + message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_text(value: str) -> str:
    return sha(value.encode("utf-8"))


def read_json(path: pathlib.Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON {path}: {exc}")


def rows(path: pathlib.Path):
    try:
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    except Exception as exc:
        fail(f"invalid JSONL {path}: {exc}")


def tokens(value: str):
    protected = re.findall(
        r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])",
        value,
    )
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }


def token_checks(source_tokens, target_tokens):
    result = {}
    for field in ("placeholders", "markupTags", "numericTokens"):
        result[field] = {"matches": source_tokens[field] == target_tokens[field], "source": source_tokens[field], "target": target_tokens[field]}
    missing = [value for value in source_tokens["protectedLiterals"] if value not in target_tokens["protectedLiterals"]]
    result["protectedLiterals"] = {
        "matches": not missing,
        "source": source_tokens["protectedLiterals"],
        "target": target_tokens["protectedLiterals"],
        "missingFromTarget": missing,
    }
    return result


def checksum_map(directory: pathlib.Path):
    sums_path = directory / "SHA256SUMS.txt"
    if not sums_path.is_file():
        fail(f"missing checksums {sums_path}")
    result = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        parts = line.split("  ", 1)
        if len(parts) != 2:
            fail(f"malformed checksum row in {sums_path}")
        digest, name = parts
        if name in result or pathlib.PurePosixPath(name).name != name:
            fail(f"duplicate or unsafe checksum path {name}")
        path = directory / name
        if not path.is_file() or sha(path.read_bytes()) != digest:
            fail(f"checksum mismatch {path}")
        result[name] = digest
    actual = {p.name for p in directory.iterdir() if p.is_file() and p.name != "SHA256SUMS.txt"}
    if set(result) != actual:
        fail(f"checksum inventory mismatch in {directory}")
    return result


def live_capture(repo: pathlib.Path):
    remote = subprocess.check_output(
        ["git", "-C", str(repo), "ls-remote", "origin", f"refs/heads/{BRANCH}", "refs/pull/418/head", "refs/heads/main"],
        text=True,
    )
    refs = {line.split()[1]: line.split()[0] for line in remote.splitlines() if line.strip()}
    pr = json.loads(subprocess.check_output(
        ["gh", "api", "repos/snapetech-org/seerrng/pulls/418", "--jq",
         "{head:.head.sha,headRef:.head.ref,base:.base.sha,baseRef:.base.ref,state:.state,draft:.draft,updatedAt:.updated_at}"],
        text=True,
    ))
    main = json.loads(subprocess.check_output(
        ["gh", "api", "repos/snapetech-org/seerrng/branches/main", "--jq",
         "{sha:.commit.sha,tree:.commit.commit.tree.sha}"],
        text=True,
    ))
    return {
        "localHeadSha": subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip(),
        "localHeadTree": subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD^{tree}"], text=True).strip(),
        "sourceWorktreeStatus": subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain=v1"], text=True).strip(),
        "branchRefSha": refs.get(f"refs/heads/{BRANCH}"),
        "pullRefSha": refs.get("refs/pull/418/head"),
        "liveMainSha": refs.get("refs/heads/main"),
        "liveMainTree": main["tree"],
        "prApiHeadSha": pr["head"],
        "prApiHeadRef": pr["headRef"],
        "prApiBaseSha": pr["base"],
        "prApiBaseRef": pr["baseRef"],
        "prState": pr["state"],
        "prDraft": pr["draft"],
        "prUpdatedAt": pr["updatedAt"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-free-input", required=True)
    parser.add_argument("--primary-review", required=True)
    parser.add_argument("--blind-packet", required=True)
    parser.add_argument("--source-worktree", required=True)
    parser.add_argument("--require-live", action="store_true", help="also query live remote/API refs (requires git and gh)")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent
    cf = pathlib.Path(args.candidate_free_input).resolve()
    primary = pathlib.Path(args.primary_review).resolve()
    blind = pathlib.Path(args.blind_packet).resolve()
    repo = pathlib.Path(args.source_worktree).resolve()

    # Validate the sealed output inventory and manifest.
    own_sums = checksum_map(root)
    output_manifest = read_json(root / "manifest.json")
    if (output_manifest.get("head"), output_manifest.get("tree"), output_manifest.get("window")) != (HEAD, TREE, WINDOW):
        fail("output exact-head/tree/window pin")
    manifest_files = {row["path"]: row for row in output_manifest.get("files", [])}
    actual_manifest_files = {name for name in own_sums if name != "manifest.json"}
    if set(manifest_files) != actual_manifest_files:
        fail("output manifest inventory")
    for name, entry in manifest_files.items():
        path = root / name
        if path.stat().st_size != entry.get("bytes") or sha(path.read_bytes()) != entry.get("sha256"):
            fail(f"output manifest hash/size {name}")

    # Validate the three supplied input packets by checksums and their portable verifiers.
    cf_sums = checksum_map(cf)
    primary_sums = checksum_map(primary)
    blind_sums = checksum_map(blind)
    attestation = read_json(root / "input-attestation.json")
    if attestation["candidateFreeInput"]["manifestSha256"] != sha((cf / "manifest.json").read_bytes()):
        fail("candidate-free manifest pin")
    if attestation["candidateFreeInput"]["checksumManifestSha256"] != sha((cf / "SHA256SUMS.txt").read_bytes()):
        fail("candidate-free checksum manifest pin")
    if attestation["primaryReview"]["manifestSha256"] != sha((primary / "manifest.json").read_bytes()):
        fail("primary manifest pin")
    if attestation["primaryReview"]["checksumManifestSha256"] != sha((primary / "SHA256SUMS.txt").read_bytes()):
        fail("primary checksum manifest pin")
    if attestation["blindReview"]["manifestSha256"] != sha((blind / "review_packet.json").read_bytes()):
        fail("blind review packet pin")
    if attestation["blindReview"]["checksumManifestSha256"] != sha((blind / "SHA256SUMS.txt").read_bytes()):
        fail("blind checksum manifest pin")
    if attestation["blindReview"]["authoritativeCurrentChecksumDigest"] != sha((blind / "SHA256SUMS.txt").read_bytes()):
        fail("reconciled blind checksum digest")
    cfman = read_json(cf / "manifest.json")
    pman = read_json(primary / "manifest.json")
    bman = read_json(blind / "review_packet.json")
    if (cfman.get("head"), cfman.get("tree"), cfman.get("window")) != (HEAD, TREE, WINDOW):
        fail("candidate-free exact pin")
    if (pman.get("head"), pman.get("tree"), pman.get("window")) != (HEAD, TREE, WINDOW):
        fail("primary exact pin")
    if (bman.get("head"), bman.get("tree"), bman.get("window")) != (HEAD, TREE, WINDOW):
        fail("blind exact pin")
    subprocess.run([sys.executable, str(cf / "verify-candidate-free.py"), "--source-worktree", str(repo)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, str(primary / "verify-primary.py"), "--candidate-free", str(cf)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, str(blind / "verify_blind_packet.py")], check=True, stdout=subprocess.DEVNULL)

    cells = rows(cf / "current-target-cells.jsonl")
    sources = rows(cf / "selected-source-cells.jsonl")
    contexts = rows(cf / "caller-contexts.jsonl")
    primary_rows = rows(primary / "primary-ledger.jsonl")
    primary_props_rows = rows(primary / "selected-proposals.jsonl")
    blind_rows = rows(blind / "review-cells.jsonl")
    if (len(cells), len(sources), len(contexts), len(primary_rows), len(blind_rows)) != (240, 20, 20, 240, 240):
        fail("input coverage counts")
    cellmap = {(r["position"], r["locale"]): r for r in cells}
    sourcemap = {r["position"]: r for r in sources}
    contextmap = {r["position"]: r for r in contexts}
    pmap = {(r["position"], r["locale"]): r for r in primary_rows}
    ppmap = {(r["position"], r["locale"]): r for r in primary_props_rows}
    bmap = {(r["position"], r["locale"]): r for r in blind_rows}
    bpmap = {k: r for k, r in bmap.items() if r.get("decision") == "propose"}
    candidate_keys = set(ppmap) | set(bpmap)

    cross = rows(root / "cross-ledger.jsonl")
    selected = rows(root / "selected-proposals.jsonl")
    recon = rows(root / "proposal-reconciliation.jsonl")
    noops = rows(root / "no-op-ledger.jsonl")
    holds = rows(root / "unresolved-holds.jsonl")
    resolved = rows(root / "resolved-blind-holds.jsonl")
    if len(cross) != 240 or len(selected) != 48 or len(noops) != 168 or len(holds) != 24 or resolved:
        fail("cross output counts")
    if len(recon) != len(ppmap) + len(bpmap):
        fail("proposal assessment candidate count")
    crossmap = {(r["position"], r["locale"]): r for r in cross}
    selectedmap = {(r["position"], r["locale"]): r for r in selected}
    noopmap = {(r["position"], r["locale"]): r for r in noops}
    holdmap = {(r["position"], r["locale"]): r for r in holds}
    if len(crossmap) != 240 or set(crossmap) != set(cellmap):
        fail("cross cell uniqueness/coverage")
    if set(selectedmap) != candidate_keys:
        fail("selected target keys differ from proposal-bearing cells")
    if set(noopmap) != {k for k, r in crossmap.items() if r["crossDisposition"] == "KEEP"}:
        fail("no-op key set")
    if set(holdmap) != {k for k, r in crossmap.items() if r["crossDisposition"] == "HOLD"}:
        fail("hold key set")

    cross_counts = collections.Counter()
    for key, c in cellmap.items():
        x = crossmap[key]
        p = pmap[key]
        b = bmap[key]
        ctx = contextmap[key[0]]
        for field in ("sourceIdSha256", "sourceTextSha256", "currentTargetSha256", "callerContextSha256"):
            if x.get(field) != c[field]:
                fail(f"cross identity {field} {key}")
        if x.get("primaryDisposition") != p.get("primaryDisposition") or x.get("blindDecision") != b.get("decision"):
            fail(f"source review disposition binding {key}")
        if x.get("primaryProposalSha256") != (sha_text(ppmap[key]["proposedTarget"]) if key in ppmap else None):
            fail(f"primary proposal hash binding {key}")
        if x.get("blindProposalSha256") != (sha_text(bpmap[key]["proposal"]) if key in bpmap else None):
            fail(f"blind proposal hash binding {key}")
        if c["callerContextSha256"] != ctx["callerContextSha256"] or ctx["callerCount"] <= 0:
            fail(f"caller context binding {key}")
        expected_hold = key[0] in {3943, 3957}
        if expected_hold:
            if x["crossDisposition"] != "HOLD" or key in selectedmap:
                fail(f"current hold disposition {key}")
        else:
            if x["crossDisposition"] != ("SELECT_PROPOSAL" if key in candidate_keys else "KEEP"):
                fail(f"cross decision class {key}")
        if x.get("numericEquivalentAccepted") != (key in {(3940, "ja"), (3955, "ja")}):
            fail(f"numeric-equivalent marker {key}")
        cross_counts[x["crossDisposition"]] += 1
    if cross_counts != {"KEEP": 168, "SELECT_PROPOSAL": 48, "HOLD": 24}:
        fail("cross disposition counts")

    # Every selected target must equal one source candidate and carry exact current-value guards.
    pins = read_json(cf / "catalog-file-pins.json")["catalogFiles"]
    for key, selected_row in selectedmap.items():
        c = cellmap[key]
        source = sourcemap[key[0]]
        p = ppmap.get(key)
        b = bpmap.get(key)
        if selected_row.get("currentTargetSha256") != c["currentTargetSha256"]:
            fail(f"selected current target hash {key}")
        if selected_row.get("sourceIdSha256") != c["sourceIdSha256"] or selected_row.get("sourceTextSha256") != c["sourceTextSha256"]:
            fail(f"selected source hash {key}")
        if selected_row.get("callerContextSha256") != c["callerContextSha256"]:
            fail(f"selected caller context hash {key}")
        if selected_row.get("catalogPath") != pins[key[1]]["path"] or selected_row.get("catalogFileSha256") != c["catalogFileSha256"]:
            fail(f"selected catalog pin {key}")
        candidates = {r["proposedTarget"] for r in [p] if r}
        if b:
            candidates.add(b["proposal"])
        target = selected_row.get("proposedTarget")
        if target not in candidates or sha_text(target) != selected_row.get("proposedTargetSha256"):
            fail(f"selected proposal candidate/hash {key}")
        checks = token_checks(source["sourceTokens"], tokens(target))
        if checks != selected_row.get("tokenChecks") or not all(v["matches"] for v in checks.values()):
            fail(f"selected token integrity {key}")

    # Each primary/blind proposal is assessed once, with token integrity and a binding to the selection.
    recon_seen = set()
    for row in recon:
        key = (row["position"], row["locale"])
        origin = row["candidateOrigin"]
        ident = (key, origin)
        if ident in recon_seen or key not in candidate_keys:
            fail(f"duplicate/unknown candidate assessment {ident}")
        recon_seen.add(ident)
        expected_candidate = ppmap[key]["proposedTarget"] if origin == "primary" and key in ppmap else (bpmap[key]["proposal"] if origin == "blind" and key in bpmap else None)
        if expected_candidate is None or row["candidateText"] != expected_candidate or row["candidateSha256"] != sha_text(expected_candidate):
            fail(f"candidate text/hash binding {ident}")
        checks = token_checks(sourcemap[key[0]]["sourceTokens"], tokens(expected_candidate))
        if checks != row.get("tokenChecks") or not all(v["matches"] for v in checks.values()):
            fail(f"candidate token integrity {ident}")
        selected_row = selectedmap[key]
        should_select = expected_candidate == selected_row["proposedTarget"]
        expected_disposition = "SELECTED" if should_select else "NOT_SELECTED_ALTERNATIVE"
        if row.get("reviewDisposition") != expected_disposition or row.get("selectedProposalSha256") != selected_row["proposedTargetSha256"]:
            fail(f"candidate decision binding {ident}")
    expected_assessments = {(k, origin) for k in candidate_keys for origin in ((["primary"] if k in ppmap else []) + (["blind"] if k in bpmap else []))}
    if recon_seen != expected_assessments:
        fail("proposal assessment coverage")

    # Current unresolved holds remain hash-only; historical hash rows are byte-identical.
    hold_allowed = {"window", "position", "locale", "sourceIdSha256", "sourceTextSha256", "currentTargetSha256", "callerContextSha256", "holdCode", "holdReasonSha256", "contextEvidenceSha256", "confidence"}
    if any(set(row) != hold_allowed for row in holds):
        fail("unresolved hold ledger is not hash-only")
    if {r["position"] for r in holds} != {3943, 3957}:
        fail("unresolved hold positions")
    if (root / "historical-hold-hashes.jsonl").read_bytes() != (cf / "prior-hold-hash-reattestation.jsonl").read_bytes():
        fail("prior hold continuity")
    if (root / "historical-applied-target-hashes.jsonl").read_bytes() != (cf / "prior-applied-target-hash-reattestation.jsonl").read_bytes():
        fail("prior applied-target continuity")
    if len(rows(root / "historical-hold-hashes.jsonl")) != 26 or len(rows(root / "historical-applied-target-hashes.jsonl")) != 214:
        fail("historical continuity counts")

    # Apply plan and README/summary/manifest must agree on the sealed result.
    plan = read_json(root / "apply-plan.json")
    if plan.get("applyStatus") != "PREPARED_NOT_APPLIED" or plan.get("noRepositoryWritesPerformed") is not True or plan.get("head") != HEAD or plan.get("tree") != TREE:
        fail("apply plan status/pin")
    updates = plan.get("updates", [])
    if len(updates) != len(selectedmap):
        fail("apply plan update count")
    upmap = {(r["position"], r["locale"]): r for r in updates}
    if len(upmap) != len(updates) or set(upmap) != set(selectedmap):
        fail("apply plan update coverage")
    for key, s in selectedmap.items():
        u = upmap[key]
        if (u.get("catalogPath"), u.get("expectedCurrentTargetSha256"), u.get("proposedTarget"), u.get("proposedTargetSha256"), u.get("callerContextSha256")) != (
            s["catalogPath"], s["currentTargetSha256"], s["proposedTarget"], s["proposedTargetSha256"], s["callerContextSha256"]
        ):
            fail(f"apply guard binding {key}")
    summary = read_json(root / "summary.json")
    if summary.get("crossDispositionCounts") != dict(cross_counts) or summary.get("proposalCandidateCount") != len(recon):
        fail("summary counts")
    if summary.get("nativeSpeakerApproval") is not False or summary.get("browserReview") is not False or summary.get("repositoryEdits") is not False:
        fail("review claim flags")

    # Always verify the pinned local worktree. Live ref/API queries are optional for offline reuse.
    local_head = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    local_tree = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD^{tree}"], text=True).strip()
    status = subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain=v1"], text=True).strip()
    if (local_head, local_tree, status) != (HEAD, TREE, ""):
        fail("local source worktree pin/cleanliness")
    before = read_json(root / "live-review-before.json")
    after = read_json(root / "live-review-after.json")
    stable_fields = (
        "localHeadSha", "localHeadTree", "sourceWorktreeStatus", "branchRefSha", "pullRefSha", "liveMainSha", "liveMainTree",
        "prApiHeadSha", "prApiHeadRef", "prApiBaseSha", "prApiBaseRef", "prState", "prDraft", "prUpdatedAt",
    )
    if any(before.get(k) != after.get(k) for k in stable_fields):
        fail("before/after live attestation drift")
    if any(after.get(k) != HEAD for k in ("localHeadSha", "branchRefSha", "pullRefSha", "prApiHeadSha")) or after.get("localHeadTree") != TREE:
        fail("after attestation exact head/tree")
    if args.require_live:
        live = live_capture(repo)
        if any(live.get(k) != after.get(k) for k in stable_fields):
            fail("current live refs differ from after attestation")

    print(json.dumps({
        "result": "PASS",
        "head": HEAD,
        "tree": TREE,
        "window": WINDOW,
        "cells": len(cross),
        "proposalCandidatesAssessed": len(recon),
        "crossDispositionCounts": dict(cross_counts),
        "selectedProposals": len(selected),
        "noOps": len(noops),
        "currentHashOnlyHolds": len(holds),
        "priorHashOnlyHolds": 26,
        "priorAppliedTargetHashes": 214,
        "candidateFreePrimaryBlindVerifiers": "PASS",
        "sourceWorktree": "CLEAN",
        "liveRefs": "PASS" if args.require_live else "ATTESTED_OFFLINE",
        "outputManifestSha256": sha((root / "manifest.json").read_bytes()),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
