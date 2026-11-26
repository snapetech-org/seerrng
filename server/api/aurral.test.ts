import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import AurralAPI, {
  capReleaseGroups,
  collectLibraryReleaseGroupMbids,
  sanitizeAurralImageUrl,
} from '@server/api/aurral';
import DeezerAPI from '@server/api/deezer';
import cacheManager from '@server/lib/cache';
import axios from 'axios';

type MockableAurral = {
  get: (
    endpoint: string,
    options?: { params?: Record<string, unknown> },
    ttl?: number
  ) => Promise<unknown>;
  post: (endpoint: string, data?: Record<string, unknown>) => Promise<unknown>;
  request: (
    method: string,
    endpoint: string,
    data?: unknown,
    config?: Record<string, unknown>
  ) => Promise<{ status: number; headers?: unknown; data?: unknown }>;
};

const mockGet = (
  implementation: (
    endpoint: string,
    options?: { params?: Record<string, unknown> },
    ttl?: number
  ) => Promise<unknown>
) =>
  mock.method(
    AurralAPI.prototype as unknown as MockableAurral,
    'get',
    implementation
  );

const mockPost = (
  implementation: (
    endpoint: string,
    data?: Record<string, unknown>
  ) => Promise<unknown>
) =>
  mock.method(
    AurralAPI.prototype as unknown as MockableAurral,
    'post',
    implementation
  );

const mockRequest = (implementation: MockableAurral['request']) =>
  mock.method(
    AurralAPI.prototype as unknown as MockableAurral,
    'request',
    implementation
  );

describe('AurralAPI', () => {
  afterEach(() => {
    mock.restoreAll();
    cacheManager.getCache('aurral').flush();
    cacheManager.getCache('deezer').flush();
  });

  it('builds URLs with baseUrl paths and sends X-Api-Key header', () => {
    const url = AurralAPI.buildUrl({
      hostname: 'aurral.local',
      port: 3001,
      useSsl: true,
      baseUrl: '/aurral',
    });
    assert.strictEqual(url, 'https://aurral.local:3001/aurral');

    const client = new AurralAPI({ url, apiKey: 'user-secret-key' });
    const headers = (
      client as unknown as {
        axios: { defaults: { headers: Record<string, unknown> } };
      }
    ).axios.defaults.headers;
    assert.strictEqual(headers['X-Api-Key'], 'user-secret-key');
  });

  it('parses GET /api/health including user identity', async () => {
    const getMock = mockGet(async () => ({
      status: 'ok',
      appVersion: '1.12.0',
      user: { id: 7, username: 'alice', role: 'user' },
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const health = await client.testConnection();

    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/api/health');
    assert.deepStrictEqual(health, {
      status: 'ok',
      appVersion: '1.12.0',
      user: { id: 7, username: 'alice', role: 'user' },
    });
  });

  it('posts POST /api/library/albums/request and returns album.id', async () => {
    const postMock = mockPost(async () => ({
      success: true,
      artist: { id: 42, mbid: 'artist-mbid', name: 'Boards of Canada' },
      album: { id: 99, mbid: 'rg-mbid', title: 'Geogaddi' },
      status: 'queued',
      jobIds: ['job-1'],
      requestGroupId: 'grp-1',
      queued: true,
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const result = await client.requestAlbum({
      albumMbid: 'rg-mbid',
      albumName: 'Geogaddi',
      artistMbid: 'artist-mbid',
      artistName: 'Boards of Canada',
      releaseMbid: 'rel-mbid',
    });

    assert.strictEqual(
      postMock.mock.calls[0].arguments[0],
      '/api/library/albums/request'
    );
    assert.deepStrictEqual(postMock.mock.calls[0].arguments[1], {
      albumMbid: 'rg-mbid',
      albumName: 'Geogaddi',
      artistMbid: 'artist-mbid',
      artistName: 'Boards of Canada',
      releaseMbid: 'rel-mbid',
    });
    assert.strictEqual(result.album.id, 99);
    assert.strictEqual(result.status, 'queued');
  });

  it('accepts the numeric-string album ids Aurral returns', async () => {
    mockPost(async () => ({
      success: true,
      artist: { id: '12', mbid: 'artist-mbid', name: 'Sleep Token' },
      album: { id: '226', mbid: 'rg-mbid', title: 'Take Me Back to Eden' },
      status: 'queued',
      jobIds: ['job-1'],
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const result = await client.requestAlbum({
      albumMbid: 'rg-mbid',
      albumName: 'Take Me Back to Eden',
      artistMbid: 'artist-mbid',
      artistName: 'Sleep Token',
    });

    assert.strictEqual(result.album.id, 226);
    assert.strictEqual(result.artist?.id, 12);
  });

  it('batches POST /api/library/albums/lookup/batch in chunks of 100', async () => {
    const postMock = mockPost(async (_endpoint, body) => {
      const mbids = (body?.mbids ?? []) as string[];
      return Object.fromEntries(
        mbids.map((mbid, index) => [
          mbid,
          index % 2 === 0
            ? {
                inLibrary: true,
                libraryAlbumId: index + 1,
                status: 'available',
                ownedTrackMbids: [`track-${mbid}`],
              }
            : null,
        ])
      );
    });

    const mbids = Array.from({ length: 105 }, (_, i) => `mbid-${i}`);
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const result = await client.lookupAlbums(mbids);

    assert.strictEqual(postMock.mock.callCount(), 2);
    assert.strictEqual(
      postMock.mock.calls[0].arguments[0],
      '/api/library/albums/lookup/batch'
    );
    assert.strictEqual(result['mbid-0']?.libraryAlbumId, 1);
    assert.strictEqual(result['mbid-1'], null);
    assert.strictEqual(result['mbid-104']?.libraryAlbumId, 5);
  });

  it('posts POST /api/library/downloads/track with albumMbid and durationMs', async () => {
    const postMock = mockPost(async () => ({
      success: true,
      queued: true,
      jobId: 'track-job-7',
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const result = await client.requestTrack({
      artistName: 'Daft Punk',
      trackName: 'Voyager',
      albumName: 'Discovery',
      artistMbid: 'artist-1',
      albumMbid: 'album-1',
      durationMs: 227000,
      trackNumber: 10,
    });

    assert.strictEqual(
      postMock.mock.calls[0].arguments[0],
      '/api/library/downloads/track'
    );
    assert.deepStrictEqual(postMock.mock.calls[0].arguments[1], {
      artistName: 'Daft Punk',
      trackName: 'Voyager',
      albumName: 'Discovery',
      artistMbid: 'artist-1',
      albumMbid: 'album-1',
      durationMs: 227000,
      trackNumber: 10,
    });
    assert.strictEqual(result.jobId, 'track-job-7');
    assert.strictEqual(result.queued, true);
  });

  it('reads GET /api/library/albums/:id/status, /api/requests, and /api/library', async () => {
    const getMock = mockGet(async (endpoint) => {
      if (endpoint === '/api/library/albums/55/status') {
        return {
          libraryId: 55,
          status: 'downloading',
          counts: { totalTracks: 10, ownedTracks: 4, missingTracks: 6 },
        };
      }
      if (endpoint === '/api/requests') {
        return [
          {
            id: 'req-1',
            kind: 'track',
            jobId: 'track-job-7',
            status: 'completed',
            artistName: 'Daft Punk',
            trackName: 'Voyager',
          },
        ];
      }
      if (endpoint === '/api/library') {
        return {
          page: 1,
          pageSize: 100,
          total: 1,
          hasMore: false,
          items: [
            {
              id: 55,
              releaseGroupMbid: 'rg-55',
              title: 'Discovery',
            },
          ],
        };
      }
      return {};
    });

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const status = await client.getAlbumStatus(55);
    const activity = await client.getActivity();
    const page = await client.getLibraryAlbumsPage(1, 100);

    assert.strictEqual(getMock.mock.callCount(), 3);
    assert.strictEqual(status.status, 'downloading');
    assert.strictEqual(activity[0].jobId, 'track-job-7');
    assert.strictEqual(page.items[0].releaseGroupMbid, 'rg-55');
  });

  it('sanitizes image URLs with an allowlist, dot boundaries, and no IPs/localhost/http', () => {
    assert.strictEqual(
      sanitizeAurralImageUrl('https://coverartarchive.org/release/1/front.jpg'),
      'https://coverartarchive.org/release/1/front.jpg'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://ia800100.us.archive.org/items/cover.jpg'),
      'https://ia800100.us.archive.org/items/cover.jpg'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://cdn-images.dzcdn.net/images/cover/a.jpg'),
      'https://cdn-images.dzcdn.net/images/cover/a.jpg'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl(
        'https://lastfm.freetls.fastly.net/i/u/300x300/abc.png'
      ),
      'https://lastfm.freetls.fastly.net/i/u/300x300/abc.png'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl(
        '/api/image-proxy?src=https%3A%2F%2Fi.scdn.co%2Fimage%2Fabc'
      ),
      'https://i.scdn.co/image/abc'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('http://coverartarchive.org/release/1/front.jpg'),
      'https://coverartarchive.org/release/1/front.jpg'
    );

    // Lookalike domains must be rejected (including the http coverartarchive bug)
    assert.strictEqual(
      sanitizeAurralImageUrl('https://evilcoverartarchive.org/front.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('http://evilcoverartarchive.org/front.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://notdzcdn.net/cover.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://evil-last.fm/cover.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://attacker.example/cover.jpg'),
      null
    );

    // IP literals and localhost must be rejected
    assert.strictEqual(
      sanitizeAurralImageUrl('https://127.0.0.1/cover.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://1.1.1.1/cover.jpg'),
      null
    );
    assert.strictEqual(sanitizeAurralImageUrl('https://[::1]/cover.jpg'), null);
    assert.strictEqual(
      sanitizeAurralImageUrl('https://localhost/cover.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://sub.localhost/cover.jpg'),
      null
    );

    // Plain http URLs outside coverartarchive.org must be rejected
    assert.strictEqual(
      sanitizeAurralImageUrl('http://dzcdn.net/cover.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('http://archive.org/cover.jpg'),
      null
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('http://example.com/cover.jpg'),
      null
    );
  });

  it('evaluates artist follow status for default and inline monitoring rules', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    let monitoringResponse: unknown = { monitored: true, useDefault: true };
    mockGet(async () => monitoringResponse);

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    // on Aurral's defaults SeerrNG cannot see the rules, and says so
    assert.deepStrictEqual(await client.getArtistFollowStatus(artistMbid), {
      inLibrary: true,
      following: true,
      usesDefaultRules: true,
    });

    monitoringResponse = {
      monitored: true,
      useDefault: false,
      rules: { newReleases: true },
    };
    assert.deepStrictEqual(await client.getArtistFollowStatus(artistMbid), {
      inLibrary: true,
      following: true,
    });

    monitoringResponse = {
      monitored: true,
      useDefault: false,
      rules: { newReleases: false, catalog: 'all' },
    };
    assert.deepStrictEqual(await client.getArtistFollowStatus(artistMbid), {
      inLibrary: true,
      following: false,
    });

    monitoringResponse = { monitored: false, useDefault: true };
    assert.deepStrictEqual(await client.getArtistFollowStatus(artistMbid), {
      inLibrary: true,
      following: false,
    });
  });

  it('follows with "new releases only" rules (never useDefault, never old catalog rules) and preserves rules when unfollowing', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    let monitoringState: Record<string, unknown> | null = null;
    const putPayloads: unknown[] = [];

    mockGet(async () => {
      if (!monitoringState) {
        const err = new Error('Not found') as Error & {
          response: { status: number };
        };
        err.response = { status: 404 };
        throw err;
      }
      return monitoringState;
    });
    const postMock = mockPost(async (_endpoint, body) => {
      monitoringState = (body?.monitoring ?? null) as Record<string, unknown>;
      return {};
    });
    mockRequest(async (method, _endpoint, data) => {
      assert.strictEqual(method, 'PUT');
      putPayloads.push(data);
      const monitoring = (data as { monitoring: Record<string, unknown> })
        .monitoring;
      monitoringState = { ...monitoringState, ...monitoring };
      return { status: 200, data: {} };
    });

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    // 1. Follow artist not yet in library -> one PUT with the name and
    //    explicit new-release rules (never Aurral's defaults, never a POST)
    const added = await client.setArtistFollowing(artistMbid, 'Artist', true);
    assert.strictEqual(postMock.mock.callCount(), 0);
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: {
        monitored: true,
        useDefault: false,
        rules: {
          catalog: 'none',
          newReleases: true,
          types: ['album', 'ep', 'single'],
          extraTypes: [],
          edition: 'standard',
          topTracks: 0,
        },
      },
    });
    assert.deepStrictEqual(added, { inLibrary: true, following: true });

    const followOnly = {
      monitored: true,
      useDefault: false,
      rules: {
        catalog: 'none',
        newReleases: true,
        types: ['album', 'ep', 'single'],
        extraTypes: [],
        edition: 'standard',
        topTracks: 0,
      },
    };

    // 2. Re-follow an unmonitored artist whose old inline rules say catalog
    //    "all" -> the old rule is not resurrected; new releases only
    monitoringState = {
      monitored: false,
      useDefault: false,
      rules: {
        catalog: 'all',
        newReleases: false,
        types: ['album'],
        extraTypes: ['live'],
        edition: 'deluxe',
        topTracks: 5,
      },
    };
    const followedInline = await client.setArtistFollowing(
      artistMbid,
      'Artist',
      true
    );
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: followOnly,
    });
    assert.deepStrictEqual(followedInline, {
      inLibrary: true,
      following: true,
    });

    // 2b. An artist monitored right now with explicit rules keeps them, with
    //     new releases switched on
    monitoringState = {
      monitored: true,
      useDefault: false,
      rules: {
        catalog: 'all',
        newReleases: false,
        types: ['album'],
        extraTypes: ['live'],
        edition: 'deluxe',
        topTracks: 5,
      },
    };
    await client.setArtistFollowing(artistMbid, 'Artist', true);
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: {
        monitored: true,
        useDefault: false,
        rules: {
          catalog: 'all',
          newReleases: true,
          types: ['album'],
          extraTypes: ['live'],
          edition: 'deluxe',
          topTracks: 5,
        },
      },
    });

    // 3. Follow an unmonitored artist on Aurral's defaults (e.g. added by an
    //    album request) -> never useDefault: new releases only
    monitoringState = { monitored: false, useDefault: true };
    const followedDefault = await client.setArtistFollowing(
      artistMbid,
      'Artist',
      true
    );
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: followOnly,
    });
    assert.deepStrictEqual(followedDefault, {
      inLibrary: true,
      following: true,
    });

    // 3b. Already following (monitored on defaults) -> nothing is sent
    monitoringState = { monitored: true, useDefault: true };
    const putCount = putPayloads.length;
    assert.deepStrictEqual(
      await client.setArtistFollowing(artistMbid, 'Artist', true),
      { inLibrary: true, following: true, usesDefaultRules: true }
    );
    assert.strictEqual(putPayloads.length, putCount);

    // 4. Unfollow artist with inline rules having catalog != 'none' -> keep rules, set newReleases: false
    monitoringState = {
      monitored: true,
      useDefault: false,
      rules: {
        catalog: 'all',
        newReleases: true,
        types: ['album', 'ep'],
        topTracks: 0,
      },
    };
    const unfollowedCatalog = await client.setArtistFollowing(
      artistMbid,
      'Artist',
      false
    );
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: {
        monitored: true,
        useDefault: false,
        rules: {
          catalog: 'all',
          newReleases: false,
          types: ['album', 'ep'],
          topTracks: 0,
        },
      },
    });
    assert.deepStrictEqual(unfollowedCatalog, {
      inLibrary: true,
      following: false,
    });

    // 5. Unfollow artist with inline rules having topTracks > 0 -> keep rules, set newReleases: false
    monitoringState = {
      monitored: true,
      useDefault: false,
      rules: { catalog: 'none', newReleases: true, topTracks: 10 },
    };
    const unfollowedTopTracks = await client.setArtistFollowing(
      artistMbid,
      'Artist',
      false
    );
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: {
        monitored: true,
        useDefault: false,
        rules: { catalog: 'none', newReleases: false, topTracks: 10 },
      },
    });
    assert.deepStrictEqual(unfollowedTopTracks, {
      inLibrary: true,
      following: false,
    });

    // 6. Unfollow artist with only newReleases (catalog 'none', topTracks 0) -> { monitored: false }
    monitoringState = {
      monitored: true,
      useDefault: false,
      rules: { catalog: 'none', newReleases: true, topTracks: 0 },
    };
    const unfollowedOnlyNew = await client.setArtistFollowing(
      artistMbid,
      'Artist',
      false
    );
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: { monitored: false },
    });
    assert.deepStrictEqual(unfollowedOnlyNew, {
      inLibrary: true,
      following: false,
    });

    // 7. Unfollow artist using defaults -> { monitored: false }
    monitoringState = { monitored: true, useDefault: true };
    const unfollowedDefault = await client.setArtistFollowing(
      artistMbid,
      'Artist',
      false
    );
    assert.deepStrictEqual(putPayloads.at(-1), {
      artistName: 'Artist',
      monitoring: { monitored: false },
    });
    assert.deepStrictEqual(unfollowedDefault, {
      inLibrary: true,
      following: false,
    });
  });

  it('separates full, partial, and unowned library release groups', () => {
    const owned = new Set<string>();
    const partial = new Set<string>();
    const fullId = '11111111-1111-4111-8111-111111111111';
    const noCountFullId = '22222222-2222-4222-8222-222222222222';
    const flagId = '33333333-3333-4333-8333-333333333333';
    const partialId = '44444444-4444-4444-8444-444444444444';
    const queuedId = '55555555-5555-4555-8555-555555555555';
    const bareQueuedId = '66666666-6666-4666-8666-666666666666';

    collectLibraryReleaseGroupMbids(
      [
        { releaseGroupMbid: fullId, trackCount: 10, availableTrackCount: 10 },
        { releaseGroupMbid: noCountFullId, availableTrackCount: 4 },
        { releaseGroupMbid: flagId, inLibrary: true },
        {
          releaseGroupMbid: partialId,
          trackCount: 10,
          availableTrackCount: 3,
        },
        {
          releaseGroupMbid: queuedId,
          trackCount: 10,
          availableTrackCount: 0,
        },
        { releaseGroupMbid: bareQueuedId, monitored: true },
      ],
      owned,
      partial
    );

    assert.deepStrictEqual(
      [...owned].sort(),
      [fullId, noCountFullId, flagId].sort()
    );
    assert.deepStrictEqual([...partial], [partialId]);
    assert.strictEqual(owned.has(queuedId), false);
    assert.strictEqual(owned.has(bareQueuedId), false);
    assert.strictEqual(partial.has(queuedId), false);
    assert.strictEqual(partial.has(bareQueuedId), false);
  });

  it('handles both 200 audio bytes and 302 Deezer CDN redirects in getDeezerPreviewClip', async () => {
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    // 1. Direct 200 audio bytes path
    const requestMock200 = mockRequest(
      async (_method, _endpoint, _data, cfg) => {
        assert.strictEqual(cfg?.maxRedirects, 0);
        return {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
          data: Buffer.from('direct-mp3-bytes'),
        };
      }
    );

    const directClip = await client.getDeezerPreviewClip('12345');
    assert.strictEqual(requestMock200.mock.callCount(), 1);
    assert.strictEqual(directClip?.toString(), 'direct-mp3-bytes');

    mock.restoreAll();

    // 2. 302 redirect to allowlisted Deezer CDN URL path
    mockRequest(async (_method, _endpoint, _data, cfg) => {
      assert.strictEqual(cfg?.maxRedirects, 0);
      const validate = cfg?.validateStatus as
        ((status: number) => boolean) | undefined;
      assert.strictEqual(validate?.(302), true);
      return {
        status: 302,
        headers: {
          location: 'https://cdns-preview-a.dzcdn.net/stream/c-12345.mp3',
        },
        data: Buffer.alloc(0),
      };
    });
    const axiosGetMock = mock.method(
      axios as unknown as {
        get: (url: string, config?: unknown) => Promise<unknown>;
      },
      'get',
      async (url: string) => {
        assert.strictEqual(
          url,
          'https://cdns-preview-a.dzcdn.net/stream/c-12345.mp3'
        );
        return {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
          data: Buffer.from('redirected-mp3-bytes'),
        };
      }
    );

    const redirectedClip = await client.getDeezerPreviewClip('12345');
    assert.strictEqual(axiosGetMock.mock.callCount(), 1);
    assert.strictEqual(redirectedClip?.toString(), 'redirected-mp3-bytes');

    mock.restoreAll();

    // 3. Disallowed 302 target host is rejected
    mockRequest(async () => ({
      status: 302,
      headers: { location: 'https://evil.example/preview.mp3' },
      data: Buffer.alloc(0),
    }));
    await assert.rejects(
      () => client.getDeezerPreviewClip('12345'),
      /host is not allowed/
    );
  });

  it('extracts previewDeezerId on search and trending tracks from preview_url', async () => {
    mockGet(async (endpoint) => {
      if (endpoint === '/api/search/unified') {
        return {
          artists: [],
          albums: [],
          tracks: [
            {
              title: 'With Preview',
              artistName: 'Artist',
              preview_url: '/api/deezer/preview/987654321.mp3',
            },
            {
              title: 'Without Preview',
              artistName: 'Artist',
            },
          ],
          top: {
            type: 'track',
            title: 'With Preview',
            artistName: 'Artist',
            preview_url: '/api/deezer/preview/987654321.mp3?download=1',
          },
        };
      }
      if (endpoint === '/api/discover/trending') {
        return {
          artists: [],
          albums: [],
          tracks: [
            {
              title: 'Trending Track',
              artistName: 'Artist',
              preview_url: '/api/deezer/preview/11223344.mp3',
            },
          ],
        };
      }
      return {};
    });

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const search = await client.searchUnified('test');
    const trending = await client.getTrending();

    assert.strictEqual(search.tracks[0].previewDeezerId, '987654321');
    assert.strictEqual(search.tracks[1].previewDeezerId, null);
    assert.strictEqual(
      search.top?.type === 'track' ? search.top.previewDeezerId : null,
      '987654321'
    );
    assert.strictEqual(trending.tracks[0].previewDeezerId, '11223344');
  });

  it('marks degraded unified search results and caches only status ok', async () => {
    let status: string = 'unavailable';
    const getMock = mockGet(async () => ({
      status,
      artists: [],
      albums: [],
      tracks: [{ title: 'Song', artistName: 'Artist' }],
      top: null,
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const degradedFirst = await client.searchUnified('test', 12);
    const degradedSecond = await client.searchUnified('test', 12);
    assert.strictEqual(degradedFirst.degraded, true);
    assert.strictEqual(degradedSecond.degraded, true);
    assert.strictEqual(getMock.mock.callCount(), 2);

    status = 'ok';
    const okFirst = await client.searchUnified('test', 12);
    const okSecond = await client.searchUnified('test', 12);
    assert.strictEqual(okFirst.degraded, false);
    assert.strictEqual(okSecond.degraded, false);
    assert.strictEqual(getMock.mock.callCount(), 3);
  });

  it('reads searchAlbums, searchLibrary, resolveLink, and getSimilarArtists defensively', async () => {
    const validMbid = '11111111-1111-4111-8111-111111111111';
    const similarMbid = '22222222-2222-4222-8222-222222222222';
    const albumMbid = '33333333-3333-4333-8333-333333333333';

    mockGet(async (endpoint, options, ttl) => {
      if (endpoint === '/api/search') {
        assert.strictEqual(options?.params?.scope, 'album');
        assert.strictEqual(ttl, 600);
        return {
          albums: [
            {
              releaseGroupMbid: albumMbid,
              title: 'Folklore',
              artistName: 'Taylor Swift',
              primaryType: 'Album',
              releaseDate: '2020-07-24',
            },
          ],
        };
      }
      if (endpoint === '/api/search/library') {
        assert.strictEqual(options?.params?.limit, 8);
        assert.strictEqual(ttl, 0);
        return {
          artists: [{ id: 12, name: 'Phoebe Bridgers', mbid: validMbid }],
          albums: [{ id: 5, title: 'Punisher', releaseGroupMbid: albumMbid }],
          tracks: [
            {
              title: 'Kyoto',
              artistName: 'Phoebe Bridgers',
              artistMbid: validMbid,
              albumMbid,
            },
          ],
        };
      }
      if (endpoint === '/api/search/link') {
        assert.strictEqual(ttl, 600);
        return {
          type: 'track',
          mbid: 'rec-1',
          title: 'Kyoto',
          artistName: 'Phoebe Bridgers',
          albumMbid,
        };
      }
      if (endpoint === `/api/artists/${validMbid}/similar`) {
        assert.strictEqual(ttl, 3600);
        return {
          artists: [
            {
              id: 'not-a-uuid',
              name: 'Julien Baker',
              imageUrl: 'https://cdn-images.dzcdn.net/images/artist/jb.jpg',
              match: 0.5,
            },
            {
              mbid: similarMbid,
              name: 'Lucy Dacus',
              image: 'https://evil.example/bad.jpg',
              match: 0.9,
            },
          ],
        };
      }
      return {};
    });

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const albums = await client.searchAlbums('folklore', 12);
    assert.strictEqual(albums[0].mbid, albumMbid);

    const library = await client.searchLibrary('kyoto', 8);
    assert.strictEqual(library.artists[0].inLibrary, true);
    assert.strictEqual(
      library.artists[0].image,
      '/api/v1/music/library-art/artists/12'
    );
    assert.strictEqual(library.albums[0].inLibrary, true);
    assert.strictEqual(library.tracks[0].inLibrary, true);
    assert.strictEqual(library.tracks[0].albumMbid, albumMbid);
    assert.strictEqual(library.tracks[0].artistMbid, validMbid);

    const link = await client.resolveLink('https://open.spotify.com/track/123');
    assert.deepStrictEqual(link, {
      type: 'track',
      mbid: 'rec-1',
      title: 'Kyoto',
      artistName: 'Phoebe Bridgers',
      albumMbid,
    });

    const similar = await client.getSimilarArtists(validMbid);
    assert.deepStrictEqual(similar, [
      { mbid: similarMbid, name: 'Lucy Dacus', image: null },
      {
        mbid: null,
        name: 'Julien Baker',
        image: 'https://cdn-images.dzcdn.net/images/artist/jb.jpg',
      },
    ]);
  });

  it('returns an empty list when Aurral similar artists returns 404', async () => {
    const validMbid = '11111111-1111-4111-8111-111111111111';
    mockGet(async () => {
      const err = new Error('Not found') as Error & {
        response: { status: number };
      };
      err.response = { status: 404 };
      throw err;
    });

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const similar = await client.getSimilarArtists(validMbid);
    assert.deepStrictEqual(similar, []);
  });

  it('allows wikimedia.org and upload.wikimedia.org in sanitizeAurralImageUrl', () => {
    assert.strictEqual(
      sanitizeAurralImageUrl(
        'https://upload.wikimedia.org/wikipedia/commons/a/ab/Artist.jpg'
      ),
      'https://upload.wikimedia.org/wikipedia/commons/a/ab/Artist.jpg'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://wikimedia.org/img.png'),
      'https://wikimedia.org/img.png'
    );
    assert.strictEqual(
      sanitizeAurralImageUrl('https://evilwikimedia.org/img.png'),
      null
    );
  });

  it('keeps only MusicBrainz release statuses and the artist credit of release groups', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    mockGet(async () => ({
      id: artistMbid,
      name: 'Michael Jackson',
      'release-groups': [
        {
          // a library or download "status" is not a release status
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Thriller - Deluxe Anniversary Edition',
          'primary-type': 'Album',
          status: 'pending',
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Butterflies',
          'primary-type': 'Single',
          releaseStatuses: ['Promotion', 'downloading'],
          'artist-credit': [
            { name: 'Michael Jackson', artist: { id: artistMbid } },
            { name: 'No id' },
          ],
        },
      ],
    }));
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const details = await client.getArtistDetails(artistMbid);
    const byTitle = new Map(
      (details?.releaseGroups ?? []).map((group) => [group.title, group])
    );
    const deluxe = byTitle.get('Thriller - Deluxe Anniversary Edition');
    assert.strictEqual(deluxe?.releaseStatuses, undefined);
    assert.strictEqual(deluxe?.artistCreditIds, undefined);
    const butterflies = byTitle.get('Butterflies');
    assert.deepStrictEqual(butterflies?.releaseStatuses, ['Promotion']);
    assert.deepStrictEqual(butterflies?.artistCreditIds, [artistMbid]);
  });

  it('never caches incomplete getArtistDetails answers and marks incomplete: true', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    const rgMbid = '22222222-2222-4222-8222-222222222222';
    let mode: 'unknown' | 'empty-rg' | 'complete' = 'unknown';

    const requestMock = mockRequest(async () => {
      if (mode === 'unknown') {
        return {
          status: 200,
          data: {
            id: artistMbid,
            name: 'unknown artist',
            'release-groups': [
              { id: rgMbid, title: 'Album', 'primary-type': 'Album' },
            ],
          },
        };
      }
      if (mode === 'empty-rg') {
        return {
          status: 200,
          data: {
            id: artistMbid,
            name: 'Real Artist',
            'release-groups': [],
          },
        };
      }
      return {
        status: 200,
        data: {
          id: artistMbid,
          name: 'Real Artist',
          'release-groups': [
            {
              id: rgMbid,
              title: 'Album',
              'first-release-date': '2024-01-01',
              'primary-type': 'Album',
            },
          ],
        },
      };
    });

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const unknownRes = await client.getArtistDetails(artistMbid);
    assert.strictEqual(unknownRes?.incomplete, true);
    assert.strictEqual(cacheManager.getCache('aurral').data.keys().length, 0);

    mode = 'empty-rg';
    const emptyRgRes = await client.getArtistDetails(artistMbid);
    assert.strictEqual(emptyRgRes?.incomplete, true);
    assert.strictEqual(requestMock.mock.callCount(), 2);
    assert.strictEqual(cacheManager.getCache('aurral').data.keys().length, 0);

    mode = 'complete';
    const completeFirst = await client.getArtistDetails(artistMbid);
    const completeSecond = await client.getArtistDetails(artistMbid);
    assert.strictEqual(completeFirst?.incomplete, undefined);
    assert.strictEqual(completeSecond?.name, 'Real Artist');
    assert.strictEqual(requestMock.mock.callCount(), 3);
    assert.strictEqual(cacheManager.getCache('aurral').data.keys().length, 1);
  });

  it('sorts artist release groups by date descending and keeps undated last in upstream order', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    const rgEarly2024 = '22222222-2222-4222-8222-222222222221';
    const rgLate2024 = '22222222-2222-4222-8222-222222222222';
    const rg2022 = '22222222-2222-4222-8222-222222222223';
    const rgUndated1 = '22222222-2222-4222-8222-222222222224';
    const rgUndated2 = '22222222-2222-4222-8222-222222222225';

    mockGet(async () => ({
      id: artistMbid,
      name: 'Date Sort Artist',
      'release-groups': [
        {
          id: rgUndated1,
          title: 'Undated First',
          'first-release-date': null,
          'primary-type': 'Album',
        },
        {
          id: rgEarly2024,
          title: 'March 2024',
          'first-release-date': '2024-03-15',
          'primary-type': 'Album',
        },
        {
          id: rg2022,
          title: 'Year 2022',
          'first-release-date': '2022',
          'primary-type': 'Album',
        },
        {
          id: rgUndated2,
          title: 'Undated Second',
          'primary-type': 'Single',
        },
        {
          id: rgLate2024,
          title: 'Nov 2024',
          'first-release-date': '2024-11-01',
          'primary-type': 'Album',
        },
      ],
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const details = await client.getArtistDetails(artistMbid);

    assert.deepStrictEqual(
      details?.releaseGroups.map((rg) => rg.id),
      [rgLate2024, rgEarly2024, rg2022, rgUndated1, rgUndated2]
    );
    assert.strictEqual(details?.releaseGroups[3].year, null);
    assert.strictEqual(details?.releaseGroups[4].year, null);
  });

  it('maps libraryId and libraryAlbumId numeric strings in searchLibrary and never passes through relative /api/library URLs', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    const albumMbid = '22222222-2222-4222-8222-222222222222';
    const unmappedAlbumMbid = '33333333-3333-4333-8333-333333333333';

    mockGet(async () => ({
      artists: [
        {
          id: artistMbid,
          libraryId: '1239',
          name: 'Taylor Swift',
          image: '/api/library/artists/1239/cover?v=1',
        },
        {
          id: artistMbid,
          libraryId: '12345678901',
          name: 'Too Long ID',
          image: '/api/library/artists/99/cover?v=1',
        },
      ],
      albums: [
        {
          id: albumMbid,
          libraryId: '1845',
          title: 'folklore',
          artistName: 'Taylor Swift',
          artistMbid,
          coverUrl: '/api/library/albums/1845/cover?v=2',
        },
        {
          id: unmappedAlbumMbid,
          title: 'Relative Only',
          artistName: 'Someone',
          coverUrl: '/api/library/albums/999/cover?v=3',
        },
      ],
      tracks: [
        {
          id: 'track-1',
          title: 'cardigan',
          artistName: 'Taylor Swift',
          albumTitle: 'folklore',
          albumMbid,
          libraryAlbumId: '1845',
          artistMbid,
          durationMs: 239000,
          coverUrl: '/api/library/albums/1845/cover?v=2',
        },
        {
          id: 'track-2',
          title: 'No Lib ID',
          artistName: 'Someone',
          coverUrl: '/api/library/albums/777/cover?v=4',
        },
      ],
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const library = await client.searchLibrary('taylor', 8);

    assert.strictEqual(library.artists[0].mbid, artistMbid);
    assert.strictEqual(
      library.artists[0].image,
      '/api/v1/music/library-art/artists/1239'
    );
    assert.strictEqual(library.artists[1].image, null);

    assert.strictEqual(library.albums[0].mbid, albumMbid);
    assert.strictEqual(
      library.albums[0].coverUrl,
      '/api/v1/music/library-art/albums/1845'
    );
    assert.strictEqual(library.albums[1].coverUrl, null);

    assert.strictEqual(
      library.tracks[0].coverUrl,
      '/api/v1/music/library-art/albums/1845'
    );
    assert.strictEqual(library.tracks[1].coverUrl, null);
  });

  it('getAlbumArtUrl uses Cover Art Archive when it has the art and never asks Deezer', async () => {
    const mbid = '33333333-3333-4333-8333-333333333333';
    const head = mock.method(axios, 'head', async () => ({ status: 200 }));
    const deezer = mock.method(
      DeezerAPI.prototype,
      'searchAlbums',
      async () => []
    );
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const url = await client.getAlbumArtUrl(mbid, 'Some Artist', 'Some Album');
    assert.strictEqual(
      url,
      `https://coverartarchive.org/release-group/${mbid}/front-500`
    );
    assert.strictEqual(head.mock.callCount(), 1);
    assert.strictEqual(deezer.mock.callCount(), 0);
    // cached: a second call asks nobody
    await client.getAlbumArtUrl(mbid, 'Some Artist', 'Some Album');
    assert.strictEqual(head.mock.callCount(), 1);
  });

  it('getAlbumArtUrl does not cache "no art" when Cover Art Archive is rate limited or down', async () => {
    const mbid = '88888888-8888-4888-8888-888888888888';
    for (const status of [429, 503]) {
      mock.restoreAll();
      cacheManager.getCache('aurral').flush();
      const head = mock.method(axios, 'head', async () => ({ status }));
      const client = new AurralAPI({
        url: 'http://localhost:3001',
        apiKey: 'k',
      });

      // Without artist and title CAA is the only source: a 429/503 is a
      // failure, not a miss.
      await assert.rejects(
        client.getAlbumArtUrl(mbid),
        /could not be reached/,
        String(status)
      );

      // With Deezer and iTunes answering "no match", the result is null
      // but not remembered, so the next call asks CAA again.
      mock.method(DeezerAPI.prototype, 'searchAlbums', async () => []);
      mock.method(axios, 'get', async () => ({ data: { results: [] } }));
      assert.strictEqual(
        await client.getAlbumArtUrl(mbid, 'Some Artist', 'Some Album'),
        null
      );
      await client.getAlbumArtUrl(mbid, 'Some Artist', 'Some Album');
      assert.strictEqual(head.mock.callCount(), 3, String(status));
    }
  });

  it('getAlbumArtUrl strips double quotes from the Deezer advanced query', async () => {
    const mbid = '99999999-9999-4999-8999-999999999999';
    mock.method(axios, 'head', async () => ({ status: 404 }));
    const deezer = mock.method(
      DeezerAPI.prototype,
      'searchAlbums',
      async (query: string) => {
        assert.strictEqual(
          query,
          'artist:"Weird Al Yankovic" album:"12 Masters"'
        );
        return [];
      }
    );
    mock.method(axios, 'get', async () => ({ data: { results: [] } }));
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    await client.getAlbumArtUrl(mbid, 'Weird Al " Yankovic', '12" Masters');
    assert.strictEqual(deezer.mock.callCount(), 1);
  });

  it('getAlbumArtUrl falls back to the matching Deezer album when Cover Art Archive has none', async () => {
    const mbid = '44444444-4444-4444-8444-444444444444';
    mock.method(axios, 'head', async () => ({ status: 404 }));
    const deezer = mock.method(
      DeezerAPI.prototype,
      'searchAlbums',
      async (query: string) => {
        assert.match(
          query,
          /artist:"YFN Lucci" album:"everything i said i am\."/
        );
        return [
          {
            id: 1,
            title: 'Different Album',
            artistName: 'YFN Lucci',
            coverXl:
              'https://cdn-images.dzcdn.net/images/cover/wrong/1000x1000.jpg',
          },
          {
            id: 2,
            title: 'everything i said i am.',
            artistName: 'YFN Lucci',
            coverXl:
              'https://cdn-images.dzcdn.net/images/cover/right/1000x1000.jpg',
          },
        ];
      }
    );
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const url = await client.getAlbumArtUrl(
      mbid,
      'YFN Lucci',
      'everything i said i am.'
    );
    assert.strictEqual(
      url,
      'https://cdn-images.dzcdn.net/images/cover/right/1000x1000.jpg'
    );
    assert.strictEqual(deezer.mock.callCount(), 1);
  });

  it('getAlbumArtUrl tries iTunes after Deezer, caches a miss, and throws when every source fails', async () => {
    const mbid = '55555555-5555-4555-8555-555555555555';
    mock.method(axios, 'head', async () => ({ status: 404 }));
    mock.method(DeezerAPI.prototype, 'searchAlbums', async () => []);
    const itunes = mock.method(axios, 'get', async () => ({
      data: {
        results: [
          {
            collectionName: 'Old Record',
            artistName: 'Quiet Band',
            artworkUrl100:
              'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg',
          },
        ],
      },
    }));
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    assert.strictEqual(
      await client.getAlbumArtUrl(mbid, 'Quiet Band', 'Old Record'),
      'https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg'
    );
    assert.strictEqual(itunes.mock.callCount(), 1);

    const missMbid = '66666666-6666-4666-8666-666666666666';
    assert.strictEqual(
      await client.getAlbumArtUrl(missMbid, 'Nobody', 'Nothing'),
      null
    );
    await client.getAlbumArtUrl(missMbid, 'Nobody', 'Nothing');
    assert.strictEqual(itunes.mock.callCount(), 2); // the miss was cached

    mock.restoreAll();
    mock.method(axios, 'head', async () => {
      throw new Error('timeout');
    });
    mock.method(DeezerAPI.prototype, 'searchAlbums', async () => {
      throw new Error('down');
    });
    mock.method(axios, 'get', async () => {
      throw new Error('down');
    });
    const failMbid = '77777777-7777-4777-8777-777777777777';
    await assert.rejects(
      client.getAlbumArtUrl(failMbid, 'A', 'B'),
      /could not be reached/
    );
    await assert.rejects(client.getAlbumArtUrl('not-a-uuid'), /valid UUID/);
  });

  it('falls back to DeezerAPI.searchArtists(name, 3) for getArtistImageUrl and caches name-only hits 1h and misses 10m', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    const missMbid = '22222222-2222-4222-8222-222222222222';
    const aurralGet = mockGet(async () => ({ images: [] }));
    const deezerSearch = mock.method(
      DeezerAPI.prototype,
      'searchArtists',
      async (query: string, limit?: number) => {
        assert.strictEqual(limit, 3);
        if (query === 'Taylor Swift') {
          return [
            {
              id: 1,
              name: 'Taylor Swift Tribute Band',
              pictureXl: 'https://cdn-images.dzcdn.net/images/artist/wrong.jpg',
              nbFan: 10,
            },
            {
              id: 2,
              name: 'Taylor Swift',
              pictureXl: 'https://cdn-images.dzcdn.net/images/artist/ts.jpg',
              nbFan: 1000000,
            },
          ];
        }
        return [];
      }
    );

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const hit1 = await client.getArtistImageUrl(artistMbid, 'Taylor Swift');
    const hit2 = await client.getArtistImageUrl(artistMbid, 'Taylor Swift');
    assert.strictEqual(
      hit1,
      'https://cdn-images.dzcdn.net/images/artist/ts.jpg'
    );
    assert.strictEqual(hit2, hit1);
    assert.strictEqual(aurralGet.mock.callCount(), 1);
    assert.strictEqual(deezerSearch.mock.callCount(), 1);

    const cache = cacheManager.getCache('aurral').data;
    const hitKey = cache.keys()[0];
    const hitTtlMs = (cache.getTtl(hitKey) ?? 0) - Date.now();
    // A photo matched only by name may be another artist with that name, so
    // it is kept for an hour, not a day.
    assert.ok(hitTtlMs > 59 * 60 * 1000 && hitTtlMs <= 3600 * 1000);

    const miss1 = await client.getArtistImageUrl(missMbid, 'Nobody Found');
    const miss2 = await client.getArtistImageUrl(missMbid, 'Nobody Found');
    assert.strictEqual(miss1, null);
    assert.strictEqual(miss2, null);
    assert.strictEqual(aurralGet.mock.callCount(), 2);
    assert.strictEqual(deezerSearch.mock.callCount(), 2);

    const missKey = cache.keys().find((key) => key !== hitKey)!;
    const missTtlMs = (cache.getTtl(missKey) ?? 0) - Date.now();
    assert.ok(missTtlMs > 9 * 60 * 1000 && missTtlMs <= 10 * 60 * 1000);
  });

  it('does not cache zero-artist getSimilarArtists responses and leaves missing images null', async () => {
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    let empty = true;
    const requestMock = mockRequest(async () => ({
      status: 200,
      data: empty
        ? { artists: [] }
        : {
            artists: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                name: 'No Image Artist',
              },
            ],
          },
    }));

    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });

    const first = await client.getSimilarArtists(artistMbid);
    assert.deepStrictEqual(first, []);
    assert.strictEqual(cacheManager.getCache('aurral').data.keys().length, 0);

    empty = false;
    const second = await client.getSimilarArtists(artistMbid);
    assert.deepStrictEqual(second, [
      {
        mbid: '22222222-2222-4222-8222-222222222222',
        name: 'No Image Artist',
        image: null,
      },
    ]);
    assert.strictEqual(requestMock.mock.callCount(), 2);
    assert.strictEqual(cacheManager.getCache('aurral').data.keys().length, 1);
  });

  it('caches an empty by-tag genre answer for at most a minute', async () => {
    let empty = true;
    const requestMock = mockRequest(async () => ({
      status: 200,
      data: empty
        ? { tag: 'pop', recommendations: [] }
        : {
            tag: 'indie',
            recommendations: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                name: 'Phoebe Bridgers',
              },
            ],
          },
    }));
    const client = new AurralAPI({ url: 'http://localhost:3001', apiKey: 'k' });
    const cache = cacheManager.getCache('aurral').data;
    const longestTtl = () =>
      Math.max(
        ...cache.keys().map((key) => Number(cache.getTtl(key)) - Date.now())
      );

    const first = await client.getDiscoverByTag('pop');
    assert.deepStrictEqual(first, { tag: 'pop', artists: [] });
    assert.ok(cache.keys().length >= 1);
    assert.ok(longestTtl() <= 60_000, `ttl ${longestTtl()}`);
    // answered from the short cache meanwhile
    await client.getDiscoverByTag('pop');
    assert.strictEqual(requestMock.mock.callCount(), 1);

    empty = false;
    const indie = await client.getDiscoverByTag('indie');
    assert.strictEqual(indie.artists.length, 1);
    assert.ok(longestTtl() > 60_000);
  });
});

describe('capReleaseGroups', () => {
  it('keeps every studio album when a big catalog is cut, filling with the newest others', () => {
    const newest = Array.from({ length: 6 }, (_, i) => ({
      group: {
        primaryType: 'Single',
        secondaryTypes: [] as string[],
        id: `s${i}`,
      },
    }));
    const live = {
      group: { primaryType: 'Album', secondaryTypes: ['Live'], id: 'live' },
    };
    const classic = [1, 2, 3].map((i) => ({
      group: {
        primaryType: 'Album',
        secondaryTypes: [] as string[],
        id: `a${i}`,
      },
    }));
    // newest first: singles, then a live album, then the old studio albums
    const kept = capReleaseGroups([...newest, live, ...classic], 5);
    assert.deepEqual(
      kept.map((entry) => entry.group.id),
      ['s0', 's1', 'a1', 'a2', 'a3']
    );
  });

  it('leaves a catalog under the cap alone', () => {
    const entries = [{ group: { primaryType: 'Single', secondaryTypes: [] } }];
    assert.equal(capReleaseGroups(entries, 5), entries);
  });
});
