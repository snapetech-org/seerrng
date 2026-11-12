import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('capture the pre-Comics/Manga route at matching responsive viewports', async ({
  page,
}, info) => {
  test.skip(process.env.LUMEN_COMICS_BASELINE !== 'true');
  test.skip(info.project.name !== 'desktop');

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
          page: 1,
          totalPages: 1,
          comicVineConfigured: true,
          results: [
            {
              id: 147500,
              title: 'Baseline Comic',
              publisher: 'Example Comics',
              startYear: 2025,
              issueCount: 12,
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  const widths = [360, 768, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/comics');
    await expect(page.getByRole('heading', { name: 'Comics' })).toBeVisible();
    await expect(page.getByText('Baseline Comic')).toBeVisible();
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
          'The main branch renders its existing Comics page with one ComicVine result.',
      },
      null,
      2
    )
  );
});
