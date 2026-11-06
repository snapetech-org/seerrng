import hashlib,json,subprocess,datetime,re
from pathlib import Path
WORK=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-apply-20261103/repo")
OUT=WORK/"docs/pr-evidence/pr418-localization-2026-11-03/window-3580-3599"
HEAD="30f626a4626d460f426666cde02f5c1ed17fa206"; TREE="9b2616780791c73eb176aca6ad53061f1f3587d8"; BRANCH="codex/seerrng-localization-overhaul-20261028"
def sha(b): return hashlib.sha256(b).hexdigest()
def run(args,cwd=WORK): return subprocess.check_output(args,cwd=cwd,text=True).strip()
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def sums(d):
 for line in (d/"SHA256SUMS.txt").read_text().splitlines():
  if line.strip():
   h,n=line.split(None,1); assert sha((d/n.strip().lstrip("*")).read_bytes())==h
PK={"candidate-free-input":OUT/"candidate-free-input","primary-review":OUT/"primary-review","blind-review":OUT/"blind-review","root-cross-audit":OUT/"root-cross-audit"}
for d in PK.values(): sums(d)
manifest=j(PK["candidate-free-input"]/"manifest.json"); window=j(PK["candidate-free-input"]/"window.json"); pins=j(PK["candidate-free-input"]/"file-pins.json")
plan=j(PK["root-cross-audit"]/"application-plan-proposal.json"); summary=j(PK["root-cross-audit"]/"summary.json")
assert (manifest["head"],manifest["tree"])==(HEAD,TREE)
assert window["window"]=="W3580-W3599" and plan["updateCount"]==28 and plan["holdCount"]==0 and not plan["authorizedForApplication"]
assert summary["rootCounts"]=={"propose-update":28,"retain-current":212,"hold":0} and summary["reviewerTargetDisagreements"]==25
status=run(["git","status","--porcelain=v1"]); prefix="?? docs/pr-evidence/pr418-localization-2026-11-03/window-3580-3599"
assert all(x.startswith(prefix) for x in status.splitlines()),status
head=run(["git","rev-parse","HEAD"]); tree=run(["git","rev-parse","HEAD^{tree}"]); branch=run(["git","branch","--show-current"])
assert (head,tree,branch)==(HEAD,TREE,BRANCH)
pr=json.loads(run(["gh","api","repos/snapetech-org/seerrng/pulls/418"]))
assert pr["state"]=="open" and pr["draft"] is True and pr["head"]["ref"]==BRANCH and pr["head"]["sha"]==HEAD and pr["base"]["ref"]=="main"
remote=run(["git","ls-remote","origin",f"refs/heads/{BRANCH}","refs/pull/418/head"])
refs={x.split()[1]:x.split()[0] for x in remote.splitlines()}
assert refs=={f"refs/heads/{BRANCH}":HEAD,"refs/pull/418/head":HEAD}
remote_tree=run(["gh","api",f"repos/snapetech-org/seerrng/git/commits/{HEAD}","--jq",".tree.sha"]); assert remote_tree==TREE
for path,meta in pins["catalogFiles"].items():
 raw=subprocess.check_output(["git","show",f"{HEAD}:{path}"],cwd=WORK); live=(WORK/path).read_bytes()
 assert sha(raw)==sha(live)==meta["sha256"] and len(raw)==meta["byteCount"],path
body=(pr.get("body") or "").encode(); (OUT/"pr-body-before.md").write_bytes(body)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
pre={"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"verifiedAtUtc":now,
 "branch":branch,"head":head,"tree":tree,"remoteCommitTreeApiSha":remote_tree,
 "initialWorktreeCleanBeforeEvidenceCopy":True,
 "initialStatusBeforeEvidenceCopy":"## codex/seerrng-localization-overhaul-20261028...origin/codex/seerrng-localization-overhaul-20261028",
 "worktreeStatusBeforeCatalogEdits":status,"prState":pr["state"],"prDraft":pr["draft"],
 "prHeadRef":pr["head"]["ref"],"prHeadSha":pr["head"]["sha"],"prBaseRef":pr["base"]["ref"],"prBaseSha":pr["base"]["sha"],
 "branchRef":refs[f"refs/heads/{BRANCH}"],"pullRef":refs["refs/pull/418/head"],
 "prBodyBeforeSha256":sha(body),"prBodyBeforeBytes":len(body),
 "candidateFreeManifestSha256":sha((PK["candidate-free-input"]/"manifest.json").read_bytes()),
 "candidateFreeChecksumListSha256":sha((PK["candidate-free-input"]/"SHA256SUMS.txt").read_bytes()),
 "primaryChecksumListSha256":sha((PK["primary-review"]/"SHA256SUMS.txt").read_bytes()),
 "blindChecksumListSha256":sha((PK["blind-review"]/"SHA256SUMS.txt").read_bytes()),
 "rootCrossAuditChecksumListSha256":sha((PK["root-cross-audit"]/"SHA256SUMS.txt").read_bytes()),
 "authorizedUpdates":28,"reviewedCells":240,"retains":212,"holds":0}
(OUT/"preflight.json").write_text(json.dumps(pre,ensure_ascii=False,indent=2)+"\n")
auth={"schemaVersion":1,"repository":"snapetech-org/seerrng","pullRequest":418,"authorizedBy":"root","authorizedAtUtc":now,"authorized":True,
 "scope":{"window":"W3580-W3599","head":HEAD,"tree":TREE,"exactUpdateCount":28,"holdCount":0},
 "sourceProposalPath":"root-cross-audit/application-plan-proposal.json",
 "sourceProposalSha256":sha((PK["root-cross-audit"]/"application-plan-proposal.json").read_bytes()),
 "authorizationText":"Root explicitly approved exactly the 28 updates in application-plan-proposal.json. The 240-cell ledger retains 212 and has no current-window holds. Apply on the clean PR #418 worktree at parent 30f626a4626d460f426666cde02f5c1ed17fa206 / tree 9b2616780791c73eb176aca6ad53061f1f3587d8.",
 "limits":["Only approved catalog cells","No tests/builds/scans/CI/workflow edits","No merge/release/tag"]}
(OUT/"application-authorization.json").write_text(json.dumps(auth,ensure_ascii=False,indent=2)+"\n")
approved={"schemaVersion":1,"planType":"root-authorized-exact-application","authorizedForApplication":True,
 "repository":"snapetech-org/seerrng","pullRequest":418,"window":"W3580-W3599","parentHead":HEAD,"parentTree":TREE,
 "authorizationPath":"application-authorization.json","authorizationSha256":sha((OUT/"application-authorization.json").read_bytes()),
 "rootProposalPath":"root-cross-audit/application-plan-proposal.json",
 "rootProposalSha256":auth["sourceProposalSha256"],
 "rootDecisionLedgerSha256":sha((PK["root-cross-audit"]/"root-decision-ledger.jsonl").read_bytes()),
 "updateCount":28,"holdCount":0,"updates":plan["updates"]}
(OUT/"approved-application-plan.json").write_text(json.dumps(approved,ensure_ascii=False,indent=2)+"\n")
flows=[]
for f in sorted((WORK/".github/workflows").glob("*.yml")):
 lines=f.read_text().splitlines()
 hits=[{"line":i+1,"text":x} for i,x in enumerate(lines) if re.match(r"^\s*(push|pull_request|pull_request_target|workflow_dispatch|workflow_call):",x)]
 if hits: flows.append({"path":str(f.relative_to(WORK)),"sha256":sha(f.read_bytes()),"triggerLines":hits})
inspection={"checkedAtUtc":now,"workflowFilesWithTriggerDeclarations":flows,"findings":[
 "ci.yml pull_request_target is limited to labeled events; no push or synchronize trigger.",
 "public-fork-pr.yml listens to opened/synchronize/reopened/ready_for_review, but its job condition requires a fork. PR #418 is same-org, so the job condition is false.",
 "No workflow_dispatch or other manual workflow dispatch was invoked.",
 "No workflow file is in the planned diff."]}
(OUT/"workflow-trigger-inspection.json").write_text(json.dumps(inspection,ensure_ascii=False,indent=2)+"\n")
readme="""# SeerrNG PR #418 localization window W3580-W3599

This evidence packet applies the root-approved 28 exact-hash catalog updates from a 240-cell cross-audit bound to parent head 30f626a4626d460f426666cde02f5c1ed17fa206 / tree 9b2616780791c73eb176aca6ad53061f1f3587d8. The review retains 212 current values and has no holds.

The candidate-free input, primary review, blind review, and full root cross-audit are preserved in subdirectories. The approved application plan and authorization bind the applied rows to root's explicit approval. The 240-cell readback and catalog-invariant checks record final values, hashes, ordered keys, counts, and non-target preservation.

Run python3 verify-application.py from this directory after checkout at the final commit. Verify nested packets with their own SHA256SUMS.txt; the top-level SHA256SUMS.txt covers every evidence file recursively. This packet records a static application/readback only. It does not establish native-speaker approval or exact-head product browser acceptance. No tests, builds, scans, or explicit CI dispatches were performed.
"""
(OUT/"README.md").write_text(readme,encoding="utf-8")
print(json.dumps({"result":"PREPARED","head":head,"tree":tree,"branch":branch,"prBodyBytes":len(body),"worktreeStatusLines":status.splitlines(),"workflowFilesWithTriggers":len(flows),"bodySha256":sha(body)},indent=2))
