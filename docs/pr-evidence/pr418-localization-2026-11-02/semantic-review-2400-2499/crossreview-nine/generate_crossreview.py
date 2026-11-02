from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess, datetime, os

PRIMARY = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
OUT = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-nine-locale-crossreview-20261102')
REPO = pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
EXPECTED_HEAD = 'f20893e57a89827095fa049d8e0475df7ec7170f'
EXPECTED_TREE = 'b5a5952fb4f8a37ea5a39286295f153ce9504f52'
REPO_NAME = 'snapetech-org/SeerrNG'
PR = 418
LOCALES = ['ar','de','es','fr','ja','ko','pt_BR','zh_Hans','zh_Hant']
ALL_PRS = [('ChaptarrNG',190),('SeerrNG',418),('slskR',204),('QuestarrNG',155),('TorrentNG',243),('slskdN',409),('ROMarrNG',70)]

REVISIONS = {
 (2443,'pt_BR'): ('Concede permissão para solicitar filmes que não sejam 4K.', 'The primary candidate broadens the object from non-4K movies to all non-4K media. This keeps the source movie scope.'),
 (2493,'ar'): ('افتح مكتبة Grimmory للكتب الصوتية', 'The proposal fixes Grimmory but adds sentence punctuation to a short link label; remove the period to match the source label style.'),
 (2499,'fr'): ('Ouvrez la bibliothèque Grimmory dans un navigateur. Pour lire des BD page par page, copiez l’adresse Komga de Grimmory dans Paramètres > Services > Applications de lecture, puis collez-la dans une application compatible.', 'Use the exact localized Reader Apps label already used in the settings route: “Applications de lecture”.'),
 (2499,'ja'): ('ブラウザでGrimmoryライブラリを開きます。コミックを1ページずつ読むには、設定 > サービス > リーダーアプリでGrimmoryのKomgaアドレスをコピーし、対応アプリに貼り付けます。', 'Use the same localized settings path as the in-app route label (“設定 > サービス > リーダーアプリ”); “読者アプリ” is not the route wording.'),
 (2499,'ko'): ('브라우저에서 Grimmory 라이브러리를 엽니다. 만화를 페이지별로 읽으려면 설정 > 서비스 > 리더 앱에서 Grimmory의 Komga 주소를 복사해 호환되는 앱에 붙여넣으세요.', 'Remove “account” because the source path is Settings > Services > Reader Apps; use the catalog’s localized Settings/Services route.'),
 (2499,'pt_BR'): ('Abra a biblioteca Grimmory em um navegador. Para ler quadrinhos página por página, copie o endereço Komga do Grimmory em Configurações > Serviços > Aplicativos de leitura e cole-o em um aplicativo compatível.', 'Use the exact localized UI path “Configurações > Serviços > Aplicativos de leitura”.'),
 (2499,'zh_Hans'): ('在浏览器中打开 Grimmory 图书馆。若要逐页阅读漫画，请前往“设置 > 服务 > 阅读器应用”复制 Grimmory 的 Komga 地址，再粘贴到兼容的应用中。', '“Services” is localized as 服务, not 服务器; use the exact localized route label 阅读器应用.'),
 (2499,'zh_Hant'): ('在瀏覽器中開啟 Grimmory 圖書館。若要逐頁閱讀漫畫，請前往「設定 > 服務 > 閱讀器 App」複製 Grimmory 的 Komga 位址，再貼到相容的應用程式中。', '“Services” is localized as 服務, not 伺服器; match the UI route label 閱讀器 App.'),
}
ADDITIONAL = {
 (2446,'ja'): ('スポーツコンテンツをリクエスト', 'The current literal-style wording is awkward; make “Request Sports” a natural action label while retaining the sports-content scope.'),
 (2455,'ar'): ('منح الإذن بعرض مشكلات الوسائط التي أبلغ عنها مستخدمون آخرون.', 'The current text says all issues reported by users, omitting “other” and adding “all”; restore the source scope and media context.'),
 (2457,'zh_Hant'): ('授予檢視最近新增媒體清單的權限。', 'The current description omits “the list”; restore that explicit object from the English source.'),
 (2466,'es'): ('Equipo técnico', '“Equipo” alone is a generic team; the caller is the production-credit Crew section, so specify the technical/production crew.'),
 (2466,'fr'): ('Équipe technique', '“Équipe” alone is a generic team; the caller is the production-credit Crew section, so specify the production crew.'),
 (2471,'ar'): ('تعذّر طلب أفلام هذا الشخص.', 'The current first-person wording means asking this person for movies; the operation failed to request films associated with this person.'),
 (2496,'ko'): ('오디오북의 진행 상황과 재생은 Grimmory에서 관리합니다.', 'The current description switches to English for “Audiobook”; localize the term and retain the managed progress/playback meaning.'),
 (2497,'ja'): ('{serviceName}でコミックを閲覧', 'The current word order leaves the service placeholder detached; place the service before the natural “browse comics” action.'),
}


def shas(s: str) -> str: return hashlib.sha256(s.encode('utf-8')).hexdigest()
def canonical(obj) -> bytes: return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def run(args, cwd=None): return subprocess.check_output(args,cwd=cwd,text=True).strip()
def read_json(path): return json.loads(path.read_text(encoding='utf-8'))
def read_jsonl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x]
def flatten_catalog(value, prefix=''):
    out={}
    for k,v in value.items():
        key=f'{prefix}.{k}' if prefix else k
        if isinstance(v,dict): out.update(flatten_catalog(v,key))
        else: out[key]=v
    return out

def live_prs():
    rows=[]
    for repo, number in ALL_PRS:
        data=json.loads(run(['gh','pr','view',str(number),'--repo',f'snapetech-org/{repo}','--json','state,isDraft,headRefOid,headRefName,baseRefOid,url']))
        rows.append({'repository':f'snapetech-org/{repo}','pullRequest':number,**data})
    return rows

def git_status():
    return {
        'head': run(['git','rev-parse','HEAD'],cwd=REPO),
        'tree': run(['git','rev-parse','HEAD^{tree}'],cwd=REPO),
        'branch': run(['git','branch','--show-current'],cwd=REPO),
        'statusPorcelain': run(['git','status','--porcelain=v1'],cwd=REPO),
    }

def placeholder_sig(text):
    sig=[]; i=0
    while i<len(text):
        if text[i] != '{': i+=1; continue
        depth=1; j=i+1
        while j<len(text) and depth:
            if text[j]=='{': depth+=1
            elif text[j]=='}': depth-=1
            j+=1
        if depth: return None
        body=text[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: sig.append((m.group(1),m.group(2) or 'simple'))
        i=j
    return sorted(sig)

def markup_sig(text): return sorted(re.findall(r'</?[A-Za-z][^>]*>',text))
def plural_categories(text): return sorted(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',text)))

# Reattest the complete frozen primary packet before consuming it.
subprocess.run(['sha256sum','-c','SHA256SUMS'],cwd=PRIMARY,check=True,stdout=subprocess.DEVNULL)
primary_manifest_hash=shas((PRIMARY/'SHA256SUMS').read_text())
primary_rows=read_jsonl(PRIMARY/'primary-review-ledger.jsonl')
candidate_rows=read_jsonl(PRIMARY/'correction-candidates.jsonl')
source_cells=read_jsonl(PRIMARY/'source-current-cells.jsonl')
contexts=read_jsonl(PRIMARY/'caller-contexts.jsonl')
assert len(primary_rows)==1200 and len(source_cells)==1200 and len(contexts)==100
pmap={(r['sourcePosition'],r['locale']):r for r in primary_rows}
smap={(r['sourcePosition'],r['locale']):r for r in source_cells}
cmap={(r['sourcePosition'],r['locale']):r for r in candidate_rows}
ctxmap={r['sourceId']:r for r in contexts}
assert len(pmap)==1200 and len(smap)==1200 and len(cmap)==347 and len(ctxmap)==100

# Exact live status before review: all seven localization PRs and the clean pinned worktree.
start_prs=live_prs()
start_tree=git_status()
assert start_tree['head']==EXPECTED_HEAD and start_tree['tree']==EXPECTED_TREE and not start_tree['statusPorcelain'],start_tree
seerr=[r for r in start_prs if r['repository']==REPO_NAME and r['pullRequest']==PR][0]
assert seerr['state']=='OPEN' and seerr['isDraft'] is True and seerr['headRefOid']==EXPECTED_HEAD,seerr
assert read_json(PRIMARY/'input-manifest.json')['head']==EXPECTED_HEAD
assert read_json(PRIMARY/'input-manifest.json')['tree']==EXPECTED_TREE
(OUT/'live-localization-prs-start.json').write_text(json.dumps(start_prs,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(OUT/'worktree-start.json').write_text(json.dumps(start_tree,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

# Independently verify the primary source/current hashes against actual locale catalogs at this tree.
needed_locs=sorted(set(LOCALES+['en']))
catalogs={}
file_hashes={}
for loc in needed_locs:
    rel=f'src/i18n/locale/{loc}.json'
    path=REPO/rel
    raw=path.read_bytes()
    file_hashes[rel]=shas(raw.decode('utf-8'))
    catalogs[loc]=flatten_catalog(json.loads(raw.decode('utf-8')))
for r in primary_rows:
    if r['locale'] not in LOCALES: continue
    assert catalogs['en'].get(r['sourceId'])==r['source'],(r['sourcePosition'],r['sourceId'],'source text mismatch')
    assert catalogs[r['locale']].get(r['sourceId'])==r['currentTarget'],(r['sourcePosition'],r['locale'],'current target mismatch')
    assert shas(r['source'])==r['sourceTextSha256']
    assert shas(r['currentTarget'])==r['currentTargetHash']
    assert file_hashes[r['sourceFile']]==r['sourceFileSha256']
    assert file_hashes[r['localeFile']]==r['localeFileSha256']
    assert shas(canonical(ctxmap[r['sourceId']]).decode('utf-8'))==r['callerContextSha256']
    assert r['callerContext']==ctxmap[r['sourceId']]
for (pos,loc),r in pmap.items():
    assert r['source']==smap[(pos,loc)]['source'] and r['currentTarget']==smap[(pos,loc)]['currentTarget']
for k,c in cmap.items():
    r=pmap[k]
    assert r['disposition']=='propose-correction' and r['finalTarget']==c['candidateTarget']
    assert r['finalTargetHash']==c['candidateTargetHash']==shas(c['candidateTarget'])

# Protected literal list used by the primary plus exact service/product/format identifiers in this source slice.
protected_terms=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library','BookOrbit','Grimmory','Komga','Sportarr','Whisparr','LazyLibrarian','Admin','M4B','M4A','OPUS','OGG','OPDS','CBZ','CBR','CB7']
def exact_required_literals(source):
    # Only exact literals actually present in this English source row are required in its target.
    found=[]
    for term in protected_terms:
        if term in source and term not in found: found.append(term)
    return found

review=[]
for pos in range(2400,2500):
  for loc in LOCALES:
    key=(pos,loc); p=pmap[key]; s=smap[key]; candidate=cmap.get(key)
    source=p['source']; current=p['currentTarget']
    if key in REVISIONS:
        target,why=REVISIONS[key]; outcome='revised'
        primary_status='propose-correction'
    elif key in ADDITIONAL:
        target,why=ADDITIONAL[key]; outcome='additional'
        primary_status=p['disposition']
    elif candidate:
        target=candidate['candidateTarget']; outcome='accepted'; primary_status='propose-correction'
        why='Accepted independently: '+candidate['rationale']+' Caller context confirms the same action/help meaning; token, markup, and protected-name checks pass.'
    else:
        target=current; outcome='accepted'; primary_status='accept-current'
        group=p['sourceId'].split('.',2)[1]
        contexts_by_group={
          'PermissionEdit':'permission label/description',
          'PersonDetails':'person-detail or bulk-request label/description',
          'QuotaSelector':'quota item, period, or limit string',
          'ReaderDeliveryLink':'reader-service link/help text',
        }
        kind=contexts_by_group.get(group,'UI string')
        why=f'Accepted current value: it accurately conveys the source in the pinned {kind} context, with no material scope, grammar, or terminology issue found.'
    # Exact structural/protected-literal parity for source, current, proposal and final reviewed value.
    src_ph=placeholder_sig(source); cur_ph=placeholder_sig(current); out_ph=placeholder_sig(target)
    src_tags=markup_sig(source); cur_tags=markup_sig(current); out_tags=markup_sig(target)
    assert src_ph is not None and cur_ph is not None and out_ph is not None,(pos,loc,'unbalanced placeholder braces')
    ph_ok=src_ph==out_ph
    markup_ok=src_tags==out_tags
    required=exact_required_literals(source)
    missing=[t for t in required if t not in target]
    assert ph_ok and markup_ok and not missing,(pos,loc,'reviewed target structure/literal parity failed',src_ph,out_ph,src_tags,out_tags,missing)
    current_missing=[t for t in required if t not in current]
    # Pin caller objects, paths, lines and source/catalog objects for independent readback.
    ctx=ctxmap[p['sourceId']]
    caller_refs=[{'file':x['path'],'blob':x['blob'],'fileSha256':x['fileSha256']} for x in ctx['callerFiles']]
    if candidate:
        proposal_text=candidate['candidateTarget']; proposal_hash=candidate['candidateTargetHash']
        assert shas(proposal_text)==proposal_hash
    else:
        proposal_text=None; proposal_hash=None
    row={
      'sourcePosition':pos,'sourceId':p['sourceId'],'locale':loc,
      'sourceText':source,'sourceTextSha256':p['sourceTextSha256'],'sourceCatalogFile':p['sourceFile'],'sourceCatalogFileSha256':p['sourceFileSha256'],'sourceCatalogBlob':p['sourceCatalogBlob'],
      'currentTarget':current,'currentTargetHash':p['currentTargetHash'],'localeCatalogFile':p['localeFile'],'localeCatalogFileSha256':p['localeFileSha256'],'localeCatalogBlob':p['localeBlob'],
      'callerContextRef':p['callerContextRef'],'callerContextSha256':p['callerContextSha256'],'callerUseStatus':ctx['callerUseStatus'],'callerEvidenceNote':ctx['callerEvidenceNote'],'callerFiles':caller_refs,'callerPaths':ctx['callerPaths'],'pinnedLineRefs':ctx['pinnedLineRefs'],
      'primaryDisposition':primary_status,'primaryCandidateTarget':proposal_text,'primaryCandidateTargetHash':proposal_hash,'primaryRationale':candidate['rationale'] if candidate else None,
      'crossReviewDisposition':outcome,'reviewedTarget':target,'reviewedTargetHash':shas(target),'crossReviewRationale':why,
      'sourcePlaceholders':p['sourcePlaceholders'],'sourceMarkup':p['sourceMarkup'],'sourceIcuPluralCategories':p['sourceIcuPluralCategories'],
      'reviewedPlaceholders':out_ph,'reviewedMarkup':out_tags,'reviewedIcuPluralCategories':plural_categories(target),
      'placeholderParity':'exact' if ph_ok else 'mismatch','markupParity':'exact' if markup_ok else 'mismatch',
      'protectedLiteralRequirements':required,'protectedLiteralMissing':missing,'currentProtectedLiteralMissing':current_missing,
      'priorDisposition':p['priorDisposition'],'priorDispositionOverridden':p['priorDispositionOverridden'],
      'confidence':'moderate','reviewType':'independent static semantic cross-review; no native-speaker/browser approval',
    }
    review.append(row)
assert len(review)==900 and len({(r['sourcePosition'],r['locale']) for r in review})==900
assert all(sum(1 for r in review if r['locale']==loc)==100 for loc in LOCALES)

# Final exact-live reattestation after the read-only review is frozen.
end_prs=live_prs()
end_tree=git_status()
assert end_tree['head']==EXPECTED_HEAD and end_tree['tree']==EXPECTED_TREE and not end_tree['statusPorcelain'],end_tree
seerr_end=[r for r in end_prs if r['repository']==REPO_NAME and r['pullRequest']==PR][0]
assert seerr_end['state']=='OPEN' and seerr_end['isDraft'] is True and seerr_end['headRefOid']==EXPECTED_HEAD,seerr_end
(OUT/'live-localization-prs-end.json').write_text(json.dumps(end_prs,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(OUT/'worktree-end.json').write_text(json.dumps(end_tree,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

# Write complete per-cell exact-hash record and summaries.
with (OUT/'cross-review.jsonl').open('w',encoding='utf-8',newline='\n') as f:
    for r in review: f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n')
counts=collections.Counter(r['crossReviewDisposition'] for r in review)
per_locale={loc:dict(collections.Counter(r['crossReviewDisposition'] for r in review if r['locale']==loc)) for loc in LOCALES}
summary={
  'repository':REPO_NAME,'pullRequest':PR,'state':'OPEN','isDraft':True,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,
  'window':{'sourcePositions':[2400,2499],'sourceCells':100,'locales':LOCALES,'cells':900},
  'primaryPacket':str(PRIMARY),'primaryPacketSha256Manifest':primary_manifest_hash,'primaryInputManifestSha256':shas((PRIMARY/'input-manifest.json').read_text()),
  'primaryLedgerSha256':shas((PRIMARY/'primary-review-ledger.jsonl').read_text()),'primaryCandidatesSha256':shas((PRIMARY/'correction-candidates.jsonl').read_text()),'primarySourceCurrentSha256':shas((PRIMARY/'source-current-cells.jsonl').read_text()),'primaryCallerContextsSha256':shas((PRIMARY/'caller-contexts.jsonl').read_text()),
  'primaryCandidateCountInScope':len([r for r in candidate_rows if r['locale'] in LOCALES]),
  'crossReviewCounts':dict(counts),'perLocaleCounts':per_locale,
  'structuralChecks':{'reviewedTargetsWithPlaceholderParityExact':sum(r['placeholderParity']=='exact' for r in review),'reviewedTargetsWithMarkupParityExact':sum(r['markupParity']=='exact' for r in review),'reviewedTargetsMissingProtectedLiteral':sum(bool(r['protectedLiteralMissing']) for r in review),'currentTargetsWithProtectedLiteralDrift':sum(bool(r['currentProtectedLiteralMissing']) for r in review)},
  'revisions':[{'sourcePosition':p,'locale':l,'target':v,'rationale':why} for (p,l),(v,why) in sorted(REVISIONS.items())],
  'additionalCorrections':[{'sourcePosition':p,'locale':l,'target':v,'rationale':why} for (p,l),(v,why) in sorted(ADDITIONAL.items())],
  'holds':[], 'browserReview':False,'nativeSpeakerApproval':False,'reviewNature':'Static text/context review against exact source strings and pinned caller excerpts; no browser or native-speaker review.'
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

readme=f'''# SeerrNG W2400–W2499 independent cross-review: nine locales

Scope: PR #418 at exact OPEN/DRAFT head `{EXPECTED_HEAD}`, tree `{EXPECTED_TREE}`. The clean pinned worktree was checked before and after. No repository files, PR data, tests, builds, CI, or browser state were changed or run.

Reviewed 900 current cells in source order (positions 2400–2499 × ar, de, es, fr, ja, ko, pt_BR, zh_Hans, zh_Hant), including all {summary['primaryCandidateCountInScope']} primary proposals. Each row in `cross-review.jsonl` records the exact source/current/candidate/reviewed hashes, caller context hash plus pinned caller file/line evidence, placeholder and markup checks, protected-literal checks, and disposition. The primary packet's complete `SHA256SUMS` manifest was verified before use, and the source/current catalog text and file hashes were checked against the exact worktree.

Disposition counts: `{dict(counts)}`.

Specific revisions and additional corrections are listed in `summary.json`. The revised candidates include the Portuguese non-4K movies scope at 2443 and localized route wording for Settings > Services > Reader Apps at 2499. Additional fixes include Japanese sports/comics action labels, Arabic source-scope corrections, Chinese Traditional permission wording, Spanish/French crew terminology, and Korean audiobook terminology. No holds remain in this nine-locale static pass.

This is a static cross-review only. It does not establish browser acceptance or native-speaker approval; those gates remain outstanding.

Primary packet: `{PRIMARY}`. Live PR head/state and worktree reattestations are in `live-localization-prs-start.json`, `live-localization-prs-end.json`, `worktree-start.json`, and `worktree-end.json`.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
# Final files checksum manifest, excluding itself.
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt')
with (OUT/'SHA256SUMS.txt').open('w',encoding='utf-8',newline='\n') as f:
    for path in files: f.write(f"{shas(path.read_bytes().decode('utf-8'))}  {path.name}\n")
print(json.dumps({'out':str(OUT),'rows':len(review),'counts':dict(counts),'perLocale':per_locale,'summary':summary['structuralChecks'],'manifest':shas((OUT/'SHA256SUMS.txt').read_text()),'reviewLedger':shas((OUT/'cross-review.jsonl').read_text()),'endHead':end_tree['head'],'endTree':end_tree['tree'],'repoStatus':end_tree['statusPorcelain']},ensure_ascii=False,indent=2))
