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
          { id: 77, mediaType: 'person', name: 'Jane Example' },
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
          biography: 'Performer and director.',
          knownForDepartment: 'Acting',
        },
      });
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
}) => {
  await fixtures(page);
  await page.goto('/search?q=Jane');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(
    page.locator('.results').getByRole('link', { name: 'Jane Example' })
  ).toBeVisible();
  await page.locator('.results').getByRole('link', { name: 'Jane Example' }).click();
  await expect(page).toHaveURL(/\/person\/77$/);
  await expect(page.getByRole('heading', { name: 'Jane Example' })).toBeVisible();
  await expect(page.getByText('Performer and director.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Known for' })).toBeVisible();
  await expect(page.locator('.grid .poster')).toHaveCount(1);
});

test('Movie-scoped Lumen search does not show People', async ({ page }) => {
  await fixtures(page);
  await page.goto('/search?q=Jane&f=movie');
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0);
});
