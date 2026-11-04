#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def sha_text(value):
    return sha(value.encode("utf-8"))

def jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]

def tokens(value):
    placeholders = re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value)
    markup = re.findall(r"<\/?[A-Za-z][^>]*>", value)
    numeric = re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value)
    pattern = r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise)(?![A-Za-z0-9])"
    protected = []
    for item in re.findall(pattern, value):
        if item not in protected:
            protected.append(item)
    return {"placeholders": placeholders, "markupTags": markup, "numericTokens": numeric, "protectedLiterals": protected}

def need(condition, message):
    if not condition:
        raise SystemExit("FAIL: " + message)

def checksum_map(path):
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split(None, 1)
        name = name.lstrip("* ")
        result[name] = digest
    return result

def main():
    parser = argparse.ArgumentParser(description="Verify a SeerrNG blind review packet against its sealed candidate-free inputs.")
    parser.add_argument("--input-dir", type=Path, required=True, help="candidate-free-input directory")
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    input_dir = args.input_dir.resolve()

    output_sums_path = here / "SHA256SUMS.txt"
    output_sums = checksum_map(output_sums_path)
    output_files = {p.name for p in here.iterdir() if p.is_file() and p.name != "SHA256SUMS.txt"}
    need(set(output_sums) == output_files, "output SHA256 inventory")
    for name, digest in output_sums.items():
        need(sha((here / name).read_bytes()) == digest, "output checksum " + name)

    input_sums_path = input_dir / "SHA256SUMS.txt"
    input_sums = checksum_map(input_sums_path)
    input_files = {p.name for p in input_dir.iterdir() if p.is_file() and p.name != "SHA256SUMS.txt"}
    need(set(input_sums) == input_files, "input SHA256 inventory")
    for name, digest in input_sums.items():
        need(sha((input_dir / name).read_bytes()) == digest, "input checksum " + name)

    packet = json.loads((here / "review_packet.json").read_text(encoding="utf-8"))
    source_rows = jsonl(input_dir / "selected-source-cells.jsonl")
    caller_rows = jsonl(input_dir / "caller-contexts.jsonl")
    block_rows = jsonl(input_dir / "caller-context-blocks.jsonl")
    input_cells = jsonl(input_dir / "current-target-cells.jsonl")
    input_holds = jsonl(input_dir / "prior-hold-hash-reattestation.jsonl")
    window = json.loads((input_dir / "window.json").read_text(encoding="utf-8"))
    input_manifest = json.loads((input_dir / "manifest.json").read_text(encoding="utf-8"))

    need(sha(input_sums_path.read_bytes()) == packet["inputSha256ManifestSha256"], "input checksum manifest binding")
    need(packet["head"] == window["head"] == input_manifest["head"], "head binding")
    need(packet["tree"] == window["tree"] == input_manifest["tree"], "tree binding")
    need(packet["range"] == window["range"] == [3880, 3899], "window range")
    need(packet["pullRequest"] == 418 and packet["repository"] == "snapetech-org/SeerrNG", "PR/repository identity")

    sources = {row["position"]: row for row in source_rows}
    callers = {row["position"]: row for row in caller_rows}
    blocks = {row["contextId"]: row for row in block_rows}
    baselines = {(row["position"], row["locale"]): row for row in input_cells}

    review_sources = jsonl(here / "review-sources.jsonl")
    need(len(review_sources) == 20, "review source count")
    need([row["position"] for row in review_sources] == list(range(3880, 3900)), "review source order")
    for row in review_sources:
        position = row["position"]
        source = sources[position]
        caller = callers[position]
        expected_blocks = [blocks[block_id] for block_id in caller["contextBlockIds"]]
        need(row["sourceId"] == source["sourceId"] and row["sourceIdSha256"] == source["sourceIdSha256"], "review source id " + str(position))
        need(row["sourceText"] == source["sourceText"] and row["sourceTextSha256"] == source["sourceTextSha256"], "review source text " + str(position))
        need(row["sourceTokens"] == source["sourceTokens"], "review source tokens " + str(position))
        need(row["callerContextSha256"] == caller["callerContextSha256"] and row["callerContext"] == caller, "review caller context " + str(position))
        need(row["contextBlocks"] == expected_blocks, "review context blocks " + str(position))

    decisions = jsonl(here / "review-cells.jsonl")
    locale_order = packet["localeOrder"]
    expected_keys = [(position, locale) for position in range(3880, 3900) for locale in locale_order]
    need(len(decisions) == 240, "decision count")
    need([(row["position"], row["locale"]) for row in decisions] == expected_keys, "decision order/coverage")
    counts = Counter()
    for row in decisions:
        key = (row["position"], row["locale"])
        source = sources[row["position"]]
        caller = callers[row["position"]]
        baseline = baselines[key]
        need(row["sourceId"] == source["sourceId"] and row["sourceIdSha256"] == source["sourceIdSha256"], "cell source id " + str(key))
        need(row["sourceText"] == source["sourceText"] and row["sourceTextSha256"] == source["sourceTextSha256"], "cell source text " + str(key))
        need(row["currentTarget"] == baseline["currentTarget"], "exact current target " + str(key))
        need(row["currentTargetSha256"] == baseline["currentTargetSha256"] == sha_text(row["currentTarget"]), "current target hash " + str(key))
        need(row["callerContextSha256"] == callers[row["position"]]["callerContextSha256"] == baseline["callerContextSha256"], "caller binding " + str(key))
        need(row["sourceTokens"] == baseline["sourceTokens"] and row["tokenChecks"] == baseline["tokenChecks"], "token diagnostics " + str(key))
        need(row["decision"] in {"keep", "propose", "hold"}, "decision enum " + str(key))
        need(bool(row["rationale"].strip()), "rationale " + str(key))
        need(row["confidence"] in {"high", "moderate", "low", "unknown"}, "confidence " + str(key))
        if row["decision"] == "propose":
            need(isinstance(row["proposal"], str) and bool(row["proposal"]), "proposal text " + str(key))
            need(row["proposal"] != row["currentTarget"], "proposal differs from current " + str(key))
            proposal_tokens = tokens(row["proposal"])
            source_tokens = row["sourceTokens"]
            for token_kind in ("placeholders", "markupTags", "numericTokens"):
                need(proposal_tokens[token_kind] == source_tokens[token_kind], "proposal token parity " + str(key) + " " + token_kind)
            missing_literals = [value for value in source_tokens["protectedLiterals"] if value not in proposal_tokens["protectedLiterals"]]
            need(not missing_literals, "proposal protected literals " + str(key))
        else:
            need(row["proposal"] is None, "non-proposal contains proposal " + str(key))
        counts[row["decision"]] += 1

    expected_counts = {"keep": 218, "propose": 18, "hold": 4}
    need(dict(counts) == expected_counts, "decision counts")
    need(packet["decisionCounts"] == expected_counts, "packet decision counts")
    need(len(input_holds) == 14, "input prior hold count")
    preserved = jsonl(here / "prior-holds-preserved.jsonl")
    need(preserved == input_holds, "prior hold reattestation continuity")
    need(all(row["priorHoldPreserved"] and row["targetTextIncluded"] is False for row in preserved), "prior hold preservation flags")
    need(packet["priorHoldCountPreserved"] == len(preserved), "prior hold count binding")

    print(json.dumps({
        "result": "PASS",
        "head": packet["head"],
        "tree": packet["tree"],
        "window": packet["range"],
        "sources": len(review_sources),
        "cells": len(decisions),
        "decisionCounts": dict(counts),
        "priorHoldsPreserved": len(preserved),
        "inputSha256ManifestSha256": packet["inputSha256ManifestSha256"],
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
