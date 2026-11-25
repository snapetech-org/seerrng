import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const labels = {
  en: {
    run: 'Run Now',
    cancel: 'Cancel Job',
    enable: 'Enable',
    disable: 'Disable',
    runSuccess: 'Fixture Job started.',
    cancelSuccess: 'Fixture Job canceled.',
    enableSuccess: 'Fixture Job enabled.',
    disableSuccess: 'Fixture Job disabled.',
    failure: 'The job could not be updated.',
  },
  fr: {
    run: 'Exécuter',
    cancel: 'Annuler la tâche',
    enable: 'Activer',
    disable: 'Désactiver',
    runSuccess: 'Fixture Job a commencé.',
    cancelSuccess: 'Fixture Job annulé.',
    enableSuccess: 'Fixture Job activé.',
    disableSuccess: 'Fixture Job handicapés.',
    failure: 'La tâche n’a pas pu être mise à jour.',
  },
  ar: {
    run: 'تنفيذ " الآن "',
    cancel: 'الغاء الطلب',
    enable: 'تفعيل',
    disable: 'تعطيل',
    runSuccess: 'Fixture Job بدأ عمل هذه المهمة.',
    cancelSuccess: 'Fixture Job تم إلغاء هذه المهمة.',
    enableSuccess: 'Fixture Job مُتاح',
    disableSuccess: 'Fixture Job معاق',
    failure: 'تعذر تحديث المهمة.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`scheduled job actions match native behavior in ${locale}`, async ({
    page,
  }) => {
    const copy = labels[locale];
    const job = {
      id: 'fixture-job',
      name: 'Fixture Job',
      type: 'process',
      interval: 'minutes',
      cronSchedule: '0 */15 * * * *',
      enabled: true,
      running: false,
      canCancel: true,
      nextExecutionTime: null,
    };
    const mutations: { action: string; body?: unknown }[] = [];

    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/jobs' && request.method() === 'GET')
        return route.fulfill({ json: [{ ...job }] });
      const mutation =
        /^\/settings\/jobs\/fixture-job\/(run|cancel|enabled)$/.exec(path);
      if (mutation && request.method() === 'POST') {
        const action = mutation[1];
        const body = request.postDataJSON() as { enabled?: boolean } | null;
        mutations.push({ action, ...(body ? { body } : {}) });
        if (action === 'run') job.running = true;
        if (action === 'cancel') job.running = false;
        if (action === 'enabled' && body) job.enabled = body.enabled === true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto(`${mount}/admin/jobs`);
    const row = page.getByRole('listitem').filter({ hasText: 'Fixture Job' });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: copy.run, exact: true }).click();
    await expect(row.getByRole('button', { name: copy.cancel })).toBeVisible();
    await expect(
      page.getByText(copy.runSuccess, { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await row.getByRole('button', { name: copy.cancel, exact: true }).click();
    await expect(row.getByRole('button', { name: copy.run })).toBeVisible();
    await expect(
      page.getByText(copy.cancelSuccess, { exact: true })
    ).toBeVisible();

    await row.getByRole('button', { name: copy.disable, exact: true }).click();
    await expect(row.getByRole('button', { name: copy.enable })).toBeVisible();
    await expect(
      page.getByText(copy.disableSuccess, { exact: true })
    ).toBeVisible();

    await row.getByRole('button', { name: copy.enable, exact: true }).click();
    await expect(row.getByRole('button', { name: copy.disable })).toBeVisible();
    await expect(
      page.getByText(copy.enableSuccess, { exact: true })
    ).toBeVisible();
    expect(mutations).toEqual([
      { action: 'run' },
      { action: 'cancel' },
      { action: 'enabled', body: { enabled: false } },
      { action: 'enabled', body: { enabled: true } },
    ]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('scheduled job mutation failures retain a retryable action', async ({
  page,
}) => {
  const job = {
    id: 'fixture-job',
    name: 'Fixture Job',
    type: 'process',
    interval: 'minutes',
    cronSchedule: '0 */15 * * * *',
    enabled: true,
    running: false,
    canCancel: true,
    nextExecutionTime: null,
  };
  let runAttempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/jobs' && request.method() === 'GET')
      return route.fulfill({ json: [{ ...job }] });
    if (path === '/settings/jobs/fixture-job/run') {
      runAttempts++;
      if (runAttempts === 1)
        return route.fulfill({ status: 503, json: { message: 'Try again' } });
      job.running = true;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/jobs`);
  const row = page.getByRole('listitem').filter({ hasText: 'Fixture Job' });
  await row.getByRole('button', { name: 'Run Now', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Try again');
  await expect(
    row.getByRole('button', { name: 'Run Now', exact: true })
  ).toBeEnabled();
  await row.getByRole('button', { name: 'Run Now', exact: true }).click();
  await expect(
    page.getByText('Fixture Job started.', { exact: true })
  ).toBeVisible();
  expect(runAttempts).toBe(2);
});
