from __future__ import annotations
import collections, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
BASE=Path('/mnt/disks/scratch/task-scratch')
INPUT=BASE/'seerrng-pr418-w3520-3539-candidate-free-20261103/candidate-free-input'
PRIMARY=BASE/'seerrng-pr418-w3520-3539-primary-review-20261103'
BLIND=BASE/'seerrng-pr418-w3520-3539-independent-blind-20261103/review'
def sha(b): return hashlib.sha256(b).hexdigest()
def rows(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x]
def verify_sums(p):
 out=[]
 for line in (p/'SHA256SUMS.txt').read_text().splitlines():
  h,n=line.split(None,1); n=n.lstrip('* '); a=sha((p/n).read_bytes()); out.append((h==a,n))
 return out
assert all(ok for ok,_ in verify_sums(ROOT))
assert all(ok for ok,_ in verify_sums(INPUT))
assert all(ok for ok,_ in verify_sums(PRIMARY))
assert all(ok for ok,_ in verify_sums(BLIND))
ledger=rows(ROOT/'cross-audit-ledger.jsonl'); assert len(ledger)==240
summary=json.loads((ROOT/'summary.json').read_text())
disposition_differences=rows(ROOT/'disposition-differences.jsonl'); assert len(disposition_differences)==summary['dispositionDifferences']
assert dict(collections.Counter(x['crossDisposition'] for x in ledger))==summary['crossDispositions']
assert sum(x['crossTarget']!=x['currentTarget'] for x in ledger)==summary['finalProposedChanges']
assert sum(x['targetAgreement'] is False for x in ledger)==summary['targetDisagreements']
assert sum(not x['placeholderTokensMatchSource'] for x in ledger)==0
assert summary['head']=='265171657d48ef56ee81cc1c6a5c3d07abe5d07e'
print(json.dumps({'result':'PASS','cells':len(ledger),'crossDispositions':summary['crossDispositions'],'finalProposedChanges':summary['finalProposedChanges'],'targetDisagreements':summary['targetDisagreements'],'allPacketAndAuditChecksumsVerified':True},ensure_ascii=False,indent=2))
