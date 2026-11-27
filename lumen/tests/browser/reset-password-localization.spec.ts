import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

test('French recovery request keeps errors translated and response private', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR'],
    });
  });
  let requestedUserSettings = false;
  page.on('request', (request) => {
    if (/\/api\/v1\/user\/[^/]+\/settings\/main/.test(request.url()))
      requestedUserSettings = true;
  });
  await page.route('**/api/v1/**', (route) => route.fulfill({ json: {} }));
  let attempts = 0;
  await page.route('**/api/v1/auth/reset-password', (route) => {
    attempts += 1;
    return route.fulfill({
      status: attempts === 1 ? 429 : attempts === 2 ? 503 : 200,
      json: { status: 'ok' },
    });
  });

  await page.goto(testAppPath('/resetpassword'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', { name: 'Réinitialiser Votre Mot de Passe' })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/reset-request-fr-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  }

  await page.getByLabel('Courriel').fill('person@example.test');
  await page
    .getByRole('button', { name: 'Envoyer le Lien de Récupération' })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Trop de tentatives. Patientez un instant, puis réessayez.'
  );
  await page
    .getByRole('button', { name: 'Envoyer le Lien de Récupération' })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Le courriel de récupération du mot de passe est indisponible. Contactez votre administrateur.'
  );
  await page
    .getByRole('button', { name: 'Envoyer le Lien de Récupération' })
    .click();
  await expect(page.locator('.login-card > p[role="status"]')).toHaveText(
    'Si cette adresse est associée à un compte, vous recevrez un lien de réinitialisation du mot de passe.'
  );
  expect(attempts).toBe(3);
  expect(requestedUserSettings).toBe(false);
});

test('Arabic password reset validates confirmation locally and resets successfully', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['ar'],
    });
  });
  let requestedUserSettings = false;
  page.on('request', (request) => {
    if (/\/api\/v1\/user\/[^/]+\/settings\/main/.test(request.url()))
      requestedUserSettings = true;
  });
  await page.route('**/api/v1/**', (route) => route.fulfill({ json: {} }));
  let resetRequests = 0;
  await page.route('**/api/v1/auth/reset-password/synthetic-guid', (route) => {
    resetRequests += 1;
    return route.fulfill({ json: { status: 'ok' } });
  });

  await page.goto(testAppPath('/resetpassword/synthetic-guid'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('كلمة مرور جديدة')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/reset-confirm-ar-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  }

  await page.getByLabel('كلمة مرور جديدة').fill('first-secret');
  await page.getByLabel('تأكيد كلمة المرور').fill('different-secret');
  await page.getByRole('button', { name: 'إعادة تعيين كلمة المرور' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'يجب أن تتطابق كلمتا المرور.'
  );
  expect(resetRequests).toBe(0);

  await page.getByLabel('تأكيد كلمة المرور').fill('first-secret');
  await page.getByRole('button', { name: 'إعادة تعيين كلمة المرور' }).click();
  await expect(page.locator('.login-card > p[role="status"]')).toHaveText(
    'تمت إعادة تعيين كلمة المرور.'
  );
  expect(resetRequests).toBe(1);
  expect(requestedUserSettings).toBe(false);
});
