import { expect, test } from '@playwright/test';

test('email tests keep saved credentials and Web Push saves independently', async ({
  page,
}, info) => {
  const prefix = '/settings/notifications/';
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const email = {
    enabled: false,
    embedPoster: true,
    options: {
      senderName: 'Seerr',
      emailFrom: 'sender@example.test',
      smtpHost: '[REDACTED]',
      smtpPort: 587,
      authPass: '[REDACTED]',
      userEmailRequired: false,
      usePublicLogo: false,
      allowSelfSigned: false,
    },
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!path.startsWith(prefix)) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      return route.fulfill({
        json: path.endsWith('/email')
          ? email
          : { enabled: false, embedPoster: false, options: {} },
      });
    }
    const body = request.postDataJSON();
    writes.push({ path: path.slice(prefix.length), body });
    if (path.endsWith('/test')) return route.fulfill({ status: 204 });
    if (
      path.endsWith('/email') &&
      writes.filter((entry) => entry.path === 'email').length === 1
    )
      return route.fulfill({ status: 400, json: { message: 'Rejected.' } });
    return route.fulfill({ json: body });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Instance Notifications' }).click();
  await expect(page.getByLabel('SMTP Host', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('SMTP Password', { exact: true })).toHaveValue(
    ''
  );
  await page.getByRole('button', { name: 'Send Email Test' }).click();
  await expect(page.getByText('Test notification sent.')).toBeVisible();
  expect(writes[0]).toEqual({
    path: 'email/test',
    body: { ...email, enabled: true },
  });
  await page.getByLabel('Use the Public Logo').check();
  const save = page.getByRole('button', { name: 'Save Email' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not save notification settings. Try again.'
  );
  await expect(page.getByLabel('Use the Public Logo')).toBeChecked();
  await save.click();
  await expect(page.getByText('Notification settings saved.')).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Enable Notifications' })
    .last()
    .check();
  await page.getByRole('button', { name: 'Save Web Push' }).click();
  await expect(page.getByText('Notification settings saved.')).toHaveCount(2);
  expect(writes.at(-1)).toEqual({
    path: 'webpush',
    body: { enabled: true, embedPoster: false, options: {} },
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('notifications.png'),
      fullPage: true,
    });
  }
});
