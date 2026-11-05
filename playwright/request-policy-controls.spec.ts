import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const baseline = process.env.SEERR_POLICY_BASELINE === 'true';
const fixture = {
  id: 0,
  name: 'Policy fixture',
  hostname: '127.0.0.1',
  port: 8989,
  apiKey: 'fixture-only-api-key',
  useSsl: false,
  baseUrl: '',
  activeProfileId: 0,
  activeProfileName: 'Any',
  activeDirectory: '/media',
  activeLanguageProfileId: 0,
  isDefault: true,
  is4k: false,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  tags: [],
  minimumAvailability: 'released',
  externalUrl: '',
  backend: 'readarr',
  serviceType: 'ebook',
};
const serviceResponse = {
  profiles: [{ id: 0, name: 'Any' }],
  rootFolders: [{ id: 1, path: '/media' }],
  tags: [],
  languageProfiles: [{ id: 0, name: 'Zero language' }],
};
async function configure(page: Page, service: 'sonarr' | 'readarr') {
  await page.route('**/api/v1/settings/public', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), booksEnabled: true },
    });
  });
  for (const kind of ['radarr', 'sonarr', 'lidarr', 'readarr']) {
    await page.route(`**/api/v1/settings/${kind}**`, async (route) => {
      await route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/test')
          ? serviceResponse
          : kind === service
            ? [fixture]
            : [],
      });
    });
  }
  await page.route('**/api/v1/regions', (route) =>
    route.fulfill({
      json: [
        { iso_3166_1: 'CA', english_name: 'Canada', native_name: 'Canada' },
        {
          iso_3166_1: 'US',
          english_name: 'United States',
          native_name: 'United States',
        },
      ],
    })
  );
}
for (const width of [1440, 390]) {
  test(`country and language profile override controls at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      (
        await page.request.post(`${baseURL}/api/v1/auth/local`, {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    await configure(page, 'sonarr');
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/v1/overrideRule**', async (route) => {
      if (route.request().method() === 'POST') {
        saved = route.request().postDataJSON();
        await route.fulfill({ json: { ...saved, id: 91 } });
      } else await route.fulfill({ json: [] });
    });
    await page.goto('/settings/services');
    await page
      .getByRole('button', { name: 'New Override Rule', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#service').selectOption('sonarr-0');
    await expect(
      dialog.locator('#profileIdRule option[value="0"]')
    ).toHaveCount(1);
    if (!baseline) {
      await dialog.locator('#productionCountries').fill('Canada');
      await page.getByRole('option', { name: 'Canada', exact: true }).click();
      await dialog.locator('#languageProfileIdRule').selectOption('0');
    }
    await dialog.screenshot({
      animations: 'disabled',
      path: info.outputPath(`country-rule-${width}.png`),
    });
    if (baseline) return;
    await dialog
      .getByRole('button', { name: 'Create rule', exact: true })
      .click();
    await expect
      .poll(() => saved)
      .toMatchObject({
        sonarrServiceId: 0,
        productionCountries: 'CA',
        languageProfileId: 0,
      });
    await expect(dialog).toHaveCount(0);
  });
  test(`Bookshelf-only configuration can create an override at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      (
        await page.request.post(`${baseURL}/api/v1/auth/local`, {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    await configure(page, 'readarr');
    await page.route('**/api/v1/overrideRule**', (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto('/settings/services');
    const action = page.getByRole('button', {
      name: 'New Override Rule',
      exact: true,
    });
    if (baseline) {
      await expect(action).toBeDisabled();
      await page.screenshot({
        animations: 'disabled',
        path: info.outputPath(`books-only-${width}.png`),
      });
      return;
    }
    await expect(action).toBeEnabled();
    await action.click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#service').selectOption('readarr-0');
    await expect(dialog.locator('#genre')).toBeVisible();
    await expect(dialog.locator('#productionCountries')).toHaveCount(0);
    await dialog.screenshot({
      animations: 'disabled',
      path: info.outputPath(`books-only-${width}.png`),
    });
  });
  test(`pending-edit notification opt-in at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      (
        await page.request.post(`${baseURL}/api/v1/auth/local`, {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    let saved: Record<string, unknown> | undefined;
    const state = {
      enabled: false,
      types: 0,
      options: {
        webhookUrl: 'https://example.invalid/notify',
        jsonPayload: '{}',
        authHeader: '',
        customHeaders: [],
        supportVariables: false,
      },
    };
    await page.route(
      '**/api/v1/settings/notifications/webhook',
      async (route) => {
        if (route.request().method() === 'POST') {
          saved = route.request().postDataJSON();
          await route.fulfill({ json: saved });
        } else await route.fulfill({ json: state });
      }
    );
    await page.goto('/settings/notifications/webhook');
    const option = page.locator('#media-pending-updated');
    if (!baseline) {
      await option.check();
      await expect(option).toBeChecked();
    } else await expect(page.locator('#media-requested')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`notification-types-${width}.png`),
      fullPage: true,
    });
    if (baseline) return;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => saved)
      .toMatchObject({ enabled: true, types: 32768 });
  });
}
