#!/usr/bin/env python3
"""Capture post-review live refs and reseal the cross-audit output inventory."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path("/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3940-3959-source")
HEAD = "a0104b4c84a9c4561020ca72062171b22ffc49f2"
TREE = "aaa44c8019c58fde7ae796065e8aae7ac11d7a80"
BRANCH = "codex/seerrng-localization-overhaul-20261028"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def main():
    remote = subprocess.check_output(
        ["git", "-C", str(REPO), "ls-remote", "origin", f"refs/heads/{BRANCH}", "refs/pull/418/head", "refs/heads/main"],
        text=True,
    )
    refs = {line.split()[1]: line.split()[0] for line in remote.splitlines() if line.strip()}
    pr = json.loads(subprocess.check_output(
        ["gh", "api", "repos/snapetech-org/seerrng/pulls/418", "--jq",
         "{head:.head.sha,headRef:.head.ref,base:.base.sha,baseRef:.base.ref,state:.state,draft:.draft,updatedAt:.updated_at}"],
        text=True,
    ))
    main = json.loads(subprocess.check_output(
        ["gh", "api", "repos/snapetech-org/seerrng/branches/main", "--jq",
         "{sha:.commit.sha,tree:.commit.commit.tree.sha}"],
        text=True,
    ))
    after = {
        "artifact": "SeerrNG PR #418 W3940-W3959 cross-review live attestation (after review)",
        "capturedAtUtc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "repository": "snapetech-org/seerrng",
        "pullRequest": 418,
        "window": "W3940-W3959",
        "sourceWorktree": str(REPO),
        "localHeadSha": git("rev-parse", "HEAD"),
        "localHeadTree": git("rev-parse", "HEAD^{tree}"),
        "sourceWorktreeStatus": git("status", "--porcelain=v1"),
        "sourceBranchRef": BRANCH,
        "branchRefSha": refs.get(f"refs/heads/{BRANCH}"),
        "pullRefSha": refs.get("refs/pull/418/head"),
        "liveMainSha": refs.get("refs/heads/main"),
        "liveMainTree": main["tree"],
        "prApiHeadSha": pr["head"],
        "prApiHeadRef": pr["headRef"],
        "prApiBaseSha": pr["base"],
        "prApiBaseRef": pr["baseRef"],
        "prState": pr["state"],
        "prDraft": pr["draft"],
        "prUpdatedAt": pr["updatedAt"],
    }
    if (after["localHeadSha"], after["localHeadTree"], after["sourceWorktreeStatus"]) != (HEAD, TREE, ""):
        raise SystemExit("source worktree pin/cleanliness changed")
    if any(after[k] != HEAD for k in ("branchRefSha", "pullRefSha", "prApiHeadSha")):
        raise SystemExit("live PR head refs changed")
    before = json.loads((ROOT / "live-review-before.json").read_text(encoding="utf-8"))
    stable = (
        "localHeadSha", "localHeadTree", "sourceWorktreeStatus", "branchRefSha", "pullRefSha", "liveMainSha", "liveMainTree",
        "prApiHeadSha", "prApiHeadRef", "prApiBaseSha", "prApiBaseRef", "prState", "prDraft", "prUpdatedAt",
    )
    if any(before.get(k) != after.get(k) for k in stable):
        raise SystemExit("live refs or PR state drifted during cross-review")
    (ROOT / "live-review-after.json").write_text(json.dumps(after, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = sorted(p for p in ROOT.iterdir() if p.is_file() and p.name not in {"manifest.json", "SHA256SUMS.txt"})
    manifest["files"] = [{"path": p.name, "bytes": p.stat().st_size, "sha256": sha(p.read_bytes())} for p in files]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sums = []
    for path in sorted(ROOT.iterdir()):
        if path.is_file() and path.name != "SHA256SUMS.txt":
            sums.append(f"{sha(path.read_bytes())}  {path.name}\n")
    (ROOT / "SHA256SUMS.txt").write_text("".join(sums), encoding="utf-8")
    print(json.dumps({
        "result": "SEALED",
        "head": after["localHeadSha"],
        "tree": after["localHeadTree"],
        "liveRefsStable": True,
        "outputManifestSha256": sha(manifest_path.read_bytes()),
        "outputChecksumsSha256": sha((ROOT / "SHA256SUMS.txt").read_bytes()),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
