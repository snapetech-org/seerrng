import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('capture the pre-Comics/Manga route at matching responsive viewports', async ({
  page,
}, info) => {
  test.skip(process.env.LUMEN_COMICS_BASELINE !== 'true');
  test.skip(info.project.name !== 'desktop');

  const baselineComic = {
    id: 'al-147500',
    mediaType: 'comic' as const,
    kind: 'manga' as const,
    title: 'Baseline Comic',
    startYear: '2025',
    editions: [],
    editionsResolved: false,
  };

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { defaults: { requestOptions: false } } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'visual baseline', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          comicsEnabled: true,
          enabledMediaCategories: { comic: true },
        },
      });
    if (path === '/discover/comics')
      return route.fulfill({
        json: {
          comicVineConfigured: true,
        },
      });
    if (path === '/discover/comics/landing')
      return route.fulfill({
        json: {
          library: [],
          trending: [],
          newest: [],
          western: [],
          failed: [],
          genres: [],
          publishers: [],
          comicVineConfigured: true,
        },
      });
    if (path === '/discover/comics/browse')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [baselineComic],
        },
      });
    return route.fulfill({ json: {} });
  });

  const widths = [360, 768, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/comics');
    await expect(
      page.getByRole('heading', { name: 'Comics/Manga' })
    ).toBeVisible();
    await expect(page.locator('.comic-grid .comic-card .t')).toHaveText(
      'Baseline Comic'
    );
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: info.outputPath(`comics-baseline-${width}.png`),
      fullPage: true,
    });
  }

  await writeFile(
    info.outputPath('comics-baseline.json'),
    JSON.stringify(
      {
        route: '/comics',
        state:
          'authenticated dark-theme fixture before manga and edition integration',
        baselineSha: process.env.LUMEN_COMICS_BASE_SHA,
        viewports: widths.map((width) => ({ width, height: 800 })),
        result:
          'The main branch renders its Comics/Manga page with one fixture series.',
      },
      null,
      2
    )
  );
});
