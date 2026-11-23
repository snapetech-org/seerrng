import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`bundled TV collections preserve confirmed membership at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let member = false;
    const writes: unknown[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Reader', permissions: 32 },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            mediaServerType: 2,
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
            credits: { cast: [], crew: [] },
            mediaInfo: { status: 3, requests: [] },
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
      if (
        path === '/tv/42/media-server-collections/household' &&
        request.method() === 'POST'
      ) {
        const body = request.postDataJSON();
        writes.push(body);
        member = body.member;
      }
      if (
        path === '/tv/42/media-server-collections' ||
        path === '/tv/42/media-server-collections/household'
      )
        return route.fulfill({
          json: {
            serverType: 2,
            available: true,
            collections: [{ id: 'household', name: 'Household', member }],
          },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto('/lumen/tv/42');
    const collections = page.getByTestId('media-server-collections');
    await collections.locator('summary').click();
    await page.getByRole('button', { name: 'Add to Household' }).click();
    await expect(
      page.getByRole('button', { name: 'Remove from Household' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(writes).toEqual([{ member: true, is4k: false }]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
  });
}
