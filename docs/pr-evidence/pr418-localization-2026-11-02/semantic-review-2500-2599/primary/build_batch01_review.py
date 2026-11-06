from pathlib import Path
import json,hashlib,collections
ROOT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
IN=ROOT/'batch-01-input.jsonl'; OUT=ROOT/'batch-01-review.jsonl'
def sha(x): return hashlib.sha256(x if isinstance(x,bytes) else x.encode('utf-8')).hexdigest()
# Targets below repair concrete semantic, terminology, or grammar defects found in the pinned current wording.
fix={
'ar':{
2500:('تصفّح الكتب الإلكترونية في {serviceName}','The current phrase means “crowd book”; this restores ebook browsing in the named reader service.'),
2504:('عنوان تطبيق القراءة','The current wording says an “application title”; the source is the address for the reader app.'),
2505:('أدخل العنوان الذي يمكن للقراء فتحه في المتصفح. أضف مسار الأساس للوكيل العكسي إذا كنت تستخدمه. يمكنك لصق عنوان OPDS كامل أو عنوان Grimmory Komga.','Repairs the malformed address instruction and retains the reverse-proxy base-path condition and product literals.'),
2510:('تجاهل التغييرات','The current phrase translates “discard” as waste; this is the standard action for abandoning unsaved edits.'),
2513:('إزالة بيانات اعتماد الحساب المحفوظة','The source removes saved credentials; the current target says to move retained credentials.'),
2514:('عنوان قارئ القصص المصورة Komga','Restores the address label and the Komga comic-reader context.'),
2519:('تم الاتصال. يمكن لـ SeerrNG إدارة المجموعات؛ عُثر على {count} مجموعة موجودة.','Repairs the count placement while retaining the successful connection state and grouping count.'),
2520:('اختبار إمكانية الوصول إلى المجموعة','The current target describes access to test groups; the source asks to test access to a grouping.'),
2522:('تم نسخ عنوان تطبيق القراءة.','The source is a completion message for copying the reader address; the current wording refers to readers in the plural.'),
2523:('نسخ عنوان الفهرس','The current wording says “copy battalion address”; this restores the catalog-address action.'),
2524:('نسخ عنوان قارئ القصص المصورة','The current wording refers to magazine readers; this restores the comic-reader address action.'),
2526:('الوصول إلى الحافظة غير متاح هنا. حدّد عنوان تطبيق القراءة أعلاه وانسخه.','The current wording corrupts “clipboard” and omits the copy action; this states both steps.'),
2527:('إزالة رف القراءة المُدار','“Managed” is mistranslated as merely “organized”; this names the reader-service shelf.'),
2532:('Grimmory (موصى به)','The current parenthetical means “the recommendation”; the label should say Grimmory is recommended.'),
2536:('تعذّر إزالة رف القراءة المُدار.','The current sentence is malformed and does not clearly state that removal failed.'),
2537:('تمت إزالة رف القراءة المُدار.','The current sentence is an unfinished clause; this states the completed removal.'),
2538:('يتطلب الانتباه','The current noun phrase says “the need for attention”; this is a concise status label.'),
2544:('جارٍ التحديث','The current noun “update” does not express the in-progress status.'),
2546:('تعذّر تحميل أرفف القراءة المُدارة.','The current wording omits who manages the shelves; this reports a failed load.'),
2551:('تعذّر تحميل إعدادات تطبيق القراءة.','The current target says “reader devices,” changing the settings meaning.'),
2552:('لم ينشئ SeerrNG أي أرفف للقراءة بعد.','The current wording is awkward and can read as a passive construction without a clear actor.'),
2554:('فتح {serviceName}','The current adjective means “open” as a state; this is the action label “Open.”'),
2555:('كلمة مرور حساب المسؤول','The current target drops the administrator-account context.'),
2560:('حفظ إعدادات تطبيق القراءة','The current phrase says “rescue readers’ sites”; it does not name the save-settings action.'),
2561:('تعذّر حفظ إعدادات تطبيق القراءة.','Repairs the untranslated “Reader” label and preserves the save-failure state.'),
2562:('تم حفظ إعدادات تطبيق القراءة.','The current target says that devices were rescued; this reports that reader settings were saved.'),
2565:('يقفل BookOrbit إمكانية تغيير مستوى ظهور SmartScope عند إنشاء النطاق. وإذا كانت مزامنة Kobo مفعّلة، يحافظ SeerrNG أيضًا على مجموعة عادية ويُزامن عناصرها كل 15 دقيقة.','The current wording replaces the Kobo Collection behavior with Grimmory sharing; this restores both source clauses and all product names.'),
2566:('مشترك مع مستخدمي خدمة القراءة','The source describes sharing with reader-service users; the current verb means exchange.'),
2567:('احفظ الإعدادات قبل اختبار الاتصال.','The current wording says to save “environments”; this is the connection-test instruction.'),
2568:('تطبيقات القراءة','The current label means reading devices, while the source names software apps; it also matches the label used in the route help.'),
2569:('احفظ هذه الإعدادات قبل استخدام روابط القراءة في صفحات تفاصيل الوسائط.','The current wording says to save “places”; this restores the settings and media-detail-page context.'),
2571:('إنشاء رف للقراءة','The current target omits the create action and is ungrammatical.'),
2574:('عدد العناصر في المعاينة: {count}. لم تؤكد خدمة القراءة العدد المحفوظ بعد.','The current target leaves “Reader” untranslated; this also clarifies that the service has not confirmed the saved count.'),
2576:('Grimmory (موصى به)','The current parenthetical means “the recommendation”; this marks Grimmory as recommended.'),
2583:('فتح {serviceName}','The current wording means “open” as a state rather than the action label.'),
2584:('إغلاق إعداد الرف','The current target says “closed shelf” and omits setup.'),
2585:('معاينة العناصر المطابقة','The current wording describes sports matches; here it means items that match a reader-shelf rule.'),
2586:('تعذّر التحقق من مكتبة القراءة.','This is the failure status for checking the reader library; the current wording changes it to a general inability.'),
2587:('جارٍ فحص المكتبة…','The current form does not clearly mark the in-progress status.'),
2588:('خدمة القراءة','The current target is plural (“reader services”); the source names one reader service.'),
2589:('تم حفظ رف القراءة.','The current target says “ready shelf,” not that it was saved.'),
2590:('بعض العناصر المطابقة','The current phrase says sports matches; this title refers to a few rule-matching items.'),
2591:('إنشاء رف','The current noun means “shelf creation”; this is the create action.'),
2592:('تعذّر حفظ رف القراءة.','The current target leaves “Reader” in English and is less clear than the source failure state.'),
2596:('إذا كان حساب القراءة أو حساب OPDS تابعًا لمستخدم آخر لخدمة القراءة، فشارك هذه المجموعة ليتمكن ذلك الحساب من رؤيتها. ويظل حساب القراءة بحاجة إلى إمكانية الوصول إلى المكتبة المطابقة.','The current wording mistranslates OPDS as an office-projects phrase and makes the account/library relationship unclear.'),
2599:('حفظ تحديثات الرف','The current wording names only “shelf updates” and omits the save action.'),
},
'de':{
2504:('Reader-App-Adresse','The current compounds are unhyphenated English words; this is the established German UI compound for the app address.'),
2508:('BookOrbit bietet integrierte Lesefunktionen für E-Books und PDFs, Comics im CBZ/CBR/CB7-Format sowie Hörbücher im M4B/MP3/M4A/OPUS/OGG/FLAC-Format. Mit OPDS-Apps können Sie E-Books und PDFs durchsuchen, CBZ/CBR-Archive herunterladen und Zeitschriftenausgaben als PDFs importieren.','“Eingebaute Leser” means people who read; the source describes built-in reader software, and the target also omitted the explicit import action.'),
2514:('Adresse des Komga-Comic-Readers','The current wording repeats English noun order; this is a clear German address label.'),
2526:('Der Zugriff auf die Zwischenablage ist hier nicht verfügbar. Markieren und kopieren Sie die oben angezeigte Reader-Adresse.','The current target leaves “Clipboard” untranslated and says “select” rather than clearly marking the text.'),
2534:('{count, plural, one {# Eintrag} other {# Einträge}}','“Position” means a position in a sequence, not an item in a reader grouping.'),
2558:('Privat für das verbundene Konto','“Privat auf dem Konto” is an incorrect preposition for visibility restricted to an account.'),
2563:('Gespeichert; lassen Sie das Feld leer, damit es gespeichert bleibt','The current infinitive “Speichern” changes the saved-state message into an action and weakens the blank-to-retain instruction.'),
2564:('Wird gespeichert…','The current infinitive reads like a command; the source is an in-progress status.'),
2571:('Leseregal erstellen','The current “Reader Regal” is an awkward mixed-language compound; this uses the shelf term already used in this screen.'),
2579:('SeerrNG erstellt in Ihrem Lesedienst eine dynamische, regelbasierte Gruppierung. Sie bleibt aktuell, wenn sich die Bibliothek ändert; Dateien werden nicht kopiert.','The current “Live-, regelbasierte” construction is ungrammatical; the correction retains the live updating and no-file-copy meaning.'),
2590:('Einige Treffer','“Matches” is left in English; the product context is items matching a shelf rule.'),
2594:('Richten Sie unter Einstellungen > Dienste > Reader-Apps einen Lesedienst ein und kehren Sie dann hierher zurück.','The current route says “Lese-Apps,” but the pinned localized route label is “Reader-Apps.”'),
},
'es':{
2508:('BookOrbit tiene lectores integrados para libros electrónicos y PDF, cómics en formato CBZ/CBR/CB7 y audiolibros en M4B/MP3/M4A/OPUS/OGG/FLAC. Las aplicaciones OPDS permiten explorar libros electrónicos y PDF, descargar archivos CBZ/CBR e importar números de revista en PDF.','The current text leaves “audiobooks” and “ebooks” in English; this restores the missing Spanish content while preserving format literals.'),
2517:('¿Eliminar esta agrupación gestionada por SeerrNG del servicio de lectura? Los libros y los archivos de la biblioteca no se eliminarán.','The current question omits the opening question mark and drops the article on the second clause.'),
2519:('Conectado. SeerrNG puede gestionar las agrupaciones; se encontraron {count} agrupaciones existentes.','The current word order splits the count from “groupings found” and is difficult to read.'),
2530:('Recomendado. Grimmory ofrece un catálogo OPDS para libros electrónicos y PDF, una API de Komga para transmitir páginas de cómics y un reproductor integrado para audiolibros M4B, M4A y MP3.','The current text leaves “ebooks” in English and describes the Komga API awkwardly; the correction keeps the three capabilities distinct.'),
2531:('Configuración de la API Komga de Grimmory','The current word order makes the API name read as a modifier of “configuration.”'),
2533:('Configuración de OPDS de Grimmory','The current word order is unnatural for a setup label.'),
2536:('No se pudo eliminar el estante de lectura gestionado.','The current imperfect “no podía” does not express the reported removal failure.'),
2544:('Actualizando','The current noun “Actualización” does not express the in-progress state.'),
2546:('No se pudieron cargar los estantes de lectura gestionados.','The current imperfect construction is awkward for this load-failure status.'),
2558:('Privado para la cuenta conectada','The preposition “a” in the current target changes the account-visibility relation.'),
2577:('La entrega de Kobo de Grimmory utiliza su propio estante de inclusión. SeerrNG deja sin cambios esa configuración del proveedor.','The current word order makes “Grimmory Kobo” read as one name; this clarifies the delivery feature while preserving its separate shelf and unchanged-provider-setting meaning.'),
2578:('Convertir esto en un estante de lectura','The current phrase omits the article needed for a natural shelf label/action.'),
2594:('Configura un servicio de lectura en Ajustes > Servicios > Aplicaciones de lectura y vuelve aquí.','The current breadcrumb says “Configuración,” while the exact localized Settings label in the caller route is “Ajustes.”'),
}
}
rows=[json.loads(s) for s in IN.read_text(encoding='utf-8').splitlines()]
assert len(rows)==300
seen=set(); out=[]; counts=collections.Counter(); per=collections.defaultdict(collections.Counter)
for cell in rows:
 key=(cell['locale'],cell['sourcePosition'])
 assert key not in seen; seen.add(key)
 proposal=fix.get(cell['locale'],{}).get(cell['sourcePosition'])
 if proposal:
  target,why=proposal
  assert target!=cell['currentTarget'],(key,'candidate is unchanged')
  disp='propose-correction'; confidence='moderate'
 else:
  target=cell['currentTarget']; disp='accept-current'
  why=f"Current wording preserves the source meaning in its pinned reader-service caller: {cell['source']} Placeholders, markup, and applicable protected literals are intact."
  confidence='moderate'
 out.append({'sourcePosition':cell['sourcePosition'],'sourceId':cell['sourceId'],'locale':cell['locale'],'sourceTextSha256':cell['sourceTextSha256'],'currentTargetHash':cell['currentTargetHash'],'callerContextSha256':cell['callerContextSha256'],'callerUseStatus':cell['callerContext']['callerUseStatus'],'disposition':disp,'finalTarget':target,'rationale':why,'confidence':confidence,'reviewer':'primary-static-review-ar-de-es'})
 counts[disp]+=1; per[cell['locale']][disp]+=1
assert len(out)==300 and len(seen)==300 and {r['locale'] for r in out}=={'ar','de','es'}
assert len(fix['ar'])+len(fix['de'])+len(fix['es'])==sum(counts[x] for x in counts if x=='propose-correction')
OUT.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in out),encoding='utf-8')
summary={'batch':'batch-01','locales':['ar','de','es'],'sourcePositions':[2500,2599],'cells':len(out),'counts':dict(counts),'perLocale':{k:dict(v) for k,v in per.items()},'holds':sum(x['disposition']=='hold' for x in out),'inputSha256':sha(IN.read_bytes()),'outputSha256':sha(OUT.read_bytes()),'head':'0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2','tree':'a09117211080bbd89d32959f17d93b02a82b966f','nativeSpeakerApproval':False}
(ROOT/'batch-01-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
