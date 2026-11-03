#!/usr/bin/env python3
import collections, hashlib, json, re, subprocess
from pathlib import Path
TASK=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3360-3379-primary-20261103')
INPUT=TASK/'input-final'; OUT=TASK/'primary'
EXPECTED_HEAD='1586a249e3f86deb7b9410cff50223e5f76209ff'
EXPECTED_TREE='d620a906353e9724ba28986103c76b7792c56099'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
PROTECTED_TERMS=['Seerr','ChaptarrNG','Bindery','Bookshelf','Radarr','Sonarr','Plex','Emby','Jellyfin','TMDb','IMDb','Open Library','ComicVine','MusicBrainz','TheTVDB','Trakt','Letterboxd','Prowlarr','Bazarr','Lidarr','Readarr','Whisparr','Sportarr','Audiobookshelf']
OVERRIDES={
 ('components.Requests.noHistory','ar'):('correction','لم تُسجَّل أي تغيّرات على حالة الطلب حتى الآن.','The request-history empty state means no status changes have been recorded. The current phrase uses تاريخ الوضع, which reads as a position/state date rather than a record of status changes.'),
 ('components.Requests.noMediaResults','ja'):('correction','これらのフィルターに一致する映画、テレビ番組、音楽、書籍、コミック、雑誌、成人向けコンテンツのリクエストはありません。','The caller selects this complete media-category empty state when the All Media filter is active. The current Japanese omits adult requests and renders “show” as the ambiguous ショー; this restores the missing category and identifies TV shows.'),
 ('components.Requests.noReleaseFoundFilter','fr'):('correction','Aucune release trouvée','This label filters the unavailable/no-release-found request state across media types. Publication means a published text; the multimedia software domain uses the downloadable release term, commonly retained as release in French.'),
 ('components.Requests.noReleaseFoundFilter','id'):('refinement','Rilis tidak ditemukan','The current title-case wording is less natural for an Indonesian status/filter label. Sentence case keeps the same no-release-found meaning.'),
 ('components.Requests.noResults','zh_Hans'):('refinement','没有符合这些筛选条件的请求。','Use 筛选条件, consistent with the same page’s Media Filters label 媒体筛选条件; 过滤器 refers more readily to a filter device/component.'),
 ('components.Requests.noResults','ja'):('refinement','これらのフィルターに一致するリクエストはありません。','This is a complete empty-state sentence for a non-All-Media filter selection. The current wording uses a casual マッチしない construction and reads less naturally as UI copy.'),
 ('components.Requests.noResults','pt_BR'):('refinement','Nenhum pedido corresponde a esses filtros.','Corresponde expresses that no request matches the active filters more precisely than the colloquial combina.'),
 ('components.Requests.noResults','ar'):('correction','لا توجد طلبات تطابق عوامل التصفية هذه.','The current المرشحات can mean strainers. The same page already uses عوامل تصفية for filter controls; use the standard UI term for these active filters.'),
 ('components.Requests.noResults','id'):('refinement','Tidak ada permintaan yang cocok dengan filter yang dipilih.','Penyaring refers to a filtering device and Tak ada is colloquial. This formal empty-state sentence uses the loanword filter already used by the media-filter UI.'),
 ('components.Requests.notAvailable','pt_BR'):('refinement','Não disponível','This value is inserted as a metadata fallback in fields and labels; the trailing period is out of place for a short placeholder value.'),
 ('components.Requests.olderRequests','fr'):('refinement','{count, plural, =1 {# demande plus ancienne est hors de cette période.} one {# demande plus ancienne est hors de cette période.} many {# demandes plus anciennes sont hors de cette période.} other {# demandes plus anciennes sont hors de cette période.}}','This is an informational count for requests excluded by the selected time filter. Hors de cette période is idiomatic for a date range; à l’extérieur de cette fenêtre is a literal rendering.'),
 ('components.Requests.olderRequests','zh_Hans'):('refinement','{count, plural, =1 {# 个较早的请求不在此时间范围内。} other {# 个较早的请求不在此时间范围内。}}','The caller displays this only when olderCount is positive. Replace the stray space before the Chinese full stop and express the selected time range naturally; 个 supplies the count classifier.'),
 ('components.Requests.olderRequests','zh_Hant'):('refinement','{count, plural, =1 {# 個較早的請求不在此時間範圍內。} other {# 個較早的請求不在此時間範圍內。}}','The caller displays this only when olderCount is positive. Remove stray spaces before punctuation, use 請求 for a user-submitted request, and describe the selected time range rather than a visual window.'),
 ('components.Requests.pages','ar'):('correction','عدد الصفحات','The caller uses this as the numeric page-count metadata label for book requests. The current الصفحة means “the page” (singular), not the number of pages.'),
}
SOURCE_REASONS={
 'components.Requests.mediaFilters':'The caller renders this as the heading for the request media-filter controls; current values name media filtering in each locale.',
 'components.Requests.modifyFailed':'The caller shows this error toast when the request status update fails; current values preserve the inability to update the request.',
 'components.Requests.movie':'The caller uses this as the singular movie media-type label in a request status detail.',
 'components.Requests.movies':'The caller renders this as the movies category in the request media filter.',
 'components.Requests.music':'The caller renders this as the music category in the request media filter.',
 'components.Requests.musicFormat':'The caller uses this as the media-type badge label for music requests.',
 'components.Requests.network':'The caller uses this label for a TV network metadata row.',
 'components.Requests.noHistory':'The caller shows this in the request-history panel when there are no status records.',
 'components.Requests.noMediaResults':'The caller shows this complete empty-state message when All Media is selected and no requests match.',
 'components.Requests.noReleaseFoundFilter':'The caller uses this as the label for the unavailable request-status filter.',
 'components.Requests.noResults':'The caller shows this empty-state message when a specific media filter has no matching requests.',
 'components.Requests.notAvailable':'The caller inserts this fallback in metadata values when no value is available.',
 'components.Requests.olderRequests':'The caller shows this count message below the request list for a non-All-Time filter only when olderCount is positive.',
 'components.Requests.pages':'The caller uses this as the numeric page-count label for book requests.',
 'components.Requests.pcGames':'The caller renders this as the PC-games media filter category.',
 'components.Requests.pending':'The request status key map renders this label for the requested stage.',
 'components.Requests.pendingImportAttempt':'The caller shows import progress and supplies the current attempt and maximum-attempt placeholders.',
}
def sha(v): return hashlib.sha256(v.encode('utf8') if isinstance(v,str) else v).hexdigest()
def require(ok,msg):
    if not ok: raise SystemExit('ABORT: '+msg)
def read_jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf8').splitlines() if x]
def write_jsonl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf8')
def placeholders(s): return sorted(re.findall(r'\{([A-Za-z_][A-Za-z0-9_]*)\}',s))
def icu_plural(s):
    m=re.search(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,',s)
    if not m: return None
    # Branch labels and bodies in these pinned messages contain no nested ICU controls.
    tail=s[m.end():-1] if s.endswith('}') else s[m.end():]
    branches=[]; i=0
    while i<len(tail):
        while i<len(tail) and tail[i].isspace(): i+=1
        if i>=len(tail): break
        lm=re.match(r'(=\d+|zero|one|two|few|many|other)\s*\{',tail[i:])
        if not lm: raise ValueError('unparsed plural branch near '+repr(tail[i:i+60]))
        label=lm.group(1); i+=lm.end(); start=i; depth=1
        while i<len(tail) and depth:
            if tail[i]=='{': depth+=1
            elif tail[i]=='}': depth-=1
            i+=1
        if depth: raise ValueError('unterminated plural branch '+label)
        body=tail[start:i-1]
        branches.append({'label':label,'body':body,'hashCount':body.count('#')})
    require(bool(branches),'plural has no branches')
    return {'argument':m.group(1),'branches':branches,'labels':[b['label'] for b in branches]}
def markup(s): return sorted(re.findall(r'</?[A-Za-z][^>]*>',s))
def numeric(s): return sorted(re.findall(r'\d+(?:[.,]\d+)?(?:[A-Za-z]+)?',s))
def protected(s): return [t for t in PROTECTED_TERMS if re.search(r'(?<![\w])'+re.escape(t)+r'(?![\w])',s,re.I)]
def main():
    require(not (OUT/'primary-review.jsonl').exists(),'preserve existing primary output')
    subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=INPUT,stdout=subprocess.DEVNULL)
    win=json.loads((INPUT/'window.json').read_text(encoding='utf8'))
    bounds=json.loads((INPUT/'source-boundaries.json').read_text(encoding='utf8'))
    require(win['head']==EXPECTED_HEAD and win['tree']==EXPECTED_TREE,'input head/tree drift')
    require(win['range']==[3360,3379] and win['previousRange']==[3340,3359],'input boundary drift')
    require(bounds['head']==EXPECTED_HEAD and bounds['tree']==EXPECTED_TREE,'source boundary head drift')
    require(bounds['before']['position']==3359 and bounds['before']['id']=='components.Requests.mediaAndFormat','previous boundary mismatch')
    require(bounds['first']['position']==3360 and bounds['first']['id']=='components.Requests.mediaFilters','first boundary mismatch')
    require(bounds['last']['position']==3379 and bounds['last']['id']=='components.Requests.pendingImportAttempt','last boundary mismatch')
    require(bounds['after']['position']==3380 and bounds['after']['id']=='components.Requests.pendingImportNextRetry','after boundary mismatch')
    cells=read_jsonl(INPUT/'review-input.jsonl'); contexts=read_jsonl(INPUT/'caller-contexts.jsonl')
    require(len(cells)==240 and len({(r['position'],r['id'],r['locale']) for r in cells})==240,'input cell count or uniqueness mismatch')
    require(sorted({r['position'] for r in cells})==list(range(3360,3380)),'source position set mismatch')
    require(win['localeOrder']==LOCALES,'locale ordering drift')
    context_ids={r['id'] for r in contexts}
    require({r['id'] for r in cells if r['eligibility']=='hold-context'}=={'components.Requests.mediaType','components.Requests.mediaTypeValue','components.Requests.minutes'},'caller hold set drift')
    dispositions=collections.Counter(); changes_locale=collections.Counter(); by_id=collections.Counter(); result=[]; icu_failures=[]; ph_failures=[]; markup_failures=[]; numeric_failures=[]; protected_failures=[]
    for r in sorted(cells,key=lambda x:(x['position'],LOCALES.index(x['locale']))):
        sid,loc=r['id'],r['locale']; source=r['source']; current=r['currentTarget']
        require(sha(source)==r['sourceSha256'] and sha(current)==r['currentTargetSha256'],'source or target pin mismatch '+sid+'/'+loc)
        require(sid in context_ids and r['callerContextResolved'],'missing caller-context pin '+sid+'/'+loc)
        if r['eligibility']=='hold-context':
            verdict,target,rationale='hold-context',current,'No direct production reference to this message ID is pinned in the Requests production callers. Keep all locale values unchanged until a direct rendered caller is identified.'
        elif (sid,loc) in OVERRIDES:
            verdict,target,rationale=OVERRIDES[(sid,loc)]
        else:
            require(sid in SOURCE_REASONS,'missing primary rationale for '+sid)
            verdict,target,rationale='accept-current',current,SOURCE_REASONS[sid]
        require(verdict in {'accept-current','correction','refinement','hold-context'},'invalid disposition')
        require(verdict not in {'accept-current','hold-context'} or target==current,'unchanged disposition changed target')
        require(verdict not in {'correction','refinement'} or target!=current,'change disposition unchanged target')
        sp=placeholders(source); tp=placeholders(target); phok=sp==tp
        sm=markup(source); tm=markup(target); mok=sm==tm
        sn=numeric(source); tn=numeric(target); nok=sn==tn
        source_icu=icu_plural(source); target_icu=icu_plural(target)
        icuok=True
        if source_icu or target_icu:
            icuok=bool(source_icu and target_icu and source_icu['argument']==target_icu['argument'] and '# ' in source and all(b['hashCount']>=1 or b['label'] in {'zero','one','two','=0','=1','=2'} for b in target_icu['branches']) and 'other' in target_icu['labels'] and '=1' in target_icu['labels'])
            if source_icu and target_icu:
                icuok=icuok and all(b['label'] in {'=1','zero','one','two','few','many','other'} for b in target_icu['branches'])
            if not icuok: icu_failures.append({'id':sid,'locale':loc,'sourceIcu':source_icu,'targetIcu':target_icu})
        literals=r['sourceProtectedLiterals']; preserved=all(x in target for x in literals)
        if not phok: ph_failures.append({'id':sid,'locale':loc,'source':sp,'target':tp})
        if not mok: markup_failures.append({'id':sid,'locale':loc,'source':sm,'target':tm})
        if not nok: numeric_failures.append({'id':sid,'locale':loc,'source':sn,'target':tn})
        if not preserved: protected_failures.append({'id':sid,'locale':loc,'missing':[x for x in literals if x not in target]})
        require(phok and mok and nok and preserved and icuok,'integrity mismatch '+sid+'/'+loc)
        reviewer_notes=[]
        if sid=='components.Requests.olderRequests':
            reviewer_notes.append('ICU plural control argument count is retained. Every locale-specific branch keeps #; caller guard olderCount > 0 means zero is not rendered.')
            if loc in ('zh_Hans','zh_Hant','fr'): reviewer_notes.append('The proposed text preserves the locale plural branch labels and the exact count placeholder.')
        if loc=='ar' and sid in ('components.Requests.noHistory','components.Requests.pages'):
            reviewer_notes.append('Arabic RTL punctuation/order should be visually reviewed in the exact headed product preview.')
        if sid=='components.Requests.noMediaResults' and loc=='ja': reviewer_notes.append('Restores the adult-content request category present in the English source list.')
        dispositions[verdict]+=1; by_id[sid]+=1
        if verdict in ('correction','refinement'): changes_locale[loc]+=1
        result.append({'position':r['position'],'id':sid,'locale':loc,'source':source,'sourceSha256':r['sourceSha256'],'currentTarget':current,'currentTargetSha256':r['currentTargetSha256'],'verdict':verdict,'proposedTarget':target,'proposedTargetSha256':sha(target),'rationale':rationale,'catalogPath':r['catalogPath'],'catalogFileSha256':r['catalogFileSha256'],'catalogGitBlob':r['catalogGitBlob'],'currentCatalogTranslationHash':r['currentCatalogTranslationHash'],'callerExists':r['callerExists'],'directMessageReferences':r['directMessageReferences'],'callerContextHashes':r['callerContextHashes'],'sourcePlaceholders':sp,'targetPlaceholders':tp,'placeholderParity':phok,'sourceMarkupTags':sm,'targetMarkupTags':tm,'markupParity':mok,'sourceNumericTokens':sn,'targetNumericTokens':tn,'numericTokenParity':nok,'sourceIcuPlural':source_icu,'targetIcuPlural':target_icu,'icuStructureAndCountMarkersValid':icuok,'sourceProtectedLiterals':literals,'protectedLiteralsPreserved':preserved,'reviewNotes':reviewer_notes,'reviewMethod':'candidate-free primary semantic review','qualifiedNativeSpeakerApproval':False})
    require(len(result)==240,'primary output count mismatch')
    require(dispositions=={'accept-current':190,'correction':5,'refinement':9,'hold-context':36},'unexpected disposition counts '+str(dict(dispositions)))
    require(sum(changes_locale.values())==14,'unexpected proposed change count')
    summary={'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3360-W3379','exactHead':EXPECTED_HEAD,'exactTree':EXPECTED_TREE,'inputManifestSha256':sha((INPUT/'SHA256SUMS.txt').read_bytes()),'sourceCount':20,'localeCount':12,'cellCount':240,'callerContextRows':len(contexts),'callerHoldIds':['components.Requests.mediaType','components.Requests.mediaTypeValue','components.Requests.minutes'],'callerHoldCells':36,'dispositions':dict(sorted(dispositions.items())),'changesByLocale':dict(sorted(changes_locale.items())),'proposedChangeCount':14,'placeholderMismatches':len(ph_failures),'markupMismatches':len(markup_failures),'numericTokenMismatches':len(numeric_failures),'icuStructureMismatches':len(icu_failures),'protectedLiteralMismatches':len(protected_failures),'allTargetHashesPinned':all(x['proposedTargetSha256']==sha(x['proposedTarget']) for x in result),'catalogKeyCount':9494,'catalogCountIncludingEnglish':13,'orderedLocaleKeySequencesMatch':win['orderedLocaleKeySequencesMatch'],'orderedKeyHashGroupCount':len({x['orderedKeySha256'] for x in win['localeCatalogPins'].values()}),'nativeSpeakerApproval':False,'headedBrowserAcceptance':False,'repositoryOrPullRequestMutated':False,'testsBuildsScansCI':False,'workflowChanges':False,'mergeReleaseTag':False,'reviewScope':'machine-assisted candidate-free primary semantic review; not qualified native-speaker approval'}
    OUT.mkdir(parents=True,exist_ok=True)
    write_jsonl(OUT/'primary-review.jsonl',result)
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'README.md').write_text(f'''# SeerrNG PR #418 W3360–W3379 candidate-free primary review\n\nReviewed 20 source IDs × 12 locales = 240 cells at exact open/draft PR head {EXPECTED_HEAD}, tree {EXPECTED_TREE}. The preceding W3340–W3359 input manifest was verified; the full 9,494-ID source order and prior source texts were reattested. Boundary: W3359 `{bounds['before']['id']}`; W3360 `{bounds['first']['id']}`; W3379 `{bounds['last']['id']}`; W3380 `{bounds['after']['id']}`.\n\nDispositions: 190 accept-current, 5 corrections, 9 refinements, and 36 caller holds. The holds cover `components.Requests.mediaType`, `components.Requests.mediaTypeValue`, and `components.Requests.minutes` across all 12 locales; the pinned production files show definitions but no field-specific rendered caller. The `pending` field is eligible: the `requested` status maps directly to `pending`, then renders via the status-key lookup.\n\nThe 14 proposed changes cover the Arabic status-history and page-count terms; the Japanese all-media empty state; French and Indonesian “No Release Found”; empty-state filter wording in Simplified Chinese, Japanese, Brazilian Portuguese, Arabic, and Indonesian; Brazilian Portuguese placeholder punctuation; and French/Simplified Chinese/Traditional Chinese older-request plural phrasing. The ICU caller is guarded by `olderCount > 0`, so zero is never displayed; all target branches preserve `count` and `#`. Placeholder, markup, numeric-token, ICU-structure, protected-literal, caller, and current-target checks pass.\n\nThe 13 catalogs retain 9,494 keys and equal key sets. Their historical ordering remains split into two groups; this exact-head review pins each individual ordered-key hash.\n\nThis is machine-assisted primary review, not qualified native-speaker approval. No repo/catalog/PR changes, tests, builds, scans, CI, workflow edits, merges, releases, tags, or headed-browser acceptance were performed.\n''',encoding='utf8')
    files=sorted(p for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
    man=OUT/'SHA256SUMS.txt'; man.write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf8')
    subprocess.check_call(['sha256sum','-c','SHA256SUMS.txt'],cwd=OUT,stdout=subprocess.DEVNULL)
    print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
