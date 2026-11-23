import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const overrides = JSON.parse(
  await readFile(resolve(root, 'i18n-overrides.json'), 'utf8')
);
const locales = JSON.parse(
  await readFile(resolve(root, '../config/i18n/locales.json'), 'utf8')
);
const keys = [
  'components.IssueDetails.allepisodes',
  'components.Persius.loading',
  'components.UserProfile.UserSettings.UserLinkedAccountsSettings.linkIdentityProvider',
  'components.UserProfile.UserSettings.menuClientTokens',
];

test('Lumen account, request, and settings labels are translated in French and Arabic', async () => {
  const english = JSON.parse(
    await readFile(resolve(root, '../src/i18n/locale/en.json'), 'utf8')
  );
  for (const locale of ['fr', 'ar']) {
    assert.ok(locales.locales.some(({ tag }) => tag === locale));
    for (const key of keys) {
      assert.equal(typeof english[key], 'string', `English source exists: ${key}`);
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
      assert.notEqual(
        overrides[locale][key],
        english[key],
        `${locale} translation is not an English fallback: ${key}`
      );
    }
  }
});
