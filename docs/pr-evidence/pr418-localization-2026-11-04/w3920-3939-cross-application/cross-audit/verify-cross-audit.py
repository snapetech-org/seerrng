#!/usr/bin/env python3
from __future__ import annotations
import argparse, collections, hashlib, json, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parent
TASK=ROOT.parent
HEAD='c989e745a64743a45282a7a2704713945d8406d8'
TREE='b25ffd26701a43957924a992f4368f5b7a6a8f29'
BRANCH='codex/seerrng-localization-overhaul-20261028'
CF=pathlib.Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-next-eligible-3920-3939-20261104-primary/candidate-free-input')
PRIMARY=pathlib.Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-next-eligible-3920-3939-20261104-primary/primary-review')
BLIND=pathlib.Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3920-3939-blind-fresh-20261104/blind-output')

def fail(s): raise SystemExit('FAIL: '+s)
def sha(b): return hashlib.sha256(b).hexdigest()
def readj(p): return json.loads(p.read_text(encoding='utf-8'))
def rows(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source-worktree',required=True); args=ap.parse_args()
    cfman=readj(CF/'manifest.json'); pman=readj(PRIMARY/'manifest.json'); bman=readj(BLIND/'manifest.json')
    pre=readj(TASK/'CROSS-AUDIT-MANIFEST.json'); man=readj(ROOT/'manifest.json')
    if (cfman.get('head'),cfman.get('tree'),cfman.get('window'))!=(HEAD,TREE,'W3920-W3939'): fail('candidate-free pin')
    if (pman.get('head'),pman.get('tree'),pman.get('window'))!=(HEAD,TREE,'W3920-W3939'): fail('primary pin')
    if (bman.get('head'),bman.get('tree'),bman.get('window'))!=(HEAD,TREE,'W3920-W3939'): fail('blind pin')
    if (man.get('head'),man.get('tree'),man.get('window'))!=(HEAD,TREE,'W3920-W3939'): fail('cross output pin')
    if pre.get('reviewMode')!='non-blind cross-audit' or pre.get('blindLedgerCreatedByThisReviewer') is not True: fail('cross-audit mode manifest')
    # Re-run the three supplied verifiers before reconciling their artifacts.
    repo=str(pathlib.Path(args.source_worktree).resolve())
    subprocess.run([sys.executable,str(CF/'verify-candidate-free.py'),'--source-worktree',repo],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable,str(PRIMARY/'verify-primary-review.py'),'--source-worktree',repo],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable,str(BLIND/'verify-blind-ledger.py'),'--source-worktree',repo],check=True,stdout=subprocess.DEVNULL)
    # Verify the cross-audit output inventory and checksums.
    sums={}
    for line in (ROOT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        digest,name=line.split('  ',1)
        if name in sums: fail('duplicate output checksum '+name)
        p=(ROOT/name).resolve()
        if not p.is_relative_to(ROOT.resolve()) or not p.is_file() or sha(p.read_bytes())!=digest: fail('cross output checksum '+name)
        sums[name]=digest
    actual={p.name for p in ROOT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
    if set(sums)!=actual: fail('cross output checksum coverage')
    expected={f['path']:f for f in man['files']}
    if set(expected)!=(actual-{'manifest.json'}): fail('cross manifest file list')
    for name,f in expected.items():
        p=ROOT/name
        if p.stat().st_size!=f['bytes'] or sha(p.read_bytes())!=f['sha256']: fail('cross manifest digest '+name)
    # Validate complete cell reconciliation against source, current target, primary, and blind ledgers.
    cells=rows(CF/'current-target-cells.jsonl'); primary=rows(PRIMARY/'primary-ledger.jsonl'); blind=rows(BLIND/'blind-ledger.jsonl')
    proposals=rows(PRIMARY/'proposals.jsonl'); primary_holds=rows(PRIMARY/'holds.jsonl'); blind_holds=rows(BLIND/'hash-only-holds.jsonl')
    context_rows=rows(CF/'caller-contexts.jsonl')
    if (len(cells),len(primary),len(blind),len(context_rows))!=(240,240,240,20): fail('input ledger/context counts')
    cellmap={(r['position'],r['locale']):r for r in cells}
    pmap={(r['position'],r['locale']):r for r in primary}
    bmap={(r['position'],r['locale']):r for r in blind}
    propmap={(r['position'],r['locale']):r for r in proposals}
    holdmap={(r['position'],r['locale']):r for r in primary_holds}
    bholdmap={(r['position'],r['locale']):r for r in blind_holds}
    contexts={r['sourceId']:r for r in context_rows}
    cross=rows(ROOT/'cross-ledger.jsonl')
    if len(cross)!=240: fail('cross ledger count')
    seen=set(); crosscounts=collections.Counter()
    selected=rows(ROOT/'selected-proposals.jsonl')
    selectedmap={(r['position'],r['locale']):r for r in selected}
    if len(selected)!=17 or len(selectedmap)!=17: fail('selected proposal count/uniqueness')
    for r in cross:
        key=(r.get('position'),r.get('locale'))
        if key in seen or key not in cellmap: fail('duplicate/unknown cross cell')
        seen.add(key); c=cellmap[key]; p=pmap[key]; b=bmap[key]; ctx=contexts[c['sourceId']]
        for field in ('sourceIdSha256','sourceTextSha256','currentTargetSha256','callerContextSha256'):
            if r.get(field)!=c[field]: fail('cross identity hash '+field)
        if r.get('primaryDisposition')!=p['disposition'] or r.get('blindDecision')!=b['decision']: fail('cross source disposition binding')
        if r['callerContextSha256']!=ctx['callerContextSha256'] or ctx['callerCount']<=0: fail('caller-context linkage')
        if key in propmap:
            pp=propmap[key]; s=selectedmap.get(key)
            if not s: fail('primary proposal not selected')
            if r.get('crossDisposition')!='SELECT_PROPOSAL': fail('selected proposal disposition')
            if s.get('proposedTarget')!=pp['proposedTarget'] or s.get('proposedTargetSha256')!=pp['proposedTargetSha256']: fail('selected proposal differs from primary')
            if sha(s['proposedTarget'].encode('utf-8'))!=s['proposedTargetSha256']: fail('selected proposal hash')
            if (s.get('sourceIdSha256'),s.get('sourceTextSha256'),s.get('currentTargetSha256'),s.get('callerContextSha256'))!=(c['sourceIdSha256'],c['sourceTextSha256'],c['currentTargetSha256'],c['callerContextSha256']): fail('selected proposal source binding')
            if r.get('selectedProposedTargetSha256')!=s['proposedTargetSha256']: fail('cross proposal hash binding')
            if b['decision']=='HOLD' and r.get('blindHoldResolvedBySelectedProposal') is not True: fail('blind hold resolution marker')
        elif key in holdmap:
            if r.get('crossDisposition')!='HOLD' or r.get('holdCode')!='CALLER_CONTEXT_AMBIGUITY': fail('unresolved hold disposition')
            if 'selectedProposedTargetSha256' in r: fail('proposal attached to hold')
        else:
            if r.get('crossDisposition')!='KEEP' or 'selectedProposedTargetSha256' in r: fail('keep disposition')
        crosscounts[r['crossDisposition']]+=1
        # Cross ledger is identity/hash only; it contains no review texts.
        if any(k in r for k in ('sourceId','sourceText','currentTarget','proposedTarget','rationale','reason')): fail('cross ledger contains cell text')
    if seen!=set(cellmap) or crosscounts!={'KEEP':219,'SELECT_PROPOSAL':17,'HOLD':4}: fail('cross ledger coverage/counts')
    if set(selectedmap)!=set(propmap): fail('selected proposal set differs from primary proposals')
    # Current unresolved holds must remain hash-only, and all resolve to the carried prior hold.
    holds=rows(ROOT/'unresolved-holds.jsonl')
    if len(holds)!=4: fail('unresolved hold count')
    allowed={'position','locale','sourceIdSha256','sourceTextSha256','currentTargetSha256','callerContextSha256','holdCode','holdReasonSha256','previousWindow','previousHeldPosition','matchingPriorSourceTextSha256','confidence'}
    if any(set(h)!=allowed for h in holds): fail('unresolved hold ledger is not hash-only')
    if {(h['position'],h['locale']) for h in holds}!=set(holdmap): fail('unresolved hold set')
    if any(h['position']!=3932 or h['previousWindow']!='W3900-W3919' or h['previousHeldPosition']!=3904 for h in holds): fail('prior contextual-hold linkage')
    resolved=rows(ROOT/'resolved-blind-holds.jsonl')
    if len(resolved)!=2 or {(r['position'],r['locale']) for r in resolved}!=set(bholdmap): fail('resolved blind-hold set')
    for r in resolved:
        key=(r['position'],r['locale']); c=cellmap[key]
        if key not in selectedmap or r.get('selectedProposedTargetSha256')!=selectedmap[key]['proposedTargetSha256']: fail('resolved blind hold proposal binding')
        if any(k in r for k in ('sourceId','sourceText','currentTarget','proposedTarget','reason','rationale')): fail('resolved blind hold is not hash-only')
    # Historical continuity stays byte-identical and text-free.
    if (ROOT/'historical-hold-hashes.jsonl').read_bytes()!=(CF/'prior-hold-hash-reattestation.jsonl').read_bytes(): fail('historical hold hash lineage changed')
    if (ROOT/'historical-applied-target-hashes.jsonl').read_bytes()!=(CF/'prior-applied-target-hash-reattestation.jsonl').read_bytes(): fail('historical applied-target hash lineage changed')
    prior_holds=rows(ROOT/'historical-hold-hashes.jsonl'); prior_applied=rows(ROOT/'historical-applied-target-hashes.jsonl')
    if len(prior_holds)!=22 or len(prior_applied)!=197: fail('historical hash row counts')
    for r in prior_holds+prior_applied:
        if any(k.lower() in ('sourcetext','currenttarget','targettext','proposedtarget','rationale') for k in r): fail('historical lineage contains text')
        if r.get('targetTextIncluded') is True: fail('historical target text flag')
    # Exact apply plan is the selected proposal set, tied to locale catalog paths.
    plan=readj(ROOT/'apply-plan.json'); pins=readj(CF/'catalog-file-pins.json')['catalogFiles']
    if plan.get('applyStatus')!='PREPARED_NOT_APPLIED' or plan.get('selectedUpdateCount')!=17 or plan.get('noRepositoryWritesPerformed') is not True: fail('apply plan state')
    updates=plan.get('updates',[])
    if len(updates)!=17: fail('apply plan update count')
    upmap={(r['position'],r['locale']):r for r in updates}
    if set(upmap)!=set(selectedmap): fail('apply plan selected cells')
    hashes=[]
    for key,s in selectedmap.items():
        u=upmap[key]
        if (u.get('sourceId'),u.get('catalogPath'),u.get('expectedCurrentTargetSha256'),u.get('proposedTarget'),u.get('proposedTargetSha256'),u.get('callerContextSha256'))!=(s['sourceId'],pins[s['locale']]['path'],s['currentTargetSha256'],s['proposedTarget'],s['proposedTargetSha256'],s['callerContextSha256']): fail('apply plan target/path/hash binding')
        hashes.append(s['proposedTargetSha256'])
    hashfile=(ROOT/'selected-proposal-hashes.txt').read_text(encoding='utf-8').splitlines()
    if len(hashfile)!=17 or {line.split()[2] for line in hashfile}!={s['proposedTargetSha256'] for s in selected}: fail('selected proposal hash list')
    # One caller-context audit record for each selected source, with all direct refs represented.
    caller_audit=rows(ROOT/'caller-context-audit.jsonl')
    if len(caller_audit)!=20 or {r['sourceIdSha256'] for r in caller_audit}!={r['sourceIdSha256'] for r in rows(CF/'selected-source-cells.jsonl')}: fail('caller audit source coverage')
    if sum(r['callerCount'] for r in caller_audit)!=22 or any(r['callerCount']<=0 for r in caller_audit): fail('caller audit coverage')
    summary=readj(ROOT/'summary.json')
    if summary.get('crossDispositionCounts')!=dict(crosscounts) or summary.get('selectedProposalCount')!=17 or summary.get('unresolvedCurrentHashOnlyHoldCount')!=4: fail('cross summary counts')
    # Final local and live ref attestation.
    repo=pathlib.Path(args.source_worktree).resolve()
    head=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
    tree=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD^{tree}'],text=True).strip()
    status=subprocess.check_output(['git','-C',str(repo),'status','--porcelain=v1'],text=True).strip()
    if head!=HEAD or tree!=TREE or status: fail('source worktree pin/cleanliness')
    remote=subprocess.check_output(['git','-C',str(repo),'ls-remote','origin',f'refs/heads/{BRANCH}','refs/pull/418/head'],text=True)
    refs={line.split()[1]:line.split()[0] for line in remote.splitlines() if line.strip()}
    if refs.get(f'refs/heads/{BRANCH}')!=HEAD or refs.get('refs/pull/418/head')!=HEAD: fail('branch/pull refs moved')
    print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'crossCells':len(cross),'crossCounts':dict(crosscounts),
      'selectedProposals':len(selected),'hashOnlyCurrentHolds':len(holds),'resolvedBlindHolds':len(resolved),
      'historicalHashOnlyHolds':len(prior_holds),'historicalAppliedTargetHashes':len(prior_applied),
      'candidateFreePrimaryBlindVerifiers':'PASS','sourceWorktree':'CLEAN','liveBranchPullRefs':'PASS'},sort_keys=True))
if __name__=='__main__': main()
