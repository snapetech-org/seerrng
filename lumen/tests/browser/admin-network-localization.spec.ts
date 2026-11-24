import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const translations = {
  en: {
    title: 'Network Settings',
    back: 'Administration',
    network: 'Network',
    dns: 'DNS Cache',
    proxy: 'Outbound Proxy',
    tls: 'Browser Transport Security',
    csrf: 'Enable CSRF Protection',
    dnsEnabled: 'DNS Cache',
    minTtl: 'DNS Cache Minimum TTL',
    proxyEnabled: 'HTTP(S) Proxy',
    proxyHost: 'Proxy Hostname',
    mode: 'Built-in HTTPS mode',
    disabled: 'Disabled (direct HTTP sign-in or use a reverse proxy)',
    auth: 'Allow authenticated browser sessions over HTTP',
    ack: 'I understand that HTTP login sessions can be intercepted on the network.',
    httpsPort: 'HTTPS Port',
    certificateFile: 'Certificate file',
    hosts: 'Self-signed HTTPS hostnames and IP addresses',
    restrict: 'Restrict Administrator Sign-In to Trusted Networks',
    allowed: 'Allowed Administrator Networks',
    save: 'Save Network Settings',
    ackError:
      'Confirm that HTTP login sessions can be intercepted before enabling sign-in over HTTP.',
    failure: 'The server had a problem. Try again in a moment.',
    confirmFailure: 'Could not confirm the saved network settings.',
    saved: 'Network settings saved.',
    currentIp:
      'Include your current client IP in the allowed networks before enabling or changing this restriction.',
  },
  fr: {
    title: 'Paramètres réseau',
    back: 'Administration',
    network: 'Réseau',
    dns: 'Cache DNS',
    proxy: 'Proxy sortant',
    tls: 'Sécurité du transport des navigateurs',
    csrf: 'Activer la protection CSRF',
    dnsEnabled: 'Cache DNS',
    minTtl: 'TTL minimum du cache DNS',
    proxyEnabled: 'Proxy HTTP(S)',
    proxyHost: "Nom d'hôte du proxy",
    mode: 'Mode HTTPS intégré',
    disabled: 'Désactivé (connexion HTTP directe ou proxy inverse)',
    auth: 'Permettre des sessions de navigateur authentifiées sur HTTP',
    ack: 'Je comprends que les sessions de connexion HTTP peuvent être interceptées sur le réseau.',
    httpsPort: 'Port HTTPS',
    certificateFile: 'Fichier de certificat',
    hosts: 'Noms d’hôte et adresses IP pour le HTTPS autosigné',
    restrict:
      'Limiter la connexion des administrateurs aux réseaux de confiance',
    allowed: 'Réseaux autorisés pour les administrateurs',
    save: 'Enregistrer les paramètres réseau',
    ackError:
      'Confirmez que les sessions de connexion HTTP peuvent être interceptées avant d’activer la connexion en HTTP.',
    failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
    confirmFailure:
      'Impossible de confirmer l’enregistrement des paramètres réseau.',
    saved: 'Paramètres réseau enregistrés.',
    currentIp:
      'Ajoutez l’adresse IP actuelle aux réseaux autorisés avant d’activer ou de modifier cette restriction.',
  },
  ar: {
    title: 'إعدادات الشبكة',
    back: 'الإدارة',
    network: 'الشبكة',
    dns: 'ذاكرة DNS المؤقتة',
    proxy: 'الوكيل الصادر',
    tls: 'أمن النقل',
    csrf: 'تفعيل حماية CSRF',
    dnsEnabled: 'ذاكرة DNS المؤقتة',
    minTtl: 'الحد الأدنى لعمر ذاكرة DNS المؤقتة (TTL)',
    proxyEnabled: 'بروكسي HTTP(S)',
    proxyHost: 'اسم مضيف البروكسي',
    mode: 'وضع HTTPS المدمج',
    disabled: 'معطّل (تسجيل دخول مباشر عبر HTTP أو استخدام وكيل عكسي)',
    auth: 'السماح بجلسات المتصفح الموثقة عبر HTTP',
    ack: 'أفهم أن جلسات تسجيل الدخول عبر HTTP قد تُعترض على الشبكة.',
    httpsPort: 'منفذ HTTPS',
    certificateFile: 'ملف الشهادة',
    hosts: 'أسماء المضيفين وعناوين IP لشهادة HTTPS ذاتية التوقيع',
    restrict: 'تقييد تسجيل دخول المسؤولين بالشبكات الموثوقة',
    allowed: 'الشبكات المسموح بها للمسؤولين',
    save: 'حفظ إعدادات الشبكة',
    ackError:
      'أقرّ بأن جلسات تسجيل الدخول عبر HTTP قد تُعترض قبل تفعيل تسجيل الدخول عبر HTTP.',
    failure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    confirmFailure: 'تعذّر تأكيد حفظ إعدادات الشبكة.',
    saved: 'تم حفظ إعدادات الشبكة.',
    currentIp:
      'أضف عنوان IP الحالي إلى الشبكات المسموح بها قبل تفعيل هذا التقييد أو تغييره.',
  },
} as const;

test('network settings localize controls and enforce native visibility and save rules', async ({
  page,
}) => {
  const locale = (
    ['en', 'fr', 'ar'].includes(process.env.LUMEN_NETWORK_LOCALE ?? '')
      ? process.env.LUMEN_NETWORK_LOCALE
      : 'en'
  ) as keyof typeof translations;
  const baseline = process.env.LUMEN_NETWORK_BASELINE === 'true';
  const labels = baseline
    ? { ...translations.en, tls: 'HTTP and HTTPS' }
    : translations[locale];
  const state: Record<string, any> = {
    csrfProtection: true,
    forceIpv4First: false,
    trustProxy: false,
    restrictAdministratorSignInToNetworks: false,
    administratorSignInAllowedNetworks: '',
    apiRequestTimeout: 10000,
    dnsCache: { enabled: false, forceMinTtl: 0, forceMaxTtl: -1 },
    proxy: {
      enabled: false,
      hostname: 'proxy.local',
      port: 8080,
      useSsl: false,
      user: '',
      password: '',
      bypassFilter: '',
      bypassLocalAddresses: false,
    },
    tls: {
      mode: 'disabled',
      httpsPort: 5056,
      hosts: '',
      certificateFile: '',
      keyFile: '',
      caFile: '',
      redirectHttpToHttps: false,
      showProvidedCertificateNotice: true,
      allowHttpAuth: false,
      httpAuthAcknowledged: false,
    },
  };
  const writes: Record<string, any>[] = [];
  let failOnce = true;
  let staleReadbackOnce = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/public'))
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    if (path.endsWith('/status/tls'))
      return route.fulfill({ json: { environmentOverrides: [] } });
    if (path.endsWith('/settings/network')) {
      if (request.method() === 'GET') return route.fulfill({ json: state });
      const patch = request.postDataJSON() as Record<string, any>;
      writes.push(patch);
      if (failOnce) {
        failOnce = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Service unavailable.' },
        });
      }
      if (staleReadbackOnce) {
        staleReadbackOnce = false;
        return route.fulfill({
          json: {
            ...state,
            tls: { ...state.tls, ...(patch.tls ?? {}) },
          },
        });
      }
      if (
        patch.restrictAdministratorSignInToNetworks &&
        patch.administratorSignInAllowedNetworks === '10.0.0.0/8'
      )
        return route.fulfill({
          status: 403,
          json: {
            message:
              'The current client IP must be included in the allowed networks before enabling or changing this restriction.',
          },
        });
      for (const [key, value] of Object.entries(patch))
        state[key] =
          typeof value === 'object' && value !== null
            ? { ...state[key], ...value }
            : value;
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/admin/network'));
  await expect(
    page.getByRole('heading', { name: labels.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.back, exact: true })
  ).toBeVisible();
  for (const name of [labels.network, labels.dns, labels.proxy, labels.tls])
    await expect(
      page.getByRole('heading', { name, exact: true, level: 2 })
    ).toBeVisible();
  if (!baseline) {
    await expect(page.getByLabel(labels.csrf, { exact: true })).toBeVisible();
    await expect(page.getByLabel(labels.minTtl, { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByLabel(labels.proxyHost, { exact: true })
    ).toHaveCount(0);
    await expect(page.getByLabel(labels.mode, { exact: true })).toHaveValue(
      'disabled'
    );
    await expect(
      page.getByLabel(labels.httpsPort, { exact: true })
    ).toHaveCount(0);
    await expect(page.getByLabel(labels.hosts, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_NETWORK_CAPTURE)
    await page.screenshot({
      path: `${process.env.LUMEN_NETWORK_CAPTURE}/${baseline ? 'baseline' : 'candidate'}-${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  if (baseline) return;

  await page.getByLabel(labels.auth, { exact: true }).check();
  const ack = page.getByLabel(labels.ack, { exact: true });
  await expect(ack).toBeVisible();
  const save = page.getByRole('button', { name: labels.save, exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText(labels.ackError);
  expect(writes).toHaveLength(0);
  await ack.check();
  await save.click();
  await expect(page.getByRole('alert')).toContainText(labels.failure);
  await expect(page.getByLabel(labels.auth, { exact: true })).toBeChecked();
  await save.click();
  await expect(page.getByRole('alert')).toContainText(labels.confirmFailure);
  await expect(page.getByLabel(labels.auth, { exact: true })).toBeChecked();
  expect(writes).toHaveLength(2);
  await save.click();
  await expect(page.getByText(labels.saved, { exact: false })).toBeVisible();
  expect(writes).toHaveLength(3);
  expect(writes[1]).toEqual({
    tls: { allowHttpAuth: true, httpAuthAcknowledged: true },
  });

  await page.getByLabel(labels.mode, { exact: true }).selectOption('provided');
  await expect(page.getByLabel(labels.auth, { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel(labels.httpsPort, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel(labels.certificateFile, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel(labels.proxyEnabled, { exact: true })
  ).toBeVisible();
  await page.getByLabel(labels.proxyEnabled, { exact: true }).check();
  await expect(
    page.getByLabel(labels.proxyHost, { exact: true })
  ).toBeVisible();
  await page.getByLabel(labels.dnsEnabled, { exact: true }).check();
  await expect(page.getByLabel(labels.minTtl, { exact: true })).toBeVisible();
  await page.getByLabel(labels.restrict, { exact: true }).check();
  const allowed = page.getByLabel(labels.allowed, { exact: true });
  await expect(allowed).toBeVisible();
  await allowed.fill('10.0.0.0/8');
  await save.click();
  await expect(page.getByRole('alert')).toContainText(labels.currentIp);
  expect(writes).toHaveLength(4);
  await allowed.fill('127.0.0.1/32');
  await save.click();
  await expect(page.getByText(labels.saved, { exact: false })).toBeVisible();
  expect(state.restrictAdministratorSignInToNetworks).toBe(true);
  expect(state.administratorSignInAllowedNetworks).toBe('127.0.0.1/32');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
