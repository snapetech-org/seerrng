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
              target: { serverId: 0, scope: 'audio:main', providerId: 'hc:42' },
            },
          ],
        });
      if (path === '/book-series/catalog') {
        expect(
          Object.fromEntries(new URL(route.request().url()).searchParams)
        ).toEqual({
          serverId: '0',
          scope: 'audio:main',
          providerId: 'hc:42',
        });
        return route.fulfill({
          json: {
            title: 'Fixture Catalog',
            serverName: 'Book service',
            format: 'audiobook',
            bookCount: 2,
            resolutionTruncated: true,
            books: [
              {
                title: 'First Book',
                matchStatus: 'matched',
                book: { id: 'OL123W' },
              },
              { title: 'Second Book', matchStatus: 'ambiguous' },
            ],
          },
        });
      }
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
    await row.getByRole('link', { name: 'Fixture Series' }).click();
    await expect(
      page.getByRole('heading', { name: 'Fixture Catalog' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Book' })).toHaveAttribute(
      'href',
      `${mount}/book/OL123W?f=audio`
    );
    await expect(page.getByText('Multiple Possible Matches')).toBeVisible();
  });
}
