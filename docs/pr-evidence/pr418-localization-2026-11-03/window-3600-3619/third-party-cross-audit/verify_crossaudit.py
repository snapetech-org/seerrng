#!/usr/bin/env python3
import argparse, collections, hashlib, json, re, subprocess
from pathlib import Path
OUT=Path(__file__).resolve().parent
ROOT=Path('/home/keith/Documents/code/task-scratch')
BASE=ROOT/'seerrng-pr418-w3600-3619-primary-20261103'
IN=BASE/'candidate-free-input'; PR=BASE/'primary-review'
BLIND=ROOT/'seerrng-pr418-w3600-3619-blind-20261103'
PH=re.compile(r'\{[^{}\r\n]+\}')
MK=re.compile(r'</?[A-Za-z][^<>]*?/?>')
NUM=re.compile(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?%?(?!\w)')
PROTECTED=['SeerrNG','Audiobookshelf','ISBN','API','URL','HTTP','HTTPS','IP','BackIssue','Bindery','ComicVine','Plex','Jellyfin','BINDERY_ENFORCE_TENANCY','Auto-approve requests','library.view','library.manage','downloads.grab']
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha_bytes(s.encode('utf-8'))
def jread(p): return json.loads(p.read_text(encoding='utf-8'))
def jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def listed_files(d):
    result={}
    for line in (d/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        if line.strip():
            h,n=line.split(None,1); result[n.strip().lstrip('*')]=h
    return result
def verify_dir_sums(d):
    entries=listed_files(d)
    for n,h in entries.items(): assert sha_bytes((d/n).read_bytes())==h,(str(d/n),'checksum')
    return entries

ap=argparse.ArgumentParser()
ap.add_argument('--skip-upstream',action='store_true',help='skip running the three source packet verifiers')
a=ap.parse_args()
# Verify output checksum coverage (the checksum list does not checksum itself).
output_entries=verify_dir_sums(OUT)
actual={p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'}
assert set(output_entries)==actual,(set(output_entries),actual)
# Verify all pinned upstream packets and their complete checksum inventories.
pins=jread(OUT/'input-packet-checksums.json')
for name,d in [('candidateFreeInput',IN),('primaryReview',PR),('blindReview',BLIND)]:
    rec=pins[name]
    assert Path(rec['directory'])==d
    assert sha_bytes((d/'SHA256SUMS.txt').read_bytes())==rec['checksumListSha256']
    assert (d/'SHA256SUMS.txt').stat().st_size==rec['checksumListByteCount']
    supplied=verify_dir_sums(d)
    recorded={x['path']:x['sha256'] for x in rec['files']}
    assert supplied==recorded,(name,'file inventory')
    for file in rec['files']:
        p=d/file['path']; assert p.stat().st_size==file['byteCount']
manifest=jread(IN/'manifest.json'); window=jread(IN/'window.json')
assert (manifest['repository'],manifest['pullRequest'],manifest['head'],manifest['tree'],manifest['window'])==('snapetech-org/seerrng',418,'1fdec93d1b021e4ec7a7c2265230f59d81d2675e','6234854dc0b1e7aee17ef2e819ffc2b5b2e386ce','W3600-W3619')
assert window['localeOrder'] and len(window['localeOrder'])==12
P={(x['position'],x['locale']):x for x in jsonl(PR/'primary-ledger.jsonl')}
B={(x['position'],x['locale']):x for x in jsonl(BLIND/'blind-ledger.jsonl')}
S={x['position']:x for x in jsonl(IN/'source-cells.jsonl')}
C={(x['position'],x['locale']):x for x in jsonl(IN/'current-target-cells.jsonl')}
CTX={x['position']:x for x in jsonl(IN/'caller-contexts.jsonl')}
blocks_by_pos=collections.defaultdict(list)
for block in jsonl(IN/'caller-context-blocks.jsonl'):
    if 'sourcePosition' in block: blocks_by_pos[block['sourcePosition']].append(block)
expected={(p,l) for p in range(3600,3620) for l in window['localeOrder']}
rows=jsonl(OUT/'cross-audit-resolution-ledger.jsonl')
R={(x['position'],x['locale']):x for x in rows}
assert len(rows)==len(R)==240 and set(R)==expected
assert len(S)==20 and len(CTX)==20
for key,r in R.items():
    p=P[key]; b=B[key]; c=C[key]; s=S[key[0]]; ctx=CTX[key[0]]
    assert r['head']==manifest['head'] and r['tree']==manifest['tree']
    assert r['sourceId']==s['sourceId']==p['sourceId']==b['sourceId']
    assert r['source']==s['source']==p['source']==b['source']
    assert r['sourceSha256']==s['sourceSha256']==p['sourceSha256']==b['sourceSha256']==sha_text(r['source'])
    assert r['currentTarget']==c['currentTarget']==p['currentTarget']==b['currentTarget']
    assert r['currentTargetSha256']==c['currentTargetSha256']==p['currentTargetSha256']==b['currentTargetSha256']==sha_text(r['currentTarget'])
    assert r['primaryTarget']==p['finalTarget'] and r['primaryDisposition']==p['disposition'] and r['primaryRationale']==p['rationale']
    assert r['blindTarget']==b['reviewedTarget'] and r['blindDisposition']==b['disposition'] and r['blindRationale']==b['rationale']
    assert r['targetAgreement']==(p['finalTarget']==b['reviewedTarget'])
    assert r['dispositionAgreement']==(p['disposition']==b['disposition'])
    assert r['callerContext']['callerCount']==ctx['callerCount']>0
    assert r['callerContext']['directMessageReferences']==ctx['directMessageReferences']
    assert r['callerContext']['exactPinnedContextBlocks']==blocks_by_pos[key[0]]
    target=r['crossAuditTarget']; assert r['crossAuditTargetSha256']==sha_text(target)
    assert (r['crossAuditDisposition']=='accept-current')==(target==r['currentTarget'])
    assert r['crossAuditDisposition'] in {'accept-current','correction','refinement','hold'}
    if r['targetAgreement']:
        assert r['resolutionBasis']=='consensus' and target==p['finalTarget']==b['reviewedTarget']
        assert r['crossAuditDisposition']==p['disposition']==b['disposition']
    else:
        assert r['resolutionBasis'] in {'primary','blind'}
        chosen=p['finalTarget'] if r['resolutionBasis']=='primary' else b['reviewedTarget']
        assert target==chosen
        if key[0]==3619: assert r['crossAuditDisposition']=='correction'
        else: assert r['crossAuditDisposition'] in {p['disposition'],b['disposition']}
    assert r['crossAuditRationale'].strip()
    ta=r['tokenAudit']; source=s['source']
    assert PH.findall(target)==PH.findall(source)==ta['sourcePlaceholders']==ta['finalPlaceholders']
    assert MK.findall(target)==MK.findall(source)==ta['sourceMarkupTokens']==ta['finalMarkupTokens']
    assert NUM.findall(target)==NUM.findall(source)==ta['sourceNumericTokens']==ta['finalNumericTokens']
    assert ta['placeholderSequenceMatchesSource'] and ta['markupSequenceMatchesSource'] and ta['numericSequenceMatchesSource']
    assert ta['sourceProtectedLiterals']==s.get('sourceProtectedLiterals',[])
    assert all(lit in target for lit in ta['sourceProtectedLiterals']) and ta['allSourceProtectedLiteralsPresent']
    assert ta['baselineProtectedLiteralMismatch']==bool(c['protectedLiteralMismatch'])
# Full matrix and outcome counts.
target_agree=sum(r['targetAgreement'] for r in rows); disp_agree=sum(r['dispositionAgreement'] for r in rows)
final=collections.Counter(r['crossAuditDisposition'] for r in rows)
assert (target_agree,disp_agree)==(220,228)
assert dict(final)=={'accept-current':215,'correction':20,'refinement':5}
pairs=collections.Counter(f"{P[k]['disposition']} -> {B[k]['disposition']}" for k in expected)
summary=jread(OUT/'summary.json')
assert summary['all240CellsCovered'] and summary['crossAuditCellCount']==240
assert summary['primaryBlindComparison']['targetAgreements']==target_agree
assert summary['primaryBlindComparison']['targetDisagreements']==20
assert summary['primaryBlindComparison']['dispositionAgreements']==disp_agree
assert summary['primaryBlindComparison']['dispositionDisagreements']==12
assert summary['primaryBlindComparison']['dispositionPairCounts']==dict(sorted(pairs.items()))
assert summary['crossAuditResolution']['dispositions']==dict(sorted(final.items()))
assert summary['crossAuditResolution']['proposedChanges']==25 and summary['crossAuditResolution']['holds']==0
baseline=[(k[0],k[1]) for k,c in C.items() if c['protectedLiteralMismatch']]
assert len(baseline)==8 and summary['protectedLiteralAudit']['baselineMismatchCount']==8
assert summary['protectedLiteralAudit']['finalMismatchCount']==0 and summary['protectedLiteralAudit']['allBaselineProtectedLiteralMismatchesResolved']
assert summary['structuralTokenAudit']=={'placeholderMismatchCount':0,'markupMismatchCount':0,'numericMismatchCount':0}
# Optional re-run of the upstream candidate-free, primary, and blind verification scripts.
upstream='SKIPPED'
if not a.skip_upstream:
    scripts=[BASE/'verify_candidate_free.py',BASE/'verify_primary_review.py',BLIND/'verify_blind_review.py']
    for script in scripts:
        cp=subprocess.run(['python3',str(script)],capture_output=True,text=True,check=True)
        assert 'PASS' in cp.stdout,script
    upstream='PASS'
print(json.dumps({'result':'PASS','upstreamVerifierRerun':upstream,'head':manifest['head'],'tree':manifest['tree'],'cells':len(rows),
 'targetAgreements':target_agree,'targetDisagreements':240-target_agree,'dispositionAgreements':disp_agree,'dispositionDisagreements':240-disp_agree,
 'crossAuditDispositions':dict(sorted(final.items())),'protectedBaselineMismatches':len(baseline),'finalProtectedMismatches':0,
 'placeholderMarkupNumericMismatches':0,'outputChecksumEntries':len(output_entries)},ensure_ascii=False,indent=2))
