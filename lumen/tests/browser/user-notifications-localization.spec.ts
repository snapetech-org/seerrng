import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_USER_NOTIFICATIONS_LOCALE ?? ''
)
  ? process.env.LUMEN_USER_NOTIFICATIONS_LOCALE!
  : 'en';
const baseline = process.env.LUMEN_USER_NOTIFICATIONS_BASELINE === '1';

const text = {
  en: {
    title: 'Notification Settings',
    account: 'Account Settings',
    email: 'Email',
    emailSaved: 'Email notification settings saved successfully!',
    approved: 'Request approved',
    available: 'Media available',
    saveKey: 'Save Public Key',
    keySaved: 'Public key saved.',
    removeKey: 'Remove Public Key',
    confirmRemoveKey: 'Confirm Remove Key',
    keyRemoved: 'Public key removed.',
    topicId: 'Topic ID',
    saveTelegram: 'Save Telegram Settings',
    telegramSaved: 'Telegram notification settings saved successfully!',
    deviceName: 'Browser device',
    removeDevice: 'Delete Subscription',
    removeDeviceTitle: 'Remove this browser device?',
    deviceRemoved: 'Browser device removed.',
    loadFailure: 'Could not load notification settings.',
    retry: 'Retry',
  },
  fr: {
    title: 'Paramètres de notification',
    account: 'Paramètres du compte',
    email: 'E-mail',
    emailSaved:
      'Les paramètres de notification par e-mail ont été enregistrés !',
    approved: 'Demande validée',
    available: 'Média demandé disponible',
    saveKey: 'Enregistrer la clé publique',
    keySaved: 'Clé publique enregistrée.',
    removeKey: 'Supprimer la clé publique',
    confirmRemoveKey: 'Confirmer la suppression de la clé',
    keyRemoved: 'Clé publique supprimée.',
    topicId: 'ID du fil de discussion',
    saveTelegram: 'Enregistrer les paramètres Telegram',
    telegramSaved:
      'Les paramètres de notification Telegram ont été enregistrés !',
    deviceName: 'Appareil de navigateur',
    removeDevice: "Supprimer l'abonnement",
    removeDeviceTitle: 'Supprimer cet appareil de navigateur ?',
    deviceRemoved: 'Appareil de navigateur supprimé.',
    loadFailure: 'Impossible de charger les paramètres de notification.',
    retry: 'Réessayer',
  },
  ar: {
    title: 'إعدادات التنبيه',
    account: 'إعدادات الحساب',
    email: 'البريد الإلكترونيّ',
    emailSaved: 'تم حفظ إعدادات تنبيه الإيميل بنجاح!',
    approved: 'تمت الموافقة على الطلب',
    available: 'المحتوى المطلوب متاح',
    saveKey: 'حفظ المفتاح العام',
    keySaved: 'تم حفظ المفتاح العام.',
    removeKey: 'إزالة المفتاح العام',
    confirmRemoveKey: 'تأكيد إزالة المفتاح',
    keyRemoved: 'تمت إزالة المفتاح العام.',
    topicId: 'معرّف الخيط/الموضوع',
    saveTelegram: 'حفظ إعدادات Telegram',
    telegramSaved: 'تم حفظ إعدادات تنبيه التليقرام بنجاح!',
    deviceName: 'جهاز متصفح',
    removeDevice: 'حذف الاشتراك',
    removeDeviceTitle: 'هل تريد إزالة جهاز هذا المتصفح؟',
    deviceRemoved: 'تمت إزالة جهاز المتصفح.',
    loadFailure: 'تعذر تحميل إعدادات الإشعارات.',
    retry: 'إعادة المحاولة',
  },
} as const;

test('personal notification settings recover from an initial load failure', async ({
  page,
}) => {
  const localized = text[locale as keyof typeof text];
  let reads = 0;
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
        json: { id: 1, displayName: 'Fixture User', permissions: 0 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/user/1/settings/notifications') {
      reads++;
      if (reads === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary notification failure.' },
        });
      return route.fulfill({
        json: {
          emailEnabled: true,
          webPushEnabled: false,
          notificationTypes: { email: 2 },
        },
      });
    }
    if (path === '/settings/public')
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/me/account/notifications'));
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Temporary notification failure.');
  await expect(alert).toContainText(localized.loadFailure);
  await expect(
    alert.getByRole('button', { name: localized.retry, exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  if (process.env.LUMEN_USER_NOTIFICATIONS_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_USER_NOTIFICATIONS_CAPTURE_DIR}/load-failure-${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await alert
    .getByRole('button', { name: localized.retry, exact: true })
    .click();
  await expect(
    page.locator('#notification-email').getByRole('heading', {
      name: localized.email,
    })
  ).toBeVisible();
  expect(reads).toBe(2);
});

test('personal notification controls follow the account locale and preserve channel writes', async ({
  page,
}) => {
  const localized = text[locale as keyof typeof text];
  const pageLabels = localized;
  const pageDeviceName = baseline ? text.en.deviceName : localized.deviceName;
  const notifications = {
    emailEnabled: true,
    webPushEnabled: true,
    pgpKey: null,
    discordEnabled: true,
    discordEnabledTypes: 65534,
    discordIds: [],
    telegramEnabled: true,
    telegramBotUsername: 'fixture_bot',
    telegramChatId: '-100',
    telegramMessageThreadId: '',
    telegramSendSilently: false,
    pushbulletAccessToken: '[REDACTED]',
    pushoverApplicationToken: '[REDACTED]',
    pushoverUserKey: '[REDACTED]',
    pushoverSound: '',
    notificationTypes: {
      email: 2,
      telegram: 0,
      discord: 0,
      pushbullet: 0,
      pushover: 0,
      webpush: 2,
    },
  };
  const writes: Record<string, unknown>[] = [];
  const devices = [
    {
      endpoint: 'https://push.example.test/fixture',
      userAgent: 'FixtureBrowser/1',
      createdAt: '2026-01-02T03:04:05Z',
    },
  ];

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture User', permissions: 0 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/user/1/settings/notifications') {
      if (request.method() === 'GET')
        return route.fulfill({ json: notifications });
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push(body);
      Object.assign(notifications, body);
      const types = body.notificationTypes as
        Record<string, number> | undefined;
      if (types) {
        notifications.notificationTypes = {
          ...notifications.notificationTypes,
          ...types,
        };
      }
      return route.fulfill({ json: notifications });
    }
    if (path === '/user/1/pushSubscriptions')
      return route.fulfill({ json: devices });
    if (
      request.method() === 'DELETE' &&
      path.startsWith('/user/1/pushSubscription/')
    ) {
      devices.length = 0;
      return route.fulfill({ status: 204 });
    }
    if (path === '/settings/notifications/pushover/sounds')
      return route.fulfill({ json: [{ name: 'bell', description: 'Bell' }] });
    if (path === '/settings/public')
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/me/account/notifications'));
  await expect(
    page.getByRole('heading', { name: pageLabels.title })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: pageLabels.account })
  ).toBeVisible();
  await expect(
    page.locator('#notification-email').getByRole('heading', {
      name: pageLabels.email,
    })
  ).toBeVisible();
  await expect(
    page.getByLabel(localized.approved, { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByLabel(localized.available, { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText(pageDeviceName, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: localized.removeDevice })
  ).toBeVisible();
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

  if (process.env.LUMEN_USER_NOTIFICATIONS_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_USER_NOTIFICATIONS_CAPTURE_DIR}/${baseline ? 'baseline' : 'candidate'}-${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });

  if (baseline) return;

  const email = page.locator('#notification-email');
  await email.getByLabel(localized.available, { exact: true }).check();
  await email.getByRole('button').first().click();
  await expect(
    page.getByText(localized.emailSaved, { exact: true })
  ).toBeVisible();
  expect(writes).toEqual([{ notificationTypes: { email: 10 } }]);

  const publicKey = [
    '-----BEGIN PGP PUBLIC KEY BLOCK-----',
    'fixture-public-key',
    '-----END PGP PUBLIC KEY BLOCK-----',
  ].join('\n');
  await email.locator('textarea').fill(publicKey);
  await email.getByRole('button', { name: localized.saveKey }).click();
  await expect(
    page.getByText(localized.keySaved, { exact: true })
  ).toBeVisible();
  await email.getByRole('button', { name: localized.removeKey }).click();
  await email.getByRole('button', { name: localized.confirmRemoveKey }).click();
  await expect(
    page.getByText(localized.keyRemoved, { exact: true })
  ).toBeVisible();

  const telegram = page.locator('#notification-telegram');
  await telegram.getByLabel(localized.topicId).fill('42');
  await telegram.getByRole('button', { name: localized.saveTelegram }).click();
  await expect(
    page.getByText(localized.telegramSaved, {
      exact: true,
    })
  ).toBeVisible();
  await page.getByRole('button', { name: localized.removeDevice }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(
    confirmation.getByText(localized.removeDeviceTitle)
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: localized.removeDevice })
    .click();
  await expect(
    page.getByText(localized.deviceRemoved, { exact: true })
  ).toBeVisible();
  expect(devices).toHaveLength(0);
  expect(writes).toEqual([
    { notificationTypes: { email: 10 } },
    { pgpKey: publicKey },
    { pgpKey: null },
    {
      telegramChatId: '-100',
      telegramMessageThreadId: '42',
      telegramSendSilently: false,
      notificationTypes: { telegram: 0 },
    },
  ]);
});
