import { expect, test } from '@playwright/test';

const copy = {
  en: {
    title: 'Track Requests',
    scope: 'Scope',
    all: 'All Requests',
    status: 'Status',
    pending: 'Searching',
    requestedBy: 'Requested by Member',
    cancel: 'Cancel Request',
    confirm: 'Confirm Cancel Request?',
    back: 'Back to Music',
    empty: 'No track requests match these filters.',
  },
  fr: {
    title: 'Demandes de titres',
    scope: 'Portée',
    all: 'Toutes les demandes',
    status: 'État',
    pending: 'Recherche en cours',
    requestedBy: 'Demandé par Member',
    cancel: 'Annuler la demande',
    confirm: 'Confirmer : Annuler la demande ?',
    back: 'Retour à la musique',
    empty: 'Aucune demande de titre ne correspond à ces filtres.',
  },
  ar: {
    title: 'طلبات المقاطع الموسيقية',
    scope: 'النطاق',
    all: 'كل الطلبات',
    status: 'الحالة',
    pending: 'جارٍ البحث',
    requestedBy: 'طلبه Member',
    cancel: 'إلغاء الطلب',
    confirm: 'تأكيد إلغاء الطلب؟',
    back: 'العودة إلى الموسيقى',
    empty: 'لا تطابق أي طلبات للمقاطع هذه المرشحات.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Track Requests uses ${locale} messages and retains the cancel flow`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    let cancelled = false;
    const scopes: string[] = [];
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Owner', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, enabledMediaCategories: { music: true } },
        });
      if (path === '/soulseek/status')
        return route.fulfill({ json: { configured: true } });
      if (path === '/soulseek/track-requests') {
        scopes.push(new URL(request.url()).searchParams.get('scope') ?? '');
        return route.fulfill({
          json: {
            results: cancelled
              ? []
              : [
                  {
                    id: 7,
                    title: 'Example Track',
                    artist: 'Example Artist',
                    status: 'searching',
                    searchCount: 0,
                    lastMatchCount: 0,
                    requestedBy: { id: 9, displayName: 'Member' },
                  },
                ],
          },
        });
      }
      if (path === '/soulseek/track-requests/7') {
        expect(request.method()).toBe('DELETE');
        cancelled = true;
        return route.fulfill({ json: { status: 'cancelled' } });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/track-requests');
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(page.getByRole('link', { name: text.back })).toBeVisible();
    await page.getByLabel(text.scope).selectOption('all');
    await expect.poll(() => scopes).toContain('all');
    await expect(page.getByText(text.pending)).toBeVisible();
    await expect(page.getByText(text.requestedBy)).toBeVisible();
    await page.getByRole('button', { name: text.cancel, exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText(text.confirm);
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: text.cancel, exact: true })
      .click();
    await expect(page.getByText(text.empty)).toBeVisible();
    expect(cancelled).toBe(true);
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
