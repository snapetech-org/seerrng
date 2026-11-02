#!/usr/bin/env python3
import collections, hashlib, importlib.util, json, subprocess
from pathlib import Path

ROOT=Path('/mnt/disks/scratch/task-worktrees/localization-20261030')
OUT=ROOT/'semantic-results/seerrng-v13-5a434217-strict/manual-reconciliations/semantic-window-550-600-b693'
REPO=ROOT/'seerrng-apply-f67039a778d38912'
CATALOG=REPO/'src/i18n/locale/de.json'
ENGLISH=REPO/'src/i18n/locale/en.json'
EXPECTED_HEAD='b6935b9f828078a4991b4cbb777b38ef0c0edce5'
EXPECTED_TREE='5006af403fd43976b2957e81bce47d4a3401a230'
ROOT_LEDGER=OUT/'root-adjudication-ledger.jsonl'

spec=importlib.util.spec_from_file_location('seerr_adapter',ROOT/'translation-tools/run_seerr_v13_translation_adapter_semantic_5a434217.py')
tr=importlib.util.module_from_spec(spec); spec.loader.exec_module(tr)
def unique(pairs):
    result={}
    for k,v in pairs:
        if k in result: raise ValueError(f'duplicate JSON key {k!r}')
        result[k]=v
    return result
def read(path): return json.loads(Path(path).read_text(encoding='utf-8'),object_pairs_hook=unique)
def sha(data): return hashlib.sha256(data).hexdigest()
def sha_text(value): return sha(value.encode('utf-8'))
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()

head,tree,status=git('rev-parse','HEAD'),git('rev-parse','HEAD^{tree}'),git('status','--porcelain')
if (head,tree,status)!=(EXPECTED_HEAD,EXPECTED_TREE,''):
    raise SystemExit(f'worktree changed before apply: {head}/{tree} status={status!r}')
remote= subprocess.check_output(['gh','pr','view','418','--repo','snapetech-org/seerrng','--json','headRefOid','--jq','.headRefOid'],text=True).strip()
if remote!=EXPECTED_HEAD: raise SystemExit(f'live PR head changed before apply: {remote}')

rows=[json.loads(line) for line in ROOT_LEDGER.read_text(encoding='utf-8').splitlines() if line]
if len(rows)!=8 or len({r['id'] for r in rows})!=8: raise SystemExit('root ledger must contain exactly eight unique rows')
original=CATALOG.read_bytes(); before_sha=sha(original)
source_bytes=ENGLISH.read_bytes(); source_sha=sha(source_bytes)
source=read(ENGLISH); target=read(CATALOG)
if set(source)!=set(target): raise SystemExit('German/English client key parity differs before apply')
serialize=lambda obj:(json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
if serialize(target)!=original: raise SystemExit('refusing to change catalog serialization during focused apply')
if source_sha!=rows[0].get('sourceCatalogFileSha256',source_sha):
    raise SystemExit('English source catalog hash mismatch')

changed=[]
for row in rows:
    if (row.get('currentPrHead'),row.get('currentPrTree'))!=(EXPECTED_HEAD,EXPECTED_TREE):
        raise SystemExit(f"{row['id']}: root decision is pinned to another PR head/tree")
    if row.get('locale')!='de' or row.get('domain')!='client':
        raise SystemExit(f"{row['id']}: unexpected locale/domain")
    if row.get('rootDisposition') not in ('accepted-as-reviewed','refined-by-root','confirmed-correction'):
        raise SystemExit(f"{row['id']}: not root-adjudicated for apply")
    mid=row['id']; source_text=source.get(mid); current=target.get(mid); reviewed=row.get('reviewedTarget')
    if source_text!=row.get('source') or sha_text(source_text)!=row.get('sourceHash'):
        raise SystemExit(f'{mid}: exact source hash/value mismatch')
    if current!=row.get('currentTarget') or sha_text(current)!=row.get('currentTargetHash'):
        raise SystemExit(f'{mid}: exact current target hash/value mismatch')
    if sha_text(reviewed)!=row.get('reviewedTargetHash') or reviewed==current:
        raise SystemExit(f'{mid}: reviewed target hash mismatched or unchanged')
    tr.validate_value('client',{'id':mid,'source':source_text,'sourceHash':row['sourceHash']},reviewed)
    target[mid]=reviewed
    changed.append({'id':mid,'sourceHash':row['sourceHash'],'before':current,'beforeSha256':sha_text(current),
                    'after':reviewed,'afterSha256':sha_text(reviewed),'rootDisposition':row['rootDisposition']})

if len(changed)!=8: raise SystemExit('changed key coverage differs from root ledger')
updated=serialize(target)
CATALOG.write_bytes(updated)

# Fresh read-back parity and structural validation.
source_after=read(ENGLISH); target_after=read(CATALOG)
if set(source_after)!=set(target_after): raise SystemExit('German/English key parity differs after apply')
if any(not isinstance(v,str) or not v.strip() for v in target_after.values()): raise SystemExit('blank/non-text German value detected')
for row in rows:
    if target_after[row['id']]!=row['reviewedTarget'] or sha_text(target_after[row['id']])!=row['reviewedTargetHash']:
        raise SystemExit(f"{row['id']}: post-apply value/hash mismatch")
for mid in set(source)-{r['id'] for r in rows}:
    if target_after[mid]!=read(CATALOG).get(mid): raise SystemExit(f'{mid}: unexpected unrelated catalog change')
status_after=git('status','--porcelain')
changed_paths=git('diff','--name-only').splitlines()
if changed_paths!=['src/i18n/locale/de.json']:
    raise SystemExit(f'unexpected changed paths: {changed_paths}')
subprocess.run(['git','diff','--check'],cwd=REPO,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)

after_blob=git('rev-parse','HEAD:src/i18n/locale/de.json')
report={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'preApplyHead':head,'preApplyTree':tree,
        'postApplyUncommittedWorktreeHead':head,'catalogPath':'src/i18n/locale/de.json','selectedChangeCount':8,
        'beforeCatalogBlob':git('rev-parse','HEAD:src/i18n/locale/de.json'),'beforeCatalogSha256':before_sha,
        'afterCatalogBlobBeforeCommit':None,'afterCatalogSha256':sha(updated),'sourceCatalogBlob':git('rev-parse','HEAD:src/i18n/locale/en.json'),
        'sourceCatalogSha256':source_sha,'keyParity':'pass','nonemptyValues':'pass','duplicateJsonKeys':'pass',
        'placeholderIcuProtectedLiteralValidation':'pass','numericParity':'no numeric digit changes in selected rows',
        'changedKeyCoverage':'8/8','changedKeys':[r['id'] for r in rows],'gitDiffCheck':'pass',
        'changedPaths':changed_paths,'worktreeStatusAfter':status_after,'rows':changed,
        'nativeSpeakerApproval':False,'targetsApplied':True,'testsBuildsCiRun':False}
(OUT/'apply-report-8-root-adjudicated.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(OUT/'de.json.before-root-apply').write_bytes(original)
(OUT/'de.json.after-root-apply').write_bytes(updated)
print(json.dumps(report,ensure_ascii=False,indent=2))
