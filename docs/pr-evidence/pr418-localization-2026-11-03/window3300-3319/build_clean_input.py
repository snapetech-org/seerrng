import ast, hashlib, json, re, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent/'checkout'
TASK=Path(__file__).resolve().parent
OUT=TASK/'clean-input'
PREV=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window3280-3299-20261103/clean-input')
EXPECTED_HEAD='7f652dc9b529506fded0064f73cf4a4d32dba1a9'; EXPECTED_TREE='9a42f2efdc0f64e99928a4994304413036b8a315'
REPO='snapetech-org/seerrng'; PR=418
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']; START,END=3300,3319
CALLER_FILES=['src/components/RequestStatus/messages.tsx','server/lib/requestStatus.ts','src/components/Requests/index.tsx','src/components/Requests/destructiveActions.tsx','src/pages/requests/index.tsx','src/utils/defineMessages.ts']
PROTECTED_TERMS=['Seerr','ChaptarrNG','Bindery','Bookshelf','Radarr','Sonarr','Plex','Emby','Jellyfin','TMDb','IMDb','Open Library','ComicVine','MusicBrainz','TheTVDB','Trakt','Letterboxd','Prowlarr','Bazarr','Lidarr','Readarr','Whisparr','Sportarr','Audiobookshelf']
def sha(value):
    if isinstance(value,str): value=value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()
def run(args): return subprocess.check_output(args,cwd=ROOT,text=True).strip()
def require(ok,msg):
    if not ok: raise SystemExit('ABORT: '+msg)
def dump_json(path,value): Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def dump_jsonl(path,rows): Path(path).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def placeholders(text): return sorted(re.findall(r'\{[A-Za-z_][A-Za-z0-9_]*\}',text))
def protected_terms(text): return [term for term in PROTECTED_TERMS if re.search(r'(?<![\w])'+re.escape(term)+r'(?![\w])',text,re.I)]
def js_literal(line):
    m=re.search(r"(?P<literal>'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`)",line)
    if not m: return None
    try: return ast.literal_eval(m.group('literal'))
    except Exception: return None
def message_literal(lines,i):
    for candidate in lines[i:i+5]:
        val=js_literal(candidate)
        if val is not None: return val
    return None
require(not OUT.exists(),'clean-input already exists; preserve existing output')
require(run(['git','rev-parse','HEAD'])==EXPECTED_HEAD,'worktree HEAD drift')
require(run(['git','rev-parse','HEAD^{tree}'])==EXPECTED_TREE,'worktree tree drift')
require(run(['git','status','--porcelain=v1'])=='','worktree is not clean')
source_path=ROOT/'src/i18n/locale/en.json'; source_bytes=source_path.read_bytes(); source_catalog=json.loads(source_bytes); source_ids=sorted(source_catalog)
require(len(source_ids)==9494,'unexpected English catalog size')
require(PREV.is_dir(),'previous frozen W3280-W3299 input missing')
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=PREV,stdout=subprocess.DEVNULL)
prev=json.loads((PREV/'window.json').read_text(encoding='utf-8')); require(prev['range']==[3280,3299],'prior queue range drift')
for old in prev['sourceIds']:
    pos=old['position']; key=old['id']
    require(source_ids[pos]==key and source_catalog[key]==old['source'],'frozen queue differs at prior position '+str(pos))
require(source_ids[3299]==prev['sourceIds'][-1]['id'],'W3299 boundary drift')
selected=source_ids[START:END+1]
require(len(selected)==20,'window does not contain 20 IDs')
require(selected[0]=='components.Requests.book','W3300 boundary drift')
require(selected[-1]=='components.Requests.deleteTooltip','W3319 boundary drift')
locale_data={}; catalog_pins={}; locale_orders={}
for loc in ['en']+LOCALES:
    path=ROOT/'src/i18n/locale'/f'{loc}.json'; data=path.read_bytes(); obj=json.loads(data)
    require(isinstance(obj,dict),f'{loc} catalog is not an object')
    require(set(obj)==set(source_catalog),f'{loc} key set differs from English')
    require(len(obj)==9494,f'{loc} key count drift')
    locale_data[loc]=obj; locale_orders[loc]=list(obj)
    rel=f'src/i18n/locale/{loc}.json'
    catalog_pins[rel]={'sha256':sha(data),'gitBlob':run(['git','rev-parse',f'HEAD:{rel}']),'keyCount':len(obj),'orderedKeySha256':sha('\n'.join(obj))}
source_order_sha=sha('\n'.join(source_ids))
code_files={}; lines_by_file={}
for rel in CALLER_FILES:
    data=(ROOT/rel).read_bytes(); lines=data.decode('utf-8').splitlines()
    code_files[rel]={'sha256':sha(data),'gitBlob':run(['git','rev-parse',f'HEAD:{rel}']),'lineCount':len(lines)}; lines_by_file[rel]=lines
# Find namespace declaration range and source defaults.
req_lines=lines_by_file['src/components/Requests/index.tsx']
block_start=next(i for i,s in enumerate(req_lines) if "defineMessages('components.Requests'" in s)
block_end=next(i for i in range(block_start,len(req_lines)) if req_lines[i].strip()=='});')
destruct=lines_by_file['src/components/Requests/destructiveActions.tsx']
destruct_start=next(i for i,s in enumerate(destruct) if 'export const requestActionMessageText = {' in s)
destruct_end=next(i for i in range(destruct_start,len(destruct)) if destruct[i].strip()=='};')
contexts=[]; contexts_by_id={}; caller_holds=[]; placeholder_errors=[]; source_rows=[]; cells=[]
def add_context(key,source,rel,i,kind):
    lines=lines_by_file[rel]; lo=max(0,i-3); hi=min(len(lines),i+4); snippet='\n'.join(lines[lo:hi])
    item={'id':key,'source':source,'file':rel,'fileSha256':code_files[rel]['sha256'],'fileGitBlob':code_files[rel]['gitBlob'],'line':i+1,'contextStartLine':lo+1,'context':snippet,'contextSha256':sha(snippet),'matchKind':kind}
    sig=(rel,i+1,item['contextSha256'])
    if sig not in {(x['file'],x['line'],x['contextSha256']) for x in contexts}:
        contexts.append(item); contexts_by_id.setdefault(key,[]).append(item)
def extract_context_and_usage(key,source):
    field=key.rsplit('.',1)[-1]
    defaults=[]; definition_count=0; usage_count=0
    # Request namespace message definitions, direct refs, and helper-based destructive-action context.
    for rel,lines in lines_by_file.items():
        for i,line in enumerate(lines):
            if rel=='src/components/Requests/index.tsx':
                if block_start<=i<=block_end and re.match(r'^\s*'+re.escape(field)+r'\s*:',line):
                    definition_count+=1; add_context(key,source,rel,i,'components.Requests-message-definition')
                    val=message_literal(lines,i)
                    if val is not None: defaults.append(val)
                # Record only explicit references outside the declaration block.
                if not (block_start<=i<=block_end) and re.search(r'\bmessages\.'+re.escape(field)+r'\b',line):
                    usage_count+=1; add_context(key,source,rel,i,'messages-field-production-reference')
                # Status and filter labels are rendered through typed key maps and keyed lookup.
                if not (block_start<=i<=block_end) and (
                    re.search(r"^\s*"+re.escape(field)+r"\s*:\s*['\"]"+re.escape(field)+r"['\"]",line)
                    or re.search(r"label\s*:\s*['\"]"+re.escape(field)+r"['\"]",line)
                ):
                    nearby='\n'.join(lines[max(0,i-8):min(len(lines),i+9)])
                    render_patterns=(r'messages\[requestStatusMessageKey\[currentStage\]',r'messages\[option\.label\]',r'messages\[filter\.label\]')
                    if any(re.search(p, '\n'.join(lines)) for p in render_patterns):
                        usage_count+=1; add_context(key,source,rel,i,'typed-key-map-production-reference')
                        for j,candidate in enumerate(lines):
                            if any(re.search(p,candidate) for p in render_patterns):
                                add_context(key,source,rel,j,'dynamic-message-key-renderer')
            elif rel=='src/components/Requests/destructiveActions.tsx':
                if destruct_start<=i<=destruct_end and re.match(r'^\s*'+re.escape(field)+r'\s*:',line):
                    # This text is also spread into components.Requests; capture its true origin.
                    definition_count+=1; add_context(key,source,rel,i,'spread-source-requestActionMessageText')
                    val=message_literal(lines,i)
                    if val is not None: defaults.append(val)
                if re.search(r'\brequestActionMessages\.'+re.escape(field)+r'\b',line):
                    add_context(key,source,rel,i,'parallel-RequestStatus-namespace-reference')
                # Dynamic action indexing is context only; it does not prove this Request namespace ID is used.
                if field in ('delete','deleting') and re.search(r'requestActionMessages\[(action|["\'])',line):
                    add_context(key,source,rel,i,'dynamic-RequestStatus-action-renderer-context')
            elif rel=='src/pages/requests/index.tsx':
                if 'Requests' in line:
                    add_context(key,source,rel,i,'requests-route-context')
            elif rel=='src/utils/defineMessages.ts':
                if 'export default function defineMessages' in line or 'id: `${prefix}.${key as string}`' in line:
                    add_context(key,source,rel,i,'namespace-to-message-id-contract')
    return {'defaults':defaults,'definitions':definition_count,'usages':usage_count}
for position,key in enumerate(selected,start=START):
    source=source_catalog[key]; source_hash=sha(source); source_rows.append({'position':position,'id':key,'source':source,'sourceSha256':source_hash})
    link=extract_context_and_usage(key,source)
    if source not in link['defaults']:
        caller_holds.append({'position':position,'id':key,'reason':'source default did not resolve exactly from pinned production message definitions','definitionsFound':link['definitions'],'source':source})
    caller_exists=link['usages']>0
    if not caller_exists:
        caller_holds.append({'position':position,'id':key,'reason':'no direct production reference to this components.Requests message ID was found; generic/dynamic RequestStatus action rendering is context only','definitionsFound':link['definitions'],'directMessageReferences':link['usages'],'source':source})
    contexts_by_id.setdefault(key,[])
    sp=placeholders(source); spt=protected_terms(source)
    for loc in LOCALES:
        current=locale_data[loc][key]
        require(isinstance(current,str) and current.strip(),f'empty target {loc} {key}')
        cp=placeholders(current); parity=sp==cp
        if not parity: placeholder_errors.append({'position':position,'id':key,'locale':loc,'sourcePlaceholders':sp,'currentPlaceholders':cp})
        cpt=protected_terms(current)
        cells.append({'position':position,'id':key,'locale':loc,'source':source,'sourceSha256':source_hash,'currentTarget':current,'currentTargetSha256':sha(current),'currentCatalogTranslationHash':sha(json.dumps([key,loc,source,current],ensure_ascii=False,separators=(',',':'))),'catalogPath':f'src/i18n/locale/{loc}.json','catalogFileSha256':catalog_pins[f'src/i18n/locale/{loc}.json']['sha256'],'catalogGitBlob':catalog_pins[f'src/i18n/locale/{loc}.json']['gitBlob'],'sourcePlaceholders':sp,'currentPlaceholders':cp,'placeholderParity':parity,'sourceProtectedLiterals':spt,'currentProtectedLiterals':cpt,'protectedLiteralOccurrencesPinned':True,'callerContextHashes':[x['contextSha256'] for x in contexts_by_id[key]],'callerContextResolved':bool(contexts_by_id[key]),'callerExists':caller_exists,'directMessageReferences':link['usages'],'eligibility':'eligible' if caller_exists else 'hold-context'})
require(len(cells)==240 and len({(x['position'],x['locale']) for x in cells})==240,'cell count/uniqueness failure')
ordered_match=len(set(sha('\n'.join(x)) for x in locale_orders.values()))==1
previous_boundary={'position':3299,'id':source_ids[3299],'source':source_catalog[source_ids[3299]]}
boundaries={'repository':REPO,'pullRequest':PR,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'sourceOrderCount':len(source_ids),'sourceOrderSha256':source_order_sha,'before':previous_boundary,'first':source_rows[0],'last':source_rows[-1],'after':{'position':3320,'id':source_ids[3320],'source':source_catalog[source_ids[3320]]},'localeCatalogPins':catalog_pins,'callerFiles':code_files,'orderedLocaleKeySequencesMatch':ordered_match,'perLocaleOrderedKeyHashesPinned':True,'callerHolds':caller_holds,'placeholderParityErrors':placeholder_errors,'protectedTermsPolicy':PROTECTED_TERMS}
window={'repository':REPO,'pullRequest':PR,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'range':[START,END],'previousRange':[3280,3299],'sourceOrderCount':len(source_ids),'sourceOrderSha256':source_order_sha,'cellCount':len(cells),'contextRows':len(contexts),'localeOrder':LOCALES,'localeCatalogPins':catalog_pins,'sourceCatalogSha256':sha(source_bytes),'sourceCatalogKeyCount':len(source_catalog),'callerFiles':code_files,'orderedLocaleKeySequencesMatch':ordered_match,'perLocaleOrderedKeyHashesPinned':True,'strictBlindInputOnly':True,'nativeSpeakerApproval':False,'sourceIds':source_rows,'callerContextHashesById':{k:[x['contextSha256'] for x in v] for k,v in contexts_by_id.items()},'callerHolds':caller_holds,'placeholderParityErrors':placeholder_errors,'protectedTermsPolicy':PROTECTED_TERMS,'previousWindowInputManifestSha256':sha((PREV/'SHA256SUMS.txt').read_bytes()),'livePr':{'url':'https://github.com/snapetech-org/seerrng/pull/418','state':'open','draft':True,'head':EXPECTED_HEAD,'headRef':'codex/seerrng-localization-overhaul-20261028','baseRef':'main','tree':EXPECTED_TREE}}
OUT.mkdir(parents=True,exist_ok=False)
(OUT/'README.txt').write_text(f'''# SeerrNG PR #418 W3300–W3319 clean review input\n\nCandidate-free input for 20 contiguous English source IDs and 240 existing targets across 12 direct locales, pinned to PR head {EXPECTED_HEAD} and tree {EXPECTED_TREE}. The source queue continues the checksum-verified W3280–W3299 clean input. It pins all 13 locale catalogs (including English), file hashes, Git blobs, 9,494-key counts and ordered-key hashes, plus exact message-definition, caller, route, and namespace-contract context snippets and file hashes.\n\nW3300 begins at {selected[0]}; W3319 ends at {selected[-1]}. Adjacent source IDs are pinned in source-boundaries.json. The clean input contains no review decisions or proposed translations. Placeholder schemas and source/current protected-literal occurrences are recorded for every cell. Caller context rows: {len(contexts)}. Caller-gate holds: {len(caller_holds)} source findings (see window/source boundaries); current placeholder-parity exceptions: {len(placeholder_errors)}. Caller context resolved is distinct from a field-specific production caller existing. This machine review is not native-speaker approval.\n''',encoding='utf-8')
dump_json(OUT/'window.json',window); dump_json(OUT/'source-boundaries.json',boundaries); dump_jsonl(OUT/'review-input.jsonl',cells); dump_jsonl(OUT/'caller-contexts.jsonl',contexts)
manifest=OUT/'SHA256SUMS.txt'; files=sorted(p for p in OUT.rglob('*') if p.is_file() and p!=manifest)
manifest.write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf-8')
subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=OUT,stdout=subprocess.DEVNULL)
print(json.dumps({'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'range':[START,END],'sourceCount':len(source_rows),'cells':len(cells),'callerContextRows':len(contexts),'callerHolds':len(caller_holds),'callerHoldIds':sorted({h['id'] for h in caller_holds}),'placeholderParityErrors':len(placeholder_errors),'catalogsPinned':len(catalog_pins),'keyCountPerCatalog':9494,'sourceOrderSha256':source_order_sha,'inputManifestSha256':sha(manifest.read_bytes()),'inputDirectory':str(OUT)},ensure_ascii=False,indent=2))
