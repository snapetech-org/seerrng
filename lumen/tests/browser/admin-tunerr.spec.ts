import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

for (const [locale, labels] of [
  [
    'fr',
    {
      title: 'Paramètres Tunerr',
      hostname: 'Nom d’hôte',
      test: 'Tester Deck et le guide',
      section: 'Flux Sportarr',
    },
  ],
  [
    'ar',
    {
      title: 'إعدادات Tunerr',
      hostname: 'اسم المضيف',
      test: 'اختبار Deck والدليل',
      section: 'تغذيات Sportarr',
    },
  ],
] as const) {
  test(`Tunerr settings follow the saved ${locale} locale`, async ({
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
      if (path === '/settings/tunerr/sportarr')
        return route.fulfill({
          json: {
            tunerr: { configured: true, sportsAutomation: 'enabled' },
            sportarr: {
              configured: true,
              reachable: true,
              feeds: { linked: false },
            },
          },
        });
      if (path === '/settings/tunerr')
        return route.fulfill({
          json: {
            enabled: true,
            hostname: 'fixture',
            useSsl: false,
            baseUrl: '',
            deckPort: 48879,
            tunerPort: 5004,
            guideUrl: '',
            guideHours: 72,
            sportarrBaseUrl: '',
            username: 'fixture',
            passwordConfigured: false,
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/admin/tunerr'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', { name: labels.title, exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(labels.hostname)).toHaveValue('fixture');
    await expect(page.getByRole('button', { name: labels.test })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: labels.section, exact: true })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    const captureDir = process.env.LUMEN_TUNERR_CAPTURE_DIR;
    if (captureDir)
      await page.screenshot({
        path: `${captureDir}/${locale}-${page.viewportSize()?.width}.png`,
        fullPage: true,
      });
  });
}

test('Tunerr settings test partial connectivity, preserve saved passwords, and link Sportarr', async ({
  page,
}, info) => {
  let settings = {
    enabled: true,
    hostname: 'fixture-tunerr',
    useSsl: false,
    baseUrl: '',
    deckPort: 48879,
    tunerPort: 5004,
    guideUrl: '',
    guideHours: 72,
    sportarrBaseUrl: '',
    username: 'fixture-user',
    passwordConfigured: true,
    password: '[REDACTED]',
  };
  let saveAttempts = 0;
  let linked = false;
  const actions: { path: string; body: Record<string, unknown> }[] = [];
  const path = '/settings/tunerr';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname.slice(7);
    if (url === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (url === path + '/sportarr')
      return route.fulfill({
        json: {
          tunerr: {
            configured: true,
            sportsAutomation: 'enabled',
            matchedEventCount: 2,
            eventCount: 4,
          },
          sportarr: { configured: true, reachable: true, feeds: { linked } },
        },
      });
    if (url === path + '/sportarr/connect') {
      linked = true;
      return route.fulfill({ json: { linked: true } });
    }
    if (url === path + '/test') {
      actions.push({ path: url, body: request.postDataJSON() });
      return route.fulfill({
        status: 502,
        json: {
          tests: {
            deck: true,
            guide: false,
            missingFeatures: [],
            guideError: 'XMLTV guide is unavailable.',
          },
        },
      });
    }
    if (url === path) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        actions.push({ path: url, body });
        saveAttempts += 1;
        settings = { ...settings, ...body };
      }
      if (request.method() === 'GET' && saveAttempts === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary failure' },
        });
      return route.fulfill({
        json: settings,
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/admin'));
  await page.getByRole('link', { name: 'Open Tunerr Settings' }).click();
  await expect(page.getByLabel('Deck Password')).toHaveValue('');
  await expect(page.getByLabel('Deck Password')).toHaveAttribute(
    'placeholder',
    'Saved'
  );
  const connect = page.getByRole('button', { name: 'Connect Sportarr Feeds' });
  await expect(connect).toBeEnabled();
  await page.getByLabel('Guide Window (Hours)').fill('48');
  await expect(connect).toBeDisabled();
  await page.getByRole('button', { name: 'Test Deck and Guide' }).click();
  await expect(page.getByRole('alert')).toContainText('Deck connected.');
  await expect(page.getByRole('alert')).toContainText(
    'XMLTV guide is unavailable.'
  );
  await page.screenshot({
    path: info.outputPath('tunerr-diagnostics.png'),
    fullPage: true,
  });
  const save = page.getByRole('button', { name: 'Save Changes' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'The server accepted the change, but Lumen could not confirm the saved state. Keep this form open and retry.'
  );
  const captureDir = process.env.LUMEN_TUNERR_CAPTURE_DIR;
  if (captureDir)
    await page.screenshot({
      path: `${captureDir}/readback-failure-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(page.getByLabel('Guide Window (Hours)')).toHaveValue('48');
  await save.click();
  await expect(page.getByText('Tunerr settings saved.')).toBeVisible();
  for (const { body } of actions) {
    expect(body).not.toHaveProperty('password');
    expect(body).toHaveProperty('guideHours', 48);
  }
  await connect.click();
  await expect(
    page.getByRole('button', { name: 'Sync Sportarr Feeds' })
  ).toBeEnabled();
});
