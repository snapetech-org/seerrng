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
    if (request.method() === 'GET' && path.endsWith('/notifications/webhook'))
      return route.fulfill({
        json: {
          enabled: false,
          embedPoster: false,
          types: 0,
          options: { jsonPayload: '{}' },
        },
      });
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
    if (request.method() === 'GET' && path.endsWith('/notifications/webhook'))
      return route.fulfill({
        json: {
          enabled: false,
          embedPoster: false,
          types: 0,
          options: { jsonPayload: '{}' },
        },
      });
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

test('Discord thread and Slack approval settings preserve saved secrets', async ({
  page,
}, info) => {
  const calls: { path: string; body: unknown }[] = [];
  const agents = {
    discord: { webhookUrl: '[REDACTED]', locale: 'en', useUserLocale: true },
    slack: {
      webhookUrl: '[REDACTED]',
      locale: 'en',
      signingSecret: '[REDACTED]',
    },
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (request.method() === 'GET' && path.endsWith('/notifications/webhook'))
      return route.fulfill({
        json: {
          enabled: false,
          embedPoster: false,
          types: 0,
          options: { jsonPayload: '{}' },
        },
      });
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
    calls.push({ path: name, body });
    return name.endsWith('/test')
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: body });
  });
  await page.goto('/admin/notifications');
  const discord = page.locator('#discord');
  await expect(discord.getByLabel('Webhook URL', { exact: true })).toHaveValue(
    ''
  );
  await discord.getByLabel('Thread ID').fill('123456789');
  await discord.getByRole('button', { name: 'Send Discord Test' }).click();
  await expect(discord.getByText('Test notification sent.')).toBeVisible();
  await discord.getByRole('button', { name: 'Save Discord' }).click();
  await expect(discord.getByText('Notification settings saved.')).toBeVisible();

  const slack = page.locator('#slack');
  await slack.getByLabel('Enable Request Approval Actions').check();
  const save = slack.getByRole('button', { name: 'Save Slack' });
  await expect(save).toBeDisabled();
  await expect(
    slack.getByLabel('Slack Signing Secret', { exact: true })
  ).toHaveValue('');
  await slack.getByLabel('Slack Workspace ID').fill('T12345678');
  await slack
    .getByLabel('Request Manager Mappings')
    .fill('U12345678=42\nU87654321=43');
  await slack.getByLabel('Request awaiting approval').check();
  await save.click();
  await expect(slack.getByText('Notification settings saved.')).toBeVisible();

  const discordPayload = {
    enabled: false,
    embedPoster: false,
    types: 0,
    options: { ...agents.discord, webhookThreadId: '123456789' },
  };
  expect(calls).toEqual([
    { path: 'discord/test', body: { ...discordPayload, enabled: true } },
    { path: 'discord', body: discordPayload },
    {
      path: 'slack',
      body: {
        enabled: false,
        embedPoster: false,
        types: 2,
        options: {
          ...agents.slack,
          requestActionsEnabled: true,
          workspaceId: 'T12345678',
          requestManagerMappings: 'U12345678=42\nU87654321=43',
        },
      },
    },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await slack.screenshot({ path: info.outputPath('slack.png') });
});

test('webhook edits validate JSON and preserve redacted header values', async ({
  page,
}, info) => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (request.method() === 'GET')
      return route.fulfill({
        json: {
          enabled: false,
          embedPoster: false,
          types: 0,
          options: path.endsWith('/notifications/webhook')
            ? {
                webhookUrl: '[REDACTED]',
                jsonPayload: '{"message":"{{message}}"}',
                customHeaders: [{ key: 'X-Example', value: '[REDACTED]' }],
              }
            : {},
        },
      });
    const body = request.postDataJSON();
    calls.push({ path: path.split('/').at(-1)!, body });
    return path.endsWith('/test')
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          json: {
            ...body,
            options: {
              ...body.options,
              jsonPayload: 'encoded',
              customHeaders: body.options.customHeaders.map(
                ({ key }: { key: string }) => ({ key, value: '[REDACTED]' })
              ),
            },
          },
        });
  });
  await page.goto('/admin/notifications');
  const section = page.locator('#webhook');
  const payload = section.getByLabel('JSON Payload');
  const save = section.getByRole('button', { name: 'Save Webhook' });
  const send = section.getByRole('button', { name: 'Send Webhook Test' });
  await expect(section.getByLabel('Header 1 Value')).toHaveValue('');
  await payload.fill('{');
  await expect(send).toBeDisabled();
  await expect(section.getByText('Enter a valid JSON payload.')).toBeVisible();
  await payload.fill('{"message":"{{message}}","title":"Québec"}');
  await section.getByRole('button', { name: 'Add Header' }).click();
  await section.getByLabel('Header 2 Name').fill('X-Other');
  await expect(save).toBeDisabled();
  await section.getByLabel('Header 2 Value').fill('fixture-value');
  await section.getByLabel('Support URL Variables').check();
  await send.click();
  await expect(section.getByText('Test notification sent.')).toBeVisible();
  await save.click();
  await expect(section.getByText('Notification settings saved.')).toBeVisible();
  await expect(payload).toHaveValue(
    '{"message":"{{message}}","title":"Québec"}'
  );
  await expect(section.getByLabel('Header 2 Value')).toHaveValue('');
  await section.getByLabel('Header 1 Name').fill('X-Renamed');
  await expect(save).toBeDisabled();
  expect(calls.map(({ path }) => path)).toEqual(['test', 'webhook']);
  expect(calls[1].body.options).toEqual({
    webhookUrl: '[REDACTED]',
    jsonPayload: '{"message":"{{message}}","title":"Québec"}',
    supportVariables: true,
    customHeaders: [
      { key: 'X-Example', value: '[REDACTED]' },
      { key: 'X-Other', value: 'fixture-value' },
    ],
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await section.screenshot({ path: info.outputPath('webhook.png') });
});
