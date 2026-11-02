import hashlib, json, re, subprocess
from collections import Counter
from pathlib import Path

root=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1000-1099')
primary_dir=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-1000-1099-20261102')
cross_dir=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-1000-1099-crossreview-20261102')
out=primary_dir
expected_head='447b806871926a7c8dea06958d19cbd7e5230006'
expected_tree='92450b5d67ea7551ef1eb262c05f77053ea016a0'

def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def tokens(s): return sorted(set(re.findall(r'\{[^{}]+\}',s)))
def html_tags(s): return sorted(re.findall(r'</?[A-Za-z][^>]*>',s))
def read_jsonl(p): return [json.loads(line) for line in p.read_text().splitlines() if line.strip()]

head=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
tree=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD^{tree}'],text=True).strip()
assert (head,tree)==(expected_head,expected_tree),(head,tree)
primary=read_jsonl(primary_dir/'primary-review-ledger.jsonl')
cross=read_jsonl(cross_dir/'independent-review-ledger.jsonl')
assert len(primary)==1200 and len(cross)==228,(len(primary),len(cross))
primary_candidates={(r['id'],r['locale']):r for r in primary if r['decision']=='correction-needed'}
cross_map={(r['sourceId'],r['locale']):r for r in cross}
assert len(primary_candidates)==228 and set(primary_candidates)==set(cross_map)

updates=[]
for key,p in primary_candidates.items():
    c=cross_map[key]
    assert p['attestedHead']==expected_head and p['attestedTree']==expected_tree
    assert c['head']==expected_head and c['tree']==expected_tree
    assert p['source']==c['source'] and p['sourceHash']==c['sourceHash'] and sha(p['source'])==p['sourceHash']
    assert p['currentTarget']==c['currentTarget'] and p['currentTargetHash']==c['currentTargetHash']
    assert sha(p['currentTarget'])==p['currentTargetHash']
    assert p['placeholderParity'] and p['markupParity'] and p['protectedLiteralParity']
    assert c['placeholderParity'] and c['markupParity']
    disp=c['independentDisposition']
    final=c['finalTarget']
    final_hash=c['finalTargetHash']
    assert sha(final)==final_hash
    assert tokens(p['source'])==tokens(final),(p['id'],p['locale'],'placeholder mismatch')
    assert html_tags(p['source'])==html_tags(final),(p['id'],p['locale'],'markup mismatch')
    if disp in ('accept','refine') and final_hash!=p['currentTargetHash']:
        rel=Path(p['targetFile'])
        assert not rel.is_absolute() and rel.parts[0]=='src' and rel.suffix=='.json'
        suffix={'pt-BR':'pt_BR','zh-CN':'zh_Hans','zh-TW':'zh_Hant'}.get(p['locale'],p['locale'])
        assert rel.stem.endswith(suffix),(p['targetFile'],p['locale'])
        updates.append({
            'id':p['id'],'sourceIdPosition':p['sourceIdPosition'],'locale':p['locale'],
            'targetFile':p['targetFile'],'source':p['source'],'sourceHash':p['sourceHash'],
            'primaryDecision':p['decision'],'independentDisposition':disp,
            'currentTarget':p['currentTarget'],'currentTargetHash':p['currentTargetHash'],
            'primaryProposal':p['proposedTarget'],'primaryProposalHash':p['proposedTargetHash'],
            'finalTarget':final,'finalTargetHash':final_hash,'rationale':c['rationale'],
            'callerContextReferenceCount':p['callerContextReferenceCount'],
        })
    else:
        assert disp in ('hold','no-op','accept'),(p['id'],p['locale'],disp)
        assert final_hash==p['currentTargetHash'],(p['id'],p['locale'],disp,'should remain unchanged')

assert len(updates)==224,len(updates)
assert Counter(r['independentDisposition'] for r in cross)==Counter({'accept':220,'refine':4,'hold':2,'no-op':2})
assert Counter(r['independentDisposition'] for r in updates)==Counter({'accept':220,'refine':4})
assert len({(u['targetFile'],u['id']) for u in updates})==224

# Verify target catalog source blobs, byte hashes, current cell values, and full locale parity.
locale_files=sorted({root/r['targetFile'] for r in primary})
assert len(locale_files)==12
reference=None
file_pins={}
for path in locale_files:
    rel=path.relative_to(root).as_posix()
    rows=[r for r in primary if r['targetFile']==rel]
    assert rows
    data_bytes=path.read_bytes()
    data=json.loads(data_bytes)
    assert hashlib.sha256(data_bytes).hexdigest()==rows[0]['targetCatalogSha256'],(rel,'catalog SHA')
    blob=subprocess.check_output(['git','-C',str(root),'rev-parse',f'{expected_head}:{rel}'],text=True).strip()
    assert blob==rows[0]['targetCatalogBlob'],(rel,'git blob')
    assert len(data)==9494,(rel,len(data))
    if reference is None: reference=set(data)
    assert set(data)==reference,(rel,'catalog parity')
    file_pins[rel]={'sha256':hashlib.sha256(data_bytes).hexdigest(),'gitBlob':blob,'keys':len(data)}
for p in primary:
    data=json.loads((root/p['targetFile']).read_text())
    assert p['id'] in data
    assert data[p['id']]==p['currentTarget']
    assert sha(data[p['id']])==p['currentTargetHash']

plan=out/'apply-plan-w1000-1099.jsonl'
plan.write_text(''.join(json.dumps(u,ensure_ascii=False,sort_keys=True)+'\n' for u in updates),encoding='utf-8')
for rel in sorted({u['targetFile'] for u in updates}):
    path=root/rel
    data=json.loads(path.read_text())
    for u in updates:
        if u['targetFile']==rel: data[u['id']]=u['finalTarget']
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

for u in updates:
    value=json.loads((root/u['targetFile']).read_text())[u['id']]
    assert value==u['finalTarget'] and sha(value)==u['finalTargetHash']
for path in locale_files:
    data=json.loads(path.read_text())
    assert len(data)==9494 and set(data)==reference
summary={
 'repository':'snapetech-org/seerrng','pullRequest':418,'inputHead':expected_head,'inputTree':expected_tree,
 'window':{'sourceIdStart':1000,'sourceIdEndInclusive':1099,'targetCells':1200},
 'primaryCandidates':228,'crossReviewDispositions':dict(Counter(r['independentDisposition'] for r in cross)),
 'appliedChanges':len(updates),'appliedByDisposition':dict(Counter(u['independentDisposition'] for u in updates)),
 'changesByLocale':dict(Counter(u['locale'] for u in updates)),
 'unchangedHolds':[{k:r.get(k) for k in ['sourceId','locale','currentTarget','currentTargetHash','rationale']} for r in cross if r['independentDisposition']=='hold'],
 'unchangedNoOps':[{k:r.get(k) for k in ['sourceId','locale','currentTarget','currentTargetHash','rationale']} for r in cross if r['independentDisposition']=='no-op'],
 'catalogFiles':file_pins,'keysPerCatalog':9494,'nativeSpeakerReviewPerformed':False,
 'browserReviewPerformed':False,'testsBuildsScansCIWorkflowChangesReleasesTagsMerges':False,
 'primaryPacketManifestSha256':'76b58b89890b21e0e8154b2641c11e7d1e57e02d05bde0851e2eba8287233c0b',
 'crossReviewManifestSha256':'f04b831a886bc564a1c0acff8a6ec3d320e5c5aa49bf3ac978c4c90ad25b17a7',
 'applyPlanSha256':hashlib.sha256(plan.read_bytes()).hexdigest(),
}
(out/'apply-summary-w1000-1099.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:summary[k] for k in ['appliedChanges','appliedByDisposition','changesByLocale','keysPerCatalog','applyPlanSha256']},ensure_ascii=False,indent=2))
