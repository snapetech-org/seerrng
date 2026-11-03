from __future__ import annotations
import collections, hashlib, json
from pathlib import Path

input_dir=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3500-3519-candidate-free-20261103/candidate-free-input')
out=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3500-3519-independent-blind-20261103')
head='9bb8fd4695b207165e4bb8e56c5239eb50cee37c'
tree='74a4b0208108be4bc593c63c8ac55b4a2df74862'

def sha(b:bytes)->str: return hashlib.sha256(b).hexdigest()
def text_sha(s:str)->str: return sha(s.encode('utf-8'))
def jline(obj)->str: return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'))

targets={}
def put(position,disposition,rationale,locale_targets):
    for locale,target in locale_targets.items(): targets[(position,locale)]=(disposition,target,rationale)

put(3505,'refinement','This is a retry button. Use concise, polite/natural action wording rather than a casual command.',{
'hi':'फिर से कोशिश करें','fr':'Réessayer','vi':'Thử lại'})
put(3508,'refinement','Improve the unavailable-state wording; Traditional Chinese also has an unwanted space before terminal punctuation and should use the catalog’s preferred search term.',{
'zh_Hant':'目前無法搜尋。','vi':'Hiện không thể tìm kiếm.'})
put(3509,'correction','The direct helper sentence needs to say the catalog cannot be accessed; current wording is a literal passive calque or unnatural reachability phrase.',{
'es':'No se pudo acceder al catálogo. Inténtalo de nuevo.',
'fr':"Impossible d'accéder au catalogue. Réessaie.",
'hi':'कैटलॉग तक पहुँच नहीं हो सकी। फिर से कोशिश करें।',
'pt_BR':'Não foi possível acessar o catálogo. Tente novamente.',
'id':'Katalog tidak dapat diakses. Coba lagi.'})
put(3513,'refinement','This is the media-type category label. Brazilian Portuguese “Programas” is broader than software; the established technical loanword is more precise.',{'pt_BR':'Software'})
put(3514,'refinement','This is a filter section label. Use idiomatic Indonesian “Sort by” wording.',{'id':'Urutkan berdasarkan'})
put(3515,'correction','Traditional Chinese Sports must use traditional script; current 体育 contains simplified 体.',{'zh_Hant':'體育'})
put(3518,'correction','CertificationSelector uses country-specific media content classifications/age ratings, not personal certificates. Make the loading failure refer to those classification values.',{
'es':'No se pudieron cargar las clasificaciones.',
'vi':'Không thể tải thông tin phân loại độ tuổi.',
'id':'Gagal memuat klasifikasi usia.'})

assert out.exists() and [x.name for x in out.iterdir()]==['build_blind_review.py'], list(out.iterdir())
subprocess_result=__import__('subprocess').run(['sha256sum','-c','SHA256SUMS.txt'],cwd=input_dir,capture_output=True,text=True)
assert subprocess_result.returncode==0,subprocess_result.stderr
window=json.loads((input_dir/'window.json').read_text(encoding='utf-8'))
source_rows=[json.loads(line) for line in (input_dir/'source-cells.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
current_rows=[json.loads(line) for line in (input_dir/'current-target-cells.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
contexts=[json.loads(line) for line in (input_dir/'caller-contexts.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
blocks=[json.loads(line) for line in (input_dir/'caller-context-blocks.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
assert window['head']==head and window['tree']==tree and len(source_rows)==20 and len(current_rows)==240
source_by_position={r['position']:r for r in source_rows}
context_by_position={r['position']:r for r in contexts}
block_by_id={r['contextId']:r for r in blocks}
ledger=[]
for r in current_rows:
    key=(r['position'],r['locale'])
    if key in targets: disposition,target,rationale=targets[key]
    else:
        disposition='accept-current';target=r['currentTarget']
        rationale='Current translation accurately conveys the source in its pinned direct caller context and preserves required terminology and punctuation.'
    assert disposition in {'accept-current','correction','refinement'}
    assert r['placeholderTokenSequenceMatches'] and r['placeholderTokenSetMatchesSource']
    source=source_by_position[r['position']]; context=context_by_position[r['position']]
    assert r['sourceId']==source['sourceId'] and r['source']==source['source']
    ledger.append({
      'head':head,'tree':tree,'pullRequest':418,'window':'W3500-W3519','position':r['position'],
      'sourceId':r['sourceId'],'sourceKey':r['sourceKey'],'source':r['source'],'sourceSha256':r['sourceSha256'],
      'locale':r['locale'],'localeTag':r['localeTag'],'catalogPath':r['catalogPath'],
      'catalogSha256':r['catalogSha256'],'catalogGitBlob':r['catalogGitBlob'],
      'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetSha256'],
      'recommendedDisposition':disposition,'recommendedTarget':target,
      'recommendedTargetSha256':text_sha(target),'changeFromCurrent':target!=r['currentTarget'],
      'selectedForApplication':False,'sourcePlaceholders':r['sourcePlaceholders'],
      'currentTargetPlaceholders':r['currentTargetPlaceholders'],
      'placeholderTokenSequenceMatches':r['placeholderTokenSequenceMatches'],
      'placeholderTokenSetMatchesSource':r['placeholderTokenSetMatchesSource'],
      'namespace':context['namespace'],'callerCount':context['callerCount'],
      'contextBlockIds':context['contextBlockIds'],
      'callerBlockSha256':[sha(jline(block_by_id[x]).encode('utf-8')) for x in context['contextBlockIds']],
      'rationale':rationale,'inputRowSha256':sha(jline(r).encode('utf-8'))
    })
counts=collections.Counter(r['recommendedDisposition'] for r in ledger)
assert len(ledger)==240 and len({(r['position'],r['locale']) for r in ledger})==240
assert all(r['callerCount']>0 for r in ledger)
assert all(r['placeholderTokenSequenceMatches'] and r['placeholderTokenSetMatchesSource'] for r in ledger)
assert sum(r['changeFromCurrent'] for r in ledger)==sum(counts[d] for d in ('correction','refinement'))

out.mkdir(parents=True,exist_ok=True)
ledger_path=out/'blind-decisions.jsonl'
ledger_path.write_text(''.join(jline(x)+'\n' for x in ledger),encoding='utf-8')
input_sha=sha((input_dir/'SHA256SUMS.txt').read_bytes())
summary={'schemaVersion':1,'reviewer':'independent blind machine review','repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3500-W3519','head':head,'tree':tree,'candidateFreeInputSha256':input_sha,'sourceCount':20,'localeCount':12,'cellCount':240,'callerlessRows':0,'placeholderMismatches':0,'dispositions':dict(sorted(counts.items())),'recommendedChangedCells':sum(r['changeFromCurrent'] for r in ledger),'recommendationsSelectedForApplication':0,'qualifiedNativeSpeakerApproval':False,'exactHeadBrowserReview':False,'releaseApproved':False}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'provenance.json').write_text(json.dumps({'reviewMethod':'independent blind target review from checksummed candidate-free input; no primary review consulted','inputDirectory':str(input_dir),'inputManifestSha256':input_sha,'head':head,'tree':tree,'sealedBeforePrimaryReviewCompletion':True,'pinnedCallerBlocksReviewed':40,'candidateFreeInputOnly':True},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'README.md').write_text(f'''# SeerrNG PR #418 W3500–W3519 independent blind review\n\nThis packet independently reviews 20 source IDs × 12 locales (240 cells) at exact head `{head}` / tree `{tree}`. It was produced from the checksummed candidate-free packet at `{input_dir}` before reading the primary review. All 20 IDs have pinned direct callers and all placeholder checks passed.\n\nThe ledger records current and recommended targets, hashes, caller block pins, dispositions, and rationales. No recommendations are selected for application; a separate cross-audit must reconcile them with the primary review.\n\nDisposition counts: {dict(sorted(counts.items()))}. Recommended changed cells: {summary['recommendedChangedCells']}. Qualified native-speaker approval and exact-head browser acceptance are not established. This packet does not approve a release.\n''',encoding='utf-8')
seal={'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3500-W3519','head':head,'tree':tree,'candidateFreeInputSha256':input_sha,'blindLedgerSha256':sha(ledger_path.read_bytes()),'cellCount':240,'dispositionCounts':dict(sorted(counts.items())),'recommendedChangedCells':summary['recommendedChangedCells'],'primaryReviewNotConsulted':True}
(out/'blind-seal.json').write_text(json.dumps(seal,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
files=sorted(x for x in out.rglob('*') if x.is_file() and x!=out/'SHA256SUMS.txt')
(out/'SHA256SUMS.txt').write_text(''.join(f'{sha(x.read_bytes())}  {x.relative_to(out).as_posix()}\n' for x in files),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,sort_keys=True))
