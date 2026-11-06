#!/usr/bin/env python3
from pathlib import Path
from collections import Counter
import hashlib, json, re, subprocess

EVIDENCE = Path(__file__).resolve().parent
REPO = EVIDENCE.parents[3]
PACKET = EVIDENCE / "sealed-cross-audit-packet"
INPUT = PACKET / "candidate-free-input"
PRIMARY = PACKET / "primary-review"
BLIND = PACKET / "independent-blind-review"
AUDIT = PACKET / "cross-audit"
BASE = "f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d"
TREE = "3ba2579c326f8dbac943ba43df77ddd5747a85a1"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
PLAN_SHA = "02f3327a7b69c634a7c30ee36f4bc8041aca1e2ca7cebd1b95fe8100cf1de102"
PARENT_AUTH_SHA = "c8de40cb7ae2106e90e434874ff6f311376d2dfeee5d1fb431d2abf4ae0be25e"
PACKET_SUMS = "96741661e8919d8cfbc2788eeec9000eab8e6935c97cb31169609a0493fc626c"
AUDIT_SUMS = "e663de944a92be7dbaee671a902b4c7ae9bcf6c7c969ca15289ed7e49aa39501"
INPUT_SUMS = "6b8b67e58028a0af79afad9a115a42b49233df18d2469227fe4153bece68ddb8"
INPUT_MANIFEST = "14d7c9313f4b1eb7a0160712c87bd07089a719bcb05c64fbd8493a31f143a102"
PRIMARY_SUMS = "2875b7e3151a2009b8c24a79434cf70ce79483af9faba23ddb4827ee7c222337"
BLIND_SUMS = "2030ac91f4922865d02d61cb38e42b90cf70aecceb2cf9b998fd2b6a605d65b7"
PLACEHOLDER = re.compile(r"\{[^{}\r\n]+\}")
MARKUP = re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUMBER = re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def sha_text(text):
    return sha(text.encode("utf-8"))

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, check=True, capture_output=True).stdout

def verify_tree(directory, sums_name):
    sums = directory / sums_name
    entries = {}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, rel = line.split(None, 1)
        rel = rel.lstrip("* ")
        path = (directory / rel).resolve()
        if directory.resolve() not in path.parents or sha(path.read_bytes()) != expected:
            raise SystemExit(f"checksum mismatch: {directory}/{rel}")
        entries[rel] = expected
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file() and p != sums}
    if actual != set(entries):
        raise SystemExit(f"checksum coverage mismatch: {directory}")
    return entries

def patch_bytes(raw, updates):
    lines = raw.decode("utf-8").splitlines(keepends=True)
    decoder = json.JSONDecoder()
    remaining = set(updates)
    out = []
    for line in lines:
        body = line.rstrip("\r\n")
        ending = line[len(body):]
        replacement = body + ending
        for key in tuple(remaining):
            encoded = json.dumps(key, ensure_ascii=False)
            indent = body[:len(body) - len(body.lstrip())]
            if not body.startswith(indent + encoded):
                continue
            key_end = len(indent) + len(encoded)
            colon = re.match(r"\s*:\s*", body[key_end:])
            if not colon:
                continue
            start = key_end + colon.end()
            old, end = decoder.raw_decode(body, start)
            row = updates[key]
            if old != row["currentTarget"] or sha_text(old) != row["currentTargetSha256"]:
                raise SystemExit(f"baseline mismatch for key {key}")
            replacement = body[:start] + json.dumps(row["selectedTarget"], ensure_ascii=False) + body[end:] + ending
            remaining.remove(key)
            break
        out.append(replacement)
    if remaining:
        raise SystemExit(f"catalog keys missing from patch: {sorted(remaining)}")
    return "".join(out).encode("utf-8")

# Verify all original, sealed packets and the separate parent authorization.
verify_tree(PACKET, "SHA256SUMS.txt")
verify_tree(INPUT, "SHA256SUMS.txt")
verify_tree(PRIMARY, "SHA256SUMS.txt")
verify_tree(BLIND, "SHA256SUMS.txt")
verify_tree(AUDIT, "SHA256SUMS.txt")
verify_tree(EVIDENCE, "EVIDENCE-SHA256SUMS.txt")
assert sha((PACKET / "SHA256SUMS.txt").read_bytes()) == PACKET_SUMS
assert sha((AUDIT / "SHA256SUMS.txt").read_bytes()) == AUDIT_SUMS
assert sha((INPUT / "SHA256SUMS.txt").read_bytes()) == INPUT_SUMS
assert sha((INPUT / "manifest.json").read_bytes()) == INPUT_MANIFEST
assert sha((PRIMARY / "SHA256SUMS.txt").read_bytes()) == PRIMARY_SUMS
assert sha((BLIND / "SHA256SUMS.txt").read_bytes()) == BLIND_SUMS
assert sha((EVIDENCE / "parent-application-authorization.json").read_bytes()) == PARENT_AUTH_SHA
assert sha((EVIDENCE / "application-plan.jsonl").read_bytes()) == PLAN_SHA
assert sha((PACKET / "application-plan.jsonl").read_bytes()) == PLAN_SHA
packet_auth = j(PACKET / "application-authorization.json")
parent_auth = j(EVIDENCE / "parent-application-authorization.json")
assert packet_auth["applicationApproved"] is False
assert parent_auth["applicationApproved"] is True
assert parent_auth["repository"] == "snapetech-org/seerrng" and parent_auth["pullRequest"] == 418
assert parent_auth["head"] == BASE and parent_auth["tree"] == TREE
assert parent_auth["applicationPlan"]["sha256"] == PLAN_SHA
assert parent_auth["applicationPlan"]["selectedCellCount"] == 24
assert parent_auth["applicationPlan"]["acceptCurrentCount"] == 216
assert parent_auth["applicationPlan"]["holdCount"] == 0
assert parent_auth["reviewPackets"]["candidateFreeManifestSha256"] == INPUT_MANIFEST
assert parent_auth["reviewPackets"]["candidateFreeChecksumListSha256"] == INPUT_SUMS
assert parent_auth["reviewPackets"]["primaryChecksumListSha256"] == PRIMARY_SUMS
assert parent_auth["reviewPackets"]["blindChecksumListSha256"] == BLIND_SUMS
assert parent_auth["reviewPackets"]["crossAuditChecksumListSha256"] == AUDIT_SUMS
assert parent_auth["reviewPackets"]["crossAuditLedgerSha256"] == sha((AUDIT / "cross-audit-ledger.jsonl").read_bytes())

# Re-run the sealed cross-audit verifier; it checks all three review packets and caller lineage.
cross_audit_verify = subprocess.run(["python3", str(PACKET / "verify_cross_audit.py")], cwd=PACKET, capture_output=True, text=True)
if cross_audit_verify.returncode:
    raise SystemExit(cross_audit_verify.stdout + cross_audit_verify.stderr)

manifest = j(INPUT / "manifest.json")
cross_summary = j(AUDIT / "summary.json")
pins = j(INPUT / "file-pins.json")
plan = jl(EVIDENCE / "application-plan.jsonl")
cross_ledger = jl(AUDIT / "cross-audit-ledger.jsonl")
readback = jl(EVIDENCE / "application-readback.jsonl")
app_verification = j(EVIDENCE / "application-verification.json")
assert manifest["head"] == BASE and manifest["tree"] == TREE
assert cross_summary["head"] == BASE and cross_summary["tree"] == TREE
assert cross_summary["cellCount"] == 240 and cross_summary["selectedChanges"] == 24
assert cross_summary["crossDispositions"] == {"accept-current": 216, "correction": 11, "refinement": 13}
assert cross_summary["holds"] == 0 and cross_summary["unresolvedDisagreements"] == 0
assert len(plan) == 24 and len(cross_ledger) == len(readback) == 240
assert len({(r["position"], r["locale"]) for r in plan}) == 24
assert sha((EVIDENCE / "application-readback.jsonl").read_bytes()) == app_verification["readbackSha256"]

plan_by_key = {(r["position"], r["locale"]): r for r in plan}
ledger_by_key = {(r["position"], r["locale"]): r for r in cross_ledger}
readback_by_key = {(r["position"], r["locale"]): r for r in readback}
updates_by_file = {}
for row in plan:
    updates_by_file.setdefault(row["catalogPath"], {})[row["sourceId"]] = {
        "currentTarget": row["currentTarget"],
        "currentTargetSha256": row["currentTargetSha256"],
        "selectedTarget": row["selectedTarget"],
        "selectedTargetSha256": row["selectedTargetSha256"]
    }
assert len(updates_by_file) == 12

# Verify exact baseline bytes, exact value-only edits, all 13 key sets/orders,
# every non-target value, and all 240 cell readbacks.
catalog_before = {}
catalog_after = {}
expected_changed_files = set()
for path, pin in pins["catalogFiles"].items():
    base_bytes = git("show", f"{BASE}:{path}")
    assert sha(base_bytes) == pin["sha256"]
    assert git("rev-parse", f"{BASE}:{path}").decode().strip() == pin["gitBlob"]
    base_obj = json.loads(base_bytes)
    assert len(base_obj) == pin["keyCount"] == 9494
    order_hash = sha(json.dumps(list(base_obj.keys()), ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    assert order_hash == pin["orderedKeysSha256"]
    worktree_bytes = (REPO / path).read_bytes()
    changes = updates_by_file.get(path, {})
    expected_bytes = patch_bytes(base_bytes, changes) if changes else base_bytes
    if changes:
        expected_changed_files.add(path)
    if worktree_bytes != expected_bytes:
        raise SystemExit(f"catalog exact byte-patch mismatch: {path}")
    actual_obj = json.loads(worktree_bytes)
    assert len(actual_obj) == 9494 and list(actual_obj.keys()) == list(base_obj.keys())
    assert sha(json.dumps(list(actual_obj.keys()), ensure_ascii=False, separators=(",", ":")).encode("utf-8")) == pin["orderedKeysSha256"]
    for key, value in base_obj.items():
        expected_value = changes[key]["selectedTarget"] if key in changes else value
        if actual_obj.get(key) != expected_value:
            raise SystemExit(f"catalog readback/non-target mismatch: {path}:{key}")
    catalog_before[path] = base_obj
    catalog_after[path] = actual_obj
assert len(expected_changed_files) == 12

placeholders = re.compile(r"\{[^{}\r\n]+\}")
markup = re.compile(r"</?[A-Za-z][^<>]*?/?>")
numbers = re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
for key in plan_by_key:
    row = plan_by_key[key]
    cross = ledger_by_key[key]
    assert cross["selectedForApplication"] is True
    assert cross["crossTarget"] == row["selectedTarget"]
    assert cross["crossTargetSha256"] == row["selectedTargetSha256"]
for key, row in ledger_by_key.items():
    rb = readback_by_key[key]
    expected = row["crossTarget"]
    actual = catalog_after[row["catalogPath"]][row["sourceId"]]
    assert actual == expected
    assert rb["expectedTarget"] == expected and rb["actualTarget"] == actual
    assert rb["actualTargetSha256"] == sha(actual.encode("utf-8"))
    assert rb["sourceId"] == row["sourceId"] and rb["catalogPath"] == row["catalogPath"]
    assert rb["status"] == ("applied" if row["selectedForApplication"] else "unchanged-current")
    assert placeholders.findall(actual) == placeholders.findall(row["source"])
    assert markup.findall(actual) == markup.findall(row["source"])
    assert numbers.findall(actual) == numbers.findall(row["source"])
    assert all(literal in actual for literal in row["sourceProtectedLiterals"])

counts = Counter(row["status"] for row in readback)
assert counts == {"applied": 24, "unchanged-current": 216}
assert app_verification["status"] == "PASS"
assert app_verification["parentHead"] == BASE and app_verification["parentTree"] == TREE
assert app_verification["selectedChanges"] == 24 and app_verification["unchangedCells"] == 216
assert app_verification["holdsPreserved"] == 0
assert app_verification["catalogFilesChanged"] == 12 and app_verification["catalogFilesPinned"] == 13
assert app_verification["orderedKeysPerCatalog"] == 9494
assert app_verification["allNonTargetValuesUnchanged"] is True
assert app_verification["orderedCatalogKeysPreserved"] is True
assert app_verification["parentAuthorizationSha256"] == PARENT_AUTH_SHA
assert app_verification["sealedPacketApplicationApproved"] is False

# Compare staged or committed path changes with exactly the 12 locale catalogs
# plus this evidence directory, and reject any untracked or unstaged extras.
expected_evidence = {str(p.relative_to(REPO).as_posix()) for p in EVIDENCE.rglob("*") if p.is_file()}
expected_all = expected_changed_files | expected_evidence
head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()
if head == BASE:
    changed = set(subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=REPO, check=True, capture_output=True, text=True).stdout.splitlines())
    assert not subprocess.run(["git", "diff", "--name-only"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()
else:
    assert subprocess.run(["git", "rev-parse", "HEAD^"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip() == BASE
    changed = set(subprocess.run(["git", "diff", "--name-only", f"{BASE}..HEAD"], cwd=REPO, check=True, capture_output=True, text=True).stdout.splitlines())
assert changed == expected_all, (sorted(changed - expected_all), sorted(expected_all - changed))
assert not subprocess.run(["git", "status", "--porcelain=v1"], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip().startswith("?? ")

print(json.dumps({
    "result": "PASS",
    "parentHead": BASE,
    "parentTree": TREE,
    "readbackCells": len(readback),
    "selectedChanges": 24,
    "unchangedCurrent": 216,
    "holdsPreserved": 0,
    "catalogFilesChanged": len(expected_changed_files),
    "catalogFilesPinned": len(pins["catalogFiles"]),
    "orderedKeysPerCatalog": 9494,
    "orderedCatalogKeysPreserved": True,
    "allNonTargetValuesUnchanged": True,
    "evidenceChecksumListSha256": sha((EVIDENCE / "EVIDENCE-SHA256SUMS.txt").read_bytes()),
    "parentAuthorizationSha256": PARENT_AUTH_SHA
}, ensure_ascii=False, indent=2))
