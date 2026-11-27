import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const copy = {
  en: {
    cast: 'Cast',
    crew: 'Crew',
    back: 'Back to Details',
    view: 'View Crew',
    person: 'Fixture Actor',
  },
  fr: {
    cast: 'Distribution',
    crew: 'Équipe',
    back: 'Retour aux détails',
    view: 'Voir l’équipe',
    person: 'Fixture Actor',
  },
  ar: {
    cast: 'طاقم التمثيل',
    crew: 'طاقم العمل',
    back: 'العودة إلى التفاصيل',
    view: 'عرض طاقم العمل',
    person: 'Fixture Actor',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Video credits follow ${locale}`, async ({ page }) => {
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
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/movie/101')
        return route.fulfill({
          json: {
            id: 101,
            title: 'Fixture Film',
            mediaType: 'movie',
            credits: {
              cast: [{ id: 9, name: 'Fixture Actor', character: 'Lead' }],
              crew: [],
            },
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/movie/101/cast'));
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.cast })).toBeVisible();
    await expect(page.getByText(text.person)).toBeVisible();
    await expect(page.getByRole('link', { name: text.back })).toBeVisible();
    await page.getByRole('link', { name: text.view }).click();
    await expect(page.getByRole('heading', { name: text.crew })).toBeVisible();
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
