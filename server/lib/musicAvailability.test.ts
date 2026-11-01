import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  clearRequestedMusicSearchTimes,
  getRequestedMusicSearchTime,
  reconcileRequestedMusicAvailability,
} from './musicAvailability';

setupTestDb();

afterEach(() => {
  getSettings().lidarr = [];
  clearRequestedMusicSearchTimes();
  mock.restoreAll();
});

describe('requested music availability reconciliation', () => {
  it('skips requests whose linked media is missing instead of aborting Download Sync', async () => {
    const orphanedRequests = [MediaType.MOVIE, MediaType.MUSIC].map(
      (type) =>
        ({
          id: 9000,
          type,
          status: MediaRequestStatus.APPROVED,
          media: null,
        }) as unknown as MediaRequest
    );

    await assert.doesNotReject(
      reconcileRequestedMusicAvailability(orphanedRequests)
    );
  });

  it('marks a Picard-processed request available when Lidarr reports imported tracks', async () => {
    getSettings().lidarr = [
      {
        id: 12,
        name: 'Lidarr FLAC',
        hostname: 'lidarr.local',
        port: 8686,
        apiKey: 'test-key',
        baseUrl: '',
        useSsl: false,
        activeProfileId: 1,
        activeProfileName: 'Lossless',
        activeMetadataProfileId: 1,
        activeDirectory: '/music',
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        externalUrl: '',
        tags: [],
        overrideRule: [],
      },
    ];
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'requested-release-group',
        mediaType: MediaType.MUSIC,
        serviceId: 12,
        externalServiceId: 44,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const getAlbum = mock.method(
      LidarrAPI.prototype,
      'getAlbum',
      async () =>
        ({
          id: 44,
          title: 'Requested Album',
          monitored: true,
          foreignAlbumId: 'lidarr-release-group',
          lastSearchTime: '2026-01-01T00:00:30.000Z',
          statistics: {
            trackFileCount: 10,
            trackCount: 10,
            totalTrackCount: 10,
            sizeOnDisk: 1_000,
            percentOfTracks: 100,
          },
        }) as LidarrAlbum
    );

    await reconcileRequestedMusicAvailability([
      {
        type: MediaType.MUSIC,
        status: MediaRequestStatus.APPROVED,
        media,
      } as MediaRequest,
    ]);

    assert.strictEqual(getAlbum.mock.callCount(), 1);
    assert.strictEqual(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.AVAILABLE
    );
    assert.strictEqual(
      getRequestedMusicSearchTime(12, 44)?.toISOString(),
      '2026-01-01T00:00:30.000Z'
    );
  });

  it('tracks an approved request when broad Lidarr scanning is disabled', async () => {
    getSettings().lidarr = [
      {
        id: 12,
        name: 'Lidarr FLAC',
        hostname: 'lidarr.local',
        port: 8686,
        apiKey: 'test-key',
        baseUrl: '',
        useSsl: false,
        activeProfileId: 1,
        activeProfileName: 'Lossless',
        activeMetadataProfileId: 1,
        activeDirectory: '/music',
        is4k: false,
        isDefault: true,
        syncEnabled: false,
        preventSearch: false,
        tagRequests: false,
        externalUrl: '',
        tags: [],
        overrideRule: [],
      },
    ];
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'request-with-scan-disabled',
        mediaType: MediaType.MUSIC,
        serviceId: 12,
        externalServiceId: 45,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const getAlbum = mock.method(
      LidarrAPI.prototype,
      'getAlbum',
      async () =>
        ({
          id: 45,
          title: 'Requested Album',
          monitored: true,
          foreignAlbumId: 'request-with-scan-disabled',
          statistics: {
            trackFileCount: 8,
            trackCount: 8,
            totalTrackCount: 8,
            sizeOnDisk: 1_000,
            percentOfTracks: 100,
          },
        }) as LidarrAlbum
    );

    await reconcileRequestedMusicAvailability([
      {
        type: MediaType.MUSIC,
        status: MediaRequestStatus.APPROVED,
        media,
      } as MediaRequest,
    ]);

    assert.strictEqual(getAlbum.mock.callCount(), 1);
    assert.strictEqual(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.AVAILABLE
    );
  });
});
