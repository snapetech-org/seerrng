import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import AurralAPI from '@server/api/aurral';
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import {
  MediaRequestFailureReason,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import {
  clearRequestedMusicSearchTimes,
  getAurralAlbumMediaStatus,
  getRequestedAurralAlbumMediaStatus,
  getRequestedAurralAlbumStatus,
  isAurralPartialTrackCount,
  reconcileRequestedMusicAvailability,
} from '@server/lib/musicAvailability';
import requestDispatchManager from '@server/lib/requestDispatch';
import {
  getRequestStatus,
  RequestStatusStage,
} from '@server/lib/requestStatus';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Aurral availability reconciliation and status mapping', () => {
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
  });

  afterEach(() => {
    getSettings().aurral = [];
    clearRequestedMusicSearchTimes();
    mock.restoreAll();
  });

  it('maps Aurral album download statuses to MediaStatus', () => {
    assert.strictEqual(
      getAurralAlbumMediaStatus('complete'),
      MediaStatus.AVAILABLE
    );
    assert.strictEqual(
      getAurralAlbumMediaStatus('partial'),
      MediaStatus.PARTIALLY_AVAILABLE
    );
    assert.strictEqual(
      getAurralAlbumMediaStatus('downloading'),
      MediaStatus.PROCESSING
    );
    assert.strictEqual(
      getAurralAlbumMediaStatus('queued'),
      MediaStatus.PROCESSING
    );
    assert.strictEqual(
      getAurralAlbumMediaStatus('failed'),
      MediaStatus.UNKNOWN
    );
  });

  it('reconciles Aurral music requests via getAlbumStatus and maps stages with Aurral messaging', async () => {
    getSettings().aurral = [
      {
        id: 41,
        name: 'Aurral Main',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];

    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'rg-aurral-avail',
        mediaType: MediaType.MUSIC,
        serviceId: 41,
        externalServiceId: 501,
        musicServiceType: 'aurral',
        status: MediaStatus.PROCESSING,
      })
    );
    const req = new MediaRequest({
      id: 8001,
      type: MediaType.MUSIC,
      status: MediaRequestStatus.APPROVED,
      media,
      serverId: 41,
      serviceTargets: [
        {
          serviceType: 'aurral',
          format: 'music',
          serverId: 41,
          externalServiceId: 501,
          status: MediaStatus.PROCESSING,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const statusSpy = mock.method(
      AurralAPI.prototype,
      'getAlbumStatus',
      async () => ({
        libraryId: 501,
        status: 'downloading' as const,
      })
    );

    await reconcileRequestedMusicAvailability([req]);
    assert.strictEqual(statusSpy.mock.callCount(), 1);
    assert.strictEqual(getRequestedAurralAlbumStatus(41, 501), 'downloading');

    const downloadingStage = getRequestStatus(req);
    assert.strictEqual(downloadingStage.stage, RequestStatusStage.DOWNLOADING);
    assert.strictEqual(
      downloadingStage.message,
      'Aurral is downloading this album.'
    );
    assert.strictEqual(downloadingStage.service, 'Aurral Main');

    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 501,
      status: 'partial' as const,
    }));
    await reconcileRequestedMusicAvailability([req]);
    const importingStage = getRequestStatus(req);
    assert.strictEqual(importingStage.stage, RequestStatusStage.IMPORTING);
    assert.strictEqual(
      importingStage.message,
      'Aurral has some of the tracks for this album. The rest may not be available yet.'
    );

    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 501,
      status: 'failed' as const,
    }));
    await reconcileRequestedMusicAvailability([req]);
    const failedStage = getRequestStatus(req);
    assert.strictEqual(failedStage.stage, RequestStatusStage.FAILED);
    assert.match(failedStage.message, /Aurral could not download this album/i);

    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 501,
      status: 'complete' as const,
    }));
    await reconcileRequestedMusicAvailability([req]);
    assert.strictEqual(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.AVAILABLE
    );
  });

  it('maps requested albums without ever answering UNKNOWN, with one partial rule', () => {
    for (const status of [
      'missing',
      'failed',
      'blocked',
      'cancelled',
      'queued',
      'unreleased',
      'something-new',
    ] as const) {
      assert.strictEqual(
        getRequestedAurralAlbumMediaStatus({
          status: status as 'missing',
        }),
        MediaStatus.PROCESSING,
        status
      );
    }
    assert.strictEqual(
      getRequestedAurralAlbumMediaStatus({ status: 'complete' }),
      MediaStatus.AVAILABLE
    );
    // 11 of 12 tracks while Aurral still downloads: partial, like the scanner
    assert.strictEqual(
      getRequestedAurralAlbumMediaStatus({
        status: 'downloading',
        counts: { totalTracks: 12, ownedTracks: 11 },
      }),
      MediaStatus.PARTIALLY_AVAILABLE
    );
    assert.strictEqual(isAurralPartialTrackCount(11, 12), true);
    assert.strictEqual(isAurralPartialTrackCount(0, 12), false);
    assert.strictEqual(isAurralPartialTrackCount(12, 12), false);
    assert.strictEqual(isAurralPartialTrackCount(3, 0), false);
  });

  it('keeps a requested album requested, fails the request when Aurral gives up, and lets it complete later', async () => {
    getSettings().aurral = [
      {
        id: 42,
        name: 'Aurral Main',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];

    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'rg-aurral-guard',
        mediaType: MediaType.MUSIC,
        serviceId: 42,
        externalServiceId: 601,
        musicServiceType: 'aurral',
        status: MediaStatus.PROCESSING,
      })
    );
    const initial = new MediaRequest({
      id: 8101,
      type: MediaType.MUSIC,
      status: MediaRequestStatus.APPROVED,
      media,
      serverId: 42,
      serviceTargets: [
        {
          serviceType: 'aurral',
          format: 'music',
          serverId: 42,
          externalServiceId: 601,
          status: MediaStatus.PROCESSING,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const loadRequest = () =>
      getRepository(MediaRequest).findOneOrFail({
        where: { id: 8101 },
        relations: { media: true },
      });
    const mediaStatus = async () =>
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status;

    const statusSpy = mock.method(
      AurralAPI.prototype,
      'getAlbumStatus',
      async () => ({ libraryId: 601, status: 'missing' as const })
    );

    // Aurral searched and found nothing yet: still requested, never UNKNOWN.
    await reconcileRequestedMusicAvailability([initial]);
    assert.strictEqual(await mediaStatus(), MediaStatus.PROCESSING);

    // Aurral omitted the status entirely (getAlbumStatus defaults to missing).
    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 601,
      status: undefined as unknown as 'missing',
    }));
    await reconcileRequestedMusicAvailability([initial]);
    assert.strictEqual(await mediaStatus(), MediaStatus.PROCESSING);

    // 11 of 12 tracks while downloading: partial.
    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 601,
      status: 'downloading' as const,
      counts: { totalTracks: 12, ownedTracks: 11 },
    }));
    await reconcileRequestedMusicAvailability([initial]);
    assert.strictEqual(await mediaStatus(), MediaStatus.PARTIALLY_AVAILABLE);
    assert.strictEqual(
      (await loadRequest()).status,
      MediaRequestStatus.APPROVED
    );

    // Aurral gives up: the request fails so the retry path accepts it; the
    // album keeps its partial state.
    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 601,
      status: 'failed' as const,
    }));
    await reconcileRequestedMusicAvailability([await loadRequest()]);
    const failed = await loadRequest();
    assert.strictEqual(failed.status, MediaRequestStatus.FAILED);
    assert.strictEqual(
      failed.failureReason,
      MediaRequestFailureReason.DISPATCH_FAILED
    );
    assert.strictEqual(await mediaStatus(), MediaStatus.PARTIALLY_AVAILABLE);
    const failedStage = getRequestStatus(failed);
    assert.strictEqual(failedStage.stage, RequestStatusStage.FAILED);
    assert.strictEqual(failedStage.retryable, true);
    assert.match(failedStage.message ?? '', /Aurral could not download/);

    // Still failed on the next poll: no change, no second notification.
    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 601,
      status: 'failed' as const,
    }));
    await reconcileRequestedMusicAvailability([await loadRequest()]);
    assert.strictEqual((await loadRequest()).status, MediaRequestStatus.FAILED);

    // Aurral later gets the whole album anyway: the request completes.
    statusSpy.mock.mockImplementationOnce(async () => ({
      libraryId: 601,
      status: 'complete' as const,
    }));
    await reconcileRequestedMusicAvailability([await loadRequest()]);
    assert.strictEqual(
      (await loadRequest()).status,
      MediaRequestStatus.COMPLETED
    );
    assert.strictEqual(await mediaStatus(), MediaStatus.AVAILABLE);
  });
});
