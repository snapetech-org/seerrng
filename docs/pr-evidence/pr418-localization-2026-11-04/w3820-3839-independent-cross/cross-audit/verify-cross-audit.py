#!/usr/bin/env python3
"""Offline verifier for the SeerrNG PR #418 W3820-W3839 cross-audit bundle."""
from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent
EVIDENCE = OUT / "evidence"
INPUT = EVIDENCE / "candidate-free-input"
PRIMARY = EVIDENCE / "primary-review"
BLIND = EVIDENCE / "blind-review"
PINNED = EVIDENCE / "pinned-tree"
HEAD = "6c489a64782d31fee70a6aeef386c88527b33083"
TREE = "9bbf55986a34e9a2bc0c4027205927df65f8754b"
BASE = "fa40534ccced75bde1125c14760514fcd5d7de4d"
WINDOW = "W3820-W3839"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]
RANGE = list(range(3820, 3840))
EXPECTED_CROSS_HOLDS = {(3828, "ar"), (3833, "id")}


def fail(message: str) -> None:
    raise SystemExit("FAIL: " + message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_text(value: str) -> str:
    return sha256(value.encode("utf-8"))


def git_object_hash(kind: str, data: bytes) -> str:
    header = kind.encode("ascii") + b" " + str(len(data)).encode("ascii") + b"\0"
    return hashlib.sha1(header + data).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def check_checksum_manifest(directory: Path, manifest_path: Path) -> dict[str, str]:
    listed: dict[str, str] = {}
    for number, line in enumerate(manifest_path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split(maxsplit=1)
        if len(fields) != 2 or len(fields[0]) != 64:
            fail(f"malformed checksum line {manifest_path}:{number}")
        digest, name = fields
        name = name.lstrip("* ")
        rel = Path(name)
        if rel.is_absolute() or ".." in rel.parts or name in listed:
            fail(f"unsafe or duplicate checksum path {name!r}")
        path = directory / rel
        if not path.is_file() or sha256(path.read_bytes()) != digest:
            fail(f"missing or mismatched checksum input {path}")
        listed[name] = digest
    actual = {
        p.relative_to(directory).as_posix()
        for p in directory.rglob("*")
        if p.is_file() and p != manifest_path
    }
    if set(listed) != actual:
        fail(f"checksum inventory mismatch under {directory}")
    return listed


def tokens(value: str) -> dict[str, list[str]]:
    placeholders = re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value)
    markup = re.findall(r"<\/?[A-Za-z][^>]*>", value)
    numbers = re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value)
    protected_pattern = r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])"
    protected: list[str] = []
    for item in re.findall(protected_pattern, value):
        if item not in protected:
            protected.append(item)
    return {
        "placeholders": placeholders,
        "markupTags": markup,
        "numericTokens": numbers,
        "protectedLiterals": protected,
    }


def token_match(kind: str, source: list[str], target: list[str]) -> bool:
    if kind == "protectedLiterals":
        return all(item in target for item in source)
    return source == target


def parse_git_tree(raw: bytes) -> dict[str, tuple[str, str]]:
    entries: dict[str, tuple[str, str]] = {}
    index = 0
    while index < len(raw):
        space = raw.index(b" ", index)
        nul = raw.index(b"\0", space)
        mode = raw[index:space].decode("ascii")
        name = raw[space + 1:nul].decode("utf-8")
        oid_start = nul + 1
        oid = raw[oid_start:oid_start + 20].hex()
        if len(raw[oid_start:oid_start + 20]) != 20 or name in entries:
            fail("malformed Git tree object")
        entries[name] = (mode, oid)
        index = oid_start + 20
    return entries


def verify_git_object_proof(runtime_pins: list[dict], catalog_pins: dict) -> None:
    provenance = load_json(EVIDENCE / "source-provenance.json")
    proof = load_json(EVIDENCE / "git-object-proof.json")
    if provenance["head"] != HEAD or provenance["tree"] != TREE:
        fail("source provenance head/tree mismatch")
    if provenance["baseSha"] != BASE or provenance["pullRequest"] != 418:
        fail("source provenance base/PR mismatch")
    if provenance["noRepositoryOrPullRequestChanges"] is not True:
        fail("source provenance reports repository/PR changes")
    if provenance["observedRemoteRefs"] != {
        "refs/heads/codex/seerrng-localization-overhaul-20261028": HEAD,
        "refs/pull/418/head": HEAD,
    }:
        fail("source provenance refs mismatch")

    commit = base64.b64decode(proof["commitObjectBase64"], validate=True)
    if git_object_hash("commit", commit) != HEAD:
        fail("included Git commit object does not hash to the pinned head")
    header, _, message = commit.partition(b"\n\n")
    header_lines = header.decode("utf-8").splitlines()
    if f"tree {TREE}" not in header_lines:
        fail("pinned commit does not reference the pinned tree")
    parent = next((line[7:] for line in header_lines if line.startswith("parent ")), "")
    subject = message.decode("utf-8").splitlines()[0] if message else ""
    if parent != provenance["fetchedCommitParent"] or subject != provenance["fetchedCommitSubject"]:
        fail("commit metadata does not match provenance record")

    tree_by_path: dict[str, dict[str, tuple[str, str]]] = {}
    tree_oid_by_path: dict[str, str] = {}
    for item in proof["treeObjects"]:
        raw = base64.b64decode(item["rawBase64"], validate=True)
        oid = git_object_hash("tree", raw)
        if oid != item["oid"]:
            fail(f"Git tree object hash mismatch at {item['path']!r}")
        tree_by_path[item["path"]] = parse_git_tree(raw)
        tree_oid_by_path[item["path"]] = oid
    if tree_oid_by_path.get("") != TREE:
        fail("root tree object is missing or does not match")
    pins_by_path = {item["path"]: item for item in runtime_pins}
    pins_by_path.update({item["path"]: item for item in catalog_pins.values()})
    if set(proof["pinnedPaths"]) != set(pins_by_path):
        fail("Git object proof file-path inventory mismatch")

    for path, pin in pins_by_path.items():
        parts = path.split("/")
        parent_path = ""
        current_tree = TREE
        for component in parts[:-1]:
            entries = tree_by_path.get(parent_path)
            if entries is None:
                fail(f"missing Git tree evidence for {parent_path!r}")
            entry = entries.get(component)
            if entry is None or entry[0] not in ("40000", "040000"):
                fail(f"pinned directory is not in the commit tree: {parent_path}/{component}")
            parent_path = component if not parent_path else parent_path + "/" + component
            current_tree = entry[1]
            if tree_oid_by_path.get(parent_path) != current_tree:
                fail(f"directory tree hash chain mismatch at {parent_path}")
        entries = tree_by_path.get(parent_path)
        if entries is None or parts[-1] not in entries:
            fail(f"pinned file is not present in the commit tree: {path}")
        mode, blob_oid = entries[parts[-1]]
        if mode not in ("100644", "100755"):
            fail(f"unexpected Git file mode for {path}: {mode}")
        data = (PINNED / path).read_bytes()
        if sha256(data) != pin["sha256"] or git_object_hash("blob", data) != pin["gitBlob"]:
            fail(f"pinned file checksum mismatch: {path}")
        if blob_oid != pin["gitBlob"]:
            fail(f"pinned file blob is not reachable from the exact tree: {path}")


def main() -> None:
    input_sums = check_checksum_manifest(INPUT, INPUT / "SHA256SUMS.txt")
    primary_sums = check_checksum_manifest(PRIMARY, PRIMARY / "SHA256SUMS.txt")
    blind_sums = check_checksum_manifest(BLIND, BLIND / "SHA256SUMS.txt")

    input_manifest = load_json(INPUT / "manifest.json")
    window = load_json(INPUT / "window.json")
    if (input_manifest["head"], input_manifest["tree"], input_manifest["window"]) != (HEAD, TREE, WINDOW):
        fail("candidate-free manifest pin mismatch")
    if input_manifest["cellCount"] != 240 or input_manifest["selectedSourceCount"] != 20:
        fail("candidate-free scope count mismatch")
    if window["baseSha"] != BASE or window["range"] != [3820, 3839]:
        fail("candidate-free base/range mismatch")
    candidate_run = subprocess.run(
        [sys.executable, str(INPUT / "verify-candidate-free.py")],
        capture_output=True, text=True, check=True,
    )
    candidate_result = json.loads(candidate_run.stdout)
    if candidate_result["result"] != "PASS" or candidate_result["cells"] != 240:
        fail("candidate-free verifier did not pass")

    for name in ("PR-attestation.json", "PR-attestation-after.json"):
        attestation = load_json(INPUT / name)
        pr = attestation["pullRequest"]
        if (attestation["branchRef"], attestation["pullRef"], attestation["tree"]) != (HEAD, HEAD, TREE):
            fail(f"{name} ref/tree mismatch")
        if pr["number"] != 418 or pr["state"] != "OPEN" or not pr["isDraft"]:
            fail(f"{name} PR state mismatch")
        if (pr["headRefOid"], pr["baseRefOid"]) != (HEAD, BASE):
            fail(f"{name} head/base mismatch")
    for name in ("remote-refs-before.tsv", "remote-refs-after.tsv"):
        refs = dict(line.split("\t", 1)[::-1] for line in (INPUT / name).read_text(encoding="utf-8").splitlines() if "\t" in line)
        if refs.get("refs/heads/codex/seerrng-localization-overhaul-20261028") != HEAD or refs.get("refs/pull/418/head") != HEAD:
            fail(f"{name} does not match the expected remote refs")

    runtime_pins = load_json(INPUT / "runtime-file-pins.json")["files"]
    catalog_packet = load_json(INPUT / "catalog-file-pins.json")
    catalog_pins = catalog_packet["catalogFiles"]
    if len(runtime_pins) != 4 or len(catalog_pins) != 13:
        fail("unexpected runtime/catalog pin count")
    verify_git_object_proof(runtime_pins, catalog_pins)

    # Reconcile catalog config tags, full key sets, key orders, and all English source hashes.
    pinned_catalogs: dict[str, dict[str, str]] = {}
    for locale, pin in catalog_pins.items():
        value = load_json(PINNED / pin["path"])
        if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
            fail(f"invalid locale catalog: {locale}")
        keys = list(value)
        key_sequence_hash = sha256(("".join(key + "\n" for key in keys)).encode("utf-8"))
        sorted_key_hash = sha256(("".join(key + "\n" for key in sorted(keys))).encode("utf-8"))
        if len(keys) != pin["keyCount"] or key_sequence_hash != pin["keySequenceSha256"]:
            fail(f"catalog key order mismatch: {locale}")
        if sorted_key_hash != pin["sortedKeySetSha256"]:
            fail(f"catalog key-set mismatch: {locale}")
        if sha256((PINNED / pin["path"]).read_bytes()) != pin["sha256"]:
            fail(f"catalog SHA mismatch: {locale}")
        pinned_catalogs[locale] = value

    english = pinned_catalogs["en"]
    english_keys = list(english)
    if len(english_keys) != 9494 or english_keys != sorted(english_keys):
        fail("English catalog source order mismatch")
    expected_keyset = set(english_keys)
    insertion_diffs = []
    for locale in ["en"] + LOCALES:
        catalog = pinned_catalogs[locale]
        if set(catalog) != expected_keyset:
            fail(f"catalog key set differs from English: {locale}")
        if list(catalog) != english_keys:
            insertion_diffs.append(locale)
    if insertion_diffs != input_manifest["localeInsertionOrderDifferencesFromEnglish"]:
        fail("catalog insertion-order difference list mismatch")
    config = load_json(PINNED / "config/i18n/locales.json")
    config_by_tag = {item["tag"]: item for item in config["locales"]}
    locale_map = catalog_packet["localeFileMapping"]
    for locale in LOCALES:
        mapping = locale_map[locale]
        config_entry = config_by_tag.get(mapping["configTag"])
        if config_entry is None:
            fail(f"missing runtime locale tag for {locale}")
        expected_file = mapping["catalogFileStem"] + ".json"
        if config_entry["clientFile"] != expected_file or mapping["catalogPath"] != "src/i18n/locale/" + expected_file:
            fail(f"locale file mapping mismatch: {locale}")

    source_order = load_jsonl(INPUT / "source-order-hashes.jsonl")
    if len(source_order) != len(english_keys):
        fail("source-order hash count mismatch")
    for position, (source_id, source_text) in enumerate(english.items()):
        record = source_order[position]
        if record["position"] != position or record["sourceIdSha256"] != sha_text(source_id) or record["sourceTextSha256"] != sha_text(source_text):
            fail(f"English source order/hash mismatch at position {position}")
    sources = load_jsonl(INPUT / "selected-source-cells.jsonl")
    if [row["position"] for row in sources] != RANGE:
        fail("selected source positions mismatch")
    source_by_pos = {row["position"]: row for row in sources}
    for row in sources:
        position = row["position"]
        source_id = english_keys[position]
        source_text = english[source_id]
        if (row["sourceId"], row["sourceText"], row["sourceIdSha256"], row["sourceTextSha256"]) != (
            source_id, source_text, sha_text(source_id), sha_text(source_text)
        ):
            fail(f"selected source does not match the pinned English catalog at {position}")
    for boundary in load_jsonl(INPUT / "source-window-boundaries-hash-only.jsonl"):
        position = boundary["position"]
        source_id = english_keys[position]
        source_text = english[source_id]
        if (boundary["sourceIdSha256"], boundary["sourceTextSha256"]) != (sha_text(source_id), sha_text(source_text)):
            fail(f"source boundary hash mismatch at position {position}")

    # Verify every recorded caller definition/reference line against its exact pinned runtime file.
    contexts = load_jsonl(INPUT / "caller-contexts.jsonl")
    context_by_pos = {row["position"]: row for row in contexts}
    blocks = load_jsonl(INPUT / "caller-context-blocks.jsonl")
    block_by_id = {row["contextId"]: row for row in blocks}
    if len(contexts) != 20 or len(context_by_pos) != 20:
        fail("caller context count mismatch")
    runtime_by_path = {row["path"]: row for row in runtime_pins}
    runtime_lines = {
        path: (PINNED / path).read_text(encoding="utf-8").splitlines()
        for path in runtime_by_path
    }
    for context in contexts:
        definition = next(
            block_by_id[item]
            for item in context["contextBlockIds"]
            if block_by_id[item]["contextType"] == "message-definition"
        )
        material = {
            "sourceId": context["sourceId"],
            "namespace": context["namespace"],
            "definition": definition,
            "directMessageReferences": context["directMessageReferences"],
            "dynamicRendererReferences": context["dynamicRendererReferences"],
        }
        canonical = json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if context["callerContextSha256"] != sha_text(canonical):
            fail(f"caller context hash mismatch at {context['position']}")
        for block_id in context["contextBlockIds"]:
            block = block_by_id[block_id]
            path = block["path"]
            for line in block["lines"]:
                if runtime_lines[path][line["line"] - 1] != line["text"] or line["lineSha256"] != sha_text(line["text"]):
                    fail(f"caller block line mismatch at {context['position']}:{path}:{line['line']}")
        for ref in context["directMessageReferences"] + context["dynamicRendererReferences"]:
            path = ref["path"]
            if runtime_lines[path][ref["line"] - 1] != ref["text"] or ref["lineSha256"] != sha_text(ref["text"]):
                fail(f"caller reference line mismatch at {context['position']}:{path}:{ref['line']}")
        for ref in context["dynamicRendererReferences"]:
            pin = runtime_by_path[ref["path"]]
            if (ref["fileSha256"], ref["gitBlob"]) != (pin["sha256"], pin["gitBlob"]):
                fail(f"dynamic renderer file pin mismatch at {context['position']}")

    # Reconcile all 240 current target cells to exact locale catalog entries and token checks.
    cells = load_jsonl(INPUT / "current-target-cells.jsonl")
    expected_order = [(position, locale) for position in RANGE for locale in LOCALES]
    if [(row["position"], row["locale"]) for row in cells] != expected_order:
        fail("current target cell ordering/coverage mismatch")
    cell_by_key = {(row["position"], row["locale"]): row for row in cells}
    for row in cells:
        position, locale = row["position"], row["locale"]
        source = source_by_pos[position]
        context = context_by_pos[position]
        catalog_pin = catalog_pins[locale]
        if row["sourceId"] != source["sourceId"] or row["sourceIdSha256"] != source["sourceIdSha256"]:
            fail(f"target/source ID mismatch at {position}/{locale}")
        if row["sourceTextSha256"] != source["sourceTextSha256"] or sha_text(source["sourceText"]) != source["sourceTextSha256"]:
            fail(f"target/source text mismatch at {position}/{locale}")
        if row["currentTarget"] != pinned_catalogs[locale][source["sourceId"]]:
            fail(f"target does not equal pinned catalog at {position}/{locale}")
        if row["currentTargetSha256"] != sha_text(row["currentTarget"]):
            fail(f"target hash mismatch at {position}/{locale}")
        if (row["catalogPath"], row["catalogSha256"], row["catalogGitBlob"]) != (
            catalog_pin["path"], catalog_pin["sha256"], catalog_pin["gitBlob"]
        ):
            fail(f"target catalog pin mismatch at {position}/{locale}")
        if row["callerContextSha256"] != context["callerContextSha256"]:
            fail(f"target caller context mismatch at {position}/{locale}")
        source_tokens = tokens(source["sourceText"])
        target_tokens = tokens(row["currentTarget"])
        checks = row["tokenChecks"]
        for kind in ("placeholders", "markupTags", "numericTokens"):
            if checks[kind] != {
                "matches": source_tokens[kind] == target_tokens[kind],
                "source": source_tokens[kind],
                "target": target_tokens[kind],
            }:
                fail(f"{kind} token check mismatch at {position}/{locale}")
        missing = [item for item in source_tokens["protectedLiterals"] if item not in target_tokens["protectedLiterals"]]
        if checks["protectedLiterals"] != {
            "matches": not missing,
            "missingFromTarget": missing,
            "source": source_tokens["protectedLiterals"],
            "target": target_tokens["protectedLiterals"],
        }:
            fail(f"protected literal check mismatch at {position}/{locale}")

    # Confirm both source review ledgers bind to the same 240 cells.
    primary_manifest = load_json(PRIMARY / "manifest.json")
    primary_summary = load_json(PRIMARY / "summary.json")
    expected_primary_files = set(primary_manifest["fileNames"]) | {"manifest.json"}
    if set(primary_sums) != expected_primary_files:
        fail("primary manifest file inventory mismatch")
    if primary_summary["inputManifestSha256"] != sha256((INPUT / "manifest.json").read_bytes()):
        fail("primary summary input-manifest hash mismatch")
    if primary_summary["inputChecksumListSha256"] != sha256((INPUT / "SHA256SUMS.txt").read_bytes()):
        fail("primary summary input checksum-list hash mismatch")
    if primary_manifest["head"] != HEAD or primary_manifest["tree"] != TREE:
        fail("primary manifest pin mismatch")
    primary_rows = load_jsonl(PRIMARY / "primary-ledger.jsonl")
    if len(primary_rows) != 240:
        fail("primary ledger row count mismatch")
    primary_by_key = {(row["position"], row["locale"]): row for row in primary_rows}
    if len(primary_by_key) != 240:
        fail("primary ledger has duplicate cells")
    primary_counts = Counter()
    for key in expected_order:
        row = primary_by_key[key]
        cell = cell_by_key[key]
        source = source_by_pos[key[0]]
        context = context_by_pos[key[0]]
        caller_definition = next(
            block_by_id[item]
            for item in context["contextBlockIds"]
            if block_by_id[item]["contextType"] == "message-definition"
        )
        expected_caller = {
            "sha256": context["callerContextSha256"],
            "namespace": context["namespace"],
            "namespaceFiles": context["namespaceFiles"],
            "definitionBlock": caller_definition,
            "directMessageReferences": context["directMessageReferences"],
            "dynamicRendererReferences": context["dynamicRendererReferences"],
        }
        if row["window"] != WINDOW or row["sourceId"] != source["sourceId"] or row["sourceText"] != source["sourceText"]:
            fail(f"primary source binding mismatch at {key}")
        if row["sourceTextSha256"] != source["sourceTextSha256"] or row["callerContextSha256"] != context["callerContextSha256"]:
            fail(f"primary source/caller hash mismatch at {key}")
        if row["callerContextEvidence"] != expected_caller:
            fail(f"primary caller evidence mismatch at {key}")
        if row["currentTarget"] != cell["currentTarget"] or row["currentTargetSha256"] != cell["currentTargetSha256"]:
            fail(f"primary current target mismatch at {key}")
        if row["currentTargetSha256"] != sha_text(row["currentTarget"]):
            fail(f"primary current target hash mismatch at {key}")
        source_tokens = tokens(source["sourceText"])
        current_tokens = tokens(row["currentTarget"])
        reviewed_tokens = tokens(row["reviewedTarget"])
        expected_token_integrity = {}
        for kind in ("placeholders", "markupTags", "numericTokens", "protectedLiterals"):
            current_matches = token_match(kind, source_tokens[kind], current_tokens[kind])
            reviewed_matches = token_match(kind, source_tokens[kind], reviewed_tokens[kind])
            expected_token_integrity[kind] = {
                "source": source_tokens[kind],
                "current": current_tokens[kind],
                "reviewed": reviewed_tokens[kind],
                "currentMatchesSource": current_matches,
                "reviewedMatchesSource": reviewed_matches,
            }
            if not reviewed_matches:
                fail(f"primary reviewed token mismatch at {key}:{kind}")
        if row["tokenIntegrity"] != expected_token_integrity:
            fail(f"primary token integrity mismatch at {key}")
        if row["disposition"] not in ("accept-current", "correction", "refinement", "hold"):
            fail(f"invalid primary disposition at {key}")
        if row["reviewedTarget"] != (row["proposedTarget"] if row["disposition"] in ("correction", "refinement") else row["currentTarget"]):
            fail(f"primary reviewed target binding mismatch at {key}")
        if row["reviewedTargetSha256"] != sha_text(row["reviewedTarget"]):
            fail(f"primary reviewed target hash mismatch at {key}")
        if row["disposition"] in ("correction", "refinement"):
            if not row["proposedTarget"] or row["proposedTarget"] == row["currentTarget"]:
                fail(f"primary proposal missing/unchanged at {key}")
            if row["proposedTargetSha256"] != sha_text(row["proposedTarget"]):
                fail(f"primary proposal hash mismatch at {key}")
        elif row["proposedTarget"] is not None or row["proposedTargetSha256"] is not None:
            fail(f"unexpected primary proposal at {key}")
        primary_counts[row["disposition"]] += 1
    if primary_counts != Counter({"accept-current": 220, "refinement": 13, "correction": 7}):
        fail("primary disposition counts mismatch")
    if primary_summary["dispositionCounts"] != {"accept-current": 220, "correction": 7, "refinement": 13, "hold": 0}:
        fail("primary summary counts mismatch")

    # Run the portable blind verifier and also bind its cells to the canonical packet.
    blind_run = subprocess.run(
        [sys.executable, str(BLIND / "verify-blind-review.py")],
        capture_output=True, text=True, check=True,
    )
    blind_result = json.loads(blind_run.stdout)
    if blind_result["result"] != "PASS" or blind_result["cells"] != 240:
        fail("blind review verifier did not pass")
    blind_input_sums = check_checksum_manifest(BLIND / "input", BLIND / "input" / "SHA256SUMS.txt")
    if input_sums != blind_input_sums:
        fail("blind review copied a different candidate-free packet")
    blind_rows = load_jsonl(BLIND / "blind-ledger.jsonl")
    blind_by_key = {(row["position"], row["locale"]): row for row in blind_rows}
    if len(blind_by_key) != 240:
        fail("blind ledger has duplicate/missing cells")
    blind_holds = set()
    for key in expected_order:
        row = blind_by_key[key]
        cell = cell_by_key[key]
        source = source_by_pos[key[0]]
        if (row["head"], row["tree"], row["window"]) != (HEAD, TREE, WINDOW):
            fail(f"blind pin mismatch at {key}")
        for field, value in {
            "sourceId": source["sourceId"],
            "sourceIdSha256": source["sourceIdSha256"],
            "sourceText": source["sourceText"],
            "sourceTextSha256": source["sourceTextSha256"],
            "currentTarget": cell["currentTarget"],
            "currentTargetSha256": cell["currentTargetSha256"],
            "callerContextSha256": cell["callerContextSha256"],
            "catalogPath": cell["catalogPath"],
            "catalogGitBlob": cell["catalogGitBlob"],
            "catalogSha256": cell["catalogSha256"],
            "tokenChecks": cell["tokenChecks"],
        }.items():
            if row.get(field) != value:
                fail(f"blind {field} binding mismatch at {key}")
        if row["decision"] not in ("accept", "hold") or not row.get("reviewNote"):
            fail(f"invalid blind decision/note at {key}")
        if row["decision"] == "hold":
            blind_holds.add(key)
    if blind_holds != {
        (3824,"hi"), (3828,"ar"), (3829,"ja"), (3829,"ko"),
        (3830,"vi"), (3833,"ar"), (3836,"hi"), (3838,"vi"),
    }:
        fail("blind hold set mismatch")

    # Verify the complete cross-ledger row-by-row adjudication and its two retained holds.
    ledger = load_jsonl(OUT / "cross-audit-ledger.jsonl")
    if len(ledger) != 240:
        fail("cross-audit ledger row count mismatch")
    if [(row["position"], row["locale"]) for row in ledger] != expected_order:
        fail("cross-audit ledger ordering/coverage mismatch")
    ledger_counts = Counter()
    for output_row in ledger:
        key = (output_row["position"], output_row["locale"])
        primary = primary_by_key[key]
        blind = blind_by_key[key]
        cell = cell_by_key[key]
        source = source_by_pos[key[0]]
        expected_disposition = (
            "hold-for-focused-review" if key in EXPECTED_CROSS_HOLDS
            else "accept-primary-proposal" if primary["disposition"] in ("correction", "refinement")
            else "accept-current"
        )
        cross = output_row["crossAudit"]
        if (output_row["head"], output_row["tree"], output_row["window"]) != (HEAD, TREE, WINDOW):
            fail(f"cross-audit pin mismatch at {key}")
        if (output_row["sourceId"], output_row["sourceText"], output_row["sourceTextSha256"]) != (
            source["sourceId"], source["sourceText"], source["sourceTextSha256"]
        ):
            fail(f"cross-audit source mismatch at {key}")
        if (output_row["currentTarget"], output_row["currentTargetSha256"]) != (
            cell["currentTarget"], cell["currentTargetSha256"]
        ):
            fail(f"cross-audit current target mismatch at {key}")
        if output_row["tokenChecks"] != cell["tokenChecks"]:
            fail(f"cross-audit token check mismatch at {key}")
        expected_primary_view = {
            "disposition": primary["disposition"],
            "confidence": primary["confidence"],
            "proposedTarget": primary["proposedTarget"],
            "proposedTargetSha256": primary["proposedTargetSha256"],
            "reviewedTarget": primary["reviewedTarget"],
            "reviewedTargetSha256": primary["reviewedTargetSha256"],
            "rationale": primary["rationale"],
        }
        if output_row["primaryReview"] != expected_primary_view:
            fail(f"cross-audit primary reconciliation mismatch at {key}")
        expected_blind_view = {
            "decision": blind["decision"],
            "confidence": blind["confidence"],
            "issueCodes": blind["issueCodes"],
            "reviewNote": blind["reviewNote"],
            "nonblockingObservation": blind.get("nonblockingObservation"),
        }
        if output_row["blindReview"] != expected_blind_view:
            fail(f"cross-audit blind reconciliation mismatch at {key}")
        if cross["disposition"] != expected_disposition or not cross.get("rationale"):
            fail(f"cross-audit disposition/rationale mismatch at {key}")
        if cross["confidence"] not in ("high", "moderate", "low", "unknown"):
            fail(f"invalid cross-audit confidence at {key}")
        expected_target = None
        if expected_disposition == "accept-primary-proposal":
            expected_target = primary["proposedTarget"]
        elif expected_disposition == "accept-current":
            expected_target = cell["currentTarget"]
        if cross["recommendedTarget"] != expected_target:
            fail(f"cross-audit recommended target mismatch at {key}")
        expected_hash = sha_text(expected_target) if expected_target is not None else None
        if cross["recommendedTargetSha256"] != expected_hash:
            fail(f"cross-audit recommended target hash mismatch at {key}")
        if output_row["localeCatalog"]["path"] != cell["catalogPath"] or output_row["localeCatalog"]["sha256"] != cell["catalogSha256"]:
            fail(f"cross-audit locale catalog mapping mismatch at {key}")
        expected_catalog_view = {
            "path": catalog_pins["en"]["path"],
            "sha256": catalog_pins["en"]["sha256"],
            "gitBlob": catalog_pins["en"]["gitBlob"],
            "position0": key[0],
        }
        if output_row["sourceCatalog"] != expected_catalog_view:
            fail(f"cross-audit source catalog proof mismatch at {key}")
        locale_mapping = load_json(INPUT / "catalog-file-pins.json")["localeFileMapping"][key[1]]
        expected_locale_view = {
            "path": cell["catalogPath"], "sha256": cell["catalogSha256"],
            "gitBlob": cell["catalogGitBlob"], "locale": key[1],
            "configTag": locale_mapping["configTag"],
            "fileStem": locale_mapping["catalogFileStem"],
        }
        if output_row["localeCatalog"] != expected_locale_view:
            fail(f"cross-audit locale catalog proof mismatch at {key}")
        context = context_by_pos[key[0]]
        caller_paths = set(context["namespaceFiles"])
        caller_paths.update(ref["path"] for ref in context["directMessageReferences"])
        caller_paths.update(ref["path"] for ref in context["dynamicRendererReferences"])
        definition = next(
            block_by_id[item]
            for item in context["contextBlockIds"]
            if block_by_id[item]["contextType"] == "message-definition"
        )
        expected_caller_view = {
            "contextSha256": context["callerContextSha256"],
            "sourcePosition": key[0],
            "namespace": context["namespace"],
            "definition": {
                "path": definition["path"], "startLine": definition["startLine"],
                "endLine": definition["endLine"], "contextId": definition["contextId"],
            },
            "directMessageReferences": [
                {"path": ref["path"], "line": ref["line"], "lineSha256": ref["lineSha256"]}
                for ref in context["directMessageReferences"]
            ],
            "dynamicRendererReferences": [
                {"path": ref["path"], "line": ref["line"], "lineSha256": ref["lineSha256"]}
                for ref in context["dynamicRendererReferences"]
            ],
            "runtimeFilePins": [
                {"path": path, "sha256": runtime_by_path[path]["sha256"], "gitBlob": runtime_by_path[path]["gitBlob"]}
                for path in sorted(caller_paths)
            ],
            "callerResolution": context["callerResolution"],
            "callerCount": context["callerCount"],
            "callerOccurrenceCount": context["callerOccurrenceCount"],
        }
        if output_row["callerEvidence"] != expected_caller_view:
            fail(f"cross-audit caller evidence mismatch at {key}")
        ledger_counts[expected_disposition] += 1
    if ledger_counts != Counter({
        "accept-current": 219,
        "accept-primary-proposal": 19,
        "hold-for-focused-review": 2,
    }):
        fail(f"cross-audit disposition counts mismatch: {ledger_counts}")

    summary = load_json(OUT / "summary.json")
    if summary["head"] != HEAD or summary["tree"] != TREE or summary["cellCount"] != 240:
        fail("cross-audit summary pin/scope mismatch")
    if summary["crossDispositionCounts"] != dict(sorted(ledger_counts.items())):
        fail("cross-audit summary disposition counts mismatch")
    if summary["blindDecisionCounts"] != {"accept": 232, "hold": 8}:
        fail("cross-audit blind counts mismatch")
    if summary["blindHoldCount"] != 8 or summary["blindHoldsRetained"] != 1:
        fail("cross-audit blind-hold reconciliation summary mismatch")
    if summary["additionalCrossAuditHolds"] != [{
        "position":3833,"locale":"id","sourceId":"components.Settings.MylarModal.enableSearchHelp"
    }]:
        fail("additional cross-audit hold summary mismatch")

    # This final manifest covers every deliverable and evidence file, except itself.
    output_sums = check_checksum_manifest(OUT, OUT / "SHA256SUMS.txt")
    print(json.dumps({
        "result":"PASS",
        "head":HEAD,"tree":TREE,"cells":len(ledger),
        "crossDispositions":dict(sorted(ledger_counts.items())),
        "primaryDispositions":dict(sorted(primary_counts.items())),
        "blindDecisions":{"accept":len(blind_by_key)-len(blind_holds),"hold":len(blind_holds)},
        "sourceOrderRowsReconciled":len(source_order),
        "catalogFilesVerified":len(catalog_pins),"runtimeFilesVerified":len(runtime_pins),
        "callerContextsAndLinesVerified":len(contexts),
        "candidateFreeVerifier":"PASS","blindVerifier":"PASS",
        "checksumFilesCovered":len(output_sums),
    },ensure_ascii=False,indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, KeyError, IndexError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        fail(f"{type(exc).__name__}: {exc}")
