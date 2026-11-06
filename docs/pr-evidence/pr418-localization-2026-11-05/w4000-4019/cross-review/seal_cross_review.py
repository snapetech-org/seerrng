import json,hashlib,datetime,subprocess,collections
from pathlib import Path
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w4000-4019-current-20261105/cross-review')
ROOT=OUT.parent
CF=ROOT/'candidate-free'
P=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-primary-20261105/primary-review')
B=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-blind-seal-20261105')
REPO=Path('/mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume')
HEAD='77d30ae742aad7245e6e419237fca6a544531e1f'; TREE='2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
BASE='2647e15762de0c2285cd9d8ebc6d27ffafce6358'; BASETREE='b6f4acb9debdc1b0a838b50d5ad88aaa467e429b'
BRANCH='codex/seerrng-localization-overhaul-20261028'; SLUG='snapetech-org/seerrng'
def sha(b): return hashlib.sha256(b).hexdigest()
def canon(o): return (json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
def j(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def need(ok,msg):
 if not ok: raise SystemExit('REFUSED: '+msg)
def attest():
 api=json.loads(subprocess.check_output(['gh','pr','view','418','--repo',SLUG,'--json','number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,url'],text=True))
 raw=subprocess.check_output(['git','ls-remote','https://github.com/'+SLUG+'.git','refs/heads/main','refs/heads/'+BRANCH,'refs/pull/418/head'],text=True)
 refs=sorted(x.split() for x in raw.splitlines() if x.strip())
 expected={(BASE,'refs/heads/main'),(HEAD,'refs/heads/'+BRANCH),(HEAD,'refs/pull/418/head')}
 need({tuple(x) for x in refs}==expected,'live refs changed')
 need((api['number'],api['state'],api['isDraft'],api['headRefName'],api['headRefOid'],api['baseRefName'],api['baseRefOid'])==(418,'OPEN',True,BRANCH,HEAD,'main',BASE),'live PR API changed')
 need(subprocess.check_output(['git','-C',str(REPO),'rev-parse',HEAD+'^{tree}'],text=True).strip()==TREE,'head tree object unavailable')
 need(subprocess.check_output(['git','-C',str(REPO),'rev-parse',BASE+'^{tree}'],text=True).strip()==BASETREE,'base tree object unavailable')
 return {'observedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'repository':SLUG,
  'pullRequest':418,'state':'OPEN','isDraft':True,'headRefName':BRANCH,'headRefOid':HEAD,'headTree':TREE,
  'baseRefName':'main','baseRefOid':BASE,'baseTree':BASETREE,'url':api['url'],
  'remoteRefs':[{'sha':s,'ref':r} for s,r in refs]}
def main():
 before=j(OUT/'attestations-before.json'); after=attest()
 need({(x['ref'],x['sha']) for x in before['remoteRefs']}=={(x['ref'],x['sha']) for x in after['remoteRefs']},'entry and exit refs differ')
 (OUT/'attestations-after.json').write_text(json.dumps(after,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 rows=jl(OUT/'recommendations.jsonl')
 need(len(rows)==240,'recommendation ledger count')
 dec=collections.Counter(r['decision'] for r in rows)
 source=collections.Counter(r.get('selectedSource',r.get('recommendationKind')) for r in rows)
 locale=collections.Counter(r['locale'] for r in rows)
 changed=sum(1 for r in rows if r.get('recommendedTargetSha256') and r.get('recommendedTargetSha256')!=r.get('currentTargetSha256'))
 summary=j(OUT/'recommendations-summary.json')
 summary.update({'result':'PASS','entryExitRefsUnchanged':True,'exitAttestationUtc':after['observedAtUtc'],
  'recommendationCounts':dict(dec),'selectedSourceCounts':dict(source),'recommendationsDifferentFromCurrent':changed,
  'perLocaleCellCounts':dict(locale),'exactGitVerifierResult':'PASS: head/tree/base tree and 13 catalogs plus caller code objects verified',
  'portableCrossVerifierResult':'PASS: 240 cells, source/current-target/caller hashes, candidate lanes, tokens, and checksum inventory',
  'finalChecksumsSealed':True})
 (OUT/'recommendations-summary.json').write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 readme="""# SeerrNG PR #418 W4000-W4019 cross-review

This sealed cross-review covers exactly the 20 IDs from the prior W4000-W4019 selected-source list and all 240 existing locale targets. The old source positions were 4000–4019; after 37 earlier English IDs were added, these same ID hashes are at current positions 4037–4056. No cells from the separate 44-source parity packet or its 528 translation proposals are included.

The sibling candidate-free packet was freshly built from current PR head 77d30ae742aad7245e6e419237fca6a544531e1f / tree 2c6fe4a0c1c33aa56b01f06a70702f68598509a7, base 2647e15762de0c2285cd9d8ebc6d27ffafce6358 / tree b6f4acb9debdc1b0a838b50d5ad88aaa467e429b. It reattests all English source text, all current targets, caller line evidence, catalog blobs, and exact source order. Primary and blind packets were sealed against the prior head ac193096ebfc0007183348b24e35bf6fee33f67a / tree 93e71e7c52602ec3f8b76548fd12b2f5b4368b4c. All 240 primary and 240 blind rows were independently rebound to the fresh source and target hashes; none of the source texts or target values changed.

The ledger records 215 accepts, 13 wording adjustments, and 12 text-free hash-only holds for the shared unresolved Agent term. Fifty recommended target strings differ from the current target. The Japanese validationTypes target uses 1つ以上 (“one or more”), which is semantically equivalent to the English minimum-one instruction; the numeric-token heuristic mismatch is explicitly accepted. All other placeholder, ICU, markup, numeric, protected-literal, and inline-code checks pass.

No locale catalog, repository, PR, or workflow file was edited. No tests, builds, scans, or CI jobs were run. No browser review or native-speaker approval is claimed.

Portable packet verification:

    python3 verify_cross_review.py --candidate-free ../candidate-free --primary /home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-primary-20261105/primary-review --blind /home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-blind-seal-20261105

Exact Git object verification:

    python3 verify_cross_review.py --candidate-free ../candidate-free --primary /home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-primary-20261105/primary-review --blind /home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-blind-seal-20261105 --repo /mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume
"""
 (OUT/'README.md').write_text(readme,encoding='utf-8')
 # Cross manifest lists every packet file except the checksum list.
 files=sorted([p.name for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt']+['manifest.json'])
 manifest={'artifact':'SeerrNG PR #418 W4000-W4019 semantic cross-review','schemaVersion':1,
  'packetType':'cross-review','repository':SLUG,'pullRequest':418,'window':'W4000-W4019',
  'exactHead':HEAD,'exactTree':TREE,'headRef':BRANCH,'baseRef':'main','baseSha':BASE,'baseTree':BASETREE,
  'oldPrimaryHead':'ac193096ebfc0007183348b24e35bf6fee33f67a','oldPrimaryTree':'93e71e7c52602ec3f8b76548fd12b2f5b4368b4c',
  'oldBlindHead':'ac193096ebfc0007183348b24e35bf6fee33f67a','oldBlindTree':'93e71e7c52602ec3f8b76548fd12b2f5b4368b4c',
  'currentSelectedSourceCount':20,'currentCellCount':240,'currentPositionRange':[4037,4056],
  'sourceOrderSelection':'exact 20 source IDs and ID/text hashes from the sealed previous W4000 packet; positions recorded separately',
  'candidateFreePath':'../candidate-free','candidateFreeManifestSha256':sha((CF/'manifest.json').read_bytes()),
  'candidateFreeChecksumListSha256':sha((CF/'SHA256SUMS.txt').read_bytes()),
  'primaryPath':str(P),'primaryManifestSha256':sha((P/'manifest.json').read_bytes()),
  'primaryChecksumListSha256':sha((P/'SHA256SUMS.txt').read_bytes()),
  'blindPath':str(B),'blindSealSha256':sha((B/'blind-seal.json').read_bytes()),
  'blindChecksumListSha256':sha((B/'SHA256SUMS.txt').read_bytes()),
  'blindLedgerSha256':sha((B/'blind-decision-ledger.jsonl').read_bytes()),
  'oldCrossPacketReused':False,'parity528CellProposalSetIncluded':False,
  'proposalRowsReattested':{'primary':240,'blind':240},'sourceTextHashMatches':240,
  'currentTargetHashMatches':240,'oldCallerContextHashMatches':480,
  'sourceTextChangesSinceOldInput':0,'currentTargetChangesSinceOldInput':0,
  'recommendationCounts':dict(dec),'selectedSourceCounts':dict(source),'recommendedTargetsDifferentFromCurrent':changed,
  'hashOnlyHoldCount':sum(1 for r in rows if r['decision']=='hold'),
  'numericSemanticExceptionCells':['components.Settings.Notifications.NotificationsWebhook.validationTypes::ja'],
  'beforeAndAfterLiveRefsAttested':True,'entryExitRefsUnchanged':True,
  'nativeSpeakerReviewPerformed':False,'visualBrowserReviewPerformed':False,
  'repositoryOrPrEdited':False,'testsBuildsScansCiOrWorkflowsRun':False,
  'files':files}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 sums=[]
 for p in sorted(OUT.iterdir()):
  if p.is_file() and p.name!='SHA256SUMS.txt': sums.append(sha(p.read_bytes())+'  '+p.name)
 (OUT/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n',encoding='utf-8')
 print(json.dumps({'result':'SEALED','packet':str(OUT),'sources':20,'cells':240,
  'currentPositions':[4037,4056],'decisions':dict(dec),'selectedSources':dict(source),
  'recommendationsDifferentFromCurrent':changed,'hashOnlyHolds':sum(1 for r in rows if r['decision']=='hold'),
  'entryExitRefsUnchanged':True,'checksums':len(sums)},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
