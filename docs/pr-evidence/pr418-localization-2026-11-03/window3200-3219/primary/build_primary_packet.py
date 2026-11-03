import hashlib, json, re, subprocess
from pathlib import Path

ROOT = Path('/mnt/disks/scratch/task-worktrees/localization-20261030/seerrng-apply-f67039a778d38912')
OUT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3200-3219-primary-20261103')
EXPECTED_HEAD = '2be00354833160f0681d5cd779a1b1be37a63a4b'
EXPECTED_TREE = 'af588a1ee34f768ae37a29dccd5a508595b7199d'
REPO = 'snapetech-org/SeerrNG'
LOCALES = ['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
RANGE = [3200, 3219]

# Primary recommendations are only for reviewed defects or useful localized refinements.
CHANGES = {
 'components.RequestStatus.SoftwareRequests.history': {
  'es': ('Historial','refinement','“Historial” names a UI event log more naturally than the broad “Historia”.'),
  'zh_Hans': ('历史记录','refinement','Use the conventional label for a record/history panel.'),
  'ko': ('기록','correction','The current value has a stray dash and means historical chronology; the UI is an event log.')},
 'components.RequestStatus.SoftwareRequests.historyError': {
  'es': ('No se pudo cargar el historial de estados.','correction','Replace the awkward present-tense wording with a natural failed-load message.'),
  'zh_Hans': ('无法加载状态历史记录。','correction','Replace the unnatural “load in” verb and remove the spaced punctuation.'),
  'hi': ('स्थिति इतिहास लोड नहीं हो सका।','correction','Correct the gender/agreement and use a natural failed-load construction.'),
  'ja': ('ステータス履歴を読み込めませんでした。','correction','The current passive form is ungrammatical; express that loading failed.'),
  'pt_BR': ('Não foi possível carregar o histórico de status.','refinement','Name the status history explicitly; the current text omits “status”.'),
  'ar': ('تعذّر تحميل سجل الحالة.','correction','Remove the extraneous conjunction and use a natural failed-load message.'),
  'ko': ('상태 기록을 불러오지 못했습니다.','correction','Replace the unnatural passive construction with a standard failed-load message.'),
  'zh_Hant': ('無法載入狀態歷史記錄。','correction','Remove the spaced punctuation and make the status-history meaning explicit.')},
 'components.RequestStatus.SoftwareRequests.historyLoading': {
  'zh_Hans': ('正在加载状态历史记录…','correction','Use the natural loading verb, status-history context, and matching ellipsis.'),
  'ja': ('ステータス履歴を読み込み中…','correction','The current wording is an infinitive rather than an in-progress status.'),
  'ar': ('جارٍ تحميل سجل الحالة…','correction','The current text changes the meaning to selecting a status; express loading history.'),
  'ko': ('상태 기록을 불러오는 중…','correction','The current text refers to shipping and is not a loading-status message.')},
 'components.RequestStatus.SoftwareRequests.importing': {
  'hi': ('आयात का सत्यापन हो रहा है','correction','Use a current in-progress status rather than an infinitive.'),
  'ar': ('جارٍ التحقق من الاستيراد','correction','Replace “certifying imports” with the in-progress verification status.'),
  'ko': ('가져오기 검증 중','correction','The current value means import/export trade; this status means verifying an import.'),
  'zh_Hant': ('正在驗證匯入','refinement','Make the in-progress verification action explicit.'),
  'vi': ('Đang xác minh bản nhập','correction','Replace the awkward capitalized noun “Nhập” with a natural in-progress status.'),
  'id': ('Memverifikasi impor','refinement','Use a natural lowercase object form for this status label.')},
 'components.RequestStatus.SoftwareRequests.loadError': {
  'es': ('No se pudo cargar el estado de las solicitudes de software.','correction','Use natural Spanish for a failed load and retain the plural request context.'),
  'zh_Hans': ('无法加载软件请求状态。','correction','Replace the unnatural load verb and remove the spaced punctuation.'),
  'hi': ('सॉफ़्टवेयर अनुरोध की स्थिति लोड नहीं की जा सकी।','correction','Fix agreement with feminine “स्थिति” and use a natural failed-load construction.'),
  'ja': ('ソフトウェアリクエストの状態を読み込めませんでした。','correction','Replace the unnatural passive phrasing with a failed-load message.'),
  'ar': ('تعذّر تحميل حالة طلب البرنامج.','correction','Remove the extraneous conjunction and state the load failure directly.'),
  'ko': ('소프트웨어 요청 상태를 불러오지 못했습니다.','correction','Use the standard failed-load construction and keep “request” in the meaning.'),
  'zh_Hant': ('無法載入軟體請求狀態。','correction','Remove the spaced punctuation and use traditional Chinese terminology.')},
 'components.RequestStatus.SoftwareRequests.manageError': {
  'es': ('No se pudo actualizar esta solicitud de software.','correction','Replace the conditional “could not” with a natural past failure message.'),
  'ja': ('このソフトウェアリクエストを更新できませんでした。','correction','The current string says the software cannot be updated and omits the request.'),
  'ko': ('이 소프트웨어 요청을 업데이트하지 못했습니다.','correction','The current string refers to revising the software itself, not updating the request.')},
 'components.RequestStatus.SoftwareRequests.modern': {
  'pt_BR': ('Moderno','refinement','Remove the full stop from a standalone category label.')},
 'components.RequestStatus.SoftwareRequests.noHistory': {
  'hi': ('स्थिति के कोई सहेजे गए अपडेट उपलब्ध नहीं हैं।','correction','Replace the unnatural “saved status update” wording with a clear status-history empty state.'),
  'ja': ('保存されたステータス更新はありません。','correction','The current wording can mean saved-state updates rather than saved status updates.'),
  'ar': ('لا تتوفر تحديثات حالة محفوظة.','correction','Replace the awkward phrase for saved status updates with a concise empty state.'),
  'zh_Hans': ('没有可用的已保存状态更新。','correction','Remove the spaced punctuation and clarify that no saved updates are available.'),
  'zh_Hant': ('目前沒有可用的已儲存狀態更新。','correction','Remove the spaced punctuation and clarify the saved status updates.'),
  'id': ('Tidak ada pembaruan status tersimpan yang tersedia.','correction','Replace the stilted formal phrasing with a natural empty-state sentence.')},
 'components.RequestStatus.SoftwareRequests.noRequests': {
  'zh_Hans': ('暂时还没有软件请求。','refinement','Remove the spaced punctuation and use a natural “none yet” empty state.'),
  'ar': ('لا توجد طلبات برامج بعد.','correction','Turn the current fragment into a complete, natural empty-state sentence.')},
 'components.RequestStatus.SoftwareRequests.operatingSystem': {
  'zh_Hans': ('操作系统：{value}','refinement','Use standard Chinese colon punctuation without surrounding spaces.'),
  'ja': ('オペレーティングシステム：{value}','refinement','Remove the unnatural internal space and use Japanese colon punctuation.'),
  'ko': ('운영 체제: {value}','correction','Use the standard Korean term for operating system.'),
  'zh_Hant': ('作業系統：{value}','correction','Use the traditional Chinese term and standard full-width punctuation.')},
 'components.RequestStatus.SoftwareRequests.pending': {
  'ja': ('承認待ち','correction','The current text means “end approval”; use the pending-approval status.'),
  'fr': ('En attente d’approbation','correction','Remove the spaces within the article and use the natural French phrase.'),
  'ko': ('승인 대기 중','correction','Replace the English/Korean mixture with a natural pending-approval status.'),
  'vi': ('Đang chờ phê duyệt','correction','Use the standard term for approval rather than acceptance.')},
 'components.RequestStatus.SoftwareRequests.progress': {
  'zh_Hans': ('{percent}% 已下载','correction','Retain the percent sign and express the downloaded amount naturally.'),
  'hi': ('{percent}% डाउनलोड हो चुका है','correction','Complete the phrase so it says the given percentage has been downloaded.'),
  'ja': ('{percent}% ダウンロード済み','correction','Keep the percent sign and express the completed download amount.'),
  'fr': ('{percent} % téléchargé','refinement','Apply French spacing before the percent sign.'),
  'ar': ('{percent}٪ تم تنزيله','correction','Retain the percentage and put it in a natural Arabic downloaded-progress phrase.'),
  'ko': ('{percent}% 다운로드됨','correction','Keep the percent sign and express the downloaded amount naturally.'),
  'zh_Hant': ('{percent}% 已下載','correction','Retain the percent sign and express the downloaded amount naturally.'),
  'vi': ('{percent}% đã tải xuống','correction','Move the percent sign next to the number and use natural Vietnamese word order.')},
 'components.RequestStatus.SoftwareRequests.quotaExceeded': {
  'es': ('Se ha alcanzado el límite de solicitudes de software.','refinement','Use the plural request limit that matches the feature.'),
  'zh_Hans': ('您的软件请求已达到限额。','correction','Remove the spaced punctuation and use a natural limit-reached message.'),
  'de': ('Das Limit für Ihre Softwareanfragen ist erreicht.','refinement','Replace the English loan phrase with a natural German limit message.'),
  'fr': ('Vous avez atteint votre limite de demandes de logiciels.','correction','Use a natural plural limit message rather than a singular request limit.'),
  'pt_BR': ('Você atingiu o limite de solicitações de software.','refinement','Use a more idiomatic verb and plural request wording.'),
  'ar': ('لقد بلغت الحد الأقصى لطلبات البرامج.','refinement','Use a concise, natural phrasing for reaching the request limit.')},
 'components.RequestStatus.SoftwareRequests.removeFromRequestsDescription': {
  'vi': ('Thao tác này xóa yêu cầu và lịch sử trạng thái đã lưu khỏi SeerrNG. Tác vụ tải xuống đã được chuyển cho ROMarrNG hoặc trình tải xuống vẫn tiếp tục; hãy hủy tại đó nếu bạn muốn dừng. SeerrNG sẽ ngừng hiển thị tiến độ và gửi cập nhật cho yêu cầu này. Nếu bạn yêu cầu lại cùng tiêu đề trước khi lượt tải này hoàn tất, một lượt tải thứ hai có thể bắt đầu. Phần mềm đã cài đặt sẽ không bị xóa.','correction','The current translation narrows the source’s generic title to a game title; keep the wording general.')}
}

def sha(data):
    return hashlib.sha256(data).hexdigest()
def dump_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def dump_jsonl(path, rows):
    path.write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n' for row in rows), encoding='utf-8')
def run(args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()
def live_pr():
    pr = json.loads(run(['gh','api','repos/snapetech-org/SeerrNG/pulls/418']))
    commit = json.loads(run(['gh','api',f'repos/snapetech-org/SeerrNG/git/commits/{EXPECTED_HEAD}']))
    return {'state':pr['state'],'draft':pr['draft'],'head':pr['head']['sha'],'headRef':pr['head']['ref'],'baseRef':pr['base']['ref'],'tree':commit['tree']['sha']}

def require(condition, message):
    if not condition:
        raise SystemExit('ABORT: ' + message)

require(run(['git','rev-parse','HEAD']) == EXPECTED_HEAD, 'worktree HEAD changed')
require(run(['git','rev-parse','HEAD^{tree}']) == EXPECTED_TREE, 'worktree tree changed')
require(run(['git','status','--porcelain=v1']) == '', 'worktree is not clean')
pr_start = live_pr()
require(pr_start['state'] == 'open' and pr_start['draft'] is True, 'live PR is no longer open/draft')
require(pr_start['head'] == EXPECTED_HEAD and pr_start['tree'] == EXPECTED_TREE, 'live PR head/tree changed')

catalog_dir = ROOT/'src/i18n/locale'
source_path = catalog_dir/'en.json'
source_bytes = source_path.read_bytes()
source_catalog = json.loads(source_bytes)
source_ids = sorted(source_catalog)
require(len(source_ids) == 9494, 'unexpected English key count')
require(source_ids[3199] == 'components.RequestStatus.SoftwareRequests.game', 'prior-window boundary does not match')
require(source_ids[3200] == 'components.RequestStatus.SoftwareRequests.history', 'next-window start does not match')
require(source_ids[3219] == 'components.RequestStatus.SoftwareRequests.removeFromRequestsTitle', 'next-window end does not match')
require(source_ids[3220].startswith('components.RequestStatus.'), 'next-window end boundary is unexpected')
selected = source_ids[RANGE[0]:RANGE[1]+1]
require(len(selected) == 20, 'selected window is not 20 source IDs')

prev_dir = ROOT/'docs/pr-evidence/pr418-localization-2026-11-03/window-3180-3199'
prev_readback = json.loads((prev_dir/'apply-readback.json').read_text(encoding='utf-8'))
prev_root_readme = (prev_dir/'README.md').read_text(encoding='utf-8')
require(prev_readback['appliedRows'] == 95 and prev_readback['allLocaleKeySetsMatchEnglish'], 'prior window apply readback incomplete')
require(prev_readback['unplannedValueChanges'] == 0 and prev_readback['sourceCurrentFinalHashMismatches'] == 0, 'prior window apply readback has mismatches')
require('Final dispositions: 145 accept-current, 69 corrections, 26 refinements, 0 holds.' in prev_root_readme, 'prior root adjudication completion marker missing')
require(run(['git','diff','--name-only','c4b1ca046',EXPECTED_HEAD]).startswith('docs/pr-evidence/'), 'post-apply head includes unexpected non-evidence changes')

catalogs = {}
locale_data = {}
for loc in ['en'] + LOCALES:
    path = catalog_dir/f'{loc}.json'
    raw = path.read_bytes()
    obj = json.loads(raw)
    catalogs[f'src/i18n/locale/{loc}.json'] = {'sha256':sha(raw),'keys':len(obj)}
    locale_data[loc] = obj
    require(set(obj) == set(source_ids), f'{loc} key set differs from English')

source_order_sha = sha('\n'.join(source_ids).encode('utf-8'))
caller_path = ROOT/'src/components/RequestStatus/SoftwareRequests.tsx'
caller_bytes = caller_path.read_bytes()
caller_sha = sha(caller_bytes)
caller_lines = caller_bytes.decode('utf-8').splitlines()

rows = []
summary = {'accept-current':0,'correction':0,'refinement':0,'hold':0}
changes_by_locale = {loc:0 for loc in LOCALES}
proposal_list = []
placeholder_re = re.compile(r'\{[^{}]+\}')
for position, key in enumerate(selected, start=RANGE[0]):
    source = source_catalog[key]
    for loc in LOCALES:
        current = locale_data[loc][key]
        proposal = CHANGES.get(key, {}).get(loc)
        if proposal:
            target, disposition, rationale = proposal
        else:
            target, disposition = current, 'accept-current'
            rationale = 'Current value preserves the source meaning in its caller context.'
        row = {
            'position':position,'id':key,'locale':loc,'source':source,'sourceSha256':sha(source.encode('utf-8')),
            'current':current,'currentSha256':sha(current.encode('utf-8')),
            'primaryDisposition':disposition,'proposedTarget':target,
            'proposedTargetSha256':sha(target.encode('utf-8')),'confidence':'moderate','rationale':rationale
        }
        require(isinstance(current,str) and current.strip(), f'empty current value: {loc} {key}')
        require(isinstance(target,str) and target.strip(), f'empty proposed value: {loc} {key}')
        require(set(placeholder_re.findall(source)) == set(placeholder_re.findall(target)), f'placeholder mismatch: {loc} {key}')
        for literal in ('SeerrNG','ROMarrNG','Linux','macOS'):
            if literal in source:
                require(literal in target, f'protected literal lost ({literal}): {loc} {key}')
        require(disposition in summary, f'unknown disposition: {disposition}')
        summary[disposition] += 1
        if disposition != 'accept-current':
            changes_by_locale[loc] += 1
            proposal_list.append(row)
        rows.append(row)

require(len(rows) == 240 and sum(summary.values()) == 240, 'cell count mismatch')
require(len(proposal_list) == sum(changes_by_locale.values()), 'proposal count mismatch')

# Pin the exact definitions, dispatches, and direct call sites in the caller file.
contexts = []
for key in selected:
    field = key.rsplit('.',1)[1]
    for i, line in enumerate(caller_lines, 1):
        role = None
        if re.search(r'\b'+re.escape(field)+r'\s*:', line):
            role = 'message-definition'
        if re.search(r'messages\.'+re.escape(field)+r'\b', line):
            role = 'message-use' if role is None else 'message-definition-and-use'
        if role:
            contexts.append({'id':key,'field':field,'file':'src/components/RequestStatus/SoftwareRequests.tsx','fileSha256':caller_sha,'line':i,'role':role,'context':'\n'.join(caller_lines[max(0,i-2):min(len(caller_lines),i+3)])})
    if field in {'pending','importing'}:
        for i,line in enumerate(caller_lines,1):
            if 'messages[status]' in line:
                contexts.append({'id':key,'field':field,'file':'src/components/RequestStatus/SoftwareRequests.tsx','fileSha256':caller_sha,'line':i,'role':'dynamic-status-label-dispatch','context':'\n'.join(caller_lines[max(0,i-2):min(len(caller_lines),i+3)])})

prior_sha = sha((prev_dir/'apply-readback.json').read_bytes())
prior = {'range':[3180,3199],'completed':True,'appliedRows':prev_readback['appliedRows'],'readbackSha256':prior_sha,'appliedAtCommit':'c4b1ca046','verification':'root adjudication and apply-readback record; source window follows immediately'}
caller_search_scope = 'Message definitions and direct named uses in SoftwareRequests.tsx, including status-label dispatch for pending/importing.'
source_boundaries = {
 'repository':REPO,'pullRequest':418,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,
 'englishKeyCount':len(source_ids),'sourceOrderSha256':source_order_sha,'range':RANGE,
 'selectedKeyCount':len(selected),'selectedCellCount':len(rows),'previousWindow':prior,
 'catalogs':catalogs,'callerFiles':{'src/components/RequestStatus/SoftwareRequests.tsx':{'sha256':caller_sha,'lineCount':len(caller_lines)}},
 'callerSearchScope':caller_search_scope
}
window = {
 'repository':REPO,'pullRequest':418,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,
 'sourceOrderCount':len(source_ids),'range':RANGE,'priorRange':[3180,3199],
 'sourceIds':[{'position':i,'id':key,'source':source_catalog[key],'sourceSha256':sha(source_catalog[key].encode('utf-8'))} for i,key in enumerate(selected,start=RANGE[0])],
 'catalogKeyCounts':{loc:len(locale_data[loc]) for loc in LOCALES},'localeOrder':LOCALES,
 'callerSearchScope':caller_search_scope
}
manifest = {
 'repository':REPO,'pullRequest':418,'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,
 'sourceOrderSha256':source_order_sha,'englishCatalogSha256':sha(source_bytes),'callerFileSha256':caller_sha,
 'range':RANGE,'localeOrder':LOCALES,'previousWindow':prior,
 'createdBy':'primary semantic review (machine-assisted)','nativeSpeakerApproval':False,
 'livePrStart':pr_start
}

# Exact final live check before writing the packet.
pr_end = live_pr()
require(pr_end == pr_start, 'live PR changed during packet preparation')
require(run(['git','rev-parse','HEAD']) == EXPECTED_HEAD and run(['git','rev-parse','HEAD^{tree}']) == EXPECTED_TREE, 'worktree changed during packet preparation')
manifest['livePrEnd'] = pr_end

summary_doc = {
 'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'range':RANGE,'sourceIds':len(selected),'cells':len(rows),
 'dispositions':summary,'changesByLocale':changes_by_locale,'proposalCount':len(proposal_list),
 'nativeSpeakerApproval':False
}
validation = {
 'result':'pass','head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'livePrMatches':True,
 'sourcePositions':[RANGE[0],RANGE[1]],'sourceOrderCount':len(source_ids),'sourceOrderSha256':source_order_sha,
 'reviewCells':len(rows),'uniqueCells':len({(r['id'],r['locale']) for r in rows}),
 'placeholderMismatches':0,'emptyTargets':0,'protectedLiteralMismatches':0,
 'catalogKeySetMismatches':0,'sourceCurrentTargetHashMismatches':0,
 'callerFileHashMatches':True,'priorWindowComplete':True,'priorAppliedRows':prev_readback['appliedRows'],
 'nativeSpeakerApproval':False,
 'checks':'Pinned open draft PR and worktree head/tree; sorted source window and adjacent completed boundary; exact English/locale/caller file hashes; 240 unique nonempty cells; exact source/current/proposed UTF-8 hashes; placeholder parity; protected literal retention.'
}

# Write only to this task's scratch directory.
dump_json(OUT/'window.json',window)
dump_json(OUT/'manifest.json',manifest)
dump_json(OUT/'summary.json',summary_doc)
dump_json(OUT/'source-boundaries.json',source_boundaries)
dump_jsonl(OUT/'source-current-cells.jsonl',rows)
dump_jsonl(OUT/'primary-decisions.jsonl',rows)
dump_json(OUT/'candidate-proposals.json',{'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'range':RANGE,'proposals':proposal_list})
dump_jsonl(OUT/'caller-contexts.jsonl',contexts)
dump_json(OUT/'validation.json',validation)
readme = f'''# SeerrNG PR #418 primary semantic review — W3200–W3219\n\nThis packet covers sorted English source positions 3200–3219 (20 IDs, 240 locale cells) at exact PR head `{EXPECTED_HEAD}` / tree `{EXPECTED_TREE}`. The English key set contains {len(source_ids):,} keys; all 12 target catalogs have identical key sets. The previous window W3180–W3199 was completed and applied in `c4b1ca046`; its pinned apply-readback records 95 applied rows with no hash or unplanned-change mismatches.\n\nPrimary dispositions: {summary['accept-current']} accept-current, {summary['correction']} corrections, {summary['refinement']} refinements, {summary['hold']} holds. {len(proposal_list)} target proposals are pinned to exact source and current-value hashes. Caller definitions and named uses were captured from `src/components/RequestStatus/SoftwareRequests.tsx` (SHA-256 `{caller_sha}`).\n\nThis is machine-assisted primary review and does not establish native-speaker approval. No repository or PR files were changed; no tests, builds, scans, CI, or browser actions were run. Packet files were written only to task scratch.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
files = sorted(p for p in OUT.iterdir() if p.is_file() and p.name != 'SHA256SUMS.txt')
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in files),encoding='utf-8')
print(json.dumps({'out':str(OUT),'sourceIds':len(selected),'cells':len(rows),'dispositions':summary,'proposals':len(proposal_list),'changesByLocale':changes_by_locale,'callerContexts':len(contexts),'pr':pr_end,'sourceOrderSha256':source_order_sha,'callerSha256':caller_sha},ensure_ascii=False,indent=2))
