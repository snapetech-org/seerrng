import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function openBookManager(page: Page, permissions: number) {
  const deletes: { path: string; body: unknown }[] = [];
  const libraryReads: string[] = [];
  let requestDeleteAttempts = 0;
  let requestDeleted = false;
  let issueStatus = 1;
  let issueDeleted = false;
  let issueCloseAttempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions, settings: {} } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          booksEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Managed Book',
          provider: 'bookshelf',
          mediaInfo: {
            id: 42,
            status: 5,
            serviceUrl: 'https://books.example/book/12',
            audiobookServiceUrl: 'https://books.example/audiobook/12',
            downloadStatus: [
              { downloadId: 'ebook-1', status: 'Downloading', percent: 35 },
            ],
            audiobookDownloadStatus: [
              { downloadId: 'audio-1', status: 'Queued', percent: 0 },
            ],
            requests: requestDeleted
              ? []
              : [
                  {
                    id: 77,
                    status: 2,
                    bookFormat: 'ebook',
                    requestedBy: { id: 1, displayName: 'reader' },
                  },
                  {
                    id: 78,
                    status: 3,
                    bookFormat: 'audiobook',
                    requestedBy: { id: 1, displayName: 'reader' },
                  },
                ],
            issues: issueDeleted
              ? []
              : [
                  {
                    id: 91,
                    status: issueStatus,
                    issueType: 1,
                    comments: [{ message: 'Missing pages in this edition.' }],
                  },
                ],
          },
        },
      });
    if (path === '/issue/91' && request.method() === 'GET')
      return issueDeleted
        ? route.fulfill({ status: 404, json: { message: 'Issue not found.' } })
        : route.fulfill({ json: { id: 91, status: issueStatus } });
    if (path === '/issue/91/resolved' && request.method() === 'POST') {
      issueCloseAttempts++;
      if (issueCloseAttempts === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary issue service failure' },
        });
      issueStatus = 2;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/issue/91' && request.method() === 'DELETE') {
      issueDeleted = true;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/request/77/status' && request.method() === 'DELETE') {
      requestDeleteAttempts++;
      if (requestDeleteAttempts === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary request service failure' },
        });
      requestDeleted = true;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/media/42/library') {
      libraryReads.push(request.method());
      if (request.method() === 'DELETE') {
        deletes.push({ path, body: request.postDataJSON() });
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({
        json: {
          token: 'verified-plan-token',
          verifiedServices: 2,
          targets: [
            {
              key: 'ebook',
              serviceId: 1,
              serviceType: 'readarr',
              externalId: 12,
              service: 'Bookshelf (Book)',
              quality: 'Ebook',
              url: 'https://books.example/book/12',
            },
            {
              key: 'audio',
              serviceId: 2,
              serviceType: 'readarr',
              externalId: 13,
              service: 'Bookshelf (Audiobook)',
              quality: 'Audiobook',
              url: 'https://books.example/audiobook/12',
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  return { deletes, libraryReads };
}

test('book manager shows requests and both formats, and confirms exact library copies', async ({
  page,
}) => {
  const { deletes, libraryReads } = await openBookManager(page, 2);
  await page.getByRole('button', { name: 'Manage Book' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage Book' });
  await expect(sheet.getByText('Requests')).toBeVisible();
  const capture = process.env.LUMEN_MANAGE_REQUEST_CAPTURE;
  if (capture && ['desktop', 'iphone'].includes(test.info().project.name)) {
    await mkdir(dirname(capture), { recursive: true });
    const requestRow = sheet.locator('li.set').first();
    await requestRow.screenshot({
      path: `${capture}-${test.info().project.name}-candidate.png`,
    });
    await requestRow
      .getByRole('button', { name: 'Delete Request' })
      .evaluate((button) => button.remove());
    await requestRow.screenshot({
      path: `${capture}-${test.info().project.name}-baseline.png`,
    });
    await page.reload();
    await page.getByRole('button', { name: 'Manage Book' }).click();
    await expect(sheet).toBeVisible();
  }
  await expect(
    sheet
      .getByRole('region', { name: 'Requests' })
      .getByText('#77 · Approved · Ebook')
  ).toBeVisible();
  await expect(sheet.getByText('Downloading')).toBeVisible();
  await expect(sheet.getByText('Queued')).toBeVisible();
  await expect(
    sheet.getByRole('link', { name: 'Open Ebook in Bookshelf' })
  ).toHaveAttribute('href', 'https://books.example/book/12');
  await expect(
    sheet.getByRole('link', { name: 'Open Audiobook in Bookshelf' })
  ).toHaveAttribute('href', 'https://books.example/audiobook/12');
  await expect(
    sheet.getByRole('link', { name: 'View Request' })
  ).toHaveAttribute('href', '/requests?requestId=77');
  await expect(sheet.getByRole('link', { name: 'View Request' })).toHaveCount(
    1
  );
  await sheet.getByRole('button', { name: 'Delete Request' }).click();
  const requestConfirm = page.getByRole('alertdialog', {
    name: 'Delete Request Entry?',
  });
  await requestConfirm.getByRole('button', { name: 'Delete Request' }).click();
  await expect(requestConfirm.getByRole('alert')).toHaveText(
    'Unable to delete this request entry.'
  );
  if (capture && ['desktop', 'iphone'].includes(test.info().project.name)) {
    await page.screenshot({
      path: `${capture}-${test.info().project.name}-retry-error.png`,
      fullPage: false,
    });
  }
  await expect(sheet.getByRole('link', { name: 'View Request' })).toHaveCount(
    1
  );
  await requestConfirm.getByRole('button', { name: 'Delete Request' }).click();
  await expect(requestConfirm).toHaveCount(0);
  await expect(sheet.getByText('No active requests.')).toBeVisible();
  await expect(sheet.getByText('Bookshelf (Book)')).toBeVisible();
  await expect(sheet.getByText('Bookshelf (Audiobook)')).toBeVisible();
  await expect(libraryReads).toEqual(['GET']);
  await sheet.getByRole('button', { name: 'Delete From Library' }).click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Delete Book Copies?',
  });
  await expect(confirm.getByText('Bookshelf (Book)')).toBeVisible();
  await expect(confirm.getByText('Bookshelf (Audiobook)')).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep Copies' }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete From Library' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete From Library' })
    .click();
  await expect
    .poll(() => deletes)
    .toEqual([
      { path: '/media/42/library', body: { token: 'verified-plan-token' } },
    ]);
  await expect(page.getByRole('dialog', { name: 'Manage Book' })).toHaveCount(
    0
  );
});

test('book manager and library plan stay hidden without management access', async ({
  page,
}) => {
  const { libraryReads } = await openBookManager(page, 0);
  await expect(page.getByRole('button', { name: 'Manage Book' })).toHaveCount(
    0
  );
  await expect(page.getByRole('dialog', { name: 'Manage Book' })).toHaveCount(
    0
  );
  expect(libraryReads).toEqual([]);
});

test('cross-media manager reviews and resolves or deletes issues with permission checks', async ({
  page,
}) => {
  await openBookManager(page, 2);
  await page.getByRole('button', { name: 'Manage Book' }).click();
  let sheet = page.getByRole('dialog', { name: 'Manage Book' });
  await expect(sheet.getByText('#77 · Approved · Ebook')).toBeVisible();
  const capture = process.env.LUMEN_MANAGE_ISSUE_CAPTURE;
  if (capture && ['desktop', 'iphone'].includes(test.info().project.name)) {
    await mkdir(dirname(capture), { recursive: true });
    const section = sheet.getByRole('region', { name: /Issues/ });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${capture}-${test.info().project.name}-candidate.png`,
      fullPage: false,
    });
    await section.screenshot({
      path: `${capture}-${test.info().project.name}-candidate-section.png`,
    });
    await section.evaluate((element) => element.remove());
    await page.screenshot({
      path: `${capture}-${test.info().project.name}-baseline.png`,
      fullPage: false,
    });
    await page.reload();
    await page.getByRole('button', { name: 'Manage Book' }).click();
    sheet = page.getByRole('dialog', { name: 'Manage Book' });
  }
  const issues = sheet.getByRole('region', { name: /Issues/ });
  await expect(
    issues.getByRole('link', { name: 'Issue #91 · Open' })
  ).toHaveAttribute('href', '/issues/91');
  await issues.getByText('View Details').click();
  await expect(
    issues.getByText('Missing pages in this edition.')
  ).toBeVisible();
  await issues.getByRole('button', { name: 'Close open issues' }).click();
  const closeConfirm = page.getByRole('alertdialog', {
    name: 'Close open issues?',
  });
  await closeConfirm.getByRole('button', { name: 'Close open issues' }).click();
  await expect(closeConfirm.getByRole('alert')).toHaveText(
    'Some issues may already have changed. Refresh the title and review the remaining issues.'
  );
  await expect(closeConfirm).toBeVisible();
  if (capture && ['desktop', 'iphone'].includes(test.info().project.name)) {
    await page.screenshot({
      path: `${capture}-${test.info().project.name}-retry-error.png`,
      fullPage: false,
    });
  }
  await closeConfirm.getByRole('button', { name: 'Close open issues' }).click();
  await expect(closeConfirm).toHaveCount(0);
  await expect(
    issues.getByRole('link', { name: 'Issue #91 · Resolved' })
  ).toBeVisible();
  await issues.getByRole('button', { name: 'Delete all issues' }).click();
  const deleteConfirm = page.getByRole('alertdialog', {
    name: 'Delete all issues?',
  });
  await deleteConfirm
    .getByRole('button', { name: 'Delete all issues' })
    .click();
  await expect(deleteConfirm).toHaveCount(0);
  await expect(
    issues.getByText('There are no issues for this title.')
  ).toBeVisible();

  await openBookManager(page, 16);
  await page.getByRole('button', { name: 'Manage Book' }).click();
  const requestManagerSheet = page.getByRole('dialog', { name: 'Manage Book' });
  await expect(
    requestManagerSheet.getByRole('region', { name: /Issues/ })
  ).toHaveCount(0);
});
