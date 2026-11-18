import { expect, test, type Page } from '@playwright/test';

async function session(page: Page, permissions: unknown, configured?: string) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { seerrPublicUrl: configured } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    const json =
      path === '/auth/me'
        ? { id: 1, displayName: 'Household', permissions }
        : path === '/settings/public'
          ? {
              mediaServerType: 1,
              enabledMediaCategories: {
                music: true,
                comic: true,
                magazine: true,
                game: true,
                sports: true,
                adult: true,
              },
            }
          : path === '/lumen/configuration'
            ? { seerrPublicUrl: configured }
            : path.includes('genreslider')
              ? []
              : { results: [], page: 1, totalPages: 1, totalResults: 0 };
    return route.fulfill({ json });
  });
}

test('administration is visible in navigation and at the start of You', async ({
  page,
}, info) => {
  await session(page, 2);
  await page.goto('/me');
  await expect(
    page.getByRole('heading', { name: 'Administration', exact: true })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('you.png') });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
  await page.screenshot({ path: info.outputPath('discover.png') });
  if (desktop) {
    await expect(
      nav.getByRole('link', { name: 'Lumen Settings', exact: true })
    ).toBeVisible();
    await nav
      .getByRole('link', { name: 'SeerrNG Administration', exact: true })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Tabs', exact: true })
      .getByRole('link', { name: 'You', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Administration', exact: true })
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Open SeerrNG Administration', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('heading', { name: 'Administration', level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open System Caches' })
  ).toHaveAttribute('href', '/admin/caches');
  await page.screenshot({ path: info.outputPath('administration.png') });
  await page
    .getByRole('link', { name: 'Open Lumen Settings', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Lumen settings for everyone',
      exact: true,
    })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

for (const permissions of [32, 4, '2', [2], -2, 2.5]) {
  test(`non-admin or invalid mask ${JSON.stringify(permissions)} has no admin navigation`, async ({
    page,
  }) => {
    await session(page, permissions);
    await page.goto('/me');
    await expect(
      page.getByRole('heading', { name: 'You', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Lumen Settings', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /SeerrNG Administration/ })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Administration', exact: true })
    ).toHaveCount(0);
    await expect(page.getByText('Full SeerrNG', { exact: true })).toBeVisible();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/me$/);
    await page.goto('/me/lumen');
    await expect(page.getByText('Admins only', { exact: true })).toBeVisible();
  });
}

test('configured companion destination is retained with the classic interface escape', async ({
  page,
}) => {
  await session(page, 2, 'https://seerr.example.test/base/?keep=1');
  await page.goto('/me');
  const link = page.getByRole('link', {
    name: 'Open Full SeerrNG',
    exact: true,
  });
  await expect(link).toHaveAttribute(
    'href',
    'https://seerr.example.test/base/?keep=1&interface=classic'
  );
});

test('About opens release history on demand and retries a failed lookup', async ({
  page,
}) => {
  await session(page, 2);
  await page.route('**/api/v1/settings/about', (route) =>
    route.fulfill({
      json: {
        version: '3.72.38',
        totalMediaItems: 10,
        totalRequests: 5,
        appDataPath: '/config',
      },
    })
  );
  let lookups = 0;
  const notes = 'Fixture release notes.\nhttps://github.com/' + 'a'.repeat(200);
  await page.route(
    'https://api.github.com/repos/snapetech-org/seerrng/releases?per_page=20',
    (route) =>
      ++lookups === 1
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: [
              {
                tag_name: 'v3.72.38',
                name: 'Fixture Release',
                body: notes,
              },
            ],
          })
  );
  await page.goto('./admin/about');
  const open = page.getByRole('button', { name: 'Show Releases' });
  await expect(open).toBeVisible();
  expect(lookups).toBe(0);
  await open.click();
  await expect(page.getByRole('alert')).toContainText(
    'Release history could not be loaded'
  );
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page
    .getByText('Fixture Release · Latest · Installed', { exact: true })
    .click();
  const releaseNotes = page.getByText(notes);
  await expect(releaseNotes).toBeVisible();
  expect(
    await releaseNotes.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        element.scrollWidth <= element.clientWidth &&
        bounds.right <= document.documentElement.clientWidth
      );
    })
  ).toBe(true);
  await expect(
    page.getByRole('link', { name: 'View on GitHub' })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/releases/tag/v3.72.38'
  );
  expect(lookups).toBe(2);
});
