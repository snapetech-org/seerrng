import { expect, test, type Page } from '@playwright/test';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;

const ALBUM_MBID = '11111111-2222-3333-4444-555555555555';

const track = (title: string, artistName: string, inLibrary: boolean) => ({
  title,
  artistName,
  albumTitle: `${title} (Album)`,
  albumMbid: null,
  artistMbid: null,
  durationMs: 200000,
  coverUrl: null,
  inLibrary,
  streamPath: null,
});

interface PlanItem {
  mbid: string;
  title: string;
  primaryType: string;
  year?: number | null;
}

interface Seen {
  previews: string[];
  saved: unknown[];
  trackRequests?: unknown[];
  albumRequests?: unknown[];
  follows?: unknown[];
  // POST /music/artist/:mbid/request-all bodies, and the plan it answers with
  requestAll?: unknown[];
  requestAllPlan?: {
    albums: PlanItem[];
    epsAndSingles: PlanItem[];
    songs?: { title: string; artistName: string; fromReleaseMbid: string }[];
    skipped: (PlanItem & { reasonCode: string; reason: string })[];
  };
  requestAllFail?: Record<string, string>;
}

const ARTIST_MBID = 'bbbbbbbb-1111-2222-3333-444444444444';
const rg = (n: number, type: string, owned = false) => ({
  id: `cccccccc-1111-2222-3333-00000000000${n}`,
  title: `Release ${n}`,
  year: 2020 - n,
  primaryType: type,
  secondaryTypes: [],
  coverUrl: null,
  inLibrary: owned,
  requested: false,
});

const planItem = (group: ReturnType<typeof rg>): PlanItem => ({
  mbid: group.id,
  title: group.title,
  primaryType: group.primaryType,
  year: group.year,
});

// the fixture artist's plan: albums 2 and 3, then single 4 (album 1 is owned)
const defaultPlan = () => ({
  albums: [planItem(rg(2, 'Album')), planItem(rg(3, 'Album'))],
  epsAndSingles: [planItem(rg(4, 'Single'))],
  skipped: [
    {
      ...planItem(rg(1, 'Album')),
      reasonCode: 'owned',
      reason: 'You already have it.',
    },
  ],
});

const libraryAlbum = {
  id: 7,
  title: 'Fresh Album',
  artistName: 'Fresh Artist',
  mbid: null,
  releaseGroupMbid: ALBUM_MBID,
  releaseDate: '2026-01-01',
  addedAt: '2026-11-21T10:00:00.000Z',
  trackCount: 10,
  availableTrackCount: 10,
  coverUrl: '/api/v1/music/library-art/albums/7',
};

const activityItem = (
  id: string,
  title: string,
  artistName: string,
  status: string,
  statusLabel: string,
  playlist: string | null
) => ({
  id,
  title,
  artistName,
  albumName: null,
  status,
  statusLabel,
  source: 'slskd',
  requestedAt: '2026-11-21T10:00:00.000Z',
  cause: playlist
    ? { kind: 'playlist', name: playlist }
    : { kind: 'request', name: null },
});

async function mockMusic(page: Page, seen: Seen, locale = 'en') {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  let lumenPreferences: Record<string, unknown> = {};
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen(?=\/)/, '').slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Owner', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 1,
          musicEnabled: true,
          trackRequestsEnabled: true,
          enabledMediaCategories: { music: true },
        },
      });
    if (path === '/user/1/settings/main') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          lumenPreferences: Record<string, unknown>;
        };
        seen.saved.push(body.lumenPreferences);
        lumenPreferences = body.lumenPreferences ?? {};
      }
      return route.fulfill({ json: { locale, lumenPreferences } });
    }
    if (path === '/service/music')
      return route.fulfill({
        json: [
          {
            id: 0,
            name: 'Aurral',
            isDefault: true,
            backendType: 'aurral',
            externalUrl: 'https://music.example.com',
          },
        ],
      });
    if (path === '/music/track-requests/status')
      return route.fulfill({ json: { aurralConfigured: true } });
    if (path === '/music/discover/trending')
      return route.fulfill({
        json: {
          tracks: [
            track('Owned Song', 'Owned Artist', true),
            track('Missing Song', 'Other Artist', false),
            track('Busy Song', 'Busy Artist', false),
          ],
          albums: [],
          artists: [],
        },
      });
    if (path === '/music/discover/genres')
      return route.fulfill({ json: { tags: ['indie'] } });
    if (path === '/music/library-overview')
      return route.fulfill({
        json: {
          totalAlbums: 412,
          recentlyAdded: [libraryAlbum],
          downloadingCount: 2,
        },
      });
    if (path === '/music/activity')
      return route.fulfill({
        json: {
          active: [
            activityItem(
              'a1',
              'Busy Song',
              'Busy Artist',
              'processing',
              'Downloading',
              null
            ),
          ],
          queued: [
            activityItem(
              'q1',
              'First In Line',
              'Queue Artist',
              'pending',
              'Queued',
              'Daily Mix 2'
            ),
            activityItem(
              'q2',
              'Second In Line',
              'Queue Artist',
              'pending',
              'Queued',
              'Daily Mix 2'
            ),
          ],
          queuedTotal: 2,
          recent: [
            activityItem(
              'r1',
              'Done Song',
              'Done Artist',
              'completed',
              'Downloaded',
              null
            ),
          ],
          failedTotal: 0,
        },
      });
    if (path === '/music/library')
      return route.fulfill({
        json: {
          kind: url.searchParams.get('kind'),
          page: 1,
          pageSize: 36,
          total: 1,
          hasMore: false,
          items:
            url.searchParams.get('kind') === 'artists'
              ? [
                  {
                    id: 9,
                    name: 'Library Artist',
                    mbid: null,
                    albumCount: 1,
                    trackCount: 3,
                    coverUrl: '/api/v1/music/library-art/artists/9',
                  },
                ]
              : [libraryAlbum],
        },
      });
    if (
      path.startsWith('/music/library-art/') ||
      path.startsWith('/music/artist-image/')
    )
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#456"/></svg>',
      });
    if (path === '/music/discover/recommended')
      return route.fulfill({
        json: {
          recommendations: [
            {
              mbid: 'aaaaaaaa-1111-2222-3333-444444444444',
              name: 'Suggested Artist',
              image: null,
              because: 'Owned Artist',
              matchPercent: 90,
            },
          ],
          trending: [],
        },
      });
    if (path === '/music/discover/playlists')
      return route.fulfill({
        json: {
          categories: [
            {
              id: 'genre-0',
              name: 'Popular',
              playlists: [
                {
                  id: '123',
                  name: 'Weekly Fixture',
                  curator: 'Editor',
                  trackCount: 2,
                  artworkUrl: null,
                  provider: 'deezer',
                },
              ],
            },
          ],
        },
      });
    if (path === '/music/discover/playlists/deezer/123')
      return route.fulfill({
        json: {
          id: '123',
          name: 'Weekly Fixture',
          description: null,
          curator: 'Editor',
          artworkUrl: null,
          provider: 'deezer',
          tracks: [
            {
              title: 'Kept Song',
              artistName: 'Kept Artist',
              albumTitle: 'Kept Album',
              albumMbid: null,
              artistMbid: null,
              durationMs: 180000,
              coverUrl: null,
              previewDeezerId: '111',
              inLibrary: true,
            },
            {
              title: 'Wanted Song',
              artistName: 'Wanted Artist',
              albumTitle: 'Wanted Album',
              albumMbid: null,
              artistMbid: null,
              durationMs: 200000,
              coverUrl: null,
              previewDeezerId: '222',
              inLibrary: false,
            },
          ],
        },
      });
    if (path === `/music/artist/${ARTIST_MBID}`)
      return route.fulfill({
        json: {
          mbid: ARTIST_MBID,
          name: 'Fixture Band',
          type: 'Group',
          country: 'US',
          beginYear: 2010,
          endYear: null,
          genres: ['indie'],
          bio: 'A fixture band.',
          releaseGroups: [
            rg(1, 'Album', true),
            rg(2, 'Album'),
            rg(3, 'Album'),
            rg(4, 'Single'),
          ],
        },
      });
    if (
      path === `/music/artist/${ARTIST_MBID}/request-all` &&
      route.request().method() === 'POST'
    ) {
      const body = (route.request().postDataJSON() ?? {}) as {
        dryRun?: boolean;
      };
      seen.requestAll?.push(body);
      const plan = seen.requestAllPlan ?? defaultPlan();
      const covered = plan.skipped.filter((item) =>
        ['covered', 'duplicate', 'sameAlbum'].includes(item.reasonCode)
      ).length;
      const songs = 'songs' in plan ? (plan.songs ?? []) : [];
      const counts = {
        albums: plan.albums.length,
        epsAndSingles: plan.epsAndSingles.length,
        songs: songs.length,
        skipped: plan.skipped.length,
        covered,
      };
      if (body.dryRun)
        return route.fulfill({ json: { dryRun: true, ...plan, counts } });
      const songResults = songs.map((song) => {
        seen.trackRequests?.push(song);
        return { ...song, status: 'requested' };
      });
      const results = [...plan.albums, ...plan.epsAndSingles].map((item) => {
        seen.albumRequests?.push({ mediaType: 'music', mediaId: item.mbid });
        const reason = seen.requestAllFail?.[item.mbid];
        return reason
          ? { ...item, status: 'failed', reason }
          : { ...item, status: 'requested' };
      });
      // everything is on its way now: the next dry run plans nothing
      seen.requestAllPlan = {
        albums: [],
        epsAndSingles: [],
        songs: [],
        skipped: [],
      };
      return route.fulfill({
        json: {
          dryRun: false,
          ...plan,
          counts: {
            ...counts,
            requested:
              results.filter((item) => item.status === 'requested').length +
              songResults.length,
            failed: results.filter((item) => item.status === 'failed').length,
          },
          results,
          songResults,
        },
      });
    }
    if (path === `/music/artist/${ARTIST_MBID}/follow`) {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as { follow: boolean };
        seen.follows?.push(body);
        return route.fulfill({
          json: { inLibrary: true, following: body.follow },
        });
      }
      return route.fulfill({ json: { inLibrary: false, following: false } });
    }
    if (path === '/request' && route.request().method() === 'POST') {
      seen.albumRequests?.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: 1 } });
    }
    if (
      path === '/music/track-requests' &&
      route.request().method() === 'POST'
    ) {
      seen.trackRequests?.push(route.request().postDataJSON());
      return route.fulfill({ json: { results: [{ status: 'pending' }] } });
    }
    if (path === '/music/preview') {
      seen.previews.push(url.search);
      return route.fulfill({
        status: 404,
        json: { message: 'No preview for this song.' },
      });
    }
    if (path === `/music/${ALBUM_MBID}`)
      return route.fulfill({
        json: {
          id: ALBUM_MBID,
          title: 'Half Album',
          type: 'Album',
          artist: { id: 'artist-1', name: 'Half Artist' },
          tracks: [
            {
              position: 1,
              name: 'Have It',
              length: 180000,
              recordingMbid: 'rec-1',
            },
            {
              position: 2,
              name: 'Want It',
              length: 200000,
              recordingMbid: 'rec-2',
            },
          ],
          trackAvailability: { mp3: [], flac: ['rec-1'] },
        },
      });
    if (/^\/(genres|languages|regions|watchproviders)/.test(path))
      return route.fulfill({ json: [] });
    return route.fulfill({
      json: { results: [], page: 1, totalPages: 1, totalResults: 0 },
    });
  });
}

test('music home shows Play, preview and Get by what is in the library', async ({
  page,
}) => {
  const seen: Seen = { previews: [], saved: [] };
  await mockMusic(page, seen);
  await page.goto(testAppPath('/music'));

  const owned = page.locator('li', { hasText: 'Owned Song' });
  const play = owned.getByRole('link', { name: /Play Owned Song in Aurral/ });
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('target', 'lumen-music-player');
  const href = new URL((await play.getAttribute('href')) ?? '');
  expect(href.origin + href.pathname).toBe(
    'https://music.example.com/go/album'
  );
  expect(href.searchParams.get('artist')).toBe('Owned Artist');
  expect(href.searchParams.get('track')).toBe('Owned Song');

  const missing = page.locator('li', { hasText: 'Missing Song' });
  await expect(missing.getByRole('button', { name: /^Get$/ })).toBeVisible();
  // a song Get downloads that song only, never its whole album
  await expect(missing.getByRole('button', { name: /^Get$/ })).toHaveAttribute(
    'title',
    'Downloads this song. It turns into Play when it lands.'
  );
  await expect(missing.getByRole('link', { name: /Play/ })).toHaveCount(0);

  const busy = page.locator('li', { hasText: 'Busy Song' });
  await expect(busy.getByText('Downloading')).toBeVisible();

  // Discover is for new music: what was just added lives in the Library tab
  await expect(page.getByText('Fresh Album')).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: /Library/ }).getByLabel('412 albums')
  ).toBeVisible();
});

test('Play reuses one named player tab', async ({ page }) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.addInitScript(() => {
    const calls: [string, string][] = [];
    (window as unknown as { __opens: typeof calls }).__opens = calls;
    window.open = ((url: string, name: string) => {
      calls.push([String(url), String(name)]);
      // a stand-in for the player tab, so Lumen stays on this page
      return { opener: null, focus: () => {} } as unknown as Window;
    }) as typeof window.open;
  });
  await page.goto(testAppPath('/music'));
  await page
    .locator('li', { hasText: 'Owned Song' })
    .getByRole('link', { name: /Play Owned Song/ })
    .click();
  const opens = await page.evaluate(
    () => (window as unknown as { __opens: [string, string][] }).__opens
  );
  expect(opens).toHaveLength(1);
  expect(opens[0][1]).toBe('lumen-music-player');
  expect(opens[0][0]).toContain('https://music.example.com/go/album');
});

test('a preview asks SeerrNG for the clip and shows the preview bar', async ({
  page,
}) => {
  // phones too: the preview sits on the song art, so it costs no row space
  const seen: Seen = { previews: [], saved: [] };
  await mockMusic(page, seen);
  await page.goto(testAppPath('/music'));
  await page
    .locator('li', { hasText: 'Missing Song' })
    .getByRole('button', { name: /Preview Missing Song/ })
    .click();
  const bar = page.getByRole('region', { name: 'Preview player' });
  await expect(bar).toBeVisible();
  await expect(bar.getByText('No preview for this song')).toBeVisible();
  await expect.poll(() => seen.previews.length).toBeGreaterThan(0);
  // SeerrNG's validator rejects '+' for spaces
  expect(seen.previews[0]).not.toContain('+');
  expect(seen.previews[0]).toContain('Other%20Artist');
  const params = new URLSearchParams(seen.previews[0]);
  expect(params.get('artist')).toBe('Other Artist');
  expect(params.get('track')).toBe('Missing Song');
  await bar.getByRole('button', { name: 'Close preview' }).click();
  await expect(bar).toHaveCount(0);
});

for (const [
  locale,
  playerLabel,
  playOpensLabel,
  settingsTitle,
  handoff,
  previews,
  previewLabel,
  noPreview,
  previewRegionLabel,
  previewProgressLabel,
  closePreviewLabel,
  doneLabel,
  baselinePlayOpensLabel,
  baselineSettingsTitle,
  baselineHandoff,
  baselinePreviews,
  baselinePreviewLabel,
  baselineNoPreview,
  baselinePreviewRegionLabel,
  baselinePreviewProgressLabel,
  baselineClosePreviewLabel,
  baselineDoneLabel,
] of [
  [
    'fr',
    'Application Shelf',
    'La lecture s’ouvre dans : Aurral',
    'Quand vous appuyez sur Lire',
    'Lumen ouvre dans votre application musicale les morceaux que vous possédez.',
    'Extraits de 30 secondes',
    'Écouter un extrait de Missing Song',
    'Aucun extrait disponible pour ce morceau',
    'Lecteur d’extraits',
    'Progression de l’extrait',
    'Fermer l’extrait',
    'Terminé',
    'Play opens in: Aurral',
    'When you press Play',
    'Lumen hands songs you have to your music app.',
    '30-second previews',
    'Preview Missing Song',
    'No preview for this song',
    'Preview player',
    'Preview progress',
    'Close preview',
    'Done',
  ],
  [
    'ar',
    'تطبيق Shelf',
    'يفتح التشغيل في: Aurral',
    'عند الضغط على تشغيل',
    'يفتح Lumen الأغاني المتوفرة لديك في تطبيق الموسيقى.',
    'مقاطع معاينة مدتها 30 ثانية',
    'معاينة Missing Song',
    'لا تتوفر معاينة لهذه الأغنية',
    'مشغل المعاينة',
    'تقدم المعاينة',
    'إغلاق المعاينة',
    'تم',
    'Play opens in: Aurral',
    'When you press Play',
    'Lumen hands songs you have to your music app.',
    '30-second previews',
    'Preview Missing Song',
    'No preview for this song',
    'Preview player',
    'Preview progress',
    'Close preview',
    'Done',
  ],
] as const) {
  test(`music playback controls use the saved ${locale} locale`, async ({
    page,
  }, testInfo) => {
    const baseline = process.env.LUMEN_CAPTURE_BASELINE === '1';
    await mockMusic(page, { previews: [], saved: [] }, locale);
    await page.goto(testAppPath('/music'));
    await page
      .getByRole('button', {
        name: baseline ? baselinePlayOpensLabel : playOpensLabel,
      })
      .click();
    const sheet = page.getByRole('dialog', {
      name: baseline ? baselineSettingsTitle : settingsTitle,
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByText(baseline ? baselineHandoff : handoff)
    ).toBeVisible();
    await expect(
      sheet.getByRole('radio', {
        name: baseline ? 'Shelf app' : playerLabel,
      })
    ).toBeDisabled();
    await expect(
      sheet.getByText(baseline ? baselinePreviews : previews)
    ).toBeVisible();
    await expect(
      sheet.getByText(
        locale === 'fr'
          ? 'Recherche dans Plex dans le même onglet réutilisé.'
          : 'يبحث عنه في Plex باستخدام علامة التبويب نفسها.'
      )
    ).toBeVisible();
    await expect(
      sheet.getByText(
        locale === 'fr'
          ? 'L’application mobile Shelf. Disponible lorsque l’application pourra ouvrir des liens.'
          : 'تطبيق Shelf للهاتف. سيتوفر عند دعم فتح الروابط في التطبيق.'
      )
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('music-playback-settings.png'),
      fullPage: false,
    });
    await sheet
      .getByRole('button', { name: baseline ? baselineDoneLabel : doneLabel })
      .click();

    await page
      .locator('li', { hasText: 'Missing Song' })
      .getByRole('button', {
        name: baseline ? baselinePreviewLabel : previewLabel,
      })
      .click();
    const preview = page.getByRole('region', {
      name: baseline ? baselinePreviewRegionLabel : previewRegionLabel,
    });
    await expect(
      preview.getByText(baseline ? baselineNoPreview : noPreview)
    ).toBeVisible();
    await expect(
      preview.getByRole('button', {
        name: baseline ? baselinePreviewLabel : previewLabel,
      })
    ).toBeDisabled();
    await expect(
      preview.getByRole('progressbar', {
        name: baseline ? baselinePreviewProgressLabel : previewProgressLabel,
      })
    ).toBeVisible();
    await expect(
      preview.getByRole('button', {
        name: baseline ? baselineClosePreviewLabel : closePreviewLabel,
      })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('music-preview-error.png'),
      fullPage: false,
    });
  });
}

test('Play opens in: picking Plex is saved and changes the links', async ({
  page,
}) => {
  const seen: Seen = { previews: [], saved: [] };
  await mockMusic(page, seen);
  await page.goto(testAppPath('/music'));
  await page.getByRole('button', { name: /Play opens in: Aurral/ }).click();
  const sheet = page.getByRole('dialog', { name: 'When you press Play' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /Shelf app/ })).toBeDisabled();
  await sheet.getByRole('radio', { name: /Plex/ }).check();
  await expect
    .poll(() => seen.saved.at(-1))
    .toMatchObject({ musicPlayer: 'plex' });
  await sheet.getByRole('button', { name: 'Done' }).click();
  const play = page
    .locator('li', { hasText: 'Owned Song' })
    .getByRole('link', { name: /Play Owned Song in Plex/ });
  await expect(play).toHaveAttribute(
    'href',
    /^https:\/\/app\.plex\.tv\/desktop\/#!\/search\?query=Owned\+Artist\+Owned\+Song$/
  );
});

test('an album page counts the songs you have and offers the rest', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  await expect(page.getByText('1 of 2 songs in your library')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Get the 1 missing songs/ }).first()
  ).toBeVisible();
  await expect(
    page
      .locator('li', { hasText: 'Have It' })
      .getByRole('link', { name: /Play Have It/ })
  ).toBeVisible();
  await expect(
    page
      .locator('li', { hasText: 'Want It' })
      .getByRole('button', { name: 'Get song' })
  ).toBeVisible();

  // the More menu opens leftward so it stays on a phone screen
  await page.locator('summary', { hasText: /^More$/ }).click();
  const menu = page.locator('.music-more-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
});

test('Library shows your albums and artists with their covers', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.goto(testAppPath('/music?tab=library'));
  const cover = page
    .locator('.poster', { hasText: 'Fresh Album' })
    .locator('img');
  await expect(cover).toHaveAttribute(
    'src',
    '/api/v1/music/library-art/albums/7'
  );
  await page.getByRole('button', { name: 'Artists' }).click();
  await expect(page.getByText('Library Artist')).toBeVisible();
  // the choice is kept in the address, so Back and reload come back to it
  await expect(page).toHaveURL(/lib=artists/);
});

test('Activity lists downloads in order with why each one is there', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.goto(testAppPath('/music?tab=activity'));
  const queue = page.locator('.music-act-row');
  await expect(queue.filter({ hasText: 'Busy Song' })).toContainText(
    'Downloading'
  );
  const first = queue.filter({ hasText: 'First In Line' });
  await expect(first).toContainText('From Daily Mix 2');
  await expect(first.locator('.music-act-pos')).toHaveText('1');
  await expect(
    queue.filter({ hasText: 'Second In Line' }).locator('.music-act-pos')
  ).toHaveText('2');
  await expect(queue.filter({ hasText: 'Done Song' })).toContainText(
    'Downloaded'
  );
});

for (const [
  locale,
  sortLabel,
  filterPlaceholder,
  artistsLabel,
  activityLabels,
] of [
  [
    'fr',
    'Trier',
    'Album, artiste ou chanson',
    'Artistes',
    ['En cours de téléchargement', 'À suivre (2)', 'Téléchargés récemment'],
  ],
  [
    'ar',
    'ترتيب',
    'الألبوم أو الفنان أو الأغنية',
    'الفنانون',
    ['قيد التنزيل الآن', 'التالي (2)', 'تم تنزيلها مؤخرًا'],
  ],
] as const) {
  test(`music library and activity use the saved ${locale} locale`, async ({
    page,
  }, testInfo) => {
    const baseline = process.env.LUMEN_CAPTURE_BASELINE === '1';
    await mockMusic(page, { previews: [], saved: [] }, locale);
    await page.goto(testAppPath('/music?tab=library'));
    await expect(
      page.getByText(baseline ? 'Sort' : sortLabel, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(
        baseline ? 'Album, artist or song' : filterPlaceholder
      )
    ).toBeVisible();
    await page
      .getByRole('button', { name: baseline ? 'Artists' : artistsLabel })
      .click();
    await expect(
      page.getByRole('button', { name: baseline ? 'Artists' : artistsLabel })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('music-library.png'),
      fullPage: false,
    });

    await page.goto(testAppPath('/music?tab=activity'));
    const expectedActivity = baseline
      ? ['Downloading now', 'Up next (2)', 'Recently downloaded']
      : activityLabels;
    for (const label of expectedActivity) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('music-activity.png'),
      fullPage: false,
    });
  });
}

for (const [locale, heading, emptyState] of [
  ['fr', 'Vos demandes de musique', 'Aucune demande musicale pour le moment.'],
  ['ar', 'طلباتك الموسيقية', 'لا توجد طلبات موسيقية بعد.'],
] as const) {
  test(`music request summary uses the saved ${locale} locale`, async ({
    page,
  }, info) => {
    const baseline = process.env.LUMEN_CAPTURE_BASELINE === '1';
    await mockMusic(page, { previews: [], saved: [] }, locale);
    await page.goto(testAppPath('/music?tab=activity'));
    const requests = page.getByRole('heading', {
      name: baseline ? 'Your music requests' : heading,
    });
    await requests.scrollIntoViewIfNeeded();
    await expect(requests).toBeVisible();
    await expect(
      page.getByText(baseline ? 'No music requests yet.' : emptyState, {
        exact: true,
      })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    if (['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: info.outputPath(`music-requests-${locale}.png`),
        fullPage: false,
      });
  });
}

for (const [
  locale,
  searchPlaceholder,
  noResults,
  noResultsHelp,
  searchListLabel,
  trendingSongsLabel,
  genresLabel,
  madeForYouLabel,
  browseCatalogLabel,
] of [
  [
    'fr',
    'Rechercher des chansons, albums et artistes…',
    'Aucun résultat pour « Missing query »',
    'Vérifiez l’orthographe ou recherchez uniquement l’artiste ou la chanson.',
    'Résultats de recherche',
    'Chansons tendance',
    'Vos genres musicaux',
    'Pour vous sur Aurral',
    'Parcourir le catalogue',
  ],
  [
    'ar',
    'ابحث عن الأغاني والألبومات والفنانين…',
    'لم يتم العثور على نتائج لـ «Missing query»',
    'تحقق من الإملاء أو جرّب البحث باسم الفنان أو الأغنية فقط.',
    'نتائج البحث',
    'الأغاني الرائجة',
    'أنواعك الموسيقية',
    'مخصص لك على Aurral',
    'تصفح الفهرس',
  ],
] as const) {
  test(`music search and discovery use the saved ${locale} locale`, async ({
    page,
  }, testInfo) => {
    const baseline = process.env.LUMEN_CAPTURE_BASELINE === '1';
    await mockMusic(page, { previews: [], saved: [] }, locale);
    await page.route('**/api/v1/music/search?**', (route) =>
      route.fulfill({
        json: { artists: [], albums: [], tracks: [], top: null },
      })
    );
    await page.goto(testAppPath('/music?q=Missing%20query'));
    await expect(
      page.getByPlaceholder(
        baseline ? 'Search songs, albums, and artists…' : searchPlaceholder
      )
    ).toHaveAttribute(
      'placeholder',
      baseline ? 'Search songs, albums, and artists…' : searchPlaceholder
    );
    await expect(
      page.getByRole('tablist', {
        name: baseline ? 'Search results' : searchListLabel,
      })
    ).toBeVisible();
    await expect(
      page.getByText(
        baseline ? 'Nothing found for “Missing query”' : noResults,
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        baseline
          ? 'Check the spelling, or try just the artist or the song name.'
          : noResultsHelp
      )
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('music-search-empty.png'),
      fullPage: false,
    });

    await page.goto(testAppPath('/music'));
    for (const [baselineLabel, translatedLabel] of [
      ['Trending songs', trendingSongsLabel],
      ['Your genres', genresLabel],
      ['Made for you in Aurral', madeForYouLabel],
      ['Browse catalog', browseCatalogLabel],
    ]) {
      await expect(
        page.getByText(baseline ? baselineLabel : translatedLabel, {
          exact: true,
        })
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('music-discovery.png'),
      fullPage: false,
    });
  });
}

test('a playlist page gets every missing song in one go', async ({ page }) => {
  const seen: Seen = { previews: [], saved: [], trackRequests: [] };
  await mockMusic(page, seen);
  await page.goto(testAppPath('/music'));
  await page
    .getByRole('link', { name: /Weekly Fixture/ })
    .first()
    .click();
  await expect(page.getByText('1 of 2 songs in your library')).toBeVisible();
  await page.getByRole('button', { name: 'Get the missing song' }).click();
  await page
    .getByRole('alertdialog', { name: 'Get 1 song?' })
    .getByRole('button', { name: 'Get them' })
    .click();
  await expect.poll(() => seen.trackRequests?.length).toBe(1);
  expect(seen.trackRequests?.[0]).toMatchObject({
    tracks: [{ title: 'Wanted Song', artist: 'Wanted Artist' }],
  });
});

for (const [locale, filter, getMissing, confirmTitle, confirmBody, confirm] of [
  [
    'fr',
    'Absents de la bibliothèque',
    'Obtenir le morceau manquant',
    'Obtenir 1 morceau ?',
    'Aurral télécharge les morceaux un par un. Suivez leur progression dans Activité.',
    'Les obtenir',
  ],
  [
    'ar',
    'غير موجودة في المكتبة',
    'تنزيل الأغنية المتبقية',
    'تنزيل أغنية واحدة؟',
    'ينزّل Aurral الأغاني واحدة تلو الأخرى. يمكنك متابعة تقدمها في النشاط.',
    'تنزيلها',
  ],
] as const) {
  test(`playlist request actions use the saved ${locale} locale`, async ({
    page,
  }, info) => {
    const baseline = process.env.LUMEN_CAPTURE_BASELINE === '1';
    await mockMusic(page, { previews: [], saved: [] }, locale);
    await page.goto(testAppPath('/music/playlist/deezer/123'));
    const filters = page.getByRole('group', {
      name: baseline
        ? 'Show songs'
        : locale === 'fr'
          ? 'Afficher les morceaux'
          : 'عرض الأغاني',
    });
    await expect(filters).toBeVisible();
    await expect(
      filters.getByRole('button', {
        name: baseline ? 'Not in library' : filter,
      })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`music-playlist-${locale}.png`),
      fullPage: false,
    });

    await page
      .getByRole('button', {
        name: baseline ? 'Get the missing song' : getMissing,
      })
      .click();
    const confirmDialog = page.getByRole('alertdialog', {
      name: baseline ? 'Get 1 song?' : confirmTitle,
    });
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByText(
        baseline
          ? 'Aurral downloads each song one after another. You can follow them in Activity.'
          : confirmBody
      )
    ).toBeVisible();
    await confirmDialog
      .getByRole('button', { name: baseline ? 'Get them' : confirm })
      .click();
  });
}

test('previews of playlist songs use the Deezer clip id', async ({ page }) => {
  const seen: Seen = { previews: [], saved: [] };
  await mockMusic(page, seen);
  await page.goto(testAppPath('/music/playlist/deezer/123'));
  await page
    .locator('li', { hasText: 'Wanted Song' })
    .getByRole('button', { name: /Preview Wanted Song/ })
    .click();
  await expect.poll(() => seen.previews[0]).toBe('?deezerId=222');
});

test('an artist page follows the artist and gets every missing release, singles too', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    follows: [],
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await expect(page.locator('main h1')).toHaveText('Fixture Band');
  await expect(page.getByText('You have 1 of 3 albums')).toBeVisible();

  await page.getByRole('button', { name: 'Follow' }).click();
  await expect.poll(() => seen.follows?.length).toBe(1);
  expect(seen.follows?.[0]).toMatchObject({
    follow: true,
    name: 'Fixture Band',
  });
  await expect(page.getByRole('button', { name: 'Following' })).toBeVisible();

  // one clear action: the singles button waits until no album is missing
  await expect(page.getByRole('button', { name: /singles & EPs/ })).toHaveCount(
    0
  );
  await page
    .getByRole('button', { name: 'Get the 3 missing releases' })
    .click();
  const sheet = page.getByRole('alertdialog', {
    name: /Get all releases by Fixture Band/,
  });
  await expect(
    sheet.getByText(
      '2 albums and 1 single or EP by Fixture Band will be requested.',
      { exact: false }
    )
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Get them' }).click();
  await expect.poll(() => seen.albumRequests?.length).toBe(3);
  // albums first, then the single
  expect(seen.albumRequests).toEqual([
    { mediaType: 'music', mediaId: rg(2, 'Album').id },
    { mediaType: 'music', mediaId: rg(3, 'Album').id },
    { mediaType: 'music', mediaId: rg(4, 'Single').id },
  ]);
  await expect(
    page.getByRole('button', { name: /Get (all|the) .* releases/ })
  ).toHaveCount(0);
});

test('getting every release keeps going when one fails and says how many failed', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    requestAllFail: { [rg(2, 'Album').id]: 'Lidarr is down' },
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await page
    .getByRole('button', { name: 'Get the 3 missing releases' })
    .click();
  await page
    .getByRole('alertdialog', { name: /Get all releases by Fixture Band/ })
    .getByRole('button', { name: 'Get them' })
    .click();
  await expect.poll(() => seen.albumRequests?.length).toBe(3);
  await expect(
    page.getByText('1 could not be requested. Lidarr is down')
  ).toBeVisible();
});

test('Get all asks the server for a plan first and says how many are skipped because those songs come anyway', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    requestAll: [],
    requestAllPlan: {
      albums: [planItem(rg(2, 'Album')), planItem(rg(3, 'Album'))],
      epsAndSingles: [],
      skipped: [
        {
          ...planItem(rg(4, 'Single')),
          reasonCode: 'covered',
          reason: 'You will already have every song on it.',
        },
      ],
    },
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await page
    .getByRole('button', { name: 'Get the 2 missing releases' })
    .click();
  const sheet = page.getByRole('alertdialog', {
    name: /Get all releases by Fixture Band/,
  });
  await expect(
    sheet.getByText(
      '2 albums by Fixture Band will be requested. 1 skipped: already covered or unofficial.',
      { exact: false }
    )
  ).toBeVisible();
  // the dry run asked for nothing
  expect(seen.requestAll).toEqual([{ dryRun: true }]);
  expect(seen.albumRequests).toEqual([]);
  await sheet.getByRole('button', { name: 'Get them' }).click();
  // the real call, then the page asks for its numbers again
  await expect
    .poll(() => seen.requestAll?.length ?? 0)
    .toBeGreaterThanOrEqual(2);
  expect(seen.requestAll?.[1]).toEqual({});
  expect(seen.albumRequests).toEqual([
    { mediaType: 'music', mediaId: rg(2, 'Album').id },
    { mediaType: 'music', mediaId: rg(3, 'Album').id },
  ]);
  await expect(page.getByText('Getting 2 releases')).toBeVisible();
});

test('Get all offers nothing when every song would already come', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    requestAll: [],
    requestAllPlan: {
      albums: [],
      epsAndSingles: [],
      skipped: [
        {
          ...planItem(rg(2, 'Album')),
          reasonCode: 'sameAlbum',
          reason: 'Same album, another edition.',
        },
        {
          ...planItem(rg(3, 'Album')),
          reasonCode: 'sameAlbum',
          reason: 'Same album, another edition.',
        },
        {
          ...planItem(rg(4, 'Single')),
          reasonCode: 'covered',
          reason: 'You will already have every song on it.',
        },
      ],
    },
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  // the server plans nothing: no Get button, a quiet line instead
  await expect(
    page.getByText(
      'Everything by Fixture Band is in your library or on its way.'
    )
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Get (the|all|\d)/ })
  ).toHaveCount(0);
  expect(seen.requestAll).toEqual([{ dryRun: true }]);
  expect(seen.albumRequests).toEqual([]);
});

test('Get all asks for the new songs of a partly new single on their own', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    trackRequests: [],
    requestAll: [],
    requestAllPlan: {
      albums: [planItem(rg(2, 'Album')), planItem(rg(3, 'Album'))],
      epsAndSingles: [planItem(rg(4, 'Single'))],
      songs: [
        {
          title: 'B-Side One',
          artistName: 'Fixture Band',
          fromReleaseMbid: rg(4, 'Single').id,
        },
        {
          title: 'B-Side Two',
          artistName: 'Fixture Band',
          fromReleaseMbid: rg(4, 'Single').id,
        },
      ],
      skipped: [],
    },
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await page
    .getByRole('button', { name: 'Get the 3 missing releases' })
    .click();
  const sheet = page.getByRole('alertdialog', {
    name: /Get all releases by Fixture Band/,
  });
  await expect(
    sheet.getByText(
      '2 albums, 1 single or EP and 2 extra songs by Fixture Band will be requested.',
      { exact: false }
    )
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Get them' }).click();
  await expect.poll(() => seen.trackRequests?.length).toBe(2);
  await expect(page.getByText('Getting 5 releases')).toBeVisible();
});

test('an artist page hides other editions and covered singles until asked, and says why', async ({
  page,
}) => {
  const seen: Seen = { previews: [], saved: [], albumRequests: [] };
  await mockMusic(page, seen);
  await page.route(`**/api/v1/music/artist/${ARTIST_MBID}`, (route) =>
    route.fulfill({
      json: {
        mbid: ARTIST_MBID,
        name: 'Fixture Band',
        type: 'Group',
        country: 'US',
        beginYear: 2010,
        endYear: null,
        genres: [],
        bio: null,
        releaseGroups: [
          rg(1, 'Album', true),
          rg(2, 'Album'),
          rg(3, 'Album'),
          rg(4, 'Single'),
          {
            ...rg(5, 'Album'),
            title: 'Release 2 (Deluxe)',
            redundant: {
              code: 'sameAlbum',
              reason: 'Another edition of Release 2',
              coveredBy: { mbid: rg(2, 'Album').id, title: 'Release 2' },
            },
          },
          {
            ...rg(6, 'Single'),
            redundant: {
              code: 'covered',
              reason: 'On Release 1',
              coveredBy: { mbid: rg(1, 'Album').id, title: 'Release 1' },
            },
          },
          {
            ...rg(7, 'Single'),
            title: 'Release 7 Promo CD',
            redundant: { code: 'unofficial', reason: 'Promo release.' },
          },
        ],
      },
    })
  );
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  // counts and Get all only know the albums worth getting
  await expect(page.getByText('You have 1 of 3 albums')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Get the 3 missing releases' })
  ).toBeVisible();
  await expect(page.getByText('Release 2 (Deluxe)')).toHaveCount(0);
  await expect(page.getByText('Release 6', { exact: true })).toHaveCount(0);

  await page
    .getByRole('button', { name: 'Show 3 other editions and singles' })
    .click();
  await expect(page).toHaveURL(/[?&]others=1/);
  await expect(
    page.getByText('Other editions and singles', { exact: true })
  ).toBeVisible();
  const hidden = page.locator('.music-hidden-releases');
  // grouped by why each is hidden
  for (const heading of [
    'Other editions',
    'Songs already on the albums',
    'Promo and unofficial releases',
  ]) {
    await expect(hidden.getByText(heading, { exact: true })).toBeVisible();
  }
  const edition = hidden.locator('.poster', { hasText: 'Release 2 (Deluxe)' });
  await expect(edition.getByText('Another edition of Release 2')).toBeVisible();
  await expect(
    edition.getByRole('link', { name: 'Open Release 2' })
  ).toHaveAttribute('href', new RegExp(`/music/${rg(2, 'Album').id}$`));
  const covered = hidden.locator('.poster', { hasText: 'Release 6' });
  await expect(covered.getByText('On Release 1')).toBeVisible();
  await expect(
    covered.getByRole('link', { name: 'Open Release 1' })
  ).toBeVisible();
  // the album is the thing to get, not the covered single
  await expect(covered.getByRole('button', { name: /^Get/ })).toHaveCount(0);
  const promo = hidden.locator('.poster', { hasText: 'Release 7 Promo CD' });
  await expect(promo.getByText('Promo release')).toBeVisible();

  // the reveal survives a reload (it is in the address)
  await page.reload();
  await expect(page.getByText('Release 2 (Deluxe)')).toBeVisible();
  await page
    .getByRole('button', { name: 'Hide other editions and singles' })
    .click();
  await expect(page).not.toHaveURL(/others=1/);
});

test('an album page of a covered single points at its album and asks before getting it anyway', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(`**/api/v1/music/${ALBUM_MBID}`, (route) =>
    route.fulfill({
      json: {
        id: ALBUM_MBID,
        title: 'Hit Single',
        type: 'Single',
        artist: { id: 'artist-1', name: 'Half Artist' },
        tracks: [
          { position: 1, name: 'Hit', length: 180000, recordingMbid: 'rec-9' },
        ],
        trackAvailability: { mp3: [], flac: [] },
        redundant: {
          code: 'covered',
          reason: 'On Big Album',
          coveredBy: {
            mbid: 'dddddddd-1111-2222-3333-444444444444',
            title: 'Big Album',
          },
        },
      },
    })
  );
  await page.route('**/api/v1/request', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    return body.force
      ? route.fulfill({ status: 201, json: { id: 1 } })
      : route.fulfill({
          status: 409,
          json: {
            code: 'MUSIC_RELEASE_REDUNDANT',
            message: "You'll already have these songs from Big Album.",
            coveredBy: {
              mbid: 'dddddddd-1111-2222-3333-444444444444',
              title: 'Big Album',
            },
          },
        });
  });
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  await expect(
    page.getByRole('link', { name: 'This song is on Big Album' })
  ).toHaveAttribute('href', /\/music\/dddddddd-1111-2222-3333-444444444444$/);

  await page.getByRole('button', { name: 'Get single' }).first().click();
  const sheet = page.getByRole('alertdialog', {
    name: "You'll already have these songs from Big Album. Get it anyway?",
  });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Get it anyway' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0]).toMatchObject({
    mediaType: 'music',
    mediaId: ALBUM_MBID,
  });
  expect(requests[0].force).toBeUndefined();
  expect(requests[1]).toMatchObject({
    mediaType: 'music',
    mediaId: ALBUM_MBID,
    force: true,
  });
  await expect(sheet).toHaveCount(0);
});

test('the Get button uses the server plan numbers, songs only too', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    trackRequests: [],
    requestAll: [],
    requestAllPlan: {
      albums: [],
      epsAndSingles: [],
      songs: [
        {
          title: 'Orbiter',
          artistName: 'Fixture Band',
          fromReleaseMbid: rg(1, 'Album').id,
        },
        {
          title: 'Bonus Two',
          artistName: 'Fixture Band',
          fromReleaseMbid: rg(1, 'Album').id,
        },
      ],
      skipped: [],
    },
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  // the page's own count (3 missing releases) is not what the server plans
  await page.getByRole('button', { name: 'Get 2 more songs' }).click();
  const sheet = page.getByRole('alertdialog');
  await expect(
    sheet.getByText('2 extra songs by Fixture Band will be requested.', {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /missing releases/ })
  ).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Get them' }).click();
  await expect.poll(() => seen.trackRequests?.length).toBe(2);
});

test('the Get button counts singles and EPs from the server plan', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    requestAll: [],
    requestAllPlan: {
      albums: [],
      epsAndSingles: [planItem(rg(4, 'Single'))],
      skipped: [],
    },
  };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await expect(
    page.getByRole('button', { name: 'Get 1 singles & EPs' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /missing releases/ })
  ).toHaveCount(0);
});

test('live albums and remixes have no one-tap Get, a soundtrack single sits with the singles', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [], albumRequests: [] });
  await page.route(`**/api/v1/music/artist/${ARTIST_MBID}`, (route) =>
    route.fulfill({
      json: {
        mbid: ARTIST_MBID,
        name: 'Fixture Band',
        type: 'Group',
        country: 'US',
        beginYear: 2010,
        endYear: null,
        genres: [],
        bio: null,
        releaseGroups: [
          rg(1, 'Album', true),
          rg(2, 'Album'),
          {
            ...rg(5, 'Album'),
            title: 'Live at the Fixture',
            secondaryTypes: ['Live'],
          },
          {
            ...rg(6, 'Single'),
            title: 'Release 6 (Remixes)',
            secondaryTypes: ['Remix'],
          },
          {
            ...rg(7, 'Album'),
            title: 'Fixture Hits',
            secondaryTypes: ['Compilation'],
          },
          {
            ...rg(8, 'Single'),
            title: 'Film Song',
            secondaryTypes: ['Soundtrack'],
          },
        ],
      },
    })
  );
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  const live = page.locator('.poster', { hasText: 'Live at the Fixture' });
  await expect(live).toBeVisible();
  // the one-tap Get sits on the cover (shown on hover)
  await expect(live.locator('.qbtn')).toHaveCount(0);
  const remix = page.locator('.poster', { hasText: 'Release 6 (Remixes)' });
  await expect(remix.locator('.qbtn')).toHaveCount(0);
  // a compilation keeps its Get
  await expect(
    page.locator('.poster', { hasText: 'Fixture Hits' }).locator('.qbtn')
  ).toHaveCount(1);
  // the film song is one of the band's singles
  const singles = page.locator('section', { hasText: 'Singles & EPs' }).first();
  await expect(singles.getByText('Film Song')).toBeVisible();
});

test('a song requested earlier still shows as requested after a reload', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(
    (url) =>
      url.pathname.endsWith('/api/v1/music/track-requests') &&
      url.searchParams.get('filter') === 'active',
    (route) =>
      route.fulfill({
        json: {
          pageInfo: { total: 1, take: 100, skip: 0 },
          // the catalog spells the artist differently: the match ignores case
          results: [
            {
              id: 5,
              status: 'searching',
              artist: 'half artist',
              title: 'Want It',
            },
          ],
        },
      })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  const row = page.locator('li', { hasText: 'Want It' });
  await expect(row.getByRole('button', { name: 'Getting…' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Get song' })).toHaveCount(0);
});

test('an artist the catalog has not filled in yet loads its albums by itself', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  let asks = 0;
  // the first answer comes back before the catalog has the albums
  await page.route(`**/api/v1/music/artist/${ARTIST_MBID}`, (route) => {
    asks += 1;
    if (asks > 1) return route.fallback();
    return route.fulfill({
      json: {
        mbid: ARTIST_MBID,
        name: 'Fixture Band',
        type: 'Group',
        releaseGroups: [],
      },
    });
  });
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await expect(
    page.getByText('The catalog has not answered for this artist yet')
  ).toBeVisible();
  // no Try again needed
  await expect(page.getByText('You have 1 of 3 albums')).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText('The catalog has not answered for this artist yet')
  ).toHaveCount(0);
});

test('an album cover has a one-tap Get', async ({ page }) => {
  const seen: Seen = { previews: [], saved: [], albumRequests: [] };
  await mockMusic(page, seen);
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  const single = page.locator('.poster', { hasText: 'Release 4' });
  await single.hover();
  await single.getByRole('button', { name: 'Get Release 4' }).first().click();
  await expect.poll(() => seen.albumRequests?.length).toBe(1);
  expect(seen.albumRequests?.[0]).toMatchObject({
    mediaId: rg(4, 'Single').id,
  });
});

test('catalog lookups send spaces as %20, never +', async ({ page }) => {
  await mockMusic(page, { previews: [], saved: [] });
  const sent: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/\/api\/v1\/(search|discover\/music)\?/.test(url)) sent.push(url);
  });
  // a two-word genre from a Home shelf, with the catalog open
  await page.goto(testAppPath('/music?catalog=1&genre=hip%20hop'));
  await expect
    .poll(() => sent.find((url) => url.includes('/discover/music?')))
    .toContain('genre=hip%20hop');
  // the artist filter's lookup
  await page
    .getByRole('searchbox', { name: 'Artist', exact: true })
    .fill('Daft Punk');
  await expect
    .poll(() => sent.find((url) => url.includes('type=artist')))
    .toContain('query=Daft%20Punk');
  // the Search page's Music scope
  await page.goto(testAppPath('/search?q=kind%20of%20blue&f=music'));
  await expect
    .poll(() => sent.find((url) => url.includes('type=music')))
    .toContain('query=kind%20of%20blue');
  for (const url of sent) expect(new URL(url).search).not.toContain('+');
});

test('typing a search asks once, and keeps only the finished word', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  const searches: string[] = [];
  await page.route('**/api/v1/music/search?**', (route) => {
    searches.push(new URL(route.request().url()).search);
    return route.fulfill({
      json: {
        artists: [],
        albums: [],
        tracks: [track('Creep', 'Radiohead', false)],
        top: null,
      },
    });
  });
  await page.goto(testAppPath('/music'));
  await expect(page.locator('li', { hasText: 'Missing Song' })).toBeVisible();
  await page
    .getByRole('searchbox')
    .first()
    .pressSequentially('radiohead', { delay: 40 });
  await expect(page.locator('li', { hasText: 'Creep' })).toBeVisible();
  // typing pauses long enough to count as finished: it joins Recent searches
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          localStorage.getItem('lumen-music-recent-searches:1')
        ),
      { timeout: 5000 }
    )
    .toBe(JSON.stringify(['radiohead']));
  expect(searches).toHaveLength(1);
  expect(searches[0]).toContain('q=radiohead');
});

test('each song keeps its own request state, and a failed one can be asked again', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route('**/api/v1/music/discover/trending', (route) =>
    route.fulfill({
      json: {
        tracks: [
          track('First Wish', 'Wish Artist', false),
          track('Second Wish', 'Wish Artist', false),
        ],
        albums: [],
        artists: [],
      },
    })
  );
  const pending: ((ok: boolean) => void)[] = [];
  await page.route('**/api/v1/music/track-requests', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const ok = await new Promise<boolean>((resolve) => pending.push(resolve));
    return ok
      ? route.fulfill({ json: { results: [{ status: 'pending' }] } })
      : route.fulfill({ status: 500, json: { message: 'Aurral is down' } });
  });
  await page.goto(testAppPath('/music'));
  const first = page.locator('li', { hasText: 'First Wish' });
  const second = page.locator('li', { hasText: 'Second Wish' });
  await first.getByRole('button', { name: /^Get$/ }).click();
  await second.getByRole('button', { name: /^Get$/ }).click();
  await expect.poll(() => pending.length).toBe(2);
  // both stay busy: asking for the second does not free the first
  await expect(
    first.getByRole('button', { name: /Requesting/ })
  ).toBeDisabled();
  await expect(
    second.getByRole('button', { name: /Requesting/ })
  ).toBeDisabled();
  pending[0](true);
  await expect(first.getByText('Requested')).toBeVisible();
  await expect(
    second.getByRole('button', { name: /Requesting/ })
  ).toBeDisabled();
  pending[1](false);
  await expect(second.getByRole('button', { name: /^Get$/ })).toBeEnabled();
  await expect(second.getByText('Requested')).toHaveCount(0);
});

test('downloads that failed are listed on Activity', async ({ page }) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route('**/api/v1/music/activity', (route) =>
    route.fulfill({
      json: {
        active: [],
        queued: [],
        queuedTotal: 0,
        recent: [],
        failed: [
          activityItem(
            'f1',
            'Broken Song',
            'Broken Artist',
            'failed',
            'Failed',
            null
          ),
        ],
        failedTotal: 5,
      },
    })
  );
  await page.goto(testAppPath('/music?tab=activity'));
  await expect(
    page.getByRole('heading', { name: 'Could not download (5)' })
  ).toBeVisible();
  await expect(
    page.locator('.music-act-row', { hasText: 'Broken Song' })
  ).toContainText('Failed');
});

test('the album More menu closes with Esc or a tap outside it', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  const summary = page.locator('summary', { hasText: /^More$/ });
  const menu = page.locator('.music-more-menu');
  await summary.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(summary).toBeFocused();
  await summary.click();
  await expect(menu).toBeVisible();
  await page.locator('main h1').click();
  await expect(menu).toBeHidden();
});

test('a Home genre shelf opens Music on that genre', async ({ page }) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route('**/api/v1/music/discover/genre?**', (route) =>
    route.fulfill({
      json: {
        tag: 'indie',
        artists: [
          { mbid: null, name: 'Genre Artist', image: null, inLibrary: false },
        ],
      },
    })
  );
  await page.goto(testAppPath('/music?genre=indie&sort=ranked'));
  await expect(page.getByRole('button', { name: 'Indie' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByText('Genre Artist')).toBeVisible();
});

test('a pasted Spotify playlist link opens Import Playlist with the link filled in', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  const link = 'https://open.spotify.com/playlist/abc123';
  await page.route('**/api/v1/music/search?**', (route) =>
    route.fulfill({
      json: {
        artists: [],
        albums: [],
        tracks: [],
        top: null,
        link: { type: 'playlist', provider: 'spotify', id: 'abc123' },
      },
    })
  );
  await page.goto(testAppPath(`/music?q=${encodeURIComponent(link)}`));
  await expect(page).toHaveURL(/\/music\/playlist-import\?url=/);
  await expect(
    page.getByRole('textbox', { name: 'Spotify or YouTube Playlist URL' })
  ).toHaveValue(link);
});

// --- podcasts (Audiobookshelf) -------------------------------------------------

test('a trending song owned on another album shows Play, not Get', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route('**/api/v1/music/discover/trending', (route) =>
    route.fulfill({
      json: {
        // SeerrNG marks it owned: it is kept on a compilation
        tracks: [
          { ...track('Boston', 'STELLA LEFTY', true), albumTitle: null },
        ],
        albums: [],
        artists: [],
      },
    })
  );
  await page.goto(testAppPath('/music'));
  const row = page.locator('li', { hasText: 'Boston' });
  await expect(row.getByRole('link', { name: /Play Boston/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Get$/ })).toHaveCount(0);
});

test('an album song owned on another release plays and counts as owned', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(`**/api/v1/music/${ALBUM_MBID}`, (route) =>
    route.fulfill({
      json: {
        id: ALBUM_MBID,
        title: 'Boston',
        type: 'Single',
        artist: { id: 'artist-1', name: 'STELLA LEFTY' },
        tracks: [
          {
            position: 1,
            name: 'Boston',
            length: 180000,
            recordingMbid: 'rec-1',
          },
          {
            position: 2,
            name: 'Slow Dancin',
            length: 200000,
            recordingMbid: 'rec-2',
          },
        ],
        trackAvailability: { mp3: [], flac: [], elsewhere: ['rec-1'] },
      },
    })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  await expect(page.getByText('1 of 2 songs in your library')).toBeVisible();
  const boston = page.locator('li', { hasText: 'Boston' }).last();
  await expect(boston.getByRole('link', { name: /Play Boston/ })).toBeVisible();
  await expect(boston.getByRole('button', { name: 'Get song' })).toHaveCount(0);
  await expect(
    page
      .locator('li', { hasText: 'Slow Dancin' })
      .getByRole('button', { name: 'Get song' })
  ).toBeVisible();
  // the header still offers the missing song, not the whole single
  await expect(
    page.getByRole('button', { name: /Get the 1 missing songs/ }).first()
  ).toBeVisible();
});

test('an album with every song owned somewhere shows the owned state', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(`**/api/v1/music/${ALBUM_MBID}`, (route) =>
    route.fulfill({
      json: {
        id: ALBUM_MBID,
        title: 'Half Album',
        type: 'Album',
        artist: { id: 'artist-1', name: 'Half Artist' },
        tracks: [
          { position: 1, name: 'Have It', length: 1, recordingMbid: 'rec-1' },
          { position: 2, name: 'Want It', length: 1, recordingMbid: 'rec-2' },
        ],
        trackAvailability: { mp3: [], flac: ['rec-1'], elsewhere: ['rec-2'] },
      },
    })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  await expect(page.getByText('In library').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Get / })).toHaveCount(0);
  await expect(
    page
      .locator('li', { hasText: 'Want It' })
      .getByRole('link', { name: /Play Want It/ })
  ).toBeVisible();
});

const activeRequests = (results: Record<string, unknown>[]) => ({
  pageInfo: { total: results.length, take: 100, skip: 0 },
  results,
});

test('a requested song stays requested after a reload on the album page and on Discover', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(
    (url) =>
      url.pathname.endsWith('/api/v1/music/track-requests') &&
      url.searchParams.get('filter') === 'active',
    (route) =>
      route.fulfill({
        json: activeRequests([
          {
            id: 5,
            status: 'searching',
            artist: 'Half Artist',
            title: 'Want It',
          },
          {
            id: 6,
            status: 'pending',
            artist: 'Other Artist',
            title: 'Missing Song',
          },
        ]),
      })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  const row = page.locator('li', { hasText: 'Want It' });
  await expect(row.getByRole('button', { name: 'Getting…' })).toBeDisabled();
  await page.reload();
  await expect(row.getByRole('button', { name: 'Getting…' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Get song' })).toHaveCount(0);

  await page.goto(testAppPath('/music'));
  const missing = page.locator('li', { hasText: 'Missing Song' });
  await expect(missing.getByText('Requested')).toBeVisible();
  await page.reload();
  await expect(missing.getByText('Requested')).toBeVisible();
  await expect(missing.getByRole('button', { name: /^Get$/ })).toHaveCount(0);
});

test('a song whose request just completed never falls back to Get', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(
    (url) =>
      url.pathname.endsWith('/api/v1/music/track-requests') &&
      url.searchParams.get('filter') === null &&
      url.searchParams.get('scope') === 'all',
    (route) =>
      route.fulfill({
        json: activeRequests([
          {
            id: 7,
            status: 'completed',
            artist: 'Other Artist',
            title: 'Missing Song',
            updatedAt: new Date().toISOString(),
          },
          {
            id: 8,
            status: 'completed',
            artist: 'Busy Artist',
            title: 'Old Song',
            updatedAt: '2020-01-01T00:00:00.000Z',
          },
        ]),
      })
  );
  await page.goto(testAppPath('/music'));
  const missing = page.locator('li', { hasText: 'Missing Song' });
  await expect(missing.getByText('Requested')).toBeVisible();
  await expect(missing.getByRole('button', { name: /^Get$/ })).toHaveCount(0);
});

async function mockPodcasts(
  page: Page,
  seen: { subscribed: unknown[]; downloads: unknown[]; auto: unknown[] }
) {
  // registered after mockMusic, so these answers win for /podcast paths
  await page.route('**/api/v1/podcast/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen(?=\/)/, '').slice(7);
    const method = route.request().method();
    if (path === '/podcast/status')
      return route.fulfill({
        json: {
          configured: true,
          libraryName: 'Podcasts',
          externalUrl: 'https://abs.example.com',
          canManage: true,
          canManageCleanup: true,
        },
      });
    if (path === '/podcast/genres')
      return route.fulfill({
        json: {
          genres: [
            { id: 1489, name: 'News' },
            { id: 1303, name: 'Comedy' },
          ],
        },
      });
    if (path === '/podcast/discover') {
      const genre = url.searchParams.get('genre');
      return route.fulfill({
        json: {
          genre: genre ? Number(genre) : null,
          results: [
            {
              itunesId: 3,
              title: genre === '1303' ? 'Laugh Track' : 'Chart Topper',
              author: 'Fixture Charts',
              coverUrl: null,
              feedUrl: 'https://feeds.example.com/top',
              genres: ['News'],
              episodeCount: 300,
              explicit: false,
              inLibrary: false,
              libraryItemId: null,
            },
          ],
        },
      });
    }
    if (path === '/podcast/latest')
      return route.fulfill({
        json: {
          episodes: [
            {
              id: 'ep-1',
              title: 'Today in Brief',
              publishedAt: '2026-11-21T10:00:00.000Z',
              durationSeconds: 620,
              description: null,
              podcastId: 'show-1',
              podcastTitle: 'Morning Brief',
              podcastAuthor: 'Fixture Radio',
              coverUrl: '/api/v1/podcast/cover/show-1',
              openUrl: 'https://abs.example.com/item/show-1',
            },
          ],
        },
      });
    if (path === '/podcast/activity')
      return route.fulfill({
        json: {
          downloading: [
            {
              title: 'Older Brief',
              podcastId: 'show-1',
              podcastTitle: 'Morning Brief',
            },
          ],
          queued: [],
        },
      });
    // the server's validator caps limit at 100
    if (
      path === '/podcast/library' &&
      Number(url.searchParams.get('limit')) > 100
    )
      return route.fulfill({
        status: 400,
        json: { message: 'limit must be <= 100' },
      });
    if (path === '/podcast/library')
      return route.fulfill({
        json: {
          total: 1,
          page: 1,
          limit: 96,
          results: [
            {
              id: 'show-1',
              title: 'Morning Brief',
              author: 'Fixture Radio',
              description: 'News in ten minutes.',
              episodeCount: 2,
              autoDownload: true,
              genres: ['News'],
              coverUrl: '/api/v1/podcast/cover/show-1',
              openUrl: 'https://abs.example.com/item/show-1',
            },
          ],
        },
      });
    if (path === '/podcast/search')
      return route.fulfill({
        json: {
          results: [
            {
              itunesId: 1,
              title: 'Morning Brief',
              author: 'Fixture Radio',
              coverUrl: null,
              feedUrl: 'https://feeds.example.com/brief',
              episodeCount: 40,
              inLibrary: true,
              libraryItemId: 'show-1',
            },
            {
              itunesId: 2,
              title: 'Deep Dive',
              author: 'Fixture Studio',
              coverUrl: null,
              feedUrl: 'https://feeds.example.com/deep',
              episodeCount: 12,
              inLibrary: false,
              libraryItemId: null,
            },
          ],
        },
      });
    if (path === '/podcast/feed')
      return route.fulfill({
        json: {
          title: 'Deep Dive',
          author: 'Fixture Studio',
          description: 'Long conversations.',
          imageUrl: null,
          feedUrl: 'https://feeds.example.com/deep',
          episodes: [
            {
              key: 'deep-2',
              title: 'Second Dive',
              publishedAt: '2026-11-20T10:00:00.000Z',
              durationSeconds: 3600,
              description: 'Part two.',
            },
          ],
        },
      });
    if (path === '/podcast/subscribe') {
      seen.subscribed.push(route.request().postDataJSON());
      return route.fulfill({
        json: { id: 'show-2', title: 'Deep Dive', queued: 3 },
      });
    }
    if (path === '/podcast/library/show-1/available')
      return route.fulfill({
        json: {
          episodes: [
            {
              key: 'brief-old',
              title: 'Older Brief',
              publishedAt: '2026-11-18T10:00:00.000Z',
              durationSeconds: 600,
              description: null,
            },
          ],
        },
      });
    if (path === '/podcast/library/show-1/download') {
      seen.downloads.push(route.request().postDataJSON());
      return route.fulfill({ json: { queued: 1 } });
    }
    if (path === '/podcast/library/show-1/downloads')
      return route.fulfill({ json: { downloading: [], queued: 0 } });
    if (path === '/podcast/library/show-1/follow' && method === 'DELETE') {
      seen.auto.push({
        unfollow: true,
        remove: new URL(route.request().url()).searchParams.get('remove'),
      });
      return route.fulfill({ json: { following: false } });
    }
    if (path === '/podcast/library/show-2/available')
      return route.fulfill({ json: { episodes: [] } });
    if (
      path === '/podcast/library/show-1' ||
      path === '/podcast/library/show-2'
    )
      return route.fulfill({
        json: {
          id: path.slice(-6),
          title: path.endsWith('1') ? 'Morning Brief' : 'Deep Dive',
          author: 'Fixture Radio',
          description: 'News in ten minutes.',
          episodeCount: 1,
          autoDownload: true,
          follow: { linked: true, following: true, followers: 2 },
          coverUrl: '/api/v1/podcast/cover/show-1',
          openUrl: 'https://abs.example.com/item/show-1',
          episodes: [
            {
              id: 'ep-1',
              title: 'Today in Brief',
              description: 'The headlines.',
              publishedAt: '2026-11-21T10:00:00.000Z',
              durationSeconds: 620,
              openUrl: 'https://abs.example.com/item/show-1',
              played: true,
            },
          ],
        },
      });
    return route.fulfill({ status: 404, json: { message: 'Not found' } });
  });
}

test('Podcasts is its own section with Discover, search, your shows and activity', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, { subscribed: [], downloads: [], auto: [] });
  // the old tab on the music page sends people to the new section
  await page.goto(testAppPath('/music?tab=podcasts'));
  await expect(page).toHaveURL(/\/podcasts$/);
  await expect(
    page.getByRole('heading', { name: 'Podcasts', level: 1 })
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Discover' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  // Discover is for finding shows: a genre rail, the charts and category rows,
  // not the shows you already have
  await expect(page.getByText('Today in Brief')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'More News shows' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Top podcasts' })
  ).toBeVisible();
  // category rows load as they come near the screen
  await expect(async () => {
    await page
      .locator('.pod-rail-wait')
      .first()
      .scrollIntoViewIfNeeded({ timeout: 500 })
      .catch(() => undefined);
    await expect(
      page.getByRole('heading', { name: 'Top in Comedy' })
    ).toBeVisible({ timeout: 500 });
  }).toPass();
  await expect(page.getByText('Chart Topper').first()).toBeVisible();
  await page.getByRole('button', { name: 'Comedy' }).click();
  await expect(
    page.getByRole('heading', { name: 'Top in Comedy' })
  ).toHaveCount(1);
  await expect(page.getByText('Laugh Track').first()).toBeVisible();

  await page.getByRole('tab', { name: /Your shows/ }).click();
  await expect(page.getByText('Fixture Radio · 2 downloaded')).toBeVisible();
  // new episodes of your shows live here
  await expect(page.getByText('Today in Brief')).toBeVisible();
  await page.getByRole('tab', { name: /Activity/ }).click();
  await expect(page.getByText('Older Brief')).toBeVisible();

  await page.goto(testAppPath('/podcasts?q=dive'));
  await expect(page.getByText('Deep Dive').first()).toBeVisible();
  await expect(page.getByText('Fixture Studio · 12 episodes')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'In your podcasts' })
  ).toBeVisible();
  // the one already in the library opens its page; the new one opens a preview
  await expect(
    page.locator('a[href*="/podcasts/show-1"]').first()
  ).toBeAttached();
  await expect(
    page.locator('a[href*="/podcasts/preview?feed="]').first()
  ).toBeAttached();
});

for (const [
  locale,
  expectedTitle,
  expectedCategories,
  expectedTop,
  discoverTab,
  openLibrary,
  expectedNews,
  expectedComedy,
  expectedMoreHeading,
  expectedEpisodeCount,
  expectedBusiness,
  expectedTechnology,
] of [
  [
    'fr',
    'Podcasts',
    'Catégories',
    'Meilleurs podcasts',
    'Découvrir',
    'Ouvrir Audiobookshelf',
    'Actualités',
    'Comédie',
    'Plus d’émissions Actualités',
    'Fixture Charts · 300 épisodes',
    'Affaires',
    'Technologie',
  ],
  [
    'ar',
    'البودكاست',
    'الفئات',
    'أفضل البودكاست',
    'اكتشف',
    'فتح Audiobookshelf',
    'الأخبار',
    'كوميديا',
    'المزيد من برامج الأخبار',
    'Fixture Charts · 300 حلقة',
    'الأعمال',
    'التقنية',
  ],
] as const) {
  test(`podcast discovery uses the saved ${locale} locale`, async ({
    page,
  }, info) => {
    await mockMusic(page, { previews: [], saved: [] }, locale);
    await mockPodcasts(page, { subscribed: [], downloads: [], auto: [] });
    await page.route('**/api/v1/podcast/genres', (route) =>
      route.fulfill({
        json: {
          genres: [
            { id: 1303, name: 'Comedy' },
            { id: 1318, name: 'Technology' },
            { id: 1321, name: 'Business' },
            { id: 1489, name: 'News' },
          ],
        },
      })
    );
    await page.goto(testAppPath('/podcasts'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', { name: expectedTitle, level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: expectedTop })
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: expectedCategories })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: expectedNews })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: expectedComedy })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: expectedBusiness })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: expectedTechnology })
    ).toBeVisible();
    await expect(page.getByText(expectedEpisodeCount).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: expectedMoreHeading })
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: discoverTab })).toBeVisible();
    await expect(page.getByRole('link', { name: openLibrary })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    if (['iphone', 'android'].includes(info.project.name)) {
      const genreRail = page.locator('.pod-genres');
      expect(
        await genreRail.evaluate(
          (element) => element.scrollWidth > element.clientWidth
        )
      ).toBe(true);
      const firstGenre = page.getByRole('button', { name: expectedNews });
      await firstGenre.scrollIntoViewIfNeeded();
      const [railBox, genreBox] = await Promise.all([
        genreRail.boundingBox(),
        firstGenre.boundingBox(),
      ]);
      expect(railBox).not.toBeNull();
      expect(genreBox).not.toBeNull();
      expect(genreBox!.x).toBeGreaterThanOrEqual(railBox!.x - 1);
      expect(genreBox!.x + genreBox!.width).toBeLessThanOrEqual(
        railBox!.x + railBox!.width + 1
      );
    }
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    if (['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: info.outputPath(`podcast-discovery-${locale}.png`),
        fullPage: false,
      });
  });
}

test('following a podcast asks first, then opens the show', async ({
  page,
}) => {
  const seen = { subscribed: [] as unknown[], downloads: [], auto: [] };
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, seen);
  await page.goto(
    testAppPath(
      `/podcasts/preview?feed=${encodeURIComponent('https://feeds.example.com/deep')}`
    )
  );

  await expect(page.getByRole('heading', { name: 'Deep Dive' })).toBeVisible();
  await expect(page.getByText('Second Dive')).toBeVisible();
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Follow Deep Dive?' })
    .getByRole('button', { name: 'Follow' })
    .click();
  await expect.poll(() => seen.subscribed.length).toBe(1);
  expect(seen.subscribed[0]).toEqual({
    feedUrl: 'https://feeds.example.com/deep',
    autoDownload: true,
    downloadLatest: 3,
  });
  await expect(page).toHaveURL(/\/podcasts\/show-2$/);
});

test('getting one episode of a show not in yet adds it without following', async ({
  page,
}) => {
  const seen = { subscribed: [] as unknown[], downloads: [], auto: [] };
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, seen);
  await page.goto(
    testAppPath(
      `/podcasts/preview?feed=${encodeURIComponent('https://feeds.example.com/deep')}`
    )
  );

  await expect(page.getByText('Second Dive')).toBeVisible();
  await page.getByRole('button', { name: 'Get', exact: true }).click();
  await expect.poll(() => seen.subscribed.length).toBe(1);
  expect(seen.subscribed[0]).toEqual({
    feedUrl: 'https://feeds.example.com/deep',
    autoDownload: false,
    episodeKeys: ['deep-2'],
  });
  await expect(page).toHaveURL(/\/podcasts\/show-2$/);
});

test('a podcast page plays in Audiobookshelf, gets an episode and unfollows', async ({
  page,
  isMobile,
}) => {
  const seen = {
    subscribed: [],
    downloads: [] as unknown[],
    auto: [] as unknown[],
  };
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, seen);
  await page.goto(testAppPath('/podcasts/show-1'));

  await expect(
    page.getByRole('heading', { name: 'Morning Brief' })
  ).toBeVisible();
  // phones hide the tab bar on a show page, so it needs the floating back button
  if (isMobile)
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  const listen = page.getByRole('link', { name: 'Listen in Audiobookshelf' });
  await expect(listen).toHaveAttribute(
    'href',
    'https://abs.example.com/item/show-1'
  );
  await expect(listen).toHaveAttribute('target', 'lumen-podcast-player');
  await expect(page.getByText('Today in Brief')).toBeVisible();

  const older = page.locator('li', { hasText: 'Older Brief' });
  await older.getByRole('button', { name: 'Get' }).click();
  await expect.poll(() => seen.downloads.length).toBe(1);
  expect(seen.downloads[0]).toEqual({ keys: ['brief-old'] });

  const follow = page.getByRole('button', { name: 'Following' });
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await follow.click();
  await page
    .getByRole('alertdialog', { name: 'Stop following Morning Brief?' })
    .getByRole('button', { name: 'Unfollow' })
    .click();
  await expect.poll(() => seen.auto.length).toBe(1);
  // others still follow it, so this is a plain unfollow
  expect(seen.auto[0]).toEqual({ unfollow: true, remove: null });
  await expect(
    page.getByRole('button', { name: 'Follow', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');
});

test('a podcast can remove played episodes once newer ones are in, after asking', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, { subscribed: [], downloads: [], auto: [] });
  const cleanup: unknown[] = [];
  await page.route(
    '**/api/v1/podcast/library/show-1/cleanup',
    async (route) => {
      cleanup.push(route.request().postDataJSON());
      await route.fulfill({ json: route.request().postDataJSON() });
    }
  );
  await page.goto(testAppPath('/podcasts/show-1'));

  // a finished episode is marked
  await expect(
    page.locator('li', { hasText: 'Today in Brief' }).getByText('Played')
  ).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'Remove played episodes' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  const sheet = page.getByRole('alertdialog', {
    name: 'Remove played episodes of Morning Brief?',
  });
  await sheet.getByRole('button', { name: 'Turn on' }).click();
  await expect.poll(() => cleanup.length).toBe(1);
  expect(cleanup[0]).toEqual({ enabled: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // turning it off needs no confirmation
  await toggle.click();
  await expect.poll(() => cleanup.length).toBe(2);
  expect(cleanup[1]).toEqual({ enabled: false });
});

test('a search with reserved characters is sent percent-encoded', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.goto(testAppPath('/music'));
  const sent = page.waitForRequest((request) =>
    request.url().includes('/music/search?q=p')
  );
  await page.getByRole('searchbox').first().fill('p*rnstar');
  const url = (await sent).url();
  expect(url).toContain('q=p%2Arnstar');
  expect(url).not.toContain('*');
});

// --- the same state on every page (consistency audit) -----------------------------

const PARTIAL_GROUP = {
  ...rg(2, 'Album'),
  partial: true,
  libraryTrackCount: 10,
  libraryAvailableTrackCount: 1,
};

test('an album the library has part of shows as partly owned on the artist page and is not asked for again', async ({
  page,
}) => {
  const seen: Seen = {
    previews: [],
    saved: [],
    albumRequests: [],
    requestAllPlan: {
      albums: [planItem(rg(3, 'Album'))],
      epsAndSingles: [planItem(rg(4, 'Single'))],
      skipped: [
        {
          ...planItem(rg(2, 'Album')),
          reasonCode: 'partial',
          reason: 'You have part of it; its page offers the missing songs.',
        },
      ],
    },
  };
  await mockMusic(page, seen);
  await page.route(`**/api/v1/music/artist/${ARTIST_MBID}`, (route) =>
    route.fulfill({
      json: {
        mbid: ARTIST_MBID,
        name: 'Fixture Band',
        type: 'Group',
        country: 'US',
        beginYear: 2010,
        endYear: null,
        genres: [],
        bio: null,
        releaseGroups: [
          rg(1, 'Album', true),
          PARTIAL_GROUP,
          rg(3, 'Album'),
          rg(4, 'Single'),
        ],
      },
    })
  );
  await page.goto(testAppPath(`/artist/${ARTIST_MBID}`));
  await expect(
    page.getByText('You have 2 of 3 albums, 1 in part')
  ).toBeVisible();
  await expect(
    page.locator('.poster', { hasText: 'Release 2' }).locator('.glyph')
  ).toHaveAttribute('title', '1 of 10 songs');
  // the part-owned album is not in "Get all": its page offers the missing songs
  await page
    .getByRole('button', { name: 'Get the 2 missing releases' })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Get them' })
    .click();
  await expect.poll(() => seen.albumRequests?.length).toBe(2);
  expect(seen.albumRequests).toEqual([
    { mediaType: 'music', mediaId: rg(3, 'Album').id },
    { mediaType: 'music', mediaId: rg(4, 'Single').id },
  ]);
});

test('search shows a part-owned album once, with its library state', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  const partial = {
    mbid: ALBUM_MBID,
    title: 'Half Owned Album',
    artistName: 'Half Artist',
    artistMbid: null,
    primaryType: 'Album',
    releaseDate: '2019',
    coverUrl: null,
    inLibrary: false,
    partial: true,
    libraryTrackCount: 10,
    libraryAvailableTrackCount: 1,
  };
  await page.route(
    (url) => url.pathname.endsWith('/api/v1/music/search'),
    (route) =>
      route.fulfill({
        json: {
          artists: [],
          albums: [partial],
          tracks: [],
          top: { type: 'album', ...partial },
          degraded: false,
          // the server lists it once: not again under "In your library"
          library: { artists: [], albums: [], tracks: [] },
          link: null,
          correctedQuery: null,
          parsed: null,
          topArtistAlbumsFromArtist: false,
        },
      })
  );
  await page.goto(testAppPath('/music?q=half%20owned'));
  const card = page.locator('.poster', { hasText: 'Half Owned Album' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.glyph')).toHaveAttribute(
    'title',
    '1 of 10 songs'
  );
  await expect(
    page.getByRole('heading', { name: 'In your library' })
  ).toHaveCount(0);
  // the top result does not offer the whole album as if none of it were here
  await expect(page.getByRole('button', { name: 'Request album' })).toHaveCount(
    0
  );
});

test('an album page counts the songs the library has, even when the edition ids differ', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route(`**/api/v1/music/${ALBUM_MBID}`, (route) =>
    route.fulfill({
      json: {
        id: ALBUM_MBID,
        title: 'Big Album',
        type: 'Album',
        artist: { id: 'artist-1', name: 'Big Artist' },
        tracks: [
          { position: 1, name: 'One', length: 180000, recordingMbid: 'r-1' },
          { position: 2, name: 'Two', length: 180000, recordingMbid: 'r-2' },
        ],
        // the library's files carry another edition's ids
        trackAvailability: { flac: ['other-edition-1'] },
        libraryAlbum: {
          status: 'partial',
          trackCount: 22,
          availableTrackCount: 21,
        },
      },
    })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  await expect(page.getByText('21 of 22 songs in your library')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Get the 1 missing songs/ }).first()
  ).toBeVisible();
});

test('a requested song marks its single as requested on the album page', async ({
  page,
}) => {
  const seen: Seen = { previews: [], saved: [], trackRequests: [] };
  await mockMusic(page, seen);
  await page.route(`**/api/v1/music/${ALBUM_MBID}`, (route) =>
    route.fulfill({
      json: {
        id: ALBUM_MBID,
        title: 'Solo Song',
        type: 'Single',
        artist: { id: 'artist-1', name: 'Solo Artist' },
        tracks: [
          {
            position: 1,
            name: 'Solo Song',
            length: 180000,
            recordingMbid: 'r-solo',
          },
        ],
        trackAvailability: {},
      },
    })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  await expect(
    page.getByRole('button', { name: 'Get single' }).first()
  ).toBeVisible();
  await page
    .locator('li', { hasText: 'Solo Song' })
    .getByRole('button', { name: 'Get song' })
    .click();
  await expect.poll(() => seen.trackRequests?.length).toBe(1);
  // the single is its song: no second request for the same thing
  await expect(page.getByRole('button', { name: 'Get single' })).toHaveCount(0);
  // the header says Requested, the same as an album asked for elsewhere
  await expect(
    page.locator('.dstatus').getByText('Requested', { exact: true })
  ).toBeVisible();
});

test('a song downloading under a curly apostrophe shows Downloading on the straight-quoted row', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route('**/api/v1/music/discover/trending', (route) =>
    route.fulfill({
      json: {
        tracks: [
          {
            ...track("Why Won't They Talk to Me?", 'Tame Impala', false),
            albumTitle: 'Live at Lowlands',
          },
          {
            ...track('Elephant', 'Tame Impala', false),
            albumTitle: 'Lonerism',
          },
        ],
        albums: [],
        artists: [],
      },
    })
  );
  await page.route('**/api/v1/music/activity', (route) =>
    route.fulfill({
      json: {
        active: [
          {
            ...activityItem(
              'a1',
              'Why Won’t They Talk to Me?',
              'Tame Impala',
              'processing',
              'Downloading',
              null
            ),
            albumName: 'Live at Lowlands',
          },
          // the live version downloading does not mark the studio song
          {
            ...activityItem(
              'a2',
              'Elephant',
              'Tame Impala',
              'processing',
              'Downloading',
              null
            ),
            albumName: 'Live at Lowlands',
          },
        ],
        queued: [],
        queuedTotal: 0,
        recent: [],
        failedTotal: 0,
      },
    })
  );
  await page.goto(testAppPath('/music'));
  await expect(
    page.locator('li', { hasText: 'Talk to Me?' }).getByText('Downloading')
  ).toBeVisible();
  const elephant = page.locator('li', { hasText: 'Elephant' });
  await expect(elephant.getByRole('button', { name: /^Get$/ })).toBeVisible();
  await expect(elephant.getByText('Downloading')).toHaveCount(0);
});

test('an album page turns its songs into Play when their download finishes', async ({
  page,
}) => {
  await page.clock.install();
  await mockMusic(page, { previews: [], saved: [] });
  let finished = false;
  await page.route('**/api/v1/music/activity', (route) =>
    route.fulfill({
      json: {
        active: finished
          ? []
          : [
              {
                ...activityItem(
                  'a1',
                  'Want It',
                  'Half Artist',
                  'processing',
                  'Downloading',
                  null
                ),
                albumName: 'Half Album',
              },
            ],
        queued: [],
        queuedTotal: 0,
        recent: [],
        failedTotal: 0,
      },
    })
  );
  await page.route(`**/api/v1/music/${ALBUM_MBID}`, (route) =>
    route.fulfill({
      json: {
        id: ALBUM_MBID,
        title: 'Half Album',
        type: 'Album',
        artist: { id: 'artist-1', name: 'Half Artist' },
        tracks: [
          {
            position: 1,
            name: 'Have It',
            length: 180000,
            recordingMbid: 'rec-1',
          },
          {
            position: 2,
            name: 'Want It',
            length: 200000,
            recordingMbid: 'rec-2',
          },
        ],
        mediaInfo: finished
          ? { status: 5, downloadStatus: [] }
          : { status: 3, downloadStatus: [] },
        trackAvailability: { flac: finished ? ['rec-1', 'rec-2'] : ['rec-1'] },
      },
    })
  );
  await page.goto(testAppPath(`/music/${ALBUM_MBID}`));
  const want = page.locator('li', { hasText: 'Want It' });
  await expect(want.getByRole('button', { name: 'Downloading' })).toBeVisible();
  finished = true;
  // the next downloads poll sees it gone: the page asks again by itself
  await page.clock.fastForward(16_000);
  await expect(want.getByRole('link', { name: /Play Want It/ })).toBeVisible();
});

test('a podcast episode still downloading is not offered again on a revisit', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, { subscribed: [], downloads: [], auto: [] });
  await page.route('**/api/v1/podcast/library/show-1/downloads', (route) =>
    route.fulfill({
      json: { downloading: [{ title: 'Older Brief' }], queued: 1 },
    })
  );
  await page.route(
    (url) => url.pathname.endsWith('/api/v1/podcast/library/show-1/available'),
    (route) =>
      // the server leaves out episodes in the download queue
      route.fulfill({ json: { episodes: [], total: 0 } })
  );
  await page.goto(testAppPath('/podcasts/show-1'));
  await expect(page.getByText('Downloading 2')).toBeVisible();
  await expect(
    page.locator('li', { hasText: 'Older Brief' }).getByRole('button', {
      name: 'Get',
    })
  ).toHaveCount(0);
});

test('a show you only got episodes from can be taken off your shows', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await mockPodcasts(page, { subscribed: [], downloads: [], auto: [] });
  const removed: (string | null)[] = [];
  await page.route('**/api/v1/podcast/library/show-2**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/show-2/follow')) {
      removed.push(url.searchParams.get('remove'));
      return route.fulfill({ json: { following: false, removed: true } });
    }
    if (url.pathname.endsWith('/show-2'))
      return route.fulfill({
        json: {
          id: 'show-2',
          title: 'Deep Dive',
          author: 'Fixture Studio',
          description: null,
          episodeCount: 1,
          // one episode was got; new ones do not download
          autoDownload: false,
          follow: { linked: true, following: true, followers: 1 },
          coverUrl: '/api/v1/podcast/cover/show-2',
          openUrl: 'https://abs.example.com/item/show-2',
          episodes: [],
        },
      });
    return route.fallback();
  });
  await page.goto(testAppPath('/podcasts/show-2'));

  await expect(
    page.getByRole('button', { name: 'Follow', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Remove from my shows' }).click();
  const sheet = page.getByRole('alertdialog', {
    name: 'Remove Deep Dive from your shows?',
  });
  // nobody else has it: it goes for everyone, so the sheet says so
  await expect(sheet).toContainText('Nobody else has this show');
  await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect.poll(() => removed).toEqual(['1']);
  await expect(page).toHaveURL(/\/podcasts\?tab=shows$/);
});

test('the Library filter asks the server for matching names', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.goto(testAppPath('/music?tab=library'));
  await expect(
    page.locator('.poster', { hasText: 'Fresh Album' })
  ).toBeVisible();
  const sent = page.waitForRequest((request) =>
    /\/music\/library\?.*q=fresh%20al/.test(request.url())
  );
  await page.getByRole('searchbox', { name: 'Filter' }).fill('fresh al');
  await sent;
  // kept in the address, so Back and reload keep it
  await expect(page).toHaveURL(/libq=fresh/);
});

test('a download that failed says why, when Aurral says', async ({ page }) => {
  await mockMusic(page, { previews: [], saved: [] });
  await page.route('**/api/v1/music/activity', (route) =>
    route.fulfill({
      json: {
        active: [],
        queued: [],
        queuedTotal: 0,
        recent: [],
        failed: [
          {
            ...activityItem(
              'f1',
              'Broken Song',
              'Broken Artist',
              'failed',
              'Failed',
              null
            ),
            reason: 'No matching files found on Soulseek',
          },
          {
            ...activityItem(
              'f2',
              'Missing Song',
              'Missing Artist',
              'failed',
              'Failed',
              null
            ),
            // Aurral's own wording, one part per source
            reason:
              'Soulseek: No suitable slskd search results; yt-dlp: No suitable search results; Usenet: No matching album in the search results',
          },
          {
            ...activityItem(
              'f3',
              'Weak Song',
              'Weak Artist',
              'failed',
              'Failed',
              null
            ),
            // one source found something but turned it down
            reason:
              'Soulseek: No suitable slskd search results; yt-dlp: denied automatically: evidence too weak to accept',
          },
        ],
        failedTotal: 3,
      },
    })
  );
  await page.goto(testAppPath('/music?tab=activity'));
  await expect(
    page.locator('.music-act-row', { hasText: 'Broken Song' })
  ).toContainText('No matching files found on Soulseek');
  // every source found nothing: said plainly, the full text on hover
  const missing = page
    .locator('.music-act-row', { hasText: 'Missing Song' })
    .locator('.music-act-reason');
  await expect(missing).toHaveText('Not found on Soulseek, YouTube, or Usenet');
  await expect(missing).toHaveAttribute('title', /^Soulseek: No suitable/);
  await expect(
    page
      .locator('.music-act-row', { hasText: 'Weak Song' })
      .locator('.music-act-reason')
  ).toHaveText('No good match on Soulseek or YouTube');
});

test('Activity names requested albums in one call and shows song covers', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  const first = 'aaaaaaaa-1111-4111-8111-111111111111';
  const second = 'bbbbbbbb-2222-4222-8222-222222222222';
  const request = (id: number, mbId: string) => ({
    request: {
      id,
      status: 2,
      createdAt: `2026-11-2${id}T10:00:00.000Z`,
      media: { id, mbId, mediaType: 'music', status: 3 },
    },
  });
  await page.route('**/api/v1/request/status?**', (route) =>
    route.fulfill({
      json: { results: [request(1, first), request(2, second)] },
    })
  );
  await page.route('**/api/v1/music/track-requests?**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            id: 9,
            status: 'searching',
            artist: 'Song Artist',
            title: 'Lone Song',
            searchCount: 1,
            lastMatchCount: 0,
            createdAt: '2026-11-23T10:00:00.000Z',
          },
        ],
      },
    })
  );
  const asked: string[] = [];
  await page.route('**/api/v1/music/album-summaries?**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({
      json: {
        results: [
          { id: first, title: 'First Album', artistName: 'Album Artist' },
          { id: second, title: 'Second Album', artistName: 'Album Artist' },
        ],
      },
    });
  });
  // a 1x1 PNG, so the cover loads instead of falling back to the icon
  await page.route('**/api/v1/music/song-art?**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      ),
    })
  );
  const albumPages: string[] = [];
  page.on('request', (sent) => {
    if (new RegExp(`/api/v1/music/(${first}|${second})$`).test(sent.url()))
      albumPages.push(sent.url());
  });
  await page.goto(testAppPath('/music?tab=activity'));

  await expect(page.getByRole('link', { name: 'First Album' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Second Album' })).toBeVisible();
  // one call for both, with the list separator encoded for the API validator
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain(`ids=${first}%2C${second}`);
  // no full album page per row
  expect(albumPages).toEqual([]);
  const songRow = page.locator('li', { hasText: 'Lone Song' });
  await expect(songRow.locator('img')).toHaveAttribute(
    'src',
    /\/api\/v1\/music\/song-art\?artist=Song%20Artist&title=Lone%20Song$/
  );
});

test('with Lidarr instead of Aurral, Music has the same pages and Play goes to Plex', async ({
  page,
}) => {
  await mockMusic(page, { previews: [], saved: [] });
  // registered after mockMusic, so these answers win
  await page.route('**/api/v1/service/music', (route) =>
    route.fulfill({
      json: [{ id: 3, name: 'Lidarr', isDefault: true, backendType: 'lidarr' }],
    })
  );
  await page.route('**/api/v1/music/track-requests/status', (route) =>
    route.fulfill({ json: { aurralConfigured: false } })
  );
  await page.goto(testAppPath('/music'));

  // the same Discover the Aurral setup has, not the catalog browser
  await expect(
    page.getByRole('heading', { name: 'Trending songs' })
  ).toBeVisible();
  const play = page.locator('a.btn', { hasText: 'Play' }).first();
  await expect(play).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\//);
  await expect(page.getByText('Play opens in: Plex')).toBeVisible();
});
