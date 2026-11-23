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
  let staleEmailReadback = false;
  const persistedChannels = new Map<string, Record<string, unknown>>();
  persistedChannels.set('email', email);
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
      if (path.endsWith('/email') && staleEmailReadback) {
        staleEmailReadback = false;
        return route.fulfill({ json: email });
      }
      return route.fulfill({
        json: persistedChannels.get(path.slice(prefix.length)) ?? {
          enabled: false,
          embedPoster: false,
          options: {},
        },
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
    if (path.endsWith('/email')) {
      persistedChannels.set('email', body);
      staleEmailReadback =
        writes.filter((entry) => entry.path === 'email').length === 2;
    } else {
      persistedChannels.set(path.slice(prefix.length), body);
    }
    return route.fulfill({ json: body });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Instance Notifications' }).click();
  await page.getByRole('link', { name: 'Open Email' }).click();
  await expect(page.getByLabel('SMTP Host', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('SMTP Password', { exact: true })).toHaveValue(
    ''
  );
  await page.getByRole('button', { name: 'Send Email Test' }).click();
  await expect(page.getByText('Email test notification sent!')).toBeVisible();
  expect(writes[0]).toEqual({
    path: 'email/test',
    body: { ...email, enabled: true },
  });
  await page
    .getByLabel('Use public Seerr logo instead of instance logo')
    .check();
  const save = page.getByRole('button', { name: 'Save Email' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Email notification settings failed to save.'
  );
  if (process.env.LUMEN_ADMIN_NOTIFICATION_READBACK_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_NOTIFICATION_READBACK_CAPTURE_DIR}/email-readback-failure-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(
    page.getByLabel('Use public Seerr logo instead of instance logo')
  ).toBeChecked();
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Email notification settings failed to save.'
  );
  await expect(
    page.getByLabel('Use public Seerr logo instead of instance logo')
  ).toBeChecked();
  await save.click();
  await expect(
    page.getByText('Email notification settings saved successfully!')
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Notification Channels' })
    .getByRole('link', { name: 'Web Push', exact: true })
    .click();
  await page.getByRole('checkbox', { name: 'Enable Agent' }).last().check();
  await page.getByRole('button', { name: 'Save Web Push' }).click();
  await expect(
    page.getByText('Web push notification settings saved successfully!')
  ).toBeVisible();
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

test('notification settings load failures use localized recovery and retry', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ADMIN_NOTIFICATION_LOCALE ?? ''
  )
    ? process.env.LUMEN_ADMIN_NOTIFICATION_LOCALE!
    : 'en';
  const copy = {
    en: {
      title: 'Couldn’t load Email settings.',
      error: 'The server had a problem. Try again in a moment.',
      retry: 'Retry',
      sender: 'Sender Name',
    },
    fr: {
      title: 'Impossible de charger les paramètres de Email.',
      error: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
      retry: 'Réessayer',
      sender: "Nom de l'expéditeur",
    },
    ar: {
      title: 'تعذر تحميل إعدادات Email.',
      error: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
      retry: 'إعادة المحاولة',
      sender: 'اسم المرسل',
    },
  }[locale];
  let emailReads = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/settings/main'))
      return route.fulfill({ json: { locale } });
    if (
      request.method() === 'GET' &&
      path.endsWith('/settings/notifications/email')
    ) {
      emailReads += 1;
      if (emailReads === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Service Unavailable' },
        });
      return route.fulfill({
        json: { enabled: false, embedPoster: false, options: {} },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin/notifications/email');
  const error = page.getByRole('alert');
  await expect(error.getByText(copy.title, { exact: true })).toBeVisible();
  await expect(error.getByText(copy.error, { exact: true })).toBeVisible();
  await expect(error.getByRole('button', { name: copy.retry })).toBeVisible();
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
  if (process.env.LUMEN_ADMIN_NOTIFICATION_ERROR_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_NOTIFICATION_ERROR_CAPTURE_DIR}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await error.getByRole('button', { name: copy.retry }).click();
  await expect(page.locator('#email').getByLabel(copy.sender)).toBeVisible();
  expect(emailReads).toBe(2);
});

test('messaging channels preserve credentials and independent event masks', async ({
  page,
}, info) => {
  const requestedLocale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ADMIN_NOTIFICATION_LOCALE ?? ''
  )
    ? process.env.LUMEN_ADMIN_NOTIFICATION_LOCALE!
    : 'en';
  const baseline = process.env.LUMEN_ADMIN_NOTIFICATION_BASELINE === '1';
  const locale = requestedLocale;
  const eventLabels = {
    en: { approved: 'Request approved', available: 'Media available' },
    fr: { approved: 'Demande validée', available: 'Média demandé disponible' },
    ar: {
      approved: 'تمت الموافقة على الطلب',
      available: 'المحتوى المطلوب متاح',
    },
  }[baseline ? 'en' : locale];
  const controlLabels = {
    en: {
      enable: 'Enable Agent',
      botToken: 'Bot Authorization Token',
      thread: 'Thread/Topic ID',
      silent: 'Send Silently',
      channelTag: 'Channel Tag',
      sound: 'Notification Sound',
      saveTelegram: 'Save Telegram',
      savePushbullet: 'Save Pushbullet',
      savePushover: 'Save Pushover',
    },
    fr: {
      enable: 'Activer l’agent de notification',
      botToken: "Jeton d'autorisation du bot",
      thread: 'ID du fil de discussion',
      silent: 'Envoyer silencieusement',
      channelTag: 'Étiquette de canal',
      sound: 'Son de notification',
      saveTelegram: 'Enregistrer Telegram',
      savePushbullet: 'Enregistrer Pushbullet',
      savePushover: 'Enregistrer Pushover',
    },
    ar: {
      enable: 'تفعيل خدمة الإشعارات',
      botToken: 'رمز تفويض البوت',
      thread: 'معرّف الخيط/الموضوع',
      silent: 'أرسل بشكل صامت',
      channelTag: 'علامة القناة',
      sound: 'صوت التنبيه',
      saveTelegram: 'حفظ Telegram',
      savePushbullet: 'حفظ Pushbullet',
      savePushover: 'حفظ Pushover',
    },
  }[baseline ? 'en' : locale];
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
  const persistedAgents: Record<string, unknown> = { ...agents };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/pushover/sounds'))
      return route.fulfill({ json: [{ name: 'bell', description: 'Bell' }] });
    const channel = path.split('/').at(-1)! as keyof typeof agents;
    if (!(channel in agents))
      return route.fulfill({
        json: { enabled: false, embedPoster: false, options: {} },
      });
    if (request.method() === 'GET')
      return route.fulfill({ json: persistedAgents[channel] });
    const body = request.postDataJSON();
    saved.push({ path: channel, body });
    if (!path.endsWith('/test')) persistedAgents[channel] = body;
    return route.fulfill({ json: body });
  });
  await page.goto('/admin/notifications/telegram');
  const telegram = page.locator('#telegram');
  await expect(
    telegram.getByLabel(controlLabels.botToken, { exact: true })
  ).toHaveValue('');
  await telegram.getByLabel(controlLabels.enable).check();
  await expect(
    telegram.getByRole('button', { name: controlLabels.saveTelegram })
  ).toBeDisabled();
  await telegram.getByLabel(eventLabels.approved, { exact: true }).check();
  await telegram.getByLabel(controlLabels.thread).fill('42');
  await telegram.getByLabel(controlLabels.silent).check();
  await telegram
    .getByRole('button', { name: controlLabels.saveTelegram })
    .click();
  await expect(
    telegram.getByText(
      {
        en: 'Telegram notification settings saved successfully!',
        fr: 'Paramètres de notification Telegram enregistrés !',
        ar: 'تم حفظ إعدادات التليقرام بنجاح!',
      }[locale]
    )
  ).toBeVisible();
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await telegram.screenshot({ path: info.outputPath('telegram.png') });

  await page.goto('/admin/notifications/pushbullet');
  const pushbullet = page.locator('#pushbullet');
  await pushbullet.getByLabel(controlLabels.channelTag).fill('household');
  await pushbullet.getByLabel(eventLabels.available, { exact: true }).check();
  await pushbullet
    .getByRole('button', { name: controlLabels.savePushbullet })
    .click();
  await expect(
    pushbullet.getByText(
      {
        en: 'Pushbullet notification settings saved successfully!',
        fr: 'Paramètres de notification Pushbullet enregistrés !',
        ar: 'تم حفظ إعدادات إشعارات Pushbullet بنجاح!',
      }[locale]
    )
  ).toBeVisible();

  await page.goto('/admin/notifications/pushover');
  const pushover = page.locator('#pushover');
  await pushover.getByLabel(controlLabels.sound).selectOption('bell');
  await pushover
    .getByRole('button', { name: controlLabels.savePushover })
    .click();
  await expect(
    pushover.getByText(
      {
        en: 'Pushover notification settings saved successfully!',
        fr: 'Paramètres de notification Pushover enregistrés !',
        ar: 'تم حفظ إعدادات تنبيه Pushover!',
      }[locale]
    )
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
  const persistedAgents: Record<string, unknown> = Object.fromEntries(
    Object.entries(agents).map(([channel, options]) => [
      channel,
      { enabled: false, embedPoster: false, types: 0, options },
    ])
  );
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
          ...(persistedAgents[channel] as Record<string, unknown>),
        },
      });
    const body = request.postDataJSON() ?? { options: {} };
    calls.push({ path: name, options: body.options });
    if (name.endsWith('/test')) return route.fulfill({ status: 204 });
    persistedAgents[channel] = body;
    return route.fulfill({ json: body });
  });

  await page.goto('/admin/notifications/gotify');
  const gotify = page.locator('#gotify');
  await expect(
    gotify.getByLabel('Application Token', { exact: true })
  ).toHaveValue('');
  await gotify.getByLabel('Priority').fill('10');
  await gotify.getByRole('button', { name: 'Save Gotify' }).click();
  await expect(
    gotify.getByText('Gotify notification settings saved successfully!')
  ).toBeVisible();

  await page.goto('/admin/notifications/ntfy');
  const ntfy = page.locator('#ntfy');
  await ntfy.getByLabel('Authentication').selectOption('token');
  await expect(ntfy.getByLabel('Token', { exact: true })).toHaveValue('');
  await ntfy.getByLabel('Tags').fill('bell,house');
  await ntfy.getByRole('button', { name: 'Send ntfy Test' }).click();
  await expect(ntfy.getByText('Ntfy test notification sent!')).toBeVisible();
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await ntfy.screenshot({ path: info.outputPath('ntfy.png') });

  await page.goto('/admin/notifications/apprise');
  const apprise = page.locator('#apprise');
  await apprise.getByLabel('Configuration Key').fill('bad key');
  await expect(
    apprise.getByRole('button', { name: 'Send Apprise Test' })
  ).toBeDisabled();
  await apprise.getByLabel('Configuration Key').fill('new-house');
  await apprise.getByLabel('Tag', { exact: true }).fill('films');
  await apprise.getByRole('button', { name: 'Save Apprise' }).click();
  await expect(
    apprise.getByText('Apprise notification settings saved successfully.')
  ).toBeVisible();

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
  const persistedAgents: Record<string, unknown> = Object.fromEntries(
    Object.entries(agents).map(([channel, options]) => [
      channel,
      { enabled: false, embedPoster: false, types: 0, options },
    ])
  );
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
        json: persistedAgents[channel] ?? {
          enabled: false,
          embedPoster: false,
          types: 0,
          options: {},
        },
      });
    const body = request.postDataJSON();
    calls.push({ path: name, body });
    if (name.endsWith('/test')) return route.fulfill({ status: 204 });
    persistedAgents[channel] = body;
    return route.fulfill({ json: body });
  });
  await page.goto('/admin/notifications/discord');
  const discord = page.locator('#discord');
  await expect(discord.getByLabel('Webhook URL', { exact: true })).toHaveValue(
    ''
  );
  await discord.getByLabel('Thread ID').fill('123456789');
  await discord.getByRole('button', { name: 'Send Discord Test' }).click();
  await expect(
    discord.getByText('Discord test notification sent!')
  ).toBeVisible();
  await discord.getByRole('button', { name: 'Save Discord' }).click();
  await expect(
    discord.getByText('Discord notification settings saved successfully!')
  ).toBeVisible();

  await page.goto('/admin/notifications/slack');
  const slack = page.locator('#slack');
  await slack.getByLabel('Enable request approval actions').check();
  const save = slack.getByRole('button', { name: 'Save Slack' });
  await expect(save).toBeDisabled();
  await expect(
    slack.getByLabel('Slack signing secret', { exact: true })
  ).toHaveValue('');
  await slack.getByLabel('Slack workspace ID').fill('T12345678');
  await slack
    .getByLabel('Request manager mappings')
    .fill('U12345678=42\nU87654321=43');
  await slack.getByLabel('Request awaiting approval').check();
  await save.click();
  await expect(
    slack.getByText('Slack notification settings saved successfully!')
  ).toBeVisible();

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
  let persistedWebhook: Record<string, unknown> | undefined;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (request.method() === 'GET' && path.endsWith('/settings/public'))
      return route.fulfill({ json: {} });
    if (request.method() === 'GET' && path.endsWith('/notifications/webhook'))
      return route.fulfill({
        json: persistedWebhook ?? {
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
    if (request.method() === 'GET') return route.fulfill({ json: {} });
    const body = request.postDataJSON();
    calls.push({ path: path.split('/').at(-1)!, body });
    if (path.endsWith('/test')) return route.fulfill({ status: 204 });
    const response = {
      ...body,
      options: {
        ...body.options,
        jsonPayload: 'encoded',
        customHeaders: Array.isArray(body.options?.customHeaders)
          ? body.options.customHeaders.map(({ key }: { key: string }) => ({
              key,
              value: '[REDACTED]',
            }))
          : [],
      },
    };
    persistedWebhook = response;
    return route.fulfill({
      json: response,
    });
  });
  await page.goto('/admin/notifications/webhook');
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
  await expect(
    section.getByText('Webhook test notification sent!')
  ).toBeVisible();
  await save.click();
  await expect(
    section.getByText('Webhook notification settings saved successfully!')
  ).toBeVisible();
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

test('a channel link loads only that channel settings', async ({
  page,
}, info) => {
  const channels: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!path.startsWith('/api/v1/settings/notifications/'))
      return route.fulfill({ json: {} });
    const channel = path.split('/').at(-1)!;
    channels.push(channel);
    return route.fulfill({
      json: {
        enabled: false,
        embedPoster: false,
        types: 0,
        options: { jsonPayload: '{}' },
      },
    });
  });
  await page.goto('/admin/notifications/webhook');
  const nav = page.getByRole('navigation', { name: 'Notification Channels' });
  await expect(
    nav.getByRole('link', { name: 'Webhook', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('JSON Payload')).toHaveValue('{}');
  expect(channels).toEqual(['webhook']);
  await nav.getByRole('link', { name: 'Discord', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Discord', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Thread ID')).toBeVisible();
  await expect(page.getByLabel('JSON Payload')).toHaveCount(0);
  expect(channels).toEqual(['webhook', 'discord']);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_NOTIFICATIONS)
    await page.screenshot({
      path: info.outputPath('channel.png'),
      fullPage: true,
    });
});
