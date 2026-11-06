#!/usr/bin/env python3
import argparse
from datetime import datetime, timezone
import json, subprocess
from pathlib import Path

HEAD="a2f015c040f933eff38e6ef3d9b1ac6050c4957d"
TREE="9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe"
BRANCH="codex/seerrng-localization-overhaul-20261028"
REPO="snapetech-org/seerrng"

def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("output")
    ns=ap.parse_args()
    pr=json.loads(run(["gh","pr","view","418","--repo",REPO,"--json","number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url"]))
    ls=run(["git","ls-remote",f"https://github.com/{REPO}.git",f"refs/heads/{BRANCH}","refs/pull/418/head","refs/heads/main"])
    refs={}
    for line in ls.splitlines():
        oid,name=line.split(None,1); refs[name]=oid
    commit=json.loads(run(["gh","api",f"repos/{REPO}/commits/{HEAD}","--jq","{sha: .sha, tree: .commit.tree.sha}"]))
    data={"capturedAtUtc":datetime.now(timezone.utc).isoformat(),"expected":{"head":HEAD,"tree":TREE,"branch":BRANCH},"pr":pr,"refs":refs,"headCommit":commit["sha"],"headTree":commit["tree"]}
    assert pr["state"]=="OPEN" and pr["isDraft"]
    assert pr["headRefName"]==BRANCH and pr["headRefOid"]==HEAD
    assert refs.get(f"refs/heads/{BRANCH}")==HEAD
    assert refs.get("refs/pull/418/head")==HEAD
    assert commit["sha"]==HEAD and commit["tree"]==TREE
    Path(ns.output).write_text(json.dumps(data,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps({"result":"PASS","output":ns.output,"head":commit["sha"],"tree":commit["tree"],"state":pr["state"],"draft":pr["isDraft"],"branch":pr["headRefName"],"pullRef":refs["refs/pull/418/head"]},indent=2))

