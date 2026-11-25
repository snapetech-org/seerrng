import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

test('configured studio shelf localizes its company browse name', async ({
  page,
}, info) => {
  const baseline = process.env.LUMEN_A11Y_BASELINE === '1';
  let searchAttempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture User', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'fr' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 1,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/settings/discover')
      return route.fulfill({
        json: [
          {
            id: 1,
            type: 8,
            order: 1,
            enabled: true,
            title: 'Studios',
            data: JSON.stringify([
              { id: 55, name: 'Studio Fixture', logoPath: '/studio.png' },
            ]),
          },
          { id: 2, type: 17, order: 2, enabled: true, data: 'fixture' },
        ],
      });
    if (path === '/search') {
      searchAttempts++;
      return searchAttempts === 1
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({
            json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
          });
    }
    if (
      path === '/genres/movie' ||
      path === '/genres/tv' ||
      path === '/discover/genreslider/movie' ||
      path === '/discover/genreslider/tv'
    )
      return route.fulfill({ json: [] });
    return route.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });

  await page.goto(`${mount}/`);
  const link = page.getByRole('link', {
    name: baseline
      ? 'Browse movies from Studio Fixture'
      : 'Parcourir les films de Studio Fixture',
  });
  await expect(link).toHaveAttribute('href', `${mount}/movies?studio=55`);
  const companyShelf = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Studios' }) });
  await expect(
    companyShelf.getByRole('link', {
      name: baseline ? 'See all' : 'Tout voir',
    })
  ).toHaveAttribute('href', `${mount}/movies`);
  const searchShelf = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: baseline ? 'Discover Titles' : 'Titres à découvrir',
    }),
  });
  await expect(
    searchShelf.getByText(
      baseline
        ? 'Couldn’t load this shelf'
        : 'Impossible de charger cette section.'
    )
  ).toBeVisible();
  const retry = searchShelf.getByRole('button', {
    name: baseline ? 'Retry' : 'Réessayer',
  });
  await expect(retry).toBeVisible();
  if (
    process.env.LUMEN_A11Y_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(info.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_A11Y_CAPTURE_DIR}/${info.project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  await retry.click();
  await expect.poll(() => searchAttempts).toBe(2);
  await expect(searchShelf).toHaveCount(0);
});
