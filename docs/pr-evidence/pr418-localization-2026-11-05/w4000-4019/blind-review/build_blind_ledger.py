#!/usr/bin/env python3
"""Build the independent, candidate-free W4000-W4019 semantic review ledger."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

DEFAULT_PACKET = pathlib.Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w4000-4019-candidate-free-20261105/candidate-free-input/candidate-free-input')
LOCALES = ['es', 'zh-Hans', 'hi', 'de', 'ja', 'fr', 'pt-BR', 'ar', 'ko', 'zh-Hant', 'vi', 'id']

CONTEXT = {
  4000: 'Checkbox label in Webhook notification settings; paired with a help text about available template variables.',
  4001: 'Help text explaining where available Webhook template variables are documented.',
  4002: 'Header/title for the Webhook template variable help.',
  4003: 'Failure toast shown when sending a Webhook test notification fails.',
  4004: 'In-progress toast shown while a Webhook test notification is being sent.',
  4005: 'Success toast shown after a Webhook test notification is sent.',
  4006: 'Validation message requiring a valid JSON payload.',
  4007: 'Validation message requiring at least one notification type to be selected.',
  4008: 'Required-field validation message for a valid Webhook URL.',
  4009: 'Form label for the Webhook URL field.',
  4010: 'Helper text says the test notification URL uses {testUrl} instead of the actual Webhook URL.',
  4011: 'Failure toast after saving Webhook notification settings.',
  4012: 'Success toast after saving Webhook notification settings.',
  4013: 'Checkbox label shared by Discord, Email, and Telegram notification settings; the packet does not define what “Agent” denotes.',
  4014: 'Email notification setting toggle for allowing self-signed certificates.',
  4015: 'SMTP password field label.',
  4016: 'SMTP username field label.',
  4017: 'Telegram field label for a bot authorization token.',
  4018: 'Telegram help text linking to bot creation for use with Seerr.',
  4019: 'Discord field label for the bot avatar URL.',
}

# Only non-accept decisions are listed. Each corrected/refined target is exact.
DECISIONS = {
  (4000, 'hi'): ('correction', 'URL वेरिएबल्स का समर्थन करें', 'moderate', 'The current noun fragment is awkward for a checkbox label; this makes the support action explicit while retaining URL and the variable meaning.'),
  (4000, 'ja'): ('correction', 'URL変数をサポート', 'moderate', 'The current wording says URL parameters, which narrows “variables” to a different concept; this keeps the template-variable meaning.'),
  (4000, 'fr'): ('correction', 'Prise en charge des variables d’URL', 'moderate', 'The current verb means “manage,” while the source says “support”; this restores the source action.'),
  (4000, 'id'): ('correction', 'Dukung variabel URL', 'moderate', 'The current word order is not a clear Indonesian checkbox label; this states the support action and keeps URL.'),
  (4001, 'ja'): ('correction', '利用可能な変数はWebhookテンプレート変数セクションに記載されています', 'high', 'The current first word is missing 利 and is malformed; the proposed text restores “available variables” and preserves the documentation meaning.'),
  (4001, 'ko'): ('refinement', '사용 가능한 변수는 Webhook 템플릿 변수 섹션에 설명되어 있습니다.', 'moderate', 'The current phrase can read as “possible variables”; this more directly says the available variables are described in the section.'),
  (4001, 'id'): ('correction', 'Variabel yang tersedia didokumentasikan di bagian variabel templat webhook.', 'moderate', 'The current syntax is ungrammatical (“available variable documented in area”); the proposed sentence makes the documented section relationship clear.'),
  (4002, 'hi'): ('correction', 'टेम्पलेट चर सहायता', 'moderate', 'परिवर्तनीय means “changeable”; चर is the variable term already used in this packet’s Hindi variable help.'),
  (4003, 'de'): ('refinement', 'Webhook-Testbenachrichtigung konnte nicht gesendet werden.', 'moderate', 'The current meaning is clear, but German compounds this notification label with a hyphen.'),
  (4003, 'ar'): ('correction', 'فشل إرسال إشعار اختبار Webhook.', 'moderate', 'The current wording can mean a test alert sent to a Webhook; the proposed text says the Webhook test notification failed to send and corrects hamza spelling.'),
  (4004, 'de'): ('refinement', 'Webhook-Testbenachrichtigung wird gesendet…', 'moderate', 'The current meaning is clear, but German compounds this notification label with a hyphen.'),
  (4005, 'de'): ('refinement', 'Webhook-Testbenachrichtigung gesendet!', 'moderate', 'The current meaning is clear, but German compounds this notification label with a hyphen.'),
  (4005, 'ar'): ('refinement', 'تم إرسال إشعار اختبار Webhook!', 'moderate', 'The current toast is understandable; this restores the Webhook test-notification object explicitly and uses correct hamza spelling.'),
  (4007, 'es'): ('correction', 'Debes seleccionar al menos un tipo de notificación', 'high', 'The commas interrupt the “at least one” phrase and are not needed.'),
  (4007, 'de'): ('correction', 'Du musst mindestens einen Benachrichtigungstyp auswählen', 'high', 'After einen, the current plural Benachrichtigungstypen is grammatically mismatched; the singular form is required.'),
  (4007, 'ko'): ('correction', '알림 유형을 하나 이상 선택해야 합니다', 'high', '적어도 하나 이상 redundantly combines “at least” and “one or more”; 하나 이상 directly expresses “at least one.”'),
  (4010, 'es'): ('correction', 'La URL de prueba de notificación está configurada como {testUrl} en vez de la URL real del webhook.', 'moderate', 'In this contrast, actual means the real Webhook URL; the current actual can be read as “current” in Spanish.'),
  (4010, 'zh-Hans'): ('refinement', '测试通知 URL 设置为 {testUrl} 而不是实际的 Webhook URL。', 'high', 'Removes the stray space before the Chinese full stop; the sentence meaning and placeholder stay unchanged.'),
  (4010, 'pt-BR'): ('correction', 'A URL de notificação de teste está definida como {testUrl} em vez da URL real do webhook.', 'moderate', 'In this contrast, actual means real; atual in Brazilian Portuguese usually means current.'),
  (4010, 'id'): ('refinement', 'URL Notifikasi Uji ditetapkan ke {testUrl}, bukan ke URL webhook yang sebenarnya.', 'moderate', 'The current diset is colloquial; ditetapkan is a more formal fit for a settings explanation.'),
  (4011, 'hi'): ('correction', 'वेबहुक अधिसूचना सेटिंग्स सहेजी नहीं जा सकीं।', 'moderate', 'The current बचाने में विफल रहा is awkward here and can mean “failed to rescue”; the proposed passive directly says the settings could not be saved.'),
  (4014, 'ar'): ('correction', 'السماح بالشهادات الموقّعة ذاتيًا', 'high', 'The current phrase means “personal signed certificate”; the proposed phrase means self-signed certificates.'),
  (4015, 'ar'): ('refinement', 'كلمة مرور SMTP', 'moderate', 'The current word order is awkward for an Arabic password field label; this uses the direct “SMTP password” noun phrase.'),
  (4016, 'ja'): ('correction', 'SMTP ユーザー名', 'high', 'The current 認証ユーザー means authentication user, not the username field named by the source.'),
  (4016, 'zh-Hant'): ('correction', 'SMTP 使用者名稱', 'high', 'The current 使用者 means user; the source names the username field, so 名稱 is required.'),
  (4017, 'hi'): ('refinement', 'बॉट प्राधिकरण टोकन', 'moderate', 'The current label mixes Latin Bot/Token with Hindi authorization; this keeps the technical meaning in consistent Devanagari script.'),
  (4018, 'vi'): ('correction', '<CreateBotLink>Tạo bot</CreateBotLink> để sử dụng với Seerr', 'high', 'robot usually denotes a physical robot in Vietnamese; this Telegram setup help is for a software bot.'),
  (4019, 'es'): ('correction', 'URL del avatar del bot', 'high', 'The current label follows English word order and leaves Avatar untranslated; this is the natural Spanish noun phrase.'),
  (4019, 'fr'): ('refinement', 'URL de l’avatar du bot', 'moderate', 'Removes an unwarranted “your” and the English-style capitalization while preserving the field meaning.'),
  (4019, 'pt-BR'): ('correction', 'URL do avatar do bot', 'moderate', 'The proposed phrase uses natural Portuguese word order and lowercase common nouns for this field label.'),
  (4019, 'id'): ('correction', 'URL untuk avatar bot', 'moderate', 'The current label follows English word order; this states “URL for the bot avatar” in Indonesian order.'),
}

def sha(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def read_jsonl(path: pathlib.Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]

def token_view(text: str):
    return {
        'markupTags': re.findall(r'</?[A-Za-z][A-Za-z0-9]*>', text),
        'numericTokens': re.findall(r'\d+(?:[.,]\d+)*', text),
        'placeholders': re.findall(r'\{[^{}]+\}', text),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--packet', type=pathlib.Path, default=DEFAULT_PACKET)
    ap.add_argument('--output', type=pathlib.Path, required=True)
    args = ap.parse_args()
    packet, out = args.packet.resolve(), args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((packet / 'manifest.json').read_text(encoding='utf-8'))
    sources = {r['position']: r for r in read_jsonl(packet / 'selected-source-cells.jsonl')}
    targets = {(r['position'], r['locale']): r for r in read_jsonl(packet / 'current-target-cells.jsonl')}
    contexts = {r['position']: r for r in read_jsonl(packet / 'caller-contexts.jsonl')}
    if manifest['head'] != 'ac193096ebfc0007183348b24e35bf6fee33f67a' or manifest['tree'] != '93e71e7c52602ec3f8b76548fd12b2f5b4368b4c':
        raise SystemExit('Pinned PR head/tree mismatch')
    if len(sources) != 20 or len(targets) != 240 or len(contexts) != 20:
        raise SystemExit('Candidate-free packet counts do not match the expected 20/240/20')
    if manifest['localeOrder'] != LOCALES:
        raise SystemExit('Locale order mismatch')
    cells = []
    for pos in range(4000, 4020):
        s, c = sources[pos], contexts[pos]
        for locale in LOCALES:
            current = targets[(pos, locale)]
            if sha(current['currentTarget']) != current['currentTargetSha256']:
                raise SystemExit(f'Input target hash mismatch: {pos}/{locale}')
            decision = DECISIONS.get((pos, locale))
            if pos == 4013:
                disposition = 'hold'
                target = current['currentTarget']
                confidence = 'high'
                rationale = 'Hold: caller context identifies a checkbox shared by Discord, Email, and Telegram settings but does not define “Agent”; available translations choose between materially different meanings, so the source term needs clarification.'
            elif decision:
                disposition, target, confidence, rationale = decision
            else:
                disposition = 'accept'
                target = current['currentTarget']
                confidence = 'moderate'
                rationale = f'Target conveys “{s["sourceText"]}” for this caller context; no material semantic or required-token issue was found.'
            source_tokens = s['sourceTokens']
            target_tokens = token_view(target)
            target_tokens['protectedLiterals'] = [literal for literal in source_tokens['protectedLiterals'] if literal in target]
            token_issues = []
            if collections.Counter(target_tokens['markupTags']) != collections.Counter(source_tokens['markupTags']): token_issues.append('markupTags')
            if collections.Counter(target_tokens['placeholders']) != collections.Counter(source_tokens['placeholders']): token_issues.append('placeholders')
            if collections.Counter(target_tokens['numericTokens']) != collections.Counter(source_tokens['numericTokens']): token_issues.append('numericTokens')
            if collections.Counter(target_tokens['protectedLiterals']) != collections.Counter(source_tokens['protectedLiterals']): token_issues.append('protectedLiterals')
            numeric_exception = None
            if (pos, locale) == (4007, 'ja'):
                numeric_exception = {
                    'type': 'semantic-equivalence',
                    'sourceMeaning': 'at least one notification type',
                    'targetForm': '1つ以上',
                    'adjudication': 'Japanese 1つ以上 means one or more; it expresses the same inclusive minimum threshold as “at least one.” Preserve it despite the source-token diagnostic.'
                }
                if disposition != 'accept' or '1つ以上' not in target:
                    raise SystemExit('Japanese numeric-token adjudication was changed')
            elif 'numericTokens' in token_issues:
                raise SystemExit(f'Unadjudicated numeric-token mismatch: {pos}/{locale}')
            if any(x for x in token_issues if x != 'numericTokens'):
                raise SystemExit(f'Required token mismatch in proposed target {pos}/{locale}: {token_issues}')
            if disposition in ('accept', 'hold') and target != current['currentTarget']:
                raise SystemExit(f'{disposition} must bind to the current target: {pos}/{locale}')
            if disposition in ('correction', 'refinement') and target == current['currentTarget']:
                raise SystemExit(f'{disposition} must carry a changed target: {pos}/{locale}')
            cell = {
                'cellId': f'{s["sourceId"]}|{locale}',
                'position': pos,
                'locale': locale,
                'sourceId': s['sourceId'],
                'sourceIdSha256': s['sourceIdSha256'],
                'sourceText': s['sourceText'],
                'sourceTextSha256': s['sourceTextSha256'],
                'callerContextSha256': c['callerContextSha256'],
                'callerResolution': c['callerResolution'],
                'definitionFiles': c['definitionFiles'],
                'callerContextSummary': CONTEXT[pos],
                'currentTarget': current['currentTarget'],
                'currentTargetSha256': current['currentTargetSha256'],
                'reviewTarget': target,
                'reviewTargetSha256': sha(target),
                'disposition': disposition,
                'confidence': confidence,
                'rationale': rationale,
                'sourceTokens': source_tokens,
                'reviewTargetTokens': target_tokens,
                'tokenIssues': token_issues,
                'numericSemanticEquivalence': numeric_exception,
            }
            cells.append(cell)
    ledger_path = out / 'blind-decision-ledger.jsonl'
    ledger_path.write_text(''.join(json.dumps(c, ensure_ascii=False, sort_keys=True) + '\n' for c in cells), encoding='utf-8')
    counts = collections.Counter(c['disposition'] for c in cells)
    summary = {
        'artifact': 'Independent blind semantic review ledger for SeerrNG PR #418 W4000-W4019',
        'schemaVersion': 1,
        'repository': manifest['repository'],
        'pullRequest': manifest['pullRequest'],
        'window': manifest['window'],
        'head': manifest['head'],
        'tree': manifest['tree'],
        'localeOrder': LOCALES,
        'sourceCount': len(sources),
        'cellCount': len(cells),
        'dispositionCounts': dict(sorted(counts.items())),
        'numericTokenExceptionCount': sum(c['numericSemanticEquivalence'] is not None for c in cells),
        'holdPositions': [4013],
        'nativeSpeakerReviewClaimed': False,
        'proposalFilesOpenedBeforeBlindCompletion': False,
    }
    summary_path = out / 'blind-summary.json'
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    readme = '''# SeerrNG PR #418 W4000-W4019 independent blind review\n\nThis artifact reviews the 20 selected source strings against all 12 current locale targets (240 cells) from the candidate-free packet pinned to head `ac193096ebfc0007183348b24e35bf6fee33f67a` and tree `93e71e7c52602ec3f8b76548fd12b2f5b4368b4c`.\n\n`blind-decision-ledger.jsonl` records the current target, the reviewed target, exact SHA-256 hashes, source and caller-context bindings, disposition, confidence, rationale, and token adjudication for every cell. `accept` and `hold` rows retain the current target. `correction` and `refinement` rows include an exact proposed target.\n\n`Enable Agent` (position 4013) is held in all locales because caller context does not identify what “Agent” denotes. Japanese `1つ以上` at position 4007 is accepted: it means “one or more,” which is semantically equivalent to “at least one”; the numeric-token diagnostic alone is not a semantic defect.\n\nThis is an independent desk review, not native-speaker signoff. No proposal or other review output was opened before this ledger was completed and checksummed. The portable verifier uses only Python's standard library and the candidate-free packet.\n\nRun: `python3 verify_blind_ledger.py --packet /path/to/candidate-free-input --artifact /path/to/this-directory`\n'''
    (out / 'README.md').write_text(readme, encoding='utf-8')
    packet_sums_hash = sha((packet / 'SHA256SUMS.txt').read_text(encoding='utf-8'))
    seal = {
        'seal': 'blind-completion',
        'sealedDate': '2026-11-05',
        'repository': manifest['repository'],
        'pullRequest': manifest['pullRequest'],
        'window': manifest['window'],
        'head': manifest['head'],
        'tree': manifest['tree'],
        'candidateFreePacketSha256SumsFileSha256': packet_sums_hash,
        'ledgerCellCount': len(cells),
        'ledgerSha256': sha(ledger_path.read_text(encoding='utf-8')),
        'builderSha256': sha(pathlib.Path(__file__).read_text(encoding='utf-8')),
        'portableVerifierSha256': sha((out / 'verify_blind_ledger.py').read_text(encoding='utf-8')) if (out / 'verify_blind_ledger.py').is_file() else None,
        'proposalFilesOpenedBeforeBlindCompletion': False,
        'proposalFilesOpenedBeforeSeal': False,
        'nativeSpeakerReviewClaimed': False,
        'sealStatement': 'The complete 240-cell decision ledger was written before any primary proposal packet or other review output was opened.',
    }
    (out / 'blind-seal.json').write_text(json.dumps(seal, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(f'Wrote {len(cells)} cells: {dict(counts)}')

if __name__ == '__main__':
    main()
