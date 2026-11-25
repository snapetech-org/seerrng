import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const mediaId = 42;
const databaseId = 9;
const token = 'a'.repeat(64);
const liveToken = `ld1_${'b'.repeat(32)}`;

async function setup(
  page: Page,
  permissions = 18,
  kind: 'movie' | 'tv' = 'movie',
  staleAvailabilityQualities: ('HD' | '4K')[] = [],
  mediaServerType = 1,
  includeDeclinedRequest = false,
  includeLiveDownloadToken = false,
  locale = 'en'
) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let libraryReads = 0;
  let watchReads = 0;
  let jellystatReads = 0;
  let requestDeleted = false;
  let failIssueDelete = false;
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
          mediaServerType,
          movie4kEnabled: true,
          series4kEnabled: true,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/user/7/settings/main')
      return route.fulfill({ json: { locale } });
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
                  ...(includeDeclinedRequest
                    ? [
                        {
                          id: 62,
                          status: 3,
                          is4k: false,
                          requestedBy: { displayName: 'Declined requester' },
                          seasons: [],
                        },
                      ]
                    : []),
                ],
            issues: [
              {
                id: 71,
                status: 1,
                issueType: 1,
                comments: [
                  { message: 'Playback stops after the opening scene.' },
                ],
              },
              { id: 72, status: 2, issueType: 1 },
            ],
            downloadStatus: [
              {
                downloadId: 'hd-download',
                size: 100,
                sizeLeft: 25,
                status: 'Downloading',
                percent: 75,
                downloadClient: 'qBittorrent',
                estimatedCompletionTime: '2026-11-25T18:30:00.000Z',
                ...(includeLiveDownloadToken
                  ? { liveDownloadToken: liveToken }
                  : {}),
              },
            ],
            serviceUrl: 'https://arr.example.test/item/1',
            tautulliUrl:
              mediaServerType === 1
                ? 'https://tautulli.example.test/info?rating_key=17'
                : undefined,
            tautulliUrl4k:
              mediaServerType === 1
                ? 'https://user:secret@tautulli.example.test/info'
                : undefined,
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
    if (path === `/media/${databaseId}/watch_data`) {
      watchReads++;
      return route.fulfill({
        json: {
          data: {
            users: [{ id: 8, displayName: 'Plex Viewer' }],
            playCount: 14,
            playCount7Days: 4,
            playCount30Days: 9,
          },
          data4k: {
            users: [],
            playCount: 3,
            playCount7Days: 1,
            playCount30Days: 2,
          },
        },
      });
    }
    if (path === `/media/${databaseId}/jellystat`) {
      jellystatReads++;
      return route.fulfill({
        json: { plays: 12, playbackSeconds: 5400 },
      });
    }
    if (path === '/blocklist/42') return route.fulfill({ status: 404 });
    if (path === '/blocklist' && request.method() === 'POST') {
      calls.push({
        method: request.method(),
        path,
        body: request.postDataJSON(),
      });
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/issue/71/resolved' && request.method() === 'POST') {
      calls.push({ method: request.method(), path });
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/issue/71' && request.method() === 'DELETE') {
      calls.push({ method: request.method(), path });
      if (failIssueDelete) return route.fulfill({ status: 500 });
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/issue/72' && request.method() === 'DELETE') {
      calls.push({ method: request.method(), path });
      if (failIssueDelete) return route.fulfill({ status: 500 });
      return route.fulfill({ status: 204, body: '' });
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
    get watchReads() {
      return watchReads;
    },
    get jellystatReads() {
      return jellystatReads;
    },
    set failIssueDelete(value: boolean) {
      failIssueDelete = value;
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
      dialog.getByRole('heading', { name: 'Playback history' })
    ).toBeVisible();
    if (['desktop', 'iphone'].includes(info.project.name)) {
      await dialog
        .getByRole('heading', { name: 'Playback history' })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${kind}-manager-playback-links.png`),
        fullPage: false,
      });
    }
    await expect(dialog.getByText('Past 7 days · 4 plays')).toBeVisible();
    await expect(dialog.getByText('Past 30 days · 9 plays')).toBeVisible();
    await expect(dialog.getByText('All time · 14 plays')).toBeVisible();
    await expect(dialog.getByText('Plex Viewer')).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'Open in Tautulli · HD' })
    ).toHaveAttribute(
      'href',
      'https://tautulli.example.test/info?rating_key=17'
    );
    await expect(
      dialog.getByRole('link', { name: 'Open in Tautulli · 4K' })
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('link', { name: 'Plex Viewer' })
    ).toHaveAttribute('href', '/users/8');
    await expect(dialog.getByText('Jellystat watch activity')).toBeVisible();
    await expect(
      dialog.getByText('12 plays · 1.5 hours of playback')
    ).toBeVisible();
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
    expect(state.watchReads).toBe(1);
    expect(state.jellystatReads).toBe(1);
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
  expect(state.watchReads).toBe(0);
  expect(state.jellystatReads).toBe(0);
});

test('management requests omit declined request history like native SeerrNG', async ({
  page,
}, info) => {
  await setup(page, 16, 'movie', [], 1, true);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await expect(sheet.getByText('#61 · Approved')).toBeVisible();
  await expect(sheet.getByText('#62 · Declined')).toHaveCount(0);
  await expect(
    sheet.getByRole('button', { name: 'Delete request #62' })
  ).toHaveCount(0);
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('declined-request-filter.png'),
      fullPage: false,
    });
});

test('Jellyfin administrators see Jellystat without requesting Plex history', async ({
  page,
}) => {
  const state = await setup(page, 18, 'movie', [], 2);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await expect(dialog.getByText('Jellystat watch activity')).toBeVisible();
  await expect(
    dialog.getByText('12 plays · 1.5 hours of playback')
  ).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Playback history' })
  ).toHaveCount(0);
  expect(state.watchReads).toBe(0);
  expect(state.jellystatReads).toBe(1);
});

test('request managers can open the panel without administrator library actions', async ({
  page,
}, info) => {
  const state = await setup(page, 16);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await expect(dialog.getByRole('heading', { name: 'Requests' })).toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('request-manager-service-links.png'),
      fullPage: false,
    });
  await expect(
    dialog.getByRole('link', { name: 'Open in Radarr' })
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('link', { name: 'Open matching requests' })
  ).toHaveAttribute('href', '/requests?mediaType=movie&search=Fixture%20Movie');
  await expect(dialog.getByText('Client: qBittorrent')).toBeVisible();
  await expect(dialog.locator('time')).toContainText('2026');
  await expect(
    dialog.getByRole('heading', { name: 'Verified library' })
  ).toHaveCount(0);
  expect(state.libraryReads).toBe(0);
});

test('manager downloads show safe live progress and client details', async ({
  page,
}, info) => {
  await page.addInitScript((id) => {
    class FixtureEventSource {
      static latest?: FixtureEventSource;
      url: string;
      listeners = new Map<string, (event: MessageEvent<string>) => void>();
      readyState = 1;

      constructor(url: string) {
        this.url = url;
        FixtureEventSource.latest = this;
        window.setTimeout(() => {
          this.listeners.get('downloads')?.({
            data: JSON.stringify([
              {
                id,
                state: 'downloading',
                size: 100,
                sizeLeft: 25,
                progress: 75,
                downloadRate: 1024,
                uploadRate: 0,
                etaSeconds: 120,
                seeds: 3,
                peers: 5,
                observedAt: new Date().toISOString(),
                clientName: 'qBittorrent Live',
              },
            ]),
          } as MessageEvent<string>);
        }, 0);
      }

      addEventListener(
        type: string,
        listener: (event: MessageEvent<string>) => void
      ) {
        this.listeners.set(type, listener);
      }

      close() {
        this.readyState = 2;
      }
    }

    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: FixtureEventSource,
    });
  }, liveToken);
  const locale = process.env.LUMEN_MANAGER_LOCALE ?? 'en';
  await setup(page, 16, 'movie', [], 1, false, true, locale);
  const manageLabel =
    locale === 'fr' ? 'Gérer' : locale === 'ar' ? 'إدارة' : 'Manage';
  const dialogTitle = `${manageLabel} Fixture Movie`;
  await page.getByRole('button', { name: manageLabel, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: dialogTitle });
  if (
    process.env.LUMEN_CAPTURE_BASELINE &&
    ['desktop', 'iphone'].includes(info.project.name)
  ) {
    await dialog
      .getByRole('heading', { name: 'Downloads' })
      .scrollIntoViewIfNeeded();
    await dialog.screenshot({
      path: info.outputPath('manager-downloads-baseline.png'),
    });
    return;
  }
  await expect(
    dialog.getByText(/HD · Downloading|HD · Téléchargement/)
  ).toBeVisible();
  await expect(dialog.getByText('75%', { exact: false })).toBeVisible();
  const clientLabel =
    locale === 'fr'
      ? 'Client : qBittorrent Live'
      : locale === 'ar'
        ? 'العميل: qBittorrent Live'
        : 'Client: qBittorrent Live';
  const seedsLabel =
    locale === 'fr'
      ? 'Nombre de graines : 3'
      : locale === 'ar'
        ? 'عدد البذور: 3'
        : 'Seeds: 3';
  await expect(dialog.getByText(clientLabel)).toBeVisible();
  await expect(dialog.getByText(seedsLabel)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(
    Date.parse((await dialog.locator('time').getAttribute('dateTime')) ?? '')
  ).not.toBeNaN();
  if (['desktop', 'iphone'].includes(info.project.name))
    await dialog.screenshot({
      path: info.outputPath('manager-downloads-candidate.png'),
    });
  const source = await page.evaluate(() => {
    const Constructor = window.EventSource as unknown as {
      latest?: { url: string };
    };
    return Constructor.latest?.url;
  });
  expect(source).toContain(encodeURIComponent(liveToken));
  expect(source).not.toContain('hd-download');
});

test('title manager exposes permission-scoped blocklist and issue actions', async ({
  page,
}, info) => {
  const permissions = 2 | 1048576 | 7340032 | 268435456;
  const state = await setup(page, permissions);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  await expect(
    dialog.getByRole('link', { name: 'Issue #71 · Open' })
  ).toHaveAttribute('href', '/issues/71');
  await expect(
    dialog.getByRole('link', { name: 'Issue #72 · Resolved' })
  ).toHaveAttribute('href', '/issues/72');
  const issueDetails = dialog
    .locator('details.adv')
    .filter({ hasText: 'Playback stops after the opening scene.' });
  await expect(issueDetails).toBeVisible();
  await expect(
    issueDetails.getByText('Playback stops after the opening scene.')
  ).not.toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name))
    await dialog.screenshot({
      path: info.outputPath('manager-issue-description-collapsed.png'),
    });
  await issueDetails.locator('summary').click();
  await expect(
    issueDetails.getByText('Playback stops after the opening scene.')
  ).toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name))
    await dialog.screenshot({
      path: info.outputPath('manager-issue-description-expanded.png'),
    });
  if (['desktop', 'iphone'].includes(info.project.name)) {
    await dialog
      .getByRole('heading', { name: 'Issues · 2' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('movie-manager-issues.png'),
      fullPage: false,
    });
  }
  await dialog.getByRole('button', { name: 'Close open issues' }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Close open issues?',
  });
  await confirmation.getByRole('button', { name: 'Close open issues' }).click();
  await expect
    .poll(() => state.calls.some((call) => call.path === '/issue/71/resolved'))
    .toBe(true);
  await expect(page.getByRole('status')).toContainText(
    'Open issues marked as resolved.'
  );
  await dialog.getByRole('button', { name: 'Delete all issues' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete all issues?' })
    .getByRole('button', { name: 'Delete all issues' })
    .click();
  await expect
    .poll(() =>
      state.calls
        .filter(
          (call) => call.method === 'DELETE' && call.path.startsWith('/issue/')
        )
        .map((call) => call.path)
    )
    .toEqual(['/issue/71', '/issue/72']);
  await expect(
    dialog.getByRole('button', { name: 'Add to Blocklist' })
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to Blocklist' }).click();
  const blocklistConfirmation = page.getByRole('alertdialog', {
    name: 'Add to the Blocklist?',
  });
  await blocklistConfirmation
    .getByRole('button', { name: 'Add to Blocklist' })
    .click();
  await expect
    .poll(() => state.calls.find((call) => call.path === '/blocklist')?.body)
    .toEqual({ mediaType: 'movie', title: 'Fixture Movie', tmdbId: 42 });
});

test('issue action failure stops the batch, closes stale confirmation, and refreshes', async ({
  page,
}) => {
  const state = await setup(page, 2 | 1048576 | 7340032);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Fixture Movie' });
  state.failIssueDelete = true;
  await dialog.getByRole('button', { name: 'Delete all issues' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete all issues?' })
    .getByRole('button', { name: 'Delete all issues' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Some issues may already have changed'
  );
  await expect(
    page.getByRole('alertdialog', { name: 'Delete all issues?' })
  ).toHaveCount(0);
  expect(
    state.calls
      .filter(
        (call) => call.method === 'DELETE' && call.path.startsWith('/issue/')
      )
      .map((call) => call.path)
  ).toEqual(['/issue/71']);
});
