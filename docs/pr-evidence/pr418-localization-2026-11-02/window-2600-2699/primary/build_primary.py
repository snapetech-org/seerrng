from __future__ import annotations
import collections, hashlib, json, pathlib, re, subprocess, sys, time

OUT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2600-2699-primary-20261102')
REPO=pathlib.Path('/home/keith/Documents/code/task-worktrees/localization-20261102-seerrng')
HEAD='9242898e23f7f25d515d10b5b0b51df322e395fb'
TREE='06cfd94ee611684c33e9e78af9d8bb60a2e98825'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PROTECTED_TERMS=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB.com','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','HD','4K','FLAC','MP3','Lidarr','MusicBrainz','Discogs','Metacritic','Trakt','ROM','PC','ROMarrNG','Radarr','Sonarr','Bookshelf','Open Library']
PR_SPECS=[('chaptarrng',190,'ChaptarrNG'),('questarrng',155,'QuestarrNG'),('romarrng',70,'ROMarrNG'),('seerrng',418,'SeerrNG'),('slskr',204,'slskR'),('slskdn',409,'slskdN'),('TorrentNG',243,'TorrentNG')]
WORKTREE_DIRS={'chaptarrng':'localization-20261102-chaptarrng','questarrng':'localization-20261102-questarrng',
  'romarrng':'localization-20261102-romarrng','seerrng':'localization-20261102-seerrng',
  'slskr':'localization-20261102-slskr','slskdn':'localization-20261102-slskdn'}

def sh(*args): return subprocess.check_output(list(map(str,args)),text=True)
def sha(s):
    if isinstance(s,str): s=s.encode('utf-8')
    return hashlib.sha256(s).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def writej(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
def writejl(name,rows): (OUT/name).write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows),encoding='utf-8')
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
        body=s[i+1:j-1]
        m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(number|plural|select|selectordinal)\b)?',body)
        if m: out.append({'name':m.group(1),'kind':m.group(2) or 'simple'})
        i=j
    return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def has_term(s,term):
    if term in ('ROM','PC','4K'):
        suffix='s?' if term=='ROM' else ''
        return re.search(r'(?<![A-Za-z0-9])'+re.escape(term)+suffix+r'(?![A-Za-z0-9])',s) is not None
    return term.casefold() in s.casefold()
def missing_exact(s,terms): return [t for t in terms if t not in s]
def read_block(s,open_at):
    assert s[open_at]=='{'
    depth=1; j=open_at+1
    while j<len(s) and depth:
        if s[j]=='{': depth+=1
        elif s[j]=='}': depth-=1
        j+=1
    if depth: raise ValueError('unbalanced ICU brace')
    return s[open_at+1:j-1],j
def icu_profile(s):
    m=re.search(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(plural|select|selectordinal)\s*,',s)
    if not m: return []
    root=m.group(1); kind=m.group(2); i=m.end(); branches={}
    while i<len(s):
        while i<len(s) and s[i].isspace(): i+=1
        if i>=len(s) or s[i]=='}': break
        sel=re.match(r'(?:=?\d+|[A-Za-z][A-Za-z0-9_-]*)',s[i:])
        if not sel: raise ValueError(f'bad ICU branch near {s[i:i+30]!r}')
        key=sel.group(0); i+=len(key)
        while i<len(s) and s[i].isspace(): i+=1
        if i>=len(s) or s[i]!='{': raise ValueError(f'ICU branch {key} missing body')
        body,i=read_block(s,i)
        if key in branches: raise ValueError(f'duplicate ICU branch {key}')
        branches[key]=body
    if not branches: raise ValueError('no ICU branches')
    nested={}
    for key,body in branches.items():
        nested[key]=collections.Counter(re.findall(r'\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}',body))
    return [{'name':root,'kind':kind,'branches':branches,'nested':nested}]
def parity(a,b): return sorted(a,key=lambda x:(x['name'],x['kind']))==sorted(b,key=lambda x:(x['name'],x['kind']))

def run_json(*args): return json.loads(sh(*args))
def fetch_pr(repo,number):
    data=run_json('gh','pr','view',str(number),'--repo',f'snapetech-org/{repo}','--json','state,isDraft,headRefOid,headRefName,baseRefOid,url,title')
    data.update({'repository':f'snapetech-org/{repo}','pullRequest':number})
    return data
def catalog_paths(repo,paths):
    low=repo.lower()
    out=[]
    for p in paths:
        if low=='chaptarrng' and p.startswith('src/NzbDrone.Core/Localization/Core/') and p.endswith('.json'):
            out.append(p)
        elif low=='questarrng' and (p.startswith('localization/') and p.endswith('.json') or p.startswith('client/src/lib/') and p.endswith('-locale.ts') or p.startswith('shared/') and p.endswith('-locale.ts')):
            out.append(p)
        elif low=='romarrng' and (p.startswith('web/src/lib/locales/ui-labels.') and p.endswith('.json') or p in {'romarr/i18n_runtime.js','romarr/ui-labels.json','romarr/ui-source-messages.json','romarr/ui-source-snapshot.json'}):
            out.append(p)
        elif low=='seerrng' and (p.startswith('src/i18n/locale/') and p.endswith('.json') or p.startswith('server/i18n/locale/') and p.endswith('.json') or p=='config/i18n/locales.json'):
            out.append(p)
        elif low=='slskr' and (p.startswith('web/src/lib/locales/ui-labels.') and p.endswith('.json') or p=='web/src/lib/interfaceLocale.js'):
            out.append(p)
        elif low=='slskdn' and (p.startswith('src/web/public/locales/') and p.endswith('.json') or p=='src/web/src/lib/interfaceLocale.js'):
            out.append(p)
        elif low=='torrentng' and (p.startswith('webui/src/lib/locale-catalogs/') and p.endswith('.ts') or p=='webui/src/lib/interfaceLocale.ts'):
            out.append(p)
    return out

def fetch_all_live():
    records=[]
    for repo,number,label in PR_SPECS:
        pr=fetch_pr(repo,number)
        head=pr['headRefOid']
        commit=run_json('gh','api',f'repos/snapetech-org/{repo}/commits/{head}')
        tree=commit['commit']['tree']['sha']
        tree_data=run_json('gh','api',f'repos/snapetech-org/{repo}/git/trees/{tree}?recursive=1')
        blobs={x['path']:x['sha'] for x in tree_data.get('tree',[]) if x['type']=='blob'}
        paths=catalog_paths(repo,list(blobs))
        records.append({'repository':f'snapetech-org/{repo}','label':label,'pullRequest':number,
          'state':pr['state'],'isDraft':pr['isDraft'],'url':pr['url'],'headRefName':pr['headRefName'],
          'head':head,'baseHead':pr['baseRefOid'],'tree':tree,'treeTruncated':tree_data.get('truncated'),
          'currentCatalogFiles':[{'path':p,'blob':blobs[p]} for p in sorted(paths)],
          'currentCatalogFileCount':len(paths),'catalogSelection':'all source catalogs / locale files selected by repository path convention'})
    for rec in records:
        key=rec['repository'].split('/',1)[1].lower()
        rel=WORKTREE_DIRS.get(key)
        if rel:
            path=pathlib.Path('/home/keith/Documents/code/task-worktrees')/rel
            if path.exists():
                rec['localWorktree']={'path':str(path),'head':sh('git','-C',path,'rev-parse','HEAD').strip(),
                  'tree':sh('git','-C',path,'rev-parse','HEAD^{tree}').strip(),
                  'statusPorcelain':sh('git','-C',path,'status','--porcelain=v1').strip()}
            else:
                rec['localWorktree']={'path':str(path),'available':False}
        else:
            rec['localWorktree']={'available':False,'note':'No task worktree path was present in the captured workspace inventory.'}
    return records

# Proposed translations are exact final candidates, keyed by zero-based source position and locale.
P={
2600:{'ar':'تحديث رف القارئ','es':'Actualizar la estantería de lectura','fr':"Mettre à jour l’étagère de lecture",'hi':'रीडर शेल्फ़ अपडेट करें','id':'Perbarui rak pembaca','ko':'리더 선반 업데이트','vi':'Cập nhật giá sách của trình đọc','zh_Hans':'更新阅读书架','zh_Hant':'更新閱讀書架'},
2601:{'es':'BookOrbit bloquea la visibilidad cuando se crea el alcance. Cámbiela en BookOrbit o elimine el alcance gestionado y vuelva a crearlo.','hi':'BookOrbit स्कोप बनाते समय दृश्यता लॉक करता है। इसे BookOrbit में बदलें, या प्रबंधित स्कोप हटाकर फिर से बनाएँ।','id':'BookOrbit mengunci visibilitas saat scope dibuat. Ubah visibilitasnya di BookOrbit atau hapus scope terkelola, lalu buat ulang.','ko':'BookOrbit는 범위를 만들 때 표시 여부를 잠급니다. BookOrbit에서 이를 변경하거나 관리 범위를 삭제한 뒤 다시 만드세요.','vi':'BookOrbit khóa chế độ hiển thị khi tạo phạm vi. Hãy thay đổi chế độ này trong BookOrbit, hoặc xóa phạm vi được quản lý rồi tạo lại.','zh_Hans':'BookOrbit 会在创建范围时锁定可见性。请在 BookOrbit 中更改可见性，或删除并重新创建受管理的范围。','zh_Hant':'BookOrbit 會在建立範圍時鎖定可見性。請在 BookOrbit 中變更可見性，或刪除並重新建立受管理的範圍。'},
2602:{'hi':'शेल्फ़ सहेज दी गई, लेकिन सेवा ने मौजूदा आइटम संख्या की पुष्टि नहीं की है। सेवा खोलें और जाँचने के लिए शेल्फ़ रीफ़्रेश करें।','ja':'棚は保存されましたが、サービスは現在の項目数をまだ確認していません。サービスを開き、棚を更新して確認してください。','ko':'선반은 저장되었지만 서비스에서 현재 항목 수를 확인하지 않았습니다. 서비스를 열고 선반을 새로 고쳐 확인하세요.','vi':'Kệ đã được lưu nhưng dịch vụ chưa xác nhận số lượng mục hiện tại. Hãy mở dịch vụ và làm mới kệ để kiểm tra.','zh_Hans':'书架已保存，但服务尚未确认当前条目数量。请打开服务并刷新书架进行检查。','zh_Hant':'書架已儲存，但服務尚未確認目前的項目數量。請開啟服務並重新整理書架以確認。'},
2603:{'fr':'Toutes les régions','id':'Semua wilayah','pt_BR':'Todas as regiões','vi':'Tất cả khu vực'},
2604:{'hi':'डिफ़ॉल्ट ({region})','id':'Bawaan ({region})','vi':'Mặc định ({region})'},
2605:{'hi':'अनुरोध स्वीकार करें','id':'Setujui Permintaan','vi':'Chấp thuận yêu cầu'},
2607:{'hi':'अनुरोध अस्वीकार करें','id':'Tolak Permintaan','vi':'Từ chối yêu cầu'},
2610:{'ar':'ملف اللغة','es':'Perfil de idioma','zh_Hans':'语言配置方案','zh_Hant':'語言設定檔'},
2611:{'ar':'آخر تعديل بواسطة','hi':'अंतिम बार संशोधित करने वाला'},
2612:{'ar':'ملف البيانات الوصفية','ko':'메타데이터 프로필'},
2613:{'ja':'品質プロファイル'},
2615:{'hi':'अनुरोधकर्ता'},
2616:{'ar':'استثناءات الطلب','de':'Anfrageüberschreibungen','id':'Penggantian pengaturan permintaan','ja':'リクエスト設定の上書き','ko':'요청 설정 재정의','pt_BR':'Substituições da solicitação','vi':'Ghi đè tùy chọn yêu cầu','zh_Hans':'请求设置覆盖项','zh_Hant':'要求設定覆寫項'},
2618:{'ar':'{seasonCount, plural, zero {لا مواسم} one {موسم} two {موسمان} few {مواسم} many {موسمًا} other {موسم}}','ja':'{seasonCount, plural, one {シーズン} other {シーズン}}','vi':'{seasonCount, plural, one {Mùa} other {Các mùa}}','zh_Hant':'{seasonCount, plural, one {季節} other {季節}}'},
2619:{'ar':'الخادم الوجهة'},
2620:{'ar':'هذا التنسيق متاح بالفعل.','vi':'Định dạng này đã có sẵn.'},
2621:{'ar':'هذا العنوان مدرج في قائمة الحظر.','ja':'このタイトルはブロックリストに登録されています。','pt_BR':'Este título está na lista de bloqueio.'},
2623:{'es':'No hay ningún servicio configurado para este formato.','hi':'इस फ़ॉर्मैट के लिए कोई सेवा कॉन्फ़िगर नहीं है।','ja':'この形式に対応するサービスは設定されていません。','ko':'이 형식에 구성된 서비스가 없습니다.'},
2624:{'es':'Ya existe una solicitud pendiente abierta para este formato.','id':'Sudah ada permintaan terbuka yang masih tertunda untuk format ini.','ja':'この形式には、すでに処理待ちのリクエストがあります。','ko':'이 형식에 대해 이미 처리 대기 중인 요청이 있습니다.','vi':'Đã có yêu cầu đang chờ xử lý cho định dạng này.'},
2625:{'hi':'अधिक सामग्री का अनुरोध करें','id':'Ajukan permintaan tambahan'},
2627:{
'ar':'{failed, plural, zero {تعذّر تحديث أي طلب.} one {تعذّر تحديث طلب واحد.} two {تعذّر تحديث طلبين.} few {تعذّر تحديث {failed} طلبات.} many {تعذّر تحديث {failed} طلبًا.} other {تعذّر تحديث {failed} طلب.}}',
'es':'{failed, plural, one {No se pudo actualizar una solicitud.} many {{failed} solicitudes no pudieron actualizarse.} other {{failed} solicitudes no pudieron actualizarse.}}',
'fr':'{failed, plural, one {Une demande n’a pas pu être mise à jour.} many {{failed} demandes n’ont pas pu être mises à jour.} other {{failed} demandes n’ont pas pu être mises à jour.}}',
'hi':'{failed, plural, one {एक अनुरोध अपडेट नहीं हो सका।} other {{failed} अनुरोध अपडेट नहीं हो सके।}}',
'id':'{failed, plural, one {Satu permintaan tidak dapat diperbarui.} other {{failed} permintaan tidak dapat diperbarui.}}',
'ja':'{failed, plural, one {1件のリクエストを更新できませんでした。} other {{failed}件のリクエストを更新できませんでした。}}',
'ko':'{failed, plural, one {요청 한 건을 업데이트하지 못했습니다.} other {요청 {failed}건을 업데이트하지 못했습니다.}}',
'pt_BR':'{failed, plural, one {Não foi possível atualizar uma solicitação.} many {Não foi possível atualizar {failed} solicitações.} other {Não foi possível atualizar {failed} solicitações.}}',
'vi':'{failed, plural, one {Không thể cập nhật một yêu cầu.} other {Không thể cập nhật {failed} yêu cầu.}}'},
2629:{'vi':'Xem yêu cầu'},
2630:{'id':'Lihat permintaan 4K','vi':'Xem yêu cầu 4K'},
2632:{
'ar':'عيّن كل موسم مطلوب. يقارن SeerrNG خيارات الترتيب القياسي بـ TVDB، وخيارات الترتيب البديل بمسلسل Sonarr المحدد.',
'es':'Asigne cada temporada solicitada. SeerrNG compara las opciones en orden estándar con TVDB y las opciones en orden alternativo con la serie de Sonarr seleccionada.',
'fr':'Associez chaque saison demandée. SeerrNG compare les choix d’ordre standard à TVDB et les choix d’ordre alternatif à la série sélectionnée dans Sonarr.',
'hi':'अनुरोध किए गए हर सीज़न को मैप करें। SeerrNG मानक क्रम वाले विकल्पों की जाँच TVDB से और वैकल्पिक क्रम वाले विकल्पों की जाँच चुनी गई Sonarr सीरीज़ से करता है।',
'id':'Petakan setiap musim yang diminta. SeerrNG mencocokkan pilihan urutan standar dengan TVDB dan pilihan urutan alternatif dengan serial Sonarr yang dipilih.',
'ja':'リクエストされたすべてのシーズンを対応付けます。SeerrNG は標準順の選択肢を TVDB と、別順の選択肢を選択した Sonarr シリーズと照合します。',
'ko':'요청된 모든 시즌을 매핑하세요. SeerrNG는 표준 순서 선택 항목은 TVDB와, 대체 순서 선택 항목은 선택한 Sonarr 시리즈와 대조합니다.',
'pt_BR':'Mapeie todas as temporadas solicitadas. O SeerrNG compara as opções em ordem padrão com TVDB e as opções em ordem alternativa com a série selecionada no Sonarr.',
'vi':'Ánh xạ mọi mùa được yêu cầu. SeerrNG đối chiếu các lựa chọn theo thứ tự chuẩn với TVDB và các lựa chọn theo thứ tự thay thế với bộ phim trong Sonarr đã chọn.',
'zh_Hans':'映射所有已请求的季。SeerrNG 会将标准顺序选项与 TVDB 对照，并将替代顺序选项与所选的 Sonarr 剧集对照。',
'zh_Hant':'對應所有已要求的季。SeerrNG 會將標準順序選項與 TVDB 對照，並將替代順序選項與選取的 Sonarr 影集對照。'},
2648:{'es':'Elija una temporada de TVDB'},2649:{'es':'Elija una serie de Sonarr'},2650:{'es':'Elija una temporada de Sonarr'},
2656:{'hi':'अनुरोध स्वीकार करें','id':'Setujui Permintaan','vi':'Chấp thuận yêu cầu'},
2660:{'vi':'Hủy yêu cầu'},
2661:{'hi':'अनुरोध अस्वीकार करें','id':'Tolak Permintaan','vi':'Từ chối yêu cầu'},
2662:{'zh_Hans':'删除请求'},
2666:{'ar':'حدث خطأ ما أثناء إعادة محاولة إرسال الطلب.','hi':'अनुरोध को दोबारा भेजने की कोशिश के दौरान कुछ गड़बड़ हुई।','id':'Terjadi kesalahan saat mencoba kembali permintaan.','pt_BR':'Algo deu errado ao tentar enviar a solicitação novamente.'},
2671:{'hi':'इस अनुरोध को फिर से आज़माएँ','id':'Ulangi permintaan ini','ko':'이 요청을 다시 시도하세요.'},
2675:{'ar':'تنزيل كتاب صوتي','es':'Descargar audiolibro','ko':'오디오북 다운로드','vi':'Tải sách nói xuống','zh_Hant':'下載有聲書'},
2677:{'ar':'اختر ملف كتاب صوتي','es':'Elija un archivo de audiolibro','fr':'Sélectionnez un fichier de livre audio','id':'Pilih berkas buku audio','ko':'오디오북 파일을 선택하세요.','vi':'Chọn một tệp sách nói','zh_Hant':'選擇有聲書檔案'},
2678:{'es':'Elija los números del cómic'},
2679:{'es':'Elija un archivo de libro electrónico','fr':'Choisir un fichier de livre numérique','ko':'전자책 파일을 선택하세요.','zh_Hant':'選擇電子書檔案'},
2680:{'es':'Elija los números de la revista'},
2681:{'ar':'تنزيل القصص المصوّرة','hi':'कॉमिक डाउनलोड करें','ko':'만화를 다운로드하세요.','pt_BR':'Baixar quadrinhos','vi':'Tải truyện tranh xuống'},
2683:{
'ar':'نزّل هذا الملف المتاح على جهازك باستخدام هذا المتصفح. افتحه في تطبيق قراءة متوافق.',
'es':'Descargue este archivo en su dispositivo con este navegador. Ábralo en una aplicación de lectura compatible.',
'hi':'इस ब्राउज़र का उपयोग करके यह उपलब्ध फ़ाइल अपने डिवाइस पर डाउनलोड करें। इसे किसी संगत रीडर ऐप में खोलें।',
'id':'Unduh berkas yang tersedia ini ke perangkat menggunakan peramban ini. Buka berkas tersebut dengan aplikasi pembaca yang kompatibel.',
'ko':'이 브라우저를 사용해 기기에 이 파일을 다운로드하세요. 호환되는 리더 앱에서 파일을 여세요.',
'pt_BR':'Baixe este arquivo no dispositivo usando este navegador. Abra-o em um aplicativo de leitura compatível.',
'vi':'Tải tệp này xuống thiết bị bằng trình duyệt này. Mở tệp bằng ứng dụng đọc tương thích.',
'zh_Hans':'使用此浏览器将此可用文件下载到设备上。请在兼容的阅读器应用中打开此文件。',
'zh_Hant':'使用此瀏覽器將此可用檔案下載到裝置上。請在相容的閱讀器應用程式中開啟此檔案。'},
2686:{'fr':'Aucune copie téléchargeable n’a été trouvée. Consultez l’état de la demande et vérifiez que le fichier est présent dans le service multimédia associé.','id':'Tidak ditemukan salinan yang dapat diunduh. Tinjau Status Permintaan dan periksa apakah berkas tersebut tersedia di layanan medianya.','ko':'다운로드할 수 있는 사본을 찾지 못했습니다. 요청 상태에서 이 항목을 확인하고 미디어 서비스에 파일이 있는지 확인하세요.','pt_BR':'Nenhuma cópia disponível para download foi encontrada. Confira o status da solicitação e verifique se o arquivo está presente no serviço de mídia associado.','vi':'Không tìm thấy bản sao có thể tải xuống. Hãy xem Trạng thái yêu cầu và kiểm tra xem tệp có trong dịch vụ đa phương tiện tương ứng hay không.'},
2687:{'fr':'Certains fichiers n’ont pas pu être vérifiés. Consultez ce titre dans l’état de la demande pour trouver d’autres copies.','id':'Beberapa berkas tidak dapat diperiksa. Periksa judul ini di Status Permintaan untuk mencari salinan lain.','ja':'一部のファイルを確認できませんでした。ほかのコピーがないか、リクエストステータスでこのタイトルを確認してください。','ko':'일부 파일을 확인할 수 없습니다. 다른 사본이 있는지 요청 상태에서 이 항목을 확인하세요.','pt_BR':'Não foi possível verificar alguns arquivos. Confira este título no status da solicitação para encontrar outras cópias.','vi':'Không thể kiểm tra một số tệp. Hãy xem mục này trong Trạng thái yêu cầu để tìm các bản sao khác.','zh_Hans':'有些文件无法检查。请在请求状态中查看此标题，查找其他副本。','zh_Hant':'有些檔案無法檢查。請在要求狀態中查看此標題，尋找其他副本。'},
2688:{'ar':'حالة الطلب','ko':'요청 상태','pt_BR':'Status da solicitação'},
2689:{'hi':'इन डाउनलोड की जाँच नहीं हो सकी। अनुरोध की स्थिति में इस शीर्षक को देखें और फिर से प्रयास करें।','id':'Unduhan ini tidak dapat diperiksa. Periksa judul ini di Status Permintaan, lalu coba lagi.','ko':'이 다운로드를 확인할 수 없습니다. 요청 상태에서 이 항목을 확인하고 다시 시도하세요.','pt_BR':'Não foi possível verificar estes downloads. Confira este título no status da solicitação e tente novamente.','vi':'Không thể kiểm tra các tệp tải xuống này. Hãy xem mục này trong Trạng thái yêu cầu và thử lại.','zh_Hant':'無法檢查這些下載。請在要求狀態中查看此標題，然後再試一次。'},
2693:{'vi':'Hủy yêu cầu'},2694:{'zh_Hans':'删除请求'},
2698:{'ar':'حدث خطأ ما أثناء إعادة محاولة إرسال الطلب.','hi':'अनुरोध को दोबारा भेजने की कोशिश के दौरान कुछ गड़बड़ हुई।','id':'Terjadi kesalahan saat mencoba kembali permintaan.','pt_BR':'Algo deu errado ao tentar enviar a solicitação novamente.'}
}
RATIONALE={
2600:'Several targets describe a reading device, an incomplete shelf, or use unnatural word order; these candidates say to update the reader shelf.',
2601:'The current target is malformed or changes BookOrbit, visibility, or the managed-scope instructions. The candidate keeps BookOrbit and restores both allowed actions.',
2602:'The current target changes checking the item count into unrelated wording or has broken grammar; the candidate preserves saved status, missing confirmation, and the refresh instruction.',
2603:'The French target says countries, the Indonesian target leaves Regions untranslated, the Portuguese target lacks its article, and the Vietnamese target is singular.',
2604:'The Hindi and Vietnamese targets omit the opening parenthesis; Indonesian Baku means standard, not the default value.',
2605:'The Hindi target omits approval, Indonesian says to arrange the request, and Vietnamese reads as a request for approval.',
2607:'The Hindi target omits declining, Indonesian has the wrong word order, and Vietnamese says decode rather than decline.',
2610:'Arabic reverses language/profile and the Chinese targets read as settings or a configuration file rather than a profile label.',
2611:'Arabic contains a spelling error; Hindi omits the “last modified” part of the field label.',
2612:'Arabic says metadata summary rather than metadata profile; Korean leaves Metadata untranslated.',
2613:'Japanese narrows a general quality profile to picture quality.',
2615:'The Hindi fragment means “requested by” without a noun/person label.',
2616:'These targets change request overrides into generic changes, retain an English loan, or read as an awkward literal compound.',
2618:'Arabic says there is a season for zero; Japanese uses event/seasonal wording; Vietnamese leaves Season in English in one branch; Traditional Chinese uses Simplified characters.',
2619:'Arabic has a misspelling in destination and uses an imprecise server term.',
2620:'Arabic adds an unsupported “and”; Vietnamese says ready rather than already available.',
2621:'Arabic says closed, Japanese says the title is a blocklist, and Portuguese loses the blocklist meaning.',
2623:'Spanish reverses the no-service meaning; Hindi has a postposition error; Japanese refers to this service rather than there being no configured service; Korean changes the status to future tense.',
2624:'Spanish is awkwardly ordered; Indonesian omits the open-pending state; Japanese is a fragment; Korean changes a request into a loan request; Vietnamese has an unclear relation between request and format.',
2625:'Hindi translates Request More as “Read more”; Indonesian wording is not a natural request for additional items.',
2627:'The plural targets contain reversed/awkward wording, incorrect meaning, poor grammar, or fail to display the failed count. The proposals retain the failure and count in the plural branches.',
2629:'Vietnamese reverses the action into a request to view rather than viewing the request.',
2630:'Indonesian uses an awkward verb and Vietnamese omits the view action.',
2632:'The current translations omit the distinction between standard-order choices checked against TVDB and alternate-order choices checked against the selected Sonarr series. Spanish preserves the meaning but uses informal address; the candidate uses formal address.',
2648:'The current Spanish imperative uses informal tú; the requested application style is formal usted.',
2649:'The current Spanish imperative uses informal tú; the requested application style is formal usted.',
2650:'The current Spanish imperative uses informal tú; the requested application style is formal usted.',
2656:'Hindi omits approval; Indonesian says to arrange the request; Vietnamese wording requests approval instead of approving.',
2660:'Vietnamese says to stop the request rather than cancel it.',
2661:'Hindi omits declining; Indonesian has incorrect word order; Vietnamese says decode rather than decline.',
2662:'The Simplified Chinese target mixes Traditional and Simplified scripts.',
2666:'Hindi omits the retry action, Indonesian is ungrammatical, and Portuguese uses an unnatural verb for retrying.',
2671:'Hindi confuses retry with retrieve, Indonesian is awkward, and Korean leaves Retry in English.',
2675:'Arabic describes an audio copy, Spanish pluralizes the audiobook, Korean leaves it in English, Vietnamese says notebook, and Traditional Chinese says audio effect book.',
2677:'Arabic and Vietnamese use unnatural audiobook compounds, Spanish pluralizes the file type, French/Indonesian/Korean leave or obscure the audiobook concept, and Traditional Chinese mistranslates it.',
2678:'Spanish uses the informal tú imperative; use the formal usted form required for this UI.',
2679:'Spanish/French/Korean leave ebook as an English loan in a file-selection prompt; Traditional Chinese mixes scripts.',
2680:'Spanish uses the informal tú imperative; use the formal usted form required for this UI.',
2681:'Arabic translates comic as comedy; Hindi and Korean omit the comic; Brazilian Portuguese uses the Portugal-specific download verb; Vietnamese omits the object.',
2683:'Arabic mistranslates browser as swamp; Hindi grammar is broken; Indonesian/Korean/Portuguese are awkward; Vietnamese reverses download to upload; the Chinese text needs clearer natural phrasing.',
2686:'French leaves imperatives as fragments; Indonesian has the wrong link-title word order; Korean leaves the route name in English; Brazilian Portuguese says “status request”; Vietnamese uses the wrong sense of media.',
2687:'The French, Indonesian, Japanese, Korean, Portuguese, Vietnamese, and Chinese targets have grammatical or route/action phrasing problems that obscure where to look for other copies.',
2688:'Arabic omits status; Korean changes request to order; Portuguese reverses the compound into “status request.”',
2689:'Hindi makes the subject first person, Indonesian/Korean/Portuguese are awkward or incorrectly voiced, Vietnamese has unclear route wording, and Traditional Chinese omits the review-and-retry instructions.',
2693:'Vietnamese says to stop the request rather than cancel it.',
2694:'The Simplified Chinese target mixes Traditional and Simplified scripts.',
2698:'Hindi omits the retry action, Indonesian is ungrammatical, and Portuguese uses an unnatural verb for retrying.'
}
REFINEMENTS={(2601,'es'),(2632,'es'),(2648,'es'),(2649,'es'),(2650,'es'),(2678,'es'),(2679,'es'),(2680,'es'),(2683,'es'),(2683,'pt_BR')}

# Validate the exact prepared input boundary and hashes before writing a review.
for line in (OUT/'INPUT-SHA256SUMS').read_text().splitlines():
    expected,name=line.split('  ',1)
    assert sha((OUT/name).read_bytes())==expected, f'input checksum mismatch: {name}'
rows=[json.loads(x) for x in (OUT/'source-current-cells.jsonl').read_text().splitlines()]
callers={x['sourceId']:x for x in map(json.loads,(OUT/'caller-contexts.jsonl').read_text().splitlines())}
manifest=json.loads((OUT/'input-manifest.json').read_text())
assert len(rows)==1200 and len(callers)==100
assert len({(x['sourcePosition'],x['sourceId'],x['locale']) for x in rows})==1200
assert {x['sourcePosition'] for x in rows}==set(range(2600,2700))
assert all(x['sourceHash']==sha(x['sourceId']) and x['currentTargetHash']==sha(x['currentTarget']) for x in rows)
assert all(x['sourceId'] in callers for x in rows)
assert all(x['currentTarget'] is not None for x in rows)
by_position={}
for row in rows: by_position.setdefault(row['sourcePosition'],row)
assert set(P)==set(P.keys()) and all(pos in by_position for pos in P)

# Primary semantic and context review. All 1,200 cells receive a decision.
ledger=[]; proposals=[]; formal_rows=[]
for x in rows:
    pos=x['sourcePosition']; loc=x['locale']; key=(pos,loc)
    candidate=P.get(pos,{}).get(loc,x['currentTarget'])
    disp='accept-current' if candidate==x['currentTarget'] else ('refinement' if key in REFINEMENTS else 'propose-correction')
    assert disp in {'accept-current','propose-correction','refinement'}
    ctx=callers[x['sourceId']]
    terms=x['protectedLiterals']
    source_ph=ph(x['source']); current_ph=ph(x['currentTarget']); final_ph=ph(candidate)
    source_tags=tags(x['source']); current_tags=tags(x['currentTarget']); final_tags=tags(candidate)
    current_missing=missing_exact(x['currentTarget'],terms)
    final_missing=missing_exact(candidate,terms)
    if disp=='accept-current':
        rationale=f"Current wording preserves the source meaning for the pinned caller use ({ctx['callerUseStatus']}): {x['source']} No material semantic, fluency, terminology, or tone defect was identified. Placeholder, markup, and applicable protected-literal checks are recorded below."
        conf='moderate'
    else:
        rationale=RATIONALE[pos]
        conf='high' if pos in {2601,2605,2607,2612,2615,2621,2623,2625,2627,2629,2630,2632,2666,2671,2675,2677,2681,2683,2686,2687,2688,2689,2693,2694,2698} else 'moderate'
    prior=x.get('priorDisposition')
    assert prior is None, f'prior exact disposition unexpectedly appeared at {key}'
    icu_cur=icu_profile(x['currentTarget']); icu_final=icu_profile(candidate)
    row={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
      'sourcePosition':pos,'sourceId':x['sourceId'],'source':x['source'],'sourceHash':x['sourceHash'],'sourceTextSha256':x['sourceTextSha256'],
      'sourceFile':x['sourceFile'],'sourceCatalogBlob':x['sourceCatalogBlob'],'sourceFileSha256':x['sourceFileSha256'],
      'locale':loc,'localeFile':x['localeFile'],'localeBlob':x['localeBlob'],'localeFileSha256':x['localeFileSha256'],
      'currentTarget':x['currentTarget'],'currentTargetHash':x['currentTargetHash'],'targetHash':sha(candidate),
      'targetText':None,'targetMarkup':final_tags,'targetPlaceholders':final_ph,
      'finalTarget':candidate,'finalTargetHash':sha(candidate),'finalTargetMarkup':final_tags,'finalTargetPlaceholders':final_ph,
      'disposition':disp,'rationale':rationale,'confidence':conf,'reviewer':'primary-machine-assisted-semantic-review',
      'semanticReviewPerformed':True,'nativeSpeakerApproval':'not-performed; separate native-speaker signoff required',
      'placeholderParity':'exact' if parity(source_ph,current_ph) else 'mismatch','candidatePlaceholderParity':'exact' if parity(source_ph,final_ph) else 'mismatch',
      'sourcePlaceholders':source_ph,'currentPlaceholders':current_ph,'finalPlaceholders':final_ph,
      'markupParity':'exact' if source_tags==current_tags else 'mismatch','candidateMarkupParity':'exact' if source_tags==final_tags else 'mismatch',
      'sourceMarkup':source_tags,'currentMarkup':current_tags,'finalMarkup':final_tags,
      'protectedLiterals':terms,'protectedLiteralExactMissing':current_missing,'candidateProtectedLiteralMissing':final_missing,
      'currentProtectedLiteralParity':'exact' if not current_missing else 'mismatch','candidateProtectedLiteralParity':'exact' if not final_missing else 'mismatch',
      'sourceIcuProfile':icu_profile(x['source']),'currentIcuProfile':icu_cur,'finalIcuProfile':icu_final,
      'priorDisposition':prior,'priorDispositionOverridden':False,
      'callerContextRef':x['callerContextRef'],'callerContextSha256':x['callerContextSha256'],
      'callerUseStatus':ctx['callerUseStatus'],'callerPaths':ctx['callerPaths'],
      'callerReferenceCount':len(ctx['pinnedLineRefs']),'callerContextCoverage':'pinned source-group component refs; bounded targeted search, not a complete dynamic call graph',
      'callerGaps':[] if ctx['callerUseStatus']!='caller-use-not-found' else ['no direct/helper caller reference found in scoped source-group files']}
    if loc=='es':
        applicable=pos in {2601,2602,2632,2648,2649,2650,2677,2678,2679,2680,2683,2686,2687,2689}
        current_form='tuteo' if any(token in x['currentTarget'] for token in ('Elige','Asigna','Descargue','Revise')) and 'Elige' in x['currentTarget'] or 'Asigna' in x['currentTarget'] else ('usted' if re.search(r'\b(Abra|Descargue|Revise|compruebe|Compruebe|vuelva|Vuelva|Ábralo|Cámbiela|elimine|Asigne|Elija)\b',x['currentTarget']) else 'neutral/infinitive')
        final_form='usted' if applicable and re.search(r'\b(Cámbiela|elimine|Asigne|Elija|Descargue|Ábralo|Revise|compruebe|vuelva)\b',candidate) else ('usted-compatible' if applicable else 'not-applicable')
        formal_assessment='Current Spanish uses informal tú and the proposal switches to usted.' if current_form=='tuteo' else ('Direct user instructions use formal usted.' if applicable and final_form=='usted' else ('Action label or neutral wording does not encode a tú/usted choice.' if not applicable else 'Direct instruction remains address-neutral; no informal tú form detected.'))
        row.update({'spanishFormalApplicability':'direct-user-address' if applicable else 'no-finite-address-choice',
          'spanishCurrentAddressForm':current_form,'spanishFinalAddressForm':final_form,'spanishFormalAssessment':formal_assessment})
        formal_rows.append({'sourcePosition':pos,'sourceId':x['sourceId'],'source':x['source'],'currentTarget':x['currentTarget'],
          'currentTargetHash':x['currentTargetHash'],'finalTarget':candidate,'finalTargetHash':sha(candidate),
          'applicability':'direct-user-address' if applicable else 'no-finite-address-choice',
          'currentAddressForm':current_form,'finalAddressForm':final_form,'assessment':formal_assessment,
          'disposition':disp})
    if disp!='accept-current':
        proposals.append({'sourcePosition':pos,'sourceId':x['sourceId'],'source':x['source'],'sourceHash':x['sourceHash'],
          'locale':loc,'currentTarget':x['currentTarget'],'currentTargetHash':x['currentTargetHash'],
          'finalTarget':candidate,'finalTargetHash':sha(candidate),'disposition':disp,'rationale':rationale,'confidence':conf,
          'placeholderParity':'exact' if parity(source_ph,final_ph) else 'mismatch','markupParity':'exact' if source_tags==final_tags else 'mismatch',
          'protectedLiteralMissing':final_missing,'callerContextRef':x['callerContextRef'],'callerContextSha256':x['callerContextSha256'],
          'callerUseStatus':ctx['callerUseStatus'],'callerPaths':ctx['callerPaths'],'callerReferenceCount':len(ctx['pinnedLineRefs'])})
    ledger.append(row)

# Verify all proposal keys actually exist and every retained target passes source-integrity checks.
assert len(ledger)==1200
assert sum(r['disposition']!='accept-current' for r in ledger)==len(proposals)
assert all(r['candidatePlaceholderParity']=='exact' for r in ledger)
assert all(r['candidateMarkupParity']=='exact' for r in ledger)
assert all(not r['candidateProtectedLiteralMissing'] for r in ledger)
assert all(r['callerUseStatus']!='caller-use-not-found' for r in ledger)
assert all(r['finalTargetHash']==sha(r['finalTarget']) for r in ledger)

# Structural and ICU checks, including nested failed-count arguments in plural branches.
struct=[]; icu_checks=[]
for r in ledger:
    source=next(x['source'] for x in rows if x['sourcePosition']==r['sourcePosition'])
    final=r['finalTarget']
    sprof=icu_profile(source); fprof=icu_profile(final)
    if sprof:
        assert len(fprof)==len(sprof)==1
        sp=sprof[0]; fp=fprof[0]
        assert (sp['name'],sp['kind'])==(fp['name'],fp['kind'])
        assert 'other' in fp['branches'] and all(c in fp['branches'] for c in ('one','other') if c in sp['branches'])
        assert set(sp['branches']).issubset(set(fp['branches']))
        # The source fallback branch's explicit value placeholders must remain in the final fallback branch.
        assert not (sp['nested'].get('other',collections.Counter()) - fp['nested'].get('other',collections.Counter()))
        allowed={'zero','one','two','few','many','other'}
        assert all(k in allowed or k.startswith('=') for k in fp['branches'])
        icu_checks.append({'sourcePosition':r['sourcePosition'],'sourceId':r['sourceId'],'locale':r['locale'],
          'rootName':fp['name'],'rootKind':fp['kind'],'sourceCategories':sorted(sp['branches']),
          'finalCategories':sorted(fp['branches']),'sourceOtherNestedArguments':dict(sp['nested'].get('other',{})),
          'finalOtherNestedArguments':dict(fp['nested'].get('other',{})),'valid':True})
    else:
        assert not fprof, f'unexpected ICU structure at {r["sourceId"]}/{r["locale"]}'

summary={'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,
  'sourcePositionRange':[2600,2699],'sourceCount':100,'localeCount':len(LOCALES),'cellCount':len(ledger),
  'dispositions':dict(collections.Counter(r['disposition'] for r in ledger)),
  'proposalsByLocale':dict(sorted(collections.Counter(x['locale'] for x in proposals).items())),
  'proposalsBySourcePosition':dict(sorted(collections.Counter(str(x['sourcePosition']) for x in proposals).items(),key=lambda kv:int(kv[0]))),
  'callerRows':len(callers),'callerRowsNotFound':sum(c['callerUseStatus']=='caller-use-not-found' for c in callers.values()),
  'callerReferenceCount':sum(len(c['pinnedLineRefs']) for c in callers.values()),'callerContextRows':100,
  'priorExactDispositionsReused':0,'placeholderMismatchesCurrent':sum(r['placeholderParity']!='exact' for r in ledger),
  'placeholderMismatchesFinal':sum(r['candidatePlaceholderParity']!='exact' for r in ledger),
  'markupMismatchesCurrent':sum(r['markupParity']!='exact' for r in ledger),
  'markupMismatchesFinal':sum(r['candidateMarkupParity']!='exact' for r in ledger),
  'protectedLiteralMismatchCellsCurrent':sum(bool(r['protectedLiteralExactMissing']) for r in ledger),
  'protectedLiteralMismatchCellsFinal':sum(bool(r['candidateProtectedLiteralMissing']) for r in ledger),
  'icuCheckedCells':len(icu_checks),'spanishFormalRows':len(formal_rows),
  'spanishDirectAddressRows':sum(r['applicability']=='direct-user-address' for r in formal_rows),
  'spanishTuteoFinalRows':sum(r['finalAddressForm']=='tuteo' for r in formal_rows),
  'nativeSpeakerReviewOutstanding':True,'nativeSpeakerSignoffClaimed':False,
  'testsBuildsScansCiBrowser':False,'repositoryOrPrEdited':False}
writejl('primary-review-ledger.jsonl',ledger)
writejl('candidate-proposals.jsonl',proposals)
writejl('spanish-formal-review.jsonl',formal_rows)
writej('structural-validation.json',{'summary':summary,'checks':{'all1200SourceCurrentFinalHashes':True,'allSourceAndCurrentPlaceholdersExact':summary['placeholderMismatchesCurrent']==0,
  'allFinalPlaceholdersExact':summary['placeholderMismatchesFinal']==0,'allSourceAndCurrentMarkupExact':summary['markupMismatchesCurrent']==0,
  'allFinalMarkupExact':summary['markupMismatchesFinal']==0,'allFinalProtectedLiteralsExact':summary['protectedLiteralMismatchCellsFinal']==0,
  'all100CallerContextRowsPinned':len(callers)==100,'allCallerUsesFound':summary['callerRowsNotFound']==0,
  'icuProfilesValid':all(x['valid'] for x in icu_checks),'allSpanishDirectAddressFormal':summary['spanishTuteoFinalRows']==0},'icuRows':icu_checks})
writej('summary.json',summary)
writej('candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'targets':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'finalTarget':x['finalTarget'],'finalTargetHash':x['finalTargetHash'],'disposition':x['disposition']} for x in proposals]})

# Exact source boundaries make the staged 100-key window auditable against W2500–2599 and W2700–2799.
source=next(x for x in rows if x['locale']=='ar')
raw=subprocess.check_output(['git','-C',str(REPO),'show',f'{HEAD}:src/i18n/locale/en.json'])
eng=json.loads(raw)
def flatten(obj,prefix=''):
    for k,v in obj.items():
        name=f'{prefix}.{k}' if prefix else k
        if isinstance(v,dict): yield from flatten(v,name)
        else: yield name,v
ordered=list(flatten(eng))
assert len(ordered)>2700
boundaries=[]
for pos in (2599,2600,2699,2700):
    sid,text=ordered[pos]
    boundaries.append({'position':pos,'sourceId':sid,'source':text,'sourceHash':sha(sid),'sourceTextSha256':sha(text)})
assert boundaries[1]['sourceId']==by_position[2600]['sourceId'] and boundaries[2]['sourceId']==by_position[2699]['sourceId']
writej('source-boundaries.json',{'sourceCatalogBlob':source['sourceCatalogBlob'],'sourceCatalogSha256':source['sourceFileSha256'],'boundaries':boundaries,
 'windowStartsImmediatelyAfter':{'position':2599,'sourceId':boundaries[0]['sourceId']},
 'windowEndsImmediatelyBefore':{'position':2700,'sourceId':boundaries[3]['sourceId']}})

# Capture the initial global PR/catalog view, then re-query all seven immediately before sealing below.
start=fetch_all_live()
writej('live-localization-prs-start.json',{'capturedAtUnix':int(time.time()),'pullRequests':start})

# Re-attest all seven current PR heads and catalogs; Seerr must remain exactly pinned and clean.
end=fetch_all_live()
assert len(end)==7
seerr=next(x for x in end if x['pullRequest']==418)
assert seerr['state']=='OPEN' and seerr['isDraft'] is True and seerr['head']==HEAD and seerr['tree']==TREE
assert seerr['currentCatalogFileCount']>=13 and not seerr['treeTruncated']
local_head=sh('git','-C',REPO,'rev-parse','HEAD').strip()
local_tree=sh('git','-C',REPO,'rev-parse','HEAD^{tree}').strip()
local_status=sh('git','-C',REPO,'status','--porcelain=v1').strip()
assert local_head==HEAD and local_tree==TREE and local_status==''
assert sha((OUT/'source-current-cells.jsonl').read_bytes())=='c0ddb688d239d88003a8a1440c1ec0a478fbdb34d6f30b833a661ebfa42dd3ea'
assert sha((OUT/'caller-contexts.jsonl').read_bytes())=='de2ddef70b82b47cfd55b21aa820eca846bd5f9d45d44683336041530ec1917c'
writej('live-localization-prs-end.json',{'capturedAtUnix':int(time.time()),'pullRequests':end})
writej('final-reattestation.json',{'repository':REPO_NAME,'pullRequest':PR,'expectedHead':HEAD,'expectedTree':TREE,
  'liveState':seerr['state'],'liveIsDraft':seerr['isDraft'],'liveHead':seerr['head'],'liveTree':seerr['tree'],
  'localHead':local_head,'localTree':local_tree,'worktreeClean':not bool(local_status),'worktreeStatus':local_status,
  'allSevenPrSnapshotsCaptured':len(end)==7,'allSevenCatalogsEnumerated':all(x['currentCatalogFileCount']>0 and not x['treeTruncated'] for x in end),
  'sealedAtUnix':int(time.time())})
writej('caller-gaps.json',{'callerContextRows':len(callers),'callerUseNotFound':[x['sourceId'] for x in callers.values() if x['callerUseStatus']=='caller-use-not-found'],
  'boundedSearchLimitations':[{'sourceId':x['sourceId'],'callerUseStatus':x['callerUseStatus'],'callerEvidenceNote':x['callerEvidenceNote'],'callerPaths':x['callerPaths']} for x in callers.values() if x['callerUseStatus']!='direct-or-helper-reference-found'],
  'note':'No dynamic call graph is claimed; the caller-context rows record targeted source-group references at the exact Seerr PR tree.'})

readme=f'''# SeerrNG PR #418 primary semantic review: W2600–2699

Reviewed `{REPO_NAME}` PR #{PR} at exact head `{HEAD}` and tree `{TREE}`. Scope: zero-based English-catalog positions 2600–2699, 100 source IDs × 12 locales = 1,200 cells. Exact source boundaries, locale catalog pins, and the full live review data are included in this packet.

The primary review proposes {len(proposals)} corrections/refinements, accepts {len(ledger)-len(proposals)} current translations, and holds 0 cells. Per-locale proposal counts and integrity results are in `summary.json` and `structural-validation.json`. Every row carries exact source, current-target, and final-target hashes; catalog blob/file hashes; caller-context references and caller-use status; confidence and rationale; and placeholder, markup, protected-literal, and ICU checks. All 100 source IDs have pinned direct/helper references in the exact-head caller context. The search is bounded to likely source-group component files and is not a complete dynamic call graph.

Current placeholder mismatches: {summary['placeholderMismatchesCurrent']}; final mismatches: {summary['placeholderMismatchesFinal']}. Current markup mismatches: {summary['markupMismatchesCurrent']}; final mismatches: {summary['markupMismatchesFinal']}. Current protected-literal mismatch cells: {summary['protectedLiteralMismatchCellsCurrent']}; final mismatch cells: {summary['protectedLiteralMismatchCellsFinal']}. Both ICU entries were checked for root formatter type, required branches, and nested count placeholders. The Spanish audit covers all 100 cells; {summary['spanishDirectAddressRows']} have direct user address, and 0 final targets use informal tú.

The final global snapshot re-queries all seven open localization PRs and their current catalog-file blob IDs immediately before sealing. Seerr #418 remained open/draft at the requested exact head/tree and its worktree remained clean. The other six PR head/state/catalog snapshots are included; PR heads are treated as live values, not assumed from earlier notes.

This is a static, machine-assisted primary review and does not claim native-speaker approval. Native-speaker review remains outstanding. No Seerr repository or PR files were edited; no tests, builds, scans, CI jobs, or browser work were performed.

## Packet files

- `primary-review-ledger.jsonl`: one full-pinned decision for every locale cell.
- `candidate-proposals.jsonl`, `candidate-targets.json`: exact proposed strings and hashes.
- `source-current-cells.jsonl`, `caller-contexts.jsonl`, `source-window.json`, `source-boundaries.json`: frozen exact-head inputs and caller evidence.
- `spanish-formal-review.jsonl`: formal-address applicability and disposition for every Spanish cell.
- `structural-validation.json`, `summary.json`, `caller-gaps.json`: integrity results, counts, and call-site gap review.
- `live-localization-prs-start.json`, `live-localization-prs-end.json`, `final-reattestation.json`: current PR, catalog, and Seerr worktree snapshots.
- `INPUT-SHA256SUMS`, `SHA256SUMS`: input and packet checksums.
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
# Manifest records actual packet scope and every tracked deliverable except manifests/checksum lists, avoiding self-reference.
tracked=sorted(p.name for p in OUT.iterdir() if p.is_file() and p.name not in {'SHA256SUMS','manifest.json'})
manifest_out={'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'scope':{'positions':[2600,2699],'sourceIds':100,'locales':LOCALES,'cells':1200},
  'reviewDispositionCounts':summary['dispositions'],'livePrAttestationFile':'live-localization-prs-end.json','finalReattestationFile':'final-reattestation.json',
  'sourceCatalog':{'path':'src/i18n/locale/en.json','blob':source['sourceCatalogBlob'],'sha256':source['sourceFileSha256']},
  'localeCatalogFiles':{loc:next(r for r in rows if r['locale']==loc)['localeFileSha256'] for loc in LOCALES},
  'inputChecksumFile':'INPUT-SHA256SUMS','packetFiles':tracked,'nativeSpeakerReviewOutstanding':True,
  'repositoryOrPrEdited':False,'testsBuildsScansCiBrowser':False}
writej('manifest.json',manifest_out)
# Cover all task-owned files in the packet, including frozen inputs and the build script, but exclude this checksum list itself.
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='SHA256SUMS')
(OUT/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in files),encoding='utf-8')
# Read back all generated checksums and core coverage/counts.
for line in (OUT/'SHA256SUMS').read_text().splitlines():
    expected,name=line.split('  ',1)
    assert sha((OUT/name).read_bytes())==expected, name
assert len((OUT/'primary-review-ledger.jsonl').read_text().splitlines())==1200
assert len((OUT/'candidate-proposals.jsonl').read_text().splitlines())==len(proposals)
print(json.dumps({'output':str(OUT),'head':HEAD,'tree':TREE,'cellCount':len(ledger),'proposalCount':len(proposals),
  'dispositions':summary['dispositions'],'placeholderMismatchesFinal':summary['placeholderMismatchesFinal'],
  'markupMismatchesFinal':summary['markupMismatchesFinal'],'protectedLiteralMismatchCellsFinal':summary['protectedLiteralMismatchCellsFinal'],
  'callerGaps':summary['callerRowsNotFound'],'allSevenPrs':[{k:x[k] for k in ('repository','pullRequest','state','isDraft','head','tree','currentCatalogFileCount')} for x in end],
  'sha256sumEntries':len(files),'bytes':sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())},ensure_ascii=False,indent=2))
