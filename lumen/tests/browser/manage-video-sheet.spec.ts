import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const mediaId = 42;
const databaseId = 9;
const token = 'a'.repeat(64);

async function setup(
  page: Page,
  permissions = 18,
  kind: 'movie' | 'tv' = 'movie',
  staleAvailabilityQualities: ('HD' | '4K')[] = []
) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let libraryReads = 0;
  let requestDeleted = false;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 7,
          displayName: 'Manager',
          permissions,
          userType: 2,
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          initialized: true,
          mediaServerType: 1,
          movie4kEnabled: true,
          series4kEnabled: true,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/user/7/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/request/count')
      return route.fulfill({ json: { pending: 0 } });
    if (path === `/${kind}/${mediaId}`)
      return route.fulfill({
        json: {
          id: mediaId,
          mediaType: kind,
          title: kind === 'movie' ? 'Fixture Movie' : undefined,
          name: kind === 'tv' ? 'Fixture Series' : undefined,
          releaseDate: '2020-01-01',
          firstAirDate: '2020-01-01',
          overview: 'A fixture title.',
          genres: [],
          seasons:
            kind === 'tv'
              ? [{ id: 1, seasonNumber: 1, episodeCount: 2, name: 'Season 1' }]
              : undefined,
          credits: { cast: [], crew: [] },
          mediaInfo: {
            id: databaseId,
            status: 5,
            status4k: 2,
            requests: requestDeleted
              ? []
              : [
                  {
                    id: 61,
                    status: 2,
                    is4k: false,
                    requestedBy: { displayName: 'Requester' },
                    seasons:
                      kind === 'tv' ? [{ seasonNumber: 1, status: 2 }] : [],
                  },
                ],
            downloadStatus: [
              {
                downloadId: 'hd-download',
                size: 100,
                sizeLeft: 25,
                status: 'Downloading',
                percent: 75,
              },
            ],
            serviceUrl: 'https://arr.example.test/item/1',
          },
        },
      });
    if (
      path === `/${kind}/${mediaId}/recommendations` ||
      path === `/${kind}/${mediaId}/similar`
    )
      return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
    if (path === `/media/${databaseId}/library` && request.method() === 'GET') {
      libraryReads++;
      return route.fulfill({
        json: {
          token,
          verifiedServices: 2,
          staleAvailabilityQualities,
          targets: [
            {
              key: 'radarr-hd-1',
              serviceId: 0,
              serviceType: 'radarr',
              externalId: 33,
              service: 'Radarr HD',
              quality: 'HD',
              url: 'https://radarr.example.test/movie/33',
            },
            {
              key: 'radarr-4k-1',
              serviceId: 4,
              serviceType: 'radarr',
              externalId: 44,
              service: 'Radarr 4K',
              quality: '4K',
              url: 'https://radarr4k.example.test/movie/44',
            },
          ],
        },
      });
    }
    if (
      path === `/media/${databaseId}/library` ||
      path === `/media/${databaseId}/library/clear-stale-availability`
    ) {
      calls.push({
        method: request.method(),
        path,
        ...(request.postDataJSON() ? { body: request.postDataJSON() } : {}),
      });
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/request/61/status' && request.method() === 'DELETE') {
      calls.push({ method: request.method(), path });
      requestDeleted = true;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
  });
  await page.goto(`${mount}/${kind}/${mediaId}`);
  return {
    calls,
    get libraryReads() {
      return libraryReads;
    },
    get requestDeleted() {
      return requestDeleted;
    },
  };
}

for (const kind of ['movie', 'tv'] as const) {
  test(`${kind} managers can review requests and verified library targets`, async ({
    page,
  }, info) => {
    const state = await setup(page, 18, kind, ['HD']);
    const label = kind === 'movie' ? 'Fixture Movie' : 'Fixture Series';
    const open = page.getByRole('button', { name: 'Manage', exact: true });
    await expect(open).toBeVisible();
    if (['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: info.outputPath(`${kind}-detail-before-manager.png`),
        fullPage: false,
      });
    await open.click();
    const dialog = page.getByRole('dialog', { name: `Manage ${label}` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('#61 · Approved')).toBeVisible();
    await expect(dialog.getByText('Requester')).toBeVisible();
    await expect(dialog.getByText('HD · Downloading')).toBeVisible();
    await expect(
      dialog.getByRole('link', {
        name: kind === 'tv' ? 'Open in Sonarr' : 'Open in Radarr',
      })
    ).toHaveAttribute('href', 'https://arr.example.test/item/1');
    await expect(dialog.getByText('2 verified library copies')).toBeVisible();
    await expect(dialog.getByText('Radarr HD')).toBeVisible();
    await expect(dialog.getByText('Radarr 4K')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Clear stale HD availability' })
    ).toBeVisible();
    const deleteAction = dialog.getByRole('button', {
      name: 'Delete from library',
    });
    await expect(deleteAction).toHaveCSS(
      'color',
      await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--bad)';
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })
    );
    if (['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: info.outputPath(`${kind}-manager-open.png`),
        fullPage: false,
      });
    if (['desktop', 'iphone'].includes(info.project.name)) {
      await dialog
        .getByRole('button', { name: 'Clear stale HD availability' })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${kind}-manager-library.png`),
        fullPage: false,
      });
    }
    expect(state.libraryReads).toBe(1);
    await expect(page.getByRole('dialog')).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('library removal uses the fresh plan token and lists each verified target before confirmation', async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await dialog.getByRole('button', { name: 'Delete from library' }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Delete from library?',
  });
  await expect(confirmation.getByText('Radarr HD')).toBeVisible();
  await expect(confirmation.getByText('Radarr 4K')).toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('library-removal-confirmation.png'),
      fullPage: false,
    });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeVisible();
  expect(state.calls).toEqual([]);

  await dialog.getByRole('button', { name: 'Delete from library' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete verified copies' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.calls).toEqual([
    {
      method: 'DELETE',
      path: `/media/${databaseId}/library`,
      body: { token },
    },
  ]);
});

test('stale availability recovery submits the current token and selected quality only', async ({
  page,
}) => {
  const state = await setup(page, 18, 'tv', ['HD']);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Series' });
  await dialog
    .getByRole('button', { name: 'Clear stale HD availability' })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Clear availability' })
    .click();
  await expect(dialog).toBeVisible();
  expect(state.calls).toEqual([
    {
      method: 'POST',
      path: `/media/${databaseId}/library/clear-stale-availability`,
      body: { token, quality: 'HD' },
    },
  ]);
});

test('request managers can confirm deletion of one title request', async ({
  page,
}, info) => {
  const state = await setup(page, 16);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await sheet.getByRole('button', { name: 'Delete request #61' }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Delete request?',
  });
  await expect(
    confirmation.getByText('This removes the selected request and its history')
  ).toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('request-removal-confirmation.png'),
      fullPage: false,
    });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  expect(state.calls).toEqual([]);
  await expect(sheet).toBeVisible();

  await sheet.getByRole('button', { name: 'Delete request #61' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete request', exact: true })
    .click();
  await expect(
    sheet.getByText('No requests are linked to this title.')
  ).toBeVisible();
  expect(state.calls).toEqual([
    { method: 'DELETE', path: '/request/61/status' },
  ]);
  expect(state.requestDeleted).toBe(true);
  expect(state.libraryReads).toBe(0);
});

test('request managers can open the panel without administrator library actions', async ({
  page,
}) => {
  const state = await setup(page, 16);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await expect(dialog.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Open matching requests' })
  ).toHaveAttribute('href', '/requests?mediaType=movie&search=Fixture%20Movie');
  await expect(
    dialog.getByRole('heading', { name: 'Verified library' })
  ).toHaveCount(0);
  expect(state.libraryReads).toBe(0);
});
