import { expect, test } from '@playwright/test';
import { MediaRequestStatus } from '../server/constants/media';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440]) {
    test(`${theme} book availability requires an available library state at ${width}px`, async ({
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
          await page.request.post('/api/v1/user/1/settings/main', {
            data: { locale: 'en' },
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
      await page.route('**/api/v1/settings/public', async (route) => {
        const response = await route.fetch();
        const settings = await response.json();
        await route.fulfill({
          json: {
            ...settings,
            ...Object.fromEntries(
              Object.keys(settings)
                .filter((key) => key.endsWith('Enabled'))
                .map((key) => [key, true])
            ),
            enabledMediaCategories: Object.fromEntries(
              Object.keys(settings.enabledMediaCategories).map((key) => [
                key,
                true,
              ])
            ),
          },
        });
      });
      let status = 3;
      let requested = true;
      let ebookFiles = false;
      let audioFiles = false;
      let audioAcquiring = false;
      let alternateProfile = false;
      const makeBook = () => ({
        id: 'OL82563W',
        provider: 'openlibrary',
        mediaType: 'book',
        title: 'The Fellowship of the Ring',
        author: 'J. R. R. Tolkien',
        firstPublishYear: 1954,
        subjects: ['Fantasy'],
        isbnCandidates: [],
        description: 'Book availability regression fixture.',
        numberOfPages: 423,
        mediaInfo: {
          id: 990409,
          tmdbId: 0,
          mediaType: 'book',
          status,
          status4k: 1,
          serviceId: 0,
          externalServiceId: 40,
          audiobookServiceId: 1,
          audiobookExternalServiceId: 41,
          availableEbookServiceIds: ebookFiles ? [0] : [],
          availableAudiobookServiceIds: audioFiles ? [1] : [],
          requests: requested
            ? [
                {
                  id: 990409,
                  status:
                    audioAcquiring || alternateProfile
                      ? MediaRequestStatus.COMPLETED
                      : MediaRequestStatus.APPROVED,
                  type: 'book',
                  bookFormat: audioAcquiring ? 'audiobook' : 'ebook',
                  serviceTargets:
                    audioAcquiring || alternateProfile
                      ? [
                          {
                            serviceType: 'readarr',
                            serverId: alternateProfile ? 0 : 1,
                            format: alternateProfile ? 'ebook' : 'audiobook',
                            profileId: 1,
                            metadataProfileId: 1,
                            rootFolder: '/books',
                            status: alternateProfile ? 5 : 3,
                          },
                        ]
                      : [],
                  requestedBy: { id: 1, displayName: 'Admin' },
                  seasons: [],
                },
              ]
            : [],
          issues: [],
          downloadStatus: [],
          audiobookDownloadStatus: [],
        },
      });
      await page.route(/\/api\/v1\/book\/OL82563W(?:\?.*)?$/, (route) =>
        route.fulfill({ json: makeBook() })
      );
      await page.route('**/api/v1/author/OL26320A**', (route) =>
        route.fulfill({
          json: {
            id: 'OL26320A',
            name: 'J. R. R. Tolkien',
            works: [makeBook()],
            pagination: { limit: 20, offset: 0, totalItems: 1 },
          },
        })
      );
      await page.route(
        /\/api\/v1\/book\/OL82563W\/ratings(?:\?.*)?$/,
        (route) => route.fulfill({ json: { count: 0, source: 'openlibrary' } })
      );
      const services = ['ebook', 'audiobook'].map((serviceType, id) => ({
        id,
        name: `Fixture ${serviceType}`,
        serviceType,
        isDefault: true,
        is4k: false,
        activeProfileId: 1,
        activeMetadataProfileId: 1,
        activeDirectory: '/books',
        activeTags: [],
        tagRequests: false,
      }));
      await page.route('**/api/v1/service/readarr**', (route) => {
        const path = new URL(route.request().url()).pathname;
        const id = path.match(/\/(\d+)$/)?.[1];
        const currentServices = services.map((service) => ({
          ...service,
          activeProfileId:
            alternateProfile && service.serviceType === 'ebook' ? 2 : 1,
        }));
        return route.fulfill({
          json:
            id === undefined
              ? currentServices
              : {
                  server: currentServices[Number(id)],
                  profiles: [
                    { id: 1, name: 'Default' },
                    { id: 2, name: 'Alternate' },
                  ],
                  metadataProfiles: [{ id: 1, name: 'Default' }],
                  rootFolders: [{ id: 1, path: '/books' }],
                  tags: [],
                },
        });
      });
      await page.route('**/api/v1/request/status?*', (route) =>
        route.fulfill({
          json: {
            pageInfo: { pages: 0, pageSize: 100, results: 0, page: 1 },
            results: [],
          },
        })
      );
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const state of [
        { name: 'queued', status: 3, requested: true, label: 'Requested' },
        {
          name: 'cancelled',
          status: 1,
          requested: false,
          label: 'Not Available',
        },
        {
          name: 'imported',
          status: 5,
          requested: false,
          label: 'Available',
          ebookFiles: true,
        },
        {
          name: 'manager-records-only',
          status: 5,
          requested: false,
          label: 'Not Available',
        },
        {
          name: 'audio-imported-only',
          status: 5,
          requested: false,
          label: 'Not Available',
          audioFiles: true,
        },
        {
          name: 'audio-acquiring',
          status: 5,
          requested: true,
          label: 'Available',
          ebookFiles: true,
          audioAcquiring: true,
        },
        {
          name: 'alternate-profile',
          status: 5,
          requested: true,
          label: 'Available',
          ebookFiles: true,
          alternateProfile: true,
        },
        {
          name: 'both-imported',
          status: 5,
          requested: false,
          label: 'Available',
          ebookFiles: true,
          audioFiles: true,
        },
      ]) {
        status = state.status;
        requested = state.requested;
        ebookFiles = !!(state as { ebookFiles?: boolean }).ebookFiles;
        audioFiles = !!(state as { audioFiles?: boolean }).audioFiles;
        alternateProfile = !!(state as { alternateProfile?: boolean })
          .alternateProfile;
        audioAcquiring = !!(state as { audioAcquiring?: boolean })
          .audioAcquiring;
        await page.goto('/book/OL82563W');
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await expect(
          page.getByRole('heading', {
            name: 'The Fellowship of the Ring (1954)',
            exact: true,
          })
        ).toBeVisible();
        const ebookValue = page
          .locator('dt')
          .filter({ hasText: /^Book:$/ })
          .locator('xpath=following-sibling::dd[1]');
        await expect(ebookValue).toHaveText(
          process.env.SEERR_BOOK_AVAILABILITY_BASELINE === 'true'
            ? 'Available'
            : state.label
        );
        await expect(
          page
            .locator('dt')
            .filter({ hasText: /^Audiobook:$/ })
            .locator('xpath=following-sibling::dd[1]')
        ).toHaveText(
          process.env.SEERR_BOOK_AVAILABILITY_BASELINE === 'true'
            ? 'Available'
            : audioFiles
              ? 'Available'
              : audioAcquiring
                ? 'Requested'
                : 'Not Available'
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        await expect(
          page.getByText('Checking for available files…')
        ).toHaveCount(0);
        expect(errors).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`${state.name}.png`),
          fullPage: true,
        });
        await page
          .locator('[data-summary-layout="detail"]')
          .first()
          .screenshot({ path: info.outputPath(`${state.name}-summary.png`) });
        if (
          alternateProfile &&
          process.env.SEERR_BOOK_AVAILABILITY_BASELINE !== 'true'
        ) {
          await page
            .getByRole('group', { name: 'Request', exact: true })
            .getByTestId('format-request-option-ebook')
            .click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog.getByTestId('modal-ok-button')).toBeEnabled();
          await dialog.getByTestId('format-request-option-ebook').click();
          await expect(
            dialog.getByTestId('format-request-option-ebook')
          ).toHaveAttribute('aria-pressed', 'true');
          await expect(dialog.getByTestId('modal-ok-button')).toBeEnabled();
          await dialog.screenshot({
            path: info.outputPath('alternate-profile-ebook-request.png'),
          });
          await dialog.getByTestId('modal-cancel-button').click();
        }
        if (
          audioAcquiring &&
          process.env.SEERR_BOOK_AVAILABILITY_BASELINE !== 'true'
        ) {
          await page
            .getByRole('group', { name: 'Request', exact: true })
            .getByTestId('format-request-option-audiobook')
            .click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog.getByTestId('modal-ok-button')).toBeDisabled();
          await dialog.screenshot({
            path: info.outputPath('acquiring-audiobook-request.png'),
          });
          await dialog.getByTestId('modal-cancel-button').click();
        }
        if (
          state.name === 'imported' &&
          process.env.SEERR_BOOK_AVAILABILITY_BASELINE !== 'true'
        ) {
          const audio = page
            .getByRole('group', { name: 'Request', exact: true })
            .getByTestId('format-request-option-audiobook');
          await expect(audio).toBeEnabled();
          await audio.click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(
            dialog.getByTestId('format-request-option-audiobook')
          ).toHaveAttribute('aria-pressed', 'true');
          await expect(dialog.getByTestId('modal-ok-button')).toBeEnabled();
          await dialog.screenshot({
            path: info.outputPath('missing-audiobook-request.png'),
          });
          await dialog.getByTestId('modal-cancel-button').click();
          await page.goto('/author/OL26320A');
          await page
            .getByRole('button', { name: 'Request Bibliography', exact: true })
            .click();
          const bulk = page.getByRole('dialog');
          await expect(bulk).toBeVisible();
          await bulk.getByTestId('format-request-option-audiobook').click();
          await expect(
            bulk.getByRole('button', {
              name: 'The Fellowship of the Ring',
              exact: true,
            })
          ).toBeEnabled();
          await bulk.screenshot({
            path: info.outputPath('missing-audiobook-bibliography.png'),
          });
          await bulk
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
        }
      }
    });
  }
