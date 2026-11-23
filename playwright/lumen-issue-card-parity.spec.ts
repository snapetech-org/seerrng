import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`bundled Lumen issue cards work at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/imageproxy/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="96"><rect width="64" height="96" fill="#30405c"/></svg>',
      })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, permissions: 4194304, settings: { locale: 'en' } },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            enabledMediaCategories: { movie: true, tv: true },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: {
            locale: 'en',
            enabledMediaCategories: { movie: true, tv: true },
          },
        });
      if (path === '/issue')
        return route.fulfill({
          json: {
            results: [
              {
                id: 7,
                status: 1,
                issueType: 1,
                media: { mediaType: 'tv', tmdbId: 123 },
                createdAt: '2026-11-12T00:00:00Z',
                createdBy: { id: 2, displayName: 'Reporter' },
                problemEpisodeSelections: [
                  { seasonNumber: 2, episodeNumbers: [4, 5] },
                ],
                comments: [{ id: 9, message: 'Playback freezes' }],
              },
            ],
            pageInfo: { page: 1, pages: 1 },
          },
        });
      if (path === '/tv/123')
        return route.fulfill({
          json: {
            mediaType: 'tv',
            title: 'Test Series',
            firstAirDate: '2005-09-13',
            episodeRunTime: [42],
            posterPath: '/poster.jpg',
          },
        });
      if (path === '/user/1/quota') return route.fulfill({ json: {} });
      if (path === '/user/1/settings/notifications')
        return route.fulfill({ json: {} });
      if (path.startsWith('/blocklist/'))
        return route.fulfill({
          status: 404,
          json: { message: 'Not blocklisted' },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto('/lumen/issues');
    await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();
    const card = page
      .getByRole('listitem')
      .filter({ hasText: 'Playback freezes' });
    await expect(
      card.getByRole('link', { name: 'Test Series (2005)' })
    ).toHaveAttribute('href', '/lumen/tv/123');
    await expect(card.getByText('42 min')).toBeVisible();
    await expect(card.getByText('Affected Seasons:')).toBeVisible();
    await expect(card.getByText('Not available')).toBeVisible();
    await expect(
      card.getByRole('link', { name: 'View Details' })
    ).toHaveAttribute('href', '/lumen/issues/7');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);

    if (viewport.width < 1040) {
      const disclosure = card.getByRole('button', { name: 'View Discussion' });
      await disclosure.scrollIntoViewIfNeeded();
      const buttonBox = await disclosure.boundingBox();
      const tabbarBox = await page.locator('.tabbar').boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(tabbarBox).not.toBeNull();
      expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(
        tabbarBox!.y
      );
    }
  });
}
