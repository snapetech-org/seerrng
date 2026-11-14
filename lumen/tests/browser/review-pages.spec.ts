import { expect, test, type Page, type Route } from '@playwright/test';

// Review fixes on the pages: 4K for series without admin rights, light download polling,
// safe focus in confirmations, toasts outside the inert app, local dates, games while the
// catalogues are checked, owned audiobooks, comic editions, Not yet paging and retries.
const paged = (results: unknown[], page = 1, totalPages = 1) => ({
  page,
  totalPages,
  totalResults: totalPages * results.length,
  results,
});
type Handler = (
  path: string,
  url: URL,
  route: Route
) => Promise<unknown> | unknown;
type Fulfill = Parameters<Route['fulfill']>[0];

async function fixtures(
  page: Page,
  {
    handle = () => undefined,
    permissions = 2,
    pub = {},
  }: {
    handle?: Handler;
    permissions?: number;
    pub?: Record<string, unknown>;
  } = {}
) {
  const posts: { path: string; body: unknown }[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.slice(7);
    if (req.method() !== 'GET') posts.push({ path, body: req.postDataJSON() });
    const custom = await handle(path, url, route);
    if (custom === 'handled') return;
    if (custom !== undefined) return route.fulfill(custom as Fulfill);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions },
      });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1, ...pub } });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: paged([]) });
  });
  return posts;
}

// ---- A: 4K for series ----
const show = {
  id: 84773,
  name: 'Rings',
  overview: 'Rings.',
  genres: [],
  numberOfSeasons: 2,
  firstAirDate: '2022-09-01',
  seasons: [
    {
      seasonNumber: 1,
      episodeCount: 8,
      name: 'Season 1',
      airDate: '2022-09-01',
    },
    {
      seasonNumber: 2,
      episodeCount: 8,
      name: 'Season 2',
      airDate: '2024-08-29',
    },
  ],
};

test('Request 4K Series without request management can pick 4K on the series page', async ({
  page,
}) => {
  // REQUEST (32) + REQUEST_4K_TV (4096), no admin or manage requests
  const posts = await fixtures(page, {
    permissions: 32 | 4096,
    pub: { series4kEnabled: true, partialRequestsEnabled: true },
    handle: (path) => (path === '/tv/84773' ? { json: show } : undefined),
  });
  await page.goto('/tv/84773');
  const quality = page.getByRole('group', { name: 'Quality' });
  await expect(quality).toBeVisible();
  await expect(page.getByText('Advanced (admins)')).toHaveCount(0);
  await quality.getByRole('button', { name: '4K' }).click();
  await expect(quality.getByRole('button', { name: '4K' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page
    .getByRole('button', { name: 'Entire series', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Request entire series in 4K' })
    .filter({ visible: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({
    path: '/request',
    body: { mediaType: 'tv', mediaId: 84773, seasons: 'all', is4k: true },
  });
});

test('no 4K choice without the permission or with series 4K off', async ({
  page,
}) => {
  await fixtures(page, {
    permissions: 32,
    pub: { series4kEnabled: true },
    handle: (path) => (path === '/tv/84773' ? { json: show } : undefined),
  });
  await page.goto('/tv/84773');
  await expect(page.getByRole('heading', { name: 'Seasons' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Quality' })).toHaveCount(0);
});

// ---- B: polling ----
const downloading = (left: number) => ({
  id: 7,
  type: 'movie',
  status: 2,
  is4k: false,
  createdAt: '2026-11-10T12:00:00.000Z',
  seasons: [],
  requestedBy: { id: 1, displayName: 'fam' },
  media: {
    mediaType: 'movie',
    tmdbId: 700,
    status: 3,
    downloadStatus: [{ size: 100, sizeLeft: left }],
  },
});
const done = (i: number) => ({
  id: 100 + i,
  type: 'movie',
  status: 2,
  is4k: false,
  createdAt: `2026-11-0${1 + (i % 8)}T12:00:00.000Z`,
  seasons: [],
  requestedBy: { id: 1, displayName: 'fam' },
  media: { mediaType: 'movie', tmdbId: 800 + i, status: 5 },
});

for (const everyone of [false, true]) {
  test(`a poll on ${everyone ? 'Everyone' : 'My requests'} asks only for requests in progress`, async ({
    page,
  }) => {
    await page.clock.install();
    let left = 60;
    const calls: string[] = [];
    let lastCall = Date.now();
    await fixtures(page, {
      handle: (path, url) => {
        lastCall = Date.now();
        if (path === '/request/status') return { status: 404, json: {} };
        if (path === '/request/count')
          return { json: { pending: 0, total: 31 } };
        if (path === '/request') {
          calls.push(url.searchParams.get('filter') || '');
          const filter = url.searchParams.get('filter');
          const take = Number(url.searchParams.get('take') || 20);
          const skip = Number(url.searchParams.get('skip') || 0);
          const list =
            filter === 'processing'
              ? [downloading(left)]
              : filter === 'pending'
                ? []
                : [
                    downloading(left),
                    ...Array.from({ length: 30 }, (_, i) => done(i)),
                  ];
          return {
            json: {
              pageInfo: {
                pages: Math.ceil(list.length / take),
                results: list.length,
              },
              results: list.slice(skip, skip + take),
            },
          };
        }
        if (path.startsWith('/movie/'))
          return {
            json: { id: +path.slice(7), title: `Film ${path.slice(7)}` },
          };
      },
    });
    await page.goto(everyone ? '/requests?tab=everyone' : '/requests');
    await expect(page.getByText('Downloading 40%').first()).toBeVisible();
    // let the first load (and its title lookups) settle, then count only what one tick asks for
    await expect.poll(() => Date.now() - lastCall > 700).toBe(true);
    await page.clock.runFor(2_000);
    calls.length = 0;
    left = 20;
    await page.clock.runFor(30_000);
    await expect(page.getByText('Downloading 80%').first()).toBeVisible();
    expect(calls).toEqual(['processing']);
  });
}

// ---- C: confirmations start on the safe choice ----
test('a confirmation focuses Keep it, not the action that cannot be undone', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/me');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Reset to defaults?' });
  await expect(ask.getByRole('button', { name: 'Keep it' })).toBeFocused();
});

// ---- D: toasts are announced while a sheet makes the app inert ----
test('the toast live region sits outside #root', async ({ page }) => {
  await fixtures(page);
  await page.goto('/me');
  const toast = page.locator('.toast[role="status"]');
  await expect(toast).toHaveCount(1);
  expect(await toast.evaluate((e) => !!e.closest('#root'))).toBe(false);
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  expect(
    await page.locator('#root').evaluate((e) => (e as HTMLElement).inert)
  ).toBe(true);
  expect(await toast.evaluate((e) => !!e.closest('[inert]'))).toBe(false);
});

// ---- E: today is the viewer's date, not UTC's ----
test.describe('in the evening west of Greenwich', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('a film out tomorrow is still unreleased, a season out tomorrow premieres', async ({
    page,
  }) => {
    // 23:30 on Nov 13 in New York is already Nov 14 in UTC
    await page.clock.install({ time: new Date('2026-11-14T04:30:00Z') });
    await fixtures(page, {
      permissions: 32,
      handle: (path) => {
        if (path === '/movie/55')
          return {
            json: {
              id: 55,
              title: 'Tomorrow Film',
              genres: [],
              releaseDate: '2026-11-14',
            },
          };
        if (path === '/tv/56')
          return {
            json: {
              ...show,
              id: 56,
              seasons: [
                show.seasons[0],
                { ...show.seasons[1], airDate: '2026-11-14' },
              ],
            },
          };
      },
    });
    await page.goto('/movie/55');
    await expect(
      page
        .getByRole('button', { name: 'Request · downloads on release' })
        .filter({ visible: true })
    ).toBeVisible();
    await page.goto('/tv/56');
    await expect(page.locator('.srow').nth(1)).toContainText(
      'Premieres Nov 14'
    );
  });
});

// ---- F: games while the catalogue checks run ----
test('Games shows placeholders while the catalogues are checked, then an error with Retry', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let fail = true;
  await fixtures(page, {
    pub: { enabledMediaCategories: { game: true }, softwareEnabled: true },
    handle: async (path, url) => {
      if (!path.startsWith('/request/software/catalog/')) return undefined;
      if (url.searchParams.get('limit') === '1') {
        if (fail) {
          await new Promise<void>((resolve) => (release = resolve));
          return { status: 404, json: {} };
        }
        return { json: { results: [] } };
      }
      return {
        json: {
          results: [
            {
              id: '9',
              catalogProvider: 'igdb',
              catalogId: '9',
              title: 'Found Game',
              summary: '',
              coverUrl: '',
              releaseDate: '2026-01-01',
              platforms: [],
              genres: [],
            },
          ],
          nextOffset: null,
        },
      };
    },
  });
  await page.goto('/games');
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  await expect(
    page.locator('[aria-busy="true"][aria-label="Loading"]')
  ).toBeVisible();
  await expect(page.getByText('No games found')).toHaveCount(0);
  await expect.poll(() => !!release).toBe(true);
  fail = false;
  release!();
  await expect(page.getByText('Couldn’t load games')).toBeVisible();
  await expect(page.getByText('No games found')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'Found Game', exact: true })
  ).toBeVisible();
});

// ---- G, N, O, P, S: book page ----
const bookId = 'bookshelf:42:aGM6MTIzNDU'; // Hardcover work 12345
const audioMedia = {
  status: 5,
  availableEbookServiceIds: null,
  availableAudiobookServiceIds: [1],
  audiobookLibraryServiceId: 1,
  audiobookLibraryItemId: 'abs-item',
};
const book = (extra: Record<string, unknown> = {}) => ({
  id: bookId,
  mediaType: 'book',
  title: 'Owned Story',
  author: 'Ada Writer',
  description: 'A story.',
  posterPath: '/cover.jpg',
  ...extra,
});
const edition = (id: string, narrators: string[], extra = {}) => ({
  id,
  format: 'audiobook',
  language: 'en',
  narrators,
  ...extra,
});

test('an owned audiobook without the companion shows the library, not Request', async ({
  page,
}) => {
  await fixtures(page, {
    handle: (path) => {
      if (path.startsWith('/book/'))
        return { json: book({ mediaInfo: audioMedia }) };
      if (path === '/editions/book')
        return { json: { editions: [edition('hc:1', ['Jane Reader'])] } };
    },
  });
  await page.goto(`/book/${encodeURIComponent(bookId)}?f=audio`);
  await expect(page.locator('.nrow').first()).toContainText('Jane Reader');
  await expect(
    page
      .getByRole('button', { name: 'In your library' })
      .filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Request/ })).toHaveCount(0);
});

test('Any English narrator never pins a recording that cannot be pinned', async ({
  page,
}) => {
  const posts = await fixtures(page, {
    handle: (path, url, route) => {
      if (path.startsWith('/book/')) return { json: book() };
      if (path === '/editions/book')
        return {
          json: {
            editions: [
              edition('hc:9', ['Bob Voice'], {
                selected: true,
                requestable: false,
              }),
              edition('hc:2', ['Ann Voice']),
            ],
          },
        };
      if (path === '/request' && route.request().method() === 'POST')
        return { status: 201, json: { id: 1 } };
    },
  });
  await page.goto(`/book/${encodeURIComponent(bookId)}?f=audio`);
  await page.getByRole('radio', { name: /Any English narrator/ }).click();
  await page
    .getByRole('button', { name: 'Request audiobook' })
    .filter({ visible: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body).toMatchObject({
    preferredEditionId: 'hc:2',
    editionPolicy: 'either',
  });
});

test('two quick taps on Request send one book request', async ({ page }) => {
  const posts = await fixtures(page, {
    handle: async (path, url, route) => {
      if (path.startsWith('/book/')) return { json: book({ id: 'OL7W' }) };
      if (path === '/request' && route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 300));
        return { status: 201, json: { id: 1 } };
      }
    },
  });
  await page.goto('/book/OL7W');
  const button = page
    .getByRole('button', { name: 'Request ebook' })
    .filter({ visible: true });
  await expect(button).toBeVisible();
  // both clicks land before React re-renders the button as busy
  await button.evaluate((b) => {
    (b as HTMLButtonElement).click();
    (b as HTMLButtonElement).click();
  });
  await page.waitForTimeout(600);
  expect(posts.filter((p) => p.path === '/request')).toHaveLength(1);
});

test('a book id with a literal % opens instead of crashing', async ({
  page,
}) => {
  await fixtures(page, {
    handle: (path) =>
      path.startsWith('/book/')
        ? { json: book({ id: 'OL%W', title: 'Percent Book' }) }
        : undefined,
  });
  await page.goto('/book/OL%25W');
  await expect(
    page.getByRole('heading', { name: 'Percent Book' })
  ).toBeVisible();
});

test.describe('phones', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test('picking another narrator keeps Listen in Audiobookshelf on a phone', async ({
    page,
  }) => {
    await fixtures(page, {
      handle: (path) => {
        if (path.startsWith('/book/'))
          return { json: book({ mediaInfo: audioMedia }) };
        if (path === '/editions/book')
          return {
            json: {
              // Jane Reader's copy is here, Ann Voice can be added alongside it
              source: 'library',
              supportsAlongside: true,
              editions: [
                edition('hc:1', ['Jane Reader'], {
                  owned: true,
                  selected: true,
                }),
                edition('hc:2', ['Ann Voice']),
              ],
            },
          };
      },
    });
    await page.route('**/lumen-config.json', (r) =>
      r.fulfill({ json: { audiobookshelfUrl: 'https://abs.example.org' } })
    );
    await page.goto(`/book/${encodeURIComponent(bookId)}?f=audio`);
    await page.getByRole('radio', { name: /Ann Voice/ }).click();
    await expect(
      page
        .getByRole('button', { name: /Request another narrator/ })
        .filter({ visible: true })
    ).toBeVisible();
    await expect(
      page
        .getByRole('link', { name: 'Listen in Audiobookshelf' })
        .filter({ visible: true })
    ).toHaveCount(1);
  });
});

// ---- H, L, M, N, R: comics ----
const ed = (id: string, languageName: string, extra = {}) => ({
  id,
  title: 'Blade Saga',
  publisher: `Pub ${id}`,
  language: languageName.slice(0, 2).toLowerCase(),
  languageName,
  startYear: '2020',
  issueCount: 10,
  ...extra,
});
// part of it here and the rest downloading
const owned = {
  status: 3,
  readerUrl: 'https://manga.example.com/library/2/series/41',
  comicProgress: { owned: 3, total: 10 },
  downloadStatus: [{ percent: 50 }],
};
const work = (extra = {}) => ({
  id: 'al-1',
  mediaType: 'comic',
  kind: 'manga',
  title: 'Blade Saga',
  startYear: '2020',
  status: 'ongoing',
  genres: [],
  editions: [
    ed('11', 'English', { recommended: true, mediaInfo: owned }),
    ed('12', 'French'),
  ],
  editionsResolved: true,
  recommendedId: '11',
  mediaInfo: owned,
  mediaEditionId: '11',
  ...extra,
});
const comicPub = {
  comicsEnabled: true,
  enabledMediaCategories: { comic: true },
};

test('an edition not in the library shows its own state, not the owned one', async ({
  page,
}) => {
  await fixtures(page, {
    pub: comicPub,
    handle: (path) => {
      if (path === '/comic/work/al-1') return { json: work() };
      if (path.endsWith('/issues')) return { json: paged([]) };
      if (path.startsWith('/comic/')) return { json: {} };
    },
  });
  await page.goto('/comic/al-1');
  const read = page
    .getByRole('link', { name: 'Read in Kavita' })
    .filter({ visible: true });
  await expect(read).toHaveCount(1);
  await expect(page.locator('.dnote')).toContainText('3 of 10');
  await page.getByRole('radio', { name: /French/ }).click();
  await expect(read).toHaveCount(0);
  await expect(page.locator('.dnote')).toHaveCount(0);
  await expect(page.locator('.progress')).toHaveCount(0);
  await expect(
    page
      .getByRole('button', { name: 'Request · Pub 12, French' })
      .filter({ visible: true })
  ).toBeVisible();
});

test('comic pages that fail offer Retry, volumes included', async ({
  page,
}) => {
  let workFails = true;
  let issuesFail = true;
  await fixtures(page, {
    pub: comicPub,
    handle: (path) => {
      if (path === '/comic/work/al-1')
        return workFails
          ? { status: 500, json: { message: 'boom' } }
          : { json: work() };
      if (path.endsWith('/issues'))
        return issuesFail
          ? { status: 500, json: { message: 'boom' } }
          : { json: paged([{ id: '1', issueNumber: '1', name: 'Vol. 1' }]) };
      if (path.startsWith('/comic/')) return { json: {} };
    },
  });
  await page.goto('/comic/al-1');
  await expect(page.getByText('Couldn’t load this comic')).toBeVisible();
  workFails = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Couldn’t load the volumes')).toBeVisible();
  issuesFail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Vol. 1')).toBeVisible();
});

test('two quick taps on a comic Request send one request', async ({ page }) => {
  const posts = await fixtures(page, {
    pub: comicPub,
    handle: async (path, url, route) => {
      if (path === '/comic/work/al-1')
        return {
          json: work({
            editions: [ed('11', 'English', { recommended: true })],
            mediaInfo: undefined,
            mediaEditionId: undefined,
          }),
        };
      if (path.endsWith('/issues')) return { json: paged([]) };
      if (path === '/request' && route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 300));
        return { status: 201, json: { id: 1 } };
      }
      if (path.startsWith('/comic/')) return { json: {} };
    },
  });
  await page.goto('/comic/al-1');
  const button = page
    .getByRole('button', { name: 'Request manga' })
    .filter({ visible: true });
  await expect(button).toBeVisible();
  await button.evaluate((b) => {
    (b as HTMLButtonElement).click();
    (b as HTMLButtonElement).click();
  });
  await page.waitForTimeout(600);
  expect(posts.filter((p) => p.path === '/request')).toHaveLength(1);
});

const hoverable = (name: string) => name === 'desktop';
const unresolved = {
  ...work(),
  id: 'al-2',
  title: 'Fresh Saga',
  editions: [],
  editionsResolved: false,
  recommendedId: undefined,
  mediaInfo: undefined,
  mediaEditionId: undefined,
};

test('a card quick request checks the looked-up edition first', async ({
  page,
}, info) => {
  test.skip(!hoverable(info.project.name), 'needs a mouse');
  const posts = await fixtures(page, {
    pub: comicPub,
    handle: (path) => {
      if (path === '/discover/comics/browse')
        return { json: paged([unresolved]) };
      if (path === '/discover/comics/landing') return { json: {} };
      // looked up on the tap: its English edition is already complete
      if (path === '/comic/work/al-2')
        return {
          json: {
            ...unresolved,
            editions: [
              ed('21', 'English', {
                recommended: true,
                mediaInfo: { status: 5 },
              }),
            ],
            editionsResolved: true,
            recommendedId: '21',
          },
        };
    },
  });
  await page.goto('/comics?type=manga');
  const card = page.locator('.comic-grid .poster').first();
  await card.hover();
  await card.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Fresh Saga: Complete');
  expect(posts).toEqual([]);
});

test('a card that goes away during its lookup does not navigate', async ({
  page,
}, info) => {
  test.skip(!hoverable(info.project.name), 'needs a mouse');
  let release: (() => void) | undefined;
  await fixtures(page, {
    pub: comicPub,
    handle: async (path) => {
      if (path === '/discover/comics/browse')
        return { json: paged([unresolved]) };
      if (path === '/discover/comics/landing') return { json: {} };
      if (path === '/comic/work/al-2') {
        await new Promise<void>((resolve) => (release = resolve));
        // no edition found: the card would open the edition picker
        return { json: { ...unresolved, editionsResolved: true } };
      }
    },
  });
  await page.goto('/comics?type=manga');
  const card = page.locator('.comic-grid .poster').first();
  await card.hover();
  await card.getByRole('button', { name: 'Request', exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.evaluate(() => {
    history.pushState(null, '', '/me');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/me$/);
  release!();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/me$/);
});

test('a library card’s duplicate page link stays out of Tab order', async ({
  page,
}) => {
  await fixtures(page, {
    pub: comicPub,
    handle: (path) => {
      if (path === '/discover/comics/browse')
        return {
          json: paged([
            work({
              mediaInfo: { status: 4 },
              editions: [ed('11', 'English', { recommended: true })],
            }),
          ]),
        };
      if (path === '/discover/comics/landing') return { json: {} };
    },
  });
  await page.goto('/comics?type=manga');
  const dup = page.locator('.comic-grid .qa a.qbtn.okb');
  await expect(dup).toHaveCount(1);
  await expect(dup).toHaveAttribute('tabindex', '-1');
  await expect(dup).toHaveAttribute('aria-hidden', 'true');
});

// ---- I: Not yet stops after a run of sparse pages ----
test('Not yet asks before reading page after page of owned books', async ({
  page,
}) => {
  const feedPages: number[] = [];
  const owned = {
    status: 5,
    availableEbookServiceIds: [0],
    availableAudiobookServiceIds: null,
  };
  await fixtures(page, {
    pub: {
      booksEnabled: true,
      ebookServiceEnabled: true,
      audiobookServiceEnabled: true,
      enabledMediaCategories: { ebook: true, audiobook: true },
    },
    handle: (path, url) => {
      if (path === '/discover/books') {
        const n = Number(url.searchParams.get('page') || 1);
        feedPages.push(n);
        return {
          json: paged(
            Array.from({ length: 20 }, (_, i) => ({
              id: `bookshelf:0:p${n}b${i}`,
              mediaType: 'book',
              provider: 'bookshelf',
              title: `Book ${n}-${i}`,
              author: 'Someone',
              posterPath: '/c.jpg',
              // one new book a page, the rest already owned
              ...(i ? { mediaInfo: owned } : {}),
            })),
            n,
            50
          ),
        };
      }
      if (path === '/book/library') return { json: paged([]) };
    },
  });
  await page.goto('/books?show=not');
  const more = page.getByRole('button', { name: 'Load more books' });
  await expect(more).toBeVisible();
  await page.waitForTimeout(500);
  const read = new Set(feedPages).size;
  expect(read).toBeLessThanOrEqual(6);
  await expect(page.locator('.grid .poster')).toHaveCount(read);
  await more.click();
  await expect.poll(() => new Set(feedPages).size).toBeGreaterThan(read);
});

// ---- K: the magazine search box follows the address ----
test('the magazine search box follows ?q= on Back and Forward', async ({
  page,
}) => {
  await fixtures(page, {
    pub: { enabledMediaCategories: { magazine: true } },
  });
  await page.goto('/magazines?q=time');
  const box = page.getByPlaceholder('Search magazines…');
  await expect(box).toHaveValue('time');
  await page.evaluate(() => {
    history.pushState(history.state, '', '/magazines?q=news');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(box).toHaveValue('news');
  await page.goBack();
  await expect(box).toHaveValue('time');
});
