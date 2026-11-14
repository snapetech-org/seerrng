import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// 1x1 PNG for every proxied cover
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const MEDIA = { PENDING: 2, PROCESSING: 3, PARTIAL: 4, AVAILABLE: 5 };
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

type Media = Record<string, unknown> | undefined;
const edition = (
  id: string,
  publisher: string,
  languageName: string,
  issueCount: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  title: 'Chainsaw Man',
  publisher,
  language: languageName.slice(0, 2).toLowerCase(),
  languageName,
  startYear: '2020',
  issueCount,
  posterPath: `https://comicvine.gamespot.com/a/uploads/${id}.jpg`,
  ...extra,
});

// Chainsaw Man: one work, eight editions, Viz's English one recommended
const chainsaw = (mediaInfo?: Media, mediaEditionId?: string) => ({
  id: 'al-105778',
  mediaType: 'comic',
  kind: 'manga',
  title: 'Chainsaw Man',
  anilistId: 105778,
  posterPath:
    'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105778.jpg',
  startYear: '2018',
  publisher: 'Viz',
  issueCount: 21,
  status: 'ongoing',
  genres: ['Action', 'Horror'],
  description: 'Denji has a chainsaw for a head.',
  editions: [
    edition('130799', 'Viz', 'English', 21, { recommended: true }),
    edition('145408', 'Crew', 'Czech', 2),
    edition('167946', 'Crunchyroll SAS', 'French', 21),
    edition('137488', 'Egmont Ehapa Verlag', 'German', 21),
    edition('129821', 'Haksan', 'Korean', 1),
    edition('155485', 'Norma Editorial', 'Spanish', 21, {
      mediaInfo: mediaEditionId === '155485' ? mediaInfo : undefined,
    }),
    edition('117623', 'NXB Trẻ', 'Vietnamese', 11),
    edition('117318', 'Shueisha', 'Japanese', 24),
  ],
  editionsResolved: true,
  recommendedId: '130799',
  mediaInfo,
  mediaEditionId,
});
// a manga straight from AniList: its editions get looked up when asked for
const onePiece = (resolved = false) => ({
  id: 'al-30013',
  mediaType: 'comic',
  kind: 'manga',
  title: 'One Piece',
  anilistId: 30013,
  posterPath: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/op.jpg',
  startYear: '1997',
  status: 'ongoing',
  genres: ['Action', 'Adventure'],
  editions: resolved
    ? [
        {
          id: '25155',
          title: 'One Piece',
          publisher: 'Viz',
          language: 'en',
          languageName: 'English',
          startYear: '2003',
          issueCount: 108,
          recommended: true,
        },
      ]
    : [],
  editionsResolved: resolved,
  recommendedId: resolved ? '25155' : undefined,
});
const oshi = (mediaInfo?: Media) => ({
  id: 'al-117195',
  mediaType: 'comic',
  kind: 'manga',
  title: '[Oshi no Ko]',
  anilistId: 117195,
  posterPath:
    'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx117195.jpg',
  startYear: '2020',
  publisher: 'Yen Press',
  status: 'finished',
  editions: [
    {
      id: '147500',
      title: '[Oshi No Ko]',
      publisher: 'Yen Press',
      language: 'en',
      languageName: 'English',
      startYear: '2023',
      issueCount: 13,
      recommended: true,
      mediaInfo,
    },
  ],
  editionsResolved: true,
  recommendedId: '147500',
  mediaInfo,
  mediaEditionId: mediaInfo ? '147500' : undefined,
});
const saga = (mediaInfo?: Media) => ({
  id: '46568',
  mediaType: 'comic',
  kind: 'comic',
  title: 'Saga',
  posterPath:
    'https://comicvine.gamespot.com/a/uploads/scale_large/10/108995/saga.jpg',
  startYear: '2012',
  publisher: 'Image',
  issueCount: 72,
  editions: [
    {
      id: '46568',
      title: 'Saga',
      publisher: 'Image',
      language: 'en',
      languageName: 'English',
      startYear: '2012',
      issueCount: 72,
      recommended: true,
      mediaInfo,
    },
  ],
  editionsResolved: true,
  recommendedId: '46568',
  mediaInfo,
  mediaEditionId: mediaInfo ? '46568' : undefined,
});

const downloading = {
  id: 1,
  status: MEDIA.PROCESSING,
  comicServiceType: 'backissue',
  downloadStatus: [
    { size: 0, sizeLeft: 0, percent: 62, status: 'downloading' },
  ],
};
const partial = {
  id: 2,
  status: MEDIA.PARTIAL,
  comicServiceType: 'backissue',
  comicProgress: { owned: 9, total: 16 },
  downloadStatus: [],
};
const complete = {
  id: 3,
  status: MEDIA.AVAILABLE,
  comicServiceType: 'backissue',
  comicProgress: { owned: 14, total: 14 },
  downloadStatus: [],
};

// the legacy single-volume answer the Requests page still reads
const oshiVolume = {
  id: '147500',
  provider: 'comicvine',
  mediaType: 'comic',
  title: '[Oshi no Ko]',
  publisher: 'Yen Press',
  startYear: '2023',
  issueCount: 13,
  posterPath:
    'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx117195.jpg',
  manga: true,
  edition: 'en',
  anilistId: 117195,
  label: 'Manga · English edition · Yen Press · 13 vols',
};

async function fixtures(
  page: Page,
  {
    library = [] as unknown[],
    trending = [chainsaw(), onePiece()] as unknown[],
    newest = [oshi()] as unknown[],
    western = [saga()] as unknown[],
    browse = [chainsaw(), onePiece(), oshi()] as unknown[],
    search = [chainsaw(), saga()] as unknown[],
    works = {} as Record<string, unknown>,
    requests = [] as unknown[],
    // this account's own categories, as SeerrNG answers them (undefined = no answer)
    mine = undefined as Record<string, boolean> | undefined,
    permissions = 2,
    config = {} as Record<string, unknown>,
  } = {}
) {
  const requested: unknown[] = [];
  const browsed: string[] = [];
  const searched: string[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: config }));
  await page.route('**/imageproxy/**', (r) =>
    r.fulfill({ body: PNG, contentType: 'image/png' })
  );
  await page.route('**/api/v1/**', (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'reader', permissions },
      });
    if (path === '/user/1/settings/main')
      return r.fulfill({
        json: mine ? { enabledMediaCategories: mine } : {},
      });
    if (path === '/settings/public')
      return r.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          comicsEnabled: true,
          enabledMediaCategories: { comic: true },
        },
      });
    if (path === '/genres/tv') return r.fulfill({ json: [] });
    if (path.startsWith('/discover/tv')) return r.fulfill({ json: paged([]) });
    if (path === '/discover/comics/landing')
      return r.fulfill({
        json: {
          library,
          trending,
          newest,
          western,
          failed: [],
          genres: ['Action', 'Comedy', 'Romance'],
          publishers: ['Marvel', 'DC Comics', 'Image'],
          comicVineConfigured: true,
        },
      });
    if (path === '/discover/comics/browse') {
      browsed.push(url.search);
      return r.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: browse.length,
          results: browse,
        },
      });
    }
    if (path === '/discover/comics') {
      if (url.searchParams.get('query')) searched.push(url.search);
      return r.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: url.searchParams.get('query') ? search.length : 0,
          results: url.searchParams.get('query') ? search : [],
          comicVineConfigured: true,
        },
      });
    }
    if (path.startsWith('/comic/work/')) {
      const key = decodeURIComponent(path.slice('/comic/work/'.length));
      const all = {
        'al-105778': chainsaw(),
        'al-30013': onePiece(true),
        'al-117195': oshi(),
        '46568': saga(),
        '147500': oshi(),
        ...works,
      } as Record<string, unknown>;
      return all[key]
        ? r.fulfill({ json: all[key] })
        : r.fulfill({ status: 404, json: { message: 'Comic not found' } });
    }
    if (path.startsWith('/comic/') && path.endsWith('/issues'))
      return r.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            { id: '1', issueNumber: '1', name: 'Vol. 1' },
            { id: '2', issueNumber: '2', name: 'Vol. 2' },
          ],
        },
      });
    if (path.startsWith('/comic/')) return r.fulfill({ json: oshiVolume });
    if (path === '/search')
      return r.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path === '/request' && r.request().method() === 'POST') {
      requested.push(r.request().postDataJSON());
      return r.fulfill({ status: 201, json: { id: 99 } });
    }
    if (path === '/request')
      return r.fulfill({
        json: {
          pageInfo: { pages: 1, results: requests.length },
          results:
            url.searchParams.get('filter') === 'processing' ? [] : requests,
        },
      });
    return r.fulfill({ json: {} });
  });
  return { requested, browsed, searched };
}

const hoverable = (name: string) =>
  name === 'desktop' || name === 'tablet-mouse';

test('the Comics page opens populated, with no search box of its own', async ({
  page,
}) => {
  await fixtures(page, { library: [oshi(downloading)] });
  await page.goto('/comics');
  await expect(page.locator('h1')).toHaveText('Comics/Manga');
  for (const title of [
    'Your comics & manga',
    'Trending manga',
    'New manga',
    'Western comics',
    'Popular manga',
  ])
    await expect(
      page.locator('.sec-head h2', { hasText: title })
    ).toBeVisible();
  await expect(
    page.locator('section', { hasText: 'Trending manga' }).locator('.poster')
  ).toHaveCount(2);
  await expect(page.locator('.comic-grid .poster')).toHaveCount(3);
  await expect(page.getByText('No comics found')).toHaveCount(0);
  // searching belongs to the top search bar, like Series and Audiobooks
  await expect(page.locator('header.ph input, .extra-q')).toHaveCount(0);
  // covers come through the image proxy
  await expect(
    page.locator('.comic-grid .poster').first().locator('img')
  ).toHaveAttribute(
    'src',
    '/imageproxy/anilist/file/anilistcdn/media/manga/cover/large/bx105778.jpg'
  );
});

test('the side menu calls it Comics/Manga and the top search is scoped to it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the side menu is desktop-only');
  const { searched } = await fixtures(page);
  await page.goto('/comics');
  await expect(
    page.locator('nav.side').getByRole('link', { name: 'Comics/Manga' })
  ).toBeVisible();
  const top = page.locator('#tq');
  await expect(top).toHaveAttribute('placeholder', 'Search comics and manga…');
  await top.fill('chainsaw');
  await top.press('Enter');
  await expect(page).toHaveURL(/\/search\?.*f=comic/);
  await expect(page.locator('.results .poster')).toHaveCount(2);
  expect(searched.some((s) => s.includes('group=works'))).toBe(true);
});

test('global search shows one card per work', async ({ page }) => {
  await fixtures(page);
  await page.goto('/search?q=chainsaw');
  const section = page.locator('section', { hasText: 'Comics & manga' });
  await expect(section.locator('.poster')).toHaveCount(2);
  await expect(section.locator('.poster').first()).toContainText(
    'Chainsaw Man'
  );
  await expect(section.locator('.poster').first().locator('.qm')).toHaveText(
    /8 editions/
  );
  await expect(
    page.getByRole('button', { name: 'Comics/Manga' })
  ).toBeVisible();
});

test('the edition picker defaults to the recommended English edition', async ({
  page,
}) => {
  const { requested } = await fixtures(page);
  await page.goto('/comic/al-105778');
  const rows = page
    .getByRole('radiogroup', { name: 'Editions' })
    .getByRole('radio');
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveAttribute('aria-checked', 'true');
  await expect(rows.first()).toContainText('English');
  await expect(rows.first()).toContainText('Viz');
  await expect(rows.first()).toContainText('Recommended');
  await expect(rows.nth(5)).toContainText('Spanish');
  await expect(rows.nth(5)).toContainText('Norma Editorial');
  await expect(rows.nth(5)).toContainText('21 vols');
  const button = page
    .getByRole('button', { name: 'Request · Viz, English' })
    .filter({ visible: true })
    .first();
  await expect(button).toBeVisible();
  // another edition: the button follows the pick and asks for that volume
  await rows.nth(5).click();
  await expect(rows.nth(5)).toHaveAttribute('aria-checked', 'true');
  await page
    .getByRole('button', { name: 'Request · Norma Editorial, Spanish' })
    .filter({ visible: true })
    .first()
    .click();
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toEqual({ mediaType: 'comic', mediaId: 155485 });
  await expect(rows.nth(5)).toContainText('Requested');
});

test('an edition already in the library shows on the work and in the picker', async ({
  page,
}) => {
  await fixtures(page, {
    works: { 'al-105778': chainsaw(partial, '155485') },
  });
  await page.goto('/comic/al-105778');
  const rows = page
    .getByRole('radiogroup', { name: 'Editions' })
    .getByRole('radio');
  // the owned edition is the one shown
  await expect(rows.nth(5)).toHaveAttribute('aria-checked', 'true');
  await expect(rows.nth(5)).toContainText('9 of 16 in library');
  await expect(page.locator('.facts2')).toContainText('9 of 16');
});

test('hovering a card offers Request and Choose edition', async ({
  page,
}, info) => {
  test.skip(!hoverable(info.project.name), 'needs a mouse');
  const { requested } = await fixtures(page, { browse: [chainsaw()] });
  await page.goto('/comics?type=manga');
  const card = page.locator('.comic-grid .poster').first();
  await card.hover();
  const go = card.getByRole('button', { name: 'Request', exact: true });
  await expect(go).toBeVisible();
  await expect(
    card.getByRole('link', { name: 'Choose edition' })
  ).toHaveAttribute('href', '/comic/al-105778#editions');
  await go.click();
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toEqual({ mediaType: 'comic', mediaId: 130799 });
  await expect(card.locator('.glyph')).toHaveAttribute('title', 'Requested');
});

test('a manga whose editions are not looked up yet is requested in one click', async ({
  page,
}, info) => {
  test.skip(!hoverable(info.project.name), 'needs a mouse');
  const { requested } = await fixtures(page, { browse: [onePiece()] });
  await page.goto('/comics?type=manga');
  const card = page.locator('.comic-grid .poster').first();
  await card.hover();
  await card.getByRole('button', { name: 'Request', exact: true }).click();
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toEqual({ mediaType: 'comic', mediaId: 25155 });
});

test('touch screens get the round request button', async ({ page }, info) => {
  test.skip(hoverable(info.project.name), 'touch only');
  const { requested } = await fixtures(page, { browse: [chainsaw()] });
  await page.goto('/comics?type=manga');
  const card = page.locator('.comic-grid .poster').first();
  const plus = card.getByRole('button', {
    name: 'Request Chainsaw Man (Viz, English)',
  });
  await expect(plus).toBeVisible();
  await plus.tap();
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toEqual({ mediaType: 'comic', mediaId: 130799 });
});

test('cards show requested, downloading, part-owned and complete', async ({
  page,
}) => {
  await fixtures(page, {
    browse: [
      oshi(downloading),
      saga(partial),
      chainsaw(complete, '130799'),
      onePiece(),
    ],
    library: [],
  });
  await page.goto('/comics?type=manga');
  const cards = page.locator('.comic-grid .poster');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0).locator('.glyph')).toHaveAttribute(
    'title',
    'Downloading 62%'
  );
  await expect(cards.nth(0).locator('.bar i')).toHaveAttribute(
    'style',
    /width: 62%/
  );
  await expect(cards.nth(1).locator('.glyph')).toHaveAttribute(
    'title',
    '9 of 16 in library'
  );
  await expect(cards.nth(2).locator('.glyph')).toHaveAttribute(
    'title',
    'Complete'
  );
  await expect(cards.nth(3).locator('.glyph')).toHaveCount(0);
});

test('filters and sort ask for the matching list', async ({ page }) => {
  const { browsed } = await fixtures(page);
  await page.goto('/comics');
  await expect(page.locator('.comic-grid .poster')).toHaveCount(3);
  // a genre narrows to manga
  const picker = page.getByRole('button', { name: /^Genres:/ });
  const genres = page.getByRole('group', { name: 'Genres' });
  await expect(picker).toHaveText('All genres');
  await picker.click();
  await genres.getByRole('button', { name: 'Romance' }).click();
  await expect(page).toHaveURL(/type=manga/);
  await expect(page).toHaveURL(/genre=Romance/);
  await expect
    .poll(() => browsed.at(-1))
    .toMatch(/type=manga.*genre=Romance|genre=Romance.*type=manga/);
  // several genres at once
  await genres.getByRole('button', { name: 'Comedy' }).click();
  await expect.poll(() => browsed.at(-1)).toContain('genre=Romance%2CComedy');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(picker).toHaveText('Romance + 1');
  // the landing rows give way to the filtered grid
  await expect(
    page.locator('.sec-head h2', { hasText: 'Trending manga' })
  ).toHaveCount(0);
  await page.getByLabel('Status').selectOption('finished');
  await expect.poll(() => browsed.at(-1)).toContain('status=finished');
  await page.getByLabel('Sort').selectOption('newest');
  await expect.poll(() => browsed.at(-1)).toContain('sort=newest');
  // Western comics: their own sorts and a publisher filter, no genres
  await page
    .getByRole('group', { name: 'Type' })
    .getByRole('button', { name: 'Comics' })
    .click();
  await expect.poll(() => browsed.at(-1)).toContain('type=comic');
  await expect(picker).toHaveCount(0);
  await page.getByLabel('Publisher').selectOption('Image');
  await expect.poll(() => browsed.at(-1)).toContain('publisher=Image');
  // library state
  await page
    .getByRole('group', { name: 'Library' })
    .getByRole('button', { name: 'In library' })
    .click();
  await expect.poll(() => browsed.at(-1)).toContain('show=library');
  // back to everything
  await page
    .getByRole('group', { name: 'Type' })
    .getByRole('button', { name: 'All' })
    .click();
  await page
    .getByRole('group', { name: 'Library' })
    .getByRole('button', { name: 'All' })
    .click();
  await expect(
    page.locator('.sec-head h2', { hasText: 'Trending manga' })
  ).toBeVisible();
});

const comicRequest = (
  id: number,
  media: Record<string, unknown>,
  currentStatus?: Record<string, unknown>
) => ({
  id,
  type: 'comic',
  status: 2,
  is4k: false,
  createdAt: '2026-11-11T12:00:00Z',
  seasons: [],
  requestedBy: { id: 1, displayName: 'reader' },
  media: {
    mediaType: 'comic',
    tmdbId: 0,
    identifiers: [{ provider: 'comicvine', value: '147500' }],
    ...media,
  },
  ...(currentStatus ? { currentStatus } : {}),
});

test('requests list a manga with its cover, progress and volumes in', async ({
  page,
}) => {
  await fixtures(page, {
    requests: [
      comicRequest(1, downloading, {
        stage: 'downloading',
        percent: 62,
      }),
      comicRequest(2, partial, {
        stage: 'library',
        percent: null,
        message: '9 of 16 in the library. The rest arrive as they are found.',
      }),
      comicRequest(3, complete, { stage: 'available', percent: null }),
    ],
  });
  await page.goto('/requests');
  const rows = page.locator('.rq');
  await expect(rows.first()).toBeVisible();
  const downloadingRow = rows.filter({ hasText: 'Downloading 62%' });
  await expect(downloadingRow).toHaveCount(1);
  await expect(downloadingRow.locator('.bar i')).toHaveAttribute(
    'style',
    /width: 62%/
  );
  await expect(downloadingRow).toContainText('Manga · Yen Press');
  await expect(downloadingRow.locator('img').first()).toHaveAttribute(
    'src',
    /^\/imageproxy\/anilist\//
  );
});

test('a ComicVine link from Requests opens the work page', async ({ page }) => {
  await fixtures(page);
  await page.goto('/comic/147500');
  await expect(page.locator('article.detail h1')).toHaveText('[Oshi no Ko]');
  await expect(page.getByText('Manga, English edition')).toBeVisible();
  await expect(page.locator('.h2', { hasText: 'Volumes' })).toBeVisible();
});

for (const width of [360, 768, 1280]) {
  test(`the Comics pages fit ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height: 800 });
    await fixtures(page, { library: [oshi(downloading), saga(partial)] });
    await page.goto('/series');
    await expect(page.locator('h1')).toHaveText('Series');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: info.outputPath(`series-reference-${width}.png`),
      fullPage: true,
    });
    await page.goto('/comics');
    await expect(page.locator('.comic-grid .poster')).toHaveCount(3);
    await page.screenshot({
      path: info.outputPath(`comics-candidate-${width}.png`),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    for (const card of await page.locator('.comic-grid .poster').all()) {
      const box = await card.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.goto('/comic/al-105778');
    await expect(
      page.getByRole('radiogroup', { name: 'Editions' }).getByRole('radio')
    ).toHaveCount(8);
    const detailOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(detailOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: info.outputPath(`comic-detail-candidate-${width}.png`),
      fullPage: true,
    });
    await writeFile(
      info.outputPath('comics-responsive.json'),
      JSON.stringify(
        {
          candidateSha: process.env.GITHUB_SHA,
          referenceRoute: '/series',
          candidateRoutes: ['/comics', '/comic/al-105778'],
          state:
            'authenticated dark theme with downloading and partial library entries',
          viewport: { width, height: 800 },
          overflow: { comicsPage: overflow, detailPage: detailOverflow },
          screenshots: [
            `series-reference-${width}.png`,
            `comics-candidate-${width}.png`,
            `comic-detail-candidate-${width}.png`,
          ],
        },
        null,
        2
      )
    );
  });
}

test('a user without the comic category has no Comics/Manga anywhere', async ({
  page,
}, info) => {
  const { searched } = await fixtures(page, {
    permissions: 32,
    mine: { comic: false, movie: true, tv: true },
  });
  await page.goto('/search?q=chainsaw');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Comics/Manga' })).toHaveCount(
    0
  );
  await expect(
    page.locator('section', { hasText: 'Comics & manga' })
  ).toHaveCount(0);
  expect(searched).toEqual([]);
  if (info.project.name === 'desktop')
    await expect(
      page.locator('nav.side').getByRole('link', { name: 'Comics/Manga' })
    ).toHaveCount(0);
  await page.goto('/comics');
  await expect(page.getByText('Comics/Manga is turned off')).toBeVisible();
});

test('a user with the comic category sees Comics/Manga, and so does an admin', async ({
  page,
}, info) => {
  await fixtures(page, { permissions: 32, mine: { comic: true } });
  await page.goto('/search?q=chainsaw');
  await expect(
    page.getByRole('button', { name: 'Comics/Manga' })
  ).toBeVisible();
  if (info.project.name === 'desktop')
    await expect(
      page.locator('nav.side').getByRole('link', { name: 'Comics/Manga' })
    ).toBeVisible();
});

// ---- "Read in Kavita" ----
const KAVITA = 'https://manga.example.com/library/2/series/41';
const reading = (media: Record<string, unknown>) => ({
  ...media,
  readerUrl: KAVITA,
});
const readLink = (page: Page) =>
  page.getByRole('link', { name: 'Read in Kavita' }).filter({ visible: true });

test('a complete series opens in Kavita from its main button', async ({
  page,
}) => {
  await fixtures(page, { works: { 'al-117195': oshi(reading(complete)) } });
  await page.goto('/comic/al-117195');
  const read = readLink(page);
  await expect(read).toHaveCount(1);
  await expect(read).toHaveAttribute('href', KAVITA);
  await expect(read).toHaveAttribute('target', '_blank');
  await expect(read).toHaveClass(/btn-primary/);
  await expect(
    page.getByRole('button', { name: 'Complete' }).filter({ visible: true })
  ).toHaveCount(0);
});

test('a part-owned series keeps its state and adds a Kavita link', async ({
  page,
}) => {
  await fixtures(page, { works: { '46568': saga(reading(partial)) } });
  await page.goto('/comic/46568');
  await expect(
    page
      .getByRole('button', { name: '9 of 16 in library' })
      .filter({ visible: true })
  ).toHaveCount(1);
  const read = readLink(page);
  await expect(read).toHaveCount(1);
  await expect(read).toHaveAttribute('href', KAVITA);
  await expect(read).not.toHaveClass(/btn-primary/);
});

test('without a Kavita link there is no read button', async ({ page }) => {
  await fixtures(page, { works: { 'al-117195': oshi(complete) } });
  await page.goto('/comic/al-117195');
  await expect(
    page.getByRole('button', { name: 'Complete' }).filter({ visible: true })
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Read in Kavita' })).toHaveCount(
    0
  );
});

test("Lumen's Kavita address replaces SeerrNG's", async ({ page }) => {
  await fixtures(page, {
    works: { 'al-117195': oshi(reading(complete)) },
    config: { kavitaUrl: 'https://read.example.org/kavita/' },
  });
  await page.goto('/comic/al-117195');
  await expect(readLink(page)).toHaveAttribute(
    'href',
    'https://read.example.org/kavita/library/2/series/41'
  );
});

test('hovering a complete card reads it in Kavita, a part-owned one offers it too', async ({
  page,
}, info) => {
  test.skip(!hoverable(info.project.name), 'needs a mouse');
  await fixtures(page, {
    browse: [
      oshi(reading(complete)),
      saga(reading(partial)),
      chainsaw(complete, '130799'),
    ],
  });
  await page.goto('/comics?type=manga');
  const cards = page.locator('.comic-grid .poster');
  await cards.nth(0).hover();
  await expect(
    cards.nth(0).getByRole('link', { name: 'Read [Oshi no Ko] in Kavita' })
  ).toHaveAttribute('href', KAVITA);
  await cards.nth(1).hover();
  // the same page as the poster's own link, so it's hidden from assistive tech
  await expect(
    cards.nth(1).locator('a.qbtn.okb', { hasText: '9 of 16 in library' })
  ).toBeVisible();
  await expect(
    cards.nth(1).getByRole('link', { name: 'Read Saga in Kavita' })
  ).toHaveAttribute('href', KAVITA);
  await cards.nth(2).hover();
  await expect(
    cards.nth(2).getByRole('link', { name: /in Kavita/ })
  ).toHaveCount(0);
});

for (const width of [360, 768]) {
  test(`the Kavita buttons fit ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height: 800 });
    for (const [id, work] of [
      ['al-117195', oshi(reading(complete))],
      ['46568', saga(reading(partial))],
    ] as const) {
      await fixtures(page, { works: { [id]: work } });
      await page.goto(`/comic/${id}`);
      const read = readLink(page);
      await expect(read).toHaveCount(1);
      const box = await read.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
}
