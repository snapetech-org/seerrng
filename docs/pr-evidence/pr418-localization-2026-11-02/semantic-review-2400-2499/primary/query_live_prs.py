from __future__ import annotations
import json,subprocess,pathlib,hashlib
from datetime import datetime,timezone
ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
REPOS=[('SeerrNG',418),('ChaptarrNG',190),('QuestarrNG',155),('ROMarrNG',70),('slskR',204),('slskdN',409),('TorrentNG',243)]
def run(*args): return subprocess.check_output(args,text=True).strip()
rows=[]
for repo,number in REPOS:
 pr=json.loads(run('gh','pr','view',str(number),'--repo',f'snapetech-org/{repo}','--json','number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url'))
 row={'repository':f'snapetech-org/{repo}',**pr}
 try:
  c=json.loads(run('gh','api',f"repos/snapetech-org/{repo}/git/commits/{pr['headRefOid']}"))
  row['headTree']=c['tree']['sha']
 except Exception as e: row['headTreeQueryError']=str(e)
 rows.append(row)
seerr=next(x for x in rows if x['number']==418)
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{seerr['headRefName']}").split()[0]
seerr['remoteBranchOid']=remote
result={'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'liveLocalizationPullRequests':rows}
(ROOT/'live-localization-prs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps([{'repository':x['repository'],'number':x['number'],'state':x['state'],'isDraft':x['isDraft'],'headRefOid':x['headRefOid'],'headTree':x.get('headTree'),'remoteBranchOid':x.get('remoteBranchOid')} for x in rows],ensure_ascii=False,indent=2))
