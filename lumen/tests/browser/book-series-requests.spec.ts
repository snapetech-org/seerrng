import { expect, test } from '@playwright/test';

for (const manager of [true, false]) {
  test(`book series request queue for ${manager ? 'managers' : 'members'}`, async ({
    page,
  }) => {
    const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
    let status = 'pending';
    let requested = false;
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
      if (path === '/book-series/watch') {
        if (route.request().method() === 'POST') {
          expect(manager).toBe(false);
          expect(route.request().postDataJSON()).toEqual({
            serverId: 0,
            scope: 'audio:main',
            providerId: 'hc:42',
            includeExtras: true,
          });
          requested = true;
          return route.fulfill({ json: { status: 'pending' } });
        }
        return route.fulfill({
          json: {
            supported: true,
            request: requested ? { status: 'pending' } : undefined,
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
    const monitor = page.getByRole('button', { name: 'Request Monitoring' });
    if (manager) {
      await expect(monitor).toHaveCount(0);
    } else {
      await page
        .getByRole('checkbox', { name: 'Include Companion Books and Extras' })
        .check();
      await monitor.click();
      await expect(page.getByText('Monitoring status: pending')).toBeVisible();
      await expect(monitor).toHaveCount(0);
    }
  });
}

test('series search preserves format and opens the exact local variant', async ({
  page,
}) => {
  const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    switch (url.pathname.slice('/api/v1'.length)) {
      case '/auth/me':
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      case '/settings/public':
        return route.fulfill({ json: { initialized: true } });
      case '/book-series/search': {
        expect(Object.fromEntries(url.searchParams)).toEqual({
          query: 'Fixture Series',
          format: 'ebook',
        });
        const library = {
          key: 'local',
          title: 'Fixture Series',
          serverName: 'Local Service',
          source: 'library',
          format: 'ebook',
          href: '/book-series/42',
        };
        const catalog = {
          ...library,
          key: 'catalog',
          serverName: 'Catalog Service',
          source: 'catalog',
          href: '/book-series/catalog?serverId=0&scope=ebook%3Amain&providerId=hc%3A42',
        };
        return route.fulfill({
          json: {
            results: [
              { ...catalog, key: 'group', variants: [catalog, library] },
            ],
            status: 'partial',
          },
        });
      }
      case '/book-series/42':
        return route.fulfill({
          json: {
            title: 'Local Fixture Series',
            serverName: 'Local Service',
            format: 'ebook',
            entries: [
              {
                title: 'Local Book',
                matchStatus: 'matched',
                book: { id: 'OL123W' },
              },
            ],
          },
        });
      default:
        return route.fulfill({ json: {} });
    }
  });
  await page.goto(`${mount}/book-series`);
  await page
    .getByRole('searchbox', { name: 'Series Name' })
    .fill('Fixture Series');
  await page.getByRole('combobox', { name: 'Format' }).selectOption('ebook');
  await page.getByRole('button', { name: 'Search Series' }).click();
  await expect(page).toHaveURL(
    `${mount}/book-series?query=Fixture+Series&format=ebook`
  );
  await expect(
    page.getByText('Some book services could not be searched.')
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Fixture Series from Catalog Service' })
  ).toHaveCount(1);
  await page
    .getByRole('link', { name: 'Open Fixture Series from Local Service' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Local Fixture Series' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Book' })).toHaveAttribute(
    'href',
    `${mount}/book/OL123W`
  );
});
