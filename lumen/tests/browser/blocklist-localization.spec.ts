import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/blocklist-${info.project.name}.png`,
    fullPage: true,
  });
}

test('Blocklist localizes filters, entries, removal, and feedback', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_BLOCKLIST_LOCALE ?? ''
  )
    ? (process.env.LUMEN_BLOCKLIST_LOCALE as 'en' | 'fr' | 'ar')
    : 'fr';
  const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
  let entryExists = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 268435456 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(entryExists) } });
    if (path === '/blocklist')
      return route.fulfill({
        json: {
          results: entryExists
            ? [
                {
                  id: 99,
                  title: 'Example Book',
                  mediaType: 'book',
                  externalId: 'hc:123',
                  createdAt: '2026-11-12T00:00:00Z',
                  blocklistedGenres: 'Horror',
                },
              ]
            : [],
          pageInfo: { pages: 1 },
        },
      });
    if (path === '/blocklist/hc%3A123' && request.method() === 'DELETE') {
      entryExists = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/blocklist');
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
      name: text('Blocklist', 'Liste de blocage', 'قائمة الحظر'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', {
      name: text('Source', 'Source', 'المصدر'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: text(
        'Remove Example Book from Blocklist',
        'Retirer Example Book de la liste de blocage',
        'إزالة Example Book من قائمة الحظر'
      ),
    })
  ).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .getByText(
        text('Automatic Genres', 'Genres automatiques', 'أنواع تلقائية'),
        { exact: false }
      )
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await capture(page, info);

  await page
    .getByRole('button', {
      name: text(
        'Remove Example Book from Blocklist',
        'Retirer Example Book de la liste de blocage',
        'إزالة Example Book من قائمة الحظر'
      ),
    })
    .click();
  await expect(
    page
      .getByRole('alertdialog')
      .getByText(
        text(
          'Remove from the Blocklist?',
          'Retirer de la liste de blocage ?',
          'هل تريد الإزالة من قائمة الحظر؟'
        )
      )
  ).toBeVisible();
  await page
    .getByRole('alertdialog')
    .getByRole('button', {
      name: text(
        'Remove from Blocklist',
        'Retirer de la liste de blocage',
        'إزالة من قائمة الحظر'
      ),
    })
    .click();
  await expect(
    page.getByText(
      text(
        'Removed from the Blocklist.',
        'Retiré de la liste de blocage.',
        'تمت الإزالة من قائمة الحظر.'
      )
    )
  ).toBeVisible();
});
