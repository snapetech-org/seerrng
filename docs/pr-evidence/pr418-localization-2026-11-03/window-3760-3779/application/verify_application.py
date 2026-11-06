#!/usr/bin/env python3
"""Verify the W3760-W3779 catalog application from pinned Git objects."""
from collections import Counter
from pathlib import Path
import hashlib
import json
import subprocess
import sys

A = Path(__file__).resolve().parent
W = A.parent
R = A.parents[4]
CF = W / "candidate-free-input"
CROSS = W / "cross-audit"
BASE = "d317a07ea0e5456b6d4660470c57d1f205cd0587"
BASE_TREE = "c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
BASE_SHA = "fa40534ccced75bde1125c14760514fcd5d7de4d"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]
EXPECTED_ORDER_DIFFS = ["ja", "ko", "vi", "zh-Hans", "zh-Hant"]

def die(message):
    raise SystemExit("FAIL: " + message)

def require(value, message):
    if not value:
        die(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def sha_text(text):
    return sha(text.encode("utf-8"))

def j(path):
    return json.loads(path.read_text(encoding="utf-8"))

def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def git(*args):
    return subprocess.check_output(["git", "-C", str(R), *args])

def object_json(revision, path):
    try:
        raw = git("show", f"{revision}:{path}")
    except subprocess.CalledProcessError:
        die(f"missing Git object {revision}:{path}")
    return raw, json.loads(raw.decode("utf-8"))

def ordered_hash(data):
    return sha(json.dumps(list(data.keys()), ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

def keyset_hash(data):
    return sha_text("\n".join(sorted(data.keys())) + "\n")

record = j(A / "commit-record.json")
preflight = j(A / "application-preflight.json")
invariants = j(A / "catalog-invariants.json")
summary = j(A / "application-verification.json")
visual = j(A / "visual-review-status.json")
postflight = j(A / "application-postflight.json")
cf_manifest = j(CF / "manifest.json")

require(record["parentHead"] == BASE and record["parentTree"] == BASE_TREE, "baseline commit record pins")
CAT = record["catalogCommit"]
CAT_TREE = record["catalogTree"]
require(git("rev-parse", BASE).decode().strip() == BASE, "baseline commit object")
require(git("rev-parse", f"{BASE}^{{tree}}").decode().strip() == BASE_TREE, "baseline tree object")
require(git("rev-parse", CAT).decode().strip() == CAT, "catalog commit object")
require(git("rev-parse", f"{CAT}^{{tree}}").decode().strip() == CAT_TREE, "catalog tree object")
require(git("rev-list", "--parents", "-n", "1", CAT).decode().split() == [CAT, BASE], "catalog commit is not a direct child of baseline")
require(subprocess.run(["git", "-C", str(R), "merge-base", "--is-ancestor", CAT, "HEAD"]).returncode == 0, "catalog commit is not an ancestor of evidence head")

require(preflight["result"] == "PASS" and preflight["parentHead"] == BASE and preflight["parentTree"] == BASE_TREE, "live application preflight pins")
require(preflight["state"] == "OPEN" and preflight["draft"] is True and preflight["branchRef"] == BASE and preflight["pullRef"] == BASE, "PR/branch/pull preflight refs")
require(preflight["deploymentsForParentHead"] == 0, "baseline deployment preflight count")
require(preflight["sourceEnglishCatalogReattested"] is True and preflight["catalogFilesReattested"] == 13 and preflight["targetPreimagesReattested"] == 240, "preflight catalog coverage")
require(preflight["crossAuditSelections"] == 12 and preflight["noWorkflowPathsInCatalogCommit"] is True, "preflight selection/workflow scope")
require(postflight["pinsMatched"] is True and postflight["state"] == "open" and postflight["draft"] is True, "post-application PR state")
require(postflight["head"] == postflight["branchRefSha"] == postflight["pullRefSha"] == record["catalogCommit"], "post-application live refs")
require(postflight["tree"] == record["catalogTree"] and postflight["deploymentsAtCommit"] == 0, "post-application tree/deployments")
require(cf_manifest["head"] == BASE and cf_manifest["tree"] == BASE_TREE and cf_manifest["baseSha"] == BASE_SHA, "candidate-free pins")

cross_result = subprocess.run([sys.executable, str(CROSS / "verify-cross.py")], cwd=CROSS, text=True, capture_output=True)
require(cross_result.returncode == 0, "portable cross-audit verifier: " + cross_result.stdout + cross_result.stderr)
cross_manifest = j(CROSS / "manifest.json")
require(sha((CROSS / "cross-ledger.jsonl").read_bytes()) == cross_manifest["crossLedgerSha256"], "cross ledger pin")

pins = j(CF / "catalog-file-pins.json")["catalogFiles"]
require(len(pins) == 13 and "en" in pins, "expected 13 catalog pins")
source_path = "src/i18n/locale/en.json"
source0_raw, source0 = object_json(BASE, source_path)
source1_raw, source1 = object_json(CAT, source_path)
source_pin = pins["en"]
require(source0_raw == source1_raw and sha(source0_raw) == source_pin["sha256"], "English catalog changed or pin mismatch")
require(git("rev-parse", f"{BASE}:{source_path}").decode().strip() == source_pin["gitBlob"], "English baseline blob pin")
source_ids = list(source0)
require(len(source0) == 9494 and keyset_hash(source0) == source_pin["orderedKeySha256"], "English source key set/count")
locale_map = cf_manifest["localeFileMapping"]
locale_to_path = {locale: value["catalogPath"] for locale, value in locale_map.items()}
require(set(locale_to_path) == set(LOCALES), "canonical locale mapping")

ledger = jl(CROSS / "cross-ledger.jsonl")
cells = jl(CF / "current-target-cells.jsonl")
plans = jl(A / "application-plan.jsonl")
readbacks = jl(A / "application-readback.jsonl")
require((len(ledger), len(cells), len(plans), len(readbacks)) == (240, 240, 12, 240), "application row coverage")
cell = lambda row: (row["position"], row["locale"])
lm = {cell(row): row for row in ledger}
cm = {cell(row): row for row in cells}
pm = {cell(row): row for row in plans}
rm = {cell(row): row for row in readbacks}
require((len(lm), len(cm), len(pm), len(rm)) == (240, 240, 12, 240), "duplicate application rows")
require(set(lm) == set(cm) == set(rm), "readback cell coverage")
counts = Counter(row["crossDisposition"] for row in ledger)
require(counts == Counter({"accept-current": 228, "correct": 9, "refine": 3}), "cross disposition counts")
selected = {key: row for key, row in lm.items() if row["proposedTarget"] is not None}
require(set(selected) == set(pm), "application plan selection set")

# Confirm each catalog's exact baseline bytes/blob, key set, and per-file order.
base_catalogs = {}
final_catalogs = {}
catalog_rows = {row["path"]: row for row in invariants["catalogs"]}
require(set(catalog_rows) == {pin["path"] for pin in pins.values()}, "catalog invariant path coverage")
for loc, pin in pins.items():
    path = pin["path"]
    raw0, d0 = object_json(BASE, path)
    raw1, d1 = object_json(CAT, path)
    inv = catalog_rows[path]
    require(sha(raw0) == pin["sha256"] and git("rev-parse", f"{BASE}:{path}").decode().strip() == pin["gitBlob"], "baseline file hash/blob pin " + path)
    require(sha(raw0) == inv["beforeSha256"] and sha(raw1) == inv["afterSha256"], "catalog invariant byte hashes " + path)
    require(git("rev-parse", f"{CAT}:{path}").decode().strip() == inv["afterGitBlob"], "catalog final blob pin " + path)
    require(len(d0) == len(d1) == pin["keyCount"] == inv["keyCount"] == 9494, "catalog key count " + path)
    require(keyset_hash(d0) == keyset_hash(d1) == pin["orderedKeySha256"] == inv["keySetSha256"], "catalog key set changed " + path)
    require(list(d0) == list(d1), "catalog key order changed " + path)
    require(ordered_hash(d0) == inv["beforeOrderedKeysSha256"] and ordered_hash(d1) == inv["afterOrderedKeysSha256"], "catalog order record " + path)
    require(inv["beforeOrderedKeysSha256"] == inv["afterOrderedKeysSha256"], "per-catalog order not preserved " + path)
    require(inv["matchesEnglishOrder"] == (list(d0) == source_ids), "English-order comparison record " + path)
    require(inv["nonTargetValuesPreserved"] is True, "non-target invariant record " + path)
    base_catalogs[path] = d0
    final_catalogs[path] = d1

order_diffs = [pins_locale for pins_locale, pin in sorted(pins.items()) if list(base_catalogs[pin["path"]]) != source_ids]
require(order_diffs == EXPECTED_ORDER_DIFFS, "pre-existing locale order variants differ")
require(invariants["preexistingOrderDifferenceLocales"] == EXPECTED_ORDER_DIFFS, "catalog invariant order-difference list")
require(invariants["catalogKeySetsEqualEnglish"] is True and invariants["catalogOrdersPreservedPerFile"] is True, "catalog invariant summary")
require(invariants["sourceEnglishCatalog"]["unchanged"] is True, "source English invariant")
require(invariants["sourceEnglishCatalog"]["orderedKeysSha256"] == ordered_hash(source0), "English exact order hash")
require(invariants["sourceEnglishCatalog"]["keySetSha256"] == keyset_hash(source0), "English key set hash")

path_to_locale = {path: locale for locale, path in locale_to_path.items()}
selected_keys_by_path = Counter()
for key, row in lm.items():
    c = cm[key]
    path = c["catalogPath"]
    srcid = row["sourceId"]
    pos, locale = key
    require(source_ids[pos] == srcid, "source ID position " + str(key))
    require(source0[srcid] == row["sourceText"] and sha_text(row["sourceText"]) == row["sourceTextSha256"], "English source row " + str(key))
    require(path == locale_to_path[locale], "locale/catalog mapping " + str(key))
    old_value = base_catalogs[path][srcid]
    final_value = final_catalogs[path][srcid]
    require(old_value == c["currentTarget"] == row["currentTarget"], "catalog preimage target " + str(key))
    require(sha_text(old_value) == c["currentTargetSha256"] == row["currentTargetSha256"], "catalog preimage hash " + str(key))
    changed = row["proposedTarget"] is not None
    expected = row["proposedTarget"] if changed else old_value
    expected_sha = row["proposedTargetSha256"] if changed else sha_text(old_value)
    require(final_value == expected and sha_text(final_value) == expected_sha, "catalog result target " + str(key))
    rb = rm[key]
    disposition = {"correct": "correction", "refine": "refinement"}.get(row["crossDisposition"], "accept-current")
    expected_tuple = (pos, locale, srcid, path, disposition, old_value, sha_text(old_value), expected, expected_sha, final_value, sha_text(final_value), True, changed)
    actual_tuple = (rb["position"], rb["locale"], rb["sourceId"], rb["catalogPath"], rb["disposition"], rb["preimageTarget"], rb["preimageSha256"], rb["expectedTarget"], rb["expectedTargetSha256"], rb["readbackTarget"], rb["readbackTargetSha256"], rb["matches"], rb["changed"])
    require(actual_tuple == expected_tuple, "application readback row " + str(key))
    if changed:
        selected_keys_by_path[path] += 1
        plan = pm[key]
        require(plan["sourceId"] == srcid and plan["catalogPath"] == path, "application plan identity " + str(key))
        require(plan["preimageTarget"] == old_value and plan["preimageSha256"] == sha_text(old_value), "application plan preimage " + str(key))
        require(plan["selectedTarget"] == expected and plan["selectedTargetSha256"] == expected_sha, "application plan target " + str(key))
        require(plan["selectionSource"] == "cross-audit" and plan["crossAuditRationale"] == row["crossRationale"], "application plan source/rationale " + str(key))
        require(row["proposedTokenChecks"] and all(x["matches"] for x in row["proposedTokenChecks"].values()), "selected target token/literal check " + str(key))

changed_path_set = {path for path, count in selected_keys_by_path.items() if count}
require(len(changed_path_set) == 7, "target catalog count")
require(set(git("diff", "--name-only", BASE, CAT).decode().splitlines()) == changed_path_set, "catalog commit path scope")
require(not git("diff", "--name-only", BASE, CAT, "--", ".github/workflows"), "workflow path changed")
for path, d0 in base_catalogs.items():
    expected_keys = {row["sourceId"] for row in ledger if row["catalogPath"] == path and row["proposedTarget"] is not None}
    actual_keys = {key for key in d0 if d0[key] != final_catalogs[path][key]}
    require(actual_keys == expected_keys, "changed key set/non-target values " + path)

# Current pre-existing token failures are limited to three Hindi protected literals; selected targets fix all.
current_failures = [(row["position"], row["locale"], kind) for row in ledger for kind, check in row["currentTokenChecks"].items() if not check["matches"]]
require(current_failures == [(3770, "hi", "protectedLiterals"), (3774, "hi", "protectedLiterals"), (3777, "hi", "protectedLiterals")], "baseline token mismatch set")
require(summary["selectedTokenFailures"] == 0 and summary["selectedProtectedLiteralFailures"] == 0, "application token/literal summary")

# Reattest prior source selections and carried holds with hashes only.
prior_selections_path = CF / "prior-selection-hash-reattestation.jsonl"
prior_selections = jl(prior_selections_path)
require(len(prior_selections) == 3760, "prior selection hash coverage")
for prior in prior_selections:
    pos = prior["position"]
    sid = source_ids[pos]
    require(sha_text(sid) == prior["currentSourceIdSha256"] == prior["previousSourceIdSha256"], "prior source ID hash " + str(pos))
    require(sha_text(source0[sid]) == prior["currentSourceTextSha256"] == prior["previousSourceTextSha256"], "prior source text hash " + str(pos))
prior_sel_summary = j(A / "prior-selection-reattestation.json")
require(prior_sel_summary["recordCount"] == 3760 and prior_sel_summary["targetTextIncluded"] is False, "prior selection evidence privacy")
require(prior_sel_summary["inputSha256"] == sha(prior_selections_path.read_bytes()) and prior_sel_summary["allSourceIdAndEnglishHashesMatch"] is True, "prior selection evidence pin")
prior_holds = jl(CF / "prior-hold-hash-reattestation.jsonl")
hold_readbacks = jl(A / "prior-hold-readback.jsonl")
require(len(prior_holds) == len(hold_readbacks) == 12, "carried hold coverage")
hold_map = {(r["position"], r["locale"]): r for r in hold_readbacks}
for hold in prior_holds:
    pos, path = hold["position"], hold["catalogPath"]
    locale = path_to_locale[path]
    sid = source_ids[pos]
    old_hash = sha_text(base_catalogs[path][sid])
    final_hash = sha_text(final_catalogs[path][sid])
    row = hold_map[(pos, locale)]
    require(sha_text(sid) == hold["sourceIdSha256"], "carried hold source ID hash")
    require(sha_text(source0[sid]) == hold["currentSourceTextSha256"] == hold["previousSourceTextSha256"], "carried hold English hash")
    require(old_hash == final_hash == hold["currentTargetSha256"] == hold["previousTargetSha256"], "carried hold target hash")
    require(row["sourceIdSha256"] == sha_text(sid) and row["sourceTextSha256"] == sha_text(source0[sid]), "hold readback source hashes")
    require(row["currentTargetSha256"] == final_hash and row["priorTargetSha256"] == hold["previousTargetSha256"], "hold readback target hashes")
    require(row["preserved"] is True and row["targetTextIncluded"] is False, "hold readback privacy/preservation")

expected_summary = {
    "result": "PASS", "cellsReadBack": 240, "selectedChanges": 12,
    "corrections": 9, "refinements": 3, "acceptCurrent": 228,
    "newWindowHolds": 0, "carriedHoldsPreserved": 12,
    "priorSelectionsReattestedHashOnly": 3760, "catalogFilesChanged": 7,
    "directLocaleCatalogsReviewed": 12, "catalogKeySetsEqualEnglish": True,
    "catalogOrdersPreservedPerFile": True, "preexistingOrderDifferenceLocales": EXPECTED_ORDER_DIFFS,
    "nonTargetValuesPreserved": True, "selectedTokenFailures": 0,
    "selectedProtectedLiteralFailures": 0, "workflowsChanged": False,
    "sourceEnglishCatalogUnchanged": True, "visualAcceptance": "unverified",
    "nativeSpeakerApproval": "pending", "applicationPostflightMatched": True,
    "deploymentsAtCatalogCommit": 0,
}
for key, value in expected_summary.items():
    require(summary.get(key) == value, "application summary field " + key)
require(visual["visualAcceptance"] == "unverified" and visual["headedBrowserReviewPerformed"] is False and visual["nativeSpeakerApproval"] == "pending" and visual["catalogCommitDeploymentCount"] == 0, "pending review gates")
require(summary["workflowsChanged"] is False, "workflow summary")

print(json.dumps({
    "result": "PASS",
    "parent": BASE,
    "catalogCommit": CAT,
    "catalogTree": CAT_TREE,
    "cellsReadBack": 240,
    "selectedChanges": 12,
    "corrections": 9,
    "refinements": 3,
    "acceptCurrent": 228,
    "targetCatalogsChanged": 7,
    "localeCatalogKeySetsEqualEnglish": True,
    "perCatalogKeyOrderPreserved": True,
    "preexistingOrderDifferenceLocales": EXPECTED_ORDER_DIFFS,
    "nonTargetValuesPreserved": True,
    "carriedHoldsPreservedHashOnly": 12,
    "priorSelectionsReattestedHashOnly": 3760,
    "tokenFailures": 0,
    "workflowChanges": False,
    "visualAcceptance": "unverified",
    "applicationPostflightMatched": True,
    "deploymentsAtCatalogCommit": 0,
}, ensure_ascii=False, indent=2))
