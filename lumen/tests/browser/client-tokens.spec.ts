import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('client tokens display the secret once and revoke after confirmation', async ({
  page,
}) => {
  const token = {
    id: 7,
    name: 'Fixture Client',
    scopes: ['discover'],
    expiresAt: '2099-01-01T00:00:00Z',
  };
  let listed = false;
  let revoked = false;
  let failRevoke = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/auth/client-tokens') {
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({
          name: 'Fixture Client',
          scopes: ['discover'],
          days: 7,
        });
        listed = true;
        return route.fulfill({
          status: 201,
          json: { ...token, token: 'sngc_synthetic_fixture_only' },
        });
      }
      return route.fulfill({ json: listed ? [token] : [] });
    }
    if (path === '/auth/client-tokens/7' && request.method() === 'DELETE') {
      if (failRevoke) {
        failRevoke = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary failure' },
        });
      }
      listed = false;
      revoked = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/me/account'));
  await page.getByRole('link', { name: 'Client Tokens' }).click();
  await page.getByLabel('Token Name').fill('Fixture Client');
  await page
    .getByRole('combobox', { name: 'Access', exact: true })
    .selectOption('discover');
  await page
    .getByRole('combobox', { name: 'Expires After', exact: true })
    .selectOption('7');
  await page.getByRole('button', { name: 'Create Token' }).click();
  await expect(
    page.getByRole('textbox', { name: 'New Client Token' })
  ).toHaveValue('sngc_synthetic_fixture_only');
  await page.getByRole('button', { name: 'Dismiss Token' }).click();
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'New Client Token' })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Revoke token Fixture Client' })
    .click();
  expect(revoked).toBe(false);
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: 'Revoke Token' }).click();
  await expect(confirmation.getByRole('alert')).toContainText(
    'Could not confirm revocation'
  );
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Revoke Token' }).click();
  await expect(page.getByText('Token revoked.')).toBeVisible();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText('No client tokens yet.')).toBeVisible();
  expect(revoked).toBe(true);
});

for (const locale of ['fr', 'ar'] as const) {
  test(`client token controls and recovery follow the saved ${locale} locale`, async ({
    page,
  }) => {
    const labels =
      locale === 'fr'
        ? {
            title: 'Jetons client',
            back: 'Retour aux paramètres du compte',
            loadTitle: 'Impossible de charger les jetons client',
            loadError:
              'Le serveur a rencontré un problème. Réessayez dans un instant.',
            retry: 'Réessayer',
            description:
              'Connectez une application avec les accès Découvrir ou Demander de votre compte.',
            create: 'Créer un jeton',
            access: 'Accès',
            discoverAndRequest: 'Découvrir et demander',
            discoverOnly: 'Découvrir uniquement',
            requestOnly: 'Demander uniquement',
            expiresAfter: 'Expire après',
            dayOption: '7 jours',
            yourTokens: 'Vos jetons',
            expired: 'Expiré',
            discoverScope: 'Découvrir',
            requestScope: 'Demander',
            tokenName: 'Nom du jeton',
            copyToken: 'Copier le jeton',
            dismissToken: 'Masquer le jeton',
            secretPrefix: 'Copiez ce jeton maintenant.',
            copied: 'Jeton copié.',
            copyFailure: 'Copiez manuellement le jeton depuis le champ.',
            revokeNamed: 'Révoquer le jeton Fixture Client',
            revoke: 'Révoquer',
            revokeToken: 'Révoquer le jeton',
            revokeTitle: 'Révoquer ce jeton ?',
            revokeBody: '« Fixture Client » perdra immédiatement son accès.',
            keep: 'Conserver le jeton',
            revoked: 'Jeton révoqué.',
          }
        : {
            title: 'رموز العميل',
            back: 'العودة إلى إعدادات الحساب',
            loadTitle: 'تعذّر تحميل رموز العميل',
            loadError: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
            retry: 'إعادة المحاولة',
            description:
              'اربط تطبيقاً باستخدام صلاحية الاستكشاف أو الطلب في حسابك.',
            create: 'إنشاء رمز',
            access: 'الصلاحية',
            discoverAndRequest: 'الاستكشاف والطلب',
            discoverOnly: 'الاستكشاف فقط',
            requestOnly: 'الطلب فقط',
            expiresAfter: 'تنتهي صلاحيته بعد',
            dayOption: '7 أيام',
            yourTokens: 'رموزك',
            expired: 'منتهي الصلاحية',
            discoverScope: 'استكشاف',
            requestScope: 'طلب',
            tokenName: 'اسم الرمز',
            copyToken: 'نسخ الرمز',
            dismissToken: 'إخفاء الرمز',
            secretPrefix: 'انسخ هذا الرمز الآن.',
            copied: 'تم نسخ الرمز.',
            copyFailure: 'انسخ الرمز يدوياً من الحقل.',
            revokeNamed: 'إبطال الرمز Fixture Client',
            revoke: 'إبطال',
            revokeToken: 'إبطال الرمز',
            revokeTitle: 'إبطال هذا الرمز؟',
            revokeBody: 'سيفقد «Fixture Client» إمكانية الوصول فوراً.',
            keep: 'الاحتفاظ بالرمز',
            revoked: 'تم إبطال الرمز.',
          };
    const tokens = [
      {
        id: 7,
        name: 'Fixture Client',
        scopes: ['discover'],
        expiresAt: '2099-01-01T00:00:00Z',
      },
      {
        id: 8,
        name: 'Expired Fixture',
        scopes: ['request'],
        expiresAt: '2000-01-01T00:00:00Z',
      },
    ];
    let nextId = 9;
    let failList = true;
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            const state = window as typeof window & {
              copiedToken?: string;
              failClipboard?: boolean;
            };
            if (state.failClipboard) throw new Error('Clipboard unavailable');
            state.copiedToken = text;
          },
        },
      });
    });
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 2, permissions: 32, userType: 2 },
        });
      if (path === '/user/2/settings/main')
        return route.fulfill({ json: { locale } });
      if (
        path === '/auth/client-tokens' &&
        request.method() === 'GET' &&
        failList
      ) {
        failList = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Service Unavailable' },
        });
      }
      if (path === '/auth/client-tokens' && request.method() === 'GET')
        return route.fulfill({ json: tokens });
      if (path === '/auth/client-tokens' && request.method() === 'POST') {
        const body = request.postDataJSON();
        const token = {
          id: nextId++,
          name: body.name,
          scopes: body.scopes,
          expiresAt: '2099-01-01T00:00:00Z',
        };
        tokens.push(token);
        return route.fulfill({
          status: 201,
          json: { ...token, token: 'sngc_synthetic_locale_fixture' },
        });
      }
      if (
        path.startsWith('/auth/client-tokens/') &&
        request.method() === 'DELETE'
      ) {
        const id = Number(path.split('/').at(-1));
        const index = tokens.findIndex((token) => token.id === id);
        if (index >= 0) tokens.splice(index, 1);
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto(appPath('/me/account/client-tokens'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    if (locale === 'ar')
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByText(labels.loadTitle, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(labels.loadError, { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: labels.retry }).click();
    await expect(
      page.getByRole('heading', { name: labels.title })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: labels.back })).toBeVisible();
    await expect(
      page.getByText(labels.description, { exact: false })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: labels.create })
    ).toBeVisible();
    await expect(page.getByText(labels.access, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({
        has: page.getByRole('option', { name: labels.discoverAndRequest }),
      })
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: labels.discoverOnly })
    ).toHaveCount(1);
    await expect(
      page.getByRole('option', { name: labels.requestOnly })
    ).toHaveCount(1);
    await expect(
      page.getByText(labels.expiresAfter, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(labels.yourTokens, { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.set small').filter({ hasText: labels.expired }).first()
    ).toBeVisible();
    await expect(
      page
        .locator('.set small')
        .filter({ hasText: labels.discoverScope })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator('.set small')
        .filter({ hasText: labels.requestScope })
        .first()
    ).toBeVisible();
    if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
      await page.screenshot({
        path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/tokens-${locale}-${page.viewportSize()?.width}.png`,
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);

    await page.getByLabel(labels.tokenName).fill('Nouveau Client');
    await page.getByRole('combobox').nth(0).selectOption('discover');
    await expect(
      page.getByRole('option', { name: labels.dayOption, exact: true })
    ).toHaveCount(1);
    await page.getByRole('combobox').nth(1).selectOption('7');
    await page.getByRole('button', { name: labels.create }).click();
    await expect(
      page.getByText(labels.secretPrefix, { exact: false })
    ).toBeVisible();
    await page.getByRole('button', { name: labels.copyToken }).click();
    await expect(page.getByText(labels.copied, { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { copiedToken?: string }).copiedToken
        )
      )
      .toBe('sngc_synthetic_locale_fixture');
    await page.evaluate(() => {
      (window as typeof window & { failClipboard?: boolean }).failClipboard =
        true;
    });
    await page.getByRole('button', { name: labels.copyToken }).click();
    await expect(
      page.getByText(labels.copyFailure, { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: labels.dismissToken }).click();

    await page.getByRole('button', { name: labels.revokeNamed }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByRole('heading', { name: labels.revokeTitle })
    ).toBeVisible();
    await expect(dialog.getByText(labels.revokeBody)).toBeVisible();
    await dialog.getByRole('button', { name: labels.keep }).click();
    await page.getByRole('button', { name: labels.revokeNamed }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: labels.revokeToken })
      .click();
    await expect(page.getByText(labels.revoked, { exact: true })).toBeVisible();
    await expect(page.getByText('Fixture Client', { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByText('Expired Fixture', { exact: true })
    ).toBeVisible();
  });
}
