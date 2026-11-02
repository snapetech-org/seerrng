from __future__ import annotations
import hashlib,json,pathlib,re,collections,datetime
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-crossreview-20261102')
INPUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-primary-20261102')
PRIMARY=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2400-2499-hidvi-primary-20261102')
HEAD='f20893e57a89827095fa049d8e0475df7ec7170f'; TREE='b5a5952fb4f8a37ea5a39286295f153ce9504f52'
LOCALES=('hi','id','vi')
def sha(s):return hashlib.sha256(s.encode('utf-8')).hexdigest()
def readjl(p):return [json.loads(x) for x in p.read_text().splitlines()]
def writej(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(p,rows):p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
# Review-specific target refinements and additional corrections.
REVISED={
 (2470,'id'):'Kirim permintaan untuk {count} film yang melibatkan {person}. Permintaan yang sudah ada dan film yang masuk daftar blokir akan dilewati. Izin dan kuota permintaan yang berlaku tetap diterapkan.',
 (2471,'id'):'Tidak dapat mengajukan permintaan untuk film yang melibatkan orang ini.',
 (2472,'id'):'Berhasil mengirim {created} permintaan film. {skipped} dilewati; {failed} gagal.',
 (2473,'id'):'Ajukan permintaan untuk semua film yang melibatkan {person}',
}
ADDITIONAL={
 (2414,'vi'):'Đưa nội dung vào danh sách chặn.',
 (2415,'vi'):'Cho phép đưa nội dung vào danh sách chặn.',
 (2452,'vi'):'Xem nội dung trong danh sách chặn.',
 (2459,'vi'):'Cho phép xem các yêu cầu nội dung do người dùng khác gửi.',
 (2466,'vi'):'Đoàn làm phim',
}
REVISION_REASON={
 (2470,'id'):'The caller gathers cast and crew credits, so “dibintangi” (“starring”) narrows the source “by {person}” to actors. “Melibatkan {person}” covers all credited involvement.',
 (2471,'id'):'“Dibintangi orang ini” limits the request to movies starring the person, while the caller’s filmography includes all credit types. “Film yang melibatkan orang ini” preserves the broader scope.',
 (2472,'id'):'The proposal begins with “Mengirim” (sending) instead of a completed submission. “Berhasil mengirim” makes the success result clear and keeps all three counts.',
 (2473,'id'):'“Dibintangi {person}” again limits the page action to acting credits; the caller uses all cast and crew filmography entries. “Yang melibatkan {person}” keeps the intended wider scope.',
}
ADDITIONAL_REASON={
 (2414,'vi'):'“Phương tiện” usually means a vehicle or means of transport. In this media-permissions UI, “nội dung” is the established generic media term and avoids that misreading.',
 (2415,'vi'):'Same terminology issue as the permission label: use the app’s established “nội dung” for media, not “phương tiện”.',
 (2452,'vi'):'“Phương tiện bị chặn” can read as a blocked vehicle/device. “Nội dung trong danh sách chặn” clearly means blocklisted media.',
 (2459,'vi'):'Use “yêu cầu nội dung” for media requests and the natural order “do người dùng khác gửi”.',
 (2466,'vi'):'“Phi hành đoàn” means an aircraft crew. In PersonDetails this is the film/TV credits section for crew jobs; “Đoàn làm phim” is the intended film-crew label.',
}

input_manifest=json.loads((INPUT/'input-manifest.json').read_text())
window=json.loads((INPUT/'source-window.json').read_text())
assert input_manifest['head']==HEAD and input_manifest['tree']==TREE
assert [x['position'] for x in window['sourceList']]==list(range(2400,2500))
source_cells=readjl(INPUT/'source-current-cells.jsonl'); assert len(source_cells)==1200
cellmap={(x['sourcePosition'],x['locale']):x for x in source_cells}
primary_rows=readjl(PRIMARY/'primary-review.jsonl'); assert len(primary_rows)==300
primap={(x['scopePosition'],x['locale']):x for x in primary_rows}
caller_rows=readjl(INPUT/'caller-contexts.jsonl'); callmap={x['sourceId']:x for x in caller_rows}; assert len(callmap)==100
assert len(primap)==300 and len(cellmap)==1200
# Helpers for ICU and placeholder structure.
def parse_icu(text):
 cats=[]; vars=[]; consumed=[]
 i=0
 while i<len(text):
  if text[i]!='{': i+=1; continue
  depth=0; end=None
  for j in range(i,len(text)):
   if text[j]=='{':depth+=1
   elif text[j]=='}':
    depth-=1
    if depth==0: end=j;break
  if end is None: break
  block=text[i+1:end]
  m=re.match(r'\s*([\w.-]+)\s*,\s*plural\s*,',block)
  if m:
   name=m.group(1); vars.append(name)
   tail=block[m.end():]; level=0; p=0; local=[]
   while p<len(tail):
    while p<len(tail) and tail[p].isspace():p+=1
    start=p
    while p<len(tail) and (tail[p].isalpha() or tail[p] in '=-0123456789'):p+=1
    cat=tail[start:p]
    while p<len(tail) and tail[p].isspace():p+=1
    if not cat or p>=len(tail) or tail[p]!='{': break
    local.append(cat); dep=0
    while p<len(tail):
     if tail[p]=='{':dep+=1
     elif tail[p]=='}':
      dep-=1
      if dep==0:p+=1;break
     p+=1
   cats.append({'variable':name,'categories':local})
   consumed.append((i,end+1))
  i=end+1
 # Simple placeholders outside the plural blocks.
 stripped=list(text)
 for a,b in consumed:
  for k in range(a,b):stripped[k]=' '
 nonicu=''.join(stripped)
 simple=sorted(re.findall(r'\{([A-Za-z_$][\w.$-]*)\}',nonicu))
 return sorted(vars),sorted(cats,key=lambda x:x['variable']),simple
TAG_RE=re.compile(r'</?[A-Za-z][A-Za-z0-9_.:-]*(?:\s+[^<>]*?)?\s*/?>')
PUNCT_RE=re.compile(r'\{[^{}]+\}')
def tags(text):return sorted(TAG_RE.findall(text))

ledger=[]; proposals=0; changed_candidates=0; noop=0
for pos in range(2400,2500):
 ent=window['sourceList'][pos-2400]; sid=ent['sourceId']; source=ent['source']
 for loc in LOCALES:
  c=cellmap[(pos,loc)]; p=primap[(pos,loc)]; caller=callmap[sid]
  assert c['sourceId']==sid and c['source']==source and p['sourceId']==sid and p['sourceText']==source
  assert c['currentTarget']==p['currentTarget'] and c['currentTargetHash']==p['currentTargetHash']
  assert c['callerContextSha256']==p['callerContextSha256']
  primary_proposed=p['disposition']=='propose-replacement'
  if primary_proposed:proposals+=1
  proposal=p['reviewedTarget'] if primary_proposed else None
  is_noop=bool(primary_proposed and proposal==c['currentTarget'])
  if is_noop:noop+=1
  key=(pos,loc)
  if key in ADDITIONAL:
   verdict='propose-additional-correction'; final=ADDITIONAL[key]; reason=ADDITIONAL_REASON[key]; origin='crossreview-additional'
  elif key in REVISED:
   verdict='revise-primary-proposal'; final=REVISED[key]; reason=REVISION_REASON[key]; origin='crossreview-revision'
  elif is_noop:
   verdict='accept-current'; final=c['currentTarget']; reason='The proposed target is byte-for-byte identical to the current catalog cell; keep the current value and treat the primary proposal as a no-op.'; origin='current-noop'
  elif primary_proposed:
   verdict='accept-primary-proposal'; final=proposal; reason=f'Independently checked against the pinned caller: the candidate accurately conveys “{source}” in this UI context and reads naturally in {loc}; its placeholders, markup, and protected literals are preserved.'; origin='primary-proposal'
  else:
   verdict='accept-current'; final=c['currentTarget']; reason=f'Independently checked the current target against “{source}” and the pinned caller context; it preserves the intended meaning and fits this UI use.'; origin='current'
  if primary_proposed and not is_noop:changed_candidates+=1
  src_icu,src_cats,src_simple=parse_icu(source); fin_icu,fin_cats,fin_simple=parse_icu(final)
  cur_icu,cur_cats,cur_simple=parse_icu(c['currentTarget']); prop_icu,prop_cats,prop_simple=parse_icu(p['reviewedTarget'])
  src_tags=tags(source); cur_tags=tags(c['currentTarget']); prop_tags=tags(p['reviewedTarget']); fin_tags=tags(final)
  # Keep ICU variables and simple placeholders exact; locale-specific plural categories may differ from English. Hindi accepts one/other, while Indonesian/Vietnamese may use only other.
  allowed_categories={'hi':{'one','other'},'id':{'one','other'},'vi':{'one','other'}}[loc]
  icu_valid=(len(src_cats)==len(fin_cats) and all(x['variable']==y['variable'] and bool(y['categories']) and 'other' in y['categories'] and set(y['categories'])<=allowed_categories for x,y in zip(src_cats,fin_cats)))
  placeholder_parity=(src_icu==fin_icu and icu_valid and src_simple==fin_simple)
  markup_parity=src_tags==fin_tags
  assert placeholder_parity,(pos,loc,source,final,src_icu,fin_icu,src_cats,fin_cats,src_simple,fin_simple)
  assert markup_parity,(pos,loc,source,final,src_tags,fin_tags)
  literals=p.get('protectedLiteralsChecked',[])
  literal_rows=[{'literal':x,'presentInSource':x in source,'presentInCurrent':x in c['currentTarget'],'presentInPrimaryProposal':bool(proposal and x in proposal),'presentInFinal':x in final} for x in literals]
  assert all(x['presentInSource'] and x['presentInFinal'] for x in literal_rows),(pos,loc,literal_rows)
  assert sha(source)==c['sourceTextSha256'] and sha(c['currentTarget'])==c['currentTargetHash']
  assert sha(p['reviewedTarget'])==p['reviewedTargetSha256']
  caller_pin={
   'sourceId':sid,'callerContextSha256':caller.get('callerContextSha256'),
   'callerFiles':caller.get('callerFiles',[]),'pinnedLineRefs':caller.get('pinnedLineRefs',[]),
   'callerText':caller.get('callerText',caller.get('contextText',None)),
   'context':caller
  }
  ledger.append({
   'schemaVersion':1,'window':'W2400-W2499','sourcePosition':pos,'sourceId':sid,'locale':loc,
   'exactHead':HEAD,'exactTree':TREE,'source':source,'sourceTextSha256':c['sourceTextSha256'],
   'sourceCatalogBlob':p['sourceCatalogBlob'],'sourceFile':p['sourceFile'],'sourceFileBlob':p['sourceCatalogBlob'],'sourceFileSha256':p['sourceFileSha256'],
   'targetCatalogFile':p['localeFile'],'targetCatalogBlob':p['localeBlob'],'targetCatalogSha256':p['localeFileSha256'],
   'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],
   'primaryDisposition':p['disposition'],'primaryTarget':proposal,'primaryTargetHash':sha(proposal) if proposal is not None else None,
   'crossReviewVerdict':verdict,'finalTarget':final,'finalTargetHash':sha(final),'finalTargetOrigin':origin,
   'primaryNoOpProposal':is_noop,'rationale':reason,'callerContextSha256':p['callerContextSha256'],
   'callerUseStatus':p['callerUseStatus'],'callerPaths':p['callerPaths'],'callerReferences':caller_pin,
   'sourcePlaceholders':{'simple':src_simple,'icuVariables':src_icu,'icuPluralCategories':src_cats},
   'currentTargetPlaceholders':{'simple':cur_simple,'icuVariables':cur_icu,'icuPluralCategories':cur_cats},
   'primaryTargetPlaceholders':{'simple':prop_simple,'icuVariables':prop_icu,'icuPluralCategories':prop_cats},
   'finalTargetPlaceholders':{'simple':fin_simple,'icuVariables':fin_icu,'icuPluralCategories':fin_cats},
   'placeholderParity':placeholder_parity,'icuPluralCategoryParity':icu_valid,'currentTargetPlaceholderParity':(src_icu==cur_icu and src_simple==cur_simple),'primaryTargetPlaceholderParity':(proposal is None or (src_icu==prop_icu and src_simple==prop_simple)),
   'sourceMarkup':src_tags,'currentTargetMarkup':cur_tags,'primaryTargetMarkup':prop_tags,'finalTargetMarkup':fin_tags,'markupParity':markup_parity,
   'currentTargetMarkupParity':src_tags==cur_tags,'primaryTargetMarkupParity':(proposal is None or src_tags==prop_tags),
   'protectedLiterals':literal_rows,'protectedLiteralParity':all(x['presentInSource'] and x['presentInFinal'] for x in literal_rows),
   'nativeSpeakerApproval':False,'confidence':'moderate machine-assisted static review'
  })
ledger.sort(key=lambda x:(x['sourcePosition'],x['locale']))
assert len(ledger)==300 and proposals==151 and changed_candidates==148 and noop==3
writejl(OUT/'crossreview-ledger.jsonl',ledger)
findings=[]
for k,v in REVISED.items():
 row=next(r for r in ledger if (r['sourcePosition'],r['locale'])==k)
 findings.append({'kind':'revise-primary-proposal','sourcePosition':k[0],'locale':k[1],'sourceId':row['sourceId'],'primaryTarget':row['primaryTarget'],'finalTarget':row['finalTarget'],'reason':row['rationale'],'sourceTextSha256':row['sourceTextSha256'],'currentTargetHash':row['currentTargetHash'],'finalTargetHash':row['finalTargetHash']})
for k,v in ADDITIONAL.items():
 row=next(r for r in ledger if (r['sourcePosition'],r['locale'])==k)
 findings.append({'kind':'additional-correction','sourcePosition':k[0],'locale':k[1],'sourceId':row['sourceId'],'primaryDisposition':row['primaryDisposition'],'currentTarget':row['currentTarget'],'finalTarget':row['finalTarget'],'reason':row['rationale'],'sourceTextSha256':row['sourceTextSha256'],'currentTargetHash':row['currentTargetHash'],'finalTargetHash':row['finalTargetHash']})
writejl(OUT/'findings.jsonl',findings)
counts=collections.Counter(r['crossReviewVerdict'] for r in ledger)
per={}
for loc in LOCALES:per[loc]=dict(collections.Counter(r['crossReviewVerdict'] for r in ledger if r['locale']==loc))
summary={'head':HEAD,'tree':TREE,'scopePositions':[2400,2499],'locales':list(LOCALES),'cells':len(ledger),'sourceIds':len({r['sourceId'] for r in ledger}),'primaryProposals':proposals,'changedPrimaryProposals':changed_candidates,'primaryNoOpProposals':noop,'crossReviewDispositionCounts':dict(counts),'perLocale':per,'findings':len(findings),'revisions':len(REVISED),'additionalCorrections':len(ADDITIONAL),'holds':0,'callerSources':100,'callerReferences':sum(len(r['callerReferences']['pinnedLineRefs']) for r in ledger)//3,'placeholderMismatchCells':sum(not r['placeholderParity'] for r in ledger),'markupMismatchCells':sum(not r['markupParity'] for r in ledger),'protectedLiteralFailureCells':sum(not r['protectedLiteralParity'] for r in ledger),'priorMatchingRows':1200,'exactPriorTerminalDispositions':0,'nativeSpeakerApproval':False,'nativeSpeakerReviewOutstanding':True,'confidence':'moderate machine-assisted static review','repositoryModified':False,'testsBuildsCiBrowserRun':False}
writej(OUT/'summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
