from __future__ import annotations
import json,hashlib,pathlib,subprocess,re,collections
from datetime import datetime,timezone
ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='f20893e57a89827095fa049d8e0475df7ec7170f'; TREE='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PROTECTED=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library']
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode()).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def run(*a): return subprocess.check_output(a,text=True).strip()
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
def flatten(d,p=''):
 for k,v in d.items():
  q=f'{p}.{k}' if p else k
  if isinstance(v,dict): yield from flatten(v,q)
  else: yield q,v
def ph(s):
 out=[]; i=0
 while i<len(s):
  if s[i]!='{': i+=1; continue
  depth=1; j=i+1
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  if depth: break
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',s[i+1:j-1])
  if m: out.append((m.group(1),m.group(2) or 'simple'))
  i=j
 return sorted(out)
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def has_term(text,term):
 if term in ('ROM','PC','4K'):
  suffix='s?' if term=='ROM' else ''
  return re.search(r'(?<![A-Za-z0-9])'+re.escape(term)+suffix+r'(?![A-Za-z0-9])',text) is not None
 return term.casefold() in text.casefold()
# Input and all packet checksums before writing the final attestation.
assert subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=ROOT,text=True,capture_output=True).returncode==0
assert run('git','-C',str(REPO),'rev-parse','HEAD')==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}')==TREE
assert run('git','-C',str(REPO),'status','--porcelain')==''
pr=json.loads(run('gh','pr','view','418','--repo','snapetech-org/SeerrNG','--json','number,state,isDraft,headRefName,headRefOid,baseRefOid,url'))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f"refs/heads/{pr['headRefName']}").split()[0]
assert remote==HEAD
all_prs=json.loads((ROOT/'live-localization-prs.json').read_text())
assert len(all_prs['liveLocalizationPullRequests'])==7
pr418=next(x for x in all_prs['liveLocalizationPullRequests'] if x['number']==418)
assert pr418['headRefOid']==HEAD and pr418['headTree']==TREE and pr418['remoteBranchOid']==HEAD
# Reattest the exact 100-key source window/boundary at the pinned tree.
sources=list(flatten(json.loads(git('show',f'{HEAD}:src/i18n/locale/en.json'))))
expected=[(2400+i,*sources[2400+i]) for i in range(100)]
source_window=json.loads((ROOT/'source-window.json').read_text())
assert [(x['position'],x['sourceId'],x['source']) for x in source_window['sourceList']]==expected
boundary=json.loads((ROOT/'source-boundaries.json').read_text())
assert [(x['sourcePosition'],x['sourceId']) for x in boundary['positions']]==[(2399,sources[2399][0]),(2400,sources[2400][0]),(2499,sources[2499][0]),(2500,sources[2500][0])]
parity=json.loads((ROOT/'catalog-parity.json').read_text())
assert parity['allLocalesExactKeySetParity'] and all(x['keySetParity'] for x in parity['locales'])
# Verify exact target rows and all integrity invariants against the live tree.
ledger=[json.loads(x) for x in (ROOT/'primary-review-ledger.jsonl').read_text().splitlines()]
assert len(ledger)==1200 and len({(x['sourcePosition'],x['locale']) for x in ledger})==1200
counts=collections.Counter(x['disposition'] for x in ledger); per=collections.defaultdict(collections.Counter)
current_structural=0; final_structural=0; current_protected=0; final_protected=0
for row in ledger:
 pos=row['sourcePosition']; loc=row['locale']; sid=row['sourceId']; src=sources[pos][1]
 assert (sid,src)==(row['sourceId'],row['source'])
 cell_data=json.loads(git('show',f'{HEAD}:src/i18n/locale/{loc}.json'))
 assert cell_data[sid]==row['currentTarget'] and sha(row['currentTarget'])==row['currentTargetHash']
 assert row['finalTarget'] is not None and sha(row['finalTarget'])==row['finalTargetHash']
 ctx=row['callerContext']; assert sha(canon(ctx))==row['callerContextSha256'] and ctx['sourceId']==sid
 assert ph(src)==ph(row['finalTarget']) and tags(src)==tags(row['finalTarget'])
 terms=[t for t in PROTECTED if has_term(src,t)]
 assert not [t for t in terms if not has_term(row['finalTarget'],t)],(pos,loc,terms,row['finalTarget'])
 if ph(src)!=ph(row['currentTarget']) or tags(src)!=tags(row['currentTarget']): current_structural+=1
 if ph(src)!=ph(row['finalTarget']) or tags(src)!=tags(row['finalTarget']): final_structural+=1
 if [t for t in terms if not has_term(row['currentTarget'],t)]: current_protected+=1
 if [t for t in terms if not has_term(row['finalTarget'],t)]: final_protected+=1
 if row['disposition']=='propose-correction': assert row['finalTarget']!=row['currentTarget']
 per[loc][row['disposition']]+=1
assert counts=={'accept-current':853,'propose-correction':347},counts
assert all(sum(per[l].values())==100 for l in LOCALES)
assert current_structural==0 and final_structural==0 and final_protected==0
recon=json.loads((ROOT/'independent-subreview-reconciliation.json').read_text())
assert recon['importAccepted'] and recon['reconciledRows']==300 and len(recon['revisedNoOpProposals'])==3
assert recon['failedChecks']==[]
state={'head':run('git','-C',str(REPO),'rev-parse','HEAD'),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}'),'status':run('git','-C',str(REPO),'status','--porcelain')}
assert state=={'head':HEAD,'tree':TREE,'status':''}
att={'passed':True,'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'repository':'snapetech-org/SeerrNG','pullRequest':418,'pullRequestState':pr['state'],'isDraft':pr['isDraft'],'head':HEAD,'tree':TREE,'remoteBranchHead':remote,'worktree':str(REPO),'worktreeState':state,
 'allSevenLivePrSnapshot':'live-localization-prs.json','allSevenLivePrSnapshotSha256':sha((ROOT/'live-localization-prs.json').read_bytes()),'sourceRange':[2400,2499],'sourceIds':100,'localeCells':1200,'counts':dict(counts),'callerReferences':262,'callerFiles':4,'callerGaps':0,
 'localeCatalogKeySetParity':parity['allLocalesExactKeySetParity'],'localeCatalogOrderDifferences':parity['localesWithOrderDifferences'],'currentPlaceholderOrMarkupMismatches':current_structural,'finalPlaceholderOrMarkupMismatches':final_structural,'currentProtectedLiteralMismatchCells':current_protected,'finalProtectedLiteralMismatchCells':final_protected,
 'independentSubsetReconciledRows':300,'independentSubsetNoOpProposalsRevised':len(recon['revisedNoOpProposals']),'independentSubsetHolds':0,'nativeSpeakerApproval':False,'browserReview':False,'testsBuildsCiRun':False,'repoOrPRModified':False}
(ROOT/'final-reattestation.json').write_text(json.dumps(att,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps(att,ensure_ascii=False,indent=2))
