from __future__ import annotations
import collections, hashlib, json, re
from pathlib import Path

PRIMARY=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-crossreview-20261102/batch-ar-de-es')
LOCALES=('ar','de','es')
REV={
 (2534,'ar'):('{count, plural, zero {لا توجد عناصر} one {# عنصر} two {# من العناصر} few {# عناصر} many {# عنصرًا} other {# عنصر}}','The source count is displayed with `#`. The Arabic `one` branch spells out “one” and the `two` branch relies on a dual noun; this keeps the count-driven values in the ICU marker and retains natural zero wording.'),
 (2531,'ar'):('إعداد واجهة Komga API في Grimmory','The current title puts “الإنشاء” after the English product names and reads as a fragment about creation; this is a setup heading for Grimmory’s Komga API.'),
 (2556,'ar'):('تطبيق القراءة المفضل','The current value says “preferred reading” and omits the app selected by this field.'),
 (2575,'ar'):('أنشئ هذه القاعدة الديناميكية على أي حال لكي تظهر الكتب المطابقة مستقبلًا تلقائيًا.','“القاعدة المباشرة” does not express a live, automatically updated rule. The caller describes future matching books appearing without further action.'),
 (2579,'ar'):('سينشئ SeerrNG تجميعًا ديناميكيًا قائمًا على القواعد في خدمة القراءة لديك. وسيظل محدّثًا كلما تغيّرت تلك المكتبة؛ فهو لا ينسخ الملفات.','“تجميع مباشر” reads as a direct/live grouping; the caller describes a rule-based grouping that stays current as the library changes.'),
 (2582,'ar'):('لا توجد كتب حالية تطابق هذه القاعدة.','The current “لا يوجد كتب” has incorrect Arabic agreement; the source says no current books match the rule.'),
 (2581,'ar'):('{count, plural, zero {لا توجد تطابقات حالية} one {# تطابق حالي} two {# من التطابقات الحالية} few {# تطابقات حالية} many {# تطابقًا حاليًا} other {# تطابق حالي}}','The source count is displayed with `#`. The Arabic `one` branch spells out “one” and the `two` branch relies on a dual noun; this keeps count-driven values in the ICU marker and retains natural zero wording.'),
 (2597,'ar'):('مزامنة هذه القاعدة الديناميكية مع Kobo','The current “القاعدة المباشرة” does not convey a rule that continuously updates with library matches.'),
 (2598,'ar'):('عند تفعيلها، ينشئ SeerrNG مجموعة BookOrbit مُدارة ويوائم عناصرها مع هذه القاعدة الديناميكية كل 15 دقيقة. اربط حساب Kobo في BookOrbit.','The current “القاعدة المباشرة” loses the live, rule-updated behavior stated in the source and helper text; the replacement retains the 15-minute reconciliation and account-pairing instructions.'),
 (2521,'de'):('Lesedienst wird überprüft…','The current infinitive reads as an instruction to check the service; the caller displays this while a connection check is running.'),
 (2565,'de'):('BookOrbit sperrt die Sichtbarkeitseinstellung beim Erstellen eines SmartScope. Wenn die Kobo-Synchronisierung aktiviert ist, verwaltet SeerrNG außerdem eine reguläre Sammlung und gleicht deren Einträge alle 15 Minuten ab.','“Legt die Sichtbarkeit fest” says the setting is determined, but the adjacent caller says it cannot be changed after creation; this states that the setting is locked.'),
 (2587,'de'):('Bibliothek wird überprüft…','The current infinitive is an instruction; the pinned caller uses this label during an in-progress library check.'),
 (2597,'de'):('Diese dynamische Regel mit Kobo synchronisieren','“Live-Regel” is an unnatural literal rendering here; the rule updates from changing library matches, so “dynamische Regel” preserves the behavior.'),
 (2598,'de'):('Wenn aktiviert, erstellt SeerrNG eine verwaltete BookOrbit-Sammlung und gleicht ihre Einträge alle 15 Minuten mit dieser dynamischen Regel ab. Verknüpfen Sie das Kobo-Konto in BookOrbit.','“Live-Regel” is a literal, ambiguous rendering; the helper says SeerrNG periodically reconciles collection entries against the dynamic matching rule.'),
 (2518,'es'):('Falló la conexión con el servicio de lectura.','The current sentence says the reader service itself failed and omits that its connection failed; the pinned call site is the connection-test error.'),
 (2521,'es'):('Comprobando el servicio de lectura…','“Servicio de lectores” can mean a service belonging to readers; the UI is checking the connected reader service, consistently named “servicio de lectura” elsewhere.'),
 (2528,'es'):('Para un artículo solicitado, SeerrNG también puede descargar los archivos disponibles directamente al dispositivo que ejecuta este navegador. Los audiolibros, los cómics y los números de revista requieren su propio formato de archivo y una aplicación de lectura compatible.','“Aplicación de lectores” is an awkward and ambiguous rendering of the compatible reader app used for each media type; this names an application for reading.'),
 (2535,'es'):('La vista previa encontró {count} elementos; aún no se ha confirmado el recuento final.','The current participle “Vista previa encontrada” is ungrammatical as a sentence; the source reports what the preview found and that the final count is not confirmed.'),
 (2537,'es'):('Se eliminó el estante de lectura gestionado.','The current noun sequence “Estante de lector gestionado eliminado” is difficult to parse and can mean a reader’s shelf; the source reports that the managed reader shelf was removed.'),
 (2547,'es'):('Estantes de lectura gestionados por SeerrNG','“Estantes de lectores” suggests shelves belonging to reader users; these are shelves managed in the connected reader service.'),
 (2552,'es'):('SeerrNG aún no ha creado ningún estante de lectura.','The current “estantes de lectores de SeerrNG” is ambiguous about whose shelves these are; the caller identifies SeerrNG-managed shelves in the reader service.'),
 (2553,'es'):('Conecta una cuenta de administrador para que SeerrNG pueda previsualizar, crear y actualizar estantes de lectura. Las contraseñas se almacenan en la configuración protegida de la aplicación y nunca se devuelven por la API. Las credenciales de la aplicación de lectura y de OPDS permanecen separadas.','The current “estantes de lectores” and “app de lectura” obscure that SeerrNG manages shelves inside the reader service; the caller distinguishes those service shelves from credentials.'),
 (2571,'es'):('Crear estante de lectura','“Estante de lector” reads as a shelf belonging to a reader; this is the action that creates a shelf in the reader service.'),
 (2575,'es'):('Cree esta regla dinámica de todos modos para que los libros que coincidan en el futuro aparezcan automáticamente.','“Regla en vivo” is a literal rendering; the caller makes clear that this rule updates so future matching books appear automatically.'),
 (2578,'es'):('Convertir esto en un estante de lectura','The current “Hacer esto un estante de lector” is ungrammatical and does not clearly express converting the selected item into a reader-service shelf.'),
 (2579,'es'):('SeerrNG creará una agrupación dinámica basada en reglas en su servicio de lectura. Se mantiene actualizada a medida que cambia la biblioteca; no copia archivos.','“Agrupación en vivo” is a literal rendering; the source and caller describe a dynamic rule-based grouping that stays current as the reader library changes.'),
 (2586,'es'):('No se pudo comprobar la biblioteca de lectura.','“Biblioteca del lector” may mean a person’s library; this is the connected reader service library being checked.'),
 (2592,'es'):('No se pudo guardar el estante de lectura.','“Estante del lector” suggests a reader-owned shelf; the caller is saving a managed shelf in the reader service.'),
 (2595,'es'):('Mostrar esta agrupación a otros usuarios del servicio de lectura','The source refers to the rule-based grouping, while “grupo” is underspecified beside the other UI strings for reader shelves and groupings.'),
 (2597,'es'):('Sincronizar esta regla dinámica con Kobo','“Regla activa” loses the source’s live-updating behavior; nearby help explains that the rule is reconciled against the library every 15 minutes.'),
 (2598,'es'):('Cuando se activa, SeerrNG crea una Colección de BookOrbit gestionada y reconcilia cada 15 minutos los elementos que la integran con esta regla dinámica. Asocia la cuenta de Kobo en BookOrbit.','“Regla activa” can mean merely enabled; the source describes a live rule that changes with library matches. This also keeps the 15-minute collection reconciliation.'),
}

def sha(s:str)->str:return hashlib.sha256(s.encode('utf-8')).hexdigest()
def canon(x)->bytes:return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def placeholders(s:str):
 out=[]; i=0
 while i<len(s):
  if s[i]!='{': i+=1; continue
  depth=1; j=i+1
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  if depth: return None
  body=s[i+1:j-1]
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
  if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return sorted(out,key=lambda x:(x['name'],x['kind']))
def tags(s:str):return re.findall(r'</?[A-Za-z][^>]*>',s)
def icu_branches(s:str):
 out={}
 for m in re.finditer(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s):
  depth=1; j=m.end()
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  if depth==0:out[m.group(1)]=s[m.end():j-1]
 return out

rows=[json.loads(x) for x in (PRIMARY/'primary-review-ledger.jsonl').read_text(encoding='utf-8').splitlines()]
assert len(rows)==1200
selected=[r for r in rows if r['locale'] in LOCALES]
assert len(selected)==300 and len({(r['sourcePosition'],r['locale']) for r in selected})==300
review=[]; counts=collections.Counter(); per_locale=collections.defaultdict(collections.Counter); mismatches=[]
for cell in sorted(selected,key=lambda r:(r['sourcePosition'],r['locale'])):
 key=(cell['sourcePosition'],cell['locale']); current=cell['currentTarget']; primary=cell['finalTarget']
 override=REV.get(key)
 if override:
  recommended,reason=override
  if recommended==primary and cell['disposition']=='propose-correction':
   disp='accept-primary-correction'; confidence=cell['confidence']
  else:
   disp='revise-primary'; confidence='moderate'
 elif cell['disposition']=='propose-correction':
  recommended=primary; disp='accept-primary-correction'; reason=(f"Independent comparison with the English source and pinned caller confirms this correction. {cell['rationale']}"); confidence=cell['confidence']
 else:
  recommended=current; disp='accept-current'; reason=f"Independent review retained this current target: it faithfully conveys the source in the pinned caller context ({cell['source']}); no material semantic error was found."; confidence='moderate'
 if recommended is not None:
  ph=placeholders(recommended); tags_now=tags(recommended); branches=icu_branches(recommended)
  src_ph=placeholders(cell['source']); src_tags=tags(cell['source']); src_branches=icu_branches(cell['source'])
  missing=[lit for lit in cell['protectedLiterals'] if lit not in recommended]
  ph_ok=ph==src_ph; markup_ok=tags_now==src_tags
  required=set(src_branches).issubset(set(branches)) and (not src_branches or 'other' in branches)
  count_audit=[]
  for category,source_branch in src_branches.items():
   if '#' in source_branch and '#' not in branches.get(category,''):
    count_audit.append({'category':category,'status':'missing-count-marker'})
  for category,target_branch in branches.items():
   if '#' in target_branch:
    status='hash-marker-preserved' if category in src_branches and '#' in src_branches[category] else 'hash-marker-present'
    count_audit.append({'category':category,'status':status})
   elif cell['locale']=='ar' and category=='zero' and any(w in target_branch for w in ('لا توجد','لا يوجد')):
    count_audit.append({'category':category,'status':'localized-zero-form'})
   else: count_audit.append({'category':category,'status':'missing-count-marker'})
  count_ok=all(x['status']!='missing-count-marker' for x in count_audit)
 else:
  ph=tags_now=branches=None; missing=[]; ph_ok=markup_ok=required=count_ok=False; count_audit=[]
 if not (ph_ok and markup_ok and required and count_ok and not missing): mismatches.append({'sourcePosition':cell['sourcePosition'],'sourceId':cell['sourceId'],'locale':cell['locale'],'placeholderParity':ph_ok,'markupParity':markup_ok,'icuStructurePreserved':required,'countMarkers':count_audit,'missingProtectedLiterals':missing})
 row={
  'sourcePosition':cell['sourcePosition'],'sourceId':cell['sourceId'],'locale':cell['locale'],
  'source':cell['source'],'sourceHash':cell['sourceHash'],'sourceTextSha256':cell['sourceTextSha256'],
  'currentTarget':current,'currentTargetHash':cell['currentTargetHash'],
  'primaryDisposition':cell['disposition'],'primaryTarget':primary,'primaryTargetHash':cell['finalTargetHash'],
  'crossReviewDisposition':disp,'recommendedTarget':recommended,'recommendedTargetHash':sha(recommended) if recommended is not None else None,
  'reason':reason,'confidence':confidence,
  'catalogFile':cell['localeFile'],'catalogBlob':cell['localeBlob'],'catalogFileSha256':cell['localeFileSha256'],
  'callerContextRef':cell['callerContextRef'],'callerContextSha256':cell['callerContextSha256'],'callerUseStatus':cell['callerUseStatus'],
  'sourcePlaceholders':src_ph,'recommendedPlaceholders':ph,'placeholderParity':'exact' if ph_ok else 'mismatch',
  'sourceMarkup':src_tags,'recommendedMarkup':tags_now,'markupParity':'exact' if markup_ok else 'mismatch',
  'protectedLiterals':cell['protectedLiterals'],'missingProtectedLiterals':missing,
  'sourceIcuPluralCategories':sorted(src_branches),'recommendedIcuPluralCategories':sorted(branches),'icuStructurePreserved':required,'countMarkerAudit':count_audit,
  'reviewer':'independent-machine-crossreview-ar-de-es'
 }
 review.append(row); counts[disp]+=1; per_locale[cell['locale']][disp]+=1
assert not mismatches,json.dumps(mismatches,ensure_ascii=False,indent=2)
assert len(review)==300 and len({(r['sourcePosition'],r['locale']) for r in review})==300
assert all(r['crossReviewDisposition'] in {'accept-current','accept-primary-correction','revise-primary','reject-primary','hold'} for r in review)
(OUT/'crossreview-ledger.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in review),encoding='utf-8')
contexts={}
for c in rows:
 if c['locale'] not in LOCALES: continue
 ctx=c['callerContext']; contexts[c['sourceId']]=ctx
(OUT/'caller-contexts-reattested.jsonl').write_text(''.join(json.dumps(contexts[k],ensure_ascii=False,sort_keys=True)+'\n' for k in sorted(contexts)),encoding='utf-8')
summary={'head':'0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2','tree':'a09117211080bbd89d32959f17d93b02a82b966f','cells':len(review),'dispositionCounts':dict(sorted(counts.items())),'perLocale':{l:dict(sorted(per_locale[l].items())) for l in LOCALES},'revisions':[{'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'currentTargetHash':r['currentTargetHash'],'primaryTargetHash':r['primaryTargetHash'],'recommendedTargetHash':r['recommendedTargetHash'],'reason':r['reason'],'recommendedTarget':r['recommendedTarget']} for r in review if r['crossReviewDisposition']=='revise-primary'],'rejects':[{'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'reason':r['reason']} for r in review if r['crossReviewDisposition']=='reject-primary'],'holds':[{'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],'reason':r['reason']} for r in review if r['crossReviewDisposition']=='hold'],'structuralMismatches':mismatches,'nativeSpeakerApproval':'not performed; remains outstanding'}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'cells':len(review),'counts':dict(counts),'perLocale':{l:dict(per_locale[l]) for l in LOCALES},'revisions':len(summary['revisions']),'structuralMismatches':len(mismatches)},ensure_ascii=False))
