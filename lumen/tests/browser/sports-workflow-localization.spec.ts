import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_SPORTS_WORKFLOW_LOCALE ?? ''
)
  ? (process.env.LUMEN_SPORTS_WORKFLOW_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';

const copy = {
  en: {
    events: 'Events',
    page: 'Page 1',
    previous: 'Previous Page',
    next: 'Next Page',
    requestAction: 'Follow league',
    dialog: 'Request league',
    confirm: 'Send Request',
    service: 'Sportarr service',
    approval: 'Automatically approved',
  },
  fr: {
    events: 'Événements',
    page: 'Page 1',
    previous: 'Page précédente',
    next: 'Page suivante',
    requestAction: 'Suivre la ligue',
    dialog: 'Demande ligue',
    confirm: 'Envoyer la demande',
    service: 'Service Sportarr',
    approval: 'Approuvée automatiquement',
  },
  ar: {
    events: 'الأحداث',
    page: 'الصفحة 1',
    previous: 'الصفحة السابقة',
    next: 'الصفحة التالية',
    requestAction: 'متابعة الدوري',
    dialog: 'مكتب الطلب',
    confirm: 'إرسال الطلب',
    service: 'خدمة Sportarr',
    approval: 'تمت الموافقة تلقائيًا',
  },
}[locale];

test('Sportarr league details and follow sheet follow the saved locale', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: { sports: true } },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          sportsEnabled: true,
          enabledMediaCategories: { sports: true },
        },
      });
    if (path === '/sportarr/fixture-league/events')
      return route.fulfill({
        json: {
          eventsAvailable: true,
          totalPages: 2,
          totalRecords: 51,
          results: [
            {
              id: 1,
              title: 'Fixture Match',
              eventDate: '2026-02-01T18:00:00Z',
              season: '2026',
              monitored: true,
              hasFile: true,
              fileCount: 2,
              quality: '1080p',
            },
          ],
        },
      });
    if (path === '/sportarr/fixture-league')
      return route.fulfill({
        json: {
          id: 'fixture-league',
          title: 'Fixture League',
          overview: 'A fixture league.',
          sport: 'Football',
          country: 'Canada',
          year: 2026,
          requestable: true,
          eventsAvailable: true,
        },
      });
    if (path === '/service/sportarr')
      return route.fulfill({
        json: [{ id: 1, name: 'Fixture Sportarr', isDefault: true }],
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/sportarr/fixture-league'));
  await expect(
    page.getByRole('heading', { name: 'Fixture League' })
  ).toBeVisible();
  const captureDirectory = process.env.LUMEN_SPORTS_WORKFLOW_CAPTURE_DIR;
  if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${info.project.name}-detail.png`,
      fullPage: true,
    });
  if (process.env.LUMEN_SPORTS_WORKFLOW_BASELINE === '1') {
    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
    await expect(page.getByText('Page 1')).toBeVisible();
    const baselineAction = page.getByRole('button', { name: 'Follow league' });
    await baselineAction.click();
    const baselineDialog = page.getByRole('alertdialog', {
      name: 'Follow League',
    });
    await expect(baselineDialog).toBeVisible();
    await expect(
      baselineDialog.getByRole('button', { name: 'Send Request' })
    ).toBeEnabled();
    if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDirectory}/${locale}-${info.project.name}-follow.png`,
        fullPage: true,
      });
    return;
  }
  await expect(page.getByRole('heading', { name: copy.events })).toBeVisible();
  await expect(page.getByText(copy.page)).toBeVisible();
  await expect(page.getByRole('button', { name: copy.previous })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.next })).toBeVisible();
  await expect(page.getByText('Fixture Match')).toBeVisible();

  const action = page.getByRole('button', { name: copy.requestAction });
  await expect(action).toBeVisible();
  await action.click();
  const dialog = page.getByRole('alertdialog', { name: copy.dialog });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(copy.approval)).toBeVisible();
  await expect(dialog.getByText(copy.service)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: copy.confirm })
  ).toBeEnabled();

  if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${info.project.name}-follow.png`,
      fullPage: true,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
