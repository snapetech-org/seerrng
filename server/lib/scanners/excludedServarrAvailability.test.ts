import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { reconcileExcludedServarrAvailability } from './excludedServarrAvailability';

setupTestDb();

it('preserves pending and blocked seasons while clearing excluded library availability', async () => {
  const repository = getRepository(Media);
  const item = await repository.save(
    new Media({
      tmdbId: 890901,
      mediaType: MediaType.TV,
      serviceId: 42,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
      seasons: [
        MediaStatus.PENDING,
        MediaStatus.BLOCKLISTED,
        MediaStatus.AVAILABLE,
      ].map(
        (status, index) =>
          new Season({
            seasonNumber: index + 1,
            status,
            status4k: MediaStatus.UNKNOWN,
          })
      ),
    })
  );
  await reconcileExcludedServarrAvailability('sonarr', [
    { mediaId: item.id, serverId: 42, format: 'standard' },
  ]);
  const result = await repository.findOneByOrFail({ id: item.id });
  const statuses = new Map(
    result.seasons.map((season) => [season.seasonNumber, season.status])
  );
  assert.equal(statuses.get(1), MediaStatus.PENDING);
  assert.equal(statuses.get(2), MediaStatus.BLOCKLISTED);
  assert.equal(statuses.get(3), MediaStatus.UNKNOWN);
});
