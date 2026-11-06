#!/usr/bin/env python3
from pathlib import Path
from collections import Counter
import hashlib, json, re, subprocess, sys
T=Path(__file__).resolve().parent
I=T/'candidate-free-input'
O=T/'primary-review'
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode('utf-8')).hexdigest()
def readj(p): return json.loads(p.read_text(encoding='utf-8'))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def icu(s):
 out=[]; i=0
 while i<len(s):
  if s[i]!='{': i+=1; continue
  start=i; depth=1; k=i+1
  while k<len(s) and depth:
   if s[k]=='{': depth+=1
   elif s[k]=='}': depth-=1
   k+=1
  if depth: break
  body=s[start+1:k-1]; m=HEADER.match(body)
  if m:
   name,fmt=m.group(1),m.group(2); cats=[]
   if fmt in ('plural','select','selectordinal'): cats=[x.group(1) for x in CAT.finditer(body[m.end():])]
   out.append({'name':name,'formatter':fmt or None,'pluralCategories':cats})
  i=k
 return out
def catmap(ts): return {x['name']:sorted(x['pluralCategories']) for x in ts if x['pluralCategories']}
def sig(ts): return Counter((x['name'],x['formatter']) for x in ts)
def protected(s): return [x for x in PROTECTED if x in s]
cf=subprocess.run([sys.executable,str(T/'verify_candidate_free.py')],capture_output=True,text=True)
assert cf.returncode==0,cf.stdout+cf.stderr
cf_result=json.loads(cf.stdout)
im=readj(I/'manifest.json'); iw=readj(I/'window.json')
m=readj(O/'manifest.json'); summary=readj(O/'summary.json')
assert (m['repository'],m['pullRequest'],m['window'],m['range'],m['head'],m['tree'])==(im['repository'],418,'W3660-W3679',[3660,3679],im['head'],im['tree'])
assert (summary['head'],summary['tree'],summary['window'],summary['cellCount'])==(m['head'],m['tree'],m['window'],240)
assert m['candidateFreeInputManifestSha256']==sha((I/'manifest.json').read_bytes())
assert m['candidateFreeInputChecksumListSha256']==sha((I/'SHA256SUMS.txt').read_bytes())
assert m['candidateFreeVerifier']=='PASS'
actual={p.relative_to(O).as_posix():p for p in O.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
mf={x['path']:x for x in m['files']}
assert set(mf)==set(actual)-{'manifest.json'}
for name,p in actual.items():
 if name=='manifest.json': continue
 assert sha(p.read_bytes())==mf[name]['sha256'] and p.stat().st_size==mf[name]['byteCount'],name
listed={}
for line in (O/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 d,n=line.split(None,1); listed[n.strip().lstrip('*')]=d
assert set(listed)==set(actual)
for name,p in actual.items(): assert sha(p.read_bytes())==listed[name],name
sources=readjl(I/'source-cells.jsonl'); cells=readjl(I/'current-target-cells.jsonl')
contexts=readjl(I/'caller-contexts.jsonl'); blocks=readjl(I/'caller-context-blocks.jsonl')
rows=readjl(O/'primary-ledger.jsonl')
assert len(sources)==20 and len(cells)==len(rows)==240 and len(contexts)==20
src={x['position']:x for x in sources}; current={(x['position'],x['locale']):x for x in cells}
context={(x['position'],x['sourceId']):x for x in contexts}; seen=set()
counts=Counter(); confidence=Counter(); sequence=[]
for r in rows:
 k=(r['position'],r['locale']); assert k not in seen; seen.add(k)
 s=src[k[0]]; c=current[k]; cx=context[(k[0],s['sourceId'])]
 assert (r['repository'],r['pullRequest'],r['window'],r['head'],r['tree'])==(im['repository'],418,im['window'],im['head'],im['tree'])
 for f in ('position','sourceId','sourceIdSha256','source','sourceSha256','namespace','sourceKey'):
  assert r[f]==s[f],(k,f)
 for f in ('locale','localeTag','catalogPath','catalogGitBlob','catalogSha256','currentTarget','currentTargetSha256'):
  assert r[f]==c[f],(k,f)
 assert r['callerResolution']==cx['callerResolution'] and r['directCallerCount']==cx['callerCount'] and r['callerless']==(cx['callerCount']==0)
 assert r['callerContextSha256']==sha(json.dumps(cx,ensure_ascii=False,sort_keys=True,separators=(',',':')))
 assert r['callerContextIds']==cx['contextBlockIds'] and not r['callerless']
 assert r['decision'] in ('accept-current','correction','refinement')
 assert r['rationale'] and r['confidence'] in ('high','moderate','low')
 counts[r['decision']]+=1; confidence[r['confidence']]+=1
 target=r.get('proposedTarget') if r['decision'] in ('correction','refinement') else r['currentTarget']
 if r['decision'] in ('correction','refinement'):
  assert isinstance(target,str) and target and target!=r['currentTarget'] and 'proposedTarget' in r
 else: assert 'proposedTarget' not in r
 assert r['reviewedTargetSha256']==sha(target)
 stoks=icu(r['source']); ctoks=icu(r['currentTarget']); rtoks=icu(target)
 s_nums=NUM.findall(r['source']); c_nums=NUM.findall(r['currentTarget']); r_nums=NUM.findall(target)
 required=protected(r['source']); missing=[x for x in required if x not in target]
 audit={'sourcePlaceholderTokens':stoks,'currentPlaceholderTokens':ctoks,'reviewedPlaceholderTokens':rtoks,
 'sourceCurrentPlaceholderMultisetMatches':sig(stoks)==sig(ctoks),'sourceReviewedPlaceholderMultisetMatches':sig(stoks)==sig(rtoks),
 'currentPlaceholderOrderDiffers':[x['name'] for x in ctoks]!=[x['name'] for x in stoks],
 'reviewedPlaceholderOrderDiffers':[x['name'] for x in rtoks]!=[x['name'] for x in stoks],
 'sourceIcuPluralCategories':catmap(stoks),'reviewedIcuPluralCategories':catmap(rtoks),
 'pluralCategoriesPreserved':catmap(stoks)==catmap(rtoks),
 'sourceMarkupTokens':MK.findall(r['source']),'reviewedMarkupTokens':MK.findall(target),
 'markupPreserved':MK.findall(r['source'])==MK.findall(target),
 'sourceNumericTokens':s_nums,'currentNumericTokens':c_nums,'reviewedNumericTokens':r_nums,
 'numericTokenSurfaceMatchesSource':s_nums==r_nums,'numericValuesMatchSource':s_nums==r_nums,
 'requiredProtectedLiterals':required,'preservedProtectedLiterals':protected(target),
 'missingProtectedLiterals':missing,'sourceLocale':r['locale'],'sourcePosition':r['position']}
 assert r['tokenAudit']==audit,(k,'token audit mismatch')
 assert audit['sourceCurrentPlaceholderMultisetMatches'] and audit['sourceReviewedPlaceholderMultisetMatches'],(k,'placeholder names/formatters')
 assert audit['pluralCategoriesPreserved'] and audit['markupPreserved'] and audit['numericTokenSurfaceMatchesSource'] and not missing,(k,'structural preservation')
 if audit['reviewedPlaceholderOrderDiffers']:
  sequence.append({'position':r['position'],'sourceId':r['sourceId'],'locale':r['locale'],'sourceOrder':[x['name'] for x in stoks],'currentOrder':[x['name'] for x in rtoks]})
assert seen==set(current)
assert counts==Counter({'accept-current':205,'correction':22,'refinement':13})
assert summary['decisionCounts']==dict(counts) and summary['confidenceCounts']==dict(confidence)
assert summary['baselineDiagnostics']=={'placeholderMultisetMismatchCount':0,'placeholderSequenceDifferenceCount':2,'pluralCategoryMismatchCount':0,'markupMismatchCount':0,'numericTokenSurfaceMismatchCount':0,'protectedLiteralMismatchCount':0}
assert summary['reviewedDiagnostics']=={'placeholderMultisetMismatchCount':0,'placeholderSequenceDifferenceCount':2,'pluralCategoryMismatchCount':0,'markupMismatchCount':0,'numericTokenSurfaceMismatchCount':0,'numericValueMismatchCount':0,'protectedLiteralMismatchCount':0}
assert summary['validPlaceholderReorderings']==sequence
carry=readjl(I/'carry-forward-hold-hashes.jsonl')
assert len(carry)==summary['carryForwardHoldCount']==12 and {x['position'] for x in carry}=={3632}
assert summary['candidateFreeInputVerified']=='PASS' and summary['nativeSpeakerReview']=='not performed' and summary['browserReview']=='not performed' and summary['crossAudit']=='not performed'
print(json.dumps({'result':'PASS','candidateFreeVerifier':'PASS','primaryVerifier':'PASS','head':m['head'],'tree':m['tree'],'range':m['range'],'cellCount':len(rows),'decisionCounts':dict(counts),'confidenceCounts':dict(confidence),'baselineDiagnostics':summary['baselineDiagnostics'],'reviewedDiagnostics':summary['reviewedDiagnostics'],'validPlaceholderReorderings':sequence,'carryForwardHolds':len(carry),'sealedFiles':len(listed)},ensure_ascii=False,indent=2))
