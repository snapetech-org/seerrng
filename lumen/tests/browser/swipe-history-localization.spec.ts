import { expect, test } from '@playwright/test';

const copy = {
  en: {
    title: 'Swipe History',
    category: 'History Category',
    movies: 'Movies',
    restore: 'Restore',
    restored: 'Fixture Film restored.',
    requests: 'View Requests',
    pass: 'Requested',
  },
  fr: {
    title: 'Historique de balayage',
    category: 'Catégorie de l’historique',
    movies: 'Films',
    restore: 'Restaurer',
    restored: 'Fixture Film restauré.',
    requests: 'Voir les demandes',
    pass: 'Demandé',
  },
  ar: {
    title: 'سجل التمرير',
    category: 'فئة السجل',
    movies: 'أفلام',
    restore: 'استعادة',
    restored: 'تمت استعادة Fixture Film.',
    requests: 'عرض الطلبات',
    pass: 'مطلوب',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Swipe History follows ${locale}`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    let decisions = [
      {
        mediaType: 'movie',
        id: '3',
        title: 'Requested Film',
        decision: 'want',
      },
      { mediaType: 'movie', id: '4', title: 'Fixture Film', decision: 'pass' },
    ];
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/swipe/status')
        return route.fulfill({ json: { mediaTypes: ['movie', 'tv'] } });
      if (path === '/swipe/profile') return route.fulfill({ json: {} });
      if (path === '/swipe/deck')
        return route.fulfill({ json: { cards: [], remaining: 0 } });
      if (path === '/swipe/history/restore') {
        decisions = decisions.filter(({ id }) => id !== '4');
        return route.fulfill({ json: { restored: true } });
      }
      if (path === '/swipe/history')
        return route.fulfill({ json: { decisions, hasMore: false } });
      return route.fulfill({ json: {} });
    });
    await page.goto('/swipe');
    await page.getByRole('button', { name: 'View Swipe History' }).click();
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: text.category })
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: text.movies })
    ).toBeAttached();
    await expect(
      page.getByRole('button', { name: `${text.restore} Fixture Film` })
    ).toBeVisible();
    await page
      .getByRole('button', { name: `${text.restore} Fixture Film` })
      .click();
    await expect(page.getByText(text.restored)).toBeVisible();
    await expect(page.getByRole('link', { name: text.requests })).toBeVisible();
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
