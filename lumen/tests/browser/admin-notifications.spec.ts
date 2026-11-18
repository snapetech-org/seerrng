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

test('messaging channels preserve credentials and independent event masks', async ({
  page,
}, info) => {
  const saved: { path: string; body: unknown }[] = [];
  const agents = {
    telegram: {
      enabled: false,
      embedPoster: true,
      types: 0,
      options: {
        botAPI: '[REDACTED]',
        chatId: '-100',
        messageThreadId: '',
        sendSilently: false,
      },
    },
    pushbullet: {
      enabled: false,
      embedPoster: false,
      types: 0,
      options: { accessToken: '[REDACTED]' },
    },
    pushover: {
      enabled: false,
      embedPoster: true,
      types: 0,
      options: {
        accessToken: '[REDACTED]',
        userToken: '[REDACTED]',
        sound: '',
      },
    },
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/pushover/sounds'))
      return route.fulfill({ json: [{ name: 'bell', description: 'Bell' }] });
    const channel = path.split('/').at(-1)! as keyof typeof agents;
    if (!(channel in agents))
      return route.fulfill({
        json: { enabled: false, embedPoster: false, options: {} },
      });
    if (request.method() === 'GET')
      return route.fulfill({ json: agents[channel] });
    const body = request.postDataJSON();
    saved.push({ path: channel, body });
    return route.fulfill({ json: body });
  });
  await page.goto('/admin/notifications');
  const telegram = page.locator('#telegram');
  await expect(telegram.getByLabel('Bot Token', { exact: true })).toHaveValue(
    ''
  );
  await telegram.getByLabel('Enable Notifications').check();
  await expect(
    telegram.getByRole('button', { name: 'Save Telegram' })
  ).toBeDisabled();
  await telegram.getByLabel('Request approved').check();
  await telegram.getByLabel('Message Thread ID').fill('42');
  await telegram.getByLabel('Send Silently').check();
  await telegram.getByRole('button', { name: 'Save Telegram' }).click();
  await expect(
    telegram.getByText('Notification settings saved.')
  ).toBeVisible();

  const pushbullet = page.locator('#pushbullet');
  await pushbullet.getByLabel('Channel Tag').fill('household');
  await pushbullet.getByLabel('Media available').check();
  await pushbullet.getByRole('button', { name: 'Save Pushbullet' }).click();
  await expect(
    pushbullet.getByText('Notification settings saved.')
  ).toBeVisible();

  const pushover = page.locator('#pushover');
  await pushover.getByLabel('Notification Sound').selectOption('bell');
  await pushover.getByRole('button', { name: 'Save Pushover' }).click();
  await expect(
    pushover.getByText('Notification settings saved.')
  ).toBeVisible();
  expect(saved).toEqual([
    {
      path: 'telegram',
      body: {
        ...agents.telegram,
        enabled: true,
        types: 4,
        options: {
          ...agents.telegram.options,
          messageThreadId: '42',
          sendSilently: true,
        },
      },
    },
    {
      path: 'pushbullet',
      body: {
        ...agents.pushbullet,
        types: 8,
        options: { ...agents.pushbullet.options, channelTag: 'household' },
      },
    },
    {
      path: 'pushover',
      body: {
        ...agents.pushover,
        options: { ...agents.pushover.options, sound: 'bell' },
      },
    },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await telegram.screenshot({ path: info.outputPath('telegram.png') });
});

test('server notification channels save and test with their own options', async ({
  page,
}, info) => {
  const calls: { path: string; options: unknown }[] = [];
  const agents = {
    gotify: {
      url: 'https://gotify.example.test',
      token: '[REDACTED]',
      priority: 0,
      locale: 'en',
    },
    ntfy: {
      url: 'https://ntfy.example.test',
      topic: 'media',
      priority: 3,
      locale: 'en',
      token: '[REDACTED]',
    },
    apprise: {
      url: 'https://apprise.example.test',
      configKey: 'house',
      locale: 'en',
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
    const prefix = '/settings/notifications/';
    if (!path.startsWith(prefix)) return route.fulfill({ json: {} });
    const name = path.slice(prefix.length);
    const channel = name.split('/')[0] as keyof typeof agents;
    if (request.method() === 'GET')
      return route.fulfill({
        json: {
          enabled: false,
          embedPoster: false,
          types: 0,
          options: agents[channel] ?? {},
        },
      });
    const body = request.postDataJSON();
    calls.push({ path: name, options: body.options });
    return name.endsWith('/test')
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: body });
  });

  await page.goto('/admin/notifications');
  const gotify = page.locator('#gotify');
  await expect(gotify.getByLabel('Access Token', { exact: true })).toHaveValue(
    ''
  );
  await gotify.getByLabel('Priority').fill('10');
  await gotify.getByRole('button', { name: 'Save Gotify' }).click();
  await expect(gotify.getByText('Notification settings saved.')).toBeVisible();

  const ntfy = page.locator('#ntfy');
  await ntfy.getByLabel('Authentication').selectOption('token');
  await expect(ntfy.getByLabel('Access Token', { exact: true })).toHaveValue(
    ''
  );
  await ntfy.getByLabel('Tags').fill('bell,house');
  await ntfy.getByRole('button', { name: 'Send ntfy Test' }).click();
  await expect(ntfy.getByText('Test notification sent.')).toBeVisible();

  const apprise = page.locator('#apprise');
  await apprise.getByLabel('Configuration Key').fill('bad key');
  await expect(
    apprise.getByRole('button', { name: 'Send Apprise Test' })
  ).toBeDisabled();
  await apprise.getByLabel('Configuration Key').fill('new-house');
  await apprise.getByLabel('Tag', { exact: true }).fill('films');
  await apprise.getByRole('button', { name: 'Save Apprise' }).click();
  await expect(apprise.getByText('Notification settings saved.')).toBeVisible();

  expect(calls).toEqual([
    { path: 'gotify', options: { ...agents.gotify, priority: 10 } },
    {
      path: 'ntfy/test',
      options: {
        ...agents.ntfy,
        authMethodUsernamePassword: false,
        authMethodToken: true,
        tags: 'bell,house',
      },
    },
    {
      path: 'apprise',
      options: { ...agents.apprise, configKey: 'new-house', tag: 'films' },
    },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await ntfy.screenshot({ path: info.outputPath('ntfy.png') });
});
