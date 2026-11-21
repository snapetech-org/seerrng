import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('system logs follow the saved locale and keep search and copy usable', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_LOGS_LOCALE ?? ''
  )
    ? (process.env.LUMEN_LOGS_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  const copy = {
    en: [
      'System Logs',
      'Search Logs',
      'Severity',
      'Page Size',
      'Search',
      'Copied log message to clipboard.',
    ],
    fr: [
      'Journaux système',
      'Rechercher dans les journaux',
      'Gravité',
      'Taille de page',
      'Rechercher',
      'Message journal copié dans le presse-papiers.',
    ],
    ar: [
      'سجلات النظام',
      'البحث في السجلات',
      'الحدة',
      'حجم الصفحة',
      'بحث',
      'نسخ رسائل السجل.',
    ],
  }[locale];
  const localizedLevels = {
    en: [
      'Debug and above',
      'Info and above',
      'Warnings and errors',
      'Errors only',
    ],
    fr: [
      'Débogage et supérieur',
      'Informations et supérieur',
      'Avertissements et erreurs',
      'Erreurs uniquement',
    ],
    ar: [
      'التصحيح وما فوق',
      'المعلومات وما فوق',
      'التحذيرات والأخطاء',
      'الأخطاء فقط',
    ],
  }[locale];
  const levels = baseline
    ? [
        'Debug and above',
        'Info and above',
        'Warnings and errors',
        'Errors only',
      ]
    : localizedLevels;
  const detailsLabel =
    locale === 'fr'
      ? 'Journal détaillé'
      : locale === 'ar'
        ? 'تفاصيل السجلات'
        : 'Log Details';
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/lumen/,
      ''
    );
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/logs'))
      return route.fulfill({
        json: {
          pageInfo: { pages: 1 },
          results: [
            {
              timestamp: '2026-11-20T00:00:00Z',
              level: 'info',
              label: 'Fixture',
              message: 'Fixture log message',
              data: { sample: true },
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/logs'));
  const labels = baseline
    ? ['System Logs', 'Search Logs', 'Severity', 'Page Size', 'Search']
    : copy.slice(0, 5);
  await expect(
    page.getByRole('heading', { name: labels[0], exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(labels[1], { exact: true })).toBeVisible();
  const severity = page.getByRole('combobox', { name: labels[2], exact: true });
  await expect(severity.locator('option')).toHaveText(levels);
  await expect(
    page.getByRole('combobox', { name: labels[3], exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: labels[4], exact: true }).click();
  await expect(page.getByText('Fixture log message')).toBeVisible();
  await page.getByRole('button', { name: /Copy|Copier|نسخ/ }).click();
  if (!baseline)
    await expect(page.getByText(copy[5], { exact: true })).toBeVisible();
  await page
    .getByText(baseline ? 'Details' : detailsLabel, { exact: true })
    .click();
  await expect(
    page.getByText('{"sample":true}', { exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_LOGS)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_LOGS}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
});
