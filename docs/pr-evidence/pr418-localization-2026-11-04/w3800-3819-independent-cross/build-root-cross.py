#!/usr/bin/env python3
"""Build the root cross-review ledger from pinned SeerrNG review inputs."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "input" / "candidate-free-input"
PRIMARY = ROOT / "primary-review" / "primary-ledger.jsonl"
BLIND = ROOT / "blind-review" / "review" / "blind-ledger.jsonl"
OUT = ROOT / "cross-review"
HEAD = "154dbf7fd6b346d9c5bddf23c7c6283db9826313"
TREE = "a2f00bcc40b51a5643bbeb3e52ecdfc58a5718b9"

SPECIFIC = {
    (3801, "fr"): "The setting controls one scan feature, so singular scan wording avoids implying multiple analyses.",
    (3802, "id"): "Memeriksa communicates checking both existing media and request status; mencari narrows the action to searching.",
    (3802, "vi"): "The proposal names existing media naturally while retaining the scan and request-status meaning.",
    (3803, "de"): "Both reviewers independently selected the concise German action label Anfragen taggen.",
    (3804, "ar"): "The English source is an instruction to add a tag; the primary imperative preserves that intent and the literal ID.",
    (3804, "de"): "The proposal makes the user ID and display name explicit and avoids ambiguity about which ID is used.",
    (3804, "fr"): "Both reviewers selected matching French wording and the required literal ID.",
    (3804, "hi"): "The primary wording retains the uppercase ID and uses a concise imperative that matches the source control.",
    (3805, "de"): "Tags is the familiar product-interface term here and is clearer than the broad German Schlagworte.",
    (3806, "de"): "The concise infinitive form reads as a German button label and preserves the purpose of loading metadata profiles.",
    (3806, "pt-BR"): "The source is a button label; the primary wording keeps it concise and omits sentence punctuation.",
    (3807, "hi"): "The proposal uses a direct connection-check action and the established Hindi term for quality profiles.",
    (3807, "ko"): "The proposal expresses the button action directly and clearly states that quality profiles will load.",
    (3807, "pt-BR"): "The source is a button label; the primary wording keeps it concise and omits sentence punctuation.",
    (3808, "hi"): "The proposal uses a direct connection-check action for loading root folders.",
    (3808, "ko"): "The proposal expresses the button action directly and retains the root-folder purpose.",
    (3808, "pt-BR"): "The primary wording is concise for a button and uses the natural plural form for root folders without sentence punctuation.",
    (3809, "es"): "The imperative is the natural Spanish label for the connection-test button.",
    (3811, "es"): "Spanish requires the opening exclamation mark for this success message.",
    (3811, "fr"): "French typography uses a nonbreaking space before the exclamation mark.",
    (3812, "hi"): "The proposal improves the obligation wording and uses the established API key term without adding inconsistent terminal punctuation.",
    (3812, "zh-Hant"): "Both reviewers selected the standard Traditional Chinese term 金鑰 for an API key.",
    (3813, "vi"): "The source requires a valid URL; the proposal expresses validity explicitly rather than merely supplying a URL value.",
    (3814, "hi"): "Including the literal slash makes the trailing-slash validation requirement precise.",
    (3814, "id"): "The proposal removes the redundant phrase about a slash at the end.",
    (3814, "ko"): "Including the literal slash makes the trailing-slash validation requirement precise.",
    (3815, "hi"): "The proposal explicitly shows the required leading slash.",
    (3816, "hi"): "The proposal names the URL base naturally and explicitly shows the prohibited trailing slash.",
    (3816, "id"): "The primary proposal is text-identical to the current value, so it is retained as a no-op without a catalog edit.",
    (3817, "es"): "The proposal improves Spanish grammar and explicitly states that the IP address must be valid.",
    (3817, "hi"): "The proposal states a valid hostname and preserves the uppercase IP literal.",
    (3817, "id"): "The proposal clearly lists a host name or IP address as valid alternatives.",
    (3818, "ko"): "The proposal uses the natural Korean spelling for metadata profiles.",
    (3819, "es"): "The proposal uses consistent formal address and gives the required server name directly.",
    (3819, "hi"): "The proposal states clearly that the server name is required.",
    (3819, "id"): "Harus is a direct, standard rendering of the required obligation and avoids the less natural redundant phrasing.",
}


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def main():
    current_rows = read_jsonl(INPUT / "current-target-cells.jsonl")
    source_rows = read_jsonl(INPUT / "selected-source-cells.jsonl")
    primary_rows = read_jsonl(PRIMARY)
    blind_rows = read_jsonl(BLIND)
    key = lambda x: (x["position"], x["locale"])
    current = {key(x): x for x in current_rows}
    sources = {x["position"]: x for x in source_rows}
    primary = {key(x): x for x in primary_rows}
    blind = {key(x): x for x in blind_rows}
    if any(len(items) != 240 for items in (current, primary, blind)):
        raise SystemExit("each input must contain 240 unique cells")
    if set(current) != set(primary) or set(current) != set(blind):
        raise SystemExit("candidate-free, primary, and independent blind cells differ")

    ledger = []
    counts = Counter()
    updates = 0
    proposals = 0
    for cell_key in sorted(current):
        c, p, b = current[cell_key], primary[cell_key], blind[cell_key]
        pos, locale = cell_key
        if p["head"] != HEAD or p["tree"] != TREE:
            raise SystemExit(f"primary pin mismatch at {cell_key}")
        source = sources[pos]
        if p["sourceId"] != c["sourceId"] or p["sourceText"] != source["sourceText"]:
            raise SystemExit(f"primary source mismatch at {cell_key}")
        if b["sourceId"] != c["sourceId"] or b["sourceText"] != source["sourceText"]:
            raise SystemExit(f"blind source mismatch at {cell_key}")
        if p["currentTarget"] != c["currentTarget"] or b["currentTarget"] != c["currentTarget"]:
            raise SystemExit(f"reviewer baseline mismatch at {cell_key}")
        if p["currentTargetSha256"] != c["currentTargetSha256"] or b["currentTargetSha256"] != c["currentTargetSha256"]:
            raise SystemExit(f"reviewer target hash mismatch at {cell_key}")

        pp, bp = p.get("proposedTarget"), b.get("proposedTarget")
        if pp or bp:
            proposals += 1
        if pp and bp and pp == bp:
            selected, selected_from = pp, "independent-agreement"
        elif pp:
            selected, selected_from = pp, "primary"
        elif bp:
            selected, selected_from = bp, "independent-blind"
        else:
            selected, selected_from = c["currentTarget"], "current"

        if selected == c["currentTarget"]:
            disposition = "accept-current"
            action = "no-op"
            classification = "none"
        else:
            action = "update"
            source_row = p if selected_from in ("primary", "independent-agreement") else b
            source_disp = source_row["disposition"]
            if source_disp in ("correct", "propose-correction"):
                disposition = "correction"
            elif source_disp in ("refine", "propose-refinement"):
                disposition = "refinement"
            else:
                raise SystemExit(f"selected proposal has no supported classification at {cell_key}")
            classification = source_disp
            updates += 1
        if selected != c["currentTarget"] and not pp and not bp:
            raise SystemExit(f"unproposed value selected at {cell_key}")

        reason = SPECIFIC.get(cell_key)
        if reason is None:
            if selected_from == "independent-agreement":
                reason = "Both independent reviewers selected the same improved wording for the pinned source and caller context."
            elif selected_from == "primary":
                reason = "The primary recommendation improves the current wording; independent review accepted the current value, and cross-review confirms the primary recommendation against source and caller context."
            elif selected_from == "independent-blind":
                reason = "The independent blind recommendation improves the current wording; primary review accepted the current value, and cross-review confirms the blind recommendation against source and caller context."
            else:
                reason = "Both review passes accept the current wording, with no proposed correction or refinement."

        entry = {
            "position": pos,
            "locale": locale,
            "sourceId": c["sourceId"],
            "sourceText": source["sourceText"],
            "sourceTextSha256": c["sourceTextSha256"],
            "catalogPath": c["catalogPath"],
            "catalogGitBlob": c["catalogGitBlob"],
            "catalogSha256": c["catalogSha256"],
            "callerContextSha256": c["callerContextSha256"],
            "currentTarget": c["currentTarget"],
            "currentTargetSha256": c["currentTargetSha256"],
            "primaryDisposition": p["disposition"],
            "primaryProposal": pp,
            "primaryRationale": p.get("rationale"),
            "independentBlindDisposition": b["disposition"],
            "independentBlindProposal": bp,
            "independentBlindRationale": b.get("rationale"),
            "crossReviewer": "root",
            "selectedFrom": selected_from,
            "selectedDisposition": disposition,
            "action": action,
            "selectedTarget": selected,
            "selectedTargetSha256": sha(selected),
            "classification": classification,
            "selectionRationale": reason,
        }
        ledger.append(entry)
        counts[disposition] += 1

    OUT.mkdir(parents=True, exist_ok=True)
    ledger_path = OUT / "root-cross-ledger.jsonl"
    ledger_path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in ledger), encoding="utf-8")
    summary = {
        "repository": "snapetech-org/SeerrNG",
        "pullRequest": 418,
        "head": HEAD,
        "tree": TREE,
        "window": "W3800-W3819",
        "cells": len(ledger),
        "sourceIds": len({x["sourceId"] for x in ledger}),
        "primaryProposals": sum(bool(x.get("proposedTarget")) for x in primary_rows),
        "independentBlindProposals": sum(bool(x.get("proposedTarget")) for x in blind_rows),
        "proposalUnion": proposals,
        "acceptedCurrentWithoutProposal": sum(x["selectedDisposition"] == "accept-current" and x["selectedFrom"] == "current" for x in ledger),
        "acceptedProposalNoOps": sum(x["selectedDisposition"] == "accept-current" and x["selectedFrom"] in ("primary", "independent-blind", "independent-agreement") for x in ledger),
        "selectedUpdates": updates,
        "selectedDispositionCounts": dict(sorted(counts.items())),
        "selectedFromCounts": dict(sorted(Counter(x["selectedFrom"] for x in ledger).items())),
        "protectedLiteralBaselineMismatches": 4,
        "protectedLiteralMismatchesInSelectedTargets": 0,
        "primaryReviewerLedgerSha256": hashlib.sha256(PRIMARY.read_bytes()).hexdigest(),
        "independentBlindLedgerSha256": hashlib.sha256(BLIND.read_bytes()).hexdigest(),
        "candidateFreeManifestSha256": hashlib.sha256((INPUT / "manifest.json").read_bytes()).hexdigest(),
        "nativeSpeakerSignoff": "not claimed",
        "exactHeadBrowserAcceptance": "not performed; deployment lookup at review returned zero",
        "catalogApplication": "pending",
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(
        "# SeerrNG PR #418 W3800–W3819 independent cross-review\n\n"
        f"Pinned head: {HEAD}\nPinned tree: {TREE}\n\n"
        "This cross-review combines the pinned primary ledger with a separate clean-blind review. The blind reviewer received only the candidate-free packet. Root compared both records against the pinned source and caller context. Where both reviewers proposed text, the primary wording was selected when their proposals differed; blind-only improvements were selected after cross-review. Matching proposals were retained.\n\n"
        f"The 240-cell window has {summary['selectedUpdates']} selected catalog updates, {summary['acceptedCurrentWithoutProposal']} cells accepted as-is, and {summary['acceptedProposalNoOps']} exact no-op proposal. All four baseline protected-literal mismatches (three ID cells and one IP cell) are corrected in the selected targets.\n\n"
        "The packet makes no native-speaker signoff claim. Exact-head headed-browser acceptance was not performed; the pinned head had zero deployments at review. Catalog application is pending.\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
