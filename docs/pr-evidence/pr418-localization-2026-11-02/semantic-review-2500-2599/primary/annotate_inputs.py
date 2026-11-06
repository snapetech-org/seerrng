from pathlib import Path
import json,hashlib,subprocess,collections
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
BATCHES={'batch-01':['ar','de','es'],'batch-02':['fr','hi','id'],'batch-03':['ja','ko','pt_BR'],'batch-04':['vi','zh_Hans','zh_Hant']}
READER_TERMS=['BookOrbit','Grimmory','Kobo','Komga','OPDS','SmartScope','CBZ','CBR','CB7','M4B','M4A','MP3','OPUS','OGG','FLAC','PDF','SeerrNG']
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode()).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
def hit(text,term):
 if term in ('ROM','PC','4K','CBZ','CBR','CB7','M4B','M4A','MP3','OPUS','OGG','FLAC','PDF','OPDS','HTTP','HTTPS','URL'):
  import re
  return re.search(r'(?<![A-Za-z0-9])'+re.escape(term)+(r's?' if term in ('ROM','PDF') else '')+r'(?![A-Za-z0-9])',text) is not None
 return term in text
cells=[json.loads(s) for s in (OUT/'source-current-cells.jsonl').read_text().splitlines()]
ctx={x['sourceId']:x for x in map(json.loads,(OUT/'caller-contexts.jsonl').read_text().splitlines())}
manifest=json.loads((OUT/'input-manifest.json').read_text())
terms=list(dict.fromkeys(manifest['protectedTerms']+READER_TERMS))
for c in cells:
 source=c['source']; required=[t for t in terms if hit(source,t)]
 required.extend(p['name'] for p in c['sourcePlaceholders'] if p['name'] not in required)
 c['protectedLiterals']=sorted(set(required))
 c['protectedLiteralExactMissing']=[t for t in c['protectedLiterals'] if t not in c['currentTarget']]
 c['callerContext']=ctx[c['sourceId']]
 c['sourceIcuPluralCategories']=sorted(set(__import__('re').findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',source)))
 c['currentIcuPluralCategories']=sorted(set(__import__('re').findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',c['currentTarget'])))
assert len(cells)==1200 and len({(x['sourcePosition'],x['locale']) for x in cells})==1200
writejl(OUT/'source-current-cells.jsonl',cells)
manifest['protectedTerms']=terms
writej(OUT/'input-manifest.json',manifest)
# Route label references are exact locale catalog strings, pinned to current PR head.
repo=Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng'); head=manifest['head']
route_keys=['components.Settings.settings','components.Settings.menuServices','components.ReaderDeliverySettings.title']
def flatten(d,p=''):
 for k,v in d.items():
  q=f'{p}.{k}' if p else k
  if isinstance(v,dict): yield from flatten(v,q)
  else: yield q,v
route={}
for loc in LOCALES:
 raw=subprocess.check_output(['git','-C',str(repo),'show',f'{head}:src/i18n/locale/{loc}.json'])
 values=dict(flatten(json.loads(raw)))
 route[loc]={k:values[k] for k in route_keys}
writej(OUT/'locale-ui-glossary.json',{'head':head,'tree':manifest['tree'],'purpose':'Current localized labels for the Settings > Services > Reader Apps route, for consistency when source strings refer to that route.','keys':route_keys,'locales':route})
for batch,locales in BATCHES.items():
 rows=[]
 for c in cells:
  if c['locale'] not in locales: continue
  rows.append({k:c[k] for k in ['sourcePosition','sourceId','locale','source','sourceHash','sourceTextSha256','sourceFile','sourceCatalogBlob','sourceFileSha256','currentTarget','currentTargetHash','localeFile','localeBlob','localeFileSha256','callerContextRef','callerContextSha256','callerContext','sourcePlaceholders','targetPlaceholders','placeholderParity','sourceMarkup','targetMarkup','markupParity','protectedLiterals','protectedLiteralExactMissing','sourceIcuPluralCategories','currentIcuPluralCategories']})
  rows[-1]['routeGlossary']=route[c['locale']]
 assert len(rows)==300 and len({(x['sourcePosition'],x['locale']) for x in rows})==300
 writejl(OUT/f'{batch}-input.jsonl',rows)
 writej(OUT/f'{batch}-manifest.json',{'batch':batch,'locales':locales,'sourcePositions':[2500,2599],'sourceCount':100,'cellCount':len(rows),'inputFile':f'{batch}-input.jsonl','inputSha256':sha((OUT/f'{batch}-input.jsonl').read_bytes()),'glossarySha256':sha((OUT/'locale-ui-glossary.json').read_bytes()),'head':head,'tree':manifest['tree']})
# Refresh checksums for frozen input files, adding the reader-specific cell fields and glossary.
inputs=['source-window.json','source-current-cells.jsonl','caller-contexts.jsonl','prior-disposition-boundary.json','input-manifest.json','catalog-parity.json','source-boundaries.json','locale-ui-glossary.json']
(OUT/'INPUT-SHA256SUMS').write_text(''.join(f'{sha((OUT/n).read_bytes())}  {n}\n' for n in inputs))
print(json.dumps({'cells':len(cells),'currentProtectedMismatches':sum(bool(c['protectedLiteralExactMissing']) for c in cells),'protectedTerms':terms,'routeGlossaryLocales':len(route),'batches':{k:json.loads((OUT/f'{k}-manifest.json').read_text())['cellCount'] for k in BATCHES},'inputChecksums':len(inputs)},ensure_ascii=False,indent=2))
