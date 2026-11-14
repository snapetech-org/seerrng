import KapowarrAPI from '@server/api/comics/kapowarr';
import MylarAPI from '@server/api/comics/mylar';
import LazyLibrarianAPI from '@server/api/lazylibrarian';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import {
  getSettings,
  type KapowarrSettings,
  type LazyLibrarianSettings,
  type LidarrSettings,
  type MylarSettings,
  type RadarrSettings,
  type ReadarrSettings,
  type SonarrSettings,
} from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import {
  annotateReleaseCalendarHistory,
  recordReleaseCalendarSnapshots,
} from './historyStore';
import { getReleaseCalendar } from './index';
import { normalizeCalendarRow } from './normalize';
import { CalendarQueryError, parseCalendarQuery } from './query';
setupTestDb();
afterEach(() => mock.restoreAll());
const range = { start: '2026-09-01', end: '2026-10-01' };
const server = {
  id: 1,
  name: 'test',
  hostname: 'localhost',
  port: 7878,
  useSsl: false,
  baseUrl: '',
  apiKey: 'credential',
  activeProfileId: 1,
  activeProfileName: 'Any',
  activeDirectory: '/media',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};
it('validates real dates, bounded ranges, and shared calendar authority', () => {
  assert.equal(parseCalendarQuery(range, false, false).scope, 'mine');
  assert.equal(
    parseCalendarQuery({ ...range, includeUnmonitored: false }, false, false)
      .includeUnmonitored,
    false
  );
  assert.equal(
    parseCalendarQuery({ ...range, mediaType: 'music' }, false, false)
      .mediaType,
    'music'
  );
  assert.equal(
    parseCalendarQuery({ ...range, mediaType: 'book' }, false, false).mediaType,
    'book'
  );
  assert.equal(
    parseCalendarQuery({ ...range, mediaType: 'software' }, false, false)
      .mediaType,
    'software'
  );
  assert.equal(
    parseCalendarQuery({ ...range, mediaType: 'comic' }, false, false)
      .mediaType,
    'comic'
  );
  assert.equal(
    parseCalendarQuery({ ...range, mediaType: 'magazine' }, false, false)
      .mediaType,
    'magazine'
  );
  for (const query of [
    { start: '2026-02-30', end: '2026-03-10' },
    { start: '2026-01-01', end: '2026-06-01' },
    { ...range, scope: 'other' },
    { ...range, includeUnmonitored: ['true'] },
  ])
    assert.throws(
      () => parseCalendarQuery(query, true, true),
      (error) => error instanceof CalendarQueryError && error.status === 400
    );
  assert.throws(
    () => parseCalendarQuery({ ...range, scope: 'all' }, false, false),
    (error) => error instanceof CalendarQueryError && error.status === 403
  );
  assert.throws(
    () =>
      parseCalendarQuery({ ...range, includeUnmonitored: true }, true, false),
    (error) => error instanceof CalendarQueryError && error.status === 403
  );
});
it('uses a physical release inside the range when a preferred digital release is outside it', () => {
  const result = normalizeCalendarRow(
    'radarr',
    1,
    false,
    {
      id: 1,
      title: 'Movie',
      tmdbId: 2,
      digitalRelease: '2026-08-01',
      physicalRelease: '2026-09-12',
    },
    new Date('2026-09-01'),
    new Date('2026-10-01')
  );
  assert.equal(result?.dateType, 'physical');
  assert.equal(result?.allDay, true);
});
it('keeps one stable event identity when a Radarr release moves between date fields', () => {
  const digital = normalizeCalendarRow(
    'radarr',
    1,
    false,
    { id: 1, title: 'Movie', digitalRelease: '2026-09-12' },
    new Date('2026-09-01'),
    new Date('2026-10-01')
  );
  const physical = normalizeCalendarRow(
    'radarr',
    1,
    false,
    { id: 1, title: 'Movie', physicalRelease: '2026-09-15' },
    new Date('2026-09-01'),
    new Date('2026-10-01')
  );
  assert.equal(digital?.id, physical?.id);
});
it('records and displays date changes for a stable calendar event', async () => {
  const observed = new Date('2026-09-01T04:00:00.000Z');
  const before = {
    id: 'radarr:1:1',
    source: 'radarr' as const,
    mediaType: 'movie' as const,
    title: 'Movie',
    startsAt: '2026-09-12T00:00:00.000Z',
    dateType: 'digital' as const,
    allDay: true,
    available: false,
    is4k: false,
  };
  const after = {
    ...before,
    startsAt: '2026-09-15T00:00:00.000Z',
  };
  assert.deepEqual(await recordReleaseCalendarSnapshots([before], observed), {
    observed: 1,
    changed: 0,
    expired: 0,
  });
  const changedAt = new Date(observed.getTime() + 24 * 60 * 60 * 1000);
  assert.deepEqual(await recordReleaseCalendarSnapshots([after], changedAt), {
    observed: 1,
    changed: 1,
    expired: 0,
  });
  const [annotated] = await annotateReleaseCalendarHistory([after], changedAt);
  assert.deepEqual(annotated.dateChanges, [
    {
      previousStartsAt: before.startsAt,
      startsAt: after.startsAt,
      changedAt: changedAt.toISOString(),
      previousAllDay: true,
      allDay: true,
    },
  ]);
});
it('records all-day versus timed changes even at the same UTC instant', async () => {
  const observed = new Date('2026-09-01T04:00:00.000Z');
  const item = {
    id: 'sonarr:1:11',
    source: 'sonarr' as const,
    mediaType: 'tv' as const,
    title: 'Series',
    startsAt: '2026-09-12T00:00:00.000Z',
    dateType: 'air' as const,
    allDay: true,
    available: false,
    is4k: false,
  };
  await recordReleaseCalendarSnapshots([item], observed);
  assert.deepEqual(
    await recordReleaseCalendarSnapshots(
      [{ ...item, allDay: false }],
      new Date(observed.getTime() + 24 * 60 * 60 * 1000)
    ),
    { observed: 1, changed: 1, expired: 0 }
  );
});
it('does not infer date changes after the daily observation window was missed', async () => {
  const observed = new Date('2026-09-01T04:00:00.000Z');
  const item = {
    id: 'radarr:1:2',
    source: 'radarr' as const,
    mediaType: 'movie' as const,
    title: 'Movie',
    startsAt: '2026-09-12T00:00:00.000Z',
    dateType: 'digital' as const,
    allDay: true,
    available: false,
    is4k: false,
  };
  await recordReleaseCalendarSnapshots([item], observed);
  assert.deepEqual(
    await recordReleaseCalendarSnapshots(
      [{ ...item, startsAt: '2026-09-15T00:00:00.000Z' }],
      new Date(observed.getTime() + 48 * 60 * 60 * 1000)
    ),
    { observed: 1, changed: 0, expired: 0 }
  );
});
it('retains Sonarr episode identity and air time while rejecting malformed episodes', () => {
  const episode = {
    id: 11,
    title: 'Episode',
    airDateUtc: '2026-09-12T20:00:00Z',
    seasonNumber: 1,
    episodeNumber: 2,
    series: { title: 'Series', tmdbId: 4, tvdbId: 5 },
    hasFile: true,
  };
  const result = normalizeCalendarRow('sonarr', 1, true, episode);
  assert.equal(result?.available, true);
  assert.equal(result?.episodeNumber, 2);
  assert.equal(result?.allDay, false);
  assert.equal(
    normalizeCalendarRow('sonarr', 1, true, { ...episode, episodeNumber: 0 }),
    undefined
  );
});
it('normalizes Lidarr album releases with stable MusicBrainz identity and all-day dates', () => {
  const album = normalizeCalendarRow(
    'lidarr',
    9,
    true,
    {
      id: 41,
      title: 'Album',
      foreignAlbumId: 'F5074A43-2E70-4C17-9DFE-21A8980D89A3',
      releaseDate: '2026-09-12T23:00:00-05:00',
      artist: { artistName: 'Artist' },
      statistics: { trackFileCount: 10, totalTrackCount: 10 },
    },
    new Date('2026-09-01T00:00:00.000Z'),
    new Date('2026-10-01T00:00:00.000Z')
  );
  assert.equal(album?.id, 'lidarr:9:41');
  assert.equal(album?.mbId, 'f5074a43-2e70-4c17-9dfe-21a8980d89a3');
  assert.equal(album?.artistName, 'Artist');
  assert.equal(album?.startsAt, '2026-09-12T00:00:00.000Z');
  assert.equal(album?.allDay, true);
  assert.equal(album?.available, true);
  assert.equal(album?.is4k, false);
  assert.equal(
    normalizeCalendarRow('lidarr', 9, false, {
      id: 41,
      title: 'Album',
      releaseDate: 'not-a-date',
    }),
    undefined
  );
});
it('records date changes for Lidarr albums under a stable event identity', async () => {
  const first = normalizeCalendarRow('lidarr', 2, false, {
    id: 41,
    title: 'Album',
    foreignAlbumId: 'f5074a43-2e70-4c17-9dfe-21a8980d89a3',
    releaseDate: '2026-09-12',
  })!;
  const next = normalizeCalendarRow('lidarr', 2, false, {
    id: 41,
    title: 'Album',
    foreignAlbumId: 'f5074a43-2e70-4c17-9dfe-21a8980d89a3',
    releaseDate: '2026-09-16',
  })!;
  const observed = new Date('2026-09-01T04:00:00.000Z');
  assert.deepEqual(await recordReleaseCalendarSnapshots([first], observed), {
    observed: 1,
    changed: 0,
    expired: 0,
  });
  const changedAt = new Date(observed.getTime() + 24 * 60 * 60 * 1000);
  assert.deepEqual(await recordReleaseCalendarSnapshots([next], changedAt), {
    observed: 1,
    changed: 1,
    expired: 0,
  });
  const [annotated] = await annotateReleaseCalendarHistory([next], changedAt);
  assert.equal(annotated.id, 'lidarr:2:41');
  assert.equal(annotated.dateChanges?.[0]?.previousStartsAt, first.startsAt);
  assert.equal(annotated.dateChanges?.[0]?.startsAt, next.startsAt);
});
it('normalizes Readarr book releases with service links, author, format, and provider date', () => {
  const book = normalizeCalendarRow(
    'readarr',
    7,
    false,
    {
      id: 41,
      title: 'Book',
      foreignBookId: 'readarr-native-id',
      releaseDate: '2026-09-12T23:00:00-05:00',
      author: { authorName: 'Author' },
      statistics: { bookFileCount: 1, totalBookCount: 2 },
    },
    new Date('2026-09-01T00:00:00.000Z'),
    new Date('2026-10-01T00:00:00.000Z'),
    'audiobook'
  );
  assert.equal(book?.id, 'readarr:7:41');
  assert.equal(book?.bookId, makeBookshelfBookId(7, 'readarr-native-id'));
  assert.equal(book?.foreignBookId, 'readarr-native-id');
  assert.equal(book?.authorName, 'Author');
  assert.equal(book?.bookFormat, 'audiobook');
  assert.equal(book?.startsAt, '2026-09-12T00:00:00.000Z');
  assert.equal(book?.allDay, true);
  assert.equal(book?.available, true);
  assert.equal(book?.is4k, false);
  assert.equal(
    normalizeCalendarRow('readarr', 7, false, {
      id: 41,
      title: 'Book',
      releaseDate: 'not-a-date',
    }),
    undefined
  );
});
it('records Readarr book date changes under a stable provider event identity', async () => {
  const first = normalizeCalendarRow('readarr', 8, false, {
    id: 41,
    title: 'Book',
    foreignBookId: 'readarr-native-id',
    releaseDate: '2026-09-12',
  })!;
  const next = normalizeCalendarRow('readarr', 8, false, {
    id: 41,
    title: 'Book',
    foreignBookId: 'readarr-native-id',
    releaseDate: '2026-09-16',
  })!;
  const observed = new Date('2026-09-01T04:00:00.000Z');
  assert.deepEqual(await recordReleaseCalendarSnapshots([first], observed), {
    observed: 1,
    changed: 0,
    expired: 0,
  });
  const changedAt = new Date(observed.getTime() + 24 * 60 * 60 * 1000);
  assert.deepEqual(await recordReleaseCalendarSnapshots([next], changedAt), {
    observed: 1,
    changed: 1,
    expired: 0,
  });
  const [annotated] = await annotateReleaseCalendarHistory([next], changedAt);
  assert.equal(annotated.id, 'readarr:8:41');
  assert.equal(annotated.dateChanges?.[0]?.previousStartsAt, first.startsAt);
  assert.equal(annotated.dateChanges?.[0]?.startsAt, next.startsAt);
});
it('keeps successful sources when another fails without exposing service identifiers to ordinary users', async () => {
  getSettings().radarr = [
    { ...server, minimumAvailability: 'released' } as RadarrSettings,
  ];
  getSettings().sonarr = [
    {
      ...server,
      port: 8989,
      seriesType: 'standard',
      animeSeriesType: 'anime',
      enableSeasonFolders: true,
      monitorNewItems: 'all',
    } satisfies SonarrSettings,
  ];
  getSettings().lidarr = [{ ...server, port: 8686 } as LidarrSettings];
  mock.method(RadarrAPI.prototype, 'getReleaseCalendar', async () => [
    {
      id: 1,
      title: 'Movie',
      tmdbId: 2,
      digitalRelease: '2026-09-12',
      hasFile: false,
    },
  ]);
  mock.method(SonarrAPI.prototype, 'getReleaseCalendar', async () => {
    throw new Error('Private upstream error with credential');
  });
  mock.method(
    LidarrAPI.prototype,
    'getReleaseCalendar',
    async (
      _start: string,
      _end: string,
      _unmonitored?: boolean,
      includeArtist?: boolean
    ) => {
      assert.equal(includeArtist, true);
      return [
        {
          id: 3,
          title: 'Album',
          foreignAlbumId: 'f5074a43-2e70-4c17-9dfe-21a8980d89a3',
          releaseDate: '2026-09-18',
          artist: { artistName: 'Artist' },
          statistics: { trackFileCount: 0, totalTrackCount: 10 },
        },
      ];
    }
  );
  const result = await getReleaseCalendar(
    parseCalendarQuery({ ...range, scope: 'all' }, true, false),
    1,
    false
  );
  assert.equal(result.results.length, 2);
  assert.deepEqual(
    result.results.find((item) => item.mediaType === 'music'),
    {
      id: 'lidarr:1:3',
      source: 'lidarr',
      mediaType: 'music',
      title: 'Album',
      startsAt: '2026-09-18T00:00:00.000Z',
      dateType: 'album',
      allDay: true,
      mbId: 'f5074a43-2e70-4c17-9dfe-21a8980d89a3',
      artistName: 'Artist',
      available: false,
      is4k: false,
    }
  );
  assert.deepEqual(result.partialSources, [{ source: 'sonarr' }]);
  assert.equal(JSON.stringify(result).includes('credential'), false);
});
it('limits the personal calendar to the current user’s requested titles and quality', async () => {
  getSettings().radarr = [
    { ...server, minimumAvailability: 'released' } as RadarrSettings,
  ];
  getSettings().sonarr = [];
  getSettings().lidarr = [{ ...server, port: 8686 } as LidarrSettings];
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const media = await getRepository(Media).save(
    new Media({ mediaType: MediaType.MOVIE, tmdbId: 2 })
  );
  await getRepository(MediaRequest).save({
    media,
    type: MediaType.MOVIE,
    requestedBy: user,
    is4k: false,
    status: MediaRequestStatus.APPROVED,
  });
  const requestedAlbumId = 'dedcf1bc-c9a5-4b9a-8b27-17218aade001';
  const album = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MUSIC,
      tmdbId: 0,
      mbId: requestedAlbumId,
    })
  );
  await getRepository(MediaRequest).save({
    media: album,
    type: MediaType.MUSIC,
    requestedBy: user,
    is4k: false,
    status: MediaRequestStatus.APPROVED,
  });
  mock.method(RadarrAPI.prototype, 'getReleaseCalendar', async () => [
    {
      id: 1,
      title: 'Requested movie',
      tmdbId: 2,
      digitalRelease: '2026-09-12',
    },
    { id: 2, title: 'Other movie', tmdbId: 3, digitalRelease: '2026-09-13' },
  ]);
  mock.method(LidarrAPI.prototype, 'getReleaseCalendar', async () => [
    {
      id: 4,
      title: 'Requested album',
      foreignAlbumId: requestedAlbumId.toUpperCase(),
      releaseDate: '2026-09-14',
    },
    {
      id: 5,
      title: 'Other album',
      foreignAlbumId: 'e3b5db15-194a-4a95-a8bb-d5a314140002',
      releaseDate: '2026-09-15',
    },
  ]);
  const result = await getReleaseCalendar(
    parseCalendarQuery(range, false, false),
    1,
    false
  );
  assert.deepEqual(
    result.results.map((item) => item.title),
    ['Requested movie', 'Requested album']
  );
});

it('matches personal Readarr releases by provider identity and requested format', async () => {
  getSettings().radarr = [];
  getSettings().sonarr = [];
  getSettings().lidarr = [];
  getSettings().readarr = [
    { ...server, id: 10, serviceType: 'ebook' } as ReadarrSettings,
    { ...server, id: 11, serviceType: 'audiobook' } as ReadarrSettings,
  ];
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const media = await getRepository(Media).save(
    new Media({ mediaType: MediaType.BOOK, tmdbId: 0 })
  );
  await getRepository(MediaIdentifier).save([
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.READARR,
      value: 'readarr-native-id',
      canonical: true,
    }),
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.OPENLIBRARY_EDITION,
      value: 'OL123M',
    }),
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.ISBN,
      value: '9780306406157',
    }),
  ]);
  const request = await getRepository(MediaRequest).save({
    media,
    type: MediaType.BOOK,
    requestedBy: user,
    is4k: false,
    bookFormat: 'audiobook',
    serviceTargets: [
      {
        serviceType: 'readarr',
        format: 'audiobook',
        serverId: 11,
      },
    ],
    status: MediaRequestStatus.APPROVED,
  });
  mock.method(
    ReadarrAPI.prototype,
    'getReleaseCalendar',
    async (
      _start: string,
      _end: string,
      _unmonitored?: boolean,
      _includeArtist?: boolean,
      includeAuthor?: boolean
    ) => {
      assert.equal(includeAuthor, true);
      return [
        {
          id: 41,
          title: 'Requested book',
          foreignBookId: 'readarr-native-id',
          releaseDate: '2026-09-12',
          author: { authorName: 'Author' },
        },
        {
          id: 42,
          title: 'Requested book',
          foreignBookId: 'unrelated-provider-id',
          releaseDate: '2026-09-13',
        },
        {
          id: 43,
          title: 'Requested edition',
          foreignBookId: 'another-provider-id',
          foreignEditionId: 'OL123M',
          releaseDate: '2026-09-14',
        },
        {
          id: 44,
          title: 'Requested ISBN edition',
          foreignBookId: 'yet-another-provider-id',
          editions: [{ isbn13: '9780306406157' }],
          releaseDate: '2026-09-15',
        },
      ];
    }
  );

  const query = parseCalendarQuery(range, false, false);
  const audiobookCalendar = await getReleaseCalendar(query, user.id, false, {
    includeDateHistory: false,
  });
  assert.deepEqual(
    audiobookCalendar.results.map((item) => [item.id, item.bookFormat]),
    [
      ['readarr:11:41', 'audiobook'],
      ['readarr:11:43', 'audiobook'],
      ['readarr:11:44', 'audiobook'],
    ]
  );

  await getRepository(MediaRequest).update(request.id, {
    bookFormat: 'both',
    serviceTargets: [],
  });
  const bothFormatsCalendar = await getReleaseCalendar(query, user.id, false, {
    includeDateHistory: false,
  });
  assert.deepEqual(
    bothFormatsCalendar.results.map((item) => [item.id, item.bookFormat]),
    [
      ['readarr:10:41', 'ebook'],
      ['readarr:11:41', 'audiobook'],
      ['readarr:10:43', 'ebook'],
      ['readarr:11:43', 'audiobook'],
      ['readarr:10:44', 'ebook'],
      ['readarr:11:44', 'audiobook'],
    ]
  );
});

it('matches a request stored under a bare ChaptarrNG id to its qualified release', async () => {
  getSettings().radarr = [];
  getSettings().sonarr = [];
  getSettings().lidarr = [];
  getSettings().readarr = [
    {
      ...server,
      id: 12,
      hostname: 'hc.chaptarr.test',
      serviceType: 'audiobook',
    } as ReadarrSettings,
  ];
  mock.method(ReadarrAPI, 'getKnownLibraryIdDialect', () => 'hc');
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const media = await getRepository(Media).save(
    new Media({ mediaType: MediaType.BOOK, tmdbId: 0 })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.BOOKSHELF,
      value: makeBookshelfBookId(12, '459744'),
      canonical: true,
    })
  );
  await getRepository(MediaRequest).save({
    media,
    type: MediaType.BOOK,
    requestedBy: user,
    is4k: false,
    bookFormat: 'audiobook',
    status: MediaRequestStatus.APPROVED,
  });
  mock.method(ReadarrAPI.prototype, 'getReleaseCalendar', async () => [
    {
      id: 51,
      title: 'Requested book',
      foreignBookId: 'hc:459744',
      releaseDate: '2026-09-12',
    },
    {
      id: 52,
      title: 'Same number, other provider',
      foreignBookId: 'gr:459744',
      releaseDate: '2026-09-13',
    },
  ]);

  const calendar = await getReleaseCalendar(
    parseCalendarQuery(range, false, false),
    user.id,
    false,
    { includeDateHistory: false }
  );
  assert.deepEqual(
    calendar.results.map((item) => item.id),
    ['readarr:12:51']
  );
});

it('uses local month boundaries for episode times and UTC date boundaries for all-day movies', () => {
  const query = parseCalendarQuery(
    { ...range, timeZone: 'America/Regina' },
    true,
    true
  );
  assert.equal(query.start.toISOString(), '2026-09-01T06:00:00.000Z');
  assert.equal(query.end.toISOString(), '2026-10-01T06:00:00.000Z');
  assert.equal(query.allDayStart.toISOString(), '2026-09-01T00:00:00.000Z');
  const dst = parseCalendarQuery(
    { start: '2026-03-01', end: '2026-04-01', timeZone: 'America/New_York' },
    true,
    true
  );
  assert.equal(dst.start.toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(dst.end.toISOString(), '2026-04-01T04:00:00.000Z');
  assert.throws(
    () =>
      parseCalendarQuery(
        { ...range, timeZone: 'Unknown/Timezone' },
        true,
        true
      ),
    (error) => error instanceof CalendarQueryError && error.status === 400
  );
});

it('handles a month boundary where daylight saving skips midnight', () => {
  const query = parseCalendarQuery(
    { start: '2014-08-01', end: '2014-09-01', timeZone: 'Africa/Cairo' },
    true,
    true
  );
  assert.equal(query.start.toISOString(), '2014-07-31T22:00:00.000Z');
});

it('shows requested Mylar and LazyLibrarian issues only when they have exact dates', async () => {
  getSettings().radarr = [];
  getSettings().sonarr = [];
  getSettings().lidarr = [];
  getSettings().readarr = [];
  getSettings().mylar = [{ ...server, port: 8090 } as MylarSettings];
  getSettings().kapowarr = [];
  getSettings().lazylibrarian = [
    { ...server, id: 9, port: 5299 } as LazyLibrarianSettings,
  ];
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const comic = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.COMIC,
      tmdbId: 0,
    })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media: comic,
      provider: MediaIdentifierProvider.COMICVINE,
      value: '1234',
      canonical: true,
    })
  );
  const magazine = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MAGAZINE,
      tmdbId: 0,
      serviceId: 9,
      externalServiceId: 0,
      externalServiceSlug: 'The Economist',
    })
  );
  await getRepository(MediaRequest).save([
    {
      media: comic,
      type: MediaType.COMIC,
      requestedBy: user,
      is4k: false,
      status: MediaRequestStatus.APPROVED,
      serviceTargets: [
        {
          serviceType: 'mylar',
          format: 'comic',
          serverId: server.id,
          status: MediaStatus.PENDING,
        },
      ],
    },
    {
      media: magazine,
      type: MediaType.MAGAZINE,
      requestedBy: user,
      is4k: false,
      status: MediaRequestStatus.APPROVED,
      serviceTargets: [
        {
          serviceType: 'lazylibrarian',
          format: 'magazine',
          serverId: 9,
          status: MediaStatus.PENDING,
        },
      ],
    },
  ]);
  const mylarLookups: string[] = [];
  mock.method(
    MylarAPI.prototype,
    'getComic',
    async (comicId: string, ttl?: number) => {
      mylarLookups.push(comicId);
      assert.equal(ttl, 60);
      return {
        comic: { id: comicId, name: 'Batman' },
        issues: [
          {
            id: '701',
            number: '1',
            releaseDate: '2026-09',
            issueDate: '2026-09-10',
            status: 'Downloaded',
          },
          {
            id: '702',
            number: '2',
            releaseDate: '2026-09-31',
            issueDate: '2026-09',
            status: 'Wanted',
          },
        ],
      };
    }
  );
  mock.method(
    LazyLibrarianAPI.prototype,
    'getIssues',
    async (title: string, signal?: AbortSignal, ttl?: number) => {
      assert.equal(title, 'The Economist');
      assert.equal(signal, undefined);
      assert.equal(ttl, 60);
      return {
        magazine: { title },
        issues: [
          {
            issueId: 'economist-2026-09-18',
            issueNumber: '18 Sep',
            title: 'The Economist',
            issueDate: '2026-09-18',
            issueFile: undefined,
          },
        ],
      };
    }
  );

  const result = await getReleaseCalendar(
    parseCalendarQuery(range, false, false),
    user.id,
    false,
    { includeDateHistory: false }
  );

  assert.deepEqual(mylarLookups, ['1234']);
  assert.deepEqual(
    result.results.map((item) => [
      item.mediaType,
      item.title,
      item.startsAt,
      item.available,
    ]),
    [
      ['comic', 'Batman #1', '2026-09-10T00:00:00.000Z', true],
      ['magazine', 'The Economist #18 Sep', '2026-09-18T00:00:00.000Z', false],
    ]
  );
  assert.equal(result.partialSources.length, 0);
});

it('uses Kapowarr issue dates for monitored titles in the shared calendar', async () => {
  getSettings().radarr = [];
  getSettings().sonarr = [];
  getSettings().lidarr = [];
  getSettings().readarr = [];
  getSettings().mylar = [];
  getSettings().kapowarr = [{ ...server, port: 5656 } as KapowarrSettings];
  getSettings().lazylibrarian = [];
  mock.method(KapowarrAPI.prototype, 'getVolumes', async () => [
    {
      id: 2,
      comicvine_id: 2002,
      title: 'Daredevil',
      monitored: true,
      issue_count: 1,
      issues_downloaded: 0,
    },
  ]);
  mock.method(
    KapowarrAPI.prototype,
    'getVolume',
    async (id: number, ttl?: number) => {
      assert.equal(id, 2);
      assert.equal(ttl, 60);
      return {
        id,
        comicvine_id: 2002,
        title: 'Daredevil',
        monitored: true,
        issue_count: 1,
        issues_downloaded: 0,
        issues: [
          {
            id: 92,
            volume_id: 2,
            issue_number: '7',
            title: 'The Red Fist',
            releaseDate: '2026-09-22',
            files: [],
          },
        ],
      };
    }
  );

  const result = await getReleaseCalendar(
    parseCalendarQuery(
      { ...range, scope: 'all', mediaType: 'comic' },
      true,
      false
    ),
    1,
    false,
    { includeDateHistory: false }
  );

  assert.deepEqual(
    result.results.map((item) => [
      item.source,
      item.title,
      item.comicId,
      item.startsAt,
    ]),
    [['kapowarr', 'Daredevil #7', '2002', '2026-09-22T00:00:00.000Z']]
  );
  assert.equal(result.partialSources.length, 0);
});

it('resolves a requested Kapowarr volume by ComicVine ID without a library slug', async () => {
  getSettings().radarr = [];
  getSettings().sonarr = [];
  getSettings().lidarr = [];
  getSettings().readarr = [];
  getSettings().mylar = [];
  getSettings().kapowarr = [{ ...server, port: 5656 } as KapowarrSettings];
  getSettings().lazylibrarian = [];
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const comic = await getRepository(Media).save(
    new Media({ mediaType: MediaType.COMIC, tmdbId: 0 })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media: comic,
      provider: MediaIdentifierProvider.COMICVINE,
      value: '2002',
      canonical: true,
    })
  );
  await getRepository(MediaRequest).save({
    media: comic,
    type: MediaType.COMIC,
    requestedBy: user,
    is4k: false,
    status: MediaRequestStatus.APPROVED,
    serviceTargets: [
      {
        serviceType: 'kapowarr',
        format: 'comic',
        serverId: server.id,
        status: MediaStatus.PENDING,
      },
    ],
  });
  const volumeLookupIds: number[] = [];
  mock.method(KapowarrAPI.prototype, 'getVolumes', async () => [
    {
      id: 2,
      comicvine_id: 2002,
      title: 'Daredevil',
      monitored: true,
      issue_count: 1,
      issues_downloaded: 0,
    },
  ]);
  mock.method(
    KapowarrAPI.prototype,
    'getVolume',
    async (id: number, ttl?: number) => {
      volumeLookupIds.push(id);
      assert.equal(ttl, 60);
      return {
        id,
        comicvine_id: 2002,
        title: 'Daredevil',
        monitored: true,
        issue_count: 1,
        issues_downloaded: 0,
        issues: [
          {
            id: 92,
            volume_id: id,
            issue_number: '7',
            title: 'The Red Fist',
            releaseDate: '2026-09-22',
            files: [],
          },
        ],
      };
    }
  );

  const result = await getReleaseCalendar(
    parseCalendarQuery({ ...range, mediaType: 'comic' }, false, false),
    user.id,
    false,
    { includeDateHistory: false }
  );

  assert.deepEqual(volumeLookupIds, [2]);
  assert.deepEqual(
    result.results.map((item) => [item.id, item.title, item.startsAt]),
    [['kapowarr:1:2002:92', 'Daredevil #7', '2026-09-22T00:00:00.000Z']]
  );
  assert.equal(result.partialSources.length, 0);
});
