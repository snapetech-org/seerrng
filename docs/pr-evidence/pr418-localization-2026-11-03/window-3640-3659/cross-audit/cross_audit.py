#!/usr/bin/env python3
from collections import Counter
from pathlib import Path
import hashlib
import json
import re
import sys

PRIMARY = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-primary-20261103/primary-review")
BLIND = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-blind-primary-20261103")
OUT = Path(__file__).resolve().parent
HEAD = "78efa0ef0410ebd8911026ecbbfe1f621d26770b"
TREE = "749819bc888fc400bbb185fc9310043ab45c0d5c"
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR",
           "ar", "ko", "zh_Hant", "vi", "id"]
DIGITS = re.compile(r"[0-9]+(?:[.,][0-9]+)*")

# Resolution values are cross-audit judgments, not catalog edits. Proposal side
# names refer only to the sealed primary and blind packets.
RESOLUTIONS = {
    ("3640", "es"): ("refinement-needed", "primary", "Meaning is preserved, but the passive phrasing and funcionar wording are awkward for a command that may still be executing."),
    ("3640", "zh_Hans"): ("refinement-needed", "blind", "The spaces before Chinese punctuation are a clear typography defect; the remaining wording is understandable."),
    ("3640", "hi"): ("refinement-needed", "primary", "The code-mixed status label is understandable, but a Hindi rendering is clearer."),
    ("3640", "fr"): ("correction-needed", "primary", "Renouveler means renew; the status refresh operation is mistranslated."),
    ("3640", "pt_BR"): ("refinement-needed", "primary", "The current text is understandable; em execução expresses a command still running more precisely than funcionando."),
    ("3640", "zh_Hant"): ("refinement-needed", "blind", "The spaces before Chinese punctuation are incorrect; the status meaning is retained."),
    ("3640", "id"): ("refinement-needed", "primary", "Status pindah is an awkward noun phrase; pemindahan is clearer."),
    ("3641", "es"): ("refinement-needed", "primary", "Medios is broad in this file-migration result; naming the media files improves precision."),
    ("3641", "de"): ("refinement-needed", "primary", "Medienumzug can suggest a household move; Verschieben better fits the file operation."),
    ("3641", "fr"): ("refinement-needed", "primary", "Déménagement often refers to moving house; déplacement is more precise for files."),
    ("3641", "pt_BR"): ("refinement-needed", "primary", "Movimento da mídia is a literal, awkward phrase; movimentação dos arquivos is clearer."),
    ("3641", "ko"): ("accept-current", "current", "The caller supplies the file-move context; 미디어 이동 accurately reports the completed move."),
    ("3641", "id"): ("refinement-needed", "primary", "Berkas media makes the moved files explicit; the current media wording is still understandable."),
    ("3642", "fr"): ("correction-needed", "blind", "The current target says the library itself failed to load, while the source says its details could not be loaded."),
    ("3643", "es"): ("refinement-needed", "primary", "Sentence case and the natural de Bookshelf construction improve this loading label."),
    ("3643", "zh_Hans"): ("refinement-needed", "blind", "装入 is understandable but less idiomatic than 加载 for a UI loading state."),
    ("3643", "fr"): ("refinement-needed", "primary", "Use the standard ellipsis glyph used by the source and other loading labels."),
    ("3643", "pt_BR"): ("refinement-needed", "primary", "Adding the article and standard ellipsis makes this loading label more natural."),
    ("3643", "zh_Hant"): ("refinement-needed", "blind", "圖書庫 is clearer and consistent with the nearby library-details term; use the standard ellipsis."),
    ("3644", "hi"): ("refinement-needed", "blind", "The current checkbox text signals consent, but makes the user's desire less explicit; the proposal states the confirmation directly."),
    ("3644", "de"): ("refinement-needed", "primary", "Bewegen is understandable, but verschieben is the precise file-operation verb."),
    ("3644", "ja"): ("refinement-needed", "primary", "指示します is stronger than the source's want; the proposal preserves the checkbox's requested intent."),
    ("3645", "hi"): ("refinement-needed", "blind", "संघर्ष can mean conflict but has a struggle connotation; टकराव is clearer for file/path collisions."),
    ("3645", "ar"): ("refinement-needed", "blind", "النزاعات can mean disputes; التعارضات is more precise for file/path conflicts."),
    ("3646", "es"): ("refinement-needed", "blind", "The opening is a fragment and despliegue de división is awkward; the same-database constraint is otherwise clear."),
    ("3646", "fr"): ("refinement-needed", "blind", "The opening is a fragment; the remaining paragraph preserves the one-database boundary."),
    ("3646", "pt_BR"): ("correction-needed", "blind", "Move-se is reflexive and fails to express that the file moves run inside one database."),
    ("3647", "es"): ("correction-needed", "primary", "Vía is not the natural filesystem-path label; ruta is the standard term."),
    ("3648", "es"): ("refinement-needed", "blind", "Carpeta raíz is more idiomatic than carpeta de raíz; the destination meaning remains clear."),
    ("3648", "pt_BR"): ("refinement-needed", "primary", "The infinitive is understandable, but the imperative matches the source's user instruction more directly."),
    ("3648", "ar"): ("refinement-needed", "primary", "نسخة may suggest a copy or edition; مثيل better identifies the selected application instance."),
    ("3648", "ko"): ("correction-needed", "blind", "The destination needs the directional particle 로; 에 is awkward with 이동하다 here."),
    ("3649", "de"): ("correction-needed", "blind", "Zielordner omits the root-folder constraint that differentiates this selectable location."),
    ("3649", "vi"): ("correction-needed", "primary", "The current label omits root and adds an unsupported colon."),
    ("3649", "id"): ("refinement-needed", "primary", "Folder root is an English mix; folder akar is clearer Indonesian wording."),
    ("3650", "es"): ("correction-needed", "blind", "Sólo existen changes available folders into folders that exist; availability is the source meaning."),
    ("3650", "de"): ("refinement-needed", "primary", "Umzug can suggest a household move; Verschiebung is more precise for files."),
    ("3650", "fr"): ("correction-needed", "primary", "Root is untranslated in a user-facing folder term; use dossiers racine."),
    ("3650", "pt_BR"): ("refinement-needed", "primary", "Mudança is ambiguous between change and movement; movimentação is clearer for the file operation."),
    ("3650", "ar"): ("refinement-needed", "primary", "نسخة may suggest a copy or edition; مثيل better identifies a running service instance."),
    ("3650", "id"): ("refinement-needed", "primary", "Folder root is an English mix; folder akar is clearer Indonesian wording."),
    ("3651", "es"): ("refinement-needed", "primary", "Carpeta raíz is the natural compound for a root folder."),
    ("3651", "zh_Hant"): ("refinement-needed", "blind", "可存取 is more precise than 可用 for an access-controlled folder picker."),
    ("3651", "id"): ("refinement-needed", "primary", "Folder root is an English mix; folder akar is clearer Indonesian wording."),
    ("3652", "de"): ("refinement-needed", "blind", "Migration Guide is a generic link label, not a product title, so it should be translated."),
    ("3652", "ja"): ("refinement-needed", "primary", "移行 is more natural Japanese user-facing wording than the technical loanword マイグレーション."),
    ("3652", "zh_Hant"): ("correction-needed", "blind", "移動指南 means a guide about moving; 移轉指南 conveys migration in this path-migration context."),
    ("3654", "es"): ("refinement-needed", "primary", "Naming the media files is more precise than medios; the current failure meaning is intact."),
    ("3654", "de"): ("refinement-needed", "primary", "Umzug der Medien can suggest moving house; Verschieben der Mediendateien is precise."),
    ("3654", "id"): ("accept-current", "current", "Ini is a harmless contextual demonstrative here; the failure report remains accurate."),
    ("3656", "hi"): ("refinement-needed", "blind", "टकराव is clearer than संघर्ष for a file/path collision status."),
    ("3657", "zh_Hans"): ("refinement-needed", "blind", "The defect is Chinese punctuation; 缺少 remains a valid missing-file status."),
    ("3657", "hi"): ("correction-needed", "primary", "अनुपलब्ध can imply inaccessible; this status is a missing file that will be skipped."),
    ("3657", "zh_Hant"): ("refinement-needed", "blind", "The defect is Chinese punctuation; 缺少 remains a valid missing-file status."),
    ("3658", "es"): ("correction-needed", "custom", "Listo para moverse suggests self-movement; the file status should say it is ready to be moved."),
    ("3658", "de"): ("refinement-needed", "blind", "Umzugsbereit often describes a person moving house; Verschieben is clearer for files."),
    ("3658", "ja"): ("correction-needed", "blind", "動く準備 reads as preparing to move oneself; this file status means ready for movement."),
    ("3658", "fr"): ("refinement-needed", "primary", "Bouger is colloquial and less precise than déplacer for a file."),
    ("3658", "zh_Hant"): ("refinement-needed", "blind", "The current text omits the move action; 準備移動 restores it."),
}

PROPOSAL_ONLY = {
    ("3642", "fr"): ("blind", "Two equivalent corrections; the blind proposal preserves the source meaning and reads naturally."),
    ("3643", "zh_Hant"): ("blind", "The blind proposal uses a clearer Traditional Chinese library term and the standard ellipsis."),
    ("3646", "pt_BR"): ("blind", "Both corrections preserve the database boundary; this version keeps a complete, explicit sequence of steps."),
    ("3647", "es"): ("primary", "Both proposals correct vía; Ruta actual del formato is the more concise label."),
    ("3650", "es"): ("blind", "Both proposals repair availability; this wording keeps the availability distinction explicit."),
    ("3650", "fr"): ("primary", "Both proposals localize root and the move; this wording uses dossiers racine and déplacement."),
    ("3652", "ja"): ("primary", "Both proposals use 移行; the particle の makes the Bookshelf guide relation explicit."),
    ("3657", "hi"): ("primary", "The primary proposal makes the missing file explicit and keeps feminine agreement."),
    ("3658", "ja"): ("blind", "移動準備完了 preserves readiness to move more directly than 移動可能."),
    ("3658", "zh_Hant"): ("blind", "準備移動 preserves readiness and the move action more directly than 可移動."),
}

# Keep same-disposition proposal differences out of the decision-adjudication map.
for _key in PROPOSAL_ONLY:
    RESOLUTIONS.pop(_key, None)

CUSTOM_PROPOSALS = {
    ("3658", "es"): "Listo para ser trasladado",
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def verify_sums(folder):
    sums_path = folder / "SHA256SUMS.txt"
    sums = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split(None, 1)
        name = name.strip()
        if name in sums:
            raise SystemExit(f"duplicate checksum in {folder}: {name}")
        sums[name] = digest
    if not sums:
        raise SystemExit(f"empty checksum file: {folder}")
    for name, digest in sums.items():
        target = folder / name
        if not target.is_file() or sha(target.read_bytes()) != digest:
            raise SystemExit(f"packet checksum failure: {folder}/{name}")
    return sums

def load_packets():
    primary_sums = verify_sums(PRIMARY)
    blind_sums = verify_sums(BLIND)
    pm = read_json(PRIMARY / "manifest.json")
    bm = read_json(BLIND / "manifest.json")
    ps = read_json(PRIMARY / "summary.json")
    primary_rows = read_jsonl(PRIMARY / "primary-ledger.jsonl")
    blind_rows = read_jsonl(BLIND / "blind-ledger.jsonl")
    iv = (PRIMARY / "input-verification.txt").read_text(encoding="utf-8")
    brace = iv.find("{")
    input_verification = json.loads(iv[brace:]) if brace >= 0 else {}
    return primary_sums, blind_sums, pm, bm, ps, primary_rows, blind_rows, input_verification

def normalize_primary(value):
    return {"correction": "correction-needed", "refinement": "refinement-needed",
            "accept-current": "accept-current"}[value]

def build():
    if (OUT / "cross-audit-ledger.jsonl").exists() or (OUT / "manifest.json").exists():
        raise SystemExit("Refusing to overwrite the sealed cross-audit.")
    (p_sums, b_sums, pm, bm, ps, prows, brows, input_verification) = load_packets()
    if (pm.get("sealed") is not True or pm.get("head"), pm.get("tree")) != (HEAD, TREE):
        raise SystemExit("primary packet seal or head/tree mismatch")
    if (bm["head"], bm["tree"]) != (HEAD, TREE):
        raise SystemExit("blind packet head/tree mismatch")
    if (pm["cellCount"], bm["cellCount"], len(prows), len(brows)) != (240, 240, 240, 240):
        raise SystemExit("packet cell counts do not agree")
    p_by = {(x["position"], x["locale"]): x for x in prows}
    b_by = {(x["position"], x["locale"]): x for x in brows}
    expected_keys = {(position, locale) for position in range(3640, 3660) for locale in LOCALES}
    if set(p_by) != expected_keys or set(b_by) != expected_keys:
        raise SystemExit("primary or blind cell inventory differs from the 240-cell window")
    input_manifest_hash = bm["inputHashesSha256"]["manifest.json"]
    input_sums_hash = bm["inputHashesSha256"]["SHA256SUMS.txt"]
    if pm["inputManifestSha256"] != input_manifest_hash or pm["inputChecksumListSha256"] != input_sums_hash:
        raise SystemExit("primary and blind packets do not share the same candidate-free input")
    if input_verification.get("result") != "PASS" or input_verification.get("priorHoldsReattested") != 12:
        raise SystemExit("primary packet input verification or prior-hold attestation failed")
    if ps.get("holdCount") != 0 or ps.get("callerlessCellCount") != 0:
        raise SystemExit("primary window hold/caller state is unexpected")
    preserved = bm["preservedPriorHolds"]
    if (preserved["count"], preserved["sourcePositions"], preserved["outsideCurrentRange"], preserved["currentWindowHolds"]) != (12, [3632], True, 0):
        raise SystemExit("blind packet prior-hold preservation record is inconsistent")
    if not (3632 < 3640):
        raise SystemExit("prior holds overlap the current window")
    if len(RESOLUTIONS) != 49 or len(PROPOSAL_ONLY) != 10:
        raise SystemExit(f"cross-audit resolution table has {len(RESOLUTIONS)} decision entries and {len(PROPOSAL_ONLY)} proposal entries")
    matrix = Counter()
    disagreements = set()
    proposal_only = set()
    ledger = []
    protected_cells = 0
    protected_sources = set()
    numeric_observations = []
    input_checks = Counter()
    for key in sorted(expected_keys, key=lambda x: (x[0], LOCALES.index(x[1]))):
        p = p_by[key]
        b = b_by[key]
        p_decision = normalize_primary(p["decision"])
        b_decision = b["disposition"]
        matrix[(p_decision, b_decision)] += 1
        if (p["head"], p["tree"], b["head"], b["tree"]) != (HEAD, TREE, HEAD, TREE):
            raise SystemExit(f"row head/tree mismatch: {key}")
        identities = [
            ("sourceId", p["sourceId"], b["sourceId"]),
            ("source", p["source"], b["source"]),
            ("sourceSha256", p["sourceSha256"], b["sourceSha256"]),
            ("currentTarget", p["currentTarget"], b["currentTarget"]),
            ("currentTargetSha256", p["currentTargetSha256"], b["currentTargetSha256"]),
            ("catalogPath", p["catalogPath"], b["catalogPath"]),
            ("catalogGitBlob", p["catalogGitBlob"], b["catalogGitBlob"]),
            ("catalogSha256", p["catalogSha256"], b["catalogSha256"]),
            ("callerContextSha256", p["callerContextSha256"], b["callerContextSha256"]),
            ("callerResolution", p["callerResolution"], b["callerResolution"]),
            ("localeTag", p["localeTag"], b["localeTag"]),
        ]
        for name, pv, bv in identities:
            if pv != bv:
                raise SystemExit(f"primary/blind {name} mismatch at {key}")
        reviewed_target = p["proposedTarget"] if p["decision"] in ("correction", "refinement") else p["currentTarget"]
        if p["reviewedTargetSha256"] != sha(reviewed_target.encode("utf-8")):
            raise SystemExit(f"primary reviewed-target hash failed at {key}")
        if p["sourceSha256"] != sha(p["source"].encode("utf-8")) or b["sourceSha256"] != p["sourceSha256"]:
            raise SystemExit(f"source hash check failed at {key}")
        if p["currentTargetSha256"] != sha(p["currentTarget"].encode("utf-8")):
            raise SystemExit(f"target hash check failed at {key}")
        if p["callerless"] or p["directCallerCount"] < 1 or b["callerCount"] < 1:
            raise SystemExit(f"caller binding failed at {key}")

        checks = {
            "placeholderTokens": p["tokenAudit"]["placeholderFormatterSequencePreserved"] and
                b["technicalChecks"]["placeholderTokens"]["match"],
            "icuCategories": p["tokenAudit"]["sourceAndReviewedPluralCategoryMapsEqual"] and
                p["tokenAudit"]["runtimePluralCategoriesCovered"] and
                b["technicalChecks"]["icuPluralCategories"]["match"],
            "markupTokens": p["tokenAudit"]["markupPreserved"] and
                b["technicalChecks"]["markupTokens"]["match"],
            "numericValues": p["tokenAudit"]["reviewedNumericValuesMatchSource"] and
                not p["numericTokenMismatch"] and b["technicalChecks"]["numericTokens"]["match"],
            "protectedLiterals": not p["protectedLiteralMismatch"] and
                b["technicalChecks"]["protectedLiterals"]["match"],
        }
        if not all(checks.values()):
            raise SystemExit(f"technical token check failed at {key}: {checks}")
        for field in ["placeholderTokenMismatch", "placeholderTokenSequenceMismatch",
                      "icuPluralCategorySetDifference", "markupTokenMismatch",
                      "numericTokenMismatch", "protectedLiteralMismatch"]:
            if p[field]:
                raise SystemExit(f"primary packet technical mismatch at {key}: {field}")
            input_checks[field] += 1
        required_literals = p["sourceProtectedLiterals"]
        target_text = p["currentTarget"]
        for literal in required_literals:
            if target_text.count(literal) != p["source"].count(literal):
                raise SystemExit(f"protected literal count differs at {key}: {literal}")
        if required_literals:
            protected_cells += 1
            protected_sources.add(p["position"])
        target_digits = DIGITS.findall(target_text)
        source_digits = DIGITS.findall(p["source"])
        numeric_surface = None
        if target_digits or source_digits:
            if (p["position"], p["locale"]) != (3646, "ja"):
                raise SystemExit(f"unreviewed numeric-surface observation at {key}")
            if source_digits or target_digits != ["1"]:
                raise SystemExit("Japanese numeric surface does not match the audited one/1 case")
            if p["tokenAudit"]["reviewedNumericTokenSurfaceMatchesSource"] is not False:
                raise SystemExit("primary packet did not mark the Japanese surface difference")
            numeric_surface = {
                "sourceDigitLiterals": [],
                "targetDigitLiterals": ["1"],
                "sourceNumberWord": "one",
                "targetForm": "1つ",
                "numericValuePreserved": True,
                "requiresTranslationCorrection": False,
                "reason": "Japanese commonly writes this quantity as 1つ; the English source spells out one and contains no protected digit literal.",
            }
            numeric_observations.append(numeric_surface)

        primary_proposal = p.get("proposedTarget")
        blind_proposal = b.get("proposal")
        same_disposition = p_decision == b_decision
        same_proposal = primary_proposal == blind_proposal
        if not same_disposition or not same_proposal:
            disagreements.add(key)
        if same_disposition and not same_proposal:
            proposal_only.add(key)
        override = RESOLUTIONS.get((str(key[0]), key[1]))
        proposal_override = PROPOSAL_ONLY.get((str(key[0]), key[1]))
        if override:
            final_decision, proposal_source, rationale = override
            cross_resolution = "decision-adjudicated"
        elif proposal_override:
            final_decision = p_decision
            proposal_source, rationale = proposal_override
            cross_resolution = "proposal-adjudicated"
        else:
            if not same_disposition or not same_proposal:
                raise SystemExit(f"unresolved primary/blind disagreement: {key}")
            final_decision = p_decision
            proposal_source = "primary-and-blind"
            rationale = "Primary and blind reviews agree on the exact disposition and proposed wording."
            cross_resolution = "confirmed"
        if final_decision == "accept-current":
            final_proposal = None
        elif proposal_source == "primary":
            final_proposal = primary_proposal
        elif proposal_source == "blind":
            final_proposal = blind_proposal
        elif proposal_source == "current":
            final_proposal = None
        elif proposal_source == "custom":
            final_proposal = CUSTOM_PROPOSALS[(str(key[0]), key[1])]
        elif proposal_source == "primary-and-blind":
            final_proposal = primary_proposal
        else:
            raise SystemExit(f"unknown proposal source at {key}: {proposal_source}")
        if final_decision != "accept-current" and not final_proposal:
            raise SystemExit(f"cross-audit proposal missing at {key}")

        row = {
            "schemaVersion": 1,
            "repository": "snapetech-org/seerrng",
            "pullRequest": 418,
            "window": "W3640-W3659",
            "head": HEAD,
            "tree": TREE,
            "position": key[0],
            "sourceId": p["sourceId"],
            "source": p["source"],
            "sourceSha256": p["sourceSha256"],
            "locale": key[1],
            "localeTag": p["localeTag"],
            "currentTarget": p["currentTarget"],
            "currentTargetSha256": p["currentTargetSha256"],
            "catalogPath": p["catalogPath"],
            "catalogGitBlob": p["catalogGitBlob"],
            "catalogSha256": p["catalogSha256"],
            "callerContextSha256": p["callerContextSha256"],
            "callerResolution": p["callerResolution"],
            "primaryDecision": p_decision,
            "primaryProposal": primary_proposal,
            "primaryConfidence": p["confidence"],
            "blindDisposition": b_decision,
            "blindProposal": blind_proposal,
            "blindConfidence": b["confidence"],
            "crossResolution": cross_resolution,
            "reconciledDisposition": final_decision,
            "reconciledProposal": final_proposal,
            "proposalSelectedFrom": proposal_source,
            "crossRationale": rationale,
            "targetNumericSurfaceObservation": numeric_surface,
            "technicalChecks": checks,
        }
        ledger.append(row)
    if len(ledger) != 240 or len(disagreements) != 59 or len(proposal_only) != 10:
        raise SystemExit(f"unexpected reconciliation inventory: cells={len(ledger)}, disagreements={len(disagreements)}, proposalOnly={len(proposal_only)}")
    if set(RESOLUTIONS) & set(PROPOSAL_ONLY):
        raise SystemExit("resolution tables overlap")
    if { (int(pos), loc) for pos, loc in RESOLUTIONS } | { (int(pos), loc) for pos, loc in PROPOSAL_ONLY } != disagreements:
        raise SystemExit("manual resolutions do not exactly cover every difference")
    final_counts = Counter(x["reconciledDisposition"] for x in ledger)
    if final_counts != Counter({"accept-current": 175, "correction-needed": 19, "refinement-needed": 46}):
        raise SystemExit(f"unexpected reconciled totals: {dict(final_counts)}")
    if protected_cells != 72 or protected_sources != {3641, 3644, 3646, 3648, 3650, 3654}:
        raise SystemExit(f"protected literal coverage mismatch: {protected_cells}, {sorted(protected_sources)}")
    if len(numeric_observations) != 1:
        raise SystemExit("expected exactly one Japanese numeric surface observation")

    primary_packet_hashes = {name: sha((PRIMARY / name).read_bytes()) for name in p_sums}
    blind_packet_hashes = {name: sha((BLIND / name).read_bytes()) for name in b_sums}
    matrix_json = {
        f"{p} | {b}": n for (p, b), n in sorted(matrix.items())
    }
    ledger_bytes = b"".join(canonical(x) + b"\n" for x in ledger)
    (OUT / "cross-audit-ledger.jsonl").write_bytes(ledger_bytes)
    manifest = {
        "schemaVersion": 1,
        "artifact": "SeerrNG PR #418 W3640-W3659 independent primary/blind cross-audit",
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3640-W3659",
        "range": [3640, 3659],
        "head": HEAD,
        "tree": TREE,
        "primaryPacket": {
            "path": str(PRIMARY),
            "ledgerSha256": pm["files"][3]["sha256"] if pm["files"][3]["path"] == "primary-ledger.jsonl" else next(x["sha256"] for x in pm["files"] if x["path"] == "primary-ledger.jsonl"),
            "packetChecksums": primary_packet_hashes,
            "decisionCounts": pm["decisionCounts"],
            "checksumVerification": "PASS",
            "verifier": "PASS",
        },
        "blindPacket": {
            "path": str(BLIND),
            "ledgerSha256": bm["sealedLedger"]["sha256"],
            "packetChecksums": blind_packet_hashes,
            "decisionCounts": bm["dispositionCounts"],
            "checksumVerification": "PASS",
            "verifier": "PASS",
        },
        "sharedInputPins": {
            "candidateFreeManifestSha256": input_manifest_hash,
            "candidateFreeChecksumListSha256": input_sums_hash,
            "samePinnedHeadTree": True,
        },
        "cellReconciliation": {
            "cells": len(ledger),
            "sharedSourceTargetCallerCatalogPins": "240/240 exact",
            "exactPrimaryBlindDispositionAndProposalAgreement": 181,
            "decisionDisagreementsAdjudicated": 49,
            "sameDispositionProposalDifferencesAdjudicated": 10,
            "decisionMatrix": matrix_json,
            "reconciledDispositionCounts": dict(sorted(final_counts.items())),
            "crossResolutionCounts": dict(sorted(Counter(x["crossResolution"] for x in ledger).items())),
        },
        "technicalChecks": {
            "placeholderMismatches": 0,
            "placeholderSequenceMismatches": 0,
            "icuPluralCategoryMismatches": 0,
            "icuRuntimeCoverage": "PASS",
            "markupMismatches": 0,
            "numericValueMismatches": 0,
            "numericSurfaceObservations": numeric_observations,
            "protectedLiteralMismatches": 0,
            "protectedLiteralCells": protected_cells,
            "protectedLiteralSourcePositions": sorted(protected_sources),
        },
        "priorHoldPreservation": {
            "priorHoldsReattestedByPrimaryInputVerifier": 12,
            "priorHoldsRecordedByBlindPacket": 12,
            "priorHoldSourcePositions": [3632],
            "outsideCurrentWindow": True,
            "currentWindowHolds": 0,
        },
        "nativeSpeakerReview": "not performed; no native-speaker approval claimed",
        "applicationStatus": "cross-audit evidence only; no catalog/repository/PR mutation",
        "sealedLedger": {
            "path": "cross-audit-ledger.jsonl",
            "byteCount": len(ledger_bytes),
            "sha256": sha(ledger_bytes),
            "orderedCellIdsSha256": sha(canonical([f'{x["position"]}:{x["locale"]}' for x in ledger])),
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    readme = """# SeerrNG PR #418 W3640–W3659 independent cross-audit

This sealed cross-audit reconciles the verified primary and blind review packets for all 240 source/locale cells at head 78efa0ef0410ebd8911026ecbbfe1f621d26770b and tree 749819bc888fc400bbb185fc9310043ab45c0d5c.

Both packet checksum inventories and their independent verifiers passed before their ledgers were read. The cell source, current target, target hash, catalog pins, and caller-context hash agree exactly in all 240 rows. The cross-audit records both reviewers' dispositions and proposals, the reconciled disposition, and the selected proposal for every row.

There were 49 disposition disagreements and 10 same-disposition proposal differences. Reconciled counts are 175 accept-current, 19 correction-needed, and 46 refinement-needed. All 72 cells that contain the protected literal BookshelfNG preserve it exactly.

The sole numeric surface difference is Japanese 1つ for the English number word one in the paragraph about one BookshelfNG database. The source contains no digit literal, and the value one is preserved; this is not a numeric-value mismatch or a correction request. Twelve predecessor holds at rank 3632 were reattested and remain outside this window; no current-window cells are held.

This artifact does not apply any translation. It does not claim qualified native-speaker approval. No repository or PR files were edited, and no tests, builds, CI, browser work, or releases were run.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    sums_files = ["README.md", "cross-audit-ledger.jsonl", "manifest.json", Path(__file__).name]
    (OUT / "SHA256SUMS.txt").write_text(
        "".join(f"{sha((OUT / name).read_bytes())}  {name}\n" for name in sorted(sums_files)),
        encoding="utf-8",
    )
    verify()

def verify():
    p_sums, b_sums, pm, bm, ps, prows, brows, iv = load_packets()
    p_by = {(x["position"], x["locale"]): x for x in prows}
    b_by = {(x["position"], x["locale"]): x for x in brows}
    manifest = read_json(OUT / "manifest.json")
    ledger = read_jsonl(OUT / "cross-audit-ledger.jsonl")
    expected_keys = {(pos, loc) for pos in range(3640, 3660) for loc in LOCALES}
    if set(p_by) != expected_keys or set(b_by) != expected_keys or len(ledger) != 240:
        raise SystemExit("packet or cross-audit cell inventory mismatch")
    if (manifest["head"], manifest["tree"], manifest["cellReconciliation"]["cells"]) != (HEAD, TREE, 240):
        raise SystemExit("cross-audit manifest pin mismatch")
    if (pm.get("head"), pm.get("tree"), bm.get("head"), bm.get("tree")) != (HEAD, TREE, HEAD, TREE):
        raise SystemExit("input packet head/tree mismatch")
    if pm.get("sealed") is not True or pm.get("cellCount") != 240 or bm.get("cellCount") != 240:
        raise SystemExit("input packet seal/cell count mismatch")
    if sha((OUT / "cross-audit-ledger.jsonl").read_bytes()) != manifest["sealedLedger"]["sha256"]:
        raise SystemExit("cross-audit ledger seal mismatch")
    if manifest["sealedLedger"]["byteCount"] != (OUT / "cross-audit-ledger.jsonl").stat().st_size:
        raise SystemExit("cross-audit ledger byte-count mismatch")
    if sha(canonical([f'{x["position"]}:{x["locale"]}' for x in ledger])) != manifest["sealedLedger"]["orderedCellIdsSha256"]:
        raise SystemExit("cross-audit cell-order hash mismatch")
    if manifest["primaryPacket"]["packetChecksums"] != {n: sha((PRIMARY / n).read_bytes()) for n in p_sums}:
        raise SystemExit("primary packet checksum pins differ from manifest")
    if manifest["blindPacket"]["packetChecksums"] != {n: sha((BLIND / n).read_bytes()) for n in b_sums}:
        raise SystemExit("blind packet checksum pins differ from manifest")
    if manifest["primaryPacket"]["decisionCounts"] != pm["decisionCounts"]:
        raise SystemExit("primary packet decision counts differ from manifest")
    if manifest["blindPacket"]["decisionCounts"] != bm["dispositionCounts"]:
        raise SystemExit("blind packet decision counts differ from manifest")
    if manifest["sharedInputPins"]["candidateFreeManifestSha256"] != bm["inputHashesSha256"]["manifest.json"]:
        raise SystemExit("candidate-free input manifest hash mismatch")
    if manifest["sharedInputPins"]["candidateFreeChecksumListSha256"] != bm["inputHashesSha256"]["SHA256SUMS.txt"]:
        raise SystemExit("candidate-free input checksum-list hash mismatch")
    if pm["inputManifestSha256"] != bm["inputHashesSha256"]["manifest.json"] or pm["inputChecksumListSha256"] != bm["inputHashesSha256"]["SHA256SUMS.txt"]:
        raise SystemExit("primary/blind input pins do not match")
    if iv.get("result") != "PASS" or iv.get("priorHoldsReattested") != 12:
        raise SystemExit("primary input verification or predecessor hold reattestation failed")
    prior = bm["preservedPriorHolds"]
    if (prior["count"], prior["sourcePositions"], prior["outsideCurrentRange"], prior["currentWindowHolds"]) != (12, [3632], True, 0):
        raise SystemExit("blind predecessor hold record mismatch")
    if ps.get("holdCount") != 0 or ps.get("callerlessCellCount") != 0:
        raise SystemExit("primary current-window hold/caller count mismatch")

    matrix = Counter()
    dispositions = Counter()
    resolutions = Counter()
    differences = set()
    decision_differences = set()
    proposal_differences = set()
    protected_cells = 0
    protected_positions = set()
    numeric_observations = []
    expected_rows = sorted(expected_keys, key=lambda k: (k[0], LOCALES.index(k[1])))
    if [(x["position"], x["locale"]) for x in ledger] != expected_rows:
        raise SystemExit("cross-audit row order mismatch")
    for row in ledger:
        key = (row["position"], row["locale"])
        p, b = p_by[key], b_by[key]
        p_decision = normalize_primary(p["decision"])
        b_decision = b["disposition"]
        matrix[(p_decision, b_decision)] += 1
        same_decision = p_decision == b_decision
        same_proposal = p.get("proposedTarget") == b.get("proposal")
        if not (same_decision and same_proposal):
            differences.add(key)
        if not same_decision:
            decision_differences.add(key)
        elif not same_proposal:
            proposal_differences.add(key)

        if (row["head"], row["tree"], row["position"], row["locale"]) != (HEAD, TREE, key[0], key[1]):
            raise SystemExit(f"row candidate pin mismatch at {key}")
        for field in ("sourceId", "source", "sourceSha256", "currentTarget",
                      "currentTargetSha256", "catalogPath", "catalogGitBlob",
                      "catalogSha256", "callerContextSha256", "callerResolution", "localeTag"):
            if row[field] != p[field] or row[field] != b[field]:
                raise SystemExit(f"packet/cross-audit {field} mismatch at {key}")
        if sha(p["source"].encode("utf-8")) != p["sourceSha256"] or sha(p["currentTarget"].encode("utf-8")) != p["currentTargetSha256"]:
            raise SystemExit(f"source/current-target hash mismatch at {key}")
        reviewed = p["proposedTarget"] if p["decision"] in ("correction", "refinement") else p["currentTarget"]
        if p["reviewedTargetSha256"] != sha(reviewed.encode("utf-8")):
            raise SystemExit(f"primary reviewed-target hash mismatch at {key}")
        if p["callerless"] or p["directCallerCount"] < 1 or b["callerCount"] < 1:
            raise SystemExit(f"caller binding missing at {key}")
        if row["primaryDecision"] != p_decision or row["primaryProposal"] != p.get("proposedTarget"):
            raise SystemExit(f"primary decision/proposal mismatch at {key}")
        if row["blindDisposition"] != b_decision or row["blindProposal"] != b.get("proposal"):
            raise SystemExit(f"blind disposition/proposal mismatch at {key}")

        checks = {
            "placeholderTokens": p["tokenAudit"]["placeholderFormatterSequencePreserved"] and b["technicalChecks"]["placeholderTokens"]["match"],
            "icuCategories": p["tokenAudit"]["sourceAndReviewedPluralCategoryMapsEqual"] and p["tokenAudit"]["runtimePluralCategoriesCovered"] and b["technicalChecks"]["icuPluralCategories"]["match"],
            "markupTokens": p["tokenAudit"]["markupPreserved"] and b["technicalChecks"]["markupTokens"]["match"],
            "numericValues": p["tokenAudit"]["reviewedNumericValuesMatchSource"] and not p["numericTokenMismatch"] and b["technicalChecks"]["numericTokens"]["match"],
            "protectedLiterals": not p["protectedLiteralMismatch"] and b["technicalChecks"]["protectedLiterals"]["match"],
        }
        if row["technicalChecks"] != checks or not all(checks.values()):
            raise SystemExit(f"technical token check mismatch at {key}")
        for field in ("placeholderTokenMismatch", "placeholderTokenSequenceMismatch",
                      "icuPluralCategorySetDifference", "markupTokenMismatch",
                      "numericTokenMismatch", "protectedLiteralMismatch"):
            if p[field]:
                raise SystemExit(f"primary technical mismatch at {key}: {field}")
        required_literals = p["sourceProtectedLiterals"]
        for literal in required_literals:
            if p["source"].count(literal) != p["currentTarget"].count(literal):
                raise SystemExit(f"protected literal count mismatch at {key}: {literal}")
        if required_literals:
            protected_cells += 1
            protected_positions.add(key[0])

        digits_source = DIGITS.findall(p["source"])
        digits_target = DIGITS.findall(p["currentTarget"])
        expected_numeric = None
        if digits_source or digits_target:
            if key != (3646, "ja") or digits_source or digits_target != ["1"]:
                raise SystemExit(f"unexpected numeric-surface observation at {key}")
            if p["tokenAudit"]["reviewedNumericTokenSurfaceMatchesSource"] is not False:
                raise SystemExit("Japanese numeric surface observation not marked by primary review")
            expected_numeric = {
                "sourceDigitLiterals": [], "targetDigitLiterals": ["1"],
                "sourceNumberWord": "one", "targetForm": "1\u3064",
                "numericValuePreserved": True, "requiresTranslationCorrection": False,
                "reason": "Japanese commonly writes this quantity as 1つ; the English source spells out one and contains no protected digit literal.",
            }
            numeric_observations.append(expected_numeric)
        if row["targetNumericSurfaceObservation"] != expected_numeric:
            raise SystemExit(f"numeric-surface row mismatch at {key}")

        keystr = (str(key[0]), key[1])
        if keystr in RESOLUTIONS:
            final_decision, proposal_source, rationale = RESOLUTIONS[keystr]
            resolution = "decision-adjudicated"
        elif keystr in PROPOSAL_ONLY:
            if not same_decision:
                raise SystemExit(f"proposal-only adjudication has a decision conflict at {key}")
            final_decision = p_decision
            proposal_source, rationale = PROPOSAL_ONLY[keystr]
            resolution = "proposal-adjudicated"
        else:
            if not same_decision or not same_proposal:
                raise SystemExit(f"unresolved packet disagreement at {key}")
            final_decision, proposal_source = p_decision, "primary-and-blind"
            rationale = "Primary and blind reviews agree on the exact disposition and proposed wording."
            resolution = "confirmed"
        if final_decision == "accept-current":
            final_proposal = None
        elif proposal_source == "primary":
            final_proposal = p.get("proposedTarget")
        elif proposal_source == "blind":
            final_proposal = b.get("proposal")
        elif proposal_source == "custom":
            final_proposal = CUSTOM_PROPOSALS[keystr]
        elif proposal_source in ("current", "primary-and-blind"):
            final_proposal = None if proposal_source == "current" else p.get("proposedTarget")
        else:
            raise SystemExit(f"invalid proposal source at {key}: {proposal_source}")
        if (row["crossResolution"], row["reconciledDisposition"], row["reconciledProposal"],
            row["proposalSelectedFrom"], row["crossRationale"]) != (
            resolution, final_decision, final_proposal, proposal_source, rationale
        ):
            raise SystemExit(f"cross-audit adjudication mismatch at {key}")
        dispositions[final_decision] += 1
        resolutions[resolution] += 1

    if len(differences) != 59 or len(decision_differences) != 49 or len(proposal_differences) != 10:
        raise SystemExit("packet agreement/disagreement counts do not match")
    if set(RESOLUTIONS) != {(str(p), l) for p, l in decision_differences}:
        raise SystemExit("decision-adjudication table does not exactly cover disposition conflicts")
    if set(PROPOSAL_ONLY) != {(str(p), l) for p, l in proposal_differences}:
        raise SystemExit("proposal-adjudication table does not exactly cover same-disposition wording differences")
    if dispositions != Counter({"accept-current": 175, "correction-needed": 19, "refinement-needed": 46}):
        raise SystemExit("unexpected reconciled disposition counts")
    if protected_cells != 72 or protected_positions != {3641, 3644, 3646, 3648, 3650, 3654}:
        raise SystemExit("protected-literal cell inventory mismatch")
    if len(numeric_observations) != 1 or manifest["technicalChecks"]["numericSurfaceObservations"] != numeric_observations:
        raise SystemExit("numeric-surface observation mismatch")
    if manifest["cellReconciliation"]["decisionMatrix"] != {f"{p} | {b}": n for (p, b), n in sorted(matrix.items())}:
        raise SystemExit("decision matrix mismatch")
    expected_summary = {
        "exactPrimaryBlindDispositionAndProposalAgreement": 181,
        "decisionDisagreementsAdjudicated": 49,
        "sameDispositionProposalDifferencesAdjudicated": 10,
        "reconciledDispositionCounts": dict(sorted(dispositions.items())),
        "crossResolutionCounts": dict(sorted(resolutions.items())),
    }
    for field, expected in expected_summary.items():
        if manifest["cellReconciliation"][field] != expected:
            raise SystemExit(f"manifest reconciliation summary mismatch: {field}")
    if manifest["technicalChecks"]["protectedLiteralCells"] != 72 or manifest["technicalChecks"]["protectedLiteralSourcePositions"] != sorted(protected_positions):
        raise SystemExit("manifest protected-literal summary mismatch")
    if any(manifest["technicalChecks"][k] != 0 for k in (
        "placeholderMismatches", "placeholderSequenceMismatches", "icuPluralCategoryMismatches",
        "markupMismatches", "numericValueMismatches", "protectedLiteralMismatches"
    )) or manifest["technicalChecks"]["icuRuntimeCoverage"] != "PASS":
        raise SystemExit("manifest technical-check summary mismatch")
    if manifest["priorHoldPreservation"] != {
        "priorHoldsReattestedByPrimaryInputVerifier": 12,
        "priorHoldsRecordedByBlindPacket": prior["count"],
        "priorHoldSourcePositions": prior["sourcePositions"],
        "outsideCurrentWindow": prior["outsideCurrentRange"],
        "currentWindowHolds": prior["currentWindowHolds"],
    }:
        raise SystemExit("manifest prior-hold preservation mismatch")
    if manifest["nativeSpeakerReview"] != "not performed; no native-speaker approval claimed":
        raise SystemExit("native-speaker status mismatch")

    sums = {}
    for line in (OUT / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        digest, name = line.split(None, 1)
        name = name.strip()
        if name in sums:
            raise SystemExit("duplicate cross-audit checksum entry")
        sums[name] = digest
    required = {"README.md", "cross-audit-ledger.jsonl", "manifest.json", Path(__file__).name}
    if set(sums) != required:
        raise SystemExit("cross-audit checksum inventory mismatch")
    for name, digest in sums.items():
        if sha((OUT / name).read_bytes()) != digest:
            raise SystemExit(f"cross-audit output checksum failure: {name}")
    print(json.dumps({
        "pass": True,
        "verifier": "packet checksum inventories, exact packet-to-ledger pins, dispositions/proposals, technical checks, holds, and sealed outputs",
        "head": HEAD, "tree": TREE, "cells": len(ledger),
        "exactAgreement": 181, "dispositionDisagreements": 49,
        "proposalOnlyDisagreements": 10,
        "reconciledDispositionCounts": dict(sorted(dispositions.items())),
        "protectedLiteralCells": protected_cells,
        "numericSurfaceObservations": len(numeric_observations),
        "priorHoldsReattested": 12,
        "ledgerSha256": manifest["sealedLedger"]["sha256"],
        "outputBytes": sum((OUT / name).stat().st_size for name in required | {"SHA256SUMS.txt"}),
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    if sys.argv[1:] == ["--build"]:
        build()
    elif sys.argv[1:] in ([], ["--verify"]):
        verify()
    else:
        raise SystemExit("Usage: cross_audit.py [--build|--verify]")

