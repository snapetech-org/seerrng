import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const copy = {
  en: {
    title: 'Provider Discovery',
    feed: 'Provider Feed',
    popular: 'AniList Popular',
    unmatched: 'Unmatched Only',
    count: '1 unmatched title on this page',
    noStable: 'This title has no stable provider ID for saving a match.',
    pages: 'Provider Feed Pages',
    next: 'Next Page',
    empty: 'No unmatched titles on this page.',
  },
  fr: {
    title: 'Découverte des fournisseurs',
    feed: 'Flux fournisseur',
    popular: 'Populaires AniList',
    unmatched: 'Non associés uniquement',
    count: '1 titre non associé sur cette page',
    noStable:
      'Ce titre ne possède pas d’identifiant fournisseur stable pour enregistrer une correspondance.',
    pages: 'Pages du flux fournisseur',
    next: 'Page suivante',
    empty: 'Aucun titre non associé sur cette page.',
  },
  ar: {
    title: 'اكتشاف الموفّرين',
    feed: 'خلاصة الموفّر',
    popular: 'الأكثر شعبية في AniList',
    unmatched: 'غير المطابقة فقط',
    count: '1 عنوان غير مطابق في هذه الصفحة',
    noStable: 'لا يملك هذا العنوان معرّف موفّر ثابتًا لحفظ المطابقة.',
    pages: 'صفحات خلاصة الموفّر',
    next: 'الصفحة التالية',
    empty: 'لا توجد عناوين غير مطابقة في هذه الصفحة.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Provider Discovery follows ${locale}`, async ({ page }, testInfo) => {
    const requested: string[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path.startsWith('/integrations/discovery/feeds/')) {
        requested.push(path);
        const currentPage = Number(url.searchParams.get('page') ?? 1);
        return route.fulfill({
          json: {
            page: currentPage,
            hasMore: currentPage === 1,
            missingMappings: currentPage === 1 ? 1 : 0,
            items:
              currentPage === 1
                ? [
                    {
                      id: 'matched:1',
                      title: 'Matched Fixture',
                      mediaType: 'movie',
                      tmdbId: 101,
                      identityResolution: 'curated',
                    },
                    {
                      id: 'unmatched:1',
                      title: 'Unmatched Fixture',
                      mappingAvailable: false,
                    },
                  ]
                : [],
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/providers?unmatched=1'));
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    const feed = page.getByRole('combobox', { name: text.feed });
    await expect(feed.locator('option', { hasText: text.popular })).toHaveCount(
      1
    );
    await expect(page.getByText(text.count)).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: text.unmatched })
    ).toBeChecked();
    await expect(page.getByText(text.noStable)).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Matched Fixture' })
    ).toHaveCount(0);
    if (
      (locale === 'fr' && testInfo.project.name === 'desktop') ||
      (locale === 'ar' && testInfo.project.name === 'iphone')
    ) {
      await page.screenshot({
        path: testInfo.outputPath(`provider-discovery-${locale}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: text.next }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(text.empty)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: text.pages })
    ).toBeVisible();
    await expect(feed).toHaveValue('anilist/trending');
    expect(requested).toContain(
      '/integrations/discovery/feeds/anilist/trending'
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
  });
}
