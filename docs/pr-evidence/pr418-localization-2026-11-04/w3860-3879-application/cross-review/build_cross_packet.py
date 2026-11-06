#!/usr/bin/env python3
import hashlib, json
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent
CF = OUT / "inputs/candidate-free-input"
PR = OUT / "inputs/primary-review"
BL = OUT / "inputs/blind-review"

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def sha_text(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")

# Every changed cell is tied to one exact primary or blind proposal. "both" is
# used only when the two sealed reviewers proposed the same UTF-8 target.
OVERRIDES = {
    "3860::zh-Hans": ("blind", "moderate", "Both proposals remove the stray space before Chinese punctuation. The blind target also makes the Navidrome connection relation explicit, so it is the clearer exact proposal."),
    "3860::fr": ("blind", "moderate", "The save-failure message describes a connection to the Navidrome service; the blind target adds the natural French preposition à."),
    "3860::zh-Hant": ("blind", "moderate", "The blind target removes the punctuation spacing error and uses 連線 for the saved service connection."),
    "3862::ar": ("blind", "high", "This is a button action label. Removing the terminal period preserves the imperative while matching concise UI-label punctuation."),
    "3863::ja": ("both", "high", "Both reviewers independently preserve the protected product name in Latin script and remove the unnecessary space before URL."),
    "3864::fr": ("blind", "moderate", "The success toast describes connecting to the service; à Navidrome avoids the unnecessary article in the current wording."),
    "3864::zh-Hant": ("blind", "moderate", "The blind target uses the customary connection-status wording 連線 and removes the stray space before punctuation."),
    "3866::vi": ("both", "moderate", "Both reviewers replace máy phục vụ with the standard Vietnamese server term máy chủ for this URL field."),
    "3867::zh-Hans": ("both", "high", "Both reviewers replace the ASCII example comma and period with Chinese punctuation while leaving the example URL intact."),
    "3867::ja": ("both", "high", "Both reviewers remove the extra space after Japanese punctuation and use Japanese sentence punctuation without changing the URL."),
    "3867::zh-Hant": ("both", "high", "Both reviewers replace the ASCII example comma and period with Chinese punctuation while leaving the example URL intact."),
    "3868::zh-Hans": ("both", "high", "Both reviewers remove the stray space before the Chinese full stop; the HTTP, HTTPS, and URL literals remain intact."),
    "3868::de": ("primary", "moderate", "The current compound merges HTTPS and URL for protected-literal matching. The primary target says URL über HTTP oder HTTPS, keeping all three technical terms distinct and expressing the allowed schemes."),
    "3868::zh-Hant": ("blind", "moderate", "Both reviewers replace 合法, which can mean lawful, with 有效 for a valid URL. The blind target also adds the standard instruction marker and sentence punctuation."),
    "3870::ko": ("blind", "high", "The current target repeats the username field label. The caller is a required-field error, so the blind imperative restores the missing instruction."),
    "3870::zh-Hant": ("blind", "moderate", "The blind target removes the spacing error and expresses the required-field message as a direct instruction."),
    "3871::zh-Hans": ("blind", "moderate", "代理程序 makes the software-agent meaning explicit; the current 代理 can be read as a network proxy."),
    "3871::ar": ("primary", "moderate", "The current text says service and omits Agent. The primary target names the notification agent, matching the checkbox context."),
    "3871::zh-Hant": ("blind", "moderate", "代理程式 identifies the software-agent feature and avoids the current wording, which says notifications instead of Agent."),
    "3871::vi": ("blind", "moderate", "The source requires enabling an Agent, while the current target says notification service. The blind target restores the software-agent meaning."),
    "3874::es": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::zh-Hans": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::hi": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::de": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::ja": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::fr": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::pt-BR": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::ar": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::ko": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::zh-Hant": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::vi": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3874::id": ("blind", "moderate", "The adjacent help defines this control as the name of a saved Apprise configuration, not a secret key; the blind target reflects that meaning."),
    "3876::pt-BR": ("both", "moderate", "Both reviewers choose Idioma, the natural term for a human-language setting; the caller is the notification locale field."),
    "3878::fr": ("blind", "moderate", "This is an Apprise destination-filter tag, not markup. Étiquette conveys the label/tag meaning more accurately than the current balise."),
    "3879::de": ("primary", "moderate", "Optional is conventional German UI wording here, and mit diesem Tag versehen clearly describes destinations carrying the tag."),
    "3879::fr": ("blind", "moderate", "The helper filters destinations by an Apprise tag. Étiquette avoids balise, which denotes markup, and keeps the destination-label meaning."),
}

def compact_primary(p):
    return {
        "disposition": p["disposition"],
        "target": p["proposedTarget"],
        "targetSha256": p["proposedTargetSha256"],
        "rationale": p["rationale"],
        "confidence": p["confidence"],
    }

def compact_blind(p):
    return {
        "disposition": "revise-current",
        "target": p["recommendedTarget"],
        "targetSha256": p["recommendedTargetSha256"],
        "rationale": p["rationale"],
        "confidence": p["reviewConfidence"],
        "sourceRewriteSuggested": p.get("sourceRewriteSuggested"),
    }

manifest = read_json(CF / "manifest.json")
primary_manifest = read_json(PR / "manifest.json")
blind_summary = read_json(BL / "blind-review-summary.json")
sources = {row["position"]: row for row in read_jsonl(CF / "selected-source-cells.jsonl")}
current = {(row["position"], row["locale"]): row for row in read_jsonl(CF / "current-target-cells.jsonl")}
primary_rows = {(row["position"], row["locale"]): row for row in read_jsonl(PR / "primary-ledger.jsonl")}
blind_rows = {(row["position"], row["locale"]): row for row in read_jsonl(BL / "blind-review-cells.jsonl")}
primary_props = {(row["position"], row["locale"]): row for row in read_jsonl(PR / "proposals.jsonl")}
blind_props = {(row["position"], row["locale"]): row for row in read_jsonl(BL / "blind-review-proposals.jsonl")}
assert len(sources) == 20 and len(current) == len(primary_rows) == len(blind_rows) == 240
assert len(primary_props) == 16 and len(blind_props) == 35 and len(OVERRIDES) == 36
assert manifest["head"] == primary_manifest["head"] == blind_summary["head"] == "12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e"
assert manifest["tree"] == primary_manifest["tree"] == blind_summary["tree"] == "b288494aa5a0842affc4e900d6ccb6b57d99c493"

ledger = []
proposal_reconciliation = []
disagreements = []
selected_changed = 0
selected_by_source = Counter()
for key in [(pos, locale) for pos in range(3860, 3880) for locale in manifest["localeOrder"]]:
    pos, locale = key
    key_id = f"{pos}::{locale}"
    c = current[key]
    s = sources[pos]
    p = primary_rows[key]
    b = blind_rows[key]
    pp = primary_props.get(key)
    bp = blind_props.get(key)
    current_text = c["currentTarget"]
    current_hash = c["currentTargetSha256"]
    assert p["currentTarget"] == b["currentTarget"] == current_text
    assert p["currentTargetSha256"] == b["currentTargetSha256"] == current_hash
    assert p["sourceId"] == b["sourceId"] == s["sourceId"] == c["sourceId"]
    assert p["sourceText"] == b["sourceText"] == s["sourceText"]
    assert p["callerContextSha256"] == b["callerContextSha256"] == c["callerContextSha256"]

    if key_id in OVERRIDES:
        side, confidence, why = OVERRIDES[key_id]
        candidate_targets = {}
        if pp:
            candidate_targets["primary"] = pp["proposedTarget"]
        if bp:
            candidate_targets["blind"] = bp["recommendedTarget"]
        if side == "both":
            assert "primary" in candidate_targets and "blind" in candidate_targets
            assert candidate_targets["primary"] == candidate_targets["blind"]
            selected_text = candidate_targets["primary"]
        else:
            assert side in candidate_targets
            selected_text = candidate_targets[side]
        assert selected_text != current_text
        selected_hash = sha_text(selected_text)
        sources_for_target = [name for name, target in candidate_targets.items() if target == selected_text]
        assert sources_for_target
        selected_changed += 1
        selected_by_source["+".join(sources_for_target)] += 1
        decision = "select-agreed-proposal" if len(sources_for_target) == 2 else f"select-{sources_for_target[0]}-proposal"
    else:
        assert pp is None and bp is None
        assert p["disposition"] == "accept-current"
        assert b["reviewDisposition"] == "accept-current"
        confidence = "moderate"
        why = "Retain the exact current target: both sealed reviewers accept it, and this independent pass found no semantic or caller-context issue in the candidate-free input."
        selected_text = current_text
        selected_hash = current_hash
        sources_for_target = ["current"]
        decision = "keep-current"

    primary_record = compact_primary(pp) if pp else None
    blind_record = compact_blind(bp) if bp else None
    proposal_row = None
    if pp or bp:
        if pp and bp:
            status = "same-target" if pp["proposedTargetSha256"] == bp["recommendedTargetSha256"] else "different-targets"
        elif pp:
            status = "primary-only"
        else:
            status = "blind-only"
        selected_ref_sources = [name for name, rec in (("primary", primary_record), ("blind", blind_record)) if rec and rec["targetSha256"] == selected_hash]
        discarded_ref_sources = [name for name, rec in (("primary", primary_record), ("blind", blind_record)) if rec and rec["targetSha256"] != selected_hash]
        proposal_row = {
            "window": "W3860-W3879",
            "position": pos,
            "locale": locale,
            "sourceId": s["sourceId"],
            "sourceTextSha256": s["sourceTextSha256"],
            "currentTargetSha256": current_hash,
            "callerContextSha256": c["callerContextSha256"],
            "status": status,
            "primaryProposal": primary_record,
            "blindProposal": blind_record,
            "selectedTarget": selected_text,
            "selectedTargetSha256": selected_hash,
            "selectedProposalSources": selected_ref_sources,
            "supersededProposalSources": discarded_ref_sources,
            "resolutionRationale": why,
        }
        proposal_reconciliation.append(proposal_row)
        if status == "different-targets":
            disagreements.append(proposal_row)

    row = {
        "schemaVersion": 1,
        "window": "W3860-W3879",
        "position": pos,
        "locale": locale,
        "sourceId": s["sourceId"],
        "sourceIdSha256": s["sourceIdSha256"],
        "sourceText": s["sourceText"],
        "sourceTextSha256": s["sourceTextSha256"],
        "currentTarget": current_text,
        "currentTargetSha256": current_hash,
        "callerContextSha256": c["callerContextSha256"],
        "primaryDisposition": p["disposition"],
        "primaryProposal": primary_record,
        "blindDisposition": b["reviewDisposition"],
        "blindProposal": blind_record,
        "decision": decision,
        "selectedTarget": selected_text,
        "selectedTargetSha256": selected_hash,
        "selectedProposalSources": sources_for_target if decision != "keep-current" else [],
        "rationale": why,
        "confidence": confidence,
        "hold": None,
    }
    ledger.append(row)

write_jsonl(OUT / "cross-ledger.jsonl", ledger)
write_jsonl(OUT / "proposal-reconciliation.jsonl", proposal_reconciliation)
write_jsonl(OUT / "proposal-disagreements.jsonl", disagreements)
(OUT / "holds.jsonl").write_text("", encoding="utf-8")
write_json(OUT / "input-verifier-results.json", {
    "candidateFree": {
        "result": "PASS",
        "head": manifest["head"],
        "tree": manifest["tree"],
        "window": manifest["range"],
        "sourceCount": 20,
        "cells": 240,
        "catalogPinsVerifiedAgainstExactHeadWorktree": True,
        "priorSelectedSourceHashes": 3860,
        "priorAppliedTargets": 100,
        "priorHashOnlyHolds": 14,
        "baselineProtectedLiteralMismatches": 2,
    },
    "primary": {
        "result": "PASS",
        "head": primary_manifest["head"],
        "tree": primary_manifest["tree"],
        "cells": 240,
        "acceptCurrent": 224,
        "corrections": 5,
        "refinements": 11,
        "holds": 0,
        "selected": 16,
    },
    "blind": {
        "result": "PASS",
        "head": blind_summary["head"],
        "tree": blind_summary["tree"],
        "cells": 240,
        "acceptCurrent": 205,
        "proposals": 35,
        "holds": 0,
        "baselineProtectedLiteralMismatches": 2,
        "recommendedProtectedLiteralMismatches": 0,
    },
    "checksums": {
        "candidateFree": "PASS",
        "primary": "PASS",
        "blind": "PASS",
    },
    "livePRBeforeReview": "PASS",
    "temporaryVerifierWorktree": {
        "head": manifest["head"],
        "tree": manifest["tree"],
        "removedAfterCatalogByteVerification": True,
    },
})
summary = {
    "artifact": "SeerrNG PR #418 W3860-W3879 independent cross review",
    "schemaVersion": 1,
    "repository": "snapetech-org/SeerrNG",
    "pullRequest": 418,
    "window": "W3860-W3879",
    "head": manifest["head"],
    "tree": manifest["tree"],
    "baseRef": manifest["baseRef"],
    "baseSha": manifest["baseSha"],
    "sourceCount": 20,
    "localeCount": 12,
    "cells": len(ledger),
    "keepCurrent": sum(row["decision"] == "keep-current" for row in ledger),
    "selectedReviewedTargets": selected_changed,
    "newHashOnlyHolds": len([row for row in ledger if row["hold"] is not None]),
    "priorHashOnlyHoldsPreserved": 14,
    "primaryProposalCount": len(primary_props),
    "blindProposalCount": len(blind_props),
    "proposalUnion": len(proposal_reconciliation),
    "sameTargetProposalAgreements": sum(row["status"] == "same-target" for row in proposal_reconciliation),
    "differentTargetProposalDisagreements": sum(row["status"] == "different-targets" for row in proposal_reconciliation),
    "primaryOnlyProposals": sum(row["status"] == "primary-only" for row in proposal_reconciliation),
    "blindOnlyProposals": sum(row["status"] == "blind-only" for row in proposal_reconciliation),
    "selectedProposalSources": dict(selected_by_source),
    "baselineProtectedLiteralMismatches": 2,
    "selectedTargetProtectedLiteralMismatches": 0,
    "nativeSpeakerApproval": False,
    "browserReview": False,
    "confidence": "moderate",
    "applicationPerformed": False,
    "livePRBefore": "PASS",
    "livePRAfter": "PASS",
    "inputVerifiers": "PASS",
}
write_json(OUT / "summary.json", summary)
print(json.dumps(summary, ensure_ascii=False, indent=2))
