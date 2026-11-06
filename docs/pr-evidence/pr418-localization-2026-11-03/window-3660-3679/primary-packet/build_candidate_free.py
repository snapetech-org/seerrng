#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import collections, hashlib, json, re, subprocess

T=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3660-3679-primary-20261103')
R=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3640-3659-apply-20261103/repo')
OUT=T/'candidate-free-input'
PREV=R/'docs/pr-evidence/pr418-localization-2026-11-03/window-3640-3659/candidate-free-input'
HEAD='eb279fc80be656f379cd893642bf741ba0a24d85'
TREE='85a73172719b38e99a4e74c0ef9a303164cb4fcb'
BRANCH='codex/seerrng-localization-overhaul-20261028'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
START,END=3660,3679
HEADER=re.compile(r'^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z][A-Za-z0-9_-]*))?')
CAT=re.compile(r'(?:^|,|\s)(=\d+|zero|one|two|few|many|other)\s*\{')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','SSL','BackIssue','Bindery','BookshelfNG','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']

def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def run(args,cwd=None): return subprocess.run(args,cwd=cwd,check=True,capture_output=True,text=True).stdout.strip()
def git(*args): return subprocess.run(['git',*args],cwd=R,check=True,capture_output=True).stdout
def show(path): return git('show',f'{HEAD}:{path}')
def blob(path): return run(['git','rev-parse',f'{HEAD}:{path}'],R)
def j(raw): return json.loads(raw)
def writej(path,x): path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def writejl(path,rows): path.parent.mkdir(parents=True,exist_ok=True); path.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
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
def sig(ts): return [(x['name'],x['formatter']) for x in ts]
def verify_sums(d):
    for line in (d/'SHA256SUMS.txt').read_text().splitlines():
        if not line.strip(): continue
        expected,name=line.split(None,1); name=name.strip().lstrip('*')
        assert sha((d/name).read_bytes())==expected,(d/name,'checksum mismatch')

assert not OUT.exists()
assert run(['git','rev-parse','HEAD'],R)==HEAD
assert run(['git','rev-parse','HEAD^{tree}'],R)==TREE
assert not run(['git','status','--porcelain'],R)
pr=j(run(['gh','pr','view','418','--repo','snapetech-org/SeerrNG','--json','number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url']))
assert (pr['number'],pr['state'],pr['isDraft'],pr['headRefName'],pr['headRefOid'],pr['baseRefName'])==(418,'OPEN',True,BRANCH,HEAD,'main')
BASE=pr['baseRefOid']
refs=run(['git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{BRANCH}','refs/pull/418/head'])
rm={x.split()[1]:x.split()[0] for x in refs.splitlines()}
assert rm=={f'refs/heads/{BRANCH}':HEAD,'refs/pull/418/head':HEAD}
assert run(['gh','api',f'repos/snapetech-org/seerrng/commits/{HEAD}','--jq','.commit.tree.sha'])==TREE
verify_sums(PREV)
prev_window=j((PREV/'window.json').read_bytes())
assert prev_window['window']=='W3640-W3659' and prev_window['range']==[3640,3659]
assert prev_window['sourceOrderCount']==9494
prior_hold_path=PREV/'lineage/hold-lineage.json'
prior_hold_sha=sha(prior_hold_path.read_bytes())
prior_hold_doc=j(prior_hold_path.read_bytes())
prior_rows=prior_hold_doc['carryForwardHoldRows']
assert len(prior_rows)==12 and {x['position'] for x in prior_rows}=={3632}
assert {x['locale'] for x in prior_rows}==set(LOCALES)
english=j(show('src/i18n/locale/en.json')); keys=list(english)
assert len(keys)==9494 and len(set(keys))==9494
source_order_sha=sha('\n'.join(keys).encode())
assert blob('src/i18n/locale/en.json')=='12e04a118c30b71b3714291adeaf9fdb2735cee4'
assert source_order_sha==prev_window['sourceOrderSha256']
assert keys[3659]=='components.Settings.BookshelfPathMigration.format'
assert keys[3660]=='components.Settings.BookshelfPathMigration.mediaFiles'
assert keys[3679]=='components.Settings.BookshelfPathMigration.selectAuthor'
assert keys[3680]=='components.Settings.BookshelfPathMigration.selected'
selected_ids=keys[START:END+1]
assert len(selected_ids)==20 and len(set(selected_ids))==20
prior_selected=keys[:START]
assert len(prior_selected)==START
prior_ids_sha=sha('\n'.join(prior_selected).encode()); selected_ids_sha=sha('\n'.join(selected_ids).encode())
prev_sources=[json.loads(x) for x in (PREV/'source-cells.jsonl').read_text().splitlines() if x.strip()]
assert len(prev_sources)==20 and [x['position'] for x in prev_sources]==list(range(3640,3660))
assert [x['sourceId'] for x in prev_sources]==keys[3640:3660]
registry=j(show('config/i18n/locales.json'))
by_file={x['clientFile'].removesuffix('.json'):x for x in registry['locales']}
assert set(LOCALES)<=set(by_file)
locale_info=[{'catalogKey':k,'tag':by_file[k]['tag'],'nativeName':by_file[k]['nativeName'],'direction':by_file[k]['direction'],'clientFile':by_file[k]['clientFile'],'reviewStatus':by_file[k]['reviewStatus']} for k in LOCALES]
catalogs={}
for key in ['en']+LOCALES:
    path=f'src/i18n/locale/{key}.json'; raw=show(path); obj=j(raw)
    assert len(obj)==9494 and set(obj)==set(keys)
    ordered=sha(json.dumps(list(obj.keys()),ensure_ascii=False,separators=(',',':')).encode())
    catalogs[key]=(path,raw,obj,ordered)
hold_rows=[]
for row in prior_rows:
    locale=row['locale']; path=row['catalogPath']; sid=row['sourceId']
    assert row['currentHead']==prev_window['head'] and row['currentTree']==prev_window['tree']
    current=catalogs[locale][2][sid]; current_hash=st(current)
    assert current_hash==row['currentTargetSha256']==row['previousTargetSha256'],(locale,'position-3632 hold changed')
    hold_rows.append({'schemaVersion':1,'originWindow':'W3620-W3639','carriedViaWindow':'W3640-W3659','position':3632,'sourceId':sid,'sourceSha256':row['sourceSha256'],'locale':locale,'catalogPath':path,'priorTargetSha256':row['currentTargetSha256'],'currentTargetSha256':current_hash,'currentHead':HEAD,'currentTree':TREE,'callerless':True,'retained':True,'targetTextIncluded':False})
assert len(hold_rows)==12
selected_namespaces={sid.rsplit('.',1)[0] for sid in selected_ids}
namespace_paths={}
for ns in sorted(selected_namespaces):
    component=ns.rsplit('.',1)[-1]; path=f'src/components/Settings/{component}.tsx'
    assert path in run(['git','ls-tree','-r','--name-only',HEAD],R).splitlines(),(ns,path)
    namespace_paths[ns]=path
namespace_text={ns:show(path).decode('utf-8').splitlines() for ns,path in namespace_paths.items()}
all_paths=run(['git','ls-tree','-r','--name-only',HEAD,'--','src/pages/settings'],R).splitlines()
route_paths={}
for ns in selected_namespaces:
    component=ns.rsplit('.',1)[-1]; matches=[]
    for path in all_paths:
        if not path.endswith('.tsx'): continue
        lines=show(path).decode('utf-8').splitlines()
        refs=[(i+1,line) for i,line in enumerate(lines) if component in line]
        if refs: matches.append((path,lines,refs))
    route_paths[component]=matches
assert all(route_paths.values()),route_paths
sources=[]; contexts=[]; blocks=[]; order_rows=[]
for pos in range(START-1,END+2):
    sid=keys[pos]; value=english[sid]
    row={'schemaVersion':1,'window':'W3660-W3679','head':HEAD,'tree':TREE,'position':pos,'sourceId':sid,'sourceIdSha256':st(sid),'sourceKey':sid.rsplit('.',1)[-1],'namespace':sid.rsplit('.',1)[0],'source':value,'sourceSha256':st(value),'sourcePlaceholders':icu_tokens(value),'sourceIcuPluralCategories':catmap(icu_tokens(value)),'sourceMarkupTokens':MK.findall(value),'sourceNumericTokens':NUM.findall(value),'sourceProtectedLiterals':[x for x in PROTECTED if x in value]}
    kind='previous' if pos==START-1 else 'next' if pos==END+1 else 'selected'
    order_rows.append({'schemaVersion':1,'window':'W3660-W3679','head':HEAD,'tree':TREE,'position':pos,'sourceId':sid,'sourceIdSha256':st(sid),'source':value,'sourceSha256':st(value),'boundaryKind':kind})
    if START<=pos<=END: sources.append(row)
writejl(OUT/'source-cells.jsonl',sources); writejl(OUT/'source-order.jsonl',order_rows)
def line_record(lines,n):
    text=lines[n-1]; return {'line':n,'lineSha256':st(text),'text':text}
for row in sources:
    pos=row['position']; sid=row['sourceId']; key=row['sourceKey']; ns=row['namespace']; path=namespace_paths[ns]; lines=namespace_text[ns]
    block_start=next(i for i,line in enumerate(lines) if 'const messages = defineMessages' in line)
    block_end=next(i for i in range(block_start+1,len(lines)) if lines[i].strip()=='});')
    definitions=[i for i in range(block_start+1,block_end) if re.match(r'^\s*'+re.escape(key)+r'\s*:',lines[i])]
    assert len(definitions)==1,(sid,definitions)
    d=definitions[0]; a=max(0,d-2); b=min(len(lines),d+3); did=f'w3660-{pos}-definition-01'
    blocks.append({'contextId':did,'contextType':'message-definition','sourcePosition':pos,'sourceId':sid,'path':path,'startLine':a+1,'endLine':b,'lines':[line_record(lines,n+1) for n in range(a,b)]})
    uses=[i for i,line in enumerate(lines) if re.search(r'\bmessages\.'+re.escape(key)+r'\b',line)]
    use_refs=[]; block_ids=[did]
    for index,u in enumerate(uses,1):
        uid=f'w3660-{pos}-caller-{index:02d}'; block_ids.append(uid); a=max(0,u-2); b=min(len(lines),u+3)
        blocks.append({'contextId':uid,'contextType':'direct-message-property-reference','sourcePosition':pos,'sourceId':sid,'path':path,'startLine':a+1,'endLine':b,'lines':[line_record(lines,n+1) for n in range(a,b)]})
        use_refs.append({'line':u+1,'lineSha256':st(lines[u]),'path':path,'text':lines[u],'contextBlockId':uid})
    comp=ns.rsplit('.',1)[-1]; dynamic=[]
    for route_path,route_lines,route_refs in route_paths[comp]:
        dynamic.extend({'line':n,'lineSha256':st(line),'path':route_path,'text':line} for n,line in route_refs)
    contexts.append({'schemaVersion':1,'window':'W3660-W3679','head':HEAD,'tree':TREE,'position':pos,'sourceId':sid,'sourceKey':key,'sourceSha256':row['sourceSha256'],'namespace':ns,'namespaceFiles':[path],'definitionFiles':[path],'callerCount':len(use_refs),'callerResolution':'direct message-property references found in pinned namespace source' if use_refs else 'no direct message-property reference found in pinned namespace source','directMessageReferences':use_refs,'dynamicRendererReferences':dynamic,'typedStageMappings':[],'dynamicLabelMappings':[],'contextBlockIds':block_ids})
for component,matches in route_paths.items():
    for route_path,lines,refs in matches:
        route_refs=[{'path':route_path,'line':n,'text':line,'lineSha256':st(line)} for n,line in refs]
        blocks.append({'contextId':f'w3660-page-route-{component}','contextType':'component-routing','component':component,'path':route_path,'references':route_refs})
writejl(OUT/'caller-contexts.jsonl',contexts); writejl(OUT/'caller-context-blocks.jsonl',blocks)
callerless=[x['position'] for x in contexts if x['callerCount']==0]
writej(OUT/'caller-resolution-findings.json',{'schemaVersion':1,'head':HEAD,'tree':TREE,'sourceCount':20,'callerlessSourcePositions':callerless,'findings':[{'position':x['position'],'sourceId':x['sourceId'],'finding':'No direct property reference appears in the pinned component source.'} for x in contexts if x['callerCount']==0]})
cells=[]
for src in sources:
    for locale in LOCALES:
        path,raw,obj,ordered=catalogs[locale]; value=obj[src['sourceId']]
        stokens=src['sourcePlaceholders']; ttokens=icu_tokens(value); ssig=sig(stokens); tsig=sig(ttokens)
        sn=src['sourceNumericTokens']; tn=NUM.findall(value)
        cells.append({'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3660-W3679','head':HEAD,'tree':TREE,'position':src['position'],'locale':locale,'localeTag':by_file[locale]['tag'],'catalogPath':path,'catalogGitBlob':blob(path),'catalogSha256':sha(raw),'sourceId':src['sourceId'],'sourceIdSha256':src['sourceIdSha256'],'sourceKey':src['sourceKey'],'source':src['source'],'sourceSha256':src['sourceSha256'],'currentTarget':value,'currentTargetSha256':st(value),'sourcePlaceholders':stokens,'currentTargetPlaceholders':ttokens,'placeholderTokenMismatch':collections.Counter(ssig)!=collections.Counter(tsig),'placeholderTokenSequenceMismatch':ssig!=tsig,'sourceIcuPluralCategories':catmap(stokens),'currentTargetIcuPluralCategories':catmap(ttokens),'icuPluralCategorySetDifference':catmap(stokens)!=catmap(ttokens),'sourceMarkupTokens':src['sourceMarkupTokens'],'currentTargetMarkupTokens':MK.findall(value),'markupTokenMismatch':src['sourceMarkupTokens']!=MK.findall(value),'sourceNumericTokens':sn,'currentTargetNumericTokens':tn,'numericTokenMismatch':sn!=tn,'sourceProtectedLiterals':src['sourceProtectedLiterals'],'currentTargetProtectedLiterals':[x for x in PROTECTED if x in value],'protectedLiteralMismatch':any(x not in value for x in src['sourceProtectedLiterals']),'reviewStatus':'unreviewed'})
assert len(sources)==20 and len(cells)==240
writejl(OUT/'current-target-cells.jsonl',cells)
exclusions=[{'schemaVersion':1,'position':i,'sourceId':keys[i],'sourceIdSha256':st(keys[i]),'sourceSha256':st(english[keys[i]]),'head':HEAD,'tree':TREE} for i in range(START)]
writejl(OUT/'prior-selection-exclusions.jsonl',exclusions)
writejl(OUT/'carry-forward-hold-hashes.jsonl',hold_rows)
lineage=OUT/'lineage'; lineage.mkdir()
writej(lineage/'prior-window.json',{'window':'W3640-W3659','range':[3640,3659],'head':prev_window['head'],'tree':prev_window['tree'],'sourceOrderSha256':prev_window['sourceOrderSha256'],'selectedSourceIdOrderSha256':prev_window['selectedSourceIdOrderSha256'],'candidateFreeManifestSha256':sha((PREV/'manifest.json').read_bytes()),'holdLineageSha256':prior_hold_sha})
writej(lineage/'hold-lineage.json',{'schemaVersion':1,'head':HEAD,'tree':TREE,'currentWindow':'W3660-W3679','currentWindowHoldCount':len(hold_rows),'originHoldWindow':'W3620-W3639','originHoldPosition':3632,'carryForwardHoldRows':hold_rows,'allPriorHoldTargetsReattested':True,'targetTextIncluded':False,'note':'The twelve position-3632 callerless holds remain retained. Only SHA-256 target fingerprints are carried; no old target text is included as a proposal.'})
runtime_paths=['config/i18n/locales.json']+sorted(set(namespace_paths.values()))+sorted({p for matches in route_paths.values() for p,_,_ in matches})
runtime={}
for path in runtime_paths:
    raw=show(path); runtime[path]={'path':path,'sha256':sha(raw),'gitBlob':blob(path),'byteCount':len(raw),'lineCount':len(raw.splitlines())}
catalog_pins={}
for key,(path,raw,obj,ordered) in catalogs.items():
    catalog_pins[path]={'path':path,'sha256':sha(raw),'gitBlob':blob(path),'byteCount':len(raw),'lineCount':len(raw.splitlines()),'keyCount':len(obj),'orderedKeysSha256':ordered}
writej(OUT/'file-pins.json',{'repository':'snapetech-org/seerrng','pullRequest':418,'head':HEAD,'tree':TREE,'catalogFiles':catalog_pins,'runtimeFiles':runtime})
diag={'placeholderMismatchCount':sum(x['placeholderTokenMismatch'] for x in cells),'placeholderSequenceMismatchCount':sum(x['placeholderTokenSequenceMismatch'] for x in cells),'icuPluralCategorySetDifferenceCount':sum(x['icuPluralCategorySetDifference'] for x in cells),'markupMismatchCount':sum(x['markupTokenMismatch'] for x in cells),'numericTokenMismatchCount':sum(x['numericTokenMismatch'] for x in cells),'protectedLiteralMismatchCount':sum(x['protectedLiteralMismatch'] for x in cells)}
previous_boundary=order_rows[0]; next_boundary=order_rows[-1]
remaining_start=len(keys)-START; remaining_after=len(keys)-END-1
window={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3660-W3679','range':[START,END],'head':HEAD,'tree':TREE,'baseRef':'main','baseSha':BASE,'sourceCatalogPath':'src/i18n/locale/en.json','englishCatalogGitBlob':blob('src/i18n/locale/en.json'),'sourceOrderCount':len(keys),'sourceOrderSha256':source_order_sha,'sourceOrderHashDerivation':'Computed from the ordered English catalog keys pinned by Git blob at this head.','priorSelectedSourceIdCount':START,'priorSelectedSourceIdPrefixSha256':prior_ids_sha,'selectedSourceIdOrderSha256':selected_ids_sha,'previousBoundary':{k:previous_boundary[k] for k in ('position','sourceId','source','sourceSha256','sourceIdSha256','boundaryKind')},'nextBoundary':{k:next_boundary[k] for k in ('position','sourceId','source','sourceSha256','sourceIdSha256','boundaryKind')},'remainingAtWindowStart':remaining_start,'selectedSourceCount':20,'remainingAfterWindow':remaining_after,'sourceRecordCount':20,'sourceOrderBoundaryRecordCount':22,'cellCount':240,'localeOrder':LOCALES,'localeInfo':locale_info,'catalogKeySetEqualsEnglish':True,'catalogOrderedKeyHashes':{k:catalogs[k][3] for k in ['en']+LOCALES},'baselineTokenDiagnostics':diag,'callerlessSourcePositions':callerless,'previousCompletedWindow':'W3640-W3659','previousCompletedEndPosition':3659,'previousWindowHoldCount':12,'priorHoldCount':len(hold_rows),'priorHoldSourcePositions':[3632],'priorHoldPreservation':'Preserve all twelve source-position-3632 callerless holds by exact target hash; no old target text is included as a proposal.'}
writej(OUT/'window.json',window)
queue={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'head':HEAD,'tree':TREE,'sourceCatalogPath':'src/i18n/locale/en.json','sourceOrderCount':len(keys),'sourceOrderSha256':source_order_sha,'priorSelectedSourceIdCount':START,'priorSelectedSourceIdPrefixSha256':prior_ids_sha,'selectedSourceIdOrderSha256':selected_ids_sha,'previousCompletedWindow':'W3640-W3659','previousCompletedEndPosition':3659,'previousCompletedHoldCount':12,'nextWindow':'W3660-W3679','nextWindowRangeInclusive':[START,END],'remainingAtWindowStart':remaining_start,'selectedSourceCount':20,'remainingAfterWindow':remaining_after,'callerlessSourcePositions':callerless,'priorHoldCount':12,'priorHoldSourcePositions':[3632],'priorHoldPreservation':'Retain the twelve position-3632 callerless holds by hash; target text is omitted from lineage.'}
writej(OUT/'queue-status.json',queue)
att={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'url':pr['url'],'state':pr['state'],'isDraft':pr['isDraft'],'baseRefName':pr['baseRefName'],'baseRefOid':BASE,'headRefName':pr['headRefName'],'head':HEAD,'tree':TREE,'branchRef':rm[f'refs/heads/{BRANCH}'],'pullRef':rm['refs/pull/418/head'],'verifiedAtUTC':datetime.now(timezone.utc).isoformat()}
writej(OUT/'PR-attestation.json',att)
readme=f'''Candidate-free input for SeerrNG PR #418 W3660-W3679, pinned to exact open/draft PR head {HEAD} / tree {TREE}.

This is the next uncovered source window after W3640-W3659. It contains 20 contiguous English source IDs and 240 current target cells across 12 direct locales. Source positions are zero-based in the 9,494-key English catalog. The previous boundary is {previous_boundary['sourceId']} and the window ends at {keys[END]}; position 3680 ({keys[END+1]}) is the next boundary. The first 3,660 source IDs are explicitly excluded and hashed to prevent overlap.

The English catalog order, locale registry, 12 target catalogs, component source and route files are pinned by Git blob and SHA-256. Context captures message definitions, exact direct callers, component route references, placeholders, ICU plural categories, markup, numeric tokens and protected literals. Current target values are supplied for candidate-free semantic review; no proposal or semantic disposition is present.

The twelve callerless holds from position 3632 remain held. Their exact prior target hashes were reattested against all current catalogs and retained in lineage/hold-lineage.json; old target text is omitted from this lineage. No catalog values were changed. Native-speaker and browser approval are not represented.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
file_records=[]
for p in sorted(x for x in OUT.rglob('*') if x.is_file() and x.name not in {'manifest.json','SHA256SUMS.txt'}):
    file_records.append({'path':p.relative_to(OUT).as_posix(),'sha256':sha(p.read_bytes()),'byteCount':p.stat().st_size})
manifest={'schemaVersion':1,'packetType':'candidate-free-input','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3660-W3679','range':[START,END],'head':HEAD,'tree':TREE,'sourceOrderCount':len(keys),'sourceOrderSha256':source_order_sha,'priorSelectedSourceIdCount':START,'priorSelectedSourceIdPrefixSha256':prior_ids_sha,'selectedSourceIdOrderSha256':selected_ids_sha,'sourceRecordCount':20,'cellCount':240,'priorHoldCount':len(hold_rows),'files':file_records}
writej(OUT/'manifest.json',manifest)
sumlines=[f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}' for p in sorted(x for x in OUT.rglob('*') if x.is_file() and x.name!='SHA256SUMS.txt')]
(OUT/'SHA256SUMS.txt').write_text('\n'.join(sumlines)+'\n',encoding='utf-8')
print(json.dumps({'result':'candidate-free input created','head':HEAD,'tree':TREE,'range':[START,END],'sourceCount':len(sources),'cells':len(cells),'callerless':callerless,'priorHoldsPreserved':len(hold_rows),'baselineDiagnostics':diag,'catalogPins':len(catalog_pins),'runtimeFilePins':len(runtime),'manifestSha256':sha((OUT/'manifest.json').read_bytes()),'checksumListSha256':sha((OUT/'SHA256SUMS.txt').read_bytes())},ensure_ascii=False,indent=2))
