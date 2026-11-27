import { expect, test } from '@playwright/test';

const labels = {
  en: {
    guide: 'Setup Guide',
    steps: 'Setup steps',
    categories: 'Configure Media Categories',
    services: 'Request Services',
    defaultsStep: 'Defaults for New Users',
    defaultsTitle: 'Set defaults for new users',
    saveDefaults: 'Save defaults and continue',
    review: 'Review Setup',
    serviceGroup: 'Service Group',
    allServices: 'All Request Services',
    next: 'Next Step',
    previous: 'Previous Step',
    enabledLibraries: 'Enabled Media Libraries',
    libraryRequired:
      'Enable at least one media library before finishing setup.',
    downloadClients: 'Download Clients',
    prowlarr: 'Prowlarr',
    configured: 'Configured',
    returnToAdmin: 'Return to Administration',
    firstRun: 'Set Up SeerrNG',
    mediaServer: 'Media server',
    plexSignIn: 'Sign in with Plex',
    hostname: 'Hostname',
    username: 'Username',
    email: 'Email',
    connect: 'Connect and Sign In',
  },
  fr: {
    guide: 'Guide de configuration',
    steps: 'Étapes de configuration',
    categories: 'Configurer les catégories de médias',
    services: 'Services de demande',
    defaultsStep: 'Valeurs par défaut des nouveaux utilisateurs',
    defaultsTitle:
      'Définir les valeurs par défaut pour les nouveaux utilisateurs',
    saveDefaults: 'Enregistrer les valeurs par défaut et continuer',
    review: 'Vérifier la configuration',
    serviceGroup: 'Groupe de services',
    allServices: 'Tous les services de demande',
    next: 'Étape suivante',
    previous: 'Étape précédente',
    enabledLibraries: 'Bibliothèques multimédias activées',
    libraryRequired:
      'Activez au moins une bibliothèque multimédia avant de terminer la configuration.',
    downloadClients: 'Clients de téléchargement',
    prowlarr: 'Prowlarr',
    configured: 'Configuré',
    returnToAdmin: 'Retour à l’administration',
    firstRun: 'Configurer SeerrNG',
    mediaServer: 'Serveur multimédia',
    plexSignIn: 'Se connecter avec Plex',
    hostname: 'Nom d’hôte',
    username: 'Nom d’utilisateur',
    email: 'Adresse e-mail',
    connect: 'Se connecter et ouvrir une session',
  },
  ar: {
    guide: 'دليل الإعداد',
    steps: 'خطوات الإعداد',
    categories: 'تكوين فئات الوسائط',
    services: 'خدمات الطلب',
    defaultsStep: 'الإعدادات الافتراضية للمستخدمين الجدد',
    defaultsTitle: 'تعيين القيم الافتراضية للمستخدمين الجدد',
    saveDefaults: 'حفظ الإعدادات الافتراضية والمتابعة',
    review: 'مراجعة الإعداد',
    serviceGroup: 'مجموعة الخدمات',
    allServices: 'جميع خدمات الطلب',
    next: 'الخطوة التالية',
    previous: 'الخطوة السابقة',
    enabledLibraries: 'مكتبات الوسائط المفعّلة',
    libraryRequired: 'فعّل مكتبة وسائط واحدة على الأقل قبل إنهاء الإعداد.',
    downloadClients: 'عملاء التنزيل',
    prowlarr: 'Prowlarr',
    configured: 'مُعدّ',
    returnToAdmin: 'العودة إلى الإدارة',
    firstRun: 'إعداد SeerrNG',
    mediaServer: 'خادم الوسائط',
    plexSignIn: 'تسجيل الدخول باستخدام Plex',
    hostname: 'اسم المضيف',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    connect: 'الاتصال وتسجيل الدخول',
  },
} as const;

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`setup guide follows ${locale}`, async ({ page }, info) => {
    const copy = labels[locale];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice(7);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            mediaServerType: 4,
            enabledMediaCategories: { ebook: true, music: false },
          },
        });
      if (path === '/settings/main')
        return route.fulfill({
          json: {
            defaultPermissions: 0,
            enable4k: false,
            partialRequestsEnabled: false,
          },
        });
      if (path === '/settings/jellyfin')
        return route.fulfill({
          json: {
            libraries: [{ id: '1', name: 'Fixture Library', enabled: true }],
          },
        });
      if (path === '/settings/download-clients')
        return route.fulfill({ json: { clients: [{ enabled: true }] } });
      if (path === '/settings/prowlarr')
        return route.fulfill({
          json: { hostname: 'indexer.example.test', apiKeyConfigured: true },
        });
      if (
        /^\/settings\/(radarr|sonarr|readarr|lazylibrarian|lidarr|mylar|kapowarr|backissue|sportarr|whisparr)$/.test(
          path
        )
      )
        return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    await page.goto(`${mount}/setup?guide=1&step=review`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: copy.guide })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: copy.steps })
    ).toBeVisible();
    await expect(page.getByText(copy.enabledLibraries)).toBeVisible();
    await expect(
      page.locator('dt').filter({ hasText: copy.downloadClients })
    ).toBeVisible();
    await expect(
      page.locator('dt').filter({ hasText: copy.prowlarr })
    ).toBeVisible();
    await expect(
      page.getByText(copy.configured, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: copy.returnToAdmin })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`setup-review-${locale}.png`),
      animations: 'disabled',
    });

    await page.goto(`${mount}/setup?guide=1&step=services`);
    await expect(
      page.getByRole('navigation').getByRole('link', { name: copy.services })
    ).toBeVisible();
    await page.goto(`${mount}/setup?guide=1&step=defaults`);
    await expect(
      page
        .getByRole('navigation')
        .getByRole('link', { name: copy.defaultsStep })
    ).toBeVisible();
    await expect(
      page.getByText(copy.defaultsTitle, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.saveDefaults })
    ).toBeVisible();

    await page.goto(`${mount}/setup?guide=1&step=services`);
    const serviceGroup = page.getByLabel(copy.serviceGroup);
    const serviceGroupLabel = page
      .locator('label.sel')
      .filter({ has: serviceGroup });
    await expect(serviceGroup).toBeVisible();
    const labelBounds = await serviceGroupLabel.locator('span').boundingBox();
    const selectBounds = await serviceGroup.boundingBox();
    const controlBounds = await serviceGroupLabel.boundingBox();
    expect(labelBounds).not.toBeNull();
    expect(selectBounds).not.toBeNull();
    expect(controlBounds).not.toBeNull();
    if (!labelBounds || !selectBounds || !controlBounds) {
      throw new Error('The setup service-group control did not render.');
    }
    expect(selectBounds.x + selectBounds.width).toBeLessThanOrEqual(
      controlBounds.x + controlBounds.width
    );
    if (page.viewportSize()!.width <= 699) {
      expect(selectBounds.y).toBeGreaterThanOrEqual(
        labelBounds.y + labelBounds.height
      );
    } else {
      expect(labelBounds.y).toBeLessThan(selectBounds.y + selectBounds.height);
      expect(labelBounds.y + labelBounds.height).toBeGreaterThan(
        selectBounds.y
      );
    }
    await expect(
      serviceGroup.getByRole('option', { name: copy.allServices })
    ).toBeAttached();
    await expect(page.getByRole('link', { name: copy.next })).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`setup-services-${locale}.png`),
      animations: 'disabled',
    });
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });

  test(`first-run setup sign-in follows browser locale ${locale}`, async ({
    page,
  }) => {
    const copy = labels[locale];
    await page.addInitScript((selectedLocale) => {
      Object.defineProperty(navigator, 'languages', {
        get: () => [selectedLocale],
      });
      Object.defineProperty(navigator, 'language', {
        get: () => selectedLocale,
      });
    }, locale);
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice(7);
      if (path === '/auth/me') return route.fulfill({ status: 401, json: {} });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: false, mediaServerType: 4 },
        });
      return route.fulfill({ json: {} });
    });

    await page.goto(`${mount}/setup`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect(
      page.getByRole('heading', { name: copy.firstRun })
    ).toBeVisible();
    await expect(page.getByLabel(copy.mediaServer)).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.plexSignIn })
    ).toBeVisible();
    await page.getByLabel(copy.mediaServer).selectOption('2');
    await expect(page.getByLabel(copy.hostname)).toBeVisible();
    await expect(page.getByLabel(copy.username)).toBeVisible();
    await expect(page.getByLabel(copy.email)).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.connect })
    ).toBeVisible();
  });
}
