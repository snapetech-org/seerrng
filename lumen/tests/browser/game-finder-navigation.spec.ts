import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function fixture(
  page: Page,
  permissions: number,
  categories: Record<string, boolean>,
  locale = 'en'
) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: categories,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: categories },
      });
    if (path === '/game-library')
      return route.fulfill({
        json: { results: [], total: 0, nextOffset: null },
      });
    if (path.startsWith('/request/software/catalog/popular'))
      return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: {} });
  });
}

async function openNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 1040) {
    const labels = {
      en: 'More navigation',
      fr: 'Plus de navigation',
      ar: 'المزيد من عناصر التنقل',
    } as const;
    const locale = await page.locator('html').getAttribute('lang');
    await page
      .getByRole('button', {
        name: labels[locale as keyof typeof labels] ?? labels.en,
      })
      .click();
  }
  return page.locator('.side');
}

for (const locale of [
  {
    tag: 'en',
    label: 'Game Finder',
    games: 'Games',
    myGames: 'My Games',
  },
  {
    tag: 'fr',
    label: 'Recherche de jeux',
    games: 'Jeux',
    myGames: 'Mes jeux',
  },
  {
    tag: 'ar',
    label: 'مستكشف الألعاب',
    games: 'ألعاب',
    myGames: 'ألعابي',
  },
]) {
  test(`Game Finder and My Games have direct entries for PC game users in ${locale.tag}`, async ({
    page,
  }, info) => {
    const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
    await fixture(page, 2, { game: true }, locale.tag);
    await page.goto(appPath('/me'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale.tag);
    const menu = await openNavigation(page);
    const games = menu.getByRole('link', {
      name: locale.games,
      exact: true,
    });
    const finder = menu.getByRole('link', {
      name: locale.label,
      exact: true,
    });
    const myGames = menu.getByRole('link', {
      name: locale.myGames,
      exact: true,
    });
    await expect(games).toBeVisible();
    await expect(games).toHaveAttribute('href', appPath('/games'));
    await expect(finder).toBeVisible();
    await expect(finder).toHaveAttribute('href', appPath('/games/discovery'));
    if (baseline) {
      await myGames.evaluate((element) => element.remove());
      await expect(myGames).toHaveCount(0);
      await menu.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    } else {
      await expect(myGames).toBeVisible();
      await expect(myGames).toHaveAttribute('href', appPath('/game-library'));
      await myGames.scrollIntoViewIfNeeded();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    const menuSize = await menu.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(menuSize.scrollWidth).toBeLessThanOrEqual(menuSize.clientWidth);
    const captureDir = process.env.LUMEN_GAME_FINDER_CAPTURE_DIR;
    if (
      captureDir &&
      locale.tag === 'en' &&
      ['desktop', 'iphone'].includes(info.project.name)
    )
      await menu.screenshot({
        path: `${captureDir}/my-games-${baseline ? 'baseline' : 'candidate'}-${info.project.name}.png`,
      });
    await finder.click();
    await expect(page).toHaveURL(/\/games\/discovery$/);
    await expect(
      page.getByRole('heading', { name: locale.label, exact: true })
    ).toBeVisible();
    if (!baseline) {
      await page.goto(appPath('/me'));
      await expect(page.locator('html')).toHaveAttribute('lang', locale.tag);
      const reopenedMenu = await openNavigation(page);
      await reopenedMenu
        .getByRole('link', { name: locale.myGames, exact: true })
        .click();
      await expect(page).toHaveURL(/\/game-library$/);
      await expect(
        page.getByRole('heading', { name: locale.myGames, exact: true })
      ).toBeVisible();
    }
  });
}

for (const scenario of [
  {
    name: 'without request access',
    permissions: 0,
    categories: { game: true },
  },
  {
    name: 'when only console catalogs are enabled',
    permissions: 2,
    categories: { retro: true, modern: true },
  },
]) {
  test(`Game Finder stays hidden ${scenario.name}`, async ({ page }) => {
    await fixture(page, scenario.permissions, scenario.categories);
    await page.goto(appPath('/me'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const menu = await openNavigation(page);
    await expect(
      menu.getByRole('link', { name: 'Games', exact: true })
    ).toBeVisible();
    await expect(
      menu.getByRole('link', { name: 'Game Finder', exact: true })
    ).toHaveCount(0);
    await expect(
      menu.getByRole('link', { name: 'My Games', exact: true })
    ).toHaveAttribute('href', appPath('/game-library'));
  });
}

test('My Games stays hidden when game categories are disabled', async ({
  page,
}) => {
  await fixture(page, 32, {});
  await page.goto(appPath('/me'));
  const menu = await openNavigation(page);
  await expect(
    menu.getByRole('link', { name: 'Games', exact: true })
  ).toHaveCount(0);
  await expect(
    menu.getByRole('link', { name: 'My Games', exact: true })
  ).toHaveCount(0);
});

test('Game Finder stays reachable in the compact phone navigation', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'iphone', 'Compact phone menu');
  await page.setViewportSize({ width: 320, height: 568 });
  await fixture(page, 2, { game: true });
  await page.goto(appPath('/me'));
  await page.getByRole('button', { name: 'More navigation' }).click();
  const menu = page.locator('.side');
  const finder = menu.getByRole('link', {
    name: 'Game Finder',
    exact: true,
  });
  await finder.scrollIntoViewIfNeeded();
  await expect(finder).toBeInViewport();
  const size = await menu.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320
  );
});
