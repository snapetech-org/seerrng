#!/usr/bin/env python3
from __future__ import annotations
import collections,hashlib,json,pathlib,re,subprocess
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
CORRECTION_KEYS={(IDS['jellyfin_tip'],'fr'),(IDS['jellyfin_tip'],'ar'),(IDS['jellyfin_tip'],'id')}
REFINEMENT_KEYS={(IDS['allowed'],x) for x in ('zh_Hans','ja','ko','zh_Hant')}
REFINEMENT_KEYS|={(IDS['allowed_tip'],x) for x in LOCALES}
REFINEMENT_KEYS|={(IDS['proxy_warning'],x) for x in ('fr','ja')}
REFINEMENT_KEYS|={(IDS['restrict'],'vi')}
REFINEMENT_KEYS|={(IDS['required'],x) for x in ('es','zh_Hans','fr','pt_BR','ko','zh_Hant','id')}
REFINEMENT_KEYS|={(IDS['jellyfin_required'],'de'),(IDS['jellyfin_tip'],'de')}
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
def key(r):return (r['id'],r['locale']) if 'id' in r else (r['source_id'],r['locale'])
def git(*args):return subprocess.check_output(['git','-C',str(REPO),*args],text=True).strip()
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
def token_audit(source,target,sid):
 expected=EXPECTED_LITERALS.get(sid,{})
 actual={lit:target.count(lit) for lit in expected}
 mismatch={lit:{'expected':n,'actual':actual.get(lit,0)} for lit,n in expected.items() if actual.get(lit,0)!=n}
 nums=lambda s:re.findall(r'\d+',s)
 ph=lambda s:collections.Counter(re.findall(r'\{[^{}]+\}',s))
 tags=lambda s:collections.Counter(re.findall(r'<[^>]+>',s))
 nr=not bool(collections.Counter(nums(source))-collections.Counter(nums(target)))
 pp=ph(source)==ph(target); mt=tags(source)==tags(target)
 return {'requiredLiteralCounts':expected,'actualLiteralCounts':actual,'literalCountMismatches':mismatch,'numbersPreserved':nr,'sourceNumberRuns':nums(source),'targetNumberRuns':nums(target),'placeholdersPreserved':pp,'markupPreserved':mt,'pass':not mismatch and nr and pp and mt}
def main():
 cfp=verify_dir(CF); pp=verify_dir(PRIMARY); bp=verify_dir(BLIND); op=verify_dir(OUT)
 if git('rev-parse','HEAD')!=HEAD or git('rev-parse','HEAD^{tree}')!=TREE or git('status','--porcelain=v1','--untracked-files=all'):raise SystemExit('worktree pin/clean mismatch')
 pins=rj(OUT/'input-pins.json'); summary=rj(OUT/'summary.json'); manifest=rj(OUT/'manifest.json')
 if (pins.get('head'),pins.get('tree'),pins.get('batch'))!=(HEAD,TREE,'main-sync-eight-strings'):raise SystemExit('output input pin mismatch')
 for name,actual in [('candidate_free',cfp),('primary_review',pp),('independent_blind',bp)]:
  p=pins.get(name,{})
  if (p.get('checksumListSha256'),p.get('manifestSha256'))!=(actual['checksumListSha256'],actual['manifestSha256']):raise SystemExit('input checksum binding mismatch '+name)
 for name,src in [('candidate-free-SHA256SUMS.txt',CF/'SHA256SUMS.txt'),('primary-SHA256SUMS.txt',PRIMARY/'SHA256SUMS.txt'),('blind-SHA256SUMS.txt',BLIND/'SHA256SUMS.txt')]:
  if (OUT/name).read_bytes()!=src.read_bytes():raise SystemExit('copied checksum list mismatch '+name)
 if (OUT/'candidate-free-source-callers.jsonl').read_bytes()!=(CF/'candidate-free.jsonl').read_bytes():raise SystemExit('candidate-free source/caller copy mismatch')
 cm=rj(CF/'manifest.json'); ps=rj(PRIMARY/'primary-summary.json'); bm=rj(BLIND/'manifest.json'); blind_audit=rj(BLIND/'token-audit.json')
 if (cm.get('review_head'),cm.get('review_tree'),cm.get('source_ids'),cm.get('target_cells'),cm.get('target_missing_cells'))!=(HEAD,TREE,8,96,96):raise SystemExit('candidate-free pin/count mismatch')
 if (ps.get('review_head'),ps.get('review_tree'),ps.get('cell_count'),ps.get('dispositions'))!=(HEAD,TREE,96,{'insert-missing':96}):raise SystemExit('primary pin/count mismatch')
 if (bm.get('review_head'),bm.get('review_tree'),bm.get('cells'),bm.get('proposals'),bm.get('input_targets_absent'))!=(HEAD,TREE,96,96,96):raise SystemExit('blind pin/count mismatch')
 if any(bm.get('candidate_free_input_sha256',{}).get(n)!=sha((CF/n).read_bytes()) for n in ('README.md','manifest.json','candidate-free.jsonl','SHA256SUMS.txt')):raise SystemExit('blind/candidate-free checksum binding mismatch')
 if blind_audit.get('head')!=HEAD or blind_audit.get('tree')!=TREE or len(blind_audit.get('results',[]))!=96 or any(x.get('result')!='pass' for x in blind_audit.get('results',[])):raise SystemExit('blind token audit mismatch')
 if (summary.get('result'),summary.get('head'),summary.get('tree'),summary.get('cells'))!=('PASS',HEAD,TREE,96):raise SystemExit('summary pin mismatch')
 if (manifest.get('head'),manifest.get('tree'),manifest.get('cell_count'))!=(HEAD,TREE,96):raise SystemExit('manifest pin mismatch')
 for name,digest in manifest.get('files',{}).items():
  p=OUT/name
  if not p.is_file() or sha(p.read_bytes())!=digest:raise SystemExit('manifest hash mismatch '+name)
 actual_files={p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt')}
 if actual_files!=set(manifest.get('files',{})):raise SystemExit('manifest file inventory mismatch')
 sources=rjl(CF/'candidate-free.jsonl'); primary=rjl(PRIMARY/'primary-ledger.jsonl'); blind=rjl(BLIND/'blind-ledger.jsonl'); cross=rjl(OUT/'cross-ledger.jsonl')
 if (len(sources),len(primary),len(blind),len(cross))!=(8,96,96,96):raise SystemExit('row count mismatch')
 locale_order=cm.get('locale_order')
 if locale_order!=LOCALES:raise SystemExit('locale order mismatch')
 catalog_path=cm['source_catalog']['path']; raw_catalog=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:{catalog_path}'])
 if git('rev-parse',f'{HEAD}:{catalog_path}')!=cm['source_catalog']['git_blob']:raise SystemExit('English catalog blob mismatch')
 en=json.loads(raw_catalog.decode('utf-8'))
 if len(en)!=cm['source_catalog']['source_count']:raise SystemExit('English catalog count mismatch')
 for source in sources:
  if source.get('source_sha256')!=sha(source.get('source','')) or en.get(source['id'])!=source.get('source'):raise SystemExit('source binding mismatch '+source['id'])
  caller=source['caller']; file_raw=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:{caller["path"]}'])
  if sha(caller['context'])!=caller['context_sha256'] or caller['context'].encode('utf-8') not in file_raw:raise SystemExit('caller context mismatch '+source['id'])
  if caller['line']<1 or caller['line']>len(file_raw.decode('utf-8').splitlines()):raise SystemExit('caller line out of bounds '+source['id'])
  if set(source['target_cells'])!=set(LOCALES) or any(source['target_cells'][l].get('present') is not False for l in LOCALES):raise SystemExit('candidate target is not absent '+source['id'])
 pmap={key(x):x for x in primary}; bmap={key(x):x for x in blind}; cmap={key(x):x for x in cross}
 if any(len(m)!=96 for m in (pmap,bmap,cmap)):raise SystemExit('duplicate cell identity')
 if pmap.keys()!=bmap.keys() or pmap.keys()!=cmap.keys():raise SystemExit('cell coverage mismatch')
 order=[(s['id'],loc) for s in sources for loc in LOCALES]
 if [(x['source_id'],x['locale']) for x in cross]!=order:raise SystemExit('cross ledger order mismatch')
 counts=collections.Counter(); identical=0; literal_over=0; literal_blind_fail=0
 for source in sources:
  sid=source['id']; caller=source['caller']
  for locale in LOCALES:
   k=(sid,locale); p=pmap[k]; b=bmap[k]; x=cmap[k]
   if p.get('proposal_sha256')!=sha(p.get('proposal','')) or p.get('proposal')!=x.get('primary_proposal') or b.get('proposal')!=x.get('blind_proposal'):raise SystemExit('proposal hash/binding mismatch '+str(k))
   if (p.get('source_en'),p.get('evidence_head'),p.get('disposition'),p.get('review_state'))!=(source['source'],HEAD,'insert-missing','machine-draft'):raise SystemExit('primary evidence mismatch '+str(k))
   if (b.get('source_text'),b.get('source_sha256'),b.get('input_head'),b.get('input_tree'),b.get('caller_context_sha256'))!=(source['source'],source['source_sha256'],HEAD,TREE,caller['context_sha256']):raise SystemExit('blind evidence mismatch '+str(k))
   if b.get('target_present_at_input') is not False or b.get('old_target') is not None or b.get('disposition')!='proposal':raise SystemExit('blind target state mismatch '+str(k))
   for field,value in [('candidate_free_record_sha256',sha(json.dumps(source,ensure_ascii=False,sort_keys=True,separators=(',',':')))),('primary_record_sha256',sha(json.dumps(p,ensure_ascii=False,sort_keys=True,separators=(',',':')))),('blind_record_sha256',sha(json.dumps(b,ensure_ascii=False,sort_keys=True,separators=(',',':'))))]:
    if x.get(field)!=value:raise SystemExit('cell record hash mismatch '+str(k)+' '+field)
   pa=token_audit(source['source'],p['proposal'],sid); ba=token_audit(source['source'],b['proposal'],sid)
   if x.get('primary_token_audit')!=pa or x.get('blind_token_audit')!=ba:raise SystemExit('token audit binding mismatch '+str(k))
   if not ba['pass']:literal_blind_fail+=1
   expected=CORRECTION_KEYS if False else None
   if k in CORRECTION_KEYS:
    if x.get('cross_disposition')!='correction' or pa['literalCountMismatches'].get('Jellyfin')!={'expected':2,'actual':3} or not ba['pass']:raise SystemExit('correction disposition mismatch '+str(k))
    literal_over+=1; disposition='correction'
   elif k in REFINEMENT_KEYS:
    if x.get('cross_disposition')!='refinement' or not pa['pass'] or not ba['pass']:raise SystemExit('refinement disposition mismatch '+str(k))
    disposition='refinement'
   else:
    if x.get('cross_disposition')!='accept' or not pa['pass'] or not ba['pass']:raise SystemExit('accept disposition mismatch '+str(k))
    disposition='accept'
   if x.get('cross_rationale') is None or not x.get('confidence')=='moderate' or x.get('exact_target_selected') is not False or x.get('catalog_value_applied') is not False:raise SystemExit('cross note/selection state mismatch '+str(k))
   if any(field in x for field in ('selected_target','selected_proposal','recommended_target','chosen_variant')):raise SystemExit('cross output selected a target '+str(k))
   if x.get('target_present_at_input') is not False or x.get('cell_id')!=sid+'::'+locale:raise SystemExit('cross cell input identity mismatch '+str(k))
   same=p['proposal']==b['proposal']; identical+=int(same)
   counts[disposition]+=1
 if counts!=collections.Counter({'accept':65,'refinement':28,'correction':3}) or identical!=28 or literal_over!=3 or literal_blind_fail!=0:raise SystemExit('cross totals mismatch '+str((counts,identical,literal_over,literal_blind_fail)))
 if summary.get('cross_disposition_counts')!=dict(counts) or summary.get('primary_blind_proposal_texts_equal')!=identical or summary.get('primary_exact_literal_count_mismatch_cells')!=3 or summary.get('blind_exact_literal_count_mismatch_cells')!=0:raise SystemExit('summary totals mismatch')
 print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'cells':96,'crossDispositions':dict(counts),'identicalProposalTexts':identical,'primaryLiteralCountMismatches':literal_over,'blindLiteralCountMismatches':literal_blind_fail,'exactTargetSelected':False,'outputFilesVerified':op['fileCount'],'checksumListSha256':op['checksumListSha256']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
