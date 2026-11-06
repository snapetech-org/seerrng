#!/usr/bin/env python3
"""Build sealed, candidate-free SeerrNG PR #418 W3980-W3999 input."""
import collections
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent
REPO = Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3980-3999-source").resolve()
PREV = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-primary-20261104/candidate-free-input")
HEAD = "d9c5224dbce97e8ae6e72b0ad0bf401e65e215eb"
TREE = "6578ebc4c8bd6c569fcea47978a2c47bd6e4bc8f"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
BASE = "fa40534ccced75bde1125c14760514fcd5d7de4d"
MAIN = "016bcf8db7475b2105b9b488ff67ed7d1c096508"
TREE_PATH = "src/i18n/locale/en.json"
FIRST, LAST = 3980, 3999
LOCAL_ORDER = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]
PRIOR_CROSS_PATH = "docs/pr-evidence/pr418-localization-2026-11-04/w3960-3979-application"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def shat(value):
    return sha(value.encode("utf-8"))


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def git(*args):
    return subprocess.check_output(["git", "-C", str(REPO), *args])


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(name, values):
    (OUT / name).write_text("".join(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for value in values), encoding="utf-8")


def git_blob(path):
    return subprocess.check_output(["git", "-C", str(REPO), "hash-object", path], text=True).strip()


def tokens(value):
    protected = re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])", value)
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }


def token_checks(source_tokens, target_tokens):
    output = {}
    for field in ("placeholders", "markupTags", "numericTokens"):
        output[field] = {"matches": source_tokens[field] == target_tokens[field], "source": source_tokens[field], "target": target_tokens[field]}
    missing = [value for value in source_tokens["protectedLiterals"] if value not in target_tokens["protectedLiterals"]]
    output["protectedLiterals"] = {
        "matches": not missing, "source": source_tokens["protectedLiterals"],
        "target": target_tokens["protectedLiterals"], "missingFromTarget": missing,
    }
    return output


def api_snapshot():
    repository = "snapetech-org/seerrng"
    pr = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/pulls/418"]))
    branch_ref = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/git/ref/heads/{pr['head']['ref']}"]))["object"]["sha"]
    pull_ref = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/git/ref/pull/418/head"]))["object"]["sha"]
    main_ref = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/git/ref/heads/main"]))["object"]["sha"]
    main_commit = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/commits/{main_ref}"]))
    compare = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/compare/{pr['base']['sha']}...{main_ref}"]))
    deployments = json.loads(subprocess.check_output(["gh", "api", f"repos/{repository}/deployments?sha={HEAD}&per_page=100"]))
    api = {
        "repository": repository, "number": 418, "state": pr["state"].upper(), "isDraft": pr["draft"],
        "merged": pr["merged"], "headRefName": pr["head"]["ref"], "headRefOid": pr["head"]["sha"],
        "baseRefName": pr["base"]["ref"], "baseRefOid": pr["base"]["sha"], "mergeable": pr.get("mergeable_state"),
        "branchApiHead": branch_ref, "branchRef": branch_ref, "pullRef": pull_ref,
        "tree": git("rev-parse", "HEAD^{tree}").decode().strip(),
        "deployments": deployments, "deploymentsAtExpectedShaCount": sum(row.get("sha") == HEAD for row in deployments),
        "mainRefOid": main_ref, "mainTree": main_commit["commit"]["tree"]["sha"],
        "compare": {
            "status": compare["status"], "aheadBy": compare["ahead_by"], "behindBy": compare["behind_by"],
            "totalCommits": compare["total_commits"],
            "files": [{"path": row["filename"], "status": row["status"], "additions": row["additions"],
                       "deletions": row["deletions"], "changes": row["changes"]} for row in compare.get("files", [])],
        },
        "attestedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    return api


def remote_refs():
    raw = subprocess.check_output(["git", "ls-remote", "https://github.com/snapetech-org/SeerrNG.git",
                                   f"refs/heads/{BRANCH}", "refs/pull/418/head"], text=True)
    return raw


def attestation(api, refs):
    return {
        "branchApiHead": api["branchApiHead"], "branchRef": api["branchRef"], "pullRef": api["pullRef"],
        "tree": api["tree"], "deployments": api["deployments"],
        "deploymentsAtExpectedShaCount": api["deploymentsAtExpectedShaCount"],
        "pullRequest": {
            "number": api["number"], "state": api["state"], "isDraft": api["isDraft"],
            "headRefOid": api["headRefOid"], "headRefName": api["headRefName"],
            "baseRefOid": api["baseRefOid"], "baseRefName": api["baseRefName"],
            "mergeable": api["mergeable"], "url": "https://github.com/snapetech-org/seerrng/pull/418",
        },
        "remoteRefs": [line.strip() for line in refs.splitlines() if line.strip()],
        "mainRefOid": api["mainRefOid"], "mainTree": api["mainTree"], "attestedUtc": api["attestedUtc"],
    }


def file_line_info(path):
    data = (REPO / path).read_bytes()
    text = data.decode("utf-8")
    return data, text.splitlines()


def source_definition_file(namespace):
    matches = []
    for path in (REPO / "src/components").rglob("*.tsx"):
        text = path.read_text(encoding="utf-8")
        if re.search(r"['\"]" + re.escape(namespace) + r"['\"]", text):
            matches.append(path.relative_to(REPO).as_posix())
    if len(matches) != 1:
        raise SystemExit(f"REFUSED: namespace definition is not unique: {namespace} ({len(matches)})")
    return matches[0]


def page_file(component_name):
    matches = []
    for path in (REPO / "src/pages").rglob("*.tsx"):
        lines = path.read_text(encoding="utf-8").splitlines()
        joined = "\n".join(lines)
        if (re.search(r"import\s+" + re.escape(component_name) + r"\s+from\s+['\"]@app/components/Settings/Notifications/" + re.escape(component_name) + r"['\"]", joined)
                and re.search(r"<" + re.escape(component_name) + r"\s*/>", joined)):
            matches.append(path.relative_to(REPO).as_posix())
    if len(matches) != 1:
        raise SystemExit(f"REFUSED: notification page renderer is not unique: {component_name} ({len(matches)})")
    return matches[0]


def block(path, lines, line, radius, context_id, context_type, source):
    start, end = max(1, line-radius), min(len(lines), line+radius)
    chosen = [{"line": n, "lineSha256": shat(lines[n-1]), "text": lines[n-1]} for n in range(start, end+1)]
    return {
        "contextId": context_id, "contextType": context_type, "path": path,
        "sourceId": source["sourceId"], "sourcePosition": source["position"],
        "startLine": start, "endLine": end, "lines": chosen,
    }


def main():
    if git("rev-parse", "HEAD").decode().strip() != HEAD or git("rev-parse", "HEAD^{tree}").decode().strip() != TREE:
        raise SystemExit("REFUSED: source worktree is not at requested exact pin")
    if git("status", "--porcelain").decode().strip():
        raise SystemExit("REFUSED: source worktree is dirty")
    before_api = api_snapshot()
    before_refs = remote_refs()
    write_json("PR-attestation.json", attestation(before_api, before_refs))
    (OUT / "remote-refs-before.tsv").write_text(before_refs, encoding="utf-8")
    write_json("deployments-before.json", {"sha": HEAD, "count": before_api["deploymentsAtExpectedShaCount"], "deployments": before_api["deployments"]})
    if (before_api["state"], before_api["isDraft"], before_api["merged"], before_api["headRefOid"], before_api["branchApiHead"], before_api["branchRef"], before_api["pullRef"], before_api["baseRefName"], before_api["baseRefOid"]) != (
        "OPEN", True, False, HEAD, HEAD, HEAD, HEAD, "main", BASE
    ):
        raise SystemExit("REFUSED: live PR refs/state/base do not match requested pin")

    previous_manifest = read_json(PREV / "manifest.json")
    previous_window = read_json(PREV / "window.json")
    if (previous_manifest.get("window"), previous_manifest.get("head"), previous_manifest.get("tree"), previous_manifest.get("range")) != (
        "W3960-W3979", "a456dd66aad34cb23f432cb3c189bb8083bbbe96", "7a5447e5f08e84c392899a6e1400d1df73b1143b", [3960, 3979]
    ):
        raise SystemExit("REFUSED: sealed W3960 predecessor packet pin")
    previous_checksum_manifest_sha = sha((PREV / "SHA256SUMS.txt").read_bytes())
    previous_manifest_sha = sha((PREV / "manifest.json").read_bytes())
    previous_order = read_jsonl(PREV / "source-order-hashes.jsonl")
    previous_selected = read_jsonl(PREV / "selected-source-cells.jsonl")
    previous_prior_selection = read_jsonl(PREV / "prior-selection-hash-reattestation.jsonl")
    previous_prior_holds = read_jsonl(PREV / "prior-hold-hash-reattestation.jsonl")
    previous_applied = read_jsonl(PREV / "prior-applied-target-hash-reattestation.jsonl")
    previous_catalog_application = read_json(PREV / "prior-catalog-application-summary.json")
    previous_evidence_hash_index = read_json(PREV / "prior-evidence-hash-index.json")
    previous_cells = read_jsonl(PREV / "current-target-cells.jsonl")
    previous_contexts = read_jsonl(PREV / "caller-contexts.jsonl")
    previous_cross_summary_path = f"{PRIOR_CROSS_PATH}/cross-review/summary.json"
    previous_application_summary_path = f"{PRIOR_CROSS_PATH}/application/application-summary.json"
    previous_updates_path = f"{PRIOR_CROSS_PATH}/cross-review/selected-proposals.jsonl"
    previous_holds_path = f"{PRIOR_CROSS_PATH}/cross-review/hash-only-holds.jsonl"
    previous_readback_path = f"{PRIOR_CROSS_PATH}/application/application-readback.jsonl"
    previous_cross_ledger_path = f"{PRIOR_CROSS_PATH}/cross-review/cross-review-cells.jsonl"
    previous_cross_summary_raw = git("show", f"{HEAD}:{previous_cross_summary_path}")
    previous_cross_summary = json.loads(previous_cross_summary_raw.decode("utf-8"))
    previous_cross_summary_sha = sha(previous_cross_summary_raw)
    previous_application_summary_raw = git("show", f"{HEAD}:{previous_application_summary_path}")
    previous_application_summary = json.loads(previous_application_summary_raw.decode("utf-8"))
    previous_application_summary_sha = sha(previous_application_summary_raw)
    previous_updates_raw = git("show", f"{HEAD}:{previous_updates_path}")
    previous_updates = [json.loads(line) for line in previous_updates_raw.decode("utf-8").splitlines() if line.strip()]
    previous_update_map = {(row["position"], row["locale"]): row for row in previous_updates}
    previous_hold_raw = git("show", f"{HEAD}:{previous_holds_path}")
    w3960_cross_holds = [json.loads(line) for line in previous_hold_raw.decode("utf-8").splitlines() if line.strip()]
    previous_readback_raw = git("show", f"{HEAD}:{previous_readback_path}")
    previous_application_readback = [json.loads(line) for line in previous_readback_raw.decode("utf-8").splitlines() if line.strip()]
    previous_cross_ledger = [json.loads(line) for line in git("show", f"{HEAD}:{previous_cross_ledger_path}").decode("utf-8").splitlines() if line.strip()]
    if (previous_cross_summary.get("head"), previous_cross_summary.get("tree"), previous_cross_summary.get("cellCount"),
        previous_cross_summary.get("crossDispositionCounts"), previous_cross_summary.get("candidateCounts", {}).get("uniqueAffectedCells"),
        previous_cross_summary.get("holdCellCount")) != (
        "a456dd66aad34cb23f432cb3c189bb8083bbbe96", "7a5447e5f08e84c392899a6e1400d1df73b1143b", 240,
        {"HOLD_HASH_ONLY": 12, "KEEP_CURRENT": 218, "SELECT_UPDATE": 10}, 10, 12
    ):
        raise SystemExit("REFUSED: W3960 cross-review lineage summary differs")
    if (previous_application_summary.get("baseHead"), previous_application_summary.get("productCommit"),
        previous_application_summary.get("appliedUpdates"), previous_application_summary.get("retainedCurrent"),
        previous_application_summary.get("heldHashOnly"), previous_application_summary.get("cellCount")) != (
        "a456dd66aad34cb23f432cb3c189bb8083bbbe96", "cb812bd21cf99964a4a7335830294ebdbdc6df34", 10, 218, 12, 240
    ):
        raise SystemExit("REFUSED: W3960 application summary differs")
    if len(previous_updates) != 10 or len(previous_update_map) != 10:
        raise SystemExit("REFUSED: W3960 exact selected target count/uniqueness")
    previous_readback_map = {(row["position"], row["locale"]): row for row in previous_application_readback}
    if len(previous_application_readback) != 240 or len(previous_readback_map) != 240:
        raise SystemExit("REFUSED: W3960 application readback coverage")
    for key, update in previous_update_map.items():
        row = previous_readback_map.get(key)
        if (not row or row.get("postimageMatchesPlan") is not True or
            row.get("preimageTargetSha256") != update["currentTargetSha256"] or
            row.get("selectedTargetSha256") != update["targetSha256"] or
            row.get("postimageTargetSha256") != update["targetSha256"]):
            raise SystemExit("REFUSED: W3960 selected target readback differs")
    if len(previous_cross_ledger) != 240 or len(w3960_cross_holds) != 12 or {(r["position"],r["locale"]) for r in w3960_cross_holds} != {(3979,loc) for loc in LOCAL_ORDER}:
        raise SystemExit("REFUSED: W3960 hold lineage differs")
    if len(previous_prior_selection) != 3960 or len(previous_selected) != 20 or len(previous_prior_holds) != 50 or len(previous_applied) != 262:
        raise SystemExit("REFUSED: W3960 predecessor packet lineage counts differ")

    english_raw = git("show", f"{HEAD}:{TREE_PATH}")
    if english_raw != (REPO / TREE_PATH).read_bytes():
        raise SystemExit("REFUSED: source catalog differs from pinned tree")
    english = json.loads(english_raw.decode("utf-8"))
    if len(english) != 9494:
        raise SystemExit("REFUSED: source catalog entry count")
    source_order = []
    for position, (source_id, source_text) in enumerate(english.items()):
        source_order.append({"position": position, "sourceIdSha256": shat(source_id), "sourceTextSha256": shat(source_text)})
    if len(previous_order) != 9494 or any(previous_order[i] != source_order[i] for i in range(9494)):
        raise SystemExit("REFUSED: current English source order/text hashes differ from sealed inventory")
    prior_ids = {r["sourceIdSha256"] for r in previous_prior_selection} | {r["sourceIdSha256"] for r in previous_selected}
    if len(previous_prior_selection) != 3960 or len(previous_selected) != 20 or len(prior_ids) != 3980:
        raise SystemExit("REFUSED: predecessor selection exclusions do not cover exact prior ranks")
    if not all(source_order[i]["sourceIdSha256"] in prior_ids for i in range(FIRST)):
        raise SystemExit("REFUSED: a source position before the derived next window is not excluded")
    eligible = [row["position"] for row in source_order if row["sourceIdSha256"] not in prior_ids]
    selected_positions = eligible[:20]
    if selected_positions != list(range(FIRST, LAST+1)):
        raise SystemExit(f"REFUSED: next eligible boundary is not W3980-W3999: {selected_positions}")
    if any(source_order[i]["sourceIdSha256"] in prior_ids for i in selected_positions):
        raise SystemExit("REFUSED: derived selection overlaps exclusions")

    selected = []
    for position in selected_positions:
        source_id = list(english.keys())[position]
        source_text = english[source_id]
        selected.append({
            "position": position, "sourceId": source_id, "sourceText": source_text,
            "sourceIdSha256": shat(source_id), "sourceTextSha256": shat(source_text),
            "sourceTokens": tokens(source_text),
        })
    selected_by_id = {row["sourceId"]: row for row in selected}
    if len(selected_by_id) != 20:
        raise SystemExit("REFUSED: selected source IDs are not unique")

    catalog_map = dict(previous_manifest.get("localeOrder", [])) if isinstance(previous_manifest.get("localeOrder"), dict) else {}
    previous_catalog_pins = read_json(PREV / "catalog-file-pins.json")
    locales = [loc for loc in LOCAL_ORDER]
    if previous_manifest.get("localeOrder") != locales:
        raise SystemExit("REFUSED: locale order differs from W3960 sealed input")
    catalog_paths = {locale: previous_catalog_pins["catalogFiles"][locale]["path"] for locale in ["en"] + locales}
    catalog_data, catalog_objects, catalog_pins = {}, {}, {}
    source_key_order = list(english.keys())
    source_sorted_key_hash = sha("\n".join(sorted(source_key_order)).encode("utf-8"))
    source_key_order_hash = sha("\n".join(source_key_order).encode("utf-8"))
    insertion_differences = []
    for locale in ["en"] + locales:
        path = catalog_paths[locale]
        raw = git("show", f"{HEAD}:{path}")
        if raw != (REPO / path).read_bytes():
            raise SystemExit("REFUSED: catalog differs from exact Git tree: " + locale)
        obj = json.loads(raw.decode("utf-8"))
        keys = list(obj)
        if len(keys) != 9494 or set(keys) != set(source_key_order) or any(not isinstance(v, str) for v in obj.values()):
            raise SystemExit("REFUSED: catalog key set or value coverage: " + locale)
        if locale == "en" and keys != source_key_order:
            raise SystemExit("REFUSED: source catalog order changed")
        if keys != source_key_order:
            insertion_differences.append(locale)
        data = (REPO / path).read_bytes()
        entry = {
            "path": path, "byteCount": len(raw), "sha256": sha(raw), "gitBlob": git_blob(path),
            "keyCount": len(keys), "keySequenceSha256": sha("\n".join(keys).encode("utf-8")),
            "sortedKeySetSha256": sha("\n".join(sorted(keys)).encode("utf-8")),
        }
        if entry["gitBlob"] != __import__("hashlib").sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest():
            raise SystemExit("REFUSED: catalog Git blob mismatch: " + locale)
        catalog_data[locale], catalog_objects[locale], catalog_pins[locale] = data, obj, entry
    if any(pin["sortedKeySetSha256"] != source_sorted_key_hash for pin in catalog_pins.values()):
        raise SystemExit("REFUSED: locale sorted key-set parity mismatch")

    runtime_paths = {"config/i18n/locales.json"}
    caller_context_rows, caller_blocks = [], []
    route_cache = {}
    for source_row in selected:
        source_id = source_row["sourceId"]
        namespace, source_key = source_id.rsplit(".", 1)
        source_path = source_definition_file(namespace)
        component_name = source_path.split("/")[-2]
        route_path = route_cache.setdefault(component_name, page_file(component_name))
        runtime_paths.update({source_path, route_path})
        _, source_lines = file_line_info(source_path)
        namespace_lines = [i+1 for i, line in enumerate(source_lines) if namespace in line]
        prop_pattern = re.compile(r"^\s*" + re.escape(source_key) + r"\s*:")
        if len(namespace_lines) != 1:
            raise SystemExit(f"REFUSED: namespace/property definition is not unique for {source_id}")
        def_line = namespace_lines[0]
        call_end = next((i+1 for i in range(def_line, len(source_lines)) if re.match(r"^\s*\)\s*;\s*$", source_lines[i])), None)
        if call_end is None:
            raise SystemExit(f"REFUSED: defineMessages block end missing for {source_id}")
        prop_lines = [i+1 for i, line in enumerate(source_lines[def_line:call_end-1], start=def_line+1) if prop_pattern.search(line)]
        if len(prop_lines) != 1:
            raise SystemExit(f"REFUSED: namespace/property definition is not unique for {source_id}")
        prop_line = prop_lines[0]
        definition = block(source_path, source_lines, prop_line, 2, f"w3980-{source_row['position']}-definition", "message-definition", source_row)
        definition.update({
            "namespace": namespace, "namespaceLine": def_line, "namespaceLineText": source_lines[def_line-1],
            "namespaceLineSha256": shat(source_lines[def_line-1]),
        })
        caller_blocks.append(definition)
        direct_refs = []
        direct_pattern = re.compile(r"\bmessages\." + re.escape(source_key) + r"\b")
        for line_no, line in enumerate(source_lines, 1):
            if direct_pattern.search(line):
                context_id = f"w3980-{source_row['position']}-direct-{len(direct_refs)+1:02d}"
                direct_refs.append({
                    "contextBlockId": context_id, "line": line_no, "lineSha256": shat(line),
                    "path": source_path, "text": line,
                })
                caller_blocks.append(block(source_path, source_lines, line_no, 3, context_id, "direct-message-reference", source_row))
        if not direct_refs:
            raise SystemExit(f"REFUSED: no exact direct production caller for {source_id}")
        _, route_lines = file_line_info(route_path)
        route_refs = []
        for line_no, line in enumerate(route_lines, 1):
            if re.search(r"import\s+" + re.escape(component_name) + r"\s+from", line) or re.search(r"<" + re.escape(component_name) + r"\s*/>", line):
                raw = (REPO / route_path).read_bytes()
                route_refs.append({
                    "fileSha256": sha(raw), "gitBlob": git_blob(route_path), "line": line_no,
                    "lineSha256": shat(line), "path": route_path, "text": line,
                })
        if len(route_refs) != 2:
            raise SystemExit(f"REFUSED: route/render evidence incomplete for {source_id}")
        context_material = {
            "sourceId": source_id, "namespace": namespace, "definition": definition,
            "directMessageReferences": direct_refs, "dynamicRendererReferences": route_refs,
        }
        caller_context_rows.append({
            "position": source_row["position"], "sourceId": source_id,
            "sourceIdSha256": source_row["sourceIdSha256"], "sourceTextSha256": source_row["sourceTextSha256"],
            "sourceKey": source_key, "namespace": namespace, "namespaceFiles": [source_path],
            "definitionCount": 1, "definitionFiles": [source_path],
            "directMessageReferences": direct_refs, "dynamicRendererReferences": route_refs,
            "callerCount": len(direct_refs), "callerOccurrenceCount": len(direct_refs),
            "callerResolution": "defineMessages property declaration with exact messages.property references and pinned notification page route/render context",
            "contextBlockIds": [definition["contextId"]] + [row["contextBlockId"] for row in direct_refs],
            "callerContextSha256": shat(canonical(context_material)),
        })
    runtime_pins = []
    for path in sorted(runtime_paths):
        data = (REPO / path).read_bytes()
        text = data.decode("utf-8")
        blob = git_blob(path)
        if blob != __import__("hashlib").sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest():
            raise SystemExit("REFUSED: runtime source Git blob mismatch: " + path)
        runtime_pins.append({"path": path, "byteCount": len(data), "lineCount": len(text.splitlines()), "sha256": sha(data), "gitBlob": blob})

    callers_by_id = {row["sourceId"]: row for row in caller_context_rows}
    current_cells, mismatch_counts, mismatch_examples = [], collections.Counter(), []
    for source_row in selected:
        caller = callers_by_id[source_row["sourceId"]]
        source_tokens = source_row["sourceTokens"]
        for locale in locales:
            target = catalog_objects[locale][source_row["sourceId"]]
            target_tokens = tokens(target)
            checks = token_checks(source_tokens, target_tokens)
            for name, check in checks.items():
                if not check["matches"]:
                    mismatch_counts[name] += 1
                    mismatch_examples.append({"position": source_row["position"], "sourceIdSha256": source_row["sourceIdSha256"], "locale": locale, "kind": name})
            pin = catalog_pins[locale]
            current_cells.append({
                "position": source_row["position"], "sourceId": source_row["sourceId"],
                "sourceIdSha256": source_row["sourceIdSha256"], "sourceTextSha256": source_row["sourceTextSha256"],
                "locale": locale, "catalogPath": pin["path"], "catalogFileSha256": pin["sha256"],
                "catalogGitBlob": pin["gitBlob"], "currentTarget": target, "currentTargetSha256": shat(target),
                "callerContextSha256": caller["callerContextSha256"],
                "sourceTokens": source_tokens, "targetTokens": target_tokens, "tokenChecks": checks,
            })

    prior_selection = []
    current_by_pos = {r["position"]: r for r in source_order}
    for old in previous_prior_selection:
        current = current_by_pos[old["position"]]
        prior_selection.append({
            "position": old["position"], "sourceIdSha256": old["sourceIdSha256"],
            "sourceTextSha256": old["sourceTextSha256"],
            "currentSourceIdSha256": current["sourceIdSha256"], "currentSourceTextSha256": current["sourceTextSha256"],
            "sourceIdHashMatches": current["sourceIdSha256"] == old["sourceIdSha256"],
            "sourceTextHashMatches": current["sourceTextSha256"] == old["sourceTextSha256"],
        })
    for old in previous_selected:
        current = current_by_pos[old["position"]]
        prior_selection.append({
            "position": old["position"], "sourceIdSha256": old["sourceIdSha256"],
            "sourceTextSha256": old["sourceTextSha256"],
            "currentSourceIdSha256": current["sourceIdSha256"], "currentSourceTextSha256": current["sourceTextSha256"],
            "sourceIdHashMatches": current["sourceIdSha256"] == old["sourceIdSha256"],
            "sourceTextHashMatches": current["sourceTextSha256"] == old["sourceTextSha256"],
        })
    prior_selection.sort(key=lambda row: row["position"])
    if len(prior_selection) != 3980 or not all(row["sourceIdHashMatches"] and row["sourceTextHashMatches"] for row in prior_selection):
        raise SystemExit("REFUSED: prior selected source hash continuity")

    prior_applied = []
    for old in previous_applied:
        source_record = current_by_pos[old["position"]]
        source_id = next(key for key in english if shat(key) == old["sourceIdSha256"])
        source_text = english[source_id]
        locale = old["locale"]
        current_hash = shat(catalog_objects[locale][source_id])
        prior_applied.append({
            "position": old["position"], "sourceIdSha256": old["sourceIdSha256"],
            "sourceTextSha256": old["sourceTextSha256"], "locale": locale,
            "selectedTargetSha256": old["selectedTargetSha256"], "currentTargetSha256": current_hash,
            "sourcePositionMatches": source_record["sourceIdSha256"] == old["sourceIdSha256"],
            "sourceTextHashMatches": shat(source_text) == old["sourceTextSha256"],
            "selectedTargetHashMatches": current_hash == old["selectedTargetSha256"],
            "targetTextIncluded": False, "lineageWindow": old.get("lineageWindow", "prior-history"),
        })
    previous_cells_by_key = {(r["position"], r["locale"]): r for r in previous_cells}
    app_differences = []
    for old in previous_cells:
        current_hash = shat(catalog_objects[old["locale"]][old["sourceId"]])
        if current_hash != old["currentTargetSha256"]:
            app_differences.append((old, current_hash))
    difference_map = {(old["position"],old["locale"]): (old,current_hash) for old,current_hash in app_differences}
    if len(app_differences) != 10 or set(difference_map) != set(previous_update_map):
        raise SystemExit(f"REFUSED: W3960 applied target difference set differs: {len(app_differences)}")
    for key, update in previous_update_map.items():
        old, current_hash = difference_map[key]
        if old["currentTargetSha256"] != update["currentTargetSha256"] or current_hash != update["targetSha256"]:
            raise SystemExit("REFUSED: W3960 applied target hash does not match its selected targets")
        prior_applied.append({
            "position": old["position"], "sourceIdSha256": old["sourceIdSha256"],
            "sourceTextSha256": old["sourceTextSha256"], "locale": old["locale"],
            "previousTargetSha256": old["currentTargetSha256"], "selectedTargetSha256": current_hash,
            "currentTargetSha256": current_hash, "sourcePositionMatches": True,
            "sourceTextHashMatches": True, "selectedTargetHashMatches": True,
            "targetTextIncluded": False, "lineageWindow": "W3960-W3979",
            "previousProductCommit": previous_application_summary["productCommit"],
        })
    applied_keys = [(r["position"],r["locale"]) for r in prior_applied]
    if len(prior_applied) != 272 or len(set(applied_keys)) != 272 or not all(row["selectedTargetHashMatches"] for row in prior_applied):
        raise SystemExit("REFUSED: applied-target hash continuity")

    prior_holds = []
    for old in previous_prior_holds:
        source_id = next(key for key in english if shat(key) == old["sourceIdSha256"])
        current_source = source_order[old["position"]]
        current_target_hash = shat(catalog_objects[old["locale"]][source_id])
        old_source_text_hash = old.get("previousSourceTextSha256", old["sourceTextSha256"])
        previous_target_hash = old["previousTargetSha256"]
        prior_holds.append({
            "position": old["position"], "sourceIdSha256": old["sourceIdSha256"],
            "sourceTextSha256": old_source_text_hash, "locale": old["locale"],
            "previousWindow": old["previousWindow"], "previousTargetSha256": previous_target_hash,
            "currentTargetSha256": current_target_hash, "currentSourceIdSha256": current_source["sourceIdSha256"],
            "currentSourceTextSha256": current_source["sourceTextSha256"],
            "sourcePositionMatches": current_source["sourceIdSha256"] == old["sourceIdSha256"],
            "sourceTextHashMatches": current_source["sourceTextSha256"] == old_source_text_hash,
            "targetHashMatches": current_target_hash == previous_target_hash,
            "priorHoldPreserved": current_target_hash == previous_target_hash,
            "targetTextIncluded": False,
        })
    for held in w3960_cross_holds:
        source_id = next(key for key in english if shat(key) == held["sourceIdSha256"])
        current_source = source_order[held["position"]]
        current_target_hash = shat(catalog_objects[held["locale"]][source_id])
        previous_cell = previous_cells_by_key[(held["position"],held["locale"])]
        if (current_source["sourceIdSha256"] != held["sourceIdSha256"] or
            current_source["sourceTextSha256"] != held["sourceTextSha256"] or
            previous_cell["currentTargetSha256"] != held["currentTargetSha256"] or
            previous_cell["callerContextSha256"] != held["callerContextSha256"] or
            current_target_hash != held["currentTargetSha256"]):
            raise SystemExit("REFUSED: W3960 held target/source/context hash mismatch")
        prior_holds.append({
            "position": held["position"], "sourceIdSha256": held["sourceIdSha256"],
            "sourceTextSha256": held["sourceTextSha256"], "locale": held["locale"],
            "previousWindow": "W3960-W3979", "previousCrossHoldSummarySha256": previous_cross_summary_sha,
            "previousHoldLedgerSha256": sha(previous_hold_raw),
            "previousTargetSha256": held["currentTargetSha256"], "currentTargetSha256": current_target_hash,
            "callerContextSha256": held["callerContextSha256"], "holdCode": "HASH_ONLY_UNRESOLVED_PRODUCT_TERM",
            "holdReasonSha256": shat(held["crossRationale"]), "confidence": "moderate",
            "sourcePositionMatches": True, "sourceTextHashMatches": True,
            "targetHashMatches": current_target_hash == held["currentTargetSha256"],
            "priorHoldPreserved": current_target_hash == held["currentTargetSha256"],
            "targetTextIncluded": False,
        })
    hold_keys = [(r["position"],r["locale"]) for r in prior_holds]
    if len(prior_holds) != 62 or len(set(hold_keys)) != 62 or not all(row["priorHoldPreserved"] for row in prior_holds):
        raise SystemExit("REFUSED: prior hold hash continuity")

    write_jsonl("source-order-hashes.jsonl", source_order)
    write_jsonl("source-window-boundaries-hash-only.jsonl", [
        {"kind":"previous-selection-boundary","position":FIRST-1,"sourceIdSha256":source_order[FIRST-1]["sourceIdSha256"],"sourceTextSha256":source_order[FIRST-1]["sourceTextSha256"],"hashOnly":True},
        *[{"kind":"selected-start" if row["position"]==FIRST else "selected-window-position","position":row["position"],"sourceIdSha256":row["sourceIdSha256"],"sourceTextSha256":row["sourceTextSha256"],"hashOnly":True} for row in source_order[FIRST:LAST+1]],
        {"kind":"next-window-boundary","position":LAST+1,"sourceIdSha256":source_order[LAST+1]["sourceIdSha256"],"sourceTextSha256":source_order[LAST+1]["sourceTextSha256"],"hashOnly":True},
    ])
    write_jsonl("selected-source-cells.jsonl", selected)
    write_jsonl("current-target-cells.jsonl", current_cells)
    write_jsonl("caller-contexts.jsonl", caller_context_rows)
    write_jsonl("caller-context-blocks.jsonl", caller_blocks)
    write_json("runtime-file-pins.json", {"head":HEAD,"tree":TREE,"files":runtime_pins})
    write_json("catalog-file-pins.json", {
        "localeOrder": locales, "catalogKeyCount": 9494,
        "sortedKeySetParityWithEnglish": True,
        "localeInsertionOrderDifferencesFromEnglish": insertion_differences,
        "catalogFiles": catalog_pins,
    })
    write_json("caller-resolution-findings.json", {
        "selectedSourceCount":len(selected),"callerReferences":sum(row["callerCount"] for row in caller_context_rows),
        "callerlessSelectedSourceCount":sum(row["callerCount"]==0 for row in caller_context_rows),
        "callerlessSources":[row["sourceId"] for row in caller_context_rows if row["callerCount"]==0],
    })
    write_json("baseline-token-diagnostics.json", {
        "cellCount":len(current_cells),"markupTags":mismatch_counts["markupTags"],
        "numericTokens":mismatch_counts["numericTokens"],"placeholders":mismatch_counts["placeholders"],
        "protectedLiterals":mismatch_counts["protectedLiterals"],"mismatchExamples":mismatch_examples,
    })
    write_jsonl("prior-selection-hash-reattestation.jsonl", prior_selection)
    write_jsonl("prior-applied-target-hash-reattestation.jsonl", prior_applied)
    write_jsonl("prior-hold-hash-reattestation.jsonl", prior_holds)

    prior_app_files = list(previous_catalog_application.get("priorApplicationEvidenceFiles", []))
    additional_app_paths = [
        f"{PRIOR_CROSS_PATH}/README.md",
        f"{PRIOR_CROSS_PATH}/SHA256SUMS.txt",
        f"{PRIOR_CROSS_PATH}/application/application-summary.json",
        f"{PRIOR_CROSS_PATH}/application/application-readback.jsonl",
        f"{PRIOR_CROSS_PATH}/application/verify_application.py",
        f"{PRIOR_CROSS_PATH}/cross-review/summary.json",
        f"{PRIOR_CROSS_PATH}/cross-review/cross-review-cells.jsonl",
        f"{PRIOR_CROSS_PATH}/cross-review/hash-only-holds.jsonl",
        f"{PRIOR_CROSS_PATH}/cross-review/selected-proposals.jsonl",
        f"{PRIOR_CROSS_PATH}/cross-review/verify_cross_packet.py",
    ]
    for path in additional_app_paths:
        data = git("show", f"{HEAD}:{path}")
        prior_app_files.append({"path":path,"byteCount":len(data),"sha256":sha(data),"gitBlob":git_blob(path)})
    prior_catalog_summary = dict(previous_catalog_application)
    prior_catalog_summary.update({
        "priorAppliedTargetRows":len(prior_applied),"priorCatalogApplicationCells":previous_catalog_application["priorCatalogApplicationCells"]+10,
        "priorApplicationRefs":list(dict.fromkeys(previous_catalog_application["priorApplicationRefs"]+[
            previous_application_summary["productCommit"],HEAD])),
        "previousApplicationProductCommit":previous_application_summary["productCommit"],
        "previousApplicationEvidenceCommit":HEAD,"priorApplicationEvidenceFiles":prior_app_files,
        "currentKeySetsAndOrderPinned":True,"currentUnselectedValuesAreCandidateFreeBaseline":True,
    })
    write_json("prior-catalog-application-summary.json", prior_catalog_summary)
    prior_hash_index = {
        "previousCandidateFreeInputManifestSha256":previous_manifest_sha,
        "previousCandidateFreeChecksumManifestSha256":previous_checksum_manifest_sha,
        "previousApplicationEvidenceCommit":HEAD,"previousApplicationProductCommit":previous_application_summary["productCommit"],
        "previousAppliedTargetHashRows":len(prior_applied),"previousAppliedTargetsUnchangedByHash":len(prior_applied),
        "previousCatalogApplicationCells":prior_catalog_summary["priorCatalogApplicationCells"],"previousCatalogApplicationFilesVerified":13,
        "previousCatalogApplicationTargetHashesMatched":prior_catalog_summary["priorCatalogApplicationCells"],
        "previousSelectedIdsAndSourceTextReattestedByHash":len(prior_selection),"previousSelectedSourceIdCount":len(prior_selection),
        "previousHoldCount":len(prior_holds),"previousHoldTargetsUnchangedByHash":len(prior_holds),
        "previousW3960CrossSummarySha256":previous_cross_summary_sha,
        "previousW3960ApplicationReadbackSha256":sha(previous_readback_raw),
        "previousW3960CurrentHoldLedgerSha256":sha(previous_hold_raw),
    }
    write_json("prior-evidence-hash-index.json", prior_hash_index)

    # Re-read live PR and base/main after extraction, and refuse to seal if refs drifted.
    after_api = api_snapshot()
    after_refs = remote_refs()
    stable_fields = ("number","state","isDraft","merged","headRefName","headRefOid","baseRefName","baseRefOid","branchApiHead","branchRef","pullRef","mainRefOid","mainTree","compare")
    if any(before_api.get(key) != after_api.get(key) for key in stable_fields) or before_refs != after_refs:
        raise SystemExit("REFUSED: PR/base/main refs changed during input extraction")
    write_json("PR-attestation-after.json", attestation(after_api, after_refs))
    (OUT / "remote-refs-after.tsv").write_text(after_refs, encoding="utf-8")
    write_json("deployments-after.json", {"sha":HEAD,"count":after_api["deploymentsAtExpectedShaCount"],"deployments":after_api["deployments"]})
    write_json("main-drift.json", {
        "baseApiSha":BASE,"liveMainBeforeSha":before_api["mainRefOid"],"liveMainAfterSha":after_api["mainRefOid"],
        "liveMainBeforeTree":before_api["mainTree"],"liveMainAfterTree":after_api["mainTree"],
        "status":after_api["compare"]["status"],"aheadBy":after_api["compare"]["aheadBy"],
        "behindBy":after_api["compare"]["behindBy"],"totalCommits":after_api["compare"]["totalCommits"],
        "files":after_api["compare"]["files"],
        "localizationOrCatalogChanges":any("locale" in row["path"].lower() or row["path"].startswith("src/i18n/locale/") for row in after_api["compare"]["files"]),
        "attestedBeforeUtc":before_api["attestedUtc"],"attestedAfterUtc":after_api["attestedUtc"],
    })

    cross_application_readback = previous_application_summary
    write_json("window.json", {
        "repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3980-W3999",
        "head":HEAD,"tree":TREE,"baseRef":"main","baseSha":BASE,"headRef":BRANCH,
        "range":[FIRST,LAST],"previousCompletedWindow":"W3960-W3979","previousCompletedEndPosition":FIRST-1,
        "nextBoundaryPosition":FIRST,"nextBoundary":{
            "kind":"next-window-boundary","position":FIRST,"sourceIdSha256":source_order[FIRST]["sourceIdSha256"],
            "sourceTextSha256":source_order[FIRST]["sourceTextSha256"],"hashOnly":True,
        },
        "nextUnselectedBoundaryPosition":LAST+1,"nextUnselectedBoundary":{
            "position":LAST+1,"sourceIdSha256":source_order[LAST+1]["sourceIdSha256"],
            "sourceTextSha256":source_order[LAST+1]["sourceTextSha256"],"hashOnly":True,
        },
        "selectedSourceCount":20,"localeOrder":locales,"catalogKeyCount":9494,
        "priorSelectedSourceIdCount":len(prior_selection),"priorAppliedTargetHashCount":len(prior_applied),
        "priorHoldCount":len(prior_holds),"priorCatalogApplicationCellsReattested":prior_catalog_summary["priorCatalogApplicationCells"],
        "priorHoldHashMismatches":0,"priorAppliedTargetHashMismatches":0,
        "sourceOrderCount":len(source_order),"sourceIdOrderSha256":sha("\n".join(row["sourceIdSha256"] for row in source_order).encode()),
        "sourceTextOrderSha256":sha("\n".join(row["sourceTextSha256"] for row in source_order).encode()),
        "sourceRecordOrderSha256":sha("\n".join(row["sourceIdSha256"]+":"+row["sourceTextSha256"] for row in source_order).encode()),
        "sourceOrderHashesFull":True,"callerlessSourcePositions":[],
        "baselineTokenDiagnostics":{key:mismatch_counts[key] for key in ("markupTags","numericTokens","placeholders","protectedLiterals")},
        "callerReferenceCount":sum(row["callerCount"] for row in caller_context_rows),
        "previousCrossHoldCells":len(w3960_cross_holds),"previousApplicationTargetRows":cross_application_readback["appliedUpdates"],
        "localeInsertionOrderDifferencesFromEnglish":insertion_differences,
        "candidateFreeInputOnly":True,"proposalCount":0,"dispositionFieldsIncluded":False,
    })
    (OUT / "README.md").write_text(
        "# SeerrNG PR #418 W3980-W3999 candidate-free input\n\n"
        "This input contains the next eligible 20 source IDs and their 240 current cells across the 12 direct locales. "
        "It contains no current-window proposals, dispositions, rationales, or review output.\n\n"
        f"The exact pin is `{HEAD}` / `{TREE}`; the PR targets `main` at `{BASE}`. "
        "The next range was derived from the sealed W3960 source order: positions 0-3979 are covered by unique prior exclusions, "
        "and positions 3980-3999 are the next 20 eligible IDs. Boundary source ID/text hashes at position 3980 are "
        f"`{source_order[FIRST]['sourceIdSha256']}` / `{source_order[FIRST]['sourceTextSha256']}`.\n\n"
        f"The input reattests {len(prior_selection)} prior selected IDs, {len(prior_applied)} prior applied target hashes, "
        f"and {len(prior_holds)} prior hash-only holds. Exact source-message definitions, direct references, notification route/render context, "
        "locale catalog pins, and placeholder/markup/numeric/protected-literal diagnostics are included.\n\n"
        "Run `python3 verify-candidate-free.py --source-worktree /mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3980-3999-source` "
        "to verify the exact source tree, live refs, caller evidence, catalogs, hash-only continuity, and checksums.\n",
        encoding="utf-8",
    )

    files = sorted(path.name for path in OUT.iterdir() if path.is_file() and path.name not in {"manifest.json","SHA256SUMS.txt"})
    manifest = {
        "artifact":"SeerrNG PR #418 W3980-W3999 candidate-free input","schemaVersion":1,
        "repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3980-W3999",
        "packetType":"candidate-free-input","candidateFreeInputOnly":True,"proposalCount":0,"dispositionFieldsIncluded":False,
        "head":HEAD,"tree":TREE,"headRef":BRANCH,"baseRef":"main","baseSha":BASE,
        "range":[FIRST,LAST],"selectedSourceCount":20,"cellCount":240,"localeCount":12,"catalogCount":13,
        "localeOrder":locales,"sourceCatalogPath":TREE_PATH,"sourceCount":9494,
        "sourceOrderCount":len(source_order),"sourceOrderHashesFull":True,
        "sourceIdOrderSha256":sha("\n".join(row["sourceIdSha256"] for row in source_order).encode()),
        "sourceTextOrderSha256":sha("\n".join(row["sourceTextSha256"] for row in source_order).encode()),
        "sourceRecordOrderSha256":sha("\n".join(row["sourceIdSha256"]+":"+row["sourceTextSha256"] for row in source_order).encode()),
        "callerReferenceCount":sum(row["callerCount"] for row in caller_context_rows),"callerlessSourcePositions":[],
        "priorSelectedSourceIdCount":len(prior_selection),"priorAppliedTargetHashCount":len(prior_applied),
        "priorHoldCount":len(prior_holds),"priorCatalogApplicationCells":prior_catalog_summary["priorCatalogApplicationCells"],
        "priorSelectedSourceIdOrSourceTextHashMismatches":0,"priorAppliedTargetHashMismatches":0,"priorHoldHashMismatches":0,
        "baselineTokenMismatchCounts":{key:mismatch_counts[key] for key in ("markupTags","numericTokens","placeholders","protectedLiterals")},
        "sortedKeySetParityWithEnglish":True,"localeInsertionOrderDifferencesFromEnglish":insertion_differences,
        "previousCandidateFreeManifestSha256":previous_manifest_sha,
        "previousCandidateFreeChecksumManifestSha256":previous_checksum_manifest_sha,
        "previousCrossHoldSummarySha256":previous_cross_summary_sha,
        "liveDeploymentsAtExpectedShaBefore":before_api["deploymentsAtExpectedShaCount"],
        "liveDeploymentsAtExpectedShaAfter":after_api["deploymentsAtExpectedShaCount"],
        "liveMainBeforeSha":before_api["mainRefOid"],"liveMainAfterSha":after_api["mainRefOid"],
        "mainBaseDriftSha256":sha((OUT/"main-drift.json").read_bytes()),
        "previousCompletedEndPosition":FIRST-1,"derivedNextEligibleRange":[FIRST,LAST],
        "fileNames":files,
    }
    write_json("manifest.json", manifest)
    sums = []
    for path in sorted(file.name for file in OUT.iterdir() if file.is_file() and file.name != "SHA256SUMS.txt"):
        sums.append(f"{sha((OUT/path).read_bytes())}  {path}\n")
    (OUT/"SHA256SUMS.txt").write_text("".join(sums), encoding="utf-8")
    print(json.dumps({
        "result":"SEALED-CANDIDATE-FREE","window":"W3980-W3999","head":HEAD,"tree":TREE,
        "sourceCount":len(selected),"cellCount":len(current_cells),"localeCount":len(locales),
        "callerReferences":sum(row["callerCount"] for row in caller_context_rows),
        "priorSelected":len(prior_selection),"priorAppliedTargets":len(prior_applied),"priorHolds":len(prior_holds),
        "tokenMismatches":dict(mismatch_counts),"candidateTargetsIncluded":False,"packetFiles":len(sums),
    },ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
