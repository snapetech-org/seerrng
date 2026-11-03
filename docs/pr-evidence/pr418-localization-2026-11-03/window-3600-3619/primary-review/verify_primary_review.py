#!/usr/bin/env python3
from pathlib import Path
from collections import Counter
import hashlib,json,re,subprocess
T=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3600-3619-primary-20261103')
IN=T/'candidate-free-input'; OUT=T/'primary-review'
HEAD='1fdec93d1b021e4ec7a7c2265230f59d81d2675e'; TREE='6234854dc0b1e7aee17ef2e819ffc2b5b2e386ce'
MANIFEST_SHA='1089646f93bfd96df0e5f0b820da76e9132cc859b6ed9db595c9a891dbcfcd9c'
INPUT_SUMS_SHA='fdffd9f94443ad5ac1604f4a1ba4790717ae54e900ce41b1c3a454aca19ab156'
PH=re.compile(r'\{[^{}\r\n]+\}'); MK=re.compile(r'</?[A-Za-z][^<>]*?/?>'); NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','BackIssue','Bindery','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
def sha(b): return hashlib.sha256(b).hexdigest()
def st(s): return sha(s.encode('utf-8'))
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def verify_sums(d):
 for line in (d/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  if line.strip():
   h,n=line.split(None,1); n=n.strip().lstrip('*'); assert sha((d/n).read_bytes())==h,(d/n,'checksum')
subprocess.run(['python3',str(T/'verify_candidate_free.py')],check=True,capture_output=True,text=True)
verify_sums(IN); verify_sums(OUT)
assert sha((IN/'manifest.json').read_bytes())==MANIFEST_SHA
assert sha((IN/'SHA256SUMS.txt').read_bytes())==INPUT_SUMS_SHA
manifest=j(IN/'manifest.json'); assert (manifest['head'],manifest['tree'],manifest['window'])==(HEAD,TREE,'W3600-W3619')
ledger=jl(OUT/'primary-ledger.jsonl'); selected=jl(OUT/'selected-direct-locale-cells.jsonl')
sources={x['position']:x for x in jl(IN/'source-cells.jsonl')}; callers={x['position']:x for x in jl(IN/'caller-contexts.jsonl')}
inputs={(x['position'],x['locale']):x for x in jl(IN/'current-target-cells.jsonl')}
assert len(ledger)==len(inputs)==240 and len(sources)==20 and len(callers)==20
summary=j(OUT/'summary.json'); provenance=j(OUT/'provenance.json')
assert summary['head']==provenance['head']==HEAD and summary['tree']==provenance['tree']==TREE
assert summary['candidateFreeManifestJsonSha256']==provenance['candidateFreeManifestJsonSha256']==MANIFEST_SHA
assert summary['candidateFreeChecksumListSha256']==provenance['candidateFreeChecksumListSha256']==INPUT_SUMS_SHA
assert summary['cells']==240 and summary['sourceIds']==20 and summary['locales']==12 and summary['all240CellsReviewed'] is True
assert provenance['all240CellsReviewed'] is True and provenance['reviewType']=='primary semantic review only'
assert summary['nativeSpeakerApproval'] is False and provenance['nativeSpeakerApproval'] is False
assert summary['exactHeadBrowserReview'] is False and provenance['exactHeadBrowserReview'] is False
assert summary['blindReviewIncluded'] is False and provenance['blindReviewIncluded'] is False
bykey={(x['position'],x['locale']):x for x in ledger}; assert len(bykey)==240 and set(bykey)==set(inputs)
sel={(x['position'],x['locale']):x for x in selected}; assert len(sel)==len(selected)
counts=Counter(x['disposition'] for x in ledger)
assert dict(counts)==summary['dispositions']
assert counts['accept-current']+counts['correction']+counts['refinement']+counts['hold']==240
assert counts['hold']==0 and len(selected)==counts['correction']+counts['refinement']
assert summary['proposedChanges']==len(selected)
assert len(selected)==25
baseline=[x for x in inputs.values() if x['protectedLiteralMismatch']]
expected_baseline={(3604,'pt_BR'),(3618,'zh_Hans'),(3618,'de'),(3618,'ja'),(3618,'ar'),(3618,'ko'),(3618,'zh_Hant'),(3618,'vi')}
assert {(x['position'],x['locale']) for x in baseline}==expected_baseline
assert summary['baselineProtectedLiteralMismatches']==8 and len(provenance['baselineProtectedLiteralMismatches'])==8
assert {(x['position'],x['locale']) for x in provenance['baselineProtectedLiteralMismatches']}==expected_baseline
for key,row in bykey.items():
 inp=inputs[key]; src=sources[key[0]]; caller=callers[key[0]]
 assert row['reviewStatus']=='primary-reviewed' and row['head']==HEAD and row['tree']==TREE
 for field in ['sourceId','source','sourceSha256']:
  assert row[field]==src[field],(key,field)
 for field in ['currentTarget','currentTargetSha256','catalogPath','catalogGitBlob','catalogSha256']:
  assert row[field]==inp[field],(key,field)
 assert row['callerContext']['callerCount']==caller['callerCount']>0
 assert row['callerContext']['directMessageReferences']==caller['directMessageReferences']
 assert row['rationale'].strip() and row['confidence'] in {'high','moderate','low'}
 final=row['finalTarget']; assert row['finalTargetSha256']==st(final)
 assert PH.findall(final)==src['sourcePlaceholders'] and row['placeholderTokenChecks']['finalSequenceMatchesSource'] is True and row['placeholderTokenChecks']['finalSetMatchesSource'] is True
 assert MK.findall(final)==src['sourceMarkupTokens'] and row['markupTokenChecks']['finalSequenceMatchesSource'] is True
 assert NUM.findall(final)==src['sourceNumericTokens'] and row['numericTokenChecks']['finalSequenceMatchesSource'] is True
 assert all(x in final for x in src['sourceProtectedLiterals']) and row['protectedLiteralChecks']['finalSetMatchesSource'] is True
 assert row['protectedLiteralChecks']['currentSetMatchesSource']==(not inp['protectedLiteralMismatch'])
 if row['disposition']=='accept-current':
  assert final==row['currentTarget'] and key not in sel and 'proposedTarget' not in row
 else:
  assert key in sel
  s=sel[key]
  assert row['proposedTarget']==final and row['proposedTargetSha256']==st(final)
  assert s['proposedTarget']==final and s['proposedTargetSha256']==st(final)
  assert s['disposition']==row['disposition'] and s['rationale']==row['rationale']
assert set(sel)=={k for k,v in bykey.items() if v['disposition']!='accept-current'}
assert summary['callerlessHolds']==0
assert summary['baselinePlaceholderMismatches']==summary['baselineMarkupMismatches']==summary['baselineNumericTokenMismatches']==0
assert summary['finalPlaceholderMismatches']==summary['finalMarkupMismatches']==summary['finalNumericTokenMismatches']==summary['finalProtectedLiteralMismatches']==0
# The output checksum list covers every primary artifact except itself.
listed=set()
for line in (OUT/'SHA256SUMS.txt').read_text().splitlines():
 if line.strip(): listed.add(line.split(None,1)[1].strip().lstrip('*'))
assert listed=={p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':240,'dispositions':dict(counts),'proposedChanges':len(selected),'holds':counts['hold'],'baselineProtectedLiteralMismatches':8,'candidateFreeManifestJsonSha256':MANIFEST_SHA,'candidateFreeChecksumListSha256':INPUT_SUMS_SHA,'primaryChecksumListSha256':sha((OUT/'SHA256SUMS.txt').read_bytes()),'primaryChecksumEntries':len(listed)},ensure_ascii=False,indent=2))
