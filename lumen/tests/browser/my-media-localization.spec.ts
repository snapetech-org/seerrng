import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_MY_MEDIA_LOCALE ?? ''
)
  ? process.env.LUMEN_MY_MEDIA_LOCALE!
  : 'en';
const baseline = process.env.LUMEN_MY_MEDIA_BASELINE === '1';

const labels = {
  en: {
    title: 'My Media',
    source: 'Library source',
    shelf: 'Shelf',
    mediaType: 'Media type',
    filter: 'Media type',
    accounts: 'Manage Linked Accounts',
    invalidAccounts: 'Invalid connected accounts response.',
    loadError: 'Could not load My Media',
    packs: 'Personal title matches',
    export: 'Export title matches',
  },
  fr: {
    title: 'Ma bibliothèque',
    source: 'Source de la bibliothèque',
    shelf: 'Étagère',
    mediaType: 'Type de média',
    filter: 'Type de média',
    accounts: 'Gérer les comptes liés',
    invalidAccounts: 'Réponse des comptes liés invalide.',
    loadError: 'Impossible de charger Ma bibliothèque',
    packs: 'Correspondance des titres personnels',
    export: 'Exporter les correspondances de titres',
  },
  ar: {
    title: 'مكتبي',
    source: 'مصدر المكتبة',
    shelf: 'رف',
    mediaType: 'نوع الوسائط',
    filter: 'نوع الوسائط',
    accounts: 'إدارة الحسابات المرتبطة',
    invalidAccounts: 'استجابة الحسابات المرتبطة غير صالحة.',
    loadError: 'تعذر تحميل مكتبي',
    packs: 'مطابقات العناوين الشخصية',
    export: 'تصدير مطابقات العناوين',
  },
} as const;

test('My Media follows the saved locale across its library controls', async ({
  page,
}, info) => {
  const translated = baseline
    ? labels.en
    : labels[locale as keyof typeof labels];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture User', permissions: 32 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
      });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: {
          accounts: [
            { provider: 'trakt', username: 'Fixture', allowWrites: false },
          ],
          mediaServer: null,
        },
      });
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json: {
          items: [
            {
              id: 'fixture-1',
              title: 'Fixture Film',
              mediaType: 'movie',
            },
          ],
          hasMore: false,
          truncated: false,
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('./library');
  await expect(
    page.getByRole('heading', { name: translated.title })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: translated.source })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: translated.shelf })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: translated.filter })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: translated.accounts })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: translated.packs })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: translated.export })
  ).toBeVisible();
  await expect(page.getByText('Fixture Film', { exact: true })).toBeVisible();

  if (locale === 'ar' && !baseline)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const captureDir = process.env.LUMEN_MY_MEDIA_CAPTURE_DIR;
  if (captureDir) {
    await mkdir(captureDir, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-my-media-${locale}-${info.project.name}.png`,
      fullPage: false,
      animations: 'disabled',
    });
  }
});

test('My Media localizes connected-account recovery messages', async ({
  page,
}) => {
  const translated = baseline
    ? labels.en
    : labels[locale as keyof typeof labels];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public') return route.fulfill({ json: {} });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({ json: { accounts: null, mediaServer: null } });
    return route.fulfill({ json: {} });
  });

  await page.goto('./library');
  await expect(
    page.getByRole('heading', { name: translated.title })
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(translated.loadError);
  await expect(page.getByRole('alert')).toContainText(
    translated.invalidAccounts
  );
});
