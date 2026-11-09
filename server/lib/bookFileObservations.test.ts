import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasAvailableBookFormat } from './bookAvailability';
import { projectBookFileObservations } from './bookFileObservations';
import {
  findBookMediaForBookResults,
  findBookMediaForWork,
} from './bookMediaMatcher';
setupTestDb();
const save = (data: Partial<Media>) =>
  getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: MediaStatus.UNKNOWN,
      ...data,
    })
  );

test('issue 625: a scoped catalog identity sees confirmed files on another row for the same provider book', async () => {
  const canonical = await save({
    audiobookServiceId: 1,
    audiobookExternalServiceId: 2096,
  });
  const owned = await save({
    status: MediaStatus.AVAILABLE,
    audiobookServiceId: 1,
    audiobookExternalServiceId: 2096,
    externalServiceId: 2802,
    serviceId: 0,
    availableAudiobookServiceIds: [1],
    audiobookLibraryServiceId: 2,
    audiobookLibraryItemId: 'abs-martian',
  });
  const id = makeBookshelfBookId(1, 'hc:2096');
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media: canonical,
      provider: MediaIdentifierProvider.BOOKSHELF,
      value: id,
    })
  );
  const media = (await findBookMediaForBookResults([{ id }])).get(id)!;
  assert.equal(media.id, canonical.id);
  assert.equal(hasAvailableBookFormat(media, 'audiobook'), true);
  assert.equal(hasAvailableBookFormat(media, 'ebook'), false);
  assert.equal(media.audiobookLibraryItemId, 'abs-martian');
  assert.equal(
    (await getRepository(Media).findOneByOrFail({ id: canonical.id })).status,
    MediaStatus.UNKNOWN
  );
  assert.equal(
    (await getRepository(Media).findOneByOrFail({ id: owned.id }))
      .audiobookLibraryItemId,
    'abs-martian'
  );
});
test('issue 625: a three-row ebook/audio bridge exposes both formats on Open Library detail without merging data', async () => {
  const ebook = await save({
    serviceId: 0,
    externalServiceId: 2043,
    status: MediaStatus.AVAILABLE,
    availableEbookServiceIds: [0],
  });
  await save({
    audiobookServiceId: 1,
    audiobookExternalServiceId: 2181,
    status: MediaStatus.AVAILABLE,
    availableAudiobookServiceIds: [1],
  });
  await save({
    serviceId: 0,
    externalServiceId: 2043,
    audiobookServiceId: 1,
    audiobookExternalServiceId: 2181,
    status: MediaStatus.AVAILABLE,
    audiobookLibraryServiceId: 2,
    audiobookLibraryItemId: 'abs-threshing',
  });
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media: ebook,
      provider: MediaIdentifierProvider.OPENLIBRARY,
      value: 'OL45870364W',
    })
  );
  const media = await findBookMediaForWork('OL45870364W', []);
  assert.ok(media);
  assert.equal(hasAvailableBookFormat(media, 'ebook'), true);
  assert.equal(hasAvailableBookFormat(media, 'audiobook'), true);
  assert.equal(
    (await getRepository(Media).findOneByOrFail({ id: ebook.id }))
      .audiobookLibraryItemId,
    null
  );
});
test('same numeric provider IDs on another server, pending imports and blocked records cannot claim availability', async () => {
  const missing = await save({ serviceId: 4, externalServiceId: 2038 });
  await save({
    serviceId: 5,
    externalServiceId: 2038,
    status: MediaStatus.AVAILABLE,
    availableEbookServiceIds: [5],
  });
  await save({
    serviceId: 4,
    externalServiceId: 2215,
    status: MediaStatus.AVAILABLE,
    availableEbookServiceIds: [4],
  });
  const pending = await save({
    audiobookServiceId: 1,
    audiobookExternalServiceId: 329,
    status: MediaStatus.PROCESSING,
    availableAudiobookServiceIds: [],
  });
  const blocked = await save({
    audiobookServiceId: 1,
    audiobookExternalServiceId: 2096,
    status: MediaStatus.BLOCKLISTED,
  });
  const results = await projectBookFileObservations([
    missing,
    pending,
    blocked,
  ]);
  for (const item of [missing, pending, blocked])
    assert.equal(hasAvailableBookFormat(results.get(item.id)!, 'ebook'), false);
  assert.equal(
    hasAvailableBookFormat(results.get(pending.id)!, 'audiobook'),
    false
  );
  assert.equal(results.get(blocked.id)!.status, MediaStatus.BLOCKLISTED);
});

test('duplicate provider records for the same work join only within their configured service', async () => {
  const original = await save({
    serviceId: 0,
    externalServiceId: 2038,
    status: MediaStatus.AVAILABLE,
    availableEbookServiceIds: [0],
  });
  const duplicate = await save({ serviceId: 0, externalServiceId: 2215 });
  const otherServer = await save({ serviceId: 2, externalServiceId: 2215 });
  for (const media of [original, duplicate, otherServer])
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.READARR,
        value: 'hc:fourth-wing-fixture',
      })
    );
  const result = await projectBookFileObservations([duplicate, otherServer]);
  assert.equal(
    hasAvailableBookFormat(result.get(duplicate.id)!, 'ebook'),
    true
  );
  assert.equal(
    hasAvailableBookFormat(result.get(otherServer.id)!, 'ebook'),
    false
  );
  assert.equal(
    (await getRepository(Media).findOneByOrFail({ id: duplicate.id })).status,
    MediaStatus.UNKNOWN
  );
});

test('confirmed ebook files cannot promote a stale pending Plex or ABS audio reference', async () => {
  const pending = await save({
    serviceId: 14,
    externalServiceId: 12345,
    status: MediaStatus.PENDING,
    ratingKey: 'stale-pending-audio',
    audiobookLibraryServiceId: 9,
    audiobookLibraryItemId: 'stale-abs-audio',
  });
  await save({
    serviceId: 14,
    externalServiceId: 12345,
    status: MediaStatus.AVAILABLE,
    availableEbookServiceIds: [14],
  });
  const observed = (await projectBookFileObservations([pending])).get(
    pending.id
  )!;
  assert.equal(hasAvailableBookFormat(observed, 'ebook'), true);
  assert.equal(hasAvailableBookFormat(observed, 'audiobook'), false);
  assert.equal(observed.ratingKey, null);
  assert.equal(observed.audiobookLibraryItemId, null);
});
