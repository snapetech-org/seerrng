import { expect, test } from '@playwright/test';

const copy = {
  en: {
    title: 'Franchise for Fixture Series',
    group: 'Sequels',
    type: 'Series',
    confidence: 'high confidence',
    back: 'Back to Series',
  },
  fr: {
    title: 'Franchise de Fixture Series',
    group: 'Suites',
    type: 'Série',
    confidence: 'confiance élevée',
    back: 'Retour à la série',
  },
  ar: {
    title: 'سلسلة Fixture Series',
    group: 'الأجزاء اللاحقة',
    type: 'مسلسل',
    confidence: 'ثقة عالية',
    back: 'العودة إلى المسلسل',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Franchise pages follow ${locale}`, async ({ page }, testInfo) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 0 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/franchise/tv/202')
        return route.fulfill({
          json: {
            anchor: { title: 'Fixture Series' },
            canCurate: false,
            notes: [],
            items: [
              {
                group: 'sequel',
                title: 'Fixture Sequel',
                mediaType: 'tv',
                href: '/tv/203',
                confidence: 'high',
                evidence: 'Provider evidence',
                verified: false,
              },
            ],
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto('/franchise/tv/202');
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: text.group })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Fixture Sequel' })
    ).toHaveAttribute('href', '/tv/203');
    await expect(
      page.getByText(`${text.type} · ${text.confidence}`)
    ).toBeVisible();
    await expect(page.getByRole('link', { name: text.back })).toHaveAttribute(
      'href',
      '/tv/202'
    );
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
    if (
      (locale === 'fr' && testInfo.project.name === 'desktop') ||
      (locale === 'ar' && testInfo.project.name === 'iphone')
    ) {
      await page.screenshot({
        path: testInfo.outputPath(`franchise-${locale}.png`),
        fullPage: true,
      });
    }
  });
}
