import { expect, test, type Locator } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
import { expectSummaryPairsAligned } from './helpers/summaryPairs';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

async function expectTrackColumnsAligned(layout: Locator) {
  const tables = await layout.locator('section').evaluateAll((sections) =>
    sections.map((section) => {
      const fields = (row: Element) =>
        [...row.children].map((field) =>
          field.getBoundingClientRect().toJSON()
        );
      const heading = section.querySelector('.media-inset-table-heading')!;
      return {
        heading: fields(heading),
        rows: [...section.querySelectorAll('.album-track-body > div')].map(
          fields
        ),
      };
    })
  );
  for (const table of tables) {
    expect(table.rows.length).toBeGreaterThan(0);
    for (const row of table.rows) {
      expect(row.length).toBe(table.heading.length);
      row.slice(1).forEach((field, offset) => {
        const index = offset + 1;
        expect(
          Math.abs(field.left - table.heading[index].left)
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(field.right - table.heading[index].right)
        ).toBeLessThanOrEqual(1);
      });
    }
  }
}

for (const theme of ['seerrOrig', 'seerrNGJ', 'persiusNG'])
  for (const width of [320, 390, 1440])
    for (const trackCount of [1, 12])
      test(`${theme} music request ${width}${trackCount > 1 ? ' with 12 tracks' : ''}`, async ({
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
          tracks: Array.from({ length: trackCount }, (_, index) => ({
            name:
              index === 0
                ? 'Opening Track'
                : `Long album track title ${index + 1}`,
            position: index === 0 ? 1 : index + 100,
            length: index === 0 ? 180000 : 19000000,
            recordingMbid:
              index === 0
                ? id
                : `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
            totalListenCount: 0,
            totalUserCount: 0,
            artists: [{ name: 'Fixture Artist', mbid: id }],
          })),
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
        await expect(pageTracks.locator('section')).toHaveCount(
          Math.min(trackCount, 2)
        );
        expect(
          await pageTracks.evaluate(
            (node) => node.scrollWidth - node.clientWidth
          )
        ).toBeLessThanOrEqual(1);
        await expectTrackColumnsAligned(pageTracks);
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
        await expect(tracks.locator('section')).toHaveCount(
          Math.min(
            trackCount,
            (await tracks.getAttribute('data-track-layout')) === 'three' ? 3 : 2
          )
        );
        await expect(
          tracks.getByText('Opening Track', { exact: true })
        ).toBeVisible();
        await info.attach('track-layout-metrics', {
          body: JSON.stringify(
            await tracks.evaluate((node) => ({
              width: node.clientWidth,
              scrollWidth: node.scrollWidth,
              descendants: [
                ...node.querySelectorAll(
                  'section, .album-track-fields, .album-track-body, .album-track-fields > *'
                ),
              ].map((element) => {
                const style = getComputedStyle(element);
                return {
                  tag: element.tagName,
                  className: element.className,
                  text: element.textContent,
                  rect: element.getBoundingClientRect().toJSON(),
                  columns: style.gridTemplateColumns,
                  font: style.font,
                  whiteSpace: style.whiteSpace,
                  overflowWrap: style.overflowWrap,
                  padding: style.padding,
                };
              }),
            })),
            null,
            2
          ),
          contentType: 'application/json',
        });
        expect(
          await tracks.evaluate((node) => node.scrollWidth - node.clientWidth)
        ).toBeLessThanOrEqual(1);
        await expectTrackColumnsAligned(tracks);

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
        await expectSummaryPairsAligned(summary);
        await dialog.getByTestId('modal-cancel-button').click();
      });
