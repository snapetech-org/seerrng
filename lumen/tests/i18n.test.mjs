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
const lumenKeys = [
  'lumen.tv.selectEntireSeries',
  'lumen.account.loading',
  'lumen.account.selectedCount',
  'lumen.admin.back',
  'lumen.admin.dest.requestDefaults',
  'lumen.search.trending',
  'lumen.search.searching',
  'lumen.gameLibrary.privateGameLibrary',
  'lumen.metadata.help.video',
  'lumen.metadata.help.music',
  'lumen.metadata.help.books',
  'lumen.metadata.credential.comicVineApiKey',
  'lumen.metadata.credential.metronToken',
  'lumen.metadata.credential.googleBooksApiKey',
  'lumen.metadata.credential.youtubeApiKey',
  'lumen.metadata.loadingSettings',
  'lumen.metadata.loadFailedTitle',
  'lumen.metadata.credentialsLoadFailedTitle',
];

test('Lumen account, request, and settings labels are translated in French and Arabic', async () => {
  const english = JSON.parse(
    await readFile(resolve(root, '../src/i18n/locale/en.json'), 'utf8')
  );
  for (const locale of ['fr', 'ar']) {
    assert.ok(locales.locales.some(({ tag }) => tag === locale));
    for (const key of keys) {
      assert.equal(
        typeof english[key],
        'string',
        `English source exists: ${key}`
      );
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
      assert.notEqual(
        overrides[locale][key],
        english[key],
        `${locale} translation is not an English fallback: ${key}`
      );
    }
  }
});

test('visible Lumen account, administration, game-library, and metadata labels are translated', () => {
  for (const locale of ['fr', 'ar']) {
    for (const key of lumenKeys) {
      assert.equal(
        typeof overrides.en[key],
        'string',
        `English source exists: ${key}`
      );
      assert.equal(
        typeof overrides[locale][key],
        'string',
        `${locale} translation exists: ${key}`
      );
      assert.notEqual(
        overrides[locale][key],
        overrides.en[key],
        `${locale} translation is not an English fallback: ${key}`
      );
    }
  }
});

test('Lumen includes the localized native user-list menu label', async () => {
  const keys = JSON.parse(
    await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
  );
  assert.ok(keys.includes('components.Layout.Sidebar.users'));
  const english = JSON.parse(
    await readFile(resolve(root, '../src/i18n/locale/en.json'), 'utf8')
  );
  for (const locale of ['fr', 'ar']) {
    const catalog = JSON.parse(
      await readFile(resolve(root, `../src/i18n/locale/${locale}.json`), 'utf8')
    );
    assert.notEqual(
      catalog['components.Layout.Sidebar.users'],
      english['components.Layout.Sidebar.users']
    );
  }
});
