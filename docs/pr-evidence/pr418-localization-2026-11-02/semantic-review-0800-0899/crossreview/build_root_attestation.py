import hashlib,json,subprocess
from pathlib import Path
REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-batch-0000-0399')
PACKET=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w700-749-review-20261102')
PRIMARY=PACKET/'reviews/agent-0800-0899/semantic-review-ledger.jsonl'
OUT=PACKET/'reviews/crossreview-0800-0899'
PRIMARY_HEAD='d633a7ed184bc9571a1a805da1bd25cef28d1599'
PRIMARY_TREE='abb501be60a5208a720c053976e94df72af8117e'
HEAD='85188b1964b6bf473219c566b196d5eda94396e3'
TREE='50bb1f456e29259dfe6dd022cea11da625a6cca6'
def H(b): return hashlib.sha256(b).hexdigest()
def T(s): return H(s.encode('utf-8'))
def read_jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def write_jsonl(p,rows): p.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows),encoding='utf-8')
def git(*args,raw=False):
 b=subprocess.check_output(['git',*args],cwd=REPO)
 return b if raw else b.decode().strip()
assert git('rev-parse','HEAD')==HEAD
assert git('rev-parse','HEAD^{tree}')==TREE
rows=read_jsonl(PRIMARY)
assert len(rows)==1200 and len({(r['id'],r['locale']) for r in rows})==1200
source=json.loads((REPO/'src/i18n/locale/en.json').read_text(encoding='utf-8'))
locale_cache={}
att=[]
context_refs=[]
for r in rows:
 key=r['id']; loc=r['locale'];
 assert (r['liveHead'],r['liveTree']) in {(PRIMARY_HEAD,PRIMARY_TREE),('d1137d06ffb5af57ef599ac9bf495aff2a990a7b','0aa22f0bb43e3e30d216e2ae19939220e05f04f7')}
 assert r['sourceCurrentReattestedAtNewHead'] is True
 assert r['callerContextReattestedAtNewHead'] is True
 sv=source[key]
 assert sv==r['source'] and T(sv)==r['sourceHash'],(key,loc,'source')
 path=r['targetFile']
 if path not in locale_cache: locale_cache[path]=json.loads((REPO/path).read_text(encoding='utf-8'))
 tv=locale_cache[path][key]
 assert tv==r['currentTarget'] and T(tv)==r['currentTargetHash'],(key,loc,'target')
 if r.get('currentSourceFileBlob') is not None: assert r['currentSourceFileBlob']==git('rev-parse',f'{HEAD}:src/i18n/locale/en.json')
 # Target catalog blob may change across disjoint review windows; exact selected target hashes are checked above.
 if r['status']=='correction-needed':
  assert T(r['proposedTarget'])==r['proposedTargetHash']
 att.append({'sourceIdPosition':r['sourceIdPosition'],'sourceId':key,'locale':loc,'sourceHash':T(sv),'currentTargetHash':T(tv),'attestedHead':HEAD,'attestedTree':TREE,'sourceMatchesCurrentHead':True,'targetMatchesCurrentHead':True})
 for c in r.get('sourceContextCallers',[]): context_refs.append((key,c))

unique={(sid,c['path'],c['line']):c for sid,c in context_refs}
file_cache={}
caller_att=[]
for (sid,path,line),c in sorted(unique.items()):
 if path not in file_cache:
  raw=git('show',f'{HEAD}:{path}',raw=True)
  blob=git('rev-parse',f'{HEAD}:{path}')
  file_cache[path]=(raw.decode('utf-8').splitlines(),blob)
 lines,blob=file_cache[path]
 exact=lines[line-1]
 assert blob==c['fileBlob'],(sid,path,line,'blob')
 assert exact.strip()==c['lineText'],(sid,path,line,'line')
 assert H(exact.encode('utf-8'))==c['lineSha256'],(sid,path,line,'linehash')
 if c.get('previousLine') is not None: assert lines[line-2].strip()==c['previousLine'],(sid,path,line,'prev')
 if c.get('nextLine') is not None: assert lines[line].strip()==c['nextLine'],(sid,path,line,'next')
 caller_att.append({'sourceId':sid,'path':path,'line':line,'fileBlob':blob,'lineSha256':c['lineSha256'],'lineText':c['lineText'],'previousLine':c.get('previousLine'),'nextLine':c.get('nextLine'),'attestedHead':HEAD,'matchedAtCurrentHead':True})

assert len(att)==1200
assert len(caller_att)==547
assert sum(r['status']=='correction-needed' for r in rows)==281
assert sum(r['status']=='prior-disposition-preserved' for r in rows)==14
OUT.mkdir(parents=True,exist_ok=True)
write_jsonl(OUT/'new-head-source-current-attestation.jsonl',att)
write_jsonl(OUT/'caller-context-attestation.jsonl',caller_att)
prior=[r for r in rows if r['status']=='prior-disposition-preserved']
assert len(prior)==14
# Preserve primary routed records byte for byte by copying source line bytes in original order.
raw=PRIMARY.read_bytes().splitlines(keepends=True)
source_prior=[]
for b in raw:
 r=json.loads(b)
 if r['status']=='prior-disposition-preserved': source_prior.append(b)
(OUT/'preserved-prior-routing-rows.jsonl').write_bytes(b''.join(source_prior))
print(json.dumps({'head':HEAD,'tree':TREE,'sourceCurrentRows':len(att),'sourceCurrentMismatches':0,'uniqueCallerReferences':len(caller_att),'callerMismatches':0,'candidateRows':281,'priorRowsCopied':len(source_prior),'primarySha256':H(PRIMARY.read_bytes())},indent=2))
