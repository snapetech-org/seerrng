#!/usr/bin/env python3
"""Strict SeerrNG semantic runner for frozen source/cells at 5a, re-attested at live PR head 7a140ea."""
from __future__ import annotations
import argparse
import collections
import concurrent.futures
import fcntl
import hashlib
import types
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

TASK = Path("/mnt/disks/scratch/task-worktrees/localization-20261030")
REPO = TASK / "seerrng-semantic-review-frozen-5a434217"
CURRENT_PR_REPO = Path("/mnt/disks/scratch/task-worktrees/localization-20261030/seerrng-review-window-650-700-422072-20261102")
INPUT = TASK / "seerrng-remote-artifacts/qa-input/semantic-refresh-v11-5a434217"
SOURCE = TASK / "seerrng-remote-artifacts/qa-input/new-source-v8-e964c58"
TRANSLATION_RUNNER = TASK / "translation-tools/run_seerr_v13_translation_adapter_semantic_5a434217.py"
TRANSLATION_OUTPUT = TASK / "translation-results/semantic-v13-no-legacy-translation-results"
OUTPUT = Path("/mnt/disks/scratch/task-scratch/seerrng-review-window-650-700-422072-20261102/semantic-output")
LOCK = TASK / "translation-tools/qwen-model.lock"
ENDPOINT = "http://127.0.0.1:8001"
MODEL = "qwen3.8-27b-heretic:q4km"
EXPECTED_HEAD = "5a4342176a8325c371a35d489cb01c58283bc983"
EXPECTED_LIVE_PR_HEAD = "422072d585074bdd7f8dd3046cbacede69203d6d"
EXPECTED_LIVE_PR_TREE = "c7f3bffb628464e98188f3c8f8c4950d6038cee6"
EXPECTED_TREE = "98cd64952123c9b678e38250e7819cabb4476448"
EXPECTED_MANIFEST_SHA = "3ea74cc6491aecddf9ffcedc69610f13d20b199059aef69bb3c2407feb0826ea"
EXPECTED_SOURCE_MANIFEST_SHA = "212491482d1b9207fed755af6e80ac80a97184ec8dbe84d0c4ad2bd711acae0d"
EXPECTED_TRANSLATION_ADAPTER_SHA = "f98c5fedb39be75e7765fc012f7ca635212442cb373326f9a7fa17b267fc7317"
EXPECTED_TRANSLATION_HEAD = "e964c58c2272184203be60bcf10ce1d96a2fc283"
EXPECTED_TRANSLATION_TREE = "cce3545d52e12a539bd833ca1c5ce5dee0ef1b88"
EXPECTED_PLAN_SHA = "97c3402252a34aaa4f8f9f44a691281d9c35ff7b80d7edb3a26c752436af6558"
EXPECTED_RETIRED_SHA = "dc5ec05547e4da3079c0668f82a52da7999d89ef9d4f037c1cd72af9347ebd83"
EXPECTED_EQUIVALENCE_SHA = "56493dd797eaf4011e40372115caf0a65ba8343c334a7e198ae858b1ad501621"
EXPECTED_ACTIONS = {
    "semantic-review-required": 114783,
    "reuse-equivalence-decision": 477,
}
EXPECTED_PLAN_ROWS = 115260
EXPECTED_RETIRED_ROWS = 48
MAX_ATTEMPTS = 4
MAX_WORKERS = 4
BATCH_SIZE = 32
EXPECTED_DRAFT_SHA = "58567404d0c0445d460f95ed0e4d4637039e7ef25c825d355d3acd814eb260ed"
EXPECTED_DRAFT_MANIFEST_SHA = "1b78523e55a63c269c23b579469470e1a10f44cf0e7a7ef693dc196b7f8ad642"
EXPECTED_STRICT_SHA = "29ab973df7739b3de2fbceb6df069e964693efd8c91a185fb179b09bb5d3421a"
EXPECTED_APPLY_SHA = "d466b035cb8af2018cf6f7090c567dc4deee0749c5b4f1495cdf97adee4f4b9b"
HTTP_TIMEOUT = 300
LOCK_WAIT_DEFAULT = 3600
LOCALES = {
    "ar": "Modern Standard Arabic", "de": "German", "es": "neutral Latin American Spanish",
    "fr": "French", "hi": "natural standard Hindi", "id": "Indonesian", "ja": "Japanese",
    "ko": "Korean", "pt-BR": "Brazilian Portuguese", "vi": "Vietnamese",
    "zh-CN": "Simplified Chinese (Mainland usage)", "zh-TW": "Traditional Chinese (Taiwan usage)",
}
CLIENT_CATALOG = {
    "ar": "ar", "de": "de", "es": "es", "fr": "fr", "hi": "hi", "id": "id",
    "ja": "ja", "ko": "ko", "pt-BR": "pt_BR", "vi": "vi", "zh-CN": "zh_Hans", "zh-TW": "zh_Hant",
}
SERVER_CATALOG = {
    "ar": "ar", "de": "de", "es": "es", "fr": "fr", "hi": "hi", "id": "id",
    "ja": "ja", "ko": "ko", "pt-BR": "pt-BR", "vi": "vi", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def canonical_sha(value: Any) -> str:
    return sha(canonical(value))


def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError(f"duplicate JSON key {key!r}")
        obj[key] = value
    return obj


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def write_raw_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_bytes(data)
    os.replace(tmp, path)


_TRANSLATION_MODULE = None


def load_translation_module():
    global _TRANSLATION_MODULE
    if _TRANSLATION_MODULE is None:
        module = types.ModuleType("seerr_v10_translation_runner")
        module.__file__ = str(TRANSLATION_RUNNER)
        code = compile(TRANSLATION_RUNNER.read_text(encoding="utf-8"), str(TRANSLATION_RUNNER), "exec")
        exec(code, module.__dict__)
        _TRANSLATION_MODULE = module
    return _TRANSLATION_MODULE


def input_identity():
    manifest_bytes = (INPUT / "manifest.json").read_bytes()
    plan_bytes = (INPUT / "cell-plan.jsonl").read_bytes()
    retired_bytes = (INPUT / "retired-cells.jsonl").read_bytes()
    if sha(manifest_bytes) != EXPECTED_MANIFEST_SHA:
        raise ValueError("b244 semantic manifest hash mismatch")
    if sha(plan_bytes) != EXPECTED_PLAN_SHA or sha(retired_bytes) != EXPECTED_RETIRED_SHA:
        raise ValueError("b244 semantic cell-plan/retired-cell hash mismatch")
    manifest = json.loads(manifest_bytes, object_pairs_hook=unique_object)
    pins = manifest.get("inputPins", {})
    artifact_pins = {
        "completeMachineDrafts": EXPECTED_DRAFT_SHA,
        "completeMachineDraftManifest": EXPECTED_DRAFT_MANIFEST_SHA,
        "strictTranslationValidation": EXPECTED_STRICT_SHA,
        "catalogApplyReport": EXPECTED_APPLY_SHA,
    }
    for pin_name, expected_hash in artifact_pins.items():
        pin = pins.get(pin_name, {})
        path = Path(pin.get("path", ""))
        if not path.is_file() or pin.get("sha256") != expected_hash or sha(path.read_bytes()) != expected_hash:
            raise ValueError(f"semantic machine-draft artifact pin mismatch: {pin_name}")
    draft_manifest = read_json(Path(pins["completeMachineDraftManifest"]["path"]))
    strict_report = read_json(Path(pins["strictTranslationValidation"]["path"]))
    apply_report = read_json(Path(pins["catalogApplyReport"]["path"]))
    if draft_manifest.get("acceptedCells") != 31668 or draft_manifest.get("unresolvedCells") != 0:
        raise ValueError("complete machine-draft counts differ from the pinned set")
    if strict_report.get("acceptedCells") != 31668 or strict_report.get("unresolvedCells") != 0 or strict_report.get("cellCountParity") != "pass":
        raise ValueError("strict machine-draft validation is incomplete")
    if not apply_report.get("targetsApplied") or apply_report.get("sourceCells") != 31668 or apply_report.get("unresolvedCells") != 0:
        raise ValueError("machine-draft catalog application report is incomplete")
    adapter_pin = manifest.get("inputPins", {}).get("frozenTranslationAdapter", {})
    if adapter_pin.get("path") != str(TRANSLATION_RUNNER) or adapter_pin.get("sha256") != EXPECTED_TRANSLATION_ADAPTER_SHA:
        raise ValueError("semantic manifest does not pin the frozen translation adapter")
    if not TRANSLATION_RUNNER.is_file() or sha(TRANSLATION_RUNNER.read_bytes()) != EXPECTED_TRANSLATION_ADAPTER_SHA:
        raise ValueError("frozen translation adapter changed")
    tr = load_translation_module()
    # Reuse the exact frozen 5a worktree for source/cell inputs.
    tr.REPO = REPO
    source_identity, grouped_jobs = tr.input_identity()
    # Re-attest every frozen source/catalog input against the current PR head.
    live_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=CURRENT_PR_REPO, text=True).strip()
    live_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=CURRENT_PR_REPO, text=True).strip()
    live_status = subprocess.check_output(["git", "status", "--porcelain"], cwd=CURRENT_PR_REPO, text=True).strip()
    if (live_head, live_tree, live_status) != (EXPECTED_LIVE_PR_HEAD, EXPECTED_LIVE_PR_TREE, ""):
        raise ValueError(f"current Seerr PR worktree is not the pinned clean live head: {live_head}/{live_tree}")
    current_hashes = manifest.get("inputPins", {}).get("currentHeadTrackedFilesSha256", {})
    direct_catalogs = manifest.get("inputPins", {}).get("currentDirectCatalogFilesSha256", {})
    if len(current_hashes) != 50 or len(direct_catalogs) != 24:
        raise ValueError("current Seerr source/catalog hash inventory differs from the frozen 50-file set")
    for relative, digest in current_hashes.items():
        path = CURRENT_PR_REPO / relative
        if not path.is_file():
            raise ValueError(f"current PR tracked source/catalog file is missing: {relative}")
        actual = sha(path.read_bytes())
        # Catalogs changed only through previously reviewed localization commits;
        # selected cells are re-attested individually before any model request.
        if relative not in direct_catalogs and actual != digest:
            raise ValueError(f"current PR non-catalog source differs from the frozen semantic input: {relative}")
    changed_since_affd = subprocess.check_output(
        ["git", "diff", "--name-only", "affd7a87860e3613d5c6842c20eb0b45f3bd062f..HEAD"],
        cwd=CURRENT_PR_REPO, text=True,
    ).splitlines()
    for relative in changed_since_affd:
        if relative not in direct_catalogs and not relative.startswith("docs/pr-evidence/"):
            raise ValueError(f"live PR contains a non-catalog/non-evidence change since app-source pin: {relative}")
    if (manifest.get("schemaVersion"), manifest.get("planId"), manifest.get("pullRequest")) != (1, INPUT.name, 418):
        raise ValueError("unexpected semantic plan identity")
    if (manifest.get("worktreeHead"), manifest.get("gitTree")) != (EXPECTED_HEAD, EXPECTED_TREE):
        raise ValueError("semantic manifest head/tree mismatch")
    if manifest.get("targetLocales") != list(LOCALES):
        raise ValueError("semantic locale inventory mismatch")
    pins = manifest.get("inputPins", {})
    source_pin = pins.get("currentSourceBundleV8", {})
    if source_pin.get("path") != str(SOURCE / "manifest.json") or source_pin.get("sha256") != EXPECTED_SOURCE_MANIFEST_SHA:
        raise ValueError("semantic manifest does not pin the exact v8 source bundle")
    if (source_identity["head"], source_identity["tree"], source_identity["manifestSha256"]) != (EXPECTED_TRANSLATION_HEAD, EXPECTED_TRANSLATION_TREE, EXPECTED_SOURCE_MANIFEST_SHA):
        raise ValueError("frozen translation input identity does not match the exact v8 source bundle")
    live_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    live_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=REPO, text=True).strip()
    live_status = subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True).strip()
    if (live_head, live_tree, live_status) != (EXPECTED_HEAD, EXPECTED_TREE, ""):
        raise ValueError(f"live Seerr worktree is not the pinned clean head: {live_head}/{live_tree}")

    # Verify frozen predecessor/equivalence inputs and every listed live locale file.
    for pin_name, expected_hash in (("priorInputManifest", None), ("priorEquivalenceDecisions", EXPECTED_EQUIVALENCE_SHA), ("priorSemanticPreflight", None)):
        pin = pins.get(pin_name, {})
        path = Path(pin.get("path", ""))
        digest = pin.get("sha256")
        if not path.is_file() or sha(path.read_bytes()) != digest or (expected_hash and digest != expected_hash):
            raise ValueError(f"semantic predecessor pin mismatch: {pin_name}")
    for item in pins.get("priorInputFiles", []):
        path = Path(item["path"])
        if not path.is_file() or sha(path.read_bytes()) != item["sha256"]:
            raise ValueError(f"prior semantic input changed: {path}")
        content = path.read_text(encoding="utf-8")
        if path.suffix == ".jsonl":
            rows = sum(1 for line in content.splitlines() if line)
        else:
            parsed = json.loads(content, object_pairs_hook=unique_object)
            rows = len(parsed) if isinstance(parsed, list) else None
        if rows != item["rows"]:
            raise ValueError(f"prior semantic input row count changed: {path}")
    resolver_pins = pins.get("currentResolverFilesSha256", {})
    if set(resolver_pins) != {"bin/generate-i18n-registry.js", "server/types/languages.ts"}:
        raise ValueError("semantic resolver pin inventory changed")
    for relative, expected in resolver_pins.items():
        path = REPO / relative
        if not path.is_file() or sha(path.read_bytes()) != expected:
            raise ValueError(f"semantic resolver pin changed: {relative}")
    direct_catalogs = pins.get("currentDirectCatalogFilesSha256", {})
    if len(direct_catalogs) != 24:
        raise ValueError("semantic current-catalog pin count changed")
    for relative, expected in direct_catalogs.items():
        path = REPO / relative
        if not path.is_file() or sha(path.read_bytes()) != expected:
            raise ValueError(f"semantic current catalog changed: {relative}")
    current_head_files = pins.get("currentHeadTrackedFilesSha256", {})
    v8_live_source_manifest = read_json(SOURCE / "manifest.json")
    frozen_tracked = v8_live_source_manifest.get("trackedFileSha256", {})
    if set(current_head_files) != set(frozen_tracked) or len(current_head_files) != 50:
        raise ValueError("current exact-head source/catalog file pin set differs from frozen v8 inventory")
    expected_direct_set = {p for p in current_head_files if p.startswith("src/i18n/locale/") and p.rsplit("/",1)[-1] != "en.json" and p != "src/i18n/locale/es_MX.json"} | {p for p in current_head_files if p.startswith("server/i18n/locale/") and p.rsplit("/",1)[-1] != "en.json" and p != "server/i18n/locale/es-MX.json"}
    if set(direct_catalogs) != expected_direct_set:
        raise ValueError("exact direct-catalog pin set differs from the 24 rollout catalogs")
    alias_pin = pins.get("priorExactHeadAliasBeforeCatalogApply", {})
    alias_path = Path(alias_pin.get("path", ""))
    if not alias_path.is_file() or sha(alias_path.read_bytes()) != alias_pin.get("sha256"):
        raise ValueError("pre-apply exact-head alias manifest changed")
    alias_doc = read_json(alias_path)
    prior_hashes = alias_pin.get("currentHashes", {})
    if alias_doc.get("head") != "f67039a778d38912c5351c55fd739cba753b1ee9" or alias_doc.get("trackedFiles", {}).get("currentHashes") != prior_hashes or set(prior_hashes) != set(current_head_files):
        raise ValueError("pre-apply alias does not pin the f670 50-file inventory")
    if set(direct_catalogs) != set(apply_catalog_hashes := {item["path"]: item["afterSha256"] for item in apply_report.get("catalogs", [])}) or direct_catalogs != apply_catalog_hashes:
        raise ValueError("direct target catalog pins do not match the exact apply report")
    for relative, expected in current_head_files.items():
        expected_from_f670 = prior_hashes[relative]
        if relative not in direct_catalogs and expected != expected_from_f670:
            raise ValueError(f"non-target source/catalog changed after f670: {relative}")
        if relative in direct_catalogs and expected != direct_catalogs[relative]:
            raise ValueError(f"current target catalog hash differs from applied output: {relative}")
    for relative, expected in current_head_files.items():
        path = REPO / relative
        if not path.is_file() or sha(path.read_bytes()) != expected:
            raise ValueError(f"current exact-head source/catalog file changed: {relative}")

    # The retained v6 job inventory must match the copied v8 job inventory byte for byte.
    v6_manifest_pin = pins.get("v6SourceBundleManifest", {})
    v6_manifest_path = Path(v6_manifest_pin.get("path", ""))
    v6_manifest_sha = v6_manifest_pin.get("sha256")
    if not v6_manifest_path.is_file() or sha(v6_manifest_path.read_bytes()) != v6_manifest_sha:
        raise ValueError("retained v6 source manifest changed")
    v6_manifest = read_json(v6_manifest_path)
    v6_jobs = {j["name"]: j for j in v6_manifest.get("jobs", [])}
    v6_tracked = pins.get("v6TrackedFilesSha256", {})
    if v6_tracked != v6_manifest.get("trackedFileSha256", {}):
        raise ValueError("semantic v6 tracked-file pins differ from retained v6 source manifest")
    # The v6 tracked-file hashes are historical; exact current files are checked above.
    # The retained v6 source job bytes are checked against v8 below.
    v8_manifest = read_json(SOURCE / "manifest.json")
    v8_jobs = {j["name"]: j for j in v8_manifest.get("jobs", [])}
    listed_v6_jobs = {j["name"]: j for j in pins.get("v6SourceJobs", [])}
    if set(v6_jobs) != set(v8_jobs) or set(v6_jobs) != set(listed_v6_jobs):
        raise ValueError("v6/v8 source job name inventories differ")
    for name, old in v6_jobs.items():
        new = v8_jobs[name]
        pinned_old = listed_v6_jobs[name]
        if (old["sha256"], old["rows"], old["bytes"]) != (new["sha256"], new["rows"], new["bytes"]):
            raise ValueError(f"v6/v8 job bytes differ: {name}")
        p = Path(old["path"])
        if not p.is_file() or sha(p.read_bytes()) != old["sha256"]:
            raise ValueError(f"retained v6 job changed: {name}")
        if (pinned_old.get("sha256"), pinned_old.get("rows"), pinned_old.get("bytes")) != (old["sha256"], old["rows"], old["bytes"]):
            raise ValueError(f"semantic manifest v6 job pin mismatch: {name}")

    source_snapshot_path = REPO / "config/i18n/source-snapshot.json"
    snapshot = read_json(source_snapshot_path)
    if snapshot.get("schemaVersion") != 1 or snapshot.get("algorithm") != "sha256":
        raise ValueError("unsupported source snapshot schema")
    english = {}
    catalog_cache = {}
    source_relative = {"client": "src/i18n/locale/en.json", "server": "server/i18n/locale/en.json"}
    expected_server_snapshot_additions = {
        "notifications.agents.email.failedRequest4kNoService",
        "notifications.agents.email.failedRequestNoService",
        "notifications.common.issueTypeLabel",
        "notifications.common.issueTypeNameMessage",
        "notifications.common.sports",
    }
    for domain in ("client", "server"):
        english[domain] = read_json(REPO / source_relative[domain])
        hashes = snapshot.get(domain, {})
        missing_snapshot = set(english[domain]) - set(hashes)
        if domain == "client" and missing_snapshot:
            raise ValueError("client English source IDs are missing from source snapshot")
        if domain == "server" and missing_snapshot != expected_server_snapshot_additions:
            raise ValueError("unexpected server English/source-snapshot ID delta")
        for mid, text in english[domain].items():
            if not isinstance(text, str):
                raise ValueError(f"{domain}/{mid}: live English source is not text")
            if mid in hashes and sha(text.encode("utf-8")) != hashes[mid]:
                raise ValueError(f"{domain}/{mid}: live English source hash mismatch")
        for locale in LOCALES:
            filename = CLIENT_CATALOG[locale] if domain == "client" else SERVER_CATALOG[locale]
            relative = (f"src/i18n/locale/{filename}.json" if domain == "client"
                       else f"server/i18n/locale/{filename}.json")
            catalog_cache[(domain, locale)] = read_json(REPO / relative)

    draft_cells = {}
    draft_path = Path(pins["completeMachineDrafts"]["path"])
    for line_no, line in enumerate(draft_path.read_text(encoding="utf-8").splitlines(), 1):
        item = json.loads(line, object_pairs_hook=unique_object)
        key = (item.get("domain"), item.get("locale"), item.get("id"))
        if key in draft_cells:
            raise ValueError(f"duplicate machine-draft cell at line {line_no}: {key}")
        if sha(str(item.get("target", "")).encode("utf-8")) != item.get("targetSha256"):
            raise ValueError(f"machine-draft target hash mismatch at line {line_no}")
        draft_cells[key] = item
    if len(draft_cells) != 31668:
        raise ValueError("machine-draft semantic input row count mismatch")

    jobs_by_cell = {}
    source_rows_by_cell = {}
    for domain, jobs in grouped_jobs.items():
        for job, rows in jobs:
            for row in rows:
                key = (domain, job["locale"], row["id"])
                if key in jobs_by_cell:
                    raise ValueError(f"duplicate frozen translation job cell: {key}")
                jobs_by_cell[key] = (job, row)
                source_rows_by_cell[key] = row

    translation_values = {}
    if TRANSLATION_OUTPUT.exists():
        for domain, jobs in grouped_jobs.items():
            for job, rows in jobs:
                result_path = TRANSLATION_OUTPUT / "results" / f"{tr.stem(job)}.json"
                if not result_path.exists():
                    continue
                saved = tr.validate_cached(result_path, source_identity, job, rows)
                for mid, value in saved["translations"].items():
                    full_key = (job["domain"], job["locale"], mid)
                    if full_key in translation_values:
                        raise ValueError(f"duplicate resumed translation result: {full_key}")
                    translation_values[full_key] = value

    equivalence_doc = read_json(Path(pins["priorEquivalenceDecisions"]["path"]))
    equivalence_rows = equivalence_doc.get("rows", [])
    if len(equivalence_rows) != 477 or len({(r.get("locale"), r.get("id")) for r in equivalence_rows}) != 477:
        raise ValueError("reusable equivalence decisions are not a unique 477-cell set")
    equivalence_by_key = {(r["locale"], r["id"]): r for r in equivalence_rows}
    actions = collections.Counter()
    ready_by_group = {}
    plan_rows = 0
    plan_id_keys = set()
    plan_path = INPUT / "cell-plan.jsonl"
    with plan_path.open("r", encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if not line:
                continue
            row = json.loads(line, object_pairs_hook=unique_object)
            plan_rows += 1
            domain, locale, mid = row.get("domain"), row.get("locale"), row.get("id")
            key = (domain, locale, mid)
            if domain not in ("client", "server") or locale not in LOCALES or not isinstance(mid, str):
                raise ValueError(f"cell-plan line {line_no}: malformed cell identity")
            if key in plan_id_keys:
                raise ValueError(f"duplicate semantic cell: {key}")
            plan_id_keys.add(key)
            source = english[domain].get(mid)
            if not isinstance(source, str) or row.get("source") != source:
                raise ValueError(f"cell-plan line {line_no}: source text differs from pinned English catalog")
            source_hash = sha(source.encode("utf-8"))
            snapshot_hash = snapshot[domain].get(mid)
            if row.get("sourceHash") != source_hash or (snapshot_hash is not None and source_hash != snapshot_hash):
                raise ValueError(f"cell-plan line {line_no}: source hash differs from live English source/snapshot")
            action = row.get("action")
            actions[action] += 1
            catalog = catalog_cache[(domain, locale)]
            target = catalog.get(mid)
            if action == "semantic-review-required":
                if not isinstance(target, str) or target != row.get("target") or sha(target.encode("utf-8")) != row.get("targetHash"):
                    raise ValueError(f"cell-plan line {line_no}: target differs from current pinned catalog")
                if row.get("newMachineDraft") is True:
                    draft = draft_cells.get(key)
                    if not draft or (draft.get("source"), draft.get("sourceHash"), draft.get("target"), draft.get("targetSha256")) != (source, source_hash, target, row.get("targetHash")):
                        raise ValueError(f"cell-plan line {line_no}: applied machine draft differs from frozen validated output")
                ready_by_group.setdefault(("existing", locale, domain), []).append({
                    "id": mid, "source": source, "target": target, "sourceHash": source_hash,
                    "targetHash": row["targetHash"], "locale": locale, "domain": domain,
                    "protectedLiterals": [value for _, value in tr.mask_source(source)[1]],
                })
            elif action == "await-translation-then-semantic-review":
                if target is not None or row.get("target") is not None or row.get("targetHash") is not None:
                    raise ValueError(f"cell-plan line {line_no}: pending translation is seeded in catalog/plan")
                if row.get("provenance") != "new-source-v8":
                    raise ValueError(f"cell-plan line {line_no}: pending cell is not attributed to v8 source bundle")
                if key not in jobs_by_cell:
                    raise ValueError(f"cell-plan line {line_no}: pending cell is absent from frozen translation jobs")
                job, source_row = jobs_by_cell[key]
                if job["name"] != row.get("translationJob") or source_row["sourceHash"] != source_hash:
                    raise ValueError(f"cell-plan line {line_no}: pending translation job/source pin mismatch")
                translated = translation_values.get(key)
                if translated is not None:
                    if tr.sha(translated.encode("utf-8")) == source_hash:
                        # Exact source equality is permitted only when the source itself has no prose.
                        tr.validate_value(domain, source_row, translated)
                    ready_by_group.setdefault(("translated", job["name"], domain), []).append({
                        "id": mid, "source": source, "target": translated, "sourceHash": source_hash,
                        "targetHash": sha(translated.encode("utf-8")), "locale": locale, "domain": domain,
                        "protectedLiterals": [value for _, value in tr.mask_source(source)[1]],
                    })
            elif action == "reuse-equivalence-decision":
                if not isinstance(target, str) or target != row.get("target") or sha(target.encode("utf-8")) != row.get("targetHash"):
                    raise ValueError(f"cell-plan line {line_no}: reusable target differs from current catalog")
                eq = equivalence_by_key.get((locale, mid))
                if not eq or (eq.get("sourceHash"), eq.get("targetHash"), eq.get("source"), eq.get("target")) != (source_hash, row["targetHash"], source, target):
                    raise ValueError(f"cell-plan line {line_no}: equivalence decision does not exactly match source/target")
            else:
                raise ValueError(f"cell-plan line {line_no}: unsupported action {action!r}")
    if plan_rows != EXPECTED_PLAN_ROWS or dict(actions) != EXPECTED_ACTIONS:
        raise ValueError(f"semantic cell action counts changed: {dict(actions)}")
    expected_cells = {(domain, locale, mid) for domain in ("client", "server")
                      for locale in LOCALES for mid in english[domain]}
    if plan_id_keys != expected_cells:
        raise ValueError("semantic plan does not cover the exact live English source catalog cells")
    retired_count = sum(1 for line in retired_bytes.decode("utf-8").splitlines() if line)
    if retired_count != EXPECTED_RETIRED_ROWS:
        raise ValueError("retired cell count changed")
    if actions["reuse-equivalence-decision"] != len(equivalence_by_key):
        raise ValueError("not every pinned equivalence decision is used exactly once")

    ready = []
    pending_cells = 0
    for group, rows in sorted(ready_by_group.items()):
        rows.sort(key=lambda row: row["id"])
        if group[0] == "existing":
            for index in range(0, len(rows), BATCH_SIZE):
                part = rows[index:index + BATCH_SIZE]
                number = index // BATCH_SIZE + 1
                batch_id = f"existing-{group[1]}-{group[2]}-{number:04d}"
                ready.append((batch_id, part))
        else:
            batch_id = f"translated-{group[1]}"
            ready.append((batch_id, rows))
    for action, count in actions.items():
        if action == "await-translation-then-semantic-review":
            pending_cells = count - len(translation_values)
    identity = {
        "repository": "snapetech-org/seerrng", "pullRequest": 418,
        "head": EXPECTED_HEAD, "tree": EXPECTED_TREE,
        "semanticManifestSha256": EXPECTED_MANIFEST_SHA, "cellPlanSha256": EXPECTED_PLAN_SHA,
        "retiredCellsSha256": EXPECTED_RETIRED_SHA, "sourceBundleManifestSha256": EXPECTED_SOURCE_MANIFEST_SHA,
        "sourceRowsSha256": source_identity["sourceRowsSha256"],
        "sourceCellsSha256": source_identity["sourceCellsSha256"],
        "planRows": plan_rows, "actions": dict(actions), "retiredRows": retired_count,
        "reusableEquivalenceCells": len(equivalence_by_key), "targetsApplied": False,
    }
    availability = {
        "translationCellsAvailable": len(translation_values),
        "reviewReadyCells": sum(len(rows) for _, rows in ready),
        "pendingNewTranslationCells": pending_cells,
        "reviewBatches": len(ready),
    }
    return identity, ready, availability


def parse_decisions(raw: str, rows: list[dict]) -> list[dict]:
    content = raw.strip()
    fence = chr(96) * 3
    if content.startswith(fence):
        content = re.sub(r"^" + re.escape(fence) + r"(?:json)?\s*|\s*" + re.escape(fence) + r"$", "", content, flags=re.I)
    decoder = json.JSONDecoder(object_pairs_hook=unique_object)
    obj, end = decoder.raw_decode(content)
    if content[end:].strip() or not isinstance(obj, dict) or set(obj) != {"decisions"} or not isinstance(obj["decisions"], list):
        raise ValueError("response must contain exactly one decisions array")
    wanted = {row["id"] for row in rows}
    decisions = obj["decisions"]
    if any(not isinstance(item, dict) for item in decisions):
        raise ValueError("every decision must be an object")
    ids = [item.get("id") for item in decisions]
    if len(ids) != len(wanted) or len(set(ids)) != len(ids) or set(ids) != wanted:
        raise ValueError("decision IDs differ from the frozen review batch")
    by_id = {item["id"]: item for item in decisions}
    tr = load_translation_module()
    checked = []
    for row in rows:
        item = by_id[row["id"]]
        verdict = item.get("verdict")
        if verdict == "keep":
            if set(item) != {"id", "verdict"}:
                raise ValueError(f"{row['id']}: keep has unexpected fields")
        elif verdict == "uncertain":
            if set(item) != {"id", "verdict", "reason"} or not isinstance(item.get("reason"), str) or not item["reason"].strip():
                raise ValueError(f"{row['id']}: uncertain requires one nonempty reason")
        elif verdict == "correct":
            if set(item) != {"id", "verdict", "target", "confidence", "reason"}:
                raise ValueError(f"{row['id']}: correction fields are malformed")
            candidate = item.get("target")
            if item.get("confidence") != "high" or not isinstance(candidate, str) or not candidate.strip():
                raise ValueError(f"{row['id']}: correction requires high confidence and nonempty target")
            if candidate != candidate.strip():
                raise ValueError(f"{row['id']}: correction has surrounding whitespace")
            if candidate == row["target"]:
                raise ValueError(f"{row['id']}: correction is unchanged")
            if not isinstance(item.get("reason"), str) or not item["reason"].strip():
                raise ValueError(f"{row['id']}: correction requires a concise factual reason")
            if tr.icu_signature(candidate.strip()) != tr.icu_signature(row["source"]):
                raise ValueError(f"{row['id']}: correction changes ICU placeholder structure")
            required = tr.protected_values(row["source"])
            actual = tr.protected_literal_counts(candidate.strip(), required)
            if actual != required:
                raise ValueError(f"{row['id']}: correction changes a protected brand/URL/code/path")
            if tr.MASK.search(candidate):
                raise ValueError(f"{row['id']}: correction contains an unresolved protected-token mask")
        else:
            raise ValueError(f"{row['id']}: invalid verdict {verdict!r}")
        checked.append(item)
    return checked


def acquire_lock(lock_file, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            if time.monotonic() >= deadline:
                raise TimeoutError("shared Qwen model lock wait timed out")
            time.sleep(2)


def wait_slots_available(required: int, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        request = urllib.request.Request(ENDPOINT + "/slots")
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            slots = json.load(response)
        if not isinstance(slots, list):
            raise RuntimeError("Qwen /slots response is not a list")
        if len(slots) < required:
            raise RuntimeError(f"Qwen advertises {len(slots)} slots; {required} requested")
        if sum(not bool(slot.get("is_processing")) for slot in slots) >= required:
            return
        time.sleep(5)
    raise TimeoutError(f"Qwen did not expose {required} idle slots before timeout")


def assert_no_uncoordinated_runner() -> None:
    # Questarr's active runner currently uses a private lock rather than LOCK.
    # Refuse before any endpoint request while that non-cooperating runner exists.
    for proc in Path("/proc").glob("[0-9]*/cmdline"):
        try:
            argv = proc.read_bytes().replace(b"\0", b" ").decode("utf-8", "replace")
        except (OSError, PermissionError):
            continue
        if "questarrng/" in argv and "run_serial.py" in argv:
            raise RuntimeError("uncoordinated Questarr runner is active; refusing model endpoint access")


def safe_batch_name(batch_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", batch_id)


def batch_hash(batch_id: str, rows: list[dict]) -> str:
    return canonical_sha({"batchId": batch_id, "rows": rows})


def normalized_row(row: dict) -> dict:
    """Normalize only non-semantic protected-literal array order for cache lookup."""
    value = dict(row)
    value["protectedLiterals"] = sorted(value.get("protectedLiterals", []))
    return value


def validate_cached(path: Path, identity: dict, batch_id: str, rows: list[dict]) -> dict:
    """Revalidate a cached result against its exact saved request and frozen cells.

    protectedLiterals is produced from a set and can reorder equal-length values
    across Python hash seeds. The saved request remains authoritative; this
    check normalizes only that list order and validates request/response hashes,
    exact IDs, source/target content, and strict parsed decisions.
    """
    saved = read_json(path)
    for key, value in identity.items():
        if saved.get(key) != value:
            raise ValueError(f"{path.name}: cached {key} mismatch")
    attempt = saved.get("attempt")
    if not isinstance(attempt, int) or attempt < 1 or saved.get("batchId") != batch_id or saved.get("rowCount") != len(rows):
        raise ValueError(f"{path.name}: cached batch identity/row count mismatch")
    request_path = OUTPUT / "requests" / f"{safe_batch_name(batch_id)}-attempt-{attempt}.json"
    raw_path = OUTPUT / "responses" / f"{safe_batch_name(batch_id)}-attempt-{attempt}.json"
    if not request_path.is_file() or not raw_path.is_file():
        raise ValueError(f"{path.name}: cached request or response is missing")
    request_doc = read_json(request_path)
    messages = request_doc.get("messages")
    if not isinstance(messages, list) or len(messages) < 2 or not isinstance(messages[1].get("content"), str):
        raise ValueError(f"{path.name}: saved request payload is malformed")
    request_rows = json.loads(messages[1]["content"], object_pairs_hook=unique_object)
    if not isinstance(request_rows, list) or [normalized_row(row) for row in request_rows] != [normalized_row(row) for row in rows]:
        raise ValueError(f"{path.name}: cached request rows differ from pinned source/target cells")
    if saved.get("batchSha256") != batch_hash(batch_id, request_rows):
        raise ValueError(f"{path.name}: cached batch hash differs from original request rows")
    raw = raw_path.read_bytes()
    if saved.get("rawResponseFile") != str(raw_path) or sha(raw) != saved.get("rawResponseSha256"):
        raise ValueError(f"{path.name}: cached raw response path/hash mismatch")
    envelope = json.loads(raw, object_pairs_hook=unique_object)
    content = envelope["choices"][0]["message"]["content"]
    checked = parse_decisions(content, rows)
    if checked != saved.get("decisions") or canonical_sha(checked) != saved.get("decisionsSha256"):
        raise ValueError(f"{path.name}: cached decisions differ from strict raw-response validation")
    return saved


def review_batch(identity: dict, batch_id: str, rows: list[dict]) -> tuple[bool, int]:
    result_path = OUTPUT / "results" / f"{safe_batch_name(batch_id)}.json"
    if result_path.exists():
        validate_cached(result_path, identity, batch_id, rows)
        return True, 0
    request_dir = OUTPUT / "requests"
    response_dir = OUTPUT / "responses"
    error_dir = OUTPUT / "errors"
    prefix = safe_batch_name(batch_id)
    prior = []
    for path in request_dir.glob(prefix + "-attempt-*.json") if request_dir.exists() else []:
        match = re.search(r"-attempt-([0-9]+)\.json$", path.name)
        if match:
            prior.append(int(match.group(1)))
    first = max(prior, default=0) + 1
    last_error, used = None, 0
    language = LOCALES[rows[0]["locale"]]
    for attempt in range(first, first + MAX_ATTEMPTS):
        used += 1
        request_path = request_dir / f"{prefix}-attempt-{attempt}.json"
        response_path = response_dir / f"{prefix}-attempt-{attempt}.json"
        error_path = error_dir / f"{prefix}-attempt-{attempt}.json"
        payload = {
            "model": MODEL, "temperature": 0.08, "max_tokens": 9000,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": (
                    f"Review each existing {language} ({rows[0]['locale']}) SeerrNG {rows[0]['domain']} UI translation against its English source. "
                    "Check meaning, negation, warnings, status, tone, natural UI phrasing, and consistency with the message ID. "
                    "Preserve ICU placeholders and every protected brand, URL, path, inline-code span, and markup exactly. "
                    "For each item return verdict 'keep' if sound, 'correct' only for a high-confidence necessary fix, or 'uncertain' when context is insufficient. "
                    "A correction must include a concise factual reason and the complete corrected target. Never invent product behavior. "
                    "Return only JSON: {\"decisions\":[{\"id\":\"...\",\"verdict\":\"keep\"}, "
                    "{\"id\":\"...\",\"verdict\":\"uncertain\",\"reason\":\"...\"}, "
                    "{\"id\":\"...\",\"verdict\":\"correct\",\"target\":\"...\",\"confidence\":\"high\",\"reason\":\"...\"}]}. "
                    "Include every supplied ID exactly once."
                )},
                {"role": "user", "content": json.dumps(rows, ensure_ascii=False, separators=(",", ":"))},
            ],
        }
        if last_error:
            payload["messages"].append({"role": "user", "content": f"The previous response failed validation: {last_error[:2000]}. Return a full corrected decision set for the same IDs."})
        write_json_atomic(request_path, payload)
        raw = b""
        try:
            request = urllib.request.Request(ENDPOINT + "/v1/chat/completions",
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
                raw = response.read()
            write_raw_atomic(response_path, raw)
            envelope = json.loads(raw, object_pairs_hook=unique_object)
            content = envelope["choices"][0]["message"]["content"]
            decisions = parse_decisions(content, rows)
            record = {
                "schemaVersion": 1, **identity, "batchId": batch_id,
                "batchSha256": batch_hash(batch_id, rows), "rowCount": len(rows),
                "model": MODEL, "attempt": attempt, "decisions": decisions,
                "decisionsSha256": canonical_sha(decisions),
                "rawResponseSha256": sha(raw), "rawResponseFile": str(response_path),
                "targetsApplied": False,
            }
            write_json_atomic(result_path, record)
            return False, used
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read()
            except Exception:
                raw = b""
            if raw:
                write_raw_atomic(response_path, raw)
            last_error = f"HTTP {exc.code}: {exc.reason}"
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        write_json_atomic(error_path, {
            "batchId": batch_id, "attempt": attempt, "error": last_error,
            "rawResponseSha256": sha(raw) if raw else None,
            "rawResponseFile": str(response_path) if raw else None,
        })
        if attempt < first + MAX_ATTEMPTS - 1:
            time.sleep(min(15, 3 * (attempt - first + 1)))
    raise RuntimeError(f"{batch_id} failed after {MAX_ATTEMPTS} attempts: {last_error}")


def pin_output(identity: dict) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pin = OUTPUT / "input-pin.json"
    if pin.exists():
        if read_json(pin) != identity:
            raise ValueError("semantic output directory belongs to different pinned inputs")
    elif any(p.name != "input-pin.json" for p in OUTPUT.iterdir()):
        raise ValueError("refusing to mix semantic output with unpinned artifacts")
    write_json_atomic(pin, identity)


def update_summary(identity: dict, availability: dict, selected: list[tuple[str, list[dict]]], attempts: int) -> dict:
    complete, pending, verdicts = 0, [], collections.Counter()
    for batch_id, rows in selected:
        path = OUTPUT / "results" / f"{safe_batch_name(batch_id)}.json"
        if path.exists():
            saved = validate_cached(path, identity, batch_id, rows)
            complete += 1
            verdicts.update(item["verdict"] for item in saved["decisions"])
        else:
            pending.append(batch_id)
    summary = {
        **identity, **availability, "model": MODEL, "attemptsThisInvocation": attempts,
        "completedBatches": complete, "pendingBatches": len(pending),
        "pendingBatchIds": pending, "decisionCounts": dict(verdicts),
        "targetsApplied": False, "nativeSpeakerReview": "not performed",
    }
    write_json_atomic(OUTPUT / "run-summary.json", summary)
    return summary


def validate_live_selected(selected: list[tuple[str, list[dict]]]) -> dict:
    """Re-attest exact selected source/target values against the live PR tree."""
    source_files = {
        "client": CURRENT_PR_REPO / "src/i18n/locale/en.json",
        "server": CURRENT_PR_REPO / "server/i18n/locale/en.json",
    }
    live_english = {domain: read_json(path) for domain, path in source_files.items()}
    live_catalogs = {}
    for _, rows in selected:
        for row in rows:
            domain, locale = row["domain"], row["locale"]
            catalog_key = (domain, locale)
            if catalog_key in live_catalogs:
                continue
            filename = CLIENT_CATALOG[locale] if domain == "client" else SERVER_CATALOG[locale]
            relative = (f"src/i18n/locale/{filename}.json" if domain == "client"
                        else f"server/i18n/locale/{filename}.json")
            live_catalogs[catalog_key] = read_json(CURRENT_PR_REPO / relative)
    cell_count = 0
    for batch_id, rows in selected:
        for row in rows:
            domain, locale, mid = row["domain"], row["locale"], row["id"]
            source = live_english[domain].get(mid)
            target = live_catalogs[(domain, locale)].get(mid)
            if source != row["source"] or sha(str(source).encode("utf-8")) != row["sourceHash"]:
                raise ValueError(f"{batch_id}/{mid}: live English source differs from frozen selected cell")
            if target != row["target"] or sha(str(target).encode("utf-8")) != row["targetHash"]:
                raise ValueError(f"{batch_id}/{mid}: live catalog target differs from frozen selected cell")
            cell_count += 1
    return {
        "livePrHead": EXPECTED_LIVE_PR_HEAD,
        "livePrTree": EXPECTED_LIVE_PR_TREE,
        "selectedBatchCount": len(selected),
        "selectedCellCount": cell_count,
        "selectedCellHashesMatchLive": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--run", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--max-batches", type=int, default=0)
    parser.add_argument("--batch-start", type=int, default=0)
    parser.add_argument("--lock-wait-seconds", type=int, default=LOCK_WAIT_DEFAULT)
    args = parser.parse_args()
    if not 1 <= args.workers <= MAX_WORKERS or args.max_batches < 0 or args.batch_start < 0 or args.lock_wait_seconds < 1:
        parser.error("workers must be 1..4; batch start/max nonnegative; lock timeout positive")
    identity, all_selected, availability = input_identity()
    if args.batch_start > len(all_selected):
        parser.error("batch start is beyond the frozen review batch inventory")
    batch_stop = len(all_selected) if args.max_batches == 0 else min(len(all_selected), args.batch_start + args.max_batches)
    selected = all_selected[args.batch_start:batch_stop]
    if not selected:
        parser.error("selected review batch window is empty")
    remote_head_preflight = subprocess.check_output(
        ["gh", "pr", "view", "418", "--repo", "snapetech-org/seerrng", "--json", "headRefOid", "--jq", ".headRefOid"],
        text=True,
    ).strip()
    if remote_head_preflight != EXPECTED_LIVE_PR_HEAD:
        raise ValueError(f"live PR #418 head changed from the independently re-attested tree: {remote_head_preflight}")
    live_selection_attestation = validate_live_selected(selected)
    result = {
        **identity, **availability, "mode": "preflight" if args.preflight else "run",
        "selectedBatchStart": args.batch_start, "selectedBatchStop": batch_stop, "totalReviewBatches": len(all_selected),
        "selectedBatchIds": [batch_id for batch_id, _ in selected],
        "selectedBatches": len(selected), "selectedCells": sum(len(rows) for _, rows in selected),
        "workers": args.workers if args.run else 0,
        "lockOwner": "single orchestrator for entire invocation" if args.run else None,
        "modelCalls": 0, "liveSelectionAttestation": live_selection_attestation,
    }
    if args.preflight:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    remote_head = subprocess.check_output(
        ["gh", "pr", "view", "418", "--repo", "snapetech-org/seerrng", "--json", "headRefOid", "--jq", ".headRefOid"],
        text=True,
    ).strip()
    if remote_head != EXPECTED_LIVE_PR_HEAD:
        raise ValueError(f"live PR #418 head changed from the independently re-attested catalog state: {remote_head}")
    if OUTPUT.resolve().is_relative_to(REPO.resolve()):
        raise ValueError("semantic output must stay outside the repository worktree")
    assert_no_uncoordinated_runner()
    if not LOCK.is_file():
        raise RuntimeError("shared Qwen lock file is absent; refusing to create a competing lock")
    with LOCK.open("r+") as lock_file:
        acquire_lock(lock_file, args.lock_wait_seconds)
        wait_slots_available(args.workers, args.lock_wait_seconds)
        pin_output(identity)
        invocation_path = OUTPUT / "invocations" / f"range-{args.batch_start:05d}-{batch_stop:05d}.json"
        invocation_doc = {**identity, "livePrHeadAtRun": remote_head, "livePrTreeAtRun": EXPECTED_LIVE_PR_TREE,
                          "batchStart": args.batch_start, "batchStop": batch_stop,
                          "selectedBatchIds": [batch_id for batch_id, _ in selected],
                          "selectedCellCount": sum(len(rows) for _, rows in selected),
                          "totalReviewBatches": len(all_selected), "targetsApplied": False,
                          "nativeSpeakerReview": "not performed"}
        if invocation_path.exists() and read_json(invocation_path) != invocation_doc:
            raise ValueError("bounded semantic invocation range pin changed")
        write_json_atomic(invocation_path, invocation_doc)
        request_dir = OUTPUT / "requests"
        before_counts = {
            batch_id: len(list(request_dir.glob(safe_batch_name(batch_id) + "-attempt-*.json")))
            if request_dir.exists() else 0 for batch_id, _ in selected
        }
        attempts, failures = 0, []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            jobs = {pool.submit(review_batch, identity, batch_id, rows): (batch_id, rows)
                    for batch_id, rows in selected}
            processed = 0
            for future in concurrent.futures.as_completed(jobs):
                batch_id, rows = jobs[future]
                try:
                    reused, calls = future.result()
                    attempts += calls
                    print(json.dumps({"batchId": batch_id, "reused": reused, "attempts": calls}), flush=True)
                except Exception as exc:
                    request_dir = OUTPUT / "requests"
                    after = len(list(request_dir.glob(safe_batch_name(batch_id) + "-attempt-*.json"))) if request_dir.exists() else before_counts[batch_id]
                    failed_attempts = max(0, after - before_counts[batch_id])
                    attempts += failed_attempts
                    failure = {"batchId": batch_id, "attempts": failed_attempts,
                               "error": f"{type(exc).__name__}: {exc}", "recordedAt": int(time.time())}
                    failure_path = OUTPUT / "failures.json"
                    old = read_json(failure_path) if failure_path.exists() else []
                    old.append(failure)
                    write_json_atomic(failure_path, old)
                    failures.append(failure)
                    print(json.dumps({"batchId": batch_id, "error": failure["error"]}), flush=True)
                processed += 1
                if processed % 25 == 0 or processed == len(jobs):
                    update_summary(identity, availability, all_selected, attempts)
        summary = update_summary(identity, availability, all_selected, attempts)
        summary["failedBatchesThisInvocation"] = failures
        summary["workers"] = args.workers
        summary["lockOwner"] = "single orchestrator for entire invocation"
        write_json_atomic(OUTPUT / "run-summary.json", summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
        return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
