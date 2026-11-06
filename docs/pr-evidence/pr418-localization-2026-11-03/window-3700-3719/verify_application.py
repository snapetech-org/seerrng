#!/usr/bin/env python3
"""Portable readback verifier for SeerrNG PR #418 W3700-W3719."""
import hashlib,json,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent
REPO=HERE.parents[3]
SUMMARY=json.loads((HERE/'summary.json').read_text())
def fail(s): raise SystemExit('FAIL: '+s)
def hs(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def hf(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a],text=True).strip()
base=SUMMARY['baseHead']
if git('rev-parse','HEAD^')!=base: fail('current commit parent differs from pinned base')
if git('rev-parse',base+'^{tree}')!=SUMMARY['baseTree']: fail('pinned base tree mismatch')
ledger=[json.loads(x) for x in (HERE/'application-ledger.jsonl').read_text().splitlines() if x]
readback=[json.loads(x) for x in (HERE/'readback.jsonl').read_text().splitlines() if x]
holds=[json.loads(x) for x in (HERE/'carried-holds.jsonl').read_text().splitlines() if x]
if len(ledger)!=240 or len(readback)!=240 or len(holds)!=12: fail('ledger/readback/hold count mismatch')
key=lambda r:(r['position'],r['locale'],r['sourceId'])
if len({key(r) for r in ledger})!=240 or len({key(r) for r in readback})!=240: fail('duplicate cell identity')
rb={key(r):r for r in readback}; paths=sorted({r['catalogPath'] for r in ledger})
if len(paths)!=12: fail('expected 12 locale catalogs')
changes=0; dispositions={}
for rel in paths:
 before=json.loads(subprocess.check_output(['git','-C',str(REPO),'show',base+':'+rel],text=True)); after=json.loads((REPO/rel).read_text())
 rows=[r for r in ledger if r['catalogPath']==rel]; expected={r['sourceId']:r for r in rows}
 if len(expected)!=len(rows): fail('duplicate source key '+rel)
 for row in rows:
  k=row['sourceId']
  if k not in before or k not in after: fail('missing key '+rel+':'+k)
  if hs(before[k])!=row['preimageSha256'] or hs(row['selectedTarget'])!=row['selectedTargetSha256']: fail('hash mismatch '+rel+':'+k)
  if after[k]!=row['selectedTarget'] or row['selectedTargetChanged']!=(before[k]!=after[k]): fail('value mismatch '+rel+':'+k)
  rr=rb[key(row)]
  if rr['preimageSha256']!=row['preimageSha256'] or rr['readbackSha256']!=hs(after[k]) or not rr['readbackMatchesSelected']: fail('readback mismatch '+rel+':'+k)
  changes+=row['selectedTargetChanged']; dispositions[row['disposition']]=dispositions.get(row['disposition'],0)+1
 actual={k for k in set(before)|set(after) if before.get(k)!=after.get(k)}
 expected_changed={r['sourceId'] for r in rows if r['selectedTargetChanged']}
 if actual!=expected_changed: fail('unexpected catalog changes '+rel)
for h in holds:
 rel=h['catalogPath']; k=h['sourceId']
 before=json.loads(subprocess.check_output(['git','-C',str(REPO),'show',base+':'+rel],text=True)); after=json.loads((REPO/rel).read_text())
 if hs(before[k])!=h['targetSha256'] or after[k]!=before[k] or hs(after[k])!=h['targetSha256']: fail('carried hold changed '+rel+':'+k)
if changes!=85 or dispositions!={'accept-current':155,'correction':48,'refinement':37}: fail('selected count/dispositions mismatch')
checks=(HERE/'SHA256SUMS.txt').read_text().splitlines(); listed={}
for line in checks:
 digest,name=line.split('  ',1); listed[name]=digest
expected=set(SUMMARY['evidenceFiles'])-{'SHA256SUMS.txt'}
if set(listed)!=expected: fail('checksum set mismatch')
for name,digest in listed.items():
 if hf(HERE/name)!=digest: fail('evidence checksum mismatch '+name)
prefix=HERE.relative_to(REPO).as_posix()
allowed={prefix+'/'+name for name in SUMMARY['evidenceFiles']}|set(paths)
diff=set(git('diff','--name-only',base,'--').splitlines())
if diff!=allowed: fail('changed path set mismatch '+repr(sorted(diff^allowed)))
print(json.dumps({'result':'PASS','baseHead':base,'baseTree':SUMMARY['baseTree'],'commit':git('rev-parse','HEAD'),'catalogCells':len(ledger),'selectedChanges':changes,'dispositions':dispositions,'localeCatalogs':len(paths),'priorHolds':len(holds),'allUnselectedKeysUnchanged':True,'evidenceChecksums':len(listed)},indent=2))
