from __future__ import annotations
import datetime,hashlib,json,pathlib,re,subprocess
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-crossreview-20261102')
INPUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
WORK=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='f20893e57a89827095fa049d8e0475df7ec7170f'; TREE='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
BRANCH='codex/seerrng-localization-overhaul-20261028'; REPO='snapetech-org/SeerrNG'
ALL=[('snapetech-org/ChaptarrNG',190),('snapetech-org/SeerrNG',418),('snapetech-org/slskR',204),('snapetech-org/QuestarrNG',155),('snapetech-org/TorrentNG',243),('snapetech-org/slskdN',409),('snapetech-org/ROMarrNG',70)]
LOCALES={'ar':'ar','de':'de','es':'es','fr':'fr','hi':'hi','id':'id','ja':'ja','ko':'ko','pt_BR':'pt_BR','vi':'vi','zh_Hans':'zh_Hans','zh_Hant':'zh_Hant'}
def sha(b): return hashlib.sha256(b if isinstance(b,bytes) else b.encode()).hexdigest()
def jbytes(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def run(a,text=True): return subprocess.check_output(a,text=text)
def git(*a,text=True): return run(['git','-C',str(WORK),*a],text=text)
def show(path): return git('show',f'{HEAD}:{path}',text=False)
def readjl(p): return [json.loads(x) for x in p.read_text().splitlines()]
def writej(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(name,rows): (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
def verify_sums(folder,name):
 p=folder/name; checked=[]
 for line in p.read_text().splitlines():
  h,rel=line.split('  ',1); f=folder/rel; assert f.is_file() and sha(f.read_bytes())==h,(f,h)
  checked.append(rel)
 return {'path':name,'sha256':sha(p.read_bytes()),'checkedFiles':len(checked),'files':checked}
def ghj(args): return json.loads(run(args))
# The seven PR requery precedes review; this file preserves its exact output.
heads=[]
for repo,num in ALL:
 pr=ghj(['gh','pr','view',str(num),'--repo',repo,'--json','number,state,isDraft,headRefOid,headRefName,baseRefName,url'])
 branch=pr['headRefName']; tree=run(['gh','api',f'repos/{repo}/commits/{pr["headRefOid"]}','--jq','.commit.tree.sha']).strip()
 api=ghj(['gh','api',f'repos/{repo}/git/ref/heads/{branch}'])['object']['sha']
 remote_text=run(['git','ls-remote',f'https://github.com/{repo}.git',f'refs/heads/{branch}']).strip(); remote=remote_text.split()[0] if remote_text else None
 heads.append({'repository':repo,'pullRequest':num,'state':pr['state'],'isDraft':pr['isDraft'],'headRefName':branch,'head':pr['headRefOid'],'tree':tree,'apiBranchRefHead':api,'remoteBranchRef':remote_text,'remoteBranchHead':remote,'apiAndRemoteAgree':api==remote==pr['headRefOid'],'url':pr['url']})
assert all(x['apiAndRemoteAgree'] for x in heads),heads
s=next(x for x in heads if x['pullRequest']==418)
assert s['head']==HEAD and s['tree']==TREE and s['state']=='OPEN' and s['isDraft']
writej('all-seven-pr-heads.json',{'queriedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'GitHub PR API + branch refs + HTTPS git ls-remote','pullRequests':heads})
# Worktree state before reading.
state={'head':git('rev-parse','HEAD').strip(),'tree':git('rev-parse','HEAD^{tree}').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain').strip()}
assert state=={'head':HEAD,'tree':TREE,'branch':BRANCH,'status':''}
# Check both source and primary packets before reading them.
input_sum=verify_sums(INPUT,'INPUT-SHA256SUMS')
primary_sum=verify_sums(pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-primary-20261102'),'SHA256SUMS')
att=json.loads((pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-primary-20261102')/'attestation.json').read_text())
assert att['head']==HEAD and att['tree']==TREE and att['inputChecksumVerification'][-1]=='input-manifest.json: OK'
input_manifest=json.loads((INPUT/'input-manifest.json').read_text())
assert sha((INPUT/'input-manifest.json').read_bytes())==att['inputManifestSha256']
assert input_manifest['head']==HEAD and input_manifest['tree']==TREE and input_manifest['scope']['positions']==[2400,2499]
for line in (INPUT/'INPUT-SHA256SUMS').read_text().splitlines():
 h,path=line.split('  ',1); raw=(INPUT/path).read_bytes(); assert sha(raw)==h,(path,h)
# Source list at frozen flatten order and exact current values at all 12 locales.
source_raw=show('src/i18n/locale/en.json'); source=json.loads(source_raw)
assert sha(source_raw)==input_manifest['sourceCatalog']['sha256']
assert git('rev-parse',f'{HEAD}:src/i18n/locale/en.json').strip()==input_manifest['sourceCatalog']['blob']
window=json.loads((INPUT/'source-window.json').read_text())
assert window['head']==HEAD and window['tree']==TREE and len(window['sourceList'])==100
selected=window['sourceList']; assert [x['position'] for x in selected]==list(range(2400,2500))
source_cells=readjl(INPUT/'source-current-cells.jsonl'); callers=readjl(INPUT/'caller-contexts.jsonl')
assert len(source_cells)==1200 and len(callers)==100
locale_objs={}; catalog_rows=[]
for loc,filename in LOCALES.items():
 path=f'src/i18n/locale/{filename}.json'; raw=show(path); obj=json.loads(raw); pin=input_manifest['localeCatalogs'][filename]
 assert sha(raw)==pin['sha256'] and git('rev-parse',f'{HEAD}:{path}').strip()==pin['blob']
 assert len(obj)==len(source) and set(obj)==set(source)
 locale_objs[loc]=obj; catalog_rows.append({'locale':loc,'path':path,'blob':pin['blob'],'sha256':sha(raw),'keyCount':len(obj),'keySetParity':set(obj)==set(source)})
cell_by={(x['sourcePosition'],x['locale']):x for x in source_cells}
assert len(cell_by)==1200
for ent in selected:
 pos=ent['position']; sid=ent['sourceId']; txt=ent['source']
 assert source[sid]==txt
 for loc in LOCALES:
  c=cell_by[(pos,loc)]
  assert c['sourceId']==sid and c['source']==txt and c['sourceTextSha256']==sha(txt)
  assert c['currentTarget']==locale_objs[loc][sid] and c['currentTargetHash']==sha(c['currentTarget'])
# Verify all 100 caller file pins and line/context hashes from live Git at HEAD.
caller_ref_rows=[]; caller_ref_count=0
for c in callers:
 assert c['sourceId'] in {x['sourceId'] for x in selected}
 for f in c['callerFiles']:
  raw=show(f['path']); assert sha(raw)==f['fileSha256'] and git('rev-parse',f'{HEAD}:{f["path"]}').strip()==f['blob']
 for ref in c['pinnedLineRefs']:
  raw=show(ref['file']); lines=raw.decode().splitlines(); i=ref['line']-1
  assert 0<=i<len(lines) and lines[i].strip()==ref['lineText'] and sha(lines[i].rstrip())==ref['lineSha256']
  assert (lines[i-1].strip() if i else '')==ref['previousLine']
  assert (lines[i+1].strip() if i+1<len(lines) else '')==ref['nextLine']
  caller_ref_rows.append({'sourceId':c['sourceId'],'file':ref['file'],'line':ref['line'],'lineText':ref['lineText'],'lineSha256':ref['lineSha256'],'fileBlob':git('rev-parse',f'{HEAD}:{ref["file"]}').strip(),'fileSha256':sha(raw),'previousLine':ref['previousLine'],'nextLine':ref['nextLine'],'contextReattested':True})
  caller_ref_count+=1
assert caller_ref_count==262
writej('catalog-reattestation.json',{'head':HEAD,'tree':TREE,'catalogs':catalog_rows,'exactKeySets':True})
writejl('caller-pin-reattestation.jsonl',caller_ref_rows)
# Reattest exact primary review cells against the frozen input and all three live target catalogs.
primary=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-primary-20261102')
primary_rows=readjl(primary/'primary-review.jsonl'); assert len(primary_rows)==300
primary_map={(x['scopePosition'],x['locale']):x for x in primary_rows}; assert len(primary_map)==300
for pos in range(2400,2500):
 for loc in ('hi','id','vi'):
  r=primary_map[(pos,loc)]; c=cell_by[(pos,loc)]
  assert r['sourceId']==c['sourceId'] and r['sourceText']==c['source'] and r['sourceTextSha256']==c['sourceTextSha256']
  assert r['currentTarget']==c['currentTarget'] and r['currentTargetHash']==c['currentTargetHash']
  assert locale_objs[loc][r['sourceId']]==r['currentTarget']
  assert sha(r['reviewedTarget'])==r['reviewedTargetSha256']
  assert r['callerContextSha256']==c['callerContextSha256']
# Exact prior ledger has no frozen terminal dispositions, so all rows remain eligible for cross-review.
prior=json.loads((INPUT/'prior-disposition-boundary.json').read_text())
assert prior['scopePositions']==[2400,2499] and prior['exactLivePriorDispositions']==0 and prior['matchingPriorRows']==1200 and all(x['disposition']=='semantic-review-required' for x in prior['matches'])
# Recheck worktree and PR after reattestation.
pr=ghj(['gh','pr','view','418','--repo',REPO,'--json','number,state,isDraft,headRefOid,headRefName,url'])
tree=run(['gh','api',f'repos/{REPO}/commits/{pr["headRefOid"]}','--jq','.commit.tree.sha']).strip()
branch_ref=ghj(['gh','api',f'repos/{REPO}/git/ref/heads/{BRANCH}'])['object']['sha']
remote_ref=run(['git','-C',str(WORK),'ls-remote','github',f'refs/heads/{BRANCH}']).split()[0]
state_after={'head':git('rev-parse','HEAD').strip(),'tree':git('rev-parse','HEAD^{tree}').strip(),'branch':git('branch','--show-current').strip(),'status':git('status','--porcelain').strip()}
assert pr['state']=='OPEN' and pr['isDraft'] and pr['headRefOid']==HEAD and tree==TREE and branch_ref==remote_ref==HEAD
assert state_after==state
writej('input-reattestation.json',{'passed':True,'head':HEAD,'tree':TREE,'worktreeBefore':state,'worktreeAfter':state_after,'inputSumManifest':input_sum,'primarySumManifest':primary_sum,'inputManifestSha256':sha((INPUT/'input-manifest.json').read_bytes()),'sourceWindowRows':100,'sourceCurrentCellRows':1200,'primaryReviewRows':300,'callerRows':len(callers),'callerReferenceRows':caller_ref_count,'localeCatalogsReattested':catalog_rows,'priorMatchingRows':prior['matchingPriorRows'],'exactPriorTerminalDispositions':0,'livePullRequest':pr,'githubTree':tree,'branchRefHead':branch_ref,'remoteBranchHead':remote_ref,'allSelectedSourceAndCurrentValuesMatch':True,'allSourceAndCallerPinsMatch':True})
print(json.dumps({'head':HEAD,'tree':TREE,'worktreeClean':not bool(state['status']),'inputChecksums':input_sum['checkedFiles'],'primaryChecksums':primary_sum['checkedFiles'],'catalogs':len(catalog_rows),'sourceRows':100,'currentCells':1200,'reviewCells':300,'callerRefs':caller_ref_count,'priorMatchingRows':prior['matchingPriorRows'],'allSevenRefs':len(heads)},indent=2))
