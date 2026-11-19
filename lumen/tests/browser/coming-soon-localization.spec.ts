import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/coming-soon-${info.project.name}.png`,
    animations: 'disabled',
  });
}

test('Coming Soon localizes its feed and preserves movie request submission', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_SOON_LOCALE ?? ''
  )
    ? (process.env.LUMEN_SOON_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const candidate = process.env.LUMEN_CAPTURE_MODE === 'candidate';
  let submitted: unknown;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { defaults: { requestOptions: false } } })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', movie4kEnabled: false },
      });
    if (path === '/discover/movies/upcoming')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [
            {
              id: 906,
              title: 'Example Movie',
              mediaType: 'movie',
              releaseDate: '2026-12-15',
              posterPath: null,
            },
          ],
        },
      });
    if (path === '/discover/tv/upcoming')
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path === '/request' && request.method() === 'POST') {
      submitted = request.postDataJSON();
      return route.fulfill({ status: 201, json: { id: 17 } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/soon?media=movie');
  const text = (english: string, french: string, arabic: string) =>
    candidate
      ? locale === 'ar'
        ? arabic
        : locale === 'fr'
          ? french
          : english
      : english;
  await expect(
    page.getByRole('heading', {
      name: text('Coming soon', 'À venir', 'قريبًا'),
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      text(
        'Request ahead and it downloads the day it’s out.',
        'Faites une demande à l’avance pour un téléchargement dès sa sortie.',
        'اطلب مسبقًا ليبدأ التنزيل يوم صدوره.'
      )
    )
  ).toBeVisible();
  await expect(page.locator('.month h2')).toHaveText(
    new Intl.DateTimeFormat(candidate ? locale : 'en', {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date('2026-12-01T00:00:00Z')) + ' 2026'
  );
  const item = page.locator('.si').filter({ hasText: 'Example Movie' });
  await expect(item).toContainText(text('Movie', 'Film', 'فيلم'));
  await expect(
    item.getByRole('button', {
      name: text('Request', 'Demander', 'طلب'),
    })
  ).toBeVisible();
  await page
    .getByRole('button', { name: text('Request', 'Demander', 'طلب') })
    .click();
  await expect
    .poll(() => submitted)
    .toEqual({
      mediaType: 'movie',
      mediaId: 906,
    });
  await expect(
    page.getByText(
      text(
        'Requested Example Movie. It downloads when it’s out.',
        'Demande envoyée pour Example Movie. Le téléchargement commencera à sa sortie.',
        'تم طلب Example Movie. سيبدأ التنزيل عند صدوره.'
      )
    )
  ).toBeVisible();
  await expect(
    item.getByText(text('Requested', 'Demandé', 'مطلوب'))
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await capture(page, info);
});
