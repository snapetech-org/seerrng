import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

for (const mediaType of ['movie', 'tv'] as const) {
  test(`${mediaType} detail can subscribe to and stop availability updates`, async ({
    page,
  }, testInfo) => {
    let subscribed = false;
    const mutations: string[] = [];
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
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: 'en' } });
      if (path === `/${mediaType}/42`)
        return route.fulfill({
          json: {
            id: 42,
            title: 'Fixture Title',
            name: 'Fixture Title',
            overview: 'A fixture.',
            genres: [],
            seasons: [],
            credits: { cast: [], crew: [] },
            mediaInfo: { status: 1, requests: [] },
          },
        });
      if (path === `/user/1/availability-subscriptions/${mediaType}/42`) {
        if (request.method() === 'POST') {
          subscribed = true;
          mutations.push('POST');
        } else if (request.method() === 'DELETE') {
          subscribed = false;
          mutations.push('DELETE');
        }
        return route.fulfill({
          json: { subscribed, canSubscribe: !subscribed },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(`${mount}/${mediaType}/42`);
    const subscribe = page.getByRole('button', {
      name: 'Notify Me When Available',
    });
    await expect(subscribe).toBeVisible();
    if (['desktop', 'iphone'].includes(testInfo.project.name)) {
      await page.screenshot({
        path: testInfo.outputPath(`${mediaType}-availability-subscription.png`),
        fullPage: true,
      });
    }
    await subscribe.click();
    await expect(
      page.getByRole('button', { name: 'Stop Availability Notifications' })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Stop Availability Notifications' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Notify Me When Available' })
    ).toBeVisible();
    expect(mutations).toEqual(['POST', 'DELETE']);
  });
}

test('detail hides availability notifications when no other request can be followed', async ({
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
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/movie/42')
      return route.fulfill({
        json: { id: 42, title: 'Fixture Title', genres: [], credits: {} },
      });
    if (path === '/user/1/availability-subscriptions/movie/42')
      return route.fulfill({
        json: { subscribed: false, canSubscribe: false },
      });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(`${mount}/movie/42`);
  await expect(
    page.getByRole('button', { name: 'Notify Me When Available' })
  ).toHaveCount(0);
});
