import collections, hashlib, json, re
from pathlib import Path
D=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2900-2999-primary-20261102')
HEAD='58697945e3d3fb44c37d49db0cc0f88e3af110cc'; TREE='e3076937fe10b4dd3821ea573e8e5e21601fce7d'
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TheTVDB','Whisparr','ISBN','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','LazyLibrarian','Spotify','YouTube','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library','Bindery','BackIssue']
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def parse_block(text,start):
 d=1;j=start+1
 while j<len(text) and d:
  if text[j]=='{':d+=1
  elif text[j]=='}':d-=1
  j+=1
 if d:raise ValueError('unbalanced braces')
 return text[start+1:j-1],j
def icu(text):
 m=re.search(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(plural|select|selectordinal)\s*,',text)
 if not m:return None
 root,kind=m.group(1),m.group(2);i=m.end();branches={}
 while i<len(text):
  while i<len(text) and text[i].isspace():i+=1
  if i>=len(text) or text[i]=='}':break
  sm=re.match(r'(?:=?\d+|[A-Za-z][A-Za-z0-9_-]*)',text[i:])
  if not sm:raise ValueError('bad ICU selector')
  sel=sm.group(0);i+=len(sel)
  while i<len(text) and text[i].isspace():i+=1
  if i>=len(text) or text[i]!='{':raise ValueError('missing branch body')
  body,i=parse_block(text,i)
  if sel in branches:raise ValueError('duplicate branch')
  branches[sel]=body
 return {'root':root,'kind':kind,'branches':branches}
def token_profile(text):
 toks=[];i=0
 while i<len(text):
  if text[i]!='{':i+=1;continue
  content,j=parse_block(text,i)
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',content)
  if m:toks.append((m.group(1),m.group(2) or 'simple'))
  i=j
 return sorted(toks)
def remove_top_level_icu(text):
 out=[];i=0
 while i<len(text):
  if text[i]!='{':out.append(text[i]);i+=1;continue
  content,j=parse_block(text,i)
  if re.match(r'\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*(?:plural|select|selectordinal)\s*,',content):i=j;continue
  out.append(text[i:j]);i=j
 return ''.join(out)
def required(loc):
 return {'ar':{'zero','one','two','few','many','other'},'de':{'one','other'},'es':{'one','many','other'},'fr':{'one','many','other'},'hi':{'one','other'},'id':{'other'},'ja':{'other'},'ko':{'other'},'pt_BR':{'one','many','other'},'vi':{'other'},'zh_Hans':{'other'},'zh_Hant':{'other'}}[loc]
def tags(t):return re.findall(r'</?[A-Za-z][^>]*>',t)
def protected(src,tgt):
 miss=[term for term in TERMS if term.casefold() in src.casefold() and term.casefold() not in tgt.casefold()]
 return miss
R={
 (2950,'zh_Hans'):('correction','已请求','Treat Requested as a completed request status, not the bare noun request.','moderate'),
 (2950,'zh_Hant'):('correction','已請求','Treat Requested as a completed request status, not the bare noun request.','moderate'),
 (2971,'ja'):('refinement','リクエスト済み','Use the same completed/requested status wording as the matching Music status field.','moderate'),
 (2971,'zh_Hans'):('correction','已请求','Treat Requested as a completed request status, not the bare noun request.','moderate'),
 (2971,'zh_Hant'):('correction','已請求','Treat Requested as a completed request status, not the bare noun request.','moderate'),
 (2972,'ar'):('correction','حدث خطأ ما أثناء إرسال الطلب.','The current Arabic says confirming the request; the source says submitting it.','high'),
 (2972,'pt_BR'):('correction','Algo deu errado ao enviar a solicitação.','The current adds media-request wording and does not say submission failed.','high'),
 (2977,'es'):('refinement','Solicitudes creadas: {created}; solicitudes fallidas: {failed}.','Make the counted successes and failures explicit; the current uses singular wording with numeric counts.','moderate'),
 (2977,'fr'):('refinement','Demandes créées : {created} ; demandes échouées : {failed}.','Make the counted successes and failures explicit; the current uses singular participles with numeric counts.','moderate'),
 (2977,'hi'):('refinement','सफल अनुरोध: {created}; विफल अनुरोध: {failed}।','Clarify both counted outcomes; the current ends with singular failed wording after a numeric count.','moderate'),
 (2977,'pt_BR'):('refinement','Solicitações criadas: {created}; solicitações com falha: {failed}.','Make the counted successes and failures explicit; the current uses singular wording with numeric counts.','moderate'),
 (2980,'de'):('refinement','Fügen Sie einen Link zu einer Spotify- oder YouTube-Playlist ein. SeerrNG vergleicht die Titel dieser Playlist mit MusicBrainz-Alben, damit Sie die Treffer prüfen können, bevor Sie etwas anfordern.','Name the playlist as the source of its tracks and make review-before-requesting explicit.','moderate'),
 (2980,'hi'):('refinement','किसी Spotify या YouTube प्लेलिस्ट का लिंक पेस्ट करें। SeerrNG अनुरोध भेजने से पहले प्लेलिस्ट के ट्रैक्स का MusicBrainz एल्बमों से मिलान करेगा, ताकि आप नतीजों की समीक्षा कर सकें।','Replace the ambiguous reflexive track reference with an explicit playlist reference and review sequence.','moderate'),
 (2983,'ja'):('refinement','プレイリストを照合中…','State that playlist matching is in progress; the current is a noun phrase.','moderate'),
 (2983,'ko'):('refinement','재생 목록을 대조하는 중…','State that playlist matching is in progress; the current is a noun phrase.','moderate'),
 (2991,'fr'):('refinement','Les imports depuis YouTube utilisent des playlists publiques configurées par l’administrateur.','Use natural French plural agreement and clarify that the playlists are public.','moderate'),
}
for pos in (2994,2995):
 R[(pos,'zh_Hans')]=('refinement',None,'Remove Latin-style spaces around the inline day count in Chinese; retain the strong wrapper.','moderate')
 R[(pos,'zh_Hant')]=('refinement',None,'Remove Latin-style spaces around the inline day count in Traditional Chinese; retain the strong wrapper.','moderate')
cells=[json.loads(s) for s in (D/'source-current-cells.jsonl').read_text().splitlines()]
contexts={x['sourceId']:x for x in map(json.loads,(D/'caller-contexts.jsonl').read_text().splitlines())}
proposals={(x['position'],x['locale']):x for x in map(json.loads,(D/'manual-proposals.jsonl').read_text().splitlines())}
assert len(cells)==1200 and len(contexts)==100 and len(proposals)>=111
rows=[]; failures=[]; counts=collections.Counter()
for c in cells:
 pos,loc=c['sourcePosition'],c['locale']
 if not 2950<=pos<=2999:continue
 p=proposals.get((pos,loc));rec=R.get((pos,loc));primary=p['target'] if p else c['currentTarget']
 if rec:
  kind,target,rationale,confidence=rec
  if target is None:
   target=primary.replace('<strong>{days}</strong> 天','<strong>{days}</strong>天')
   target=target.replace(' one { 每天}',' one {每天}').replace(' many { 每',' many {每').replace(' other { 每',' other {每')
  final=target;verdict='recommend-new-proposal' if not p else 'recommend-primary-candidate-adjustment';disp=kind
 else:
  rationale=p['rationale'] if p else 'Exact source meaning, caller role, and current target agree; no material issue found in this independent pass.'
  confidence=p['confidence'] if p else 'moderate';final=primary;verdict='concur-primary-candidate' if p else 'accept-current';disp=p['kind'] if p else 'accept-current'
 src_icu=icu(c['source']);fin_icu=icu(final)
 src_top=token_profile(remove_top_level_icu(c['source']));fin_top=token_profile(remove_top_level_icu(final))
 root_ok=(src_icu is None and fin_icu is None) or (src_icu is not None and fin_icu is not None and src_icu['root']==fin_icu['root'] and src_icu['kind']==fin_icu['kind'] and {sel for sel in src_icu['branches'] if sel.startswith('=')}.issubset(set(fin_icu['branches'])) and required(loc).issubset(set(fin_icu['branches'])))
 branch_diffs=[];branch_semantics=[]
 if src_icu and fin_icu:
  for sel,body in fin_icu['branches'].items():
   expected_sel=sel if sel in src_icu['branches'] else 'other';expect=token_profile(src_icu['branches'].get(expected_sel,''));actual=token_profile(body)
   if expect!=actual:
    if loc=='ar' and pos in (2994,2995) and sel=='zero' and '=0' in fin_icu['branches'] and fin_icu['branches']['=0'].strip()=='' and '=0' in src_icu['branches'] and src_icu['branches']['=0'].strip()=='':branch_semantics.append({'branch':sel,'accounting':'shadowed-by-exact-=0'})
    elif loc=='ar' and pos in (2994,2995) and sel=='two' and expect==[('days','simple')] and actual==[] and 'يومين' in body:branch_semantics.append({'branch':sel,'accounting':'Arabic-dual-morphology-encodes-two-days'})
    else:branch_diffs.append({'branch':sel,'sourceExpected':expect,'candidate':actual})
 missing=protected(c['source'],final);st=tags(c['source']);ft=tags(final);raw=st==ft
 tag_status='exact'
 if not raw and pos in (2994,2995) and loc in ('ar','es','fr','pt_BR') and set(st)==set(ft)=={'<strong>','</strong>'}:tag_status='icu-plural-branch-rich-text-equivalent'
 ctx=contexts[c['sourceId']]
 row={'schemaVersion':1,'reviewer':'independent-machine-assisted-cross-review','repository':'snapetech-org/SeerrNG','pullRequest':418,'exactHead':HEAD,'exactTree':TREE,'sourcePosition':pos,'sourceId':c['sourceId'],'source':c['source'],'sourceHash':c['sourceTextSha256'],'sourceCatalogHash':c['sourceHash'],'locale':loc,'currentTarget':c['currentTarget'],'currentTargetHash':c['currentTargetHash'],'primaryDisposition':p['kind'] if p else 'accept-current','primaryTarget':primary,'primaryTargetHash':sha(primary),'independentVerdict':verdict,'independentDisposition':disp,'independentFinalTarget':final,'independentFinalTargetHash':sha(final),'independentRationale':rationale,'confidence':confidence,'callerContextRef':c['callerContextRef'],'callerContextSha256':c['callerContextSha256'],'callerPaths':ctx['callerPaths'],'callerUseStatus':ctx['callerUseStatus'],'callerPins':ctx['pinnedLineRefs'],'structuralReview':{'topLevelSourcePlaceholders':src_top,'topLevelFinalPlaceholders':fin_top,'topLevelPlaceholderParity':src_top==fin_top,'icuRootAndRequiredSelectorsPreserved':root_ok,'icuBranchPlaceholderDifferences':branch_diffs,'accountedForIcuBranchSemantics':branch_semantics,'sourceMarkup':st,'finalMarkup':ft,'rawMarkupParity':raw,'markupAssessment':tag_status,'protectedLiteralsPresent':not missing,'protectedLiteralMissing':missing},'hold':None,'nativeSpeakerApproval':'not-performed'}
 if not root_ok or branch_diffs or missing or (not raw and tag_status=='exact') or src_top!=fin_top:failures.append({'position':pos,'locale':loc,'rootOk':root_ok,'branchDiffs':branch_diffs,'missingProtected':missing,'tagStatus':tag_status,'topMismatch':src_top!=fin_top})
 counts[verdict]+=1;rows.append(row)
assert len(rows)==600
out=D/'subreview-2950-2999.jsonl';out.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
summary={'repository':'snapetech-org/SeerrNG','pullRequest':418,'exactHead':HEAD,'exactTree':TREE,'positions':[2950,2999],'locales':LOCALES,'cellsReviewed':len(rows),'verdictCounts':dict(counts),'independentRecommendations':{f'{p}:{l}':{'kind':v[0],'target':v[1] if v[1] is not None else 'spacing-only edit applied to primary candidate','rationale':v[2]} for (p,l),v in R.items()},'structuralFailureCount':len(failures),'structuralFailures':failures,'holds':[],'confidence':'moderate','nativeSpeakerApproval':'not-performed'}
(D/'subreview-2950-2999-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
