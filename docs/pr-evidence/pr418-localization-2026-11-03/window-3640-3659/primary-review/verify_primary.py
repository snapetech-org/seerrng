#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
I=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-primary-20261103/candidate-free-input")
HEADER=re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?")
CAT=re.compile(r"(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{")
MK=re.compile(r"</?[A-Za-z][^<>]*?/?>")
NUM=re.compile(r"(?<!\d)[+-]?\d+(?:[.,]\d+)*(?:%?)(?!\d)")
PROTECTED=["SeerrNG","Audiobookshelf","ISBN","API","URL","HTTP","HTTPS","IP","SSL","BackIssue","Bindery","BookshelfNG","ComicVine","Plex","Jellyfin","BINDERY_ENFORCE_TENANCY","Auto-approve requests","library.view","library.manage","downloads.grab"]
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode("utf-8")).hexdigest()
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def icu(s):
 out=[]; i=0
 while i<len(s):
  if s[i]!="{": i+=1; continue
  start=i; depth=1; k=i+1
  while k<len(s) and depth:
   if s[k]=="{": depth+=1
   elif s[k]=="}": depth-=1
   k+=1
  if depth: break
  body=s[start+1:k-1]; m=HEADER.match(body)
  if m:
   name,fmt=m.group(1),m.group(2); cats=[]
   if fmt in ("plural","select","selectordinal"): cats=[x.group(1) for x in CAT.finditer(body[m.end():])]
   out.append({"name":name,"formatter":fmt or None,"pluralCategories":cats})
  i=k
 return out
def catmap(ts): return {x["name"]:sorted(x["pluralCategories"]) for x in ts if x["pluralCategories"]}
def sig(ts): return [(x["name"],x["formatter"]) for x in ts]
def numval(token,source_ref):
 if re.fullmatch(r"\d{1,3},\d{3}",source_ref):
  return re.sub(r"\D","",token)
 if re.fullmatch(r"\d{1,3}[.]\d{3}",token): return re.sub(r"\D","",token)
 if re.fullmatch(r"\d{1,3},\d{3}",token): return re.sub(r"\D","",token)
 return token.replace(",","")
def numeric_values(src,tgt):
 if len(src)!=len(tgt): return None,None
 if not src: return [],[]
 return [numval(v,src[i]) for i,v in enumerate(src)],[numval(v,src[i]) for i,v in enumerate(tgt)]
def plural_runtime(tags):
 code="const tags="+json.dumps(tags)+"; console.log(JSON.stringify({node:process.version,icu:process.versions.icu,categories:Object.fromEntries(tags.map(t=>[t,[...new Intl.PluralRules(t).resolvedOptions().pluralCategories].sort()]))}));"
 p=subprocess.run(["node","-e",code],capture_output=True,text=True)
 assert p.returncode==0,p.stderr
 return json.loads(p.stdout)
check=subprocess.run([sys.executable,str(I.parent/"verify_candidate_free.py")],capture_output=True,text=True)
assert check.returncode==0,check.stdout+check.stderr
im=j(I/"manifest.json"); w=j(I/"window.json"); m=j(O/"manifest.json")
assert m["inputManifestSha256"]==sha((I/"manifest.json").read_bytes())
assert m["inputChecksumListSha256"]==sha((I/"SHA256SUMS.txt").read_bytes())
assert (m["repository"],m["pullRequest"],m["window"],m["head"],m["tree"])==(im["repository"],im["pullRequest"],im["window"],im["head"],im["tree"])
actual={p.relative_to(O).as_posix() for p in O.rglob("*") if p.is_file()}
mf={x["path"]:x for x in m["files"]}
assert set(mf)==actual-{"manifest.json","SHA256SUMS.txt"}
for n,x in mf.items():
 b=(O/n).read_bytes(); assert len(b)==x["byteCount"] and sha(b)==x["sha256"],n
sums={}
for line in (O/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
 d,n=line.split(None,1); n=n.strip().lstrip("*"); sums[n]=d
assert set(sums)==actual-{"SHA256SUMS.txt"}
for n,d in sums.items(): assert sha((O/n).read_bytes())==d,n
sources=jl(I/"source-cells.jsonl"); current=jl(I/"current-target-cells.jsonl"); contexts=jl(I/"caller-contexts.jsonl"); blocks=jl(I/"caller-context-blocks.jsonl")
rows=jl(O/"primary-ledger.jsonl")
assert len(sources)==20 and len(current)==len(rows)==240 and len(contexts)==20
source_by_pos={x["position"]:x for x in sources}; current_by_key={(x["position"],x["locale"]):x for x in current}
context_by_key={(x["position"],x["sourceId"]):x for x in contexts}; block_by_id={x["contextId"]:x for x in blocks}
locale_info={x["catalogKey"]:x for x in w["localeInfo"]}
runtime=plural_runtime([x["tag"] for x in w["localeInfo"]])
ri=j(O/"runtime-icu-categories.json")
assert ri==runtime,"recorded ICU runtime category evidence does not reproduce"
seen=set(); counts=Counter(); confidences=Counter(); baseline=Counter(); reviewed=Counter()
for r in rows:
 key=(r["position"],r["locale"]); assert key not in seen; seen.add(key)
 s=source_by_pos[key[0]]; c=current_by_key[key]; cx=context_by_key[(key[0],s["sourceId"])]
 loc=locale_info[key[1]]; blocks_expected=[block_by_id[q] for q in cx["contextBlockIds"]]
 assert (r["repository"],r["pullRequest"],r["head"],r["tree"],r["window"])==(im["repository"],im["pullRequest"],im["head"],im["tree"],im["window"])
 for f in ("position","sourceId","sourceIdSha256","source","sourceSha256","namespace","sourceKey","sourcePlaceholders","sourceIcuPluralCategories","sourceMarkupTokens","sourceNumericTokens","sourceProtectedLiterals"):
  input_f={"sourcePlaceholders":"sourcePlaceholders"}.get(f,f)
  assert r[f]==s[input_f],(key,f)
 for f in ("currentTarget","currentTargetSha256","catalogPath","catalogSha256","catalogGitBlob","locale","localeTag","reviewStatus"):
  assert r[f]==c[f],(key,f)
 assert r["localeTag"]==loc["tag"] and r["catalogPath"]==c["catalogPath"]
 assert r["callerContext"]==cx and r["callerContextBlocks"]==blocks_expected
 assert r["callerContextSha256"]==sha(json.dumps(cx,ensure_ascii=False,sort_keys=True,separators=(",",":")))
 assert r["directCallerCount"]==cx["callerCount"]
 assert r["callerless"]==(cx["callerCount"]==0)
 assert r["decision"] in ("accept-current","correction","refinement","hold")
 assert r["rationale"] and r["confidence"] in ("high","moderate","low")
 counts[r["decision"]]+=1; confidences[r["confidence"]]+=1
 if r["decision"] in ("correction","refinement"):
  assert isinstance(r.get("proposedTarget"),str) and r["proposedTarget"]
  target=r["proposedTarget"]
 else:
  assert "proposedTarget" not in r
  target=r["currentTarget"]
 assert r["reviewedTargetSha256"]==sha(target)
 source_tokens=icu(r["source"]); current_tokens=icu(r["currentTarget"]); reviewed_tokens=icu(target)
 s_sig=sig(source_tokens); c_sig=sig(current_tokens); r_sig=sig(reviewed_tokens)
 s_nums=NUM.findall(r["source"]); c_nums=NUM.findall(r["currentTarget"]); r_nums=NUM.findall(target)
 s_vals,c_vals=numeric_values(s_nums,s_nums); s_vals,r_vals=numeric_values(s_nums,r_nums)
 req=r["sourceProtectedLiterals"]; missing=[x for x in req if x not in target]
 runtime_cats=runtime["categories"][r["localeTag"]]
 rm=catmap(reviewed_tokens)
 coverage=all(set(runtime_cats).issubset(set(v)) for v in rm.values())
 audit={
  "sourcePlaceholders":source_tokens,"currentPlaceholders":current_tokens,"reviewedPlaceholders":reviewed_tokens,
  "placeholderFormatterSequencePreserved":s_sig==r_sig,
  "currentPluralCategoryMap":catmap(current_tokens),"reviewedPluralCategoryMap":rm,
  "runtimePluralCategories":runtime_cats,"runtimePluralCategoriesCovered":coverage,
  "sourceAndReviewedPluralCategoryMapsEqual":catmap(source_tokens)==rm,
  "sourceMarkupTokens":MK.findall(r["source"]),"currentMarkupTokens":MK.findall(r["currentTarget"]),"reviewedMarkupTokens":MK.findall(target),
  "markupPreserved":MK.findall(r["source"])==MK.findall(target),
  "sourceNumericTokens":s_nums,"currentNumericTokens":c_nums,"reviewedNumericTokens":r_nums,
  "packetSourceNumericTokens":s["sourceNumericTokens"],"packetCurrentNumericTokens":c["currentTargetNumericTokens"],"packetNumericTokenMismatch":c["numericTokenMismatch"],
  "reviewedNumericTokenSurfaceMatchesSource":s_nums==r_nums,
  "reviewedNumericValuesMatchSource":s_vals==r_vals,
  "requiredProtectedLiterals":req,"preservedProtectedLiterals":[x for x in req if x in target],"missingProtectedLiterals":missing
 }
 assert audit==r["tokenAudit"],(key,"audit")
 assert audit["placeholderFormatterSequencePreserved"] and coverage and audit["markupPreserved"] and audit["reviewedNumericValuesMatchSource"] and not missing,(key,audit)
 assert r["placeholderTokenMismatch"]==(Counter(s_sig)!=Counter(c_sig))
 assert r["placeholderTokenSequenceMismatch"]==(s_sig!=c_sig)
 assert r["icuPluralCategorySetDifference"]==(catmap(source_tokens)!=catmap(current_tokens))
 assert r["markupTokenMismatch"]==(MK.findall(r["source"])!=MK.findall(r["currentTarget"]))
 assert r["numericTokenMismatch"]==c["numericTokenMismatch"]
 assert r["protectedLiteralMismatch"]==any(x not in r["currentTarget"] for x in req)
 baseline["placeholderMismatchCount"]+=r["placeholderTokenMismatch"]
 baseline["placeholderSequenceMismatchCount"]+=r["placeholderTokenSequenceMismatch"]
 baseline["icuPluralCategorySetDifferenceCount"]+=r["icuPluralCategorySetDifference"]
 baseline["markupMismatchCount"]+=r["markupTokenMismatch"]
 baseline["numericTokenMismatchCount"]+=r["numericTokenMismatch"]
 baseline["protectedLiteralMismatchCount"]+=r["protectedLiteralMismatch"]
 reviewed["placeholderMismatchCount"]+=not audit["placeholderFormatterSequencePreserved"]
 reviewed["placeholderSequenceMismatchCount"]+=not audit["placeholderFormatterSequencePreserved"]
 reviewed["icuPluralCategorySetDifferenceCount"]+=catmap(source_tokens)!=rm
 reviewed["icuRuntimeCoverageFailureCount"]+=not coverage
 reviewed["markupMismatchCount"]+=not audit["markupPreserved"]
 reviewed["numericTokenSurfaceMismatchCount"]+=not audit["reviewedNumericTokenSurfaceMatchesSource"]
 reviewed["numericValueMismatchCount"]+=not audit["reviewedNumericValuesMatchSource"]
 reviewed["protectedLiteralMismatchCount"]+=bool(missing)
assert seen==set(current_by_key)
assert dict(baseline)==json.loads(check.stdout)["baselineTokenDiagnostics"]
assert counts==Counter({"accept-current":181,"correction":41,"refinement":18}),counts
assert all(not r["callerless"] and r["decision"]!="hold" for r in rows)
summary=j(O/"summary.json")
assert summary["decisionCounts"]==dict(counts) and summary["confidenceCounts"]==dict(confidences)
assert summary["reviewedDiagnostics"]==dict(reviewed) and summary["baselineDiagnostics"]==dict(baseline)
assert summary["callerlessCellCount"]==0
assert summary["runtimePluralCategoryEvidence"]==runtime
assert m["decisionCounts"]==dict(counts) and m["holdCount"]==0 and m["cellCount"]==240
print(json.dumps({"pass":True,"inputVerifier":"PASS","outputVerifier":"PASS","cells":len(rows),"decisions":dict(counts),"confidenceCounts":dict(confidences),"baselineDiagnostics":dict(baseline),"reviewedDiagnostics":dict(reviewed),"runtimePluralCategoryCoverage":"PASS","head":m["head"],"tree":m["tree"]},ensure_ascii=False,indent=2))
