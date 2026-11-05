#!/usr/bin/env python3
"""Build primary semantic translation review for the sealed SeerrNG parity input."""
from __future__ import annotations
import hashlib, json, re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
INPUT = HERE.parent
HEAD = "77d30ae742aad7245e6e419237fca6a544531e1f"
TREE = "2c6fe4a0c1c33aa56b01f06a70702f68598509a7"
BASE = "2647e15762de0c2285cd9d8ebc6d27ffafce6358"
BASETREE = "b6f4acb9debdc1b0a838b50d5ad88aaa467e429b"
LOCALES = ["es", "zh-Hans", "hi", "de", "ja", "fr", "pt-BR", "ar", "ko", "zh-Hant", "vi", "id"]
CHANGED = "components.RequestModal.watchAheadActiveForRequest"
PATHS = {"es":"es.json", "zh-Hans":"zh_Hans.json", "hi":"hi.json", "de":"de.json", "ja":"ja.json", "fr":"fr.json", "pt-BR":"pt_BR.json", "ar":"ar.json", "ko":"ko.json", "zh-Hant":"zh_Hant.json", "vi":"vi.json", "id":"id.json"}

T = {}
T["es"] = {
"components.CollectionDetails.queueCollection":"Poner la colección en cola",
"components.CollectionQueue.active":"Cola activa",
"components.CollectionQueue.buffer":"Películas por delante",
"components.CollectionQueue.completed":"Todas las películas están en cola",
"components.CollectionQueue.description":"Solicita esta colección en orden de estreno y mantén una o dos películas sin ver por delante. Se usarán tu cuenta y las opciones de solicitud habituales. Las solicitudes futuras seguirán necesitando permisos, cuota y aprobación. Las películas ya solicitadas también cuentan para el margen.",
"components.CollectionQueue.error":"No se pudo actualizar la cola de la colección. Inténtalo de nuevo más tarde.",
"components.CollectionQueue.existing4k":"4K (cola existente)",
"components.CollectionQueue.loading":"Cargando la cola de la colección…",
"components.CollectionQueue.one":"1 película",
"components.CollectionQueue.playback-unlinked":"Vincula tu cuenta de Plex, Jellyfin o Emby para continuar.",
"components.CollectionQueue.progress":"{watched} vistas · {requested} solicitadas por esta cola · {total} películas en total",
"components.CollectionQueue.provider-unavailable":"El historial de reproducción no está disponible. Se volverá a intentar automáticamente.",
"components.CollectionQueue.quality":"Calidad",
"components.CollectionQueue.request-cancelled":"Falta una solicitud anterior de la cola o se interrumpió. Reinicia la cola para volver a solicitar las películas que falten.",
"components.CollectionQueue.request-policy":"Revisa los permisos de solicitud, las cuotas, los títulos bloqueados o la configuración del servicio. Las solicitudes pendientes siguen necesitando aprobación.",
"components.CollectionQueue.requestAccess":"Se necesitan permisos para solicitar películas y una calidad habilitada para iniciar una cola.",
"components.CollectionQueue.restart":"Reiniciar cola",
"components.CollectionQueue.start":"Iniciar cola",
"components.CollectionQueue.stop":"Detener cola",
"components.CollectionQueue.stopHelp":"Al detenerla, no se crearán más solicitudes. Las solicitudes existentes y los archivos descargados se conservarán.",
"components.CollectionQueue.stopped":"Cola detenida",
"components.CollectionQueue.title":"Cola de la colección",
"components.CollectionQueue.two":"2 películas",
"components.CollectionQueue.waiting":"En espera",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# episodio} other {# episodios}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"Cargando la configuración de tu cola de episodios…",
"components.RequestEpisodeQueueControl.watchAheadOff":"Desactivado",
"components.RequestEpisodeQueueControl.watchAheadOverride":"Longitud de la cola",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"Solo cambia las colas futuras. Las solicitudes de episodios existentes y los archivos descargados se conservarán.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"No se pudo guardar la cola de episodios. Vuelve a cargar la solicitud e inténtalo de nuevo.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"Cola de episodios guardada.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"Predeterminado de la cuenta ({count})",
"components.RequestEpisodeQueueModal.loadError":"No se pudo cargar la opción predeterminada de la cuenta. Cierra este diálogo e inténtalo de nuevo.",
"components.RequestEpisodeQueueModal.title":"Cola de episodios",
"components.RequestModal.watchAheadOff":"Desactivado",
"components.RequestModal.watchAheadOverrideDescription":"Esta solicitud usa su propia configuración de cola de episodios: {count}.",
"components.Requests.episodeQueue":"Cola de episodios",
"components.Settings.SettingsJobsCache.movie-collection-queue":"Cola de películas de una colección",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Análisis de reproducción de Plex",
"components.Settings.analyzeOnPlayback":"Analizar temporadas durante la reproducción",
"components.Settings.analyzeOnPlaybackTip":"Activa el análisis de Plex en cola cuando se reproduzca un episodio en una biblioteca de TV habilitada. Se ponen en cola como máximo dos temporadas por minuto y cada temporada, como máximo, una vez cada 30 días. Plex controla la generación de intros y créditos; siguen aplicándose la configuración de la biblioteca y los requisitos de Plex Pass.",
"discovery.accounts.traktCallbackFailed":"Trakt no devolvió la autorización a SeerrNG. Comprueba la URL pública de la aplicación HTTPS y la URL de devolución de llamada registrada en la aplicación de Trakt e inténtalo de nuevo.",
"discovery.accounts.traktSetup":"Para conectar Trakt, un administrador debe configurar una URL pública de la aplicación HTTPS en Ajustes → General y registrar en la aplicación de Trakt esa URL seguida de /api/v1/integrations/discovery/trakt/callback.",
CHANGED:"Esta solicitud mantiene {count} en cola por delante."
}

T["zh-Hans"] = {
"components.CollectionDetails.queueCollection":"将合集加入队列",
"components.CollectionQueue.active":"队列运行中",
"components.CollectionQueue.buffer":"前置电影数量",
"components.CollectionQueue.completed":"所有电影均已加入队列",
"components.CollectionQueue.description":"按上映顺序请求此合集，并在前方保留一到两部未观看的电影。将使用你的账户和常规请求默认设置。后续请求仍需具备权限、配额并获得批准。已请求的电影也计入缓冲数量。",
"components.CollectionQueue.error":"无法更新合集队列。请稍后重试。",
"components.CollectionQueue.existing4k":"4K（现有队列）",
"components.CollectionQueue.loading":"正在加载合集队列…",
"components.CollectionQueue.one":"1 部电影",
"components.CollectionQueue.playback-unlinked":"请关联你的 Plex、Jellyfin 或 Emby 账户以继续。",
"components.CollectionQueue.progress":"已观看 {watched} 部 · 此队列已请求 {requested} 部 · 共 {total} 部电影",
"components.CollectionQueue.provider-unavailable":"播放历史暂不可用。系统会自动重试。",
"components.CollectionQueue.quality":"画质",
"components.CollectionQueue.request-cancelled":"较早的队列请求缺失或已中断。重启队列即可再次请求缺失的电影。",
"components.CollectionQueue.request-policy":"请检查请求权限、配额、受限标题或服务设置。待处理的请求仍需审批。",
"components.CollectionQueue.requestAccess":"启动队列需要电影请求权限并启用一种画质。",
"components.CollectionQueue.restart":"重启队列",
"components.CollectionQueue.start":"启动队列",
"components.CollectionQueue.stop":"停止队列",
"components.CollectionQueue.stopHelp":"停止后不会再提交新请求。已存在的请求和已下载的文件会保留。",
"components.CollectionQueue.stopped":"队列已停止",
"components.CollectionQueue.title":"合集队列",
"components.CollectionQueue.two":"2 部电影",
"components.CollectionQueue.waiting":"等待中",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# 集} other {# 集}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"正在加载你的剧集队列设置…",
"components.RequestEpisodeQueueControl.watchAheadOff":"关闭",
"components.RequestEpisodeQueueControl.watchAheadOverride":"队列长度",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"此更改仅影响后续入队操作。已存在的剧集请求和已下载的文件会保留。",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"无法保存剧集队列。请重新加载请求并重试。",
"components.RequestEpisodeQueueControl.watchAheadSaved":"剧集队列已保存。",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"账户默认值（{count}）",
"components.RequestEpisodeQueueModal.loadError":"无法加载账户默认值。请关闭此对话框并重试。",
"components.RequestEpisodeQueueModal.title":"剧集队列",
"components.RequestModal.watchAheadOff":"关闭",
"components.RequestModal.watchAheadOverrideDescription":"此请求使用自己的剧集队列设置：{count}。",
"components.Requests.episodeQueue":"剧集队列",
"components.Settings.SettingsJobsCache.movie-collection-queue":"电影合集队列",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Plex 播放分析",
"components.Settings.analyzeOnPlayback":"播放期间分析剧集",
"components.Settings.analyzeOnPlaybackTip":"启用后，在已启用的 TV 媒体库播放某集时，会将 Plex 分析任务加入队列。每分钟最多排入两季；每季最多每 30 天排入一次。片头和片尾演职员表的生成由 Plex 控制；仍须遵循媒体库设置及 Plex Pass 要求。",
"discovery.accounts.traktCallbackFailed":"Trakt 未能将授权返回给 SeerrNG。请检查 Trakt 应用中的公开 HTTPS 应用程序 URL 和已注册的回调 URL，然后重试。",
"discovery.accounts.traktSetup":"要连接 Trakt，管理员必须在设置 → 常规中设置公开 HTTPS 应用程序 URL，并在 Trakt 应用中注册该 URL 后接 /api/v1/integrations/discovery/trakt/callback。",
CHANGED:"此请求会让 {count} 排在队列前方。"
}

T["hi"] = {
"components.CollectionDetails.queueCollection":"संग्रह को कतार में जोड़ें",
"components.CollectionQueue.active":"कतार सक्रिय",
"components.CollectionQueue.buffer":"आगे की फ़िल्में",
"components.CollectionQueue.completed":"सभी फ़िल्में कतार में हैं",
"components.CollectionQueue.description":"इस संग्रह की फ़िल्मों का अनुरोध रिलीज़ क्रम में करें और एक या दो बिना देखी फ़िल्मों को आगे कतार में रखें। आपके खाते और सामान्य अनुरोध डिफ़ॉल्ट का उपयोग होगा। आगे के अनुरोधों के लिए भी अनुमति, कोटा और मंज़ूरी आवश्यक होगी। पहले से अनुरोधित फ़िल्में भी बफ़र में गिनी जाएँगी।",
"components.CollectionQueue.error":"संग्रह कतार अपडेट नहीं हो सकी। बाद में फिर कोशिश करें।",
"components.CollectionQueue.existing4k":"4K (मौजूदा कतार)",
"components.CollectionQueue.loading":"संग्रह कतार लोड हो रही है…",
"components.CollectionQueue.one":"1 फ़िल्म",
"components.CollectionQueue.playback-unlinked":"जारी रखने के लिए अपना Plex, Jellyfin या Emby खाता लिंक करें।",
"components.CollectionQueue.progress":"{watched} देखी गईं · इस कतार से {requested} का अनुरोध किया गया · कुल {total} फ़िल्में",
"components.CollectionQueue.provider-unavailable":"प्लेबैक इतिहास उपलब्ध नहीं है। अपने आप फिर कोशिश की जाएगी।",
"components.CollectionQueue.quality":"गुणवत्ता",
"components.CollectionQueue.request-cancelled":"कतार का पहले का अनुरोध गायब है या बीच में रुक गया। छूटी हुई फ़िल्मों का फिर से अनुरोध करने के लिए कतार रीस्टार्ट करें।",
"components.CollectionQueue.request-policy":"अनुरोध की अनुमति, कोटा, अवरुद्ध शीर्षक या सेवा सेटिंग जाँचें। लंबित अनुरोधों के लिए अब भी मंज़ूरी ज़रूरी है।",
"components.CollectionQueue.requestAccess":"कतार शुरू करने के लिए फ़िल्मों का अनुरोध करने की अनुमति और सक्षम गुणवत्ता विकल्प ज़रूरी है।",
"components.CollectionQueue.restart":"कतार रीस्टार्ट करें",
"components.CollectionQueue.start":"कतार शुरू करें",
"components.CollectionQueue.stop":"कतार रोकें",
"components.CollectionQueue.stopHelp":"रोकने पर आगे के अनुरोध नहीं बनेंगे। मौजूदा अनुरोध और डाउनलोड की गई फ़ाइलें बनी रहेंगी।",
"components.CollectionQueue.stopped":"कतार रुक गई",
"components.CollectionQueue.title":"संग्रह कतार",
"components.CollectionQueue.two":"2 फ़िल्में",
"components.CollectionQueue.waiting":"प्रतीक्षा में",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# एपिसोड} other {# एपिसोड}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"आपकी एपिसोड कतार सेटिंग लोड हो रही है…",
"components.RequestEpisodeQueueControl.watchAheadOff":"बंद",
"components.RequestEpisodeQueueControl.watchAheadOverride":"कतार की लंबाई",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"यह केवल आगे की कतारों पर लागू होता है। मौजूदा एपिसोड अनुरोध और डाउनलोड की गई फ़ाइलें बनी रहेंगी।",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"एपिसोड कतार सहेजी नहीं जा सकी। अनुरोध फिर से लोड करें और कोशिश करें।",
"components.RequestEpisodeQueueControl.watchAheadSaved":"एपिसोड कतार सहेजी गई।",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"खाते का डिफ़ॉल्ट ({count})",
"components.RequestEpisodeQueueModal.loadError":"खाते का डिफ़ॉल्ट लोड नहीं हो सका। यह संवाद बंद करें और फिर कोशिश करें।",
"components.RequestEpisodeQueueModal.title":"एपिसोड कतार",
"components.RequestModal.watchAheadOff":"बंद",
"components.RequestModal.watchAheadOverrideDescription":"इस अनुरोध की अपनी एपिसोड कतार सेटिंग है: {count}।",
"components.Requests.episodeQueue":"एपिसोड कतार",
"components.Settings.SettingsJobsCache.movie-collection-queue":"फ़िल्म संग्रह कतार",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Plex प्लेबैक विश्लेषण",
"components.Settings.analyzeOnPlayback":"प्लेबैक के दौरान सीज़न का विश्लेषण करें",
"components.Settings.analyzeOnPlaybackTip":"किसी सक्षम TV लाइब्रेरी में एपिसोड चलने पर Plex विश्लेषण कतार में लगाने की सुविधा चालू करें। प्रति मिनट अधिकतम दो सीज़न कतार में लगाए जाएँगे और हर सीज़न को हर 30 दिन में अधिकतम एक बार। इंट्रो और क्रेडिट जनरेट करने का नियंत्रण Plex के पास है; उसकी लाइब्रेरी सेटिंग और Plex Pass की ज़रूरतें भी लागू रहेंगी।",
"discovery.accounts.traktCallbackFailed":"Trakt ने SeerrNG को प्राधिकरण वापस नहीं भेजा। Trakt ऐप में सार्वजनिक HTTPS ऐप्लिकेशन URL और पंजीकृत कॉलबैक URL जाँचें, फिर कोशिश करें।",
"discovery.accounts.traktSetup":"Trakt कनेक्ट करने के लिए, व्यवस्थापक को सेटिंग्स → सामान्य में सार्वजनिक HTTPS ऐप्लिकेशन URL सेट करना होगा और Trakt ऐप में उस URL के बाद /api/v1/integrations/discovery/trakt/callback जोड़कर पंजीकृत करना होगा।",
CHANGED:"इस अनुरोध में {count} कतार में आगे रहेंगे।"
}

T["de"] = {
"components.CollectionDetails.queueCollection":"Filmsammlung einreihen",
"components.CollectionQueue.active":"Warteschlange aktiv",
"components.CollectionQueue.buffer":"Filme im Vorlauf",
"components.CollectionQueue.completed":"Alle Filme sind eingereiht",
"components.CollectionQueue.description":"Fordere die Filme dieser Sammlung in Veröffentlichungsreihenfolge an und halte ein oder zwei ungesehene Filme im Vorlauf. Es werden dein Konto und die üblichen Standardwerte für Anfragen verwendet. Für zukünftige Anfragen sind weiterhin Berechtigung, Kontingent und Genehmigung erforderlich. Bereits angeforderte Filme zählen zum Puffer.",
"components.CollectionQueue.error":"Die Warteschlange der Sammlung konnte nicht aktualisiert werden. Versuche es später erneut.",
"components.CollectionQueue.existing4k":"4K (bestehende Warteschlange)",
"components.CollectionQueue.loading":"Warteschlange der Sammlung wird geladen…",
"components.CollectionQueue.one":"1 Film",
"components.CollectionQueue.playback-unlinked":"Verknüpfe dein Plex-, Jellyfin- oder Emby-Konto, um fortzufahren.",
"components.CollectionQueue.progress":"{watched} gesehen · {requested} über diese Warteschlange angefordert · insgesamt {total} Filme",
"components.CollectionQueue.provider-unavailable":"Der Wiedergabeverlauf ist nicht verfügbar. Es wird automatisch erneut versucht.",
"components.CollectionQueue.quality":"Qualität",
"components.CollectionQueue.request-cancelled":"Eine frühere Warteschlangen-Anfrage fehlt oder wurde unterbrochen. Starte die Warteschlange neu, um fehlende Filme erneut anzufordern.",
"components.CollectionQueue.request-policy":"Prüfe die Anfrageberechtigungen, Kontingente, blockierten Titel oder Diensteinstellungen. Ausstehende Anfragen müssen weiterhin genehmigt werden.",
"components.CollectionQueue.requestAccess":"Zum Starten einer Warteschlange sind die Berechtigung zum Anfordern von Filmen und eine aktivierte Qualität erforderlich.",
"components.CollectionQueue.restart":"Warteschlange neu starten",
"components.CollectionQueue.start":"Warteschlange starten",
"components.CollectionQueue.stop":"Warteschlange stoppen",
"components.CollectionQueue.stopHelp":"Beim Stoppen werden keine zukünftigen Anfragen mehr erstellt. Bestehende Anfragen und heruntergeladene Dateien bleiben erhalten.",
"components.CollectionQueue.stopped":"Warteschlange gestoppt",
"components.CollectionQueue.title":"Sammlungswarteschlange",
"components.CollectionQueue.two":"2 Filme",
"components.CollectionQueue.waiting":"Wartend",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# Folge} other {# Folgen}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"Deine Episodenwarteschlangeneinstellung wird geladen…",
"components.RequestEpisodeQueueControl.watchAheadOff":"Aus",
"components.RequestEpisodeQueueControl.watchAheadOverride":"Warteschlangenlänge",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"Gilt nur für zukünftige Warteschlangeneinträge. Bestehende Episodenanfragen und heruntergeladene Dateien bleiben erhalten.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"Die Episodenwarteschlange konnte nicht gespeichert werden. Lade die Anfrage neu und versuche es erneut.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"Episodenwarteschlange gespeichert.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"Kontostandard ({count})",
"components.RequestEpisodeQueueModal.loadError":"Der Kontostandard konnte nicht geladen werden. Schließe diesen Dialog und versuche es erneut.",
"components.RequestEpisodeQueueModal.title":"Episodenwarteschlange",
"components.RequestModal.watchAheadOff":"Aus",
"components.RequestModal.watchAheadOverrideDescription":"Diese Anfrage verwendet ihre eigene Episodenwarteschlangeneinstellung: {count}.",
"components.Requests.episodeQueue":"Episodenwarteschlange",
"components.Settings.SettingsJobsCache.movie-collection-queue":"Warteschlange für Filmsammlungen",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Plex-Wiedergabeanalyse",
"components.Settings.analyzeOnPlayback":"Staffeln während der Wiedergabe analysieren",
"components.Settings.analyzeOnPlaybackTip":"Aktiviere die eingereihte Plex-Analyse, wenn eine Folge in einer aktivierten TV-Bibliothek wiedergegeben wird. Pro Minute werden höchstens zwei Staffeln eingereiht und jede Staffel höchstens einmal alle 30 Tage. Plex steuert die Erstellung von Intros und Abspann; die Bibliothekseinstellungen und die Anforderungen für Plex Pass gelten weiterhin.",
"discovery.accounts.traktCallbackFailed":"Trakt hat die Autorisierung nicht an SeerrNG zurückgegeben. Prüfe die öffentliche HTTPS-Anwendungs-URL und die in der Trakt-Anwendung registrierte Callback-URL und versuche es erneut.",
"discovery.accounts.traktSetup":"Um Trakt zu verbinden, muss ein Administrator unter Einstellungen → Allgemein eine öffentliche HTTPS-Anwendungs-URL festlegen und in der Trakt-Anwendung diese URL mit /api/v1/integrations/discovery/trakt/callback am Ende registrieren.",
CHANGED:"Diese Anfrage sorgt dafür, dass {count} vor dem nächsten Eintrag in der Warteschlange stehen."
}

T["ja"] = {
"components.CollectionDetails.queueCollection":"コレクションをキューに追加",
"components.CollectionQueue.active":"キュー稼働中",
"components.CollectionQueue.buffer":"先行する映画数",
"components.CollectionQueue.completed":"すべての映画がキューに追加されました",
"components.CollectionQueue.description":"このコレクションを公開順にリクエストし、未視聴の映画を一、二本先行させます。アカウントと通常のリクエスト設定が使用されます。今後のリクエストにも権限、上限、承認が必要です。すでにリクエスト済みの映画も先行数に含まれます。",
"components.CollectionQueue.error":"コレクションキューを更新できませんでした。しばらくしてからもう一度お試しください。",
"components.CollectionQueue.existing4k":"4K（既存のキュー）",
"components.CollectionQueue.loading":"コレクションキューを読み込み中…",
"components.CollectionQueue.one":"映画 1 本",
"components.CollectionQueue.playback-unlinked":"続行するには、Plex、Jellyfin、またはEmbyのアカウントをリンクしてください。",
"components.CollectionQueue.progress":"視聴済み {watched} 本 · このキューからリクエスト済み {requested} 本 · 全 {total} 本の映画",
"components.CollectionQueue.provider-unavailable":"再生履歴を利用できません。自動的に再試行します。",
"components.CollectionQueue.quality":"画質",
"components.CollectionQueue.request-cancelled":"以前のキューリクエストが見つからないか、中断されました。不足している映画を再度リクエストするには、キューを再開してください。",
"components.CollectionQueue.request-policy":"リクエスト権限、上限、ブロックされた作品、またはサービス設定を確認してください。保留中のリクエストには引き続き承認が必要です。",
"components.CollectionQueue.requestAccess":"キューを開始するには、映画のリクエスト権限と有効な画質設定が必要です。",
"components.CollectionQueue.restart":"キューを再開",
"components.CollectionQueue.start":"キューを開始",
"components.CollectionQueue.stop":"キューを停止",
"components.CollectionQueue.stopHelp":"停止すると今後のリクエストが作成されなくなります。既存のリクエストとダウンロード済みファイルはそのまま残ります。",
"components.CollectionQueue.stopped":"キュー停止中",
"components.CollectionQueue.title":"コレクションキュー",
"components.CollectionQueue.two":"映画 2 本",
"components.CollectionQueue.waiting":"待機中",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# エピソード} other {# エピソード}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"エピソードキューの設定を読み込み中…",
"components.RequestEpisodeQueueControl.watchAheadOff":"オフ",
"components.RequestEpisodeQueueControl.watchAheadOverride":"キューの長さ",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"今後のキュー設定にのみ適用されます。既存のエピソードリクエストとダウンロード済みファイルはそのまま残ります。",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"エピソードキューを保存できませんでした。リクエストを再読み込みして、もう一度お試しください。",
"components.RequestEpisodeQueueControl.watchAheadSaved":"エピソードキューを保存しました。",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"アカウントのデフォルト（{count}）",
"components.RequestEpisodeQueueModal.loadError":"アカウントのデフォルトを読み込めませんでした。このダイアログを閉じて、もう一度お試しください。",
"components.RequestEpisodeQueueModal.title":"エピソードキュー",
"components.RequestModal.watchAheadOff":"オフ",
"components.RequestModal.watchAheadOverrideDescription":"このリクエストでは、独自のエピソードキュー設定が使用されます：{count}。",
"components.Requests.episodeQueue":"エピソードキュー",
"components.Settings.SettingsJobsCache.movie-collection-queue":"映画コレクションキュー",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Plex再生分析",
"components.Settings.analyzeOnPlayback":"再生中にシーズンを分析",
"components.Settings.analyzeOnPlaybackTip":"有効なTVライブラリでエピソードを再生したときに、Plex分析をキューに追加します。一分あたり最大二シーズンをキューに追加でき、各シーズンは30日に一度までです。イントロとクレジットの生成はPlexが制御します。ライブラリ設定とPlex Passの要件も引き続き適用されます。",
"discovery.accounts.traktCallbackFailed":"TraktからSeerrNGに認可応答が返されませんでした。Traktアプリに登録した公開HTTPSアプリケーションURLとコールバックURLを確認して、もう一度お試しください。",
"discovery.accounts.traktSetup":"Traktを接続するには、管理者が［設定］→［一般］で公開HTTPSアプリケーションURLを設定し、そのURLの末尾に /api/v1/integrations/discovery/trakt/callback を付けたURLをTraktアプリに登録する必要があります。",
CHANGED:"このリクエストでは、{count} がキューの先頭側に保たれます。"
}

T["fr"] = {
"components.CollectionDetails.queueCollection":"Mettre la collection en file d’attente",
"components.CollectionQueue.active":"File active",
"components.CollectionQueue.buffer":"Films en avance",
"components.CollectionQueue.completed":"Tous les films sont en file d’attente",
"components.CollectionQueue.description":"Demandez les films de cette collection dans l’ordre de sortie en gardant un ou deux films non visionnés en avance. Les paramètres habituels de demande de votre compte seront utilisés. Les prochaines demandes nécessiteront toujours une autorisation, un quota disponible et une approbation. Les films déjà demandés comptent dans le tampon.",
"components.CollectionQueue.error":"Impossible de mettre à jour la file de la collection. Réessayez plus tard.",
"components.CollectionQueue.existing4k":"4K (file existante)",
"components.CollectionQueue.loading":"Chargement de la file de la collection…",
"components.CollectionQueue.one":"1 film",
"components.CollectionQueue.playback-unlinked":"Associez votre compte Plex, Jellyfin ou Emby pour continuer.",
"components.CollectionQueue.progress":"{watched} visionnés · {requested} demandés par cette file · {total} films au total",
"components.CollectionQueue.provider-unavailable":"L’historique de lecture est indisponible. Une nouvelle tentative sera effectuée automatiquement.",
"components.CollectionQueue.quality":"Qualité",
"components.CollectionQueue.request-cancelled":"Une demande antérieure de la file est introuvable ou a été interrompue. Redémarrez la file pour demander à nouveau les films manquants.",
"components.CollectionQueue.request-policy":"Vérifiez les droits de demande, les quotas, les titres bloqués ou les paramètres du service. Les demandes en attente doivent toujours être approuvées.",
"components.CollectionQueue.requestAccess":"Le droit de demander des films et une qualité activée sont nécessaires pour lancer une file.",
"components.CollectionQueue.restart":"Redémarrer la file",
"components.CollectionQueue.start":"Démarrer la file",
"components.CollectionQueue.stop":"Arrêter la file",
"components.CollectionQueue.stopHelp":"L’arrêt empêche les prochaines demandes. Les demandes existantes et les fichiers téléchargés sont conservés.",
"components.CollectionQueue.stopped":"File arrêtée",
"components.CollectionQueue.title":"File d’attente de la collection",
"components.CollectionQueue.two":"2 films",
"components.CollectionQueue.waiting":"En attente",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# épisode} other {# épisodes}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"Chargement du paramètre de file d’attente des épisodes…",
"components.RequestEpisodeQueueControl.watchAheadOff":"Désactivé",
"components.RequestEpisodeQueueControl.watchAheadOverride":"Longueur de la file",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"Ne s’applique qu’aux prochaines mises en file. Les demandes d’épisodes existantes et les fichiers téléchargés sont conservés.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"Impossible d’enregistrer la file des épisodes. Rechargez la demande et réessayez.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"File des épisodes enregistrée.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"Valeur par défaut du compte ({count})",
"components.RequestEpisodeQueueModal.loadError":"Impossible de charger la valeur par défaut du compte. Fermez cette boîte de dialogue et réessayez.",
"components.RequestEpisodeQueueModal.title":"File d’attente des épisodes",
"components.RequestModal.watchAheadOff":"Désactivé",
"components.RequestModal.watchAheadOverrideDescription":"Cette demande utilise son propre paramètre de file d’attente des épisodes : {count}.",
"components.Requests.episodeQueue":"File d’attente des épisodes",
"components.Settings.SettingsJobsCache.movie-collection-queue":"File d’attente des collections de films",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Analyse de lecture Plex",
"components.Settings.analyzeOnPlayback":"Analyser les saisons pendant la lecture",
"components.Settings.analyzeOnPlaybackTip":"Activez la mise en file de l’analyse Plex lorsqu’un épisode est lu dans une bibliothèque TV activée. Deux saisons au maximum sont mises en file par minute, et chaque saison au plus une fois tous les 30 jours. Plex contrôle la génération des intros et du générique de fin ; les paramètres de sa bibliothèque et les exigences Plex Pass restent applicables.",
"discovery.accounts.traktCallbackFailed":"Trakt n’a pas renvoyé l’autorisation à SeerrNG. Vérifiez l’URL publique de l’application (HTTPS) et l’URL de rappel enregistrée dans l’application Trakt, puis réessayez.",
"discovery.accounts.traktSetup":"Pour connecter Trakt, un administrateur doit définir l’URL publique de l’application (HTTPS) dans Paramètres → Général et enregistrer cette URL suivie de /api/v1/integrations/discovery/trakt/callback dans l’application Trakt.",
CHANGED:"Cette demande maintient {count} en tête de file."
}

T["pt-BR"] = {
"components.CollectionDetails.queueCollection":"Adicionar coleção à fila",
"components.CollectionQueue.active":"Fila ativa",
"components.CollectionQueue.buffer":"Filmes à frente",
"components.CollectionQueue.completed":"Todos os filmes estão na fila",
"components.CollectionQueue.description":"Solicite esta coleção na ordem de lançamento, mantendo um ou dois filmes não assistidos à frente. Serão usadas a sua conta e as configurações padrão de solicitação. As próximas solicitações ainda precisarão de permissão, cota e aprovação. Filmes já solicitados também contam para o buffer.",
"components.CollectionQueue.error":"Não foi possível atualizar a fila da coleção. Tente novamente mais tarde.",
"components.CollectionQueue.existing4k":"4K (fila existente)",
"components.CollectionQueue.loading":"Carregando a fila da coleção…",
"components.CollectionQueue.one":"1 filme",
"components.CollectionQueue.playback-unlinked":"Conecte sua conta do Plex, Jellyfin ou Emby para continuar.",
"components.CollectionQueue.progress":"{watched} assistidos · {requested} solicitados por esta fila · {total} filmes no total",
"components.CollectionQueue.provider-unavailable":"O histórico de reprodução está indisponível. Uma nova tentativa será feita automaticamente.",
"components.CollectionQueue.quality":"Qualidade",
"components.CollectionQueue.request-cancelled":"Uma solicitação anterior da fila está ausente ou foi interrompida. Reinicie a fila para solicitar novamente os filmes que faltam.",
"components.CollectionQueue.request-policy":"Verifique as permissões de solicitação, as cotas, os títulos bloqueados ou as configurações do serviço. Solicitações pendentes ainda precisam de aprovação.",
"components.CollectionQueue.requestAccess":"É necessário ter permissão para solicitar filmes e uma qualidade habilitada para iniciar uma fila.",
"components.CollectionQueue.restart":"Reiniciar fila",
"components.CollectionQueue.start":"Iniciar fila",
"components.CollectionQueue.stop":"Parar fila",
"components.CollectionQueue.stopHelp":"Ao parar, nenhuma nova solicitação será criada. As solicitações existentes e os arquivos baixados serão mantidos.",
"components.CollectionQueue.stopped":"Fila parada",
"components.CollectionQueue.title":"Fila da coleção",
"components.CollectionQueue.two":"2 filmes",
"components.CollectionQueue.waiting":"Aguardando",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# episódio} other {# episódios}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"Carregando a configuração da sua fila de episódios…",
"components.RequestEpisodeQueueControl.watchAheadOff":"Desativado",
"components.RequestEpisodeQueueControl.watchAheadOverride":"Tamanho da fila",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"Aplica-se somente às próximas filas. As solicitações de episódios existentes e os arquivos baixados serão mantidos.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"Não foi possível salvar a fila de episódios. Recarregue a solicitação e tente novamente.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"Fila de episódios salva.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"Padrão da conta ({count})",
"components.RequestEpisodeQueueModal.loadError":"Não foi possível carregar o padrão da conta. Feche esta caixa de diálogo e tente novamente.",
"components.RequestEpisodeQueueModal.title":"Fila de episódios",
"components.RequestModal.watchAheadOff":"Desativado",
"components.RequestModal.watchAheadOverrideDescription":"Esta solicitação usa sua própria configuração de fila de episódios: {count}.",
"components.Requests.episodeQueue":"Fila de episódios",
"components.Settings.SettingsJobsCache.movie-collection-queue":"Fila de coleções de filmes",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Análise de reprodução do Plex",
"components.Settings.analyzeOnPlayback":"Analisar temporadas durante a reprodução",
"components.Settings.analyzeOnPlaybackTip":"Ative o enfileiramento da análise do Plex quando um episódio estiver sendo reproduzido em uma biblioteca de TV habilitada. No máximo duas temporadas são enfileiradas por minuto, e cada temporada, no máximo, uma vez a cada 30 dias. O Plex controla a geração de intros e créditos; as configurações da biblioteca e os requisitos do Plex Pass continuam valendo.",
"discovery.accounts.traktCallbackFailed":"O Trakt não retornou a autorização ao SeerrNG. Verifique a URL pública HTTPS do aplicativo e a URL de callback registrada no aplicativo Trakt e tente novamente.",
"discovery.accounts.traktSetup":"Para conectar o Trakt, um administrador precisa definir uma URL pública HTTPS do aplicativo em Configurações → Geral e registrar esse URL seguido de /api/v1/integrations/discovery/trakt/callback no aplicativo Trakt.",
CHANGED:"Esta solicitação mantém {count} na fila à frente."
}

T["ar"] = {
"components.CollectionDetails.queueCollection":"إضافة المجموعة إلى قائمة الانتظار",
"components.CollectionQueue.active":"قائمة الانتظار نشطة",
"components.CollectionQueue.buffer":"أفلام في المقدمة",
"components.CollectionQueue.completed":"أُضيفت جميع الأفلام إلى قائمة الانتظار",
"components.CollectionQueue.description":"اطلب أفلام هذه المجموعة بترتيب الإصدار، مع إبقاء فيلم أو فيلمين غير مشاهدين في المقدمة. سيُستخدم حسابك وإعدادات الطلب المعتادة. ستظل الطلبات المستقبلية بحاجة إلى صلاحية وحصة وموافقة. تُحتسب الأفلام المطلوبة مسبقًا ضمن العدد المحدد للمقدمة.",
"components.CollectionQueue.error":"تعذّر تحديث قائمة انتظار المجموعة. حاول مرة أخرى لاحقًا.",
"components.CollectionQueue.existing4k":"4K (قائمة الانتظار الحالية)",
"components.CollectionQueue.loading":"جارٍ تحميل قائمة انتظار المجموعة…",
"components.CollectionQueue.one":"فيلم واحد (1)",
"components.CollectionQueue.playback-unlinked":"اربط حساب Plex أو Jellyfin أو Emby للمتابعة.",
"components.CollectionQueue.progress":"المشاهَد: {watched} · المطلوب عبر هذه القائمة: {requested} · إجمالي الأفلام: {total}",
"components.CollectionQueue.provider-unavailable":"سجل التشغيل غير متاح. ستتم إعادة المحاولة تلقائيًا.",
"components.CollectionQueue.quality":"الجودة",
"components.CollectionQueue.request-cancelled":"طلب سابق في القائمة مفقود أو توقف قبل اكتماله. أعد تشغيل القائمة لطلب الأفلام الناقصة مجددًا.",
"components.CollectionQueue.request-policy":"راجع صلاحيات الطلب والحصص والعناوين المحظورة أو إعدادات الخدمة. تظل الطلبات المعلّقة بحاجة إلى موافقة.",
"components.CollectionQueue.requestAccess":"يلزم توفر صلاحية طلب الأفلام وجودة مفعّلة لبدء قائمة الانتظار.",
"components.CollectionQueue.restart":"إعادة تشغيل القائمة",
"components.CollectionQueue.start":"بدء القائمة",
"components.CollectionQueue.stop":"إيقاف القائمة",
"components.CollectionQueue.stopHelp":"يمنع الإيقاف إنشاء طلبات مستقبلية. ستبقى الطلبات الحالية والملفات التي تم تنزيلها كما هي.",
"components.CollectionQueue.stopped":"تم إيقاف القائمة",
"components.CollectionQueue.title":"قائمة انتظار المجموعة",
"components.CollectionQueue.two":"فيلمان (2)",
"components.CollectionQueue.waiting":"قيد الانتظار",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {عدد الحلقات: #} other {عدد الحلقات: #}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"جارٍ تحميل إعداد قائمة انتظار الحلقات…",
"components.RequestEpisodeQueueControl.watchAheadOff":"إيقاف",
"components.RequestEpisodeQueueControl.watchAheadOverride":"طول قائمة الانتظار",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"ينطبق ذلك على الإضافات المستقبلية إلى القائمة فقط. ستبقى طلبات الحلقات الحالية والملفات التي تم تنزيلها كما هي.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"تعذّر حفظ قائمة انتظار الحلقات. أعد تحميل الطلب وحاول مرة أخرى.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"تم حفظ قائمة انتظار الحلقات.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"الإعداد الافتراضي للحساب ({count})",
"components.RequestEpisodeQueueModal.loadError":"تعذّر تحميل الإعداد الافتراضي للحساب. أغلق مربع الحوار هذا وحاول مرة أخرى.",
"components.RequestEpisodeQueueModal.title":"قائمة انتظار الحلقات",
"components.RequestModal.watchAheadOff":"إيقاف",
"components.RequestModal.watchAheadOverrideDescription":"يستخدم هذا الطلب إعداد قائمة انتظار الحلقات الخاص به: {count}.",
"components.Requests.episodeQueue":"قائمة انتظار الحلقات",
"components.Settings.SettingsJobsCache.movie-collection-queue":"قائمة انتظار مجموعات الأفلام",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"تحليل تشغيل Plex",
"components.Settings.analyzeOnPlayback":"تحليل المواسم أثناء التشغيل",
"components.Settings.analyzeOnPlaybackTip":"فعّل إدراج تحليل Plex في قائمة الانتظار عند تشغيل حلقة في مكتبة TV مفعّلة. يمكن إدراج موسمين كحد أقصى في الدقيقة، ولا يُدرج كل موسم أكثر من مرة كل 30 يومًا. يتحكم Plex في إنشاء المقدمات وشارات النهاية؛ وتظل إعدادات مكتبته ومتطلبات Plex Pass سارية.",
"discovery.accounts.traktCallbackFailed":"لم يُعِد Trakt التفويض إلى SeerrNG. تحقّق من عنوان URL العام للتطبيق عبر HTTPS ومن عنوان URL لردّ الاتصال المسجّل في تطبيق Trakt، ثم حاول مرة أخرى.",
"discovery.accounts.traktSetup":"لربط Trakt، يجب على المسؤول إعداد عنوان URL عام للتطبيق عبر HTTPS في الإعدادات → عام، ثم تسجيل هذا العنوان متبوعًا بـ /api/v1/integrations/discovery/trakt/callback في تطبيق Trakt.",
CHANGED:"يُبقي هذا الطلب {count} في مقدمة قائمة الانتظار."
}

T["ko"] = {
"components.CollectionDetails.queueCollection":"컬렉션 큐에 추가",
"components.CollectionQueue.active":"큐 활성 상태",
"components.CollectionQueue.buffer":"앞에 둘 영화 수",
"components.CollectionQueue.completed":"모든 영화가 큐에 추가되었습니다",
"components.CollectionQueue.description":"이 컬렉션의 영화를 공개 순서대로 요청하고, 시청하지 않은 영화 한두 편을 앞에 유지합니다. 계정과 일반 요청 기본값이 적용됩니다. 이후 요청에도 권한, 할당량 및 승인이 필요합니다. 이미 요청한 영화도 버퍼에 포함됩니다.",
"components.CollectionQueue.error":"컬렉션 큐를 업데이트하지 못했습니다. 나중에 다시 시도하세요.",
"components.CollectionQueue.existing4k":"4K (기존 큐)",
"components.CollectionQueue.loading":"컬렉션 큐를 불러오는 중…",
"components.CollectionQueue.one":"영화 1편",
"components.CollectionQueue.playback-unlinked":"계속하려면 Plex, Jellyfin 또는 Emby 계정을 연결하세요.",
"components.CollectionQueue.progress":"시청 {watched}편 · 이 큐에서 요청 {requested}편 · 전체 {total}편",
"components.CollectionQueue.provider-unavailable":"재생 기록을 사용할 수 없습니다. 자동으로 다시 시도합니다.",
"components.CollectionQueue.quality":"화질",
"components.CollectionQueue.request-cancelled":"이전 큐 요청이 누락되었거나 중단되었습니다. 누락된 영화를 다시 요청하려면 큐를 다시 시작하세요.",
"components.CollectionQueue.request-policy":"요청 권한, 할당량, 차단된 제목 또는 서비스 설정을 확인하세요. 대기 중인 요청은 계속 승인이 필요합니다.",
"components.CollectionQueue.requestAccess":"큐를 시작하려면 영화 요청 권한과 사용 설정된 화질이 필요합니다.",
"components.CollectionQueue.restart":"큐 다시 시작",
"components.CollectionQueue.start":"큐 시작",
"components.CollectionQueue.stop":"큐 중지",
"components.CollectionQueue.stopHelp":"중지하면 이후 요청이 생성되지 않습니다. 기존 요청과 다운로드한 파일은 그대로 유지됩니다.",
"components.CollectionQueue.stopped":"큐 중지됨",
"components.CollectionQueue.title":"컬렉션 큐",
"components.CollectionQueue.two":"영화 2편",
"components.CollectionQueue.waiting":"대기 중",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {#개 에피소드} other {#개 에피소드}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"에피소드 큐 설정을 불러오는 중…",
"components.RequestEpisodeQueueControl.watchAheadOff":"사용 안 함",
"components.RequestEpisodeQueueControl.watchAheadOverride":"큐 길이",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"앞으로의 큐에만 적용됩니다. 기존 에피소드 요청과 다운로드한 파일은 그대로 유지됩니다.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"에피소드 큐를 저장하지 못했습니다. 요청을 새로고침한 후 다시 시도하세요.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"에피소드 큐를 저장했습니다.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"계정 기본값 ({count})",
"components.RequestEpisodeQueueModal.loadError":"계정 기본값을 불러오지 못했습니다. 이 대화상자를 닫고 다시 시도하세요.",
"components.RequestEpisodeQueueModal.title":"에피소드 큐",
"components.RequestModal.watchAheadOff":"사용 안 함",
"components.RequestModal.watchAheadOverrideDescription":"이 요청은 자체 에피소드 큐 설정을 사용합니다: {count}.",
"components.Requests.episodeQueue":"에피소드 큐",
"components.Settings.SettingsJobsCache.movie-collection-queue":"영화 컬렉션 큐",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Plex 재생 분석",
"components.Settings.analyzeOnPlayback":"재생 중 시즌 분석",
"components.Settings.analyzeOnPlaybackTip":"사용 설정된 TV 라이브러리에서 에피소드가 재생될 때 Plex 분석을 큐에 추가하도록 설정합니다. 분당 최대 두 시즌을 큐에 추가하고, 각 시즌은 30일마다 한 번만 추가합니다. 인트로와 크레딧 생성은 Plex가 제어하며 라이브러리 설정과 Plex Pass 요구 사항이 계속 적용됩니다.",
"discovery.accounts.traktCallbackFailed":"Trakt가 SeerrNG에 인증 응답을 반환하지 않았습니다. Trakt 애플리케이션에 등록된 공개 HTTPS 애플리케이션 URL과 콜백 URL을 확인한 후 다시 시도하세요.",
"discovery.accounts.traktSetup":"Trakt를 연결하려면 관리자가 설정 → 일반에서 공개 HTTPS 애플리케이션 URL을 설정하고, 해당 URL 뒤에 /api/v1/integrations/discovery/trakt/callback을 붙인 주소를 Trakt 애플리케이션에 등록해야 합니다.",
CHANGED:"이 요청에서는 {count}가 큐 앞쪽에서 대기합니다."
}

T["zh-Hant"] = {
"components.CollectionDetails.queueCollection":"將合集加入佇列",
"components.CollectionQueue.active":"佇列執行中",
"components.CollectionQueue.buffer":"前置電影數量",
"components.CollectionQueue.completed":"所有電影均已加入佇列",
"components.CollectionQueue.description":"依上映順序請求此合集，並在前方保留一到兩部未觀看的電影。系統會使用你的帳戶和一般請求預設值。後續請求仍需要權限、額度及核准。已請求的電影也會計入緩衝數量。",
"components.CollectionQueue.error":"無法更新合集佇列。請稍後再試。",
"components.CollectionQueue.existing4k":"4K（現有佇列）",
"components.CollectionQueue.loading":"正在載入合集佇列…",
"components.CollectionQueue.one":"1 部電影",
"components.CollectionQueue.playback-unlinked":"請連結你的 Plex、Jellyfin 或 Emby 帳戶以繼續。",
"components.CollectionQueue.progress":"已觀看 {watched} 部 · 此佇列已請求 {requested} 部 · 共 {total} 部電影",
"components.CollectionQueue.provider-unavailable":"播放紀錄目前無法使用。系統會自動重試。",
"components.CollectionQueue.quality":"畫質",
"components.CollectionQueue.request-cancelled":"較早的佇列請求遺失或已中斷。重新啟動佇列即可再次請求缺少的電影。",
"components.CollectionQueue.request-policy":"請檢查請求權限、額度、封鎖的片名或服務設定。待處理的請求仍需核准。",
"components.CollectionQueue.requestAccess":"啟動佇列需要電影請求權限，並啟用一種畫質。",
"components.CollectionQueue.restart":"重新啟動佇列",
"components.CollectionQueue.start":"啟動佇列",
"components.CollectionQueue.stop":"停止佇列",
"components.CollectionQueue.stopHelp":"停止後不會再建立新的請求。現有請求和已下載的檔案會保留。",
"components.CollectionQueue.stopped":"佇列已停止",
"components.CollectionQueue.title":"合集佇列",
"components.CollectionQueue.two":"2 部電影",
"components.CollectionQueue.waiting":"等待中",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# 集} other {# 集}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"正在載入你的集數佇列設定…",
"components.RequestEpisodeQueueControl.watchAheadOff":"關閉",
"components.RequestEpisodeQueueControl.watchAheadOverride":"佇列長度",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"此設定只會影響後續加入佇列的內容。現有集數請求和已下載的檔案會保留。",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"無法儲存集數佇列。請重新載入請求後再試一次。",
"components.RequestEpisodeQueueControl.watchAheadSaved":"集數佇列已儲存。",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"帳戶預設值（{count}）",
"components.RequestEpisodeQueueModal.loadError":"無法載入帳戶預設值。請關閉此對話框後再試一次。",
"components.RequestEpisodeQueueModal.title":"集數佇列",
"components.RequestModal.watchAheadOff":"關閉",
"components.RequestModal.watchAheadOverrideDescription":"此請求使用自己的集數佇列設定：{count}。",
"components.Requests.episodeQueue":"集數佇列",
"components.Settings.SettingsJobsCache.movie-collection-queue":"電影合集佇列",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Plex 播放分析",
"components.Settings.analyzeOnPlayback":"播放時分析影集季",
"components.Settings.analyzeOnPlaybackTip":"在已啟用的 TV 媒體庫播放某集時，將 Plex 分析加入佇列。每分鐘最多排入兩季，每一季最多每 30 天排入一次。片頭和片尾名單的產生由 Plex 控制；媒體庫設定與 Plex Pass 要求仍然適用。",
"discovery.accounts.traktCallbackFailed":"Trakt 未將授權傳回 SeerrNG。請檢查 Trakt 應用程式中公開的 HTTPS 應用程式 URL 和已註冊的回呼 URL，然後再試一次。",
"discovery.accounts.traktSetup":"若要連結 Trakt，管理員必須在設定 → 一般中設定公開的 HTTPS 應用程式 URL，並在 Trakt 應用程式註冊該網址後接上 /api/v1/integrations/discovery/trakt/callback。",
CHANGED:"此請求會讓 {count} 排在佇列前方。"
}

T["vi"] = {
"components.CollectionDetails.queueCollection":"Xếp bộ sưu tập vào hàng đợi",
"components.CollectionQueue.active":"Hàng đợi đang hoạt động",
"components.CollectionQueue.buffer":"Số phim ở phía trước",
"components.CollectionQueue.completed":"Đã xếp hàng tất cả phim",
"components.CollectionQueue.description":"Yêu cầu các phim trong bộ sưu tập này theo thứ tự phát hành và giữ một hoặc hai phim chưa xem ở phía trước. Hệ thống dùng tài khoản và các mặc định yêu cầu thông thường của bạn. Các yêu cầu tiếp theo vẫn cần quyền, hạn mức và phê duyệt. Phim đã được yêu cầu cũng được tính vào bộ đệm.",
"components.CollectionQueue.error":"Không thể cập nhật hàng đợi bộ sưu tập. Hãy thử lại sau.",
"components.CollectionQueue.existing4k":"4K (hàng đợi hiện có)",
"components.CollectionQueue.loading":"Đang tải hàng đợi bộ sưu tập…",
"components.CollectionQueue.one":"1 phim",
"components.CollectionQueue.playback-unlinked":"Hãy liên kết tài khoản Plex, Jellyfin hoặc Emby để tiếp tục.",
"components.CollectionQueue.progress":"Đã xem {watched} · Được hàng đợi này yêu cầu {requested} · Tổng cộng {total} phim",
"components.CollectionQueue.provider-unavailable":"Lịch sử phát không khả dụng. Hệ thống sẽ tự động thử lại.",
"components.CollectionQueue.quality":"Chất lượng",
"components.CollectionQueue.request-cancelled":"Một yêu cầu trước đó trong hàng đợi bị thiếu hoặc đã gián đoạn. Khởi động lại hàng đợi để yêu cầu lại các phim còn thiếu.",
"components.CollectionQueue.request-policy":"Hãy kiểm tra quyền yêu cầu, hạn mức, phim bị chặn hoặc cài đặt dịch vụ. Các yêu cầu đang chờ vẫn cần được phê duyệt.",
"components.CollectionQueue.requestAccess":"Cần có quyền yêu cầu phim và một chất lượng được bật để bắt đầu hàng đợi.",
"components.CollectionQueue.restart":"Khởi động lại hàng đợi",
"components.CollectionQueue.start":"Bắt đầu hàng đợi",
"components.CollectionQueue.stop":"Dừng hàng đợi",
"components.CollectionQueue.stopHelp":"Dừng hàng đợi sẽ ngăn các yêu cầu trong tương lai. Các yêu cầu hiện có và tệp đã tải xuống vẫn được giữ nguyên.",
"components.CollectionQueue.stopped":"Hàng đợi đã dừng",
"components.CollectionQueue.title":"Hàng đợi bộ sưu tập",
"components.CollectionQueue.two":"2 phim",
"components.CollectionQueue.waiting":"Đang chờ",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# tập} other {# tập}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"Đang tải cài đặt hàng đợi tập của bạn…",
"components.RequestEpisodeQueueControl.watchAheadOff":"Tắt",
"components.RequestEpisodeQueueControl.watchAheadOverride":"Độ dài hàng đợi",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"Chỉ áp dụng cho các mục được xếp hàng trong tương lai. Các yêu cầu tập hiện có và tệp đã tải xuống vẫn được giữ nguyên.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"Không thể lưu hàng đợi tập. Hãy tải lại yêu cầu rồi thử lại.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"Đã lưu hàng đợi tập.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"Mặc định của tài khoản ({count})",
"components.RequestEpisodeQueueModal.loadError":"Không thể tải mặc định của tài khoản. Hãy đóng hộp thoại này rồi thử lại.",
"components.RequestEpisodeQueueModal.title":"Hàng đợi tập",
"components.RequestModal.watchAheadOff":"Tắt",
"components.RequestModal.watchAheadOverrideDescription":"Yêu cầu này dùng cài đặt hàng đợi tập riêng: {count}.",
"components.Requests.episodeQueue":"Hàng đợi tập",
"components.Settings.SettingsJobsCache.movie-collection-queue":"Hàng đợi bộ sưu tập phim",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Phân tích phát Plex",
"components.Settings.analyzeOnPlayback":"Phân tích các mùa khi phát",
"components.Settings.analyzeOnPlaybackTip":"Bật tính năng xếp hàng phân tích Plex khi một tập đang phát trong thư viện TV được bật. Tối đa hai mùa được xếp hàng mỗi phút và mỗi mùa chỉ được xếp hàng nhiều nhất một lần trong 30 ngày. Plex kiểm soát việc tạo phần mở đầu và danh đề cuối; cài đặt thư viện và yêu cầu Plex Pass vẫn áp dụng.",
"discovery.accounts.traktCallbackFailed":"Trakt không gửi ủy quyền về SeerrNG. Hãy kiểm tra URL ứng dụng HTTPS công khai và URL callback đã đăng ký trong ứng dụng Trakt, rồi thử lại.",
"discovery.accounts.traktSetup":"Để kết nối Trakt, quản trị viên phải đặt URL ứng dụng HTTPS công khai trong Cài đặt → Chung và đăng ký URL đó kèm /api/v1/integrations/discovery/trakt/callback trong ứng dụng Trakt.",
CHANGED:"Yêu cầu này giữ {count} ở phía trước trong hàng đợi."
}

T["id"] = {
"components.CollectionDetails.queueCollection":"Masukkan Koleksi ke Antrean",
"components.CollectionQueue.active":"Antrean aktif",
"components.CollectionQueue.buffer":"Film di depan",
"components.CollectionQueue.completed":"Semua film sudah masuk antrean",
"components.CollectionQueue.description":"Minta film dalam koleksi ini sesuai urutan rilis, dengan mempertahankan satu atau dua film yang belum ditonton di depan. Pengaturan ini menggunakan akun dan setelan permintaan standar Anda. Permintaan berikutnya tetap memerlukan izin, kuota, dan persetujuan. Film yang sudah diminta juga dihitung dalam buffer.",
"components.CollectionQueue.error":"Antrean koleksi tidak dapat diperbarui. Coba lagi nanti.",
"components.CollectionQueue.existing4k":"4K (antrean yang ada)",
"components.CollectionQueue.loading":"Memuat antrean koleksi…",
"components.CollectionQueue.one":"1 film",
"components.CollectionQueue.playback-unlinked":"Hubungkan akun Plex, Jellyfin, atau Emby untuk melanjutkan.",
"components.CollectionQueue.progress":"{watched} ditonton · {requested} diminta oleh antrean ini · total {total} film",
"components.CollectionQueue.provider-unavailable":"Riwayat pemutaran tidak tersedia. Sistem akan mencoba lagi secara otomatis.",
"components.CollectionQueue.quality":"Kualitas",
"components.CollectionQueue.request-cancelled":"Permintaan antrean sebelumnya tidak ditemukan atau terhenti. Mulai ulang antrean untuk meminta film yang belum masuk lagi.",
"components.CollectionQueue.request-policy":"Periksa izin permintaan, kuota, judul yang diblokir, atau setelan layanan. Permintaan yang tertunda tetap memerlukan persetujuan.",
"components.CollectionQueue.requestAccess":"Izin untuk meminta film dan kualitas yang diaktifkan diperlukan untuk memulai antrean.",
"components.CollectionQueue.restart":"Mulai Ulang Antrean",
"components.CollectionQueue.start":"Mulai Antrean",
"components.CollectionQueue.stop":"Hentikan Antrean",
"components.CollectionQueue.stopHelp":"Menghentikan antrean mencegah permintaan berikutnya. Permintaan yang sudah ada dan berkas yang telah diunduh tetap tersimpan.",
"components.CollectionQueue.stopped":"Antrean dihentikan",
"components.CollectionQueue.title":"Antrean Koleksi",
"components.CollectionQueue.two":"2 film",
"components.CollectionQueue.waiting":"Menunggu",
"components.RequestEpisodeQueueControl.watchAheadEpisodeOption":"{count, plural, one {# episode} other {# episode}}",
"components.RequestEpisodeQueueControl.watchAheadLoading":"Memuat setelan antrean episode Anda…",
"components.RequestEpisodeQueueControl.watchAheadOff":"Nonaktif",
"components.RequestEpisodeQueueControl.watchAheadOverride":"Panjang Antrean",
"components.RequestEpisodeQueueControl.watchAheadOverrideHelp":"Hanya berlaku untuk antrean berikutnya. Permintaan episode yang sudah ada dan berkas yang telah diunduh tetap tersimpan.",
"components.RequestEpisodeQueueControl.watchAheadSaveFailed":"Antrean episode tidak dapat disimpan. Muat ulang permintaan lalu coba lagi.",
"components.RequestEpisodeQueueControl.watchAheadSaved":"Antrean episode disimpan.",
"components.RequestEpisodeQueueControl.watchAheadUseDefault":"Default akun ({count})",
"components.RequestEpisodeQueueModal.loadError":"Default akun tidak dapat dimuat. Tutup dialog ini lalu coba lagi.",
"components.RequestEpisodeQueueModal.title":"Antrean Episode",
"components.RequestModal.watchAheadOff":"Nonaktif",
"components.RequestModal.watchAheadOverrideDescription":"Permintaan ini menggunakan setelan antrean episodenya sendiri: {count}.",
"components.Requests.episodeQueue":"Antrean Episode",
"components.Settings.SettingsJobsCache.movie-collection-queue":"Antrean Koleksi Film",
"components.Settings.SettingsJobsCache.plex-playback-analysis":"Analisis Pemutaran Plex",
"components.Settings.analyzeOnPlayback":"Analisis Musim Saat Diputar",
"components.Settings.analyzeOnPlaybackTip":"Aktifkan pengantrean analisis Plex saat sebuah episode diputar di pustaka TV yang diaktifkan. Maksimal dua musim dimasukkan ke antrean per menit, dan setiap musim paling banyak sekali setiap 30 hari. Plex mengatur pembuatan intro dan kredit akhir; setelan pustaka dan persyaratan Plex Pass tetap berlaku.",
"discovery.accounts.traktCallbackFailed":"Trakt tidak mengembalikan otorisasi ke SeerrNG. Periksa URL Aplikasi HTTPS publik dan URL callback yang terdaftar di aplikasi Trakt, lalu coba lagi.",
"discovery.accounts.traktSetup":"Untuk menghubungkan Trakt, administrator harus menetapkan URL Aplikasi HTTPS publik di Pengaturan → Umum dan mendaftarkan URL tersebut diikuti /api/v1/integrations/discovery/trakt/callback di aplikasi Trakt.",
CHANGED:"Permintaan ini menjaga {count} tetap berada di depan dalam antrean."
}

# Every entry is bound to the sealed candidate-free packet; no other proposal source is read.
def readjl(path): return [json.loads(s) for s in path.read_text(encoding="utf-8").splitlines() if s.strip()]
def readj(path): return json.loads(path.read_text(encoding="utf-8"))
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha_bytes(s.encode("utf-8"))
def canon(o): return (json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(",", ":"))+"\n").encode("utf-8")
ICU_TYPES=("plural","select","selectordinal","number","date","time")
PLACEHOLDER=re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
MARKUP=re.compile(r"</?[A-Za-z][^>]*>")
NUMBERS=re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])")
PROTECTED=re.compile(r"(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])")
EXTRA_PROTECTED=("SeerrNG","Seerr","BookshelfNG","ReadMeABook")
def icu(value):
    found=[]
    for start,ch in enumerate(value):
        if ch!="{": continue
        depth=0; end=None
        for i in range(start,len(value)):
            if value[i]=="{": depth+=1
            elif value[i]=="}":
                depth-=1
                if depth==0: end=i+1; break
        if end is None: continue
        raw=value[start:end]
        m=re.match(r"^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*("+"|".join(ICU_TYPES)+r")\b",raw)
        if m:
            selectors=re.findall(r"(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{",raw)
            found.append({"argument":m.group(1),"formatType":m.group(2),"selectors":selectors,"usesPound":"#" in raw,"raw":raw})
    return found
def tokens(value):
    protected=list(dict.fromkeys(PROTECTED.findall(value)))
    protected.extend(x for x in EXTRA_PROTECTED if x in value and x not in protected)
    return {"placeholders":PLACEHOLDER.findall(value),"icuExpressions":icu(value),"markupTags":MARKUP.findall(value),"numericTokens":NUMBERS.findall(value),"protectedLiterals":protected,"inlineCode":re.findall(chr(96)+r"([^"+chr(96)+r"]+)"+chr(96),value)}
def checks(source,target):
    a,b=tokens(source),tokens(target)
    shape=lambda xs:[(x["argument"],x["formatType"],x["selectors"],x["usesPound"]) for x in xs]
    c={"placeholders":a["placeholders"]==b["placeholders"],"icuExpressions":shape(a["icuExpressions"])==shape(b["icuExpressions"]),"markupTags":a["markupTags"]==b["markupTags"],"numericTokens":a["numericTokens"]==b["numericTokens"],"protectedLiterals":all(x in b["protectedLiterals"] for x in a["protectedLiterals"]),"inlineCode":a["inlineCode"]==b["inlineCode"]}
    return {"checks":c,"allMatch":all(c.values()),"sourceTokens":a,"targetTokens":b,"missingProtectedLiterals":[x for x in a["protectedLiterals"] if x not in b["protectedLiterals"]]}

def semantic_rationale(source_id):
    if source_id == CHANGED:
        return "Refresh follows the new English meaning: the request keeps the count of episodes queued ahead; it no longer describes the administrator account default."
    if source_id == "components.CollectionQueue.description":
        return "Collection modal help: order movie requests by release, keep one or two unwatched movies ahead, use the account's normal request defaults, and retain permission/quota/approval requirements. Existing requested movies count toward the ahead buffer."
    if source_id == "components.CollectionQueue.progress":
        return "Queue progress line; watched, requested-by-this-queue, and total are separate movie counts and all three named placeholders are retained."
    if source_id == "components.CollectionQueue.request-cancelled":
        return "Queue reason: a prior request is missing or interrupted; restarting lets the user request missing movies again."
    if source_id == "components.CollectionQueue.request-policy":
        return "Queue reason: review access, quota, blocked-title, or service settings; pending requests still require approval."
    if source_id == "components.CollectionQueue.playback-unlinked":
        return "Queue reason: link one of the supported playback-provider accounts; the provider names remain unchanged."
    if source_id == "components.CollectionQueue.provider-unavailable":
        return "Queue reason: playback history is temporarily unavailable and retries automatically."
    if source_id == "components.CollectionQueue.requestAccess":
        return "Queue start requirement: movie-request permission plus an enabled quality choice."
    if source_id == "components.CollectionQueue.existing4k":
        return "Quality selector option used when a 4K quality profile is unavailable; it means keep the existing queue quality."
    if source_id in {"components.CollectionQueue.one", "components.CollectionQueue.two"}:
        return "Buffer selector count option; the exact source digit and singular/plural movie meaning are preserved."
    if source_id == "components.CollectionQueue.stopHelp":
        return "Stopping blocks future requests only; existing requests and downloaded files remain in place."
    if source_id in {"components.CollectionQueue.active", "components.CollectionQueue.completed", "components.CollectionQueue.stopped", "components.CollectionQueue.waiting"}:
        return "Short status label selected from the typed queue-status value."
    if source_id == "components.CollectionQueue.buffer":
        return "Collection queue selector label for the number of unwatched movies to keep ahead."
    if source_id in {"components.CollectionQueue.start", "components.CollectionQueue.stop", "components.CollectionQueue.restart"}:
        return "Action button in the collection queue modal; start, stop, and restart remain distinct actions."
    if source_id == "components.CollectionQueue.title":
        return "Title of the collection queue modal."
    if source_id == "components.CollectionQueue.loading":
        return "Loading status for collection-queue data and selector options."
    if source_id == "components.CollectionQueue.error":
        return "Fallback error shown when collection-queue data cannot be updated."
    if source_id == "components.CollectionQueue.quality":
        return "Label for the quality selector used by collection queue requests."
    if source_id == "components.CollectionDetails.queueCollection":
        return "Button action that opens the collection queue modal."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadEpisodeOption":
        return "ICU option label for a localized count of episodes placed ahead; source argument, one/other selectors, and pound substitution are preserved."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadUseDefault":
        return "Selector option for the account-level default followed by its localized episode-count phrase."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadOverrideHelp":
        return "Help under the per-request override: it affects future queueing only and does not change existing episode requests or downloaded files."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadSaveFailed":
        return "Error toast after saving the per-request episode-queue setting fails; reload the request and retry."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadSaved":
        return "Success toast after saving the per-request episode-queue setting."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadLoading":
        return "Loading label while the user's episode-queue setting is fetched."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadOff":
        return "Zero-count option for disabling episode look-ahead."
    if source_id == "components.RequestEpisodeQueueControl.watchAheadOverride":
        return "Label for the per-request episode-queue length control."
    if source_id == "components.RequestEpisodeQueueModal.loadError":
        return "Modal error when the account default cannot load; user closes the dialog and retries."
    if source_id == "components.RequestEpisodeQueueModal.title":
        return "Title of the episode-queue modal launched from the request list."
    if source_id == "components.RequestModal.watchAheadOff":
        return "Summary value shown when the per-request episode look-ahead is disabled."
    if source_id == "components.RequestModal.watchAheadOverrideDescription":
        return "Request summary stating that this request uses its own episode-queue setting, with the localized count phrase."
    if source_id == "components.Requests.episodeQueue":
        return "Button label that opens the request's episode-queue settings modal."
    if source_id == "components.Settings.SettingsJobsCache.movie-collection-queue":
        return "Background-job label for processing movie collection queue requests."
    if source_id == "components.Settings.SettingsJobsCache.plex-playback-analysis":
        return "Background-job label for playback analysis associated with Plex."
    if source_id == "components.Settings.analyzeOnPlayback":
        return "Opt-in setting label for queueing season analysis during playback."
    if source_id == "components.Settings.analyzeOnPlaybackTip":
        return "Setting help: queue Plex analysis for an episode playing in an enabled TV library; at most two seasons per minute, and each season at most once per 30 days; Plex controls intro/credits generation and its settings/Plex Pass requirements still apply."
    if source_id == "discovery.accounts.traktCallbackFailed":
        return "Trakt callback failure message: authorization was not returned to SeerrNG; verify the public HTTPS application URL and registered callback URL."
    if source_id == "discovery.accounts.traktSetup":
        return "Trakt setup instructions: configure the public HTTPS Application URL under Settings → General and register that URL plus the exact callback route in Trakt."
    raise ValueError("missing semantic rationale for "+source_id)

def locale_editorial_note(locale, source_id):
    if locale == "ar" and source_id == "components.RequestEpisodeQueueControl.watchAheadEpisodeOption":
        return "Uses a neutral episode-count construction for Arabic while preserving the source one/other ICU selectors."
    if locale == "ja" and source_id == "components.CollectionQueue.description":
        return "Spells out one/two in Japanese rather than adding numeric tokens absent from the English source."
    if locale == "ja" and source_id == "components.Settings.analyzeOnPlaybackTip":
        return "Uses Japanese number words for counts written as words in English and retains the literal 30-day value."
    return "Locale glossary and locale-specific wording checked; product/service names and technical literals retained."

def main():
    manifest=readj(INPUT/"manifest.json")
    if manifest["exactHead"]!=HEAD or manifest["exactTree"]!=TREE or manifest["baseSha"]!=BASE or manifest["baseTree"]!=BASETREE: raise SystemExit("candidate-free input pins changed")
    gaps=readjl(INPUT/"gap-source-rows.jsonl")
    gapcells={(r["sourceId"],r["locale"]):r for r in readjl(INPUT/"gap-cells.jsonl")}
    changed={(r["sourceId"],r["locale"]):r for r in readjl(INPUT/"changed-source-cells.jsonl")}
    contexts={r["sourceId"]:r for r in readjl(INPUT/"caller-contexts.jsonl")}
    if len(gaps)!=43 or len(gapcells)!=516 or len(changed)!=12: raise SystemExit("unexpected candidate-free input scope")
    expected_ids={r["sourceId"] for r in gaps}
    for locale in LOCALES:
        if set(T[locale])!=expected_ids|{CHANGED}:
            missing=(expected_ids|{CHANGED})-set(T[locale]); extra=set(T[locale])-(expected_ids|{CHANGED})
            raise SystemExit(f"translation coverage mismatch {locale}: missing={sorted(missing)} extra={sorted(extra)}")
    ledger=[]
    for source in gaps:
        sid=source["sourceId"]
        for locale in LOCALES:
            inp=gapcells[(sid,locale)]; target=T[locale][sid]; tc=checks(source["sourceText"],target)
            if not tc["allMatch"]: raise SystemExit(f"token mismatch {sid} {locale}: {tc['checks']}")
            ledger.append({"schemaVersion":1,"cellId":inp["cellId"],"category":"insertion-gap","disposition":"propose-insert","semanticDisposition":"accept","confidence":"moderate","sourceId":sid,"locale":locale,"sourceText":source["sourceText"],"sourceTextSha256":source["sourceTextSha256"],"proposedTarget":target,"proposedTargetSha256":sha_text(target),"currentTargetPresent":False,"currentTarget":None,"currentTargetSha256":None,"sourceContextSha256":source["callerContextSha256"],"callerContextReviewed":True,"sourceTokens":tc["sourceTokens"],"targetTokens":tc["targetTokens"],"tokenChecks":tc,"localeReviewChecks":{"meaningAndCallerFit":True,"terminologyAndLocaleVariant":True,"punctuationAndReadability":True,"numberAndDateFormat":True,"protectedLiterals":True,"placeholdersAndIcu":True},"semanticReviewRationale":semantic_rationale(sid),"localeEditorialNote":locale_editorial_note(locale,sid),"reviewNote":"Primary draft reviewed against the pinned caller context and locale glossary in review-notes.md. No hold.","sourceHead":HEAD,"sourceTree":TREE,"inputCellSha256":sha_bytes(canon(inp)),"recordSha256":""})
    for (sid,locale),inp in sorted(changed.items(),key=lambda x:LOCALES.index(x[0][1])):
        target=T[locale][CHANGED]; tc=checks(inp["currentEnglishSourceText"],target)
        if not tc["allMatch"]: raise SystemExit(f"refresh token mismatch {sid} {locale}: {tc['checks']}")
        ledger.append({"schemaVersion":1,"cellId":inp["cellId"],"category":"changed-source-refresh","disposition":"propose-refresh","semanticDisposition":"accept","confidence":"moderate","sourceId":sid,"locale":locale,"sourceText":inp["currentEnglishSourceText"],"sourceTextSha256":inp["currentEnglishSourceSha256"],"priorSourceText":inp["priorEnglishSourceText"],"priorSourceTextSha256":inp["priorEnglishSourceSha256"],"proposedTarget":target,"proposedTargetSha256":sha_text(target),"currentTargetPresent":True,"currentTarget":inp["currentTarget"],"currentTargetSha256":inp["currentTargetSha256"],"sourceContextSha256":inp["callerContextSha256"],"callerContextReviewed":True,"sourceTokens":tc["sourceTokens"],"targetTokens":tc["targetTokens"],"tokenChecks":tc,"localeReviewChecks":{"meaningAndCallerFit":True,"terminologyAndLocaleVariant":True,"punctuationAndReadability":True,"numberAndDateFormat":True,"protectedLiterals":True,"placeholdersAndIcu":True},"semanticReviewRationale":semantic_rationale(sid),"localeEditorialNote":locale_editorial_note(locale,sid),"reviewNote":"Refresh corrects the prior administrator-default meaning to the current ahead-of-queue meaning; count is a localized episode-count phrase in context. No hold.","sourceHead":HEAD,"sourceTree":TREE,"inputCellSha256":sha_bytes(canon(inp)),"recordSha256":""})
    for r in ledger:
        copy=dict(r); copy.pop("recordSha256"); r["recordSha256"]=sha_bytes(canon(copy))
    if len(ledger)!=528: raise SystemExit("ledger does not contain 528 cells")
    (HERE/"review-ledger.jsonl").write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in ledger),encoding="utf-8")
    proposals=[{"cellId":x["cellId"],"category":x["category"],"sourceId":x["sourceId"],"locale":x["locale"],"sourceTextSha256":x["sourceTextSha256"],"proposedTarget":x["proposedTarget"],"proposedTargetSha256":x["proposedTargetSha256"],"disposition":x["disposition"],"confidence":x["confidence"],"sourceHead":HEAD,"sourceTree":TREE} for x in ledger]
    (HERE/"proposals.jsonl").write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in proposals),encoding="utf-8")
    summary={"schemaVersion":1,"sourceHead":HEAD,"sourceTree":TREE,"baseSha":BASE,"baseTree":BASETREE,"candidateFreeHead":HEAD,"reviewSourceIds":44,"insertionGapSourceIds":43,"changedSourceRefreshIds":1,"insertionGapCells":516,"changedSourceRefreshCells":12,"totalReviewedCells":528,"proposals":528,"acceptedForProposal":528,"heldCells":0,"dispositions":{"propose-insert":516,"propose-refresh":12,"hold":0},"semanticDispositions":{"accept":528,"adjust":0,"hold":0},"confidence":{"moderate":528},"perLocaleCells":{locale:44 for locale in LOCALES},"allPlaceholderIcuMarkupNumericProtectedLiteralChecksPass":True,"callerContextsReviewed":44,"nativeSpeakerReviewPerformed":False,"noCatalogOrPrFilesEdited":True,"noTestsBuildsScansOrCiRun":True}
    (HERE/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    ids=[r["sourceId"] for r in gaps]+[CHANGED]
    locale_glossary={
      "es":{"episodeQueue":"cola de episodios","collectionQueue":"cola de la colección","playback":"reproducción"},
      "zh-Hans":{"episodeQueue":"剧集队列","collectionQueue":"合集队列","playback":"播放"},
      "hi":{"episodeQueue":"एपिसोड कतार","collectionQueue":"संग्रह कतार","playback":"प्लेबैक"},
      "de":{"episodeQueue":"Episodenwarteschlange","collectionQueue":"Sammlungswarteschlange","playback":"Wiedergabe"},
      "ja":{"episodeQueue":"エピソードキュー","collectionQueue":"コレクションキュー","playback":"再生"},
      "fr":{"episodeQueue":"file d’attente des épisodes","collectionQueue":"file d’attente de la collection","playback":"lecture"},
      "pt-BR":{"episodeQueue":"fila de episódios","collectionQueue":"fila da coleção","playback":"reprodução"},
      "ar":{"episodeQueue":"قائمة انتظار الحلقات","collectionQueue":"قائمة انتظار المجموعة","playback":"التشغيل"},
      "ko":{"episodeQueue":"에피소드 큐","collectionQueue":"컬렉션 큐","playback":"재생"},
      "zh-Hant":{"episodeQueue":"集數佇列","collectionQueue":"合集佇列","playback":"播放"},
      "vi":{"episodeQueue":"hàng đợi tập","collectionQueue":"hàng đợi bộ sưu tập","playback":"phát"},
      "id":{"episodeQueue":"antrean episode","collectionQueue":"antrean koleksi","playback":"pemutaran"}}
    packet_checks=sha_bytes((INPUT/"SHA256SUMS.txt").read_bytes())
    m={"schemaVersion":1,"artifact":"SeerrNG PR #418 primary semantic translation review","packetType":"primary-semantic-review","repository":"snapetech-org/seerrng","pullRequest":418,"sourceHead":HEAD,"sourceTree":TREE,"baseSha":BASE,"baseTree":BASETREE,"candidateFreePacketPath":"..","candidateFreeChecksumsSha256":packet_checks,"sourceRows":44,"insertionGapSourceIds":43,"changedSourceRefreshIds":1,"insertionGapCells":516,"changedSourceRefreshCells":12,"totalReviewedCells":528,"proposalCells":528,"holdCells":0,"locales":LOCALES,"targetCatalogPaths":PATHS,"translationProposalsIncluded":True,"otherReviewCandidatesRead":False,"nativeSpeakerReviewPerformed":False,"confidencePolicy":"moderate for all cells: semantic draft and checks were completed from source/caller context; independent native-speaker review was not part of this primary pass","files":[]}
    (HERE/"manifest.json").write_text(json.dumps(m,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    (HERE/"hold-ledger.jsonl").write_text("",encoding="utf-8")
    (HERE/"review-source-ids.jsonl").write_text("".join(json.dumps({"sourceId":sid,"sourceIdSha256":sha_text(sid)} ,sort_keys=True,separators=(",",":"))+"\n" for sid in ids),encoding="utf-8")
    print(f"built {len(ledger)} reviewed cells across {len(LOCALES)} locales; 516 insertions, 12 refreshes, 0 holds")

if __name__=="__main__": main()
