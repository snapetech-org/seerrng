import collections,hashlib,json,pathlib
root=pathlib.Path(__file__).resolve().parent
inp=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3520-3539-candidate-free-20261103/candidate-free-input')
def sha(b):return hashlib.sha256(b).hexdigest()
manifest=json.loads((inp/'manifest.json').read_text())
assert sha((inp/'manifest.json').read_bytes())=='9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63'
assert sha((inp/'SHA256SUMS.txt').read_bytes())=='2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d'
ledger=[json.loads(x) for x in (root/'primary-ledger.jsonl').read_text().splitlines()]
selected=[json.loads(x) for x in (root/'selected-direct-locale-cells.jsonl').read_text().splitlines()]
assert len(ledger)==240 and len({(x['position'],x['locale']) for x in ledger})==240
counts=collections.Counter(x['disposition'] for x in ledger)
assert counts=={'accept-current':216,'correction':20,'refinement':4}
assert len(selected)==24
for row in ledger:
 assert row['head']==manifest['head'] and row['tree']==manifest['tree']
 assert row['callerContext']['callerCount']>0
 assert row['placeholderTokenChecks']['currentSequenceMatchesSource'] and row['placeholderTokenChecks']['finalSequenceMatchesSource']
 assert sha(row['finalTarget'].encode())==row['finalTargetSha256']
print(json.dumps({'result':'PASS','cells':len(ledger),'dispositions':dict(counts),'selected':len(selected),'callerlessHolds':0}))
