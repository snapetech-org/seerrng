#!/usr/bin/env python3
import hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
INPUT=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3820-candidate-free-20261104/candidate-free-input')
HEAD='6c489a64782d31fee70a6aeef386c88527b33083'
TREE='9bbf55986a34e9a2bc0c4027205927df65f8754b'
WINDOW='W3820-W3839'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def j(root,name):return json.loads((root/name).read_text(encoding='utf-8'))
def jl(root,name):return [json.loads(x) for x in (root/name).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):
 ph=re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s); tags=re.findall(r'<\/?[A-Za-z][^>]*>',s); nums=re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s)
 pat=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])'
 prot=[]
 for x in re.findall(pat,s):
  if x not in prot:prot.append(x)
 return {'placeholders':ph,'markupTags':tags,'numericTokens':nums,'protectedLiterals':prot}
def match(kind,source,target):
 if kind=='protectedLiterals':return all(x in target for x in source)
 return source==target
def packet_checks(root):
 sums={}
 for line in (root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  d,n=line.split(None,1); sums[n.lstrip('* ')]=d
 actual={p.name for p in root.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
 assert set(sums)==actual
 for n,d in sums.items():assert sha((root/n).read_bytes())==d,n
 return len(sums)
# The input packet is reverified from its exact pinned directory.
assert packet_checks(INPUT)==23
iv=subprocess.run(['python3',str(INPUT/'verify-candidate-free.py')],capture_output=True,text=True,check=True)
input_result=json.loads(iv.stdout); assert input_result['result']=='PASS'
im=j(INPUT,'manifest.json'); assert im['head']==HEAD and im['tree']==TREE and im['window']==WINDOW and im['cellCount']==240
summary=j(O,'summary.json'); manifest=j(O,'manifest.json')
assert summary['head']==HEAD and summary['tree']==TREE and summary['window']==WINDOW and summary['cellCount']==240
assert summary['inputManifestSha256']==sha((INPUT/'manifest.json').read_bytes())
assert summary['inputChecksumListSha256']==sha((INPUT/'SHA256SUMS.txt').read_bytes())
# Verify every output file checksum and exact manifest inventory.
assert packet_checks(O)==len(manifest['fileNames'])+1
assert set(manifest['fileNames'])=={p.name for p in O.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt')}
sources=jl(INPUT,'selected-source-cells.jsonl'); cells=jl(INPUT,'current-target-cells.jsonl')
contexts=jl(INPUT,'caller-contexts.jsonl'); blocks=jl(INPUT,'caller-context-blocks.jsonl')
source_by_pos={x['position']:x for x in sources}; context_by_pos={x['position']:x for x in contexts}
block_by_id={x['contextId']:x for x in blocks}; cell_by_key={(x['position'],x['locale']):x for x in cells}
rows=jl(O,'primary-ledger.jsonl'); assert len(rows)==240
assert [(x['position'],x['locale']) for x in rows]==[(p,l) for p in range(3820,3840) for l in LOCALES]
assert len({(x['position'],x['locale']) for x in rows})==240
counts=Counter(); locale_counts={loc:Counter() for loc in LOCALES}; baseline=Counter(); reviewed=Counter(); confidence=Counter()
for r in rows:
 pos,loc=r['position'],r['locale']; s=source_by_pos[pos]; ctx=context_by_pos[pos]; cell=cell_by_key[(pos,loc)]
 assert r['window']==WINDOW and r['sourceId']==s['sourceId'] and r['sourceText']==s['sourceText'] and r['sourceTextSha256']==s['sourceTextSha256']
 assert r['currentTarget']==cell['currentTarget'] and r['currentTargetSha256']==cell['currentTargetSha256'] and r['currentTargetSha256']==shat(r['currentTarget'])
 assert r['callerContextSha256']==ctx['callerContextSha256']
 defblock=next(block_by_id[x] for x in ctx['contextBlockIds'] if block_by_id[x]['contextType']=='message-definition')
 expected_context={'sha256':ctx['callerContextSha256'],'namespace':ctx['namespace'],'namespaceFiles':ctx['namespaceFiles'],'definitionBlock':defblock,'directMessageReferences':ctx['directMessageReferences'],'dynamicRendererReferences':ctx['dynamicRendererReferences']}
 assert r['callerContextEvidence']==expected_context
 assert r['disposition'] in ('accept-current','correction','refinement','hold')
 assert isinstance(r['rationale'],str) and r['rationale'].strip()
 assert r['confidence'] in ('high','moderate','low','unknown')
 assert r['reviewedTarget']==(r['proposedTarget'] if r['disposition'] in ('correction','refinement') else r['currentTarget'])
 assert r['reviewedTargetSha256']==shat(r['reviewedTarget'])
 if r['disposition']=='accept-current':
  assert r['proposedTarget'] is None and r['proposedTargetSha256'] is None
 else:
  assert isinstance(r['proposedTarget'],str) and r['proposedTarget'].strip() and r['proposedTarget']!=r['currentTarget']
  assert r['proposedTargetSha256']==shat(r['proposedTarget'])
 st=tokens(s['sourceText']); ct=tokens(r['currentTarget']); rt=tokens(r['reviewedTarget'])
 expected={}
 for k in ('placeholders','markupTags','numericTokens','protectedLiterals'):
  cm=match(k,st[k],ct[k]); rm=match(k,st[k],rt[k])
  expected[k]={'source':st[k],'current':ct[k],'reviewed':rt[k],'currentMatchesSource':cm,'reviewedMatchesSource':rm}
  if not cm:baseline[k]+=1
  if not rm:reviewed[k]+=1
 assert r['tokenIntegrity']==expected
 assert all(x['reviewedMatchesSource'] for x in expected.values())
 counts[r['disposition']]+=1; locale_counts[loc][r['disposition']]+=1; confidence[r['confidence']]+=1
assert counts==Counter({'accept-current':220,'refinement':13,'correction':7})
assert baseline==Counter({'protectedLiterals':2}) and reviewed==Counter()
assert counts['hold']==0
assert summary['dispositionCounts']=={k:counts.get(k,0) for k in ('accept-current','correction','refinement','hold')}
assert summary['changedCells']==20 and summary['holds']==0
assert summary['baselineTokenMismatchCounts']=={k:baseline.get(k,0) for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
assert summary['reviewedTokenMismatchCounts']=={k:reviewed.get(k,0) for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
assert summary['confidenceCounts']==dict(sorted(confidence.items()))
assert summary['protectedLiteralMismatchesResolved']==2
assert summary['dispositionCountsByLocale']=={loc:{k:locale_counts[loc].get(k,0) for k in ('accept-current','correction','refinement','hold')} for loc in LOCALES}
assert summary['inputCandidateFreeVerifierResult']=='PASS' and summary['otherProposalLedgersInspected'] is False
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'window':WINDOW,'cells':len(rows),'dispositions':dict(counts),'baselineTokenMismatches':dict(baseline),'reviewedTokenMismatches':dict(reviewed),'candidateFreeInputVerifier':'PASS','checksums':len(manifest['fileNames'])+1},ensure_ascii=False,indent=2))
