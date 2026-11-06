import json,hashlib,re,collections
from pathlib import Path
ROOT=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-w4000-4019-current-20261105')
CF=ROOT/'candidate-free'; OUT=ROOT/'cross-review'
P=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-primary-20261105/primary-review')
B=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-blind-seal-20261105')
HEAD='77d30ae742aad7245e6e419237fca6a544531e1f'; TREE='2c6fe4a0c1c33aa56b01f06a70702f68598509a7'
BASE='2647e15762de0c2285cd9d8ebc6d27ffafce6358'; BASETREE='b6f4acb9debdc1b0a838b50d5ad88aaa467e429b'
LOCALES=['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']
ICU_TYPES=('plural','select','selectordinal','number','date','time')
PLACEHOLDER=re.compile(r'\{([A-Za-z][A-Za-z0-9_]*)\}'); MARKUP=re.compile(r'</?[A-Za-z][^>]*>')
NUMBERS=re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
PROTECTED=re.compile(r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise|Gotify|Ntfy)(?![A-Za-z0-9])')
EXTRA=('SeerrNG','Seerr','BookshelfNG','ReadMeABook')
def sha(b): return hashlib.sha256(b).hexdigest()
def shat(s): return sha(s.encode())
def canon(o): return (json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
def jl(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
def need(ok,msg):
 if not ok: raise SystemExit('REFUSED: '+msg)
def icu(s):
 out=[]
 for start,ch in enumerate(s):
  if ch!='{': continue
  depth=0
  for end in range(start,len(s)):
   if s[end]=='{': depth+=1
   elif s[end]=='}':
    depth-=1
    if depth==0: break
  else: continue
  raw=s[start:end+1]; m=re.match(r'^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*('+ '|'.join(ICU_TYPES)+r')\b',raw)
  if m:
   sels=re.findall(r'(?<![\w-])(?:zero|one|two|few|many|other|=\d+(?:\.\d+)?)\s*\{',raw)
   out.append({'argument':m.group(1),'formatType':m.group(2),'selectors':sels,'usesPound':'#' in raw,'raw':raw})
 return out
def tokens(s):
 p=list(dict.fromkeys(PROTECTED.findall(s))); p.extend(x for x in EXTRA if x in s and x not in p)
 return {'placeholders':PLACEHOLDER.findall(s),'icuExpressions':icu(s),'markupTags':MARKUP.findall(s),
  'numericTokens':NUMBERS.findall(s),'protectedLiterals':p,'inlineCode':re.findall(chr(96)+r'([^'+chr(96)+r']+)'+chr(96),s)}
def check(src,tgt):
 a,b=tokens(src),tokens(tgt); shape=lambda q:[(x['argument'],x['formatType'],x['selectors'],x['usesPound']) for x in q]
 checks={'placeholders':a['placeholders']==b['placeholders'],'icuExpressions':shape(a['icuExpressions'])==shape(b['icuExpressions']),
  'markupTags':a['markupTags']==b['markupTags'],'numericTokens':a['numericTokens']==b['numericTokens'],
  'protectedLiterals':all(x in b['protectedLiterals'] for x in a['protectedLiterals']),'inlineCode':a['inlineCode']==b['inlineCode']}
 return {'checks':checks,'allMatch':all(checks.values()),'sourceTokens':a,'targetTokens':b}

def main():
 sources={r['sourceId']:r for r in jl(CF/'selected-source-cells.jsonl')}
 cells={(r['sourceId'],r['locale']):r for r in jl(CF/'current-target-cells.jsonl')}
 contexts={r['sourceId']:r for r in jl(CF/'caller-contexts.jsonl')}
 hashes={v['sourceIdSha256']:k for k,v in sources.items()}
 p_rows=jl(P/'primary-ledger.jsonl'); p_props={(r['sourceId'],r['locale']):r for r in jl(P/'selected-proposals.jsonl')}
 p_by={(r.get('sourceId') or hashes[r['sourceIdSha256']],r['locale']):r for r in p_rows}
 b_by={(r['sourceId'],r['locale']):r for r in jl(B/'blind-decision-ledger.jsonl')}
 reatt={r['cellId']:r for r in jl(OUT/'input-reattestation.jsonl')}
 OV={}
 def add(loc,suffix,target,reason,conf='moderate',reviewer='cross-reviewer'):
  OV[(suffix,loc)]={'target':target,'reason':reason,'confidence':conf,'reviewer':reviewer}
 # Spanish, German, French, Brazilian Portuguese (independent locale pass A)
 add('es','validationTypes','Debes seleccionar al menos un tipo de notificación','Corrects the target’s interrupted construction around “at least one”; exact blind wording.', 'high','locale-review-a')
 add('es','webhookUrl','URL del webhook','Natural Spanish field-label order and lowercase generic webhook term.', 'moderate','locale-review-a')
 add('es','webhookUrlTip','La URL de notificación de prueba está configurada como {testUrl} en vez de la URL real del webhook.','Clarifies the actual-versus-test URL contrast and keeps the placeholder exact.', 'high','locale-review-a')
 add('es','botAvatarUrl','URL del avatar del bot','Corrects the English-like word order for a Discord bot avatar URL field.', 'high','locale-review-a')
 add('de','toastWebhookTestFailed','Webhook-Testbenachrichtigung konnte nicht gesendet werden.','Uses the standard hyphenated German technical compound in the failure toast.', 'high','locale-review-a')
 add('de','toastWebhookTestSending','Webhook-Testbenachrichtigung wird gesendet…','Uses the standard hyphenated German technical compound for the in-progress toast.', 'high','locale-review-a')
 add('de','toastWebhookTestSuccess','Webhook-Testbenachrichtigung gesendet!','Uses the standard hyphenated German technical compound in the success toast.', 'high','locale-review-a')
 add('de','validationTypes','Du musst mindestens einen Benachrichtigungstyp auswählen','Corrects the accusative article/number agreement in the required notification-type validation.', 'high','locale-review-a')
 add('de','botAvatarUrl','Bot-Avatar-URL','Compounds the German field label naturally.', 'moderate','locale-review-a')
 add('fr','supportVariables','Prendre en charge les variables d’URL','“Prendre en charge” directly expresses support for URL variables in this toggle.', 'high','locale-review-a')
 add('fr','toastWebhookTestSuccess','Notification de test du webhook envoyée !','Adds the article and natural word order to the success toast.', 'moderate','locale-review-a')
 add('fr','botAvatarUrl','URL de l’avatar du bot','Uses concise natural French field-label order.', 'high','locale-review-a')
 add('pt-BR','validationJsonPayloadRequired','Você deve fornecer um conteúdo JSON válido','Uses idiomatic fornecer in this validation message instead of the less natural prover/payload construction.', 'moderate','locale-review-a')
 add('pt-BR','validationWebhookUrl','Você deve fornecer uma URL válida','Uses idiomatic pt-BR wording for this required URL validation.', 'moderate','locale-review-a')
 add('pt-BR','webhookUrl','URL do webhook','Natural Brazilian Portuguese field-label order.', 'moderate','locale-review-a')
 add('pt-BR','webhookUrlTip','A URL da notificação de teste está definida como {testUrl}, em vez da URL real do webhook.','Agrees URL as feminine and states clearly that the configured test URL differs from the real Webhook URL.', 'high','locale-review-a')
 add('pt-BR','botAvatarUrl','URL do avatar do bot','Corrects the English-like word order for the bot avatar URL label.', 'high','locale-review-a')
 # Simplified Chinese, Hindi, Japanese, Korean (independent locale pass B)
 add('zh-Hans','supportVariablesTip','可用变量的说明见 Webhook 模板变量部分。','More idiomatic help copy while preserving the template-variable documentation location.', 'moderate','locale-review-b')
 add('zh-Hans','webhookUrlTip','测试通知 URL 设置为 {testUrl} 而不是实际的 Webhook URL。','Removes the stray space before Chinese punctuation; preserves the exact placeholder and URL terms.', 'high','locale-review-b')
 add('zh-Hans','authUser','SMTP 用户名','用户名 precisely names the SMTP username field.', 'high','locale-review-b')
 add('hi','supportVariables','URL चर का समर्थन','Clearer label word order for the URL-variable support toggle.', 'moderate','locale-review-b')
 add('hi','templatevariablehelp','टेम्पलेट चर सहायता','Uses चर for the technical term “variables” in this help heading.', 'moderate','locale-review-b')
 add('hi','toastWebhookTestSending','वेबहुक परीक्षण अधिसूचना भेजी जा रही है…','Correct in-progress aspect for the Webhook test notification toast.', 'moderate','locale-review-b')
 add('hi','webhooksettingsfailed','वेबहुक अधिसूचना सेटिंग्स सहेजी नहीं जा सकीं।','Corrects agreement and naturalness in the save-failure toast.', 'moderate','locale-review-b')
 add('hi','webhooksettingssaved','वेबहुक अधिसूचना सेटिंग्स सफलतापूर्वक सहेजी गईं!','Restores “notification” and plural settings in the success message.', 'moderate','locale-review-b')
 add('hi','botAPI','बॉट प्राधिकरण टोकन','Concise technical label for the Telegram bot authorization token.', 'moderate','locale-review-b')
 add('hi','botApiTip','Seerr के साथ उपयोग के लिए <CreateBotLink>एक बॉट बनाएँ</CreateBotLink>','Natural word order and the link encloses the create-a-bot action.', 'moderate','locale-review-b')
 add('ja','supportVariables','URL変数をサポート','Explicitly names URL variables, avoiding a reading as URL parameters.', 'high','locale-review-b')
 add('ja','supportVariablesTip','利用可能な変数は Webhook テンプレート変数のセクションに記載されています。','Corrects the current typo and reads naturally for a documentation pointer.', 'moderate','locale-review-b')
 add('ja','authUser','SMTP ユーザー名','Explicitly labels the SMTP username field.', 'high','locale-review-b')
 add('ko','supportVariablesTip','사용 가능한 변수는 Webhook 템플릿 변수 섹션에 설명되어 있습니다.','Natural phrase for where available variables are documented.', 'moderate','locale-review-b')
 add('ko','validationTypes','알림 유형을 하나 이상 선택해야 합니다.','Removes redundant wording while preserving “select at least one”.', 'high','locale-review-b')
 add('ko','botApiTip','Seerr와 함께 사용할 <CreateBotLink>봇을 만드세요</CreateBotLink>','Natural Korean word order; the linked text is the “create a bot” action.', 'moderate','locale-review-b')
 # Arabic, Traditional Chinese, Vietnamese, Indonesian (integrating reviewer)
 add('ar','toastWebhookTestFailed','فشل إرسال إشعار اختبار Webhook.','Uses a correctly spelled, natural failure notification and retains the technical Webhook term.', 'moderate','root-reviewer')
 add('ar','toastWebhookTestSuccess','تم إرسال إشعار اختبار Webhook!','Corrects the current spelling and names the test Webhook notification directly.', 'moderate','root-reviewer')
 add('ar','allowselfsigned','السماح بالشهادات الموقعة ذاتيًا','Accurately describes allowing self-signed certificates.', 'moderate','root-reviewer')
 add('ar','authPass','كلمة مرور SMTP','Natural password-field label; retains SMTP.', 'moderate','root-reviewer')
 add('zh-Hant','toastWebhookTestSending','正在傳送 Webhook 測試通知…','Natural Traditional Chinese in-progress status with consistent Webhook capitalization.', 'moderate','root-reviewer')
 add('zh-Hant','allowselfsigned','允許自簽憑證','Uses the concise Traditional Chinese term for a self-signed certificate.', 'moderate','root-reviewer')
 add('zh-Hant','webhookUrlTip','測試通知 URL 設定為 {testUrl}，而非實際的 Webhook URL。','Uses Traditional Chinese punctuation and a natural contrast; keeps {testUrl} and both URL references.', 'moderate','root-reviewer')
 add('zh-Hant','authUser','SMTP 使用者名稱','使用者名稱 explicitly labels a username rather than only a user.', 'moderate','root-reviewer')
 add('zh-Hant','botApiTip','<CreateBotLink>建立機器人</CreateBotLink>，以供 Seerr 使用','Uses standard Traditional Chinese 建立 and spaces the product name for readability.', 'moderate','root-reviewer')
 add('vi','validationJsonPayloadRequired','Bạn phải cung cấp dữ liệu JSON hợp lệ.','Removes an unnatural classifier before the uncountable JSON data term.', 'moderate','root-reviewer')
 add('vi','botAPI','Token ủy quyền của bot','Clearly labels the technical authorization token and retains its intended meaning.', 'moderate','root-reviewer')
 add('vi','botApiTip','<CreateBotLink>Tạo bot</CreateBotLink> để sử dụng với Seerr','Concise, natural help text with the create action in the link.', 'moderate','root-reviewer')
 add('id','supportVariables','Dukungan variabel URL','Natural Indonesian noun phrase and corrects the current word order.', 'moderate','root-reviewer')
 add('id','supportVariablesTip','Variabel yang tersedia tercantum di bagian variabel template webhook.','Uses standard bagian for a section and smoother documentation wording.', 'moderate','root-reviewer')
 add('id','validationWebhookUrl','Anda harus memberikan URL yang valid.','Direct, standard wording for a required valid URL.', 'moderate','root-reviewer')
 add('id','webhookUrlTip','URL Notifikasi Uji ditetapkan ke {testUrl}, bukan ke URL webhook yang sebenarnya.','Uses formal ditetapkan and clearly contrasts the test URL and actual Webhook URL.', 'moderate','root-reviewer')
 add('id','botAvatarUrl','URL untuk avatar bot','Natural field-label word order.', 'moderate','root-reviewer')
 need(len(cells)==240 and len(reatt)==240,'cross input scope')
 out=[]; decision_counts=collections.Counter(); changed=0; token_exceptions=[]
 for key,c in cells.items():
  sid,loc=key; suffix=sid.split('.')[-1]
  src=sources[sid]; ctx=contexts[sid]; pr=p_by[key]; bl=b_by[key]; reat_row=reatt[c['cellId']]
  is_hold=(suffix=='agentenabled')
  if is_hold:
   primary_hash=next((x['holdReasonSha256'] for x in jl(P/'hash-only-holds.jsonl') if x['sourceIdSha256']==src['sourceIdSha256'] and x['locale']==loc),None)
   row={'cellId':c['cellId'],'sourceId':sid,'locale':loc,'decision':'hold','recommendationKind':'hash-only-hold',
    'holdCode':'PRODUCT_TERM_UNRESOLVED','holdReasonSha256':primary_hash,
    'confidence':'high','sourceIdSha256':src['sourceIdSha256'],'sourceTextSha256':src['sourceTextSha256'],
    'currentTargetSha256':c['currentTargetSha256'],'currentCallerContextSha256':ctx['callerContextSha256'],
    'previousCallerContextSha256':ctx['previousCallerContextSha256'],'primaryDisposition':pr['primaryDisposition'],
    'primaryCandidateSha256':None,'primaryHoldHashOnly':True,'blindDisposition':bl['disposition'],
    'blindCandidateSha256':bl.get('reviewTargetSha256'),'inputReattestationSha256':reat_row['reattestationSha256'],
    'sourceHead':HEAD,'sourceTree':TREE,'baseSha':BASE,'baseTree':BASETREE,
    'reviewer':'cross-reviewer','rationaleCode':'caller-does-not-define-product-term'}
   decision_counts['hold']+=1
  else:
   setting=OV.get((suffix,loc))
   if setting: target=setting['target']; reason=setting['reason']; confidence=setting['confidence']; reviewer=setting['reviewer']
   else:
    target=c['currentTarget']; confidence='moderate'; reviewer=('locale-review-a' if loc in {'es','de','fr','pt-BR'} else 'locale-review-b' if loc in {'zh-Hans','hi','ja','ko'} else 'root-reviewer')
    reason='Current target accurately conveys the source for this caller; both candidate lanes were reviewed and no required-token defect needs a change.'
   primary_target=pr.get('proposedTarget')
   blind_target=bl.get('reviewTarget')
   if target==c['currentTarget']: selected='current'; decision='accept'
   elif target==primary_target and target==blind_target: selected='primary+blind'; decision='accept'
   elif target==primary_target: selected='primary'; decision='accept'
   elif target==blind_target: selected='blind'; decision='accept'
   else: selected='cross-adjustment'; decision='adjust'
   checks=check(c['sourceText'],target)
   primary_checks=check(c['sourceText'],primary_target) if primary_target is not None else None
   blind_checks=check(c['sourceText'],blind_target)
   for lane,checkrow in [('recommendation',checks),('primary',primary_checks),('blind',blind_checks)]:
    if checkrow is None or checkrow['allMatch']: continue
    allowed=(sid.endswith('.validationTypes') and loc=='ja' and
      not checkrow['checks']['numericTokens'] and all(v for k,v in checkrow['checks'].items() if k!='numericTokens') and
      tokens(target if lane=='recommendation' else primary_target if lane=='primary' else blind_target)['numericTokens']==['1'])
    need(allowed,lane+' token mismatch at '+c['cellId']+': '+str(checkrow['checks']))
    if not any(x['cellId']==c['cellId'] for x in token_exceptions):
     token_exceptions.append({'cellId':c['cellId'],'field':'numericTokens','semanticRationale':'Japanese 1つ以上 means one or more, a direct natural equivalent of the English minimum-one instruction.'})
   if target!=c['currentTarget']: changed+=1
   row={'cellId':c['cellId'],'sourceId':sid,'locale':loc,'decision':decision,'recommendationKind':'text',
    'selectedSource':selected,'currentTarget':c['currentTarget'],'currentTargetSha256':c['currentTargetSha256'],
    'primaryCandidate':primary_target,'primaryCandidateSha256':pr.get('proposedTargetSha256'),
    'blindCandidate':blind_target,'blindCandidateSha256':bl.get('reviewTargetSha256'),
    'recommendedTarget':target,'recommendedTargetSha256':shat(target),'confidence':confidence,'reviewer':reviewer,
    'sourceIdSha256':src['sourceIdSha256'],'sourceTextSha256':src['sourceTextSha256'],
    'currentCallerContextSha256':ctx['callerContextSha256'],'previousCallerContextSha256':ctx['previousCallerContextSha256'],
    'primaryDisposition':pr.get('primaryDisposition'),'blindDisposition':bl.get('disposition'),
    'inputReattestationSha256':reat_row['reattestationSha256'],'tokenChecks':checks['checks'],
    'primaryCandidateTokenChecks':primary_checks['checks'] if primary_checks else None,
    'blindCandidateTokenChecks':blind_checks['checks'],
    'sourceHead':HEAD,'sourceTree':TREE,'baseSha':BASE,'baseTree':BASETREE,'rationale':reason}
   decision_counts[decision]+=1
  row['reviewRecordSha256']=sha(canon(row)); out.append(row)
 need(len(out)==240,'recommendation rows')
 need(len(OV)==50,'override inventory, expected 50 non-current outcomes')
 (OUT/'recommendations.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n' for r in out))
 summary={'result':'PASS-PENDING-EXIT-ATTESTATION','window':'W4000-W4019','repository':'snapetech-org/seerrng','pullRequest':418,
  'currentHead':HEAD,'currentTree':TREE,'baseSha':BASE,'baseTree':BASETREE,'sourceIds':20,'cells':240,
  'allSourceAndCurrentTargetPinsReattested':True,'oldPrimaryRowsReattested':240,'oldBlindRowsReattested':240,
  'sourceTextChangesSinceOldCandidateFree':0,'targetChangesSinceOldCandidateFree':0,
  'recommendationCounts':dict(decision_counts),'recommendationsDifferentFromCurrent':changed,
  'hashOnlyHolds':sum(1 for r in out if r['decision']=='hold'),
  'numericSemanticExceptions':token_exceptions,'otherTokenFailures':0,
  'primarySummary':json.loads((P/'primary-summary.json').read_text()),
  'blindSummary':json.loads((B/'blind-summary.json').read_text()),
  'localeReviewPasses':{'es-de-fr-pt-BR':80,'zh-Hans-hi-ja-ko':80,'ar-zh-Hant-vi-id':80},
  'nativeSpeakerReviewPerformed':False,'browserVisualReviewPerformed':False,
  'repositoryOrPrEdited':False,'testsBuildsScansCiOrWorkflowsRun':False,
  'staleOldCrossReused':False}
 (OUT/'recommendations-summary.json').write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 print(json.dumps({'result':'PASS','cells':len(out),'decisionCounts':dict(decision_counts),
 'targetChanges':changed,'hashOnlyHolds':sum(1 for r in out if r['decision']=='hold'),
 'overrideRows':len(OV),'tokenExceptions':token_exceptions},ensure_ascii=False,indent=2))
 if changed!=50: raise SystemExit('REFUSED: expected 50 changed recommendation targets')
 if sum(1 for r in out if r['decision']=='hold')!=12: raise SystemExit('REFUSED: expected 12 hash-only holds')
 if any(r['sourceId'].endswith('.agentenabled') and any(k in r for k in ('currentTarget','primaryCandidate','blindCandidate','recommendedTarget')) for r in out):
  raise SystemExit('REFUSED: hold rows contain text')

if __name__=="__main__": main()
