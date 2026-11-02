from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,re,collections,subprocess
BASE=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-crossreview-20261102')
PRIMARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
HEAD='0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2'; TREE='a09117211080bbd89d32959f17d93b02a82b966f'
def sha(s): return hashlib.sha256(s if isinstance(s,bytes) else s.encode('utf-8')).hexdigest()
def ph(s):
 out=[];i=0
 while i<len(s):
  if s[i]!='{': i+=1;continue
  depth=1;j=i+1
  while j<len(s) and depth:
   if s[j]=='{':depth+=1
   elif s[j]=='}':depth-=1
   j+=1
  if depth:return None
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',s[i+1:j-1])
  if m:out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return sorted(out,key=lambda x:(x['name'],x['kind']))
def tags(s):return re.findall(r'</?[A-Za-z][^>]*>',s)
def cats(s):return sorted(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s)))
def branch_hashes(s):
 out={}
 for m in re.finditer(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s):
  cat=m.group(1); start=m.end(); depth=1; j=start
  while j<len(s) and depth:
   if s[j]=='{':depth+=1
   elif s[j]=='}':depth-=1
   j+=1
  out[cat]='#' in s[start:j-1]
 return out
child=BASE/'batch-ar-de-es'
subprocess.run(['sha256sum','-c','SHA256SUMS'],cwd=child,check=True,capture_output=True,text=True)
child_manifest_hash=sha((child/'SHA256SUMS').read_bytes())
assert child_manifest_hash=='593623ec4b81d4fd6a4debcf8615c6caef79507446294f8d5a6079c176b2311d'
own=[json.loads(x) for x in (BASE/'crossreview-own.jsonl').read_text().splitlines()]
rows_child=[json.loads(x) for x in (child/'crossreview-ledger.jsonl').read_text().splitlines()]
prim=[json.loads(x) for x in (PRIMARY/'primary-review-ledger.jsonl').read_text().splitlines()]
cells=[json.loads(x) for x in (PRIMARY/'source-current-cells.jsonl').read_text().splitlines()]
assert len(own)==900 and len(rows_child)==300 and len(prim)==1200 and len(cells)==1200
pby={(x['sourcePosition'],x['locale']):x for x in prim}
cby={(x['sourcePosition'],x['locale']):x for x in cells}
merged=[]
for r in own:
 key=(r['sourcePosition'],r['locale']); p=pby[key]
 if r['crossReviewDisposition']=='revise': status='revise-primary'; target=r['recommendedTarget']; rec=target; reason=r['rationale']
 elif p['disposition']=='accept-current': status='accept-current'; target=p['currentTarget']; rec=None; reason=r['rationale']
 else: status='accept-primary-correction'; target=p['finalTarget']; rec=None; reason=r['rationale']
 merged.append({'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'source':r['source'],'sourceTextSha256':r['sourceTextSha256'],'currentTarget':r['currentTarget'],'currentTargetHash':r['currentTargetHash'],'primaryDisposition':p['disposition'],'primaryTarget':p['finalTarget'],'primaryTargetHash':p['finalTargetHash'],'callerContextSha256':r['callerContextSha256'],'callerUseStatus':r['callerUseStatus'],'crossReviewDisposition':status,'recommendedTarget':rec,'recommendedTargetHash':sha(rec) if rec is not None else None,'reviewedTarget':target,'reviewedTargetHash':sha(target),'reason':reason,'confidence':r['confidence'],'reviewer':r['reviewer'],'sourcePlaceholders':r['sourcePlaceholders'],'currentPlaceholders':p['targetPlaceholders'],'primaryPlaceholders':p['finalTargetPlaceholders'],'sourceMarkup':r['sourceMarkup'],'primaryMarkup':p['finalTargetMarkup'],'sourceProtectedLiterals':r['protectedLiterals'],'sourceIcuPluralCategories':r['sourceIcuPluralCategories'],'primaryIcuPluralCategories':p['finalIcuPluralCategories'],'independentIntegrityReattestation':'passed'})
for r in rows_child:
 key=(r['sourcePosition'],r['locale']); p=pby[key]; disp=r['crossReviewDisposition']
 status={'accept-current':'accept-current','accept-primary-correction':'accept-primary-correction','revise-primary':'revise-primary','reject-primary-correction':'reject-primary','hold':'hold'}.get(disp)
 assert status is not None,(key,disp)
 if status=='accept-current': target=p['currentTarget']; rec=None
 elif status=='accept-primary-correction': target=p['finalTarget']; rec=None
 elif status=='revise-primary': target=r['recommendedTarget']; rec=target
 elif status=='reject-primary': target=p['currentTarget']; rec=None
 else: target=None; rec=None
 assert r['currentTargetHash']==p['currentTargetHash'] and r['primaryTargetHash']==p['finalTargetHash'],key
 if target is not None and status=='revise-primary': assert sha(target)==r['recommendedTargetHash'],key
 merged.append({'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'source':r['source'],'sourceTextSha256':r['sourceTextSha256'],'currentTarget':r['currentTarget'],'currentTargetHash':r['currentTargetHash'],'primaryDisposition':p['disposition'],'primaryTarget':p['finalTarget'],'primaryTargetHash':p['finalTargetHash'],'callerContextSha256':r['callerContextSha256'],'callerUseStatus':r['callerUseStatus'],'crossReviewDisposition':status,'recommendedTarget':rec,'recommendedTargetHash':sha(rec) if rec is not None else None,'reviewedTarget':target,'reviewedTargetHash':sha(target) if target is not None else None,'reason':r['reason'],'confidence':r['confidence'],'reviewer':r['reviewer'],'sourcePlaceholders':r['sourcePlaceholders'],'currentPlaceholders':p['targetPlaceholders'],'primaryPlaceholders':p['finalTargetPlaceholders'],'sourceMarkup':r['sourceMarkup'],'primaryMarkup':p['finalTargetMarkup'],'sourceProtectedLiterals':r['protectedLiterals'],'sourceIcuPluralCategories':r['sourceIcuPluralCategories'],'primaryIcuPluralCategories':p['finalIcuPluralCategories'],'countMarkerAudit':r.get('countMarkerAudit',[]),'independentIntegrityReattestation':'passed'})
merged.sort(key=lambda x:(x['sourcePosition'],x['locale']))
assert len(merged)==1200 and len({(x['sourcePosition'],x['locale']) for x in merged})==1200
assert {(r['sourcePosition'],r['locale']) for r in merged}==set(pby)
issues=[]; categories_valid={'ar':{'zero','one','two','few','many','other'},'fr':{'many'},'pt_BR':{'many'}}
revs=[]
for r in merged:
 key=(r['sourcePosition'],r['locale']); p=pby[key]; c=cby[key]; target=r['reviewedTarget']; source=c['source']
 assert r['sourceTextSha256']==c['sourceTextSha256'] and r['sourceTextSha256']==sha(source)
 assert r['currentTargetHash']==c['currentTargetHash'] and r['primaryTargetHash']==p['finalTargetHash']
 assert sha(r['currentTarget'])==r['currentTargetHash'] and sha(r['primaryTarget'])==r['primaryTargetHash']
 if r['crossReviewDisposition']=='revise-primary':
  assert r['recommendedTarget']==target and r['recommendedTargetHash']==sha(target); revs.append(r)
 else: assert r['recommendedTarget'] is None
 if target is None: issues.append({'key':list(key),'issue':'held'});continue
 if sha(target)!=r['reviewedTargetHash']:issues.append({'key':list(key),'issue':'reviewed-target-hash'})
 if ph(target)!=ph(source):issues.append({'key':list(key),'issue':'placeholder'})
 if tags(target)!=tags(source):issues.append({'key':list(key),'issue':'markup'})
 missing=[x for x in c['protectedLiterals'] if x not in target]
 if missing:issues.append({'key':list(key),'issue':'protected-literal','missing':missing})
 sc=cats(source);tc=cats(target)
 if not set(sc).issubset(tc) or (sc and 'other' not in tc):issues.append({'key':list(key),'issue':'icu-branches','source':sc,'target':tc})
 sh=branch_hashes(source);th=branch_hashes(target)
 for cat,has in sh.items():
  if has and not th.get(cat,False):issues.append({'key':list(key),'issue':'icu-count-marker','category':cat})
 extra=set(tc)-set(sc)-categories_valid.get(r['locale'],set())
 if extra:issues.append({'key':list(key),'issue':'locale-plural-category','extra':sorted(extra)})
assert not issues,issues[:20]
for r in revs: assert r['reviewedTarget']!=r['primaryTarget'],(r['locale'],r['sourcePosition'],'no-op revision')
before=json.loads((BASE/'live-prs-before.json').read_text()); after=json.loads((BASE/'live-prs-after.json').read_text())
assert before['phase']=='before' and after['phase']=='after' and len(before['pullRequests'])==len(after['pullRequests'])==7
bmap={(x['repository'].lower(),x['number']):x for x in before['pullRequests']}; amap={(x['repository'].lower(),x['number']):x for x in after['pullRequests']}
assert bmap.keys()==amap.keys()
fields=['state','isDraft','baseRefName','baseRefOid','headRefName','headRefOid','remoteBranchOid','tree']; changes=[]
for key in sorted(bmap):
 for field in fields:
  if bmap[key].get(field)!=amap[key].get(field):changes.append({'repository':key[0],'number':key[1],'field':field,'before':bmap[key].get(field),'after':amap[key].get(field)})
seerr=amap[('snapetech-org/seerrng',418)]
assert seerr['state']=='OPEN' and seerr['isDraft'] and seerr['headRefOid']==HEAD and seerr['remoteBranchOid']==HEAD and seerr['tree']==TREE
recon={'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'beforeSnapshot':'live-prs-before.json','afterSnapshot':'live-prs-after.json','reposQueried':7,'allSevenHeadAndStateFieldsUnchanged':not changes,'changes':changes,'exactSeerrPR418State':'OPEN','exactSeerrPR418Draft':True,'exactSeerrPR418Head':HEAD,'exactSeerrPR418Tree':TREE,'allRemoteBranchesMatchPRHeads':all(x['remoteBranchOid']==x['headRefOid'] for x in after['pullRequests'])}
(BASE/'live-prs-reconciliation.json').write_text(json.dumps(recon,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
route={'head':HEAD,'tree':TREE,'locale':'ar','sourceId':'components.ReaderDeliverySettings.title','source':'Reader Apps','frozenGlossaryLabel':'أجهزة قراءة','reviewedPrimaryAndCrossReviewedLabel':'تطبيقات القراءة','crossReviewDisposition':'accept-primary-correction','reason':'The frozen title reads as reading devices. The exact caller defines the page title as Reader Apps; in-scope breadcrumbs at positions 2501 and 2594 already use تطبيقات القراءة. Reconcile the Arabic route glossary with that reviewed software-app label before applying the localization packet.','callerEvidence':{'titleCaller':{'path':'src/components/Settings/ReaderDeliverySettings.tsx','line':20,'lineText':"title: 'Reader Apps',"},'renderCaller':{'path':'src/components/Settings/ReaderDeliverySettings.tsx','line':644,'lineText':'{intl.formatMessage(messages.title)}'},'breadcrumbCallers':[{'sourcePosition':2501,'path':'src/components/Common/ReaderDeliveryLink.tsx','line':23,'lineText':'ebooksHelp:'},{'sourcePosition':2594,'path':'src/components/Common/ReaderGroupingAction.tsx','line':86,'lineText':"setup: 'Set up a reader service in Settings > Services > Reader Apps, then return here.'"}],'exactTreeCallerContextHashes':{'2568':'1f2336e159bc23740ea377581bb105841d6a4c5b1c23f37b561307df81ea4c43','2501':'8133f136812d0cdfec231ef4fa131c5e534ff04af9367c61f56d5bd9f57daf6b','2594':'1859b8790a01ff466d0adf0b678e126a1d9fc9e912bf376479b2e1064a7e29b9'}}}
(BASE/'route-glossary-exception.json').write_text(json.dumps(route,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
counts=collections.Counter(r['crossReviewDisposition'] for r in merged)
per_locale={loc:dict(collections.Counter(r['crossReviewDisposition'] for r in merged if r['locale']==loc)) for loc in sorted({r['locale'] for r in merged})}
(BASE/'crossreview-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in merged))
fields=['sourcePosition','sourceId','locale','source','sourceTextSha256','currentTarget','currentTargetHash','primaryDisposition','primaryTarget','primaryTargetHash','recommendedTarget','recommendedTargetHash','reviewedTargetHash','callerContextSha256','reason','confidence','reviewer']
(BASE/'crossreview-revisions.jsonl').write_text(''.join(json.dumps({k:r[k] for k in fields},ensure_ascii=False,sort_keys=True)+'\n' for r in revs))
summary={'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'repository':'snapetech-org/SeerrNG','pullRequest':418,'sourceWindow':[2500,2599],'sourceKeys':100,'locales':12,'cells':1200,'head':HEAD,'tree':TREE,'crossReviewCounts':dict(counts),'perLocale':per_locale,'revisions':len(revs),'rejections':counts['reject-primary'],'holds':counts['hold'],'reviewedTargetIntegrityIssues':len(issues),'reviewedTargetPlaceholderMarkupProtectedLiteralIcuAndHashMismatches':0,'callerReferences':358,'callerFiles':3,'catalogKeyCountPerLocale':9494,'catalogKeySetParity':True,'catalogOrderDifferences':['ja','ko','vi','zh_Hans','zh_Hant'],'currentProtectedLiteralMismatchCells':34,'currentArabicICUCountMarkerMissingRows':[[2534,'ar'],[2581,'ar']],'primaryArabicICUCountMarkerMissingRows':[[2534,'ar'],[2581,'ar']],'reviewedTargetArabicICUCountMarkerMissingRows':[],'allSevenPRHeadsAndStatesUnchanged':not changes,'seerrPR418State':seerr['state'],'seerrPR418Draft':seerr['isDraft'],'seerrPR418Head':seerr['headRefOid'],'seerrPR418Tree':seerr['tree'],'routeGlossaryException':'ar: Reader Apps label changes from أجهزة قراءة to تطبيقات القراءة; exact caller and two in-scope breadcrumb references support the reviewed label, but the glossary must be reconciled before applying it.','nativeSpeakerApproval':'not provided; this is an independent machine-assisted cross-review','repoEdited':False,'testsBuildsScansCIOrBrowserRun':False,'childBatchManifestSha256':child_manifest_hash}
(BASE/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
readme='''# SeerrNG PR #418 W2500–2599 independent cross-review

Independently reviewed all 1,200 locale cells in the frozen primary packet at SeerrNG PR #418 exact head and tree, recorded in summary.json. The scope is English-catalog positions 2500–2599 inclusive (100 source keys × 12 locales).

## Dispositions

- Accept current: {ac}
- Accept primary correction/refinement: {ap}
- Revise primary proposal: {rp}
- Reject primary proposal: {reject}
- Hold: {hold}

The full row-level decisions, exact source/current/primary/recommended targets, hashes, caller pins, reasons, and integrity checks are in crossreview-ledger.jsonl. crossreview-revisions.jsonl lists the exact recommendations to apply. The ar/de/es source ledger and its separate checksum manifest are retained under batch-ar-de-es/.

## Reattestation

The exact SeerrNG tree and worktree were rechecked. All 12 catalogs contain the same 9,494-key set; five catalogs have the same known key-order differences (ja, ko, vi, zh_Hans, zh_Hant). All 1,200 current source/target strings and hashes match the exact tree. The 100 caller-context groups, 358 pinned line references, and 3 caller files were rehashed and verified.

The current catalog has 34 protected-literal mismatch cells. Arabic current and primary-final ICU strings also omit the # marker in the source one branch at positions 2534 and 2581. The cross-review recommendations repair those Arabic count markers. All reviewed targets pass placeholder type, markup, exact protected-literal, ICU branch, locale plural-category, count-marker, and hash checks.

All seven localization PR heads and states were queried before and after. SeerrNG PR #418 remained OPEN/DRAFT at the exact head and tree in summary.json. Snapshots and the field-by-field comparison are live-prs-before.json, live-prs-after.json, and live-prs-reconciliation.json.

The Arabic Reader Apps title correction to تطبيقات القراءة is supported by the exact title/rendering caller and both in-window breadcrumb callers; the frozen glossary still says أجهزة قراءة. route-glossary-exception.json records this exception for glossary reconciliation before applying changes.

This is a static, machine-assisted cross-review, not native-speaker approval. No repository or PR files were edited; no tests, builds, scans, CI jobs, or browser work were run. No releases were cut.

## Files

- crossreview-ledger.jsonl: all 1,200 canonical cross-review row decisions.
- crossreview-revisions.jsonl: all exact revised target recommendations with reasons and hashes.
- catalog-caller-reattestation.json: exact source/current/catalog/caller reattestation and current integrity findings.
- live-prs-before.json, live-prs-after.json, live-prs-reconciliation.json: seven-PR snapshots and comparison.
- route-glossary-exception.json: Arabic title/breadcrumb evidence.
- batch-ar-de-es/: independent ar/de/es 300-cell subreview with its own checksum manifest.
- SHA256SUMS and SHA256SUMS.sha256: packet checksums; the detached hash covers the manifest.
'''.format(ac=counts['accept-current'],ap=counts['accept-primary-correction'],rp=counts['revise-primary'],reject=counts['reject-primary'],hold=counts['hold'])
(BASE/'README.md').write_text(readme)
print(json.dumps({'cells':len(merged),'counts':dict(counts),'perLocale':per_locale,'revisions':len(revs),'integrityIssues':issues,'seerrHead':seerr['headRefOid'],'seerrTree':seerr['tree'],'allSevenUnchanged':not changes},ensure_ascii=False,indent=2))
