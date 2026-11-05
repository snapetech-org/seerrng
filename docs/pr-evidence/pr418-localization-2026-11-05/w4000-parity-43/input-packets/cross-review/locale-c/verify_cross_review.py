#!/usr/bin/env python3
"""Offline verifier for the SeerrNG PR #418 parity locale-c cross-review."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import subprocess
import sys
from pathlib import Path
sys.dont_write_bytecode = True
import build_cross_review as b

OUT = Path(__file__).resolve().parent
ROOT = b.ROOT
HEAD, TREE, BASE, BASETREE = b.HEAD, b.TREE, b.BASE, b.BASETREE
OLD_HEAD, OLD_TREE = b.OLD_HEAD, b.OLD_TREE
LOCALES = list(b.LOCALES)
EXCEPTIONS = set(b.EXCEPTIONS)

def need(ok, message):
    if not ok:
        raise SystemExit('FAIL: ' + message)

def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]

def verify_packet_sums(folder):
    folder = Path(folder).resolve()
    allow_work = folder == (ROOT/'blind-review-old-head').resolve()
    return b.verify_sums(folder, allow_work=allow_work)

def verify_output():
    sums = verify_packet_sums(OUT)
    manifest = b.readj(OUT / 'manifest.json')
    summary = b.readj(OUT / 'summary.json')
    before = b.readj(OUT / 'before-attestation.json')
    after = b.readj(OUT / 'after-attestation.json')
    ledger = read_jsonl(OUT / 'cross-ledger.jsonl')

    need(manifest['packetType'] == 'independent-cross-review', 'packet type')
    need(manifest['exactHead'] == summary['exactHead'] == HEAD, 'head pin')
    need(manifest['exactTree'] == summary['exactTree'] == TREE, 'tree pin')
    need(manifest['baseSha'] == summary['baseSha'] == BASE, 'base pin')
    need(manifest['baseTree'] == summary['baseTree'] == BASETREE, 'base tree pin')
    need(manifest['oldReviewHead'] == summary['oldReviewHead'] == OLD_HEAD, 'old primary/blind head')
    need(manifest['oldReviewTree'] == summary['oldReviewTree'] == OLD_TREE, 'old primary/blind tree')
    need(manifest['assignedLocales'] == summary['assignedLocales'] == LOCALES, 'assigned locale set')
    need(set(manifest['payloadFiles']) == set(sums), 'manifest/checksum inventory')
    need(summary['result'] == 'PASS' and summary['scopeCells'] == manifest['cells'] == 132, 'summary outcome/count')
    need(summary['sourceIds'] == 44 and summary['insertionGapCells'] == 129 and summary['changedSourceRefreshCells'] == 3, 'scope categories')
    need(summary['holds'] == 0 and summary['recommendedTargetTokenFailures'] == 0, 'hold/recommended-token summary')
    need(set(summary['blindNumericScannerExceptionsReviewed']) == EXCEPTIONS, 'Japanese numeric exceptions were not individually reviewed')
    need(summary['nativeSpeakerReviewPerformed'] is False and summary['headedBrowserReviewPerformed'] is False, 'review-limit claims')

    b.check_snapshot(before)
    b.check_snapshot(after)
    need(before['label'] == 'entry' and after['label'] == 'exit', 'entry/exit labels')
    need(before['githubPullRequestApi'] == after['githubPullRequestApi'], 'PR API changed during cross review')
    need(before['remoteRefs'] == after['remoteRefs'], 'remote refs changed during cross review')

    data = b.input_records()
    for folder, expected in (
        (ROOT/'candidate-free', manifest['candidateFreeChecksumListSha256']),
        (ROOT/'primary-review-old-head', manifest['primaryChecksumListSha256']),
        (ROOT/'blind-review-old-head', manifest['blindChecksumListSha256']),
        (ROOT/'reattestation', manifest['reattestationChecksumListSha256']),
    ):
        verify_packet_sums(folder)
        need(b.sha((folder/'SHA256SUMS.txt').read_bytes()) == expected, 'input checksum list changed: ' + str(folder))
    need(b.sha((ROOT/'candidate-free'/'manifest.json').read_bytes()) == manifest['candidateFreeManifestSha256'], 'candidate-free manifest hash')
    need(b.sha((ROOT/'primary-review-old-head'/'manifest.json').read_bytes()) == manifest['primaryManifestSha256'], 'primary manifest hash')
    need(b.sha((ROOT/'blind-review-old-head'/'manifest.json').read_bytes()) == manifest['blindManifestSha256'], 'blind manifest hash')
    need(b.sha((ROOT/'reattestation'/'manifest.json').read_bytes()) == manifest['reattestationManifestSha256'], 'reattestation manifest hash')

    need(len(ledger) == 132 and len({row['cellId'] for row in ledger}) == 132, 'ledger uniqueness/count')
    need({row['locale'] for row in ledger} == set(LOCALES), 'ledger locale coverage')
    need({row['sourceId'] for row in ledger} == {r['sourceId'] for r, _, _ in data['selected'].values()}, 'ledger source coverage')
    selected = data['selected']
    by_cell = {row['cellId']: row for row in ledger}
    need(set(by_cell) == set(selected), 'exact selected cell coverage')
    disposition_counts = collections.Counter()
    candidate_source_counts = collections.Counter()
    category_counts = collections.Counter()
    locale_counts = collections.Counter()
    exception_ids = set()

    for cid, row in by_cell.items():
        cell, cell_raw_sha, category = selected[cid]
        sid, loc = cell['sourceId'], cell['locale']
        context = data['caller'][sid]
        primary = data['primaryProp'][cid]
        primary_led = data['primaryLed'][cid]
        blind = data['blindProp'][cid]
        blind_led = data['blindLed'][cid]
        primary_att = data['primaryAtt'][cid]
        blind_att = data['blindAtt'][cid]

        need(row['sourceHead'] == HEAD and row['sourceTree'] == TREE, 'row head/tree ' + cid)
        need(row['baseSha'] == BASE and row['baseTree'] == BASETREE, 'row base/tree ' + cid)
        need(row['oldReviewHead'] == OLD_HEAD and row['oldReviewTree'] == OLD_TREE, 'row old review pin ' + cid)
        need(row['sourceId'] == sid and row['locale'] == loc and row['category'] == category, 'row identity/category ' + cid)
        need(row['candidateFreeCellSha256'] == cell_raw_sha, 'candidate-free cell hash ' + cid)
        need(row['sourceIdSha256'] == cell['sourceIdSha256'], 'source ID hash ' + cid)
        need(row['callerContextSha256'] == context['callerContextSha256'], 'caller hash ' + cid)
        need(row['callerContextEvidenceRowSha256'] == data['callerRaw'][sid], 'caller evidence row hash ' + cid)
        need(row['callerContextReviewed'] is True, 'caller not reviewed ' + cid)
        need(row['sourceTextSha256'] == (cell.get('sourceTextSha256') or cell.get('currentEnglishSourceSha256')), 'source text hash ' + cid)
        need(row['sourceText'] == (cell.get('sourceText') or cell.get('currentEnglishSourceText')), 'source text readback ' + cid)
        need(row['currentTargetPresent'] == cell['currentTargetPresent'] and row['currentTarget'] == cell['currentTarget'], 'current target state/text ' + cid)
        need(row['currentTargetSha256'] == cell['currentTargetSha256'], 'current target hash ' + cid)
        need(row['primaryCandidate'] == primary['proposedTarget'] and row['primaryCandidateSha256'] == primary['proposedTargetSha256'], 'primary candidate ' + cid)
        need(row['blindCandidate'] == blind['proposedTarget'] and row['blindCandidateSha256'] == blind['proposedTargetSha256'], 'blind candidate ' + cid)
        need(row['primaryLedgerRowSha256'] == data['primaryLedRaw'][cid] and row['primaryProposalRowSha256'] == data['primaryPropRaw'][cid], 'primary input row hashes ' + cid)
        need(row['blindLedgerRowSha256'] == data['blindLedRaw'][cid] and row['blindProposalRowSha256'] == data['blindPropRaw'][cid], 'blind input row hashes ' + cid)
        need(row['primaryReattestationRowSha256'] == data['primaryAttRaw'][cid] and row['blindReattestationRowSha256'] == data['blindAttRaw'][cid], 'reattestation row hashes ' + cid)
        need(row['primaryReattestationCandidateSha256'] == primary_att['candidateSha256'] == primary['proposedTargetSha256'], 'primary hash-only proof ' + cid)
        need(row['blindReattestationCandidateSha256'] == blind_att['candidateSha256'] == blind['proposedTargetSha256'], 'blind hash-only proof ' + cid)
        need(row['primaryTokenCheckSummary'] == primary_led['tokenChecks'], 'primary token record ' + cid)
        need(row['blindTokenCheckSummary'] == blind_led['tokenChecks'], 'blind token record ' + cid)

        recommended, disposition, source, rationale = b.choose(cid, loc, primary['proposedTarget'], blind['proposedTarget'])
        need(row['recommendedTarget'] == recommended, 'selected wording ' + cid)
        need(row['recommendedTargetSha256'] == b.sha(recommended), 'recommended hash ' + cid)
        need(row['disposition'] == disposition and row['candidateSource'] == source, 'decision provenance ' + cid)
        need(row['rationale'] and row['confidence'] in ('high','moderate','low','unknown'), 'rationale/confidence ' + cid)
        need(row['hold'] is False and row['holdReason'] is None, 'unexpected hold ' + cid)
        check = b.token_checks(row['sourceText'], row['recommendedTarget'])
        need(check['allMatch'] and row['recommendedTokenCheck'] == check, 'recommended token checks ' + cid)
        need(all(row['localeEditorialChecks'].values()), 'locale editorial review incomplete ' + cid)
        if sid == 'components.CollectionQueue.existing4k':
            need('4K' in row['recommendedTarget'], '4K literal ' + cid)
        if sid == 'discovery.accounts.traktSetup':
            need('/api/v1/integrations/discovery/trakt/callback' in row['recommendedTarget'], 'protected route ' + cid)
        if sid == 'components.Settings.analyzeOnPlaybackTip':
            need(all(x in row['recommendedTarget'] for x in ('TV','30','Plex','Plex Pass')), 'settings help source details ' + cid)

        if cid in EXCEPTIONS:
            exception_ids.add(cid)
            need(row['blindNumericScannerExceptionReviewed'] is True, 'Japanese exception not reviewed ' + cid)
            need(row['blindNumericScannerException'] == blind_att['tokenCheckException'], 'Japanese exception evidence ' + cid)
            need(row['blindTokenChecksPass'] is True, 'original blind token-check claim changed ' + cid)
            need(row['blindReattestationTokenChecksPass'] is False, 'expected recomputed blind scanner flag absent ' + cid)
            need(row['candidateSource'] == 'new' and row['disposition'] == 'adjust', 'Japanese exception target should be adjusted ' + cid)
        else:
            need(row['blindNumericScannerExceptionReviewed'] is False, 'unexpected numeric exception ' + cid)
            need(row['blindNumericScannerException'] is None, 'unexpected numeric exception details ' + cid)
            need(row['blindTokenChecksPass'] is True and row['blindReattestationTokenChecksPass'] is True, 'unexpected blind token failure ' + cid)
        need(row['primaryTokenChecksPass'] is True and row['primaryReattestationTokenChecksPass'] is True, 'primary token check/re-attestation ' + cid)

        disposition_counts[disposition] += 1
        candidate_source_counts[source] += 1
        category_counts[category] += 1
        locale_counts[loc] += 1

    need(exception_ids == EXCEPTIONS, 'Japanese scanner exceptions exact set')
    need(dict(disposition_counts) == summary['dispositions'], 'decision totals')
    need(dict(candidate_source_counts) == summary['candidateSources'], 'candidate source totals')
    need(dict(category_counts) == {'insertion-gap':129,'changed-source-refresh':3}, 'cell category totals')
    need(dict(locale_counts) == {loc:44 for loc in LOCALES}, 'per-locale cell totals')
    need(summary['contextDependentCellCount'] == sum(row['contextDependent'] for row in ledger), 'context-dependent count')
    return len(sums), data

def verify_repo(repo):
    repo = Path(repo).resolve()
    for rev, expected in ((HEAD, TREE), (BASE, BASETREE)):
        tree = subprocess.check_output(['git','-C',str(repo),'rev-parse',f'{rev}^{{tree}}'],text=True).strip()
        need(tree == expected, f'Git tree mismatch for {rev}')
        subprocess.check_call(['git','-C',str(repo),'cat-file','-e',rev])
    status = subprocess.check_output(['git','-C',str(repo),'status','--porcelain'],text=True)
    head = subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
    tree = subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD^{tree}'],text=True).strip()
    need(head == HEAD and tree == TREE and not status, 'exact worktree head/tree/status')
    result = subprocess.check_output([sys.executable,str(ROOT/'candidate-free'/'verify_candidate_free.py'),'--repo',str(repo)],text=True,stderr=subprocess.STDOUT)
    return result.strip()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo',type=Path,help='optional exact local Git worktree for object/readback verification')
    args=parser.parse_args()
    n,data=verify_output()
    command = '--repo ' + str(args.repo) if args.repo else '--packet-only'
    candidate_result = subprocess.check_output([sys.executable,str(ROOT/'candidate-free'/'verify_candidate_free.py'),command.split()[0],*([str(args.repo)] if args.repo else [])],text=True,stderr=subprocess.STDOUT).strip()
    if args.repo:
        exact_result=verify_repo(args.repo)
    else:
        exact_result='not requested'
    print(f'PASS: locale-c cross packet checksums; 132 assigned cells (129 gaps + 3 refreshes); all source/caller/current-target pins and 264 proposal hash links; two Japanese numeric exceptions semantically resolved; recommended tokens pass; entry/exit PR refs match; candidate-free {candidate_result}; exact Git {exact_result}.')

if __name__=='__main__':
    main()

