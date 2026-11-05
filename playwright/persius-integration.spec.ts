import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Real signed-in pages, theme catalog/CSS and saved account preferences. Only
// external catalog/read data is deterministic; mutation contracts have native
// API/database coverage in interfaceThemes.openapi and request.test.
test.use({ serviceWorkers: 'block' });
const screenshotRoot = process.env.SHOT_DIR ?? 'test-results/persius';
const titles = [
  'Spider-Man: Brand New Day',
  'The Odyssey',
  'Wildwood',
  'Fall 2: Deadpoint',
  'Resident Evil',
  'Insidious: Out of the Further',
  'Matchbox the Movie',
  'The Dog Stars',
  'Hope',
  'Clayface',
  'Buddy',
  'Forgotten Island',
];
const bookTitles = [
  'Fourth Wing',
  'The Martian',
  'Iron Flame',
  'Project Hail Mary',
  'Onyx Storm',
  'The Women',
];
const imageUrl = (index: number) =>
  `https://image.tmdb.org/t/p/w500/persius-fixture-${index}.jpg`;
const media = (id: number, status = 1) => ({
  id,
  tmdbId: id,
  mediaType: 'movie',
  status,
  status4k: 1,
  requests: [],
  seasons: [],
});
const movies = titles.map((title, i) => ({
  id: 100 + i,
  title,
  mediaType: 'movie',
  posterPath: `/persius-fixture-${i}.jpg`,
  backdropPath: `/persius-fixture-${i}.jpg`,
  releaseDate: `2026-12-${String(10 + i).padStart(2, '0')}`,
  genreIds: [28, 12],
  voteAverage: 8.5,
  voteCount: 100,
  popularity: 100,
  adult: false,
  video: false,
  originalLanguage: 'en',
  originalTitle: title,
  overview: 'A journey that changes everything.',
  mediaInfo: media(100 + i, i % 3 === 0 ? 5 : 1),
}));
const movieDetails = (id = 100) => ({
  ...(movies.find((item) => item.id === id) ?? movies[0]),
  id,
  budget: 0,
  revenue: 0,
  runtime: 117,
  genres: [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
  ],
  productionCompanies: [],
  productionCountries: [],
  spokenLanguages: [],
  status: 'Released',
  releases: { results: [] },
  credits: { cast: [], crew: [] },
  externalIds: {},
  keywords: [],
  videos: { results: [] },
});
const books = bookTitles.map((title, i) => ({
  id: `OL${100 + i}W`,
  mediaType: 'book',
  bookFormat: 'ebook',
  title,
  author: [
    'Rebecca Yarros',
    'Andy Weir',
    'Rebecca Yarros',
    'Andy Weir',
    'Rebecca Yarros',
    'Kristin Hannah',
  ][i],
  authorId: `OL${i + 1}A`,
  firstPublishYear: 2023,
  posterPath: imageUrl(12 + i),
  numberOfPages: 632,
  narrators: ['Elizabeth Evans'],
  audiobookDuration: 74880,
  subjects: ['Fantasy'],
  series: [
    {
      id: `series-${i % 3}`,
      title: ['The Empyrean', 'Throne of Glass', 'A Court of Thorns and Roses'][
        i % 3
      ],
    },
  ],
  mediaInfo: { ...media(200 + i), mediaType: 'book' },
  description:
    'A story of loyalty, courage, and a world on the edge of change.',
}));
const narrationBook = {
  ...books[0],
  id: 'OL999W',
  title: 'A Court of Wings and Ruin',
  author: 'Sarah J. Maas',
  firstPublishYear: 2017,
  posterPath: imageUrl(18),
  bookFormat: 'audiobook',
  narrators: ['Elizabeth Evans', 'Amanda Leigh Cobb'],
  audiobookDuration: 90360,
  numberOfPages: 719,
  mediaInfo: {
    ...media(999),
    mediaType: 'book',
    serviceId: 1,
    externalServiceId: 3,
  },
  series: [
    { id: 'acotar', title: 'A Court of Thorns and Roses', position: '3' },
  ],
};
const narrations = [
  'Elizabeth Evans',
  'Amanda Leigh Cobb',
  'Amanda Forstrom, Anthony Palmini, Gabriel Michael',
].map((narrator, i) => ({
  id: `recording-${i}`,
  title: narrationBook.title,
  format: 'audiobook',
  narrators: [narrator],
  language: 'en',
  production: i === 2 ? 'full-cast' : 'solo',
  abridged: 'unabridged',
  durationSeconds: i === 0 ? 74880 : 90360,
  publisher: 'Recorded Books',
  releaseDate: i === 0 ? '2025-01-01' : '2017-01-01',
  selected: i === 0,
  owned: i === 0,
  requestable: true,
  imageUrl: i === 0 ? imageUrl(18) : undefined,
  unknownFields: [],
  editionLabel: i === 0 ? '10th anniversary' : undefined,
}));
const tv = {
  id: 1396,
  name: 'Friends',
  originalName: 'Friends',
  mediaType: 'tv',
  firstAirDate: '1994-09-22',
  lastAirDate: '2004-05-06',
  numberOfSeasons: 10,
  numberOfEpisodes: 236,
  contentRatings: { results: [] },
  createdBy: [],
  episodeRunTime: [22],
  genres: [{ id: 35, name: 'Comedy' }],
  homepage: '',
  inProduction: false,
  languages: ['en'],
  networks: [{ id: 1, name: 'NBC' }],
  originCountry: ['US'],
  originalLanguage: 'en',
  overview: 'Six friends share their lives in New York.',
  popularity: 100,
  posterPath: '/persius-fixture-1.jpg',
  backdropPath: '/persius-fixture-1.jpg',
  productionCompanies: [],
  productionCountries: [],
  spokenLanguages: [],
  seasons: Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    seasonNumber: i + 1,
    name: `Season ${i + 1}`,
    episodeCount: 24,
    airDate: `${1994 + i}-09-22`,
    overview: '',
  })),
  status: 'Ended',
  type: 'Scripted',
  voteAverage: 8.9,
  voteCount: 1000,
  credits: { cast: [], crew: [] },
  externalIds: { tvdbId: 79168 },
  keywords: [],
  mediaInfo: { ...media(1396), mediaType: 'tv' },
};
const pageOf = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});
const requestRows = movies.slice(0, 7).map((item, i) => ({
  id: 700 + i,
  type: 'movie',
  is4k: false,
  status: 1,
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
  requestedBy: {
    id: 1,
    displayName: 'Nick',
    avatar: '/images/seerr_avatar.png',
  },
  media: { ...media(item.id, 2), title: item.title },
  seasons: [],
  modifiedBy: null,
}));

const statusSnapshot = (i: number) => ({
  stage: i === 0 ? 'failed' : i > 4 ? 'downloading' : 'searching',
  message:
    i === 0
      ? 'This recording could not be found'
      : i > 4
        ? 'Downloading'
        : 'Searching for a copy',
  messageKey: i > 4 ? 'downloading' : 'searching',
  percent: i > 4 ? 64 : null,
  size: null,
  sizeLeft: null,
  estimatedCompletionTime: null,
  downloadCount: i > 4 ? 1 : 0,
  downloadId: null,
  service: 'Radarr',
  isTerminal: i === 0,
  needsAttention: i === 0,
  retryable: i === 0,
  observedAt: '2026-10-30T10:00:00Z',
});

async function login(
  page: Page,
  baseURL: string,
  theme = 'persiusNG',
  email = 'admin@seerr.dev'
) {
  expect(
    (
      await page.request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email, password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  const me = await (await page.request.get(`${baseURL}/api/v1/auth/me`)).json();
  const result = await page.request.post(
    `${baseURL}/api/v1/user/${me.id}/settings/interface-theme`,
    { data: { theme } }
  );
  expect(result.status()).toBe(200);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
}

async function fixtures(page: Page) {
  mkdirSync(screenshotRoot, { recursive: true });
  const appOrigin = new URL(String(test.info().project.use.baseURL)).origin;
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === appOrigin
      ? route.continue()
      : route.abort('blockedbyclient')
  );
  const crops = new Map<number, Buffer>();
  await page.route(
    /(?:image\.tmdb\.org|\/imageproxy\/).*persius-fixture-(\d+)\.jpg/,
    async (route) => {
      const index = Number(
        route
          .request()
          .url()
          .match(/persius-fixture-(\d+)/)?.[1] ?? 0
      );
      if (!crops.has(index)) {
        // Artwork comes from the previously committed reference-fixture sheet.
        const crop =
          index < 12
            ? {
                left: 786 + (index % 6) * 73,
                top: index < 6 ? 148 : 276,
                width: 66,
                height: 100,
              }
            : index < 18
              ? {
                  left: 786 + (index - 12) * 74,
                  top: 680,
                  width: 67,
                  height: 100,
                }
              : { left: 150, top: 946, width: 79, height: 78 };
        crops.set(
          index,
          await sharp(
            path.join(
              process.cwd(),
              'docs/interface-themes/evidence/persiusng-desktop.jpg'
            )
          )
            .resize({ width: 1920 })
            .extract(crop)
            .jpeg()
            .toBuffer()
        );
      }
      await route.fulfill({
        contentType: 'image/jpeg',
        body: crops.get(index),
      });
    }
  );
  await page.route('**/_next/data/**/movie/*.json*', (route) =>
    route.fulfill({
      json: {
        pageProps: {
          movie: movieDetails(
            Number(
              new URL(route.request().url()).pathname
                .split('/')
                .pop()
                ?.replace('.json', '')
            )
          ),
        },
        __N_SSP: true,
      },
    })
  );
  await page.route('**/_next/data/**/tv/*.json*', (route) =>
    route.fulfill({ json: { pageProps: { tv }, __N_SSP: true } })
  );
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace('/api/v1', '');
    let json: unknown;
    if (p === '/settings/public') {
      const response = await route.fetch();
      json = {
        ...(await response.json()),
        booksEnabled: true,
        ebookServiceEnabled: true,
        audiobookServiceEnabled: true,
        cacheImages: false,
        partialRequestsEnabled: true,
      };
    } else if (p === '/settings/discover')
      json = [{ id: 1, type: 1, enabled: true, isBuiltIn: true }];
    else if (p === '/discover/trending' || p === '/discover/movies')
      json = pageOf(movies);
    else if (p === '/discover/tv')
      json = pageOf(
        Array.from({ length: 12 }, (_, i) => ({ ...tv, id: 1396 + i }))
      );
    else if (
      p.startsWith('/discover/books') ||
      p.startsWith('/discover/audiobooks')
    )
      json = pageOf(
        books.map((book) => ({
          ...book,
          bookFormat: url.searchParams.get('format') ?? 'ebook',
        }))
      );
    else if (/^\/movie\/\d+$/.test(p))
      json = movieDetails(Number(p.split('/')[2]));
    else if (/^\/tv\/\d+$/.test(p))
      json = { ...tv, id: Number(p.split('/')[2]) };
    else if (/^\/tv\/1396\/season\/\d+$/.test(p)) {
      const seasonNumber = Number(p.split('/').pop());
      json = {
        seasonNumber,
        episodes: Array.from({ length: 24 }, (_, i) => ({
          id: seasonNumber * 100 + i,
          episodeNumber: i + 1,
          seasonNumber,
          name: `Episode ${i + 1}`,
          airDate: '2000-01-01',
        })),
      };
    } else if (/^\/book\/[^/]+$/.test(p))
      json = p.endsWith('OL999W')
        ? narrationBook
        : (books.find((book) => p.endsWith(book.id)) ?? books[0]);
    else if (p === '/editions/book')
      json = {
        format: 'audiobook',
        editions: narrations,
        supportsAlongside: true,
        source: 'library',
      };
    else if (p.startsWith('/playback/media/'))
      json = {
        mediaId: Number(p.split('/').pop()),
        serverType: 1,
        is4k: false,
        groups: [],
      };
    else if (p.startsWith('/genres/'))
      json = [
        { id: 28, name: 'Action' },
        { id: 12, name: 'Adventure' },
        { id: 35, name: 'Comedy' },
      ];
    else if (p === '/service/sonarr' || p === '/service/radarr')
      json = [
        {
          id: 1,
          name: 'HD',
          isDefault: true,
          is4k: false,
          activeProfileId: 1,
          activeDirectory: '/media',
        },
      ];
    else if (/^\/service\/(sonarr|radarr)\/1$/.test(p))
      json = {
        server: { id: 1, name: 'HD', isDefault: true, is4k: false },
        profiles: [{ id: 1, name: 'HD' }],
        rootFolders: [{ id: 1, path: '/media' }],
        tags: [],
        languageProfiles: [],
      };
    else if (p === '/service/readarr')
      json = [
        { id: 1, name: 'Books', isDefault: true, serviceType: 'ebook' },
        {
          id: 2,
          name: 'Audiobooks',
          isDefault: true,
          serviceType: 'audiobook',
        },
      ];
    else if (p === '/request' && route.request().method() === 'GET') {
      const count =
        url.searchParams.get('filter') === 'available'
          ? 3
          : url.searchParams.get('filter') === 'all'
            ? 10
            : 7;
      json = {
        results: requestRows.slice(
          0,
          Number(url.searchParams.get('take') ?? 7)
        ),
        pageInfo: { pages: 1, page: 1, results: count, pageSize: 20 },
      };
    } else if (/^\/request\/7\d\d$/.test(p))
      json = requestRows.find((item) => p.endsWith(String(item.id)));
    else if (p === '/request/status/users')
      json = {
        results: [
          { id: 1, displayName: 'Nick', avatar: '/images/seerr_avatar.png' },
        ],
        pageInfo: { results: 1, pages: 1 },
      };
    else if (p === '/request/status') {
      const count =
        url.searchParams.get('filter') === 'available'
          ? 3
          : url.searchParams.get('filter') === 'all'
            ? 10
            : 7;
      json = {
        results: requestRows
          .slice(0, Number(url.searchParams.get('take') ?? 7))
          .map((request, i) => ({
            request,
            status: statusSnapshot(i),
            canRemove: false,
          })),
        pageInfo: { pages: 1, page: 1, results: count, pageSize: 20 },
        counts: {
          total: 10,
          active: 7,
          incomplete: 7,
          attention: 1,
          completed: 3,
          unavailable: 0,
          failed: 1,
        },
        olderCount: 0,
      };
    } else if (/^\/request\/status\/7\d\d$/.test(p)) {
      const i = Number(p.split('/').pop()) - 700;
      json = {
        request: requestRows[i],
        current: statusSnapshot(i),
        history: { results: [], total: 0 },
      };
    } else if (p === '/request/count')
      json = {
        total: 10,
        pending: 7,
        approved: 0,
        processing: 0,
        available: 3,
      };
    else if (p === '/media')
      json = {
        results: movies.map((item) => ({
          ...item.mediaInfo,
          title: item.title,
          posterPath: item.posterPath,
          releaseDate: item.releaseDate,
          status: 5,
        })),
        pageInfo: { pages: 1, page: 1, results: 12, pageSize: 20 },
      };
    else if (/\/(ratings|ratingscombined)$/.test(p)) json = { count: 0 };
    else if (/\/(similar|recommendations|associations)$/.test(p))
      json = pageOf([]);
    else if (p.startsWith('/watchproviders/') || p.startsWith('/languages'))
      json = [];
    if (json !== undefined) await route.fulfill({ json });
    else await route.continue();
  });
}

async function capture(page: Page, options: Parameters<Page['screenshot']>[0]) {
  // Compare completed route paint, not a different point in the progress-bar fade.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.body.children).some((element) => {
          const style = getComputedStyle(element);
          return (
            style.position === 'fixed' &&
            style.top === '0px' &&
            element.getBoundingClientRect().height === 3 &&
            Number(style.opacity) > 0
          );
        })
      )
    )
    .toBe(false);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter(
          (image) =>
            image.complete && image.getBoundingClientRect().top < innerHeight
        )
        .map((image) => image.decode().catch(() => undefined))
    );
  });
  // Browser font/compositor paint can lag a resize even after fonts.ready.
  // Require two identical frames, as snapshot assertions do; do not mask UI.
  let previous: Buffer | undefined;
  await expect
    .poll(
      async () => {
        const current = await page.screenshot({
          ...options,
          path: undefined,
          animations: 'disabled',
        });
        const stable = previous?.equals(current) ?? false;
        previous = current;
        return stable;
      },
      { intervals: [100, 200, 500], timeout: 10000 }
    )
    .toBe(true);
  if (options?.path) writeFileSync(options.path, previous!);
}

async function navigate(page: Page, route: string) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-interface-theme',
    'persiusNG'
  );
  await page.evaluate(
    (route) => (window as any).next.router.push(route),
    route
  );
}

const screens = [
  {
    name: 'discover',
    route: '/',
    ready: '.persius-hero',
    width: 1782,
    height: 1055,
  },
  {
    name: 'movies',
    route: '/discover/movies',
    ready: '[data-testid="title-card"]',
    width: 1788,
    height: 1038,
  },
  {
    name: 'movie-detail',
    route: '/movie/101',
    ready: '.persius-detail[data-media-type="movie"]',
    width: 1782,
    height: 1060,
  },
  {
    name: 'series',
    route: '/discover/tv',
    ready: '[data-testid="title-card"]',
    width: 1776,
    height: 1058,
  },
  {
    name: 'books',
    route: '/discover/books',
    ready: '.persius-series-card',
    width: 1772,
    height: 1064,
  },
  {
    name: 'audiobooks',
    route: '/discover/audiobooks',
    ready: '.persius-narrators',
    width: 1726,
    height: 1061,
  },
  {
    name: 'narrations',
    route: '/book/OL999W?format=audiobook',
    ready: '.persius-recordings',
    width: 1736,
    height: 1046,
  },
  {
    name: 'requests',
    route: '/requests',
    ready: '.persius-request',
    width: 1726,
    height: 1067,
  },
  {
    name: 'coming-soon',
    route: '/coming-soon',
    ready: '.persius-release',
    width: 1760,
    height: 1055,
  },
];

for (const screen of screens) {
  test(`native Persius ${screen.name} at desktop, tablet and phone`, async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, baseURL!);
    await fixtures(page);
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      'persiusNG'
    );
    await expect
      .poll(() =>
        page
          .locator('html')
          .evaluate((element) =>
            getComputedStyle(element)
              .getPropertyValue('--interface-sidebar-width')
              .trim()
          )
      )
      .toBe('244px');
    if (screen.route !== '/')
      await page.evaluate(
        (route) => (window as any).next.router.push(route),
        screen.route
      );
    await expect(page.locator(screen.ready).first()).toBeVisible();
    for (const size of [
      { width: screen.width, height: screen.height },
      { width: 768, height: 844 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: Array.from(document.querySelectorAll('*'))
          .filter(
            (element) => element.getBoundingClientRect().right > innerWidth + 1
          )
          .slice(0, 30)
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            width: element.getBoundingClientRect().width,
            right: element.getBoundingClientRect().right,
          })),
      }));
      writeFileSync(
        `${screenshotRoot}/${screen.name}-${size.width}-geometry.json`,
        JSON.stringify(overflow, null, 2)
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          )
        )
        .toBe(true);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images)
            .filter(
              (image) =>
                image.complete &&
                image.getBoundingClientRect().top < window.innerHeight
            )
            .map((image) => image.decode().catch(() => undefined))
        );
      });
      await capture(page, {
        path: `${screenshotRoot}/${screen.name}-${size.width}.png`,
      });
    }
    expect(errors).toEqual([]);
  });
}

test('native account theme switching survives reload and loads one package at a time', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  for (const theme of ['seerrOrig', 'seerrNGJ', 'persiusNG']) {
    expect(
      (
        await page.request.post(
          `${baseURL}/api/v1/user/1/settings/interface-theme`,
          { data: { theme } }
        )
      ).status()
    ).toBe(200);
    await page.goto('/discover/movies');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      theme
    );
    await expect(
      page.locator(`link[href*="/interface-themes/${theme}/theme.css"]`)
    ).toHaveCount(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      theme
    );
  }
});

test('installed community package uses native composition and restores its independent stylesheet', async ({
  page,
  baseURL,
}) => {
  const theme = process.env.E2E_CUSTOM_THEME_ID;
  test.skip(
    !theme,
    'Install a disposable Persius derivative and set E2E_CUSTOM_THEME_ID.'
  );
  await login(page, baseURL!, theme);
  await fixtures(page);
  const catalog = await (
    await page.request.get(`${baseURL}/api/v1/interface-themes`)
  ).json();
  expect(
    catalog.themes.find((item: { id: string }) => item.id === theme)?.layout
  ).toBe('persius');
  await page.goto('/discover/movies');
  await expect(page.locator('html')).toHaveAttribute(
    'data-interface-theme',
    theme!
  );
  await expect(page.locator('.persius-poster-caption').first()).toBeVisible();
  await expect(
    page.locator('link[data-interface-theme-stylesheet]')
  ).toHaveCount(1);
  await expect(
    page.locator(`link[href*="/interface-themes/${theme}/theme.css"]`)
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-interface-theme',
    theme!
  );
  await capture(page, { path: `${screenshotRoot}/community-package.png` });
  expect(
    (
      await page.request.post(
        `${baseURL}/api/v1/user/1/settings/interface-theme`,
        { data: { theme: 'persiusNG' } }
      )
    ).status()
  ).toBe(200);
});

test('native catalog filters, poster captions and keyboard request entry', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  await navigate(page, '/discover/movies');
  await expect(page.locator('.persius-poster-caption').first()).toContainText(
    '1h 57m'
  );
  await page
    .locator('.persius-segments')
    .getByRole('button', { name: 'In library', exact: true })
    .click();
  await expect(page.locator('[data-testid="title-card"]')).toHaveCount(4);
  await expect(page).toHaveURL(/libraryView=available/);
  await page
    .locator('.persius-segments')
    .getByRole('button', { name: 'All', exact: true })
    .click();
  await page.getByRole('button', { name: 'Action', exact: true }).click();
  await expect(page).toHaveURL(/genre=28/);
  await page.locator('.persius-sort select').selectOption('vote_average.desc');
  await expect(page).toHaveURL(/sortBy=vote_average.desc/);
  const card = page.locator('[data-testid="title-card"]').nth(1);
  await card.locator('[data-poster-region="frame"]').focus();
  await page.keyboard.press('Enter');
  await card.getByRole('button', { name: /Request/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('catalog metadata failures preserve saved watchlist state and poster identity', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  // The default seed links a dummy Plex account. This scenario exercises the
  // local-watchlist presentation; login and account theme persistence stay real.
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), userType: 2 } });
  });
  await page.route('**/api/v1/discover/movies?*', (route) =>
    route.fulfill({
      json: pageOf(
        movies.map((item) => ({
          ...item,
          mediaInfo: { ...item.mediaInfo, watchlists: [{ id: 1 }] },
        }))
      ),
    })
  );
  await page.route('**/api/v1/movie/100', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Fixture metadata unavailable' },
    })
  );
  await navigate(page, '/discover/movies');
  const card = page.locator('[data-testid="title-card"]').first();
  await expect(card.locator('.persius-poster-caption')).toContainText(
    titles[0]
  );
  await card.locator('[data-poster-region="frame"]').focus();
  await page.keyboard.press('Enter');
  await expect(
    card.getByRole('button', { name: /Remove .* from your Watchlist/ })
  ).toBeVisible();
});

test('native season dialog selects all, latest and none and retains future-season preference', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!, 'persiusNG', 'friend@seerr.dev');
  await fixtures(page);
  await page.setViewportSize({ width: 1776, height: 1058 });
  await navigate(page, '/discover/tv');
  const card = page.locator('[data-testid="title-card"]').first();
  await card.locator('[data-poster-region="frame"]').hover();
  await card.getByRole('button', { name: /Request/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.persius-season')).toHaveCount(10);
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(dialog.locator('.persius-season input:checked')).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Latest season only', exact: true })
    .click();
  await expect(dialog.locator('.persius-season input:checked')).toHaveCount(1);
  await expect(
    dialog.locator('.persius-season').last().locator('input')
  ).toBeChecked();
  await dialog
    .getByRole('button', { name: 'Entire series', exact: true })
    .click();
  await expect(dialog.locator('.persius-season input:checked')).toHaveCount(10);
  await expect(dialog.getByRole('switch')).toBeChecked();
  await dialog.getByRole('switch').uncheck();
  await expect(dialog.getByRole('switch')).not.toBeChecked();
  await dialog.getByRole('switch').check();
  await expect(dialog.getByRole('switch')).toBeChecked();
  await dialog.evaluate((element) => element.scrollTo({ top: 0 }));
  await expect(dialog.locator('.persius-modal-identity')).toBeInViewport();
  const futureOrder = await dialog.evaluate((element) => {
    const future = element.querySelector('.persius-future-seasons')!;
    const episodes = Array.from(element.querySelectorAll('summary')).find(
      (item) => item.textContent === 'Choose individual episodes'
    )!;
    return Boolean(
      future.compareDocumentPosition(episodes) &
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  expect(futureOrder).toBe(true);
  await capture(page, { path: `${screenshotRoot}/season-dialog-1776.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      dialog.evaluate(
        (element) => element.getBoundingClientRect().width <= innerWidth
      )
    )
    .toBe(true);
  await capture(page, { path: `${screenshotRoot}/season-dialog-390.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const theme of ['seerrOrig', 'seerrNGJ']) {
  test(`existing interfaces: ${theme} shared consumers at desktop and phone`, async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, baseURL!, theme);
    await fixtures(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      theme
    );
    for (const [name, route, ready] of [
      ['movies', '/discover/movies', '[data-testid="title-card"]'],
      ['movie-detail', '/movie/101', '.media-page'],
      ['book-detail', '/book/OL999W', '.media-page'],
      ['requests', '/requests', '[data-testid="request-status-700"]'],
      ['settings', '/settings/main', '.settings-page-content'],
    ]) {
      await page.evaluate(
        (route) => (window as any).next.router.push(route),
        route
      );
      await expect(page.locator(ready).first()).toBeVisible();
      for (const width of [1782, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1060,
        });
        await page.evaluate(async () => {
          window.scrollTo(0, 0);
          await document.fonts.ready;
        });
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1
            )
          )
          .toBe(true);
        await capture(page, {
          path: `${screenshotRoot}/${theme}-${name}-${width}.png`,
        });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('native request loading, empty and error states retain a title and recovery', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  let state: 'loading' | 'empty' | 'error' = 'loading';
  let releaseLoading!: () => void;
  const loading = new Promise<void>((resolve) => {
    releaseLoading = resolve;
  });
  await page.route('**/request/status?*', async (route) => {
    if (state === 'loading') await loading;
    if (state === 'error')
      return route.fulfill({
        status: 503,
        json: { message: 'Temporary fixture outage' },
      });
    return route.fulfill({
      json: {
        results: [],
        pageInfo: { pages: 1, page: 1, results: 0, pageSize: 20 },
        counts: {
          total: 0,
          active: 0,
          incomplete: 0,
          attention: 0,
          completed: 0,
          unavailable: 0,
          failed: 0,
        },
        olderCount: 0,
      },
    });
  });
  await navigate(page, '/requests');
  await expect(page.locator('.page-title').first()).toHaveText('Requests');
  await capture(page, { path: `${screenshotRoot}/requests-loading.png` });
  state = 'empty';
  releaseLoading();
  await expect(
    page.getByRole('heading', { name: 'No Requests Found', exact: true })
  ).toBeVisible();
  await capture(page, { path: `${screenshotRoot}/requests-empty.png` });
  state = 'error';
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible();
  await expect(page.locator('.page-title').first()).toHaveText('Requests');
  await capture(page, { path: `${screenshotRoot}/requests-error.png` });
  state = 'empty';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No Requests Found', exact: true })
  ).toBeVisible();
});

test('native narration choice opens the request flow for that recording', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  await navigate(page, '/book/OL999W?format=audiobook');
  await expect(page.locator('.persius-recording')).toHaveCount(3);
  await page.locator('input[value="recording-2"]').check();
  const request = page.getByRole('button', {
    name: /Request · Amanda Forstrom/,
  });
  await expect(request).toBeEnabled();
  await request.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('input[value="recording-2"]')).toBeChecked();
});

test('native request tabs keep owner scope and expose the existing management flow', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  const queries: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/request/status?')) queries.push(request.url());
  });
  await navigate(page, '/requests');
  await expect(page.locator('.persius-request')).toHaveCount(7);
  await page
    .locator('.persius-request-tabs')
    .getByRole('button', { name: 'Ready 3', exact: true })
    .click();
  await expect(page).toHaveURL(/filter=available/);
  await page
    .locator('.persius-request-tabs')
    .getByRole('button', { name: 'All 10', exact: true })
    .click();
  await expect(page).toHaveURL(/filter=all/);
  expect(queries.length).toBeGreaterThan(0);
  expect(
    queries.every((url) => new URL(url).searchParams.get('requestedBy') === '1')
  ).toBe(true);
  await page
    .locator('.persius-request')
    .first()
    .getByRole('button', { name: 'Details and actions', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'History', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('theme picker changes the loaded CSS, supports light mode and recovers from failed saves', async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL!);
  await fixtures(page);
  await page.goto('/discover/movies');
  await expect(page.locator('.persius-dock')).toBeVisible();
  await page
    .getByRole('button', { name: 'Toggle light and dark mode' })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme-mode',
    'light'
  );
  await page
    .getByRole('button', { name: 'Toggle light and dark mode' })
    .click();
  await page
    .getByRole('button', { name: 'Theme picker', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: /SeerrOrig/ }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-interface-theme',
    'seerrOrig'
  );
  await expect(
    page.locator('link[data-interface-theme-stylesheet][media="all"]')
  ).toHaveCount(1);
  await page.route('**/settings/interface-theme', (route) =>
    route.fulfill({ status: 503, json: { message: 'Test unavailable' } })
  );
  await page
    .getByRole('button', { name: 'Theme picker', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: /^PersiusNG/ }).click();
  await expect(
    page.getByText('Could not save your theme. Please try again.')
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-interface-theme',
    'seerrOrig'
  );
  await expect(
    page.locator('link[data-interface-theme-stylesheet]')
  ).toHaveCount(1);
});
