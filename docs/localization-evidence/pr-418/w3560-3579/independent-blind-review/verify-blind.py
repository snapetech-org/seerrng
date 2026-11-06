#!/usr/bin/env python3
import hashlib,json,re
from pathlib import Path

def h(b): return hashlib.sha256(b).hexdigest()
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x]
def req(x,m):
    if not x: raise SystemExit('FAIL: '+m)
root=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3560-3579-primary-20261103/candidate-free-input')
out=Path(__file__).resolve().parent
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
window=json.loads((root/'window.json').read_text(encoding='utf-8'))
sources=jl(root/'source-cells.jsonl'); cells=jl(root/'current-target-cells.jsonl'); contexts=jl(root/'caller-contexts.jsonl')
ledger=jl(out/'blind-ledger.jsonl')
req(len(ledger)==240,'ledger count')
source_by_pos={x['position']:x for x in sources}; cell_by={(x['position'],x['locale']):x for x in cells}; context_by={x['position']:x for x in contexts}
expected={(p,l) for p in range(3560,3580) for l in window['localeOrder']}
actual={(x['position'],x['locale']) for x in ledger}
req(actual==expected and len(actual)==len(ledger),'ledger unique complete coverage')
counts={'propose':0,'retain':0,'hold':0}
ph_re=re.compile(r'\{[A-Za-z][A-Za-z0-9_]*\}')
num_re=re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?')
for r in ledger:
    key=(r['position'],r['locale']); c=cell_by[key]; s=source_by_pos[key[0]]; ctx=context_by[key[0]]
    d=r['disposition']; req(d in counts,'disposition '+str(key)); counts[d]+=1
    req(r['sourceId']==s['sourceId']==c['sourceId'],'source ID '+str(key))
    req(r['sourceText']==s['source']==c['source'],'source text '+str(key))
    req(r['sourceTextSha256']==s['sourceSha256']==c['sourceSha256']==h(r['sourceText'].encode()),'source hash '+str(key))
    req(r['sourceIdSha256']==s['sourceIdSha256']==h(r['sourceId'].encode()),'source ID hash '+str(key))
    req(r['sourceKeySha256']==h(r['sourceKey'].encode()),'source key hash '+str(key))
    req(r['currentTarget']==c['currentTarget'],'current target readback '+str(key))
    req(r['currentTargetSha256']==c['currentTargetSha256']==h(r['currentTarget'].encode()),'current target hash '+str(key))
    req(r['targetSha256']==h(r['target'].encode()),'review target hash '+str(key))
    if d in ('retain','hold'): req(r['target']==r['currentTarget'],'unchanged disposition '+str(key))
    req(ph_re.findall(r['sourceText'])==ph_re.findall(r['target']),'placeholder safety '+str(key))
    req(c['sourceMarkupTokens']==c['currentTargetMarkupTokens'],'input markup tokens '+str(key))
    req(c['sourceNumericTokens']==c['currentTargetNumericTokens'],'input numeric tokens '+str(key))
    req(c['sourceProtectedLiterals']==c['currentTargetProtectedLiterals'],'input protected tokens '+str(key))
    for token in c['sourceProtectedLiterals']: req(token in r['target'],'protected literal '+token+' '+str(key))
    req(not c['placeholderTokenMismatch'],'placeholder flags '+str(key))
    ref=r['callerContextRef']
    req(ref['sourceContextPosition']==ctx['position'] and ref['namespace']==ctx['namespace'],'caller context linkage '+str(key))
    req(ref['directMessageReferences']==ctx['directMessageReferences'],'direct caller refs '+str(key))
    req([x['contextId'] for x in ref['contextBlocks']]==ctx['contextBlockIds'],'caller block IDs '+str(key))
proposal_keys={(3560,'ar'),(3565,'ar'),(3567,'pt_BR'),(3567,'ko'),(3573,'vi')}
req({(r['position'],r['locale']) for r in ledger if r['disposition']=='propose'}==proposal_keys,'proposal set')
req(counts=={'propose':5,'retain':235,'hold':0},'decision totals')
att=json.loads((out/'PR-attestation-final.json').read_text(encoding='utf-8'))
req(att['head']==manifest['head'] and att['tree']==manifest['tree'],'final PR attestation')
req(att['branchRef']==manifest['head'] and att['pullRef']==manifest['head'] and att['state']=='OPEN' and att['isDraft'],'live refs/state')
summary=json.loads((out/'summary.json').read_text(encoding='utf-8'))
req(summary['counts']==counts and summary['input']['manifestSha256']==h((root/'manifest.json').read_bytes()),'summary')
for line in (out/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    digest,name=line.split('  ',1); req(h((out/name).read_bytes())==digest,'output checksum '+name)
req((out/'SHA256SUMS.sha256').read_text().strip()==h((out/'SHA256SUMS.txt').read_bytes()),'checksum-list checksum')
print(json.dumps({'status':'PASS','cells':len(ledger),'counts':counts,'ledgerSha256':h((out/'blind-ledger.jsonl').read_bytes()),'outputChecksumListSha256':h((out/'SHA256SUMS.txt').read_bytes()),'inputChecksumListSha256':h((root/'SHA256SUMS.txt').read_bytes())},indent=2))
