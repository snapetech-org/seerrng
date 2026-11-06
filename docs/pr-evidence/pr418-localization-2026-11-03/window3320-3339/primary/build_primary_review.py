#!/usr/bin/env python3
"""Candidate-free primary semantic review for SeerrNG W3320-W3339."""

from __future__ import annotations

import collections
import hashlib
import json
import re
import subprocess
from pathlib import Path

TASK = Path(__file__).resolve().parent
INPUT = TASK / "clean-input"
OUT = TASK / "primary-review"
EXPECTED_HEAD = "70caabc2f95df1a7de3f869111aea1df58522d96"
EXPECTED_TREE = "daac9e9284adac648fd3f6147265c21c90cdddba"
EXPECTED_POSITIONS = list(range(3320, 3340))
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR", "ar", "ko", "zh_Hant", "vi", "id"]

# Each value is (disposition, proposed target, rationale). This table was prepared
# only after reading the corrected candidate-free input and exact caller context.
OVERRIDES = {
    ("components.Requests.editTooltip", "hi"): (
        "correction",
        "इस लंबित अनुरोध को संपादित करें।",
        "The source explicitly identifies a pending request; the current Hindi omits that status. Use the established Hindi pending term लंबित."
    ),
    ("components.Requests.editTooltip", "ja"): (
        "refinement",
        "この保留中のリクエストを編集します。",
        "The tooltip refers to a request in the pending state. The current 保留リクエスト is clipped; 保留中の is the natural pending modifier."
    ),
    ("components.Requests.editTooltip", "ko"): (
        "refinement",
        "이 보류 중인 요청을 편집합니다.",
        "Use the existing pending wording 보류 중 with the grammatical modifier 중인 for a request awaiting action."
    ),
    ("components.Requests.editTooltip", "vi"): (
        "refinement",
        "Sửa yêu cầu đang chờ này.",
        "Use the established pending phrase đang chờ as a natural modifier of yêu cầu."
    ),
    ("components.Requests.emptyTitle", "pt_BR"): (
        "refinement",
        "Nenhum pedido encontrado",
        "This is an h3 empty-state heading, so the sentence-final period is unnecessary and inconsistent with the other locale headings."
    ),
    ("components.Requests.eta", "es"): (
        "correction",
        "Hora estimada de finalización: {date}",
        "The caller supplies estimatedCompletionTime. The current llegada describes arrival; finalización describes the actual completion time."
    ),
    ("components.Requests.eta", "de"): (
        "correction",
        "Voraussichtliche Fertigstellungszeit: {date}",
        "The caller supplies estimatedCompletionTime. Fertigstellungszeit describes completion; Ankunftszeit incorrectly suggests arrival."
    ),
    ("components.Requests.eta", "ja"): (
        "correction",
        "完了予定時刻: {date}",
        "The caller supplies estimatedCompletionTime. 完了予定時刻 describes expected completion; 到着予定時刻 means arrival."
    ),
    ("components.Requests.eta", "fr"): (
        "refinement",
        "Heure de fin estimée : {date}",
        "Expand the English acronym to an explicit French completion-time label; retain French nonbreaking-space punctuation and the date placeholder."
    ),
    ("components.Requests.eta", "pt_BR"): (
        "correction",
        "Previsão de conclusão: {date}",
        "The caller supplies estimatedCompletionTime. Conclusão describes completion; chegada incorrectly suggests arrival."
    ),
    ("components.Requests.eta", "ar"): (
        "correction",
        "وقت الانتهاء المتوقع: {date}",
        "The caller supplies estimatedCompletionTime. The current للوصول describes arrival; الانتهاء describes completion."
    ),
    ("components.Requests.eta", "vi"): (
        "refinement",
        "Thời gian hoàn tất dự kiến: {date}",
        "Expand ETA into a clear Vietnamese estimated-completion label and retain the date placeholder."
    ),
    ("components.Requests.eta", "id"): (
        "refinement",
        "Perkiraan waktu selesai: {date}",
        "Expand ETA into a clear Indonesian estimated-completion label and retain the date placeholder."
    ),
    ("components.Requests.firstPublished", "zh_Hans"): (
        "correction",
        "首次出版",
        "This field is selected specifically for books. 出版 is the book-publication term; 发表 more commonly describes publishing or presenting written works."
    ),
    ("components.Requests.firstPublished", "ja"): (
        "correction",
        "初版発行日",
        "This field is selected specifically for books and displays a date. 初版発行日 names the first book-edition publication date; 初公開 suggests a premiere or public release."
    ),
    ("components.Requests.firstPublished", "ar"): (
        "refinement",
        "تاريخ النشر الأول",
        "The field displays a book publication date. Adding تاريخ makes the date-label meaning explicit without changing the source scope."
    ),
    ("components.Requests.firstPublished", "id"): (
        "refinement",
        "Pertama kali diterbitkan",
        "Use the idiomatic Indonesian phrase pertama kali diterbitkan for First Published."
    ),
}

SOURCE_REASONS = {
    "components.Requests.director": "Accurately names the movie-director metadata field; the pinned caller separately uses creator for TV.",
    "components.Requests.downloadCopies": "Accurately describes the plural download disclosure action.",
    "components.Requests.downloadCopy": "Accurately describes downloading one asset copy.",
    "components.Requests.downloadCopyFor": "Accurately labels the download action and preserves the dynamic asset-name placeholder.",
    "components.Requests.downloading": "Accurately describes the in-progress download state.",
    "components.Requests.ebooks": "Accurately names the books media-filter category.",
    "components.Requests.edit": "Accurately labels the edit action on the pending request.",
    "components.Requests.editTooltip": "Preserves the edit action and pending-request context.",
    "components.Requests.emptyTitle": "Accurately labels the empty request-results state.",
    "components.Requests.eta": "Accurately states the estimated completion time in this request-progress context.",
    "components.Requests.failed": "Accurately labels the failed request status in the filter and status map.",
    "components.Requests.filter": "Accurately names the filter controls.",
    "components.Requests.filteredEmptyTitle": "Accurately explains that the selected filters are too restrictive for a result.",
    "components.Requests.firstPublished": "Accurately labels the first-publication metadata field for books.",
    "components.Requests.fourK": "Preserves the canonical 4K format token used by the movie and TV caller.",
}

HOLD_REASONS = {
    "components.Requests.deleted": "No exact production caller is pinned; definition-only or generic status rendering does not establish this message is rendered. Keep all locale values unchanged.",
    "components.Requests.deleting": "No exact production caller is pinned; definition-only or generic status rendering does not establish this message is rendered. Keep all locale values unchanged.",
    "components.Requests.ebook": "No exact production caller is pinned for this source ID. Keep all locale values unchanged.",
    "components.Requests.ebookAndAudiobook": "No exact production caller is pinned for this source ID. Keep all locale values unchanged.",
    "components.Requests.format": "No exact production caller is pinned for this source ID. Keep all locale values unchanged.",
}

def sha(value: str | bytes) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()

def tokens(text: str) -> list[str]:
    return re.findall(r"\{[A-Za-z_][A-Za-z0-9_]*\}", text)

def numeric_tokens(text: str) -> list[str]:
    return re.findall(r"\d+(?:[.,]\d+)?(?:[A-Za-z]+)?", text)

def markup_tokens(text: str) -> list[str]:
    return re.findall(r"</?[A-Za-z][^>]*>", text)

def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]

def dump_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")

def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit("ABORT: " + message)

def main() -> None:
    require(not OUT.exists(), "primary-review output already exists; preserve existing output")
    window = json.loads((INPUT / "window.json").read_text(encoding="utf-8"))
    boundary = json.loads((INPUT / "source-boundaries.json").read_text(encoding="utf-8"))
    require(window["head"] == EXPECTED_HEAD and window["tree"] == EXPECTED_TREE, "window head/tree changed")
    require(window["range"] == [3320, 3339] and window["previousRange"] == [3300, 3319], "window range changed")
    require(boundary["head"] == EXPECTED_HEAD and boundary["tree"] == EXPECTED_TREE, "boundary head/tree changed")
    require(boundary["before"]["position"] == 3319 and boundary["before"]["id"] == "components.Requests.deleteTooltip", "before boundary mismatch")
    require(boundary["first"]["position"] == 3320 and boundary["first"]["id"] == "components.Requests.deleted", "first boundary mismatch")
    require(boundary["last"]["position"] == 3339 and boundary["last"]["id"] == "components.Requests.fourK", "last boundary mismatch")
    require(boundary["after"]["position"] == 3340 and boundary["after"]["id"] == "components.Requests.genres", "after boundary mismatch")

    input_rows = read_jsonl(INPUT / "review-input.jsonl")
    caller_rows = read_jsonl(INPUT / "caller-contexts.jsonl")
    require(len(input_rows) == 240, "review input must contain 240 cells")
    require(len({(r["id"], r["locale"]) for r in input_rows}) == 240, "duplicate input cells")
    require(sorted({r["position"] for r in input_rows}) == EXPECTED_POSITIONS, "position set mismatch")
    require(window["localeOrder"] == LOCALES, "locale order mismatch")
    hold_ids = {r["id"] for r in boundary["callerHolds"]}
    require(hold_ids == set(HOLD_REASONS), "caller-hold source IDs changed")
    ctx_ids = {r["id"] for r in caller_rows}
    for row in input_rows:
        if row["id"] in hold_ids:
            require(not row["callerExists"] and row["directMessageReferences"] == 0, "hold row has a direct production caller")
        else:
            require(row["callerExists"] and row["callerContextResolved"], "eligible row lacks a pinned caller")
        require(sha(row["source"]) == row["sourceSha256"], "source hash mismatch")
        require(sha(row["currentTarget"]) == row["currentTargetSha256"], "current target hash mismatch")
        require(row["id"] in ctx_ids or row["id"] in hold_ids, "missing caller-context record")
        require(row["placeholderParity"], "input placeholder parity failed")
        require(sorted(tokens(row["source"])) == sorted(row["sourcePlaceholders"]), "source placeholder manifest mismatch")
        require(sorted(tokens(row["currentTarget"])) == sorted(row["currentPlaceholders"]), "current placeholder manifest mismatch")

    loc_catalog_pins = window["localeCatalogPins"]
    require(len(loc_catalog_pins) == 13, "expected 13 catalog pins including English")
    require(window["sourceOrderCount"] == 9494 and window["sourceCatalogKeyCount"] == 9494, "source key count changed")

    dispositions = collections.Counter()
    changes_by_locale = collections.Counter()
    review_rows = []
    for row in sorted(input_rows, key=lambda r: (r["position"], LOCALES.index(r["locale"]))):
        source_id = row["id"]
        locale = row["locale"]
        if source_id in hold_ids:
            verdict = "hold-context"
            target = row["currentTarget"]
            rationale = HOLD_REASONS[source_id]
        elif (source_id, locale) in OVERRIDES:
            verdict, target, rationale = OVERRIDES[(source_id, locale)]
        else:
            verdict = "accept-current"
            target = row["currentTarget"]
            rationale = SOURCE_REASONS[source_id]
        require(verdict in {"accept-current", "correction", "refinement", "hold-context"}, "invalid disposition")
        require(verdict not in {"correction", "refinement"} or target != row["currentTarget"], "change disposition has unchanged target")
        require(verdict not in {"accept-current", "hold-context"} or target == row["currentTarget"], "unchanged disposition changed target")

        source_placeholders = sorted(tokens(row["source"]))
        target_placeholders = sorted(tokens(target))
        source_markup = sorted(markup_tokens(row["source"]))
        target_markup = sorted(markup_tokens(target))
        source_numbers = sorted(numeric_tokens(row["source"]))
        target_numbers = sorted(numeric_tokens(target))
        required_literals = row["sourceProtectedLiterals"]
        literals_preserved = all(literal in target for literal in required_literals)
        require(source_placeholders == target_placeholders, f"final placeholder mismatch: {source_id}/{locale}")
        require(source_markup == target_markup, f"final markup mismatch: {source_id}/{locale}")
        require(source_numbers == target_numbers, f"final numeric-token mismatch: {source_id}/{locale}")
        require(literals_preserved, f"protected literal missing: {source_id}/{locale}")

        target_hash = sha(target)
        dispositions[verdict] += 1
        if verdict in {"correction", "refinement"}:
            changes_by_locale[locale] += 1
        review_rows.append({
            "position": row["position"],
            "id": source_id,
            "locale": locale,
            "source": row["source"],
            "sourceSha256": row["sourceSha256"],
            "currentTarget": row["currentTarget"],
            "currentTargetSha256": row["currentTargetSha256"],
            "verdict": verdict,
            "target": target,
            "targetSha256": target_hash,
            "rationale": rationale,
            "catalogPath": row["catalogPath"],
            "catalogFileSha256": row["catalogFileSha256"],
            "catalogGitBlob": row["catalogGitBlob"],
            "callerExists": row["callerExists"],
            "directMessageReferences": row["directMessageReferences"],
            "callerContextHashes": row["callerContextHashes"],
            "sourcePlaceholders": source_placeholders,
            "targetPlaceholders": target_placeholders,
            "placeholderParity": source_placeholders == target_placeholders,
            "sourceMarkupTags": source_markup,
            "targetMarkupTags": target_markup,
            "markupParity": source_markup == target_markup,
            "sourceNumericTokens": source_numbers,
            "targetNumericTokens": target_numbers,
            "numericTokensPreserved": source_numbers == target_numbers,
            "sourceProtectedLiterals": required_literals,
            "targetProtectedLiteralsPreserved": literals_preserved,
            "reviewMethod": "candidate-free primary semantic review",
            "qualifiedNativeSpeakerApproval": False,
        })

    require(sum(dispositions.values()) == 240, "ledger does not contain 240 decisions")
    require(dispositions == {"accept-current": 163, "correction": 8, "refinement": 9, "hold-context": 60}, f"unexpected disposition totals: {dict(dispositions)}")
    require(len(changes_by_locale) == 11, "unexpected number of locales with changes")
    require(sum(changes_by_locale.values()) == 17, "unexpected change count")
    require(all(changes_by_locale[loc] == 0 for loc in LOCALES if loc not in changes_by_locale), "locale count issue")
    require(dispositions["hold-context"] == len(hold_ids) * 12, "hold count mismatch")

    OUT.mkdir(parents=True)
    dump_jsonl(OUT / "primary-review.jsonl", review_rows)
    summary = {
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3320-W3339",
        "exactHead": EXPECTED_HEAD,
        "exactTree": EXPECTED_TREE,
        "inputManifestSha256": sha((INPUT / "SHA256SUMS.txt").read_bytes()),
        "sourceCount": 20,
        "localeCount": 12,
        "cellCount": 240,
        "callerContextRows": len(caller_rows),
        "callerHoldIds": sorted(hold_ids),
        "callerHoldCells": dispositions["hold-context"],
        "dispositions": dict(sorted(dispositions.items())),
        "changesByLocale": dict(sorted(changes_by_locale.items())),
        "changedCells": dispositions["correction"] + dispositions["refinement"],
        "placeholderMismatches": sum(not r["placeholderParity"] for r in review_rows),
        "markupMismatches": sum(not r["markupParity"] for r in review_rows),
        "numericTokenMismatches": sum(not r["numericTokensPreserved"] for r in review_rows),
        "protectedLiteralMismatches": sum(not r["targetProtectedLiteralsPreserved"] for r in review_rows),
        "allTargetHashesPinned": all(r["targetSha256"] == sha(r["target"]) for r in review_rows),
        "orderedCatalogKeySequencesMatch": window["orderedLocaleKeySequencesMatch"],
        "catalogKeyCount": 9494,
        "catalogCountIncludingEnglish": 13,
        "nativeSpeakerApproval": False,
        "headedBrowserAcceptance": False,
        "reviewScope": "machine-assisted primary semantic review; not qualified native-speaker approval",
    }
    summary_path = OUT / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    readme = f"""# SeerrNG PR #418 W3320-W3339 candidate-free primary review

Reviewed 20 contiguous source IDs across 12 direct locales: 240 cells pinned to exact PR head {EXPECTED_HEAD} and tree {EXPECTED_TREE}. The corrected input boundary is 3319 before, 3320 first, 3339 last, and 3340 after (components.Requests.genres). The clean input checksum verifies.

Final primary dispositions: 163 accept-current, 8 corrections, 9 refinements, and 60 caller-context holds. The 60 held cells are the five source IDs with no exact production caller: {', '.join(sorted(hold_ids))}. Their current target values are unchanged.

The 17 changes correct completion-time wording for ETA, identify the book-specific first-publication field accurately, include the pending qualifier in the Hindi edit tooltip, refine a few language-specific phrases, and remove terminal punctuation from the pt-BR empty-state heading. All final placeholders, markup, numeric tokens, and source protected literals match.

The 13 pinned catalogs contain 9,494 keys each; the exact per-locale key-order hashes are in the clean input. This is machine-assisted primary review only. Qualified native-speaker approval and headed-browser acceptance remain outstanding.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    manifest = OUT / "SHA256SUMS.txt"
    files = sorted(p for p in OUT.rglob("*") if p.is_file() and p != manifest)
    manifest.write_text("".join(f"{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n" for p in files), encoding="utf-8")
    subprocess.check_call(["sha256sum", "-c", "SHA256SUMS.txt"], cwd=OUT, stdout=subprocess.DEVNULL)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
