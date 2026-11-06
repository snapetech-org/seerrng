#!/usr/bin/env python3
"""Build a sealed independent blind ledger from the pinned candidate-free cells."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3440-3459-independent-blind-20261103')
INPUT = ROOT / 'input'
OUT = ROOT / 'review'
EXPECTED_HEAD = '049b23526911e6cf6b1a0b2c397d155eb51d5ddf'
EXPECTED_TREE = '0a83d4f6bcea1367f218efb3898b15d2b0f4f140'
LOCALE_ORDER = ['es', 'zh_Hans', 'hi', 'de', 'ja', 'fr', 'pt_BR', 'ar', 'ko', 'zh_Hant', 'vi', 'id']
rows = [json.loads(line) for line in (INPUT / 'current-target-cells.jsonl').read_text().splitlines() if line]
assert len(rows) == 240
assert {row['head'] for row in rows} == {EXPECTED_HEAD}
assert {row['tree'] for row in rows} == {EXPECTED_TREE}
assert {row['window'] for row in rows} == {'W3440-W3459'}
assert {row['position'] for row in rows} == set(range(3440, 3460))
assert {row['locale'] for row in rows} == set(LOCALE_ORDER)
assert len({(row['sourceId'], row['locale']) for row in rows}) == 240

# Corrections are clear semantic errors. Refinements preserve meaning while improving
# idiom or exact relationship to the caller. Existing values remain unchanged elsewhere.
proposals = {
    (3443, 'zh_Hant'): ('correction', '體育', 'The target uses Simplified Chinese characters in the Traditional Chinese catalog; use the Traditional form for the same sports media category.'),
    (3444, 'zh_Hant'): ('correction', '體育', 'The target uses Simplified Chinese characters in the Traditional Chinese catalog; use the Traditional form for the sports-league filter label.'),
    (3453, 'es'): ('correction', 'Seleccionar usuario', 'The current phrase omits the article after the formal imperative. This concise infinitive fits the Select control label and is grammatical.'),
    (3454, 'pt_BR'): ('correction', 'Ver todo o histórico', 'For request history, Portuguese uses histórico; história means a story and changes the UI meaning.'),
    (3455, 'de'): ('correction', 'Entfernen Sie den Zeitraumfilter, um ältere Anfragen einzuschließen. Alle anderen Filter bleiben unverändert.', 'Anforderungen means requirements rather than user requests. Anfragen matches the Requests page terminology; Zeitraumfilter is idiomatic.'),
    (3455, 'ko'): ('correction', '기간 필터를 제거하면 더 오래된 요청도 포함됩니다. 다른 필터는 그대로 유지됩니다.', '시간 기간 redundantly says time period. 기간 필터 is idiomatic for the UI control and the conditional sentence expresses the source action clearly.'),
    (3450, 'hi'): ('refinement', 'ट्रैक की संख्या', 'The existing literal compound is understandable; this phrasing is the more idiomatic Hindi label for a track count.'),
    (3451, 'es'): ('refinement', 'No disponible', 'Spanish sentence case lowercases the adjective in this status label; meaning is already correct.'),
    (3455, 'pt_BR'): ('refinement', 'Remova o filtro de período para incluir solicitações mais antigas. Os demais filtros permanecem inalterados.', 'Período identifies the time-range filter more precisely than the broader filtro de tempo; the rest is correct.'),
    (3455, 'ar'): ('refinement', 'أزل عامل تصفية الفترة الزمنية لتضمين الطلبات الأقدم. وتبقى بقية عوامل التصفية كما هي.', 'The current مصدر-style removal wording is less natural for an instruction, and the filter noun is clearer as عامل تصفية; the meaning is retained.'),
    (3456, 'zh_Hans'): ('refinement', '管理员设置的剧集队列 · {count, plural, other {# 集}}', '剧集排队 reads as the act of queuing rather than the Episode Queue feature; this uses the established noun 剧集队列 and keeps the administrator attribution and ICU count.'),
    (3457, 'ja'): ('refinement', '自動でキューに追加済み', 'The existing katakana phrase describes auto-queuing as a process; this makes the completed Auto-Queued state explicit.'),
    (3459, 'de'): ('refinement', 'Autor', 'The current Schriftsteller is narrower and suggests a literary writer. Autor is broader across the mixed media types in Requests and matches the nearby sort label.'),
}
held_ids = {'components.Requests.statusUpdated'}
ledger=[]
for row in sorted(rows, key=lambda r:(r['position'], LOCALE_ORDER.index(r['locale']))):
    key=(row['position'],row['locale'])
    if row['sourceId'] in held_ids:
        disposition='hold'; candidate=None
        rationale='The exact pinned Requests component has no direct, statically mapped, or dynamic renderer reference for this source ID. Preserve the current catalog value until a production caller is established.'
        confidence='high for the pinned no-caller finding; language quality is not being adjudicated for this cell'
    elif key in proposals:
        disposition,candidate,rationale=proposals[key]
        confidence='moderate'
    else:
        disposition='accept-current'; candidate=None
        rationale='The current value conveys the source meaning in the pinned Requests UI context; no material semantic or structural defect was identified.'
        confidence='moderate'
    ledger.append({
        'schemaVersion':1,
        'reviewType':'independent-blind-semantic-review',
        'repository':row['repository'],'pullRequest':row['pullRequest'],'window':row['window'],
        'head':row['head'],'tree':row['tree'],'position':row['position'],'sourceId':row['sourceId'],
        'sourceKey':row['sourceKey'],'source':row['source'],'sourceSha256':row['sourceSha256'],
        'locale':row['locale'],'localeTag':row['localeTag'],'catalogPath':row['catalogPath'],
        'catalogSha256':row['catalogSha256'],'catalogGitBlob':row['catalogGitBlob'],
        'currentTarget':row['currentTarget'],'currentTargetSha256':row['currentTargetSha256'],
        'sourceIcuArgumentNames':row['sourceIcuArgumentNames'],
        'currentTargetIcuArgumentNames':row['currentTargetIcuArgumentNames'],
        'icuArgumentSetMatchesSource':row['icuArgumentSetMatchesSource'],
        'icuArgumentSequenceMatches':row['icuArgumentSequenceMatches'],
        'disposition':disposition,'proposedTarget':candidate,'rationale':rationale,'confidence':confidence,
        'callerEvidence':'caller-resolution-findings.json; source ID has zero resolved references in pinned Requests component' if row['sourceId'] in held_ids else 'caller-contexts.jsonl and caller-context-blocks.jsonl',
        'nativeSpeakerApproval':False,
    })
assert sum(1 for row in ledger if row['disposition']=='hold') == 12
assert sum(1 for row in ledger if row['disposition']=='correction') == 6
assert sum(1 for row in ledger if row['disposition']=='refinement') == 7
assert sum(1 for row in ledger if row['disposition']=='accept-current') == 215
assert all(row['icuArgumentSetMatchesSource'] and row['icuArgumentSequenceMatches'] for row in rows)
outfile=OUT/'blind-ledger.jsonl'
outfile.write_text(''.join(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n' for row in ledger))
counts=Counter(row['disposition'] for row in ledger)
proposal_summary={}
for row in ledger:
    if row['proposedTarget'] is not None:
        proposal_summary.setdefault(str(row['position']),[]).append({'sourceId':row['sourceId'],'locale':row['locale'],'disposition':row['disposition'],'currentTarget':row['currentTarget'],'proposedTarget':row['proposedTarget']})
summary={
    'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3440-W3459',
    'head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'candidateFreeManifestSha256':'c51bba771da7be6d11f7372190be491ac09531dc98fcde2381e6ae66a7315db4',
    'reviewedCells':len(ledger),'sourceCount':20,'localeCount':12,'dispositionCounts':dict(sorted(counts.items())),
    'holdsBySourceId':{'components.Requests.statusUpdated':12},
    'proposalsByPosition':proposal_summary,
    'structuralChecks':{'cells':len(rows),'icuArgumentSetMismatches':0,'icuArgumentSequenceMismatches':0,'protectedLiteralMismatches':0},
    'reviewLimit':'Independent machine-assisted semantic review; not native-speaker approval.'
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps({'ledgerRows':len(ledger),'counts':dict(counts),'ledgerSha256':hashlib.sha256(outfile.read_bytes()).hexdigest()},indent=2))
