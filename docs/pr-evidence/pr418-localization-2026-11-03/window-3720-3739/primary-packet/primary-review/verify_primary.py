#!/usr/bin/env python3
"""Portable verifier for the SeerrNG PR #418 W3720-W3739 primary review."""
import argparse,collections,hashlib,json,re
from pathlib import Path
HEAD='1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e'
TREE='6a51f3fb1d1f65c12bfe82bf47834626aa364488'
WINDOW='W3720-W3739'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def fail(s): raise SystemExit('FAIL: '+s)
def sums(d):
 seen=set()
 for line in (d/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  m=re.fullmatch(r'([0-9a-f]{64})  (.+)',line)
  if not m: fail('malformed checksum line')
  h,name=m.groups()
  if name in seen or Path(name).is_absolute() or '..' in Path(name).parts: fail('duplicate or unsafe checksum path')
  seen.add(name)
  p=d/name
  if not p.is_file() or sha(p.read_bytes())!=h: fail('checksum mismatch: '+name)
 return seen
def token_signature(text):
 placeholders=re.findall(r'\{([A-Za-z_][A-Za-z0-9_.]*)\}',text)
 plural={}
 for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*plural\s*,(.*?)\}',text,re.S):
  plural[m.group(1)]=re.findall(r'(?<![\w-])(zero|one|two|few|many|other)\s*\{',m.group(2))
 markup=re.findall(r'</?[A-Za-z][^>]*>',text)
 nums=re.findall(r'\d+(?:[.,]\d+)*',text)
 return {'placeholders':placeholders,'icuPluralCategories':plural,'markup':markup,'numericTokens':nums,'numericValues':nums}
def checks(source,current,target,required):
 s=token_signature(source); c=token_signature(current); t=token_signature(target)
 return {'placeholders':{'source':s['placeholders'],'current':c['placeholders'],'selected':t['placeholders'],'selectedMatchesSource':t['placeholders']==s['placeholders']},'icuPluralCategories':{'source':s['icuPluralCategories'],'current':c['icuPluralCategories'],'selected':t['icuPluralCategories'],'selectedMatchesSource':t['icuPluralCategories']==s['icuPluralCategories']},'markup':{'source':s['markup'],'current':c['markup'],'selected':t['markup'],'selectedMatchesSource':t['markup']==s['markup']},'numeric':{'sourceTokens':s['numericTokens'],'sourceValues':s['numericValues'],'currentTokens':c['numericTokens'],'currentValues':c['numericValues'],'selectedTokens':t['numericTokens'],'selectedValues':t['numericValues'],'selectedMatchesSource':t['numericTokens']==s['numericTokens'] and t['numericValues']==s['numericValues']},'protectedLiterals':{'required':required,'currentPresent':[x for x in required if x in current],'selectedPresent':[x for x in required if x in target],'selectedMatchesAllRequired':[x for x in required if x in target]==required}}
def verify(inp,out):
 inp=inp.resolve(); out=out.resolve()
 im=json.loads((inp/'manifest.json').read_text(encoding='utf-8'))
 if (im['head'],im['tree'],im['window'],im['cellCount'])!=(HEAD,TREE,WINDOW,240): fail('candidate-free input pin mismatch')
 input_sums=sums(inp)
 if input_sums!={x['path'] for x in im['files']}|{'manifest.json'}: fail('candidate-free checksum inventory mismatch')
 for f in im['files']:
  p=inp/f['path']
  if not p.is_file() or sha(p.read_bytes())!=f['sha256'] or p.stat().st_size!=f['byteCount']: fail('input manifest mismatch '+f['path'])
 om=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
 if (om['head'],om['tree'],om['window'],om['range'],om['cellCount'],om['pullRequest'])!=(HEAD,TREE,WINDOW,[3720,3739],240,418): fail('primary manifest pin/count mismatch')
 if om['inputManifestSha256']!=sha((inp/'manifest.json').read_bytes()): fail('primary is not pinned to this input manifest')
 output_sums=sums(out)
 if output_sums!={x['path'] for x in om['files']}|{'manifest.json'}: fail('primary checksum inventory mismatch')
 for f in om['files']:
  p=out/f['path']
  if not p.is_file() or sha(p.read_bytes())!=f['sha256'] or p.stat().st_size!=f['byteCount']: fail('output manifest mismatch '+f['path'])
 cells=jl(inp/'current-target-cells.jsonl'); ledger=jl(out/'primary-ledger.jsonl')
 ctx={r['sourceId']:r for r in jl(inp/'caller-contexts.jsonl')}
 blocks={r['contextId']:r for r in jl(inp/'caller-context-blocks.jsonl')}
 if len(cells)!=240 or len(ledger)!=240 or len(ctx)!=20: fail('row count mismatch')
 expected=[(p,l) for p in range(3720,3740) for l in LOCALES]
 if [(r['position'],r['locale']) for r in cells]!=expected or [(r['position'],r['locale']) for r in ledger]!=expected: fail('row coverage/order mismatch')
 bykey={(r['position'],r['locale']):r for r in cells}
 counts={k:0 for k in ['accept-current','correction','refinement','hold']}
 baseline_flags=0; token_failures=0; protected_failures=0
 for row in ledger:
  key=(row['position'],row['locale']); c=bykey[key]
  for field in ['position','locale','localeTag','sourceId','sourceIdSha256','sourceKey','source','sourceSha256','currentTarget','currentTargetSha256','catalogPath','catalogSha256','catalogGitBlob']:
   if row.get(field)!=c.get(field): fail('input pin/content mismatch '+str(key)+':'+field)
  if st(row['source'])!=row['sourceSha256'] or st(row['currentTarget'])!=row['currentTargetSha256'] or st(row['selectedTarget'])!=row['selectedTargetSha256']: fail('target/source hash mismatch '+str(key))
  d=row['decision']
  if d not in counts: fail('unknown decision '+str(key))
  counts[d]+=1
  if d=='accept-current' and row['selectedTarget']!=row['currentTarget']: fail('accept-current changed text '+str(key))
  if d in {'correction','refinement'} and row['selectedTarget']==row['currentTarget']: fail('edit decision has no change '+str(key))
  if d=='hold' and row['selectedTarget']!=row['currentTarget']: fail('hold changed text '+str(key))
  if row['confidence'] not in {'high','moderate','low'} or not row['rationale'].strip(): fail('missing rationale/confidence '+str(key))
  cx=ctx[row['sourceId']]; cc=row['callerContext']
  if cc['contextBlockIds']!=cx['contextBlockIds'] or cc['directMessageReferences']!=cx['directMessageReferences'] or cc['dynamicRendererReferences']!=cx['dynamicRendererReferences']: fail('caller provenance mismatch '+str(key))
  defs=[]; callers=[]
  for bid in cx['contextBlockIds']:
   b=blocks[bid]; item={'contextId':bid,'contextType':b['contextType'],'path':b['path'],'startLine':b['startLine'],'endLine':b['endLine'],'lines':b['lines']}
   if b['contextType']=='message-definition': defs.append(item)
   elif b['contextType']=='direct-message-property-reference': callers.append(item)
  if cc['definitionEvidence']!=defs or cc['directCallerEvidence']!=callers: fail('caller blocks mismatch '+str(key))
  if cx['callerCount']<1: fail('selected cell has no direct caller '+str(key))
  diag={'placeholderTokenMismatch':c['placeholderTokenMismatch'],'placeholderTokenSequenceMismatch':c['placeholderTokenSequenceMismatch'],'icuPluralCategorySetDifference':c['icuPluralCategorySetDifference'],'markupTokenMismatch':c['markupTokenMismatch'],'numericTokenMismatch':c['numericTokenMismatch'],'protectedLiteralMismatch':c['protectedLiteralMismatch']}
  if row['baselineDiagnostics']!=diag: fail('baseline diagnostic mismatch '+str(key))
  baseline_flags+=c['protectedLiteralMismatch']
  t=checks(c['source'],c['currentTarget'],row['selectedTarget'],c['sourceProtectedLiterals'])
  if row['tokenChecks']!=t: fail('token evidence mismatch '+str(key))
  token_failures+=not all(t[k]['selectedMatchesSource'] for k in ['placeholders','icuPluralCategories','markup','numeric'])
  protected_failures+=not t['protectedLiterals']['selectedMatchesAllRequired']
 summary=json.loads((out/'summary.json').read_text(encoding='utf-8'))
 if counts!=summary['decisionCounts']: fail('decision counts mismatch')
 if sum(counts[k] for k in ['correction','refinement'])!=summary['selectedChanges']: fail('selected change count mismatch')
 if baseline_flags!=summary['baselineProtectedLiteralFlags'] or token_failures!=summary['selectedTokenCheckFailures'] or protected_failures!=summary['selectedProtectedLiteralFailures']: fail('summary token counts mismatch')
 if token_failures or protected_failures: fail('selected target token/protected literal failure')
 carries=jl(inp/'carry-forward-hold-hashes.jsonl')
 lineage={(r['position'],r['locale'],r['sourceId']):r for r in jl(inp/'lineage/prior-hold-application-reattestation.jsonl')}
 carryout=jl(out/'carried-holds-reattestation.jsonl')
 if len(carries)!=12 or len(carryout)!=12: fail('carried hold count mismatch')
 cm={(r['position'],r['locale'],r['sourceId']):r for r in carries}
 for x in carryout:
  k=(x['position'],x['locale'],x['sourceId']); a=cm.get(k); b=lineage.get(k)
  if not a or not b or not x['hashesAgree']: fail('carried hold lineage missing/mismatch '+str(k))
  if len({a['priorTargetSha256'],b['previousApplicationTargetSha256'],a['currentTargetSha256'],x['currentTargetSha256']})!=1: fail('carried hold hash mismatch '+str(k))
  if x['targetTextIncluded'] is not False: fail('carried hold target text included')
 if (summary['nativeSpeakerReviewPerformed'],summary['browserReviewPerformed'])!=(False,False): fail('review limits metadata mismatch')
 print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':len(ledger),'decisionCounts':counts,'selectedChanges':summary['selectedChanges'],'carriedHolds':len(carryout),'baselineProtectedLiteralFlags':baseline_flags,'selectedTokenFailures':token_failures,'selectedProtectedLiteralFailures':protected_failures,'inputFilesVerified':len(input_sums),'outputFilesVerified':len(output_sums)},indent=2))
if __name__=='__main__':
 ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args(); verify(a.input,a.output)
