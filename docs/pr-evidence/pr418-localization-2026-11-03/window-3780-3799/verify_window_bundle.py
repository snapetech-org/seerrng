#!/usr/bin/env python3
import hashlib,json,subprocess,sys
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def find_repo():
 for p in ROOT.parents:
  if (p/'src/i18n/locale/en.json').is_file():return p
 raise SystemExit('SeerrNG repository root not found')
REPO=find_repo()
def sha(b):return hashlib.sha256(b).hexdigest()
def j(root,name):return json.loads((root/name).read_text(encoding='utf-8'))
def run(args):return subprocess.check_output(['git']+args,cwd=REPO,text=True,stderr=subprocess.STDOUT).strip()
def verify_sums(root):
 sums={}
 for line in (root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  d,n=line.split(None,1); sums[n.lstrip('* ')]=d
 allfiles={x.relative_to(root).as_posix() for x in root.rglob('*') if x.is_file() and x.relative_to(root).as_posix()!='SHA256SUMS.txt'}
 assert set(sums)==allfiles,(root,len(sums),len(allfiles))
 for n,d in sums.items():assert sha((root/n).read_bytes())==d,(root,n)
 return len(sums)
manifest=j(ROOT,'manifest.json')
files_checked=verify_sums(ROOT)
allfiles={x.relative_to(ROOT).as_posix() for x in ROOT.rglob('*') if x.is_file() and x.relative_to(ROOT).as_posix()!='SHA256SUMS.txt'}
assert set(manifest['fileNames'])==allfiles-{'manifest.json'}
assert manifest['window']=='W3780-W3799' and manifest['range']==[3780,3799] and manifest['cellCount']==240
assert manifest['headRef']=='codex/seerrng-localization-overhaul-20261028' and manifest['applicationCommitSha']=='39b0010ce37725c7a35af9a5cbc9f0898edd1563'
assert manifest['selectedChanges']==20 and manifest['selectedDispositionCounts']=={'correct':5,'refine':15}
# Validate copied candidate-free, primary, blind, and cross packets with their portable verifiers.
for name,tool in [('candidate-free-input','verify-candidate-free.py'),('primary-review','verify-primary.py'),('blind-review','verify-blind.py'),('cross-audit','verify_cross.py')]:
 root=ROOT/name
 assert verify_sums(root)>0
 subprocess.run([sys.executable,str(root/tool)],check=True,stdout=subprocess.DEVNULL)
 assert j(root,'manifest.json')['head']==manifest['baselineHead']
 # Hash references in root manifest match exact packet manifest/checksum bytes.
 pin=manifest['inputPackets'][name]
 assert pin['manifestSha256']==sha((root/'manifest.json').read_bytes()) and pin['checksumListSha256']==sha((root/'SHA256SUMS.txt').read_bytes())
# Cross-selected targets and application readback check against this repository's actual locale catalogs.
application=ROOT/'application'; cross=ROOT/'cross-audit'
assert verify_sums(application)>0
assert j(application,'manifest.json')['applicationCommitSha']==manifest['applicationCommitSha']
assert manifest['applicationPacket']['manifestSha256']==sha((application/'manifest.json').read_bytes()) and manifest['applicationPacket']['checksumListSha256']==sha((application/'SHA256SUMS.txt').read_bytes())
appmeta=j(application,'catalog-application-commit.json'); app_sha=manifest['applicationCommitSha']
assert appmeta['commit']==app_sha and appmeta['tree']==manifest['applicationCommitTree'] and appmeta['parent']==manifest['baselineHead']
assert run(['rev-parse','HEAD'])!='' and subprocess.run(['git','merge-base','--is-ancestor',app_sha,run(['rev-parse','HEAD'])],cwd=REPO).returncode==0
assert run(['rev-parse',f'{app_sha}^'])==manifest['baselineHead'] and run(['rev-parse',f'{app_sha}^{{tree}}'])==manifest['applicationCommitTree']
commit_files=run(['diff-tree','--no-commit-id','--name-only','-r',app_sha]).splitlines()
assert sorted(commit_files)==sorted(manifest['changedCatalogPaths']) and len(commit_files)==8
assert all(not x.startswith('.github/workflows/') for x in commit_files)
application_result=json.loads(subprocess.check_output([sys.executable,str(application/'verify-application.py'),str(REPO),str(cross/'cross-ledger.jsonl')],text=True))
assert application_result['result']=='PASS' and application_result['applicationHead']==app_sha
att=j(application,'application-postcommit-attestation.json')
pr=att['pullRequest']
assert pr['number']==418 and pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==app_sha
assert att['branchRef']==app_sha and att['pullRef']==app_sha and att['deploymentsAtCommit']==0
catalog_commit=appmeta['files']; assert catalog_commit==commit_files
inv=j(application,'catalog-invariants.json')
assert inv['catalogKeySetParityWithEnglish'] is True and inv['exactKeySequenceUnchangedOnChangedCatalogs'] is True
assert inv['changedTargetCount']==20 and set(inv['changedCatalogPaths'])==set(commit_files)
assert all(x['exactKeySequenceUnchanged'] and x['nonTargetValuesUnchanged'] for x in inv['catalogs'])
assert all(x['preKeySequenceSha256']==x['postKeySequenceSha256'] for x in inv['catalogs'])
assert all(x['preSortedKeySetSha256']==x['postSortedKeySetSha256'] for x in inv['catalogs'])
print(json.dumps({'result':'PASS','window':manifest['window'],'baselineHead':manifest['baselineHead'],'applicationCommit':app_sha,'repositoryHead':run(['rev-parse','HEAD']),
 'cells':240,'selectedChanges':20,'changedCatalogs':len(commit_files),'readback':'PASS','exactPrePostKeySequences':'PASS','sortedKeySetParitySeparate':'PASS',
 'priorHoldsUnchanged':12,'inputPacketVerifiers':'PASS','deploymentsAtCatalogCommit':0,'checksummedFiles':files_checked},ensure_ascii=False,indent=2))
