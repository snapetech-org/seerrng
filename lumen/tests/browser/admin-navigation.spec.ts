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
