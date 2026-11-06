import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { findBookMediaForBookResults } from './bookMediaMatcher';

setupTestDb();

async function seedIdentity(provider: MediaIdentifierProvider, value: string) {
  const media = await getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: MediaStatus.AVAILABLE,
    })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({ media, provider, value })
  );
  return media;
}

describe('Bookshelf scoped catalog matching (issue #382)', () => {
  it('resolves the exact Bookshelf identity without any ISBN', async () => {
    const id = makeBookshelfBookId(1, 'fixture-a');
    const media = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, id);
    const matches = await findBookMediaForBookResults([{ id }]);
    assert.equal(matches.get(id)?.id, media.id);
  });
  it('keeps equal foreign IDs from separate service namespaces distinct', async () => {
    const first = makeBookshelfBookId(1, 'fixture-a');
    const second = makeBookshelfBookId(2, 'fixture-a');
    const a = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, first);
    const b = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, second);
    const matches = await findBookMediaForBookResults([
      { id: first },
      { id: second },
    ]);
    assert.equal(matches.get(first)?.id, a.id);
    assert.equal(matches.get(second)?.id, b.id);
  });
  it('prefers exact catalog identity over a conflicting ISBN match', async () => {
    const id = makeBookshelfBookId(1, 'fixture-a');
    const exact = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, id);
    const other = await seedIdentity(
      MediaIdentifierProvider.ISBN,
      '9780306406157'
    );
    const matches = await findBookMediaForBookResults([
      { id, isbn13: '9780306406157' },
    ]);
    assert.notEqual(exact.id, other.id);
    assert.equal(matches.get(id)?.id, exact.id);
  });
  it('uses normalized valid ISBN fallback when no exact identity exists', async () => {
    const id = makeBookshelfBookId(1, 'missing-work');
    const media = await seedIdentity(
      MediaIdentifierProvider.ISBN,
      '9780306406157'
    );
    const matches = await findBookMediaForBookResults([
      { id, isbnCandidates: [{ isbn: '0-306-40615-2' }] },
    ]);
    assert.equal(matches.get(id)?.id, media.id);
  });
  it('rejects a Bookshelf ID falsely labelled as Open Library', async () => {
    const id = makeBookshelfBookId(1, 'fixture-a');
    await seedIdentity(MediaIdentifierProvider.BOOKSHELF, id);
    const matches = await findBookMediaForBookResults([
      { id, provider: 'openlibrary' },
    ]);
    assert.equal(matches.size, 0);
  });
  it('retains normalized Open Library matching and rejects invalid ISBN fallback', async () => {
    const media = await seedIdentity(
      MediaIdentifierProvider.OPENLIBRARY,
      'OL123W'
    );
    const matched = await findBookMediaForBookResults([
      { id: '/works/OL123W', provider: 'openlibrary' },
    ]);
    assert.equal(matched.get('OL123W')?.id, media.id);
    const unmatched = await findBookMediaForBookResults([
      { id: makeBookshelfBookId(1, 'missing-work'), isbn13: '9781234567890' },
    ]);
    assert.equal(unmatched.size, 0);
  });
});
