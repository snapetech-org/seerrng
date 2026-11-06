import base64, hashlib, json, pathlib, subprocess
OUT = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2700-2799-primary-20261102')
REPO_PATH = pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
SPECS = [
 ('chaptarrng',190,'ChaptarrNG'),('questarrng',155,'QuestarrNG'),('romarrng',70,'ROMarrNG'),
 ('seerrng',418,'SeerrNG'),('slskr',204,'slskR'),('slskdn',409,'slskdN'),('TorrentNG',243,'TorrentNG')]
def run(*args): return subprocess.check_output(list(map(str,args)), text=True)
def jrun(*args): return json.loads(run(*args))
def sha(data): return hashlib.sha256(data).hexdigest()
def cat_paths(repo, paths):
 low=repo.lower(); out=[]
 for p in paths:
  if low=='chaptarrng' and p.startswith('src/NzbDrone.Core/Localization/Core/') and p.endswith('.json'): out.append(p)
  elif low=='questarrng' and ((p.startswith('localization/') and p.endswith('.json')) or (p.startswith('client/src/lib/') and p.endswith('-locale.ts')) or (p.startswith('shared/') and p.endswith('-locale.ts'))): out.append(p)
  elif low=='romarrng' and ((p.startswith('web/src/lib/locales/ui-labels.') and p.endswith('.json')) or p in {'romarr/i18n_runtime.js','romarr/ui-labels.json','romarr/ui-source-messages.json','romarr/ui-source-snapshot.json'}): out.append(p)
  elif low=='seerrng' and ((p.startswith('src/i18n/locale/') and p.endswith('.json')) or (p.startswith('server/i18n/locale/') and p.endswith('.json')) or p=='config/i18n/locales.json'): out.append(p)
  elif low=='slskr' and ((p.startswith('web/src/lib/locales/ui-labels.') and p.endswith('.json')) or p=='web/src/lib/interfaceLocale.js'): out.append(p)
  elif low=='slskdn' and ((p.startswith('src/web/public/locales/') and p.endswith('.json')) or p=='src/web/src/lib/interfaceLocale.js'): out.append(p)
  elif low=='torrentng' and ((p.startswith('webui/src/lib/locale-catalogs/') and p.endswith('.ts')) or p=='webui/src/lib/interfaceLocale.ts'): out.append(p)
 return sorted(out)
records=[]
for repo,num,label in SPECS:
 pr=jrun('gh','pr','view',str(num),'--repo',f'snapetech-org/{repo}','--json','state,isDraft,headRefOid,headRefName,baseRefOid,url,title')
 head=pr['headRefOid']
 commit=jrun('gh','api',f'repos/snapetech-org/{repo}/commits/{head}')
 tree_sha=commit['commit']['tree']['sha']
 tree=jrun('gh','api',f'repos/snapetech-org/{repo}/git/trees/{tree_sha}?recursive=1')
 blobs={e['path']:e['sha'] for e in tree.get('tree',[]) if e.get('type')=='blob'}
 selected=cat_paths(repo,list(blobs))
 records.append({'repository':f'snapetech-org/{repo}','label':label,'pullRequest':num,'state':pr['state'],'isDraft':pr['isDraft'],
  'url':pr['url'],'headRefName':pr['headRefName'],'head':head,'baseHead':pr['baseRefOid'],'tree':tree_sha,
  'treeTruncated':tree.get('truncated',False),'currentCatalogFiles':[{'path':p,'blob':blobs[p]} for p in selected],
  'currentCatalogFileCount':len(selected),'catalogSelection':'All repository catalog/locale paths selected by established path convention.'})
seerr=next(r for r in records if r['pullRequest']==418)
expected_head='6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118'
expected_tree='44cf1a02d645026872759fa04a7506ee738381e5'
if seerr['head'] != expected_head or seerr['tree'] != expected_tree: raise SystemExit('Seerr PR head/tree moved; stop and report')
locale_files=[x for x in seerr['currentCatalogFiles'] if x['path'].startswith('src/i18n/locale/')]
source_paths=['src/i18n/locale/en.json']+[f"src/i18n/locale/{l}.json" for l in ['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']]
by_path={x['path']:x['blob'] for x in locale_files}
if set(source_paths)-set(by_path): raise SystemExit('Seerr source/locale path absent from live catalog tree')
contents=[]
for path in source_paths:
 oid=by_path[path]
 local_oid=subprocess.check_output(['git','-C',str(REPO_PATH),'rev-parse',f'{expected_head}:{path}'],text=True).strip()
 raw=subprocess.check_output(['git','-C',str(REPO_PATH),'show',f'{expected_head}:{path}'])
 if local_oid!=oid: raise SystemExit(f'local exact-head catalog blob differs from live tree: {path}')
 contents.append({'path':path,'blob':oid,'bytes':len(raw),'sha256':sha(raw),'contentSource':'git object at verified live PR head'})
# Recheck each source/locale catalog against the already frozen input manifest.
input_manifest=json.loads((OUT/'input-manifest.json').read_text())
manifest_files={v['path']:v for v in [input_manifest['sourceCatalog'],*input_manifest['localeCatalogs'].values()]}
for c in contents:
 old=manifest_files[c['path']]
 if c['blob']!=old['blob'] or c['sha256']!=old['sha256'] or c['bytes']!=old['bytes']:
  raise SystemExit(f'frozen source/catalog blob changed: {c["path"]}')
# Recheck all 100 callers and 472 pinned line references against the exact checked-out commit/tree.
contexts=[json.loads(x) for x in (OUT/'caller-contexts.jsonl').read_text().splitlines() if x]
line_results=[]; caller_file_results={}
for ctx in contexts:
 for f in ctx['callerFiles']:
  path=f['path']
  raw=subprocess.check_output(['git','-C',str(REPO_PATH),'show',f'{expected_head}:{path}'])
  blob=subprocess.check_output(['git','-C',str(REPO_PATH),'rev-parse',f'{expected_head}:{path}'],text=True).strip()
  rec={'path':path,'blob':blob,'bytes':len(raw),'sha256':sha(raw)}
  prior=caller_file_results.get(path)
  if prior and prior!=rec: raise SystemExit(f'inconsistent repeated caller file {path}')
  caller_file_results[path]=rec
  if blob!=f['blob'] or sha(raw)!=f['fileSha256']: raise SystemExit(f'caller file changed: {path}')
  lines=raw.decode('utf-8').splitlines()
  for ref in ctx['pinnedLineRefs']:
   if ref['file']!=path: continue
   if ref['line']<1 or ref['line']>len(lines): raise SystemExit(f'caller line out of range {ctx["sourceId"]}:{ref["line"]}')
   actual=lines[ref['line']-1]
   if actual.strip()!=ref['lineText'] or sha(actual.encode())!=ref['lineSha256']:
    raise SystemExit(f'caller line changed {ctx["sourceId"]}:{ref["line"]}')
   for relkey,offset in [('previousLine',-1),('nextLine',1)]:
    expected=ref.get(relkey)
    idx=ref['line']-1+offset
    if expected is not None and (idx<0 or idx>=len(lines) or lines[idx].strip()!=expected): raise SystemExit(f'caller neighboring line changed {ctx["sourceId"]}:{ref["line"]}:{relkey}')
   line_results.append({'sourceId':ctx['sourceId'],'path':path,'line':ref['line'],'lineSha256':ref['lineSha256'],'exact':True})
if len(contexts)!=100 or len(line_results)!=472: raise SystemExit(f'caller pin count mismatch: {len(contexts)} rows, {len(line_results)} lines')
records_doc={'capturedAtUtc':run('date','-u','+%Y-%m-%dT%H:%M:%SZ').strip(),'scope':'Seven live localization PR head/tree/catalog-path snapshot; Seerr #418 exact-head source/locale blob-content and caller-line reattestation.',
 'pullRequests':records,'seerrSourceAndLocaleCatalogContent':contents,
 'seerrCatalogInputMatches':True,
 'callerReattestation':{'head':expected_head,'tree':expected_tree,'sourceIdRows':len(contexts),'pinnedLineReferences':len(line_results),
  'callerFiles':list(caller_file_results.values()),'allCallerFileBlobsAndLinesMatch':True,
  'note':'Caller paths and direct/helper references are statically pinned in the target source-group files; this is not a complete runtime call graph.'}}
(OUT/'live-localization-prs-end.json').write_text(json.dumps(records_doc,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf8')
print(json.dumps({'capturedAtUtc':records_doc['capturedAtUtc'],'prHeads':[{'repo':r['repository'],'pr':r['pullRequest'],'head':r['head'],'tree':r['tree'],'catalogFiles':r['currentCatalogFileCount']} for r in records],
 'seerrHead':seerr['head'],'seerrTree':seerr['tree'],'seerrSourceLocaleBlobs':len(contents),'callerSourceIds':len(contexts),'callerLinePins':len(line_results),'callerFiles':len(caller_file_results),'output':str(OUT/'live-localization-prs-end.json')},ensure_ascii=False,indent=2))
