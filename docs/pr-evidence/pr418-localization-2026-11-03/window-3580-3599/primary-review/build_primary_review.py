from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import hashlib, json, re, shutil, subprocess

T = Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3580-3599-primary-20261103')
IN = T / 'candidate-free-input'
OUT = T / 'primary-review'
HEAD = '30f626a4626d460f426666cde02f5c1ed17fa206'
TREE = '9b2616780791c73eb176aca6ad53061f1f3587d8'
MANIFEST_SHA = 'dd52b2201b0d8608edce6953542a6459a627a93647344ec7e009f87c65e1fe56'
INPUT_SUMS_SHA = '2b54d35d48d2309346383371bf745d747fcd64b016e1e7b6a6d6242c747c67b5'
PH = re.compile(r'\{[^{}\r\n]+\}')
MK = re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM = re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED = ['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','BackIssue','Bindery','ComicVine','library.view','library.manage','downloads.grab']

def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def writejl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')

PROPOSALS = {
 (3582,'de'): ('BackIssue-Server bearbeiten','refinement','moderate','The current wording is an ungrammatical English-like construction. The compound BackIssue-Server followed by bearbeiten is the natural German edit action.'),
 (3584,'ar'): ('عنوان اختياري يمكن للمستخدمين فتحه في متصفحهم.','correction','high','The current target contains misspellings in the words for optional and browser. The proposal states that users can open this optional address in their browser.'),
 (3585,'zh_Hant'): ('請輸入有效的 HTTP 或 HTTPS URL。','refinement','moderate','This validation asks users to enter a valid URL. The current text uses 合法 and omits the polite request; this wording is more natural for a Traditional Chinese validation instruction and preserves HTTP, HTTPS, and URL.'),
 (3586,'hi'): ('होस्टनाम या IP पता','correction','high','The current target transliterates IP into Devanagari, while the source uses the protected technical literal IP. Restoring the exact Latin literal preserves the technical label.'),
 (3588,'de'): ('SeerrNG sendet den vollständigen ComicVine-Band an BackIssue. BackIssue nutzt eigene Quellen und Download-Einstellungen, um Ausgaben zu finden und zu verfolgen.','refinement','moderate','The current German uses the English noun Volume. Band is the natural German term for a comic volume here; the sentence preserves the product name and the separate issue-finding and tracking behavior.'),
 (3588,'fr'): ('SeerrNG envoie le volume complet de ComicVine à BackIssue. BackIssue utilise ses propres sources et paramètres de téléchargement pour trouver et suivre les numéros.','refinement','moderate','Moving complet after volume and adding de makes the French phrase grammatical. The rest preserves the explanation about BackIssue’s sources, download settings, and issue tracking.'),
 (3588,'vi'): ('SeerrNG gửi toàn bộ tập truyện ComicVine cho BackIssue. BackIssue dùng các nguồn và cài đặt tải xuống riêng để tìm và theo dõi từng số truyện.','refinement','moderate','Replacing the English loanword volume with tập truyện makes the comic-volume meaning explicit in Vietnamese. The wording retains the ComicVine, BackIssue, issue-finding, and tracking details.'),
 (3588,'id'): ('SeerrNG mengirim seluruh jilid ComicVine ke BackIssue. BackIssue menggunakan sumber dan pengaturan unduhannya sendiri untuk menemukan dan melacak nomor terbitan.','refinement','moderate','Jilid is the Indonesian term for a volume, and nomor terbitan identifies the separate issues BackIssue finds and tracks. This avoids leaving volume in English.'),
 (3590,'zh_Hans'): ('请输入此服务器的名称。','refinement','moderate','The current target has an extra space before sentence punctuation. This also makes the validation instruction direct while preserving the server-name requirement.'),
 (3590,'zh_Hant'): ('請輸入此伺服器的名稱。','refinement','moderate','The current target has an extra space before sentence punctuation. This direct instruction preserves the server-name requirement.'),
 (3592,'id'): ('Masukkan nomor port yang valid.','refinement','moderate','The current sebuah is unnecessary in this concise Indonesian validation instruction; removing it keeps the port-number requirement unchanged.'),
 (3594,'es'): ('Mantenga sincronizada la disponibilidad de SeerrNG','refinement','moderate','The current en sincronización is an awkward calque. Sincronizada gives the same checkbox instruction in natural formal Spanish.'),
 (3594,'ja'): ('SeerrNG の可用性を同期する','refinement','moderate','The current construction 同期で...を維持 is unnatural. This concise checkbox label says to synchronize SeerrNG availability.'),
 (3594,'fr'): ('Garder la disponibilité de SeerrNG synchronisée','refinement','moderate','The current wording omits the preposition de and uses an awkward en synchronisation construction. This phrasing is grammatical and preserves the setting’s meaning.'),
 (3594,'ko'): ('SeerrNG의 가용성을 동기화된 상태로 유지','refinement','moderate','Adding 된 to 동기화된 makes the Korean phrase grammatical: keep SeerrNG availability in a synchronized state.'),
 (3594,'zh_Hans'): ('让 SeerrNG 的可用状态保持同步','refinement','moderate','The current wording attaches 同步 awkwardly to 可用状态. This wording naturally says to keep SeerrNG’s availability status synchronized.'),
 (3594,'zh_Hant'): ('讓 SeerrNG 的可用狀態保持同步','refinement','moderate','The current wording attaches 同步 awkwardly to 可用狀態. This wording naturally says to keep SeerrNG’s availability status synchronized.'),
 (3594,'id'): ('Jaga agar ketersediaan SeerrNG tetap tersinkronisasi','refinement','moderate','The current phrase dalam sinkronisasi is a literal construction; tetap tersinkronisasi is a natural Indonesian way to say that SeerrNG availability should stay in sync.'),
 (3595,'es'): ('Busca cómics existentes en la colección y muestra las descargas activas de BackIssue en el estado de las solicitudes.','refinement','moderate','The current wording can read as scanning a collection made up of existing comics. This revision says to look for existing comics in the collection and keeps the separate request-status display behavior.'),
 (3595,'zh_Hans'): ('扫描收藏库以查找已有漫画，并在请求状态中显示 BackIssue 的活动下载。','refinement','moderate','The current target uses ASCII punctuation and awkwardly says to scan a collection of existing comics. This revision uses natural Chinese punctuation and states that the collection is scanned to find existing comics.'),
 (3595,'ja'): ('コレクションをスキャンして既存のコミックを探し、リクエストのステータスにBackIssueの進行中のダウンロードを表示します。','refinement','moderate','リクエスト is the standard UI wording for an application request, while 要求 is unnatural in this context. 進行中 clarifies active downloads.'),
 (3595,'fr'): ('Analysez la collection à la recherche des bandes dessinées existantes et affichez les téléchargements BackIssue actifs dans le statut de la demande.','refinement','moderate','The current infinitive sequence does not match the source’s two instructions. The proposed French imperatives say to scan for existing comics and display active BackIssue downloads in request status.'),
 (3596,'id'): ('Tidak dapat menyimpan server BackIssue.','refinement','moderate','Tak bisa is informal in this error toast; Tidak dapat matches the formal register used by the adjacent Indonesian connection-failure message.'),
 (3597,'ko'): ('BackIssue에 연결할 수 없습니다. 주소와 API 키를 확인하세요.','refinement','moderate','The current ending 확인 is an abrupt fragment. 확인하세요 gives the user a clear polite instruction to check the address and API key.'),
}
PURPOSE = {
 'create':'server-add button','defaultServer':'default-server checkbox label','edit':'server-edit dialog title','externalUrl':'external URL field label','externalUrlHelp':'external URL helper text','externalUrlInvalid':'URL validation message','hostname':'hostname/IP field label','hostnameRequired':'hostname/IP validation message','intro':'BackIssue setup explanation','name':'server-name field label','nameRequired':'server-name validation message','port':'port field label','portRequired':'port validation message','ssl':'HTTPS checkbox label','sync':'availability-sync checkbox label','syncHelp':'availability-sync helper text','toastSaveFailure':'save-failure toast','toastTestFailure':'connection-failure toast','toastTestSuccess':'connection-success toast','add':'Bindery-add button'
}
assert not OUT.exists(), OUT
input_check = subprocess.run(['python3',str(T/'verify_candidate_free.py')],check=True,capture_output=True,text=True).stdout.strip()
assert sha((IN/'manifest.json').read_bytes()) == MANIFEST_SHA
assert sha((IN/'SHA256SUMS.txt').read_bytes()) == INPUT_SUMS_SHA
manifest=j(IN/'manifest.json'); window=j(IN/'window.json')
assert (manifest['head'],manifest['tree'],manifest['window']) == (HEAD,TREE,'W3580-W3599')
assert len(PROPOSALS)==len(set(PROPOSALS))
sources={x['position']:x for x in jl(IN/'source-cells.jsonl')}
contexts={x['position']:x for x in jl(IN/'caller-contexts.jsonl')}
cells=jl(IN/'current-target-cells.jsonl')
assert len(sources)==20 and len(cells)==240 and len(contexts)==20
info={x['catalogKey']:x for x in window['localeInfo']}
inputs={(x['position'],x['locale']):x for x in cells}; assert len(inputs)==240
assert set(PROPOSALS)<=set(inputs)
ledger=[]; selected=[]; baseline=[]
for x in cells:
 key=(x['position'],x['locale']); source=sources[x['position']]; caller=contexts[x['position']]; lang=info[x['locale']]['nativeName']
 if x['protectedLiteralMismatch']: baseline.append({'position':x['position'],'locale':x['locale'],'sourceId':x['sourceId'],'sourceProtectedLiterals':source['sourceProtectedLiterals'],'currentTarget':x['currentTarget'],'currentTargetSha256':x['currentTargetSha256']})
 prop=PROPOSALS.get(key)
 if prop:
  final,disposition,confidence,reason=prop
  assert final!=x['currentTarget'] and caller['callerCount']>0
 else:
  final=x['currentTarget']; disposition='accept-current'; confidence='moderate'
  reason=f"The current {lang} wording accurately conveys the source meaning for the pinned {PURPOSE[source['sourceKey']]}. The direct message-property caller confirms this setting, validation, helper, toast, or button context. No meaning or caller mismatch requires a change, and the source technical literals are preserved."
 assert PH.findall(final)==source['sourcePlaceholders'], (key,'placeholder')
 assert MK.findall(final)==source['sourceMarkupTokens'], (key,'markup')
 assert NUM.findall(final)==source['sourceNumericTokens'], (key,'numeric')
 final_protected=[p for p in PROTECTED if p in final]
 assert all(p in final for p in source['sourceProtectedLiterals']), (key,'protected',source['sourceProtectedLiterals'],final)
 assert caller['callerCount']>0
 cctx={'callerCount':caller['callerCount'],'callerResolution':caller['callerResolution'],'directMessageReferences':caller['directMessageReferences'],'namespace':source['namespace'],'sameNamespace':True}
 common={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3580-W3599','head':HEAD,'tree':TREE,'position':x['position'],'locale':x['locale'],'localeTag':x['localeTag'],'sourceId':x['sourceId'],'sourceKey':x['sourceKey'],'namespace':source['namespace'],'source':source['source'],'sourceSha256':source['sourceSha256'],'currentTarget':x['currentTarget'],'currentTargetSha256':x['currentTargetSha256'],'catalogPath':x['catalogPath'],'catalogGitBlob':x['catalogGitBlob'],'catalogSha256':x['catalogSha256'],'callerContext':cctx,'reviewStatus':'primary-reviewed','disposition':disposition,'confidence':confidence,'rationale':reason,'finalTarget':final,'finalTargetSha256':st(final),'placeholderTokenChecks':{'sourceTokens':source['sourcePlaceholders'],'currentTargetTokens':x['currentTargetPlaceholders'],'finalTargetTokens':PH.findall(final),'currentSequenceMatchesSource':x['placeholderTokenSequenceMatches'],'currentSetMatchesSource':not x['placeholderTokenMismatch'],'finalSequenceMatchesSource':True,'finalSetMatchesSource':True},'markupTokenChecks':{'sourceTokens':source['sourceMarkupTokens'],'currentTargetTokens':x['currentTargetMarkupTokens'],'finalTargetTokens':MK.findall(final),'currentSequenceMatchesSource':x['markupTokenSequenceMatches'],'finalSequenceMatchesSource':True},'numericTokenChecks':{'sourceTokens':source['sourceNumericTokens'],'currentTargetTokens':x['currentTargetNumericTokens'],'finalTargetTokens':NUM.findall(final),'currentSequenceMatchesSource':not x['numericTokenMismatch'],'finalSequenceMatchesSource':True},'protectedLiteralChecks':{'sourceLiterals':source['sourceProtectedLiterals'],'currentTargetLiterals':x['currentTargetProtectedLiterals'],'currentSetMatchesSource':not x['protectedLiteralMismatch'],'finalTargetLiterals':final_protected,'finalSetMatchesSource':all(p in final for p in source['sourceProtectedLiterals'])},'direction':info[x['locale']]['direction']}
 if disposition!='accept-current':
  common['proposedTarget']=final; common['proposedTargetSha256']=st(final)
  selected.append({k:common[k] for k in ['schemaVersion','repository','pullRequest','window','head','tree','position','locale','localeTag','sourceId','source','sourceSha256','currentTarget','currentTargetSha256','proposedTarget','proposedTargetSha256','disposition','confidence','rationale','catalogPath','catalogGitBlob','catalogSha256','callerContext']})
 ledger.append(common)
assert len(ledger)==240 and len(selected)==len(PROPOSALS)
counts=Counter(x['disposition'] for x in ledger)
assert set(counts)<= {'accept-current','correction','refinement','hold'} and counts['hold']==0
assert len(baseline)==1 and (baseline[0]['position'],baseline[0]['locale'],baseline[0]['sourceProtectedLiterals'])==(3586,'hi',['IP'])
assert (3586,'hi') in PROPOSALS
OUT.mkdir()
writejl(OUT/'primary-ledger.jsonl',ledger)
writejl(OUT/'selected-direct-locale-cells.jsonl',selected)
now=datetime.now(timezone.utc).isoformat()
provenance={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3580-W3599','head':HEAD,'tree':TREE,'candidateFreeManifestJsonSha256':MANIFEST_SHA,'candidateFreeChecksumListSha256':INPUT_SUMS_SHA,'candidateFreeHashFieldsIdentifySeparateFiles':True,'reviewType':'primary semantic review only','all240CellsReviewed':True,'callerContextsPinned':True,'callerlessHolds':0,'baselineProtectedLiteralMismatches':baseline,'baselinePlaceholderMismatches':0,'baselineMarkupMismatches':0,'baselineNumericTokenMismatches':0,'nativeSpeakerApproval':False,'exactHeadBrowserReview':False,'blindReviewIncluded':False,'reviewedAtUTC':now}
summary={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3580-W3599','head':HEAD,'tree':TREE,'candidateFreeManifestJsonSha256':MANIFEST_SHA,'candidateFreeChecksumListSha256':INPUT_SUMS_SHA,'sourceIds':20,'locales':12,'cells':240,'dispositions':dict(counts),'proposedChanges':len(selected),'proposedChangesByLocale':dict(Counter(x['locale'] for x in selected)),'proposedChangesByPosition':dict(Counter(str(x['position']) for x in selected)),'callerlessHolds':0,'baselinePlaceholderMismatches':0,'baselineMarkupMismatches':0,'baselineNumericTokenMismatches':0,'baselineProtectedLiteralMismatches':len(baseline),'finalPlaceholderMismatches':0,'finalMarkupMismatches':0,'finalNumericTokenMismatches':0,'finalProtectedLiteralMismatches':0,'nativeSpeakerApproval':False,'exactHeadBrowserReview':False,'blindReviewIncluded':False,'all240CellsReviewed':True,'reviewedAtUTC':now}
writej(OUT/'summary.json',summary); writej(OUT/'provenance.json',provenance)
(OUT/'input-verification.txt').write_text(input_check+'\n',encoding='utf-8')
readme=f"""Primary semantic review for SeerrNG PR #418 W3580-W3599, pinned to {HEAD} / tree {TREE}.

The review covers all 240 current target cells across 20 source IDs and 12 locales. Decisions: {counts['accept-current']} accept-current, {counts['correction']} corrections, {counts['refinement']} refinements, and {counts['hold']} holds. The {len(selected)} proposed changes are in selected-direct-locale-cells.jsonl with exact current/proposed hashes, caller references, rationale, and targets.

Candidate-free lineage is explicit: manifest JSON SHA-256 {MANIFEST_SHA}; checksum-list SHA-256 {INPUT_SUMS_SHA}. These are separate files. All 20 source IDs have pinned direct callers. The input records one pre-existing protected-literal mismatch: Hindi at position 3586 transliterates IP; the proposed correction restores the exact IP literal. Final proposals pass placeholder, markup, numeric, and protected-literal checks.

This is a machine primary semantic review, not qualified native-speaker approval or exact-head browser acceptance. No independent blind review is included, and this task makes no repository or PR changes.
"""
(OUT/'README.md').write_text(readme,encoding='utf-8')
shutil.copy2(T/'verify_primary_review.py',OUT/'verify_primary_review.py')
shutil.copy2(T/'build_primary_review.py',OUT/'build_primary_review.py')
checks=[f"{sha(p.read_bytes())}  {p.name}" for p in sorted(q for q in OUT.iterdir() if q.is_file() and q.name!='SHA256SUMS.txt')]
(OUT/'SHA256SUMS.txt').write_text('\n'.join(checks)+'\n',encoding='utf-8')
print(json.dumps({'result':'primary review generated','dispositions':dict(counts),'proposedChanges':len(selected),'baselineProtectedLiteralMismatches':baseline,'manifestSha256':MANIFEST_SHA,'inputChecksumListSha256':INPUT_SUMS_SHA},ensure_ascii=False,indent=2))
