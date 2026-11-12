import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { KavitaLibrary, KavitaSeries } from '@server/api/kavita';
import { MediaStatus, MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import {
  clearComicLibraryProgress,
  replaceComicLibraryProgress,
} from '@server/lib/comicLibraryProgress';
import {
  buildKavitaIndex,
  getKavitaReaderUrl,
  matchKavitaSeries,
  needsComicSeriesFolder,
  pruneComicSeriesRefServices,
  pruneComicSeriesRefs,
  recordComicSeries,
  refreshKavitaIndex,
  resetKavitaReader,
} from '@server/lib/kavitaReader';
import { restrictMediaOperationalFieldsForUser } from '@server/lib/mediaResponse';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';

const libraries: KavitaLibrary[] = [
  { id: 1, name: 'Manga', type: 0, folders: ['/manga'] },
  { id: 2, name: 'Comics', type: 1, folders: ['/comics'] },
  { id: 3, name: 'Books', type: 2, folders: ['/books'] },
];

const series: KavitaSeries[] = [
  {
    id: 11,
    libraryId: 1,
    name: 'Oshi no Ko',
    localizedName: '[Oshi No Ko]',
    folderPath: '/manga/Oshi no Ko',
  },
  {
    id: 12,
    libraryId: 1,
    name: "Frieren: Beyond Journey's End",
    localizedName: 'Sousou no Frieren',
    folderPath: '/manga/Frieren',
    lowestFolderPath: '/manga/Frieren',
  },
  { id: 13, libraryId: 1, name: 'Look Back', folderPath: '/manga/Look Back' },
  {
    id: 14,
    libraryId: 1,
    name: 'Goodbye, Eri',
    folderPath: '/manga/Goodbye Eri',
  },
  {
    id: 21,
    libraryId: 2,
    name: 'Watchmen',
    folderPath: '/comics/DC Comics/Watchmen (1986)',
  },
  // a Watchmen novel in the books library must never be picked
  { id: 31, libraryId: 3, name: 'Watchmen', folderPath: '/books/Watchmen' },
  { id: 22, libraryId: 2, name: 'Saga', comicVineId: '46568' },
  // the same title in both kinds of library
  { id: 15, libraryId: 1, name: 'Akira', folderPath: '/manga/Akira' },
  { id: 23, libraryId: 2, name: 'Akira', folderPath: '/comics/Epic/Akira' },
];

const idx = () => buildKavitaIndex(libraries, series);

describe('matchKavitaSeries', () => {
  it('matches by the series folder', () => {
    assert.deepEqual(
      matchKavitaSeries(
        { title: 'Something else', kind: 'manga', folder: '/manga/Frieren/' },
        idx()
      ),
      { libraryId: 1, seriesId: 12, by: 'folder' }
    );
    assert.deepEqual(
      matchKavitaSeries(
        {
          title: 'Watchmen',
          kind: 'comic',
          folder: '/comics/DC Comics/Watchmen (1986)',
        },
        idx()
      ),
      { libraryId: 2, seriesId: 21, by: 'folder' }
    );
  });

  it('matches files in volume sub-folders and folders mounted elsewhere', () => {
    assert.equal(
      matchKavitaSeries(
        { title: 'x', kind: 'manga', folder: '/manga/Look Back/Volume 01' },
        idx()
      )?.seriesId,
      13
    );
    assert.equal(
      matchKavitaSeries(
        { title: 'x', kind: 'manga', folder: '/data/manga/Goodbye Eri' },
        idx()
      )?.seriesId,
      14
    );
  });

  it('never treats a library root as a series folder', () => {
    assert.equal(
      matchKavitaSeries({ title: 'Nothing', folder: '/manga' }, idx()),
      null
    );
  });

  it('falls back to the name within the right kind of library', () => {
    assert.deepEqual(
      matchKavitaSeries({ title: 'Oshi no Ko', kind: 'manga' }, idx()),
      { libraryId: 1, seriesId: 11, by: 'name' }
    );
    // the localized name, punctuation and a year don't matter
    assert.equal(
      matchKavitaSeries({ title: 'Sousou no Frieren', kind: 'manga' }, idx())
        ?.seriesId,
      12
    );
    assert.equal(
      matchKavitaSeries({ title: 'Goodbye Eri', kind: 'manga' }, idx())
        ?.seriesId,
      14
    );
    assert.equal(
      matchKavitaSeries({ title: 'Watchmen (1986)', kind: 'comic' }, idx())
        ?.seriesId,
      21
    );
    assert.equal(
      matchKavitaSeries({ title: 'Akira', kind: 'comic' }, idx())?.seriesId,
      23
    );
    assert.equal(
      matchKavitaSeries({ title: 'Akira', kind: 'manga' }, idx())?.seriesId,
      15
    );
  });

  it('gives up when a name is ambiguous or unknown', () => {
    assert.equal(matchKavitaSeries({ title: 'Akira' }, idx()), null);
    assert.equal(
      matchKavitaSeries({ title: 'Look Back', kind: 'comic' }, idx()),
      null
    );
    assert.equal(
      matchKavitaSeries({ title: 'Berserk', kind: 'manga' }, idx()),
      null
    );
  });

  it('prefers a ComicVine id Kavita knows', () => {
    assert.deepEqual(
      matchKavitaSeries({ title: 'Saga (2012)', comicVineId: 46568 }, idx()),
      { libraryId: 2, seriesId: 22, by: 'comicvine' }
    );
  });
});

const servers: Server[] = [];
let kavitaUp = true;
let seriesReads = 0;

const startKavita = async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    response.setHeader('Content-Type', 'application/json');
    if (!kavitaUp) {
      response.statusCode = 503;
      response.end('{}');
      return;
    }
    if (url.pathname === '/api/Plugin/authenticate') {
      response.end(JSON.stringify({ token: 'jwt' }));
    } else if (url.pathname === '/api/Library/libraries') {
      response.end(JSON.stringify(libraries));
    } else if (url.pathname === '/api/Series/all-v2') {
      seriesReads += 1;
      response.end(JSON.stringify(series));
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return address.port;
};

const comicMedia = (status: MediaStatus, externalServiceId = 501) =>
  new Media({
    mediaType: MediaType.COMIC,
    status,
    serviceId: 7,
    externalServiceId,
    comicServiceType: 'backissue',
  });

/** Runs the entity's after-load hooks, the way a database read does. */
const loaded = (media: Media) => {
  media.setServiceUrl();
  media.getDownloadingItem();
  return media;
};

describe('Kavita reader links', () => {
  let original: ReturnType<typeof getSettings>['kavita'];

  beforeEach(async () => {
    original = getSettings().kavita;
    resetKavitaReader();
    clearComicLibraryProgress();
    kavitaUp = true;
    seriesReads = 0;
    getSettings().kavita = {
      hostname: '127.0.0.1',
      port: await startKavita(),
      useSsl: false,
      apiKey: 'auth-key',
      externalUrl: 'https://manga.example.com',
    };
  });

  afterEach(async () => {
    getSettings().kavita = original;
    resetKavitaReader();
    clearComicLibraryProgress();
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve()))
        )
    );
  });

  it('prunes reader references for removed series and services', () => {
    recordComicSeries(7, 501, {
      title: 'Removed manga',
      folder: '/manga/Removed',
      owned: 3,
    });
    recordComicSeries(7, 502, {
      title: 'Current manga',
      folder: '/manga/Current',
      owned: 3,
    });
    assert.equal(needsComicSeriesFolder(7, 501, 3), false);

    pruneComicSeriesRefs(7, [502]);
    assert.equal(needsComicSeriesFolder(7, 501, 3), true);
    assert.equal(needsComicSeriesFolder(7, 502, 3), false);

    pruneComicSeriesRefServices([8]);
    assert.equal(needsComicSeriesFolder(7, 502, 3), true);
  });

  it('links a comic with volumes in the library to its Kavita series', async () => {
    recordComicSeries(7, 501, {
      title: 'Frieren',
      kind: 'manga',
      folder: '/manga/Frieren',
    });
    await refreshKavitaIndex();
    replaceComicLibraryProgress(7, [
      {
        externalServiceId: 501,
        progress: { owned: 3, total: 13, active: 0 },
      },
    ]);

    const media = loaded(comicMedia(MediaStatus.PARTIALLY_AVAILABLE));
    assert.equal(
      media.readerUrl,
      'https://manga.example.com/library/1/series/12'
    );
    assert.deepEqual(media.comicProgress, { owned: 3, total: 13 });
  });

  it('gives no link before anything is in the library', async () => {
    recordComicSeries(7, 501, { title: 'Frieren', kind: 'manga' });
    await refreshKavitaIndex();
    replaceComicLibraryProgress(7, [
      {
        externalServiceId: 501,
        progress: { owned: 0, total: 13, active: 1 },
      },
    ]);
    assert.equal(
      loaded(comicMedia(MediaStatus.PROCESSING)).readerUrl,
      undefined
    );
  });

  it('gives no link without a Kavita server', async () => {
    recordComicSeries(7, 501, { title: 'Frieren', kind: 'manga' });
    await refreshKavitaIndex();
    getSettings().kavita = null;
    assert.equal(getKavitaReaderUrl(7, 501), undefined);
    assert.equal(
      loaded(comicMedia(MediaStatus.AVAILABLE)).readerUrl,
      undefined
    );
  });

  it('reads Kavita once and answers from the cache', async () => {
    recordComicSeries(7, 501, { title: 'Look Back', kind: 'manga' });
    recordComicSeries(7, 502, { title: 'Watchmen', kind: 'comic' });
    await refreshKavitaIndex();
    await refreshKavitaIndex(false);
    assert.equal(seriesReads, 1);
    for (let i = 0; i < 5; i++) {
      assert.ok(getKavitaReaderUrl(7, 501));
      assert.ok(getKavitaReaderUrl(7, 502));
    }
    assert.equal(seriesReads, 1);
    // a series the scan sees later is matched against the cached list
    recordComicSeries(7, 503, { title: 'Oshi no Ko', kind: 'manga' });
    assert.equal(
      getKavitaReaderUrl(7, 503),
      'https://manga.example.com/library/1/series/11'
    );
    assert.equal(seriesReads, 1);
  });

  it('backs off failed refreshes unless a refresh is forced', async () => {
    recordComicSeries(7, 501, { title: 'Look Back', kind: 'manga' });
    kavitaUp = false;
    await refreshKavitaIndex();
    assert.equal(getKavitaReaderUrl(7, 501), undefined);

    kavitaUp = true;
    await refreshKavitaIndex(false);
    assert.equal(getKavitaReaderUrl(7, 501), undefined);

    await refreshKavitaIndex();
    assert.equal(
      getKavitaReaderUrl(7, 501),
      'https://manga.example.com/library/1/series/13'
    );
    assert.equal(seriesReads, 1);
  });

  it('looks Kavita up in the background on first use without waiting', async () => {
    recordComicSeries(7, 501, { title: 'Look Back', kind: 'manga' });
    assert.equal(getKavitaReaderUrl(7, 501), undefined);
    await refreshKavitaIndex(); // joins the background read
    assert.equal(
      getKavitaReaderUrl(7, 501),
      'https://manga.example.com/library/1/series/13'
    );
    assert.equal(seriesReads, 1);
  });

  it('keeps the last good list while Kavita is down, and copes without one', async () => {
    recordComicSeries(7, 501, { title: 'Look Back', kind: 'manga' });
    kavitaUp = false;
    await refreshKavitaIndex();
    assert.equal(getKavitaReaderUrl(7, 501), undefined);
    assert.equal(
      loaded(comicMedia(MediaStatus.AVAILABLE)).readerUrl,
      undefined
    );

    kavitaUp = true;
    await refreshKavitaIndex();
    assert.ok(getKavitaReaderUrl(7, 501));

    kavitaUp = false;
    await refreshKavitaIndex();
    assert.equal(
      getKavitaReaderUrl(7, 501),
      'https://manga.example.com/library/1/series/13'
    );
  });

  it('only shows the link to people who can see comics', async () => {
    recordComicSeries(7, 501, { title: 'Look Back', kind: 'manga' });
    await refreshKavitaIndex();
    const reader = (user: User) =>
      restrictMediaOperationalFieldsForUser(
        loaded(comicMedia(MediaStatus.AVAILABLE)),
        user
      )?.readerUrl;

    assert.ok(reader(new User({ id: 10, permissions: Permission.REQUEST })));
    assert.equal(
      reader(
        new User({
          id: 11,
          permissions: Permission.REQUEST,
          settings: { enabledMediaCategories: { comic: false } },
        } as unknown as Partial<User>)
      ),
      undefined
    );
    assert.ok(reader(new User({ id: 1, permissions: Permission.ADMIN })));

    // and never on anything but a comic
    const movie = new Media({ mediaType: MediaType.MOVIE });
    movie.readerUrl = 'https://manga.example.com/library/1/series/13';
    assert.equal(
      restrictMediaOperationalFieldsForUser(
        movie,
        new User({ id: 1, permissions: Permission.ADMIN })
      )?.readerUrl,
      undefined
    );
  });
});
