import { expect, test, type Page } from '@playwright/test';

const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

const theAudioDbImage =
  'https://r2.theaudiodb.com/images/media/artist/thumb/image.jpg';

async function fixtures(
  page: Page,
  includeArtistSearchResult = false,
  options: {
    includePeople?: () => boolean;
    includeMovieCredit?: () => boolean;
  } = {}
) {
  const includePeople = options.includePeople ?? (() => true);
  const includeMovieCredit = options.includeMovieCredit ?? (() => true);
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', booksEnabled: false },
      });
    if (path === '/search') {
      const query = requestUrl.searchParams.get('query');
      const results =
        query === 'Long'
          ? Array.from({ length: 80 }, (_, index) => ({
              id: 1000 + index,
              mediaType: 'person',
              name: `Long Person ${index}`,
            }))
          : query === 'Unsafe'
            ? [
                {
                  id: 2000,
                  mediaType: 'person',
                  name: 'Literal traversal',
                  profilePath:
                    'https://r2.theaudiodb.com/images/../profile.jpg',
                },
                {
                  id: 2001,
                  mediaType: 'person',
                  name: 'Encoded traversal',
                  profilePath:
                    'https://r2.theaudiodb.com/images/%2e%2e/profile.jpg',
                },
                {
                  id: 2002,
                  mediaType: 'person',
                  name: 'Nested encoded traversal',
                  profilePath:
                    'https://r2.theaudiodb.com/images/%252e%252e/profile.jpg',
                },
                {
                  id: 2003,
                  mediaType: 'person',
                  name: 'Fragment URL',
                  profilePath: `${theAudioDbImage}#tracker`,
                },
              ]
            : [
                ...(includePeople()
                  ? [
                      {
                        id: 77,
                        mediaType: 'person',
                        name: 'Jane Example',
                        profilePath: 'https://attacker.invalid/profile.jpg',
                      },
                    ]
                  : []),
                ...(includeArtistSearchResult
                  ? [
                      {
                        id: 78,
                        mediaType: 'person',
                        name: 'Artist Example',
                        profilePath: theAudioDbImage,
                      },
                    ]
                  : []),
                {
                  id: 5,
                  mediaType: 'movie',
                  title: 'Example Film',
                  releaseDate: '2024-01-01',
                },
              ];
      return route.fulfill({ json: paged(results) });
    }
    const personPath = path.match(/^\/person\/(\d+)$/);
    if (personPath) {
      const id = Number(personPath[1]);
      const isJane = id === 77;
      const isArtist = id === 78;
      const name = isJane
        ? 'Jane Example'
        : isArtist
          ? 'Artist Example'
          : `Long Person ${id - 1000}`;
      return route.fulfill({
        json: {
          id,
          name,
          ...(isJane
            ? {
                profilePath: 'https://attacker.invalid/profile.jpg',
                biography: 'Performer and director.',
                knownForDepartment: 'Acting',
              }
            : {}),
          ...(isArtist
            ? {
                profilePath: theAudioDbImage,
                knownForDepartment: 'Music',
              }
            : {}),
        },
      });
    }
    if (/^\/person\/\d+\/combined_credits$/.test(path)) {
      const id = Number(path.split('/')[2]);
      return route.fulfill({
        json:
          id === 77
            ? {
                id,
                cast: includeMovieCredit()
                  ? [{ id: 5, mediaType: 'movie', title: 'Example Film' }]
                  : [],
                crew: includeMovieCredit()
                  ? [{ id: 5, mediaType: 'movie', title: 'Example Film' }]
                  : [],
              }
            : { id, cast: [], crew: [] },
      });
    }
    return route.fulfill({ json: paged([]) });
  });
}

test('All search shows People and opens an internal Lumen person page', async ({
  page,
}, info) => {
  const externalImageRequests: string[] = [];
  let includePeople = false;
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'attacker.invalid')
      externalImageRequests.push(request.url());
  });
  await fixtures(page, false, { includePeople: () => includePeople });
  await page.goto('/search?q=Jane');
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('people-search-baseline.png'),
  });

  includePeople = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(
    page.locator('.results').getByRole('link', { name: 'Jane Example' })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('people-search-candidate.png'),
  });
  await page
    .locator('.results')
    .getByRole('link', { name: 'Jane Example' })
    .click();
  await expect(page).toHaveURL(/\/person\/77$/);
  const personHeading = page.getByRole('heading', { name: 'Jane Example' });
  await expect(personHeading).toBeVisible();
  await expect(personHeading).toBeInViewport();
  await expect(page.getByText('Performer and director.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Known For' })).toBeVisible();
  await expect(page.locator('.grid .poster')).toHaveCount(1);
  await expect(page.locator('.portrait .art-ph')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await expect(personHeading).toBeInViewport();
  await page.screenshot({
    path: info.outputPath('person-detail-candidate-top.png'),
  });
  const creditsHeading = page.getByRole('heading', { name: 'Known For' });
  await creditsHeading.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath('person-detail-candidate-credits.png'),
  });
  await expect(
    page.locator('img[src^="https://attacker.invalid/"]')
  ).toHaveCount(0);
  expect(externalImageRequests).toEqual([]);
});

test('All search refetches person visibility after a category policy change', async ({
  page,
}) => {
  let personCategoryEnabled = true;
  let searchRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/search') searchRequests++;
  });
  await fixtures(page, false, {
    includePeople: () => personCategoryEnabled,
  });
  await page.goto('/search?q=Jane');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect.poll(() => searchRequests).toBe(1);

  personCategoryEnabled = false;
  await page.reload();

  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0);
  await expect.poll(() => searchRequests).toBe(2);
});

test('person credits refetch after a category or maturity policy tightens', async ({
  page,
}) => {
  let movieCreditAllowed = true;
  let creditRequests = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/api/v1/person/77/combined_credits'
    )
      creditRequests++;
  });
  await fixtures(page, false, {
    includeMovieCredit: () => movieCreditAllowed,
  });
  await page.goto('/person/77');
  await expect(
    page.getByRole('heading', { name: 'Jane Example' })
  ).toBeVisible();
  const visibleCreditTitle = page.locator('.grid .poster > a.t');
  await expect(visibleCreditTitle).toHaveText('Example Film');
  await expect(visibleCreditTitle).toBeVisible();
  await expect.poll(() => creditRequests).toBe(1);
  await page.waitForTimeout(500);

  movieCreditAllowed = false;
  await page.goto('/search?q=Jane');
  await page.goto('/person/77');

  await expect(
    page.getByRole('heading', { name: 'Jane Example' })
  ).toBeVisible();
  await expect(page.locator('.grid .poster > a.t')).toHaveCount(0);
  await expect.poll(() => creditRequests).toBe(2);
});

test('search result TheAudioDB portraits load through the same-origin proxy', async ({
  page,
}) => {
  const proxyRequests: string[] = [];
  await page.route('**/imageproxy/theaudiodb/**', async (route) => {
    proxyRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="6"><rect width="4" height="6" fill="purple"/></svg>',
    });
  });
  await fixtures(page, true);
  await page.goto('/search?q=Jane');

  const artistCard = page
    .locator('.results .poster')
    .filter({ has: page.getByRole('link', { name: 'Artist Example' }) });
  const image = artistCard.locator('img');
  await expect(image).toHaveAttribute(
    'src',
    '/imageproxy/theaudiodb/images/media/artist/thumb/image.jpg'
  );
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth)
    )
    .toBe(4);
  expect(proxyRequests).toHaveLength(1);
  expect(new URL(proxyRequests[0]).origin).toBe(new URL(page.url()).origin);
  expect(new URL(proxyRequests[0]).pathname).toBe(
    '/imageproxy/theaudiodb/images/media/artist/thumb/image.jpg'
  );
});

test('unsafe TheAudioDB traversal and fragment paths never reach the image proxy', async ({
  page,
}) => {
  const imageProxyRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/imageproxy/'))
      imageProxyRequests.push(request.url());
  });
  await fixtures(page);
  await page.goto('/search?q=Unsafe');

  for (const name of [
    'Literal traversal',
    'Encoded traversal',
    'Nested encoded traversal',
    'Fragment URL',
  ]) {
    const personCard = page
      .locator('.results .poster')
      .filter({ has: page.getByRole('link', { name }) });
    await expect(personCard.locator('img')).toHaveCount(0);
  }
  expect(imageProxyRequests).toEqual([]);
});

test('long search navigation starts at the top after scrolling to a person', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/search?q=Long');

  const lastPerson = page.getByRole('link', { name: 'Long Person 79' });
  await lastPerson.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await lastPerson.click();

  await expect(page).toHaveURL(/\/person\/1079$/);
  const heading = page.getByRole('heading', { name: 'Long Person 79' });
  await expect(heading).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(heading).toBeInViewport();
});

test('allowlisted TheAudioDB portraits use SeerrNG image proxy on detail pages', async ({
  page,
}) => {
  const externalImageRequests: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host === 'r2.theaudiodb.com') externalImageRequests.push(request.url());
  });
  await fixtures(page);
  await page.goto('/person/78');

  await expect(
    page.getByRole('heading', { name: 'Artist Example' })
  ).toBeVisible();
  await expect(page.locator('.portrait img')).toHaveAttribute(
    'src',
    '/imageproxy/theaudiodb/images/media/artist/thumb/image.jpg'
  );
  expect(externalImageRequests).toEqual([]);
});

test('Movie-scoped Lumen search does not show People', async ({ page }) => {
  await fixtures(page);
  await page.goto('/search?q=Jane&f=movie');
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0);
});
