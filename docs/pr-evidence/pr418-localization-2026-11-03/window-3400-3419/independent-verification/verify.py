import hashlib,json,pathlib,subprocess,datetime
S=pathlib.Path('/mnt/disks/scratch/task-scratch')
I=S/'seerrng-pr418-w3400-3419-candidate-free-20261103/candidate-free-input'; X=S/'seerrng-pr418-w3400-crossaudit-20261103'; P=S/'seerrng-pr418-w3400-primary-20261103'; B=S/'seerrng-pr418-w3400-blind-20261103'
W=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261103/seerrng-pr418-w3400-review-20261103'); O=S/'seerrng-pr418-w3400-independent-verification-20261103'
def h(b): return hashlib.sha256(b).hexdigest()
def ht(s): return h(s.encode('utf-8'))
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines()]
def verify(d):
 out={}
 for line in (d/'SHA256SUMS.txt').read_text().splitlines():
  dig,n=line.split('  ',1); assert h((d/n).read_bytes())==dig,(n,dig); out[n]=dig
 return out
assert {x.name for x in O.iterdir()} <= {'verify.py'}
ihash=verify(I); xhash=verify(X); phash=verify(P); bhash=verify(B)
att=j(I/'PR-attestation.json'); win=j(I/'window.json'); bounds=j(I/'source-boundaries.json')
head=win['head']; tree=win['tree']; assert att['headRefOid']==head and att['tree']==tree
assert head=='fcbc579f724e50a07dc0e12b00127c4f6084c453' and tree=='30e1e5e610e88ba935e482fc7088311d00e214ae'
assert win['range']==[3400,3419]
assert bounds['boundaryBefore']['sourceId']=='components.Requests.pendingImportAttempt' and bounds['boundaryAfter']['sourceId']=='components.Requests.requestTime'
# Pinned local checkout
local_head=subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip(); local_tree=subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD^{tree}'],text=True).strip(); status_lines=subprocess.check_output(['git','-C',str(W),'status','--porcelain'],text=True).splitlines(); clean=not status_lines
assert (local_head,local_tree)==(head,tree)
def head_file(path): return subprocess.check_output(['git','-C',str(W),'show','HEAD:'+path])
# Exact ordered catalog
catpath='src/i18n/locale/en.json'; catbytes=head_file(catpath); cat=json.loads(catbytes); flat=[]
def walk(d,prefix=''):
 for k,v in d.items():
  name=(prefix+'.' if prefix else '')+k
  walk(v,name) if isinstance(v,dict) else flat.append((name,v))
walk(cat); order=ht('\n'.join(k for k,v in flat))
assert len(flat)==9494 and order==win['sourceOrderSha256_lf_join_no_trailing_lf']
assert flat[3399]==('components.Requests.requestLifecycle','Request Lifecycle')
assert flat[3400]==('components.Requests.requestTime','Time') and flat[3420]==('components.Requests.searching','Searching')
assert [(i,flat[i][0],flat[i][1]) for i in range(3400,3420)]==[(r['position'],r['sourceId'],r['source']) for r in win['sourceIds']]
# Pinned component file and exact line evidence
rel='src/components/Requests/index.tsx'; fb=head_file(rel); lines=fb.decode().splitlines(); fsha=h(fb); blob=subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD:'+rel],text=True).strip()
pin=win['callerFilePins'][rel]; assert (fsha,blob)==(pin['sha256'],pin['gitBlob'])
roles={155:'Runtime message definition',196:'ROMs Retro message definition',197:'ROMs Modern message definition',236:'retry tooltip source',261:'refresh retry tooltip source',484:'stage message map declaration',485:'requested stage selects requested key',1195:'dynamic stage-label helper',1196:'dynamic stage-message lookup',1583:'retry tooltip render',1591:'retry callback',1914:'timeline stage label render',2061:'current stage accessible label',2127:'status history stage label',2137:'status history fallback stage label',2668:'load error retry tooltip render',2715:'retro filter maps to romsRetro',2716:'modern filter maps to romsModern',2847:'second load error retry tooltip render',2894:'task-filter option render, not ROM media filter',2920:'media filter accessible-label render',2929:'media filter visible-button render',907:'runtime message selected by media type',1748:'runtime/pages metadata label output',1751:'runtime/pages value output'}
lineev=[]
for n,role in sorted(roles.items()):
 t=lines[n-1]; lineev.append({'path':rel,'line':n,'text':t,'lineSha256':ht(t),'fileSha256':fsha,'fileGitBlob':blob,'role':role})
L={x['line']:x['text'] for x in lineev}
assert "requested: 'requested'" in L[485] and 'messages[stageMessageKeys[stage]]' in L[1196]
assert all('getStageLabel' in L[n] for n in [1914,2061,2127,2137])
assert "{ value: 'retro', label: 'romsRetro' }" in L[2715] and "{ value: 'modern', label: 'romsModern' }" in L[2716]
assert 'messages[option.label]' in L[2920] and 'messages[option.label]' in L[2929]
assert L[2894].strip().startswith('<span>') and 'taskFilterOptions.map' in lines[2884]
# Check proposals and current catalogs against all review files.
sel=[(3409,'id'),(3411,'vi'),(3413,'ar'),(3415,'zh_Hans')]
pr={(r['position'],r['locale']):r for r in jl(P/'primary-decisions.jsonl')}; bl={(r['position'],r['locale']):r for r in jl(B/'blind-decisions.jsonl')}; cr={(r['position'],r['locale']):r for r in jl(X/'cross-audit-ledger.jsonl')}
expect={(3409,'id'):'Muat ulang informasi permintaan dari Seerr. Tindakan ini tidak memulai ulang atau mengunduh media apa pun.',(3411,'vi'):'Khởi động lại yêu cầu không thành công này từ bước phê duyệt.',(3413,'ar'):'ROMs - حديثة',(3415,'zh_Hans'):'时长'}
fit=[]
for k in sel:
 p,b,c=pr[k],bl[k],cr[k]; target=c['crossAuditTarget']; assert target==expect[k] and c['head']==head and c['tree']==tree and ht(target)==c['crossAuditTargetSha256']
 locale_path=f'src/i18n/locale/{k[1]}.json'; current=json.loads(head_file(locale_path))[c['sourceId']]
 assert current==c['currentTarget'] and ht(current)==c['currentTargetSha256']
 assert target in [v for v in (p.get('candidateTarget'),b.get('candidateTarget')) if v]
 basis={3409:'Standard Indonesian spelling and explicit “this action” preserve the tooltip’s refresh-versus-restart/download distinction and Seerr name.',3411:'Restores the “from the approval step” detail on the retry action tooltip.',3413:'Matches the Modern ROM filter and Arabic non-human plural adjective agreement; cross-audit confidence was low, so native confirmation is still appropriate.',3415:'“Duration” fits the media metadata values: movie runtime, TV episode duration, and summed music duration.'}[k[0]]
 fit.append({'position':k[0],'locale':k[1],'sourceId':c['sourceId'],'currentTarget':current,'currentTargetSha256':ht(current),'recommendedTarget':target,'recommendedTargetSha256':ht(target),'primaryDecision':p['decision'],'primaryCandidateTarget':p.get('candidateTarget'),'blindDisposition':b['disposition'],'blindCandidateTarget':b.get('candidateTarget'),'crossAuditDisposition':c['crossAuditDisposition'],'fit':basis,'nativeSpeakerApproval':False})
# Direct live PR/remote/commit checks were re-run separately and matched these values.
verification={'schemaVersion':1,'artifact':'Independent verification — SeerrNG PR #418 W3400–W3419','verifiedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
 'livePin':{'state':'open','draft':True,'baseRef':'main','baseSha':'221d8e0d542802da7529cd272c928cc747677e5c','headRef':'codex/seerrng-localization-overhaul-20261028','head':head,'remoteBranchHead':head,'remotePullRefHead':head,'tree':tree,'localWorktreeCleanAtFinalCheck':clean,'workingTreeStatusAtFinalCheck':status_lines,'exactFileContentsReadFrom':'git show HEAD:<path>'},
 'inputChecksums':{'candidateFree':{'sha256SumsFileSha256':h((I/'SHA256SUMS.txt').read_bytes()),'passed':True,'files':ihash},'primary':{'sha256SumsFileSha256':h((P/'SHA256SUMS.txt').read_bytes()),'passed':True,'files':phash},'blind':{'sha256SumsFileSha256':h((B/'SHA256SUMS.txt').read_bytes()),'passed':True,'files':bhash},'thirdAudit':{'sha256SumsFileSha256':h((X/'SHA256SUMS.txt').read_bytes()),'passed':True,'files':xhash}},
 'sourceOrder':{'catalog':'src/i18n/locale/en.json','catalogSha256':h(catbytes),'catalogGitBlob':subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD:src/i18n/locale/en.json'],text=True).strip(),'entryCount':len(flat),'orderHash':order,'packetOrderHashMatches':True,'correct3399':{'sourceId':'components.Requests.requestLifecycle','source':'Request Lifecycle'},'position3400':{'sourceId':'components.Requests.requestTime','source':'Time'},'correct3420':{'sourceId':'components.Requests.searching','source':'Searching'},'selectedIdsMatch':True,'packetBeforeBoundary':bounds['boundaryBefore'],'packetAfterBoundary':bounds['boundaryAfter'],'packetBoundaryEntriesAreIncorrect':True,'verifiedRows':[{'position':i,'sourceId':flat[i][0],'source':flat[i][1]} for i in range(3399,3421)]},
 'dynamicCallerContexts':{'productionFile':{'path':rel,'sha256':fsha,'gitBlob':blob},'3401':{'dynamicSelection':[484,485,1195,1196],'renders':[1914,2061,2127,2137],'summary':'Requested stage is selected dynamically from stageMessageKeys and rendered in timeline, accessible current-stage label, and status history.'},'3413':{'sourceId':'components.Requests.romsModern','mapping':[197,2716],'render':[2920,2929],'summary':'modern media-filter option selects romsModern; its label appears in accessible MediaFilterOption label and visible button.'},'3414':{'sourceId':'components.Requests.romsRetro','mapping':[196,2715],'render':[2920,2929],'summary':'retro media-filter option selects romsRetro; its label appears in accessible MediaFilterOption label and visible button.'},'thirdAuditLine2894Correction':{'thirdAuditClaim':'dynamic filter label render for ROMs','actual':'taskFilterOptions renderer, unrelated to ROM media-filter options','correctMediaFilterRenderLines':[2920,2929],'impact':'Corrects a caller-evidence pointer; selected proposal values remain supported.'},'exactLineEvidence':lineev},
 'proposalFit':fit,'repoOrPrChanged':False,'testsBuildsCiRun':False,'nativeSpeakerApproval':False}
(O/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report='''# Independent verification — SeerrNG PR #418 W3400–W3419\n\n## Pinned source order\n\nPR #418, branch, pull ref, commit API, and local HEAD/tree match `fcbc579f724e50a07dc0e12b00127c4f6084c453`, tree `30e1e5e610e88ba935e482fc7088311d00e214ae`. Candidate-free, primary, blind, and third-audit checksum manifests pass. The shared worktree was dirty by final verification, so exact file contents were read from committed HEAD blobs; its modified files were left untouched. The pinned English catalog has 9,494 ordered keys, matching the packet order hash. The correct zero-based neighbors are **3399 `components.Requests.requestLifecycle` / “Request Lifecycle”** and **3420 `components.Requests.searching` / “Searching”**. The packet records the wrong entries (“Import attempt {attempt} of {maxAttempts}.” and “Time”) at those boundaries; the selected 3400–3419 IDs do match catalog order.\n\n## Dynamic caller contexts\n\n- **3401 Requested:** `stageMessageKeys.requested` selects the requested message; `getStageLabel` resolves the dynamic key and renders timeline, accessible current-stage, and status-history labels (lines 484–485, 1195–1196, 1914, 2061, 2127, 2137).\n- **3413 / 3414 ROMs Modern / Retro:** `mediaFilters` maps modern/retro to `romsModern`/`romsRetro` at 2715–2716. The actual accessible and visible labels render dynamically at 2920 and 2929. The third-audit pointer to line 2894 is wrong for ROMs; it renders task filters. This corrects evidence location, not the proposal.\n\n## Four reconciled proposals\n\n- **3409:id:** “Muat ulang informasi permintaan dari Seerr. Tindakan ini tidak memulai ulang atau mengunduh media apa pun.” fits both load-error refresh tooltips, preserves Seerr, and distinguishes refreshing from restarting or downloading.\n- **3411:vi:** “Khởi động lại yêu cầu không thành công này từ bước phê duyệt.” fits the retry tooltip and restores the approval-step detail.\n- **3413:ar:** “ROMs - حديثة” fits the Modern ROM filter and uses feminine singular adjective agreement for a non-human plural. The prior audit had low confidence; native confirmation remains appropriate.\n- **3415:zh_Hans:** “时长” fits the runtime metadata label; production values include movie runtime, TV episode duration, and summed music duration.\n\nNo repository or PR changes were made. No tests, builds, or CI ran. This is a machine verification, not native-speaker approval.\n'''
(O/'report.md').write_text(report,encoding='utf-8')
files=['verification.json','report.md']
(O/'SHA256SUMS.txt').write_text(''.join(f'{h((O/f).read_bytes())}  {f}\n' for f in files),encoding='utf-8')
seal={'schemaVersion':1,'algorithm':'SHA-256','sha256SumsFile':'SHA256SUMS.txt','sha256SumsSha256':h((O/'SHA256SUMS.txt').read_bytes()),'head':head,'tree':tree,'fileSha256':{f:h((O/f).read_bytes()) for f in files}}
(O/'SEAL.json').write_text(json.dumps(seal,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(O),'verificationSha256':seal['fileSha256']['verification.json'],'reportSha256':seal['fileSha256']['report.md'],'sha256SumsSha256':seal['sha256SumsSha256'],'lineEvidenceCount':len(lineev),'proposalCount':len(fit)}))
