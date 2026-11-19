import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/issue-report-${info.project.name}.png`,
    animations: 'disabled',
  });
}

test('issue reporting sheet localizes controls and preserves its submission', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ISSUE_REPORT_LOCALE ?? ''
  )
    ? (process.env.LUMEN_ISSUE_REPORT_LOCALE as 'en' | 'fr' | 'ar')
    : 'fr';
  const candidate = process.env.LUMEN_CAPTURE_MODE === 'candidate';
  let submitted: unknown;
  const issue = {
    id: 8,
    status: 1,
    issueType: 1,
    createdBy: { id: 1 },
    createdAt: '2026-11-12T00:00:00Z',
    comments: [
      {
        id: 1,
        message: 'Playback stutters',
        createdAt: '2026-11-12T00:00:00Z',
      },
    ],
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, permissions: 4194304 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          releases: { results: [] },
          credits: { crew: [], cast: [] },
          mediaInfo: { id: 654, status: 5 },
        },
      });
    if (path === '/issue' && request.method() === 'POST') {
      submitted = request.postDataJSON();
      return route.fulfill({ json: issue });
    }
    if (path === '/issue/8') return route.fulfill({ json: issue });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto('/movie/20');
  const text = (english: string, french: string, arabic: string) =>
    candidate
      ? locale === 'ar'
        ? arabic
        : locale === 'fr'
          ? french
          : english
      : english;
  const openReport = text(
    'Report an Issue',
    'Signaler un problème',
    'الإبلاغ عن مشكلة'
  );
  await page.getByRole('button', { name: openReport }).click();
  const dialog = page.getByRole('dialog', { name: openReport });
  await expect(
    dialog.getByRole('combobox', {
      name: text('Issue Type', 'Type de problème', 'نوع المشكلة'),
    })
  ).toBeVisible();
  await expect(
    dialog.getByRole('textbox', {
      name: text('Issue Description', 'Description du problème', 'وصف المشكلة'),
    })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await page
    .locator('.sheet')
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished)
      )
    );
  await capture(page, info);

  await dialog
    .getByRole('combobox', {
      name: text('Issue Type', 'Type de problème', 'نوع المشكلة'),
    })
    .selectOption('1');
  await dialog
    .getByRole('textbox', {
      name: text('Issue Description', 'Description du problème', 'وصف المشكلة'),
    })
    .fill('Playback stutters');
  await dialog
    .getByRole('button', {
      name: text('Submit Report', 'Envoyer le signalement', 'إرسال البلاغ'),
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: text('Issue #8', 'Signalement #8', 'بلاغ #8'),
    })
  ).toBeVisible();
  expect(submitted).toEqual({
    mediaId: 654,
    issueType: 1,
    message: 'Playback stutters',
    is4k: false,
  });
});
