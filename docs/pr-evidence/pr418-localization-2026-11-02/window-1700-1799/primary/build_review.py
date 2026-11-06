import collections, hashlib, json, pathlib, re

ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1700-1799-primary-20261102')
HEAD='670d1a213179dcc690f27a8b92c2372dba699091'
TREE='be2a8a70ef7f86f3499be7c2190a07b3d2d78036'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

# Independently reviewed replacement targets keyed by source position and locale.
T={
1701:{'ar':'مرشحات المهام'},
1702:{'ja':'過去30日間','ko':'지난 30일','zh_Hant':'最近30天'},
1703:{'hi':'समयावधि','ja':'期間','ko':'기간','zh_Hant':'時間範圍'},
1704:{'vi':'Video'},
1706:{'fr':'Motif'},
1707:{'fr':'Type de problème','zh_Hant':'問題類型'},
1708:{'ja':'利用可能な画質がありません','ko':'이용 가능한 화질이 없습니다','vi':'Không có chất lượng nào khả dụng','zh_Hans':'没有可用画质','zh_Hant':'沒有可用畫質'},
1709:{'ar':'يرجى تقديم شرح مفصل للمشكلة التي واجهتها.'},
1710:{'ja':'画質','ko':'화질','zh_Hant':'畫質'},
1712:{'hi':'कम से कम एक प्रभावित सीज़न या एपिसोड चुनें','ja':'影響を受けたシーズンまたはエピソードを少なくとも1つ選択してください','ko':'영향을 받은 시즌 또는 에피소드를 하나 이상 선택하세요','zh_Hans':'至少选择一个受影响的季或集','zh_Hant':'請至少選擇一個受影響的季或集'},
1713:{'ar':'إرسال بلاغ عن مشكلة','hi':'समस्या की रिपोर्ट भेजें','vi':'Gửi báo cáo sự cố'},
1715:{'ar':'تم إرسال بلاغ عن <strong>{title}</strong> بنجاح!','hi':'<strong>{title}</strong> के लिए समस्या की रिपोर्ट सफलतापूर्वक भेजी गई!','vi':'Đã gửi báo cáo sự cố cho <strong>{title}</strong> thành công!'},
1716:{'id':'Lihat detail'},
1718:{'ar':'يجب ألا يتجاوز الوصف {maxLength, number} حرفًا','id':'Deskripsi maksimal {maxLength, number} karakter','ja':'説明は{maxLength, number}文字以内で入力してください','ko':'설명은 {maxLength, number}자 이하여야 합니다','pt_BR':'A descrição deve ter no máximo {maxLength, number} caracteres','zh_Hant':'描述不得超過 {maxLength, number} 個字元'},
1719:{'ko':'설명을 입력해야 합니다','pt_BR':'Você deve fornecer uma descrição'},
1720:{'pt_BR':'O que há de errado?','zh_Hans':'您遇到了什么问题？'},
1722:{'pt_BR':'Outro'},
1723:{'hi':'क्षतिग्रस्त या अपठनीय फ़ाइल','ja':'破損または読み取れないファイル','ko':'손상되었거나 읽을 수 없는 파일','zh_Hant':'損毀或無法讀取的檔案'},
1724:{'ko':'잘못된 제목 또는 메타데이터'},
1726:{'ar':'عدد مفقود','de':'Fehlende Ausgabe','es':'Número faltante','fr':'Numéro manquant','hi':'अंक गायब','id':'Edisi yang hilang','ja':'欠号','ko':'누락된 호','pt_BR':'Edição ausente','vi':'Thiếu số phát hành','zh_Hans':'缺期','zh_Hant':'缺期'},
1727:{'hi':'गलत संस्करण या रूपांतर','ja':'誤った版またはバリアント','ko':'잘못된 판 또는 변형판'},
1728:{'ar':'العدد أو التاريخ غير صحيح','hi':'गलत अंक या तारीख','id':'Nomor atau tanggal salah','ja':'号数または日付が違う','ko':'호수 또는 날짜가 잘못됨','pt_BR':'Número ou data incorretos','zh_Hans':'期号或日期错误'},
1732:{'ar':'الافتراضي ({language})','hi':'डिफ़ॉल्ट ({language})','vi':'Mặc định ({language})'},
1733:{'pt_BR':'Todos os idiomas'},
1734:{'hi':'प्रदर्शन भाषा','vi':'Ngôn ngữ hiển thị'},
1737:{'ar':'ابحث عن الأفلام والمسلسلات والموسيقى والكتب والأشخاص','fr':'Rechercher des films, des séries, de la musique, des livres et des personnes','ja':'映画、シリーズ、音楽、本、人を検索','ko':'영화, 시리즈, 음악, 도서 및 인물 검색','pt_BR':'Pesquisar filmes, séries, músicas, livros e pessoas','vi':'Tìm phim, phim bộ, nhạc, sách và người','zh_Hans':'搜索电影、剧集、音乐、书籍和人物','zh_Hant':'搜尋電影、影集、音樂、書籍及人物'},
1738:{'ar':'أدوات الحصول على المحتوى','de':'Medienbeschaffung'},
1739:{'vi':'Danh sách chặn','zh_Hant':'封鎖清單'},
1741:{'es':'Contenido para adultos','fr':'Contenu pour adultes','vi':'Nội dung người lớn'},
1742:{'vi':'Sách nói','zh_Hans':'有声书','zh_Hant':'有聲書'},
1747:{'ko':'음악'},
1749:{'ko':'스포츠','zh_Hant':'體育'},
1751:{'ar':'التقويم','ko':'달력','vi':'Lịch'},
1753:{'ar':'اكتشف','hi':'खोजें और जानें','ja':'見つける','ko':'탐색'},
1754:{'ar':'صندوق وارد التنزيلات','fr':'Boîte de réception des téléchargements','id':'Kotak masuk unduhan','ja':'ダウンロード受信箱','ko':'다운로드 받은 편지함','pt_BR':'Caixa de entrada de downloads','vi':'Hộp thư tải xuống'},
1759:{'vi':'Sự cố'},
1760:{'ar':'مكتبتي','ja':'マイライブラリ','ko':'내 라이브러리'},
1762:{'ko':'번역 및 패치'},
1766:{'fr':'Balayer','id':'Geser','vi':'Vuốt','zh_Hans':'滑动','zh_Hant':'滑動'},
1769:{'ko':'어두운 모드'},
1771:{'ar':'الوضع الفاتح','fr':'Mode clair','id':'Mode terang','ko':'밝은 모드','pt_BR':'Modo claro','vi':'Chế độ sáng','zh_Hans':'浅色模式','zh_Hant':'淺色模式'},
1772:{'hi':'थीम सहेजी नहीं जा सकी। कृपया फिर से प्रयास करें।','pt_BR':'Não foi possível salvar seu tema. Tente novamente.','vi':'Không thể lưu giao diện của bạn. Vui lòng thử lại.','zh_Hans':'无法保存您的主题，请重试。','zh_Hant':'無法儲存您的主題，請再試一次。'},
1773:{'ar':'منتقي السمات','fr':'Sélecteur de thème','ko':'테마 선택기','pt_BR':'Seletor de temas','vi':'Bộ chọn giao diện','zh_Hant':'主題選擇器'},
1774:{'ar':'تبديل','id':'Alihkan','ja':'切り替え','ko':'전환'},
1775:{'ja':'書籍リクエスト'},
1776:{'es':'Solicitudes de cómics','ko':'만화 요청'},
1780:{'vi':'Yêu cầu phim bộ'},
1782:{'zh_Hans':'个人资料'},
1785:{'vi':'Đăng xuất'},
1787:{'hi':'ईमेल पता अमान्य है।','vi':'Địa chỉ email không hợp lệ.','zh_Hant':'電子郵件地址無效。'},
1788:{'hi':'ईमेल पता आवश्यक है।','zh_Hant':'請輸入電子郵件地址。'},
1790:{'ar':'الملف الشخصي غير مكتمل','hi':'प्रोफ़ाइल अधूरी है','ko':'프로필이 완성되지 않았습니다','zh_Hans':'个人资料未完善','zh_Hant':'個人資料尚未完善'},
1791:{
'ar':'متأخر بمقدار {commitsBehind}، {commitsBehind, plural, zero {# التزام} one {التزام واحد} two {التزامان} few {# التزامات} many {# التزامًا} other {# التزام}} عن أحدث إصدار',
'de':'{commitsBehind} {commitsBehind, plural, one {Commit} other {Commits}} zurück',
'es':'{commitsBehind} {commitsBehind, plural, one {commit} other {commits}} por detrás',
'hi':'{commitsBehind} {commitsBehind, plural, one {कमिट} other {कमिट}} पीछे',
'id':'{commitsBehind} {commitsBehind, plural, one {commit} other {commit}} tertinggal',
'ja':'{commitsBehind} {commitsBehind, plural, one {コミット} other {コミット}} 遅れています',
'ko':'{commitsBehind} {commitsBehind, plural, one {커밋} other {커밋}} 뒤처져 있습니다',
'pt_BR':'{commitsBehind} {commitsBehind, plural, one {commit} other {commits}} atrás',
'vi':'Chậm {commitsBehind} {commitsBehind, plural, one {commit} other {commit}}',
'zh_Hans':'落后 {commitsBehind} {commitsBehind, plural, one {次提交} other {次提交}}',
'zh_Hant':'落後 {commitsBehind} {commitsBehind, plural, one {次提交} other {次提交}}'},
1792:{'hi':'पुराना संस्करण','id':'Sudah usang','ja':'最新ではありません','vi':'Đã lỗi thời','zh_Hans':'已过时'},
1794:{loc:'SeerrNG Stable' for loc in ['ar','de','es','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']},
1796:{'hi':'खोज जारी रखें','pt_BR':'Continuar a pesquisa'},
1797:{'vi':'Chọn một đội'},
1798:{
'ja':'SeerrNG は、Tunerr が番組表で見つけたこれらのチームの今後の各試合について、録画をリクエストします。録画は通常の承認ルールに従います。',
'ko':'SeerrNG는 Tunerr가 편성표에서 찾은 이 팀들의 각 예정 경기에 대해 녹화를 요청합니다. 녹화 요청에는 일반 승인 규칙이 적용됩니다.',
'pt_BR':'SeerrNG solicita a gravação de cada jogo futuro dessas equipes quando o Tunerr o encontra no guia. As gravações seguem as regras habituais de aprovação.',
'vi':'SeerrNG yêu cầu ghi hình từng trận đấu sắp tới của các đội này khi Tunerr tìm thấy trận đấu trong lịch phát sóng. Các yêu cầu ghi hình tuân theo quy trình phê duyệt thông thường.',
'zh_Hans':'当 Tunerr 在节目指南中找到这些球队即将进行的比赛时，SeerrNG 会为每场比赛请求录制。录制请求遵循通常的审批规则。'},
1799:{'ar':'تعذّر تحديث الفريق.','ko':'팀을 업데이트할 수 없습니다.','vi':'Không thể cập nhật đội.','zh_Hans':'团队无法更新。','zh_Hant':'團隊無法更新。'}
}

WHY={
1701:'The IssueList label names filtering controls; the current Arabic means task files.',
1702:'This filter covers the preceding 30 days, not the final 30 days.',
1703:'This label is a time range, not elapsed time, an abstract time, or a deadline.',
1704:'This IssueList option is the video issue type; the current Vietnamese is dated and can imply videotape.',
1706:'This is the singular field label for the selected issue-report reason.',
1707:'This field labels an issue-report type, not a broadcast/publication type.',
1708:'The modal offers HD/4K, so available quality means video picture quality.',
1709:'Correct the Arabic misspelling and use a direct detailed-explanation request.',
1710:'The caller uses this label for HD/4K options, so it means picture quality.',
1712:'The form selects affected TV seasons/episodes; current translations use weather seasons or unnatural terms.',
1713:'This button submits an issue report; current wording says confirm, only submit, or an unclear literal.',
1715:'This is a success toast after submitting a report; preserve the exact title placeholder and strong markup.',
1716:'This toast links to submitted report details; the current Indonesian verb is unnatural for the UI action.',
1718:'This validation limits description text characters, not people or fictional characters; retain the numeric ICU argument.',
1719:'This validation requires a description; the proposed target restores that field meaning or natural phrasing.',
1720:'This is the issue form’s short question prompt.',
1722:'The IssueModal option is one category, so use singular agreement.',
1723:'The source says damaged or unreadable; current wording reverses the meaning or says unread.',
1724:'Use the Korean term for metadata instead of the untranslated English word.',
1726:'The neighboring reason taxonomy shows that “issue” means a missing numbered publication issue, not a missing problem.',
1727:'The source contrasts an edition with a variant; current Hindi repeats edition or other targets mean deformation/species.',
1728:'This reason refers to an incorrect publication issue number or date, not a support problem.',
1732:'Fix punctuation/spelling around the language-default label while preserving {language}.',
1733:'The current Portuguese omits the article required in “all languages.”',
1734:'This is a setting label naming the display language, not an instruction.',
1737:'The search hint lists all five searchable groups; the current translation omits categories or mistranslates series.',
1738:'In this media app, acquisition means obtaining media, not customer acquisition or just download.',
1739:'The source names the blocklist section.',
1741:'This media category means adult content, not an adult person.',
1742:'This navigation item is audiobooks, not audio or an audio handbook.',
1747:'The current Korean value is a bullet, not Music.',
1749:'The current Korean value is a bullet; the Traditional Chinese must use Traditional characters.',
1751:'This sidebar item is the calendar; current targets mean schedule, abbreviation, or standard.',
1753:'This is a Discover/explore navigation section, not Home or search alone.',
1754:'This sidebar item is the inbox for downloads, not a command to download an inbox.',
1759:'This navigation item is the support-issue list; Vietnamese Số means a number.',
1760:'This is the user’s media library, not a desk or physical book library.',
1762:'The feature covers translations and content patches/mods; Korean 해킹 implies security intrusion.',
1766:'This navigation item names the swipe gesture/feature; current values mean turn, slash, marking, or refresh.',
1769:'This setting selects dark mode; the current Korean means form/shape.',
1771:'This setting is the light interface theme; current wording means light, rays, or light weight.',
1772:'The error concerns the UI theme, not a topic or nuance; some targets also have awkward punctuation.',
1773:'This is the UI theme selector, not a rescuer/retriever or topic picker.',
1774:'This control toggles a setting; current values mean laughter, lever, topics, or an unnatural switch label.',
1775:'This quota label counts book requests; the current Japanese means reserving a request.',
1776:'This quota counts comic-book requests; Spanish cómicas means funny/comical.',
1780:'This quota counts TV-series requests; Vietnamese hàng loạt means bulk/in large quantities.',
1782:'This menu item is the user profile; the current Chinese means a personal file/archive.',
1785:'This menu action signs the user out; the current Vietnamese is a literal document-signing phrase.',
1787:'The source means invalid email/address, not illegal, postal, or a bare Email label.',
1788:'The warning requires an email address; current Hindi is awkward and Traditional Chinese omits address.',
1790:'The warning concerns an incomplete user profile; current targets mean image/configuration file or use wrong agreement.',
1791:'The version status counts version-control commits behind; preserve both source ICU arguments exactly.',
1792:'This version status means out of date, not an expired date or expired subscription.',
1794:'This is the named Stable release stream, parallel to the unchanged canonical “SeerrNG Main” channel label.',
1796:'This action continues a search; the current Hindi means reading.',
1797:'The caller selects a sports team; Vietnamese nhóm means a generic group.',
1798:'The source describes video recording requests for upcoming games found in Tunerr’s guide; preserve product names and approval rules.',
1799:'This is the standalone failure toast that the team could not be updated.'
}
REFINE={(1704,'vi'),(1706,'fr'),(1709,'ar'),(1716,'id'),(1718,'id'),(1719,'pt_BR'),(1720,'pt_BR'),(1720,'zh_Hans'),(1738,'ar'),(1766,'id'),(1772,'pt_BR'),(1772,'zh_Hans'),(1772,'zh_Hant'),(1773,'pt_BR'),(1791,'es'),(1794,'ar'),(1794,'de'),(1794,'es'),(1794,'hi'),(1794,'id'),(1794,'ja'),(1794,'ko'),(1794,'pt_BR'),(1794,'vi'),(1794,'zh_Hans'),(1794,'zh_Hant'),(1796,'pt_BR'),(1798,'pt_BR'),(1799,'zh_Hans'),(1799,'zh_Hant')}
PRIOR_FILE='docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/exact-hash-apply-plan.jsonl'
def sha(s): return hashlib.sha256(s.encode('utf-8') if isinstance(s,str) else s).hexdigest()
def ph(s):
    out=[]; i=0
    while i<len(s):
        if s[i]!='{': i+=1; continue
        depth=1; j=i+1
        while j<len(s) and depth:
            if s[j]=='{': depth+=1
            elif s[j]=='}': depth-=1
            j+=1
        if depth: break
        body=s[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def loadjl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x]
cells=[json.loads(x) for x in (ROOT/'source-current-cells.jsonl').read_text(encoding='utf-8').splitlines()]
callers={x['sourceId']:x for x in loadjl(ROOT/'caller-contexts.jsonl')}
boundary=json.loads((ROOT/'prior-disposition-boundary.json').read_text(encoding='utf-8'))
history=collections.defaultdict(list)
for x in boundary['matches']:
    if x.get('disposition') and x['disposition']!='semantic-review-required':
        history[(x.get('sourceId'),x.get('locale'))].append(x)
protected={1705:['HD'],1717:['4K'],1793:['SeerrNG Main'],1794:['SeerrNG Stable'],1798:['SeerrNG','Tunerr']}
review=[]
for c in cells:
    pos,loc,sid=c['sourcePosition'],c['locale'],c['sourceId']
    prior=c.get('priorDisposition')
    if prior:
        target=prior['priorFinalTarget']; disp='preserve-prior-disposition'; reason='Exact frozen Spanish disposition preserved at the same source, locale, and final-target hash.'; confidence='high'
    elif loc in T.get(pos,{}):
        target=T[pos][loc]; disp='propose-refinement' if (pos,loc) in REFINE else 'propose-correction'; reason=WHY[pos]; confidence='moderate' if disp=='propose-refinement' else 'high'
    else:
        target=c['currentTarget']; disp='accept-current'; reason='The current translation conveys the source meaning in its pinned caller context and preserves required text structure.'; confidence='moderate'
    sph,tph=ph(c['source']),ph(target); sm,tm=tags(c['source']),tags(target); exp=protected.get(pos,[])
    missing=[p for p in exp if p not in target]
    caller=callers[sid]
    row={'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':c['source'],'sourceHash':c['sourceHash'],'sourceTextSha256':c['sourceTextSha256'],
      'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'candidateTarget':target,'candidateTargetHash':sha(target),
      'finalTarget':target,'finalTargetHash':sha(target),'localeFile':c['localeFile'],'localeBlob':c['localeBlob'],'localeFileSha256':c['localeFileSha256'],
      'sourceFile':c['sourceFile'],'sourceCatalogBlob':c['sourceCatalogBlob'],'sourceFileSha256':c['sourceFileSha256'],
      'callerContextRef':sid,'callerContextSha256':c['callerContextSha256'],'callerUseStatus':caller['callerUseStatus'],
      'callerPaths':caller['callerPaths'],'callerLineRefs':caller['pinnedLineRefs'],
      'disposition':disp,'rationale':reason,'confidence':confidence,
      'sourcePlaceholders':sph,'candidatePlaceholders':tph,'placeholderParity':'exact' if sorted(sph,key=lambda a:(a['name'],a['kind']))==sorted(tph,key=lambda a:(a['name'],a['kind'])) else 'mismatch',
      'sourceMarkup':sm,'candidateMarkup':tm,'markupParity':'exact' if sm==tm else 'mismatch',
      'protectedLiteralsExpected':exp,'protectedLiteralMissing':missing,'protectedLiteralParity':'exact' if not missing else 'mismatch',
      'historicalDispositionReferences':history.get((sid,loc),[]),'priorDisposition':prior,'candidateChanged':target!=c['currentTarget']}
    review.append(row)
counts=collections.Counter(r['disposition'] for r in review)
assert len(review)==1200 and len({(r['sourceId'],r['locale']) for r in review})==1200
assert all(r['placeholderParity']=='exact' and r['markupParity']=='exact' and r['protectedLiteralParity']=='exact' for r in review), 'candidate structural mismatch'
assert sum(r['disposition']=='preserve-prior-disposition' for r in review)==1
assert set(WHY)==set(T)
(ROOT/'primary-review-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in review),encoding='utf-8')
summary={'repository':'snapetech-org/seerrng','pullRequest':418,'state':'OPEN','isDraft':True,'head':HEAD,'tree':TREE,
 'sourcePositionRange':[1700,1799],'sourceIds':100,'locales':LOCALES,'cells':1200,'dispositionCounts':dict(sorted(counts.items())),
 'correctionCandidateCount':counts.get('propose-correction',0),'refinementCandidateCount':counts.get('propose-refinement',0),
 'priorFrozenDispositionCount':counts.get('preserve-prior-disposition',0),
 'historicalReuseEquivalenceReferences':sum(bool(r['historicalDispositionReferences']) and r['disposition']!='preserve-prior-disposition' for r in review),
 'placeholderMismatchCount':sum(r['placeholderParity']!='exact' for r in review),
 'markupMismatchCount':sum(r['markupParity']!='exact' for r in review),
 'protectedLiteralMismatchCount':sum(r['protectedLiteralParity']!='exact' for r in review),
 'definitionOnlyOrSingleReferenceKeys':['components.Layout.UserWarnings.emailInvalid','components.Layout.UserWarnings.passwordRequired'],
 'definitionOnlyOrSingleReferenceCells':24,'nativeSpeakerApproval':'outstanding',
 'repoOrPullRequestModified':False,'testsBuildsScansCIorBrowserRun':False,'outputPath':str(ROOT)}
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
readme='''# SeerrNG PR #418 primary semantic review: source positions 1700–1799

This packet reviews 100 English catalog entries across the 12 direct locales ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, and zh_Hant (1,200 cells).

## Pin and method

- PR #418 was OPEN/DRAFT at exact head 670d1a213179dcc690f27a8b92c2372dba699091 and tree be2a8a70ef7f86f3499be7c2190a07b3d2d78036 during input attestation.
- Source positions are zero-based insertion order in the pinned flat src/i18n/locale/en.json catalog.
- Each row records exact source/current/candidate/final text and SHA-256, locale file blob/digest, and caller-context file/line pins.
- Two warning strings (emailInvalid, passwordRequired) have only their message-definition line in the targeted caller file. The pinned UserWarnings component visibly renders emailRequired and profileIncomplete but has no direct use of those two definitions. They are flagged as caller-evidence gaps, not asserted to render.
- One exact prior Spanish acceptance for components.IssueModal.CreateIssueModal.issueType is preserved with its frozen target and hashes. Twelve historical reuse-equivalence references are retained as context, but had no frozen final-target hash and were independently reviewed.

## Review summary

- Accept current: {accept}
- Propose correction: {correction}
- Propose refinement: {refinement}
- Preserve prior disposition: {prior}
- Holds: 0
- Candidate placeholder/ICU mismatches: 0
- Candidate markup mismatches: 0
- Candidate protected-literal mismatches: 0

All required title, maxLength number, language, and repeated commitsBehind ICU arguments are retained exactly. Strong markup is preserved. HD, 4K, SeerrNG Main, SeerrNG Stable, and Tunerr are treated as protected literals.

No repository/PR changes, tests, builds, scans, CI, or browser actions were performed. This machine review is not native-speaker approval.

## Packet files

- primary-review-ledger.jsonl: one semantic-review decision per source ID and locale, with exact hashes and validation checks.
- source-current-cells.jsonl: frozen source/current catalog evidence.
- caller-contexts.jsonl: pinned caller files, line text, and adjacent lines.
- source-window.json: exact source inventory and insertion positions.
- prior-disposition-boundary.json: prior packet/historical-disposition scan.
- input-manifest.json and INPUT-SHA256SUMS: input attestation.
- prepare_input.py and build_review.py: scratch-only preparation and review scripts.
- summary.json, README.md, SHA256SUMS: review counts and output integrity manifest.
'''.format(accept=counts.get('accept-current',0),correction=counts.get('propose-correction',0),refinement=counts.get('propose-refinement',0),prior=counts.get('preserve-prior-disposition',0))
(ROOT/'README.md').write_text(readme,encoding='utf-8')
names=['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json','INPUT-SHA256SUMS','primary-review-ledger.jsonl','summary.json','README.md','prepare_input.py','build_review.py']
(ROOT/'SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in names),encoding='utf-8')
print(json.dumps({'summary':summary,'checksumFiles':names},ensure_ascii=False,indent=2))
