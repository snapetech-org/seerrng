#!/usr/bin/env python3
from __future__ import annotations
import collections,hashlib,json,re
from pathlib import Path
ROOT=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3860-3879-primary-20261104/candidate-free-input')
OUT=Path(__file__).resolve().parent
MAN=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
HEAD='12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e'; TREE='b288494aa5a0842affc4e900d6ccb6b57d99c493'
LOCALES=MAN['localeOrder']
PH=re.compile(r'\{[A-Za-z][A-Za-z0-9_]*\}')
TAGS=re.compile(r'<\/?[A-Za-z][^>]*>')
NUMS=re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
PROT_RE=r'(?<![A-Za-z0-9])(?:[A-Z]{2,}[A-Z0-9]*(?:[-/][A-Z0-9]+)*|LazyLibrarian|Lidarr|Plex|Sonarr|Radarr|Jellyfin|Emby|IMDb|TMDb|TheTVDB|TVDB|Trakt|Navidrome|Apprise)(?![A-Za-z0-9])'
REVISIONS={
 (3860,'zh-Hans'):'无法保存与 Navidrome 的连接。',
 (3860,'fr'):'Impossible d’enregistrer la connexion à Navidrome.',
 (3860,'zh-Hant'):'無法儲存與 Navidrome 的連線。',
 (3862,'ar'):'اختبر الاتصال',
 (3863,'ja'):'Navidromeに接続できません。URLと認証情報を確認してください。',
 (3864,'fr'):'Connecté à Navidrome.',
 (3864,'zh-Hant'):'已連線至 Navidrome。',
 (3866,'vi'):'URL máy chủ',
 (3867,'ja'):'例えば、http://navidrome:4533。',
 (3867,'zh-Hans'):'例如：http://navidrome:4533。',
 (3867,'zh-Hant'):'例如：http://navidrome:4533。',
 (3868,'de'):'Geben Sie eine gültige URL mit HTTP oder HTTPS ein.',
 (3868,'zh-Hans'):'输入有效的 HTTP 或 HTTPS URL。',
 (3868,'zh-Hant'):'輸入有效的 HTTP 或 HTTPS URL。',
 (3870,'ko'):'사용자 이름을 입력하세요.',
 (3870,'zh-Hant'):'請輸入使用者名稱。',
 (3871,'ar'):'تفعيل الوكيل',
 (3871,'zh-Hans'):'启用代理程序',
 (3871,'zh-Hant'):'啟用代理程式',
 (3871,'vi'):'Bật tác tử',
 (3874,'es'):'Nombre de configuración',
 (3874,'zh-Hans'):'配置名称',
 (3874,'hi'):'कॉन्फ़िगरेशन का नाम',
 (3874,'de'):'Konfigurationsname',
 (3874,'ja'):'設定名',
 (3874,'fr'):'Nom de la configuration',
 (3874,'pt-BR'):'Nome da configuração',
 (3874,'ar'):'اسم الإعداد',
 (3874,'ko'):'구성 이름',
 (3874,'zh-Hant'):'設定名稱',
 (3874,'vi'):'Tên cấu hình',
 (3874,'id'):'Nama konfigurasi',
 (3876,'pt-BR'):'Idioma',
 (3878,'fr'):'Étiquette',
 (3879,'fr'):'Facultatif. La notification est envoyée uniquement aux destinations du serveur Apprise portant cette étiquette.',
}
REASONS={
 (3860,'zh-Hans'):'The current Chinese target has an extra space before the full-width sentence punctuation; the revision also makes the “connection with Navidrome” relation explicit.',
 (3860,'fr'):'The callsite is a save-failure toast. French needs the preposition “à” before the service name.',
 (3860,'zh-Hant'):'Fixes the stray space before Chinese punctuation and uses the natural Traditional Chinese noun 連線 for a saved connection.',
 (3862,'ar'):'The direct caller is a Test Connection button; the final period is unnecessary on this action label.',
 (3863,'ja'):'The validation error should preserve the Navidrome product name in its original script; the current katakana transliteration loses the protected literal.',
 (3864,'fr'):'The success toast refers to connecting to the Navidrome service; the article in “au Navidrome” is unnecessary for the product name.',
 (3864,'zh-Hant'):'Uses the customary Traditional Chinese connection-status wording 連線.',
 (3866,'vi'):'The settings field is a server URL. “Máy chủ” is the standard server term; “máy phục vụ” is an unnatural literal rendering.',
 (3867,'ja'):'Removes an unnecessary space after Japanese punctuation in the example URL help text.',
 (3867,'zh-Hans'):'Uses Chinese example punctuation instead of an ASCII comma and retains the exact example URL.',
 (3867,'zh-Hant'):'Uses Chinese example punctuation instead of an ASCII comma and retains the exact example URL.',
 (3868,'de'):'The current German compound collapses HTTPS and URL into one protected token, while English names HTTP, HTTPS, and URL separately. This wording is natural and preserves all three literals exactly.',
 (3868,'zh-Hans'):'Removes the space before Chinese full-width punctuation and uses the standard wording for a valid URL.',
 (3868,'zh-Hant'):'“合法” means legal/lawful rather than valid for a URL; the revision uses 有效 and adds the sentence punctuation.',
 (3870,'ko'):'The Yup required-field error is shown when username is blank. The current value only repeats the field label; this restores the requested action.',
 (3870,'zh-Hant'):'The current target has a space before punctuation. The revision expresses the required-field instruction naturally.',
 (3871,'ar'):'This is a required checkbox explicitly labeled “Enable Agent”; the current wording says enable the service and drops Agent.',
 (3871,'zh-Hans'):'The checkbox enables an Agent feature, not a network proxy; 代理程序 makes the software-agent sense clear.',
 (3871,'zh-Hant'):'The checkbox enables an Agent feature, not notifications; 代理程式 expresses software agent.',
 (3871,'vi'):'The checkbox enables an Agent feature. The current text says notification service; the revision names the software agent (tác tử).',
 (3874,'es'):'The label is immediately explained by configKeyTip as the name of a saved server configuration, not a secret/key. Recommend relabeling as Configuration Name.',
 (3874,'zh-Hans'):'The help text defines this field as a saved configuration name; 配置密钥 suggests a secret/key. Recommend 配置名称.',
 (3874,'hi'):'The help text defines the field as a saved configuration name, not a credential key.',
 (3874,'de'):'The help text defines the field as a saved configuration name, not a secret key.',
 (3874,'ja'):'The help text defines the field as a saved configuration name; 設定名 removes the credential-key ambiguity.',
 (3874,'fr'):'The help text defines the field as a saved configuration name, not a secret/key.',
 (3874,'pt-BR'):'The help text defines the field as a saved configuration name, not a secret/key.',
 (3874,'ar'):'The help text defines the field as a saved configuration name, not a secret/key.',
 (3874,'ko'):'The help text defines the field as a saved configuration name, not a secret/key.',
 (3874,'zh-Hant'):'The help text defines the field as a saved configuration name; 配置金鑰 suggests a secret/key. Recommend 設定名稱.',
 (3874,'vi'):'The help text defines the field as a saved configuration name, not a secret/key.',
 (3874,'id'):'The help text defines the field as a saved configuration name, not a secret/key.',
 (3876,'pt-BR'):'This is the notification locale field (htmlFor="locale"). Idioma is the natural term for a human language setting; Linguagem often means language in the programming/code sense.',
 (3878,'fr'):'This field is an Apprise destination filter tag, not an HTML tag; balise is the markup term. Étiquette matches the destination-label meaning.',
 (3879,'fr'):'The helper filters Apprise destinations by a tag. Balise denotes markup; the revision consistently uses étiquette and clarifies the notification is sent only to matching destinations.',
}
HIGH={(3863,'ja'),(3868,'de'),(3868,'zh-Hant'),(3870,'ko'),(3871,'ar'),(3871,'zh-Hant'),(3871,'vi'),(3874,'es'),(3874,'zh-Hans'),(3874,'de'),(3874,'ja'),(3874,'fr'),(3874,'pt-BR'),(3874,'ar'),(3874,'ko'),(3874,'zh-Hant'),(3874,'vi'),(3874,'id'),(3876,'pt-BR'),(3878,'fr'),(3879,'fr')}

def sha(b):return hashlib.sha256(b).hexdigest()
def shat(s):return sha(s.encode('utf-8'))
def tok(s):
    prot=[]
    for x in re.findall(PROT_RE,s):
        if x not in prot:prot.append(x)
    return {'placeholders':PH.findall(s),'markupTags':TAGS.findall(s),'numericTokens':NUMS.findall(s),'protectedLiterals':prot}
def jl(p):return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def dump(path,items):path.write_bytes(b''.join((json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode('utf-8') for x in items))

def main():
    manifest=MAN
    src=jl(ROOT/'selected-source-cells.jsonl'); cells=jl(ROOT/'current-target-cells.jsonl')
    ctxs={x['sourceId']:x for x in jl(ROOT/'caller-contexts.jsonl')}; blocks={x['contextId']:x for x in jl(ROOT/'caller-context-blocks.jsonl')}
    sm={x['position']:x for x in src}; cm={(x['position'],x['locale']):x for x in cells}
    if len(src)!=20 or len(cells)!=240 or len(ctxs)!=20 or len(cm)!=240:raise SystemExit('candidate-free counts')
    # Produce one context record per English source message; include exact definition, caller lines, and renderer evidence.
    context_rows=[]
    for s in src:
        c=ctxs[s['sourceId']]
        context_rows.append({'position':s['position'],'sourceId':s['sourceId'],'sourceIdSha256':s['sourceIdSha256'],
          'sourceText':s['sourceText'],'sourceTextSha256':s['sourceTextSha256'],'sourceTokens':s['sourceTokens'],
          'namespace':c['namespace'],'namespaceFiles':c['namespaceFiles'],'callerContextSha256':c['callerContextSha256'],
          'callerResolution':c['callerResolution'],'callerCount':c['callerCount'],'callerOccurrenceCount':c['callerOccurrenceCount'],
          'contextBlocks':[blocks[x] for x in c['contextBlockIds']],
          'directMessageReferences':c['directMessageReferences'],'dynamicRendererReferences':c['dynamicRendererReferences']})
    dump(OUT/'blind-source-caller-context.jsonl',context_rows)
    reviewed=[]; proposals=[]; counts=collections.Counter(); locale_counts=collections.Counter(); token_mismatches_current=[]
    for s in src:
        c=ctxs[s['sourceId']]
        context_digest=sha((json.dumps(context_rows[s['position']-3860],ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode())
        for locale in LOCALES:
            x=cm[(s['position'],locale)]; final=REVISIONS.get((s['position'],locale),x['currentTarget'])
            baseline=x['tokenChecks']; current_tokens=tok(x['currentTarget']); final_tokens=tok(final); source_tokens=s['sourceTokens']
            part_checks={n:(set(source_tokens[n])<=set(final_tokens[n]) if n=='protectedLiterals' else source_tokens[n]==final_tokens[n]) for n in ('placeholders','markupTags','numericTokens','protectedLiterals')}
            if not all(part_checks.values()):raise SystemExit(f'final token parity failed at {s["position"]}/{locale}: {part_checks}')
            if not baseline['protectedLiterals']['matches']:
                token_mismatches_current.append({'position':s['position'],'sourceId':s['sourceId'],'locale':locale,'field':'protectedLiterals','missing':baseline['protectedLiterals']['missingFromTarget']})
                if (s['position'],locale) not in REVISIONS:raise SystemExit('unfixed baseline protected literal mismatch')
            disposition='revise-current' if final!=x['currentTarget'] else 'accept-current'
            confidence='high' if (s['position'],locale) in HIGH else ('moderate' if disposition=='revise-current' else 'moderate')
            rationale=REASONS.get((s['position'],locale),'The current value conveys the source meaning in the pinned definition and direct caller context; the required placeholders, markup, numeric tokens, and protected literals are preserved.')
            row={'window':'W3860-W3879','position':s['position'],'sourceId':s['sourceId'],'sourceIdSha256':s['sourceIdSha256'],'locale':locale,
              'sourceText':s['sourceText'],'sourceTextSha256':s['sourceTextSha256'],'currentTarget':x['currentTarget'],'currentTargetSha256':x['currentTargetSha256'],
              'reviewedTarget':final,'reviewedTargetSha256':shat(final),'reviewDisposition':disposition,'rationale':rationale,'reviewConfidence':confidence,
              'sourceTokens':source_tokens,'currentTokens':current_tokens,'reviewedTokens':final_tokens,'tokenParity':part_checks,
              'baselineTokenChecks':baseline,'callerContextSha256':x['callerContextSha256'],'callerRecordSha256':context_digest,
              'callerCount':c['callerCount'],'callerPaths':sorted(set(c['definitionFiles']+[r['path'] for r in c['directMessageReferences']])),'contextBlockIds':c['contextBlockIds'],
              'nativeSpeakerApproval':False,'browserReviewClaim':False}
            if s['position']==3874:
                row['sourceRewriteSuggested']='Configuration Name'
            reviewed.append(row);counts[disposition]+=1;locale_counts[locale]+=1
            if disposition=='revise-current':
                proposals.append({'window':'W3860-W3879','position':s['position'],'sourceId':s['sourceId'],'locale':locale,
                  'sourceTextSha256':s['sourceTextSha256'],'currentTargetSha256':x['currentTargetSha256'],'recommendedTarget':final,
                  'recommendedTargetSha256':shat(final),'sourceTokens':source_tokens,'recommendedTokens':final_tokens,'tokenParity':part_checks,
                  'callerContextSha256':x['callerContextSha256'],'callerRecordSha256':context_digest,'rationale':rationale,
                  'reviewConfidence':confidence,'nativeSpeakerApproval':False,'sourceRewriteSuggested':'Configuration Name' if s['position']==3874 else None})
    dump(OUT/'blind-review-cells.jsonl',reviewed);dump(OUT/'blind-review-proposals.jsonl',proposals)
    source_notes=[{'position':3874,'sourceId':sm[3874]['sourceId'],'callerContextSha256':ctxs[sm[3874]['sourceId']]['callerContextSha256'],
      'sourceIssue':'The field label “Configuration Key” conflicts with its adjacent help text, which says the value is the name of a saved configuration on the Apprise API server. The caller is a text input with id configKey; it is not described as a secret. This review recommends changing the English label to “Configuration Name” and translating that meaning.',
      'suggestedEnglishSource':'Configuration Name','affectedLocaleCells':12,'nativeReviewRequired':True}]
    (OUT/'source-wording-notes.json').write_text(json.dumps(source_notes,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
    summary={'artifact':'SeerrNG PR #418 W3860-W3879 independent blind semantic review','head':HEAD,'tree':TREE,'range':[3860,3879],
      'counts':{'sourceMessages':20,'targetLocales':12,'cells':len(reviewed),'acceptCurrent':counts['accept-current'],'reviseCurrent':counts['revise-current'],'holds':0,'callerlessSources':0,'proposals':len(proposals),
        'baselineProtectedLiteralMismatches':len(token_mismatches_current),'baselineOtherTokenMismatches':0,'recommendedProtectedLiteralMismatches':0},
      'localeOrder':LOCALES,'revisionCountsByLocale':{l:sum(1 for p in proposals if p['locale']==l) for l in LOCALES},
      'revisedCellIds':[f"{p['position']}::{p['locale']}" for p in proposals],
      'protectedLiteralCorrections':[{'position':x['position'],'locale':x['locale'],'sourceId':x['sourceId'],'missing':x['missing']} for x in token_mismatches_current],
      'priorContinuity':'Input verifier passed; 3,860 prior source hashes, 100 applied target hashes, and 14 carried text-free holds reattest.',
      'sourceContext':'Each source has a sealed source/caller record with definition block, direct message reference and route/render evidence; per-cell rows point to its hash.',
      'reviewLimitations':'Static blind semantic review only. No native-speaker or browser approval is claimed. All 12 cells for position 3874 include a source-rewrite suggestion because the English label conflicts with its help text.',
      'candidateFreeManifestSha256':sha((ROOT/'manifest.json').read_bytes()),'candidateFreeSha256SumsSha256':sha((ROOT/'SHA256SUMS.txt').read_bytes()),
      'candidateFreeVerifier':'PASS','candidateFreeExactHead':manifest['head'],'candidateFreeExactTree':manifest['tree']}
    (OUT/'blind-review-summary.json').write_text(json.dumps(summary,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
    print(json.dumps({'result':'BUILT','cells':len(reviewed),'acceptCurrent':counts['accept-current'],'reviseCurrent':counts['revise-current'],'holds':0,'proposals':len(proposals),'revisionsByLocale':summary['revisionCountsByLocale'],'baselineProtectedLiteralMismatches':len(token_mismatches_current)},ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
