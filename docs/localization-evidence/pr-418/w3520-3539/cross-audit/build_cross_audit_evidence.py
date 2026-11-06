from __future__ import annotations
import collections, hashlib, json, re, shutil, subprocess
from pathlib import Path

BASE=Path('/mnt/disks/scratch/task-scratch')
INPUT=BASE/'seerrng-pr418-w3520-3539-candidate-free-20261103/candidate-free-input'
PRIMARY=BASE/'seerrng-pr418-w3520-3539-primary-review-20261103'
BLIND=BASE/'seerrng-pr418-w3520-3539-independent-blind-20261103/review'
OUTPUT=BASE/'seerrng-pr418-w3520-3539-cross-audit-20261103'
REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261103/seerrng-pr418-w3500-apply-20261103')
HEAD='265171657d48ef56ee81cc1c6a5c3d07abe5d07e'
TREE='402984893883cf7afd106cd208f6027d7410f2fb'
BRANCH='codex/seerrng-localization-overhaul-20261028'
EXPECTED_INPUT_MANIFEST='9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63'
EXPECTED_INPUT_SUMS='2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d'
EXPECTED_PRIMARY_SUMS='225c152bc63d8140ffb80d59fef7db8bf88053601fd8d3e613e97ffeca2d1471'
EXPECTED_BLIND_SUMS='7efeee5cec4b85e3699aa12f6bdde5cf6d3f982df8b2c16eb0c9fcc934abad00'
EXPECTED_BASE='221d8e0d542802da7529cd272c928cc747677e5c'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

# For disagreement rows, choose a source proposal and record why caller context supports it.
RESOLVE={
 (3522,'es'):('primary','The pinned CertificationSelector placeholder is adjacent to min/max rating controls. In this content-rating context, clasificación is the natural Spanish name for the rating category; certificación can suggest a certificate.'),
 (3522,'fr'):('primary','The pinned CertificationSelector placeholder is adjacent to min/max rating controls. In this content-rating context, classification is the natural French name for the rating category; certification can suggest a formal certificate.'),
 (3522,'id'):('primary','The pinned CertificationSelector and rating controls show that the choice is an age-rating category. Klasifikasi usia expresses that category more clearly than sertifikasi.'),
 (3522,'vi'):('primary','The pinned CertificationSelector and rating controls show that the choice is an age-rating category. Phân loại độ tuổi is clearer than chứng nhận, which means a certificate.'),
 (3525,'ar'):('primary','Both proposals fix the current adjective agreement. The primary phrasing pairs the masculine plural مزوّدي with المتاحين and retains service-provider specificity.'),
 (3525,'zh_Hans'):('primary','This is a list of streaming providers. 服务提供商 names that service-provider concept more precisely than the generic 提供商.'),
 (3527,'de'):('blind','The exact caller places Canceled beside Planned, Returning Series and Ended in a television-series status selector. Abgesetzt is the conventional German status for a canceled show; Abgebrochen suggests an interrupted action.'),
 (3527,'ja'):('blind','The exact caller places Canceled beside other television-series lifecycle statuses. 打ち切り describes a series being canceled; キャンセルされました reads as cancellation of an action.'),
 (3528,'id'):('blind','The caller clears the selected-provider array. Hapus semua pilihan says to clear selections; Hapus Semua can imply deleting all providers.'),
 (3528,'vi'):('blind','The caller clears the selected-provider array. Bỏ chọn tất cả means deselect all; Xoá tất cả can imply deleting the providers.'),
 (3529,'ja'):('primary','The exact caller lists Ended as a television-series lifecycle status. 放送終了 states that broadcast has ended; 完了 is generic completion.'),
 (3531,'id'):('primary','The current sentence lacks the relative marker yang and sounds clipped. The primary proposal is grammatical Indonesian for no providers being available in the region.'),
 (3532,'vi'):('primary','The direct caller uses this as the disabled reason when no providers are selected. Hiện chưa có nhà cung cấp nào được chọn explicitly expresses the current empty selection.'),
 (3532,'zh_Hans'):('primary','The direct caller describes an empty selection among streaming providers. 服务提供商 is more precise than generic 提供者, and the proposal removes the current spacing error.'),
 (3532,'zh_Hant'):('primary','The direct caller describes an empty selection among streaming providers. 服務提供商 is more precise than generic 提供者, and the proposal removes the current spacing error.'),
 (3535,'fr'):('blind','The status list contains series states, so the implied noun série is feminine. Planifiée is grammatical French and avoids the parenthetical gender notation Planifié(e).'),
 (3535,'ja'):('primary','The exact caller lists Planned beside other television-series lifecycle states. 計画中 means the series is in the planned state; 計画済み can imply that planning itself is complete.'),
 (3535,'vi'):('primary','The exact caller uses this as a series lifecycle state. Dự kiến is a concise status label; Đã lên kế hoạch reads as a completed planning action.'),
 (3535,'zh_Hant'):('primary','The current value uses Simplified Chinese 计 in the Traditional locale. The primary proposal uses Traditional script and expresses the planned state.'),
 (3536,'fr'):('primary','The direct caller places Returning Series among series lifecycle states. Série en cours is the natural French status for an ongoing series; Série de retour is a literal calque.'),
 (3539,'ko'):('blind','This is a selector placeholder. The no-space Unicode ellipsis in 상태 선택… is a cleaner compact label than a spaced three-period sequence.'),
}

VERIFY_SCRIPT='''from __future__ import annotations\nimport collections, hashlib, json\nfrom pathlib import Path\nROOT=Path(__file__).resolve().parent\nBASE=Path('/mnt/disks/scratch/task-scratch')\nINPUT=BASE/'seerrng-pr418-w3520-3539-candidate-free-20261103/candidate-free-input'\nPRIMARY=BASE/'seerrng-pr418-w3520-3539-primary-review-20261103'\nBLIND=BASE/'seerrng-pr418-w3520-3539-independent-blind-20261103/review'\ndef sha(b): return hashlib.sha256(b).hexdigest()\ndef rows(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x]\ndef verify_sums(p):\n out=[]\n for line in (p/'SHA256SUMS.txt').read_text().splitlines():\n  h,n=line.split(None,1); n=n.lstrip('* '); a=sha((p/n).read_bytes()); out.append((h==a,n))\n return out\nassert all(ok for ok,_ in verify_sums(ROOT))\nassert all(ok for ok,_ in verify_sums(INPUT))\nassert all(ok for ok,_ in verify_sums(PRIMARY))\nassert all(ok for ok,_ in verify_sums(BLIND))\nledger=rows(ROOT/'cross-audit-ledger.jsonl'); assert len(ledger)==240\nsummary=json.loads((ROOT/'summary.json').read_text())\ndisposition_differences=rows(ROOT/'disposition-differences.jsonl'); assert len(disposition_differences)==summary['dispositionDifferences']\nassert dict(collections.Counter(x['crossDisposition'] for x in ledger))==summary['crossDispositions']\nassert sum(x['crossTarget']!=x['currentTarget'] for x in ledger)==summary['finalProposedChanges']\nassert sum(x['targetAgreement'] is False for x in ledger)==summary['targetDisagreements']\nassert sum(not x['placeholderTokensMatchSource'] for x in ledger)==0\nassert summary['head']=='265171657d48ef56ee81cc1c6a5c3d07abe5d07e'\nprint(json.dumps({'result':'PASS','cells':len(ledger),'crossDispositions':summary['crossDispositions'],'finalProposedChanges':summary['finalProposedChanges'],'targetDisagreements':summary['targetDisagreements'],'allPacketAndAuditChecksumsVerified':True},ensure_ascii=False,indent=2))\n'''

def sha(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha(s.encode('utf-8'))
def load(path): return json.loads(path.read_text(encoding='utf-8'))
def jloadl(path): return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]
def verify_sums(directory):
    result=[]
    for line in (directory/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        expected,name=line.split(None,1); name=name.lstrip('* '); actual=sha((directory/name).read_bytes())
        result.append({'path':name,'expected':expected,'actual':actual,'matches':expected==actual})
    return result
def gather_pins(value):
    out=[]
    if isinstance(value,dict):
        if {'path','sha256','gitBlob'}<=set(value): out.append(value)
        else:
            for child in value.values(): out.extend(gather_pins(child))
    elif isinstance(value,list):
        for child in value: out.extend(gather_pins(child))
    return out

def git(*args): return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()
def git_raw(path): return subprocess.check_output(['git','show',f'{HEAD}:{path}'],cwd=REPO)

assert not OUTPUT.exists(),f'refusing existing output {OUTPUT}'
assert INPUT.is_dir() and PRIMARY.is_dir() and BLIND.is_dir()
input_sums=verify_sums(INPUT); primary_sums=verify_sums(PRIMARY); blind_sums=verify_sums(BLIND)
assert len(input_sums)==12 and all(x['matches'] for x in input_sums)
assert len(primary_sums)==7 and all(x['matches'] for x in primary_sums)
assert len(blind_sums)==6 and all(x['matches'] for x in blind_sums)
input_manifest=load(INPUT/'manifest.json')
input_manifest_sha=sha((INPUT/'manifest.json').read_bytes())
input_sums_sha=sha((INPUT/'SHA256SUMS.txt').read_bytes())
primary_sums_sha=sha((PRIMARY/'SHA256SUMS.txt').read_bytes())
blind_sums_sha=sha((BLIND/'SHA256SUMS.txt').read_bytes())
assert input_manifest_sha==EXPECTED_INPUT_MANIFEST and input_sums_sha==EXPECTED_INPUT_SUMS
assert primary_sums_sha==EXPECTED_PRIMARY_SUMS and blind_sums_sha==EXPECTED_BLIND_SUMS
assert input_manifest_sha!=input_sums_sha
assert input_manifest['head']==HEAD and input_manifest['tree']==TREE and input_manifest['window']=='W3520-W3539'
for f in input_manifest['files']:
    assert sha((INPUT/f['path']).read_bytes())==f['sha256']
    assert (INPUT/f['path']).stat().st_size==f['byteCount']
attestation=load(INPUT/'PR-attestation.json')
primary_provenance=load(PRIMARY/'provenance.json'); primary_summary=load(PRIMARY/'summary.json')
blind_provenance=load(BLIND/'provenance.json'); blind_summary=load(BLIND/'summary.json'); blind_live=load(BLIND/'live-attestation.json')
assert attestation['head']==HEAD and attestation['headTree']==TREE and attestation['pinsAgree']
assert primary_provenance['head']==HEAD and primary_provenance['tree']==TREE
assert primary_provenance['candidateFreeManifestJsonSha256']==input_manifest_sha
assert primary_provenance['candidateFreeChecksumListSha256']==input_sums_sha
assert blind_provenance['head']==HEAD and blind_provenance['tree']==TREE
assert blind_provenance['candidateFreeInputManifestJSONSha256']==input_manifest_sha
assert blind_provenance['candidateFreeInputSHA256SUMSListSha256']==input_sums_sha
assert blind_provenance['blindLedgerCreatedBeforeAnyComparison'] is True
assert blind_provenance['otherReviewDecisionsConsulted'] is False
assert blind_provenance['candidateFreeInputPath']==str(INPUT)
assert blind_live['head']==HEAD and blind_live['headTree']==TREE
assert primary_summary['candidateFreeManifestJsonSha256']==input_manifest_sha
assert primary_summary['candidateFreeChecksumListSha256']==input_sums_sha
assert primary_summary['head']==HEAD and primary_summary['tree']==TREE
assert blind_summary['head']==HEAD and blind_summary['tree']==TREE
assert primary_summary['cells']==240 and blind_summary['cellCount']==240
assert primary_summary['sourceIds']==20 and blind_summary['sourceCount']==20
assert primary_summary['locales']==12 and blind_summary['localeCount']==12
assert primary_summary['callerlessHolds']==0 and blind_summary['callerResolutionHolds']==0

# Fresh exact-head and live-PR/ref verification.
assert git('rev-parse','HEAD')==HEAD and git('rev-parse',f'{HEAD}^{{tree}}')==TREE
assert git('status','--porcelain')==''
pr=json.loads(subprocess.check_output(['gh','api','repos/snapetech-org/seerrng/pulls/418'],cwd=REPO,text=True))
remote_text=subprocess.check_output(['git','ls-remote','https://github.com/snapetech-org/seerrng.git','refs/pull/418/head',f'refs/heads/{BRANCH}'],cwd=REPO,text=True)
remote={line.split('\t')[1]:line.split('\t')[0] for line in remote_text.splitlines()}
commit=json.loads(subprocess.check_output(['gh','api',f'repos/snapetech-org/seerrng/commits/{HEAD}'],text=True))
assert pr['state']=='open' and pr['draft'] and pr['head']['sha']==HEAD and pr['head']['ref']==BRANCH
assert pr['base']['ref']=='main' and pr['base']['sha']==EXPECTED_BASE
assert remote['refs/pull/418/head']==HEAD and remote[f'refs/heads/{BRANCH}']==HEAD
assert commit['commit']['tree']['sha']==TREE

# Recheck candidate-free catalog and caller file pins against the exact source tree.
pins=load(INPUT/'file-pins.json'); tracked_pins=gather_pins(pins)
assert tracked_pins
for pin in tracked_pins:
    blob=git_raw(pin['path'])
    assert sha(blob)==pin['sha256']
    assert git('rev-parse',f'{HEAD}:{pin["path"]}')==pin['gitBlob']
source_rows=jloadl(INPUT/'source-cells.jsonl'); current_rows=jloadl(INPUT/'current-target-cells.jsonl')
contexts=jloadl(INPUT/'caller-contexts.jsonl'); blocks=jloadl(INPUT/'caller-context-blocks.jsonl')
assert len(source_rows)==20 and len(current_rows)==240 and len(contexts)==20
assert len(blocks)>=26
assert {r['position'] for r in source_rows}==set(range(3520,3540))
assert {r['position'] for r in current_rows}==set(range(3520,3540))
assert {r['locale'] for r in current_rows}==set(LOCALES)
context_by_pos={r['position']:r for r in contexts}
for ctx in contexts:
    for ref in ctx.get('directMessageReferences',[]):
        lines=git_raw(ref['path']).decode('utf-8').splitlines()
        assert 1<=ref['line']<=len(lines)
        line=lines[ref['line']-1]
        assert line==ref['text'] and sha_text(line)==ref['lineSha256']
for block in blocks:
    lines=git_raw(block['path']).decode('utf-8').splitlines()
    for row in block['lines']:
        assert 1<=row['line']<=len(lines)
        assert lines[row['line']-1]==row['text'] and sha_text(row['text'])==row['lineSha256']

primary_rows=jloadl(PRIMARY/'primary-ledger.jsonl'); blind_rows=jloadl(BLIND/'blind-ledger.jsonl')
assert len(primary_rows)==240 and len(blind_rows)==240
key=lambda r:(r['position'],r['locale'])
P={key(r):r for r in primary_rows}; B={key(r):r for r in blind_rows}; C={key(r):r for r in current_rows}
assert len(P)==len(B)==len(C)==240 and P.keys()==B.keys()==C.keys()
assert dict(collections.Counter(r['disposition'] for r in primary_rows))==primary_summary['dispositions']
assert dict(collections.Counter(r['recommendation'] for r in blind_rows))==blind_summary['dispositionCounts']
assert sum(r['changeProposed'] for r in blind_rows)==blind_summary['proposedCatalogChanges']
assert sum(r['finalTarget']!=r['currentTarget'] for r in primary_rows)==primary_summary['proposedChanges']
assert all(not r['callerHold'] and not r['inputWindowLabelMismatch'] for r in blind_rows)

ledger=[]; disagreement_rows=[]; target_agreement=0; disposition_agreement=0; current_both=0; convergent_proposals=0
resolution_counts=collections.Counter(); chosen_side_counts=collections.Counter(); placeholder_mismatches=0
for k in sorted(C):
    cell=C[k]; p=P[k]; b=B[k]; pos,locale=k
    assert p['head']==b['head']==cell['head']==HEAD and p['tree']==b['tree']==cell['tree']==TREE
    for field in ('sourceId','sourceKey','source','sourceSha256','catalogPath','locale','localeTag','currentTarget','currentTargetSha256','position'):
        if field in p and field in cell: assert p[field]==cell[field],(k,field,'primary')
        if field in b and field in cell: assert b[field]==cell[field],(k,field,'blind')
    current=cell['currentTarget']; ptarget=p['finalTarget']; btarget=b['recommendedTarget']
    assert ptarget is not None and btarget is not None
    p_tokens=re.findall(r'\{[^{}]+\}',ptarget); b_tokens=re.findall(r'\{[^{}]+\}',btarget); source_tokens=re.findall(r'\{[^{}]+\}',cell['source'])
    p_ok=collections.Counter(p_tokens)==collections.Counter(source_tokens)
    b_ok=collections.Counter(b_tokens)==collections.Counter(source_tokens)
    c_ok=cell['placeholderTokenSetMatchesSource'] and cell['placeholderTokenSequenceMatches']
    assert p_ok and b_ok and c_ok,(k,p_tokens,b_tokens,source_tokens)
    placeholder_mismatches += int(not (p_ok and b_ok and c_ok))
    target_same=ptarget==btarget; disp_same=p['disposition']==b['recommendation']
    target_agreement+=int(target_same); disposition_agreement+=int(disp_same)
    p_change=ptarget!=current; b_change=btarget!=current
    rationale=''; chosen_side='agreement'; resolution=''
    if not p_change and not b_change:
        final=current; final_disp='accept-current'; resolution='both-accept-current'; current_both+=1
        rationale='Primary and blind both retain the exact current target. The candidate-free current value, source identity, caller context and placeholder metadata agree at the pinned head.'
    elif target_same:
        final=ptarget; types={p['disposition'],b['recommendation']}; final_disp='correction' if 'correction' in types else 'refinement'
        resolution='same-proposed-target'; convergent_proposals+=1
        rationale='Primary and independent blind review selected the same target. Retain their convergent proposal after checking it against the exact caller context and source placeholders.'
    else:
        assert k in RESOLVE,(k,ptarget,btarget,current)
        chosen_side,rationale=RESOLVE[k]
        final=ptarget if chosen_side=='primary' else btarget
        final_disp=p['disposition'] if chosen_side=='primary' else b['recommendation']
        resolution='adjudicated-primary-target' if chosen_side=='primary' else 'adjudicated-blind-target'
        chosen_side_counts[chosen_side]+=1
    assert final is not None
    final_tokens=re.findall(r'\{[^{}]+\}',final)
    final_ok=collections.Counter(final_tokens)==collections.Counter(source_tokens)
    assert final_ok
    if not target_same:
        disagreement_rows.append({'position':pos,'locale':locale,'sourceId':cell['sourceId'],'source':cell['source'],'currentTarget':current,'primaryDisposition':p['disposition'],'primaryTarget':ptarget,'blindRecommendation':b['recommendation'],'blindTarget':btarget,'crossResolution':resolution,'crossTarget':final,'crossDisposition':final_disp,'crossRationale':rationale,'callerContextBlockIds':context_by_pos[pos]['contextBlockIds'],'callerNamespace':context_by_pos[pos].get('namespace')})
    row={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3520-W3539','head':HEAD,'tree':TREE,'position':pos,'sourceId':cell['sourceId'],'sourceKey':cell['sourceKey'],'source':cell['source'],'sourceSha256':cell['sourceSha256'],'locale':locale,'localeTag':cell['localeTag'],'catalogPath':cell['catalogPath'],'currentTarget':current,'currentTargetSha256':cell['currentTargetSha256'],'primaryDisposition':p['disposition'],'primaryTarget':ptarget,'primaryTargetSha256':p['finalTargetSha256'],'primaryRationale':p['rationale'],'primaryConfidence':p['confidence'],'blindRecommendation':b['recommendation'],'blindTarget':btarget,'blindTargetSha256':b['recommendedTargetSha256'],'blindRationale':b['rationale'],'blindConfidence':b['confidence'],'targetAgreement':target_same,'dispositionAgreement':disp_same,'primaryProposedChange':p_change,'blindProposedChange':b_change,'crossResolution':resolution,'crossSelectedSide':chosen_side,'crossDisposition':final_disp,'crossTarget':final,'crossTargetSha256':sha_text(final),'crossRationale':rationale,'placeholderTokensMatchSource':final_ok,'callerContextBlockIds':context_by_pos[pos]['contextBlockIds'],'callerNamespace':context_by_pos[pos].get('namespace'),'callerResolution':context_by_pos[pos].get('callerResolution'),'directMessageReferences':context_by_pos[pos].get('directMessageReferences',[]),'callerHold':False,'selectedForApplication':False}
    ledger.append(row)
    if resolution not in ('both-accept-current','same-proposed-target'): resolution_counts[resolution]+=1
assert len(ledger)==240 and len(disagreement_rows)==21
assert target_agreement==219 and disposition_agreement==222
assert current_both==210 and convergent_proposals==9
assert chosen_side_counts=={'primary':15,'blind':6}
assert placeholder_mismatches==0
cross_counts=dict(collections.Counter(row['crossDisposition'] for row in ledger))
final_changes=sum(row['crossTarget']!=row['currentTarget'] for row in ledger)
assert final_changes==30

packet_attestations={
 'candidateFreeInput':{'path':str(INPUT),'manifestJsonSha256':input_manifest_sha,'expectedManifestJsonSha256':EXPECTED_INPUT_MANIFEST,'checksumListSha256':input_sums_sha,'expectedChecksumListSha256':EXPECTED_INPUT_SUMS,'checksumEntries':len(input_sums),'allChecksumsMatch':True,'manifestAndChecksumListHashesAreDistinct':input_manifest_sha!=input_sums_sha},
 'primaryReview':{'path':str(PRIMARY),'checksumListSha256':primary_sums_sha,'expectedChecksumListSha256':EXPECTED_PRIMARY_SUMS,'checksumEntries':len(primary_sums),'allChecksumsMatch':True,'ledgerSha256':sha((PRIMARY/'primary-ledger.jsonl').read_bytes()),'cellCount':len(primary_rows)},
 'independentBlindReview':{'path':str(BLIND),'checksumListSha256':blind_sums_sha,'expectedChecksumListSha256':EXPECTED_BLIND_SUMS,'checksumEntries':len(blind_sums),'allChecksumsMatch':True,'ledgerSha256':sha((BLIND/'blind-ledger.jsonl').read_bytes()),'cellCount':len(blind_rows),'sealedPathOnly':True,'unsealedDraftExcluded':True,'blindLedgerCreatedBeforeComparison':True},
}
pinned_state={'repository':'snapetech-org/seerrng','pullRequest':418,'state':pr['state'],'draft':pr['draft'],'headRef':pr['head']['ref'],'head':pr['head']['sha'],'tree':commit['commit']['tree']['sha'],'baseRef':pr['base']['ref'],'baseSha':pr['base']['sha'],'remoteBranchRef':f'refs/heads/{BRANCH}','remoteBranchHead':remote[f'refs/heads/{BRANCH}'],'remotePullRef':'refs/pull/418/head','remotePullRefHead':remote['refs/pull/418/head'],'localWorktree':str(REPO),'localWorktreeHead':git('rev-parse','HEAD'),'localWorktreeTree':git('rev-parse',f'{HEAD}^{{tree}}'),'localWorktreeClean':True,'exactExpectedHeadAndTree':True,'verifiedAtUTC':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip()}

OUTPUT.mkdir(parents=True)
(OUTPUT/'build_cross_audit_evidence.py').write_text(Path(__file__).read_text(encoding='utf-8'),encoding='utf-8')
(OUTPUT/'verify_cross_audit_evidence.py').write_text(VERIFY_SCRIPT,encoding='utf-8')
(OUTPUT/'cross-audit-ledger.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for row in ledger),encoding='utf-8')
(OUTPUT/'disagreements.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for row in disagreement_rows),encoding='utf-8')
disposition_rows=[row for row in ledger if not row['dispositionAgreement']]
(OUTPUT/'disposition-differences.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for row in disposition_rows),encoding='utf-8')
(OUTPUT/'packet-attestations.json').write_text(json.dumps(packet_attestations,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
(OUTPUT/'pinned-state-verification.json').write_text(json.dumps(pinned_state,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
summary={'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3520-W3539','head':HEAD,'tree':TREE,'sourceCount':20,'localeCount':12,'cellCount':240,'crossDispositions':cross_counts,'finalProposedChanges':final_changes,'holds':0,'placeholderMismatches':0,'primaryTargetChanges':primary_summary['proposedChanges'],'blindTargetChanges':blind_summary['proposedCatalogChanges'],'targetAgreementCells':target_agreement,'targetDisagreements':len(disagreement_rows),'dispositionAgreementCells':disposition_agreement,'dispositionDifferences':240-disposition_agreement,'bothAcceptCurrentCells':current_both,'convergentProposalCells':convergent_proposals,'adjudicatedPrimaryTargets':chosen_side_counts['primary'],'adjudicatedBlindTargets':chosen_side_counts['blind'],'qualifiedNativeSpeakerApproval':False,'exactHeadBrowserReview':False,'sourceChangesMade':False,'applicationApproved':False,'releaseApproved':False,'packetHashes':{'candidateFreeManifestJsonSha256':input_manifest_sha,'candidateFreeChecksumListSha256':input_sums_sha,'primaryChecksumListSha256':primary_sums_sha,'blindReviewChecksumListSha256':blind_sums_sha}}
(OUTPUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
by_pos=collections.defaultdict(list)
for row in disagreement_rows: by_pos[row['position']].append(row)
disagreement_summary={'targetDisagreementCount':len(disagreement_rows),'primaryChangeCount':primary_summary['proposedChanges'],'blindChangeCount':blind_summary['proposedCatalogChanges'],'targetAgreementCells':target_agreement,'dispositionDifferences':240-disposition_agreement,'bothAcceptCurrentCells':current_both,'convergentProposalCells':convergent_proposals,'adjudicatedPrimaryTargets':chosen_side_counts['primary'],'adjudicatedBlindTargets':chosen_side_counts['blind'],'holds':0,'byPosition':{str(pos):{'sourceId':items[0]['sourceId'],'source':items[0]['source'],'locales':[row['locale'] for row in items],'resolutions':{row['locale']:row['crossResolution'] for row in items}} for pos,items in sorted(by_pos.items())},'unresolvedDisagreements':0}
(OUTPUT/'disagreement-and-hold-summary.json').write_text(json.dumps(disagreement_summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
changes=[row for row in ledger if row['crossTarget']!=row['currentTarget']]
lines=['# SeerrNG PR #418 W3520–W3539 cross-audit reconciliation','',f'Pinned head `{HEAD}` / tree `{TREE}`. This is a read-only audit of the corrected candidate-free input, root primary ledger and sealed independent blind ledger.','',f'- Candidate-free manifest JSON SHA256: `{input_manifest_sha}`',f'- Candidate-free checksum-list SHA256: `{input_sums_sha}`',f'- Primary packet checksum-list SHA256: `{primary_sums_sha}`',f'- Blind review packet checksum-list SHA256: `{blind_sums_sha}`','',f'All {len(ledger)} cells reconciled: {current_both} both accept current; {convergent_proposals} share a proposed target; {len(disagreement_rows)} target disagreements were adjudicated ({chosen_side_counts["primary"]} use primary targets, {chosen_side_counts["blind"]} use blind targets). Final proposed target changes: {final_changes}; holds: 0; placeholder mismatches: 0.','', '## Adjudicated target disagreements','']
for row in disagreement_rows:
 lines += [f"### {row['position']} / {row['locale']} — {row['source']}",'',f"- Current: {row['currentTarget']}",f"- Primary: {row['primaryDisposition']} → {row['primaryTarget']}",f"- Blind: {row['blindRecommendation']} → {row['blindTarget']}",f"- Cross-audit: {row['crossDisposition']} → {row['crossTarget']}",f"- Caller: {row['callerNamespace']} ({', '.join(row['callerContextBlockIds'])})",f"- Rationale: {row['crossRationale']}",'']
disposition_rows=[row for row in ledger if not row['dispositionAgreement']]
lines += ['## Disposition differences','']
for row in disposition_rows:
 lines += [f"- Rank {row['position']} / {row['locale']}: primary `{row['primaryDisposition']}`; blind `{row['blindRecommendation']}`; targets {'agree' if row['targetAgreement'] else 'differ'}; cross-audit `{row['crossDisposition']}` → {row['crossTarget']} ({row['crossResolution']})."]
lines += ['', '## Review limits','','No source files or PR metadata were changed. No tests, builds, scans, CI, native-speaker approval, or browser review are included. The cross-audit does not approve application, merge, or release. The independent blind packet was read only from its sealed `review/` directory; the isolated unsealed draft was not used.','']
(OUTPUT/'report.md').write_text('\n'.join(lines),encoding='utf-8')
readme=f'''# SeerrNG PR #418 W3520–W3539 cross-audit\n\nRead-only reconciliation of all 240 cells on `{HEAD}` / tree `{TREE}` using the corrected candidate-free input, primary review, and sealed independent blind review.\n\nCandidate-free manifest JSON SHA256: `{input_manifest_sha}`. Candidate-free checksum-list SHA256: `{input_sums_sha}`. Primary output checksum-list SHA256: `{primary_sums_sha}`. Blind review checksum-list SHA256: `{blind_sums_sha}`.\n\nThe full ledger records source/current/primary/blind/cross targets and dispositions per cell. All 21 target disagreements and 18 disposition differences are separately listed. Final reconciliation retains 210 current values, 9 convergent proposed changes, and adjudicates 21 disagreements (15 primary targets, 6 blind targets). There are no holds or placeholder mismatches.\n\nThis packet does not apply translations, modify SeerrNG, or approve a merge/release. Native-speaker and exact-head browser reviews are not represented here.\n'''
(OUTPUT/'README.md').write_text(readme,encoding='utf-8')
files=sorted(p for p in OUTPUT.rglob('*') if p.is_file() and p!=OUTPUT/'SHA256SUMS.txt')
(OUTPUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUTPUT).as_posix()}\n' for p in files),encoding='utf-8')
final_sums=verify_sums(OUTPUT); assert len(final_sums)==10 and all(x['matches'] for x in final_sums)
print(json.dumps({'output':str(OUTPUT),'summary':summary,'inputManifestJsonSha256':input_manifest_sha,'inputChecksumListSha256':input_sums_sha,'primaryChecksumListSha256':primary_sums_sha,'blindChecksumListSha256':blind_sums_sha,'outputChecksumListSha256':sha((OUTPUT/'SHA256SUMS.txt').read_bytes()),'outputEntries':len(final_sums),'adjudicatedDisagreements':len(disagreement_rows)},ensure_ascii=False,indent=2))
