import { expect, test, type Page } from '@playwright/test';

// On desktop the poster's Request button lives in a hover/focus overlay. When the quick-request
// sheet closes (Escape or Cancel) keyboard focus has to come back to that button.
const movie = (id: number, title: string) => ({
  id,
  title,
  mediaType: 'movie',
  releaseDate: '2020-01-01',
  posterPath: `/p${id}.png`,
  voteAverage: 7,
});
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixture(page: Page, permissions = 32 | 1024, locale?: string) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route(/\/(imageproxy|branding)\//, (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e05"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    let json: unknown = {};
    if (path === '/settings/public')
      json = { mediaServerType: 2, movie4kEnabled: permissions !== 2 };
    else if (path === '/auth/me')
      json = { id: 1, displayName: 'fam', permissions };
    else if (path === '/user/1/settings/main' && locale) json = { locale };
    else if (path === '/discover/movies' || path === '/discover/trending')
      json = paged([movie(302, 'Fresh Pick')]);
    else if (path === '/discover/genreslider/movie') json = [];
    else if (/^\/discover\//.test(path) || path === '/media') json = paged([]);
    else if (path === '/request') {
      if (route.request().method() === 'POST')
        return route.fulfill({
          status: 500,
          json: { message: 'Internal Server Error' },
        });
      json = { pageInfo: { pages: 1, results: 0 }, results: [] };
    } else if (/^\/user\/\d+\/quota$/.test(path)) json = {};
    return route.fulfill({ json });
  });
}

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`one-click movie request errors follow ${locale} locale`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'the quick-request card overlay is desktop only'
    );
    const errorCopy = {
      en: 'The server had a problem. Try again in a moment.',
      fr: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
      ar: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    }[locale];
    await fixture(page, 32, locale);
    await page.goto('/');
    const poster = page.locator('.poster', { hasText: 'Fresh Pick' }).first();
    await poster.scrollIntoViewIfNeeded();
    await poster.hover();
    await poster.locator('.qbtn.go').click();
    const error = page.getByRole('status');
    await expect(error).toHaveClass(/show/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    const capture = process.env.LUMEN_QUICK_ERROR_CAPTURE;
    if (capture && ['desktop', 'iphone'].includes(test.info().project.name))
      await page.screenshot({
        path: `${capture}-${locale}-${test.info().project.name}.png`,
        animations: 'disabled',
      });
    await expect(error).toContainText(errorCopy);
  });
}

for (const how of ['Escape', 'Cancel'] as const) {
  test(`${how} on the quick-request sheet returns focus to the poster's Request button`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'desktop',
      'the hover overlay is desktop only'
    );
    await fixture(page);
    await page.goto('/');
    const poster = page.locator('.poster', { hasText: 'Fresh Pick' }).first();
    await poster.scrollIntoViewIfNeeded();
    const trigger = poster.locator('.qbtn.go');
    await poster.hover();
    await trigger.focus();
    await page.mouse.move(2, 2);
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Request Fresh Pick' });
    await expect(sheet).toBeVisible();
    // the pointer is somewhere else, so only focus keeps the overlay shown
    await page.mouse.move(2, 2);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toHaveCount(0);
    await page.mouse.move(2, 2);
    await expect(trigger).toBeFocused();
  });
}
