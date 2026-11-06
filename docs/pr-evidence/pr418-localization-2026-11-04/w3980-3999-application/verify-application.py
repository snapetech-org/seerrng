#!/usr/bin/env python3
"""Verify the sealed W3980-W3999 application against a local SeerrNG checkout."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def need(condition, message):
    if not condition:
        raise SystemExit("FAIL: " + message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def shat(value):
    return sha(value.encode("utf-8"))


def j(path):
    return json.loads(path.read_text(encoding="utf-8"))


def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args]).decode("utf-8").strip()


def git_bytes(repo, commit, path):
    return subprocess.check_output(["git", "-C", str(repo), "show", f"{commit}:{path}"])


def verify_sums(directory, sums_name="SHA256SUMS.txt", strict=True):
    sums_path = directory / sums_name
    entries = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        need(name not in entries, f"duplicate checksum in {sums_path}")
        entries[name] = digest
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob("*")
              if p.is_file() and p != sums_path}
    need((actual == set(entries)) if strict else set(entries).issubset(actual),
         f"checksum inventory mismatch in {directory}")
    for name, digest in entries.items():
        need(sha((directory / name).read_bytes()) == digest, f"checksum {directory / name}")
    return len(entries)


def tokens(value):
    protected = re.findall(
        r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])",
        value,
    )
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, help="local SeerrNG git checkout containing the application commits")
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    plan = j(HERE / "application-plan.json")
    root = j(HERE / "root-adjudication" / "root-adjudication.json")
    cf = HERE / "candidate-free-input"
    verify_sums(HERE)
    verify_sums(cf, strict=False)
    verify_sums(HERE / "primary-review", strict=False)
    verify_sums(HERE / "seerrng-pr418-w3980-3999-blind-review-20261104", strict=False)
    verify_sums(HERE / "cross-review", strict=False)
    verify_sums(HERE / "focused-candidate-free", strict=False)
    verify_sums(HERE / "root-adjudication", strict=False)

    product = plan["productCommit"]
    product_tree = plan["productTree"]
    merge = plan["mainIntegrationCommit"]
    source = plan["sourcePinnedHead"]
    main = plan["liveMainMerged"]
    need(git(repo, "rev-parse", product + "^{tree}") == product_tree, "product tree pin")
    need(git(repo, "rev-parse", product + "^") == merge, "product commit first parent")
    need(git(repo, "rev-parse", merge + "^1") == source, "merge first parent source head")
    need(git(repo, "rev-parse", merge + "^2") == main, "merge second parent latest main")
    need(git(repo, "merge-base", merge, main) == main, "latest main is merge base")
    subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", product, "HEAD"], check=True)

    decisions = root["decisions"]
    apply = decisions["apply"]
    accepted = decisions["acceptCurrent"]
    holds = decisions["holds"]
    need((len(apply), len(accepted), len(holds)) == (43, 185, 12), "root decision counts")
    need(len({(int(row["position"]), row["locale"]) for row in apply + accepted + holds}) == 240,
         "root decision uniqueness and coverage")
    need(all(int(row["position"]) == 3987 for row in holds), "hold scope")

    cells = jl(cf / "current-target-cells.jsonl")
    sources = {int(row["position"]): row for row in jl(cf / "selected-source-cells.jsonl")}
    contexts = {row["sourceId"]: row for row in jl(cf / "caller-contexts.jsonl")}
    cell_by_key = {(int(row["position"]), row["locale"]): row for row in cells}
    decisions_by_key = {}
    for group, rows in (("apply", apply), ("accept-current", accepted), ("hold", holds)):
        for row in rows:
            key = (int(row["position"]), row["locale"])
            need(key not in decisions_by_key, "duplicate root cell")
            decisions_by_key[key] = (group, row)
    need(len(sources) == 20 and len(cells) == 240 and len(contexts) == 20, "input coverage")
    need(set(decisions_by_key) == set(cell_by_key), "root and candidate-free cell coverage")
    need(root["reviewProcessExposure"]["crossReviewNotIndependent"] is True,
         "cross-review process exposure recorded")

    focused_dir = HERE / "focused-candidate-free"
    focused_input = j(focused_dir / "review-input.json")
    focused_review = j(focused_dir / "blind-review.json")
    need(focused_input["binding"]["head"] == plan["sourcePinnedHead"], "focused input source head")
    need(focused_input["binding"]["tree"] == plan["sourcePinnedTree"], "focused input source tree")
    need(focused_input["binding"]["candidateFreeManifestSha256"] ==
         sha((cf / "manifest.json").read_bytes()), "focused input candidate-free binding")
    focused_by_key = {}
    for row in focused_input["cells"]:
        key = (int(row["position"]), row["locale"])
        need(key not in focused_by_key, "duplicate focused input cell")
        source_row = sources[key[0]]
        target_row = cell_by_key[key]
        context = contexts[source_row["sourceId"]]
        need(row["source"]["sourceId"] == source_row["sourceId"] == target_row["sourceId"],
             "focused source binding")
        need(row["source"]["sourceTextSha256"] == source_row["sourceTextSha256"], "focused source text hash")
        need(row["currentTarget"]["currentTargetSha256"] == target_row["currentTargetSha256"],
             "focused current target hash")
        need(row["callerContext"]["callerContextSha256"] == context["callerContextSha256"],
             "focused caller hash")
        need(row["callerContextBlocks"] and not row["missingContextBlockIds"], "focused caller blocks")
        need(not any(name.lower().startswith(("proposal", "decision", "rationale", "disposition"))
                     for name in row), "focused input contains review outputs")
        focused_by_key[key] = row
    need(len(focused_by_key) == 49, "focused input coverage")
    focused_reviews = {(int(row["position"]), row["locale"]): row for row in focused_review["cells"]}
    need(len(focused_reviews) == 49 and set(focused_reviews) == set(focused_by_key), "focused blind coverage")
    cross = j(HERE / "cross-review" / "cross-review.json")
    cross_by_key = {(int(row["position"]), row["locale"]): row for row in cross["cells"]}
    need(len(cross_by_key) == 240, "cross-review coverage")
    focused_selected = 0
    for row in apply:
        key = (int(row["position"]), row["locale"])
        cross_target = cross_by_key[key].get("recommendedTarget")
        if row["selectedTarget"] == cross_target:
            continue
        focused = focused_reviews.get(key)
        need(focused is not None and focused.get("proposedText") == row["selectedTarget"],
             "root target differs from cross without focused blind support")
        focused_selected += 1
    need(focused_selected == 5, "focused alternative count")

    expected_plan = []
    for row in apply:
        key = (int(row["position"]), row["locale"])
        cell = cell_by_key[key]
        need(row["sourceId"] == cell["sourceId"], "planned source ID")
        need(row["currentTargetSha256"] == cell["currentTargetSha256"], "planned old-value hash")
        need(shat(row["selectedTarget"]) == row["selectedTargetSha256"], "planned target hash")
        context = contexts[row["sourceId"]]
        need(row["callerContextSha256"] == context["callerContextSha256"], "planned caller binding")
        expected_plan.append({
            "position": row["position"], "sourceId": row["sourceId"], "locale": row["locale"],
            "catalogPath": cell["catalogPath"], "sourceText": row["sourceText"],
            "sourceTextSha256": row["sourceTextSha256"], "callerContextSha256": row["callerContextSha256"],
            "currentTarget": row["currentTarget"], "currentTargetSha256": row["currentTargetSha256"],
            "selectedTarget": row["selectedTarget"], "selectedTargetSha256": row["selectedTargetSha256"],
            "selectionBasis": row["selectionBasis"], "rootRationale": row["rootRationale"],
        })
    need(jl(HERE / "application-plan.jsonl") == expected_plan, "exact 43-row application plan")

    paths = {locale: pin["path"] for locale, pin in j(cf / "catalog-file-pins.json")["catalogFiles"].items()}
    expected_paths = sorted({paths[row["locale"]] for row in apply})
    changed_paths = sorted(git(repo, "diff", "--name-only", merge, product).splitlines())
    need(changed_paths == expected_paths, "product commit changed path set")
    need(all(not path.startswith(".github/workflows/") for path in changed_paths), "workflow path in product commit")

    apply_by_key = {(int(row["position"]), row["locale"]): row for row in apply}
    readback = jl(HERE / "readback-240-cells.jsonl")
    need(len(readback) == 240, "readback row count")
    actual_readback = []
    for cell in cells:
        key = (int(cell["position"]), cell["locale"])
        group, decision = decisions_by_key[key]
        expected = decision["selectedTarget"] if group == "apply" else decision["currentTarget"]
        raw = git_bytes(repo, product, cell["catalogPath"])
        catalog = json.loads(raw.decode("utf-8"))
        actual = catalog[cell["sourceId"]]
        row = {
            "position": cell["position"], "sourceId": cell["sourceId"], "locale": cell["locale"],
            "catalogPath": cell["catalogPath"], "decision": group, "expectedFinalTarget": expected,
            "expectedFinalTargetSha256": shat(expected), "actualTarget": actual,
            "actualTargetSha256": shat(actual), "matches": actual == expected,
            "sourceTextSha256": cell["sourceTextSha256"], "callerContextSha256": cell["callerContextSha256"],
        }
        need(row["matches"], f"final value readback {key}")
        actual_readback.append(row)
        if group == "apply":
            src = sources[int(cell["position"])]
            st, tt = tokens(src["sourceText"]), tokens(actual)
            for field in ("placeholders", "markupTags", "numericTokens"):
                need(st[field] == tt[field], f"selected target token mismatch {field} {key}")
            need(set(st["protectedLiterals"]).issubset(set(tt["protectedLiterals"])),
                 f"selected target protected literal mismatch {key}")
    need(readback == actual_readback, "portable 240-cell readback ledger")

    catalog_summary = j(HERE / "catalog-key-order-readback.json")["catalogs"]
    need(len(catalog_summary) == 13, "catalog order coverage")
    for item in catalog_summary:
        before = json.loads(git_bytes(repo, merge, item["path"]).decode("utf-8"))
        after = json.loads(git_bytes(repo, product, item["path"]).decode("utf-8"))
        before_keys, after_keys = list(before), list(after)
        need(before_keys == after_keys, "catalog key order " + item["locale"])
        changed = {key for key in before if before[key] != after[key]}
        planned = {row["sourceId"] for row in apply if row["locale"] == item["locale"]}
        need(changed == planned, "catalog value diff set " + item["locale"])
        need(item["keyCountBefore"] == len(before_keys) == item["keyCountAfter"], "catalog key count")
        need(item["keyOrderPreserved"] and item["keySetPreserved"], "catalog order evidence flag")
        need(item["selectedValueChanges"] == len(planned), "catalog selected change count")
        need(item["bytesUnchanged"] == (before == after), "catalog byte equality evidence")

    print(json.dumps({
        "result": "PASS", "window": plan["window"], "sourcePinnedHead": source,
        "mainIntegrationCommit": merge, "productCommit": product, "productTree": product_tree,
        "changedCatalogs": len(expected_paths), "appliedCells": len(apply),
        "acceptedCurrentCells": len(accepted), "heldCells": len(holds),
        "readbackCells": len(actual_readback), "focusedAlternatives": focused_selected,
        "catalogKeyOrderPreserved": True,
        "sourceTokenChecks": "PASS", "reviewPacketChecksums": "PASS"
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
