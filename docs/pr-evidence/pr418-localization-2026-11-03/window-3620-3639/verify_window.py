#!/usr/bin/env python3
from pathlib import Path
import collections
import hashlib
import json
import subprocess
import sys

E=Path(__file__).resolve().parent
REPO=E.parents[3]
BASE='ebf1cb6082ef173688227c507acfdc04c3cf7ca7'
TREE='e3c4d1d10f40ea078b66dfdf942e99c8189fee0c'
BRANCH='codex/seerrng-localization-overhaul-20261028'
MODES={'--precommit','--prepush','--evidence','--postpush'}
mode=sys.argv[1] if len(sys.argv)>1 else '--postpush'
assert mode in MODES,mode

def run(args,cwd=None):
 return subprocess.check_output(args,cwd=cwd or REPO,text=True).strip()

def sha(data):
 return hashlib.sha256(data).hexdigest()

def rows(path):
 return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]

def verify_sums(folder,name):
 for line in (folder/name).read_text(encoding='utf-8').splitlines():
  if line.strip():
   digest,filename=line.split(None,1)
   filename=filename.strip().lstrip('*')
   assert sha((folder/filename).read_bytes())==digest,(folder/filename,'checksum')

def verify_root_sums():
 for line in (E/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  if line.strip():
   digest,filename=line.split(None,1)
   filename=filename.strip().lstrip('*')
   assert sha((E/filename).read_bytes())==digest,(E/filename,'root checksum')

I=E/'candidate-free-input'
P=E/'primary-review'
B=E/'blind-review'
BI=B/'blind-input'
X=E/'cross-audit'
verify_sums(I,'SHA256SUMS.txt')
verify_sums(P,'SHA256SUMS.txt')
verify_sums(BI,'SHA256SUMS.txt')
verify_sums(B,'SHA256SUMS.txt')
verify_sums(X,'SHA256SUMS.txt')
for folder,script in [(I,'verify_candidate_free.py'),(P,'verify_primary.py'),(BI,'verify_blind_input.py'),(B,'verify_blind_review.py'),(X,'verify_cross_audit.py')]:
 subprocess.run([sys.executable,script],cwd=folder,check=True,capture_output=True,text=True)
im=json.loads((I/'manifest.json').read_text())
pm=json.loads((P/'manifest.json').read_text())
bm=json.loads((B/'manifest.json').read_text())
xm=json.loads((X/'manifest.json').read_text())
assert (im['head'],im['tree'],im['repository'],im['pullRequest'])==(BASE,TREE,'snapetech-org/seerrng',418)
assert (pm['head'],pm['tree'])==(BASE,TREE)
assert (bm['head'],bm['tree'])==(BASE,TREE)
assert (xm['head'],xm['tree'],xm['repository'],xm['pullRequest'])==(BASE,TREE,'snapetech-org/seerrng',418)
plan=json.loads((E/'apply-plan.json').read_text())
assert (plan['baseHead'],plan['baseTree'],plan['reviewedCells'])==(BASE,TREE,240)
cells=rows(I/'current-target-cells.jsonl')
audit=rows(X/'cross-audit-ledger.jsonl')
all_plan=plan['allCellReadbackPlan']
assert len(cells)==len(audit)==len(all_plan)==240
bycell=lambda rr:{(x['position'],x['locale']):x for x in rr}
ci,ai,pi=bycell(cells),bycell(audit),bycell(all_plan)
assert ci.keys()==ai.keys()==pi.keys()
counts=collections.Counter(x['resolution'] for x in all_plan)
assert counts==collections.Counter({'retain-current':195,'adopt-blind-proposal':12,'cross-audit-target':21,'hold':12})
assert len(plan['updates'])==33
assert sum(x['changed'] for x in all_plan)==33
assert all(x['position']==3632 and x['selectedTarget']==x['currentTarget'] for x in all_plan if x['resolution']=='hold')
for key,c in ci.items():
 a=ai[key]; p=pi[key]
 assert (a['sourceId'],a['source'],a['sourceSha256'])==(c['sourceId'],c['source'],c['sourceSha256'])
 assert (a['currentTarget'],a['currentTargetSha256'])==(c['currentTarget'],c['currentTargetSha256'])
 assert (a['catalogPath'],a['catalogSha256'],a['catalogGitBlob'])==(c['catalogPath'],c['catalogSha256'],c['catalogGitBlob'])
 assert p['selectedTargetSha256']==sha(p['selectedTarget'].encode())
 assert p['selectedTarget']==(a['resolvedTarget'] if a['resolvedTarget'] is not None else c['currentTarget'])
updates={(x['position'],x['locale']):x for x in plan['updates']}
assert updates.keys()=={k for k,x in pi.items() if x['changed']}
for k,u in updates.items():
 assert (u['sourceId'],u['catalogPath'],u['selectedTarget'],u['selectedTargetSha256'])==(pi[k]['sourceId'],pi[k]['catalogPath'],pi[k]['selectedTarget'],pi[k]['selectedTargetSha256'])
allowed_catalogs={x['catalogPath'] for x in cells}
catalogs={}
for path in allowed_catalogs:
 raw=subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=REPO)
 baseline=json.loads(raw.decode('utf-8'))
 assert raw.decode('utf-8')==json.dumps(baseline,ensure_ascii=False,indent=2)+'\n'
 relevant=[x for x in cells if x['catalogPath']==path]
 assert all(sha(raw)==x['catalogSha256'] for x in relevant)
 assert all(run(['git','rev-parse',f'{BASE}:{path}'])==x['catalogGitBlob'] for x in relevant)
 current=json.loads((REPO/path).read_text(encoding='utf-8'))
 assert list(current)==list(baseline)
 selected={x['sourceId']:x['selectedTarget'] for x in all_plan if x['catalogPath']==path and x['changed']}
 for key,value in baseline.items():
  assert current[key]==selected.get(key,value),(path,key,'readback/non-target mismatch')
 catalogs[path]=(baseline,current)
 assert list(current)==list(baseline)
for u in plan['updates']:
 assert catalogs[u['catalogPath']][1][u['sourceId']]==u['selectedTarget']
evidence_rel=E.relative_to(REPO).as_posix()
def allowed(path):
 return path in allowed_catalogs or path.startswith(evidence_rel+'/')
diff=set(filter(None,run(['git','diff','--name-only',BASE]).splitlines()))
assert all(allowed(p) for p in diff),sorted(diff)
assert not any(p.startswith('.github/workflows/') for p in diff)
check=subprocess.run(['git','-C',str(REPO),'diff','--check',BASE],capture_output=True,text=True)
assert check.returncode==0,check.stdout+check.stderr
status=run(['git','status','--porcelain','--untracked-files=all']).splitlines()
status_paths=[line[2:].strip() for line in status]
head=run(['git','rev-parse','HEAD'])
tree=run(['git','rev-parse','HEAD^{tree}'])
pr=json.loads(run(['gh','api','repos/snapetech-org/seerrng/pulls/418']))
assert (pr['state'],pr['draft'],pr['head']['ref'],pr['base']['ref'])==('open',True,BRANCH,'main')
refs_text=run(['git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{BRANCH}','refs/pull/418/head'])
refs={line.split()[1]:line.split()[0] for line in refs_text.splitlines() if line.strip()}
remote_branch=refs[f'refs/heads/{BRANCH}']; remote_pr=refs['refs/pull/418/head']
if mode=='--precommit':
 assert head==BASE and tree==TREE
 assert pr['head']['sha']==BASE and remote_branch==remote_pr==BASE
 assert all(allowed(path) for path in status_paths),status
 assert all(path in status_paths for path in {x['catalogPath'] for x in plan['updates']})
elif mode=='--prepush':
 assert run(['git','rev-parse',f'{head}^'])==BASE
 assert not status,status
 assert pr['head']['sha']==BASE and remote_branch==remote_pr==BASE
elif mode=='--evidence':
 av=json.loads((E/'application-verification.json').read_text())
 assert head==av['applicationCommit'] and pr['head']['sha']==head and remote_branch==remote_pr==head
 assert all(path.startswith(evidence_rel+'/') for path in status_paths),status
 verify_root_sums()
else:
 assert pr['head']['sha']==head and remote_branch==remote_pr==head
 assert not status,status
 verify_root_sums()
 av=json.loads((E/'application-verification.json').read_text())
 applied=av['applicationCommit']
 assert applied in run(['git','rev-list',f'{BASE}..{head}']).split()
 assert run(['git','rev-parse',f'{applied}^{{tree}}'])==av['applicationTree']
 assert av['livePullRequestHead']==applied and av['branch']==BRANCH
 assert av['catalogs']=={p:sha((REPO/p).read_bytes()) for p in sorted(allowed_catalogs)}
print(json.dumps({'pass':True,'mode':mode,'base':BASE,'head':head,'tree':tree,'cells':240,'dispositions':dict(counts),'updates':33,'updatedCatalogs':len({x['catalogPath'] for x in plan['updates']}),'holds':12,'nonTargetChanges':0,'workflowFilesTouched':False,'diffCheck':'PASS','pr':'OPEN/DRAFT'},indent=2))
