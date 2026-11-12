import { expect, test, type Page } from '@playwright/test';

const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(page: Page) {
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', booksEnabled: false },
      });
    if (path === '/search')
      return route.fulfill({
        json: paged([
          {
            id: 77,
            mediaType: 'person',
            name: 'Jane Example',
            profilePath: 'https://attacker.invalid/profile.jpg',
          },
          {
            id: 5,
            mediaType: 'movie',
            title: 'Example Film',
            releaseDate: '2024-01-01',
          },
        ]),
      });
    if (path === '/person/77')
      return route.fulfill({
        json: {
          id: 77,
          name: 'Jane Example',
          profilePath: 'https://attacker.invalid/profile.jpg',
          biography: 'Performer and director.',
          knownForDepartment: 'Acting',
        },
      });
    if (path === '/person/78')
      return route.fulfill({
        json: {
          id: 78,
          name: 'Artist Example',
          profilePath:
            'https://r2.theaudiodb.com/images/media/artist/thumb/image.jpg',
          knownForDepartment: 'Music',
        },
      });
    if (path === '/person/78/combined_credits')
      return route.fulfill({ json: { id: 78, cast: [], crew: [] } });
    if (path === '/person/77/combined_credits')
      return route.fulfill({
        json: {
          id: 77,
          cast: [{ id: 5, mediaType: 'movie', title: 'Example Film' }],
          crew: [{ id: 5, mediaType: 'movie', title: 'Example Film' }],
        },
      });
    return route.fulfill({ json: paged([]) });
  });
}

test('All search shows People and opens an internal Lumen person page', async ({
  page,
}, info) => {
  const externalImageRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'attacker.invalid')
      externalImageRequests.push(request.url());
  });
  await fixtures(page);
  await page.goto('/search?q=Jane');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(
    page.locator('.results').getByRole('link', { name: 'Jane Example' })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('people-search-results.png'),
    fullPage: true,
  });
  await page.locator('.results').getByRole('link', { name: 'Jane Example' }).click();
  await expect(page).toHaveURL(/\/person\/77$/);
  const personHeading = page.getByRole('heading', { name: 'Jane Example' });
  await expect(personHeading).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(0);
  await expect(personHeading).toBeInViewport();
  await expect(page.getByText('Performer and director.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Known for' })).toBeVisible();
  await expect(page.locator('.grid .poster')).toHaveCount(1);
  await expect(page.locator('.portrait .art-ph')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('person-detail.png'),
    fullPage: true,
  });
  await expect(
    page.locator('img[src^="https://attacker.invalid/"]')
  ).toHaveCount(0);
  expect(externalImageRequests).toEqual([]);
});

test('allowlisted TheAudioDB portraits use SeerrNG image proxy', async ({
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
