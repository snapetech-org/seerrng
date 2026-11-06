import collections,hashlib,json,re
from pathlib import Path

ROOT=Path('/mnt/disks/scratch/task-scratch')
OUT=ROOT/'seerrng-pr418-w3400-blind-20261103'
INPUT=ROOT/'seerrng-pr418-w3400-3419-candidate-free-20261103'/'candidate-free-input'
REPO='snapetech-org/seerrng';PR=418;BRANCH='codex/seerrng-localization-overhaul-20261028'
HEAD='fcbc579f724e50a07dc0e12b00127c4f6084c453';TREE='30e1e5e610e88ba935e482fc7088311d00e214ae'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
CANDIDATES={
 (3409,'id'):('refinement','Muat ulang informasi permintaan dari Seerr. Tindakan ini tidak memulai ulang atau mengunduh media apa pun.','The tooltip distinguishes refreshing request information from restarting or downloading media. “Apa pun” is the standard separated form here, and “Tindakan ini” makes the subject explicit while preserving Seerr.','moderate'),
 (3411,'vi'):('correction','Khởi động lại yêu cầu không thành công này từ bước phê duyệt.','The caller uses this as the retry button tooltip. The current Vietnamese target omits the approval step from which the failed request is restarted.','moderate'),
 (3413,'ar'):('correction','ROMs - حديثة','The current adjective “حديث” is masculine singular, while the label describes ROMs as a non-human plural. The proposal uses feminine agreement.','low'),
 (3415,'zh_Hans'):('refinement','时长','The caller uses Runtime as a media metadata field contrasted with Country. “时长” is a natural media-duration label; “运行时间” can suggest software execution time.','moderate'),
}

def sha(b):return hashlib.sha256(b).hexdigest()
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def rows(path):return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x]
def dump(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def dump_rows(path,items):path.write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in items),encoding='utf-8')
def checksum(directory,filename):
    result={}
    for line in (directory/filename).read_text(encoding='utf-8').splitlines():
        if not line.strip():continue
        expected,name=line.split(None,1);name=name.lstrip('* ')
        actual=sha((directory/name).read_bytes());result[name]={'expected':expected,'actual':actual,'matches':expected==actual}
    return result
def placeholders(s):return re.findall(r'\{([^{}]+)\}',s)
def markup(s):return re.findall(r'<[^>]+>',s)
def numeric(s):return re.findall(r'(?<![\w])\d+(?:[.,:/-]\d+)*(?!\w)',s)
def edge(s):return [len(s)-len(s.lstrip()),len(s)-len(s.rstrip())]

packet_checks=checksum(INPUT,'SHA256SUMS.txt')
assert len(packet_checks)==6 and all(x['matches'] for x in packet_checks.values())
att=load(INPUT/'PR-attestation.json');window=load(INPUT/'window.json');bounds=load(INPUT/'source-boundaries.json')
assert att['repository']==REPO and att['pullRequest']==PR and att['state']=='OPEN' and att['draft']
assert att['headRefOid']==HEAD and att['tree']==TREE and att['remotePullRefHead']==HEAD
assert window['head']==HEAD and window['tree']==TREE and window['range']==[3400,3419]
assert window['headRef']==BRANCH and window['livePrState']=='OPEN' and window['liveDraft'] and window['remotePullRefHead']==HEAD
assert bounds['boundaryBefore']['position']==3399 and bounds['boundaryAfter']['position']==3420
assert window['candidateFreeInputOnly'] and not window['proposedTranslationsIncluded'] and not window['semanticReviewDecisionsIncluded']
source_rows=window['sourceIds'];input_rows=rows(INPUT/'review-input.jsonl');context_rows=rows(INPUT/'caller-contexts.jsonl')
assert len(source_rows)==20 and len(input_rows)==240 and len(context_rows)==20
ctx={r['position']:r for r in context_rows};by_cell={(r['position'],r['locale']):r for r in input_rows}
assert set(ctx)==set(range(3400,3420))
assert set(by_cell)=={(p,l) for p in range(3400,3420) for l in LOCALES}
assert all(r['proposedTarget'] is None and r['reviewDecision'] is None for r in input_rows)

identity_errors=[]
for (pos,locale),r in by_cell.items():
    s=source_rows[pos-3400]; c=ctx[pos]
    if r['sourceId']!=s['sourceId'] or r['source']!=s['source'] or c['sourceId']!=s['sourceId']:
        identity_errors.append({'cell':[pos,locale],'issue':'source identity mismatch'})
    if sha(r['source'].encode())!=r['sourceSha256'] or sha(r['currentTarget'].encode())!=r['currentTargetSha256']:
        identity_errors.append({'cell':[pos,locale],'issue':'source/current hash mismatch'})
    if r['liveHead']!=HEAD or r['liveTree']!=TREE or r['repository']!=REPO or r['pullRequest']!=PR:
        identity_errors.append({'cell':[pos,locale],'issue':'live pin mismatch'})
    if placeholders(r['source'])!=r['sourcePlaceholders'] or placeholders(r['currentTarget'])!=r['currentPlaceholders']:
        identity_errors.append({'cell':[pos,locale],'issue':'placeholder inventory mismatch'})
assert not identity_errors,identity_errors[:3]

ledger=[]
for pos in range(3400,3420):
    cr=ctx[pos]
    for locale in LOCALES:
        r=by_cell[(pos,locale)]
        if (pos,locale) in CANDIDATES:
            decision,candidate,rationale,confidence=CANDIDATES[(pos,locale)];selected=candidate
        else:
            decision='accept-current';candidate=None;selected=r['currentTarget']
            if r['directMessagePropertyReferenceCount']:
                rationale='The existing translation conveys the source meaning in the pinned request-interface use. I found no material omission, inversion, or context mismatch.'
                confidence='moderate'
            else:
                rationale='The source and its definition/shared-namespace context support this short label. No direct reference in the Requests namespace is pinned, so confidence is limited.'
                confidence='low'
        src_ph=placeholders(r['source']); tgt_ph=placeholders(selected)
        src_markup=markup(r['source']);tgt_markup=markup(selected)
        src_num=numeric(r['source']);tgt_num=numeric(selected)
        src_edge=edge(r['source']);tgt_edge=edge(selected)
        protected=r['sourceProtectedLiterals']
        protected_checks=[{'literal':lit,'presentInSource':lit in r['source'],'presentInCurrent':lit in r['currentTarget'],'presentInSelected':lit in selected,'preserved':lit in selected} for lit in protected]
        assert src_ph==tgt_ph,(pos,locale,'placeholder',src_ph,tgt_ph)
        assert src_markup==tgt_markup,(pos,locale,'markup',src_markup,tgt_markup)
        assert src_num==tgt_num,(pos,locale,'numeric',src_num,tgt_num)
        assert src_edge==tgt_edge,(pos,locale,'edge whitespace',src_edge,tgt_edge)
        assert all(x['preserved'] for x in protected_checks),(pos,locale,protected_checks)
        context_evidence=[{'path':c['path'],'line':c['line'],'lineSha256':c['lineSha256'],'fileSha256':c['fileSha256'],'fileGitBlob':c['fileGitBlob'],'messageNamespace':c['messageNamespace'],'role':c['role'],'note':c.get('note'),'previousLine':c.get('previousLine'),'lineText':c.get('lineText'),'nextLine':c.get('nextLine')} for c in cr['contexts']]
        ledger.append({
          'schemaVersion':1,'reviewId':f'W3400-blind-position-{pos}-{locale}','repository':REPO,'pullRequest':PR,'head':HEAD,'tree':TREE,
          'window':'W3400-W3419','position':pos,'locale':locale,'localeTag':r['localeTag'],'sourceId':r['sourceId'],'source':r['source'],'sourceSha256':r['sourceSha256'],
          'targetCatalog':r['targetCatalog'],'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetSha256'],
          'callerContextResolution':r['callerContextResolution'],'directMessagePropertyReferenceCount':r['directMessagePropertyReferenceCount'],'pinnedCallerContexts':context_evidence,
          'disposition':decision,'candidateTarget':candidate,'candidateTargetSha256':sha(candidate.encode()) if candidate is not None else None,
          'selectedTarget':selected,'selectedTargetSha256':sha(selected.encode()),'rationale':rationale,'confidence':confidence,'nativeSpeakerApproved':False,
          'integrityChecks':{
            'placeholders':{'source':src_ph,'selected':tgt_ph,'matchesExactly':src_ph==tgt_ph},
            'markupTags':{'source':src_markup,'selected':tgt_markup,'matchesExactly':src_markup==tgt_markup},
            'numericTokens':{'source':src_num,'selected':tgt_num,'matchesExactly':src_num==tgt_num},
            'edgeWhitespace':{'source':src_edge,'current':edge(r['currentTarget']),'selected':tgt_edge,'matchesExactly':src_edge==tgt_edge},
            'protectedLiterals':protected_checks
          }
        })
assert len(ledger)==240
counts=collections.Counter(r['disposition'] for r in ledger)
assert counts=={'accept-current':236,'correction':2,'refinement':2}
dump_rows(OUT/'blind-decisions.jsonl',ledger)

# This blind pass deliberately does not compare any primary review or create a disagreement list.
input_verification={
 'candidateFreePacket':{'directory':str(INPUT),'checksumFile':'SHA256SUMS.txt','checksumFileSha256':sha((INPUT/'SHA256SUMS.txt').read_bytes()),'files':packet_checks,'allChecksumsPass':all(x['matches'] for x in packet_checks.values())},
 'windowSha256':sha((INPUT/'window.json').read_bytes()),
 'sourceAndCellChecks':{'sourceRows':20,'cellRows':240,'localeOrder':LOCALES,'allSourceAndCurrentHashesRecomputed':True,'allRowsAtExpectedHeadTree':True,'candidateFreeConfirmed':True},
 'callerContextCounts':{'directPropertyCells':sum(1 for r in input_rows if r['directMessagePropertyReferenceCount']>0),'definitionOrSharedNamespaceCells':sum(1 for r in input_rows if r['directMessagePropertyReferenceCount']==0),'pinnedContextRows':20,'callerFilePins':window['callerFilePins']},
 'blindIsolation':{'primaryLedgerOpened':False,'primaryComparisonPerformed':False,'disagreementStatus':'Not assessed in this blind pass; comparison should be performed after the blind ledger is sealed.'},
 'livePin':{'repository':REPO,'pullRequest':PR,'state':'OPEN','isDraft':True,'branch':BRANCH,'head':HEAD,'tree':TREE,'remoteBranchHead':HEAD,'remotePullRefHead':HEAD,'matchesExpected':True}
}
dump(OUT/'input-verification.json',input_verification)
live={'repository':REPO,'pullRequest':PR,'url':'https://github.com/snapetech-org/seerrng/pull/418','state':'OPEN','isDraft':True,'baseRefName':'main','headRefName':BRANCH,'headRefOid':HEAD,'headTree':TREE,'remoteBranchHead':HEAD,'remotePullRefHead':HEAD,'verifiedAt':'2026-11-03','verification':'gh pr view, gh API commit tree, git ls-remote branch and refs/pull/418/head','matchesExpected':True}
dump(OUT/'live-pr-verification.json',live)
summary={
 'artifact':'SeerrNG PR #418 W3400–W3419 independent blind semantic review','repository':REPO,'pullRequest':PR,'branch':BRANCH,'head':HEAD,'tree':TREE,'state':'OPEN','isDraft':True,
 'window':'W3400–W3419','reviewedCells':240,'sourceCount':20,'localeCount':12,'decisionCounts':dict(counts),'holds':0,
 'recommendationsByCell':{'3409:id':'refinement','3411:vi':'correction','3413:ar':'correction','3415:zh_Hans':'refinement'},
 'structuralChecks':{'placeholderMismatches':0,'markupMismatches':0,'numericTokenMismatches':0,'edgeWhitespaceMismatches':0,'protectedLiteralChecks':sum(len(r['integrityChecks']['protectedLiterals']) for r in ledger),'protectedLiteralMismatches':0},
 'primaryComparisonPerformed':False,'disagreements':'Not assessed during blind review; no primary output was opened.',
 'nativeSpeakerApproval':False,'repositoryOrPREdited':False,'testsBuildsScansCIWorkflowBrowserMergeReleaseOrTagActions':False,
 'reviewLimit':'Machine-assisted independent semantic review against exact source and caller packets; not native-speaker approval.'
}
dump(OUT/'summary.json',summary)
readme='''# SeerrNG PR #418 W3400–W3419 independent blind review\n\nThis sealed blind review covers 240 cells from the candidate-free packet at exact head `'''+HEAD+'''`, tree `'''+TREE+'''`. The live PR and remote refs were re-attested, and every packet checksum passed.\n\n## Dispositions\n\n- 236 accept current\n- 2 corrections\n- 2 refinements\n- 0 holds\n\nRecommendations: restore “from the approval step” in Vietnamese retry tooltip; correct feminine agreement in the Arabic modern-ROM label; use a media-duration term for Simplified Chinese Runtime; and improve Indonesian wording for the Seerr refresh tooltip.\n\nThe ledger records exact source/caller pins and per-cell placeholder, markup, numeric, edge-whitespace, and protected-literal checks. This blind pass did not open or compare a primary review; disagreements remain unassessed until a later cross-audit. No native-speaker approval is claimed.\n\nVerify this output with `sha256sum -c SHA256SUMS.txt`.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
files=[]
for p in sorted(OUT.iterdir()):
    if p.name in ('manifest.json','SHA256SUMS.txt') or not p.is_file():continue
    b=p.read_bytes();files.append({'path':p.name,'bytes':len(b),'sha256':sha(b)})
dump(OUT/'manifest.json',{'artifact':summary['artifact'],'head':HEAD,'tree':TREE,'decisionCounts':dict(counts),'files':files})
with (OUT/'SHA256SUMS.txt').open('w',encoding='utf-8') as f:
    for p in sorted(OUT.iterdir()):
        if p.name=='SHA256SUMS.txt' or not p.is_file():continue
        f.write(f'{sha(p.read_bytes())}  {p.name}\n')
print(json.dumps({'output':str(OUT),'decisionCounts':dict(counts),'blindLedgerSha256':sha((OUT/'blind-decisions.jsonl').read_bytes()),'holds':0,'primaryComparisonPerformed':False},ensure_ascii=False,indent=2))
