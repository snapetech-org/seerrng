import { expect, test, type Page } from '@playwright/test';
import { testAppPath } from './testAppPath';

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) =>
          Number.isFinite(animation.effect?.getComputedTiming().endTime)
        )
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
}

for (const mediaType of ['movie', 'tv'] as const) {
  for (const locale of ['en', 'fr', 'ar'] as const) {
    test(`${mediaType} Live TV airings localize in ${locale} and record the selected programme`, async ({
      page,
    }, info) => {
      const title = 'Fixture Title';
      const original = 'Original Fixture Title';
      const start = '2026-11-19T19:00:00Z';
      const channel = 'fixture-1';
      const writes: unknown[] = [];
      const lookups: string[][] = [];
      await page.route('https://**/*', (route) => route.abort());
      await page.route('**/lumen-config.json', (route) =>
        route.fulfill({ json: {} })
      );
      await page.route('**/api/v1/**', (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.slice(7);
        if (path === '/auth/me')
          return route.fulfill({ json: { id: 1, permissions: 32 } });
        if (path === '/user/1/settings/main')
          return route.fulfill({ json: { locale } });
        if (path === '/live-tv/status')
          return route.fulfill({
            json: { configured: true, guideReady: true, canRequest: true },
          });
        if (path === `/${mediaType}/42`)
          return route.fulfill({
            json: {
              id: 42,
              title,
              name: title,
              originalTitle: original,
              originalName: original,
              genres: [],
              seasons: [],
              credits: { cast: [], crew: [] },
            },
          });
        if (path === '/live-tv/airings') {
          lookups.push(url.searchParams.getAll('title'));
          return route.fulfill({
            json: {
              configured: true,
              guideReady: locale === 'en' ? lookups.length > 1 : true,
              airings:
                lookups.length > (locale === 'en' ? 1 : 0)
                  ? [
                      {
                        title: original,
                        subTitle: 'Fixture Programme',
                        channel,
                        channelName: 'Fixture Channel',
                        start,
                        stop: '2026-11-19T20:00:00Z',
                        season: 1,
                        episode: 2,
                      },
                    ]
                  : [],
            },
          });
        }
        if (path === '/live-tv/recordings' && request.method() === 'POST') {
          writes.push(request.postDataJSON());
          return route.fulfill({
            status: 201,
            json: { status: mediaType === 'tv' ? 'scheduled' : 'pending' },
          });
        }
        if (path === '/live-tv/recordings')
          return route.fulfill({
            json: { results: [], pageInfo: { total: 0 } },
          });
        return route.fulfill({ json: { results: [] } });
      });
      await page.goto(testAppPath(`/${mediaType}/42`));
      const copy = {
        en: {
          open: 'Find Live TV Airings',
          title: 'Live TV Airings',
          notReady: 'The Live TV guide is not ready yet.',
          retry: 'Check Again',
          series: 'Record Series',
          airing: 'Record Airing',
          scheduled: 'Recording scheduled.',
          pending: 'Recording requested for approval.',
          recordings: 'View Recordings',
          recordingsHeading: 'Recordings',
        },
        fr: {
          open: 'Rechercher les diffusions TV en direct',
          title: 'Diffusions TV en direct',
          notReady: 'Le guide TV en direct n’est pas encore prêt.',
          retry: 'Vérifier à nouveau',
          series: 'Enregistrer la série',
          airing: 'Enregistrer la diffusion',
          scheduled: 'Enregistrement programmé.',
          pending: 'Enregistrement demandé pour approbation.',
          recordings: 'Voir les enregistrements',
          recordingsHeading: 'Enregistrements',
        },
        ar: {
          open: 'البحث عن عروض التلفاز المباشر',
          title: 'عروض التلفاز المباشر',
          notReady: 'دليل التلفاز المباشر غير جاهز بعد.',
          retry: 'تحقق مرة أخرى',
          series: 'تسجيل المسلسل',
          airing: 'تسجيل العرض',
          scheduled: 'تمت جدولة التسجيل.',
          pending: 'طُلب التسجيل للموافقة.',
          recordings: 'عرض التسجيلات',
          recordingsHeading: 'التسجيلات',
        },
      }[locale];
      const open = page.getByRole('button', { name: copy.open });
      await expect(open).toBeVisible();
      expect(lookups).toEqual([]);
      await open.click();
      const sheet = page.getByRole('dialog', { name: copy.title });
      await settleVisuals(page);
      if (locale === 'en') {
        await expect(sheet.getByText(copy.notReady)).toBeVisible();
        await sheet.getByRole('button', { name: copy.retry }).click();
      }
      await expect(sheet.getByText('Fixture Programme')).toBeVisible();
      expect(lookups).toEqual(
        Array.from({ length: locale === 'en' ? 2 : 1 }, () => [title, original])
      );
      await page.screenshot({ path: info.outputPath('airings.png') });
      const kind = mediaType === 'tv' ? 'series' : 'airing';
      await sheet
        .getByRole('button', {
          name: kind === 'series' ? copy.series : copy.airing,
        })
        .click();
      await expect(sheet.getByRole('status')).toHaveText(
        mediaType === 'tv' ? copy.scheduled : copy.pending
      );
      expect(writes).toEqual([
        {
          kind,
          title: original,
          tmdbId: 42,
          mediaType,
          ...(kind === 'airing' ? { channel, start } : {}),
        },
      ]);
      if (locale === 'en') {
        await sheet.getByRole('link', { name: copy.recordings }).click();
        await expect(
          page.getByRole('heading', { name: copy.recordingsHeading })
        ).toBeVisible();
      }
    });
  }
}
