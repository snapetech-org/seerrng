#!/usr/bin/env python3
"""Verify the sealed W3980-W3999 cross-review using only the three sealed packets."""
import argparse
import collections
import hashlib
import json
import pathlib
import re

LOCALES = ['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']
HEAD = 'd9c5224dbce97e8ae6e72b0ad0bf401e65e215eb'
TREE = '6578ebc4c8bd6c569fcea47978a2c47bd6e4bc8f'
BASE = 'fa40534ccced75bde1125c14760514fcd5d7de4d'


def fail(message):
    raise SystemExit('FAIL: ' + message)

def need(condition, message):
    if not condition: fail(message)

def sha(data):
    if isinstance(data, str): data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()

def shat(value): return sha(value.encode('utf-8'))
def canon(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def j(path): return json.loads(path.read_text(encoding='utf-8'))
def jl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]

def tokens(value):
    protected = re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])', value)
    return {'placeholders':re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}', value),
            'markupTags':re.findall(r'</?[A-Za-z][^>]*>', value),
            'numericTokens':re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])', value),
            'protectedLiterals':list(dict.fromkeys(protected))}

def token_checks(source, target):
    result={}
    for name in ('placeholders','markupTags','numericTokens'):
        result[name]={'matches':source[name]==target[name],'source':source[name],'target':target[name]}
    missing=[x for x in source['protectedLiterals'] if x not in target['protectedLiterals']]
    result['protectedLiterals']={'matches':not missing,'source':source['protectedLiterals'],'target':target['protectedLiterals'],'missingFromTarget':missing}
    return result

def proposal_audit(source_text, proposed_text):
    source, target = tokens(source_text), tokens(proposed_text)
    checks = token_checks(source,target)
    return {'sourceTokens':source,'proposedTokens':target,
            'placeholdersMarkupAndNumericPreserved':all(checks[x]['matches'] for x in ('placeholders','markupTags','numericTokens')),
            'sourceProtectedLiteralsPreserved':checks['protectedLiterals']['matches'],'checks':checks}

def sums_for(directory):
    sums_path=directory/'SHA256SUMS.txt'
    entries={}
    for line in sums_path.read_text(encoding='utf-8').splitlines():
        digest,name=line.split('  ',1)
        need(name not in entries,'duplicate checksum '+name)
        entries[name]=digest
    actual={p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file() and p != sums_path}
    need(actual==set(entries),'checksum inventory '+str(directory))
    for name,digest in entries.items():
        need(sha((directory/name).read_bytes())==digest,'checksum '+str(directory/name))
    return entries

def packet_binding(directory, sums):
    return {'directoryName':directory.name,
            'checksumManifestSha256':sha((directory/'SHA256SUMS.txt').read_bytes()),
            'fileSha256':dict(sorted(sums.items()))}

def make_context_audit(contexts, blocks, sources):
    out=[]
    source_by_id={x['sourceId']:x for x in sources}
    block_by_id={x['contextId']:x for x in blocks}
    for c in contexts:
        src=source_by_id[c['sourceId']]
        need((c['sourceIdSha256'],c['sourceTextSha256'])==(src['sourceIdSha256'],src['sourceTextSha256']),'caller source binding')
        defs=[block_by_id[x] for x in c['contextBlockIds'] if block_by_id[x]['contextType']=='message-definition']
        need(len(defs)==1,'message-definition block count')
        definition=defs[0]
        material={'sourceId':c['sourceId'],'namespace':c['namespace'],'definition':definition,
                  'directMessageReferences':c['directMessageReferences'],'dynamicRendererReferences':c['dynamicRendererReferences']}
        need(c['callerContextSha256']==shat(canon(material)),'caller context composite hash '+c['sourceId'])
        direct=[]
        for r in c['directMessageReferences']:
            need(shat(r['text'])==r['lineSha256'],'direct caller line hash')
            need(block_by_id[r['contextBlockId']]['path']==r['path'],'direct caller block path')
            direct.append({'path':r['path'],'line':r['line'],'lineSha256':r['lineSha256'],'text':r['text']})
        dynamic=[]
        for r in c['dynamicRendererReferences']:
            need(shat(r['text'])==r['lineSha256'],'dynamic renderer line hash')
            dynamic.append({'path':r['path'],'line':r['line'],'lineSha256':r['lineSha256'],
                            'fileSha256':r.get('fileSha256'),'gitBlob':r.get('gitBlob'),'text':r['text']})
        out.append({'sourceId':c['sourceId'],'sourceIdSha256':c['sourceIdSha256'],'sourceTextSha256':c['sourceTextSha256'],
                    'namespace':c['namespace'],'sourceKey':c['sourceKey'],'callerContextSha256':c['callerContextSha256'],
                    'definition':{'path':definition['path'],'contextBlockId':definition['contextId'],
                                  'lines':[{'line':r['line'],'lineSha256':r['lineSha256'],'text':r['text']} for r in definition['lines']]},
                    'directMessageReferences':direct,'dynamicRendererReferences':dynamic})
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--candidate-free-input',required=True)
    ap.add_argument('--primary-review',required=True)
    ap.add_argument('--blind-review',required=True)
    ap.add_argument('--cross-review',default=str(pathlib.Path(__file__).resolve().parent))
    args=ap.parse_args()
    cf=pathlib.Path(args.candidate_free_input).resolve()
    primary=pathlib.Path(args.primary_review).resolve()
    blind=pathlib.Path(args.blind_review).resolve()
    out=pathlib.Path(args.cross_review).resolve()

    # Verify this artifact's own inventory and input bindings.
    out_manifest=j(out/'manifest.json')
    out_sums=sums_for(out)
    out_actual=set(out_sums)-{'manifest.json'}
    need(out_manifest.get('status')=='SEALED' and set(out_manifest.get('fileNames',[]))==out_actual,'cross-review output manifest')
    for name,digest in out_manifest.get('fileSha256',{}).items():
        need(sha((out/name).read_bytes())==digest,'cross-review file hash '+name)
    cross=j(out/'cross-review.json')
    ledger=jl(out/'decision-ledger.jsonl')
    bindings=j(out/'input-bindings.json')
    need(cross['decisionLedgerSha256']==sha((out/'decision-ledger.jsonl').read_bytes()),'decision ledger hash binding')
    need(cross['rationaleSha256']==sha((out/'rationale.md').read_bytes()),'rationale hash binding')
    need(cross['inputBindingsSha256']==sha((out/'input-bindings.json').read_bytes()),'input binding file hash')
    need(cross['cells']==ledger,'JSON/ledger cell equality')

    # Verify all three sealed packet inventories without repository or network access.
    cf_sums=sums_for(cf); p_sums=sums_for(primary); b_sums=sums_for(blind)
    cf_m=j(cf/'manifest.json'); p_m=j(primary/'manifest.json'); b_review=j(blind/'review.json')
    need(set(cf_m['fileNames'])==set(cf_sums)-{'manifest.json'},'candidate-free manifest file list')
    need(set(p_m['fileNames'])==set(p_sums)-{'manifest.json'},'primary manifest file list')
    need(cf_m['candidateFreeInputOnly'] is True and cf_m['proposalCount']==0 and cf_m['dispositionFieldsIncluded'] is False,'candidate-free packet type')
    need((cf_m['window'],cf_m['head'],cf_m['tree'],cf_m['baseSha'])==('W3980-W3999',HEAD,TREE,BASE),'candidate-free exact pin')
    need((p_m['head'],p_m['tree'])==(HEAD,TREE),'primary exact pin')
    need((b_review['window'],b_review['exactHead'],b_review['exactTree'],b_review['exactBaseSha'])==('W3980-W3999',HEAD,TREE,BASE),'blind exact pin')
    need(p_m['candidateFreeManifestSha256']==sha((cf/'manifest.json').read_bytes()),'primary candidate-free manifest binding')
    need(p_m['candidateFreeChecksumManifestSha256']==sha((cf/'SHA256SUMS.txt').read_bytes()),'primary candidate-free checksum binding')
    need(b_review['inputBinding']['manifestSha256']==sha((cf/'manifest.json').read_bytes()),'blind candidate-free manifest binding')
    need(b_review['inputBinding']['checksumManifestSha256']==sha((cf/'SHA256SUMS.txt').read_bytes()),'blind candidate-free checksum binding')
    blind_input=dict(cf_sums); blind_input['SHA256SUMS.txt']=sha((cf/'SHA256SUMS.txt').read_bytes())
    need(b_review['inputBinding']['fileSha256']==blind_input,'blind candidate-free file hashes')
    expected_bindings={
      'candidateFreeInput':{**packet_binding(cf,cf_sums),'manifestSha256':sha((cf/'manifest.json').read_bytes()),'checksumManifestSha256':sha((cf/'SHA256SUMS.txt').read_bytes()),'fileNames':cf_m['fileNames']},
      'primaryReview':{**packet_binding(primary,p_sums),'manifestSha256':sha((primary/'manifest.json').read_bytes()),'checksumManifestSha256':sha((primary/'SHA256SUMS.txt').read_bytes()),
                      'primaryLedgerSha256':sha((primary/'primary-ledger.jsonl').read_bytes()),'selectedProposalsSha256':sha((primary/'selected-proposals.jsonl').read_bytes()),
                      'hashOnlyHoldsSha256':sha((primary/'hash-only-holds.jsonl').read_bytes()),'summarySha256':sha((primary/'primary-summary.json').read_bytes())},
      'blindReview':{**packet_binding(blind,b_sums),'reviewSha256':sha((blind/'review.json').read_bytes()),'fileNames':['README.md','review.json','verify-blind-review.py']}}
    need(bindings==expected_bindings,'exact input checksum/binding inventory')
    need(cross['candidateFreeInputManifestSha256']==expected_bindings['candidateFreeInput']['manifestSha256'],'cross candidate-free manifest binding')
    need(cross['candidateFreeInputChecksumManifestSha256']==expected_bindings['candidateFreeInput']['checksumManifestSha256'],'cross candidate-free checksum binding')
    need(cross['primaryReviewManifestSha256']==expected_bindings['primaryReview']['manifestSha256'],'cross primary manifest binding')
    need(cross['primaryReviewChecksumManifestSha256']==expected_bindings['primaryReview']['checksumManifestSha256'],'cross primary checksum binding')
    need(cross['primaryReviewLedgerSha256']==expected_bindings['primaryReview']['primaryLedgerSha256'],'cross primary ledger binding')
    need(cross['blindReviewSha256']==expected_bindings['blindReview']['reviewSha256'],'cross blind review binding')
    need(cross['blindReviewChecksumManifestSha256']==expected_bindings['blindReview']['checksumManifestSha256'],'cross blind checksum binding')

    sources=jl(cf/'selected-source-cells.jsonl')
    cells=jl(cf/'current-target-cells.jsonl')
    contexts=jl(cf/'caller-contexts.jsonl')
    blocks=jl(cf/'caller-context-blocks.jsonl')
    p_rows=jl(primary/'primary-ledger.jsonl')
    b_rows=b_review['cells']
    source_by_pos={x['position']:x for x in sources}
    input_by_key={(x['position'],x['locale']):x for x in cells}
    p_by_key={(x['position'],x['locale']):x for x in p_rows}
    b_by_key={(x['position'],x['locale']):x for x in b_rows}
    context_by_source={x['sourceId']:x for x in contexts}
    expected_keys=[(p,l) for p in range(3980,4000) for l in LOCALES]
    need(len(source_by_pos)==20 and set(source_by_pos)==set(range(3980,4000)),'source range coverage')
    need(set(input_by_key)==set(expected_keys) and len(input_by_key)==240,'current cell set')
    need(set(p_by_key)==set(expected_keys) and len(p_by_key)==240,'primary cell set')
    need(set(b_by_key)==set(expected_keys) and len(b_by_key)==240,'blind cell set')
    need(len(context_by_source)==20,'caller context set')
    for pos,src in source_by_pos.items():
        need(shat(src['sourceId'])==src['sourceIdSha256'] and shat(src['sourceText'])==src['sourceTextSha256'],'source ID/text hash '+str(pos))
        need(tokens(src['sourceText'])==src['sourceTokens'],'source token binding '+str(pos))
    for key,cell in input_by_key.items():
        src=source_by_pos[key[0]]
        need((cell['sourceId'],cell['sourceIdSha256'],cell['sourceTextSha256'])==(src['sourceId'],src['sourceIdSha256'],src['sourceTextSha256']),'cell source binding '+str(key))
        need(shat(cell['currentTarget'])==cell['currentTargetSha256'],'current target hash '+str(key))
        need(cell['sourceTokens']==tokens(src['sourceText']) and cell['targetTokens']==tokens(cell['currentTarget']),'current token text binding '+str(key))
        need(cell['tokenChecks']==token_checks(tokens(src['sourceText']),tokens(cell['currentTarget'])),'current token-check binding '+str(key))
        need(all(v['matches'] for v in cell['tokenChecks'].values()),'current protected/token mismatch '+str(key))
    context_audit=make_context_audit(contexts,blocks,sources)
    need(cross['callerContextAudit']==context_audit,'caller context audit exact binding')
    need(cross['sourcePin']=={'head':HEAD,'tree':TREE,'baseSha':BASE,'headRef':cf_m['headRef'],'baseRef':cf_m['baseRef']},'cross source pin')

    def p_disp(row): return {'ACCEPT_CURRENT':'accept','CORRECTION':'correction','REFINEMENT':'refinement','HOLD':'hold'}[row['primaryDisposition']]
    need(len(ledger)==240,'cross decision ledger count')
    ledger_by_key={(x['position'],x['locale']):x for x in ledger}
    need(set(ledger_by_key)==set(expected_keys),'cross decision ledger set')
    cross_counts=collections.Counter(); p_counts=collections.Counter(); b_counts=collections.Counter()
    locale_counts={loc:collections.Counter() for loc in LOCALES}
    disagreement_count=dispo_mismatch=presence_mismatch=target_mismatch=both_proposed=0
    cross_p= cross_b=0
    disagreement_keys=[]
    cross_proposal_token_losses=0
    for key in expected_keys:
        pos,loc=key; src=source_by_pos[pos]; cell=input_by_key[key]; ctx=context_by_source[src['sourceId']]
        p=p_by_key[key]; b=b_by_key[key]; row=ledger_by_key[key]
        need((p['sourceIdSha256'],p['sourceTextSha256'],p['currentTargetSha256'],p['callerContextSha256'])==(src['sourceIdSha256'],src['sourceTextSha256'],cell['currentTargetSha256'],ctx['callerContextSha256']),'primary exact cell binding '+str(key))
        need((b['sourceId'],b['sourceIdSha256'],b['sourceText'],b['sourceTextSha256'],b['currentTargetText'],b['currentTargetSha256'],b['callerNamespace'])==(src['sourceId'],src['sourceIdSha256'],src['sourceText'],src['sourceTextSha256'],cell['currentTarget'],cell['currentTargetSha256'],ctx['namespace']),'blind exact source/current/caller namespace '+str(key))
        pcat, bcat=p_disp(p),b['disposition']
        pt=p.get('proposedTarget'); bt=b.get('proposedTargetText')
        pdiff=pcat!=bcat; presence=(pt is None)!=(bt is None); tdiff=pt is not None and bt is not None and pt!=bt
        need(row['primaryDisposition']==p['primaryDisposition'] and row['blindDisposition']==bcat,'cross reviewer disposition binding '+str(key))
        need(row['primaryProposalText']==pt and row['primaryProposalSha256']==p.get('proposedTargetSha256'),'primary proposal binding '+str(key))
        need(row['blindProposalText']==bt and row['blindProposalSha256']==b.get('proposedTargetSha256'),'blind proposal binding '+str(key))
        need(row['currentTargetSha256']==cell['currentTargetSha256'] and row['sourceIdSha256']==src['sourceIdSha256'] and row['sourceTextSha256']==src['sourceTextSha256'] and row['callerContextSha256']==ctx['callerContextSha256'],'cross input hash binding '+str(key))
        need(row['callerNamespace']==ctx['namespace'] and row['callerSourceKey']==ctx['sourceKey'],'cross caller namespace/key '+str(key))
        need(row['callerDirectReferenceBindings']==[{'path':r['path'],'line':r['line'],'lineSha256':r['lineSha256']} for r in ctx['directMessageReferences']],'cross caller reference binding '+str(key))
        need(row['reviewerDisagreement']=={'dispositionMismatch':pdiff,'proposalPresenceMismatch':presence,'proposedTextMismatch':tdiff,'anyReviewerDisagreement':pdiff or presence or tdiff},'reviewer disagreement flags '+str(key))
        if pcat=='hold':
            need(pos==3987 and row.get('hashOnly') is True and row.get('holdCode')=='TERMINOLOGY_CONTEXT_UNRESOLVED','hash-only cross hold '+str(key))
            need(not any(k in row for k in ('sourceId','sourceText','currentTarget')),'hash-only cross hold text '+str(key))
        else:
            need(row.get('sourceId')==src['sourceId'] and row.get('sourceText')==src['sourceText'] and row.get('currentTarget')==cell['currentTarget'],'cross visible current/source text '+str(key))
            need(row.get('sourceTokens')==tokens(src['sourceText']) and row.get('currentTargetTokens')==tokens(cell['currentTarget']),'cross visible token evidence '+str(key))
        if row.get('recommendedTarget') is not None:
            target=row['recommendedTarget']; audit=proposal_audit(src['sourceText'],target)
            need(shat(target)==row['recommendedTargetSha256'],'cross recommended target hash '+str(key))
            need(row.get('recommendedTokenAudit')==audit,'cross recommendation token audit '+str(key))
            if not audit['placeholdersMarkupAndNumericPreserved'] or not audit['sourceProtectedLiteralsPreserved']:
                cross_proposal_token_losses+=1
        else:
            need(row.get('recommendedTargetSha256') is None and 'recommendedTokenAudit' not in row,'unexpected target on accept/hold '+str(key))
        expected_evidence={}
        if pt is not None: expected_evidence['primary']={'targetText':pt,'targetSha256':p['proposedTargetSha256'],'tokenAudit':proposal_audit(src['sourceText'],pt)}
        if bt is not None: expected_evidence['blind']={'targetText':bt,'targetSha256':b['proposedTargetSha256'],'tokenAudit':proposal_audit(src['sourceText'],bt)}
        need(row['proposalEvidence']==expected_evidence,'proposal evidence/hash/token audit '+str(key))
        need(row['crossDisposition'] in {'accept','correction','refinement','hold'},'invalid cross disposition '+str(key))
        need(row['confidence'] in {'high','moderate','low'},'invalid cross confidence '+str(key))
        need(bool(row.get('rationale')),'missing cell rationale '+str(key))
        cross_counts[row['crossDisposition']]+=1; locale_counts[loc][row['crossDisposition']]+=1
        p_counts[pcat]+=1; b_counts[bcat]+=1
        dispo_mismatch+=pdiff; presence_mismatch+=presence; target_mismatch+=tdiff
        both_proposed += pt is not None and bt is not None
        if pdiff or presence or tdiff:
            disagreement_count+=1; disagreement_keys.append({'position':pos,'locale':loc})
        cross_p += row['crossDisposition'] != pcat
        cross_b += row['crossDisposition'] != bcat
    expected_counts={'crossDisposition':dict(cross_counts),'primaryDisposition':dict(p_counts),'blindDisposition':dict(b_counts),
      'cellsWithAnyPrimaryBlindDisagreement':disagreement_count,'primaryBlindDispositionMismatches':dispo_mismatch,
      'primaryBlindProposalPresenceMismatches':presence_mismatch,'bothReviewersProposedCells':both_proposed,
      'bothProposedDifferentText':target_mismatch,'primaryProposals':sum('proposedTarget' in x for x in p_rows),
      'blindProposals':sum('proposedTargetText' in x for x in b_rows),'crossVsPrimaryDispositionMismatches':cross_p,
      'crossVsBlindDispositionMismatches':cross_b,
      'recommendedChangeTargets':sum(x['recommendedTarget'] is not None for x in ledger),
      'recommendedTargetsMatchingOneOrBothReviewProposals':sum(x['recommendedTarget'] is not None and x['recommendedTarget'] in (x['primaryProposalText'],x['blindProposalText']) for x in ledger),
      'crossReviewTargetsNotMatchingEitherReviewProposal':sum(x['recommendedTarget'] is not None and x['recommendedTarget'] not in (x['primaryProposalText'],x['blindProposalText']) for x in ledger),
      'sourceProtectedLiteralMismatchesInInput':0,
      'sourceProtectedLiteralLossesInCrossProposals':cross_proposal_token_losses,
      'markupPlaceholderNumericMismatchesInInput':0,'markupPlaceholderNumericMismatchesInCrossProposals':cross_proposal_token_losses,
      'callerContextsAudited':len(contexts),'directCallerReferencesAudited':sum(len(x['directMessageReferences']) for x in contexts),
      'dynamicRendererReferencesAudited':sum(len(x['dynamicRendererReferences']) for x in contexts)}
    need(cross['counts']==expected_counts,'cross-review count summary')
    expected_locale={loc:dict(locale_counts[loc]) for loc in LOCALES}
    need(cross['localeDispositionCounts']==expected_locale,'locale count summary')
    need(cross['reviewerDisagreementCellKeys']==disagreement_keys,'reviewer disagreement index')
    need(cross['cellsReviewed']==240 and cross['sourceCount']==20 and cross['localeCount']==12,'cross coverage summary')
    exposure=cross['processExposure']
    need(exposure['repositoryOrWorktreeAccess']=='none' and exposure['prBodyAccess']=='none' and exposure['priorWindowReviewDecisionAccess']=='none' and exposure['externalSearch']=='none','process exposure scope')
    need(exposure['cellsSemanticallyReviewedBeforeProposalContent']==0 and exposure['primaryAndBlindProposalContentSeenBeforeFullCellSemanticAudit'] is True and exposure['candidateProposalVisibilityInfluencedTargetSelection'] is True,'proposal exposure sequence')
    need(exposure['recommendedChangeTargets']==44 and exposure['recommendedTargetsMatchingOneOrBothReviewProposals']==42 and exposure['crossReviewTargetsNotMatchingEitherReviewProposal']==2 and exposure['independentBlindReviewClaim'] is False,'proposal influence count/claim')
    need(exposure['browserReview'] is False and exposure['nativeSpeakerSignoff'] is False and exposure['applicationOrPrEdits']=='none' and exposure['sourceCatalogEdits']=='none','review limitations/edits')
    print(json.dumps({'result':'PASS','window':'W3980-W3999','head':HEAD,'tree':TREE,'cells':240,
      'crossDisposition':dict(cross_counts),'primaryDisposition':dict(p_counts),'blindDisposition':dict(b_counts),
      'primaryBlindDisagreements':disagreement_count,'candidateFreeFilesChecked':len(cf_sums),
      'primaryFilesChecked':len(p_sums),'blindFilesChecked':len(b_sums),'callerContextsAudited':len(contexts),
      'sourceWorktree':'NOT_ACCESSED','externalSearch':'NOT_ACCESSED'},ensure_ascii=False,sort_keys=True,indent=2))

if __name__=='__main__': main()
