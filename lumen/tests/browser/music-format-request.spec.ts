import { expect, test, type Page } from '@playwright/test';

type MusicRequest = {
  id: number;
  status: number;
  serverId?: number;
  serviceTargets?: { serviceType?: string; serverId?: number }[];
};

async function fixture(
  page: Page,
  options: {
    services?: unknown[];
    availableServices?: unknown[];
    followWrites?: unknown[];
    permissions?: number;
    quota?: unknown;
    quotaByUser?: Record<number, unknown>;
    users?: unknown[];
    locale?: string;
  } = {},
  route = '/music/42'
) {
  const writes: unknown[] = [];
  const services = options.services ?? [
    {
      id: 1,
      name: 'Fixture MP3',
      musicQuality: 'mp3',
      is4k: false,
      isDefault: true,
    },
    {
      id: 2,
      name: 'Fixture FLAC',
      musicQuality: 'flac',
      is4k: false,
      isDefault: true,
    },
    { id: 3, name: 'Alternate FLAC', musicQuality: 'flac', is4k: false },
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
        json: {
          id: 1,
          displayName: 'Admin',
          permissions: options.permissions ?? 2,
        },
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
        json: {
          locale: options.locale ?? 'en',
          enabledMediaCategories: { music: true },
        },
      });
    if (path === '/user/1/quota')
      return route.fulfill({
        json: options.quotaByUser?.[1] ??
          options.quota ?? { music: { limit: 5, remaining: 4 } },
      });
    if (path.startsWith('/user/2/quota'))
      return route.fulfill({
        json: options.quotaByUser?.[2] ?? { music: { limit: 5, remaining: 4 } },
      });
    if (path === '/user')
      return route.fulfill({ json: { results: options.users ?? [] } });
    if (path === '/service/lidarr') return route.fulfill({ json: services });
    if (path.startsWith('/service/lidarr/')) {
      const id = Number(path.split('/').pop());
      return route.fulfill({
        json: {
          profiles: [{ id: 10, name: 'Lossless' }],
          metadataProfiles: [{ id: 20, name: 'Standard Metadata' }],
          rootFolders: [{ id: 30, path: `/music/${id}` }],
          tags: [{ id: 40, label: 'Requested' }],
          server: {
            activeProfileId: 10,
            activeMetadataProfileId: 20,
            activeDirectory: `/music/${id}`,
            activeTags: [],
          },
        },
      });
    }
    if (path === '/music/42')
      return route.fulfill({
        json: {
          id: '42',
          title: 'Fixture Album',
          artist: { id: 'fixture-artist', name: 'Fixture Artist' },
          tracks: [
            { position: 1, name: 'Opening Track', length: 182000 },
            { position: 2, name: 'Closing Track', length: 201000 },
          ],
          availableServices: options.availableServices ?? [
            { serverId: 1, quality: 'MP3' },
          ],
          mediaInfo: { status: 1, requests },
        },
      });
    if (path === '/artist/fixture-artist')
      return route.fulfill({
        json: {
          artist: { name: 'Fixture Artist' },
          releaseGroups: [],
        },
      });
    if (path === '/follow' && request.method() === 'GET')
      return route.fulfill({ json: { results: [] } });
    if (path === '/follow' && request.method() === 'POST') {
      options.followWrites?.push(request.postDataJSON());
      return route.fulfill({ json: { id: 99, kind: 'artist-release-type' } });
    }
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
  await page.goto(route);
  await expect(
    page.getByRole('heading', {
      name: route.startsWith('/artist/') ? 'Fixture Artist' : 'Fixture Album',
    })
  ).toBeVisible();
  return writes;
}

test('music details link to the request discography workflow with exact identity', async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByRole('link', { name: 'Request Discography' })
  ).toHaveAttribute(
    'href',
    '/collections/music/fixture-artist?view=discography&albumId=42'
  );

  await fixture(page, {}, '/artist/fixture-artist');
  await expect(
    page.getByRole('link', { name: 'Request Discography' })
  ).toHaveAttribute(
    'href',
    '/collections/music/fixture-artist?view=discography'
  );
});

test('artist details follow new album releases with native rule identity', async ({
  page,
}) => {
  const followWrites: unknown[] = [];
  await fixture(page, { followWrites }, '/artist/fixture-artist');
  await page.getByRole('button', { name: 'Follow New Albums' }).click();
  await expect(page.getByRole('button', { name: 'Following' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(followWrites).toEqual([
    {
      kind: 'artist-release-type',
      subjectKey: 'mb-artist:fixture-artist',
      subjectLabel: 'Fixture Artist',
      conditions: {
        includeTypes: ['Album'],
        excludeTypes: ['Single', 'Compilation', 'Live', 'reissue'],
        ref: { mbid: 'fixture-artist' },
      },
    },
  ]);
});

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
  const sheet = page.getByRole('alertdialog', { name: 'Request Music' });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('heading', { name: 'Fixture Album' })
  ).toBeVisible();
  await expect(sheet.getByText('Opening Track')).toBeVisible();
  await expect(sheet.getByText('Closing Track')).toBeVisible();
  await expect(sheet.locator('.facts dd').nth(3)).toHaveText('2');
  await sheet.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished)
    );
  });
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  const visibleHeight = await page.evaluate(() => window.innerHeight);
  expect(box!.y + box!.height).toBeLessThanOrEqual(visibleHeight);
  expect(
    await sheet.locator('.facts').evaluate((element) => {
      return element.scrollWidth - element.clientWidth;
    })
  ).toBeLessThanOrEqual(1);
  await expect(sheet.getByLabel('Server')).toHaveValue('3');
  await expect(sheet.getByLabel('Quality')).toHaveValue('10');
  await expect(sheet.getByLabel('Metadata Profile')).toHaveValue('20');
  await expect(sheet.getByLabel('Folder')).toHaveValue('/music/3');
  await expect(sheet.locator('.facts')).toContainText('Alternate FLAC');
  await expect(sheet.locator('.facts')).toContainText('Ready to Request');
  await expect(
    sheet.getByText('4 of 5 Music requests remaining.')
  ).toBeVisible();
  await sheet.getByLabel('Request Tags').getByText('Requested').click();
  await sheet.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Request submitted.');
  await expect(flac).toBeDisabled();
  await expect(flac).toHaveAttribute(
    'title',
    'An open FLAC request already exists.'
  );
  expect(writes).toEqual([
    {
      mediaType: 'music',
      mediaId: '42',
      serverId: 3,
      profileId: 10,
      metadataProfileId: 20,
      rootFolder: '/music/3',
      tags: [40],
      requesterSelectedOptions: {
        tags: true,
        profile: true,
        metadataProfile: true,
        rootFolder: true,
      },
    },
  ]);
});

test('music format actions explain an unconfigured quality and keep the configured one usable', async ({
  page,
}) => {
  await fixture(page, {
    services: [
      {
        id: 1,
        name: 'Fixture MP3',
        musicQuality: 'mp3',
        is4k: false,
        isDefault: true,
      },
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

test('music quota denial keeps the request sheet open and prevents submission', async ({
  page,
}) => {
  const writes = await fixture(page, {
    permissions: 32,
    quota: { music: { limit: 2, remaining: 0, restricted: true } },
  });
  const actions = page.locator('.dacts.pc:visible, .actionbar:visible');
  await actions.getByRole('button', { name: /^Request FLAC/ }).click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Music' });
  await expect(sheet.getByText('Music request quota reached.')).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Request', exact: true })
  ).toBeDisabled();
  await expect(sheet.getByText('Advanced Request Options')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('music request destination changes recheck format availability', async ({
  page,
}) => {
  const writes = await fixture(page, {
    availableServices: [
      { serverId: 1, quality: 'MP3' },
      { serverId: 3, quality: 'FLAC' },
    ],
  });
  const actions = page.locator('.dacts.pc:visible, .actionbar:visible');
  await actions
    .locator('.music-format-choice')
    .nth(1)
    .locator('button')
    .click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Music' });
  await sheet.getByLabel('Server').selectOption('3');
  await expect(
    sheet.getByText('The FLAC version is already available.')
  ).toBeVisible();
  await expect(sheet.locator('.pk-foot .btn-primary')).toBeDisabled();
  expect(writes).toEqual([]);
});

test('music request quota follows the selected requester', async ({ page }) => {
  const writes = await fixture(page, {
    permissions: 2,
    users: [{ id: 2, displayName: 'Other User', permissions: 32 }],
    quotaByUser: {
      1: { music: { limit: 5, remaining: 4 } },
      2: { music: { limit: 2, remaining: 0, restricted: true } },
    },
  });
  const actions = page.locator('.dacts.pc:visible, .actionbar:visible');
  await actions
    .locator('.music-format-choice')
    .nth(1)
    .locator('button')
    .click();
  const sheet = page.getByRole('alertdialog');
  await sheet.getByLabel('Request as').selectOption('2');
  await expect(sheet.getByText('Music request quota reached.')).toBeVisible();
  await expect(sheet.locator('.pk-foot .btn-primary')).toBeDisabled();
  expect(writes).toEqual([]);
});

for (const [locale, quotaText, metadataLabel] of [
  [
    'fr',
    'Le quota de demandes de musique est atteint.',
    'Profil de métadonnées',
  ],
  ['ar', 'تم بلوغ حد طلبات الموسيقى.', 'ملف البيانات الوصفية'],
] as const) {
  test(`music request sheet follows ${locale} locale`, async ({ page }) => {
    await fixture(page, {
      locale,
      permissions: 2,
      quota: { music: { limit: 2, remaining: 0, restricted: true } },
    });
    const actions = page.locator('.dacts.pc:visible, .actionbar:visible');
    await actions
      .locator('.music-format-choice')
      .nth(1)
      .locator('button')
      .click();
    const sheet = page.getByRole('alertdialog');
    await expect(sheet).toContainText(metadataLabel);
    await expect(sheet).toContainText(quotaText);
    await expect(sheet.locator('.pk-foot .btn-primary')).toBeDisabled();
  });
}
