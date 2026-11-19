import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const locales = [
  {
    tag: 'en',
    music: 'Music',
    comics: 'Comics/Manga',
    magazines: 'Magazines',
    games: 'Games',
    sports: 'Sports',
    adult: 'Adult',
  },
  {
    tag: 'fr',
    music: 'Musique',
    comics: 'BD/Manga',
    magazines: 'Revues',
    games: 'Jeux',
    sports: 'Sports',
    adult: 'Contenu pour adultes',
  },
  {
    tag: 'ar',
    music: 'الموسيقى',
    comics: 'قصص مصورة/مانغا',
    magazines: 'مجلات',
    games: 'ألعاب',
    sports: 'الرياضة',
    adult: 'للبالغين',
  },
];

for (const locale of locales) {
  test(`enabled optional catalogs use ${locale.tag} labels and remain reachable`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Admin', permissions: 2, userType: 2 },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            applicationTitle: 'SeerrNG',
            booksEnabled: true,
            musicEnabled: true,
            comicsEnabled: true,
            magazinesEnabled: true,
            sportsEnabled: true,
            softwareEnabled: true,
            adultEnabled: true,
            romarrEnabled: true,
            enabledMediaCategories: {
              music: true,
              comic: true,
              magazine: true,
              game: true,
              retro: true,
              modern: true,
              sports: true,
              adult: true,
            },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: {
            enabledMediaCategories: {
              music: true,
              comic: true,
              magazine: true,
              game: true,
              retro: true,
              modern: true,
              sports: true,
              adult: true,
            },
            locale: locale.tag,
          },
        });
      if (path.startsWith('/request/software/catalog/popular'))
        return route.fulfill({ json: { results: [] } });
      if (path.startsWith('/discover/genreslider/'))
        return route.fulfill({ json: [] });
      if (
        path === '/discover/comics' ||
        path === '/discover/magazines' ||
        path === '/discover/sports' ||
        path === '/adult/search'
      )
        return route.fulfill({ json: {} });
      return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
    });

    await page.goto(testAppPath('/'));
    const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
    const menu = desktop
      ? page.getByRole('navigation', { name: 'Main', exact: true })
      : page.locator('.navchips');
    const categories = [
      [locale.music, '/music'],
      [locale.comics, '/comics'],
      [locale.magazines, '/magazines'],
      [locale.games, '/games'],
      [locale.sports, '/sports'],
      [locale.adult, '/adult'],
    ] as const;
    for (const [label, path] of categories) {
      const link = menu.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', testAppPath(path));
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
      path: info.outputPath(`optional-catalog-${locale.tag}.png`),
    });
  });
}
