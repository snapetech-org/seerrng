#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3540-3559-primary-20261103")
REPO = ROOT / "source/repo"
IN = ROOT / "candidate-free-input"
EXPECTED_HEAD = "f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d"
EXPECTED_TREE = "3ba2579c326f8dbac943ba43df77ddd5747a85a1"
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR", "ar", "ko", "zh_Hant", "vi", "id"]
PLACEHOLDER = re.compile(r"\{[^{}]+\}")
MARKUP = re.compile(r"</?[A-Za-z][^>]*>")
PROTECTED = ["SeerrNG", "Audiobookshelf", "ISBN", "API", "URL", "HTTP", "HTTPS", "IP"]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, check=True, capture_output=True).stdout

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

assert subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip() == EXPECTED_HEAD
assert subprocess.run(["git", "rev-parse", "HEAD^{tree}"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip() == EXPECTED_TREE
assert not subprocess.run(["git", "status", "--porcelain"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()

sum_lines = (IN / "SHA256SUMS.txt").read_text(encoding="ascii").splitlines()
assert sum_lines
for line in sum_lines:
    expected, name = line.split(maxsplit=1)
    path = IN / name.strip().lstrip("*")
    assert path.is_file(), path
    assert sha(path.read_bytes()) == expected, f"checksum mismatch: {path.name}"

manifest = j(IN / "manifest.json")
window = j(IN / "window.json")
attest = j(IN / "PR-attestation.json")
assert manifest["packetType"] == "candidate-free-input"
assert manifest["head"] == EXPECTED_HEAD and manifest["tree"] == EXPECTED_TREE
assert window["range"] == [3540, 3559]
assert window["sourceRecordCount"] == 20 and window["cellCount"] == 240
assert attest["state"] == "open" and attest["draft"] is True and attest["pinsAgree"] is True
assert attest["remoteBranchHead"] == EXPECTED_HEAD and attest["remotePullRefHead"] == EXPECTED_HEAD
assert window["catalogKeySetEqualsEnglish"] is True
assert window["placeholderMismatchCount"] == 0 and window["markupMismatchCount"] == 0

en = json.loads(git("show", "HEAD:src/i18n/locale/en.json"))
source_items = list(en.items())
assert len(source_items) == 9494
source_by_pos = {i: source_items[i] for i in range(3539, 3561)}
source_rows = [json.loads(line) for line in (IN / "source-cells.jsonl").read_text(encoding="utf-8").splitlines()]
order_rows = [json.loads(line) for line in (IN / "source-order.jsonl").read_text(encoding="utf-8").splitlines()]
current_rows = [json.loads(line) for line in (IN / "current-target-cells.jsonl").read_text(encoding="utf-8").splitlines()]
callers = [json.loads(line) for line in (IN / "caller-contexts.jsonl").read_text(encoding="utf-8").splitlines()]
blocks = [json.loads(line) for line in (IN / "caller-context-blocks.jsonl").read_text(encoding="utf-8").splitlines()]
assert [r["position"] for r in source_rows] == list(range(3540, 3560))
assert [r["position"] for r in order_rows] == list(range(3539, 3561))
assert order_rows[0]["boundaryKind"] == "previous" and order_rows[-1]["boundaryKind"] == "next"
assert order_rows[1]["sourceId"] == "components.Selector.searchStudios"
assert order_rows[0]["sourceId"] == "components.Selector.searchStatus"
assert order_rows[-1]["sourceId"] == "components.Settings.AudiobookshelfModal.name"
assert len(current_rows) == 240 and len(callers) == 20
assert len({(r["position"], r["locale"]) for r in current_rows}) == 240
assert len({r["sourceId"] for r in source_rows}) == 20
assert {r["position"] for r in current_rows} == set(range(3540, 3560))
assert {r["locale"] for r in current_rows} == set(LOCALES)
assert not j(IN / "caller-resolution-findings.json")["findings"]

for row in source_rows:
    pos = row["position"]
    source_id, source = source_by_pos[pos]
    assert row["sourceId"] == source_id and row["source"] == source
    assert row["sourceSha256"] == sha(source.encode())
    assert row["sourceIdSha256"] == sha(source_id.encode())

for row in order_rows:
    source_id, source = source_by_pos[row["position"]]
    assert row["sourceId"] == source_id and row["source"] == source

file_pins = j(IN / "file-pins.json")
for locale in ["en", *LOCALES]:
    path = f"src/i18n/locale/{locale}.json"
    data = git("show", f"HEAD:{path}")
    obj = json.loads(data)
    pin = file_pins["catalogFiles"][path]
    assert sha(data) == pin["sha256"]
    assert git("rev-parse", f"HEAD:{path}").decode().strip() == pin["gitBlob"]
    assert len(obj) == 9494 and set(obj) == set(en)
    ordered_sha = sha(json.dumps(list(obj.keys()), ensure_ascii=False, separators=(",", ":")).encode())
    assert ordered_sha == pin["orderedKeysSha256"]
    assert pin["keyCount"] == len(obj)

by_locale = {locale: json.loads(git("show", f"HEAD:src/i18n/locale/{locale}.json")) for locale in LOCALES}
for cell in current_rows:
    src_id = cell["sourceId"]
    source = en[src_id]
    target = by_locale[cell["locale"]][src_id]
    assert cell["currentTarget"] == target
    assert cell["source"] == source
    assert cell["currentTargetSha256"] == sha(target.encode())
    assert cell["sourceSha256"] == sha(source.encode())
    assert cell["placeholderTokenSequenceMatches"] == (PLACEHOLDER.findall(source) == PLACEHOLDER.findall(target))
    assert cell["placeholderTokenSetMatchesSource"] == (set(PLACEHOLDER.findall(source)) == set(PLACEHOLDER.findall(target)))
    assert cell["sourceMarkupTokens"] == MARKUP.findall(source)
    assert cell["currentTargetMarkupTokens"] == MARKUP.findall(target)
    assert cell["sourceProtectedLiterals"] == [x for x in PROTECTED if re.search(r"(?<![A-Za-z0-9])" + re.escape(x) + r"(?![A-Za-z0-9])", source)]
    assert cell["currentTargetProtectedLiterals"] == [x for x in PROTECTED if re.search(r"(?<![A-Za-z0-9])" + re.escape(x) + r"(?![A-Za-z0-9])", target)]

for context in callers:
    assert context["callerCount"] > 0
    for ref in context["directMessageReferences"]:
        assert sha(ref["text"].encode()) == ref["lineSha256"]
assert all(block["lines"] and all(sha(x["text"].encode()) == x["lineSha256"] for x in block["lines"]) for block in blocks)

manifest_names = {f["path"] for f in manifest["files"]}
assert manifest_names == {line.split(maxsplit=1)[1].strip().lstrip("*") for line in sum_lines if line.split(maxsplit=1)[1].strip().lstrip("*") != "manifest.json"}
for entry in manifest["files"]:
    data = (IN / entry["path"]).read_bytes()
    assert sha(data) == entry["sha256"] and len(data) == entry["byteCount"]
candidate_manifest_sha = sha((IN / "manifest.json").read_bytes())
candidate_sums_sha = sha((IN / "SHA256SUMS.txt").read_bytes())
print(json.dumps({
    "result": "PASS",
    "head": EXPECTED_HEAD,
    "tree": EXPECTED_TREE,
    "sourceRows": len(source_rows),
    "cellRows": len(current_rows),
    "localeCount": len(LOCALES),
    "callerlessRows": 0,
    "placeholderMismatches": sum(not r["placeholderTokenSequenceMatches"] for r in current_rows),
    "markupMismatches": sum(r["sourceMarkupTokens"] != r["currentTargetMarkupTokens"] for r in current_rows),
    "catalogKeySetsVerified": 13,
    "catalogOrderHashesVerified": 13,
    "candidateFreeChecksumEntries": len(sum_lines),
    "candidateFreeManifestJsonSha256": candidate_manifest_sha,
    "candidateFreeChecksumListSha256": candidate_sums_sha,
}, indent=2))
