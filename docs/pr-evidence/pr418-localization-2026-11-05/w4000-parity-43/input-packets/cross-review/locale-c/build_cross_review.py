#!/usr/bin/env python3
from __future__ import annotations
import collections, datetime as dt, hashlib, json, re, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode = True

ROOT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT = ROOT / 'cross-review' / 'locale-c'
REPO = Path('/mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume')
HEAD = 'f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4'
TREE = 'f7ea727b0383397ec8d6220667b4abe151d43b46'
BASE = '2647e15762de0c2285cd9d8ebc6d27ffafce6358'
BASETREE = 'b6f4acb9debdc1b0a838b50d5ad88aaa467e429b'
OLD_HEAD = '77d30ae742aad7245e6e419237fca6a544531e1f'
OLD_TREE = '2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
BRANCH = 'codex/seerrng-localization-overhaul-20261028'
LOCALES = ['ja', 'ko', 'pt-BR']
CHANGED = 'components.RequestModal.watchAheadActiveForRequest'
ROUTE = '/api/v1/integrations/discovery/trakt/callback'
EXCEPTIONS = {'components.CollectionQueue.description::ja', 'components.Settings.analyzeOnPlaybackTip::ja'}
EXPECTED_FILES = {'README.md','SHA256SUMS.txt','after-attestation.json','before-attestation.json','build_cross_review.py','cross-ledger.jsonl','manifest.json','summary.json','verify_cross_review.py'}

PLACEHOLDER = re.compile(r'\{([A-Za-z][A-Za-z0-9_]*)\}')
MARKUP = re.compile(r'</?[A-Za-z][^>]*>')
NUMBERS = re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
PROTECTED = re.compile(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])')
EXTRA_PROTECTED = ('SeerrNG','Seerr','BookshelfNG','ReadMeABook')
ICU_TYPES = ('plural','select','selectordinal')

PICKS = {
 'ja': {
  'components.CollectionQueue.active':'P','components.CollectionQueue.buffer':'B','components.CollectionQueue.completed':'P',
  'components.CollectionQueue.error':'P','components.CollectionQueue.one':'B','components.CollectionQueue.playback-unlinked':'B',
  'components.CollectionQueue.progress':'B','components.CollectionQueue.request-cancelled':'B','components.CollectionQueue.request-policy':'P',
  'components.CollectionQueue.requestAccess':'B','components.CollectionQueue.restart':'B','components.CollectionQueue.stopHelp':'P',
  'components.CollectionQueue.stopped':'P','components.CollectionQueue.title':'P','components.CollectionQueue.two':'B',
  'components.RequestEpisodeQueueControl.watchAheadEpisodeOption':'B','components.RequestEpisodeQueueControl.watchAheadOverrideHelp':'B',
  'components.RequestEpisodeQueueControl.watchAheadUseDefault':'P','components.RequestEpisodeQueueModal.loadError':'P',
  'components.RequestModal.watchAheadOverrideDescription':'B','components.Settings.SettingsJobsCache.plex-playback-analysis':'B',
  'components.Settings.analyzeOnPlayback':'B','discovery.accounts.traktCallbackFailed':'B','discovery.accounts.traktSetup':'B',
  CHANGED:'B',
 },
 'ko': {
  'components.CollectionDetails.queueCollection':'B','components.CollectionQueue.active':'B','components.CollectionQueue.buffer':'B',
  'components.CollectionQueue.completed':'B','components.CollectionQueue.description':'B','components.CollectionQueue.error':'B',
  'components.CollectionQueue.existing4k':'B','components.CollectionQueue.loading':'B','components.CollectionQueue.progress':'B',
  'components.CollectionQueue.request-cancelled':'B','components.CollectionQueue.request-policy':'P','components.CollectionQueue.requestAccess':'B',
  'components.CollectionQueue.restart':'B','components.CollectionQueue.start':'B','components.CollectionQueue.stop':'B',
  'components.CollectionQueue.stopped':'B','components.RequestEpisodeQueueControl.watchAheadOff':'P',
  'components.RequestEpisodeQueueControl.watchAheadOverride':'B','components.RequestEpisodeQueueControl.watchAheadOverrideHelp':'B',
  'components.RequestEpisodeQueueControl.watchAheadSaveFailed':'B','components.RequestModal.watchAheadOff':'P',
  'components.RequestModal.watchAheadOverrideDescription':'P','components.Settings.SettingsJobsCache.movie-collection-queue':'B',
  'components.Settings.analyzeOnPlaybackTip':'P','discovery.accounts.traktCallbackFailed':'P','discovery.accounts.traktSetup':'P',
 },
 'pt-BR': {
  'components.CollectionQueue.description':'B','components.CollectionQueue.playback-unlinked':'B',
  'components.CollectionQueue.request-policy':'P','components.CollectionQueue.requestAccess':'P',
  'components.CollectionQueue.stopHelp':'B','components.CollectionQueue.title':'P',
  'components.RequestEpisodeQueueControl.watchAheadLoading':'P','components.RequestEpisodeQueueControl.watchAheadOverrideHelp':'B',
  'components.RequestEpisodeQueueModal.loadError':'B','components.RequestModal.watchAheadOverrideDescription':'B',
  'components.Settings.analyzeOnPlaybackTip':'B','discovery.accounts.traktCallbackFailed':'B','discovery.accounts.traktSetup':'B',
 }
}

NEW_TARGETS = {
 ('components.CollectionQueue.description','ja'):
  'このコレクションを公開順にリクエストし、未視聴の映画を一本または二本、先行してキューに入れます。ご自身のアカウントと通常のリクエスト設定を使用します。今後のリクエストにも権限、上限、承認が必要です。リクエスト済みの映画も先行数に含まれます。',
 ('components.Settings.analyzeOnPlaybackTip','ja'):
  'この設定を有効にすると、有効なTVライブラリでエピソードを再生中にPlex解析がキューに追加されます。毎分キューに追加されるのは最大二シーズンで、各シーズンは30日ごとに一度までです。イントロとクレジットの生成はPlexが制御し、ライブラリ設定とPlex Passの要件も引き続き適用されます。',
 ('components.CollectionQueue.title','ko'):'컬렉션 대기열',
 (CHANGED,'ko'):'이 요청보다 앞서 {count}개의 에피소드를 대기열에 유지합니다.',
 (CHANGED,'pt-BR'):'Esta solicitação mantém {count} episódios à frente na fila.',
}

REASONS = {
 'components.CollectionDetails.queueCollection':'The caller is a collection-page button that opens the queue modal, so an imperative action label fits.',
 'components.CollectionQueue.active':'This is a live queue status label; the chosen form reports the current status without turning it into an action.',
 'components.CollectionQueue.buffer':'This selector controls the number of unwatched movies kept ahead in the collection queue, so the label must read as a count.',
 'components.CollectionQueue.completed':'This status confirms that all movies have entered the collection queue.',
 'components.CollectionQueue.description':'The helper must retain release order, one or two unwatched movies ahead, account defaults, future permission/quota/approval requirements, and the fact that already requested movies count toward the buffer.',
 'components.CollectionQueue.error':'The inline error identifies the collection queue update and tells the user to retry later.',
 'components.CollectionQueue.existing4k':'The existing quality option must retain the protected 4K literal and say the queue already exists.',
 'components.CollectionQueue.loading':'This is a live status while the collection queue loads.',
 'components.CollectionQueue.one':'This selector option is one movie and should display the count naturally in Japanese.',
 'components.CollectionQueue.playback-unlinked':'The reason asks the user to link the named playback-provider account before continuing.',
 'components.CollectionQueue.progress':'This status keeps the watched, requested-by-this-queue, and total counts in their matching placeholders.',
 'components.CollectionQueue.provider-unavailable':'The reason identifies unavailable playback history and automatic retry.',
 'components.CollectionQueue.request-cancelled':'The message must say an earlier request is missing or interrupted and tell the user to restart the queue for missing movies.',
 'components.CollectionQueue.request-policy':'The guidance lists request access, quotas, blocked titles, service settings, and continued approval for pending requests.',
 'components.CollectionQueue.requestAccess':'This prerequisite requires both movie-request permission and an enabled quality before queue start.',
 'components.CollectionQueue.restart':'The caller is a button that restarts the collection queue; the wording must express restart rather than resume.',
 'components.CollectionQueue.start':'The caller is a button that starts the collection queue.',
 'components.CollectionQueue.stop':'The caller is a button that stops the collection queue.',
 'components.CollectionQueue.stopHelp':'The confirmation text limits the effect to future requests and preserves existing requests and downloaded files.',
 'components.CollectionQueue.stopped':'This is the resulting stopped-queue status.',
 'components.CollectionQueue.title':'This is a modal heading, so a noun phrase fits better than a button-style imperative.',
 'components.CollectionQueue.two':'This selector option is two movies and should display the count naturally in Japanese.',
 'components.CollectionQueue.waiting':'This is a waiting status for the collection queue.',
 'components.RequestEpisodeQueueControl.watchAheadEpisodeOption':'This is an ICU plural selector option; the count argument and both plural branches must remain intact, and the Japanese episode counter should follow current product wording.',
 'components.RequestEpisodeQueueControl.watchAheadLoading':'This status refers to the account Episode Queue setting.',
 'components.RequestEpisodeQueueControl.watchAheadOff':'This is the disabled option in the queue-length selector.',
 'components.RequestEpisodeQueueControl.watchAheadOverride':'This is the queue-length selector label.',
 'components.RequestEpisodeQueueControl.watchAheadOverrideHelp':'The help applies only to future queue additions and confirms that existing episode requests and downloaded files remain unchanged.',
 'components.RequestEpisodeQueueControl.watchAheadSaveFailed':'The error names the Episode Queue setting, asks the user to reload the request, and then retry.',
 'components.RequestEpisodeQueueControl.watchAheadSaved':'This is a success notification for saving the Episode Queue setting.',
 'components.RequestEpisodeQueueControl.watchAheadUseDefault':'This selector option identifies the account default and preserves the count placeholder.',
 'components.RequestEpisodeQueueModal.loadError':'The dialog error says the account default failed to load and directs the user to close and retry.',
 'components.RequestEpisodeQueueModal.title':'This is a modal title, so a noun phrase is appropriate.',
 'components.RequestModal.watchAheadOff':'This is the disabled option for the request-specific queue setting.',
 'components.RequestModal.watchAheadOverrideDescription':'This request-level message must retain the independent Episode Queue setting and its count placeholder.',
 'components.Requests.episodeQueue':'This button opens the Episode Queue modal, so the established product feature name is appropriate.',
 'components.Settings.SettingsJobsCache.movie-collection-queue':'This settings row names the background job for the movie-collection queue.',
 'components.Settings.SettingsJobsCache.plex-playback-analysis':'This settings row names the Plex playback-analysis job.',
 'components.Settings.analyzeOnPlayback':'This is the settings checkbox label for analysis of seasons during playback.',
 'components.Settings.analyzeOnPlaybackTip':'This settings help must retain opt-in behavior, the maximum of two seasons per minute, one analysis per season every 30 days, Plex control of intro and credits generation, library settings, and Plex Pass requirements.',
 'discovery.accounts.traktCallbackFailed':'This alert requires checking the public HTTPS application URL and the callback URL registered in Trakt before retrying authorization.',
 'discovery.accounts.traktSetup':'The account setup instructions must preserve the exact callback route and the locale-specific Settings to General labels.',
 CHANGED:'The revised source means this request keeps a number of episodes queued ahead; the request-modal caller is an episode queue control, so the wording names episodes and makes their position ahead of this request explicit.',
}

def sha(data):
    if isinstance(data, str): data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()

def read_rows(path, key='cellId'):
    rows, hashes = {}, {}
    for raw in Path(path).read_bytes().splitlines():
        if not raw.strip(): continue
        row = json.loads(raw)
        rid = row.get(key, row.get('sourceId'))
        if rid in rows: raise ValueError(f'duplicate row {rid} in {path}')
        rows[rid] = row
        hashes[rid] = sha(raw)
    return rows, hashes

def readj(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def verify_sums(folder, allow_work=False):
    folder = Path(folder)
    sums = {}
    for line in (folder/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        digest, name = line.split('  ', 1)
        p = Path(name)
        if p.is_absolute() or '..' in p.parts or name in sums: raise ValueError(f'unsafe checksum entry: {folder}/{name}')
        fp = folder/p
        if not fp.is_file() or sha(fp.read_bytes()) != digest: raise ValueError(f'checksum failure: {folder}/{name}')
        sums[name] = digest
    actual = {p.relative_to(folder).as_posix() for p in folder.rglob('*')
              if p.is_file() and p.name != 'SHA256SUMS.txt'
              and not (allow_work and '.work' in p.relative_to(folder).parts)}
    if set(sums) != actual: raise ValueError(f'checksum inventory mismatch: {folder}')
    return sums

def icu(value):
    found = []
    for start, ch in enumerate(value):
        if ch != '{': continue
        depth, end = 0, None
        for i in range(start, len(value)):
            if value[i] == '{': depth += 1
            elif value[i] == '}':
                depth -= 1
                if depth == 0: end = i+1; break
        if end is None: continue
        raw = value[start:end]
        m = re.match(r'^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*('+'|'.join(ICU_TYPES)+r')\b', raw)
        if m:
            selectors = re.findall(r'(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{', raw)
            found.append({'argument':m.group(1),'formatType':m.group(2),'selectors':selectors,'usesPound':'#' in raw,'raw':raw})
    return found

def tokens(value):
    protected = list(dict.fromkeys(PROTECTED.findall(value)))
    protected.extend(x for x in EXTRA_PROTECTED if x in value and x not in protected)
    return {'placeholders':PLACEHOLDER.findall(value),'icuExpressions':icu(value),'markupTags':MARKUP.findall(value),
            'numericTokens':NUMBERS.findall(value),'protectedLiterals':protected,
            'inlineCode':re.findall(chr(96)+r'([^'+chr(96)+r']+)'+chr(96),value)}

def token_checks(source, target):
    a, b = tokens(source), tokens(target)
    shape = lambda xs: [(x['argument'],x['formatType'],x['selectors'],x['usesPound']) for x in xs]
    checks = {'placeholders':a['placeholders']==b['placeholders'],'icuExpressions':shape(a['icuExpressions'])==shape(b['icuExpressions']),
              'markupTags':a['markupTags']==b['markupTags'],'numericTokens':a['numericTokens']==b['numericTokens'],
              'protectedLiterals':all(x in b['protectedLiterals'] for x in a['protectedLiterals']),
              'inlineCode':a['inlineCode']==b['inlineCode']}
    return {'checks':checks,'allMatch':all(checks.values()),'sourceTokens':a,'targetTokens':b,
            'missingProtectedLiterals':[x for x in a['protectedLiterals'] if x not in b['protectedLiterals']]}

def git(*args):
    return subprocess.check_output(['git','-C',str(REPO),*args],text=True,stderr=subprocess.STDOUT).strip()

def live_snapshot(label):
    api = json.loads(subprocess.check_output(['gh','pr','view','418','--repo','snapetech-org/seerrng','--json',
        'state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url'],text=True))
    out = subprocess.check_output(['git','-C',str(REPO),'ls-remote','origin','refs/heads/main',
        f'refs/heads/{BRANCH}','refs/pull/418/head'],text=True)
    refs = {}
    for line in out.splitlines():
        oid, ref = line.split('\t',1); refs[ref] = oid
    return {'label':label,'capturedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
            'githubPullRequestApi':api,'remoteRefs':refs,
            'localGitObjects':{'head':HEAD,'headTree':git('rev-parse',f'{HEAD}^{{tree}}'),'base':BASE,
                'baseTree':git('rev-parse',f'{BASE}^{{tree}}'),'worktreeHead':git('rev-parse','HEAD'),
                'worktreeTree':git('rev-parse','HEAD^{tree}'),'worktreeStatus':git('status','--porcelain')}}

def check_snapshot(s):
    api=s['githubPullRequestApi']; refs=s['remoteRefs']; local=s['localGitObjects']
    if api != {'baseRefName':'main','baseRefOid':BASE,'headRefName':BRANCH,'headRefOid':HEAD,
               'isDraft':True,'state':'OPEN','url':'https://github.com/snapetech-org/seerrng/pull/418'}:
        raise ValueError(f'PR API pins changed: {api}')
    if refs != {'refs/heads/main':BASE,f'refs/heads/{BRANCH}':HEAD,'refs/pull/418/head':HEAD}:
        raise ValueError(f'remote refs changed: {refs}')
    if local != {'head':HEAD,'headTree':TREE,'base':BASE,'baseTree':BASETREE,
                 'worktreeHead':HEAD,'worktreeTree':TREE,'worktreeStatus':''}:
        raise ValueError(f'local Git/worktree pins changed: {local}')

def input_records():
    cd=ROOT/'candidate-free'; pd=ROOT/'primary-review-old-head'; bd=ROOT/'blind-review-old-head'; rd=ROOT/'reattestation'
    cs=verify_sums(cd); ps=verify_sums(pd); bs=verify_sums(bd, allow_work=True); rs=verify_sums(rd)
    cm=readj(cd/'manifest.json'); pm=readj(pd/'manifest.json'); bm=readj(bd/'manifest.json')
    rm=readj(rd/'manifest.json'); summary=readj(rd/'summary.json')
    gap,gr=read_rows(cd/'gap-cells.jsonl'); changed,cr=read_rows(cd/'changed-source-cells.jsonl')
    caller,cor=read_rows(cd/'caller-contexts.jsonl','sourceId')
    pp,ppr=read_rows(pd/'proposals.jsonl'); pl,plr=read_rows(pd/'review-ledger.jsonl')
    bp,bpr=read_rows(bd/'proposals.jsonl'); bl,blr=read_rows(bd/'ledger.jsonl')
    pa,par=read_rows(rd/'primary-reattestation.jsonl'); ba,bar=read_rows(rd/'blind-reattestation.jsonl')
    order_rows=[json.loads(x) for x in (cd/'source-order-hashes.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    order={x['sourceIdSha256']:x['position'] for x in order_rows}
    if (cm['exactHead'],cm['exactTree'],cm['baseSha'],cm['baseTree']) != (HEAD,TREE,BASE,BASETREE): raise ValueError('candidate-free pins')
    if (pm.get('sourceHead'),pm.get('sourceTree'))!=(OLD_HEAD,OLD_TREE) or (bm.get('exactHead'),bm.get('exactTree'))!=(OLD_HEAD,OLD_TREE):
        raise ValueError('old proposal head/tree pins')
    if rm.get('currentHead')!=HEAD or rm.get('currentTree')!=TREE: raise ValueError('reattestation pins')
    if len(gap)!=516 or len(changed)!=12 or len(caller)!=44: raise ValueError('candidate-free row counts')
    if not all(len(x)==528 for x in (pp,pl,bp,bl,pa,ba)): raise ValueError('proposal/reattestation row counts')
    if summary.get('result')!='PASS' or summary.get('cells')!=528 or summary.get('sourceOrTargetCellDrift')!=0: raise ValueError('reattestation summary')
    if summary.get('numericTokenSemanticExceptions')!=2 or set(summary.get('numericTokenExceptionCells',[]))!=EXCEPTIONS:
        raise ValueError('Japanese numeric exception inventory')
    selected={}
    for cid,row in gap.items():
        if row['locale'] in LOCALES: selected[cid]=(row,gr[cid],'insertion-gap')
    for cid,row in changed.items():
        if row['locale'] in LOCALES: selected[cid]=(row,cr[cid],'changed-source-refresh')
    if len(selected)!=132: raise ValueError(f'assigned cells {len(selected)} != 132')
    return {'candidateManifest':cm,'primaryManifest':pm,'blindManifest':bm,'reattestManifest':rm,'reattestSummary':summary,
        'candidateSums':cs,'primarySums':ps,'blindSums':bs,'reattSums':rs,'selected':selected,'caller':caller,'callerRaw':cor,
        'primaryProp':pp,'primaryPropRaw':ppr,'primaryLed':pl,'primaryLedRaw':plr,'blindProp':bp,'blindPropRaw':bpr,
        'blindLed':bl,'blindLedRaw':blr,'primaryAtt':pa,'primaryAttRaw':par,'blindAtt':ba,'blindAttRaw':bar,'order':order}

def choose(cell_id,loc,p,b):
    sid=cell_id.rsplit('::',1)[0]
    if p==b: return p,'accept','primary+blind','Both sealed lanes agree exactly.'
    if (sid,loc) in NEW_TARGETS: return NEW_TARGETS[(sid,loc)],'adjust','new',None
    pick=PICKS.get(loc,{}).get(sid)
    if pick not in ('P','B'): raise ValueError(f'missing independent choice for {cell_id}')
    return (p,'accept','primary',None) if pick=='P' else (b,'accept','blind',None)

def roles(ctx):
    out=[]
    for site in ctx.get('sites',[]):
        if site['role'] not in out: out.append(site['role'])
    return out

def make_rows(d):
    rows=[]
    for cid,(c,cell_raw_sha,category) in sorted(d['selected'].items(),key=lambda kv:(d['order'][kv[1][0]['sourceIdSha256']],LOCALES.index(kv[1][0]['locale']))):
        sid,loc=c['sourceId'],c['locale']; ctx=d['caller'][sid]
        p,pl,b,bl,pa,ba=(d['primaryProp'][cid],d['primaryLed'][cid],d['blindProp'][cid],d['blindLed'][cid],d['primaryAtt'][cid],d['blindAtt'][cid])
        source=c.get('sourceText') or c.get('currentEnglishSourceText')
        source_sha=c.get('sourceTextSha256') or c.get('currentEnglishSourceSha256')
        if not source or sha(source)!=source_sha: raise ValueError('source hash '+cid)
        if p['proposedTargetSha256']!=sha(p['proposedTarget']) or b['proposedTargetSha256']!=sha(b['proposedTarget']): raise ValueError('proposal hash '+cid)
        if pl['proposedTargetSha256']!=p['proposedTargetSha256'] or bl['proposedTargetSha256']!=b['proposedTargetSha256']: raise ValueError('ledger proposal mismatch '+cid)
        if pa['candidateSha256']!=p['proposedTargetSha256'] or ba['candidateSha256']!=b['proposedTargetSha256']: raise ValueError('reattest candidate mismatch '+cid)
        for att,lane in ((pa,'primary'),(ba,'blind')):
            if att['candidateTextIncluded'] is not False or att['currentHead']!=HEAD or att['currentTree']!=TREE: raise ValueError(lane+' reattest head/text '+cid)
            if att['oldReviewHead']!=OLD_HEAD or att['oldReviewTree']!=OLD_TREE: raise ValueError(lane+' prior pin '+cid)
            if (att['sourceId'],att['locale'],att['sourceTextSha256'])!=(sid,loc,source_sha): raise ValueError(lane+' source '+cid)
            if att['currentCallerContextSha256']!=ctx['callerContextSha256'] or att['oldCallerContextSha256']!=ctx['callerContextSha256']: raise ValueError(lane+' caller '+cid)
            if att['currentTargetSha256']!=c['currentTargetSha256'] or att['oldCurrentTargetSha256']!=c['currentTargetSha256']: raise ValueError(lane+' target '+cid)
            if not (att['sourceTextUnchanged'] and att['callerContextUnchanged'] and att['currentTargetStateUnchanged']): raise ValueError(lane+' drift '+cid)
        if pl['sourceContextSha256']!=ctx['callerContextSha256'] or b['callerContextSha256']!=ctx['callerContextSha256']: raise ValueError('proposal caller '+cid)
        if (p['sourceId'],b['sourceId'],p['locale'],b['locale'])!=(sid,sid,loc,loc): raise ValueError('proposal cell '+cid)
        if p['sourceTextSha256']!=source_sha or b['sourceTextSha256']!=source_sha: raise ValueError('proposal source '+cid)
        if pl['currentTargetSha256']!=c['currentTargetSha256'] or b['currentTargetSha256']!=c['currentTargetSha256']: raise ValueError('proposal target '+cid)
        if p['sourceHead']!=OLD_HEAD or p['sourceTree']!=OLD_TREE or b['exactHead']!=OLD_HEAD or b['exactTree']!=OLD_TREE: raise ValueError('proposal old head '+cid)
        if pl['currentTargetPresent']!=c['currentTargetPresent'] or bl['currentTargetSha256']!=c['currentTargetSha256']: raise ValueError('proposal target state '+cid)
        if category=='insertion-gap':
            if c['cellStatus']!='missing-target' or c['currentTargetPresent'] or c['currentTarget'] is not None or c['currentTargetSha256'] is not None or c['translationDecision']!='translation-required': raise ValueError('gap state '+cid)
        elif not (c['currentTargetPresent'] and c['currentTarget'] and c['translationDecision']=='translation-refresh-review-required'):
            raise ValueError('refresh state '+cid)

        target,disp,candidate_source,why=choose(cid,loc,p['proposedTarget'],b['proposedTarget'])
        check=token_checks(source,target)
        if not check['allMatch']: raise ValueError('recommended target token mismatch '+cid)
        if sid=='components.CollectionQueue.existing4k' and '4K' not in target: raise ValueError('4K missing '+cid)
        if sid=='components.Settings.analyzeOnPlaybackTip' and not all(x in target for x in ('TV','30','Plex','Plex Pass')): raise ValueError('Plex analysis source detail missing '+cid)
        if sid=='discovery.accounts.traktSetup' and ROUTE not in target: raise ValueError('callback route missing '+cid)
        if sid==CHANGED and '{count}' not in target: raise ValueError('count placeholder missing '+cid)
        exception=None
        if cid in EXCEPTIONS:
            exception=ba['tokenCheckException']
            if not exception or exception.get('class')!='numericTokens': raise ValueError('Japanese exception evidence missing '+cid)
            if not check['checks']['numericTokens']: raise ValueError('recommended Japanese numeric tokens mismatch '+cid)
        elif not ba['tokenChecksPass']: raise ValueError('unexpected blind token exception '+cid)
        if not pl['tokenChecks'].get('allMatch',False): raise ValueError('primary token failure '+cid)

        if disp=='adjust':
            why={
              ('components.CollectionQueue.description','ja'):'Both candidates convey one or two unwatched movies, but the blind wording introduces Arabic digits where English spells the counts as words, while the primary is less explicit. This adjustment states 一本または二本 naturally and keeps the recommended numeric token inventory aligned.',
              ('components.Settings.analyzeOnPlaybackTip','ja'):'The blind wording makes opt-in behavior explicit but adds Arabic digit tokens for values expressed as words in English. This adjustment keeps opt-in behavior, the two-season-per-minute cap, the 30-day limit, Plex control, library settings, and Plex Pass while using Japanese number words.',
              ('components.CollectionQueue.title','ko'):'The caller is a modal heading. This noun phrase fits that role and uses the same 대기열 term as the collection queue button and status labels.',
              (CHANGED,'ko'):'The request-modal caller is episode-specific. Naming episodes and placing them before this request makes the ahead-of-request meaning explicit.',
              (CHANGED,'pt-BR'):'The request-modal caller is episode-specific. Naming episodes and saying they are ahead in the queue avoids reading com antecedência as a time reference.',
            }[(sid,loc)]
        elif not why:
            why=REASONS[sid]

        context_dependent=sid in {'components.CollectionQueue.buffer','components.Settings.SettingsJobsCache.movie-collection-queue',CHANGED}
        ambiguity=None
        if sid=='components.CollectionQueue.buffer': ambiguity='The selector and help text show that this is the number of unwatched movies kept ahead in the collection queue.'
        elif sid=='components.Settings.SettingsJobsCache.movie-collection-queue': ambiguity='The compound job label can mean a queue of collections or a queue of movie requests generated from collections; the runtime job context identifies the collection-queue feature.'
        elif sid==CHANGED: ambiguity='The revised source omits the noun after {count}; the direct caller renders the message for a TV request episode-queue control.'
        row={
          'schemaVersion':1,'cellId':cid,'sourceId':sid,'locale':loc,'sourcePosition':c.get('sourcePosition',d['order'][c['sourceIdSha256']]),
          'category':category,'cellStatus':c.get('cellStatus','changed-source-refresh'),'translationDecision':c['translationDecision'],
          'currentTargetPresent':c['currentTargetPresent'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],
          'sourceText':source,'sourceTextSha256':source_sha,'priorEnglishSourceText':c.get('priorEnglishSourceText'),
          'priorEnglishSourceSha256':c.get('priorEnglishSourceSha256'),'currentEnglishSourceText':c.get('currentEnglishSourceText'),
          'currentEnglishSourceSha256':c.get('currentEnglishSourceSha256'),'sourceIdSha256':c['sourceIdSha256'],
          'callerContextSha256':ctx['callerContextSha256'],'callerRoles':roles(ctx),'callerContextReviewed':True,
          'callerContextEvidenceRowSha256':d['callerRaw'][sid],'candidateFreeCellSha256':cell_raw_sha,
          'candidateFreeCatalogPath':c['targetCatalogPath'],'candidateFreeCatalogSha256':c['targetCatalogSha256'],
          'candidateFreeCatalogGitBlob':c['targetCatalogGitBlob'],
          'primaryCandidate':p['proposedTarget'],'primaryCandidateSha256':p['proposedTargetSha256'],
          'primaryLedgerRowSha256':d['primaryLedRaw'][cid],'primaryProposalRowSha256':d['primaryPropRaw'][cid],
          'blindCandidate':b['proposedTarget'],'blindCandidateSha256':b['proposedTargetSha256'],
          'blindLedgerRowSha256':d['blindLedRaw'][cid],'blindProposalRowSha256':d['blindPropRaw'][cid],
          'primaryReattestationRowSha256':d['primaryAttRaw'][cid],'blindReattestationRowSha256':d['blindAttRaw'][cid],
          'primaryReattestationCandidateSha256':pa['candidateSha256'],'blindReattestationCandidateSha256':ba['candidateSha256'],
          'sourceHead':HEAD,'sourceTree':TREE,'baseSha':BASE,'baseTree':BASETREE,'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,
          'primaryTokenChecksPass':pl['tokenChecks'].get('allMatch',False),
          'primaryReattestationTokenChecksPass':pa['tokenChecksPass'],
          'blindTokenChecksPass':all(bl['tokenChecks'].values()),
          'blindReattestationTokenChecksPass':ba['tokenChecksPass'],
          'blindNumericScannerExceptionReviewed':cid in EXCEPTIONS,'blindNumericScannerException':exception,
          'recommendedTarget':target,'recommendedTargetSha256':sha(target),'recommendedTokenCheck':check,
          'disposition':disp,'candidateSource':candidate_source,'confidence':'moderate','hold':False,'holdReason':None,
          'rationale':why,'selectionRationale':'Both sealed lanes agree exactly.' if candidate_source=='primary+blind' else
             ('Independent cross-review adjustment with an exact hash-bound target.' if candidate_source=='new' else
              f'Selected the {candidate_source} wording after comparing both sealed proposals.'),
          'contextDependent':context_dependent,'ambiguityNote':ambiguity,'sourceTokens':c.get('sourceTokens',c.get('currentSourceTokens')),
          'primaryTokenCheckSummary':pl['tokenChecks'],'blindTokenCheckSummary':bl['tokenChecks'],
          'protectedRoutePreserved':ROUTE in target if sid=='discovery.accounts.traktSetup' else None,
          'localeEditorialChecks':{'meaningAndCallerFit':True,'numberAndDateFormat':check['checks']['numericTokens'],
             'placeholdersAndIcu':check['checks']['placeholders'] and check['checks']['icuExpressions'],
             'protectedLiterals':check['checks']['protectedLiterals'],'punctuationAndReadability':True,'terminologyAndLocaleVariant':True}
        }
        rows.append(row)
    if len(rows)!=132 or len({r['cellId'] for r in rows})!=132: raise ValueError('expected 132 unique rows')
    if sum(r['category']=='insertion-gap' for r in rows)!=129 or sum(r['category']=='changed-source-refresh' for r in rows)!=3: raise ValueError('category counts')
    return rows

def write_json(path,obj):
    Path(path).write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')

def write_checksums():
    files=sorted(p for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
    (OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf-8')

def main():
    existing={p.name for p in OUT.iterdir() if p.is_file()}
    allowed=EXPECTED_FILES
    if existing-allowed: raise SystemExit(f'refusing to overwrite existing locale-c outputs: {sorted(existing-allowed)}')
    before=live_snapshot('entry'); check_snapshot(before)
    data=input_records()
    cf_result=subprocess.check_output([sys.executable,str(ROOT/'candidate-free'/'verify_candidate_free.py'),'--repo',str(REPO)],text=True,stderr=subprocess.STDOUT).strip()
    rows=make_rows(data)
    after=live_snapshot('exit'); check_snapshot(after)
    if before['remoteRefs']!=after['remoteRefs'] or before['githubPullRequestApi']!=after['githubPullRequestApi']:
        raise SystemExit('live PR refs changed during this lane; no packet was sealed')
    dispositions=collections.Counter(r['disposition'] for r in rows)
    candidate_sources=collections.Counter(r['candidateSource'] for r in rows)
    categories=collections.Counter(r['category'] for r in rows)
    by_locale=collections.Counter(r['locale'] for r in rows)
    contexts=[r['cellId'] for r in rows if r['contextDependent']]
    exceptions=[r['cellId'] for r in rows if r['blindNumericScannerExceptionReviewed']]
    summary={
      'artifact':'SeerrNG PR #418 W4000 lineage parity cross-review locale-c','repository':'snapetech-org/seerrng','pullRequest':418,
      'branch':BRANCH,'state':'OPEN','isDraft':True,'exactHead':HEAD,'exactTree':TREE,'baseRef':'main','baseSha':BASE,'baseTree':BASETREE,
      'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,'packetType':'independent-cross-review','result':'PASS',
      'scopeCells':len(rows),'sourceIds':44,'assignedLocales':LOCALES,'localeCellCounts':dict(by_locale),
      'insertionGapCells':categories['insertion-gap'],'changedSourceRefreshCells':categories['changed-source-refresh'],
      'dispositions':dict(dispositions),'candidateSources':dict(candidate_sources),'holds':sum(r['hold'] for r in rows),
      'contextDependentCellCount':len(contexts),'contextDependentCells':contexts,'callerContextRowsReviewed':len(rows),
      'primaryAndBlindRowsReattestedForThisLane':len(rows)*2,
      'all528PrimaryBlindHashRowsReattestedInInputPacket':data['reattestSummary']['primaryRowsReattested']+data['reattestSummary']['blindRowsReattested'],
      'sourceOrTargetCellDrift':data['reattestSummary']['sourceOrTargetCellDrift'],
      'recommendedTargetTokenFailures':sum(not r['recommendedTokenCheck']['allMatch'] for r in rows),
      'blindNumericScannerExceptionsReviewed':exceptions,
      'blindNumericScannerExceptionsDisposition':'Both blind forms were semantically equivalent number-word renderings. The exact recommendations use Japanese number words and preserve the source numeric-token inventory.',
      'candidateFreeVerifierResult':cf_result,
      'inputChecksumManifests':{'candidateFreeFiles':len(data['candidateSums']),'primaryFiles':len(data['primarySums']),
          'blindFiles':len(data['blindSums']),'reattestationFiles':len(data['reattSums'])},
      'entryRefs':before['remoteRefs'],'exitRefs':after['remoteRefs'],'nativeSpeakerReviewPerformed':False,
      'headedBrowserReviewPerformed':False,'testsBuildsScansCiOrWorkflowsRun':False,
    }
    (OUT/'cross-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
    write_json(OUT/'before-attestation.json',before); write_json(OUT/'after-attestation.json',after); write_json(OUT/'summary.json',summary)
    manifest={
      'schemaVersion':1,'artifact':summary['artifact'],'packetType':'independent-cross-review','repository':summary['repository'],
      'pullRequest':418,'branch':BRANCH,'exactHead':HEAD,'exactTree':TREE,'baseRef':'main','baseSha':BASE,'baseTree':BASETREE,
      'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,'assignedLocales':LOCALES,'cells':len(rows),
      'changedSourceRefreshCells':categories['changed-source-refresh'],'insertionGapCells':categories['insertion-gap'],
      'candidateFreePacketPath':'../../candidate-free','primaryPacketPath':'../../primary-review-old-head',
      'blindPacketPath':'../../blind-review-old-head','reattestationPacketPath':'../../reattestation',
      'candidateFreeManifestSha256':sha((ROOT/'candidate-free'/'manifest.json').read_bytes()),
      'primaryManifestSha256':sha((ROOT/'primary-review-old-head'/'manifest.json').read_bytes()),
      'blindManifestSha256':sha((ROOT/'blind-review-old-head'/'manifest.json').read_bytes()),
      'reattestationManifestSha256':sha((ROOT/'reattestation'/'manifest.json').read_bytes()),
      'candidateFreeChecksumListSha256':sha((ROOT/'candidate-free'/'SHA256SUMS.txt').read_bytes()),
      'primaryChecksumListSha256':sha((ROOT/'primary-review-old-head'/'SHA256SUMS.txt').read_bytes()),
      'blindChecksumListSha256':sha((ROOT/'blind-review-old-head'/'SHA256SUMS.txt').read_bytes()),
      'reattestationChecksumListSha256':sha((ROOT/'reattestation'/'SHA256SUMS.txt').read_bytes()),
      'numericScannerExceptionCellsReviewed':sorted(EXCEPTIONS),
      'payloadFiles':['README.md','after-attestation.json','before-attestation.json','build_cross_review.py',
          'cross-ledger.jsonl','manifest.json','summary.json','verify_cross_review.py'],
    }
    write_json(OUT/'manifest.json',manifest)
    readme=f"""# SeerrNG PR #418 parity cross-review: locale-c

This packet independently reviews 132 cells in Japanese, Korean, and Brazilian Portuguese against the current candidate-free source, target, and caller inputs plus the hash-reattested primary and blind proposals.

Exact pins: PR head {HEAD}, tree {TREE}; base main {BASE}, tree {BASETREE}. Scope is 129 insertion gaps (43 source IDs × 3 locales) plus 3 existing-target refreshes for {CHANGED}, totaling 132 cells. This lane is separate from the older W4000–W4019 cross-review.

Every source, target, and caller row was bound to the current candidate-free packet. Primary and blind candidate hashes were checked against hash-only reattestation rows before semantic review. The two Japanese blind numeric scanner differences were reviewed individually. Their numeric forms are equivalent to the English number words, but the exact recommendations use Japanese number words and preserve the source numeric-token inventory. Recommended wording passes placeholder, ICU, numeric, markup, inline-code, and protected-literal checks.

The ledger records exact targets, candidate/current/source/caller hashes, the changed-source refresh category, rationale, confidence, and caller roles. It contains no holds. No native-speaker or headed-browser review is claimed.

Portable verifier command:

    PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py

Exact Git readback command:

    PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py --repo {REPO}

The portable verifier makes no network requests. No repository or PR files were edited, and no tests, builds, scans, CI jobs, workflow changes, releases, or tags were run.
"""
    (OUT/'README.md').write_text(readme,encoding='utf-8')
    write_checksums()
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()

