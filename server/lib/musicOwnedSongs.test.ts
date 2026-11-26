import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type AurralAPI from '@server/api/aurral';
import type { AurralLibraryTrackPage } from '@server/api/aurral';
import {
  OWNED_SONGS_DELTA_REFRESH_MS,
  OWNED_SONGS_FULL_REFRESH_MS,
  getOwnedAlbums,
  getOwnedSongKeys,
  isOwnedArtist,
  markOwnedSongs,
  ownedAlbumState,
  ownedSongKey,
  ownedSongKeysFor,
  resetOwnedSongIndexes,
} from './musicOwnedSongs';

type PageLoader = (
  page: number,
  pageSize: number,
  sort: 'name' | 'newest'
) => Promise<AurralLibraryTrackPage>;

const fakeAurral = (loader: PageLoader) => {
  const calls: { page: number; sort: string }[] = [];
  const aurral = {
    getLibraryTrackPage: async (
      page: number,
      pageSize: number,
      sort: 'name' | 'newest'
    ) => {
      calls.push({ page, sort });
      return loader(page, pageSize, sort);
    },
  } as unknown as AurralAPI;
  return { aurral, calls };
};

const page = (
  items: { title: string; artistName: string }[],
  total: number,
  pageNumber = 1
): AurralLibraryTrackPage => ({
  page: pageNumber,
  total,
  hasMore: false,
  items,
});

const song = (title: string, artistName: string, inLibrary = false) => ({
  title,
  artistName,
  inLibrary,
});

describe('owned songs by artist and title', () => {
  afterEach(() => {
    mock.restoreAll();
    resetOwnedSongIndexes();
  });

  it('matches across "feat." parts, remaster suffixes, case and punctuation, never across artists', () => {
    const key = ownedSongKey('STELLA LEFTY', 'Boston');
    assert.ok(key);
    assert.strictEqual(
      ownedSongKey('Stella Lefty', 'Boston (feat. Nobody)'),
      key
    );
    assert.strictEqual(
      ownedSongKey('stella lefty feat. Someone', 'Boston - Remastered 2011'),
      key
    );
    assert.notStrictEqual(ownedSongKey('Augustana', 'Boston'), key);
    assert.notStrictEqual(ownedSongKey('STELLA LEFTY', 'Slow Dancin'), key);
    assert.strictEqual(
      ownedSongKey('AC/DC', 'T.N.T.'),
      ownedSongKey('ACDC', 'TNT')
    );
    assert.strictEqual(ownedSongKey('', 'Boston'), '');
  });

  it('reads every library page once, marks owned songs, and answers from the index meanwhile', async () => {
    let now = 1_000_000;
    mock.method(Date, 'now', () => now);
    const { aurral, calls } = fakeAurral(async (pageNumber, _size, sort) => {
      if (sort === 'newest') {
        return page([{ title: 'Fresh Song', artistName: 'New Artist' }], 1);
      }
      return pageNumber === 1
        ? page([{ title: 'Boston', artistName: 'STELLA LEFTY' }], 150)
        : page([{ title: 'Other Song', artistName: 'Someone' }], 150, 2);
    });

    const keys = await getOwnedSongKeys(aurral, 'server-a');
    assert.ok(keys);
    assert.deepStrictEqual(
      calls.map((call) => call.page),
      [1, 2]
    );
    const marked = markOwnedSongs(
      [
        song('Boston', 'STELLA LEFTY'),
        song('Boston', 'Augustana'),
        song('Other Song (Radio Edit)', 'Someone'),
      ],
      keys
    );
    assert.deepStrictEqual(
      marked.map((track) => track.inLibrary),
      [true, false, true]
    );

    // within a minute: no upstream call at all
    now += 30_000;
    await getOwnedSongKeys(aurral, 'server-a');
    assert.strictEqual(calls.length, 2);

    // after a minute: one call for the newest songs
    now += OWNED_SONGS_DELTA_REFRESH_MS;
    const refreshed = await getOwnedSongKeys(aurral, 'server-a');
    assert.strictEqual(calls.length, 3);
    assert.strictEqual(calls[2].sort, 'newest');
    assert.ok(refreshed?.has(ownedSongKey('New Artist', 'Fresh Song')));

    // past the full refresh the old index answers while the new one is read
    now += OWNED_SONGS_FULL_REFRESH_MS;
    const stale = await getOwnedSongKeys(aurral, 'server-a');
    assert.ok(stale?.has(ownedSongKey('STELLA LEFTY', 'Boston')));
  });

  it('a refresh with a page it could not read keeps the songs it missed', async () => {
    let now = 5_000_000;
    mock.method(Date, 'now', () => now);
    let failPage2 = false;
    let refreshes = 0;
    const { aurral } = fakeAurral(async (pageNumber, _size, sort) => {
      if (sort === 'newest') return page([], 101);
      if (pageNumber === 1) {
        refreshes += 1;
        return page([{ title: 'First', artistName: 'Artist A' }], 101);
      }
      if (failPage2) throw new Error('Aurral busy');
      return page([{ title: 'Second', artistName: 'Artist B' }], 101, 2);
    });

    const first = await getOwnedSongKeys(aurral, 'server-refresh');
    assert.ok(first?.has(ownedSongKey('Artist B', 'Second')));

    failPage2 = true;
    now += OWNED_SONGS_FULL_REFRESH_MS + 1;
    await getOwnedSongKeys(aurral, 'server-refresh');
    for (let i = 0; i < 50 && refreshes < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const after = await getOwnedSongKeys(aurral, 'server-refresh');
    assert.strictEqual(refreshes, 2);
    assert.ok(after?.has(ownedSongKey('Artist A', 'First')));
    assert.ok(after?.has(ownedSongKey('Artist B', 'Second')));
  });

  it('marks nothing when the library cannot be read, and keeps pages that were read', async () => {
    const failing = fakeAurral(async () => {
      throw new Error('Aurral is down');
    });
    const keys = await getOwnedSongKeys(failing.aurral, 'server-b');
    assert.strictEqual(keys, null);
    const tracks = [song('Boston', 'STELLA LEFTY')];
    assert.strictEqual(markOwnedSongs(tracks, keys), tracks);

    const partial = fakeAurral(async (pageNumber) => {
      if (pageNumber === 2) throw new Error('page 2 failed');
      return page([{ title: 'Boston', artistName: 'STELLA LEFTY' }], 200);
    });
    const partialKeys = await getOwnedSongKeys(partial.aurral, 'server-c');
    assert.ok(partialKeys?.has(ownedSongKey('STELLA LEFTY', 'Boston')));
  });

  it('does not wait long for a slow first read', async () => {
    const slow = fakeAurral(
      () => new Promise<AurralLibraryTrackPage>(() => undefined)
    );
    const started = Date.now();
    const keys = await getOwnedSongKeys(slow.aurral, 'server-d');
    assert.strictEqual(keys, null);
    assert.ok(Date.now() - started < 3_000);
  });
});

describe('owned albums by release group', () => {
  afterEach(() => {
    mock.restoreAll();
    resetOwnedSongIndexes();
  });

  const album = (
    id: number,
    releaseGroupMbid: string | null,
    trackCount: number,
    availableTrackCount: number,
    title = `Album ${id}`,
    artistName = 'Artist'
  ) => ({
    id,
    title,
    artistName,
    mbid: null,
    releaseGroupMbid,
    releaseDate: null,
    addedAt: null,
    trackCount,
    availableTrackCount,
    coverUrl: '',
  });
  const RG_FULL = '11111111-1111-4111-8111-111111111111';
  const RG_PART = '22222222-2222-4222-8222-222222222222';
  const RG_TWO = '33333333-3333-4333-8333-333333333333';

  it('says owned or partly owned with the library counts, merging two editions, and knows the artists', async () => {
    const aurral = {
      getLibraryAlbumPage: async () => ({
        kind: 'albums' as const,
        page: 1,
        pageSize: 60,
        total: 5,
        hasMore: false,
        items: [
          album(1, RG_FULL, 12, 12),
          album(2, RG_PART, 10, 1, 'My Finest Work Yet', 'Andrew Bird'),
          // two editions of one release group: the complete one wins
          album(3, RG_TWO, 16, 8),
          album(4, RG_TWO, 22, 22),
          album(5, null, 1, 1, 'Iris', 'Gareth'),
        ],
      }),
    } as unknown as AurralAPI;

    const lookup = await getOwnedAlbums(aurral, 'server-a');
    assert.ok(lookup);
    assert.deepEqual(ownedAlbumState(lookup, { mbid: RG_FULL }), {
      status: 'owned',
      trackCount: 12,
      availableTrackCount: 12,
    });
    assert.deepEqual(ownedAlbumState(lookup, { mbid: RG_PART.toUpperCase() }), {
      status: 'partial',
      trackCount: 10,
      availableTrackCount: 1,
    });
    assert.equal(ownedAlbumState(lookup, { mbid: RG_TWO })?.status, 'owned');
    // an album without an MBID is found by artist and title only
    assert.equal(
      ownedAlbumState(lookup, { artistName: 'Gareth', title: 'Iris' })?.status,
      'owned'
    );
    assert.equal(
      ownedAlbumState(lookup, { mbid: RG_PART.replace('2', '9') }),
      null
    );
    assert.equal(isOwnedArtist(lookup, 'ANDREW BIRD'), true);
    assert.equal(isOwnedArtist(lookup, 'Andrew Bird feat. Someone'), true);
    assert.equal(isOwnedArtist(lookup, 'Phoebe Bridgers'), false);
  });

  it('marks nothing when the library album pages cannot be read', async () => {
    const aurral = {
      getLibraryAlbumPage: async () => {
        throw new Error('Aurral is down');
      },
    } as unknown as AurralAPI;
    assert.equal(await getOwnedAlbums(aurral, 'server-b'), null);
    assert.equal(ownedAlbumState(null, { mbid: RG_FULL }), null);
    assert.equal(isOwnedArtist(null, 'Andrew Bird'), false);
  });
});

describe('ownedSongKeysFor', () => {
  it('also files a shared credit under the first artist', () => {
    assert.deepEqual(
      ownedSongKeysFor('Noah Kahan with Post Malone', 'Dial Drunk'),
      [
        ownedSongKey('Noah Kahan with Post Malone', 'Dial Drunk'),
        ownedSongKey('Noah Kahan', 'Dial Drunk'),
      ]
    );
    assert.ok(
      ownedSongKeysFor('Noah Kahan & Lizzy McAlpine', 'Call Your Mom').includes(
        ownedSongKey('Noah Kahan', 'Call Your Mom')
      )
    );
    assert.ok(
      ownedSongKeysFor('Sabrina Carpenter, Kali Uchis', 'Song').includes(
        ownedSongKey('Sabrina Carpenter', 'Song')
      )
    );
  });

  it('keeps a single-artist credit as one key', () => {
    assert.deepEqual(ownedSongKeysFor('Noah Kahan', 'Stick Season'), [
      ownedSongKey('Noah Kahan', 'Stick Season'),
    ]);
    assert.deepEqual(
      ownedSongKeysFor('Noah Kahan feat. Kacey Musgraves', 'She Calls Me Back'),
      [ownedSongKey('Noah Kahan', 'She Calls Me Back')]
    );
    assert.deepEqual(ownedSongKeysFor('', 'x'), []);
  });
});

describe('owned-song index after a quiet hour', () => {
  afterEach(() => {
    mock.restoreAll();
    resetOwnedSongIndexes();
  });

  it('keeps answering from the old index while a slow new read runs', async () => {
    let now = 5_000_000;
    mock.method(Date, 'now', () => now);
    let slow = false;
    const { aurral } = fakeAurral(async (_page, _size, sort) => {
      if (slow && sort === 'name') {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      return page([{ title: 'Dial Drunk', artistName: 'Noah Kahan' }], 1);
    });
    const first = await getOwnedSongKeys(aurral, 'server-quiet');
    assert.ok(first?.has(ownedSongKey('Noah Kahan', 'Dial Drunk')));

    // an hour with no visits, and the library is slow to read again
    now += 60 * 60_000;
    slow = true;
    const later = await getOwnedSongKeys(aurral, 'server-quiet');
    assert.ok(later?.has(ownedSongKey('Noah Kahan', 'Dial Drunk')));
  });
});
