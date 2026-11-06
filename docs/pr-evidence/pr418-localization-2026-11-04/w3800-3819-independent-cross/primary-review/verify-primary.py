#!/usr/bin/env python3
import hashlib,json,re
from collections import Counter
from pathlib import Path
O=Path(__file__).resolve().parent
HEAD='154dbf7fd6b346d9c5bddf23c7c6283db9826313'; TREE='a2f00bcc40b51a5643bbeb3e52ecdfc58a5718b9'; BRANCH='codex/seerrng-localization-overhaul-20261028'; BASE='fa40534ccced75bde1125c14760514fcd5d7de4d'
LOCALES=('es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id')
def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def j(n):return json.loads((O/n).read_text(encoding='utf-8'))
def jl(n):return [json.loads(x) for x in (O/n).read_text(encoding='utf-8').splitlines() if x]
def tokens(s):return {'placeholders':re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',s),'markupTags':re.findall(r'<\/?[A-Za-z][^>]*>',s),'numericTokens':re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',s),'protectedLiterals':list(dict.fromkeys(re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt)(?![A-Za-z0-9])',s)))}
m=j('manifest.json'); assert m['head']==HEAD and m['tree']==TREE and m['range']==[3800,3819] and m['window']=='W3800-W3819' and m['cellCount']==240 and m['localeOrder']==list(LOCALES)
sums={}
for line in (O/'SHA256SUMS.txt').read_text().splitlines():d,n=line.split(None,1);sums[n.lstrip('* ')]=d
assert set(sums)=={p.name for p in O.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt'} and set(m['fileNames'])==set(sums)-{'manifest.json'}
for n,d in sums.items():assert sha((O/n).read_bytes())==d,n
for n in ('PR-attestation-before.json','PR-attestation-after.json'):
 a=j(n);p=a['pullRequest'];assert p['number']==418 and p['state']=='OPEN' and p['isDraft'] is True and p['headRefName']==BRANCH and p['headRefOid']==HEAD and p['baseRefName']=='main' and p['baseRefOid']==BASE and a['branchRef']==HEAD and a['pullRef']==HEAD and a['tree']==TREE and a['deploymentsAtExpectedShaCount']==0
for n in ('remote-refs-before.tsv','remote-refs-after.tsv'):assert all(x.split('\t')[0]==HEAD for x in (O/n).read_text().splitlines())
for n in ('deployments-before.json','deployments-after.json'):d=j(n);assert d['sha']==HEAD and d['count']==0 and not d['deployments']
att=j('candidate-free-attestation.json');assert att['head']==HEAD and att['tree']==TREE
sources=jl('selected-source-cells.jsonl');cells=jl('current-target-cells.jsonl');ctx=jl('caller-contexts.jsonl');rows=jl('primary-ledger.jsonl')
assert [x['position'] for x in sources]==list(range(3800,3820)) and len(cells)==240 and len(rows)==240 and [(x['position'],x['locale']) for x in rows]==[(p,l) for p in range(3800,3820) for l in LOCALES]
sb={x['position']:x for x in sources};cb={(x['position'],x['locale']):x for x in cells};cx={x['position']:x for x in ctx};counts=Counter();errors=Counter()
for r in rows:
 s=sb[r['position']];c=cb[(r['position'],r['locale'])];assert r['head']==HEAD and r['tree']==TREE
 for k in ('sourceId','sourceIdSha256','sourceText','sourceTextSha256'):assert r[k]==s[k]
 assert r['currentTarget']==c['currentTarget'] and r['currentTargetSha256']==c['currentTargetSha256'] and r['callerContextSha256']==cx[r['position']]['callerContextSha256']
 assert r['disposition'] in ('accept-current','refine','correct','hold') and r['confidence'] in ('high','moderate','low','unknown') and r['rationale']
 if r['disposition']=='accept-current':assert r['proposedTarget'] is None
 else:assert isinstance(r['proposedTarget'],str) and r['proposedTarget']
 st=tokens(s['sourceText']);tt=tokens(r['proposedTarget'] if r['proposedTarget'] is not None else r['currentTarget']);checks=r['tokenChecks']
 for k in ('placeholders','markupTags','numericTokens'):
  ok=st[k]==tt[k];assert checks[k]['matches']==ok
  if not ok:errors[k]+=1
 missing=[x for x in st['protectedLiterals'] if x not in tt['protectedLiterals']];assert checks['protectedLiterals']['matches']==(not missing) and checks['protectedLiterals']['missingFromTarget']==missing
 if missing:errors['protectedLiterals']+=1
 counts[r['disposition']]+=1
prior=jl('prior-selection-hash-reattestation.jsonl');holds=jl('prior-hold-hash-reattestation.jsonl');assert len(prior)==3800 and all(x['sourceIdHashMatches'] and x['sourceTextHashMatches'] for x in prior) and len(holds)==12 and all(x['priorHoldPreserved'] and x['sourceTextHashMatches'] and x['targetHashMatches'] and x['targetTextIncluded'] is False for x in holds)
s=j('summary.json');assert s['decisionCounts']==dict(counts) and s['proposalCount']==counts['correct']+counts['refine'] and not errors and s['proposedTokenMismatchCounts']=={k:0 for k in ('placeholders','markupTags','numericTokens','protectedLiterals')}
print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'window':'W3800-W3819','cells':len(rows),'decisionCounts':dict(counts),'proposals':counts['correct']+counts['refine'],'tokenErrors':dict(errors),'priorSelectionHashes':len(prior),'priorHolds':len(holds),'deployments':[0,0]},ensure_ascii=False,indent=2))
