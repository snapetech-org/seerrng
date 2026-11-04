#!/usr/bin/env python3
import hashlib, json, re
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def load_jsonl(p): return [json.loads(line) for line in p.open(encoding='utf-8') if line.strip()]
def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
rows=load_jsonl(ROOT/'cross-review-cells.jsonl')
changes=load_jsonl(ROOT/'selected-changes.jsonl')
readback=load_jsonl(ROOT/'application-readback.jsonl')
assert len(rows)==240 and len({(r['position'],r['locale']) for r in rows})==240
assert {r['position'] for r in rows}==set(range(3900,3920))
locales={'es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id'}
for pos in range(3900,3920): assert {r['locale'] for r in rows if r['position']==pos}==locales
counts=Counter(r['selectedDecision'] for r in rows)
assert counts==Counter({'keep':204,'propose':32,'hold':4}),counts
assert len(changes)==32 and len(readback)==32
holds=[r for r in rows if r['selectedDecision']=='hold']
assert {(r['position'],r['locale']) for r in holds}=={(3904,'ar'),(3904,'zh-Hans'),(3904,'zh-Hant'),(3904,'vi')}
for r in rows:
    if r['selectedDecision']=='hold':
        assert r.get('textRedacted') is True
        assert not {'sourceText','currentTarget','selectedTarget'}.intersection(r)
        assert re.fullmatch(r'[0-9a-f]{64}',r['sourceTextSha256'])
        assert re.fullmatch(r'[0-9a-f]{64}',r['currentTargetSha256'])
        assert not {'proposal','reviewedTarget'}.intersection(r.get('primaryReview',{}))
        assert not {'proposal','reviewedTarget'}.intersection(r.get('blindReview',{}))
        assert all('target' not in c for c in r.get('deferredCandidates',[]))
    else:
        assert r['sourceTextSha256']==sha(r['sourceText'])
        assert r['currentTargetSha256']==sha(r['currentTarget'])
        assert r['selectedTargetSha256']==sha(r['selectedTarget'])
        if r['selectedDecision']=='keep': assert r['selectedTarget']==r['currentTarget']
        if r['selectedDecision']=='propose': assert r['selectedTarget']!=r['currentTarget']
assert {r['sourceId']+'::'+r['locale'] for r in changes}=={r['sourceId']+'::'+r['locale'] for r in rows if r['selectedDecision']=='propose'}
for r in changes:
    assert r['currentTargetSha256']==sha(r['currentTarget']) and r['proposedTargetSha256']==sha(r['proposedTarget'])
for r in readback:
    assert r['readback']=='PASS' and r['appliedTargetSha256']==sha(r['appliedTarget'])
assert {r['sourceId']+'::'+r['locale'] for r in readback}=={r['sourceId']+'::'+r['locale'] for r in changes}
print(json.dumps({'result':'PASS','cells':len(rows),'counts':dict(counts),'changes':len(changes),'holdsRedacted':len(holds),'applicationReadbacks':len(readback)},sort_keys=True))
