#!/usr/bin/env python3
from pathlib import Path
from collections import Counter
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
APP=ROOT/'application'
BASE='351f2c09a4aaf6f223975fc1827cb9f77de7702d'
TREE='3d88008f6ea7dc6cbef21333d29a032469cd60cf'
BRANCH='codex/seerrng-localization-overhaul-20261028'
PH=re.compile(r'\{[^{}\r\n]+\}')
MARKUP=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUMBER=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
def sha(b): return hashlib.sha256(b).hexdigest()
def sht(s): return sha(s.encode())
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def git(*a): return subprocess.run(['git',*a],cwd=REPO,check=True,capture_output=True).stdout
def verify_dir(d,sums='SHA256SUMS.txt'):
 p=d/sums; entries={}
 for line in p.read_text().splitlines():
  if line.strip():
   digest,rel=line.split(None,1); rel=rel.lstrip('* '); entries[rel]=digest
   assert sha((d/rel).read_bytes())==digest,(d,rel)
 actual={x.relative_to(d).as_posix() for x in d.rglob('*') if x.is_file() and x!=p}
 extras=actual-set(entries)
 if 'SHA256SUMS.sha256' in extras:
  att=(d/'SHA256SUMS.sha256').read_text().strip().split()
  assert att and att[0]==sha(p.read_bytes()),d
  extras.remove('SHA256SUMS.sha256')
  actual.remove('SHA256SUMS.sha256')
 assert not extras and actual==set(entries),(d,sorted(actual-set(entries)),sorted(set(entries)-actual))
 return sha(p.read_bytes())
for d in [ROOT/'candidate-free-input',ROOT/'primary-review',ROOT/'independent-blind-review',ROOT/'third-party-cross-audit']:
 verify_dir(d)
assert verify_dir(ROOT,'EVIDENCE-SHA256SUMS.txt')
auth=j(APP/'application-authorization.json'); plan=jl(APP/'application-plan.jsonl')
assert auth['applicationApproved'] is True and auth['head']==BASE and auth['tree']==TREE
assert auth['applicationPlan']['sha256']==sha((APP/'application-plan.jsonl').read_bytes())
assert len(plan)==32 and auth['applicationPlan']['selectedCellCount']==32 and auth['applicationPlan']['holdCount']==0
assert len({(r['position'],r['locale']) for r in plan})==32
pre=j(APP/'application-preflight.json'); assert pre['head']==BASE and pre['tree']==TREE and pre['branch']==BRANCH
pins=j(ROOT/'candidate-free-input/file-pins.json'); assert len(pins['catalogFiles'])==13
updates={}
for r in plan:
 assert r['head']==BASE and r['tree']==TREE and sht(r['source'])==r['sourceSha256'] and sht(r['currentTarget'])==r['currentTargetSha256'] and sht(r['selectedTarget'])==r['selectedTargetSha256']
 updates.setdefault(r['catalogPath'],{})[r['sourceId']]=r
assert len(updates)==12
for path,pin in pins['catalogFiles'].items():
 base=git('show',f'{BASE}:{path}'); assert sha(base)==pin['sha256'] and git('rev-parse',f'{BASE}:{path}').decode().strip()==pin['gitBlob']
 old=json.loads(base); actual=json.loads((REPO/path).read_bytes()); assert len(old)==len(actual)==pin['keyCount']==9494 and list(old)==list(actual)
 assert sht(json.dumps(list(old),ensure_ascii=False,separators=(',',':')))==pin['orderedKeysSha256']
 for k,v in old.items(): assert actual[k]==(updates[path][k]['selectedTarget'] if k in updates.get(path,{}) else v),(path,k)
assert sum(bool(v) for v in updates.values())==12
ledger=jl(ROOT/'third-party-cross-audit/cross-audit-ledger.jsonl'); readback=jl(APP/'application-readback.jsonl')
assert len(ledger)==len(readback)==240
rb={(x['position'],x['locale']):x for x in readback}; planidx={(x['position'],x['locale']):x for x in plan}
for row in ledger:
 key=(row['position'],row['locale']); r=rb[key]; value=json.loads((REPO/row['catalogPath']).read_bytes())[row['sourceId']]
 assert value==row['crossAuditTarget']==r['actualTarget']==r['expectedTarget']
 assert r['actualTargetSha256']==sht(value) and sht(row['source'])==row['sourceSha256']
 assert PH.findall(value)==PH.findall(row['source']) and MARKUP.findall(value)==MARKUP.findall(row['source']) and NUMBER.findall(value)==NUMBER.findall(row['source'])
 assert all(lit in value for lit in row['sourceProtectedLiterals'])
 assert r['applicationStatus']==('applied' if key in planidx else 'retained-current')
assert Counter(x['applicationStatus'] for x in readback)=={'applied':32,'retained-current':208}
head=subprocess.run(['git','rev-parse','HEAD'],cwd=REPO,check=True,capture_output=True,text=True).stdout.strip()
if head==BASE:
 changed={line[3:] for line in subprocess.run(['git','status','--porcelain','--untracked-files=all'],cwd=REPO,check=True,capture_output=True,text=True).stdout.splitlines()}
else:
 assert subprocess.run(['git','rev-parse','HEAD^'],cwd=REPO,check=True,capture_output=True,text=True).stdout.strip()==BASE
 changed=set(subprocess.run(['git','diff','--name-only',f'{BASE}..HEAD'],cwd=REPO,check=True,capture_output=True,text=True).stdout.splitlines())
expected={str(p.relative_to(REPO)) for p in ROOT.rglob('*') if p.is_file()}
expected|={p for p in updates}
assert changed==expected,(sorted(changed-expected),sorted(expected-changed))
print(json.dumps({'status':'PASS','headParent':BASE,'treeParent':TREE,'reviewedCells':240,'selectedChanges':32,'retainedCells':208,'holds':0,'catalogFilesChanged':12,'catalogFilesPinned':13,'orderedKeysPerCatalog':9494,'nonTargetValuesUnchanged':True,'evidenceChecksums':'PASS'},indent=2))
