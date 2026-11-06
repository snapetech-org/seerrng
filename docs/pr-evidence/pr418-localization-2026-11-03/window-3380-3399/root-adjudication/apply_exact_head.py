import hashlib, json, subprocess, sys
from pathlib import Path

packet = Path(__file__).resolve().parent
repo = Path(sys.argv[1]).resolve()
expected_head = '4d7de2c41b0e6df6cd0b7f7075c9cddd1c6ce160'
expected_tree = '6fba2d5985869b4563955b2c338a93e82efb4b22'
branch = 'codex/seerrng-localization-overhaul-20261028'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo, text=True).strip()

assert git('rev-parse', 'HEAD') == expected_head
assert git('rev-parse', 'HEAD^{tree}') == expected_tree
remote = subprocess.check_output(['git','ls-remote','origin',f'refs/heads/{branch}'],cwd=repo,text=True).split()[0]
assert remote == expected_head, (remote, expected_head)
plan = [json.loads(x) for x in (packet/'apply-plan.jsonl').read_text(encoding='utf-8').splitlines()]
root_rows = [json.loads(x) for x in (packet/'root-adjudication.jsonl').read_text(encoding='utf-8').splitlines()]
assert len(plan) == 12 and len(root_rows) == 240
expected_paths={str((repo/item['catalogPath']).relative_to(repo)) for item in plan}
status_paths={line[3:] for line in subprocess.check_output(['git','status','--porcelain=v1'],cwd=repo,text=True).splitlines()}
assert status_paths <= expected_paths, (status_paths, expected_paths)
root_idx={(r['position'],r['locale']):r for r in root_rows}
prepared={}
for item in plan:
    rel=item['catalogPath']; path=repo/rel
    obj=prepared.setdefault(path, json.loads(path.read_text(encoding='utf-8')))
    source=item['sourceId']; rr=root_idx[(item['position'],item['locale'])]
    assert hashlib.sha256(rr['source'].encode()).hexdigest() == item['sourceSha256']
    current=obj[source]
    assert hashlib.sha256(item['newTarget'].encode()).hexdigest() == item['newTargetSha256']
    if current == item['expectedCurrent']:
        assert hashlib.sha256(current.encode()).hexdigest() == item['expectedCurrentSha256']
        obj[source]=item['newTarget']
    else:
        assert current == item['newTarget'], (item['position'],item['locale'],current,item['newTarget'])
for path,obj in prepared.items():
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
readback=[]
for row in root_rows:
    path=repo/row['targetCatalog']
    catalog=json.loads(path.read_text(encoding='utf-8'))
    actual=catalog[row['sourceId']]
    assert actual==row['selectedTarget'],(row['position'],row['locale'],actual,row['selectedTarget'])
    readback.append({'position':row['position'],'sourceId':row['sourceId'],'locale':row['locale'],'catalogPath':row['targetCatalog'],'selectedTarget':row['selectedTarget'],'selectedTargetSha256':row['selectedTargetSha256'],'actualTarget':actual,'actualTargetSha256':hashlib.sha256(actual.encode()).hexdigest(),'matches':True})
locale_names=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
paths=[repo/f'src/i18n/locale/{name}.json' for name in locale_names]
window=json.loads(Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3380-3399-independent-blind-20261103/candidate-free-input/window.json').read_text(encoding='utf-8'))
for name,path in zip(locale_names,paths):
    keys=list(json.loads(path.read_text(encoding='utf-8')).keys())
    pin=window['localeCatalogPins'][path.relative_to(repo).as_posix()]
    assert len(keys)==pin['keyCount']==9494
    assert hashlib.sha256('\n'.join(keys).encode()).hexdigest()==pin['orderedKeySequenceSha256_lf_join_no_trailing_lf']
assert len(readback)==240
(packet/'readback.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in readback),encoding='utf-8')
actual_paths=set(git('diff','--name-only').splitlines())
assert actual_paths == expected_paths, (actual_paths,expected_paths)
print(json.dumps({'head':expected_head,'treeBefore':expected_tree,'changedCells':len(plan),'changedCatalogs':len(prepared),'readbackCells':len(readback),'catalogFiles':len(paths),'orderedCatalogKeysPreserved':True,'changedPaths':sorted(actual_paths)},indent=2))
