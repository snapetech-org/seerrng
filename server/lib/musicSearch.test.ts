import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AurralNormalizedAlbum,
  AurralNormalizedArtist,
  AurralNormalizedTrack,
} from '@server/api/aurral';
import {
  albumPopularityKey,
  applyTrackPopularity,
  dedupeTracks,
  fillTrackArtistMbids,
  filterLibraryHits,
  findDominantTrackArtist,
  formatParsedMusicQuery,
  hasCoverPenalty,
  hasTrackMatchingArtistAndTitle,
  isMusicLinkQuery,
  mergeArtists,
  musicNamesEqual,
  normalizeMusicSearchText,
  parseMusicPlaylistLink,
  parseMusicQuery,
  pickCatalogTrackArtist,
  pickTrackArtistMatch,
  planTrackArtistResolution,
  promoteArtist,
  rankAndDedupeTracks,
  resolveMusicQuerySplit,
  scoreTrack,
  selectTopResult,
  sortAlbumsForSearch,
  sortArtistsForSearch,
  stripEditionWords,
  stripMusicSearchFiller,
  stripTrackPopularity,
  stripTrackTitleExtras,
} from './musicSearch';

const makeTrack = (
  overrides: Partial<AurralNormalizedTrack> & {
    title: string;
    artistName: string;
  }
): AurralNormalizedTrack => ({
  artistMbid: null,
  albumTitle: null,
  albumMbid: null,
  durationMs: null,
  coverUrl: null,
  previewDeezerId: null,
  inLibrary: false,
  ...overrides,
});

const makeArtist = (
  overrides: Partial<AurralNormalizedArtist> & { name: string }
): AurralNormalizedArtist => ({
  mbid: null,
  image: null,
  inLibrary: false,
  ...overrides,
});

const makeAlbum = (
  overrides: Partial<AurralNormalizedAlbum> & {
    title: string;
    artistName: string;
  }
): AurralNormalizedAlbum => ({
  mbid: null,
  artistMbid: null,
  primaryType: 'Album',
  releaseDate: null,
  coverUrl: null,
  inLibrary: false,
  ...overrides,
});

describe('parseMusicQuery', () => {
  const cases = [
    {
      input: 'kyoto by phoebe bridgers',
      expectedPublic: {
        artist: 'phoebe bridgers',
        title: 'kyoto',
        year: null,
        edition: null,
        type: null,
      },
      extraArtists: [],
    },
    {
      input: 'Hozier - Too Sweet',
      expectedPublic: {
        artist: 'Hozier',
        title: 'Too Sweet',
        year: null,
        edition: null,
        type: null,
      },
      extraArtists: [],
    },
    {
      input: 'Hozier – Too Sweet',
      expectedPublic: {
        artist: 'Hozier',
        title: 'Too Sweet',
        year: null,
        edition: null,
        type: null,
      },
      extraArtists: [],
    },
    {
      input: 'Hozier: Too Sweet',
      expectedPublic: {
        artist: 'Hozier',
        title: 'Too Sweet',
        year: null,
        edition: null,
        type: null,
      },
      extraArtists: [],
    },
    {
      input: 'bon iver',
      expectedPublic: null,
      extraArtists: [],
    },
    {
      input: 'sza',
      expectedPublic: null,
      extraArtists: [],
    },
    {
      input: 'folklore deluxe',
      expectedPublic: {
        artist: null,
        title: null,
        year: null,
        edition: 'deluxe',
        type: null,
      },
      extraArtists: [],
      cleanQuery: 'folklore',
    },
    {
      input: "1989 (taylor's version)",
      expectedPublic: {
        artist: null,
        title: null,
        year: null,
        edition: "taylor's version",
        type: null,
      },
      extraArtists: [],
      cleanQuery: '1989',
    },
    {
      input: 'Lose Yourself feat. Eminem',
      expectedPublic: {
        artist: null,
        title: 'Lose Yourself',
        year: null,
        edition: null,
        type: null,
      },
      extraArtists: ['Eminem'],
      cleanQuery: 'Lose Yourself',
    },
    {
      input: 'taylor swift 2019',
      expectedPublic: {
        artist: null,
        title: null,
        year: 2019,
        edition: null,
        type: null,
      },
      extraArtists: [],
      cleanQuery: 'taylor swift',
    },
    {
      input:
        'i want to hear that song from the barbie movie that billie eilish sang',
      expectedPublic: null,
      extraArtists: [],
    },
    {
      input: 'barbie the album',
      expectedPublic: {
        artist: null,
        title: null,
        year: null,
        edition: null,
        type: 'album',
      },
      extraArtists: [],
      cleanQuery: 'barbie',
    },
    {
      input: 'Dracula (with JENNIE)',
      expectedPublic: {
        artist: null,
        title: 'Dracula',
        year: null,
        edition: null,
        type: null,
      },
      extraArtists: ['JENNIE'],
      cleanQuery: 'Dracula',
    },
    {
      input: 'Stay With Me',
      expectedPublic: null,
      extraArtists: [],
      cleanQuery: 'Stay With Me',
    },
  ];

  for (const testCase of cases) {
    it(`parses "${testCase.input}"`, () => {
      const details = parseMusicQuery(testCase.input);
      assert.deepStrictEqual(
        formatParsedMusicQuery(details),
        testCase.expectedPublic
      );
      assert.deepStrictEqual(details.extraArtists, testCase.extraArtists);
      if (testCase.cleanQuery !== undefined) {
        assert.strictEqual(details.cleanQuery, testCase.cleanQuery);
      }
    });
  }
});

describe('hasCoverPenalty and track scoring', () => {
  const penaltyWords = [
    { label: 'cover', title: 'Too Sweet (Cover)' },
    { label: 'karaoke', title: 'Too Sweet (Karaoke Version)' },
    { label: 'tribute', albumTitle: 'Tribute to Hozier', title: 'Too Sweet' },
    {
      label: 'made popular by',
      title: 'Too Sweet (Made Popular By Hozier)',
    },
    {
      label: 'in the style of',
      title: 'Too Sweet (In the Style of Hozier)',
    },
    { label: 'lullaby', title: 'Too Sweet (Lullaby)' },
    { label: '8-bit', title: 'Too Sweet (8-Bit Version)' },
    {
      label: 'for babies',
      albumTitle: 'Rockabye for Babies',
      title: 'Too Sweet',
    },
    { label: 'instrumental', title: 'Too Sweet (Instrumental)' },
    { label: 'piano version', title: 'Too Sweet (Piano Version)' },
    { label: 'remake', title: 'Too Sweet (Remake)' },
    { label: 'lofi', artistName: 'Lo-Fi Beats', title: 'Too Sweet' },
  ];

  for (const entry of penaltyWords) {
    it(`penalizes ${entry.label} when query does not ask for it`, () => {
      const track = makeTrack({
        title: entry.title,
        artistName: entry.artistName ?? 'Some Artist',
        albumTitle: entry.albumTitle ?? null,
      });
      assert.strictEqual(hasCoverPenalty(track, 'Too Sweet'), true);
      assert.strictEqual(
        hasCoverPenalty(track, `Too Sweet ${entry.label}`),
        false
      );
    });
  }

  it("ranks the named artist's song above uploads titled with the whole query", () => {
    const query = 'too sweet hozier';
    const parsed = parseMusicQuery(query);
    const ranked = rankAndDedupeTracks(
      [
        makeTrack({
          title: 'Too sweet hozier',
          artistName: 'All purpose rain',
        }),
        makeTrack({ title: 'Too Sweet', artistName: 'Hozier' }),
        makeTrack({ title: 'Too Sweet Hozier', artistName: 'Lee Sang Gul' }),
      ],
      query,
      parsed
    );

    assert.strictEqual(ranked[0].artistName, 'Hozier');
    assert.strictEqual(ranked[0].title, 'Too Sweet');
  });

  it('does not boost an artist whose name is only part of a title query', () => {
    const query = 'dancing queen';
    const parsed = parseMusicQuery(query);
    const ranked = rankAndDedupeTracks(
      [
        makeTrack({ title: 'Bohemian Rhapsody', artistName: 'Queen' }),
        makeTrack({ title: 'Dancing Queen', artistName: 'ABBA' }),
      ],
      query,
      parsed
    );
    assert.strictEqual(ranked[0].artistName, 'ABBA');
  });

  it('puts the album Deezer lists first ahead of a same-titled single, and on top over obscure songs', () => {
    const query = 'abbey road';
    const parsed = parseMusicQuery(query);
    const album = (
      title: string,
      artistName: string,
      primaryType: string,
      mbid: string
    ) => ({
      mbid,
      title,
      artistName,
      artistMbid: null,
      primaryType,
      releaseDate: null,
      coverUrl: null,
      inLibrary: false,
    });
    const albums = sortAlbumsForSearch(
      [
        album(
          'Abbey Road',
          'Diana Herrera',
          'Single',
          'aaaaaaaa-0000-4000-8000-000000000001'
        ),
        album(
          'Abbey Road',
          'The Beatles',
          'Album',
          'aaaaaaaa-0000-4000-8000-000000000002'
        ),
      ],
      query,
      parsed,
      new Map([[albumPopularityKey('The Beatles', 'Abbey Road'), 0]])
    );
    assert.strictEqual(albums[0].artistName, 'The Beatles');

    const tracks = ['DJ Yoda', 'Marsimoto', 'Diana Herrera'].map(
      (artistName) => ({
        ...makeTrack({ title: 'Abbey Road', artistName }),
        popularity: 120_000,
      })
    );
    const top = selectTopResult({
      query,
      parsed,
      artists: [],
      albums,
      tracks,
      upstreamTop: null,
      popularAlbum: albums[0],
    });
    assert.strictEqual(top?.type, 'album');

    // a famous song still wins ("hello")
    const famous = selectTopResult({
      query,
      parsed,
      artists: [],
      albums,
      tracks: [{ ...tracks[0], popularity: 900_000 }, tracks[1], tracks[2]],
      upstreamTop: null,
      popularAlbum: albums[0],
    });
    assert.strictEqual(famous?.type, 'track');
  });

  it('ranks original above covers and prioritizes exact artist matches', () => {
    const query = 'what was i made for';
    const parsed = parseMusicQuery(query);
    const ranked = rankAndDedupeTracks(
      [
        makeTrack({
          title: 'What Was I Made For (Piano Version)',
          artistName: 'Daniela Mlcuchova',
        }),
        makeTrack({
          title: 'What Was I Made For? [From The Motion Picture "Barbie"]',
          artistName: 'Billie Eilish',
        }),
      ],
      query,
      parsed
    );

    assert.strictEqual(ranked[0].artistName, 'Billie Eilish');
  });

  it('prefers artist match over featured credit in title for "bon iver" and "sza"', () => {
    const bonIverParsed = parseMusicQuery('bon iver');
    const bonIverRanked = rankAndDedupeTracks(
      [
        makeTrack({
          title: 'exile (feat. Bon Iver)',
          artistName: 'Taylor Swift',
        }),
        makeTrack({ title: 'Skinny Love', artistName: 'Bon Iver' }),
      ],
      'bon iver',
      bonIverParsed
    );
    assert.strictEqual(bonIverRanked[0].artistName, 'Bon Iver');

    const szaParsed = parseMusicQuery('sza');
    const szaRanked = rankAndDedupeTracks(
      [
        makeTrack({
          title: 'Flower In A Hurricane (feat. Tame Impala, SZA)',
          artistName: 'Justice',
        }),
        makeTrack({ title: 'Snooze', artistName: 'SZA' }),
      ],
      'sza',
      szaParsed
    );
    assert.strictEqual(szaRanked[0].artistName, 'SZA');
  });

  it('does not match extra feat. artist against track titles for "Lose Yourself feat. Eminem"', () => {
    const query = 'Lose Yourself feat. Eminem';
    const parsed = parseMusicQuery(query);
    const titleHasEminem = makeTrack({
      title: 'Eminem',
      artistName: 'Someone Else',
    });
    const realTrack = makeTrack({
      title: 'Lose Yourself',
      artistName: 'Eminem',
    });

    assert.ok(
      scoreTrack(realTrack, { query, parsed, originalIndex: 1 }) >
        scoreTrack(titleHasEminem, { query, parsed, originalIndex: 0 })
    );
  });
});

describe('dedupeTracks', () => {
  it('dedupes normalized artist+title and keeps owned copy over unowned', () => {
    const deduped = dedupeTracks([
      makeTrack({
        title: 'Bohemian Rhapsody',
        artistName: 'Queen',
        inLibrary: false,
        albumTitle: 'First',
      }),
      makeTrack({
        title: 'bohemian rhapsody',
        artistName: 'QUEEN',
        inLibrary: true,
        albumTitle: 'Owned',
      }),
      makeTrack({
        title: 'Bohemian Rhapsody',
        artistName: 'Queen',
        inLibrary: false,
        albumTitle: 'Third',
      }),
    ]);

    assert.strictEqual(deduped.length, 1);
    assert.strictEqual(deduped[0].inLibrary, true);
    assert.strictEqual(deduped[0].albumTitle, 'Owned');
  });
});

describe('selectTopResult', () => {
  it('puts a famous song above an unknown artist with the same name', () => {
    const query = 'mr brightside';
    const parsed = parseMusicQuery(query);
    const tracks = [
      makeTrack({ title: 'Mr. Brightside', artistName: 'The Killers' }),
      makeTrack({ title: 'Mr. Brightside', artistName: 'ItaloBrothers' }),
      makeTrack({ title: 'Mr. Brightside', artistName: 'Part Time Killer' }),
    ];
    const top = selectTopResult({
      query,
      parsed,
      artists: [makeArtist({ mbid: 'mbid-mrb', name: 'Mr. Brightside' })],
      albums: [],
      tracks,
      upstreamTop: null,
    });
    assert.strictEqual(top?.type, 'track');
    assert.strictEqual(
      top?.type === 'track' ? top.artistName : null,
      'The Killers'
    );

    // an artist already in the library still wins
    const owned = selectTopResult({
      query,
      parsed,
      artists: [
        makeArtist({
          mbid: 'mbid-mrb',
          name: 'Mr. Brightside',
          inLibrary: true,
        }),
      ],
      albums: [],
      tracks,
      upstreamTop: null,
    });
    assert.strictEqual(owned?.type, 'artist');
  });

  it('picks artist when normalized query matches an artist in artists[]', () => {
    const query = 'bon iver';
    const parsed = parseMusicQuery(query);
    const top = selectTopResult({
      query,
      parsed,
      artists: [makeArtist({ mbid: 'mbid-bon', name: 'Bon Iver' })],
      albums: [],
      tracks: [makeTrack({ title: 'Skinny Love', artistName: 'Bon Iver' })],
      upstreamTop: null,
    });

    assert.strictEqual(top?.type, 'artist');
    assert.strictEqual(top?.type === 'artist' ? top.name : null, 'Bon Iver');
  });

  it('picks artist when at least 3 of top 5 ranked tracks share matching artist', () => {
    const query = 'sza';
    const parsed = parseMusicQuery(query);
    const top = selectTopResult({
      query,
      parsed,
      artists: [],
      albums: [],
      tracks: [
        makeTrack({
          title: 'Snooze',
          artistName: 'SZA',
          artistMbid: 'sza-mbid',
        }),
        makeTrack({ title: 'Kill Bill', artistName: 'SZA' }),
        makeTrack({ title: 'Shirt', artistName: 'SZA' }),
        makeTrack({ title: 'Other', artistName: 'Justice' }),
      ],
      upstreamTop: null,
    });

    assert.strictEqual(top?.type, 'artist');
    assert.strictEqual(top?.type === 'artist' ? top.mbid : null, 'sza-mbid');
  });

  const albumCases = [
    {
      query: 'folklore deluxe',
      album: makeAlbum({
        mbid: 'rg-1',
        title: 'folklore',
        artistName: 'Taylor Swift',
      }),
    },
    {
      query: "1989 (taylor's version)",
      album: makeAlbum({
        mbid: 'rg-2',
        title: "1989 (Taylor's Version)",
        artistName: 'Taylor Swift',
      }),
    },
    {
      query: 'Abbey Road Remastered',
      album: makeAlbum({
        mbid: 'rg-3',
        title: 'Abbey Road (Expanded)',
        artistName: 'The Beatles',
      }),
    },
  ];

  for (const testCase of albumCases) {
    it(`picks album top result for "${testCase.query}"`, () => {
      const parsed = parseMusicQuery(testCase.query);
      const top = selectTopResult({
        query: testCase.query,
        parsed,
        artists: [],
        albums: [testCase.album],
        tracks: [makeTrack({ title: 'Some Song', artistName: 'Other' })],
        upstreamTop: null,
      });

      assert.strictEqual(top?.type, 'album');
      assert.strictEqual(
        top?.type === 'album' ? top.mbid : null,
        testCase.album.mbid
      );
    });
  }
});

describe('helpers: filler stripping, link detection, artist+title match', () => {
  it('strips filler only when query has more than 4 words', () => {
    assert.strictEqual(stripMusicSearchFiller('play that song'), null);
    assert.strictEqual(
      stripMusicSearchFiller(
        'i want to hear that song from the barbie movie that billie eilish sang'
      ),
      'barbie that billie eilish'
    );
  });

  it('recognizes supported music links and rejects others', () => {
    for (const url of [
      'https://open.spotify.com/track/123',
      'https://music.apple.com/us/album/abc/1',
      'https://music.youtube.com/watch?v=1',
      'https://youtube.com/watch?v=1',
      'https://youtu.be/abc',
      'https://tidal.com/browse/track/1',
      'https://listen.tidal.com/track/1',
      'https://deezer.com/track/1',
      'https://deezer.page.link/abc',
      'https://song.link/s/123',
      'https://odesli.co/s/123',
      'https://album.link/s/123',
    ]) {
      assert.ok(isMusicLinkQuery(url), url);
    }

    for (const bad of [
      'kyoto by phoebe bridgers',
      'https://evil-spotify.com/track/1',
      'ftp://open.spotify.com/track/1',
      'https://user:pass@open.spotify.com/track/1',
    ]) {
      assert.strictEqual(isMusicLinkQuery(bad), null, bad);
    }
  });

  it('detects whether ranked tracks match both parsed artist and title', () => {
    const parsed = parseMusicQuery('Hozier - Too Sweet');
    assert.strictEqual(
      hasTrackMatchingArtistAndTitle(
        [makeTrack({ title: 'Too Sweet', artistName: 'Très Moyen' })],
        parsed
      ),
      false
    );
    assert.strictEqual(
      hasTrackMatchingArtistAndTitle(
        [makeTrack({ title: 'Too Sweet', artistName: 'Hozier' })],
        parsed
      ),
      true
    );
    assert.strictEqual(
      stripEditionWords('folklore (deluxe edition)'),
      'folklore'
    );
    assert.strictEqual(normalizeMusicSearchText('Mötley Crüe'), 'motley crue');
  });
});

describe('filterLibraryHits', () => {
  it('drops unrelated fuzzy hits like Bed Chem for AC/DC while keeping AC/DC items', () => {
    const filtered = filterLibraryHits('AC/DC', {
      artists: [
        makeArtist({ name: 'AC/DC', inLibrary: true }),
        makeArtist({ name: 'Sabrina Carpenter', inLibrary: true }),
      ],
      albums: [
        makeAlbum({
          title: 'Back in Black',
          artistName: 'AC/DC',
          inLibrary: true,
        }),
        makeAlbum({
          title: 'Short n Sweet',
          artistName: 'Sabrina Carpenter',
          inLibrary: true,
        }),
      ],
      tracks: [
        makeTrack({
          title: 'Bed Chem',
          artistName: 'Sabrina Carpenter',
          albumTitle: "Short n' Sweet",
          inLibrary: true,
        }),
        makeTrack({
          title: 'Thunderstruck',
          artistName: 'AC/DC',
          albumTitle: 'The Razors Edge',
          inLibrary: true,
        }),
      ],
    });

    assert.deepStrictEqual(
      filtered.artists.map((a) => a.name),
      ['AC/DC']
    );
    assert.deepStrictEqual(
      filtered.albums.map((a) => a.title),
      ['Back in Black']
    );
    assert.deepStrictEqual(
      filtered.tracks.map((t) => t.title),
      ['Thunderstruck']
    );
  });

  it('keeps Taylor Swift albums for "taylor swift" and supports token prefixes', () => {
    const library = {
      artists: [
        makeArtist({ name: 'Taylor Swift', inLibrary: true }),
        makeArtist({ name: 'Taylor Dayne', inLibrary: true }),
      ],
      albums: [
        makeAlbum({
          title: 'folklore',
          artistName: 'Taylor Swift',
          inLibrary: true,
        }),
        makeAlbum({
          title: 'Tell It to My Heart',
          artistName: 'Taylor Dayne',
          inLibrary: true,
        }),
      ],
      tracks: [
        makeTrack({
          title: 'cardigan',
          artistName: 'Taylor Swift',
          albumTitle: 'folklore',
          inLibrary: true,
        }),
      ],
    };

    const full = filterLibraryHits('taylor swift', library);
    assert.deepStrictEqual(
      full.albums.map((a) => a.title),
      ['folklore']
    );
    assert.deepStrictEqual(
      full.artists.map((a) => a.name),
      ['Taylor Swift']
    );

    const prefixed = filterLibraryHits('tay swi', library);
    assert.deepStrictEqual(
      prefixed.albums.map((a) => a.title),
      ['folklore']
    );
  });

  it('uses exact normalized equality when query has no tokens of length >= 2', () => {
    const filtered = filterLibraryHits('X', {
      artists: [
        makeArtist({ name: 'X', inLibrary: true }),
        makeArtist({ name: 'X Ambassadors', inLibrary: true }),
      ],
      albums: [],
      tracks: [],
    });

    assert.deepStrictEqual(
      filtered.artists.map((a) => a.name),
      ['X']
    );
  });
});

describe('parseMusicPlaylistLink', () => {
  it('parses Deezer, Spotify, and YouTube playlist URLs and ignores non-playlist URLs', () => {
    assert.deepStrictEqual(
      parseMusicPlaylistLink('https://www.deezer.com/en/playlist/123456789'),
      {
        type: 'playlist',
        provider: 'deezer',
        id: '123456789',
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      }
    );
    assert.deepStrictEqual(
      parseMusicPlaylistLink('deezer.com/playlist/987654321?utm_source=x'),
      {
        type: 'playlist',
        provider: 'deezer',
        id: '987654321',
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      }
    );
    assert.deepStrictEqual(
      parseMusicPlaylistLink(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc'
      ),
      {
        type: 'playlist',
        provider: 'spotify',
        id: null,
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      }
    );
    assert.deepStrictEqual(
      parseMusicPlaylistLink(
        'https://music.youtube.com/playlist?list=PL1234567890'
      ),
      {
        type: 'playlist',
        provider: 'youtube',
        id: null,
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      }
    );
    assert.strictEqual(
      parseMusicPlaylistLink('https://open.spotify.com/track/123'),
      null
    );
    assert.strictEqual(
      parseMusicPlaylistLink('https://www.youtube.com/watch?v=123'),
      null
    );
  });
});

describe('artist/title guesses are checked against results', () => {
  const resolve = (
    query: string,
    results: {
      artists?: AurralNormalizedArtist[];
      albums?: AurralNormalizedAlbum[];
      tracks?: AurralNormalizedTrack[];
    }
  ) =>
    resolveMusicQuerySplit(parseMusicQuery(query), {
      artists: results.artists ?? [],
      albums: results.albums ?? [],
      tracks: results.tracks ?? [],
    });

  it('"Stand by Me" is a title: the right song is the top result', () => {
    const query = 'Stand by Me';
    const guessed = parseMusicQuery(query);
    assert.strictEqual(guessed.tentativeSplit, true);
    const tracks = [
      makeTrack({ title: 'Stand', artistName: 'James Arthur' }),
      makeTrack({ title: 'Stand', artistName: 'R.E.M.' }),
      makeTrack({ title: 'Stand by Me', artistName: 'Ben E. King' }),
    ];
    const parsed = resolve(query, { tracks });
    assert.strictEqual(parsed.artist, null);
    assert.strictEqual(parsed.title, null);
    assert.strictEqual(parsed.cleanQuery, 'Stand by Me');

    const ranked = rankAndDedupeTracks(tracks, query, parsed);
    assert.strictEqual(ranked[0].artistName, 'Ben E. King');
    const top = selectTopResult({
      query,
      parsed,
      artists: [],
      albums: [],
      tracks: ranked,
      upstreamTop: null,
    });
    assert.strictEqual(
      top?.type === 'track' ? top.artistName : null,
      'Ben E. King'
    );
  });

  it('"Side by Side" is a title', () => {
    const parsed = resolve('Side by Side', {
      tracks: [
        makeTrack({ title: 'Side By Side', artistName: 'Ariana Grande' }),
      ],
    });
    assert.strictEqual(parsed.artist, null);
    assert.strictEqual(parsed.cleanQuery, 'Side by Side');
  });

  it('"kyoto by phoebe bridgers" keeps the split when the artist is in the results', () => {
    const parsed = resolve('kyoto by phoebe bridgers', {
      tracks: [makeTrack({ title: 'Kyoto', artistName: 'Phoebe Bridgers' })],
    });
    assert.strictEqual(parsed.artist, 'phoebe bridgers');
    assert.strictEqual(parsed.title, 'kyoto');
  });

  it('searches the whole string when no result supports the guess', () => {
    const parsed = resolve('kyoto by phoebe bridgers', {
      tracks: [makeTrack({ title: 'Kyoto', artistName: 'Someone Else' })],
    });
    assert.strictEqual(parsed.artist, null);
    assert.strictEqual(parsed.cleanQuery, 'kyoto by phoebe bridgers');
  });

  it('"Dancing with a Stranger" and "I Wanna Dance with Somebody" are titles', () => {
    const dancing = resolve('Dancing with a Stranger', {
      tracks: [
        makeTrack({
          title: 'Dancing With A Stranger (with Normani)',
          artistName: 'Sam Smith',
        }),
      ],
    });
    assert.deepStrictEqual(dancing.extraArtists, []);
    assert.strictEqual(dancing.title, null);
    assert.strictEqual(dancing.cleanQuery, 'Dancing with a Stranger');

    const somebody = resolve('I Wanna Dance with Somebody', {
      tracks: [
        makeTrack({
          title: 'I Wanna Dance with Somebody (Who Loves Me)',
          artistName: 'Whitney Houston',
        }),
      ],
    });
    assert.deepStrictEqual(somebody.extraArtists, []);
    assert.strictEqual(somebody.cleanQuery, 'I Wanna Dance with Somebody');
  });

  it('keeps a bare "with" featured artist the results credit', () => {
    const parsed = resolve('Dracula with Jennie', {
      tracks: [
        makeTrack({
          title: 'Dracula (with JENNIE)',
          artistName: 'Tame Impala',
        }),
      ],
    });
    assert.deepStrictEqual(parsed.extraArtists, ['Jennie']);
    assert.strictEqual(parsed.cleanQuery, 'Dracula');
  });

  it('"Star Wars: A New Hope" is a title, "Hozier: Too Sweet" is artist: title', () => {
    const starWars = resolve('Star Wars: A New Hope', {
      albums: [
        makeAlbum({
          title: 'Star Wars: A New Hope (Original Motion Picture Soundtrack)',
          artistName: 'John Williams',
        }),
      ],
    });
    assert.strictEqual(starWars.artist, null);
    assert.strictEqual(starWars.cleanQuery, 'Star Wars: A New Hope');

    const hozier = resolve('Hozier: Too Sweet', {
      tracks: [makeTrack({ title: 'Too Sweet', artistName: 'Hozier' })],
    });
    assert.strictEqual(hozier.artist, 'Hozier');
    assert.strictEqual(hozier.title, 'Too Sweet');
  });

  it('treats the explicit "artist - title" form as certain', () => {
    const parsed = parseMusicQuery('Hozier - Too Sweet');
    assert.strictEqual(parsed.tentativeSplit, undefined);
    assert.strictEqual(resolve('Hozier - Too Sweet', {}).artist, 'Hozier');
  });

  it('matches a guessed artist on whole words only', () => {
    const parsed = parseMusicQuery('Stand by Me');
    assert.strictEqual(
      hasTrackMatchingArtistAndTitle(
        [makeTrack({ title: 'Stand', artistName: 'James Arthur' })],
        parsed
      ),
      false
    );
    const query = 'Stand by Me';
    const jamesArthur = makeTrack({
      title: 'Stand',
      artistName: 'James Arthur',
    });
    const me = makeTrack({ title: 'Stand', artistName: 'Me' });
    assert.ok(
      scoreTrack(me, { query, parsed, originalIndex: 1 }) >
        scoreTrack(jamesArthur, { query, parsed, originalIndex: 0 })
    );
  });

  it('does not count a track without an artist as an artist match', () => {
    assert.strictEqual(
      hasTrackMatchingArtistAndTitle(
        [makeTrack({ title: 'Too Sweet', artistName: '' })],
        parseMusicQuery('Hozier - Too Sweet')
      ),
      false
    );
  });
});

describe('a trailing year can be a title', () => {
  it('"Taylor Swift 1989" finds the album 1989, not a 1989 release', () => {
    const query = 'Taylor Swift 1989';
    const parsed = parseMusicQuery(query);
    assert.strictEqual(parsed.year, 1989);
    const albums = [
      makeAlbum({
        mbid: 'rg-taylor-swift',
        title: 'Taylor Swift',
        artistName: 'Taylor Swift',
        releaseDate: '2006-10-24',
      }),
      makeAlbum({
        mbid: 'rg-1989',
        title: '1989',
        artistName: 'Taylor Swift',
        releaseDate: '2014-10-27',
      }),
    ];
    const top = selectTopResult({
      query,
      parsed,
      artists: [makeArtist({ mbid: 'ts', name: 'Taylor Swift' })],
      albums,
      tracks: [],
      upstreamTop: null,
    });
    assert.strictEqual(top?.type, 'album');
    assert.strictEqual(top?.type === 'album' ? top.mbid : null, 'rg-1989');
    assert.strictEqual(
      sortAlbumsForSearch(albums, query, parsed)[0].mbid,
      'rg-1989'
    );
  });

  it('"Prince 1999" finds the song 1999 when there is no album result', () => {
    const query = 'Prince 1999';
    const parsed = parseMusicQuery(query);
    const tracks = rankAndDedupeTracks(
      [
        makeTrack({ title: 'Purple Rain', artistName: 'Prince' }),
        makeTrack({ title: 'When Doves Cry', artistName: 'Prince' }),
        makeTrack({ title: '1999', artistName: 'Prince' }),
      ],
      query,
      parsed
    );
    assert.strictEqual(tracks[0].title, '1999');
    const top = selectTopResult({
      query,
      parsed,
      artists: [makeArtist({ mbid: 'prince', name: 'Prince' })],
      albums: [],
      tracks,
      upstreamTop: null,
    });
    assert.strictEqual(top?.type, 'track');
    assert.strictEqual(top?.type === 'track' ? top.title : null, '1999');
  });

  it('keeps the year as a filter when no release is titled with it', () => {
    const query = 'taylor swift 2019';
    const top = selectTopResult({
      query,
      parsed: parseMusicQuery(query),
      artists: [makeArtist({ mbid: 'ts', name: 'Taylor Swift' })],
      albums: [
        makeAlbum({
          title: 'Lover',
          artistName: 'Taylor Swift',
          releaseDate: '2019-08-23',
        }),
      ],
      tracks: [],
      upstreamTop: null,
    });
    assert.strictEqual(top?.type, 'artist');
  });
});

describe('normalisation of punctuated names and other scripts', () => {
  it('matches P!nk, M.I.A., Ke$ha and AC/DC to their plain spellings', () => {
    assert.strictEqual(normalizeMusicSearchText('P!nk'), 'pink');
    assert.strictEqual(normalizeMusicSearchText('Ke$ha'), 'kesha');
    for (const [name, typed] of [
      ['P!nk', 'pink'],
      ['M.I.A.', 'mia'],
      ['Ke$ha', 'kesha'],
      ['AC/DC', 'acdc'],
      ['AC/DC', 'ac dc'],
    ]) {
      assert.ok(
        musicNamesEqual(
          normalizeMusicSearchText(name),
          normalizeMusicSearchText(typed)
        ),
        `${name} = ${typed}`
      );
      const top = selectTopResult({
        query: typed,
        parsed: parseMusicQuery(typed),
        artists: [makeArtist({ mbid: `mbid-${typed}`, name })],
        albums: [],
        tracks: [],
        upstreamTop: null,
      });
      assert.strictEqual(top?.type, 'artist', typed);
      assert.strictEqual(top?.type === 'artist' ? top.name : null, name);
    }
    assert.strictEqual(
      musicNamesEqual(
        normalizeMusicSearchText('Pink Floyd'),
        normalizeMusicSearchText('pink')
      ),
      false
    );
  });

  it('keeps combining marks in Japanese and Hindi words', () => {
    assert.strictEqual(
      normalizeMusicSearchText('ドラゴンボール'),
      'ドラゴンボール'
    );
    assert.strictEqual(normalizeMusicSearchText('गाना'), 'गाना');
    assert.strictEqual(normalizeMusicSearchText('Mötley Crüe'), 'motley crue');
    assert.strictEqual(normalizeMusicSearchText('Ｂｅｙｏｎｃé'), 'beyonce');

    const library = filterLibraryHits('ドラゴンボール', {
      artists: [],
      albums: [
        makeAlbum({ title: 'ドラゴンボール', artistName: '影山ヒロノブ' }),
        makeAlbum({ title: 'ドラえもん', artistName: '大山のぶ代' }),
      ],
      tracks: [],
    });
    assert.deepStrictEqual(
      library.albums.map((album) => album.title),
      ['ドラゴンボール']
    );
  });

  it('finds AC/DC library items for "acdc"', () => {
    const filtered = filterLibraryHits('acdc', {
      artists: [makeArtist({ name: 'AC/DC', inLibrary: true })],
      albums: [
        makeAlbum({ title: 'Back in Black', artistName: 'AC/DC' }),
        makeAlbum({ title: 'Smart Art', artistName: 'Someone' }),
      ],
      tracks: [],
    });
    assert.deepStrictEqual(
      filtered.artists.map((artist) => artist.name),
      ['AC/DC']
    );
    assert.deepStrictEqual(
      filtered.albums.map((album) => album.title),
      ['Back in Black']
    );
  });

  it('keeps the band "!!!" in merges, library hits and the top result', () => {
    const merged = mergeArtists([makeArtist({ name: '!!!' })], []);
    assert.strictEqual(merged.length, 1);
    assert.deepStrictEqual(
      filterLibraryHits('!!!', {
        artists: [makeArtist({ name: '!!!' }), makeArtist({ name: 'Other' })],
        albums: [],
        tracks: [],
      }).artists.map((artist) => artist.name),
      ['!!!']
    );
    const top = selectTopResult({
      query: '!!!',
      parsed: parseMusicQuery('!!!'),
      artists: [
        makeArtist({ mbid: 'other', name: 'Other Band' }),
        makeArtist({ mbid: 'chk', name: '!!!' }),
      ],
      albums: [],
      tracks: [],
      upstreamTop: null,
    });
    assert.strictEqual(top?.type === 'artist' ? top.name : null, '!!!');
  });

  it('keeps library albums and tracks by the one-letter band "X"', () => {
    const filtered = filterLibraryHits('X', {
      artists: [makeArtist({ name: 'X' })],
      albums: [
        makeAlbum({ title: 'Los Angeles', artistName: 'X' }),
        makeAlbum({ title: 'X', artistName: 'Ed Sheeran' }),
        makeAlbum({ title: 'VHS', artistName: 'X Ambassadors' }),
      ],
      tracks: [
        makeTrack({ title: 'Johny Hit and Run Paulene', artistName: 'X' }),
      ],
    });
    assert.deepStrictEqual(
      filtered.albums.map((album) => album.title),
      ['Los Angeles']
    );
    assert.strictEqual(filtered.tracks.length, 1);
  });

  it('puts the typed artist first even without an MBID', () => {
    const query = 'phoebe bridgers';
    const sorted = sortArtistsForSearch(
      [
        makeArtist({ mbid: 'mb-1', name: 'Phoebe Bridgers Tribute' }),
        makeArtist({ mbid: null, name: 'Phoebe Bridgers' }),
      ],
      query,
      parseMusicQuery(query)
    );
    assert.strictEqual(sorted[0].name, 'Phoebe Bridgers');
  });
});

describe('the artist the top songs belong to', () => {
  const pinkSongs = [
    makeTrack({ title: 'So What', artistName: 'P!nk' }),
    makeTrack({ title: 'Try', artistName: 'P!nk' }),
    makeTrack({ title: 'Pink Pony Club', artistName: 'Chappell Roan' }),
    makeTrack({ title: 'What About Us', artistName: 'P!nk' }),
  ];

  it('finds the artist of at least three of the top five songs when it is the query', () => {
    const query = 'pink';
    assert.deepStrictEqual(
      findDominantTrackArtist({
        query,
        parsed: parseMusicQuery(query),
        tracks: pinkSongs,
      }),
      { name: 'P!nk', mbid: null }
    );
    assert.strictEqual(
      findDominantTrackArtist({
        query,
        parsed: parseMusicQuery(query),
        tracks: pinkSongs.slice(0, 2),
      }),
      null
    );
    const withMbid = pinkSongs.map((track) =>
      track.artistName === 'P!nk'
        ? { ...track, artistMbid: 'F4D5CC07-3BC9-4836-9B15-88A08359BC63' }
        : track
    );
    assert.deepStrictEqual(
      findDominantTrackArtist({
        query,
        parsed: parseMusicQuery(query),
        tracks: withMbid,
      }),
      { name: 'P!nk', mbid: 'f4d5cc07-3bc9-4836-9b15-88a08359bc63' }
    );
    const explicit = 'pink - so what';
    assert.strictEqual(
      findDominantTrackArtist({
        query: explicit,
        parsed: parseMusicQuery(explicit),
        tracks: pinkSongs,
      }),
      null
    );
  });

  it('looks the artist up only when no listed artist has the songs’ exact name', () => {
    const query = 'pink';
    const parsed = parseMusicQuery(query);
    const dominant = { name: 'P!nk', mbid: null };
    const obscure = makeArtist({ mbid: 'mb-pink-band', name: 'PINK' });
    const splash = makeArtist({ mbid: 'mb-splash', name: 'Pink Pink Splash' });

    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed,
        artists: [obscure, splash],
        libraryArtists: [],
        dominant,
      }),
      { kind: 'lookup' }
    );

    // the exact-name artist is listed and already leads: nothing changes
    const pinkArtist = makeArtist({ mbid: 'mb-p!nk', name: 'P!nk' });
    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed,
        artists: [pinkArtist, obscure],
        libraryArtists: [],
        dominant,
      }),
      { kind: 'keep' }
    );
    // listed further down: promoted without a lookup
    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed,
        artists: [obscure, splash, pinkArtist],
        libraryArtists: [],
        dominant,
      }),
      { kind: 'promote', artist: pinkArtist }
    );
    // the songs carry an MBID nobody lists: promoted from the songs
    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed,
        artists: [obscure],
        libraryArtists: [],
        dominant: { name: 'P!nk', mbid: 'mb-p!nk' },
      }),
      {
        kind: 'promote',
        artist: {
          mbid: 'mb-p!nk',
          name: 'P!nk',
          image: null,
          inLibrary: false,
        },
      }
    );
    // a same-name artist the user owns stays on top
    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed,
        artists: [{ ...obscure, inLibrary: true }],
        libraryArtists: [],
        dominant,
      }),
      { kind: 'keep' }
    );
    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed,
        artists: [obscure],
        libraryArtists: [makeArtist({ name: 'Pink', inLibrary: true })],
        dominant,
      }),
      { kind: 'keep' }
    );
  });

  it('keeps an exact-name artist even when the songs carry another MBID (Gareth)', () => {
    const query = 'gareth';
    const real = makeArtist({ mbid: 'mb-real-gareth', name: 'Gareth' });
    assert.deepStrictEqual(
      planTrackArtistResolution({
        query,
        parsed: parseMusicQuery(query),
        artists: [real],
        libraryArtists: [],
        dominant: { name: 'Gareth', mbid: 'mb-band-member' },
      }),
      { kind: 'keep' }
    );
  });

  it('picks the looked-up artist by exact display name, then score', () => {
    const dominant = { name: 'P!nk', mbid: null };
    assert.deepStrictEqual(
      pickTrackArtistMatch(
        [
          { mbid: 'mb-pink-band', name: 'PINK', score: 100 },
          { mbid: 'mb-p!nk', name: 'P!nk', score: 90 },
          { mbid: 'mb-pinky', name: 'Pinky', score: 99 },
        ],
        dominant
      ),
      { mbid: 'mb-p!nk', name: 'P!nk', image: null, inLibrary: false }
    );
    assert.strictEqual(
      pickTrackArtistMatch(
        [{ mbid: 'mb-pinky', name: 'Pinky', score: 99 }],
        dominant
      ),
      null
    );
  });

  it('promotes an artist to the front and merges its listed copy', () => {
    const listed = makeArtist({
      mbid: 'mb-p!nk',
      name: 'P!nk',
      image: 'https://example.com/p.jpg',
    });
    const obscure = makeArtist({ mbid: 'mb-pink-band', name: 'PINK' });
    assert.deepStrictEqual(
      promoteArtist(
        [obscure, listed],
        makeArtist({ mbid: 'MB-P!NK', name: 'P!nk' })
      ),
      [listed, obscure]
    );
    const fresh = makeArtist({ mbid: 'mb-new', name: 'P!nk' });
    assert.deepStrictEqual(promoteArtist([obscure], fresh), [fresh, obscure]);
  });

  it('fills only missing song artist MBIDs from the exact-name artist', () => {
    const tracks = [
      makeTrack({ title: 'Iris', artistName: 'Gareth', artistMbid: 'mb-band' }),
      makeTrack({ title: 'Another', artistName: 'Gareth' }),
      makeTrack({ title: 'Other', artistName: 'Someone Else' }),
    ];
    const filled = fillTrackArtistMbids(tracks, {
      name: 'Gareth',
      mbid: 'mb-real',
    });
    assert.deepStrictEqual(
      filled.map((track) => track.artistMbid),
      ['mb-band', 'mb-real', null]
    );
    assert.strictEqual(fillTrackArtistMbids(tracks, null), tracks);
  });

  it('never lends an obscure same-name artist MBID to songs with another display name', () => {
    const tracks = [
      makeTrack({ title: 'So What', artistName: 'P!nk' }),
      makeTrack({ title: 'Pink Song', artistName: 'pink' }),
    ];
    // anchor is the obscure "PINK" the search listed
    assert.deepStrictEqual(
      fillTrackArtistMbids(tracks, { name: 'PINK', mbid: 'mb-band' }).map(
        (track) => track.artistMbid
      ),
      [null, 'mb-band']
    );
    // anchor is P!nk resolved from these songs: normalised matches fill too
    assert.deepStrictEqual(
      fillTrackArtistMbids(
        tracks,
        { name: 'Pink', mbid: 'mb-singer' },
        { allowNormalized: true }
      ).map((track) => track.artistMbid),
      ['mb-singer', 'mb-singer']
    );
  });

  it('picks the catalog artist by exact display name, or the single normalised match', () => {
    const dominant = { name: 'P!nk', mbid: null };
    const band = makeArtist({ mbid: 'mb-band', name: 'PINK' });
    const singer = makeArtist({ mbid: 'mb-singer', name: 'p!nk' });
    const splash = makeArtist({ mbid: 'mb-splash', name: 'Pink Pink Splash' });
    assert.strictEqual(
      pickCatalogTrackArtist([band, splash, singer], dominant, new Set()),
      singer
    );
    // the obscure band is listed under another display name: excluded
    assert.strictEqual(
      pickCatalogTrackArtist([band], dominant, new Set(['mb-band'])),
      null
    );
    // a single normalised match is accepted, two are not
    const pinkSinger = makeArtist({ mbid: 'mb-pink', name: 'Pink' });
    assert.strictEqual(
      pickCatalogTrackArtist([pinkSinger], dominant, new Set()),
      pinkSinger
    );
    assert.strictEqual(
      pickCatalogTrackArtist([pinkSinger, band], dominant, new Set()),
      null
    );
    assert.strictEqual(
      pickCatalogTrackArtist([splash], dominant, new Set()),
      null
    );
  });
});

describe('a song whose title starts with the query', () => {
  it('strips appended parts from song titles', () => {
    assert.strictEqual(
      stripTrackTitleExtras('I Wanna Dance with Somebody (Who Loves Me)'),
      'i wanna dance with somebody'
    );
    assert.strictEqual(
      stripTrackTitleExtras('Africa - Remastered 2011'),
      'africa'
    );
    assert.strictEqual(
      stripTrackTitleExtras('Hey Ya! - Single Version [Live]'),
      'hey ya'
    );
    assert.strictEqual(
      stripTrackTitleExtras('Stay (feat. Justin Bieber)'),
      'stay'
    );
    assert.strictEqual(stripTrackTitleExtras('(Untitled)'), 'untitled');
  });

  it('puts the famous song above a same-title album, unless a same-name artist is owned', () => {
    const query = 'i wanna dance with somebody';
    const tracks = [
      makeTrack({
        title: 'I Wanna Dance with Somebody (Who Loves Me)',
        artistName: 'Whitney Houston',
      }),
      makeTrack({
        title: 'I Wanna Dance With Somebody',
        artistName: 'Flip & Fill',
      }),
      makeTrack({
        title: 'I Wanna Dance with Somebody (Who Loves Me) - Single Version',
        artistName: 'Whitney Houston',
      }),
      makeTrack({ title: 'How Will I Know', artistName: 'Whitney Houston' }),
    ];
    const albums = [
      makeAlbum({
        mbid: 'mb-flip',
        title: 'I Wanna Dance With Somebody',
        artistName: 'Flip & Fill',
      }),
    ];
    // as the route does: the "... with Somebody" artist guess is checked
    const parsed = resolveMusicQuerySplit(parseMusicQuery(query), {
      artists: [],
      albums,
      tracks,
    });
    assert.strictEqual(parsed.artist, null);
    const top = selectTopResult({
      query,
      parsed,
      artists: [],
      albums,
      tracks,
      upstreamTop: null,
    });
    assert.strictEqual(top?.type, 'track');
    assert.strictEqual(
      top?.type === 'track' ? top.title : null,
      'I Wanna Dance with Somebody (Who Loves Me)'
    );

    const ownedArtists = [
      makeArtist({
        mbid: 'mb-band',
        name: 'I Wanna Dance With Somebody',
        inLibrary: true,
      }),
    ];
    const owned = selectTopResult({
      query,
      parsed: resolveMusicQuerySplit(parseMusicQuery(query), {
        artists: ownedArtists,
        albums,
        tracks,
      }),
      artists: ownedArtists,
      albums,
      tracks,
      upstreamTop: null,
    });
    assert.strictEqual(owned?.type, 'artist');
  });

  it('picks the most popular same-title song (live order, Deezer ranks)', () => {
    const query = 'i wanna dance with somebody';
    const live = [
      makeTrack({
        title: 'I Wanna Dance With Somebody',
        artistName: 'Bossa Players',
      }),
      makeTrack({
        title: 'I Wanna Dance with Somebody (feat. The High)',
        artistName: 'Hard Lights',
      }),
      makeTrack({
        title: 'I Wanna Dance With Somebody',
        artistName: 'Hi_Tack',
      }),
      makeTrack({
        title: 'I Wanna Dance with Somebody (Who Loves Me)',
        artistName: 'Whitney Houston',
      }),
      makeTrack({
        title: 'I Wanna Dance With Somebody',
        artistName: 'Calum Scott',
      }),
      makeTrack({
        title: 'I Wanna Dance With Somebody',
        artistName: 'Bossart Ensemble',
      }),
    ];
    const tracks = applyTrackPopularity(live, [
      {
        artistName: 'Bossa Players',
        title: 'I Wanna Dance With Somebody',
        rank: 210000,
      },
      {
        artistName: 'Hard Lights',
        title: 'I Wanna Dance with Somebody',
        rank: 330000,
      },
      {
        artistName: 'Whitney Houston',
        title: 'I Wanna Dance with Somebody (Who Loves Me)',
        rank: 912000,
      },
      {
        artistName: 'Calum Scott',
        title: 'I Wanna Dance With Somebody',
        rank: 540000,
      },
    ]);
    assert.strictEqual(tracks[3].popularity, 912000);
    assert.strictEqual(tracks[2].popularity, undefined);
    const parsed = resolveMusicQuerySplit(parseMusicQuery(query), {
      artists: [],
      albums: [],
      tracks,
    });
    const top = selectTopResult({
      query,
      parsed,
      artists: [],
      albums: [],
      tracks,
      upstreamTop: null,
    });
    assert.strictEqual(
      top?.type === 'track' ? top.artistName : null,
      'Whitney Houston'
    );
    // without ranks the ranked order decides, as before
    const unranked = selectTopResult({
      query,
      parsed,
      artists: [],
      albums: [],
      tracks: live,
      upstreamTop: null,
    });
    assert.strictEqual(
      unranked?.type === 'track' ? unranked.artistName : null,
      'Bossa Players'
    );
    // "artist - title" keeps the explicit pick
    const explicit = 'calum scott - i wanna dance with somebody';
    const explicitTop = selectTopResult({
      query: explicit,
      parsed: parseMusicQuery(explicit),
      artists: [],
      albums: [],
      tracks: [tracks[4], ...tracks.filter((_, index) => index !== 4)],
      upstreamTop: null,
    });
    assert.strictEqual(
      explicitTop?.type === 'track' ? explicitTop.artistName : null,
      'Calum Scott'
    );
    assert.strictEqual('popularity' in stripTrackPopularity(tracks[3]), false);
  });
});
