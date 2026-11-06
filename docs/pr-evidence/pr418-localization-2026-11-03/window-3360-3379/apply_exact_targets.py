#!/usr/bin/env python3
"""Apply exact-hash ratified SeerrNG W3360-W3379 values and record readback."""
import collections, hashlib, json, os, re, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
EVIDENCE=ROOT/'docs/pr-evidence/pr418-localization-2026-11-03/window-3360-3379'
EXPECTED_HEAD='1586a249e3f86deb7b9410cff50223e5f76209ff'
sha=lambda b:hashlib.sha256(b).hexdigest()
def rows(p): return [json.loads(s) for s in p.read_text(encoding='utf-8').splitlines() if s]
def git_bytes(path): return subprocess.check_output(['git','show',f'HEAD:{path}'],cwd=ROOT)
def blob(path): return subprocess.check_output(['git','rev-parse',f'HEAD:{path}'],cwd=ROOT,text=True).strip()
def dump(obj): return (json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode()
def placeholders(s): return sorted(re.findall(r'\{([A-Za-z_][A-Za-z0-9_]*)(?:\s*[,}])',s))
def icu_signature(s):
 out=[]; i=0
 while True:
  m=re.search(r'\{([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,',s[i:])
  if not m: break
  start=i+m.start(); body_start=i+m.end(); depth=1; j=body_start
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  if depth: raise AssertionError('unclosed ICU plural')
  body=s[body_start:j-1]; selectors=[]; k=0
  while k<len(body):
   sm=re.search(r'(=\d+|[A-Za-z]+)\s*\{',body[k:])
   if not sm: break
   label=sm.group(1); brace=k+sm.end()-1; selectors.append(label); d=1; q=brace+1
   while q<len(body) and d:
    if body[q]=='{': d+=1
    elif body[q]=='}': d-=1
    q+=1
   k=q
  out.append((m.group(1),tuple(selectors),body.count('#'))); i=j
 return tuple(out)
def main():
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==EXPECTED_HEAD
 status=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).splitlines()
 assert all(line.startswith('?? ') and line[3:].startswith('docs/pr-evidence/pr418-localization-2026-11-03/window-3360-3379/') for line in status),status
 window=json.loads((EVIDENCE/'input-final/window.json').read_text())
 assert window['head']==EXPECTED_HEAD and window['tree']=='d620a906353e9724ba28986103c76b7792c56099'
 input_rows=rows(EVIDENCE/'input-final/review-input.jsonl'); root_rows=rows(EVIDENCE/'root-adjudication/root-decisions.jsonl'); plan=rows(EVIDENCE/'exact-apply-plan.jsonl')
 assert len(input_rows)==len(root_rows)==240 and len(plan)==20
 im={(r['id'],r['locale']):r for r in input_rows}; rm={(r['id'],r['locale']):r for r in root_rows}
 assert set(im)==set(rm)
 baseline={}; updated={}
 for path,pin in window['localeCatalogPins'].items():
  raw=git_bytes(path); assert sha(raw)==pin['sha256'] and blob(path)==pin['gitBlob']
  data=json.loads(raw); assert len(data)==pin['keyCount']==9494
  assert sha('\n'.join(data).encode())==pin['orderedKeySha256']
  assert dump(data)==raw
  assert (ROOT/path).read_bytes()==raw
  baseline[path]=data; updated[path]=dict(data)
 english_keys=set(baseline['src/i18n/locale/en.json'])
 assert all(set(v)==english_keys for v in baseline.values())
 for path,pin in window['callerFiles'].items():
  raw=git_bytes(path); assert sha(raw)==pin['sha256'] and blob(path)==pin['gitBlob']
 plan_map={(r['id'],r['locale']):r for r in plan}; assert len(plan_map)==20
 for k,x in im.items():
  r=rm[k]; path=x['catalogPath']; current=baseline[path][x['id']]
  assert current==x['currentTarget']==r['currentTarget'] and sha(current.encode())==x['currentTargetSha256']==r['currentTargetSha256']
  assert x['sourceSha256']==sha(x['source'].encode())==r['sourceSha256']
  target=r['rootTarget']; assert sha(target.encode())==r['rootTargetSha256']
  assert placeholders(x['source'])==placeholders(target),(k,'placeholder')
  assert re.findall(r'</?[A-Za-z][^>]*>',x['source'])==re.findall(r'</?[A-Za-z][^>]*>',target),(k,'markup')
  assert re.findall(r'\d+',x['source'])==re.findall(r'\d+',target),(k,'numeric')
  assert all(t in target for t in x['sourceProtectedLiterals']),(k,'protected')
  assert tuple(sig[0] for sig in icu_signature(x['source']))==tuple(sig[0] for sig in icu_signature(target)),(k,'icu-variable')
  assert icu_signature(x['currentTarget'])==icu_signature(target),(k,'icu-target-structure',icu_signature(x['currentTarget']),icu_signature(target))
  if target!=current:
   q=plan_map[k]; assert q['catalogPath']==path and q['currentTarget']==current and q['currentTargetSha256']==sha(current.encode()) and q['target']==target and q['targetSha256']==sha(target.encode())
   assert q['disposition']==r['rootDisposition'] and r['rootDisposition'] in ('correction','refinement')
   updated[path][x['id']]=target
  else:
   assert k not in plan_map
 readback=[]; changed_paths=sorted({q['catalogPath'] for q in plan})
 for path in changed_paths:
  dest=ROOT/path
  with tempfile.NamedTemporaryFile(prefix=f'.{dest.name}.w3360-3379-',dir=dest.parent,delete=False) as f:
   tmp=Path(f.name); f.write(dump(updated[path])); f.flush(); os.fsync(f.fileno())
  try: os.replace(tmp,dest)
  finally: tmp.unlink(missing_ok=True)
 for k,x in sorted(im.items(),key=lambda kv:(kv[1]['position'],kv[1]['locale'])):
  r=rm[k]; actual=json.loads((ROOT/x['catalogPath']).read_text())[x['id']]
  assert actual==r['rootTarget']
  readback.append({'position':x['position'],'id':x['id'],'locale':x['locale'],'catalogPath':x['catalogPath'],'sourceSha256':x['sourceSha256'],'previousTargetSha256':x['currentTargetSha256'],'rootDisposition':r['rootDisposition'],'expectedTarget':r['rootTarget'],'expectedTargetSha256':r['rootTargetSha256'],'actualTarget':actual,'actualTargetSha256':sha(actual.encode()),'changed':actual!=x['currentTarget']})
 summaries={}
 for path,data in updated.items():
  final_raw=(ROOT/path).read_bytes(); final=json.loads(final_raw); assert list(final)==list(baseline[path])
  summaries[path]={'keyCount':len(final),'orderedKeySha256':sha('\n'.join(final).encode()),'fileSha256':sha(final_raw)}
 group=collections.defaultdict(list)
 for path,v in summaries.items(): group[v['orderedKeySha256']].append(path)
 result={'repository':'snapetech-org/seerrng','pullRequest':418,'window':'W3360-W3379','baselineHead':EXPECTED_HEAD,'cellCount':240,'approvedChangeCount':len(plan),'changedCatalogCount':len(changed_paths),'verifiedCellCount':len(readback),'mismatchCount':0,'catalogs':summaries,'orderedKeyHashGroups':dict(group),'rows':readback}
 (EVIDENCE/'apply-readback.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(f"Applied {len(plan)} exact-hash changes across {len(changed_paths)} catalogs; verified all {len(readback)} cells, placeholders, markup, numerics, protected literals, target-locale ICU signatures, and key ordering.")
if __name__=='__main__': main()
