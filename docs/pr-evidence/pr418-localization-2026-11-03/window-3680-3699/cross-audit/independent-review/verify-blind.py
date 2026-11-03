#!/usr/bin/env python3
import hashlib,json,re
from pathlib import Path
R=Path(__file__).resolve().parent
I=R.parent/"evidence/candidate-free-input"
sha=lambda b:hashlib.sha256(b).hexdigest()
def j(p):return json.loads(p.read_text(encoding="utf-8"))
def jl(p):return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def nums(text,locale):
 spans=[];lo=text.lower()
 if locale=="pt_BR":
  for m in re.finditer(r"(?<![A-Za-z0-9])(\d+(?:[.,]\d+)?)\s*mil\b",lo):
   spans.append((m.start(),m.end(),int(float(m.group(1).replace(",","."))*1000)))
 mask=list(text)
 for a,b,_ in spans:
  for i in range(a,b):mask[i]=" "
 for m in re.finditer(r"(?<![A-Za-z0-9])\d+(?:(?:,|\.|\u00a0|\u202f| )\d{3})*(?![A-Za-z0-9])","".join(mask)):
  spans.append((m.start(),m.end(),int(re.sub(r"[,.\u00a0\u202f ]","",m.group(0)))))
 return [v for _,_,v in sorted(spans)]
# Verify every candidate-free file against its manifest and checksum list.
im=j(I/"manifest.json")
for f in im["files"]:
 p=I/f["path"];assert p.is_file() and p.stat().st_size==f["byteCount"] and sha(p.read_bytes())==f["sha256"],f["path"]
listed={}
for line in (I/"SHA256SUMS.txt").read_text().splitlines():
 h,n=line.split(None,1);listed[n.lstrip("* ")]=h
actual={p.relative_to(I).as_posix() for p in I.rglob("*") if p.is_file() and p.relative_to(I)!=Path("SHA256SUMS.txt")}
assert set(listed)==actual
for name,h in listed.items():assert sha((I/name).read_bytes())==h,name
m=j(R/"manifest.json");s=j(R/"summary.json")
assert m["primaryDirectoryOpened"] is False and m["primaryCandidateOrDecisionExposed"] is False
assert m["reviewSealState"]=="sealed before opening primary"
assert m["head"]==im["head"]=="a2f015c040f933eff38e6ef3d9b1ac6050c4957d"
assert m["tree"]==im["tree"]=="9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe"
assert sha((R.parent/"before-live-attestation.json").read_bytes())==m["beforeLiveAttestationSha256"]
entries=[]
for line in (R/"SHA256SUMS.txt").read_text().splitlines():
 h,n=line.split("  ",1);entries.append((n,h))
assert {n for n,h in entries}=={p.name for p in R.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
for n,h in entries:assert sha((R/n).read_bytes())==h,n
sources={x["position"]:x for x in jl(I/"source-cells.jsonl")}
contexts={x["position"]:x for x in jl(I/"caller-contexts.jsonl")}
blocks={x["contextId"]:x for x in jl(I/"caller-context-blocks.jsonl")}
cells={(x["position"],x["locale"]):x for x in jl(I/"current-target-cells.jsonl")}
rows=jl(R/"blind-ledger.jsonl");locales=j(I/"window.json")["localeOrder"]
assert len(rows)==len(cells)==240
assert [(x["position"],x["locale"]) for x in rows]==[(p,l) for p in range(3680,3700) for l in locales]
seen=set()
for r in rows:
 k=(r["position"],r["locale"]);assert k not in seen;seen.add(k)
 c=cells[k];src=sources[k[0]];ctx=contexts[k[0]]
 expectedBlocks=[blocks[x] for x in ctx["contextBlockIds"]]
 assert r["sourceId"]==src["sourceId"]==c["sourceId"]
 assert r["sourceIdSha256"]==src["sourceIdSha256"]==c["sourceIdSha256"]
 assert r["source"]==src["source"]==c["source"] and r["sourceSha256"]==src["sourceSha256"]==c["sourceSha256"]
 assert r["currentTarget"]==c["currentTarget"] and r["currentTargetSha256"]==c["currentTargetSha256"]
 assert r["catalogEvidence"]["path"]==c["catalogPath"] and r["catalogEvidence"]["sha256"]==c["catalogSha256"] and r["catalogEvidence"]["gitBlob"]==c["catalogGitBlob"]
 caller=r["callerEvidence"]
 assert caller["callerCount"]==ctx["callerCount"]>0 and caller["callerResolution"]==ctx["callerResolution"]
 assert caller["contextBlockIds"]==ctx["contextBlockIds"] and caller["directMessageReferences"]==ctx["directMessageReferences"]
 assert caller["contextBlocks"]==expectedBlocks
 assert caller["callerContextSha256"]==sha(canon({"context":ctx,"blocks":expectedBlocks}).encode("utf-8"))
 t=r["reviewedTarget"];a=r["tokenAudit"]
 assert r["reviewedTargetSha256"]==sha(t.encode("utf-8"))
 assert r["sourceIdSha256"]==sha(src["sourceId"].encode("utf-8")) and r["sourceSha256"]==sha(src["source"].encode("utf-8"))
 assert a["sourcePlaceholders"]==src["sourcePlaceholders"]
 assert a["reviewedPlaceholderNames"]==re.findall(r"\{([A-Za-z][A-Za-z0-9_]*)\}",t)
 assert a["placeholderSequenceMatches"] and a["reviewedPlaceholderNames"]==[x["name"] for x in src["sourcePlaceholders"]]
 assert a["sourceIcuPluralCategories"]==src["sourceIcuPluralCategories"]=={}
 assert a["icuCategoriesPreserved"] is True
 assert a["sourceMarkupTokens"]==src["sourceMarkupTokens"] and a["reviewedMarkupTokens"]==re.findall(r"</?[A-Za-z][^>]*>",t) and a["markupPreserved"] is True
 assert a["reviewedNumericValues"]==[{"start":x["start"],"end":x["end"],"value":x["value"],"surfaceType":x["surfaceType"]} for x in a["reviewedNumericValues"]]
 assert nums(src["source"],r["locale"])==nums(t,r["locale"])
 assert [int(x) for x in c["sourceNumericValues"]]==nums(src["source"],r["locale"])
 assert [int(x) for x in c["currentTargetNumericValues"]]==nums(c["currentTarget"],r["locale"])
 assert nums(t,r["locale"])==[x["value"] for x in a["reviewedNumericValues"]]
 assert a["numericValuesMatch"] is True
 prot=src["sourceProtectedLiterals"]
 assert a["sourceProtectedLiterals"]==prot and all(t.count(x)>=src["sourceProtectedLiterals"].count(x) for x in set(prot))
 assert all(a["reviewedProtectedLiteralsPresent"].values()) and a["protectedLiteralsPreserved"] is True
 if r["disposition"]=="accept-current":assert t==c["currentTarget"]
 else:assert r["disposition"] in ("correction","refinement","hold")
 assert r["primaryCandidateOrDecisionExposed"] is False and r["nativeSpeakerApproval"] is False
assert seen=={(p,l) for p in range(3680,3700) for l in locales}
counts={d:sum(x["disposition"]==d for x in rows) for d in ("accept-current","correction","refinement","hold")}
assert counts==s["dispositions"]==m["dispositions"]=={"accept-current":218,"correction":10,"refinement":12,"hold":0}
# Reattest the carried callerless position 3632 from its exact prior/current target hashes only.
holds=jl(R/"prior-hold-reattestation.jsonl")
lin=j(I/"lineage/hold-lineage.json")
assert len(holds)==len(lin["carryForwardHoldRows"])==12
assert all(x["position"]==3632 and x["retained"] is True and x["callerless"] is True and x["targetTextIncluded"] is False and x["priorTargetSha256"]==x["currentTargetSha256"] for x in holds)
assert {(x["locale"],x["currentTargetSha256"]) for x in holds}=={(x["locale"],x["currentTargetSha256"]) for x in lin["carryForwardHoldRows"]}
assert s["priorHoldsReattested"]==12 and s["unchangedPriorHolds"]==12
# Explicit check for the two Hindi protected API literals.
for p in (3697,3698):
 r=next(x for x in rows if x["position"]==p and x["locale"]=="hi")
 assert "API" in r["reviewedTarget"] and "API" in r["tokenAudit"]["sourceProtectedLiterals"]
# Check numeric normalization examples and the pt-BR word form.
r=next(x for x in rows if x["position"]==3693 and x["locale"]=="pt_BR")
assert nums(r["source"],"pt_BR")==nums(r["reviewedTarget"],"pt_BR")==[10000]
assert "10 mil" in r["reviewedTarget"] or "10 mil" in r["currentTarget"]
print(json.dumps({"result":"PASS","head":m["head"],"tree":m["tree"],"cells":len(rows),"dispositions":counts,"priorHoldsUnchanged":len(holds),"normalizedNumericCells":sum(bool(x["tokenAudit"]["reviewedNumericValues"]) for x in rows),"ptBRTenMil":"10 mil = 10000","resolvedHindiProtectedAPICells":2,"inputFilesVerified":len(listed),"checksumEntries":len(entries),"checksumListSha256":sha((R/"SHA256SUMS.txt").read_bytes()),"manifestSha256":sha((R/"manifest.json").read_bytes())},ensure_ascii=False,indent=2))

