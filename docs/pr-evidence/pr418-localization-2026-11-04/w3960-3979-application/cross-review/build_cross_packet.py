#!/usr/bin/env python3
"""Build the independent SeerrNG PR #418 W3960-W3979 cross-review packet."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path("/home/keith/Documents/code/task-scratch")
PRIMARY = ROOT / "seerrng-pr418-w3960-3979-primary-20261104"
BLIND = ROOT / "seerrng-pr418-w3960-3979-blind-20261104"
P_IN = PRIMARY / "candidate-free-input"
B_IN = BLIND / "candidate-free-input"
P_REVIEW = PRIMARY / "primary-review"
OUT = ROOT / "seerrng-pr418-w3960-3979-cross-20261104"
SOURCE = Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source")
HEAD = "a456dd66aad34cb23f432cb3c189bb8083bbbe96"
TREE = "7a5447e5f08e84c392899a6e1400d1df73b1143b"
BASE_SHA = "fa40534ccced75bde1125c14760514fcd5d7de4d"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]
PROTECTED_PRIOR_FILES = [
    "prior-selection-hash-reattestation.jsonl",
    "prior-applied-target-hash-reattestation.jsonl",
    "prior-hold-hash-reattestation.jsonl",
    "prior-evidence-hash-index.json",
    "prior-catalog-application-summary.json",
]

LIVE_BEFORE = {
    "queriedAtUtc": "2026-11-04 20:47:17 UTC",
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "state": "open",
    "draft": True,
    "apiHead": HEAD,
    "apiHeadRef": BRANCH,
    "apiBase": BASE_SHA,
    "apiBaseRef": "main",
    "url": "https://github.com/snapetech-org/seerrng/pull/418",
}


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


def verify_checksums(directory: Path) -> dict:
    checksum_file = directory / "SHA256SUMS.txt"
    rows = []
    for line in checksum_file.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, relative = line.split("  ", 1)
        actual = sha_file(directory / relative)
        if actual != digest:
            raise ValueError(f"checksum mismatch: {directory / relative}")
        rows.append({"path": relative, "sha256": digest})
    return {"sha256sumsSha256": sha_file(checksum_file), "fileCount": len(rows), "files": rows}


def token_inventory(source_tokens: dict, text: str) -> tuple[dict, dict]:
    tags = re.findall(r"</?[A-Za-z][A-Za-z0-9]*>", text)
    numbers = re.findall(r"[0-9]+", text)
    placeholders = re.findall(r"\{[^{}]+\}", text)
    protected = [token for token in source_tokens.get("protectedLiterals", []) if token in text]
    extracted = {"markupTags": tags, "numericTokens": numbers, "placeholders": placeholders, "protectedLiterals": protected}
    checks = {}
    for category in ("markupTags", "numericTokens", "placeholders"):
        expected = source_tokens.get(category, [])
        checks[category] = {"matches": expected == extracted[category], "source": expected, "target": extracted[category]}
    expected = source_tokens.get("protectedLiterals", [])
    checks["protectedLiterals"] = {
        "matches": expected == extracted["protectedLiterals"],
        "source": expected,
        "target": extracted["protectedLiterals"],
        "missingFromTarget": [token for token in expected if token not in extracted["protectedLiterals"]],
    }
    return extracted, checks


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=SOURCE, text=True).strip()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for directory in (P_IN, B_IN, P_REVIEW, BLIND):
        verify_checksums(directory)

    p_manifest = read_json(P_IN / "manifest.json")
    b_manifest = read_json(B_IN / "manifest.json")
    if p_manifest != b_manifest:
        raise ValueError("primary and blind candidate-free manifests differ")
    if sha_file(P_IN / "SHA256SUMS.txt") != sha_file(B_IN / "SHA256SUMS.txt"):
        raise ValueError("primary and blind candidate-free checksum manifests differ")

    actual_head = git("rev-parse", "HEAD^{commit}")
    actual_tree = git("rev-parse", "HEAD^{tree}")
    porcelain = git("status", "--porcelain=v1")
    if (actual_head, actual_tree, porcelain) != (HEAD, TREE, ""):
        raise ValueError("source worktree is not the exact clean pin")
    remote_refs = subprocess.check_output(
        ["git", "ls-remote", "origin", f"refs/heads/{BRANCH}", "refs/pull/418/head", "refs/heads/main"],
        cwd=SOURCE,
        text=True,
    ).splitlines()
    remote_map = {line.split("\t", 1)[1]: line.split("\t", 1)[0] for line in remote_refs if "\t" in line}
    if remote_map != {
        f"refs/heads/{BRANCH}": HEAD,
        "refs/pull/418/head": HEAD,
        "refs/heads/main": "016bcf8db7475b2105b9b488ff67ed7d1c096508",
    }:
        raise ValueError(f"live refs do not match expected pins: {remote_map}")

    source_rows = read_jsonl(P_IN / "selected-source-cells.jsonl")
    current_rows = read_jsonl(P_IN / "current-target-cells.jsonl")
    primary_rows = read_jsonl(P_REVIEW / "primary-ledger.jsonl")
    primary_candidates = read_jsonl(P_REVIEW / "selected-proposals.jsonl")
    blind_rows = read_jsonl(BLIND / "reviewed-cells.jsonl")
    blind_candidates = read_json(BLIND / "proposals.json")
    callers = read_jsonl(P_IN / "caller-contexts.jsonl")
    caller_blocks = read_jsonl(P_IN / "caller-context-blocks.jsonl")

    src_by_pos = {row["position"]: row for row in source_rows}
    curr_by_key = {(row["position"], row["locale"]): row for row in current_rows}
    prim_by_key = {(row["position"], row["locale"]): row for row in primary_rows}
    blind_by_key = {(row["position"], row["locale"]): row for row in blind_rows}
    caller_by_pos = {row["position"]: row for row in callers}
    prim_candidate_by_key = {(row["position"], row["locale"]): row for row in primary_candidates}
    blind_candidate_by_key = {(row["position"], row["locale"]): row for row in blind_candidates}

    # Chosen independently after comparing candidate text, source/caller context, token rules,
    # local sibling labels, and the prior W3940-W3959 applied wording.
    selections = {
        (3962, "ar"): {
            "target": "إدخال واحد في كل سطر: معرّف مستخدم Slack (ID)=معرّف مستخدم SeerrNG (ID). يجب أن يمتلك كل مستخدم SeerrNG مُعيّن إذن إدارة الطلبات.",
            "kind": "CORRECTION",
            "from": "blind",
            "rationale": "Keep the Arabic identifier wording and restore the exact protected ID literal on both sides of the required Slack-to-SeerrNG mapping format. This follows the earlier Arabic API wording pattern, which retains the Latin acronym beside translated text.",
        },
        (3974, "ar"): {
            "target": "أدخل معرّف مساحة عمل Slack (ID) صالحًا",
            "kind": "CORRECTION",
            "from": "blind",
            "rationale": "The caller uses this text as a required-field validation message. Preserve the Arabic identifier wording while restoring protected ID; the current value omits the acronym.",
        },
        (3975, "ar"): {
            "target": "عنوان URL لخطاف الويب",
            "kind": "CORRECTION",
            "from": "sibling-locale-wording",
            "rationale": "The settings form uses this as the Slack Webhook URL field label. The current word order obscures the URL relation; reuse the existing Arabic sibling label for the same English source, preserving URL exactly.",
            "siblingKey": "components.Settings.Notifications.NotificationsWebhook.webhookUrl",
        },
        (3975, "zh-Hant"): {
            "target": "Webhook URL",
            "kind": "CORRECTION",
            "from": "primary",
            "rationale": "This is the linked-settings form field label. 網頁 URL means a webpage URL, so it loses the Webhook referent. Reuse the existing zh-Hant sibling label for the same source phrase and preserve URL exactly.",
            "siblingKey": "components.Settings.Notifications.NotificationsWebhook.webhookUrl",
        },
        (3976, "hi"): {
            "target": "एक <WebhookLink>इनकमिंग वेबहुक</WebhookLink> के लिए इंटीग्रेशन बनाएँ।",
            "kind": "REFINEMENT",
            "from": "primary",
            "rationale": "The settings help text is an instruction whose link opens Slack's Incoming Webhook creation page. Reorder the current infinitive phrase into a clear instruction and keep the link phrase attached to the webhook concept.",
        },
        (3976, "de"): {
            "target": "Erstelle eine Integration mit einem <WebhookLink>eingehenden Webhook</WebhookLink>.",
            "kind": "CORRECTION",
            "from": "primary",
            "rationale": "The current linked phrase has incorrect gender agreement. Webhook is masculine in this German technical compound; einem eingehenden Webhook is grammatical and the integration relationship is explicit.",
        },
        (3976, "fr"): {
            "target": "Créer une intégration avec un <WebhookLink>webhook entrant</WebhookLink>.",
            "kind": "CORRECTION",
            "from": "blind",
            "rationale": "Webhook is masculine in French, so the current feminine entrante is an agreement error. The replacement keeps the Incoming Webhook link label and integration meaning.",
        },
        (3976, "id"): {
            "target": "Buat integrasi <WebhookLink>Webhook Masuk</WebhookLink>",
            "kind": "REFINEMENT",
            "from": "blind",
            "rationale": "The UI help is an imperative and the existing linked term Webhook Masuk is already established in this locale. Move integrasi before the linked phrase to correct the current Indonesian word order.",
        },
        (3977, "ar"): {
            "target": "معرّف مساحة عمل Slack (ID)",
            "kind": "CORRECTION",
            "from": "blind",
            "rationale": "This is the Slack workspace ID field label. Keep the existing Arabic noun phrase and restore the exact protected ID literal, consistent with the prior Arabic API wording pattern.",
        },
        (3978, "ar"): {
            "target": "المعرّف (ID) لمساحة العمل المالكة لتطبيق Slack هذا.",
            "kind": "CORRECTION",
            "from": "blind",
            "rationale": "This is explanatory help for the workspace that owns the Slack app. Restore the exact protected ID literal beside its Arabic descriptor without changing the referent.",
        },
    }

    sibling_values = {}
    for key, selection in selections.items():
        if "siblingKey" in selection:
            locale = key[1].replace("-", "_")
            catalog_path = SOURCE / "src" / "i18n" / "locale" / f"{locale}.json"
            catalog = read_json(catalog_path)
            sibling_text = catalog[selection["siblingKey"]]
            if sibling_text != selection["target"]:
                raise ValueError(f"selected sibling wording drifted for {key}: {sibling_text!r}")
            sibling_values[f"{key[0]}::{key[1]}"] = {
                "catalogPath": str(catalog_path.relative_to(SOURCE)),
                "key": selection["siblingKey"],
                "value": sibling_text,
                "valueSha256": sha_bytes(sibling_text.encode("utf-8")),
            }

    # Reconcile every proposal cell to the exact pinned current value and chosen target.
    reconciled_candidates = []
    for origin, candidates in (("primary", primary_candidates), ("blind", blind_candidates)):
        for candidate in candidates:
            key = (candidate["position"], candidate["locale"])
            chosen = selections[key]
            candidate_text = candidate["proposedTarget"]
            selected = sha_bytes(candidate_text.encode("utf-8")) == sha_bytes(chosen["target"].encode("utf-8"))
            candidate_id = candidate.get("proposalId") or f"primary-{key[0]}-{key[1]}"
            if selected:
                resolution = "Selected for this cell after source, UI caller, locale, and token review."
            elif key in ((3975, "ar"), (3975, "zh-Hant")):
                resolution = "Not selected because the cross target reuses the exact existing same-locale sibling label for the same English source phrase, improving catalog consistency while retaining the protected URL literal."
            elif key == (3976, "hi"):
                resolution = "Not selected; the primary version uses a clear Hindi relation meaning an integration for an Incoming Webhook and preserves the message's imperative context."
            elif key == (3976, "de"):
                resolution = "Not selected; the primary version corrects masculine agreement and uses mit einem to express the integration relationship."
            elif key in ((3962, "ar"), (3974, "ar"), (3977, "ar"), (3978, "ar")):
                resolution = "Not selected; the blind version keeps the Arabic identifier phrase and adds the exact protected ID token, matching the established Arabic-plus-acronym style."
            else:
                resolution = "Not selected because another candidate gives the clearer locale-appropriate correction while retaining the exact markup and source meaning."
            reconciled_candidates.append({
                "candidateId": candidate_id,
                "origin": origin,
                "position": key[0],
                "locale": key[1],
                "sourceId": candidate["sourceId"],
                "sourceIdSha256": candidate["sourceIdSha256"],
                "sourceTextSha256": candidate["sourceTextSha256"],
                "callerContextSha256": candidate["callerContextSha256"],
                "currentTargetSha256": candidate["currentTargetSha256"],
                "candidateTarget": candidate_text,
                "candidateTargetSha256": candidate.get("proposedTargetSha256") or sha_bytes(candidate_text.encode("utf-8")),
                "candidateRationale": candidate.get("rationale"),
                "confidence": candidate.get("confidence"),
                "crossDisposition": "SELECTED" if selected else "NOT_SELECTED_ALTERNATIVE",
                "selectedTargetSha256": sha_bytes(chosen["target"].encode("utf-8")),
                "crossRationale": resolution,
            })

    if len(reconciled_candidates) != 17:
        raise ValueError(f"expected 17 primary+blind candidates, found {len(reconciled_candidates)}")

    cells = []
    selected_rows = []
    hold_rows = []
    noop_rows = []
    source_locale_hashes = {}
    for key, current in sorted(curr_by_key.items()):
        position, locale = key
        src = src_by_pos[position]
        prim = prim_by_key[key]
        blind = blind_by_key[key]
        caller = caller_by_pos[position]
        source_locale_hashes[key] = current["currentTargetSha256"]
        if current["sourceIdSha256"] != src["sourceIdSha256"] or current["sourceTextSha256"] != src["sourceTextSha256"]:
            raise ValueError(f"source/current cell mismatch at {key}")
        if current["callerContextSha256"] != caller["callerContextSha256"]:
            raise ValueError(f"caller context mismatch at {key}")
        if position == 3979:
            cell = {
                "window": "W3960-W3979",
                "position": position,
                "locale": locale,
                "sourceIdSha256": src["sourceIdSha256"],
                "sourceTextSha256": src["sourceTextSha256"],
                "currentTargetSha256": current["currentTargetSha256"],
                "callerContextSha256": caller["callerContextSha256"],
                "primaryDisposition": prim["primaryDisposition"],
                "blindDecision": blind["decision"],
                "crossDisposition": "HOLD_HASH_ONLY",
                "crossRationale": "The pinned caller confirms a production checkbox tied to enabled and the notifications/webpush route. It does not define what product feature or component Agent denotes, so translation meaning remains unresolved. Preserve the existing cell hash-only pending an authoritative product glossary or definition, consistent with the W3940-W3959 cross-audit holds for the same Enable Agent term.",
            }
            cells.append(cell)
            hold_rows.append({k: cell[k] for k in ("window", "position", "locale", "sourceIdSha256", "sourceTextSha256", "currentTargetSha256", "callerContextSha256", "crossRationale")})
            continue

        if key in selections:
            selection = selections[key]
            target = selection["target"]
            target_tokens, token_checks = token_inventory(src["sourceTokens"], target)
            if not all(check["matches"] for check in token_checks.values()):
                raise ValueError(f"selected token mismatch at {key}: {token_checks}")
            target_sha = sha_bytes(target.encode("utf-8"))
            source_candidate = prim_candidate_by_key.get(key) if selection["from"] == "primary" else blind_candidate_by_key.get(key)
            candidate_source = "cross-review refinement from existing sibling wording" if source_candidate is None else selection["from"]
            cell = {
                "window": "W3960-W3979",
                "position": position,
                "locale": locale,
                "sourceId": src["sourceId"],
                "sourceIdSha256": src["sourceIdSha256"],
                "sourceText": src["sourceText"],
                "sourceTextSha256": src["sourceTextSha256"],
                "sourceTokens": src["sourceTokens"],
                "currentTarget": current["currentTarget"],
                "currentTargetSha256": current["currentTargetSha256"],
                "callerContextSha256": caller["callerContextSha256"],
                "primaryDisposition": prim["primaryDisposition"],
                "primaryProposedTarget": prim_candidate_by_key.get(key, {}).get("proposedTarget"),
                "blindDecision": blind["decision"],
                "blindProposedTarget": blind_candidate_by_key.get(key, {}).get("proposedTarget"),
                "crossDisposition": "SELECT_UPDATE",
                "crossKind": selection["kind"],
                "selectedFrom": candidate_source,
                "crossTarget": target,
                "crossTargetSha256": target_sha,
                "crossTargetTokens": target_tokens,
                "tokenChecks": token_checks,
                "crossRationale": selection["rationale"],
            }
            cells.append(cell)
            selected = {
                "window": "W3960-W3979",
                "position": position,
                "locale": locale,
                "sourceId": src["sourceId"],
                "sourceIdSha256": src["sourceIdSha256"],
                "sourceText": src["sourceText"],
                "sourceTextSha256": src["sourceTextSha256"],
                "currentTarget": current["currentTarget"],
                "currentTargetSha256": current["currentTargetSha256"],
                "target": target,
                "targetSha256": target_sha,
                "kind": selection["kind"],
                "selectedFrom": candidate_source,
                "callerContextSha256": caller["callerContextSha256"],
                "sourceTokens": src["sourceTokens"],
                "targetTokens": target_tokens,
                "tokenChecks": token_checks,
                "catalogPath": current["catalogPath"],
                "catalogFileSha256": current["catalogFileSha256"],
                "catalogGitBlob": current["catalogGitBlob"],
                "crossRationale": selection["rationale"],
            }
            if key in sibling_values:
                selected["siblingWordingEvidence"] = sibling_values[f"{position}::{locale}"]
            selected_rows.append(selected)
        else:
            numeric_equivalent = position in (3962, 3970, 3972) and locale == "ja"
            numeric_note = None
            if numeric_equivalent:
                numeric_note = {
                    3962: "The Japanese digit 1 faithfully expresses One per line in this mapping-format instruction.",
                    3970: "The Japanese 1件以上 preserves the minimum of one Slack-to-SeerrNG user mapping.",
                    3972: "The Japanese 1つ以上 preserves the minimum of one notification type.",
                }[position]
            cell = {
                "window": "W3960-W3979",
                "position": position,
                "locale": locale,
                "sourceId": src["sourceId"],
                "sourceIdSha256": src["sourceIdSha256"],
                "sourceText": src["sourceText"],
                "sourceTextSha256": src["sourceTextSha256"],
                "sourceTokens": src["sourceTokens"],
                "currentTarget": current["currentTarget"],
                "currentTargetSha256": current["currentTargetSha256"],
                "callerContextSha256": caller["callerContextSha256"],
                "primaryDisposition": prim["primaryDisposition"],
                "blindDecision": blind["decision"],
                "crossDisposition": "KEEP_CURRENT",
                "numericEquivalentAccepted": numeric_equivalent,
                "numericEquivalentRationale": numeric_note,
            }
            cells.append(cell)
            noop_rows.append({
                "window": "W3960-W3979",
                "position": position,
                "locale": locale,
                "sourceIdSha256": src["sourceIdSha256"],
                "sourceTextSha256": src["sourceTextSha256"],
                "currentTargetSha256": current["currentTargetSha256"],
                "callerContextSha256": caller["callerContextSha256"],
                "numericEquivalentAccepted": numeric_equivalent,
                "numericEquivalentRationale": numeric_note,
            })

    counts = Counter(row["crossDisposition"] for row in cells)
    kind_counts = Counter(row["kind"] for row in selected_rows)
    if counts != Counter({"KEEP_CURRENT": 218, "SELECT_UPDATE": 10, "HOLD_HASH_ONLY": 12}):
        raise ValueError(f"unexpected cross disposition totals: {counts}")
    if kind_counts != Counter({"CORRECTION": 8, "REFINEMENT": 2}):
        raise ValueError(f"unexpected selected kind totals: {kind_counts}")
    if len(cells) != 240 or len({(row["position"], row["locale"]) for row in cells}) != 240:
        raise ValueError("cross ledger does not contain exactly 240 unique cells")

    # Keep exact caller text for the changed/held source IDs as source evidence.
    evidence_positions = sorted({row["position"] for row in selected_rows + hold_rows})
    context_rows = [row for row in callers if row["position"] in evidence_positions]
    context_ids = {context_id for row in context_rows for context_id in row["contextBlockIds"]}
    context_block_rows = [row for row in caller_blocks if row["contextId"] in context_ids]

    write_jsonl(OUT / "cross-review-cells.jsonl", cells)
    write_jsonl(OUT / "selected-proposals.jsonl", selected_rows)
    write_jsonl(OUT / "proposal-reconciliation.jsonl", reconciled_candidates)
    write_jsonl(OUT / "hash-only-holds.jsonl", hold_rows)
    write_jsonl(OUT / "no-op-ledger.jsonl", noop_rows)
    write_jsonl(OUT / "caller-context-audit.jsonl", context_rows)
    write_jsonl(OUT / "caller-context-blocks.jsonl", context_block_rows)
    prior_dir = OUT / "prior-lineage"
    prior_dir.mkdir(exist_ok=True)
    for name in PROTECTED_PRIOR_FILES:
        source_file = P_IN / name
        dest_file = prior_dir / name
        shutil.copyfile(source_file, dest_file)
        if sha_file(source_file) != sha_file(dest_file):
            raise ValueError(f"prior lineage copy changed: {name}")

    p_cf_checks = verify_checksums(P_IN)
    p_review_checks = verify_checksums(P_REVIEW)
    blind_checks = verify_checksums(BLIND)
    input_attestation = {
        "artifact": "SeerrNG PR #418 W3960-W3979 independent cross-review input attestation",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3960-W3979",
        "expectedHead": HEAD,
        "expectedTree": TREE,
        "branch": BRANCH,
        "baseRef": "main",
        "baseSha": BASE_SHA,
        "sourceWorktree": str(SOURCE),
        "sourceWorktreeClean": True,
        "remoteRefs": remote_map,
        "liveApiBefore": LIVE_BEFORE,
        "primaryCandidateFree": {
            "path": str(P_IN),
            "manifestSha256": sha_file(P_IN / "manifest.json"),
            "checksumManifestSha256": p_cf_checks["sha256sumsSha256"],
            "verifiedFiles": p_cf_checks["fileCount"],
            "manifest": p_manifest,
        },
        "blindCandidateFree": {
            "path": str(B_IN),
            "manifestSha256": sha_file(B_IN / "manifest.json"),
            "checksumManifestSha256": verify_checksums(B_IN)["sha256sumsSha256"],
            "byteIdenticalToPrimaryCandidateFree": True,
        },
        "primaryReview": {
            "path": str(P_REVIEW),
            "manifestSha256": sha_file(P_REVIEW / "manifest.json"),
            "checksumManifestSha256": p_review_checks["sha256sumsSha256"],
            "verifiedFiles": p_review_checks["fileCount"],
            "summary": read_json(P_REVIEW / "primary-summary.json"),
        },
        "blindReview": {
            "path": str(BLIND),
            "manifestSha256": sha_file(BLIND / "manifest.json"),
            "checksumManifestSha256": blind_checks["sha256sumsSha256"],
            "verifiedFiles": blind_checks["fileCount"],
            "summary": read_json(BLIND / "manifest.json"),
        },
        "sourcePin": {"head": actual_head, "tree": actual_tree, "statusPorcelain": porcelain},
        "priorAppliedTargetCount": p_manifest["priorAppliedTargetHashCount"],
        "priorHashOnlyHoldCount": p_manifest["priorHoldCount"],
        "priorSelectedSourceCount": p_manifest["priorSelectedSourceIdCount"],
        "previousCrossReviewGuide": {
            "path": str(ROOT / "seerrng-pr418-w3940-3959-cross-audit-20261104"),
            "manifestSha256": sha_file(ROOT / "seerrng-pr418-w3940-3959-cross-audit-20261104" / "manifest.json"),
            "summarySha256": sha_file(ROOT / "seerrng-pr418-w3940-3959-cross-audit-20261104" / "summary.json"),
            "appliedWordingExamples": [
                {"locale": "ar", "sourceId": "components.Settings.Notifications.NotificationsPushover.accessToken", "target": "رمز API للتطبيق"},
                {"locale": "zh-Hant", "sourceId": "components.Settings.Notifications.NotificationsWebhook.webhookUrl", "target": "Webhook URL"},
            ],
            "relatedTerminologyHoldPrecedent": "W3940-W3959 retained 24 hash-only Enable Agent cells at positions 3943 and 3957 because caller context did not define the product term.",
        },
    }
    after_path = OUT / "live-review-after.json"
    if after_path.exists():
        live_after = read_json(after_path)
        for field in ("state", "draft", "apiHead", "apiHeadRef", "apiBase", "apiBaseRef"):
            if live_after.get(field) != LIVE_BEFORE.get(field):
                raise ValueError(f"PR API state changed during cross review: {field}")
        input_attestation["liveApiAfter"] = live_after
        input_attestation["liveApiHeadAndBaseUnchanged"] = True
    write_json(OUT / "input-attestation.json", input_attestation)

    live_before_file = dict(LIVE_BEFORE)
    write_json(OUT / "live-review-before.json", live_before_file)
    write_json(OUT / "source-worktree-attestation.json", {
        "head": actual_head,
        "tree": actual_tree,
        "worktreeStatus": "CLEAN",
        "remoteRefs": remote_map,
        "branch": BRANCH,
        "baseSha": BASE_SHA,
        "sourceWorktree": str(SOURCE),
    })
    write_json(OUT / "summary.json", {
        "artifact": "SeerrNG PR #418 W3960-W3979 independent cross-review",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3960-W3979",
        "head": HEAD,
        "tree": TREE,
        "sourceCount": 20,
        "localeCount": 12,
        "cellCount": 240,
        "candidateCounts": {"primary": 8, "blind": 9, "combined": 17, "uniqueAffectedCells": 10},
        "crossDispositionCounts": {"KEEP_CURRENT": 218, "SELECT_UPDATE": 10, "HOLD_HASH_ONLY": 12},
        "selectedKindCounts": {"CORRECTION": 8, "REFINEMENT": 2},
        "proposalResolutionCounts": dict(Counter(row["crossDisposition"] for row in reconciled_candidates)),
        "holdPosition": 3979,
        "holdCellCount": 12,
        "holdCallerStatus": "verified caller exists; product term Agent remains undefined in the pinned UI/source context",
        "numericEquivalentsAccepted": ["3962::ja", "3970::ja", "3972::ja"],
        "selectedTargetTokenCheckFailures": 0,
        "baselineTokenDiagnostics": p_manifest["baselineTokenMismatchCounts"],
        "remainingNumericDiagnostics": "Three Japanese digit 1 targets are accepted semantic equivalents for one; all four Arabic protected ID omissions are corrected by selected targets.",
        "priorLineageCopiedByteIdentically": PROTECTED_PRIOR_FILES,
        "nativeSpeakerApproval": False,
        "browserAcceptance": False,
        "repositoryOrPrModified": False,
        "testsBuildsScansCI": False,
        "liveApiHeadAndBaseUnchanged": (OUT / "live-review-after.json").exists(),
    })

    readme = """# SeerrNG PR #418 W3960-W3979 independent cross-review

This cross packet independently reconciles the candidate-free input, primary review, blind review, exact English source, direct production callers, rendered settings context, locale conventions, and earlier approved/applied wording at pinned PR head `a456dd66aad34cb23f432cb3c189bb8083bbbe96` / tree `7a5447e5f08e84c392899a6e1400d1df73b1143b`.

## Dispositions

- 218 cells keep their current target.
- 10 cells select an update: 8 corrections and 2 refinements.
- 12 cells at position 3979 stay hash-only holds for `Enable Agent`. The source has a verified caller in the Web Push settings checkbox and route; the caller does not define the product meaning of Agent. This is a terminology hold, not a callerless hold, consistent with the W3940-W3959 cross-audit's 24 held `Enable Agent` cells.
- 17 primary and blind proposal texts were reconciled. The selected zh-Hant `Webhook URL` and Arabic `عنوان URL لخطاف الويب` match existing same-locale sibling labels for the identical English source phrase. The four Arabic protected `ID` omissions are fixed. Three Japanese digit `1` uses remain accepted semantic equivalents for “one.”

Selected values, current-value hashes, source and caller hashes, token checks, and per-cell rationales are in `selected-proposals.jsonl`. Every proposal candidate and why it was or was not selected is in `proposal-reconciliation.jsonl`. All 240 cell dispositions are in `cross-review-cells.jsonl`; `hash-only-holds.jsonl` contains hashes only for the 12 held values. Caller references and pinned code excerpts for affected sources are in `caller-context-audit.jsonl` and `caller-context-blocks.jsonl`.

The five historical lineage files are copied byte-identically under `prior-lineage/`. Input manifests, checksum digests, PR/API state, exact source ref pins, and the W3940-W3959 cross packet reference are recorded in `input-attestation.json`.

## Verification

Run the portable verifier from this directory:

```sh
python3 verify_cross_packet.py --source-worktree /mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source --primary-input /home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-primary-20261104/candidate-free-input --primary-review /home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-primary-20261104/primary-review --blind-packet /home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-blind-20261104
```

This AI cross-review does not claim native-speaker approval or exact-head browser acceptance. No repository or PR files were edited; no tests, builds, scans, CI, or browser work were run.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")

    # The builder is itself part of the reproducible output packet.
    output_files = sorted(path for path in OUT.rglob("*") if path.is_file() and path.name not in ("manifest.json", "SHA256SUMS.txt"))
    manifest = {
        "artifact": "SeerrNG PR #418 W3960-W3979 independent cross-review packet",
        "schemaVersion": 1,
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3960-W3979",
        "head": HEAD,
        "tree": TREE,
        "baseRef": "main",
        "baseSha": BASE_SHA,
        "branch": BRANCH,
        "cellCount": len(cells),
        "candidateCount": len(reconciled_candidates),
        "selectedCount": len(selected_rows),
        "holdCount": len(hold_rows),
        "keepCount": len(noop_rows),
        "fileHashes": {str(path.relative_to(OUT)): sha_file(path) for path in output_files},
        "inputAttestationSha256": sha_file(OUT / "input-attestation.json"),
    }
    write_json(OUT / "manifest.json", manifest)
    checksum_paths = sorted(path for path in OUT.rglob("*") if path.is_file() and path.name != "SHA256SUMS.txt")
    sums = "".join(f"{sha_file(path)}  {path.relative_to(OUT)}\n" for path in checksum_paths)
    (OUT / "SHA256SUMS.txt").write_text(sums, encoding="utf-8")
    print(json.dumps({
        "result": "BUILT",
        "output": str(OUT),
        "cells": len(cells),
        "candidateTexts": len(reconciled_candidates),
        "selected": len(selected_rows),
        "holds": len(hold_rows),
        "kept": len(noop_rows),
        "checksumFiles": len(checksum_paths),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        raise
