import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locales = [
  { tag: 'en', fallback: 'Overview unavailable' },
  { tag: 'fr', fallback: 'Aperçu non disponible' },
  { tag: 'ar', fallback: 'لمحة عامة غير متاحة' },
];

for (const locale of locales) {
  test(`movie and TV overview fallback follows ${locale.tag} locale`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^.*\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 32 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: locale.tag } });
      if (path === '/settings/public') return route.fulfill({ json: {} });
      if (path === '/movie/550')
        return route.fulfill({
          json: {
            id: 550,
            title: 'Fixture Film',
            overview: '',
            genres: [],
            runtime: 100,
            originalLanguage: 'en',
            mediaInfo: {},
            credits: { cast: [], crew: [] },
          },
        });
      if (path === '/tv/1396')
        return route.fulfill({
          json: {
            id: 1396,
            name: 'Fixture Series',
            overview: '',
            genres: [],
            seasons: [],
            mediaInfo: {},
            credits: { cast: [], crew: [] },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(`${mount}/movie/550`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Film' })
    ).toBeVisible();
    const captureDir = process.env.LUMEN_OVERVIEW_FALLBACK_CAPTURE_DIR;
    const captureOnly =
      process.env.LUMEN_OVERVIEW_FALLBACK_CAPTURE_ONLY === '1';
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/${locale.tag}-movie-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    if (!captureOnly)
      await expect(
        page.getByText(locale.fallback, { exact: true })
      ).toBeVisible();
    const movieFallbackRight = await page
      .locator('p.ov')
      .evaluate((element) => element.getBoundingClientRect().right);
    expect(movieFallbackRight).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    );

    await page.goto(`${mount}/tv/1396`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Series' })
    ).toBeVisible();
    const overview = page.locator('details.adv').filter({
      has: page.locator('summary', { hasText: /Overview|Synopsis|نظرة عامة/ }),
    });
    if (!captureOnly) await expect(overview).toBeVisible();
    const tvWidthBeforeExpand = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    if (!captureOnly)
      expect(tvWidthBeforeExpand).toBeLessThanOrEqual(
        await page.evaluate(() => document.documentElement.clientWidth)
      );
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/${locale.tag}-tv-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    if (!captureOnly) {
      await overview.locator('summary').click();
      await expect(
        overview.getByText(locale.fallback, { exact: true })
      ).toBeVisible();
      if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
        await page.screenshot({
          path: `${captureDir}/${locale.tag}-tv-open-${info.project.name}.png`,
          fullPage: true,
          animations: 'disabled',
        });
    }
    if (!captureOnly)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(
        await page.evaluate(() => document.documentElement.clientWidth)
      );
  });
}
