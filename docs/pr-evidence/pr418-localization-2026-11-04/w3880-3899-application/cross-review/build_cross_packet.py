#!/usr/bin/env python3
"""Build the SeerrNG W3880-W3899 independent cross-review packet."""
import datetime, hashlib, json, re, shutil, subprocess
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent
TASK = Path('/home/keith/Documents/code/task-scratch')
CF_SRC = TASK/'seerrng-pr418-w3880-3899-primary-20261104'/'candidate-free-input'
P_SRC = TASK/'seerrng-pr418-w3880-3899-primary-20261104'/'primary-review'
B_SRC = TASK/'seerrng-pr418-w3880-3899-blind-20261104'/'decisions-packet'
WT = Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3880-3899-input')
REPO = 'snapetech-org/seerrng'
HEAD = '39d8ae36ba757532f947a9a15be22f0676e79075'
TREE = '45e3ada0f565a07c675d1d75096f4266c4ef691e'
BASE = 'fa40534ccced75bde1125c14760514fcd5d7de4d'
BRANCH = 'codex/seerrng-localization-overhaul-20261028'
WINDOW = 'W3880-W3899'

# Resolve target differences using the caller context in the candidate-free packet.
# The value chooses the exact target from either the primary or blind proposal.
MANUAL = {
    (3887, 'zh-Hans'): ('blind', 'The blind wording uses an explicit instruction and standard Chinese list punctuation while preserving the exact allowed character classes and range.'),
    (3887, 'zh-Hant'): ('blind', 'The blind wording uses consistent Traditional Chinese characters, the traditional range connector, an explicit instruction, and standard list punctuation.'),
    (3888, 'zh-Hant'): ('primary', '類型 is the standard UI equivalent for notification type here and aligns with the Simplified Chinese catalog; the source requires one notification type.'),
    (3890, 'ko'): ('blind', 'The checkbox key is embedPoster; 삽입 describes embedding the poster as the action more directly than inclusion.'),
    (3897, 'pt-BR'): ('blind', 'The field is the Gotify Application Token; Token de aplicação preserves that technical field meaning and avoids the incorrect generic access-token wording.'),
    (3899, 'ko'): ('primary', 'The caller constrains priority to a numeric 0–9 field; 우선순위 번호 restores the established priority term and names the required number.'),
    (3899, 'vi'): ('blind', 'The caller requires a numeric priority value; the blind wording names the numeric value for the priority level clearly.'),
}


def sha(b):
    if isinstance(b, str): b = b.encode('utf-8')
    return hashlib.sha256(b).hexdigest()

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]

def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)+'\n', encoding='utf-8')

def write_jsonl(path, rows):
    Path(path).write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n' for row in rows), encoding='utf-8')

def capture_live():
    pr = json.loads(subprocess.check_output(['gh','api',f'repos/{REPO}/pulls/418'], text=True))
    branch_ref = 'heads/'+pr['head']['ref'].replace('/', '%2F')
    branch = json.loads(subprocess.check_output(['gh','api',f"repos/{REPO}/git/ref/{branch_ref}"], text=True))
    pull = subprocess.check_output(['git','ls-remote',f'https://github.com/{REPO}.git','refs/pull/418/head'], text=True).strip().split()
    check_runs = json.loads(subprocess.check_output(['gh','api',f"repos/{REPO}/commits/{pr['head']['sha']}/check-runs"], text=True))['total_count']
    statuses = json.loads(subprocess.check_output(['gh','api',f"repos/{REPO}/commits/{pr['head']['sha']}/status"], text=True))
    deployments = json.loads(subprocess.check_output(['gh','api',f"repos/{REPO}/deployments?sha={pr['head']['sha']}"], text=True))
    return {
        'observedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'state': pr['state'], 'draft': pr['draft'], 'mergeable': pr['mergeable'],
        'headSha': pr['head']['sha'], 'headTree': subprocess.check_output(['git','-C',str(WT),'rev-parse','HEAD^{tree}'],text=True).strip(),
        'headRef': pr['head']['ref'], 'headRepo': pr['head']['repo']['full_name'],
        'branchSha': branch['object']['sha'], 'pullRefSha': pull[0] if pull else None,
        'baseRef': pr['base']['ref'], 'baseSha': pr['base']['sha'],
        'checkRunCount': check_runs, 'statusCount': len(statuses.get('statuses', [])),
        'statusState': statuses.get('state'), 'deploymentCount': len(deployments),
    }

def tokens(s):
    return {
        'placeholders': re.findall(r'\{[A-Za-z][A-Za-z0-9_]*\}', s),
        'markupTags': re.findall(r'</?[A-Za-z][^>]*>', s),
        'numericTokens': re.findall(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])', s),
        'protectedLiterals': list(dict.fromkeys(re.findall(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify)(?![A-Za-z0-9])', s))),
    }

if any(p.name not in ('build_cross_packet.py', 'inputs') for p in OUT.iterdir()):
    raise SystemExit('Output directory contains prior output; refusing to overwrite.')
if not (OUT/'inputs').exists():
    (OUT/'inputs').mkdir()
    for name, src in [('candidate-free-input', CF_SRC), ('primary-review', P_SRC), ('blind-review', B_SRC)]:
        shutil.copytree(src, OUT/'inputs'/name)
elif not all((OUT/'inputs'/name).is_dir() for name in ('candidate-free-input','primary-review','blind-review')):
    raise SystemExit('Copied input directory is incomplete.')

CF = OUT/'inputs'/'candidate-free-input'
P = OUT/'inputs'/'primary-review'
B = OUT/'inputs'/'blind-review'
for folder in (CF, P, B):
    subprocess.run(['sha256sum','-c','SHA256SUMS.txt'], cwd=folder, check=True, stdout=subprocess.DEVNULL)
subprocess.run(['python3','verify-candidate-free.py','--source-worktree',str(WT)], cwd=CF, check=True, stdout=subprocess.DEVNULL)
subprocess.run(['python3','verify-primary-review.py'], cwd=P, check=True, stdout=subprocess.DEVNULL)
subprocess.run(['python3','verify-blind-decisions.py','--input-dir',str(CF)], cwd=B, check=True, stdout=subprocess.DEVNULL)
if subprocess.check_output(['git','-C',str(WT),'status','--porcelain=v1','--untracked-files=all'],text=True).strip():
    raise SystemExit('Pinned source worktree is not clean.')
if subprocess.check_output(['git','-C',str(WT),'rev-parse','HEAD'],text=True).strip() != HEAD:
    raise SystemExit('Pinned source worktree HEAD mismatch.')

cf_manifest = read_json(CF/'manifest.json')
primary_rows = {(x['position'],x['locale']):x for x in read_jsonl(P/'primary-ledger.jsonl')}
blind_rows = {(x['position'],x['locale']):x for x in read_jsonl(B/'review-cells.jsonl')}
current_rows = {(x['position'],x['locale']):x for x in read_jsonl(CF/'current-target-cells.jsonl')}
sources = {x['position']:x for x in read_jsonl(CF/'selected-source-cells.jsonl')}
contexts = {x['position']:x for x in read_jsonl(CF/'caller-contexts.jsonl')}
if len(primary_rows) != 240 or len(blind_rows) != 240 or len(current_rows) != 240:
    raise SystemExit('Expected 240 rows in each review/input ledger.')
if set(primary_rows) != set(blind_rows) or set(primary_rows) != set(current_rows):
    raise SystemExit('Primary, blind, and current cell keys differ.')

cross_rows=[]; reconciliation=[]; holds=[]
counts={'keep-current':0,'select-primary-proposal':0,'select-blind-proposal':0,'select-agreed-proposal':0,'hold':0}
for key in sorted(current_rows):
    pos, loc = key
    cur = current_rows[key]; src = sources[pos]; ctx = contexts[pos]
    p = primary_rows[key]; b = blind_rows[key]
    if not (p['sourceId']==b['sourceId']==src['sourceId'] and p['sourceText']==b['sourceText']==src['sourceText']):
        raise SystemExit(f'Source mismatch at {key}.')
    if not (p['currentTargetSha256']==b['currentTargetSha256']==cur['currentTargetSha256'] and p['callerContextSha256']==b['callerContextSha256']==cur['callerContextSha256']==ctx['callerContextSha256']):
        raise SystemExit(f'Current target/caller hash mismatch at {key}.')
    pp = p['reviewedTarget'] if p['disposition'] in ('correction','refinement') else None
    bp = b['proposal'] if b['decision']=='propose' else None
    if pp is not None and sha(pp) != p['reviewedTargetSha256']:
        raise SystemExit(f'Primary proposal hash mismatch at {key}.')
    selected_sources=[]
    rationale=''
    if b['decision']=='hold':
        decision='hold'; target=cur['currentTarget']
        rationale='The blind review found that caller context does not resolve whether “Agent” is a product term or functional label. Preserve the current value pending a terminology decision.'
        holds.append({'window':WINDOW,'position':pos,'locale':loc,'sourceId':src['sourceId'],'sourceTextSha256':src['sourceTextSha256'],'currentTargetSha256':cur['currentTargetSha256'],'callerContextSha256':ctx['callerContextSha256'],'reason':rationale,'hashOnly':True})
    elif pp is not None and bp is not None and pp == bp:
        decision='select-agreed-proposal'; target=pp; selected_sources=['primary','blind']
        rationale='Both independent reviews selected the same exact target; the cross review confirms its meaning in caller context and token integrity.'
    elif pp is not None and bp is not None:
        source, rationale = MANUAL[key]
        target = pp if source=='primary' else bp
        decision='select-primary-proposal' if source=='primary' else 'select-blind-proposal'
        selected_sources=[source]
    elif pp is not None:
        decision='select-primary-proposal'; target=pp; selected_sources=['primary']
        rationale='The blind review retained current wording; the cross review confirms the exact primary correction/refinement is clearer in the pinned caller context.'
    elif bp is not None:
        decision='select-blind-proposal'; target=bp; selected_sources=['blind']
        rationale='The primary review retained current wording; the cross review confirms the exact blind proposal corrects or clarifies the source meaning in the pinned caller context.'
    else:
        decision='keep-current'; target=cur['currentTarget']
        rationale='Retain the exact current target; both independent reviews keep it and the cross review found no caller-context issue.'
    if key in MANUAL and not (pp is not None and bp is not None and pp != bp):
        raise SystemExit(f'Manual conflict entry did not resolve differing proposals at {key}.')
    counts[decision]+=1
    src_tokens=tokens(src['sourceText']); out_tokens=tokens(target)
    baseline=(pos==3888 and loc=='ja')
    mismatch={name:(Counter(src_tokens[name])==Counter(out_tokens[name])) for name in ('placeholders','markupTags','numericTokens','protectedLiterals')}
    if not all(mismatch.values()) and not (baseline and mismatch['placeholders'] and mismatch['markupTags'] and mismatch['protectedLiterals'] and target==cur['currentTarget']):
        raise SystemExit(f'Selected target token mismatch at {key}: {mismatch}')
    row={
        'schemaVersion':1,'window':WINDOW,'position':pos,'locale':loc,
        'sourceId':src['sourceId'],'sourceIdSha256':src['sourceIdSha256'],'sourceText':src['sourceText'],'sourceTextSha256':src['sourceTextSha256'],
        'currentTarget':cur['currentTarget'],'currentTargetSha256':cur['currentTargetSha256'],'callerContextSha256':ctx['callerContextSha256'],
        'primaryDisposition':p['disposition'],'primaryTarget':pp,'primaryTargetSha256':sha(pp) if pp is not None else None,'primaryRationale':p['rationale'],
        'blindDecision':b['decision'],'blindTarget':bp,'blindTargetSha256':sha(bp) if bp is not None else None,'blindRationale':b['rationale'],
        'crossDecision':decision,'decision':decision,'hold':decision=='hold','selectedTarget':target,'selectedTargetSha256':sha(target),'selectedProposalSources':selected_sources,
        'crossRationale':rationale,'tokenIntegrity':{'source':src_tokens,'selected':out_tokens,'matches':mismatch,'acceptedBaselineJapaneseOneAs1':baseline},
    }
    cross_rows.append(row)
    if pp is not None or bp is not None or b['decision']=='hold':
        reconciliation.append({
            'window':WINDOW,'position':pos,'locale':loc,'sourceId':src['sourceId'],
            'currentTargetSha256':cur['currentTargetSha256'],'primaryDisposition':p['disposition'],
            'primaryTarget':pp,'primaryTargetSha256':sha(pp) if pp is not None else None,
            'blindDecision':b['decision'],'blindTarget':bp,'blindTargetSha256':sha(bp) if bp is not None else None,
            'status':'held' if decision=='hold' else ('same-target' if pp is not None and bp is not None and pp==bp else ('different-targets' if pp is not None and bp is not None else 'single-proposal')),
            'crossDecision':decision,'selectedProposalSources':selected_sources,
            'selectedTargetSha256':sha(target),'resolutionRationale':rationale,
        })

if counts != {'keep-current':207,'select-primary-proposal':13,'select-blind-proposal':9,'select-agreed-proposal':7,'hold':4}:
    raise SystemExit(f'Unexpected cross decision counts: {counts}')
if len(holds)!=4 or len(reconciliation)!=33:
    raise SystemExit(f'Unexpected hold/reconciliation counts: {len(holds)}, {len(reconciliation)}')
write_jsonl(OUT/'cross-ledger.jsonl',cross_rows)
write_jsonl(OUT/'proposal-reconciliation.jsonl',reconciliation)
write_jsonl(OUT/'holds.jsonl',holds)
write_jsonl(OUT/'prior-holds-preserved.jsonl',read_jsonl(CF/'prior-hold-hash-reattestation.jsonl'))
write_json(OUT/'input-verifier-results.json',{
    'candidateFree':'PASS','primaryReview':'PASS','blindReview':'PASS','sourceWorktreeClean':True,
    'sourceWorktreeHead':HEAD,'sourceWorktreeTree':TREE,
    'candidateFreeManifestSha256':sha((CF/'SHA256SUMS.txt').read_bytes()),
    'primaryManifestSha256':sha((P/'SHA256SUMS.txt').read_bytes()),
    'blindManifestSha256':sha((B/'SHA256SUMS.txt').read_bytes()),
})
write_json(OUT/'live-pr-before.json',capture_live())
# The final readback will be captured after cross-ledger generation.
write_json(OUT/'summary.json',{
    'schemaVersion':1,'artifact':'SeerrNG PR #418 W3880-W3899 independent cross review','repository':REPO,'pullRequest':418,
    'window':WINDOW,'head':HEAD,'tree':TREE,'baseRef':'main','baseSha':BASE,
    'sourceCount':20,'localeCount':12,'cells':240,'primaryProposals':29,'blindProposals':18,'blindHolds':4,
    'proposalReconciliationCells':33,'decisionCounts':counts,'selectedUpdates':29,'priorHashOnlyHoldsPreserved':14,
    'newHashOnlyHolds':4,'selectedTargetTokenMismatches':0,'baselineJapaneseOneAs1':1,
    'confidence':'moderate','applicationPerformed':False,'browserReview':False,'nativeSpeakerApproval':False,
    'checkRuns':0,'statuses':0,'deployments':0,
})
write_json(OUT/'live-pr-after.json',capture_live())

before=read_json(OUT/'live-pr-before.json'); after=read_json(OUT/'live-pr-after.json')
for state in (before,after):
    if state['headSha']!=HEAD or state['headTree']!=TREE or state['branchSha']!=HEAD or state['pullRefSha']!=HEAD:
        raise SystemExit('Live PR/branch/pull-ref head mismatch.')
    if state['state']!='open' or state['draft'] is not True or state['checkRunCount']!=0 or state['statusCount']!=0 or state['deploymentCount']!=0:
        raise SystemExit('Unexpected live PR/check/deployment state.')
if before['headSha']!=after['headSha'] or before['baseSha']!=after['baseSha']:
    raise SystemExit('Live PR changed during cross review.')

readme=f'''# SeerrNG PR #418 W3880–W3899 independent cross review\n\nThis static cross review reconciles 240 cells from the candidate-free, primary, and clean blind packets at exact PR head `{HEAD}`, tree `{TREE}`, targeting `main` at `{BASE}`. The primary and blind review packets and candidate-free input are copied under `inputs/` with their original checksums.\n\n## Decisions\n\n- 207 current targets retained.\n- 29 exact targets selected: 13 primary proposals, 9 blind proposals, and 7 exact agreements. Seven different-target disagreements were adjudicated (2 to primary, 5 to blind).\n- Four `Enable Agent` translations remain hash-only holds in Arabic, Vietnamese, Simplified Chinese, and Traditional Chinese because the pinned checkbox caller does not determine whether Agent is a product term or a functional label.\n- The 14 prior hash-only holds remain preserved.\n- Traditional Chinese uses `通知類型` for notification type; Gotify `embedPoster` uses the exact blind Korean action `포스터 삽입`; the Application Token label uses `Token de aplicação`; numeric Gotify priority messages use caller-backed numeric wording.\n- The Japanese `1つ` rendering of English “at least one” is an accepted baseline numeric diagnostic; no selected proposal has placeholder, markup, numeric, or protected-literal mismatch.\n\n## Verification and scope\n\nCandidate-free, primary, and blind packet verifiers pass at the pinned head; before/after live PR API, branch API, and HTTPS pull-ref snapshots match the exact head, with zero check runs, statuses, and deployments. Run `python3 verify_cross_review.py` here for portable structural and checksum verification.\n\nThis is a machine semantic cross review with moderate confidence. It does not claim native-speaker or headed-browser approval. No source, catalog, PR, workflow, test, build, scan, CI, release, tag, or merge change was made.\n'''
(OUT/'README.md').write_text(readme,encoding='utf-8')

# Include the builder/verifier source files in the root checksum manifest.
verify='''#!/usr/bin/env python3\nimport hashlib,json,re,subprocess\nfrom collections import Counter\nfrom pathlib import Path\nR=Path(__file__).resolve().parent\ndef sha(b): return hashlib.sha256(b).hexdigest()\ndef jl(p): return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x]\ndef req(ok,msg):\n if not ok: raise SystemExit("FAIL: "+msg)\ndef tokens(s): return {"placeholders":re.findall(r"\\{[A-Za-z][A-Za-z0-9_]*\\}",s),"markupTags":re.findall(r"</?[A-Za-z][^>]*>",s),"numericTokens":re.findall(r"(?<![A-Za-z])\\d+(?:[.,]\\d+)?%?(?![A-Za-z])",s),"protectedLiterals":list(dict.fromkeys(re.findall(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify)(?![A-Za-z0-9])",s)))}\n# Verify root and nested packet manifests.\nfor d in [R,R/"inputs/candidate-free-input",R/"inputs/primary-review",R/"inputs/blind-review"]:\n subprocess.run(["sha256sum","-c","SHA256SUMS.txt"],cwd=d,check=True,stdout=subprocess.DEVNULL)\nCF=R/"inputs/candidate-free-input"; P=R/"inputs/primary-review"; B=R/"inputs/blind-review"\ncf=json.loads((CF/"manifest.json").read_text(encoding="utf-8")); pm=json.loads((P/"manifest.json").read_text(encoding="utf-8")); bp=json.loads((B/"review_packet.json").read_text(encoding="utf-8"))\nreq(cf["head"]==pm["head"]==bp["head"]=="39d8ae36ba757532f947a9a15be22f0676e79075" and cf["tree"]==pm["tree"]==bp["tree"]=="45e3ada0f565a07c675d1d75096f4266c4ef691e","input pin")\ncur={(x["position"],x["locale"]):x for x in jl(CF/"current-target-cells.jsonl")}; src={x["position"]:x for x in jl(CF/"selected-source-cells.jsonl")}; ctx={x["position"]:x for x in jl(CF/"caller-contexts.jsonl")}\np={(x["position"],x["locale"]):x for x in jl(P/"primary-ledger.jsonl")}; b={(x["position"],x["locale"]):x for x in jl(B/"review-cells.jsonl")}; rows=jl(R/"cross-ledger.jsonl")\nreq(len(rows)==240 and len({(x["position"],x["locale"]) for x in rows})==240,"ledger coverage")\ncounts={"keep-current":0,"select-primary-proposal":0,"select-blind-proposal":0,"select-agreed-proposal":0,"hold":0}\nfor x in rows:\n k=(x["position"],x["locale"]); c=cur[k]; s=src[k[0]]; pr=p[k]; br=b[k]\n req(x["sourceId"]==s["sourceId"]==pr["sourceId"]==br["sourceId"] and x["sourceTextSha256"]==s["sourceTextSha256"]==pr["sourceTextSha256"]==br["sourceTextSha256"],"source binding "+str(k))\n req(x["currentTargetSha256"]==c["currentTargetSha256"]==pr["currentTargetSha256"]==br["currentTargetSha256"] and x["callerContextSha256"]==c["callerContextSha256"]==ctx[k[0]]["callerContextSha256"],"current/caller binding "+str(k))\n req(x["primaryDisposition"]==pr["disposition"] and x["blindDecision"]==br["decision"] and x["decision"]==x["crossDecision"] and x["hold"]==(x["crossDecision"]=="hold"),"review disposition "+str(k))\n pt=pr["reviewedTarget"] if pr["disposition"] in ("correction","refinement") else None; bt=br["proposal"] if br["decision"]=="propose" else None\n req(x["primaryTarget"]==pt and x["blindTarget"]==bt,"proposal binding "+str(k))\n target=x["selectedTarget"]; req(x["selectedTargetSha256"]==sha(target),"selected target hash "+str(k))\n if x["crossDecision"] in ("keep-current","hold"): req(target==c["currentTarget"],"current target retention "+str(k))\n else: req(target in [v for v in (pt,bt) if v is not None],"selected proposal source "+str(k))\n counts[x["crossDecision"]]+=1\n st=tokens(s["sourceText"]); tt=tokens(target); base=(k==(3888,"ja"))\n for name in ("placeholders","markupTags","numericTokens","protectedLiterals"):\n  req(x["tokenIntegrity"]["source"][name]==st[name] and x["tokenIntegrity"]["selected"][name]==tt[name],"token evidence "+name+" "+str(k))\n  if Counter(st[name])!=Counter(tt[name]): req(base and name=="numericTokens" and target==c["currentTarget"],"token mismatch "+name+" "+str(k))\nreq(counts=={"keep-current":207,"select-primary-proposal":13,"select-blind-proposal":9,"select-agreed-proposal":7,"hold":4},"decision counts")\nreq(len(jl(R/"holds.jsonl"))==4 and len(jl(R/"prior-holds-preserved.jsonl"))==14,"hold continuity")\nrec=jl(R/"proposal-reconciliation.jsonl"); req(len(rec)==33,"proposal reconciliation coverage")\nfor name in ("live-pr-before.json","live-pr-after.json"):\n v=json.loads((R/name).read_text(encoding="utf-8")); req(v["headSha"]==v["branchSha"]==v["pullRefSha"]==cf["head"] and v["headTree"]==cf["tree"] and v["state"]=="open" and v["draft"] is True and v["checkRunCount"]==0 and v["statusCount"]==0 and v["deploymentCount"]==0,"live PR snapshot")\nprint(json.dumps({"result":"PASS","cells":240,"decisions":counts,"priorHoldsPreserved":14,"baselineJapaneseOneAs1":1},sort_keys=True))\n'''
(OUT/'verify_cross_review.py').write_text(verify,encoding='utf-8')

# Root checksum covers every packet file, including nested checksum manifests.
files=sorted(p for p in OUT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}\n' for p in files),encoding='utf-8')
print(json.dumps({'result':'BUILT','output':str(OUT),'files':len(files),'cells':len(cross_rows),'counts':counts,'reconciliationCells':len(reconciliation),'holds':len(holds)},sort_keys=True))
