#!/usr/bin/env python3
"""Offline verifier for the sealed, all-locale SeerrNG parity cross-review."""
from __future__ import annotations
import argparse, collections, hashlib, json, os, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode = True

TASK=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT=Path(__file__).resolve().parent
REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume')
sys.path.insert(0,str(TASK/'cross-review'/'locale-c'))
import build_cross_review as util
HEAD,TREE,BASE,BASETREE=util.HEAD,util.TREE,util.BASE,util.BASETREE
BRANCH,CHANGED=util.BRANCH,util.CHANGED
LOCALES=('ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-Hans','zh-Hant')
LANES={
 'locale-a':{'path':TASK/'cross-review'/'locale-a','file':'cross-ledger.jsonl','locales':('ar','de','es','fr','hi','id')},
 'locale-b':{'path':TASK/'cross-review'/'locale-b','file':'ledger.jsonl','locales':('vi','zh-Hans','zh-Hant')},
 'locale-c':{'path':TASK/'cross-review'/'locale-c','file':'cross-ledger.jsonl','locales':('ja','ko','pt-BR')},
}
INPUT_DIRS={
 'candidate-free':TASK/'candidate-free','primary-review-old-head':TASK/'primary-review-old-head',
 'blind-review-old-head':TASK/'blind-review-old-head','reattestation':TASK/'reattestation',
}
EXPECTED_FILES={'README.md','SHA256SUMS.txt','after-attestation.json','before-attestation.json','build_cross_review.py','cross-ledger.jsonl','manifest.json','summary.json','verify_cross_review.py'}

def fail(msg): raise SystemExit('FAIL: '+msg)
def sha(data):
    if isinstance(data,str): data=data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()
def readj(path): return json.loads(Path(path).read_text(encoding='utf-8'))
def readjl(path): return [json.loads(x) for x in Path(path).read_text(encoding='utf-8').splitlines() if x.strip()]
def check_snapshot(att):
    try: util.check_snapshot(att)
    except Exception as exc: fail(f"{att.get('label')} attestation: {exc}")

def load_current_cells():
    cf=INPUT_DIRS['candidate-free']
    gap,gh=util.read_rows(cf/'gap-cells.jsonl')
    changed,ch=util.read_rows(cf/'changed-source-cells.jsonl')
    allcells={**gap,**changed}; raw={**gh,**ch}
    if len(gap)!=516 or len(changed)!=12 or len(allcells)!=528: fail('candidate-free gap/refresh cell counts')
    if {x['sourceId'] for x in gap.values()} & {x['sourceId'] for x in changed.values()}: fail('gap and refresh source IDs overlap')
    return allcells,raw

def verify_lane_packets(exact,repo):
    rows_by_lane={}; hashes_by_lane={}; bindings={}; binding_hashes={}
    for lane,meta in LANES.items():
        folder=meta['path']
        try: util.verify_sums(folder)
        except Exception as exc: fail(f'{lane} checksum/inventory: {exc}')
        rows,hashes=util.read_rows(folder/meta['file'])
        expected_count={'locale-a':264,'locale-b':132,'locale-c':132}[lane]
        if len(rows)!=expected_count: fail(f'{lane} row count {len(rows)} != {expected_count}')
        if any(row.get('locale') not in meta['locales'] for row in rows.values()): fail(f'{lane} locale assignment')
        summary=readj(folder/'summary.json')
        if summary.get('result')!='PASS': fail(f'{lane} summary is not PASS')
        if summary.get('exactHead',summary.get('head'))!=HEAD or summary.get('exactTree',summary.get('tree'))!=TREE: fail(f'{lane} head/tree pin')
        if summary.get('baseSha',summary.get('base'))!=BASE: fail(f'{lane} base pin')
        cmd=[sys.executable,str(folder/'verify_cross_review.py')]
        if exact and lane in ('locale-a','locale-c'): cmd += ['--repo',str(repo)]
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
        try: out=subprocess.check_output(cmd,text=True,stderr=subprocess.STDOUT,env=env).strip()
        except subprocess.CalledProcessError as exc: fail(f'{lane} verifier failed: {exc.output.strip()}')
        rows_by_lane[lane]=rows; hashes_by_lane[lane]=hashes
        if lane=='locale-b':
            bind,bh=util.read_rows(folder/'shared-input-bindings-528.jsonl')
            if len(bind)!=528: fail('locale-b shared binding count')
            bindings[lane]=bind; binding_hashes[lane]=bh
        else:
            bindings[lane]={}; binding_hashes[lane]={}
    cf_cmd=[sys.executable,str(INPUT_DIRS['candidate-free']/'verify_candidate_free.py')]
    cf_cmd += ['--repo',str(repo)] if exact else ['--packet-only']
    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
    try: cfout=subprocess.check_output(cf_cmd,text=True,stderr=subprocess.STDOUT).strip()
    except subprocess.CalledProcessError as exc: fail(f'candidate-free verifier failed: {exc.output.strip()}')
    return rows_by_lane,hashes_by_lane,bindings,binding_hashes,cfout

def verify_inputs_and_rows(exact,repo):
    for name,folder in INPUT_DIRS.items():
        try: util.verify_sums(folder,allow_work=(name=='blind-review-old-head'))
        except Exception as exc: fail(f'{name} packet checksum/inventory: {exc}')
    d=util.input_records()
    cells,cell_hashes=load_current_cells()
    caller,caller_hashes=util.read_rows(INPUT_DIRS['candidate-free']/'caller-contexts.jsonl','sourceId')
    primary=d['primaryProp']; primary_raw=d['primaryPropRaw']; primary_led=d['primaryLed']; primary_led_raw=d['primaryLedRaw']
    blind=d['blindProp']; blind_raw=d['blindPropRaw']; blind_led=d['blindLed']; blind_led_raw=d['blindLedRaw']
    patt=d['primaryAtt']; patt_raw=d['primaryAttRaw']; batt=d['blindAtt']; batt_raw=d['blindAttRaw']
    lane_rows,lane_hashes,bindings,binding_hashes,cfout=verify_lane_packets(exact,repo)
    ledger=readjl(OUT/'cross-ledger.jsonl')
    if len(ledger)!=528 or len({r.get('cellId') for r in ledger})!=528: fail('aggregate ledger must contain 528 unique cells')
    if {r['cellId'] for r in ledger}!=set(cells): fail('aggregate ledger cell coverage')
    expected_lane={loc:lane for lane,meta in LANES.items() for loc in meta['locales']}
    if any(r.get('locale') not in expected_lane for r in ledger): fail('aggregate row has unknown locale')
    counts=collections.Counter(); locale_counts=collections.Counter(); ids=collections.defaultdict(set); src_order=[]
    for row in ledger:
        cid=row['cellId']; cell=cells[cid]; sid=cell['sourceId']; loc=cell['locale']; lane=expected_lane[loc]
        if row.get('crossReviewLane')!=lane: fail('lane assignment '+cid)
        native=lane_rows[lane].get(cid)
        if native is None or row.get('laneCrossLedgerRowSha256')!=lane_hashes[lane][cid]: fail('lane row hash '+cid)
        if lane=='locale-b':
            binding=bindings[lane].get(cid)
            if binding is None or row.get('laneSharedInputBindingRowSha256')!=binding_hashes[lane][cid]: fail('shared binding row hash '+cid)
        elif row.get('laneSharedInputBindingRowSha256') is not None: fail('unexpected shared binding hash '+cid)
        if row.get('sourceId')!=sid or row.get('locale')!=loc or row.get('sourceIdSha256')!=cell['sourceIdSha256']: fail('source identity '+cid)
        source=cell.get('sourceText') or cell.get('currentEnglishSourceText')
        source_hash=cell.get('sourceTextSha256') or cell.get('currentEnglishSourceSha256')
        if row.get('sourceText')!=source or row.get('sourceTextSha256')!=source_hash or sha(source)!=source_hash: fail('source text/hash '+cid)
        category='changed-source-refresh' if sid==CHANGED else 'insertion-gap'
        if row.get('category')!=category or row.get('cellStatus')!=cell.get('cellStatus','changed-source-refresh'): fail('category/current status normalization '+cid)
        if row.get('candidateFreeCellSha256')!=cell_hashes[cid] or row.get('candidateFreeCatalogPath')!=cell['targetCatalogPath'] or row.get('candidateFreeCatalogSha256')!=cell['targetCatalogSha256'] or row.get('candidateFreeCatalogGitBlob')!=cell['targetCatalogGitBlob']: fail('candidate-free cell/catalog pin '+cid)
        if row.get('callerContextSha256')!=cell['callerContextSha256'] or row.get('callerContextEvidenceRowSha256')!=caller_hashes[sid] or not row.get('callerContextReviewed'): fail('caller binding '+cid)
        if row.get('currentTarget')!=cell['currentTarget'] or row.get('currentTargetPresent')!=cell['currentTargetPresent'] or row.get('currentTargetSha256')!=cell['currentTargetSha256']: fail('current target state '+cid)
        if category=='insertion-gap':
            if cell['cellStatus']!='missing-target' or cell['currentTargetPresent'] or cell['currentTarget'] is not None or cell['translationDecision']!='translation-required': fail('insertion state '+cid)
        else:
            if not cell['currentTargetPresent'] or not cell['currentTarget'] or cell['translationDecision']!='translation-refresh-review-required': fail('refresh state '+cid)
        if row.get('primaryCandidate')!=primary[cid]['proposedTarget'] or row.get('primaryCandidateSha256')!=primary[cid]['proposedTargetSha256'] or row.get('primaryCandidateSha256')!=sha(row['primaryCandidate']): fail('primary candidate hash/text '+cid)
        if row.get('blindCandidate')!=blind[cid]['proposedTarget'] or row.get('blindCandidateSha256')!=blind[cid]['proposedTargetSha256'] or row.get('blindCandidateSha256')!=sha(row['blindCandidate']): fail('blind candidate hash/text '+cid)
        expected_hashes={
          'primaryLedgerRowSha256':primary_led_raw[cid],'primaryProposalRowSha256':primary_raw[cid],
          'blindLedgerRowSha256':blind_led_raw[cid],'blindProposalRowSha256':blind_raw[cid],
          'primaryReattestationRowSha256':d['primaryAttRaw'][cid],'blindReattestationRowSha256':d['blindAttRaw'][cid],
        }
        for key,value in expected_hashes.items():
            if row.get(key)!=value: fail(key+' '+cid)
        if row.get('primaryReattestationCandidateSha256')!=patt[cid]['candidateSha256'] or row.get('blindReattestationCandidateSha256')!=batt[cid]['candidateSha256']: fail('reattest candidate hash '+cid)
        if row.get('sourceHead')!=HEAD or row.get('sourceTree')!=TREE or row.get('baseSha')!=BASE or row.get('baseTree')!=BASETREE: fail('exact Git pins '+cid)
        if row.get('currentEnglishSourceText')!=cell.get('currentEnglishSourceText') or row.get('currentEnglishSourceSha256')!=cell.get('currentEnglishSourceSha256'): fail('current English refresh binding '+cid)
        target=row.get('recommendedTarget')
        if not isinstance(target,str) or not target or row.get('recommendedTargetSha256')!=sha(target): fail('recommendation hash/text '+cid)
        check=util.token_checks(source,target)
        if row.get('recommendedTokenCheck')!=check or not check['allMatch']: fail('recommended token/placeholder check '+cid)
        if row.get('hold') is not False or row.get('disposition') not in ('accept','adjust'): fail('disposition/hold '+cid)
        if row.get('confidence') not in ('high','moderate','low'): fail('confidence label '+cid)
        if row.get('primaryTokenChecksPass') is not True: fail('primary token status '+cid)
        if cid in util.EXCEPTIONS:
            if lane!='locale-c' or row.get('blindNumericScannerExceptionReviewed') is not True or not row.get('blindNumericScannerException'): fail('Japanese exception review '+cid)
            if check['checks']['numericTokens'] is not True: fail('Japanese recommended numeric token match '+cid)
        else:
            if row.get('blindNumericScannerExceptionReviewed') or row.get('blindTokenChecksPass') is not True: fail('unexpected blind token exception '+cid)
        if sid=='components.CollectionQueue.existing4k' and '4K' not in target: fail('protected 4K literal '+cid)
        if sid=='discovery.accounts.traktSetup' and util.ROUTE not in target: fail('protected Trakt route '+cid)
        if sid==CHANGED and '{count}' not in target: fail('changed source count placeholder '+cid)
        if row.get('protectedRoutePreserved') is not (util.ROUTE in target if sid=='discovery.accounts.traktSetup' else None): fail('route attestation '+cid)
        counts[(category,row['disposition'])]+=1; locale_counts[loc]+=1; ids[sid].add(loc)
        src_order.append((row.get('sourcePosition'),cid))
    if collections.Counter(r['category'] for r in ledger)!={'insertion-gap':516,'changed-source-refresh':12}: fail('aggregate category totals')
    if collections.Counter(r['disposition'] for r in ledger)!=collections.Counter({'accept':513,'adjust':15}): fail('aggregate disposition totals')
    if any(locale_counts[x]!=44 for x in LOCALES): fail('locale scope not 44 cells each')
    if len(ids)!=44 or any(set(v)!=set(LOCALES) for v in ids.values()): fail('source ID × locale coverage')
    if len({x[0] for x in src_order})!=44 or src_order!=sorted(src_order): fail('source-position ordering')
    if {r['cellId'] for r in ledger if r.get('blindNumericScannerExceptionReviewed')}!=util.EXCEPTIONS: fail('reviewed Japanese exception set')
    return ledger,counts,locale_counts,cfout

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',type=Path,help='optional exact local Git worktree to verify object/readback pins')
    args=ap.parse_args()
    repo=args.repo.resolve() if args.repo else REPO
    if args.repo and repo!=REPO.resolve(): fail(f'expected pinned worktree {REPO}, got {repo}')
    try: util.verify_sums(OUT)
    except Exception as exc: fail(f'aggregate packet checksum/inventory: {exc}')
    if {p.name for p in OUT.iterdir() if p.is_file()}!=EXPECTED_FILES: fail('aggregate packet file inventory')
    manifest=readj(OUT/'manifest.json'); summary=readj(OUT/'summary.json')
    if manifest.get('exactHead')!=HEAD or manifest.get('exactTree')!=TREE or manifest.get('baseSha')!=BASE or manifest.get('baseTree')!=BASETREE: fail('manifest exact pins')
    if manifest.get('cells')!=528 or manifest.get('sourceIds')!=44 or manifest.get('insertionGapCells')!=516 or manifest.get('changedSourceRefreshCells')!=12: fail('manifest scope counts')
    if manifest.get('payloadFiles')!=sorted(EXPECTED_FILES-{'SHA256SUMS.txt'}): fail('manifest payload inventory')
    # The manifest pins each source packet and lane checksum list to these exact input bytes.
    for name,folder in INPUT_DIRS.items():
        stem={'primary-review-old-head':'primary','blind-review-old-head':'blind','candidate-free':'candidateFree','reattestation':'reattestation'}[name]
        if manifest.get(stem+'ManifestSha256')!=sha((folder/'manifest.json').read_bytes()): fail(stem+' manifest pin')
        if manifest.get(stem+'ChecksumListSha256')!=sha((folder/'SHA256SUMS.txt').read_bytes()): fail(stem+' checksum-list pin')
    for lane,meta in LANES.items():
        rec=manifest.get('laneArtifacts',{}).get(lane,{})
        if rec.get('sha256sumListSha256')!=sha((meta['path']/'SHA256SUMS.txt').read_bytes()) or rec.get('ledgerSha256')!=sha((meta['path']/meta['file']).read_bytes()): fail(lane+' manifest input pin')
    before=readj(OUT/'before-attestation.json'); after=readj(OUT/'after-attestation.json')
    check_snapshot(before); check_snapshot(after)
    if before.get('remoteRefs')!=after.get('remoteRefs') or before.get('githubPullRequestApi')!=after.get('githubPullRequestApi'): fail('entry/exit PR refs changed')
    ledger,counts,locale_counts,cfout=verify_inputs_and_rows(bool(args.repo),repo)
    expected={'scopeCells':528,'sourceIds':44,'insertionGapCells':516,'changedSourceRefreshCells':12,'holds':0,'adjustmentCount':15,'recommendedTokenFailures':0,'sourceOrTargetCellDrift':0}
    for key,value in expected.items():
        if summary.get(key)!=value: fail(f'summary {key} mismatch: {summary.get(key)!r}')
    if summary.get('dispositions')!={'accept':513,'adjust':15} or summary.get('result')!='PASS': fail('summary dispositions/result')
    if args.repo:
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
        for key,command in {
          'head':['rev-parse','HEAD'],'tree':['rev-parse','HEAD^{tree}'],'status':['status','--porcelain'],
          'base-tree':['rev-parse',f'{BASE}^{{tree}}']}.items():
            try: got=subprocess.check_output(['git','-C',str(repo),*command],text=True,stderr=subprocess.STDOUT,env=env).strip()
            except subprocess.CalledProcessError as exc: fail(f'local Git {key}: {exc.output.strip()}')
            want={'head':HEAD,'tree':TREE,'status':'','base-tree':BASETREE}[key]
            if got!=want: fail(f'local Git {key} mismatch: {got}')
    mode='exact-worktree' if args.repo else 'portable-offline'
    print(f"PASS: {mode} aggregate SeerrNG PR #418 parity cross-review; 528 cells (516 insertion gaps + 12 changed-source refreshes), 44 source IDs × 12 locales; 513 accepts, 15 adjustments, 0 holds; all source/caller/current-target, proposal, reattestation and lane-row hashes match; recommended token checks pass; candidate-free verifier: {cfout}")

if __name__=='__main__': main()
