#!/usr/bin/env python3
from collections import Counter
from pathlib import Path
import hashlib
import json
import re
import sys

INPUT = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-primary-20261103/candidate-free-input")
OUT = Path(__file__).resolve().parent
USED_INPUTS = [
    "README.txt", "PR-attestation.json", "manifest.json", "window.json",
    "file-pins.json", "queue-status.json", "source-order.jsonl",
    "source-cells.jsonl", "current-target-cells.jsonl", "caller-contexts.jsonl",
    "caller-context-blocks.jsonl", "caller-resolution-findings.json",
]
PLACEHOLDER = re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
ICU_PLURAL = re.compile(r"\{\s*[A-Za-z][A-Za-z0-9_.]*\s*,\s*plural\s*,")
ICU_CATEGORY = re.compile(r"(?<![A-Za-z])(zero|one|two|few|many|other)\s*\{")
MARKUP = re.compile(r"</?[A-Za-z][^>]*>")
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
LOCALE_ORDER = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR",
                "ar", "ko", "zh_Hant", "vi", "id"]

# Decisions were made from the candidate-free source, exact caller context,
# and current target text only. No current-window primary suggestions were read.
REVIEWS = {
    ("es", 3646): ("refinement-needed", "moderate",
        "The paragraph is understandable, but its opening is a fragment and 'despliegue de división' is an awkward rendering of a split deployment.",
        "Los traslados se realizan dentro de una sola base de datos de BookshelfNG. Para consolidar una implementación antigua y separada, primero fusiona o importa su biblioteca en la instancia de BookshelfNG que conservarás y luego usa esta página para mover el formato seleccionado. Esta página no copia archivos ni registros de base de datos entre instancias distintas de BookshelfNG."),
    ("es", 3647): ("correction-needed", "high",
        "'Vía' means a way or route; it is not the filesystem path shown by this caller.",
        "Ruta del formato actual"),
    ("es", 3648): ("refinement-needed", "moderate",
        "'Carpeta de raíz' is understandable but unnatural; 'carpeta raíz' is the established term for a root folder.",
        "Mueva archivos de libros o audiolibros a otra carpeta raíz administrada por la instancia de BookshelfNG seleccionada."),
    ("es", 3649): ("correction-needed", "high",
        "'Carpeta raíz' omits the destination relationship from this field label.",
        "Carpeta raíz de destino"),
    ("es", 3650): ("correction-needed", "high",
        "'Sólo existen' says the folders exist; the source says that only accessible folders are available for selection.",
        "Solo están disponibles las carpetas raíz accesibles de esta instancia de BookshelfNG. BookshelfNG vuelve a comprobar los conflictos y el espacio en disco cuando se inicia el movimiento."),
    ("es", 3651): ("refinement-needed", "moderate",
        "'Carpeta de raíz' is understandable but less natural than the standard 'carpeta raíz.'",
        "Elija una carpeta raíz accesible"),
    ("zh_Hans", 3640): ("refinement-needed", "high",
        "Spaces before the Chinese full stops make the status sentence visibly ungrammatical.",
        "移动状态无法刷新。命令可能仍在运行中。"),
    ("zh_Hans", 3643): ("refinement-needed", "moderate",
        "'装入' is less natural than '加载' for a UI loading state.",
        "正在加载 Bookshelf 库…"),
    ("zh_Hans", 3657): ("refinement-needed", "moderate",
        "The ASCII semicolon and surrounding spacing are inconsistent with Chinese punctuation.",
        "缺少；将被跳过"),
    ("hi", 3643): ("correction-needed", "high",
        "'लोड Bookshelf पुस्तकालय...' has unnatural word order and does not read as a loading status.",
        "Bookshelf लाइब्रेरी लोड हो रही है…"),
    ("hi", 3644): ("refinement-needed", "moderate",
        "The wording shifts 'I want BookshelfNG to move these files' toward an impersonal need; make the confirmation intent explicit.",
        "मैंने इस पूर्वावलोकन की समीक्षा कर ली है; कृपया BookshelfNG से इन फ़ाइलों को स्थानांतरित करें।"),
    ("hi", 3645): ("correction-needed", "high",
        "'संघर्ष' commonly means struggle; it is not the clearest term for file/path conflicts.",
        "टकराव"),
    ("hi", 3656): ("correction-needed", "high",
        "The same 'संघर्ष' term is unclear for this file conflict status.",
        "टकराव"),
    ("hi", 3657): ("correction-needed", "moderate",
        "'अनुपलब्ध' means unavailable, which can imply access failure; this row specifically means the file was not found and will be skipped.",
        "नहीं मिला; इसे छोड़ दिया जाएगा"),
    ("de", 3649): ("correction-needed", "high",
        "'Zielordner' omits that the selectable destination is a root folder.",
        "Ziel-Stammordner"),
    ("de", 3652): ("refinement-needed", "moderate",
        "The generic phrase 'Migration Guide' remains in English even though this is a descriptive link label, not a product title.",
        "Lesen Sie den Bookshelf-Migrationsleitfaden"),
    ("de", 3658): ("refinement-needed", "moderate",
        "'Umzugsbereit' is usually used for moving residence; 'Bereit zum Verschieben' fits file movement.",
        "Bereit zum Verschieben"),
    ("ja", 3652): ("refinement-needed", "moderate",
        "'マイグレーション' is understandable technical jargon, but '移行' is the natural Japanese wording for this user-facing guide link.",
        "Bookshelf 移行ガイドを読む"),
    ("ja", 3658): ("correction-needed", "high",
        "'動く準備' reads as getting ready to move by itself; this status means the file is ready to be moved.",
        "移動準備完了"),
    ("fr", 3642): ("correction-needed", "high",
        "The target says the Bookshelf library itself failed to load; the source says its details could not be loaded.",
        "Les détails de la bibliothèque Bookshelf n'ont pas pu être chargés. Vérifiez la connexion au service et réessayez."),
    ("fr", 3646): ("refinement-needed", "moderate",
        "The opening 'Déplacement dans…' is a fragment where the source is a complete explanatory sentence.",
        "Les déplacements s'effectuent dans une seule base de données BookshelfNG. Pour regrouper un ancien déploiement séparé, fusionnez ou importez d'abord sa bibliothèque dans l'instance BookshelfNG que vous souhaitez conserver, puis utilisez cette page pour déplacer le format sélectionné. Cette page ne copie pas de fichiers ni d'enregistrements de base de données entre des instances BookshelfNG distinctes."),
    ("fr", 3650): ("correction-needed", "high",
        "'root' is left in English in a user-facing folder term; French uses 'dossier racine.'",
        "Seuls les dossiers racine accessibles de cette instance BookshelfNG sont disponibles. BookshelfNG vérifie à nouveau les conflits et l'espace disque au démarrage du déplacement."),
    ("fr", 3658): ("refinement-needed", "moderate",
        "'Bouger' is colloquial and less precise for moving a file than 'déplacer.'",
        "Prêt à être déplacé"),
    ("pt_BR", 3646): ("correction-needed", "high",
        "'Move-se' is reflexive and does not naturally express that file moves are performed within one database; the long paragraph also needs clearer sentence structure.",
        "As movimentações ocorrem dentro de um único banco de dados do BookshelfNG. Para consolidar uma implantação antiga dividida, primeiro mescle ou importe a biblioteca dela para a instância do BookshelfNG que você vai manter e, em seguida, use esta página para mover o formato selecionado. Esta página não copia arquivos nem registros de banco de dados entre instâncias distintas do BookshelfNG."),
    ("pt_BR", 3658): ("correction-needed", "moderate",
        "'Pronto para se mover' reads reflexively; the file is ready to be moved.",
        "Pronto para ser movido"),
    ("ar", 3645): ("correction-needed", "high",
        "'النزاعات' means disputes; the caller uses this as a section for file/path conflicts.",
        "التعارضات"),
    ("ar", 3656): ("correction-needed", "high",
        "'الصراع' means struggle/conflict in a broad sense; 'تعارض' is clearer for a file conflict status.",
        "تعارض"),
    ("ar", 3658): ("correction-needed", "moderate",
        "'جاهز للتحرك' suggests an entity ready to move itself; the file is ready for transfer.",
        "جاهز للنقل"),
    ("ko", 3648): ("correction-needed", "high",
        "The destination particle should mark movement to the folder ('로'); '폴더에 ... 이동합니다' is awkward for this action.",
        "선택한 BookshelfNG 인스턴스에서 관리하는 다른 루트 폴더로 책이나 오디오북 파일을 이동합니다."),
    ("zh_Hant", 3640): ("refinement-needed", "high",
        "Spaces before the Chinese full stops are incorrect typography in this sentence.",
        "移動狀態無法刷新。命令可能仍在執行中。"),
    ("zh_Hant", 3643): ("refinement-needed", "moderate",
        "'文庫' is uncommon in Traditional Chinese UI copy for an application library and is inconsistent with the neighboring '圖書庫' wording.",
        "正在載入 Bookshelf 圖書庫…"),
    ("zh_Hant", 3651): ("refinement-needed", "moderate",
        "'可用' means available; the source specifically says accessible. '可存取' is more precise for folder access.",
        "選擇可存取的根資料夾"),
    ("zh_Hant", 3652): ("correction-needed", "high",
        "'移動指南' means a guide about moving; in this Bookshelf path migration context, '移轉指南' conveys migration.",
        "閱讀 Bookshelf 移轉指南"),
    ("zh_Hant", 3657): ("refinement-needed", "moderate",
        "The ASCII semicolon and spaces are not appropriate Chinese punctuation.",
        "缺少；將跳過"),
    ("zh_Hant", 3658): ("refinement-needed", "moderate",
        "'已準備好' omits the action; this file status is specifically readiness to move.",
        "準備移動"),
    ("vi", 3658): ("refinement-needed", "moderate",
        "'Sẵn sàng' only says ready and omits what the file is ready for.",
        "Sẵn sàng để di chuyển"),
    ("id", 3647): ("refinement-needed", "moderate",
        "'Lokasi' means location; 'path' in this filesystem setting is more precisely 'jalur.'",
        "Jalur format saat ini"),
    ("id", 3658): ("correction-needed", "high",
        "'Siap untuk bergerak' suggests self-movement; the file is ready to be moved.",
        "Siap dipindahkan"),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def tokens(text):
    return {
        "placeholders": PLACEHOLDER.findall(text),
        "icuPluralCategories": sorted(set(ICU_CATEGORY.findall(text))) if ICU_PLURAL.search(text) else [],
        "markup": MARKUP.findall(text),
        "numeric": NUMBER.findall(text),
    }

def decision_for(locale, position):
    item = REVIEWS.get((locale, position))
    if item:
        status, confidence, rationale, proposal = item
        return status, confidence, rationale, proposal
    return ("accept-current", "moderate",
            "Reviewed against the English source and pinned BookshelfPathMigration caller; meaning and UI role are preserved.",
            None)

def build():
    if (OUT / "blind-ledger.jsonl").exists() or (OUT / "manifest.json").exists():
        raise SystemExit("Refusing to overwrite sealed output; use --verify.")
    packet_manifest = load_json(INPUT / "manifest.json")
    window = load_json(INPUT / "window.json")
    attestation = load_json(INPUT / "PR-attestation.json")
    load_json(INPUT / "file-pins.json")
    findings = load_json(INPUT / "caller-resolution-findings.json")
    sources = load_jsonl(INPUT / "source-cells.jsonl")
    targets = load_jsonl(INPUT / "current-target-cells.jsonl")
    callers = {x["position"]: x for x in load_jsonl(INPUT / "caller-contexts.jsonl")}
    blocks = load_jsonl(INPUT / "caller-context-blocks.jsonl")
    load_jsonl(INPUT / "source-order.jsonl")
    locale_info = {x["catalogKey"]: x for x in window["localeInfo"]}
    declared = {x["path"]: x["sha256"] for x in packet_manifest["files"]}
    declared.update({line.split(None, 1)[1].strip(): line.split(None, 1)[0] for line in (INPUT / "SHA256SUMS.txt").read_text().splitlines()})
    input_hashes = {}
    for name in USED_INPUTS:
        raw = (INPUT / name).read_bytes()
        actual = sha(raw)
        expected = declared.get(name)
        if expected is None or actual != expected:
            raise SystemExit(f"candidate-free input pin mismatch: {name}")
        input_hashes[name] = actual
    input_hashes["SHA256SUMS.txt"] = sha((INPUT / "SHA256SUMS.txt").read_bytes())

    if (attestation["state"], attestation["isDraft"], attestation["head"], attestation["tree"]) != (
        "OPEN", True, window["head"], window["tree"]
    ):
        raise SystemExit("PR attestation and window pin disagree")
    if (window["window"], window["range"], window["cellCount"]) != (
        "W3640-W3659", [3640, 3659], 240
    ):
        raise SystemExit("unexpected review window")
    if len(sources) != 20 or [x["position"] for x in sources] != list(range(3640, 3660)):
        raise SystemExit("source window is not 20 contiguous ranks")
    if len(targets) != 240 or findings["callerlessSourcePositions"]:
        raise SystemExit("target coverage or caller resolution is incomplete")
    if len({(x["position"], x["locale"]) for x in targets}) != 240:
        raise SystemExit("duplicate target cell")
    if len(REVIEWS) != 38:
        raise SystemExit(f"expected 38 non-accept dispositions, found {len(REVIEWS)}")
    if not all(position not in range(3640, 3660) for position in [3632]):
        raise SystemExit("a carried hold overlaps the current window")
    if set(locale_info) != set(LOCALE_ORDER):
        raise SystemExit("locale order does not match the pinned target set")
    if len(blocks) != 43:
        raise SystemExit("caller context block inventory changed")

    source_by_pos = {x["position"]: x for x in sources}
    target_by_key = {(x["position"], x["locale"]): x for x in targets}
    ledger = []
    for pos in range(3640, 3660):
        source = source_by_pos[pos]
        caller = callers.get(pos)
        if not caller or caller["callerCount"] < 1:
            raise SystemExit(f"missing direct caller context at position {pos}")
        if source["sourceSha256"] != sha(source["source"].encode("utf-8")):
            raise SystemExit(f"source hash mismatch at position {pos}")
        for locale in LOCALE_ORDER:
            target = target_by_key.get((pos, locale))
            if not target:
                raise SystemExit(f"missing target cell {pos}/{locale}")
            info = locale_info[locale]
            current = target["currentTarget"]
            if target["sourceId"] != source["sourceId"] or target["source"] != source["source"]:
                raise SystemExit(f"source identity mismatch at {pos}/{locale}")
            if target["currentTargetSha256"] != sha(current.encode("utf-8")):
                raise SystemExit(f"target hash mismatch at {pos}/{locale}")
            src_tokens = tokens(source["source"])
            dst_tokens = tokens(current)
            protected = source["sourceProtectedLiterals"]
            protected_ok = all(current.count(literal) == source["source"].count(literal) for literal in protected)
            check = {
                "placeholderTokens": {"source": src_tokens["placeholders"], "target": dst_tokens["placeholders"],
                                      "match": src_tokens["placeholders"] == dst_tokens["placeholders"]},
                "icuPluralCategories": {"source": src_tokens["icuPluralCategories"], "target": dst_tokens["icuPluralCategories"],
                                        "match": src_tokens["icuPluralCategories"] == dst_tokens["icuPluralCategories"]},
                "markupTokens": {"source": src_tokens["markup"], "target": dst_tokens["markup"],
                                 "match": src_tokens["markup"] == dst_tokens["markup"]},
                "numericTokens": {"source": src_tokens["numeric"], "target": dst_tokens["numeric"],
                                  "match": not src_tokens["numeric"] or src_tokens["numeric"] == dst_tokens["numeric"],
                                  "note": "No source digit literal requires preservation; localized numerals may render source number words." if not src_tokens["numeric"] and dst_tokens["numeric"] else None},
                "protectedLiterals": {"source": protected, "preserved": protected_ok,
                                      "match": protected_ok},
            }
            if not all(x["match"] for x in check.values()):
                raise SystemExit(f"structural token mismatch in {pos}/{locale}")
            input_checks = {
                "placeholderTokenMismatch": not check["placeholderTokens"]["match"],
                "placeholderTokenSequenceMismatch": not check["placeholderTokens"]["match"],
                "icuPluralCategorySetDifference": not check["icuPluralCategories"]["match"],
                "markupTokenMismatch": not check["markupTokens"]["match"],
                "numericTokenMismatch": not check["numericTokens"]["match"],
                "protectedLiteralMismatch": not check["protectedLiterals"]["match"],
            }
            for field, expected in input_checks.items():
                if bool(target[field]) != expected:
                    raise SystemExit(f"packet diagnostic mismatch: {pos}/{locale}/{field}")
            for field, expected_tokens in [
                ("currentTargetPlaceholders", dst_tokens["placeholders"]),
                ("currentTargetIcuPluralCategories", dst_tokens["icuPluralCategories"]),
                ("currentTargetMarkupTokens", dst_tokens["markup"]),
                ("currentTargetNumericTokens", dst_tokens["numeric"]),
            ]:
                if field == "currentTargetIcuPluralCategories" and not expected_tokens and target[field] == {}:
                    continue
                if field == "currentTargetNumericTokens" and not src_tokens["numeric"] and target[field] == []:
                    continue
                if target[field] != expected_tokens:
                    raise SystemExit(f"packet token metadata mismatch: {pos}/{locale}/{field}")
            if target["currentTargetProtectedLiterals"] != protected:
                raise SystemExit(f"packet protected-literal metadata mismatch: {pos}/{locale}")

            disposition, confidence, rationale, proposal = decision_for(locale, pos)
            ledger.append({
                "schemaVersion": 1,
                "repository": "snapetech-org/seerrng",
                "pullRequest": 418,
                "window": "W3640-W3659",
                "head": window["head"],
                "tree": window["tree"],
                "position": pos,
                "sourceId": source["sourceId"],
                "sourceKey": source["sourceKey"],
                "source": source["source"],
                "sourceSha256": source["sourceSha256"],
                "locale": locale,
                "localeTag": info["tag"],
                "currentTarget": current,
                "currentTargetSha256": target["currentTargetSha256"],
                "catalogPath": target["catalogPath"],
                "catalogGitBlob": target["catalogGitBlob"],
                "catalogSha256": target["catalogSha256"],
                "callerResolution": caller["callerResolution"],
                "callerCount": caller["callerCount"],
                "callerContextBlockIds": caller["contextBlockIds"],
                "callerContextSha256": sha(json_bytes(caller)),
                "disposition": disposition,
                "confidence": confidence,
                "rationale": rationale,
                "proposal": proposal,
                "technicalChecks": check,
            })

    counts = Counter(x["disposition"] for x in ledger)
    if counts != Counter({"accept-current": 202, "correction-needed": 19, "refinement-needed": 19}):
        raise SystemExit(f"unexpected disposition totals: {dict(counts)}")
    ledger_bytes = b"".join(json_bytes(x) + b"\n" for x in ledger)
    (OUT / "blind-ledger.jsonl").write_bytes(ledger_bytes)
    manifest = {
        "schemaVersion": 1,
        "artifact": "SeerrNG PR #418 independent blind primary localization ledger",
        "window": window["window"],
        "range": window["range"],
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "head": window["head"],
        "tree": window["tree"],
        "baseRef": window["baseRef"],
        "baseSha": window["baseSha"],
        "inputBoundary": str(INPUT),
        "inputHashesSha256": input_hashes,
        "sourceOrderCount": window["sourceOrderCount"],
        "sourceOrderSha256": window["sourceOrderSha256"],
        "selectedRanks": len(sources),
        "localeOrder": LOCALE_ORDER,
        "cellCount": len(ledger),
        "dispositionCounts": dict(sorted(counts.items())),
        "technicalCheckCounts": {
            "placeholderTokenMismatches": 0,
            "icuPluralCategoryMismatches": 0,
            "markupTokenMismatches": 0,
            "numericTokenMismatches": 0,
            "protectedLiteralMismatches": 0,
            "cellsPassingAllFiveChecks": len(ledger),
        },
        "callerReview": {
            "callerlessSourcePositions": findings["callerlessSourcePositions"],
            "directCallerCountBySourcePosition": {
                str(p): callers[p]["callerCount"] for p in sorted(callers)
            },
            "reviewedCallerContextBlocks": len(blocks),
        },
        "preservedPriorHolds": {
            "count": window["priorHoldCount"],
            "sourcePositions": [3632],
            "outsideCurrentRange": True,
            "currentWindowHolds": 0,
        },
        "blindness": {
            "reviewedInputs": "candidate-free-input only, plus Hindsight localization/conventions memory",
            "currentPrimaryReviewOrSuggestionsOpened": False,
            "reviewProcess": "Each current translation compared independently with its English source, pinned direct caller context, and technical token requirements.",
        },
        "limitations": [
            "This is a machine-assisted semantic and structural review, not qualified native-speaker approval.",
            "No catalog was changed and no suggestion from the current primary-review packet was read.",
        ],
        "sealedLedger": {
            "path": "blind-ledger.jsonl",
            "byteCount": len(ledger_bytes),
            "sha256": sha(ledger_bytes),
            "orderedCellIdsSha256": sha(json_bytes([f"{x['position']}:{x['locale']}" for x in ledger])),
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    readme = """# SeerrNG PR #418 blind primary review — W3640–W3659

This sealed ledger covers 20 contiguous English source entries × 12 locales = 240 current catalog cells. It is pinned to PR head 78efa0ef0410ebd8911026ecbbfe1f621d26770b and tree 749819bc888fc400bbb185fc9310043ab45c0d5c, as attested in candidate-free input.

The review used only candidate-free-input/ plus Hindsight localization/conventions memory. The current primary-review directory and its suggestions were not opened. The ledger records the exact source, current target and hash, pinned caller context, disposition, rationale, optional wording proposal, and independently checked placeholder, ICU, markup, numeric, and protected-literal tokens.

The previous 12 holds belong to rank 3632, outside this window; they remain outside this ledger and are recorded as preserved. The current window has direct caller context for all 20 source entries.

This is an independent semantic and structural review. It does not constitute qualified native-speaker approval. No repository or PR files were edited, and no translations were applied. No tests, builds, CI, browser work, or releases were run.
"""
    (OUT / "README.txt").write_text(readme, encoding="utf-8")
    sums_files = ["README.txt", "blind-ledger.jsonl", "manifest.json", Path(__file__).name]
    (OUT / "SHA256SUMS.txt").write_text(
        "".join(f"{sha((OUT / name).read_bytes())}  {name}\n" for name in sorted(sums_files)),
        encoding="utf-8",
    )
    verify()

def verify():
    manifest = load_json(OUT / "manifest.json")
    ledger = load_jsonl(OUT / "blind-ledger.jsonl")
    for name, expected in manifest["inputHashesSha256"].items():
        if sha((INPUT / name).read_bytes()) != expected:
            raise SystemExit(f"input changed after review: {name}")
    input_manifest = load_json(INPUT / "manifest.json")
    declared = {x["path"]: x["sha256"] for x in input_manifest["files"]}
    declared.update({line.split(None, 1)[1].strip(): line.split(None, 1)[0] for line in (INPUT / "SHA256SUMS.txt").read_text().splitlines()})
    for name, expected in manifest["inputHashesSha256"].items():
        if name != "SHA256SUMS.txt" and declared.get(name) != expected:
            raise SystemExit(f"input manifest pin mismatch: {name}")
    if (manifest["head"], manifest["tree"], manifest["cellCount"]) != (
        "78efa0ef0410ebd8911026ecbbfe1f621d26770b",
        "749819bc888fc400bbb185fc9310043ab45c0d5c",
        240,
    ):
        raise SystemExit("sealed head/tree/cell count mismatch")
    if len(ledger) != 240:
        raise SystemExit("ledger row count mismatch")
    cells = [(x["position"], x["locale"]) for x in ledger]
    expected_cells = [(p, loc) for p in range(3640, 3660) for loc in LOCALE_ORDER]
    if cells != expected_cells or len(set(cells)) != 240:
        raise SystemExit("ledger cell ordering or coverage mismatch")
    counts = Counter(x["disposition"] for x in ledger)
    if dict(sorted(counts.items())) != manifest["dispositionCounts"]:
        raise SystemExit("disposition summary mismatch")
    for row in ledger:
        if row["head"] != manifest["head"] or row["tree"] != manifest["tree"]:
            raise SystemExit("row head/tree mismatch")
        if sha(row["currentTarget"].encode("utf-8")) != row["currentTargetSha256"]:
            raise SystemExit(f"target hash mismatch: {row['position']}/{row['locale']}")
        if sha(row["source"].encode("utf-8")) != row["sourceSha256"]:
            raise SystemExit(f"source hash mismatch: {row['position']}/{row['locale']}")
        for check in row["technicalChecks"].values():
            if not check["match"]:
                raise SystemExit(f"technical check failed: {row['position']}/{row['locale']}")
        if row["disposition"] == "accept-current" and row["proposal"] is not None:
            raise SystemExit("accepted cell unexpectedly has a proposal")
        if row["disposition"] != "accept-current" and not row["proposal"]:
            raise SystemExit("flagged cell lacks proposed wording")
    if sha((OUT / "blind-ledger.jsonl").read_bytes()) != manifest["sealedLedger"]["sha256"]:
        raise SystemExit("sealed ledger hash mismatch")
    if sha(json_bytes([f"{x['position']}:{x['locale']}" for x in ledger])) != manifest["sealedLedger"]["orderedCellIdsSha256"]:
        raise SystemExit("ordered cell-id hash mismatch")
    sums = {}
    for line in (OUT / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        digest, name = line.split(None, 1)
        name = name.strip()
        if name in sums:
            raise SystemExit("duplicate output checksum entry")
        sums[name] = digest
    required = {"README.txt", "blind-ledger.jsonl", "manifest.json", Path(__file__).name}
    if set(sums) != required:
        raise SystemExit("output checksum inventory mismatch")
    for name, expected in sums.items():
        if sha((OUT / name).read_bytes()) != expected:
            raise SystemExit(f"output checksum failed: {name}")
    result = {
        "pass": True,
        "verification": "blind ledger, input pins, row order, cell hashes, token checks, and checksums",
        "head": manifest["head"],
        "tree": manifest["tree"],
        "cells": len(ledger),
        "dispositionCounts": dict(sorted(counts.items())),
        "allFiveTechnicalChecksPass": all(all(c["match"] for c in r["technicalChecks"].values()) for r in ledger),
        "ledgerSha256": manifest["sealedLedger"]["sha256"],
        "outputBytes": sum((OUT / name).stat().st_size for name in required | {"SHA256SUMS.txt"}),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    if sys.argv[1:] == ["--build"]:
        build()
    elif sys.argv[1:] in ([], ["--verify"]):
        verify()
    else:
        raise SystemExit("Usage: build_and_verify.py [--build|--verify]")

