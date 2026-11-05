import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const baseline = process.env.SEERR_REQUEST_CONTROLS_BASELINE === 'true';
for (const width of [1440, 390]) {
  for (const service of ['radarr', 'sonarr', 'lidarr']) {
    test(`${service} queue and scan controls at ${width}px`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const login = await page
        .context()
        .request.post(`${baseURL}/api/v1/auth/local`, {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        });
      expect(login.status()).toBe(200);
      const fixture = {
        id: 42,
        name: `${service} fixture`,
        hostname: '127.0.0.1',
        port: 8989,
        apiKey: 'fixture-only-api-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'Any',
        activeDirectory: '/media',
        activeLanguageProfileId: 1,
        activeMetadataProfileId: 1,
        activeMetadataProfileName: 'Any',
        isDefault: true,
        is4k: false,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        tags: [],
        syncExcludedTags: [],
        downloadQueueSize: 1000,
        minimumAvailability: 'released',
        externalUrl: '',
      };
      let saved: Record<string, unknown> | undefined;
      await page.route(`**/api/v1/settings/${service}**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith('/test')) {
          await route.fulfill({
            json: {
              profiles: [{ id: 1, name: 'Any' }],
              metadataProfiles: [{ id: 1, name: 'Any' }],
              rootFolders: [{ id: 1, path: '/media' }],
              tags: [{ id: 42, label: 'Archived' }],
              languageProfiles: [{ id: 1, name: 'English' }],
            },
          });
        } else if (route.request().method() === 'PUT') {
          saved = route.request().postDataJSON();
          await route.fulfill({ json: { ...fixture, ...saved } });
        } else {
          await route.fulfill({ json: [fixture] });
        }
      });
      await page.goto('/settings/services');
      if (service === 'lidarr')
        await page.getByRole('button', { name: 'Music', exact: true }).click();
      await page
        .locator('.settings-service-card')
        .filter({ hasText: fixture.name })
        .getByRole('button', { name: 'Edit', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const save = dialog.getByRole('button', {
        name: 'Save Changes',
        exact: true,
      });
      const queue = dialog.getByLabel('Download Queue Size', { exact: true });
      if (baseline) {
        await expect(queue).toHaveCount(0);
      } else {
        await expect(queue).toHaveValue('1000');
        await queue.fill('9');
        await queue.press('Tab');
        await expect(queue).toHaveAttribute('aria-invalid', 'true');
        await expect(save).toBeDisabled();
        await queue.fill('1500');
        await queue.press('Tab');
        await expect(queue).toHaveAttribute('aria-invalid', 'false');
        if (service !== 'lidarr') {
          const tags = dialog.getByLabel('Exclude Tags from Scan', {
            exact: true,
          });
          await expect(tags).toBeEnabled();
          await tags.fill('Archived');
          await page
            .getByRole('option', { name: 'Archived', exact: true })
            .click();
        }
      }
      await page.locator('#syncEnabled').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${service}-${width}.png`),
        animations: 'disabled',
      });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        )
        .toBe(true);
      if (!baseline) {
        await expect(save).toBeEnabled();
        await save.click();
        await expect.poll(() => saved?.downloadQueueSize).toBe(1500);
        if (service !== 'lidarr') expect(saved?.syncExcludedTags).toEqual([42]);
        await expect(dialog).toHaveCount(0);
      }
    });
  }
}
