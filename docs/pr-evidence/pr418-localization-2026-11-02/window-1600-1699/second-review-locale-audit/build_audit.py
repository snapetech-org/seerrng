from __future__ import annotations
import collections, hashlib, json, re, subprocess
from pathlib import Path

P=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-primary-20261102')
O=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1600-1699-independent-audit-by-root-child-20261102')
W=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
REPO='snapetech-org/seerrng'; PR=418
HEAD_EXPECTED='5aceef6ed6e865ee89383738212d1ce1a5c1f552'; TREE_EXPECTED='dd6e3495c44c2c14acf8a7a4b09a21e935ceb16d'
LOCALES=['hi','ja','ko','zh_Hans','zh_Hant']
EXTRA={
 (1626,'ko'):('변경 사항이 저장되었습니다.','The current Korean says “changes being saved,” but the source is a completed-save confirmation. This final text reports that the changes were saved.'),
 (1629,'ja'):('この問題は利用できないか、閲覧権限がありません。','The current Japanese joins the two conditions with また (also), changing the source’s “or” to an additive statement. This keeps the unavailable-or-no-permission condition.')
}
RATIONALES={
 1614:'This is the discussion form’s Add Comment button; the candidate names the comment object and the add action.',
 1615:'The component is the issue discussion area; the candidate says to add this comment without leaving the localized Manage section.',
 1617:'This help closes a support issue while preserving its description, comments, and history; the candidate keeps both actions.',
 1618:'This is the comment textarea placeholder; the candidate uses the locale’s comment term, not annotation.',
 1619:'This heading names user comments in the discussion panel; the candidate uses the locale term for comments.',
 1620:'This is the issue description heading; the candidate labels description rather than generic content.',
 1624:'This help reopens a closed support issue and retains its comments/history; the candidate preserves those instructions.',
 1625:'This validation requires a comment before submission; the candidate uses the discussion UI’s comment term and keeps the instruction.',
 1626:'This is a success toast after a completed save; the candidate expresses completion rather than an in-progress or money-saving meaning.',
 1627:'This validation limits comment length; the candidate preserves the maxLength numeric placeholder and expresses a maximum character count.',
 1629:'This focused-issue message states that an issue is unavailable or lacks viewing permission; the candidate preserves that alternative.',
 1638:'This metadata label identifies who created the support issue; the candidate is a natural creator label.',
 1639:'This metadata label is the issue creation date; the candidate supplies the missing date meaning.',
 1641:'This tooltip toggles the issue-detail accordion; the candidate names expanding/collapsing the description, comments, and actions.',
 1643:'This metadata is a book/comic first-publication field; the candidate uses publication terminology rather than a film-premiere term.',
 1649:'This UI error reports that issue details could not be loaded; the candidate states the failed action and object naturally.',
 1650:'This status reports that issue details are loading; the candidate retains the loading state and issue object.',
 1654:'This is a definition-only external-app button label; the candidate expresses opening the item in the named app.',
 1655:'This action opens a media format in the named external app; the candidate preserves both runtime placeholders and their relation.',
 1656:'This is a page-count metadata label; the candidate uses the locale’s page-count wording.',
 1657:'This metadata/filter identifies the media release date; the candidate names the date rather than a generic date or release verb.',
 1659:'This is a media-duration field, not software process time; the candidate uses a duration/playback-time term.',
 1664:'This filter is for music album type; the candidate names the music album, not a photo album or episode.',
 1666:'This filter option means all media; the candidate includes the omitted scope.',
 1667:'This is the unbounded/all-time filter; the candidate describes the full time range.',
 1674:'This section heading labels filter controls; the candidate is a noun for filters, not the act of filtering.',
 1675:'This filter describes a first-publication date; the candidate uses publication terminology.',
 1676:'This time filter means the preceding 14 days; the candidate avoids the “final 14 days” reading.',
 1678:'This filter classifies support reports by issue type; the candidate avoids broadcast/publication-type false meanings.',
 1679:'This heading names support issue reports; the candidate uses the natural problem/issue term.',
 1681:'This section label groups media filters; the candidate uses Traditional Chinese forms.',
 1683:'This media filter label is Music; the candidate replaces the stray middle dot.',
 1686:'This filter selects release dates; the candidate names release date in Traditional Chinese.',
 1687:'This filter selects release year; the candidate names year and uses Traditional Chinese forms.',
 1689:'This is a search action for support issue reports; the candidate expresses searching for those problems.',
 1691:'This time filter means the preceding seven days; the candidate avoids a final-seven-days reading.',
 1694:'This filter covers the previous six months, not a point six months ago; the candidate states the time span.',
 1695:'This label introduces sort choices; the candidate is a complete sort-method label.',
 1696:'This sort option is Date; the candidate uses the date noun rather than schedule.'
}

def sha(b): return hashlib.sha256(b).hexdigest()
def textsha(s): return sha(s.encode('utf-8'))
def git(args): return subprocess.check_output(['git','-C',str(W),*args])
def gtext(args): return git(args).decode('utf-8').strip()
def readj(path): return json.loads(path.read_text(encoding='utf-8'))
def readjsonl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def writejson(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def writejsonl(path,rows): path.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf-8')
def signatures(s):
    return [{'name':n,'kind':k,'count':c} for (n,k),c in sorted(collections.Counter((m.group(1),m.group(2) or 'simple') for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal))?\b',s)).items())]
def markup(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def hash_manifest(path): return sha(path.read_bytes())

# Primary evidence is checksummed before review.
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=P,stdout=subprocess.DEVNULL)
pr=json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo',REPO,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],cwd=W,text=True))
head=pr['headRefOid']; tree=gtext(['rev-parse',f'{head}^{{tree}}'])
if pr['state']!='OPEN' or pr['isDraft'] is not True or head!=HEAD_EXPECTED or tree!=TREE_EXPECTED:
    raise SystemExit(f'PR snapshot mismatch: {json.dumps(pr)} {tree}')
if gtext(['rev-parse','HEAD'])!=HEAD_EXPECTED or gtext(['status','--porcelain']):
    raise SystemExit('worktree is not clean at expected PR head')

cells=readjsonl(P/'source-current-cells.jsonl')
ledger=readjsonl(P/'primary-review-ledger.jsonl')
contexts=readjsonl(P/'caller-contexts.jsonl')
manage=readjsonl(P/'manage-labels.jsonl')
assert len(cells)==len(ledger)==1200 and len(contexts)==100 and len(manage)==12
selected=[r for r in ledger if r['locale'] in LOCALES]
cell_by={(r['sourcePosition'],r['locale']):r for r in cells if r['locale'] in LOCALES}
ledger_by={(r['sourcePosition'],r['locale']):r for r in selected}
context_by={r['sourceId']:r for r in contexts}
assert len(selected)==500 and len(ledger_by)==500

# Reattest source inventory and every selected current cell against the live tree.
en_path='src/i18n/locale/en.json'; en_raw=git(['show',f'{head}:{en_path}']); en=json.loads(en_raw.decode('utf-8'))
if gtext(['rev-parse',f'{head}:{en_path}'])!=selected[0]['sourceCatalogBlob'] or sha(en_raw)!=selected[0]['sourceFileSha256']:
    raise SystemExit('English catalog hash/blob differs from frozen packet')
ordered=list(en.keys())
locale_files={}
for r in selected:
    if r['sourceId'] not in en or ordered.index(r['sourceId'])!=r['sourcePosition'] or en[r['sourceId']]!=r['source']:
        raise SystemExit(f'source inventory mismatch at {r["sourcePosition"]} {r["sourceId"]}')
    path=r['localeFile']
    if path not in locale_files:
        raw=git(['show',f'{head}:{path}']); locale_files[path]={'raw':raw,'data':json.loads(raw.decode('utf-8')),
            'blob':gtext(['rev-parse',f'{head}:{path}']),'sha256':sha(raw)}
    target=locale_files[path]['data'].get(r['sourceId'])
    if target!=r['currentTarget'] or textsha(target)!=r['currentTargetHash'] or locale_files[path]['blob']!=r['localeBlob'] or locale_files[path]['sha256']!=r['localeFileSha256']:
        raise SystemExit(f'locale cell mismatch at {r["sourcePosition"]} {r["locale"]}')

# Reattest all pinned caller/definition lines and files. The primary notes two
# definition-only keys and does not claim that those messages render.
caller_pins={}
for c in contexts:
    raw=git(['show',f'{head}:{c["callerPath"]}'])
    if gtext(['rev-parse',f'{head}:{c["callerPath"]}'])!=c['callerBlob'] or sha(raw)!=c['callerFileSha256']:
        raise SystemExit(f'caller file mismatch: {c["callerPath"]}')
    lines=raw.decode('utf-8').splitlines()
    for ref in c['pinnedLineRefs']:
        n=ref['line']
        if not 1<=n<=len(lines) or lines[n-1].strip()!=ref['lineText'].strip() or textsha(lines[n-1])!=ref['lineSha256']:
            raise SystemExit(f'caller line mismatch: {c["callerPath"]}:{n}')
        if n>1 and lines[n-2].strip()!=ref['previousLine'].strip():
            raise SystemExit(f'caller previous-line context mismatch: {c["callerPath"]}:{n}')
        if n<len(lines) and lines[n].strip()!=ref['nextLine'].strip():
            raise SystemExit(f'caller next-line context mismatch: {c["callerPath"]}:{n}')
    caller_pins[c['sourceId']]={'path':c['callerPath'],'blob':c['callerBlob'],'sha256':c['callerFileSha256'],
        'note':c['callerEvidenceNote'],'refs':c['pinnedLineRefs']}

# Reattest localized Manage labels used to interpret capitalized Manage in addHelp.
manage_pins={}
for m in manage:
    if m['locale'] not in LOCALES: continue
    raw=git(['show',f'{head}:{m["localeFile"]}']); cat=json.loads(raw.decode('utf-8'))
    if (gtext(['rev-parse',f'{head}:{m["localeFile"]}'])!=m['localeBlob'] or sha(raw)!=m['localeFileSha256'] or
        textsha(cat.get(m['contextId'],''))!=m['currentTargetHash'] or cat[m['contextId']]!=m['currentTarget']):
        raise SystemExit(f'Manage label mismatch for {m["locale"]}')
    manage_pins[m['locale']]={'source':'Manage','target':m['currentTarget'],'targetSha256':m['currentTargetHash'],
        'file':m['localeFile'],'blob':m['localeBlob'],'fileSha256':m['localeFileSha256']}

# These five locales do not intersect the ten frozen prior Spanish dispositions.
prior_rows=[r for r in selected if r.get('priorDisposition')]
if prior_rows: raise SystemExit('unexpected frozen prior disposition in assigned locale subset')

# Per-cell independent adjudication.
results=[]; new_findings=[]; checks=[]
for r in selected:
    key=(r['sourcePosition'],r['locale']); pos,loc=key
    final=r['targetText']; disp='accepted-current'; confidence='moderate'
    if r['disposition'].startswith('propose-'):
        final=r['targetText']; disp='accepted-primary-candidate'; confidence='moderate'
        reason=RATIONALES.get(pos,'The proposed value preserves the source meaning in the pinned UI context.')
    elif key in EXTRA:
        final,reason=EXTRA[key]; disp='additional-correction'; confidence='high'
        new_findings.append({'sourcePosition':pos,'sourceId':r['sourceId'],'locale':loc,'currentTarget':r['currentTarget'],
            'currentTargetHash':r['currentTargetHash'],'finalTarget':final,'finalTargetHash':textsha(final),'reason':reason})
    else:
        reason=f'The current wording accurately conveys “{r["source"]}” in the pinned component/definition context; no material omission, reversal, or literal issue was found.'
    source_sig=signatures(r['source']); current_sig=signatures(r['currentTarget']); final_sig=signatures(final)
    if source_sig!=current_sig or source_sig!=final_sig:
        raise SystemExit(f'ICU argument mismatch {pos}/{loc}: {source_sig} current={current_sig} final={final_sig}')
    source_tags=markup(r['source']); current_tags=markup(r['currentTarget']); final_tags=markup(final)
    if source_tags!=current_tags or source_tags!=final_tags:
        raise SystemExit(f'markup mismatch {pos}/{loc}')
    protected=[]
    for ph in source_sig:
        name=ph['name']; _kind=ph['kind']
        protected.append({'literal':name,'kind':_kind,'presentInSource':bool(re.search(r'\{\s*'+re.escape(name)+r'\b',r['source'])),
            'presentInCurrentTarget':bool(re.search(r'\{\s*'+re.escape(name)+r'\b',r['currentTarget'])),
            'presentInFinalTarget':bool(re.search(r'\{\s*'+re.escape(name)+r'\b',final))})
    if any(not x['presentInCurrentTarget'] or not x['presentInFinalTarget'] for x in protected):
        raise SystemExit(f'protected placeholder missing {pos}/{loc}')
    c=context_by[r['sourceId']]
    context_status='definition-only/no direct key reference found in pinned component file' if r['callerUseStatus']!='direct-or-helper-callsite-found' else 'pinned caller/helper reference'
    if r['callerUseStatus']!='direct-or-helper-callsite-found' and r['sourceId'] not in ('components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'):
        raise SystemExit(f'unexpected definition-only key {r["sourceId"]}')
    if r['sourceId']=='components.IssueDiscussion.addHelp':
        mg=manage_pins[loc]
        if not r.get('relatedContextLabel') or r['relatedContextLabel']!=mg['target']:
            raise SystemExit(f'Manage label context mismatch {loc}')
    row={'sourcePosition':pos,'sourceId':r['sourceId'],'locale':loc,'source':r['source'],'sourceHash':r['sourceHash'],
        'currentTarget':r['currentTarget'],'currentTargetHash':r['currentTargetHash'],
        'primaryDisposition':r['disposition'],'primaryProposedTarget':r['targetText'] if r['disposition'].startswith('propose-') else None,
        'primaryProposedTargetHash':r['targetHash'] if r['disposition'].startswith('propose-') else None,
        'auditDisposition':disp,'auditRationale':reason,'confidence':confidence,'finalTarget':final,'finalTargetHash':textsha(final),
        'sourcePlaceholders':source_sig,'currentPlaceholders':current_sig,'finalPlaceholders':final_sig,
        'placeholderCheck':'pass','sourceMarkup':source_tags,'currentMarkup':current_tags,'finalMarkup':final_tags,'markupCheck':'pass',
        'protectedLiteralChecks':protected,'protectedLiteralCheck':'pass','callerPath':r['callerPath'],'callerBlob':r['callerBlob'],
        'callerFileSha256':r['callerFileSha256'],'callerLines':r['callerLines'],'callerUseStatus':r['callerUseStatus'],
        'callerEvidenceNote':c['callerEvidenceNote'],'callerContextRefs':c['pinnedLineRefs'],
        'relatedManageLabel':manage_pins.get(loc) if r['sourceId']=='components.IssueDiscussion.addHelp' else None,
        'priorDisposition':None,'sourceCatalogBlob':r['sourceCatalogBlob'],'sourceFileSha256':r['sourceFileSha256'],
        'localeFile':r['localeFile'],'localeBlob':r['localeBlob'],'localeFileSha256':r['localeFileSha256'],
        'nativeSpeakerApproval':False}
    results.append(row)
    checks.append({'sourcePosition':pos,'sourceId':r['sourceId'],'locale':loc,'sourceHash':r['sourceHash'],
        'currentTargetHash':r['currentTargetHash'],'finalTargetHash':row['finalTargetHash'],'sourcePlaceholders':source_sig,
        'currentPlaceholders':current_sig,'finalPlaceholders':final_sig,'placeholderCheck':'pass','sourceMarkup':source_tags,
        'currentMarkup':current_tags,'finalMarkup':final_tags,'markupCheck':'pass','protectedLiteralChecks':protected,'protectedLiteralCheck':'pass'})

assert len(results)==500
counts=collections.Counter(r['auditDisposition'] for r in results)
assert counts=={'accepted-current':403,'accepted-primary-candidate':95,'additional-correction':2},counts

# Final PR/head and content re-attestation before sealing.
pr2=json.loads(subprocess.check_output(['gh','pr','view',str(PR),'--repo',REPO,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'],cwd=W,text=True))
if pr2['headRefOid']!=head or gtext(['rev-parse','HEAD'])!=head or gtext(['rev-parse','HEAD^{tree}'])!=tree or gtext(['status','--porcelain']):
    raise SystemExit('PR/worktree changed during locale audit')
for row in results:
    if locale_files[ledger_by[(row['sourcePosition'],row['locale'])]['localeFile']]['data'][row['sourceId']]!=row['currentTarget']:
        raise SystemExit(f'final cell reattestation failure {row["sourcePosition"]}/{row["locale"]}')

source_pins={'path':en_path,'blob':gtext(['rev-parse',f'{head}:{en_path}']),'sha256':sha(en_raw),'bytes':len(en_raw)}
caller_summary={'sourceIds':len(contexts),'sourceIdsInSubset':len({r['sourceId'] for r in results}),
    'uniqueCallerFiles':len({v['path'] for v in caller_pins.values()}),'definitionOnlyKeys':['components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'],
    'callerRows':{k:v for k,v in caller_pins.items() if k in {'components.IssueDetails.IssueMediaSummary.minutes','components.IssueList.IssueItem.openarr'}}}
summary={'schemaVersion':1,'task':'Independent SeerrNG PR #418 W1600–1699 locale audit subset',
    'repository':REPO,'pullRequest':PR,'state':pr2['state'],'isDraft':pr2['isDraft'],'head':head,'tree':tree,
    'scope':{'positions':[1600,1699],'sourceIds':100,'locales':LOCALES,'cells':500},
    'primaryPacket':str(P),'primaryPacketSha256ManifestVerified':True,
    'primaryCountsForSubset':dict(collections.Counter(r['disposition'] for r in selected)),
    'auditCounts':dict(counts),'primaryCandidatesAccepted':counts['accepted-primary-candidate'],
    'additionalFindings':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'finalTargetHash':x['finalTargetHash']} for x in new_findings],
    'currentCellsReattested':len(results),'callerEvidence':{'pinnedSourceIds':len(contexts),'uniqueCallerFiles':len({v['path'] for v in caller_pins.values()}),
      'definitionOnlyKeys':caller_summary['definitionOnlyKeys'],'directRenderingClaimForDefinitionOnlyKeys':False},
    'manageLabelsReattested':len(manage_pins),'placeholderMismatches':0,'markupMismatches':0,'protectedLiteralMismatches':0,
    'frozenSpanishDispositionRowsInSubset':0,'priorSpanishDispositionHandling':'No assigned locale is Spanish; all ten Spanish frozen rows remain outside this subset and were not changed.',
    'nativeSpeakerApproval':False,'repositoryOrPrModified':False,'testsBuildsScansCiBrowserWorkflowsReleasesTagsMerges':False}

writejsonl(O/'audit-rows.jsonl',results)
writejsonl(O/'integrity-checks.jsonl',checks)
writejsonl(O/'additional-findings.jsonl',new_findings)
writejson(O/'summary.json',summary)
attest={'repository':REPO,'pullRequest':PR,'livePullRequest':pr2,'head':head,'tree':tree,'worktree':str(W),'worktreeClean':True,
    'sourceCatalog':source_pins,'localeCatalogs':{path:{'blob':v['blob'],'sha256':v['sha256'],'bytes':len(v['raw'])} for path,v in locale_files.items()},
    'sourcePositionsReattested':100,'currentCellsReattested':500,'cellMismatches':0,
    'callerSourceIdsReattested':len(contexts),'callerRefsReattested':sum(len(c['pinnedLineRefs']) for c in contexts),
    'callerFileMismatches':0,'manageLabelsReattested':len(manage_pins),'manageLabelMismatches':0,
    'placeholderMismatches':0,'markupMismatches':0,'protectedLiteralMismatches':0,
    'definitionOnlyCallerGaps':caller_summary['definitionOnlyKeys'],'primaryPacketSha256ManifestVerified':True,
    'recheckedAtUtc':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip(),'status':'pass'}
writejson(O/'reattestation.json',attest)
prov={'reviewerRole':'independent locale-subset reviewer','reviewType':'source-context-aware audit of all 500 cells and all primary proposals in assigned locales',
    'locales':LOCALES,'head':head,'tree':tree,'sourcePositions':[1600,1699],
    'nativeSpeakerApproval':False,'repositoryOrPrEdits':False,'testsBuildsScansCiBrowserWorkflows':False}
writejson(O/'reviewer-provenance.json',prov)
manifest={'schemaVersion':1,'repository':REPO,'pullRequest':PR,'head':head,'tree':tree,'scope':summary['scope'],
    'sourceCurrentInputSha256':sha((P/'source-current-cells.jsonl').read_bytes()),
    'primaryReviewLedgerSha256':sha((P/'primary-review-ledger.jsonl').read_bytes()),
    'callerContextsSha256':sha((P/'caller-contexts.jsonl').read_bytes()),
    'manageLabelsSha256':sha((P/'manage-labels.jsonl').read_bytes()),
    'auditRows':{'path':'audit-rows.jsonl','rows':len(results),'sha256':sha((O/'audit-rows.jsonl').read_bytes())},
    'integrityChecks':{'path':'integrity-checks.jsonl','rows':len(checks),'sha256':sha((O/'integrity-checks.jsonl').read_bytes())},
    'additionalFindings':{'path':'additional-findings.jsonl','rows':len(new_findings),'sha256':sha((O/'additional-findings.jsonl').read_bytes())},
    'summarySha256':sha((O/'summary.json').read_bytes()),'reattestationSha256':sha((O/'reattestation.json').read_bytes()),
    'reviewerProvenanceSha256':sha((O/'reviewer-provenance.json').read_bytes()),'nativeSpeakerApproval':False}
writejson(O/'manifest.json',manifest)
readme=f'''# SeerrNG PR #418 W1600–1699 independent locale audit

- PR reattested OPEN/DRAFT at `{head}` / tree `{tree}`; exact primary packet checksums verified.
- This audit covers all 100 source IDs across `hi`, `ja`, `ko`, `zh_Hans`, and `zh_Hant` (500 cells). Each row includes current/final values and hashes, disposition, caller pins, and placeholder/markup/protected-term checks.
- Primary recommendations accepted: {counts['accepted-primary-candidate']}. Additional current-value issues: {len(new_findings)}. Exact extra targets are in `additional-findings.jsonl`.
- Two keys have definition-only caller evidence in the pinned component files: `components.IssueDetails.IssueMediaSummary.minutes` and `components.IssueList.IssueItem.openarr`. The audit assesses their message definitions but makes no claim they render.
- The ten frozen prior Spanish dispositions do not intersect the assigned locales; none were changed.
- All named placeholder/type, markup, and protected-placeholder checks passed. Native-speaker approval is not claimed. No repository/PR edits, tests, builds, scans, CI, browser actions, workflow changes, releases, tags, or merges were performed.
- `SHA256SUMS` covers all packet files other than itself.
'''
(O/'README.md').write_text(readme,encoding='utf-8')
(O/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in sorted(O.iterdir()) if p.is_file() and p.name!='SHA256SUMS'),encoding='utf-8')
print(json.dumps({'head':head,'tree':tree,'rows':len(results),'counts':dict(counts),'newFindings':new_findings,'output':str(O)},ensure_ascii=False,indent=2))
