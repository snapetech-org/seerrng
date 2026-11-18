import { expect, test } from '@playwright/test';

for (const manager of [true, false]) {
  test(`book series request queue for ${manager ? 'managers' : 'members'}`, async ({
    page,
  }) => {
    const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
    let status = 'pending';
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, permissions: manager ? 16 : 32 },
        });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/book-series/watch/requests/7/approve') {
        expect(manager).toBe(true);
        expect(route.request().method()).toBe('POST');
        status = 'active';
        return route.fulfill({ json: {} });
      }
      if (path === '/book-series/watch/requests')
        return route.fulfill({
          json: [
            {
              id: 7,
              title: 'Fixture Series',
              format: 'ebook',
              status,
              includeExtras: true,
              destination: 'HD · /books',
            },
          ],
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(`${mount}/book-series/requests`);
    const row = page
      .getByRole('listitem')
      .filter({ hasText: 'Fixture Series' });
    await expect(row).toContainText('pending');
    await expect(row).toContainText('Includes extras');
    if (manager) {
      await expect(row).toContainText('HD · /books');
      await row.getByRole('button', { name: 'Approve' }).click();
      await expect(row).toContainText('active');
      await expect(
        row.getByRole('button', { name: 'Stop Monitoring' })
      ).toBeVisible();
    } else {
      await expect(row.getByRole('button')).toHaveCount(0);
      await expect(row).not.toContainText('/books');
    }
  });
}
