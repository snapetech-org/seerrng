#!/usr/bin/env python3
"""Build the sealed, candidate-free SeerrNG PR #418 parity packet."""
from __future__ import annotations
import collections, datetime as dt, hashlib, json, re, subprocess
from pathlib import Path

REPO=Path("/mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume")
OUT=Path("/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105/candidate-free")
PREV=Path("/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-candidate-free-20261105/candidate-free-input/candidate-free-input")
HEAD="f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4"
TREE="f7ea727b0383397ec8d6220667b4abe151d43b46"
BASE="2647e15762de0c2285cd9d8ebc6d27ffafce6358"
BASETREE="b6f4acb9debdc1b0a838b50d5ad88aaa467e429b"
OLD="ac193096ebfc0007183348b24e35bf6fee33f67a"
OLDTREE="93e71e7c52602ec3f8b76548fd12b2f5b4368b4c"
REPO_SLUG="snapetech-org/seerrng"
BRANCH="codex/seerrng-localization-overhaul-20261028"
PREFIX="src/i18n/locale/"
EN=PREFIX+"en.json"
LOCALES={
 "es":"es.json","zh-Hans":"zh_Hans.json","hi":"hi.json","de":"de.json",
 "ja":"ja.json","fr":"fr.json","pt-BR":"pt_BR.json","ar":"ar.json",
 "ko":"ko.json","zh-Hant":"zh_Hant.json","vi":"vi.json","id":"id.json",
}
PRIOR_REQUIRED=("manifest.json","window.json","selected-source-cells.jsonl",
 "source-order-hashes.jsonl","prior-selection-hash-reattestation.jsonl",
 "pending-catalog-parity-follow-up.json")
ICU_TYPES=("plural","select","selectordinal","number","date","time")
PLACEHOLDER=re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
MARKUP=re.compile(r"</?[A-Za-z][^>]*>")
NUMBERS=re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])")
PROTECTED=re.compile(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])")
EXTRA_PROTECTED=("SeerrNG","Seerr","BookshelfNG","ReadMeABook")

def run(args,text=False):
    return subprocess.check_output(args,text=text)
def git(rev,path):
    return run(["git","-C",str(REPO),"show",f"{rev}:{path}"])
def gittext(*args):
    return str(run(["git","-C",str(REPO),*args],text=True)).strip()
def blob(rev,path):
    return gittext("rev-parse",f"{rev}:{path}")
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode("utf-8"))
def canon(o): return (json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode()
def pairs_object(pairs,dups):
    obj={}
    for k,v in pairs:
        if k in obj: dups.append(k)
        obj[k]=v
    return obj
def parseobj(raw,label):
    dups=[]
    data=json.loads(raw,object_pairs_hook=lambda x:pairs_object(x,dups))
    if not isinstance(data,dict): raise ValueError(label+" must be a JSON object")
    return data,dups
def readjl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def writej(name,obj):
    (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
def writejl(name,rows):
    (OUT/name).write_text("".join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for r in rows),encoding="utf-8")
def pin(rev,path):
    raw=git(rev,path)
    return {"path":path,"gitBlob":blob(rev,path),"sha256":sha(raw),"byteCount":len(raw),"lineCount":len(raw.decode().splitlines())}

def icu(value):
    found=[]
    for start,ch in enumerate(value):
        if ch!="{": continue
        depth=0; end=None
        for i in range(start,len(value)):
            if value[i]=="{": depth+=1
            elif value[i]=="}":
                depth-=1
                if depth==0: end=i+1; break
        if end is None: continue
        raw=value[start:end]
        m=re.match(r"^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*("+ "|".join(ICU_TYPES)+r")\b",raw)
        if m:
            selectors=re.findall(r"(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{",raw)
            found.append({"argument":m.group(1),"formatType":m.group(2),"selectors":selectors,"usesPound":"#" in raw,"raw":raw})
    return found
def tokens(value):
    protected=list(dict.fromkeys(PROTECTED.findall(value)))
    protected.extend(x for x in EXTRA_PROTECTED if x in value and x not in protected)
    return {"placeholders":PLACEHOLDER.findall(value),"icuExpressions":icu(value),
      "markupTags":MARKUP.findall(value),"numericTokens":NUMBERS.findall(value),
      "protectedLiterals":protected,"inlineCode":re.findall(chr(96)+r"([^"+chr(96)+r"]+)"+chr(96),value)}
def checks(source,target):
    a,b=tokens(source),tokens(target)
    shape=lambda xs:[(x["argument"],x["formatType"],x["selectors"],x["usesPound"]) for x in xs]
    result={"placeholders":a["placeholders"]==b["placeholders"],"icuExpressions":shape(a["icuExpressions"])==shape(b["icuExpressions"]),
      "markupTags":a["markupTags"]==b["markupTags"],"numericTokens":a["numericTokens"]==b["numericTokens"],
      "protectedLiterals":all(x in b["protectedLiterals"] for x in a["protectedLiterals"]),
      "inlineCode":a["inlineCode"]==b["inlineCode"]}
    return {"checks":result,"allMatch":all(result.values()),"sourceTokens":a,"targetTokens":b,
      "missingProtectedLiterals":[x for x in a["protectedLiterals"] if x not in b["protectedLiterals"]]}

def verify_prior():
    sums={}
    for line in (PREV/"SHA256SUMS.txt").read_text().splitlines():
        h,n=line.split("  ",1); sums[n]=h
    actual={p.name:sha(p.read_bytes()) for p in PREV.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
    if sums!=actual: raise SystemExit("REFUSED: prior candidate-free checksum inventory mismatch")
    if not set(PRIOR_REQUIRED)<=set(sums): raise SystemExit("REFUSED: prior W4000 candidate-free input incomplete")

def pr_attest():
    pr=json.loads(run(["gh","pr","view","418","--repo",REPO_SLUG,"--json",
       "number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url"],text=True))
    remote=run(["git","-C",str(REPO),"ls-remote","origin","refs/heads/main",
       "refs/heads/"+BRANCH,"refs/pull/418/head"],text=True)
    refs=sorted(x.split() for x in remote.splitlines() if x.strip())
    expected=sorted([[BASE,"refs/heads/main"],[HEAD,"refs/heads/"+BRANCH],[HEAD,"refs/pull/418/head"]])
    if refs!=expected: raise SystemExit("REFUSED: live refs differ")
    if (pr["number"],pr["state"],pr["isDraft"],pr["headRefName"],pr["headRefOid"],pr["baseRefName"],pr["baseRefOid"])!=(418,"OPEN",True,BRANCH,HEAD,"main",BASE):
        raise SystemExit("REFUSED: PR API differs")
    return {"repository":REPO_SLUG,"number":418,"state":pr["state"],"isDraft":pr["isDraft"],
      "headRefName":pr["headRefName"],"headRefOid":HEAD,"headTree":TREE,
      "baseRefName":pr["baseRefName"],"baseRefOid":BASE,"baseTree":BASETREE,"url":pr["url"],
      "remoteRefs":[{"sha":s,"ref":r} for s,r in refs],
      "attestedUtc":dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}

CODE_PATHS={
 "components.CollectionDetails":"src/components/CollectionDetails/index.tsx",
 "components.CollectionQueue":"src/components/CollectionDetails/CollectionQueueModal.tsx",
 "components.RequestEpisodeQueueControl":"src/components/RequestModal/RequestEpisodeQueueControl.tsx",
 "components.RequestEpisodeQueueModal":"src/components/RequestModal/RequestEpisodeQueueModal.tsx",
 "components.RequestModal":"src/components/RequestModal/TvRequestModal.tsx",
 "components.Requests":"src/components/Requests/index.tsx",
 "components.Settings.SettingsJobsCache":"src/components/Settings/SettingsJobsCache/jobMessages.ts",
 "components.Settings":"src/components/Settings/SettingsPlex.tsx",
 "discovery.accounts":"src/components/DiscoveryIntegrations/messages.ts",
}
RELATED_PATHS=[
 "src/components/CollectionDetails/index.tsx","src/components/CollectionDetails/CollectionQueueModal.tsx",
 "src/components/RequestModal/RequestEpisodeQueueControl.tsx","src/components/RequestModal/RequestEpisodeQueueModal.tsx",
 "src/components/RequestModal/TvRequestModal.tsx","src/components/Requests/index.tsx",
 "src/components/Settings/SettingsJobsCache/jobMessages.ts","src/components/Settings/SettingsJobsCache/index.tsx",
 "src/components/Settings/SettingsPlex.tsx","src/components/DiscoveryIntegrations/messages.ts",
 "src/components/DiscoveryIntegrations/Accounts.tsx",
]
def context_files():
    result={}
    for p in RELATED_PATHS:
        raw=git(HEAD,p); text=raw.decode(); result[p]={"raw":raw,"lines":text.splitlines(),"sha256":sha(raw),"gitBlob":blob(HEAD,p)}
    return result
def site(files,path,line,role,radius=2):
    info=files[path]; ls=info["lines"]; start=max(1,line-radius); end=min(len(ls),line+radius)
    return {"role":role,"path":path,"gitBlob":info["gitBlob"],"fileSha256":info["sha256"],
      "startLine":start,"endLine":end,"lines":[{"line":n,"text":ls[n-1],"lineSha256":shat(ls[n-1])} for n in range(start,end+1)]}
def matches(lines,pattern): return [i for i,line in enumerate(lines,1) if pattern.search(line)]
def spec(source_id):
    if source_id.startswith("discovery.accounts."):
        return {"path":CODE_PATHS["discovery.accounts"],"namespace":"discovery","prop":source_id[len("discovery."):],"var":"discoveryMessages"}
    namespace,prop=source_id.rsplit(".",1)
    group=namespace
    if group not in CODE_PATHS: raise ValueError("no source definition mapping "+source_id)
    return {"path":CODE_PATHS[group],"namespace":namespace,"prop":prop,
      "var":"jobMessages" if group=="components.Settings.SettingsJobsCache" else "messages"}
def caller_context(source_id,text,files):
    s=spec(source_id); path=s["path"]; lines=files[path]["lines"]; prop=s["prop"]
    nsline=matches(lines,re.compile(r"defineMessages\s*\(\s*['\"]"+re.escape(s["namespace"])+r"['\"]"))
    if not nsline: raise ValueError("no namespace definition "+source_id)
    keypat=re.compile(r"^\s*(?:"+re.escape(prop)+r"|['\"]"+re.escape(prop)+r"['\"])\s*:")
    prop_lines=[]
    for n in nsline:
        end=next((x for x in nsline if x>n),len(lines)+1)
        prop_lines.extend(x for x in matches(lines,keypat) if n<x<end)
    if not prop_lines: raise ValueError("no key property "+source_id)
    p_line=prop_lines[0]
    excerpt="\n".join(lines[p_line-1:min(len(lines),p_line+12)])
    if text not in excerpt: raise ValueError("source text not bound to code property "+source_id)
    n_line=max((n for n in nsline if n<p_line),default=nsline[0])
    sites=[site(files,path,n_line,"message-namespace-definition",1),site(files,path,p_line,"english-message-definition",2)]
    var=s["var"]
    if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*",prop):
        callerpat=re.compile(r"\b"+re.escape(var)+r"\s*\.\s*"+re.escape(prop)+r"\b")
    else:
        callerpat=re.compile(r"\b"+re.escape(var)+r"\s*\[\s*['\"]"+re.escape(prop)+r"['\"]\s*\]")
    for n in matches(lines,callerpat):
        if n!=p_line: sites.append(site(files,path,n,"direct-message-caller",2))
    if source_id.startswith("components.CollectionQueue."):
        status={"active","waiting","completed","stopped"}; reason={"playback-unlinked","request-policy","provider-unavailable","request-cancelled"}
        if prop in status:
            for n in matches(lines,re.compile(r"messages\s*\[\s*queue\.status\s*\]")): sites.append(site(files,path,n,"typed-queue-status-dynamic-caller",2))
            for n in matches(lines,re.compile(r"status\s*:\s*'active'.*'stopped'")): sites.append(site(files,path,n,"queue-status-domain",2))
        if prop in reason:
            for n in matches(lines,re.compile(r"messages\s*\[\s*queue\.reason\s*\]")): sites.append(site(files,path,n,"typed-queue-reason-dynamic-caller",2))
            for n in matches(lines,re.compile(r"reason\s*:")):
                if "playback-unlinked" in "\n".join(lines[n-1:min(len(lines),n+5)]): sites.append(site(files,path,n,"queue-reason-domain",3))
    if source_id.startswith(("components.CollectionDetails.","components.CollectionQueue.")):
        parent="src/components/CollectionDetails/index.tsx"
        for n in matches(files[parent]["lines"],re.compile(r"CollectionQueueModal|setQueueModal\(true\)")):
            sites.append(site(files,parent,n,"collection-queue-ui-entry",2))
    if source_id.startswith("components.RequestEpisodeQueueControl."):
        for parent,role in [
          ("src/components/RequestModal/RequestEpisodeQueueModal.tsx","episode-queue-control-modal-caller"),
          ("src/components/RequestModal/TvRequestModal.tsx","tv-request-control-caller")]:
            for n in matches(files[parent]["lines"],re.compile(r"<RequestEpisodeQueueControl\b")): sites.append(site(files,parent,n,role,3))
    if source_id.startswith("components.RequestEpisodeQueueModal."):
        parent="src/components/Requests/index.tsx"
        for n in matches(files[parent]["lines"],re.compile(r"<RequestEpisodeQueueModal\b")): sites.append(site(files,parent,n,"request-list-modal-caller",3))
    if source_id.startswith("components.Settings.SettingsJobsCache."):
        for n in matches(lines,re.compile(r"jobMessages\s*\[\s*jobId\s*\]")): sites.append(site(files,path,n,"typed-job-id-dynamic-caller",3))
        parent="src/components/Settings/SettingsJobsCache/index.tsx"
        for n in matches(files[parent]["lines"],re.compile(r"getJobMessage\s*\(")): sites.append(site(files,parent,n,"settings-jobs-table-caller",3))
    if source_id.startswith("discovery.accounts."):
        parent="src/components/DiscoveryIntegrations/Accounts.tsx"
        cp=re.compile(r"discoveryMessages\s*\[\s*['\"]"+re.escape(prop)+r"['\"]\s*\]")
        for n in matches(files[parent]["lines"],cp): sites.append(site(files,parent,n,"discovery-account-ui-caller",3))
    if not any(x["role"] not in {"message-namespace-definition","english-message-definition"} for x in sites):
        raise ValueError("no live caller "+source_id)
    material={"sourceId":source_id,"sourceTextSha256":shat(text),
      "definition":{"path":path,"gitBlob":files[path]["gitBlob"],"fileSha256":files[path]["sha256"],
        "namespace":s["namespace"],"property":prop,"namespaceLine":n_line,"propertyLine":p_line},
      "sites":sites}
    return {**material,"callerContextSha256":sha(canon(material)),
      "decisionEvidence":"Pinned runtime message definition and live UI caller are present; this ID is user-facing and requires translation. No exclusion is indicated by the source/caller context."}

def main():
    owned={"README.md","build_candidate_free.py","catalog-audit.json","caller-contexts.jsonl",
      "changed-source-cells.jsonl","gap-cells.jsonl","gap-source-ids.jsonl","gap-source-rows.jsonl",
      "manifest.json","pr-attestation.json","prior-pending-parity-follow-up.json",
      "prior-selected-source-hashes.jsonl","prior-source-order-hashes.jsonl","prior-source-reconciliation.jsonl","prior-w4000-reconciliation.json",
      "prior-w4000-selected-source-cells.jsonl","runtime-caller-file-pins.json","source-order-hashes.jsonl",
      "source-value-drift.jsonl","summary.json","token-audit.json"}
    if not OUT.is_dir() or not {p.name for p in OUT.iterdir()}<=owned:
        raise SystemExit("REFUSED: task output directory contains unrecognized files")
    for rev,tree in [(HEAD,TREE),(BASE,BASETREE),(OLD,OLDTREE)]:
        if gittext("rev-parse",rev+"^{tree}")!=tree: raise SystemExit("REFUSED: tree pin mismatch "+rev)
    verify_prior()
    att=pr_attest()

    catalog_paths={"en":EN,**{loc:PREFIX+path for loc,path in LOCALES.items()}}
    catalogs={}; raw_catalogs={}; cat_dups={}; catpins={}
    for locale,path in catalog_paths.items():
        raw=git(HEAD,path); obj,dups=parseobj(raw,path)
        catalogs[locale]=obj; raw_catalogs[locale]=raw; cat_dups[locale]=dups; catpins[locale]=pin(HEAD,path)
    if any(cat_dups.values()): raise SystemExit("REFUSED: duplicate key in scoped catalog")
    english=catalogs["en"]; current_ids=list(english); positions={k:i for i,k in enumerate(current_ids)}
    prior,_=parseobj(git(OLD,EN),"prior source"); base,_=parseobj(git(BASE,EN),"main source")
    additions=[k for k in current_ids if k not in prior]
    removals=[k for k in prior if k not in english]
    changed=[k for k in current_ids if k in prior and english[k]!=prior[k]]
    base_added=[k for k in current_ids if k not in base]
    base_removed=[k for k in base if k not in english]
    base_changed=[k for k in current_ids if k in base and english[k]!=base[k]]
    if (len(current_ids),len(prior),len(base),len(additions),len(changed),len(removals),len(base_added),len(base_removed),len(base_changed))!=(9537,9496,6880,41,1,0,2657,0,0):
        raise SystemExit("REFUSED: source drift counts differ from exact review scope")
    locales=list(LOCALES); targets={l:catalogs[l] for l in locales}
    missing_by_id={k:[l for l in locales if k not in targets[l]] for k in current_ids}
    missing=[k for k in current_ids if len(missing_by_id[k])==12]
    partial={k:v for k,v in missing_by_id.items() if 0<len(v)<12}
    extras={l:[k for k in targets[l] if k not in english] for l in locales}
    expected_missing=set(additions)|{"discovery.accounts.traktCallbackFailed","discovery.accounts.traktSetup"}
    if len(missing)!=43 or set(missing)!=expected_missing or partial or any(extras.values()):
        raise SystemExit("REFUSED: target parity gap set differs")
    changed_id="components.RequestModal.watchAheadActiveForRequest"
    if changed!=[changed_id] or any(k not in base or base[k]!=english[k] for k in additions) or base[changed_id]!=english[changed_id]:
        raise SystemExit("REFUSED: source additions/change do not match current main")

    registry_path="config/i18n/locales.json"; registry,registry_dups=parseobj(git(HEAD,registry_path),registry_path)
    if registry_dups: raise SystemExit("REFUSED: locale registry duplicate JSON keys")
    registry_by_file={e["clientFile"]:e for e in registry["locales"]}
    locale_registry={}
    for locale,filename in LOCALES.items():
        e=registry_by_file.get(filename)
        if not e: raise SystemExit("REFUSED: scoped file absent from runtime registry "+filename)
        locale_registry[locale]={"reviewLocale":locale,"registryTag":e["tag"],"clientFile":e["clientFile"],"serverFile":e["serverFile"],"reviewStatus":e.get("reviewStatus")}
    prior_window=json.loads((PREV/"window.json").read_text())
    if prior_window["localeOrder"]!=locales: raise SystemExit("REFUSED: locale order differs from previous candidate-free scope")

    prior_sel=readjl(PREV/"prior-selection-hash-reattestation.jsonl")
    if len(prior_sel)!=4000 or len({r["sourceIdSha256"] for r in prior_sel})!=4000: raise SystemExit("REFUSED: first 4000 selected IDs do not reconcile")
    prior_id_hashes={r["sourceIdSha256"] for r in prior_sel}
    prior_w4000=readjl(PREV/"selected-source-cells.jsonl")
    if len(prior_w4000)!=20: raise SystemExit("REFUSED: W4000 source count differs")
    current_pos_by_hash={shat(k):i for i,k in enumerate(current_ids)}
    prior_window_rows=[]
    for r in prior_w4000:
        p=current_pos_by_hash.get(r["sourceIdSha256"])
        if p is None or shat(english[current_ids[p]])!=r["sourceTextSha256"]: raise SystemExit("REFUSED: prior W4000 selected source changed")
        prior_window_rows.append({"priorPosition":r["position"],"currentPosition":p,"sourceId":r["sourceId"],
          "sourceIdSha256":r["sourceIdSha256"],"sourceTextSha256":r["sourceTextSha256"],"sourceTextUnchanged":True})
    pending=json.loads((PREV/"pending-catalog-parity-follow-up.json").read_text())
    pending_by_id={r["sourceId"]:r for r in pending["items"]}
    if len(pending_by_id)!=2 or not set(pending_by_id)<=set(missing): raise SystemExit("REFUSED: prior open Trakt gaps did not persist")

    cf=context_files()
    contexts=[]; context_map={}
    for source_id in missing+[changed_id]:
        c=caller_context(source_id,english[source_id],cf); contexts.append(c); context_map[source_id]=c

    gap_rows=[]; gap_ids=[]
    for source_id in missing:
        origin="added-since-prior-candidate-free-head" if source_id in additions else "preexisting-open-Trakt-parity-follow-up"
        c=context_map[source_id]; text=english[source_id]
        if origin.endswith("follow-up") and source_id not in pending_by_id: raise SystemExit("REFUSED: unsupported gap origin")
        row={"schemaVersion":1,"exactHead":HEAD,"exactTree":TREE,"baseMain":BASE,"baseMainTree":BASETREE,
          "sourceId":source_id,"position":positions[source_id],"sourceIdSha256":shat(source_id),
          "sourceText":text,"sourceTextSha256":shat(text),"sourceCatalogPath":EN,
          "sourceCatalogGitBlob":catpins["en"]["gitBlob"],"sourceCatalogSha256":catpins["en"]["sha256"],
          "currentMainContainsExactValue":base.get(source_id)==text,"priorCandidateFreeSourceHeadContainsId":source_id in prior,
          "addedSincePriorCandidateFreeHead":source_id in additions,"priorPendingParityRecord":source_id in pending_by_id,
          "origin":origin,"targetGapLocaleCount":12,"missingLocales":[l for l in locales if source_id not in targets[l]],
          "translationDecision":"translation-required","exclusionDecision":"not-excluded",
          "decisionEvidence":c["decisionEvidence"],"previouslySelectedAmongFirst4000Ids":shat(source_id) in prior_id_hashes,
          "sourceTokens":tokens(text),"callerContextSha256":c["callerContextSha256"]}
        row["sourceRowSha256"]=sha(canon(row)); gap_rows.append(row)
        gap_ids.append({"position":row["position"],"sourceId":source_id,"sourceIdSha256":row["sourceIdSha256"],
          "sourceTextSha256":row["sourceTextSha256"],"origin":origin,"decision":row["translationDecision"]})

    gap_cells=[]
    for g in gap_rows:
        for locale in locales:
            path=PREFIX+LOCALES[locale]
            gap_cells.append({"schemaVersion":1,"cellId":g["sourceId"]+"::"+locale,
              "sourceId":g["sourceId"],"sourceIdSha256":g["sourceIdSha256"],"sourceText":g["sourceText"],
              "sourceTextSha256":g["sourceTextSha256"],"sourcePosition":g["position"],"locale":locale,
              "targetCatalogPath":path,"targetCatalogGitBlob":catpins[locale]["gitBlob"],
              "targetCatalogSha256":catpins[locale]["sha256"],"currentTargetPresent":False,
              "currentTarget":None,"currentTargetSha256":None,"cellStatus":"missing-target",
              "translationDecision":"translation-required","sourceTokens":g["sourceTokens"],
              "targetTokenChecks":"not-applicable-target-is-absent","callerContextSha256":g["callerContextSha256"]})

    changed_text=english[changed_id]; old_text=prior[changed_id]; main_text=base[changed_id]
    changed_cells=[]
    for locale in locales:
        target=targets[locale][changed_id]
        changed_cells.append({"schemaVersion":1,"cellId":changed_id+"::"+locale,"sourceId":changed_id,
          "sourceIdSha256":shat(changed_id),"priorEnglishSourceText":old_text,"priorEnglishSourceSha256":shat(old_text),
          "currentEnglishSourceText":changed_text,"currentEnglishSourceSha256":shat(changed_text),
          "currentMainEnglishSourceText":main_text,"currentMainEnglishSourceSha256":shat(main_text),
          "sourceChangedSincePriorCandidateFreeHead":True,"currentSourceMatchesCurrentMain":changed_text==main_text,
          "locale":locale,"targetCatalogPath":PREFIX+LOCALES[locale],"targetCatalogGitBlob":catpins[locale]["gitBlob"],
          "targetCatalogSha256":catpins[locale]["sha256"],"currentTargetPresent":True,"currentTarget":target,
          "currentTargetSha256":shat(target),"sourceTokens":tokens(changed_text),"targetTokenChecks":checks(changed_text,target),
          "callerContextSha256":context_map[changed_id]["callerContextSha256"],
          "translationDecision":"translation-refresh-review-required","translationProposalIncluded":False})
    drift=[{"sourceId":changed_id,"sourceIdSha256":shat(changed_id),"priorEnglishSourceText":old_text,
      "priorEnglishSourceSha256":shat(old_text),"currentMainEnglishSourceText":main_text,
      "currentMainEnglishSourceSha256":shat(main_text),"currentPrEnglishSourceText":changed_text,
      "currentPrEnglishSourceSha256":shat(changed_text),"currentPrMatchesMain":changed_text==main_text,
      "priorSourceDiffers":old_text!=changed_text,"affectedTargetLocaleCount":12,"currentTargetCellsPresent":12,
      "callerContextSha256":context_map[changed_id]["callerContextSha256"],
      "refreshDisposition":"translation-refresh-review-required"}]

    order_rows=[{"position":i,"sourceIdSha256":shat(k),"sourceTextSha256":shat(english[k]),
      "sourceRecordSha256":sha(canon({"sourceId":k,"sourceText":english[k]}))} for i,k in enumerate(current_ids)]
    order_hash=sha(b"".join(canon(r) for r in order_rows))
    order_audits={}
    for locale in locales:
        actual=list(targets[locale]); present=set(actual); expected=[k for k in current_ids if k in present]
        mismatch=[{"position":i,"actualKeySha256":shat(actual[i]),"expectedKeySha256":shat(expected[i])}
          for i in range(min(len(actual),len(expected))) if actual[i]!=expected[i]]
        order_audits[locale]={"catalogPath":PREFIX+LOCALES[locale],"catalogSha256":catpins[locale]["sha256"],
          "keyCount":len(actual),"keySetSha256":sha(canon(sorted(actual))),
          "keyOrderSha256":sha(canon([shat(k) for k in actual])),
          "expectedEnglishSubsetOrderSha256":sha(canon([shat(k) for k in expected])),
          "keyOrderMatchesEnglishSubset":not mismatch,"keyOrderHammingMismatchPositions":len(mismatch),
          "firstMismatchExamples":mismatch[:10]}

    catalog_audit={"schemaVersion":1,
      "scope":"frontend src/i18n/locale: English plus the 12 direct target locales pinned by prior W4000",
      "catalogCount":13,"sourceCatalogPath":EN,"sourceKeyCount":len(english),
      "priorSourceHeadKeyCount":len(prior),"currentMainSourceKeyCount":len(base),"targetLocales":locales,
      "localeRegistryFile":{**pin(HEAD,registry_path),"configuredLocaleEntryCount":len(registry["locales"]),
        "inactiveCatalogs":registry.get("inactiveCatalogs",[]),"scopedLocaleRegistryMapping":locale_registry},
      "catalogPins":catpins,"catalogDuplicates":{k:len(v) for k,v in cat_dups.items()},
      "allCatalogsValidJson":True,"targetKeyCounts":{l:len(targets[l]) for l in locales},
      "targetMissingCounts":{l:len([x for x in english if x not in targets[l]]) for l in locales},
      "targetExtraKeyCounts":{l:len(extras[l]) for l in locales},"missingTargetIdsCount":43,
      "partialMissingIdsCount":len(partial),"missingIdSetSha256":sha(canon(sorted(missing))),
      "allMissingIdsMissingFromEveryTargetLocale":True,"orderAudit":order_audits,
      "sourceOrderHashOfRows":order_hash,"sourceOrderLength":len(order_rows)}

    prior_manifest=json.loads((PREV/"manifest.json").read_text())
    pending_ref=[]
    for item in pending["items"]:
        pending_ref.append({"sourceId":item["sourceId"],"sourceIdSha256":item["sourceIdSha256"],
          "sourceTextSha256":item["sourceTextSha256"],"priorPosition":item["position"],
          "currentPosition":positions[item["sourceId"]],"stillMissingInAll12Targets":item["sourceId"] in missing,
          "currentSourceTextMatchesPrior":english[item["sourceId"]]==item["sourceText"]})
    prior_ref={"path":str(PREV),"manifestSha256":sha((PREV/"manifest.json").read_bytes()),
      "checksumListSha256":sha((PREV/"SHA256SUMS.txt").read_bytes()),"oldHead":prior_manifest["head"],
      "oldTree":prior_manifest["tree"],"oldBaseRef":prior_manifest["baseRef"],"oldBaseSha":prior_manifest["baseSha"],
      "oldSelectedRange":prior_manifest["range"],"previousSelectedSourceIdCount":len(prior_sel),
      "w4000SelectedSourceCount":len(prior_w4000),"pendingParityItemCount":len(pending["items"]),
      "pendingParityIds":pending_ref,"w4000WindowRowsReconciledByIdHash":len(prior_window_rows),
      "w4000WindowRowsSourceTextsUnchanged":True,
      "w4000WindowRowsCurrentPositions":[{"priorPosition":r["priorPosition"],"currentPosition":r["currentPosition"],
        "sourceIdSha256":r["sourceIdSha256"]} for r in prior_window_rows]}

    # Copy only prior candidate-free hash/source records needed for offline lineage checks.
    (OUT/"prior-selected-source-hashes.jsonl").write_bytes((PREV/"prior-selection-hash-reattestation.jsonl").read_bytes())
    (OUT/"prior-w4000-selected-source-cells.jsonl").write_bytes((PREV/"selected-source-cells.jsonl").read_bytes())
    (OUT/"prior-source-order-hashes.jsonl").write_bytes((PREV/"source-order-hashes.jsonl").read_bytes())
    (OUT/"prior-pending-parity-follow-up.json").write_bytes((PREV/"pending-catalog-parity-follow-up.json").read_bytes())
    writejl("source-order-hashes.jsonl",order_rows)
    catalog_audit["sourceOrderHashFileSha256"]=sha((OUT/"source-order-hashes.jsonl").read_bytes())
    writej("catalog-audit.json",catalog_audit)
    writejl("gap-source-rows.jsonl",gap_rows); writejl("gap-source-ids.jsonl",gap_ids)
    writejl("gap-cells.jsonl",gap_cells); writejl("changed-source-cells.jsonl",changed_cells)
    writejl("source-value-drift.jsonl",drift); writejl("caller-contexts.jsonl",contexts)
    writejl("prior-source-reconciliation.jsonl",[{"sourceId":k,"sourceIdSha256":shat(k),
      "currentPosition":positions[k],"priorSelectedAmongFirst4000Ids":shat(k) in prior_id_hashes,
      "priorCandidateFreeSourceHeadContainsId":k in prior,
      "currentSourceTextSha256":shat(english[k]),
      "origin":"added-since-prior-candidate-free-head" if k in additions else
        "source-value-changed-since-prior-candidate-free-head" if k in changed else
        "preexisting-open-Trakt-parity-follow-up"} for k in sorted(set(missing+[changed_id]),key=lambda x:positions[x])])
    writej("prior-w4000-reconciliation.json",prior_ref); writej("pr-attestation.json",att)
    caller_paths=sorted({site["path"] for ctx in contexts for site in ctx["sites"]})
    writej("runtime-caller-file-pins.json",{"exactHead":HEAD,"exactTree":TREE,
      "files":[pin(HEAD,p) for p in caller_paths],"scope":"src TypeScript/TSX caller and message definition files for 44 reviewed IDs"})

    token_kinds=("placeholders","icuExpressions","markupTags","numericTokens","protectedLiterals","inlineCode")
    token_audit={"gapSourceTokenInventory":{
      kind:[{"sourceId":r["sourceId"],"position":r["position"],"tokens":r["sourceTokens"][kind]}
        for r in gap_rows if r["sourceTokens"][kind]] for kind in token_kinds},
      "changedSourceTargetParity":{
        kind:{"matchingCells":sum(bool(r["targetTokenChecks"]["checks"][kind]) for r in changed_cells),
          "mismatchingLocales":[r["locale"] for r in changed_cells if not r["targetTokenChecks"]["checks"][kind]]}
        for kind in token_kinds},
      "allChangedSourceTargetTokenChecksMatch":all(r["targetTokenChecks"]["allMatch"] for r in changed_cells),
      "gapTargetTokenParity":"not-applicable; all 516 target cells are absent"}
    writej("token-audit.json",token_audit)
    origins=dict(collections.Counter(r["origin"] for r in gap_rows))
    summary={"schemaVersion":1,"repository":REPO_SLUG,"pullRequest":418,"head":HEAD,"headTree":TREE,
      "baseRef":"main","baseSha":BASE,"baseTree":BASETREE,"priorCandidateFreeHead":OLD,
      "priorCandidateFreeTree":OLDTREE,"currentSourceCount":len(english),"currentMainSourceCount":len(base),
      "priorCandidateFreeSourceCount":len(prior),"sourceDeltaSincePriorHead":{"newIds":41,"changedValues":1,"removedIds":0},
      "sourceDeltaVsCurrentMain":{"headOnlyIds":2657,"mainOnlyIds":0,"sharedValueChanges":0},
      "newIdsPresentInCurrentMain":41,"missingTargetIds":43,"missingTargetCells":len(gap_cells),
      "changedSourceIds":1,"changedSourceExistingTargetCells":len(changed_cells),
      "totalReviewedCells":len(gap_cells)+len(changed_cells),"gapOriginCounts":origins,
      "translationDecisionCounts":{"translation-required":43,"translation-refresh-review-required":12,"excluded":0},
      "targetLocaleCount":12,"scopedCatalogCount":13,"missingIdsMissingFromAll12Targets":43,
      "partialMissingIds":0,"extraTargetIds":0,
      "targetOrderDivergentLocales":[l for l,a in order_audits.items() if not a["keyOrderMatchesEnglishSubset"]],
      "targetOrderMatchingLocales":[l for l,a in order_audits.items() if a["keyOrderMatchesEnglishSubset"]],
      "callerContextCount":len(contexts),"callerlessReviewSources":0,"tokenAudit":{"changedSourceTargetsAllTokenClassesMatch":all(r["targetTokenChecks"]["allMatch"] for r in changed_cells),"classes":["placeholders","icuExpressions","markupTags","numericTokens","protectedLiterals","inlineCode"]},
      "sourceIds":[{"sourceId":r["sourceId"],"position":r["position"],"sourceIdSha256":r["sourceIdSha256"],
        "origin":r["origin"],"decision":r["translationDecision"]} for r in gap_rows],
      "changedSourceId":changed_id,"changedSourceRefreshTargets":locales,
      "allNewGapIdsInCurrentMain":True,
      "allMissingIdsAbsentFromPriorFirst4000Selection":not any(shat(k) in prior_id_hashes for k in missing),
      "priorW4000PacketReconciled":True,"nativeSpeakerTranslationReviewPerformed":False,
      "translationProposalsIncluded":False,"primaryBlindOrCrossProposalInputsRead":False,
      "repositoryOrPrEdited":False,"testsBuildsScansCiOrWorkflowsRun":False,"result":"PASS",
      "inputPins":{"priorW4000ManifestSha256":prior_ref["manifestSha256"],
        "priorW4000ChecksumListSha256":prior_ref["checksumListSha256"],
        "currentEnglishCatalogSha256":catpins["en"]["sha256"],"currentEnglishCatalogGitBlob":catpins["en"]["gitBlob"],
        "currentMainEnglishCatalogSha256":sha(git(BASE,EN)),"priorEnglishCatalogSha256":sha(git(OLD,EN))}}
    writej("summary.json",summary)
    manifest={"artifact":"SeerrNG PR #418 W4000 lineage catalog parity audit","schemaVersion":1,
      "packetType":"candidate-free-audit","repository":REPO_SLUG,"pullRequest":418,"exactHead":HEAD,
      "exactTree":TREE,"baseRef":"main","baseSha":BASE,"baseTree":BASETREE,
      "priorCandidateFreeHead":OLD,"priorCandidateFreeTree":OLDTREE,"scopedCatalogCount":13,
      "sourceRows":43,"missingTargetCells":516,"changedSourceIds":1,
      "changedSourceExistingTargetCells":12,"totalCells":528,
      "translationDecisions":summary["translationDecisionCounts"],"translationProposalsIncluded":False,
      "nativeSpeakerTranslationReviewPerformed":False,
      "files":["README.md","build_candidate_free.py","catalog-audit.json","caller-contexts.jsonl","token-audit.json",
       "changed-source-cells.jsonl","gap-cells.jsonl","gap-source-ids.jsonl","gap-source-rows.jsonl",
       "manifest.json","pr-attestation.json","prior-pending-parity-follow-up.json",
       "prior-selected-source-hashes.jsonl","prior-source-order-hashes.jsonl","prior-source-reconciliation.jsonl","prior-w4000-reconciliation.json",
       "prior-w4000-selected-source-cells.jsonl","runtime-caller-file-pins.json","source-order-hashes.jsonl",
       "source-value-drift.jsonl","summary.json","verify_candidate_free.py"],"checksums":"SHA256SUMS.txt"}
    writej("manifest.json",manifest)
    readme=f"""# SeerrNG PR #418 candidate-free catalog parity audit

This packet is pinned to PR head {HEAD} / tree {TREE}, with base/main {BASE} / tree {BASETREE}. The PR was rechecked as open and draft at the same branch and pull refs.

The audit covers the 13 frontend catalogs in the prior W4000 localization scope: English plus 12 direct target locales. Current English has {len(english)} entries. The PR tree has 41 English IDs added since the prior candidate-free head, one changed English source value, and no removals. Current main contains all 41 added values and the updated source value. The current PR source catalog has 2,657 keys absent from current main; all but the 41 current additions are present in every scoped target catalog.

There are exactly 43 source IDs absent from every one of the 12 target catalogs, or 516 missing target cells. The 43 consist of 41 additions since the prior candidate-free head plus two previously recorded Trakt parity follow-ups. All 43 have pinned source definitions and live UI callers, so the decision is translation required; none are exclusions. The changed source ID {changed_id} is present in all 12 target catalogs. Its current English value matches main but differs from the prior candidate-free source, so its 12 existing target values need translation refresh review. Total audited scope is 528 cells.

The packet preserves the complete current English source order as hash-only rows and records all 13 catalog pins, current target key sets/order, caller contexts, source-token diagnostics, prior selected-source hash reconciliation, and the prior W4000 packet linkage.

No target proposals are included. No source catalog, target catalog, repository, PR, or workflow file was edited. No tests, builds, scans, or CI were run. Run the offline verifier using local Git objects with:

    python3 verify_candidate_free.py --repo /home/keith/Documents/code/seerrng

The verifier makes no network requests.
"""
    (OUT/"README.md").write_text(readme,encoding="utf-8")
    print(json.dumps({"result":"BUILT","head":HEAD,"tree":TREE,"catalogs":13,"gaps":len(gap_rows),
      "missingCells":len(gap_cells),"changedCells":len(changed_cells),"totalCells":len(gap_cells)+len(changed_cells),
      "callerContexts":len(contexts),"sourceIds":[r["sourceId"] for r in gap_rows]},ensure_ascii=False,indent=2))

if __name__=="__main__": main()
