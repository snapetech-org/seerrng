#!/usr/bin/env python3
import json,hashlib,re,sys
from collections import Counter
from pathlib import Path
R=Path(__file__).resolve().parent
S=Path("/home/keith/Documents/code/task-scratch")
I=S/"seerrng-pr418-w3660-3679-primary-20261103"/"candidate-free-input"
HEAD="eb279fc80be656f379cd893642bf741ba0a24d85"
TREE="85a73172719b38e99a4e74c0ef9a303164cb4fcb"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
def sha(b): return hashlib.sha256(b).hexdigest()
def shaf(p): return sha(p.read_bytes())
def jsonl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def key(r): return int(r["position"]),r["locale"]
def sums(d):
 n=0
 for line in (d/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
  if line.strip():
   expected,name=line.split(None,1); p=d/name.strip().lstrip("*")
   if not p.is_file() or shaf(p)!=expected: raise ValueError("checksum mismatch "+str(p))
   n+=1
 return n
def names(t): return re.findall(r"\{([A-Za-z][A-Za-z0-9_]*)\}",t)
def nums(t): return re.findall(r"(?<!\w)\d+(?:[.,]\d+)?%?(?!\w)",re.sub(r"\{[^{}]+\}","",t))
def marks(t): return re.findall(r"</?[A-Za-z][^<>]*>",t)
def main():
 m=json.loads((R/"manifest.json").read_text(encoding="utf-8"))
 if (m["head"],m["tree"])!=(HEAD,TREE): raise ValueError("manifest pin mismatch")
 for rel,exp in m["inputHashes"].items():
  if shaf(S/rel)!=exp: raise ValueError("input hash mismatch "+rel)
 for rel,exp in m["outputHashes"].items():
  if shaf(R/rel)!=exp: raise ValueError("output hash mismatch "+rel)
 inputChecks=sums(I); biChecks=sums(R/"blind-input"); outChecks=sums(R)
 if m["nativeSpeakerApproval"]!="not obtained": raise ValueError("native-speaker claim")
 src=jsonl(I/"source-cells.jsonl"); ctx=jsonl(I/"caller-contexts.jsonl")
 blocks=jsonl(I/"caller-context-blocks.jsonl"); rows=jsonl(R/"translation-ledger.jsonl")
 prompts=jsonl(R/"blind-input/translation-prompts.jsonl")
 prior=jsonl(R/"prior-hold-reattestation.jsonl")
 if len(src)!=20 or len(ctx)!=20 or len(rows)!=240 or len(prompts)!=20 or len(prior)!=12: raise ValueError("coverage count")
 if (R/"prior-hold-reattestation.jsonl").read_bytes()!=(I/"carry-forward-hold-hashes.jsonl").read_bytes(): raise ValueError("prior hold lineage differs")
 if any(x.get("retained") is not True or x.get("targetTextIncluded") is not False for x in prior): raise ValueError("prior hold status")
 sm={int(x["position"]):x for x in src}; cm={int(x["position"]):x for x in ctx}
 rm={key(x):x for x in rows}
 expected={(p,l) for p in range(3660,3680) for l in LOCALES}
 if set(rm)!=expected or len(rm)!=240: raise ValueError("cell key coverage")
 bm={x["contextId"]:x for x in blocks}
 for p in range(3660,3680):
  if cm[p]["callerCount"]<1 or any(x not in bm for x in cm[p]["contextBlockIds"]): raise ValueError("caller evidence "+str(p))
 for k,r in rm.items():
  s=sm[k[0]]; c=cm[k[0]]
  if r["sourceId"]!=s["sourceId"] or r["sourceSha256"]!=s["sourceSha256"] or r["source"]!=s["source"]: raise ValueError("source link "+repr(k))
  if r["callerContextBlockIds"]!=c["contextBlockIds"] or r["callerCount"]!=c["callerCount"]: raise ValueError("caller link "+repr(k))
  if r["reviewDisposition"]!="proposal" or "currentTarget" in r: raise ValueError("review disposition/separation "+repr(k))
  expected_blindness="target-exposure-limited" if k==(3660,"es") else "strictly-blind"
  if r.get("blindnessStatus")!=expected_blindness: raise ValueError("blindness status "+repr(k))
  if Counter(names(r["proposal"]))!=Counter(x["name"] for x in s["sourcePlaceholders"]): raise ValueError("placeholder mismatch "+repr(k))
  if Counter(marks(r["proposal"]))!=Counter(s["sourceMarkupTokens"]): raise ValueError("markup mismatch "+repr(k))
  if Counter(nums(r["proposal"]))!=Counter(s["sourceNumericTokens"]): raise ValueError("numeric mismatch "+repr(k))
  if any(r["proposal"].count(x)<1 for x in s["sourceProtectedLiterals"]): raise ValueError("protected literal missing "+repr(k))
  if s["sourceIcuPluralCategories"] and not r["technicalChecks"]["icuPluralCategories"]: raise ValueError("ICU plural mismatch "+repr(k))
  if r["proposalSha256"]!=sha(r["proposal"].encode("utf-8")): raise ValueError("proposal hash "+repr(k))
 att=json.loads((R/"PR-attestation.json").read_text(encoding="utf-8"))
 if (att["head"],att["tree"],att["state"],att["isDraft"])!=(HEAD,TREE,"OPEN",True): raise ValueError("live PR attestation mismatch")
 print(json.dumps({"result":"PASS","head":HEAD,"tree":TREE,"sourceCount":20,"localeCount":12,"proposalCells":len(rows),"strictlyBlindProposalCells":239,"targetExposureLimitedProposalCells":1,"reviewDispositionCounts":dict(Counter(x["reviewDisposition"] for x in rows)),"priorHoldsPreservedByHash":len(prior),"placeholderMismatchCount":0,"icuPluralCategoryMismatchCount":0,"markupMismatchCount":0,"numericTokenMismatchCount":0,"protectedLiteralMismatchCount":0,"candidateFreeChecksumFilesVerified":inputChecks,"blindInputChecksumFilesVerified":biChecks,"outputChecksumFilesVerified":outChecks},ensure_ascii=False,indent=2,sort_keys=True))
if __name__=="__main__":
 try: main()
 except Exception as e: print("FAIL: "+str(e),file=sys.stderr);sys.exit(1)
