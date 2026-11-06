from __future__ import annotations
import hashlib,json,subprocess
from pathlib import Path

REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261103/seerrng-pr418-w3440-apply-20261103')
ROOT=Path('/mnt/disks/scratch/task-scratch')
INPUT=ROOT/'seerrng-pr418-w3440-3459-candidate-free-20261103'/'candidate-free-input'
AUDIT=ROOT/'seerrng-pr418-w3440-3459-third-party-cross-audit-20261103'/'cross-audit-ledger.jsonl'
OUT=ROOT/'seerrng-pr418-w3440-3459-apply-20261103'
HEAD='049b23526911e6cf6b1a0b2c397d155eb51d5ddf'
TREE='0a83d4f6bcea1367f218efb3898b15d2b0f4f140'

def sha(x): return hashlib.sha256(x.encode('utf-8')).hexdigest()
def jload(p): return json.loads(p.read_text(encoding='utf-8'))
def jlines(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def dumpj(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def dumpl(p,x): p.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in x),encoding='utf-8')
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()

if git('rev-parse','HEAD')!=HEAD or git('rev-parse',f'{HEAD}^{{tree}}')!=TREE or git('status','--porcelain'):
 raise SystemExit('worktree not clean at the exact reviewed head')
manifest=jload(INPUT/'window.json')
attestation=jload(INPUT/'PR-attestation.json')
if manifest.get('head')!=HEAD or manifest.get('tree')!=TREE or attestation.get('head')!=HEAD or attestation.get('headTree')!=TREE: raise SystemExit('candidate-free packet pin mismatch')
current_rows=jlines(INPUT/'current-target-cells.jsonl')
final_rows=jlines(AUDIT)
if len(current_rows)!=240 or len(final_rows)!=240: raise SystemExit('expected 240 candidate-free/final-review rows')
key=lambda r:((r['source']['sourceId'] if isinstance(r.get('source'),dict) else r['sourceId']),r['locale'])
current={key(r):r for r in current_rows}; final={key(r):r for r in final_rows}
if set(current)!=set(final): raise SystemExit('final cross-audit coverage does not match candidate-free cells')
plans=[]; selected_changes=[]; dispositions={}
for k,c in current.items():
 a=final[k]
 if a.get('head')!=HEAD or a.get('tree')!=TREE: raise SystemExit(f'cross-audit exact pin mismatch {k}')
 f=a['final']; cur=a['current']
 if cur['catalogPath']!=c['catalogPath'] or cur['target']!=c['currentTarget'] or cur['sha256']!=c['currentTargetSha256']:
  raise SystemExit(f'cross-audit/current packet disagreement {k}')
 disposition=f['disposition']; target=f['target'] if f['target'] is not None else c['currentTarget']; target_hash=f['targetSha256'] if f['targetSha256'] is not None else c['currentTargetSha256']
 if target_hash!=sha(target): raise SystemExit(f'final target hash mismatch {k}')
 dispositions[disposition]=dispositions.get(disposition,0)+1
 if disposition=='hold':
  if target!=c['currentTarget']: raise SystemExit(f'held target unexpectedly changed {k}')
 elif disposition=='accept-current':
  if target!=c['currentTarget']: raise SystemExit(f'accept-current target differs from current {k}')
 elif disposition in ('correction','refinement'):
  if target==c['currentTarget']: raise SystemExit(f'change disposition is a no-op {k}')
  selected_changes.append((k,c,a,target,target_hash))
 else: raise SystemExit(f'unknown disposition {disposition}')
 plans.append({'sourceId':c['sourceId'],'sourceKey':c['sourceId'],'locale':c['locale'],'catalogPath':cur['catalogPath'],'sourceSha256':c['sourceSha256'],'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'disposition':disposition,'selectedTarget':target,'selectedTargetSha256':target_hash,'rationale':f['rationale'],'confidence':f['confidence'],'decisionBasis':f['decisionBasis'],'candidateFreeChecksumsSha256':hashlib.sha256((INPUT/'SHA256SUMS.txt').read_bytes()).hexdigest()})
if dispositions!={'accept-current':210,'correction':5,'refinement':13,'hold':12} or len(selected_changes)!=18:
 raise SystemExit(f'unexpected disposition totals {dispositions}, selected changes={len(selected_changes)}')
# Snapshot every tracked catalog at the reviewed base, then patch only exact key/value pairs.
base={}
for p in sorted(REPO.glob('src/i18n/locale/*.json')):
 base[p.relative_to(REPO).as_posix()]=json.loads(p.read_text(encoding='utf-8'))
changed_keys={}
for (sid,locale),c,a,target,target_hash in selected_changes:
 path=a['current']['catalogPath']; source_key=c['sourceId']
 if path not in base: raise SystemExit(f'catalog not in baseline snapshot: {path}')
 p=REPO/path; d=json.loads(p.read_text(encoding='utf-8'))
 if d.get(source_key)!=c['currentTarget']: raise SystemExit(f'live value changed before apply: {sid}/{locale}')
 if sha(d[source_key])!=c['currentTargetSha256']: raise SystemExit(f'live hash changed before apply: {sid}/{locale}')
 old=json.dumps(source_key,ensure_ascii=False)+': '+json.dumps(d[source_key],ensure_ascii=False)
 new=json.dumps(source_key,ensure_ascii=False)+': '+json.dumps(target,ensure_ascii=False)
 text=p.read_text(encoding='utf-8')
 if text.count(old)!=1: raise SystemExit(f'expected one serialized key/value occurrence for {sid}/{locale}, found {text.count(old)}')
 p.write_text(text.replace(old,new,1),encoding='utf-8')
 changed_keys.setdefault(path,set()).add(source_key)
# Re-read every changed JSON file and prove the set of changed keys is exactly the selected targets.
after={}
for path,original in base.items():
 current_json=json.loads((REPO/path).read_text(encoding='utf-8'))
 keys={k for k in original if original.get(k)!=current_json.get(k)} | {k for k in current_json if original.get(k)!=current_json.get(k)}
 expected=changed_keys.get(path,set())
 if keys!=expected: raise SystemExit(f'non-target or missing changed keys in {path}: actual={sorted(keys)} expected={sorted(expected)}')
 after[path]=current_json
readback=[]
for c in current_rows:
 a=final[key(c)]; f=a['final']; d=after[a['current']['catalogPath']]; target=d[c['sourceId']]
 expected=f['target'] if f['target'] is not None else c['currentTarget']; expected_hash=f['targetSha256'] if f['targetSha256'] is not None else c['currentTargetSha256']
 row={'sourceId':c['sourceId'],'sourceKey':c['sourceId'],'locale':c['locale'],'catalogPath':a['current']['catalogPath'],'reviewDisposition':f['disposition'],'expectedTarget':expected,'expectedTargetSha256':expected_hash,'actualTarget':target,'actualTargetSha256':sha(target),'readbackMatches':target==expected and sha(target)==expected_hash,'changedFromCurrent':target!=c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],'rationale':f['rationale']}
 if not row['readbackMatches']: raise SystemExit(f'readback mismatch {key(c)}')
 readback.append(row)
OUT.mkdir(parents=True,exist_ok=True)
dumpl(OUT/'apply-plan.jsonl',plans)
dumpl(OUT/'readback.jsonl',readback)
summary={'repository':'snapetech-org/seerrng','pullRequest':418,'baseHead':HEAD,'baseTree':TREE,'reviewedCells':240,'dispositions':dispositions,'selectedChangedTargets':len(selected_changes),'readbackRows':len(readback),'readbackMismatches':0,'nonTargetCatalogChanges':0,'changedCatalogFiles':sorted(changed_keys),'changedSourceIds':sorted({sid for ((sid,_),*_) in selected_changes}),'worktree':str(REPO)}
dumpj(OUT/'summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
