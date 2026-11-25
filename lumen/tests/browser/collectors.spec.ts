import { expect, test } from '@playwright/test';

test('music discovery opens trusted collector picks and follows the matched artist', async ({
  page,
}) => {
  const albumId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const artistId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/imageproxy/coverartarchive/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    switch (path) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'test', permissions: 2 },
        });
      case '/settings/public':
        return route.fulfill({
          json: { musicEnabled: true, enabledMediaCategories: { music: true } },
        });
      case '/collectors':
        return route.fulfill({
          json: {
            available: true,
            results: [
              {
                title: 'Fixture Album',
                creator: 'Fixture Artist',
                year: 2000,
                score: 0.87,
                trustedSourceCount: 2,
                lastSeenAt: '2026-11-20T12:00:00.000Z',
                reasons: ['Shared by a followed collector'],
                album: {
                  id: albumId,
                  href: `/music/${albumId}?source=collector`,
                  imageUrl: '/imageproxy/coverartarchive/release/fixture.jpg',
                },
                artistId,
              },
              {
                title: 'Resolved Release',
                creator: 'Resolved Artist',
                year: 1998,
                score: 0.79,
                trustedSourceCount: 3,
                lastSeenAt: '2026-11-18T12:00:00.000Z',
                reasons: ['Matched by title and artist'],
                album: {
                  id: 'catalog-album-42',
                  href: '/music/catalog-album-42?source=resolver',
                },
                artistId: null,
              },
              {
                title: 'Unmatched Mix',
                creator: 'Unknown Artist',
                year: null,
                score: 0.51,
                trustedSourceCount: 2,
                lastSeenAt: '2026-11-19T12:00:00.000Z',
                reasons: ['Shared by another followed collector'],
                album: null,
                artistId: null,
              },
            ],
          },
        });
      case '/collectors/radar':
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({
          artistId,
          artist: 'Fixture Artist',
        });
        return route.fulfill({
          status: 201,
          json: { followId: 42, radar: false },
        });
      default:
        return route.fulfill({ json: { results: [], totalPages: 1 } });
    }
  });
  const captureDirectory = process.env.LUMEN_COLLECTOR_CAPTURE_DIR;
  if (captureDirectory) {
    await page.goto('/music/collectors');
  } else {
    await page.goto('/music');
    await page
      .locator('#view')
      .getByRole('link', { name: 'Collector Picks' })
      .click();
  }
  if (
    captureDirectory &&
    ['desktop', 'iphone'].includes(test.info().project.name)
  ) {
    const { mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(captureDirectory, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: join(
        captureDirectory,
        `collectors-${test.info().project.name}.png`
      ),
      fullPage: true,
    });
    return;
  }
  await expect(
    page.getByRole('heading', { name: 'Collector Picks' })
  ).toBeVisible();
  await expect(
    page.getByText(
      'Releases being shared by collectors you follow. Each one shows why it appeared.'
    )
  ).toBeVisible();
  await expect(
    page.getByText('Shared by 2 trusted collectors').first()
  ).toBeVisible();
  await expect(page.getByText('Shared by a followed collector')).toBeVisible();
  await expect(page.getByText('Not matched to a catalog album')).toBeVisible();
  await expect(
    page
      .locator('.set')
      .filter({ hasText: 'Unmatched Mix' })
      .locator('.nocover')
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Album: Fixture Album' })
  ).toHaveAttribute('href', `/music/${albumId}?source=collector`);
  await expect(
    page.getByRole('link', { name: 'Open Album: Resolved Release' })
  ).toHaveAttribute('href', '/music/catalog-album-42?source=resolver');
  await expect(page.locator('.poster.sq img')).toHaveAttribute(
    'src',
    '/imageproxy/coverartarchive/release/fixture.jpg'
  );
  await page
    .getByRole('button', { name: 'Follow Artist Releases: Fixture Album' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Following: Fixture Album' })
  ).toBeDisabled();
});

test('Collector Picks guides administrators to configure unavailable slskdN', async ({
  page,
}) => {
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Admin', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { musicEnabled: true, enabledMediaCategories: { music: true } },
      });
    if (path === '/collectors')
      return route.fulfill({ json: { available: false, results: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/music/collectors');
  await expect(
    page.getByRole('link', { name: 'Open Soulseek Settings' })
  ).toHaveAttribute('href', '/admin/soulseek');
});

test('Collector Picks keeps Soulseek settings out of non-admin accounts', async ({
  page,
}) => {
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Member', permissions: 0 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { musicEnabled: true, enabledMediaCategories: { music: true } },
      });
    if (path === '/collectors')
      return route.fulfill({ json: { available: false, results: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/music/collectors');
  await expect(
    page.getByRole('link', { name: 'Open Soulseek Settings' })
  ).toHaveCount(0);
});
