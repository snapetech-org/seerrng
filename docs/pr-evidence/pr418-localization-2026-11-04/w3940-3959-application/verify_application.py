#!/usr/bin/env python3
"""Verify W3940-W3959 catalog application, exact readback, evidence, and optional live PR state."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import sys

HEAD='a0104b4c84a9c4561020ca72062171b22ffc49f2'
TREE='aaa44c8019c58fde7ae796065e8aae7ac11d7a80'
BRANCH='codex/seerrng-localization-overhaul-20261028'
WINDOW='W3940-W3959'
HOLD_POSITIONS={3943,3957}

def fail(message): raise SystemExit('FAIL: '+message)
def sha(data): return hashlib.sha256(data if isinstance(data,bytes) else data.encode('utf-8')).hexdigest()
def read_json(path):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc: fail(f'invalid JSON {path}: {exc}')
def read_rows(path):
    try: return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
    except Exception as exc: fail(f'invalid JSONL {path}: {exc}')
def load_unique(raw,label):
    duplicates=[]
    def hook(pairs):
        result={}
        for key,value in pairs:
            if key in result: duplicates.append(key)
            result[key]=value
        return result
    result=json.loads(raw.decode('utf-8'),object_pairs_hook=hook)
    if duplicates: fail(f'duplicate JSON key in {label}: {duplicates[0]}')
    return result
def git(repo,*args): return subprocess.check_output(['git','-C',str(repo),*args])
def checksum(directory,name='SHA256SUMS.txt'):
    sums_path=directory/name
    if not sums_path.is_file(): fail(f'missing checksum file {sums_path}')
    expected={}
    for line in sums_path.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        parts=line.split('  ',1)
        if len(parts)!=2: fail(f'malformed checksum row {sums_path}')
        digest,rel=parts
        path=(directory/rel).resolve()
        if directory.resolve() not in path.parents or rel in expected: fail(f'unsafe/duplicate checksum path {rel}')
        if not path.is_file() or sha(path.read_bytes())!=digest: fail(f'checksum mismatch {rel} in {directory}')
        expected[rel]=digest
    actual={p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file() and p!=sums_path}
    if actual!=set(expected): fail(f'checksum inventory mismatch in {directory}')
    return expected
def sha_tree(keys): return sha('\n'.join(keys))

def live_now(repo):
    remote=subprocess.check_output(['git','-C',str(repo),'ls-remote','origin',f'refs/heads/{BRANCH}','refs/pull/418/head','refs/heads/main'],text=True)
    refs={line.split()[1]:line.split()[0] for line in remote.splitlines() if line.strip()}
    pr=json.loads(subprocess.check_output(['gh','api','repos/snapetech-org/seerrng/pulls/418'],text=True))
    return refs,pr

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo',help='SeerrNG checkout containing the evidence commit; defaults to the enclosing repo')
    ap.add_argument('--review-source-worktree',required=True,help='clean worktree pinned to the original candidate-free head')
    ap.add_argument('--require-live',action='store_true',help='query GitHub refs and confirm PR body prefix/suffix after push')
    args=ap.parse_args()
    root=pathlib.Path(__file__).resolve().parent
    repo=pathlib.Path(args.repo).resolve() if args.repo else root.parents[3]
    review_repo=pathlib.Path(args.review_source_worktree).resolve()
    if git(repo,'rev-parse','--show-toplevel').decode().strip()!=str(repo): fail('--repo is not a Git worktree root')

    # Check every packet and the complete evidence inventory first.
    root_sums=checksum(root)
    for name in ('candidate-free-input','primary-review','blind-review','cross-audit'):
        checksum(root/name)
    cf=root/'candidate-free-input'; primary=root/'primary-review'; blind=root/'blind-review'; cross=root/'cross-audit'
    summary=read_json(root/'application-summary.json')
    plan=read_json(cross/'apply-plan.json')
    pins_doc=read_json(root/'catalog-preimages.json')
    posts_doc=read_json(root/'catalog-postimages.json')
    app_att=read_json(root/'product-commit-attestation.json')
    body_att=read_json(root/'pr-body-prefix-attestation.json')
    if (summary.get('repository'),summary.get('pullRequest'),summary.get('window'))!=('snapetech-org/seerrng',418,WINDOW): fail('application identity')
    base=summary.get('baseHead'); product=summary.get('productCommit'); evidence=git(repo,'rev-parse','HEAD').decode().strip()
    if (base,summary.get('baseTree'),plan.get('head'),plan.get('tree'))!=(HEAD,TREE,HEAD,TREE): fail('base/apply plan pin')
    if summary.get('productCommit')!=app_att.get('productCommit') or summary.get('productTree')!=app_att.get('productTree'): fail('product commit attestation binding')
    if git(repo,'rev-parse',f'{base}^{{tree}}').decode().strip()!=TREE: fail('base tree')
    if git(repo,'rev-parse',f'{product}^').decode().strip()!=base: fail('product parent')
    if git(repo,'rev-parse',f'{product}^{{tree}}').decode().strip()!=summary.get('productTree'): fail('product tree')
    if git(repo,'show','-s','--format=%s',product).decode().strip()!=app_att.get('commitMessage'): fail('product commit message')
    parents=git(repo,'show','-s','--format=%P','HEAD').decode().strip().split()
    if parents!=[product]: fail('evidence commit must be a direct child of the product commit')
    if git(repo,'status','--porcelain=v1').decode().strip(): fail('application worktree is not clean')
    product_paths=set(git(repo,'diff-tree','--no-commit-id','--name-only','-r',product).decode().splitlines())
    planned_paths={u['catalogPath'] for u in plan['updates']}
    if product_paths!=planned_paths or len(planned_paths)!=11: fail('product commit must change only the 11 planned locale catalogs')
    evidence_paths=set(git(repo,'diff-tree','--no-commit-id','--name-only','-r','HEAD').decode().splitlines())
    if not evidence_paths or any(not p.startswith('docs/pr-evidence/pr418-localization-2026-11-04/w3940-3959-application/') for p in evidence_paths): fail('evidence commit changed paths outside this evidence packet')

    # Re-run the candidate-free, primary, blind, and cross packet verifiers at their pinned base.
    cfman=read_json(cf/'manifest.json'); pman=read_json(primary/'manifest.json'); bman=read_json(blind/'review_packet.json')
    if any((m.get('head'),m.get('tree'),m.get('window'))!=(HEAD,TREE,WINDOW) for m in (cfman,pman,bman)): fail('input packet head/tree/window')
    subprocess.run([sys.executable,str(cf/'verify-candidate-free.py'),'--source-worktree',str(review_repo)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable,str(primary/'verify-primary.py'),'--candidate-free',str(cf)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable,str(blind/'verify_blind_packet.py')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable,str(cross/'verify_cross_review.py'),'--candidate-free-input',str(cf),'--primary-review',str(primary),'--blind-packet',str(blind),'--source-worktree',str(review_repo)],check=True,stdout=subprocess.DEVNULL)
    if (git(review_repo,'rev-parse','HEAD').decode().strip(),git(review_repo,'rev-parse','HEAD^{tree}').decode().strip(),git(review_repo,'status','--porcelain=v1').decode().strip())!=(HEAD,TREE,''):
        fail('review source worktree must be clean at exact base head')

    # Read and verify all 13 source/product catalog objects, including byte hashes and key order.
    cf_pins=read_json(cf/'catalog-file-pins.json')['catalogFiles']
    pre_by_locale={r['locale']:r for r in pins_doc.get('catalogFiles',[])}
    post_by_locale={r['locale']:r for r in posts_doc.get('catalogFiles',[])}
    if len(cf_pins)!=13 or set(pre_by_locale)!=set(cf_pins) or set(post_by_locale)!=set(cf_pins): fail('13-catalog pin/postimage coverage')
    before_by_path={}; after_by_path={}
    for locale,pin in cf_pins.items():
        path=pin['path']
        before_raw=git(repo,'show',f'{base}:{path}')
        after_raw=git(repo,'show',f'{product}:{path}')
        if (sha(before_raw),len(before_raw),git(repo,'rev-parse',f'{base}:{path}').decode().strip())!=(pin['sha256'],pin['byteCount'],pin['gitBlob']): fail(f'base catalog bytes/blob {locale}')
        before=load_unique(before_raw,f'base {locale}'); after=load_unique(after_raw,f'product {locale}')
        keys=list(before)
        if len(keys)!=pin['keyCount'] or keys!=list(after): fail(f'catalog key order/count {locale}')
        if (sha_tree(keys),sha_tree(sorted(keys)))!=(pin['keySequenceSha256'],pin['sortedKeySetSha256']): fail(f'catalog key sequence pin {locale}')
        pre=pre_by_locale[locale]; post=post_by_locale[locale]
        if (pre['path'],pre['byteCount'],pre['sha256'],pre['gitBlob'],pre['keyCount'],pre['keySequenceSha256'],pre['sortedKeySetSha256'])!=(path,len(before_raw),sha(before_raw),pin['gitBlob'],len(keys),sha_tree(keys),sha_tree(sorted(keys))): fail(f'catalog preimage record {locale}')
        after_blob=git(repo,'rev-parse',f'{product}:{path}').decode().strip()
        if (post['path'],post['byteCount'],post['sha256'],post['gitBlob'],post['keyCount'],post['keySequenceSha256'],post['sortedKeySetSha256'])!=(path,len(after_raw),sha(after_raw),after_blob,len(keys),sha_tree(keys),sha_tree(sorted(keys))): fail(f'catalog postimage record {locale}')
        before_by_path[path]=before; after_by_path[path]=after

    # Exact current-target guards, update set, and the 240-cell readback.
    updates=plan.get('updates',[])
    if len(updates)!=48: fail('selected update count')
    umap={(u['position'],u['locale']):u for u in updates}
    if len(umap)!=48: fail('duplicate update')
    cells=read_rows(cf/'current-target-cells.jsonl'); sources={r['position']:r for r in read_rows(cf/'selected-source-cells.jsonl')}
    cross_rows=read_rows(cross/'cross-ledger.jsonl'); crossmap={(r['position'],r['locale']):r for r in cross_rows}
    noops=read_rows(cross/'no-op-ledger.jsonl'); noops_map={(r['position'],r['locale']):r for r in noops}
    hold_rows=read_rows(cross/'unresolved-holds.jsonl'); holdmap={(r['position'],r['locale']):r for r in hold_rows}
    readback=read_rows(root/'application-readback.jsonl'); rbmap={(r['position'],r['locale']):r for r in readback}
    cellmap={(r['position'],r['locale']):r for r in cells}
    if (len(cellmap),len(sources),len(crossmap),len(rbmap),len(noops_map),len(holdmap))!=(240,20,240,240,168,24): fail('240/168/24 readback coverage')
    if set(rbmap)!=set(cellmap) or set(crossmap)!=set(cellmap): fail('readback/cross cell identity coverage')
    catalog_paths={u['locale']:u['catalogPath'] for u in updates}
    for key,c in cellmap.items():
        rb=rbmap[key]; x=crossmap[key]; u=umap.get(key); h=holdmap.get(key)
        if x.get('crossDisposition') not in {'KEEP','SELECT_PROPOSAL','HOLD'}: fail(f'unknown cross disposition {key}')
        for field in ('sourceIdSha256','sourceTextSha256','currentTargetSha256','callerContextSha256'):
            if x.get(field)!=c[field] or rb.get(field)!=c[field]: fail(f'readback hash binding {field} {key}')
        if rb.get('crossDisposition')!=x.get('crossDisposition') or rb.get('readback')!='PASS': fail(f'readback disposition {key}')
        path=c['catalogPath']; source_id=c['sourceId']; before=before_by_path[path][source_id]; after=after_by_path[path][source_id]
        if sha(before)!=c['currentTargetSha256']: fail(f'input current target sha {key}')
        expected=before
        if u:
            if x.get('crossDisposition')!='SELECT_PROPOSAL' or x.get('selectedProposalSha256')!=u['proposedTargetSha256']: fail(f'selected cross/apply-plan binding {key}')
            if (u['sourceId'],u['catalogPath'],u['expectedCurrentTargetSha256'],sha(u['proposedTarget']))!=(source_id,path,c['currentTargetSha256'],u['proposedTargetSha256']): fail(f'exact SHA guard/proposal {key}')
            expected=u['proposedTarget']
        elif h:
            if x.get('crossDisposition')!='HOLD' or after!=before: fail(f'held target changed {key}')
            allowed={'window','position','locale','sourceIdSha256','sourceTextSha256','currentTargetSha256','finalTargetSha256','callerContextSha256','crossDisposition','readback','status','holdCode','holdReasonSha256'}
            if set(rb)!=allowed or any(field in rb for field in ('sourceId','sourceText','currentTarget','finalTarget','proposedTarget','rationale','reason','catalogPath')): fail(f'hold readback not hash-only {key}')
            if (rb['currentTargetSha256'],rb['finalTargetSha256'],rb['holdCode'],rb['holdReasonSha256'])!=(c['currentTargetSha256'],c['currentTargetSha256'],h['holdCode'],h['holdReasonSha256']): fail(f'hold hash binding {key}')
        else:
            if x.get('crossDisposition')!='KEEP' or after!=before: fail(f'no-op target changed {key}')
            if key not in noops_map: fail(f'missing no-op {key}')
        if after!=expected: fail(f'final catalog exact value {key}')
        if not h:
            if (rb.get('sourceId'),rb.get('catalogPath'),rb.get('currentTarget'),rb.get('finalTarget'))!=(source_id,path,before,after): fail(f'text readback {key}')
            if (rb.get('currentTargetSha256'),rb.get('finalTargetSha256'))!=(sha(before),sha(after)): fail(f'text readback SHA {key}')
            if rb.get('status')!=('UPDATED' if u else 'UNCHANGED'): fail(f'readback status {key}')
    if set(umap)!={k for k,x in crossmap.items() if x['crossDisposition']=='SELECT_PROPOSAL'}: fail('selected proposal/readback set')
    if sum(r['status']=='UPDATED' for r in readback)!=48 or sum(r['crossDisposition']=='KEEP' for r in readback)!=168 or sum(r['crossDisposition']=='HOLD' for r in readback)!=24: fail('readback totals')
    if {r['position'] for r in hold_rows}!={3943,3957} or any(sources[p]['sourceText']!='Enable Agent' for p in (3943,3957)): fail('Enable Agent hash-only hold scope')

    # The historical hash-only rows are unchanged, byte-for-byte.
    if (root/'cross-audit'/'historical-hold-hashes.jsonl').read_bytes()!=(cf/'prior-hold-hash-reattestation.jsonl').read_bytes(): fail('prior hold hash lineage')
    if (root/'cross-audit'/'historical-applied-target-hashes.jsonl').read_bytes()!=(cf/'prior-applied-target-hash-reattestation.jsonl').read_bytes(): fail('prior applied-target hash lineage')
    if (len(read_rows(root/'cross-audit'/'historical-hold-hashes.jsonl')),len(read_rows(root/'cross-audit'/'historical-applied-target-hashes.jsonl')))!=(26,214): fail('prior hash counts')

    # Verify the immutable PR-body prefix attestation; live mode checks exact API bytes.
    template=(root/'PR-BODY-APPEND-TEMPLATE.md').read_bytes()
    if body_att.get('preAppendBodyByteLength')+len(template)!=body_att.get('expectedPostAppendBodyByteLength') or sha(template)!=body_att.get('appendTemplateSha256') or body_att.get('previousBodyIsByteForBytePrefix') is not True: fail('PR body append template/attestation')
    if (summary.get('appliedUpdates'),summary.get('readbackCells'),summary.get('changedCatalogCount'),summary.get('crossDispositionCounts'))!=(48,240,11,{'KEEP':168,'SELECT_PROPOSAL':48,'HOLD':24}): fail('application summary counts')
    if summary.get('nativeSpeakerApproval') is not False or summary.get('browserReview') is not False or summary.get('testsBuildsScansCI') is not False or summary.get('workflowChanges') is not False: fail('unsupported review/action claims')

    live_result='ATTESTED_OFFLINE'
    if args.require_live:
        refs,pr=live_now(repo)
        expected_head=evidence
        if any(refs.get(ref)!=expected_head for ref in (f'refs/heads/{BRANCH}','refs/pull/418/head')): fail('live branch/pull refs differ from evidence head')
        if pr['head']['sha']!=expected_head or pr['head']['ref']!=BRANCH or pr['base']['ref']!='main': fail('live PR API head/base')
        body=(pr.get('body') or '').encode('utf-8')
        old_len=body_att['preAppendBodyByteLength']
        if len(body)<old_len or sha(body[:old_len])!=body_att['preAppendBodySha256']: fail('live PR body prefix changed')
        if body[old_len:]!=template or sha(body)!=body_att['expectedPostAppendBodySha256']: fail('live PR body suffix/hash differs from attested append')
        if pr['state']!='open' or pr['draft'] is not True: fail('PR state/draft changed')
        live_result='PASS'
    print(json.dumps({'result':'PASS','baseHead':base,'baseTree':TREE,'productCommit':product,'productTree':summary['productTree'],'evidenceCommit':evidence,'cells':240,'selectedUpdates':48,'changedCatalogs':11,'noOpCells':168,'currentHashOnlyHolds':24,'priorHashOnlyHolds':26,'priorAppliedTargetHashes':214,'catalogsKeyOrderVerified':13,'inputVerifiers':'PASS','readback':'PASS','liveRefs':live_result,'checksummedFiles':len(root_sums)},sort_keys=True))

if __name__=='__main__': main()
