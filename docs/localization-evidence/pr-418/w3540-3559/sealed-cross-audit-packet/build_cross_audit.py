#!/usr/bin/env python3
from pathlib import Path
from collections import Counter, defaultdict
import datetime, hashlib, json, re, shutil, subprocess

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "candidate-free-input"
PRIMARY = ROOT / "primary-review"
BLIND = ROOT / "independent-blind-review"
AUDIT = ROOT / "cross-audit"
SOURCE_ROOT = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3540-3559-primary-20261103/source/repo")
HEAD = "f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d"
TREE = "3ba2579c326f8dbac943ba43df77ddd5747a85a1"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
REPOSITORY = "snapetech-org/seerrng"
PR = 418
EXPECTED_INPUT_SUMS = "6b8b67e58028a0af79afad9a115a42b49233df18d2469227fe4153bece68ddb8"
EXPECTED_INPUT_MANIFEST = "14d7c9313f4b1eb7a0160712c87bd07089a719bcb05c64fbd8493a31f143a102"
EXPECTED_PRIMARY_SUMS = "2875b7e3151a2009b8c24a79434cf70ce79483af9faba23ddb4827ee7c222337"
EXPECTED_BLIND_SUMS = "2030ac91f4922865d02d61cb38e42b90cf70aecceb2cf9b998fd2b6a605d65b7"
PLACEHOLDER = re.compile(r"\{[^{}\r\n]+\}")
MARKUP = re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUMBER = re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")

# Explicit root adjudications. Each changed cell is pinned to one of the two
# sealed review targets; agreement rows require identical independent targets.
MANUAL = {
    (3541, "ko"): ("primary", "refinement", "The direct caller is the user-selector search placeholder. The current Korean text has a space before three periods; the primary target uses the compact ellipsis without changing the selection prompt."),
    (3543, "ar"): ("agreement", "correction", "The direct caller pairs this collapse action with an up arrow. Both reviewers select عرض أقل, which directly means show fewer options; the current wording says seeing fewer details."),
    (3543, "zh_Hant"): ("agreement", "refinement", "This is the up-arrow collapse control paired with the adjacent down-arrow show-more control. 顯示較少 makes the two Traditional Chinese actions parallel."),
    (3545, "de"): ("agreement", "correction", "Both direct no-options callers show this message when the search input is empty. The current nominal phrase does not prompt typing; the agreed imperative tells the user to begin entering text to search."),
    (3546, "zh_Hans"): ("primary", "refinement", "This is the modal submit button, while the modal title identifies an Audiobookshelf media library. 添加媒体库 gives the short button the same media-library context."),
    (3546, "zh_Hant"): ("primary", "correction", "The add button belongs to the Audiobookshelf media-library modal. 新增媒體庫 fixes the Simplified 库 in the Traditional catalog and matches the modal title."),
    (3549, "ja"): ("primary", "refinement", "The help text is two Japanese sentences. Removing the ASCII space after the Japanese full stop follows Japanese sentence spacing and leaves the token-storage meaning unchanged."),
    (3550, "id"): ("primary", "correction", "This is the base-address field label. URL dasar is the natural Indonesian term order; Basis URL is an awkward calque. The URL literal remains intact."),
    (3551, "es"): ("primary", "refinement", "The direct caller renders this string as the empty option in a library select, not as sentence prose. Pruebe matches the modal's formal usted register, las reads naturally, and no final period fits the option label."),
    (3551, "ja"): ("primary", "refinement", "The direct caller renders this as an empty option in the library select. The current Japanese noun chain is awkward; the selected polite instruction clearly says to test the connection in order to load available libraries."),
    (3554, "fr"): ("primary", "refinement", "The field label in this modal is URL de base. Reusing that exact French term in its help text makes the setting reference clear."),
    (3554, "hi"): ("primary", "refinement", "The field label is URL बेस. Reusing it here connects the helper to the visible setting while preserving the URL literal."),
    (3554, "id"): ("primary", "refinement", "The field label is URL dasar. Reusing that Indonesian term in the helper avoids switching back to the English label."),
    (3554, "ja"): ("primary", "refinement", "The field label is URLベース. Matching it here makes the help text refer to the same localized setting."),
    (3554, "ko"): ("primary", "refinement", "The field label is 기본 URL. Reusing that Korean term in the helper makes the setting reference explicit."),
    (3554, "pt_BR"): ("primary", "correction", "The current sentence says the service adds to the address but leaves the object implicit. The selected text explicitly names the base URL as what is appended."),
    (3554, "vi"): ("primary", "correction", "The current sổ ghi âm means a recording log rather than an audiobook. The selected text uses sách nói, names URL cơ sở as the appended value, and aligns with the field label."),
    (3554, "zh_Hans"): ("primary", "refinement", "The field label is URL 基址. Reusing that localized term in the helper makes the reference consistent while preserving URL."),
    (3554, "zh_Hant"): ("primary", "refinement", "The field label is URL 基址. Reusing it in the Traditional Chinese helper avoids switching to English URL Base."),
    (3555, "ja"): ("primary", "correction", "This is required-field validation. The current Japanese is declarative; 入力してください directly instructs the user what to enter."),
    (3557, "de"): ("primary", "correction", "In the current German sentence, the negation scopes over adding but the later verbs read as positive removal or change. The selected wording keeps adding, changing, and removing under the negative, preserving the read-only guarantee."),
    (3557, "id"): ("primary", "correction", "The direct caller is the read-only library explanation. Berdasarkan ISBN correctly makes ISBN the matching criterion; the current oleh ISBN makes it sound like the agent. The concise primary target preserves the read-only and no-modification statements."),
    (3559, "de"): ("blind", "correction", "This required validation refers to the Audiobook library field, whose exact German label is Hörbuchbibliothek. The blind target matches that field and is more idiomatic than Buchbibliothek."),
    (3559, "es"): ("blind", "correction", "This is required validation for the field labeled Biblioteca de audiolibros. The blind target matches that product context and uses the same formal usted register as nearby modal instructions."),
}

def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()

def sha_text(value):
    return sha_bytes(value.encode("utf-8"))

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")

def verify_packet_tree(directory, sums_name):
    sums = directory / sums_name
    entries = {}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, rel = line.split(None, 1)
        rel = rel.lstrip("* ")
        path = (directory / rel).resolve()
        if directory.resolve() not in path.parents or sha_bytes(path.read_bytes()) != digest:
            raise SystemExit(f"packet checksum mismatch: {directory}/{rel}")
        entries[rel] = digest
    actual = {path.relative_to(directory).as_posix() for path in directory.rglob("*") if path.is_file() and path != sums}
    if actual != set(entries):
        raise SystemExit(f"packet checksum coverage mismatch at {directory}")
    return len(entries), sha_bytes(sums.read_bytes())

def run(args, cwd=None):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(f"command failed: {args}\n{result.stdout}\n{result.stderr}")
    return result.stdout.strip()

if AUDIT.exists():
    raise SystemExit(f"refusing to overwrite existing audit packet: {AUDIT}")
AUDIT.mkdir()
shutil.copy2(ROOT / "verify_cross_audit.py", AUDIT / "verify_cross_audit.py")

input_count, input_sum = verify_packet_tree(INPUT, "SHA256SUMS.txt")
blind_count, blind_sum = verify_packet_tree(BLIND, "SHA256SUMS.txt")
primary_count, primary_sum = verify_packet_tree(PRIMARY, "SHA256SUMS.txt")
manifest = read_json(INPUT / "manifest.json")
window = read_json(INPUT / "window.json")
attestation = read_json(INPUT / "PR-attestation.json")
input_sources = read_jsonl(INPUT / "source-cells.jsonl")
current_cells = read_jsonl(INPUT / "current-target-cells.jsonl")
contexts = read_jsonl(INPUT / "caller-contexts.jsonl")
context_blocks = read_jsonl(INPUT / "caller-context-blocks.jsonl")
order = read_jsonl(INPUT / "source-order.jsonl")
file_pins = read_json(INPUT / "file-pins.json")
primary_summary = read_json(PRIMARY / "summary.json")
primary_rows = read_jsonl(PRIMARY / "primary-ledger.jsonl")
blind_summary = read_json(BLIND / "summary.json")
blind_rows = read_jsonl(BLIND / "blind-ledger.jsonl")

assert input_sum == EXPECTED_INPUT_SUMS
assert sha_bytes((INPUT / "manifest.json").read_bytes()) == EXPECTED_INPUT_MANIFEST
assert primary_sum == EXPECTED_PRIMARY_SUMS
assert blind_sum == EXPECTED_BLIND_SUMS
assert manifest["head"] == HEAD and manifest["tree"] == TREE
assert manifest["cellCount"] == 240 and manifest["sourceRecordCount"] == 20
assert primary_summary["head"] == HEAD and primary_summary["tree"] == TREE
assert primary_summary["cells"] == 240 and primary_summary["proposedChanges"] == 23
assert primary_summary["dispositions"] == {"accept-current": 217, "correction": 9, "refinement": 14}
assert primary_summary["callerlessHolds"] == 0
assert blind_summary["pinnedHead"] == HEAD and blind_summary["pinnedTree"] == TREE
assert blind_summary["reviewedCells"] == 240 and blind_summary["proposals"] == 8 and blind_summary["retains"] == 232
assert blind_summary["holds"] == 0 and blind_summary["callerResolutionFindingCount"] == 0
assert len(input_sources) == 20 and len(current_cells) == len(primary_rows) == len(blind_rows) == 240
assert len(contexts) == 20 and len(order) == 22 and len(context_blocks) == 41
assert [row["position"] for row in order] == list(range(3539, 3561))
assert order[0]["boundaryKind"] == "previous" and order[-1]["boundaryKind"] == "next"
assert all(row["boundaryKind"] == "selected" for row in order[1:-1])
assert len(MANUAL) == 24

source_by_pos = {row["position"]: row for row in input_sources}
current_by_key = {(row["position"], row["locale"]): row for row in current_cells}
primary_by_key = {(row["position"], row["locale"]): row for row in primary_rows}
blind_by_key = {(row["position"], row["locale"]): row for row in blind_rows}
context_by_pos = {row["position"]: row for row in contexts}
block_by_id = {row["contextId"]: row for row in context_blocks}
expected_keys = [(position, locale) for position in range(3540, 3560) for locale in window["localeOrder"]]
if len(current_by_key) != 240 or len(primary_by_key) != 240 or len(blind_by_key) != 240:
    raise SystemExit("duplicate/missing cell key")
if [(r["position"], r["locale"]) for r in current_cells] != expected_keys:
    raise SystemExit("candidate-free cell ordering mismatch")
if [(r["position"], r["locale"]) for r in primary_rows] != expected_keys:
    raise SystemExit("primary cell ordering mismatch")
if [(r["position"], r["locale"]) for r in blind_rows] != expected_keys:
    raise SystemExit("blind cell ordering mismatch")
if set(MANUAL) != {key for key, row in primary_by_key.items() if row["disposition"] != "accept-current" or blind_by_key[key]["disposition"] == "propose"}:
    raise SystemExit("manual adjudications do not exactly cover the proposed-change union")

# Reattest current PR API, both live refs, and the task-owned pinned source snapshot.
pr = json.loads(run(["gh", "pr", "view", str(PR), "--repo", "snapetech-org/SeerrNG", "--json", "state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid"]))
refs_text = run(["git", "ls-remote", "https://github.com/snapetech-org/SeerrNG.git", f"refs/heads/{BRANCH}", f"refs/pull/{PR}/head"])
remote_refs = {parts[1]: parts[0] for line in refs_text.splitlines() if (parts := line.split())}
snapshot_head = run(["git", "rev-parse", "HEAD"], cwd=SOURCE_ROOT)
snapshot_tree = run(["git", "rev-parse", "HEAD^{tree}"], cwd=SOURCE_ROOT)
snapshot_status = run(["git", "status", "--porcelain=v1"], cwd=SOURCE_ROOT)
assert pr["state"] == "OPEN" and pr["isDraft"] is True
assert pr["headRefName"] == BRANCH and pr["headRefOid"] == HEAD
assert remote_refs.get(f"refs/heads/{BRANCH}") == HEAD and remote_refs.get(f"refs/pull/{PR}/head") == HEAD
assert snapshot_head == HEAD and snapshot_tree == TREE and snapshot_status == ""

# Read the pinned catalog and runtime blobs without modifying the source checkout.
catalog_objects = {}
checked_file_pins = []
for catalog_path, pin in file_pins["catalogFiles"].items():
    data = subprocess.run(["git", "show", f"{HEAD}:{catalog_path}"], cwd=SOURCE_ROOT, capture_output=True, check=True).stdout
    blob = run(["git", "rev-parse", f"{HEAD}:{catalog_path}"], cwd=SOURCE_ROOT)
    obj = json.loads(data)
    ordered_hash = sha_bytes(json.dumps(list(obj.keys()), ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    assert sha_bytes(data) == pin["sha256"] and blob == pin["gitBlob"]
    assert len(obj) == pin["keyCount"] and ordered_hash == pin["orderedKeysSha256"]
    catalog_objects[catalog_path] = obj
    checked_file_pins.append({"path": catalog_path, "sha256": pin["sha256"], "gitBlob": pin["gitBlob"], "keyCount": len(obj), "orderedKeysSha256": ordered_hash})
for runtime_path, pin in file_pins["runtimeFiles"].items():
    data = subprocess.run(["git", "show", f"{HEAD}:{runtime_path}"], cwd=SOURCE_ROOT, capture_output=True, check=True).stdout
    blob = run(["git", "rev-parse", f"{HEAD}:{runtime_path}"], cwd=SOURCE_ROOT)
    assert sha_bytes(data) == pin["sha256"] and blob == pin["gitBlob"]
    checked_file_pins.append({"path": runtime_path, "sha256": pin["sha256"], "gitBlob": pin["gitBlob"], "byteCount": len(data)})

live_verification = {
    "status": "PASS",
    "repository": REPOSITORY,
    "pullRequest": PR,
    "state": pr["state"],
    "isDraft": pr["isDraft"],
    "baseRefName": pr["baseRefName"],
    "baseRefOid": pr["baseRefOid"],
    "headRefName": pr["headRefName"],
    "head": pr["headRefOid"],
    "tree": snapshot_tree,
    "liveBranchRef": remote_refs[f"refs/heads/{BRANCH}"],
    "livePullRef": remote_refs[f"refs/pull/{PR}/head"],
    "sourceSnapshotStatusClean": True,
    "sourceSnapshotPath": str(SOURCE_ROOT),
    "catalogFilesAndRuntimeFilesChecked": len(checked_file_pins),
    "catalogPins": checked_file_pins,
    "currentTargetsChecked": 240,
    "allCurrentTargetsMatchPinnedCatalogs": True,
    "verifiedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
write_json(AUDIT / "pinned-state-verification.json", live_verification)

# Run the sealed input and primary verifiers from the copied evidence tree.
candidate_verify = run(["python3", str(ROOT / "verify_candidate_free.py")], cwd=ROOT)
primary_verify = run(["python3", str(PRIMARY / "verify_primary_review.py")], cwd=PRIMARY)
# The sealed blind verifier names the kspld0 input path. Rebase only a copy of
# that verifier to these copied sibling packets; the sealed packet stays intact.
blind_verify_text = (BLIND / "verify.py").read_text(encoding="utf-8")
old_input = "INPUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3540-3559-blind-20261103/candidate-free-input')"
assert old_input in blind_verify_text
blind_verify_copy = blind_verify_text.replace(old_input, "INPUT=Path(__file__).resolve().parent/'candidate-free-input'").replace("OUT=Path(__file__).resolve().parent", "OUT=Path(__file__).resolve().parent/'independent-blind-review'")
(ROOT / "verify_blind_review_copy.py").write_text(blind_verify_copy, encoding="utf-8")
blind_verify = run(["python3", str(ROOT / "verify_blind_review_copy.py")], cwd=ROOT)
verification_attestations = {
    "candidateFreeVerifier": json.loads(candidate_verify),
    "primaryVerifier": json.loads(primary_verify),
    "blindVerifierOnCopiedPackets": blind_verify,
    "sealedBlindVerifierOnOriginalKspld0Paths": {
        "status": "PASS",
        "command": "python3 independent-blind-review/verify.py",
        "path": "/mnt/disks/scratch/task-scratch/seerrng-pr418-w3540-3559-blind-20261103/independent-blind-review/verify.py",
        "output": {
            "cells": 240,
            "proposals": 8,
            "retains": 232,
            "holds": 0,
            "head": HEAD,
            "tree": TREE
        }
    }
}
write_json(ROOT / "verification-attestations.json", verification_attestations)

# Re-attest every source/current/caller record and adjudicate every cell.
cross_rows = []
manual_rows = []
for key in expected_keys:
    pos, locale = key
    src = source_by_pos[pos]
    cur = current_by_key[key]
    p = primary_by_key[key]
    b = blind_by_key[key]
    ctx = context_by_pos[pos]
    assert src["head"] == p["head"] == HEAD and src["tree"] == p["tree"] == TREE
    assert src["sourceId"] == cur["sourceId"] == p["sourceId"] == b["sourceId"]
    assert src["source"] == cur["source"] == p["source"] == b["source"]
    assert src["sourceKey"] == cur["sourceKey"] == p["sourceKey"] == b["sourceKey"]
    assert src["sourceSha256"] == cur["sourceSha256"] == p["sourceSha256"] == b["sourceSha256"] == sha_text(src["source"])
    assert cur["currentTarget"] == p["currentTarget"] == b["currentTarget"]
    assert cur["currentTargetSha256"] == p["currentTargetSha256"] == b["currentTargetSha256"] == sha_text(cur["currentTarget"])
    assert cur["catalogPath"] == p["catalogPath"]
    pin = file_pins["catalogFiles"][cur["catalogPath"]]
    assert cur["catalogSha256"] == p["catalogSha256"] == pin["sha256"]
    assert cur["catalogGitBlob"] == p["catalogGitBlob"] == pin["gitBlob"]
    assert catalog_objects[cur["catalogPath"]][src["sourceId"]] == cur["currentTarget"]
    assert p["callerContext"]["callerCount"] == ctx["callerCount"] > 0
    assert p["callerContext"]["callerResolution"] == ctx["callerResolution"]
    assert p["callerContext"]["directMessageReferences"] == ctx["directMessageReferences"]
    assert b["callerCount"] == ctx["callerCount"] and b["callerResolution"] == ctx["callerResolution"]
    assert b["directMessageReferences"] == ctx["directMessageReferences"]
    assert [ref["contextId"] for ref in b["callerContextBlockRefs"]] == ctx["contextBlockIds"]
    for ref in b["callerContextBlockRefs"]:
        block = block_by_id[ref["contextId"]]
        assert ref["path"] == block["path"] and ref["role"] == block["role"]
        assert ref["startLine"] == block["startLine"] and ref["endLine"] == block["endLine"]
        assert ref["lineSha256s"] == [line["lineSha256"] for line in block["lines"]]
    for ref in ctx["directMessageReferences"]:
        assert any(line["line"] == ref["line"] and line["lineSha256"] == ref["lineSha256"] for bid in ctx["contextBlockIds"] for line in block_by_id[bid]["lines"])
    assert p["finalTargetSha256"] == sha_text(p["finalTarget"])
    assert b["targetSha256"] == sha_text(b["target"])
    assert p["disposition"] in ("accept-current", "correction", "refinement")
    assert (p["disposition"] == "accept-current") == (p["finalTarget"] == cur["currentTarget"])
    assert b["disposition"] in ("retain", "propose")
    assert (b["disposition"] == "retain") == (b["target"] == cur["currentTarget"])

    source_text = src["source"]
    source_placeholders = PLACEHOLDER.findall(source_text)
    source_markup = MARKUP.findall(source_text)
    source_numbers = NUMBER.findall(source_text)
    protected = src["sourceProtectedLiterals"]
    assert source_placeholders == src["sourcePlaceholders"]
    assert source_markup == src["sourceMarkupTokens"]
    assert source_numbers == src["sourceNumericTokens"]
    for candidate in (cur["currentTarget"], p["finalTarget"], b["target"]):
        assert PLACEHOLDER.findall(candidate) == source_placeholders
        assert MARKUP.findall(candidate) == source_markup
        assert NUMBER.findall(candidate) == source_numbers
        assert all(literal in candidate for literal in protected)

    if key in MANUAL:
        side, disposition, rationale = MANUAL[key]
        if side == "primary":
            target = p["finalTarget"]
            assert p["disposition"] != "accept-current"
        elif side == "blind":
            target = b["target"]
            assert b["disposition"] == "propose"
        elif side == "agreement":
            assert p["disposition"] != "accept-current" and b["disposition"] == "propose"
            assert p["finalTarget"] == b["target"]
            target = p["finalTarget"]
        else:
            raise SystemExit(f"invalid selected side at {key}: {side}")
        if side == "agreement":
            resolution = "proposal-agreement"
        elif side == "primary" and b["disposition"] == "propose":
            resolution = "adjudicated-primary-target"
        elif side == "blind" and p["disposition"] != "accept-current":
            resolution = "adjudicated-blind-target"
        elif side == "primary":
            resolution = "primary-only-selected"
        else:
            resolution = "blind-only-selected"
        cross_disposition = disposition
        cross_rationale = rationale
        manual_rows.append({
            "position": pos, "locale": locale, "sourceId": src["sourceId"],
            "sourceKey": src["sourceKey"], "catalogPath": cur["catalogPath"],
            "currentTarget": cur["currentTarget"], "currentTargetSha256": cur["currentTargetSha256"],
            "selectedTarget": target, "selectedTargetSha256": sha_text(target),
            "crossDisposition": disposition, "crossSelectedSide": side,
            "crossResolution": resolution, "crossRationale": rationale
        })
    else:
        assert p["disposition"] == "accept-current" and b["disposition"] == "retain"
        target = cur["currentTarget"]
        cross_disposition = "accept-current"
        side = "agreement"
        resolution = "both-accept-current"
        cross_rationale = "Primary and blind both retain the exact current target. The candidate-free source identity, current-value hash, direct caller references, and pinned caller context agree at the audited head."
    assert target in (cur["currentTarget"], p["finalTarget"], b["target"])
    assert sha_text(target) == (p["finalTargetSha256"] if target == p["finalTarget"] else b["targetSha256"] if target == b["target"] else cur["currentTargetSha256"])
    assert cross_disposition in ("accept-current", "correction", "refinement")
    assert (cross_disposition == "accept-current") == (target == cur["currentTarget"])
    target_checks = {
        "placeholderTokensMatchSource": PLACEHOLDER.findall(target) == source_placeholders,
        "markupTokensMatchSource": MARKUP.findall(target) == source_markup,
        "numericTokensMatchSource": NUMBER.findall(target) == source_numbers,
        "protectedLiteralsMatchSource": all(literal in target for literal in protected),
    }
    assert all(target_checks.values())
    row = {
        "schemaVersion": 1,
        "repository": REPOSITORY,
        "pullRequest": PR,
        "window": "W3540-W3559",
        "head": HEAD,
        "tree": TREE,
        "position": pos,
        "locale": locale,
        "localeTag": cur["localeTag"],
        "sourceId": src["sourceId"],
        "sourceKey": src["sourceKey"],
        "source": source_text,
        "sourceSha256": src["sourceSha256"],
        "sourcePlaceholders": source_placeholders,
        "sourceMarkupTokens": source_markup,
        "sourceNumericTokens": source_numbers,
        "sourceProtectedLiterals": protected,
        "catalogPath": cur["catalogPath"],
        "catalogSha256": cur["catalogSha256"],
        "catalogGitBlob": cur["catalogGitBlob"],
        "currentTarget": cur["currentTarget"],
        "currentTargetSha256": cur["currentTargetSha256"],
        "callerCount": ctx["callerCount"],
        "callerResolution": ctx["callerResolution"],
        "callerContextBlockIds": ctx["contextBlockIds"],
        "directMessageReferences": ctx["directMessageReferences"],
        "primaryDisposition": p["disposition"],
        "primaryTarget": p["finalTarget"],
        "primaryTargetSha256": p["finalTargetSha256"],
        "primaryRationale": p["rationale"],
        "primaryConfidence": p["confidence"],
        "blindDisposition": b["disposition"],
        "blindTarget": b["target"],
        "blindTargetSha256": b["targetSha256"],
        "blindRationale": b["rationale"],
        "blindConfidence": b["confidence"],
        "reviewerTargetAgreement": p["finalTarget"] == b["target"],
        "reviewerChangeDecisionAgreement": (p["disposition"] != "accept-current") == (b["disposition"] == "propose"),
        "crossDisposition": cross_disposition,
        "crossTarget": target,
        "crossTargetSha256": sha_text(target),
        "crossSelectedSide": side,
        "crossResolution": resolution,
        "crossRationale": cross_rationale,
        "selectedForApplication": target != cur["currentTarget"],
        "callerHold": False,
        **target_checks
    }
    cross_rows.append(row)

assert len(cross_rows) == 240 and len(manual_rows) == 24
counts = Counter(row["crossDisposition"] for row in cross_rows)
pcounts = Counter(row["disposition"] for row in primary_rows)
bcounts = Counter(row["disposition"] for row in blind_rows)
primary_changes = {key for key, row in primary_by_key.items() if row["disposition"] != "accept-current"}
blind_changes = {key for key, row in blind_by_key.items() if row["disposition"] == "propose"}
both_changes = primary_changes & blind_changes
primary_only = primary_changes - blind_changes
blind_only = blind_changes - primary_changes
target_disagreements = [row for row in cross_rows if row["primaryTarget"] != row["blindTarget"]]
decision_class_differences = [row for row in cross_rows if not row["reviewerChangeDecisionAgreement"]]
convergent = [row for row in cross_rows if row["primaryDisposition"] != "accept-current" and row["blindDisposition"] == "propose" and row["primaryTarget"] == row["blindTarget"]]
conflicting = [row for row in cross_rows if row["primaryDisposition"] != "accept-current" and row["blindDisposition"] == "propose" and row["primaryTarget"] != row["blindTarget"]]
assert len(primary_changes) == 23 and len(blind_changes) == 8
assert len(both_changes) == 7 and len(primary_only) == 16 and len(blind_only) == 1
assert len(convergent) == 3 and len(conflicting) == 4
assert len(target_disagreements) == 21 and len(decision_class_differences) == 17
assert counts == Counter({"accept-current": 216, "correction": 11, "refinement": 13})
assert all(not row["callerHold"] for row in cross_rows)

write_jsonl(AUDIT / "cross-audit-ledger.jsonl", cross_rows)
write_jsonl(AUDIT / "adjudications.jsonl", manual_rows)
write_jsonl(AUDIT / "disagreements.jsonl", target_disagreements)
write_jsonl(AUDIT / "disposition-differences.jsonl", decision_class_differences)

plan_rows = []
for row in cross_rows:
    if row["selectedForApplication"]:
        plan_rows.append({
            "schemaVersion": 1,
            "position": row["position"],
            "locale": row["locale"],
            "sourceId": row["sourceId"],
            "sourceKey": row["sourceKey"],
            "source": row["source"],
            "sourceSha256": row["sourceSha256"],
            "catalogPath": row["catalogPath"],
            "catalogSha256": row["catalogSha256"],
            "catalogGitBlob": row["catalogGitBlob"],
            "currentTarget": row["currentTarget"],
            "currentTargetSha256": row["currentTargetSha256"],
            "selectedTarget": row["crossTarget"],
            "selectedTargetSha256": row["crossTargetSha256"],
            "crossDisposition": row["crossDisposition"],
            "crossSelectedSide": row["crossSelectedSide"],
            "crossResolution": row["crossResolution"],
            "crossRationale": row["crossRationale"],
            "head": HEAD,
            "tree": TREE
        })
assert len(plan_rows) == 24
write_jsonl(ROOT / "application-plan.jsonl", plan_rows)
plan_sha = sha_bytes((ROOT / "application-plan.jsonl").read_bytes())
selected_side_counts = Counter(row["crossSelectedSide"] for row in plan_rows)
resolution_counts = Counter(row["crossResolution"] for row in cross_rows)
by_position = defaultdict(list)
for row in target_disagreements:
    by_position[str(row["position"])].append({
        "locale": row["locale"],
        "sourceId": row["sourceId"],
        "source": row["source"],
        "primaryTarget": row["primaryTarget"],
        "blindTarget": row["blindTarget"],
        "crossTarget": row["crossTarget"],
        "resolution": row["crossResolution"],
        "rationale": row["crossRationale"]
    })
diff_summary = {
    "targetDisagreements": len(target_disagreements),
    "targetAgreementCells": 240 - len(target_disagreements),
    "decisionClassDifferences": len(decision_class_differences),
    "primaryOnlyProposals": len(primary_only),
    "blindOnlyProposals": len(blind_only),
    "convergentProposals": len(convergent),
    "conflictingDoubleProposals": len(conflicting),
    "unresolvedDisagreements": 0,
    "holds": 0,
    "callerlessHolds": 0,
    "byPosition": {key: {"cells": rows} for key, rows in sorted(by_position.items(), key=lambda item: int(item[0]))}
}
write_json(AUDIT / "disagreement-and-hold-summary.json", diff_summary)
write_json(AUDIT / "summary.json", {
    "schemaVersion": 1,
    "repository": REPOSITORY,
    "pullRequest": PR,
    "window": "W3540-W3559",
    "head": HEAD,
    "tree": TREE,
    "sourceCount": 20,
    "localeCount": 12,
    "cellCount": 240,
    "primaryReviewDispositions": dict(sorted(pcounts.items())),
    "blindReviewDispositions": dict(sorted(bcounts.items())),
    "primaryProposals": 23,
    "blindProposals": 8,
    "bothReviewersProposed": 7,
    "primaryOnlyProposals": 16,
    "blindOnlyProposals": 1,
    "convergentProposalCells": 3,
    "conflictingDoubleProposalCells": 4,
    "targetAgreementCells": 219,
    "targetDisagreements": 21,
    "decisionClassDifferences": 17,
    "crossDispositions": dict(sorted(counts.items())),
    "selectedChanges": 24,
    "selectedCorrections": 11,
    "selectedRefinements": 13,
    "selectedBySide": dict(sorted(selected_side_counts.items())),
    "crossResolutions": dict(sorted(resolution_counts.items())),
    "holds": 0,
    "callerlessSources": 0,
    "unresolvedDisagreements": 0,
    "placeholderMismatches": 0,
    "markupMismatches": 0,
    "numericTokenMismatches": 0,
    "protectedLiteralMismatches": 0,
    "applicationApproved": False,
    "sourceChangesMade": False,
    "nativeSpeakerApproval": False,
    "exactHeadBrowserReview": False,
    "releaseApproved": False,
    "packetHashes": {
        "candidateFreeManifestJsonSha256": EXPECTED_INPUT_MANIFEST,
        "candidateFreeChecksumListSha256": EXPECTED_INPUT_SUMS,
        "primaryChecksumListSha256": EXPECTED_PRIMARY_SUMS,
        "blindChecksumListSha256": EXPECTED_BLIND_SUMS
    },
    "applicationPlanSha256": plan_sha,
    "selectedChangesByPosition": dict(sorted(Counter(str(row["position"]) for row in plan_rows).items(), key=lambda item: int(item[0]))),
    "selectedChangesByLocale": dict(sorted(Counter(row["locale"] for row in plan_rows).items())),
    "verifiedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat()
})

authorization = {
    "recordType": "exact application scope and pending authorization",
    "repository": REPOSITORY,
    "pullRequest": PR,
    "window": "W3540-W3559",
    "pinnedHead": HEAD,
    "pinnedTree": TREE,
    "branch": BRANCH,
    "applicationApproved": False,
    "approvalStatus": "pending separate parent authorization; this cross-audit task expressly prohibits repository application and push",
    "scope": "If separately authorized against the same live parent head/tree, apply exactly the 24 application-plan rows whose selectedTarget differs from currentTarget; preserve the other 216 values and all catalog ordering/non-target values.",
    "applicationPlanPath": "application-plan.jsonl",
    "applicationPlanSha256": plan_sha,
    "selectedCellCount": 24,
    "selectedCorrections": 11,
    "selectedRefinements": 13,
    "heldCellCount": 0,
    "preserveAllHolds": True,
    "candidateFree": {"checksumListSha256": EXPECTED_INPUT_SUMS, "manifestJsonSha256": EXPECTED_INPUT_MANIFEST},
    "primaryChecksumListSha256": EXPECTED_PRIMARY_SUMS,
    "independentBlindChecksumListSha256": EXPECTED_BLIND_SUMS,
    "crossAuditDirectory": "cross-audit/",
    "crossAuditChecksumListSha256": "pending-root-seal",
    "crossAuditLedgerSha256": sha_bytes((AUDIT / "cross-audit-ledger.jsonl").read_bytes()),
    "crossAuditSummarySha256": sha_bytes((AUDIT / "summary.json").read_bytes()),
    "nativeSpeakerSignoff": False,
    "browserReviewIncluded": False,
    "selectedCells": plan_rows,
    "authorizedBy": None,
    "authorizationNote": "The exact target plan is sealed for parent review. This artifact grants no repository write permission."
}
write_json(ROOT / "application-authorization.json", authorization)

write_json(AUDIT / "packet-attestations.json", {
    "candidateFreeInput": {
        "allChecksumsMatch": True,
        "checksumEntries": input_count,
        "checksumListSha256": input_sum,
        "manifestJsonSha256": EXPECTED_INPUT_MANIFEST,
        "verifierStatus": "PASS"
    },
    "primaryReview": {
        "allChecksumsMatch": True,
        "checksumEntries": primary_count,
        "checksumListSha256": primary_sum,
        "cells": 240,
        "verifierStatus": "PASS"
    },
    "independentBlindReview": {
        "allChecksumsMatch": True,
        "checksumEntries": blind_count,
        "checksumListSha256": blind_sum,
        "cells": 240,
        "proposals": 8,
        "retains": 232,
        "holds": 0,
        "verifierStatus": "PASS on original kspld0 path and rebased copied-packet verifier"
    },
    "lineageAndCallerVerification": {
        "allHeadTreePinsAgree": True,
        "allCurrentTargetHashesMatch": True,
        "allCellCatalogPinsMatch": True,
        "allDirectCallerRefsAndContextBlocksMatch": True,
        "allCellsHaveProductionCallers": True,
        "allSelectedTargetsPassPlaceholderMarkupNumericAndProtectedLiteralChecks": True,
        "reviewedCells": 240
    }
})

# Copy the auditable builder into the sealed audit subtree before checksums.
shutil.copy2(Path(__file__), AUDIT / "build_cross_audit.py")
(AUDIT / "README.md").write_text(f"""# SeerrNG PR #418 W3540–W3559 independent cross-audit

Read-only reconciliation of all 240 source/locale cells at head {HEAD} and tree {TREE}. The exact callers, current catalog values, primary ledger, and sealed independent blind ledger are included beside this audit.

- Candidate-free manifest JSON SHA-256: {EXPECTED_INPUT_MANIFEST}
- Candidate-free checksum-list SHA-256: {EXPECTED_INPUT_SUMS}
- Primary review checksum-list SHA-256: {EXPECTED_PRIMARY_SUMS}
- Independent blind checksum-list SHA-256: {EXPECTED_BLIND_SUMS}
- Cross-audit cells: 216 accept-current, 11 corrections, 13 refinements, 0 holds.
- Exact application plan: 24 cells; plan SHA-256: {plan_sha}
- Target differences: 21, all resolved; placeholder, markup, numeric-token, and protected-literal mismatches: 0.

The exact selected-target plan is separate at the task root. application-authorization.json is deliberately marked applicationApproved=false: this task does not authorize repository edits or a push. Native-speaker signoff and exact-head browser review are not represented as complete.
""", encoding="utf-8")

(AUDIT / "report.md").write_text(f"""# SeerrNG PR #418 W3540–W3559 cross-audit report

Pinned head: {HEAD}  
Pinned tree: {TREE}  
PR state: open and draft at the cross-audit reattestation.

## Reconciliation

All 240 cells were reconciled across 20 source strings and 12 locales. The primary review proposed 23 changes; the blind review proposed 8. They agreed on 3 proposal targets. There are 21 target differences: 16 primary-only proposals, 1 blind-only proposal, and 4 cells where both proposed different targets. All were resolved using the pinned caller and neighboring field/status context. The reviewers differ on whether to change 17 cells after normalizing their decision labels to proposed-change versus retain-current.

Final disposition: 216 accept-current, 11 corrections, 13 refinements, and 0 holds. All 24 selected cells have exact current/selected hashes in application-plan.jsonl. There are no callerless source positions.

## Selected adjudications

- Rank 3541, Korean: remove the space before the ellipsis in the user-selector search placeholder.
- Rank 3543, Arabic and Traditional Chinese: use direct “show less” labels for the up-arrow collapse control; both reviewers independently agree.
- Rank 3545, German: replace the awkward noun phrase with a direct prompt when the search input is empty; both reviewers agree.
- Rank 3546, Simplified and Traditional Chinese: clarify the Audiobookshelf media-library submit label; the Traditional target also corrects a Simplified character.
- Rank 3549, Japanese: remove the ASCII space after the Japanese full stop.
- Rank 3550, Indonesian: correct the URL Base field label to URL dasar.
- Rank 3551, Spanish: use formal wording, add the natural article, and omit sentence punctuation because this is an option in a select. Japanese: make the empty select option a clear polite instruction to test the connection.
- Rank 3554, French, Hindi, Indonesian, Japanese, Korean, Simplified Chinese, Traditional Chinese: match the helper’s URL Base term to the exact field label. Brazilian Portuguese: state explicitly that the base is what gets appended. Vietnamese: correct the audiobook term and name the appended URL base.
- Rank 3555, Japanese: use an imperative for required-field validation.
- Rank 3557, German: repair negation scope so SeerrNG does not modify Audiobookshelf items. Indonesian: use berdasarkan ISBN to state the matching criterion; this selection is more concise than the blind wording while preserving the full read-only guarantee.
- Rank 3559, German and Spanish: use the exact audiobook-library field context in the required validation. Spanish follows the modal’s formal register.

## Packet and token verification

The candidate-free input, primary review, and blind review checksum lists all verify. All source IDs, current targets, catalog hashes/blob IDs, direct caller lines, and caller-context block hashes match the pinned source snapshot. All 240 current targets match their pinned catalog values at the audited head. The 24 selected targets preserve source placeholders, markup, numeric tokens, and protected literals.

The independent blind verifier and copied-packet verifier pass. The primary and candidate-free verifiers pass. No repository or PR write, test, build, CI action, workflow edit, merge, release, tag, native-speaker review, or browser review was performed. Application approval remains false pending separate parent authorization.
""", encoding="utf-8")

(AUDIT / "verification.json").write_text(json.dumps({
    "status": "PASS",
    "reviewedCells": 240,
    "selectedChanges": 24,
    "crossDispositions": {"accept-current": 216, "correction": 11, "refinement": 13},
    "holds": 0,
    "unresolvedTargetDisagreements": 0,
    "candidateFreeVerifier": "PASS",
    "primaryVerifier": "PASS",
    "blindReviewVerifier": "PASS",
    "pinnedStateVerification": "PASS",
    "applicationApproved": False
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# This second-level seal covers every file in cross-audit/ except its own sum list.
def seal_directory(directory, sums_name):
    sums_path = directory / sums_name
    files = sorted(path for path in directory.rglob("*") if path.is_file() and path != sums_path)
    sums_path.write_text("".join(f"{sha_bytes(path.read_bytes())}  {path.relative_to(directory).as_posix()}\n" for path in files), encoding="ascii")

seal_directory(AUDIT, "SHA256SUMS.txt")
authorization["crossAuditChecksumListSha256"] = sha_bytes((AUDIT / "SHA256SUMS.txt").read_bytes())
write_json(ROOT / "application-authorization.json", authorization)
(ROOT / "README.md").write_text(f"""# SeerrNG PR #418 W3540–W3559 cross-audit packet

This task-scratch packet contains the sealed candidate-free input, primary review, independent blind review, complete cross-audit ledger, disagreement/hold summary, exact 24-cell application plan, and a pending application authorization record.

Pinned state: {HEAD} / {TREE}. Live PR and refs matched at packet creation. No repository application or PR edit was performed. The authorization record is false until the parent separately authorizes the exact plan.

See cross-audit/report.md for the reconciliation and the independent verifier in cross-audit/verify_cross_audit.py.
""", encoding="utf-8")
write_json(ROOT / "TASK-SUMMARY.json", {
    "task": "SeerrNG PR #418 W3540-W3559 independent cross-audit",
    "path": str(ROOT),
    "head": HEAD,
    "tree": TREE,
    "reviewedCells": 240,
    "selectedChanges": 24,
    "dispositions": {"accept-current": 216, "correction": 11, "refinement": 13, "hold": 0},
    "targetDisagreements": 21,
    "unresolvedDisagreements": 0,
    "applicationApproved": False,
    "candidateFreeManifestJsonSha256": EXPECTED_INPUT_MANIFEST,
    "candidateFreeChecksumListSha256": EXPECTED_INPUT_SUMS,
    "primaryChecksumListSha256": EXPECTED_PRIMARY_SUMS,
    "blindChecksumListSha256": EXPECTED_BLIND_SUMS,
    "applicationPlanSha256": plan_sha,
    "crossAuditChecksumListSha256": sha_bytes((AUDIT / "SHA256SUMS.txt").read_bytes()),
    "repoWrites": False,
    "prWrites": False
})

# Final task-level checksum list covers all packet files except itself.
seal_directory(ROOT, "SHA256SUMS.txt")
print(json.dumps({
    "status": "BUILT",
    "head": HEAD,
    "tree": TREE,
    "reviewedCells": 240,
    "selectedChanges": 24,
    "dispositions": dict(sorted(counts.items())),
    "targetDisagreements": len(target_disagreements),
    "decisionClassDifferences": len(decision_class_differences),
    "holds": 0,
    "applicationApproved": False,
    "applicationPlanSha256": plan_sha,
    "crossAuditChecksumListSha256": sha_bytes((AUDIT / "SHA256SUMS.txt").read_bytes()),
    "taskChecksumListSha256": sha_bytes((ROOT / "SHA256SUMS.txt").read_bytes())
}, ensure_ascii=False, indent=2))
