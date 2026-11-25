import { expect, test, type Page } from '@playwright/test';

const messages = {
  en: {
    title: 'Request Magazine',
    requestButton: 'Request magazine',
    latest: 'Latest Issue',
    status: 'Status',
    service: 'Service',
    approval: 'Approval',
    ready: 'Ready to Request',
    send: 'Send Request',
    serviceName: 'Service',
    alternate: 'Alternate Library',
    approvalValue: 'Approval Required',
    quota: '3 of 5 magazine requests remaining.',
    cancel: 'Cancel',
  },
  fr: {
    title: 'Demander un magazine',
    requestButton: 'Demander le magazine',
    latest: 'Dernier numéro',
    status: 'État',
    service: 'Service',
    approval: 'Approbation',
    ready: 'Prêt à être demandé',
    send: 'Envoyer la demande',
    serviceName: 'Service',
    alternate: 'Alternate Library',
    approvalValue: 'Approbation requise',
    quota: '3 demande(s) de magazine restante(s) sur 5.',
    cancel: 'Annuler',
  },
  ar: {
    title: 'طلب مجلة',
    requestButton: 'اطلب المجلة',
    latest: 'أحدث عدد',
    status: 'الحالة',
    service: 'الخدمة',
    approval: 'الموافقة',
    ready: 'جاهز للطلب',
    send: 'إرسال الطلب',
    serviceName: 'الخدمة',
    alternate: 'Alternate Library',
    approvalValue: 'الموافقة مطلوبة',
    quota: 'المتبقي 3 من أصل 5 من طلبات المجلات.',
    cancel: 'إلغاء',
  },
} as const;

async function setup(page: Page, locale: string) {
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = decodeURIComponent(
      new URL(request.url()).pathname.slice('/api/v1'.length)
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture User', permissions: 32 + 8192 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { initialized: true, enabledMediaCategories: { magazine: true } },
      });
    if (path === '/resolve/capabilities') return route.fulfill({ json: {} });
    if (path === '/live-tv/status')
      return route.fulfill({ json: { configured: false } });
    if (path === '/blocklist/count' || path === '/request/count')
      return route.fulfill({ json: { count: 0 } });
    if (path === '/request' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { id: 9, status: 1 } });
    }
    if (path === '/request') return route.fulfill({ json: { results: [] } });
    if (path === '/book/library')
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path === '/user/1/quota')
      return route.fulfill({
        json: {
          magazine: { limit: 5, remaining: 3, days: 7, restricted: false },
        },
      });
    if (path === '/service/magazine')
      return route.fulfill({
        json: [
          { id: 3, name: 'Default Library', isDefault: true },
          { id: 7, name: 'Alternate Library', isDefault: false },
        ],
      });
    if (path === '/magazine/Fixture Magazine')
      return route.fulfill({
        json: {
          id: 'Fixture Magazine',
          title: 'Fixture Magazine',
          mediaType: 'magazine',
          provider: 'lazylibrarian',
          latestIssue: 'Issue 42',
          issueCount: 42,
          requestable: true,
        },
      });
    return route.fulfill({ json: {} });
  });
  return writes;
}

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`magazine request details and destination follow ${locale}`, async ({
    page,
  }, info) => {
    const writes = await setup(page, locale);
    const copy = messages[locale];
    await page.goto('/magazine/Fixture%20Magazine');
    await page.getByRole('button', { name: copy.requestButton }).click();
    const sheet = page.getByRole('alertdialog', { name: copy.title });
    for (const label of [copy.latest, copy.status, copy.service, copy.approval])
      await expect(
        sheet.locator('.facts2').getByText(label, { exact: true })
      ).toBeVisible();
    await expect(sheet).toContainText('Issue 42');
    await expect(sheet).toContainText(copy.ready);
    await expect(sheet).toContainText('Default Library');
    await expect(sheet).toContainText(copy.approvalValue);
    await expect(sheet).toContainText(copy.quota);
    await expect(
      sheet.getByRole('button', { name: copy.cancel })
    ).toBeVisible();
    const service = sheet.getByRole('combobox', { name: copy.service });
    await service.selectOption('7');
    await expect(service).toHaveValue('7');
    await page.screenshot({
      path: info.outputPath(`magazine-request-${locale}.png`),
    });
    await sheet.getByRole('button', { name: copy.send }).click();
    await expect(sheet).toHaveCount(0);
    expect(writes).toEqual([
      { mediaType: 'magazine', mediaId: 'Fixture Magazine', serverId: 7 },
    ]);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
  });
}

test('magazine requests stay disabled when no service is configured', async ({
  page,
}) => {
  await setup(page, 'en');
  await page.route('**/api/v1/service/magazine', (route) =>
    route.fulfill({ json: [] })
  );
  await page.goto('/magazine/Fixture%20Magazine');
  await page.getByRole('button', { name: 'Request magazine' }).click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Magazine' });
  await expect(sheet.getByRole('status')).toContainText(
    'No magazine service is configured.'
  );
  await expect(
    sheet.getByRole('button', { name: 'Send Request' })
  ).toBeDisabled();
});

test('magazine backend processing failure keeps the request retryable', async ({
  page,
}) => {
  const writes: unknown[] = [];
  let attempts = 0;
  await setup(page, 'en');
  await page.route('**/api/v1/request', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    writes.push(body);
    attempts += 1;
    return route.fulfill({
      json: attempts === 1 ? { id: 9, status: 4 } : { id: 10, status: 1 },
    });
  });

  await page.goto('/magazine/Fixture%20Magazine');
  await page.getByRole('button', { name: 'Request magazine' }).click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Magazine' });
  const send = sheet.getByRole('button', { name: 'Send Request' });
  await send.click();
  await expect(page.getByRole('status')).toContainText(
    'The Magazine Request Failed.'
  );
  await expect(sheet).toBeVisible();
  await expect(send).toBeEnabled();

  await send.click();
  await expect(sheet).toHaveCount(0);
  expect(writes).toEqual([
    { mediaType: 'magazine', mediaId: 'Fixture Magazine' },
    { mediaType: 'magazine', mediaId: 'Fixture Magazine' },
  ]);
});
