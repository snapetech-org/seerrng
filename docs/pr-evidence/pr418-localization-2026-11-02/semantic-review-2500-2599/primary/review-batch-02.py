from pathlib import Path
import json,hashlib,collections,re
OUT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2500-2599-primary-20261102')
FIX={
'fr':{
2505:("Saisissez l’adresse que les lecteurs peuvent ouvrir dans un navigateur. Si vous utilisez un reverse proxy, indiquez également son chemin de base. Vous pouvez coller une adresse OPDS complète ou une adresse Komga de Grimmory.",'Repairs the malformed sentence and retains the reverse-proxy base-path instruction.'),
2507:('BookOrbit','Preserves the product name; the current translation changes it to “LivreOrbit”.'),
2514:('Adresse du lecteur de comics Komga','Restores natural word order for the Komga comic-reader address.'),
2515:("Utilisez cette adresse dans une application de comics compatible avec Komga pour lire les pages en streaming. Activez l’API Komga de Grimmory et utilisez les mêmes identifiants de lecteur OPDS.",'Keeps both instructions and the OPDS reader credentials in a grammatical sentence.'),
2517:("Supprimer ce regroupement géré par SeerrNG du service de lecture ? Les livres et les fichiers de la bibliothèque ne seront pas supprimés.",'Restores clear question punctuation and the assurance that books and library files remain.'),
2519:('Connecté. SeerrNG peut gérer les regroupements ; {count} regroupements existants ont été trouvés.','Uses natural French word order for the existing-group count.'),
2520:("Tester l’accès au regroupement",'Corrects “test grouping access,” which currently reads as access to a test group.'),
2531:("Configuration de l’API Komga de Grimmory",'Uses natural French order for Grimmory’s Komga API setup.'),
2533:("Configuration OPDS de Grimmory",'Uses natural French order for Grimmory’s OPDS setup.'),
2536:("L’étagère de lecture gérée n’a pas pu être supprimée.",'Uses the reader-shelf term and the correct failed-removal status.'),
2546:("Les étagères de lecture gérées n’ont pas pu être chargées.",'Corrects “tablettes,” which refers to tablets rather than shelves.'),
2547:("Étagères de lecture gérées par SeerrNG",'Uses the reader-shelf meaning and natural modifier order.'),
2553:("Connectez un compte administrateur pour que SeerrNG puisse prévisualiser, créer et mettre à jour les étagères de lecture. Les mots de passe sont enregistrés dans les paramètres protégés de l’application et ne sont jamais renvoyés par l’API. Les identifiants de l’application de lecture et d’OPDS restent distincts.",'Corrects “tablettes” and clarifies that reader-app and OPDS credentials are separate.'),
2558:("Visible uniquement pour le compte connecté",'Expresses that the setting is visible only to the connected account.'),
2562:("Paramètres du lecteur enregistrés.",'Corrects the current wording, which reads as settings belonging to saved readers.'),
2563:("Enregistré ; laissez le champ vide pour conserver le mot de passe.",'Clarifies the saved-password instruction and avoids treating “Saved” as an imperative.'),
2564:("Enregistrement en cours…",'Uses an in-progress status instead of the imperative “save.”'),
2565:("BookOrbit verrouille la visibilité de SmartScope lors de sa création. Si la synchronisation Kobo est activée, SeerrNG maintient également une Collection classique et réconcilie ses membres toutes les 15 minutes.",'Restores the missing SmartScope/Kobo-sync details and preserves all product names.'),
2572:('BookOrbit','Preserves the product name; the current translation changes it to “LivreOrbit”.'),
2577:("La livraison Kobo de Grimmory utilise son étagère d’inclusion dédiée. SeerrNG ne modifie pas le paramètre du fournisseur.",'Repairs the ungrammatical sentence while retaining the separate inclusion shelf and unchanged provider setting.'),
2578:("Faire de ceci une étagère de lecture",'Corrects the current wording, which says to turn a reader into a shelf.'),
2579:("SeerrNG créera dans votre service de lecture un regroupement dynamique basé sur des règles. Il restera à jour à mesure que la bibliothèque évolue ; il ne copiera pas les fichiers.",'Clarifies the live rule-based grouping and preserves the no-file-copy distinction.'),
2590:("Quelques éléments correspondants",'Avoids “matchs,” which commonly means sports matches in this context.'),
2593:("Enregistrement de l’étagère…",'Corrects “étagère de sauvegarde,” which reads as a backup shelf.'),
2594:("Configurez un service de lecture dans Paramètres > Services > Applications pour lecteurs, puis revenez ici.",'Matches the localized Reader Apps route label.'),
2595:("Afficher ce regroupement aux autres utilisateurs du service de lecture",'Repairs the malformed “service au lecteur” phrase.'),
2599:("Enregistrer les modifications de l’étagère",'Corrects “tablettes,” which means tablets rather than shelves.'),
},
'hi':{
2500:('{serviceName} में ई-बुक ब्राउज़ करें','Restores the service relation and the correct Hindi word order.'),
2502:('{serviceName} में पत्रिका की PDF ब्राउज़ करें','Restores the service relation and a readable magazine-PDF label.'),
2504:('रीडर ऐप का पता','Restores the reader-app address meaning.'),
2505:('वह पता दर्ज करें जिसे पाठक ब्राउज़र में खोल सकें। रिवर्स प्रॉक्सी का उपयोग करते हैं तो उसका बेस पाथ भी शामिल करें। आप पूरा OPDS पता या Grimmory Komga पता पेस्ट कर सकते हैं।','Repairs the malformed sentence and preserves the reverse-proxy base path.'),
2507:('BookOrbit','Preserves the product name; the current target transliterates it.'),
2510:('बदलाव रद्द करें','Uses a natural Hindi discard-changes action.'),
2513:('सहेजे गए खाते के क्रेडेंशियल हटाएँ','Specifies that saved account credentials are removed.'),
2514:('Komga कॉमिक रीडर का पता','Restores natural order for the comic-reader address.'),
2515:('पेज-दर-पेज स्ट्रीमिंग के लिए इस पते का उपयोग Komga-संगत कॉमिक ऐप में करें। Grimmory का Komga API सक्षम करें और वही OPDS रीडर क्रेडेंशियल इस्तेमाल करें।','Restores the missing OPDS credential instruction and the page-by-page context.'),
2517:('क्या इस SeerrNG-प्रबंधित समूह को रीडर सेवा से हटाएँ? पुस्तकें और लाइब्रेरी फ़ाइलें हटाई नहीं जाएँगी।','Restores the source question and clarifies that library files are not deleted.'),
2520:('समूह तक पहुँच जाँचें','Clarifies that access to the grouping is being tested.'),
2524:('कॉमिक रीडर का पता कॉपी करें','Restores natural word order and the copy action.'),
2526:('यहाँ क्लिपबोर्ड का उपयोग उपलब्ध नहीं है। ऊपर दिया गया रीडर पता चुनकर कॉपी करें।','Uses the clipboard term and retains both instructions.'),
2529:('Grimmory या BookOrbit को जोड़ें ताकि संगत रीडर ऐप में ई-बुक, ऑडियोबुक, कॉमिक और पत्रिका के अंक ब्राउज़ करके उपलब्ध करा सकें।','Clarifies delivery to compatible reader apps.'),
2530:('अनुशंसित। Grimmory ई-बुक और PDF के लिए OPDS कैटलॉग, स्ट्रीम किए गए कॉमिक पृष्ठों के लिए Komga API, और M4B, M4A तथा MP3 ऑडियोबुक के लिए अंतर्निर्मित प्लेयर देता है।','Preserves the product/API/format literals that were transliterated in the current text.'),
2531:('Grimmory Komga API सेटअप','Preserves both product and API names.'),
2535:('पूर्वावलोकन में {count} आइटम मिले; अंतिम संख्या की पुष्टि नहीं हुई है।','Corrects the broken preview sentence and clarifies the unconfirmed count.'),
2536:('प्रबंधित रीडर शेल्फ़ हटाई नहीं जा सकी।','Uses the correct failed-removal status.'),
2538:('ध्यान देने की आवश्यकता','Uses a clear attention-needed status.'),
2544:('अपडेट हो रहा है','Uses an in-progress status.'),
2545:('तैयार','Uses the natural Hindi ready state.'),
2546:('प्रबंधित रीडर शेल्फ़ लोड नहीं हो सकीं।','Restores the reader-shelf meaning and correct loading status.'),
2547:('SeerrNG द्वारा प्रबंधित रीडर शेल्फ़','Uses a natural managed-by label.'),
2550:('उन्हीं मीडिया फ़ोल्डरों को Grimmory या BookOrbit में आयात या माउंट करें और उस सेवा को उन्हें स्कैन करने दें। रीडर सेवा के कंटेनर के भीतर दिखने वाला पाथ इस्तेमाल करें। कुछ नेटवर्क शेयरों पर शेड्यूल किए गए स्कैन, फ़ाइल सिस्टम वॉचर से अधिक भरोसेमंद होते हैं।','Corrects the path/container and filesystem-watcher/network-share meanings.'),
2551:('रीडर सेटिंग्स लोड नहीं की जा सकीं।','Restores the settings meaning and software-loading status.'),
2552:('SeerrNG ने अभी तक कोई रीडर शेल्फ़ नहीं बनाई है।','Restores the “none created yet” meaning.'),
2553:('व्यवस्थापक खाता जोड़ें ताकि SeerrNG रीडर शेल्फ़ का पूर्वावलोकन, निर्माण और अद्यतन कर सके। पासवर्ड सुरक्षित ऐप सेटिंग्स में रखे जाते हैं और API कभी उन्हें वापस नहीं करता। रीडर ऐप और OPDS के क्रेडेंशियल अलग-अलग रहते हैं।','Corrects unrelated intelligence-report/card text and restores the OPDS credentials.'),
2554:('{serviceName} खोलें','Uses the open action rather than the state “open.”'),
2557:('कॉन्फ़िगर होने पर SeerrNG पसंदीदा ऐप खोलता है। अगर उसका पता नहीं है, तो SeerrNG दूसरा कॉन्फ़िगर किया गया ऐप इस्तेमाल करता है। डिफ़ॉल्ट रूप से Grimmory ही पसंदीदा रहता है।','Corrects the tense and the mistranslated “stays preferred.”'),
2558:('कनेक्ट किए गए खाते के लिए निजी','Expresses the account-specific visibility.'),
2560:('रीडर सेटिंग्स सहेजें','Restores the save action and reader-settings object.'),
2561:('रीडर सेटिंग्स सहेजी नहीं जा सकीं।','Restores the correct failed-save status.'),
2562:('रीडर सेटिंग्स सहेजी गईं।','Restores the saved-settings status.'),
2565:('BookOrbit, SmartScope बनाते समय उसकी दृश्यता लॉक कर देता है। Kobo सिंक चालू होने पर SeerrNG एक सामान्य Collection भी बनाए रखता है और हर 15 मिनट में उसके सदस्यों का मिलान करता है।','Restores the deleted SmartScope/Kobo behavior and all product names.'),
2569:('मीडिया विवरण पृष्ठों पर रीडर लिंक इस्तेमाल करने से पहले ये सेटिंग्स सहेजें।','Restores the save-first instruction and reader-link meaning.'),
2571:('रीडर शेल्फ़ बनाएँ','Restores the missing create action.'),
2572:('BookOrbit','Preserves the product name; the current target transliterates it.'),
2574:('पूर्वावलोकन में {count} आइटम मिले। रीडर सेवा ने अभी तक सहेजी गई संख्या की पुष्टि नहीं की है।','Adds the missing sentence break and corrects “saved count.”'),
2575:('फिर भी यह गतिशील नियम बनाएँ ताकि भविष्य में इससे मेल खाने वाली किताबें अपने-आप दिखाई दें।','Removes duplicated “future” and clarifies matching books.'),
2577:('Grimmory की Kobo डिलीवरी में अलग समावेशन शेल्फ़ का उपयोग होता है। SeerrNG सेवा प्रदाता की सेटिंग में बदलाव नहीं करता।','Restores the separate inclusion shelf and unchanged provider setting.'),
2579:('SeerrNG आपकी रीडर सेवा में नियम-आधारित गतिशील समूह बनाएगा। लाइब्रेरी बदलने पर यह समूह अपडेट होता रहेगा; फ़ाइलों की प्रतिलिपि नहीं बनेगी।','Corrects the “stays until the library changes” meaning and preserves that files are not copied.'),
2581:('{count, plural, one {# अभी मेल खाने वाला आइटम} other {# अभी मेल खाने वाले आइटम}}','Corrects the other branch, which currently says “day,” and clarifies that the count is matching items.'),
2582:('इस नियम से कोई मौजूदा किताब मेल नहीं खाती।','Uses natural Hindi agreement for the no-match state.'),
2583:('{serviceName} खोलें','Uses the open action rather than the state “open.”'),
2584:('शेल्फ़ सेटअप बंद करें','Restores the shelf-setup meaning.'),
2585:('मेल खाने वाली किताबों का पूर्वावलोकन करें','Restores the matches object in the preview action.'),
2586:('रीडर लाइब्रेरी की जाँच नहीं हो सकी।','Uses the correct failed-check status.'),
2587:('लाइब्रेरी की जाँच हो रही है…','Uses the in-progress status.'),
2589:('रीडर शेल्फ़ सहेजी गई।','Corrects the unrelated widget meaning.'),
2590:('मेल खाने वाले कुछ आइटम','Corrects the wrong sports-match term.'),
2592:('रीडर शेल्फ़ सहेजी नहीं जा सकी।','Corrects the failed-save status.'),
2593:('शेल्फ़ सहेजी जा रही है…','Uses an in-progress status.'),
2594:('सेटिंग > सेवाएँ > रीडर ऐप्स में रीडर सेवा सेट करें, फिर यहाँ लौटें।','Uses the exact localized Settings, Services, and Reader Apps route labels.'),
2596:('यदि आपका रीडर या OPDS खाता किसी अन्य रीडर-सेवा उपयोगकर्ता का है, तो यह समूह साझा करें ताकि वह खाता इसे देख सके। रीडर खाते को अभी भी मेल खाने वाली लाइब्रेरी तक पहुँच चाहिए।','Corrects the “matching library” phrase and clarifies account access.'),
2597:('इस गतिशील नियम को Kobo से सिंक करें','Uses “to Kobo” correctly and clarifies the live-rule concept.'),
2599:('शेल्फ़ के बदलाव सहेजें','Restores the save action and shelf object.'),
},
'id':{
2501:('Buka perpustakaan {serviceName} di browser. Untuk menelusurinya di aplikasi pembaca, salin alamat OPDS-nya dari Pengaturan > Layanan > App Pembaca, lalu tambahkan alamat itu di aplikasi.','Uses the localized App Pembaca route and clarifies where the copied address goes.'),
2505:('Masukkan alamat yang dapat dibuka pembaca di browser. Jika menggunakan reverse proxy, sertakan juga path dasarnya. Anda dapat menempelkan alamat OPDS lengkap atau alamat Komga Grimmory.','Repairs the malformed word order and retains the reverse-proxy instruction.'),
2510:('Buang perubahan','Uses the natural discard-changes action.'),
2514:('Alamat Pembaca Komik Komga','Uses natural Indonesian order for the address.'),
2515:('Gunakan alamat ini di aplikasi komik yang kompatibel dengan Komga untuk streaming halaman demi halaman. Aktifkan API Komga Grimmory dan gunakan kredensial pembaca OPDS yang sama.','Corrects “page page” and the broken possessive.'),
2520:('Uji akses ke pengelompokan','Clarifies that grouping access is being tested.'),
2524:('Salin Alamat Pembaca Komik','Uses the Indonesian comic term and restores natural word order.'),
2530:('Disarankan. Grimmory menyediakan katalog OPDS untuk e-book dan PDF, API Komga untuk streaming halaman komik, serta pemutar bawaan untuk buku audio M4B, M4A, dan MP3.','Clarifies streamed comic pages and that M4B/M4A/MP3 are audiobook formats.'),
2533:('Penyiapan OPDS Grimmory','Corrects “PILIHAN,” which means choice rather than setup.'),
2546:('Rak pembaca yang dikelola tidak dapat dimuat.','Uses the software-load meaning and reader-shelf object.'),
2550:('Impor atau pasang folder media yang sama ke Grimmory atau BookOrbit, lalu biarkan layanan itu memindainya. Gunakan path sebagaimana terlihat di dalam container layanan pembaca. Pemindaian terjadwal lebih andal daripada pemantau sistem berkas pada beberapa folder berbagi jaringan.','Corrects the path/container and network-share mistranslations.'),
2553:('Hubungkan akun administrator agar SeerrNG dapat melihat pratinjau, membuat, dan memperbarui rak pembaca. Kata sandi disimpan dalam pengaturan aplikasi yang terlindungi dan tidak pernah dikembalikan oleh API. Kredensial aplikasi pembaca dan OPDS tetap terpisah.','Restores the missing reader-app credentials and the separate-credentials statement.'),
2557:('SeerrNG membuka aplikasi pilihan jika sudah dikonfigurasi. Jika aplikasi itu tidak memiliki alamat, SeerrNG menggunakan aplikasi lain yang dikonfigurasi. Grimmory tetap menjadi pilihan bawaan.','Clarifies the missing referent and “preferred by default.”'),
2558:('Pribadi untuk akun yang terhubung','Uses natural wording for account-scoped privacy.'),
2563:('Tersimpan; biarkan kosong agar tetap tersimpan','Clarifies that a saved password is kept by leaving the field blank.'),
2565:('BookOrbit mengunci visibilitas SmartScope saat scope dibuat. Jika sinkronisasi Kobo aktif, SeerrNG juga mempertahankan Collection biasa dan menyelaraskan anggotanya setiap 15 menit.','Restores the missing SmartScope/Kobo-sync details and protected product names.'),
2569:('Simpan pengaturan ini sebelum menggunakan tautan pembaca pada halaman detail media.','Uses a natural media-detail-page and reader-link phrase.'),
2574:('Jumlah pratinjau: {count}. Layanan pembaca belum mengonfirmasi jumlah yang tersimpan.','Adds the missing space and corrects the malformed saved-count wording.'),
2575:('Tetap buat aturan dinamis ini agar buku yang cocok di masa mendatang muncul secara otomatis.','Clarifies “live rule” and the future matching behavior.'),
2577:('Fitur pengiriman Kobo Grimmory menggunakan rak penyertaan terpisah. SeerrNG tidak mengubah pengaturan penyedia tersebut.','Repairs the broken clause while preserving the distinct inclusion shelf and unchanged provider setting.'),
2581:('{count, plural, one {# item yang cocok saat ini} other {# item yang cocok saat ini}}','Uses “matching item” rather than the awkward generic “cocok.”'),
2584:('Tutup penyiapan rak','Restores the shelf-setup object.'),
2585:('Pratinjau hasil yang cocok','Clarifies that the preview is of matches.'),
2587:('Memeriksa pustaka…','Uses the in-progress status.'),
2590:('Beberapa hasil yang cocok','Corrects the incomplete “beberapa cocok.”'),
2593:('Menyimpan rak…','Uses an in-progress status.'),
2594:('Siapkan layanan pembaca di Pengaturan > Layanan > App Pembaca, lalu kembali ke sini.','Uses the localized Reader Apps route label.'),
2597:('Sinkronkan aturan dinamis ini ke Kobo','Uses the correct target direction and clarifies the dynamic-rule meaning.'),
}
}

def sha(x): return hashlib.sha256(x.encode('utf-8')).hexdigest()
rows_in=[json.loads(s) for s in (OUT/'batch-02-input.jsonl').read_text().splitlines()]
assert len(rows_in)==300
rows_out=[];counts=collections.Counter(); per=collections.defaultdict(collections.Counter)
for c in rows_in:
 loc=c['locale']; pos=c['sourcePosition']; fix=FIX.get(loc,{}).get(pos)
 if fix:
  final,rationale=fix; disp='propose-correction'; confidence='moderate'
  if final==c['currentTarget']: raise SystemExit(f'no-op candidate: {loc}:{pos}')
 else:
  final=c['currentTarget']; disp='accept-current'; confidence='moderate'
  rationale='Current wording preserves the English meaning in the pinned reader-service context; its placeholders, markup, protected literals, and applicable app labels were reviewed.'
 row={'sourcePosition':pos,'sourceId':c['sourceId'],'locale':loc,'currentTargetHash':c['currentTargetHash'],'disposition':disp,'finalTarget':final,'rationale':rationale,'confidence':confidence,'reviewer':'primary-static-semantic-review'}
 rows_out.append(row); counts[disp]+=1; per[loc][disp]+=1
assert len(rows_out)==300 and len({(x['sourcePosition'],x['locale']) for x in rows_out})==300
assert {x['locale'] for x in rows_out}=={'fr','hi','id'}
(OUT/'batch-02-review.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows_out))
# Evidence-integrity review over this batch.
def ph(s):
 out=[]; i=0
 while i<len(s):
  if s[i]!='{': i+=1; continue
  depth=1; j=i+1
  while j<len(s) and depth:
   if s[j]=='{': depth+=1
   elif s[j]=='}': depth-=1
   j+=1
  if depth: break
  body=s[i+1:j-1]; m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
  if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
  i=j
 return sorted(out,key=lambda x:(x['name'],x['kind']))
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def categories(s): return sorted(set(re.findall(r'(?<![A-Za-z0-9_])(zero|one|two|few|many|other)\s*\{',s)))
current_by={(c['sourcePosition'],c['locale']):c for c in rows_in}
for r in rows_out:
 c=current_by[(r['sourcePosition'],r['locale'])]; final=r['finalTarget']
 if r['disposition']=='accept-current': assert final==c['currentTarget']
 assert ph(c['source'])==ph(final),(r['locale'],r['sourcePosition'],'placeholder drift',ph(c['source']),ph(final))
 assert tags(c['source'])==tags(final),(r['locale'],r['sourcePosition'],'markup drift')
 assert 'other' in categories(final) if any(x['kind'] in ('plural','select','selectordinal') for x in ph(c['source'])) else True,(r['locale'],r['sourcePosition'],'missing ICU other')
 missing=[t for t in c['protectedLiterals'] if t not in final]
 if missing: raise SystemExit(f'protected literal drift {r["locale"]}:{r["sourcePosition"]}: {missing}')
 if r['disposition']=='propose-correction': assert final!=c['currentTarget']
print(json.dumps({'rows':len(rows_out),'counts':dict(counts),'perLocale':{k:dict(v) for k,v in per.items()},'proposals':sum(1 for x in rows_out if x['disposition']=='propose-correction'),'holds':0,'integrityIssues':0,'sha256':sha((OUT/'batch-02-review.jsonl').read_text())},ensure_ascii=False,indent=2))
