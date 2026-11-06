#!/usr/bin/env python3
"""Candidate-free primary semantic review for W3340-W3359."""
import collections, hashlib, json, re
from pathlib import Path
TASK=Path(__file__).resolve().parents[1]
INPUT=TASK/'clean-input'; OUT=Path(__file__).resolve().parent
EXPECTED_HEAD='266d8fff4beb56eab17c9de0f6560c619577e3de'
EXPECTED_TREE='5da8f5e38b95b4287821b603c4686fe866b83760'
POSITIONS=list(range(3340,3360))
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
# Each value: (verdict, target, rationale). Prepared from the clean input only.
OVERRIDES={
 ('components.Requests.incomplete','ja'):('correction','未完了','This is a standalone request status/filter label. 不完全な is a prenominal な form that expects a following noun; 未完了 is the natural standalone “incomplete/not completed” status.'),
 ('components.Requests.last14Days','ko'):('refinement','지난 14일','This is a past-date filter. 마지막 14 일 is awkward for a recent interval and separates the numeral from 일; 지난 14일 is idiomatic and preserves the time range.'),
 ('components.Requests.last30Days','ko'):('refinement','지난 30일','This is a past-date filter. 마지막 30 일 is awkward for a recent interval and separates the numeral from 일; 지난 30일 is idiomatic and preserves the time range.'),
 ('components.Requests.last6Months','ar'):('correction','آخر 6 أشهر','Preserve the source numeric token 6 exactly. The current Arabic spells it out; the revised “last six months” phrase retains the same meaning and exact digit.'),
 ('components.Requests.last7Days','ko'):('refinement','지난 7일','This is a past-date filter. 마지막 7 일 is awkward for a recent interval and separates the numeral from 일; 지난 7일 is idiomatic and preserves the time range.'),
 ('components.Requests.library','es'):('correction','Añadiendo a la biblioteca','The direct caller uses this as an in-progress request status. The current infinitive Añadir reads as an instruction; the gerund expresses that the item is being added.'),
 ('components.Requests.library','de'):('refinement','Wird zur Bibliothek hinzugefügt','The direct caller uses this as an in-progress request status. The current action noun is understandable, while the passive progressive makes the ongoing state explicit.'),
 ('components.Requests.library','hi'):('refinement','लाइब्रेरी में जोड़ा जा रहा है','The direct caller uses this as an in-progress request status. The current infinitive is less explicit about ongoing processing; this states that the item is being added.'),
 ('components.Requests.library','ja'):('correction','ライブラリに追加中','The direct caller uses this as an in-progress request status. The current label names the add-to-library action but does not mark it as ongoing; 追加中 does.'),
 ('components.Requests.library','vi'):('correction','Đang thêm vào thư viện','The direct caller uses this as an in-progress request status. The current bare verb can read as an instruction; Đang marks the ongoing action.'),
}
HOLD_IDS={'components.Requests.manageRequests'}
HOLD_REASON='No exact production reference to this components.Requests message ID is pinned. Definition, route, and namespace-contract context do not establish that this field is rendered. Retain every locale value and hold semantic approval until a direct caller is present.'
SOURCE_REASONS={
 'components.Requests.genres':'The caller displays this label beside a request’s genre metadata; current terms identify that category across locales.',
 'components.Requests.hd':'The caller uses this as the non-4K movie/TV resolution label. Preserve the exact technical token HD.',
 'components.Requests.history':'The caller uses this for the request history control and history section heading.',
 'components.Requests.importing':'The caller uses this as an in-progress import status/filter label.',
 'components.Requests.incomplete':'The caller uses this as a request status/filter label; the current translations convey an incomplete state.',
 'components.Requests.issues':'The caller selects this field for magazine/comic issue metadata; the targets name an issue/number in context.',
 'components.Requests.last14Days':'The caller uses this as a request date-range option for the previous 14 days; the translation preserves the duration.',
 'components.Requests.last30Days':'The caller uses this as a request date-range option for the previous 30 days; the translation preserves the duration.',
 'components.Requests.last6Months':'The caller uses this as a request date-range option for the previous six months; the translation preserves the duration.',
 'components.Requests.last7Days':'The caller uses this as a request date-range option for the previous seven days; the translation preserves the duration.',
 'components.Requests.latestIssue':'The caller selects this for magazine metadata; the translation identifies the latest issue.',
 'components.Requests.library':'The caller uses this as an in-progress request status; the translation conveys adding to the library.',
 'components.Requests.loadError':'The caller displays this as a request-status load error heading.',
 'components.Requests.loadErrorHint':'The caller displays this detail under the load-error heading and directs the user to retry.',
 'components.Requests.loading':'The caller displays this while request status is loading.',
 'components.Requests.loadingTitle':'The caller uses this while a request title is loading; locale punctuation may vary while preserving the loading state.',
 'components.Requests.magazine':'The caller uses this as a media-type label for magazine requests.',
 'components.Requests.magazines':'The caller uses this as the plural media-filter category for magazines.',
 'components.Requests.mediaAndFormat':'The caller uses this as a detail-section heading for the media type and format.',
}
def sha(s): return hashlib.sha256(s.encode('utf8') if isinstance(s,str) else s).hexdigest()
def require(c,m):
    if not c: raise SystemExit('ABORT: '+m)
def read_jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf8').splitlines() if x]
def write_jsonl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf8')
def numeric(s): return sorted(re.findall(r'\d+(?:[.,]\d+)?(?:[A-Za-z]+)?',s))
def markup(s): return sorted(re.findall(r'</?[A-Za-z][^>]*>',s))
def placeholders(s): return sorted(re.findall(r'\{[A-Za-z_][A-Za-z0-9_]*\}',s))
def main():
    require(not (OUT/'primary-review.jsonl').exists(),'preserve existing primary review output')
    window=json.loads((INPUT/'window.json').read_text(encoding='utf8'))
    boundary=json.loads((INPUT/'source-boundaries.json').read_text(encoding='utf8'))
    require(window['head']==EXPECTED_HEAD and window['tree']==EXPECTED_TREE,'input head/tree drift')
    require(window['range']==[3340,3359] and window['previousRange']==[3320,3339],'input range/boundary drift')
    require(boundary['head']==EXPECTED_HEAD and boundary['tree']==EXPECTED_TREE,'boundary pin drift')
    require(boundary['before']['position']==3339 and boundary['before']['id']=='components.Requests.fourK','before-boundary mismatch')
    require(boundary['first']['position']==3340 and boundary['first']['id']=='components.Requests.genres','first-boundary mismatch')
    require(boundary['last']['position']==3359 and boundary['last']['id']=='components.Requests.mediaAndFormat','last-boundary mismatch')
    require(boundary['after']['position']==3360 and boundary['after']['id']=='components.Requests.mediaFilters','after-boundary mismatch')
    cells=read_jsonl(INPUT/'review-input.jsonl'); ctx=read_jsonl(INPUT/'caller-contexts.jsonl')
    require(len(cells)==240 and len({(r['position'],r['id'],r['locale']) for r in cells})==240,'input cell count or uniqueness mismatch')
    require(sorted({r['position'] for r in cells})==POSITIONS,'position set mismatch')
    require(window['localeOrder']==LOCALES,'locale order mismatch')
    holds={r['id'] for r in boundary['callerHolds'] if r.get('directMessageReferences')==0 or r.get('reason','').startswith('no direct production reference')}
    require(holds==HOLD_IDS,'caller hold IDs changed')
    ctx_ids={r['id'] for r in ctx}
    for r in cells:
        require(sha(r['source'])==r['sourceSha256'],'source hash mismatch')
        require(sha(r['currentTarget'])==r['currentTargetSha256'],'current target hash mismatch')
        require(r['placeholderParity'],'input placeholder parity failure')
        require(sorted(placeholders(r['source']))==sorted(r['sourcePlaceholders']),'source placeholder manifest mismatch')
        require(sorted(placeholders(r['currentTarget']))==sorted(r['currentPlaceholders']),'target placeholder manifest mismatch')
        require(r['id'] in ctx_ids,'missing caller context row')
        if r['id'] in HOLD_IDS:
            require(r['callerExists'] is False and r['directMessageReferences']==0,'held key has direct caller')
        else:
            require(r['callerExists'] and r['directMessageReferences']>0,'eligible key lacks direct caller')
    dispositions=collections.Counter(); changes_locale=collections.Counter(); result=[]
    for r in sorted(cells,key=lambda x:(x['position'],LOCALES.index(x['locale']))):
        sid,loc=r['id'],r['locale']
        if sid in HOLD_IDS:
            verdict,target,rationale='hold-context',r['currentTarget'],HOLD_REASON
        elif (sid,loc) in OVERRIDES:
            verdict,target,rationale=OVERRIDES[(sid,loc)]
        else:
            require(sid in SOURCE_REASONS,'no source-level rationale for '+sid)
            verdict,target,rationale='accept-current',r['currentTarget'],SOURCE_REASONS[sid]
        require(verdict in {'accept-current','correction','refinement','hold-context'},'invalid verdict')
        require(verdict not in {'accept-current','hold-context'} or target==r['currentTarget'],'unchanged verdict changed target')
        require(verdict not in {'correction','refinement'} or target!=r['currentTarget'],'change verdict did not change target')
        sp=placeholders(r['source']); tp=placeholders(target)
        sm=markup(r['source']); tm=markup(target)
        sn=numeric(r['source']); tn=numeric(target)
        literals=r['sourceProtectedLiterals']; preserved=all(x in target for x in literals)
        require(sp==tp,f'placeholder mismatch {sid}/{loc}')
        require(sm==tm,f'markup mismatch {sid}/{loc}')
        require(sn==tn,f'numeric-token mismatch {sid}/{loc}')
        require(preserved,f'protected source literal missing {sid}/{loc}')
        manual_protected=['HD'] if sid=='components.Requests.hd' else []
        require(all(x in r['source'] and x in target for x in manual_protected),'review protected token changed')
        rtl=''
        if loc=='ar':
            if manual_protected: rtl='RTL: preserve the Latin technical token HD exactly and check bidi isolation/visual order.'
            elif sn: rtl='RTL: preserve Western numeric tokens exactly and check their visual order with Arabic text in the rendered UI.'
            else: rtl='RTL: Arabic text is right-to-left; check punctuation and phrase order in the rendered UI.'
        punct=''
        if sid=='components.Requests.loadingTitle': punct='Source ends with a Unicode ellipsis; current localized ellipses use locale-specific … or three-dot forms, all retained.'
        dispositions[verdict]+=1
        if verdict in {'correction','refinement'}: changes_locale[loc]+=1
        result.append({
          'position':r['position'],'id':sid,'locale':loc,'source':r['source'],'sourceSha256':r['sourceSha256'],
          'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetSha256'],
          'verdict':verdict,'target':target,'targetSha256':sha(target),'rationale':rationale,
          'catalogPath':r['catalogPath'],'catalogFileSha256':r['catalogFileSha256'],'catalogGitBlob':r['catalogGitBlob'],
          'currentCatalogTranslationHash':r['currentCatalogTranslationHash'],
          'callerContextResolved':r['callerContextResolved'],'callerExists':r['callerExists'],'directMessageReferences':r['directMessageReferences'],
          'callerContextHashes':r['callerContextHashes'],
          'sourcePlaceholders':sp,'targetPlaceholders':tp,'placeholderParity':sp==tp,
          'sourceMarkupTags':sm,'targetMarkupTags':tm,'markupParity':sm==tm,
          'sourceNumericTokens':sn,'targetNumericTokens':tn,'numericTokensPreserved':sn==tn,
          'sourceProtectedLiterals':literals,'targetProtectedLiteralsPreserved':preserved,
          'reviewProtectedTerms':manual_protected,'rtlSensitiveNotes':rtl,'punctuationNotes':punct,
          'reviewMethod':'candidate-free primary semantic review','qualifiedNativeSpeakerApproval':False,
        })
    require(len(result)==240,'primary review row count mismatch')
    require(dispositions=={'accept-current':218,'correction':5,'refinement':5,'hold-context':12},f'unexpected dispositions {dict(dispositions)}')
    require(sum(changes_locale.values())==10,'unexpected change count')
    require(all(not result[i]['qualifiedNativeSpeakerApproval'] for i in range(len(result))),'native-speaker flag mismatch')
    summary={
      'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3340-W3359',
      'exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE,
      'inputManifestSha256':sha((INPUT/'SHA256SUMS.txt').read_bytes()),
      'sourceCount':20,'localeCount':12,'cellCount':240,'callerContextRows':len(ctx),
      'callerHoldIds':sorted(HOLD_IDS),'callerHoldCells':dispositions['hold-context'],
      'dispositions':dict(sorted(dispositions.items())),'changesByLocale':dict(sorted(changes_locale.items())),
      'changedCells':dispositions['correction']+dispositions['refinement'],
      'placeholderMismatches':sum(not x['placeholderParity'] for x in result),
      'markupMismatches':sum(not x['markupParity'] for x in result),
      'numericTokenMismatches':sum(not x['numericTokensPreserved'] for x in result),
      'protectedLiteralMismatches':sum(not x['targetProtectedLiteralsPreserved'] for x in result),
      'reviewProtectedTermMismatches':0,'allTargetHashesPinned':all(x['targetSha256']==sha(x['target']) for x in result),
      'orderedCatalogKeySequencesMatch':window['orderedLocaleKeySequencesMatch'],
      'catalogKeyCount':9494,'catalogCountIncludingEnglish':13,
      'nativeSpeakerApproval':False,'headedBrowserAcceptance':False,
      'reviewScope':'machine-assisted candidate-free primary semantic review; not qualified native-speaker approval'
    }
    write_jsonl(OUT/'primary-review.jsonl',result)
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'README.md').write_text(f'''# SeerrNG PR #418 W3340–W3359 candidate-free primary review\n\nReviewed 20 source IDs × 12 locales = 240 cells at exact PR head {EXPECTED_HEAD}, tree {EXPECTED_TREE}. The prior W3320–W3339 source queue and W3339/W3340 boundary were reattested at this live head. Boundary: W3339 `{boundary['before']['id']}`; W3340 `{boundary['first']['id']}`; W3359 `{boundary['last']['id']}`; W3360 `{boundary['after']['id']}`.\n\nDispositions: {dispositions['accept-current']} accept-current, {dispositions['correction']} corrections, {dispositions['refinement']} refinements, and {dispositions['hold-context']} caller-context holds. The hold covers `components.Requests.manageRequests` across all 12 locales because no exact direct caller is pinned.\n\nThe 10 proposed value changes cover the Japanese incomplete status, three Korean date-range labels, Arabic last-six-months numeric-token parity, and in-progress “Adding to Library” wording for Spanish, German, Hindi, Japanese, and Vietnamese. All target placeholders, markup tags, numeric tokens, protected source literals, and target hashes validate. The technical token `HD` is additionally treated as protected.\n\nThis is a machine-assisted primary review, not qualified native-speaker approval. No repo/PR changes, tests, builds, scans, CI, or headed-browser acceptance were performed.\n''',encoding='utf8')
    # Include this generator in the subdirectory manifest so the primary review is reproducible/auditable.
    files=sorted(x for x in OUT.iterdir() if x.is_file() and x.name!='SHA256SUMS.txt')
    (OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(x.read_bytes())}  {x.name}\n' for x in files),encoding='utf8')
    for line in (OUT/'SHA256SUMS.txt').read_text().splitlines():
        h,n=line.split('  ',1); require(sha((OUT/n).read_bytes())==h,'primary output checksum mismatch '+n)
    print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
