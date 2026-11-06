from __future__ import annotations
import collections, hashlib, json, re, subprocess
from pathlib import Path

PARENT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-primary-20261102')
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-crossreview-by-agent-20261102')
REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
REPO_NAME='snapetech-org/seerrng'; PR=418
HEAD_EXPECTED='5aceef6ed6e865ee89383738212d1ce1a5c1f552'
TREE_EXPECTED='dd6e3495c44c2c14acf8a7a4b09a21e935ceb16d'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PRIOR_PLAN='docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/exact-hash-apply-plan.jsonl'
SECONDARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-independent-audit-by-root-child-20261102')

# Additional current-cell issues found during independent review. Final targets
# are suggestions only; this packet does not edit the repository or PR.
ADDITIONAL={
 (1626,'ko'):('변경 사항이 저장되었습니다.','additional-correction','The current Korean says “being saved changes” rather than reporting a completed save. This success toast needs the completed-past form.','moderate'),
 (1629,'ja'):('この問題は利用できないか、閲覧権限がありません。','additional-correction','The current Japanese uses また (“also”) and changes the source’s “or” into a second assertion. This preserves the either/or access condition.','high'),
 (1655,'fr'):('Ouvrir {format} dans {arr}','additional-refinement','In this external-app action, French uses dans for “in the app”; en is not the natural preposition here. Both runtime placeholders remain in place.','moderate'),
 (1659,'id'):('Durasi','additional-correction','This runtime label is in a media metadata row. Waktu proses suggests process execution time; Durasi names the media duration.','moderate'),
 (1662,'id'):('Lihat Detail','additional-refinement','This is a View Details button; Lihat Detail is the common direct UI wording, while Tilik Rincian is unusually marked for this action.','moderate'),
 (1697,'ar'):('آخر تعديل','additional-refinement','The Arabic adjective for “last/most recent” is آخر; the current أخر is a spelling error in this sort label.','moderate')
}

def sha(b): return hashlib.sha256(b.encode('utf-8') if isinstance(b,str) else b).hexdigest()
def canon(obj): return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def read_lines(path): return path.read_bytes().splitlines()
def read_jsonl(base,name): return [json.loads(x) for x in read_lines(base/name) if x.strip()]
def write_jsonl(path,rows): path.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
def write_json(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
def git(args): return subprocess.check_output(['git','-C',str(REPO),*args])
def gittext(args): return git(args).decode('utf-8').strip()
def flatten(d,prefix=''):
    for k,v in d.items():
        key=f'{prefix}.{k}' if prefix else k
        if isinstance(v,dict): yield from flatten(v,key)
        else: yield key,v
PH_RE=re.compile(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal))?\b')
TAG_RE=re.compile(r'</?[A-Za-z][^>]*>|&(?:#\d+|[A-Za-z][A-Za-z0-9]+);')
def placeholders(s): return [{'name':m.group(1),'kind':m.group(2) or 'simple'} for m in PH_RE.finditer(s)]
def markup(s): return TAG_RE.findall(s)
def multiset(items,keys): return collections.Counter(tuple(x[k] for k in keys) for x in items)
def sorted_ph(s): return sorted(placeholders(s),key=lambda x:(x['name'],x['kind']))

# Verify primary and independent locale-audit packet checksums before using evidence.
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=PARENT,stdout=subprocess.DEVNULL)
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=SECONDARY,stdout=subprocess.DEVNULL)
secondary_summary=json.loads((SECONDARY/'summary.json').read_text())
secondary_rows=[json.loads(x) for x in (SECONDARY/'audit-rows.jsonl').read_text().splitlines()]
if (secondary_summary['head']!=HEAD_EXPECTED or secondary_summary['tree']!=TREE_EXPECTED or
    len(secondary_rows)!=500 or secondary_summary['currentCellsReattested']!=500):
    raise SystemExit('independent five-locale audit packet pin/scope mismatch')
secondary_by={(r['sourcePosition'],r['locale']):r for r in secondary_rows}
pr=json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],cwd=REPO,text=True))
head=pr['headRefOid']; tree=gittext(['rev-parse',f'{head}^{{tree}}'])
if pr['state']!='OPEN' or pr['isDraft'] is not True or head!=HEAD_EXPECTED or tree!=TREE_EXPECTED:
    raise SystemExit(f'live PR state/head/tree mismatch: {json.dumps(pr)} tree={tree}')
if gittext(['rev-parse','HEAD'])!=head or gittext(['rev-parse','HEAD^{tree}'])!=tree or gittext(['status','--porcelain']):
    raise SystemExit('read-only audit worktree is not clean at the expected head/tree')

source_cells=read_jsonl(PARENT,'source-current-cells.jsonl')
primary=read_jsonl(PARENT,'primary-review-ledger.jsonl')
caller_rows=read_jsonl(PARENT,'caller-contexts.jsonl')
manage_rows=read_jsonl(PARENT,'manage-labels.jsonl')
assert len(source_cells)==1200 and len(primary)==1200 and len(caller_rows)==100 and len(manage_rows)==12
source_by={(r['sourcePosition'],r['locale']):r for r in source_cells}
primary_by={(r['sourcePosition'],r['locale']):r for r in primary}
caller_by={r['sourceId']:r for r in caller_rows}
manage_by={r['locale']:r for r in manage_rows}
raw_source={}
for line in read_lines(PARENT/'source-current-cells.jsonl'):
    r=json.loads(line); raw_source[(r['sourcePosition'],r['locale'])]=line
raw_primary={}
for line in read_lines(PARENT/'primary-review-ledger.jsonl'):
    r=json.loads(line); raw_primary[(r['sourcePosition'],r['locale'])]=line

# Rebuild source insertion order and all catalog blobs at the live tree.
source_path='src/i18n/locale/en.json'
source_raw=git(['show',f'{head}:{source_path}']); source_file_blob=gittext(['rev-parse',f'{head}:{source_path}'])
source_catalog=json.loads(source_raw.decode('utf-8')); source_flat=dict(flatten(source_catalog)); ordered=list(flatten(source_catalog))
selected=ordered[1600:1700]
if len(selected)!=100: raise SystemExit('source insertion-order window is not 100 entries')
source_order=[source_id for source_id,_ in selected]
if any(source_by[(pos,LOCALES[0])]['sourceId']!=source_order[pos-1600] for pos in range(1600,1700)):
    raise SystemExit('frozen source order differs from live English catalog')
source_info={'path':source_path,'blob':source_file_blob,'sha256':sha(source_raw),'bytes':len(source_raw)}
if sha(source_raw)!=source_cells[0]['sourceFileSha256'] or source_file_blob!=source_cells[0]['sourceCatalogBlob']:
    raise SystemExit('English catalog blob/hash differs from frozen input')
locale_catalogs={}; locale_flat={}; locale_pins={}
for loc in LOCALES:
    path=f'src/i18n/locale/{loc}.json'
    raw=git(['show',f'{head}:{path}']); blob=gittext(['rev-parse',f'{head}:{path}'])
    locale_pins[loc]={'path':path,'blob':blob,'sha256':sha(raw),'bytes':len(raw)}
    locale_catalogs[loc]=json.loads(raw.decode('utf-8')); locale_flat[loc]=dict(flatten(locale_catalogs[loc]))
for row in source_cells:
    key=(row['sourcePosition'],row['locale']); sid=row['sourceId']; loc=row['locale']
    if (row['sourcePosition']<1600 or row['sourcePosition']>1699 or sid!=source_order[row['sourcePosition']-1600] or
        source_flat.get(sid)!=row['source'] or sha(row['source'].encode())!=row['sourceHash'] or
        locale_flat[loc].get(sid)!=row['currentTarget'] or sha(row['currentTarget'].encode())!=row['currentTargetHash']):
        raise SystemExit(f'live source/current mismatch at {key}')
    if (row['sourceCatalogBlob']!=source_file_blob or row['sourceFileSha256']!=sha(source_raw) or
        row['localeBlob']!=locale_pins[loc]['blob'] or row['localeFileSha256']!=locale_pins[loc]['sha256']):
        raise SystemExit(f'catalog pin mismatch at {key}')

# Pinned caller contexts, including definition-only rows. Verify exact file blob,
# file digest, each line, its hash, and adjacent context. Do not infer rendering
# from a definition-only string or claim a complete dynamic call graph.
caller_rechecks=[]; caller_file_pins={}
for ctx in caller_rows:
    raw=git(['show',f'{head}:{ctx["callerPath"]}']); blob=gittext(['rev-parse',f'{head}:{ctx["callerPath"]}'])
    lines=raw.decode('utf-8').splitlines()
    if blob!=ctx['callerBlob'] or sha(raw)!=ctx['callerFileSha256']:
        raise SystemExit(f'caller-file hash mismatch: {ctx["callerPath"]}')
    refs=[]
    for ref in ctx['pinnedLineRefs']:
        n=ref['line']
        if not 1<=n<=len(lines): raise SystemExit(f'caller line out of range: {ctx["callerPath"]}:{n}')
        raw_line=lines[n-1]
        line=raw_line.strip()
        prev=lines[n-2].strip() if n>1 else None
        nxt=lines[n].strip() if n<len(lines) else None
        if (line!=ref['lineText'] or sha(raw_line)!=ref['lineSha256'] or prev!=ref['previousLine'] or nxt!=ref['nextLine']):
            raise SystemExit(f'caller line/context mismatch: {ctx["callerPath"]}:{n}')
        refs.append({'line':n,'lineText':line,'lineSha256':sha(raw_line),'previousLine':prev,'nextLine':nxt})
    caller_file_pins[ctx['callerPath']]={'blob':blob,'sha256':sha(raw),'bytes':len(raw)}
    direct=not (ctx['sourceId'] in ('components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'))
    caller_rechecks.append({'sourceId':ctx['sourceId'],'callerPath':ctx['callerPath'],'callerBlob':blob,'callerFileSha256':sha(raw),
      'searchTerms':ctx['searchTerms'],'callerUseStatus':'direct-or-helper-callsite-found' if direct else 'definition-only/no direct reference in pinned component file',
      'pinnedLineRefs':refs,'callerEvidenceNote':ctx['callerEvidenceNote'],'noRenderClaim':not direct})
# Validate the named caller gaps have only their definition evidence and remain explicit.
for sid in ('components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'):
    ctx=caller_by[sid]
    if len(ctx['pinnedLineRefs'])!=1 or sid.split('.')[-1] not in ctx['pinnedLineRefs'][0]['lineText']:
        raise SystemExit(f'definition-only evidence changed for {sid}')

# Reattest the Manage labels used by Add Comment help.
for loc,row in manage_by.items():
    if (row['head']!=head or row['tree']!=tree or row['source']!=source_flat.get('i18n.manage') or
        locale_flat[loc].get('i18n.manage')!=row['currentTarget'] or sha(row['currentTarget'].encode())!=row['currentTargetHash'] or
        row['localeBlob']!=locale_pins[loc]['blob'] or row['localeFileSha256']!=locale_pins[loc]['sha256']):
        raise SystemExit(f'Manage label pin mismatch: {loc}')

# Reattest the exact frozen Spanish decisions from their tracked plan and row bytes.
plan_raw=git(['show',f'{head}:{PRIOR_PLAN}']); plan_blob=gittext(['rev-parse',f'{head}:{PRIOR_PLAN}'])
plan_sha=sha(plan_raw); plan_rows={}; plan_line_hash={}
for line in plan_raw.splitlines():
    if not line.strip(): continue
    r=json.loads(line)
    if r.get('locale')=='es' and r.get('id'):
        key=(r['id'],'es'); plan_rows[key]=r; plan_line_hash[key]=sha(line)
frozen=[r for r in primary if r['disposition']=='preserved-prior-disposition']
if len(frozen)!=10: raise SystemExit(f'expected 10 frozen Spanish rows, found {len(frozen)}')
frozen_rechecks=[]
for r in frozen:
    d=r['priorDisposition']; key=(r['sourceId'],'es'); plan=plan_rows.get(key)
    if not plan: raise SystemExit(f'frozen Spanish decision missing from tracked plan: {key}')
    checks={
      'planBlobMatches':d['priorEvidenceBlob']==plan_blob,
      'planFileShaMatches':d['priorEvidenceFileSha256']==plan_sha,
      'planRowShaMatches':d['priorEvidenceRowSha256']==plan_line_hash[key],
      'priorSourceHashMatches':plan.get('sourceHash')==r['sourceHash']==d['priorSourceHash'],
      'priorSourceTextMatches':plan.get('source')==r['source'],
      'priorCurrentTargetMatches':plan.get('currentTarget')==d['priorCurrentTarget'],
      'priorCurrentHashMatches':plan.get('currentTargetHash')==d['priorCurrentTargetHash'],
      'priorProposalMatches':plan.get('proposal')==d['priorProposal'],
      'priorProposalHashMatches':plan.get('proposalHash')==d['priorProposalHash'],
      'priorReviewDecisionMatches':plan.get('reviewDecision')==d['reviewDecision'],
      'frozenFinalMatchesLive':plan.get('finalTarget')==r['currentTarget']==d['priorTarget'],
      'frozenFinalHashMatchesLive':plan.get('finalTargetHash')==r['currentTargetHash']==d['priorTargetHash']}
    if not all(checks.values()): raise SystemExit(f'frozen Spanish row mismatch: {key} {checks}')
    frozen_rechecks.append({'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':'es','liveCurrentTarget':r['currentTarget'],
      'liveCurrentTargetHash':r['currentTargetHash'],'finalTarget':d['priorTarget'],'finalTargetHash':d['priorTargetHash'],
      'priorDisposition':d,'planRowSha256':plan_line_hash[key],'checks':checks,'disposition':'preserved-exact-prior-disposition'})

# Independent cross-review of all 1,200 current/candidate cells.
rows=[]; checks=[]; additional_rows=[]
for cell in source_cells:
    key=(cell['sourcePosition'],cell['locale']); p=primary_by[key]; ctx=caller_by[cell['sourceId']]
    if (p['sourceId']!=cell['sourceId'] or p['source']!=cell['source'] or p['sourceHash']!=cell['sourceHash'] or
        p['currentTarget']!=cell['currentTarget'] or p['currentTargetHash']!=cell['currentTargetHash'] or
        p['locale']!=cell['locale'] or p['sourcePosition']!=cell['sourcePosition'] or
        p['targetHash']!=sha(p['targetText'])):
        raise SystemExit(f'primary/input row mismatch: {key}')
    candidate=p['targetText'] if p['disposition'].startswith('propose-') else None
    if p['disposition']=='preserved-prior-disposition':
        final=p['priorDisposition']['priorTarget']; disposition='preserved-prior-disposition'
        rationale=('Preserved exactly as the tracked Spanish prior disposition requires; the live current target, source hash, prior plan row, and prior final-target hash all match.')
        confidence='high'
    elif key in ADDITIONAL:
        final,disposition,rationale,confidence=ADDITIONAL[key]
    elif candidate is not None:
        final=candidate; disposition='accepted-primary-candidate'
        rationale=(f'Accepted independently against {p["callerContextRef"]}: the candidate correctly expresses “{cell["source"]}” for this caller context, '
                   'fixes the current wording, and preserves the exact placeholders, markup, and protected literals.')
        confidence='moderate'
    else:
        final=cell['currentTarget']; disposition='accepted-current'; confidence='moderate'
        note='definition-only key; render/use is not asserted' if cell['sourceId'] in ('components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr') else f'pinned {p["callerContextRef"]} UI context'
        rationale=(f'The current {cell["locale"]} wording conveys “{cell["source"]}” for the {note}; no material reversal, omission, or terminology error was found.')
    # Compare named ICU arguments and types, markup, and exact protected tokens.
    src_ph=sorted_ph(cell['source']); cur_ph=sorted_ph(cell['currentTarget']); final_ph=sorted_ph(final)
    ph_ok=(multiset(src_ph,('name','kind'))==multiset(cur_ph,('name','kind'))==multiset(final_ph,('name','kind')))
    if not ph_ok: raise SystemExit(f'ICU placeholder mismatch at {key}: {src_ph} / {cur_ph} / {final_ph}')
    src_markup=markup(cell['source']); cur_markup=markup(cell['currentTarget']); final_markup=markup(final)
    markup_ok=(src_markup==cur_markup==final_markup)
    if not markup_ok: raise SystemExit(f'markup mismatch at {key}: {src_markup} / {cur_markup} / {final_markup}')
    protected_placeholders=[]
    for ph in src_ph:
        token={'name':ph['name'],'kind':ph['kind'],'sourceHasName':ph['name'] in cell['source'],
               'currentHasName':ph['name'] in cell['currentTarget'],'finalHasName':ph['name'] in final}
        protected_placeholders.append(token)
    protected_ok=all(x['currentHasName'] and x['finalHasName'] for x in protected_placeholders)
    if not protected_ok: raise SystemExit(f'protected placeholder name missing at {key}')
    protected_literals=[]
    for literal in p.get('protectedLiterals',[]):
        lc={'literal':literal,'matchMode':'exact','presentInSource':literal in cell['source'],
            'presentInCurrentTarget':literal in cell['currentTarget'],'presentInFinalTarget':literal in final}
        protected_literals.append(lc)
    if any(not x['presentInCurrentTarget'] or not x['presentInFinalTarget'] for x in protected_literals):
        raise SystemExit(f'protected literal missing at {key}')
    caller_ctx=ctx
    caller_refs=[]
    for ref in caller_ctx['pinnedLineRefs']:
        caller_refs.append({'file':caller_ctx['callerPath'],'fileBlob':caller_ctx['callerBlob'],'fileSha256':caller_ctx['callerFileSha256'],
          'line':ref['line'],'lineText':ref['lineText'],'lineSha256':ref['lineSha256'],
          'previousLine':ref['previousLine'],'nextLine':ref['nextLine']})
    related_manage=manage_by[cell['locale']] if cell['sourceId']=='components.IssueDiscussion.addHelp' else None
    primary_candidate_hash=sha(candidate.encode()) if candidate is not None else None
    record={
      'repository':REPO_NAME,'pullRequest':PR,'exactHead':head,'exactTree':tree,
      'sourcePosition':cell['sourcePosition'],'sourceId':cell['sourceId'],'locale':cell['locale'],
      'source':cell['source'],'sourceSha256':cell['sourceHash'],'sourceFile':cell['sourceFile'],
      'sourceFileBlob':cell['sourceCatalogBlob'],'sourceFileSha256':cell['sourceFileSha256'],
      'currentTarget':cell['currentTarget'],'currentTargetSha256':cell['currentTargetHash'],
      'targetFile':cell['localeFile'],'targetFileBlob':cell['localeBlob'],'targetFileSha256':cell['localeFileSha256'],
      'primaryDisposition':p['disposition'],'primaryRationale':p['rationale'],'primaryTarget':p['targetText'],
      'primaryTargetSha256':p['targetHash'],'primaryCandidate':candidate,'primaryCandidateSha256':primary_candidate_hash,
      'priorDisposition':p['priorDisposition'],'crossReviewDisposition':disposition,
      'crossReviewRationale':rationale,'confidence':confidence,'finalTarget':final,'finalTargetSha256':sha(final.encode()),
      'sourcePlaceholders':src_ph,'currentPlaceholders':cur_ph,'finalPlaceholders':final_ph,'placeholderCheck':'pass',
      'sourceMarkup':src_markup,'currentMarkup':cur_markup,'finalMarkup':final_markup,'markupCheck':'pass',
      'protectedPlaceholderChecks':protected_placeholders,'protectedLiteralChecks':protected_literals,'protectedLiteralCheck':'pass',
      'callerContextRef':cell['callerContextRef'],'callerPath':caller_ctx['callerPath'],'callerBlob':caller_ctx['callerBlob'],
      'callerFileSha256':caller_ctx['callerFileSha256'],'callerUseStatus':p['callerUseStatus'],
      'callerEvidenceNote':caller_ctx['callerEvidenceNote'],'pinnedCallerLines':caller_refs,
      'noDirectCallerRenderClaim':cell['sourceId'] in ('components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'),
      'relatedManageLabel':({'source':'Manage','currentTarget':related_manage['currentTarget'],'currentTargetSha256':related_manage['currentTargetHash'],
         'localeFile':related_manage['localeFile'],'localeBlob':related_manage['localeBlob'],'localeFileSha256':related_manage['localeFileSha256']} if related_manage else None),
      'sourceCurrentInputRowSha256':sha(raw_source[key]),'primaryLedgerRowSha256':sha(raw_primary[key]),
      'callerContextRowSha256':sha(canon(caller_ctx)),'manageLabelRowSha256':sha(canon(related_manage)) if related_manage else None,
      'nativeSpeakerApproval':False}
    rows.append(record)
    checks.append({'sourcePosition':cell['sourcePosition'],'sourceId':cell['sourceId'],'locale':cell['locale'],
      'sourceSha256':cell['sourceHash'],'currentTargetSha256':cell['currentTargetHash'],'finalTargetSha256':record['finalTargetSha256'],
      'sourcePlaceholders':src_ph,'currentPlaceholders':cur_ph,'finalPlaceholders':final_ph,'placeholderCheck':'pass',
      'sourceMarkup':src_markup,'currentMarkup':cur_markup,'finalMarkup':final_markup,'markupCheck':'pass',
      'protectedPlaceholderChecks':protected_placeholders,'protectedLiteralChecks':protected_literals,'protectedLiteralCheck':'pass'})
    if disposition in ('additional-correction','additional-refinement'):
        additional_rows.append({'sourcePosition':cell['sourcePosition'],'sourceId':cell['sourceId'],'locale':cell['locale'],
          'findingType':disposition,'currentTarget':cell['currentTarget'],'currentTargetSha256':cell['currentTargetHash'],
          'primaryDisposition':p['disposition'],'primaryTarget':p['targetText'],'primaryTargetSha256':p['targetHash'],
          'crossReviewedTarget':final,'crossReviewedTargetSha256':record['finalTargetSha256'],'reason':rationale})
assert len(rows)==1200 and len({(x['sourcePosition'],x['locale']) for x in rows})==1200
# The independent five-locale audit is a second reviewer; compare every one of
# its 500 source/current/final values against this full-window ledger.
secondary_agreements=0
for rec in rows:
    key=(rec['sourcePosition'],rec['locale'])
    if rec['locale'] not in ('hi','ja','ko','zh_Hans','zh_Hant'): continue
    other=secondary_by[key]
    if (other['source']!=rec['source'] or other['sourceHash']!=rec['sourceSha256'] or
        other['currentTarget']!=rec['currentTarget'] or other['currentTargetHash']!=rec['currentTargetSha256'] or
        other['finalTarget']!=rec['finalTarget'] or other['finalTargetHash']!=rec['finalTargetSha256']):
        raise SystemExit(f'independent locale-audit disagreement at {key}')
    secondary_agreements+=1
if secondary_agreements!=500: raise SystemExit(f'expected 500 secondary audit matches, got {secondary_agreements}')
cross_counts=collections.Counter(r['crossReviewDisposition'] for r in rows)
expected={'accepted-current':998,'accepted-primary-candidate':186,'preserved-prior-disposition':10,'additional-correction':3,'additional-refinement':3}
if cross_counts!=expected: raise SystemExit(f'cross disposition count mismatch: {cross_counts} != {expected}')
assert len(additional_rows)==6

# Final live PR, source, catalog, caller, plan, and current-cell reattestation.
final_pr=json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],cwd=REPO,text=True))
if (final_pr['headRefOid']!=head or gittext(['rev-parse','HEAD'])!=head or gittext(['rev-parse','HEAD^{tree}'])!=tree or gittext(['status','--porcelain'])):
    raise SystemExit('PR/worktree changed during cross-review')
if sha(git(['show',f'{head}:{source_path}']))!=sha(source_raw): raise SystemExit('source catalog changed during review')
for loc,pin in locale_pins.items():
    if gittext(['rev-parse',f'{head}:{pin["path"]}'])!=pin['blob'] or sha(git(['show',f'{head}:{pin["path"]}']))!=pin['sha256']:
        raise SystemExit(f'locale catalog changed during review: {loc}')
if sha(git(['show',f'{head}:{PRIOR_PLAN}']))!=plan_sha or gittext(['rev-parse',f'{head}:{PRIOR_PLAN}'])!=plan_blob:
    raise SystemExit('frozen Spanish plan changed during review')
for rec in caller_rechecks:
    raw=git(['show',f'{head}:{rec["callerPath"]}'])
    if sha(raw)!=rec['callerFileSha256'] or gittext(['rev-parse',f'{head}:{rec["callerPath"]}'])!=rec['callerBlob']:
        raise SystemExit(f'caller changed during review: {rec["callerPath"]}')

# Seal packet outputs after all independent judgements and reattestations.
write_jsonl(OUT/'cross-review-cells.jsonl',rows)
write_jsonl(OUT/'integrity-checks.jsonl',checks)
write_jsonl(OUT/'additional-findings.jsonl',additional_rows)
write_jsonl(OUT/'frozen-spanish-dispositions.jsonl',frozen_rechecks)
write_jsonl(OUT/'caller-context-reattestations.jsonl',caller_rechecks)
write_jsonl(OUT/'manage-labels.jsonl',list(manage_by.values()))
primary_counts=collections.Counter(r['disposition'] for r in primary)
per_locale={loc:dict(collections.Counter(r['crossReviewDisposition'] for r in rows if r['locale']==loc)) for loc in LOCALES}
summary={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':head,'exactTree':tree,
 'scope':{'positions':[1600,1699],'sourceIds':100,'locales':LOCALES,'cells':1200},
 'parentPacket':str(PARENT),'parentSourceCurrentSha256':sha((PARENT/'source-current-cells.jsonl').read_bytes()),
 'parentPrimaryLedgerSha256':sha((PARENT/'primary-review-ledger.jsonl').read_bytes()),
 'primaryDispositionCounts':dict(primary_counts),'crossReviewDispositionCounts':dict(cross_counts),'crossReviewCountsByLocale':per_locale,
 'primaryCandidateRows':sum(r['disposition'].startswith('propose-') for r in primary),
 'candidateOutcomes':{'acceptedAsProposed':sum(r['crossReviewDisposition']=='accepted-primary-candidate' for r in rows),
   'refined':0,'rejected':0,'preservedPriorSpanish':len(frozen_rechecks),'additionalCurrentIssues':len(additional_rows)},
 'additionalFindings':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'type':x['findingType'],'finalTargetSha256':x['crossReviewedTargetSha256']} for x in additional_rows],
 'sourceValuesReattested':100,'currentCellsReattested':1200,'callerContextRowsReattested':100,
 'callerFilesReattested':len(caller_file_pins),'definitionOnlyCallerGaps':['components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'],
 'manageLabelsReattested':len(manage_rows),'frozenSpanishDispositionsReattested':len(frozen_rechecks),
 'priorSpanishPlan':{'path':PRIOR_PLAN,'blob':plan_blob,'sha256':plan_sha,'frozenRows':len(frozen_rechecks)},
 'secondReviewerAudit':{'path':str(SECONDARY),'rows':secondary_agreements,'rowsSha256':sha((SECONDARY/'audit-rows.jsonl').read_bytes()),'summarySha256':sha((SECONDARY/'summary.json').read_bytes()),'sha256sumsVerified':True},
 'placeholderMismatches':0,'markupMismatches':0,'protectedLiteralMismatches':0,'protectedLiteralChecks':sum(len(r['protectedLiteralChecks']) for r in rows),
 'secondReviewerAudit':{'path':str(SECONDARY),'cells':secondary_agreements,'sha256':sha((SECONDARY/'audit-rows.jsonl').read_bytes()),'checksumsVerified':True,'additionalFindingAgreement':2},
 'nativeSpeakerApproval':False,'browserReview':False,'repositoryModified':False,
 'testsBuildsScansCiWorkflowsReleasesTagsMerges':False,'blockers':[]}
write_json(OUT/'summary.json',summary)
reattest={'repository':REPO_NAME,'pullRequest':PR,'livePullRequest':final_pr,'head':head,'tree':tree,'worktree':str(REPO),'worktreeClean':True,
 'sourceWindow':[1600,1699],'sourceIds':100,'locales':LOCALES,'cells':1200,
 'primaryPacketSha256sumsVerified':True,'primaryPacketSha256':sha((PARENT/'SHA256SUMS').read_bytes()),
 'sourceCurrentInputSha256':summary['parentSourceCurrentSha256'],'primaryLedgerSha256':summary['parentPrimaryLedgerSha256'],
 'sourceCatalog':source_info,'targetCatalogs':locale_pins,'sourceOrderMatchesLiveCatalog':True,
 'callerContextRowsReattested':100,'callerFiles':caller_file_pins,'callerMismatches':0,
 'definitionOnlyCallerGaps':summary['definitionOnlyCallerGaps'],'manageLabelsReattested':12,
 'frozenSpanishPlan':{'path':PRIOR_PLAN,'blob':plan_blob,'sha256':plan_sha,'rowsReattested':len(frozen_rechecks),'rowMismatches':0},
 'sourceValuesReattested':100,'currentCellsReattested':1200,'cellMismatches':0,
 'placeholdersRechecked':1200,'placeholderMismatches':0,'markupRechecked':1200,'markupMismatches':0,
 'protectedPlaceholderChecks':sum(len(r['protectedPlaceholderChecks']) for r in rows),'protectedLiteralChecks':sum(len(r['protectedLiteralChecks']) for r in rows),'protectedLiteralMismatches':0,
 'secondReviewerAuditAgreement':secondary_agreements,'status':'pass','recheckedAtUtc':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip()}
write_json(OUT/'reattestation.json',reattest)
provenance={'reviewerRole':'independent cross-reviewer','reviewType':'independent adjudication of all frozen source/current/candidate cells against pinned caller context and exact prior Spanish dispositions',
 'exactHead':head,'exactTree':tree,'scope':summary['scope'],
 'inputs':['English source catalog','12 direct locale catalogs','100 pinned component/helper definitions and caller references','Manage UI labels','all 1,200 primary ledger rows','tracked exact-hash Spanish decision plan','independent second review of 500 Hindi/Japanese/Korean/Simplified Chinese/Traditional Chinese cells'],
 'definitionOnlyCallerNote':'The minutes and openarr strings are present in the pinned component files, but no direct reference was found in those files; the packet makes no claim that they render.',
 'nativeSpeakerApproval':False,'browserReview':False,'repositoryOrPrEdits':False,'testsBuildsScansCiRun':False,'workflowsTouched':False}
write_json(OUT/'reviewer-provenance.json',provenance)
manifest={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'head':head,'tree':tree,'livePullRequest':final_pr,'scope':summary['scope'],
 'primaryPacket':{'sourceCurrentSha256':summary['parentSourceCurrentSha256'],'primaryLedgerSha256':summary['parentPrimaryLedgerSha256'],'sha256sumsVerified':True},
 'secondReviewerAudit':{'path':str(SECONDARY),'rows':secondary_agreements,'rowsSha256':sha((SECONDARY/'audit-rows.jsonl').read_bytes()),'summarySha256':sha((SECONDARY/'summary.json').read_bytes()),'additionalFindingAgreement':2},
 'crossReview':{'path':'cross-review-cells.jsonl','rows':len(rows),'sha256':sha((OUT/'cross-review-cells.jsonl').read_bytes()),'dispositions':dict(cross_counts)},
 'integrityChecks':{'path':'integrity-checks.jsonl','rows':len(checks),'sha256':sha((OUT/'integrity-checks.jsonl').read_bytes()),
   'placeholderMismatches':0,'markupMismatches':0,'protectedLiteralMismatches':0},
 'additionalFindings':{'path':'additional-findings.jsonl','rows':len(additional_rows),'sha256':sha((OUT/'additional-findings.jsonl').read_bytes())},
 'frozenSpanishDispositions':{'path':'frozen-spanish-dispositions.jsonl','rows':len(frozen_rechecks),'sha256':sha((OUT/'frozen-spanish-dispositions.jsonl').read_bytes()),'trackedPlanBlob':plan_blob,'trackedPlanSha256':plan_sha},
 'callerContextReattestations':{'path':'caller-context-reattestations.jsonl','rows':len(caller_rechecks),'sha256':sha((OUT/'caller-context-reattestations.jsonl').read_bytes()),'callerFiles':len(caller_file_pins)},
 'manageLabels':{'path':'manage-labels.jsonl','rows':len(manage_rows),'sha256':sha((OUT/'manage-labels.jsonl').read_bytes())},
 'summarySha256':sha((OUT/'summary.json').read_bytes()),'reattestationSha256':sha((OUT/'reattestation.json').read_bytes()),
 'reviewerProvenanceSha256':sha((OUT/'reviewer-provenance.json').read_bytes()),
 'nativeSpeakerApproval':False,'repositoryModified':False,'testsBuildsScansCiRun':False,'workflowsTouched':False}
write_json(OUT/'manifest.json',manifest)
readme=f'''# SeerrNG PR #418 W1600–1699 independent cross-review

- Live PR state: OPEN/DRAFT at `{head}`, tree `{tree}`. The read-only audit worktree is clean.
- Scope: 100 source entries × 12 direct locales = 1,200 cells. Source positions follow the pinned English catalog insertion order.
- Independent verdicts: {dict(cross_counts)}. All {summary['primaryCandidateRows']} primary candidates were considered; {summary['candidateOutcomes']['acceptedAsProposed']} were accepted as proposed. Ten Spanish cells retain the exact previously approved dispositions. Six additional current-cell findings were recorded.
- `cross-review-cells.jsonl` has the source, current and final target text/hashes; primary candidate and hash; caller evidence; per-cell verdict/rationale; and placeholder, markup, and protected-token results.
- `frozen-spanish-dispositions.jsonl` reattests every Spanish row against the tracked exact-hash plan, including exact prior row hashes, source/current/proposal/final hashes, and review action.
- `caller-context-reattestations.jsonl` records all 100 pinned caller/definition files and lines. `minutes` and `openarr` are definition-only in their pinned component files; this packet does not claim they render. `manage-labels.jsonl` pins the locale-specific Manage labels referenced by Add Comment help.
- A second independent audit of Hindi, Japanese, Korean, Simplified Chinese, and Traditional Chinese agrees on all 500 final targets and independently found the Korean W1626 and Japanese W1629 corrections. Its checksummed packet is under `{SECONDARY}`.
- Placeholder and markup checks passed for all 1,200 cells; no protected placeholder name/type is missing. Final PR/catalog/caller/prior-plan reattestation is in `reattestation.json`.
- This model-based cross-review is not native-speaker approval. No repo/PR edits, tests, builds, scans, CI, browser actions, or workflow edits were made.
- `SHA256SUMS` covers every packet file other than itself.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
# Last PR pin check before packet checksumming.
last_pr=json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid'],cwd=REPO,text=True))
if last_pr['headRefOid']!=head or gittext(['rev-parse','HEAD'])!=head or gittext(['rev-parse','HEAD^{tree}'])!=tree or gittext(['status','--porcelain']):
    raise SystemExit('PR or worktree moved before packet seal')
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS')
(OUT/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in files),encoding='utf-8')
print(json.dumps({'head':head,'tree':tree,'crossReviewCounts':dict(cross_counts),'primaryCandidates':summary['primaryCandidateRows'],
 'priorSpanish':len(frozen_rechecks),'additionalFindings':additional_rows,'callerFiles':len(caller_file_pins),
 'definitionOnly':summary['definitionOnlyCallerGaps'],'cells':len(rows),'output':str(OUT)},ensure_ascii=False,indent=2))
