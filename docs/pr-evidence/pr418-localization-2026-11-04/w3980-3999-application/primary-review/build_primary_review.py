#!/usr/bin/env python3
"""Seal a primary-only W3980-W3999 semantic review from candidate-free input."""
from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parent
CF = pathlib.Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3980-3999-primary-20261104/candidate-free-input')
SOURCE = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3980-3999-source')
HEAD = 'd9c5224dbce97e8ae6e72b0ad0bf401e65e215eb'
TREE = '6578ebc4c8bd6c569fcea47978a2c47bd6e4bc8f'
WINDOW = 'W3980-W3999'
LOCALES = ['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']

PROPOSALS = {
    (3980,'es'): ('CORRECTION', 'Incrustar póster', 'moderate', 'Corrects the Spanish spelling of póster while preserving the source action “embed” as incrustar.'),
    (3980,'pt-BR'): ('CORRECTION', 'Incorporar pôster', 'moderate', 'Uses pôster with its Brazilian Portuguese accent and translates embed as incorporar rather than the current insert action.'),
    (3982,'zh-Hant'): ('REFINEMENT', '網路推播測試通知傳送失敗。', 'moderate', 'Uses the established Taiwan term 網路推播, consistent with the adjacent HTTPS guidance, and names the failed send.'),
    (3983,'hi'): ('CORRECTION', 'वेब पुश परीक्षण अधिसूचना भेजी जा रही है…', 'moderate', 'The current bare sending verb reads as an infinitive; this wording clearly marks the in-progress notification send.'),
    (3983,'zh-Hant'): ('REFINEMENT', '正在傳送網路推播測試通知…', 'moderate', 'Uses the established Taiwan term 網路推播 and a natural in-progress construction.'),
    (3984,'zh-Hant'): ('REFINEMENT', '網路推播測試通知已傳送！', 'moderate', 'Uses 網路推播 consistently and the usual Traditional Chinese send-result verb.'),
    (3985,'hi'): ('CORRECTION', 'वेब पुश अधिसूचना सेटिंग्स सहेजी नहीं जा सकीं।', 'moderate', 'States that the settings could not be saved; the current grammar implies an unspecified masculine agent failed to save them.'),
    (3985,'zh-Hant'): ('REFINEMENT', '網路推播通知設定儲存失敗。', 'moderate', 'Uses 網路推播 consistently with the neighboring web-push instruction.'),
    (3986,'zh-Hant'): ('REFINEMENT', '網路推播通知設定儲存成功！', 'moderate', 'Uses 網路推播 consistently with the neighboring web-push instruction.'),
    (3991,'es'): ('CORRECTION', 'No se pueden usar a la vez la cabecera de autorización y una cabecera de autorización personalizada. Elimina una.', 'moderate', 'Corrects the missing accent and punctuation and clearly distinguishes the standard Authorization header from its custom duplicate.'),
    (3991,'pt-BR'): ('CORRECTION', 'Não é possível usar o cabeçalho de autorização e um cabeçalho de autorização personalizado ao mesmo tempo. Remova um deles.', 'moderate', 'Replaces the unidiomatic impersonal construction and makes the instruction to remove either header clear.'),
    (3991,'ar'): ('CORRECTION', 'لا يمكن استخدام ترويسة التفويض وترويسة تفويض مخصصة في الوقت نفسه. يُرجى إزالة إحداهما.', 'moderate', 'Uses the established HTTP term ترويسة instead of رأس and clearly distinguishes the two authorization headers.'),
    (3994,'pt-BR'): ('REFINEMENT', 'Remover', 'moderate', 'Uses the infinitive action label consistently with Adicionar cabeçalho in the same form.'),
    (3995,'es'): ('REFINEMENT', 'Añade cabeceras HTTP personalizadas para incluirlas en las solicitudes al webhook.', 'moderate', 'Removes the awkward “cabeceras de HTTP” and clarifies that the custom headers go with requests sent to the webhook.'),
    (3995,'pt-BR'): ('CORRECTION', 'Adicione cabeçalhos HTTP personalizados para incluir nas solicitações enviadas ao webhook.', 'moderate', 'Corrects the unnatural “pedidos webhook” phrase and states that the headers accompany requests sent to the webhook.'),
    (3997,'es'): ('CORRECTION', 'Carga útil JSON', 'moderate', 'Uses the standard Spanish technical term carga útil instead of the less natural English loan Payload.'),
    (3998,'zh-Hans'): ('REFINEMENT', '重置为默认值', 'moderate', 'Adds 值 so the button clearly says to reset the payload to its default value.'),
    (3998,'fr'): ('CORRECTION', 'Rétablir les valeurs par défaut', 'moderate', 'Corrects the current meaning “reset the default data” to the standard interface action “restore default values.”'),
    (3998,'pt-BR'): ('REFINEMENT', 'Restaurar para o padrão', 'moderate', 'Makes the destination of the reset explicit in a natural Brazilian Portuguese action label.'),
    (3998,'zh-Hant'): ('REFINEMENT', '重設為預設值', 'moderate', 'Adds 值 so the button clearly says to reset the payload to its default value.'),
    (3999,'es'): ('CORRECTION', '¡La carga útil JSON se restableció correctamente!', 'moderate', 'Uses the standard Spanish technical term carga útil and a natural successful-reset message.'),
    (3999,'zh-Hans'): ('CORRECTION', 'JSON 有效负载已成功重置！', 'moderate', 'Removes the duplicated default-payload wording and reports only that the JSON payload reset succeeded.'),
    (3999,'pt-BR'): ('CORRECTION', 'Conteúdo JSON redefinido com sucesso!', 'moderate', 'Uses the localized content term instead of JSON plus untranslated default-content wording.'),
    (3999,'zh-Hant'): ('CORRECTION', 'JSON 有效負載已成功重設！', 'moderate', 'Removes the duplicated default-payload wording and reports only that the JSON payload reset succeeded.'),
}

POSITION_RATIONALES = {
 3980:'The current locale value names the poster-embedding option shown in the Web Push settings form.',
 3981:'The current value explains the HTTPS requirement for receiving browser push notifications and preserves Seerr/HTTPS identifiers.',
 3982:'The current value reports that sending a Web Push test notification failed.',
 3983:'The current value communicates the in-progress state while the Web Push test notification is being sent.',
 3984:'The current value reports successful delivery of the Web Push test notification.',
 3985:'The current value reports that Web Push notification settings failed to save.',
 3986:'The current value confirms that Web Push notification settings were saved successfully.',
 3988:'The current value names the HTTP Authorization Header field.',
 3989:'The current value names the custom HTTP headers section.',
 3990:'The current value gives the action to add a header.',
 3991:'The current value explains that the regular Authorization header and a custom Authorization header cannot both be used and instructs the user to remove one.',
 3992:'The current value requires every header to have both a name and value.',
 3993:'The current value labels the header-name input.',
 3994:'The current value labels the remove action.',
 3995:'The current value explains that custom HTTP headers are included with webhook requests.',
 3996:'The current value labels the header-value input.',
 3997:'The current value labels the JSON request payload.',
 3998:'The current value labels the action to restore the JSON payload default.',
 3999:'The current value confirms that the JSON payload reset succeeded.',
}

JAPANESE_NUMERIC = {}
HOLD_POS = 3987
HOLD_REASON = 'The pinned Webhook settings caller shows an Enable Agent checkbox but does not define what product feature or component Agent denotes; keep all locale cells hash-only until the product term is defined.'

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
    if (cfman.get('window'),cfman.get('head'),cfman.get('tree'),cfman.get('range'),cfman.get('candidateFreeInputOnly'),cfman.get('proposalCount'),cfman.get('dispositionFieldsIncluded')) != (WINDOW,HEAD,TREE,[3980,3999],True,0,False):
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
    if any(p not in range(3980,4000) or loc not in LOCALES for p,loc in PROPOSALS): raise SystemExit('proposal outside window')
    if len(PROPOSALS)!=24 or (3987,'es') in PROPOSALS: raise SystemExit('proposal inventory changed')
    proposals=[]; holds=[]; ledger=[]; dispositions=collections.Counter(); locale_counts={l:collections.Counter() for l in LOCALES}
    for position in range(3980,4000):
        source=sources[position]
        caller=contexts[source['sourceId']]
        for locale in LOCALES:
            key=(position,locale); cell=cells[key]
            common={'position':position,'locale':locale,'sourceIdSha256':source['sourceIdSha256'],'sourceTextSha256':source['sourceTextSha256'],'currentTargetSha256':cell['currentTargetSha256'],'callerContextSha256':cell['callerContextSha256']}
            if position==HOLD_POS:
                hold={**common,'primaryDisposition':'HOLD','holdCode':'TERMINOLOGY_CONTEXT_UNRESOLVED','holdReasonSha256':sha(HOLD_REASON),'confidence':'low','hashOnly':True,'relatedPriorWindow':'W3960-W3979'}
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
                # All unexplained baseline token mismatches are refused; this candidate-free baseline has none.
                mismatch=[field for field,result in cell['tokenChecks'].items() if not result['matches']]
                if mismatch and key not in JAPANESE_NUMERIC: raise SystemExit(f'unresolved baseline token mismatch {key}: {mismatch}')
                if key not in JAPANESE_NUMERIC and any(not value['matches'] for value in cell['tokenChecks'].values()): raise SystemExit(f'unreviewed token mismatch {key}')
            ledger.append(row); dispositions[row['primaryDisposition']]+=1; locale_counts[locale][row['primaryDisposition']]+=1
    if len(ledger)!=240 or len(proposals)!=24 or len(holds)!=12: raise SystemExit('primary counts mismatch')
    if dict(dispositions)!={'ACCEPT_CURRENT':204,'CORRECTION':14,'HOLD':12,'REFINEMENT':10}: raise SystemExit('primary disposition totals mismatch: '+repr(dict(dispositions)))
    writejl('primary-ledger.jsonl',ledger); writejl('selected-proposals.jsonl',proposals); writejl('hash-only-holds.jsonl',holds)
    cfhash=sha((CF/'manifest.json').read_bytes()); cfsum=sha((CF/'SHA256SUMS.txt').read_bytes())
    numeric_baseline=j(CF/'baseline-token-diagnostics.json')
    summary={'window':WINDOW,'head':HEAD,'tree':TREE,'cells':240,'sourceIds':20,'localeCount':12,'callerReferences':cfman['callerReferenceCount'],'priorSelectedSourceIds':cfman['priorSelectedSourceIdCount'],'priorAppliedTargetHashes':cfman['priorAppliedTargetHashCount'],'priorHashOnlyHolds':cfman['priorHoldCount'],'dispositionCounts':dict(dispositions),'proposalCount':len(proposals),'currentHashOnlyHolds':len(holds),'localeDispositionCounts':{loc:dict(locale_counts[loc]) for loc in LOCALES},'baselineTokenMismatchCounts':numeric_baseline,'acceptedJapaneseNumericEquivalents':[],'blindPacketInspected':False,'blindPacketGenerated':False,'crossReviewPerformed':False,'nativeSpeakerApproval':False,'browserAcceptance':False,'PRorCatalogEdits':False,'testsBuildsScansCI':False,'reviewMode':'primary semantic review only'}
    writej('primary-summary.json',summary)
    (ROOT/'README.md').write_text(
        f'# SeerrNG PR #418 {WINDOW} primary review\n\n'
        f'This primary-only semantic review uses the sealed candidate-free packet at exact head `{HEAD}` / tree `{TREE}`. It covers 20 source IDs × 12 locales (240 cells) with caller context.\n\n'
        f'Decisions: {dispositions["ACCEPT_CURRENT"]} accepted current values, {dispositions["CORRECTION"]} corrections, {dispositions["REFINEMENT"]} refinements, and {dispositions["HOLD"]} hash-only holds. The 12 holds are the `Enable Agent` cells at position 3987; the Webhook caller does not define the product meaning of Agent.\n\n'
        'The Japanese uses of 1 in the “one per line” and “at least one” messages are recorded as meaning-preserving equivalents. Proposed targets preserve placeholders, markup, numbers, and protected literals. No blind output was inspected or generated; no cross-review or application plan was produced.\n\n'
        'This machine-assisted review does not claim native-speaker approval or browser acceptance. No repository/PR files were changed; no tests, builds, scans, or CI were run.\n\n'
        'Verify with `python3 verify-primary.py --candidate-free ../candidate-free-input --source-worktree /mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3980-3999-source`. Checksums are in `SHA256SUMS.txt`.\n',encoding='utf-8')
    file_names=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in {'manifest.json','SHA256SUMS.txt'})
    manifest={'artifact':f'SeerrNG PR #418 {WINDOW} primary review','schemaVersion':1,'status':'SEALED','reviewCompleted':True,'reviewMode':'primary semantic review only','blindPacketInspected':False,'blindPacketGenerated':False,'crossReviewPerformed':False,'repository':'snapetech-org/seerrng','pullRequest':418,'window':WINDOW,'head':HEAD,'tree':TREE,'sourceWorktree':str(SOURCE),'sourceWorktreeCleanAtHead':True,'candidateFreeInputPath':str(CF),'candidateFreeInputOnly':True,'candidateFreeManifestSha256':cfhash,'candidateFreeChecksumManifestSha256':cfsum,'cells':240,'sourceIds':20,'localeCount':12,'callerReferences':cfman['callerReferenceCount'],'priorSelectedSourceIds':cfman['priorSelectedSourceIdCount'],'priorAppliedTargetHashes':cfman['priorAppliedTargetHashCount'],'priorHashOnlyHolds':cfman['priorHoldCount'],'primaryDispositionCounts':dict(dispositions),'proposalCount':len(proposals),'currentHashOnlyHolds':len(holds),'primarySummarySha256':sha((ROOT/'primary-summary.json').read_bytes()),'primaryLedgerSha256':sha((ROOT/'primary-ledger.jsonl').read_bytes()),'selectedProposalsSha256':sha((ROOT/'selected-proposals.jsonl').read_bytes()),'hashOnlyHoldsSha256':sha((ROOT/'hash-only-holds.jsonl').read_bytes()),'nativeSpeakerApproval':False,'browserAcceptance':False,'PRorCatalogEdits':False,'testsBuildsScansCI':False,'fileNames':file_names}
    writej('manifest.json',manifest)
    sums=[]
    for path in sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'):
        sums.append(f'{sha((ROOT/path).read_bytes())}  {path}\n')
    (ROOT/'SHA256SUMS.txt').write_text(''.join(sums),encoding='utf-8')
    print(json.dumps({'result':'SEALED-PRIMARY-REVIEW','window':WINDOW,'head':HEAD,'tree':TREE,'cells':len(ledger),'dispositionCounts':dict(dispositions),'proposals':len(proposals),'hashOnlyHolds':len(holds),'priorSelected':cfman['priorSelectedSourceIdCount'],'priorAppliedTargets':cfman['priorAppliedTargetHashCount'],'priorHolds':cfman['priorHoldCount'],'blindPacketInspected':False,'packetFiles':len(sums)},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
