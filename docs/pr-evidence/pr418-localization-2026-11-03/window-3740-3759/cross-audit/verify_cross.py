#!/usr/bin/env python3
"""Portable verifier for the SeerrNG PR #418 W3740-W3759 cross-audit packet."""
from pathlib import Path
import collections, hashlib, json, re, subprocess, sys
HERE=Path(__file__).resolve().parent
HEAD='8d0273ebc5eb51e9d5fee0ac9a0eb022eeed06c4'
TREE='163056b8255034e3ee3a99f25b63e190c88278ee'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']

def fail(s): raise SystemExit('FAIL: '+s)
def ok(x,s):
    if not x: fail(s)
def sha(b):
    if isinstance(b,str): b=b.encode('utf-8')
    return hashlib.sha256(b).hexdigest()
def jf(p): return json.loads(p.read_text(encoding='utf-8'))
def jl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def token_sig(text):
    placeholders=re.findall(r'\{([A-Za-z_][A-Za-z0-9_.]*)\}',text)
    plural={}
    for m in re.finditer(r'\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*plural\s*,(.*?)\}',text,re.S):
        plural[m.group(1)]=re.findall(r'(?<![\w-])(zero|one|two|few|many|other)\s*\{',m.group(2))
    return {'placeholders':placeholders,'icuPluralCategories':plural,'markup':re.findall(r'</?[A-Za-z][^>]*>',text),'numericTokens':re.findall(r'\d+(?:[.,]\d+)*',text)}
def literal_present(term,text): return re.search(r'(?<![A-Za-z0-9])'+re.escape(term)+r'(?![A-Za-z0-9])',text) is not None

def checksum_inventory(root, checksum_name='SHA256SUMS.txt'):
    sums=root/checksum_name
    seen={}
    for line in sums.read_text(encoding='utf-8').splitlines():
        m=re.fullmatch(r'([0-9a-f]{64})  (.+)',line)
        ok(m is not None,'malformed checksum row in '+str(sums))
        h,rel=m.groups(); path=Path(rel)
        ok(not path.is_absolute() and '..' not in path.parts and rel not in seen,'unsafe or duplicate checksum path '+rel)
        seen[rel]=h
    actual={x.relative_to(root).as_posix() for x in root.rglob('*') if x.is_file() and x!=sums}
    ok(actual==set(seen),'checksum inventory mismatch in '+str(root))
    for rel,h in seen.items(): ok(sha((root/rel).read_bytes())==h,'checksum mismatch '+str(root/rel))
    return seen

def category(c,p,b):
    pc=p['selectedTarget']!=c['currentTarget']; bc=bool(b.get('proposedTarget'))
    if pc and bc: return 'both-changed-same' if p['selectedTarget']==b['proposedTarget'] else 'conflict'
    if pc: return 'primary-only'
    if bc: return 'blind-only'
    return 'both-accept'

def verify():
    # Root output file inventory and its independent manifest.
    root_sums=checksum_inventory(HERE)
    manifest=jf(HERE/'manifest.json')
    payload={x.relative_to(HERE).as_posix() for x in HERE.rglob('*') if x.is_file() and x.relative_to(HERE).as_posix() not in ('SHA256SUMS.txt','manifest.json')}
    ok(set(x['path'] for x in manifest['files'])==payload,'cross manifest inventory mismatch')
    for x in manifest['files']:
        path=HERE/x['path']; ok(path.stat().st_size==x['byteCount'] and sha(path.read_bytes())==x['sha256'],'manifest file hash/size '+x['path'])
    ok((manifest['head'],manifest['tree'],manifest['pullRequest'],manifest['window'],manifest['cellCount'])==(HEAD,TREE,418,'W3740-W3759',240),'cross manifest scope')
    # Verify both sealed upstream packets with their own portable verifiers.
    primary=HERE/'evidence/primary-packet'; blind=HERE/'evidence/blind-packet'
    subprocess.run([sys.executable,str(primary/'verify_primary.py'),'--input',str(primary/'candidate-free-input'),'--output',str(primary/'primary-review')],check=True,stdout=subprocess.PIPE,text=True)
    subprocess.run([sys.executable,str(blind/'verify_review.py')],cwd=blind,check=True,stdout=subprocess.PIPE,text=True)
    # Both independent reviews used byte-identical candidate-free inputs.
    inp=primary/'candidate-free-input'; binp=blind/'input'
    p_sums=checksum_inventory(primary); b_sums=checksum_inventory(blind); i_sums=checksum_inventory(inp)
    ok(checksum_inventory(binp)==i_sums,'blind candidate-free input checksums differ')
    for rel in i_sums: ok((inp/rel).read_bytes()==(binp/rel).read_bytes(),'candidate-free input byte mismatch '+rel)
    im=jf(inp/'manifest.json'); ok((im['head'],im['tree'],im['window'],im['cellCount'])==(HEAD,TREE,'W3740-W3759',240),'candidate-free pin')
    # Live before/after PR, git refs, commit tree and deployments.
    before=jf(HERE/'live-before.json'); after=jf(HERE/'live-after.json')
    for label,s in [('before',before),('after',after)]:
        pr=s['pullRequest']
        ok(s['repository']=='snapetech-org/SeerrNG','live repository '+label)
        ok(pr['number']==418 and pr['state']=='OPEN' and pr['isDraft'] is True and pr['baseRefName']=='main','live PR state '+label)
        ok(pr['headRefName']=='codex/seerrng-localization-overhaul-20261028' and pr['headRefOid']==HEAD,'live PR head '+label)
        ok(s['branchRef']==HEAD and s['pullRef']==HEAD and s['tree']==TREE,'live branch/pull/tree '+label)
        ok(s['deploymentCountForHead']==0 and s['deploymentIdsForHead']==[],'deployment state '+label)
    live_fields=lambda s:(s['pullRequest'],s['branchRef'],s['pullRef'],s['tree'],s['deploymentCountForHead'],s['deploymentIdsForHead'])
    ok(live_fields(before)==live_fields(after),'live PR/ref/deployment state changed during audit')
    att=jf(inp/'PR-attestation.json')
    ok((att['head'],att['tree'],att['state'],att['isDraft'],att['baseRefName'])==(HEAD,TREE,'OPEN',True,'main'),'candidate-free PR pin')
    # Read all 240 exact source/caller/catalog/current pins and both reviewer ledgers.
    sources={r['position']:r for r in jl(inp/'source-cells.jsonl')}
    cells=jl(inp/'current-target-cells.jsonl'); cmap={(r['position'],r['locale']):r for r in cells}
    callers={r['position']:r for r in jl(inp/'caller-contexts.jsonl')}
    primary_rows=jl(primary/'primary-review/primary-ledger.jsonl'); pmap={(r['position'],r['locale']):r for r in primary_rows}
    blind_rows=jl(blind/'blind-ledger.jsonl'); bmap={(r['position'],r['locale']):r for r in blind_rows}
    ledger=jl(HERE/'cross-ledger.jsonl'); lm={(r['position'],r['locale']):r for r in ledger}
    expected=[(pos,locale) for pos in range(3740,3760) for locale in LOCALES]
    ok(len(sources)==20 and len(callers)==20 and len(cells)==len(primary_rows)==len(blind_rows)==len(ledger)==240,'row count')
    ok(list(cmap)==expected and list(pmap)==expected and list(bmap)==expected and list(lm)==expected,'row coverage/order')
    rules=jf(HERE/'resolution-rules.json'); cr=rules['conflictRules']; ov=rules['cellOverrides']; dispov=rules['dispositionOverrides']
    ok(rules['scope']=={'head':HEAD,'tree':TREE,'pullRequest':418,'window':'W3740-W3759','cellCount':240},'resolution-rule scope')
    counts=collections.Counter(); dispositions=collections.Counter(); changes=0; conflict_rows=[]; baseline_bad=set()
    findings=jf(inp/'baseline-protected-literal-findings.json')
    baseline_bad={(x['position'],x['locale']) for x in findings['rows']}
    ok(findings['count']==3,'baseline protected literal count')
    for k in expected:
        c=cmap[k]; p=pmap[k]; b=bmap[k]; src=sources[k[0]]; ctx=callers[k[0]]; row=lm[k]
        cat=category(c,p,b); counts[cat]+=1
        key=f'{k[0]}:{k[1]}'
        for field in ('position','locale','localeTag','sourceId','sourceIdSha256','sourceSha256','currentTargetSha256','catalogPath','catalogSha256','catalogGitBlob','head','tree'):
            expected_value={'position':k[0],'locale':k[1],'localeTag':c['localeTag'],'sourceId':src['sourceId'],'sourceIdSha256':src['sourceIdSha256'],'sourceSha256':src['sourceSha256'],'currentTargetSha256':c['currentTargetSha256'],'catalogPath':c['catalogPath'],'catalogSha256':c['catalogSha256'],'catalogGitBlob':c['catalogGitBlob'],'head':HEAD,'tree':TREE}[field]
            ok(row.get(field)==expected_value,'cell pin mismatch '+str(k)+':'+field)
        ok(c['sourceId']==src['sourceId'] and c['sourceIdSha256']==src['sourceIdSha256'] and c['sourceSha256']==src['sourceSha256'],'source pin '+str(k))
        ok(sha(src['sourceId'])==src['sourceIdSha256'] and sha(src['source'])==src['sourceSha256'],'source hash '+str(k))
        ok(sha(c['currentTarget'])==c['currentTargetSha256']==p['currentTargetSha256']==row['currentTargetSha256'],'current preimage '+str(k))
        ok(p['currentTarget']==c['currentTarget'] and p['source']==src['source'],'primary source/preimage '+str(k))
        ok(b['sourceId']==src['sourceId'] and b['sourceSha256']==src['sourceSha256'] and b['currentTargetSha256']==c['currentTargetSha256'],'blind source/preimage hash '+str(k))
        ok(row['callerCount']==ctx['callerCount']>=1 and row['callerContextBlockIds']==ctx['contextBlockIds'] and row['directMessageReferences']==ctx['directMessageReferences'],'caller pin/count '+str(k))
        ctxhash=sha(json.dumps(ctx,ensure_ascii=False,sort_keys=True,separators=(',',':')))
        ok(row['callerContextSha256']==ctxhash,'caller context hash '+str(k))
        pin=jf(inp/'file-pins.json')['catalogFiles'].get(c['catalogPath'])
        ok(pin is not None and pin['sha256']==c['catalogSha256'] and pin['gitBlob']==c['catalogGitBlob'],'catalog pin '+str(k))
        # Independently reconstruct the reconciled target and disposition.
        if cat=='conflict':
            ok(key in cr,'missing conflict rule '+key); rule=cr[key]; target=rule['target']; resolution=rule['resolution']; disp=rule['disposition']; confidence=rule['confidence']; rationale=rule['rationale']
            ok(resolution in ('primary','blind','reconciled'),'conflict resolution label '+key)
            if resolution=='primary': ok(target==p['selectedTarget'],'conflict primary target '+key)
            if resolution=='blind': ok(target==b.get('proposedTarget'),'conflict blind target '+key)
            if resolution=='reconciled': ok(target not in (p['selectedTarget'],b.get('proposedTarget')),'conflict joint target not distinct '+key)
            conflict_rows.append(k)
        elif key in ov:
            rule=ov[key]; target=rule['target']; resolution=rule['resolution']; disp=rule['disposition']; confidence=rule['confidence']; rationale=rule['rationale']
            ok(cat in ('primary-only','blind-only'),'override category '+key)
        elif cat=='primary-only':
            target=p['selectedTarget']; resolution='primary'; disp=p['decision']; confidence=p['confidence']; rationale='Independent cross-audit agrees with the primary proposal: '+p['rationale']
        elif cat=='blind-only':
            target=b['proposedTarget']; resolution='blind'; disp=b['disposition']; confidence=b['confidence']; rationale='Independent cross-audit agrees with the blind proposal: '+b['rationale']
        elif cat=='both-changed-same':
            target=p['selectedTarget']; resolution='shared'; disp='correction' if 'correction' in (p['decision'],b['disposition']) else 'refinement'; confidence=min((p['confidence'],b['confidence']),key=lambda v:{'high':0,'moderate':1,'low':2}[v]); rationale='Both independent reviews selected this same target. Cross-audit confirms it resolves the pinned caller-context issue: '+p['rationale']+'; '+b['rationale']
            if key in dispov: disp=dispov[key]
        else:
            target=c['currentTarget']; resolution='current'; disp='accept-current'; confidence='moderate'; rationale='Both review ledgers accepted this exact current target; cross-check found no supported source, caller, token, or protected-literal reason to change it.'
        changed=target!=c['currentTarget']
        ok(row['category']==cat and row['resolution']==resolution and row['disposition']==disp and row['confidence']==confidence and row['changed']==changed,'decision reconstruction '+key)
        ok(row['resolvedTargetSha256']==sha(target) and row['resolvedTarget']==(target if changed else None),'resolved target hash/text '+key)
        ok(row['rationale']==rationale and bool(rationale.strip()),'rationale '+key)
        if changed:
            changes+=1; ok(disp in ('correction','refinement'),'changed disposition '+key)
        else: ok(disp=='accept-current','unchanged disposition '+key)
        dispositions[disp]+=1
        sigs={name:token_sig(text) for name,text in [('source',src['source']),('current',c['currentTarget']),('resolved',target)]}
        req=src['sourceProtectedLiterals']; requiredchecks={'placeholdersMatchSource':sigs['resolved']['placeholders']==sigs['source']['placeholders'],'icuPluralCategoriesMatchSource':sigs['resolved']['icuPluralCategories']==sigs['source']['icuPluralCategories'],'markupMatchesSource':sigs['resolved']['markup']==sigs['source']['markup'],'numericTokensMatchSource':sigs['resolved']['numericTokens']==sigs['source']['numericTokens'],'protectedLiteralsRequired':req,'protectedLiteralsPresent':[x for x in req if literal_present(x,target)],'protectedLiteralsMatchSource':all(literal_present(x,target) for x in req)}
        ok(row['checks']==requiredchecks and all(requiredchecks[x] for x in ('placeholdersMatchSource','icuPluralCategoriesMatchSource','markupMatchesSource','numericTokensMatchSource','protectedLiteralsMatchSource')),'resolved token/literal checks '+key)
        actual_bad=any(not literal_present(x,c['currentTarget']) for x in req)
        ok(bool(c['protectedLiteralMismatch'])==actual_bad,'baseline literal diagnosis '+key)
        if actual_bad: ok(changed and all(literal_present(x,target) for x in req),'baseline literal repaired '+key)
        ok(p['decision'] in ('accept-current','correction','refinement','hold') and b['disposition'] in ('accept-current','correction','refinement','hold'),'input reviewer dispositions '+key)
    ok(counts=={'conflict':20,'primary-only':20,'blind-only':5,'both-changed-same':9,'both-accept':186},'classification totals')
    ok(len(conflict_rows)==20 and len(jl(HERE/'conflict-resolutions.jsonl'))==20,'conflict resolution count')
    conflict_ledger=jl(HERE/'conflict-resolutions.jsonl'); ckeys={(r['position'],r['locale']) for r in conflict_ledger}
    ok(ckeys==set(conflict_rows),'conflict ledger scope')
    for r in conflict_ledger:
        k=(r['position'],r['locale']); p=pmap[k]; b=bmap[k]; row=lm[k]
        ok(r['primaryTarget']==p['selectedTarget'] and r['primaryTargetSha256']==sha(p['selectedTarget']),'conflict primary evidence '+str(k))
        ok(r['blindTarget']==b['proposedTarget'] and r['blindTargetSha256']==sha(b['proposedTarget']),'conflict blind evidence '+str(k))
        for f in ('resolution','resolvedTarget','resolvedTargetSha256','disposition','confidence','rationale'):
            ok(r[f]==row[f if f!='resolvedTarget' else 'resolvedTarget'] if f!='resolvedTarget' else r[f]==row['resolvedTarget'],'conflict resolved field '+str(k)+':'+f)
    # Hash-only preservation of the 12 carried holds and 240 prior selections.
    carry=jl(inp/'carry-forward-hold-hashes.jsonl'); bh=jl(blind/'carried-holds-reattestation-hash-only.jsonl'); prior=jl(blind/'prior-selections-reattestation-hash-only.jsonl')
    ok(len(carry)==len(bh)==12 and len(prior)==240,'hash-only lineage counts')
    for r in carry+bh+prior:
        ok(r.get('targetTextIncluded') is False and not any(k in r for k in ('target','targetText','currentTarget','previousTarget')),'lineage contains target text')
    carrymap={(r['position'],r['locale'],r['sourceId']):r for r in carry}
    bhmap={(r['position'],r['locale'],r['sourceId']):r for r in bh}
    for k,x in carrymap.items():
        y=bhmap.get(k); ok(y is not None,'carried hold missing reattestation '+str(k))
        ok(x['currentTargetSha256']==x['priorTargetSha256']==x['previousApplicationTargetSha256']==y['currentTargetSha256']==y['previousApplicationTargetSha256'],'carried hold hashes '+str(k))
    summary=jf(HERE/'summary.json')
    ok(summary['cellsReviewed']==240 and summary['classificationCounts']==dict(counts) and summary['changeCount']==changes==54 and summary['dispositionCounts']==dict(dispositions),'summary totals')
    ok(summary['conflictsResolved']==20 and summary['carriedHoldsHashOnly']==12 and summary['priorSelectionsHashOnly']==240,'summary lineage/conflicts')
    ok(summary['baselineProtectedLiteralFindings']==3 and summary['resolvedTokenOrProtectedLiteralFailures']==0,'summary token controls')
    ok(summary['catalogValuesApplied'] is False and summary['repoOrPRFilesChanged'] is False and summary['nativeSpeakerSignoff'] is False,'review boundary metadata')
    ok(summary['testsOrBuildsOrScansOrCIOrBrowserRun'] is False,'no test/build/browser claim')
    print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':len(ledger),'classificationCounts':dict(counts),'changeCount':changes,'dispositionCounts':dict(dispositions),'conflictsResolved':len(conflict_rows),'carriedHoldsHashOnly':len(carry),'priorSelectionsHashOnly':len(prior),'baselineProtectedLiteralFindings':findings['count'],'resolvedTokenOrProtectedLiteralFailures':0,'rootFilesVerified':len(root_sums),'primaryPacketFilesVerified':len(p_sums),'blindPacketFilesVerified':len(b_sums),'candidateInputFilesVerified':len(i_sums),'livePRState':'OPEN/DRAFT at same head/tree before and after','deploymentsForHead':0},indent=2,ensure_ascii=False))

if __name__=='__main__': verify()
