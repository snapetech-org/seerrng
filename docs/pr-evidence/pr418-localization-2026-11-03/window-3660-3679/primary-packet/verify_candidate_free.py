#!/usr/bin/env python3
from pathlib import Path
import collections, hashlib, json, re, subprocess
T=Path(__file__).resolve().parent
R=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-apply-20261103/repo')
D=T/'candidate-free-input'
PREV=R/'docs/pr-evidence/pr418-localization-2026-11-03/window-3640-3659/candidate-free-input'
HEAD='eb279fc80be656f379cd893642bf741ba0a24d85'
TREE='85a73172719b38e99a4e74c0ef9a303164cb4fcb'
BRANCH='codex/seerrng-localization-overhaul-20261028'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
START,END=3660,3679
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def readj(p): return json.loads(p.read_text(encoding='utf-8'))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def run(args,cwd=None): return subprocess.run(args,cwd=cwd,check=True,capture_output=True,text=True).stdout.strip()
def show(path): return subprocess.run(['git','show',f'{HEAD}:{path}'],cwd=R,check=True,capture_output=True).stdout
def blob(path): return run(['git','rev-parse',f'{HEAD}:{path}'],R)
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
def sig(ts): return [(x['name'],x['formatter']) for x in ts]
def verify_sums(folder):
 for line in (folder/'SHA256SUMS.txt').read_text().splitlines():
  if not line.strip(): continue
  digest,name=line.split(None,1); name=name.strip().lstrip('*')
  assert sha((folder/name).read_bytes())==digest,(folder/name,'checksum')
assert run(['git','rev-parse','HEAD'],R)==HEAD
assert run(['git','rev-parse','HEAD^{tree}'],R)==TREE
assert not run(['git','status','--porcelain'],R)
pr=readj_run=run(['gh','pr','view','418','--repo','snapetech-org/SeerrNG','--json','number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url'])
pr=json.loads(pr)
assert (pr['number'],pr['state'],pr['isDraft'],pr['headRefName'],pr['headRefOid'],pr['baseRefName'])==(418,'OPEN',True,BRANCH,HEAD,'main')
refs=run(['git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{BRANCH}','refs/pull/418/head'])
assert {x.split()[1]:x.split()[0] for x in refs.splitlines()}=={f'refs/heads/{BRANCH}':HEAD,'refs/pull/418/head':HEAD}
assert run(['gh','api',f'repos/snapetech-org/seerrng/commits/{HEAD}','--jq','.commit.tree.sha'])==TREE
verify_sums(PREV)
prev=readj(PREV/'window.json')
prev_holds=readj(PREV/'lineage/hold-lineage.json')
assert prev['window']=='W3640-W3659' and prev['range']==[3640,3659] and prev['sourceOrderCount']==9494
assert len(prev_holds['carryForwardHoldRows'])==12
m=readj(D/'manifest.json'); w=readj(D/'window.json'); att=readj(D/'PR-attestation.json'); q=readj(D/'queue-status.json')
assert (m['repository'],m['pullRequest'],m['window'],m['range'],m['head'],m['tree'])==('snapetech-org/seerrng',418,'W3660-W3679',[START,END],HEAD,TREE)
assert (w['range'],w['head'],w['tree'],w['sourceRecordCount'],w['sourceOrderBoundaryRecordCount'],w['cellCount'])==([START,END],HEAD,TREE,20,22,240)
assert (att['state'],att['isDraft'],att['head'],att['tree'],att['branchRef'],att['pullRef'])==('OPEN',True,HEAD,TREE,HEAD,HEAD)
listed={}
for line in (D/'SHA256SUMS.txt').read_text().splitlines():
 digest,name=line.split(None,1); listed[name.strip().lstrip('*')]=digest
actual={p.relative_to(D).as_posix():p for p in D.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
assert set(listed)==set(actual)
for name,p in actual.items(): assert sha(p.read_bytes())==listed[name],name
mf={x['path']:x for x in m['files']}
assert set(mf)==set(actual)-{'manifest.json'}
for n,p in actual.items():
 if n=='manifest.json': continue
 assert mf[n]['sha256']==sha(p.read_bytes()) and mf[n]['byteCount']==p.stat().st_size,n
keys=list(json.loads(show('src/i18n/locale/en.json')))
assert len(keys)==9494 and sha('\n'.join(keys).encode())==w['sourceOrderSha256']
assert [x['position'] for x in readjl(D/'prior-selection-exclusions.jsonl')]==list(range(START))
excluded=readjl(D/'prior-selection-exclusions.jsonl')
assert [x['sourceId'] for x in excluded]==keys[:START]
assert len(excluded)==START and sha('\n'.join(x['sourceId'] for x in excluded).encode())==w['priorSelectedSourceIdPrefixSha256']
sources=readjl(D/'source-cells.jsonl'); order=readjl(D/'source-order.jsonl')
assert len(sources)==20 and [x['position'] for x in sources]==list(range(START,END+1))
assert [x['sourceId'] for x in sources]==keys[START:END+1]
assert len(order)==22 and [x['position'] for x in order]==list(range(START-1,END+2))
assert [x['boundaryKind'] for x in order]==['previous']+['selected']*20+['next']
assert sha('\n'.join(x['sourceId'] for x in sources).encode())==w['selectedSourceIdOrderSha256']
en=json.loads(show('src/i18n/locale/en.json'))
src_by={x['position']:x for x in sources}; order_by={x['position']:x for x in order}
for x in sources:
 assert x['sourceId']==keys[x['position']] and x['source']==en[x['sourceId']]
 assert x['sourceIdSha256']==st(x['sourceId']) and x['sourceSha256']==st(x['source'])
 assert x['sourcePlaceholders']==icu(x['source']) and x['sourceIcuPluralCategories']==catmap(icu(x['source']))
 assert order_by[x['position']]['sourceId']==x['sourceId']
pins=readj(D/'file-pins.json')
assert set(pins['catalogFiles'])=={f'src/i18n/locale/{k}.json' for k in ['en']+LOCALES}
for path,meta in pins['catalogFiles'].items():
 raw=show(path); obj=json.loads(raw)
 assert sha(raw)==meta['sha256'] and blob(path)==meta['gitBlob'] and len(obj)==9494
 assert set(obj)==set(keys)
registry=json.loads(show('config/i18n/locales.json'))
by_file={x['clientFile'].removesuffix('.json'):x for x in registry['locales']}
for info in w['localeInfo']:
 reg=by_file[info['catalogKey']]
 assert (info['tag'],info['nativeName'],info['direction'],info['clientFile'])==(reg['tag'],reg['nativeName'],reg['direction'],reg['clientFile'])
for path,meta in pins['runtimeFiles'].items():
 raw=show(path)
 assert sha(raw)==meta['sha256'] and blob(path)==meta['gitBlob'] and len(raw)==meta['byteCount']
cells=readjl(D/'current-target-cells.jsonl')
assert len(cells)==240 and len({(x['position'],x['locale']) for x in cells})==240
assert {x['locale'] for x in cells}==set(LOCALES)
for c in cells:
 s=src_by[c['position']]; raw=show(c['catalogPath']); target=json.loads(raw)[c['sourceId']]
 assert c['sourceId']==s['sourceId'] and c['source']==s['source'] and c['sourceSha256']==s['sourceSha256']
 assert c['catalogGitBlob']==blob(c['catalogPath']) and c['catalogSha256']==sha(raw)
 assert c['currentTarget']==target and c['currentTargetSha256']==st(target)
 stoks=icu(s['source']); ttoks=icu(target); ss=sig(stoks); ts=sig(ttoks)
 assert c['sourcePlaceholders']==stoks and c['currentTargetPlaceholders']==ttoks
 assert c['placeholderTokenMismatch']==(collections.Counter(ss)!=collections.Counter(ts))
 assert c['placeholderTokenSequenceMismatch']==(ss!=ts)
 assert c['sourceIcuPluralCategories']==catmap(stoks) and c['currentTargetIcuPluralCategories']==catmap(ttoks)
 assert c['icuPluralCategorySetDifference']==(catmap(stoks)!=catmap(ttoks))
 assert c['sourceMarkupTokens']==MK.findall(s['source']) and c['currentTargetMarkupTokens']==MK.findall(target)
 assert c['markupTokenMismatch']==(MK.findall(s['source'])!=MK.findall(target))
 assert c['sourceNumericTokens']==NUM.findall(s['source']) and c['currentTargetNumericTokens']==NUM.findall(target)
 assert c['numericTokenMismatch']==(c['sourceNumericTokens']!=c['currentTargetNumericTokens'])
 req=[x for x in PROTECTED if x in s['source']]; seen=[x for x in PROTECTED if x in target]
 assert c['sourceProtectedLiterals']==req and c['currentTargetProtectedLiterals']==seen
 assert c['protectedLiteralMismatch']==any(x not in target for x in req)
 assert c['reviewStatus']=='unreviewed' and not any(k in c for k in ('decision','proposedTarget','proposal'))
diag={'placeholderMismatchCount':sum(x['placeholderTokenMismatch'] for x in cells),'placeholderSequenceMismatchCount':sum(x['placeholderTokenSequenceMismatch'] for x in cells),'icuPluralCategorySetDifferenceCount':sum(x['icuPluralCategorySetDifference'] for x in cells),'markupMismatchCount':sum(x['markupTokenMismatch'] for x in cells),'numericTokenMismatchCount':sum(x['numericTokenMismatch'] for x in cells),'protectedLiteralMismatchCount':sum(x['protectedLiteralMismatch'] for x in cells)}
assert diag==w['baselineTokenDiagnostics']
contexts=readjl(D/'caller-contexts.jsonl'); blocks=readjl(D/'caller-context-blocks.jsonl')
assert len(contexts)==20
blocks_by={x['contextId']:x for x in blocks}
for ctx in contexts:
 assert ctx['head']==HEAD and ctx['tree']==TREE and ctx['sourceId']==src_by[ctx['position']]['sourceId']
 assert ctx['callerCount']==len(ctx['directMessageReferences'])
 for cid in ctx['contextBlockIds']: assert cid in blocks_by
for b in blocks:
 lines=show(b['path']).decode('utf-8').splitlines()
 if b['contextType']=='component-routing':
  for x in b['references']: assert lines[x['line']-1]==x['text'] and st(x['text'])==x['lineSha256']
 else:
  exact=lines[b['startLine']-1:b['endLine']]
  assert len(exact)==len(b['lines'])
  for n,(txt,row) in enumerate(zip(exact,b['lines']),b['startLine']):
   assert row['line']==n and row['text']==txt and row['lineSha256']==st(txt)
for ctx in contexts:
 for ref in ctx['directMessageReferences']:
  lines=show(ref['path']).decode('utf-8').splitlines()
  assert lines[ref['line']-1]==ref['text'] and st(ref['text'])==ref['lineSha256']
callerless=sorted(x['position'] for x in contexts if x['callerCount']==0)
assert callerless==w['callerlessSourcePositions']==readj(D/'caller-resolution-findings.json')['callerlessSourcePositions']
carry=readjl(D/'carry-forward-hold-hashes.jsonl'); lineage=readj(D/'lineage/hold-lineage.json')
assert len(carry)==len(lineage['carryForwardHoldRows'])==12
assert {x['position'] for x in carry}=={3632} and {x['locale'] for x in carry}==set(LOCALES)
for row in carry:
 assert not any(k in row for k in ('currentTarget','previousTarget','target','proposedTarget','proposal'))
 assert row['targetTextIncluded'] is False and row['retained'] is True
 target=json.loads(show(row['catalogPath']))[row['sourceId']]
 assert st(target)==row['currentTargetSha256']==row['priorTargetSha256']
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'range':[START,END],'sourceCount':len(sources),'cellCount':len(cells),'priorExcludedSourceIds':len(excluded),'priorHoldsReattested':len(carry),'holdPositions':[3632],'previousBoundary':order[0]['sourceId'],'nextBoundary':order[-1]['sourceId'],'callerlessPositions':callerless,'baselineTokenDiagnostics':diag,'catalogPins':len(pins['catalogFiles']),'runtimeFilePins':len(pins['runtimeFiles']),'livePR':'OPEN/DRAFT','candidateProposalsIncluded':False,'checksummedFiles':len(listed)},ensure_ascii=False,indent=2))
