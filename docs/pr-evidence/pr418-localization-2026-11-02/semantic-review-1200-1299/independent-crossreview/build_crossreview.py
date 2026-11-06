import collections
import hashlib
import json
import pathlib
import re
import subprocess
import sys

BASE = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1200-1299-primary-20261102')
WORKTREE = pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1000-1099')
OUT = pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1200-1299-independent-crossreview-20261102')
HEAD = '6ff9de1c39a19fe9c508f09e0f6a885022632d8b'
TREE = '68d7525714b3628bbe7b69701d8be08add152832'
LOCALES = ['ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-CN','zh-TW']


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]

def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def file_sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(['git','-C',str(WORKTREE),*args],text=True).strip()

def placeholders(text):
    return sorted(set(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*(?=[,}])', text)))

def markup_tags(text):
    return sorted(re.findall(r'<\s*/?\s*([A-Za-z][A-Za-z0-9:-]*)\b', text))

def flatten_strings(obj):
    if isinstance(obj, str): return [obj]
    if isinstance(obj, dict):
        out=[]
        for k,v in obj.items():
            if isinstance(k,str): out.append(k)
            out.extend(flatten_strings(v))
        return out
    if isinstance(obj, list):
        out=[]
        for v in obj: out.extend(flatten_strings(v))
        return out
    return []

# Independent exact-target decisions. All other primary proposals are accepted as written;
# all other current targets are accepted unchanged after the full 1,200-cell semantic pass.
manual = {
 ('components.Following.howBody','hi'): {
  'target':'किसी कथावाचक, सीरीज़, गेम, कलाकार या पैच प्रोजेक्ट पर “फॉलो करें” दबाएँ। SeerrNG लगभग हर 30 मिनट में बदलावों की जाँच करता है और यहाँ हर आइटम के साथ उसके दिखाई देने का कारण बताता है। जब तक आप “स्वतः अनुरोध करें” चालू नहीं करते, आपकी ओर से कोई अनुरोध नहीं किया जाएगा; यह विकल्प केवल पुस्तकों के लिए उपलब्ध है।',
  'disposition':'refined-primary-proposal',
  'rationale':'The audiobook narrator term and localized action wording are sound. Refined the quoted Follow control to exactly match the Hindi button label `फॉलो करें` (the primary/addendum target used `फ़ॉलो करें`), and re-attested the Request Automatically label.'},
 ('components.Following.nothingFollowed','hi'): {
  'target':'आप अभी कुछ भी फ़ॉलो नहीं कर रहे हैं। किसी सीरीज़, किताब, गेम या कलाकार को फ़ॉलो करने के लिए “फॉलो करें” चुनें।',
  'disposition':'refined-primary-proposal',
  'rationale':'The primary correction localizes the action and points to the button, but its quoted label used `फ़ॉलो करें`; the actual Hindi control is `फॉलो करें`. Refined the quote to match the visible control exactly.'},
 ('components.Following.nothingNew','hi'): {
  'target':'अभी तक कुछ नया नहीं है। किसी सीरीज़, कथावाचक, गेम या कलाकार को फॉलो करें और बदलाव यहाँ दिखाई देंगे।',
  'disposition':'refined-primary-proposal',
  'rationale':'Accepted the audiobook-specific narrator term. Refined the action spelling to match the actual Hindi `फॉलो करें` control.'},
 ('components.Following.newFranchiseRelation','ja'): {
  'target':'「{franchise}」で新しいつながりが見つかりました：{relation}。',
  'disposition':'refined-primary-proposal',
  'rationale':'The caller supplies a relation type. This preserves the source’s new-connection framing and avoids recasting the event as if a new work itself had been added.'},
 ('components.Franchise.description','ar'): {
  'target':'الأعمال الأصلية، والاقتباسات، والأعمال اللاحقة، والقصص الجانبية، ومكانة كل منها في مكتبتك.',
  'disposition':'missed-current-issue',
  'rationale':'`التعديلات` means modifications, while the same page’s Adaptations group is about works adapted from other works. `الأعمال اللاحقة` also conveys sequel works more accurately than a literal “next part.”'},
 ('components.Franchise.description','ja'): {
  'target':'原作、翻案作品、続編、サイドストーリーと、ライブラリ内での各作品の位置を示します。',
  'disposition':'missed-current-issue',
  'rationale':'The current `適応作品` suggests adjustment/adaptation in a general sense. The Franchise grouping is creative adaptations; `翻案作品` matches that meaning and the reviewed Adaptations group label.'},
 ('components.Following.description','vi'): {
  'target':'Tin tức cá nhân về người kể chuyện, các bộ truyện, trò chơi, nghệ sĩ và dự án bạn theo dõi. Mỗi mục nêu rõ lý do xuất hiện.',
  'disposition':'missed-current-issue',
  'rationale':'The current `các người kể chuyện` is awkward Vietnamese. This version uses the same audiobook narrator term as the kind label and removes the unnecessary plural classifier.'},
 ('components.Following.kindFranchise','vi'): {
  'target':'Loạt tác phẩm',
  'disposition':'missed-current-issue',
  'rationale':'The current `Hãng phim/Thương hiệu` reads as film studio/brand. This label is an entity type for a cross-media group of connected works, so `Loạt tác phẩm` describes the category directly.'},
 ('components.Following.newNarrationAvailable','ar'): {
  'target':'تتوفر نسخة صوتية أخرى من {title}: {narrators}.',
  'disposition':'missed-current-issue',
  'rationale':'In this audiobook event, `سرد مختلف` can read as a different story/narrative. The replacement identifies another audio edition and preserves both runtime placeholders.'},
 ('components.Following.nothingNew','ar'): {
  'target':'لا يوجد جديد بعد. تابع سلسلة أو راوياً أو لعبة أو فناناً، وستظهر التغييرات هنا.',
  'disposition':'missed-current-issue',
  'rationale':'The current `روائياً` means novelist/novelistic rather than audiobook narrator. `راوياً` matches the corrected narrator term in this accusative object position.'},
 ('components.Following.howBody','de'): {
  'target':'Klicke bei einem Sprecher, einer Serie, einem Spiel, einem Künstler oder einem Patch-Projekt auf „Folgen“. SeerrNG prüft etwa alle 30 Minuten auf Änderungen und fügt hier einen Eintrag mit dem Grund hinzu, warum er aufgetaucht ist. Es wird nichts für dich angefordert, es sei denn, du aktivierst „Automatisch anfordern“, was auf Bücher beschränkt ist.',
  'disposition':'missed-current-issue',
  'rationale':'The current help text calls the Follow control `Verfolgen`, while the actual button label is `Folgen`. This aligns the quoted action with the exact visible label.'},
 ('components.Following.nothingFollowed','de'): {
  'target':'Du verfolgst noch nichts. Verwende „Folgen“ bei einer Serie, einem Buch, einem Spiel oder einem Künstler.',
  'disposition':'missed-current-issue',
  'rationale':'The empty state refers users to the Follow control; its current label is `Folgen`, not `Verfolgen`. Align the quoted instruction with the exact button label.'},
 ('components.Following.howBody','fr'): {
  'target':'Appuyez sur Suivre pour un narrateur, une série, un jeu, un artiste ou un projet de correctif. SeerrNG vérifie les changements environ toutes les 30 minutes et ajoute un élément ici avec la raison de son apparition. Aucune demande n’est effectuée pour vous, sauf si vous activez l’option « Demander automatiquement », réservée aux livres.',
  'disposition':'missed-current-issue',
  'rationale':'The primary proposal changes the checkbox label to `Demander automatiquement`, but this help text still describes it as `la demande automatique`. The revised wording uses the exact UI label and preserves the books-only restriction.'},
 ('components.Following.howBody','id'): {
  'target':'Tekan Ikuti pada narator, seri, game, artis, atau proyek patch. SeerrNG memeriksa perubahan kira-kira setiap 30 menit dan menambahkan item di sini beserta alasan kemunculannya. Tidak ada permintaan yang dibuat untuk Anda kecuali Anda mengaktifkan “Minta Secara Otomatis”, yang hanya berlaku untuk buku.',
  'disposition':'missed-current-issue',
  'rationale':'The current help text refers to `Permintaan Otomatis`, but the matching checkbox is labeled `Minta Secara Otomatis`. The revision quotes the actual UI label while retaining the books-only limitation.'},
}

manifest=json.loads((BASE/'manifest.json').read_text())
if manifest['head'] != HEAD or manifest['tree'] != TREE: raise SystemExit('primary manifest pin mismatch')
if git('rev-parse','HEAD') != HEAD or git('rev-parse','HEAD^{tree}') != TREE: raise SystemExit('worktree head/tree mismatch')
if git('status','--short'): raise SystemExit('read-only worktree is not clean')

def attest_catalog(path, expected):
    p=WORKTREE/path
    raw=p.read_bytes()
    if len(raw)!=expected['bytes']: raise SystemExit(f'catalog byte-count mismatch: {path}')
    if hashlib.sha256(raw).hexdigest()!=expected['sha256']: raise SystemExit(f'catalog SHA-256 mismatch: {path}')
    if git('rev-parse',f'{HEAD}:{path}')!=expected['blob']: raise SystemExit(f'catalog git-blob mismatch: {path}')

source_meta=manifest['sourceCatalog']
attest_catalog(source_meta['path'],source_meta)
for loc, meta in manifest['targetCatalogs'].items():
    attest_catalog(meta['path'],meta)

review_input=read_jsonl(BASE/'review-input.jsonl')
primary=read_jsonl(BASE/'primary-review-ledger.jsonl')
proposals=read_jsonl(BASE/'candidate-proposals.jsonl')
contexts={r['sourceId']:r for r in read_jsonl(BASE/'source-contexts.jsonl')}
addenda=read_jsonl(BASE/'locale-a/narrator-addendum.jsonl')+read_jsonl(BASE/'locale-b/narrator-addendum.jsonl')
if len(review_input)!=1200 or len(primary)!=1200: raise SystemExit('expected 1,200 rows in input and primary ledger')
if len({(r['id'],r['locale']) for r in review_input})!=1200: raise SystemExit('duplicate input cells')
if len({(r['id'],r['locale']) for r in primary})!=1200: raise SystemExit('duplicate primary cells')
if len(proposals)!=105 or len(addenda)!=12: raise SystemExit('candidate/addendum count mismatch')

primary_by={(r['id'],r['locale']):r for r in primary}
proposal_by={(r['id'],r['locale']):r for r in proposals}
addendum_by={(r['id'],r['locale']):r for r in addenda}
manual_keys=set(manual)
if not manual_keys.issubset({(r['id'],r['locale']) for r in review_input}): raise SystemExit('manual cross-review key absent from window')

source_catalog=json.loads((WORKTREE/'src/i18n/locale/en.json').read_text(encoding='utf-8'))
source_keys=list(source_catalog)
if len(source_keys)!=9494: raise SystemExit(f'expected 9,494 source keys, got {len(source_keys)}')
locale_files={}
locale_order_mismatches=[]
for loc in LOCALES:
    fileloc={'pt-BR':'pt_BR','zh-CN':'zh_Hans','zh-TW':'zh_Hant'}.get(loc,loc)
    locale_files[loc]=json.loads((WORKTREE/f'src/i18n/locale/{fileloc}.json').read_text(encoding='utf-8'))
    if len(locale_files[loc])!=9494 or set(locale_files[loc])!=set(source_keys): raise SystemExit(f'catalog key-set parity mismatch for {loc}')
    if list(locale_files[loc])!=source_keys: locale_order_mismatches.append(loc)

# Re-attest exact source/current values and caller context from this worktree.
caller_checks=0
caller_files=set()
caller_lines=set()
caller_errors=[]
for ctx in contexts.values():
    for c in ctx.get('callers',[]):
        caller_checks += 1
        p=WORKTREE/c['path']
        caller_files.add(c['path'])
        caller_lines.add((c['path'],c['line']))
        try:
            raw=p.read_bytes()
            actual_blob=git('rev-parse',f'{HEAD}:{c["path"]}')
            actual_line=p.read_text(encoding='utf-8').splitlines()[c['line']-1]
        except Exception as e:
            caller_errors.append(f"{c['path']}:{c['line']} read error: {e}")
            continue
        if actual_blob!=c['fileBlob']: caller_errors.append(f"blob mismatch {c['path']}")
        if file_sha(p)!=c['fileSha256']: caller_errors.append(f"file sha mismatch {c['path']}")
        if sha(actual_line)!=c['lineSha256']: caller_errors.append(f"line sha mismatch {c['path']}:{c['line']}")
        if actual_line!=c['lineText']: caller_errors.append(f"line text mismatch {c['path']}:{c['line']}")
if caller_errors: raise SystemExit('\n'.join(caller_errors[:20]))

ledger=[]
for r in review_input:
    key=(r['id'],r['locale'])
    pr=primary_by[key]
    target_dict=locale_files[r['locale']]
    current=target_dict[r['id']]
    source=source_catalog[r['id']]
    if current!=r['currentTarget']: raise SystemExit(f'current target mismatch {key}')
    if sha(current)!=r['currentTargetHash']: raise SystemExit(f'current hash mismatch {key}')
    if source!=r['source'] or sha(source)!=r['sourceHash']: raise SystemExit(f'source mismatch {key}')
    if list(source_catalog).index(r['id'])!=r['sourceIdPosition']: raise SystemExit(f'source position mismatch {key}')
    if pr['currentTarget']!=current or pr['currentTargetHash']!=sha(current): raise SystemExit(f'primary row not pinned to current {key}')
    proposal=proposal_by.get(key)
    if pr['decision']=='accept-current':
        base_target=current
        base_disposition='accepted-current'
        base_rationale='Independent full-window review accepts the current translation in its source and caller context.'
        if proposal is not None: raise SystemExit(f'proposal/decision mismatch {key}')
    else:
        if proposal is None: raise SystemExit(f'missing candidate row {key}')
        if proposal['proposedTarget']!=pr.get('proposedTarget') or proposal['candidateHash']!=pr.get('proposedTargetHash'):
            raise SystemExit(f'candidate/primary proposal mismatch {key}')
        if proposal['candidateHash']!=sha(proposal['proposedTarget']): raise SystemExit(f'candidate target hash mismatch {key}')
        if proposal['attestedHead']!=HEAD or proposal['attestedTree']!=TREE: raise SystemExit(f'candidate exact-head pin mismatch {key}')
        if proposal['sourceCatalogBlob']!=source_meta['blob'] or proposal['sourceCatalogSha256']!=source_meta['sha256']:
            raise SystemExit(f'candidate source-catalog pin mismatch {key}')
        target_meta=manifest['targetCatalogs'][r['locale']]
        if proposal['targetCatalogBlob']!=target_meta['blob'] or proposal['targetCatalogSha256']!=target_meta['sha256']:
            raise SystemExit(f'candidate target-catalog pin mismatch {key}')
        base_target=proposal['proposedTarget']
        base_disposition='accepted-primary-proposal'
        base_rationale='Independent review accepts the proposed target in the pinned source and caller context.'
    if key in addendum_by:
        a=addendum_by[key]
        if a['currentTarget']!=current or a['currentTargetHash']!=sha(current): raise SystemExit(f'addendum current mismatch {key}')
        if a['source']!=source or a['sourceHash']!=sha(source): raise SystemExit(f'addendum source mismatch {key}')
        if a['finalTargetHash']!=sha(a['finalTarget']): raise SystemExit(f'addendum final-target hash mismatch {key}')
        if a['exactHead']!=HEAD or a['exactTree']!=TREE: raise SystemExit(f'addendum exact-head pin mismatch {key}')
        # The addendum's final target is the primary team's consistency recommendation; manual root review below may refine it.
        base_target=a['finalTarget']
        if key not in manual:
            base_disposition='accepted-primary-proposal' if base_target!=current else 'accepted-current'
            base_rationale='Independent review accepts the narrator terminology and consistency recommendation against the pinned audiobook caller context.'
    if key in manual:
        base_target=manual[key]['target']
        base_disposition=manual[key]['disposition']
        base_rationale=manual[key]['rationale']
    if key in addendum_by and key not in manual:
        # Preserve the candidate disposition when the exact addendum target equals the reviewed primary proposal.
        if proposal is not None and proposal['proposedTarget']==base_target:
            base_disposition='accepted-primary-proposal'
        elif pr['decision']=='accept-current' and base_target!=current:
            base_disposition='missed-current-issue'
    final=base_target
    source_ph=placeholders(source)
    current_ph=placeholders(current)
    final_ph=placeholders(final)
    source_tags=markup_tags(source)
    final_tags=markup_tags(final)
    protected=sorted(set(flatten_strings(pr.get('protectedLiteralsSource',{}))))
    if source_ph!=current_ph and current_ph: raise SystemExit(f'input placeholder mismatch {key}')
    if source_ph!=final_ph: raise SystemExit(f'final placeholder mismatch {key}: {source_ph} vs {final_ph}')
    if source_tags!=final_tags: raise SystemExit(f'final markup mismatch {key}: {source_tags} vs {final_tags}')
    if any(lit and lit not in final for lit in protected): raise SystemExit(f'protected literal mismatch {key}')
    row={
      'schemaVersion':1,'recordType':'catalog-cell','repository':'snapetech-org/seerrng','pullRequest':418,
      'id':r['id'],'sourceIdPosition':r['sourceIdPosition'],'locale':r['locale'],
      'inputHead':HEAD,'inputTree':TREE,'source':source,'sourceHash':sha(source),
      'currentTarget':current,'currentTargetHash':sha(current),
      'primaryDisposition':pr['decision'],'primaryProposedTarget':pr.get('proposedTarget'),
      'primaryProposedTargetHash':pr.get('proposedTargetHash'),
      'crossReviewDisposition':base_disposition,'finalTarget':final,'finalTargetHash':sha(final),
      'rationale':base_rationale,'callerContextReattested':True,'callerReferenceCount':len(contexts[r['id']].get('callers',[])),
      'sourcePlaceholderNames':source_ph,'finalPlaceholderNames':final_ph,'placeholderParity':source_ph==final_ph,
      'sourceMarkupTags':source_tags,'finalMarkupTags':final_tags,'markupParity':source_tags==final_tags,
      'protectedLiteralParity':all(not lit or lit in final for lit in protected),
    }
    if key in addendum_by:
        row['narratorAddendumReattested']=True
        row['narratorAddendumPrimaryTarget']=addendum_by[key]['finalTarget']
        row['narratorAddendumPrimaryTargetHash']=addendum_by[key]['finalTargetHash']
    ledger.append(row)

# Create separate, exact-target re-attestation entries for all narrator addendum rows.
addendum_ledger=[]
for a in addenda:
    key=(a['id'],a['locale'])
    core=next(row for row in ledger if (row['id'],row['locale'])==key)
    if a['finalTargetHash']!=sha(a['finalTarget']): raise SystemExit(f'addendum output hash mismatch {key}')
    addendum_ledger.append({
      'schemaVersion':1,'recordType':'narrator-addendum-cell','repository':'snapetech-org/seerrng','pullRequest':418,
      'id':a['id'],'sourceIdPosition':a['sourceIdPosition'],'locale':a['locale'],
      'inputHead':HEAD,'inputTree':TREE,'source':a['source'],'sourceHash':a['sourceHash'],
      'currentTarget':a['currentTarget'],'currentTargetHash':a['currentTargetHash'],
      'primaryAddendumDisposition':a.get('finalDisposition',a.get('disposition')),
      'primaryAddendumTarget':a['finalTarget'],'primaryAddendumTargetHash':a['finalTargetHash'],
      'crossReviewDisposition':core['crossReviewDisposition'],'finalTarget':core['finalTarget'],'finalTargetHash':core['finalTargetHash'],
      'rationale':core['rationale'],'callerContextReattested':True,
    })

counts=collections.Counter(r['crossReviewDisposition'] for r in ledger)
changed=sum(r['currentTargetHash']!=r['finalTargetHash'] for r in ledger)
primary_candidates=sum(r['primaryDisposition']!='accept-current' for r in ledger)
if primary_candidates!=105 or changed!=115: raise SystemExit(f'unexpected candidate/change counts: {primary_candidates}, {changed}')
if counts['accepted-primary-proposal']!=101 or counts['refined-primary-proposal']!=4 or counts['missed-current-issue']!=10 or counts['accepted-current']!=1085:
    raise SystemExit(f'unexpected disposition counts: {dict(counts)}')
if len(addendum_ledger)!=12: raise SystemExit('expected 12 narrator addendum rows')

(OUT/'cross-review-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in ledger),encoding='utf-8')
(OUT/'narrator-addendum-crossreview.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in addendum_ledger),encoding='utf-8')
summary={
 'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W1200-1299',
 'inputHead':HEAD,'inputTree':TREE,'livePullRequest':'OPEN','isDraft':True,
 'coreCellsReviewed':len(ledger),'narratorAddendumRowsReattested':len(addendum_ledger),'uniqueSourceIds':100,'directLocales':LOCALES,
 'primaryCandidatesReviewed':primary_candidates,
 'crossReviewDispositions':dict(counts),'catalogChangesRecommended':changed,
 'sourceCatalogKeys':len(source_keys),'catalogKeySetParity':'all 12 catalogs contain the same 9,494 keys as the English source catalog','catalogOrderMismatches':locale_order_mismatches,
 'sourceAndCurrentHashMismatches':0,'callerReferencesReattested':caller_checks,'uniqueCallerFiles':len(caller_files),'uniqueCallerLines':len(caller_lines),'callerPinMismatches':0,
 'placeholderFailures':0,'markupFailures':0,'protectedLiteralFailures':0,
 'nativeSpeakerApproval':False,'headExactBrowserReview':False,'testsBuildsScansCIWorkflowsReleasesTagsMerges':False,
 'importantFindings':[
  'Refined three Hindi Following action strings to match the exact `फॉलो करें` button label.',
  'Refined the Japanese new-franchise event to preserve the source connection semantics with a relation-type placeholder.',
  'Found ten current-value issues missed by primary review, including Arabic/Japanese franchise description terms, Arabic narrator wording, Vietnamese text, and German/French/Indonesian control-label references.'
 ],
 'notes':['Machine cross-review only; no qualified native-speaker approval is claimed.','No repository changes or external PR updates were made.','The 12-row addendum overlaps catalog cells in the 1,200-row core window and is retained separately for auditable terminology re-attestation.']
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
readme=f'''# SeerrNG PR #418 W1200–1299 independent cross-review\n\nThis packet independently reviews all 1,200 current source/locale rows and all 105 primary proposals at exact head `{HEAD}` / tree `{TREE}`. The live PR remained OPEN/DRAFT at that exact head when this review began. The 12-row audiobook-narrator consistency addendum is separately re-attested; its rows overlap the 1,200-row core window.\n\n## Results\n\n- 1,085 current targets accepted unchanged.\n- 101 primary proposals accepted exactly.\n- 4 primary proposals refined: three Hindi control-label spellings were aligned with the existing `फॉलो करें` button, and the Japanese franchise event was refined to preserve the source’s “new connection” framing.\n- 10 missed current-value issues found and assigned exact final target recommendations.\n- 115 catalog targets recommended for change across all 12 catalogs.\n- The 12 narrator addendum rows are recorded in `narrator-addendum-crossreview.jsonl`.\n\n## Verification\n\nThe worktree at the pinned head was clean. Source and current-target values/hashes, all 9,494 key sets in each locale catalog, 207 caller-context references across five files, placeholders, markup, protected literals, candidate hashes, and final target hashes were re-attested. No mismatches were found.\n\n## Limits\n\nThis is a machine semantic cross-review, not native-speaker signoff. It did not perform a headed browser review, run tests/builds/scans/CI, change the repository or PR, or create a release/tag/merge.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
print(json.dumps({'coreRows':len(ledger),'addendumRows':len(addendum_ledger),'counts':dict(counts),'changed':changed,'callerReferences':caller_checks,'callerFiles':len(caller_files),'callerLines':len(caller_lines),'outputBytes':sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())},indent=2))
