import { expect, test, type Page } from '@playwright/test';

type MusicRequest = {
  id: number;
  status: number;
  serverId?: number;
  serviceTargets?: { serviceType?: string; serverId?: number }[];
};

async function fixture(
  page: Page,
  options: { services?: unknown[]; availableServices?: unknown[] } = {}
) {
  const writes: unknown[] = [];
  const services = options.services ?? [
    { id: 1, name: 'Fixture MP3', musicQuality: 'mp3', isDefault: true },
    { id: 2, name: 'Fixture FLAC', musicQuality: 'flac', isDefault: true },
    { id: 3, name: 'Alternate FLAC', musicQuality: 'flac' },
  ];
  let requests: MusicRequest[] = [];
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
        json: { id: 1, displayName: 'Admin', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          musicEnabled: true,
          enabledMediaCategories: { music: true },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale: 'en', enabledMediaCategories: { music: true } },
      });
    if (path === '/service/lidarr') return route.fulfill({ json: services });
    if (path === '/music/42')
      return route.fulfill({
        json: {
          id: '42',
          title: 'Fixture Album',
          artist: { id: 'fixture-artist', name: 'Fixture Artist' },
          tracks: [],
          availableServices: options.availableServices ?? [
            { serverId: 1, quality: 'MP3' },
          ],
          mediaInfo: { status: 1, requests },
        },
      });
    if (path.startsWith('/blocklist/'))
      return route.fulfill({
        status: 404,
        json: { message: 'Not blocklisted' },
      });
    if (path === '/request' && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push(body);
      const serverId = (body as { serverId: number }).serverId;
      requests = [
        {
          id: writes.length,
          status: 1,
          serverId,
          serviceTargets: [{ serviceType: 'lidarr', serverId }],
        },
      ];
      return route.fulfill({ json: { id: writes.length, status: 1 } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/music/42');
  await expect(
    page.getByRole('heading', { name: 'Fixture Album' })
  ).toBeVisible();
  return writes;
}

test('music requests select MP3 or FLAC service and preserve per-quality availability', async ({
  page,
}) => {
  const writes = await fixture(page);
  const actions = page.locator('.dacts.pc:visible, .actionbar:visible');
  const mp3 = actions.getByRole('button', { name: /^Request MP3/ });
  const flac = actions.getByRole('button', { name: /^Request FLAC/ });
  await expect(mp3).toBeDisabled();
  await expect(mp3).toHaveAttribute(
    'title',
    'The MP3 version is already available.'
  );
  await expect(flac).toBeEnabled();
  await actions.getByLabel('FLAC Destination Server').selectOption('3');
  await flac.click();
  await expect(page.getByRole('status')).toContainText('Request submitted.');
  await expect(flac).toBeDisabled();
  await expect(flac).toHaveAttribute(
    'title',
    'An open FLAC request already exists.'
  );
  expect(writes).toEqual([{ mediaType: 'music', mediaId: '42', serverId: 3 }]);
});

test('music format actions explain an unconfigured quality and keep the configured one usable', async ({
  page,
}) => {
  await fixture(page, {
    services: [
      { id: 1, name: 'Fixture MP3', musicQuality: 'mp3', isDefault: true },
    ],
    availableServices: [],
  });
  const actions = page.locator('.dacts.pc:visible, .actionbar:visible');
  const mp3 = actions.getByRole('button', { name: 'Request MP3', exact: true });
  const flac = actions.getByRole('button', { name: /Request FLAC:/ });
  await expect(mp3).toBeEnabled();
  await expect(flac).toBeDisabled();
  await expect(flac).toHaveAttribute(
    'title',
    'No FLAC music service is configured.'
  );
});
