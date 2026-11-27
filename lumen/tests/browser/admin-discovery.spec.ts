import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

test('discovery credentials remain write-only and save retries until persisted state is confirmed', async ({
  page,
}, info) => {
  const changes: unknown[] = [];
  let configuration = {
    trakt: { configured: true, clientId: 'trakt-id' },
    anilist: { configured: true, clientId: 'anilist-id' },
    simkl: { configured: false, clientId: '' },
    mdblist: { configured: true },
  };
  let staleReadback: typeof configuration | undefined;

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
    if (request.method() === 'GET') {
      if (staleReadback) {
        const stale = staleReadback;
        staleReadback = undefined;
        return route.fulfill({ json: stale });
      }
      return route.fulfill({ json: configuration });
    }
    changes.push(request.postDataJSON());
    if (changes.length === 1)
      return route.fulfill({ status: 400, json: { message: 'Invalid value' } });
    const updated = { ...configuration, mdblist: { configured: false } };
    if (changes.length === 2) staleReadback = configuration;
    configuration = updated;
    return route.fulfill({ json: updated });
  });

  await page.goto(testAppPath('/me'));
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
  await page.screenshot({
    path: info.outputPath('discovery-write-failure.png'),
    fullPage: true,
  });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not save discovery credentials. Try again.'
  );
  await expect(secret).toHaveValue('anilist-test-secret');
  await page.screenshot({
    path: info.outputPath('discovery-readback-failure.png'),
    fullPage: true,
  });
  await save.click();
  await expect(page.getByText('Discovery credentials saved.')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('discovery-readback-recovered.png'),
    fullPage: true,
  });
  await expect(secret).toHaveValue('');
  await expect(save).toBeDisabled();
  expect(changes).toEqual(
    Array.from({ length: 3 }, () => ({
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

  await page.goto(testAppPath('/admin/discovery'));
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
    if (path === '/search/keyword') {
      expect(new URL(request.url()).searchParams.get('query')).toBe('magic');
      return route.fulfill({
        json: { results: [{ id: 74, name: 'Stage Magic' }], total_pages: 1 },
      });
    }
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

  await page.goto(testAppPath('/admin/discovery'));
  const movies = page.getByRole('group', { name: 'Blocklisted Movie Genres' });
  const storedGenre = movies.getByRole('checkbox', { name: 'Genre #99' });
  await expect(storedGenre).toHaveCount(1);
  await expect(storedGenre).toBeChecked();
  await expect(
    movies.getByRole('checkbox', { name: 'Drama' })
  ).not.toBeChecked();
  const tags = page.getByRole('textbox', {
    name: 'Blocklisted TMDB Keyword IDs',
  });
  await tags.fill('42, bad');
  const save = page.getByRole('button', {
    name: 'Save Automatic Blocklist Settings',
  });
  await expect(save).toBeDisabled();
  await tags.fill('42, 73, 42');
  const search = page.getByRole('searchbox', {
    name: 'Find Blocklist Keywords',
  });
  await search.fill('magic');
  await search.press('Enter');
  const keyword = page.getByRole('button', { name: 'Stage Magic' });
  await expect(keyword).toHaveAttribute('aria-pressed', 'false');
  await keyword.click();
  await expect(tags).toHaveValue('42,73,74');
  await expect(keyword).toHaveAttribute('aria-pressed', 'true');
  expect(writes).toEqual([]);
  await page
    .getByRole('group', { name: 'Blocklisted TV Genres' })
    .getByRole('checkbox', { name: 'Sci-Fi & Fantasy' })
    .check();
  await page
    .getByRole('spinbutton', { name: 'Limit Pages per Blocklist Tag or Genre' })
    .fill('0');
  await save.click();
  await expect(
    page.getByText('Automatic blocklist settings saved.')
  ).toBeVisible();
  expect(writes).toEqual([
    {
      blocklistedTags: '42,73,74',
      blocklistedGenresTv: '10765',
      blocklistedTagsLimit: 0,
    },
  ]);
  await expect(storedGenre).toBeChecked();
});
