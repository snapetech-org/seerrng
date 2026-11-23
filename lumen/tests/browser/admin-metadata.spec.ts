import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

for (const [locale, labels] of [
  [
    'fr',
    {
      title: 'Fournisseurs de métadonnées',
      tv: 'Fournisseur de métadonnées TV',
      music: 'Métadonnées musicales',
      invalid:
        'Saisissez des valeurs dans les limites ou le format de langue pris en charge.',
    },
  ],
  [
    'ar',
    {
      title: 'موفرو البيانات الوصفية',
      tv: 'موفر بيانات التلفاز',
      music: 'بيانات الموسيقى الوصفية',
      invalid: 'أدخل قيماً ضمن النطاقات أو تنسيق اللغة المدعوم.',
    },
  ],
] as const) {
  test(`metadata settings follow the saved ${locale} locale`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen/, '')
        .slice(7);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/metadatas')
        return route.fulfill({ json: { tv: 'tmdb', anime: 'tmdb' } });
      if (path === '/settings/metadatas/music')
        return route.fulfill({
          json: { maxConcurrentRequests: 2, maxRequestsPerSecond: 10 },
        });
      if (path === '/settings/metadatas/books')
        return route.fulfill({ json: { allowedLanguages: [] } });
      if (path === '/settings/main') return route.fulfill({ json: {} });
      return route.fulfill({ json: {} });
    });
    await page.goto(`${mount}/admin/metadata`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', { name: labels.title, exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(labels.tv)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: labels.music, exact: true })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('metadata sections save independently and expose failed provider checks', async ({
  page,
}, info) => {
  const writes: { path: string; body: unknown }[] = [];
  const base = '/settings/metadatas';
  const music = { maxConcurrentRequests: 2, maxRequestsPerSecond: 10 };
  const settings: Record<string, Record<string, unknown>> = {
    [base]: { tv: 'tmdb', anime: 'tmdb' },
    [`${base}/music`]: music,
    [`${base}/books`]: { allowedLanguages: [] },
  };
  let persistWrites = false;
  let failWriteOnce = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!path.startsWith(base)) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      return route.fulfill({ json: settings[path] });
    }
    const body = request.postDataJSON();
    writes.push({ path, body });
    if (path.endsWith('/test')) {
      return route.fulfill({
        status: 500,
        json: { success: false, tests: { tmdb: 'ok', tvdb: 'failed' } },
      });
    }
    if (failWriteOnce) {
      failWriteOnce = false;
      return route.fulfill({
        status: 503,
        json: { message: 'Metadata service unavailable.' },
      });
    }
    if (persistWrites) Object.assign(settings[path], body);
    return route.fulfill({ json: { ...settings[path], ...body } });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Metadata Providers' }).click();
  const languages = page.getByLabel('Allowed Book Languages');
  const requests = page.getByLabel('Maximum Requests per Second');
  await languages.fill('english');
  await expect(
    page.getByRole('button', { name: 'Save Book Language Restrictions' })
  ).toBeDisabled();
  await requests.fill('25');
  await page.getByRole('button', { name: 'Save Music Metadata' }).click();
  await expect(
    page.getByText('Metadata service unavailable.', { exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('metadata-write-failure.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save Music Metadata' }).click();
  await expect(
    page.getByText('Could not confirm the saved metadata settings.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(requests).toHaveValue('25');
  await page.screenshot({
    path: info.outputPath('metadata-readback-failure.png'),
    fullPage: true,
  });
  persistWrites = true;
  await page.getByRole('button', { name: 'Save Music Metadata' }).click();
  await expect(
    page.getByText('Settings saved.', { exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('metadata-readback-recovered.png'),
    fullPage: true,
  });
  await expect(requests).toHaveValue('25');
  await expect(languages).toHaveValue('english');
  await languages.fill('ENG, fre');
  await page
    .getByRole('button', { name: 'Save Book Language Restrictions' })
    .click();
  await expect(languages).toHaveValue('eng, fre');

  await page.getByLabel('Anime Metadata Provider').selectOption('tvdb');
  await page
    .getByRole('button', { name: 'Test TV and Anime Providers' })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save TV and Anime' }).click();
  await expect(
    page.getByRole('button', { name: 'Save TV and Anime' })
  ).toBeDisabled();
  expect(writes).toEqual([
    { path: base + '/music', body: { ...music, maxRequestsPerSecond: 25 } },
    { path: base + '/music', body: { ...music, maxRequestsPerSecond: 25 } },
    { path: base + '/music', body: { ...music, maxRequestsPerSecond: 25 } },
    { path: base + '/books', body: { allowedLanguages: ['eng', 'fre'] } },
    { path: base + '/test', body: { tmdb: true, tvdb: true } },
    { path: base, body: { tv: 'tmdb', anime: 'tvdb' } },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_METADATA) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('metadata.png'),
      fullPage: true,
    });
  }
});
