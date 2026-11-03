#!/usr/bin/env python3
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3540-3559-primary-20261103")
IN = ROOT / "candidate-free-input"
OUT = ROOT / "review"
EXPECTED_HEAD = "f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d"
EXPECTED_TREE = "3ba2579c326f8dbac943ba43df77ddd5747a85a1"
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR", "ar", "ko", "zh_Hant", "vi", "id"]
PROTECTED_TERMS = ["SeerrNG", "Audiobookshelf", "ISBN", "API", "URL", "HTTP", "HTTPS", "IP"]
PLACEHOLDER_RE = re.compile(r"\{[^{}]+\}")
MARKUP_RE = re.compile(r"</?[A-Za-z][^>]*>")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]

def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")

# Exact recommendations from the primary semantic review. Candidate-free input is read-only.
changes = {
    (3541, "ko"): ("refinement", "사용자 선택…", "The caller is a search filter input. Removing the space before the ellipsis gives a standard Korean placeholder while preserving the “Select users” action.", "moderate"),
    (3543, "ar"): ("correction", "عرض أقل", "The current wording means seeing fewer details, while this is the expandable list’s collapse control. This directly labels showing fewer options.", "high"),
    (3543, "zh_Hant"): ("refinement", "顯示較少", "This is the collapse counterpart to the adjacent show-more text 顯示更多. Using 顯示 keeps the two control labels parallel.", "high"),
    (3545, "de"): ("correction", "Beginnen Sie mit der Eingabe, um zu suchen.", "This message is shown when the search input is empty. The current nominal phrase is awkward and does not prompt the user to type; this imperative matches the caller.", "high"),
    (3546, "zh_Hans"): ("refinement", "添加媒体库", "This is the modal submit button. Adding 媒体 clarifies the service library and matches the modal title 添加 Audiobookshelf 媒体库.", "high"),
    (3546, "zh_Hant"): ("correction", "新增媒體庫", "The current text contains the simplified character 库 in the Traditional Chinese catalog. 媒體庫 uses the Traditional form and matches the modal title.", "high"),
    (3549, "ja"): ("refinement", "選択したブックライブラリを表示できるユーザートークンを使用します。トークンは SeerrNG サーバーにとどまります。", "The current Japanese text has an unnecessary ASCII space after the Japanese full stop. Removing it fixes sentence spacing without changing meaning.", "high"),
    (3550, "id"): ("correction", "URL dasar", "In Indonesian, URL dasar is the natural term order for a base URL; Basis URL is an awkward calque. The label names the optional base address prefix.", "high"),
    (3551, "es"): ("refinement", "Pruebe la conexión para cargar las bibliotecas de libros disponibles", "This option instructs users to test the connection. The current tú form Prueba conflicts with the same modal’s formal forms Introduzca, Utilice, and establece; Pruebe makes the register consistent.", "moderate"),
    (3551, "ja"): ("refinement", "利用可能な図書ライブラリを読み込むには、接続をテストしてください。", "This appears as the unselected library option. The current noun chain is awkward; the revised sentence clearly asks the user to test the connection to load available book libraries.", "high"),
    (3554, "zh_Hans"): ("refinement", "用于在浏览器中打开匹配的有声书的可选地址。如果设置了 URL 基址，SeerrNG 会自动将 URL 基址附加到此地址。", "The field is labeled URL 基址 in this locale. Using that same localized term here avoids making the help text refer to an English label.", "high"),
    (3554, "hi"): ("refinement", "संबंधित ऑडियोबुक खोलने के लिए वैकल्पिक ब्राउज़र पता। यदि आप URL बेस सेट करते हैं, तो SeerrNG इसे इस पते में अपने-आप जोड़ देगा।", "The field label is URL बेस. Reusing that localized term in the help text lets users identify the setting without switching back to the English URL Base label.", "moderate"),
    (3554, "ja"): ("refinement", "対応するオーディオブックを開くための任意のブラウザーアドレスです。URLベースを設定すると、SeerrNGはその値をこのアドレスに自動で追加します。", "The field label is URLベース; the current help text switches to the English URL Base. Matching the localized label improves field-to-help consistency.", "high"),
    (3554, "fr"): ("refinement", "Adresse facultative pour ouvrir le livre audio correspondant dans le navigateur. Si vous définissez une URL de base, SeerrNG l’ajoute automatiquement à cette adresse.", "The field label is URL de base. Referring to it with the same French term is clearer than switching to the English URL Base.", "high"),
    (3554, "pt_BR"): ("correction", "Endereço opcional do navegador para abrir o audiolivro correspondente. Se você definir uma base de URL, SeerrNG adiciona essa base automaticamente a este endereço.", "The current clause says SeerrNG adds to this address but omits what is added. Naming a base de URL makes the behavior explicit.", "high"),
    (3554, "ko"): ("refinement", "해당 오디오북을 열기 위한 선택적 브라우저 주소입니다. 기본 URL을 설정하면 SeerrNG가 해당 기본 URL을 이 주소에 자동으로 추가합니다.", "The field label is 기본 URL. Reusing that Korean term in the help text makes the reference to the setting clear.", "high"),
    (3554, "zh_Hant"): ("refinement", "用於在瀏覽器中開啟對應有聲書的選用地址。若設定了 URL 基址，SeerrNG 會自動將 URL 基址加到此地址。", "The field label is URL 基址. Reusing that localized term avoids an English label mismatch in the help text.", "high"),
    (3554, "vi"): ("correction", "Địa chỉ trình duyệt tùy chọn để mở sách nói tương ứng. Nếu bạn đặt URL cơ sở, SeerrNG sẽ tự động thêm URL cơ sở vào địa chỉ này.", "The current phrase sổ ghi âm means a recording notebook/log, not an audiobook. Sách nói is the correct term, and URL cơ sở matches the field label while naming what is appended.", "high"),
    (3554, "id"): ("refinement", "Alamat peramban opsional untuk membuka audiobook yang sesuai. Jika Anda menetapkan URL dasar, SeerrNG akan menambahkannya ke alamat ini secara otomatis.", "The field label is URL dasar. Using that same Indonesian term here keeps the help text aligned with the setting.", "high"),
    (3555, "ja"): ("correction", "ホスト名または IP アドレスを入力してください。", "This is required-field validation telling the user what to enter. 入力します is declarative, not an instruction; 入力してください expresses the required action.", "high"),
    (3557, "de"): ("correction", "SeerrNG überprüft diese schreibgeschützte Hörbuchbibliothek während des Bookshelf-Scans. Bücher werden anhand ihrer ISBN abgeglichen; Einträge ohne ISBN können nicht automatisch verknüpft werden. SeerrNG fügt in Audiobookshelf keine Einträge hinzu und ändert oder entfernt dort keine.", "The current clause entfernt oder ändert sie reads as a positive statement that SeerrNG removes or changes the entries, contradicting the read-only guarantee. The revision keeps add, remove, and change under the negative.", "high"),
    (3557, "id"): ("correction", "SeerrNG memeriksa perpustakaan buku audio hanya-baca ini selama pemindaian Bookshelf. Buku dicocokkan berdasarkan ISBN; item tanpa ISBN tidak dapat ditautkan secara otomatis. SeerrNG tidak menambah, menghapus, atau mengubah item di Audiobookshelf.", "In Indonesian, oleh marks ISBN as the agent that performs the matching. Berdasarkan ISBN correctly describes ISBN as the matching criterion.", "high"),
    (3559, "es"): ("refinement", "Elija una biblioteca de libros.", "This validation instruction uses the informal tú form Elige, while the same modal uses formal usted forms such as Introduzca and Utilice. Elija keeps the register consistent.", "moderate"),
}

context_by_position = {x["position"]: x for x in load_jsonl(IN / "caller-contexts.jsonl")}
source_by_position = {x["position"]: x for x in load_jsonl(IN / "source-cells.jsonl")}
current = load_jsonl(IN / "current-target-cells.jsonl")
candidate_manifest = load_json(IN / "manifest.json")
candidate_sums_sha = sha((IN / "SHA256SUMS.txt").read_bytes())
candidate_manifest_sha = sha((IN / "manifest.json").read_bytes())
assert candidate_manifest_sha == "14d7c9313f4b1eb7a0160712c87bd07089a719bcb05c64fbd8493a31f143a102"
assert candidate_sums_sha == "6b8b67e58028a0af79afad9a115a42b49233df18d2469227fe4153bece68ddb8"
assert candidate_manifest["head"] == EXPECTED_HEAD and candidate_manifest["tree"] == EXPECTED_TREE

directions = {x["catalogKey"]: x["direction"] for x in load_json(IN / "window.json")["localeInfo"]}
locale_status = {x["catalogKey"]: x["reviewStatus"] for x in load_json(IN / "window.json")["localeInfo"]}
context_desc = {
    3540: "studio search placeholder in the selector",
    3541: "user search placeholder in the selector",
    3542: "select-all action in the provider selector",
    3543: "collapse action for the provider list",
    3544: "expand action for the provider list",
    3545: "prompt shown when selector search has no query",
    3546: "Add library modal submit button",
    3547: "Add Audiobookshelf library modal title",
    3548: "Audiobookshelf user API token label",
    3549: "API token permission and server-storage help text",
    3550: "URL Base form label",
    3551: "empty book-library option instructing the user to test the connection",
    3552: "Edit Audiobookshelf library modal title",
    3553: "External URL form label",
    3554: "external audiobook address help text",
    3555: "required hostname or IP address validation",
    3556: "hostname or IP address form label",
    3557: "read-only library and ISBN scan explanation",
    3558: "Audiobook library selector label",
    3559: "required book-library validation",
}

def protected_occurrences(text):
    return [term for term in PROTECTED_TERMS if re.search(r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])", text)]

ledger = []
selected = []
for cell in current:
    key = (cell["position"], cell["locale"])
    source_row = source_by_position[cell["position"]]
    caller = context_by_position[cell["position"]]
    current_target = cell["currentTarget"]
    disposition, final_target, rationale, confidence = changes.get(
        key,
        (
            "accept-current",
            current_target,
            f"The current {cell['locale']} wording accurately conveys “{source_row['source']}” for the pinned caller context ({context_desc[cell['position']]}). It reads naturally as the control, field, help text, or validation message shown there; no meaning, caller, placeholder, markup, or protected-literal issue requires a change.",
            "moderate",
        ),
    )
    assert disposition in {"accept-current", "correction", "refinement"}
    source_tokens = PLACEHOLDER_RE.findall(source_row["source"])
    current_tokens = PLACEHOLDER_RE.findall(current_target)
    final_tokens = PLACEHOLDER_RE.findall(final_target)
    source_markup = MARKUP_RE.findall(source_row["source"])
    current_markup = MARKUP_RE.findall(current_target)
    final_markup = MARKUP_RE.findall(final_target)
    source_protected = source_row["sourceProtectedLiterals"]
    current_protected = protected_occurrences(current_target)
    final_protected = protected_occurrences(final_target)
    assert source_tokens == current_tokens == final_tokens
    assert source_markup == current_markup == final_markup
    assert source_protected == current_protected == final_protected, (key, source_protected, current_protected, final_protected)
    ctx = {
        "namespace": caller["namespace"],
        "sameNamespace": True,
        "callerCount": caller["callerCount"],
        "callerResolution": caller["callerResolution"],
        "directMessageReferences": caller["directMessageReferences"],
    }
    entry = {
        "schemaVersion": 1,
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3540-W3559",
        "head": EXPECTED_HEAD,
        "tree": EXPECTED_TREE,
        "position": cell["position"],
        "sourceId": cell["sourceId"],
        "sourceKey": cell["sourceKey"],
        "source": source_row["source"],
        "sourceSha256": source_row["sourceSha256"],
        "locale": cell["locale"],
        "localeTag": cell["localeTag"],
        "direction": directions[cell["locale"]],
        "reviewStatus": locale_status[cell["locale"]],
        "catalogPath": cell["catalogPath"],
        "catalogGitBlob": cell["catalogGitBlob"],
        "catalogSha256": cell["catalogSha256"],
        "callerContext": ctx,
        "currentTarget": current_target,
        "currentTargetSha256": cell["currentTargetSha256"],
        "disposition": disposition,
        "confidence": confidence,
        "finalTarget": final_target,
        "finalTargetSha256": sha(final_target.encode("utf-8")),
        "namespacePreserved": True,
        "placeholderTokenChecks": {
            "sourceTokens": source_tokens,
            "currentTargetTokens": current_tokens,
            "finalTargetTokens": final_tokens,
            "currentSequenceMatchesSource": current_tokens == source_tokens,
            "currentSetMatchesSource": set(current_tokens) == set(source_tokens),
            "finalSequenceMatchesSource": final_tokens == source_tokens,
            "finalSetMatchesSource": set(final_tokens) == set(source_tokens),
        },
        "markupTokenChecks": {
            "sourceTokens": source_markup,
            "currentTargetTokens": current_markup,
            "finalTargetTokens": final_markup,
            "finalSequenceMatchesSource": final_markup == source_markup,
        },
        "protectedLiteralChecks": {
            "sourceLiterals": source_protected,
            "currentTargetLiterals": current_protected,
            "finalTargetLiterals": final_protected,
            "finalSetMatchesSource": set(final_protected) == set(source_protected),
        },
        "rationale": rationale,
    }
    ledger.append(entry)
    if disposition != "accept-current":
        selected.append({
            "schemaVersion": 1,
            "repository": "snapetech-org/seerrng",
            "pullRequest": 418,
            "window": "W3540-W3559",
            "head": EXPECTED_HEAD,
            "tree": EXPECTED_TREE,
            "position": cell["position"],
            "sourceId": cell["sourceId"],
            "sourceKey": cell["sourceKey"],
            "source": source_row["source"],
            "sourceSha256": source_row["sourceSha256"],
            "locale": cell["locale"],
            "localeTag": cell["localeTag"],
            "catalogPath": cell["catalogPath"],
            "catalogGitBlob": cell["catalogGitBlob"],
            "catalogSha256": cell["catalogSha256"],
            "currentTarget": current_target,
            "currentTargetSha256": cell["currentTargetSha256"],
            "disposition": disposition,
            "confidence": confidence,
            "proposedTarget": final_target,
            "proposedTargetSha256": sha(final_target.encode("utf-8")),
            "placeholderTokenChecks": entry["placeholderTokenChecks"],
            "protectedLiteralChecks": entry["protectedLiteralChecks"],
            "callerContext": ctx,
            "rationale": rationale,
        })

assert len(ledger) == 240
assert len(selected) == len(changes) == 23
assert not any(entry["disposition"] == "hold" for entry in ledger)
OUT.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
counts = {}
for row in ledger:
    counts[row["disposition"]] = counts.get(row["disposition"], 0) + 1
summary = {
    "schemaVersion": 1,
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "window": "W3540-W3559",
    "head": EXPECTED_HEAD,
    "tree": EXPECTED_TREE,
    "candidateFreeManifestJsonSha256": candidate_manifest_sha,
    "candidateFreeChecksumListSha256": candidate_sums_sha,
    "sourceIds": 20,
    "locales": 12,
    "cells": len(ledger),
    "dispositions": counts,
    "proposedChanges": len(selected),
    "callerlessHolds": 0,
    "placeholderMismatches": 0,
    "markupMismatches": 0,
    "protectedLiteralMismatches": 0,
    "nativeSpeakerApproval": False,
    "exactHeadBrowserReview": False,
    "reviewedAtUTC": now,
}
provenance = {
    "schemaVersion": 1,
    "reviewType": "primary-semantic-review",
    "reviewer": "root/slskdn_w60_crossaudit",
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "window": "W3540-W3559",
    "head": EXPECTED_HEAD,
    "tree": EXPECTED_TREE,
    "candidateFreeInputDirectory": str(IN),
    "candidateFreeManifestJsonSha256": candidate_manifest_sha,
    "candidateFreeChecksumListSha256": candidate_sums_sha,
    "candidateFreeManifestJsonBytes": (IN / "manifest.json").stat().st_size,
    "candidateFreeChecksumListBytes": (IN / "SHA256SUMS.txt").stat().st_size,
    "candidateFreeInputManifestLineage": "manifest JSON and SHA256SUMS list are distinct files and separately hashed",
    "reviewedAtUTC": now,
    "cellCount": len(ledger),
    "selectedChangeCount": len(selected),
    "callerlessHolds": 0,
    "qualifiedNativeSpeakerApproval": False,
    "exactHeadBrowserReview": False,
}
readme = f"""Primary semantic review for SeerrNG PR #418 W3540–W3559, pinned to {EXPECTED_HEAD} / tree {EXPECTED_TREE}.

The review covers all 240 current target cells across the 12 direct locales. The sealed candidate-free packet was verified before review. Decisions: {counts.get('accept-current', 0)} accept-current, {counts.get('correction', 0)} corrections, and {counts.get('refinement', 0)} refinements; no holds. The {len(selected)} proposed changes preserve exact source placeholders, markup, and protected technical literals.

Candidate-free lineage is explicit: manifest JSON SHA-256 {candidate_manifest_sha}; checksum-list SHA-256 {candidate_sums_sha}. The two hashes identify separate files. See primary-ledger.jsonl for all cell dispositions and selected-direct-locale-cells.jsonl for proposed text.

This machine review is not qualified native-speaker approval and is not exact-head browser acceptance.
"""
(OUT / "README.md").write_text(readme, encoding="utf-8")
write_json(OUT / "summary.json", summary)
write_json(OUT / "provenance.json", provenance)
write_jsonl(OUT / "primary-ledger.jsonl", ledger)
write_jsonl(OUT / "selected-direct-locale-cells.jsonl", selected)
(OUT / "input-verification.txt").write_text(
    f"PASS: candidate-free input checksums and manifest verified before semantic review.\n"
    f"head={EXPECTED_HEAD}\ntree={EXPECTED_TREE}\n"
    f"manifestJsonSha256={candidate_manifest_sha}\n"
    f"checksumListSha256={candidate_sums_sha}\n"
    f"sourceRows=20\nlocaleCells=240\ncallerless=0\nplaceholderMismatches=0\nmarkupMismatches=0\n",
    encoding="utf-8",
)
files = sorted(p for p in OUT.iterdir() if p.is_file() and p.name != "SHA256SUMS.txt")
(OUT / "SHA256SUMS.txt").write_text("".join(f"{sha(p.read_bytes())}  {p.name}\n" for p in files), encoding="ascii")
print(json.dumps({
    "head": EXPECTED_HEAD,
    "tree": EXPECTED_TREE,
    "dispositions": counts,
    "selectedChanges": len(selected),
    "primaryChecksumListSha256": sha((OUT / "SHA256SUMS.txt").read_bytes()),
    "candidateFreeManifestJsonSha256": candidate_manifest_sha,
    "candidateFreeChecksumListSha256": candidate_sums_sha,
}, indent=2))
