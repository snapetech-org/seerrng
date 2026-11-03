#!/usr/bin/env python3
"""Re-attest the sealed W3240-W3259 source/cat/context pins at live PR head c335..."""
import hashlib, json, subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO = Path('/mnt/disks/scratch/task-worktrees/localization-20261103/seerrng-pr418-w3240-primary-20261103')
INPUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-3259-20261103/clean-input')
PRIMARY = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-3259-20261103/primary')
BLIND = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-blind-root-20261103')
OUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3240-adjudication-20261103')
HEAD = 'c335cbd29244207e534f8a4f0d1e139d12c104c0'
TREE = 'baa8c358f7e0e286ebd4209f4fca9b62f78be5f6'
BRANCH = 'refs/heads/codex/seerrng-localization-overhaul-20261028'

def sha(b): return hashlib.sha256(b).hexdigest()
def dumpj(x): return json.dumps(x, ensure_ascii=False, sort_keys=True, indent=2)+'\n'
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args], text=True).strip()
def gitbytes(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def loadj(p): return json.loads(p.read_text(encoding='utf-8'))
def jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def require(ok, msg):
    if not ok: raise SystemExit('ABORT: '+msg)

live_head = subprocess.check_output(['gh','api','repos/snapetech-org/seerrng/pulls/418','--jq','.head.sha'],cwd=REPO,text=True).strip()
pr_meta = json.loads(subprocess.check_output(['gh','api','repos/snapetech-org/seerrng/pulls/418','--jq','{state:.state,draft:.draft,head:.head.sha,headRef:.head.ref}'],cwd=REPO,text=True))
remote_line = subprocess.check_output(['git','-C',str(REPO),'ls-remote','origin',BRANCH],text=True).strip()
remote_head = remote_line.split()[0] if remote_line else ''
require(live_head == HEAD and remote_head == HEAD and pr_meta['head'] == HEAD, f'live PR/branch head drift: {live_head} / {remote_head}')
require(pr_meta['state']=='open' and pr_meta['draft'] is True, 'PR state/draft changed')
require(pr_meta['headRef']=='codex/seerrng-localization-overhaul-20261028', 'PR head ref changed')
require(git('rev-parse',HEAD+'^{tree}') == TREE, 'tree mismatch')
require(subprocess.check_output(['gh','api',f'repos/snapetech-org/seerrng/git/commits/{HEAD}','--jq','.tree.sha'],cwd=REPO,text=True).strip() == TREE, 'GitHub tree mismatch')

window=loadj(INPUT/'window.json')
boundaries=loadj(INPUT/'source-boundaries.json')
cells=jsonl(INPUT/'review-input.jsonl')
contexts=jsonl(INPUT/'caller-contexts.jsonl')
primary=jsonl(PRIMARY/'primary-decisions.jsonl')
blind=jsonl(BLIND/'independent-decisions.jsonl')
require(window['head']=='d514838bbcca18d7255ba04a0266c4a78b41a499' and window['tree']=='3c90e26e7e04e4e008ed43f4004dbb0048357f92','review input pin unexpected')
require(len(cells)==len(primary)==len(blind)==240,'row count mismatch')
require(len(contexts)==window['contextRows']==108,'caller context count mismatch')

changes=subprocess.check_output(['git','-C',str(REPO),'diff','--name-status','d514838bbcca18d7255ba04a0266c4a78b41a499',HEAD],text=True).splitlines()
changed_paths=[x.split('\t',1)[-1] for x in changes]
locale_pins=window['localeCatalogPins']
caller_pins=window['callerFiles']
require(set(changed_paths).isdisjoint(set(locale_pins)|set(caller_pins)), 'review-relevant file changed between review and current head')

catalogs={}
catalog_checks=[]
for path,pin in locale_pins.items():
    raw=gitbytes('show',f'{HEAD}:{path}')
    obj=json.loads(raw)
    ordered_hash=sha('\n'.join(obj).encode('utf-8'))
    check={'path':path,'sha256':sha(raw),'gitBlob':git('rev-parse',f'{HEAD}:{path}'),'keyCount':len(obj),'orderedKeySha256':ordered_hash}
    expected={'sha256':pin['sha256'],'gitBlob':pin['gitBlob'],'keyCount':pin['keyCount'],'orderedKeySha256':pin['orderedKeySha256']}
    require(check=={'path':path,**expected},f'catalog pin mismatch at current head: {path}')
    catalogs[path]=obj
    catalog_checks.append(check)
source=catalogs['src/i18n/locale/en.json']
source_ids=sorted(source)
require(len(source_ids)==9494 and sha('\n'.join(source_ids).encode('utf-8'))==window['sourceOrderSha256'],'English source order mismatch')
require(source_ids[3239]==boundaries['before']['id'] and source_ids[3240]==boundaries['first']['id'] and source_ids[3259]==boundaries['last']['id'] and source_ids[3260]==boundaries['after']['id'],'window boundary mismatch')
for path,obj in catalogs.items():
    require(set(obj)==set(source) and len(obj)==9494,f'locale key set/count mismatch: {path}')

current_cell_checks=[]
loc_by_path={pin['catalogPath'].split('/')[-1][:-5]:pin['catalogPath'] for pin in cells}
for cell,p,b in zip(cells,primary,blind):
    key=cell['id']; loc=cell['locale']
    require(source[key]==cell['source'] and sha(cell['source'].encode('utf-8'))==cell['sourceSha256'],f'source mismatch {cell["position"]}:{loc}')
    current=catalogs[cell['catalogPath']][key]
    current_sha=sha(current.encode('utf-8'))
    trans_hash=sha(json.dumps(current,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    require(current==cell['currentTarget'] and current_sha==cell['currentTargetSha256'] and trans_hash==cell['catalogTranslationHash'],f'current target mismatch {cell["position"]}:{loc}')
    require(p['source']==cell['source'] and p['currentTarget']==current and b['source']==cell['source'] and b['currentTarget']==current,f'review row mismatch {cell["position"]}:{loc}')
    current_cell_checks.append({'position':cell['position'],'locale':loc,'id':key,'sourceSha256':cell['sourceSha256'],'currentTargetSha256':current_sha,'catalogTranslationHash':trans_hash})

caller_checks=[]
for path,pin in caller_pins.items():
    raw=gitbytes('show',f'{HEAD}:{path}')
    check={'path':path,'sha256':sha(raw),'gitBlob':git('rev-parse',f'{HEAD}:{path}'),'lineCount':len(raw.decode('utf-8').splitlines())}
    require(check=={'path':path,**pin},f'caller file pin mismatch: {path}')
    caller_checks.append(check)
caller_bytes={p:gitbytes('show',f'{HEAD}:{p}').decode('utf-8').splitlines() for p in caller_pins}
for row in contexts:
    lines=caller_bytes[row['file']]
    count=len(row['context'].split('\n'))
    start=row['contextStartLine']-1
    actual='\n'.join(lines[start:start+count])
    require(row['fileSha256']==caller_pins[row['file']]['sha256'],f'caller context file hash mismatch {row["file"]}:{row["line"]}')
    require(actual==row['context'] and sha(actual.encode('utf-8'))==row['contextSha256'],f'caller context snippet mismatch {row["file"]}:{row["line"]}')

report={
    'repository':'snapetech-org/seerrng','pullRequest':418,
    'reviewInputHead':window['head'],'reviewInputTree':window['tree'],
    'reattestedPrHead':HEAD,'reattestedTree':TREE,'headRef':pr_meta['headRef'],'prState':pr_meta['state'],'prDraft':pr_meta['draft'],
    'remoteBranchHead':remote_head,'reviewToCurrentChangedPaths':changed_paths,
    'relevantFilesChanged':False,'sourceOrderCount':len(source_ids),'sourceOrderSha256':window['sourceOrderSha256'],
    'catalogsReattested':len(catalog_checks),'allCatalogPinsMatched':True,
    'localeCatalogKeySetsMatchedEnglish':True,'keysPerCatalog':9494,
    'cellsReattested':len(current_cell_checks),'allSourceCurrentAndTranslationHashesMatched':True,
    'callerFilesReattested':len(caller_checks),'allCallerFilePinsMatched':True,
    'callerContextRowsReattested':len(contexts),'allCallerContextSnippetsMatched':True,
    'catalogChecks':catalog_checks,'callerFileChecks':caller_checks,
    'currentCellChecks':current_cell_checks,
    'primaryLedgerSha256':sha((PRIMARY/'primary-decisions.jsonl').read_bytes()),
    'blindLedgerSha256':sha((BLIND/'independent-decisions.jsonl').read_bytes()),
    'checkedAtUtc':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'evidenceOnlyCommitAfterReview':True,
}
(OUT/'live-head-reattestation.json').write_text(dumpj(report),encoding='utf-8')
print(dumpj({k:v for k,v in report.items() if k not in ('catalogChecks','callerFileChecks','currentCellChecks')}),end='')
