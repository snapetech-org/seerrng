import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import AurralAPI, { type AurralLibraryAlbumItem } from '@server/api/aurral';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { aurralScanner } from '@server/lib/scanners/aurral';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

setupTestDb();

const PARTIAL_MBID = '0a000000-0000-4000-8000-000000000001';
const LOOSE_MBID = '0a000000-0000-4000-8000-000000000002';
const TRACKED_MBID = '0a000000-0000-4000-8000-000000000003';
const STALE_MBID = '0a000000-0000-4000-8000-000000000004';
const LATE_MBID = '0a000000-0000-4000-8000-000000000005';

const album = (
  overrides: Partial<AurralLibraryAlbumItem> & { id: number }
): AurralLibraryAlbumItem => ({
  title: `Album ${overrides.id}`,
  albumArtist: 'Artist',
  monitored: false,
  trackCount: 12,
  availableTrackCount: 0,
  ...overrides,
});

const findStatus = async (mbId: string) =>
  (
    await getRepository(Media).findOne({
      where: { mbId, mediaType: MediaType.MUSIC },
    })
  )?.status;

const saveMusic = (mbId: string, status: MediaStatus, externalServiceId = 0) =>
  getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mbId,
      mediaType: MediaType.MUSIC,
      musicServiceType: 'aurral',
      serviceId: 51,
      ...(externalServiceId ? { externalServiceId } : {}),
      status,
      status4k: MediaStatus.UNKNOWN,
    })
  );

const backdate = async (id: number) =>
  getRepository(Media)
    .createQueryBuilder()
    .update(Media)
    .set({ updatedAt: new Date(Date.now() - 10 * 60 * 1000) })
    .where('id = :id', { id })
    .execute();

describe('Aurral scanner', () => {
  beforeEach(() => {
    getSettings().aurral = [
      {
        id: 51,
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

  it('uses the same partial rule as the request poll', async () => {
    const tracked = await saveMusic(TRACKED_MBID, MediaStatus.PROCESSING);
    await backdate(tracked.id);

    mock.method(AurralAPI.prototype, 'getLibraryAlbumsPage', async () => ({
      page: 1,
      pageSize: 100,
      total: 3,
      hasMore: false,
      items: [
        // monitored, 11 of 12 tracks: partial, not "processing"
        album({
          id: 1,
          releaseGroupMbid: PARTIAL_MBID,
          monitored: true,
          availableTrackCount: 11,
        }),
        // one loose song on an album nobody asked for: no media row
        album({ id: 2, releaseGroupMbid: LOOSE_MBID, availableTrackCount: 1 }),
        // requested, Aurral stopped monitoring, 10 of 12 tracks: stays
        // partial instead of looking never requested
        album({
          id: 3,
          releaseGroupMbid: TRACKED_MBID,
          availableTrackCount: 10,
        }),
      ],
    }));

    await aurralScanner.run();

    assert.strictEqual(
      await findStatus(PARTIAL_MBID),
      MediaStatus.PARTIALLY_AVAILABLE
    );
    assert.strictEqual(await findStatus(LOOSE_MBID), undefined);
    assert.strictEqual(
      await findStatus(TRACKED_MBID),
      MediaStatus.PARTIALLY_AVAILABLE
    );

    // a second run does not flip the status
    await aurralScanner.run();
    assert.strictEqual(
      await findStatus(PARTIAL_MBID),
      MediaStatus.PARTIALLY_AVAILABLE
    );
  });

  it('does not reset an album requested while the scan was running', async () => {
    const stale = await saveMusic(STALE_MBID, MediaStatus.UNKNOWN, 900);
    stale.status = MediaStatus.PROCESSING;
    await getRepository(Media).save(stale);
    await backdate(stale.id);
    const late = await saveMusic(LATE_MBID, MediaStatus.UNKNOWN, 901);
    await backdate(late.id);

    mock.method(AurralAPI.prototype, 'getLibraryAlbumsPage', async () => {
      // the album is requested after its page was read
      const current = await getRepository(Media).findOneByOrFail({
        id: late.id,
      });
      current.status = MediaStatus.PROCESSING;
      await getRepository(Media).save(current);
      return {
        page: 1,
        pageSize: 100,
        total: 0,
        hasMore: false,
        items: [],
      };
    });

    await aurralScanner.run();

    // the old PROCESSING row that Aurral no longer has is reset
    assert.strictEqual(await findStatus(STALE_MBID), MediaStatus.UNKNOWN);
    // the row requested during the scan is left alone
    assert.strictEqual(await findStatus(LATE_MBID), MediaStatus.PROCESSING);
  });
});
