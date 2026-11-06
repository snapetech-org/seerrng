#!/usr/bin/env python3
"""Seal a primary-only W3960-W3979 semantic review from candidate-free input."""
from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parent
CF = pathlib.Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3960-3979-primary-20261104/candidate-free-input')
SOURCE = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source')
HEAD = 'a456dd66aad34cb23f432cb3c189bb8083bbbe96'
TREE = '7a5447e5f08e84c392899a6e1400d1df73b1143b'
WINDOW = 'W3960-W3979'
LOCALES = ['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']

PROPOSALS = {
    (3962,'ar'): ('CORRECTION', 'إدخال واحد في كل سطر: Slack user ID=SeerrNG user ID. يجب أن يمتلك كل مستخدم SeerrNG المُعيّن إذن إدارة الطلبات.', 'moderate', 'The line describes a required input format. Keeping the literal Slack user ID=SeerrNG user ID pattern makes the mapping syntax clear and retains the protected ID token.'),
    (3974,'ar'): ('CORRECTION', 'أدخل ID صالحًا لمساحة عمل Slack', 'moderate', 'Retains the source ID acronym while translating the validation prompt for a valid Slack workspace ID.'),
    (3975,'ar'): ('REFINEMENT', 'عنوان URL الخاص بـ Webhook', 'moderate', 'Uses the recognizable Webhook term for this field and preserves the required URL token; the current literal “web hook” wording is less clear as a product field label.'),
    (3975,'zh-Hant'): ('CORRECTION', 'Webhook URL', 'high', 'The current 網頁 URL means a web page URL. Webhook URL preserves the source field meaning and the URL token.'),
    (3976,'de'): ('CORRECTION', 'Erstelle eine Integration mit einem <WebhookLink>eingehenden Webhook</WebhookLink>.', 'moderate', 'The linked phrase in the current value has an agreement error. This wording clearly asks the user to create an integration with an incoming Webhook and retains both markup tags.'),
    (3976,'hi'): ('REFINEMENT', 'एक <WebhookLink>इनकमिंग वेबहुक</WebhookLink> के लिए इंटीग्रेशन बनाएँ।', 'moderate', 'Reorders the current awkward infinitive phrase into a clear imperative: create an integration for an incoming Webhook. Markup is preserved.'),
    (3977,'ar'): ('CORRECTION', 'ID مساحة عمل Slack', 'moderate', 'Retains the source ID acronym in the field label while translating the surrounding words.'),
    (3978,'ar'): ('CORRECTION', 'ID مساحة العمل التي تملك تطبيق Slack هذا.', 'moderate', 'Retains the source ID acronym and clearly identifies it as the ID of the workspace that owns this Slack app.'),
}

POSITION_RATIONALES = {
 3960:'The current translation preserves both actions (approve and decline buttons) and the requirement to enable pending-request notifications above.',
 3961:'The current value names the request-manager mapping configuration shown as a required Slack setting.',
 3962:'The current value communicates one mapping per line, the Slack-to-SeerrNG user-ID format, and the request-management permission requirement.',
 3963:'The current label identifies the Slack signing secret field.',
 3964:'The current instructions preserve both the source location (Slack app Basic Information) and secret storage behavior.',
 3965:'The current message communicates that saving Slack notification settings failed.',
 3966:'The current message communicates successful saving of Slack notification settings.',
 3967:'The current message communicates failure to send the Slack test notification.',
 3968:'The current message communicates the in-progress state while a Slack test notification is being sent.',
 3969:'The current message communicates that the Slack test notification was sent successfully.',
 3970:'The current validation message requires at least one mapping between a Slack user and a SeerrNG user.',
 3971:'The current prompt asks for the Slack signing secret from the Slack app.',
 3972:'The current validation message requires selecting at least one notification type.',
 3973:'The current validation message requires a valid URL.',
 3974:'The current prompt asks for a valid Slack workspace ID.',
 3975:'The current value labels the field for the Slack incoming Webhook URL.',
 3976:'The current instructions ask the user to create an integration for an incoming Webhook; the link markup identifies the linked term.',
 3977:'The current value labels the Slack workspace ID field.',
 3978:'The current value explains that this is the ID of the workspace that owns the Slack app.',
}

JAPANESE_NUMERIC = {
 (3962,'ja'): ('The two 1 tokens express “one entry per line”; the minimum count and mapping format are unchanged.', ['1','1']),
 (3970,'ja'): ('1件以上 expresses “at least one mapping” with the same minimum.', ['1']),
 (3972,'ja'): ('1つ以上 expresses “at least one notification type” with the same minimum.', ['1']),
}

HOLD_POS = 3979
HOLD_REASON = 'Caller context shows an Enable Agent checkbox on the Web Push settings form but does not define what Agent means; keep this locale hash-only until the product term is defined.'


def sha(data: bytes | str) -> str:
    if isinstance(data,str): data=data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()

def j(path: pathlib.Path): return json.loads(path.read_text(encoding='utf-8'))
def jl(path: pathlib.Path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def tokens(text: str):
    protected=re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])',text)
    return {'placeholders':re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',text),'markupTags':re.findall(r'</?[A-Za-z][^>]*>',text),'numericTokens':re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',text),'protectedLiterals':list(dict.fromkeys(protected))}
def writej(name,obj): (ROOT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def writejl(name,rows): (ROOT/name).write_text(''.join(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for row in rows),encoding='utf-8')
def verify_input_checksums():
    expected={}
    for line in (CF/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        digest,name=line.split('  ',1); expected[name]=digest
    actual={p.name for p in CF.iterdir() if p.is_file() and p.name not in {'SHA256SUMS.txt','manifest.json'}}
    if set(expected)!=(actual|{'manifest.json'}): raise SystemExit('candidate-free checksum inventory mismatch')
    for name,digest in expected.items():
        if sha((CF/name).read_bytes())!=digest: raise SystemExit('candidate-free checksum mismatch: '+name)


def main():
    verify_input_checksums()
    cfman=j(CF/'manifest.json')
    if (cfman.get('window'),cfman.get('head'),cfman.get('tree'),cfman.get('range'),cfman.get('candidateFreeInputOnly'),cfman.get('proposalCount'),cfman.get('dispositionFieldsIncluded')) != (WINDOW,HEAD,TREE,[3960,3979],True,0,False):
        raise SystemExit('candidate-free input pin/type mismatch')
    head=subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()
    tree=subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD^{tree}'],text=True).strip()
    status=subprocess.check_output(['git','-C',str(SOURCE),'status','--porcelain=v1'],text=True)
    if (head,tree,status)!=(HEAD,TREE,''): raise SystemExit('source worktree pin/cleanliness mismatch')
    sources={r['position']:r for r in jl(CF/'selected-source-cells.jsonl')}
    contexts={r['sourceId']:r for r in jl(CF/'caller-contexts.jsonl')}
    cells={(r['position'],r['locale']):r for r in jl(CF/'current-target-cells.jsonl')}
    if (len(sources),len(contexts),len(cells))!=(20,20,240): raise SystemExit('candidate-free coverage mismatch')
    if set(PROPOSALS.keys()) & {(p,l) for p in [HOLD_POS] for l in LOCALES}: raise SystemExit('held cell also proposed')
    if any(p not in range(3960,3980) or loc not in LOCALES for p,loc in PROPOSALS): raise SystemExit('proposal outside window')
    if set(PROPOSALS)!={(3962,'ar'),(3974,'ar'),(3975,'ar'),(3975,'zh-Hant'),(3976,'de'),(3976,'hi'),(3977,'ar'),(3978,'ar')}: raise SystemExit('proposal inventory changed')
    proposals=[]; holds=[]; ledger=[]; dispositions=collections.Counter(); locale_counts={l:collections.Counter() for l in LOCALES}
    for position in range(3960,3980):
        source=sources[position]
        caller=contexts[source['sourceId']]
        for locale in LOCALES:
            key=(position,locale); cell=cells[key]
            common={'position':position,'locale':locale,'sourceIdSha256':source['sourceIdSha256'],'sourceTextSha256':source['sourceTextSha256'],'currentTargetSha256':cell['currentTargetSha256'],'callerContextSha256':cell['callerContextSha256']}
            if position==HOLD_POS:
                hold={**common,'primaryDisposition':'HOLD','holdCode':'TERMINOLOGY_CONTEXT_UNRESOLVED','holdReasonSha256':sha(HOLD_REASON),'confidence':'low','hashOnly':True,'relatedPriorWindow':'W3940-W3959'}
                allowed={'position','locale','sourceIdSha256','sourceTextSha256','currentTargetSha256','callerContextSha256','primaryDisposition','holdCode','holdReasonSha256','confidence','hashOnly','relatedPriorWindow'}
                if set(hold)!=allowed or 'currentTarget' in hold or 'sourceText' in hold: raise SystemExit('hold row is not hash-only')
                holds.append(hold); ledger.append(hold); dispositions['HOLD']+=1; locale_counts[locale]['HOLD']+=1
                continue
            current=cell['currentTarget']; rationale=POSITION_RATIONALES[position]
            row={**common,'sourceId':source['sourceId'],'sourceText':source['sourceText'],'currentTarget':current,'primaryDisposition':'ACCEPT_CURRENT','rationale':f"{rationale} The existing {locale} translation conveys that meaning and fits the caller context.",'confidence':'moderate','currentTokenChecks':cell['tokenChecks']}
            if key in JAPANESE_NUMERIC:
                meaning,expected_tokens=JAPANESE_NUMERIC[key]
                if cell['targetTokens']['numericTokens']!=expected_tokens or cell['sourceTokens']['numericTokens']!=[]: raise SystemExit(f'Japanese numeric token attestation differs at {key}')
                row['numericTokenAssessment']={'sourceNumericTokens':[],'currentNumericTokens':expected_tokens,'meaningPreserved':True,'explanation':meaning}
            if key in PROPOSALS:
                kind,target,confidence,proposal_rationale=PROPOSALS[key]
                src_t=tokens(source['sourceText']); tgt_t=tokens(target)
                checks={field:src_t[field]==tgt_t[field] for field in ('placeholders','markupTags','numericTokens','protectedLiterals')}
                if not all(checks.values()): raise SystemExit(f'proposal token integrity mismatch {key}: {checks}')
                row.update({'primaryDisposition':kind,'rationale':proposal_rationale,'confidence':confidence,'proposedTarget':target,'proposedTargetSha256':sha(target),'proposalTokenChecks':checks})
                proposals.append(row)
            else:
                # All unexplained baseline mismatches are refused; only the three reviewed Japanese numeral equivalents remain.
                mismatch=[field for field,result in cell['tokenChecks'].items() if not result['matches']]
                if mismatch and key not in JAPANESE_NUMERIC: raise SystemExit(f'unresolved baseline token mismatch {key}: {mismatch}')
                if key not in JAPANESE_NUMERIC and any(not value['matches'] for value in cell['tokenChecks'].values()): raise SystemExit(f'unreviewed token mismatch {key}')
            ledger.append(row); dispositions[row['primaryDisposition']]+=1; locale_counts[locale][row['primaryDisposition']]+=1
    if len(ledger)!=240 or len(proposals)!=8 or len(holds)!=12: raise SystemExit('primary counts mismatch')
    if dict(dispositions)!={'ACCEPT_CURRENT':220,'CORRECTION':6,'HOLD':12,'REFINEMENT':2}: raise SystemExit('primary disposition totals mismatch: '+repr(dict(dispositions)))
    writejl('primary-ledger.jsonl',ledger); writejl('selected-proposals.jsonl',proposals); writejl('hash-only-holds.jsonl',holds)
    cfhash=sha((CF/'manifest.json').read_bytes()); cfsum=sha((CF/'SHA256SUMS.txt').read_bytes())
    numeric_baseline=j(CF/'baseline-token-diagnostics.json')
    summary={'window':WINDOW,'head':HEAD,'tree':TREE,'cells':240,'sourceIds':20,'localeCount':12,'callerReferences':cfman['callerReferenceCount'],'priorSelectedSourceIds':cfman['priorSelectedSourceIdCount'],'priorAppliedTargetHashes':cfman['priorAppliedTargetHashCount'],'priorHashOnlyHolds':cfman['priorHoldCount'],'dispositionCounts':dict(dispositions),'proposalCount':len(proposals),'currentHashOnlyHolds':len(holds),'localeDispositionCounts':{loc:dict(locale_counts[loc]) for loc in LOCALES},'baselineTokenMismatchCounts':numeric_baseline,'acceptedJapaneseNumericEquivalents':[f'{p}::{l}' for p,l in JAPANESE_NUMERIC],'blindPacketInspected':False,'blindPacketGenerated':False,'crossReviewPerformed':False,'nativeSpeakerApproval':False,'browserAcceptance':False,'PRorCatalogEdits':False,'testsBuildsScansCI':False,'reviewMode':'primary semantic review only'}
    writej('primary-summary.json',summary)
    (ROOT/'README.md').write_text(
        f'# SeerrNG PR #418 {WINDOW} primary review\n\n'
        f'This primary-only semantic review uses the sealed candidate-free packet at exact head `{HEAD}` / tree `{TREE}`. It covers 20 source IDs × 12 locales (240 cells) with caller context.\n\n'
        f'Decisions: {dispositions["ACCEPT_CURRENT"]} accepted current values, {dispositions["CORRECTION"]} corrections, {dispositions["REFINEMENT"]} refinements, and {dispositions["HOLD"]} hash-only holds. The 12 holds are the `Enable Agent` cells at position 3979; the caller context does not define the product meaning of Agent.\n\n'
        'The Japanese uses of 1 in the “one per line” and “at least one” messages are recorded as meaning-preserving equivalents. Proposed targets preserve placeholders, markup, numbers, and protected literals. No blind output was inspected or generated; no cross-review or application plan was produced.\n\n'
        'This machine-assisted review does not claim native-speaker approval or browser acceptance. No repository/PR files were changed; no tests, builds, scans, or CI were run.\n\n'
        'Verify with `python3 verify-primary.py --candidate-free ../candidate-free-input --source-worktree /mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source`. Checksums are in `SHA256SUMS.txt`.\n',encoding='utf-8')
    file_names=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in {'manifest.json','SHA256SUMS.txt'})
    manifest={'artifact':f'SeerrNG PR #418 {WINDOW} primary review','schemaVersion':1,'status':'SEALED','reviewCompleted':True,'reviewMode':'primary semantic review only','blindPacketInspected':False,'blindPacketGenerated':False,'crossReviewPerformed':False,'repository':'snapetech-org/seerrng','pullRequest':418,'window':WINDOW,'head':HEAD,'tree':TREE,'sourceWorktree':str(SOURCE),'sourceWorktreeCleanAtHead':True,'candidateFreeInputPath':str(CF),'candidateFreeInputOnly':True,'candidateFreeManifestSha256':cfhash,'candidateFreeChecksumManifestSha256':cfsum,'cells':240,'sourceIds':20,'localeCount':12,'callerReferences':cfman['callerReferenceCount'],'priorSelectedSourceIds':cfman['priorSelectedSourceIdCount'],'priorAppliedTargetHashes':cfman['priorAppliedTargetHashCount'],'priorHashOnlyHolds':cfman['priorHoldCount'],'primaryDispositionCounts':dict(dispositions),'proposalCount':len(proposals),'currentHashOnlyHolds':len(holds),'primarySummarySha256':sha((ROOT/'primary-summary.json').read_bytes()),'primaryLedgerSha256':sha((ROOT/'primary-ledger.jsonl').read_bytes()),'selectedProposalsSha256':sha((ROOT/'selected-proposals.jsonl').read_bytes()),'hashOnlyHoldsSha256':sha((ROOT/'hash-only-holds.jsonl').read_bytes()),'nativeSpeakerApproval':False,'browserAcceptance':False,'PRorCatalogEdits':False,'testsBuildsScansCI':False,'fileNames':file_names}
    writej('manifest.json',manifest)
    sums=[]
    for path in sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'):
        sums.append(f'{sha((ROOT/path).read_bytes())}  {path}\n')
    (ROOT/'SHA256SUMS.txt').write_text(''.join(sums),encoding='utf-8')
    print(json.dumps({'result':'SEALED-PRIMARY-REVIEW','window':WINDOW,'head':HEAD,'tree':TREE,'cells':len(ledger),'dispositionCounts':dict(dispositions),'proposals':len(proposals),'hashOnlyHolds':len(holds),'priorSelected':cfman['priorSelectedSourceIdCount'],'priorAppliedTargets':cfman['priorAppliedTargetHashCount'],'priorHolds':cfman['priorHoldCount'],'blindPacketInspected':False,'packetFiles':len(sums)},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
