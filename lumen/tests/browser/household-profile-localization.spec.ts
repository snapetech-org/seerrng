import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const locales = [
  {
    tag: 'en',
    title: 'Household Profile',
    requests: 'Recent Requests',
    watchlist: 'Watchlist',
    playback: 'Playback Activity',
    limits: 'Request limits',
    empty: 'No requests yet.',
    remaining: '2 of 5 left',
    period: 'Every 7 days',
  },
  {
    tag: 'fr',
    title: 'Profil du foyer',
    requests: 'Demandes récentes',
    watchlist: 'Liste de suivi',
    playback: 'Activité de lecture',
    limits: 'Limites de demandes',
    empty: 'Aucune demande pour le moment.',
    remaining: '2 restantes sur 5',
    period: 'Tous les 7 jours',
  },
  {
    tag: 'ar',
    title: 'ملف الأسرة',
    requests: 'الطلبات الأخيرة',
    watchlist: 'قائمة المشاهدة',
    playback: 'نشاط المشاهدة',
    limits: 'حدود الطلبات',
    empty: 'لا توجد طلبات بعد.',
    remaining: '2 متبقية من 5',
    period: 'كل 7 أيام',
  },
];

for (const language of locales) {
  test(`household profile follows ${language.tag} locale`, async ({
    page,
  }, info) => {
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      switch (path) {
        case '/auth/me':
          return route.fulfill({
            json: { id: 19, displayName: 'Member', permissions: 2 },
          });
        case '/user/19/settings/main':
          return route.fulfill({ json: { locale: language.tag } });
        case '/user/19':
          return route.fulfill({
            json: {
              id: 19,
              displayName: 'Member',
              userType: 1,
              createdAt: '2020-06-15T12:00:00.000Z',
            },
          });
        case '/user/19/requests':
          return route.fulfill({ json: { results: [] } });
        case '/user/19/watchlist':
          return route.fulfill({ json: { results: [] } });
        case '/user/19/watch_data':
          return route.fulfill({
            json: { playCount: 0, recentlyWatched: [] },
          });
        case '/user/19/quota':
          return route.fulfill({
            json: { movie: { limit: 5, used: 3, days: 7 } },
          });
        default:
          return route.fulfill({ json: {} });
      }
    });

    await page.goto(appPath('/household/me'));
    await expect(page.getByRole('heading', { name: 'Member' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: language.requests })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: language.watchlist })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: language.playback })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: language.limits })
    ).toBeVisible();
    await expect(page.getByText(language.empty)).toBeVisible();
    await expect(page.getByText(language.remaining)).toBeVisible();
    await expect(page.getByText(language.period)).toBeVisible();
    const viewRequests = {
      en: 'View Requests',
      fr: 'Voir les demandes',
      ar: 'الإطلاع على الطلبات',
    }[language.tag];
    await expect(page.getByRole('link', { name: viewRequests })).toBeVisible();

    const formattedDate = await page.evaluate(
      (locale) =>
        new Date('2020-06-15T12:00:00.000Z').toLocaleDateString(locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      language.tag
    );
    await expect(page.locator('body')).toContainText(formattedDate);
    await expect(page.locator('html')).toHaveAttribute('lang', language.tag);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      )
    ).toBe(false);
    if (process.env.LUMEN_VISUAL_CAPTURE_DIR) {
      mkdirSync(process.env.LUMEN_VISUAL_CAPTURE_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.LUMEN_VISUAL_CAPTURE_DIR,
          `${language.tag}-${info.project.name}.png`
        ),
        fullPage: true,
      });
    }
  });
}
