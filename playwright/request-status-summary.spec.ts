import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({
  serviceWorkers: 'block',
  reducedMotion: 'reduce',
  timezoneId: 'America/Regina',
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? {
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      }
    : {}),
});
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['seerrOrig', 'seerrNGJ', 'persiusNG'])
  for (const width of [390, 1440]) {
    test(`${theme} request status keeps compact geometry and calendar dates at ${width}px`, async ({
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
      const requester = { id: 2, displayName: 'Movie requester', avatar: '' };
      const account = { id: 1, displayName: 'Admin', avatar: '' };
      const media = {
        id: 9101,
        tmdbId: 550,
        mediaType: 'movie',
        status: 5,
        status4k: 1,
        requests: [],
        issues: [],
        downloadStatus: [],
        downloadStatus4k: [],
      };
      const request = {
        id: 9102,
        type: 'movie',
        status: 5,
        is4k: false,
        media,
        requestedBy: requester,
        seasons: [],
        canRemove: true,
        createdAt: '2026-01-01T12:00:00Z',
        updatedAt: '2026-01-01T12:00:00Z',
      };
      const current = {
        stage: 'available',
        attempt: 1,
        percent: 100,
        size: null,
        sizeLeft: null,
        estimatedCompletionTime: null,
        downloadCount: 0,
        downloadId: null,
        service: 'radarr',
        message: 'Available',
        observedAt: '2026-01-01T12:00:00Z',
        isTerminal: true,
        needsAttention: false,
        retryable: false,
      };
      const pageInfo = { pages: 1, pageSize: 10, results: 1, page: 1 };
      await page.route('**/api/v1/request/status?*', (route) => {
        const { searchParams } = new URL(route.request().url());
        const visible =
          ['all', 'available', 'completed'].includes(
            searchParams.get('filter') ?? 'all'
          ) &&
          [null, String(requester.id)].includes(
            searchParams.get('requestedBy')
          );
        return route.fulfill({
          json: {
            pageInfo: visible ? pageInfo : { ...pageInfo, results: 0 },
            results: visible
              ? [{ request, status: current, canRemove: true }]
              : [],
            counts: {
              total: 1,
              pending: 1,
              active: 0,
              incomplete: 0,
              attention: 0,
              completed: 1,
              unavailable: 0,
              failed: 0,
            },
            olderCount: 0,
          },
        });
      });
      await page.route('**/api/v1/request/count', (route) =>
        route.fulfill({ json: { pending: 1, total: 2 } })
      );
      await page.route('**/api/v1/request/status/users?*', (route) =>
        route.fulfill({ json: { pageInfo, results: [account, requester] } })
      );
      await page.route('**/api/v1/request/status/9102', (route) =>
        route.fulfill({
          json: { request, current, history: { results: [], total: 0 } },
        })
      );
      await page.route('**/api/v1/request/status/9102/downloads', (route) =>
        route.fulfill({ json: { results: [], hadErrors: false } })
      );
      await page.route('**/api/v1/movie/550', (route) =>
        route.fulfill({
          json: {
            id: 550,
            title: 'Calendar Date Fixture',
            originalTitle: 'Calendar Date Fixture',
            releaseDate: '1999-10-15',
            runtime: 139,
            genres: [{ id: 18, name: 'Drama' }],
            credits: { cast: [], crew: [] },
            productionCompanies: [],
            mediaInfo: media,
          },
        })
      );
      await page.goto('/requests');
      if (width >= 640) {
        const requestLink = page.locator(
          'a[data-navigation-link-id="requests"]:visible'
        );
        await expect(requestLink.first()).toHaveAttribute('href', '/requests');
      }
      if (theme === 'persiusNG') {
        await expect(
          page
            .getByRole('link', { name: 'Calendar Date Fixture', exact: true })
            .first()
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: /^All/ }).first()
        ).toHaveAttribute('aria-pressed', 'true');
        return;
      }
      const card = page.getByTestId('request-status-9102');
      await expect(card).toBeVisible();
      await expect(
        card.getByText('Calendar Date Fixture (1999)', { exact: true })
      ).toBeVisible();
      const geometry = await card.evaluate((node) => {
        const poster = node
          .querySelector('.detail-card-poster')!
          .getBoundingClientRect();
        const title = node
          .querySelector('.detail-summary-title')!
          .getBoundingClientRect();
        return {
          posterWidth: poster.width,
          topDifference: Math.abs(title.top - poster.top),
          overflow: node.scrollWidth - node.clientWidth,
        };
      });
      expect(geometry.posterWidth).toBe(width < 640 ? 64 : 80);
      expect(geometry.topDifference).toBeLessThanOrEqual(2);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await expect(
        card.getByRole('heading', { name: 'History', exact: true })
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath('request-status.png'),
        fullPage: true,
        animations: 'disabled',
      });
      await expect(
        card.getByText('Oct 15, 1999', { exact: true })
      ).toBeVisible();
      await expect(card.getByText('Oct 14, 1999', { exact: true })).toHaveCount(
        0
      );
    });
  }
