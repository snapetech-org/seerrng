import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentSource = fs.readFileSync(
  'src/components/BookSeriesSearch/CoverCarousel.tsx',
  'utf8'
);
const localeConfig = JSON.parse(
  fs.readFileSync('config/i18n/locales.json', 'utf8')
);
const englishMessages = JSON.parse(
  fs.readFileSync('src/i18n/locale/en.json', 'utf8')
);
const sourceSnapshot = JSON.parse(
  fs.readFileSync('config/i18n/source-snapshot.json', 'utf8')
);
const deltaManifest = JSON.parse(
  fs.readFileSync('config/i18n/source-delta-manifest.json', 'utf8')
);

const messageId = 'components.BookSeriesSearch.CoverCarousel.roleDescription';
const rolloutLocales = [
  'ar',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'ja',
  'ko',
  'pt-BR',
  'vi',
  'zh-CN',
  'zh-TW',
];

describe('Book series carousel localization contract', () => {
  it('routes the accessible role description through its English catalog key', () => {
    assert.equal(englishMessages[messageId], 'carousel');
    assert.match(componentSource, /roleDescription:\s*'carousel'/);
    assert.match(
      componentSource,
      /aria-roledescription=\{intl\.formatMessage\(messages\.roleDescription\)\}/
    );
    assert.doesNotMatch(componentSource, /aria-roledescription="carousel"/);

    const sourceHash = createHash('sha256')
      .update(englishMessages[messageId], 'utf8')
      .digest('hex');
    assert.equal(sourceSnapshot.client[messageId], sourceHash);
    assert.equal(deltaManifest.source.id, messageId);
    assert.equal(deltaManifest.source.sourceSha256, sourceHash);
  });

  it('tracks completed translations for the 12 direct rollout locales', () => {
    const locales = localeConfig.locales;
    const directNonEnglish = locales
      .filter(
        (locale: { tag: string; fallback?: string }) =>
          locale.tag !== localeConfig.baseLocale && !locale.fallback
      )
      .map((locale: { tag: string }) => locale.tag);
    const directTarget = rolloutLocales.filter((tag) =>
      directNonEnglish.includes(tag)
    );

    assert.deepEqual(deltaManifest.localeAccounting.pendingDirectLocales, []);
    assert.equal(deltaManifest.localeAccounting.activeLocaleCount, 38);
    assert.equal(
      deltaManifest.localeAccounting.nonEnglishEffectiveLocaleCount,
      37
    );
    assert.equal(deltaManifest.localeAccounting.rolloutDirectLocaleCount, 12);
    assert.equal(deltaManifest.localeAccounting.pendingDirectCellCount, 0);
    assert.equal(
      deltaManifest.localeAccounting.rolloutEffectiveLocaleCount,
      13
    );
    assert.equal(
      deltaManifest.localeAccounting.outOfRolloutNonEnglishLocaleCount,
      24
    );
    assert.deepEqual(deltaManifest.localeAccounting.regionalInheritance, [
      {
        tag: 'es-MX',
        clientFile: 'es_MX.json',
        inheritsFrom: 'es',
        status: 'resolved-via-parent',
        directCellRequired: false,
      },
    ]);

    for (const locale of locales.filter(
      (entry: { tag: string }) => entry.tag !== localeConfig.baseLocale
    )) {
      const target = JSON.parse(
        fs.readFileSync(path.join('src/i18n/locale', locale.clientFile), 'utf8')
      );
      if (directTarget.includes(locale.tag)) {
        assert.equal(typeof target[messageId], 'string');
        assert.ok(target[messageId].trim());
        assert.notEqual(target[messageId], englishMessages[messageId]);
      } else {
        assert.equal(
          Object.hasOwn(target, messageId),
          false,
          `${locale.tag} remains outside direct translation scope`
        );
      }
    }
    assert.deepEqual(deltaManifest.translationCatalogsChanged, [
      'src/i18n/locale/ar.json',
      'src/i18n/locale/id.json',
      'src/i18n/locale/ko.json',
      'src/i18n/locale/pt_BR.json',
      'src/i18n/locale/vi.json',
      'src/i18n/locale/zh_Hans.json',
      'src/i18n/locale/zh_Hant.json',
    ]);
  });
});
