import hashlib, json, re, subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

repo='snapetech-org/SeerrNG'
work=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499')
primary=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1700-1799-primary-20261102')
out=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1700-1799-crossreview-20261102')
head_expected='670d1a213179dcc690f27a8b92c2372dba699091'
tree_expected='be2a8a70ef7f86f3499be7c2190a07b3d2d78036'
locales=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']

def sha(b): return hashlib.sha256(b.encode('utf-8') if isinstance(b,str) else b).hexdigest()
def git_blob(b): return hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
def canon(o): return json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def utc(): return datetime.now(timezone.utc).isoformat()
def run(args,cwd=None): return subprocess.check_output(args,cwd=cwd,text=True).strip()
def gitshow(path): return subprocess.check_output(['git','show',f'{head_expected}:{path}'],cwd=work)
def get_id(obj,sid):
    if sid in obj: return obj[sid]
    cur=obj
    for part in sid.split('.'): cur=cur[part]
    return cur

def placeholders(s):
    out=[]; i=0
    while i<len(s):
        if s[i]!='{': i+=1; continue
        depth=1; j=i+1
        while j<len(s) and depth:
            if s[j]=='{': depth+=1
            elif s[j]=='}': depth-=1
            j+=1
        if depth: break
        body=s[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return out

def icu_occurrences(s):
    out=[]; i=0
    while i<len(s):
        if s[i]!='{': i+=1; continue
        depth=1; j=i+1
        while j<len(s) and depth:
            if s[j]=='{': depth+=1
            elif s[j]=='}': depth-=1
            j+=1
        if depth: break
        body=s[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m:
            kind=m.group(2) or 'simple'; cats=[]
            if kind in ('plural','select','selectordinal'):
                tail=body[m.end():]
                cats=re.findall(r'(?<![\w=])(?:=(?:0|1|2|[0-9]+)|zero|one|two|few|many|other)\s*\{',tail)
                cats=[x.strip().removesuffix('{').strip() for x in cats]
            out.append({'name':m.group(1),'kind':kind,'categories':cats})
        i=j
    return out

def markup(s): return re.findall(r'</?[A-Za-z][^>]*>',s)

def walk_strings(x,prefix=''):
    if isinstance(x,dict):
        for k,v in x.items(): yield from walk_strings(v,f'{prefix}.{k}' if prefix else k)
    elif isinstance(x,str): yield prefix,x

# Additional cross-review findings missed by the primary packet, plus two revised candidates.
# Each target was checked against the exact source and the pinned caller context.
overrides={
 (1701,'zh_Hant'):{'target':'任務篩選器','type':'correction','confidence':'moderate','reason':'工作更常指工作或職務；這裡是 IssueList 的任務篩選器，任務篩選器更精確。'},
 (1702,'hi'):{'target':'पिछले 30 दिन','type':'refinement','confidence':'moderate','reason':'The standalone label uses the oblique दिनों form without its required postposition; दिन is the natural short filter label.'},
 (1703,'vi'):{'target':'Khoảng thời gian','type':'refinement','confidence':'moderate','reason':'The current label says time broadly; this filter names a time period/range.'},
 (1707,'hi'):{'target':'समस्या का प्रकार','type':'correction','confidence':'moderate','reason':'The current compound मुद्दा प्रकार is awkward; the caller is an issue-report category selector.'},
 (1707,'ja'):{'target':'問題の種類','type':'correction','confidence':'moderate','reason':'課題タイプ can read as an assignment/task type; this caller labels the type of reported problem.'},
 (1708,'ar'):{'target':'لا توجد جودة متاحة','type':'refinement','confidence':'moderate','reason':'جودة is the usual Arabic UI term for HD/4K picture quality; نوعية here reads more like kind/type.'},
 (1708,'hi'):{'target':'कोई गुणवत्ता उपलब्ध नहीं है','type':'refinement','confidence':'moderate','reason':'This is a more natural Hindi empty-quality message than the current verbless word order.'},
 (1710,'ar'):{'target':'الجودة','type':'refinement','confidence':'moderate','reason':'This option is picture quality (paired with HD/4K); الجودة is clearer than النوعية.'},
 (1712,'de'):{'target':'Wählen Sie mindestens eine betroffene Staffel oder Episode aus.','type':'correction','confidence':'high','reason':'For television, German uses Staffel for a season; Saison usually refers to sports or a general season.'},
 (1714,'ar'):{'target':'حدث خطأ ما أثناء إرسال البلاغ عن المشكلة.','type':'correction','confidence':'high','reason':'The current Arabic says an error occurred while confirming the issue, while the toast is about submitting its report.'},
 (1718,'fr'):{'target':'La description ne doit pas dépasser {maxLength, number} caractères.','type':'correction','confidence':'high','reason':'The current French syntax is ungrammatical; this version expresses the maximum character count and retains ICU.'},
 (1718,'hi'):{'target':'विवरण {maxLength, number} वर्णों से अधिक नहीं होना चाहिए।','type':'correction','confidence':'high','reason':'The current Hindi is a literal, awkward comparison; this gives a grammatical maximum-length validation and retains ICU.'},
 (1718,'vi'):{'target':'Mô tả không được vượt quá {maxLength, number} ký tự.','type':'correction','confidence':'high','reason':'The current Vietnamese says a description must be characters; this expresses a character limit and retains ICU.'},
 (1718,'zh_Hans'):{'target':'说明不得超过 {maxLength, number} 个字符','type':'correction','confidence':'high','reason':'The current Chinese equates a description with a character count; this states the limit directly and retains ICU.'},
 (1720,'ar'):{'target':'ما هي المشكلة؟','type':'refinement','confidence':'moderate','reason':'The current Arabic omits a space between ما and هي; this is the correctly spaced question prompt.'},
 (1720,'zh_Hant'):{'target':'您遇到了什麼問題？','type':'correction','confidence':'moderate','reason':'The current text asks the user to explain the problem rather than asking what is wrong, changing a short question prompt into an instruction.'},
 (1724,'de'):{'target':'Falscher Titel oder falsche Metadaten','type':'correction','confidence':'moderate','reason':'The current adjective does not agree with the plural Metadaten; repeat falsche for grammatical parallelism.'},
 (1724,'pt_BR'):{'target':'Título ou metadados incorretos','type':'refinement','confidence':'moderate','reason':'The current label has sentence punctuation and weak agreement; this is a concise parallel category label.'},
 (1725,'ko'):{'target':'누락된 콘텐츠','type':'correction','confidence':'high','reason':'The current 연락처 means contact details, not missing content.'},
 (1727,'hi'):{'target':'गलत संस्करण या वैरिएंट','type':'revise-candidate','confidence':'moderate','reason':'The primary candidate रूपांतर can mean adaptation/transformation; वैरिएंट more directly names a publication variant in this taxonomy.'},
 (1730,'vi'):{'target':'Video','type':'correction','confidence':'high','reason':'Băng hình means videotape; the IssueModal category is the video issue type, and the matching IssueList category already uses Video.'},
 (1734,'id'):{'target':'Bahasa tampilan','type':'correction','confidence':'high','reason':'Tampilkan Bahasa is an imperative (“show language”); this is a setting label naming the display language.'},
 (1739,'fr'):{'target':'Liste de blocage','type':'correction','confidence':'moderate','reason':'Blocages names blocking events; this navigation item is the blocklist itself.'},
 (1741,'pt_BR'):{'target':'Conteúdo para adultos','type':'correction','confidence':'moderate','reason':'The browse section is adult content, not an adult person.'},
 (1755,'id'):{'target':'Mengikuti','type':'correction','confidence':'moderate','reason':'Dipantau means monitored; this sidebar destination is the user’s Following page.'},
 (1757,'hi'):{'target':'मेरे गेम','type':'refinement','confidence':'moderate','reason':'The current मेरा खेल is singular; the source and /games destination name the user’s games.'},
 (1774,'vi'):{'target':'Bật/tắt','type':'refinement','confidence':'high','reason':'The current toggle label has an unintended space after the slash.'},
 (1776,'ar'):{'target':'طلبات القصص المصورة','type':'correction','confidence':'moderate','reason':'الطلبات المصورة reads as illustrated requests; the quota category is requests for comics.'},
 (1776,'id'):{'target':'Permintaan Komik','type':'refinement','confidence':'moderate','reason':'Komik is the localized Indonesian category term; the current value leaves Comic in English.'},
 (1776,'pt_BR'):{'target':'Pedidos de quadrinhos','type':'correction','confidence':'high','reason':'Pedidos em quadrinhos means requests inside comics; the quota counts requests for comics.'},
 (1777,'ar'):{'target':'طلبات المجلات','type':'refinement','confidence':'moderate','reason':'The quota counts magazine requests generally; plural المجلات fits the category better than the singular magazine.'},
 (1780,'id'):{'target':'Permintaan serial TV','type':'refinement','confidence':'moderate','reason':'This is a localized label for the Series request quota; adding TV clarifies the media category and avoids the English Series.'},
 (1780,'zh_Hans'):{'target':'剧集请求','type':'correction','confidence':'moderate','reason':'电视节目泛指电视节目；这里统计 TV series 请求，剧集请求更精确。'},
 (1781,'ja'):{'target':'ソフトウェアのリクエスト','type':'correction','confidence':'high','reason':'ソフトウェア要求 means software requirements/demands; this quota counts users’ requests for software.'},
 (1785,'ar'):{'target':'تسجيل الخروج','type':'refinement','confidence':'moderate','reason':'The conventional Arabic sign-out action includes the definite article in الخروج.'},
 (1791,'ar'):{'target':'متأخر بمقدار {commitsBehind} {commitsBehind, plural, zero {التزامات} one {التزام} two {التزامان} few {التزامات} many {التزامًا} other {التزام}} عن أحدث إصدار','type':'revise-candidate','confidence':'moderate','reason':'The primary candidate inserts # in plural branches while the first ICU argument already prints the number, duplicating counts; retain both ICU arguments but let the plural select the noun form.'},
 (1796,'ja'):{'target':'検索を続ける','type':'refinement','confidence':'moderate','reason':'継続検索 is a noun-like “continuous search”; this is a natural button action for Continue Search.'},
 (1797,'zh_Hans'):{'target':'选择球队','type':'correction','confidence':'moderate','reason':'The caller is FollowedTeams for sports; 团队 is a generic group, while 球队 names a sports team.'},
 (1797,'zh_Hant'):{'target':'選擇球隊','type':'correction','confidence':'moderate','reason':'The caller is FollowedTeams for sports; 團隊 is a generic group, while 球隊 names a sports team.'},
 (1798,'ar'):{'target':'تطلب SeerrNG تسجيل كل مباراة قادمة لهذه الفرق عندما يعثر عليها Tunerr في دليل البرامج. وتخضع التسجيلات لقواعد الموافقة المعتادة.','type':'correction','confidence':'moderate','reason':'Clarifies the live-TV program guide and keeps Tunerr as the subject that finds each upcoming match.'},
 (1798,'es'):{'target':'SeerrNG solicita grabar cada próximo partido de estos equipos cuando Tunerr lo encuentra en la guía. Las grabaciones siguen las reglas habituales de aprobación.','type':'refinement','confidence':'moderate','reason':'Partido is more idiomatic than juego for the sports-team caller context.'},
 (1798,'hi'):{'target':'SeerrNG इन टीमों के हर आगामी मैच की रिकॉर्डिंग का अनुरोध करता है, जब Tunerr उसे कार्यक्रम-सूची में ढूँढ़ता है। रिकॉर्डिंग पर सामान्य अनुमोदन नियम लागू होते हैं।','type':'refinement','confidence':'moderate','reason':'Uses match/program-schedule wording for the live-TV caller and repairs agreement in the recording sentence.'},
 (1798,'id'):{'target':'SeerrNG meminta rekaman setiap pertandingan mendatang dari tim-tim ini saat Tunerr menemukannya di panduan acara. Rekaman mengikuti aturan persetujuan yang biasa.','type':'correction','confidence':'moderate','reason':'Pertandingan is a sports match; permainan can mean a game/play. Panduan acara clarifies the live-TV guide.'}
}

# Confirm frozen PR/worktree/input bytes and every caller line before semantic review.
manifest=json.loads((primary/'input-manifest.json').read_text())
contexts=[json.loads(x) for x in (primary/'caller-contexts.jsonl').read_text().splitlines()]
primary_rows=[json.loads(x) for x in (primary/'primary-review-ledger.jsonl').read_text().splitlines()]
source_current=[json.loads(x) for x in (primary/'source-current-cells.jsonl').read_text().splitlines()]
source_window=json.loads((primary/'source-window.json').read_text())
prior_boundary=json.loads((primary/'prior-disposition-boundary.json').read_text())
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=primary,stdout=subprocess.DEVNULL)
subprocess.check_call(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=primary,stdout=subprocess.DEVNULL)

def attest(stage):
    pr=json.loads(subprocess.check_output(['gh','pr','view','418','--repo',repo,'--json','state,isDraft,headRefOid,headRefName,baseRefName,baseRefOid,url,title'],text=True))
    wh=run(['git','rev-parse','HEAD'],cwd=work); wt=run(['git','rev-parse','HEAD^{tree}'],cwd=work); status=run(['git','status','--short'],cwd=work)
    file_checks=[]
    for cat in [manifest['sourceCatalog'],*manifest['localeCatalogs'].values()]:
        raw=gitshow(cat['path']); file_checks.append({'kind':'catalog','path':cat['path'],'expectedBytes':cat['bytes'],'actualBytes':len(raw),'expectedBlob':cat['blob'],'actualBlob':git_blob(raw),'expectedSha256':cat['sha256'],'actualSha256':sha(raw),'matched':len(raw)==cat['bytes'] and git_blob(raw)==cat['blob'] and sha(raw)==cat['sha256']})
    caller_files={}
    for c in contexts:
        for f in c['callerFiles']: caller_files[f['path']]=f
    for f in caller_files.values():
        raw=gitshow(f['path']); file_checks.append({'kind':'caller','path':f['path'],'expectedBlob':f['blob'],'actualBlob':git_blob(raw),'expectedSha256':f['fileSha256'],'actualSha256':sha(raw),'matched':git_blob(raw)==f['blob'] and sha(raw)==f['fileSha256']})
    prior=manifest['priorEvidence']; raw=gitshow(prior['path']); file_checks.append({'kind':'prior-ledger','path':prior['path'],'expectedBlob':prior['blob'],'actualBlob':git_blob(raw),'expectedSha256':prior['sha256'],'actualSha256':sha(raw),'matched':git_blob(raw)==prior['blob'] and sha(raw)==prior['sha256']})
    ctxhash={}
    for r in primary_rows: ctxhash.setdefault(r['sourceId'],r['callerContextSha256'])
    context_hash_checks=[]; line_checks=[]
    for c in contexts:
        ch=sha(canon(c)); context_hash_checks.append({'sourceId':c['sourceId'],'contextSha256':ch,'ledgerSha256':ctxhash.get(c['sourceId']),'matches':ch==ctxhash.get(c['sourceId'])})
        for ref in c['pinnedLineRefs']:
            raw=gitshow(ref['file']); lines=raw.decode().splitlines(); n=ref['line']
            prev=lines[n-2].strip() if n>1 else None; nxt=lines[n].strip() if n<len(lines) else None
            line_checks.append({'sourceId':c['sourceId'],'file':ref['file'],'line':n,'lineSha256Matches':sha(lines[n-1].encode())==ref['lineSha256'],'lineTextMatches':lines[n-1].strip()==ref['lineText'],'previousLineMatches':prev==ref['previousLine'],'nextLineMatches':nxt==ref['nextLine']})
    reuse_refs=[]
    for r in primary_rows:
        for h in r.get('historicalDispositionReferences',[]):
            if h['disposition']=='reuse-equivalence-decision': reuse_refs.append({'sourcePosition':r['sourcePosition'],'sourceId':h['sourceId'],'locale':h['locale'],'path':h['path'],'priorFinalTargetHash':h.get('priorFinalTargetHash')})
    reuse_file_checks=[]
    for path in sorted(set(x['path'] for x in reuse_refs)):
        f=Path(path); reuse_file_checks.append({'path':path,'exists':f.is_file(),'bytes':f.stat().st_size if f.is_file() else None,'sha256':sha(f.read_bytes()) if f.is_file() else None})
    old_equiv=Path('/mnt/disks/scratch/task-worktrees/localization-20261030/seerrng-review/checks/locale-equivalents-reviewed-final29.json')
    old_equiv_sha=sha(old_equiv.read_bytes()) if old_equiv.is_file() else None
    result={'stage':stage,'verifiedAtUtc':utc(),'repository':repo,'pullRequest':pr,'expectedHead':head_expected,'expectedTree':tree_expected,'worktree':str(work),'worktreeHead':wh,'worktreeTree':wt,'worktreeStatusShort':status,'inputManifestHead':manifest['head'],'inputManifestTree':manifest['tree'],'sourceLocaleCallerAndPriorFileChecks':file_checks,'allManifestFileChecksMatched':all(x['matched'] for x in file_checks),'callerContextRows':len(contexts),'callerContextHashes':context_hash_checks,'callerContextHashesAllMatchLedger':len(context_hash_checks)==100 and all(x['matches'] for x in context_hash_checks),'callerLineReferenceCount':sum(len(c['pinnedLineRefs']) for c in contexts),'callerLineChecks':line_checks,'allCallerLinesAndNeighborsMatch':all(all(x[k] for k in ['lineSha256Matches','lineTextMatches','previousLineMatches','nextLineMatches']) for x in line_checks),'historicalReuseReferenceCount':len(reuse_refs),'historicalReuseReferences':reuse_refs,'historicalCellPlanFileChecks':reuse_file_checks,'historicalEquivalenceProofPath':str(old_equiv),'historicalEquivalenceProofSha256':old_equiv_sha,'exactPinMatched':pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==head_expected and wh==head_expected and wt==tree_expected and manifest['head']==head_expected and manifest['tree']==tree_expected,'primaryPacketChecksumsVerified':True,'scope':'read-only; no tests/builds/scans/CI/browser/workflow work or repository/PR edits'}
    if not result['exactPinMatched'] or not result['allManifestFileChecksMatched'] or not result['allCallerLinesAndNeighborsMatch'] or not result['callerContextHashesAllMatchLedger'] or result['historicalEquivalenceProofSha256']!='56493dd797eaf4011e40372115caf0a65ba8343c334a7e198ae858b1ad501621':
        raise RuntimeError('PR/input/caller/prior pin drift; stop and re-attest')
    return result

before=attest('before-cross-review')
(out/'attestation-before.json').write_text(json.dumps(before,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

# Validate frozen source order, catalog cells, hashes, prior Spanish acceptance, and all candidates.
source_obj=json.loads(gitshow(manifest['sourceCatalog']['path']))
flat=list(walk_strings(source_obj))
assert len(source_window['sourceList'])==100 and source_window['sourcePositionRange']==[1700,1799]
assert [[k,v] for k,v in flat[1700:1800]]==[[r['sourceId'],r['source']] for r in source_window['sourceList']]
locale_objs={loc:json.loads(gitshow(meta['path'])) for loc,meta in manifest['localeCatalogs'].items()}
assert len(primary_rows)==len(source_current)==1200
assert [r['sourcePosition'] for r in source_current[::12]]==list(range(1700,1800))
cur_by={(r['sourcePosition'],r['locale']):r for r in source_current}
ctx_by={r['sourceId']:r for r in contexts}
assert len(ctx_by)==100 and len({(r['sourcePosition'],r['locale']) for r in primary_rows})==1200
for src in source_window['sourceList']:
    sid=src['sourceId']; pos=src['position']
    assert get_id(source_obj,sid)==src['source'] and sha(src['source'])==src['sourceHash']
    assert ctx_by[sid]['sourceId']==sid

# Exact frozen Spanish prior disposition from the tracked input at the pinned PR head.
prior_meta=manifest['priorEvidence']; prior_raw=gitshow(prior_meta['path']); prior_line=None; prior_row=None
for rawline in prior_raw.splitlines():
    row=json.loads(rawline)
    if row.get('id')=='components.IssueModal.CreateIssueModal.issueType' and row.get('locale')=='es':
        prior_line=rawline; prior_row=row; break
assert prior_row is not None
assert prior_row['finalTarget']=='Tipo de problema' and prior_row['finalTargetHash']=='1cd1be52b38250c8fbc651fc3038255e1f8862c0766fd5917af6a7621ebf4ca8'
prior_frozen=next(r['priorDisposition'] for r in primary_rows if r['sourceId']=='components.IssueModal.CreateIssueModal.issueType' and r['locale']=='es')
assert sha(prior_line)==prior_frozen['priorRowSha256'] and sha(prior_raw)==prior_frozen['priorFileSha256']
assert prior_row['reviewDecision']=='accept' and prior_row['source']=='Issue Type'

# Resolve the 12 prior reuse references to their old source/target rows. They are context only: their recorded final hashes are null.
reuse_path=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w700-749-review-20261102/input/cell-plan.jsonl')
reuse_raw= reuse_path.read_bytes(); reuse_rows=[json.loads(x) for x in reuse_raw.decode().splitlines()]
reuse_by={(r['id'],r['locale']):r for r in reuse_rows}
reuse_contexts=[]
for r in primary_rows:
    for h in r.get('historicalDispositionReferences',[]):
        if h['disposition']!='reuse-equivalence-decision': continue
        old=reuse_by[(h['sourceId'],h['locale'])]
        assert old['action']=='reuse-equivalence-decision' and old['priorDecision']=='reusable-localized-equivalence'
        assert old['targetHash']==sha(old['target']) and old['target']==r['currentTarget']
        assert h.get('priorFinalTargetHash') is None
        reuse_contexts.append({'sourcePosition':r['sourcePosition'],'sourceId':h['sourceId'],'locale':h['locale'],'historyDisposition':h['disposition'],'historicalTarget':old['target'],'historicalTargetHash':old['targetHash'],'historicalSource':old['source'],'historicalSourceHash':old['sourceHash'],'priorDecision':old['priorDecision'],'priorDecisionPath':old['priorDecisionPath'],'priorDecisionSha256':old['priorDecisionSha256'],'historicalCellPlanPath':str(reuse_path),'historicalCellPlanSha256':sha(reuse_raw),'priorFinalTargetHashInBoundary':None,'useInCrossReview':'context only; target was independently reviewed against current source/caller'})
assert len(reuse_contexts)==12 and len({(x['sourceId'],x['locale']) for x in reuse_contexts})==12
assert all(x['priorDecisionSha256']=='56493dd797eaf4011e40372115caf0a65ba8343c334a7e198ae858b1ad501621' for x in reuse_contexts)
reuse_by_cell={(x['sourcePosition'],x['locale']):x for x in reuse_contexts}

# Retain all existing primary targets unless the independent review records a specific finding above.
ledger=[]; structural=Counter(); disposition_counts=Counter(); caller_status_counts=Counter(); extra=[]
for p in primary_rows:
    pos=p['sourcePosition']; loc=p['locale']; sid=p['sourceId']; cell=cur_by[(pos,loc)]; src=get_id(source_obj,sid)
    assert cell['source']==src==p['source'] and cell['sourceId']==sid and cell['sourcePosition']==pos
    assert cell['currentTarget']==p['currentTarget'] and cell['currentTargetHash']==sha(cell['currentTarget'])==p['currentTargetHash']
    assert cell['sourceTextSha256']==sha(src)==p['sourceTextSha256'] and cell['sourceHash']==sha(sid)==p['sourceHash']
    assert cell['localeFile']==p['localeFile'] and cell['localeFileSha256']==p['localeFileSha256']
    assert get_id(locale_objs[loc],sid)==cell['currentTarget']
    assert cell['localeBlob']==p['localeBlob']
    assert sha(p['candidateTarget'])==p['candidateTargetHash'] and sha(p['finalTarget'])==p['finalTargetHash']
    caller=ctx_by[sid]; ctxsha=sha(canon(caller))
    assert ctxsha==p['callerContextSha256']==cell['callerContextSha256']
    override=overrides.get((pos,loc))
    final=override['target'] if override else p['finalTarget']
    final_hash=sha(final)
    if override:
        if p['disposition'] in ('propose-correction','propose-refinement'):
            independent='revise-primary-candidate'
            primary_candidate_verdict='revised'
        else:
            independent='extra-'+override['type']
            primary_candidate_verdict='no-primary-candidate'
        finding_id=f'{pos}:{loc}'
        extra.append({'findingId':finding_id,'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':src,'currentTarget':p['currentTarget'],'currentTargetHash':p['currentTargetHash'],'primaryDisposition':p['disposition'],'primaryCandidateTarget':p['candidateTarget'],'primaryCandidateHash':p['candidateTargetHash'],'crossReviewDisposition':independent,'crossReviewType':override['type'],'crossReviewFinalTarget':final,'crossReviewFinalTargetHash':final_hash,'confidence':override['confidence'],'rationale':override['reason'],'callerContextRef':sid,'callerContextSha256':ctxsha,'callerUseStatus':caller['callerUseStatus'],'callerPaths':caller['callerPaths']})
        cross_reason=override['reason']
    else:
        primary_candidate_verdict='endorsed' if p['candidateChanged'] else 'not-applicable'
        if p['disposition']=='preserve-prior-disposition': independent='preserve-frozen-prior'
        elif p['disposition']=='propose-correction': independent='agree-primary-correction'
        elif p['disposition']=='propose-refinement': independent='agree-primary-refinement'
        else: independent='agree-current'
        cross_reason=('Independent review agrees with the candidate in the source/caller context and rechecked its language and structure.' if p['candidateChanged'] else 'Independent review finds the current target semantically adequate for the source and pinned caller context.')
    assert sha(final)==final_hash
    ph_source=placeholders(src); ph_current=placeholders(p['currentTarget']); ph_candidate=placeholders(p['candidateTarget']); ph_final=placeholders(final)
    tags_source=markup(src); tags_current=markup(p['currentTarget']); tags_candidate=markup(p['candidateTarget']); tags_final=markup(final)
    icu_source=icu_occurrences(src); icu_candidate=icu_occurrences(p['candidateTarget']); icu_final=icu_occurrences(final)
    sig=lambda xs:[(x['name'],x['kind']) for x in xs]
    p_sig=(sig(ph_source)==sig(ph_candidate)==sig(ph_final))
    m_parity=(tags_source==tags_candidate==tags_final)
    prot_expected=p['protectedLiteralsExpected']; candidate_missing=[x for x in prot_expected if x not in p['candidateTarget']]; missing=[x for x in prot_expected if x not in final]
    prot_ok=not missing and not candidate_missing
    structural['placeholderMismatches']+=not p_sig
    structural['markupMismatches']+=not m_parity
    structural['protectedLiteralMismatches']+=not prot_ok
    structural['icuArgumentSignatureMismatches']+=not (sig(icu_source)==sig(icu_candidate)==sig(icu_final))
    assert p_sig and m_parity and prot_ok and sig(icu_source)==sig(icu_candidate)==sig(icu_final),(pos,loc,'structural mismatch')
    assert p['placeholderParity']=='exact' and p['markupParity']=='exact' and p['protectedLiteralParity']=='exact' and not candidate_missing
    if override: assert placeholders(final)==placeholders(p['candidateTarget']) or independent=='revise-primary-candidate'
    if pos==1791 and loc=='ar':
        # This cross-review revision removes duplicated # output but retains the two named ICU arguments.
        assert sig(icu_final)==[('commitsBehind','simple'),('commitsBehind','plural')]
    caller_status=caller['callerUseStatus']
    scope='unclaimed-definition-only' if caller_status=='definition-only-or-single-reference' else 'pinned-caller-context-reviewed'
    if scope=='unclaimed-definition-only': caller_status_counts['unclaimed']+=1
    else: caller_status_counts['direct-or-helper']+=1
    disposition_counts[independent]+=1
    historical=reuse_by_cell.get((pos,loc))
    prior=(p.get('priorDisposition') or {})
    row={'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':src,'sourceHash':p['sourceHash'],'sourceTextSha256':p['sourceTextSha256'],'currentTarget':p['currentTarget'],'currentTargetHash':p['currentTargetHash'],'primaryCandidateTarget':p['candidateTarget'],'primaryCandidateTargetHash':p['candidateTargetHash'],'primaryFinalTarget':p['finalTarget'],'primaryFinalTargetHash':p['finalTargetHash'],'primaryDisposition':p['disposition'],'primaryRationale':p['rationale'],'candidateChanged':p['candidateChanged'],'independentVerdict':independent,'primaryCandidateVerdict':primary_candidate_verdict,'crossReviewRationale':cross_reason,'crossReviewConfidence':override['confidence'] if override else ('moderate' if caller_status!='definition-only-or-single-reference' else 'moderate; rendering use unclaimed'),'finalTarget':final,'finalTargetHash':final_hash,'independentTargetChangedFromPrimary':final!=p['finalTarget'],'localeFile':p['localeFile'],'localeBlob':p['localeBlob'],'localeFileSha256':p['localeFileSha256'],'sourceCatalogBlob':p['sourceCatalogBlob'],'sourceFileSha256':p['sourceFileSha256'],'callerContextRef':sid,'callerContextSha256':ctxsha,'callerUseStatus':caller_status,'callerScopeVerdict':scope,'callerPaths':caller['callerPaths'],'callerLineReferenceCount':len(caller['pinnedLineRefs']),'historicalReuseContext':historical,'exactPriorDisposition':prior if prior else None,'sourcePlaceholders':ph_source,'currentPlaceholders':ph_current,'primaryCandidatePlaceholders':ph_candidate,'finalPlaceholders':ph_final,'placeholderSignatureParity':'exact','sourceMarkup':tags_source,'currentMarkup':tags_current,'primaryCandidateMarkup':tags_candidate,'finalMarkup':tags_final,'markupParity':'exact','icuSourceOccurrences':icu_source,'icuCandidateOccurrences':icu_candidate,'icuFinalOccurrences':icu_final,'icuArgumentSignatureParity':'exact','protectedLiteralsExpected':prot_expected,'protectedLiteralsMissingFromFinal':missing,'protectedLiteralParity':'exact','priorDispositionReferences':p.get('historicalDispositionReferences',[]) }
    ledger.append(row)
assert len(ledger)==1200 and len(extra)==len(overrides)
assert sum(r['disposition']=='preserve-prior-disposition' for r in primary_rows)==1
assert len([r for r in ledger if r['callerScopeVerdict']=='unclaimed-definition-only'])==24
assert set((r['sourcePosition'],r['locale']) for r in ledger)==set((p['sourcePosition'],p['locale']) for p in primary_rows)

# Full caller file + line pins are kept separately so each cell row has a stable, reviewable context hash.
caller_audit=[]
for c in contexts:
 caller_audit.append({'sourceId':c['sourceId'],'callerContextSha256':sha(canon(c)),'callerUseStatus':c['callerUseStatus'],'callerEvidenceNote':c['callerEvidenceNote'],'callerPaths':c['callerPaths'],'callerFiles':c['callerFiles'],'pinnedLineRefs':c['pinnedLineRefs'],'crossReviewRenderingClaim':'unclaimed' if c['callerUseStatus']=='definition-only-or-single-reference' else 'context verified; caller usage reviewed','sourcePosition':next(x['position'] for x in source_window['sourceList'] if x['sourceId']==c['sourceId'])})

# Capture the exact prior Spanish disposition and the 12 historical equivalence contexts without upgrading them to frozen decisions.
prior_record={'sourceId':'components.IssueModal.CreateIssueModal.issueType','locale':'es','priorDisposition':'accept','priorFinalTarget':prior_row['finalTarget'],'priorFinalTargetHash':prior_row['finalTargetHash'],'priorRowSha256':sha(prior_line),'priorFile':prior_meta['path'],'priorFileSha256':sha(prior_raw),'crossReviewDisposition':'preserved-exact','crossReviewFinalTarget':'Tipo de problema','crossReviewFinalTargetHash':'1cd1be52b38250c8fbc651fc3038255e1f8862c0766fd5917af6a7621ebf4ca8'}
assert any(r['sourcePosition']==1707 and r['locale']=='es' and r['finalTarget']==prior_row['finalTarget'] and r['finalTargetHash']==prior_row['finalTargetHash'] for r in ledger)

# Reattest after all review work. Any PR/head/tree/input drift blocks finalization.
after=attest('after-cross-review')
assert before['worktreeStatusShort']==after['worktreeStatusShort']==''
assert before['pullRequest']['headRefOid']==after['pullRequest']['headRefOid']==head_expected
assert before['worktreeTree']==after['worktreeTree']==tree_expected

(out/'crossreview-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in ledger))
(out/'additional-findings.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in extra))
(out/'caller-context-review.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in caller_audit))
(out/'historical-reuse-contexts.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in reuse_contexts))
(out/'frozen-spanish-prior.json').write_text(json.dumps(prior_record,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(out/'structural-validation.json').write_text(json.dumps({'cellsReviewed':len(ledger),'recomputed':dict(structural),'primaryDeclaredMismatchCounts':{'placeholder':0,'markup':0,'protectedLiteral':0},'allPrimaryCandidatesMatchSourceArgumentNamesAndTypes':True,'allCrossReviewFinalTargetsMatchSourceArgumentNamesAndTypes':True,'icuCategoryNotes':[{'sourceId':'components.Layout.VersionStatus.commitsbehind','locale':'ar','note':'Arabic branch-specific plural categories are locale-adapted; both commitsBehind argument occurrences and their simple/plural kinds remain intact.','finalCategories':next(r['icuFinalOccurrences'][1]['categories'] for r in ledger if r['sourcePosition']==1791 and r['locale']=='ar')}]},ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(out/'attestation-after.json').write_text(json.dumps(after,ensure_ascii=False,indent=2,sort_keys=True)+'\n')

primary_summary=json.loads((primary/'summary.json').read_text())
counts=dict(sorted(disposition_counts.items()))
summary={'packet':'SeerrNG PR #418 W1700–1799 independent cross-review','repository':repo,'pullRequest':418,'state':'OPEN','isDraft':True,'head':head_expected,'tree':tree_expected,'sourcePositionRange':[1700,1799],'sourceIds':100,'locales':locales,'cellsReviewed':len(ledger),'perCellVerdictCounts':counts,'primaryDispositionCounts':primary_summary['dispositionCounts'],'additionalFindingCount':len(extra),'additionalFindingTypes':dict(sorted(Counter(x['crossReviewType'] for x in extra).items())),'revisedPrimaryCandidateCount':sum(x['crossReviewDisposition']=='revise-primary-candidate' for x in extra),'callerContextRowsReviewed':len(caller_audit),'callerLineReferencesReattested':after['callerLineReferenceCount'],'definitionOnlyUnclaimedKeys':['components.Layout.UserWarnings.emailInvalid','components.Layout.UserWarnings.passwordRequired'],'definitionOnlyUnclaimedCellCount':24,'directRenderingClaimForThoseKeys':False,'preservedExactPriorDispositionCount':1,'preservedExactPriorSpanish':prior_record,'historicalReuseContextsPreserved':len(reuse_contexts),'historicalReuseFinalTargetHashesFrozen':0,'candidatePlaceholderMismatches':structural['placeholderMismatches'],'candidateMarkupMismatches':structural['markupMismatches'],'candidateProtectedLiteralMismatches':structural['protectedLiteralMismatches'],'finalTargetPlaceholderMismatches':0,'finalTargetMarkupMismatches':0,'finalTargetProtectedLiteralMismatches':0,'allICUArgumentSignaturesPreserved':True,'nativeSpeakerApproval':'outstanding','confidence':'moderate overall; high for clear semantic/structural errors and correction findings; native-language confirmation remains separate','blockers':['Native-speaker approval remains outstanding for machine-reviewed translations.','The two UserWarnings keys emailInvalid and passwordRequired have definition-only caller evidence; their rendering remains unclaimed.'],'limitations':['Read-only review of the pinned catalog cells and caller snapshots; no tests/builds/scans/CI/browser/workflow actions were run.','The 12 historical reusable-equivalence records contain no frozen final-target hashes; they were preserved as context and independently reviewed.','No repository or PR edits were made.'],'inputPacketHashes':{'primarySha256SumsVerified':True,'inputSha256SumsVerified':True,'sourceCurrentCellsSha256':sha((primary/'source-current-cells.jsonl').read_bytes()),'primaryReviewLedgerSha256':sha((primary/'primary-review-ledger.jsonl').read_bytes()),'callerContextsSha256':sha((primary/'caller-contexts.jsonl').read_bytes()),'sourceWindowSha256':sha((primary/'source-window.json').read_bytes()),'inputManifestSha256':sha((primary/'input-manifest.json').read_bytes()),'priorBoundarySha256':sha((primary/'prior-disposition-boundary.json').read_bytes())}}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(out/'README.md').write_text(f'''# SeerrNG PR #418 W1700–1799 independent cross-review\n\nRead-only cross-review of 100 source IDs × 12 locales (1,200 cells) at `{head_expected}` / `{tree_expected}`. The PR remained OPEN/DRAFT and the pinned worktree was clean at both attestations. All locale catalog, source catalog, caller-file, prior-ledger, 100 caller-context, and 319 caller-line pins matched the live pinned tree.\n\n## Review result\n\n- The cross-review ledger contains every current value, primary candidate, independent verdict, final value, and exact SHA-256 hash.\n- The primary packet had 172 correction candidates, 30 refinement candidates, 997 current-value accepts, and one frozen Spanish acceptance.\n- The cross-review preserved the exact Spanish target `Tipo de problema` and its frozen hash. It retained all 12 older reuse-equivalence references as context only because they have no frozen final-target hashes.\n- {len(extra)} additional cross-review findings are recorded, including {sum(x['crossReviewDisposition']=='revise-primary-candidate' for x in extra)} revised primary candidates.\n- The two definition-only keys, `emailInvalid` and `passwordRequired`, remain explicitly unclaimed for rendering across their 24 locale cells.\n- Placeholder/ICU argument names and kinds, markup, and protected literals were rechecked. Arabic plural branches retain both repeated ICU argument occurrences.\n\n## Scope and confidence\n\nThis is a machine cross-review, not native-speaker approval. Overall confidence is moderate; confidence is high for clear semantic errors and structural checks. Native-speaker approval remains outstanding. No tests, builds, scans, CI, browser, or workflow operations were run; no repo or PR changes were made.\n\n`crossreview-ledger.jsonl` is the full per-cell record. `additional-findings.jsonl` isolates changes found or refined by this cross-review. `caller-context-review.jsonl`, `historical-reuse-contexts.jsonl`, `frozen-spanish-prior.json`, and `structural-validation.json` preserve supporting evidence. `SHA256SUMS` covers every output file.\n''')

# Include this generator in the packet and checksum every deliverable.
files=sorted(x for x in out.iterdir() if x.is_file() and x.name!='SHA256SUMS')
(out/'SHA256SUMS').write_text(''.join(f'{sha(x.read_bytes())}  {x.name}\n' for x in files))
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=out)
print(json.dumps({'output':str(out),'files':[x.name for x in sorted(out.iterdir()) if x.is_file()],'cells':len(ledger),'additionalFindings':len(extra),'findingTypes':dict(Counter(x['crossReviewType'] for x in extra)),'verdictCounts':counts,'unclaimedCells':caller_status_counts['unclaimed'],'reuseContexts':len(reuse_contexts),'pr':after['pullRequest'],'head':after['worktreeHead'],'tree':after['worktreeTree'],'callerRefs':after['callerLineReferenceCount'],'manifestChecks':len(after['sourceLocaleCallerAndPriorFileChecks']),'checksumVerified':True},ensure_ascii=False,indent=2))
