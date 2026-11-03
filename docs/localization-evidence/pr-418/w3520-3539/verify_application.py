#!/usr/bin/env python3
from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess
ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parents[3]
HEAD='265171657d48ef56ee81cc1c6a5c3d07abe5d07e'
TREE='402984893883cf7afd106cd208f6027d7410f2fb'
EXPECTED={
 'manifest':'9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63',
 'inputSums':'2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d',
 'primarySums':'225c152bc63d8140ffb80d59fef7db8bf88053601fd8d3e613e97ffeca2d1471',
 'blindSums':'7efeee5cec4b85e3699aa12f6bdde5cf6d3f982df8b2c16eb0c9fcc934abad00',
 'auditSums':'f2ea5d0f348647b149cd1a17ca187887d475fd86564978162c4e3f06ba1dca3b'}
def sha(b): return hashlib.sha256(b).hexdigest()
def file_sha(p): return sha(p.read_bytes())
def read_rows(p): return [json.loads(s) for s in p.read_text(encoding='utf-8').splitlines() if s]
def fail(message): raise SystemExit('FAIL: '+message)
def verify_sums(directory, sums='SHA256SUMS.txt', exact_tree=False):
    entries={}
    for line in (directory/sums).read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        expected,name=line.split(None,1); name=name.lstrip('* ')
        path=(directory/name).resolve()
        if directory.resolve() not in path.parents: fail(f'unsafe checksum path {name}')
        if file_sha(path)!=expected: fail(f'checksum mismatch {name}')
        entries[name]=expected
    if exact_tree:
        actual={p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file() and p.name!=sums}
        if actual!=set(entries): fail('evidence manifest does not cover the exact evidence tree')
    return entries

def unique_json(raw):
    def pairs(pairs):
        d={}
        for k,v in pairs:
            if k in d: fail('duplicate JSON key '+k)
            d[k]=v
        return d
    return json.loads(raw.decode('utf-8'),object_pairs_hook=pairs)

# Verify the copied evidence trees and distinct packet hashes.
verify_sums(ROOT,exact_tree=True)
input_dir=ROOT/'candidate-free-input'; primary_dir=ROOT/'primary-review'; blind_dir=ROOT/'independent-blind-review'; audit_dir=ROOT/'cross-audit'
for d in (input_dir,primary_dir,blind_dir,audit_dir): verify_sums(d)
if file_sha(input_dir/'manifest.json')!=EXPECTED['manifest']: fail('candidate-free manifest hash')
for d,k in ((input_dir,'inputSums'),(primary_dir,'primarySums'),(blind_dir,'blindSums'),(audit_dir,'auditSums')):
    if file_sha(d/'SHA256SUMS.txt')!=EXPECTED[k]: fail('packet checksum-list hash '+d.name)
manifest=json.loads((input_dir/'manifest.json').read_text())
summary=json.loads((audit_dir/'summary.json').read_text())
authorization=json.loads((ROOT/'application-authorization.json').read_text())
if manifest['head']!=HEAD or manifest['tree']!=TREE: fail('candidate-free head/tree')
if summary['head']!=HEAD or summary['tree']!=TREE or summary['applicationApproved'] is not False: fail('immutable audit pin or pre-approval flag')
if authorization.get('applicationApproved') is not True or authorization.get('nativeSpeakerSignoff') is not False: fail('separate application authorization')
if authorization.get('pinnedHead')!=HEAD or authorization.get('pinnedTree')!=TREE: fail('authorization pin')
if authorization.get('sealedCrossAudit',{}).get('checksumListSha256')!=EXPECTED['auditSums']: fail('authorization audit checksum')
source_rows=read_rows(input_dir/'source-cells.jsonl'); sources={x['sourceId']:x for x in source_rows}
current_rows=read_rows(input_dir/'current-target-cells.jsonl'); current={(x['position'],x['locale']):x for x in current_rows}
cross_rows=read_rows(audit_dir/'cross-audit-ledger.jsonl'); cross={(x['position'],x['locale']):x for x in cross_rows}
if len(source_rows)!=20 or len(current_rows)!=240 or len(cross_rows)!=240: fail('audit cell counts')
changes=[x for x in cross_rows if x['crossTarget']!=x['currentTarget']]
if len(changes)!=30 or summary['finalProposedChanges']!=30 or summary['holds']!=0: fail('selected change/hold count')
if any(x.get('callerHold') or not x.get('placeholderTokensMatchSource') for x in cross_rows): fail('hold or placeholder mismatch')
selected=[{'position':x['position'],'sourceId':x['sourceId'],'locale':x['locale'],'currentTarget':x['currentTarget'],'currentTargetSha256':x['currentTargetSha256'],'crossTarget':x['crossTarget'],'crossTargetSha256':x['crossTargetSha256'],'crossDisposition':x['crossDisposition'],'crossSelectedSide':x['crossSelectedSide']} for x in changes]
selected.sort(key=lambda x:(x['position'],x['locale']))
if selected!=authorization.get('selectedCells'): fail('authorization selected-cell list')
if authorization.get('changeCount')!=30 or authorization.get('holdCount')!=0: fail('authorization counts')
file_pins=json.loads((input_dir/'file-pins.json').read_text())['catalogFiles']
original={}
for path,pin in file_pins.items():
    raw=subprocess.check_output(['git','show',f'{HEAD}:{path}'],cwd=REPO)
    if sha(raw)!=pin['sha256']: fail('baseline catalog hash '+path)
    blob=subprocess.check_output(['git','rev-parse',f'{HEAD}:{path}'],cwd=REPO,text=True).strip()
    if blob!=pin['gitBlob']: fail('baseline catalog blob '+path)
    original[path]=unique_json(raw)
updates=collections.defaultdict(dict)
placeholder=re.compile(r'\{[^{}]+\}')
for row in cross_rows:
    key=(row['position'],row['locale']); cell=current[key]; source=sources[row['sourceId']]
    if source['source']!=row['source'] or source['sourceSha256']!=row['sourceSha256']: fail('source pin '+str(key))
    if cell['sourceId']!=row['sourceId'] or cell['currentTarget']!=row['currentTarget'] or cell['currentTargetSha256']!=row['currentTargetSha256']: fail('current target pin '+str(key))
    if row['crossTargetSha256']!=sha(row['crossTarget'].encode()): fail('proposed target hash '+str(key))
    if collections.Counter(placeholder.findall(source['source']))!=collections.Counter(placeholder.findall(row['currentTarget'])) or collections.Counter(placeholder.findall(source['source']))!=collections.Counter(placeholder.findall(row['crossTarget'])): fail('placeholder preservation '+str(key))
    if row['crossTarget']!=row['currentTarget']: updates[row['catalogPath']][row['sourceId']]=row
    if cell['catalogPath'] not in file_pins or cell['catalogSha256']!=file_pins[cell['catalogPath']]['sha256']: fail('catalog pin '+str(key))
# Reconstruct the exact authorized value-only edits from the pinned bytes. This also checks line layout.
def expected_catalog_bytes(raw, entries):
    decoder=json.JSONDecoder(); lines=raw.decode('utf-8').splitlines(keepends=True); remaining=set(entries); out=[]
    for line in lines:
        body=line.rstrip('\r\n'); newline=line[len(body):]; replacement=line
        for source_id in tuple(remaining):
            encoded=json.dumps(source_id,ensure_ascii=False); pos=body.find(encoded)
            if pos<0 or body[:pos].strip(): continue
            rest=body[pos+len(encoded):]; match=re.match(r'(\s*:\s*)(.*)$',rest)
            if not match: continue
            value_raw=match.group(2); current_value,end=decoder.raw_decode(value_raw); target=entries[source_id]
            if current_value!=target['currentTarget']: fail('baseline value before edit '+source_id)
            replacement=body[:pos+len(encoded)]+match.group(1)+json.dumps(target['crossTarget'],ensure_ascii=False)+value_raw[end:]+newline
            remaining.remove(source_id); break
        out.append(replacement)
    if remaining: fail('selected source keys missing '+str(sorted(remaining)))
    return ''.join(out).encode('utf-8')
# Exact readback and structure check: only selected value bytes change; order, whitespace and all other values stay pinned.
for path,pin in file_pins.items():
    current_file=REPO/path
    actual_bytes=current_file.read_bytes()
    expected_bytes=expected_catalog_bytes(subprocess.check_output(['git','show',f'{HEAD}:{path}'],cwd=REPO),updates.get(path,{}))
    if actual_bytes!=expected_bytes: fail('exact value-only byte patch '+path)
    actual=unique_json(actual_bytes); base=original[path]
    if list(actual)!=list(base) or len(actual)!=pin['lineCount']-2: fail('catalog order/entry count '+path)
    changes_for_file=updates.get(path,{})
    for key,value in base.items():
        expected=changes_for_file[key]['crossTarget'] if key in changes_for_file else value
        if actual.get(key)!=expected: fail(f'exact catalog readback {path}:{key}')
    if path=='src/i18n/locale/en.json' and actual!=base: fail('English source catalog changed')
for row in cross_rows:
    path=row['catalogPath']; target=row['crossTarget'] if row['crossTarget']!=row['currentTarget'] else row['currentTarget']
    actual=unique_json((REPO/path).read_bytes())
    if actual.get(row['sourceId'])!=target: fail(f'240-cell readback {path}:{row["sourceId"]}')
if sum(len(v) for v in updates.values())!=30: fail('catalog update count')
print(json.dumps({'result':'PASS','cellsReadBack':240,'appliedChanges':30,'unchangedCells':210,'holds':0,'catalogFiles':len(file_pins),'changedLocaleFiles':len(updates),'catalogOrderAndNonTargetValuesPreserved':True,'evidenceChecksumsVerified':True,'candidateManifestSha256':EXPECTED['manifest'],'crossAuditChecksumListSha256':EXPECTED['auditSums']},ensure_ascii=False,sort_keys=True))
