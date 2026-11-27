import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);

async function openGame(
  page: Page,
  options: {
    path?: string;
    permissions?: number;
    locale?: string;
    game?: Record<string, unknown>;
  } = {}
) {
  const submissions: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Player',
          permissions: options.permissions ?? 0,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale: options.locale ?? 'fr',
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
            ...options.game,
          },
        },
      });
    if (path === '/request/software' && route.request().method() === 'POST') {
      submissions.push(
        JSON.parse(route.request().postData() ?? '{}') as Record<
          string,
          unknown
        >
      );
      return route.fulfill({
        json: { request: { status: 'pending', id: 10 } },
      });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(appPath(options.path ?? '/game/game/42'));
  await expect(
    page.getByRole('heading', { name: 'Fixture Detail Game' })
  ).toBeVisible();
  return submissions;
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

for (const status of [
  {
    availability: 'unknown',
    label: 'Availability unknown',
    className: 'neutral',
  },
  {
    availability: 'owned',
    label: 'Owned in QuestarrNG',
    className: 'ok',
  },
  {
    availability: 'tracked',
    label: 'Tracked',
    className: 'wait',
  },
]) {
  test(`game detail labels ${status.availability} catalog availability`, async ({
    page,
  }) => {
    await openGame(page, {
      locale: 'en',
      game: { availability: status.availability },
    });
    const statusPill = page.locator('.dstatus .pill').first();
    await expect(statusPill).toContainText(status.label);
    await expect(statusPill).toHaveClass(new RegExp(status.className));
  });
}

test('retro and modern requests respect per-system availability and tracking', async ({
  page,
}, info) => {
  const submissions = await openGame(page, {
    path: '/game/retro/42?platform=nes',
    permissions: 32,
    game: {
      catalogProvider: 'dat',
      catalogId:
        'dat-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      availability: 'available',
      emulationSystems: [
        { slug: 'nes', name: 'Nintendo Entertainment System', group: 'retro' },
        { slug: 'snes', name: 'Super Nintendo', group: 'retro' },
        { slug: 'gb', name: 'Game Boy', group: 'retro' },
        { slug: 'ps5', name: 'PlayStation 5', group: 'modern' },
        { slug: 'switch', name: 'Nintendo Switch', group: 'modern' },
      ],
      availableSystems: ['nes', 'ps5'],
      trackedSystems: ['snes'],
    },
  });

  const consolePicker = page.getByLabel('Console');
  const request = page.getByRole('button', { name: 'Demander' });
  const available = page.getByRole('button', { name: 'Disponible' });
  const tracked = page.getByRole('button', { name: 'Suivi' });

  if (process.env.LUMEN_GAME_SYSTEM_BASELINE === '1') {
    const captureDir = process.env.LUMEN_GAME_DETAIL_CAPTURE_DIR;
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/${info.project.name}-system.png`,
        fullPage: true,
      });
    await expect(page.getByText('Dans la bibliothèque').first()).toBeVisible();
    await expect(request).toHaveCount(0);
    await expect(consolePicker).toHaveCount(0);
    return;
  }

  const captureDir = process.env.LUMEN_GAME_DETAIL_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/${info.project.name}-system.png`,
      fullPage: true,
    });

  await expect(consolePicker).toHaveValue('nes');
  await expect(consolePicker.locator('option:checked')).toContainText(
    'Disponible'
  );
  await expect(available).toBeDisabled();
  await expect(request).toHaveCount(0);
  expect(submissions).toEqual([]);

  await consolePicker.selectOption('snes');
  await expect(tracked).toBeDisabled();
  await expect(request).toHaveCount(0);
  expect(submissions).toEqual([]);

  await consolePicker.selectOption('gb');
  await expect(request).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await request.click();
  await expect
    .poll(() => submissions)
    .toEqual([
      {
        category: 'retro',
        catalogProvider: 'dat',
        catalogKey:
          'dat-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        platformSlug: 'gb',
      },
    ]);

  await page.goto(appPath('/game/modern/42?platform=ps5'));
  await expect(
    page.getByRole('heading', { name: 'Fixture Detail Game' })
  ).toBeVisible();
  const modernPicker = page.getByLabel('Console');
  await expect(modernPicker).toHaveValue('ps5');
  await expect(modernPicker.locator('option:checked')).toContainText(
    'Disponible'
  );
  await expect(available).toBeDisabled();
  await modernPicker.selectOption('switch');
  const modernRequest = page.getByRole('button', { name: 'Demander' });
  await expect(modernRequest).toBeEnabled();
  await modernRequest.click();
  await expect.poll(() => submissions).toHaveLength(2);
  expect(submissions[1]).toMatchObject({
    category: 'modern',
    catalogProvider: 'dat',
    platformSlug: 'switch',
  });
});

for (const [locale, label] of [
  ['en', 'Available'],
  ['fr', 'Disponible'],
  ['ar', 'متاح'],
] as const) {
  test(`per-system availability follows the ${locale} locale`, async ({
    page,
  }) => {
    const submissions = await openGame(page, {
      path: '/game/retro/42?platform=nes',
      permissions: 32,
      locale,
      game: {
        catalogProvider: 'dat',
        emulationSystems: [
          {
            slug: 'nes',
            name: 'Nintendo Entertainment System',
            group: 'retro',
          },
        ],
        availableSystems: ['nes'],
      },
    });
    await expect(page.getByRole('button', { name: label })).toBeDisabled();
    expect(submissions).toEqual([]);
  });
}
