import { expect, test, type Page, type TestInfo } from '@playwright/test';

type RequestState =
  'pending' | 'failed' | 'approved' | 'downloading' | 'cancelled';

async function openHistory(
  page: Page,
  permissions: number,
  ownerId: number,
  state: RequestState,
  onAction?: (action: string, body: unknown) => 'confirmation-required' | 'ok'
) {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_SOFTWARE_HISTORY_LOCALE ?? ''
  )
    ? process.env.LUMEN_SOFTWARE_HISTORY_LOCALE!
    : 'en';
  const writes: { action: string; body: unknown }[] = [];
  let currentState = state;
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Request Viewer',
          permissions,
          userType: 2,
        },
      });
    if (/^\/user\/\d+\/settings\/main$/.test(path))
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { softwareEnabled: true, enabledMediaCategories: { game: true } },
      });
    if (path === '/settings/discover') return route.fulfill({ json: [] });
    if (path === '/request')
      return route.fulfill({
        json: { pageInfo: { pages: 1, results: 0 }, results: [] },
      });
    if (path === '/request/count')
      return route.fulfill({ json: { pending: 0 } });
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: 0 } });
    if (path === '/request/software/status')
      return route.fulfill({ json: { results: [], pageInfo: { pages: 0 } } });
    if (path === '/request/software/status/71' && request.method() === 'GET')
      return route.fulfill({
        json: {
          status: currentState,
          request: {
            id: 71,
            category: 'game',
            title: 'Fixture Software Request',
            status: currentState,
            requestedBy: { id: ownerId },
            actions: { retry: true, cancel: true },
          },
          history: [
            { id: 1, status: 'searching', createdAt: '2026-11-20T12:00:00Z' },
          ],
          assets: [{ id: 'fixture-asset', name: 'Fixture Software Asset' }],
        },
      });
    if (
      path === '/request/software/status/71' &&
      request.method() === 'DELETE'
    ) {
      writes.push({ action: 'clear', body: null });
      return route.fulfill({ status: 204, body: '' });
    }
    const actionMatch = path.match(
      /^\/request\/software\/status\/71\/([\w-]+)$/
    );
    if (actionMatch && request.method() === 'POST') {
      const action = actionMatch[1];
      const body = request.postDataJSON();
      writes.push({ action, body });
      const response = onAction?.(action, body) ?? 'ok';
      if (response === 'confirmation-required')
        return route.fulfill({
          status: 409,
          json: {
            message: 'Confirm no matching download.',
            confirmationRequired: 'confirmNoExistingDownload',
          },
        });
      if (action === 'approve') currentState = 'approved';
      if (action === 'retry') currentState = 'pending';
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/requests?softwareRequestId=71');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Fixture Software Request')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  return { dialog, writes };
}

test('software request history exposes only owner actions for a pending request', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 32, 1, 'pending');
  await expect(dialog.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Decline' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Withdraw' }).click();
  await expect(
    dialog.getByText('Withdraw this pending software request?')
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Back' }).click();
  expect(writes).toEqual([]);
});

test('a view-only user sees history without mutation controls', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 16384, 2, 'pending');
  await expect(
    dialog.getByText('Pending Approval', { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: /Approve|Decline|Withdraw/ })
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('a request manager can approve a pending software request', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 16, 2, 'pending');
  await expect(dialog.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Decline' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => writes).toEqual([{ action: 'approve', body: null }]);
});

test('retry requires explicit confirmation when provider state is uncertain', async ({
  page,
}, info) => {
  let confirmationNeeded = true;
  const { dialog, writes } = await openHistory(page, 32, 1, 'failed', () => {
    if (confirmationNeeded) {
      confirmationNeeded = false;
      return 'confirmation-required';
    }
    return 'ok';
  });
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(
    dialog.getByText(/Check the download client’s queue and history/)
  ).toBeVisible();
  await dialog.screenshot({
    path: info.outputPath('software-history-uncertain.png'),
  });
  expect(writes).toEqual([
    { action: 'retry', body: { confirmNoExistingDownload: false } },
  ]);
  await dialog
    .getByRole('button', { name: 'No Download Found — Retry' })
    .click();
  await expect
    .poll(() => writes)
    .toEqual([
      { action: 'retry', body: { confirmNoExistingDownload: false } },
      { action: 'retry', body: { confirmNoExistingDownload: true } },
    ]);
});

test('a request manager can decline after reviewing the confirmation', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 16, 2, 'pending');
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await expect(
    dialog.getByText('Decline this software request?')
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm Decline' }).click();
  await expect.poll(() => writes).toEqual([{ action: 'decline', body: null }]);
});

test('a request manager can cancel a downloading software request', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 16, 2, 'downloading');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByText('Cancel this software request?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm Cancel' }).click();
  await expect
    .poll(() => writes)
    .toEqual([
      { action: 'cancel', body: { confirmNoExistingDownload: false } },
    ]);
});

test('a request manager can stop tracking after confirmation', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 16, 2, 'downloading');
  await dialog.getByRole('button', { name: 'Remove from Requests' }).click();
  await expect(
    dialog.getByText(/Remove this request and its history/)
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Confirm Remove from Requests' })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([{ action: 'stop-tracking', body: null }]);
});

test('a request manager can clear cancelled request history after confirmation', async ({
  page,
}) => {
  const { dialog, writes } = await openHistory(page, 16, 2, 'cancelled');
  await dialog.getByRole('button', { name: 'Clear cancelled request' }).click();
  await expect(dialog.getByText('Clear This Cancelled Request?')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Confirm Clear cancelled request' })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([{ action: 'clear', body: null }]);
});

test('software request history follows the saved locale and viewport', async ({
  page,
}, info: TestInfo) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_SOFTWARE_HISTORY_LOCALE ?? ''
  )
    ? (process.env.LUMEN_SOFTWARE_HISTORY_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
  const expected = (
    english: string,
    french: string,
    arabic: string,
    baselineEnglish = english
  ) =>
    candidate
      ? locale === 'ar'
        ? arabic
        : locale === 'fr'
          ? french
          : english
      : baselineEnglish;
  const { dialog } = await openHistory(page, 32, 1, 'failed');
  await expect(dialog).toHaveAttribute(
    'aria-label',
    expected('History', 'Historique', 'سجل الحالة', 'History')
  );
  await expect(
    dialog.getByRole('heading', {
      name: expected('History', 'Historique', 'سجل الحالة', 'History'),
    })
  ).toBeVisible();
  await expect(
    dialog.getByText(expected('Failed', 'Échec', 'فشل'), { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', {
      name: expected('Retry', 'Réessayer', 'إعادة المحاولة'),
    })
  ).toBeVisible();
  await expect(
    dialog.getByRole('heading', {
      name: expected(
        'Download copies',
        'Télécharger des copies',
        'تنزيل النسخ',
        'Download Files'
      ),
    })
  ).toBeVisible();
  await expect(page.getByText("Couldn't load requests")).toHaveCount(0);
  await expect(
    dialog.getByText(
      expected('Searching', 'Recherche en cours', 'جارٍ البحث'),
      {
        exact: true,
      }
    )
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  const screenshotDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (screenshotDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${screenshotDir}/software-history-${locale}-${info.project.name}.png`,
      fullPage: true,
    });
});
