import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { UserType } from '@server/constants/user';
import fixtures from './fixtures/video-metadata.json';

const prepare = async (
  page: Page,
  context: BrowserContext,
  theme: string,
  width: number
) => {
  await page.setViewportSize({ width, height: 900 });
  // Local/Jellyfin users own this watchlist UI; Plex users use Plex instead.
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), userType: UserType.LOCAL },
    });
  });
  await page.request.get('/api/v1/settings/public');
  const token = (await context.cookies()).find(
    (cookie) => cookie.name === 'XSRF-TOKEN'
  )?.value;
  const headers = token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {};
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        headers,
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        headers,
        data: { theme },
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/main', {
        headers,
        data: { locale: 'en', metadataLocale: null, formatRegion: null },
      })
    ).status()
  ).toBe(200);
};

test.use({ serviceWorkers: 'block' });
for (const type of ['movie', 'tv'] as const) {
  for (const theme of ['seerrOrig', 'seerrNGJ']) {
    for (const width of [390, 1440]) {
      test(`${type} metadata retry restores watchlist state ${theme} ${width}`, async ({
        page,
        context,
      }, info) => {
        await prepare(page, context, theme, width);
        let recovered = false;
        let inWatchlist = true;
        let removals = 0;
        let additions = 0;
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(`**/api/v1/${type}/424242`, (route) =>
          route.fulfill(
            recovered
              ? { json: { ...fixtures[type], onUserWatchlist: inWatchlist } }
              : { status: 503, json: { message: 'Isolated metadata outage' } }
          )
        );
        await page.route(`**/api/v1/${type}/424242/**`, (route) =>
          route.fulfill({
            json: route.request().url().includes('ratingscombined')
              ? {}
              : { page: 1, totalPages: 0, totalResults: 0, results: [] },
          })
        );
        await page.route(
          /\/api\/v1\/watchlist\/424242\?mediaType=(movie|tv)$/,
          (route) => {
            expect(route.request().method()).toBe('DELETE');
            removals++;
            if (removals === 1)
              return route.fulfill({
                status: 503,
                json: { message: 'Isolated removal failure' },
              });
            inWatchlist = false;
            return route.fulfill({ status: 204 });
          }
        );
        await page.route('**/api/v1/watchlist', (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          expect(route.request().postDataJSON()).toMatchObject({
            tmdbId: 424242,
            mediaType: type,
          });
          additions++;
          if (additions === 1)
            return route.fulfill({
              status: 503,
              json: { message: 'Isolated addition failure' },
            });
          inWatchlist = true;
          return route.fulfill({ status: 201, json: { id: 424242 } });
        });
        // Keep server-rendered metadata visible while the client refresh fails.
        // This state exposed the detail shell intercepting the Retry action.
        await page.route(`**/_next/data/*/${type}/424242.json*`, (route) =>
          route.fulfill({
            json: { pageProps: { [type]: fixtures[type] }, __N_SSP: true },
          })
        );
        await page.goto('/settings/main');
        await page.evaluate(
          (path) => (window as any).next.router.push(path),
          `/${type}/424242`
        );
        await expect(page).toHaveURL(new RegExp(`/${type}/424242$`));
        const retry = page.getByRole('button', { name: 'Retry', exact: true });
        await expect(retry).toBeVisible();
        await page.screenshot({
          path: info.outputPath('metadata-outage.png'),
          fullPage: true,
        });
        recovered = true;
        await retry.click();
        await expect(
          page
            .getByRole('heading', {
              name: new RegExp(
                `^${type === 'movie' ? fixtures.movie.title : fixtures.tv.name} \\(`
              ),
              level: 1,
            })
            .first()
        ).toBeVisible();
        await expect(retry).toHaveCount(0);
        const remove = page.getByRole('button', {
          name: 'Remove From Watchlist',
          exact: true,
        });
        const add = page.getByRole('button', {
          name: 'Add To Watchlist',
          exact: true,
        });
        await expect(remove).toBeVisible();
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: info.outputPath('metadata-restored.png'),
          fullPage: true,
        });
        await remove.click();
        await expect.poll(() => removals).toBe(1);
        await expect(remove).toBeEnabled();
        await expect(add).toHaveCount(0);
        await remove.click();
        await expect.poll(() => removals).toBe(2);
        await expect(add).toBeVisible();
        await add.click();
        await expect.poll(() => additions).toBe(1);
        await expect(add).toBeEnabled();
        await expect(remove).toHaveCount(0);
        await add.click();
        await expect.poll(() => additions).toBe(2);
        await expect(remove).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        const documentWidth = await page.evaluate(
          () => document.documentElement.scrollWidth
        );
        if (documentWidth > width + 1)
          await info.attach('horizontal-overflow', {
            body: JSON.stringify(
              await page.evaluate(() =>
                [...document.querySelectorAll('body *')]
                  .filter(
                    (el) => el.getBoundingClientRect().right > innerWidth + 1
                  )
                  .slice(0, 25)
                  .map((el) => ({
                    tag: el.tagName,
                    className: el.getAttribute('class'),
                    right: el.getBoundingClientRect().right,
                    position: getComputedStyle(el).position,
                    transform: getComputedStyle(el).transform,
                  }))
              )
            ),
            contentType: 'application/json',
          });
        // Watchlist labels resize their floating tooltip asynchronously.
        // Require the unchanged viewport bound after positioning settles.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width + 1);
        expect(errors).toEqual([]);
        await page.screenshot({
          path: info.outputPath('watchlist-confirmed.png'),
          fullPage: true,
        });
      });
      for (const status of [401, 403, 404]) {
        test(`${type} metadata ${status} remains an access/not-found state ${theme} ${width}`, async ({
          page,
          context,
        }, info) => {
          await prepare(page, context, theme, width);
          await page.route(`**/api/v1/${type}/424242`, (route) =>
            route.fulfill({
              status,
              json: { message: 'Isolated denied or missing metadata' },
            })
          );
          expect((await page.goto(`/${type}/424242`))?.status()).toBe(200);
          await expect(
            page.getByText(new RegExp(`^${status} -`))
          ).toBeVisible();
          await expect(
            page.getByRole('button', { name: 'Retry', exact: true })
          ).toHaveCount(0);
          await expect(
            page.getByRole('button', {
              name: /^(Manage Movie|Manage Series|Add To Watchlist|Remove From Watchlist)$/,
            })
          ).toHaveCount(0);
          await page.screenshot({
            path: info.outputPath(`metadata-${status}.png`),
            fullPage: true,
          });
        });
      }
    }
  }
}
