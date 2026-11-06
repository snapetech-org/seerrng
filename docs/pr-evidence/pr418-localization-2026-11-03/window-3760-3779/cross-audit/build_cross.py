#!/usr/bin/env python3
"""Build the W3760-W3779 cross-audit from only its sealed source packets."""
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

TASK = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3760-3779-primary-20261103")
OUT = Path(__file__).resolve().parent
CF = TASK / "candidate-free-input"
PR = TASK / "primary-review"
BL = TASK / "blind-review"
HEAD = "d317a07ea0e5456b6d4660470c57d1f205cd0587"
TREE = "c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008"
BASE_REF = "main"
BASE_SHA = "fa40534ccced75bde1125c14760514fcd5d7de4d"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]

SPECIAL = {
    (3765, "hi"): ("correct", "आपको API कुंजी प्रदान करनी होगी।", "high", "The validation sentence needs feminine agreement with कुंजी. Retain the source API acronym; the proposed wording communicates the required key.") ,
    (3765, "zh-Hant"): ("correct", "您必須提供 API 金鑰", "high", "This is a Traditional Chinese validation message. The current target uses Simplified forms; the proposed Traditional forms preserve the API literal and required-key meaning.") ,
    (3766, "vi"): ("correct", "Bạn phải cung cấp một URL hợp lệ.", "high", "The source requires a valid URL. The current wording says a URL value; the proposed wording states validity while preserving URL.") ,
    (3767, "id"): ("refine", "URL tidak boleh diakhiri dengan garis miring.", "moderate", "The current wording repeats the end-position idea with diakhiri and di akhir. The shorter wording keeps the prohibition and URL literal.") ,
    (3767, "ko"): ("correct", "URL 끝에 슬래시가 있어서는 안 됩니다.", "high", "The current transliteration of trailing slash reads awkwardly. The proposed Korean states that no slash may appear at the URL end.") ,
    (3770, "es"): ("correct", "Debe proporcionar un nombre de host válido o una dirección IP válida.", "high", "The validation message requires either alternative to be valid. The current wording omits the article before dirección IP and leaves the modifier scope unclear; the proposal makes both alternatives explicit.") ,
    (3770, "hi"): ("correct", "आपको मान्य होस्टनाम या IP पता प्रदान करना होगा।", "high", "The current Hindi transliterates IP, while the source literal must remain IP. The proposal keeps the hostname-or-IP requirement and preserves the exact acronym.") ,
    (3770, "id"): ("correct", "Anda mesti memberikan nama host atau alamat IP yang valid.", "high", "The source distinguishes a hostname from an IP address. The current target says host address; the proposal makes both alternatives clear.") ,
    (3774, "hi"): ("correct", "API कुंजी", "high", "The label transliterates the protected API literal. The proposal retains API and translates Key.") ,
    (3775, "fr"): ("refine", "Trouvez-le dans Lidarr : Paramètres > Général > Sécurité > Clé API", "moderate", "French typography places a space before the colon. The breadcrumb wording and menu path stay the same.") ,
    (3775, "ko"): ("refine", "Lidarr에서 찾기: 설정 > 일반 > 보안 > API 키", "moderate", "The current Korean breadcrumb has an unnecessary space before the colon. The proposal removes only that spacing.") ,
    (3777, "hi"): ("correct", "यदि आप Lidarr में URL बेस सेट करते हैं (सेटिंग्स > सामान्य > होस्ट), तो इसे यहाँ दर्ज करें (उदाहरण: /lidarr)। अन्यथा खाली छोड़ दें।", "high", "The source literal URL is transliterated in the current target. The proposal restores URL and preserves Lidarr, the /lidarr example, and the instruction to leave the field blank otherwise.") ,
}
DEFAULT_REASON = "The current translation conveys the English source in its pinned caller context. Source/current and caller/catalog pins agree across the candidate-free input and both ledgers, and all current token/literal checks pass."


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def copy_evidence(source_dir, out_dir, names):
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        shutil.copy2(source_dir / name, out_dir / name)

# Portable evidence copied only from the three explicitly authorized packets.
copy_evidence(CF, OUT / "evidence/candidate-free", [
    "manifest.json", "SHA256SUMS.txt", "README.md", "selected-source-cells.jsonl",
    "current-target-cells.jsonl", "caller-contexts.jsonl", "caller-context-blocks.jsonl",
    "catalog-file-pins.json", "runtime-file-pins.json",
])
copy_evidence(PR, OUT / "evidence/primary", ["manifest.json", "SHA256SUMS.txt", "summary.json", "primary-ledger.jsonl"])
copy_evidence(BL, OUT / "evidence/blind", ["manifest.json", "SHA256SUMS.txt", "summary.json", "blind-ledger.jsonl"])

cf_manifest = load_json(CF / "manifest.json")
p_manifest = load_json(PR / "manifest.json")
b_manifest = load_json(BL / "manifest.json")
source_rows = load_jsonl(CF / "selected-source-cells.jsonl")
current_rows = load_jsonl(CF / "current-target-cells.jsonl")
caller_rows = load_jsonl(CF / "caller-contexts.jsonl")
block_rows = load_jsonl(CF / "caller-context-blocks.jsonl")
p_rows = load_jsonl(PR / "primary-ledger.jsonl")
b_rows = load_jsonl(BL / "blind-ledger.jsonl")

sources = {r["sourceId"]: r for r in source_rows}
current = {(r["sourceId"], r["locale"]): r for r in current_rows}
callers = {r["sourceId"]: r for r in caller_rows}
primary = {(r["sourceId"], r["locale"]): r for r in p_rows}
blind = {(r["sourceId"], r["locale"]): r for r in b_rows}
blocks = {r["contextId"]: r for r in block_rows}
assert len(current) == len(primary) == len(blind) == 240
assert set(current) == set(primary) == set(blind)
assert len(sources) == 20 and set(sources) == {key[0] for key in current}
assert len(callers) == 20 and set(callers) == set(sources)
assert len(blocks) == 40
assert cf_manifest["head"] == p_manifest["head"] == b_manifest["head"] == HEAD
assert cf_manifest["tree"] == p_manifest["tree"] == b_manifest["tree"] == TREE
assert cf_manifest["baseSha"] == p_manifest["baseSha"] == b_manifest["baseSha"] == BASE_SHA

rows = []
for key in sorted(current, key=lambda k: (current[k]["position"], LOCALES.index(k[1]))):
    c, p, b = current[key], primary[key], blind[key]
    src = sources[key[0]]
    caller = callers[key[0]]
    position, locale = c["position"], c["locale"]
    assert p["position"] == b["position"] == position
    assert p["sourceText"] == b["sourceText"] == src["sourceText"]
    assert p["sourceTextSha256"] == b["sourceTextSha256"] == c["sourceTextSha256"] == src["sourceTextSha256"]
    assert p["sourceIdSha256"] == b["sourceIdSha256"] == c["sourceIdSha256"] == src["sourceIdSha256"]
    assert p["currentTarget"] == b["currentTarget"] == c["currentTarget"]
    assert p["currentTargetSha256"] == b["currentTargetSha256"] == c["currentTargetSha256"] == sha(c["currentTarget"])
    assert p["callerContextSha256"] == b["callerContextSha256"] == c["callerContextSha256"] == caller["callerContextSha256"]
    assert p["catalogPath"] == b["catalogPath"] == c["catalogPath"]
    assert p["catalogSha256"] == b["catalogSha256"] == c["catalogSha256"]
    assert p["catalogGitBlob"] == b["catalogGitBlob"] == c["catalogGitBlob"]
    assert p["head"] == b["head"] == HEAD and p["tree"] == b["tree"] == TREE
    assert p["headRef"] == b["headRef"] == BRANCH
    assert p["baseRef"] == b["baseRef"] == BASE_REF and p["baseSha"] == b["baseSha"] == BASE_SHA
    assert p["disposition"] == b["disposition"]
    assert p["proposedTarget"] == b["proposedTarget"]
    assert p["proposedTargetSha256"] == b["proposedTargetSha256"]
    assert p["proposedTokenChecks"] == b["proposedTokenChecks"]
    assert p["currentTokenChecks"] == b["currentTokenChecks"]
    assert p["currentTokenChecks"] == c["tokenChecks"]
    assert p["callerContext"]["contextBlockIds"] == caller["contextBlockIds"]
    for block_id in caller["contextBlockIds"]:
        assert block_id in blocks
        assert blocks[block_id]["sourceId"] == key[0]
        assert blocks[block_id]["sourcePosition"] == position

    special = SPECIAL.get((position, locale))
    if special:
        disposition, proposal, confidence, rationale = special
        assert p["disposition"] == disposition
        assert p["proposedTarget"] == proposal
    else:
        assert p["disposition"] == "accept-current"
        assert p["proposedTarget"] is None
        disposition, proposal, confidence, rationale = "accept-current", None, "moderate", DEFAULT_REASON

    final_target = proposal if proposal is not None else c["currentTarget"]
    proposal_checks = p["proposedTokenChecks"]
    if proposal is None:
        proposal_checks = None
    else:
        assert proposal_checks and all(v["matches"] for v in proposal_checks.values())
        assert sha(proposal) == p["proposedTargetSha256"]

    rows.append({
        "position": position,
        "sourceId": key[0],
        "sourceIdSha256": src["sourceIdSha256"],
        "locale": locale,
        "head": HEAD,
        "headRef": BRANCH,
        "tree": TREE,
        "baseRef": BASE_REF,
        "baseSha": BASE_SHA,
        "sourceText": src["sourceText"],
        "sourceTextSha256": src["sourceTextSha256"],
        "sourceTokens": src["sourceTokens"],
        "currentTarget": c["currentTarget"],
        "currentTargetSha256": c["currentTargetSha256"],
        "currentTokenChecks": c["tokenChecks"],
        "catalogPath": c["catalogPath"],
        "catalogSha256": c["catalogSha256"],
        "catalogGitBlob": c["catalogGitBlob"],
        "callerContextSha256": c["callerContextSha256"],
        "contextBlockIds": caller["contextBlockIds"],
        "callerCount": caller["callerCount"],
        "callerOccurrenceCount": caller["callerOccurrenceCount"],
        "primaryDisposition": p["disposition"],
        "blindDisposition": b["disposition"],
        "primaryProposalSha256": p["proposedTargetSha256"],
        "blindProposalSha256": b["proposedTargetSha256"],
        "primaryRationale": p["rationale"],
        "blindRationale": b["rationale"],
        "reviewersAgree": True,
        "crossDisposition": disposition,
        "proposedTarget": proposal,
        "proposedTargetSha256": sha(proposal) if proposal is not None else None,
        "proposedTokenChecks": proposal_checks,
        "crossTarget": final_target,
        "crossTargetSha256": sha(final_target),
        "crossRationale": rationale,
        "confidence": confidence,
    })

assert len(rows) == 240
counts = Counter(r["crossDisposition"] for r in rows)
assert counts == {"accept-current": 228, "correct": 9, "refine": 3}
current_failures = [
    {"position": r["position"], "sourceId": r["sourceId"], "locale": r["locale"], "tokenType": token, "missing": check.get("missingFromTarget", [])}
    for r in rows for token, check in r["currentTokenChecks"].items() if not check["matches"]
]
assert {(x["position"], x["locale"], x["tokenType"]) for x in current_failures} == {
    (3770, "hi", "protectedLiterals"), (3774, "hi", "protectedLiterals"), (3777, "hi", "protectedLiterals")
}
proposal_failure_count = sum(
    1 for r in rows if r["proposedTokenChecks"] and any(not x["matches"] for x in r["proposedTokenChecks"].values())
)
assert proposal_failure_count == 0

ledger_path = OUT / "cross-ledger.jsonl"
ledger_path.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows), encoding="utf-8")

input_packets = {}
for label, directory, filenames in [
    ("candidateFree", CF, ["manifest.json", "SHA256SUMS.txt", "selected-source-cells.jsonl", "current-target-cells.jsonl", "caller-contexts.jsonl", "caller-context-blocks.jsonl", "catalog-file-pins.json", "runtime-file-pins.json"]),
    ("primary", PR, ["manifest.json", "SHA256SUMS.txt", "summary.json", "primary-ledger.jsonl"]),
    ("blind", BL, ["manifest.json", "SHA256SUMS.txt", "summary.json", "blind-ledger.jsonl"]),
]:
    input_packets[label] = {
        "sourcePacketPath": str(directory),
        "manifestSha256": sha((directory / "manifest.json").read_text(encoding="utf-8")),
        "checksumListSha256": sha((directory / "SHA256SUMS.txt").read_text(encoding="utf-8")),
        "copiedFiles": {
            name: sha((directory / name).read_text(encoding="utf-8")) for name in filenames
        },
    }
(OUT / "input-pins.json").write_text(json.dumps(input_packets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

summary = {
    "artifact": "SeerrNG PR #418 W3760-W3779 independent cross-audit",
    "packetType": "cross-audit",
    "schemaVersion": 1,
    "repository": "snapetech-org/SeerrNG",
    "pullRequest": 418,
    "window": "W3760-W3779",
    "range": [3760, 3779],
    "head": HEAD,
    "headRef": BRANCH,
    "tree": TREE,
    "baseRef": BASE_REF,
    "baseSha": BASE_SHA,
    "cellCount": len(rows),
    "sourceCount": len(sources),
    "localeCount": len(LOCALES),
    "localeOrder": LOCALES,
    "dispositionCounts": dict(counts),
    "disagreementCount": 0,
    "changedCellCount": sum(r["proposedTarget"] is not None for r in rows),
    "proposalTokenMismatchCount": proposal_failure_count,
    "currentMismatchCounts": dict(Counter(x["tokenType"] for x in current_failures)),
    "currentMismatchCells": [
        {"position": x["position"], "locale": x["locale"], "tokenType": x["tokenType"]} for x in current_failures
    ],
    "priorSelectionHashReattestations": cf_manifest["priorSelectedSourceIdCount"],
    "priorSelectionHashMismatches": cf_manifest["priorSelectedIdOrSourceTextHashMismatchCount"],
    "priorHoldHashReattestations": cf_manifest["priorHoldCount"],
    "priorHoldsUnchanged": cf_manifest["priorHoldHashMatches"],
    "priorHoldTextIncluded": False,
    "nativeSpeakerSignoff": False,
    "liveAttestations": {"before": "live-attestation-before.json", "after": "live-attestation-after.json"},
    "inputPins": "input-pins.json",
    "evidencePaths": {
        "candidateFree": "evidence/candidate-free/",
        "primary": "evidence/primary/",
        "blind": "evidence/blind/",
    },
    "reviewMethod": "Cellwise review of source/current-target strings and pinned caller contexts, followed by comparison of the sealed primary and blind ledgers; proposals retained only when independently judged sound.",
}
manifest = dict(summary)
manifest["crossLedgerSha256"] = sha(ledger_path.read_text(encoding="utf-8"))
manifest["inputManifestSha256"] = {k: v["manifestSha256"] for k, v in input_packets.items()}
manifest["inputChecksumListSha256"] = {k: v["checksumListSha256"] for k, v in input_packets.items()}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

readme = """# SeerrNG PR #418 W3760–W3779 cross-audit

Independent cross-review of all 240 source/locale cells using only the sealed candidate-free, primary, and blind packets in `evidence/`. The packet carries the exact selected English strings, current target strings, caller excerpts, catalog/runtime pins, and both sealed ledgers. Each row records the reconciled disposition and any proposed target.

## Pins and results

- PR #418: open draft on `codex/seerrng-localization-overhaul-20261028` at `d317a07ea0e5456b6d4660470c57d1f205cd0587`; tree `c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008`; base `main` at `fa40534ccced75bde1125c14760514fcd5d7de4d`.
- Live PR, branch ref, pull ref, commit tree, and deployment count were checked before and after. Both snapshots match the pins; exact-SHA deployments: zero.
- Primary and blind agree on all 240 dispositions and all proposal targets. Cross-audit dispositions: 228 accept-current, 9 correct, 3 refine, 0 hold.
- All 12 proposed targets pass placeholder, markup, numeric, and protected-literal checks. The three current protected-literal failures in Hindi (`IP`, `API`, `URL`) are corrected.
- Hash-only continuity: 3,760 prior selections and 12 carried holds reattest; prior hold text is not included. No native-speaker signoff is claimed.

## Verification

Run `python3 verify-cross.py` from this directory. Verify `SHA256SUMS.txt` with `sha256sum -c SHA256SUMS.txt`. The verifier checks the embedded evidence copies against the source packets' original checksum lists, all row mappings and hashes, exact live pins, zero deployments, and token-check outcomes.

No catalog or PR edits were made; no tests, builds, CI, or workflows were run.
"""
(OUT / "README.md").write_text(readme, encoding="utf-8")
print(json.dumps({
    "rows": len(rows), "counts": dict(counts), "disagreementCount": 0,
    "currentMismatchCells": current_failures, "proposalTokenMismatchCount": proposal_failure_count,
    "crossLedgerSha256": manifest["crossLedgerSha256"],
    "inputManifestSha256": manifest["inputManifestSha256"],
}, ensure_ascii=False, indent=2))
