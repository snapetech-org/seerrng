from pathlib import Path
import datetime,json,subprocess
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
REPO_PATH=Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
PR_SPECS=[('snapetech-org/SeerrNG',418),('snapetech-org/ChaptarrNG',190),('snapetech-org/QuestarrNG',155),('snapetech-org/ROMarrNG',70),('snapetech-org/slskR',204),('snapetech-org/slskdN',409),('snapetech-org/TorrentNG',243)]
def run(*args): return subprocess.check_output(args,text=True).strip()
rows=[]
for repo,n in PR_SPECS:
 data=json.loads(run('gh','pr','view',str(n),'--repo',repo,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,url'))
 ref=run('git','ls-remote',f'https://github.com/{repo}.git',f'refs/heads/{data["headRefName"]}').split()
 remote=ref[0] if ref else None
 rows.append({'repository':repo,'number':n,**data,'remoteBranchOid':remote})
state={'path':str(REPO_PATH),'branch':run('git','-C',str(REPO_PATH),'branch','--show-current'),'head':run('git','-C',str(REPO_PATH),'rev-parse','HEAD'),'tree':run('git','-C',str(REPO_PATH),'rev-parse','HEAD^{tree}'),'statusPorcelain':run('git','-C',str(REPO_PATH),'status','--porcelain')}
state['clean']=state['statusPorcelain']==''
start=json.loads((OUT/'live-localization-prs-start.json').read_text())
by_start={(x['repository'],x['number']):x for x in start['pullRequests']}
changes=[]
for x in rows:
 old=by_start[(x['repository'],x['number'])]
 for key in ('state','isDraft','headRefOid','headRefName','baseRefOid','baseRefName','remoteBranchOid'):
  if x.get(key)!=old.get(key): changes.append({'repository':x['repository'],'number':x['number'],'field':key,'before':old.get(key),'after':x.get(key)})
seerr=next(x for x in rows if x['number']==418)
passed=(len(rows)==7 and all(x['state']=='OPEN' for x in rows) and seerr['isDraft'] is True and seerr['headRefOid']=='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2' and seerr['remoteBranchOid']==seerr['headRefOid'] and state['head']=='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2' and state['tree']=='a09117211080bbd89d32959f17d93b02a82b966f' and state['clean'])
end={'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':'after','pullRequests':rows,'seerrWorktree':state,'allSevenHeadsAndStatesUnchanged':not changes,'changesFromBefore':changes,'exactSeerrHeadAndTreeStillPinned':passed}
(OUT/'live-localization-prs-end.json').write_text(json.dumps(end,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps({'capturedAtUtc':end['capturedAtUtc'],'allSevenOpen':all(x['state']=='OPEN' for x in rows),'allSevenHeadsAndStatesUnchanged':not changes,'changesFromBefore':changes,'seerrDraft':seerr['isDraft'],'seerrHead':state['head'],'seerrTree':state['tree'],'worktreeClean':state['clean'],'passed':passed,'output':str(OUT/'live-localization-prs-end.json')},ensure_ascii=False,indent=2))
