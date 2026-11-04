#!/usr/bin/env python3
import argparse, hashlib, json, re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
EXPECTED_HEAD = 'a456dd66aad34cb23f432cb3c189bb8083bbbe96'
EXPECTED_TREE = '7a5447e5f08e84c392899a6e1400d1df73b1143b'
EXPECTED_WORKTREE = Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3960-3979-source')
def need(ok, msg):
    if not ok: raise SystemExit('FAIL: ' + msg)
def sha(data): return hashlib.sha256(data).hexdigest()
def j(path): return json.loads(path.read_text(encoding='utf-8'))
def jl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def git(repo, *args): return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()
def tokens(value):
    p = re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])', value)
    return {'placeholders':re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}',value),'markupTags':re.findall(r'</?[A-Za-z][^>]*>',value),'numericTokens':re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])',value),'protectedLiterals':list(dict.fromkeys(p))}
def checks(source,target):
    out={k:{'matches':source[k]==target[k],'source':source[k],'target':target[k]} for k in ('placeholders','markupTags','numericTokens')}
    missing=[x for x in source['protectedLiterals'] if x not in target['protectedLiterals']]
    out['protectedLiterals']={'matches':not missing,'source':source['protectedLiterals'],'target':target['protectedLiterals'],'missingFromTarget':missing}
    return out
parser=argparse.ArgumentParser(); parser.add_argument('--source-worktree',type=Path,default=EXPECTED_WORKTREE); args=parser.parse_args()
worktree=args.source_worktree.resolve(); need(worktree==EXPECTED_WORKTREE,'exact source worktree path')
need(git(worktree,'rev-parse','HEAD')==EXPECTED_HEAD,'source head'); need(git(worktree,'rev-parse','HEAD^{tree}')==EXPECTED_TREE,'source tree'); need(not git(worktree,'status','--porcelain'),'source worktree clean')
sums=(ROOT/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines(); listed=set()
for line in sums:
    digest,rel=line.split('  ',1); path=ROOT/rel; need(path.is_file(),'missing sealed file '+rel); need(sha(path.read_bytes())==digest,'checksum mismatch '+rel); listed.add(rel)
actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}; need(actual==listed,'packet file set differs from seal')
manifest=j(ROOT/'manifest.json'); need(manifest['head']==EXPECTED_HEAD and manifest['tree']==EXPECTED_TREE,'manifest pins')
input_root=ROOT/'candidate-free-input'; need(sha((input_root/'manifest.json').read_bytes())==manifest['candidateFreeInputManifestSha256'],'candidate-free manifest hash'); need(sha((input_root/'SHA256SUMS.txt').read_bytes())==manifest['candidateFreeInputChecksumsSha256'],'candidate-free checksum manifest hash')
result=subprocess.run([sys.executable,str(input_root/'verify-candidate-free.py'),'--source-worktree',str(worktree)],check=True,capture_output=True,text=True); input_result=json.loads(result.stdout); need(input_result['result']=='PASS','candidate-free verifier')
sources={x['position']:x for x in jl(input_root/'selected-source-cells.jsonl')}; callers={x['position']:x for x in jl(input_root/'caller-contexts.jsonl')}; current=jl(input_root/'current-target-cells.jsonl'); reviewed=jl(ROOT/'reviewed-cells.jsonl'); proposals=j(ROOT/'proposals.json'); holds=jl(ROOT/'callerless-holds-hash-only.jsonl')
need(len(current)==len(reviewed)==240,'all current cells reviewed'); need(len(proposals)==9,'proposal count'); need(not holds,'callerless hash-only holds')
cur={(x['position'],x['locale']):x for x in current}; rev={(x['position'],x['locale']):x for x in reviewed}; prop={(x['position'],x['locale']):x for x in proposals}
need(len(rev)==240 and set(cur)==set(rev),'review identity parity'); need(len(prop)==len(proposals),'proposal identity uniqueness')
counts={'keep-current':0,'propose-replacement':0,'hold-hash-only':0}
for key,row in rev.items():
    baseline=cur[key]; source=sources[key[0]]; caller=callers[key[0]]
    need(row['sourceIdSha256']==source['sourceIdSha256']==baseline['sourceIdSha256'],'source id hash '+str(key))
    need(row['sourceTextSha256']==source['sourceTextSha256']==baseline['sourceTextSha256'],'source text hash '+str(key))
    need(row['callerContextSha256']==caller['callerContextSha256']==baseline['callerContextSha256'],'caller context hash '+str(key))
    need(row['currentTargetSha256']==baseline['currentTargetSha256'] and row['currentTarget']==baseline['currentTarget'],'current target hash/text '+str(key))
    need(row['sourceText']==source['sourceText'],'source text '+str(key)); need(row['reviewTargetSha256']==sha(row['reviewTarget'].encode()),'review target hash '+str(key))
    counts[row['decision']]+=1
    if row['decision']=='keep-current':
        need(key not in prop and row['reviewTarget']==row['currentTarget'],'kept cell '+str(key))
    elif row['decision']=='propose-replacement':
        need(key in prop,'proposal missing '+str(key)); p=prop[key]
        need(row['reviewTarget']==row['proposedTarget']==p['proposedTarget'],'proposal parity '+str(key))
        computed=checks(row['sourceTokens'],tokens(row['reviewTarget']))
        need(all(v['matches'] for v in computed.values()),'proposal token preservation '+str(key))
        need(computed==row['proposedTokenChecks']==p['proposedTokenChecks'],'proposal token audit '+str(key))
    else:
        need(row['decision']=='hold-hash-only','unknown decision')
        need(not any(k in row for k in ('sourceText','currentTarget','reviewTarget','proposedTarget')),'hold includes text')
need(counts==manifest['decisionCounts']=={'keep-current':231,'propose-replacement':9,'hold-hash-only':0},'decision counts')
need(set(prop)=={k for k,v in rev.items() if v['decision']=='propose-replacement'},'proposal/disposition parity')
for name,info in manifest['priorLineageFiles'].items():
    original=input_root/name; copied=ROOT/'prior-lineage'/name
    need(original.read_bytes()==copied.read_bytes(),'lineage bytes '+name); need(sha(copied.read_bytes())==info['sha256'],'lineage hash '+name)
expected_rows={'prior-selection-hash-reattestation.jsonl':3960,'prior-applied-target-hash-reattestation.jsonl':262,'prior-hold-hash-reattestation.jsonl':50}
for name,count in expected_rows.items(): need(len(jl(ROOT/'prior-lineage'/name))==count,'lineage row count '+name)
print(json.dumps({'result':'PASS','head':EXPECTED_HEAD,'tree':EXPECTED_TREE,'sourceWorktreeClean':True,'candidateFreeInput':input_result['result'],'reviewedCells':len(reviewed),'decisionCounts':counts,'proposals':len(proposals),'callerlessHashOnlyHolds':len(holds),'priorLineageRows':expected_rows,'checksumFiles':len(listed)},ensure_ascii=False,indent=2))
