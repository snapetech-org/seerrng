import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_REQUESTS_MORE_LOCALE ?? ''
)
  ? (process.env.LUMEN_REQUESTS_MORE_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';
const copy = {
  en: { showMore: 'Show more', loading: 'Loading…' },
  fr: { showMore: 'Afficher plus', loading: 'Chargement…' },
  ar: { showMore: 'عرض المزيد', loading: 'جارٍ التحميل…' },
} as const;
const baseline = process.env.LUMEN_REQUESTS_MORE_BASELINE === '1';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

test(`request paging follows the saved ${locale} locale`, async ({
  page,
}, info) => {
  const all = Array.from({ length: 32 }, (_, index) => ({
    id: index + 1,
    type: 'movie',
    status: 2,
    is4k: false,
    createdAt: new Date(
      Date.UTC(2026, 10, 8, 12) - index * 60_000
    ).toISOString(),
    requestedBy: { id: 2, displayName: 'Requester' },
    media: { mediaType: 'movie', tmdbId: 1000 + index, status: 5 },
  }));
  let nextPageResponse = () => Promise.resolve();
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 16384 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/request/status')
      return route.fulfill({
        status: 404,
        json: { message: 'Lifecycle status is not required for this fixture.' },
      });
    if (path === '/request') {
      const take = Number(url.searchParams.get('take') || 15);
      const skip = Number(url.searchParams.get('skip') || 0);
      const list = url.searchParams.get('filter') === 'pending' ? [] : all;
      if (url.searchParams.get('filter') !== 'pending' && take > 20) {
        await new Promise<void>((resolve) => {
          nextPageResponse = () => resolve();
        });
      }
      return route.fulfill({
        json: {
          pageInfo: {
            pages: Math.ceil(list.length / take),
            results: list.length,
          },
          results: list.slice(skip, skip + take),
        },
      });
    }
    if (path.startsWith('/movie/'))
      return route.fulfill({
        json: { id: Number(path.slice(7)), title: `Title ${path.slice(7)}` },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/requests?tab=everyone`);
  await expect(page.locator('.rq').first()).toBeVisible();
  const expected = baseline ? copy.en : copy[locale];
  const showMore = page.getByRole('button', { name: expected.showMore });
  await expect(showMore).toBeVisible();
  const screenshotPath = process.env.LUMEN_REQUESTS_MORE_CAPTURE;
  if (screenshotPath) {
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({
      path: join(
        dirname(screenshotPath),
        `${basename(screenshotPath, '.png')}-${info.project.name}.png`
      ),
      fullPage: true,
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBeTruthy();

  await showMore.click();
  await expect(
    page.getByRole('button', { name: expected.loading })
  ).toBeVisible();
  nextPageResponse();
  await expect(page.locator('.rq')).toHaveCount(32);
  await expect(
    page.getByRole('button', { name: expected.showMore })
  ).toHaveCount(0);
});
