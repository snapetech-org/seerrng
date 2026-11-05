#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT = ROOT / 'cross-review' / 'locale-a'
REPO = Path('/home/keith/Documents/code/seerrng')
HEAD = 'f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4'
TREE = 'f7ea727b0383397ec8d6220667b4abe151d43b46'
BASE = '2647e15762de0c2285cd9d8ebc6d27ffafce6358'
BASETREE = 'b6f4acb9debdc1b0a838b50d5ad88aaa467e429b'
OLD_HEAD = '77d30ae742aad7245e6e419237fca6a544531e1f'
OLD_TREE = '2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
BRANCH = 'codex/seerrng-localization-overhaul-20261028'
ROUTE = '/api/v1/integrations/discovery/trakt/callback'
LOCALES = ['ar','de','es','fr','hi','id']
CHANGED = 'components.RequestModal.watchAheadActiveForRequest'

# P = sealed primary wording; B = sealed blind wording; both = exact consensus; new = cross-review adjustment.
CHOICES = {
'components.CollectionDetails.queueCollection': {'default':'B','locales':{'ar':'both','es':'P','hi':'P'},'why':'The caller is a collection-page button that opens the queue modal, so an imperative action label fits.'},
'components.CollectionQueue.active': {'default':'P','locales':{'fr':'B'},'why':'This is a live queue status label; in French the full queue term avoids the unrelated meaning of a standalone file.'},
'components.CollectionQueue.buffer': {'default':'P','locales':{'ar':'B','fr':'B','hi':'B','id':'B'},'why':'The caller is the selector for how many unwatched movies stay ahead in the collection queue; the label must read as queue buffer size, not release timing.'},
'components.CollectionQueue.completed': {'default':'B','locales':{'fr':'P','ar':'B'},'why':'The caller renders a completed queue status and should report that all movies were added.'},
'components.CollectionQueue.description': {'default':'P','locales':{'es':'B','fr':'B','hi':'B'},'why':'The helper text must retain release order, one-or-two unwatched titles ahead, account defaults, future permission/quota/approval requirements, and counting previously requested movies.'},
'components.CollectionQueue.error': {'default':'B','locales':{'ar':'both','es':'both','hi':'P','id':'both'},'why':'The inline error identifies the collection queue update and tells the user to retry later.'},
'components.CollectionQueue.existing4k': {'default':'both','locales':{'ar':'B','fr':'B','id':'B'},'why':'The label preserves the protected 4K quality name and marks the queue as already existing.'},
'components.CollectionQueue.loading': {'default':'B','locales':{'ar':'both','id':'both'},'why':'The status describes loading the collection queue; the French wording includes the full queue term.'},
'components.CollectionQueue.one': {'default':'both','locales':{'ar':'B'},'why':'The queue count is one movie; the Arabic wording avoids a redundant numeral alongside the dual form.'},
'components.CollectionQueue.playback-unlinked': {'default':'both','locales':{'ar':'B','fr':'P','id':'B'},'why':'The reason message asks the user to link the named playback-provider account before continuing.'},
'components.CollectionQueue.progress': {'default':'both','locales':{'ar':'P','de':'P','fr':'P'},'why':'The status must keep watched, requested-by-this-queue, and total counts in their matching placeholder positions; the French primary uses gender agreement with films.'},
'components.CollectionQueue.provider-unavailable': {'default':'both','locales':{'ar':'B','hi':'P'},'why':'The queue reason identifies unavailable playback history and automatic retry.'},
'components.CollectionQueue.quality': {'default':'both','locales':{},'why':'The two lanes agree on the concise quality-field label.'},
'components.CollectionQueue.request-cancelled': {'default':'B','locales':{'hi':'P'},'why':'The queue reason must explain an earlier missing or interrupted request and the restart action for missing movies.'},
'components.CollectionQueue.request-policy': {'default':'P','locales':{},'why':'The queue reason lists request permissions, quota, blocked titles, service settings, and continuing approval requirements.'},
'components.CollectionQueue.requestAccess': {'default':'B','locales':{'hi':'P'},'why':'This prerequisite message says both movie-request permission and an enabled quality are needed before queue start.'},
'components.CollectionQueue.restart': {'default':'B','locales':{'de':'both','es':'both','fr':'both'},'why':'This is a button action to restart the collection queue; imperative wording is appropriate.'},
'components.CollectionQueue.start': {'default':'both','locales':{'ar':'B','id':'B'},'why':'This is the start-queue button action.'},
'components.CollectionQueue.stop': {'default':'B','locales':{'es':'both','fr':'both','hi':'both'},'why':'This is the stop-queue button action; the German blind wording distinguishes stopping from a permanent destructive action.'},
'components.CollectionQueue.stopHelp': {'default':'B','locales':{'id':'P'},'why':'The confirmation help limits the effect to future requests and explicitly keeps existing requests and downloaded files.'},
'components.CollectionQueue.stopped': {'default':'B','locales':{'de':'P','es':'both','fr':'both','id':'both'},'why':'This is the resulting stopped-queue status; the German primary says stopped rather than paused.'},
'components.CollectionQueue.title': {'default':'P','locales':{},'why':'This caller is a modal heading, so a noun phrase is correct; the blind candidates are button-style imperatives and do not fit the title.'},
'components.CollectionQueue.two': {'default':'P','locales':{},'why':'The label is a two-movie count; Arabic uses the dual noun and retains the numeric source literal.'},
'components.CollectionQueue.waiting': {'default':'both','locales':{},'why':'The lanes agree on the waiting status label.'},
'components.RequestEpisodeQueueControl.watchAheadEpisodeOption': {'default':'B','locales':{'de':'P'},'why':'The option is an ICU plural count; keep the count argument, plural branches, pound token, and the locale-appropriate episode noun.'},
'components.RequestEpisodeQueueControl.watchAheadLoading': {'default':'B','locales':{'ar':'both'},'why':'This loading message refers to the account’s Episode Queue setting.'},
'components.RequestEpisodeQueueControl.watchAheadOff': {'default':'both','locales':{'ar':'new'},'new':{'ar':'معطّل'},'why':'This is a disabled selector state, and the current Arabic episode-queue glossary uses معطّل for Off.'},
'components.RequestEpisodeQueueControl.watchAheadOverride': {'default':'B','locales':{'ar':'both','de':'P','es':'both','fr':'both','hi':'both'},'why':'This is the queue-length selector label; the chosen wording uses the established queue term.'},
'components.RequestEpisodeQueueControl.watchAheadOverrideHelp': {'default':'B','locales':{'id':'new'},'new':{'id':'Hanya berlaku untuk penambahan episode ke antrean di masa mendatang. Permintaan episode dan file yang sudah diunduh tetap seperti semula.'},'why':'The help applies only to future additions to the queue and assures users that existing episode requests and downloaded files remain unchanged.'},
'components.RequestEpisodeQueueControl.watchAheadSaveFailed': {'default':'B','locales':{'de':'both'},'why':'The error identifies the Episode Queue setting, asks the user to reload the request, and then retry.'},
'components.RequestEpisodeQueueControl.watchAheadSaved': {'default':'B','locales':{'ar':'both','de':'both','es':'both','fr':'B','hi':'both','id':'both'},'why':'This is a success notification for saving the Episode Queue setting; the French wording retains the full queue term.'},
'components.RequestEpisodeQueueControl.watchAheadUseDefault': {'default':'B','locales':{'ar':'both','es':'both','fr':'both','hi':'both'},'why':'The selector label identifies the account default and retains the count placeholder.'},
'components.RequestEpisodeQueueModal.loadError': {'default':'B','locales':{'ar':'both','de':'both','fr':'both','id':'both'},'why':'The dialog error states that the account default could not load and directs the user to close and retry.'},
'components.RequestEpisodeQueueModal.title': {'default':'P','locales':{},'why':'This is a modal title; Indonesian primary capitalization matches the existing Episode Queue settings term.'},
'components.RequestModal.watchAheadOff': {'default':'both','locales':{'ar':'new'},'new':{'ar':'معطّل'},'why':'This is a disabled selector state, and the current Arabic episode-queue glossary uses معطّل for Off.'},
'components.RequestModal.watchAheadOverrideDescription': {'default':'B','locales':{'ar':'both','es':'both','fr':'both'},'why':'This request-level message must preserve its own Episode Queue setting and the count placeholder.'},
'components.Requests.episodeQueue': {'default':'P','locales':{},'why':'The nav/action label uses the same Indonesian title-case term as the existing Episode Queue settings label.'},
'components.Settings.SettingsJobsCache.movie-collection-queue': {'default':'P','locales':{'de':'both','fr':'both'},'why':'This is a background-job type label for the movie-collection queue; the compound can refer to a queue of collection-derived movie requests.'},
'components.Settings.SettingsJobsCache.plex-playback-analysis': {'default':'P','locales':{'ar':'both','de':'both','es':'both','fr':'both','hi':'both','id':'B'},'why':'This settings table label names the Plex playback-analysis job; the Indonesian blind version follows sentence-case labels.'},
'components.Settings.analyzeOnPlayback': {'default':'both','locales':{'hi':'B','id':'B'},'why':'This checkbox label describes analyzing multiple seasons during playback.'},
'components.Settings.analyzeOnPlaybackTip': {'default':'B','locales':{'de':'P','hi':'P','id':'P'},'why':'This settings help must preserve the cap of two seasons per minute, one analysis per season every 30 days, Plex control of intro/credits generation, library settings, and Plex Pass requirements.'},
'discovery.accounts.traktCallbackFailed': {'default':'P','locales':{'ar':'B','de':'both','fr':'P','es':'P','hi':'P','id':'B'},'why':'This alert requires checking the public HTTPS application URL and callback URL registered in Trakt before retrying authorization.'},
'discovery.accounts.traktSetup': {'default':'B','locales':{'es':'P','hi':'new'},'new':{'hi':'Trakt जोड़ने के लिए, व्यवस्थापक को सेटिंग → जनरल में सार्वजनिक HTTPS ऐप URL सेट करना होगा और उस URL के बाद /api/v1/integrations/discovery/trakt/callback जोड़कर Trakt ऐप में पंजीकृत करना होगा।'},'why':'The account setup instructions must preserve the exact callback route and use the locale’s current Settings → General labels.'},
CHANGED: {'default':'B','locales':{},'why':'The revised source means this request keeps a number of episodes queued ahead; the blind wording names episodes explicitly in the request-modal context.'},
}

PLACEHOLDER = re.compile(r'\{([A-Za-z][A-Za-z0-9_]*)\}')
MARKUP = re.compile(r'</?[A-Za-z][^>]*>')
NUMBERS = re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
PROTECTED = re.compile(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])')
EXTRA_PROTECTED = ('SeerrNG','Seerr','BookshelfNG','ReadMeABook')
ICU_TYPES = ('plural','select','selectordinal','number','date','time')

def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def sha_text(s: str) -> str:
    return sha(s.encode('utf-8'))

def read_rows(path: Path):
    out = {}
    raws = {}
    for raw in path.read_bytes().splitlines():
        if not raw.strip():
            continue
        row = json.loads(raw)
        key = row['cellId'] if 'cellId' in row else row.get('sourceId')
        if key in out:
            raise ValueError(f'duplicate row {key} in {path}')
        out[key] = row
        raws[key] = sha(raw)
    return out, raws

def readj(path):
    return json.loads(path.read_text(encoding='utf-8'))

def readjl(path):
    return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]

def git(*args):
    return subprocess.check_output(['git','-C',str(REPO),*args],text=True,stderr=subprocess.STDOUT).strip()

def live_snapshot(label):
    api = json.loads(subprocess.check_output(['gh','pr','view','418','--repo','snapetech-org/seerrng','--json','state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url'],text=True))
    ls = subprocess.check_output(['git','-C',str(REPO),'ls-remote','origin',f'refs/heads/main',f'refs/heads/{BRANCH}','refs/pull/418/head'],text=True)
    refs = {}
    for line in ls.splitlines():
        oid, ref = line.split('\t',1)
        refs[ref] = oid
    return {
        'label':label,
        'capturedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'githubPullRequestApi':api,
        'remoteRefs':refs,
        'localGitObjects':{
            'head':HEAD,
            'headTree':git('rev-parse',f'{HEAD}^{{tree}}'),
            'base':BASE,
            'baseTree':git('rev-parse',f'{BASE}^{{tree}}'),
        },
    }

def check_snapshot(s):
    api=s['githubPullRequestApi']; refs=s['remoteRefs']; local=s['localGitObjects']
    assert api == {
        'baseRefName':'main','baseRefOid':BASE,'headRefName':BRANCH,'headRefOid':HEAD,
        'isDraft':True,'state':'OPEN','url':'https://github.com/snapetech-org/seerrng/pull/418'
    }, api
    assert refs == {
        'refs/heads/main':BASE,
        f'refs/heads/{BRANCH}':HEAD,
        'refs/pull/418/head':HEAD,
    }, refs
    assert local == {'head':HEAD,'headTree':TREE,'base':BASE,'baseTree':BASETREE}, local

def icu(value):
    found=[]
    for start,ch in enumerate(value):
        if ch!='{': continue
        depth=0; end=None
        for i in range(start,len(value)):
            if value[i]=='{': depth+=1
            elif value[i]=='}':
                depth-=1
                if depth==0: end=i+1; break
        if end is None: continue
        raw=value[start:end]
        m=re.match(r'^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*('+'|'.join(ICU_TYPES)+r')\b',raw)
        if m:
            selectors=re.findall(r'(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{',raw)
            found.append({'argument':m.group(1),'formatType':m.group(2),'selectors':selectors,'usesPound':'#' in raw,'raw':raw})
    return found

def tokens(value):
    protected=list(dict.fromkeys(PROTECTED.findall(value)))
    protected.extend(x for x in EXTRA_PROTECTED if x in value and x not in protected)
    return {
        'placeholders':PLACEHOLDER.findall(value),
        'icuExpressions':icu(value),
        'markupTags':MARKUP.findall(value),
        'numericTokens':NUMBERS.findall(value),
        'protectedLiterals':protected,
        'inlineCode':re.findall(chr(96)+r'([^'+chr(96)+r']+)'+chr(96),value),
    }

def token_checks(source,target):
    a,b=tokens(source),tokens(target)
    shape=lambda xs:[(x['argument'],x['formatType'],x['selectors'],x['usesPound']) for x in xs]
    checks={
        'placeholders':a['placeholders']==b['placeholders'],
        'icuExpressions':shape(a['icuExpressions'])==shape(b['icuExpressions']),
        'markupTags':a['markupTags']==b['markupTags'],
        'numericTokens':a['numericTokens']==b['numericTokens'],
        'protectedLiterals':all(x in b['protectedLiterals'] for x in a['protectedLiterals']),
        'inlineCode':a['inlineCode']==b['inlineCode'],
    }
    return {'checks':checks,'allMatch':all(checks.values()),'sourceTokens':a,'targetTokens':b,
        'missingProtectedLiterals':[x for x in a['protectedLiterals'] if x not in b['protectedLiterals']]}

def choose(sid,loc,p,b):
    spec=CHOICES.get(sid)
    if spec is None:
        raise ValueError('missing choice map for '+sid)
    pick=spec.get('locales',{}).get(loc,spec['default'])
    if pick=='both':
        if p!=b: raise ValueError(f'non-consensus candidates marked both: {sid}::{loc}')
        return p,'accept','primary+blind'
    if pick=='P': return p,'accept',('primary+blind' if p==b else 'primary')
    if pick=='B': return b,'accept',('primary+blind' if p==b else 'blind')
    if pick=='new': return spec['new'][loc],'adjust','new'
    raise ValueError('invalid pick '+str(pick))

def input_records():
    candidate=ROOT/'candidate-free'
    gap,gapRaw=read_rows(candidate/'gap-cells.jsonl')
    changed,changedRaw=read_rows(candidate/'changed-source-cells.jsonl')
    caller,callerRaw=read_rows(candidate/'caller-contexts.jsonl')
    primary,pRaw=read_rows(ROOT/'primary-review-old-head'/'review-ledger.jsonl')
    blind,bRaw=read_rows(ROOT/'blind-review-old-head'/'ledger.jsonl')
    pprops,ppropRaw=read_rows(ROOT/'primary-review-old-head'/'proposals.jsonl')
    bprops,bpropRaw=read_rows(ROOT/'blind-review-old-head'/'proposals.jsonl')
    preatt,pattRaw=read_rows(ROOT/'reattestation'/'primary-reattestation.jsonl')
    batt,battRaw=read_rows(ROOT/'reattestation'/'blind-reattestation.jsonl')
    assert len(gap)==516 and len(changed)==12 and len(caller)==44
    assert len(primary)==len(blind)==len(pprops)==len(bprops)==len(preatt)==len(batt)==528
    return (gap,gapRaw,changed,changedRaw,caller,callerRaw,primary,pRaw,blind,bRaw,pprops,ppropRaw,bprops,bpropRaw,preatt,pattRaw,batt,battRaw)

def glossary_evidence(locale,source_id,target_file_sha):
    catalog_files={'ar':'ar.json','hi':'hi.json'}
    raw=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:src/i18n/locale/{catalog_files[locale]}'])
    assert sha(raw)==target_file_sha
    obj=json.loads(raw)
    if locale=='ar':
        key='components.UserProfile.UserSettings.UserEpisodeQueueSettings.off'
        value=obj[key]
        assert value=='معطّل'
        return {'catalogFile':'src/i18n/locale/ar.json','catalogSha256':sha(raw),'sourceId':key,'text':value,'textSha256':sha_text(value)}
    settings_key='components.Settings.settings'; general_key='components.Settings.general'
    settings=obj[settings_key]; general=obj[general_key]
    assert (settings,general)==('सेटिंग','जनरल')
    return {'catalogFile':'src/i18n/locale/hi.json','catalogSha256':sha(raw),
        'settingsSourceId':settings_key,'settingsText':settings,'settingsTextSha256':sha_text(settings),
        'generalSourceId':general_key,'generalText':general,'generalTextSha256':sha_text(general)}

def make_ledger(inputs):
    gap,gapRaw,changed,changedRaw,caller,callerRaw,primary,pRaw,blind,bRaw,pprops,ppropRaw,bprops,bpropRaw,preatt,pattRaw,batt,battRaw=inputs
    rows=[]
    ordered=[]
    source_order_position={r['sourceIdSha256']:r['position'] for r in readjl(ROOT/'candidate-free'/'source-order-hashes.jsonl')}
    source_pos={}
    for cell in gap.values():
        source_pos[cell['sourceId']]=cell['sourcePosition']
    source_ids=sorted(source_pos,key=lambda sid:source_pos[sid])
    for sid in source_ids:
        for loc in LOCALES:
            if loc in LOCALES:
                cellid=f'{sid}::{loc}'
                if loc not in LOCALES or cellid not in gap: continue
                ordered.append((cellid,gap[cellid],gapRaw[cellid],'insertion-gap'))
    for loc in LOCALES:
        cellid=f'{CHANGED}::{loc}'
        ordered.append((cellid,changed[cellid],changedRaw[cellid],'changed-source-refresh'))
    assert len(ordered)==264
    for cellid,c,cfhash,category in ordered:
        sid=c['sourceId']; loc=c['locale']; p=primary[cellid]; b=blind[cellid]
        pr=pprops[cellid]; br=bprops[cellid]; pa=preatt[cellid]; ba=batt[cellid]
        ctx=caller[sid]
        expected_source_sha=c.get('sourceTextSha256',c.get('currentEnglishSourceSha256'))
        assert p['proposedTargetSha256']==sha_text(p['proposedTarget'])
        assert b['proposedTargetSha256']==sha_text(b['proposedTarget'])
        assert pr['proposedTargetSha256']==sha_text(p['proposedTarget'])
        assert br['proposedTargetSha256']==sha_text(b['proposedTarget'])
        assert pa['candidateSha256']==p['proposedTargetSha256'] and ba['candidateSha256']==b['proposedTargetSha256']
        assert pa['candidateTextIncluded'] is False and ba['candidateTextIncluded'] is False
        assert pa['currentHead']==HEAD and pa['currentTree']==TREE and ba['currentHead']==HEAD and ba['currentTree']==TREE
        assert pa['sourceTextSha256']==c.get('sourceTextSha256',c.get('currentEnglishSourceSha256'))
        assert ba['sourceTextSha256']==pa['sourceTextSha256']
        assert pa['currentCallerContextSha256']==ctx['callerContextSha256']==ba['currentCallerContextSha256']
        assert pa['currentTargetSha256']==c['currentTargetSha256']==ba['currentTargetSha256']
        assert p['sourceContextSha256']==ctx['callerContextSha256']
        assert b['callerContextSha256']==ctx['callerContextSha256']
        assert p['sourceHead']==OLD_HEAD and p['sourceTree']==OLD_TREE
        assert b['exactHead']==OLD_HEAD and b['exactTree']==OLD_TREE
        assert p['sourceId']==sid and b['sourceId']==sid and p['locale']==loc and b['locale']==loc
        assert p['sourceTextSha256']==expected_source_sha
        assert b['sourceTextSha256']==expected_source_sha
        assert p['currentTargetSha256']==c['currentTargetSha256'] and b['currentTargetSha256']==c['currentTargetSha256']
        assert p['tokenChecks']['allMatch'] is True
        assert all(b['tokenChecks'].values())
        assert pa['tokenChecksPass'] is True and ba['tokenChecksPass'] is True
        if category=='insertion-gap':
            assert c['cellStatus']=='missing-target' and c['translationDecision']=='translation-required'
            assert c['currentTarget'] is None and c['currentTargetPresent'] is False and c['currentTargetSha256'] is None
            source=c['sourceText']; source_sha=c['sourceTextSha256']
        else:
            assert c['translationDecision']=='translation-refresh-review-required' and c['currentTargetPresent'] is True
            source=c['currentEnglishSourceText']; source_sha=c['currentEnglishSourceSha256']
        selected,disposition,candidate_source=choose(sid,loc,p['proposedTarget'],b['proposedTarget'])
        check=token_checks(source,selected)
        assert check['allMatch'], (cellid,check)
        assert sha_text(selected)
        if sid=='components.CollectionQueue.existing4k': assert '4K' in selected
        if sid=='components.Settings.analyzeOnPlaybackTip':
            assert all(x in selected for x in ('TV','30','Plex','Plex Pass'))
        if sid=='discovery.accounts.traktSetup': assert ROUTE in selected
        if sid==CHANGED: assert '{count}' in selected
        spec=CHOICES[sid]
        roles=[]
        for site in ctx.get('sites',[]):
            if site['role'] not in roles: roles.append(site['role'])
        ambiguity=None
        context_dependent=sid in {'components.CollectionQueue.buffer','components.Settings.SettingsJobsCache.movie-collection-queue',CHANGED}
        if sid=='components.CollectionQueue.buffer': ambiguity='“Ahead” is interpreted using the selector and help text: number of unwatched movies maintained ahead in the queue.'
        elif sid=='components.Settings.SettingsJobsCache.movie-collection-queue': ambiguity='The compound label could denote a queue of collections or a queue of movie requests generated from a collection; the runtime job caller was used to prefer the collection-queue feature reading.'
        elif sid==CHANGED: ambiguity='The revised source omits the noun after {count}; the request-modal caller is an episode queue control, so the recommendation supplies “episodes” explicitly.'
        row={
            'schemaVersion':1,
            'cellId':cellid,'sourceId':sid,'locale':loc,'sourcePosition':c.get('sourcePosition',source_order_position[c['sourceIdSha256']]),
            'category':category,'cellStatus':c.get('cellStatus','changed-source-refresh'),
            'translationDecision':c['translationDecision'],
            'currentTargetPresent':c['currentTargetPresent'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],
            'sourceText':source,'sourceTextSha256':source_sha,
            'priorEnglishSourceText':c.get('priorEnglishSourceText'),'priorEnglishSourceSha256':c.get('priorEnglishSourceSha256'),
            'currentEnglishSourceText':c.get('currentEnglishSourceText'),'currentEnglishSourceSha256':c.get('currentEnglishSourceSha256'),
            'sourceIdSha256':c['sourceIdSha256'],'callerContextSha256':ctx['callerContextSha256'],
            'callerRoles':roles,'callerContextReviewed':True,'callerContextEvidenceRowSha256':callerRaw[sid],
            'candidateFreeCellSha256':cfhash,'candidateFreeCatalogPath':c['targetCatalogPath'],
            'candidateFreeCatalogSha256':c['targetCatalogSha256'],'candidateFreeCatalogGitBlob':c['targetCatalogGitBlob'],
            'primaryCandidate':p['proposedTarget'],'primaryCandidateSha256':p['proposedTargetSha256'],
            'primaryLedgerRowSha256':pRaw[cellid],'primaryProposalRowSha256':ppropRaw[cellid],
            'blindCandidate':b['proposedTarget'],'blindCandidateSha256':b['proposedTargetSha256'],
            'blindLedgerRowSha256':bRaw[cellid],'blindProposalRowSha256':bpropRaw[cellid],
            'primaryReattestationRowSha256':pattRaw[cellid],'blindReattestationRowSha256':battRaw[cellid],
            'primaryReattestationCandidateSha256':pa['candidateSha256'],'blindReattestationCandidateSha256':ba['candidateSha256'],
            'sourceHead':HEAD,'sourceTree':TREE,'baseSha':BASE,'baseTree':BASETREE,
            'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,
            'primaryTokenChecksPass':p['tokenChecks']['allMatch'],'blindTokenChecksPass':all(b['tokenChecks'].values()),
            'recommendedTarget':selected,'recommendedTargetSha256':sha_text(selected),
            'disposition':disposition,'candidateSource':candidate_source,'confidence':'moderate','hold':False,'holdReason':None,
            'rationale':spec['why'],
            'selectionRationale':('Both lanes agree.' if candidate_source=='primary+blind' else ('Cross-review adjustment uses current product terminology.' if candidate_source=='new' else ('Selected the '+candidate_source+' wording after comparing both sealed proposals.' ))),
            'contextDependent':context_dependent,'ambiguityNote':ambiguity,
            'sourceTokens':c['sourceTokens'],'recommendedTokenCheck':check,
            'primaryTokenCheckSummary':p['tokenChecks'],'blindTokenCheckSummary':b['tokenChecks'],
            'protectedRoutePreserved':(ROUTE in selected) if sid=='discovery.accounts.traktSetup' else None,
            'localeEditorialChecks':{
                'meaningAndCallerFit':True,'numberAndDateFormat':True,'placeholdersAndIcu':check['checks']['placeholders'] and check['checks']['icuExpressions'],
                'protectedLiterals':check['checks']['protectedLiterals'],'punctuationAndReadability':True,'terminologyAndLocaleVariant':True,
            },
        }
        if (sid in {'components.RequestEpisodeQueueControl.watchAheadOff','components.RequestModal.watchAheadOff'} and loc=='ar'):
            row['terminologyEvidence']=glossary_evidence('ar',sid,c['targetCatalogSha256'])
        if sid=='discovery.accounts.traktSetup' and loc=='hi':
            row['terminologyEvidence']=glossary_evidence('hi',sid,c['targetCatalogSha256'])
        rows.append(row)
    assert len(rows)==264 and len({r['cellId'] for r in rows})==264
    assert sum(r['category']=='insertion-gap' for r in rows)==258
    assert sum(r['category']=='changed-source-refresh' for r in rows)==6
    assert sum(r['disposition']=='adjust' for r in rows)==4
    assert sum(r['hold'] for r in rows)==0
    return rows

def write_json(path,obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')

def main():
    assert OUT.is_dir()
    assert all(p.name in {'build_cross_review.py','before-attestation.json','cross-ledger.jsonl','summary.json','after-attestation.json','manifest.json','README.md','verify_cross_review.py','SHA256SUMS.txt'} for p in OUT.iterdir())
    before=live_snapshot('before')
    check_snapshot(before)
    write_json(OUT/'before-attestation.json',before)
    inputs=input_records()
    rows=make_ledger(inputs)
    (OUT/'cross-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
    bysrc=Counter(r['sourceId'] for r in rows)
    bydis=Counter(r['disposition'] for r in rows)
    bysrcsel=Counter(r['candidateSource'] for r in rows)
    ctx=[r for r in rows if r['contextDependent']]
    summary={
        'result':'PASS','packetType':'independent-cross-review','repository':'snapetech-org/seerrng','pullRequest':418,
        'exactHead':HEAD,'exactTree':TREE,'baseSha':BASE,'baseTree':BASETREE,'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,
        'assignedLocales':LOCALES,'scopeCells':len(rows),'sourceIds':len(bysrc),
        'localeCellCounts':{loc:sum(r['locale']==loc for r in rows) for loc in LOCALES},
        'localeInsertionGapCounts':{loc:sum(r['locale']==loc and r['category']=='insertion-gap' for r in rows) for loc in LOCALES},
        'localeChangedSourceRefreshCounts':{loc:sum(r['locale']==loc and r['category']=='changed-source-refresh' for r in rows) for loc in LOCALES},
        'insertionGapCells':sum(r['category']=='insertion-gap' for r in rows),
        'changedSourceRefreshCells':sum(r['category']=='changed-source-refresh' for r in rows),
        'dispositions':dict(bydis), 'candidateSources':dict(bysrcsel),'holds':0,
        'contextDependentCellCount':len(ctx),'contextDependentSourceIds':sorted({r['sourceId'] for r in ctx}),
        'contextDependentCells':[r['cellId'] for r in ctx],
        'customAdjustments':[{'cellId':r['cellId'],'recommendedTarget':r['recommendedTarget'],'rationale':r['rationale']} for r in rows if r['disposition']=='adjust'],
        'tokenCheckFailures':0,'primaryAndBlindRowsReattested':528,'assignedPrimaryBlindCandidateHashesReconciled':len(rows)*2,
        'candidateFreeVerifierResult':'PASS','nativeSpeakerReviewPerformed':False,'headedBrowserReviewPerformed':False,
        'testsBuildsScansCiOrWorkflowsRun':False,
        'entryRefs':before['remoteRefs'],
        'reviewLimits':'Independent semantic cross-review of both sealed proposal lanes against fresh caller/source/current-target pins. No native-speaker or headed-browser review was performed.'
    }
    write_json(OUT/'summary.json',summary)
    after=live_snapshot('after')
    check_snapshot(after)
    assert before['remoteRefs']==after['remoteRefs']
    assert before['githubPullRequestApi']==after['githubPullRequestApi']
    write_json(OUT/'after-attestation.json',after)
    manifest={
        'schemaVersion':1,'packetType':'independent-cross-review','repository':'snapetech-org/seerrng','pullRequest':418,
        'exactHead':HEAD,'exactTree':TREE,'baseSha':BASE,'baseTree':BASETREE,'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,
        'assignedLocales':LOCALES,'cells':len(rows),'candidateFreePacketPath':'../candidate-free','reattestationPacketPath':'../reattestation',
        'primaryPacketPath':'../primary-review-old-head','blindPacketPath':'../blind-review-old-head',
        'candidateFreeChecksumListSha256':sha((ROOT/'candidate-free'/'SHA256SUMS.txt').read_bytes()),
        'reattestationChecksumListSha256':sha((ROOT/'reattestation'/'SHA256SUMS.txt').read_bytes()),
        'primaryChecksumListSha256':sha((ROOT/'primary-review-old-head'/'SHA256SUMS.txt').read_bytes()),
        'blindChecksumListSha256':sha((ROOT/'blind-review-old-head'/'SHA256SUMS.txt').read_bytes()),
        'candidateFreeManifestSha256':sha((ROOT/'candidate-free'/'manifest.json').read_bytes()),
        'reattestationManifestSha256':sha((ROOT/'reattestation'/'manifest.json').read_bytes()),
        'primaryManifestSha256':sha((ROOT/'primary-review-old-head'/'manifest.json').read_bytes()),
        'blindManifestSha256':sha((ROOT/'blind-review-old-head'/'manifest.json').read_bytes()),
        'rootTaskManifestRebuildDeferredToParent':True,
        'payloadFiles':['README.md','after-attestation.json','before-attestation.json','build_cross_review.py','cross-ledger.jsonl','summary.json','verify_cross_review.py'],
    }
    write_json(OUT/'manifest.json',manifest)
    print(f'Wrote {len(rows)} rows: {dict(bydis)}; custom adjustments={summary["customAdjustments"]}')

if __name__=='__main__':
    main()
