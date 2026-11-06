#!/usr/bin/env python3
"""Blind semantic review of SeerrNG PR #418 W3380-W3399 candidate-free input."""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
import hashlib, json, pathlib, re, subprocess

TASK=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3380-3399-independent-blind-20261103')
INPUT=TASK/'candidate-free-input'
OUT=TASK/'blind-review'
EXPECTED_HEAD='4d7de2c41b0e6df6cd0b7f7075c9cddd1c6ce160'
EXPECTED_TREE='6fba2d5985869b4563955b2c338a93e82efb4b22'
EXPECTED_BRANCH='codex/seerrng-localization-overhaul-20261028'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
HOLD_POSITIONS={3385,3387,3388,3390,3391,3394,3395,3396,3397,3398}
PROPOSALS={
 (3380,'id'):('correction','Percobaan ulang berikutnya: {time}.','moderate','“Percobaan berikutnya” means the next attempt but omits that it is a retry. “Percobaan ulang berikutnya” preserves the retry meaning and time placeholder.'),
 (3382,'es'):('correction','ChaptarrNG está preparando {format}.','moderate','“Esto {format}” uses a neuter demonstrative before a variable noun. Removing the demonstrative keeps the sentence grammatical regardless of the supplied format label.'),
 (3382,'pt_BR'):('refinement','ChaptarrNG está preparando {format}.','moderate','“Este {format}” assumes a masculine placeholder value. The neutral construction keeps agreement correct for either masculine or feminine media labels while preserving the preparation status.'),
 (3382,'fr'):('correction','ChaptarrNG prépare {format}.','moderate','“L’{format}” assumes the variable begins with a vowel. Removing the elided article avoids a likely agreement/elision error for a dynamic format label.'),
 (3382,'ar'):('correction','يجري إعداد {format} بواسطة ChaptarrNG.','low','The current verb “يستعد” means the brand is getting ready, rather than preparing the format, and transliterates the protected brand literal. The passive proposal restores the preparation meaning and exact “ChaptarrNG” literal.'),
 (3382,'id'):('correction','ChaptarrNG sedang mempersiapkan {format} ini.','moderate','The current “ini {format}” places the Indonesian demonstrative before its noun. Moving “ini” after the placeholder gives the natural “this {format}” order.'),
 (3392,'hi'):('correction','इस आइटम को इसकी लाइब्रेरी सेवा से हटाया नहीं जा सका।','moderate','The current wording is a fragment ending in “असमर्थ” and uses the less clear “मद” for a UI item. The passive sentence clearly reports that deletion from the library service failed.'),
 (3392,'ar'):('correction','تعذّر حذف هذا العنصر من خدمة المكتبة.','moderate','The current “مكتبته” says “his/its library” and omits the library-service wording. “تعذّر حذف...” is a natural error message and retains the service meaning.'),
 (3393,'hi'):('refinement','आइटम को उसकी लाइब्रेरी सेवा से हटा दिया गया।','moderate','“मद” is an awkward, formal rendering of a user-facing item. “आइटम” is clearer UI wording; the successful removal meaning is unchanged.'),
 (3399,'de'):('correction','Lebenszyklus der Anfrage','moderate','“Anfrageverlauf” means request history. “Lebenszyklus der Anfrage” preserves the lifecycle meaning of the accessible label.'),
}

def read_json(path): return json.loads(path.read_text(encoding='utf-8'))
def raw_jsonl(path):
    raw=path.read_bytes()
    lines=[x for x in raw.splitlines() if x.strip()]
    return raw,[json.loads(x) for x in lines],lines
def sha(raw:bytes)->str:return hashlib.sha256(raw).hexdigest()
def canonical(value)->bytes:return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def string_sha(value:str)->str:return sha(value.encode('utf-8'))
def placeholders(value:str)->list[str]:return sorted(set(re.findall(r'\{([^{}]+)\}',value)))
def tags(value:str)->list[str]:return sorted(re.findall(r'</?[^>]+>',value))
def main():
    assert OUT.exists()
    # The only read inputs are files beneath candidate-free-input/.
    checks={}
    for line in (INPUT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        expected,name=line.split(None,1); name=name.strip()
        assert '/' not in name and name not in ('','.')
        actual=sha((INPUT/name).read_bytes()); assert actual==expected,(name,expected,actual)
        checks[name]=actual
    attestation=read_json(INPUT/'PR-attestation.json')
    window=read_json(INPUT/'window.json')
    assert attestation['repository']=='snapetech-org/seerrng' and attestation['pullRequest']==418
    assert attestation['headRefOid']==EXPECTED_HEAD and attestation['headRefName']==EXPECTED_BRANCH
    assert attestation['tree']==EXPECTED_TREE and attestation['state']=='OPEN' and attestation['draft'] is True
    assert window['head']==EXPECTED_HEAD and window['tree']==EXPECTED_TREE and window['headRef']==EXPECTED_BRANCH
    assert window['cellCount']==240 and window['contextRows']==20
    assert window['localeCatalogPins'] and len(window['localeCatalogPins'])==13
    live=json.loads(subprocess.check_output(['gh','pr','view','418','-R','snapetech-org/SeerrNG','--json','number,state,isDraft,headRefName,headRefOid,baseRefName'],text=True))
    assert live['number']==418 and live['state']=='OPEN' and live['isDraft'] is True
    assert live['headRefName']==EXPECTED_BRANCH and live['headRefOid']==EXPECTED_HEAD and live['baseRefName']=='main'
    remote=subprocess.check_output(['git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{EXPECTED_BRANCH}"],text=True).split()
    assert remote and remote[0]==EXPECTED_HEAD

    input_raw,inputs,input_lines=raw_jsonl(INPUT/'review-input.jsonl')
    context_raw,context_rows,context_lines=raw_jsonl(INPUT/'caller-contexts.jsonl')
    assert len(inputs)==240 and len(context_rows)==20
    assert len(input_lines)==240 and len(context_lines)==20
    assert len({(r['sourceId'],r['locale']) for r in inputs})==240
    assert [r['locale'] for r in inputs[:12]]==LOCALES
    assert set(r['position'] for r in inputs)==set(range(3380,3400))
    assert {r['position'] for r in context_rows}==set(range(3380,3400))
    context_by_position={r['position']:(r,sha(raw)) for r,raw in zip(context_rows,context_lines)}
    row_by_key={(r['position'],r['locale']):r for r in inputs}
    assert len(row_by_key)==240
    counts=Counter(); proposal_counts=Counter(); ledger=[]; failed=[]
    for row in inputs:
        pos=row['position']; locale=row['locale']; key=(pos,locale)
        assert row['liveHead']==EXPECTED_HEAD and row['liveTree']==EXPECTED_TREE
        assert row['pullRequest']==418 and row['repository']=='snapetech-org/seerrng'
        assert row['window']=='W3380-W3399' and row['reviewDecision'] is None and row['proposedTarget'] is None
        assert string_sha(row['source'])==row['sourceSha256']
        assert string_sha(row['currentTarget'])==row['currentTargetSha256']
        assert placeholders(row['source'])==sorted(row['sourcePlaceholders'])
        assert placeholders(row['currentTarget'])==sorted(row['currentPlaceholders'])
        assert row['placeholderParity'] and row['markupParity']
        assert tags(row['source'])==sorted(row['sourceMarkupTags'])
        assert tags(row['currentTarget'])==sorted(row['currentMarkupTags'])
        ctx,ctxsha=context_by_position[pos]
        assert ctx['sourceId']==row['sourceId']
        assert ctx['directMessagePropertyReferenceCount']==row['directMessagePropertyReferenceCount']
        decision='hold' if pos in HOLD_POSITIONS else 'accept-current'
        proposal=None; confidence='unknown'; rationale=''
        if pos in HOLD_POSITIONS:
            resolution=row['callerContextResolution']
            if resolution=='definition-only-or-shared-under-other-namespace':
                rationale=('Hold unchanged: the pinned caller packet records only a definition or shared text under a different namespace, with no direct components.Requests reference. The semantic string is understandable, but this input does not establish that this catalog cell is selected by the active caller.')
            else:
                rationale=('Hold unchanged: the pinned caller evidence resolves the copy through the separate components.RequestStatus namespace, not this components.Requests catalog key. Do not treat a parallel namespace reference as proof that this target is rendered.')
        elif key in PROPOSALS:
            decision,proposal,confidence,rationale=PROPOSALS[key]
        else:
            confidence='moderate'
            reasons={
             3380:'The target expresses the next retry time and preserves {time}.',
             3381:'The target preserves the numbered import attempt and states that retries continue automatically.',
             3382:'The target says ChaptarrNG is preparing the supplied format and preserves {format}; no material change is needed for this locale.',
             3383:'The target is a concise in-progress status for Processing, used through the pinned request-status key map.',
             3384:'The target communicates completion progress and preserves {percent} with the percent unit.',
             3386:'The target is the appropriate publisher label for a metadata field.',
             3389:'The target is the standard release-date field label.',
             3392:'The target clearly reports that the item could not be deleted from its library service.',
             3393:'The target clearly reports successful deletion of the item from its library service.',
             3399:'The target communicates the lifecycle or stages of a request in the pinned accessible-label caller.'
            }
            rationale=reasons[pos]
        selected=proposal if proposal is not None else row['currentTarget']
        final_placeholders=placeholders(selected)
        final_tags=tags(selected)
        protected=sorted(row['sourceProtectedLiterals'])
        protected_preserved=all(literal in selected for literal in protected)
        placeholder_ok=final_placeholders==sorted(row['sourcePlaceholders'])
        markup_ok=final_tags==sorted(row['sourceMarkupTags'])
        if not (placeholder_ok and markup_ok and protected_preserved):
            failed.append({'position':pos,'locale':locale,'placeholderParity':placeholder_ok,'markupParity':markup_ok,'protectedLiteralParity':protected_preserved})
        assert placeholder_ok and markup_ok and protected_preserved,(pos,locale)
        candidate_sha=string_sha(proposal) if proposal is not None else None
        if proposal is not None:
            counts['proposed']+=1; proposal_counts[decision]+=1
        counts[decision]+=1
        contexts=[]
        for c in ctx['contexts']:
            contexts.append({k:c.get(k) for k in ('path','line','lineSha256','lineText','role','messageNamespace','note')})
        ledger.append({
          'schemaVersion':1,'window':'W3380-W3399','position':pos,'sourceId':row['sourceId'],
          'locale':locale,'localeTag':row['localeTag'],'targetCatalog':row['targetCatalog'],
          'source':row['source'],'sourceSha256':row['sourceSha256'],
          'currentTarget':row['currentTarget'],'currentTargetSha256':row['currentTargetSha256'],
          'decision':decision,'candidateTarget':proposal,'candidateTargetSha256':candidate_sha,
          'selectedTarget':selected,'selectedTargetSha256':string_sha(selected),
          'rationale':rationale,'confidence':confidence,
          'callerContext':{'resolution':row['callerContextResolution'],'directMessagePropertyReferenceCount':row['directMessagePropertyReferenceCount'],'contextRowSha256':ctxsha,'contexts':contexts},
          'integrityChecks':{'sourceHashVerified':True,'currentTargetHashVerified':True,'sourcePlaceholderParity':True,'selectedPlaceholderParity':placeholder_ok,'sourceMarkupParity':markup_ok,'protectedLiteralsRequired':protected,'protectedLiteralsPreserved':protected_preserved,'inputProtectedLiteralParity':row['sourceProtectedLiteralsPreserved']},
          'nativeSpeakerApproved':False
        })
    assert counts=={'hold':120,'accept-current':110,'correction':8,'refinement':2,'proposed':10},counts
    assert len(failed)==0
    # Seal result files. Primary proposal files were not read or used.
    ledger_path=OUT/'blind-ledger.jsonl'
    ledger_path.write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in ledger),encoding='utf-8')
    summary={
      'artifact':'SeerrNG PR #418 independent blind semantic review W3380-W3399',
      'repository':'snapetech-org/seerrng','pullRequest':418,'branch':EXPECTED_BRANCH,
      'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'window':[3380,3399],
      'inputPacketPath':'../candidate-free-input/','inputChecksumsVerified':len(checks),
      'inputReviewSha256':sha(input_raw),'callerContextsSha256':sha(context_raw),
      'reviewedCells':len(ledger),'decisionCounts':{'accept-current':counts['accept-current'],'correction':counts['correction'],'refinement':counts['refinement'],'hold':counts['hold']},
      'proposals':proposal_counts,'placeholderMarkupProtectedFailures':0,
      'contextHolds':{'cells':120,'sourcePositions':sorted(HOLD_POSITIONS)},
      'primaryOutputInspected':False,'primaryProposalsCreated':False,
      'nativeSpeakerApproval':False,'testsBuildsCiOrRepositoryPrEdits':False,
      'confidenceLimit':'Machine semantic review; locale fluency judgments remain unverified by native speakers. Hold cells have unresolved exact-key caller selection in the pinned context packet.'
    }
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    pr_meta={k:live[k] for k in ('number','state','isDraft','headRefName','headRefOid','baseRefName')}
    input_attestation={
      'inputDirectory':'../candidate-free-input/','inputFileChecksums':checks,
      'inputManifestSha256':sha((INPUT/'SHA256SUMS.txt').read_bytes()),
      'reviewInputSha256':sha(input_raw),'callerContextsSha256':sha(context_raw),
      'livePr':pr_meta,'remoteBranchHead':remote[0],
      'pinnedHead':EXPECTED_HEAD,'pinnedTree':EXPECTED_TREE,
      'verifiedAtUTC':datetime.now(timezone.utc).isoformat(),
      'reviewBoundary':'Only candidate-free-input files, GitHub PR metadata, and the remote branch ref were read. No repository contents, PR body, or other review outputs were opened.'
    }
    (OUT/'input-attestation.json').write_text(json.dumps(input_attestation,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    readme='''# SeerrNG PR #418 blind review — W3380–W3399\n\nThis independent ledger reviews 240 existing translation cells for positions 3380–3399 against the sealed candidate-free packet and its pinned caller context. The PR head and remote branch were verified as `4d7de2c41b0e6df6cd0b7f7075c9cddd1c6ce160`, tree `6fba2d5985869b4563955b2c338a93e82efb4b22`.\n\nThe review records 110 accept-current, 8 correction proposals, 2 refinement proposals, and 120 holds. Holds cover positions 3385, 3387, 3388, 3390, 3391, 3394–3398 where the pinned input does not establish that the `components.Requests` target is selected by the caller; the action labels and tooltips at 3390–3391 and 3394–3397 are tied to a parallel `components.RequestStatus` namespace. These current values are retained pending exact-key caller evidence.\n\nEvery source/current-target hash, placeholder set, markup set, and selected protected literal was checked. The existing Arabic 3382 target transliterates the protected brand and uses a verb meaning “gets ready”; the proposal restores the source meaning and exact brand literal. All changes are proposals in this blind review only; no repository or PR was edited.\n\nThis is machine review, not native-speaker approval. Complex or locale-specific phrasing, especially Arabic, Hindi, Korean, Vietnamese, and Chinese, remains subject to native-speaker review. No tests, builds, CI, workflow changes, merge, release, or tag were performed.\n'''
    (OUT/'README.md').write_text(readme,encoding='utf-8')
    # Manifest checks all outputs except itself and SHA256SUMS.txt.
    output_files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt'))
    manifest={'artifact':'SeerrNG PR #418 blind review W3380-W3399','sealed':True,'repository':'snapetech-org/seerrng','pullRequest':418,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'reviewedCells':240,'decisionCounts':summary['decisionCounts'],'files':[{'name':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in output_files]}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    output_files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt'))
    (OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in output_files),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
