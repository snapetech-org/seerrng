import { expect, test } from '@playwright/test';

test('discovery credentials remain write-only and a rejected save can be retried', async ({
  page,
}, info) => {
  const changes: unknown[] = [];
  const configuration = {
    trakt: { configured: true, clientId: 'trakt-id' },
    anilist: { configured: true, clientId: 'anilist-id' },
    simkl: { configured: false, clientId: '' },
    mdblist: { configured: true },
  };

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path !== '/integrations/discovery/configuration')
      return route.fulfill({ json: {} });
    if (request.method() === 'GET')
      return route.fulfill({ json: configuration });
    changes.push(request.postDataJSON());
    if (changes.length === 1)
      return route.fulfill({ status: 400, json: { message: 'Invalid value' } });
    return route.fulfill({
      json: { ...configuration, mdblist: { configured: false } },
    });
  });

  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Discovery Integrations' }).click();
  const secret = page.getByLabel('Client Secret');
  await expect(secret).toHaveValue('');
  await expect(page.getByLabel('API Key')).toHaveValue('');
  if (process.env.LUMEN_CAPTURE_DISCOVERY)
    await page.screenshot({
      path: info.outputPath('discovery.png'),
      fullPage: true,
    });
  await secret.fill('anilist-test-secret');
  await page.getByRole('button', { name: 'Clear MDBList Credentials' }).click();
  const save = page.getByRole('button', { name: 'Save Discovery Credentials' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not save discovery credentials. Try again.'
  );
  await expect(secret).toHaveValue('anilist-test-secret');
  await save.click();
  await expect(page.getByText('Discovery credentials saved.')).toBeVisible();
  await expect(secret).toHaveValue('');
  await expect(save).toBeDisabled();
  expect(changes).toEqual(
    Array.from({ length: 2 }, () => ({
      anilist: { clientSecret: 'anilist-test-secret' },
      mdblist: { apiKey: '' },
    }))
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
