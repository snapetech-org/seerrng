import datetime, json, subprocess, sys
repos=[('snapetech-org/SeerrNG',418),('snapetech-org/ChaptarrNG',190),('snapetech-org/QuestarrNG',155),('snapetech-org/ROMarrNG',70),('snapetech-org/slskR',204),('snapetech-org/slskdN',409),('snapetech-org/TorrentNG',243)]
phase=sys.argv[1]
out=sys.argv[2]
def gh(endpoint):
    p=subprocess.run(['gh','api',endpoint],text=True,capture_output=True,check=True)
    return json.loads(p.stdout)
prs=[]
for repo,num in repos:
    p=gh(f'repos/{repo}/pulls/{num}')
    head=p['head']
    ref=gh(f"repos/{repo}/git/ref/heads/{head['ref']}")
    commit=gh(f"repos/{repo}/git/commits/{head['sha']}")
    prs.append({'repository':repo,'number':num,'state':p['state'].upper(),'isDraft':p['draft'],'url':p['html_url'],'baseRefName':p['base']['ref'],'baseRefOid':p['base']['sha'],'headRefName':head['ref'],'headRefOid':head['sha'],'remoteBranchOid':ref['object']['sha'],'tree':commit['tree']['sha']})
obj={'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':phase,'pullRequests':prs}
open(out,'w').write(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(obj,indent=2))
