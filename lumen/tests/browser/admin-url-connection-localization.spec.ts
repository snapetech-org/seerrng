import { expect, test } from '@playwright/test';

const locale = (
  ['en', 'fr', 'ar'].includes(process.env.LUMEN_URL_CONNECTION_LOCALE ?? '')
    ? process.env.LUMEN_URL_CONNECTION_LOCALE
    : 'en'
) as 'en' | 'fr' | 'ar';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const labels = {
  en: {
    page: (provider: string) => `${provider} Settings`,
    section: (provider: string) => `${provider} Connection`,
    serverUrl: 'Server URL',
    username: 'Username',
    password: 'Password',
    apiKey: 'API Key',
    scan: 'Enable Library Scan',
    savedCredential: 'Saved Credential',
    test: 'Test Connection',
    save: 'Save Changes',
    disconnect: 'Disconnect',
    confirm: 'Confirm Disconnect',
    keep: 'Keep Connection',
    administration: 'Administration',
    verified: (provider: string) => `${provider} connection verified.`,
    saved: (provider: string) => `${provider} settings saved.`,
    disconnected: (provider: string) => `${provider} disconnected.`,
    question: (provider: string, navidrome: boolean) =>
      navidrome
        ? `Disconnect ${provider} and stop future library scans?`
        : `Disconnect ${provider}?`,
  },
  fr: {
    page: (provider: string) => `Paramètres de ${provider}`,
    section: (provider: string) => `Connexion à ${provider}`,
    serverUrl: 'URL du serveur',
    username: 'Nom d’utilisateur',
    password: 'Mot de passe',
    apiKey: 'Clé API',
    scan: 'Activer l’analyse de la bibliothèque',
    savedCredential: 'Identifiant enregistré',
    test: 'Tester la connexion',
    save: 'Enregistrer les modifications',
    disconnect: 'Déconnecter',
    confirm: 'Confirmer la déconnexion',
    keep: 'Garder la connexion',
    administration: 'Administration',
    verified: (provider: string) => `Connexion à ${provider} vérifiée.`,
    saved: (provider: string) => `Paramètres de ${provider} enregistrés.`,
    disconnected: (provider: string) => `${provider} déconnecté.`,
    question: (provider: string, navidrome: boolean) =>
      navidrome
        ? `Déconnecter ${provider} et arrêter les prochaines analyses de la bibliothèque ?`
        : `Déconnecter ${provider} ?`,
  },
  ar: {
    page: (provider: string) => `إعدادات ${provider}`,
    section: (provider: string) => `اتصال ${provider}`,
    serverUrl: 'عنوان URL للخادم',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    apiKey: 'مفتاح API',
    scan: 'تفعيل فحص المكتبة',
    savedCredential: 'بيانات اعتماد محفوظة',
    test: 'اختبار الاتصال',
    save: 'حفظ التغييرات',
    disconnect: 'قطع الاتصال',
    confirm: 'تأكيد قطع الاتصال',
    keep: 'الإبقاء على الاتصال',
    administration: 'الإدارة',
    verified: (provider: string) => `تم التحقق من اتصال ${provider}.`,
    saved: (provider: string) => `تم حفظ إعدادات ${provider}.`,
    disconnected: (provider: string) => `تم قطع الاتصال بـ ${provider}.`,
    question: (provider: string, navidrome: boolean) =>
      navidrome
        ? `قطع الاتصال بـ ${provider} وإيقاف فحوصات المكتبة المستقبلية؟`
        : `قطع الاتصال بـ ${provider}؟`,
  },
} as const;

for (const provider of ['Navidrome', 'Jellystat'] as const) {
  test(`${provider} connection workflow follows the saved locale`, async ({
    page,
  }, info) => {
    const text = labels[locale];
    const navidrome = provider === 'Navidrome';
    const endpoint = `/api/v1/settings/${provider.toLowerCase()}`;
    const secretField = navidrome ? 'password' : 'apiKey';
    const secretLabel = navidrome ? text.password : text.apiKey;
    const writes: Record<string, unknown>[] = [];
    const tests: Record<string, unknown>[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(
        /^\/lumen(?=\/)/,
        ''
      );
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path.endsWith('/user/1/settings/main'))
        return route.fulfill({ json: { locale } });
      if (path === `${endpoint}/test`) {
        tests.push(request.postDataJSON());
        return route.fulfill({ status: 204 });
      }
      if (path !== endpoint) return route.fulfill({ json: {} });
      if (request.method() === 'GET')
        return route.fulfill({ body: 'null', contentType: 'application/json' });
      if (request.method() === 'DELETE') return route.fulfill({ status: 204 });
      const change = request.postDataJSON();
      writes.push(change);
      return route.fulfill({
        json: { ...change, [secretField]: '[REDACTED]' },
      });
    });

    await page.goto(appPath(`/admin/${provider.toLowerCase()}`));
    await expect(
      page.getByRole('heading', { name: text.page(provider) })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: text.section(provider) })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: text.administration, exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(text.serverUrl)).toBeVisible();
    await expect(page.getByLabel(secretLabel)).toHaveValue('');
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.getByLabel(text.serverUrl).fill('https://music.internal');
    if (navidrome) await page.getByLabel(text.username).fill('listener');
    await page.getByLabel(secretLabel).fill('fixture-secret');
    const testButton = page.getByRole('button', { name: text.test });
    await testButton.click();
    await expect(page.getByText(text.verified(provider))).toBeVisible();
    const saveButton = page.getByRole('button', { name: text.save });
    await saveButton.click();
    await expect(page.getByText(text.saved(provider))).toBeVisible();
    await expect(page.getByLabel(secretLabel)).toHaveAttribute(
      'placeholder',
      text.savedCredential
    );
    if (navidrome) await expect(page.getByLabel(text.scan)).toBeChecked();
    await testButton.click();
    await expect(page.getByText(text.verified(provider))).toBeVisible();
    expect(tests[1][secretField]).toBe('[REDACTED]');
    expect(writes[0]).toMatchObject({
      url: 'https://music.internal',
      ...(navidrome ? { username: 'listener', syncEnabled: true } : {}),
    });
    await page.screenshot({
      path: info.outputPath(`${provider.toLowerCase()}.png`),
      fullPage: true,
    });

    await page
      .getByRole('button', { name: text.disconnect, exact: true })
      .click();
    await expect(
      page.getByText(text.question(provider, navidrome))
    ).toBeVisible();
    await page.getByRole('button', { name: text.keep }).click();
    await expect(page.getByLabel(text.serverUrl)).toHaveValue(
      'https://music.internal'
    );
    await page
      .getByRole('button', { name: text.disconnect, exact: true })
      .click();
    await page.getByRole('button', { name: text.confirm }).click();
    await expect(page.getByText(text.disconnected(provider))).toBeVisible();
    await expect(page.getByLabel(text.serverUrl)).toHaveValue('');
  });
}
