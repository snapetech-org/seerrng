import type { TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

for (const [count, expected] of [
  [0, 'Episode Queue · off · managed by admin'],
  [1, 'Episode Queue · 1 episode set by admin'],
  [4, 'Episode Queue · 4 episodes set by admin'],
] as const) {
  test(`TV detail shows the signed-in user's Episode Queue default (${count})`, async ({
    page,
  }, testInfo: TestInfo) => {
    const paths: string[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
      paths.push(path);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 17, displayName: 'Reader' } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/user/17/settings/main')
        return route.fulfill({ json: { locale: 'en' } });
      if (path === '/user/17/settings/episode-queue')
        return route.fulfill({
          json: {
            status: count ? 'approved' : 'off',
            defaultEpisodeCount: count,
          },
        });
      if (path === '/tv/42')
        return route.fulfill({
          json: {
            id: 42,
            name: 'Fixture Series',
            genres: [],
            seasons: [],
            mediaInfo: { status: 3, requests: [] },
            credits: { cast: [], crew: [] },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(`${mount}/tv/42`);
    await expect(page.getByText(expected, { exact: true })).toBeVisible();
    if (count === 4 && ['desktop', 'iphone'].includes(testInfo.project.name)) {
      await page.screenshot({
        path: testInfo.outputPath('tv-episode-queue-default.png'),
        fullPage: true,
      });
    }
    expect(paths).toContain('/user/17/settings/episode-queue');
  });
}

test('TV detail does not request Episode Queue settings when signed out', async ({
  page,
}) => {
  const paths: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    paths.push(path);
    if (path === '/auth/me') return route.fulfill({ json: null });
    if (path === '/settings/public')
      return route.fulfill({ json: { initialized: true } });
    if (path === '/tv/42')
      return route.fulfill({
        json: {
          id: 42,
          name: 'Fixture Series',
          genres: [],
          seasons: [],
          mediaInfo: { status: 3, requests: [] },
          credits: { cast: [], crew: [] },
        },
      });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(`${mount}/tv/42`);
  await expect(page.getByText(/Episode Queue ·/)).toHaveCount(0);
  expect(paths.some((path) => path.includes('/settings/episode-queue'))).toBe(
    false
  );
});
