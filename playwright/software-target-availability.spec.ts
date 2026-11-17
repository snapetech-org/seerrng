import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const width of [390, 1440]) {
  for (const state of ['available', 'tracked']) {
    test(`software ${state} target is disabled while another system remains requestable at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      expect(
        (
          await page.request.post('/api/v1/auth/local', {
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme: 'persiusNG' },
      });
      await page.route('**/api/v1/settings/public', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          json: {
            ...(await response.json()),
            romarrEnabled: true,
            enabledMediaCategories: { retro: true, modern: true, game: false },
          },
        });
      });
      const systems = [
        { slug: 'nes', name: 'Nintendo Entertainment System', group: 'retro' },
        { slug: 'snes', name: 'Super Nintendo', group: 'retro' },
      ];
      await page.route('**/api/v1/request/software/catalog/systems', (route) =>
        route.fulfill({ json: { results: systems } })
      );
      await page.route(
        '**/api/v1/request/software/catalog/games/42?*',
        (route) =>
          route.fulfill({
            json: {
              game: {
                id: 'igdb-42',
                catalogId: '42',
                catalogProvider: 'igdb',
                igdbId: 42,
                title: 'Target fixture',
                summary: 'Per-system availability fixture.',
                coverUrl: '',
                genres: [],
                platforms: systems.map((system) => system.name),
                platformOptions: [],
                emulationSystems: systems,
                availability: state,
                availableSystems: state === 'available' ? ['nes'] : [],
                trackedSystems: state === 'tracked' ? ['nes'] : [],
              },
            },
          })
      );
      await page.route('**/api/v1/game-library/lookup?*', (route) =>
        route.fulfill({ json: { entry: null } })
      );
      await page.goto('/software?category=retro&game=42');
      const blocked = page.getByRole('button', {
        name: state === 'available' ? 'In library' : 'Tracked',
        exact: true,
      });
      await expect(blocked).toBeDisabled();
      await page.screenshot({
        path: info.outputPath('software-blocked-target.png'),
        fullPage: true,
      });
      await page
        .getByRole('combobox', { name: 'Emulation system' })
        .selectOption('snes');
      await expect(
        page.getByRole('button', { name: 'Request', exact: true })
      ).toBeEnabled();
    });
  }
}
