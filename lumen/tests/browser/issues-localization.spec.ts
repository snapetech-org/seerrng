import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/issues-${info.project.name}.png`,
    fullPage: true,
  });
}

test('Issues localizes filters, states, and discussion entry points', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ISSUES_LOCALE ?? ''
  )
    ? (process.env.LUMEN_ISSUES_LOCALE as 'en' | 'fr' | 'ar')
    : 'fr';
  const candidate = process.env.LUMEN_CAPTURE_MODE === 'candidate';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 4194304 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/issue')
      return route.fulfill({
        json: {
          results: [
            {
              id: 7,
              status: 1,
              issueType: 1,
              createdAt: '2026-11-19T00:00:00Z',
              createdBy: { id: 1 },
              comments: [{ id: 9, message: 'Playback freezes' }],
            },
          ],
          pageInfo: { page: 1, pages: 2 },
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/issues');
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
      name: text('Issues', 'Signalements', 'البلاغات'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', {
      name: text('Issue Status', 'État du signalement', 'حالة البلاغ'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', {
      name: text(
        'Search Issues',
        'Rechercher des signalements',
        'البحث في البلاغات'
      ),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: text('Video #7', 'Vidéo #7', 'فيديو #7'),
    })
  ).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .getByText(text('Open', 'Ouvert', 'مفتوح'), { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: text('Next Page', 'Page suivante', 'الصفحة التالية'),
    })
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
