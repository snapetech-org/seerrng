import { expect, test, type Page } from '@playwright/test';
import { Permission } from '@server/lib/permissions';

test.use({ serviceWorkers: 'block' });

const sceneId = '8a3c0000-0000-4000-8000-000000000001';
const imageFixture =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6cAAAAASUVORK5CYII=';

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  expect(baseURL).toBeTruthy();
  const loginResponse = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(loginResponse.status()).toBe(200);

  const sessionCookie = loginResponse
    .headersArray()
    .find(
      (header) =>
        header.name.toLowerCase() === 'set-cookie' &&
        header.value.startsWith('connect.sid=')
    )
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sessionCookie).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sessionCookie!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const userResponse = await page
    .context()
    .request.get(`${baseURL}/api/v1/auth/me`);
  expect(userResponse.status()).toBe(200);
  return (await userResponse.json()) as { id: number };
};

const enableAdultForBrowser = async (page: Page) => {
  await page.route('**/api/v1/settings/public', async (route) => {
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({
      response,
      json: {
        ...settings,
        adultEnabled: true,
        enabledMediaCategories: {
          ...settings.enabledMediaCategories,
          adult: true,
        },
        defaultEnabledMediaCategories: {
          ...settings.defaultEnabledMediaCategories,
          adult: true,
        },
      },
    });
  });
};

const maskCurrentUserAsRequester = async (page: Page) => {
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    const user = await response.json();
    await route.fulfill({
      response,
      json: {
        ...user,
        permissions: Permission.REQUEST + Permission.REQUEST_ADULT,
      },
    });
  });
};

const makeScene = (serviceId: number, serviceName: string, status = 1) => ({
  id: sceneId,
  provider: 'whisparr',
  mediaType: 'adult',
  title: 'Night Garden',
  year: 2025,
  overview: 'A quiet garden scene.',
  studio: 'Orchard House',
  performers: ['Maya Star', 'River Lane'],
  posterPath: `/api/v1/adult/${sceneId}/cover?serverId=${serviceId}`,
  serviceId,
  serviceName,
  mediaInfo: { id: 42, status, serviceId },
});

const installCatalogRoutes = async (page: Page, userId: number) => {
  const queries: string[] = [];
  const serverScopes: string[] = [];

  await page.route('**/api/v1/adult/search*', async (route) => {
    const url = new URL(route.request().url());
    queries.push(url.searchParams.get('query') ?? '');
    const serverId = Number(url.searchParams.get('serverId') ?? 3);
    serverScopes.push(url.searchParams.get('serverId') ?? 'all');
    await route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          makeScene(
            serverId,
            serverId === 4 ? 'Whisparr Archive' : 'Whisparr Main'
          ),
        ],
      },
    });
  });
  await page.route(
    (url) => url.pathname.endsWith(`/adult/${sceneId}/cover`),
    (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(imageFixture, 'base64'),
      })
  );
  await page.route(
    (url) => url.pathname === `/api/v1/adult/${sceneId}`,
    async (route) => {
      const serviceId = Number(
        new URL(route.request().url()).searchParams.get('serverId') ?? 3
      );
      await route.fulfill({
        json: makeScene(
          serviceId,
          serviceId === 4 ? 'Whisparr Archive' : 'Whisparr Main'
        ),
      });
    }
  );
  await page.route('**/api/v1/service/whisparr', (route) =>
    route.fulfill({
      json: [
        { id: 3, name: 'Whisparr Main', isDefault: true },
        { id: 4, name: 'Whisparr Archive', isDefault: false },
      ],
    })
  );
  await page.route(`**/api/v1/user/${userId}/quota`, (route) =>
    route.fulfill({ json: { adult: { limit: 0, restricted: false } } })
  );

  return { queries, serverScopes };
};

test('Adult discovery searches, opens scene details, and keeps the chosen Whisparr destination', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  const { queries } = await installCatalogRoutes(page, user.id);
  let requestBody: unknown;
  await page.route('**/api/v1/request', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { id: 91, status: 1 },
    });
  });

  await page.goto('/discover/adult');
  await expect(
    page.getByRole('heading', { name: 'Recently added scenes' })
  ).toBeVisible();
  const card = page.locator(`a[href^="/adult/${sceneId}"]`);
  await expect(card).toContainText('Night Garden');
  await expect(card.getByAltText('Night Garden')).toHaveAttribute(
    'src',
    new RegExp(`/adult/${sceneId}/cover`)
  );

  const search = page.getByRole('searchbox', { name: 'Search adult scenes' });
  await search.fill('Orchard House');
  const searchRequest = page.waitForRequest((request) => {
    if (!request.url().includes('/api/v1/adult/search')) return false;
    return new URL(request.url()).searchParams.get('query') === 'Orchard House';
  });
  await search.press('Enter');
  await searchRequest;
  await expect
    .poll(() => new URL(page.url()).searchParams.get('query'))
    .toBe('Orchard House');
  await expect(
    page.getByRole('heading', { name: 'Search results' })
  ).toBeVisible();
  expect(queries).toContain('Orchard House');

  await page.locator(`a[href^="/adult/${sceneId}"]`).click();
  await expect(
    page.getByRole('heading', { name: 'Night Garden' }).first()
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Search scenes with Maya Star' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request scene' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const alternateDetailsRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === `/api/v1/adult/${sceneId}` &&
      url.searchParams.get('serverId') === '4'
    );
  });
  await page.locator('select').selectOption('4');
  await alternateDetailsRequest;
  await expect(
    dialog.getByRole('definition').filter({ hasText: 'Whisparr Archive' })
  ).toBeVisible();
  const createRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/v1/request') && request.method() === 'POST'
  );
  await dialog.getByRole('button', { name: 'Request scene' }).click();
  await createRequest;
  expect(requestBody).toEqual({
    mediaId: sceneId,
    mediaType: 'adult',
    serverId: 4,
  });
});

test('Adult request dialog blocks scenes already available at the selected destination', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  await page.route(
    (url) =>
      url.pathname === `/api/v1/adult/${sceneId}` &&
      new URL(url.href).searchParams.get('serverId') === '4',
    async (route) =>
      route.fulfill({ json: makeScene(4, 'Whisparr Archive', 5) })
  );

  await page.goto(`/adult/${sceneId}?serverId=3`);
  await expect(
    page.getByRole('heading', { name: 'Night Garden' }).first()
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request scene' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.locator('select').selectOption('4');
  await expect(
    dialog.getByText('This scene is already available on this server.')
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Request scene' })
  ).toBeDisabled();
});

test('Adult details can manage and cancel the signed-in user’s active request', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  await page.route(
    (url) => url.pathname === `/api/v1/adult/${sceneId}`,
    (route) =>
      route.fulfill({
        json: {
          ...makeScene(3, 'Whisparr Main', 3),
          mediaInfo: {
            id: 42,
            status: 3,
            serviceId: 3,
            requestStatus: 2,
            requestId: 92,
          },
        },
      })
  );
  let deletedRequestId: string | undefined;
  await page.route('**/api/v1/request/92', async (route) => {
    if (route.request().method() === 'DELETE') {
      deletedRequestId = route.request().url().split('/').pop();
      await route.fulfill({ status: 204 });
      return;
    }
    await route.continue();
  });

  await page.goto(`/adult/${sceneId}?serverId=3`);
  await expect(
    page.getByRole('button', { name: 'Manage your request' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage your request' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(
      'Your adult scene request was approved and is being processed.'
    )
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel request' }).click();
  await expect.poll(() => deletedRequestId).toBe('92');
});

test('Adult discovery scopes paged searches to the selected Whisparr server', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  const { serverScopes } = await installCatalogRoutes(page, user.id);

  await page.goto('/discover/adult');
  const serverFilter = page.getByRole('combobox', { name: 'Browse server' });
  await expect(serverFilter).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search adult scenes' });
  await search.fill('Orchard House');

  const scopedSearch = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/adult/search' &&
      url.searchParams.get('serverId') === '4' &&
      url.searchParams.get('query') === 'Orchard House'
    );
  });
  await serverFilter.selectOption('4');
  await scopedSearch;
  await expect
    .poll(() => new URL(page.url()).searchParams.get('serverId'))
    .toBe('4');
  await expect(search).toHaveValue('Orchard House');
  await expect(page.locator(`a[href^="/adult/${sceneId}"]`)).toContainText(
    'Whisparr · Whisparr Archive'
  );
  expect(serverScopes).toContain('4');
});

test('Adult discovery appends the next page without losing the first page', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  const secondSceneId = '8a3c0000-0000-4000-8000-000000000002';
  await page.route('**/api/v1/adult/search*', async (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    const secondScene = {
      ...makeScene(3, 'Whisparr Main'),
      id: secondSceneId,
      title: 'Second Garden',
      posterPath: undefined,
    };
    await route.fulfill({
      json: {
        page: pageNumber,
        totalPages: 2,
        totalResults: 2,
        results: [
          pageNumber === 1 ? makeScene(3, 'Whisparr Main') : secondScene,
        ],
      },
    });
  });

  await page.goto('/discover/adult');
  await expect(page.locator(`a[href^="/adult/${sceneId}"]`)).toContainText(
    'Night Garden'
  );
  const nextPage = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/adult/search' &&
      url.searchParams.get('page') === '2'
    );
  });
  await page.getByRole('button', { name: 'Load more scenes' }).click();
  await nextPage;
  await expect(
    page.locator(`a[href^="/adult/${secondSceneId}"]`)
  ).toContainText('Second Garden');
  await expect(page.locator(`a[href^="/adult/${sceneId}"]`)).toContainText(
    'Night Garden'
  );
});

test('Adult discovery recovers from an unavailable catalog and can clear an empty search', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  let attempts = 0;
  await page.route('**/api/v1/adult/search*', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        json: { status: 503, message: 'Whisparr is restarting.' },
      });
      return;
    }
    await route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [makeScene(3, 'Whisparr Main')],
      },
    });
  });

  await page.goto('/discover/adult');
  await expect(page.getByText('Whisparr is restarting.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator(`a[href^="/adult/${sceneId}"]`)).toContainText(
    'Night Garden'
  );
  expect(attempts).toBeGreaterThanOrEqual(2);

  await page.route('**/api/v1/adult/search*', async (route) =>
    route.fulfill({
      json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
    })
  );
  const search = page.getByRole('searchbox', { name: 'Search adult scenes' });
  await search.fill('No matching scene');
  await search.press('Enter');
  await expect(page.getByText('No scenes match this search.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(
    page.getByText(
      'No scenes are in your Whisparr libraries yet. Search above to browse the scene catalog.'
    )
  ).toBeVisible();
});

test('Adult scene details can retry a failed Whisparr lookup and return to results', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  let detailsAttempts = 0;
  await page.route(
    (url) => url.pathname === `/api/v1/adult/${sceneId}`,
    async (route) => {
      detailsAttempts += 1;
      if (detailsAttempts === 1) {
        await route.fulfill({
          status: 503,
          json: { status: 503, message: 'Whisparr is restarting.' },
        });
        return;
      }
      await route.fulfill({ json: makeScene(3, 'Whisparr Main') });
    }
  );

  await page.goto(
    `/adult/${sceneId}?serverId=3&fromQuery=Orchard%20House&fromServerId=4`
  );
  await expect(
    page.getByText('Adult scene details are unavailable right now.')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Night Garden' }).first()
  ).toBeVisible();
  expect(detailsAttempts).toBeGreaterThanOrEqual(2);

  await page.getByRole('link', { name: 'Back to Adult results' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Browse server' })
  ).toHaveValue('4');
  await expect(
    page.getByRole('searchbox', { name: 'Search adult scenes' })
  ).toHaveValue('Orchard House');
});

test('Adult details let a standard requester request an archive scene on the default server', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await maskCurrentUserAsRequester(page);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  await page.route(
    (url) =>
      url.pathname === `/api/v1/adult/${sceneId}` &&
      url.searchParams.get('serverId') === '4',
    (route) =>
      route.fulfill({
        json: makeScene(4, 'Whisparr Archive', 5),
      })
  );
  let requestBody: unknown;
  await page.route('**/api/v1/request', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: 94, status: 1 } });
  });

  await page.goto('/discover/adult?serverId=4');
  await page.locator(`a[href^="/adult/${sceneId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/adult/${sceneId}(?:\\?|$)`));
  await expect(
    page.getByRole('heading', { name: 'Night Garden' }).first()
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Request on Whisparr Main' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request on Whisparr Main' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Whisparr Main');
  await expect(
    dialog.getByRole('button', { name: 'Request scene' })
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Request scene' }).click();
  await expect
    .poll(() => requestBody)
    .toEqual({
      mediaId: sceneId,
      mediaType: 'adult',
    });
});

test('Adult request dialog recognizes an active request after changing servers', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  await page.route(
    (url) =>
      url.pathname === `/api/v1/adult/${sceneId}` &&
      url.searchParams.get('serverId') === '4',
    (route) =>
      route.fulfill({
        json: {
          ...makeScene(4, 'Whisparr Archive', 3),
          mediaInfo: {
            id: 42,
            status: 3,
            serviceId: 4,
            requestStatus: 1,
            requestId: 96,
          },
        },
      })
  );

  await page.goto(`/adult/${sceneId}?serverId=3`);
  await page.getByRole('button', { name: 'Request scene' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Whisparr server' })
    .selectOption('4');
  await expect(
    dialog.getByText('Your adult scene request is waiting for approval.')
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Cancel request' })
  ).toBeEnabled();
  await expect(
    dialog.getByRole('button', { name: 'Request scene' })
  ).toHaveCount(0);
});

test('Adult discovery preserves its search and server scope on mobile scene navigation', async ({
  page,
  baseURL,
}) => {
  const user = await loginAsAdmin(page, baseURL);
  await enableAdultForBrowser(page);
  await installCatalogRoutes(page, user.id);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('/discover/adult?query=Orchard%20House&serverId=4');
  await expect(
    page.getByRole('searchbox', { name: 'Search adult scenes' })
  ).toHaveValue('Orchard House');
  await expect(
    page.getByRole('combobox', { name: 'Browse server' })
  ).toHaveValue('4');
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await page.screenshot({
    path: '/tmp/seerrng-adult-followup/adult-mobile.png',
    fullPage: true,
  });

  await page.locator(`a[href^="/adult/${sceneId}"]`).click();
  const backLink = page.getByRole('link', { name: 'Back to Adult results' });
  await expect(backLink).toBeVisible();
  const returnUrl = new URL(
    (await backLink.getAttribute('href')) ?? '',
    'http://localhost'
  );
  expect(returnUrl.pathname).toBe('/discover/adult');
  expect(returnUrl.searchParams.get('query')).toBe('Orchard House');
  expect(returnUrl.searchParams.get('serverId')).toBe('4');
  expect(returnUrl.searchParams.has('page')).toBe(false);
  await backLink.click();
  await expect(
    page.getByRole('combobox', { name: 'Browse server' })
  ).toHaveValue('4');
  await expect(
    page.getByRole('searchbox', { name: 'Search adult scenes' })
  ).toHaveValue('Orchard House');
});
