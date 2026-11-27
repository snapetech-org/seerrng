import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

test('Radarr creation tests credentials and assigns a request destination', async ({
  page,
}, info) => {
  const writes: {
    method: string;
    path?: string;
    body?: Record<string, unknown>;
  }[] = [];
  let services: Record<string, unknown>[] = [];
  let staleDeleteReadback: Record<string, unknown>[] | undefined;
  let failNextSave = true;
  let hideNextReadback = true;
  const path = '/api/v1/settings/radarr';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!endpoint.startsWith(path)) return route.fulfill({ json: {} });
    const method = request.method();
    if (method === 'GET') {
      if (staleDeleteReadback) {
        const stale = staleDeleteReadback;
        staleDeleteReadback = undefined;
        return route.fulfill({ json: stale });
      }
      if (services.length && hideNextReadback) {
        hideNextReadback = false;
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: services });
    }
    if (method === 'DELETE') {
      writes.push({ method, path: endpoint });
      staleDeleteReadback = services;
      services = [];
      return route.fulfill({ json: { id: 0 } });
    }
    const body = request.postDataJSON();
    writes.push({ method, path: endpoint, body });
    if (endpoint.endsWith('/test'))
      return route.fulfill({
        json: {
          profiles: [{ id: 2, name: 'HD' }],
          rootFolders: [{ id: 1, path: '/movies' }],
          tags: [{ id: 3, label: 'requested' }],
        },
      });
    if (method === 'POST' && failNextSave) {
      failNextSave = false;
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    }
    const result = { ...body, id: 0, apiKey: '[REDACTED]' };
    services = [result];
    return route.fulfill({ json: result });
  });
  await page.goto(testAppPath('/me'));
  await page.getByRole('link', { name: 'Open Radarr Services' }).click();
  await page.getByRole('button', { name: 'Add Radarr' }).click();
  await page.getByLabel('Service Name').fill('Home Radarr');
  await page.getByLabel('Hostname').fill('radarr.internal');
  await page.getByLabel('API Key').fill('fixture-key');
  const save = page.getByRole('button', { name: 'Save Radarr' });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Test Radarr' }).click();
  await page.getByLabel('Quality Profile').selectOption('2');
  await page.getByLabel('Root Folder').selectOption('/movies');
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not save the Radarr service.'
  );
  if (process.env.LUMEN_CAPTURE_RADARR) {
    await page.screenshot({
      path: info.outputPath('radarr-save-write-error.png'),
    });
  }
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'The server did not confirm the saved Radarr settings.'
  );
  await expect(page.getByLabel('Service Name')).toHaveValue('Home Radarr');
  await expect(
    page.getByRole('button', { name: 'Edit Home Radarr' })
  ).toHaveCount(0);
  if (process.env.LUMEN_CAPTURE_RADARR) {
    await page.screenshot({
      path: info.outputPath('radarr-save-readback-error.png'),
    });
  }
  await save.click();
  await page.getByRole('button', { name: 'Edit Home Radarr' }).click();
  await expect(page.getByLabel('API Key')).toHaveValue('');
  await page.getByLabel('Request Button Label').fill('Home Movies');
  await save.click();
  await page.getByRole('button', { name: 'Edit Home Radarr' }).click();
  if (process.env.LUMEN_CAPTURE_RADARR) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('radarr.png'),
    });
  }
  if (process.env.LUMEN_CAPTURE_RADARR) {
    await page.screenshot({
      path: info.outputPath('radarr-before-removal.png'),
    });
  }
  await page.getByRole('button', { name: 'Remove Service' }).click();
  expect(writes).toHaveLength(5);
  await page.getByRole('button', { name: 'Confirm Removal' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'The server did not confirm removal of this Radarr.' })
  ).toBeVisible();
  if (process.env.LUMEN_CAPTURE_RADARR) {
    await page.screenshot({
      path: info.outputPath('radarr-remove-readback-error.png'),
    });
  }
  await expect(
    page.getByRole('button', { name: 'Edit Home Radarr' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm Removal' }).click();
  await expect(page.getByText('No Radarr services configured.')).toBeVisible();
  expect(writes).toEqual([
    {
      method: 'POST',
      path: `${path}/test`,
      body: expect.objectContaining({
        apiKey: 'fixture-key',
        hostname: 'radarr.internal',
      }),
    },
    {
      method: 'POST',
      path,
      body: expect.objectContaining({
        apiKey: 'fixture-key',
        hostname: 'radarr.internal',
      }),
    },
    {
      method: 'POST',
      path,
      body: expect.objectContaining({
        apiKey: 'fixture-key',
        hostname: 'radarr.internal',
      }),
    },
    {
      method: 'PUT',
      path: `${path}/0`,
      body: expect.objectContaining({
        activeProfileId: 2,
        activeProfileName: 'HD',
        activeDirectory: '/movies',
      }),
    },
    {
      method: 'PUT',
      path: `${path}/0`,
      body: expect.objectContaining({
        apiKey: '[REDACTED]',
        requestButtonLabel: 'Home Movies',
      }),
    },
    { method: 'DELETE', path: `${path}/0` },
    { method: 'DELETE', path: `${path}/0` },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
