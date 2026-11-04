#!/usr/bin/env python3
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
PACKET = ROOT / "inputs" / "portable-packet"
INPUT = PACKET / "candidate-free-input"
PRIMARY = PACKET / "primary-review"
BLIND = ROOT / "inputs" / "blind-review-output"
PIN_HEAD = "ba5bb93cdb4f107a8337aae228b7cd397e1140a6"
PIN_TREE = "5420ae8fa33bda3619650757a2930a0114dbe4d1"
LOCALES = {"es","zh-Hans","hi","de","ja","fr","pt-BR","ar","ko","zh-Hant","vi","id"}

def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()

def jsonl(p):
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]

def tokens(s):
    return {
        "placeholders": re.findall(r"\{[^{}]+\}", s),
        "markupTags": re.findall(r"</?([A-Za-z][A-Za-z0-9]*)\b[^>]*>", s),
        "numericTokens": re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)*(?![A-Za-z])", s),
    }

def fail(msg):
    raise SystemExit("FAIL: " + msg)

# Re-run all supplied packet verifiers; they do not access or modify repository/PR state.
checks = {
    "candidateFree": json.loads(subprocess.check_output([sys.executable,str(INPUT/"verify-candidate-free.py")],text=True)),
    "primary": json.loads(subprocess.check_output([sys.executable,str(PRIMARY/"verify-primary-review.py")],text=True)),
    "portablePacket": json.loads(subprocess.check_output([sys.executable,str(PACKET/"verify-packet.py")],text=True)),
    "blind": json.loads(subprocess.check_output([sys.executable,str(BLIND/"verify_blind_review.py")],text=True)),
}
if any(x.get("result") != "PASS" for x in checks.values()):
    fail("one or more input verifiers failed")
if checks["candidateFree"].get("head") != PIN_HEAD or checks["candidateFree"].get("tree") != PIN_TREE:
    fail("candidate-free pin mismatch")
if checks["primary"].get("head") != PIN_HEAD or checks["primary"].get("tree") != PIN_TREE:
    fail("primary pin mismatch")
if checks["blind"].get("head") != PIN_HEAD or checks["blind"].get("tree") != PIN_TREE:
    fail("blind pin mismatch")
saved_checks = json.loads((ROOT/"input-verifier-results.json").read_text(encoding="utf-8"))
for name in ("candidateFree","primaryReview","portablePacket","blindReview"):
    if saved_checks[name].get("result") != "PASS":
        fail("saved verifier result missing PASS: "+name)

sources = {r["position"]:r for r in jsonl(INPUT/"selected-source-cells.jsonl")}
cells = {(r["position"],r["locale"]):r for r in jsonl(INPUT/"current-target-cells.jsonl")}
contexts = {r["position"]:r for r in jsonl(INPUT/"caller-contexts.jsonl")}
primary = {(r["position"],r["locale"]):r for r in jsonl(PRIMARY/"primary-ledger.jsonl")}
blind = {(r["position"],r["locale"]):r for r in jsonl(BLIND/"blind-review-ledger.jsonl")}
p_props = {(r["position"],r["locale"]):r for r in jsonl(PRIMARY/"proposals.jsonl")}
b_props = {(r["position"],r["locale"]):r for r in jsonl(BLIND/"proposals.jsonl")}
cross = jsonl(ROOT/"cross-ledger.jsonl")
corrections = jsonl(ROOT/"corrections.jsonl")
refinements = jsonl(ROOT/"refinements.jsonl")
holds = jsonl(ROOT/"holds.jsonl")
disagreements = jsonl(ROOT/"proposal-disagreements.jsonl")
expected = {(p,l) for p in range(3840,3860) for l in LOCALES}
if set(sources) != set(range(3840,3860)) or set(cells) != expected:
    fail("source/candidate cell coverage mismatch")
if set(primary) != expected or set(blind) != expected or len(cross) != 240:
    fail("review ledger coverage mismatch")
cross_by_key = {(r["position"],r["locale"]):r for r in cross}
if set(cross_by_key) != expected:
    fail("cross ledger has duplicate or missing cells")
if len(p_props) != 44 or len(b_props) != 23:
    fail("proposal count mismatch")
union = set(p_props) | set(b_props)
intersection = set(p_props) & set(b_props)
same = {k for k in intersection if p_props[k]["proposedTarget"] == b_props[k]["proposedTarget"]}
different = intersection-same
if (len(union),len(intersection),len(same),len(different),len(set(p_props)-set(b_props)),len(set(b_props)-set(p_props))) != (46,21,6,15,23,2):
    fail("primary/blind proposal union metrics mismatch")

accept_count = correct_count = refine_count = hold_count = 0
resolved_protected = 0
for key in expected:
    pos,locale = key
    s=sources[pos]; c=cells[key]; ctx=contexts[pos]
    p=primary[key]; b=blind[key]; x=cross_by_key[key]
    if x["head"] != PIN_HEAD or x["tree"] != PIN_TREE:
        fail(f"cross pin mismatch at {key}")
    for field, expected_value in (
        ("sourceId",s["sourceId"]),("sourceText",s["sourceText"]),("sourceTextSha256",s["sourceTextSha256"]),
        ("currentTarget",c["currentTarget"]),("currentTargetSha256",c["currentTargetSha256"]),
        ("callerContextSha256",c["callerContextSha256"]),("catalogPath",c["catalogPath"]),
        ("catalogSha256",c["catalogSha256"]),("catalogGitBlob",c["catalogGitBlob"]),
    ):
        if x.get(field) != expected_value:
            fail(f"cross input pin mismatch {field} at {key}")
    if p["sourceId"] != s["sourceId"] or p["sourceText"] != s["sourceText"] or p["sourceTextSha256"] != s["sourceTextSha256"] or p["currentTargetSha256"] != c["currentTargetSha256"] or p["callerContextSha256"] != c["callerContextSha256"]:
        fail(f"primary evidence mismatch at {key}")
    if b["sourceId"] != s["sourceId"] or b["sourceText"] != s["sourceText"] or b["sourceTextSha256"] != s["sourceTextSha256"] or b["currentTargetSha256"] != c["currentTargetSha256"] or b["callerContextSha256"] != c["callerContextSha256"]:
        fail(f"blind evidence mismatch at {key}")
    if ctx["callerCount"] < 1 or not ctx["directMessageReferences"] or not x["callerContextBlockIds"]:
        fail(f"missing exact caller evidence at {key}")
    if x["callerContextBlockIds"] != ctx["contextBlockIds"] or x["definitionFiles"] != ctx["definitionFiles"] or x["directMessageReferences"] != ctx["directMessageReferences"]:
        fail(f"caller references drift at {key}")
    ptarget = p.get("proposedTarget") if p["disposition"] in ("correction","refinement") else None
    btarget = b.get("finalTarget") if b["decision"] in ("propose-correction","propose-refinement") else None
    if x["primaryProposal"] != ptarget or x["blindProposal"] != btarget:
        fail(f"proposal linkage mismatch at {key}")
    if x["proposalOverlap"] != (key in intersection) or x["proposalTargetsAgree"] != (key in same):
        fail(f"proposal overlap flags mismatch at {key}")
    if x["crossDisposition"] == "accept-current":
        accept_count += 1
        if key in union or x["selectedTarget"] is not None or x["selectedTargetSha256"] is not None:
            fail(f"unexpected accept-current at {key}")
        if not all(c["tokenChecks"][k]["matches"] for k in ("placeholders","markupTags","numericTokens","protectedLiterals")):
            fail(f"accepted current cell has token mismatch at {key}")
    elif x["crossDisposition"] in ("correction","refinement"):
        if key not in union or not isinstance(x["selectedTarget"],str) or not x["selectedTarget"]:
            fail(f"selected target missing/outside proposal union at {key}")
        parsed=tokens(x["selectedTarget"])
        source_tokens=s["sourceTokens"]
        if parsed["placeholders"] != source_tokens["placeholders"] or parsed["markupTags"] != source_tokens["markupTags"] or parsed["numericTokens"] != source_tokens["numericTokens"]:
            fail(f"selected target token mismatch at {key}")
        if any(t not in x["selectedTarget"] for t in source_tokens["protectedLiterals"]):
            fail(f"selected target misses protected literal at {key}")
        if x["selectedTargetSha256"] != sha_bytes(x["selectedTarget"].encode("utf-8")):
            fail(f"selected target hash mismatch at {key}")
        if x["crossDisposition"] == "correction": correct_count += 1
        else: refine_count += 1
        if x["baselineProtectedLiteralMismatchResolved"]:
            resolved_protected += 1
    elif x["crossDisposition"] == "hold":
        hold_count += 1
        # Holds must stay text-free.
        for field in ("sourceText","currentTarget","primaryProposal","blindProposal","selectedTarget"):
            if field in x and x[field] is not None:
                fail(f"held cell leaks text at {key}")
    else:
        fail(f"unknown cross disposition at {key}")
if (accept_count,correct_count,refine_count,hold_count,resolved_protected) != (194,24,22,0,3):
    fail(f"cross disposition counts mismatch {(accept_count,correct_count,refine_count,hold_count,resolved_protected)}")
if set((r["position"],r["locale"]) for r in corrections) != {k for k,r in cross_by_key.items() if r["crossDisposition"]=="correction"}:
    fail("correction subset mismatch")
if set((r["position"],r["locale"]) for r in refinements) != {k for k,r in cross_by_key.items() if r["crossDisposition"]=="refinement"}:
    fail("refinement subset mismatch")
if len(disagreements) != 15 or len(holds) != 0:
    fail("disagreement/hold file count mismatch")
for d in disagreements:
    key=(d["position"],d["locale"])
    if key not in different or d["primaryTarget"] != p_props[key]["proposedTarget"] or d["blindTarget"] != b_props[key]["proposedTarget"]:
        fail("proposal disagreement linkage mismatch")
# Ensure the three 3856 primary replacements flagged as incomplete are not selected.
for locale in ("ar","fr","pt-BR"):
    key=(3856,locale)
    x=cross_by_key[key]
    if x["primaryProposal"] == x["selectedTarget"] or x["primaryAdjudication"]["status"] != "not-selected-incomplete":
        fail("incomplete 3856 primary fragment was not rejected")
    if any(lit not in x["selectedTarget"] for lit in ("ID",)):
        fail(f"3856 {locale} lost protected ID")
for locale, marker in (("ar","لا يغيّر SeerrNG"),("fr","SeerrNG ne modifie rien"),("pt-BR","SeerrNG não altera nada")):
    if marker not in cross_by_key[(3856,locale)]["selectedTarget"]:
        fail(f"3856 {locale} selected paragraph omitted read-only guarantee")
if not (ROOT/"holds.jsonl").read_text(encoding="utf-8") == "":
    fail("empty holds file is not empty/text-free")
summary=json.loads((ROOT/"summary.json").read_text(encoding="utf-8"))
if summary["crossDispositions"] != {"accept-current":194,"correction":24,"refinement":22,"hold":0}:
    fail("summary count mismatch")
if summary["head"]!=PIN_HEAD or summary["tree"]!=PIN_TREE:
    fail("summary pin mismatch")
before=json.loads((ROOT/"live-pr-before.json").read_text(encoding="utf-8"))
after=json.loads((ROOT/"live-pr-after.json").read_text(encoding="utf-8"))
for live in (before,after):
    if live.get("state")!="OPEN" or live.get("isDraft") is not True or live.get("mergeStateStatus")!="CLEAN" or live.get("headRefOid")!=PIN_HEAD or live.get("baseRefName")!="main":
        fail("live PR attestation mismatch")
if any(before.get(k)!=after.get(k) for k in ("state","isDraft","mergeStateStatus","headRefOid","headRefName","baseRefName","url")):
    fail("live PR state changed between captures")

# Validate complete bundle inventory/checksums. Manifest excludes itself and SHA list;
# SHA list includes manifest and all other files in the bundle.
manifest=json.loads((ROOT/"manifest.json").read_text(encoding="utf-8"))
manifest_paths={r["path"] for r in manifest["files"]}
actual_paths={p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file() and p.name not in ("manifest.json","SHA256SUMS.txt","/.build_cross.py")}
if manifest_paths != actual_paths:
    fail(f"manifest file set mismatch: missing={sorted(actual_paths-manifest_paths)} extra={sorted(manifest_paths-actual_paths)}")
for entry in manifest["files"]:
    p=ROOT/entry["path"]; data=p.read_bytes()
    if len(data)!=entry["bytes"] or sha_bytes(data)!=entry["sha256"]:
        fail("manifest hash/length mismatch: "+entry["path"])
entries={}
for line in (ROOT/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip(): continue
    digest,name=line.split("  ",1); entries[name]=digest
if len(entries)!=len(manifest_paths)+1 or entries.get("manifest.json")!=sha_bytes((ROOT/"manifest.json").read_bytes()):
    fail("SHA256SUMS manifest entry/count mismatch")
for name,digest in entries.items():
    p=ROOT/name
    if not p.is_file() or sha_bytes(p.read_bytes())!=digest:
        fail("SHA256SUMS digest mismatch: "+name)
print(json.dumps({
    "result":"PASS","head":PIN_HEAD,"tree":PIN_TREE,"sourceCount":20,"localeCount":12,"cells":240,
    "primaryProposals":len(p_props),"blindProposals":len(b_props),"proposalUnion":len(union),
    "overlap":len(intersection),"sameTarget":len(same),"differentTarget":len(different),
    "acceptCurrent":accept_count,"corrections":correct_count,"refinements":refine_count,"holds":hold_count,
    "baselineProtectedMismatchesResolved":resolved_protected,"selectedTokenMismatches":0,
    "incompletePrimaryFragmentsRejected":3,"checksums":len(entries),
    "inputVerifiers":{k:"PASS" for k in checks},
},ensure_ascii=False))
