import { expect, test } from '@playwright/test';

const locales = {
  en: {
    page: 'Media Server Libraries',
    connection: 'Plex Connection',
    host: 'Server Hostname',
    hostPicker: 'Saved Connection Host',
    libraries: 'Plex Libraries',
    audiobooks: 'Audiobooks',
    scan: 'Full Library Scan',
    start: 'Start Full Scan',
  },
  fr: {
    page: 'Bibliothèques du serveur multimédia',
    connection: 'Connexion à Plex',
    host: 'Nom d’hôte du serveur',
    hostPicker: 'Hôte de connexion enregistré',
    libraries: 'Bibliothèques Plex',
    audiobooks: 'Livres audio',
    scan: 'Analyse complète de la bibliothèque',
    start: 'Lancer l’analyse complète',
  },
  ar: {
    page: 'مكتبات خادم الوسائط',
    connection: 'اتصال Plex',
    host: 'اسم مضيف الخادم',
    hostPicker: 'مضيف اتصال محفوظ',
    libraries: 'مكتبات Plex',
    audiobooks: 'الكتب الصوتية',
    scan: 'فحص المكتبة بالكامل',
    start: 'بدء الفحص الكامل',
  },
} as const;

for (const [locale, copy] of Object.entries(locales)) {
  test(`Media Server Libraries follows the saved ${locale} locale`, async ({
    page,
  }, info) => {
    const writes: Record<string, unknown>[] = [];
    let running = false;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname.replace(
        /^\/lumen(?=\/)/,
        ''
      );
      if (endpoint.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (endpoint.endsWith('/user/1/settings/main'))
        return route.fulfill({ json: { locale } });
      if (endpoint.endsWith('/settings/public'))
        return route.fulfill({ json: { mediaServerType: 1 } });
      if (endpoint.endsWith('/settings/connection-hosts'))
        return route.fulfill({
          json: [{ name: 'Saved Media Host', hostname: 'saved.example' }],
        });
      if (endpoint === '/api/v1/settings/plex')
        return route.fulfill({
          json: {
            ip: 'plex.local',
            port: 32400,
            apiKey: '[REDACTED]',
            libraries: [
              { id: 'tv', name: 'Shows', type: 'show', enabled: true },
              {
                id: 'audiobooks',
                name: 'Audiobook Library',
                type: 'book',
                enabled: true,
              },
            ],
          },
        });
      if (endpoint === '/api/v1/settings/tautulli')
        return route.fulfill({
          json: { hostname: 'tautulli.local', port: 8181 },
        });
      if (endpoint === '/api/v1/settings/plex/sync') {
        if (request.method() !== 'GET') {
          const body = request.postDataJSON();
          writes.push(body);
          running = body.start === true;
        }
        return route.fulfill({ json: { running, progress: 1, total: 10 } });
      }
      if (request.method() !== 'GET') writes.push(request.postDataJSON());
      return route.fulfill({ json: {} });
    });

    await page.goto('admin/media-libraries');
    await expect(page.getByRole('heading', { name: copy.page })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.connection })
    ).toBeVisible();
    await expect(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: copy.connection }) })
        .getByLabel(copy.host)
    ).toHaveValue('plex.local');
    await page
      .getByRole('combobox', { name: copy.hostPicker, exact: true })
      .first()
      .selectOption('saved.example');
    await expect(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: copy.connection }) })
        .getByLabel(copy.host)
    ).toHaveValue('saved.example');
    await expect(
      page.getByRole('heading', { name: copy.libraries })
    ).toBeVisible();
    if (process.env.LUMEN_CAPTURE_MEDIA_LIBRARIES)
      await page.screenshot({
        path: info.outputPath('media-libraries.png'),
        fullPage: true,
      });
    await expect(
      page
        .locator('.cfg-row')
        .filter({ hasText: 'Audiobook Library' })
        .locator('small')
    ).toHaveText(copy.audiobooks);
    await expect(page.getByRole('heading', { name: copy.scan })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.start })).toBeEnabled();
    await page.getByRole('button', { name: copy.start }).click();
    await expect(page.getByRole('button', { name: copy.start })).toBeDisabled();
    expect(writes).toEqual([{ start: true }]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}
