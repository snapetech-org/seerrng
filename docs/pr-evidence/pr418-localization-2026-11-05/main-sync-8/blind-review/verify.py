#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, collections, sys
ROOT=Path(__file__).resolve().parent
INPUT=ROOT.parent/"candidate-free"
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def fail(msg): print("FAIL:",msg); sys.exit(1)
# Check original candidate-free packet checksums and exact pins.
for name in ("README.md","manifest.json","candidate-free.jsonl","SHA256SUMS.txt"):
    p=INPUT/name
    if not p.exists(): fail(f"missing input {p}")
input_manifest=json.loads((INPUT/"manifest.json").read_text())
if input_manifest["review_head"]!="ca2309e960733a7486c55b9a761d82771be97cde" or input_manifest["review_tree"]!="8c5df06aaf1d703ff923bf1fdf8a21c901b9d26d": fail("input pin mismatch")
for line in (INPUT/"SHA256SUMS.txt").read_text().splitlines():
    digest,name=line.split(None,1); name=name.strip()
    if sha(INPUT/name)!=digest: fail(f"input checksum mismatch: {name}")
source=[json.loads(x) for x in (INPUT/"candidate-free.jsonl").read_text().splitlines()]
ledger=[json.loads(x) for x in (ROOT/"blind-ledger.jsonl").read_text().splitlines()]
byid={x["id"]:x for x in source}
if len(source)!=8 or len(ledger)!=96: fail("source/cell count mismatch")
locales=input_manifest["locale_order"]
expected={(s["id"],l) for s in source for l in locales}
if {(r["source_id"],r["locale"]) for r in ledger}!=expected: fail("coverage/uniqueness mismatch")
report=json.loads((ROOT/"token-audit.json").read_text())
report_by={(x["source_id"],x["locale"]):x for x in report["results"]}
if len(report_by)!=96: fail("token audit cell count mismatch")
for r in ledger:
    s=byid[r["source_id"]]
    if r["input_head"]!=input_manifest["review_head"] or r["input_tree"]!=input_manifest["review_tree"]: fail("row pin mismatch")
    for field,got in (("source_text",s["source"]),("source_sha256",s["source_sha256"]),("caller_path",s["caller"]["path"]),("caller_line",s["caller"]["line"]),("caller_context_sha256",s["caller"]["context_sha256"])):
        if r[field]!=got: fail(f"{r['source_id']}:{r['locale']} provenance mismatch {field}")
    if s["target_cells"][r["locale"]]["present"] or r["target_present_at_input"] or r["old_target"] is not None: fail("target-free input claim mismatch")
    if not r["proposal"].strip(): fail("empty proposal")
    required=collections.Counter(r["protected_literals_expected"])
    actual={tok:r["proposal"].count(tok) for tok in required}
    missing={tok:n-actual[tok] for tok,n in required.items() if actual[tok]<n}
    if r["protected_literals_expected_counts"]!=dict(required) or r["protected_literals_actual_counts"]!=actual or r["protected_literals_missing_counts"]!=missing: fail(f"row token count mismatch {r['source_id']}:{r['locale']}")
    cell=report_by[(r["source_id"],r["locale"])]
    if cell["expected_counts"]!=dict(required) or cell["actual_counts"]!=actual or cell["missing_counts"]!=missing or cell["result"]!=("pass" if not missing else "fail"): fail("token report does not match ledger")
if not report["pass"] or any(x["result"]!="pass" for x in report["results"]): fail("token audit failed")
# Check the sealed output packet checksums (the checksum file excludes itself).
for line in (ROOT/"SHA256SUMS.txt").read_text().splitlines():
    digest,name=line.split(None,1); name=name.strip()
    if sha(ROOT/name)!=digest: fail(f"output checksum mismatch: {name}")
print("PASS: input pins/checksums, 96 unique cells, source/caller provenance, absent-target claims, exact protected-literal counts, and output checksums")
