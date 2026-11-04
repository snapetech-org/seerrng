#!/usr/bin/env python3
import hashlib, json, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / 'candidate-free-input'
SOURCE_WORKTREE = Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source')
EXPECTED_HEAD = 'a456dd66aad34cb23f432cb3c189bb8083bbbe96'
EXPECTED_TREE = '7a5447e5f08e84c392899a6e1400d1df73b1143b'

def sha(data):
    return hashlib.sha256(data).hexdigest()
def j(path):
    return json.loads(path.read_text(encoding='utf-8'))
def jl(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
def dumpj(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
def dumpjl(path, values):
    path.write_text(''.join(json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n' for v in values), encoding='utf-8')
def tokens(value):
    protected = re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])', value)
    return {
        'placeholders': re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}', value),
        'markupTags': re.findall(r'</?[A-Za-z][^>]*>', value),
        'numericTokens': re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])', value),
        'protectedLiterals': list(dict.fromkeys(protected)),
    }
def token_checks(source, target):
    out = {field: {'matches': source[field] == target[field], 'source': source[field], 'target': target[field]} for field in ('placeholders', 'markupTags', 'numericTokens')}
    missing = [x for x in source['protectedLiterals'] if x not in target['protectedLiterals']]
    out['protectedLiterals'] = {'matches': not missing, 'source': source['protectedLiterals'], 'target': target['protectedLiterals'], 'missingFromTarget': missing}
    return out

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()

input_manifest = j(INPUT / 'manifest.json')
assert input_manifest['head'] == EXPECTED_HEAD and input_manifest['tree'] == EXPECTED_TREE
assert input_manifest['cellCount'] == 240 and input_manifest['callerlessSourcePositions'] == []
input_result = json.loads(subprocess.run(
    [sys.executable, str(INPUT / 'verify-candidate-free.py'), '--source-worktree', str(SOURCE_WORKTREE)],
    capture_output=True, text=True, check=True
).stdout)
assert input_result['result'] == 'PASS'
assert git(SOURCE_WORKTREE, 'rev-parse', 'HEAD') == EXPECTED_HEAD
assert git(SOURCE_WORKTREE, 'rev-parse', 'HEAD^{tree}') == EXPECTED_TREE
assert not git(SOURCE_WORKTREE, 'status', '--porcelain')

proposed = {
    (3962, 'ar'): ('إدخال واحد في كل سطر: معرّف مستخدم Slack (ID)=معرّف مستخدم SeerrNG (ID). يجب أن يمتلك كل مستخدم SeerrNG مُعيّن إذن إدارة الطلبات.', 'The current Arabic conveys “identifier” but drops protected literal “ID”. Keep the Arabic wording and include the exact literal in both sides of the mapping format.', 'high'),
    (3974, 'ar'): ('أدخل معرّف مساحة عمل Slack (ID) صالحًا', 'The current Arabic translates ID but omits protected literal “ID”; include it alongside the Arabic descriptor.', 'high'),
    (3975, 'zh-Hant'): ('Webhook 網址（URL）', '“網頁 URL” means webpage URL and loses the Webhook concept. Retain the common technical term, translate URL as 網址, and preserve the protected literal URL.', 'high'),
    (3976, 'de'): ('Erstelle eine Integration für einen <WebhookLink>eingehenden Webhook</WebhookLink>.', 'The current linked phrase uses the wrong grammatical gender for masculine “Webhook” (“eingehende Webhook”). This wording is grammatical and keeps the exact link tag.', 'moderate'),
    (3976, 'fr'): ('Créer une intégration avec un <WebhookLink>webhook entrant</WebhookLink>.', '“Webhook” is masculine in French, so the current linked phrase “webhook entrante” has an agreement error. This keeps the Incoming Webhook link label and integration meaning.', 'moderate'),
    (3976, 'hi'): ('एक <WebhookLink>इनकमिंग वेबहुक</WebhookLink> इंटीग्रेशन बनाएं', 'The current word order (“बनाना … एकीकरण”) is ungrammatical for an instruction. This gives the link phrase a natural place while preserving the integration meaning and exact tag.', 'moderate'),
    (3976, 'id'): ('Buat integrasi <WebhookLink>Webhook Masuk</WebhookLink>', 'The current Indonesian order (“Webhook Masuk integrasi”) is not idiomatic. Put “integrasi” before the linked Incoming Webhook term.', 'moderate'),
    (3977, 'ar'): ('معرّف مساحة عمل Slack (ID)', 'The current Arabic translates ID but omits protected literal “ID”; include it alongside the Arabic descriptor.', 'high'),
    (3978, 'ar'): ('المعرّف (ID) لمساحة العمل المالكة لتطبيق Slack هذا.', 'The current Arabic translates ID but omits protected literal “ID”; include it alongside the Arabic descriptor.', 'high'),
}

sources = {r['position']: r for r in jl(INPUT / 'selected-source-cells.jsonl')}
callers = {r['position']: r for r in jl(INPUT / 'caller-contexts.jsonl')}
current = jl(INPUT / 'current-target-cells.jsonl')
callerless = set(input_manifest['callerlessSourcePositions'])
reviewed, proposals, holds = [], [], []
for row in current:
    pos = row['position']
    source = sources[pos]
    caller = callers[pos]
    change = proposed.get((pos, row['locale']))
    if pos in callerless:
        held = {
            'position': pos,
            'sourceIdSha256': row['sourceIdSha256'],
            'sourceTextSha256': row['sourceTextSha256'],
            'locale': row['locale'],
            'callerContextSha256': row['callerContextSha256'],
            'currentTargetSha256': row['currentTargetSha256'],
            'decision': 'hold-hash-only',
        }
        holds.append(held)
        reviewed.append(held)
        continue
    target = change[0] if change else row['currentTarget']
    decision = 'propose-replacement' if change else 'keep-current'
    note = change[1] if change else 'No clear semantic or functional correction identified; retain the current localization.'
    if not change and pos == 3962 and row['locale'] == 'ja':
        note = 'Retain: Japanese renders the source words “One per line” as 1 行に 1 件; both quantities are preserved. The diagnostic sees added digit tokens because English spells out “One”.'
    elif not change and pos == 3970 and row['locale'] == 'ja':
        note = 'Retain: 1 件以上 means “at least one” and preserves the source minimum; the diagnostic sees a digit where English spells out “one”.'
    elif not change and pos == 3972 and row['locale'] == 'ja':
        note = 'Retain: 1つ以上 means “at least one” and preserves the source minimum; the diagnostic sees a digit where English spells out “one”.'
    entry = {
        'position': pos,
        'sourceId': source['sourceId'],
        'sourceIdSha256': source['sourceIdSha256'],
        'sourceText': source['sourceText'],
        'sourceTextSha256': source['sourceTextSha256'],
        'locale': row['locale'],
        'callerContextSha256': caller['callerContextSha256'],
        'callerContextBlockIds': caller['contextBlockIds'],
        'currentTarget': row['currentTarget'],
        'currentTargetSha256': row['currentTargetSha256'],
        'decision': decision,
        'reviewNote': note,
        'reviewTarget': target,
        'reviewTargetSha256': sha(target.encode('utf-8')),
        'sourceTokens': row['sourceTokens'],
        'currentTargetTokens': row['targetTokens'],
        'currentTokenChecks': row['tokenChecks'],
    }
    if change:
        proposal_id = f'P{len(proposals)+1:02d}'
        target_tokens = tokens(target)
        checks = token_checks(source['sourceTokens'], target_tokens)
        assert all(checks[k]['matches'] for k in ('placeholders', 'markupTags', 'numericTokens', 'protectedLiterals')), (proposal_id, checks)
        entry.update({'proposalId': proposal_id, 'proposedTarget': target, 'proposedTargetTokens': target_tokens, 'proposedTokenChecks': checks})
        proposals.append({
            'proposalId': proposal_id,
            'position': pos,
            'sourceId': source['sourceId'],
            'sourceIdSha256': source['sourceIdSha256'],
            'locale': row['locale'],
            'sourceText': source['sourceText'],
            'sourceTextSha256': source['sourceTextSha256'],
            'callerContextSha256': caller['callerContextSha256'],
            'currentTarget': row['currentTarget'],
            'currentTargetSha256': row['currentTargetSha256'],
            'proposedTarget': target,
            'proposedTargetSha256': sha(target.encode('utf-8')),
            'proposedTargetTokens': target_tokens,
            'proposedTokenChecks': checks,
            'rationale': change[1],
            'confidence': change[2],
        })
    reviewed.append(entry)

assert len(reviewed) == 240 and len(proposals) == 9 and len(holds) == 0

dumpjl(ROOT / 'reviewed-cells.jsonl', reviewed)
dumpjl(ROOT / 'callerless-holds-hash-only.jsonl', holds)
dumpj(ROOT / 'proposals.json', proposals)

lineage_names = [
    'prior-selection-hash-reattestation.jsonl',
    'prior-applied-target-hash-reattestation.jsonl',
    'prior-hold-hash-reattestation.jsonl',
    'prior-evidence-hash-index.json',
    'prior-catalog-application-summary.json',
]
lineage_dir = ROOT / 'prior-lineage'
lineage_dir.mkdir(exist_ok=True)
lineage = {}
for name in lineage_names:
    source = INPUT / name
    copied = lineage_dir / name
    shutil.copyfile(source, copied)
    assert source.read_bytes() == copied.read_bytes()
    lineage[name] = {'sha256': sha(copied.read_bytes()), 'byteIdenticalToCandidateFreeInput': True}

readme = '''# SeerrNG PR #418 W3960-W3979 blind semantic review

This packet records a fresh independent blind review of all 240 current translation cells for source positions 3960-3979 and the 12 direct locales. It was prepared from the sealed candidate-free input copied under `candidate-free-input/`, with source head `a456dd66aad34cb23f432cb3c189bb8083bbbe96` and tree `7a5447e5f08e84c392899a6e1400d1df73b1143b`.

The source/caller packet verifier passed against the exact clean worktree at `/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source`. The packet verifier can repeat that check with the same `--source-worktree` argument. No repository, PR, workflow, test, build, scan, or CI changes were made.

All 240 cells have a disposition: 231 retain the current target and 9 have proposed replacements. There are no callerless cells in this window, so the new hash-only callerless-hold list is empty. The three Japanese digit diagnostics are retained because digit `1` faithfully renders “one” in context. Four Arabic proposals restore the protected literal `ID`; the remaining proposals correct one clear Traditional Chinese term error and four grammatical/order errors in Incoming Webhook help text. The Traditional Chinese replacement also retains the protected literal `URL`.

Historical lineage files are copied byte-identically under `prior-lineage/`: 3,960 prior source selections, 262 applied target hashes, and 50 hash-only holds, plus the existing evidence index and catalog application summary. The packet does not claim native-speaker approval.

`SHA256SUMS.txt` seals every packet file except itself. Rebuild or verify with:

```bash
python3 build-review-packet.py
python3 verify-review-packet.py --source-worktree /mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source
```
'''
(ROOT / 'README.md').write_text(readme, encoding='utf-8')

gen_manifest = {
    'artifact': 'SeerrNG PR #418 W3960-W3979 independent blind semantic review packet',
    'schemaVersion': 1,
    'packetType': 'blind-semantic-review',
    'reviewMode': 'independent blind review from candidate-free input',
    'repository': input_manifest['repository'],
    'pullRequest': input_manifest['pullRequest'],
    'window': input_manifest['window'],
    'head': input_manifest['head'],
    'tree': input_manifest['tree'],
    'baseRef': input_manifest['baseRef'],
    'baseSha': input_manifest['baseSha'],
    'sourceWorktree': str(SOURCE_WORKTREE),
    'candidateFreeInputManifestSha256': sha((INPUT / 'manifest.json').read_bytes()),
    'candidateFreeInputChecksumsSha256': sha((INPUT / 'SHA256SUMS.txt').read_bytes()),
    'candidateFreeVerifierResult': input_result,
    'selectedSourceCount': 20,
    'cellCount': 240,
    'localeCount': 12,
    'decisionCounts': {'keep-current': 231, 'propose-replacement': 9, 'hold-hash-only': 0},
    'proposalCount': 9,
    'callerlessSourceCount': len(callerless),
    'callerlessHashOnlyHoldCount': len(holds),
    'currentWindowHoldCount': 0,
    'nativeSpeakerApproval': False,
    'priorLineageCounts': {'selectedSourceHashes': 3960, 'appliedTargetHashes': 262, 'hashOnlyHolds': 50},
    'priorLineageFiles': lineage,
    'priorLineageSummaryFilesAlsoCopied': ['prior-evidence-hash-index.json', 'prior-catalog-application-summary.json'],
    'baselineTokenMismatchCounts': input_manifest['baselineTokenMismatchCounts'],
    'tokenMismatchAssessment': {
        'arabicProtectedIdOmissions': 'proposed replacements add exact ID literals in all four affected cells',
        'japaneseNumericTokens': 'three unchanged targets use digit 1 to express source word one; quantity and thresholds match',
    },
    'reviewedCellsFile': 'reviewed-cells.jsonl',
    'proposalsFile': 'proposals.json',
    'hashOnlyCallerlessHoldsFile': 'callerless-holds-hash-only.jsonl',
}
dumpj(ROOT / 'manifest.json', gen_manifest)

verifier = r'''#!/usr/bin/env python3
import argparse, hashlib, json, re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
EXPECTED_HEAD = 'a456dd66aad34cb23f432cb3c189bb8083bbbe96'
EXPECTED_TREE = '7a5447e5f08e84c392899a6e1400d1df73b1143b'
EXPECTED_WORKTREE = Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source')
def need(ok, msg):
    if not ok: raise SystemExit('FAIL: ' + msg)
def sha(data): return hashlib.sha256(data).hexdigest()
def j(path): return json.loads(path.read_text(encoding='utf-8'))
def jl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def git(repo, *args): return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()
def tokens(value):
    p = re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])', value)
    return {'placeholders':re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',value),'markupTags':re.findall(r'</?[A-Za-z][^>]*>',value),'numericTokens':re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',value),'protectedLiterals':list(dict.fromkeys(p))}
def checks(source,target):
    out={k:{'matches':source[k]==target[k],'source':source[k],'target':target[k]} for k in ('placeholders','markupTags','numericTokens')}
    missing=[x for x in source['protectedLiterals'] if x not in target['protectedLiterals']]
    out['protectedLiterals']={'matches':not missing,'source':source['protectedLiterals'],'target':target['protectedLiterals'],'missingFromTarget':missing}
    return out
parser=argparse.ArgumentParser(); parser.add_argument('--source-worktree',type=Path,default=EXPECTED_WORKTREE); args=parser.parse_args()
worktree=args.source_worktree.resolve(); need(worktree==EXPECTED_WORKTREE,'exact source worktree path')
need(git(worktree,'rev-parse','HEAD')==EXPECTED_HEAD,'source head'); need(git(worktree,'rev-parse','HEAD^{tree}')==EXPECTED_TREE,'source tree'); need(not git(worktree,'status','--porcelain'),'source worktree clean')
sums=(ROOT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines(); listed=set()
for line in sums:
    digest,rel=line.split('  ',1); path=ROOT/rel; need(path.is_file(),'missing sealed file '+rel); need(sha(path.read_bytes())==digest,'checksum mismatch '+rel); listed.add(rel)
actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}; need(actual==listed,'packet file set differs from seal')
manifest=j(ROOT/'manifest.json'); need(manifest['head']==EXPECTED_HEAD and manifest['tree']==EXPECTED_TREE,'manifest pins')
input_root=ROOT/'candidate-free-input'; need(sha((input_root/'manifest.json').read_bytes())==manifest['candidateFreeInputManifestSha256'],'candidate-free manifest hash'); need(sha((input_root/'SHA256SUMS.txt').read_bytes())==manifest['candidateFreeInputChecksumsSha256'],'candidate-free checksum manifest hash')
result=subprocess.run([sys.executable,str(input_root/'verify-candidate-free.py'),'--source-worktree',str(worktree)],check=True,capture_output=True,text=True); input_result=json.loads(result.stdout); need(input_result['result']=='PASS','candidate-free verifier')
sources={x['position']:x for x in jl(input_root/'selected-source-cells.jsonl')}; callers={x['position']:x for x in jl(input_root/'caller-contexts.jsonl')}; current=jl(input_root/'current-target-cells.jsonl'); reviewed=jl(ROOT/'reviewed-cells.jsonl'); proposals=j(ROOT/'proposals.json'); holds=jl(ROOT/'callerless-holds-hash-only.jsonl')
need(len(current)==len(reviewed)==240,'all current cells reviewed'); need(len(proposals)==9,'proposal count'); need(not holds,'callerless hash-only holds')
cur={(x['position'],x['locale']):x for x in current}; rev={(x['position'],x['locale']):x for x in reviewed}; prop={(x['position'],x['locale']):x for x in proposals}
need(len(rev)==240 and set(cur)==set(rev),'review identity parity'); need(len(prop)==len(proposals),'proposal identity uniqueness')
counts={'keep-current':0,'propose-replacement':0,'hold-hash-only':0}
for key,row in rev.items():
    baseline=cur[key]; source=sources[key[0]]; caller=callers[key[0]]
    need(row['sourceIdSha256']==source['sourceIdSha256']==baseline['sourceIdSha256'],'source id hash '+str(key))
    need(row['sourceTextSha256']==source['sourceTextSha256']==baseline['sourceTextSha256'],'source text hash '+str(key))
    need(row['callerContextSha256']==caller['callerContextSha256']==baseline['callerContextSha256'],'caller context hash '+str(key))
    need(row['currentTargetSha256']==baseline['currentTargetSha256'] and row['currentTarget']==baseline['currentTarget'],'current target hash/text '+str(key))
    need(row['sourceText']==source['sourceText'],'source text '+str(key)); need(row['reviewTargetSha256']==sha(row['reviewTarget'].encode()),'review target hash '+str(key))
    counts[row['decision']]+=1
    if row['decision']=='keep-current':
        need(key not in prop and row['reviewTarget']==row['currentTarget'],'kept cell '+str(key))
    elif row['decision']=='propose-replacement':
        need(key in prop,'proposal missing '+str(key)); p=prop[key]
        need(row['reviewTarget']==row['proposedTarget']==p['proposedTarget'],'proposal parity '+str(key))
        computed=checks(row['sourceTokens'],tokens(row['reviewTarget']))
        need(all(v['matches'] for v in computed.values()),'proposal token preservation '+str(key))
        need(computed==row['proposedTokenChecks']==p['proposedTokenChecks'],'proposal token audit '+str(key))
    else:
        need(row['decision']=='hold-hash-only','unknown decision')
        need(not any(k in row for k in ('sourceText','currentTarget','reviewTarget','proposedTarget')),'hold includes text')
need(counts==manifest['decisionCounts']=={'keep-current':231,'propose-replacement':9,'hold-hash-only':0},'decision counts')
need(set(prop)=={k for k,v in rev.items() if v['decision']=='propose-replacement'},'proposal/disposition parity')
for name,info in manifest['priorLineageFiles'].items():
    original=input_root/name; copied=ROOT/'prior-lineage'/name
    need(original.read_bytes()==copied.read_bytes(),'lineage bytes '+name); need(sha(copied.read_bytes())==info['sha256'],'lineage hash '+name)
expected_rows={'prior-selection-hash-reattestation.jsonl':3960,'prior-applied-target-hash-reattestation.jsonl':262,'prior-hold-hash-reattestation.jsonl':50}
for name,count in expected_rows.items(): need(len(jl(ROOT/'prior-lineage'/name))==count,'lineage row count '+name)
print(json.dumps({'result':'PASS','head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'sourceWorktreeClean':True,'candidateFreeInput':input_result['result'],'reviewedCells':len(reviewed),'decisionCounts':counts,'proposals':len(proposals),'callerlessHashOnlyHolds':len(holds),'priorLineageRows':expected_rows,'checksumFiles':len(listed)},ensure_ascii=False,indent=2))
'''
(ROOT / 'verify-review-packet.py').write_text(verifier, encoding='utf-8')

readme = '''# SeerrNG PR #418 W3960-W3979 blind semantic review

This packet records a fresh independent blind review of all 240 current translation cells for source positions 3960-3979 and the 12 direct locales. It was prepared from the sealed candidate-free input copied under `candidate-free-input/`, with source head `a456dd66aad34cb23f432cb3c189bb8083bbbe96` and tree `7a5447e5f08e84c392899a6e1400d1df73b1143b`.

The source/caller packet verifier passed against the exact clean worktree at `/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source`. The packet verifier can repeat that check with the same `--source-worktree` argument. No repository, PR, workflow, test, build, scan, or CI changes were made.

All 240 cells have a disposition: 231 retain the current target and 9 have proposed replacements. There are no callerless cells in this window, so the new hash-only callerless-hold list is empty. The three Japanese digit diagnostics are retained because digit `1` faithfully renders “one” in context. Four Arabic proposals restore the protected literal `ID`; the remaining proposals correct one clear Traditional Chinese term error and four grammatical/order errors in Incoming Webhook help text. The Traditional Chinese replacement also retains the protected literal `URL`.

Historical lineage files are copied byte-identically under `prior-lineage/`: 3,960 prior source selections, 262 applied target hashes, and 50 hash-only holds, plus the existing evidence index and catalog application summary. The packet does not claim native-speaker approval.

`SHA256SUMS.txt` seals every packet file except itself. Rebuild or verify with:

```bash
python3 build-review-packet.py
python3 verify-review-packet.py --source-worktree /mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source
```
'''
(ROOT / 'README.md').write_text(readme, encoding='utf-8')

manifest = {
    'artifact': 'SeerrNG PR #418 W3960-W3979 independent blind semantic review packet',
    'schemaVersion': 1,
    'packetType': 'blind-semantic-review',
    'reviewMode': 'independent blind review from candidate-free input',
    'repository': input_manifest['repository'], 'pullRequest': input_manifest['pullRequest'],
    'window': input_manifest['window'], 'head': input_manifest['head'], 'tree': input_manifest['tree'],
    'baseRef': input_manifest['baseRef'], 'baseSha': input_manifest['baseSha'],
    'sourceWorktree': str(SOURCE_WORKTREE),
    'candidateFreeInputManifestSha256': sha((INPUT / 'manifest.json').read_bytes()),
    'candidateFreeInputChecksumsSha256': sha((INPUT / 'SHA256SUMS.txt').read_bytes()),
    'candidateFreeVerifierResult': input_result,
    'selectedSourceCount': 20, 'cellCount': 240, 'localeCount': 12,
    'decisionCounts': {'keep-current': 231, 'propose-replacement': 9, 'hold-hash-only': 0},
    'proposalCount': 9, 'callerlessSourceCount': len(callerless),
    'callerlessHashOnlyHoldCount': len(holds), 'currentWindowHoldCount': 0,
    'nativeSpeakerApproval': False,
    'priorLineageCounts': {'selectedSourceHashes': 3960, 'appliedTargetHashes': 262, 'hashOnlyHolds': 50},
    'priorLineageFiles': lineage,
    'priorLineageSummaryFilesAlsoCopied': ['prior-evidence-hash-index.json', 'prior-catalog-application-summary.json'],
    'baselineTokenMismatchCounts': input_manifest['baselineTokenMismatchCounts'],
    'tokenMismatchAssessment': {
        'arabicProtectedIdOmissions': 'proposed replacements add exact ID literals in all four affected cells',
        'japaneseNumericTokens': 'three unchanged targets use digit 1 to express source word one; quantity and thresholds match',
    },
    'reviewedCellsFile': 'reviewed-cells.jsonl', 'proposalsFile': 'proposals.json',
    'hashOnlyCallerlessHoldsFile': 'callerless-holds-hash-only.jsonl',
}
dumpj(ROOT / 'manifest.json', manifest)

files = sorted(p for p in ROOT.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.txt')
(ROOT / 'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(ROOT).as_posix()}\n' for p in files), encoding='utf-8')
print(json.dumps({'packet': str(ROOT), 'fileCount': len(files) + 1, 'reviewedCells': len(reviewed), 'proposals': len(proposals), 'callerlessHashOnlyHolds': len(holds), 'inputVerification': input_result['result']}, ensure_ascii=False, indent=2))
