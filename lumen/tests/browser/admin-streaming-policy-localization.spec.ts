import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_STREAM_POLICY_LOCALE ?? 'en';
const labels = {
  en: {
    title: 'Streaming Request Policy',
    enabled: 'Enable Streaming Request Policy',
    when: 'When the title is',
    available: 'Available on their subscriptions',
    unavailable: 'Unavailable on their subscriptions',
    action: 'Request action',
    reject: 'Reject',
    pending: 'Require approval',
    approve: 'Approve',
    message: 'Rejection message',
    allow: 'Allow per-user overrides',
    save: 'Save Streaming Request Policy',
    saved: 'Streaming request policy saved.',
  },
  fr: {
    title: 'Politique de demande selon les abonnements',
    enabled: 'Activer la politique selon les abonnements',
    when: 'Quand le titre est',
    available: 'Disponible sur ses services',
    unavailable: 'Indisponible sur ses services',
    action: 'Action de demande',
    reject: 'Refuser',
    pending: 'Exiger une approbation',
    approve: 'Approuver',
    message: 'Message de refus',
    allow: 'Autoriser les dérogations par utilisateur',
    save: 'Enregistrer la politique de demande',
    saved: 'Politique de demande enregistrée.',
  },
  ar: {
    title: 'سياسة الطلب وفق الاشتراكات',
    enabled: 'تفعيل سياسة الطلب وفق الاشتراكات',
    when: 'عندما يكون العنوان',
    available: 'متاحًا ضمن اشتراكاته',
    unavailable: 'غير متاح ضمن اشتراكاته',
    action: 'إجراء الطلب',
    reject: 'رفض',
    pending: 'يتطلب موافقة',
    approve: 'موافقة',
    message: 'رسالة الرفض',
    allow: 'السماح بالاستثناءات لكل مستخدم',
    save: 'حفظ سياسة الطلب',
    saved: 'تم حفظ سياسة الطلب.',
  },
} as const;

test('streaming request policy localizes conditional settings and retries saves', async ({
  page,
}) => {
  const text = labels[locale as keyof typeof labels] ?? labels.en;
  const initial = {
    enabled: false,
    condition: 'available',
    action: 'reject',
    rejectionMessage: 'Existing rejection message',
    allowUserOverride: false,
  };
  let state: Record<string, unknown> = { streamingRequestPolicy: initial };
  let failOnce = true;
  const writes: Record<string, unknown>[] = [];

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({
        json: { trakt: {}, anilist: {}, simkl: {}, mdblist: {} },
      });
    if (path === '/integrations/discovery/mappings/packs')
      return route.fulfill({ json: { packs: [] } });
    if (path === '/regions' || path === '/languages')
      return route.fulfill({ json: [] });
    if (path === '/genres/movie' || path === '/genres/tv')
      return route.fulfill({ json: [] });
    if (path === '/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push(body);
        if (failOnce) {
          failOnce = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Service unavailable' },
          });
        }
        state = { ...state, ...body };
      }
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/discovery`);
  const title = page.getByRole('heading', {
    name: text.title,
    exact: true,
    level: 2,
  });
  await expect(title).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(width);
  const enabled = page.getByRole('checkbox', {
    name: text.enabled,
    exact: true,
  });
  if (process.env.LUMEN_STREAM_POLICY_CAPTURE) {
    await expect(enabled).toBeVisible();
    await page.screenshot({
      path: `${process.env.LUMEN_STREAM_POLICY_CAPTURE}-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    return;
  }
  await enabled.check();
  const condition = page
    .locator('label')
    .filter({ hasText: text.when })
    .locator('select');
  await expect(condition).toHaveValue('available');
  const rejection = page
    .locator('label')
    .filter({ hasText: text.message })
    .locator('textarea');
  await expect(rejection).toHaveValue('Existing rejection message');
  await condition.selectOption('unavailable');
  const action = page
    .locator('label')
    .filter({ hasText: text.action })
    .locator('select');
  await action.selectOption('pending');
  await expect(rejection).toHaveCount(0);
  await page.getByRole('checkbox', { name: text.allow, exact: true }).check();

  const save = page.getByRole('button', { name: text.save, exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(condition).toHaveValue('unavailable');
  await save.click();
  await expect(page.getByText(text.saved, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual({
    streamingRequestPolicy: {
      enabled: true,
      condition: 'unavailable',
      action: 'pending',
      rejectionMessage: 'Existing rejection message',
      allowUserOverride: true,
    },
  });
});
