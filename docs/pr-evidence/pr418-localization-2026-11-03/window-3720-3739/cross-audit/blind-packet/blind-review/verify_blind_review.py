#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
TASK=O.parent
I=TASK/"input/candidate-free-input"
REPO=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w3700-3719-apply-20261103/repo")
HEAD="1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e"; TREE="6a51f3fb1d1f65c12bfe82bf47834626aa364488"
BRANCH="codex/seerrng-localization-overhaul-20261028"
LOCALES=["es","zh_Hans","hi","de","ja","fr","pt_BR","ar","ko","zh_Hant","vi","id"]
NAMED=["Kapowarr","GetComics","Prowlarr","SeerrNG","FlareSolverr","Cloudflare","URL","API","SSL","IP"]
def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode("utf-8")).hexdigest()
def j(p): return json.loads(p.read_text(encoding="utf-8"))
def jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
def git(*args): return subprocess.check_output(["git","-C",str(REPO),*args],text=True).strip()
def blob(p): return subprocess.check_output(["git","-C",str(REPO),"hash-object",str(p)],text=True).strip()
def ph(s): return re.findall(r"\{[^{}]+\}",s)
def markup(s): return re.findall(r"</?[A-Za-z][^>]*>",s)
def numbers(s): return re.findall(r"(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?![A-Za-z0-9])",s)
def req(ok,msg):
 if not ok: raise SystemExit("FAIL: "+msg)
subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=I,check=True,capture_output=True,text=True)
subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=O,check=True,capture_output=True,text=True)
M=j(O/"manifest.json"); S=j(O/"summary.json"); IM=j(I/"manifest.json"); W=j(I/"window.json"); pins=j(I/"file-pins.json")
req(M["sealed"] is True,"manifest is not sealed")
req((M["repository"],M["pullRequest"],M["window"],M["head"],M["tree"])==("snapetech-org/seerrng",418,"W3720-W3739",HEAD,TREE),"manifest head/window")
req(M["inputManifestSha256"]==sha((I/"manifest.json").read_bytes()) and M["inputChecksumListSha256"]==sha((I/"SHA256SUMS.txt").read_bytes()),"candidate-free manifest/checksum pin")
listed={x["path"]:x for x in M["files"]}
actual={p.name for p in O.iterdir() if p.is_file()}-{"manifest.json","SHA256SUMS.txt"}
req(set(listed)==actual,"blind output file set")
for name,v in listed.items():
 b=(O/name).read_bytes(); req(len(b)==v["byteCount"] and sha(b)==v["sha256"],"blind output hash "+name)
req(IM["packetType"]=="candidate-free-input" and IM["head"]==HEAD and IM["tree"]==TREE,"candidate-free input identity")
req((git("rev-parse","HEAD"),git("rev-parse","HEAD^{tree}"),git("status","--porcelain=v1"))==(HEAD,TREE,""),"clean exact-head checkout")
pr=json.loads(subprocess.check_output(["gh","api","repos/snapetech-org/seerrng/pulls/418"],text=True))
req(pr["state"]=="open" and pr["draft"] is True and pr["head"]["sha"]==HEAD and pr["head"]["ref"]==BRANCH and pr["head"]["repo"]["full_name"]=="snapetech-org/seerrng","live PR head/state")
refs=subprocess.check_output(["git","-C",str(REPO),"ls-remote","origin",f"refs/heads/{BRANCH}","refs/pull/418/head"],text=True).splitlines(); rm={x.split()[1]:x.split()[0] for x in refs}
req(rm.get(f"refs/heads/{BRANCH}")==HEAD and rm.get("refs/pull/418/head")==HEAD,"live branch/pull refs")
# Reattest every source, catalog, and runtime blob.
catalogs={}; actual_pins=[]
for group in ("catalogFiles","runtimeFiles"):
 for rel,pin in pins[group].items():
  p=REPO/rel; raw=p.read_bytes(); h=sha(raw); b=blob(p)
  req((h,b,len(raw))==(pin["sha256"],pin["gitBlob"],pin["byteCount"]),"file pin "+rel)
  if group=="catalogFiles": catalogs[rel]=json.loads(raw)
  actual_pins.append({"group":group,"path":rel,"declaredSha256":pin["sha256"],"currentSha256":h,"declaredGitBlob":pin["gitBlob"],"currentGitBlob":b,"byteCount":len(raw),"lineCount":pin.get("lineCount"),"unchanged":True})
req(jl(O/"file-pin-reattestation.jsonl")==actual_pins,"file-pin reattestation records")
en=catalogs["src/i18n/locale/en.json"]; keys=list(en)
req(len(keys)==9494 and sha("\n".join(keys))==W["sourceOrderSha256"]==IM["sourceOrderSha256"],"English order")
exclude=jl(I/"prior-selection-exclusions.jsonl"); prior_ids=[x["sourceId"] for x in exclude]
req(len(exclude)==3720 and prior_ids==keys[:3720] and sha("\n".join(prior_ids))==W["priorSelectedSourceIdPrefixSha256"],"prior source prefix")
src=jl(I/"source-cells.jsonl"); req(len(src)==20 and [x["sourceId"] for x in src]==keys[3720:3740],"selected source order")
order=jl(I/"source-order.jsonl"); req([x["sourceId"] for x in order]==keys[3719:3741],"window boundaries")
req(W["previousBoundary"]["sourceId"]==keys[3719] and W["nextBoundary"]["sourceId"]==keys[3740],"boundary metadata")
ctx=jl(I/"caller-contexts.jsonl"); blocks=jl(I/"caller-context-blocks.jsonl")
req(len(ctx)==20 and len(blocks)==41 and all(x["callerCount"]>0 for x in ctx),"caller evidence count/no-current-holds")
for b in blocks:
 entries=b.get("lines",b.get("references",[]))
 for line in entries:
  p=REPO/line.get("path",b.get("path")); ls=p.read_text(encoding="utf-8").splitlines()
  req(1<=line["line"]<=len(ls) and ls[line["line"]-1]==line["text"] and sha(line["text"])==line["lineSha256"],"caller block "+b["contextId"])
cells=jl(I/"current-target-cells.jsonl"); req(len(cells)==240,"input target count")
locale_path={loc:f"src/i18n/locale/{loc}.json" for loc in LOCALES}
for c in cells:
 req(catalogs[c["catalogPath"]][c["sourceId"]]==c["currentTarget"] and sha(c["currentTarget"])==c["currentTargetSha256"],"current exact target "+str((c["position"],c["locale"])))
req(len(jl(O/"prior-window-selection-reattestation.jsonl"))==240,"prior applied cell reattestation count")
prior_selection=jl(I/"lineage/prior-window-selection-reattestation.jsonl"); selection_out=jl(O/"prior-window-selection-reattestation.jsonl")
req(len(prior_selection)==240 and len(selection_out)==240,"prior selection rows")
for old,new in zip(prior_selection,selection_out):
 current=catalogs[locale_path[old["locale"]]].get(old["sourceId"])
 req(current is not None and sha(current)==old["currentTargetSha256"]==old["previousAppliedTargetSha256"]==new["currentTargetSha256"] and new["matches"] is True,"prior applied value "+old["sourceId"])
holds=jl(I/"carry-forward-hold-hashes.jsonl"); hold_app=jl(I/"lineage/prior-hold-application-reattestation.jsonl"); hold_out=jl(O/"carry-forward-hold-reattestation.jsonl")
req(len(holds)==len(hold_app)==len(hold_out)==12,"carried hold count")
for old,app,new in zip(holds,hold_app,hold_out):
 current=catalogs[locale_path[old["locale"]]].get(old["sourceId"])
 req(current is not None and sha(current)==old["priorTargetSha256"]==old["previousApplicationTargetSha256"]==old["currentTargetSha256"]==app["currentTargetSha256"]==new["currentTargetSha256"],"carried hold target")
 req(old["callerless"] and old["retained"] and new["callerless"] and new["retained"] and new["matches"],"carried hold status")
# Check the blind ledger against every exact input cell and token.
rows=jl(O/"blind-ledger.jsonl"); req(len(rows)==240,"blind ledger count")
ci={(x["position"],x["locale"]):x for x in cells}; seen=set(); counts=Counter(); baseline=Counter(); final=Counter(); changes=0
permission={loc:catalogs[locale_path[loc]]["components.PermissionEdit.managerequests"] for loc in LOCALES}
for r in rows:
 k=(r["position"],r["locale"]); req(k not in seen and k in ci,"duplicate/unexpected blind cell"); seen.add(k); c=ci[k]; counts[r["disposition"]]+=1
 for fld in ("sourceId","sourceIdSha256","source","sourceSha256","catalogPath","currentTarget","currentTargetSha256","catalogFileSha256","catalogGitBlob","localeTag","position"):
  expected=c["catalogSha256"] if fld=="catalogFileSha256" else c[fld]
  req(r[fld]==expected,"cell input pin "+str(k)+" "+fld)
 req(r["head"]==HEAD and r["tree"]==TREE and r["containsCandidate"] is False and r["verdict"] is None,"blind row exact pins")
 req(r["callerContextBlockIds"]==next(x["contextBlockIds"] for x in ctx if x["sourceId"]==r["sourceId"]),"caller row pin")
 target=r["selectedTarget"]
 req(r["selectedTargetSha256"]==sha(target),"selected hash")
 if r["disposition"] in ("correction","refinement"):
  req(r.get("proposedTarget")==target and target!=c["currentTarget"],"changed target")
  changes+=1
 else: req(r["disposition"]=="accept-current" and target==c["currentTarget"] and "proposedTarget" not in r,"unchanged target")
 source=c["source"]; sp=ph(source); cp=ph(c["currentTarget"]); tp=ph(target); sm=markup(source); cm=markup(c["currentTarget"]); tm=markup(target); sn=numbers(source); cn=numbers(c["currentTarget"]); tn=numbers(target); prot=c["sourceProtectedLiterals"]
 expected_checks={"placeholdersPreserved":sp==tp,"placeholderSequencePreserved":sp==tp,"icuPluralCategoriesPreserved":not c["sourceIcuPluralCategories"] and not c["currentTargetIcuPluralCategories"],"markupPreserved":sm==tm,"numericTokensPreserved":sn==tn,"protectedLiteralsPreserved":all(x in target for x in prot)}
 req(all(expected_checks.values()) and r["tokenAudit"]["checks"]==expected_checks,"token checks "+str(k))
 req(r["namedLiteralAudit"]["preserved"] and all(x in target for x in [x for x in NAMED if x in source]),"named literals "+str(k))
 if r["position"]==3720: req(r["namedLiteralAudit"]["localizedManageRequestsLabel"]==permission[r["locale"]] and permission[r["locale"]] in target,"localized permission literal "+r["locale"])
 baseline["placeholder"]+=int(sp!=cp); baseline["markup"]+=int(sm!=cm); baseline["numeric"]+=int(sn!=cn); baseline["protectedLiteral"]+=int(not all(x in c["currentTarget"] for x in prot))
 final["placeholder"]+=int(sp!=tp); final["markup"]+=int(sm!=tm); final["numeric"]+=int(sn!=tn); final["protectedLiteral"]+=int(not all(x in target for x in prot))
req(seen==set(ci),"complete blind cell coverage")
req(dict(baseline)=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":1} and dict(final)=={"placeholder":0,"markup":0,"numeric":0,"protectedLiteral":0},"token summary")
S=j(O/"summary.json")
req(dict(counts)==S["dispositionCounts"] and counts["hold"]==0 and changes==S["selectedTargetChanges"],"summary disposition counts")
req(S["priorWindowCellsReattested"]==240 and S["carriedCallerlessHoldsReattested"]==12 and S["priorSelectedSourceIdsReattested"]==3720,"summary lineage counts")
req(S["primaryOrSummaryOutputAccessed"] is False and S["crossAuditOutputAccessed"] is False and S["repositoryOrPRFilesEdited"] is False,"review scope")
req(M["primaryOrSummaryOutputAccessed"] is False and M["crossAuditOutputAccessed"] is False,"manifest blindness")
print(json.dumps({"pass":True,"head":HEAD,"tree":TREE,"window":"W3720-W3739","cells":240,"dispositions":dict(counts),"changes":changes,"baselineTokenMismatches":dict(baseline),"selectedTokenMismatches":dict(final),"priorWindowCellsReattested":240,"carriedHoldsReattested":12,"pinnedFilesReattested":len(actual_pins),"callerContextBlocksReattested":len(blocks),"PR":"OPEN/DRAFT","primaryOrSummaryOutputAccessed":False,"crossAuditOutputAccessed":False},ensure_ascii=False,indent=2))
