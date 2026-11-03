#!/usr/bin/env python3
"""Build the sealed third-party reconciliation for SeerrNG PR #418 W3720-W3739."""
import collections, hashlib, json, re
from pathlib import Path

OUT = Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3720-3739-cross-audit-20261103")
INPUT = OUT / "candidate-free-input"
PRIMARY = OUT / "primary-packet" / "primary-review"
BLIND = OUT / "blind-packet" / "blind-review"
HEAD = "1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e"
TREE = "6a51f3fb1d1f65c12bfe82bf47834626aa364488"
WINDOW = "W3720-W3739"
LOCALES = ["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
HEADER = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?")
CAT = re.compile(r"(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{")
MARKUP = re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM = re.compile(r"(?<!\d)[+-]?\d+(?:[,. \u00a0\u202f]\d{3})*(?:%?)(?!\d)")

# Explicitly adjudicate every target-hash mismatch after source and caller review.
PICK = {}
def picks(pos, locales, reviewer):
    for locale in locales: PICK[(pos,locale)] = reviewer
picks(3720, ["es","zh_Hans","ja","ar","zh_Hant","vi","id"], "primary")
picks(3720, ["hi","de","fr","pt_BR","ko"], "blind")
picks(3721, ["ko"], "primary")
picks(3722, ["zh_Hans","ja","zh_Hant"], "primary")
picks(3723, ["de"], "current")
picks(3723, ["fr"], "blind")
picks(3724, ["ja","ko","vi"], "primary")
picks(3724, ["ar"], "current")
picks(3726, ["ko"], "primary")
picks(3727, ["id"], "current")
picks(3730, ["fr"], "primary")
picks(3734, ["de","fr"], "primary")
picks(3735, ["es","hi","ja","pt_BR","id"], "primary")
picks(3735, ["zh_Hant"], "blind")
picks(3736, ["vi","id"], "primary")
picks(3737, ["hi","pt_BR"], "blind")
picks(3737, ["ko"], "primary")
picks(3738, ["hi","pt_BR"], "blind")
picks(3738, ["de","ko"], "primary")
picks(3739, ["hi","pt_BR"], "blind")
picks(3739, ["de","ko"], "primary")

CONTEXT = {
3720: "This helper distinguishes Kapowarr GetComics and mirror checks after approval from indexers and SeerrNG's separate manual Prowlarr search; the permission phrase is the localized Manage Requests label.",
3721: "This is the External URL field label in the service form, so the selected wording names that field directly.",
3722: "This help text explains that a media-page URL remains clickable when the service hostname cannot be reached; it describes link behavior, not service availability.",
3723: "This is a compatibility and configuration note: FlareSolverr may be used with the service and its URL belongs in the corresponding settings field.",
3724: "This is the required Hostname or IP Address form label. The selected wording must preserve the IP concept and exact protected literal IP.",
3726: "This helper describes a root-folder path on the Kapowarr host or container and says Kapowarr creates a missing folder.",
3727: "This is the Root Folder field label; root identifies the configured path and should not be broadened to a generic main folder.",
3730: "This is the Enable Scan checkbox label, so it names the scan option as a singular setting.",
3734: "This is the success toast shown after validation succeeds; the text should read as a successful validation result.",
3735: "This is the required API-key validation message from the form schema; it should remain a concise required-field error.",
3736: "This is the URL validation message; the source indicates that the entered value is not a valid URL.",
3737: "The caller rejects values beginning with a slash (startsWith('/')); the message should identify a leading slash.",
3738: "The caller rejects values beginning with a slash (startsWith('/')); the message should identify the leading-slash condition.",
3739: "The caller rejects values ending with a slash (endsWith('/')); the message should identify a trailing slash.",
}
CURRENT_REASON = {
(3723,"de"): "I retained the current German target: it already states the FlareSolverr compatibility/configuration point clearly, and the competing phrasing adds no source-supported information.",
(3724,"ar"): "I retained the current Arabic label because it already represents the hostname/IP field and includes the required IP literal; the competing wording does not resolve a meaning error.",
(3727,"id"): "I retained the current Indonesian label because it preserves the root-folder concept; the competing main-folder wording would broaden the field meaning.",
}

def rj(p): return json.loads(p.read_text(encoding="utf-8"))
def rjl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha_bytes(s.encode("utf-8"))
def wj(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def wjl(p,x): p.write_text("".join(json.dumps(y,ensure_ascii=False,sort_keys=True)+"\n" for y in x),encoding="utf-8")
def icu_tokens(text):
    out=[]; i=0
    while i<len(text):
        if text[i]!="{": i+=1; continue
        start=i; depth=1; k=i+1
        while k<len(text) and depth:
            if text[k]=="{": depth+=1
            elif text[k]=="}": depth-=1
            k+=1
        if depth: break
        body=text[start+1:k-1]; m=HEADER.match(body)
        if m:
            name,fmt=m.group(1),m.group(2)
            cats=[x.group(1) for x in CAT.finditer(body[m.end():])] if fmt in ("plural","select","selectordinal") else []
            out.append({"name":name,"formatter":fmt or None,"pluralCategories":cats})
        i=k
    return out
def catmap(ts): return {x["name"]:sorted(x["pluralCategories"]) for x in ts if x["pluralCategories"]}
def num_values(s):
    s=re.sub(r"(?<!\w)(\d+)\s+mil\b",lambda m:str(int(m.group(1))*1000),s,flags=re.I)
    return [re.sub(r"\D","",x) for x in NUM.findall(s)]
def token_audit(c,target,b):
    source,current=c["source"],c["currentTarget"]
    si,ci,ti=icu_tokens(source),icu_tokens(current),icu_tokens(target)
    sp=[(x["name"],x["formatter"]) for x in si]; tp=[(x["name"],x["formatter"]) for x in ti]
    spl,tpl=catmap(si),catmap(ti); sm,tm=MARKUP.findall(source),MARKUP.findall(target)
    sn,tn=num_values(source),num_values(target); required=c["sourceProtectedLiterals"]
    missing=[x for x in required if x not in target]
    named=b.get("namedLiteralAudit",{}).get("sourceTerms",[])
    missing_named=[x for x in named if x not in target]
    permission=b.get("namedLiteralAudit",{}).get("localizedManageRequestsLabel") if c["position"]==3720 else None
    permission_ok=permission is None or permission in target
    return {
      "placeholders":{"source":sp,"selected":tp,"preservedInOrder":sp==tp},
      "icuPluralCategories":{"source":spl,"current":catmap(ci),"selected":tpl,"preserved":spl==tpl},
      "markup":{"source":sm,"selected":tm,"preserved":sm==tm},
      "numericValues":{"source":sn,"current":num_values(current),"selected":tn,"preserved":sn==tn},
      "protectedLiterals":{"requiredFromSource":required,"selectedPresent":[x for x in required if x in target],"missing":missing},
      "namedBrandTerms":{"required":named,"missing":missing_named},
      "localizedManageRequestsLabel":{"required":permission,"present":permission_ok},
      "allChecksPass":sp==tp and spl==tpl and sm==tm and sn==tn and not missing and not missing_named and permission_ok,
    }

def main():
    pr=rjl(PRIMARY/"primary-ledger.jsonl"); br=rjl(BLIND/"blind-ledger.jsonl"); cr=rjl(INPUT/"current-target-cells.jsonl")
    sr={x["position"]:x for x in rjl(INPUT/"source-cells.jsonl")}
    cx={x["position"]:x for x in rjl(INPUT/"caller-contexts.jsonl")}
    blocks=collections.defaultdict(list); route_blocks=[]
    for x in rjl(INPUT/"caller-context-blocks.jsonl"):
        if "sourcePosition" in x: blocks[x["sourcePosition"]].append(x)
        else: route_blocks.append(x)
    P={(x["position"],x["locale"]):x for x in pr}; B={(x["position"],x["locale"]):x for x in br}; C={(x["position"],x["locale"]):x for x in cr}
    if len(P)!=240 or len(B)!=240 or len(C)!=240 or set(P)!=set(B) or set(P)!=set(C): raise SystemExit("FAIL: 240-cell coverage mismatch")
    if len(PICK)!=46: raise SystemExit("FAIL: explicit map is not 46 rows")
    ledger=[]
    same_fields=("sourceId","source","sourceSha256","currentTarget","currentTargetSha256","catalogPath","catalogGitBlob")
    for key in sorted(C,key=lambda x:(x[0],LOCALES.index(x[1]))):
        c,p,b=C[key],P[key],B[key]
        if any(p[f]!=b[f] or c[f]!=p[f] for f in same_fields) or c["catalogSha256"]!=p["catalogSha256"] or c["catalogSha256"]!=b["catalogFileSha256"]: raise SystemExit(f"FAIL: source/current/catalog preimage mismatch {key}")
        if any(x[f]!=v for x in (c,p,b) for f,v in (("head",HEAD),("tree",TREE))): raise SystemExit(f"FAIL: exact head/tree pin mismatch {key}")
        td=p["selectedTarget"]!=b["selectedTarget"]; dd=p["decision"]!=b["disposition"]
        chosen="consensus"; basis="primary and blind target consensus"
        if td:
            chosen=PICK.get(key)
            if not chosen: raise SystemExit(f"FAIL: unadjudicated target disagreement {key}")
            basis="cross-audit retained current value" if chosen=="current" else f"cross-audit selected {chosen} target after source/caller review"
            target={"current":c["currentTarget"],"primary":p["selectedTarget"],"blind":b["selectedTarget"]}[chosen]
            if chosen=="current": disp="accept-current"
            else: disp=p["decision"] if chosen=="primary" else b["disposition"]
        else:
            target=p["selectedTarget"]
            if target==c["currentTarget"]: disp="accept-current"
            elif p["decision"]==b["disposition"]: disp=p["decision"]
            elif "correction" in (p["decision"],b["disposition"]):
                disp="correction"; basis="shared target; correction label retained because one review identified a source-meaning error"
            else:
                disp="refinement"; basis="shared target; refinement label retained"
        if (target==c["currentTarget"]) != (disp=="accept-current"): raise SystemExit(f"FAIL: disposition/target mismatch {key}")
        th=sha_text(target)
        if chosen=="primary" and th!=p["selectedTargetSha256"]: raise SystemExit(f"FAIL: primary selected hash {key}")
        if chosen=="blind" and th!=b["selectedTargetSha256"]: raise SystemExit(f"FAIL: blind selected hash {key}")
        if chosen=="current" and th!=c["currentTargetSha256"]: raise SystemExit(f"FAIL: current selected hash {key}")
        call=cx[key[0]]; cb=blocks[key[0]]
        if call["sourceId"]!=c["sourceId"] or call["sourceSha256"]!=c["sourceSha256"] or not call["callerCount"]: raise SystemExit(f"FAIL: caller row mismatch {key}")
        if any(x["sourceId"]!=c["sourceId"] or x["sourcePosition"]!=key[0] for x in cb): raise SystemExit(f"FAIL: caller blocks mismatch {key}")
        audit=token_audit(c,target,b)
        if not audit["allChecksPass"]: raise SystemExit(f"FAIL: token/literal check {key}: {audit}")
        ctx=CONTEXT.get(key[0],"The primary and blind targets are compared with the pinned source and direct caller context included in this row.")
        if chosen=="current": rationale=CURRENT_REASON[key]
        elif td:
            selected_reason=p["rationale"] if chosen=="primary" else b["rationale"]
            other=b if chosen=="primary" else p
            rationale=f"{ctx} I selected the {chosen} target after comparing both proposals and current. Selected-review rationale: {selected_reason} Competing-review rationale: {other['rationale']} Exact selected text, hash, and caller evidence are recorded in this row."
        elif dd:
            rationale=f"{ctx} Both reviews chose the identical target. I classify it as {disp}: {basis}."
        elif target!=c["currentTarget"]:
            rationale=f"{ctx} Primary and blind independently chose the same target and disposition. Primary rationale: {p['rationale']} Blind rationale: {b['rationale']}"
        else:
            rationale=f"No primary/blind target disagreement; both selected current hash {th}. {ctx}"
        row={
          "schema":"seerrng-cross-audit-cell/v1","repository":"snapetech-org/seerrng","pullRequest":418,"window":WINDOW,"head":HEAD,"tree":TREE,
          "position":key[0],"sourceId":c["sourceId"],"sourceIdSha256":c["sourceIdSha256"],"source":c["source"],"sourceSha256":c["sourceSha256"],
          "locale":key[1],"localeTag":c["localeTag"],"catalogPath":c["catalogPath"],"catalogGitBlob":c["catalogGitBlob"],"catalogSha256":c["catalogSha256"],
          "currentTarget":c["currentTarget"],"currentTargetSha256":c["currentTargetSha256"],
          "primary":{"decision":p["decision"],"selectedTarget":p["selectedTarget"],"selectedTargetSha256":p["selectedTargetSha256"],"rationale":p["rationale"]},
          "blind":{"disposition":b["disposition"],"selectedTarget":b["selectedTarget"],"selectedTargetSha256":b["selectedTargetSha256"],"rationale":b["rationale"],"namedLiteralAudit":b["namedLiteralAudit"]},
          "primaryBlindTargetDisagreement":td,"primaryBlindDispositionDisagreement":dd,
          "crossAuditDisposition":disp,"selectedTarget":target,"selectedTargetSha256":th,"selectionSource":chosen,"decisionBasis":basis,"auditRationale":rationale,
          "callerEvidence":{"callerResolution":call["callerResolution"],"callerCount":call["callerCount"],"definitionFiles":call["definitionFiles"],"directMessageReferences":call["directMessageReferences"],"contextBlockIds":call["contextBlockIds"],"pinnedContextBlocks":cb,"componentRoutingEvidence":route_blocks},
          "tokenAudit":audit,
        }
        ledger.append(row)
    actual_td={(x["position"],x["locale"]) for x in ledger if x["primaryBlindTargetDisagreement"]}
    if actual_td!=set(PICK): raise SystemExit(f"FAIL: map/disagreement mismatch; missing={actual_td-set(PICK)} extra={set(PICK)-actual_td}")
    td_rows=[x for x in ledger if x["primaryBlindTargetDisagreement"]]
    dd_rows=[x for x in ledger if x["primaryBlindDispositionDisagreement"]]
    changed=[x for x in ledger if x["selectedTargetSha256"]!=x["currentTargetSha256"]]
    shared=[x for x in ledger if x["primary"]["selectedTarget"]==x["blind"]["selectedTarget"] and x["selectedTargetSha256"]!=x["currentTargetSha256"]]
    # Reattest all carried hash-only holds against input, primary and blind packets.
    ci=rjl(INPUT/"carry-forward-hold-hashes.jsonl"); pc=rjl(PRIMARY/"carried-holds-reattestation.jsonl"); bc=rjl(BLIND/"carry-forward-hold-reattestation.jsonl")
    pm={(x["position"],x["locale"],x["sourceId"]):x for x in pc}; bm={(x["position"],x["locale"],x["sourceId"]):x for x in bc}; carry=[]
    for x in ci:
        k=(x["position"],x["locale"],x["sourceId"]); a=pm[k]; b=bm[k]
        if not x["retained"] or not a["hashesAgree"] or not b["matches"]: raise SystemExit(f"FAIL: hold not retained {k}")
        hashes={x["priorTargetSha256"],x["currentTargetSha256"],x["previousApplicationTargetSha256"],a["currentTargetSha256"],b["currentTargetSha256"]}
        if len(hashes)!=1: raise SystemExit(f"FAIL: carried hold hash chain {k}")
        carry.append({"position":x["position"],"locale":x["locale"],"sourceId":x["sourceId"],"sourceSha256":x["sourceSha256"],"originWindow":x["originWindow"],"carriedViaWindow":x["carriedViaWindow"],"currentTargetSha256":x["currentTargetSha256"],"previousApplicationTargetSha256":x["previousApplicationTargetSha256"],"retained":True,"callerless":True,"targetTextIncluded":False,"candidateFreeHashReattestation":True,"primaryHashReattestation":True,"blindHashReattestation":True})
    if len(carry)!=12: raise SystemExit("FAIL: carried hold count")
    baseline=collections.Counter(); selected=collections.Counter()
    for row in ledger:
        c=C[(row["position"],row["locale"])]
        si,ci2=icu_tokens(c["source"]),icu_tokens(c["currentTarget"])
        baseline["placeholder"]+=int([(x["name"],x["formatter"]) for x in si]!=[(x["name"],x["formatter"]) for x in ci2])
        baseline["markup"]+=int(MARKUP.findall(c["source"])!=MARKUP.findall(c["currentTarget"]))
        baseline["numeric"]+=int(num_values(c["source"])!=num_values(c["currentTarget"]))
        baseline["protectedLiteral"]+=int(any(z not in c["currentTarget"] for z in c["sourceProtectedLiterals"]))
        a=row["tokenAudit"]
        selected["placeholder"]+=int(not a["placeholders"]["preservedInOrder"])
        selected["icuPluralCategories"]+=int(not a["icuPluralCategories"]["preserved"])
        selected["markup"]+=int(not a["markup"]["preserved"])
        selected["numeric"]+=int(not a["numericValues"]["preserved"])
        selected["protectedLiteral"]+=int(bool(a["protectedLiterals"]["missing"]))
    if dict(baseline)!={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1}: raise SystemExit(f"FAIL: baseline mismatch {dict(baseline)}")
    if any(selected.values()): raise SystemExit(f"FAIL: selected token failure {dict(selected)}")
    if (len(td_rows),len(dd_rows),len(changed),len(shared))!=(46,28,50,7): raise SystemExit(f"FAIL: counts target={len(td_rows)} disposition={len(dd_rows)} changed={len(changed)} shared={len(shared)}")
    wjl(OUT/"cross-audit-ledger.jsonl",ledger); wjl(OUT/"target-disagreements.jsonl",td_rows); wjl(OUT/"changed-selections.jsonl",changed); wjl(OUT/"carried-hold-reattestation.jsonl",carry)
    summary={
      "schema":"seerrng-cross-audit-summary/v1","repository":"snapetech-org/seerrng","pullRequest":418,"window":WINDOW,"head":HEAD,"tree":TREE,
      "cellCount":len(ledger),"localeCount":12,"sourceCount":20,
      "primaryDecisionCounts":dict(collections.Counter(x["decision"] for x in pr)),
      "blindDispositionCounts":dict(collections.Counter(x["disposition"] for x in br)),
      "crossDispositionCounts":dict(collections.Counter(x["crossAuditDisposition"] for x in ledger)),
      "primaryBlindTargetDisagreements":len(td_rows),"primaryBlindDispositionDisagreements":len(dd_rows),
      "targetDisagreementsAlsoDispositionDisagreements":sum(x["primaryBlindDispositionDisagreement"] for x in td_rows),
      "primaryBlindSharedChangedTargets":len(shared),"selectedTargetChanges":len(changed),"retainedCurrent":len(ledger)-len(changed),"newWindowHolds":0,
      "selectionSourcesAllCells":dict(collections.Counter(x["selectionSource"] for x in ledger)),
      "selectionSourcesAmongTargetDisagreements":dict(collections.Counter(x["selectionSource"] for x in td_rows)),
      "carriedCallerlessHoldsReattested":len(carry),"priorWindowSelectionsReattestedByInput":3720,
      "baselineTokenMismatches":dict(baseline),"selectedTokenOrProtectedLiteralFailures":dict(selected),
      "namedBrandLiteralFailures":0,"localizedManageRequestsLabelFailures":0,
      "baselineProtectedLiteralCorrection":{"position":3724,"locale":"hi","missingFromCurrent":["IP"],"selectedTargetContainsIP":True},
      "nativeSpeakerReviewPerformed":False,"browserReviewPerformed":False,
      "confidence":"moderate; source/caller semantic audit, no qualified native-speaker signoff",
    }
    wj(OUT/"cross-audit-summary.json",summary)
    report=(
      "# SeerrNG PR #418 W3720-W3739 third-party cross-audit\n\n"
      f"Pinned at head {HEAD} and tree {TREE}. The ledger includes all 240 cells, both review proposals and rationales, exact selected target hashes, source/caller evidence, and token/literal checks.\n\n"
      "## Reconciliation\n\n"
      f"Primary counts: {summary['primaryDecisionCounts']}. Blind counts: {summary['blindDispositionCounts']}. Cross counts: {summary['crossDispositionCounts']}.\n\n"
      f"The reviews differed on {len(td_rows)} target hashes and {len(dd_rows)} dispositions. The cross-audit selects {len(changed)} exact-hash changes and retains {len(ledger)-len(changed)} current values. Both reviews share {len(shared)} of the changed targets. Three target disagreements retain current values: de/3723, ar/3724, and id/3727.\n\n"
      "All 12 callerless position-3632 holds remain carried forward by exact hash equality; this window adds no holds. Hindi 3724 current text omitted protected literal IP; the selected correction restores it. No selected placeholder, ICU category, markup, numeric, protected literal, named-brand, or localized Manage Requests label checks failed.\n\n"
      "## Caller-based decisions\n\n"
      "- Position 3720 preserves the difference between Kapowarr's automatic post-approval GetComics/mirror check and SeerrNG's separate manual Prowlarr search, including the exact localized Manage Requests label.\n"
      "- Positions 3737 and 3738 refer to the caller's leading-slash rejection; 3739 refers to its trailing-slash rejection.\n"
      "- The Indonesian 3727 proposal broadening Root Folder to main folder was not selected; the current root-folder wording is retained.\n\n"
      "## Checks and limits\n\n"
      "Candidate-free, primary, and blind packets and checksum manifests are included. The root verifier reruns nested checks against the pinned checkout. Before/after live attestations record OPEN/DRAFT, exact head/tree, branch and pull refs, and base-ref divergence. PR body was not edited. No repo/PR changes, tests, builds, scans, CI, browser review or workflow changes were performed. Qualified native-speaker review was not performed.\n"
    )
    (OUT/"reconciliation-report.md").write_text(report,encoding="utf-8")
    readme=(
      "# Portable SeerrNG W3720-W3739 cross-audit packet\n\n"
      f"Evidence for snapetech-org/seerrng PR #418 at head {HEAD}, tree {TREE}.\n\n"
      "Includes byte-preserved candidate-free, primary, and blind packets; before/after PR/ref attestations; a 240-cell reconciliation ledger; 46 target disagreements; 50 changed selections; carried holds; token/literal checks; a builder and portable verifier.\n\n"
      "Verify checksums and invariants (with nested verifier reruns):\n\n"
      "    python3 verify_cross_audit.py --repo /path/to/pinned/seerrng/checkout\n"
      "    sha256sum -c SHA256SUMS.txt\n\n"
      "All 12 callerless holds at position 3632 remain hash-only; target text is omitted. This packet does not apply selected values. Native-speaker and browser review were not performed.\n"
    )
    (OUT/"README.md").write_text(readme,encoding="utf-8")
    print(json.dumps({"result":"BUILT","cells":len(ledger),"targetDisagreements":len(td_rows),"dispositionDisagreements":len(dd_rows),"changes":len(changed),"sharedChanged":len(shared),"crossCounts":summary["crossDispositionCounts"],"baseline":dict(baseline),"selectedFailures":dict(selected)},ensure_ascii=False,indent=2))

if __name__=="__main__": main()
