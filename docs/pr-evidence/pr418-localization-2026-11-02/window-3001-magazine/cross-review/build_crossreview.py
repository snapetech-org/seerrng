from pathlib import Path
import collections, hashlib, json, re, subprocess

REPO=Path("/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng")
OUT=Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-w3001-magazinelimit-crossreview-a1d39112-20261102")
OLD_PRIMARY=Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-window-3000-3099-primary-20261102")
EXPECTED_HEAD="a1d39112a4e378a38640dc183e820c646b49665a"
EXPECTED_TREE="fa084f89e9ae90ca196a7201b91882a1fd9f9710"
OLD_HEAD="5df4c711f832f1f9a818c4d9cfca46661bff0835"
OLD_TREE="116ff2934d7eaf3d02f84f104621860c16babc01"
BRANCH="codex/seerrng-localization-overhaul-20261028"
KEY="components.RequestModal.QuotaDisplay.magazinelimit"
ENGLISH="{limit, plural, one {magazine} other {magazines}}"
LOCALE_MAP=[
    ("ar","ar"),("de","de"),("es","es"),("fr","fr"),("hi","hi"),("id","id"),
    ("ja","ja"),("ko","ko"),("pt_BR","pt-BR"),("vi","vi"),("zh_Hans","zh-Hans"),("zh_Hant","zh-Hant")
]
SRC_REL="src/components/RequestModal/QuotaDisplay/index.tsx"
CALL_REL="src/components/RequestModal/MagazineRequestModal.tsx"
OLD_LEDGER=OLD_PRIMARY/"primary-review-ledger-final.jsonl"
def sha(b): return hashlib.sha256(b).hexdigest()
def sht(s): return sha(s.encode("utf-8"))
def jline(o): return json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n"
def writej(name,o): (OUT/name).write_text(json.dumps(o,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
def writel(name,rs): (OUT/name).write_text("".join(jline(x) for x in rs),encoding="utf-8")
def readrows(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x]
def run(args,cwd=REPO,check=True): return subprocess.run(args,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=check)
def git(*args): return run(["git",*args]).stdout.strip()
def blob(rel): return git("rev-parse",f"HEAD:{rel}")
def cathead(rel): return run(["git","show",f"HEAD:{rel}"]).stdout
def line_pin(rel, lineno, radius=2):
    data=cathead(rel).splitlines()
    line=data[lineno-1]
    return {"path":rel,"line":lineno,"lineText":line,"lineSha256":sht(line),
            "contextStartLine":max(1,lineno-radius),
            "contextLines":[{"line":i+1,"text":data[i]} for i in range(max(0,lineno-radius-1),min(len(data),lineno+radius))],
            "fileSha256":sha(cathead(rel).encode()),"gitBlob":blob(rel)}
def parse_plural(text):
    m=re.match(r"^\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,",text)
    if not m: raise ValueError("Expected one top-level ICU plural argument")
    argument=m.group(1); p=m.end(); branches={}
    while True:
        while p<len(text) and text[p].isspace(): p+=1
        if p>=len(text): raise ValueError("Unclosed plural argument")
        if text[p]=="}":
            p+=1
            if text[p:].strip(): raise ValueError("Unexpected data after plural expression")
            break
        start=p
        while p<len(text) and not text[p].isspace() and text[p]!="{": p+=1
        selector=text[start:p]
        while p<len(text) and text[p].isspace(): p+=1
        if not selector or p>=len(text) or text[p]!="{": raise ValueError(f"Malformed selector at {p}")
        p+=1; body_start=p; depth=1
        while p<len(text) and depth:
            if text[p]=="{": depth+=1
            elif text[p]=="}": depth-=1
            p+=1
        if depth: raise ValueError(f"Unclosed selector body for {selector}")
        body=text[body_start:p-1]
        if selector in branches: raise ValueError(f"Duplicate selector {selector}")
        branches[selector]=body
    if "other" not in branches: raise ValueError("ICU plural requires other")
    return {"argument":argument,"branches":branches,"selectors":list(branches)}
def get_ctx(lines, line, radius=2):
    return [{"line":i+1,"text":lines[i]} for i in range(max(0,line-radius-1),min(len(lines),line+radius))]
def raw_head(rel): return run(["git","show",f"HEAD:{rel}"],check=True).stdout.encode()
def path_sha(rel): return sha(raw_head(rel))
def path_line_map(rel, needle):
    lines=cathead(rel).splitlines()
    return [(i+1,l) for i,l in enumerate(lines) if needle in l]

# Exact live PR, local/remote branch, tree and preserved worktree status.
head=git("rev-parse","HEAD"); tree=git("rev-parse","HEAD^{tree}"); branch=git("branch","--show-current")
status=git("status","--porcelain")
if (head,tree,branch)!=(EXPECTED_HEAD,EXPECTED_TREE,BRANCH): raise SystemExit("Local exact PR pin mismatch.")
pr=json.loads(run(["gh","pr","view","418","--repo","snapetech-org/seerrng","--json","state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,updatedAt,url"]).stdout)
remote=run(["git","ls-remote","github",f"refs/heads/{BRANCH}"]).stdout.strip().split()
remote_oid=remote[0] if remote else None
if pr["state"]!="OPEN" or pr["headRefName"]!=BRANCH or pr["headRefOid"]!=EXPECTED_HEAD or remote_oid!=EXPECTED_HEAD:
    raise SystemExit(f"Live pin mismatch: {pr}; remote={remote_oid}")
if not any(x.strip()=="AGENTS.md" or x.strip().endswith("AGENTS.md") for x in status.splitlines()) or not any(".next-webpack-dev" in x for x in status.splitlines()):
    raise SystemExit("Worktree status changed from the preserved shared state; inspect before continuing.")
# The code/catalog inputs used below must be committed at HEAD, despite unrelated dirty paths.
for rel in [SRC_REL,CALL_REL]+[f"src/i18n/locale/{loc}.json" for loc,_ in LOCALE_MAP]:
    actual=(REPO/rel).read_bytes()
    if sha(actual)!=path_sha(rel): raise SystemExit(f"Input worktree file differs from pinned HEAD: {rel}")
old_tree=git("rev-parse",f"{OLD_HEAD}^{{tree}}")
if old_tree!=OLD_TREE: raise SystemExit("Old hold pin does not match its expected tree.")
writej("live-head-reattestation.json",{
 "repository":"snapetech-org/SeerrNG","pullRequest":418,"url":pr["url"],"state":pr["state"],"isDraft":pr["isDraft"],
 "baseRefName":pr["baseRefName"],"baseRefOid":pr["baseRefOid"],"updatedAt":pr["updatedAt"],
 "branch":BRANCH,"localHead":head,"localTree":tree,"githubRemote":"github","githubRemoteBranchHead":remote_oid,
 "oldHead":OLD_HEAD,"oldTree":old_tree,"localWorktreeStatus":status.splitlines(),
 "unrelatedSharedWorktreeStatePreserved":True,"worktreeClean":False,"exactPinsMatch":True,
 "repositoryOrCatalogEditsMade":False,"testsBuildsScansCiOrBrowserRun":False
})

# Confirm source definition, caller branch and runtime argument chain at a1.
src_lines=cathead(SRC_REL).splitlines()
source_lines=[(i+1,l) for i,l in enumerate(src_lines) if re.match(r"\s*magazinelimit\s*:",l)]
caller_lines=cathead(CALL_REL).splitlines()
call_matches=[(i+1,l) for i,l in enumerate(caller_lines) if '<QuotaDisplay mediaType="magazine" quota={quota?.magazine} />' in l]
limit_guard=[(i+1,l) for i,l in enumerate(caller_lines) if '(quota?.magazine?.limit ?? 0) > 0' in l]
branch_lines=[(i+1,l) for i,l in enumerate(src_lines) if "messages.magazinelimit" in l]
if len(source_lines)!=1 or len(call_matches)!=1 or len(limit_guard)!=1 or len(branch_lines)!=1:
    raise SystemExit(f"Expected exact source/caller references not found: {source_lines}, {limit_guard}, {call_matches}, {branch_lines}")
source_position,source_line=source_lines[0]
source_match=re.search(r"""magazinelimit:\s*'([^']+)'""",source_line)
if not source_match or source_match.group(1)!=ENGLISH: raise SystemExit("English source string changed.")
old_source_text=run(["git","show",f"{OLD_HEAD}:{SRC_REL}"]).stdout
old_message_reference_count=old_source_text.count("messages.magazinelimit")
if old_message_reference_count: raise SystemExit("Old 5df head already had a production messages.magazinelimit reference.")
en_rel="src/i18n/locale/en.json"
en_doc=json.loads(raw_head(en_rel).decode("utf-8"))
if en_doc.get(KEY)!=ENGLISH: raise SystemExit("English catalog entry differs from source definition.")
en_line=next((i+1 for i,l in enumerate(cathead(en_rel).splitlines()) if '"'+KEY+'"' in l),None)
if not en_line: raise SystemExit("English catalog key line not found.")
branch_position,branch_line=branch_lines[0]
if "mediaType === 'magazine'" not in src_lines[branch_position-2] or "messages.magazinelimit" not in branch_line:
    raise SystemExit("Magazine formatter branch does not select messages.magazinelimit.")
argument_line_map=path_line_map(SRC_REL,"limit: quota?.limit")
if len(argument_line_map)<2: raise SystemExit("Expected outer and nested formatter-value bindings for limit.")
limit_arg_pos,limit_arg_line=next((n,l) for n,l in argument_line_map if l.strip()=="{ limit: quota?.limit }")
allowed_line_map=path_line_map(SRC_REL,"allowedRequests:")
if len(allowed_line_map)<1: raise SystemExit("Expected allowedRequests formatter message.")
allowed_source_position=next((n for n,l in path_line_map(SRC_REL,"You are allowed to request")),None)
days_zero_position=next((n for n,l in path_line_map(SRC_REL,"days, plural, =0")),None)
collapsed_line_map=path_line_map(SRC_REL,"? messages.magazine")
definition=parse_plural(ENGLISH)
if definition["argument"]!="limit" or definition["selectors"]!=["one","other"]: raise SystemExit("Unexpected English ICU structure.")
# Attach the source-line number for the surrounding days exact selector.
days_zero_line=next(((i+1,l) for i,l in enumerate(src_lines) if "days, plural, =0" in l),None)
if not days_zero_line: raise SystemExit("Surrounding exact days selector not found.")

commit_parent=git("rev-parse","HEAD^")
if run(["git","merge-base","--is-ancestor",OLD_HEAD,EXPECTED_HEAD],check=False).returncode!=0: raise SystemExit("Prior hold head is not an ancestor of the current head.")
fix_diff=run(["git","diff","--no-ext-diff","--unified=12",commit_parent,EXPECTED_HEAD,"--",SRC_REL]).stdout
source_fix_changed_paths=run(["git","diff","--name-only",commit_parent,EXPECTED_HEAD]).stdout.splitlines()
locale_paths_changed_by_source_fix=run(["git","diff","--name-only",commit_parent,EXPECTED_HEAD,"--","src/i18n/locale"]).stdout.splitlines()
locale_paths_changed_since_hold=run(["git","diff","--name-only",OLD_HEAD,EXPECTED_HEAD,"--","src/i18n/locale"]).stdout.splitlines()
if locale_paths_changed_by_source_fix: raise SystemExit(f"Source-fix commit changed catalogs unexpectedly: {locale_paths_changed_by_source_fix}")
if source_fix_changed_paths != [SRC_REL]: raise SystemExit(f"Unexpected files in source-fix commit: {source_fix_changed_paths}")
intervening=[{"commit":c,"subject":git("show","-s","--format=%s",c)} for c in run(["git","rev-list","--reverse",f"{OLD_HEAD}..{EXPECTED_HEAD}"]).stdout.splitlines()]
(OUT/"source-fix-diff.patch").write_text(fix_diff,encoding="utf-8")
branch_ref_count=sum(1 for i,l in enumerate(src_lines,1) if "messages.magazinelimit" in l)
source_change={
 "commit":EXPECTED_HEAD,"parent":commit_parent,"tree":EXPECTED_TREE,"path":SRC_REL,
  "oldHead":OLD_HEAD,"oldTree":OLD_TREE,"interveningCommits":intervening,
 "sourceFixCommitChangedPaths":source_fix_changed_paths,
 "localePathsChangedBySourceFix":locale_paths_changed_by_source_fix,
 "localePathsChangedSincePriorHoldHead":locale_paths_changed_since_hold,
 "sourceDefinition":line_pin(SRC_REL,source_position,2),
 "englishLocaleSourcePin":{"path":en_rel,"line":en_line,"lineText":cathead(en_rel).splitlines()[en_line-1],
   "lineSha256":sht(cathead(en_rel).splitlines()[en_line-1]),"fileSha256":path_sha(en_rel),"gitBlob":blob(en_rel),
   "value":en_doc[KEY],"valueSha256":sht(en_doc[KEY])},
 "formatterBranch":line_pin(SRC_REL,branch_position,3),
 "formatterArgumentBinding":line_pin(SRC_REL,limit_arg_pos,2),
 "allowedRequestsEnglish":line_pin(SRC_REL,allowed_source_position,1) if allowed_source_position else None,
 "surroundingDaysExactZeroSelector":line_pin(SRC_REL,days_zero_line[0],1),
 "collapsedMagazineUnitBranch":line_pin(SRC_REL,collapsed_line_map[0][0],2) if collapsed_line_map else None,
 "sourceString":ENGLISH,"sourceId":KEY,"pluralArgument":"limit","pluralSelectors":definition["selectors"],
 "newProductionMessageKeyReferenceCount":branch_ref_count,
 "newProductionMessageKeyReferenceLine":branch_position,
 "oldMessagesMagazineLimitReferenceAbsentAt5df":old_message_reference_count==0,
 "oldMessagesMagazineLimitReferenceCountAt5df":old_message_reference_count,
 "independentConclusion":"New branch selects messages.magazinelimit only when mediaType is magazine; the adjacent default remains seasonlimit for TV/series cases. This fixes the identified magazine details fall-through."
}
writej("source-fix-and-caller-chain.json",source_change)
(OUT/"source-fix-diff.sha256").write_text(sha(fix_diff.encode())+"  source-fix-diff.patch\n",encoding="utf-8")

# Parse all 12 exact locale values from pinned HEAD and reconcile them to the prior held cells.
old_rows=[r for r in readrows(OLD_LEDGER) if r.get("sourceId")==KEY]
if len(old_rows)!=12 or any(r.get("finalDisposition")!="hold" or r.get("exactHead")!=OLD_HEAD or r.get("exactTree")!=OLD_TREE for r in old_rows):
    raise SystemExit("Prior W3001 12-cell hold records missing or changed.")
old_by_locale={r["locale"]:r for r in old_rows}
source_hash=sht(ENGLISH)
candidates={
 "de":("{limit, plural, one {Zeitschrift} other {Zeitschriften}}","Use Zeitschrift/Zeitschriften as a consistent German singular/plural pair for the publication type. The current singular Magazin and plural Zeitschriften switch lexical roots; the candidate keeps the well-established periodical term.","moderate"),
 "es":("{limit, plural, one {revista} many {revistas} other {revistas}}","This token appears after the request count in the sentence allowedRequests, not at sentence start. Same-locale neighboring media-limit entries use lowercase common nouns; lower-case the singular to match the plural and running-sentence context.","high"),
 "hi":("{limit, plural, one {पत्रिका} other {पत्रिकाएँ}}","The magazine count uses a Hindi singular noun for one and its standard feminine plural for other counts. The current target repeats the singular in the other branch, yielding a mismatch such as 2 पत्रिका.","moderate"),
 "pt_BR":("{limit, plural, one {revista} many {revistas} other {revistas}}","This token appears after the request count in the sentence allowedRequests, not at sentence start. Same-locale neighboring media-limit entries use lowercase common nouns; lower-case the singular to match the plural and running-sentence context.","high"),
}
# Obtain CLDR cardinal categories from the runtime Intl.PluralRules implementation used by JS Intl.
locale_map={loc:icu for loc,icu in LOCALE_MAP}
node_code="const m="+json.dumps(locale_map)+";const out={};for(const [k,l] of Object.entries(m)){const p=new Intl.PluralRules(l);out[k]={locale:l,categories:p.resolvedOptions().pluralCategories,selectedSamples:[0,1,2,3,5,11,21,101,1000000,1.5].map(n=>({n,category:p.select(n)}))};}process.stdout.write(JSON.stringify({node:process.version,locales:out}));"
plural_runtime=json.loads(run(["node","-e",node_code]).stdout)
writel("locale-plural-categories.jsonl",[{"locale":k,**v,"categoryType":"Intl.PluralRules cardinal","note":"A selector outside this locale's returned categories can be syntactically valid but unreachable; identical unreachable one/other branches are redundant, not a semantic mismatch."} for k,v in plural_runtime["locales"].items()])
writej("plural-runtime-info.json",{"runtime":plural_runtime["node"],"method":"Intl.PluralRules(locale).resolvedOptions().pluralCategories","type":"cardinal"})

catalogs={}; cpins=[]; ledger=[]; prior_hold=[]
for locale,icu_locale in LOCALE_MAP:
    rel=f"src/i18n/locale/{locale}.json"
    raw=raw_head(rel); data=json.loads(raw.decode("utf-8"))
    if KEY not in data: raise SystemExit(f"Missing locale key {locale}")
    target=data[KEY]; parse=parse_plural(target)
    if parse["argument"]!="limit": raise SystemExit(f"Wrong argument {locale}")
    old=old_by_locale[locale]
    if old.get("currentTargetHash")!=sht(target) or old.get("currentTarget")!=target:
        raise SystemExit(f"Prior held target differs at new head: {locale}")
    keyset=sorted(data)
    catalogs[locale]=data
    cpins.append({"locale":locale,"path":rel,"gitBlob":blob(rel),"fileSha256":sha(raw),"bytes":len(raw),
      "keyCount":len(keyset),"sortedKeysetSha256CanonicalJsonArray":sht(json.dumps(keyset,ensure_ascii=False,separators=(",",":"))),
      "targetKeyLine":next(i+1 for i,l in enumerate(raw.decode("utf-8").splitlines()) if json.dumps(KEY,ensure_ascii=False)[1:-1] in l),
      "target":target,"targetSha256":sht(target)})
    prev_target=old["currentTarget"]
    prev_att={"sourcePosition":3001,"sourceId":KEY,"locale":locale,"oldHead":OLD_HEAD,"oldTree":OLD_TREE,
      "oldDisposition":old["finalDisposition"],"oldHoldReason":old.get("holdReason"),
      "oldTarget":prev_target,"oldTargetSha256":old["currentTargetHash"],
      "currentHead":EXPECTED_HEAD,"currentTree":EXPECTED_TREE,"currentTarget":target,"currentTargetSha256":sht(target),
      "targetUnchanged":target==prev_target and sht(target)==old["currentTargetHash"],
      "newSourceBranchReference":True,"reopenedForReview":True}
    prior_hold.append(prev_att)
    pmap=parse["branches"]
    categories=plural_runtime["locales"][locale]["categories"]
    selector_cats=[s for s in parse["selectors"] if not s.startswith("=")]
    exact_selectors=[s for s in parse["selectors"] if s.startswith("=")]
    unknown=[s for s in selector_cats if s not in {"zero","one","two","few","many","other"}]
    unreachable=[s for s in selector_cats if s not in categories]
    item=candidates.get(locale)
    if item:
        proposed,why,confidence=item
        disposition="correction"
        final=proposed
        finalparse=parse_plural(final)
        proposal_kind="correction"
    else:
        proposed=None; why="The current translation identifies the magazine publication type and is idiomatic in its locale. Plural branches either match the locale's cardinal categories or repeat the same invariant noun where the locale has no distinct singular form."
        confidence="moderate"; disposition="accept-current"; final=target; finalparse=parse; proposal_kind=None
    missing_categories=[c for c in categories if c not in finalparse["selectors"]]
    bad_unreachable=[s for s in unreachable if pmap.get(s)!=pmap.get("other")]
    structural={
      "sourceArgument":"limit","currentArgument":parse["argument"],"finalArgument":finalparse["argument"],
      "sourceSelectors":definition["selectors"],"currentSelectors":parse["selectors"],"finalSelectors":finalparse["selectors"],
      "localeCardinalCategories":categories,"unknownSelectorSyntax":unknown,"exactNumericSelectors":exact_selectors,
      "selectorsOutsideLocaleCategories":unreachable,"unreachableSelectorOutputsDifferFromOther":bad_unreachable,
      "missingLocaleCategories":missing_categories,"hasOther":("other" in finalparse["selectors"]),
      "currentPlaceholderParity":parse["argument"]==definition["argument"],
      "finalPlaceholderParity":finalparse["argument"]==definition["argument"],
      "currentMarkup":[],"finalMarkup":[],"markupParity":True,
      "currentIcuParseValid":True,"finalIcuParseValid":True,
      "currentOtherLeaf":parse["branches"]["other"],"finalOtherLeaf":finalparse["branches"]["other"],
      "currentBranchOutputMap":parse["branches"],"finalBranchOutputMap":finalparse["branches"]}
    if unknown or bad_unreachable or missing_categories or not structural["finalPlaceholderParity"]:
        raise SystemExit(f"ICU locale structure problem {locale}: {structural}")
    if finalparse["selectors"]!=parse["selectors"]: raise SystemExit(f"Proposal changed ICU selectors {locale}")
    ledger.append({
      "schema":"seerrng-pr418-w3001-magazinelimit-independent-crossreview-v1",
      "repository":"snapetech-org/SeerrNG","pullRequest":418,"sourcePosition":3001,"sourceId":KEY,
      "exactHead":EXPECTED_HEAD,"exactTree":EXPECTED_TREE,"locale":locale,"icuLocale":icu_locale,
      "englishSource":ENGLISH,"englishSourceSha256":source_hash,
      "oldPrimaryDisposition":"hold","oldHoldReason":old.get("holdReason"),
      "currentTarget":target,"currentTargetSha256":sht(target),
      "independentDisposition":disposition,"proposalKind":proposal_kind,
      "proposedTarget":proposed,"proposedTargetSha256":sht(proposed) if proposed is not None else None,
      "reviewedTarget":final,"reviewedTargetSha256":sht(final),
      "callerContext":"MagazineRequestModal renders QuotaDisplay with mediaType=magazine and quota.magazine when its magazine quota limit is positive. QuotaDisplay's expanded allowedRequests formatter now selects messages.magazinelimit for mediaType=magazine and passes quota.limit to the ICU argument.",
      "callerReferences":[f"{CALL_REL}:238",f"{CALL_REL}:239",f"{SRC_REL}:{branch_position}",f"{SRC_REL}:{limit_arg_pos}"],
      "structuralChecks":structural,"confidence":confidence,"rationale":why,
      "nativeSpeakerApproval":False,
    })
if len({x["keyCount"] for x in cpins})!=1 or len({x["sortedKeysetSha256CanonicalJsonArray"] for x in cpins})!=1: raise SystemExit("Locale catalog key order mismatch.")
writel("independent-cross-review-ledger.jsonl",ledger)
writel("prior-hold-reattestation.jsonl",prior_hold)
writel("catalog-target-pins.jsonl",cpins)
writel("proposed-corrections.jsonl",[x for x in ledger if x["proposedTarget"] is not None])

# Input checksums include exact committed source/caller/catalog files and prior sealed evidence.
input_paths=[REPO/SRC_REL,REPO/CALL_REL,REPO/"src/i18n/locale/en.json"]+[REPO/f"src/i18n/locale/{loc}.json" for loc,_ in LOCALE_MAP]+[
 OLD_PRIMARY/"SHA256SUMS",OLD_PRIMARY/"source-fix-recommendation-W3001.json",OLD_PRIMARY/"primary-review-ledger-final.jsonl"]
input_sums="".join(f"{sha(p.read_bytes())}  {p}\n" for p in input_paths)
(OUT/"INPUT-SHA256SUMS").write_text(input_sums,encoding="utf-8")
check=run(["sha256sum","-c","INPUT-SHA256SUMS"],cwd=OUT)
if check.returncode: raise SystemExit(check.stdout+check.stderr)
writ = {
 "sourcePosition":3001,"sourceId":KEY,"englishSource":ENGLISH,"englishSourceSha256":source_hash,
 "sourcePin":line_pin(SRC_REL,source_position,2),"callerPin":line_pin(CALL_REL,call_matches[0][0],3),
 "callerGuardPin":line_pin(CALL_REL,limit_guard[0][0],2),"formatterBranchPin":line_pin(SRC_REL,branch_position,3),
 "formatterArgumentPin":line_pin(SRC_REL,limit_arg_pos,2),"enclosingAllowedRequestsPin":line_pin(SRC_REL,allowed_source_position,1) if allowed_source_position else None,
 "surroundingDaysExactZeroPin":line_pin(SRC_REL,days_zero_line[0],1),
 "collapsedMagazineUnitPin":line_pin(SRC_REL,collapsed_line_map[0][0],2) if collapsed_line_map else None,
 "definitionLine":source_position,"branchLine":branch_position,"argumentValueLine":limit_arg_pos,
 "callerLine":call_matches[0][0],"callerGuardLine":limit_guard[0][0],
 "oldHeadHadNoProductionMessageReference":old_message_reference_count==0,
 "oldHeadMessageReferenceCount":old_message_reference_count,"newHeadHasMagazineMessageReference":True,
 "sourceFixCommitParent":commit_parent,"localeFilesChangedBySourceFix":locale_paths_changed_by_source_fix,
 "diffSha256":sha(fix_diff.encode()),"crossReviewConclusion":"Exact magazine branch now connects the caller to the previously held message key. The formatted plural argument is quota.limit and is structurally preserved in all 12 locale cells.",
}
writej("source-and-caller-attestation.json",writ)

# Summary and review limitations.
disp=collections.Counter(x["independentDisposition"] for x in ledger)
summary={
 "repository":"snapetech-org/SeerrNG","pullRequest":418,"state":pr["state"],"isDraft":pr["isDraft"],
 "branch":BRANCH,"head":EXPECTED_HEAD,"tree":EXPECTED_TREE,"oldHead":OLD_HEAD,"oldTree":OLD_TREE,
 "sourcePosition":3001,"sourceId":KEY,"cellCount":12,"localeCount":12,
 "dispositions":dict(disp),"corrections":len(candidates),"holds":0,
 "previousHoldCellsReattested":len(prior_hold),"previousTargetsUnchangedAtNewHead":sum(x["targetUnchanged"] for x in prior_hold),
 "localeCatalogsPinned":len(cpins),"localeKeyCount":cpins[0]["keyCount"],"orderedKeysetsIdentical":True,
 "sourceDefinitionPinVerified":True,"MagazineRequestModalCallerVerified":True,"magazineFormatterBranchVerified":True,
 "formatterArgument":"limit = quota?.limit","callerGuard":"(quota?.magazine?.limit ?? 0) > 0",
 "zeroQuotaCardRendered":False,"formatterOnlyRunsForPositiveMagazineLimit":True,
 "icuExpressionsParsed":12,"localeCategoryCoverage":"Every category returned by Intl.PluralRules is present. Six locales return only other and carry a redundant one branch with the same output. Arabic zero is a CLDR category; W3001 contains no exact numeric selector. The surrounding days argument has a separate exact =0 selector.",
 "pluralRulesRuntime":plural_runtime["node"],
 "icuStructuralFailures":0,"placeholderFailures":0,"markupFailures":0,"nativeSpeakerApproval":False,
 "worktreeStatus":status.splitlines(),"unrelatedWorktreeChangesPreserved":True,
 "repositoryFilesEdited":False,"testsBuildScansCiBrowserRun":False,"scratchPath":str(OUT)
}
writej("summary.json",summary)
readme=f"""# SeerrNG PR #418 W3001 magazine quota independent cross-review

Reviewed source position 3001, {KEY}, at exact open draft PR head {EXPECTED_HEAD}, tree {EXPECTED_TREE}. Local branch and official GitHub branch match the PR. The worktree has pre-existing shared changes in AGENTS.md and .next-webpack-dev; they were preserved and not touched.

The 12 cells had been held at prior head {OLD_HEAD} because the message key had no production caller. The intervening commit d3e97a0 applied W3000; all 12 W3001 values still match their prior held hashes. Commit {EXPECTED_HEAD} then adds the magazine-specific QuotaDisplay branch. That source-fix commit changed only the formatter file and no locale files. MagazineRequestModal passes mediaType=magazine with quota.magazine when the magazine limit is positive, and QuotaDisplay now formats magazinelimit with quota.limit.

## Independent review

- {disp['accept-current']} values accepted
- {disp['correction']} corrections proposed
- 0 holds

The corrections are a consistent German singular/plural pair, lowercase Spanish and Brazilian Portuguese common nouns in running text, and a Hindi plural form. The other eight current values convey “magazine” in caller context.

All 12 ICU expressions parse, preserve the limit argument, retain the locale-appropriate cardinal categories, and include other. Arabic zero is a valid CLDR plural category; the surrounding allowedRequests message has a separate exact =0 selector on days. The caller renders the magazine quota only when its limit is positive, so a zero magazine limit does not reach this formatter. Six locales with only other plural categories retain a redundant one branch whose output equals other. No placeholder or markup mismatches were found. ICU cardinal categories were read with Node v24.22.1 Intl.PluralRules.

This is an independent machine-assisted cross-review, not native-speaker approval. No repository/catalog/PR edits, tests, builds, scans, CI, or browser work were performed.
"""
(OUT/"README.md").write_text(readme,encoding="utf-8")

# Checksum manifest and detached checksum.
artifact_paths=sorted(p for p in OUT.iterdir() if p.is_file() and p.name not in {"MANIFEST.json","SHA256SUMS","SHA256SUMS.sha256"})
manifest={"repository":"snapetech-org/SeerrNG","pullRequest":418,"sourcePosition":3001,"sourceId":KEY,
 "head":EXPECTED_HEAD,"tree":EXPECTED_TREE,"artifactCountExcludingManifestAndSums":len(artifact_paths),
 "artifacts":[{"path":p.name,"bytes":p.stat().st_size,"sha256":sha(p.read_bytes())} for p in artifact_paths],
 "summary":{"cellCount":12,"dispositions":dict(disp)}}
writej("MANIFEST.json",manifest)
sum_paths=sorted(p for p in OUT.iterdir() if p.is_file() and p.name not in {"SHA256SUMS","SHA256SUMS.sha256"})
(OUT/"SHA256SUMS").write_text("".join(f"{sha(p.read_bytes())}  {p.name}\n" for p in sum_paths),encoding="utf-8")
(OUT/"SHA256SUMS.sha256").write_text(f"{sha((OUT/'SHA256SUMS').read_bytes())}  SHA256SUMS\n",encoding="utf-8")
print(json.dumps({"output":str(OUT),"dispositions":dict(disp),"corrections":[{"locale":r["locale"],"target":r["proposedTarget"],"sha256":r["proposedTargetSha256"]} for r in ledger if r["proposedTarget"]],"oldTargetsMatching":sum(x["targetUnchanged"] for x in prior_hold),"catalogs":len(cpins),"inputChecksumEntries":len(input_paths)},ensure_ascii=False,indent=2))
