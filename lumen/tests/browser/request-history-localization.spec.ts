import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function fixture(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'reader', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/request/status')
      return route.fulfill({ status: 404, json: {} });
    if (path === '/request')
      return route.fulfill({
        json: { pageInfo: { pages: 1, results: 0 }, results: [] },
      });
    if (path === '/request/count') return route.fulfill({ json: { total: 0 } });
    return route.fulfill({ json: {} });
  });
}

test('request history renders within the selected locale and viewport', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_REQUEST_HISTORY_LOCALE ?? ''
  )
    ? (process.env.LUMEN_REQUEST_HISTORY_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const candidate = process.env.LUMEN_CAPTURE_MODE === 'candidate';
  const expected = (english: string, french: string, arabic: string) =>
    candidate
      ? locale === 'ar'
        ? arabic
        : locale === 'fr'
          ? french
          : english
      : english;
  await fixture(page);
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { locale } })
  );
  const message =
    'The request is still being processed by the selected media service. '.repeat(
      8
    );
  await page.route('**/api/v1/request/status/618', (route) =>
    route.fulfill({
      json: {
        request: {
          id: 618,
          type: 'tv',
          status: 2,
          is4k: false,
          requestedBy: { id: 1, displayName: 'Reader' },
          media: { mediaType: 'tv', tmdbId: 22, status: 2 },
          seasons: [{ seasonNumber: 1, episodeNumbers: [1, 2, 3], status: 2 }],
        },
        current: { stage: 'downloading', attempt: 2, message },
        history: {
          total: 4,
          results: Array.from({ length: 4 }, (_, index) => ({
            id: index + 1,
            stage: 'downloading',
            attempt: index + 1,
            createdAt: '2026-11-20T12:00:00Z',
            message,
          })),
        },
      },
    })
  );
  await page.goto(appPath('/requests?requestId=618'));
  const history = page.getByRole('dialog', {
    name: expected('History', 'Historique', 'التاريخ'),
  });
  await expect(
    history.getByRole('heading', {
      name: expected('History', 'Historique', 'التاريخ'),
    })
  ).toBeVisible();
  await expect(
    history.getByText(
      expected(
        'Current status: Downloading',
        'État actuel : Téléchargement en cours',
        'الحالة الحالية: قيد التنزيل'
      ),
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    history.getByRole('button', {
      name: expected('Refresh Status', 'Actualiser le statut', 'تحديث الحالة'),
    })
  ).toBeVisible();
  await expect(
    history.getByText(expected('Season 1', 'Saison 1', 'موسم 1'), {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    history.getByRole('button', {
      name: expected(
        'Episode Queue',
        'File d’attente des épisodes',
        'قائمة انتظار الحلقات'
      ),
    })
  ).toBeVisible();
  await expect(
    history.getByRole('button', {
      name: expected('Remove', 'Retirer la demande', 'إزالة الطلب'),
    })
  ).toBeVisible();
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.sheet')!;
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      sheetLeft: sheet.getBoundingClientRect().left,
      sheetRight: sheet.getBoundingClientRect().right,
      clientHeight: sheet.clientHeight,
      scrollHeight: sheet.scrollHeight,
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.sheetLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.sheetRight).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  await page
    .locator('.sheet')
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished)
      )
    );
  const screenshotDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (screenshotDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${screenshotDir}/request-history-${locale}-${info.project.name}.png`,
      fullPage: true,
    });
});
