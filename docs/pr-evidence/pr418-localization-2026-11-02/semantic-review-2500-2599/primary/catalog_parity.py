from __future__ import annotations
import hashlib,json,subprocess,pathlib
from datetime import datetime,timezone
ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode()).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def flatten(d,p=''):
 for k,v in d.items():
  q=f'{p}.{k}' if p else k
  if isinstance(v,dict): yield from flatten(v,q)
  else: yield q,v
path='src/i18n/locale/'
enb=git('show',f'{HEAD}:{path}en.json'); en_obj=json.loads(enb); en=list(flatten(en_obj)); enkeys=[k for k,v in en]
source_hash=sha(enb); source_blob=subprocess.check_output(['git','-C',str(REPO),'rev-parse',f'{HEAD}:{path}en.json'],text=True).strip()
records=[]
for loc in LOCALES:
 raw=git('show',f'{HEAD}:{path}{loc}.json'); keys=[k for k,v in flatten(json.loads(raw))]
 first=[]
 mismatch_count=0
 for pos,(a,b) in enumerate(zip(enkeys,keys)):
  if a!=b:
   mismatch_count+=1
   if len(first)<10: first.append({'zeroBasedPosition':pos,'sourceId':a,'localeId':b})
 records.append({'locale':loc,'path':path+loc+'.json','blob':subprocess.check_output(['git','-C',str(REPO),'rev-parse',f'{HEAD}:{path}{loc}.json'],text=True).strip(),
  'fileSha256':sha(raw),'fileBytes':len(raw),'keyCount':len(keys),'keySetParity':set(enkeys)==set(keys),'sourceOnlyKeyCount':len(set(enkeys)-set(keys)),'localeOnlyKeyCount':len(set(keys)-set(enkeys)),
  'orderedKeyParity':enkeys==keys,'orderedMismatchCount':mismatch_count,'firstOrderedMismatches':first,'orderedKeyListSha256':sha(canon(keys)),'sortedKeySetSha256':sha(canon(sorted(keys)))})
result={'repository':'snapetech-org/SeerrNG','pullRequest':418,'head':HEAD,'sourceCatalog':{'path':path+'en.json','blob':source_blob,'fileSha256':source_hash,'fileBytes':len(enb),'keyCount':len(enkeys),'orderedKeysSha256':sha(canon(enkeys))},'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'locales':records,'allLocalesExactKeySetParity':all(x['keySetParity'] for x in records),'localesWithOrderDifferences':[x['locale'] for x in records if not x['orderedKeyParity']]}
(ROOT/'catalog-parity.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
items=en
boundary=[]
for pos in (2499,2500,2599,2600):
 sid,text=items[pos]
 boundary.append({'sourcePosition':pos,'sourceId':sid,'sourceIdSha256':sha(sid),'sourceText':text,'sourceTextSha256':sha(text),'sourceCatalogBlob':source_blob,'sourceFileSha256':source_hash})
(ROOT/'source-boundaries.json').write_text(json.dumps({'head':HEAD,'tree':subprocess.check_output(['git','-C',str(REPO),'rev-parse',f'{HEAD}^{{tree}}'],text=True).strip(),'definition':'zero-based insertion order after recursively flattening the English catalog in JSON property order','positions':boundary},ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps({'localeKeySetParity':result['allLocalesExactKeySetParity'],'orderDifferent':result['localesWithOrderDifferences'],'counts':{x['locale']:x['keyCount'] for x in records},'boundaries':[(x['sourcePosition'],x['sourceId']) for x in boundary]},ensure_ascii=False,indent=2))
