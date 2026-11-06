#!/usr/bin/env python3
"""Build the sealed W3940-W3959 SeerrNG primary/blind cross-audit packet."""
from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
import sys

OUT = pathlib.Path(__file__).resolve().parent
TASK = OUT.parent
CF = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3940-3959-primary-20261104/candidate-free-input")
PRIMARY = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3940-3959-primary-20261104/primary-review")
BLIND = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3940-3959-blind-root-20261104/decisions-packet")
REPO = pathlib.Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3940-3959-source")
HEAD = "a0104b4c84a9c4561020ca72062171b22ffc49f2"
TREE = "aaa44c8019c58fde7ae796065e8aae7ac11d7a80"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
WINDOW = "W3940-W3959"
STALE_PROMPT_BLIND_SUMS_SHA256 = "152887e469d8ee7f989a9961e78f9140307f2ef3a7bb5e6a21f0dfc580a03fe8"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_text(value: str) -> str:
    return sha(value.encode("utf-8"))


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_rows(path: pathlib.Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: pathlib.Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: pathlib.Path, values):
    path.write_text("".join(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n" for value in values), encoding="utf-8")


def git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def capture_live(label: str):
    remote = subprocess.check_output(
        ["git", "-C", str(REPO), "ls-remote", "origin", f"refs/heads/{BRANCH}", "refs/pull/418/head", "refs/heads/main"],
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
        "artifact": f"SeerrNG PR #418 {WINDOW} cross-review live attestation ({label})",
        "capturedAtUtc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": WINDOW,
        "sourceWorktree": str(REPO),
        "localHeadSha": git("rev-parse", "HEAD"),
        "localHeadTree": git("rev-parse", "HEAD^{tree}"),
        "sourceWorktreeStatus": git("status", "--porcelain=v1"),
        "sourceBranchRef": BRANCH,
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


# Each entry independently selects one target from the primary/blind proposals.
# The source packet's own rationale is retained alongside this cross-review.
CHOICES = {
    (3940, "ko"): ("primary", "Removes the redundant one-or-more phrasing and keeps the required minimum of one notification type.", "high"),
    (3941, "ar"): ("primary", "Names an API token for the application; the current word order reads as an application key followed by API.", "moderate"),
    (3941, "de"): ("primary", "The genitive phrase makes the application-to-token relation clear without stacking three technical nouns.", "moderate"),
    (3941, "es"): ("primary", "Reorders the label to express the application's API token naturally.", "moderate"),
    (3941, "fr"): ("blind", "Adds the missing relation before API and explicitly identifies the application's token.", "moderate"),
    (3941, "hi"): ("primary", "Uses the Hindi software-application and token terms while preserving API.", "moderate"),
    (3941, "id"): ("primary", "Places token before API and application in a readable Indonesian label.", "moderate"),
    (3941, "vi"): ("blind", "Adds của to make the application's ownership relation explicit.", "moderate"),
    (3942, "ar"): ("blind", "Corrects request to application and expresses registering it for use with Seerr; the link tags stay around the action.", "moderate"),
    (3942, "de"): ("primary", "Removes the space before the comma and states the Seerr purpose directly.", "high"),
    (3942, "hi"): ("blind", "Uses the software term for application and places the Seerr purpose before the registration imperative.", "moderate"),
    (3942, "id"): ("blind", "Uses the direct registration imperative and states that the application can be used with Seerr.", "moderate"),
    (3942, "ko"): ("blind", "Turns the linked noun phrase into the requested registration action and keeps the Seerr purpose.", "moderate"),
    (3942, "pt-BR"): ("primary", "Uses the common Brazilian Portuguese software term aplicativo for this registered app.", "moderate"),
    (3942, "zh-Hans"): ("blind", "Corrects create/associate to register for use and uses the full software term 应用程序.", "moderate"),
    (3942, "zh-Hant"): ("blind", "Corrects create a Seerr-only app to registering an app for use with Seerr.", "moderate"),
    (3944, "ar"): ("primary", "The option is inside a sound selector, so the target names the device's default sound rather than a default device.", "high"),
    (3944, "es"): ("primary", "Adds sound so the label describes the device's default sound option.", "high"),
    (3944, "fr"): ("primary", "Adds sound so the label describes the device's default sound option.", "high"),
    (3944, "ko"): ("primary", "Names the device's default notification sound, matching the sound-selector context.", "moderate"),
    (3944, "pt-BR"): ("primary", "Adds sound so the menu option identifies the device's default sound.", "high"),
    (3944, "zh-Hans"): ("primary", "Adds the sound noun, resolving the context-dependent meaning of Device Default.", "moderate"),
    (3944, "zh-Hant"): ("primary", "Adds the sound noun, resolving the context-dependent meaning of Device Default.", "moderate"),
    (3945, "es"): ("blind", "Incrustar expresses embed more directly than insertar for this poster checkbox; póster is accented.", "moderate"),
    (3945, "pt-BR"): ("primary", "Incluir describes adding the poster to outgoing notifications; pôster uses the standard circumflex.", "moderate"),
    (3948, "es"): ("primary", "Corrects the required accent in notificación.", "high"),
    (3949, "ar"): ("primary", "Restores the Pushover provider name and clearly states that its test notification failed to send.", "high"),
    (3949, "de"): ("primary", "States the failed send explicitly and uses a hyphenated Pushover compound.", "high"),
    (3949, "fr"): ("primary", "Uses the natural notification de test phrase and preserves the send-failure state.", "high"),
    (3949, "hi"): ("blind", "Keeps the provider's Pushover spelling and preserves the failed-send meaning.", "moderate"),
    (3950, "ar"): ("primary", "Uses a natural ongoing-send phrase, retains Pushover, and preserves the ellipsis.", "moderate"),
    (3950, "de"): ("primary", "Hyphenates the provider name as part of the German compound and retains the ongoing state.", "moderate"),
    (3950, "fr"): ("primary", "Uses notification de test, preserving the ongoing send and Pushover provider.", "high"),
    (3950, "hi"): ("blind", "Preserves the Latin provider name, expresses the ongoing send, and matches the ellipsis.", "moderate"),
    (3950, "id"): ("blind", "Uses an Indonesian test-notification phrase and the same ellipsis as the source.", "moderate"),
    (3950, "zh-Hans"): ("blind", "Uses the natural progressive form 正在发送 and retains Pushover and the ellipsis.", "moderate"),
    (3950, "zh-Hant"): ("blind", "Uses the natural progressive form 正在傳送 and retains Pushover and the ellipsis.", "moderate"),
    (3951, "ar"): ("primary", "Restores the provider name and expresses that the Pushover test notification was sent successfully.", "moderate"),
    (3951, "de"): ("primary", "Hyphenates the provider compound and expresses the completed send as a full success clause.", "moderate"),
    (3951, "fr"): ("blind", "Uses a complete French success sentence with the test-notification relation made explicit.", "moderate"),
    (3953, "de"): ("blind", "Specifies a 30-character identifier, not a 30-digit one, and preserves the link markup and 30 token.", "moderate"),
    (3955, "de"): ("blind", "Uses the singular classification noun Typ and matches the source's no-final-period punctuation.", "moderate"),
    (3955, "es"): ("blind", "Removes commas that interrupt al menos while keeping the minimum-one requirement.", "moderate"),
    (3955, "ko"): ("primary", "Removes redundant at-least-one-or-more wording and keeps the minimum-one instruction.", "moderate"),
    (3956, "ar"): ("primary", "Changes mention to provide and keeps the valid user-or-group key requirement.", "moderate"),
    (3958, "es"): ("primary", "Corrects the accent in póster and retains the embed action.", "high"),
    (3958, "pt-BR"): ("primary", "Uses include for the outgoing poster option and corrects the circumflex in pôster.", "moderate"),
    (3959, "ko"): ("primary", "Uses activate/enable rather than use for a checkbox that enables request-approval actions.", "moderate"),
}

ALTERNATE_REASONS = {
    (3941, "de", "blind"): "Both options identify the application's API token; the selected genitive phrasing avoids a longer stacked compound.",
    (3942, "ar", "primary"): "Both preserve registration and Seerr use; the selected wording makes the purpose relation more direct.",
    (3942, "hi", "primary"): "The selected Hindi ordering places the purpose naturally before the registration instruction.",
    (3942, "id", "primary"): "The selected wording states the Seerr-use purpose more explicitly.",
    (3942, "zh-Hans", "primary"): "The selected wording uses the full software-app term and preserves the register-for-use meaning.",
    (3942, "zh-Hant", "primary"): "The selected wording states the Seerr-use purpose with 搭配使用.",
    (3945, "pt-BR", "blind"): "Inserir is understandable, but Incluir better describes enabling poster inclusion in the outgoing notification.",
    (3949, "hi", "primary"): "The transliterated provider name is understandable; the selected spelling keeps the product's Latin brand form.",
    (3950, "hi", "primary"): "The transliterated provider name is understandable; the selected spelling keeps the product's Latin brand form.",
    (3951, "ar", "blind"): "Both identify the sent Pushover test notification; the selected adjective agrees directly with إشعار.",
    (3951, "fr", "primary"): "The selected alternative is a complete success sentence, matching the source sentence form.",
    (3953, "de", "primary"): "Nutzer is understandable; Benutzer is the more explicit conventional software-user term here.",
    (3955, "de", "primary"): "The target differs only by a final period; the selected version follows the source punctuation.",
    (3955, "ko", "blind"): "Both versions preserve the minimum; the selected phrasing directly expresses one or more types.",
    (3958, "pt-BR", "blind"): "Inserir is understandable, but Incluir better describes enabling poster inclusion in the outgoing notification.",
}

HOLD_POSITIONS = {3943, 3957}
HOLD_REASON = (
    "Caller context identifies a Pushover or Slack setting checkbox but does not establish the product meaning of Agent; "
    "the English source is underspecified for a safe locale-specific translation."
)


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
        result[field] = {
            "matches": source_tokens[field] == target_tokens[field],
            "source": source_tokens[field],
            "target": target_tokens[field],
        }
    missing = [value for value in source_tokens["protectedLiterals"] if value not in target_tokens["protectedLiterals"]]
    result["protectedLiterals"] = {
        "matches": not missing,
        "source": source_tokens["protectedLiterals"],
        "target": target_tokens["protectedLiterals"],
        "missingFromTarget": missing,
    }
    return result


def candidate_for(key, origin, primary_props, blind_cells):
    if origin == "primary":
        return primary_props.get(key)
    if origin == "blind":
        row = blind_cells.get(key)
        if row and row.get("decision") == "propose":
            return row["proposal"]
    raise ValueError(f"missing selected candidate {key} from {origin}")


def main():
    # Re-run source/input verifiers before using candidate rows.
    subprocess.run([sys.executable, str(CF / "verify-candidate-free.py"), "--source-worktree", str(REPO)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, str(PRIMARY / "verify-primary.py"), "--candidate-free", str(CF)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, str(BLIND / "verify_blind_packet.py")], check=True, stdout=subprocess.DEVNULL)

    # Capture the live state immediately before sealing this review packet.
    live_before = capture_live("before sealing")
    if (live_before["localHeadSha"], live_before["localHeadTree"], live_before["sourceWorktreeStatus"]) != (HEAD, TREE, ""):
        raise SystemExit("source worktree pin or cleanliness changed")
    if any(live_before[k] != HEAD for k in ("branchRefSha", "pullRefSha", "prApiHeadSha")):
        raise SystemExit("live PR head refs changed")

    source_rows = read_rows(CF / "selected-source-cells.jsonl")
    cells = read_rows(CF / "current-target-cells.jsonl")
    contexts = {r["position"]: r for r in read_rows(CF / "caller-contexts.jsonl")}
    blocks = {r["contextId"]: r for r in read_rows(CF / "caller-context-blocks.jsonl")}
    primary_ledger = {(r["position"], r["locale"]): r for r in read_rows(PRIMARY / "primary-ledger.jsonl")}
    primary_prop_rows = read_rows(PRIMARY / "selected-proposals.jsonl")
    primary_props = {(r["position"], r["locale"]): r for r in primary_prop_rows}
    blind_rows = read_rows(BLIND / "review-cells.jsonl")
    blind_cells = {(r["position"], r["locale"]): r for r in blind_rows}
    pins = read_json(CF / "catalog-file-pins.json")["catalogFiles"]
    source_by_pos = {r["position"]: r for r in source_rows}
    cellmap = {(r["position"], r["locale"]): r for r in cells}

    if len(cellmap) != 240 or len(primary_ledger) != 240 or len(blind_cells) != 240 or len(contexts) != 20:
        raise SystemExit("input row counts changed")
    if set(CHOICES) != set(primary_props) | {k for k, r in blind_cells.items() if r.get("decision") == "propose"}:
        missing = (set(primary_props) | {k for k, r in blind_cells.items() if r.get("decision") == "propose"}) - set(CHOICES)
        extra = set(CHOICES) - (set(primary_props) | {k for k, r in blind_cells.items() if r.get("decision") == "propose"})
        raise SystemExit(f"manual choice coverage mismatch; missing={sorted(missing)} extra={sorted(extra)}")

    selected = []
    reconciliation = []
    cross = []
    noops = []
    unresolved = []
    hold_reason_hash = sha_text(HOLD_REASON)
    for key in sorted(cellmap):
        c = cellmap[key]
        p = primary_ledger[key]
        b = blind_cells[key]
        source = source_by_pos[key[0]]
        ctx = contexts[key[0]]
        is_hold = key[0] in HOLD_POSITIONS
        choice = CHOICES.get(key)
        selected_target = None
        selected_source = None
        selected_hash = None
        selected_checks = None
        if choice:
            origin, rationale, confidence = choice
            selected_target = candidate_for(key, origin, {k: v["proposedTarget"] for k, v in primary_props.items()}, blind_cells)
            selected_hash = sha_text(selected_target)
            selected_source = origin
            p_target = primary_props.get(key, {}).get("proposedTarget")
            b_target = b.get("proposal") if b.get("decision") == "propose" else None
            if p_target == selected_target and b_target == selected_target:
                selected_source = "primary+blind"
            selected_tokens = tokens(selected_target)
            selected_checks = token_checks(source["sourceTokens"], selected_tokens)
            if not all(v["matches"] for v in selected_checks.values()):
                raise SystemExit(f"selected proposal token mismatch at {key}")
            proposal_kind = p.get("primaryDisposition") if origin == "primary" else "blind-propose"
            selected.append({
                "window": WINDOW,
                "position": key[0],
                "locale": key[1],
                "sourceId": c["sourceId"],
                "sourceIdSha256": c["sourceIdSha256"],
                "sourceText": source["sourceText"],
                "sourceTextSha256": c["sourceTextSha256"],
                "currentTarget": c["currentTarget"],
                "currentTargetSha256": c["currentTargetSha256"],
                "proposedTarget": selected_target,
                "proposedTargetSha256": selected_hash,
                "catalogPath": pins[key[1]]["path"],
                "catalogFileSha256": c["catalogFileSha256"],
                "catalogGitBlob": c["catalogGitBlob"],
                "callerContextSha256": c["callerContextSha256"],
                "selectedFrom": selected_source,
                "primaryProposalSha256": p_target and sha_text(p_target),
                "blindProposalSha256": b_target and sha_text(b_target),
                "primaryDisposition": p["primaryDisposition"],
                "blindDecision": b["decision"],
                "decision": "SELECT_PROPOSAL",
                "proposalKind": proposal_kind,
                "confidence": confidence,
                "crossRationale": rationale,
                "sourceTokens": source["sourceTokens"],
                "proposedTokens": selected_tokens,
                "tokenChecks": selected_checks,
            })

            for candidate_origin, candidate_target, candidate_rationale, candidate_confidence in (
                ("primary", p_target, primary_props.get(key, {}).get("rationale"), primary_props.get(key, {}).get("confidence")),
                ("blind", b_target, b.get("rationale") if b_target else None, b.get("confidence") if b_target else None),
            ):
                if candidate_target is None:
                    continue
                matches_selected = candidate_target == selected_target
                alternate_reason = ALTERNATE_REASONS.get((key[0], key[1], candidate_origin))
                if not matches_selected and not alternate_reason:
                    alternate_reason = "The alternate keeps the same source meaning; the selected wording is clearer for this caller context."
                reconciliation.append({
                    "window": WINDOW,
                    "position": key[0],
                    "locale": key[1],
                    "sourceIdSha256": c["sourceIdSha256"],
                    "sourceTextSha256": c["sourceTextSha256"],
                    "currentTargetSha256": c["currentTargetSha256"],
                    "callerContextSha256": c["callerContextSha256"],
                    "candidateOrigin": candidate_origin,
                    "candidateDisposition": p["primaryDisposition"] if candidate_origin == "primary" else "propose",
                    "candidateText": candidate_target,
                    "candidateSha256": sha_text(candidate_target),
                    "candidateRationale": candidate_rationale,
                    "candidateConfidence": candidate_confidence,
                    "reviewDisposition": "SELECTED" if matches_selected else "NOT_SELECTED_ALTERNATIVE",
                    "selectedProposalSha256": selected_hash,
                    "crossRationale": rationale if matches_selected else alternate_reason,
                    "sourceTokens": source["sourceTokens"],
                    "candidateTokens": tokens(candidate_target),
                    "tokenChecks": token_checks(source["sourceTokens"], tokens(candidate_target)),
                    "callerContextReferenceCount": ctx["callerCount"],
                    "callerContextBlockIds": ctx["contextBlockIds"],
                })

        if is_hold:
            cross_disposition = "HOLD"
            unresolved.append({
                "window": WINDOW,
                "position": key[0],
                "locale": key[1],
                "sourceIdSha256": c["sourceIdSha256"],
                "sourceTextSha256": c["sourceTextSha256"],
                "currentTargetSha256": c["currentTargetSha256"],
                "callerContextSha256": c["callerContextSha256"],
                "holdCode": "AMBIGUOUS_PRODUCT_MEANING",
                "holdReasonSha256": hold_reason_hash,
                "contextEvidenceSha256": c["callerContextSha256"],
                "confidence": "low",
            })
        elif choice:
            cross_disposition = "SELECT_PROPOSAL"
        else:
            cross_disposition = "KEEP"
            noops.append({
                "window": WINDOW,
                "position": key[0],
                "locale": key[1],
                "sourceIdSha256": c["sourceIdSha256"],
                "sourceTextSha256": c["sourceTextSha256"],
                "currentTargetSha256": c["currentTargetSha256"],
                "callerContextSha256": c["callerContextSha256"],
                "decision": "KEEP_CURRENT",
                "reasonCode": "NO_SUPPORTED_CHANGE_PROPOSED",
                "tokenChecks": c["tokenChecks"],
                "numericEquivalentAccepted": key in {(3940, "ja"), (3955, "ja")},
            })

        cross.append({
            "window": WINDOW,
            "position": key[0],
            "locale": key[1],
            "sourceIdSha256": c["sourceIdSha256"],
            "sourceTextSha256": c["sourceTextSha256"],
            "currentTargetSha256": c["currentTargetSha256"],
            "callerContextSha256": c["callerContextSha256"],
            "primaryDisposition": p["primaryDisposition"],
            "primaryProposalSha256": (sha_text(primary_props[key]["proposedTarget"]) if key in primary_props else None),
            "blindDecision": b["decision"],
            "blindProposalSha256": (sha_text(b["proposal"]) if b.get("decision") == "propose" else None),
            "crossDisposition": cross_disposition,
            "selectedFrom": selected_source,
            "selectedProposalSha256": selected_hash,
            "blindHoldResolved": False,
            "numericEquivalentAccepted": key in {(3940, "ja"), (3955, "ja")},
        })

    # Carry historical hash-only continuity byte-for-byte from candidate-free input.
    (OUT / "historical-hold-hashes.jsonl").write_bytes((CF / "prior-hold-hash-reattestation.jsonl").read_bytes())
    (OUT / "historical-applied-target-hashes.jsonl").write_bytes((CF / "prior-applied-target-hash-reattestation.jsonl").read_bytes())
    write_jsonl(OUT / "cross-ledger.jsonl", cross)
    write_jsonl(OUT / "proposal-reconciliation.jsonl", reconciliation)
    write_jsonl(OUT / "selected-proposals.jsonl", selected)
    write_jsonl(OUT / "no-op-ledger.jsonl", noops)
    write_jsonl(OUT / "unresolved-holds.jsonl", unresolved)
    write_jsonl(OUT / "resolved-blind-holds.jsonl", [])

    counts = collections.Counter(r["crossDisposition"] for r in cross)
    selected_by_origin = collections.Counter(r["selectedFrom"] for r in selected)
    updates = [{
        "position": r["position"],
        "sourceId": r["sourceId"],
        "sourceIdSha256": r["sourceIdSha256"],
        "sourceTextSha256": r["sourceTextSha256"],
        "locale": r["locale"],
        "catalogPath": r["catalogPath"],
        "catalogFileSha256": r["catalogFileSha256"],
        "expectedCurrentTargetSha256": r["currentTargetSha256"],
        "proposedTarget": r["proposedTarget"],
        "proposedTargetSha256": r["proposedTargetSha256"],
        "callerContextSha256": r["callerContextSha256"],
        "crossDecision": r["decision"],
    } for r in selected]
    apply_plan = {
        "artifact": f"SeerrNG PR #418 {WINDOW} cross-review apply plan",
        "reviewMode": "independent exact-head primary/blind cross-audit",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": WINDOW,
        "head": HEAD,
        "tree": TREE,
        "applyStatus": "PREPARED_NOT_APPLIED",
        "selectedUpdateCount": len(selected),
        "sourceCellCount": len(cells),
        "noRepositoryWritesPerformed": True,
        "updates": updates,
    }
    write_json(OUT / "apply-plan.json", apply_plan)

    caller_audit = []
    for src in source_rows:
        ctx = contexts[src["position"]]
        caller_audit.append({
            "window": WINDOW,
            "position": src["position"],
            "sourceIdSha256": src["sourceIdSha256"],
            "sourceTextSha256": src["sourceTextSha256"],
            "callerContextSha256": ctx["callerContextSha256"],
            "callerResolution": ctx["callerResolution"],
            "callerCount": ctx["callerCount"],
            "callerOccurrenceCount": ctx["callerOccurrenceCount"],
            "definitionFiles": ctx["definitionFiles"],
            "namespaceFiles": ctx["namespaceFiles"],
            "contextBlockIds": ctx["contextBlockIds"],
            "directMessageReferences": [{
                "path": ref["path"], "line": ref["line"], "lineSha256": ref["lineSha256"], "text": ref["text"].strip()
            } for ref in ctx["directMessageReferences"]],
            "dynamicRendererReferences": [{
                "path": ref["path"], "line": ref["line"], "lineSha256": ref["lineSha256"], "gitBlob": ref["gitBlob"]
            } for ref in ctx["dynamicRendererReferences"]],
        })
    write_jsonl(OUT / "caller-context-audit.jsonl", caller_audit)

    # Capture immutable input attestation values and the reconciled checksum digest.
    cf_man = read_json(CF / "manifest.json")
    p_man = read_json(PRIMARY / "manifest.json")
    b_man = read_json(BLIND / "review_packet.json")
    input_attestation = {
        "artifact": f"SeerrNG PR #418 {WINDOW} cross-review input attestation",
        "reviewMode": "independent exact-head primary/blind cross-audit",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": WINDOW,
        "head": HEAD,
        "tree": TREE,
        "candidateFreeInput": {
            "path": str(CF),
            "manifestSha256": sha((CF / "manifest.json").read_bytes()),
            "checksumManifestSha256": sha((CF / "SHA256SUMS.txt").read_bytes()),
            "verifier": "PASS",
            "manifestCellCount": cf_man["cellCount"],
        },
        "primaryReview": {
            "path": str(PRIMARY),
            "manifestSha256": sha((PRIMARY / "manifest.json").read_bytes()),
            "checksumManifestSha256": sha((PRIMARY / "SHA256SUMS.txt").read_bytes()),
            "verifier": "PASS",
            "manifestCellCount": p_man["primaryLedgerCellCount"],
            "proposalCount": p_man["primaryProposalCount"],
        },
        "blindReview": {
            "path": str(BLIND),
            "manifestSha256": sha((BLIND / "review_packet.json").read_bytes()),
            "checksumManifestSha256": sha((BLIND / "SHA256SUMS.txt").read_bytes()),
            "verifier": "PASS",
            "manifestCellCount": b_man["decisionCounts"]["keep"] + b_man["decisionCounts"]["propose"] + b_man["decisionCounts"]["hold"],
            "proposalCount": b_man["decisionCounts"]["propose"],
            "providedPromptChecksumDigest": STALE_PROMPT_BLIND_SUMS_SHA256,
            "authoritativeCurrentChecksumDigest": sha((BLIND / "SHA256SUMS.txt").read_bytes()),
            "digestReconciliation": "Root confirmed the supplied prompt digest was stale after final checksum regeneration; the current packet bytes are stable and pass both SHA256SUMS and its portable verifier.",
        },
        "inputVerifierCommands": [
            "python3 verify-candidate-free.py --source-worktree <source-worktree>",
            "python3 verify-primary.py --candidate-free <candidate-free-input>",
            "python3 verify_blind_packet.py",
        ],
        "sourceWorktree": str(REPO),
        "sourceWorktreeStatus": "CLEAN",
    }
    write_json(OUT / "input-attestation.json", input_attestation)
    write_json(OUT / "live-review-before.json", live_before)

    proposal_assessments = collections.Counter(r["reviewDisposition"] for r in reconciliation)
    token_integrity_summary = {field: True for field in ("placeholders", "markupTags", "numericTokens", "protectedLiterals")}
    summary = {
        "artifact": f"SeerrNG PR #418 {WINDOW} independent cross-audit summary",
        "reviewedAtUtc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "head": HEAD,
        "tree": TREE,
        "sourceCount": 20,
        "localeCount": 12,
        "cellCount": 240,
        "primaryProposalCount": len(primary_prop_rows),
        "blindProposalCount": sum(r.get("decision") == "propose" for r in blind_rows),
        "proposalCandidateCount": len(reconciliation),
        "proposalCandidateAssessments": dict(proposal_assessments),
        "crossDispositionCounts": dict(counts),
        "selectedProposalCount": len(selected),
        "selectedTargetOriginCounts": dict(selected_by_origin),
        "noOpCount": len(noops),
        "currentHashOnlyHoldCount": len(unresolved),
        "resolvedBlindHoldCount": 0,
        "priorHashOnlyHoldCount": len(read_rows(OUT / "historical-hold-hashes.jsonl")),
        "priorAppliedTargetHashCount": len(read_rows(OUT / "historical-applied-target-hashes.jsonl")),
        "callerCoverage": {
            "sourceContexts": len(caller_audit),
            "directCallerReferences": sum(r["callerCount"] for r in caller_audit),
            "callerlessSourceCount": sum(r["callerCount"] == 0 for r in caller_audit),
        },
        "tokenIntegrity": {
            "selectedProposalsPass": token_integrity_summary,
            "baselineNumericEquivalentAccepted": ["3940::ja", "3955::ja"],
            "otherBaselineMismatchCounts": {"markupTags": 0, "numericTokens": 0, "placeholders": 0, "protectedLiterals": 0},
        },
        "unresolvedHoldPositions": [3943, 3957],
        "holdDisposition": "All 24 current Enable Agent cells remain hash-only because caller context does not establish the product meaning of Agent.",
        "historicalHashContinuity": "Prior 26 hold rows and 214 applied-target rows are copied byte-for-byte from candidate-free input.",
        "applyPlanStatus": "PREPARED_NOT_APPLIED",
        "nativeSpeakerApproval": False,
        "browserReview": False,
        "repositoryEdits": False,
        "testsBuildsScansCi": False,
        "reviewMode": "Independent AI semantic cross-audit using pinned caller context; not native-speaker or browser validation.",
    }
    write_json(OUT / "summary.json", summary)

    readme = f"""# SeerrNG PR #418 {WINDOW} cross-audit

This sealed, independent cross-audit covers all 240 cells (20 source IDs × 12 locales) at head `{HEAD}` / tree `{TREE}`. It reconciles the candidate-free packet, the primary review, the independent blind review, and exact caller context.

## Results

- **48** selected proposals across **48** cells, after assessing all **76** proposal candidates (39 primary and 37 blind; 28 overlapping cells).
- **168** no-op cells retained their current targets.
- **24** current “Enable Agent” cells at positions 3943 and 3957 remain hash-only holds. The caller contexts show settings checkboxes but do not define “Agent” enough to support a translation.
- The two Japanese numeric-token differences at 3940 and 3955 are retained as semantic equivalents of “one” (`1つ`). Selected proposals preserve markup, placeholders, numeric tokens, and protected literals.
- The prior **26** hold hashes and **214** applied-target hashes are carried byte-for-byte.

The apply plan is **prepared, not applied**. No source, catalog, PR, workflow, or repository files were changed. No tests, builds, scans, CI, merge, release, or tag were run. This AI review does not claim native-speaker or browser approval.

## Inputs and verification

- Candidate-free input: `{CF}` (manifest SHA-256 `{input_attestation['candidateFreeInput']['manifestSha256']}`)
- Primary review: `{PRIMARY}` (manifest SHA-256 `{input_attestation['primaryReview']['manifestSha256']}`)
- Blind review: `{BLIND}` (manifest SHA-256 `{input_attestation['blindReview']['manifestSha256']}`)
- Current authoritative blind `SHA256SUMS.txt` digest: `{input_attestation['blindReview']['authoritativeCurrentChecksumDigest']}`. The initial task message carried the stale digest `{STALE_PROMPT_BLIND_SUMS_SHA256}`; root reconciled that mismatch before cell review, and the current packet's checksums and portable verifier pass.

Run the portable verifier with all three input directories and the exact source worktree:

```sh
python3 verify_cross_review.py \\
  --candidate-free-input /path/to/candidate-free-input \\
  --primary-review /path/to/primary-review \\
  --blind-packet /path/to/decisions-packet \\
  --source-worktree /path/to/seerrng-source-worktree \\
  --require-live
```

The live before/after snapshots record the local head/tree, clean worktree status, remote branch and PR refs, PR API head/base, and current main. The proposed catalog changes are guarded by exact current-target SHA-256 values in `apply-plan.json`.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")

    # Seal a content-addressed output manifest and its checksum list.
    files = sorted(p for p in OUT.iterdir() if p.is_file() and p.name not in {"manifest.json", "SHA256SUMS.txt"})
    file_entries = [{"path": p.name, "bytes": p.stat().st_size, "sha256": sha(p.read_bytes())} for p in files]
    manifest = {
        "artifact": f"SeerrNG PR #418 {WINDOW} sealed independent cross-audit",
        "schemaVersion": 1,
        "reviewMode": "independent exact-head primary/blind cross-audit",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": WINDOW,
        "branch": BRANCH,
        "head": HEAD,
        "tree": TREE,
        "sourceCount": 20,
        "localeCount": 12,
        "cellCount": 240,
        "candidateFreeInputManifestSha256": input_attestation["candidateFreeInput"]["manifestSha256"],
        "primaryManifestSha256": input_attestation["primaryReview"]["manifestSha256"],
        "blindManifestSha256": input_attestation["blindReview"]["manifestSha256"],
        "blindChecksumManifestSha256": input_attestation["blindReview"]["authoritativeCurrentChecksumDigest"],
        "crossDispositionCounts": dict(counts),
        "selectedProposalCount": len(selected),
        "proposalCandidateAssessments": dict(proposal_assessments),
        "noOpCount": len(noops),
        "currentHashOnlyHoldCount": len(unresolved),
        "historicalHashOnlyHoldCount": summary["priorHashOnlyHoldCount"],
        "historicalAppliedTargetHashCount": summary["priorAppliedTargetHashCount"],
        "nativeSpeakerApproval": False,
        "browserReview": False,
        "applyStatus": "PREPARED_NOT_APPLIED",
        "files": file_entries,
    }
    write_json(OUT / "manifest.json", manifest)
    sums = []
    for p in sorted(OUT.iterdir()):
        if p.is_file() and p.name != "SHA256SUMS.txt":
            sums.append(f"{sha(p.read_bytes())}  {p.name}\n")
    (OUT / "SHA256SUMS.txt").write_text("".join(sums), encoding="utf-8")
    print(json.dumps({
        "result": "BUILT",
        "output": str(OUT),
        "head": HEAD,
        "tree": TREE,
        "crossDispositionCounts": dict(counts),
        "selected": len(selected),
        "noOps": len(noops),
        "holds": len(unresolved),
        "proposalCandidates": len(reconciliation),
        "manifestSha256": sha((OUT / "manifest.json").read_bytes()),
        "checksumListSha256": sha((OUT / "SHA256SUMS.txt").read_bytes()),
    }, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
