#!/usr/bin/env python3
"""Verify exact readback, catalog parity, and non-target preservation for W3600-W3619."""
import argparse, collections, hashlib, json, re, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
EV=HERE.parent
REPO=EV.parents[3]
IN=EV/'candidate-free-input'; PR=EV/'primary-review'; BL=EV/'blind-review'; CA=EV/'third-party-cross-audit'
PLAN_PATH=HERE/'approved-application-plan.json'
PH=re.compile(r'\{[^{}\r\n]+\}'); MK=re.compile(r'</?[A-Za-z][^<>]*?/?>'); NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','BackIssue','Bindery','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
def sha(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha(s.encode('utf-8'))
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def git(args): return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()
def git_bytes(args): return subprocess.check_output(['git',*args],cwd=REPO)
def json_from_bytes(b): return json.loads(b.decode('utf-8'))
def verify_sums(d):
    expected={}
    for line in (d/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        if line.strip():
            h,n=line.split(None,1); expected[n.strip().lstrip('*')]=h
    actual={p.name for p in d.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
    assert set(expected)==actual,(d,'checksum inventory')
    for n,h in expected.items(): assert sha((d/n).read_bytes())==h,(d/n,'checksum')
    return sha((d/'SHA256SUMS.txt').read_bytes())
def verify_top_sums():
    sums=EV/'SHA256SUMS.txt'; expected={}
    for line in sums.read_text(encoding='utf-8').splitlines():
        if line.strip():
            h,n=line.split(None,1); expected[n.strip().lstrip('*')]=h
    actual={p.relative_to(EV).as_posix() for p in EV.rglob('*') if p.is_file() and p!=sums}
    assert set(expected)==actual,('top-level evidence inventory',set(expected)^actual)
    for n,h in expected.items(): assert sha((EV/n).read_bytes())==h,(n,'top-level checksum')
    return len(expected)
def write_json(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def assert_same_json(path,obj): assert j(path)==obj,(path,'stale generated evidence')
ap=argparse.ArgumentParser()
ap.add_argument('--write-artifacts',action='store_true',help='write the deterministic readback and invariant reports')
ap.add_argument('--skip-output-checksums',action='store_true',help='do not yet require the top-level evidence checksum list')
a=ap.parse_args()
plan=j(PLAN_PATH); preflight=j(EV/'application-preflight.json'); packet_verify=j(EV/'packet-verification.json')
assert plan['parentHead']==preflight['parentHead'] and plan['parentTree']==preflight['parentTree']
assert plan['candidateFreeManifestSha256']==sha((IN/'manifest.json').read_bytes())
packet_sums={n:verify_sums(d) for n,d in [('candidateFreeInput',IN),('primaryReview',PR),('blindReview',BL),('crossAudit',CA)]}
assert plan['candidateFreeChecksumListSha256']==packet_sums['candidateFreeInput']
assert plan['primaryChecksumListSha256']==packet_sums['primaryReview'] and plan['blindChecksumListSha256']==packet_sums['blindReview'] and plan['crossAuditChecksumListSha256']==packet_sums['crossAudit']
assert packet_verify['result']=='PASS' and packet_verify['upstreamVerifierRerun']=='PASS'
assert preflight['status']=='PASS' and preflight['parentHead']=='1fdec93d1b021e4ec7a7c2265230f59d81d2675e'
assert len(preflight['prBodyBeforeSha256'])==64 and preflight['prBodyBeforeBytes']>0
parent=plan['parentHead']; parent_tree=plan['parentTree']
assert git(['show','-s','--format=%T',parent])==parent_tree
# The verifier works before commit (HEAD=parent) and after the focused commit.
assert subprocess.run(['git','merge-base','--is-ancestor',parent,'HEAD'],cwd=REPO).returncode==0
cross={(x['position'],x['locale']):x for x in jl(CA/'cross-audit-resolution-ledger.jsonl')}
prim={(x['position'],x['locale']):x for x in jl(PR/'primary-ledger.jsonl')}
blind={(x['position'],x['locale']):x for x in jl(BL/'blind-ledger.jsonl')}
inputs={(x['position'],x['locale']):x for x in jl(IN/'current-target-cells.jsonl')}
sources={x['position']:x for x in jl(IN/'source-cells.jsonl')}
contexts={x['position']:x for x in jl(IN/'caller-contexts.jsonl')}
ctx_blocks=collections.defaultdict(list)
for block in jl(IN/'caller-context-blocks.jsonl'):
    if 'sourcePosition' in block: ctx_blocks[block['sourcePosition']].append(block)
expected={(p,l) for p in range(3600,3620) for l in plan['localeOrder']}
assert len(plan['cells'])==len(plan['changes'])+215==240
by_plan={(x['position'],x['locale']):x for x in plan['cells']}
assert set(by_plan)==expected and set(cross)==set(prim)==set(blind)==set(inputs)==expected
readback=[]
for key in sorted(expected):
    c=by_plan[key]; x=cross[key]; p=prim[key]; b=blind[key]; i=inputs[key]; s=sources[key[0]]; ctx=contexts[key[0]]
    assert c['sourceId']==s['sourceId']==x['sourceId']==p['sourceId']==b['sourceId']
    assert c['source']==s['source']==x['source']==p['source']==b['source']
    assert c['sourceSha256']==s['sourceSha256']==x['sourceSha256']==sha_text(c['source'])
    assert c['currentTarget']==i['currentTarget']==p['currentTarget']==b['currentTarget']==x['currentTarget']
    assert c['currentTargetSha256']==i['currentTargetSha256']==p['currentTargetSha256']==b['currentTargetSha256']==sha_text(c['currentTarget'])
    assert c['finalTarget']==x['crossAuditTarget'] and c['finalTargetSha256']==sha_text(c['finalTarget'])
    assert c['disposition']==x['crossAuditDisposition'] and c['resolutionBasis']==x['resolutionBasis']
    assert (c['disposition']=='accept-current')==(c['finalTarget']==c['currentTarget'])
    assert c['disposition']!='hold'
    assert c['catalogPath']==p['catalogPath'] and c['catalogGitBlob']==p['catalogGitBlob'] and c['catalogSha256']==p['catalogSha256']
    assert x['callerContext']['callerCount']==ctx['callerCount']>0
    assert x['callerContext']['directMessageReferences']==ctx['directMessageReferences']
    assert x['callerContext']['exactPinnedContextBlocks']==ctx_blocks[key[0]]
    readback.append({'position':key[0],'locale':key[1],'localeTag':c['localeTag'],'sourceId':c['sourceId'],'source':c['source'],'sourceSha256':c['sourceSha256'],
      'catalogPath':c['catalogPath'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],
      'expectedFinalTarget':c['finalTarget'],'expectedFinalTargetSha256':c['finalTargetSha256'],'actualFinalTarget':None,'actualFinalTargetSha256':None,
      'disposition':c['disposition'],'resolutionBasis':c['resolutionBasis'],'targetReadbackMatches':None,
      'callerLineRefs':[{'path':r['path'],'line':r['line'],'text':r['text'],'lineSha256':r['lineSha256']} for r in ctx['directMessageReferences']]})
# Load every locale catalog from the pinned parent and current working tree, and compare every value.
english_path='src/i18n/locale/en.json'
en_pre=json_from_bytes(git_bytes(['show',f'{parent}:{english_path}']))
en_post=json.loads((REPO/english_path).read_text(encoding='utf-8'))
en_keys=list(en_pre); en_set=set(en_keys)
assert len(en_keys)==9494 and len(en_set)==9494 and en_pre==en_post
by_catalog=collections.defaultdict(list)
for row in readback: by_catalog[row['catalogPath']].append(row)
expected_changed=collections.defaultdict(set)
for row in readback:
    if row['expectedFinalTarget']!=row['currentTarget']: expected_changed[row['catalogPath']].add(row['sourceId'])
rows_by_key={(r['position'],r['locale']):r for r in readback}
# Replace readback actual values and audit structural tokens after reading the final JSON files.
catalog_records=[]; protected_baseline=[]; placeholder_bad=[]; markup_bad=[]; numeric_bad=[]; protected_bad=[]
PROTECTED_LOCALES={'src/i18n/locale/en.json',*(r['catalogPath'] for r in readback)}
for catalog in sorted(PROTECTED_LOCALES):
    pre_raw=git_bytes(['show',f'{parent}:{catalog}']); pre=json_from_bytes(pre_raw)
    post_raw=(REPO/catalog).read_bytes(); post=json.loads(post_raw.decode('utf-8'))
    assert len(pre)==len(post)==9494 and set(pre)==set(post)==en_set,(catalog,'key set/count parity')
    pre_keys=list(pre); post_keys=list(post)
    key_digest=sha('\n'.join(pre_keys).encode())
    assert pre_keys==post_keys,(catalog,'key order changed')
    changed_keys={k for k in pre if pre[k]!=post[k]}
    target_keys=expected_changed.get(catalog,set())
    assert changed_keys==target_keys,(catalog,'unexpected/missing value changes',changed_keys^target_keys)
    non_target_changes=sum(pre[k]!=post[k] for k in pre if k not in target_keys)
    assert non_target_changes==0
    for row in by_catalog.get(catalog,[]):
        actual=post[row['sourceId']]
        row['actualFinalTarget']=actual; row['actualFinalTargetSha256']=sha_text(actual)
        row['targetReadbackMatches']=actual==row['expectedFinalTarget']
        assert row['targetReadbackMatches'],(catalog,row['sourceId'],'readback')
        src=sources[row['position']]
        ph=PH.findall(actual)==PH.findall(row['source'])
        mk=MK.findall(actual)==MK.findall(row['source'])
        num=NUM.findall(actual)==NUM.findall(row['source'])
        prot=all(lit in actual for lit in src.get('sourceProtectedLiterals',[]))
        if not ph: placeholder_bad.append((row['position'],row['locale']))
        if not mk: markup_bad.append((row['position'],row['locale']))
        if not num: numeric_bad.append((row['position'],row['locale']))
        if not prot: protected_bad.append((row['position'],row['locale']))
        row['tokenAudit']={'placeholderSequenceMatchesSource':ph,'markupSequenceMatchesSource':mk,'numericSequenceMatchesSource':num,
          'sourceProtectedLiteralsPresent':prot,'sourceProtectedLiterals':src.get('sourceProtectedLiterals',[])}
        assert ph and mk and num and prot,(row['position'],row['locale'],'token audit')
    catalog_records.append({
      'catalogPath':catalog,'preApplySha256':sha(pre_raw),'postApplySha256':sha(post_raw),
      'preApplyGitBlob':git(['rev-parse',f'{parent}:{catalog}']),'postApplyGitBlob':git(['hash-object',catalog]),
      'keyCount':len(post),'keySetEqualsEnglish':set(post)==en_set,'keyOrderPreserved':pre_keys==post_keys,
      'preApplyOrderedKeysSha256':key_digest,'postApplyOrderedKeysSha256':sha('\n'.join(post_keys).encode()),
      'orderedKeysEqualToEnglish':pre_keys==en_keys,'changedKeys':sorted(changed_keys),'expectedChangedKeys':sorted(target_keys),
      'changedValueCount':len(changed_keys),'expectedChangedValueCount':len(target_keys),
      'nonTargetValueChanges':non_target_changes,'nonTargetValuesPreserved':non_target_changes==0})
# The 240 target readbacks must cover 20 source IDs in each of the 12 direct locale catalogs.
assert len(readback)==240 and all(r['targetReadbackMatches'] for r in readback)
assert len(catalog_records)==13 and all(r['keyCount']==9494 and r['keySetEqualsEnglish'] and r['keyOrderPreserved'] for r in catalog_records)
assert all(r['nonTargetValueChanges']==0 for r in catalog_records)
assert sum(r['changedValueCount'] for r in catalog_records)==25
assert len([r for r in catalog_records if r['changedValueCount']])==12
baseline=[{'position':p,'locale':l} for (p,l),cell in sorted(inputs.items()) if cell['protectedLiteralMismatch']]
assert len(baseline)==8 and not placeholder_bad and not markup_bad and not numeric_bad and not protected_bad
assert collections.Counter(c['disposition'] for c in plan['cells'])=={'accept-current':215,'correction':20,'refinement':5}
assert plan['changeCount']==25 and all(c['disposition']!='hold' for c in plan['cells'])
readback_text=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in readback)
invariants={'schemaVersion':1,'parentHead':parent,'parentTree':parent_tree,'catalogCount':13,'localeCatalogCount':12,
 'englishCatalogPath':english_path,'englishKeyCount':len(en_keys),'englishOrderedKeysSha256':sha('\n'.join(en_keys).encode()),
 'catalogs':catalog_records,'keySetParityToEnglish':'PASS','perCatalogKeyOrderPreserved':'PASS',
 'preexistingOrderDivergentCatalogs':[r['catalogPath'] for r in catalog_records if not r['orderedKeysEqualToEnglish']]}
crossaudit_summary=j(CA/'summary.json')
overrides=crossaudit_summary['crossAuditResolution']['dispositionOverridesForSemanticSeverity']
verification={'schemaVersion':1,'status':'PASS','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3600-W3619',
 'parentHead':parent,'parentTree':parent_tree,'reviewedCells':240,'sourceIds':20,'locales':12,
 'dispositions':dict(sorted(collections.Counter(c['disposition'] for c in plan['cells']).items())),
 'appliedUpdates':25,'changedCatalogCount':12,'catalogInvariantCount':13,'crossAuditDispositionOverrides':overrides,'orderedKeyAndCountChecks':'PASS','keySetParityToEnglish':'PASS',
 'nonTargetValueChanges':0,'placeholderMismatches':len(placeholder_bad),'markupMismatches':len(markup_bad),'numericMismatches':len(numeric_bad),
 'protectedLiteralMismatches':len(protected_bad),'baselineProtectedLiteralMismatches':baseline,
 'all240CellsReadBackExactly':all(r['targetReadbackMatches'] for r in readback),'priorValuesOutsideSelectedTargetsPreserved':True,
 'sourceAndCallerLineage':'PASS','packetVerifiers':'PASS','testsBuildsScansCiDispatchesRun':False,'workflowFilesEdited':False,
 'nativeSpeakerApproval':False,'exactHeadBrowserReview':False}
readback_path=HERE/'readback-240-cells.jsonl'; invariants_path=EV/'catalog-invariants.json'; verification_path=EV/'application-verification.json'
if a.write_artifacts:
    readback_path.write_text(readback_text,encoding='utf-8')
    write_json(invariants_path,invariants); write_json(verification_path,verification)
else:
    assert jl(readback_path)==readback,(readback_path,'readback evidence')
    assert j(invariants_path)==invariants,(invariants_path,'catalog invariants')
    assert j(verification_path)==verification,(verification_path,'application verification')
checksum_entries=None
if not a.skip_output_checksums:
    assert (EV/'SHA256SUMS.txt').exists()
    checksum_entries=verify_top_sums()
    assert checksum_entries>0
print(json.dumps({'result':'PASS','mode':'write-artifacts' if a.write_artifacts else 'verify-only','parentHead':parent,'parentTree':parent_tree,
 'readbackCells':len(readback),'appliedUpdates':25,'changedCatalogs':12,'catalogInvariantCount':13,'keySetParity':'PASS','keyOrderPreserved':'PASS',
 'nonTargetValueChanges':0,'baselineProtectedMismatches':8,'finalProtectedMismatches':0,
 'placeholderMarkupNumericMismatches':0,'topLevelChecksumEntries':checksum_entries},ensure_ascii=False,indent=2))
