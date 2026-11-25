import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const locales = {
  en: {
    music: 'Request MP3',
    request: 'Request',
    destination: 'Destination Server',
    submitted: 'Request submitted.',
    adultTitle: 'Request Adult Scene',
    adultQuota: '4 of 5 Adult requests remaining.',
    adultSubmitted: 'Adult request submitted.',
    serverFailure: 'The server had a problem. Try again in a moment.',
  },
  fr: {
    music: 'Demander MP3',
    request: 'Demander',
    destination: 'Serveur de destination',
    submitted: 'Demande envoyée.',
    serverFailure:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    adultTitle: 'Demander une scène pour adultes',
    adultQuota: 'Il reste 4 demande(s) de contenu adulte sur 5.',
    adultSubmitted: 'Demande de contenu adulte envoyée.',
  },
  ar: {
    music: 'طلب MP3',
    request: 'طلب',
    destination: 'الخادم المستهدف',
    submitted: 'تم إرسال الطلب.',
    serverFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    adultTitle: 'طلب مشهد للبالغين',
    adultQuota: 'المتبقي 4 من أصل 5 من طلبات المحتوى للبالغين.',
    adultSubmitted: 'تم إرسال طلب المحتوى للبالغين.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`shared music and adult request actions use ${locale} copy`, async ({
    page,
  }, testInfo) => {
    const posts: unknown[] = [];
    const capture = process.env.LUMEN_CAPTURE;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
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
      if (path === '/user/1/quota')
        return route.fulfill({
          json: {
            music: { limit: 5, remaining: 4 },
            adult: { limit: 5, remaining: 4, days: 7, restricted: false },
          },
        });
      if (path === '/service/lidarr')
        return route.fulfill({
          json: [
            {
              id: 7,
              name: 'Fixture MP3',
              musicQuality: 'mp3',
              isDefault: true,
            },
          ],
        });
      if (path === '/service/whisparr')
        return route.fulfill({
          json: [
            { id: 1, name: 'Fixture Whisparr Main', isDefault: true },
            { id: 2, name: 'Fixture Whisparr Archive' },
          ],
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
            serviceId: Number(url.searchParams.get('serverId') ?? 1),
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
    await page.goto(appPath('/music/42'));
    const musicRequest = page.getByRole('button', { name: copy.music });
    await expect(musicRequest).toBeVisible();
    if (capture)
      await page.screenshot({ path: `${capture}-${locale}-music-button.png` });
    await musicRequest.click();
    const requestSheet = page.getByRole('alertdialog');
    const confirmMusicRequest = requestSheet.getByRole('button', {
      name: copy.request,
      exact: true,
    });
    await expect(confirmMusicRequest).toBeEnabled();
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-${testInfo.project.name}-music-sheet.png`,
        animations: 'disabled',
      });
    await confirmMusicRequest.click();
    if (capture)
      await page.screenshot({ path: `${capture}-${locale}-music-failed.png` });
    await expect(page.getByRole('status')).toContainText(copy.serverFailure);
    await expect(requestSheet).toBeVisible();
    await confirmMusicRequest.click();
    await expect(page.getByRole('status')).toContainText(copy.submitted);
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-music-submitted.png`,
      });

    await page.goto(appPath('/adult/42'));
    const destination = page.getByRole('combobox', {
      name: copy.destination,
    });
    await expect(destination).toBeVisible();
    await destination.selectOption('2');
    const adultRequest = page.getByRole('button', {
      name: copy.request,
      exact: true,
    });
    await expect(adultRequest).toBeVisible();
    if (capture)
      await page.screenshot({ path: `${capture}-${locale}-adult-button.png` });
    await adultRequest.click();
    const adultSheet = page.getByRole('alertdialog', {
      name: copy.adultTitle,
    });
    await expect(adultSheet).toBeVisible();
    await expect(adultSheet.getByText(copy.adultQuota)).toBeVisible();
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-${testInfo.project.name}-adult-sheet.png`,
        animations: 'disabled',
      });
    await adultSheet
      .getByRole('button', { name: copy.request, exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.adultSubmitted })
    ).toBeVisible();
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-adult-submitted.png`,
      });
    await destination.selectOption('1');
    await expect(
      page.getByRole('button', { name: copy.request, exact: true })
    ).toBeEnabled();
    expect(posts).toEqual([
      {
        mediaType: 'music',
        mediaId: '42',
        serverId: 7,
        requesterSelectedOptions: {
          tags: false,
          profile: false,
          metadataProfile: false,
          rootFolder: false,
        },
      },
      {
        mediaType: 'music',
        mediaId: '42',
        serverId: 7,
        requesterSelectedOptions: {
          tags: false,
          profile: false,
          metadataProfile: false,
          rootFolder: false,
        },
      },
      { mediaType: 'adult', mediaId: '42', serverId: 2 },
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
