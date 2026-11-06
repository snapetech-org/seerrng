from __future__ import annotations
import json, pathlib, hashlib, re, subprocess, collections, datetime

ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2100-2199-primary-20261102')
REPO=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-readonly-w2100-2199-4046486')
HEAD='404648643578992e8e12ce9dff47dd92d5ee7c1c'; TREE='a17442223e33372e0cc16c3b8091e2515d5e39f3'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PROTECTED=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','4K','Metacritic','Trakt','The Movie Database']
def sha(x):
 if isinstance(x,str): x=x.encode('utf-8')
 return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def run(*a): return subprocess.check_output(a,text=True)
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
def flatten(d,p=''):
 for k,v in d.items():
  q=p+'.'+k if p else k
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
  body=s[i+1:j-1]; m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
  if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
def L(**x): return x

# High-confidence fixes for mistranslations, malformed placeholders, ICU branches,
# product names, and disambiguated control labels. Unlisted current values are
# retained only where the semantic audit found them usable in caller context.
C={
2112:L(ar='تاريخ الإصدار'),
2120:L(de='Auswählen'),
2131:L(ar='غير مُشاهدة',fr='Non regardé',id='Belum ditonton'),
2135:L(ar='تمت المشاهدة',hi='देखा जा चुका',fr='Regardé',id='Sudah ditonton'),
2136:L(ar='تعذّر تحميل الحلقات',hi='एपिसोड लोड नहीं हो सके',id='Episode tidak dapat dimuat.',ko='에피소드를 불러올 수 없습니다.',pt_BR='Não foi possível carregar os episódios.',zh_Hans='无法加载剧集',zh_Hant='無法載入劇集'),
2137:L(ar='تعذّر جلب معلومات الحلقات. يُرجى المحاولة مرة أخرى.',hi='एपिसोड की जानकारी प्राप्त नहीं की जा सकी। कृपया फिर से प्रयास करें।',ko='에피소드 정보를 가져오지 못했습니다. 다시 시도해 주세요.',vi='Không thể tải thông tin tập phim. Vui lòng thử lại.',zh_Hans='无法获取剧集信息，请重试。',zh_Hant='無法取得劇集資訊，請再試一次。'),
2139:L(ar='أعِد تحميل معلومات المواسم والحلقات دون تغيير اختيارك للتشغيل.',id='Muat ulang data musim dan episode tanpa mengubah pilihan pemutaran Anda.',ja='再生の選択を変更せずに、シーズンとエピソードを再取得します。',ko='재생 선택을 변경하지 않고 시즌 및 에피소드 정보를 다시 불러옵니다.',pt_BR='Busque as temporadas e os episódios novamente sem alterar sua seleção de reprodução.',vi='Tải lại thông tin các mùa và tập mà không thay đổi lựa chọn phát của bạn.',zh_Hans='在不更改播放选择的情况下重新获取各季和各集的信息。',zh_Hant='在不變更播放選取內容的情況下，重新取得各季與各集的資訊。'),
2142:L(ar='بلا عنوان',ja='無題'),
2147:L(id='Muat ulang {title}',ko='{title} 새로고침',pt_BR='Atualizar {title}',vi='Làm mới {title}'),
2148:L(hi='TMDB उपलब्ध नहीं है। सहेजे गए परिणाम दिखाए जा रहे हैं।',ko='TMDB를 사용할 수 없습니다. 저장된 결과를 표시합니다.',vi='TMDB không khả dụng. Đang hiển thị kết quả đã lưu.',zh_Hans='TMDB 不可用。现显示已保存的结果。',zh_Hant='TMDB 無法使用。正在顯示已儲存的結果。'),
2152:L(ar='The Movie Database (TMDB)',fr='The Movie Database (TMDB)',hi='The Movie Database (TMDB)',id='The Movie Database (TMDB)',ja='The Movie Database (TMDB)',ko='The Movie Database (TMDB)',pt_BR='The Movie Database (TMDB)',vi='The Movie Database (TMDB)',zh_Hans='The Movie Database (TMDB)',zh_Hant='The Movie Database (TMDB)'),
2155:L(ja='製作国'),
2156:L(vi='Phát hành kỹ thuật số',zh_Hans='数字版',zh_Hant='數位版'),
2158:L(ar='القائمة الكاملة لطاقم التمثيل',fr='Liste complète de la distribution',hi='पूरी कलाकार सूची',id='Daftar lengkap pemeran',ja='全キャスト一覧',ko='전체 출연진 목록',vi='Danh sách đầy đủ diễn viên',zh_Hans='完整演员名单',zh_Hant='完整演員名單'),
2159:L(ar='القائمة الكاملة لطاقم العمل',de='Vollständige Liste des Filmteams',fr='Liste complète de l’équipe technique',hi='फ़िल्म टीम की पूरी सूची',id='Daftar lengkap kru film',ja='映画スタッフ一覧',ko='전체 제작진 목록',pt_BR='Lista completa da equipe técnica',vi='Danh sách đầy đủ đoàn làm phim',zh_Hans='完整剧组名单',zh_Hant='完整電影工作人員名單'),
2160:L(fr='Genres'),
2162:L(ko='언어',pt_BR='Idioma'),
2164:L(fr='{minutes} minutes',ja='{minutes}分',ko='{minutes}분'),
2165:L(ja='詳細',zh_Hans='详情',zh_Hant='詳細資訊'),
2168:L(ja='主題タグはありません。',pt_BR='Nenhuma etiqueta de assunto disponível.',vi='Không có thẻ chủ đề nào khả dụng.'),
2170:L(hi='सारांश',id='Ringkasan',ja='概要',ko='개요',vi='Tổng quan'),
2171:L(hi='सारांश उपलब्ध नहीं है।',id='Ringkasan tidak tersedia.',ja='概要は利用できません。',vi='Tổng quan không khả dụng.',zh_Hans='简介不可用。',zh_Hant='概述無法使用。'),
2172:L(ar='إصدار مادي',vi='Bản phát hành vật lý',zh_Hans='实体版',zh_Hant='實體版'),
2173:L(ja='画質',ko='화질'),
2175:L(ar='تاريخ الإصدار',vi='Ngày phát hành'),
2176:L(ar='تواريخ الإصدار',hi='रिलीज़ की तारीखें',vi='Các ngày phát hành'),
2178:L(ja='興行収入',vi='Doanh thu'),
2179:L(hi='अवधि',id='Durasi',ja='上映時間',zh_Hans='片长',zh_Hant='片長'),
2180:L(ja='脚本',ko='각본',vi='Kịch bản'),
2181:L(ar='أعمال مشابهة',zh_Hans='类似作品',zh_Hant='類似作品'),
2184:L(fr='Studios de production',id='Perusahaan produksi',vi='Các hãng phim',zh_Hant='製片公司'),
2185:L(ko='주제 태그',vi='Thẻ chủ đề',zh_Hant='主題標籤'),
2186:L(ar='إصدار سينمائي',de='Kinostart',es='Estreno en cines',fr='Sortie en salles',hi='सिनेमाघरों में रिलीज़',id='Rilis di bioskop',ja='劇場公開',ko='극장 개봉',pt_BR='Lançamento nos cinemas',vi='Phát hành tại rạp',zh_Hans='院线上映',zh_Hant='院線上映'),
2190:L(ar='طاقم العمل',pt_BR='Equipe técnica',vi='Đoàn làm phim',zh_Hans='剧组',zh_Hant='劇組'),
2191:L(fr='Distribution complète',hi='पूरी कलाकार सूची',id='Daftar lengkap pemeran',vi='Danh sách đầy đủ diễn viên'),
2192:L(fr='Équipe technique complète',hi='पूरी फ़िल्म टीम',vi='Toàn bộ đoàn làm phim',zh_Hans='完整剧组',zh_Hant='完整劇組'),
2193:L(hi='देखने की सूची में जोड़ें',id='Tambahkan ke daftar tontonan',ko='관심 목록에 추가',zh_Hans='添加到待看列表',zh_Hant='加入待看清單'),
2194:L(hi='फ़िल्म प्रबंधित करें'),
2196:L(hi='देखने की सूची से हटाएँ',id='Hapus dari daftar tontonan',ko='관심 목록에서 제거',vi='Xóa khỏi danh sách xem',zh_Hans='从待看列表中移除',zh_Hant='從待看清單移除'),
2198:L(ar='أعمال مشابهة',zh_Hans='类似作品',zh_Hant='類似作品'),
2199:L(es='<strong>{title}</strong> se eliminó correctamente de la lista de seguimiento.',hi='<strong>{title}</strong> को देखने की सूची से सफलतापूर्वक हटा दिया गया!',id='<strong>{title}</strong> berhasil dihapus dari daftar tontonan!',ko='<strong>{title}</strong>이(가) 관심 목록에서 삭제되었습니다!',pt_BR='<strong>{title}</strong> foi removido com sucesso da lista para assistir!',vi='<strong>{title}</strong> đã được xóa khỏi danh sách xem thành công!',zh_Hans='<strong>{title}</strong> 已成功从待看列表中移除！',zh_Hant='<strong>{title}</strong> 已成功從待看清單中移除！'),
}
WHY={
2112:'The label is for the original release-date column, not a generic date. The Arabic value omits release.',
2120:'This button invokes selection; the German current value is a noun, while the UI action requires the infinitive verb.',
2131:'The value labels an episode as not watched. Arabic, French, and Indonesian currently mean unmonitored/supervised or watching rather than unwatched.',
2135:'This is a watched-status label; Arabic and Hindi use an imperative and French/Indonesian describe monitoring or watching instead of completed viewing.',
2136:'This is the episode-list loading error. Several current values are corrupted, singular where plural is needed, or keep a malformed English fragment.',
2137:'The error says episode information could not be fetched and asks the user to retry. The Arabic, Korean, Vietnamese, and Chinese values mistranslate or omit that meaning.',
2139:'The retry action fetches season and episode data again while preserving playback selection. Candidates correct the mistranslated “season”, “fetch”, and playback-selection wording.',
2142:'This is a fallback title for media without a title. Arabic currently says untranslated and Japanese says undecided.',
2147:'This control refreshes the named media slider. Indonesian, Korean, Portuguese, and Vietnamese currently say cleaning, fresh, refrigerate, or review.',
2148:'The notification says TMDB is unavailable and saved results are being shown. Candidates correct the Korean imperative and unnatural Hindi/Vietnamese/Chinese phrasing.',
2152:'This label is the official provider name “The Movie Database (TMDB)”; preserve the exact product name instead of translating it.',
2155:'The field lists production countries, so Japanese should identify the country of production rather than use the loanword カントリー.',
2156:'This is a movie release format. Vietnamese currently means a number and Chinese currently means numerical rather than a digital edition.',
2158:'This section lists the movie’s actors. Candidates restore the full-cast sense where current values omit it or mistranslate it.',
2159:'This section lists the film production crew, not a ship or flight crew. Candidates disambiguate “crew” and restore the complete-list label.',
2160:'This is a plural movie genre heading; the French current value is singular.',
2162:'This movie metadata field gives the original language. Korean is corrupted and Portuguese uses the less appropriate cognate for a spoken language.',
2164:'This value is a film runtime in minutes. French reverses the number and noun; Japanese and Korean current values have unrelated or incorrect units.',
2165:'This heading names the movie details section. Japanese currently says “news” and Chinese wording is less idiomatic for a section heading.',
2168:'This empty state refers to subject/topic tags. Japanese uses “photographed subject”; Portuguese omits the subject; Vietnamese refers to an object.',
2170:'This is the movie overview section, so candidates use the summary/overview sense rather than review, story, or generic information.',
2171:'This is the overview-unavailable empty state. Candidates restore the missing overview in Hindi/Indonesian and fix unnatural or wrong wording elsewhere.',
2172:'This labels physical movie releases, contrasted with digital and theatrical release types. Candidates avoid bodily/physical-matter readings.',
2173:'The label controls HD/4K playback quality. Japanese says FAQ and Korean says quality control instead of video quality.',
2175:'This is a movie release-date field, not a generic date or an action. Arabic and Vietnamese current labels omit “date”.',
2176:'The movie details list can show multiple release dates. Candidates use plural or list wording where the current value is singular.',
2178:'This financial field is movie revenue. Japanese says “about returns” and Vietnamese says reversal/reversion.',
2179:'This field means the film’s running time. Candidates correct programming/runtime or process-time readings.',
2180:'This is the film’s screenplay credit, not a screen/display. Candidates correct the Japanese/Korean loanwords and Vietnamese mistranslation.',
2181:'This section lists similar titles. Arabic and Chinese current values omit the title/work noun or have an error.',
2184:'This field lists film production studios/companies. French says workshops, Indonesian is singular, Vietnamese says recording rooms, and Traditional Chinese says workshops.',
2185:'This control concerns subject/topic tags. Korean says title tags, Vietnamese says object tags, and Traditional Chinese uses a less accurate gist label.',
2186:'The caller uses this as a movie release type alongside digital and physical releases. All candidates use the cinema/theatrical-release sense.',
2190:'This section lists the movie’s production crew. Candidates repair Arabic member, Portuguese vague members, Vietnamese flight crew, and Chinese group-member readings.',
2191:'This heading labels the full movie cast. Candidates correct French casting-as-process and Hindi/Indonesian/Vietnamese phrasing.',
2192:'This heading labels the complete film production crew. Candidates correct the Hindi driver and Vietnamese flight-crew readings and clarify the Chinese group label.',
2193:'This action adds the movie to the user’s watchlist. Candidates correct the Hindi checklist mistranslation and localize watchlist wording in Indonesian/Korean/Chinese.',
2194:'This action opens movie management controls. Hindi currently says only “film” and drops the management action.',
2196:'This action removes the movie from the watchlist. Candidates localize the feature name and correct Vietnamese wording that could mean removing the list itself.',
2198:'This section lists similar titles. Arabic and Chinese current values omit the title/work noun or have an error.',
2199:'This success toast confirms the title was removed from the watchlist. Candidates repair word order, the Hindi clock-list mistranslation, Indonesian grammar, and the Traditional Chinese watchlist term.'
}
# Freeze and verify current input files at exact live head before authoring judgments.
pr=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD,pr
remote_head=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{pr["headRefName"]}').split()[0]
assert remote_head==HEAD,{'remoteHead':remote_head,'expected':HEAD}
assert run('git','-C',str(REPO),'rev-parse','HEAD').strip()==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE
assert run('git','-C',str(REPO),'status','--porcelain').strip()==''
assert subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=ROOT,text=True,capture_output=True).returncode==0
manifest=json.loads((ROOT/'input-manifest.json').read_text())
srcraw=git('show',f'{HEAD}:src/i18n/locale/en.json'); sources=list(flatten(json.loads(srcraw)))[2100:2200]
assert len(sources)==100
source_rows=json.loads((ROOT/'source-window.json').read_text())['sourceList']
assert [(x['position'],x['sourceId'],x['source']) for x in source_rows]==[(2100+i,k,v) for i,(k,v) in enumerate(sources)]
loc_json={l:json.loads(git('show',f'{HEAD}:src/i18n/locale/{l}.json')) for l in LOCALES}
cells=[json.loads(x) for x in (ROOT/'source-current-cells.jsonl').read_text().splitlines()]
ctxs=[json.loads(x) for x in (ROOT/'caller-contexts.jsonl').read_text().splitlines()]
assert len(cells)==1200 and len(ctxs)==100
ctxmap={x['sourceId']:x for x in ctxs}
decisions=[]; candidate_rows=[]; counts=collections.Counter(); per=collections.defaultdict(collections.Counter)
for cell in cells:
 pos=cell['sourcePosition']; loc=cell['locale']; sid=cell['sourceId']; candidate=C.get(pos,{}).get(loc)
 assert loc_json[loc][sid]==cell['currentTarget'] and sha(cell['currentTarget'])==cell['currentTargetHash']
 ctx=ctxmap[sid]
 assert sha(canon(ctx))==cell['callerContextSha256']
 if candidate is not None:
  assert candidate!=cell['currentTarget'],(pos,loc,'candidate unchanged')
  disp='propose-correction'; final=candidate; why=WHY[pos]; confidence='high' if pos not in (2136,2137,2139,2152,2158,2159,2164,2179,2180,2186,2199) else 'moderate'
  phsrc=sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))
  phcan=sorted(ph(candidate),key=lambda x:(x['name'],x['kind']))
  tagsrc=tags(cell['source']); tagcan=tags(candidate)
  prot=[t for t in PROTECTED if t.casefold() in cell['source'].casefold()]
  missing=[t for t in prot if t.casefold() not in candidate.casefold()]
  if phsrc!=phcan or tagsrc!=tagcan or missing:
   raise SystemExit(f'candidate integrity failure {pos} {loc}: ph={phsrc==phcan} tags={tagsrc==tagcan} protectedMissing={missing}')
  candidate_row={'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':cell['source'],'sourceTextSha256':cell['sourceTextSha256'],
   'currentTarget':cell['currentTarget'],'currentTargetHash':cell['currentTargetHash'],'candidateTarget':candidate,'candidateTargetHash':sha(candidate),
   'candidatePlaceholderParity':'exact','candidateMarkupParity':'exact','protectedLiterals':prot,'candidateProtectedLiteralMissing':[],'callerContextRef':sid,'callerContextSha256':cell['callerContextSha256'],
   'disposition':disp,'rationale':why,'confidence':confidence}
  candidate_rows.append(candidate_row)
 else:
  disp='accept-current'; final=cell['currentTarget']; why='Current wording preserves the source meaning in the pinned component context; current placeholders, markup, and applicable protected literals were reviewed.'
  confidence='moderate'
  phsrc=sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))
  phcan=sorted(ph(final),key=lambda x:(x['name'],x['kind']))
  tagsrc=tags(cell['source']); tagcan=tags(final)
  prot=[t for t in PROTECTED if t.casefold() in cell['source'].casefold()]
  missing=[t for t in prot if t.casefold() not in final.casefold()]
  # Keep any unresolved exact protected name as an explicit hold, not a silent accept.
  if phsrc!=phcan or tagsrc!=tagcan or missing:
   disp='hold'; final=None; why='Needs locale specialist review: current value has placeholder/markup/protected-literal drift and no sufficiently reliable candidate was established.'
   confidence='low'
  candidate_row=None
 final_hash=sha(final) if final is not None else None
 row={**cell,'disposition':disp,'finalTarget':final,'finalTargetHash':final_hash,'rationale':why,'confidence':confidence,
  'callerContext':ctx,'candidatePlaceholderParity':'exact' if final is not None and sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))==sorted(ph(final),key=lambda x:(x['name'],x['kind'])) else ('not-applicable' if final is None else 'mismatch'),
  'candidateMarkupParity':'exact' if final is not None and tags(cell['source'])==tags(final) else ('not-applicable' if final is None else 'mismatch'),
  'protectedLiterals':prot,'candidateProtectedLiteralMissing':missing if final is not None else []}
 decisions.append(row); counts[disp]+=1; per[loc][disp]+=1
 if candidate_row is not None: pass
writejl(ROOT/'primary-review-ledger.jsonl',decisions)
writej(ROOT/'candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(candidate_rows),
 'candidateTargets':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'candidateTarget':x['candidateTarget'],'candidateTargetHash':x['candidateTargetHash']} for x in candidate_rows]})
# Also provide a row-wise correction ledger with rationale and all pins.
writejl(ROOT/'correction-candidates.jsonl',candidate_rows)
writej(ROOT/'review-plan.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(candidate_rows),'candidates':candidate_rows})
summary={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'livePullRequest':pr,
 'scope':{'positions':[2100,2199],'sourceIds':100,'locales':LOCALES,'cells':len(decisions)},
 'sourceIdListSha256':sha(canon([(x['sourcePosition'],x['sourceId'],x['source']) for x in cells if x['locale']=='ar'])),
 'sourceWithIcuPluralOrSelect':sum(any(p['kind'] in ('plural','select','selectordinal') for p in ph(x['source'])) for x in cells if x['locale']=='ar'),
 'counts':dict(counts),'proposalCount':len(candidate_rows),'perLocale':{loc:dict(per[loc]) for loc in LOCALES},
 'explicitHoldCount':counts.get('hold',0),'confidenceCounts':dict(collections.Counter(x['confidence'] for x in decisions)),
 'callerContextRows':len(ctxs),'callerReferences':sum(len(c['pinnedLineRefs']) for c in ctxs),'callerFiles':len({f['path'] for c in ctxs for f in c['callerFiles']}),
 'callerGaps':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in ctxs if not c['pinnedLineRefs']],
 'callerDefinitionOnly':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in ctxs if c['callerUseStatus']!='direct-or-helper-reference-found'],
 'placeholderParityMismatchesCurrent':sum(x['placeholderParity']!='exact' for x in cells),
 'markupParityMismatchesCurrent':sum(x['markupParity']!='exact' for x in cells),
 'placeholderParityMismatchesFinal':sum(x['candidatePlaceholderParity']!='exact' for x in decisions),
 'markupParityMismatchesFinal':sum(x['candidateMarkupParity']!='exact' for x in decisions),
 'currentProtectedLiteralMismatchCells':sum(bool(x['protectedLiterals']) and any(t.casefold() not in x['currentTarget'].casefold() for t in x['protectedLiterals']) for x in decisions),
 'finalProtectedLiteralMismatchCells':sum(bool(x['candidateProtectedLiteralMissing']) for x in decisions),
 'priorBoundary':json.loads((ROOT/'prior-disposition-boundary.json').read_text()),
 'nativeSpeakerApproval':False,'nativeSpeakerReviewOutstanding':True,'browserReview':False,'repositoryModified':False,'testsBuildsCiRun':False,'workflowFilesTouched':False}
writej(ROOT/'summary.json',summary)
# Re-attest the PR API/ref and exact checked-out tree after review generation.
pr2=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git',f'refs/heads/{pr2["headRefName"]}').split()[0]
state={'head':run('git','-C',str(REPO),'rev-parse','HEAD').strip(),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip(),'status':run('git','-C',str(REPO),'status','--porcelain').strip()}
att={'passed':pr2['state']=='OPEN' and pr2['isDraft'] is True and pr2['headRefOid']==HEAD and remote==HEAD and state=={'head':HEAD,'tree':TREE,'status':''},
 'exactHead':HEAD,'exactTree':TREE,'pullRequestState':pr2['state'],'isDraft':pr2['isDraft'],'headRefName':pr2['headRefName'],'remoteHead':remote,'repositoryState':state,
 'sourceIds':100,'localeCells':1200,'sourceTextHashes':100,'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'callerDefinitionOnly':summary['callerDefinitionOnly'],'candidateCount':len(candidate_rows),'sourceIdListSha256':summary['sourceIdListSha256']}
writej(ROOT/'final-reattestation.json',att)
assert att['passed'],att
definitions=', '.join(x['sourceId'] for x in summary['callerDefinitionOnly'])
readme=f'''# SeerrNG PR #418 primary semantic review: W2100–2199

This packet reviews 100 English catalog entries across the 12 direct locales ({', '.join(LOCALES)}): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head {HEAD}, tree {TREE}. The GitHub API, remote branch, and detached worktree were rechecked before and after review; the worktree was clean. Source positions are zero-based insertion order in `src/i18n/locale/en.json`. The frozen cell ledger includes source and current-target hashes, catalog pins, and caller-context hashes.

The review proposes {summary['proposalCount']} corrections, accepts {summary['counts'].get('accept-current',0)} current values, and has {summary['explicitHoldCount']} holds. Exact prior final dispositions reused: {summary['priorBoundary']['exactLivePriorDispositions']}. Earlier evidence contained {summary['priorBoundary']['matchingPriorRows']} matching historical rows, but none was an exact source plus final-target disposition at this input.

## Caller evidence and integrity

Pinned caller evidence has {summary['callerReferences']} line references across {summary['callerFiles']} source files for all {summary['callerContextRows']} source IDs. No source lacks a pinned line reference. Seven keys have only definition/single-reference evidence: {definitions}. Those limits are retained in `caller-contexts.jsonl` and should be considered during independent review.

Current/final placeholder mismatches: {summary['placeholderParityMismatchesCurrent']}/{summary['placeholderParityMismatchesFinal']}. Current/final markup mismatches: {summary['markupParityMismatchesCurrent']}/{summary['markupParityMismatchesFinal']}. Source ICU plural/select entries: {summary['sourceWithIcuPluralOrSelect']}. Current/final protected-literal mismatch cells: {summary['currentProtectedLiteralMismatchCells']}/{summary['finalProtectedLiteralMismatchCells']}. Ten provider-name cells propose preserving `The Movie Database (TMDB)`.

## Packet contents and limits

- `primary-review-ledger.jsonl`: one decision per locale cell, exact current/final values and hashes, caller context, rationale, confidence, and integrity checks.
- `correction-candidates.jsonl`, `candidate-targets.json`, and `review-plan.json`: proposed target text, hashes, and rationale.
- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `prior-disposition-boundary.json`, and `input-manifest.json`: frozen inputs and provenance.
- `final-reattestation.json`: final PR/ref/worktree check.
- `INPUT-SHA256SUMS` and `SHA256SUMS`: input and packet checksums.

Native-speaker approval remains outstanding. This is a primary semantic review, not native-speaker approval. No repository files or workflows were changed; no test/build/CI tasks or browser activity were run.
'''
(ROOT/'README.md').write_text(readme)
# Stabilize packet size metadata, then hash every deliverable except the two manifests.
for _ in range(6):
 summary['packetFiles']=sum(p.is_file() for p in ROOT.iterdir())
 summary['packetBytes']=sum(p.stat().st_size for p in ROOT.iterdir() if p.is_file())
 writej(ROOT/'summary.json',summary)
 names=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in ('SHA256SUMS','INPUT-SHA256SUMS'))
 (ROOT/'SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in names))
print(json.dumps({'head':HEAD,'tree':TREE,'counts':dict(counts),'proposals':len(candidate_rows),'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'currentPlaceholderMismatches':summary['placeholderParityMismatchesCurrent'],'finalPlaceholderMismatches':summary['placeholderParityMismatchesFinal'],
 'currentMarkupMismatches':summary['markupParityMismatchesCurrent'],'finalMarkupMismatches':summary['markupParityMismatchesFinal'],
 'currentProtectedMismatchCells':summary['currentProtectedLiteralMismatchCells'],'finalProtectedMismatchCells':summary['finalProtectedLiteralMismatchCells'],'reattestPassed':att['passed']},ensure_ascii=False,indent=2))
