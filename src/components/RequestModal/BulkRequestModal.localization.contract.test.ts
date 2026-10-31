import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const requestRoot = path.join(process.cwd(), 'src/components/RequestModal');
const componentSource = fs.readFileSync(
  path.join(requestRoot, 'BulkRequestModal.tsx'),
  'utf8'
);
const localeConfig = JSON.parse(
  fs.readFileSync('config/i18n/locales.json', 'utf8')
);
const englishMessages = JSON.parse(
  fs.readFileSync('src/i18n/locale/en.json', 'utf8')
);

describe('bulk request modal localization contract', () => {
  it('uses the catalog descriptor for disclosure labels, not raw JSX text', () => {
    assert.doesNotMatch(componentSource, /\blabel\s*=\s*(["'])[^"'\r\n]+\1/);
    assert.match(
      componentSource,
      /label=\{intl\.formatMessage\([\s\S]*?requestModalMessages\.advancedOptions[\s\S]*?\)\}/
    );
    assert.equal(
      englishMessages['components.RequestModal.advancedOptions'],
      'Advanced Options'
    );
  });

  it('has translated Advanced Options values in every rollout locale', () => {
    const locales = [
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
    const entries = new Map(
      localeConfig.locales.map((locale: { tag: string; clientFile: string }) => [
        locale.tag,
        locale.clientFile,
      ])
    );

    for (const locale of locales) {
      const filename = entries.get(locale);
      assert.ok(filename, `missing registry entry for ${locale}`);
      const catalog = JSON.parse(
        fs.readFileSync(path.join('src/i18n/locale', filename as string), 'utf8')
      );
      const value = catalog['components.RequestModal.advancedOptions'];
      assert.equal(typeof value, 'string', `${locale} value must be text`);
      assert.ok(value.trim(), `${locale} value must be nonempty`);
      assert.notEqual(
        value,
        englishMessages['components.RequestModal.advancedOptions'],
        `${locale} must not fall back to English`
      );
    }
  });
});
