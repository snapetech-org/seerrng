#!/usr/bin/env python3
"""Offline verification for the SeerrNG PR #418 parity packet.

No network calls are made. With --repo, pins are checked against local Git objects.
"""
from __future__ import annotations
import argparse, collections, hashlib, json, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode = True
import build_candidate_free as b

HERE=Path(__file__).resolve().parent
HEAD=b.HEAD; TREE=b.TREE; BASE=b.BASE; BASETREE=b.BASETREE; OLD=b.OLD; OLDTREE=b.OLDTREE
LOCALES=list(b.LOCALES)
EN=b.EN
EXPECTED_GAPS={
 "components.CollectionDetails.queueCollection",
 "components.CollectionQueue.active","components.CollectionQueue.buffer","components.CollectionQueue.completed",
 "components.CollectionQueue.description","components.CollectionQueue.error","components.CollectionQueue.existing4k",
 "components.CollectionQueue.loading","components.CollectionQueue.one","components.CollectionQueue.playback-unlinked",
 "components.CollectionQueue.progress","components.CollectionQueue.provider-unavailable","components.CollectionQueue.quality",
 "components.CollectionQueue.request-cancelled","components.CollectionQueue.request-policy",
 "components.CollectionQueue.requestAccess","components.CollectionQueue.restart","components.CollectionQueue.start",
 "components.CollectionQueue.stop","components.CollectionQueue.stopHelp","components.CollectionQueue.stopped",
 "components.CollectionQueue.title","components.CollectionQueue.two","components.CollectionQueue.waiting",
 "components.RequestEpisodeQueueControl.watchAheadEpisodeOption","components.RequestEpisodeQueueControl.watchAheadLoading",
 "components.RequestEpisodeQueueControl.watchAheadOff","components.RequestEpisodeQueueControl.watchAheadOverride",
 "components.RequestEpisodeQueueControl.watchAheadOverrideHelp","components.RequestEpisodeQueueControl.watchAheadSaveFailed",
 "components.RequestEpisodeQueueControl.watchAheadSaved","components.RequestEpisodeQueueControl.watchAheadUseDefault",
 "components.RequestEpisodeQueueModal.loadError","components.RequestEpisodeQueueModal.title",
 "components.RequestModal.watchAheadOff","components.RequestModal.watchAheadOverrideDescription",
 "components.Requests.episodeQueue","components.Settings.SettingsJobsCache.movie-collection-queue",
 "components.Settings.SettingsJobsCache.plex-playback-analysis","components.Settings.analyzeOnPlayback",
 "components.Settings.analyzeOnPlaybackTip","discovery.accounts.traktCallbackFailed","discovery.accounts.traktSetup"
}
CHANGED="components.RequestModal.watchAheadActiveForRequest"

def need(ok,msg):
    if not ok: raise SystemExit("FAIL: "+msg)
def readjl(path):
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
def readj(path):
    return json.loads(path.read_text(encoding="utf-8"))
def sha(data): return hashlib.sha256(data).hexdigest()
def run(repo,args):
    return subprocess.check_output(["git","-C",str(repo),*args])
def verify_sums():
    listed={}
    for line in (HERE/"SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        digest,name=line.split("  ",1)
        p=Path(name)
        need(not p.is_absolute() and ".." not in p.parts,"unsafe checksum entry")
        need(name not in listed,"duplicate checksum entry "+name)
        need((HERE/p).is_file(),"missing output file "+name)
        need(sha((HERE/p).read_bytes())==digest,"checksum mismatch "+name)
        listed[name]=digest
    actual={p.relative_to(HERE).as_posix() for p in HERE.rglob("*") if p.is_file() and p.name!="SHA256SUMS.txt"}
    need(set(listed)==actual,"checksum inventory differs from packet files")
    return listed

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",type=Path,help="local repository object database for exact tree verification")
    ap.add_argument("--packet-only",action="store_true",help="skip Git-object pin checks")
    args=ap.parse_args()
    sums=verify_sums()
    manifest=readj(HERE/"manifest.json")
    summary=readj(HERE/"summary.json")
    att=readj(HERE/"pr-attestation.json")
    need(manifest["packetType"]=="candidate-free-audit","packet type")
    need(manifest["exactHead"]==summary["head"]==att["headRefOid"]==HEAD,"head pin")
    need(manifest["exactTree"]==summary["headTree"]==att["headTree"]==TREE,"head tree pin")
    need(manifest["baseSha"]==summary["baseSha"]==att["baseRefOid"]==BASE,"base pin")
    need(manifest["baseTree"]==summary["baseTree"]==att["baseTree"]==BASETREE,"base tree pin")
    need(manifest["priorCandidateFreeHead"]==summary["priorCandidateFreeHead"]==OLD,"prior source head pin")
    need(manifest["priorCandidateFreeTree"]==summary["priorCandidateFreeTree"]==OLDTREE,"prior source tree pin")
    need(att["state"]=="OPEN" and att["isDraft"] is True and att["headRefName"]==b.BRANCH,"PR state/ref snapshot")
    need(att["remoteRefs"]==[
        {"sha":BASE,"ref":"refs/heads/main"},
        {"sha":HEAD,"ref":"refs/heads/"+b.BRANCH},
        {"sha":HEAD,"ref":"refs/pull/418/head"},
    ],"remote ref snapshot")
    files=set(manifest["files"])
    need(files==set(sums),"manifest/checksum file inventory")
    need(summary["translationProposalsIncluded"] is False and manifest["translationProposalsIncluded"] is False,"no-proposal statement")
    need(summary["primaryBlindOrCrossProposalInputsRead"] is False,"candidate-free input statement")
    need(summary["repositoryOrPrEdited"] is False and summary["testsBuildsScansCiOrWorkflowsRun"] is False,"no mutation/CI statement")

    gaps=readjl(HERE/"gap-source-rows.jsonl")
    ids=readjl(HERE/"gap-source-ids.jsonl")
    cells=readjl(HERE/"gap-cells.jsonl")
    changed=readjl(HERE/"changed-source-cells.jsonl")
    drift=readjl(HERE/"source-value-drift.jsonl")
    contexts=readjl(HERE/"caller-contexts.jsonl")
    order=readjl(HERE/"source-order-hashes.jsonl")
    prior_hashes=readjl(HERE/"prior-selected-source-hashes.jsonl")
    prior_order=readjl(HERE/"prior-source-order-hashes.jsonl")
    prior_w4000=readjl(HERE/"prior-w4000-selected-source-cells.jsonl")
    pending=readj(HERE/"prior-pending-parity-follow-up.json")
    prior_rec=readj(HERE/"prior-w4000-reconciliation.json")
    rec_rows=readjl(HERE/"prior-source-reconciliation.jsonl")
    catalog=readj(HERE/"catalog-audit.json")
    pins=readj(HERE/"runtime-caller-file-pins.json")
    token_audit=readj(HERE/"token-audit.json")

    need(len(gaps)==43 and len(ids)==43 and len(cells)==516,"43 source IDs / 516 missing cells")
    need(len(changed)==12 and len(drift)==1 and len(contexts)==44,"changed-source cells and caller contexts")
    need(len(order)==9537 and [x["position"] for x in order]==list(range(9537)),"full current source order")
    need(len(prior_order)==9496 and [x["position"] for x in prior_order]==list(range(9496)),"full prior English source order")
    need(len(prior_hashes)==4000 and len(prior_w4000)==20,"prior selected-source inventory")
    need(len(pending["items"])==2,"prior pending Trakt item count")
    gap_set={x["sourceId"] for x in gaps}
    need(gap_set==EXPECTED_GAPS,"exact 43 missing source IDs")
    need({x["sourceId"] for x in ids}==gap_set,"source ID index coverage")
    need({x["sourceId"] for x in changed}=={CHANGED},"changed-source ID")
    need(len({x["cellId"] for x in cells})==516 and len({x["cellId"] for x in changed})==12,"cell uniqueness")
    need(len({x["sourceId"] for x in contexts})==44,"caller context uniqueness")
    need(set(x["sourceId"] for x in contexts)==gap_set|{CHANGED},"caller context coverage")

    # Bind every source row to full current order, tokens, and context evidence.
    order_by_id={row["sourceIdSha256"]:row for row in order}
    prior_by_id={row["sourceIdSha256"]:row for row in prior_order}
    prior_selected={row["sourceIdSha256"] for row in prior_hashes}
    need(len(prior_selected)==4000,"prior source ID hash uniqueness")
    ctx_by_id={row["sourceId"]:row for row in contexts}
    for row in gaps:
        need(row["exactHead"]==HEAD and row["exactTree"]==TREE,"gap pin "+row["sourceId"])
        need(row["sourceIdSha256"]==b.shat(row["sourceId"]),"gap ID hash "+row["sourceId"])
        need(row["sourceTextSha256"]==b.shat(row["sourceText"]),"gap text hash "+row["sourceId"])
        need(order_by_id[row["sourceIdSha256"]]["sourceTextSha256"]==row["sourceTextSha256"],"current source order binding "+row["sourceId"])
        need(row["sourceTokens"]==b.tokens(row["sourceText"]),"source token inventory "+row["sourceId"])
        need(row["translationDecision"]=="translation-required" and row["exclusionDecision"]=="not-excluded","gap decision "+row["sourceId"])
        need(row["previouslySelectedAmongFirst4000Ids"] is False and row["sourceIdSha256"] not in prior_selected,"prior-selection exclusion "+row["sourceId"])
        need(row["callerContextSha256"]==ctx_by_id[row["sourceId"]]["callerContextSha256"],"caller binding "+row["sourceId"])
        copy=dict(row); digest=copy.pop("sourceRowSha256")
        need(digest==sha(b.canon(copy)),"source row checksum "+row["sourceId"])
        prior_match=prior_by_id.get(row["sourceIdSha256"])
        if row["origin"]=="added-since-prior-candidate-free-head":
            need(prior_match is None,"new source ID already in prior tree "+row["sourceId"])
        else:
            need(row["sourceId"] in {x["sourceId"] for x in pending["items"]},"unrecognized preexisting gap "+row["sourceId"])
            need(prior_match is not None and prior_match["sourceTextSha256"]==row["sourceTextSha256"],"pending source binding "+row["sourceId"])
    # Verify source drift against old head using complete hash-only source order.
    old_ids={r["sourceIdSha256"]:r for r in prior_order}
    current_ids={r["sourceIdSha256"]:r for r in order}
    need(len(set(current_ids)-set(old_ids))==41,"source additions vs prior tree")
    need(len(set(old_ids)-set(current_ids))==0,"source removals vs prior tree")
    changed_hashes=[h for h in set(old_ids)&set(current_ids) if old_ids[h]["sourceTextSha256"]!=current_ids[h]["sourceTextSha256"]]
    need(len(changed_hashes)==1 and changed_hashes[0]==b.shat(CHANGED),"source value change vs prior tree")
    # The two older Trakt gaps are the only missing IDs already present in the prior source tree.
    need({r["sourceId"] for r in gaps if r["origin"]=="preexisting-open-Trakt-parity-follow-up"}==
      {r["sourceId"] for r in pending["items"]},"pending Trakt lineage")

    # The missing cells have no current target text; changed-source rows contain the 12 current values.
    gap_lookup={(r["sourceId"],r["locale"]):r for r in cells}
    need(len(gap_lookup)==516,"missing target matrix")
    for source in gaps:
        for locale in b.LOCALES:
            row=gap_lookup[(source["sourceId"],locale)]
            need(row["currentTargetPresent"] is False and row["currentTarget"] is None and row["currentTargetSha256"] is None,"missing target text "+row["cellId"])
            need(row["cellStatus"]=="missing-target" and row["translationDecision"]=="translation-required","gap status "+row["cellId"])
            need(row["sourceTextSha256"]==source["sourceTextSha256"] and row["callerContextSha256"]==source["callerContextSha256"],"cell source/context binding "+row["cellId"])
            need(not any(k in row for k in ("proposedTarget","reviewedTarget","suggestedTarget")),"proposal field in gap cell")
    for row in changed:
        need(row["currentTargetPresent"] is True and isinstance(row["currentTarget"],str),"changed target missing "+row["cellId"])
        need(row["sourceChangedSincePriorCandidateFreeHead"] is True and row["currentSourceMatchesCurrentMain"] is True,"changed source lineage "+row["cellId"])
        need(row["currentEnglishSourceText"]==row["currentMainEnglishSourceText"] and row["currentEnglishSourceText"]!=row["priorEnglishSourceText"],"changed source values "+row["cellId"])
        need(row["currentTargetSha256"]==b.shat(row["currentTarget"]),"changed target hash "+row["cellId"])
        need(row["sourceTokens"]==b.tokens(row["currentEnglishSourceText"]),"changed source token inventory "+row["cellId"])
        actual=b.checks(row["currentEnglishSourceText"],row["currentTarget"])
        need(actual==row["targetTokenChecks"],"changed target token diagnostics "+row["cellId"])
        need(row["translationDecision"]=="translation-refresh-review-required" and row["translationProposalIncluded"] is False,"refresh disposition "+row["cellId"])
    need(all(r["targetTokenChecks"]["allMatch"] for r in changed),"changed-source current target token parity")
    need(drift[0]["sourceId"]==CHANGED and drift[0]["refreshDisposition"]=="translation-refresh-review-required","source drift record")

    # Reconcile prior 4,000 selected source IDs hash-only, the W4000 source window, and old pending items.
    need(len(rec_rows)==44,"prior source reconciliation rows")
    for row in rec_rows:
        need(row["priorSelectedAmongFirst4000Ids"]==(row["sourceIdSha256"] in prior_selected),"prior source hash status "+row["sourceId"])
    current_hash_to_record={r["sourceIdSha256"]:r for r in order}
    for old in prior_w4000:
        now=current_hash_to_record.get(old["sourceIdSha256"])
        need(now is not None and now["sourceTextSha256"]==old["sourceTextSha256"],"prior W4000 source continuity "+old["sourceId"])
    for item in pending["items"]:
        matching=next(r for r in gaps if r["sourceId"]==item["sourceId"])
        need(item["sourceTextSha256"]==matching["sourceTextSha256"] and item["sourceIdSha256"]==matching["sourceIdSha256"],"prior Trakt follow-up binding")
        need(all(matching["sourceId"] not in item["missingLocales"] or loc==item["missingLocales"][0] for loc in item["missingLocales"]),"prior pending locales")

    # Validate caller-context hashes and all literal code pins.
    by_path={x["path"]:x for x in pins["files"]}
    for context in contexts:
        material={k:context[k] for k in ("sourceId","sourceTextSha256","definition","sites")}
        need(context["callerContextSha256"]==sha(b.canon(material)),"caller-context digest "+context["sourceId"])
        need(context["definition"]["path"] in by_path,"caller definition file pin "+context["sourceId"])
        need(any(site["role"] not in {"message-namespace-definition","english-message-definition"} for site in context["sites"]),"no runtime caller "+context["sourceId"])
        for site in context["sites"]:
            need(site["path"] in by_path,"context file missing pin "+site["path"])
            for line in site["lines"]:
                need(line["lineSha256"]==b.shat(line["text"]),"context line hash "+site["path"])
    for pin in pins["files"]:
        need(pin["path"].startswith("src/"),"caller file path outside src/")
    need(summary["callerContextCount"]==44 and summary["callerlessReviewSources"]==0,"caller coverage summary")

    # Validate previous/current source order hashes and target locale inventories.
    need(catalog["catalogCount"]==13 and catalog["sourceKeyCount"]==9537 and catalog["missingTargetIdsCount"]==43,"catalog scope")
    need(catalog["sourceOrderHashFileSha256"]==sha((HERE/"source-order-hashes.jsonl").read_bytes()),"current order file pin")
    need(catalog["sourceOrderLength"]==len(order),"current order length")
    need(summary["sourceDeltaSincePriorHead"]=={"newIds":41,"changedValues":1,"removedIds":0},"source delta summary")
    need(summary["missingTargetCells"]==516 and summary["changedSourceExistingTargetCells"]==12 and summary["totalReviewedCells"]==528,"528-cell summary")
    need(summary["translationDecisionCounts"]=={"translation-required":43,"translation-refresh-review-required":12,"excluded":0},"decision summary")
    need(summary["targetOrderDivergentLocales"]==["zh-Hans","ja","ko","zh-Hant","vi"],"target order inventory")
    need(token_audit["allChangedSourceTargetTokenChecksMatch"] is True,"token audit summary")

    if args.repo and not args.packet_only:
        repo=args.repo.resolve()
        for rev,tree in [(HEAD,TREE),(BASE,BASETREE),(OLD,OLDTREE)]:
            need(run(repo,["rev-parse",rev+"^{tree}"]).decode().strip()==tree,"Git tree "+rev)
        actual_cats={}
        for locale,path in {"en":EN,**{l:b.PREFIX+f for l,f in b.LOCALES.items()}}.items():
            raw=run(repo,["show",f"{HEAD}:{path}"])
            pin=catalog["catalogPins"][locale]
            need(sha(raw)==pin["sha256"],"catalog SHA256 "+locale)
            need(run(repo,["rev-parse",f"{HEAD}:{path}"]).decode().strip()==pin["gitBlob"],"catalog Git blob "+locale)
            actual_cats[locale]=json.loads(raw)
        english=actual_cats["en"]
        ids_now=list(english)
        need(len(ids_now)==9537,"current source catalog count")
        actual_missing={k for k in english if all(k not in actual_cats[l] for l in LOCALES)}
        need(actual_missing==EXPECTED_GAPS,"live catalog gap set")
        for locale in LOCALES:
            target=actual_cats[locale]
            need(len(target)==9494 and not (set(target)-set(english)),"target catalog key parity "+locale)
            need({k for k in english if k not in target}==EXPECTED_GAPS,"target missing set "+locale)
        actual_order=[{"position":i,"sourceIdSha256":b.shat(k),"sourceTextSha256":b.shat(english[k]),
          "sourceRecordSha256":sha(b.canon({"sourceId":k,"sourceText":english[k]}))} for i,k in enumerate(ids_now)]
        need(actual_order==order,"source order hash rows")
        prior_en=json.loads(run(repo,["show",f"{OLD}:{EN}"]))
        current_en=json.loads(run(repo,["show",f"{BASE}:{EN}"]))
        need(sum(k not in prior_en for k in english)==41 and sum(k not in english for k in prior_en)==0,"source additions vs prior Git tree")
        need([k for k in english if k in prior_en and english[k]!=prior_en[k]]==[CHANGED],"source value drift vs prior Git tree")
        need(all(current_en.get(r["sourceId"])==r["sourceText"] for r in gaps),"missing source values equal current main")
        need(current_en.get(CHANGED)==english[CHANGED],"changed source equals main")
        # Compare caller contexts with exact source code blobs and line content at the pinned head.
        for pin in pins["files"]:
            raw=run(repo,["show",f"{HEAD}:{pin['path']}"])
            need(sha(raw)==pin["sha256"],"caller source SHA256 "+pin["path"])
            need(run(repo,["rev-parse",f"{HEAD}:{pin['path']}"]).decode().strip()==pin["gitBlob"],"caller source blob "+pin["path"])
            code_lines=raw.decode().splitlines()
            for context in contexts:
                for site in context["sites"]:
                    if site["path"]!=pin["path"]: continue
                    actual=code_lines[site["startLine"]-1:site["endLine"]]
                    expected=[x["text"] for x in site["lines"]]
                    need(actual==expected,"caller source context "+context["sourceId"])
        print("PASS: packet checksums, 528 cells, 13 catalog pins, 43 gaps, changed-source refresh, source/caller contexts, prior W4000 lineage, and local Git objects.")
    else:
        print("PASS: packet checksums and internal 528-cell/source/caller/prior-lineage consistency (packet-only; Git objects not checked).")

if __name__=="__main__": main()
