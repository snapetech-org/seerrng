import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const publicSettings = {
  initialized: true,
  mediaServerType: 2,
  localLogin: true,
  mediaServerLogin: true,
  jellyfinQuickConnectOnly: false,
  jellyfinHost: 'https://jellyfin.example.test',
  emailEnabled: true,
};

async function mockSignedOutLogin(
  page: Page,
  localStatus: (attempt: number) => number,
  settings = publicSettings
) {
  let localAttempts = 0;
  let requestedUserSettings = false;
  page.on('request', (request) => {
    if (/\/api\/v1\/user\/[^/]+\/settings\/main/.test(request.url()))
      requestedUserSettings = true;
  });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me') return route.fulfill({ status: 401, json: {} });
    if (path === '/settings/public') return route.fulfill({ json: settings });
    if (path === '/auth/local') {
      localAttempts += 1;
      const status = localStatus(localAttempts);
      return route.fulfill({
        status,
        json: {
          message: status === 401 ? 'INVALID_CREDENTIALS' : 'RATE_LIMITED',
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  return {
    attempts: () => localAttempts,
    requestedUserSettings: () => requestedUserSettings,
  };
}

test('French sign-in localizes the entry, form, and authentication failures', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR'],
    });
  });
  const fixture = await mockSignedOutLogin(page, (attempt) =>
    attempt === 1 ? 401 : 429
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(
    page.getByRole('heading', {
      name: 'Connectez-vous pour demander des films, séries et livres',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continuer avec Jellyfin' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Avec courriel et mot de passe',
    })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (viewportWidth) =>
          document.documentElement.scrollWidth <= viewportWidth,
        page.viewportSize()?.width ?? window.innerWidth
      )
    )
    .toBe(true);
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/login-fr-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  }

  await page
    .getByRole('button', {
      name: 'Avec courriel et mot de passe',
    })
    .click();
  await expect(page.getByLabel('Courriel')).toBeVisible();
  await expect(page.getByLabel('Mot de passe')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (viewportWidth) =>
          document.documentElement.scrollWidth <= viewportWidth,
        page.viewportSize()?.width ?? window.innerWidth
      )
    )
    .toBe(true);
  await expect(
    page.getByRole('link', { name: 'Mot de passe oublié ?' })
  ).toHaveAttribute('href', '/resetpassword');
  await page.getByLabel('Courriel').fill('viewer@example.test');
  await page.getByLabel('Mot de passe').fill('incorrect');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Ce nom d’utilisateur ou ce mot de passe est incorrect.'
  );
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Trop de tentatives de connexion. Patientez quelques minutes, puis réessayez.'
  );
  expect(fixture.attempts()).toBe(2);
  expect(fixture.requestedUserSettings()).toBe(false);
});

test('Arabic sign-in localizes Jellyfin and email modes with right-to-left layout', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['ar'],
    });
  });
  const fixture = await mockSignedOutLogin(page, () => 429);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByRole('heading', {
      name: 'سجّل الدخول لطلب الأفلام والمسلسلات والكتب',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'المتابعة باستخدام Jellyfin',
    })
  ).toBeVisible();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/login-ar-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  }

  await page
    .getByRole('button', { name: 'المتابعة باستخدام Jellyfin' })
    .click();
  await expect(page.getByLabel('اسم مستخدم Jellyfin')).toBeVisible();
  await expect(page.getByLabel('كلمة المرور')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'استخدام Quick Connect' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'استخدام البريد الإلكتروني وكلمة المرور' })
    .click();
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  await page.getByLabel('البريد الإلكتروني').fill('viewer@example.test');
  await page.getByLabel('كلمة المرور').fill('incorrect');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'محاولات تسجيل دخول كثيرة جدًا. انتظر بضع دقائق ثم حاول مجددًا.'
  );
  expect(fixture.attempts()).toBe(1);
  expect(fixture.requestedUserSettings()).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        (viewportWidth) =>
          document.documentElement.scrollWidth <= viewportWidth,
        page.viewportSize()?.width ?? window.innerWidth
      )
    )
    .toBe(true);
});

test('French sign-in translates configured identity provider actions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR'],
    });
  });
  await mockSignedOutLogin(page, () => 401, {
    ...publicSettings,
    openIdProviders: [{ slug: 'home', name: 'Home Login' }],
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Se connecter avec Home Login' })
  ).toBeVisible();
});

test('French sign-in recovery screen is localized and retries authentication', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR'],
    });
  });
  let authChecks = 0;
  let requestedUserSettings = false;
  page.on('request', (request) => {
    if (/\/api\/v1\/user\/[^/]+\/settings\/main/.test(request.url()))
      requestedUserSettings = true;
  });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me') {
      authChecks += 1;
      return route.fulfill({ status: authChecks === 1 ? 503 : 401, json: {} });
    }
    if (path === '/settings/public')
      return route.fulfill({ json: publicSettings });
    return route.fulfill({ json: {} });
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('alert')).toContainText(
    'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
  );
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Connectez-vous pour demander des films, séries et livres',
    })
  ).toBeVisible();
  expect(authChecks).toBe(2);
  expect(requestedUserSettings).toBe(false);
});
