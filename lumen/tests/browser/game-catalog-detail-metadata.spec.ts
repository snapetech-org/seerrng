import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);

async function openGame(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 0 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale: 'fr',
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path === '/game-library/lookup')
      return route.fulfill({ json: { entry: null } });
    if (path.startsWith('/request/software/catalog/popular'))
      return route.fulfill({ json: { results: [] } });
    if (path.startsWith('/request/software/catalog/games/'))
      return route.fulfill({
        json: {
          game: {
            title: 'Fixture Detail Game',
            catalogId: '42',
            catalogProvider: 'igdb',
            igdbId: 42,
            summary: 'A fixture summary.',
            coverUrl: '',
            releaseDate: '2025-04-01',
            platforms: ['Windows'],
            genres: ['Adventure'],
            developers: ['Fixture Studio'],
            publishers: ['Fixture Publisher'],
            steamOwned: true,
            screenshots: ['https://images.igdb.com/fixture-screenshot.jpg'],
            videos: [
              { name: 'Trailer', videoId: 'abcdefghijk' },
              { name: '', videoId: 'lmnopqrstuv' },
              { name: 'Unsafe', videoId: 'bad-id' },
            ],
            timeToBeat: { hastily: 2, normally: 30.5, completely: 70 },
          },
        },
      });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(appPath('/game/game/42'));
  await expect(
    page.getByRole('heading', { name: 'Fixture Detail Game' })
  ).toBeVisible();
}

test('game details retain catalog playtime, Steam ownership, and safe videos', async ({
  page,
}, info) => {
  await openGame(page);
  const captureDir = process.env.LUMEN_GAME_DETAIL_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await Promise.all([
      page.screenshot({
        path: `${captureDir}/${info.project.name}.png`,
        fullPage: true,
      }),
      page.screenshot({
        path: `${captureDir}/${info.project.name}-viewport.png`,
      }),
    ]);

  if (process.env.LUMEN_GAME_DETAIL_BASELINE === '1') {
    await expect(page.getByText('Bibliothèque Steam')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Vidéos', exact: true })
    ).toHaveCount(0);
    await expect(page.getByText('Fin rapide')).toHaveCount(0);
    await expect(page.getByText('Complétionniste')).toHaveCount(0);
    return;
  }

  await expect(page.getByText('Bibliothèque Steam')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Captures d’écran' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vidéos' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Regarder Trailer' })
  ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
  await expect(
    page.getByRole('link', { name: 'Regarder Vidéo du jeu' })
  ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=lmnopqrstuv');
  await expect(page.getByRole('link', { name: /Unsafe/ })).toHaveCount(0);
  await expect(page.getByText('Fin rapide')).toBeVisible();
  await expect(page.getByText('2 h')).toBeVisible();
  await expect(page.getByText('Histoire principale')).toBeVisible();
  await expect(page.getByText('30,5 h')).toBeVisible();
  await expect(page.getByText('Complétionniste')).toBeVisible();
  await expect(page.getByText('70 h')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request' })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
