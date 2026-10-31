import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  const response = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(response.status()).toBe(200);
  const sid = response
    .headersArray()
    .find((h) => h.name.toLowerCase() === 'set-cookie')
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sid!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
};

const widths = [320, 360, 375, 390, 768, 1024, 1440, 1920];
const pages = [
  '/discover/movies',
  '/discover/tv',
  '/discover/list/8',
  '/person/287',
  '/games',
  '/settings/services',
  '/settings/network',
  '/requests',
  '/users',
];

for (const path of pages) {
  test(`${path} never scrolls horizontally`, async ({ page, baseURL }) => {
    await loginAsAdmin(page, baseURL);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
}

test('poster grids keep full-size posters and two columns on phones', async ({
  page,
  baseURL,
}) => {
  await loginAsAdmin(page, baseURL);
  let discoveryFixtureApplied = false;
  await page.route('**/api/v1/discover/movies*', async (route) => {
    discoveryFixtureApplied = true;
    await route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 4,
        results: [
          {
            id: 550,
            mediaType: 'movie',
            title: 'Fight Club',
            releaseDate: '1999-10-15',
            posterPath: null,
          },
          {
            id: 551,
            mediaType: 'movie',
            title: 'The Matrix',
            releaseDate: '1999-03-31',
            posterPath: null,
          },
          {
            id: 552,
            mediaType: 'movie',
            title: 'The Mummy',
            releaseDate: '1999-04-16',
            posterPath: null,
          },
          {
            id: 553,
            mediaType: 'movie',
            title: 'Notting Hill',
            releaseDate: '1999-05-21',
            posterPath: null,
          },
        ],
      },
    });
  });
  for (const width of [320, 360, 375, 390, 412]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/discover/movies');
    await page.waitForLoadState('networkidle');
    expect(discoveryFixtureApplied).toBe(true);
    const metrics = await page.evaluate(() => {
      const items = [
        ...document.querySelectorAll('ul.cards-vertical > li'),
      ].map((li) => li.getBoundingClientRect());
      if (items.length === 0) {
        return { count: 0, columns: 0, posterWidth: 0 };
      }
      const firstRowTop = Math.round(items[0].top);
      return {
        count: items.length,
        columns: items.filter((r) => Math.round(r.top) === firstRowTop).length,
        posterWidth: items[0].width,
      };
    });
    expect(metrics.count, `poster count at ${width}px`).toBeGreaterThanOrEqual(
      2
    );
    expect(metrics.columns, `columns at ${width}px`).toBeGreaterThanOrEqual(2);
    expect(metrics.posterWidth, `poster width at ${width}px`).toBeGreaterThan(
      120
    );
  }
});

test('cast posters never overlap their neighbours', async ({
  page,
  baseURL,
}) => {
  await loginAsAdmin(page, baseURL);
  await page.route('**/api/v1/movie/550*', (route) =>
    route.fulfill({
      json: {
        id: 550,
        title: 'Fight Club',
        credits: {
          cast: Array.from({ length: 30 }, (_, index) => ({
            id: index + 1,
            name: `Cast member ${index + 1}`,
            character: `Character ${index + 1}`,
            profilePath: null,
          })),
        },
      },
    })
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/movie/550/cast');
  await page.waitForLoadState('networkidle');
  const overlaps = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('ul.cards-vertical > li')]
      .slice(0, 30)
      .map((li) => li.firstElementChild!.getBoundingClientRect());
    let count = 0;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const w =
          Math.min(rects[i].right, rects[j].right) -
          Math.max(rects[i].left, rects[j].left);
        const h =
          Math.min(rects[i].bottom, rects[j].bottom) -
          Math.max(rects[i].top, rects[j].top);
        if (w > 1 && h > 1) count++;
      }
    return count;
  });
  expect(overlaps).toBe(0);
});
