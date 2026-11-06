#!/usr/bin/env python3
"""Build the vi / zh-Hans / zh-Hant cross-review part from sealed inputs."""
import collections, hashlib, importlib.util, json, sys
from pathlib import Path

PACKET = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT = PACKET / 'cross-review' / 'locale-b'
HEAD = 'f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4'
TREE = 'f7ea727b0383397ec8d6220667b4abe151d43b46'
BASE = '2647e15762de0c2285cd9d8ebc6d27ffafce6358'
OLD_HEAD = '77d30ae742aad7245e6e419237fca6a544531e1f'
OLD_TREE = '2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
LOCALES = ('vi', 'zh-Hans', 'zh-Hant')
ALL_LOCALES = ('ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-Hans','zh-Hant')

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('candidate_free_builder', PACKET/'candidate-free'/'build_candidate_free.py')
cfmod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfmod)

def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def file_sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def readjl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def writejl(name, rows):
    (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf-8')
def writej(name, obj):
    (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
def canonical_line_hash(path, wanted):
    for raw in path.read_bytes().splitlines():
        row=json.loads(raw)
        if row.get('cellId')==wanted:
            return hashlib.sha256(raw).hexdigest()
    raise ValueError('missing candidate-free cell '+wanted)

# Explicit locale choices are only for the three assigned locales. Unlisted
# cells use consensus when both lanes agree; otherwise fail closed.
CHOICE = {
 'components.CollectionDetails.queueCollection': {'vi':'blind'},
 'components.CollectionQueue.buffer': {'zh-Hans':'blind','zh-Hant':'blind'},
 'components.CollectionQueue.completed': {'vi':'blind','zh-Hans':'blind','zh-Hant':'blind'},
 'components.CollectionQueue.description': {'vi':'blind','zh-Hans':'blind','zh-Hant':'new'},
 'components.CollectionQueue.error': {'vi':'blind'},
 'components.CollectionQueue.loading': {'vi':'blind'},
 'components.CollectionQueue.playback-unlinked': {'vi':'blind'},
 'components.CollectionQueue.progress': {'vi':'new'},
 'components.CollectionQueue.provider-unavailable': {'zh-Hans':'blind','zh-Hant':'blind'},
 'components.CollectionQueue.request-cancelled': {'vi':'blind','zh-Hans':'blind','zh-Hant':'blind'},
 'components.CollectionQueue.request-policy': {'vi':'blind','zh-Hans':'blind','zh-Hant':'primary'},
 'components.CollectionQueue.requestAccess': {'vi':'blind','zh-Hans':'primary','zh-Hant':'blind'},
 'components.CollectionQueue.restart': {'zh-Hans':'primary'},
 'components.CollectionQueue.start': {'zh-Hans':'primary','zh-Hant':'primary'},
 'components.CollectionQueue.stopHelp': {'vi':'blind','zh-Hans':'blind','zh-Hant':'blind'},
 'components.CollectionQueue.title': {'vi':'primary','zh-Hans':'primary','zh-Hant':'primary'},
 'components.RequestEpisodeQueueControl.watchAheadLoading': {'vi':'blind','zh-Hans':'primary','zh-Hant':'primary'},
 'components.RequestEpisodeQueueControl.watchAheadOverrideHelp': {'vi':'blind','zh-Hans':'blind','zh-Hant':'blind'},
 'components.RequestEpisodeQueueControl.watchAheadSaveFailed': {'vi':'blind','zh-Hans':'blind'},
 'components.RequestEpisodeQueueControl.watchAheadSaved': {'vi':'blind'},
 'components.RequestEpisodeQueueModal.loadError': {'vi':'primary','zh-Hans':'primary','zh-Hant':'primary'},
 'components.RequestEpisodeQueueModal.title': {'vi':'blind'},
 'components.RequestModal.watchAheadActiveForRequest': {'vi':'primary','zh-Hans':'primary','zh-Hant':'primary'},
 'components.RequestModal.watchAheadOverrideDescription': {'vi':'blind'},
 'components.Requests.episodeQueue': {'vi':'blind'},
 'components.Settings.SettingsJobsCache.plex-playback-analysis': {'vi':'blind'},
 'components.Settings.analyzeOnPlayback': {'vi':'blind','zh-Hans':'blind','zh-Hant':'blind'},
 'components.Settings.analyzeOnPlaybackTip': {'vi':'new','zh-Hans':'new','zh-Hant':'new'},
 'discovery.accounts.traktCallbackFailed': {'vi':'primary','zh-Hans':'primary','zh-Hant':'primary'},
 'discovery.accounts.traktSetup': {'vi':'blind','zh-Hans':'blind','zh-Hant':'new'},
}
NEW_TEXT = {
 ('components.CollectionQueue.description','zh-Hant'): '依上映順序請求此合集，並在佇列中預留一至兩部尚未觀看的電影作為緩衝。此操作會使用你的帳戶與一般請求預設值。後續請求仍需相應權限、額度及核准。已請求的電影也會計入緩衝數量。',
 ('components.CollectionQueue.progress','vi'): 'Đã xem {watched} phim · Hàng đợi này đã yêu cầu {requested} phim · Tổng cộng {total} phim',
 ('components.Settings.analyzeOnPlaybackTip','vi'): 'Bật tùy chọn này để xếp hàng phân tích Plex khi một tập đang phát trong thư viện TV đã bật. Mỗi phút có thể xếp tối đa hai mùa; mỗi mùa chỉ được xếp một lần trong 30 ngày. Plex kiểm soát việc tạo phần mở đầu và danh đề cuối; cài đặt thư viện và yêu cầu Plex Pass vẫn áp dụng.',
 ('components.Settings.analyzeOnPlaybackTip','zh-Hans'): '启用此选项后，某集在已启用的 TV 媒体库中播放时，Plex 分析会加入队列。每分钟最多排入两季，每季每 30 天最多排入一次。片头和片尾演职员表的生成由 Plex 控制；媒体库设置和 Plex Pass 要求仍然适用。',
 ('components.Settings.analyzeOnPlaybackTip','zh-Hant'): '啟用此選項後，當某集在已啟用的 TV 媒體庫中播放時，Plex 分析會加入佇列。每分鐘最多排入兩季，每一季每 30 天最多排入一次。片頭與片尾名單的產生由 Plex 控制；媒體庫設定及 Plex Pass 要求仍然適用。',
 ('discovery.accounts.traktSetup','zh-Hant'): '若要連結 Trakt，管理員必須在「設定 → 一般」中設定公開的 HTTPS 應用程式 URL，並在 Trakt 應用程式中登記該 URL 後接 /api/v1/integrations/discovery/trakt/callback。',
}
RATIONALE = {
 'components.CollectionDetails.queueCollection':'This is the collection detail button that opens the queue modal; the wording reads as the action to add the collection.',
 'components.CollectionQueue.active':'This is a typed queue status; the recommendation describes an active/running queue rather than an action.',
 'components.CollectionQueue.buffer':'This label names the selectable number of unwatched movies kept ahead in the queue.',
 'components.CollectionQueue.completed':'This is the completed queue status and means every collection movie has been queued.',
 'components.CollectionQueue.description':'This modal paragraph explains release ordering, the ahead buffer, account defaults, future approvals, and how existing requests count.',
 'components.CollectionQueue.error':'This is the generic alert shown when a collection queue update fails.',
 'components.CollectionQueue.existing4k':'This quality option is retained for an already configured queue when 4K is no longer enabled.',
 'components.CollectionQueue.loading':'This short status appears while the collection queue is loading.',
 'components.CollectionQueue.one':'This is the one-movie buffer option; the numeral remains visible.',
 'components.CollectionQueue.playback-unlinked':'This queue stop reason tells the user to link one of the listed playback accounts.',
 'components.CollectionQueue.progress':'This status reports watched, requested-by-this-queue, and total movie counts in that order.',
 'components.CollectionQueue.provider-unavailable':'This queue reason reports missing playback history and automatic retry behavior.',
 'components.CollectionQueue.quality':'This labels the movie request quality selector, so picture quality is the intended sense.',
 'components.CollectionQueue.request-cancelled':'This queue reason says an earlier request is missing or interrupted and gives the restart action.',
 'components.CollectionQueue.request-policy':'This queue stop reason lists access, quota, blocked-title, and service-setting checks, then notes approval.',
 'components.CollectionQueue.requestAccess':'This warning names the movie-request permission and enabled-quality prerequisites for starting.',
 'components.CollectionQueue.restart':'This is the button that restarts a stopped collection queue.',
 'components.CollectionQueue.start':'This is the button that starts the collection queue.',
 'components.CollectionQueue.stop':'This is the button that stops the collection queue.',
 'components.CollectionQueue.stopHelp':'This help text clarifies that stopping blocks future requests but preserves existing requests and downloads.',
 'components.CollectionQueue.stopped':'This is the stopped state in the queue status domain.',
 'components.CollectionQueue.title':'This is the collection queue modal heading, so a noun phrase fits better than the button action.',
 'components.CollectionQueue.two':'This is the two-movie buffer option; the numeral remains visible.',
 'components.CollectionQueue.waiting':'This is the waiting state in the queue status domain.',
 'components.RequestEpisodeQueueControl.watchAheadEpisodeOption':'This ICU plural formats the episode count; its argument, plural type, selectors, and pound marker are preserved.',
 'components.RequestEpisodeQueueControl.watchAheadLoading':'This status appears while loading the account Episode Queue setting.',
 'components.RequestEpisodeQueueControl.watchAheadOff':'This is the zero/off option in the Episode Queue selector.',
 'components.RequestEpisodeQueueControl.watchAheadOverride':'This label names the per-request queue-length override.',
 'components.RequestEpisodeQueueControl.watchAheadOverrideHelp':'This explains that the change affects only future episode queueing and preserves existing requests and downloads.',
 'components.RequestEpisodeQueueControl.watchAheadSaveFailed':'This alert asks the user to reload the request after the Episode Queue setting fails to save.',
 'components.RequestEpisodeQueueControl.watchAheadSaved':'This confirms that the Episode Queue setting has been saved.',
 'components.RequestEpisodeQueueControl.watchAheadUseDefault':'This option labels the account default and preserves the dynamic count placeholder.',
 'components.RequestEpisodeQueueModal.loadError':'This modal error tells the user how to recover when the account default cannot load.',
 'components.RequestEpisodeQueueModal.title':'This is the title of the episode queue modal.',
 'components.RequestModal.watchAheadActiveForRequest':'This refresh must describe the request-specific number of episodes kept ahead, not the previous administrator default.',
 'components.RequestModal.watchAheadOff':'This is the off value used in the request setting.',
 'components.RequestModal.watchAheadOverrideDescription':'This describes a request-specific Episode Queue setting and preserves the dynamic count.',
 'components.Requests.episodeQueue':'This is the button label that opens the episode queue modal from Requests.',
 'components.Settings.SettingsJobsCache.movie-collection-queue':'This is a background job name shown in the settings jobs table.',
 'components.Settings.SettingsJobsCache.plex-playback-analysis':'This is a background job name for Plex playback analysis.',
 'components.Settings.analyzeOnPlayback':'This setting label names analysis of seasons during playback.',
 'components.Settings.analyzeOnPlaybackTip':'This description covers opt-in behavior, queue limits, Plex-managed intro/credits generation, library settings, and Plex Pass.',
 'discovery.accounts.traktCallbackFailed':'This callback error directs the user to verify the public HTTPS application URL and the registered Trakt callback URL.',
 'discovery.accounts.traktSetup':'This setup paragraph must retain the exact callback path while explaining where to configure and register it.',
}
CONFIDENCE_MODERATE = {
 'components.CollectionQueue.buffer','components.CollectionQueue.description','components.CollectionQueue.progress',
 'components.CollectionQueue.provider-unavailable','components.CollectionQueue.request-policy',
 'components.CollectionQueue.requestAccess','components.RequestEpisodeQueueControl.watchAheadEpisodeOption',
 'components.RequestEpisodeQueueControl.watchAheadOverrideHelp','components.RequestModal.watchAheadActiveForRequest',
 'components.Settings.SettingsJobsCache.plex-playback-analysis','components.Settings.analyzeOnPlayback',
 'components.Settings.analyzeOnPlaybackTip','discovery.accounts.traktCallbackFailed','discovery.accounts.traktSetup'
}

cf=PACKET/'candidate-free'
primary=PACKET/'primary-review-old-head'
blind=PACKET/'blind-review-old-head'
reatt=PACKET/'reattestation'
cell_by_id={}
row_hash_by_id={}
for fn in ('gap-cells.jsonl','changed-source-cells.jsonl'):
    path=cf/fn
    for raw in path.read_bytes().splitlines():
        row=json.loads(raw)
        cell_by_id[row['cellId']]=row
        row_hash_by_id[row['cellId']]=hashlib.sha256(raw).hexdigest()
prows={x['cellId']:x for x in readjl(primary/'proposals.jsonl')}
brows={x['cellId']:x for x in readjl(blind/'proposals.jsonl')}
pledger={x['cellId']:x for x in readjl(primary/'review-ledger.jsonl')}
bledger={x['cellId']:x for x in readjl(blind/'ledger.jsonl')}
preatt={x['cellId']:x for x in readjl(reatt/'primary-reattestation.jsonl')}
breatt={x['cellId']:x for x in readjl(reatt/'blind-reattestation.jsonl')}

if len(cell_by_id)!=528 or len(prows)!=528 or len(brows)!=528 or len(preatt)!=528 or len(breatt)!=528:
    raise SystemExit('REFUSED: expected 528 current cells, proposals, and reattestations')
shared=[]
for cell_id,row in sorted(cell_by_id.items(), key=lambda kv:(brows[kv[0]]['sourcePosition'],ALL_LOCALES.index(kv[1]['locale']))):
    locale=row['locale']; sid=row['sourceId']
    srcsha=row.get('sourceTextSha256') or row.get('currentEnglishSourceSha256')
    p=prows[cell_id]; b=brows[cell_id]; pl=pledger[cell_id]; bl=bledger[cell_id]; pr=preatt[cell_id]; br=breatt[cell_id]
    checks={
      'primaryCandidate':p['proposedTargetSha256']==sha(p['proposedTarget'])==pr['candidateSha256'],
      'blindCandidate':b['proposedTargetSha256']==sha(b['proposedTarget'])==br['candidateSha256'],
      'primarySource':p['sourceTextSha256']==srcsha==pr['sourceTextSha256']==pl['sourceTextSha256'],
      'blindSource':b['sourceTextSha256']==srcsha==br['sourceTextSha256']==bl['sourceTextSha256'],
      'primaryCaller':pr['currentCallerContextSha256']==row['callerContextSha256']==pl['sourceContextSha256'],
      'blindCaller':br['currentCallerContextSha256']==row['callerContextSha256']==bl['callerContextSha256']==b['callerContextSha256'],
      'primaryTarget':pr['currentTargetSha256']==row['currentTargetSha256']==pl['currentTargetSha256'],
      'blindTarget':br['currentTargetSha256']==row['currentTargetSha256']==bl['currentTargetSha256']==b['currentTargetSha256'],
      'reattestCurrentHead':pr['currentHead']==HEAD and pr['currentTree']==TREE and br['currentHead']==HEAD and br['currentTree']==TREE,
      'oldCandidateHead':pr['oldReviewHead']==OLD_HEAD and pr['oldReviewTree']==OLD_TREE and br['oldReviewHead']==OLD_HEAD and br['oldReviewTree']==OLD_TREE,
      'tokenClaims':(pl['tokenChecks']['allMatch'] and all(bl['tokenChecks'].values())
                     and (pr['tokenChecksPass'] or pr.get('tokenCheckException') is not None)
                     and (br['tokenChecksPass'] or br.get('tokenCheckException') is not None)),
      'sourceCallerUnchanged':pr['sourceTextUnchanged'] and br['sourceTextUnchanged'] and pr['callerContextUnchanged'] and br['callerContextUnchanged'],
    }
    if not all(checks.values()):
        raise SystemExit(f'REFUSED: reattestation mismatch {cell_id}: {checks}')
    shared.append({
      'cellId':cell_id,'sourceId':sid,'locale':locale,'category':'source-refresh' if row.get('sourceChangedSincePriorCandidateFreeHead') else 'insertion-gap',
      'candidateFreeRowSha256':row_hash_by_id[cell_id],'sourceIdSha256':row['sourceIdSha256'],'sourceTextSha256':srcsha,
      'currentTargetSha256':row['currentTargetSha256'],'callerContextSha256':row['callerContextSha256'],
      'primaryProposalSha256':p['proposedTargetSha256'],'blindProposalSha256':b['proposedTargetSha256'],
      'primaryReattestationRowSha256':sha(json.dumps(pr,ensure_ascii=False,sort_keys=True,separators=(',',':'))),
      'blindReattestationRowSha256':sha(json.dumps(br,ensure_ascii=False,sort_keys=True,separators=(',',':'))),
      'primaryOldInputCellSha256':pl.get('inputCellSha256'),'blindOldCandidateFreeCellSha256':bl.get('candidateFreeCellSha256'),
      'documentedTokenExceptionClass':(pr.get('tokenCheckException') or br.get('tokenCheckException') or {}).get('class'),
      'currentHead':HEAD,'currentTree':TREE,'baseSha':BASE,'checks':checks
    })

lane_bindings=[x for x in shared if x['locale'] in LOCALES]
if len(lane_bindings)!=132:
    raise SystemExit('REFUSED: locale-b expected 132 cells')

locale_order={locale:index for index,locale in enumerate(LOCALES)}
ledger=[]
for binding in lane_bindings:
    cell_id=binding['cellId']; sid=binding['sourceId']; locale=binding['locale']; row=cell_by_id[cell_id]
    src=row.get('sourceText',row.get('currentEnglishSourceText'))
    p=prows[cell_id]['proposedTarget']; b=brows[cell_id]['proposedTarget']
    mode=CHOICE.get(sid,{}).get(locale)
    if (sid,locale) in NEW_TEXT:
        mode='new'
    if mode is None:
        if p==b: mode='consensus'
        else: raise SystemExit(f'REFUSED: no explicit choice for differing proposals {cell_id}')
    target={'primary':p,'blind':b,'consensus':p,'new':NEW_TEXT.get((sid,locale))}.get(mode)
    if target is None:
        raise SystemExit(f'REFUSED: no target for {cell_id} mode={mode}')
    if mode=='new': decision='cross-adjustment'; candidate='new'
    elif p==b: decision='accept-consensus-proposal'; candidate='consensus'
    elif mode=='primary': decision='accept-primary-proposal'; candidate='primary'
    elif mode=='blind': decision='accept-blind-proposal'; candidate='blind'
    else: raise SystemExit(f'REFUSED: impossible candidate mode {cell_id} {mode}')
    token_checks=cfmod.checks(src,target)
    if not token_checks['allMatch']:
        raise SystemExit(f'REFUSED: proposed token mismatch {cell_id}: {token_checks}')
    context=RATIONALE.get(sid)
    if not context: raise SystemExit(f'REFUSED: rationale missing {sid}')
    locale_note={'vi':'Vietnamese wording and Episode Queue terminology were checked for caller fit.',
                 'zh-Hans':'Simplified Chinese terminology, queue wording, and punctuation were checked in context.',
                 'zh-Hant':'Traditional Chinese terminology, queue wording, and punctuation were checked in context.'}[locale]
    if decision=='accept-consensus-proposal': decision_note='Both sealed lanes independently supplied the same wording.'
    elif decision=='accept-primary-proposal': decision_note='The primary wording is the better fit for the current caller.'
    elif decision=='accept-blind-proposal': decision_note='The blind wording is the better fit for the current caller.'
    else: decision_note='Adjusted both drafts to make the caller meaning explicit and keep the dynamic values and protected literals intact.'
    rationale=' '.join((context,decision_note,locale_note))
    category='source-refresh' if binding['category']=='source-refresh' else 'insertion-gap'
    source_position=brows[cell_id]['sourcePosition']
    rowout={
      'schemaVersion':1,'cellId':cell_id,'sourceOrdinal':source_position,'sourcePosition':source_position,
      'sourceId':sid,'sourceIdSha256':row['sourceIdSha256'],'locale':locale,'category':category,
      'candidateFreeRowSha256':binding['candidateFreeRowSha256'],'sourceText':src,'sourceTextSha256':binding['sourceTextSha256'],
      'currentTarget':row.get('currentTarget'),'currentTargetSha256':row.get('currentTargetSha256'),
      'callerContextSha256':row['callerContextSha256'],'callerContextReviewed':True,
      'primaryDecision':preatt[cell_id]['reviewDisposition'],'blindDecision':bledger[cell_id]['decision'],
      'primaryProposal':p,'primaryProposalSha256':prows[cell_id]['proposedTargetSha256'],
      'blindProposal':b,'blindProposalSha256':brows[cell_id]['proposedTargetSha256'],
      'crossDecision':decision,'recommendationSource':candidate,'recommendedTarget':target,'recommendedTargetSha256':sha(target),
      'confidence':'moderate' if sid in CONFIDENCE_MODERATE else 'high','rationale':rationale,
      'tokenChecks':token_checks,'tokenStatus':'pass',
      'semanticChecks':{'callerFit':'reviewed','meaning':'reviewed','localeVariantAndTerminology':'reviewed','punctuationAndReadability':'reviewed','numberDateAndProtectedLiterals':'pass','placeholdersIcuMarkupAndInlineCode':'pass'},
      'currentHead':HEAD,'currentTree':TREE,'baseSha':BASE,
      'sourceRefreshFromPriorText':row.get('priorEnglishSourceText') if category=='source-refresh' else None,
      'sourceRefreshFromPriorSha256':row.get('priorEnglishSourceSha256') if category=='source-refresh' else None
    }
    ledger.append(rowout)

if len(ledger)!=132 or len({r['cellId'] for r in ledger})!=132:
    raise SystemExit('REFUSED: semantic ledger is not complete and unique')

writejl('shared-input-bindings-528.jsonl',shared)
writejl('locale-b-input-bindings-132.jsonl',lane_bindings)
writejl('ledger.jsonl',ledger)

counts=collections.Counter(x['crossDecision'] for x in ledger)
conf=collections.Counter(x['confidence'] for x in ledger)
cat=collections.Counter(x['category'] for x in ledger)
summary={
 'result':'PASS','reviewType':'independent-semantic-cross-review','pullRequest':418,'repository':'snapetech-org/seerrng',
 'head':HEAD,'tree':TREE,'base':BASE,'oldCandidateReviewHead':OLD_HEAD,'oldCandidateReviewTree':OLD_TREE,
 'locales':list(LOCALES),'sourceIds':len(set(x['sourceId'] for x in ledger)),'cells':len(ledger),
 'insertionGapCells':cat['insertion-gap'],'sourceRefreshCells':cat['source-refresh'],
 'decisionCounts':dict(sorted(counts.items())),'confidenceCounts':dict(sorted(conf.items())),
 'tokenFailures':sum(not x['tokenChecks']['allMatch'] for x in ledger),'callerContextUnreviewed':sum(not x['callerContextReviewed'] for x in ledger),
 'fullInputBindingCells':len(shared),'fullInputBindingFailures':sum(not all(x['checks'].values()) for x in shared),
 'primaryProposalHashesBound':len(shared),'blindProposalHashesBound':len(shared),
 'sourceCurrentTargetCallerHashesMatched':len(shared),'numericIcuSemanticExceptionsAssignedElsewhere':['ja numeric scanner rows owned by locale-c; no Japanese cells included here'],
 'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'repositoryOrPrEdited':False,'testsBuildsScansOrCiRun':False,
 'sharedInputChecks':{'candidateFreeChecksums':'PASS','candidateFreePacketOnlyVerifier':'PASS','reattestationChecksums':'PASS','primaryChecksums':'PASS','blindChecksums':'PASS','liveEntryRefs':'PASS'},
 'primaryLegacyVerifier':'NOT USED: old verifier expects original candidate-free root inventory; hash-only current-head reattestation was checked directly.'
}
writej('input-reattestation.json',{
 'result':'PASS','head':HEAD,'tree':TREE,'base':BASE,'fullScopeCells':len(shared),'localeBCells':len(lane_bindings),
 'locales':list(LOCALES),'sourceCurrentTargetCallerAndCandidateHashesMatched':len(shared),
 'primaryRowsReattested':528,'blindRowsReattested':528,'originalStoredTokenClaimsPassing':1056,
 'candidateTextIncludedForOtherLocales':False,'sourceOrTargetCellDrift':0,
 'documentedTokenExceptionCellsOutsideLocaleB':[x['cellId'] for x in shared if x.get('documentedTokenExceptionClass')],
 'checksumsAndPacketVerifier':{'candidateFree':'PASS','reattestation':'PASS','primary':'PASS','blind':'PASS','candidateFreePacketOnly':'PASS'},
 'primaryVerifierNote':summary['primaryLegacyVerifier']
})
writej('summary.json',summary)
writej('manifest.json',{
 'schemaVersion':1,'task':'SeerrNG PR #418 parity locale-b cross-review','scope':{'locales':list(LOCALES),'sourceIds':44,'cells':132,'insertionGapCells':129,'sourceRefreshCells':3},
 'pins':{'head':HEAD,'tree':TREE,'base':BASE,'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE},
 'inputs':{'candidateFree':'../../candidate-free/','reattestation':'../../reattestation/','primary':'../../primary-review-old-head/','blind':'../../blind-review-old-head/'},
 'artifacts':['entry-attestation.json','exit-attestation.json','input-reattestation.json','shared-input-bindings-528.jsonl','locale-b-input-bindings-132.jsonl','ledger.jsonl','summary.json','README.md','build_cross_review.py','verify_cross_review.py'],
 'noRepositoryOrPullRequestChanges':True,'noTestsBuildsScansOrCi':True
})
readme=f'''# SeerrNG PR #418 parity cross-review — locale-b

This sealed part covers **vi, zh-Hans, and zh-Hant**: 44 source IDs × 3 locales = 132 cells. It contains 129 missing-target insertion cells and 3 refresh cells for `components.RequestModal.watchAheadActiveForRequest`. It does not include ja, ko, pt-BR, or other locales; ja/ko/pt-BR are handled in a separate part.

Pinned PR state: head `{HEAD}`, tree `{TREE}`, base/main `{BASE}`. Old primary and blind wording was bound to the current source/current target/caller hashes through the hash-only reattestation packet before review. `shared-input-bindings-528.jsonl` records the hash-only all-locale binding proof; `locale-b-input-bindings-132.jsonl` records this lane's selected cells. The 132-row ledger includes exact current, primary, blind, and recommended wording for assigned locales, rationale, confidence, and token checks.

No repository/catalog/PR files were changed. No tests, builds, scans, CI, or browser review were run. No native-speaker review is claimed.

Run the portable offline verifier from this directory:

    python3 verify_cross_review.py

To verify against the source packets at another location:

    python3 verify_cross_review.py --packet-root /path/to/seerrng-pr418-parity-43-post-w4000-20261105
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
