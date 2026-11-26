import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ownedSongKey } from '@server/lib/musicOwnedSongs';
import {
  buildRequestAllPlan,
  classifyArtistReleaseGroups,
  clearReleaseGroupEditionCache,
  collapseRedundantAlbumResults,
  isStudioReleaseGroup,
  isUnofficialReleaseGroup,
  loadReleaseGroupEditions,
  releaseGroupsToInspect,
  requestAllSongKey,
  type ReleaseGroupEdition,
  type RequestAllReleaseGroup,
} from '@server/lib/musicRequestAllPlan';

const group = (
  id: string,
  title: string,
  primaryType: 'Album' | 'EP' | 'Single',
  year: number | null,
  extra: Partial<RequestAllReleaseGroup> = {}
): RequestAllReleaseGroup => ({
  id,
  title,
  primaryType,
  year,
  secondaryTypes: [],
  ...extra,
});

const loaderFrom = (tracks: Record<string, string[] | null | Error>) => {
  const calls: string[] = [];
  const loadTracks = async (mbid: string) => {
    calls.push(mbid);
    const value = tracks[mbid];
    if (value instanceof Error) throw value;
    return value ?? null;
  };
  return { loadTracks, calls };
};

const ids = (items: { mbid: string }[]) => items.map((item) => item.mbid);
const skippedBy = (
  plan: Awaited<ReturnType<typeof buildRequestAllPlan>>,
  mbid: string
) => plan.skipped.find((item) => item.mbid === mbid)?.reasonCode;

describe('requestAllSongKey', () => {
  it('treats edits, single versions and remasters as the same song', () => {
    const bad = requestAllSongKey('Bad');
    for (const title of [
      'Bad (Radio Edit)',
      'Bad (Single Version)',
      'Bad (Remastered)',
      'Bad - 2012 Remaster',
      'Bad [Remastered 2001]',
      'Bad (feat. Someone)',
    ]) {
      assert.strictEqual(requestAllSongKey(title), bad, title);
    }
  });

  it('keeps live, remix, acoustic, demo and instrumental versions apart', () => {
    const bad = requestAllSongKey('Bad');
    for (const title of [
      'Bad (Live)',
      'Bad (Remix)',
      'Bad (Acoustic)',
      'Bad (Demo)',
      'Bad (Instrumental)',
      'Bad - Live at Wembley',
      'Bad (Dance Extended Mix)',
    ]) {
      assert.notStrictEqual(requestAllSongKey(title), bad, title);
    }
    assert.strictEqual(
      requestAllSongKey('Bad (Live)'),
      requestAllSongKey('Bad [Live]')
    );
    // a radio mix is the usual cut
    assert.strictEqual(requestAllSongKey('Bad (Radio Mix)'), bad);
  });
});

describe('buildRequestAllPlan', () => {
  it('requests each Michael Jackson song once: one Bad, one Ben, one Butterflies', async () => {
    const { loadTracks } = loaderFrom({
      'ben-album': ['Ben', 'Greatest Show on Earth', 'My Girl'],
      'bad-album': [
        'Bad',
        'The Way You Make Me Feel',
        'Man in the Mirror',
        'Dirty Diana',
      ],
      'bad-edition': ['Bad', 'The Way You Make Me Feel', 'Man in the Mirror'],
      'invincible-album': ['Unbreakable', 'Butterflies', 'You Rock My World'],
      'bad-single': ['Bad', 'Bad (Single Version)'],
      'bad-single-2': ['Bad (Radio Edit)'],
      'bad-single-3': ['Bad - 2012 Remaster'],
      'ben-single': ['Ben'],
      'butterflies-single': ['Butterflies'],
      'butterflies-promo': ['Butterflies (Radio Edit)'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Michael Jackson',
      releaseGroups: [
        group('bad-album', 'Bad', 'Album', 1987),
        group('bad-edition', 'Bad (Special Edition)', 'Album', 2001),
        group('ben-album', 'Ben', 'Album', 1972),
        group('invincible-album', 'Invincible', 'Album', 2001),
        group('live-album', 'Live at Wembley', 'Album', 2012, {
          secondaryTypes: ['Live'],
        }),
        group('bad-single', 'Bad', 'Single', 1987),
        group('bad-single-2', 'Bad', 'Single', 1987),
        group('bad-single-3', 'Bad', 'Single', 2012),
        group('ben-single', 'Ben', 'Single', 1972),
        group('butterflies-single', 'Butterflies', 'Single', 2001),
        group('butterflies-promo', 'Butterflies', 'Single', 2001),
      ],
      loadTracks,
    });

    assert.deepStrictEqual(ids(plan.albums), [
      'ben-album',
      'bad-album',
      'invincible-album',
    ]);
    assert.deepStrictEqual(ids(plan.epsAndSingles), []);
    assert.strictEqual(skippedBy(plan, 'bad-edition'), 'sameAlbum');
    assert.strictEqual(
      plan.skipped.find((item) => item.mbid === 'bad-edition')?.reason,
      'Same album, another edition.'
    );
    for (const single of [
      'bad-single',
      'bad-single-2',
      'bad-single-3',
      'ben-single',
      'butterflies-single',
      'butterflies-promo',
    ]) {
      assert.strictEqual(skippedBy(plan, single), 'covered', single);
    }
    // compilations, live albums and the like are not part of Get all
    assert.strictEqual(skippedBy(plan, 'live-album'), undefined);
    assert.deepStrictEqual(plan.counts, {
      albums: 3,
      epsAndSingles: 0,
      songs: 0,
      skipped: 7,
      covered: 7,
      unofficial: 0,
      bonusSongs: 0,
    });
  });

  it('requests a single whose B-side is on no album', async () => {
    const { loadTracks } = loaderFrom({
      album: ['Song A', 'Song C'],
      single: ['Song A', 'Song B'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('album', 'First', 'Album', 2000),
        group('single', 'Song A', 'Single', 2000),
      ],
      loadTracks,
    });
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['single']);
    assert.strictEqual(plan.epsAndSingles[0].newSongs, 1);
  });

  it('leaves out live and remix singles of album songs (Nick: remixes stay out)', async () => {
    const { loadTracks } = loaderFrom({
      album: ['Song A'],
      live: ['Song A (Live)'],
      remix: ['Song A (Remix)'],
      edit: ['Song A (Radio Edit)'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('album', 'First', 'Album', 2000),
        group('live', 'Song A (Live)', 'Single', 2001),
        group('remix', 'Song A', 'Single', 2002),
        group('edit', 'Song A', 'Single', 2003),
      ],
      loadTracks,
    });
    assert.deepStrictEqual(ids(plan.epsAndSingles), []);
    assert.strictEqual(skippedBy(plan, 'live'), 'covered');
    assert.strictEqual(skippedBy(plan, 'remix'), 'covered');
    assert.strictEqual(skippedBy(plan, 'edit'), 'covered');
    assert.deepStrictEqual(plan.songs, []);
  });

  it('skips owned, part-owned, requested and blocklisted releases, and an edition of an owned album', async () => {
    const { loadTracks } = loaderFrom({
      owned: ['Owned Song'],
      single: ['Owned Song'],
      'partial-single': ['Partial Song'],
      'index-single': ['Indexed Song'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('owned', 'Owned', 'Album', 2000, { inLibrary: true }),
        group('owned-edition', 'Owned (Deluxe)', 'Album', 2010),
        group('partial', 'Partial', 'Album', 2001, { partial: true }),
        group('requested', 'Requested', 'Album', 2002, { requested: true }),
        group('blocked', 'Blocked', 'Album', 2003, { blocklisted: true }),
        group('single', 'Owned Song', 'Single', 2000),
        // a part-owned album only brings the songs the library has
        group('partial-single', 'Partial Song', 'Single', 2001),
        group('index-single', 'Indexed Song', 'Single', 2001),
      ],
      loadTracks,
      ownedSongKeys: new Set([ownedSongKey('Band', 'Indexed Song')]),
    });
    assert.deepStrictEqual(ids(plan.albums), []);
    assert.strictEqual(skippedBy(plan, 'owned'), 'owned');
    assert.strictEqual(skippedBy(plan, 'owned-edition'), 'sameAlbum');
    assert.strictEqual(skippedBy(plan, 'partial'), 'partial');
    assert.strictEqual(skippedBy(plan, 'requested'), 'requested');
    assert.strictEqual(skippedBy(plan, 'blocked'), 'blocklisted');
    assert.strictEqual(skippedBy(plan, 'single'), 'covered');
    assert.strictEqual(skippedBy(plan, 'index-single'), 'covered');
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['partial-single']);
  });

  it('collapses album groups with the same title to the earliest one', async () => {
    const { loadTracks } = loaderFrom({});
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('later', 'Same Title', 'Album', 2005),
        group('undated', 'same title', 'Album', null),
        group('first', 'Same Title (Remastered)', 'Album', 1999),
      ],
      loadTracks,
    });
    assert.deepStrictEqual(ids(plan.albums), ['first']);
    assert.strictEqual(skippedBy(plan, 'later'), 'sameAlbum');
    assert.strictEqual(skippedBy(plan, 'undated'), 'sameAlbum');
  });

  it('never requests two singles with the same songs', async () => {
    const { loadTracks } = loaderFrom({
      one: ['Fresh', 'Fresh (Remix)'],
      two: ['Fresh (Radio Edit)', 'Fresh [Remix]'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('two', 'Fresh', 'Single', 2011),
        group('one', 'Fresh', 'Single', 2010),
      ],
      loadTracks,
    });
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['one']);
    assert.strictEqual(skippedBy(plan, 'two'), 'duplicate');
  });

  it('judges a single by its title when its tracklist cannot be loaded', async () => {
    const { loadTracks } = loaderFrom({
      album: ['Hit', 'Other'],
      'hit-single': new Error('timed out'),
      'new-single': null,
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('album', 'Record', 'Album', 2000),
        group('hit-single', 'Hit', 'Single', 2000),
        group('new-single', 'Brand New', 'Single', 2001),
        group('title-single', 'Record', 'Single', 2001),
      ],
      loadTracks,
    });
    assert.strictEqual(skippedBy(plan, 'hit-single'), 'covered');
    // the album's own title counts as one of its songs
    assert.strictEqual(skippedBy(plan, 'title-single'), 'covered');
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['new-single']);
  });

  it('falls back to titles only when there are too many releases to inspect', async () => {
    const { loadTracks, calls } = loaderFrom({
      album: ['Hit'],
      single: ['Hit', 'Hidden B-side'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('album', 'Record', 'Album', 2000),
        group('single', 'Hit', 'Single', 2000),
        group('ep', 'Other EP', 'EP', 2001),
      ],
      loadTracks,
      maxInspected: 2,
    });
    assert.strictEqual(plan.titleOnly, true);
    assert.deepStrictEqual(calls, ['album']);
    assert.strictEqual(skippedBy(plan, 'single'), 'covered');
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['ep']);
  });

  it('lists EPs before singles', async () => {
    const { loadTracks } = loaderFrom({
      single: ['One'],
      ep: ['Two', 'Three'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('single', 'One', 'Single', 1990),
        group('ep', 'Two', 'EP', 2000),
      ],
      loadTracks,
    });
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['ep', 'single']);
  });
});

describe('unofficial releases', () => {
  it('knows promo, bootleg and platform-exclusive releases', () => {
    for (const title of [
      'Michael Jackson Regrooved',
      'HIStory LIFEstyle Promo CD',
      'Butterflies Promo CD',
      'Moonwalker Soundtrack',
      'Apple Music Home Session: Bad',
      'Spotify Singles',
      'Live in Bucharest (Bootleg)',
      'Interview Disc',
      'Radio Sampler 2001',
    ]) {
      assert.strictEqual(
        isUnofficialReleaseGroup({ title, secondaryTypes: [] }),
        true,
        title
      );
    }
    for (const title of ['Bad', 'Thriller', 'Promotion', 'Off the Wall']) {
      assert.strictEqual(
        isUnofficialReleaseGroup({ title, secondaryTypes: [] }),
        false,
        title
      );
    }
    // the official soundtrack carries the type
    assert.strictEqual(
      isUnofficialReleaseGroup({
        title: 'Moonwalker Soundtrack',
        secondaryTypes: ['Soundtrack'],
      }),
      false
    );
    // a catalog status decides when there is one
    assert.strictEqual(
      isUnofficialReleaseGroup({
        title: 'Dangerous',
        secondaryTypes: [],
        releaseStatuses: ['Promotion'],
      }),
      true
    );
    assert.strictEqual(
      isUnofficialReleaseGroup({
        title: 'Dangerous',
        secondaryTypes: [],
        releaseStatuses: ['Official', 'Promotion'],
      }),
      false
    );
  });

  it('skips unofficial releases and subtitled editions in Get all', async () => {
    const { loadTracks } = loaderFrom({
      dangerous: ['Dangerous', 'Black or White'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Michael Jackson',
      releaseGroups: [
        group('dangerous', 'Dangerous', 'Album', 1991),
        group('man-in-black', 'Dangerous: Man in Black', 'Album', 2005),
        group('regrooved', 'Michael Jackson Regrooved', 'Album', 2009),
        group('moonwalker', 'Moonwalker Soundtrack', 'Album', 1988),
        group('history-promo', 'HIStory LIFEstyle Promo CD', 'Single', 1996),
        group('butterflies-promo', 'Butterflies Promo CD', 'Single', 2001),
        group('apple', 'Apple Music Home Session: Bad', 'EP', 2020),
        group('spotify', 'Spotify Singles', 'Single', 2019),
        // an owned promo stays what it is: owned
        group('owned-promo', 'Owned Promo CD', 'Single', 2000, {
          inLibrary: true,
        }),
      ],
      loadTracks,
    });
    assert.deepStrictEqual(ids(plan.albums), ['dangerous']);
    assert.deepStrictEqual(ids(plan.epsAndSingles), []);
    assert.strictEqual(skippedBy(plan, 'man-in-black'), 'sameAlbum');
    for (const mbid of [
      'regrooved',
      'moonwalker',
      'history-promo',
      'butterflies-promo',
      'apple',
      'spotify',
    ]) {
      assert.strictEqual(skippedBy(plan, mbid), 'unofficial', mbid);
    }
    assert.strictEqual(skippedBy(plan, 'owned-promo'), 'owned');
    assert.strictEqual(plan.counts.unofficial, 6);
    // the confirm sheet's "skipped: already covered or unofficial"
    assert.strictEqual(plan.counts.covered, 7);
  });
});

describe('partly new singles become song requests', () => {
  const benShape = () =>
    loaderFrom({
      'ben-album': ['Ben', 'Greatest Show on Earth'],
      'ben-single': [
        { title: 'Ben', durationMs: 165000 },
        { title: 'You Can Cry on My Shoulder', durationMs: 152000 },
      ] as unknown as string[],
      ep: ['Brand New', 'Also New'],
    });
  const benGroups = () => [
    group('ben-album', 'Ben', 'Album', 1972),
    group('ben-single', 'Ben', 'Single', 1972),
    group('ep', 'New Things', 'EP', 1973),
  ];

  it('requests the album and just the B-side of the Ben single', async () => {
    const { loadTracks } = benShape();
    const plan = await buildRequestAllPlan({
      artistName: 'Michael Jackson',
      releaseGroups: benGroups(),
      loadTracks,
      canRequestSongs: true,
    });
    assert.deepStrictEqual(ids(plan.albums), ['ben-album']);
    // a fully new EP is still requested whole
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['ep']);
    assert.strictEqual(skippedBy(plan, 'ben-single'), 'newSongsOnly');
    assert.deepStrictEqual(plan.songs, [
      {
        title: 'You Can Cry on My Shoulder',
        artistName: 'Michael Jackson',
        fromReleaseMbid: 'ben-single',
        fromReleaseTitle: 'Ben',
        durationMs: 152000,
      },
    ]);
    assert.strictEqual(plan.counts.songs, 1);
    // not "covered": its new song is coming
    assert.strictEqual(plan.counts.covered, 0);
  });

  it('requests the whole single for someone who may not request songs', async () => {
    const { loadTracks } = benShape();
    const plan = await buildRequestAllPlan({
      artistName: 'Michael Jackson',
      releaseGroups: benGroups(),
      loadTracks,
      canRequestSongs: false,
    });
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['ep', 'ben-single']);
    assert.deepStrictEqual(plan.songs, []);
  });

  it('asks for a B-side once when two singles carry it', async () => {
    const { loadTracks } = loaderFrom({
      album: ['Hit'],
      one: ['Hit', 'B-Side'],
      two: ['Hit (Radio Edit)', 'B-Side', 'Other B-Side'],
    });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('album', 'Record', 'Album', 2000),
        group('one', 'Hit', 'Single', 2000),
        group('two', 'Hit', 'Single', 2001),
      ],
      loadTracks,
      canRequestSongs: true,
    });
    assert.deepStrictEqual(
      plan.songs.map((song) => `${song.fromReleaseMbid}:${song.title}`),
      ['one:B-Side', 'two:Other B-Side']
    );
    assert.deepStrictEqual(ids(plan.epsAndSingles), []);
  });

  it('keeps a single whose tracks are unknown whole', async () => {
    const { loadTracks } = loaderFrom({ album: ['Hit'], single: null });
    const plan = await buildRequestAllPlan({
      artistName: 'Band',
      releaseGroups: [
        group('album', 'Record', 'Album', 2000),
        group('single', 'Fresh', 'Single', 2000),
      ],
      loadTracks,
      canRequestSongs: true,
    });
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['single']);
    assert.deepStrictEqual(plan.songs, []);
  });
});

describe('classifyArtistReleaseGroups (what the artist page hides)', () => {
  const tracks: Record<string, string[]> = {
    thriller: ['Billie Jean', 'Beat It', 'Thriller'],
    bad: ['Bad', 'Man in the Mirror', 'Smooth Criminal'],
    dangerous: ['Black or White', 'Remember the Time'],
    'bad-single': ['Bad', 'Bad (Dance Extended Mix)'],
    'smooth-single': ['Smooth Criminal (Radio Edit)'],
  };
  const tracksOf = (mbid: string) =>
    tracks[mbid]?.map((title) => ({ title })) ?? undefined;
  const mj = () => [
    group('thriller', 'Thriller', 'Album', 1982, { inLibrary: true }),
    group('bad', 'Bad', 'Album', 1987),
    group('bad-edition', 'Bad (Special Edition)', 'Album', 2001),
    group('dangerous', 'Dangerous', 'Album', 1991),
    group('man-in-black', 'Dangerous: Man in Black', 'Album', 2005),
    group('regrooved', 'Michael Jackson Regrooved', 'Album', 2009),
    group('live', 'Live at Wembley', 'Album', 2012, {
      secondaryTypes: ['Live'],
    }),
    group('billie-jean', 'Billie Jean', 'Single', 1983),
    group('beat-it', 'Beat It', 'Single', 1983, { inLibrary: true }),
    group('bad-single', 'Bad', 'Single', 1987),
    group('smooth-single', 'Smooth Criminal', 'Single', 1988),
    group('butterflies-promo', 'Butterflies Promo CD', 'Single', 2001),
    group('blood', 'Blood on the Dance Floor', 'Single', 1997),
    group('bad-live', 'Bad (Live)', 'Single', 1988),
  ];

  it('hides other editions, covered singles and promos, and says why', () => {
    const result = classifyArtistReleaseGroups({
      releaseGroups: mj(),
      tracksOf,
    });
    assert.deepStrictEqual(result.get('bad-edition'), {
      code: 'sameAlbum',
      reason: 'Another edition of Bad',
      coveredBy: { mbid: 'bad', title: 'Bad' },
      coveredByHave: false,
    });
    assert.strictEqual(result.get('man-in-black')?.code, 'sameAlbum');
    assert.strictEqual(
      result.get('man-in-black')?.coveredBy?.mbid,
      'dangerous'
    );
    assert.strictEqual(result.get('regrooved')?.code, 'unofficial');
    assert.strictEqual(result.get('butterflies-promo')?.code, 'unofficial');
    // on an owned album: the user has these songs
    assert.deepStrictEqual(result.get('billie-jean'), {
      code: 'covered',
      reason: 'On Thriller',
      coveredBy: { mbid: 'thriller', title: 'Thriller' },
      coveredByHave: true,
    });
    // on a studio album that is not owned: still hidden, the album is the
    // thing to get
    assert.strictEqual(result.get('smooth-single')?.code, 'covered');
    assert.strictEqual(result.get('smooth-single')?.coveredByHave, false);
    // a B-side that is a remix is a different recording: stays visible
    // its extended mix is a version, not a new song: Bad brings the song
    assert.strictEqual(result.get('bad-single')?.code, 'covered');
    assert.strictEqual(result.get('bad-live'), undefined);
    assert.strictEqual(result.get('blood'), undefined);
    // never hidden: owned releases, canonical albums, live albums
    for (const mbid of ['thriller', 'beat-it', 'bad', 'dangerous', 'live']) {
      assert.strictEqual(result.get(mbid), undefined, mbid);
    }
  });

  it('prefers the owned edition of an album', () => {
    const result = classifyArtistReleaseGroups({
      releaseGroups: [
        group('bad', 'Bad', 'Album', 1987),
        group('bad-25', 'Bad (25th Anniversary)', 'Album', 2012, {
          inLibrary: true,
        }),
      ],
      tracksOf: () => undefined,
    });
    assert.deepStrictEqual(result.get('bad'), {
      code: 'sameAlbum',
      reason: 'Another edition of Bad (25th Anniversary)',
      coveredBy: { mbid: 'bad-25', title: 'Bad (25th Anniversary)' },
      coveredByHave: true,
    });
    assert.strictEqual(result.get('bad-25'), undefined);
  });

  it('judges by titles alone while no track list is known', () => {
    const result = classifyArtistReleaseGroups({
      releaseGroups: [
        group('bad', 'Bad', 'Album', 1987),
        group('bad-single', 'Bad', 'Single', 1987),
        group('mirror', 'Man in the Mirror', 'Single', 1988),
      ],
      tracksOf: () => undefined,
    });
    assert.strictEqual(result.get('bad-single')?.code, 'covered');
    assert.strictEqual(result.get('mirror'), undefined);
  });

  it('hides a second single with the same songs, never a requested one', () => {
    const result = classifyArtistReleaseGroups({
      releaseGroups: [
        group('one', 'Fresh', 'Single', 2010),
        group('two', 'Fresh', 'Single', 2011),
        group('three', 'Fresh', 'Single', 2012, { requested: true }),
      ],
      tracksOf: () => undefined,
    });
    // the requested copy brings the song, so the other two are covered by it
    assert.strictEqual(result.get('one')?.code, 'covered');
    assert.strictEqual(result.get('one')?.coveredBy?.mbid, 'three');
    assert.strictEqual(result.get('two')?.code, 'covered');
    assert.strictEqual(result.get('three'), undefined);
  });

  it('hides a second single with the same songs when none is had', () => {
    const result = classifyArtistReleaseGroups({
      releaseGroups: [
        group('one', 'Fresh', 'Single', 2010),
        group('two', 'Fresh', 'Single', 2011),
      ],
      tracksOf: () => undefined,
    });
    assert.strictEqual(result.get('one'), undefined);
    assert.strictEqual(result.get('two')?.code, 'sameAlbum');
    assert.strictEqual(result.get('two')?.coveredBy?.mbid, 'one');
  });
});

describe('collapseRedundantAlbumResults (search and Discover)', () => {
  const album = (
    mbid: string,
    title: string,
    primaryType = 'Album',
    artistName = 'Michael Jackson',
    extra: { inLibrary?: boolean } = {}
  ) => ({ mbid, title, artistName, primaryType, inLibrary: false, ...extra });

  it('shows each album once, the owned edition first, and leaves out covered singles', () => {
    const results = collapseRedundantAlbumResults(
      [
        album('bad', 'Bad'),
        album('bad-edition', 'Bad (Special Edition)', 'Album', undefined, {
          inLibrary: true,
        }),
        album('bad-single', 'Bad', 'Single'),
        album('jean-single', 'Billie Jean', 'Single'),
        album('blood', 'Blood on the Dance Floor', 'Single'),
        album('other-bad', 'Bad', 'Album', 'Another Artist'),
      ],
      {
        tracks: [
          {
            title: 'Billie Jean',
            artistName: 'Michael Jackson',
            albumMbid: 'thriller',
          },
        ],
        ownedAlbums: [{ title: 'Thriller', artistName: 'Michael Jackson' }],
      }
    );
    assert.deepStrictEqual(
      results.map((item) => item.mbid),
      ['bad-edition', 'jean-single', 'blood', 'other-bad']
    );
  });

  it('drops a single whose song is on a listed album', () => {
    const results = collapseRedundantAlbumResults(
      [
        album('thriller', 'Thriller'),
        album('jean-single', 'Billie Jean', 'Single'),
      ],
      {
        tracks: [
          {
            title: 'Billie Jean (Single Version)',
            artistName: 'Michael Jackson',
            albumMbid: 'thriller',
          },
        ],
      }
    );
    assert.deepStrictEqual(
      results.map((item) => item.mbid),
      ['thriller']
    );
  });

  it('keeps a single searched for by its exact title, or as the top result', () => {
    const items = [album('bad', 'Bad'), album('bad-single', 'Bad', 'Single')];
    assert.deepStrictEqual(
      collapseRedundantAlbumResults(items, { query: 'bad' }).map(
        (item) => item.mbid
      ),
      ['bad', 'bad-single']
    );
    assert.deepStrictEqual(
      collapseRedundantAlbumResults(items, { keepMbids: ['bad-single'] }).map(
        (item) => item.mbid
      ),
      ['bad', 'bad-single']
    );
    assert.deepStrictEqual(
      collapseRedundantAlbumResults(items, { query: 'michael jackson' }).map(
        (item) => item.mbid
      ),
      ['bad']
    );
  });
});

const NOAH = '33333333-3333-4333-8333-333333333333';

describe('Get all covers every studio song (Noah Kahan)', () => {
  const standardDivide = ['Northern Attitude', 'Stick Season', 'All My Love'];
  const standardStick = ['Stick Season', 'Dial Drunk', 'Homesick'];
  const editions: Record<string, ReleaseGroupEdition[] | null> = {
    'great-divide': [
      {
        releaseMbid: 'rel-last-of-the-bugs',
        releaseTitle: 'The Great Divide: The Last Of The Bugs',
        tracks: [
          ...['Orbiter', 'The Great Divide (Live)', 'Voice Memo #3'].map(
            (title) => ({ title, durationMs: 200000 })
          ),
          { title: 'Northern Attitude' },
        ],
      },
    ],
    'stick-season': [
      {
        releaseMbid: 'rel-forever',
        releaseTitle: "Stick Season (We'll All Be Here Forever)",
        tracks: [
          { title: 'Stick Season' },
          { title: "You're Gonna Go Far", durationMs: 251000 },
          { title: 'Homesick (Commentary)' },
          { title: 'Dial Drunk (Acoustic)' },
        ],
      },
    ],
  };
  const groups = () => [
    group('great-divide', 'The Great Divide', 'Album', 2024, {
      inLibrary: true,
    }),
    group('stick-season', 'Stick Season', 'Album', 2022, { inLibrary: true }),
    group('draw-you-out', 'Draw You Out', 'Single', 2025, {
      secondaryTypes: ['Soundtrack'],
      artistCreditIds: [NOAH],
    }),
    group('someone-elses', 'Their Theme', 'Single', 2025, {
      secondaryTypes: ['Soundtrack'],
      artistCreditIds: ['44444444-4444-4444-8444-444444444444'],
    }),
    group('live-album', 'Live from Fenway', 'Album', 2025, {
      secondaryTypes: ['Live'],
    }),
    group('remix-single', 'Stick Season (Remix)', 'Single', 2023, {
      secondaryTypes: ['Remix'],
    }),
  ];
  const owned = new Set(
    [...standardDivide, ...standardStick].map((title) =>
      ownedSongKey('Noah Kahan', title)
    )
  );
  const loaders = () => {
    const tracks = loaderFrom({
      'great-divide': standardDivide,
      'stick-season': standardStick,
      'draw-you-out': ['Draw You Out'],
    });
    const editionCalls: string[] = [];
    return {
      loadTracks: tracks.loadTracks,
      editionCalls,
      loadEditions: async (mbid: string) => {
        editionCalls.push(mbid);
        return editions[mbid] ?? null;
      },
    };
  };

  it('requests the soundtrack single and the bonus tracks, not live or remix releases', async () => {
    const { loadTracks, loadEditions } = loaders();
    const plan = await buildRequestAllPlan({
      artistName: 'Noah Kahan',
      artistMbid: NOAH,
      releaseGroups: groups(),
      loadTracks,
      loadEditions,
      ownedSongKeys: owned,
      canRequestSongs: true,
    });
    assert.deepStrictEqual(ids(plan.albums), []);
    assert.deepStrictEqual(ids(plan.epsAndSingles), ['draw-you-out']);
    assert.deepStrictEqual(plan.songs, [
      {
        title: "You're Gonna Go Far",
        artistName: 'Noah Kahan',
        fromReleaseMbid: 'stick-season',
        fromReleaseTitle: "Stick Season (We'll All Be Here Forever)",
        releaseMbid: 'rel-forever',
        durationMs: 251000,
        reason: "bonus track on Stick Season (We'll All Be Here Forever)",
      },
      {
        title: 'Orbiter',
        artistName: 'Noah Kahan',
        fromReleaseMbid: 'great-divide',
        fromReleaseTitle: 'The Great Divide: The Last Of The Bugs',
        releaseMbid: 'rel-last-of-the-bugs',
        durationMs: 200000,
        reason: 'bonus track on The Great Divide: The Last Of The Bugs',
      },
    ]);
    assert.strictEqual(plan.counts.songs, 2);
    assert.strictEqual(plan.counts.bonusSongs, 2);
    // another artist's soundtrack single, live albums and remixes stay out
    for (const mbid of ['someone-elses', 'live-album', 'remix-single']) {
      assert.strictEqual(skippedBy(plan, mbid), undefined, mbid);
      assert.ok(!ids(plan.epsAndSingles).includes(mbid), mbid);
    }
  });

  it('caps bonus tracks, and adds none for someone who may not request songs', async () => {
    const capped = await buildRequestAllPlan({
      artistName: 'Noah Kahan',
      artistMbid: NOAH,
      releaseGroups: groups(),
      ...loaders(),
      ownedSongKeys: owned,
      canRequestSongs: true,
      maxBonusSongs: 1,
    });
    // the earliest album first
    assert.deepStrictEqual(
      capped.songs.map((song) => song.title),
      ["You're Gonna Go Far"]
    );
    const { loadTracks, loadEditions, editionCalls } = loaders();
    const noSongs = await buildRequestAllPlan({
      artistName: 'Noah Kahan',
      artistMbid: NOAH,
      releaseGroups: groups(),
      loadTracks,
      loadEditions,
      ownedSongKeys: owned,
      canRequestSongs: false,
    });
    assert.deepStrictEqual(noSongs.songs, []);
    assert.deepStrictEqual(editionCalls, []);
  });

  it('skips a bonus track already asked for, and editions MusicBrainz cannot list', async () => {
    const { loadTracks } = loaders();
    const plan = await buildRequestAllPlan({
      artistName: 'Noah Kahan',
      artistMbid: NOAH,
      releaseGroups: groups(),
      loadTracks,
      loadEditions: async (mbid) =>
        mbid === 'great-divide' ? null : (editions[mbid] ?? null),
      ownedSongKeys: owned,
      requestedSongKeys: new Set([requestAllSongKey("You're Gonna Go Far")]),
      canRequestSongs: true,
    });
    assert.deepStrictEqual(plan.songs, []);
  });

  it('finds the bonus tracks of a requested album beyond the edition it will get', async () => {
    const { loadTracks } = loaders();
    const plan = await buildRequestAllPlan({
      artistName: 'Noah Kahan',
      artistMbid: NOAH,
      releaseGroups: [
        group('stick-season', 'Stick Season', 'Album', 2022, {
          requested: true,
        }),
      ],
      loadTracks,
      loadEditions: async (mbid) => editions[mbid] ?? null,
      canRequestSongs: true,
    });
    assert.deepStrictEqual(
      plan.songs.map((song) => song.title),
      ["You're Gonna Go Far"]
    );
  });

  it('loads the largest official editions once a day', async () => {
    clearReleaseGroupEditionCache();
    const calls: string[] = [];
    const source = {
      getReleaseGroupReleases: async () => {
        calls.push('releases');
        return [
          { id: 'std', title: 'Stick Season', trackCount: 14 },
          {
            id: 'forever',
            title: 'Stick Season',
            disambiguation: "We'll All Be Here Forever",
            trackCount: 21,
          },
          { id: 'forever-2', title: 'Stick Season', trackCount: 21 },
          { id: 'empty', title: 'Stick Season', trackCount: 0 },
        ];
      },
      getReleaseTracks: async ({ releaseId }: { releaseId: string }) => {
        calls.push(releaseId);
        return releaseId === 'forever'
          ? [{ title: "You're Gonna Go Far", lengthMs: 251000 }]
          : [{ title: 'Stick Season', lengthMs: 182000 }];
      },
    };
    const first = await loadReleaseGroupEditions(source, 'rg-stick');
    assert.deepStrictEqual(first, [
      {
        releaseMbid: 'forever',
        releaseTitle: "Stick Season (We'll All Be Here Forever)",
        tracks: [{ title: "You're Gonna Go Far", durationMs: 251000 }],
      },
      {
        releaseMbid: 'std',
        releaseTitle: 'Stick Season',
        tracks: [{ title: 'Stick Season', durationMs: 182000 }],
      },
    ]);
    assert.deepStrictEqual(calls, ['releases', 'forever', 'std']);
    await loadReleaseGroupEditions(source, 'rg-stick');
    assert.strictEqual(calls.length, 3);

    const failing = {
      getReleaseGroupReleases: async () => {
        throw new Error('MusicBrainz is down');
      },
      getReleaseTracks: async () => [],
    };
    assert.strictEqual(
      await loadReleaseGroupEditions(failing, 'rg-down'),
      null
    );
    clearReleaseGroupEditionCache();
  });
});

describe('the "Live, compilations and more" section', () => {
  const tracks: Record<string, string[]> = {
    thriller: ['Billie Jean', 'Beat It', 'Thriller'],
    bad: ['Bad', 'Man in the Mirror', 'Smooth Criminal'],
    dangerous: ['Black or White', 'Remember the Time'],
    'singles-pack': ['Billie Jean', 'Bad (Single Version)', 'Black or White'],
    minimax: ['Bad', 'Smooth Criminal (Radio Edit)'],
    'not-guilty': ['Billie Jean', 'Beat It'],
    'remix-comp': ['Billie Jean (Remix)', 'Bad'],
  };
  const tracksOf = (mbid: string) =>
    tracks[mbid]?.map((title) => ({ title })) ?? undefined;
  const mj = () => [
    group('thriller', 'Thriller', 'Album', 1982),
    group('bad', 'Bad', 'Album', 1987),
    group('dangerous', 'Dangerous', 'Album', 1991),
    group(
      'thriller-deluxe',
      'Thriller - Deluxe Anniversary Edition',
      'Album',
      2008,
      {
        // a catalog that wrongly says promo: it is still an edition of Thriller
        releaseStatuses: ['Promotion'],
      }
    ),
    group('bad-alt', 'Bad Special Alternate Edition', 'Album', 2001, {
      secondaryTypes: ['Compilation'],
    }),
    group(
      'dangerous-real',
      'Dangerous The Real Special Edition',
      'Album',
      2001
    ),
    group('singles-pack', '9 Singles Pack', 'Album', 2009, {
      secondaryTypes: ['Compilation'],
    }),
    group('minimax', 'Limited Edition Minimax CD', 'Album', 1988, {
      secondaryTypes: ['Compilation'],
    }),
    group('not-guilty', 'Not Guilty: Special Fan Edition', 'Album', 2005, {
      secondaryTypes: ['Compilation'],
    }),
    group('visionary', 'Visionary: The Video Singles', 'Album', 2006, {
      secondaryTypes: ['Compilation'],
    }),
    group('remix-comp', 'Remix Collection', 'Album', 2010, {
      secondaryTypes: ['Compilation'],
    }),
    group('bad-remixes', 'Bad (Remixes)', 'Single', 1987, {
      secondaryTypes: ['Remix'],
    }),
    group('wembley', 'Live at Wembley July 16, 1988', 'Album', 2012, {
      secondaryTypes: ['Live'],
    }),
  ];

  it('hides editions and covered compilations, keeps live albums and remixes', () => {
    const result = classifyArtistReleaseGroups({
      releaseGroups: mj(),
      tracksOf,
    });
    assert.deepStrictEqual(result.get('thriller-deluxe'), {
      code: 'sameAlbum',
      reason: 'Another edition of Thriller',
      coveredBy: { mbid: 'thriller', title: 'Thriller' },
      coveredByHave: false,
    });
    assert.strictEqual(result.get('bad-alt')?.code, 'sameAlbum');
    assert.strictEqual(result.get('bad-alt')?.coveredBy?.mbid, 'bad');
    assert.strictEqual(result.get('dangerous-real')?.code, 'sameAlbum');
    assert.strictEqual(
      result.get('dangerous-real')?.coveredBy?.mbid,
      'dangerous'
    );
    assert.deepStrictEqual(result.get('singles-pack'), {
      code: 'covered',
      reason: 'Its songs are on Thriller and 2 more',
      coveredBy: { mbid: 'thriller', title: 'Thriller' },
      alsoOn: 2,
      coveredByHave: false,
    });
    assert.strictEqual(result.get('minimax')?.code, 'covered');
    assert.strictEqual(result.get('minimax')?.reason, 'On Bad');
    assert.strictEqual(result.get('not-guilty')?.code, 'covered');
    // unknown songs: stays (until its list is known)
    assert.strictEqual(result.get('visionary'), undefined);
    // a remixed song is a different recording
    assert.strictEqual(result.get('remix-comp'), undefined);
    assert.strictEqual(result.get('bad-remixes'), undefined);
    assert.strictEqual(result.get('wembley'), undefined);
  });

  it('inspects compilations after the studio releases', () => {
    const inspect = releaseGroupsToInspect(mj());
    assert.deepStrictEqual(inspect.albums, [
      'thriller',
      'bad',
      'dangerous',
      'dangerous-real',
    ]);
    assert.ok(inspect.extras.includes('singles-pack'));
    assert.ok(inspect.extras.includes('visionary'));
    assert.ok(!inspect.extras.includes('wembley'));
    assert.ok(!inspect.extras.includes('bad-remixes'));
  });

  it('treats a soundtrack single of the artist like their other singles', () => {
    const result = classifyArtistReleaseGroups({
      artistMbid: NOAH,
      releaseGroups: [
        group('album', 'Stick Season', 'Album', 2022),
        group('on-album', 'Stick Season', 'Single', 2022, {
          secondaryTypes: ['Soundtrack'],
          artistCreditIds: [NOAH],
        }),
        group('draw-you-out', 'Draw You Out', 'Single', 2025, {
          secondaryTypes: ['Soundtrack'],
          artistCreditIds: [NOAH],
        }),
      ],
      tracksOf: () => undefined,
    });
    assert.strictEqual(result.get('on-album')?.code, 'covered');
    assert.strictEqual(result.get('draw-you-out'), undefined);
    assert.strictEqual(
      isStudioReleaseGroup(
        {
          primaryType: 'Single',
          secondaryTypes: ['Soundtrack'],
          artistCreditIds: [NOAH],
        },
        NOAH
      ),
      true
    );
    for (const secondaryTypes of [
      ['Live'],
      ['Remix'],
      ['Compilation'],
      ['Soundtrack', 'Remix'],
    ]) {
      assert.strictEqual(
        isStudioReleaseGroup({ primaryType: 'Single', secondaryTypes }, NOAH),
        false,
        secondaryTypes.join('+')
      );
    }
    assert.strictEqual(
      isStudioReleaseGroup(
        { primaryType: 'Album', secondaryTypes: ['Soundtrack'] },
        NOAH
      ),
      false
    );
  });
});

describe('a single whose songs are on an EP you have', () => {
  it('is covered by the EP, and the EP itself is never hidden', () => {
    const tracks: Record<string, string[]> = {
      'hurt-ep': ['Hurt Somebody', 'Come Down', 'Fine'],
      'hurt-single': ['Hurt Somebody'],
      'new-single': ['Brand New Song'],
    };
    const result = classifyArtistReleaseGroups({
      releaseGroups: [
        group('hurt-single', 'Hurt Somebody', 'Single', 2017),
        group('hurt-ep', 'Hurt Somebody', 'EP', 2017, { inLibrary: true }),
        group('new-single', 'Brand New Song', 'Single', 2020),
      ],
      tracksOf: (mbid) => tracks[mbid]?.map((title) => ({ title })),
    });
    assert.strictEqual(result.get('hurt-single')?.code, 'covered');
    assert.strictEqual(result.get('hurt-single')?.coveredBy?.mbid, 'hurt-ep');
    assert.strictEqual(result.get('hurt-single')?.coveredByHave, true);
    assert.strictEqual(result.has('hurt-ep'), false);
    assert.strictEqual(result.has('new-single'), false);
  });
});

describe('remix and instrumental B-sides', () => {
  it('do not make a single worth getting when its song is on an album you have', () => {
    const tracks: Record<string, string[]> = {
      bad: ['Bad', 'Man in the Mirror'],
      'bad-single': ['Bad', 'Bad (dub version)', 'Bad (a cappella)'],
    };
    const result = classifyArtistReleaseGroups({
      releaseGroups: [
        group('bad', 'Bad', 'Album', 1987, { inLibrary: true }),
        group('bad-single', 'Bad', 'Single', 1987),
      ],
      tracksOf: (mbid) => tracks[mbid]?.map((title) => ({ title })),
    });
    assert.strictEqual(result.get('bad-single')?.code, 'covered');
    assert.strictEqual(result.get('bad-single')?.coveredBy?.mbid, 'bad');
  });
});

describe('bonus tracks that are not songs of their own', () => {
  it('skips medleys, edits, excerpts, year remakes and translated titles', async () => {
    const plan = await buildRequestAllPlan({
      artistName: 'Michael Jackson',
      releaseGroups: [
        group('off-the-wall', 'Off the Wall', 'Album', 1979, {
          inLibrary: true,
        }),
      ],
      loadTracks: async () => [
        { title: 'Rock With You' },
        { title: 'Off the Wall' },
      ],
      ownedSongKeys: new Set(),
      canRequestSongs: true,
      loadEditions: async () => [
        {
          releaseMbid: 'deluxe',
          releaseTitle: 'Off the Wall (Special Edition)',
          tracks: [
            { title: 'Rock With You' },
            { title: 'ロック・ウィズ・ユー' },
            { title: 'Beat It 2008' },
            { title: 'Dangerous Medley: Black or White / Jam' },
            { title: 'Ben + The Greatest Show On Earth' },
            { title: 'Prelude / Heal the World (7" edit)' },
            { title: 'Excerpt From Voice-Over Session' },
            { title: "Workin' Day and Night (demo)" },
            { title: 'For All Time' },
          ],
        },
      ],
    });
    assert.deepStrictEqual(
      plan.songs.map((song) => song.title),
      ['For All Time']
    );
  });
});

describe('single B-sides that are not songs of their own', () => {
  it("asks for none of a megamix, an excerpt or a remake, and spells -in' as -ing", async () => {
    const tracks: Record<string, string[]> = {
      album: ['Earth Song', "Workin' Day and Night"],
      single: [
        'Earth Song',
        'Michael Jackson DMC Megamix',
        'Excerpt From Voice-Over Session',
        'Beat It 2008',
        'Working Day and Night',
        'A Real B-Side',
      ],
    };
    const plan = await buildRequestAllPlan({
      artistName: 'Michael Jackson',
      releaseGroups: [
        group('album', 'HIStory', 'Album', 1995, { inLibrary: true }),
        group('single', 'Earth Song', 'Single', 1995),
      ],
      loadTracks: async (mbid: string) =>
        tracks[mbid]?.map((title) => ({ title })) ?? null,
      ownedSongKeys: new Set(),
      canRequestSongs: true,
    });
    assert.deepStrictEqual(
      plan.songs.map((song) => song.title),
      ['A Real B-Side']
    );
  });
});
