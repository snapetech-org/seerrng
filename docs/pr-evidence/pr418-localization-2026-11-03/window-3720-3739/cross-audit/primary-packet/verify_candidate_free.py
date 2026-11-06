#!/usr/bin/env python3
"""Verifier for the candidate-free SeerrNG PR #418 W3720-W3739 input."""
import argparse,collections,hashlib,json,re,subprocess
from pathlib import Path
HEAD='1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e'
TREE='6a51f3fb1d1f65c12bfe82bf47834626aa364488'
WINDOW='W3720-W3739'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
START,END=3720,3739
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\d)[+-]?\d+(?:[,. \u00a0\u202f]\d{3})*(?:%?)(?!\d)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def readj(p): return json.loads(p.read_text(encoding='utf-8'))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def fail(s): raise SystemExit('FAIL: '+s)
def git(repo,*args): return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()
def gitbytes(repo,*args): return subprocess.check_output(['git','-C',str(repo),*args])
def icu_tokens(text):
 out=[]; i=0
 while i<len(text):
  if text[i]!='{': i+=1; continue
  start=i; depth=1; k=i+1
  while k<len(text) and depth:
   if text[k]=='{': depth+=1
   elif text[k]=='}': depth-=1
   k+=1
  if depth: break
  body=text[start+1:k-1]; m=HEADER.match(body)
  if m:
   name,fmt=m.group(1),m.group(2); cats=[]
   if fmt in ('plural','select','selectordinal'): cats=[x.group(1) for x in CAT.finditer(body[m.end():])]
   out.append({'name':name,'formatter':fmt or None,'pluralCategories':cats})
  i=k
 return out
def catmap(ts): return {x['name']:sorted(x['pluralCategories']) for x in ts if x['pluralCategories']}
def num_values(s):
 s=re.sub(r'(?<!\w)(\d+)\s+mil\b',lambda m:str(int(m.group(1))*1000),s,flags=re.I)
 return [re.sub(r'\D','',x) for x in NUM.findall(s)]
def verify_sums(d):
 seen=set()
 for line in (d/'SHA256SUMS.txt').read_text().splitlines():
  if not line.strip(): continue
  m=re.fullmatch(r'([0-9a-f]{64})  (.+)',line)
  if not m: fail('malformed checksum line')
  h,name=m.groups()
  if name in seen or Path(name).is_absolute() or '..' in Path(name).parts: fail('duplicate/unsafe checksum path')
  seen.add(name)
  if sha((d/name).read_bytes())!=h: fail('checksum mismatch: '+name)
 return seen
def verify(input_dir,repo):
 inp=input_dir.resolve(); repo=repo.resolve()
 if git(repo,'rev-parse','HEAD')!=HEAD: fail('repository HEAD mismatch')
 if git(repo,'rev-parse','HEAD^{tree}')!=TREE: fail('repository tree mismatch')
 if git(repo,'status','--porcelain'): fail('repository worktree is not clean')
 m=readj(inp/'manifest.json')
 if (m.get('head'),m.get('tree'),m.get('window'),m.get('range'),m.get('cellCount'))!=(HEAD,TREE,WINDOW,[START,END],240): fail('manifest pin/window mismatch')
 sums=verify_sums(inp)
 expected={x['path'] for x in m['files']}|{'manifest.json'}
 if sums!=expected: fail('checksum inventory differs from manifest')
 for rec in m['files']:
  p=inp/rec['path']
  if not p.is_file() or sha(p.read_bytes())!=rec['sha256'] or p.stat().st_size!=rec['byteCount']: fail('manifest file mismatch: '+rec['path'])
 w=readj(inp/'window.json')
 if w['range']!=[START,END] or w['sourceOrderCount']!=9494 or w['cellCount']!=240 or w['localeOrder']!=LOCALES: fail('window metadata mismatch')
 if w['callerlessSourcePositions']: fail('unexpected callerless source in selected range')
 if w['baselineTokenDiagnostics']['placeholderMismatchCount'] or w['baselineTokenDiagnostics']['placeholderSequenceMismatchCount'] or w['baselineTokenDiagnostics']['icuPluralCategorySetDifferenceCount'] or w['baselineTokenDiagnostics']['markupMismatchCount'] or w['baselineTokenDiagnostics']['numericTokenMismatchCount']: fail('baseline structural diagnostics nonzero')
 pins=readj(inp/'file-pins.json')
 for rel,rec in pins['catalogFiles'].items():
  raw=gitbytes(repo,'show',f'{HEAD}:{rel}')
  if sha(raw)!=rec['sha256'] or git(repo,'rev-parse',f'{HEAD}:{rel}')!=rec['gitBlob']: fail('catalog pin mismatch: '+rel)
 for rel,rec in pins['runtimeFiles'].items():
  raw=gitbytes(repo,'show',f'{HEAD}:{rel}')
  if sha(raw)!=rec['sha256'] or git(repo,'rev-parse',f'{HEAD}:{rel}')!=rec['gitBlob']: fail('runtime pin mismatch: '+rel)
 english=json.loads(gitbytes(repo,'show',f'{HEAD}:src/i18n/locale/en.json'))
 keys=list(english)
 if len(keys)!=9494 or sha('\n'.join(keys).encode())!=w['sourceOrderSha256']: fail('source order pin mismatch')
 srcs=readjl(inp/'source-cells.jsonl'); order=readjl(inp/'source-order.jsonl'); cells=readjl(inp/'current-target-cells.jsonl')
 if len(srcs)!=20 or len(order)!=22 or len(cells)!=240: fail('source/order/cell count mismatch')
 if [x['position'] for x in srcs]!=list(range(START,END+1)) or [x['sourceId'] for x in srcs]!=keys[START:END+1]: fail('source range does not match English catalog order')
 if [x['position'] for x in order]!=list(range(START-1,END+2)): fail('boundary row coverage mismatch')
 if [x['sourceId'] for x in order]!=keys[START-1:END+2]: fail('boundary source order mismatch')
 if len(readjl(inp/'prior-selection-exclusions.jsonl'))!=START: fail('prior selection exclusion count mismatch')
 expected_cells=[(p,l) for p in range(START,END+1) for l in LOCALES]
 if [(x['position'],x['locale']) for x in cells]!=expected_cells: fail('cell ordering/coverage mismatch')
 by_source={x['position']:x for x in srcs}
 for s in srcs:
  if s['source']!=english[s['sourceId']] or s['sourceSha256']!=st(s['source']) or s['sourceId']!=keys[s['position']]: fail('source hash/content mismatch')
  if s['sourceIdSha256']!=st(s['sourceId']): fail('source id hash mismatch')
 ctxs={x['sourceId']:x for x in readjl(inp/'caller-contexts.jsonl')}
 blocks={x['contextId']:x for x in readjl(inp/'caller-context-blocks.jsonl')}
 if len(ctxs)!=20: fail('caller context coverage mismatch')
 for sid,cx in ctxs.items():
  if cx['head']!=HEAD or cx['tree']!=TREE or cx['callerCount']<1 or not cx['contextBlockIds']: fail('caller context missing or unpinned: '+sid)
  for ref in cx['directMessageReferences']+cx['dynamicRendererReferences']:
   content=gitbytes(repo,'show',f'{HEAD}:{ref["path"]}').decode().splitlines()
   n=ref['line']
   if n<1 or n>len(content) or content[n-1]!=ref['text'] or st(content[n-1])!=ref['lineSha256']: fail('caller line mismatch: '+sid)
  for bid in cx['contextBlockIds']:
   if bid not in blocks: fail('caller block reference missing: '+bid)
 for block in blocks.values():
  if 'path' in block:
   content=gitbytes(repo,'show',f'{HEAD}:{block["path"]}').decode().splitlines()
   for line in block.get('lines',[]):
    n=line['line']
    if content[n-1]!=line['text'] or st(content[n-1])!=line['lineSha256']: fail('context block line mismatch: '+block['contextId'])
  for ref in block.get('references',[]):
   content=gitbytes(repo,'show',f'{HEAD}:{ref["path"]}').decode().splitlines(); n=ref['line']
   if content[n-1]!=ref['text'] or st(content[n-1])!=ref['lineSha256']: fail('route context mismatch: '+block['contextId'])
 catalog_values={}
 for locale in LOCALES:
  catalog_values[locale]=json.loads(gitbytes(repo,'show',f'{HEAD}:src/i18n/locale/{locale}.json'))
 token_failures=0
 for c in cells:
  p,l=c['position'],c['locale']; s=by_source[p]; key=s['sourceId']; target=c['currentTarget']
  if c['sourceId']!=key or c['source']!=s['source'] or c['sourceSha256']!=s['sourceSha256']: fail('cell/source mismatch')
  if target!=catalog_values[l].get(key) or c['currentTargetSha256']!=st(target): fail('current target hash/content mismatch')
  if 'selectedTarget' in c or 'disposition' in c or c.get('reviewStatus')!='unreviewed': fail('candidate-free cell contains review output')
  stokens=icu_tokens(s['source']); ttokens=icu_tokens(target)
  tests={'placeholderTokenMismatch':collections.Counter([(x['name'],x['formatter']) for x in stokens])!=collections.Counter([(x['name'],x['formatter']) for x in ttokens]),'placeholderTokenSequenceMismatch':[(x['name'],x['formatter']) for x in stokens]!=[(x['name'],x['formatter']) for x in ttokens],'icuPluralCategorySetDifference':catmap(stokens)!=catmap(ttokens),'markupTokenMismatch':MK.findall(s['source'])!=MK.findall(target),'numericTokenMismatch':num_values(s['source'])!=num_values(target),'protectedLiteralMismatch':any(x not in target for x in [x for x in PROTECTED if x in s['source']])}
  if any(c[k]!=v for k,v in tests.items()): fail('independent token diagnostic mismatch')
  token_failures+=sum(tests.values())
 if token_failures!=1: fail('expected exactly one baseline protected-literal finding')
 findings=readj(inp/'baseline-protected-literal-findings.json')
 if findings['count']!=1 or findings['rows'][0]['position']!=3724 or findings['rows'][0]['locale']!='hi' or findings['rows'][0]['missingLiterals']!=['IP']: fail('protected literal finding mismatch')
 prev=readj(inp/'lineage/prior-window.json')
 prior=readjl(inp/'lineage/prior-window-selection-reattestation.jsonl')
 if len(prior)!=240: fail('prior application reattestation count mismatch')
 app_rows=readjl(repo/'docs/pr-evidence/pr418-localization-2026-11-03/window-3700-3719/application-ledger.jsonl')
 if sha((repo/'docs/pr-evidence/pr418-localization-2026-11-03/window-3700-3719/application-ledger.jsonl').read_bytes())!=prev['applicationLedgerSha256']: fail('prior application ledger pin mismatch')
 appmap={(x['position'],x['locale'],x['sourceId']):x for x in app_rows}
 for row in prior:
  k=(row['position'],row['locale'],row['sourceId']); a=appmap.get(k)
  if not a or not row['matches'] or row['targetTextIncluded'] is not False: fail('prior application lineage mismatch')
  if row['currentTargetSha256']!=a['selectedTargetSha256'] or row['previousAppliedTargetSha256']!=a['selectedTargetSha256']: fail('prior applied target hash mismatch')
 holds=readjl(inp/'carry-forward-hold-hashes.jsonl')
 appholds=readjl(repo/'docs/pr-evidence/pr418-localization-2026-11-03/window-3700-3719/carried-holds.jsonl')
 hm={(x['position'],x['locale'],x['sourceId']):x for x in appholds}
 if len(holds)!=12 or len(appholds)!=12: fail('hold count mismatch')
 for h in holds:
  a=hm[(h['position'],h['locale'],h['sourceId'])]
  current=catalog_values[h['locale']][h['sourceId']]
  if st(current)!=h['currentTargetSha256'] or h['currentTargetSha256']!=h['priorTargetSha256'] or h['currentTargetSha256']!=h['previousApplicationTargetSha256'] or a['targetSha256']!=h['currentTargetSha256']: fail('carried hold hash mismatch')
 att=readj(inp/'PR-attestation.json')
 if (att['head'],att['tree'],att['state'],att['isDraft'])!=(HEAD,TREE,'OPEN',True): fail('PR attestation mismatch')
 print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'sources':len(srcs),'cells':len(cells),'directCallerRows':sum(x['callerCount'] for x in ctxs.values()),'callerless':0,'baselineProtectedLiteralFindings':findings['count'],'priorSelectionsReattested':len(prior),'carriedHolds':len(holds),'pinnedCatalogs':len(pins['catalogFiles']),'pinnedRuntimeFiles':len(pins['runtimeFiles']),'inputChecksums':len(sums)},indent=2))
if __name__=='__main__':
 ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--repo',type=Path,required=True); a=ap.parse_args(); verify(a.input,a.repo)
