import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const width of [390, 1440]) {
  test(`BookOrbit request recovery retains status and deletion at ${width}px`, async ({
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
          data: { theme: 'seerrNGJ' },
        })
      ).status()
    ).toBe(200);
    const requester = { id: 1, displayName: 'Admin', avatar: '' };
    const request = {
      id: 9142,
      type: 'book',
      status: 2,
      bookFormat: 'ebook',
      is4k: false,
      requestedBy: requester,
      seasons: [],
      createdAt: '2026-11-16T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
      media: {
        id: 9143,
        mediaType: 'book',
        status: 3,
        identifiers: [{ provider: 'openlibrary', value: 'OL123W' }],
        downloadStatus: [],
        audiobookDownloadStatus: [],
      },
    };
    const current = {
      stage: 'searching',
      attempt: 1,
      percent: null,
      size: null,
      sizeLeft: null,
      estimatedCompletionTime: null,
      downloadCount: 0,
      downloadId: null,
      service: 'BookOrbit',
      message: 'Waiting for BookOrbit to approve this request.',
      observedAt: '2026-11-16T00:00:00Z',
      isTerminal: false,
      needsAttention: false,
      retryable: false,
    };
    const pageInfo = { pages: 1, pageSize: 10, results: 1, page: 1 };
    await page.route('**/api/v1/request/status?*', (route) =>
      route.fulfill({
        json: {
          pageInfo,
          results: [{ request, status: current, canRemove: false }],
          olderCount: 0,
          counts: {
            total: 1,
            pending: 0,
            active: 1,
            incomplete: 1,
            attention: 0,
            completed: 0,
            unavailable: 0,
            failed: 0,
          },
        },
      })
    );
    await page.route('**/api/v1/request/status/users?*', (route) =>
      route.fulfill({ json: { pageInfo, results: [requester] } })
    );
    await page.route('**/api/v1/request/status/9142', (route) =>
      route.fulfill({
        json: {
          request,
          current,
          history: { results: [], total: 0 },
        },
      })
    );
    await page.route('**/api/v1/request/status/9142/downloads', (route) =>
      route.fulfill({ json: { results: [], hadErrors: false } })
    );
    let malformed = false;
    await page.route('**/api/v1/book/OL123W', (route) =>
      route.fulfill({
        json: {
          id: 'OL123W',
          mediaType: 'book',
          title: 'BookOrbit recovery fixture',
          author: 'Fixture author',
          firstPublishYear: 2020,
          subjects: malformed ? [null] : ['Fantasy'],
        },
      })
    );
    await page.goto('/requests');
    const card = page.getByTestId('request-status-9142');
    await expect(card.getByText('BookOrbit recovery fixture')).toBeVisible();
    await expect(
      card.getByText(current.message, { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('bookorbit-request-normal.png'),
      fullPage: true,
    });
    malformed = true;
    await page.reload();
    await expect(
      card.getByText(
        'Request details could not be displayed. Status tracking is still active.'
      )
    ).toBeVisible();
    await expect(
      card.getByText(current.message, { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Oops', { exact: true })).toHaveCount(0);
    expect(
      await card.evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath('bookorbit-request-recovery.png'),
      fullPage: true,
    });
    await card.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByText('Delete Request Entry?', { exact: true })
    ).toBeVisible();
  });
}
