#!/usr/bin/env python3
"""Portable verifier for an independent blind review against candidate-free input."""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

EXPECTED = {
    "window": "W3980-W3999",
    "head": "d9c5224dbce97e8ae6e72b0ad0bf401e65e215eb",
    "tree": "6578ebc4c8bd6c569fcea47978a2c47bd6e4bc8f",
    "baseSha": "fa40534ccced75bde1125c14760514fcd5d7de4d",
    "manifestSha256": "56d443524ad16c5e3c2e4a47f9521c8e5db733f2b4744f61401964460247d0e7",
    "checksumManifestSha256": "c31c51a18acf1e62cd5ec37c7c38824c756251f04a6686638c16bf097482f2d7",
}
LOCALES = ["es","zh-Hans","hi","de","ja","fr","pt-BR","ar","ko","zh-Hant","vi","id"]

def fail(message):
    raise SystemExit("FAIL: " + message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def shat(value):
    return sha(value.encode("utf-8"))

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def tokens(value):
    protected = re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])", value)
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate-free-input", required=True)
    ap.add_argument("--review", default=str(Path(__file__).resolve().parent / "review.json"))
    args = ap.parse_args()
    inp = Path(args.candidate_free_input).resolve()
    review = read_json(Path(args.review).resolve())
    manifest_path = inp / "manifest.json"
    sums_path = inp / "SHA256SUMS.txt"
    manifest = read_json(manifest_path)
    if (manifest.get("window"),manifest.get("head"),manifest.get("tree"),manifest.get("baseSha")) != (
        EXPECTED["window"],EXPECTED["head"],EXPECTED["tree"],EXPECTED["baseSha"]
    ):
        fail("candidate-free input head/tree/window/base")
    if sha(manifest_path.read_bytes()) != EXPECTED["manifestSha256"]:
        fail("candidate-free manifest checksum")
    if sha(sums_path.read_bytes()) != EXPECTED["checksumManifestSha256"]:
        fail("candidate-free checksum inventory checksum")
    sums = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ",1)
        if name in sums:
            fail("duplicate candidate-free checksum path")
        sums[name] = digest
    expected_names = set(manifest["fileNames"]) | {"manifest.json"}
    if set(sums) != expected_names:
        fail("candidate-free checksum inventory does not match manifest")
    for name,digest in sums.items():
        if sha((inp/name).read_bytes()) != digest:
            fail("candidate-free checksum " + name)
    if review.get("artifact") != "SeerrNG PR #418 W3980-W3999 independent blind semantic review":
        fail("review artifact identity")
    if (review.get("exactHead"),review.get("exactTree"),review.get("exactBaseSha")) != (
        EXPECTED["head"],EXPECTED["tree"],EXPECTED["baseSha"]
    ):
        fail("review head/tree/base binding")
    if review["inputBinding"]["manifestSha256"] != EXPECTED["manifestSha256"] or review["inputBinding"]["checksumManifestSha256"] != EXPECTED["checksumManifestSha256"]:
        fail("review input checksum binding")
    bound_hashes = dict(sums)
    bound_hashes["SHA256SUMS.txt"] = sha(sums_path.read_bytes())
    if review["inputBinding"]["fileSha256"] != bound_hashes:
        fail("review input file hash map")

    sources = read_jsonl(inp/"selected-source-cells.jsonl")
    cells = read_jsonl(inp/"current-target-cells.jsonl")
    source_by_pos = {row["position"]:row for row in sources}
    input_by_key = {(row["position"],row["locale"]):row for row in cells}
    if len(input_by_key) != 240:
        fail("input cell count")
    review_cells = review.get("cells",[])
    review_by_key = {(row["position"],row["locale"]):row for row in review_cells}
    expected_keys = {(position,locale) for position in range(3980,4000) for locale in LOCALES}
    if len(review_cells) != 240 or set(review_by_key) != expected_keys:
        fail("review cell set/count")
    counts = collections.Counter()
    for key,item in review_by_key.items():
        base = input_by_key[key]
        source = source_by_pos[key[0]]
        if item["sourceId"] != base["sourceId"] or item["sourceIdSha256"] != base["sourceIdSha256"] or item["sourceTextSha256"] != base["sourceTextSha256"]:
            fail("source binding " + repr(key))
        if item["sourceText"] != source["sourceText"] or item["currentTargetText"] != base["currentTarget"] or item["currentTargetSha256"] != base["currentTargetSha256"]:
            fail("current text/hash binding " + repr(key))
        if shat(item["currentTargetText"]) != item["currentTargetSha256"]:
            fail("current target hash " + repr(key))
        if item["tokenChecks"] != base["tokenChecks"]:
            fail("candidate-free token evidence binding " + repr(key))
        disposition = item.get("disposition")
        if disposition not in {"accept","correction","refinement","hold"}:
            fail("invalid disposition " + repr(key))
        counts[disposition] += 1
        has_target = "proposedTargetText" in item
        if has_target != (disposition in {"correction","refinement"}):
            fail("target text/disposition mismatch " + repr(key))
        if has_target:
            proposed = item["proposedTargetText"]
            if shat(proposed) != item.get("proposedTargetSha256"):
                fail("proposed target hash " + repr(key))
            source_tokens = tokens(source["sourceText"])
            proposed_tokens = tokens(proposed)
            if item.get("proposedTokenCheck") != {"sourceTokens":source_tokens,"proposedTokens":proposed_tokens}:
                fail("proposed token evidence " + repr(key))
            for name in ("placeholders","markupTags","numericTokens"):
                if source_tokens[name] != proposed_tokens[name]:
                    fail("proposed token mismatch " + name + " " + repr(key))
            if not set(source_tokens["protectedLiterals"]).issubset(set(proposed_tokens["protectedLiterals"])):
                fail("proposed protected literal loss " + repr(key))
        if not item.get("rationale") or item.get("confidence") not in {"high","moderate","low","unknown"}:
            fail("rationale/confidence " + repr(key))
    if review["counts"]["dispositions"] != dict(counts):
        fail("disposition count summary")
    if review["counts"]["cellsReviewed"] != 240 or review["counts"]["sourceCount"] != 20 or review["counts"]["localeCount"] != 12:
        fail("review count summary")
    print(json.dumps({
        "result":"PASS",
        "window":EXPECTED["window"],
        "head":EXPECTED["head"],
        "tree":EXPECTED["tree"],
        "cells":len(review_cells),
        "dispositions":dict(counts),
        "candidateFreeFilesChecked":len(sums)+1,
        "reviewedInputBound":True
    },ensure_ascii=False,indent=2))

if __name__ == "__main__":
    main()
