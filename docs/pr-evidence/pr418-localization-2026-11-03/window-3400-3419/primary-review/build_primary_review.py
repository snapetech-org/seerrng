import collections, hashlib, json, re
from pathlib import Path

ROOT=Path('/mnt/disks/scratch/task-scratch')
OUT=ROOT/'seerrng-pr418-w3400-primary-20261103'
INPUT=ROOT/'seerrng-pr418-w3400-3419-candidate-free-20261103'/'candidate-free-input'
HEAD='fcbc579f724e50a07dc0e12b00127c4f6084c453'
TREE='30e1e5e610e88ba935e482fc7088311d00e214ae'
REPO='snapetech-org/seerrng'
PR=418
BRANCH='codex/seerrng-localization-overhaul-20261028'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']

CANDIDATES={
 (3411,'vi'):('correction','Khởi động lại yêu cầu không thành công này từ bước phê duyệt.','The pinned caller uses this as the retry button tooltip. The current Vietnamese translation omits that the failed request restarts from the approval step.','moderate'),
 (3413,'ar'):('correction','ROMs - حديثة','The current adjective “حديث” is masculine singular, while the source label describes plural ROMs. The proposal uses feminine agreement for the non-human plural category label.','low'),
 (3415,'zh_Hans'):('refinement','时长','The caller uses Runtime as a media metadata field, contrasted with Country. “时长” is a more natural media-duration label than the current general/software “运行时间.”','moderate'),
}

def sha(b): return hashlib.sha256(b).hexdigest()
def jload(path): return json.loads(path.read_text(encoding='utf-8'))
def jl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x]
def dump(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def dumpjl(path,rows): path.write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
def checksum_file(directory,filename):
    result={}
    for line in (directory/filename).read_text(encoding='utf-8').splitlines():
        if not line.strip():continue
        expected,name=line.split(None,1);name=name.lstrip('* ')
        actual=sha((directory/name).read_bytes())
        result[name]={'expected':expected,'actual':actual,'matches':expected==actual}
    return result
def tokens(s):return re.findall(r'\{([^{}]+)\}',s)
def tags(s):return re.findall(r'<[^>]+>',s)
def nums(s):return re.findall(r'(?<![\w])\d+(?:[.,:/-]\d+)*(?!\w)',s)
def edge(s):return [len(s)-len(s.lstrip()),len(s)-len(s.rstrip())]

# Validate every packet file before producing review records.
packet_sums=checksum_file(INPUT,'SHA256SUMS.txt')
assert len(packet_sums)==6 and all(x['matches'] for x in packet_sums.values())
attestation=jload(INPUT/'PR-attestation.json')
window=jload(INPUT/'window.json')
boundaries=jload(INPUT/'source-boundaries.json')
assert attestation['repository']==REPO and attestation['pullRequest']==PR and attestation['state']=='OPEN' and attestation['draft']
assert attestation['headRefOid']==HEAD and attestation['tree']==TREE and attestation['remotePullRefHead']==HEAD
assert window['head']==HEAD and window['tree']==TREE and window['range']==[3400,3419]
assert window['headRef']==BRANCH and window['remotePullRefHead']==HEAD and window['livePrState']=='OPEN' and window['liveDraft']
assert boundaries['head']==HEAD and boundaries['pullRequest']==PR
assert boundaries['boundaryBefore']['position']==3399 and boundaries['boundaryAfter']['position']==3420
assert len(window['sourceIds'])==20 and len(jl(INPUT/'caller-contexts.jsonl'))==20

rows=jl(INPUT/'review-input.jsonl')
caller_rows=jl(INPUT/'caller-contexts.jsonl')
assert len(rows)==240
by_cell={(r['position'],r['locale']):r for r in rows}
ctx_by_pos={r['position']:r for r in caller_rows}
assert len(by_cell)==240 and set(by_cell)=={(p,l) for p in range(3400,3420) for l in LOCALES}
assert set(ctx_by_pos)==set(range(3400,3420))
assert all(r['proposedTarget'] is None and r['reviewDecision'] is None for r in rows)

# Check source/current pins and relation to the pinned caller context for every locale cell.
identity_issues=[]
for key,r in by_cell.items():
    c=ctx_by_pos[key[0]]
    if r['sourceId']!=c['sourceId'] or r['source']!=window['sourceIds'][key[0]-3400]['source']:
        identity_issues.append({'key':key,'issue':'source ID/text mismatch'})
    if sha(r['source'].encode())!=r['sourceSha256'] or sha(r['currentTarget'].encode())!=r['currentTargetSha256']:
        identity_issues.append({'key':key,'issue':'source/current hash mismatch'})
    if r['liveHead']!=HEAD or r['liveTree']!=TREE or r['pullRequest']!=PR or r['repository']!=REPO:
        identity_issues.append({'key':key,'issue':'exact-head pin mismatch'})
    if r['sourcePlaceholders']!=tokens(r['source']) or r['currentPlaceholders']!=tokens(r['currentTarget']):
        identity_issues.append({'key':key,'issue':'placeholder inventory mismatch'})
assert not identity_issues,identity_issues[:3]

review=[]
for pos in range(3400,3420):
    cctx=ctx_by_pos[pos]
    for locale in LOCALES:
        key=(pos,locale);r=by_cell[key]
        if key in CANDIDATES:
            decision,candidate,rationale,confidence=CANDIDATES[key]
            selected=candidate
        else:
            decision='accept-current';candidate=None;selected=r['currentTarget']
            rationale=f"The existing translation conveys the source meaning in the pinned request-interface context. No material semantic omission, reversal, or caller-specific mismatch was found."
            confidence='moderate'
        checks_target=selected
        s_tokens=tokens(r['source']); t_tokens=tokens(checks_target)
        s_tags=tags(r['source']); t_tags=tags(checks_target)
        s_nums=nums(r['source']); t_nums=nums(checks_target)
        s_edge=edge(r['source']); t_edge=edge(checks_target)
        protected=r['sourceProtectedLiterals']
        protected_checks=[{'literal':lit,'presentInSource':lit in r['source'],'presentInCurrent':lit in r['currentTarget'],'presentInSelected':lit in checks_target,'preserved':lit in checks_target} for lit in protected]
        assert s_tokens==t_tokens,(key,'placeholders',s_tokens,t_tokens)
        assert s_tags==t_tags,(key,'markup',s_tags,t_tags)
        assert s_nums==t_nums,(key,'numeric',s_nums,t_nums)
        assert s_edge==t_edge,(key,'edge whitespace',s_edge,t_edge)
        assert all(x['preserved'] for x in protected_checks),(key,protected_checks)
        context=cctx['contexts']
        pinned_contexts=[{
          'path':x['path'],'line':x['line'],'lineSha256':x['lineSha256'],'fileSha256':x['fileSha256'],'fileGitBlob':x['fileGitBlob'],
          'messageNamespace':x['messageNamespace'],'role':x['role'],'note':x.get('note'),
          'previousLine':x.get('previousLine'),'lineText':x.get('lineText'),'nextLine':x.get('nextLine')
        } for x in context]
        row={
          'schemaVersion':1,'reviewId':f'W3400-position-{pos}-{locale}','repository':REPO,'pullRequest':PR,
          'head':HEAD,'tree':TREE,'window':'W3400-W3419','position':pos,'locale':locale,'localeTag':r['localeTag'],
          'sourceId':r['sourceId'],'source':r['source'],'sourceSha256':r['sourceSha256'],
          'targetCatalog':r['targetCatalog'],'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetSha256'],
          'callerContextResolution':r['callerContextResolution'],'directMessagePropertyReferenceCount':r['directMessagePropertyReferenceCount'],
          'pinnedCallerContexts':pinned_contexts,
          'decision':decision,'candidateTarget':candidate,'candidateTargetSha256':sha(candidate.encode()) if candidate is not None else None,
          'selectedTarget':selected,'selectedTargetSha256':sha(selected.encode()),'rationale':rationale,'confidence':confidence,
          'nativeSpeakerApproved':False,
          'integrityChecks':{
            'placeholders':{'source':s_tokens,'selected':t_tokens,'matchesExactly':s_tokens==t_tokens},
            'markupTags':{'source':s_tags,'selected':t_tags,'matchesExactly':s_tags==t_tags},
            'numericTokens':{'source':s_nums,'selected':t_nums,'matchesExactly':s_nums==t_nums},
            'edgeWhitespace':{'source':s_edge,'current':edge(r['currentTarget']),'selected':t_edge,'matchesExactly':s_edge==t_edge},
            'protectedLiterals':protected_checks
          }
        }
        review.append(row)

assert len(review)==240
counts=collections.Counter(x['decision'] for x in review)
assert counts=={'accept-current':237,'correction':2,'refinement':1}

dumpjl(OUT/'primary-decisions.jsonl',review)

input_verification={
 'packetDirectory':str(INPUT),'checksumFile':'SHA256SUMS.txt','checksumFileSha256':sha((INPUT/'SHA256SUMS.txt').read_bytes()),
 'packetFiles':packet_sums,'allPacketChecksumsPass':all(x['matches'] for x in packet_sums.values()),
 'packetManifestSha256':sha((INPUT/'window.json').read_bytes()),
 'sourceAndCellChecks':{'sourcePositions':20,'targetCells':240,'locales':LOCALES,'allSourceAndCurrentHashesRecomputed':True,'allRowsMatchExpectedHeadTree':True,'candidateFreeInputConfirmed':True},
 'callerCoverage':{'callerContextRows':20,'directReferenceCellCount':156,'definitionOrSharedNamespaceCellCount':84,'callerFilePins':window['callerFilePins'],'exactCallerTextAndLineHashesRetained':True},
 'livePin':{'repository':REPO,'pullRequest':PR,'branch':BRANCH,'state':'OPEN','isDraft':True,'head':HEAD,'tree':TREE,'remoteBranchHead':HEAD,'remotePullRefHead':HEAD,'matchesExpected':True}
}
dump(OUT/'input-verification.json',input_verification)

live={'repository':REPO,'pullRequest':PR,'url':'https://github.com/snapetech-org/seerrng/pull/418','state':'OPEN','isDraft':True,'baseRefName':'main','headRefName':BRANCH,'headRefOid':HEAD,'headTree':TREE,'remoteBranchHead':HEAD,'remotePullRefHead':HEAD,'verifiedAt':'2026-11-03','verification':'gh pr view, gh API commit tree, git ls-remote branch and refs/pull/418/head','matchesExpected':True}
dump(OUT/'live-pr-verification.json',live)

summary={
 'artifact':'SeerrNG PR #418 W3400–W3419 primary semantic translation review','repository':REPO,'pullRequest':PR,'branch':BRANCH,'head':HEAD,'tree':TREE,'state':'OPEN','isDraft':True,
 'window':'W3400–W3419','reviewedCells':240,'sourceCount':20,'localeCount':12,'directReferenceCells':156,'definitionOrSharedNamespaceCells':84,
 'decisionCounts':dict(counts),'holds':0,'recommendedCellsByPosition':{'3411':1,'3413':1,'3415':1},
 'structuralChecks':{'placeholderMismatches':0,'markupMismatches':0,'numericTokenMismatches':0,'edgeWhitespaceMismatches':0,'protectedLiteralChecks':sum(len(r['integrityChecks']['protectedLiterals']) for r in review),'protectedLiteralMismatches':0},
 'nativeSpeakerApproval':False,'repositoryOrPREdited':False,'testsBuildsScansCIWorkflowBrowserMergeReleaseOrTagActions':False,
 'reviewLimit':'Machine-assisted semantic review against exact source and caller packets; not native-speaker approval.'
}
dump(OUT/'summary.json',summary)

readme='''# SeerrNG PR #418 W3400–W3419 primary localization review\n\nThis review covers all 240 locale cells from the candidate-free packet at exact head `'''+HEAD+'''`, tree `'''+TREE+'''`. The PR, remote branch, pull ref, packet checksums, and detached worktree were re-attested before review.\n\n## Dispositions\n\n- 237 accept current\n- 2 corrections\n- 1 refinement\n- 0 holds\n\nThe Vietnamese `retryTooltip` proposal restores the omitted approval step. The Arabic `romsModern` proposal fixes adjective agreement. The Simplified Chinese `runtime` proposal uses a media-duration label in its metadata context.\n\nAll source/current hashes and structural tokens were checked. Placeholder, markup, numeric, edge-whitespace, and protected-literal checks pass. The input records both direct callers and definition/shared-namespace-only contexts; they are retained per cell in the ledger.\n\nNo repository or PR files were edited, and no tests, builds, CI, browser work, or releases were run. This is not native-speaker approval. Verify outputs with `sha256sum -c SHA256SUMS.txt`.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')

files=[]
for f in sorted(OUT.iterdir()):
    if f.name in ('manifest.json','SHA256SUMS.txt') or not f.is_file():continue
    data=f.read_bytes();files.append({'path':f.name,'bytes':len(data),'sha256':sha(data)})
dump(OUT/'manifest.json',{'artifact':summary['artifact'],'head':HEAD,'tree':TREE,'decisionCounts':dict(counts),'files':files})
with (OUT/'SHA256SUMS.txt').open('w',encoding='utf-8') as f:
    for path in sorted(OUT.iterdir()):
        if path.name=='SHA256SUMS.txt' or not path.is_file():continue
        f.write(f'{sha(path.read_bytes())}  {path.name}\n')
print(json.dumps({'output':str(OUT),'decisionCounts':dict(counts),'ledgerSha256':sha((OUT/'primary-decisions.jsonl').read_bytes()),'holds':0,'recommendedCells':counts['correction']+counts['refinement']},ensure_ascii=False,indent=2))
