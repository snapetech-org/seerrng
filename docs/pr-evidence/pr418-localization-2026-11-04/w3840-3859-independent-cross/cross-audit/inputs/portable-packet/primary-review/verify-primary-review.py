#!/usr/bin/env python3
import hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
INPUT=O.parent/'candidate-free-input'
HEAD='ba5bb93cdb4f107a8337aae228b7cd397e1140a6'
TREE='5420ae8fa33bda3619650757a2930a0114dbe4d1'
WINDOW='W3840-W3859'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode('utf-8'))
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(root,name): return json.loads((root/name).read_text(encoding='utf-8'))
def jl(root,name): return [json.loads(x) for x in (root/name).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
    ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s)
    tags=re.findall(r'<\/?[A-Za-z][^>]*>',s)
    nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
    pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
    prot=[]
    for x in re.findall(pat,s):
        if x not in prot: prot.append(x)
    return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
def matches(kind,source,target):
    if kind=='protectedLiterals': return all(x in target for x in source)
    return source==target
def packet_checks(root):
    sums={}
    for line in (root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        digest,name=line.split(None,1); sums[name.lstrip('* ')]=digest
    actual={p.name for p in root.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
    assert set(sums)==actual,(root,set(sums)^actual)
    for name,digest in sums.items(): assert sha((root/name).read_bytes())==digest,name
    return len(sums)
assert packet_checks(INPUT)==len(j(INPUT,'manifest.json')['fileNames'])+1
iv=subprocess.run(['python3',str(INPUT/'verify-candidate-free.py')],capture_output=True,text=True,check=True)
input_result=json.loads(iv.stdout)
assert input_result['result']=='PASS' and input_result['head']==HEAD and input_result['tree']==TREE
im=j(INPUT,'manifest.json')
assert im['window']=='W3840-W3859' and im['range']==[3840,3859] and im['cellCount']==240
summary=j(O,'summary.json'); manifest=j(O,'manifest.json')
assert summary['head']==HEAD and summary['tree']==TREE and summary['window']==WINDOW and summary['cellCount']==240
assert summary['inputManifestSha256']==sha((INPUT/'manifest.json').read_bytes())
assert summary['inputChecksumListSha256']==sha((INPUT/'SHA256SUMS.txt').read_bytes())
assert packet_checks(O)==len(manifest['fileNames'])+1
assert set(manifest['fileNames'])=={p.name for p in O.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt')}
sources=jl(INPUT,'selected-source-cells.jsonl'); cells=jl(INPUT,'current-target-cells.jsonl')
contexts=jl(INPUT,'caller-contexts.jsonl'); blocks=jl(INPUT,'caller-context-blocks.jsonl')
sb={r['position']:r for r in sources}; cb={(r['position'],r['locale']):r for r in cells}
ctxb={r['position']:r for r in contexts}; blockb={r['contextId']:r for r in blocks}
rows=jl(O,'primary-ledger.jsonl')
assert len(rows)==240
assert [(r['position'],r['locale']) for r in rows]==[(p,l) for p in range(3840,3860) for l in LOCALES]
assert len({(r['position'],r['locale']) for r in rows})==240
counts=Counter(); byloc={l:Counter() for l in LOCALES}; confidence=Counter(); baseline=Counter(); reviewed=Counter(); mismatch_cells=[]
for r in rows:
    pos,loc=r['position'],r['locale']; s=sb[pos]; c=cb[(pos,loc)]; ctx=ctxb[pos]
    assert r['window']==WINDOW and r['sourceId']==s['sourceId'] and r['sourceText']==s['sourceText'] and r['sourceTextSha256']==s['sourceTextSha256']
    assert r['currentTarget']==c['currentTarget'] and r['currentTargetSha256']==c['currentTargetSha256']==shat(r['currentTarget'])
    assert r['callerContextSha256']==ctx['callerContextSha256']
    defblock=next(blockb[x] for x in ctx['contextBlockIds'] if blockb[x]['contextType']=='message-definition')
    expected_context={'sha256':ctx['callerContextSha256'],'namespace':ctx['namespace'],'namespaceFiles':ctx['namespaceFiles'],'definitionBlock':defblock,'directMessageReferences':ctx['directMessageReferences'],'dynamicRendererReferences':ctx['dynamicRendererReferences']}
    assert r['callerContextEvidence']==expected_context
    assert r['disposition'] in ('accept-current','correction','refinement','hold')
    assert isinstance(r['rationale'],str) and r['rationale'].strip()
    assert r['confidence'] in ('high','moderate','low','unknown')
    if r['disposition'] in ('accept-current','hold'):
        assert r['proposedTarget'] is None and r['proposedTargetSha256'] is None
        assert r['reviewedTarget']==r['currentTarget']
    else:
        assert isinstance(r['proposedTarget'],str) and r['proposedTarget'].strip() and r['proposedTarget']!=r['currentTarget']
        assert r['proposedTargetSha256']==shat(r['proposedTarget'])
        assert r['reviewedTarget']==r['proposedTarget']
    assert r['reviewedTargetSha256']==shat(r['reviewedTarget'])
    st=tokens(s['sourceText']); ct=tokens(r['currentTarget']); rt=tokens(r['reviewedTarget']); expected={}
    for k in ('placeholders','markupTags','numericTokens','protectedLiterals'):
        cm=matches(k,st[k],ct[k]); rm=matches(k,st[k],rt[k])
        expected[k]={'source':st[k],'current':ct[k],'reviewed':rt[k],'currentMatchesSource':cm,'reviewedMatchesSource':rm}
        if not cm: baseline[k]+=1
        if not rm: reviewed[k]+=1
    assert r['tokenIntegrity']==expected
    assert all(x['reviewedMatchesSource'] for x in expected.values())
    for k in ('placeholders','markupTags','numericTokens','protectedLiterals'):
        if not expected[k]['currentMatchesSource']:
            mismatch_cells.append({'position':pos,'sourceId':r['sourceId'],'locale':loc,'missing':[x for x in expected[k]['source'] if x not in expected[k]['current']],'disposition':r['disposition']})
    counts[r['disposition']]+=1; byloc[loc][r['disposition']]+=1; confidence[r['confidence']]+=1
proposals=jl(O,'proposals.jsonl'); holds=jl(O,'holds.jsonl')
expected_proposals=[r for r in rows if r['disposition'] in ('correction','refinement')]
expected_holds=[r for r in rows if r['disposition']=='hold']
assert [canon(r) for r in proposals]==[canon(r) for r in expected_proposals]
assert [canon(r) for r in holds]==[canon(r) for r in expected_holds]
assert all(r['proposedTarget'] is None and 'currentTarget' not in r and 'reviewedTarget' not in r for r in holds)
assert len(rows)==240 and counts['accept-current']+counts['correction']+counts['refinement']+counts['hold']==240
assert baseline==Counter({'protectedLiterals':3}) and reviewed==Counter()
assert mismatch_cells==summary['protectedLiteralBaselineMismatchCells']
assert summary['protectedLiteralMismatchesResolved']==3
assert summary['dispositionCounts']=={k:counts.get(k,0) for k in ('accept-current','correction','refinement','hold')}
assert summary['changedCells']==counts['correction']+counts['refinement'] and summary['holds']==counts['hold']
assert summary['dispositionCountsByLocale']=={loc:{k:byloc[loc].get(k,0) for k in ('accept-current','correction','refinement','hold')} for loc in LOCALES}
assert summary['confidenceCounts']==dict(sorted(confidence.items()))
assert summary['baselineTokenMismatchCounts']=={k:baseline.get(k,0) for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
assert summary['reviewedTokenMismatchCounts']=={k:reviewed.get(k,0) for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
assert summary['inputCandidateFreeVerifierResult']=='PASS' and summary['otherProposalLedgersInspected'] is False
assert summary['nativeSpeakerSignoff']=='not claimed'
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'window':WINDOW,'cells':len(rows),'dispositions':dict(counts),'proposals':len(proposals),'holds':len(holds),'baselineTokenMismatches':dict(baseline),'reviewedTokenMismatches':dict(reviewed),'candidateFreeInputVerifier':'PASS','checksums':len(manifest['fileNames'])+1},ensure_ascii=False,indent=2))
