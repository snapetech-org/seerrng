from __future__ import annotations
import json,hashlib,re,shutil,pathlib,collections,subprocess
ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
SUB=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-primary-20261102')
def sha(x): return hashlib.sha256(x.encode() if isinstance(x,str) else x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
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
  body=s[i+1:j-1]; m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
  if m: out.append((m.group(1),m.group(2) or 'simple'))
  i=j
 return sorted(out)
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def subprocess_check_sums(root): return subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=root,text=True,capture_output=True).returncode==0
# Verify independent packet hashes before reading it.
for line in (SUB/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split('  ',1); assert sha((SUB/name).read_bytes())==expected,(name,'checksum')
att=json.loads((SUB/'attestation.json').read_text())
assert att['head']=='f20893e57a89827095fa049d8e0475df7ec7170f' and att['tree']=='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
assert att['livePullRequest']['state']=='OPEN' and att['livePullRequest']['isDraft'] is True
assert att['worktreeCleanBefore'] and att['worktreeCleanAfter']
assert att['inputManifestSha256']==sha((ROOT/'input-manifest.json').read_bytes())
# Current root input excludes the child packet from prior scans and fixes source-window list positions.
assert subprocess_check_sums(ROOT)
# Reconcile exact rows.
cells=[json.loads(x) for x in (ROOT/'source-current-cells.jsonl').read_text().splitlines()]
ctxs=[json.loads(x) for x in (ROOT/'caller-contexts.jsonl').read_text().splitlines()]
cellmap={(x['sourcePosition'],x['locale']):x for x in cells}; ctxmap={x['sourceId']:x for x in ctxs}
rows=[json.loads(x) for x in (SUB/'primary-review.jsonl').read_text().splitlines()]
assert len(rows)==300
counts=collections.Counter(); locale=collections.Counter(); merged=[]; failures=[]; no_op_proposals=[]
for r in rows:
 pos=r['scopePosition']; loc=r['locale']; key=(pos,loc); c=cellmap.get(key)
 if not c: failures.append({'cell':key,'reason':'no current source cell'}); continue
 ctx=ctxmap[c['sourceId']]
 effective=r['disposition']
 if effective=='propose-replacement' and r['reviewedTarget']==r['currentTarget']:
  effective='accept-current'; no_op_proposals.append({'sourcePosition':pos,'sourceId':r['sourceId'],'locale':loc,'currentTargetHash':r['currentTargetHash'],'note':'Reviewed target is byte-identical to current; revised no-op proposal to accept-current.'})
 checks={
  'source_id':r['sourceId']==c['sourceId'], 'source_hash':r['sourceHash']==c['sourceHash'],
  'source_text':r['sourceText']==c['source'], 'source_text_hash':r['sourceTextSha256']==c['sourceTextSha256'],
  'current_target':r['currentTarget']==c['currentTarget'], 'current_hash':r['currentTargetHash']==c['currentTargetHash'],
  'source_catalog_blob':r['sourceCatalogBlob']==c['sourceCatalogBlob'], 'source_file_hash':r['sourceFileSha256']==c['sourceFileSha256'],
  'locale_blob':r['localeBlob']==c['localeBlob'], 'locale_file_hash':r['localeFileSha256']==c['localeFileSha256'],
  'caller_context_hash':r['callerContextSha256']==c['callerContextSha256'],
  'caller_paths':r['callerPaths']==ctx['callerPaths'],
  'caller_line_refs':r['pinnedCallerLineRefs']==ctx['pinnedLineRefs'],
  'reviewed_target_hash':r['reviewedTargetSha256']==sha(r['reviewedTarget']),
  'source_placeholder_parity':ph(r['sourceText'])==ph(r['reviewedTarget']),
  'source_markup_parity':tags(r['sourceText'])==tags(r['reviewedTarget']),
  'accepted_current_unchanged':effective!='accept-current' or r['reviewedTarget']==r['currentTarget'],
  'proposal_changes_current':effective!='propose-replacement' or r['reviewedTarget']!=r['currentTarget'],
 }
 if r['disposition'] not in ('accept-current','propose-replacement','hold'): checks['valid_disposition']=False
 if not all(checks.values()): failures.append({'cell':key,'sourceId':r['sourceId'],'failedChecks':[k for k,v in checks.items() if not v]})
 counts[effective]+=1; locale[loc]+=1
 merged.append({'sourcePosition':pos,'sourceId':r['sourceId'],'locale':loc,'originalDisposition':r['disposition'],'disposition':effective,'reviewedTargetSha256':r['reviewedTargetSha256'],'sourceRowSha256':sha(canon(r)),'reviewer':r['reviewer']})
assert not failures,failures[:5]
assert all(locale[x]==100 for x in ('hi','id','vi'))
assert counts=={'accept-current':152,'propose-replacement':148},counts
assert len(no_op_proposals)==3,no_op_proposals
assert len({(r['scopePosition'],r['locale']) for r in rows})==300
# Copy exact independent evidence under the primary packet for a self-contained handoff.
out=ROOT/'independent-subreview'
out.mkdir(exist_ok=True)
for n in ('primary-review.jsonl','attestation.json','README.md','SHA256SUMS'):
 shutil.copy2(SUB/n,out/n)
parity={'head':att['head'],'tree':att['tree'],'childPacketDirectory':str(SUB),'childAttestationSha256':sha((SUB/'attestation.json').read_bytes()),
 'childLedgerSha256':sha((SUB/'primary-review.jsonl').read_bytes()),'childInputManifestSha256':att['inputManifestSha256'],'currentInputManifestSha256':sha((ROOT/'input-manifest.json').read_bytes()),
 'childInputSumsFileSha256':att['inputSumsFileSha256'],'currentInputSumsFileSha256':sha((ROOT/'INPUT-SHA256SUMS').read_bytes()),
 'reconciliation':'The child-provided window list had stale 2300-series position labels, so its 300 ledger rows were imported only after each scopePosition/sourceId/source-text/current-target/source+locale catalog/caller hash matched the corrected current root inputs. The child input manifest hash exactly matches the current regenerated input manifest; the sum-file hash differs because the current source-window list is corrected. Three proposed targets were byte-identical to current values and are revised to accept-current.',
 'reconciledRows':len(merged),'counts':dict(counts),'perLocaleRows':dict(locale),'failedChecks':failures,'revisedNoOpProposals':no_op_proposals,
 'rowLevelReconciliationSha256':sha(canon(merged)),'sourceWindowPositionDefectDetected':True,'importAccepted':True}
(ROOT/'independent-subreview-reconciliation.json').write_text(json.dumps(parity,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps({'attestedInputManifestMatchesCurrent':parity['childInputManifestSha256']==parity['currentInputManifestSha256'],'oldInputSums':parity['childInputSumsFileSha256'],'currentInputSums':parity['currentInputSumsFileSha256'],'rows':len(rows),'counts':dict(counts),'perLocale':dict(locale),'failed':len(failures),'revisedNoOps':len(no_op_proposals)},ensure_ascii=False,indent=2))
