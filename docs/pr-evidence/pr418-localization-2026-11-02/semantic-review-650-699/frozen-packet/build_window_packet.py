#!/usr/bin/env python3
from __future__ import annotations

import collections
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path("/mnt/disks/scratch/task-scratch/seerrng-review-window-650-700-422072-20261102")
REPO = Path("/mnt/disks/scratch/task-worktrees/localization-20261030/seerrng-review-window-650-700-422072-20261102")
RUNNER = ROOT / "runner-window-650-700.py"
LIVE_HEAD = "422072d585074bdd7f8dd3046cbacede69203d6d"
LIVE_TREE = "c7f3bffb628464e98188f3c8f8c4950d6038cee6"
SOURCE_COMMIT = "affd7a87860e3613d5c6842c20eb0b45f3bd062f"
APP_SOURCE_TREE = "2471ca52d8b94504879e5842e8ffae920a22e180"
WINDOW_START, WINDOW_STOP = 650, 700


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(row: dict) -> str:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(canonical(row) + "\n" for row in rows), encoding="utf-8")


spec = importlib.util.spec_from_file_location("seerrng_window_runner", RUNNER)
if spec is None or spec.loader is None:
    raise SystemExit("could not load pinned semantic runner")
runner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runner
spec.loader.exec_module(runner)
identity, all_batches, _availability = runner.input_identity()
selected = all_batches[WINDOW_START:WINDOW_STOP]
if len(selected) != 50 or sum(len(rows) for _, rows in selected) != 1600:
    raise SystemExit("selection no longer matches exact 50 batch / 1,600 cell window")

head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=REPO, text=True).strip()
status = subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True).strip()
remote = subprocess.check_output(
    ["gh", "api", "repos/snapetech-org/seerrng/pulls/418", "--jq", ".head.sha"], text=True
).strip()
if (head, tree, status, remote) != (LIVE_HEAD, LIVE_TREE, "", LIVE_HEAD):
    raise SystemExit(f"exact live-head pin changed: {head}/{tree}; status={status!r}; remote={remote}")
source_tree = subprocess.check_output(["git", "rev-parse", f"{SOURCE_COMMIT}^{{tree}}"], cwd=REPO, text=True).strip()
if source_tree != APP_SOURCE_TREE:
    raise SystemExit(f"app-source tree changed: {source_tree}")
live_attestation = runner.validate_live_selected(selected)
if live_attestation != {
    "livePrHead": LIVE_HEAD,
    "livePrTree": LIVE_TREE,
    "selectedBatchCount": 50,
    "selectedCellCount": 1600,
    "selectedCellHashesMatchLive": True,
}:
    raise SystemExit(f"selection failed exact live cell hash attestation: {live_attestation}")

source_path = "src/i18n/locale/en.json"
target_path = "src/i18n/locale/es.json"
source_blob = subprocess.check_output(["git", "rev-parse", f"{LIVE_HEAD}:{source_path}"], cwd=REPO, text=True).strip()
target_blob = subprocess.check_output(["git", "rev-parse", f"{LIVE_HEAD}:{target_path}"], cwd=REPO, text=True).strip()
source_file_sha = sha((REPO / source_path).read_bytes())
target_file_sha = sha((REPO / target_path).read_bytes())
source_catalog = runner.read_json(REPO / source_path)
target_catalog = runner.read_json(REPO / target_path)

output = ROOT / "semantic-output"
result_dir = output / "results"
manual_batch = "existing-es-client-0094"
candidate_rows: list[dict] = []
held_rows: list[dict] = []
accepted_rows: list[dict] = []
batch_rows: list[dict] = []
manual_decisions: list[dict] = []
manual_input_rows: list[dict] = []
counts = collections.Counter()
source_rows_by_id: dict[str, dict] = {}
selected_cell_attestations: list[dict] = []
strict_batches = 0


def base_cell(batch_id: str, batch_index: int, rows: list[dict], row: dict, *, provenance: str) -> dict:
    return {
        "schemaVersion": 1,
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "liveHead": LIVE_HEAD,
        "liveTree": LIVE_TREE,
        "appSourceCommit": SOURCE_COMMIT,
        "appSourceTree": APP_SOURCE_TREE,
        "semanticManifestSha256": identity["semanticManifestSha256"],
        "cellPlanSha256": identity["cellPlanSha256"],
        "sourceBundleManifestSha256": identity["sourceBundleManifestSha256"],
        "batchStart": WINDOW_START,
        "batchStopExclusive": WINDOW_STOP,
        "batchIndex": batch_index,
        "batchId": batch_id,
        "batchSha256": runner.batch_hash(batch_id, rows),
        "domain": row["domain"],
        "locale": row["locale"],
        "id": row["id"],
        "source": row["source"],
        "sourceHash": row["sourceHash"],
        "currentTarget": row["target"],
        "currentTargetHash": row["targetHash"],
        "currentTargetHashLive": row["targetHash"],
        "sourceFile": source_path,
        "sourceCatalogBlob": source_blob,
        "sourceCatalogFileSha256": source_file_sha,
        "targetFile": target_path,
        "targetCatalogBlob": target_blob,
        "targetCatalogFileSha256": target_file_sha,
        "nativeSpeakerApproval": False,
        "reviewProvenance": provenance,
    }


tag_re = re.compile(r"</?[A-Za-z][A-Za-z0-9]*(?:\s+[^<>]+)?>")


def validate_manual_batch(rows: list[dict], decisions: list[dict], requested_rows: list[dict]) -> None:
    expected = {row["id"]: row for row in rows}
    requested = {row["id"]: row for row in requested_rows}
    actual = {decision.get("id"): decision for decision in decisions}
    if len(actual) != len(decisions) or set(expected) != set(requested) or set(expected) != set(actual):
        raise SystemExit(f"{manual_batch}: model output/request IDs differ from exact window")
    if any(runner.normalized_row(expected[k]) != runner.normalized_row(requested[k]) for k in expected):
        raise SystemExit(f"{manual_batch}: retained request cells differ from exact frozen batch")
    tr = runner.load_translation_module()
    for message_id, row in expected.items():
        decision = actual[message_id]
        verdict = decision.get("verdict")
        if verdict == "keep":
            if set(decision) != {"id", "verdict"}:
                raise SystemExit(f"{manual_batch}/{message_id}: malformed keep")
        elif verdict == "uncertain":
            if set(decision) != {"id", "verdict", "reason"} or not decision["reason"].strip():
                raise SystemExit(f"{manual_batch}/{message_id}: malformed uncertainty")
        elif verdict == "correct":
            if set(decision) != {"id", "verdict", "target", "confidence", "reason"}:
                raise SystemExit(f"{manual_batch}/{message_id}: malformed correction fields")
            proposed = decision["target"]
            if (
                decision["confidence"] != "high"
                or not isinstance(proposed, str)
                or not proposed.strip()
                or proposed != proposed.strip()
                or proposed == row["target"]
                or not decision["reason"].strip()
            ):
                raise SystemExit(f"{manual_batch}/{message_id}: malformed correction values")
            if tr.icu_signature(proposed) != tr.icu_signature(row["source"]):
                raise SystemExit(f"{manual_batch}/{message_id}: ICU structure mismatch")
            required = tr.protected_values(row["source"])
            required_tags = collections.Counter({k: v for k, v in required.items() if tag_re.fullmatch(k)})
            required_literals = collections.Counter({k: v for k, v in required.items() if not tag_re.fullmatch(k)})
            actual_tags = tag_re.findall(proposed)
            source_tags = tag_re.findall(row["source"])
            if collections.Counter(actual_tags) != required_tags or actual_tags != source_tags:
                raise SystemExit(f"{manual_batch}/{message_id}: protected inline tag sequence/multiplicity mismatch")
            if tr.protected_literal_counts(proposed, required_literals) != required_literals:
                raise SystemExit(f"{manual_batch}/{message_id}: non-tag protected literal mismatch")
            if tr.MASK.search(proposed):
                raise SystemExit(f"{manual_batch}/{message_id}: unresolved protected token mask")
        else:
            raise SystemExit(f"{manual_batch}/{message_id}: unsupported verdict {verdict!r}")


for batch_index, (batch_id, rows) in enumerate(selected, start=WINDOW_START):
    for row in rows:
        if row["sourceHash"] != runner.sha(row["source"].encode("utf-8")):
            raise SystemExit(f"{batch_id}/{row['id']}: source hash mismatch")
        if row["targetHash"] != runner.sha(row["target"].encode("utf-8")):
            raise SystemExit(f"{batch_id}/{row['id']}: current-target hash mismatch")
        if source_catalog.get(row["id"]) != row["source"] or target_catalog.get(row["id"]) != row["target"]:
            raise SystemExit(f"{batch_id}/{row['id']}: live catalog value mismatch")
        selected_cell_attestations.append({
            "schemaVersion": 1,
            "liveHead": LIVE_HEAD,
            "liveTree": LIVE_TREE,
            "batchIndex": batch_index,
            "batchId": batch_id,
            "batchSha256": runner.batch_hash(batch_id, rows),
            "domain": row["domain"],
            "locale": row["locale"],
            "id": row["id"],
            "source": row["source"],
            "sourceHash": row["sourceHash"],
            "liveSource": source_catalog[row["id"]],
            "liveSourceHash": runner.sha(source_catalog[row["id"]].encode("utf-8")),
            "currentTarget": row["target"],
            "currentTargetHash": row["targetHash"],
            "liveCurrentTarget": target_catalog[row["id"]],
            "liveCurrentTargetHash": runner.sha(target_catalog[row["id"]].encode("utf-8")),
            "sourceMatchesLive": True,
            "targetMatchesLive": True,
        })
        source_rows_by_id[row["id"]] = row

    result_path = result_dir / f"{runner.safe_batch_name(batch_id)}.json"
    if result_path.is_file():
        saved = runner.validate_cached(result_path, identity, batch_id, rows)
        decisions = saved["decisions"]
        attempt = saved["attempt"]
        response_sha = saved["rawResponseSha256"]
        request_sha = sha((output / "requests" / f"{runner.safe_batch_name(batch_id)}-attempt-{attempt}.json").read_bytes())
        response_rel = f"semantic-output/responses/{runner.safe_batch_name(batch_id)}-attempt-{attempt}.json"
        batch_status = "strict-runner-validated"
        strict_batches += 1
    elif batch_id == manual_batch:
        responses = sorted((output / "responses").glob(f"{runner.safe_batch_name(batch_id)}-attempt-*.json"))
        if len(responses) != 4:
            raise SystemExit(f"{manual_batch}: expected exactly four retained responses")
        attempt = 4
        response_path = responses[-1]
        request_path = output / "requests" / f"{runner.safe_batch_name(batch_id)}-attempt-{attempt}.json"
        error_path = output / "errors" / f"{runner.safe_batch_name(batch_id)}-attempt-{attempt}.json"
        envelope = runner.read_json(response_path)
        content = envelope["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
        decisions = json.loads(content, object_pairs_hook=runner.unique_object)["decisions"]
        request_doc = runner.read_json(request_path)
        requested_rows = json.loads(request_doc["messages"][1]["content"], object_pairs_hook=runner.unique_object)
        validate_manual_batch(rows, decisions, requested_rows)
        attempt_errors = []
        for n in range(1, 5):
            err_path = output / "errors" / f"{runner.safe_batch_name(batch_id)}-attempt-{n}.json"
            resp_path = output / "responses" / f"{runner.safe_batch_name(batch_id)}-attempt-{n}.json"
            req_path = output / "requests" / f"{runner.safe_batch_name(batch_id)}-attempt-{n}.json"
            err = runner.read_json(err_path)
            if err.get("rawResponseSha256") != sha(resp_path.read_bytes()):
                raise SystemExit(f"{manual_batch}: attempt {n} response hash mismatch")
            attempt_errors.append({
                "attempt": n,
                "requestPath": str(req_path.relative_to(ROOT)),
                "requestSha256": sha(req_path.read_bytes()),
                "responsePath": str(resp_path.relative_to(ROOT)),
                "responseSha256": sha(resp_path.read_bytes()),
                "errorPath": str(err_path.relative_to(ROOT)),
                "errorSha256": sha(err_path.read_bytes()),
                "error": err["error"],
            })
        raw_failure = runner.read_json(error_path)
        if "protected brand/URL/code/path" not in raw_failure.get("error", ""):
            raise SystemExit(f"{manual_batch}: strict failure reason changed")
        response_sha = sha(response_path.read_bytes())
        request_sha = sha(request_path.read_bytes())
        response_rel = str(response_path.relative_to(ROOT))
        batch_status = "manual-exception-validated-inline-html-boundary"
        manual_decisions = decisions
        manual_input_rows = rows
        write_json(ROOT / "manual-exception-0094.json", {
            "schemaVersion": 1,
            "batchId": manual_batch,
            "liveHead": LIVE_HEAD,
            "liveTree": LIVE_TREE,
            "appSourceTree": APP_SOURCE_TREE,
            "selectedBatchIndex": batch_index,
            "batchSha256": runner.batch_hash(batch_id, rows),
            "strictRunnerValidation": "failed after four attempts at one inline ProfileLink tag-boundary check",
            "manualValidation": [
                "exact request rows match the pinned frozen batch",
                "all 32 response IDs are present exactly once",
                "all verdict fields and high-confidence correction fields are structurally valid",
                "all ICU signatures match the English source",
                "all non-tag protected literals match exactly",
                "all protected HTML tags match the source in order and multiplicity",
                "no unresolved protected-token masks remain",
            ],
            "manualExceptionReason": "The strict literal matcher rejects inline HTML tags when adjacent translated text makes the tag fail its ASCII word-boundary condition. In the quotaLinkUser correction, both <ProfileLink> and </ProfileLink> are unchanged and in source order; the model proposal is retained only as a candidate for root cross-review.",
            "attempts": attempt_errors,
            "finalResponsePath": str(response_path.relative_to(ROOT)),
            "finalResponseSha256": response_sha,
            "finalRequestPath": str(request_path.relative_to(ROOT)),
            "finalRequestSha256": request_sha,
            "nativeSpeakerApproval": False,
            "catalogsModified": False,
        })
    else:
        raise SystemExit(f"{batch_id}: missing result and no documented manual exception")

    by_id = {decision["id"]: decision for decision in decisions}
    if set(by_id) != {row["id"] for row in rows}:
        raise SystemExit(f"{batch_id}: decision coverage mismatch")
    batch_rows.append({
        "schemaVersion": 1,
        "batchIndex": batch_index,
        "batchId": batch_id,
        "batchSha256": runner.batch_hash(batch_id, rows),
        "cellCount": len(rows),
        "validationStatus": batch_status,
        "attempt": attempt,
        "requestSha256": request_sha,
        "responseSha256": response_sha,
        "responsePath": response_rel,
        "decisionCounts": dict(collections.Counter(d["verdict"] for d in decisions)),
        "liveHead": LIVE_HEAD,
        "liveTree": LIVE_TREE,
        "nativeSpeakerApproval": False,
    })
    for row in rows:
        decision = by_id[row["id"]]
        verdict = decision["verdict"]
        counts[verdict] += 1
        provenance = batch_status
        common = base_cell(batch_id, batch_index, rows, row, provenance=provenance)
        if verdict == "keep":
            accepted_rows.append({
                **common,
                "verdict": "keep",
                "status": "machine-review-accepted-current",
                "decisionSource": "strict-runner" if batch_id != manual_batch else "manual-exception-ledger",
            })
        elif verdict == "uncertain":
            held_rows.append({
                **common,
                "verdict": "uncertain",
                "reason": decision["reason"],
                "status": "held-uncertain",
                "decisionSource": "strict-runner" if batch_id != manual_batch else "manual-exception-ledger",
            })
        elif verdict == "correct":
            proposed = decision["target"]
            candidate_rows.append({
                **common,
                "modelVerdict": "correct",
                "modelConfidence": decision["confidence"],
                "modelReason": decision["reason"],
                "proposedTarget": proposed,
                "proposedTargetHash": runner.sha(proposed.encode("utf-8")),
                "status": "candidate-for-independent-root-cross-review",
                "decisionSource": "strict-runner" if batch_id != manual_batch else "manual-exception-ledger",
            })
        else:
            raise SystemExit(f"{batch_id}/{row['id']}: unknown verdict {verdict}")

write_jsonl(ROOT / "candidate-ledger.jsonl", candidate_rows)
write_jsonl(ROOT / "held-uncertain-cells.jsonl", held_rows)
write_jsonl(ROOT / "accepted-current-machine-decisions.jsonl", accepted_rows)
write_jsonl(ROOT / "batch-ledger.jsonl", batch_rows)

# Pin all app-source paths referenced in exact-literal caller evidence.
tree_entries = subprocess.check_output(["git", "ls-tree", "-r", SOURCE_COMMIT], cwd=REPO, text=True).splitlines()
blob_by_path = {}
for entry in tree_entries:
    meta, path = entry.split("\t", 1)
    blob_by_path[path] = meta.split()[2]
live_tree_entries = subprocess.check_output(["git", "ls-tree", "-r", LIVE_HEAD], cwd=REPO, text=True).splitlines()
live_blob_by_path = {}
for entry in live_tree_entries:
    meta, path = entry.split("\t", 1)
    live_blob_by_path[path] = meta.split()[2]

context_sources = {row["id"]: row for row in source_rows_by_id.values() if row["id"] in {r["id"] for r in candidate_rows + held_rows}}
source_values = {row["source"] for row in context_sources.values()}
literal_to_sources: dict[str, set[str]] = collections.defaultdict(set)
for source in source_values:
    literals = {
        json.dumps(source, ensure_ascii=False),
        "'" + source.replace("\\", "\\\\").replace("'", "\\'") + "'",
    }
    if "`" not in source and "${" not in source:
        literals.add("`" + source + "`")
    for literal in literals:
        literal_to_sources[literal].add(source)
matches: dict[str, list[dict]] = collections.defaultdict(list)
allowed_suffixes = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
for path in sorted((REPO / "src").rglob("*")):
    if not path.is_file() or path.suffix not in allowed_suffixes:
        continue
    rel = path.relative_to(REPO).as_posix()
    if rel.startswith("src/i18n/locale/") or rel not in blob_by_path:
        continue
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    for line_no, line in enumerate(lines, start=1):
        found_sources = set()
        for literal, values in literal_to_sources.items():
            if literal in line:
                found_sources.update(values)
        for source in found_sources:
            matches[source].append({
                "path": rel,
                "fileBlob": blob_by_path[rel],
                "line": line_no,
                "lineSha256": sha(line.encode("utf-8")),
                "lineText": line.strip(),
                "previousLine": lines[line_no - 2].strip() if line_no > 1 else "",
                "nextLine": lines[line_no].strip() if line_no < len(lines) else "",
            })

contexts = []
for message_id, row in sorted(context_sources.items()):
    callers = sorted(matches.get(row["source"], []), key=lambda item: (item["path"], item["line"]))
    for caller in callers:
        caller["liveFileBlob"] = live_blob_by_path.get(caller["path"])
        caller["fileBlobMatchesLive"] = caller["fileBlob"] == caller["liveFileBlob"]
    contexts.append({
        "schemaVersion": 1,
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "liveHead": LIVE_HEAD,
        "liveTree": LIVE_TREE,
        "appSourceCommit": SOURCE_COMMIT,
        "appSourceTree": APP_SOURCE_TREE,
        "domain": row["domain"],
        "locale": row["locale"],
        "id": message_id,
        "source": row["source"],
        "sourceHash": row["sourceHash"],
        "coverage": "found" if callers else "no-exact-source-literal-callsite-found",
        "callsiteCount": len(callers),
        "callers": callers,
    })
write_jsonl(ROOT / "source-contexts.jsonl", contexts)
write_jsonl(ROOT / "selected-cell-attestation.jsonl", selected_cell_attestations)

caller_paths = sorted({caller["path"] for context in contexts for caller in context["callers"]})
caller_blob_mismatches = [
    {"path": path, "sourceFileBlob": blob_by_path.get(path), "liveFileBlob": live_blob_by_path.get(path)}
    for path in caller_paths
    if not blob_by_path.get(path) or blob_by_path.get(path) != live_blob_by_path.get(path)
]
if caller_blob_mismatches:
    raise SystemExit(f"caller source blobs differ between app-source tree and exact live head: {caller_blob_mismatches[:5]}")
cell_mismatches = [row["id"] for row in selected_cell_attestations if not row["sourceMatchesLive"] or not row["targetMatchesLive"]]
if cell_mismatches:
    raise SystemExit(f"selected cell values differ at exact live head: {cell_mismatches[:20]}")
exact_head_attestation = {
    "schemaVersion": 1,
    "liveHead": LIVE_HEAD,
    "liveTree": LIVE_TREE,
    "appSourceCommit": SOURCE_COMMIT,
    "appSourceTree": APP_SOURCE_TREE,
    "sourceCatalog": {"path": source_path, "blob": source_blob, "sha256": source_file_sha},
    "targetCatalog": {"path": target_path, "blob": target_blob, "sha256": target_file_sha},
    "selectedSourceRowsChecked": len(selected_cell_attestations),
    "selectedSourceMismatchRows": [],
    "selectedTargetRowsChecked": len(selected_cell_attestations),
    "selectedTargetMismatchRows": [],
    "sourceContextIdsChecked": len(contexts),
    "sourceContextIdsMissingExactCallsites": [c["id"] for c in contexts if c["coverage"] != "found"],
    "callerPathsChecked": len(caller_paths),
    "callerBlobMismatches": [],
    "callerLineContextsChecked": sum(c["callsiteCount"] for c in contexts),
    "callerLineContextHashes": [
        {"id": c["id"], "path": caller["path"], "line": caller["line"], "lineSha256": caller["lineSha256"],
         "sourceFileBlob": caller["fileBlob"], "liveFileBlob": caller["liveFileBlob"],
         "fileBlobMatchesLive": caller["fileBlobMatchesLive"]}
        for c in contexts for caller in c["callers"]
    ],
    "allSelectedSourceAndTargetValuesMatchLiveHead": True,
    "allCallerSourceBlobsMatchLiveHead": True,
    "allCallerLineContextHashesAreFromPinnedSourceTree": True,
}
write_json(ROOT / "exact-head-attestation.json", exact_head_attestation)

preflight_path = ROOT / "preflight.json"
if not preflight_path.is_file():
    raise SystemExit("pinned preflight report is missing")
preflight = runner.read_json(preflight_path)
if preflight.get("liveSelectionAttestation") != live_attestation:
    raise SystemExit("preflight selection attestation no longer matches final attestation")
if (len(candidate_rows), len(held_rows), len(accepted_rows), sum(counts.values())) != (283, 6, 1311, 1600):
    raise SystemExit(f"unexpected reviewed-window counts: {dict(counts)}")

manual_candidate = next(
    (row for row in candidate_rows if row["id"] == "components.RequestModal.QuotaDisplay.quotaLinkUser"), None
)
if not manual_candidate or manual_candidate["decisionSource"] != "manual-exception-ledger":
    raise SystemExit("manual protected-tag exception is not represented as a candidate")

packet = {
    "schemaVersion": 1,
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "liveState": "OPEN/DRAFT",
    "liveHead": LIVE_HEAD,
    "liveTree": LIVE_TREE,
    "sourceCommit": SOURCE_COMMIT,
    "sourceTree": APP_SOURCE_TREE,
    "window": {"batchStart": WINDOW_START, "batchStopExclusive": WINDOW_STOP, "batchCount": 50, "cellCount": 1600},
    "selection": {
        "firstBatchId": selected[0][0],
        "lastBatchId": selected[-1][0],
        "allSelectedCellsMatchLive": True,
        "liveCellAttestation": live_attestation,
    },
    "sourceCatalog": {"path": source_path, "blob": source_blob, "sha256": source_file_sha},
    "targetCatalog": {"path": target_path, "blob": target_blob, "sha256": target_file_sha},
    "semanticManifestSha256": identity["semanticManifestSha256"],
    "cellPlanSha256": identity["cellPlanSha256"],
    "sourceBundleManifestSha256": identity["sourceBundleManifestSha256"],
    "decisionCounts": dict(counts),
    "batchValidation": {
        "strictRunnerValidated": strict_batches,
        "manualExceptionValidated": 1,
        "strictRunnerExhaustedBatches": 1,
        "unresolvedBatchesAfterManualValidation": 0,
    },
    "manualExceptionBatch": manual_batch,
    "manualExceptionCandidateId": "components.RequestModal.QuotaDisplay.quotaLinkUser",
    "sourceContextCoverage": {
        "candidateAndHeldIds": len(contexts),
        "withExactSourceLiteralCallsite": sum(c["coverage"] == "found" for c in contexts),
        "withoutExactSourceLiteralCallsite": sum(c["coverage"] != "found" for c in contexts),
        "callsiteRows": sum(c["callsiteCount"] for c in contexts),
    },
    "exactHeadAttestation": {
        "selectedSourceRowsChecked": len(selected_cell_attestations),
        "selectedSourceMismatchRows": [],
        "selectedTargetRowsChecked": len(selected_cell_attestations),
        "selectedTargetMismatchRows": [],
        "sourceContextIdsChecked": len(contexts),
        "sourceContextIdsMissingExactCallsites": exact_head_attestation["sourceContextIdsMissingExactCallsites"],
        "callerPathsChecked": len(caller_paths),
        "callerBlobMismatches": [],
        "callerLineContextsChecked": exact_head_attestation["callerLineContextsChecked"],
    },
    "nativeSpeakerApproval": False,
    "targetsApplied": False,
    "catalogsModified": False,
    "testsBuildsScansCiRun": False,
}
write_json(ROOT / "packet-attestation.json", packet)

print(json.dumps({
    "liveHead": LIVE_HEAD,
    "liveTree": LIVE_TREE,
    "cellAttestation": live_attestation,
    "decisionCounts": dict(counts),
    "batchValidation": packet["batchValidation"],
    "sourceContextCoverage": packet["sourceContextCoverage"],
    "files": {
        "candidate-ledger.jsonl": {"rows": len(candidate_rows), "sha256": sha((ROOT / "candidate-ledger.jsonl").read_bytes())},
        "held-uncertain-cells.jsonl": {"rows": len(held_rows), "sha256": sha((ROOT / "held-uncertain-cells.jsonl").read_bytes())},
        "accepted-current-machine-decisions.jsonl": {"rows": len(accepted_rows), "sha256": sha((ROOT / "accepted-current-machine-decisions.jsonl").read_bytes())},
        "batch-ledger.jsonl": {"rows": len(batch_rows), "sha256": sha((ROOT / "batch-ledger.jsonl").read_bytes())},
        "source-contexts.jsonl": {"rows": len(contexts), "sha256": sha((ROOT / "source-contexts.jsonl").read_bytes())},
        "selected-cell-attestation.jsonl": {"rows": len(selected_cell_attestations), "sha256": sha((ROOT / "selected-cell-attestation.jsonl").read_bytes())},
        "exact-head-attestation.json": {"sha256": sha((ROOT / "exact-head-attestation.json").read_bytes())},
        "manual-exception-0094.json": {"sha256": sha((ROOT / "manual-exception-0094.json").read_bytes())},
        "packet-attestation.json": {"sha256": sha((ROOT / "packet-attestation.json").read_bytes())},
    },
}, indent=2))
