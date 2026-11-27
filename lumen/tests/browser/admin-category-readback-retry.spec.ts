import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function mockAdmin(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/auth/me')
        ? { id: 1, displayName: 'Administrator', permissions: 2 }
        : path.endsWith('/user/1/settings/main')
          ? { locale: 'en', lumenPreferences: {} }
          : path.endsWith('/settings/public')
            ? { applicationTitle: 'SeerrNG' }
            : {},
    });
  });
}

for (const defaults of [false, true]) {
  const field = defaults
    ? 'defaultEnabledMediaCategories'
    : 'enabledMediaCategories';
  const section = defaults ? 'Default User Categories' : 'Available Categories';
  const saveName = defaults ? 'Save Default Categories' : 'Save Categories';
  const savedNotice = defaults
    ? 'Default categories saved.'
    : 'Category settings saved.';

  test(`${section} reports uncertain persistence when readback fails`, async ({
    page,
  }, testInfo) => {
    let movieEnabled = true;
    let settingsReads = 0;
    let writes = 0;
    await mockAdmin(page);
    await page.route('**/api/v1/settings/main', (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<
          string,
          Record<string, boolean>
        >;
        expect(body).toEqual({ [field]: { movie: false } });
        writes++;
        if (writes > 1) movieEnabled = false;
        return route.fulfill({
          json: { [field]: { movie: false, tv: true, adult: false } },
        });
      }
      settingsReads++;
      if (settingsReads === 2)
        return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      return route.fulfill({
        json: {
          [field]: { movie: movieEnabled, tv: true, adult: false },
        },
      });
    });

    await page.goto(appPath('/admin/categories'));
    const panel = page.locator('section').filter({
      has: page.getByRole('heading', { name: section }),
    });
    const movies = panel.getByRole('checkbox', { name: 'Movies', exact: true });
    await movies.uncheck();
    const save = panel.getByRole('button', { name: saveName });
    await save.click();
    await expect(page.getByRole('alert')).toHaveText(
      'The server did not confirm the saved categories.'
    );
    await expect(movies).not.toBeChecked();
    await expect(save).toBeEnabled();
    if (
      process.env.LUMEN_CAPTURE_CATEGORY_READBACK &&
      ['desktop', 'iphone'].includes(testInfo.project.name)
    )
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE_CATEGORY_READBACK}/${defaults ? 'defaults' : 'instance'}-unconfirmed-${testInfo.project.name}.png`,
        fullPage: true,
      });

    await save.click();
    await expect(panel.getByText(savedNotice, { exact: true })).toBeVisible();
    await expect(movies).not.toBeChecked();
    await expect(save).toBeDisabled();
    expect(writes).toBe(2);
  });
}
