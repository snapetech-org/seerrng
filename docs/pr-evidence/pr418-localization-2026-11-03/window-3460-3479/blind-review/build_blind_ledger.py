import json, pathlib, hashlib, re, collections, subprocess, unicodedata
INPUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3460-3479-candidate-20261103/candidate-free-input')
OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w3460-3479-blind-20261103')
assert OUT.exists() and {x.name for x in OUT.iterdir()}=={'build_blind_ledger.py'}, 'Only this task-owned builder may exist before generation.'
def read_jsonl(path): return [json.loads(s) for s in path.read_text(encoding='utf-8').splitlines() if s.strip()]
def H(value): return hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()
def key(position,locale): return position,locale
# Validate only the pinned candidate-free packet; no other review artifacts are read.
check=subprocess.run(['sha256sum','-c','SHA256SUMS.txt'],cwd=INPUT,text=True,capture_output=True)
assert check.returncode==0,(check.stdout,check.stderr)
att=json.loads((INPUT/'PR-attestation.json').read_text())
window=json.loads((INPUT/'window.json').read_text())
assert att['repository']=='snapetech-org/seerrng' and att['pullRequest']==418
assert att['head']=='76fd466ba7e44ed9853115f8fb1f8ab8bec93c8e'
assert att['headTree']=='00a72de46a40df893a24e0a93e85ec505e035a2d' and att['pinsAgree']
assert window['candidateFreeInputOnly'] and not window['semanticReviewDecisionsIncluded'] and not window['proposedTranslationsIncluded']
assert window['head']==att['head'] and window['tree']==att['headTree']
sources=read_jsonl(INPUT/'source-cells.jsonl')
cells=read_jsonl(INPUT/'current-target-cells.jsonl')
contexts=read_jsonl(INPUT/'caller-contexts.jsonl')
blocks=read_jsonl(INPUT/'caller-context-blocks.jsonl')
blockmap={b['contextId']:b for b in blocks}
locale_order=window['localeOrder']
assert len(sources)==20 and len(cells)==240 and len(contexts)==20 and len(blocks)==47
assert [s['position'] for s in sources]==list(range(3460,3480))
assert len({s['sourceId'] for s in sources})==20
assert all(s['head']==att['head'] and s['tree']==att['headTree'] for s in sources)
source_map={s['sourceId']:s for s in sources}
ctxmap={c['sourceId']:c for c in contexts}
cellmap={(c['sourceId'],c['locale']):c for c in cells}
assert len(cellmap)==240
expected_locales=set(locale_order)
for src in sources:
    relevant=[c for c in cells if c['sourceId']==src['sourceId']]
    assert len(relevant)==12 and {c['locale'] for c in relevant}==expected_locales
    assert all(c['source']==src['source'] and c['sourceSha256']==src['sourceSha256'] for c in relevant)
# Verify the exact source and caller-context packet pins, namespaces, block ids, and excerpt hashes.
for c in contexts:
    src=source_map[c['sourceId']]
    assert c['head']==att['head'] and c['tree']==att['headTree']
    assert c['sourceSha256']==src['sourceSha256']
    assert c['namespace']=='.'.join(c['sourceId'].split('.')[:-1])
    assert c['callerCount']==len(c['directMessageReferences']) and c['callerCount']>0
    assert all(bid in blockmap for bid in c['contextBlockIds'])
    for ref in c['directMessageReferences']:
        assert H(ref['text'])==ref['lineSha256']
        related=[blockmap[bid] for bid in c['contextBlockIds'] if blockmap[bid]['path']==ref['path']]
        assert any(any(line['line']==ref['line'] and line['text']==ref['text'] and line['lineSha256']==ref['lineSha256'] for line in b['lines']) for b in related)
for block in blocks:
    assert block['sourceKeys'] and block['path']
    assert all(H(line['text'])==line['lineSha256'] for line in block['lines'])
# Independent dispositions. All other cells are accepted as currently translated.
edits={}
def change(pos,loc,disp,target,why,confidence='moderate'):
    edits[key(pos,loc)]={'disposition':disp,'target':target,'rationale':why,'confidence':confidence}
change(3466,'es','correction','Restablecimiento de contraseña','The source is a password-reset page title. Reinicio can mean restarting; restablecimiento is the standard account-credential reset term.')
change(3467,'id','correction','Tautan pengaturan ulang kata sandi akan dikirim ke alamat surel yang diberikan jika alamat tersebut terkait dengan pengguna yang valid.','The current Taut ulang sandi is unclear and does not cleanly express “password reset link.” This states that the link is sent only when the supplied address is associated with a valid user, preserving the source condition.')
change(3468,'es','correction','Restablece tu contraseña','The current Reiniciar contraseña can mean restart a password. The reset-password page heading calls for restablecer.')
change(3468,'pt_BR','correction','Redefina sua senha','The caller is the reset-password page heading. Alterar means change; redefinir preserves the reset action.')
change(3468,'id','refinement','Atur ulang kata sandi Anda','The current code-switches to Reset. This localizes the action while retaining the direct address and reset meaning.')
change(3469,'es','correction','¡Contraseña restablecida con éxito!','The caller reports successful password reset. Reiniciada can mean restarted; restablecida expresses the credential reset.')
change(3469,'id','refinement','Kata sandi berhasil diatur ulang!','The current code-switches to Reset; this localizes the successful reset message.')
change(3471,'es','correction','Las contraseñas deben coincidir','The caller validates the confirmation field against the password field. The current singular target does not state that both entered passwords must match.')
change(3471,'vi','correction','Hai mật khẩu phải khớp nhau','The caller compares the confirmation value with the original password. The current singular wording leaves the comparison implicit; this explicitly says both passwords must match.')
change(3471,'id','refinement','Kedua kata sandi harus sama','The caller compares two fields. This makes the “both passwords” meaning explicit, while the current singular wording relies on context.')
change(3472,'ko','correction','비밀번호가 너무 짧습니다. 8자 이상이어야 합니다.','The validation caller enforces eight characters. 8자리 can be read as an eight-digit value; 8자 unambiguously counts characters.')
change(3479,'zh_Hans','correction','已在库中','The exact caller shows a game availability state in SoftwarePreview. The current 图书馆 suggests a physical library; 库 expresses an item already present in the app’s collection without assuming a specific library type.')
change(3479,'zh_Hant','correction','已在庫中','The exact caller shows a game availability state in SoftwarePreview. The current 圖書館 suggests a physical library; 庫 expresses an item already present in the app’s collection without assuming a specific library type.')
caller_summaries={
 'components.Requests.year':'Conditional Requests row label: used for adult items where the row otherwise shows issue or release-date text.',
 'components.ResetPassword.confirmpassword':'Label for the confirmation-password field.',
 'components.ResetPassword.email':'Email-address field label.',
 'components.ResetPassword.emailresetlink':'Button for requesting a password recovery link by email.',
 'components.ResetPassword.gobacklogin':'Links back to /login from password-reset views.',
 'components.ResetPassword.password':'Password field label.',
 'components.ResetPassword.passwordreset':'Page title on the password-reset route.',
 'components.ResetPassword.requestresetlinksuccessmessage':'Success copy after requesting a reset link; source condition mentions a valid associated user.',
 'components.ResetPassword.resetpassword':'Heading on the password-reset page.',
 'components.ResetPassword.resetpasswordsuccessmessage':'Success copy after a password reset.',
 'components.ResetPassword.validationemailrequired':'Required email validation; caller also checks email format.',
 'components.ResetPassword.validationpasswordmatch':'Confirmation field is required and compared with the password value.',
 'components.ResetPassword.validationpasswordminchars':'Password minimum-length validation; exact caller threshold is 8.',
 'components.ResetPassword.validationpasswordrequired':'Required password validation.',
 'components.Search.ContextualFilters.keywordSearch':'Label next to the keyword input in contextual search.',
 'components.Search.ContextualFilters.searchAll':'Category “all” renders the keyword-search field.',
 'components.Search.ContextualFilters.searchAuthors':'Author category label in contextual search.',
 'components.Search.ContextualFilters.searchComics':'Comic category filter label in contextual search.',
 'components.Search.ContextualFilters.searchMagazines':'Magazine category filter label in contextual search.',
 'components.Search.SoftwarePreview.available':'Shown when game.availability is available; status means already in the application library.'
}
assert len(edits)==13
rows=[]
def placeholders(s): return re.findall(r'\{[A-Za-z_][A-Za-z0-9_]*\}',s)
def tags(s): return re.findall(r'<\s*/?\s*[A-Za-z][^>]*>',s)
def number_values(s):
    # Normalize Unicode decimal digits and common Chinese numeral 八, the spelling used for 8 characters.
    vals=[]
    for token in re.findall(r'\d+',s):
        try: vals.append(''.join(str(unicodedata.digit(ch)) for ch in token))
        except (TypeError,ValueError): vals.append(token)
    if not vals and '八' in s: vals.append('8')
    return vals
for cell in sorted(cells,key=lambda x:(x['position'],locale_order.index(x['locale']))):
    src=source_map[cell['sourceId']]
    ctx=ctxmap[cell['sourceId']]
    assert cell['position']==src['position'] and cell['sourceIdSha256']==src['sourceIdSha256']
    assert cell['head']==att['head'] and cell['tree']==att['headTree'] and cell['pullRequest']==418
    assert H(src['source'])==src['sourceSha256']==cell['sourceSha256']
    assert H(cell['currentTarget'])==cell['currentTargetSha256']
    assert cell['localeTag'] in {x['tag'] for x in window['localeInfo'] if x['catalogKey']==cell['locale']}
    k=key(cell['position'],cell['locale'])
    selected=edits[k]['target'] if k in edits else cell['currentTarget']
    disp=edits[k]['disposition'] if k in edits else 'accept-current'
    rationale=edits[k]['rationale'] if k in edits else ('The current target conveys the source meaning in the exact same-namespace caller context; no semantic change is needed.')
    confidence=edits[k]['confidence'] if k in edits else 'moderate'
    source_ph=placeholders(src['source']); target_ph=placeholders(selected)
    source_tags=tags(src['source']); target_tags=tags(selected)
    source_nums=number_values(src['source']); target_nums=number_values(selected)
    # No non-localizable brands or product names appear in this window. Numeric meaning is checked separately.
    required_literals=[]
    checkrow={
      'sourceHashVerified':H(src['source'])==src['sourceSha256'],
      'currentTargetHashVerified':H(cell['currentTarget'])==cell['currentTargetSha256'],
      'selectedTargetHashComputed':H(selected)==hashlib.sha256(selected.encode('utf-8')).hexdigest(),
      'placeholderMultisetParity':collections.Counter(source_ph)==collections.Counter(target_ph),
      'markupSequenceParity':source_tags==target_tags,
      'numericValueParity':source_nums==target_nums,
      'protectedLiteralsPresent':all(t in selected for t in required_literals),
      'edgeWhitespaceParity':(len(src['source'])-len(src['source'].lstrip()),len(src['source'])-len(src['source'].rstrip()))==(len(selected)-len(selected.lstrip()),len(selected)-len(selected.rstrip()))
    }
    assert all(checkrow.values()),(cell['position'],cell['locale'],checkrow,source_ph,target_ph,source_nums,target_nums)
    assert cell['sourcePlaceholders']==source_ph
    assert cell['currentTargetPlaceholders']==placeholders(cell['currentTarget'])
    assert cell['placeholderTokenSetMatchesSource']==(collections.Counter(source_ph)==collections.Counter(placeholders(cell['currentTarget'])))
    # Exact context excerpt metadata is copied from the candidate-free packet, not resolved from repository files.
    ctx_blocks=[blockmap[bid] for bid in ctx['contextBlockIds']]
    caller_excerpts=[]
    for ref in ctx['directMessageReferences']:
        caller_excerpts.append({'path':ref['path'],'line':ref['line'],'text':ref['text'],'lineSha256':ref['lineSha256']})
    rows.append({
      'schemaVersion':1,'reviewType':'independent-blind-semantic',
      'repository':'snapetech-org/seerrng','pullRequest':418,
      'head':att['head'],'tree':att['headTree'],'window':'W3460-W3479',
      'position':cell['position'],'sourceId':cell['sourceId'],'sourceKey':src['sourceKey'],
      'locale':cell['locale'],'localeTag':cell['localeTag'],
      'source':src['source'],'sourceSha256':src['sourceSha256'],
      'currentTarget':cell['currentTarget'],'currentTargetSha256':cell['currentTargetSha256'],
      'selectedTarget':selected,'selectedTargetSha256':H(selected),
      'disposition':disp,'rationale':rationale,'confidence':confidence,
      'callerContext':{'namespace':ctx['namespace'],'callerResolution':ctx['callerResolution'],'callerCount':ctx['callerCount'],'contextBlockIds':ctx['contextBlockIds'],'definitionFiles':ctx['definitionFiles'],'directReferences':caller_excerpts,'summary':caller_summaries[src['sourceId']]},
      'sourcePlaceholders':source_ph,'selectedTargetPlaceholders':target_ph,
      'sourceMarkupTags':source_tags,'selectedTargetMarkupTags':target_tags,
      'sourceNumericValues':source_nums,'selectedTargetNumericValues':target_nums,
      'protectedLiteralsRequired':required_literals,'protectedLiteralChecks':{},
      'integrityChecks':checkrow,'holdReason':None,'nativeSpeakerApproved':False
    })
counts=collections.Counter(r['disposition'] for r in rows)
assert len(rows)==240 and counts==collections.Counter({'accept-current':227,'correction':10,'refinement':3})
assert all(r['disposition']!='hold' or r['holdReason'] for r in rows)
ledger_path=OUT/'blind-decisions.jsonl'
ledger_path.write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
# Pin exact candidate-free inputs by path, size, and checksum.
input_files=[]
for line in (INPUT/'SHA256SUMS.txt').read_text().splitlines():
    h,name=line.split(None,1); name=name.lstrip('* ')
    f=INPUT/name
    input_files.append({'path':str(f),'bytes':f.stat().st_size,'sha256':H(f.read_bytes()),'manifestSha256':h})
    assert H(f.read_bytes())==h
provenance={
 'artifact':'SeerrNG PR #418 W3460-W3479 independent blind semantic review',
 'inputDirectory':str(INPUT),'inputOnly':True,
 'inputFiles':input_files,'head':att['head'],'tree':att['headTree'],
 'sourceCount':len(sources),'cellCount':len(rows),'localeOrder':locale_order,
 'callerCountTotal':sum(c['callerCount'] for c in contexts),
 'callerContextBlocks':len(blocks),
 'reviewMethod':'Use only source strings, current locale targets, placeholder data, and same-namespace caller/context blocks from the candidate-free packet. No other review outputs or repository files were inspected.',
 'protectedLiteralPolicy':'This window has no opaque brands/product literals in the English source strings. The numeric minimum of 8 is checked as a numeric value; Chinese 八 is accepted as the equivalent value.',
 'scopeLimit':'Machine blind semantic review only; no qualified native-speaker approval is claimed.'
}
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary={
 'artifact':'SeerrNG PR #418 W3460-W3479 independent blind semantic review',
 'repository':'snapetech-org/seerrng','pullRequest':418,
 'head':att['head'],'tree':att['headTree'],'sourceCount':20,'localeCount':12,'cellCount':240,
 'dispositionCounts':dict(counts),'selectedTargetChanges':sum(r['selectedTarget']!=r['currentTarget'] for r in rows),
 'placeholderFailures':sum(not r['integrityChecks']['placeholderMultisetParity'] for r in rows),
 'markupFailures':sum(not r['integrityChecks']['markupSequenceParity'] for r in rows),
 'numericFailures':sum(not r['integrityChecks']['numericValueParity'] for r in rows),
 'protectedLiteralFailures':sum(not r['integrityChecks']['protectedLiteralsPresent'] for r in rows),
 'callerlessSources':sum(c['callerCount']==0 for c in contexts),
 'nativeSpeakerApproval':False,'allIntegrityChecksPassed':all(all(r['integrityChecks'].values()) for r in rows)
}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# SeerrNG PR #418 W3460–W3479 blind semantic review','',
f'- Pinned input head/tree: `{att["head"]}` / `{att["headTree"]}`.',
'- Reviewed only the candidate-free input packet and its exact source, locale, placeholder, and same-namespace caller context.',
'- Scope: 20 source strings × 12 locales = 240 cells.',
f'- Dispositions: {counts["accept-current"]} accept-current, {counts["correction"]} corrections, {counts["refinement"]} refinements, {counts["hold"]} holds.',
f'- Selected targets changed: {summary["selectedTargetChanges"]}.',
f'- Structural/protected checks: placeholder, markup, numeric-value, and protected-literal failures = 0; callerless source strings = {summary["callerlessSources"]}.',
'- The 8-character requirement is preserved as a number; Chinese 八 is treated as the same value.',
'- No qualified native-speaker approval is claimed. No repository or PR actions, tests, builds, scans, CI, or workflow edits were performed.','',
'## Files','',
'- `blind-decisions.jsonl`: one exact selected target and disposition per cell, with hashes, rationale, exact caller references, and structural checks.',
'- `provenance.json`: input-file hashes, pin, review method, and scope limits.',
'- `summary.json`: machine-readable counts and check totals.',
'- `build_blind_ledger.py`: reproducible builder that reads only the candidate-free input.',
'- `SHA256SUMS.txt`: hashes of all deliverables above except itself.','']
(OUT/'README.md').write_text('\n'.join(lines),encoding='utf-8')
files=[OUT/n for n in ['README.md','summary.json','provenance.json','blind-decisions.jsonl','build_blind_ledger.py']]
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{H(f.read_bytes())}  {f.name}\n' for f in files),encoding='utf-8')
verify=subprocess.run(['sha256sum','-c','SHA256SUMS.txt'],cwd=OUT,text=True,capture_output=True)
assert verify.returncode==0,(verify.stdout,verify.stderr)
print(json.dumps({'output':str(OUT),'summary':summary,'sha256sums':(OUT/'SHA256SUMS.txt').read_text(),'bytes':sum(f.stat().st_size for f in OUT.iterdir() if f.is_file()),'verification':verify.stdout},ensure_ascii=False,indent=2))
