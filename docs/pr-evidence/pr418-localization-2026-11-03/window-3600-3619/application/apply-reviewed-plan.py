#!/usr/bin/env python3
"""Apply only exact cross-audited string values to the pinned locale catalogs."""
import collections, hashlib, json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
EV=HERE.parent
REPO=EV.parents[3]
PLAN=json.loads((HERE/'approved-application-plan.json').read_text(encoding='utf-8'))
HEAD=PLAN['parentHead']; TREE=PLAN['parentTree']
def run(args): return subprocess.check_output(args,cwd=REPO,text=True).strip()
def sha(b): return hashlib.sha256(b).hexdigest()
assert run(['git','rev-parse','HEAD'])==HEAD and run(['git','rev-parse','HEAD^{tree}'])==TREE
assert subprocess.run(['git','diff','--quiet'],cwd=REPO).returncode==0
assert subprocess.run(['git','diff','--cached','--quiet'],cwd=REPO).returncode==0
status=run(['git','status','--porcelain'])
for line in status.splitlines():
    if line.startswith('?? '):
        path=line[3:].strip()
        assert path=='docs/pr-evidence/pr418-localization-2026-11-03/window-3600-3619/',path
    else: raise AssertionError(('unexpected tracked worktree state',line))
assert PLAN['cellCount']==240 and PLAN['changeCount']==25
changes=PLAN['changes']; grouped=collections.defaultdict(list)
for cell in changes: grouped[cell['catalogPath']].append(cell)
prepared={}
decoder=json.JSONDecoder()
for catalog,entries in grouped.items():
    path=REPO/catalog
    raw=path.read_bytes(); text=raw.decode('utf-8')
    assert sha(raw)==entries[0]['catalogSha256'],(catalog,'byte hash drift')
    assert run(['git','hash-object',catalog])==entries[0]['catalogGitBlob'],(catalog,'blob drift')
    obj=json.loads(text)
    assert len({e['sourceId'] for e in entries})==len(entries)
    lines=text.splitlines(keepends=True)
    replaced=set()
    for e in entries:
        key=e['sourceId']; key_token=json.dumps(key,ensure_ascii=False)
        matches=[]
        for i,line in enumerate(lines):
            start=len(line)-len(line.lstrip(' \t'))
            if line[start:].startswith(key_token): matches.append((i,start))
        assert len(matches)==1,(catalog,key,'expected one JSON member line',len(matches))
        i,start=matches[0]; line=lines[i]
        assert line[start+len(key_token):].lstrip().startswith(':'),(catalog,key,'member parse')
        colon=line.index(':',start+len(key_token)); value_start=colon+1
        while value_start<len(line) and line[value_start] in ' \t': value_start+=1
        old,end=decoder.raw_decode(line,value_start)
        assert old==e['currentTarget']==obj[key],(catalog,key,'current target drift')
        encoded=json.dumps(e['finalTarget'],ensure_ascii=False)
        lines[i]=line[:value_start]+encoded+line[end:]
        replaced.add(key)
    assert replaced=={e['sourceId'] for e in entries}
    newtext=''.join(lines); newobj=json.loads(newtext)
    for e in entries: assert newobj[e['sourceId']]==e['finalTarget']
    prepared[catalog]=(path,raw,newtext.encode('utf-8'))
# Do not start writing until every target line and every catalog parses cleanly.
for catalog,(path,before,after) in prepared.items():
    path.write_bytes(after)
    assert path.read_bytes()==after
print(json.dumps({'status':'PASS','parentHead':HEAD,'parentTree':TREE,'appliedChanges':len(changes),
 'changedCatalogs':sorted(prepared),'preApplyHashes':{c:sha(v[1]) for c,v in sorted(prepared.items())},
 'postApplyHashes':{c:sha(v[2]) for c,v in sorted(prepared.items())}},ensure_ascii=False,indent=2))
