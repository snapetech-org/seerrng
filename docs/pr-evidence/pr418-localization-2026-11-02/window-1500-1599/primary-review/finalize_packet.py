import collections,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1500-1599-primary-20261102')
WORK=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
HEAD='94bdd3f690fc54d37d17e04d29a443533af3fb0d'; TREE='17df3c6f626ac544990d2f8f2049daf95b4738ac'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt-BR','vi','zh-CN','zh-TW']
GROUP_A={'ar','de','es','fr','hi','id'}
FILES={'ar':'src/i18n/locale/ar.json','de':'src/i18n/locale/de.json','es':'src/i18n/locale/es.json','fr':'src/i18n/locale/fr.json','hi':'src/i18n/locale/hi.json','id':'src/i18n/locale/id.json','ja':'src/i18n/locale/ja.json','ko':'src/i18n/locale/ko.json','pt-BR':'src/i18n/locale/pt_BR.json','vi':'src/i18n/locale/vi.json','zh-CN':'src/i18n/locale/zh_Hans.json','zh-TW':'src/i18n/locale/zh_Hant.json'}
PROTECTED=['SeerrNG','Prowlarr','Trakt','AniList','Simkl','MDBList','Plex','Jellyfin','Emby','MiB','4K','HD']
def rj(p): return json.loads(Path(p).read_text(encoding='utf8'))
def rjl(p): return [json.loads(x) for x in Path(p).read_text(encoding='utf8').splitlines() if x]
def wj(p,x): Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def wjl(p,rows): Path(p).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in rows),encoding='utf8')
def hb(b): return hashlib.sha256(b).hexdigest()
def hs(s): return hb(s.encode('utf8'))
def git(*a): return subprocess.check_output(['git',*a],cwd=WORK,text=True).strip()
def gb(path): return subprocess.check_output(['git','show',f'{HEAD}:{path}'],cwd=WORK)
def ph(s): return sorted(set(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,}]|$)',s)))
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def lits(s): return {x:s.count(x) for x in PROTECTED if s.count(x)}

assert git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE and git('status','--porcelain')==''
allin=rjl(ROOT/'review-input-all-cells.jsonl'); newin=rjl(ROOT/'review-input.jsonl')
assert len(allin)==1200 and len(newin)==1162
src=json.loads(gb('src/i18n/locale/en.json')); ids=list(src)[1500:1600]
assert len(ids)==100
for n,i in enumerate(ids,1500):
 r=next(x for x in allin if x['sourceIdPosition']==n)
 assert r['id']==i and r['source']==src[i] and r['sourceHash']==hs(r['source'])
catalogs={}; blobs={}
for loc,path in FILES.items():
 b=gb(path); catalogs[loc]=json.loads(b); blobs[loc]=git('rev-parse',f'{HEAD}:{path}')
 assert hb(b)==hb((WORK/path).read_bytes())
for r in allin:
 assert catalogs[r['locale']][r['id']]==r['currentTarget']
 assert hs(r['currentTarget'])==r['currentTargetHash'] and r['targetCatalogBlob']==blobs[r['locale']]
 assert hs(r['source'])==r['sourceHash']
 for c in r['sourceContexts']:
  assert c['attestedHead']==HEAD and c['attestedTree']==TREE and c['matchedAtCurrentHead']
  p=WORK/c['path']; lines=p.read_text(encoding='utf8').splitlines()
  assert lines[c['line']-1]==c['lineText'] and hs(c['lineText'])==c['lineSha256']
  assert git('rev-parse',f'{HEAD}:{c["path"]}')==c['fileBlob'] and hb(p.read_bytes())==c['fileSha256']
assert rj(ROOT/'manifest.json')['head']==HEAD and rj(ROOT/'manifest.json')['tree']==TREE

base=rjl(ROOT/'primary-review-ledger.jsonl'); reviews=rjl(ROOT/'review-by-agent-a.jsonl')+rjl(ROOT/'review-by-agent-b.jsonl')
priors=rjl(ROOT/'preserved-prior-dispositions.jsonl')
assert len(base)==1200 and len(reviews)==len(newin)==1162 and len(priors)==38
prior={(x['id'],x['locale']) for x in priors}
rm={(x['id'],x['locale']):x for x in reviews}; im={(x['id'],x['locale']):x for x in newin}
assert len(rm)==1162 and set(rm)==set(im) and not prior & set(rm)
ctx={x['sourceId']:x for x in rjl(ROOT/'source-contexts.jsonl')}
counts=collections.Counter(); by={l:collections.Counter() for l in LOCALES}
cands=[]; holds=[]; ledger=[]
current_literal_mismatches=set(); ph_fail=set(); tag_fail=set(); lit_fail=set()
for old in base:
 row=dict(old); key=(old['sourceId'],old['locale'])
 if key in prior:
  assert old['decision']=='preserved-prior-disposition' and hs(old['currentTarget'])==old['currentTargetHash']
  assert any((p['id'],p['locale'])==key and p['currentTarget']==old['currentTarget'] for p in priors)
  decision='preserved-prior-disposition'; final=old['currentTarget']; counts[decision]+=1; by[old['locale']][decision]+=1
 else:
  rv=rm[key]; inp=im[key]
  for f in ('id','locale','source','sourceHash','currentTarget','currentTargetHash','targetFile','targetCatalogBlob','sourceContexts'): assert rv[f]==inp[f]
  assert rv['exactHead']==HEAD and rv['exactTree']==TREE and rv['inputAttestationMismatches']==[]
  decision=rv['disposition']; assert decision in {'accept-current','propose-correction','propose-refinement','hold'}
  target=rv['recommendedTarget']; th=rv['recommendedTargetHash']
  if decision in {'accept-current','hold'}:
   assert target is None and th is None; final=old['currentTarget']
  else:
   assert isinstance(target,str) and th==hs(target); final=target
   cands.append({'attestedHead':HEAD,'attestedTree':TREE,'candidateHash':th,'candidateKind':'correction' if decision=='propose-correction' else 'refinement','confidence':rv['confidence'],'currentTarget':old['currentTarget'],'currentTargetHash':old['currentTargetHash'],'id':old['sourceId'],'locale':old['locale'],'proposedTarget':target,'rationale':rv['rationale'],'source':old['source'],'sourceCatalogBlob':old['sourceCatalogBlob'],'sourceCatalogSha256':old['sourceCatalogSha256'],'sourceHash':old['sourceHash'],'sourceIdPosition':old['sourceIdPosition'],'targetCatalogBlob':old['targetCatalogBlob'],'targetCatalogSha256':old['targetCatalogSha256'],'targetFile':old['targetFile']})
  row.update({'decision':decision,'decisionRationale':rv['rationale'],'confidence':rv['confidence'],'semanticReviewPerformed':True,'routingDisposition':'new-primary-candidate' if decision.startswith('propose-') else ('primary-review-hold' if decision=='hold' else 'primary-review-accept-current'),'candidateKind':{'propose-correction':'correction','propose-refinement':'refinement'}.get(decision),'proposedTarget':target if decision.startswith('propose-') else None,'proposedTargetHash':th if decision.startswith('propose-') else None,'priorDispositionPreserved':False,'priorDispositionRef':None,'reviewerCallerAssessment':rv['callerAssessment'],'reviewSubpacket':'locale-a/review-by-agent-a.jsonl' if old['locale'] in GROUP_A else 'locale-b/review-by-agent-b.jsonl'})
  if decision=='hold': holds.append({'id':old['sourceId'],'locale':old['locale'],'sourceIdPosition':old['sourceIdPosition'],'currentTarget':old['currentTarget'],'rationale':rv['rationale'],'confidence':rv['confidence'],'callerAssessment':rv['callerAssessment']})
  counts[decision]+=1; by[old['locale']][decision]+=1
 s=old['source']; c=old['currentTarget']
 sourceph=ph(s); curph=ph(c); finalph=ph(final)
 sourcet=tags(s); curt=tags(c); finalt=tags(final)
 sourcel=lits(s); curl=lits(c); finall=lits(final)
 row.update({'placeholderNamesSource':sourceph,'placeholderNamesCurrent':curph,'placeholderNamesProposed':finalph,'placeholderCurrentParity':sourceph==curph,'placeholderParity':sourceph==finalph,'markupTagsSource':sourcet,'markupTagsCurrent':curt,'markupTagsProposed':finalt,'markupCurrentParity':sourcet==curt,'markupParity':sourcet==finalt,'protectedLiteralsSource':sourcel,'protectedLiteralsCurrent':curl,'protectedLiteralsProposed':finall,'protectedLiteralCurrentParity':sourcel==curl,'protectedLiteralParity':sourcel==finall})
 if sourcel!=curl: current_literal_mismatches.add(key)
 if sourceph!=finalph: ph_fail.add(key)
 if sourcet!=finalt: tag_fail.add(key)
 if sourcel!=finall: lit_fail.add(key)
 assert sourceph==finalph and sourcet==finalt and sourcel==finall,(key,sourceph,finalph,sourcet,finalt,sourcel,finall)
 ledger.append(row)
assert sum(counts.values())==1200 and counts['preserved-prior-disposition']==38
assert counts['accept-current']==537 and counts['propose-correction']==303 and counts['propose-refinement']==36 and counts['hold']==286
assert len(cands)==339 and len(holds)==286 and len(current_literal_mismatches)==13 and not ph_fail and not tag_fail and not lit_fail
order={l:i for i,l in enumerate(LOCALES)}
cands.sort(key=lambda x:(x['sourceIdPosition'],order[x['locale']])); holds.sort(key=lambda x:(x['sourceIdPosition'],order[x['locale']]))
wjl(ROOT/'primary-review-ledger.jsonl',ledger); wjl(ROOT/'candidate-proposals.jsonl',cands)
wjl(ROOT/'candidate-hashes.jsonl',[{'id':x['id'],'locale':x['locale'],'sourceIdPosition':x['sourceIdPosition'],'currentTargetHash':x['currentTargetHash'],'candidateHash':x['candidateHash'],'candidateKind':x['candidateKind']} for x in cands])
wjl(ROOT/'holds.jsonl',holds)
s=rj(ROOT/'summary.json')
s.update({'rowsReviewed':1200,'primaryDispositions':dict(counts),'candidateCount':len(cands),'candidateCorrections':counts['propose-correction'],'candidateRefinements':counts['propose-refinement'],'holds':counts['hold'],'countsByLocale':{l:dict(by[l]) for l in LOCALES},'placeholderFailures':len(ph_fail),'markupFailures':len(tag_fail),'protectedLiteralFailures':len(lit_fail),'protectedLiteralCurrentMismatchCells':len(current_literal_mismatches),'candidateProposalHashesValidated':len(cands),'allCatalogCellMismatches':0,'callerContextMismatches':0,'nativeSpeakerReviewPerformed':False,'browserReviewPerformed':False,'reviewInputChecksumsVerified':True,'notes':s['notes']+['All 1,200 source/current cells, 12 locale catalogs, and caller pins were re-attested against the live exact head/tree before finalizing.','The 38 prior Spanish cell dispositions and applied targets are preserved unchanged.','Definition-only and unlocated caller cases are held: 286 new cells remain held because exact caller meaning is not established.','All proposed targets were UTF-8 SHA-256 checked and preserve source placeholders/ICU fields, markup, and protected product/technical literals.','Thirteen current cells had provider/product/unit literal mismatches; each has a correcting proposal.','Machine-assisted semantic review only; no native-speaker signoff or browser review is claimed.']})
wj(ROOT/'summary.json',s)
m=rj(ROOT/'manifest.json')
m.update({'head':HEAD,'tree':TREE,'rowsReviewed':1200,'priorDispositionCellCount':38,'semanticDispositions':{'accept-current':counts['accept-current'],'propose-correction':counts['propose-correction'],'propose-refinement':counts['propose-refinement'],'hold':counts['hold'],'preserved-prior-disposition':counts['preserved-prior-disposition'],'candidateCount':len(cands),'byLocale':{l:dict(by[l]) for l in LOCALES}},'candidateCount':len(cands),'heldCells':len(holds),'definitionOnlyTargetCellCount':288,'currentProtectedLiteralMismatchCells':len(current_literal_mismatches),'finalPlaceholderFailures':len(ph_fail),'finalMarkupFailures':len(tag_fail),'finalProtectedLiteralFailures':len(lit_fail),'catalogCellMismatches':0,'callerPinMismatches':0,'livePinReattestation':'pass'})
wj(ROOT/'manifest.json',m)
readme="""# SeerrNG PR #418 W1500–1599 primary semantic review
Exact live head: 94bdd3f690fc54d37d17e04d29a443533af3fb0d
Exact tree: 17df3c6f626ac544990d2f8f2049daf95b4738ac

Reviewed 1,200 source/current cells across 12 locales. The source range is positions 1500–1599 in src/i18n/locale/en.json. Every current target, catalog blob, source and caller line/blob pin was re-attested at the exact live head/tree.

Disposition counts: accept-current 537; propose-correction 303; propose-refinement 36; hold 286; preserved prior Spanish disposition 38. The 38 earlier Spanish decisions are unchanged. Caller-ambiguous definition-only or unlocated keys are held. All proposal hashes are exact UTF-8 SHA-256 values. Final targets preserve placeholders, ICU syntax, markup and exact protected product/technical literals. Thirteen current cells had protected literal mismatches; each has a proposed correction.

Machine-assisted semantic review only; no native-speaker approval or browser review is claimed. No repository or PR files were changed and no tests/builds/scans/CI were run.
"""
(ROOT/'README.md').write_text(readme,encoding='utf8')
wj(ROOT/'task.json',{'schemaVersion':1,'repository':'snapetech-org/seerrng','pullRequest':418,'state':'OPEN','isDraft':True,'head':HEAD,'tree':TREE,'sourcePositions':[1500,1599],'sourceIds':100,'locales':LOCALES,'cells':1200,'semanticReviewRows':1162,'priorDispositionCellsPreserved':38,'dispositions':dict(counts),'candidateCount':len(cands),'candidatePacket':'candidate-proposals.jsonl','ledger':'primary-review-ledger.jsonl','holds':'holds.jsonl','readOnly':True,'nativeSpeakerSignoff':False,'browserReview':False})
wj(ROOT/'final-attestation-check.json',{'head':HEAD,'tree':TREE,'sourceIds':100,'cells':1200,'sourceCurrentCatalogMismatches':0,'callerLineOrBlobMismatches':0,'priorCellsPreserved':38,'candidateCount':len(cands),'holds':len(holds),'candidateHashMismatches':0,'placeholderFailures':len(ph_fail),'markupFailures':len(tag_fail),'protectedLiteralFailures':len(lit_fail),'currentProtectedLiteralMismatchCells':len(current_literal_mismatches),'result':'pass'})
print(json.dumps({'counts':dict(counts),'byLocale':{l:dict(by[l]) for l in LOCALES},'candidateCount':len(cands),'holdCount':len(holds),'currentLiteralMismatchCells':len(current_literal_mismatches)},ensure_ascii=False,indent=2))

