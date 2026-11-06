#!/usr/bin/env python3
import collections, hashlib, json, pathlib, re

OUT=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path('/home/keith/Documents/code/task-scratch')
INPUTS={
 'candidateFree':ROOT/'seerrng-pr418-w3620-3639-candidatefree-20261103/candidate-free-input',
 'primary':ROOT/'seerrng-pr418-w3620-3639-primary-review-20261103',
 'blind':ROOT/'seerrng-pr418-w3620-3639-blind-review-20261103',
}
HEAD='ebf1cb6082ef173688227c507acfdc04c3cf7ca7'
TREE='e3c4d1d10f40ea078b66dfdf942e99c8189fee0c'

def fail(msg): raise SystemExit('FAIL: '+msg)
def sha(data): return hashlib.sha256(data).hexdigest()
def file_sha(p): return sha(p.read_bytes())
def jread(p): return json.loads(p.read_text(encoding='utf-8'))
def jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def sums(folder):
    f=folder/'SHA256SUMS.txt'
    if not f.is_file(): fail('missing checksums: '+str(f))
    names=set()
    for line in f.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        h,name=line.split(None,1); name=name.lstrip('* ')
        p=folder/name
        if not p.is_file() or file_sha(p)!=h: fail('checksum mismatch: '+str(p))
        names.add(name)
    return names
def brace_end(s,start):
    depth=0
    for i in range(start,len(s)):
        if s[i]=='{': depth+=1
        elif s[i]=='}':
            depth-=1
            if depth==0: return i
    fail('unbalanced braces')
def parse_icu(s):
    out={};i=0
    while i<len(s):
        if s[i]!='{': i+=1;continue
        end=brace_end(s,i);body=s[i+1:end];m=re.match(r'\s*([A-Za-z_][\w]*)\s*,\s*plural\s*,',body)
        if m:
            arg=m.group(1);j=m.end();branches={}
            while j<len(body):
                while j<len(body) and (body[j].isspace() or body[j]==','):j+=1
                if j>=len(body):break
                cm=re.match(r'([A-Za-z_=0-9]+)\s*',body[j:])
                if not cm:fail('malformed ICU branch')
                cat=cm.group(1);j+=cm.end()
                if j>=len(body) or body[j]!='{':fail('missing ICU branch body')
                be=brace_end(body,j)
                if cat in branches:fail('duplicate ICU branch category')
                branches[cat]=body[j+1:be];j=be+1
            out[arg]=branches
        i=end+1
    return out
def simple_placeholders(s):
    kept=[];i=0
    while i<len(s):
        if s[i]=='{':
            end=brace_end(s,i);body=s[i+1:end]
            if re.match(r'\s*[A-Za-z_][\w]*\s*,\s*plural\s*,',body):i=end+1;continue
        kept.append(s[i]);i+=1
    return collections.Counter(re.findall(r'\{([A-Za-z_][\w]*)\}', ''.join(kept)))
def number_values(s):
    vals=[]
    for token in re.findall(r'\d(?:[\d.,\u00a0\u202f]*\d)?',s):
        digits=re.sub(r'[,\.\u00a0\u202f]','',token)
        if digits:vals.append(int(digits))
    return sorted(vals)

def main():
    manifest=jread(OUT/'manifest.json')
    if (manifest.get('head'),manifest.get('tree'))!=(HEAD,TREE):fail('output pin mismatch')
    output_names=sums(OUT)
    expected_names={'README.md','summary.json','manifest.json','cross-audit-ledger.jsonl','verify_cross_audit.py'}
    if output_names!=expected_names:fail('output checksum coverage mismatch')
    for name,folder in INPUTS.items():
        sums(folder)
        pin=manifest['inputPins'][name]
        if pin['manifestSha256']!=file_sha(folder/'manifest.json') or pin['checksumListSha256']!=file_sha(folder/'SHA256SUMS.txt'):fail(name+' input pin mismatch')
        im=jread(folder/'manifest.json')
        if (im.get('head'),im.get('tree'))!=(HEAD,TREE):fail(name+' head/tree mismatch')
    cf,pf,bf=(INPUTS['candidateFree'],INPUTS['primary'],INPUTS['blind'])
    cm=jread(cf/'manifest.json'); locale_order=cm['localeOrder']
    expected={(p,l) for p in range(3620,3640) for l in locale_order}
    src={r['position']:r for r in jsonl(cf/'source-cells.jsonl')}
    cur={(r['position'],r['locale']):r for r in jsonl(cf/'current-target-cells.jsonl')}
    pri={(r['position'],r['locale']):r for r in jsonl(pf/'primary-ledger.jsonl')}
    bli={(r['position'],r['locale']):r for r in jsonl(bf/'sealed-translation-ledger.jsonl')}
    rows={(r['position'],r['locale']):r for r in jsonl(OUT/'cross-audit-ledger.jsonl')}
    if len(src)!=20 or set(src)!=set(range(3620,3640)):fail('source row coverage mismatch')
    for label,m in [('current',cur),('primary',pri),('blind',bli),('audit',rows)]:
        if len(m)!=240 or set(m)!=expected:fail(label+' cell coverage mismatch')
    findings=jread(cf/'caller-resolution-findings.json')
    if findings.get('callerlessSourcePositions')!=[3632]:fail('callerless source position mismatch')
    context_blocks={x['contextId']:x for x in jsonl(cf/'caller-context-blocks.jsonl')}
    runtime=jread(pf/'runtime-icu-categories.json')['categories']
    locale_tags={r['locale']:r['localeTag'] for r in cur.values() if r['position']==3620}
    counts=collections.Counter(); changed=blind_diffs=primary_diffs=primary_matches=primary_unselected=0; union=set(); category_rows={}
    other_blind_text={}
    for k,b in bli.items():
        x=b.get('decision',{}).get('translation')
        if x is not None:other_blind_text.setdefault(x,[]).append(k)
    for key in sorted(expected):
        r=rows[key]; s=src[key[0]]; c=cur[key]; p=pri[key]; b=bli[key]
        if (r.get('head'),r.get('tree'))!=(HEAD,TREE):fail('row pin mismatch '+str(key))
        for obj in (r,c,p,b):
            if obj.get('sourceId')!=s['sourceId'] or obj.get('sourceSha256',s['sourceSha256'])!=s['sourceSha256']:fail('source binding mismatch '+str(key))
        prompt=b.get('sourcePrompt',{})
        if prompt.get('sourceId')!=s['sourceId'] or prompt.get('source')!=s['source'] or prompt.get('sourceSha256')!=s['sourceSha256'] or prompt.get('locale')!=key[1] or prompt.get('namespace')!=s['namespace'] or prompt.get('callerResolution')!=p['callerResolution']:
            fail('blind prompt context/source binding mismatch '+str(key))
        for block in prompt.get('callerContextBlocks',[]):
            context_id=block.get('contextId')
            if context_id not in context_blocks or block!=context_blocks[context_id] or block.get('sourceId')!=s['sourceId'] or block.get('sourcePosition')!=key[0]:
                fail('blind context block leaked across source positions '+str(key))
        if r['source']!=s['source'] or r['position']!=key[0] or r['locale']!=key[1]:fail('audit identity mismatch '+str(key))
        if r['currentTarget']!=c['currentTarget'] or r['currentTargetSha256']!=sha(c['currentTarget'].encode()):fail('current target mismatch '+str(key))
        prop=b.get('decision',{}).get('translation')
        if r['blindReview']['proposal']!=prop:fail('blind proposal bound to wrong row '+str(key))
        if r['blindReview']['proposalSha256']!=(sha(prop.encode()) if prop is not None else None):fail('blind proposal hash mismatch '+str(key))
        if r['primaryReview']['reviewedTargetSha256']!=p['reviewedTargetSha256'] or r['callerContextSha256']!=p['callerContextSha256']:fail('primary target/context mismatch '+str(key))
        bd=prop is not None and prop!=c['currentTarget']; pd=p['reviewedTargetSha256']!=sha(c['currentTarget'].encode())
        if r['blindReview']['proposalDiffersFromCurrent']!=bd or r['primaryTargetHashDiffersFromCurrent']!=pd:fail('difference flag mismatch '+str(key))
        if bd:blind_diffs+=1;union.add(key)
        if pd:primary_diffs+=1;union.add(key)
        if key[0]==3632:
            if r['resolution']!='hold' or r['resolvedTarget'] is not None or prop is not None or p['decision']!='hold' or b['decision']['disposition']!='hold' or not r['callerless']:fail('position 3632 hold violation '+str(key))
            counts['hold']+=1;primary_matches+=p['reviewedTargetSha256']==sha(c['currentTarget'].encode());continue
        if r['resolution']=='hold':fail('hold outside position 3632')
        final=r['resolvedTarget']
        if final is None or r['resolvedTargetSha256']!=sha(final.encode()):fail('resolved target hash mismatch '+str(key))
        if r['resolution']=='retain-current' and final!=c['currentTarget']:fail('retain-current target mismatch '+str(key))
        if r['resolution']=='adopt-blind-proposal' and (prop is None or final!=prop):fail('proposal adopted from another row '+str(key))
        if r['resolution']=='cross-audit-target' and any(k2!=key for k2 in other_blind_text.get(final,[])):fail('custom target text copied from unrelated context '+str(key))
        if r['resolution'] not in ('retain-current','adopt-blind-proposal','cross-audit-target'):fail('invalid resolution '+str(key))
        match=p['reviewedTargetSha256']==sha(final.encode())
        if r['primaryTargetHashMatchesResolved']!=match:fail('primary hash resolution flag mismatch '+str(key))
        primary_matches+=match
        if pd and not match:primary_unselected+=1
        if final!=c['currentTarget']:changed+=1
        counts[r['resolution']]+=1
        # Token and format checks are row-bound to this exact English source and final target.
        source_plural={x['name'] for x in s['sourcePlaceholders'] if x.get('formatter')=='plural'}
        source_simple=collections.Counter(x['name'] for x in s['sourcePlaceholders'] if x.get('formatter')!='plural')
        target_plural=parse_icu(final); target_simple=simple_placeholders(final)
        if source_plural!=set(target_plural) or source_simple!=target_simple:fail('placeholder/formatter mismatch '+str(key))
        if re.findall(r'<[^>]+>',s['source'])!=re.findall(r'<[^>]+>',final):fail('markup mismatch '+str(key))
        if number_values(s['source'])!=number_values(final):fail('numeric value mismatch '+str(key))
        if not all(lit in final for lit in s['sourceProtectedLiterals']):fail('protected literal missing '+str(key))
        for arg in source_plural:
            branches=target_plural.get(arg,{})
            categories=set(runtime[locale_tags[key[1]]])
            if not branches or 'other' not in branches or not categories.issubset(set(branches)|{'other'}):fail('ICU runtime branch coverage failure '+str(key))
            if not any('#' in body for body in branches.values()):fail('ICU count marker missing '+str(key))
        audit=r['tokenAudit']
        for field in ('placeholders','icuRuntimeBranchCoverage','markup','numericValues','protectedLiterals'):
            if audit.get(field)!='PASS':fail('recorded token audit failed '+str(key)+' '+field)
        if key[0]==3634:category_rows[key[1]]=set(target_plural['mediaCount'])
    if changed!=33 or blind_diffs!=101 or primary_diffs!=31 or primary_unselected!=13 or primary_matches!=224 or len(union)!=108:fail('computed difference counts mismatch')
    if counts!=collections.Counter({'retain-current':195,'adopt-blind-proposal':12,'cross-audit-target':21,'hold':12}):fail('resolution counts mismatch '+str(counts))
    summary=jread(OUT/'summary.json')
    checks={'cellCount':240,'changedTargetCount':changed,'blindProposalDifferenceCount':blind_diffs,'primaryDifferentTargetHashCount':primary_diffs,'primaryTargetHashMatchesResolvedCount':primary_matches,'primaryDifferentTargetHashNotSelectedCount':primary_unselected,'distinctTargetDifferenceCells':len(union)}
    for k,v in checks.items():
        if summary.get(k)!=v:fail('summary mismatch '+k)
    if summary.get('resolutionCounts')!=dict(sorted(counts.items())):fail('summary decision counts mismatch')
    for locale in locale_order:
        if not set(runtime[locale_tags[locale]]).issubset(category_rows[locale]|{'other'}):fail('ICU coverage mismatch '+locale)
    for item in manifest['outputFiles']:
        p=OUT/item['path']
        if not p.is_file() or p.stat().st_size!=item['byteCount'] or file_sha(p)!=item['sha256']:fail('manifest output hash mismatch '+item['path'])
    print('PASS: 240 cells; resolutions='+json.dumps(dict(sorted(counts.items()))) )
    print('PASS: 101 blind/current differences and 31 primary target hashes resolved; 108 distinct difference cells; 12 holds at 3632.')
    print('PASS: row/source/context binding, ICU runtime coverage, placeholders, markup, numeric values, protected literals, and checksums.')
if __name__=='__main__':main()
