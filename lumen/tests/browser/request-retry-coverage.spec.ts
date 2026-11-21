import { expect, test, type Page } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const categories = [
  ['movie', 262144],
  ['tv', 524288],
  ['music', 4294967296],
  ['book', 34359738368],
  ['comic', 274877906944],
  ['magazine', 2199023255552],
  ['sports', 35184372088832],
  ['adult', 140737488355328],
] as const;
const standardPermission = 32;

function request(
  id: number,
  type: string,
  requestedBy = 1,
  failureReason?: string
) {
  return {
    id,
    status: 4,
    type,
    is4k: false,
    createdAt: '2026-11-08T12:00:00Z',
    seasons: [],
    requestedBy: { id: requestedBy, displayName: `User ${requestedBy}` },
    media: {
      id,
      title: `Failed ${type} ${id}`,
      mediaType: type,
      tmdbId: id,
      status: 5,
    },
    currentStatus: { stage: 'failed', percent: null, retryable: true },
    failureReason,
  };
}

async function fixture(
  page: Page,
  permissions: number,
  requests: ReturnType<typeof request>[]
) {
  const retries: string[] = [];
  const mapped: unknown[] = [];
  const removed: string[] = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (req.method() === 'POST' && /^\/request\/\d+\/retry$/.test(path)) {
      retries.push(path);
      mapped.push(req.postDataJSON());
      return route.fulfill({ json: {} });
    }
    if (req.method() === 'DELETE' && /^\/media\/\d+\/file$/.test(path)) {
      removed.push(`${path}${new URL(req.url()).search}`);
      return route.fulfill({ status: 204 });
    }
    if (path.startsWith('/service/sonarr/lookup/'))
      return route.fulfill({
        json: [
          {
            title: 'Mapped Show',
            year: 2020,
            tvdbId: 42,
            seasonType: 'standard',
          },
        ],
      });
    if (path === '/service/tvdb/seasons/42')
      return route.fulfill({
        json: [
          { seasonNumber: 1, year: 2020 },
          { seasonNumber: 2, year: 2021 },
        ],
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Owner', permissions, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 1,
          enabledMediaCategories: Object.fromEntries(
            categories.map(([type]) => [type === 'tv' ? 'tv' : type, true])
          ),
        },
      });
    if (path === '/request/count')
      return route.fulfill({ json: { total: requests.length, pending: 0 } });
    if (path === '/request')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: requests.length },
          results: requests,
        },
      });
    if (path === '/request/status')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: requests.length },
          results: requests.map(({ canRemove, ...item }) => ({
            request: item,
            status: item.currentStatus ?? {
              stage: 'queued',
              percent: null,
            },
            canRemove,
          })),
        },
      });
    if (path.startsWith('/user/1/settings/main'))
      return route.fulfill({ json: {} });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  return { retries, mapped, removed };
}

test('owners with category permission can retry failures across media types', async ({
  page,
}) => {
  const requests = categories.map(([type], index) =>
    request(701 + index, type)
  );
  const permissions = categories.reduce(
    (mask, [, permission]) => mask + permission,
    standardPermission
  );
  const { retries } = await fixture(page, permissions, requests);
  await page.goto(testAppPath('/requests?tab=active'));

  for (const [index] of requests.entries()) {
    const row = page.locator('.rq').nth(index);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Request sent again')).toBeVisible();
  }
  expect(retries.sort()).toEqual(
    requests.map(({ id }) => `/request/${id}/retry`).sort()
  );
});

test('retry stays hidden without type permission, for another owner, and on TVDB season mismatch', async ({
  page,
}) => {
  const requests = [
    request(801, 'movie'),
    request(802, 'movie', 2),
    request(803, 'tv', 1, 'tvdb_season_mismatch'),
  ];
  const { retries } = await fixture(page, 524288, requests);
  await page.goto(testAppPath('/requests?tab=active'));

  for (const [index] of requests.entries()) {
    const row = page.locator('.rq').nth(index);
    await expect(row).toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Retry', exact: true })
    ).toHaveCount(0);
  }
  expect(retries).toEqual([]);
});

test('managers can map every selected TV season and retry; other users cannot map', async ({
  page,
}, testInfo) => {
  const failed = {
    ...request(901, 'tv', 2, 'tvdb_season_mismatch'),
    seasons: [
      { seasonNumber: 1, status: 2 },
      { seasonNumber: 2, status: 2 },
    ],
    serverId: 7,
  };
  const { mapped } = await fixture(page, 16, [failed]);
  await page.goto(testAppPath('/requests?tab=everyone&show=failed'));
  const row = page.locator('.rq').first();
  await expect(row.getByRole('button', { name: 'Map Seasons' })).toBeVisible();
  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'iphone')
    await page.screenshot({
      path: testInfo.outputPath('mapping-request-row.png'),
    });
  await row.getByRole('button', { name: 'Map Seasons' }).click();
  const dialog = page.getByRole('dialog', { name: 'Map TV Seasons' });
  await expect(dialog.getByLabel('Sonarr Series')).toContainText('Mapped Show');
  await dialog.getByLabel('Sonarr Series').selectOption('42');
  await expect(dialog.getByLabel('TMDB Season 1')).toBeVisible();
  const mapButton = dialog.getByRole('button', {
    name: 'Map Seasons and Retry',
  });
  await expect(mapButton).toBeDisabled();
  await page.waitForTimeout(350);
  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'iphone')
    await page.screenshot({ path: testInfo.outputPath('mapping-dialog.png') });
  await dialog.getByLabel('TMDB Season 1').selectOption('1');
  await dialog.getByLabel('TMDB Season 2').selectOption('2');
  await expect(mapButton).toBeEnabled();
  await mapButton.click();
  await expect(dialog).toHaveCount(0);
  expect(mapped).toEqual([
    {
      tvdbId: 42,
      seasonType: 'standard',
      seasonMappings: [
        { seasonNumber: 1, externalSeasonNumber: 1 },
        { seasonNumber: 2, externalSeasonNumber: 2 },
      ],
    },
  ]);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const regular = {
    ...request(902, 'tv', 1, 'tvdb_id_unresolved'),
    seasons: [{ seasonNumber: 1, status: 2 }],
  };
  await fixture(page, 524288, [regular]);
  await page.goto(testAppPath('/requests?tab=active'));
  const regularRow = page.locator('.rq').first();
  await expect(regularRow).toBeVisible();
  await expect(
    regularRow.getByRole('button', { name: 'Map Seasons' })
  ).toHaveCount(0);
  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'iphone')
    await page.screenshot({
      path: testInfo.outputPath('unavailable-to-user.png'),
    });
});

test('managers can remove an eligible managed copy while preserving its request', async ({
  page,
}, testInfo) => {
  const eligible = { ...request(911, 'movie'), canRemove: true };
  const { removed } = await fixture(page, 16, [eligible]);
  await page.goto(testAppPath('/requests?tab=everyone&show=failed'));
  const row = page.locator('.rq').first();
  await expect(
    row.getByRole('button', { name: 'Remove from Service' })
  ).toBeVisible();
  await row.getByRole('button', { name: 'Remove from Service' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText(
    'SeerrNG request and history will remain'
  );
  await expect(confirmation).toContainText('managed copy of this item');
  await page.waitForTimeout(400);
  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'iphone')
    await page.screenshot({
      path: testInfo.outputPath('remove-managed-copy-confirmation.png'),
    });
  expect(removed).toEqual([]);
  await confirmation
    .getByRole('button', { name: 'Remove from Service' })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect(removed).toEqual(['/media/911/file?is4k=false']);
  await expect(page.locator('.rq')).toHaveCount(1);
});

test('the status timeline projection carries managed-copy eligibility', async ({
  page,
}) => {
  const eligible = { ...request(917, 'movie'), canRemove: true };
  await fixture(page, 16, [eligible]);
  await page.goto(testAppPath('/requests?tab=everyone&show=attention'));
  const row = page.locator('.rq').first();
  await expect(
    row.getByRole('button', { name: 'Remove from Service' })
  ).toBeVisible();
});

const managedCopyScopes = [
  {
    label: 'a 4K movie',
    id: 912,
    type: 'movie',
    is4k: true,
    expected: '/media/912/file?is4k=true',
    media: {},
  },
  {
    label: 'an audiobook request',
    id: 913,
    type: 'book',
    bookFormat: 'audiobook',
    expected: '/media/913/file?is4k=false&format=audiobook',
    media: { audiobookServiceId: 3, audiobookExternalServiceId: 30 },
  },
  {
    label: 'both linked book formats',
    id: 914,
    type: 'book',
    bookFormat: 'both',
    expected: '/media/914/file?is4k=false&format=both',
    media: {
      serviceId: 3,
      externalServiceId: 31,
      audiobookServiceId: 3,
      audiobookExternalServiceId: 32,
    },
  },
  {
    label: 'the only linked ebook format',
    id: 915,
    type: 'book',
    bookFormat: 'both',
    expected: '/media/915/file?is4k=false&format=ebook',
    media: { serviceId: 3, externalServiceId: 33 },
  },
  {
    label: 'the only linked audiobook format',
    id: 916,
    type: 'book',
    bookFormat: 'both',
    expected: '/media/916/file?is4k=false&format=audiobook',
    media: { audiobookServiceId: 3, audiobookExternalServiceId: 34 },
  },
] as const;

for (const scope of managedCopyScopes) {
  test(`managed-copy removal preserves ${scope.label} scope`, async ({
    page,
  }) => {
    const rowRequest = {
      ...request(scope.id, scope.type),
      canRemove: true,
      is4k: 'is4k' in scope ? scope.is4k : false,
      ...('bookFormat' in scope ? { bookFormat: scope.bookFormat } : {}),
      media: {
        ...request(scope.id, scope.type).media,
        ...scope.media,
      },
    };
    const { removed } = await fixture(page, 16, [rowRequest]);
    await page.goto(testAppPath('/requests?tab=everyone&show=failed'));
    const row = page.locator('.rq').first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Remove from Service' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Remove from Service' })
      .click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(removed).toEqual([scope.expected]);
    await expect(page.locator('.rq')).toHaveCount(1);
  });
}
