import { expect, test } from '@playwright/test';

const locales = {
  en: {
    music: 'Request album',
    request: 'Request',
    submitted: 'Request submitted.',
    serverFailure: 'The server had a problem. Try again in a moment.',
  },
  fr: {
    music: 'Demander l’album',
    request: 'Demander',
    submitted: 'Demande envoyée.',
    serverFailure:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
  },
  ar: {
    music: 'طلب الألبوم',
    request: 'طلب',
    submitted: 'تم إرسال الطلب.',
    serverFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`shared music and adult request actions use ${locale} copy`, async ({
    page,
  }) => {
    const posts: unknown[] = [];
    const capture = process.env.LUMEN_CAPTURE;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            musicEnabled: true,
            adultEnabled: true,
            enabledMediaCategories: { music: true, adult: true },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: {
            locale,
            enabledMediaCategories: { music: true, adult: true },
          },
        });
      if (path === '/music/42')
        return route.fulfill({
          json: {
            id: '42',
            title: 'Fixture Album',
            artist: { id: 'artist-1', name: 'Fixture Artist' },
            tracks: [],
            mediaInfo: { status: 1 },
          },
        });
      if (path === '/adult/42')
        return route.fulfill({
          json: {
            id: '42',
            mediaType: 'adult',
            title: 'Fixture Scene',
            serviceId: 1,
            performers: [],
            mediaInfo: { status: 1 },
          },
        });
      if (path === '/request' && request.method() === 'POST') {
        const body = request.postDataJSON();
        posts.push(body);
        return body.mediaType === 'music' &&
          posts.filter(
            (entry) => (entry as { mediaType: string }).mediaType === 'music'
          ).length === 1
          ? route.fulfill({
              status: 500,
              json: { message: 'Internal Server Error' },
            })
          : route.fulfill({ json: { id: posts.length } });
      }
      return route.fulfill({ json: { results: [] } });
    });

    const copy = locales[locale];
    await page.goto('/music/42');
    const musicRequest = page.getByRole('button', { name: copy.music });
    await expect(musicRequest).toBeVisible();
    if (capture)
      await page.screenshot({ path: `${capture}-${locale}-music-button.png` });
    await musicRequest.click();
    if (capture)
      await page.screenshot({ path: `${capture}-${locale}-music-failed.png` });
    await expect(page.getByRole('status')).toContainText(copy.serverFailure);
    await musicRequest.click();
    await expect(page.getByRole('status')).toContainText(copy.submitted);
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-music-submitted.png`,
      });

    await page.goto('/adult/42');
    const adultRequest = page.getByRole('button', {
      name: copy.request,
      exact: true,
    });
    await expect(adultRequest).toBeVisible();
    if (capture)
      await page.screenshot({ path: `${capture}-${locale}-adult-button.png` });
    await adultRequest.click();
    await expect(page.getByRole('status')).toContainText(copy.submitted);
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-adult-submitted.png`,
      });
    expect(posts).toEqual([
      { mediaType: 'music', mediaId: '42' },
      { mediaType: 'music', mediaId: '42' },
      { mediaType: 'adult', mediaId: '42' },
    ]);
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
