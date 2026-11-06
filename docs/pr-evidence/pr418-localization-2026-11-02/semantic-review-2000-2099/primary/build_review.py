from __future__ import annotations
import json, pathlib, hashlib, re, subprocess, collections, datetime

ROOT=pathlib.Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2000-2099-primary-20261102')
REPO=pathlib.Path('/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-readonly-w2000-2099-d897')
HEAD='d897f04661802d7f47446e46602f1b521d33c52f'; TREE='309b846c546923856ffde114fd3cf75a7c8de7a7'
REPO_NAME='snapetech-org/SeerrNG'; PR=418
LOCALES=['ar','de','es','fr','hi','id','ja','ko','pt_BR','vi','zh_Hans','zh_Hant']
PROTECTED=['SeerrNG','Seerr','Jellyfin','Plex','Tautulli','Jellystat','TMDB','TheTVDB','TVmaze','Wikidata','CC0','CC BY-SA 4.0','HTTP','HTTPS','URL','4K','Metacritic','Trakt']
def sha(x):
 if isinstance(x,str): x=x.encode('utf-8')
 return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def run(*a): return subprocess.check_output(a,text=True)
def git(*a): return subprocess.check_output(['git','-C',str(REPO),*a])
def flatten(d,p=''):
 for k,v in d.items():
  q=p+'.'+k if p else k
  if isinstance(v,dict): yield from flatten(v,q)
  else: yield q,v
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
 return out
def tags(s): return re.findall(r'</?[A-Za-z][^>]*>',s)
def writej(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def writejl(p,rows): p.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in rows))
def L(**x): return x

# High-confidence fixes for mistranslations, malformed placeholders, ICU branches,
# product names, and disambiguated control labels. Unlisted current values are
# retained only where the semantic audit found them usable in caller context.
C={
2000:L(ar='اعرض جميع المشكلات المفتوحة والتي تم حلها والمُبلَّغ عنها بشأن هذه الوسائط.',de='Alle für dieses Medium gemeldeten offenen und gelösten Probleme anzeigen.',hi='इस मीडिया के लिए रिपोर्ट की गई सभी खुली और हल की गई समस्याएँ देखें।',ko='이 미디어에서 보고된 모든 미해결 및 해결된 문제를 확인합니다.',vi='Xem tất cả vấn đề đang mở và đã giải quyết được báo cáo cho nội dung này.',zh_Hans='查看此媒体上报告的所有未解决和已解决的问题。',zh_Hant='查看此媒體上回報的所有未解決及已解決問題。'),
2001:L(hi='सभी समय',ja='全期間',pt_BR='Todo o período',zh_Hans='全部时间',zh_Hant='全部時間'),
2002:L(zh_Hans='下载',zh_Hant='下載'),
2003:L(hi='खुले मुद्दे',ko='미해결 문제',vi='Vấn đề đang mở'),
2004:L(ar='لا توجد طلبات.',hi='कोई अनुरोध नहीं'),
2006:L(hi='{mediaType} प्रबंधित करें'),
2007:L(zh_Hans='电影'),
2008:L(hi='{arr} में खोलें',id='Buka di {arr}',zh_Hans='在 {arr} 中打开',zh_Hant='在 {arr} 中開啟'),
2009:L(hi='{arr} में 4K पर खोलें',pt_BR='Abrir em 4K no {arr}',zh_Hans='在 {arr} 中以 4K 打开',zh_Hant='在 {arr} 中以 4K 開啟'),
2010:L(hi='Tautulli में खोलें',id='Buka di Tautulli',zh_Hans='在 Tautulli 中打开',zh_Hant='在 Tautulli 中開啟'),
2011:L(hi='पिछले {days, number} दिन',id='{days, number} hari terakhir',vi='{days, number} ngày qua'),
2012:L(hi='चलाने वाला',vi='Được phát bởi'),
2013:L(
 de='<strong>{playCount, number}</strong> {playCount, plural, one {Wiedergabe} other {Wiedergaben}}',
 ar='<strong>{playCount, number}</strong> {playCount, plural, zero {مرات تشغيل} one {مرة تشغيل} two {مرتا تشغيل} few {مرات تشغيل} many {مرة تشغيل} other {مرة تشغيل}}',
 hi='<strong>{playCount, number}</strong> {playCount, plural, one {बार चलाया गया} other {बार चलाया गया}}',
 id='<strong>{playCount, number}</strong> {playCount, plural, one {kali diputar} other {kali diputar}}',
 ja='<strong>{playCount, number}</strong>{playCount, plural, one {回再生} other {回再生}}',
 pt_BR='<strong>{playCount, number}</strong> {playCount, plural, one {reprodução} other {reproduções}}',
 vi='<strong>{playCount, number}</strong> {playCount, plural, one {lượt phát} other {lượt phát}}',
 zh_Hans='<strong>{playCount, number}</strong> {playCount, plural, one {次播放} other {次播放}}'),
2014:L(zh_Hans='剧集'),
2015:L(ar='Metacritic: التقييم',fr='Note Metacritic',hi='تقييم Metacritic',id='Skor Metacritic',ja='Metacritic のスコア',pt_BR='Pontuação do Metacritic',vi='Điểm số Metacritic',zh_Hans='Metacritic 评分',zh_Hant='Metacritic 評分'),
2017:L(ar='{hours} ساعات من التشغيل'),
2018:L(
 ar='{count, plural, zero {# مرة تشغيل} one {# مرة تشغيل} two {# مرتا تشغيل} few {# مرات تشغيل} many {# مرة تشغيل} other {# مرة تشغيل}}',
 fr='{count, plural, one {# lecture} other {# lectures}}',
 hi='{count, plural, one {# बार चलाया गया} other {# बार चलाया गया}}',
 id='{count, plural, one {# kali diputar} other {# kali diputar}}',
 ja='{count, plural, one {# 回再生} other {# 回再生}}',
 pt_BR='{count, plural, one {# reprodução} other {# reproduções}}',
 vi='{count, plural, one {# lượt phát} other {# lượt phát}}',
 zh_Hans='{count, plural, one {# 次播放} other {# 次播放}}'),
2019:L(fr='Activité de visionnage Jellystat',hi='Jellystat पर देखने की गतिविधि',id='Aktivitas tontonan Jellystat',ja='Jellystat の視聴アクティビティ',ko='Jellystat 시청 활동',pt_BR='Atividade de visualização do Jellystat',zh_Hans='Jellystat 观看活动',zh_Hant='Jellystat 觀看活動'),
2020:L(ar='علامة الصح الخضراء: متاح. علامة X الحمراء: غير متاح.',fr='Coche verte : disponible. X rouge : indisponible.',hi='हरे चेक का निशान: उपलब्ध। लाल X: उपलब्ध नहीं।',id='Tanda centang hijau: tersedia. Tanda X merah: tidak tersedia.',ja='緑のチェックマーク: 利用可能。赤いX: 利用不可。',ko='초록색 체크 표시: 사용 가능. 빨간색 X: 사용 불가.',pt_BR='Marca de verificação verde: disponível. X vermelho: indisponível.',vi='Dấu tích màu xanh: có sẵn. Dấu X màu đỏ: không có sẵn.',zh_Hans='绿色勾号：可用。红色 X：不可用。',zh_Hant='綠色勾號：可用。紅色 X：不可用。'),
2021:L(vi='Có trong yêu cầu album',zh_Hans='包含在专辑请求中',zh_Hant='包含在專輯要求中'),
2022:L(id='Tidak ada trek audio yang tersedia.'),
2024:L(hi='अवधि',id='Durasi',ja='再生時間',zh_Hans='时长',zh_Hant='時長'),
2025:L(ar='اختر العناصر لتشغيلها',hi='चलाने के लिए आइटम चुनें',id='Pilih item untuk diputar',ko='재생할 항목 선택',pt_BR='Selecione itens para reprodução',vi='Chọn các mục để phát'),
2026:L(zh_Hant='標題'),
2027:L(de='Track',fr='Piste audio',id='Nomor trek audio',pt_BR='Faixa',vi='Bản nhạc'),
2028:L(ar='أبقِ القسم {label} مفتوحًا في جميع صفحات التفاصيل.',fr='Garder la section {label} ouverte sur toutes les pages de détail.',hi='{label} को सभी विवरण पृष्ठों पर खुला रखें।',id='Biarkan {label} tetap terbuka di semua halaman detail.',ja='すべての詳細ページで{label}を開いたままにする。',ko='모든 상세 페이지에서 {label}를 열어 둡니다.',pt_BR='Manter a seção {label} aberta em todas as páginas de detalhes.',vi='Giữ {label} luôn mở trên tất cả các trang chi tiết.',zh_Hans='在所有详情页中保持 {label} 展开。',zh_Hant='在所有詳細頁面中保持 {label} 展開。'),
2029:L(fr='Détacher {label}',hi='{label} का पिन हटाएँ',ja='{label} のピン留めを解除',vi='Bỏ ghim {label}'),
2030:L(ar='تعذّر حفظ ترتيب الأزرار. تمت استعادة الترتيب السابق. يُرجى المحاولة مرة أخرى.',es='No se pudo guardar el orden de los botones. Se restauró el orden anterior. Inténtalo de nuevo.',fr='Impossible d’enregistrer l’ordre des boutons. L’ordre précédent a été rétabli. Veuillez réessayer.',hi='बटनों का क्रम सहेजा नहीं जा सका। पिछला क्रम बहाल कर दिया गया है। कृपया फिर प्रयास करें।',id='Urutan tombol tidak dapat disimpan. Urutan sebelumnya telah dipulihkan. Silakan coba lagi.',ko='버튼 순서를 저장하지 못했습니다. 이전 순서로 복원했습니다. 다시 시도하세요.',pt_BR='Não foi possível salvar a ordem dos botões. A ordem anterior foi restaurada. Tente novamente.',vi='Không thể lưu thứ tự các nút. Thứ tự trước đó đã được khôi phục. Vui lòng thử lại.',zh_Hans='无法保存按钮顺序。已恢复之前的顺序。请重试。',zh_Hant='無法儲存按鈕順序。已還原先前的順序。請重試。'),
2031:L(ar='اضغط مطولًا على زر لمدة ثانية لنقله. أو استخدم Shift + Alt + Left أو Right Arrow لتغيير الترتيب. اضغط Escape للإلغاء.',es='Mantén pulsado un botón durante un segundo para moverlo. También puedes usar Shift + Alt + Left o Right Arrow para cambiar el orden. Pulsa Escape para cancelar.',hi='किसी बटन को स्थानांतरित करने के लिए उसे एक सेकंड तक दबाए रखें। क्रम बदलने के लिए Shift + Alt + Left या Right Arrow का उपयोग करें। रद्द करने के लिए Escape दबाएँ।',id='Tekan dan tahan tombol selama satu detik untuk memindahkannya. Atau gunakan Shift + Alt + Left atau Right Arrow untuk mengubah urutan. Tekan Escape untuk membatalkan.',ja='ボタンを1秒間長押しして移動します。Shift + Alt + Left または Right Arrow で順序を変更できます。キャンセルするには Escape を押します。',ko='버튼을 1초 동안 누르면 이동할 수 있습니다. 순서를 바꾸려면 Shift + Alt + Left 또는 Right Arrow를 사용하세요. 취소하려면 Escape를 누르세요.',vi='Nhấn giữ một nút trong một giây để di chuyển nút đó. Hoặc dùng Shift + Alt + Left hoặc Right Arrow để đổi thứ tự. Nhấn Escape để hủy.',zh_Hans='按住按钮一秒钟即可移动它。也可以使用 Shift + Alt + Left 或 Right Arrow 调整顺序。按 Escape 取消。',zh_Hant='按住按鈕一秒即可移動。也可使用 Shift + Alt + Left 或 Right Arrow 重新排序。按 Escape 取消。'),
2032:L(fr='{label} a été déplacé à la position {position}.',hi='आइटम {label} को स्थान {position} पर ले जाया गया।',ja='{label}を位置{position}に移動しました。',ko='{label}을(를) {position} 위치로 이동했습니다.',pt_BR='O botão {label} foi movido para a posição {position}.'),
2033:L(zh_Hans='{label} 已准备好移动。将其拖到其他按钮之间。',zh_Hant='{label} 已準備好移動。將它拖曳到其他按鈕之間。'),
2034:L(ar='أبلِغ عن مشكلة في إصدار {quality}.',fr='Signaler un problème avec la version {quality}.',hi='इस {quality} संस्करण में समस्या की रिपोर्ट करें।',id='Laporkan masalah pada versi {quality}.',ja='{quality}版の問題を報告する。',ko='{quality} 버전의 문제를 신고합니다.',pt_BR='Relatar um problema com a versão {quality}.',vi='Báo cáo sự cố với phiên bản {quality}.',zh_Hans='报告 {quality} 版本的问题。',zh_Hant='回報 {quality} 版本的問題。'),
2035:L(ar='اطلب إصدار {quality}.',fr='Demander la version {quality}.',hi='{quality} संस्करण का अनुरोध करें।',id='Minta versi {quality}.',ja='{quality}版をリクエストする。',ko='{quality} 버전을 요청합니다.',pt_BR='Solicitar a versão {quality}.',vi='Yêu cầu phiên bản {quality}.',zh_Hans='请求 {quality} 版本。'),
2036:L(ar='استخدم {quality} للتشغيل.',fr='Utiliser {quality} pour la lecture.',hi='प्लेबैक के लिए {quality} का उपयोग करें।',id='Gunakan {quality} untuk pemutaran.',ko='재생에 {quality}을(를) 사용합니다.',pt_BR='Use {quality} para reprodução.',vi='Dùng {quality} để phát lại.',zh_Hans='使用 {quality} 进行播放。',zh_Hant='使用 {quality} 進行播放。'),
2037:L(ko='화질 선택'),
2038:L(hi='यह गुणवत्ता आपकी मीडिया लाइब्रेरी में उपलब्ध नहीं है।',ko='이 화질은 미디어 라이브러리에서 사용할 수 없습니다.',vi='Chất lượng này không có trong thư viện phương tiện của bạn.',zh_Hans='此画质在您的媒体库中不可用。',zh_Hant='此畫質在您的媒體庫中無法使用。'),
2039:L(ar='أضف إلى المجموعة',ko='컬렉션에 추가',vi='Thêm vào bộ sưu tập',zh_Hans='添加到媒体合集',zh_Hant='新增至媒體合集'),
2040:L(hi='{name} में जोड़ें',ja='{name}に追加',ko='{name}에 추가',zh_Hans='添加到 {name}'),
2041:L(ar='جارٍ تحميل حالة مجموعة {server} أو تحديثها.',fr='L’état de la collection {server} est en cours de chargement ou de mise à jour.',hi='{server} संग्रह की स्थिति लोड हो रही है या अपडेट की जा रही है।',id='Status koleksi {server} sedang dimuat atau diperbarui.',ja='{server}のコレクション状態を読み込み中、または更新中です。',ko='{server} 컬렉션 상태를 불러오거나 업데이트하는 중입니다.',pt_BR='O estado da coleção {server} está sendo carregado ou atualizado.',vi='Trạng thái bộ sưu tập {server} đang được tải hoặc cập nhật.'),
2042:L(fr='Créez d’abord une collection dans {server}. SeerrNG ajoute uniquement des titres aux collections existantes.',hi='पहले {server} में एक कलेक्शन बनाएँ। SeerrNG केवल मौजूदा कलेक्शन में शीर्षक जोड़ता है।',ja='まず{server}でコレクションを作成してください。SeerrNGは既存のコレクションにのみ作品を追加します。',vi='Trước tiên, hãy tạo bộ sưu tập trên {server}. SeerrNG chỉ thêm phim vào các bộ sưu tập đã tồn tại.',zh_Hans='先在 {server} 中创建一个合集。SeerrNG 只会将作品添加到已有合集中。',zh_Hant='請先在 {server} 建立一個合集。SeerrNG 只會將作品加入既有合集。'),
2043:L(fr='Impossible de charger les collections ou de confirmer la modification. Rechargez leur état actuel avant d’en modifier le contenu.',hi='संग्रह लोड नहीं हो सके या बदलाव की पुष्टि नहीं हो सकी। उनमें बदलाव करने से पहले उनकी मौजूदा स्थिति फिर से लोड करें।',ko='컬렉션을 불러오지 못했거나 변경을 확인하지 못했습니다. 항목을 변경하기 전에 현재 상태를 다시 불러오세요.',pt_BR='Não foi possível carregar as coleções ou confirmar a alteração. Recarregue o estado atual antes de modificar o conteúdo.',vi='Không thể tải các bộ sưu tập hoặc xác nhận thay đổi. Hãy tải lại trạng thái hiện tại trước khi thay đổi nội dung.',zh_Hans='无法加载合集或确认更改。请在修改合集内容前重新加载其当前状态。',zh_Hant='無法載入合集或確認變更。修改合集內容前，請重新載入目前狀態。'),
2044:L(ar='مجموعات خادم الوسائط غير متاحة',pt_BR='Coleções do servidor de mídia indisponíveis',vi='Bộ sưu tập trên máy chủ phương tiện không khả dụng',zh_Hans='媒体服务器合集不可用',zh_Hant='媒體伺服器合集無法使用'),
2045:L(ar='اختر مجموعة مشتركة موجودة في {server} لإضافة هذا المسلسل بأكمله إليها أو إزالته منها. لا تُضاف الحلقات المحددة بشكل منفصل.',fr='Choisissez une collection partagée existante de {server} pour y ajouter ou en retirer la série entière. Les épisodes sélectionnés ne sont pas ajoutés séparément.',hi='पूरी सीरीज़ को जोड़ने या हटाने के लिए {server} की कोई मौजूदा साझा कलेक्शन चुनें। चुने हुए एपिसोड अलग से नहीं जोड़े जाते।',id='Pilih koleksi bersama {server} yang sudah ada untuk menambahkan atau menghapus seluruh serial ini. Episode yang dipilih tidak ditambahkan secara terpisah.',ja='このシリーズ全体を追加または削除するため、{server} にある既存の共有コレクションを選択してください。選択したエピソードは個別には追加されません。',pt_BR='Escolha uma coleção compartilhada já existente em {server} para adicionar ou remover a série inteira. Os episódios selecionados não são adicionados separadamente.',vi='Chọn bộ sưu tập dùng chung hiện có trên {server} để thêm hoặc xóa toàn bộ bộ phim dài tập này. Các tập đã chọn không được thêm riêng.',zh_Hans='选择 {server} 中已有的共享合集，以添加或移除此整个剧集。所选剧集不会单独添加。',zh_Hant='選擇 {server} 中既有的共享合集，以新增或移除此整部影集。所選集數不會另外新增。'),
2046:L(ar='تتجاوز قائمة مجموعات {server} الحد المدعوم. لا تتوفر قائمة جزئية.',fr='La liste des collections de {server} dépasse la limite prise en charge. Aucune liste partielle n’est proposée.',hi='{server} की कलेक्शन सूची समर्थित सीमा से अधिक है। आंशिक सूची उपलब्ध नहीं है।',id='Daftar koleksi {server} melebihi batas yang didukung. Daftar sebagian tidak tersedia.',ja='{server}のコレクション数が対応上限を超えています。一部だけの一覧は表示しません。',ko='{server} 컬렉션 목록이 지원 한도를 초과했습니다. 일부 목록은 제공되지 않습니다.',pt_BR='A lista de coleções de {server} excede o limite suportado. Não há lista parcial.',vi='Danh sách bộ sưu tập của {server} vượt quá giới hạn hỗ trợ. Không cung cấp danh sách một phần.'),
2047:L(fr='Associez votre propre compte {server} avant de modifier ses collections.',hi='कलेक्शन बदलने से पहले अपना {server} खाता लिंक करें।',id='Hubungkan akun {server} milik Anda sebelum mengubah koleksinya.',ja='コレクションを変更する前に、ご自身の{server}アカウントを連携してください。',pt_BR='Vincule sua própria conta {server} antes de alterar as coleções dela.',vi='Liên kết tài khoản {server} của bạn trước khi thay đổi bộ sưu tập.',zh_Hans='请先关联您自己的 {server} 账户，再修改其合集。',zh_Hant='請先連結您自己的 {server} 帳號，再修改其合集。'),
2049:L(ar='حساب {server} المرتبط بك لا يملك صلاحية إدارة هذه المجموعات المشتركة.',fr='Votre compte {server} lié ne dispose pas de l’autorisation nécessaire pour gérer ces collections partagées.',hi='आपके लिंक किए गए {server} खाते को इन साझा कलेक्शन को प्रबंधित करने की अनुमति नहीं है।',id='Akun {server} yang terhubung tidak memiliki izin untuk mengelola koleksi bersama ini.',ja='連携した{server}アカウントには、これらの共有コレクションを管理する権限がありません。',pt_BR='Sua conta {server} vinculada não tem permissão para gerenciar essas coleções compartilhadas.',vi='Tài khoản {server} đã liên kết của bạn không có quyền quản lý các bộ sưu tập dùng chung này.',zh_Hans='您关联的 {server} 账户无权管理这些共享合集。',zh_Hant='您連結的 {server} 帳號沒有權限管理這些共享合集。'),
2050:L(ar='إزالة من {name}',ko='{name}에서 제거',pt_BR='Remover de {name}',zh_Hans='从 {name} 中移除'),
2051:L(fr='Rechargez l’appartenance à la collection depuis votre compte de serveur multimédia lié. Cela ne répète aucune action d’ajout ou de suppression.',hi='अपने लिंक किए गए मीडिया सर्वर खाते से कलेक्शन की स्थिति फिर से लोड करें। इससे जोड़ने या हटाने की कार्रवाई दोबारा नहीं होगी।',id='Muat ulang status keanggotaan koleksi dari akun server media yang terhubung. Tindakan ini tidak mengulangi proses penambahan atau penghapusan.',ja='連携したメディアサーバーアカウントからコレクションの登録状態を再読み込みします。追加や削除の操作は繰り返されません。',ko='연결된 미디어 서버 계정에서 컬렉션 상태를 다시 불러옵니다. 항목 추가 또는 제거 동작을 반복하지 않습니다.',pt_BR='Recarregue o estado da coleção pela sua conta de servidor de mídia vinculada. Isso não repete uma ação de adição ou remoção.',vi='Tải lại trạng thái bộ sưu tập từ tài khoản máy chủ phương tiện đã liên kết. Thao tác này không lặp lại việc thêm hoặc xóa.',zh_Hans='从您已关联的媒体服务器账户重新加载合集状态。这不会重复添加或移除操作。',zh_Hant='從您已連結的媒體伺服器帳號重新載入合集狀態。這不會重複新增或移除操作。'),
2052:L(zh_Hans='当前配置的媒体服务器不支持合集。',zh_Hant='目前設定的媒體伺服器不支援合集。',vi='Bộ sưu tập không khả dụng trên máy chủ phương tiện đã cấu hình.'),
2053:L(zh_Hans='添加到收藏',zh_Hant='加入最愛'),
2054:L(ar='أضف هذا المسلسل بالكامل إلى {server} {list}. لن تُضاف المواسم أو الحلقات المحددة كلٌّ على حدة.',hi='इस पूरी सीरीज़ को अपने {server} {list} में जोड़ें। चुने हुए सीज़न और एपिसोड अलग से नहीं जोड़े जाते।',ja='このシリーズ全体を {server} の {list} に追加します。選択したシーズンやエピソードは個別には追加されません。',ko='이 시리즈 전체를 {server} {list}에 추가합니다. 선택한 시즌과 에피소드는 별도로 추가되지 않습니다.',pt_BR='Adicione toda a série à lista {list} de {server}. As temporadas e os episódios selecionados não são adicionados separadamente.',vi='Thêm toàn bộ phim bộ này vào {server} {list} của bạn. Các mùa và tập đã chọn không được thêm riêng.',zh_Hans='将整部剧集添加到您的 {server} {list}。所选季和剧集不会单独添加。',zh_Hant='將整部影集加入您的 {server} {list}。所選季與集數不會另外加入。'),
2055:L(ar='أضف إلى قائمة المشاهدة'),
2056:L(ko='저장된 상태를 불러오거나 업데이트하지 못했습니다. 변경하기 전에 다시 시도하세요.'),
2057:L(ar='حالة الحفظ على خادم الوسائط غير متاحة',fr='État enregistré du serveur multimédia indisponible',hi='मीडिया सर्वर पर सहेजी गई स्थिति उपलब्ध नहीं है',id='Status tersimpan di server media tidak tersedia',ja='メディアサーバーの保存状態を利用できません',ko='미디어 서버에 저장된 상태를 사용할 수 없습니다',pt_BR='Estado salvo do servidor de mídia indisponível',vi='Trạng thái đã lưu trên máy chủ phương tiện không khả dụng',zh_Hans='媒体服务器保存的状态不可用',zh_Hant='媒體伺服器儲存的狀態無法使用'),
2058:L(fr='Associez votre propre compte {server} avant d’enregistrer cette série.',hi='इस सीरीज़ को सहेजने से पहले अपना {server} खाता लिंक करें।',id='Hubungkan akun {server} milik Anda sebelum menyimpan serial ini.',ja='このシリーズを保存する前に、ご自身の{server}アカウントを連携してください。',pt_BR='Vincule sua própria conta {server} antes de salvar esta série.',vi='Liên kết tài khoản {server} của bạn trước khi lưu bộ phim dài tập này.',zh_Hans='请先关联您自己的 {server} 账户，再保存此剧集。',zh_Hant='請先連結您自己的 {server} 帳號，再儲存此影集。'),
2059:L(ar='تعذر العثور على هذه السلسلة في كتالوج {server} الذي يمكنك الوصول إليه.',fr='Cette série est introuvable dans le catalogue {server} auquel vous avez accès.',hi='यह सीरीज़ आपके उपलब्ध {server} कैटलॉग में नहीं मिली।',id='Serial ini tidak ditemukan dalam katalog {server} yang dapat Anda akses.',ja='アクセス可能な{server}カタログ内に、このシリーズは見つかりませんでした。',ko='접근 가능한 {server} 카탈로그에서 이 시리즈를 찾을 수 없습니다.',pt_BR='Esta série não foi encontrada no catálogo {server} ao qual você tem acesso.',vi='Không tìm thấy bộ phim dài tập này trong danh mục {server} mà bạn có thể truy cập.',zh_Hans='在您可访问的 {server} 目录中找不到此剧集。',zh_Hant='在您可存取的 {server} 目錄中找不到此影集。'),
2060:L(fr='L’état enregistré de {server} est en cours de chargement ou de mise à jour.',hi='{server} की सहेजी गई स्थिति लोड हो रही है या अपडेट की जा रही है।',id='Status tersimpan {server} sedang dimuat atau diperbarui.',ja='{server}の保存状態を読み込み中、または更新中です。',ko='{server}에 저장된 상태를 불러오거나 업데이트하는 중입니다.',pt_BR='O estado salvo de {server} está sendo carregado ou atualizado.',vi='Trạng thái đã lưu của {server} đang được tải hoặc cập nhật.',zh_Hans='{server} 的已保存状态正在加载或更新。',zh_Hant='{server} 的已儲存狀態正在載入或更新。'),
2061:L(ar='إزالة من المفضلة',zh_Hans='从收藏中移除',zh_Hant='從最愛中移除'),
2062:L(id='Hapus seluruh serial ini dari {server} {list}. Tindakan ini tidak menghapus media atau mengubah daftar tontonan Seerr Anda.',ja='このシリーズ全体を {server} の {list} から削除します。メディアは削除されず、Seerr のウォッチリストも変更されません。',ko='이 시리즈 전체를 {server} {list}에서 제거합니다. 미디어는 삭제되지 않으며 Seerr 시청 목록도 변경되지 않습니다.',zh_Hans='从您的 {server} {list} 中移除整部剧集。这不会删除媒体，也不会更改您的 Seerr 观看列表。',zh_Hant='從您的 {server} {list} 中移除整部影集。這不會刪除媒體，也不會變更您的 Seerr 觀看清單。'),
2063:L(ar='إزالة من قائمة المشاهدة'),
2064:L(de='Laden Sie den gespeicherten Zustand erneut aus Ihrem eigenen Medienserver-Konto. Dadurch wird keine Aktion zum Hinzufügen oder Entfernen wiederholt.',fr='Rechargez l’état enregistré depuis votre propre compte de serveur multimédia. Cela ne répète aucune action d’ajout ou de suppression.',hi='अपने मीडिया सर्वर खाते से सहेजी गई स्थिति फिर से लोड करें। इससे जोड़ने या हटाने की कार्रवाई दोबारा नहीं होगी।',id='Muat ulang status tersimpan dari akun server media Anda sendiri. Tindakan ini tidak mengulangi proses penambahan atau penghapusan.',ja='ご自身のメディアサーバーアカウントから保存状態を再読み込みします。追加や削除の操作は繰り返されません。',ko='자신의 미디어 서버 계정에서 저장된 상태를 다시 불러옵니다. 항목 추가 또는 제거 동작을 반복하지 않습니다.'),
2070:L(hi='TheTVDB द्वारा दिया गया मेटाडेटा। स्रोत का श्रेय देना आवश्यक है।',id='Metadata disediakan oleh TheTVDB. Atribusi sumber wajib dicantumkan.',ja='メタデータの提供元はTheTVDBです。出典の明記が必要です。',vi='Siêu dữ liệu do TheTVDB cung cấp. Bắt buộc ghi công nguồn.',zh_Hans='元数据由 TheTVDB 提供。必须注明来源。',zh_Hant='中繼資料由 TheTVDB 提供。必須標示來源。'),
2071:L(ar='TVmaze (مُعدّل)',fr='TVmaze (adapté)',hi='TVmaze (अनुकूलित)',ja='TVmaze（改変）',ko='TVmaze (각색됨)',vi='TVmaze (đã biên tập)',zh_Hans='TVmaze（改编）',zh_Hant='TVmaze（改編）'),
2072:L(ar='بيانات TVmaze الوصفية معدّلة ومُشاركة بموجب ترخيص CC BY-SA 4.0.',id='Metadata TVmaze diadaptasi dan dibagikan berdasarkan lisensi CC BY-SA 4.0.',vi='Siêu dữ liệu TVmaze được điều chỉnh và chia sẻ theo giấy phép CC BY-SA 4.0.',zh_Hant='中繼資料 TVmaze 經改編，並依 CC BY-SA 4.0 授權分享。'),
2073:L(ar='Wikidata',fr='Wikidata',hi='Wikidata',ja='Wikidata',ko='Wikidata',pt_BR='Wikidata',zh_Hans='Wikidata',zh_Hant='Wikidata'),
2074:L(ar='تُشارك البيانات المنظّمة من Wikidata بموجب ترخيص CC0.',ja='Wikidata の構造化データは CC0 の下で共有されています。',zh_Hans='Wikidata 结构化数据依据 CC0 共享。'),
2076:L(ar='علامة الصح الخضراء: متاح. علامة X الحمراء: غير متاح.',fr='Coche verte : disponible. X rouge : indisponible.',hi='हरे चेक का निशान: उपलब्ध। लाल X: उपलब्ध नहीं।',id='Tanda centang hijau: tersedia. Tanda X merah: tidak tersedia.',ja='緑のチェックマーク: 利用可能。赤いX: 利用不可。',ko='초록색 체크 표시: 사용 가능. 빨간색 X: 사용 불가.',pt_BR='Marca de verificação verde: disponível. X vermelho: indisponível.',vi='Dấu tích màu xanh: có sẵn. Dấu X màu đỏ: không có sẵn.',zh_Hans='绿色勾号：可用。红色 X：不可用。',zh_Hant='綠色勾號：可用。紅色 X：不可用。'),
2077:L(ar='لا توجد مسارات صوتية قابلة للتشغيل.',ja='再生できるトラックはありません。',vi='Không có bản nhạc nào có thể phát.'),
2078:L(ar='اختر العناصر لتشغيلها',id='Pilih item untuk diputar',ko='재생할 항목 선택',pt_BR='Selecione itens para reprodução',vi='Chọn các mục để phát'),
2079:L(zh_Hant='標題'),
2080:L(de='Track',fr='Piste audio',id='Nomor trek audio',pt_BR='Faixa',vi='Bản nhạc'),
2087:L(ar='مسح التحديد',hi='चयन साफ़ करें',id='Batalkan pilihan'),
}
WHY={
2000:'Caller text labels the management panel for issues reported on the current media item; corrected number, status, and media references.',
2001:'This is an all-time filter range; candidates name the entire time span rather than recent/current time.',
2002:'This is a Downloads navigation label; simplified/traditional Chinese candidates remove the added “status” meaning.',
2003:'Open Issues means unresolved reports; Hindi/Vietnamese/Korean targets were malformed or misleading.',
2004:'The empty state says there are no requests; corrected Arabic agreement and Hindi phrasing.',
2006:'The title is an imperative to manage a media type; Hindi candidate supplies the missing verb structure.',
2007:'This is the movie media-type label used by the manage panel; simplified Chinese should not add a counting classifier.',
2008:'The action opens the selected Arr application; corrected word order and removed invented “server” text.',
2009:'Same Arr action with 4K quality specified; corrected word order and invented server wording.',
2010:'Opens Tautulli; corrected the imperative and kept the product name intact.',
2011:'This filter means the last specified number of days; Hindi, Indonesian, and Vietnamese current wording had incorrect tense or number agreement.',
2012:'This column identifies who played the media; Hindi/Vietnamese needed the playback sense.',
2013:'This reports playback counts. Candidates correct counter nouns and keep the bold number outside ICU branches; Arabic also restores exact placeholder and markup parity.',
2014:'This is a media type label for a TV series; corrected the classifier phrase in simplified Chinese.',
2015:'Metacritic is the service name, not a phrase to translate literally; candidates retain the protected name.',
2017:'Hours refer to media playback, not game playing; Arabic current value used the wrong sense.',
2018:'This is a count of playback events; corrected game/verb mistranslations and preserved ICU count markers and categories.',
2019:'Jellystat watch activity means media viewing/playback activity, not a wristwatch or surveillance event.',
2020:'This legend identifies checkmark/X status icons; current translations confused a checkmark with a bank check or inspection.',
2021:'The table row belongs to a music album request; corrected the photo-album mistranslation.',
2022:'These are music/audio tracks; Indonesian current “trek” was ambiguous, so the candidate identifies available audio tracks.',
2024:'Track runtime is duration, not software runtime or processing time.',
2025:'The album track action starts playback; corrected “play” as gaming/product selection and the Hindi audio-action sense.',
2026:'Table heading Title; traditional Chinese had the unrelated “chapter/article” sense.',
2027:'This column identifies the audio track number, not the song title, road lane, trek/hike, or mark.',
2028:'The control keeps a disclosure section expanded across detail pages; corrected pin/anchor calques and reversed grammar.',
2029:'This reverses the pin-open preference; corrected French disconnect and Japanese bread-roll mistranslations.',
2030:'These messages describe the saved order of buttons, not an order/command; candidates restore the rearrangement sense.',
2031:'This describes drag/keyboard reordering and Escape cancellation. Corrected mistranslations while preserving literal key names.',
2032:'The live announcement says a button moved to a numbered position; corrected broken French/Hindi/Asian and Portuguese phrasing.',
2033:'The announcement says the panel is ready to move; Chinese versions had changed movement into generic action.',
2034:'This action reports an issue against a quality version; removed invented French-version wording and malformed fragments.',
2035:'This action requests the selected quality version; candidates fix fragments and preserve {quality}.',
2036:'This selects a quality for playback; candidates correct noun-only or unrelated product-information phrasing.',
2037:'This is the quality-selection label; Korean had changed quality selection into quality management.',
2038:'This status refers to the media library’s available quality; candidates distinguish a media library from a public library.',
2039:'This adds media to a collection; candidates correct fragments, unrelated Korean password, and noun-only Vietnamese.',
2040:'This adds the media to a named collection; corrected “see more” and preposition/order errors.',
2041:'This is the loading/updating state of a server collection; candidates remove machine-generated “the/of/collection” fragments.',
2042:'The help text says to create an existing collection in the named server first and preserve SeerrNG’s limitation; candidates restore product name and action.',
2043:'The error concerns collection loading or unconfirmed changes; reload current membership before attempting another change.',
2044:'This title states media-server collections are unavailable; corrected “media staff” and dropped status.',
2045:'This help text applies to the whole series in a shared server collection, not selected episode subsets; candidates fix word order and media terminology.',
2046:'This explains the server collection list exceeded its limit and no partial list is offered; candidates repair corrupted fragments.',
2047:'Users must link their own server account before changing its collections; corrected account/collection word order.',
2049:'The linked account lacks permission to manage shared collections; corrected missing permission and account relation.',
2050:'Removes a named item from a collection; corrected transfer/step-away and unrelated “other product” errors.',
2051:'Reloads collection membership without repeating the add/remove mutation; candidates preserve the no-retry-action guarantee.',
2052:'The configured server lacks collection support; Chinese/Vietnamese had implied that collections simply did not exist.',
2053:'This watchlist action adds an item to Favorites; Chinese “hobby” was the wrong sense.',
2054:'Adds the complete series to the server list; selected seasons/episodes are not separate additions. Corrected list/season terminology and punctuation.',
2055:'This is an imperative to add to the watchlist; Arabic target was a malformed past-tense fragment.',
2056:'The server saved state could not load/update; Korean translated state as a country and used cargo-loading terminology.',
2057:'This is an unavailable saved-state heading; candidates restore the unavailable status and media-server context.',
2058:'Links the user’s own server account before saving this series; corrected machine-generated syntax.',
2059:'The series cannot be found in the accessible server catalog; candidates restore “accessible catalog” rather than abstract accessibility.',
2060:'The server saved state is loading/updating; candidates remove “the/of” fragments and country-state mistranslations.',
2061:'Removes the item from Favorites; corrected Arabic “get down” and Chinese hobby senses.',
2062:'Removes the complete series from the external server list, without deleting media or changing Seerr watchlist; candidates preserve both cautions.',
2063:'This is a watchlist removal action; corrected Arabic transfer wording.',
2064:'Reloads saved server state only and must not repeat a mutation; candidates remove English add/remove fragments and malformed syntax.',
2070:'Attribution means naming/crediting TheTVDB as source, not contribution or distribution.',
2071:'TVmaze is a protected provider name followed by “adapted”; candidates repair spelling, preserve the brand and translate the status.',
2072:'This is the TVmaze adaptation notice under the exact CC BY-SA 4.0 license; candidates restore provider and license literals.',
2073:'Wikidata is a protected source name; candidates preserve its exact product/source spelling.',
2074:'Wikidata structured data is shared under CC0; Arabic mistranslated the license as CO2 sequestration.',
2076:'This repeats the checkmark/X availability legend; corrections distinguish the status icons.',
2077:'No playable audio tracks are available; corrected Arabic “traces” and Vietnamese “marks”, plus Japanese positive polarity.',
2078:'The track action starts playback; corrected “play” as gaming/product selection.',
2079:'Table heading Title; traditional Chinese had the unrelated “chapter/article” sense.',
2087:'This is an action that clears the current episode selection; Arabic/Hindi/Indonesian current labels read as a noun or unclear choice rather than the clear-selection action.',
2080:'This column identifies the audio track, not the song title, road lane, trek/hike, or mark.',
}
# Freeze and verify current input files at exact live head before authoring judgments.
pr=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
assert pr['state']=='OPEN' and pr['isDraft'] is True and pr['headRefOid']==HEAD,pr
assert run('git','-C',str(REPO),'rev-parse','HEAD').strip()==HEAD
assert run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip()==TREE
assert run('git','-C',str(REPO),'status','--porcelain').strip()==''
assert subprocess.run(['sha256sum','-c','INPUT-SHA256SUMS'],cwd=ROOT,text=True,capture_output=True).returncode==0
manifest=json.loads((ROOT/'input-manifest.json').read_text())
srcraw=git('show',f'{HEAD}:src/i18n/locale/en.json'); sources=list(flatten(json.loads(srcraw)))[2000:2100]
assert len(sources)==100
source_rows=json.loads((ROOT/'source-window.json').read_text())['sourceList']
assert [(x['position'],x['sourceId'],x['source']) for x in source_rows]==[(2000+i,k,v) for i,(k,v) in enumerate(sources)]
loc_json={l:json.loads(git('show',f'{HEAD}:src/i18n/locale/{l}.json')) for l in LOCALES}
cells=[json.loads(x) for x in (ROOT/'source-current-cells.jsonl').read_text().splitlines()]
ctxs=[json.loads(x) for x in (ROOT/'caller-contexts.jsonl').read_text().splitlines()]
assert len(cells)==1200 and len(ctxs)==100
ctxmap={x['sourceId']:x for x in ctxs}
decisions=[]; candidate_rows=[]; counts=collections.Counter(); per=collections.defaultdict(collections.Counter)
for cell in cells:
 pos=cell['sourcePosition']; loc=cell['locale']; sid=cell['sourceId']; candidate=C.get(pos,{}).get(loc)
 assert loc_json[loc][sid]==cell['currentTarget'] and sha(cell['currentTarget'])==cell['currentTargetHash']
 ctx=ctxmap[sid]
 assert sha(canon(ctx))==cell['callerContextSha256']
 if candidate is not None:
  assert candidate!=cell['currentTarget'],(pos,loc,'candidate unchanged')
  disp='propose-correction'; final=candidate; why=WHY[pos]; confidence='high' if pos not in (2013,2018,2031,2045,2054,2071,2072) else 'moderate'
  phsrc=sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))
  phcan=sorted(ph(candidate),key=lambda x:(x['name'],x['kind']))
  tagsrc=tags(cell['source']); tagcan=tags(candidate)
  prot=[t for t in PROTECTED if t.casefold() in cell['source'].casefold()]
  missing=[t for t in prot if t.casefold() not in candidate.casefold()]
  if phsrc!=phcan or tagsrc!=tagcan or missing:
   raise SystemExit(f'candidate integrity failure {pos} {loc}: ph={phsrc==phcan} tags={tagsrc==tagcan} protectedMissing={missing}')
  candidate_row={'sourcePosition':pos,'sourceId':sid,'locale':loc,'source':cell['source'],'sourceTextSha256':cell['sourceTextSha256'],
   'currentTarget':cell['currentTarget'],'currentTargetHash':cell['currentTargetHash'],'candidateTarget':candidate,'candidateTargetHash':sha(candidate),
   'candidatePlaceholderParity':'exact','candidateMarkupParity':'exact','protectedLiterals':prot,'candidateProtectedLiteralMissing':[],'callerContextRef':sid,'callerContextSha256':cell['callerContextSha256'],
   'disposition':disp,'rationale':why,'confidence':confidence}
  candidate_rows.append(candidate_row)
 else:
  disp='accept-current'; final=cell['currentTarget']; why='Current wording preserves the source meaning in the pinned component context; current placeholders, markup, and applicable protected literals were reviewed.'
  confidence='moderate'
  phsrc=sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))
  phcan=sorted(ph(final),key=lambda x:(x['name'],x['kind']))
  tagsrc=tags(cell['source']); tagcan=tags(final)
  prot=[t for t in PROTECTED if t.casefold() in cell['source'].casefold()]
  missing=[t for t in prot if t.casefold() not in final.casefold()]
  # Keep any unresolved exact protected name as an explicit hold, not a silent accept.
  if phsrc!=phcan or tagsrc!=tagcan or missing:
   disp='hold'; final=None; why='Needs locale specialist review: current value has placeholder/markup/protected-literal drift and no sufficiently reliable candidate was established.'
   confidence='low'
  candidate_row=None
 final_hash=sha(final) if final is not None else None
 row={**cell,'disposition':disp,'finalTarget':final,'finalTargetHash':final_hash,'rationale':why,'confidence':confidence,
  'callerContext':ctx,'candidatePlaceholderParity':'exact' if final is not None and sorted(ph(cell['source']),key=lambda x:(x['name'],x['kind']))==sorted(ph(final),key=lambda x:(x['name'],x['kind'])) else ('not-applicable' if final is None else 'mismatch'),
  'candidateMarkupParity':'exact' if final is not None and tags(cell['source'])==tags(final) else ('not-applicable' if final is None else 'mismatch'),
  'protectedLiterals':prot,'candidateProtectedLiteralMissing':missing if final is not None else []}
 decisions.append(row); counts[disp]+=1; per[loc][disp]+=1
 if candidate_row is not None: pass
writejl(ROOT/'primary-review-ledger.jsonl',decisions)
writej(ROOT/'candidate-targets.json',{'repository':REPO_NAME,'pullRequest':PR,'head':HEAD,'tree':TREE,'candidateCount':len(candidate_rows),
 'candidateTargets':[{'sourcePosition':x['sourcePosition'],'sourceId':x['sourceId'],'locale':x['locale'],'candidateTarget':x['candidateTarget'],'candidateTargetHash':x['candidateTargetHash']} for x in candidate_rows]})
# Also provide a row-wise correction ledger with rationale and all pins.
writejl(ROOT/'correction-candidates.jsonl',candidate_rows)
summary={'schemaVersion':1,'repository':REPO_NAME,'pullRequest':PR,'exactHead':HEAD,'exactTree':TREE,'livePullRequest':pr,
 'scope':{'positions':[2000,2099],'sourceIds':100,'locales':LOCALES,'cells':len(decisions)},
 'counts':dict(counts),'proposalCount':len(candidate_rows),'perLocale':{loc:dict(per[loc]) for loc in LOCALES},
 'callerContextRows':len(ctxs),'callerReferences':sum(len(c['pinnedLineRefs']) for c in ctxs),'callerFiles':len({f['path'] for c in ctxs for f in c['callerFiles']}),
 'callerGaps':[{'sourceId':c['sourceId'],'status':c['callerUseStatus']} for c in ctxs if not c['pinnedLineRefs']],
 'placeholderParityMismatchesCurrent':sum(x['placeholderParity']!='exact' for x in cells),
 'markupParityMismatchesCurrent':sum(x['markupParity']!='exact' for x in cells),
 'placeholderParityMismatchesFinal':sum(x['candidatePlaceholderParity']!='exact' for x in decisions),
 'markupParityMismatchesFinal':sum(x['candidateMarkupParity']!='exact' for x in decisions),
 'currentProtectedLiteralMismatchCells':sum(bool(x['protectedLiterals']) and any(t.casefold() not in x['currentTarget'].casefold() for t in x['protectedLiterals']) for x in decisions),
 'finalProtectedLiteralMismatchCells':sum(bool(x['candidateProtectedLiteralMissing']) for x in decisions),
 'priorBoundary':json.loads((ROOT/'prior-disposition-boundary.json').read_text()),
 'nativeSpeakerApproval':False,'browserReview':False,'repositoryModified':False,'testsBuildsScansCiRun':False,'workflowFilesTouched':False}
writej(ROOT/'summary.json',summary)
# Re-attest the PR API/ref and exact checked-out tree after review generation.
pr2=json.loads(run('gh','pr','view',str(PR),'--repo',REPO_NAME,'--json','state,isDraft,headRefOid,headRefName,baseRefOid,url'))
remote=run('git','ls-remote','https://github.com/snapetech-org/SeerrNG.git','refs/heads/codex/seerrng-localization-overhaul-20261028').split()[0]
state={'head':run('git','-C',str(REPO),'rev-parse','HEAD').strip(),'tree':run('git','-C',str(REPO),'rev-parse','HEAD^{tree}').strip(),'status':run('git','-C',str(REPO),'status','--porcelain').strip()}
att={'passed':pr2['state']=='OPEN' and pr2['isDraft'] is True and pr2['headRefOid']==HEAD and remote==HEAD and state=={'head':HEAD,'tree':TREE,'status':''},
 'exactHead':HEAD,'exactTree':TREE,'pullRequestState':pr2['state'],'isDraft':pr2['isDraft'],'headRefName':pr2['headRefName'],'remoteHead':remote,'repositoryState':state,
 'sourceIds':100,'localeCells':1200,'sourceTextHashes':100,'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'candidateCount':len(candidate_rows)}
writej(ROOT/'final-reattestation.json',att)
assert att['passed'],att
# Hash final packet; exclude both manifests from self-reference.
names=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in ('SHA256SUMS','INPUT-SHA256SUMS'))
(ROOT/'SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in names))
summary['packetFiles']=len(names)+2; summary['packetBytes']=sum(p.stat().st_size for p in ROOT.iterdir() if p.is_file())
writej(ROOT/'summary.json',summary)
# Recreate final manifest after summary's final bytes changed.
names=sorted(p.name for p in ROOT.iterdir() if p.is_file() and p.name not in ('SHA256SUMS','INPUT-SHA256SUMS'))
(ROOT/'SHA256SUMS').write_text(''.join(f'{sha((ROOT/n).read_bytes())}  {n}\n' for n in names))
print(json.dumps({'head':HEAD,'tree':TREE,'counts':dict(counts),'proposals':len(candidate_rows),'callerRefs':summary['callerReferences'],'callerFiles':summary['callerFiles'],
 'callerGaps':summary['callerGaps'],'currentPlaceholderMismatches':summary['placeholderParityMismatchesCurrent'],'finalPlaceholderMismatches':summary['placeholderParityMismatchesFinal'],
 'currentMarkupMismatches':summary['markupParityMismatchesCurrent'],'finalMarkupMismatches':summary['markupParityMismatchesFinal'],
 'currentProtectedMismatchCells':summary['currentProtectedLiteralMismatchCells'],'finalProtectedMismatchCells':summary['finalProtectedLiteralMismatchCells'],'reattestPassed':att['passed']},ensure_ascii=False,indent=2))
