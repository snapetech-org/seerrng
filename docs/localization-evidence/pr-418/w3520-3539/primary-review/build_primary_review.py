import collections, datetime, hashlib, json, pathlib, re, shutil
ROOT = pathlib.Path('/mnt/disks/scratch/task-scratch')
INPUT = ROOT / 'seerrng-pr418-w3520-3539-candidate-free-20261103' / 'candidate-free-input'
OUT = ROOT / 'seerrng-pr418-w3520-3539-primary-review-20261103'
assert not OUT.exists(), f'refusing to overwrite {OUT}'
changes = {
    (3522,'es'): ('correction','Seleccione una clasificación','The caller selects a film age classification; clasificación names that classification directly, while certificación suggests a certificate.'),
    (3522,'fr'): ('correction','Sélectionner une classification','The caller selects a film age classification; classification is the natural French term for this UI control.'),
    (3522,'vi'): ('correction','Chọn phân loại độ tuổi','The caller selects a film age classification; chứng nhận means a certificate and misses that meaning.'),
    (3522,'id'): ('correction','Pilih klasifikasi usia','The caller selects an age classification; sertifikasi means certification rather than the film rating category.'),
    (3524,'hi'): ('correction','खोजने के लिए टाइप करना शुरू करें।','The current Hindi reads as a noun-like instruction fragment; this imperative clearly tells the user to start typing to search.'),
    (3524,'zh_Hans'): ('correction','开始输入以搜索。','Remove the stray space before the full stop and use a natural search instruction.'),
    (3524,'zh_Hant'): ('correction','開始輸入以搜尋。','Remove the stray space before the full stop and use a natural Traditional Chinese search instruction.'),
    (3525,'zh_Hans'): ('refinement','所有可用的服务提供商均已选中。','服务提供商 names the streaming-provider concept more clearly than the generic 提供者.'),
    (3525,'ar'): ('correction','تم اختيار جميع مزوّدي الخدمة المتاحين بالفعل.','The revision gives the masculine plural provider adjective the matching form and keeps the already-selected meaning.'),
    (3529,'ja'): ('correction','放送終了','This is the ended TV-series status; 放送終了 distinguishes an ended broadcast from generic completion.'),
    (3529,'fr'): ('refinement','Terminée','The status labels a series, a feminine noun in French; remove the parenthetical gender form from this fixed UI value.'),
    (3530,'zh_Hans'): ('correction','制作中','This TV-series status means production is under way; 制作中 avoids reading 在生产中 as industrial production.'),
    (3530,'zh_Hant'): ('correction','製作中','Use the Traditional Chinese character 製 and a natural in-production status label.'),
    (3530,'vi'): ('correction','Đang sản xuất','The current phrase is a literal fragment; Đang sản xuất clearly expresses that production is ongoing.'),
    (3531,'id'): ('correction','Tidak ada penyedia yang tersedia di wilayah ini.','The current Indonesian repeats tersedia without a relative marker; this natural sentence says no providers are available in this region.'),
    (3532,'hi'): ('correction','वर्तमान में कोई प्रदाता चयनित नहीं है।','The current Hindi says that providers are not being selected; this states that none are currently selected.'),
    (3532,'zh_Hans'): ('correction','目前未选择任何服务提供商。','Clarify the none-selected state and identify the streaming providers rather than a generic provider.'),
    (3532,'zh_Hant'): ('correction','目前未選擇任何服務提供者。','Remove the stray space before punctuation, clarify the none-selected state, and keep the Traditional Chinese form.'),
    (3532,'vi'): ('refinement','Hiện chưa có nhà cung cấp nào được chọn.','This makes the current none-selected state explicit in natural Vietnamese.'),
    (3533,'ar'): ('correction','لا توجد نتائج','Use the feminine verb form with the Arabic plural noun نتائج.'),
    (3535,'ja'): ('correction','計画中','The status is planned, not already planned; 計画中 preserves the ongoing/planned state.'),
    (3535,'vi'): ('refinement','Dự kiến','This concise status label means planned or expected; the current wording reads as an already completed planning action.'),
    (3535,'zh_Hant'): ('correction','計劃中','Replace the Simplified Chinese character 计 with Traditional 計 and state the planned status naturally.'),
    (3536,'fr'): ('correction','Série en cours','Série de retour is a literal calque; Série en cours is the natural status for an active returning series.'),
}

def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode('utf-8'))
def load_json(path): return json.loads(path.read_text(encoding='utf-8'))
manifest = load_json(INPUT/'manifest.json')
assert manifest['head']=='265171657d48ef56ee81cc1c6a5c3d07abe5d07e'
assert manifest['tree']=='402984893883cf7afd106cd208f6027d7410f2fb'
assert manifest['window']=='W3520-W3539' and manifest['cellCount']==240
checksum_list_sha=sha((INPUT/'SHA256SUMS.txt').read_bytes())
manifest_sha=sha((INPUT/'manifest.json').read_bytes())
assert checksum_list_sha=='2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d'
assert manifest_sha=='9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63'
source_rows=[load_json(pathlib.Path('/dev/null'))] if False else [json.loads(x) for x in (INPUT/'source-cells.jsonl').read_text(encoding='utf-8').splitlines()]
current_rows=[json.loads(x) for x in (INPUT/'current-target-cells.jsonl').read_text(encoding='utf-8').splitlines()]
caller_rows=[json.loads(x) for x in (INPUT/'caller-contexts.jsonl').read_text(encoding='utf-8').splitlines()]
source_by_pos={r['position']:r for r in source_rows}
caller_by_pos={r['position']:r for r in caller_rows}
assert len(source_by_pos)==20 and len(current_rows)==240 and len(caller_by_pos)==20
assert all(caller_by_pos[p]['callerCount']>0 for p in caller_by_pos)
locale_info={x['catalogKey']:x for x in load_json(INPUT/'window.json')['localeInfo']}
placeholder_re=re.compile(r'\{([A-Za-z_][A-Za-z0-9_]*)\}')
ledger=[]; selected=[]
for item in current_rows:
    position=item['position']; locale=item['locale']; source=source_by_pos[position]; caller=caller_by_pos[position]
    key=(position,locale); current=item['currentTarget']
    if key in changes:
        disposition,final_target,rationale=changes[key]
        assert final_target!=current
        selected.append({'position':position,'locale':locale,'sourceId':item['sourceId'],'currentTarget':current,'currentTargetSha256':item['currentTargetSha256'],'target':final_target,'targetSha256':shat(final_target),'disposition':disposition,'rationale':rationale})
        confidence='moderate'
    else:
        disposition='accept-current'; final_target=current
        rationale=f"The current {locale} value accurately conveys the English source for its pinned direct caller and works in this selector or status-label context. No caller, placeholder, script, or clear language issue requires changing the existing value."
        confidence='moderate'
    source_tokens=placeholder_re.findall(source['source'])
    current_tokens=placeholder_re.findall(current)
    final_tokens=placeholder_re.findall(final_target)
    assert current_tokens==source_tokens and final_tokens==source_tokens,(position,locale)
    locale_meta=locale_info[locale]
    caller_summary={'callerCount':caller['callerCount'],'callerResolution':caller['callerResolution'],'contextBlockIds':caller['contextBlockIds'],'directMessageReferences':caller['directMessageReferences'],'namespace':caller['namespace'],'sameNamespace':True}
    ledger.append({'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3520-W3539','head':item['head'],'tree':item['tree'],'position':position,'sourceId':item['sourceId'],'sourceKey':item['sourceKey'],'source':item['source'],'sourceSha256':item['sourceSha256'],'catalogPath':item['catalogPath'],'locale':locale,'localeTag':item['localeTag'],'direction':locale_meta['direction'],'reviewStatus':locale_meta['reviewStatus'],'disposition':disposition,'currentTarget':current,'currentTargetSha256':item['currentTargetSha256'],'finalTarget':final_target,'finalTargetSha256':shat(final_target),'confidence':confidence,'rationale':rationale,'callerContext':caller_summary,'namespacePreserved':True,'placeholderTokenChecks':{'sourceTokens':source_tokens,'currentTargetTokens':current_tokens,'finalTargetTokens':final_tokens,'currentSequenceMatchesSource':item['placeholderTokenSequenceMatches'],'currentSetMatchesSource':item['placeholderTokenSetMatchesSource'],'finalSequenceMatchesSource':final_tokens==source_tokens,'finalSetMatchesSource':sorted(final_tokens)==sorted(source_tokens)}})
assert len(ledger)==240 and len(selected)==24
counts=collections.Counter(x['disposition'] for x in ledger)
reviewed_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
OUT.mkdir(parents=True)
(OUT/'primary-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in ledger),encoding='utf-8')
(OUT/'selected-direct-locale-cells.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in selected),encoding='utf-8')
summary={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3520-W3539','head':manifest['head'],'tree':manifest['tree'],'candidateFreeManifestJsonSha256':manifest_sha,'candidateFreeChecksumListSha256':checksum_list_sha,'sourceIds':20,'locales':12,'cells':240,'dispositions':dict(counts),'proposedChanges':len(selected),'callerlessHolds':0,'placeholderMismatches':0,'nativeSpeakerApproval':False,'exactHeadBrowserReview':False,'reviewedAtUTC':reviewed_at}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
provenance={'schemaVersion':1,'reviewType':'primary-semantic-review','reviewer':'root','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3520-W3539','head':manifest['head'],'tree':manifest['tree'],'candidateFreeInputDirectory':str(INPUT),'candidateFreeManifestJsonSha256':manifest_sha,'candidateFreeChecksumListSha256':checksum_list_sha,'candidateFreeManifestJsonBytes':(INPUT/'manifest.json').stat().st_size,'candidateFreeChecksumListBytes':(INPUT/'SHA256SUMS.txt').stat().st_size,'candidateFreeInputManifestLineage':'manifest JSON and SHA256SUMS list are distinct files and separately hashed','reviewedAtUTC':reviewed_at,'cellCount':len(ledger),'selectedChangeCount':len(selected),'callerlessHolds':0,'qualifiedNativeSpeakerApproval':False,'exactHeadBrowserReview':False}
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
readme=f"""Primary semantic review for SeerrNG PR #418 W3520–W3539, pinned to {manifest['head']} / tree {manifest['tree']}.

The review covers 240 current target cells across 12 direct locales. All 20 source IDs have pinned direct caller references. Decisions are {counts['accept-current']} accept-current, {counts['correction']} corrections, and {counts['refinement']} refinements; no cells were held. The 24 selected changes retain exact placeholder tokens and all current source context. This machine review is not qualified native-speaker approval and is not exact-head browser acceptance.

Candidate-free lineage is explicit: manifest JSON SHA-256 `{manifest_sha}`; checksum-list SHA-256 `{checksum_list_sha}`. The two hashes identify separate files. See `primary-ledger.jsonl` for all cell dispositions and `selected-direct-locale-cells.jsonl` for proposed changes.
"""
(OUT/'README.md').write_text(readme,encoding='utf-8')
shutil.copy2(pathlib.Path(__file__),OUT/'build_primary_review.py')
verify_script=r'''import collections,hashlib,json,pathlib
root=pathlib.Path(__file__).resolve().parent
inp=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3520-3539-candidate-free-20261103/candidate-free-input')
def sha(b):return hashlib.sha256(b).hexdigest()
manifest=json.loads((inp/'manifest.json').read_text())
assert sha((inp/'manifest.json').read_bytes())=='9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63'
assert sha((inp/'SHA256SUMS.txt').read_bytes())=='2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d'
ledger=[json.loads(x) for x in (root/'primary-ledger.jsonl').read_text().splitlines()]
selected=[json.loads(x) for x in (root/'selected-direct-locale-cells.jsonl').read_text().splitlines()]
assert len(ledger)==240 and len({(x['position'],x['locale']) for x in ledger})==240
counts=collections.Counter(x['disposition'] for x in ledger)
assert counts=={'accept-current':216,'correction':20,'refinement':4}
assert len(selected)==24
for row in ledger:
 assert row['head']==manifest['head'] and row['tree']==manifest['tree']
 assert row['callerContext']['callerCount']>0
 assert row['placeholderTokenChecks']['currentSequenceMatchesSource'] and row['placeholderTokenChecks']['finalSequenceMatchesSource']
 assert sha(row['finalTarget'].encode())==row['finalTargetSha256']
print(json.dumps({'result':'PASS','cells':len(ledger),'dispositions':dict(counts),'selected':len(selected),'callerlessHolds':0}))
'''
(OUT/'verify_primary_review.py').write_text(verify_script,encoding='utf-8')
# Verify exact candidate-free cell/source/caller joins before finalizing this packet.
source_map={r['position']:r for r in source_rows}
current_map={(r['position'],r['locale']):r for r in current_rows}
for row in ledger:
    cur=current_map[(row['position'],row['locale'])]
    assert row['sourceId']==cur['sourceId'] and row['source']==cur['source'] and row['currentTarget']==cur['currentTarget']
    assert row['callerContext']['contextBlockIds']==caller_by_pos[row['position']]['contextBlockIds']
subprocess_result=__import__('subprocess').run(['python3',str(OUT/'verify_primary_review.py')],check=True,capture_output=True,text=True)
print(subprocess_result.stdout.strip())
lines=[]
for path in sorted(OUT.iterdir()):
    if path.is_file() and path.name!='SHA256SUMS.txt': lines.append(f'{sha(path.read_bytes())}  {path.name}')
(OUT/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'head':manifest['head'],'tree':manifest['tree'],'cells':len(ledger),'dispositions':dict(counts),'selected':len(selected),'candidateFreeManifestJsonSha256':manifest_sha,'candidateFreeChecksumListSha256':checksum_list_sha,'primarySha256SumsSha256':sha((OUT/'SHA256SUMS.txt').read_bytes())},ensure_ascii=False,indent=2))
