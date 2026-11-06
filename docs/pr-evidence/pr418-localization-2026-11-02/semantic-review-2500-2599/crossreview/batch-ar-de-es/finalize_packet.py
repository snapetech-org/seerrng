from pathlib import Path
import collections,hashlib,json,re,subprocess
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-crossreview-20261102/batch-ar-de-es')
PRIMARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
repo=Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2'; TREE='a09117211080bbd89d32959f17d93b02a82b966f'
def sha(b):return hashlib.sha256(b if isinstance(b,bytes) else b.encode('utf-8')).hexdigest()
def parse(path):return json.loads(path.read_text(encoding='utf-8'))
before=parse(OUT/'live-localization-prs-before.json'); after=parse(OUT/'live-localization-prs-after.json')
assert len(before['prs'])==len(after['prs'])==7
key=lambda p:(p['repository'].lower(),p['number'])
bmap={key(p):p for p in before['prs']}; amap={key(p):p for p in after['prs']}; assert bmap.keys()==amap.keys()
changes=[]
for k in bmap:
 b=bmap[k];a=amap[k]
 if (b['head'],b['state'],b['isDraft'])!=(a['head'],a['state'],a['isDraft']):changes.append({'repository':k[0],'number':k[1],'before':{'head':b['head'],'state':b['state'],'isDraft':b['isDraft']},'after':{'head':a['head'],'state':a['state'],'isDraft':a['isDraft']}})
seerr=[p for p in after['prs'] if p['number']==418 and p['repository'].lower()=='snapetech-org/seerrng'][0]
assert seerr['state']=='open' and seerr['isDraft'] is True and seerr['head']==HEAD
assert after['seerrTree']==TREE and after['expectedHead']==HEAD
prrec={'queriedBefore':before['capturedAtUtc'],'queriedAfter':after['capturedAtUtc'],'beforeCount':len(bmap),'afterCount':len(amap),'headsStatesDraftStatesUnchanged':not changes,'changes':changes,'seerr418':{'repository':seerr['repository'],'number':418,'state':seerr['state'],'isDraft':seerr['isDraft'],'head':seerr['head'],'tree':after['seerrTree']},'before':before['prs'],'after':after['prs']}
(OUT/'pr-heads-reconciliation.json').write_text(json.dumps(prrec,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
primary_sum=hashlib.sha256((PRIMARY/'SHA256SUMS').read_bytes()).hexdigest(); input_sum=hashlib.sha256((PRIMARY/'INPUT-SHA256SUMS').read_bytes()).hexdigest()
assert primary_sum=='66cf3a6b31e60bebdc455366e9c33bbdec3735ac6d42f8bfc4d7f4147f8e4e6f'
inputpins={'primaryPacketDirectory':str(PRIMARY),'primarySHA256SUMS_sha256':primary_sum,'primaryINPUT_SHA256SUMS_sha256':input_sum,'primaryLedgerSha256':sha((PRIMARY/'primary-review-ledger.jsonl').read_bytes()),'routeGlossarySha256':sha((PRIMARY/'locale-ui-glossary.json').read_bytes()),'routeTerminologyReviewSha256':sha((PRIMARY/'route-terminology-review.json').read_bytes()),'reviewInstructionsSha256':sha((PRIMARY/'review-instructions.md').read_bytes()),'pinnedHead':HEAD,'pinnedTree':TREE,'crossReviewLocales':['ar','de','es']}
(OUT/'input-pins.json').write_text(json.dumps(inputpins,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
ledger=[json.loads(x) for x in (OUT/'crossreview-ledger.jsonl').read_text(encoding='utf-8').splitlines()]
assert len(ledger)==300 and len({(r['sourcePosition'],r['locale']) for r in ledger})==300
assert all(r['locale'] in ('ar','de','es') and 2500<=r['sourcePosition']<=2599 for r in ledger)
counts=collections.Counter(r['crossReviewDisposition'] for r in ledger)
assert counts==collections.Counter({'accept-current':199,'accept-primary-correction':71,'revise-primary':30})
for r in ledger:
 assert r['currentTargetHash']==sha(r['currentTarget'])
 assert r['primaryTargetHash']==sha(r['primaryTarget'])
 assert r['recommendedTargetHash']==sha(r['recommendedTarget'])
 assert r['placeholderParity']=='exact' and r['markupParity']=='exact' and not r['missingProtectedLiterals'] and r['icuStructurePreserved']
 assert all(x['status']!='missing-count-marker' for x in r['countMarkerAudit'])
assert not parse(OUT/'catalog-caller-reattestation.json')['callerPinIssues']
assert parse(OUT/'catalog-caller-reattestation.json')['callerPinnedLinesReattested']==358
assert parse(OUT/'catalog-caller-reattestation.json')['catalogKeySetParityWithEnglish']
assert not parse(OUT/'summary.json')['structuralMismatches']
rev=[{'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'currentTargetHash':r['currentTargetHash'],'primaryTargetHash':r['primaryTargetHash'],'recommendedTargetHash':r['recommendedTargetHash'],'reason':r['reason']} for r in ledger if r['crossReviewDisposition']=='revise-primary']
final={'head':HEAD,'tree':TREE,'crossReviewRows':len(ledger),'uniqueLocalePositionPairs':len({(r['sourcePosition'],r['locale']) for r in ledger}),'dispositionCounts':dict(sorted(counts.items())),'candidateRevisions':rev,'rejects':[],'holds':[],'sourceCurrentPrimaryAndRecommendedHashesReattested':True,'catalogAndCallerReattestationFile':'catalog-caller-reattestation.json','all12LocaleCatalogsReattested':True,'keySetParity':True,'callerReferencesReattested':358,'placeholdersMarkupProtectedLiteralsIcuAndCountMarkers':'all pass; zero mismatches','livePRHeadsBeforeAfterRequeried':7,'allSevenHeadStateDraftStateChanges':changes,'seerr418State':seerr['state'],'seerr418Draft':seerr['isDraft'],'seerr418Head':seerr['head'],'seerr418Tree':after['seerrTree'],'nativeSpeakerApproval':'not performed; remains outstanding','repositoryEdits':0,'testsBuildsScansCiBrowserRuns':0}
(OUT/'final-reattestation.json').write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'allSevenStable':not changes,'seerr418':final['seerr418Head']+'/'+final['seerr418Tree'],'crossReview':dict(counts),'revisionCount':len(rev),'pinInputs':inputpins},ensure_ascii=False))
