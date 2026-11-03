#!/usr/bin/env python3
import hashlib
import json
import subprocess
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(__file__).resolve().parent
INPUT = EVIDENCE / "clean-input"
PRIMARY = EVIDENCE / "primary" / "primary-ledger.jsonl"
RATIFIED = EVIDENCE / "ratified" / "cross-review.jsonl"
WINDOW = json.loads((INPUT / "window.json").read_text(encoding="utf-8"))
EXPECTED_HEAD = WINDOW["head"]
EXPECTED_TREE = WINDOW["tree"]
LOCALES = WINDOW["localeOrder"]
PINS = WINDOW["localeCatalogPins"]
SOURCE = json.loads((ROOT / "src/i18n/locale/en.json").read_text(encoding="utf-8"))

def sha(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def file_sha(path):
    return sha(path.read_bytes())

head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip()
assert head == EXPECTED_HEAD, (head, EXPECTED_HEAD)
assert tree == EXPECTED_TREE, (tree, EXPECTED_TREE)
assert len(SOURCE) == WINDOW["sourceCatalogKeyCount"] == 9494
assert file_sha(ROOT / "src/i18n/locale/en.json") == WINDOW["sourceCatalogSha256"]

primary = {(x["position"], x["locale"]): x for x in map(json.loads, PRIMARY.open(encoding="utf-8"))}
rows = list(map(json.loads, RATIFIED.open(encoding="utf-8")))
assert len(rows) == 240 and len(primary) == 240
assert len({(x["position"], x["locale"]) for x in rows}) == 240
ids_by_position = {x["position"]: x["id"] for x in rows if x["locale"] == LOCALES[0]}
assert [ids_by_position[pos] for pos in range(3280, 3300)] == [x["id"] for x in WINDOW["sourceIds"]]

# Recheck all 13 exact-head file pins before writing.
for rel, pin in PINS.items():
    path = ROOT / rel
    assert file_sha(path) == pin["sha256"], (rel, "file hash changed")
    catalog = json.loads(path.read_text(encoding="utf-8"))
    assert len(catalog) == pin["keyCount"] == 9494, (rel, "key count")
    assert sha("\n".join(catalog)) == pin["orderedKeySha256"], (rel, "ordered key hash")
    assert set(catalog) == set(SOURCE), (rel, "key set differs from English")
    if rel.endswith("/en.json"):
        assert catalog == SOURCE

expected_files = {}
for x in primary.values():
    rel = x["catalogPath"]
    expected_files.setdefault(rel, x["catalogFileSha256"])
    assert expected_files[rel] == x["catalogFileSha256"]
assert len(expected_files) == 12

changed = []
parity_errors = []
literal_errors = []
final_hashes = []
final_by_file = defaultdict(dict)
for x in rows:
    p = primary[(x["position"], x["locale"])]
    assert x["id"] == p["id"] and x["sourceSha256"] == p["sourceSha256"]
    rel = p["catalogPath"]
    assert rel in expected_files
    catalog = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    key = x["id"]
    assert key in SOURCE and key in catalog
    source = SOURCE[key]
    assert sha(source) == x["sourceSha256"], (key, "source hash")
    current = catalog[key]
    assert current == x["currentTarget"] == p["currentTarget"], (key, x["locale"], "current target changed")
    assert sha(current) == x["currentTargetSha256"], (key, x["locale"], "current target hash")
    final = x["finalTarget"]
    assert isinstance(final, str) and final.strip()
    assert p["proposedPlaceholderParity"], (key, x["locale"], "primary placeholder parity")
    assert p["sourcePlaceholders"] == p["proposedPlaceholders"] == [], (key, x["locale"], "placeholder set")
    for literal in x["protectedLiterals"]:
        if literal not in final:
            literal_errors.append([key, x["locale"], literal])
    if final != current:
        final_by_file[rel][key] = final
        changed.append((x["position"], key, x["locale"], current, final))
    final_hashes.append({
        "position": x["position"], "id": key, "locale": x["locale"],
        "sourceSha256": x["sourceSha256"],
        "currentTargetSha256": sha(current),
        "finalTargetSha256": sha(final),
        "canonicalTranslationSha256": sha(json.dumps([key, x["locale"], source, final], ensure_ascii=False, separators=(",", ":"))),
        "disposition": x["finalDisposition"],
    })

assert not parity_errors, parity_errors
assert not literal_errors, literal_errors
assert len(changed) == 67, len(changed)
assert {loc for _, _, loc, _, _ in changed} <= set(LOCALES)

# Persist only the twelve pinned locale catalogs; dictionary insertion order is preserved.
for rel, updates in final_by_file.items():
    path = ROOT / rel
    catalog = json.loads(path.read_text(encoding="utf-8"))
    for key, final in updates.items():
        catalog[key] = final
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Static readback of all 240 reviewed cells and all catalog structure.
readback_errors = []
post_catalogs = {}
for rel, pin in PINS.items():
    path = ROOT / rel
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if len(catalog) != 9494 or sha("\n".join(catalog)) != pin["orderedKeySha256"] or set(catalog) != set(SOURCE):
        readback_errors.append([rel, "catalog structure"])
    post_catalogs[rel] = {"sha256": file_sha(path), "keyCount": len(catalog), "orderedKeySha256": sha("\n".join(catalog))}
for x in rows:
    rel = f"src/i18n/locale/{x['locale']}.json"
    catalog = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    if catalog.get(x["id"]) != x["finalTarget"]:
        readback_errors.append([x["position"], x["id"], x["locale"], "target mismatch"])
assert not readback_errors, readback_errors
assert len(final_hashes) == 240
assert Counter(x["locale"] for x in final_hashes) == Counter({loc: 20 for loc in LOCALES})
assert all(post_catalogs[rel]["orderedKeySha256"] == pin["orderedKeySha256"] for rel, pin in PINS.items())

result = {
    "repository": "snapetech-org/seerrng",
    "pullRequest": 418,
    "window": "W3280-W3299",
    "baseHead": EXPECTED_HEAD,
    "baseTree": EXPECTED_TREE,
    "cellsReadBack": len(final_hashes),
    "changedCells": len(changed),
    "changedByLocale": dict(sorted(Counter(loc for _, _, loc, _, _ in changed).items())),
    "catalogCountIncludingEnglish": len(PINS),
    "directLocaleCatalogsChanged": len(final_by_file),
    "keyCountPerCatalog": 9494,
    "catalogStructureAndOrderedKeyErrors": 0,
    "sourceCurrentFinalHashErrors": 0,
    "placeholderParityErrors": len(parity_errors),
    "protectedLiteralErrors": len(literal_errors),
    "readbackErrors": len(readback_errors),
    "catalogs": post_catalogs,
    "cells": final_hashes,
    "testBuildScanOrCIRun": False,
    "nativeSpeakerApproval": False,
    "headedBrowserAcceptance": False,
}
(EVIDENCE / "readback.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: v for k, v in result.items() if k not in ("catalogs", "cells")}, ensure_ascii=False, indent=2))
