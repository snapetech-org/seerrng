import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('scheduled jobs follow the saved locale and confirm schedule changes', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_JOBS_LOCALE ?? ''
  )
    ? (process.env.LUMEN_JOBS_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const translated = {
    en: [
      'Scheduled Jobs',
      'Edit Schedule',
      'Frequency',
      'Cron Schedule',
      'Save Schedule',
      'Every 20 minutes',
    ],
    fr: [
      'Tâches planifiées',
      'Modifier le planning',
      'Fréquence',
      'Planning Cron',
      'Enregistrer le planning',
      'Toutes les 20 minutes',
    ],
    ar: [
      'المهام المجدولة',
      'تحرير الجدول',
      'التكرار',
      'جدول Cron',
      'حفظ الجدول',
      'كل 20 دقيقة',
    ],
  }[locale];
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  const labels = baseline
    ? [
        'Scheduled Jobs',
        'Edit Schedule',
        'Frequency',
        'Cron Schedule',
        'Save Schedule',
        'Every 20 minutes',
      ]
    : translated;
  const job = {
    id: 'plex-recently-added-scan',
    name: 'Raw internal job name',
    type: 'process',
    interval: 'minutes',
    cronSchedule: '0 */15 * * * *',
    enabled: true,
    running: false,
    nextExecutionTime: '2026-11-23T16:00:00.000Z',
  };
  const jobName = {
    en: 'Plex Recently Added Scan',
    fr: 'Analyse des ajouts récents Plex',
    ar: 'Plex أضيف مؤخرا',
  }[baseline ? 'en' : locale];
  const description = {
    en: 'Seerr performs certain maintenance tasks as regularly-scheduled jobs, but they can also be manually triggered below. Manually running a job will not alter its schedule.',
    fr: "Seerr effectue régulièrement certaines des tâches de maintenance de manière planifiée, mais elles peuvent également être déclenchées manuellement ci-dessous. L'exécution manuelle d'une tâche ne modifiera pas sa planification.",
    ar: 'تقوم Seerr بتنفيذ مهام صيانة معينة كمهام مجدولة بانتظام، ولكن يمكن أيضًا تشغيلها يدويًا أدناه. لن يؤدي تشغيل المهمة يدويًا إلى تغيير جدولها الزمني.',
  }[baseline ? 'en' : locale];
  const writes: unknown[] = [];
  let rejectFirstSave = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/jobs/plex-recently-added-scan/schedule')) {
      const body = request.postDataJSON();
      writes.push(body);
      if (rejectFirstSave) {
        rejectFirstSave = false;
        return route.fulfill({ status: 503, json: { message: 'Try again' } });
      }
      job.cronSchedule = body.schedule;
      return route.fulfill({ json: job });
    }
    if (path.endsWith('/settings/jobs')) return route.fulfill({ json: [job] });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/jobs'));
  await expect(
    page.getByRole('heading', { name: labels[0], exact: true })
  ).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: jobName });
  await expect(row.getByText(jobName, { exact: true })).toBeVisible();
  await expect(
    row.getByText('Raw internal job name', { exact: true })
  ).toHaveCount(0);
  if (
    process.env.LUMEN_CAPTURE_JOBS &&
    ['desktop', 'iphone'].includes(info.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_JOBS}/${locale}-initial-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await row.getByRole('button', { name: labels[1], exact: true }).click();
  const frequency = page.getByRole('combobox', {
    name: labels[2],
    exact: true,
  });
  await expect(frequency).toHaveValue('15');
  await frequency.selectOption('20');
  await expect(frequency.locator('option:checked')).toHaveText(labels[5]);
  await expect(
    row.getByRole('textbox', { name: labels[3], exact: true })
  ).toHaveValue('0 */20 * * * *');
  await page.getByRole('button', { name: labels[4], exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    row.getByRole('textbox', { name: labels[3], exact: true })
  ).toHaveValue('0 */20 * * * *');
  await expect(
    row.getByRole('button', { name: labels[4], exact: true })
  ).toBeEnabled();
  expect(job.cronSchedule).toBe('0 */15 * * * *');
  await page.getByRole('button', { name: labels[4], exact: true }).click();
  await expect.poll(() => job.cronSchedule).toBe('0 */20 * * * *');
  expect(writes).toEqual([
    { schedule: '0 */20 * * * *' },
    { schedule: '0 */20 * * * *' },
  ]);
  await expect(page.getByText('0 */20 * * * *', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_JOBS)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_JOBS}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
});
