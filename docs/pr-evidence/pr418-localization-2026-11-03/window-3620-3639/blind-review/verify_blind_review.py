#!/usr/bin/env python3
import argparse
import collections
import hashlib
import json
import pathlib
import re
import subprocess

DEFAULT_INPUT = pathlib.Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3620-3639-candidatefree-20261103/blind-input")
OUT = pathlib.Path(__file__).resolve().parent
HEAD = "ebf1cb6082ef173688227c507acfdc04c3cf7ca7"
TREE = "e3c4d1d10f40ea078b66dfdf942e99c8189fee0c"
LOCALES = ["es", "zh_Hans", "hi", "de", "ja", "fr", "pt_BR", "ar", "ko", "zh_Hant", "vi", "id"]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def sha_file(path):
    return sha(path.read_bytes())

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def run(args, cwd):
    return subprocess.run(args, cwd=cwd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout.strip()

def matching_brace(text, start):
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unbalanced braces")

def parse_message_tokens(text):
    simple = collections.Counter()
    plurals = {}
    i = 0
    while i < len(text):
        if text[i] != "{":
            i += 1
            continue
        end = matching_brace(text, i)
        inner = text[i + 1:end]
        m = re.match(r"\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*plural\s*,", inner)
        if m:
            name = m.group(1)
            body = inner[m.end():]
            pos = 0
            options = {}
            while pos < len(body):
                ws = re.match(r"\s*", body[pos:])
                pos += ws.end()
                if pos >= len(body):
                    break
                cm = re.match(r"([A-Za-z]+)\s*\{", body[pos:])
                if not cm:
                    raise ValueError(f"cannot parse plural option near {body[pos:]!r}")
                category = cm.group(1)
                open_at = pos + cm.end() - 1
                option_end = matching_brace(body, open_at)
                content = body[open_at + 1:option_end]
                if category in options:
                    raise ValueError(f"duplicate plural category {category}")
                options[category] = {"hashCount": content.count("#")}
                pos = option_end + 1
            plurals[name] = options
        elif re.fullmatch(r"\s*[A-Za-z][A-Za-z0-9_]*\s*", inner):
            simple[inner.strip()] += 1
        i = end + 1
    return {"simple": dict(sorted(simple.items())), "plurals": dict(sorted(plurals.items()))}

def token_checks(prompt, translation):
    if translation is None:
        return {
            "placeholders": {"status": "not-applicable-held", "source": prompt["sourcePlaceholders"], "pass": True},
            "icu": {"status": "not-applicable-held", "source": prompt["sourceIcuPluralCategories"], "pass": True},
            "markup": {"status": "not-applicable-held", "source": prompt["sourceMarkupTokens"], "pass": True},
            "numeric": {"status": "not-applicable-held", "source": prompt["sourceNumericTokens"], "pass": True},
            "protectedLiterals": {"status": "not-applicable-held", "source": prompt["sourceProtectedLiterals"], "pass": True},
            "allPass": True,
        }
    src = parse_message_tokens(prompt["source"])
    dst = parse_message_tokens(translation)
    expected_simple = collections.Counter(x["name"] for x in prompt["sourcePlaceholders"] if x.get("formatter") is None)
    simple_ok = dict(sorted(expected_simple.items())) == dst["simple"] and set(prompt["sourceIcuPluralCategories"]) == set(dst["plurals"])
    expected_icu = prompt["sourceIcuPluralCategories"]
    dst_icu = {k: list(v) for k, v in dst["plurals"].items()}
    icu_ok = simple_ok and all(
        list(expected_icu[name]) == list(dst_icu[name]) and
        {cat: src["plurals"][name][cat]["hashCount"] for cat in expected_icu[name]} ==
        {cat: dst["plurals"][name][cat]["hashCount"] for cat in expected_icu[name]}
        for name in expected_icu
    )
    markup = re.findall(r"</?[A-Za-z][^>]*>", translation)
    markup_ok = sorted(markup) == sorted(prompt["sourceMarkupTokens"])
    numeric = re.findall(r"(?<![A-Za-z])\d[\d,]*(?:\.\d+)?(?![A-Za-z])", translation)
    numeric_ok = sorted(numeric) == sorted(prompt["sourceNumericTokens"])
    protected = prompt["sourceProtectedLiterals"]
    protected_ok = all(translation.count(token) >= protected.count(token) for token in set(protected))
    result = {
        "placeholders": {"source": prompt["sourcePlaceholders"], "selected": dst["simple"], "pass": simple_ok},
        "icu": {"sourcePluralCategories": expected_icu, "selectedPluralCategories": dst_icu, "sourceHashCounts": src["plurals"], "selectedHashCounts": dst["plurals"], "pass": icu_ok},
        "markup": {"source": prompt["sourceMarkupTokens"], "selected": markup, "pass": markup_ok},
        "numeric": {"source": prompt["sourceNumericTokens"], "selected": numeric, "pass": numeric_ok},
        "protectedLiterals": {"source": protected, "presentInSelected": [t for t in protected if translation.count(t) >= protected.count(t)], "pass": protected_ok},
    }
    result["allPass"] = all(v["pass"] for v in result.values() if isinstance(v, dict))
    return result

def verify(input_dir):
    manifest = json.loads((OUT / "manifest.json").read_text())
    summary = json.loads((OUT / "summary.json").read_text())
    verification = json.loads((OUT / "verification.json").read_text())
    if manifest["head"] != HEAD or manifest["tree"] != TREE:
        raise SystemExit("Output head/tree pin mismatch")
    if manifest["candidateMaterialAccessed"] or manifest["currentTargetsAccessed"] or manifest["glossaryAccessed"] or manifest["priorReviewsAccessed"]:
        raise SystemExit("Blind isolation marker is not clean")
    for entry in manifest["files"]:
        path = OUT / entry["path"]
        if not path.is_file() or path.stat().st_size != entry["bytes"] or sha_file(path) != entry["sha256"]:
            raise SystemExit(f"Output manifest mismatch: {entry['path']}")
    run(["sha256sum", "-c", "SHA256SUMS.txt"], OUT)
    run(["sha256sum", "-c", "SHA256SUMS.txt"], input_dir)
    input_check = json.loads(run(["python3", "verify_blind_input.py"], input_dir))
    if input_check.get("pass") is not True or input_check.get("cells") != 240 or input_check.get("callerlessPosition") != 3632:
        raise SystemExit("Blind-input verifier failed")
    if sha_file(input_dir / "manifest.json") != manifest["blindInputManifestSha256"] or sha_file(input_dir / "SHA256SUMS.txt") != manifest["blindInputChecksumListSha256"] or sha_file(input_dir / "translation-prompts.jsonl") != manifest["translationPromptsSha256"]:
        raise SystemExit("Blind-input hash pin mismatch")
    prompts = read_jsonl(input_dir / "translation-prompts.jsonl")
    decisions = read_jsonl(OUT / "sealed-translation-ledger.jsonl")
    if len(prompts) != 240 or len(decisions) != 240:
        raise SystemExit("Expected 240 source/locale records")
    if [(p["position"], p["sourceId"], p["locale"]) for p in prompts] != [(d["position"], d["sourceId"], d["locale"]) for d in decisions]:
        raise SystemExit("Output ledger order/key mismatch")
    if len({(d["position"], d["sourceId"], d["locale"]) for d in decisions}) != 240:
        raise SystemExit("Duplicate output cells")

    dispositions = collections.Counter()
    per_locale = collections.defaultdict(collections.Counter)
    token_failures = 0
    callerless_holds = 0
    for prompt, decision in zip(prompts, decisions):
        if decision["schema"] != "seerrng-blind-translation-review/v1" or decision["repository"] != "snapetech-org/seerrng" or decision["pullRequest"] != 418 or decision["head"] != HEAD or decision["tree"] != TREE:
            raise SystemExit("Output provenance mismatch")
        if decision["sourcePrompt"] != prompt:
            raise SystemExit(f"Source/caller prompt was not copied exactly: {prompt['position']} {prompt['locale']}")
        if decision["source"] != prompt["source"] or decision["sourceSha256"] != prompt["sourceSha256"] or decision["locale"] != prompt["locale"]:
            raise SystemExit("Source binding mismatch")
        callerless = prompt["position"] == 3632
        if decision["callerless"] is not callerless or callerless != (prompt["callerResolution"] == "no direct message-property reference found in pinned production component"):
            raise SystemExit(f"Callerless marker mismatch at {prompt['position']} {prompt['locale']}")
        expected_disposition = "hold" if callerless else "propose"
        output = decision["decision"]
        if output["disposition"] != expected_disposition:
            raise SystemExit(f"Unexpected hold/propose boundary at {prompt['position']} {prompt['locale']}")
        if callerless:
            callerless_holds += 1
            if output["translation"] is not None or output["confidence"] != "low":
                raise SystemExit("Callerless cell must have no translation and low confidence")
            if not output["rationale"].strip():
                raise SystemExit("Callerless hold lacks a reason")
        else:
            if not isinstance(output["translation"], str) or not output["translation"].strip():
                raise SystemExit("Proposed translation is empty")
            if output["confidence"] not in ("high", "moderate", "low"):
                raise SystemExit("Proposal lacks a confidence level")
            if not output["rationale"].strip():
                raise SystemExit("Proposal lacks a rationale")
        checks = token_checks(prompt, output["translation"])
        if checks != output["tokenChecks"] or not checks["allPass"]:
            token_failures += 1
            raise SystemExit(f"Token/ICU audit mismatch at {prompt['position']} {prompt['locale']}")
        dispositions[output["disposition"]] += 1
        per_locale[prompt["locale"]][output["disposition"]] += 1

    if callerless_holds != 12 or dispositions != {"propose": 228, "hold": 12}:
        raise SystemExit("Disposition totals mismatch")
    if summary["cellCount"] != 240 or summary["proposedCells"] != 228 or summary["heldCells"] != 12 or summary["callerlessHolds"] != 12:
        raise SystemExit("Summary totals mismatch")
    if summary["dispositions"] != dict(sorted(dispositions.items())):
        raise SystemExit("Summary disposition breakdown mismatch")
    if summary["perLocaleDispositions"] != {locale: dict(sorted(per_locale[locale].items())) for locale in LOCALES}:
        raise SystemExit("Per-locale totals mismatch")
    if verification["result"] != "PASS" or verification["rows"] != 240 or verification["proposed"] != 228 or verification["held"] != 12 or verification["callerlessHolds"] != 12 or verification["allProposedTokenChecksPass"] is not True or token_failures:
        raise SystemExit("Verification report mismatch")
    print("PASS: SeerrNG W3620-W3639 blind ledger covers 240 cells; 228 proposals and all 12 callerless Author cells are held; source/caller pins, ICU, placeholder, markup, number, protected-literal, and checksum checks pass.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=pathlib.Path, default=DEFAULT_INPUT)
    args = parser.parse_args()
    verify(args.input)
