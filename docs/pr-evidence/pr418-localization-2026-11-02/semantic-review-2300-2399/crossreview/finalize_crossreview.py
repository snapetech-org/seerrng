import collections,datetime,hashlib,json,pathlib,re,subprocess,sys
ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2300-2399-crossreview-20261102')
PRIMARY=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2300-2399-primary-20261102')
SUB=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2300-2399-subcrossreview-hidvi-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='d49b44895d0ded9796f0c970ad09141212e9a98f'; TREE='cebcfc11e0ea37c42f5b6e979e96cca8c89c7814'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
def sha(b):return hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
def run(*a):return subprocess.check_output(a,text=True).strip()
def git(*a):return subprocess.check_output(['git','-C',str(REPO),*a])
def flatten(d,p=''):
 for k,v in d.items():
  q=f'{p}.{k}' if p else k
  if isinstance(v,dict):yield from flatten(v,q)
  else:yield q,v
def verify_sums(path):
 out={}
 for n in ('INPUT-SHA256SUMS','SHA256SUMS'):
  r=subprocess.run(['sha256sum','-c',n],cwd=path,text=True,capture_output=True)
  out[n]={'valid':r.returncode==0,'entries':len((path/n).read_text().splitlines()),'manifestSha256':sha((path/n).read_bytes())}
  assert r.returncode==0,(path,n,r.stderr)
 return out
# Reattest the live PR, branch, checked-out tree and repository cleanliness after review.
pr=json.loads(run('gh','api','repos/snapetech-org/SeerrNG/pulls/418'))
branch=pr['head']['ref']; remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{branch}').split()[0]
api_tree=run('gh','api',f'repos/snapetech-org/SeerrNG/commits/{HEAD}','--jq','.commit.tree.sha')
state={'head':run('git','-C',str(REPO),'rev-parse','HEAD'),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}'),'status':run('git','-C',str(REPO),'status','--porcelain')}
assert state=={'head':HEAD,'tree':TREE,'status':''} and api_tree==TREE and remote==HEAD and pr['state']=='open' and pr['draft'] is True and pr['head']['sha']==HEAD
# Revalidate both source packet sets and the exact current target readbacks.
primary_sums=verify_sums(PRIMARY); sub_sums=verify_sums(SUB)
att=json.loads((ROOT/'source-catalog-attestation.json').read_text())
for x in att['sourceCatalogAndLocales']:
 raw=(REPO/x['path']).read_bytes(); blob=run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{x["path"]}')
 assert sha(raw)==x['expectedSha256']==x['observedSha256'] and blob==x['expectedBlob']==x['observedBlob'] and len(raw)==x['expectedBytes']==x['observedBytes']
for x in att['callerFiles']:
 raw=(REPO/x['path']).read_bytes(); blob=run('git','-C',str(REPO),'rev-parse',f'{HEAD}:{x["path"]}')
 assert sha(raw)==x['expectedSha256']==x['observedSha256'] and blob==x['expectedBlob']==x['observedBlob']
ledger=[json.loads(x) for x in (ROOT/'crossreview-ledger.jsonl').read_text().splitlines()]
assert len(ledger)==169
langs={l:dict(flatten(json.loads(git('show',f'{HEAD}:src/i18n/locale/{l}.json')))) for l in LOCALES}
readbacks=[]
for r in ledger:
 value=langs[r['locale']].get(r['sourceId'])
 assert value==r['currentTarget'] and sha(value)==r['currentTargetSha256'] and r['currentTargetReadbackVerified']
 target=r['crossReviewTarget']
 if target is not None:
  assert sha(target)==r['crossReviewTargetSha256']
  assert r['placeholderParityVerified'] and r['markupParityVerified'] and r['protectedLiteralParityVerified']
 readbacks.append(value)
counts=collections.Counter(r['crossReviewDisposition'] for r in ledger)
assert counts==collections.Counter({'accept-primary-proposal':149,'revise-primary-proposal':19,'retain-current':1})
assert not any(r['crossReviewDisposition']=='hold' for r in ledger)
assert sum(langs[r['locale']][r['sourceId']]==r['crossReviewTarget'] for r in ledger if r['crossReviewTarget'] is not None)==1
# Refresh final attestations and summary evidence.
final={'checkedAtLocal':datetime.datetime.now().astimezone().isoformat(),'host':run('hostname'),'passed':True,'state':pr['state'],'draft':pr['draft'],'pullRequest':418,'head':HEAD,'treeFromGitHub':api_tree,'base':pr['base']['sha'],'branch':branch,'remoteBranchHead':remote,'repositoryState':state,'sourceCatalogAnd12LocaleHashesReverified':True,'callerFileHashesAndPinnedLinesReverified':True,'primaryPacketChecksums':primary_sums,'independentSubsetPacketChecksums':sub_sums,'proposedCellCurrentTargetReadbacks':len(ledger),'currentTargetReadbackMismatches':0,'repositoryModified':False,'testsBuildsCiRun':False}
(ROOT/'final-reattestation.json').write_text(json.dumps(final,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
readback=json.loads((ROOT/'readback-evidence.json').read_text())
readback.update({'primaryPacketChecksums':primary_sums,'independentSubsetPacketChecksums':sub_sums,'finalWorktreeHead':state['head'],'finalWorktreeTree':state['tree'],'finalWorktreeStatus':state['status']})
(ROOT/'readback-evidence.json').write_text(json.dumps(readback,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
summary=json.loads((ROOT/'summary.json').read_text())
summary.update({'finalReattestationPassed':True,'primaryPacketChecksumsValidated':all(x['valid'] for x in primary_sums.values()),'independentSubsetPacketChecksumsValidated':all(x['valid'] for x in sub_sums.values()),'finalCurrentTargetReadbackMismatches':0,'finalRepositoryState':state})
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
manifest=json.loads((ROOT/'input-manifest.json').read_text())
manifest['primaryPacketChecksumValidation']=primary_sums
manifest['independentSubsetPacketChecksumValidation']=sub_sums
(ROOT/'input-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
# Hash all local audit inputs, then all packet outputs.
inputs=['attestation-before.json','input-manifest.json','manual-adjudication.json','assemble_crossreview.py','source-catalog-attestation.json','finalize_crossreview.py']
(ROOT/'INPUT-SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in inputs))
files=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in ('SHA256SUMS','INPUT-SHA256SUMS'))
(ROOT/'SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in files))
checks=verify_sums(ROOT)
print(json.dumps({'finalAttestationPassed':True,'dispositions':dict(counts),'proposalCurrentReadbacks':len(ledger),'currentReadbackMismatches':0,'catalogFilesReverified':len(att['sourceCatalogAndLocales']),'callerFilesReverified':len(att['callerFiles']),'primaryPacketChecksums':primary_sums,'subsetPacketChecksums':sub_sums,'outputChecksums':checks,'packetFiles':len(files),'packetBytes':sum(p.stat().st_size for p in ROOT.iterdir() if p.is_file())},ensure_ascii=False,indent=2))
