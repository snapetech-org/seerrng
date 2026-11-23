import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

test('schedule editor stays open until a fresh read confirms the saved cron', async ({
  page,
}, info) => {
  const job = {
    id: 'sample',
    name: 'Fixture Job',
    type: 'process',
    interval: 'minutes',
    cronSchedule: '0 */15 * * * *',
    enabled: true,
    running: false,
  };
  let writes = 0;
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
      return route.fulfill({ json: { locale: 'en' } });
    if (path.endsWith('/settings/jobs/sample/schedule')) {
      writes++;
      job.cronSchedule = request.postDataJSON().schedule;
      return route.fulfill({ json: job });
    }
    if (path.endsWith('/settings/jobs')) {
      const response =
        writes === 1 ? { ...job, cronSchedule: '0 */15 * * * *' } : job;
      return route.fulfill({ json: [response] });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/jobs`);
  const row = page.getByRole('listitem').filter({ hasText: 'Fixture Job' });
  await row.getByRole('button', { name: 'Edit Schedule' }).click();
  await row.getByLabel('Frequency').selectOption('20');
  await row.getByRole('button', { name: 'Save Schedule' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Could not confirm the saved schedule. Try again.'
  );
  await expect(row.getByLabel('Cron Schedule')).toHaveValue('0 */20 * * * *');
  await expect(
    row.getByRole('button', { name: 'Save Schedule' })
  ).toBeEnabled();
  if (
    process.env.LUMEN_CAPTURE_JOB_SAVE &&
    ['desktop', 'iphone'].includes(info.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_JOB_SAVE}/${info.project.name}-retry.png`,
      fullPage: true,
    });

  await row.getByRole('button', { name: 'Save Schedule' }).click();
  await expect(
    page.getByText('Schedule saved.', { exact: true })
  ).toBeVisible();
  await expect(row.getByLabel('Cron Schedule')).toHaveCount(0);
  await expect(row.getByText('0 */20 * * * *', { exact: true })).toBeVisible();
  if (
    process.env.LUMEN_CAPTURE_JOB_SAVE &&
    ['desktop', 'iphone'].includes(info.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_JOB_SAVE}/${info.project.name}-saved.png`,
      fullPage: true,
    });
  expect(writes).toBe(2);
});
