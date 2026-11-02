from __future__ import annotations
import datetime, hashlib, json, pathlib, subprocess

OUT=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='58697945e3d3fb44c37d49db0cc0f88e3af110cc'
TREE='e3076937fe10b4dd3821ea573e8e5e21601fce7d'
REPOS=[('snapetech-org/SeerrNG',418),('snapetech-org/chaptarrng',190),('snapetech-org/QuestarrNG',155),('snapetech-org/ROMarrNG',70),('snapetech-org/slskr',204),('snapetech-org/slskdN',409),('snapetech-org/TorrentNG',243)]
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode('utf-8')).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
def run(*a): return subprocess.check_output(a,text=True)
def gh_pr(repo,n): return json.loads(run('gh','pr','view',str(n),'--repo',repo,'--json','state,isDraft,headRefName,headRefOid,baseRefOid,url'))

pr=gh_pr('snapetech-org/SeerrNG',418)
head=git('rev-parse','HEAD').decode().strip(); tree=git('rev-parse','HEAD^{tree}').decode().strip()
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{pr['headRefName']}").split()[0]
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD and remote==HEAD
assert head==HEAD and tree==TREE
inputs=[json.loads(x) for x in (OUT/'source-current-cells.jsonl').read_text().splitlines()]
contexts={x['sourceId']:x for x in map(json.loads,(OUT/'caller-contexts.jsonl').read_text().splitlines())}
source_raw=git('show',f'{HEAD}:src/i18n/locale/en.json')
source_catalog=json.loads(source_raw)
locale_catalogs={}; catalogs={}
for loc in LOCALES:
 path=f'src/i18n/locale/{loc}.json'; raw=git('show',f'{HEAD}:{path}')
 locale_catalogs[loc]=json.loads(raw)
 catalogs[loc]={'path':path,'blob':git('rev-parse',f'{HEAD}:{path}').decode().strip(),'bytes':len(raw),'sha256':sha(raw),'keyCount':len(locale_catalogs[loc]),'keySetMatchesEnglish':set(locale_catalogs[loc])==set(source_catalog)}
assert all(set(locale_catalogs[l])==set(source_catalog) for l in LOCALES)
for c in inputs:
 assert source_catalog[c['sourceId']]==c['source'] and sha(c['source'])==c['sourceTextSha256']
 assert locale_catalogs[c['locale']][c['sourceId']]==c['currentTarget'] and sha(c['currentTarget'])==c['currentTargetHash']
 assert sha(canon(contexts[c['sourceId']]))==c['callerContextSha256']
file_refs={}
line_count=0
for ctx in contexts.values():
 for f in ctx['callerFiles']:
  raw=git('show',f"{HEAD}:{f['path']}")
  assert sha(raw)==f['fileSha256'] and git('rev-parse',f"{HEAD}:{f['path']}").decode().strip()==f['blob']
  file_refs[f['path']]={'blob':f['blob'],'bytes':len(raw),'sha256':sha(raw)}
 for ref in ctx['pinnedLineRefs']:
  lines=git('show',f"{HEAD}:{ref['file']}").decode().splitlines()
  line=lines[ref['line']-1]
  assert sha(line)==ref['lineSha256'] and line.strip()==ref['lineText']
  line_count+=1
status=git('status','--porcelain=v1','--untracked-files=all').decode().splitlines()
assert all(s=='?? .next-webpack-dev' for s in status) and len(status)<=1
link=REPO/'.next-webpack-dev'
if status:
 assert link.is_symlink() and str(link.resolve())=='/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2800-2899-browser-20261102/.next-webpack-dev'
tracked_clean=git('diff','--quiet')==b'' and git('diff','--cached','--quiet')==b''
assert tracked_clean
start=json.loads((OUT/'pr-snapshot-start.json').read_text())['snapshots']
end=[]
for repo,n in REPOS:
 p=gh_pr(repo,n)
 end.append({'repository':repo,'pullRequest':n,**p})
write={
 'repository':'snapetech-org/SeerrNG','pullRequest':418,'attestedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'prState':pr['state'],'isDraft':pr['isDraft'],'headRefName':pr['headRefName'],'head':head,'tree':tree,'officialRemoteBranchHead':remote,
 'sourceCatalog':{'path':'src/i18n/locale/en.json','blob':git('rev-parse',f'{HEAD}:src/i18n/locale/en.json').decode().strip(),'bytes':len(source_raw),'sha256':sha(source_raw),'keyCount':len(source_catalog)},
 'localeCatalogs':catalogs,'allLocaleKeySetsMatchEnglish':all(x['keySetMatchesEnglish'] for x in catalogs.values()),
 'sourcePositions':[2900,2999],'sourceIds':len({x['sourceId'] for x in inputs}),'cells':len(inputs),'cellReattestation':'Every source text and current target matched exact-head catalog values and recorded SHA256.',
 'callerContexts':len(contexts),'callerContextRehashes':len(contexts),'callerFiles':file_refs,'callerFileCount':len(file_refs),'callerLinePinsRehashed':line_count,'callerGaps':0,
 'trackedWorktreeDiffClean':tracked_clean,'worktreeStatus':status,'preservedSharedUntrackedSymlink':str(link.resolve()) if link.is_symlink() else None,
 'repositoryOrPrEditedByThisTask':False,'testsBuildsScansCiBrowserRun':False}
(OUT/'exact-head-reattestation.json').write_text(json.dumps(write,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
changes=[]
start_by={(x['repository'].lower(),x['pullRequest']):x for x in start}
for x in end:
 old=start_by.get((x['repository'].lower().replace('snapetech-org/',''),x['pullRequest'])) or next((s for s in start if s['pullRequest']==x['pullRequest']),None)
 if old:
  changes.append({'repository':x['repository'],'pullRequest':x['pullRequest'],'startHead':old.get('headRefOid'),'endHead':x.get('headRefOid'),'headChanged':old.get('headRefOid')!=x.get('headRefOid'),'startState':old.get('state'),'endState':x.get('state'),'startDraft':old.get('isDraft'),'endDraft':x.get('isDraft')})
(OUT/'live-pr-snapshots-end.json').write_text(json.dumps({'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshots':end,'deltaFromStart':changes},ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps({'head':head,'tree':tree,'remote':remote,'catalogs':len(catalogs),'cells':len(inputs),'callerContexts':len(contexts),'callerFiles':len(file_refs),'callerLinePins':line_count,'worktreeStatus':status,'prSnapshots':len(end),'prDelta':changes},indent=2))
