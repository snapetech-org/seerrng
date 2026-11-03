from __future__ import annotations
import collections, hashlib, json, re, subprocess
from pathlib import Path

root=Path('/mnt/disks/scratch/task-scratch')
input_dir=root/'seerrng-pr418-w3500-3519-candidate-free-20261103/candidate-free-input'
primary_dir=root/'seerrng-pr418-w3500-3519-primary-review-20261103'
blind_dir=root/'seerrng-pr418-w3500-3519-independent-blind-20261103'
out=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3500-3519-cross-audit-20261103')
repo='snapetech-org/SeerrNG'; pr_num=418
head='9bb8fd4695b207165e4bb8e56c5239eb50cee37c'; tree='74a4b0208108be4bc593c63c8ac55b4a2df74862'

def sha(b:bytes)->str: return hashlib.sha256(b).hexdigest()
def text_sha(s:str)->str: return sha(s.encode('utf-8'))
def jline(obj)->str: return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def verify(folder:Path, manifest:str): subprocess.check_call(['sha256sum','-c',manifest],cwd=folder,stdout=subprocess.DEVNULL)

assert out.exists() and [p.name for p in out.iterdir()]==['build_cross_audit.py']
verify(input_dir,'SHA256SUMS.txt'); verify(primary_dir,'SHA256SUMS'); verify(blind_dir,'SHA256SUMS.txt')
pr=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/pulls/{pr_num}'],text=True))
assert pr['state']=='open' and pr['draft'] is True and pr['head']['sha']==head
commit=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/git/commits/{head}'],text=True))
assert commit['tree']['sha']==tree
check_runs=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/commits/{head}/check-runs'],text=True))['check_runs']
deployments=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/deployments?sha={head}'],text=True))
reviews=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/pulls/{pr_num}/reviews'],text=True))
comments=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/issues/{pr_num}/comments'],text=True))

window=json.loads((input_dir/'window.json').read_text(encoding='utf-8'))
source_rows=[json.loads(x) for x in (input_dir/'source-cells.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
current_rows=[json.loads(x) for x in (input_dir/'current-target-cells.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
caller_rows=[json.loads(x) for x in (input_dir/'caller-contexts.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
blocks=[json.loads(x) for x in (input_dir/'caller-context-blocks.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
primary=[json.loads(x) for x in (primary_dir/'primary-ledger.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
blind=[json.loads(x) for x in (blind_dir/'blind-decisions.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
assert window['head']==head and window['tree']==tree and window['range']==[3500,3519]
assert len(source_rows)==20 and len(current_rows)==240 and len(caller_rows)==20 and len(blocks)==40
assert len(primary)==240 and len(blind)==240
source_by_pos={r['position']:r for r in source_rows}
caller_by_pos={r['position']:r for r in caller_rows}
block_by_id={r['contextId']:r for r in blocks}
primary_by_key={(r['position'],r['locale']):r for r in primary}
blind_by_key={(r['position'],r['locale']):r for r in blind}
current_by_key={(r['position'],r['locale']):r for r in current_rows}
assert set(primary_by_key)==set(blind_by_key)==set(current_by_key)
manifest_sha=sha((input_dir/'SHA256SUMS.txt').read_bytes())
assert json.loads((primary_dir/'summary.json').read_text())['candidateFreeInputManifestSha256']==manifest_sha
assert json.loads((blind_dir/'summary.json').read_text())['candidateFreeInputSha256']==manifest_sha

# Independent final adjudication for the exact cells where the combined review supports a target change.
finals={}
def choose(pos,locale,disposition,target,rationale): finals[(pos,locale)]=(disposition,target,rationale)
choose(3505,'es','refinement','Inténtalo de nuevo','The pinned direct render is a retry button. Drop sentence-final punctuation to match concise action-label style.')
choose(3505,'hi','refinement','फिर से कोशिश करें','Use the polite retry action form for a user-facing button instead of the casual command.')
choose(3505,'fr','refinement','Réessayer','The direct caller is an action button; the concise French infinitive is the standard button form and avoids the casual “try again” phrasing.')
choose(3505,'pt_BR','refinement','Tente novamente','This is a button label; remove terminal punctuation while keeping the established polite imperative.')
choose(3505,'vi','refinement','Thử lại','This retry button benefits from the concise action form; “đi” makes the label unnecessarily conversational.')
choose(3508,'zh_Hant','correction','目前無法搜尋。','The current value uses the Simplified search term and leaves a space before punctuation. Use the catalog’s Traditional 搜尋 term and standard punctuation.')
choose(3508,'vi','correction','Tìm kiếm hiện không khả dụng.','The current wording says search is not ready; the source states the feature is unavailable. The revised sentence expresses that state directly.')
choose(3509,'es','correction','No se pudo acceder al catálogo. Inténtalo de nuevo.','Replace the unnatural passive “could not be reached” calque with idiomatic software-access language; preserve the retry instruction.')
choose(3509,'hi','correction','कैटलॉग तक पहुँचा नहीं जा सका। फिर से कोशिश करें।','The catalog is the destination that could not be reached; the current wording makes it an agent. The revised passive keeps the intended meaning and uses polite retry copy.')
choose(3509,'fr','refinement','Impossible d’accéder au catalogue. Réessaie.','The current phrase is a literal “catalog could not be reached” construction. Use idiomatic access wording and preserve the existing informal retry tone.')
choose(3509,'pt_BR','refinement','Não foi possível acessar o catálogo. Tente novamente.','Use idiomatic Brazilian Portuguese for an unavailable network resource and keep the retry action.')
choose(3509,'id','refinement','Katalog tidak dapat diakses. Coba lagi.','“Diakses” is natural for reaching a catalog in this software error context; keep the retry instruction.')
choose(3510,'zh_Hans','correction','搜索结果','The current value mixes Simplified 搜索 with Traditional 結果. Use Simplified 结果 throughout.')
choose(3513,'pt_BR','refinement','Software','This is a software media-type category; the established loanword is more precise than the broader “Programas.”')
choose(3514,'id','refinement','Urutkan berdasarkan','This is a filter-section label. “Urutkan berdasarkan” is idiomatic Indonesian for “Sort By.”')
choose(3515,'zh_Hant','correction','體育','The current Traditional Chinese catalog contains Simplified 体. Use the Traditional character 體.')
choose(3518,'es','refinement','No se pudieron cargar las clasificaciones','CertificationSelector values are country-specific media content classifications. “Clasificaciones” is clearer than the accreditation-like “certificaciones.”')
choose(3518,'vi','refinement','Không thể tải phân loại độ tuổi','These are country-specific media classifications, not personal certificates. This phrase names the age-rating classification data.')
choose(3518,'id','refinement','Gagal memuat klasifikasi usia','These are country-specific media classifications, so name age classifications instead of generic certifications.')
choose(3519,'es','refinement','Clasificación máxima','This is the maximum content-classification filter, not a user-score maximum. “Clasificación” disambiguates the field.')
choose(3519,'id','refinement','Klasifikasi usia maksimum','The country-specific certification selector uses age/content classifications; this names that scale rather than a generic rating.')

source_ph_re=re.compile(r'\{[^{}]+\}')
ledger=[]
for r in current_rows:
    key=(r['position'],r['locale']); p=primary_by_key[key]; b=blind_by_key[key]
    s=source_by_pos[r['position']]; c=caller_by_pos[r['position']]
    assert r['head']==p['head']==b['head']==head and r['tree']==p['tree']==b['tree']==tree
    assert r['sourceId']==p['sourceId']==b['sourceId']==s['sourceId']
    assert r['source']==p['source']==b['source']==s['source']
    assert r['currentTarget']==p['currentTarget']==b['currentTarget']
    assert r['currentTargetSha256']==text_sha(r['currentTarget'])
    assert r['placeholderTokenSequenceMatches'] and r['placeholderTokenSetMatchesSource']
    assert p['placeholderTokenChecks']['finalSequenceMatchesSource'] and p['placeholderTokenChecks']['finalSetMatchesSource']
    assert source_ph_re.findall(s['source'])==source_ph_re.findall(r['currentTarget'])
    assert c['callerCount']>0 and p['namespace']==c['namespace']
    assert c['head']==head and all(x in block_by_id for x in c['contextBlockIds'])
    if key in finals:
        disp,target,rationale=finals[key]
    else:
        disp='accept-current';target=r['currentTarget']
        rationale='Independent primary and blind reviews identify no required correction or refinement; the current target matches the direct caller context and preserves the source meaning.'
    assert target and source_ph_re.findall(s['source'])==source_ph_re.findall(target)
    assert disp in {'accept-current','correction','refinement'}
    ptarget=p['finalTarget']; btarget=b['recommendedTarget']
    target_disagree=ptarget!=btarget
    disp_disagree=p['disposition']!=b['recommendedDisposition']
    ledger.append({
      'schemaVersion':1,'repository':repo,'pullRequest':pr_num,'window':'W3500-W3519',
      'head':head,'tree':tree,'position':r['position'],'sourceId':r['sourceId'],'sourceKey':r['sourceKey'],
      'source':r['source'],'sourceSha256':r['sourceSha256'],'locale':r['locale'],'localeTag':r['localeTag'],
      'namespace':c['namespace'],'catalogPath':r['catalogPath'],'catalogGitBlob':r['catalogGitBlob'],
      'catalogSha256':r['catalogSha256'],'currentTarget':r['currentTarget'],'currentTargetSha256':r['currentTargetSha256'],
      'primaryDisposition':p['disposition'],'primaryTarget':ptarget,'primaryTargetSha256':p['finalTargetSha256'],
      'primaryConfidence':p['confidence'],'primaryRationale':p['rationale'],
      'blindDisposition':b['recommendedDisposition'],'blindTarget':btarget,'blindTargetSha256':b['recommendedTargetSha256'],
      'blindRationale':b['rationale'],'dispositionDisagreement':disp_disagree,'targetDisagreement':target_disagree,
      'finalDisposition':disp,'finalTarget':target,'finalTargetSha256':text_sha(target),
      'changeFromCurrent':target!=r['currentTarget'],'selectedForApplication':target!=r['currentTarget'],
      'placeholderSequenceMatchesSource':source_ph_re.findall(s['source'])==source_ph_re.findall(target),
      'placeholderTokenSetMatchesSource':set(source_ph_re.findall(s['source']))==set(source_ph_re.findall(target)),
      'callerCount':c['callerCount'],'callerResolution':c['callerResolution'],'contextBlockIds':c['contextBlockIds'],
      'contextBlockSha256':[sha(jline(block_by_id[x]).encode('utf-8')) for x in c['contextBlockIds']],
      'inputRowSha256':sha(jline(r).encode('utf-8')),'finalRationale':rationale
    })

counts=collections.Counter(r['finalDisposition'] for r in ledger)
assert len(ledger)==240 and len({(r['position'],r['locale']) for r in ledger})==240
assert counts=={'accept-current':219,'correction':6,'refinement':15},counts
assert sum(r['selectedForApplication'] for r in ledger)==21
assert all(r['callerCount']>0 and r['placeholderSequenceMatchesSource'] and r['placeholderTokenSetMatchesSource'] for r in ledger)
assert all(not r['selectedForApplication'] for r in ledger if r['finalDisposition']=='accept-current')
assert all(r['selectedForApplication'] for r in ledger if r['finalDisposition'] in {'correction','refinement'})

# Cross-review deltas are reported row by row for independent auditability.
disp_diffs=[{'position':r['position'],'sourceId':r['sourceId'],'locale':r['locale'],'primaryDisposition':r['primaryDisposition'],'blindDisposition':r['blindDisposition'],'finalDisposition':r['finalDisposition'],'finalTarget':r['finalTarget']} for r in ledger if r['dispositionDisagreement']]
target_diffs=[{'position':r['position'],'sourceId':r['sourceId'],'locale':r['locale'],'currentTarget':r['currentTarget'],'primaryTarget':r['primaryTarget'],'blindTarget':r['blindTarget'],'finalTarget':r['finalTarget']} for r in ledger if r['targetDisagreement']]
holds=[]
locale_counts=collections.Counter(r['locale'] for r in ledger if r['selectedForApplication'])
input_digest=sha((input_dir/'SHA256SUMS.txt').read_bytes())
primary_digest=sha((primary_dir/'primary-ledger.jsonl').read_bytes())
blind_digest=sha((blind_dir/'blind-decisions.jsonl').read_bytes())
summary={
 'schemaVersion':1,'repository':repo,'pullRequest':pr_num,'state':pr['state'],'draft':pr['draft'],
 'head':head,'tree':tree,'window':'W3500-W3519','sourceIds':20,'localeCount':12,'cells':240,
 'sourceOrderCount':window['sourceOrderCount'],'sourceOrderSha256':window['sourceOrderSha256'],
 'callerBackedSourceIds':20,'callerlessSourceIds':0,'callerBlocks':len(blocks),
 'finalDispositions':dict(sorted(counts.items())),'selectedChanges':21,'selectedByLocale':dict(sorted(locale_counts.items())),
 'readbackRequired':True,'applicationReadbackComplete':False,'placeholderMismatches':0,
 'primaryBlindDispositionDisagreements':len(disp_diffs),'primaryBlindTargetDisagreements':len(target_diffs),
 'callerPathHolds':0,'nativeSpeakerApproval':False,'exactHeadBrowserReview':False,
 'checkRuns':len(check_runs),'deployments':len(deployments),'submittedReviews':len(reviews),'issueComments':len(comments),
 'releaseApproved':False,'candidateFreeManifestSha256':input_digest,
 'primaryLedgerSha256':primary_digest,'blindLedgerSha256':blind_digest
}

# Check output folder contains no unexpected content before writing artifacts.
assert [p.name for p in out.iterdir()]==['build_cross_audit.py']
ledger_path=out/'cross-audit-ledger.jsonl'
ledger_path.write_text(''.join(jline(x)+'\n' for x in ledger),encoding='utf-8')
(out/'disagreement-and-hold-summary.json').write_text(json.dumps({'schemaVersion':1,'repository':repo,'pullRequest':pr_num,'window':'W3500-W3519','head':head,'tree':tree,'dispositionDisagreementCount':len(disp_diffs),'dispositionDisagreements':disp_diffs,'targetDisagreementCount':len(target_diffs),'targetDisagreements':target_diffs,'holdCount':0,'holds':holds,'selectedChanges':21,'finalDispositions':dict(sorted(counts.items()))},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'attestation.json').write_text(json.dumps({'repository':repo,'pullRequest':pr_num,'head':head,'tree':tree,'prState':pr['state'],'draft':pr['draft'],'remoteHeadVerified':True,'checksumsVerified':True,'candidateFreeManifestSha256':input_digest,'primaryLedgerSha256':primary_digest,'blindLedgerSha256':blind_digest,'crossAuditLedgerSha256':sha(ledger_path.read_bytes()),'allRowsCallerPinned':True,'allPlaceholderChecksPassed':True,'noRepoFilesEdited':True,'noTestsBuildsScansOrCI':True,'nativeSpeakerApproval':False,'exactHeadBrowserReview':False},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report=f'''# SeerrNG PR #418 W3500–W3519 third-party cross-audit\n\n- Exact parent: `{head}` / tree `{tree}`. The pull request is open and draft.\n- Coverage: 20 source IDs × 12 locales = 240 cells. All 20 have pinned direct callers in the expected message namespace; all placeholder checks pass.\n- Reconciled outcome: 219 accept-current, 6 corrections, 15 refinements; no caller holds. The cross-audit selects 21 target updates.\n- Primary and blind review dispositions differ on {len(disp_diffs)} cells and proposed targets differ on {len(target_diffs)}. Row-level differences and adjudication are in `disagreement-and-hold-summary.json`; every cell, including no-op acceptances, is in `cross-audit-ledger.jsonl`.\n\n## Adjudication notes\n\nThe source word “Try again” is rendered on a button, so the selected French and Hindi targets use natural action forms, Vietnamese removes the conversational particle, and Spanish/Brazilian Portuguese omit sentence punctuation. The search-unavailable copy is corrected in Vietnamese and Traditional Chinese; Traditional Chinese uses `搜尋` consistently and the stray pre-punctuation space is removed. The Simplified Chinese Search Results target is corrected from a mixed-script value. The Indonesian Sort By label is made idiomatic.\n\nCertificationSelector loads country-specific media certification classifications. Spanish, Vietnamese, and Indonesian loading messages use classification wording; the maximum-rating fields in Spanish and Indonesian name that same classification scale. Portuguese `Software` is more precise than `Programas` for the media-type category.\n\n## Validation and remaining acceptance\n\nInput, primary, and blind manifests verified. GitHub reports {len(check_runs)} check runs and {len(deployments)} deployments for this exact head; no submitted reviews or issue comments were present at audit time. The application readback is not yet complete. Qualified native-speaker approval and exact-head deployed browser review remain pending. No repository files, tests, builds, scans, CI runs, workflow edits, merge, release, or tag were made.\n'''
(out/'report.md').write_text(report,encoding='utf-8')
(out/'verify_cross_audit_evidence.py').write_text('''from __future__ import annotations\nimport hashlib,json\nfrom pathlib import Path\np=Path(__file__).resolve().parent\ndef sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()\nrows=[json.loads(x) for x in (p/'cross-audit-ledger.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]\ns=json.loads((p/'summary.json').read_text(encoding='utf-8'))\nd=json.loads((p/'disagreement-and-hold-summary.json').read_text(encoding='utf-8'))\na=json.loads((p/'attestation.json').read_text(encoding='utf-8'))\nassert len(rows)==240 and len({(r['position'],r['locale']) for r in rows})==240\nassert s['finalDispositions']=={'accept-current':219,'correction':6,'refinement':15}\nassert s['selectedChanges']==21 and sum(r['selectedForApplication'] for r in rows)==21\nassert all(r['head']==s['head'] and r['tree']==s['tree'] for r in rows)\nassert all(r['callerCount']>0 and r['placeholderSequenceMatchesSource'] and r['placeholderTokenSetMatchesSource'] for r in rows)\nassert d['holdCount']==0 and a['remoteHeadVerified'] and a['checksumsVerified']\nassert a['crossAuditLedgerSha256']==sha((p/'cross-audit-ledger.jsonl').read_bytes())\nprint({'rows':len(rows),'selectedChanges':21,'dispositionCounts':s['finalDispositions'],'dispositionDisagreements':d['dispositionDisagreementCount'],'targetDisagreements':d['targetDisagreementCount'],'holds':0,'allPlaceholdersPass':True})\n''',encoding='utf-8')
files=sorted(p for p in out.rglob('*') if p.is_file() and p!=out/'SHA256SUMS.txt')
(out/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(out).as_posix()}\n' for p in files),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,sort_keys=True))
