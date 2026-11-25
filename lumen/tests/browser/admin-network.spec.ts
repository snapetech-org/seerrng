import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function fixtures(
  page: Page,
  permissions = 2,
  overrides: string[] = [],
  locale = 'en',
  failFirstWrite = true
) {
  const patches: unknown[] = [];
  let persistWrites = true;
  let failed = !failFirstWrite;
  const settings = {
    apiRequestTimeout: 10000,
    dnsCache: { enabled: true, forceMinTtl: 0, forceMaxTtl: -1 },
    proxy: {
      enabled: true,
      hostname: 'proxy.local',
      port: 8080,
      password: '[REDACTED]',
    },
    tls: {
      mode: 'disabled',
      httpsPort: 5056,
      allowHttpAuth: true,
      httpAuthAcknowledged: true,
    },
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, permissions, displayName: 'User' },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/status/tls')
      return route.fulfill({ json: { environmentOverrides: overrides } });
    if (path !== '/settings/network') return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: settings });
    const patch = request.postDataJSON();
    patches.push(patch);
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 400,
        json: { message: 'Check the network settings.' },
      });
    }
    const result = {
      ...settings,
      ...patch,
      dnsCache: { ...settings.dnsCache, ...patch.dnsCache },
      tls: { ...settings.tls, ...patch.tls },
    };
    if (persistWrites) Object.assign(settings, result);
    return route.fulfill({ json: result });
  });
  return {
    patches,
    setPersistWrites: (persist: boolean) => {
      persistWrites = persist;
    },
  };
}

test('network settings send only edited values and recover from a rejected save', async ({
  page,
}, info) => {
  const { patches } = await fixtures(page);
  await page.goto(appPath('/me'));
  await page.getByRole('link', { name: 'Open Network Settings' }).click();
  await expect(
    page.getByRole('heading', { name: 'Network Settings' })
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Proxy Password' })
  ).toHaveValue('');
  await page.getByLabel('API Request Timeout').fill('3.125');
  await page.getByLabel('DNS Cache Minimum TTL').fill('60');
  await page.getByLabel('Built-in HTTPS mode').selectOption('self-signed');
  await expect(
    page.getByLabel('Allow authenticated browser sessions over HTTP')
  ).toHaveCount(0);

  const save = page.getByRole('button', { name: 'Save Network Settings' });
  await save.click();
  await expect(page.getByText('Check the network settings.')).toBeVisible();
  await expect(page.getByLabel('DNS Cache Minimum TTL')).toHaveValue('60');
  await page.screenshot({
    path: info.outputPath('network-settings-rejected-save.png'),
    fullPage: true,
  });
  await save.click();
  await expect(page.getByText(/Network settings saved/)).toBeVisible();
  await page.screenshot({
    path: info.outputPath('network-settings-retried-save.png'),
    fullPage: true,
  });
  await expect(save).toBeDisabled();
  expect(patches).toEqual(
    Array.from({ length: 2 }, () => ({
      apiRequestTimeout: 3125,
      dnsCache: { forceMinTtl: 60 },
      tls: {
        mode: 'self-signed',
        allowHttpAuth: false,
        httpAuthAcknowledged: false,
      },
    }))
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('network settings keep drafts when a save response fails persisted readback', async ({
  page,
}, info) => {
  const fixture = await fixtures(page, 2, [], 'en', false);
  fixture.setPersistWrites(false);
  await page.goto(appPath('/admin/network'));
  await page.getByLabel('API Request Timeout').fill('3.125');
  await page.getByLabel('DNS Cache Minimum TTL').fill('60');
  await page.getByLabel('Built-in HTTPS mode').selectOption('self-signed');
  const save = page.getByRole('button', { name: 'Save Network Settings' });
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not confirm the saved network settings.'
  );
  await expect(page.getByLabel('DNS Cache Minimum TTL')).toHaveValue('60');
  await expect(save).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('network-settings-readback-failure.png'),
    fullPage: true,
  });
  fixture.setPersistWrites(true);
  await save.click();
  await expect(page.getByText(/Network settings saved/)).toBeVisible();
  await page.screenshot({
    path: info.outputPath('network-settings-readback-recovered.png'),
    fullPage: true,
  });
  await expect(page.getByLabel('DNS Cache Minimum TTL')).toHaveValue('60');
  await expect(save).toBeDisabled();
  expect(fixture.patches).toEqual([
    {
      apiRequestTimeout: 3125,
      dnsCache: { forceMinTtl: 60 },
      tls: {
        mode: 'self-signed',
        allowHttpAuth: false,
        httpAuthAcknowledged: false,
      },
    },
    {
      apiRequestTimeout: 3125,
      dnsCache: { forceMinTtl: 60 },
      tls: {
        mode: 'self-signed',
        allowHttpAuth: false,
        httpAuthAcknowledged: false,
      },
    },
  ]);
});

test('administration search opens the saved proxy password control safely', async ({
  page,
}, info) => {
  await fixtures(page);
  await page.goto(appPath('/admin'));
  await page
    .getByRole('searchbox', { name: 'Search Settings' })
    .fill('proxy password');
  const link = page.getByRole('link', {
    name: 'Open Proxy Password',
    exact: true,
  });
  await expect(link).toHaveAttribute(
    'href',
    `${mount}/admin/network#proxy.password`
  );
  await link.click();
  await expect(page).toHaveURL(
    new RegExp(`${mount}/admin/network#proxy\\.password$`)
  );
  const password = page.getByRole('textbox', { name: 'Proxy Password' });
  await expect(password).toBeInViewport();
  await expect(password).toHaveValue('');
  await expect(
    page.getByText('Leave blank to keep the saved password.')
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('proxy-password-shortcut.png'),
    fullPage: true,
  });
});

test('transport environment overrides prevent Lumen edits', async ({
  page,
}) => {
  await fixtures(page, 2, ['TLS_MODE']);
  await page.goto(appPath('/admin/network'));
  await expect(
    page.getByText(
      /Transport settings are overridden by environment variables: TLS_MODE/
    )
  ).toBeVisible();
  await expect(page.getByLabel('Built-in HTTPS mode')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'DNS Cache' })).toBeEnabled();
});

test('non-administrators cannot open network settings', async ({ page }) => {
  await fixtures(page, 0);
  await page.goto(appPath('/admin/network'));
  await expect(page).toHaveURL(new RegExp(`${mount}/me$`));
  await expect(
    page.getByRole('link', { name: 'Open Network Settings' })
  ).toHaveCount(0);
});

for (const { locale, certificateFile, guidance } of [
  {
    locale: 'en',
    certificateFile: 'Certificate file',
    guidance:
      'Use paths visible inside the SeerrNG process. Mount certificate files into the container; private keys are never uploaded through this form.',
  },
  {
    locale: 'fr',
    certificateFile: 'Fichier de certificat',
    guidance:
      "Utilisez les chemins visibles à l'intérieur du processus SeerrNG. Monter les fichiers de certificat dans le conteneur; les clés privées ne sont jamais téléchargées via ce formulaire.",
  },
  {
    locale: 'ar',
    certificateFile: 'ملف الشهادة',
    guidance:
      'استخدام الطرق المرئية داخل SeerrNG عملية ملفات شهادات المتحركة في الحاوية؛ والمفاتيح الخاصة لا يتم تحميلها من خلال هذا الشكل.',
  },
]) {
  test(`provided certificate settings render the ${locale} safety guidance`, async ({
    page,
  }, info) => {
    await fixtures(page, 2, [], locale);
    await page.goto(appPath('/admin/network'));
    const safetyGuidance = page.getByText(guidance, { exact: true });
    await expect(safetyGuidance).toHaveCount(0);
    await page.getByRole('combobox').selectOption('provided');
    await expect(page.getByLabel(certificateFile)).toBeVisible();
    await expect(safetyGuidance).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`provided-certificate-paths-${locale}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.getByRole('combobox').selectOption('self-signed');
    await expect(safetyGuidance).toHaveCount(0);
  });
}
