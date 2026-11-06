import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [320, 390, 1440])
    test(`${theme} music request ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      expect(
        (
          await page.request.post('/api/v1/auth/local', {
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      expect(
        (
          await page.request.post('/api/v1/user/1/settings/interface-theme', {
            data: { theme },
          })
        ).status()
      ).toBe(200);
      const id = '11111111-1111-4111-8111-111111111111';
      const album = {
        id,
        mbId: id,
        title: 'Compact Music Summary',
        mediaType: 'album',
        type: 'Album',
        releaseDate: '2001-01-01',
        artist: { id, name: 'Fixture Artist' },
        tracks: [
          {
            name: 'Opening Track',
            position: 1,
            length: 180000,
            recordingMbid: id,
            totalListenCount: 0,
            totalUserCount: 0,
            artists: [{ name: 'Fixture Artist', mbid: id }],
          },
        ],
        tags: { artist: [], releaseGroup: [] },
      };
      const service = {
        id: 0,
        name: 'Fixture Lidarr',
        musicQuality: 'flac',
        isDefault: true,
        activeProfileId: 1,
        activeMetadataProfileId: 1,
        activeDirectory: '/music',
        activeTags: [],
        tagRequests: false,
      };
      await page.route('**/api/v1/settings/public', async (route) => {
        const r = await route.fetch();
        const b = await r.json();
        await route.fulfill({
          json: {
            ...b,
            musicEnabled: true,
            enabledMediaCategories: {
              ...b.enabledMediaCategories,
              music: true,
            },
          },
        });
      });
      await page.route(`**/api/v1/music/${id}**`, (route) =>
        route.fulfill({
          json: new URL(route.request().url()).pathname.endsWith(id)
            ? album
            : {
                ratings: [],
                failedSources: [],
                results: [],
                page: 1,
                totalPages: 0,
                totalResults: 0,
              },
        })
      );
      await page.route('**/api/v1/service/lidarr**', (route) =>
        route.fulfill({
          json: new URL(route.request().url()).pathname.endsWith('/0')
            ? {
                server: service,
                profiles: [{ id: 1, name: 'Default' }],
                metadataProfiles: [{ id: 1, name: 'Default' }],
                rootFolders: [{ id: 1, path: '/music' }],
                tags: [],
              }
            : [service],
        })
      );
      await page.route('**/api/v1/user/1/quota', (route) =>
        route.fulfill({
          json: {
            music: { limit: 0, used: 0, remaining: 0, restricted: false },
          },
        })
      );
      await page.goto(`/music/${id}`);
      await expect(
        page.getByRole('heading', {
          name: 'Compact Music Summary (2001)',
          exact: true,
        })
      ).toBeVisible();
      const pageTracks = page.locator('.album-track-layout:visible');
      await expect(pageTracks).toHaveCount(1);
      await expect(pageTracks.locator('section')).toHaveCount(1);
      expect(
        await pageTracks.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      await pageTracks.screenshot({
        path: info.outputPath('music-detail-tracks.png'),
      });
      await page
        .getByRole('group', { name: 'Request', exact: true })
        .getByTestId('format-request-option-flac')
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('modal-ok-button')).toBeEnabled();
      const summary = dialog.locator('.detail-summary-card');
      const tracks = dialog.locator('.album-track-layout:visible');
      await expect(tracks).toHaveCount(1);
      await expect(tracks.locator('section')).toHaveCount(1);
      await expect(
        tracks.getByText('Opening Track', { exact: true })
      ).toBeVisible();
      expect(
        await tracks.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);

      for (const value of await summary.locator('dd').evaluateAll((els) =>
        els.map((el) => ({
          text: el.textContent,
          w: el.clientWidth,
          sw: el.scrollWidth,
          h: el.clientHeight,
          sh: el.scrollHeight,
        }))
      )) {
        expect(value.sw, value.text || '').toBeLessThanOrEqual(value.w + 1);
        expect(value.sh, value.text || '').toBeLessThanOrEqual(value.h + 1);
      }
      await dialog.screenshot({ path: info.outputPath('music-request.png') });
      await dialog.getByTestId('modal-cancel-button').click();
    });
