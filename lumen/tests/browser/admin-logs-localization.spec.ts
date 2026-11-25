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
  const logQueries: string[] = [];
  await page.clock.install();
  const copy = {
    en: [
      'System Logs',
      'Search logs',
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
  const logLocation = {
    en: 'You can also view these logs directly via stdout or in the log file:',
    fr: 'Vous pouvez également consulter ces journaux dans stdout ou dans le fichier :',
    ar: 'يمكنك أيضًا عرض هذه السجلات مباشرةً عبر stdout أو من ملف السجل:',
  }[locale];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  if (process.env.LUMEN_CAPTURE_LOGS) {
    await page.addInitScript(() => {
      localStorage.setItem(
        'lumen-log-display:1',
        JSON.stringify({ level: 'info', take: 25 })
      );
    });
  }
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
    if (path.endsWith('/settings/logs')) {
      logQueries.push(route.request().url());
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
    }
    if (path.endsWith('/status/appdata'))
      return route.fulfill({ json: { appDataPath: '/data/fixture' } });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/logs'));
  const liveRefresh = page.locator('.toolbar input[type="checkbox"]').first();
  if (baseline) await liveRefresh.check();
  else await expect(liveRefresh).toBeChecked();
  const labels = baseline
    ? ['System Logs', 'Search logs', 'Severity', 'Page Size', 'Search']
    : copy.slice(0, 5);
  await expect(
    page.getByRole('heading', { name: labels[0], exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(labels[1], { exact: true })).toBeVisible();
  const severity = page.getByRole('combobox', { name: labels[2], exact: true });
  await expect(severity.locator('option')).toHaveText(levels);
  await expect(severity).toHaveValue(
    process.env.LUMEN_CAPTURE_LOGS ? 'info' : 'debug'
  );
  await expect(
    page.getByRole('combobox', { name: labels[3], exact: true })
  ).toBeVisible();
  const searchInput = page.getByLabel(labels[1], { exact: true });
  await searchInput.fill('Fixture');
  await page.clock.fastForward(300);
  await expect
    .poll(() =>
      logQueries.some(
        (request) => new URL(request).searchParams.get('search') === 'Fixture'
      )
    )
    .toBe(true);
  await searchInput.fill('');
  await page.clock.fastForward(300);
  await page.getByRole('button', { name: labels[4], exact: true }).click();
  await expect(page.getByText('Fixture log message')).toBeVisible();
  const expectedTimestamp = await page.evaluate(
    ({ locale, timestamp }) =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      }).format(new Date(timestamp)),
    { locale, timestamp: '2026-11-20T00:00:00Z' }
  );
  const logRow = page
    .locator('.set')
    .filter({ hasText: 'Fixture log message' });
  await expect(logRow).toContainText(
    baseline ? '2026-11-20T00:00:00Z' : expectedTimestamp
  );
  await expect(logRow).toContainText(baseline ? 'info' : 'INFO');
  if (!baseline) {
    await expect(page.getByText(logLocation, { exact: false })).toBeVisible();
    await expect(page.getByText('/data/fixture/logs/seerr.log')).toBeVisible();
  }
  await page.getByRole('button', { name: /Copy|Copier|نسخ/ }).click();
  if (!baseline)
    await expect(page.getByText(copy[5], { exact: true })).toBeVisible();
  const requestsBeforeRefresh = logQueries.length;
  await page.clock.fastForward(5000);
  await expect
    .poll(() => logQueries.length)
    .toBeGreaterThan(requestsBeforeRefresh);
  await page.getByText(detailsLabel, { exact: true }).click();
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
  if (process.env.LUMEN_CAPTURE_LOGS) {
    await liveRefresh.uncheck();
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_LOGS}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  }
});

test('empty severity results can return to all logs and reset paging', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'lumen-log-display:1',
      JSON.stringify({ level: 'warn', take: 10 })
    );
  });
  const requests: URL[] = [];
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale: 'en' } });
    if (path.endsWith('/settings/logs')) {
      requests.push(url);
      return route.fulfill({
        json:
          url.searchParams.get('filter') === 'warn'
            ? { pageInfo: { pages: 0 }, results: [] }
            : {
                pageInfo: { pages: 1 },
                results: [
                  {
                    timestamp: '2026-11-20T00:00:00Z',
                    level: 'debug',
                    label: 'Fixture',
                    message: 'Visible after filter recovery',
                  },
                ],
              },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/logs?page=4'));
  await expect(page.getByText('No logs match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Show All Logs' }).click();
  await expect(page.getByText('Visible after filter recovery')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/logs$/);
  expect(requests.at(-1)?.searchParams.get('filter')).toBe('debug');
  expect(requests.at(-1)?.searchParams.get('skip')).toBe('0');
});

test('debounced log search resets the bookmarked page without submission', async ({
  page,
}) => {
  const requests: URL[] = [];
  await page.clock.install();
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale: 'en' } });
    if (path.endsWith('/settings/logs')) {
      requests.push(url);
      return route.fulfill({
        json: {
          pageInfo: { pages: 4 },
          results: [
            {
              timestamp: '2026-11-20T00:00:00Z',
              level: 'error',
              message: 'Fixture error log',
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/logs?page=3'));
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.at(-1)?.searchParams.get('skip')).toBe('50');
  await page.getByLabel('Search logs', { exact: true }).fill('error');
  await page.clock.fastForward(300);
  await expect
    .poll(() =>
      requests.find((request) => request.searchParams.get('search') === 'error')
    )
    .toBeTruthy();
  expect(requests.at(-1)?.searchParams.get('skip')).toBe('0');
  await expect(page).toHaveURL(/\/admin\/logs$/);
});
