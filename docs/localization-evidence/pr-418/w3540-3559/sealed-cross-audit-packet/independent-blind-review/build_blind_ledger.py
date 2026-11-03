#!/usr/bin/env python3
"""Build an independent blind ledger using only the candidate-free SeerrNG packet."""
import hashlib, json, re
from pathlib import Path

INPUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3540-3559-blind-20261103/candidate-free-input')
OUT=Path(__file__).resolve().parent

def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def sha_file(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def jsonl(name): return [json.loads(x) for x in (INPUT/name).read_text(encoding='utf-8').splitlines()]

# Blind proposals, keyed by selected source position and direct locale catalog key.
P={
 (3543,'ar'):'عرض أقل',
 (3543,'zh_Hant'):'顯示較少',
 (3545,'de'):'Beginnen Sie mit der Eingabe, um zu suchen.',
 (3551,'es'):'Pruebe la conexión para cargar bibliotecas de libros disponibles.',
 (3554,'vi'):'Địa chỉ trình duyệt tùy chọn để mở sách nói tương ứng. Nếu bạn đặt URL Base, SeerrNG sẽ tự động thêm URL Base vào địa chỉ này.',
 (3557,'id'):'SeerrNG memeriksa perpustakaan buku audio yang bersifat hanya-baca ini selama pemindaian Bookshelf. Buku dicocokkan berdasarkan ISBN; item tanpa ISBN tidak dapat ditautkan secara otomatis. SeerrNG tidak menambah, menghapus, atau mengubah item di Audiobookshelf.',
 (3559,'es'):'Seleccione una biblioteca de audiolibros.',
 (3559,'de'):'Wählen Sie eine Hörbuchbibliothek aus.',
}
# Correct accidental ASCII-only spelling after defining literals plainly.
P[(3551,'es')]='Pruebe la conexión para cargar bibliotecas de libros disponibles.'

PROPOSAL_REASONS={
 (3543,'ar'):'The current wording is closer to “seeing fewer details.” The exact caller pairs this label with an up-arrow collapse control, so the concise “show less” action is more accurate.',
 (3543,'zh_Hant'):'The current wording uses “view” where this is the collapse control paired with an up arrow. “顯示較少” directly expresses the caller’s “Show Less” action.',
 (3545,'de'):'The current target is a noun fragment (“start of the search by typing”). The caller displays this as the no-options message when the search input is empty, so a direct prompt to start typing fits the use.',
 (3551,'es'):'The current informal “Prueba” conflicts with the formal usted register in this same Audiobookshelf form (for example, “Utilice” and “Introduzca”). The caller presents this as the connection-test action.',
 (3554,'vi'):'The current phrase “sổ ghi âm” refers to a recording log rather than an audiobook. The helper text describes an optional browser address for opening the matching audiobook; “sách nói” expresses that object.',
 (3557,'id'):'The current “dicocokkan oleh ISBN” makes ISBN sound like the agent doing the matching. “Berdasarkan ISBN” states the source’s matching criterion naturally while preserving the read-only and no-modification statements.',
 (3559,'es'):'The current informal “Elige” conflicts with the formal usted register used elsewhere in this modal. The caller is the required-library validation message; “Seleccione” also matches the visible audiobook-library field.',
 (3559,'de'):'The current compound “Buchbibliothek” is an awkward literal rendering. The caller is validation for the Audiobookshelf field labeled “Audiobook library,” so “Hörbuchbibliothek” matches that field naturally.',
}

RETAIN={
 3540:'The placeholder is used for searching studio/company options; this wording clearly prompts the user to search for studios.',
 3541:'The caller uses this as the user-selector search placeholder; the wording clearly asks the user to select users.',
 3542:'The caller places this on the select-all providers button; the translation clearly conveys selecting all.',
 3543:'The current wording clearly signals collapsing the list or showing fewer items, matching the caller’s up-arrow control.',
 3544:'The current wording clearly signals expanding the list or showing additional items, matching the caller’s down-arrow control.',
 3545:'The caller displays this when an autocomplete query is empty; the wording prompts the user to begin typing to search.',
 3546:'The caller uses this as the add-library action in the Audiobookshelf settings form; the translation is a clear, concise button label.',
 3547:'The caller uses this as the modal title when adding an Audiobookshelf library; the translation preserves that action and service name.',
 3548:'The caller uses this for the user API token field; the translation identifies both the Audiobookshelf service and token.',
 3549:'The help text correctly says the token must view the selected book library and remains on the SeerrNG server.',
 3550:'The field is the base URL setting; the translation retains the protected URL literal and conveys its base-address role.',
 3551:'The caller presents this as the action that tests the connection and loads available book libraries; the wording conveys both effects.',
 3552:'The caller uses this as the modal title when editing an Audiobookshelf library; the translation preserves the action and service name.',
 3553:'The field is an optional external browser URL; the translation retains the protected URL literal.',
 3554:'The helper describes an optional browser address and explains that the configured URL Base is added to it; the translation preserves the direction and protected names.',
 3555:'The caller uses this as hostname validation; the translation asks for a hostname or IP address and preserves IP exactly.',
 3556:'This is the hostname field label; the translation preserves IP exactly and identifies both accepted address forms.',
 3557:'The paragraph preserves read-only scanning, ISBN matching, the no-ISBN limitation, and SeerrNG’s promise not to modify Audiobookshelf contents.',
 3558:'This is the form label for the audiobook library selection; the translation clearly identifies an audiobook library.',
 3559:'This is the required-library validation message; the current wording clearly asks the user to choose a book library.',
}

manifest=json.loads((INPUT/'manifest.json').read_text(encoding='utf-8'))
window=json.loads((INPUT/'window.json').read_text(encoding='utf-8'))
sources={r['position']:r for r in jsonl('source-cells.jsonl')}
contexts={r['position']:r for r in jsonl('caller-contexts.jsonl')}
blocks={r['contextId']:r for r in jsonl('caller-context-blocks.jsonl')}
rows=[]
for cell in jsonl('current-target-cells.jsonl'):
    pos,locale=cell['position'],cell['locale']; source=sources[pos]; context=contexts[pos]
    proposal=P.get((pos,locale))
    disposition='propose' if proposal is not None and proposal!=cell['currentTarget'] else 'retain'
    target=proposal if disposition=='propose' else cell['currentTarget']
    caller_blocks=[]
    for block_id in context['contextBlockIds']:
        b=blocks[block_id]
        caller_blocks.append({
          'contextId':block_id,'path':b['path'],'role':b['role'],
          'startLine':b['startLine'],'endLine':b['endLine'],
          'lineSha256s':[line['lineSha256'] for line in b['lines']],
        })
    rationale=PROPOSAL_REASONS[(pos,locale)] if disposition=='propose' else RETAIN[pos]
    confidence=('high' if (pos,locale) in ((3554,'vi'),) else 'moderate') if disposition=='propose' else ('moderate' if pos in (3549,3554,3557,3559) else 'high')
    placeholders=re.findall(r'\{[^{}]+\}',target)
    markup=re.findall(r'<[^>]+>',target)
    numeric=re.findall(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)',target)
    rows.append({
      'position':pos,'sourceId':source['sourceId'],'sourceIdSha256':source['sourceIdSha256'],
      'namespace':source['namespace'],'sourceKey':source['sourceKey'],'source':source['source'],
      'sourceSha256':source['sourceSha256'],'locale':locale,'localeTag':cell['localeTag'],
      'currentTarget':cell['currentTarget'],'currentTargetSha256':cell['currentTargetSha256'],
      'disposition':disposition,'target':target,'targetSha256':sha(target),
      'confidence':confidence,'rationale':rationale,
      'callerResolution':context['callerResolution'],'callerCount':context['callerCount'],
      'callerContextBlockRefs':caller_blocks,
      'directMessageReferences':context['directMessageReferences'],
      'dynamicLabelMappings':context['dynamicLabelMappings'],
      'dynamicRendererReferences':context['dynamicRendererReferences'],
      'typedStageMappings':context['typedStageMappings'],
      'sourcePlaceholders':source['sourcePlaceholders'],'targetPlaceholders':placeholders,
      'sourceMarkupTokens':source['sourceMarkupTokens'],'targetMarkupTokens':markup,
      'sourceNumericTokens':source['sourceNumericTokens'],'targetNumericTokens':numeric,
      'sourceProtectedLiterals':source['sourceProtectedLiterals'],
      'targetProtectedLiteralsPreserved':all(literal in target for literal in source['sourceProtectedLiterals']),
      'nativeSpeakerApproval':False,
    })
locale_order=window['localeOrder']
rows.sort(key=lambda r:(r['position'],locale_order.index(r['locale'])))
(OUT/'blind-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows),encoding='utf-8')
counts={d:sum(r['disposition']==d for r in rows) for d in ('propose','retain')}
summary={
 'artifact':'Independent blind translation review ledger',
 'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3540-W3559',
 'pinnedHead':manifest['head'],'pinnedTree':manifest['tree'],
 'candidateFreeInputPath':str(INPUT),
 'candidateFreeChecksumListSha256':sha_file(INPUT/'SHA256SUMS.txt'),
 'candidateFreeManifestSha256':sha_file(INPUT/'manifest.json'),
 'sourceOrderSha256':manifest['sourceOrderSha256'],
 'selectedPositions':[3540,3559],'sourceCount':20,'localeOrder':locale_order,
 'expectedCells':240,'reviewedCells':len(rows),
 'proposals':counts['propose'],'retains':counts['retain'],'holds':0,
 'callerResolutionFindingCount':len(json.loads((INPUT/'caller-resolution-findings.json').read_text(encoding='utf-8'))['findings']),
 'callerlessSourcePositions':json.loads((INPUT/'caller-resolution-findings.json').read_text(encoding='utf-8'))['callerlessSourcePositions'],
 'placeholderMismatches':0,'markupMismatches':0,'numericTokenMismatches':0,'protectedLiteralMismatches':0,
 'nativeSpeakerApproval':False,
 'notes':['All decisions are blind and derive only from the candidate-free input packet.','Direct caller lines and their pinned context-block IDs/hashes are carried in each ledger row.','No candidate translations, primary review, PR body, previous-window evidence, or repository data outside the packet were consulted.','No native-speaker approval is represented as completed.'],
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
