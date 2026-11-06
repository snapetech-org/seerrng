#!/usr/bin/env python3
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

REPO = "snapetech-org/SeerrNG"
PR = 418
HEAD = "d317a07ea0e5456b6d4660470c57d1f205cd0587"
TREE = "c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008"
BRANCH = "codex/seerrng-localization-overhaul-20261028"
BASE_REF = "main"
BASE_SHA = "fa40534ccced75bde1125c14760514fcd5d7de4d"
OUTDIR = Path(__file__).resolve().parent

def run(args):
    return subprocess.check_output(args, text=True).strip()

pr = json.loads(run(["gh", "api", f"repos/{REPO}/pulls/{PR}"]))
branch = json.loads(run(["gh", "api", f"repos/{REPO}/git/ref/heads/{BRANCH}"]))
commit = json.loads(run(["gh", "api", f"repos/{REPO}/git/commits/{HEAD}"]))
pull_ref_line = run(["git", "ls-remote", f"https://github.com/{REPO}.git", f"refs/pull/{PR}/head"])
pull_ref_sha = pull_ref_line.split()[0] if pull_ref_line else None
deployments_output = run(["gh", "api", "--paginate", f"repos/{REPO}/deployments?sha={HEAD}&per_page=100", "--jq", "length"])
deployment_count = sum(int(line) for line in deployments_output.splitlines() if line.strip())
record = {
    "observedAtUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
    "repository": REPO,
    "pullRequest": PR,
    "pr": {
        "state": pr.get("state"),
        "draft": pr.get("draft"),
        "head": pr.get("head", {}).get("sha"),
        "headRef": pr.get("head", {}).get("ref"),
        "baseRef": pr.get("base", {}).get("ref"),
        "baseSha": pr.get("base", {}).get("sha"),
    },
    "branchRef": {"ref": f"refs/heads/{BRANCH}", "sha": branch.get("object", {}).get("sha")},
    "pullRef": {"ref": f"refs/pull/{PR}/head", "sha": pull_ref_sha},
    "commitTree": {"commit": HEAD, "tree": commit.get("tree", {}).get("sha")},
    "deploymentsAtExpectedHead": {"sha": HEAD, "count": deployment_count},
    "expected": {
        "state": "open", "draft": True, "head": HEAD, "headRef": BRANCH,
        "tree": TREE, "baseRef": BASE_REF, "baseSha": BASE_SHA,
    },
}
record["pinsMatched"] = (
    record["pr"] == {
        "state": "open", "draft": True, "head": HEAD, "headRef": BRANCH,
        "baseRef": BASE_REF, "baseSha": BASE_SHA,
    }
    and record["branchRef"]["sha"] == HEAD
    and record["pullRef"]["sha"] == HEAD
    and record["commitTree"]["tree"] == TREE
    and deployment_count == 0
)
phase = sys.argv[1]
if phase not in {"before", "after"}:
    raise SystemExit("usage: attest_live.py before|after")
path = OUTDIR / f"live-attestation-{phase}.json"
path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, ensure_ascii=False, indent=2))
if not record["pinsMatched"]:
    raise SystemExit(2)
