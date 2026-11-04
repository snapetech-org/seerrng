#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import collections, hashlib, json, os, re, subprocess

T=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3740-3759-primary-20261103')
R=Path(os.environ.get('SEERRNG_REPO','/home/keith/Documents/code/task-scratch/seerrng-pr418-w3740-3759-primary-20261103/repo'))
OUT=T/'candidate-free-input'
PREV=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3720-3739-primary-20261103/candidate-free-input')
APP=R/'docs/pr-evidence/pr418-localization-2026-11-03/window-3720-3739/application'
HEAD='8d0273ebc5eb51e9d5fee0ac9a0eb022eeed06c4'
TREE='163056b8255034e3ee3a99f25b63e190c88278ee'
BRANCH='codex/seerrng-localization-overhaul-20261028'
START,END=3740,3759
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\d)[+-]?\d+(?:[,. \u00a0\u202f]\d{3})*(?:%?)(?!\d)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']

def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def run(args,cwd=None):
    if cwd is not None and args[0] not in {'git','gh'}: args=['git',*args]
    return subprocess.run(args,cwd=cwd,check=True,capture_output=True,text=True).stdout.strip()
def git(*args): return subprocess.run(['git',*args],cwd=R,check=True,capture_output=True).stdout
def show(path): return git('show',f'{HEAD}:{path}')
def blob(path): return run(['git','rev-parse',f'{HEAD}:{path}'],R)
def j(raw): return json.loads(raw)
def writej(path,x): path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def writejl(path,rows): path.parent.mkdir(parents=True,exist_ok=True); path.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def verify_sums(d):
    for line in (d/'SHA256SUMS.txt').read_text().splitlines():
        if not line.strip(): continue
        digest,name=line.split(None,1); name=name.strip().lstrip('*')
        assert sha((d/name).read_bytes())==digest,(d/name,'checksum mismatch')
def icu_tokens(text):
    out=[]; i=0
    while i<len(text):
        if text[i]!='{': i+=1; continue
        start=i; depth=1; k=i+1
        while k<len(text) and depth:
            if text[k]=='{': depth+=1
            elif text[k]=='}': depth-=1
            k+=1
        if depth: break
        body=text[start+1:k-1]; m=HEADER.match(body)
        if m:
            name,fmt=m.group(1),m.group(2); cats=[]
            if fmt in ('plural','select','selectordinal'): cats=[x.group(1) for x in CAT.finditer(body[m.end():])]
            out.append({'name':name,'formatter':fmt or None,'pluralCategories':cats})
        i=k
    return out
def catmap(ts): return {x['name']:sorted(x['pluralCategories']) for x in ts if x['pluralCategories']}
def num_values(s):
    s=re.sub(r'(?<!\w)(\d+)\s+mil\b',lambda m:str(int(m.group(1))*1000),s,flags=re.I)
    return [re.sub(r'\D','',x) for x in NUM.findall(s)]
def sig(ts): return [(x['name'],x['formatter']) for x in ts]
def gitjson(path): return j(show(path))
def line_record(lines,n):
    text=lines[n-1]
    return {'line':n,'lineSha256':st(text),'text':text}

assert not OUT.exists(),OUT
assert run(['rev-parse','HEAD'],R)==HEAD
assert run(['rev-parse','HEAD^{tree}'],R)==TREE
assert not run(['status','--porcelain'],R)
pr=j(run(['gh','pr','view','418','--repo','snapetech-org/seerrng','--json','number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url']))
assert (pr['number'],pr['state'],pr['isDraft'],pr['headRefName'],pr['headRefOid'],pr['baseRefName'],pr['baseRefOid'])==(418,'OPEN',True,BRANCH,HEAD,'main','fa40534ccced75bde1125c14760514fcd5d7de4d')
refs=run(['git','ls-remote','origin',f'refs/heads/{BRANCH}','refs/pull/418/head'],R)
rm={x.split()[1]:x.split()[0] for x in refs.splitlines()}
assert rm=={f'refs/heads/{BRANCH}':HEAD,'refs/pull/418/head':HEAD}
assert run(['gh','api',f'repos/snapetech-org/seerrng/commits/{HEAD}','--jq','.commit.tree.sha'])==TREE
verify_sums(PREV)
prev_window=j((PREV/'window.json').read_bytes())
assert prev_window['window']=='W3720-W3739' and prev_window['range']==[3720,3739]
prior_source_rows=[j(x) for x in (PREV/'source-cells.jsonl').read_text().splitlines() if x.strip()]
assert len(prior_source_rows)==20 and [x['position'] for x in prior_source_rows]==list(range(3720,3740))
prev_manifest_sha=sha((PREV/'manifest.json').read_bytes())
app_verification=j((APP/'application-verification.json').read_bytes())
assert app_verification['result']=='PASS' and app_verification['parentHead']=='1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e'
application_plan=[j(x) for x in (APP/'application-plan.jsonl').read_text().splitlines() if x.strip()]
application_readback=[j(x) for x in (APP/'application-readback.jsonl').read_text().splitlines() if x.strip()]
prior_app_holds=[j(x) for x in (APP/'prior-hold-readback.jsonl').read_text().splitlines() if x.strip()]
prior_app_rows=[{'position':x['position'],'locale':x['locale'],'sourceId':x['sourceId'],'selectedTarget':x['readbackTarget'],'selectedTargetSha256':x['readbackTargetSha256'],'selectedTargetChanged':x['readbackTarget']!=x['preimageTarget'],'disposition':x['disposition'],'catalogPath':x['catalogPath']} for x in application_readback]
prior_readback=[{'position':x['position'],'locale':x['locale'],'sourceId':x['sourceId'],'readbackSha256':x['readbackTargetSha256'],'readbackMatchesSelected':x['matches']} for x in application_readback]
plan_map={(x['position'],x['locale'],x['sourceId']):x for x in application_plan}
for x in application_plan:
    r=next(y for y in prior_app_rows if (y['position'],y['locale'],y['sourceId'])==(x['position'],x['locale'],x['sourceId']))
    assert x['selectedTarget']==r['selectedTarget'] and x['selectedTargetSha256']==r['selectedTargetSha256'] and x['preimageSha256']==st(x['preimageTarget'])
prior_app_holds=[{'position':x['position'],'locale':x['locale'],'sourceId':x['sourceId'],'targetSha256':x['readbackTargetSha256'],'priorTargetSha256':x['preimageTargetSha256'],'callerlessRetainedHold':x['preserved']} for x in prior_app_holds]
assert len(prior_app_rows)==len(prior_readback)==240 and len(application_plan)==50 and len(prior_app_holds)==12
english=j(show('src/i18n/locale/en.json')); keys=list(english)
assert len(keys)==9494 and len(set(keys))==9494
source_order_sha=sha('\n'.join(keys).encode())
assert blob('src/i18n/locale/en.json')=='12e04a118c30b71b3714291adeaf9fdb2735cee4'
assert keys[START-1]==prior_source_rows[-1]['sourceId']
assert keys[START]==prev_window['nextBoundary']['sourceId']
selected_ids=keys[START:END+1]
assert len(selected_ids)==20 and len(set(selected_ids))==20
assert len(selected_ids)==20 and keys[START-1]==prior_source_rows[-1]['sourceId'] and keys[START]==prev_window['nextBoundary']['sourceId']
prior_ids=keys[:START]; prior_ids_sha=sha('\n'.join(prior_ids).encode())
selected_ids_sha=sha('\n'.join(selected_ids).encode())
registry=gitjson('config/i18n/locales.json')
by_file={x['clientFile'].removesuffix('.json'):x for x in registry['locales']}
assert set(LOCALES)<=set(by_file)
locale_info=[{'catalogKey':k,'tag':by_file[k]['tag'],'nativeName':by_file[k]['nativeName'],'direction':by_file[k]['direction'],'clientFile':by_file[k]['clientFile'],'reviewStatus':by_file[k]['reviewStatus']} for k in LOCALES]
catalogs={}
for lk in ['en']+LOCALES:
    path=f'src/i18n/locale/{lk}.json'; raw=show(path); obj=j(raw)
    assert len(obj)==9494 and set(obj)==set(keys),(lk,'catalog key set mismatch')
    ordered=sha(json.dumps(list(obj.keys()),ensure_ascii=False,separators=(',',':')).encode())
    catalogs[lk]=(path,raw,obj,ordered)
# Reattest the twelve previously retained callerless holds by exact hashes only.
prev_hold_rows=[j(x) for x in (PREV/'carry-forward-hold-hashes.jsonl').read_text().splitlines() if x.strip()]
assert len(prev_hold_rows)==12
app_hold_map={(x['position'],x['locale'],x['sourceId']):x for x in prior_app_holds}
hold_rows=[]
for h in prev_hold_rows:
    pos,locale,sid=h['position'],h['locale'],h['sourceId']
    assert pos==3632 and locale in LOCALES and sid==keys[pos]
    current_hash=st(catalogs[locale][2][sid])
    a=app_hold_map[(pos,locale,sid)]
    assert current_hash==h['priorTargetSha256']==h['currentTargetSha256']==a['targetSha256']
    assert a['callerlessRetainedHold'] and a['priorTargetSha256']==a['targetSha256']
    hold_rows.append({'schemaVersion':1,'originWindow':'W3620-W3639','carriedViaWindow':'W3720-W3739','position':pos,'sourceId':sid,'sourceSha256':st(english[sid]),'locale':locale,'catalogPath':f'src/i18n/locale/{locale}.json','priorTargetSha256':h['priorTargetSha256'],'previousApplicationTargetSha256':a['targetSha256'],'currentTargetSha256':current_hash,'currentHead':HEAD,'currentTree':TREE,'callerless':True,'retained':True,'targetTextIncluded':False})
assert {x['locale'] for x in hold_rows}==set(LOCALES)
hold_rows.sort(key=lambda x:LOCALES.index(x['locale']))
# Exact-head reattestation of every prior applied selection.
prior_dispositions=collections.Counter(); prior_reattest=[]; prior_seen=set(); readback_map={(x['position'],x['locale'],x['sourceId']):x for x in prior_readback}
for r in prior_app_rows:
    pos,locale,sid=r['position'],r['locale'],r['sourceId']; k=(pos,locale,sid)
    assert 3720<=pos<=3739 and locale in LOCALES and k not in prior_seen and sid==keys[pos]
    prior_seen.add(k); value=catalogs[locale][2][sid]; current_hash=st(value); rb=readback_map[k]
    assert r['catalogPath']==f'src/i18n/locale/{locale}.json'
    assert value==r['selectedTarget'] and current_hash==r['selectedTargetSha256']==rb['readbackSha256']
    assert rb['readbackMatchesSelected'] and r['disposition'] in {'accept-current','correction','refinement'}
    prior_dispositions[r['disposition']]+=1
    prior_reattest.append({'schemaVersion':1,'currentWindow':'W3740-W3759','previousAppliedWindow':'W3720-W3739','previousReviewHead':prev_window['head'],'previousReviewTree':prev_window['tree'],'currentHead':HEAD,'currentTree':TREE,'position':pos,'locale':locale,'sourceId':sid,'sourceSha256':st(english[sid]),'previousDisposition':r['disposition'],'previousUpdateApplied':r['selectedTargetChanged'],'previousAppliedTargetSha256':r['selectedTargetSha256'],'currentTargetSha256':current_hash,'matches':True,'targetTextIncluded':False})
assert len(prior_seen)==240 and prior_dispositions=={'accept-current':app_verification['acceptCurrent'],'correction':app_verification['corrections'],'refinement':app_verification['refinements']}
assert sum(bool(r['selectedTargetChanged']) for r in prior_app_rows)==app_verification['selectedChanges']
prior_reattest.sort(key=lambda x:(x['position'],LOCALES.index(x['locale'])))
# Discover exact component source and route/caller context at this head.
source_namespaces={sid.rsplit('.',1)[0] for sid in selected_ids}
tracked=set(run(['ls-tree','-r','--name-only',HEAD],R).splitlines())
namespace_paths={}
for ns in sorted(source_namespaces):
    comp=ns.rsplit('.',1)[-1]
    candidates=[f'src/components/Settings/{comp}.tsx',f'src/components/Settings/{comp}/index.tsx']
    path=next((p for p in candidates if p in tracked),None)
    assert path,(ns,candidates)
    namespace_paths[ns]=path
namespace_text={ns:show(path).decode('utf-8').splitlines() for ns,path in namespace_paths.items()}
route_paths=run(['ls-tree','-r','--name-only',HEAD,'--','src/pages/settings','src/components/Settings/SettingsServices.tsx'],R).splitlines()
route_content={p:show(p).decode('utf-8').splitlines() for p in route_paths if p.endswith('.tsx')}
components={ns.rsplit('.',1)[-1] for ns in source_namespaces}
route_refs={}
for comp in components:
    refs=[]
    for path,lines in route_content.items():
        for i,line in enumerate(lines):
            if comp in line: refs.append({'path':path,'line':i+1,'lineSha256':st(line),'text':line})
    route_refs[comp]=refs
sources=[]; contexts=[]; blocks=[]; order_rows=[]
for pos in range(START-1,END+2):
    sid=keys[pos]; value=english[sid]; protected=[x for x in PROTECTED if x in value]
    src={'schemaVersion':1,'window':'W3740-W3759','head':HEAD,'tree':TREE,'position':pos,'sourceId':sid,'sourceIdSha256':st(sid),'sourceKey':sid.rsplit('.',1)[-1],'namespace':sid.rsplit('.',1)[0],'source':value,'sourceSha256':st(value),'sourcePlaceholders':icu_tokens(value),'sourceIcuPluralCategories':catmap(icu_tokens(value)),'sourceMarkupTokens':MK.findall(value),'sourceNumericTokens':NUM.findall(value),'sourceProtectedLiterals':protected}
    kind='previous' if pos==START-1 else 'next' if pos==END+1 else 'selected'
    order_rows.append({'schemaVersion':1,'window':'W3740-W3759','head':HEAD,'tree':TREE,'position':pos,'sourceId':sid,'sourceIdSha256':st(sid),'source':value,'sourceSha256':st(value),'boundaryKind':kind})
    if START<=pos<=END: sources.append(src)
writejl(OUT/'source-cells.jsonl',sources); writejl(OUT/'source-order.jsonl',order_rows)
for src in sources:
    pos,sid,key,ns=src['position'],src['sourceId'],src['sourceKey'],src['namespace']
    path=namespace_paths[ns]; lines=namespace_text[ns]
    block_start=next(i for i,line in enumerate(lines) if 'const messages = defineMessages' in line)
    block_end=next(i for i in range(block_start+1,len(lines)) if lines[i].strip()=='});')
    defs=[i for i in range(block_start+1,block_end) if re.match(r'^\s*'+re.escape(key)+r'\s*:',lines[i])]
    assert len(defs)==1,(sid,defs)
    d=defs[0]; a=max(0,d-2); b=min(len(lines),d+3); did=f'w3740-{pos}-definition-01'
    blocks.append({'contextId':did,'contextType':'message-definition','sourcePosition':pos,'sourceId':sid,'path':path,'startLine':a+1,'endLine':b,'lines':[line_record(lines,n+1) for n in range(a,b)]})
    pattern=re.compile(r'\bmessages\s*(?:\.\s*'+re.escape(key)+r'\b|\[\s*[\"\']'+re.escape(key)+r'[\"\']\s*\])')
    uses=[i for i,line in enumerate(lines) if pattern.search(line)]
    refs=[]; block_ids=[did]
    for idx,u in enumerate(uses,1):
        uid=f'w3740-{pos}-caller-{idx:02d}'; block_ids.append(uid); a=max(0,u-2); b=min(len(lines),u+3)
        blocks.append({'contextId':uid,'contextType':'direct-message-property-reference','sourcePosition':pos,'sourceId':sid,'path':path,'startLine':a+1,'endLine':b,'lines':[line_record(lines,n+1) for n in range(a,b)]})
        refs.append({'line':u+1,'lineSha256':st(lines[u]),'path':path,'text':lines[u],'contextBlockId':uid})
    comp=ns.rsplit('.',1)[-1]; dynamic=route_refs.get(comp,[])
    contexts.append({'schemaVersion':1,'window':'W3740-W3759','head':HEAD,'tree':TREE,'position':pos,'sourceId':sid,'sourceKey':key,'sourceSha256':src['sourceSha256'],'namespace':ns,'namespaceFiles':[path],'definitionFiles':[path],'callerCount':len(refs),'callerResolution':'direct message-property references found in pinned namespace source' if refs else 'no direct message-property reference found in pinned namespace source','directMessageReferences':refs,'dynamicRendererReferences':dynamic,'typedStageMappings':[],'dynamicLabelMappings':[],'contextBlockIds':block_ids})
for comp,refs in route_refs.items():
    if refs: blocks.append({'contextId':f'w3740-route-{comp}','contextType':'component-routing','component':comp,'references':refs})
writejl(OUT/'caller-contexts.jsonl',contexts); writejl(OUT/'caller-context-blocks.jsonl',blocks)
callerless=[x['position'] for x in contexts if x['callerCount']==0 and not x['dynamicRendererReferences']]
writej(OUT/'caller-resolution-findings.json',{'schemaVersion':1,'head':HEAD,'tree':TREE,'sourceCount':20,'callerlessSourcePositions':callerless,'findings':[{'position':x['position'],'sourceId':x['sourceId'],'finding':'No direct property or component-routing reference appears in the pinned source context.'} for x in contexts if x['position'] in callerless]})
cells=[]
for src in sources:
    for locale in LOCALES:
        path,raw,obj,ordered=catalogs[locale]; value=obj[src['sourceId']]
        stokens=src['sourcePlaceholders']; ttokens=icu_tokens(value); ssig=sig(stokens); tsig=sig(ttokens)
        sn=src['sourceNumericTokens']; tn=NUM.findall(value)
        cells.append({'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3740-W3759','head':HEAD,'tree':TREE,'position':src['position'],'locale':locale,'localeTag':by_file[locale]['tag'],'catalogPath':path,'catalogGitBlob':blob(path),'catalogSha256':sha(raw),'sourceId':src['sourceId'],'sourceIdSha256':src['sourceIdSha256'],'sourceKey':src['sourceKey'],'source':src['source'],'sourceSha256':src['sourceSha256'],'currentTarget':value,'currentTargetSha256':st(value),'sourcePlaceholders':stokens,'currentTargetPlaceholders':ttokens,'placeholderTokenMismatch':collections.Counter(sig(stokens))!=collections.Counter(sig(ttokens)),'placeholderTokenSequenceMismatch':ssig!=tsig,'sourceIcuPluralCategories':catmap(stokens),'currentTargetIcuPluralCategories':catmap(ttokens),'icuPluralCategorySetDifference':catmap(stokens)!=catmap(ttokens),'sourceMarkupTokens':src['sourceMarkupTokens'],'currentTargetMarkupTokens':MK.findall(value),'markupTokenMismatch':src['sourceMarkupTokens']!=MK.findall(value),'sourceNumericTokens':sn,'currentTargetNumericTokens':tn,'sourceNumericValues':num_values(src['source']),'currentTargetNumericValues':num_values(value),'numericTokenMismatch':num_values(src['source'])!=num_values(value),'sourceProtectedLiterals':src['sourceProtectedLiterals'],'currentTargetProtectedLiterals':[x for x in PROTECTED if x in value],'protectedLiteralMismatch':any(x not in value for x in src['sourceProtectedLiterals']),'reviewStatus':'unreviewed'})
assert len(sources)==20 and len(cells)==240
writejl(OUT/'current-target-cells.jsonl',cells)
writejl(OUT/'prior-selection-exclusions.jsonl',[{'schemaVersion':1,'position':i,'sourceId':keys[i],'sourceIdSha256':st(keys[i]),'sourceSha256':st(english[keys[i]]),'head':HEAD,'tree':TREE} for i in range(START)])
writejl(OUT/'carry-forward-hold-hashes.jsonl',hold_rows)
writejl(OUT/'lineage/prior-window-selection-reattestation.jsonl',prior_reattest)
writej(OUT/'lineage/prior-window.json',{'window':'W3720-W3739','range':[3720,3739],'sourceOrderSha256':prev_window['sourceOrderSha256'],'candidateFreeManifestSha256':prev_manifest_sha,'applicationPlanSha256':sha((APP/'application-plan.jsonl').read_bytes()),'applicationReadbackSha256':sha((APP/'application-readback.jsonl').read_bytes()),'applicationVerificationSha256':sha((APP/'application-verification.json').read_bytes()),'applicationHoldReadbackSha256':sha((APP/'prior-hold-readback.jsonl').read_bytes()),'applicationRows':len(prior_app_rows),'reattestedRows':len(prior_reattest),'priorDispositionCounts':dict(prior_dispositions),'appliedUpdateCount':app_verification['selectedChanges'],'previousHead':prev_window['head'],'previousTree':prev_window['tree'],'currentHead':HEAD,'currentTree':TREE})
writejl(OUT/'lineage/prior-hold-application-reattestation.jsonl',[{'schemaVersion':1,'currentWindow':'W3740-W3759','originWindow':h['originWindow'],'previousAppliedWindow':'W3720-W3739','position':h['position'],'locale':h['locale'],'sourceId':h['sourceId'],'sourceSha256':h['sourceSha256'],'previousApplicationTargetSha256':h['previousApplicationTargetSha256'],'currentTargetSha256':h['currentTargetSha256'],'currentHead':HEAD,'currentTree':TREE,'callerless':True,'retained':True,'targetTextIncluded':False} for h in hold_rows])
writej(OUT/'lineage/hold-lineage.json',{'schemaVersion':1,'head':HEAD,'tree':TREE,'currentWindow':'W3740-W3759','currentWindowHoldCount':12,'originHoldWindow':'W3620-W3639','originHoldPosition':3632,'carryForwardHoldRows':hold_rows,'allPriorHoldTargetsReattested':True,'targetTextIncluded':False,'note':'The twelve position-3632 callerless holds remain retained. Only target hashes are included.'})
runtime_paths=sorted(set(['config/i18n/locales.json']+list(namespace_paths.values())+route_paths))
runtime={}
for path in runtime_paths:
    raw=show(path); runtime[path]={'path':path,'sha256':sha(raw),'gitBlob':blob(path),'byteCount':len(raw),'lineCount':len(raw.splitlines())}
catalog_pins={}
for lk,(path,raw,obj,ordered) in catalogs.items():
    catalog_pins[path]={'path':path,'sha256':sha(raw),'gitBlob':blob(path),'byteCount':len(raw),'lineCount':len(raw.splitlines()),'keyCount':len(obj),'orderedKeysSha256':ordered}
writej(OUT/'file-pins.json',{'repository':'snapetech-org/seerrng','pullRequest':418,'head':HEAD,'tree':TREE,'catalogFiles':catalog_pins,'runtimeFiles':runtime})
diag={'placeholderMismatchCount':sum(x['placeholderTokenMismatch'] for x in cells),'placeholderSequenceMismatchCount':sum(x['placeholderTokenSequenceMismatch'] for x in cells),'icuPluralCategorySetDifferenceCount':sum(x['icuPluralCategorySetDifference'] for x in cells),'markupMismatchCount':sum(x['markupTokenMismatch'] for x in cells),'numericTokenMismatchCount':sum(x['numericTokenMismatch'] for x in cells),'protectedLiteralMismatchCount':sum(x['protectedLiteralMismatch'] for x in cells)}
protected_findings=[{'position':c['position'],'locale':c['locale'],'sourceId':c['sourceId'],'requiredLiterals':c['sourceProtectedLiterals'],'missingLiterals':[x for x in c['sourceProtectedLiterals'] if x not in c['currentTargetProtectedLiterals']]} for c in cells if c['protectedLiteralMismatch']]
writej(OUT/'baseline-protected-literal-findings.json',{'schemaVersion':1,'head':HEAD,'tree':TREE,'window':'W3740-W3759','count':len(protected_findings),'rows':protected_findings,'note':'Baseline flags only; no replacement target or disposition is included.'})
prev_boundary=order_rows[0]; next_boundary=order_rows[-1]
window={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3740-W3759','range':[START,END],'head':HEAD,'tree':TREE,'baseRef':'main','baseSha':pr['baseRefOid'],'sourceCatalogPath':'src/i18n/locale/en.json','englishCatalogGitBlob':blob('src/i18n/locale/en.json'),'sourceOrderCount':len(keys),'sourceOrderSha256':source_order_sha,'priorSelectedSourceIdCount':START,'priorSelectedSourceIdPrefixSha256':prior_ids_sha,'selectedSourceIdOrderSha256':selected_ids_sha,'previousBoundary':{k:prev_boundary[k] for k in ('position','sourceId','source','sourceSha256','sourceIdSha256','boundaryKind')},'nextBoundary':{k:next_boundary[k] for k in ('position','sourceId','source','sourceSha256','sourceIdSha256','boundaryKind')},'remainingAtWindowStart':len(keys)-START,'selectedSourceCount':20,'remainingAfterWindow':len(keys)-END-1,'sourceRecordCount':20,'sourceOrderBoundaryRecordCount':22,'cellCount':240,'localeOrder':LOCALES,'localeInfo':locale_info,'catalogKeySetEqualsEnglish':True,'catalogOrderedKeyHashes':{k:catalogs[k][3] for k in ['en']+LOCALES},'baselineTokenDiagnostics':diag,'callerlessSourcePositions':callerless,'previousCompletedWindow':'W3720-W3739','previousCompletedEndPosition':3739,'previousAppliedSelectionReattestedCells':len(prior_reattest),'previousAppliedSelectionDispositionCounts':dict(prior_dispositions),'previousAppliedSelectionChanges':app_verification['selectedChanges'],'priorHoldCount':len(hold_rows),'priorHoldSourcePositions':[3632],'priorHoldPreservation':'Retain all twelve position-3632 callerless holds by matching prior and current target hashes.'}
writej(OUT/'window.json',window)
writej(OUT/'queue-status.json',{'repository':'snapetech-org/seerrng','pullRequest':418,'head':HEAD,'tree':TREE,'sourceOrderCount':len(keys),'sourceOrderSha256':source_order_sha,'priorSelectedSourceIdCount':START,'priorSelectedSourceIdPrefixSha256':prior_ids_sha,'selectedSourceIdOrderSha256':selected_ids_sha,'previousCompletedWindow':'W3720-W3739','previousCompletedEndPosition':3739,'previousAppliedSelectionReattestedCells':240,'previousAppliedSelectionDispositionCounts':dict(prior_dispositions),'nextWindow':'W3740-W3759','nextWindowRangeInclusive':[START,END],'remainingAtWindowStart':len(keys)-START,'selectedSourceCount':20,'remainingAfterWindow':len(keys)-END-1,'callerlessSourcePositions':callerless,'priorHoldCount':12,'priorHoldSourcePositions':[3632]})
att={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'url':pr['url'],'state':pr['state'],'isDraft':pr['isDraft'],'baseRefName':pr['baseRefName'],'baseRefOid':pr['baseRefOid'],'headRefName':pr['headRefName'],'head':HEAD,'tree':TREE,'branchRef':rm[f'refs/heads/{BRANCH}'],'pullRef':rm['refs/pull/418/head'],'verifiedAtUTC':datetime.now(timezone.utc).isoformat()}
writej(OUT/'PR-attestation.json',att)
readme=f'''Candidate-free input for SeerrNG PR #418 W3740-W3759, pinned to open/draft head {HEAD} / tree {TREE}.

This is the next deterministic, uncovered window after W3720-W3739. It contains 20 contiguous English source IDs and 240 current target cells across 12 direct locales. Source positions are zero-based in the 9,494-key English catalog. The preceding boundary is {prev_boundary['sourceId']}; the next boundary is {next_boundary['sourceId']}. The first 3,740 source IDs are explicitly excluded and hashed.

The English catalog, locale registry, locale catalogs, component definitions, direct caller lines, and route references are pinned by Git blob and SHA-256. The packet includes source context, target context, token diagnostics, baseline protected-literal findings, callerless findings, and prior-hold hashes. It contains no proposal or disposition. The 240 targets from W3720-W3739 and all twelve position-3632 callerless holds were reattested by hash against this exact head. No catalog values were changed. Native-speaker and browser review are not represented.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
manifest_files=[]
for p in sorted(x for x in OUT.rglob('*') if x.is_file() and x.name not in {'manifest.json','SHA256SUMS.txt'}):
    manifest_files.append({'path':p.relative_to(OUT).as_posix(),'sha256':sha(p.read_bytes()),'byteCount':p.stat().st_size})
manifest={'schemaVersion':1,'packetType':'candidate-free-input','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3740-W3759','range':[START,END],'head':HEAD,'tree':TREE,'sourceOrderCount':len(keys),'sourceOrderSha256':source_order_sha,'priorSelectedSourceIdCount':START,'priorSelectedSourceIdPrefixSha256':prior_ids_sha,'selectedSourceIdOrderSha256':selected_ids_sha,'sourceRecordCount':20,'cellCount':240,'priorHoldCount':12,'files':manifest_files}
writej(OUT/'manifest.json',manifest)
sums=[f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}' for p in sorted(x for x in OUT.rglob('*') if x.is_file() and x.name!='SHA256SUMS.txt')]
(OUT/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n',encoding='utf-8')
print(json.dumps({'result':'candidate-free input created','head':HEAD,'tree':TREE,'range':[START,END],'sourceCount':len(sources),'cells':len(cells),'callerless':callerless,'priorHoldsPreserved':len(hold_rows),'baselineDiagnostics':diag,'catalogPins':len(catalog_pins),'runtimeFilePins':len(runtime),'manifestSha256':sha((OUT/'manifest.json').read_bytes()),'checksumListSha256':sha((OUT/'SHA256SUMS.txt').read_bytes())},ensure_ascii=False,indent=2))
