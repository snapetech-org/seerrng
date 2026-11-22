import { expect, test } from '@playwright/test';

const copy = {
  en: {
    title: 'Collector Picks',
    count: 'Shared by 2 trusted collectors',
    album: 'Open Album',
    follow: 'Follow Artist Releases',
    following: 'Following',
    toast: 'Artist followed.',
  },
  fr: {
    title: 'Sélections des collectionneurs',
    count: 'Partagé par 2 collectionneurs de confiance',
    album: 'Ouvrir l’album',
    follow: 'Suivre les sorties de l’artiste',
    following: 'Abonné',
    toast: 'Artiste suivi.',
  },
  ar: {
    title: 'اختيارات هواة الجمع',
    count: 'تمت المشاركة بواسطة 2 من هواة الجمع الموثوقين',
    album: 'فتح الألبوم',
    follow: 'متابعة إصدارات الفنان',
    following: 'تتابع',
    toast: 'تمت متابعة الفنان.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Collector Picks follow ${locale}`, async ({ page }) => {
    const albumId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const artistId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
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
        return route.fulfill({
          json: { musicEnabled: true, enabledMediaCategories: { music: true } },
        });
      if (path === '/collectors')
        return route.fulfill({
          json: {
            available: true,
            results: [
              {
                title: 'Fixture Album',
                creator: 'Fixture Artist',
                year: 2000,
                trustedSourceCount: 2,
                reasons: ['Fixture reason'],
                album: { id: albumId },
                artistId,
              },
            ],
          },
        });
      if (path === '/collectors/radar') {
        expect(request.method()).toBe('POST');
        expect(request.postDataJSON()).toEqual({
          artistId,
          artist: 'Fixture Artist',
        });
        return route.fulfill({ status: 201, json: { followId: 42 } });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/music/collectors');
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(page.getByText(text.count)).toBeVisible();
    await expect(page.getByRole('link', { name: text.album })).toHaveAttribute(
      'href',
      `/music/${albumId}`
    );
    await page.getByRole('button', { name: text.follow }).click();
    await expect(
      page.getByRole('button', { name: text.following, exact: true })
    ).toBeDisabled();
    await expect(page.getByText(text.toast)).toBeVisible();
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
