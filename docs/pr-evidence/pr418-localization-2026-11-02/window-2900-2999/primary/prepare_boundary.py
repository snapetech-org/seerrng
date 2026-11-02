import hashlib,json,subprocess
from pathlib import Path
out=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2900-2999-primary-20261102')
repo='/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng'; head='58697945e3d3fb44c37d49db0cc0f88e3af110cc'; locales=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def git(*args):return subprocess.check_output(['git','-C',repo,*args])
def sha(x):return hashlib.sha256(x if isinstance(x,bytes) else x.encode()).hexdigest()
en_raw=git('show',f'{head}:src/i18n/locale/en.json'); en=json.loads(en_raw); positions={key:i for i,key in enumerate(en)}
prev=out.parent/'seerrng-pr418-window-2800-2899-primary-20261102'
prior={}
for line in (prev/'primary-review-ledger.jsonl').read_text().splitlines():
 r=json.loads(line);prior[(r['sourcePosition'],r['locale'])]=r
rows=[]
for pos,role in ((2899,'previous-window-final-boundary'),(3000,'next-window-first-source-boundary')):
 sid=next(k for k,v in positions.items() if v==pos); source=en[sid]
 for loc in locales:
  raw=git('show',f'{head}:src/i18n/locale/{loc}.json'); target=json.loads(raw)[sid]
  old=prior.get((pos,loc),{}).get('finalTarget') if pos==2899 else None
  rows.append({'repository':'snapetech-org/SeerrNG','pullRequest':418,'exactHead':head,'sourcePosition':pos,'boundaryRole':role,'sourceId':sid,'source':source,'sourceTextSha256':sha(source),'sourceCatalogBlob':git('rev-parse',f'{head}:src/i18n/locale/en.json').decode().strip(),'locale':loc,'localeCatalogBlob':git('rev-parse',f'{head}:src/i18n/locale/{loc}.json').decode().strip(),'localeCatalogSha256':sha(raw),'currentTarget':target,'currentTargetHash':sha(target),'previousWindowFinalTarget':old,'previousWindowFinalTargetHash':sha(old) if old is not None else None,'priorBoundaryDispositionMatchesCurrent':old==target if old is not None else None,'priorPacketRef':'../seerrng-pr418-window-2800-2899-primary-20261102/primary-review-ledger.jsonl' if old is not None else None})
assert all(x['priorBoundaryDispositionMatchesCurrent'] is True for x in rows if x['sourcePosition']==2899)
(out/'window-boundary-all-12-readbacks.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
print(json.dumps({'rows':len(rows),'previousFinalBoundaryRows':sum(x['sourcePosition']==2899 for x in rows),'previousBoundaryExactTargetMatches':sum(x['priorBoundaryDispositionMatchesCurrent'] is True for x in rows),'forwardBoundaryRows':sum(x['sourcePosition']==3000 for x in rows)},ensure_ascii=False,indent=2))
