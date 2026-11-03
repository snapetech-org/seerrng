import ast, hashlib, json, re, subprocess
from pathlib import Path
ROOT=Path('/mnt/disks/scratch/task-worktrees/localization-20261103/seerrng-pr418-w3220-apply-20261103')
TASK=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window3280-3299-20261103')
OUT=TASK/'clean-input'
PREV=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window3260-3279-20261103/input')
EXPECTED_HEAD='039fe9e04ea5cc6da314427fa25b0937ef8dd92b'; EXPECTED_TREE='b1338441dc47245b87ed77e8253843b66c367062'
REPO='snapetech-org/seerrng'; PR=418
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']; START,END=3280,3299
CALLER_FILES=['src/components/RequestStatus/messages.tsx','server/lib/requestStatus.ts','src/components/Requests/index.tsx','src/components/Requests/destructiveActions.tsx','src/pages/requests/index.tsx','src/utils/defineMessages.ts']
def sha(value):
    if isinstance(value,str): value=value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()
def run(args): return subprocess.check_output(args,cwd=ROOT,text=True).strip()
def require(ok,msg):
    if not ok: raise SystemExit('ABORT: '+msg)
def dump_json(path,value): Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def dump_jsonl(path,rows): Path(path).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def placeholders(text): return sorted(re.findall(r'\{[A-Za-z_][A-Za-z0-9_]*\}',text))
require(not OUT.exists(),'clean-input already exists; preserve existing output')
require(run(['git','rev-parse','HEAD'])==EXPECTED_HEAD,'worktree HEAD drift')
require(run(['git','rev-parse','HEAD^{tree}'])==EXPECTED_TREE,'worktree tree drift')
require(run(['git','status','--porcelain=v1'])=='','worktree is not clean')
source_path=ROOT/'src/i18n/locale/en.json'; source_bytes=source_path.read_bytes(); source_catalog=json.loads(source_bytes); source_ids=sorted(source_catalog)
require(len(source_ids)==9494,'unexpected English catalog size')
require(PREV.is_dir(),'previous frozen W3260-W3279 input missing')
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=PREV,stdout=subprocess.DEVNULL)
prev=json.loads((PREV/'window.json').read_text(encoding='utf-8')); require(prev['range']==[3260,3279],'prior queue range drift')
for old in prev['sourceIds']:
    pos=old['position']; key=old['id']
    require(source_ids[pos]==key and source_catalog[key]==old['source'],'frozen queue differs at prior position '+str(pos))
require(source_ids[3279]==prev['sourceIds'][-1]['id'],'W3279 boundary drift')
selected=source_ids[START:END+1]
require(len(selected)==20,'window does not contain 20 IDs')
require(selected[0]=='components.RequestStatus.waitingForBinderyApproval','W3280 boundary drift')
require(selected[-1]=='components.Requests.available','W3299 boundary drift')
locale_data={}; catalog_pins={}; locale_orders={}
for loc in ['en']+LOCALES:
    path=ROOT/'src/i18n/locale'/f'{loc}.json'; data=path.read_bytes(); obj=json.loads(data)
    require(isinstance(obj,dict),f'{loc} catalog is not an object')
    require(set(obj)==set(source_catalog),f'{loc} key set differs from English')
    require(len(obj)==9494,f'{loc} key count drift')
    # Catalogs may use one of the already established locale-specific key orders; pin each order independently.
    locale_data[loc]=obj; locale_orders[loc]=list(obj)
    rel=f'src/i18n/locale/{loc}.json'
    catalog_pins[rel]={'sha256':sha(data),'gitBlob':run(['git','rev-parse',f'HEAD:{rel}']),'keyCount':len(obj),'orderedKeySha256':sha('\n'.join(obj))}
source_order_sha=sha('\n'.join(source_ids))
code_files={}; lines_by_file={}
for rel in CALLER_FILES:
    data=(ROOT/rel).read_bytes(); lines=data.decode('utf-8').splitlines()
    code_files[rel]={'sha256':sha(data),'gitBlob':run(['git','rev-parse',f'HEAD:{rel}']),'lineCount':len(lines)}; lines_by_file[rel]=lines

def message_default(key):
    field=key.rsplit('.',1)[-1]
    rel='src/components/RequestStatus/messages.tsx' if key.startswith('components.RequestStatus.') else 'src/components/Requests/index.tsx'
    text='\n'.join(lines_by_file[rel])
    pat=re.compile(r'(?m)^\s*'+re.escape(field)+r'\s*:\s*(?P<literal>\'(?:\\.|[^\'\\])*\'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)')
    match=pat.search(text)
    if not match: return None
    try: return ast.literal_eval(match.group('literal'))
    except Exception: return None
contexts=[]; contexts_by_id={}; context_holds=[]; placeholder_errors=[]; source_rows=[]; cells=[]
def add_context(key,source,rel,line_number,kind):
    lines=lines_by_file[rel]; idx=line_number-1; lo=max(0,idx-3); hi=min(len(lines),idx+4); snippet='\n'.join(lines[lo:hi])
    contexts.append({'id':key,'source':source,'file':rel,'fileSha256':code_files[rel]['sha256'],'fileGitBlob':code_files[rel]['gitBlob'],'line':line_number,'contextStartLine':lo+1,'context':snippet,'contextSha256':sha(snippet),'matchKind':kind})
def context_for(key,source):
    field=key.rsplit('.',1)[-1]
    checks=( [('src/components/RequestStatus/messages.tsx','definition-or-message-key-map'),('server/lib/requestStatus.ts','server-source-to-message-key-map'),('src/components/Requests/index.tsx','visible-status-renderer'),('src/pages/requests/index.tsx','requests-route-caller'),('src/utils/defineMessages.ts','namespace-to-message-id')] if key.startswith('components.RequestStatus.') else [('src/components/Requests/index.tsx','message-definition-or-ui-use'),('src/pages/requests/index.tsx','requests-route-caller'),('src/utils/defineMessages.ts','namespace-to-message-id')] )
    found=[]
    for rel,kind in checks:
        lines=lines_by_file[rel]; hits=[]
        if rel=='src/components/Requests/index.tsx' and kind=='visible-status-renderer':
            hits=[i for i,line in enumerate(lines) if 'RequestStatusMessageText' in line or 'requestStatusMessageKey' in line]
        elif rel=='src/pages/requests/index.tsx': hits=[i for i,line in enumerate(lines) if 'Requests' in line]
        elif rel=='src/utils/defineMessages.ts': hits=[i for i,line in enumerate(lines) if 'export default function defineMessages' in line or 'id: `${prefix}.${key as string}`' in line]
        else:
            for i,line in enumerate(lines):
                stripped=line.strip()
                if re.match(r'^'+re.escape(field)+r'\s*:',stripped): hits.append(i)
                elif rel=='src/components/Requests/index.tsx' and re.search(r'\bmessages\.'+re.escape(field)+r'\b',line): hits.append(i)
                elif rel=='src/components/Requests/index.tsx' and re.search(r'[\'\"]'+re.escape(field)+r'[\'\"]',line) and any(term in line for term in ('label','formatMessage','messages')): hits.append(i)
                elif rel=='server/lib/requestStatus.ts' and (source in line or re.search(r'[\'\"]'+re.escape(field)+r'[\'\"]',line)): hits.append(i)
                elif rel=='src/components/RequestStatus/messages.tsx' and re.search(r'\brequestStatusMessages\.'+re.escape(field)+r'\b',line): hits.append(i)
        for i in sorted(set(hits)):
            idx=i; lo=max(0,idx-3); hi=min(len(lines),idx+4); snippet='\n'.join(lines[lo:hi])
            item={'id':key,'source':source,'file':rel,'fileSha256':code_files[rel]['sha256'],'fileGitBlob':code_files[rel]['gitBlob'],'line':i+1,'contextStartLine':lo+1,'context':snippet,'contextSha256':sha(snippet),'matchKind':kind}
            signature=(rel,i+1,item['contextSha256'])
            if signature not in {(x['file'],x['line'],x['contextSha256']) for x in found}: found.append(item)
    return found
for position,key in enumerate(selected,start=START):
    source=source_catalog[key]; source_hash=sha(source); source_rows.append({'position':position,'id':key,'source':source,'sourceSha256':source_hash})
    default=message_default(key)
    if default is None or default!=source:
        context_holds.append({'position':position,'id':key,'reason':'message definition unavailable or default source differs from en catalog','catalogSource':source,'callerDefault':default})
    found=context_for(key,source)
    if not found: context_holds.append({'position':position,'id':key,'reason':'no production caller context found','catalogSource':source})
    contexts_by_id[key]=found; contexts.extend(found)
    sp=placeholders(source)
    for loc in LOCALES:
        current=locale_data[loc][key]
        require(isinstance(current,str) and current.strip(),f'empty target {loc} {key}')
        cp=placeholders(current); parity=sp==cp
        if not parity: placeholder_errors.append({'position':position,'id':key,'locale':loc,'sourcePlaceholders':sp,'currentPlaceholders':cp})
        cells.append({'position':position,'id':key,'locale':loc,'source':source,'sourceSha256':source_hash,'currentTarget':current,'currentTargetSha256':sha(current),'currentCatalogTranslationHash':sha(json.dumps([key,loc,source,current],ensure_ascii=False,separators=(',',':'))),'catalogPath':f'src/i18n/locale/{loc}.json','catalogFileSha256':catalog_pins[f'src/i18n/locale/{loc}.json']['sha256'],'catalogGitBlob':catalog_pins[f'src/i18n/locale/{loc}.json']['gitBlob'],'sourcePlaceholders':sp,'currentPlaceholders':cp,'placeholderParity':parity,'callerContextHashes':[x['contextSha256'] for x in found]})
require(len(cells)==240 and len({(x['position'],x['locale']) for x in cells})==240,'cell count/uniqueness failure')
ordered_match=len(set(sha('\n'.join(x)) for x in locale_orders.values()))==1
boundaries={'repository':REPO,'pullRequest':PR,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'sourceOrderCount':len(source_ids),'sourceOrderSha256':source_order_sha,'before':{'position':3279,'id':source_ids[3279],'source':source_catalog[source_ids[3279]]},'first':source_rows[0],'last':source_rows[-1],'after':{'position':3300,'id':source_ids[3300],'source':source_catalog[source_ids[3300]]},'localeCatalogPins':catalog_pins,'callerFiles':code_files,'orderedLocaleKeySequencesMatch':ordered_match,'perLocaleOrderedKeyHashesPinned':True,'contextHolds':context_holds,'placeholderParityErrors':placeholder_errors}
window={'repository':REPO,'pullRequest':PR,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'range':[START,END],'previousRange':[3260,3279],'sourceOrderCount':len(source_ids),'sourceOrderSha256':source_order_sha,'cellCount':len(cells),'contextRows':len(contexts),'localeOrder':LOCALES,'localeCatalogPins':catalog_pins,'sourceCatalogSha256':sha(source_bytes),'sourceCatalogKeyCount':len(source_catalog),'callerFiles':code_files,'orderedLocaleKeySequencesMatch':ordered_match,'perLocaleOrderedKeyHashesPinned':True,'strictBlindInputOnly':True,'nativeSpeakerApproval':False,'sourceIds':source_rows,'callerContextHashesById':{k:[x['contextSha256'] for x in v] for k,v in contexts_by_id.items()},'contextHolds':context_holds,'placeholderParityErrors':placeholder_errors,'previousWindowInputManifestSha256':sha((PREV/'SHA256SUMS.txt').read_bytes()),'livePr':{'url':'https://github.com/snapetech-org/seerrng/pull/418','state':'open','draft':True,'head':EXPECTED_HEAD,'headRef':'codex/seerrng-localization-overhaul-20261028','baseRef':'main','tree':EXPECTED_TREE}}
OUT.mkdir(parents=True,exist_ok=False)
(OUT/'README.txt').write_text(f'''# SeerrNG PR #418 W3280–W3299 clean review input\n\nCandidate-free input for 20 sorted English source IDs and 240 existing targets across 12 direct locales, pinned to PR head {EXPECTED_HEAD} and tree {EXPECTED_TREE}. The source queue continues the frozen W3260–W3279 input, whose checksum manifest and source IDs were revalidated. This packet pins all 13 locale catalogs (including English), each catalog’s file hash, Git blob, 9,494-key count and ordered-key hash, plus message-definition, caller, renderer, and route context file/snippet hashes.\n\nW3280 begins at {selected[0]}; W3299 ends at {selected[-1]}. Adjacent source IDs are pinned in source-boundaries.json. The clean input contains no review decisions or proposed translations. Placeholder schemas and current-target parity are recorded for every cell. Context holds: {len(context_holds)}. Current placeholder-parity exceptions: {len(placeholder_errors)}. Machine review is not native-speaker approval.\n''',encoding='utf-8')
dump_json(OUT/'window.json',window); dump_json(OUT/'source-boundaries.json',boundaries); dump_jsonl(OUT/'review-input.jsonl',cells); dump_jsonl(OUT/'caller-contexts.jsonl',contexts)
manifest=OUT/'SHA256SUMS.txt'; files=sorted(p for p in OUT.rglob('*') if p.is_file() and p!=manifest)
manifest.write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf-8')
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=OUT,stdout=subprocess.DEVNULL)
print(json.dumps({'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'range':[START,END],'sourceCount':len(source_rows),'cells':len(cells),'callerContextRows':len(contexts),'contextHolds':len(context_holds),'placeholderParityErrors':len(placeholder_errors),'catalogsPinned':len(catalog_pins),'keyCountPerCatalog':9494,'sourceOrderSha256':source_order_sha,'inputManifestSha256':sha(manifest.read_bytes()),'inputDirectory':str(OUT)},ensure_ascii=False,indent=2))
