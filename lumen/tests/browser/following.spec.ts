import { expect, test } from '@playwright/test';

test('household users can open Following and manage their own updates', async ({
  page,
}) => {
  let seen = false;
  let notify = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/follow/events/seen') {
      expect(route.request().postDataJSON()).toEqual({ ids: [1] });
      seen = true;
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/2' && route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ notify: false });
      notify = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/events/count')
      return route.fulfill({ json: { unseen: seen ? 0 : 1 } });
    if (path === '/follow/events')
      return route.fulfill({
        json: {
          total: 1,
          results: [
            {
              id: 1,
              title: 'A New Film',
              seen,
              follow: { subjectLabel: 'Example Director' },
              target: { mediaType: 'movie', id: '10' },
            },
          ],
        },
      });
    if (path === '/follow')
      return route.fulfill({
        json: {
          results: [
            {
              id: 2,
              kind: 'tmdb-person',
              subjectLabel: 'Example Director',
              notify,
              autoRequest: false,
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Following', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Following', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'A New Film' })).toHaveAttribute(
    'href',
    '/movie/10'
  );
  await page.getByRole('button', { name: 'Mark Seen: A New Film' }).click();
  await expect(
    page.getByRole('button', { name: 'Mark Seen: A New Film' })
  ).toHaveCount(0);
  const notification = page.getByRole('checkbox', { name: 'Notify Me' });
  await expect(notification).toBeChecked();
  await notification.click();
  await expect(notification).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Request Automatically' })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('direct navigation without request access does not fetch follows', async ({
  page,
}) => {
  let requested = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    requested ||= path.startsWith('/follow');
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Viewer', permissions: 4 }
          : {},
    });
  });
  await page.goto('/following');
  await expect(
    page.getByText('Request access is required to use Following.')
  ).toBeVisible();
  expect(requested).toBe(false);
});
