import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import AurralAPI from '@server/api/aurral';
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import {
  clearRequestedMusicSearchTimes,
  reconcileRequestedMusicAvailability,
} from '@server/lib/musicAvailability';
import { Permission } from '@server/lib/permissions';
import requestDispatchManager from '@server/lib/requestDispatch';
import { getSettings } from '@server/lib/settings';
import { MediaRequestSubscriber } from '@server/subscriber/MediaRequestSubscriber';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Aurral album request routing and dispatch', () => {
  beforeEach(() => {
    mock.method(requestDispatchManager, 'enqueue', async () => undefined);
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      release_group_metadata: {
        release_group: { name: 'Stub Album' },
        artist: {
          name: 'Stub Artist',
          artists: [
            {
              artist_mbid: '11111111-1111-4111-8111-111111111111',
              name: 'Stub Artist',
            },
          ],
        },
      },
    }));
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => ({
      title: 'Stub Album',
      'artist-credit': [
        {
          name: 'Stub Artist',
          artist: { id: '11111111-1111-4111-8111-111111111111' },
        },
      ],
      releases: [],
    }));
    getSettings().aurral = [];
    getSettings().lidarr = [];
  });

  afterEach(() => {
    getSettings().aurral = [];
    getSettings().lidarr = [];
    mock.restoreAll();
  });

  it('targets aurral during MediaRequest.request() without Lidarr profiles or folders', async () => {
    getSettings().aurral = [
      {
        id: 21,
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
        email: 'aurral-req@example.com',
        username: 'aurralreq',
        permissions: Permission.REQUEST | Permission.AUTO_APPROVE,
        plexId: 1001,
      })
    );
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => ({
      id: 'rg-1111',
      title: 'Dummy Album',
      'artist-credit': [{ name: 'Portishead', artist: { id: 'ar-1' } }],
    }));

    const created = await MediaRequest.request(
      {
        mediaId: 'rg-1111',
        mediaType: MediaType.MUSIC,
      },
      user
    );

    assert.strictEqual(created.type, MediaType.MUSIC);
    assert.strictEqual(created.serverId, 21);
    assert.strictEqual(created.profileId, null);
    assert.strictEqual(created.metadataProfileId, null);
    assert.strictEqual(created.rootFolder, null);
    assert.deepStrictEqual(created.serviceTargets, [
      {
        serviceType: 'aurral',
        format: 'music',
        serverId: 21,
        profileId: null,
        metadataProfileId: null,
        rootFolder: null,
        tags: null,
        status: MediaStatus.PENDING,
      },
    ]);
  });

  it('dispatches approved music request to Aurral and stores musicServiceType=aurral', async () => {
    getSettings().aurral = [
      {
        id: 22,
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
        email: 'aurral-dispatch@example.com',
        username: 'aurraldispatch',
        permissions: Permission.REQUEST | Permission.MANAGE_REQUESTS,
        plexId: 1002,
      })
    );
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'rg-2222',
        mediaType: MediaType.MUSIC,
        status: MediaStatus.UNKNOWN,
      })
    );
    const reqEntity = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: user,
        serverId: 22,
        serviceTargets: [
          {
            serviceType: 'aurral',
            format: 'music',
            serverId: 22,
            status: MediaStatus.PENDING,
          },
        ],
      })
    );

    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      recordings_release_mbid: 'rel-2222',
      release_group_metadata: {
        release_group: { name: 'Dummy' },
        artist: {
          name: 'Portishead',
          artists: [{ artist_mbid: 'artist-2222', name: 'Portishead' }],
        },
      },
    }));

    const requestAlbumMock = mock.method(
      AurralAPI.prototype,
      'requestAlbum',
      async () => ({
        success: true,
        album: { id: 777, mbid: 'rg-2222', title: 'Dummy' },
        status: 'queued',
        queued: true,
      })
    );

    const subscriber = new MediaRequestSubscriber();
    const delay = await subscriber.sendToAurral(reqEntity);

    assert.strictEqual(delay, undefined);
    assert.strictEqual(requestAlbumMock.mock.callCount(), 1);
    assert.deepStrictEqual(requestAlbumMock.mock.calls[0].arguments[0], {
      albumMbid: 'rg-2222',
      albumName: 'Dummy',
      artistMbid: 'artist-2222',
      artistName: 'Portishead',
      releaseMbid: 'rel-2222',
    });

    const savedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(savedMedia.externalServiceId, 777);
    assert.strictEqual(savedMedia.serviceId, 22);
    assert.strictEqual(savedMedia.musicServiceType, 'aurral');
    assert.strictEqual(savedMedia.status, MediaStatus.PROCESSING);
  });

  it('returns retry delay instead of failing on transient Aurral errors', async () => {
    getSettings().aurral = [
      {
        id: 23,
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
        email: 'aurral-retry@example.com',
        username: 'aurralretry',
        permissions: Permission.REQUEST | Permission.MANAGE_REQUESTS,
        plexId: 1003,
      })
    );
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'rg-3333',
        mediaType: MediaType.MUSIC,
        status: MediaStatus.UNKNOWN,
      })
    );
    const reqEntity = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: user,
        serverId: 23,
        serviceTargets: [
          {
            serviceType: 'aurral',
            format: 'music',
            serverId: 23,
            status: MediaStatus.PENDING,
          },
        ],
      })
    );

    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      release_group_metadata: {
        release_group: { name: 'Third' },
        artist: {
          name: 'Portishead',
          artists: [{ artist_mbid: 'artist-3333', name: 'Portishead' }],
        },
      },
    }));
    mock.method(AurralAPI.prototype, 'requestAlbum', async () => {
      throw Object.assign(new Error('Request failed with status code 503'), {
        response: { status: 503, headers: { 'retry-after': '15' } },
      });
    });

    const subscriber = new MediaRequestSubscriber();
    const delay = await subscriber.sendToAurral(reqEntity);

    assert.strictEqual(typeof delay, 'number');
    assert.ok((delay ?? 0) >= 0);
    const savedReq = await getRepository(MediaRequest).findOneByOrFail({
      id: reqEntity.id,
    });
    assert.strictEqual(savedReq.status, MediaRequestStatus.APPROVED);
  });
});

const aurralServer = (id: number) => ({
  id,
  name: 'Aurral',
  hostname: 'aurral.local',
  port: 3001,
  useSsl: false,
  apiKey: 'aurral-key',
  isDefault: true,
  syncEnabled: true,
});

let resendUserCount = 0;
const saveResendUser = () => {
  resendUserCount += 1;
  return getRepository(User).save(
    new User({
      avatar: '',
      email: `aurral-resend-${resendUserCount}@example.com`,
      username: `aurralresend${resendUserCount}`,
      permissions: Permission.REQUEST | Permission.MANAGE_REQUESTS,
      plexId: 5000 + resendUserCount,
    })
  );
};

const loadRequestWithMedia = (id: number) =>
  getRepository(MediaRequest).findOneOrFail({
    where: { id },
    relations: { media: true },
  });

const aurralTargetStatus = async (id: number) =>
  (await loadRequestWithMedia(id)).serviceTargets?.find(
    (target) => target.serviceType === 'aurral'
  )?.status;

/**
 * The status poll saves a request whenever its Aurral target changes, and a
 * saved APPROVED request used to be dispatched again. If the dispatch then
 * wrote a different status than the poll, the two flipped it every minute and
 * the album went to Aurral once a minute, forever (fixed in 9bff114d6).
 */
describe('Aurral resend loop guard', () => {
  beforeEach(() => {
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      recordings_release_mbid: '22222222-2222-4222-8222-222222222222',
      release_group_metadata: {
        release_group: { name: 'Loop Album' },
        artist: {
          name: 'Loop Artist',
          artists: [
            {
              artist_mbid: '11111111-1111-4111-8111-111111111111',
              name: 'Loop Artist',
            },
          ],
        },
      },
    }));
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => ({
      title: 'Loop Album',
      'artist-credit': [
        {
          name: 'Loop Artist',
          artist: { id: '11111111-1111-4111-8111-111111111111' },
        },
      ],
      releases: [],
    }));
    getSettings().aurral = [];
    getSettings().lidarr = [];
  });

  afterEach(() => {
    getSettings().aurral = [];
    getSettings().lidarr = [];
    clearRequestedMusicSearchTimes();
    mock.restoreAll();
  });

  it('sends a partly downloaded album once, however often the poll runs', async () => {
    getSettings().aurral = [aurralServer(61)];

    // The dispatch outbox, modelled closely enough: one row per request, and
    // a request that is being dispatched is not queued again by its own save.
    const queue: number[] = [];
    const inFlight = new Set<number>();
    mock.method(requestDispatchManager, 'enqueue', async (id: number) => {
      if (!inFlight.has(id) && !queue.includes(id)) queue.push(id);
    });
    mock.method(requestDispatchManager, 'cancel', async () => undefined);
    const subscriber = new MediaRequestSubscriber();
    const drain = async () => {
      // bounded so a regression fails instead of hanging
      for (let rounds = 0; queue.length > 0 && rounds < 50; rounds += 1) {
        const id = queue.shift() as number;
        inFlight.add(id);
        try {
          const request = await loadRequestWithMedia(id);
          if (request.status === MediaRequestStatus.APPROVED) {
            await subscriber.sendToAurral(request);
          }
        } finally {
          inFlight.delete(id);
        }
      }
    };

    const requestAlbum = mock.method(
      AurralAPI.prototype,
      'requestAlbum',
      async () => ({
        success: true,
        album: { id: 961, mbid: 'rg-loop' },
        status: 'queued',
        queued: true,
      })
    );
    const albumStatus = mock.method(
      AurralAPI.prototype,
      'getAlbumStatus',
      async () => ({
        libraryId: 961,
        status: 'downloading' as const,
        counts: { ownedTracks: 3, totalTracks: 10, missingTracks: 7 },
      })
    );

    const user = await saveResendUser();
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'rg-loop',
        mediaType: MediaType.MUSIC,
        status: MediaStatus.UNKNOWN,
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: user,
        serverId: 61,
        serviceTargets: [
          {
            serviceType: 'aurral',
            format: 'music',
            serverId: 61,
            status: MediaStatus.PENDING,
          },
        ],
      })
    );

    // the original send
    await drain();
    assert.strictEqual(requestAlbum.mock.callCount(), 1);
    assert.strictEqual(
      await aurralTargetStatus(request.id),
      MediaStatus.PROCESSING
    );

    for (let poll = 1; poll <= 5; poll += 1) {
      await reconcileRequestedMusicAvailability([
        await loadRequestWithMedia(request.id),
      ]);
      await drain();
      assert.strictEqual(
        await aurralTargetStatus(request.id),
        MediaStatus.PARTIALLY_AVAILABLE,
        `target status after poll ${poll}`
      );
    }

    assert.strictEqual(albumStatus.mock.callCount(), 5);
    assert.strictEqual(
      requestAlbum.mock.callCount(),
      1,
      'the album was sent to Aurral again by a status poll'
    );
    assert.strictEqual(queue.length, 0);
  });

  describe('which saves dispatch a music request again', () => {
    let enqueued: number[];

    beforeEach(() => {
      enqueued = [];
      mock.method(requestDispatchManager, 'enqueue', async (id: number) => {
        enqueued.push(id);
      });
      mock.method(requestDispatchManager, 'cancel', async () => undefined);
    });

    const saveRequest = async (options: {
      type?: MediaType;
      status: MediaRequestStatus;
      targets: MediaRequest['serviceTargets'];
    }) => {
      const type = options.type ?? MediaType.MUSIC;
      const user = await saveResendUser();
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: type === MediaType.MUSIC ? 0 : 7000 + resendUserCount,
          ...(type === MediaType.MUSIC
            ? { mbId: `rg-guard-${resendUserCount}` }
            : {}),
          mediaType: type,
          status: MediaStatus.PROCESSING,
        })
      );
      const request = await getRepository(MediaRequest).save(
        new MediaRequest({
          type,
          status: options.status,
          media,
          requestedBy: user,
          serverId: options.targets?.[0]?.serverId ?? undefined,
          serviceTargets: options.targets,
        })
      );
      enqueued = [];
      return loadRequestWithMedia(request.id);
    };

    const delivered = (
      serviceType: 'aurral' | 'lidarr' = 'aurral'
    ): NonNullable<MediaRequest['serviceTargets']> => [
      {
        serviceType,
        format: 'music',
        serverId: 71,
        externalServiceId: 9001,
        status: MediaStatus.PROCESSING,
      },
    ];

    it('does not dispatch a delivered Aurral request when only its progress is saved', async () => {
      const request = await saveRequest({
        status: MediaRequestStatus.APPROVED,
        targets: delivered(),
      });
      request.serviceTargets = request.serviceTargets?.map((target) => ({
        ...target,
        status: MediaStatus.PARTIALLY_AVAILABLE,
      }));
      await getRepository(MediaRequest).save(request);
      assert.deepStrictEqual(enqueued, []);
    });

    it('does not dispatch a delivered Lidarr request when only its progress is saved', async () => {
      const request = await saveRequest({
        status: MediaRequestStatus.APPROVED,
        targets: delivered('lidarr'),
      });
      request.serviceTargets = request.serviceTargets?.map((target) => ({
        ...target,
        status: MediaStatus.PARTIALLY_AVAILABLE,
      }));
      await getRepository(MediaRequest).save(request);
      assert.deepStrictEqual(enqueued, []);
    });

    it('dispatches a retry (FAILED to APPROVED) even when Aurral has the album', async () => {
      const request = await saveRequest({
        status: MediaRequestStatus.FAILED,
        targets: delivered(),
      });
      request.status = MediaRequestStatus.APPROVED;
      await getRepository(MediaRequest).save(request);
      assert.deepStrictEqual(enqueued, [request.id]);
    });

    it('dispatches an approval (PENDING to APPROVED)', async () => {
      const request = await saveRequest({
        status: MediaRequestStatus.PENDING,
        targets: [
          {
            serviceType: 'aurral',
            format: 'music',
            serverId: 71,
            status: MediaStatus.PENDING,
          },
        ],
      });
      request.status = MediaRequestStatus.APPROVED;
      await getRepository(MediaRequest).save(request);
      assert.deepStrictEqual(enqueued, [request.id]);
    });

    it('dispatches an approved request Aurral has not accepted yet', async () => {
      const request = await saveRequest({
        status: MediaRequestStatus.APPROVED,
        targets: [
          {
            serviceType: 'aurral',
            format: 'music',
            serverId: 71,
            status: MediaStatus.PENDING,
          },
        ],
      });
      request.serviceTargets = request.serviceTargets?.map((target) => ({
        ...target,
        status: MediaStatus.PROCESSING,
      }));
      await getRepository(MediaRequest).save(request);
      assert.deepStrictEqual(enqueued, [request.id]);
    });

    it('leaves other media types alone: an approved movie save still dispatches', async () => {
      const request = await saveRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.APPROVED,
        targets: [
          {
            serviceType: 'radarr',
            format: 'standard',
            serverId: 3,
            externalServiceId: 44,
            status: MediaStatus.PROCESSING,
          },
        ],
      });
      request.serviceTargets = request.serviceTargets?.map((target) => ({
        ...target,
        status: MediaStatus.PARTIALLY_AVAILABLE,
      }));
      await getRepository(MediaRequest).save(request);
      assert.deepStrictEqual(enqueued, [request.id]);
    });
  });

  it('the send and the poll record the same status for every Aurral album state', async () => {
    getSettings().aurral = [aurralServer(81)];
    mock.method(requestDispatchManager, 'enqueue', async () => undefined);
    mock.method(requestDispatchManager, 'cancel', async () => undefined);
    const subscriber = new MediaRequestSubscriber();
    const statuses = [
      'pending',
      'searching',
      'queued',
      'downloading',
      'importing',
      'partial',
      'available',
      'complete',
      'missing',
      'failed',
      'blocked',
      'cancelled',
      undefined,
    ];
    const countVariants = [
      undefined,
      { ownedTracks: 3, totalTracks: 10, missingTracks: 7 },
    ];
    const mismatches: string[] = [];
    let albumId = 1000;

    for (const status of statuses) {
      for (const counts of countVariants) {
        albumId += 1;
        const currentAlbumId = albumId;
        const user = await saveResendUser();
        const media = await getRepository(Media).save(
          new Media({
            tmdbId: 0,
            mbId: `rg-table-${currentAlbumId}`,
            mediaType: MediaType.MUSIC,
            serviceId: 81,
            externalServiceId: currentAlbumId,
            musicServiceType: 'aurral',
            status: MediaStatus.PROCESSING,
          })
        );
        const request = await getRepository(MediaRequest).save(
          new MediaRequest({
            type: MediaType.MUSIC,
            status: MediaRequestStatus.APPROVED,
            media,
            requestedBy: user,
            serverId: 81,
            serviceTargets: [
              {
                serviceType: 'aurral',
                format: 'music',
                serverId: 81,
                externalServiceId: currentAlbumId,
                status: MediaStatus.PROCESSING,
              },
            ],
          })
        );
        const albumStatus = mock.method(
          AurralAPI.prototype,
          'getAlbumStatus',
          async () => ({
            libraryId: currentAlbumId,
            status: status as 'missing',
            ...(counts ? { counts } : {}),
          })
        );
        const requestAlbum = mock.method(
          AurralAPI.prototype,
          'requestAlbum',
          async () => ({
            success: true,
            album: { id: currentAlbumId, mbid: `rg-table-${currentAlbumId}` },
            status: status as string,
          })
        );

        await reconcileRequestedMusicAvailability([
          await loadRequestWithMedia(request.id),
        ]);
        const polled = await aurralTargetStatus(request.id);
        await subscriber.sendToAurral(await loadRequestWithMedia(request.id));
        const sent = await aurralTargetStatus(request.id);
        await reconcileRequestedMusicAvailability([
          await loadRequestWithMedia(request.id),
        ]);
        const polledAgain = await aurralTargetStatus(request.id);

        if (polled !== sent || sent !== polledAgain) {
          mismatches.push(
            `${String(status)}${counts ? ' (3 of 10 tracks)' : ''}: poll ${polled}, send ${sent}, poll again ${polledAgain}`
          );
        }
        albumStatus.mock.restore();
        requestAlbum.mock.restore();
      }
    }

    assert.deepStrictEqual(mismatches, []);
  });
});
