import { expect, test, type Page } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

// Phone-pass and audit fixes: whole book covers, author and description, empty narrator list,
// drawn covers on requests, dialog focus handling, confirmations and plain error messages.
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});
const audioId = 'bookshelf:42:aGM6MTIzNDU';

async function fixtures(
  page: Page,
  handle: (path: string, method: string) => Promise<unknown> | unknown = () =>
    undefined,
  permissions = 2
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
          mediaServerType: 1,
          localLogin: true,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions },
      });
    if (path === '/editions/book')
      return route.fulfill({ json: { editions: [] } });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: paged([]) });
  });
}

const bookJson = (extra: object = {}) => ({
  id: audioId,
  mediaType: 'book',
  bookFormat: 'audiobook',
  title: 'Whole Cover Book',
  author: 'Ada Writer',
  description: 'A story about covers.\n\nSecond paragraph.',
  posterPath: '/imageproxy/hardcover/cover.jpg',
  subjects: ['Fantasy'],
  ...extra,
});

const ownRequest = {
  pageInfo: { pages: 1, results: 1 },
  results: [
    {
      id: 5,
      type: 'movie',
      status: 1,
      is4k: false,
      createdAt: '2026-10-28T12:00:00Z',
      seasons: [],
      requestedBy: { id: 1, displayName: 'fam' },
      media: { mediaType: 'movie', tmdbId: 77, status: 3 },
    },
  ],
};

test('book detail shows author, description and the whole cover', async ({
  page,
}) => {
  await fixtures(page, (path) =>
    path.startsWith('/book/') ? { json: bookJson() } : undefined
  );
  // a cover that fails to load is left out, so this one has to load
  await page.route('**/cover.jpg', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
    })
  );
  await page.goto(
    mountedTestAppPath(`/book/${encodeURIComponent(audioId)}?f=audio`)
  );
  await expect(
    page.getByRole('heading', { name: 'Whole Cover Book' })
  ).toBeVisible();
  await expect(page.locator('.dtitle .by')).toHaveText('Ada Writer');
  await expect(page.getByText('A story about covers.')).toBeVisible();
  await expect(page.locator('.dposter img')).toHaveCSS('object-fit', 'contain');
});

test('an audiobook with no recordings does not offer a choice of narrator', async ({
  page,
}) => {
  await fixtures(page, (path) =>
    path.startsWith('/book/') ? { json: bookJson() } : undefined
  );
  await page.goto(
    mountedTestAppPath(`/book/${encodeURIComponent(audioId)}?f=audio`)
  );
  await expect(page.getByRole('heading', { name: 'Narrator' })).toBeVisible();
  await expect(page.getByText('Choose a narrator')).toHaveCount(0);
  await expect(page.getByText('0 English recordings')).toHaveCount(0);
  await expect(page.getByText(/No English recordings/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Request audiobook' }).first()
  ).toBeVisible();
});

test('info panels fill the last row instead of leaving an empty cell', async ({
  page,
}) => {
  await fixtures(page, (path) =>
    path.startsWith('/book/')
      ? {
          json: bookJson({
            firstPublishYear: 2001,
            subjects: ['Fantasy'],
            series: [],
          }),
        }
      : undefined
  );
  await page.goto(
    mountedTestAppPath(`/book/${encodeURIComponent(audioId)}?f=audio`)
  );
  const cells = page.locator('.facts2 > div');
  await expect.poll(() => cells.count()).toBeGreaterThan(1);
  const [a, b] = await Promise.all([
    cells.nth(0).boundingBox(),
    cells.nth(1).boundingBox(),
  ]);
  // adjacent facts share a row and stretch across it, nothing is left over
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  const box = await page.locator('.facts2').boundingBox();
  expect(a!.width + b!.width).toBeGreaterThan(box!.width - 4);

  // an odd count: the final cell takes the whole row
  await page.route('**/api/v1/book/**', (r) =>
    r.fulfill({
      json: bookJson({
        firstPublishYear: 2001,
        subjects: ['Fantasy'],
        series: [{ title: 'Saga', position: '1' }],
      }),
    })
  );
  // the saved answers survive a page load (written when the page goes away): drop them
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('lumen-cache:')) localStorage.removeItem(k);
  });
  await page.goto(
    mountedTestAppPath(`/book/${encodeURIComponent(audioId)}?f=audio&x=1`)
  );
  await expect.poll(() => cells.count()).toBeGreaterThan(1);
  const count = await cells.count();
  const last = await cells.nth(count - 1).boundingBox();
  const all = await page.locator('.facts2').boundingBox();
  if (count % 2 === 1) expect(last!.width).toBeGreaterThan(all!.width - 4);
});

test('a request without artwork gets a drawn cover', async ({ page }) => {
  await fixtures(page, (path) => {
    if (path === '/request') return { json: ownRequest };
    if (path === '/movie/77')
      return { json: { id: 77, title: 'No Poster Movie' } };
  });
  await page.goto(mountedTestAppPath('/requests?tab=all'));
  await expect(page.locator('.rq .art .nocover')).toHaveCount(1);
});

test('request covers reject untrusted artwork and keep valid proxy images', async ({
  page,
}) => {
  const requests = [
    '/imageproxy/coverartarchive/release/valid.jpg',
    'http://art.example/unsafe.jpg',
    '/api/v1/user/settings',
    'https://art.example/approved-cover.svg',
  ];
  await page.route('**/imageproxy/coverartarchive/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>',
    })
  );
  await fixtures(page, (path) => {
    if (path === '/request')
      return {
        json: paged(
          requests.map((_, index) => ({
            ...ownRequest.results[0],
            id: index + 20,
            type: 'music',
            media: { mediaType: 'music', mbId: `album-${index}`, status: 3 },
          }))
        ),
      };
    const index = requests.findIndex((_, i) => path === `/music/album-${i}`);
    if (index >= 0)
      return {
        json: {
          title: `Album ${index}`,
          artist: { name: 'Artist' },
          posterPath: requests[index],
        },
      };
  });
  await page.route(requests[3], (route) => {
    expect(route.request().headers().referer).toBeUndefined();
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>',
    });
  });
  const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
  await page.goto(`${mount}/requests?tab=all`);
  await expect(page.locator('.rq .art img')).toHaveCount(4);
  await expect(page.locator('.rq .art img').first()).toHaveAttribute(
    'src',
    requests[0]
  );
  const external = page.locator(`.rq .art img[src="${requests[3]}"]`);
  await expect(external).toHaveCount(2);
  await expect(external.first()).toHaveAttribute(
    'referrerpolicy',
    'no-referrer'
  );
  await expect(page.locator('.rq .art .nocover')).toHaveCount(2);
});

test('Escape closes the change-request sheet, focus returns and the page does not scroll behind it', async ({
  page,
}) => {
  await fixtures(page, (path) => {
    if (path === '/request') return { json: ownRequest };
    if (path === '/movie/77')
      return { json: { id: 77, title: 'Waiting Film' } };
  });
  await page.goto(mountedTestAppPath('/requests?tab=everyone'));
  const open = page.getByRole('button', { name: 'Change', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  expect(
    await page.locator('#root').evaluate((e) => (e as HTMLElement).inert)
  ).toBe(true);
  // Tab never leaves the dialog
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('.sheet'))
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(
    await page.locator('#root').evaluate((e) => (e as HTMLElement).inert)
  ).toBe(false);
  await expect(open).toBeFocused();
});

test('cancelling your own request asks first', async ({ page }) => {
  let cancelled = false;
  await fixtures(page, (path, method) => {
    if (path === '/request' && method === 'GET') return { json: ownRequest };
    if (path === '/request/5' && method === 'DELETE') {
      cancelled = true;
      return { json: {} };
    }
    if (path === '/movie/77')
      return { json: { id: 77, title: 'Waiting Film' } };
  });
  await page.goto(mountedTestAppPath('/requests?tab=all'));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const ask = page.getByRole('alertdialog', { name: 'Cancel this request?' });
  await expect(ask).toBeVisible();
  expect(cancelled).toBe(false);
  await ask.getByRole('button', { name: 'Keep it' }).click();
  await expect(ask).toHaveCount(0);
  expect(cancelled).toBe(false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await ask.getByRole('button', { name: 'Cancel request' }).click();
  await expect.poll(() => cancelled).toBe(true);
});

test('Reset to defaults asks first', async ({ page }) => {
  await fixtures(page);
  await page.goto(mountedTestAppPath('/me'));
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Reset to defaults?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Keep it' }).click();
  await expect(ask).toHaveCount(0);
});

test('a server error shows a plain message', async ({ page }) => {
  await fixtures(
    page,
    (path, method) => {
      if (path === '/movie/50')
        return { json: { id: 50, title: 'Failing Movie', genres: [] } };
      if (path === '/request' && method === 'POST')
        return { status: 500, json: { message: 'Internal Server Error' } };
    },
    32
  );
  await page.goto(mountedTestAppPath('/movie/50'));
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(
    page.getByRole('status').getByText(/server had a problem/)
  ).toBeVisible();
});

test.describe('touch screens', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test('chips and small buttons have a 44px hit area', async ({ page }) => {
    await fixtures(page);
    await page.goto(mountedTestAppPath('/search'));
    const chip = page.locator('.chip').first();
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
  test('hero buttons, See all, avatar, back and sort have a 44px hit area', async ({
    page,
  }) => {
    const movie = {
      id: 5,
      mediaType: 'movie',
      title: 'Hero Film',
      posterPath: '/p.jpg',
      backdropPath: '/b.jpg',
      releaseDate: '2024-01-01',
      voteAverage: 7,
    };
    await fixtures(page, (path) =>
      /^\/discover\/(trending|movies|tv)$/.test(path)
        ? { json: paged([movie]) }
        : path.startsWith('/discover/genreslider/')
          ? { json: [] }
          : undefined
    );
    await page.goto(mountedTestAppPath('/'));
    const measure = async (sel: string) => {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      const b = (await el.boundingBox())!;
      return Math.min(b.width, b.height);
    };
    expect(await measure('.feat .cap .go')).toBeGreaterThanOrEqual(44);
    expect(await measure('.sec-head a')).toBeGreaterThanOrEqual(44);
    expect(await measure('.ph-only-avatar')).toBeGreaterThanOrEqual(44);
    await page.goto(mountedTestAppPath('/movies'));
    expect(await measure('.sel select')).toBeGreaterThanOrEqual(44);
    await page.goto(mountedTestAppPath('/movie/5'));
    expect(await measure('.dback')).toBeGreaterThanOrEqual(44);
  });
  test('the fact line keeps each dot with the item before it', async ({
    page,
  }) => {
    await fixtures(page, (path) =>
      path === '/movie/5'
        ? {
            json: {
              id: 5,
              title: 'Hero Film',
              releaseDate: '2024-01-01',
              runtime: 100,
              voteAverage: 7,
              genres: [{ id: 1, name: 'Drama' }],
            },
          }
        : undefined
    );
    await page.goto(mountedTestAppPath('/movie/5'));
    const spans = page.locator('.dline span');
    await expect(spans.first()).toBeVisible();
    expect(await spans.count()).toBeGreaterThan(1);
    const marks = await spans.evaluateAll((els) =>
      els.map((e) => [
        getComputedStyle(e, '::before').content,
        getComputedStyle(e, '::after').content,
      ])
    );
    for (const [before] of marks) expect(before).toBe('none');
    expect(marks[0][1]).toContain('·');
    expect(marks[marks.length - 1][1]).toBe('none');
  });
});
