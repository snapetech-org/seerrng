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
    if (path === '/integrations/discovery/mappings/packs')
      return route.fulfill({ json: { packs: [] } });
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

test('shared pack replacement requires acknowledgement and deletion requires confirmation', async ({
  page,
}, info) => {
  const pack = { packId: 'test-pack', name: 'Test Pack', count: 1 };
  const contents = {
    format: 'seerrng.curated-title-matches',
    version: 1,
    packId: pack.packId,
    name: pack.name,
    entries: [{}],
  };
  let packs = [pack];
  const calls: { method: string; body: string | null }[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    const method = request.method();
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({
        json: { trakt: {}, anilist: {}, simkl: {}, mdblist: {} },
      });
    if (path === '/integrations/discovery/mappings/packs') {
      if (method === 'GET') return route.fulfill({ json: { packs } });
      calls.push({ method, body: request.postData() });
      expect(request.headers()['content-type']).toBe('text/plain');
      return route.fulfill({
        json: { total: 1, imported: 0, updated: 1, unchanged: 0, removed: 0 },
      });
    }
    if (path.endsWith('/packs/test-pack')) {
      if (method === 'GET') return route.fulfill({ json: contents });
      calls.push({ method, body: request.postData() });
      packs = [];
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/admin/discovery');
  await expect(page.getByText('Test Pack', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Pack' }).click();
  expect((await downloaded).suggestedFilename()).toMatch(
    /^seerrng-test-pack-.*\.json$/
  );
  await page.getByLabel('Choose Pack File').setInputFiles({
    name: 'pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(contents)),
  });
  const replace = page.getByRole('button', { name: 'Replace Shared Pack' });
  await expect(replace).toBeDisabled();
  if (process.env.LUMEN_CAPTURE_DISCOVERY)
    await page.screenshot({
      path: info.outputPath('packs.png'),
      fullPage: true,
    });
  await page
    .getByLabel('I understand this pack applies to every account.')
    .check();
  await replace.click();
  await expect(page.getByText(/Published Test Pack/)).toBeVisible();
  await page.getByRole('button', { name: 'Delete Pack', exact: true }).click();
  await page.getByRole('button', { name: 'Keep Shared Pack' }).click();
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete Pack', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Shared Pack' }).click();
  await expect(
    page.getByText('No shared packs have been published.')
  ).toBeVisible();
  expect(calls).toEqual([
    { method: 'POST', body: JSON.stringify(contents) },
    { method: 'DELETE', body: null },
  ]);
});

test('automatic blocklist settings preserve stored genres and save only changed fields', async ({
  page,
}) => {
  const writes: unknown[] = [];
  let settings = {
    blocklistedTags: '42',
    blocklistedGenresMovie: '99',
    blocklistedGenresTv: '',
    blocklistedTagsLimit: 50,
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({
        json: { trakt: {}, anilist: {}, simkl: {}, mdblist: {} },
      });
    if (path === '/integrations/discovery/mappings/packs')
      return route.fulfill({ json: { packs: [] } });
    if (path === '/genres/movie')
      return route.fulfill({ json: [{ id: 18, name: 'Drama' }] });
    if (path === '/genres/tv')
      return route.fulfill({ json: [{ id: 10765, name: 'Sci-Fi & Fantasy' }] });
    if (path === '/settings/main') {
      if (request.method() === 'POST') {
        const patch = request.postDataJSON();
        writes.push(patch);
        settings = { ...settings, ...patch };
      }
      return route.fulfill({ json: settings });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/admin/discovery');
  const movies = page.getByLabel('Blocklisted Movie Genres');
  await expect(movies).toHaveValues(['99']);
  await expect(movies.getByRole('option', { name: 'Genre #99' })).toHaveCount(
    1
  );
  const tags = page.getByLabel('Blocklisted TMDB Keyword IDs');
  await tags.fill('42, bad');
  const save = page.getByRole('button', {
    name: 'Save Automatic Blocklist Settings',
  });
  await expect(save).toBeDisabled();
  await tags.fill('42, 73, 42');
  await page.getByLabel('Blocklisted TV Genres').selectOption('10765');
  await page.getByLabel('Limit Pages per Blocklist Tag or Genre').fill('0');
  await save.click();
  await expect(
    page.getByText('Automatic blocklist settings saved.')
  ).toBeVisible();
  expect(writes).toEqual([
    {
      blocklistedTags: '42,73',
      blocklistedGenresTv: '10765',
      blocklistedTagsLimit: 0,
    },
  ]);
  await expect(movies).toHaveValues(['99']);
});
