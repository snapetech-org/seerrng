import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;

test('availability discovery keeps catalog paging bounded and resumable', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_BROWSE_LOCALE ?? ''
  )
    ? (process.env.LUMEN_BROWSE_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const pages: number[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { enable4k: true } });
    if (path === '/genres/movie' || path === '/languages')
      return route.fulfill({ json: [] });
    if (path === '/watchproviders/regions') return route.fulfill({ json: [] });
    if (path === '/discover/movies') {
      const requested = Number(url.searchParams.get('page') ?? 1);
      pages.push(requested);
      return route.fulfill({
        json: {
          page: requested,
          totalPages: 100,
          totalResults: 2000,
          results: [],
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto(testAppPath('/movies?show=have&keywords=1'));
  const expectedCount = (count: number) => {
    const number = count.toLocaleString(locale);
    const wording =
      locale === 'fr'
        ? `Recherche parmi les ${number} films les plus populaires.`
        : locale === 'ar'
          ? `تم فحص ${number} من أكثر الأفلام شيوعًا.`
          : `Checked the ${number} most popular movies.`;
    return wording;
  };

  await expect(
    page.locator('.empty').filter({ hasText: expectedCount(100) })
  ).toBeVisible();
  await expect.poll(() => Math.max(...pages)).toBe(5);
  await expect(
    page.getByRole('button', {
      name:
        locale === 'fr'
          ? 'Chercher plus loin'
          : locale === 'ar'
            ? 'البحث بشكل أوسع'
            : 'Look further',
    })
  ).toBeVisible();
  await page
    .locator('.empty')
    .filter({ hasText: expectedCount(100) })
    .scrollIntoViewIfNeeded();
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(test.info().project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/browse-bounded-${test.info().project.name}.png`,
      animations: 'disabled',
    });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);

  await page
    .getByRole('button', {
      name:
        locale === 'fr'
          ? 'Chercher plus loin'
          : locale === 'ar'
            ? 'البحث بشكل أوسع'
            : 'Look further',
    })
    .click();

  await expect(
    page.locator('.empty').filter({ hasText: expectedCount(200) })
  ).toBeVisible();
  await expect.poll(() => Math.max(...pages)).toBe(10);
  expect(pages).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
});
