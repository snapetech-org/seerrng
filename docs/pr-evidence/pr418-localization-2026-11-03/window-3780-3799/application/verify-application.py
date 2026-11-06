#!/usr/bin/env python3
import hashlib,json,subprocess,sys
from collections import Counter,defaultdict
from pathlib import Path
APP=Path(__file__).resolve().parent
def find_repo():
 for p in (Path(sys.argv[1]).resolve(),) if len(sys.argv)>1 else Path(__file__).resolve().parents:
  if (p/'src/i18n/locale/en.json').is_file():return p
 if len(sys.argv)>1:raise SystemExit('provided repo path has no Seerr locale catalog')
 raise SystemExit('repo root not found; pass it as the first argument')
REPO=find_repo()
def find_cross():
 if len(sys.argv)>2:return Path(sys.argv[2]).resolve()
 for p in APP.parents:
  for name in ('cross-review','cross-audit'):
   x=p/name/'cross-ledger.jsonl'
   if x.is_file():return x
 raise SystemExit('cross-ledger not found; pass it as second argument')
CROSS_LEDGER=find_cross()
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def j(root,n):return json.loads((root/n).read_text(encoding='utf-8'))
def jl(root,n):return [json.loads(x) for x in (root/n).read_text(encoding='utf-8').splitlines() if x]
def run(args):return subprocess.check_output(['git']+args,cwd=REPO,text=True,stderr=subprocess.STDOUT).strip()
HEAD='3f57a9a14857b56ec65fe5710050a881aab2730e'
app=j(APP,'application-preflight.json'); post=j(APP,'application-postflight.json'); inv=j(APP,'catalog-invariants.json')
assert app['head']==HEAD and post['head']==HEAD and app['tree']==post['tree']
assert run(['cat-file','-e',HEAD]) is not None
manifest_path=CROSS_LEDGER.parent/'manifest.json'
assert manifest_path.is_file()
cross_manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
assert cross_manifest['head']==HEAD and app['crossLedgerSha256']==sha(CROSS_LEDGER.read_bytes())
rows=jl(APP,'application-readback.jsonl'); plan=jl(APP,'application-plan.jsonl'); cross={ (x['position'],x['locale']):x for x in (json.loads(line) for line in CROSS_LEDGER.read_text(encoding='utf-8').splitlines() if line) }
assert len(rows)==240 and len(plan)==20 and len(cross)==240
assert post['readbackCellCount']==240 and post['selectedReadbackCount']==20 and post['acceptCurrentReadbackCount']==220 and post['allReadbacksMatch'] is True
selected={(x['position'],x['locale']):x for x in plan}
assert set(selected)=={k for k,r in cross.items() if r['crossDisposition']=='select-proposal'}
by_locale=defaultdict(dict)
for k,r in cross.items():
 if r['selectedTarget'] is not None:by_locale[r['locale']][r['sourceId']]=r['selectedTarget']
# Exact baseline preimages support a full comparison of every non-target value.
preflight=app['preimageCatalogSnapshots']
assert set(preflight)==set(by_locale) and len(preflight)==8
invariant_by_loc={x['locale']:x for x in inv['catalogs']}
assert len(invariant_by_loc)==13
for loc,snapshot in preflight.items():
 raw=(APP/snapshot['path']).read_bytes(); assert sha(raw)==snapshot['sha256']
 before=json.loads(raw.decode('utf-8')); path=snapshot['catalogPath']
 after=json.loads((REPO/path).read_text(encoding='utf-8'))
 assert list(before.keys())==list(after.keys())
 for key,value in before.items():
  if key in by_locale[loc]:assert after[key]==by_locale[loc][key]
  else:assert after[key]==value,(loc,key)
 invrow=invariant_by_loc[loc]
 seq=shat('\n'.join(after.keys())+'\n'); sortedset=shat('\n'.join(sorted(after))+'\n')
 assert seq==invrow['postKeySequenceSha256']==invrow['preKeySequenceSha256']
 assert sortedset==invrow['postSortedKeySetSha256']==invrow['preSortedKeySetSha256']
 assert sha((REPO/path).read_bytes())==invrow['postCatalogSha256']
 assert invrow['exactKeySequenceUnchanged'] is True and invrow['nonTargetValuesUnchanged'] is True
# Every locale's sorted key set and insertion sequence matches the saved post pins; do not conflate them.
for loc,invrow in invariant_by_loc.items():
 path=invrow['catalogPath']; cat=json.loads((REPO/path).read_text(encoding='utf-8'))
 assert len(cat)==invrow['keyCountAfter']
 assert shat('\n'.join(sorted(cat))+'\n')==invrow['postSortedKeySetSha256']
 assert shat('\n'.join(cat.keys())+'\n')==invrow['postKeySequenceSha256']
 assert invrow['exactKeySequenceUnchanged'] is True
# Readback includes all 240 cells and matches the checked-out catalogs exactly.
bykey={}
for r in rows:
 k=(r['position'],r['locale']); cr=cross[k]; path=REPO/r['catalogPath']; cat=json.loads(path.read_text(encoding='utf-8'))
 assert r['crossDisposition']==cr['crossDisposition'] and r['selectedTargetSha256']==cr['selectedTargetSha256']
 actual=cat[r['sourceId']]
 assert actual==r['expectedReadback']==r['actualReadback'] and r['readbackMatches'] is True and r['actualReadbackSha256']==shat(actual)
 if cr['selectedTarget'] is not None:assert actual==cr['selectedTarget'] and (r['position'],r['locale']) in selected
 else:assert actual==cr['currentTarget']
# Exact local edits are eight locale files and 20 target keys; no workflow or unrelated path entered the application commit.
assert set(inv['changedCatalogPaths'])=={x['catalogPath'] for x in invariant_by_loc.values() if x['changedCatalog']}
assert len(inv['changedCatalogPaths'])==8 and sum(len(x) for x in by_locale.values())==20
assert set(post['diffNameOnly'])==set(inv['changedCatalogPaths'])
assert not any('.github/workflows' in x for x in post['diffNameOnly'])
hold=jl(APP,'prior-hold-hash-readback.jsonl'); assert len(hold)==12 and all(x['priorHoldPreserved'] and x['targetHashMatches'] and x['targetTextIncluded'] is False for x in hold)
assert (APP/'prior-selection-hash-reattestation.jsonl').is_file()
print(json.dumps({'result':'PASS','baselineHead':HEAD,'applicationHead':run(['rev-parse','HEAD']),'readbackCells':len(rows),'selectedChanges':len(plan),'changedCatalogs':len(inv['changedCatalogPaths']),'nonTargetValuesUnchanged':True,'exactPrePostKeySequenceMatch':True,'sortedKeySetParityCheckedSeparately':True,'priorHoldsUnchanged':len(hold),'workflowPathsChanged':0},ensure_ascii=False,indent=2))
