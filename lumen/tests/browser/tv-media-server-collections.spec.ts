import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

test('TV detail changes only the selected server collection and confirms state', async ({
  page,
}, testInfo) => {
  let member = false;
  const writes: { path: string; body: unknown }[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 2,
          initialized: true,
          movie4kEnabled: true,
          series4kEnabled: true,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/tv/42')
      return route.fulfill({
        json: {
          id: 42,
          name: 'Fixture Series',
          overview: 'A fixture.',
          genres: [],
          seasons: [],
          mediaInfo: { status: 3, requests: [] },
          credits: { cast: [], crew: [] },
        },
      });
    if (path === '/tv/42/media-server-saved-item')
      return route.fulfill({
        json: {
          serverType: 2,
          kind: 'favorites',
          available: true,
          saved: false,
        },
      });
    if (path === '/tv/42/media-server-collections') {
      if (request.method() === 'POST') {
        writes.push({ path, body: request.postDataJSON() });
        member = request.postDataJSON().member;
      }
      return route.fulfill({
        json: {
          serverType: 2,
          available: true,
          collections: [{ id: 'household', name: 'Household', member }],
        },
      });
    }
    if (path === '/tv/42/media-server-collections/household') {
      writes.push({ path, body: request.postDataJSON() });
      member = request.postDataJSON().member;
      return route.fulfill({
        json: {
          serverType: 2,
          available: true,
          collections: [{ id: 'household', name: 'Household', member }],
        },
      });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(`${mount}/tv/42`);
  await page.getByTestId('tv-media-server').locator('summary').first().click();
  const disclosure = page.getByTestId('media-server-collections');
  await expect(disclosure).toBeVisible();
  await disclosure.locator('summary').click();
  if (['desktop', 'iphone'].includes(testInfo.project.name)) {
    await page.screenshot({
      path: testInfo.outputPath('tv-media-server-collections.png'),
      fullPage: true,
    });
  }
  const add = page.getByRole('button', { name: 'Add to Household' });
  await expect(add).toBeVisible();
  await add.click();
  const remove = page.getByRole('button', { name: 'Remove from Household' });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await remove.click();
  await expect(
    page.getByRole('button', { name: 'Add to Household' })
  ).toBeVisible();
  expect(writes).toEqual([
    {
      path: '/tv/42/media-server-collections/household',
      body: { member: true, is4k: false },
    },
    {
      path: '/tv/42/media-server-collections/household',
      body: { member: false, is4k: false },
    },
  ]);
});

test('TV detail does not offer a partial collection list after a server limit response', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, displayName: 'Reader' } });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/tv/42')
      return route.fulfill({
        json: {
          id: 42,
          name: 'Fixture Series',
          genres: [],
          seasons: [],
          credits: { cast: [], crew: [] },
        },
      });
    if (path === '/tv/42/media-server-collections')
      return route.fulfill({
        json: {
          serverType: 2,
          available: false,
          reason: 'collection-limit',
          collections: [],
        },
      });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(`${mount}/tv/42`);
  await page.getByTestId('tv-media-server').locator('summary').first().click();
  await page.getByTestId('media-server-collections').locator('summary').click();
  await expect(
    page
      .getByRole('status')
      .getByText('The Jellyfin collection list is too large to show safely.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Add to/ })).toHaveCount(0);
});
