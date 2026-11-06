#!/usr/bin/env python3
"""Offline verification of the primary semantic review and sealed inputs."""
from __future__ import annotations
import hashlib, json, re, sys
from collections import Counter
from pathlib import Path

HERE=Path(__file__).resolve().parent
INPUT=HERE.parent
HEAD="77d30ae742aad7245e6e419237fca6a544531e1f"
TREE="2c6fe4a0c1c33aa56b01f06a70702f68598509a7"
BASE="2647e15762de0c2285cd9d8ebc6d27ffafce6358"
BASETREE="b6f4acb9debdc1b0a838b50d5ad88aaa467e429b"
CHANGED="components.RequestModal.watchAheadActiveForRequest"
LOCALES=["es","zh-Hans","hi","de","ja","fr","pt-BR","ar","ko","zh-Hant","vi","id"]
EXPECTED_GAPS={
"components.CollectionDetails.queueCollection","components.CollectionQueue.active","components.CollectionQueue.buffer","components.CollectionQueue.completed","components.CollectionQueue.description","components.CollectionQueue.error","components.CollectionQueue.existing4k","components.CollectionQueue.loading","components.CollectionQueue.one","components.CollectionQueue.playback-unlinked","components.CollectionQueue.progress","components.CollectionQueue.provider-unavailable","components.CollectionQueue.quality","components.CollectionQueue.request-cancelled","components.CollectionQueue.request-policy","components.CollectionQueue.requestAccess","components.CollectionQueue.restart","components.CollectionQueue.start","components.CollectionQueue.stop","components.CollectionQueue.stopHelp","components.CollectionQueue.stopped","components.CollectionQueue.title","components.CollectionQueue.two","components.CollectionQueue.waiting","components.RequestEpisodeQueueControl.watchAheadEpisodeOption","components.RequestEpisodeQueueControl.watchAheadLoading","components.RequestEpisodeQueueControl.watchAheadOff","components.RequestEpisodeQueueControl.watchAheadOverride","components.RequestEpisodeQueueControl.watchAheadOverrideHelp","components.RequestEpisodeQueueControl.watchAheadSaveFailed","components.RequestEpisodeQueueControl.watchAheadSaved","components.RequestEpisodeQueueControl.watchAheadUseDefault","components.RequestEpisodeQueueModal.loadError","components.RequestEpisodeQueueModal.title","components.RequestModal.watchAheadOff","components.RequestModal.watchAheadOverrideDescription","components.Requests.episodeQueue","components.Settings.SettingsJobsCache.movie-collection-queue","components.Settings.SettingsJobsCache.plex-playback-analysis","components.Settings.analyzeOnPlayback","components.Settings.analyzeOnPlaybackTip","discovery.accounts.traktCallbackFailed","discovery.accounts.traktSetup"}
ICU_TYPES=("plural","select","selectordinal","number","date","time")
PLACEHOLDER=re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
MARKUP=re.compile(r"</?[A-Za-z][^>]*>")
NUMBERS=re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])")
PROTECTED=re.compile(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])")
EXTRA_PROTECTED=("SeerrNG","Seerr","BookshelfNG","ReadMeABook")
def need(ok,msg):
    if not ok: raise SystemExit("FAIL: "+msg)
def sha(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha(s.encode("utf-8"))
def canon(o): return (json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode("utf-8")
def readj(p): return json.loads(p.read_text(encoding="utf-8"))
def readjl(p): return [json.loads(s) for s in p.read_text(encoding="utf-8").splitlines() if s.strip()]
def parse_sums(path):
    out={}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        digest,name=line.split("  ",1)
        need(name not in out,"duplicate checksum path "+name)
        q=Path(name)
        need(not q.is_absolute() and ".." not in q.parts,"unsafe checksum path")
        out[name]=digest
    return out
def verify_packet_sums():
    sums=parse_sums(HERE/"SHA256SUMS.txt")
    actual={p.relative_to(HERE).as_posix() for p in HERE.rglob("*") if p.is_file() and p.name!="SHA256SUMS.txt"}
    need(set(sums)==actual,"primary checksum inventory differs from packet files")
    for name,digest in sums.items(): need(sha((HERE/name).read_bytes())==digest,"primary checksum mismatch "+name)
    manifest=readj(HERE/"manifest.json")
    need(set(manifest["files"])==set(sums)-{"manifest.json"},"manifest file inventory mismatch")
    return manifest

def verify_candidate_free_root(manifest):
    # Verify only the sealed packet's original root files. The required primary-review
    # child directory is intentionally outside that packet's original inventory.
    sums=parse_sums(INPUT/"SHA256SUMS.txt")
    actual={p.name for p in INPUT.iterdir() if p.is_file() and p.name!="SHA256SUMS.txt"}
    need(set(sums)==actual,"sealed candidate-free root-file inventory changed")
    for name,digest in sums.items(): need(sha((INPUT/name).read_bytes())==digest,"candidate-free input checksum mismatch "+name)
    need(sha((INPUT/"SHA256SUMS.txt").read_bytes())==manifest["candidateFreeChecksumsSha256"],"candidate-free checksum-list pin")
    source_manifest=readj(INPUT/"manifest.json")
    need(source_manifest["exactHead"]==HEAD and source_manifest["exactTree"]==TREE,"candidate-free source pin")
    need(source_manifest["baseSha"]==BASE and source_manifest["baseTree"]==BASETREE,"candidate-free base pin")

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
        m=re.match(r"^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*("+"|".join(ICU_TYPES)+r")\b",raw)
        if m:
            selectors=re.findall(r"(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{",raw)
            found.append({"argument":m.group(1),"formatType":m.group(2),"selectors":selectors,"usesPound":"#" in raw,"raw":raw})
    return found
def tokens(value):
    protected=list(dict.fromkeys(PROTECTED.findall(value)))
    protected.extend(x for x in EXTRA_PROTECTED if x in value and x not in protected)
    return {"placeholders":PLACEHOLDER.findall(value),"icuExpressions":icu(value),"markupTags":MARKUP.findall(value),"numericTokens":NUMBERS.findall(value),"protectedLiterals":protected,"inlineCode":re.findall(chr(96)+r"([^"+chr(96)+r"]+)"+chr(96),value)}
def checks(source,target):
    a,b=tokens(source),tokens(target)
    shape=lambda xs:[(x["argument"],x["formatType"],x["selectors"],x["usesPound"]) for x in xs]
    c={"placeholders":a["placeholders"]==b["placeholders"],"icuExpressions":shape(a["icuExpressions"])==shape(b["icuExpressions"]),"markupTags":a["markupTags"]==b["markupTags"],"numericTokens":a["numericTokens"]==b["numericTokens"],"protectedLiterals":all(x in b["protectedLiterals"] for x in a["protectedLiterals"]),"inlineCode":a["inlineCode"]==b["inlineCode"]}
    return {"checks":c,"allMatch":all(c.values()),"sourceTokens":a,"targetTokens":b,"missingProtectedLiterals":[x for x in a["protectedLiterals"] if x not in b["protectedLiterals"]]}

def verify():
    manifest=verify_packet_sums(); verify_candidate_free_root(manifest)
    need(manifest["packetType"]=="primary-semantic-review","packet type")
    need(manifest["sourceHead"]==HEAD and manifest["sourceTree"]==TREE and manifest["baseSha"]==BASE and manifest["baseTree"]==BASETREE,"manifest source pins")
    need(manifest["translationProposalsIncluded"] is True and manifest["otherReviewCandidatesRead"] is False,"proposal provenance")
    need(manifest["nativeSpeakerReviewPerformed"] is False,"native-speaker disclosure")
    gap_rows=readjl(INPUT/"gap-source-rows.jsonl")
    gap_cells={(x["sourceId"],x["locale"]):x for x in readjl(INPUT/"gap-cells.jsonl")}
    changed_cells={(x["sourceId"],x["locale"]):x for x in readjl(INPUT/"changed-source-cells.jsonl")}
    contexts={x["sourceId"]:x for x in readjl(INPUT/"caller-contexts.jsonl")}
    ledger=readjl(HERE/"review-ledger.jsonl"); proposals=readjl(HERE/"proposals.jsonl"); ids=readjl(HERE/"review-source-ids.jsonl")
    need(len(gap_rows)==43 and {x["sourceId"] for x in gap_rows}==EXPECTED_GAPS,"candidate-free gap source IDs")
    need(len(gap_cells)==516 and len(changed_cells)==12,"candidate-free cell scope")
    need(len(ledger)==528 and len(proposals)==528,"reviewed proposal cells")
    need(len(ids)==44 and len({x["sourceId"] for x in ids})==44,"review source ID inventory")
    need({x["sourceId"] for x in ids}==EXPECTED_GAPS|{CHANGED},"exact review source IDs")
    need((HERE/"hold-ledger.jsonl").read_text(encoding="utf-8")=="","unexpected hold entries")
    by_cell={r["cellId"]:r for r in ledger}; need(len(by_cell)==528,"duplicate review cell IDs")
    need(len({(r["sourceId"],r["locale"]) for r in ledger})==528,"duplicate source-locale review")
    expected_order=[]
    for source in gap_rows:
        for locale in LOCALES: expected_order.append((source["sourceId"],locale,"insertion-gap"))
    for locale in LOCALES: expected_order.append((CHANGED,locale,"changed-source-refresh"))
    need([(r["sourceId"],r["locale"],r["category"]) for r in ledger]==expected_order,"separate category order and full coverage")
    for r in ledger:
        need(r["sourceHead"]==HEAD and r["sourceTree"]==TREE,"review head/tree pin "+r["cellId"])
        need(r["semanticDisposition"]=="accept" and r["confidence"]=="moderate","review disposition/confidence "+r["cellId"])
        need(r["callerContextReviewed"] is True and r["sourceContextSha256"]==contexts[r["sourceId"]]["callerContextSha256"],"caller context pin "+r["cellId"])
        need(all(r["localeReviewChecks"].values()),"semantic/locale review checks "+r["cellId"])
        need(bool(r.get("semanticReviewRationale")) and bool(r.get("localeEditorialNote")),"review rationale/note "+r["cellId"])
        if r["sourceId"]=="components.CollectionQueue.existing4k": need("4K" in r["proposedTarget"],"4K quality option literal "+r["cellId"])
        if r["sourceId"]=="components.Settings.analyzeOnPlaybackTip": need(all(x in r["proposedTarget"] for x in ("TV","30","Plex","Plex Pass")),"playback tip literals "+r["cellId"])
        if r["sourceId"]=="discovery.accounts.traktSetup": need("/api/v1/integrations/discovery/trakt/callback" in r["proposedTarget"],"Trakt callback route "+r["cellId"])
        need(r["proposedTargetSha256"]==sha_text(r["proposedTarget"]),"proposal text hash "+r["cellId"])
        need(r["tokenChecks"]==checks(r["sourceText"],r["proposedTarget"]),"proposal token diagnostics "+r["cellId"])
        need(r["tokenChecks"]["allMatch"],"proposal token mismatch "+r["cellId"])
        cp=dict(r); dig=cp.pop("recordSha256"); need(dig==sha(canon(cp)),"review row hash "+r["cellId"])
        if r["category"]=="insertion-gap":
            inp=gap_cells[(r["sourceId"],r["locale"])]
            src=next(x for x in gap_rows if x["sourceId"]==r["sourceId"])
            need(r["disposition"]=="propose-insert" and r["currentTargetPresent"] is False and r["currentTarget"] is None,"insertion disposition/current cell "+r["cellId"])
            need(r["sourceText"]==src["sourceText"] and r["sourceTextSha256"]==src["sourceTextSha256"],"insertion English source pin "+r["cellId"])
            need(r["inputCellSha256"]==sha(canon(inp)),"insertion input-cell pin "+r["cellId"])
            need(inp["currentTargetPresent"] is False and inp["currentTarget"] is None,"insertion cell is not missing "+r["cellId"])
        else:
            inp=changed_cells[(CHANGED,r["locale"])]
            need(r["disposition"]=="propose-refresh" and r["currentTargetPresent"] is True,"refresh disposition "+r["cellId"])
            need(r["currentTarget"]==inp["currentTarget"] and r["currentTargetSha256"]==inp["currentTargetSha256"],"existing target pin "+r["cellId"])
            need(r["sourceText"]==inp["currentEnglishSourceText"] and r["sourceTextSha256"]==inp["currentEnglishSourceSha256"],"changed English source pin "+r["cellId"])
            need(r["priorSourceText"]==inp["priorEnglishSourceText"] and r["priorSourceTextSha256"]==inp["priorEnglishSourceSha256"],"prior source pin "+r["cellId"])
            need(r["inputCellSha256"]==sha(canon(inp)),"refresh input-cell pin "+r["cellId"])
    for p,r in zip(proposals,ledger):
        expected={k:r[k] for k in ("cellId","category","sourceId","locale","sourceTextSha256","proposedTarget","proposedTargetSha256","disposition","confidence","sourceHead","sourceTree")}
        need(p==expected,"proposal/ledger mismatch "+r["cellId"])
    need(Counter(r["category"] for r in ledger)==Counter({"insertion-gap":516,"changed-source-refresh":12}),"category counts")
    need(Counter(r["disposition"] for r in ledger)==Counter({"propose-insert":516,"propose-refresh":12}),"disposition counts")
    need(all(Counter(r["locale"] for r in ledger if r["category"]==cat)==Counter({l:(43 if cat=="insertion-gap" else 1) for l in LOCALES}) for cat in ("insertion-gap","changed-source-refresh")),"locale counts")
    summary=readj(HERE/"summary.json")
    need(summary["totalReviewedCells"]==528 and summary["insertionGapCells"]==516 and summary["changedSourceRefreshCells"]==12,"summary totals")
    need(summary["heldCells"]==0 and summary["acceptedForProposal"]==528 and summary["confidence"]=={"moderate":528},"summary dispositions")
    for name in ("attestations-before.json","attestations-after.json"):
        att=readj(HERE/name)
        need(att["pullRequestState"]["state"]=="OPEN" and att["pullRequestState"]["isDraft"] is True,"live PR state in "+name)
        need(att["pullRequestState"]["headRefOid"]==HEAD and att["pullRequestState"]["baseRefOid"]==BASE,"live refs in "+name)
        need(att["pullRequestState"]["headRefName"]=="codex/seerrng-localization-overhaul-20261028" and att["pullRequestState"]["baseRefName"]=="main","live branch names in "+name)
        need(att["headTree"]==TREE and att["baseTree"]==BASETREE,"attestation trees in "+name)
        need(att["candidateFreeManifestSha256"]==sha((INPUT/"manifest.json").read_bytes()),"attestation candidate-free manifest in "+name)
        refs=att["remoteRefs"]
        need(refs.get("refs/heads/main")==BASE and refs.get("refs/heads/codex/seerrng-localization-overhaul-20261028")==HEAD and refs.get("refs/pull/418/head")==HEAD,"remote ref pins in "+name)
        need(att["candidateFreeChecksumsSha256"]==manifest["candidateFreeChecksumsSha256"],"attestation input checksums in "+name)
    print("PASS: primary packet checksums, sealed candidate-free root inputs, 528 cells (516 insertions + 12 refreshes), 44 source/context pins, exact token checks, dispositions, and before/after PR head attestations.")

if __name__=="__main__": verify()
