#!/usr/bin/env python3
from pathlib import Path
from collections import Counter
import hashlib, json, re, subprocess, sys

ROOT = Path(__file__).resolve().parent
AUDIT = ROOT / "cross-audit"
INPUT = ROOT / "candidate-free-input"
PRIMARY = ROOT / "primary-review"
BLIND = ROOT / "independent-blind-review"
HEAD = "f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d"
TREE = "3ba2579c326f8dbac943ba43df77ddd5747a85a1"
INPUT_SUMS = "6b8b67e58028a0af79afad9a115a42b49233df18d2469227fe4153bece68ddb8"
INPUT_MANIFEST = "14d7c9313f4b1eb7a0160712c87bd07089a719bcb05c64fbd8493a31f143a102"
PRIMARY_SUMS = "2875b7e3151a2009b8c24a79434cf70ce79483af9faba23ddb4827ee7c222337"
BLIND_SUMS = "2030ac91f4922865d02d61cb38e42b90cf70aecceb2cf9b998fd2b6a605d65b7"
PLACEHOLDER = re.compile(r"\{[^{}\r\n]+\}")
MARKUP = re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUMBER = re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

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

verify_tree(INPUT, "SHA256SUMS.txt")
verify_tree(PRIMARY, "SHA256SUMS.txt")
verify_tree(BLIND, "SHA256SUMS.txt")
audit_entries = verify_tree(AUDIT, "SHA256SUMS.txt")
root_entries = verify_tree(ROOT, "SHA256SUMS.txt")
assert sha((INPUT / "SHA256SUMS.txt").read_bytes()) == INPUT_SUMS
assert sha((INPUT / "manifest.json").read_bytes()) == INPUT_MANIFEST
assert sha((PRIMARY / "SHA256SUMS.txt").read_bytes()) == PRIMARY_SUMS
assert sha((BLIND / "SHA256SUMS.txt").read_bytes()) == BLIND_SUMS

manifest = j(INPUT / "manifest.json")
window = j(INPUT / "window.json")
primary_summary = j(PRIMARY / "summary.json")
blind_summary = j(BLIND / "summary.json")
cross_summary = j(AUDIT / "summary.json")
live = j(AUDIT / "pinned-state-verification.json")
attest = j(AUDIT / "packet-attestations.json")
authorization = j(ROOT / "application-authorization.json")
task_summary = j(ROOT / "TASK-SUMMARY.json")
assert manifest["head"] == HEAD and manifest["tree"] == TREE
assert window["range"] == [3540, 3559]
assert primary_summary["head"] == HEAD and primary_summary["tree"] == TREE
assert blind_summary["pinnedHead"] == HEAD and blind_summary["pinnedTree"] == TREE
assert live["status"] == "PASS" and live["head"] == HEAD and live["tree"] == TREE
assert live["liveBranchRef"] == HEAD and live["livePullRef"] == HEAD
assert live["allCurrentTargetsMatchPinnedCatalogs"] is True
assert attest["lineageAndCallerVerification"]["reviewedCells"] == 240

source = {r["position"]: r for r in jl(INPUT / "source-cells.jsonl")}
current_rows = jl(INPUT / "current-target-cells.jsonl")
context = {r["position"]: r for r in jl(INPUT / "caller-contexts.jsonl")}
blocks = {r["contextId"]: r for r in jl(INPUT / "caller-context-blocks.jsonl")}
primary = {(r["position"], r["locale"]): r for r in jl(PRIMARY / "primary-ledger.jsonl")}
blind = {(r["position"], r["locale"]): r for r in jl(BLIND / "blind-ledger.jsonl")}
current = {(r["position"], r["locale"]): r for r in current_rows}
ledger_rows = jl(AUDIT / "cross-audit-ledger.jsonl")
plan = jl(ROOT / "application-plan.jsonl")
adjudications = jl(AUDIT / "adjudications.jsonl")
disagreements = jl(AUDIT / "disagreements.jsonl")
decision_diffs = jl(AUDIT / "disposition-differences.jsonl")
assert len(source) == 20 and len(current) == len(primary) == len(blind) == len(ledger_rows) == 240
keys = [(pos, loc) for pos in range(3540, 3560) for loc in window["localeOrder"]]
assert [(r["position"], r["locale"]) for r in ledger_rows] == keys
assert len(plan) == len(adjudications) == 24
assert {(r["position"], r["locale"]) for r in plan} == {(r["position"], r["locale"]) for r in adjudications}
plan_by_key = {(r["position"], r["locale"]): r for r in plan}
audit_by_key = {(r["position"], r["locale"]): r for r in ledger_rows}

for key in keys:
    c = current[key]
    p = primary[key]
    b = blind[key]
    x = audit_by_key[key]
    s = source[key[0]]
    ctx = context[key[0]]
    assert x["head"] == HEAD and x["tree"] == TREE
    for field in ("sourceId", "sourceKey", "source", "sourceSha256"):
        assert x[field] == c[field] == p[field] == b[field] == s[field]
    assert x["currentTarget"] == c["currentTarget"] == p["currentTarget"] == b["currentTarget"]
    assert x["currentTargetSha256"] == c["currentTargetSha256"] == p["currentTargetSha256"] == b["currentTargetSha256"]
    assert x["catalogPath"] == c["catalogPath"] == p["catalogPath"]
    assert x["catalogSha256"] == c["catalogSha256"] == p["catalogSha256"]
    assert x["catalogGitBlob"] == c["catalogGitBlob"] == p["catalogGitBlob"]
    assert x["primaryTarget"] == p["finalTarget"] and x["primaryTargetSha256"] == p["finalTargetSha256"]
    assert x["blindTarget"] == b["target"] and x["blindTargetSha256"] == b["targetSha256"]
    assert x["primaryDisposition"] == p["disposition"]
    assert x["blindDisposition"] == b["disposition"]
    assert x["callerCount"] == ctx["callerCount"] == b["callerCount"] == p["callerContext"]["callerCount"] > 0
    assert x["callerResolution"] == ctx["callerResolution"] == b["callerResolution"] == p["callerContext"]["callerResolution"]
    assert x["directMessageReferences"] == ctx["directMessageReferences"] == b["directMessageReferences"] == p["callerContext"]["directMessageReferences"]
    assert x["callerContextBlockIds"] == ctx["contextBlockIds"]
    assert [ref["contextId"] for ref in b["callerContextBlockRefs"]] == ctx["contextBlockIds"]
    for ref in ctx["directMessageReferences"]:
        assert any(line["line"] == ref["line"] and line["lineSha256"] == ref["lineSha256"] for bid in ctx["contextBlockIds"] for line in blocks[bid]["lines"])
    assert x["crossTargetSha256"] == sha(x["crossTarget"].encode("utf-8"))
    assert x["selectedForApplication"] == (x["crossTarget"] != x["currentTarget"])
    assert x["callerHold"] is False
    source_text = s["source"]
    source_literals = s["sourceProtectedLiterals"]
    for target in (x["currentTarget"], x["primaryTarget"], x["blindTarget"], x["crossTarget"]):
        assert PLACEHOLDER.findall(target) == PLACEHOLDER.findall(source_text)
        assert MARKUP.findall(target) == MARKUP.findall(source_text)
        assert NUMBER.findall(target) == NUMBER.findall(source_text)
        assert all(literal in target for literal in source_literals)
    if x["selectedForApplication"]:
        assert key in plan_by_key
        q = plan_by_key[key]
        assert q["selectedTarget"] == x["crossTarget"] and q["selectedTargetSha256"] == x["crossTargetSha256"]
        assert q["currentTarget"] == x["currentTarget"] and q["currentTargetSha256"] == x["currentTargetSha256"]
        assert q["catalogPath"] == x["catalogPath"]
        assert q["crossDisposition"] == x["crossDisposition"]
    else:
        assert key not in plan_by_key and x["crossDisposition"] == "accept-current"
    assert x["crossDisposition"] in ("accept-current", "correction", "refinement")
    assert (x["crossDisposition"] == "accept-current") == (x["crossTarget"] == x["currentTarget"])

counts = Counter(x["crossDisposition"] for x in ledger_rows)
p_changes = {key for key, row in primary.items() if row["disposition"] != "accept-current"}
b_changes = {key for key, row in blind.items() if row["disposition"] == "propose"}
target_disagreements = [x for x in ledger_rows if x["primaryTarget"] != x["blindTarget"]]
change_class_diffs = [x for x in ledger_rows if not x["reviewerChangeDecisionAgreement"]]
assert counts == Counter({"accept-current": 216, "correction": 11, "refinement": 13})
assert len(plan) == 24 and len(target_disagreements) == 21 and len(change_class_diffs) == 17
assert len(p_changes) == 23 and len(b_changes) == 8
assert cross_summary["crossDispositions"] == {"accept-current": 216, "correction": 11, "refinement": 13}
assert cross_summary["selectedChanges"] == 24 and cross_summary["holds"] == 0
assert cross_summary["targetDisagreements"] == 21 and cross_summary["unresolvedDisagreements"] == 0
assert {(x["position"], x["locale"]) for x in disagreements} == {(x["position"], x["locale"]) for x in target_disagreements}
assert {(x["position"], x["locale"]) for x in decision_diffs} == {(x["position"], x["locale"]) for x in change_class_diffs}
assert authorization["applicationApproved"] is False
assert authorization["approvalStatus"].startswith("pending separate parent authorization")
assert authorization["pinnedHead"] == HEAD and authorization["pinnedTree"] == TREE
assert authorization["applicationPlanSha256"] == sha((ROOT / "application-plan.jsonl").read_bytes())
assert authorization["crossAuditChecksumListSha256"] == sha((AUDIT / "SHA256SUMS.txt").read_bytes())
assert authorization["selectedCellCount"] == 24 and authorization["heldCellCount"] == 0
assert len(authorization["selectedCells"]) == 24
assert task_summary["applicationApproved"] is False and task_summary["selectedChanges"] == 24
assert sha((AUDIT / "cross-audit-ledger.jsonl").read_bytes()) == authorization["crossAuditLedgerSha256"]
assert sha((AUDIT / "summary.json").read_bytes()) == authorization["crossAuditSummarySha256"]

# Re-run the portable candidate-free, primary, blind-copy, and exact cross-audit verifiers.
for args, cwd in (
    (["python3", str(ROOT / "verify_candidate_free.py")], ROOT),
    (["python3", str(PRIMARY / "verify_primary_review.py")], PRIMARY),
    (["python3", str(ROOT / "verify_blind_review_copy.py")], ROOT),
):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)

print(json.dumps({
    "result": "PASS",
    "head": HEAD,
    "tree": TREE,
    "reviewedCells": 240,
    "selectedChanges": 24,
    "dispositions": dict(sorted(counts.items())),
    "primaryProposals": len(p_changes),
    "blindProposals": len(b_changes),
    "targetDisagreements": len(target_disagreements),
    "decisionClassDifferences": len(change_class_diffs),
    "holds": 0,
    "unresolvedDisagreements": 0,
    "candidateFreeManifestJsonSha256": INPUT_MANIFEST,
    "candidateFreeChecksumListSha256": INPUT_SUMS,
    "primaryChecksumListSha256": PRIMARY_SUMS,
    "blindChecksumListSha256": BLIND_SUMS,
    "crossAuditChecksumListSha256": sha((AUDIT / "SHA256SUMS.txt").read_bytes()),
    "taskChecksumListSha256": sha((ROOT / "SHA256SUMS.txt").read_bytes()),
    "applicationApproved": False
}, ensure_ascii=False, indent=2))
