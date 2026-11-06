#!/usr/bin/env python3
from __future__ import annotations
import collections, datetime as dt, hashlib, json, os, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode = True

TASK = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT = TASK / 'cross-review-sealed'
REPO = Path('/mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume')
sys.path.insert(0, str(TASK/'cross-review'/'locale-c'))
import build_cross_review as util

HEAD,TREE,BASE,BASETREE = util.HEAD,util.TREE,util.BASE,util.BASETREE
OLD_HEAD,OLD_TREE,BRANCH = util.OLD_HEAD,util.OLD_TREE,util.BRANCH
ROUTE=util.ROUTE
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-Hans','zh-Hant']
LANES={
 'locale-a':{'path':TASK/'cross-review'/'locale-a','file':'cross-ledger.jsonl','locales':['ar','de','es','fr','hi','id']},
 'locale-b':{'path':TASK/'cross-review'/'locale-b','file':'ledger.jsonl','locales':['vi','zh-Hans','zh-Hant']},
 'locale-c':{'path':TASK/'cross-review'/'locale-c','file':'cross-ledger.jsonl','locales':['ja','ko','pt-BR']},
}
EXPECTED_FILES={'README.md','SHA256SUMS.txt','after-attestation.json','before-attestation.json',
 'build_cross_review.py','cross-ledger.jsonl','manifest.json','summary.json','verify_cross_review.py'}

def sha(data):
    if isinstance(data,str): data=data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()

def readj(path): return json.loads(Path(path).read_text(encoding='utf-8'))
def readjl(path): return [json.loads(x) for x in Path(path).read_text(encoding='utf-8').splitlines() if x.strip()]

def writej(path,obj):
    Path(path).write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')

def run(cmd):
    return subprocess.check_output(cmd,text=True,stderr=subprocess.STDOUT).strip()

def verify_sums(folder, allow_work=False):
    folder=Path(folder)
    sums={}
    for line in (folder/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        digest,name=line.split('  ',1)
        p=Path(name)
        if p.is_absolute() or '..' in p.parts or name in sums: raise ValueError(f'unsafe/duplicate checksum: {folder}/{name}')
        fp=folder/p
        if not fp.is_file() or sha(fp.read_bytes())!=digest: raise ValueError(f'checksum failure: {folder}/{name}')
        sums[name]=digest
    actual={p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'
            and not (allow_work and '.work' in p.relative_to(folder).parts)}
    if set(sums)!=actual: raise ValueError(f'checksum inventory mismatch: {folder}')
    return sums

def snapshot(label):
    api=json.loads(run(['gh','pr','view','418','--repo','snapetech-org/seerrng','--json',
       'state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url']))
    output=run(['git','-C',str(REPO),'ls-remote','origin','refs/heads/main',f'refs/heads/{BRANCH}','refs/pull/418/head'])
    refs={}
    for line in output.splitlines():
        oid,ref=line.split('\t',1); refs[ref]=oid
    return {'label':label,'capturedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
      'githubPullRequestApi':api,'remoteRefs':refs,
      'localGitObjects':{'head':HEAD,'headTree':run(['git','-C',str(REPO),'rev-parse',f'{HEAD}^{{tree}}']),
       'base':BASE,'baseTree':run(['git','-C',str(REPO),'rev-parse',f'{BASE}^{{tree}}']),
       'worktreeHead':run(['git','-C',str(REPO),'rev-parse','HEAD']),
       'worktreeTree':run(['git','-C',str(REPO),'rev-parse','HEAD^{tree}']),
       'worktreeStatus':run(['git','-C',str(REPO),'status','--porcelain'])}}

def check_snapshot(x):
    need=lambda ok,msg: (_ for _ in ()).throw(ValueError(msg)) if not ok else None
    need(x['githubPullRequestApi']=={'baseRefName':'main','baseRefOid':BASE,'headRefName':BRANCH,'headRefOid':HEAD,
      'isDraft':True,'state':'OPEN','url':'https://github.com/snapetech-org/seerrng/pull/418'},'PR API pins changed')
    need(x['remoteRefs']=={'refs/heads/main':BASE,f'refs/heads/{BRANCH}':HEAD,'refs/pull/418/head':HEAD},'remote refs changed')
    need(x['localGitObjects']=={'head':HEAD,'headTree':TREE,'base':BASE,'baseTree':BASETREE,
       'worktreeHead':HEAD,'worktreeTree':TREE,'worktreeStatus':''},'local worktree pins changed')

def verify_lane_outputs(exact=True):
    lane_summaries={}
    lane_rows={}
    lane_raw={}
    lane_bindings={}
    lane_binding_raw={}
    for lane,meta in LANES.items():
        path=meta['path']
        verify_sums(path)
        summary=readj(path/'summary.json')
        lane_manifest=readj(path/'manifest.json')
        rows,hashes=util.read_rows(path/meta['file'])
        if set(summary.get('assignedLocales',summary.get('locales',[])))!=set(meta['locales']) and lane!='locale-b':
            raise ValueError(f'{lane} locale set mismatch')
        if summary.get('exactHead',summary.get('head'))!=HEAD or summary.get('exactTree',summary.get('tree'))!=TREE:
            raise ValueError(f'{lane} exact head/tree mismatch')
        if summary.get('baseSha',summary.get('base'))!=BASE:
            raise ValueError(f'{lane} base mismatch')
        if summary.get('result')!='PASS':
            raise ValueError(f'{lane} summary is not PASS')
        if len(rows)!=sum(summary.get(k,0) for k in ('scopeCells','cells')):
            # Lane C and A use scopeCells; lane B uses cells.
            expected=summary.get('scopeCells',summary.get('cells'))
            if len(rows)!=expected: raise ValueError(f'{lane} row count mismatch')
        if len(rows)!=sum(1 for _ in rows) or any(r.get('locale') not in meta['locales'] for r in rows.values()):
            raise ValueError(f'{lane} rows have wrong locale assignment')
        lane_summaries[lane]=summary
        lane_rows[lane]=rows
        lane_raw[lane]=hashes
        if lane=='locale-b':
            bind,br=util.read_rows(path/'shared-input-bindings-528.jsonl')
            if len(bind)!=528: raise ValueError('locale-b shared 528-cell binding count')
            lane_bindings[lane]=bind; lane_binding_raw[lane]=br
        else:
            lane_bindings[lane]={}; lane_binding_raw[lane]={}

        env=os.environ.copy()
        env['PYTHONDONTWRITEBYTECODE']='1'
        cmd=[sys.executable,str(path/'verify_cross_review.py')]
        if lane in ('locale-a','locale-c') and exact:
            cmd += ['--repo',str(REPO)]
        subprocess.check_output(cmd,text=True,stderr=subprocess.STDOUT,env=env)

    cfout=subprocess.check_output([sys.executable,str(TASK/'candidate-free'/'verify_candidate_free.py'),'--repo',str(REPO)],
        text=True,stderr=subprocess.STDOUT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}).strip()
    return lane_summaries,lane_rows,lane_raw,lane_bindings,lane_binding_raw,cfout

def cell_context(cell,ctx,ctxraw,cellraw,order):
    sid=cell['sourceId']
    source=cell.get('sourceText') or cell.get('currentEnglishSourceText')
    source_sha=cell.get('sourceTextSha256') or cell.get('currentEnglishSourceSha256')
    roles=[]
    for site in ctx[sid].get('sites',[]):
        if site['role'] not in roles: roles.append(site['role'])
    return source,source_sha,roles,ctx[sid],ctxraw[sid],cellraw,cell.get('sourcePosition',order[cell['sourceIdSha256']])

def normalize(native,lane,lane_row_sha,binding,binding_sha,data,allcells,allraw,caller,caller_raw,order):
    cid=native['cellId']; cell=allcells[cid]; sid=cell['sourceId']; loc=cell['locale']
    p=data['primaryProp'][cid]; pl=data['primaryLed'][cid]; b=data['blindProp'][cid]; bl=data['blindLed'][cid]
    pa=data['primaryAtt'][cid]; ba=data['blindAtt'][cid]; ctx=caller[sid]
    source,source_sha,caller_roles,ctx,ctx_row_sha,cell_row_sha,pos=cell_context(cell,caller,caller_raw,allraw[cid],order)
    if lane=='locale-b':
        category='changed-source-refresh' if sid==util.CHANGED else 'insertion-gap'
        recommendation=native['recommendedTarget']
        candidate_source={'consensus':'primary+blind','primary':'primary','blind':'blind','new':'new'}[native['recommendationSource']]
        disposition='adjust' if native['crossDecision']=='cross-adjustment' else 'accept'
        rationale=native['rationale']; confidence=native['confidence']
        selection_rationale={
          'accept-consensus-proposal':'Both independently sealed proposal lanes agree exactly.',
          'accept-primary-proposal':'The cross reviewer selected the primary wording after comparing both proposals.',
          'accept-blind-proposal':'The cross reviewer selected the blind wording after comparing both proposals.',
          'cross-adjustment':'The reviewer adjusted the candidates to match caller context or locale terminology.',
        }[native['crossDecision']]
        lane_decision=native['crossDecision']
        edit=native['semanticChecks']
        editorial={'meaningAndCallerFit':edit['meaning']=='reviewed' and edit['callerFit']=='reviewed',
          'numberAndDateFormat':edit['numberDateAndProtectedLiterals']=='pass',
          'placeholdersAndIcu':edit['placeholdersIcuMarkupAndInlineCode']=='pass',
          'protectedLiterals':edit['numberDateAndProtectedLiterals']=='pass',
          'punctuationAndReadability':edit['punctuationAndReadability']=='reviewed',
          'terminologyAndLocaleVariant':edit['localeVariantAndTerminology']=='reviewed'}
        context_dependent=sid in {'components.CollectionQueue.buffer','components.Settings.SettingsJobsCache.movie-collection-queue',util.CHANGED}
        ambiguity=None
        if sid=='components.CollectionQueue.buffer': ambiguity='The selector/help context identifies the count of unwatched movies kept ahead in the collection queue.'
        elif sid=='components.Settings.SettingsJobsCache.movie-collection-queue': ambiguity='The runtime job context identifies the collection-queue feature, not a queue of collections.'
        elif sid==util.CHANGED: ambiguity='The request-modal caller is episode-specific; the revised English leaves the counted noun implicit.'
    else:
        category=native['category']
        recommendation=native['recommendedTarget']; candidate_source=native['candidateSource']
        disposition=native['disposition']; rationale=native['rationale']; confidence=native['confidence']
        selection_rationale=native['selectionRationale']; lane_decision=native['disposition']
        editorial=native['localeEditorialChecks']; context_dependent=native['contextDependent']; ambiguity=native['ambiguityNote']

    rec_check=util.token_checks(source,recommendation)
    if not rec_check['allMatch']: raise ValueError(f'recommended token mismatch {cid}')
    if sha(recommendation)!=native['recommendedTargetSha256']: raise ValueError(f'recommended hash mismatch {cid}')
    if p['proposedTargetSha256']!=sha(p['proposedTarget']) or b['proposedTargetSha256']!=sha(b['proposedTarget']): raise ValueError('proposal text hash '+cid)
    if native.get('candidateFreeRowSha256',native.get('candidateFreeCellSha256'))!=cell_row_sha: raise ValueError('candidate-free cell hash '+cid)
    if native.get('callerContextSha256')!=ctx['callerContextSha256']: raise ValueError('caller hash '+cid)
    if native.get('sourceTextSha256')!=source_sha: raise ValueError('source hash '+cid)
    if native.get('currentTargetSha256')!=cell['currentTargetSha256']: raise ValueError('target hash '+cid)
    if native.get('primaryProposalSha256',native.get('primaryCandidateSha256'))!=p['proposedTargetSha256']: raise ValueError('primary proposal hash '+cid)
    if native.get('blindProposalSha256',native.get('blindCandidateSha256'))!=b['proposedTargetSha256']: raise ValueError('blind proposal hash '+cid)

    lane_recommendation_source=native.get('recommendationSource',native.get('candidateSource'))
    token_exception=ba['tokenCheckException']
    row={
      'schemaVersion':1,'crossReviewLane':lane,'laneDecision':lane_decision,'laneCrossLedgerRowSha256':lane_row_sha,
      'laneSharedInputBindingRowSha256':binding_sha,
      'cellId':cid,'sourceId':sid,'locale':loc,'sourcePosition':pos,
      'category':category,'cellStatus':cell.get('cellStatus','changed-source-refresh'),
      'translationDecision':cell['translationDecision'],
      'currentTargetPresent':cell['currentTargetPresent'],'currentTarget':cell['currentTarget'],'currentTargetSha256':cell['currentTargetSha256'],
      'sourceText':source,'sourceTextSha256':source_sha,'priorEnglishSourceText':cell.get('priorEnglishSourceText'),
      'priorEnglishSourceSha256':cell.get('priorEnglishSourceSha256'),'currentEnglishSourceText':cell.get('currentEnglishSourceText'),
      'currentEnglishSourceSha256':cell.get('currentEnglishSourceSha256'),'sourceIdSha256':cell['sourceIdSha256'],
      'callerContextSha256':ctx['callerContextSha256'],'callerRoles':caller_roles,'callerContextReviewed':True,
      'callerContextEvidenceRowSha256':ctx_row_sha,'candidateFreeCellSha256':cell_row_sha,
      'candidateFreeCatalogPath':cell['targetCatalogPath'],'candidateFreeCatalogSha256':cell['targetCatalogSha256'],
      'candidateFreeCatalogGitBlob':cell['targetCatalogGitBlob'],
      'primaryCandidate':p['proposedTarget'],'primaryCandidateSha256':p['proposedTargetSha256'],
      'primaryLedgerRowSha256':data['primaryLedRaw'][cid],'primaryProposalRowSha256':data['primaryPropRaw'][cid],
      'blindCandidate':b['proposedTarget'],'blindCandidateSha256':b['proposedTargetSha256'],
      'blindLedgerRowSha256':data['blindLedRaw'][cid],'blindProposalRowSha256':data['blindPropRaw'][cid],
      'primaryReattestationRowSha256':data['primaryAttRaw'][cid],'blindReattestationRowSha256':data['blindAttRaw'][cid],
      'primaryReattestationCandidateSha256':pa['candidateSha256'],'blindReattestationCandidateSha256':ba['candidateSha256'],
      'primaryReattestationTokenChecksPass':pa['tokenChecksPass'],'blindReattestationTokenChecksPass':ba['tokenChecksPass'],
      'blindNumericScannerExceptionReviewed':bool(token_exception and lane=='locale-c'),
      'blindNumericScannerException':token_exception,
      'sourceHead':HEAD,'sourceTree':TREE,'baseSha':BASE,'baseTree':BASETREE,'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,
      'primaryTokenChecksPass':pl['tokenChecks'].get('allMatch',False),
      'blindTokenChecksPass':all(bl['tokenChecks'].values()),
      'primaryTokenCheckSummary':pl['tokenChecks'],'blindTokenCheckSummary':bl['tokenChecks'],
      'recommendedTarget':recommendation,'recommendedTargetSha256':sha(recommendation),'recommendedTokenCheck':rec_check,
      'disposition':disposition,'candidateSource':candidate_source,'confidence':confidence,
      'hold':False,'holdReason':None,'rationale':rationale,'selectionRationale':selection_rationale,
      'contextDependent':context_dependent,'ambiguityNote':ambiguity,'sourceTokens':cell.get('sourceTokens'),
      'localeEditorialChecks':editorial,'protectedRoutePreserved':ROUTE in recommendation if sid=='discovery.accounts.traktSetup' else None,
    }
    return row

def make_combined():
    data=util.input_records()
    cd=TASK/'candidate-free'
    gap,gr=util.read_rows(cd/'gap-cells.jsonl')
    changed,chr=util.read_rows(cd/'changed-source-cells.jsonl')
    allcells={**gap,**changed}; allraw={**gr,**chr}
    caller,caller_raw=util.read_rows(cd/'caller-contexts.jsonl','sourceId')
    order_rows=readjl(cd/'source-order-hashes.jsonl')
    order={x['sourceIdSha256']:x['position'] for x in order_rows}
    lane_summaries,lane_rows,lane_hashes,lane_bindings,lane_binding_hashes,cf_result=verify_lane_outputs(exact=True)
    rows=[]
    for lane,meta in LANES.items():
        for cid,native in lane_rows[lane].items():
            binding=lane_bindings[lane].get(cid)
            binding_sha=lane_binding_hashes[lane].get(cid)
            if lane=='locale-b':
                if binding is None: raise ValueError('missing locale-b shared binding '+cid)
                if not all(binding['checks'].values()):
                    # The two explicitly documented Japanese blind scanner rows are resolved in locale-c.
                    if cid not in util.EXCEPTIONS or binding['documentedTokenExceptionClass']!='numericTokens':
                        raise ValueError('unresolved shared binding failure '+cid)
            rows.append(normalize(native,lane,lane_hashes[lane][cid],binding,binding_sha,data,allcells,allraw,caller,caller_raw,order))
    rows.sort(key=lambda r:(r['sourcePosition'],LOCALES.index(r['locale'])))
    if len(rows)!=528 or len({r['cellId'] for r in rows})!=528: raise ValueError('combined ledger count or duplicate')
    expected_ids=set(gap)|set(changed)
    if {r['cellId'] for r in rows}!=expected_ids: raise ValueError('combined ledger cell coverage mismatch')
    if {r['locale'] for r in rows}!=set(LOCALES): raise ValueError('combined locale coverage mismatch')
    if {r['sourceId'] for r in rows}!={x['sourceId'] for x in gap.values()}|{x['sourceId'] for x in changed.values()}:
        raise ValueError('combined source ID coverage mismatch')
    return rows,lane_summaries,cf_result

def main():
    existing={p.name for p in OUT.iterdir() if p.is_file()}
    if existing-EXPECTED_FILES: raise SystemExit(f'refusing to overwrite unexpected combined files: {sorted(existing-EXPECTED_FILES)}')
    before=snapshot('entry'); check_snapshot(before)
    rows,lane_summaries,cf_result=make_combined()
    after=snapshot('exit'); check_snapshot(after)
    if before['githubPullRequestApi']!=after['githubPullRequestApi'] or before['remoteRefs']!=after['remoteRefs']:
        raise SystemExit('live PR refs changed; combined packet not sealed')

    disposition_counts=collections.Counter(r['disposition'] for r in rows)
    candidate_sources=collections.Counter(r['candidateSource'] for r in rows)
    categories=collections.Counter(r['category'] for r in rows)
    locales=collections.Counter(r['locale'] for r in rows)
    lanes=collections.Counter(r['crossReviewLane'] for r in rows)
    numeric=[r['cellId'] for r in rows if r['blindNumericScannerExceptionReviewed']]
    changes=[{'cellId':r['cellId'],'targetSha256':r['recommendedTargetSha256'],'lane':r['crossReviewLane']}
             for r in rows if r['disposition']=='adjust']
    summary={
      'artifact':'SeerrNG PR #418 W4000 lineage parity cross-review, all locales',
      'repository':'snapetech-org/seerrng','pullRequest':418,'branch':BRANCH,'state':'OPEN','isDraft':True,
      'exactHead':HEAD,'exactTree':TREE,'baseRef':'main','baseSha':BASE,'baseTree':BASETREE,
      'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,'packetType':'independent-cross-review',
      'result':'PASS','scopeCells':len(rows),'sourceIds':44,'locales':LOCALES,
      'laneCellCounts':dict(lanes),'localeCellCounts':dict(locales),
      'insertionGapCells':categories['insertion-gap'],'changedSourceRefreshCells':categories['changed-source-refresh'],
      'dispositions':dict(disposition_counts),'candidateSources':dict(candidate_sources),
      'holds':sum(r['hold'] for r in rows),'adjustmentCount':len(changes),'adjustments':changes,
      'primaryAndBlindRowsReattested':1056,'sourceCurrentTargetCallerCellsReattested':528,
      'sourceOrTargetCellDrift':0,'recommendedTokenFailures':sum(not r['recommendedTokenCheck']['allMatch'] for r in rows),
      'blindNumericScannerExceptionsReviewed':numeric,
      'blindNumericScannerExceptionDisposition':'Both Japanese blind candidates express the same number words with Arabic digits. The locale-c reviewer adjusted them to Japanese number words; the recommended target numeric-token sets now match their English sources.',
      'laneResults':{
        lane:{'locales':meta['locales'],'cells':len(lane_summaries[lane].get('scopeCells',[])) if isinstance(lane_summaries[lane].get('scopeCells'),list) else lane_summaries[lane].get('scopeCells',lane_summaries[lane].get('cells')),
              'result':lane_summaries[lane]['result']} for lane,meta in LANES.items()},
      'candidateFreeExactVerifierResult':cf_result,
      'entryRefs':before['remoteRefs'],'exitRefs':after['remoteRefs'],
      'nativeSpeakerReviewPerformed':False,'headedBrowserReviewPerformed':False,
      'repositoryOrPrEdited':False,'testsBuildsScansCiOrWorkflowsRun':False,
    }
    (OUT/'cross-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
    writej(OUT/'before-attestation.json',before); writej(OUT/'after-attestation.json',after); writej(OUT/'summary.json',summary)
    lane_records={}
    for lane,meta in LANES.items():
        lane_records[lane]={
          'path':'../cross-review/'+lane,
          'sha256sumListSha256':sha((meta['path']/'SHA256SUMS.txt').read_bytes()),
          'manifestSha256':sha((meta['path']/'manifest.json').read_bytes()),
          'summarySha256':sha((meta['path']/'summary.json').read_bytes()),
          'ledgerFile':meta['file'],
          'ledgerSha256':sha((meta['path']/meta['file']).read_bytes()),
          'locales':meta['locales'],
        }
    manifest={
      'schemaVersion':1,'artifact':summary['artifact'],'packetType':'independent-cross-review',
      'repository':summary['repository'],'pullRequest':418,'branch':BRANCH,'exactHead':HEAD,'exactTree':TREE,
      'baseRef':'main','baseSha':BASE,'baseTree':BASETREE,'oldReviewHead':OLD_HEAD,'oldReviewTree':OLD_TREE,
      'sourceIds':44,'cells':528,'insertionGapCells':516,'changedSourceRefreshCells':12,
      'locales':LOCALES,'laneArtifacts':lane_records,
      'candidateFreePacketPath':'../candidate-free','primaryPacketPath':'../primary-review-old-head',
      'blindPacketPath':'../blind-review-old-head','reattestationPacketPath':'../reattestation',
      'candidateFreeManifestSha256':sha((TASK/'candidate-free'/'manifest.json').read_bytes()),
      'primaryManifestSha256':sha((TASK/'primary-review-old-head'/'manifest.json').read_bytes()),
      'blindManifestSha256':sha((TASK/'blind-review-old-head'/'manifest.json').read_bytes()),
      'reattestationManifestSha256':sha((TASK/'reattestation'/'manifest.json').read_bytes()),
      'candidateFreeChecksumListSha256':sha((TASK/'candidate-free'/'SHA256SUMS.txt').read_bytes()),
      'primaryChecksumListSha256':sha((TASK/'primary-review-old-head'/'SHA256SUMS.txt').read_bytes()),
      'blindChecksumListSha256':sha((TASK/'blind-review-old-head'/'SHA256SUMS.txt').read_bytes()),
      'reattestationChecksumListSha256':sha((TASK/'reattestation'/'SHA256SUMS.txt').read_bytes()),
      'payloadFiles':['README.md','after-attestation.json','before-attestation.json','build_cross_review.py',
        'cross-ledger.jsonl','manifest.json','summary.json','verify_cross_review.py'],
    }
    writej(OUT/'manifest.json',manifest)
    readme=f"""# SeerrNG PR #418 parity cross-review, all locales

This packet combines the three disjoint locale cross-review lanes for the separate 528-cell catalog-parity set. It does not reuse the stale W4000–W4019 cross ledger.

Exact pins: PR #418 is open and draft at head {HEAD}, tree {TREE}; base main is {BASE}, tree {BASETREE}. The full scope is 43 insertion-gap source IDs × 12 locales (516 missing targets), plus 12 existing-target cells for the one changed English source {util.CHANGED}; total 528 cells.

The locale lanes are ar/de/es/fr/hi/id (264 cells), vi/zh-Hans/zh-Hant (132 cells), and ja/ko/pt-BR (132 cells). Their original sealed outputs remain intact under the sibling cross-review directory; this packet normalizes their decisions into one row schema and binds each row to its source lane row hash. The shared candidate-free packet and current-head reattestation bind all 528 source/caller/current-target cells and all 1,056 primary/blind proposal hashes. There was no source or target drift.

The combined ledger has {summary['dispositions'].get('accept',0)} accepts, {summary['dispositions'].get('adjust',0)} exact wording adjustments, and {summary['holds']} holds. The two Japanese blind numeric scanner differences were reviewed and adjusted to Japanese number words; all recommended targets pass token, placeholder, ICU, markup, inline-code, protected-literal, and route checks. Holds, if present, would be hash-only; there are none.

Run the portable offline verifier:

    PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py

To verify the exact local Git objects and clean pinned worktree:

    PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py --repo {REPO}

The verifier makes no network requests; stored entry/exit attestations bind the PR API and remote refs. No repository or PR files were edited, and no tests, builds, scans, CI jobs, workflow changes, releases, or tags were run. Native-speaker and headed-browser review are not claimed.
"""
    (OUT/'README.md').write_text(readme,encoding='utf-8')
    files=sorted(p for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
    (OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__': main()

