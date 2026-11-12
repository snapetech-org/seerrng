import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { listComicLibrary } from '@server/lib/comicDiscovery';
import { setupTestDb } from '@server/test/db';

setupTestDb();

const saveComic = async (cvId: number, status: MediaStatus) => {
  const media = await getRepository(Media).save(
    new Media({ tmdbId: 0, mediaType: MediaType.COMIC, status })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.COMICVINE,
      value: String(cvId),
      canonical: true,
    })
  );
  return media;
};

describe('comic library listing against a real database', () => {
  // Regression: `.take()` on a query with an unselected join made TypeORM build a
  // DISTINCT subquery ordered by distinctAlias.media_updatedAt, which SQLite rejects.
  it('reads library comic ids newest first without a query error', async () => {
    await saveComic(147500, MediaStatus.PARTIALLY_AVAILABLE);
    await saveComic(3622, MediaStatus.AVAILABLE);
    const looked: number[] = [];
    await listComicLibrary({
      lookupIndexed: async (ids) => {
        looked.push(...ids);
        return [];
      },
      lookupVolume: async () => undefined,
      findMedia: async () => new Map(),
      maxVolumeLookups: 0,
    });
    assert.deepEqual(
      [...looked].sort((a, b) => a - b),
      [3622, 147500]
    );
  });
});
