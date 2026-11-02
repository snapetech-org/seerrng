#!/usr/bin/env python3
import collections
import datetime
import hashlib
import json
import re
import subprocess
from pathlib import Path

PRIMARY = Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2600-2699-primary-20261102")
CROSS = Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2600-2699-crossreview-20261102")
ADJ = Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2600-2699-adjudication-20261102")
OUT = Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-w2600-2699-application-plan-20261102")
REPO = Path("/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng")
EXPECTED_HEAD = "9242898e23f7f25d515d10b5b0b51df322e395fb"
EXPECTED_TREE = "06cfd94ee611684c33e9e78af9d8bb60a2e98825"
EXPECTED_BASE = "221d8e0d542802da7529cd272c928cc747677e5c"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
OWNER = "snapetech-org/seerrng"
SHA_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|\})")
TAG_RE = re.compile(r"</?([A-Za-z][A-Za-z0-9:_-]*)\b[^>]*>")

def sha_text(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()

def raw_rows(path):
    rows, raws = [], []
    for raw in path.read_text(encoding="utf-8").splitlines():
        rows.append(json.loads(raw))
        raws.append(raw)
    return rows, raws

def indexed(rows, raws, label):
    values, raw_by_key = {}, {}
    for row, raw in zip(rows, raws):
        key = (row["sourcePosition"], row["locale"])
        if key in values:
            raise ValueError(f"duplicate {label} cell {key}")
        values[key], raw_by_key[key] = row, raw
    return values, raw_by_key

def verify_sums(directory):
    sums = directory / "SHA256SUMS"
    checked = []
    for line in sums.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        candidate = directory / name
        if not candidate.is_file() or sha_bytes(candidate.read_bytes()) != digest:
            raise ValueError(f"checksum mismatch {candidate}")
        checked.append({"file": name, "sha256": digest})
    return {"directory": str(directory), "sha256SumsFileSha256": sha_bytes(sums.read_bytes()), "verifiedFiles": checked}

def verify_input_sums(directory):
    sums = directory / "INPUT-SHA256SUMS"
    checked = []
    for line in sums.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        candidate = directory / name
        if not candidate.is_file() or sha_bytes(candidate.read_bytes()) != digest:
            raise ValueError(f"input checksum mismatch {candidate}")
        checked.append({"file": name, "sha256": digest})
    return checked

def git(*args):
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()

def gh_json(args):
    return json.loads(subprocess.check_output(["gh", *args], text=True))

def jsonl_write(path, rows):
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")

# Verify the three sealed input packets before combining them.
primary_packet = verify_sums(PRIMARY)
primary_input_checks = verify_input_sums(PRIMARY)
cross_packet = verify_sums(CROSS)
adjudication_packet = verify_sums(ADJ)
all_seven_path = OUT / "all-seven-pr-head-snapshot.json"
all_seven_snapshot = json.loads(all_seven_path.read_text(encoding="utf-8"))
if len(all_seven_snapshot.get("pullRequests", [])) != 7:
    raise ValueError("all-seven PR head snapshot is incomplete")
seerr_snapshot = next((x["pr"] for x in all_seven_snapshot["pullRequests"] if x["repository"].lower() == OWNER.lower() and x["pullRequest"] == 418), None)
if seerr_snapshot is None or seerr_snapshot["headRefOid"] != EXPECTED_HEAD or seerr_snapshot["headTree"] != EXPECTED_TREE:
    raise ValueError("all-seven snapshot does not contain the pinned SeerrNG head/tree")

primary_rows, primary_raws = raw_rows(PRIMARY / "primary-review-ledger.jsonl")
primary, primary_line = indexed(primary_rows, primary_raws, "primary")
source_rows, source_raws = raw_rows(PRIMARY / "source-current-cells.jsonl")
source_cells, _ = indexed(source_rows, source_raws, "source/current")
cross_rows, cross_raws = raw_rows(CROSS / "crossreview-ledger.jsonl")
cross, cross_line = indexed(cross_rows, cross_raws, "cross-review")
adj_rows, adj_raws = raw_rows(ADJ / "adjudication-ledger.jsonl")
adj, adj_line = indexed(adj_rows, adj_raws, "adjudication")

if len(primary) != 1200 or len(source_cells) != 1200:
    raise ValueError(f"expected 1200 base cells, got primary={len(primary)} source={len(source_cells)}")
expected_locales = {"ar", "de", "es", "fr", "hi", "id", "ja", "ko", "pt_BR", "vi", "zh_Hans", "zh_Hant"}
if {pos for pos, locale in primary} != set(range(2600, 2700)) or {locale for pos, locale in primary} != expected_locales:
    raise ValueError("source-position or locale grid differs from W2600-W2699 scope")
if any(sum(1 for pos, loc in primary if pos == p) != 12 for p in range(2600, 2700)):
    raise ValueError("each source position must have all twelve locales")
if any(sum(1 for pos, loc in primary if loc == locale) != 100 for locale in expected_locales):
    raise ValueError("each locale must have all 100 source positions")
if len(cross) != 314 or len(adj) != 25:
    raise ValueError(f"unexpected review counts cross={len(cross)} adjudication={len(adj)}")
if len({(r["sourceId"], r["locale"]) for r in primary_rows}) != 1200:
    raise ValueError("duplicate sourceId/locale pair in primary ledger")

# Re-attest canonical GitHub PR head and branch before reading catalogs.
pr = gh_json(["pr", "view", "418", "--repo", OWNER, "--json",
              "baseRefOid,baseRefName,headRefOid,headRefName,state,isDraft,updatedAt,url"])
local_head = git("rev-parse", "HEAD")
local_tree = git("rev-parse", "HEAD^{tree}")
local_branch = git("branch", "--show-current")
local_status = git("status", "--porcelain")
github_remote_branch = git("ls-remote", "github", f"refs/heads/{BRANCH}").split()[0]
github_ref = gh_json(["api", f"repos/{OWNER}/git/ref/heads/{BRANCH}"])["object"]["sha"]
head_commit = gh_json(["api", f"repos/{OWNER}/git/commits/{EXPECTED_HEAD}"])
base_commit = gh_json(["api", f"repos/{OWNER}/git/commits/{EXPECTED_BASE}"])
local_origin_ref = git("rev-parse", f"origin/{BRANCH}")
reattest = {
    "queriedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "repository": OWNER, "pullRequest": 418, "pullRequestSnapshot": pr,
    "expected": {"baseCommit": EXPECTED_BASE, "headCommit": EXPECTED_HEAD, "headTree": EXPECTED_TREE, "headBranch": BRANCH},
    "localWorktree": {"path": str(REPO), "head": local_head, "tree": local_tree, "branch": local_branch, "porcelainStatus": local_status},
    "canonicalGithubRemote": {"remoteName": "github", "branchRef": f"refs/heads/{BRANCH}",
                              "branchHead": github_remote_branch, "apiRefHead": github_ref},
    "headTreeFromGithubCommitApi": head_commit["tree"]["sha"],
    "baseTreeFromGithubCommitApi": base_commit["tree"]["sha"],
    "localOriginMirrorRef": {"remoteName": "origin", "branchHead": local_origin_ref, "isCanonical": False,
                             "note": "This worktree maps origin to a local bare mirror. Canonical PR/head re-attestation uses the github remote and GitHub API."},
    "matchesExpected": {
        "prOpen": pr["state"] == "OPEN", "prDraft": pr["isDraft"] is True,
        "baseCommit": pr["baseRefOid"] == EXPECTED_BASE,
        "headCommit": pr["headRefOid"] == EXPECTED_HEAD,
        "headBranch": pr["headRefName"] == BRANCH,
        "localHead": local_head == EXPECTED_HEAD, "localTree": local_tree == EXPECTED_TREE,
        "localBranch": local_branch == BRANCH, "worktreeClean": local_status == "",
        "githubRemoteBranch": github_remote_branch == EXPECTED_HEAD,
        "githubApiRef": github_ref == EXPECTED_HEAD,
        "githubHeadTree": head_commit["tree"]["sha"] == EXPECTED_TREE,
    },
}
if not all(reattest["matchesExpected"].values()):
    raise ValueError("head/base/tree/branch re-attestation failed")

# Load exact-head catalogs and verify every source/current value and catalog pin.
catalogs, catalog_meta = {}, {}
for locale in sorted({r["locale"] for r in primary_rows}):
    path = f"src/i18n/locale/{locale}.json"
    raw = subprocess.check_output(["git", "-C", str(REPO), "show", f"{EXPECTED_HEAD}:{path}"])
    catalogs[locale] = json.loads(raw)
    catalog_meta[locale] = {"path": path, "blob": git("rev-parse", f"{EXPECTED_HEAD}:{path}"), "fileSha256": sha_bytes(raw)}
source_path = "src/i18n/locale/en.json"
source_raw = subprocess.check_output(["git", "-C", str(REPO), "show", f"{EXPECTED_HEAD}:{source_path}"])
source_catalog = json.loads(source_raw)
source_meta = {"path": source_path, "blob": git("rev-parse", f"{EXPECTED_HEAD}:{source_path}"), "fileSha256": sha_bytes(source_raw)}

plan, changes, readback = [], [], []
errors = []
final_counts, locale_changes = collections.Counter(), collections.Counter()
changed_proposals = changed_additional = unchanged_current = 0
structural_checks = {"placeholderNameSets": 0, "markupTagSets": 0, "protectedLiterals": 0}
proposal_keys, sample_keys, additional_keys = set(), set(), set()

for key in sorted(primary):
    p = primary[key]
    s = source_cells[key]
    c = cross.get(key)
    a = adj.get(key)
    pos, locale = key

    # Exact correspondence across primary, source/current, catalogs, and hashes.
    checks = {
        "sourceId": (p["sourceId"], s["sourceId"]),
        "sourceText": (p["source"], s["source"]),
        "sourceTextSha": (p["sourceTextSha256"], s["sourceTextSha256"]),
        "currentTarget": (p["currentTarget"], s["currentTarget"]),
        "currentHash": (p["currentTargetHash"], s["currentTargetHash"]),
        "callerRef": (p["callerContextRef"], s["callerContextRef"]),
        "callerSha": (p["callerContextSha256"], s["callerContextSha256"]),
        "localeBlob": (p["localeBlob"], s["localeBlob"]),
        "sourceBlob": (p["sourceCatalogBlob"], s["sourceCatalogBlob"]),
    }
    for field, values in checks.items():
        if len(set(values)) != 1:
            errors.append({"key": key, "field": field, "values": values})
    if sha_text(p["source"]) != p["sourceTextSha256"]:
        errors.append({"key": key, "field": "sourceTextSha256"})
    if sha_text(p["currentTarget"]) != p["currentTargetHash"]:
        errors.append({"key": key, "field": "currentTargetHash"})
    if p["sourceCatalogBlob"] != source_meta["blob"] or p["sourceFileSha256"] != source_meta["fileSha256"]:
        errors.append({"key": key, "field": "sourceCatalogPin"})
    if p["localeBlob"] != catalog_meta[locale]["blob"] or p["localeFileSha256"] != catalog_meta[locale]["fileSha256"]:
        errors.append({"key": key, "field": "localeCatalogPin"})
    if source_catalog.get(p["sourceId"]) != p["source"]:
        errors.append({"key": key, "field": "baseSourceValue"})
    if catalogs[locale].get(p["sourceId"]) != p["currentTarget"]:
        errors.append({"key": key, "field": "baseCurrentTarget"})
    if p["exactHead"] != EXPECTED_HEAD or p["exactTree"] != EXPECTED_TREE:
        errors.append({"key": key, "field": "primaryHeadTree"})

    primary_line_sha = sha_bytes(primary_line[key].encode("utf-8"))
    if p["disposition"] == "accept-current":
        if p["finalTarget"] != p["currentTarget"] or p["finalTargetHash"] != p["currentTargetHash"]:
            errors.append({"key": key, "field": "primaryAcceptCurrentChangedTarget"})
    else:
        proposal_keys.add(key)
        if p["finalTarget"] == p["currentTarget"]:
            errors.append({"key": key, "field": "proposalHasNoTargetChange"})

    # Cross-review exact row references and classifications.
    cross_evidence = None
    if c is not None:
        if c["sourceId"] != p["sourceId"] or c.get("source") != p["source"] or c["currentTarget"] != p["currentTarget"]:
            errors.append({"key": key, "field": "crossReviewSourceCurrent"})
        if c["callerContextRef"] != p["callerContextRef"] or c["callerContextSha256"] != p["callerContextSha256"] or not c["callerPinsVerified"]:
            errors.append({"key": key, "field": "crossReviewCallerPin"})
        if c["primaryLedgerLineSha256"] != primary_line_sha:
            errors.append({"key": key, "field": "crossReviewPrimaryLinePin"})
        if c["localeBlob"] != p["localeBlob"] or c["sourceCatalogBlob"] != p["sourceCatalogBlob"]:
            errors.append({"key": key, "field": "crossReviewBlobPin"})
        if sha_text(c["crossReviewTarget"]) != c["crossReviewTargetSha256"]:
            errors.append({"key": key, "field": "crossReviewTargetHash"})
        cross_evidence = {
            "reviewScope": c["reviewScope"], "disposition": c["crossReviewDisposition"],
            "target": c["crossReviewTarget"], "targetSha256": c["crossReviewTargetSha256"],
            "rowSha256": sha_bytes(cross_line[key].encode("utf-8")),
            "primaryRowSha256": c["primaryRowSha256"],
            "primaryLedgerLineSha256": c["primaryLedgerLineSha256"],
            "callerPinsVerified": c["callerPinsVerified"],
            "placeholderParityVerified": c["placeholderParityVerified"],
            "markupParityVerified": c["markupParityVerified"],
            "protectedLiteralParityVerified": c["protectedLiteralParityVerified"],
            "rationale": c["crossReviewRationale"],
        }
        if c["reviewScope"] in ("stratified-accept-current-sample", "expanded-context-crossreview"):
            sample_keys.add(key)
            if p["disposition"] != "accept-current" or c["crossReviewDisposition"] != "accept-current":
                errors.append({"key": key, "field": "sampleClassification"})
        elif c["reviewScope"] == "additional-accept-current-finding":
            additional_keys.add(key)
            if p["disposition"] != "accept-current":
                errors.append({"key": key, "field": "additionalFindingNotAcceptCurrent"})
        elif c["reviewScope"] == "primary-proposal-crossreview":
            if p["disposition"] == "accept-current":
                errors.append({"key": key, "field": "proposalCrossReviewOnCurrent"})
        else:
            errors.append({"key": key, "field": "unknownCrossReviewScope", "scope": c["reviewScope"]})
    elif p["disposition"] != "accept-current":
        errors.append({"key": key, "field": "proposalMissingCrossReview"})

    # Verify exact row links from adjudication to both review packets.
    adjudication_evidence = None
    if a is not None:
        if c is None:
            errors.append({"key": key, "field": "adjudicationMissingCrossReview"})
        else:
            if a["crossReviewRowSha256"] != sha_bytes(cross_line[key].encode("utf-8")):
                errors.append({"key": key, "field": "adjudicationCrossReviewLinePin"})
            if a["primaryRowSha256"] != c["primaryRowSha256"]:
                errors.append({"key": key, "field": "adjudicationPrimaryRowPin"})
            if a["sourceId"] != p["sourceId"] or a["sourceText"] != p["source"] or a["sourceSha256"] != p["sourceTextSha256"]:
                errors.append({"key": key, "field": "adjudicationSourcePin"})
            if a["currentTarget"] != p["currentTarget"] or a["currentTargetSha256"] != p["currentTargetHash"]:
                errors.append({"key": key, "field": "adjudicationCurrentPin"})
            if a["callerContextRef"] != p["callerContextRef"] or a["callerContextSha256"] != p["callerContextSha256"] or not a["callerPinsVerified"]:
                errors.append({"key": key, "field": "adjudicationCallerPin"})
        adjudication_evidence = {
            "disposition": a["adjudicatorDisposition"], "target": a["finalTarget"],
            "targetSha256": a["finalTargetSha256"],
            "rowSha256": sha_bytes(adj_line[key].encode("utf-8")),
            "primaryRowSha256": a["primaryRowSha256"], "crossReviewRowSha256": a["crossReviewRowSha256"],
            "qualifiedNativeSpeakerApproval": a["qualifiedNativeSpeakerApproval"], "rationale": a["rationale"],
        }
        if sha_text(a["finalTarget"]) != a["finalTargetSha256"]:
            errors.append({"key": key, "field": "adjudicatedTargetHash"})

    # Resolve one final target/disposition for each cell.
    if a is not None:
        final_target = a["finalTarget"]
        original_disposition = a["adjudicatorDisposition"]
        if original_disposition == "reject-primary-proposal-and-cross-review-acceptance":
            if p["disposition"] == "accept-current" or final_target != p["currentTarget"]:
                errors.append({"key": key, "field": "rejectionMustRetainCurrent"})
            final_disposition = "reject-primary-proposal-retain-current"
        elif original_disposition == "adopt-cross-review-revision":
            if c is None or final_target != c["crossReviewTarget"] or p["disposition"] == "accept-current":
                errors.append({"key": key, "field": "revisionTargetMismatch"})
            final_disposition = original_disposition
        elif original_disposition == "accept-primary-proposal":
            if p["disposition"] == "accept-current" or final_target != p["finalTarget"]:
                errors.append({"key": key, "field": "acceptedPrimaryTargetMismatch"})
            final_disposition = original_disposition
        elif original_disposition in ("accept-additional-correction", "accept-additional-refinement"):
            if p["disposition"] != "accept-current" or c is None or final_target != c["crossReviewTarget"]:
                errors.append({"key": key, "field": "acceptedAdditionalTargetMismatch"})
            final_disposition = original_disposition
        else:
            errors.append({"key": key, "field": "unknownAdjudicationDisposition", "disposition": original_disposition})
            final_target = p["currentTarget"]
            final_disposition = "error"
    elif p["disposition"] != "accept-current":
        if c is None or c["reviewScope"] != "primary-proposal-crossreview" or c["crossReviewDisposition"] != "accept-primary-proposal":
            errors.append({"key": key, "field": "unadjudicatedProposalNotAccepted"})
        final_target = p["finalTarget"]
        final_disposition = "accept-primary-proposal"
    else:
        final_target = p["currentTarget"]
        final_disposition = "accept-current-independent-sample" if key in sample_keys else "accept-current-primary-review"

    final_hash = sha_text(final_target)
    is_changed = final_target != p["currentTarget"]

    # Use the pinned reviewers' ICU parse (plain branch words such as Season
    # are not interpolation variables) and independently check literal tags.
    if final_target == p["currentTarget"]:
        final_placeholders = p["currentPlaceholders"]
        placeholder_ok = sorted((x["kind"], x["name"]) for x in final_placeholders) == sorted((x["kind"], x["name"]) for x in p["sourcePlaceholders"])
        markup_ok = p["markupParity"] == "exact"
        protected_ok = p["currentProtectedLiteralParity"] == "exact"
    elif final_target == p["finalTarget"]:
        final_placeholders = p["finalTargetPlaceholders"]
        placeholder_ok = sorted((x["kind"], x["name"]) for x in final_placeholders) == sorted((x["kind"], x["name"]) for x in p["sourcePlaceholders"]) and p["candidatePlaceholderParity"] == "exact"
        markup_ok = p["finalMarkup"] == p["sourceMarkup"] and p["candidateMarkupParity"] == "exact"
        protected_ok = p["candidateProtectedLiteralParity"] == "exact"
    elif c is not None and final_target == c["crossReviewTarget"]:
        final_placeholders = None
        placeholder_ok = c["placeholderParityVerified"]
        markup_ok = c["markupParityVerified"]
        protected_ok = c["protectedLiteralParityVerified"]
    else:
        final_placeholders = None
        placeholder_ok = markup_ok = protected_ok = False
        errors.append({"key": key, "field": "finalTargetHasNoPinnedStructuralEvidence"})
    source_tags, final_tags = set(TAG_RE.findall(p["source"])), set(TAG_RE.findall(final_target))
    if source_tags != final_tags or not markup_ok:
        errors.append({"key": key, "field": "finalMarkupParity"})
    if not placeholder_ok:
        errors.append({"key": key, "field": "finalPlaceholderParity"})
    if not protected_ok:
        errors.append({"key": key, "field": "finalProtectedLiteralParity"})
    for literal in p["protectedLiterals"]:
        if literal not in final_target:
            errors.append({"key": key, "field": "missingProtectedLiteral", "literal": literal})
        structural_checks["protectedLiterals"] += 1
    structural_checks["placeholderNameSets"] += 1
    structural_checks["markupTagSets"] += 1
    if c is not None and is_changed and c["reviewScope"] in ("primary-proposal-crossreview", "additional-accept-current-finding"):
        if not (c["placeholderParityVerified"] and c["markupParityVerified"] and c["protectedLiteralParityVerified"]):
            errors.append({"key": key, "field": "crossReviewStructuralEvidence"})

    row = {
        "sourcePosition": pos, "locale": locale, "sourceId": p["sourceId"], "localeFile": p["localeFile"],
        "exactBaseCommit": EXPECTED_BASE, "exactPrHead": EXPECTED_HEAD, "exactHeadTree": EXPECTED_TREE,
        "source": {"text": p["source"], "sha256": p["sourceTextSha256"], "sourceHash": p["sourceHash"], "catalogBlob": p["sourceCatalogBlob"]},
        "callerPin": {"ref": p["callerContextRef"], "sha256": p["callerContextSha256"], "paths": p["callerPaths"],
                      "referenceCount": p["callerReferenceCount"], "coverage": p["callerContextCoverage"]},
        "current": {"target": p["currentTarget"], "sha256": p["currentTargetHash"], "catalogBlob": p["localeBlob"]},
        "primaryReview": {"disposition": p["disposition"], "candidateTarget": p["finalTarget"],
                          "candidateTargetSha256": p["finalTargetHash"], "proposed": key in proposal_keys,
                          "rowSha256": primary_line_sha, "rowIdentitySha256": (c["primaryRowSha256"] if c else None),
                          "confidence": p["confidence"], "rationale": p["rationale"]},
        "crossReview": cross_evidence, "adjudication": adjudication_evidence,
        "finalDisposition": final_disposition, "finalTarget": final_target, "finalTargetSha256": final_hash,
        "expectedChange": is_changed, "applicationAction": "set-exact-value" if is_changed else "retain-exact-current-value",
        "readback": {"required": True, "expectedTarget": final_target, "expectedSha256": final_hash,
                     "comparison": "exact Unicode string and SHA-256 of UTF-8 bytes"},
    }
    plan.append(row)
    final_counts[final_disposition] += 1
    if is_changed:
        if p["disposition"] != "accept-current":
            changed_proposals += 1
        elif key in additional_keys:
            changed_additional += 1
        else:
            errors.append({"key": key, "field": "unclassifiedChange"})
        locale_changes[locale] += 1
        changes.append({
            "sourcePosition": pos, "locale": locale, "sourceId": p["sourceId"], "localeFile": p["localeFile"],
            "currentTarget": p["currentTarget"], "currentTargetSha256": p["currentTargetHash"],
            "finalTarget": final_target, "finalTargetSha256": final_hash, "finalDisposition": final_disposition,
            "sourceTextSha256": p["sourceTextSha256"], "callerContextRef": p["callerContextRef"],
            "callerContextSha256": p["callerContextSha256"], "baseLocaleBlob": p["localeBlob"],
            "primaryLedgerLineSha256": primary_line_sha,
            "crossReviewRowSha256": cross_evidence["rowSha256"] if cross_evidence else None,
            "adjudicationRowSha256": adjudication_evidence["rowSha256"] if adjudication_evidence else None,
        })
    else:
        unchanged_current += 1
    readback.append({
        "sourcePosition": pos, "locale": locale, "sourceId": p["sourceId"], "localeFile": p["localeFile"],
        "expectedChange": is_changed, "finalDisposition": final_disposition,
        "expectedTarget": final_target, "expectedTargetSha256": final_hash,
        "readbackRequirement": "read exact key from post-application locale JSON and verify exact Unicode string plus SHA-256 over UTF-8 bytes",
        "mustRemainUnchangedFromBase": not is_changed,
    })

if errors:
    raise ValueError(f"validation failed ({len(errors)} errors): {json.dumps(errors[:20], ensure_ascii=False)}")

# Assert total/overlap counts and resolution of proposal vs accept-current findings.
if len(proposal_keys) != 175 or len(sample_keys) != 120 or len(additional_keys) != 19:
    raise ValueError(f"coverage mismatch proposals={len(proposal_keys)} sample={len(sample_keys)} additional={len(additional_keys)}")
if proposal_keys & sample_keys or proposal_keys & additional_keys or sample_keys & additional_keys:
    raise ValueError("conflicting/overlapping review cells")
if len(adj) != 25 or sum(r["adjudicatorDisposition"] == "reject-primary-proposal-and-cross-review-acceptance" for r in adj_rows) != 1:
    raise ValueError("unexpected adjudication count or rejection count")
if changed_proposals != 174 or changed_additional != 19 or len(changes) != 193 or unchanged_current != 1007:
    raise ValueError(f"change count mismatch proposals={changed_proposals} additional={changed_additional} total={len(changes)} unchanged={unchanged_current}")
if len(plan) != 1200 or len({(r["sourcePosition"], r["locale"]) for r in plan}) != 1200:
    raise ValueError("cell plan is not unique and complete")

jsonl_write(OUT / "cell-application-plan.jsonl", plan)
jsonl_write(OUT / "expected-changes.jsonl", changes)
jsonl_write(OUT / "readback-checklist.jsonl", readback)

input_record = {
    "primaryPacket": primary_packet, "primaryInputChecks": primary_input_checks,
    "crossReviewPacket": cross_packet, "adjudicationPacket": adjudication_packet,
    "primaryLedgerSha256": sha_bytes((PRIMARY / "primary-review-ledger.jsonl").read_bytes()),
    "sourceCurrentCellsSha256": sha_bytes((PRIMARY / "source-current-cells.jsonl").read_bytes()),
    "crossReviewLedgerSha256": sha_bytes((CROSS / "crossreview-ledger.jsonl").read_bytes()),
    "adjudicationLedgerSha256": sha_bytes((ADJ / "adjudication-ledger.jsonl").read_bytes()),
    "allSevenPrHeadSnapshot": {"file": all_seven_path.name, "sha256": sha_bytes(all_seven_path.read_bytes()),
                               "queriedAtUtc": all_seven_snapshot["queriedAtUtc"]},
    "sourceCatalog": source_meta, "localeCatalogs": catalog_meta,
}
(OUT / "input-manifest.json").write_text(json.dumps(input_record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "reattestation.json").write_text(json.dumps(reattest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

summary = {
    "repository": OWNER, "pullRequest": 418, "pullRequestState": pr["state"], "pullRequestDraft": pr["isDraft"],
    "baseCommit": EXPECTED_BASE, "headCommit": EXPECTED_HEAD, "headTree": EXPECTED_TREE, "headBranch": BRANCH,
    "cellCount": len(plan), "uniqueCellKeys": 1200, "duplicateCellKeys": 0, "conflictingCellKeys": 0,
    "primaryAcceptCurrentCells": 1025, "primaryProposalCells": 175,
    "proposalTypes": {"propose-correction": 165, "refinement": 10},
    "independentAcceptCurrentSampleCells": 120, "sampleCoverage": {"stratified": 109, "expandedContext": 11},
    "additionalCurrentFindings": {"total": 19, "acceptedCorrections": 15, "acceptedRefinements": 4, "rejected": 0},
    "primaryProposalAdjudication": {
        "acceptedPrimaryTargets": 170, "adoptedCrossReviewTextRevisions": 4, "rejectedPrimaryProposals": 1,
        "rejectionCell": {"sourcePosition": 2627, "locale": "ar", "sourceId": "components.RequestButton.requestupdatesfailed"},
        "note": "The sole rejection is a primary proposal cross-review had accepted; it is separate from the 19 additional current-value findings, all of which are accepted."
    },
    "finalDispositionCounts": dict(sorted(final_counts.items())),
    "allSevenPrHeadSnapshot": {"file": all_seven_path.name, "queriedAtUtc": all_seven_snapshot["queriedAtUtc"], "pullRequests": 7},
    "expectedChangedCells": len(changes), "changedPrimaryProposalCells": changed_proposals,
    "changedAdditionalCurrentFindingCells": changed_additional, "expectedUnchangedCells": unchanged_current,
    "changedCellsByLocale": dict(sorted(locale_changes.items())),
    "readback": {
        "requiredForCells": 1200, "changedTargetsToVerify": len(changes), "unchangedCellsToGuard": unchanged_current,
        "exactComparison": "read each sourceId from the locale JSON at the applied commit; compare exact Unicode string and SHA-256 of UTF-8 bytes",
        "catalogKey": "sourceId is the exact flattened locale JSON key"
    },
    "sourceValidation": {
        "baseCatalogSourceAndCurrentValuesMatched": True, "catalogBlobAndFileShaPinsMatched": True,
        "crossReviewPrimaryAndSourcePinsMatched": True, "adjudicationRowPointersMatched": True,
        "placeholderNameSetMismatches": 0, "markupTagSetMismatches": 0, "missingProtectedLiterals": 0,
        "independentStringHashChecks": 1200, "sourceAndCurrentTargetHashesValid": True,
        "primaryCallerPinsPresent": 1200, "crossReviewCallerPinsVerified": 314
    },
    "nativeSpeakerApproval": False, "browserReview": False, "repositoryOrPrEdited": False,
    "testsBuildsScansCiBrowserRun": False, "releasesTagsMergesRun": False,
    "outputFiles": ["README.md", "build_application_plan.py", "cell-application-plan.jsonl", "expected-changes.jsonl",
                    "all-seven-pr-head-snapshot.json", "input-manifest.json", "reattestation.json",
                    "readback-checklist.jsonl", "summary.json"]
}
(OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

readme = f"""# SeerrNG PR #418 W2600–W2699 exact-hash application plan

This packet combines the sealed primary review, independent cross-review, and adjudication for all 1,200 locale cells. It is an application plan only; it does not modify a repository or PR.

## Exact revision and live branch

- Repository: {OWNER}; PR #418 is {pr['state']} and draft={str(pr['isDraft']).lower()}.
- Base commit: {EXPECTED_BASE} (main).
- Head commit: {EXPECTED_HEAD}; head tree: {EXPECTED_TREE}.
- PR branch: {BRANCH}.
- The worktree is clean and at that exact commit, tree, and branch. GitHub PR API, GitHub branch API, and the canonical github remote report the same head.
- all-seven-pr-head-snapshot.json re-queries the seven open localization PRs and records each head commit and tree at {all_seven_snapshot["queriedAtUtc"]}.
- This worktree maps origin to a local bare mirror; that local mirror ref reports {local_origin_ref}. It is not used as the canonical PR/head source. See reattestation.json.

## Counts and adjudication

- 1,200 unique cell rows: 100 source IDs × 12 locales.
- Primary review: 1,025 accept-current cells and all 175 proposals (165 corrections, 10 refinements).
- Independent current-value sample: 120 cells (109 stratified plus 11 expanded-context); all remain at current values.
- Additional current-value findings: 19 (15 corrections, 4 refinements); all 19 are accepted.
- Primary proposal resolution: 170 accepted primary target strings, 4 cross-review text revisions, and 1 rejected proposal. The rejection is Arabic at W2627, components.RequestButton.requestupdatesfailed; it retains the current zero branch. It is not one of the 19 additional current-value findings.
- Expected changes: 193 cells (174 accepted primary proposals plus 19 accepted current-value findings). Expected unchanged cells: 1,007.

## Packet files

- cell-application-plan.jsonl: one row for every locale/source cell, with exact source, current, proposal, cross-review, adjudication, and final targets with hashes, caller pins, row hashes, and readback action.
- expected-changes.jsonl: the 193 exact value changes with before/after strings and evidence pins.
- readback-checklist.jsonl: all 1,200 cells, including changed values and values that must remain unchanged.
- reattestation.json: live PR/base/head/tree/branch and worktree evidence.
- all-seven-pr-head-snapshot.json: latest all-seven PR head and tree snapshot.
- input-manifest.json: verified input packet manifests, source/locale catalog hashes, and base blob IDs.
- summary.json: counts and validation results.
- SHA256SUMS: hashes for packet files other than the checksum file itself.

## Application and readback

Apply only on a branch whose PR head, tree, branch, base commit, source catalog blob, and locale catalog blobs match this packet. If any pin changes, regenerate the plan from the new exact head first. Apply only entries in expected-changes.jsonl; do not change any other locale key in this window.

After application, read all 1,200 sourceId keys from the 12 locale JSON files at the resulting commit. For every row, compare the exact Unicode value and SHA-256 over its UTF-8 bytes with readback-checklist.jsonl. All 193 changed cells must equal the planned target and hash. The other 1,007 cells must remain exactly equal to their base target and hash. Reattest the final commit/tree, diff only the planned locale keys, and record readback evidence separately.

Machine-assisted review remains subject to qualified native-speaker signoff and headed-browser review. This packet performs no application, tests, builds, scans, CI, browser actions, releases, tags, or merges.
"""
(OUT / "README.md").write_text(readme, encoding="utf-8")
print(json.dumps({
    "output": str(OUT), "cells": len(plan), "proposals": len(proposal_keys), "sample": len(sample_keys),
    "additional": len(additional_keys), "adjudications": len(adj), "changed": len(changes),
    "unchanged": unchanged_current, "dispositions": dict(sorted(final_counts.items())),
    "reattestation": reattest["matchesExpected"]
}, ensure_ascii=False))
