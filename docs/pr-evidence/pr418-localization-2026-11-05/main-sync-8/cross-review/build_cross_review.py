#!/usr/bin/env python3
from __future__ import annotations
import collections,hashlib,json,pathlib,re,subprocess,unicodedata
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-main-sync-independent-cross-review-20261105')
BASE=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-main-sync-20261105')
CF=BASE/'candidate-free'; PRIMARY=BASE/'primary-review'
BLIND=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-main-sync-independent-blind-20261105')
REPO=pathlib.Path('/home/keith/Documents/code/.task-worktrees/localization-20261105/seerrng-pr418-w4000-root-apply')
HEAD='ca2309e960733a7486c55b9a761d82771be97cde'; TREE='8c5df06aaf1d703ff923bf1fdf8a21c901b9d26d'
LOCALES=['es','zh_Hans','hi','de','ja','fr','pt_BR','ar','ko','zh_Hant','vi','id']
IDS={
 'allowed':'components.Settings.SettingsNetwork.administratorSignInAllowedNetworks',
 'allowed_tip':'components.Settings.SettingsNetwork.administratorSignInAllowedNetworksTip',
 'proxy_warning':'components.Settings.SettingsNetwork.administratorSignInProxyWarning',
 'restriction_tip':'components.Settings.SettingsNetwork.administratorSignInRestrictionTip',
 'restrict':'components.Settings.SettingsNetwork.restrictAdministratorSignInToNetworks',
 'required':'components.Settings.SettingsNetwork.validationAdministratorSignInNetworksRequired',
 'jellyfin_required':'components.Settings.SettingsUsers.jellyfinQuickConnectOnly',
 'jellyfin_tip':'components.Settings.SettingsUsers.jellyfinQuickConnectOnlyTip',
}
REFINEMENTS={
 (IDS['allowed'],'zh_Hans'):'Clarify that these are networks permitted for administrator use; the primary wording can read like networks owned by administrators, while the blind wording makes the relation explicit.',
 (IDS['allowed'],'ja'):'Prefer a natural phrase meaning networks permitted to administrators; the primary compound is less clear as a settings label.',
 (IDS['allowed'],'ko'):'Clarify that these are networks allowed for administrators to use rather than an “administrator network” category.',
 (IDS['allowed'],'zh_Hant'):'Clarify that these are networks permitted for administrator use rather than an “administrator network” category.',
}
for locale in LOCALES:
 REFINEMENTS[(IDS['allowed_tip'],locale)]='In this IP allowlist setting, make explicit that the saving client’s address must remain allowed. Both drafts preserve the rule, but an address-specific statement is clearer than saying the client itself remains allowed.'
REFINEMENTS.update({
 (IDS['proxy_warning'],'fr'):'The reverse-proxy trust setting is translated by meaning as requested, but “option de confiance du proxy inverse” is noun-heavy and can sound like the proxy owns the trust setting. Phrase the setting as an action to trust the reverse proxy.',
 (IDS['proxy_warning'],'ja'):'Use a natural Japanese setting label with a complete verb phrase for trusting the reverse proxy; the primary label omits する and reads more like a bare fragment.',
 (IDS['restrict'],'vi'):'Prefer wording that limits administrator sign-in to trusted networks; “trong” can read as restricting it within networks rather than to those networks.',
 (IDS['required'],'es'):'Make “network allowed for administrators” explicit; the primary “red de administradores permitida” can read as an administrator-owned network.',
 (IDS['required'],'zh_Hans'):'Make clear that the network is allowed for administrators to use, rather than naming an “administrator network” category.',
 (IDS['required'],'fr'):'Make “network allowed for administrators” explicit; “réseau d’administrateurs autorisé” can read as a network belonging to administrators.',
 (IDS['required'],'pt_BR'):'Make clear that the network is allowed for administrators to use, rather than a network belonging to administrators.',
 (IDS['required'],'ko'):'Clarify that this is a network allowed for administrators to use; the primary wording resembles an administrator-network category.',
 (IDS['required'],'zh_Hant'):'Make clear that the network is allowed for administrators to use, rather than naming an “administrator network” category.',
 (IDS['required'],'id'):'Make “network allowed for administrators” explicit; the primary “jaringan administrator yang diizinkan” can read as an administrator-owned network.',
 (IDS['jellyfin_required'],'de'):'Prefer direct wording that requires this sign-in method; voraussetzen can sound like a presupposition rather than a requirement.',
 (IDS['jellyfin_tip'],'de'):'Make plugin-based Jellyfin sign-in explicit as a method being blocked; “Jellyfin-Passwort oder -Plugin” can parse the plugin as a credential or object.',
})
CORRECTIONS={
 (IDS['jellyfin_tip'],'fr'):'The primary draft contains three exact Jellyfin occurrences where the pinned source audit requires two. Reconcile the extra occurrence while preserving the statement that password-based and plugin-based Jellyfin sign-in are blocked; no target text is selected here.',
 (IDS['jellyfin_tip'],'ar'):'The primary draft contains three exact Jellyfin occurrences where the pinned source audit requires two. Reconcile the extra occurrence while preserving the statement that password-based and plugin-based Jellyfin sign-in are blocked; no target text is selected here.',
 (IDS['jellyfin_tip'],'id'):'The primary draft contains three exact Jellyfin occurrences where the pinned source audit requires two. Reconcile the extra occurrence while preserving the statement that password-based and plugin-based Jellyfin sign-in are blocked; no target text is selected here.',
}
SOURCE_NOTES={
 IDS['allowed']:'Settings > Network label for the administrator sign-in network allowlist; both drafts name the correct setting.',
 IDS['allowed_tip']:'Settings > Network help text for entry count, address/subnet formats, line layout, character limit, examples, and the saving client staying allowed.',
 IDS['proxy_warning']:'Settings > Network warning that explains reverse-proxy trust, overwriting X-Forwarded-For, and restricting direct access to prevent address spoofing.',
 IDS['restriction_tip']:'Settings > Network description that preserves the distinction between administrator sign-in and existing sessions, regular users’ remote sign-in, and unchanged API-key integrations.',
 IDS['restrict']:'Settings > Network toggle label restricting administrator sign-in to trusted networks.',
 IDS['required']:'Validation error requiring at least one allowed network for administrator sign-in.',
 IDS['jellyfin_required']:'Settings > Users control label requiring Jellyfin Quick Connect sign-in.',
 IDS['jellyfin_tip']:'Settings > Users description allowing Quick Connect and blocking Jellyfin password and plugin sign-in.',
}
EXPECTED_LITERALS={
 IDS['allowed_tip']:{'100':2,'IPv4':1,'IPv6':1,'CIDR':1,'4096':1,'192.168.0.0/16':1,'100.64.0.0/10':1},
 IDS['proxy_warning']:{'SeerrNG':2,'X-Forwarded-For':1},
 IDS['restriction_tip']:{'API':1},
 IDS['jellyfin_required']:{'Jellyfin':1,'Quick Connect':1},
 IDS['jellyfin_tip']:{'Jellyfin':2,'Quick Connect':1},
}

def sha(v):
 if isinstance(v,str):v=v.encode('utf-8')
 return hashlib.sha256(v).hexdigest()
def canon(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def rj(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def rjl(p):return [json.loads(x) for x in pathlib.Path(p).read_text(encoding='utf-8').splitlines() if x.strip()]
def wj(p,v):pathlib.Path(p).write_text(json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
def wjl(p,rows):pathlib.Path(p).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
def k(r):return (r['id'],r['locale']) if 'id' in r else (r['source_id'],r['locale'])
def verify_dir(root):
 root=pathlib.Path(root); sums=root/'SHA256SUMS.txt'; entries={}
 for line in sums.read_text(encoding='utf-8').splitlines():
  if not line:continue
  digest,name=line.split('  ',1); p=(root/name).resolve()
  if name in entries or not p.is_relative_to(root.resolve()) or not p.is_file() or sha(p.read_bytes())!=digest:raise SystemExit('checksum failed '+str(root/name))
  entries[name]=digest
 actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p!=sums}
 if actual!=set(entries):raise SystemExit('checksum inventory mismatch '+str(root))
 manifest=root/'manifest.json'
 if not manifest.is_file() and (root/'primary-summary.json').is_file():manifest=root/'primary-summary.json'
 return {'path':str(root),'checksumListSha256':sha(sums.read_bytes()),'manifestSha256':sha(manifest.read_bytes()),'fileCount':len(entries)}
def git(*args):return subprocess.check_output(['git','-C',str(REPO),*args],text=True).strip()
def token_audit(source,target,sid):
 expected=EXPECTED_LITERALS.get(sid,{})
 actual={lit:target.count(lit) for lit in expected}
 mismatch={lit:{'expected':n,'actual':actual.get(lit,0)} for lit,n in expected.items() if actual.get(lit,0)!=n}
 numbers=lambda s:re.findall(r'\d+',s)
 placeholders=lambda s:collections.Counter(re.findall(r'\{[^{}]+\}',s))
 tags=lambda s:collections.Counter(re.findall(r'<[^>]+>',s))
 return {
  'requiredLiteralCounts':expected,'actualLiteralCounts':actual,'literalCountMismatches':mismatch,
  'numbersPreserved':not bool(collections.Counter(numbers(source))-collections.Counter(numbers(target))),'sourceNumberRuns':numbers(source),'targetNumberRuns':numbers(target),
  'placeholdersPreserved':placeholders(source)==placeholders(target),
  'markupPreserved':tags(source)==tags(target),
  'pass':not mismatch and not bool(collections.Counter(numbers(source))-collections.Counter(numbers(target))) and placeholders(source)==placeholders(target) and tags(source)==tags(target),
 }
def main():
 if not OUT.is_dir():raise SystemExit('output path missing')
 if git('rev-parse','HEAD')!=HEAD or git('rev-parse','HEAD^{tree}')!=TREE or git('status','--porcelain=v1','--untracked-files=all'):raise SystemExit('worktree pin/clean mismatch')
 cfp=verify_dir(CF); pp=verify_dir(PRIMARY); bp=verify_dir(BLIND)
 cm=rj(CF/'manifest.json'); ps=rj(PRIMARY/'primary-summary.json'); bm=rj(BLIND/'manifest.json'); ba=rj(BLIND/'token-audit.json')
 if (cm.get('review_head'),cm.get('review_tree'),cm.get('base_main'),cm.get('source_ids'),cm.get('target_cells'),cm.get('target_missing_cells'))!=(HEAD,TREE,'2dea00ff2c533831bcab973c017b72052eb30d9b',8,96,96):raise SystemExit('candidate-free pin/count mismatch')
 if ps.get('review_head')!=HEAD or ps.get('review_tree')!=TREE or ps.get('cell_count')!=96 or ps.get('dispositions')!={'insert-missing':96}:raise SystemExit('primary pin/count mismatch')
 if bm.get('review_head')!=HEAD or bm.get('review_tree')!=TREE or bm.get('cells')!=96 or bm.get('proposals')!=96 or bm.get('input_targets_absent')!=96 or bm.get('primary_packet_opened') is not False:raise SystemExit('blind pin/count mismatch')
 if ba.get('head')!=HEAD or ba.get('tree')!=TREE or ba.get('cells')!=96 or any(x.get('result')!='pass' for x in ba.get('results',[])) or len(ba.get('results',[]))!=96:raise SystemExit('blind token audit mismatch')
 sources=rjl(CF/'candidate-free.jsonl'); primary=rjl(PRIMARY/'primary-ledger.jsonl'); blind=rjl(BLIND/'blind-ledger.jsonl')
 if (len(sources),len(primary),len(blind))!=(8,96,96):raise SystemExit('input row count mismatch')
 if (OUT/'candidate-free-SHA256SUMS.txt').exists() and (OUT/'candidate-free-SHA256SUMS.txt').read_bytes()!=(CF/'SHA256SUMS.txt').read_bytes():raise SystemExit('candidate-free sums copy mismatch')
 # Validate source text against the pinned English catalog, and each caller excerpt against the exact head.
 catalog_path=cm['source_catalog']['path']; catalog_raw=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:{catalog_path}'])
 if git('rev-parse',f'{HEAD}:{catalog_path}')!=cm['source_catalog']['git_blob']:raise SystemExit('English catalog blob mismatch')
 catalog=json.loads(catalog_raw.decode('utf-8'))
 if len(catalog)!=cm['source_catalog']['source_count']:raise SystemExit('English catalog count mismatch')
 by_id={x['id']:x for x in sources}
 if len(by_id)!=8:raise SystemExit('source identity mismatch')
 for row in sources:
  if sha(row['source'])!=row['source_sha256'] or catalog.get(row['id'])!=row['source']:raise SystemExit('source string/hash mismatch '+row['id'])
  caller=row['caller']; path=caller['path']; raw=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:{path}'])
  if sha(caller['context'])!=caller['context_sha256'] or caller['context'].encode('utf-8') not in raw:raise SystemExit('caller context pin mismatch '+row['id'])
  if caller['line']<1 or caller['line']>len(raw.decode('utf-8').splitlines()):raise SystemExit('caller line invalid '+row['id'])
  cells=row['target_cells']
  if set(cells)!=set(LOCALES) or any(cells[loc].get('present') is not False for loc in LOCALES):raise SystemExit('target not absent at candidate-free input '+row['id'])
 pmap={(x['id'],x['locale']):x for x in primary}; bmap={(x['source_id'],x['locale']):x for x in blind}
 if len(pmap)!=96 or len(bmap)!=96:raise SystemExit('duplicate proposal cell')
 cross=[]; counts=collections.Counter(); action=collections.Counter(); proposal_equal=0; token_failures=0; primary_literal_mismatches=0; blind_literal_mismatches=0
 for source in sources:
  sid=source['id']; caller=source['caller']
  for locale in LOCALES:
   key=(sid,locale); p=pmap[key]; b=bmap[key]
   if p.get('evidence_head')!=HEAD or p.get('disposition')!='insert-missing' or p.get('review_state')!='machine-draft':raise SystemExit('primary cell state mismatch '+str(key))
   if (p.get('source_en'),p.get('proposal_sha256'))!=(source['source'],sha(p.get('proposal',''))):raise SystemExit('primary source/proposal hash mismatch '+str(key))
   if (b.get('input_head'),b.get('input_tree'),b.get('source_text'),b.get('source_sha256'))!=(HEAD,TREE,source['source'],source['source_sha256']):raise SystemExit('blind source pin mismatch '+str(key))
   if (b.get('caller_path'),b.get('caller_line'),b.get('caller_context_sha256'))!=(caller['path'],caller['line'],caller['context_sha256']):raise SystemExit('blind caller pin mismatch '+str(key))
   if b.get('disposition')!='proposal' or b.get('hold') is not False or b.get('target_present_at_input') is not False or b.get('old_target') is not None:raise SystemExit('blind target state mismatch '+str(key))
   if not p.get('proposal') or not b.get('proposal'):raise SystemExit('empty proposal '+str(key))
   pa=token_audit(source['source'],p['proposal'],sid); ba_cell=token_audit(source['source'],b['proposal'],sid)
   if not pa['pass']:primary_literal_mismatches+=len(pa['literalCountMismatches']) or 1
   if not ba_cell['pass']:blind_literal_mismatches+=len(ba_cell['literalCountMismatches']) or 1
   if not ba_cell['pass']:token_failures+=1
   ref=REFINEMENTS.get(key); correction=CORRECTIONS.get(key)
   if correction:
    disposition='correction'; rationale=correction
   elif ref:
    disposition='refinement'; rationale=ref+' No exact translation is selected in this cross-review.'
   else:
    disposition='accept'; rationale='Both independently drafted variants preserve the source meaning in the pinned caller context: '+SOURCE_NOTES[sid]+' All source-specific technical literals and numeric content pass for both variants.'
   # The three exact Jellyfin overcounts are the only primary token-audit failures; the blind variant preserves the required count.
   if pa['literalCountMismatches'] and key not in CORRECTIONS:raise SystemExit('unclassified primary protected-literal mismatch '+str(key))
   if key in CORRECTIONS and (pa['literalCountMismatches'].get('Jellyfin')!={'expected':2,'actual':3} or not ba_cell['pass']):raise SystemExit('correction token-evidence mismatch '+str(key))
   if key not in CORRECTIONS and not pa['pass'] and not ref:raise SystemExit('unclassified primary token mismatch '+str(key))
   if not ba_cell['pass'] and key not in CORRECTIONS:raise SystemExit('unclassified blind token mismatch '+str(key))
   same=p['proposal']==b['proposal']; proposal_equal+=int(same)
   row={
    'cell_id':sid+'::'+locale,'source_id':sid,'locale':locale,'source_text':source['source'],'source_sha256':source['source_sha256'],
    'caller_path':caller['path'],'caller_line':caller['line'],'caller_context_sha256':caller['context_sha256'],
    'candidate_free_record_sha256':sha(canon(source)),'primary_record_sha256':sha(canon(p)),'blind_record_sha256':sha(canon(b)),
    'target_present_at_input':False,'primary_disposition':p['disposition'],'primary_proposal':p['proposal'],'primary_proposal_sha256':p['proposal_sha256'],
    'blind_disposition':b['disposition'],'blind_proposal':b['proposal'],'blind_rationale':b['rationale'],'blind_uncertainties':b.get('uncertainties',[]),
    'proposal_texts_equal':same,'primary_token_audit':pa,'blind_token_audit':ba_cell,
    'cross_disposition':disposition,'cross_rationale':rationale,'exact_target_selected':False,'catalog_value_applied':False,
    'confidence':'moderate','native_speaker_approval':False,'review_only':True,
   }
   cross.append(row);counts[disposition]+=1;action[f'{p["disposition"]}|{b["disposition"]}|{disposition}']+=1
 expected=collections.Counter({'accept':65,'refinement':28,'correction':3})
 if counts!=expected or len(cross)!=96 or token_failures or primary_literal_mismatches!=3 or blind_literal_mismatches!=0:raise SystemExit(f'cross count/token mismatch {counts} token={token_failures} p={primary_literal_mismatches} b={blind_literal_mismatches}')
 # Keep candidate-free input and all checksum inventories for reproducibility.
 (OUT/'candidate-free-source-callers.jsonl').write_bytes((CF/'candidate-free.jsonl').read_bytes())
 for src,name in ((CF/'SHA256SUMS.txt','candidate-free-SHA256SUMS.txt'),(PRIMARY/'SHA256SUMS.txt','primary-SHA256SUMS.txt'),(BLIND/'SHA256SUMS.txt','blind-SHA256SUMS.txt')):(OUT/name).write_bytes(src.read_bytes())
 wjl(OUT/'cross-ledger.jsonl',cross)
 pins={
  'schema_version':1,'repository':'snapetech-org/seerrng','pull_request':418,'batch':'main-sync-eight-strings','head':HEAD,'tree':TREE,
  'candidate_free':cfp,'primary_review':pp,'independent_blind':bp,
  'source_catalog_blob':cm['source_catalog']['git_blob'],'candidate_free_rows_sha256':sha((CF/'candidate-free.jsonl').read_bytes()),
  'primary_ledger_sha256':sha((PRIMARY/'primary-ledger.jsonl').read_bytes()),'blind_ledger_sha256':sha((BLIND/'blind-ledger.jsonl').read_bytes()),
  'blind_verifier_passed':True,'candidate_free_bundled_verifier':False,'primary_bundled_verifier':False,
  'cross_verifier_rechecks_candidate_free_sources_and_callers':True,'worktree':str(REPO),'worktree_clean':True,
  'target_catalogs_read':False,'exact_target_selected':False,'catalogs_edited':False,
 }
 wj(OUT/'input-pins.json',pins)
 summary={
  'result':'PASS','artifact':'SeerrNG PR #418 main-sync independent cross-review','repository':'snapetech-org/seerrng','pull_request':418,
  'head':HEAD,'tree':TREE,'source_ids':8,'locales':12,'cells':96,'all_target_cells_missing_at_input':96,
  'cross_disposition_counts':dict(counts),'primary_blind_proposal_texts_equal':proposal_equal,'primary_blind_proposal_texts_different':96-proposal_equal,
  'primary_proposals_audited':96,'blind_proposals_audited':96,'primary_exact_literal_count_mismatch_cells':3,'blind_exact_literal_count_mismatch_cells':0,
  'numeric_placeholder_markup_failures':0,'cross_token_failure_cells':0,
  'disposition_notes':{'correction':'3 primary Jellyfin Quick Connect tip cells contain three Jellyfin occurrences where the pinned exact-literal audit expects two; reconcile the overcount without choosing a target here.','refinement':'28 cells have clarity/naturalness refinements; notes identify wording direction only, not a selected translation.'},
  'exact_target_selected':False,'catalog_value_applied':False,'native_speaker_review_performed':False,'confidence':'moderate',
  'candidate_free_checksum_pass':True,'primary_checksum_pass':True,'blind_checksum_and_verifier_pass':True,
  'candidate_free_primary_bundled_verifiers_available':False,'repository_edited':False,'tests_builds_scans_ci_browser_run':False,
 }
 wj(OUT/'summary.json',summary)
 readme=f'''# SeerrNG PR #418 main-sync independent cross-review

Pinned to head `{HEAD}` / tree `{TREE}`. This cross-review checks all 96 missing cells across eight source strings and 12 locales against the exact English source, Settings > Network / Settings > Users callers, primary drafts, and independent blind drafts. The candidate-free, primary, and blind checksum inventories passed. The blind packet verifier passed; candidate-free and primary packets do not include standalone verifier scripts, so this packet's verifier rechecks their source, caller, cell, and hash bindings.

Dispositions: 65 accept, 28 refinement, 3 correction, 0 hold. No exact translation was selected for insertion and no catalog value was applied. The 28 refinement notes address clearer network-to-administrator phrasing, the address that must remain allowed when saving the network list, and a small set of locale-specific wording issues. The three correction notes identify primary Jellyfin Quick Connect tip variants with three exact `Jellyfin` occurrences where the source-bound token audit expects two; blind variants pass that count. All 96 blind variants pass the independent technical-literal and number audit; primary has only those three occurrence-count mismatches. No placeholders, markup, or number failures remain.

Review findings preserve the distinction between administrator sign-in and existing sessions, regular users' remote sign-in, unchanged API-key integrations, proxy trust and `X-Forwarded-For`, and Jellyfin Quick Connect versus password/plugin sign-in. `Trust Reverse Proxy` is treated as a localized setting concept, not an immutable English literal.

Confidence is moderate. Native-speaker review was not performed. Verify with `python3 -B verify_cross_review.py`. No repository/catalog edits, tests, builds, scans, CI, or browser activity occurred.
'''
 (OUT/'README.md').write_text(readme,encoding='utf-8')
 files={p.relative_to(OUT).as_posix():sha(p.read_bytes()) for p in OUT.rglob('*') if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt')}
 manifest={
  'schema_version':1,'artifact':'SeerrNG PR #418 main-sync independent cross-review','repository':'snapetech-org/seerrng','pull_request':418,
  'head':HEAD,'tree':TREE,'source_ids':8,'locale_count':12,'cell_count':96,'cross_disposition_counts':dict(counts),
  'exact_target_selected':False,'catalog_value_applied':False,'files':files,
 }
 wj(OUT/'manifest.json',manifest)
 entries=[f'{sha(p.read_bytes())}  {p.relative_to(OUT).as_posix()}' for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='SHA256SUMS.txt']
 (OUT/'SHA256SUMS.txt').write_text('\n'.join(entries)+'\n',encoding='utf-8')
 print(json.dumps({'result':'SEALED','output':str(OUT),'dispositions':dict(counts),'primaryBlindSameText':proposal_equal,'primaryLiteralMismatches':primary_literal_mismatches,'blindLiteralMismatches':blind_literal_mismatches,'checksumListSha256':sha((OUT/'SHA256SUMS.txt').read_bytes())},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
