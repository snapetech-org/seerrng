import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import AurralAPI from '@server/api/aurral';
import SlskdnAPI from '@server/api/slskdn';
import { getRepository } from '@server/datasource';
import TrackRequest from '@server/entity/TrackRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  claimPendingTrackRequest,
  createTrackRequests,
  declineTrackRequest,
  hasPendingAurralTrackMetadata,
  nextAurralTrackStatus,
  releaseTrackRequestClaim,
  startTrackSearch,
  syncTrackRequests,
} from '@server/lib/soulseek/trackRequests';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Track request routing: Aurral vs slskdN', () => {
  beforeEach(() => {
    getSettings().aurral = [];
    getSettings().slskdn = {
      enabled: false,
      hostname: '',
      port: 5030,
      useSsl: false,
      baseUrl: '',
      apiKey: '',
      searchFilter: '',
    };
  });

  afterEach(() => {
    getSettings().aurral = [];
    mock.restoreAll();
  });

  it('routes single-track requests with albumMbid and durationMs to Aurral when configured', async () => {
    getSettings().aurral = [
      {
        id: 31,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];

    const user = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-aurral@example.com',
        username: 'trackaurral',
        permissions: Permission.REQUEST | Permission.AUTO_APPROVE,
        plexId: 2001,
      })
    );

    const requestTrackMock = mock.method(
      AurralAPI.prototype,
      'requestTrack',
      async () => ({
        success: true,
        queued: true,
        jobId: 'aurral-track-1',
      })
    );
    const requestAlbumMock = mock.method(
      AurralAPI.prototype,
      'requestAlbum',
      async () => ({ success: true })
    );

    const created = await createTrackRequests(user, [
      {
        artist: 'Massive Attack',
        title: 'Teardrop',
        recordingMbid: 'rec-teardrop',
        albumMbid: 'rg-mezzanine',
        albumName: 'Mezzanine',
        artistMbid: 'artist-massive-attack',
        durationMs: 330000,
        trackNumber: 3,
        source: 'album',
      },
    ]);

    assert.strictEqual(requestTrackMock.mock.callCount(), 1);
    assert.deepStrictEqual(requestTrackMock.mock.calls[0].arguments[0], {
      artistName: 'Massive Attack',
      trackName: 'Teardrop',
      albumName: 'Mezzanine',
      artistMbid: 'artist-massive-attack',
      albumMbid: 'rg-mezzanine',
      trackMbid: 'rec-teardrop',
      durationMs: 330000,
      trackNumber: 3,
    });
    // One song, one job: never the album (it would queue the album's own
    // copy of the song and every other missing song on that release).
    assert.strictEqual(requestAlbumMock.mock.callCount(), 0);
    assert.strictEqual(created[0].backendType, 'aurral');
    assert.strictEqual(created[0].externalRequestId, 'aurral-track-1');
    assert.strictEqual(created[0].serverId, 31);
    assert.strictEqual(created[0].status, 'searching');
  });

  it('marks Aurral track requests completed immediately when alreadyOwned is true', async () => {
    getSettings().aurral = [
      {
        id: 32,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];

    const user = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-owned@example.com',
        username: 'trackowned',
        permissions: Permission.REQUEST | Permission.AUTO_APPROVE,
        plexId: 2002,
      })
    );

    mock.method(AurralAPI.prototype, 'requestTrack', async () => ({
      success: true,
      alreadyOwned: true,
      queued: false,
    }));

    const created = await createTrackRequests(user, [
      {
        artist: 'Massive Attack',
        title: 'Angel',
        albumMbid: 'rg-mezzanine',
        durationMs: 379000,
      },
    ]);

    assert.strictEqual(created[0].backendType, 'aurral');
    assert.strictEqual(created[0].status, 'completed');
  });

  it('keeps routing to slskdN unchanged when Aurral is not configured', async () => {
    getSettings().slskdn = {
      enabled: true,
      hostname: 'slskdn.local',
      port: 5030,
      useSsl: false,
      baseUrl: '',
      apiKey: 'slskdn-key',
      searchFilter: 'lossless',
    };

    const user = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-slskdn@example.com',
        username: 'trackslskdn',
        permissions: Permission.REQUEST | Permission.AUTO_APPROVE,
        plexId: 2003,
      })
    );

    const wishlistMock = mock.method(
      SlskdnAPI.prototype,
      'createWishlistItem',
      async () => ({ id: 'wish-42', searchText: 'Air Kelly Watch the Stars' })
    );

    const created = await createTrackRequests(user, [
      {
        artist: 'Air',
        title: 'Kelly Watch the Stars',
        source: 'playlist',
      },
    ]);

    assert.strictEqual(wishlistMock.mock.callCount(), 1);
    assert.strictEqual(created[0].backendType, 'slskdn');
    assert.strictEqual(created[0].wishlistItemId, 'wish-42');
    assert.strictEqual(created[0].status, 'searching');
  });

  it('syncs active Aurral track requests to completed or failed from GET /api/requests', async () => {
    getSettings().aurral = [
      {
        id: 33,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];

    const user = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-sync@example.com',
        username: 'tracksync',
        permissions: Permission.REQUEST_MUSIC,
        plexId: 2004,
      })
    );
    const repo = getRepository(TrackRequest);
    const okReq = await repo.save(
      new TrackRequest({
        requestedBy: user,
        requestedById: user.id,
        artist: 'Artist One',
        title: 'Done Track',
        backendType: 'aurral',
        externalRequestId: 'job-done',
        serverId: 33,
        status: 'searching',
      })
    );
    const errReq = await repo.save(
      new TrackRequest({
        requestedBy: user,
        requestedById: user.id,
        artist: 'Artist Two',
        title: 'Bad Track',
        backendType: 'aurral',
        externalRequestId: 'job-fail',
        serverId: 33,
        status: 'searching',
      })
    );

    mock.method(AurralAPI.prototype, 'getActivity', async () => [
      {
        id: 'act-1',
        jobId: 'job-done',
        status: 'completed',
      },
      {
        id: 'act-2',
        jobId: 'job-fail',
        status: 'failed',
        statusLabel: 'Duration validation failed',
      },
    ]);

    await syncTrackRequests();

    const updatedOk = await repo.findOneByOrFail({ id: okReq.id });
    const updatedErr = await repo.findOneByOrFail({ id: errReq.id });
    assert.strictEqual(updatedOk.status, 'completed');
    assert.strictEqual(updatedErr.status, 'failed');
    assert.strictEqual(updatedErr.lastError, 'Duration validation failed');
  });

  it('approving a pending song sends only the song (no silent album request) and clears its details', async () => {
    getSettings().aurral = [
      {
        id: 34,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];
    const requester = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-pending@example.com',
        username: 'trackpending',
        permissions: Permission.REQUEST_MUSIC,
        plexId: 2005,
      })
    );
    const manager = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-manager@example.com',
        username: 'trackmanager',
        permissions: Permission.MANAGE_REQUESTS,
        plexId: 2006,
      })
    );
    const requestTrackMock = mock.method(
      AurralAPI.prototype,
      'requestTrack',
      async () => ({ success: true, queued: true, jobId: 'job-approved' })
    );
    const requestAlbumMock = mock.method(
      AurralAPI.prototype,
      'requestAlbum',
      async () => ({ success: true })
    );

    const [pending, declined] = await createTrackRequests(requester, [
      {
        artist: 'Portishead',
        title: 'Roads',
        albumMbid: 'rg-dummy',
        albumName: 'Dummy',
        artistMbid: 'artist-portishead',
      },
      { artist: 'Portishead', title: 'Glory Box', albumMbid: 'rg-dummy' },
    ]);
    assert.strictEqual(pending.status, 'pending');
    assert.strictEqual(requestTrackMock.mock.callCount(), 0);
    assert.strictEqual(hasPendingAurralTrackMetadata(pending.id), true);

    // two approvals at once: only the first claim wins
    assert.strictEqual(await claimPendingTrackRequest(pending.id), true);
    assert.strictEqual(await claimPendingTrackRequest(pending.id), false);
    // a failed dispatch hands the claim back so it can be approved again
    await releaseTrackRequestClaim(pending.id);
    assert.strictEqual(await claimPendingTrackRequest(pending.id), true);

    const started = await startTrackSearch(pending, manager);
    assert.strictEqual(started.status, 'searching');
    assert.strictEqual(requestTrackMock.mock.callCount(), 1);
    assert.strictEqual(
      requestTrackMock.mock.calls[0]?.arguments[0]?.albumMbid,
      'rg-dummy'
    );
    assert.strictEqual(requestAlbumMock.mock.callCount(), 0);
    assert.strictEqual(hasPendingAurralTrackMetadata(pending.id), false);

    await declineTrackRequest(declined, manager);
    assert.strictEqual(hasPendingAurralTrackMetadata(declined.id), false);
  });

  it('keeps syncing other requests when one Aurral server or slskdN item fails', async () => {
    getSettings().aurral = [
      {
        id: 35,
        name: 'Aurral Down',
        hostname: 'down.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
      {
        id: 36,
        name: 'Aurral Up',
        hostname: 'up.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: false,
        syncEnabled: true,
      },
    ];
    getSettings().slskdn = {
      enabled: true,
      hostname: 'slskdn.local',
      port: 5030,
      useSsl: false,
      baseUrl: '',
      apiKey: 'slskdn-key',
      searchFilter: '',
    };
    const user = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'track-sync-many@example.com',
        username: 'tracksyncmany',
        permissions: Permission.REQUEST_MUSIC,
        plexId: 2007,
      })
    );
    const repo = getRepository(TrackRequest);
    const base = {
      requestedBy: user,
      requestedById: user.id,
      status: 'searching' as const,
    };
    const onDown = await repo.save(
      new TrackRequest({
        ...base,
        artist: 'A',
        title: 'On Down Server',
        backendType: 'aurral',
        externalRequestId: 'job-down',
        serverId: 35,
      })
    );
    const onUp = await repo.save(
      new TrackRequest({
        ...base,
        artist: 'B',
        title: 'On Up Server',
        backendType: 'aurral',
        externalRequestId: 'job-up',
        serverId: 36,
      })
    );
    const brokenWish = await repo.save(
      new TrackRequest({
        ...base,
        artist: 'C',
        title: 'Broken Wish',
        backendType: 'slskdn',
        wishlistItemId: 'wish-broken',
      })
    );
    const goodWish = await repo.save(
      new TrackRequest({
        ...base,
        artist: 'D',
        title: 'Good Wish',
        backendType: 'slskdn',
        wishlistItemId: 'wish-good',
      })
    );

    mock.method(
      AurralAPI.prototype,
      'getActivity',
      async function (this: AurralAPI) {
        // the client for the first server is unreachable
        if (
          (this as unknown as { baseUrl: string }).baseUrl.includes(
            'down.local'
          )
        ) {
          throw new Error('ECONNREFUSED');
        }
        return [{ id: 'act-up', jobId: 'job-up', status: 'completed' }];
      }
    );
    mock.method(SlskdnAPI.prototype, 'getWishlistItem', async (id: string) => {
      if (id === 'wish-broken') throw new Error('slskdN 500');
      return { id, totalDownloadCount: 1 };
    });

    await syncTrackRequests();

    assert.strictEqual(
      (await repo.findOneByOrFail({ id: onDown.id })).status,
      'searching'
    );
    assert.strictEqual(
      (await repo.findOneByOrFail({ id: onUp.id })).status,
      'completed'
    );
    assert.strictEqual(
      (await repo.findOneByOrFail({ id: brokenWish.id })).status,
      'searching'
    );
    assert.strictEqual(
      (await repo.findOneByOrFail({ id: goodWish.id })).status,
      'completed'
    );
  });

  it('does not take the result of an older Aurral job for the same song', () => {
    const createdAt = new Date('2026-11-20T12:00:00Z');
    const request = {
      status: 'searching' as const,
      createdAt,
      externalRequestId: 'job-new',
      artist: 'Massive Attack',
      title: 'Teardrop',
    };
    const olderFailure = {
      id: 'act-old',
      jobId: 'job-old',
      status: 'failed',
      artistName: 'Massive Attack',
      trackName: 'Teardrop',
      requestedAt: '2026-11-01T12:00:00Z',
    };
    const now = new Date('2026-11-20T12:05:00Z');
    assert.strictEqual(
      nextAurralTrackStatus(request, [olderFailure], now).status,
      'searching'
    );
    assert.strictEqual(
      nextAurralTrackStatus(
        request,
        [{ ...olderFailure, requestedAt: '2026-11-20T12:01:00Z' }],
        now
      ).status,
      'failed'
    );
    // without a job ID the name is all there is to go on
    assert.strictEqual(
      nextAurralTrackStatus(
        { ...request, externalRequestId: null },
        [olderFailure],
        now
      ).status,
      'failed'
    );
  });
});

describe('a song request downloads that one song, once', () => {
  beforeEach(() => {
    getSettings().aurral = [
      {
        id: 91,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];
  });

  afterEach(() => {
    getSettings().aurral = [];
    mock.restoreAll();
  });

  it('sends each auto-approved song to Aurral as one track, never its album', async () => {
    const user = await getRepository(User).save(
      new User({
        avatar: '',
        email: 'one-song@example.com',
        username: 'onesong',
        permissions: Permission.ADMIN,
        plexId: 2091,
      })
    );
    let job = 0;
    const requestTrack = mock.method(
      AurralAPI.prototype,
      'requestTrack',
      async () => {
        job += 1;
        return { success: true, queued: true, jobId: `job-${job}` };
      }
    );
    const requestAlbum = mock.method(
      AurralAPI.prototype,
      'requestAlbum',
      async () => ({ success: true })
    );

    const created = await createTrackRequests(user, [
      // a soundtrack song: the album flow used to add "Sunflower (Spider-Man:
      // Into the Spider-Verse)" next to "Sunflower"
      {
        artist: 'Post Malone',
        title: 'Sunflower',
        albumMbid: 'rg-spider-verse',
        albumName: 'Spider-Man: Into the Spider-Verse (Soundtrack)',
        artistMbid: 'artist-post-malone',
        durationMs: 158000,
        source: 'album',
      },
      // a single's B-side used to come along with the A-side
      {
        artist: 'Queen',
        title: 'Bohemian Rhapsody',
        albumMbid: 'rg-night-at-the-opera',
        albumName: 'A Night At The Opera',
        artistMbid: 'artist-queen',
        durationMs: 354000,
        source: 'album',
      },
    ]);

    assert.strictEqual(requestAlbum.mock.callCount(), 0);
    assert.strictEqual(requestTrack.mock.callCount(), 2);
    assert.deepStrictEqual(
      requestTrack.mock.calls.map((call) => call.arguments[0]),
      [
        {
          artistName: 'Post Malone',
          trackName: 'Sunflower',
          albumName: 'Spider-Man: Into the Spider-Verse (Soundtrack)',
          artistMbid: 'artist-post-malone',
          albumMbid: 'rg-spider-verse',
          durationMs: 158000,
        },
        {
          artistName: 'Queen',
          trackName: 'Bohemian Rhapsody',
          albumName: 'A Night At The Opera',
          artistMbid: 'artist-queen',
          albumMbid: 'rg-night-at-the-opera',
          durationMs: 354000,
        },
      ]
    );
    assert.deepStrictEqual(
      created.map((request) => request.externalRequestId),
      ['job-1', 'job-2']
    );

    // asking again while it is still on its way sends nothing new
    await createTrackRequests(user, [
      {
        artist: 'Post Malone',
        title: 'Sunflower',
        albumMbid: 'rg-spider-verse',
        albumName: 'Spider-Man: Into the Spider-Verse (Soundtrack)',
        source: 'album',
      },
    ]);
    assert.strictEqual(requestTrack.mock.callCount(), 2);
    assert.strictEqual(requestAlbum.mock.callCount(), 0);
  });
});
