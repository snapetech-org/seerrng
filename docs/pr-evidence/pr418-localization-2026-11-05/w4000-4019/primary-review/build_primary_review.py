#!/usr/bin/env python3
"""Seal a primary-only W4000-W4019 semantic review."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CF = ROOT.parent / "candidate-free-input"
HEAD = "ac193096ebfc0007183348b24e35bf6fee33f67a"
TREE = "93e71e7c52602ec3f8b76548fd12b2f5b4368b4c"
WINDOW = "W4000-W4019"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def shat(value):
    return sha(value.encode("utf-8"))


def j(path):
    return json.loads(path.read_text(encoding="utf-8"))


def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


PROPOSALS = {
    (4000, "es"): ("REFINEMENT", "Permitir variables de URL",
                   "Permitir is a natural verb for this enableable setting and keeps the meaning of supporting URL variables."),
    (4000, "hi"): ("CORRECTION", "URL चर का समर्थन",
                   "Reorders the words into natural Hindi while preserving the label's support-for-URL-variables meaning."),
    (4000, "ja"): ("CORRECTION", "URL 変数をサポート",
                   "The current value says URL parameters; this source specifically refers to variables."),
    (4000, "fr"): ("CORRECTION", "Prendre en charge les variables d’URL",
                    "Prendre en charge conveys supporting the variables; gérer instead suggests managing them."),
    (4000, "id"): ("CORRECTION", "Dukungan variabel URL",
                    "Replaces the unnatural word order with a natural Indonesian noun phrase for URL-variable support."),
    (4001, "ja"): ("CORRECTION", "利用可能な変数は Webhook テンプレート変数のセクションに記載されています。",
                    "The current Japanese omits 利 from 利用可能, leaving an incorrect form for available variables."),
    (4001, "ko"): ("CORRECTION", "사용 가능한 변수는 Webhook 템플릿 변수 섹션에 나와 있습니다.",
                    "The current passive form reads as a future documentation action; 나와 있습니다 states the information is listed there."),
    (4001, "id"): ("CORRECTION", "Variabel yang tersedia tercantum di bagian variabel template webhook.",
                    "Replaces daerah (area) with bagian (section) and gives a natural description of where the variables are listed."),
    (4002, "hi"): ("CORRECTION", "टेम्पलेट चर सहायता",
                    "चर is the appropriate Hindi term for a programming variable; परिवर्तनीय means changeable/convertible."),
    (4003, "ar"): ("CORRECTION", "فشل إرسال إشعار اختبار الـ Webhook.",
                    "Adds the missing hamza in إرسال and names the Webhook test notification explicitly."),
    (4004, "hi"): ("CORRECTION", "वेबहुक परीक्षण अधिसूचना भेजी जा रही है…",
                    "Changes the bare infinitive into a clear ongoing-send status, matching the English progressive."),
    (4004, "zh-Hant"): ("CORRECTION", "正在傳送 Webhook 測試通知…",
                         "Adds the standard in-progress construction and retains the Webhook test-notification meaning."),
    (4005, "ar"): ("CORRECTION", "تم إرسال إشعار اختبار الـ Webhook!",
                    "Restores the Webhook qualifier omitted by the current value and corrects إرسال spelling."),
    (4006, "vi"): ("CORRECTION", "Bạn phải cung cấp dữ liệu JSON hợp lệ.",
                    "Removes the ungrammatical count phrase một dữ liệu while preserving the valid JSON payload requirement."),
    (4006, "pt-BR"): ("REFINEMENT", "Você deve fornecer um payload JSON válido.",
                       "For this webhook request body, payload is the established technical term; fornecer is more idiomatic than prover."),
    (4007, "de"): ("CORRECTION", "Du musst mindestens einen Benachrichtigungstyp auswählen.",
                    "Uses the correct singular accusative form after mindestens einen."),
    (4007, "ko"): ("REFINEMENT", "알림 유형을 하나 이상 선택해야 합니다.",
                    "Removes the redundant combination of at least one and one or more while preserving the requirement."),
    (4008, "id"): ("REFINEMENT", "Anda harus memberikan URL yang valid.",
                    "Removes the awkward suatu and states the valid-URL requirement directly."),
    (4010, "es"): ("REFINEMENT", "La URL de prueba de notificación está configurada como {testUrl} en lugar de la URL real del webhook.",
                    "Uses real for actual so the sentence cannot be read as referring to the current webhook URL."),
    (4010, "pt-BR"): ("CORRECTION", "A URL da notificação de teste está definida como {testUrl}, em vez da URL real do webhook.",
                       "Corrects agreement with URL and uses real rather than atual, which can mean current."),
    (4010, "id"): ("CORRECTION", "URL notifikasi uji ditetapkan ke {testUrl}, bukan URL webhook yang sebenarnya.",
                    "Replaces the informal diset ke construction with standard Indonesian ditetapkan ke."),
    (4011, "hi"): ("CORRECTION", "वेबहुक अधिसूचना सेटिंग सहेजी नहीं जा सकीं।",
                    "States directly that the settings could not be saved and avoids the current masculine-agent construction."),
    (4012, "hi"): ("CORRECTION", "वेबहुक अधिसूचना सेटिंग्स सफलतापूर्वक सहेजी गईं!",
                    "Uses plural agreement for the settings and avoids the current singular/plural mismatch."),
    (4014, "ar"): ("CORRECTION", "السماح بالشهادات الموقعة ذاتيًا",
                    "Uses the established plural wording for self-signed certificates rather than personally signed certificates."),
    (4015, "ar"): ("CORRECTION", "كلمة مرور SMTP",
                    "Uses the natural Arabic word order for SMTP password."),
    (4017, "hi"): ("REFINEMENT", "बॉट प्राधिकरण टोकन",
                    "Keeps the authorization meaning while transliterating bot and token consistently in Hindi script."),
    (4017, "vi"): ("CORRECTION", "Token ủy quyền của bot",
                    "Uses token for the authorization credential; mã thông báo is more readily read as a notification code."),
    (4018, "ko"): ("CORRECTION", "Seerr에서 사용할 봇을 <CreateBotLink>만드세요</CreateBotLink>",
                    "Restores the direct create-a-bot instruction; the current text adds an unsupported statement of necessity."),
    (4018, "zh-Hant"): ("REFINEMENT", "<CreateBotLink>建立機器人</CreateBotLink>，以供 Seerr 使用",
                         "Keeps the clickable action together and uses a concise Traditional Chinese purpose clause."),
    (4018, "vi"): ("CORRECTION", "<CreateBotLink>Tạo bot</CreateBotLink> để dùng với Seerr",
                    "Uses bot rather than robot, which can refer to a physical machine in Vietnamese."),
    (4019, "es"): ("CORRECTION", "URL del avatar del bot",
                    "Uses natural Spanish noun order for the bot's avatar URL."),
    (4019, "pt-BR"): ("CORRECTION", "URL do avatar do bot",
                       "Uses natural Brazilian Portuguese noun order for the bot's avatar URL."),
    (4019, "ar"): ("CORRECTION", "عنوان URL للصورة الرمزية للبوت",
                    "Uses the Arabic term for avatar instead of the current word for a robot image."),
    (4019, "id"): ("CORRECTION", "URL avatar untuk bot",
                    "Adds the Indonesian preposition needed to make the avatar-URL label natural."),
}

HOLD_REASON = ("The shared Agent label appears in three notification providers, but none defines whether Agent is a named product feature "
               "or a generic service agent. Translating it would commit to an unsupported product meaning.")
HOLD_POS = 4013
SOURCE_SUMMARIES = {
    4000: "support for URL variables", 4001: "where webhook-template variables are documented", 4002: "help for template variables",
    4003: "a failed webhook test notification", 4004: "a webhook test notification being sent", 4005: "a sent webhook test notification",
    4006: "the required valid JSON payload", 4007: "the requirement to select at least one notification type",
    4008: "the requirement to provide a valid URL", 4009: "the webhook URL label",
    4010: "the test notification URL being set instead of the real webhook URL", 4011: "webhook notification settings failing to save",
    4012: "webhook notification settings saving successfully", 4013: "enabling an Agent", 4014: "allowing self-signed certificates",
    4015: "the SMTP password label", 4016: "the SMTP username label", 4017: "the bot authorization token label",
    4018: "creating a bot for use with Seerr", 4019: "the bot avatar URL label",
}


def main():
    manifest = j(CF / "manifest.json")
    if (manifest["head"], manifest["tree"], manifest["window"], manifest["cellCount"]) != (HEAD, TREE, WINDOW, 240):
        raise SystemExit("REFUSED: candidate-free input pin/type mismatch")
    sources = {row["position"]: row for row in jl(CF / "selected-source-cells.jsonl")}
    contexts = {row["sourceId"]: row for row in jl(CF / "caller-contexts.jsonl")}
    cells = {(row["position"], row["locale"]): row for row in jl(CF / "current-target-cells.jsonl")}
    if len(sources) != 20 or len(contexts) != 20 or len(cells) != 240:
        raise SystemExit("REFUSED: candidate-free input coverage mismatch")

    proposals, holds, ledger = [], [], []
    disposition_counts, locale_counts = collections.Counter(), {locale: collections.Counter() for locale in LOCALES}
    for position in range(4000, 4020):
        source = sources[position]
        caller = contexts[source["sourceId"]]
        for locale in LOCALES:
            cell = cells[(position, locale)]
            common = {
                "position": position, "locale": locale, "sourceIdSha256": source["sourceIdSha256"],
                "sourceTextSha256": source["sourceTextSha256"], "currentTargetSha256": cell["currentTargetSha256"],
                "callerContextSha256": caller["callerContextSha256"],
            }
            if position == HOLD_POS:
                row = {**common, "primaryDisposition": "HOLD", "holdCode": "PRODUCT_TERM_UNRESOLVED",
                       "holdReasonSha256": sha(HOLD_REASON.encode()), "confidence": "low", "hashOnly": True}
                allowed = {"position", "locale", "sourceIdSha256", "sourceTextSha256", "currentTargetSha256",
                           "callerContextSha256", "primaryDisposition", "holdCode", "holdReasonSha256", "confidence", "hashOnly"}
                if set(row) != allowed or any(key in row for key in ("sourceText", "currentTarget", "target", "proposedTarget")):
                    raise SystemExit("REFUSED: hold row is not hash-only")
                holds.append(row)
            else:
                row = {**common, "sourceId": source["sourceId"], "sourceText": source["sourceText"],
                       "currentTarget": cell["currentTarget"], "primaryDisposition": "ACCEPT_CURRENT",
                       "rationale": (f"The current {locale} wording conveys {SOURCE_SUMMARIES[position]} "
                                     "in the caller's notification-settings context."),
                       "confidence": "moderate", "currentTokenChecks": cell["tokenChecks"]}
                if position == 4007 and locale == "ja":
                    row["numericTokenAssessment"] = {
                        "sourceNumericTokens": [], "currentNumericTokens": ["1"], "meaningPreserved": True,
                        "explanation": "Japanese 1つ以上 means one or more; the numeral expresses the English word one without changing the threshold.",
                    }
                if (position, locale) in PROPOSALS:
                    disposition, target, rationale = PROPOSALS[(position, locale)]
                    source_tokens, target_tokens = source["sourceTokens"], cell["sourceTokens"]
                    del target_tokens
                    target_tokens = cell["sourceTokens"]
                    # Source token evidence is independent of the target cell's token field.
                    from_candidate_source = source["sourceTokens"]
                    proposal_token_values = {
                        "placeholders": __import__("re").findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", target),
                        "markupTags": __import__("re").findall(r"</?[A-Za-z][^>]*>", target),
                        "numericTokens": __import__("re").findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", target),
                        "protectedLiterals": list(dict.fromkeys(__import__("re").findall(
                            r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])", target))),
                    }
                    checks = {
                        "placeholders": from_candidate_source["placeholders"] == proposal_token_values["placeholders"],
                        "markupTags": from_candidate_source["markupTags"] == proposal_token_values["markupTags"],
                        "numericTokens": from_candidate_source["numericTokens"] == proposal_token_values["numericTokens"],
                        "protectedLiterals": all(value in proposal_token_values["protectedLiterals"]
                                                  for value in from_candidate_source["protectedLiterals"]),
                    }
                    if not all(checks.values()):
                        raise SystemExit(f"REFUSED: proposed target token mismatch at {(position, locale)}: {checks}")
                    row.update({"primaryDisposition": disposition, "rationale": rationale, "confidence": "moderate",
                                "proposedTarget": target, "proposedTargetSha256": shat(target), "proposalTokenChecks": checks})
                    proposals.append(row)
                elif any(not check["matches"] for check in cell["tokenChecks"].values()):
                    if not (position == 4007 and locale == "ja"):
                        raise SystemExit(f"REFUSED: unassessed current token mismatch at {(position, locale)}")
            ledger.append(row)
            disposition_counts[row["primaryDisposition"]] += 1
            locale_counts[locale][row["primaryDisposition"]] += 1

    if len(ledger) != 240 or len(proposals) != 34 or len(holds) != 12:
        raise SystemExit("REFUSED: primary coverage/proposal/hold count mismatch")
    if dict(disposition_counts) != {"ACCEPT_CURRENT": 194, "CORRECTION": 27, "HOLD": 12, "REFINEMENT": 7}:
        raise SystemExit("REFUSED: primary disposition totals differ: " + repr(dict(disposition_counts)))
    (ROOT / "primary-ledger.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in ledger), encoding="utf-8")
    (ROOT / "selected-proposals.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in proposals), encoding="utf-8")
    (ROOT / "hash-only-holds.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in holds), encoding="utf-8")
    cf_manifest_sha, cf_sums_sha = sha((CF / "manifest.json").read_bytes()), sha((CF / "SHA256SUMS.txt").read_bytes())
    summary = {
        "window": WINDOW, "head": HEAD, "tree": TREE, "cells": 240, "sourceIds": 20, "localeCount": len(LOCALES),
        "callerReferences": manifest["callerReferenceCount"], "priorSelectedSourceIds": manifest["priorSelectedSourceIdCount"],
        "priorAppliedTargetHashes": manifest["priorAppliedTargetHashCount"], "priorHashOnlyHolds": manifest["priorHoldCount"],
        "dispositionCounts": dict(disposition_counts), "proposalCount": len(proposals), "currentHashOnlyHolds": len(holds),
        "localeDispositionCounts": {locale: dict(counts) for locale, counts in locale_counts.items()},
        "baselineTokenMismatchCounts": manifest["baselineTokenMismatchCounts"],
        "acceptedJapaneseNumericEquivalent": {"position": 4007, "locale": "ja", "meaningPreserved": True},
        "unresolvedTerminologyHold": {"position": HOLD_POS, "cells": 12, "term": "Agent"},
        "blindPacketInspected": False, "crossReviewPerformed": False, "rootAdjudicationPerformed": False,
        "nativeSpeakerApproval": False, "browserAcceptance": False, "PRorCatalogEdits": False,
        "testsBuildsScansCI": False, "reviewMode": "primary semantic review only",
    }
    (ROOT / "primary-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "README.md").write_text(
        f"# SeerrNG PR #418 {WINDOW} primary review\n\n"
        f"This primary-only semantic review covers 20 source IDs × 12 locales (240 cells), pinned to `{HEAD}` / `{TREE}`. "
        f"The candidate-free input copy is `../candidate-free-input`; its manifest SHA-256 is `{cf_manifest_sha}` and its "
        f"checksum-manifest SHA-256 is `{cf_sums_sha}`.\n\n"
        f"Primary decisions: 194 accept current, 27 corrections, 7 refinements, and 12 hash-only holds. The holds are all "
        f"position 4013 (`Enable Agent`); three notification providers use the label without defining its product meaning.\n\n"
        "The Japanese `1つ以上` at position 4007 expresses “one or more”; its numeral is a meaning-preserving equivalent of the English word, "
        "so it is accepted with an explicit assessment despite the mechanical numeric-token diagnostic. Candidate-free diagnostics also record that mismatch.\n\n"
        "Proposed targets are checked for placeholders, markup, numeric tokens, and protected literals. This is a machine-assisted primary review; "
        "it does not claim native-speaker approval or browser acceptance. No catalog/PR changes, tests, builds, scans, or CI were performed. "
        "No blind output was inspected and no cross-review or root adjudication was performed.\n\n"
        "Verify with `python3 verify-primary.py --candidate-free ../candidate-free-input`. Checksums are in `SHA256SUMS.txt`.\n",
        encoding="utf-8",
    )
    files = sorted(path.name for path in ROOT.iterdir() if path.is_file() and path.name not in {"manifest.json", "SHA256SUMS.txt"})
    manifest_out = {
        "artifact": f"SeerrNG PR #418 {WINDOW} primary review", "schemaVersion": 1, "status": "SEALED",
        "reviewCompleted": True, "reviewMode": "primary semantic review only", "blindPacketInspected": False,
        "crossReviewPerformed": False, "rootAdjudicationPerformed": False, "repository": "snapetech-org/seerrng",
        "pullRequest": 418, "window": WINDOW, "head": HEAD, "tree": TREE,
        "candidateFreeInputPath": str(CF), "candidateFreeManifestSha256": cf_manifest_sha,
        "candidateFreeChecksumManifestSha256": cf_sums_sha, "cells": 240, "sourceIds": 20, "localeCount": 12,
        "primaryDispositionCounts": dict(disposition_counts), "proposalCount": len(proposals), "currentHashOnlyHolds": len(holds),
        "baselineTokenMismatchCounts": manifest["baselineTokenMismatchCounts"], "acceptedJapaneseNumericEquivalent": True,
        "nativeSpeakerApproval": False, "browserAcceptance": False, "PRorCatalogEdits": False,
        "testsBuildsScansCI": False, "fileNames": files,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest_out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sums = [f"{sha(path.read_bytes())}  {path.name}\n" for path in sorted(ROOT.iterdir())
            if path.is_file() and path.name != "SHA256SUMS.txt"]
    (ROOT / "SHA256SUMS.txt").write_text("".join(sums), encoding="utf-8")
    print(json.dumps({"result": "SEALED-PRIMARY-REVIEW", "window": WINDOW, "head": HEAD, "tree": TREE,
                      "cells": 240, "dispositionCounts": dict(disposition_counts), "proposals": len(proposals),
                      "hashOnlyHolds": len(holds), "candidateFreeManifestSha256": cf_manifest_sha,
                      "candidateFreeChecksumManifestSha256": cf_sums_sha, "blindPacketInspected": False,
                      "packetFiles": len(sums)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
