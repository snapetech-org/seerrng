#!/usr/bin/env python3
"""Build the hash-bound independent semantic second-opinion ledger."""
from __future__ import annotations
import collections, hashlib, json, sys
from pathlib import Path

TASK=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-parity-43-post-w4000-20261105')
OUT=TASK/'second-opinion'
PACKET=TASK/'cross-review-sealed'
CF=TASK/'candidate-free'
sys.path.insert(0,str(TASK/'cross-review'/'locale-c'))
import build_cross_review as util

ADJUSTMENTS={
 'components.CollectionQueue.buffer::ar':(
  'أفلام تسبق الطلب في قائمة الانتظار',
  'The caller is the collection-queue buffer selector. The recommendation means upcoming movies; this label must describe movies ahead in the queue.'),
 'components.CollectionQueue.description::id':(
  'Minta film dalam koleksi ini sesuai urutan rilis, dengan mempertahankan satu atau dua film yang belum ditonton di depan. Pengaturan ini menggunakan akun dan setelan permintaan standar Anda. Permintaan berikutnya tetap memerlukan izin, kuota, dan persetujuan. Film yang sudah diminta juga dihitung dalam jumlah tersebut.',
  'The paragraph preserves the release-order, unwatched buffer, account defaults, permission/quota/approval, and existing-request clauses. “Jumlah tersebut” is more natural Indonesian for the already described count than the untranslated “buffer”.'),
 'components.CollectionQueue.request-cancelled::hi':(
  'कतार का पहले का अनुरोध गायब है या बीच में रुक गया। छूटी हुई फ़िल्मों का फिर से अनुरोध करने के लिए कतार फिर से शुरू करें।',
  'The source asks users to restart the queue. “फिर से शुरू करें” is natural Hindi and consistent with the Start Queue control; the recommendation transliterates “restart”.'),
 'components.CollectionQueue.request-cancelled::id':(
  'Permintaan antrean sebelumnya tidak ditemukan atau terhenti. Mulai ulang antrean untuk meminta kembali film yang belum masuk antrean.',
  '“Film yang belum ada” can mean unavailable or nonexistent movies. The caller meaning is movies missing from the queue, so “belum masuk antrean” is precise.'),
 'components.RequestModal.watchAheadActiveForRequest::ar':(
  'يُبقي هذا الطلب {count} قبله في قائمة الانتظار.',
  'The production caller formats {count} as a localized episode label. This wording avoids repeating “episodes” and explicitly places them before this request in the queue.'),
 'components.RequestModal.watchAheadActiveForRequest::de':(
  'Diese Anfrage hält {count} vor sich in der Warteschlange.',
  'The production caller formats {count} as a localized episode label. This wording avoids repeating “episodes” and explicitly places them before this request in the queue.'),
 'components.RequestModal.watchAheadActiveForRequest::es':(
  'Esta solicitud mantiene {count} por delante en la cola.',
  'The production caller formats {count} as a localized episode label. This wording avoids repeating “episodes” and explicitly says they stay ahead in the queue.'),
 'components.RequestModal.watchAheadActiveForRequest::fr':(
  'Cette demande garde {count} devant elle dans la file.',
  'The production caller formats {count} as a localized episode label. This wording avoids repeating “episodes” and explicitly places them before this request in the queue.'),
 'components.RequestModal.watchAheadActiveForRequest::hi':(
  'यह अनुरोध {count} को अपने आगे कतार में रखता है।',
  'The production caller formats {count} as a localized episode label. This wording avoids repeating “episodes” and explicitly places them ahead of this request.'),
 'components.RequestModal.watchAheadActiveForRequest::id':(
  'Permintaan ini mempertahankan {count} di depannya dalam antrean.',
  'The production caller formats {count} as a localized episode label. This wording avoids repeating “episode” and explicitly places the count ahead of this request in the queue.'),
 'components.RequestModal.watchAheadActiveForRequest::ja':(
  'このリクエストでは、{count}を先行分としてキューに保持します。',
  'The production caller formats {count} as a localized episode label. This wording avoids adding a duplicate Japanese episode counter and retains the ahead-of-request meaning.'),
 'components.RequestModal.watchAheadActiveForRequest::ko':(
  '이 요청보다 앞서 {count}를 대기열에 유지합니다.',
  'The production caller formats {count} as a localized episode label. The recommendation adds a second episode unit; this wording avoids that duplication and keeps the relative queue position.'),
 'components.RequestModal.watchAheadActiveForRequest::pt-BR':(
  'Esta solicitação mantém {count} à sua frente na fila.',
  'The production caller formats {count} as a localized episode label. The recommendation repeats “episódios”; this wording avoids that duplication and makes the request-relative position explicit.'),
 'components.RequestModal.watchAheadActiveForRequest::vi':(
  'Yêu cầu này giữ {count} ở phía trước nó trong hàng đợi.',
  'The production caller formats {count} as a localized episode label. This wording keeps that unit intact and makes “ahead” relative to this request, rather than the front of the whole queue.'),
 'components.RequestModal.watchAheadActiveForRequest::zh-Hans':(
  '此请求会让 {count} 在队列中排在它前面。',
  'The production caller formats {count} as a localized episode label. This wording avoids adding an episode unit and makes the queue position relative to this request.'),
 'components.RequestModal.watchAheadActiveForRequest::zh-Hant':(
  '此請求會讓 {count} 在佇列中排在它前面。',
  'The production caller formats {count} as a localized episode label. This wording avoids adding an episode unit and makes the queue position relative to this request.'),
}

def sha(data):
    if isinstance(data,str): data=data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()

def raw_rows(path,key):
    rows={}; hashes={}
    for raw in path.read_bytes().splitlines():
        if not raw.strip(): continue
        item=json.loads(raw)
        k=item[key]
        if k in rows: raise ValueError(f'duplicate key {k}: {path}')
        rows[k]=item; hashes[k]=sha(raw)
    return rows,hashes

def main():
    manifest=json.loads((PACKET/'manifest.json').read_text())
    summary=json.loads((PACKET/'summary.json').read_text())
    cross,cross_raw=raw_rows(PACKET/'cross-ledger.jsonl','cellId')
    gaps,gap_raw=raw_rows(CF/'gap-cells.jsonl','cellId')
    changed,changed_raw=raw_rows(CF/'changed-source-cells.jsonl','cellId')
    contexts,context_raw=raw_rows(CF/'caller-contexts.jsonl','sourceId')
    cells={**gaps,**changed}; cell_raw={**gap_raw,**changed_raw}
    if len(cross)!=528 or set(cross)!=set(cells): raise SystemExit('input cell scope mismatch')
    if set(ADJUSTMENTS)-set(cross): raise SystemExit('adjustment cell missing')
    output=[]
    for cid in sorted(cross,key=lambda c:(cross[c]['sourcePosition'],cross[c]['locale'])):
        r=cross[cid]; c=cells[cid]; ctx=contexts[r['sourceId']]
        if r['callerContextEvidenceRowSha256']!=context_raw[r['sourceId']]: raise SystemExit('caller evidence binding mismatch '+cid)
        if r['candidateFreeCellSha256']!=cell_raw[cid]: raise SystemExit('candidate-free row binding mismatch '+cid)
        if r['sourceText']!=c.get('sourceText',c.get('currentEnglishSourceText')): raise SystemExit('source text mismatch '+cid)
        if r['sourceTextSha256']!=c.get('sourceTextSha256',c.get('currentEnglishSourceSha256')): raise SystemExit('source hash mismatch '+cid)
        if r['currentTarget']!=c['currentTarget'] or r['currentTargetSha256']!=c['currentTargetSha256']: raise SystemExit('current target mismatch '+cid)
        if r['callerContextSha256']!=ctx['callerContextSha256']: raise SystemExit('caller context digest mismatch '+cid)
        if cid in ADJUSTMENTS:
            target,reason=ADJUSTMENTS[cid]; disposition='adjust'
        else:
            target=r['recommendedTarget']; reason='Accepted after reviewing the candidate-free English source, pinned production caller, locale fit, placeholders/tokens, markup, numeric content, and protected literals.'; disposition='accept'
        checks=util.token_checks(r['sourceText'],target)
        if not checks['allMatch']: raise SystemExit('independent target token check failed '+cid+': '+json.dumps(checks,ensure_ascii=False))
        chosen={
          'schemaVersion':1,
          'prNumber':418,
          'headSha':manifest['exactHead'],'headTree':manifest['exactTree'],
          'baseSha':manifest['baseSha'],'baseTree':manifest['baseTree'],
          'cellId':cid,'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],
          'category':r['category'],'cellStatus':r['cellStatus'],
          'sourceIdSha256':r['sourceIdSha256'],'localeSha256':sha(r['locale']),
          'sourceText':r['sourceText'],'sourceTextSha256':r['sourceTextSha256'],
          'currentEnglishSourceText':r['currentEnglishSourceText'],
          'currentEnglishSourceSha256':r['currentEnglishSourceSha256'],
          'callerContextSha256':ctx['callerContextSha256'],
          'callerContextRawRowSha256':context_raw[r['sourceId']],
          'callerContextEvidenceRowSha256':r['callerContextEvidenceRowSha256'],
          'callerDefinition':ctx['definition'],
          'callerSites':ctx['sites'],
          'candidateFreeCellSha256':r['candidateFreeCellSha256'],
          'candidateFreeCellRawRowSha256':cell_raw[cid],
          'targetCatalogPath':c['targetCatalogPath'],'targetCatalogSha256':c['targetCatalogSha256'],
          'targetCatalogGitBlob':c['targetCatalogGitBlob'],
          'currentTargetPresent':r['currentTargetPresent'],'currentTarget':r['currentTarget'],
          'currentTargetSha256':r['currentTargetSha256'],
          'crossReviewDisposition':r['disposition'],
          'crossLedgerRawRowSha256':cross_raw[cid],
          'crossRecommendedTarget':r['recommendedTarget'],
          'crossRecommendedTargetSha256':r['recommendedTargetSha256'],
          'disposition':disposition,
          'chosenTarget':target,'chosenTargetSha256':sha(target),
          'rationale':reason,
          'independentTokenChecks':checks,
          'callerReviewed':True,
          'headedBrowserAcceptance':False,'nativeSpeakerAcceptance':False,
        }
        output.append(chosen)
    expected=collections.Counter({'accept':512,'adjust':16})
    counts=collections.Counter(x['disposition'] for x in output)
    if counts!=expected: raise SystemExit(f'disposition count mismatch {counts}')
    text=''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in output)
    (OUT/'ledger.jsonl').write_text(text,encoding='utf-8')
    adjust_ids=[r['cellId'] for r in output if r['disposition']=='adjust']
    summary_out={
      'artifact':'SeerrNG PR #418 W4000-W4019 parity second opinion',
      'result':'PASS','headSha':manifest['exactHead'],'headTree':manifest['exactTree'],
      'baseSha':manifest['baseSha'],'baseTree':manifest['baseTree'],
      'cells':len(output),'sourceIds':44,'locales':12,'insertionGaps':516,'changedSourceRefreshes':12,
      'dispositions':dict(sorted(counts.items())),'holds':0,
      'adjustedCellIds':adjust_ids,
      'crossReviewDispositions':dict(sorted(collections.Counter(r['disposition'] for r in cross.values()).items())),
      'targetTokenFailures':0,'crossLedgerRawRowsBound':528,'candidateFreeCellRawRowsBound':528,
      'callerContextRawRowsBound':528,
      'nativeSpeakerReviewPerformed':False,'headedBrowserReviewPerformed':False,
      'note':'This semantic second opinion is separate from native-speaker approval and headed-browser acceptance.'
    }
    (OUT/'summary.json').write_text(json.dumps(summary_out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    readme=f'''# SeerrNG PR #418 parity second opinion\n\nRead-only semantic review of all 528 selected locale cells at PR head `{manifest['exactHead']}` (tree `{manifest['exactTree']}`), against base `{manifest['baseSha']}` (tree `{manifest['baseTree']}`).\n\nThe ledger binds every decision to the exact raw cross-review JSONL row, candidate-free cell row, caller-context row, source/key/locale hashes, and any current target hash. Every row carries the exact chosen target. `accept` retains the cross-review target; `adjust` supplies the exact second-opinion target in `chosenTarget`. There are no holds.\n\nThe 12 changed-source refresh cells were checked against the current English source and exact nested formatter caller. That caller passes a localized episode-label string as `{{count}}`, so the adjusted targets avoid duplicating the episode unit and state the queue position relative to this request.\n\nThis is a semantic review. Native-speaker approval and headed-browser acceptance remain separate gates and were not performed in this packet. No repository, worktree, PR, or workflow was changed.\n\nSee `summary.json`, `ledger.jsonl`, and `SHA256SUMS.txt`. Rebuild with `python3 build_second_opinion.py`; verify with `python3 verify_second_opinion.py`.\n'''
    (OUT/'README.md').write_text(readme,encoding='utf-8')
    print('built',len(output),'cells; counts',dict(counts),'adjustments',len(adjust_ids))
    for cid in adjust_ids: print(cid,'=>',next(x['chosenTarget'] for x in output if x['cellId']==cid))

if __name__=='__main__': main()
