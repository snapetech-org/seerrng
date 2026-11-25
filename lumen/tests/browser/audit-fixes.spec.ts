import { expect, test, type Page } from '@playwright/test';

// Detail pages keep their content while a request refreshes them, a temporary /auth/me
// failure is not a sign-out, and 4K-only titles still link to the media server.
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(
  page: Page,
  handle: (path: string, method: string) => Promise<unknown> | unknown
) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice(7);
    const custom = await handle(path, req.method());
    if (custom !== undefined)
      return route.fulfill(custom as Parameters<typeof route.fulfill>[0]);
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'Seerr',
          mediaServerType: 1,
          localLogin: true,
          partialRequestsEnabled: true,
          enabledMediaCategories: {},
        },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions: 32 },
      });
    if (path.endsWith('/recommendations'))
      return route.fulfill({ json: paged([]) });
    return route.fulfill({ json: paged([]) });
  });
}

test('a movie page stays on screen while a new request refreshes it', async ({
  page,
}) => {
  let requested = false;
  await fixtures(page, async (path, method) => {
    if (path === '/request' && method === 'POST') {
      requested = true;
      return { json: { id: 9 } };
    }
    if (path === '/movie/50') {
      if (requested) await new Promise((r) => setTimeout(r, 1500));
      return {
        json: {
          id: 50,
          title: 'Keep Me Visible',
          genres: [],
          releaseDate: '2020-01-01',
          mediaInfo: requested ? { id: 1, status: 2 } : undefined,
        },
      };
    }
  });
  await page.goto('/movie/50');
  await expect(
    page.getByRole('heading', { name: 'Keep Me Visible' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  // while the new answer is on its way the page does not blank out
  await page.waitForTimeout(500); // the refreshed answer is still being held back
  expect(await page.locator('.detail-loading').count()).toBe(0);
  await expect(
    page.getByRole('heading', { name: 'Keep Me Visible' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Requested' })).toBeVisible();
});

test('unticked seasons stay unticked after a request refreshes the show', async ({
  page,
}) => {
  let requested = false;
  await fixtures(page, async (path, method) => {
    if (path === '/request' && method === 'POST') {
      requested = true;
      return { json: { id: 9 } };
    }
    if (path === '/tv/500') {
      if (requested) await new Promise((r) => setTimeout(r, 1000));
      return {
        json: {
          id: 500,
          name: 'Season Keeper',
          genres: [],
          firstAirDate: '2020-01-01',
          seasons: [1, 2, 3].map((n) => ({
            seasonNumber: n,
            name: `Season ${n}`,
            episodeCount: 8,
          })),
          mediaInfo: requested
            ? { id: 2, status: 4, seasons: [{ seasonNumber: 1, status: 2 }] }
            : undefined,
        },
      };
    }
  });
  await page.goto('/tv/500');
  await expect(
    page.getByRole('heading', { name: 'Season Keeper' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const seasons = page.getByRole('group', { name: 'Seasons' });
  await seasons.getByRole('checkbox').first().click();
  await page
    .getByRole('button', { name: 'Request 1 season', exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  await page.waitForTimeout(500); // the refreshed answer is still being held back
  expect(await page.locator('.detail-loading').count()).toBe(0);
  await expect(
    page.getByRole('heading', { name: 'Season Keeper' })
  ).toBeVisible();
  await expect(seasons.getByRole('checkbox').nth(1)).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(seasons.getByRole('checkbox').nth(2)).toHaveAttribute(
    'aria-checked',
    'false'
  );
});

test('a server error on /auth/me shows Retry, not the sign-in page', async ({
  page,
}) => {
  let down = true;
  await fixtures(page, (path) => {
    if (path === '/auth/me' && down)
      return { status: 503, json: { message: 'Unavailable' } };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Can’t reach the server');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  down = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.app')).toBeVisible();
});

test('a 401 on /auth/me still shows sign-in', async ({ page }) => {
  await fixtures(page, (path) => {
    if (path === '/auth/me') return { status: 401, json: {} };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.app')).toHaveCount(0);
});

test('a 4K-only movie links Watch to the 4K copy', async ({ page }) => {
  const url = 'https://app.plex.tv/desktop/#!/server/s/details?key=4k';
  await fixtures(page, (path) => {
    if (path === '/movie/60')
      return {
        json: {
          id: 60,
          title: 'Only In 4K',
          genres: [],
          releaseDate: '2020-01-01',
          mediaInfo: { id: 3, status: 1, status4k: 5, mediaUrl4k: url },
        },
      };
  });
  await page.goto('/movie/60');
  const watch = page.getByRole('link', { name: /Watch on Plex/ });
  await expect(watch).toBeVisible();
  await expect(watch).toHaveAttribute('href', url);
});

test('movie playback actions follow the selected locale', async ({ page }) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_MEDIA_DETAIL_LOCALE ?? ''
  )
    ? (process.env.LUMEN_MEDIA_DETAIL_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_DETAIL_MEDIA_BASELINE === '1';
  const names = {
    en: { hd: 'Watch on Plex', uhd: 'Watch 4K on Plex' },
    fr: { hd: 'Regarder sur Plex', uhd: 'Regarder en 4K sur Plex' },
    ar: { hd: 'شاهد على Plex', uhd: 'شاهد بدقة 4K على Plex' },
  } as const;
  const hd = 'https://app.plex.tv/desktop/#!/server/s/details?key=hd';
  const uhd = 'https://app.plex.tv/desktop/#!/server/s/details?key=uhd';
  await fixtures(page, (path) => {
    if (path === '/user/1/settings/main') return { json: { locale } };
    if (path === '/movie/64')
      return {
        json: {
          id: 64,
          title: 'Playback labels',
          genres: [],
          releaseDate: '2020-01-01',
          mediaInfo: {
            id: 4,
            status: 5,
            status4k: 5,
            mediaUrl: hd,
            mediaUrl4k: uhd,
          },
        },
      };
  });
  const width = page.viewportSize()?.width;
  const captureDir = process.env.LUMEN_DETAIL_MEDIA_CAPTURE_DIR;
  await page.goto('/movie/64');
  const watchHd = page.getByRole('link', {
    name: baseline ? 'Watch on Plex' : names[locale].hd,
    exact: true,
  });
  await expect(watchHd).toHaveAttribute('href', hd);
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({ path: `${captureDir}/${locale}-${width}-hd.png` });
  await page.goto('/movie/64?quality=4k');
  const watchUhd = page.getByRole('link', {
    name: baseline ? 'Watch 4K on Plex' : names[locale].uhd,
    exact: true,
  });
  await expect(watchUhd).toHaveAttribute('href', uhd);
  await expect(page.locator('.dstatus')).toContainText(
    baseline
      ? '4K on Plex'
      : {
          en: '4K on Plex',
          fr: '4K sur Plex',
          ar: 'بدقة 4K على Plex',
        }[locale]
  );
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({ path: `${captureDir}/${locale}-${width}-4k.png` });
});

test('available movie cards localize their media-server quick link', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_MEDIA_DETAIL_LOCALE ?? ''
  )
    ? (process.env.LUMEN_MEDIA_DETAIL_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_DETAIL_MEDIA_BASELINE === '1';
  const label = {
    en: 'Watch on Plex',
    fr: 'Regarder sur Plex',
    ar: 'شاهد على Plex',
  } as const;
  const onServer = {
    en: 'On Plex',
    fr: 'Sur Plex',
    ar: 'على Plex',
  } as const;
  const url = 'https://app.plex.tv/desktop/#!/server/s/details?key=card';
  await fixtures(page, (path) => {
    if (path === '/user/1/settings/main') return { json: { locale } };
    if (path === '/genres/movie' || path === '/discover/genreslider/movie')
      return { json: [] };
    if (path === '/discover/movies' || path === '/discover/trending')
      return {
        json: paged([
          {
            id: 65,
            title: 'Card playback',
            releaseDate: '2020-01-01',
            mediaType: 'movie',
            mediaInfo: { status: 5, mediaUrl: url },
          },
          {
            id: 66,
            title: 'Card library status',
            releaseDate: '2020-01-01',
            mediaType: 'movie',
            mediaInfo: { status: 5 },
          },
        ]),
      };
  });
  await page.goto('/movies');
  const card = page.locator('.poster').filter({ hasText: 'Card playback' });
  await expect(card).toBeVisible();
  await card.hover();
  const play = card.locator('.qbtn.okb');
  await expect(play).toHaveText(baseline ? 'Watch on Plex' : label[locale]);
  await expect(play).toHaveAttribute('href', url);
  const libraryCard = page
    .locator('.poster')
    .filter({ hasText: 'Card library status' });
  await expect(libraryCard).toBeVisible();
  await libraryCard.hover();
  const on = libraryCard.locator('.qbtn.okb');
  await expect(on).toHaveText(baseline ? 'On Plex' : onServer[locale]);
  await expect(on).toHaveAttribute('href', /^\/movie\/66(?:\?|$)/);
  const width = page.viewportSize()?.width;
  const captureDir = process.env.LUMEN_DETAIL_MEDIA_CAPTURE_DIR;
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({
      path: `${captureDir}/${locale}-${width}-card.png`,
    });
});

test('a 4K movie bookmark selects the 4K playback copy', async ({ page }) => {
  const hd = 'https://app.plex.tv/desktop/#!/server/s/details?key=hd';
  const uhd = 'https://app.plex.tv/desktop/#!/server/s/details?key=uhd';
  await fixtures(page, (path) => {
    if (path === '/movie/60' || path === '/movie/61')
      return {
        json: {
          id: Number(path.split('/').at(-1)),
          title: 'Two Copies',
          genres: [],
          mediaInfo: {
            id: 3,
            status: 5,
            status4k: path.endsWith('/60') ? 5 : 1,
            mediaUrl: hd,
            mediaUrl4k: path.endsWith('/60') ? uhd : undefined,
          },
        },
      };
  });
  await page.goto('/movie/60?quality=4k');
  await expect(
    page.getByRole('link', { name: 'Watch 4K on Plex' }).first()
  ).toHaveAttribute('href', uhd);
  await page.goto('/movie/60');
  await expect(
    page.getByRole('link', { name: 'Watch on Plex' }).first()
  ).toHaveAttribute('href', hd);
  await page.goto('/movie/61?quality=4k');
  await expect(page.getByText('4K playback is unavailable.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Watch 4K on Plex' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Watch on Plex' }).first()
  ).toHaveAttribute('href', hd);
});

test('an open 4K movie bookmark refreshes when the requested copy arrives', async ({
  page,
}) => {
  const uhd = 'https://app.plex.tv/desktop/#!/server/s/details?key=uhd';
  let available = false;
  await page.clock.install();
  await fixtures(page, (path) => {
    if (path === '/movie/62')
      return {
        json: {
          id: 62,
          title: 'Pending Copy',
          genres: [],
          mediaInfo: {
            id: 3,
            status: 1,
            status4k: available ? 5 : 3,
            mediaUrl4k: available ? uhd : undefined,
          },
        },
      };
  });
  await page.goto('/movie/62?quality=4k');
  await expect(page.getByText('4K playback is unavailable.')).toBeVisible();
  available = true;
  await page.clock.fastForward(30_100);
  await expect(
    page.getByRole('link', { name: 'Watch 4K on Plex' }).first()
  ).toHaveAttribute('href', uhd);
});

test('a pending 4K refresh removes the cached title when access is revoked', async ({
  page,
}) => {
  let denied = false;
  await page.clock.install();
  await fixtures(page, (path) => {
    if (path !== '/movie/63') return;
    if (denied) return { status: 403, json: { message: 'Access denied.' } };
    return {
      json: {
        id: 63,
        title: 'Restricted Copy',
        genres: [],
        mediaInfo: {
          id: 3,
          status: 5,
          status4k: 3,
          mediaUrl: 'https://app.plex.tv/desktop/#!/server/s/details?key=hd',
        },
      },
    };
  });
  await page.goto('/movie/63?quality=4k');
  const watch = page.getByRole('link', { name: 'Watch on Plex' }).first();
  await expect(watch).toBeVisible();
  denied = true;
  await page.clock.fastForward(30_100);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Access denied.' })
  ).toBeVisible();
  await expect(watch).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Restricted Copy' })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Access denied.' })
  ).toBeVisible();
  await expect(watch).toHaveCount(0);
});

test('the audiobooks page is titled Audiobooks', async ({ page }) => {
  await fixtures(page, (path) => {
    if (path === '/settings/public') return undefined;
  });
  await page.goto('/audiobooks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Audiobooks'
  );
  await page.goto('/books');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Books');
});

test('All search looks in ebooks and audiobooks', async ({ page }) => {
  const formats: string[] = [];
  await fixtures(page, (path) => {
    if (path === '/settings/public')
      return {
        json: {
          applicationTitle: 'Seerr',
          mediaServerType: 1,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      };
    return undefined;
  });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (
      url.pathname.endsWith('/discover/books') &&
      url.searchParams.has('query')
    )
      formats.push(url.searchParams.get('format') || '');
  });
  await page.goto('/search?q=dune');
  await expect.poll(() => formats.sort()).toEqual(['audiobook', 'ebook']);
});
