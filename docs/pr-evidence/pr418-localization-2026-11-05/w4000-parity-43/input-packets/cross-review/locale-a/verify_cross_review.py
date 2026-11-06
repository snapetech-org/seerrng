#!/usr/bin/env python3
"""Portable verifier for the SeerrNG PR #418 locale-a cross-review packet."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[1]
CANDIDATE = ROOT / 'candidate-free'
REATTEST = ROOT / 'reattestation'
PRIMARY = ROOT / 'primary-review-old-head'
BLIND = ROOT / 'blind-review-old-head'
HEAD = 'f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4'
TREE = 'f7ea727b0383397ec8d6220667b4abe151d43b46'
BASE = '2647e15762de0c2285cd9d8ebc6d27ffafce6358'
BASETREE = 'b6f4acb9debdc1b0a838b50d5ad88aaa467e429b'
OLD_HEAD = '77d30ae742aad7245e6e419237fca6a544531e1f'
OLD_TREE = '2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
BRANCH = 'codex/seerrng-localization-overhaul-20261028'
ROUTE = '/api/v1/integrations/discovery/trakt/callback'
CHANGED = 'components.RequestModal.watchAheadActiveForRequest'
LOCALES = ['ar','de','es','fr','hi','id']
ALL_LOCALES = ['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']
CONTEXT_IDS = {
    'components.CollectionQueue.buffer',
    'components.Settings.SettingsJobsCache.movie-collection-queue',
    CHANGED,
}
PLACEHOLDER = re.compile(r'\{([A-Za-z][A-Za-z0-9_]*)\}')
MARKUP = re.compile(r'</?[A-Za-z][^>]*>')
NUMBERS = re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
PROTECTED = re.compile(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])')
EXTRA_PROTECTED = ('SeerrNG','Seerr','BookshelfNG','ReadMeABook')
ICU_TYPES = ('plural','select','selectordinal','number','date','time')

class VerificationError(Exception):
    pass

def need(condition, message):
    if not condition:
        raise VerificationError(message)

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha_text(value: str) -> str:
    return sha(value.encode('utf-8'))

def readj(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))

def jsonl(path: Path):
    rows={}; raw_hashes={}
    for raw in path.read_bytes().splitlines():
        if not raw.strip():
            continue
        row=json.loads(raw)
        key=row.get('cellId',row.get('sourceId'))
        need(key not in rows, f'duplicate row {key} in {path}')
        rows[key]=row; raw_hashes[key]=sha(raw)
    return rows,raw_hashes

def parse_sums(path: Path):
    sums={}
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        parts=line.split('  ',1)
        need(len(parts)==2, f'malformed checksum line in {path}')
        digest,name=parts
        need(name not in sums, f'duplicate checksum path {name}')
        q=Path(name)
        need(not q.is_absolute() and '..' not in q.parts, f'unsafe checksum path {name}')
        sums[name]=digest
    return sums

def verify_input_packet(directory: Path, expected_sums_sha: str | None = None, exact_inventory=False):
    sums_path=directory/'SHA256SUMS.txt'
    need(sums_path.is_file(),f'missing input checksum list: {directory}')
    if expected_sums_sha:
        need(sha(sums_path.read_bytes())==expected_sums_sha, f'input checksum-list pin changed: {directory.name}')
    manifest=readj(directory/'manifest.json')
    sums=parse_sums(sums_path)
    manifest_files=set(manifest.get('files',[]))
    # Primary and blind manifests intentionally omit their own manifest from `files`; candidate-free/reattestation include it.
    expected=set(manifest_files)
    if 'manifest.json' not in expected:
        expected.add('manifest.json')
    need(expected==set(sums),f'{directory.name} manifest/checksum inventory mismatch')
    for name,digest in sums.items():
        path=directory/name
        need(path.is_file(),f'missing sealed input file {directory.name}/{name}')
        need(sha(path.read_bytes())==digest,f'input checksum mismatch: {directory.name}/{name}')
    if exact_inventory:
        actual={p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
        need(actual==set(sums),f'unmanifested file in sealed packet: {directory.name}')
    return manifest

def icu(value):
    found=[]
    for start,ch in enumerate(value):
        if ch!='{':
            continue
        depth=0; end=None
        for i in range(start,len(value)):
            if value[i]=='{': depth+=1
            elif value[i]=='}':
                depth-=1
                if depth==0:
                    end=i+1; break
        if end is None:
            continue
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
        'placeholders':PLACEHOLDER.findall(value),'icuExpressions':icu(value),
        'markupTags':MARKUP.findall(value),'numericTokens':NUMBERS.findall(value),
        'protectedLiterals':protected,'inlineCode':re.findall(chr(96)+r'([^'+chr(96)+r']+)'+chr(96),value),
    }

def check_tokens(source,target):
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

def run_candidate_free_verifier(repo: Path | None):
    env=os.environ.copy(); env['PYTHONDONTWRITEBYTECODE']='1'
    cmd=[sys.executable,str(CANDIDATE/'verify_candidate_free.py')]
    if repo:
        cmd += ['--repo',str(repo)]
    result=subprocess.run(cmd,cwd=CANDIDATE,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    need(result.returncode==0,'candidate-free verifier failed: '+result.stdout.strip())
    return result.stdout.strip()

def verify_git_objects(repo: Path):
    def git(*args):
        return subprocess.check_output(['git','-C',str(repo),*args],text=True,stderr=subprocess.STDOUT).strip()
    need(git('cat-file','-e',HEAD+'^{commit}')=='','missing exact PR commit')
    need(git('cat-file','-e',BASE+'^{commit}')=='','missing exact base commit')
    need(git('rev-parse',HEAD+'^{tree}')==TREE,'exact PR head tree mismatch')
    need(git('rev-parse',BASE+'^{tree}')==BASETREE,'exact base tree mismatch')

def verify(repo: Path | None = None):
    out_manifest=readj(PACKET/'manifest.json')
    summary=readj(PACKET/'summary.json')
    before=readj(PACKET/'before-attestation.json')
    after=readj(PACKET/'after-attestation.json')
    need(out_manifest['packetType']=='independent-cross-review' and out_manifest['pullRequest']==418,'cross packet identity')
    need(out_manifest['exactHead']==HEAD and out_manifest['exactTree']==TREE and out_manifest['baseSha']==BASE and out_manifest['baseTree']==BASETREE,'cross manifest pins')
    need(out_manifest['oldReviewHead']==OLD_HEAD and out_manifest['oldReviewTree']==OLD_TREE,'old review pins')
    need(summary['exactHead']==HEAD and summary['exactTree']==TREE and summary['baseSha']==BASE and summary['baseTree']==BASETREE,'summary pins')
    out_sums=parse_sums(PACKET/'SHA256SUMS.txt')
    actual={p.relative_to(PACKET).as_posix() for p in PACKET.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
    need(set(out_sums)==actual,'cross packet checksum inventory mismatch')
    need(set(out_manifest['payloadFiles'])==actual-{'manifest.json'},'cross manifest payload inventory mismatch')
    for name,digest in out_sums.items():
        need(sha((PACKET/name).read_bytes())==digest,'cross output checksum mismatch: '+name)

    cf_manifest=verify_input_packet(CANDIDATE,out_manifest['candidateFreeChecksumListSha256'],exact_inventory=True)
    ra_manifest=verify_input_packet(REATTEST,out_manifest['reattestationChecksumListSha256'],exact_inventory=True)
    p_manifest=verify_input_packet(PRIMARY,out_manifest['primaryChecksumListSha256'])
    b_manifest=verify_input_packet(BLIND,out_manifest['blindChecksumListSha256'])
    for manifest,digest,name in [
        (cf_manifest,out_manifest['candidateFreeManifestSha256'],'candidate-free'),
        (ra_manifest,out_manifest['reattestationManifestSha256'],'reattestation'),
        (p_manifest,out_manifest['primaryManifestSha256'],'primary'),
        (b_manifest,out_manifest['blindManifestSha256'],'blind'),
    ]:
        need(sha(({'candidate-free':CANDIDATE,'reattestation':REATTEST,'primary':PRIMARY,'blind':BLIND}[name]/'manifest.json').read_bytes())==digest,f'{name} manifest hash pin')

    need(cf_manifest['exactHead']==HEAD and cf_manifest['exactTree']==TREE and cf_manifest['baseSha']==BASE and cf_manifest['baseTree']==BASETREE,'candidate-free pins')
    need(ra_manifest['currentHead']==HEAD and ra_manifest['currentTree']==TREE and ra_manifest['baseSha']==BASE,'reattestation current pins')
    need(ra_manifest['oldReviewHead']==OLD_HEAD and ra_manifest['oldReviewTree']==OLD_TREE,'reattestation old pins')
    reatt_summary=readj(REATTEST/'summary.json')
    numeric_exceptions=set(reatt_summary.get('numericTokenExceptionCells',[]))
    expected_numeric_exceptions={'components.CollectionQueue.description::ja','components.Settings.analyzeOnPlaybackTip::ja'}
    need(numeric_exceptions==expected_numeric_exceptions,'reattestation numeric exception inventory')
    need(p_manifest['sourceHead']==OLD_HEAD and p_manifest['sourceTree']==OLD_TREE and p_manifest['baseSha']==BASE,'primary source pins')
    need(b_manifest['exactHead']==OLD_HEAD and b_manifest['exactTree']==OLD_TREE and b_manifest['baseSha']==BASE,'blind source pins')

    # Run the candidate-free packet's own verifier with bytecode writing disabled so its inventory stays sealed.
    candidate_free_result=run_candidate_free_verifier(repo)

    gaps,gap_raw=jsonl(CANDIDATE/'gap-cells.jsonl')
    changed,changed_raw=jsonl(CANDIDATE/'changed-source-cells.jsonl')
    contexts,context_raw=jsonl(CANDIDATE/'caller-contexts.jsonl')
    preatt,preatt_raw=jsonl(REATTEST/'primary-reattestation.jsonl')
    batt,batt_raw=jsonl(REATTEST/'blind-reattestation.jsonl')
    primary,praw=jsonl(PRIMARY/'review-ledger.jsonl')
    blind,braw=jsonl(BLIND/'ledger.jsonl')
    pproposals,ppraw=jsonl(PRIMARY/'proposals.jsonl')
    bproposals,bpraw=jsonl(BLIND/'proposals.jsonl')
    source_order_rows=[json.loads(x) for x in (CANDIDATE/'source-order-hashes.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    source_order_positions={r['sourceIdSha256']:r['position'] for r in source_order_rows}
    need(len(gaps)==516 and len(changed)==12 and len(contexts)==44,'candidate-free input scope')
    need(len(preatt)==len(batt)==len(primary)==len(blind)==len(pproposals)==len(bproposals)==528,'lane/reattestation coverage')
    need(len({r['sourceId'] for r in gaps.values()})==43,'gap source count')
    need(set(preatt)==set(batt)==set(primary)==set(blind)==set(pproposals)==set(bproposals),'lane cell coverage differs')

    # Reconcile all 528 old proposals to current candidate-free source, target, and caller pins before adjudicating this lane.
    for cellid, pr in preatt.items():
        assert_row=batt[cellid]; p=primary[cellid]; b=blind[cellid]
        c=gaps.get(cellid) or changed.get(cellid)
        sid=c['sourceId']; ctx=contexts[sid]
        source_sha=c.get('sourceTextSha256',c.get('currentEnglishSourceSha256'))
        need(pr['candidateTextIncluded'] is False and assert_row['candidateTextIncluded'] is False,'candidate text in hash-only reattestation '+cellid)
        need(pr['currentHead']==HEAD and pr['currentTree']==TREE and assert_row['currentHead']==HEAD and assert_row['currentTree']==TREE,'reattest current head/tree '+cellid)
        need(pr['oldReviewHead']==OLD_HEAD and pr['oldReviewTree']==OLD_TREE and assert_row['oldReviewHead']==OLD_HEAD and assert_row['oldReviewTree']==OLD_TREE,'reattest old head/tree '+cellid)
        need(pr['sourceTextSha256']==source_sha==assert_row['sourceTextSha256'],'reattest source hash '+cellid)
        need(pr['currentCallerContextSha256']==ctx['callerContextSha256']==assert_row['currentCallerContextSha256'],'reattest caller hash '+cellid)
        need(pr['currentTargetSha256']==c['currentTargetSha256']==assert_row['currentTargetSha256'],'reattest target hash '+cellid)
        need(pr['sourceTextUnchanged'] is True and pr['callerContextUnchanged'] is True and pr['currentTargetStateUnchanged'] is True,'reattest drift flag '+cellid)
        need(assert_row['sourceTextUnchanged'] is True and assert_row['callerContextUnchanged'] is True and assert_row['currentTargetStateUnchanged'] is True,'blind reattest drift flag '+cellid)
        if cellid in numeric_exceptions:
            need(pr['tokenChecksPass'] is True and assert_row['tokenChecksPass'] is False,'recorded numeric token exception status '+cellid)
            need(assert_row['tokenCheckException']['class']=='numericTokens','numeric exception class '+cellid)
        else:
            need(pr['tokenChecksPass'] is True and assert_row['tokenChecksPass'] is True,'reattest token claim '+cellid)
        need(p['inputCellSha256']==pr['oldCandidateFreeCellSha256'],'primary old-cell hash '+cellid)
        need(b['candidateFreeCellSha256']==assert_row['oldCandidateFreeCellSha256'],'blind old-cell hash '+cellid)
        need(p['sourceHead']==OLD_HEAD and p['sourceTree']==OLD_TREE and b['exactHead']==OLD_HEAD and b['exactTree']==OLD_TREE,'old lane pins '+cellid)
        need(p['sourceTextSha256']==source_sha==b['sourceTextSha256'],'old lane source hashes '+cellid)
        need(p['sourceContextSha256']==ctx['callerContextSha256']==b['callerContextSha256'],'old lane caller hashes '+cellid)
        need(p['currentTargetSha256']==c['currentTargetSha256']==b['currentTargetSha256'],'old lane target hashes '+cellid)
        need(p['proposedTargetSha256']==sha_text(p['proposedTarget'])==pr['candidateSha256'],'primary proposal text hash '+cellid)
        need(b['proposedTargetSha256']==sha_text(b['proposedTarget'])==assert_row['candidateSha256'],'blind proposal text hash '+cellid)
        need(pproposals[cellid]['proposedTargetSha256']==p['proposedTargetSha256'],'primary proposal file hash '+cellid)
        need(bproposals[cellid]['proposedTargetSha256']==b['proposedTargetSha256'],'blind proposal file hash '+cellid)
        source=c['sourceText'] if cellid in gaps else c['currentEnglishSourceText']
        pcheck=check_tokens(source,p['proposedTarget']); bcheck=check_tokens(source,b['proposedTarget'])
        need(pcheck==p['tokenChecks'] and pcheck['allMatch'],'primary token recomputation '+cellid)
        if cellid in numeric_exceptions:
            need(all(b['tokenChecks'].values()) and bcheck['checks']['placeholders'] and bcheck['checks']['icuExpressions'] and bcheck['checks']['protectedLiterals'] and bcheck['checks']['markupTags'] and bcheck['checks']['inlineCode'],'blind exception nonnumeric token checks '+cellid)
        else:
            need(bcheck['checks']==b['tokenChecks'] and all(bcheck['checks'].values()),'blind token recomputation '+cellid)
        need(p['recordSha256']==sha(json.dumps({k:v for k,v in p.items() if k!='recordSha256'},ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')+b'\n'),'primary ledger row seal '+cellid)

    ledger,ledger_raw=jsonl(PACKET/'cross-ledger.jsonl')
    need(len(ledger)==264,'cross ledger row count')
    expected_cells={f'{sid}::{loc}' for sid in {r['sourceId'] for r in gaps.values()} for loc in LOCALES}
    expected_cells |= {f'{CHANGED}::{loc}' for loc in LOCALES}
    need(set(ledger)==expected_cells,'cross ledger scope/duplicates')
    dispositions=Counter(); candidate_sources=Counter(); categories=Counter(); locale_counts=Counter(); gap_locale=Counter(); refresh_locale=Counter()
    context_ids=set(); adjustment_ids=[]
    for cellid,row in ledger.items():
        sid=row['sourceId']; loc=row['locale']; cat=row['category']; c=gaps.get(cellid) or changed.get(cellid); ctx=contexts[sid]
        p=primary[cellid]; b=blind[cellid]; pr=preatt[cellid]; br=batt[cellid]
        expected_cf_hash=(gap_raw if cat=='insertion-gap' else changed_raw)[cellid]
        need(row['candidateFreeCellSha256']==expected_cf_hash,'candidate-free cell row pin '+cellid)
        need(row['callerContextEvidenceRowSha256']==context_raw[sid],'caller evidence row pin '+cellid)
        need(row['callerContextSha256']==ctx['callerContextSha256'],'caller hash '+cellid)
        expected_position=c.get('sourcePosition') if c.get('sourcePosition') is not None else source_order_positions[c['sourceIdSha256']]
        need(row['sourceIdSha256']==c['sourceIdSha256'] and row['sourcePosition']==expected_position,'source ID/position '+cellid)
        source=c['sourceText'] if cat=='insertion-gap' else c['currentEnglishSourceText']
        source_sha=c['sourceTextSha256'] if cat=='insertion-gap' else c['currentEnglishSourceSha256']
        need(row['sourceText']==source and row['sourceTextSha256']==source_sha,'source text/hash '+cellid)
        need(row['sourceHead']==HEAD and row['sourceTree']==TREE and row['baseSha']==BASE and row['baseTree']==BASETREE,'cross current pins '+cellid)
        need(row['oldReviewHead']==OLD_HEAD and row['oldReviewTree']==OLD_TREE,'cross old pins '+cellid)
        need(row['primaryCandidate']==p['proposedTarget'] and row['primaryCandidateSha256']==pr['candidateSha256'],'primary candidate binding '+cellid)
        need(row['blindCandidate']==b['proposedTarget'] and row['blindCandidateSha256']==br['candidateSha256'],'blind candidate binding '+cellid)
        need(row['primaryLedgerRowSha256']==praw[cellid] and row['blindLedgerRowSha256']==braw[cellid],'old ledger row hashes '+cellid)
        need(row['primaryProposalRowSha256']==ppraw[cellid] and row['blindProposalRowSha256']==bpraw[cellid],'old proposal row hashes '+cellid)
        need(row['primaryReattestationRowSha256']==preatt_raw[cellid] and row['blindReattestationRowSha256']==batt_raw[cellid],'hash-only reattestation row hashes '+cellid)
        need(row['primaryReattestationCandidateSha256']==pr['candidateSha256'] and row['blindReattestationCandidateSha256']==br['candidateSha256'],'reattest candidate hashes '+cellid)
        need(row['primaryTokenChecksPass'] is True and row['blindTokenChecksPass'] is True,'old candidate token claims '+cellid)
        need(row['currentTargetPresent']==c['currentTargetPresent'] and row['currentTarget']==c['currentTarget'] and row['currentTargetSha256']==c['currentTargetSha256'],'current target pin '+cellid)
        if cat=='insertion-gap':
            need(c['cellStatus']=='missing-target' and c['translationDecision']=='translation-required','candidate-free gap state '+cellid)
            need(row['cellStatus']=='missing-target' and row['translationDecision']=='translation-required','cross gap state '+cellid)
            need(row['currentTargetPresent'] is False and row['currentTarget'] is None and row['currentTargetSha256'] is None,'gap target remains absent '+cellid)
            gap_locale[loc]+=1
        else:
            need(cat=='changed-source-refresh' and sid==CHANGED,'refresh category '+cellid)
            need(c['translationDecision']=='translation-refresh-review-required' and c['currentTargetPresent'] is True,'candidate-free refresh state '+cellid)
            need(row['cellStatus']=='changed-source-refresh' and row['translationDecision']=='translation-refresh-review-required','cross refresh state '+cellid)
            need(row['currentTargetPresent'] is True and row['currentTarget'] is not None and row['currentTargetSha256'] is not None,'refresh target present '+cellid)
            need(row['priorEnglishSourceSha256']==c['priorEnglishSourceSha256'] and row['currentEnglishSourceSha256']==source_sha,'refresh source lineage '+cellid)
            refresh_locale[loc]+=1
        need(row['candidateSource'] in {'primary','blind','primary+blind','new'},'candidate source '+cellid)
        if row['candidateSource']=='primary+blind':
            need(p['proposedTarget']==b['proposedTarget']==row['recommendedTarget'] and row['disposition']=='accept','consensus choice '+cellid)
        elif row['candidateSource']=='primary':
            need(row['recommendedTarget']==p['proposedTarget'] and p['proposedTarget']!=b['proposedTarget'] and row['disposition']=='accept','primary choice '+cellid)
        elif row['candidateSource']=='blind':
            need(row['recommendedTarget']==b['proposedTarget'] and p['proposedTarget']!=b['proposedTarget'] and row['disposition']=='accept','blind choice '+cellid)
        else:
            need(row['recommendedTarget'] not in {p['proposedTarget'],b['proposedTarget']} and row['disposition']=='adjust','new adjustment '+cellid)
            adjustment_ids.append(cellid)
        need(row['recommendedTargetSha256']==sha_text(row['recommendedTarget']),'selected target hash '+cellid)
        check=check_tokens(source,row['recommendedTarget'])
        need(row['recommendedTokenCheck']==check and check['allMatch'],'selected target token check '+cellid)
        need(row['sourceTokens']==tokens(source),'source token inventory '+cellid)
        need(row['confidence']=='moderate' and row['hold'] is False and row['holdReason'] is None,'disposition/confidence/hold '+cellid)
        need(bool(row['rationale']) and bool(row['selectionRationale']),'review rationale '+cellid)
        need(row['callerContextReviewed'] is True and all(row['localeEditorialChecks'].values()),'review checks '+cellid)
        need(row['contextDependent']==(sid in CONTEXT_IDS),'context dependency flag '+cellid)
        if sid in CONTEXT_IDS:
            context_ids.add(sid); need(bool(row['ambiguityNote']),'missing context note '+cellid)
        else:
            need(row['ambiguityNote'] is None,'unexpected ambiguity note '+cellid)
        if sid=='components.CollectionQueue.existing4k':
            need('4K' in row['recommendedTarget'],'4K literal '+cellid)
        if sid=='components.Settings.analyzeOnPlaybackTip':
            need(all(term in row['recommendedTarget'] for term in ('TV','30','Plex','Plex Pass')),'Plex settings literals '+cellid)
        if sid=='discovery.accounts.traktSetup':
            need(ROUTE in row['recommendedTarget'] and row['protectedRoutePreserved'] is True,'Trakt callback route '+cellid)
        if sid==CHANGED:
            need('{count}' in row['recommendedTarget'],'changed-source placeholder '+cellid)
        if sid in {'components.RequestEpisodeQueueControl.watchAheadOff','components.RequestModal.watchAheadOff'} and loc=='ar':
            evidence=row.get('terminologyEvidence',{})
            need(evidence.get('sourceId')=='components.UserProfile.UserSettings.UserEpisodeQueueSettings.off' and evidence.get('text')=='معطّل','Arabic Off glossary pin '+cellid)
            need(evidence.get('catalogSha256')==row['candidateFreeCatalogSha256'],'Arabic glossary catalog pin '+cellid)
        if sid=='discovery.accounts.traktSetup' and loc=='hi':
            evidence=row.get('terminologyEvidence',{})
            need(evidence.get('settingsText')=='सेटिंग' and evidence.get('generalText')=='जनरल','Hindi settings label glossary '+cellid)
            need(evidence.get('catalogSha256')==row['candidateFreeCatalogSha256'],'Hindi glossary catalog pin '+cellid)
        dispositions[row['disposition']]+=1; candidate_sources[row['candidateSource']]+=1; categories[cat]+=1; locale_counts[loc]+=1

    need(categories==Counter({'insertion-gap':258,'changed-source-refresh':6}),f'category totals {categories}')
    need(dispositions==Counter({'accept':260,'adjust':4}),f'disposition totals {dispositions}')
    need(sum(row['hold'] for row in ledger.values())==0,'unexpected holds')
    need(locale_counts==Counter({loc:44 for loc in LOCALES}),f'locale totals {locale_counts}')
    need(gap_locale==Counter({loc:43 for loc in LOCALES}),f'locale gap totals {gap_locale}')
    need(refresh_locale==Counter({loc:1 for loc in LOCALES}),f'locale refresh totals {refresh_locale}')
    need(context_ids==CONTEXT_IDS and sum(row['contextDependent'] for row in ledger.values())==18,'context-dependent scope')
    need(set(adjustment_ids)=={
        'components.RequestEpisodeQueueControl.watchAheadOff::ar',
        'components.RequestEpisodeQueueControl.watchAheadOverrideHelp::id',
        'components.RequestModal.watchAheadOff::ar',
        'discovery.accounts.traktSetup::hi',
    },'custom adjustment inventory')
    need(summary['scopeCells']==264 and summary['insertionGapCells']==258 and summary['changedSourceRefreshCells']==6,'summary counts')
    need(summary['dispositions']==dict(dispositions) and summary['candidateSources']==dict(candidate_sources),'summary disposition totals')
    need(summary['holds']==0 and summary['contextDependentCellCount']==18,'summary holds/context')
    need(summary['contextDependentCells']==[r['cellId'] for r in jsonl(PACKET/'cross-ledger.jsonl')[0].values() if r['contextDependent']],'summary context IDs')
    need(summary['candidateFreeVerifierResult']=='PASS','candidate-free verifier summary')

    expected_api={
        'baseRefName':'main','baseRefOid':BASE,'headRefName':BRANCH,'headRefOid':HEAD,
        'isDraft':True,'state':'OPEN','url':'https://github.com/snapetech-org/seerrng/pull/418'
    }
    expected_refs={'refs/heads/main':BASE,f'refs/heads/{BRANCH}':HEAD,'refs/pull/418/head':HEAD}
    for snap,label in ((before,'before'),(after,'after')):
        need(snap['label']==label and snap['githubPullRequestApi']==expected_api,'live PR API attestation '+label)
        need(snap['remoteRefs']==expected_refs,'live remote refs '+label)
        need(snap['localGitObjects']=={'head':HEAD,'headTree':TREE,'base':BASE,'baseTree':BASETREE},'local Git object attestation '+label)
    need(before['remoteRefs']==after['remoteRefs'] and before['githubPullRequestApi']==after['githubPullRequestApi'],'entry/exit refs changed')
    return candidate_free_result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo',type=Path,help='optional local Git checkout for exact-object and candidate-free checks')
    args=parser.parse_args()
    if args.repo:
        verify_git_objects(args.repo.resolve())
    result=verify(args.repo.resolve() if args.repo else None)
    print('PASS: locale-a cross packet checksums, 264 assigned cells (258 gaps + 6 refreshes), all 528 primary/blind reattestations, source/caller/current-target pins, selected wording and tokens, and entry/exit PR refs' + (f'; {result}' if args.repo else ''))

if __name__=='__main__':
    try:
        main()
    except VerificationError as exc:
        raise SystemExit('FAIL: '+str(exc))
