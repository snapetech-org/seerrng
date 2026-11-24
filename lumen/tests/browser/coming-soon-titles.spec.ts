import { expect, test, type Page } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(page: Page, permissions = 2, locale?: string) {
  const upcoming = Array.from({ length: 6 }, (_, i) => ({
    id: 900 + i,
    title: `Victorian Psychosis Stories ${i + 1}`,
    mediaType: 'movie',
    releaseDate: '2027-03-15',
  }));
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'test', permissions },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', movie4kEnabled: false },
      });
    if (path === '/user/1/settings/main' && locale)
      return route.fulfill({ json: { locale } });
    return route.fulfill({
      json: paged(path === '/discover/movies/upcoming' ? upcoming : []),
    });
  });
}

for (const locale of ['en', 'fr', 'ar']) {
  test(`quick request sheet labels follow ${locale} baseline`, async ({
    page,
  }) => {
    const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
    await fixtures(page, 32, locale);
    await page.route('**/api/v1/request', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 403,
            json: {
              code: 'STREAMING_REQUEST_POLICY_REJECTED',
              allowOverride: true,
              message: 'Available on your streaming service.',
            },
          })
        : route.fallback()
    );
    await page.goto(testAppPath('/soon?media=movie'));
    const title = 'Victorian Psychosis Stories 1';
    const item = page.locator('.si').filter({ hasText: title });
    await item.locator('.act button').click();
    const localized = {
      en: {
        title: `Request ${title}`,
        anyway: 'Request Anyway',
        cancel: 'Cancel',
      },
      fr: {
        title: `Demander ${title}`,
        anyway: 'Demander quand même',
        cancel: 'Annuler',
      },
      ar: { title: `طلب ${title}`, anyway: 'طلب على أي حال', cancel: 'إلغاء' },
    }[locale]!;
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const heading = sheet.getByRole('heading');
    await expect(heading).toContainText(title);
    await expect(heading).toContainText(
      locale === 'ar' ? 'طلب' : locale === 'fr' ? 'Demander' : 'Request'
    );
    await expect(
      sheet.getByRole('button', { name: localized.anyway })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: localized.cancel })
    ).toBeVisible();
    if (
      captureDir &&
      ['desktop', 'iphone'].includes(test.info().project.name)
    ) {
      await sheet.screenshot({
        path: `${captureDir}/${locale}/request-sheet-${test.info().project.name}.png`,
        animations: 'disabled',
      });
    }
  });
}

test('Coming soon titles wrap to two lines instead of cutting to a few letters', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  await fixtures(page);
  await page.goto(testAppPath('/soon'));
  await expect(page.locator('.si')).toHaveCount(6);
  for (const width of [1320, 1366, 1440, 1520, 1599]) {
    await page.setViewportSize({ width, height: 900 });
    const bad = await page
      .locator('.sl')
      .first()
      .evaluate((grid) => {
        const problems: string[] = [];
        for (const card of Array.from(
          grid.querySelectorAll<HTMLElement>('.si')
        )) {
          const tt = card.querySelector<HTMLElement>('.tt')!;
          const line = parseFloat(getComputedStyle(tt).lineHeight);
          if (tt.clientWidth < 100)
            problems.push(`title only ${tt.clientWidth}px wide`);
          if (tt.scrollWidth > tt.clientWidth + 1)
            problems.push(`title cut sideways (${tt.clientWidth}px wide)`);
          if (tt.clientHeight > line * 2 + 1)
            problems.push('title over 2 lines');
        }
        return problems;
      });
    expect(bad, `at ${width}px`).toEqual([]);
  }
});

test('Coming Soon loads subsequent pages for the selected media only', async ({
  page,
}) => {
  await fixtures(page);
  const pages: string[] = [];
  await page.route(/\/api\/v1\/discover\/(movies|tv)\/upcoming\?/, (route) => {
    const url = new URL(route.request().url());
    const number = Number(url.searchParams.get('page'));
    pages.push(`${url.pathname}:${number}`);
    return route.fulfill({
      json: {
        page: number,
        totalPages: 2,
        totalResults: 2,
        results: [
          {
            id: 900 + number,
            title: `Upcoming movie ${number}`,
            mediaType: 'movie',
            releaseDate: `2027-03-${10 + number}`,
          },
        ],
      },
    });
  });
  await page.goto(testAppPath('/soon?media=movie'));
  await expect(
    page.getByText('Upcoming movie 1', { exact: true })
  ).toBeVisible();
  const more = page.getByRole('button', { name: 'Show more upcoming movies' });
  await more.click();
  await expect(
    page.getByText('Upcoming movie 2', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Upcoming movie 1', { exact: true })
  ).toBeVisible();
  await expect(more).toHaveCount(0);
  expect(pages).toEqual([
    '/api/v1/discover/movies/upcoming:1',
    '/api/v1/discover/movies/upcoming:2',
  ]);
});

test('TV-only accounts can browse upcoming series from the menu and Discover', async ({
  page,
}) => {
  const catalogReads: string[] = [];
  const upcomingSeries = {
    id: 902,
    name: 'Upcoming Fixture Series',
    mediaType: 'tv',
    firstAirDate: '2027-04-12',
    posterPath: null,
  };
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { defaults: {} } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path.startsWith('/discover/')) catalogReads.push(path);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          enabledMediaCategories: { movie: false, tv: true },
          movie4kEnabled: false,
          series4kEnabled: false,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { enabledMediaCategories: { movie: false, tv: true } },
      });
    if (path === '/settings/discover') return route.fulfill({ json: [] });
    if (path === '/discover/tv/upcoming')
      return route.fulfill({ json: paged([upcomingSeries]) });
    return route.fulfill({ json: paged([]) });
  });

  await page.goto(testAppPath('/soon'));
  await expect(
    page.getByRole('heading', { name: 'Coming soon' })
  ).toBeVisible();
  const mediaNavigation = page.getByRole('navigation', {
    name: 'Upcoming Media',
  });
  await expect(
    mediaNavigation.getByRole('link', { name: 'Series', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    mediaNavigation.getByRole('link', { name: 'Movies', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Upcoming Fixture Series' })
  ).toBeVisible();
  const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (captureDir) {
    await page.screenshot({
      path: `${captureDir}/${page.viewportSize()?.width ?? 'unknown'}-tv-only-soon.png`,
      fullPage: true,
    });
  }
  expect(catalogReads).toContain('/discover/tv/upcoming');
  expect(catalogReads).not.toContain('/discover/movies/upcoming');

  catalogReads.length = 0;
  await page.goto(testAppPath('/'));
  await expect(
    page.getByRole('heading', { name: 'Upcoming Series' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Upcoming Fixture Series' })
  ).toBeVisible();
  if (captureDir) {
    await page.screenshot({
      path: `${captureDir}/${page.viewportSize()?.width ?? 'unknown'}-tv-only-discover.png`,
      fullPage: true,
    });
  }
  expect(catalogReads).toContain('/discover/tv/upcoming');
  expect(catalogReads).not.toContain('/discover/movies/upcoming');
});

test('Coming Soon requests can confirm a permitted streaming override', async ({
  page,
}) => {
  await fixtures(page, 32);
  const submissions: unknown[] = [];
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    submissions.push(body);
    if (body.bypassStreamingRequestPolicy === true)
      return route.fulfill({ status: 201, json: { id: 42 } });
    return route.fulfill({
      status: 403,
      json: {
        code: 'STREAMING_REQUEST_POLICY_REJECTED',
        allowOverride: true,
        message: 'Available on your streaming service.',
      },
    });
  });
  await page.goto(testAppPath('/soon?media=movie'));
  const title = 'Victorian Psychosis Stories 1';
  const item = page.locator('.si').filter({ hasText: title });
  const trigger = item.getByRole('button', { name: 'Request', exact: true });
  const sheet = page.getByRole('dialog', { name: `Request ${title}` });
  const original = { mediaType: 'movie', mediaId: 900 };

  await trigger.click();
  await expect(sheet.getByRole('alert')).toHaveText(
    'Available on your streaming service.'
  );
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeVisible();
  expect(submissions).toEqual([original]);

  await trigger.click();
  await sheet.getByRole('button', { name: 'Request Anyway' }).click();
  await expect(item.getByText('Requested', { exact: true })).toBeVisible();
  expect(submissions).toEqual([
    original,
    original,
    { ...original, bypassStreamingRequestPolicy: true },
  ]);
});
