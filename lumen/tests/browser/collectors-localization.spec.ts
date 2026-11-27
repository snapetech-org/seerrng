import { expect, test } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const copy = {
  en: {
    title: 'Collector Picks',
    description:
      'Releases being shared by collectors you follow. Each one shows why it appeared.',
    count: 'Shared by 2 trusted collectors',
    album: 'Open Album',
    follow: 'Follow Artist Releases',
    following: 'Following',
    toast: 'Artist followed.',
    offTitle: 'Collector Picks are not turned on here',
    backToMusic: 'Back to Music',
  },
  fr: {
    title: 'Sélections des collectionneurs',
    description:
      'Sorties partagées par les collectionneurs que vous suivez. Chacune indique pourquoi elle apparaît.',
    count: 'Partagé par 2 collectionneurs de confiance',
    album: 'Ouvrir l’album',
    follow: 'Suivre les sorties de l’artiste',
    following: 'Abonné',
    toast: 'Artiste suivi.',
    offTitle: 'Les sélections des collectionneurs ne sont pas activées ici',
    backToMusic: 'Retour à Musique',
  },
  ar: {
    title: 'اختيارات هواة الجمع',
    description:
      'الإصدارات التي يشاركها هواة الجمع الذين تتابعهم. يوضح كل إصدار سبب ظهوره.',
    count: 'تمت المشاركة بواسطة 2 من هواة الجمع الموثوقين',
    album: 'فتح الألبوم',
    follow: 'متابعة إصدارات الفنان',
    following: 'تتابع',
    toast: 'تمت متابعة الفنان.',
    offTitle: 'اختيارات هواة الجمع غير مفعّلة هنا',
    backToMusic: 'العودة إلى الموسيقى',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Collector Picks follow ${locale}`, async ({ page }) => {
    const albumId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const artistId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    let feedAvailable = true;
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
            available: feedAvailable,
            results: feedAvailable
              ? [
                  {
                    title: 'Fixture Album',
                    creator: 'Fixture Artist',
                    year: 2000,
                    score: 0.87,
                    trustedSourceCount: 2,
                    lastSeenAt: '2026-11-20T12:00:00.000Z',
                    reasons: ['Fixture reason'],
                    album: {
                      id: albumId,
                      href: `/music/${albumId}?source=collector`,
                    },
                    artistId,
                  },
                ]
              : [],
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
    await page.goto(mountedTestAppPath('/music/collectors'));
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(page.getByText(text.description)).toBeVisible();
    await expect(page.getByText(text.count)).toBeVisible();
    await expect(page.getByRole('link', { name: text.album })).toHaveAttribute(
      'href',
      appPath(`/music/${albumId}?source=collector`)
    );
    await page
      .getByRole('button', { name: `${text.follow}: Fixture Album` })
      .click();
    await expect(
      page.getByRole('button', { name: `${text.following}: Fixture Album` })
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
    feedAvailable = false;
    await page.reload();
    await expect(page.locator('.empty')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
    const captureDir = process.env.LUMEN_I18N_CAPTURE_DIR;
    if (
      captureDir &&
      locale !== 'en' &&
      ['desktop', 'iphone'].includes(test.info().project.name)
    ) {
      const { mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(captureDir, { recursive: true });
      await page.screenshot({
        path: join(
          captureDir,
          `collectors-${locale}-${test.info().project.name}.png`
        ),
        fullPage: true,
      });
    }
    if (process.env.LUMEN_I18N_CAPTURE_ONLY === '1') return;
    await expect(page.getByText(text.offTitle)).toBeVisible();
    await expect(
      page.getByRole('link', { name: text.backToMusic })
    ).toBeVisible();
  });
}
