import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`bundled movie availability action follows server state at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let subscribed = false;
    const methods: string[] = [];
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
        return route.fulfill({ json: { initialized: true } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: 'en' } });
      if (path === '/movie/42')
        return route.fulfill({
          json: {
            id: 42,
            title: 'Fixture Title',
            overview: 'A fixture.',
            genres: [],
            credits: { cast: [], crew: [] },
            mediaInfo: { status: 1, requests: [] },
          },
        });
      if (path === '/user/1/availability-subscriptions/movie/42') {
        if (request.method() !== 'GET') {
          methods.push(request.method());
          subscribed = request.method() === 'POST';
        }
        return route.fulfill({
          json: { subscribed, canSubscribe: !subscribed },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto('/lumen/movie/42');
    await page
      .getByRole('button', { name: 'Notify Me When Available' })
      .click();
    const stop = page.getByRole('button', {
      name: 'Stop Availability Notifications',
    });
    await expect(stop).toHaveAttribute('aria-pressed', 'true');
    await stop.click();
    await expect(
      page.getByRole('button', { name: 'Notify Me When Available' })
    ).toBeVisible();
    expect(methods).toEqual(['POST', 'DELETE']);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
  });
}
