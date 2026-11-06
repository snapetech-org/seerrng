#!/usr/bin/env python3
"""Portable verifier for candidate-free SeerrNG PR #418 W3960-W3979 input."""
import argparse
import collections
import hashlib
import json
import re
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent
HEAD = "a456dd66aad34cb23f432cb3c189bb8083bbbe96"
TREE = "7a5447e5f08e84c392899a6e1400d1df73b1143b"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
BASE = "fa40534ccced75bde1125c14760514fcd5d7de4d"
MAIN = "016bcf8db7475b2105b9b488ff67ed7d1c096508"
INV = "src/i18n/locale/en.json"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]


def fail(message):
    raise SystemExit("FAIL: " + message)


def need(condition, message):
    if not condition:
        fail(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def shat(value):
    return sha(value.encode("utf-8"))


def canon(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def j(path):
    return json.loads(path.read_text(encoding="utf-8"))


def jl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def tokens(value):
    protected = re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])", value)
    return {
        "placeholders": re.findall(r"\{[A-Za-z][A-Za-z0-9_]*\}", value),
        "markupTags": re.findall(r"</?[A-Za-z][^>]*>", value),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])", value),
        "protectedLiterals": list(dict.fromkeys(protected)),
    }


def token_checks(source, target):
    result = {}
    for field in ("placeholders", "markupTags", "numericTokens"):
        result[field] = {"matches": source[field] == target[field], "source": source[field], "target": target[field]}
    missing = [value for value in source["protectedLiterals"] if value not in target["protectedLiterals"]]
    result["protectedLiterals"] = {"matches": not missing, "source": source["protectedLiterals"],
                                   "target": target["protectedLiterals"], "missingFromTarget": missing}
    return result


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def checksum_manifest():
    manifest = j(OUT / "manifest.json")
    expected = set(manifest["fileNames"])
    actual = {path.name for path in OUT.iterdir() if path.is_file() and path.name not in {"manifest.json", "SHA256SUMS.txt"}}
    need(expected == actual and len(expected) == len(manifest["fileNames"]), "manifest file list")
    sums = {}
    for line in (OUT / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        need(name not in sums, "duplicate checksum path")
        sums[name] = digest
    need(set(sums) == actual | {"manifest.json"}, "checksum inventory")
    for name, digest in sums.items():
        need(sha((OUT / name).read_bytes()) == digest, "checksum " + name)
    return manifest, len(sums)


def check_line_reference(ref, repo):
    path = repo / ref["path"]
    data = path.read_bytes()
    lines = data.decode("utf-8").splitlines()
    need(1 <= ref["line"] <= len(lines), "caller reference line range")
    line = lines[ref["line"] - 1]
    need(line == ref["text"] and shat(line) == ref["lineSha256"], "caller reference line hash")
    return data, lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-worktree", required=True)
    args = ap.parse_args()
    repo = Path(args.source_worktree).resolve()
    manifest, checksum_count = checksum_manifest()
    need((manifest.get("window"), manifest.get("head"), manifest.get("tree"), manifest.get("range"),
          manifest.get("candidateFreeInputOnly"), manifest.get("proposalCount"), manifest.get("dispositionFieldsIncluded")) ==
         ("W3960-W3979", HEAD, TREE, [3960, 3979], True, 0, False), "candidate-free manifest pin/type")
    need(git(repo, "rev-parse", "HEAD").decode().strip() == HEAD and git(repo, "rev-parse", "HEAD^{tree}").decode().strip() == TREE,
         "source worktree exact head/tree")
    need(git(repo, "status", "--porcelain").decode() == "", "source worktree dirty")

    before, after = j(OUT/"PR-attestation.json"), j(OUT/"PR-attestation-after.json")
    for attestation in (before, after):
        pr = attestation["pullRequest"]
        need((pr["number"], pr["state"], pr["isDraft"], pr["headRefOid"], pr["headRefName"], pr["baseRefOid"], pr["baseRefName"]) ==
             (418,"OPEN",True,HEAD,BRANCH,BASE,"main"), "PR API attestation")
        need(attestation["branchApiHead"] == attestation["branchRef"] == attestation["pullRef"] == HEAD and attestation["tree"] == TREE,
             "branch/pull/tree attestation")
        need(attestation["deploymentsAtExpectedShaCount"] == 0, "unexpected exact-head deployment count")
        need(attestation["mainRefOid"] == MAIN, "live main ref")
    stable_keys = set(before) | set(after)
    need(all(before.get(key) == after.get(key) for key in stable_keys if key != "attestedUtc"), "PR/base/main refs drifted during input capture")
    need((OUT/"remote-refs-before.tsv").read_bytes() == (OUT/"remote-refs-after.tsv").read_bytes(), "remote refs drifted")
    remote = subprocess.check_output(["git","ls-remote","https://github.com/snapetech-org/SeerrNG.git",
                                      f"refs/heads/{BRANCH}","refs/pull/418/head"],text=True)
    need(set(line.strip() for line in remote.splitlines() if line.strip()) ==
         set(line.strip() for line in (OUT/"remote-refs-after.tsv").read_text().splitlines() if line.strip()), "current remote refs")
    main_drift = j(OUT/"main-drift.json")
    need((main_drift["baseApiSha"], main_drift["liveMainBeforeSha"], main_drift["liveMainAfterSha"],
          main_drift["localizationOrCatalogChanges"]) == (BASE,MAIN,MAIN,False), "base/main drift attestation")
    need(manifest["mainBaseDriftSha256"] == sha((OUT/"main-drift.json").read_bytes()), "main drift hash")

    inventory_raw = git(repo,"show",f"{HEAD}:{INV}")
    need(inventory_raw == (repo/INV).read_bytes(), "English catalog does not match pinned Git file")
    english = json.loads(inventory_raw.decode("utf-8"))
    need(len(english) == manifest["sourceCount"] == 9494, "English key count")
    source_rows = [{"position":i,"sourceId":key,"sourceText":value,"sourceIdSha256":shat(key),
                    "sourceTextSha256":shat(value),"sourceTokens":tokens(value)} for i,(key,value) in enumerate(english.items())]
    order_rows = jl(OUT/"source-order-hashes.jsonl")
    need(len(order_rows)==9494 and [row["position"] for row in order_rows]==list(range(9494)), "source order coverage")
    need(all(row=={"position":source_rows[i]["position"],"sourceIdSha256":source_rows[i]["sourceIdSha256"],
                   "sourceTextSha256":source_rows[i]["sourceTextSha256"]} for i,row in enumerate(order_rows)), "source order hash binding")
    expected_selected = source_rows[3960:3980]
    selected = jl(OUT/"selected-source-cells.jsonl")
    need(len(selected)==20 and [row["position"] for row in selected]==list(range(3960,3980)), "selected source range")
    for row, expected in zip(selected, expected_selected):
        for field in ("position","sourceId","sourceText","sourceIdSha256","sourceTextSha256","sourceTokens"):
            need(row[field] == expected[field], "selected source binding " + field)
        need(not any(name.lower().startswith(("proposal","disposition","rationale")) for name in row), "proposal/disposition in source input")

    prior_selection = jl(OUT/"prior-selection-hash-reattestation.jsonl")
    need(len(prior_selection)==3960 and [row["position"] for row in prior_selection]==list(range(3960)), "prior selected source count/order")
    prior_ids={}
    for row in prior_selection:
        expected=source_rows[row["position"]]
        need(row["sourceIdSha256"]==expected["sourceIdSha256"] and row["sourceTextSha256"]==expected["sourceTextSha256"] and
             row["currentSourceIdSha256"]==expected["sourceIdSha256"] and row["currentSourceTextSha256"]==expected["sourceTextSha256"] and
             row["sourceIdHashMatches"] and row["sourceTextHashMatches"], "prior selected source hash " + str(row["position"]))
        need(row["sourceIdSha256"] not in prior_ids, "prior selection ID duplicate")
        prior_ids[row["sourceIdSha256"]]=row["position"]
    need(not prior_ids.keys() & {row["sourceIdSha256"] for row in selected}, "selected source overlap")
    boundary=jl(OUT/"source-window-boundaries-hash-only.jsonl")
    need(boundary[0]["position"]==3959 and boundary[1]["position"]==3960 and boundary[-1]["position"]==3980 and
         all(row.get("hashOnly") is True for row in boundary), "source window boundaries")
    need(j(OUT/"window.json")["nextBoundary"]["sourceIdSha256"]==source_rows[3960]["sourceIdSha256"] and
         j(OUT/"window.json")["nextUnselectedBoundary"]["sourceIdSha256"]==source_rows[3980]["sourceIdSha256"], "derived next eligible boundary")

    catalogs = {}
    catalog_pins = j(OUT/"catalog-file-pins.json")
    need(catalog_pins["localeOrder"]==LOCALES and len(catalog_pins["catalogFiles"])==13 and catalog_pins["catalogKeyCount"]==9494,
         "catalog locale set")
    source_keys=list(english.keys())
    for locale,pin in catalog_pins["catalogFiles"].items():
        raw=git(repo,"show",f"{HEAD}:{pin['path']}")
        need(raw==(repo/pin["path"]).read_bytes() and sha(raw)==pin["sha256"] and len(raw)==pin["byteCount"], "catalog exact bytes " + locale)
        need(git(repo,"hash-object",pin["path"]).decode().strip()==pin["gitBlob"], "catalog blob " + locale)
        obj=json.loads(raw.decode("utf-8")); keys=list(obj)
        need(len(keys)==9494 and set(keys)==set(source_keys) and pin["keyCount"]==9494, "catalog key set " + locale)
        need(sha("\n".join(sorted(keys)).encode())==pin["sortedKeySetSha256"] and
             pin["sortedKeySetSha256"]==sha("\n".join(sorted(source_keys)).encode()), "catalog sorted key-set hash " + locale)
        catalogs[locale]=obj

    runtime = j(OUT/"runtime-file-pins.json")
    need(runtime["head"]==HEAD and runtime["tree"]==TREE and len(runtime["files"])>=1, "runtime file pin set")
    runtime_by_path={row["path"]:row for row in runtime["files"]}
    for row in runtime["files"]:
        data=(repo/row["path"]).read_bytes()
        need(len(data)==row["byteCount"] and sha(data)==row["sha256"] and git(repo,"hash-object",row["path"]).decode().strip()==row["gitBlob"],
             "runtime file pin " + row["path"])
    blocks={row["contextId"]:row for row in jl(OUT/"caller-context-blocks.jsonl")}
    contexts=jl(OUT/"caller-contexts.jsonl")
    need(len(contexts)==20 and {row["sourceId"] for row in contexts}=={row["sourceId"] for row in selected}, "caller context coverage")
    for context in contexts:
        source=next(row for row in selected if row["sourceId"]==context["sourceId"])
        need(context["sourceIdSha256"]==source["sourceIdSha256"] and context["sourceTextSha256"]==source["sourceTextSha256"], "caller source link")
        definition=next(blocks[block_id] for block_id in context["contextBlockIds"] if blocks[block_id]["contextType"]=="message-definition")
        material={"sourceId":context["sourceId"],"namespace":context["namespace"],"definition":definition,
                  "directMessageReferences":context["directMessageReferences"],"dynamicRendererReferences":context["dynamicRendererReferences"]}
        need(context["callerContextSha256"]==shat(canon(material)), "caller context hash")
        component=(repo/context["namespaceFiles"][0]).read_text(encoding="utf-8").splitlines()
        key=context["sourceKey"]
        actual_lines=[i+1 for i,line in enumerate(component) if re.search(r"\bmessages\."+re.escape(key)+r"\b",line)]
        need(actual_lines==[ref["line"] for ref in context["directMessageReferences"]], "direct caller occurrence set " + context["sourceId"])
        for ref in context["directMessageReferences"]:
            _,lines=check_line_reference(ref,repo)
            need(blocks[ref["contextBlockId"]]["path"]==ref["path"], "direct caller block path")
        for ref in context["dynamicRendererReferences"]:
            raw,lines=check_line_reference(ref,repo)
            need(sha(raw)==ref["fileSha256"] and git(repo,"hash-object",ref["path"]).decode().strip()==ref["gitBlob"], "route/render file pin")
        need(context["callerCount"]==len(context["directMessageReferences"])>0 and len(context["dynamicRendererReferences"])==2,
             "caller resolution count")
    for block_row in blocks.values():
        lines=(repo/block_row["path"]).read_text(encoding="utf-8").splitlines()
        for entry in block_row["lines"]:
            need(1<=entry["line"]<=len(lines) and lines[entry["line"]-1]==entry["text"] and shat(entry["text"])==entry["lineSha256"],
                 "caller context block line hash")

    cells=jl(OUT/"current-target-cells.jsonl")
    need(len(cells)==240 and [(row["position"],row["locale"]) for row in cells]==[(pos,loc) for pos in range(3960,3980) for loc in LOCALES],
         "current cell count/order")
    context_by_id={row["sourceId"]:row for row in contexts}
    mismatch=collections.Counter()
    for cell in cells:
        source=source_rows[cell["position"]]
        locale=cell["locale"]
        expected=catalogs[locale][source["sourceId"]]
        need(cell["sourceId"]==source["sourceId"] and cell["sourceIdSha256"]==source["sourceIdSha256"] and
             cell["sourceTextSha256"]==source["sourceTextSha256"], "current cell source binding")
        need(cell["currentTarget"]==expected and cell["currentTargetSha256"]==shat(expected), "current catalog value/hash")
        need(cell["callerContextSha256"]==context_by_id[source["sourceId"]]["callerContextSha256"], "cell caller binding")
        expected_source_tokens=tokens(source["sourceText"]); target_tokens=tokens(expected)
        need(cell["sourceTokens"]==expected_source_tokens and cell["targetTokens"]==target_tokens and
             cell["tokenChecks"]==token_checks(expected_source_tokens,target_tokens), "token evidence")
        for name,record in cell["tokenChecks"].items():
            if not record["matches"]: mismatch[name]+=1
        need(not any(k.lower().startswith(("proposal","disposition","rationale")) for k in cell), "proposal/disposition in candidate-free cells")
    diagnostics=j(OUT/"baseline-token-diagnostics.json")
    need(diagnostics["cellCount"]==240 and diagnostics["markupTags"]==mismatch["markupTags"] and
         diagnostics["numericTokens"]==mismatch["numericTokens"] and diagnostics["placeholders"]==mismatch["placeholders"] and
         diagnostics["protectedLiterals"]==mismatch["protectedLiterals"], "baseline token diagnostic counts")

    prior_applied=jl(OUT/"prior-applied-target-hash-reattestation.jsonl")
    need(len(prior_applied)==262 and all(row["selectedTargetHashMatches"] and row["targetTextIncluded"] is False for row in prior_applied),
         "prior applied target count/flags")
    for row in prior_applied:
        source=source_rows[row["position"]]
        source_id=source["sourceId"]
        current_hash=shat(catalogs[row["locale"]][source_id])
        need(row["sourceIdSha256"]==source["sourceIdSha256"] and row["sourceTextSha256"]==source["sourceTextSha256"] and
             row["currentTargetSha256"]==current_hash==row["selectedTargetSha256"], "prior applied target reattestation")
    prior_holds=jl(OUT/"prior-hold-hash-reattestation.jsonl")
    need(len(prior_holds)==50 and all(row["priorHoldPreserved"] and row["targetTextIncluded"] is False for row in prior_holds),
         "prior hold count/flags")
    for row in prior_holds:
        source=source_rows[row["position"]]
        source_id=source["sourceId"]
        current_hash=shat(catalogs[row["locale"]][source_id])
        need(row["sourceIdSha256"]==source["sourceIdSha256"] and row["sourceTextSha256"]==source["sourceTextSha256"] and
             row["currentTargetSha256"]==current_hash==row["previousTargetSha256"], "prior hold target hash")
        need(not any(k in row for k in ("sourceText","currentTarget","target","proposedTarget")), "prior hold text leak")

    lineage=j(OUT/"prior-catalog-application-summary.json")
    need(lineage["priorAppliedTargetRows"]==262 and lineage["priorCatalogApplicationCells"]==227 and
         len(lineage["priorApplicationRefs"])>=6 and len(set(lineage["priorApplicationRefs"]))==len(lineage["priorApplicationRefs"]), "prior application summary")
    for pin in lineage["priorApplicationEvidenceFiles"]:
        raw=git(repo,"show",f"{HEAD}:{pin['path']}")
        need(len(raw)==pin["byteCount"] and sha(raw)==pin["sha256"] and git(repo,"hash-object",pin["path"]).decode().strip()==pin["gitBlob"],
             "prior application evidence pin")
    for commit in lineage["priorApplicationRefs"]:
        subprocess.run(["git","-C",str(repo),"merge-base","--is-ancestor",commit,HEAD],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

    print(json.dumps({"result":"PASS","window":"W3960-W3979","head":HEAD,"tree":TREE,
        "sourceCount":20,"cellCount":len(cells),"localeCount":12,
        "priorSelectedSourceHashes":len(prior_selection),"priorAppliedTargets":len(prior_applied),
        "priorHashOnlyHolds":len(prior_holds),"callerReferences":sum(row["callerCount"] for row in contexts),
        "catalogCount":len(catalogs),"catalogKeysPerFile":9494,"baselineTokenMismatchCounts":dict(mismatch),
        "derivedBoundary":"3960-3979","PR":"OPEN/DRAFT exact branch/pull/base", "checksums":checksum_count},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
