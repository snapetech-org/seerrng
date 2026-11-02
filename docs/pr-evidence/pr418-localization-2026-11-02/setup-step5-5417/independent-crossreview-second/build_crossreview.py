import hashlib, json, pathlib, subprocess
from datetime import datetime, timezone

OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-configureservices-crossreview-20261102')
PRIMARY=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-configureservices-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='58697945e3d3fb44c37d49db0cc0f88e3af110cc'; TREE='e3076937fe10b4dd3821ea573e8e5e21601fce7d'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

def sha(b):
    if isinstance(b,str): b=b.encode('utf-8')
    return hashlib.sha256(b).hexdigest()
def git(*args): return subprocess.check_output(['git','-C',str(REPO),*args],text=True).strip()
def git_bytes(*args): return subprocess.check_output(['git','-C',str(REPO),*args])
def jwrite(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def line_digest(text): return sha(text)

# Validate the supplied primary packet checksum list before consuming it.
primary_sum_lines=(PRIMARY/'SHA256SUMS').read_text().splitlines()
primary_sum_map={line.split('  ',1)[1]:line.split('  ',1)[0] for line in primary_sum_lines}
for name,digest in primary_sum_map.items():
    assert sha((PRIMARY/name).read_bytes())==digest, f'primary packet checksum mismatch: {name}'
primary_rows=[json.loads(line) for line in (PRIMARY/'primary-review.jsonl').read_text().splitlines()]
assert len(primary_rows)==12 and {r['locale'] for r in primary_rows}==set(LOCALES)
assert {(r['sourcePosition'],r['sourceId'],r['source']) for r in primary_rows}=={(5417,'components.Setup.configureservices','Connect Services')}

# Exact live local/PR/remote identity, read only.
assert git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE
pr=json.loads(subprocess.check_output(['gh','pr','view','418','--repo','snapetech-org/SeerrNG','--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],text=True))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD
remote_lines=subprocess.check_output(['git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{pr['headRefName']}",'refs/pull/418/head'],text=True).splitlines()
remote_refs={line.split('\t',1)[1]:line.split('\t',1)[0] for line in remote_lines}
assert remote_refs[f"refs/heads/{pr['headRefName']}"]==HEAD and remote_refs['refs/pull/418/head']==HEAD

# Reattest English and every locale catalog, current value hashes, and catalog Git blobs.
source_path='src/i18n/locale/en.json'; source_raw=git_bytes('show',f'{HEAD}:{source_path}'); source=json.loads(source_raw)
source_id='components.Setup.configureservices'; source_text=source[source_id]
assert source_text=='Connect Services' and sha(source_text)=='0479b0d72d394280859ac2b8c67e9e0379fe087696b399caa54676f65ebd265e'
source_catalog_blob=git('rev-parse',f'{HEAD}:{source_path}')
current_status=git('status','--porcelain=v1','--untracked-files=all').splitlines()
tracked_clean=(git('diff','--quiet')=='' and git('diff','--cached','--quiet')=='')
locale_catalogs={}; catalog_attestations={}
for loc in LOCALES:
    path=f'src/i18n/locale/{loc}.json'; raw=git_bytes('show',f'{HEAD}:{path}'); data=json.loads(raw)
    locale_catalogs[loc]=data
    catalog_attestations[loc]={'path':path,'gitBlob':git('rev-parse',f'{HEAD}:{path}'),'fileSha256':sha(raw),'bytes':len(raw),'keyCount':len(data),'target':data[source_id],'targetSha256':sha(data[source_id])}
assert all(set(locale_catalogs[l])==set(source) for l in LOCALES)

# Caller file/blob/line pins reattestation.
caller_input=json.loads((PRIMARY/'caller-context.json').read_text())
caller_path=caller_input['callerFile']; caller_raw=git_bytes('show',f'{HEAD}:{caller_path}')
caller_lines=caller_raw.decode('utf-8').splitlines()
caller_blob=git('rev-parse',f'{HEAD}:{caller_path}')
assert caller_blob==caller_input['callerFileGitBlob']
caller_pin_attestations=[]
for ref in caller_input['references']:
    assert ref['file']==caller_path and ref['blob']==caller_blob
    actual=caller_lines[ref['line']-1]
    assert actual.strip()==ref['text'], f"caller line mismatch {ref['line']}"
    caller_pin_attestations.append({'file':caller_path,'line':ref['line'],'lineText':actual.strip(),'lineSha256':line_digest(actual),'gitBlob':caller_blob})

# Cross-review: accept all three source proposals; independently flag Spanish for a possible explicit-object refinement.
EXTRA={'es':{'decision':'recommend-additional-refinement','target':'Conectar servicios','rationale':'The current “Conectar” says “Connect” but omits the source object. As a step label beside the distinct media-server setup step, “Conectar servicios” preserves the distinction and remains concise.','confidence':'moderate'}}
LOCALE_RATIONALE={
'ar':'إعداد الخدمات conveys setting up/configuring services in the setup flow and fits the services stage.',
'de':'Dienste konfigurieren clearly identifies service configuration, distinct from the media-server step.',
'es':'Conectar is understandable in the destination step, but the cross-review recommends restoring the source object as Conectar servicios.',
'fr':'Configurer les services clearly names the service-configuration stage.',
'hi':'सेवाओं को कॉन्फ़िगर करना names the services and reads as the setup action.',
'id':'Atur Layanan conveys setting up services for this setup stage.',
'ja':'連携サービスの設定 describes configuring linked services, which fits the integration setup stage.',
'ko':'서비스 구성 concisely labels service configuration.',
'pt_BR':'Configurar Serviços clearly labels service setup.',
'vi':'The current value appends the unrelated English token Name. Kết nối dịch vụ removes the leak and says Connect Services.',
'zh_Hans':'The current 配置服务器 means configure a server; the caller is the service-connection stage. 连接服务 matches the source and caller.',
'zh_Hant':'The current 設定伺服器 means configure a server; the caller is the service-connection stage. 連接服務 matches the source and caller.'}
proposals={r['locale']:r for r in primary_rows if r['proposedTarget'] is not None}
assert set(proposals)=={'vi','zh_Hans','zh_Hant'}
ledger=[]
for loc in LOCALES:
    p=next(r for r in primary_rows if r['locale']==loc)
    current=locale_catalogs[loc][source_id]
    assert current==p['currentTarget'] and sha(current)==p['currentTargetSha256']
    primary_target=p['proposedTarget']
    if primary_target is not None:
        assert sha(primary_target)==p['proposedTargetSha256']
        final=primary_target; decision='accept-primary-proposal'; proposal_status='accepted'; independent_rationale=LOCALE_RATIONALE[loc]
        confidence='high' if loc in ('vi','zh_Hans','zh_Hant') else 'moderate'
    else:
        final=current; decision='accept-current'; proposal_status='not-applicable'; independent_rationale=LOCALE_RATIONALE[loc]; confidence='moderate'
    extra=EXTRA.get(loc)
    if extra:
        final=extra['target']; decision=extra['decision']; proposal_status='no-primary-proposal; additional-refinement-recommended'; independent_rationale=extra['rationale']; confidence=extra['confidence']
    # This source contains no placeholders or rich-text markup in the current or proposed strings.
    assert not any(ch in source_text+current+final for ch in '{}<>')
    caller_refs=[{'line':x['line'],'lineText':x['lineText'],'lineSha256':x['lineSha256'],'gitBlob':caller_blob} for x in caller_pin_attestations]
    ledger.append({'schemaVersion':1,'reviewer':'independent-machine-assisted-cross-review','repository':'snapetech-org/SeerrNG','pullRequest':418,'exactHead':HEAD,'exactTree':TREE,
      'sourcePosition':5417,'sourceId':source_id,'source':source_text,'sourceSha256':sha(source_text),'sourceCatalogPath':source_path,'sourceCatalogBlob':source_catalog_blob,'sourceCatalogSha256':sha(source_raw),
      'locale':loc,'localeCatalogPath':catalog_attestations[loc]['path'],'localeCatalogBlob':catalog_attestations[loc]['gitBlob'],'localeCatalogSha256':catalog_attestations[loc]['fileSha256'],
      'currentTarget':current,'currentTargetSha256':sha(current),'primaryDisposition':p['disposition'],'primaryProposal':primary_target,'primaryProposalSha256':sha(primary_target) if primary_target is not None else None,
      'crossReviewDecision':decision,'proposalStatus':proposal_status,'finalTarget':final,'finalTargetSha256':sha(final),'rationale':independent_rationale,'confidence':confidence,
      'callerFile':caller_path,'callerFileBlob':caller_blob,'callerFileSha256':sha(caller_raw),'callerLinePins':caller_refs,'callerContextSha256':sha((PRIMARY/'caller-context.json').read_bytes()),
      'placeholders':{'source':[],'current':[],'final':[],'status':'exact-empty'},'markup':{'source':[],'current':[],'final':[],'status':'exact-empty'},
      'nativeSpeakerApproved':False,'hold':None})

# Explicit no-repo-change observation; the shared untracked browser scratch symlink is preserved.
allowed_status=['?? .next-webpack-dev']
assert tracked_clean and (not current_status or current_status==allowed_status)
symlink=REPO/'.next-webpack-dev'
assert not current_status or (symlink.is_symlink() and str(symlink.resolve())=='/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2800-2899-browser-20261102/.next-webpack-dev')
summary={'schemaVersion':1,'repository':'snapetech-org/SeerrNG','pullRequest':418,'prState':pr['state'],'isDraft':pr['isDraft'],'exactHead':HEAD,'exactTree':TREE,'remoteBranchHead':remote_refs[f"refs/heads/{pr['headRefName']}"],'remotePullHead':remote_refs['refs/pull/418/head'],'sourcePosition':5417,'sourceId':source_id,'source':source_text,'locales':LOCALES,'cellsReviewed':len(ledger),'primaryProposalDisposition':{'accepted':len(proposals),'revised':0,'rejected':0},'independentDecisionCounts':{'accept-current':8,'accept-primary-proposal':3,'recommend-additional-refinement':1},'additionalRecommendation':{'locale':'es','current':'Conectar','target':'Conectar servicios','confidence':'moderate'},'unresolvedHolds':0,'nativeSpeakerReviewOutstanding':True,'browserReview':'Not repeated in a browser. The Vietnamese leak is confirmed from the exact locale value and pinned Setup navigation rendering that value; caller lines and service-stage code are independently reattested.','sourceAndCatalogReattestation':'English source plus all 12 locale catalog blobs and file hashes verified at exact head; 12 current targets and the 3 primary proposal hashes rechecked.','callerPinCount':len(caller_pin_attestations),'callerPinsReattested':True,'trackedRepositoryClean':tracked_clean,'preservedExistingUntrackedStatus':current_status,'repositoryOrPrEdited':False,'testsBuildsScansCi':False,'confidence':'moderate'}
reattest={'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'repository':'snapetech-org/SeerrNG','pullRequest':418,'pr':pr,'localHead':git('rev-parse','HEAD'),'localTree':git('rev-parse','HEAD^{tree}'),'remoteRefs':remote_refs,'sourceCatalog':{'path':source_path,'gitBlob':source_catalog_blob,'fileSha256':sha(source_raw),'bytes':len(source_raw),'sourceId':source_id,'source':source_text,'sourceSha256':sha(source_text)},'localeCatalogs':catalog_attestations,'caller':{'path':caller_path,'gitBlob':caller_blob,'fileSha256':sha(caller_raw),'references':caller_pin_attestations},'primaryPacketFiles':{name:digest for name,digest in primary_sum_map.items()},'trackedRepositoryClean':tracked_clean,'preservedExistingUntrackedStatus':current_status}
(OUT/'review-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in ledger),encoding='utf-8')
jwrite('summary.json',summary); jwrite('exact-head-reattestation.json',reattest)
readme=f'''# SeerrNG PR #418 cross-review: “Connect Services”

- **Exact PR head/tree:** `{HEAD}` / `{TREE}`. Live PR, local checkout, official branch, and PR ref agree; PR is open and draft.
- **Scope:** English source position 5417, `components.Setup.configureservices`, across all 12 direct locales.
- **Primary proposals:** all three are accepted: Vietnamese `Kết nối dịch vụ`, Simplified Chinese `连接服务`, Traditional Chinese `連接服務`. None was revised or rejected.
- **Additional review finding:** recommend Spanish `Conectar servicios` to restore the source object omitted by current `Conectar`. Confidence moderate; the current is understandable in context.
- **Caller:** exact `src/components/Setup/index.tsx` lines 436, 465, and 500 render this message in the services-connection stage. The exact `SetupConnectionsGuide` source distinguishes media-server setup from service integrations. Chinese “configure server” is therefore mismatched.
- **Vietnamese:** exact current catalog value is `Cấu hình Dịch vụName`; the appended English `Name` is unrelated to “Connect Services”. The pinned Setup navigation renders this value. Proposed `Kết nối dịch vụ` removes the leak and matches the stage.
- All 12 locale catalog blobs and values, the English source, 3 candidate hashes, caller blob and 4 caller line pins were reattested. Source/current/final placeholder and markup profiles are empty.
- **Disposition:** 8 accept-current, 3 accept-primary-proposal, 1 additional refinement recommendation. Holds: 0. Native-speaker approval remains outstanding; none is claimed.
- This review used exact source/caller evidence and static catalog values; it did not repeat browser review. No repository files or PR metadata were changed, and no tests, builds, scans, or CI were run.

Files: `review-ledger.jsonl`, `exact-head-reattestation.json`, and `summary.json`.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
# Add a compact packet manifest and deterministic checksums for every other file, including this script.
files=[]
for path in sorted(OUT.iterdir()):
    if path.is_file() and path.name!='SHA256SUMS': files.append({'path':path.name,'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())})
jwrite('manifest.json',{'schemaVersion':1,'files':files,'exactHead':HEAD,'exactTree':TREE})
files=[]
for path in sorted(OUT.iterdir()):
    if path.is_file() and path.name!='SHA256SUMS': files.append(f'{sha(path.read_bytes())}  {path.name}')
(OUT/'SHA256SUMS').write_text('\n'.join(files)+'\n',encoding='utf-8')
print(json.dumps({'summary':summary,'fileCount':len(files),'scratchDir':str(OUT)},ensure_ascii=False,indent=2))
