#!/usr/bin/env python3
from __future__ import annotations
import collections,hashlib,json,re,subprocess,sys
from pathlib import Path
OUT=Path(__file__).resolve().parent
INPUT=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3860-3879-primary-20261104/candidate-free-input')
HEAD='12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e'; TREE='b288494aa5a0842affc4e900d6ccb6b57d99c493'
LOCALES=['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']
PH=re.compile(r'\{[A-Za-z][A-Za-z0-9_]*\}'); TAGS=re.compile(r'<\/?[A-Za-z][^>]*>'); NUMS=re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
PROT_RE=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise)(?![A-Za-z0-9])'
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode())
def jl(p):return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def j(p):return json.loads(p.read_text(encoding='utf-8'))
def tok(s):
    prot=[]
    for x in re.findall(PROT_RE,s):
        if x not in prot:prot.append(x)
    return {'placeholders':PH.findall(s),'markupTags':TAGS.findall(s),'numericTokens':NUMS.findall(s),'protectedLiterals':prot}
def fail(m):raise SystemExit('FAIL: '+m)
def main():
    # Verify the sealed candidate-free input without opening primary review artifacts.
    subprocess.run(['sha256sum','-c','SHA256SUMS.txt'],cwd=INPUT,check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['python3',str(INPUT/'verify-candidate-free.py')],check=True,stdout=subprocess.DEVNULL)
    manifest=j(INPUT/'manifest.json'); att=j(OUT/'input-attestation.json')
    if manifest['head']!=HEAD or manifest['tree']!=TREE or manifest['range']!=[3860,3879] or manifest['cellCount']!=240:fail('candidate-free pin/window')
    if att['exactHead']!=HEAD or att['exactTree']!=TREE or att['candidateFreeInputVerifier']!='PASS' or att['candidateFreeChecksums']!='PASS':fail('input attestation')
    if sha((INPUT/'manifest.json').read_bytes())!=att['candidateFreeManifestSha256'] or sha((INPUT/'SHA256SUMS.txt').read_bytes())!=att['candidateFreeChecksumFileSha256']:fail('input file hashes')
    first=j(OUT/'live-pr-first-reattestation.json'); last=j(OUT/'live-pr-after-review.json')
    for snap in (first,last):
        if (snap['head'],snap['tree'],snap['state'],snap['draft'],snap['headRef'],snap['baseRef'],snap['baseSha'])!=(HEAD,TREE,'open',True,'codex/seerrng-localization-overhaul-20261028','main','fa40534ccced75bde1125c14760514fcd5d7de4d'):fail('live PR snapshot')
    if first['deploymentCountFromCandidateFreeSnapshots']!=0 or last['deploymentCount']!=0:fail('deployment snapshot')
    src=jl(INPUT/'selected-source-cells.jsonl'); base=jl(INPUT/'current-target-cells.jsonl')
    review=jl(OUT/'blind-review-cells.jsonl'); proposals=jl(OUT/'blind-review-proposals.jsonl'); contexts=jl(OUT/'blind-source-caller-context.jsonl')
    if len(src)!=20 or len(base)!=240 or len(review)!=240 or len(contexts)!=20:fail('source/cell/context counts')
    if [(x['position'],x['locale']) for x in review]!=[(p,l) for p in range(3860,3880) for l in LOCALES]:fail('review order')
    sm={x['position']:x for x in src}; bm={(x['position'],x['locale']):x for x in base}; rm={(x['position'],x['locale']):x for x in review}; ctxm={x['position']:x for x in contexts}
    if len(sm)!=20 or len(bm)!=240 or len(rm)!=240 or len(ctxm)!=20:fail('duplicate rows')
    count=collections.Counter(x['reviewDisposition'] for x in review); pm={(x['position'],x['locale']):x for x in proposals}
    if len(pm)!=35 or len(pm)!=len(proposals):fail('proposal count/duplicates')
    mismatches=[]
    for pos,s in sm.items():
        csrc=next(x for x in jl(INPUT/'caller-contexts.jsonl') if x['sourceId']==s['sourceId'])
        context=ctxm[pos]
        if context['sourceId']!=s['sourceId'] or context['sourceTextSha256']!=s['sourceTextSha256'] or context['callerContextSha256']!=csrc['callerContextSha256']:fail('source/caller context binding')
        if context['callerCount']!=csrc['callerCount'] or context['callerCount']<=0:fail('caller coverage')
        material={'sourceId':csrc['sourceId'],'namespace':csrc['namespace'],'definition':next(b for b in context['contextBlocks'] if b['contextType']=='message-definition'),'directMessageReferences':context['directMessageReferences'],'dynamicRendererReferences':context['dynamicRendererReferences']}
        if csrc['callerContextSha256']!=shat(json.dumps(material,ensure_ascii=False,sort_keys=True,separators=(',',':'))):fail('caller context digest')
        for block in context['contextBlocks']:
            for line in block['lines']:
                if line['lineSha256']!=shat(line['text']):fail('caller context line hash')
        for ref in context['directMessageReferences']+context['dynamicRendererReferences']:
            if ref['lineSha256']!=shat(ref['text']):fail('caller reference line hash')
        # Record hash links rows to the complete source/caller material.
        context_hash=sha((json.dumps(context,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode())
        if any(r['callerRecordSha256']!=context_hash for (p,l),r in rm.items() if p==pos):fail('caller-record digest')
    for key,r in rm.items():
        x=bm[key]; s=sm[key[0]]; pos,loc=key
        if r['sourceId']!=s['sourceId'] or r['sourceIdSha256']!=s['sourceIdSha256'] or r['sourceText']!=s['sourceText'] or r['sourceTextSha256']!=s['sourceTextSha256']:fail('source readback '+str(key))
        if r['currentTarget']!=x['currentTarget'] or r['currentTargetSha256']!=x['currentTargetSha256']:fail('current readback '+str(key))
        if r['reviewDisposition'] not in ('accept-current','revise-current') or r['reviewedTargetSha256']!=shat(r['reviewedTarget']):fail('disposition/hash '+str(key))
        if r['sourceTokens']!=s['sourceTokens'] or r['currentTokens']!=tok(x['currentTarget']) or r['reviewedTokens']!=tok(r['reviewedTarget']):fail('token record '+str(key))
        checks=r['tokenParity']; st=s['sourceTokens']; ft=r['reviewedTokens']
        if any(checks[n] is not True for n in ('placeholders','markupTags','numericTokens')):fail('token parity '+str(key))
        if not set(st['protectedLiterals'])<=set(ft['protectedLiterals']) or checks['protectedLiterals'] is not True:fail('protected literal parity '+str(key))
        if r['reviewDisposition']=='accept-current':
            if r['reviewedTarget']!=x['currentTarget'] or key in pm:fail('accept-current changed '+str(key))
        else:
            if r['reviewedTarget']==x['currentTarget'] or key not in pm:fail('revision missing or redundant '+str(key))
            p=pm[key]
            if p['recommendedTarget']!=r['reviewedTarget'] or p['recommendedTargetSha256']!=r['reviewedTargetSha256'] or p['currentTargetSha256']!=x['currentTargetSha256']:fail('proposal/readback '+str(key))
            if p['sourceTokens']!=st or p['recommendedTokens']!=ft or p['tokenParity']!=checks:fail('proposal token parity '+str(key))
        if not all(checks.values()):fail('final token mismatch '+str(key))
        if any(not t['matches'] for n,t in x['tokenChecks'].items()):
            mismatches.append((pos,loc))
            if r['reviewDisposition']!='revise-current' or all(r['reviewedTarget']==x['currentTarget'] for _ in [0]):fail('baseline token issue uncorrected '+str(key))
        if pos==3874 and r.get('sourceRewriteSuggested')!='Configuration Name':fail('configuration name source note missing')
    if dict(count)!={'accept-current':205,'revise-current':35} or len(mismatches)!=2 or set(mismatches)!={(3863,'ja'),(3868,'de')}:fail('summary totals/baseline mismatch coverage')
    if len([r for r in review if r['position']==3874 and r.get('sourceRewriteSuggested')=='Configuration Name'])!=12:fail('source rewrite target coverage')
    if any('hold' in x['reviewDisposition'] for x in review):fail('unexpected hold')
    summary=j(OUT/'blind-review-summary.json')
    if summary['counts']['cells']!=240 or summary['counts']['acceptCurrent']!=205 or summary['counts']['reviseCurrent']!=35 or summary['counts']['holds']!=0:fail('summary count')
    if summary['candidateFreeExactHead']!=HEAD or summary['candidateFreeExactTree']!=TREE:fail('summary pin')
    result={'result':'PASS','head':HEAD,'tree':TREE,'range':[3860,3879],'cells':240,'acceptCurrent':205,'reviseCurrent':35,'proposals':35,'holds':0,'callerContextRecords':20,'callerReferences':21,'baselineProtectedLiteralMismatches':2,'recommendedProtectedLiteralMismatches':0,'placeholderMarkupNumericParity':'PASS','protectedLiteralParity':'PASS','candidateFreeChecksumsAndVerifier':'PASS','livePRAtBothEnds':'OPEN/DRAFT exact head/tree; deployments 0','nativeOrBrowserReviewClaim':False}
    (OUT/'blind-review-verification.json').write_text(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
