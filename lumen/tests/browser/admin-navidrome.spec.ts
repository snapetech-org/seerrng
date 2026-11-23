import { expect, test } from '@playwright/test';

test('Navidrome can connect, reuse a saved password, and disconnect', async ({
  page,
}, info) => {
  const endpoint = '/api/v1/settings/navidrome';
  const tests: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | null = null;
  let staleReadback: Record<string, unknown> | null | undefined;
  let saveCount = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === endpoint + '/test') {
      tests.push(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    if (path !== endpoint) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      if (staleReadback !== undefined) {
        const stale = staleReadback;
        staleReadback = undefined;
        return route.fulfill({ json: stale });
      }
      return route.fulfill({ json: saved });
    }
    if (request.method() === 'DELETE') {
      staleReadback = saved;
      saved = null;
      return route.fulfill({ status: 204 });
    }
    const next = { ...request.postDataJSON(), password: '[REDACTED]' };
    if (saveCount === 0) staleReadback = saved;
    saved = next;
    saveCount++;
    return route.fulfill({ json: next });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Navidrome Settings' }).click();
  await page.getByLabel('Server URL').fill('https://music.internal');
  await page.getByLabel('Username').fill('listener');
  await page.getByLabel('Password').fill('fixture-password');
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Navidrome connection verified.')).toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(
    page.getByText('Navidrome settings saved.', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText('Could not complete the Navidrome action.')
  ).toBeVisible();
  await expect(page.getByLabel('Server URL')).toHaveValue(
    'https://music.internal'
  );
  await page
    .getByText('Could not complete the Navidrome action.')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('save-readback-failure.png') });
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Navidrome settings saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Navidrome connection verified.')).toBeVisible();
  expect(tests[1]).toMatchObject({
    username: 'listener',
    password: '[REDACTED]',
    syncEnabled: true,
  });
  await page.screenshot({
    path: info.outputPath('navidrome.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Disconnect' }).click();
  await expect(
    page.getByText('Navidrome disconnected.', { exact: true })
  ).toHaveCount(0);
  await expect(page.getByLabel('Server URL')).toHaveValue(
    'https://music.internal'
  );
  await page.getByRole('button', { name: 'Confirm Disconnect' }).click();
  await expect(page.getByText('Navidrome disconnected.')).toBeVisible();
  await expect(page.getByLabel('Server URL')).toHaveValue('');
});
