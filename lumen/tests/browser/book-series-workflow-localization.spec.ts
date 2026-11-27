import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const messages = {
  en: {
    requests: 'Book Series Requests',
    back: 'Back to Requests',
    pending: 'Pending',
    extras: 'Includes extras',
    approve: 'Approve',
    catalog: 'Book Series Catalog',
    monitoring: 'Series Monitoring',
    requestMonitoring: 'Request Monitoring',
    truncated: 'Only part of this catalog could be checked for matches.',
    noMatch: 'No Match',
    multiple: 'Multiple Possible Matches',
  },
  fr: {
    requests: 'Demandes de séries de livres',
    back: 'Retour aux demandes',
    pending: 'En attente',
    extras: 'Inclut les livres complémentaires',
    approve: 'Approuver',
    catalog: 'Catalogue de séries de livres',
    monitoring: 'Suivi des séries',
    requestMonitoring: 'Demander le suivi',
    truncated:
      'Seule une partie de ce catalogue a pu être vérifiée pour trouver des correspondances.',
    noMatch: 'Aucune correspondance',
    multiple: 'Plusieurs correspondances possibles',
  },
  ar: {
    requests: 'طلبات سلاسل الكتب',
    back: 'العودة إلى الطلبات',
    pending: 'قيد الانتظار',
    extras: 'يتضمن الكتب الإضافية',
    approve: 'موافقة',
    catalog: 'فهرس سلاسل الكتب',
    monitoring: 'متابعة السلاسل',
    requestMonitoring: 'طلب المتابعة',
    truncated: 'تعذر التحقق من المطابقات إلا لجزء من هذا الفهرس.',
    noMatch: 'لا توجد مطابقة',
    multiple: 'توجد مطابقات محتملة متعددة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`book-series request queue uses ${locale} messages`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 16 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/book-series/watch/requests')
        return route.fulfill({
          json: [
            {
              id: 7,
              title: 'Dune Chronicles',
              format: 'ebook',
              status: 'pending',
              includeExtras: true,
              target: { serverId: 0, scope: 'main', providerId: 'hc:42' },
            },
          ],
        });
      if (path === '/book-series/watch/requests/7/approve')
        return route.fulfill({ json: { status: 'active' } });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/book-series/requests'));
    const copy = messages[locale];
    await expect(
      page.getByRole('heading', { name: copy.requests })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: copy.back })).toBeVisible();
    await expect(page.getByText(copy.pending)).toBeVisible();
    await expect(page.getByText(copy.extras)).toBeVisible();
    const approve = page.getByRole('button', { name: copy.approve });
    await expect(approve).toBeVisible();
    await approve.click();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
  });

  test(`book-series catalog uses ${locale} messages`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/book-series/catalog')
        return route.fulfill({
          json: {
            title: 'Dune Chronicles',
            serverName: 'Bookshelf',
            format: 'ebook',
            bookCount: 2,
            resolutionTruncated: true,
            books: [
              { title: 'Dune', matchStatus: 'unmatched' },
              { title: 'Dune Messiah', matchStatus: 'ambiguous' },
            ],
          },
        });
      if (path === '/book-series/watch')
        return route.fulfill({ json: { supported: true } });
      return route.fulfill({ json: {} });
    });
    await page.goto(
      testAppPath(
        '/book-series/catalog?serverId=0&scope=main&providerId=hc%3A42'
      )
    );
    const copy = messages[locale];
    await expect(
      page.getByRole('heading', { name: 'Dune Chronicles' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.monitoring })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.requestMonitoring })
    ).toBeVisible();
    await expect(page.getByText(copy.truncated)).toBeVisible();
    await expect(page.getByText(copy.noMatch)).toBeVisible();
    await expect(page.getByText(copy.multiple)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
  });
}
