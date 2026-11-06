#!/usr/bin/env python3
"""Build this reviewer's six-locale SeerrNG blind subset from candidate-free input only."""
import datetime,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
PACKET=ROOT.parent
HEAD='77d30ae742aad7245e6e419237fca6a544531e1f'
TREE='2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
LOCALES=['ar','hi','ja','ko','zh-Hans','zh-Hant']
# Exact recommendations for all 43 absent English IDs in this subset.
T={
486:{'ar':'إضافة المجموعة إلى قائمة الانتظار','hi':'कलेक्शन को कतार में जोड़ें','ja':'コレクションをキューに追加','ko':'컬렉션 대기열에 추가','zh-Hans':'将合集加入队列','zh-Hant':'將合集加入佇列'},
508:{'ar':'قائمة الانتظار نشطة','hi':'कतार सक्रिय','ja':'キュー実行中','ko':'대기열 실행 중','zh-Hans':'队列运行中','zh-Hant':'佇列執行中'},
509:{'ar':'عدد الأفلام القادمة','hi':'आगे की फ़िल्मों की संख्या','ja':'先行する映画の数','ko':'앞서 대기할 영화 수','zh-Hans':'提前排队的电影数','zh-Hant':'提前排入佇列的電影數'},
510:{'ar':'تمت إضافة جميع الأفلام إلى قائمة الانتظار','hi':'सभी फ़िल्में कतार में हैं','ja':'すべての映画がキューに入りました','ko':'모든 영화가 대기열에 추가됨','zh-Hans':'所有电影均已排入队列','zh-Hant':'所有電影皆已排入佇列'},
511:{
'ar':'اطلب هذه المجموعة بترتيب إصدار أفلامها، مع إبقاء فيلم أو فيلمين لم تتم مشاهدتهما في قائمة الانتظار مسبقًا. يستخدم ذلك حسابك وإعدادات الطلب المعتادة. ما تزال الطلبات المستقبلية تتطلب الإذن والحصة والموافقة. وتُحتسب الأفلام المطلوبة سابقًا ضمن عدد الأفلام القادمة.',
'hi':'इस कलेक्शन के लिए फ़िल्मों के रिलीज़ क्रम में अनुरोध करें और एक या दो ऐसी अनदेखी फ़िल्में आगे कतार में रखें। इसमें आपका खाता और अनुरोध की सामान्य डिफ़ॉल्ट सेटिंग इस्तेमाल होती है। भविष्य के अनुरोधों के लिए अनुमति, कोटा और स्वीकृति फिर भी आवश्यक हैं। पहले से अनुरोध की गई फ़िल्में भी इस बफ़र में गिनी जाती हैं।',
'ja':'このコレクションを公開順にリクエストし、未視聴の映画を1本または2本先行してキューに入れます。ご自身のアカウントと通常のリクエスト既定値を使用します。今後のリクエストにも権限、上限、承認が必要です。リクエスト済みの映画も先行数に含まれます。',
'ko':'이 컬렉션의 영화를 개봉 순서대로 요청하고, 아직 시청하지 않은 영화 한두 편을 앞서 대기열에 둡니다. 사용자 계정과 일반 요청 기본값을 사용합니다. 이후 요청에도 권한, 할당량, 승인이 필요합니다. 이미 요청한 영화도 미리 대기할 수량에 포함됩니다.',
'zh-Hans':'按发行顺序请求此合集，并提前在队列中保留一到两部未观看的电影。此功能使用你的账户和常规请求默认设置。后续请求仍需要权限、配额和批准。已请求的电影也计入提前排队的数量。',
'zh-Hant':'依發行順序請求此合集，並提前在佇列中保留一至兩部尚未觀看的電影。此功能會使用你的帳戶與一般請求預設值。後續請求仍須有權限、配額及核准。已請求的電影也會計入提前排隊的數量。'},
512:{'ar':'تعذّر تحديث قائمة انتظار المجموعة. حاول مرة أخرى لاحقًا.','hi':'कलेक्शन की कतार अपडेट नहीं हो सकी। बाद में फिर कोशिश करें।','ja':'コレクションキューを更新できませんでした。後でもう一度お試しください。','ko':'컬렉션 대기열을 업데이트하지 못했습니다. 나중에 다시 시도하세요.','zh-Hans':'无法更新合集队列。请稍后重试。','zh-Hant':'無法更新合集佇列。請稍後再試。'},
513:{'ar':'4K (ضمن قائمة الانتظار الحالية)','hi':'4K (मौजूदा कतार)','ja':'4K（既存のキュー）','ko':'4K (기존 대기열)','zh-Hans':'4K（现有队列）','zh-Hant':'4K（現有佇列）'},
514:{'ar':'جارٍ تحميل قائمة انتظار المجموعة…','hi':'कलेक्शन की कतार लोड हो रही है…','ja':'コレクションキューを読み込み中…','ko':'컬렉션 대기열을 불러오는 중…','zh-Hans':'正在加载合集队列…','zh-Hant':'正在載入合集佇列…'},
515:{'ar':'1 فيلم','hi':'1 फ़िल्म','ja':'映画1本','ko':'영화 1편','zh-Hans':'1 部电影','zh-Hant':'1 部電影'},
516:{'ar':'للمتابعة، اربط حسابك على Plex أو Jellyfin أو Emby.','hi':'जारी रखने के लिए अपना Plex, Jellyfin या Emby खाता लिंक करें।','ja':'続行するには、Plex、Jellyfin、またはEmbyのアカウントを連携してください。','ko':'계속하려면 Plex, Jellyfin 또는 Emby 계정을 연결하세요.','zh-Hans':'请关联你的 Plex、Jellyfin 或 Emby 账户以继续。','zh-Hant':'請連結你的 Plex、Jellyfin 或 Emby 帳戶以繼續。'},
517:{'ar':'المشاهدة: {watched} · طلبات قائمة الانتظار: {requested} · إجمالي الأفلام: {total}','hi':'{watched} देखी गईं · इस कतार से {requested} का अनुरोध किया गया · कुल {total} फ़िल्में','ja':'{watched}本視聴済み · このキューから{requested}本リクエスト済み · 合計{total}本','ko':'{watched}편 시청 · 이 대기열에서 {requested}편 요청 · 총 {total}편','zh-Hans':'已观看 {watched} 部 · 此队列已请求 {requested} 部 · 共 {total} 部电影','zh-Hant':'已觀看 {watched} 部 · 此佇列已請求 {requested} 部 · 共 {total} 部電影'},
518:{'ar':'سجل المشاهدة غير متاح. ستتم إعادة المحاولة تلقائيًا.','hi':'प्लेबैक इतिहास उपलब्ध नहीं है। अपने-आप फिर कोशिश की जाएगी।','ja':'再生履歴を利用できません。自動的に再試行します。','ko':'재생 기록을 사용할 수 없습니다. 자동으로 다시 시도합니다.','zh-Hans':'播放记录不可用。正在自动重试。','zh-Hant':'播放紀錄無法使用。正在自動重試。'},
519:{'ar':'الجودة','hi':'गुणवत्ता','ja':'画質','ko':'화질','zh-Hans':'画质','zh-Hant':'畫質'},
520:{'ar':'طلب سابق في قائمة الانتظار مفقود أو توقف. أعد تشغيل قائمة الانتظار لطلب الأفلام المفقودة مجددًا.','hi':'कतार का पिछला अनुरोध मौजूद नहीं है या बीच में रुक गया। छूटी हुई फ़िल्मों का अनुरोध फिर से करने के लिए कतार रीस्टार्ट करें।','ja':'以前のキューリクエストが見つからないか、中断されました。キューを再起動すると、未リクエストの映画を再度リクエストできます。','ko':'이전 대기열 요청이 없거나 중단되었습니다. 누락된 영화를 다시 요청하려면 대기열을 다시 시작하세요.','zh-Hans':'先前的队列请求不存在或已中断。重新启动队列以再次请求缺少的电影。','zh-Hant':'先前的佇列請求已不存在或遭到中斷。重新啟動佇列即可再次請求缺少的電影。'},
521:{'ar':'راجع صلاحيات الطلب والحصص والعناوين المحظورة أو إعدادات الخدمة. تظل الطلبات المعلّقة بحاجة إلى موافقة.','hi':'अनुरोध की पहुँच, कोटा, अवरुद्ध शीर्षक या सेवा सेटिंग जाँचें। लंबित अनुरोधों के लिए अब भी अनुमोदन आवश्यक है।','ja':'リクエスト権限、上限、ブロック済みタイトル、またはサービス設定を確認してください。保留中のリクエストにも承認が必要です。','ko':'요청 권한, 할당량, 차단된 제목 또는 서비스 설정을 확인하세요. 대기 중인 요청도 승인이 필요합니다.','zh-Hans':'请检查请求权限、配额、屏蔽的影片或服务设置。待处理的请求仍需批准。','zh-Hant':'請檢查請求權限、配額、封鎖的影片或服務設定。待處理的請求仍須核准。'},
522:{'ar':'لبدء قائمة الانتظار، يلزم توفر صلاحية طلب الأفلام وجودة مفعّلة.','hi':'कतार शुरू करने के लिए फ़िल्मों का अनुरोध करने की अनुमति और सक्षम गुणवत्ता आवश्यक है।','ja':'キューを開始するには、映画をリクエストする権限と有効な画質設定が必要です。','ko':'대기열을 시작하려면 영화 요청 권한과 활성화된 화질 설정이 필요합니다.','zh-Hans':'开始队列需要电影请求权限和已启用的画质。','zh-Hant':'啟動佇列需要電影請求權限及已啟用的畫質。'},
523:{'ar':'أعد تشغيل قائمة الانتظار','hi':'कतार दोबारा शुरू करें','ja':'キューを再起動','ko':'대기열 다시 시작','zh-Hans':'重新启动队列','zh-Hant':'重新啟動佇列'},
524:{'ar':'ابدأ قائمة الانتظار','hi':'कतार शुरू करें','ja':'キューを開始','ko':'대기열 시작','zh-Hans':'开始队列','zh-Hant':'開始佇列'},
525:{'ar':'أوقف قائمة الانتظار','hi':'कतार रोकें','ja':'キューを停止','ko':'대기열 중지','zh-Hans':'停止队列','zh-Hant':'停止佇列'},
526:{'ar':'يمنع إيقاف قائمة الانتظار إرسال طلبات مستقبلية. وتظل الطلبات الحالية والملفات التي تم تنزيلها كما هي.','hi':'रोकने से भविष्य के अनुरोध रुक जाते हैं। पहले से किए गए अनुरोध और डाउनलोड की गई फ़ाइलें बनी रहेंगी।','ja':'停止すると、今後のリクエストは行われません。既存のリクエストとダウンロード済みファイルはそのまま残ります。','ko':'중지하면 이후 요청이 생성되지 않습니다. 기존 요청과 다운로드한 파일은 그대로 유지됩니다.','zh-Hans':'停止后将不再发出新请求。现有请求和已下载的文件会保留。','zh-Hant':'停止後不會再提出新請求。現有請求及已下載的檔案都會保留。'},
527:{'ar':'تم إيقاف قائمة الانتظار','hi':'कतार रोक दी गई है','ja':'キューを停止しました','ko':'대기열 중지됨','zh-Hans':'队列已停止','zh-Hant':'佇列已停止'},
528:{'ar':'إضافة المجموعة إلى قائمة الانتظار','hi':'कलेक्शन को कतार में जोड़ें','ja':'コレクションをキューに追加','ko':'컬렉션 대기열에 추가','zh-Hans':'将合集加入队列','zh-Hant':'將合集加入佇列'},
529:{'ar':'2 أفلام','hi':'2 फ़िल्में','ja':'映画2本','ko':'영화 2편','zh-Hans':'2 部电影','zh-Hant':'2 部電影'},
530:{'ar':'قيد الانتظار','hi':'प्रतीक्षा में','ja':'待機中','ko':'대기 중','zh-Hans':'等待中','zh-Hant':'等待中'},
2714:{
'ar':'{count, plural, one {# حلقة} other {# حلقات}}','hi':'{count, plural, one {# एपिसोड} other {# एपिसोड}}','ja':'{count, plural, one {# 話} other {# 話}}','ko':'{count, plural, one {#개 에피소드} other {#개 에피소드}}','zh-Hans':'{count, plural, one {# 集} other {# 集}}','zh-Hant':'{count, plural, one {# 集} other {# 集}}'},
2715:{'ar':'جارٍ تحميل إعداد قائمة انتظار الحلقات…','hi':'आपकी एपिसोड कतार की सेटिंग लोड हो रही है…','ja':'エピソードキューの設定を読み込み中…','ko':'에피소드 큐 설정을 불러오는 중…','zh-Hans':'正在加载剧集队列设置…','zh-Hant':'正在載入集數佇列設定…'},
2716:{'ar':'إيقاف','hi':'बंद','ja':'オフ','ko':'끔','zh-Hans':'关闭','zh-Hant':'關閉'},
2717:{'ar':'طول قائمة الانتظار','hi':'कतार की लंबाई','ja':'キューの長さ','ko':'대기열 길이','zh-Hans':'队列长度','zh-Hant':'佇列長度'},
2718:{'ar':'يؤثر هذا التغيير في الإضافة إلى قائمة الانتظار مستقبلًا فقط. وتظل طلبات الحلقات الحالية والملفات التي تم تنزيلها كما هي.','hi':'इससे केवल भविष्य में कतार में जोड़े जाने वाले एपिसोड बदलेंगे। मौजूदा एपिसोड अनुरोध और डाउनलोड की गई फ़ाइलें यथावत रहेंगी।','ja':'変更されるのは今後のキュー登録のみです。既存のエピソードリクエストとダウンロード済みファイルはそのまま残ります。','ko':'이 설정은 앞으로 대기열에 추가되는 항목에만 적용됩니다. 기존 에피소드 요청과 다운로드한 파일은 그대로 유지됩니다.','zh-Hans':'此更改仅影响今后的排队。现有剧集请求和已下载的文件会保留。','zh-Hant':'此變更只影響後續加入佇列的項目。現有集數請求及已下載的檔案都會保留。'},
2719:{'ar':'تعذّر حفظ قائمة انتظار الحلقات. أعد تحميل الطلب وحاول مجددًا.','hi':'एपिसोड कतार सहेजी नहीं जा सकी। अनुरोध फिर से लोड करके दोबारा कोशिश करें।','ja':'エピソードキューを保存できませんでした。リクエストを再読み込みして、もう一度お試しください。','ko':'에피소드 큐를 저장하지 못했습니다. 요청을 새로고침한 뒤 다시 시도하세요.','zh-Hans':'无法保存剧集队列。请重新加载请求后重试。','zh-Hant':'無法儲存集數佇列。請重新載入請求後再試一次。'},
2720:{'ar':'تم حفظ قائمة انتظار الحلقات.','hi':'एपिसोड कतार सहेजी गई।','ja':'エピソードキューを保存しました。','ko':'에피소드 큐를 저장했습니다.','zh-Hans':'剧集队列已保存。','zh-Hant':'集數佇列已儲存。'},
2721:{'ar':'الإعداد الافتراضي للحساب ({count})','hi':'खाते का डिफ़ॉल्ट ({count})','ja':'アカウントの既定値（{count}）','ko':'계정 기본값 ({count})','zh-Hans':'账户默认值（{count}）','zh-Hant':'帳戶預設值（{count}）'},
2722:{'ar':'تعذّر تحميل الإعداد الافتراضي للحساب. أغلق مربع الحوار هذا وحاول مرة أخرى.','hi':'खाते का डिफ़ॉल्ट लोड नहीं हो सका। यह संवाद बंद करके फिर कोशिश करें।','ja':'アカウントの既定値を読み込めませんでした。このダイアログを閉じて、もう一度お試しください。','ko':'계정 기본값을 불러오지 못했습니다. 이 대화상자를 닫고 다시 시도하세요.','zh-Hans':'无法加载账户默认值。请关闭此对话框后重试。','zh-Hant':'無法載入帳戶預設值。請關閉此對話方塊後再試一次。'},
2723:{'ar':'قائمة انتظار الحلقات','hi':'एपिसोड कतार','ja':'エピソードキュー','ko':'에피소드 큐','zh-Hans':'剧集队列','zh-Hant':'集數佇列'},
3199:{'ar':'إيقاف','hi':'बंद','ja':'オフ','ko':'끔','zh-Hans':'关闭','zh-Hant':'關閉'},
3201:{'ar':'يستخدم هذا الطلب إعداد قائمة انتظار الحلقات الخاص به: {count}.','hi':'यह अनुरोध अपनी एपिसोड कतार सेटिंग का उपयोग करता है: {count}।','ja':'このリクエストでは、独自のエピソードキュー設定（{count}）を使用します。','ko':'이 요청은 자체 에피소드 큐 설정인 {count}를 사용합니다.','zh-Hans':'此请求使用自己的剧集队列设置：{count}。','zh-Hant':'此請求使用自己的集數佇列設定：{count}。'},
3369:{'ar':'قائمة انتظار الحلقات','hi':'एपिसोड कतार','ja':'エピソードキュー','ko':'에피소드 큐','zh-Hans':'剧集队列','zh-Hant':'集數佇列'},
4481:{'ar':'قائمة انتظار مجموعة الأفلام','hi':'फ़िल्म कलेक्शन कतार','ja':'映画コレクションキュー','ko':'영화 컬렉션 대기열','zh-Hans':'电影合集队列','zh-Hant':'電影合集佇列'},
4486:{'ar':'تحليل تشغيل Plex','hi':'Plex प्लेबैक विश्लेषण','ja':'Plex再生解析','ko':'Plex 재생 분석','zh-Hans':'Plex 播放分析','zh-Hant':'Plex 播放分析'},
5029:{'ar':'تحليل المواسم أثناء التشغيل','hi':'प्लेबैक के दौरान सीज़नों का विश्लेषण करें','ja':'再生中にシーズンを解析','ko':'재생 중 시즌 분석','zh-Hans':'播放期间分析剧季','zh-Hant':'播放期間分析影集季數'},
5030:{
'ar':'فعّل خيار إضافة تحليل Plex إلى قائمة الانتظار أثناء تشغيل حلقة في مكتبة TV مفعّلة. يُضاف موسمان كحد أقصى إلى القائمة كل دقيقة، ولا يُضاف الموسم نفسه أكثر من مرة كل 30 يومًا. يتحكم Plex في إنشاء المقاطع التمهيدية وشارات النهاية؛ وتظل إعدادات المكتبة ومتطلبات Plex Pass سارية.',
'hi':'एपिसोड किसी सक्षम TV लाइब्रेरी में चलने पर Plex विश्लेषण को कतार में डालने की सुविधा चालू करें। प्रति मिनट अधिकतम दो सीज़न कतार में डाले जाते हैं और हर सीज़न को 30 दिनों में अधिकतम एक बार कतार में रखा जाता है। परिचय और क्रेडिट बनाने का नियंत्रण Plex के पास है; लाइब्रेरी सेटिंग और Plex Pass की आवश्यकताएँ अब भी लागू होती हैं।',
'ja':'有効な TV ライブラリでエピソードの再生中にPlex解析をキューに追加するには、この設定を有効にします。1分あたり最大2シーズンまでキューに入り、各シーズンは30日ごとに1回までです。イントロとクレジットの生成は Plex が制御します。ライブラリ設定と Plex Pass の要件は引き続き適用されます。',
'ko':'활성화하면 에피소드가 활성화된 TV 라이브러리에서 재생될 때 Plex 분석을 대기열에 추가합니다. 분당 최대 두 시즌을 추가하고, 각 시즌은 30일마다 최대 한 번만 추가합니다. 인트로와 크레딧 생성은 Plex가 제어하며 라이브러리 설정과 Plex Pass 요건은 계속 적용됩니다.',
'zh-Hans':'启用后，剧集在已启用的 TV 媒体库中播放时会将 Plex 分析加入队列。每分钟最多排入两季；每一季每 30 天最多排入一次。片头和片尾字幕的生成由 Plex 控制；Plex 媒体库设置及 Plex Pass 要求仍然适用。',
'zh-Hant':'啟用後，當劇集在已啟用的 TV 媒體庫中播放時，會將 Plex 分析加入佇列。每分鐘最多排入兩季；每一季每 30 天最多排入一次。片頭與片尾字幕的產生由 Plex 控制；Plex 媒體庫設定及 Plex Pass 要求仍然適用。'},
6619:{
'ar':'لم يُعِد Trakt التفويض إلى SeerrNG. تحقق من عنوان URL العام للتطبيق باستخدام HTTPS وعنوان URL لرد الاتصال المسجّل في تطبيق Trakt، ثم حاول مرة أخرى.',
'hi':'Trakt ने SeerrNG को प्राधिकरण वापस नहीं दिया। Trakt ऐप में सार्वजनिक HTTPS ऐप URL और पंजीकृत callback URL जाँचें, फिर दोबारा कोशिश करें।',
'ja':'Trakt から SeerrNG に認可情報が返されませんでした。Trakt アプリに登録されている公開 HTTPS アプリケーション URL とコールバック URL を確認して、もう一度お試しください。',
'ko':'Trakt가 SeerrNG에 인증을 반환하지 않았습니다. Trakt 애플리케이션에 등록된 공개 HTTPS 애플리케이션 URL과 콜백 URL을 확인한 뒤 다시 시도하세요.',
'zh-Hans':'Trakt 未将授权信息返回给 SeerrNG。请检查 Trakt 应用中注册的公共 HTTPS 应用 URL 和回调 URL，然后重试。',
'zh-Hant':'Trakt 未將授權資訊傳回 SeerrNG。請檢查 Trakt 應用程式中註冊的公開 HTTPS 應用程式 URL 和回呼 URL，然後再試一次。'},
6620:{
'ar':'لربط Trakt، يجب على المسؤول تعيين عنوان URL عام للتطبيق باستخدام HTTPS في الإعدادات → عام، ثم تسجيل عنوان URL هذا متبوعًا بالمسار /api/v1/integrations/discovery/trakt/callback في تطبيق Trakt.',
'hi':'Trakt जोड़ने के लिए, व्यवस्थापक को सेटिंग → सामान्य में सार्वजनिक HTTPS ऐप URL सेट करना होगा और फिर उस URL के बाद /api/v1/integrations/discovery/trakt/callback जोड़कर उसे Trakt ऐप में पंजीकृत करना होगा।',
'ja':'Trakt を接続するには、管理者が「設定」→「一般」で公開 HTTPS アプリケーション URL を設定し、その URL の後ろに /api/v1/integrations/discovery/trakt/callback を付けたアドレスを Trakt アプリに登録する必要があります。',
'ko':'Trakt를 연결하려면 관리자가 설정 → 일반에서 공개 HTTPS 애플리케이션 URL을 지정한 다음, 해당 URL 뒤에 /api/v1/integrations/discovery/trakt/callback을 붙인 주소를 Trakt 애플리케이션에 등록해야 합니다.',
'zh-Hans':'要连接 Trakt，管理员必须在“设置 → 常规”中设置公开的 HTTPS 应用 URL，并在 Trakt 应用中注册该 URL 后接 /api/v1/integrations/discovery/trakt/callback 的地址。',
'zh-Hant':'若要連線 Trakt，管理員必須在「設定 → 一般」中設定公開 HTTPS 應用程式 URL，並在 Trakt 應用程式中登錄該 URL 後接上 /api/v1/integrations/discovery/trakt/callback 的網址。'},
}
REFRESH={
'ar':'يُبقي هذا الطلب {count} من الحلقات في قائمة الانتظار مسبقًا.',
'hi':'यह अनुरोध {count} एपिसोड आगे कतार में रखता है।',
'ja':'このリクエストでは、{count}話を先行分としてキューに保持します。',
'ko':'이 요청은 {count}개의 에피소드를 미리 대기열에 유지합니다.',
'zh-Hans':'此请求会预先在队列中保留 {count} 集。',
'zh-Hant':'此請求會預先在佇列中保留 {count} 集。',
}
WHY={
486:'Button label: add the movie collection to the request queue.',508:'Queue status indicates that it is actively running.',509:'This selector controls how many unwatched movies are kept ahead in the queue.',510:'Completion status says every movie in the collection has been queued.',511:'Explains release-order collection requests, the one/two-movie unwatched buffer, account/default behavior, future permission/quota/approval, and how prior requests count.',512:'Error reports a collection-queue update failure and asks the user to retry later.',513:'Quality option is the 4K choice available through an existing queue; 4K is preserved.',514:'Loading status for the collection queue.',515:'Option label retains the exact numeric quantity 1.',516:'Playback history must be linked through one of Plex, Jellyfin, or Emby.',517:'Queue progress preserves all three named count placeholders and their watched/requested/total meanings.',518:'Playback history is temporarily unavailable and the retry happens automatically.',519:'Label for the movie quality selector.',520:'A previous queue request is missing or interrupted; restarting allows the missing movie requests to be sent again.',521:'Guidance points to request permissions, quotas, blocked titles or service settings; pending requests still need approval.',522:'Queue start requires movie-request permission and an enabled quality.',523:'Button restarts the collection queue.',524:'Button starts the collection queue.',525:'Button stops the collection queue.',526:'Clarifies that stopping prevents future requests while existing requests and downloaded files remain.',527:'Queue state is stopped.',528:'Modal title/action for queuing a collection.',529:'Option label retains the exact numeric quantity 2.',530:'Queue state is waiting.',2714:'ICU message counts queued episodes; preserve the count argument, plural selectors, pound signs, and braces.',2715:'Loading status for the account’s Episode Queue setting.',2716:'Off state for the Episode Queue control.',2717:'Label for the override controlling queue length.',2718:'The override changes future queueing only; existing episode requests and downloads remain.',2719:'Save failure asks user to reload the request and retry.',2720:'Confirmation that the Episode Queue setting was saved.',2721:'Account default option preserves the {count} substitution.',2722:'Load failure asks the user to close the dialog and retry.',2723:'Title for the Episode Queue control.',3199:'Off state for the request-level Episode Queue setting.',3201:'Describes a request-specific Episode Queue setting and preserves {count}.',3369:'Navigation label for the Episode Queue.',4481:'Settings job name for a movie collection queue.',4486:'Settings job name for Plex playback analysis; Plex stays in Latin script.',5029:'Opt-in label for analyzing TV seasons during playback.',5030:'Explains playback-triggered Plex analysis, rate limits, the 30-day per-season limit, and Plex-controlled intro/credits; Plex, TV, and Plex Pass are preserved.',6619:'OAuth failure explains that Trakt did not return authorization to SeerrNG and identifies the public HTTPS Application URL and callback URL.',6620:'Setup instructions preserve Trakt, HTTPS, URL, and the callback path; Arabic RTL text keeps the URL path as a contiguous Latin string.',}

def sha(b): return hashlib.sha256(b).hexdigest()
def read_raw(path):
 out=[]
 for line in path.read_bytes().splitlines():
  if line.strip(): out.append((json.loads(line),sha(line)))
 return out
def main():
 gap_rows=read_raw(PACKET/'gap-cells.jsonl')
 source_rows={r['sourceId']:r for r,_ in read_raw(PACKET/'gap-source-rows.jsonl')}
 changed_rows=read_raw(PACKET/'changed-source-cells.jsonl')
 contexts={c['sourceId']:c for c,_ in read_raw(PACKET/'caller-contexts.jsonl')}
 out=[]
 for cell,rowsha in gap_rows:
  if cell['locale'] not in LOCALES: continue
  pos=cell['sourcePosition']; src=source_rows[cell['sourceId']]; ctx=contexts[cell['sourceId']]
  target=T[pos][cell['locale']]
  if cell['currentTargetPresent'] or cell['currentTarget'] is not None: raise SystemExit('gap unexpectedly has target')
  out.append({'recordType':'new-target','sourceId':cell['sourceId'],'locale':cell['locale'],'sourcePosition':pos,
   'sourceText':cell['sourceText'],'proposedTarget':target,'rationale':WHY[pos],'confidence':'moderate',
   'sourceTextSha256':cell['sourceTextSha256'],'callerContextSha256':cell['callerContextSha256'],
   'candidateFreeCellSha256':rowsha,'exactHead':HEAD,'exactTree':TREE,'sourceTokens':cell['sourceTokens']})
 for cell,rowsha in changed_rows:
  if cell['locale'] not in LOCALES: continue
  ctx=contexts[cell['sourceId']]
  out.append({'recordType':'refresh-existing-target','sourceId':cell['sourceId'],'locale':cell['locale'],'sourcePosition':None,
   'sourceText':cell['currentEnglishSourceText'],'currentTarget':cell['currentTarget'],
   'currentTargetSha256':cell['currentTargetSha256'],'proposedTarget':REFRESH[cell['locale']],
   'rationale':'The existing target still says this request uses the administrator’s default. The changed English source now says the request itself keeps {count} episodes queued ahead; the proposed target preserves that new behavior and the {count} placeholder.',
   'confidence':'moderate','sourceTextSha256':cell['currentEnglishSourceSha256'],
   'callerContextSha256':cell['callerContextSha256'],'candidateFreeCellSha256':rowsha,
   'exactHead':HEAD,'exactTree':TREE,'sourceTokens':cell['sourceTokens']})
 out.sort(key=lambda r:(r['recordType'],r.get('sourcePosition') or 0,r['locale']))
 dest=ROOT/'.work'/'other-locales-review.jsonl'
 dest.parent.mkdir(parents=True,exist_ok=True)
 dest.write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for x in out),encoding='utf-8')
 print(json.dumps({'records':len(out),'newTranslations':sum(r['recordType']=='new-target' for r in out),'refreshTargets':sum(r['recordType']=='refresh-existing-target' for r in out),'locales':LOCALES},ensure_ascii=False))
if __name__=='__main__': main()
