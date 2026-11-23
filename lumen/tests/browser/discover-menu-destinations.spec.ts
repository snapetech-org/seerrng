import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

async function prepare(
  page: Page,
  permissions: number,
  categories: Record<string, boolean>
) {
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
        json: { id: 7, displayName: 'Player', permissions, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          booksEnabled: true,
          musicEnabled: true,
          softwareEnabled: true,
          enabledMediaCategories: categories,
        },
      });
    if (path === '/user/7/settings/main')
      return route.fulfill({ json: { enabledMediaCategories: categories } });
    if (path.startsWith('/request/software/catalog/popular'))
      return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
  });
  await page.goto(`${mount}/me`);
  if ((page.viewportSize()?.width ?? 0) < 1040)
    await page.getByRole('button', { name: 'More navigation' }).click();
  return page.locator('.side');
}

test('native Discover destinations have direct Lumen menu links', async ({
  page,
}) => {
  const categories = {
    ebook: true,
    audiobook: true,
    music: true,
    game: true,
  };
  const menu = await prepare(page, 32, categories);
  const destinations = [
    ['Book Recommendations', '/books/recommendations'],
    ['Collector Picks', '/music/collectors'],
    ['Game Finder', '/games/discovery'],
    ['Software', '/software'],
    ['Browse Patches', '/patches'],
  ] as const;
  for (const [label, href] of destinations) {
    const link = menu.getByRole('link', { name: label, exact: true });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport();
    await expect(link).toHaveAttribute('href', href);
  }
});

test('request-only Discover links stay hidden without request access', async ({
  page,
}) => {
  const menu = await prepare(page, 0, {
    ebook: true,
    audiobook: true,
    music: true,
    game: true,
  });
  for (const label of [
    'Book Recommendations',
    'Collector Picks',
    'Game Finder',
    'Software',
    'Browse Patches',
  ])
    await expect(
      menu.getByRole('link', { name: label, exact: true })
    ).toHaveCount(0);
});

test('Discover menu destinations follow account category restrictions', async ({
  page,
}) => {
  const menu = await prepare(page, 32, {
    ebook: false,
    audiobook: false,
    music: false,
    game: false,
  });
  for (const label of [
    'Book Recommendations',
    'Collector Picks',
    'Game Finder',
    'Software',
    'Browse Patches',
  ])
    await expect(
      menu.getByRole('link', { name: label, exact: true })
    ).toHaveCount(0);
});

test('book recommendations selects audiobook when ebooks are unavailable', async ({
  page,
}) => {
  const menu = await prepare(page, 32, {
    ebook: false,
    audiobook: true,
    music: false,
    game: false,
  });
  await expect(
    menu.getByRole('link', { name: 'Book Recommendations', exact: true })
  ).toHaveAttribute('href', '/books/recommendations?format=audiobook');
});

test('all Discover menu links remain reachable without horizontal overflow at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const menu = await prepare(page, 32, {
    ebook: true,
    audiobook: true,
    music: true,
    game: true,
  });
  const labels = [
    'Book Recommendations',
    'Collector Picks',
    'Game Finder',
    'Software',
    'Browse Patches',
  ];
  for (const label of labels) {
    const link = menu.getByRole('link', { name: label, exact: true });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport();
  }
  const dimensions = await menu.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320
  );
});
