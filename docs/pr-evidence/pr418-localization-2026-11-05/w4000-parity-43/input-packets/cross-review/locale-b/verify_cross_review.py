#!/usr/bin/env python3
"""Offline verifier for the SeerrNG PR #418 locale-b cross-review packet."""
import argparse, collections, hashlib, importlib.util, json, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode = True

OUT = Path(__file__).resolve().parent
DEFAULT_PACKET = OUT.parents[1]
EXPECTED = {
 'head':'f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4',
 'tree':'f7ea727b0383397ec8d6220667b4abe151d43b46',
 'base':'2647e15762de0c2285cd9d8ebc6d27ffafce6358',
 'oldHead':'77d30ae742aad7245e6e419237fca6a544531e1f',
 'oldTree':'2c6fe4a0c1c33aa56b01f06a70702f68598509a7',
}
LOCALES=('vi','zh-Hans','zh-Hant')
ALL_LOCALES=('ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-Hans','zh-Hant')

def fail(message): raise SystemExit('FAIL: '+message)
def sha(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()
def readjl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def verify_sums(folder):
    sums_path=folder/'SHA256SUMS.txt'
    if not sums_path.exists(): fail(f'missing checksum file: {sums_path}')
    declared={}
    for line in sums_path.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        digest,name=line.split('  ',1); declared[name]=digest
    actual={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
    if declared!=actual: fail(f'checksum inventory mismatch: {folder}')
def row_hash_map(path):
    result={}; hashes={}
    for raw in path.read_bytes().splitlines():
        if not raw: continue
        row=json.loads(raw); result[row['cellId']]=row; hashes[row['cellId']]=hashlib.sha256(raw).hexdigest()
    return result,hashes

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--packet-root',type=Path,default=DEFAULT_PACKET,help='candidate-free/primary/blind/reattestation packet root')
    args=parser.parse_args()
    packet=args.packet_root.resolve()
    out=OUT
    for directory in (out,packet/'candidate-free',packet/'reattestation',packet/'primary-review-old-head',packet/'blind-review-old-head'):
        verify_sums(directory)

    entry=json.loads((out/'entry-attestation.json').read_text(encoding='utf-8'))
    exit_att=json.loads((out/'exit-attestation.json').read_text(encoding='utf-8'))
    for label,att in (('entry',entry),('exit',exit_att)):
        if att.get('headSha')!=EXPECTED['head'] or att.get('headTree')!=EXPECTED['tree'] or att.get('baseSha')!=EXPECTED['base']:
            fail(f'{label} PR pin mismatch')
        if att.get('branchApiSha')!=EXPECTED['head'] or att.get('pullRefSha')!=EXPECTED['head']:
            fail(f'{label} branch/pull ref mismatch')
        if att.get('state')!='open' or not att.get('draft') or att.get('merged'):
            fail(f'{label} PR state mismatch')
    if entry.get('baseTree')!=exit_att.get('baseTree') or entry.get('branch')!=exit_att.get('branch'):
        fail('entry/exit base tree or branch changed')

    spec=importlib.util.spec_from_file_location('candidate_free_builder',packet/'candidate-free'/'build_candidate_free.py')
    mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    cf=packet/'candidate-free'; primary=packet/'primary-review-old-head'; blind=packet/'blind-review-old-head'; reatt=packet/'reattestation'
    cf_rows={}; cf_line_hashes={}
    for fname in ('gap-cells.jsonl','changed-source-cells.jsonl'):
        rows,hashes=row_hash_map(cf/fname)
        for k,v in rows.items():
            if k in cf_rows: fail(f'duplicate current candidate-free cell {k}')
            cf_rows[k]=v; cf_line_hashes[k]=hashes[k]
    if len(cf_rows)!=528: fail('current candidate-free cell count is not 528')
    pprop={x['cellId']:x for x in readjl(primary/'proposals.jsonl')}
    bprop={x['cellId']:x for x in readjl(blind/'proposals.jsonl')}
    pledger={x['cellId']:x for x in readjl(primary/'review-ledger.jsonl')}
    bledger={x['cellId']:x for x in readjl(blind/'ledger.jsonl')}
    pratt={x['cellId']:x for x in readjl(reatt/'primary-reattestation.jsonl')}
    bratt={x['cellId']:x for x in readjl(reatt/'blind-reattestation.jsonl')}
    shared=readjl(out/'shared-input-bindings-528.jsonl')
    if len(shared)!=528 or len({x['cellId'] for x in shared})!=528: fail('shared input bindings are incomplete or duplicated')
    if len(pprop)!=528 or len(bprop)!=528 or len(pledger)!=528 or len(bledger)!=528 or len(pratt)!=528 or len(bratt)!=528:
        fail('old proposal or reattestation row inventory is not 528')
    expected_ids=set(cf_rows)
    if {x['cellId'] for x in shared}!=expected_ids: fail('shared binding cell set differs from current candidate-free input')
    for binding in shared:
        cell=binding['cellId']; row=cf_rows[cell]; p=pprop[cell]; b=bprop[cell]; pl=pledger[cell]; bl=bledger[cell]; pr=pratt[cell]; br=bratt[cell]
        srcsha=row.get('sourceTextSha256') or row.get('currentEnglishSourceSha256')
        if binding['candidateFreeRowSha256']!=cf_line_hashes[cell]: fail(f'candidate-free row hash mismatch {cell}')
        if binding['sourceTextSha256']!=srcsha or binding['sourceIdSha256']!=row['sourceIdSha256'] or binding['callerContextSha256']!=row['callerContextSha256']:
            fail(f'current source/caller hash mismatch {cell}')
        if binding['currentTargetSha256']!=row['currentTargetSha256']: fail(f'current target hash mismatch {cell}')
        for candidate,proposal,reatt_row in (('primary',p,pr),('blind',b,br)):
            digest=proposal.get('proposedTargetSha256')
            if digest!=sha(proposal['proposedTarget']) or digest!=reatt_row.get('candidateSha256'):
                fail(f'{candidate} candidate hash mismatch {cell}')
            if proposal.get('sourceTextSha256')!=srcsha or reatt_row.get('sourceTextSha256')!=srcsha:
                fail(f'{candidate} source hash mismatch {cell}')
            if reatt_row.get('currentCallerContextSha256')!=row['callerContextSha256']:
                fail(f'{candidate} caller hash mismatch {cell}')
            if reatt_row.get('currentTargetSha256')!=row['currentTargetSha256']:
                fail(f'{candidate} current target hash mismatch {cell}')
            if reatt_row.get('currentHead')!=EXPECTED['head'] or reatt_row.get('currentTree')!=EXPECTED['tree']:
                fail(f'{candidate} current-head reattestation mismatch {cell}')
            if reatt_row.get('oldReviewHead')!=EXPECTED['oldHead'] or reatt_row.get('oldReviewTree')!=EXPECTED['oldTree']:
                fail(f'{candidate} old-review pin mismatch {cell}')
        if pl.get('sourceTextSha256')!=srcsha or bl.get('sourceTextSha256')!=srcsha:
            fail(f'old ledger source mismatch {cell}')
        if pl.get('currentTargetSha256')!=row['currentTargetSha256'] or bl.get('currentTargetSha256')!=row['currentTargetSha256']:
            fail(f'old ledger target mismatch {cell}')
        if pl.get('sourceContextSha256')!=row['callerContextSha256'] or bl.get('callerContextSha256')!=row['callerContextSha256']:
            fail(f'old ledger caller mismatch {cell}')
        if not all(binding['checks'].values()): fail(f'shared hash-binding claim failed {cell}')
        if binding['primaryProposalSha256']!=p['proposedTargetSha256'] or binding['blindProposalSha256']!=b['proposedTargetSha256']:
            fail(f'shared proposal hash index mismatch {cell}')

    ledger=readjl(out/'ledger.jsonl')
    if len(ledger)!=132 or len({x['cellId'] for x in ledger})!=132: fail('cross ledger must contain 132 unique cells')
    if any(x['locale'] not in LOCALES for x in ledger): fail('cross ledger contains unassigned locale')
    if {x['cellId'] for x in ledger}!={x['cellId'] for x in shared if x['locale'] in LOCALES}:
        fail('cross ledger scope differs from assigned locale bindings')
    for row in ledger:
        cell=row['cellId']; current=cf_rows[cell]; p=pprop[cell]; b=bprop[cell]
        src=current.get('sourceText',current.get('currentEnglishSourceText'))
        if row['sourceId']!=current['sourceId'] or row['sourceText']!=src or row['sourceTextSha256']!=(current.get('sourceTextSha256') or current.get('currentEnglishSourceSha256')):
            fail(f'ledger source value/hash mismatch {cell}')
        if row['currentTarget']!=current.get('currentTarget') or row['currentTargetSha256']!=current.get('currentTargetSha256'):
            fail(f'ledger current target mismatch {cell}')
        if row['callerContextSha256']!=current['callerContextSha256'] or not row['callerContextReviewed']:
            fail(f'ledger caller binding missing {cell}')
        if row['primaryProposal']!=p['proposedTarget'] or row['primaryProposalSha256']!=p['proposedTargetSha256']:
            fail(f'ledger primary proposal mismatch {cell}')
        if row['blindProposal']!=b['proposedTarget'] or row['blindProposalSha256']!=b['proposedTargetSha256']:
            fail(f'ledger blind proposal mismatch {cell}')
        if sha(row['recommendedTarget'])!=row['recommendedTargetSha256']: fail(f'recommended text hash mismatch {cell}')
        if row['crossDecision']=='accept-consensus-proposal' and not (row['primaryProposal']==row['blindProposal']==row['recommendedTarget']):
            fail(f'consensus decision mismatch {cell}')
        if row['crossDecision']=='accept-primary-proposal' and row['recommendedTarget']!=row['primaryProposal']:
            fail(f'primary acceptance mismatch {cell}')
        if row['crossDecision']=='accept-blind-proposal' and row['recommendedTarget']!=row['blindProposal']:
            fail(f'blind acceptance mismatch {cell}')
        if row['crossDecision']=='cross-adjustment' and row['recommendationSource']!='new':
            fail(f'cross-adjustment source mismatch {cell}')
        checks=mod.checks(src,row['recommendedTarget'])
        if not checks['allMatch'] or checks!=row['tokenChecks'] or row['tokenStatus']!='pass':
            fail(f'recommended token check mismatch {cell}')
        if row['currentHead']!=EXPECTED['head'] or row['currentTree']!=EXPECTED['tree'] or row['baseSha']!=EXPECTED['base']:
            fail(f'ledger PR pin mismatch {cell}')
        if not row['rationale'] or row['confidence'] not in ('high','moderate','low','unknown'):
            fail(f'ledger rationale/confidence missing {cell}')
    counts=collections.Counter(x['crossDecision'] for x in ledger)
    summary=json.loads((out/'summary.json').read_text(encoding='utf-8'))
    if summary['cells']!=132 or summary['sourceIds']!=44 or summary['decisionCounts']!=dict(sorted(counts.items())):
        fail('summary counts disagree with ledger')
    if summary['fullInputBindingCells']!=528 or summary['fullInputBindingFailures']!=0:
        fail('summary full-packet binding count mismatch')
    result=subprocess.run([sys.executable,str(cf/'verify_candidate_free.py'),'--packet-only'],capture_output=True,text=True)
    if result.returncode!=0: fail('candidate-free packet-only verifier failed: '+(result.stdout+result.stderr).strip())
    print(f"PASS: locale-b 132-cell semantic ledger, token checks, 528-cell hash binding, input/output checksums, and candidate-free packet-only verifier; decisions={dict(sorted(counts.items()))}")

if __name__=='__main__': main()
