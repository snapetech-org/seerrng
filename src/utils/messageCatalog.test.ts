import { loadLocaleMessages } from '@app/i18n/locale/loadLocaleMessages.generated';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createIntl, createIntlCache } from 'react-intl';
import { getCatalogMessageLanguage } from './messageCatalog';

for (const { locale, id, values, expected } of [
  {
    locale: 'bg',
    id: 'components.Discover.emptywatchlist',
    values: {},
    expected: 'Items added to your watchlist will appear here.',
  },
  {
    locale: 'bg',
    id: 'components.PermissionEdit.viewwatchlists',
    values: {},
    expected: 'View Watchlists',
  },
  {
    locale: 'fi',
    id: 'components.Login.description',
    values: {},
    expected:
      'Add a valid email address to complete your profile. This will be used for notifications and local sign-in.',
  },
  {
    locale: 'ru',
    id: 'components.StatusBadge.playonplex',
    values: { mediaServerName: 'Jellyfin' },
    expected: 'Play on Jellyfin',
  },
] as const) {
  test(`${locale} outdated ${id} safely uses the current source contract`, async () => {
    const messages = await loadLocaleMessages(locale);
    const intl = createIntl(
      {
        locale,
        messages,
        onError: (error) => {
          throw error;
        },
      },
      createIntlCache()
    );
    assert.equal(intl.formatMessage({ id }, values), expected);
    assert.equal(getCatalogMessageLanguage(messages, id, locale), 'en');
  });
}

test('Danish unlimited-period quota does not say every zero days', async () => {
  const messages = await loadLocaleMessages('da');
  const intl = createIntl(
    {
      locale: 'da',
      messages,
      onError: (error) => {
        throw error;
      },
    },
    createIntlCache()
  );
  const value = intl.formatMessage(
    { id: 'components.RequestModal.QuotaDisplay.allowedRequests' },
    {
      limit: 3,
      type: 'TEST',
      days: 0,
      strong: (chunks) => chunks.join(''),
    }
  );
  assert.equal(typeof value, 'string');
  assert.ok(!String(value).includes('0'));
});

test('Croatian minute schedule consumes the minute argument supplied by its caller', async () => {
  const messages = await loadLocaleMessages('hr');
  const intl = createIntl(
    {
      locale: 'hr',
      messages,
      onError: (error) => {
        throw error;
      },
    },
    createIntlCache()
  );
  const value = intl.formatMessage(
    {
      id: 'components.Settings.SettingsJobsCache.editJobScheduleSelectorMinutes',
    },
    { jobScheduleMinutes: 7 }
  );
  assert.match(String(value), /7/);
});
