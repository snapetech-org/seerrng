#!/usr/bin/env python3
"""Verify the portable SeerrNG W3760-W3779 cross-audit packet."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED = {
    "repository": "snapetech-org/SeerrNG",
    "pullRequest": 418,
    "window": "W3760-W3779",
    "range": [3760, 3779],
    "head": "d317a07ea0e5456b6d4660470c57d1f205cd0587",
    "headRef": "codex/seerrng-localization-overhaul-20261028",
    "tree": "c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008",
    "baseRef": "main",
    "baseSha": "fa40534ccced75bde1125c14760514fcd5d7de4d",
}
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_text(text):
    return sha_bytes(text.encode("utf-8"))


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def verify_sum_list(root, sum_path, required_names=None):
    entries = {}
    for line in sum_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split(maxsplit=1)
        name = name.lstrip(" *")
        entries[name] = digest
    if required_names is not None:
        required_names = set(required_names)
        assert required_names.issubset(entries), f"source checksum list lacks required entries: {required_names - set(entries)}"
    for name, digest in entries.items():
        if required_names is not None and name not in required_names:
            continue
        path = root / name
        assert path.is_file(), f"missing checksummed file {path}"
        assert sha_bytes(path.read_bytes()) == digest, f"checksum mismatch {path}"
    return entries


manifest = load_json(ROOT / "manifest.json")
for key, value in EXPECTED.items():
    assert manifest[key] == value, (key, manifest.get(key), value)
assert manifest["packetType"] == "cross-audit"
assert manifest["cellCount"] == 240
assert manifest["localeOrder"] == LOCALES
assert manifest["nativeSpeakerSignoff"] is False

pins = load_json(ROOT / "input-pins.json")
expected_dirs = {
    "candidateFree": ROOT / "evidence/candidate-free",
    "primary": ROOT / "evidence/primary",
    "blind": ROOT / "evidence/blind",
}
for label, directory in expected_dirs.items():
    input_pin = pins[label]
    assert sha_text((directory / "manifest.json").read_text(encoding="utf-8")) == input_pin["manifestSha256"]
    assert sha_text((directory / "SHA256SUMS.txt").read_text(encoding="utf-8")) == input_pin["checksumListSha256"]
    original_entries = verify_sum_list(directory, directory / "SHA256SUMS.txt", set(input_pin["copiedFiles"]) - {"SHA256SUMS.txt"})
    for filename, original_sha in input_pin["copiedFiles"].items():
        if filename != "SHA256SUMS.txt":
            assert filename in original_entries, f"{label} source checksum list lacks {filename}"
            assert original_entries[filename] == original_sha, f"{label} source pin mismatch for {filename}"
        assert sha_text((directory / filename).read_text(encoding="utf-8")) == original_sha, f"copied evidence mismatch: {label}/{filename}"
    assert input_pin["manifestSha256"] == sha_text((directory / "manifest.json").read_text(encoding="utf-8"))
    assert input_pin["checksumListSha256"] == sha_text((directory / "SHA256SUMS.txt").read_text(encoding="utf-8"))

cf_dir = expected_dirs["candidateFree"]
p_dir = expected_dirs["primary"]
b_dir = expected_dirs["blind"]
cf_manifest = load_json(cf_dir / "manifest.json")
p_manifest = load_json(p_dir / "manifest.json")
b_manifest = load_json(b_dir / "manifest.json")
assert manifest["inputManifestSha256"] == {
    "candidateFree": pins["candidateFree"]["manifestSha256"],
    "primary": pins["primary"]["manifestSha256"],
    "blind": pins["blind"]["manifestSha256"],
}
assert manifest["inputChecksumListSha256"] == {
    "candidateFree": pins["candidateFree"]["checksumListSha256"],
    "primary": pins["primary"]["checksumListSha256"],
    "blind": pins["blind"]["checksumListSha256"],
}
for source_manifest in (cf_manifest, p_manifest, b_manifest):
    for key in ("head", "tree", "baseRef", "baseSha"):
        assert source_manifest[key] == EXPECTED[key], (key, source_manifest[key])

srcs = {r["sourceId"]: r for r in load_jsonl(cf_dir / "selected-source-cells.jsonl")}
cur = {(r["sourceId"], r["locale"]): r for r in load_jsonl(cf_dir / "current-target-cells.jsonl")}
callers = {r["sourceId"]: r for r in load_jsonl(cf_dir / "caller-contexts.jsonl")}
blocks = {r["contextId"]: r for r in load_jsonl(cf_dir / "caller-context-blocks.jsonl")}
pri = {(r["sourceId"], r["locale"]): r for r in load_jsonl(p_dir / "primary-ledger.jsonl")}
bln = {(r["sourceId"], r["locale"]): r for r in load_jsonl(b_dir / "blind-ledger.jsonl")}
rows = load_jsonl(ROOT / "cross-ledger.jsonl")
assert len(srcs) == len(callers) == 20
assert len(blocks) == 40
assert len(cur) == len(pri) == len(bln) == len(rows) == 240
assert set(cur) == set(pri) == set(bln)
assert len({(r["sourceId"], r["locale"]) for r in rows}) == len(rows)
assert set((r["sourceId"], r["locale"]) for r in rows) == set(cur)

for key, row in zip(sorted(cur, key=lambda k: (cur[k]["position"], LOCALES.index(k[1]))), rows):
    c, p, b = cur[key], pri[key], bln[key]
    src = srcs[key[0]]
    caller = callers[key[0]]
    assert row["position"] == c["position"] == p["position"] == b["position"]
    for name in ("sourceId", "locale"):
        assert row[name] == key[0 if name == "sourceId" else 1]
    assert row["sourceText"] == src["sourceText"] == p["sourceText"] == b["sourceText"]
    assert row["sourceTextSha256"] == src["sourceTextSha256"] == c["sourceTextSha256"] == p["sourceTextSha256"] == b["sourceTextSha256"]
    assert row["sourceIdSha256"] == src["sourceIdSha256"] == c["sourceIdSha256"] == p["sourceIdSha256"] == b["sourceIdSha256"]
    assert sha_text(row["sourceText"]) == row["sourceTextSha256"]
    assert row["sourceTokens"] == src["sourceTokens"]
    assert row["currentTarget"] == c["currentTarget"] == p["currentTarget"] == b["currentTarget"]
    assert row["currentTargetSha256"] == c["currentTargetSha256"] == p["currentTargetSha256"] == b["currentTargetSha256"]
    assert sha_text(row["currentTarget"]) == row["currentTargetSha256"]
    assert row["currentTokenChecks"] == c["tokenChecks"] == p["currentTokenChecks"] == b["currentTokenChecks"]
    assert row["callerContextSha256"] == caller["callerContextSha256"] == p["callerContextSha256"] == b["callerContextSha256"]
    assert row["contextBlockIds"] == caller["contextBlockIds"] == p["callerContext"]["contextBlockIds"] == b["callerContext"]["contextBlockIds"]
    for context_id in row["contextBlockIds"]:
        assert context_id in blocks
        assert blocks[context_id]["sourceId"] == key[0]
        assert blocks[context_id]["sourcePosition"] == row["position"]
    for field in ("catalogPath", "catalogSha256", "catalogGitBlob"):
        assert row[field] == c[field] == p[field] == b[field]
    for field, value in (("head", EXPECTED["head"]), ("headRef", EXPECTED["headRef"]), ("tree", EXPECTED["tree"]), ("baseRef", EXPECTED["baseRef"]), ("baseSha", EXPECTED["baseSha"])):
        assert row[field] == value
    assert row["primaryDisposition"] == p["disposition"] == b["disposition"] == row["blindDisposition"]
    assert row["reviewersAgree"] is True
    assert row["primaryProposalSha256"] == p["proposedTargetSha256"] == b["proposedTargetSha256"] == row["blindProposalSha256"]
    assert row["primaryRationale"] == p["rationale"]
    assert row["blindRationale"] == b["rationale"]
    assert row["proposedTokenChecks"] == p["proposedTokenChecks"] == b["proposedTokenChecks"]
    assert row["crossDisposition"] == row["primaryDisposition"]
    if row["crossDisposition"] == "accept-current":
        assert p["proposedTarget"] is None and b["proposedTarget"] is None
        assert row["proposedTarget"] is None and row["proposedTargetSha256"] is None
        assert row["crossTarget"] == row["currentTarget"]
        assert all(check["matches"] for check in row["currentTokenChecks"].values())
        assert row["proposedTokenChecks"] is None
    else:
        assert p["proposedTarget"] == b["proposedTarget"] == row["proposedTarget"]
        assert row["proposedTargetSha256"] == p["proposedTargetSha256"] == b["proposedTargetSha256"]
        assert sha_text(row["proposedTarget"]) == row["proposedTargetSha256"]
        assert row["crossTarget"] == row["proposedTarget"]
        assert row["proposedTokenChecks"] is not None
        assert all(check["matches"] for check in row["proposedTokenChecks"].values())
    assert sha_text(row["crossTarget"]) == row["crossTargetSha256"]

counts = Counter(r["crossDisposition"] for r in rows)
assert counts == {"accept-current": 228, "correct": 9, "refine": 3}
assert dict(counts) == manifest["dispositionCounts"]
assert manifest["disagreementCount"] == 0
assert manifest["changedCellCount"] == 12
current_mismatches = [
    (r["position"], r["locale"], token)
    for r in rows for token, check in r["currentTokenChecks"].items() if not check["matches"]
]
assert current_mismatches == [(3770, "hi", "protectedLiterals"), (3774, "hi", "protectedLiterals"), (3777, "hi", "protectedLiterals")]
proposal_failures = [
    (r["position"], r["locale"], token)
    for r in rows if r["proposedTokenChecks"]
    for token, check in r["proposedTokenChecks"].items() if not check["matches"]
]
assert not proposal_failures
assert manifest["proposalTokenMismatchCount"] == 0
assert manifest["priorSelectionHashReattestations"] == 3760
assert manifest["priorSelectionHashMismatches"] == 0
assert manifest["priorHoldHashReattestations"] == manifest["priorHoldsUnchanged"] == 12
assert manifest["priorHoldTextIncluded"] is False

for phase in ("before", "after"):
    live = load_json(ROOT / f"live-attestation-{phase}.json")
    assert live["pinsMatched"] is True
    assert live["pr"] == {"state": "open", "draft": True, "head": EXPECTED["head"], "headRef": EXPECTED["headRef"], "baseRef": EXPECTED["baseRef"], "baseSha": EXPECTED["baseSha"]}
    assert live["branchRef"]["sha"] == EXPECTED["head"]
    assert live["pullRef"]["sha"] == EXPECTED["head"]
    assert live["commitTree"]["tree"] == EXPECTED["tree"]
    assert live["deploymentsAtExpectedHead"] == {"sha": EXPECTED["head"], "count": 0}

assert sha_text((ROOT / "cross-ledger.jsonl").read_text(encoding="utf-8")) == manifest["crossLedgerSha256"]
checksum_entries = verify_sum_list(ROOT, ROOT / "SHA256SUMS.txt")
assert "SHA256SUMS.txt" not in checksum_entries
print(json.dumps({
    "status": "PASS",
    "cellCount": len(rows),
    "dispositionCounts": dict(counts),
    "reviewerDisagreements": 0,
    "proposalTokenFailures": 0,
    "currentProtectedLiteralFailures": len(current_mismatches),
    "inputPacketsVerified": 3,
    "liveBeforeAfterPinsMatched": True,
    "deploymentsBeforeAfter": [0, 0],
    "checksummedFiles": len(checksum_entries),
}, ensure_ascii=False, indent=2))
