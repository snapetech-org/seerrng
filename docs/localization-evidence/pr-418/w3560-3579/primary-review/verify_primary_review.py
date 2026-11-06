from pathlib import Path
from collections import Counter
import hashlib,json,re,subprocess
T=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-primary-20261103"); IN=T/"candidate-free-input"; OUT=T/"primary-review"; R=T/"repo"
HEAD="351f2c09a4aaf6f223975fc1827cb9f77de7702d"; TREE="3d88008f6ea7dc6cbef21333d29a032469cd60cf"
MANIFEST_SHA="57c8bb96f21976482af691fa8549d63116fbc66bd30177c3eaa2cb7835996eed"; INPUT_SUMS_SHA="5a73d23784f17cd51e186ad626cd6a952b12e2b801b36bf71dfde44b13fdd3e7"
PH=re.compile(r"\{[^{}\r\n]+\}"); MK=re.compile(r"</?[A-Za-z][^<>]*?/?>"); NUM=re.compile(r"(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)")
PROTECTED=["SeerrNG","Audiobookshelf","ISBN","API","URL","HTTP","HTTPS","IP","BackIssue","library.view","library.manage","downloads.grab"]
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode())
def j(p): return json.loads(p.read_text())
def jl(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
subprocess.run(["python3",str(T/"verify_candidate_free.py")],check=True,capture_output=True,text=True)
manifest=j(IN/"manifest.json"); assert sha((IN/"manifest.json").read_bytes())==MANIFEST_SHA and sha((IN/"SHA256SUMS.txt").read_bytes())==INPUT_SUMS_SHA
sumfiles={}
for line in (OUT/"SHA256SUMS.txt").read_text().splitlines():
 h,n=line.split(None,1); n=n.strip().lstrip("*"); sumfiles[n]=h; assert sha((OUT/n).read_bytes())==h,n
assert set(sumfiles)=={p.name for p in OUT.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
ledger=jl(OUT/"primary-ledger.jsonl"); selected=jl(OUT/"selected-direct-locale-cells.jsonl")
sources={x["position"]:x for x in jl(IN/"source-cells.jsonl")}; contexts={x["position"]:x for x in jl(IN/"caller-contexts.jsonl")}
inputs={(x["position"],x["locale"]):x for x in jl(IN/"current-target-cells.jsonl")}
summary=j(OUT/"summary.json"); provenance=j(OUT/"provenance.json"); assert len(ledger)==len(inputs)==240 and len(selected)==32
assert summary["head"]==provenance["head"]==HEAD and summary["tree"]==provenance["tree"]==TREE
assert summary["candidateFreeManifestJsonSha256"]==provenance["candidateFreeManifestJsonSha256"]==MANIFEST_SHA
assert summary["candidateFreeChecksumListSha256"]==provenance["candidateFreeChecksumListSha256"]==INPUT_SUMS_SHA
assert summary["all240CellsReviewed"] is True and summary["blindReviewIncluded"] is False and provenance["blindReviewIncluded"] is False
assert summary["nativeSpeakerApproval"] is False and summary["exactHeadBrowserReview"] is False
assert provenance["reviewType"]=="primary semantic review only"
assert not any("blind" in p.name.lower() for p in OUT.iterdir() if p.is_file())
bykey={(x["position"],x["locale"]):x for x in ledger}; assert len(bykey)==240 and set(bykey)==set(inputs)
sel={(x["position"],x["locale"]):x for x in selected}; assert len(sel)==len(selected)
counts=Counter(x["disposition"] for x in ledger)
assert counts==Counter(summary["dispositions"])
assert counts["accept-current"]+counts["correction"]+counts["refinement"]+counts["hold"]==240
assert len(selected)==counts["correction"]+counts["refinement"] and counts["hold"]==0
for key,row in bykey.items():
 inp=inputs[key]; src=sources[row["position"]]; caller=contexts[row["position"]]
 assert row["reviewStatus"]=="primary-reviewed" and row["head"]==HEAD and row["tree"]==TREE
 for field in ["sourceId","source","sourceSha256","currentTarget","currentTargetSha256","catalogPath","catalogGitBlob","catalogSha256"]:
  source_field={"source":"source","sourceSha256":"sourceSha256","sourceId":"sourceId"}.get(field,field)
  assert row[field]==inp.get(field,row[field]) if field not in {"source","sourceSha256","sourceId"} else row[field]==src[field]
 assert row["sourceId"]==src["sourceId"] and row["source"]==src["source"] and row["sourceSha256"]==src["sourceSha256"]
 assert row["currentTarget"]==inp["currentTarget"] and row["currentTargetSha256"]==inp["currentTargetSha256"] and row["catalogPath"]==inp["catalogPath"] and row["catalogSha256"]==inp["catalogSha256"] and row["catalogGitBlob"]==inp["catalogGitBlob"]
 assert row["callerContext"]["callerCount"]==caller["callerCount"]>0
 assert row["callerContext"]["directMessageReferences"]==caller["directMessageReferences"]
 assert row["rationale"].strip() and row["confidence"] in {"high","moderate","low"}
 final=row["finalTarget"]; assert row["finalTargetSha256"]==st(final)
 assert PH.findall(final)==src["sourcePlaceholders"] and row["placeholderTokenChecks"]["finalSequenceMatchesSource"] is True and row["placeholderTokenChecks"]["finalSetMatchesSource"] is True
 assert MK.findall(final)==src["sourceMarkupTokens"] and row["markupTokenChecks"]["finalSequenceMatchesSource"] is True
 assert NUM.findall(final)==src["sourceNumericTokens"] and row["numericTokenChecks"]["finalSequenceMatchesSource"] is True
 assert all(x in final for x in src["sourceProtectedLiterals"]) and row["protectedLiteralChecks"]["finalSetMatchesSource"] is True
 if row["disposition"]=="accept-current":
  assert final==row["currentTarget"] and key not in sel and "proposedTarget" not in row
 else:
  x=sel[key]; assert row["proposedTarget"]==final and row["proposedTargetSha256"]==st(final)
  assert x["proposedTarget"]==final and x["proposedTargetSha256"]==st(final) and x["disposition"]==row["disposition"] and x["rationale"]==row["rationale"]
assert set(sel)=={k for k,v in bykey.items() if v["disposition"]!="accept-current"}
assert summary["cells"]==240 and summary["sourceIds"]==20 and summary["locales"]==12 and summary["proposedChanges"]==len(selected)
assert summary["callerlessHolds"]==0 and summary["placeholderMismatches"]==summary["markupMismatches"]==summary["numericTokenMismatches"]==summary["protectedLiteralMismatches"]==0
print(json.dumps({"result":"PASS","head":HEAD,"tree":TREE,"cells":240,"dispositions":dict(counts),"proposedChanges":len(selected),"holds":counts["hold"],"candidateFreeManifestJsonSha256":MANIFEST_SHA,"candidateFreeChecksumListSha256":INPUT_SUMS_SHA,"primaryChecksumListSha256":sha((OUT/"SHA256SUMS.txt").read_bytes()),"primaryChecksumEntries":len(sumfiles)},indent=2))

