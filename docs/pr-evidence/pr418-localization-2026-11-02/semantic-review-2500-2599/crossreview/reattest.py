from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,re,subprocess,collections
ROOT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
CROSS=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-crossreview-20261102')
REPO=Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2'; TREE='a09117211080bbd89d32959f17d93b02a82b966f'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode('utf-8')).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
def flatten(d,p=''):
 for k,v in d.items():
  key=f'{p}.{k}' if p else k
  if isinstance(v,dict): yield from flatten(v,key)
  else: yield key,v
def ph(s):
 out=[];i=0
 while i<len(s):
  if s[i]!='{': i+=1;continue
  depth=1;j=i+1
  while j<len(s) and depth:
   if s[j]=='{':depth+=1
   elif s[j]=='}':depth-=1
   j+=1
  if depth: return None
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',s[i+1:j-1])
  if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return sorted(out,key=lambda x:(x['name'],x['kind']))
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def cats(s): return sorted(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s)))
def branch_hashes(s):
 out={}
 for m in re.finditer(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s):
  cat=m.group(1); start=m.end(); depth=1; j=start
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  out[cat]=('#' in s[start:j-1])
 return out
assert git('rev-parse','HEAD').decode().strip()==HEAD
assert git('rev-parse','HEAD^{tree}').decode().strip()==TREE
status=git('status','--porcelain').decode().strip()
assert status==''
src_path='src/i18n/locale/en.json'
src_bytes=git('show',f'{HEAD}:{src_path}')
src_obj=json.loads(src_bytes)
src_items=list(flatten(src_obj));src_map=dict(src_items);src_keys=[k for k,_ in src_items]
src_blob=git('rev-parse',f'{HEAD}:{src_path}').decode().strip()
win=json.loads((ROOT/'source-window.json').read_text())
assert win['head']==HEAD and win['tree']==TREE and win['sourcePositionRange']==[2500,2599]
assert win['sourceCatalog']=={'blob':src_blob,'bytes':len(src_bytes),'path':src_path,'sha256':sha(src_bytes)}
source_rows=win['sourceList']
assert len(source_rows)==100
for offset,s in enumerate(source_rows):
 pos=s['position']; sid=s['sourceId']; txt=s['source']
 assert src_keys[pos]==sid and src_map[sid]==txt and sha(sid)==s['sourceHash'] and pos==2500+offset
parity=json.loads((ROOT/'catalog-parity.json').read_text())
assert parity['head']==HEAD and parity['allLocalesExactKeySetParity']
locale_maps={}; locale_data=[]
for loc in LOCALES:
 path=f'src/i18n/locale/{loc}.json'; raw=git('show',f'{HEAD}:{path}'); obj=json.loads(raw); pairs=list(flatten(obj)); keys=[k for k,_ in pairs]
 blob=git('rev-parse',f'{HEAD}:{path}').decode().strip(); info=next(x for x in parity['locales'] if x['locale']==loc)
 assert set(keys)==set(src_keys)
 assert (keys==src_keys)==info['orderedKeyParity']
 assert blob==info['blob'] and sha(raw)==info['fileSha256'] and len(raw)==info['fileBytes'] and len(keys)==info['keyCount']
 assert info['keySetParity'] and (keys==src_keys)==info['orderedKeyParity'] and info['sortedKeySetSha256']==sha(canon(sorted(keys))) and info['orderedKeyListSha256']==sha(canon(keys))
 locale_maps[loc]=dict(pairs)
 locale_data.append({'locale':loc,'path':path,'blob':blob,'fileSha256':sha(raw),'bytes':len(raw),'keyCount':len(keys),'orderedKeyParity':keys==src_keys,'keySetParity':True})
cells=[json.loads(s) for s in (ROOT/'source-current-cells.jsonl').read_text().splitlines()]
primary=[json.loads(s) for s in (ROOT/'primary-review-ledger.jsonl').read_text().splitlines()]
contexts=[json.loads(s) for s in (ROOT/'caller-contexts.jsonl').read_text().splitlines()]
assert len(cells)==1200 and len(primary)==1200 and len(contexts)==100
bykey={(x['sourcePosition'],x['locale']):x for x in cells}; pby={(x['sourcePosition'],x['locale']):x for x in primary}; ctxby={x['sourceId']:x for x in contexts}
assert len(bykey)==1200 and len(pby)==1200 and len(ctxby)==100
assert {x['sourceId'] for x in contexts}=={x['sourceId'] for x in source_rows}
ctx_file={}
for ctx in contexts:
 assert sha(canon(ctx))==next(p for p in cells if p['sourceId']==ctx['sourceId'])['callerContextSha256']
 for f in ctx['callerFiles']:
  raw=git('show',f"{HEAD}:{f['path']}")
  blob=git('rev-parse',f"{HEAD}:{f['path']}").decode().strip()
  assert sha(raw)==f['fileSha256'] and blob==f['blob']
  ctx_file[f['path']]=(raw.decode('utf-8').splitlines(),sha(raw),blob)
 for ref in ctx['pinnedLineRefs']:
  lines=ctx_file[ref['file']][0]; n=ref['line']
  assert 1<=n<=len(lines)
  line_raw=lines[n-1]; line=line_raw.strip()
  assert line==ref['lineText'] and sha(line_raw)==ref['lineSha256']
  assert (lines[n-2].strip() if n>1 else '')==ref['previousLine']
  assert (lines[n].strip() if n<len(lines) else '')==ref['nextLine']
caller_refs=sum(len(c['pinnedLineRefs']) for c in contexts)
assert caller_refs==358
for row in cells:
 key=(row['sourcePosition'],row['locale']); pos,loc=key
 assert row['sourceId']==source_rows[pos-2500]['sourceId'] and row['source']==source_rows[pos-2500]['source']
 assert row['sourceHash']==sha(row['sourceId']) and row['sourceTextSha256']==sha(row['source'])
 assert row['sourceFileSha256']==sha(src_bytes) and row['sourceCatalogBlob']==src_blob
 assert row['currentTarget']==locale_maps[loc][row['sourceId']] and row['currentTargetHash']==sha(row['currentTarget'])
 assert row['localeFile']==f'src/i18n/locale/{loc}.json'
 assert row['localeFileSha256']==next(x['fileSha256'] for x in locale_data if x['locale']==loc)
 assert row['localeBlob']==next(x['blob'] for x in locale_data if x['locale']==loc)
 assert row['callerContextSha256']==sha(canon(ctxby[row['sourceId']]))
 p=pby[key]
 assert p['currentTargetHash']==row['currentTargetHash'] and p['sourceTextSha256']==row['sourceTextSha256'] and p['finalTargetHash']==sha(p['finalTarget'])
current_integrity=[]; primary_integrity=[]
for row in cells:
 source=row['source']; current=row['currentTarget']; s_ph=ph(source); s_tags=tags(source); s_cat=cats(source)
 cph=ph(current); ctags=tags(current); ccat=cats(current)
 miss=[lit for lit in row['protectedLiterals'] if lit not in current]
 if cph!=s_ph: current_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'placeholder','source':s_ph,'target':cph})
 if ctags!=s_tags: current_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'markup','source':s_tags,'target':ctags})
 if miss: current_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'protected-literal','missing':miss})
 if not set(s_cat).issubset(ccat) or (s_cat and 'other' not in ccat): current_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'icu-branches','source':s_cat,'target':ccat})
 if s_cat and any(v and not branch_hashes(current).get(cat,False) for cat,v in branch_hashes(source).items()): current_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'icu-count-marker'})
 p=pby[(row['sourcePosition'],row['locale'])]; target=p['finalTarget']; t_ph=ph(target); t_tags=tags(target); t_cat=cats(target)
 pmiss=[lit for lit in row['protectedLiterals'] if lit not in target]
 if p['finalTargetHash']!=sha(target): primary_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'target-hash'})
 if t_ph!=s_ph: primary_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'placeholder'})
 if t_tags!=s_tags: primary_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'markup'})
 if pmiss: primary_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'protected-literal','missing':pmiss})
 if not set(s_cat).issubset(t_cat) or (s_cat and 'other' not in t_cat): primary_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'icu-branches'})
 if s_cat and any(v and not branch_hashes(target).get(cat,False) for cat,v in branch_hashes(source).items()): primary_integrity.append({'key':[row['sourcePosition'],row['locale']],'issue':'icu-count-marker'})
assert not [x for x in current_integrity if x['issue'] in {'placeholder','markup','icu-branches'}]
current_count_markers=[x for x in current_integrity if x['issue']=='icu-count-marker']
assert not [x for x in primary_integrity if x['issue']!='icu-count-marker'], primary_integrity[:20]
primary_count_markers=[x for x in primary_integrity if x['issue']=='icu-count-marker']
# Current protected-literal mismatches are recorded as source-attributed findings; corrections must eliminate them.
current_protected=[x for x in current_integrity if x['issue']=='protected-literal']
assert len(current_protected)==34
own=[json.loads(s) for s in (CROSS/'crossreview-own.jsonl').read_text().splitlines()]
assert len(own)==900 and len({(x['sourcePosition'],x['locale']) for x in own})==900
integrity=[]; source_icu_cells=0; locale_icu=collections.Counter(); revision_count=0
for r in own:
 key=(r['sourcePosition'],r['locale']); cell=bykey[key]; prim=pby[key]
 assert r['sourceId']==cell['sourceId'] and r['sourceTextSha256']==cell['sourceTextSha256']
 assert r['currentTargetHash']==cell['currentTargetHash'] and r['primaryFinalTargetHash']==prim['finalTargetHash'] and r['callerContextSha256']==cell['callerContextSha256']
 target=r['reviewedTarget']; source=cell['source']; s_ph=ph(source); t_ph=ph(target); s_tags=tags(source); t_tags=tags(target); s_cat=cats(source); t_cat=cats(target)
 assert r['reviewedTargetHash']==sha(target)
 if t_ph!=s_ph: integrity.append({'key':key,'issue':'placeholder','source':s_ph,'target':t_ph})
 if t_tags!=s_tags: integrity.append({'key':key,'issue':'markup','source':s_tags,'target':t_tags})
 missing=[lit for lit in cell['protectedLiterals'] if lit not in target]
 if missing: integrity.append({'key':key,'issue':'protected-literal','missing':missing})
 if s_cat and (not set(s_cat).issubset(t_cat) or 'other' not in t_cat): integrity.append({'key':key,'issue':'icu-branches','source':s_cat,'target':t_cat})
 s_branch=branch_hashes(source); t_branch=branch_hashes(target)
 for cat,has_hash in s_branch.items():
  if has_hash and not t_branch.get(cat,False): integrity.append({'key':key,'issue':'icu-count-marker','category':cat})
 valid_extra={'ar':{'zero','two','few','many'},'fr':{'many'},'pt_BR':{'many'}}
 loc=r['locale']; unexpected=set(t_cat)-set(s_cat)-valid_extra.get(loc,set())
 if unexpected: integrity.append({'key':key,'issue':'locale-icu-category','unexpected':sorted(unexpected)})
 if s_cat: source_icu_cells+=1; locale_icu[loc]+=1
 if r['crossReviewDisposition']=='revise':
  revision_count+=1
  assert r['recommendedTarget']==target and target!=prim['finalTarget']
 else:
  assert r['recommendedTarget'] is None and target==prim['finalTarget']
assert not integrity, integrity[:20]
report={'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'repository':'snapetech-org/SeerrNG','pullRequest':418,'head':HEAD,'tree':TREE,'worktree':str(REPO),'worktreeHead':git('rev-parse','HEAD').decode().strip(),'worktreeTree':git('rev-parse','HEAD^{tree}').decode().strip(),'worktreeStatusPorcelain':status,'sourceCatalog':{'path':src_path,'blob':src_blob,'fileSha256':sha(src_bytes),'bytes':len(src_bytes),'keyCount':len(src_keys),'orderedKeysSha256':sha(canon(src_keys))},'sourcePositions':{'range':[2500,2599],'count':100,'first':source_rows[0]['sourceId'],'last':source_rows[-1]['sourceId']},'localeCatalogs':locale_data,'allLocalesExactKeySetParity':True,'orderedKeyParityByLocale':{x['locale']:x['orderedKeyParity'] for x in locale_data},'localesWithOrderDifferences':[x['locale'] for x in locale_data if not x['orderedKeyParity']],'currentCells':{'count':len(cells),'unique':len(bykey),'liveValueAndHashMatches':True,'targetLocales':LOCALES},'callerContext':{'sourceIds':len(contexts),'pinnedLineRefs':caller_refs,'callerFiles':len(ctx_file),'allCallerBytesBlobsLineNumbersAndLineHashesMatchExactTree':True},'reviewedOwnCells':len(own),'ownCrossReviewCounts':dict(collections.Counter(x['crossReviewDisposition'] for x in own)),'ownRevisions':revision_count,'currentTargetIntegrity':{'placeholderMarkupAndBranchIssues':len([x for x in current_integrity if x['issue'] in {'placeholder','markup','icu-branches'}]),'protectedLiteralMismatchCells':len(current_protected),'protectedLiteralMismatchRows':current_protected,'countMarkerMismatchRows':current_count_markers},'primaryTargetIntegrity':{'placeholderMarkupProtectedLiteralAndBranchIssues':len([x for x in primary_integrity if x['issue']!='icu-count-marker']),'countMarkerMismatchRows':primary_count_markers},'primaryAndRecommendedTargetStructure':{'placeholderMarkupProtectedLiteralIcuAndHashIssues':len(integrity),'sourceIcuCellsReviewed':source_icu_cells,'localeIcuCellsByLocale':dict(locale_icu),'localeSpecificPluralCategoriesChecked':True,'countMarkersPreserved':True},'integrityIssues':integrity}
(CROSS/'catalog-caller-reattestation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
