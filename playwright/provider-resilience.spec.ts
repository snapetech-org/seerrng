import { expect, test } from '@playwright/test';
import { openAdminNativeRoute } from './helpers/presentation';

test.use({ serviceWorkers: 'block' });

const baseline = process.env.SEERR_PROVIDER_BASELINE === 'true';
for (const width of [1440, 390]) {
  for (const type of ['movies', 'tv'] as const) {
    test(`${type} title sorting preserves layout at ${width}px`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const login = await page
        .context()
        .request.post(`${baseURL}/api/v1/auth/local`, {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        });
      expect(login.status()).toBe(200);
      const sorts: string[] = [];

      await page.route(`**/api/v1/discover/${type}?*`, (route) => {
        const url = new URL(route.request().url());
        sorts.push(url.searchParams.get('sortBy') ?? '');
        return route.fulfill({
          json: {
            page: 1,
            totalPages: 1,
            totalResults: 3,
            results: Array.from({ length: 3 }, (_, i) => ({
              id: 8000 + i,
              mediaType: type === 'tv' ? 'tv' : 'movie',
              title: `Catalog Title ${i + 1}`,
              originalTitle: `Catalog Title ${i + 1}`,
              name: `Catalog Title ${i + 1}`,
              originalName: `Catalog Title ${i + 1}`,
              releaseDate: '2026-01-01',
              firstAirDate: '2026-01-01',
              posterPath: null,
              genreIds: [],
              voteAverage: 7,
              voteCount: 100,
            })),
          },
        });
      });
      await openAdminNativeRoute(page, `/discover/${type}`);
      await expect(
        page.getByText('Catalog Title 1', { exact: true }).first()
      ).toBeVisible();
      const field =
        type === 'movies' || baseline ? 'original_title' : 'original_name';
      const sourceSort = page.getByRole('combobox', {
        name: 'Sort By',
        exact: true,
      });
      const source = (await sourceSort.count()) > 0;
      if (source) await sourceSort.selectOption(`${field}.desc`);
      else {
        await page
          .getByRole('button', { name: 'Sort By', exact: true })
          .click();
        await page.getByRole('button', { name: 'Title', exact: true }).click();
      }
      await expect.poll(() => sorts.at(-1)).toBe(`${field}.desc`);
      if (source) await expect(sourceSort).toHaveValue(`${field}.desc`);
      else
        await expect(
          page.getByRole('button', { name: 'Title', exact: true })
        ).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({
        path: info.outputPath(`${type}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
  test(`TV discovery resumes after one failed page at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page
      .context()
      .request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
    expect(login.status()).toBe(200);
    const calls: number[] = [];
    await page.route('**/api/v1/discover/tv?*', (route) => {
      const num = Number(
        new URL(route.request().url()).searchParams.get('page')
      );
      calls.push(num);
      if (num === 2)
        return route.fulfill({
          status: 503,
          json: { message: 'Fixture provider outage' },
        });
      return route.fulfill({
        json: {
          page: num,
          totalPages: 3,
          totalResults: 3,
          results: [
            {
              id: 8100 + num,
              mediaType: 'tv',
              name: `Recovery Series ${num}`,
              originalName: `Recovery Series ${num}`,
              firstAirDate: '2026-01-01',
              posterPath: null,
              genreIds: [],
              voteAverage: 7,
            },
          ],
        },
      });
    });
    await openAdminNativeRoute(page, '/discover/tv?sortBy=popularity.desc');
    await expect(
      page.getByText('Recovery Series 1', { exact: true }).first()
    ).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
    if (baseline) {
      await expect.poll(() => calls.includes(2)).toBe(true);
      await expect(
        page.getByText('Recovery Series 1', { exact: true }).first()
      ).toBeVisible();
      expect(calls).not.toContain(3);
    } else {
      await expect(
        page.getByText('Recovery Series 3', { exact: true }).first()
      ).toBeVisible();
      // Hydration may revalidate the view once; every fetch gets only one retry.
      expect(calls.filter((n) => n === 2).length).toBeGreaterThanOrEqual(2);
      expect(calls.filter((n) => n === 2).length).toBeLessThanOrEqual(4);
      expect(calls).toContain(3);
    }
  });
}
