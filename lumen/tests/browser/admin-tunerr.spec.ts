import { expect, test } from '@playwright/test';

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
        settings = { ...settings, ...body };
      }
      return route.fulfill({ json: settings });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin');
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
