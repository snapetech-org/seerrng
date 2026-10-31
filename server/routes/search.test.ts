import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import ComicVineAPI from '@server/api/comicvine';
import ExternalAPI from '@server/api/externalapi';
import LazyLibrarianAPI, {
  type LazyLibrarianMagazine,
} from '@server/api/lazylibrarian';
import MusicBrainz from '@server/api/musicbrainz';
import OpenLibraryAPI from '@server/api/openlibrary';
import ReadarrAPI from '@server/api/servarr/readarr';
import TheAudioDb from '@server/api/theaudiodb';
import TmdbPersonMapper from '@server/api/themoviedb/personMapper';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import MetadataAlbum from '@server/entity/MetadataAlbum';
import MetadataArtist from '@server/entity/MetadataArtist';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import {
  getSettings,
  type LazyLibrarianSettings,
  type LidarrSettings,
  type ReadarrSettings,
} from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import { waitForBackgroundTasks } from '@server/utils/backgroundTasks';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import searchRoutes, {
  MAX_COMBINED_SEARCH_RESULTS,
  MAX_SEARCH_RESULTS_PER_PROVIDER,
  SEARCH_PROVIDER_TIMEOUT_MS,
  SEARCH_RATE_LIMIT,
  capSearchProviderResults,
  extractSearchCrew,
} from './search';

let app: Express;

describe('search provider result bounds', () => {
  it('bounds authenticated search fan-out', () => {
    assert.deepStrictEqual(SEARCH_RATE_LIMIT, {
      windowMs: 60_000,
      limit: 30,
    });
  });

  it('caps malformed and oversized provider arrays', () => {
    const values = Array.from(
      { length: MAX_COMBINED_SEARCH_RESULTS + 10 },
      (_, index) => index
    );

    assert.strictEqual(
      capSearchProviderResults(values).length,
      MAX_SEARCH_RESULTS_PER_PROVIDER
    );
    assert.strictEqual(
      capSearchProviderResults(values, MAX_COMBINED_SEARCH_RESULTS).length,
      MAX_COMBINED_SEARCH_RESULTS
    );
    assert.deepStrictEqual(capSearchProviderResults({}), []);
  });
});

describe('search credit enrichment', () => {
  it('extracts and alphabetizes movie directors and credited writers', () => {
    assert.deepStrictEqual(
      extractSearchCrew({
        credits: {
          crew: [
            { job: 'Director', name: 'Zed Director' },
            { job: 'Screenplay', name: 'Beth Writer' },
            { job: 'Writer', name: 'Alex Writer' },
            { job: 'Producer', name: 'Ignored Producer' },
          ],
        },
      }),
      {
        directors: ['Zed Director'],
        writers: ['Alex Writer', 'Beth Writer'],
      }
    );
  });

  it('uses series creators when no writing credit is present', () => {
    assert.deepStrictEqual(
      extractSearchCrew({
        credits: { crew: [{ job: 'Director', name: 'Series Director' }] },
        created_by: [{ name: 'Series Creator' }],
      }),
      {
        directors: ['Series Director'],
        writers: ['Series Creator'],
      }
    );
  });
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: randomBytes(32).toString('hex'),
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  app.use('/auth', authRoutes);
  app.use('/search', searchRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(async () => {
  app = createApp();
});

beforeEach(() => {
  getSettings().lidarr = [{} as LidarrSettings];
  getSettings().readarr = [{} as ReadarrSettings];
});

afterEach(async () => {
  await waitForBackgroundTasks();
  mock.restoreAll();
  getSettings().lidarr = [];
  getSettings().readarr = [];
  getSettings().lazylibrarian = [];
});

setupTestDb();

const mockPrivateMethod = mock.method as (
  object: object,
  methodName: string,
  implementation: (...args: unknown[]) => unknown
) => unknown;
const mockPrivate = (
  object: object,
  methodName: string,
  implementation: (...args: unknown[]) => unknown
) => mockPrivateMethod.call(mock, object, methodName, implementation);

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('GET /search', () => {
  const magazineService = (id: number): LazyLibrarianSettings => ({
    id,
    name: `LazyLibrarian ${id}`,
    hostname: `lazylibrarian-${id}.test`,
    port: 5299,
    apiKey: 'test-key',
    useSsl: false,
    isDefault: id === 1,
    tags: [],
    syncEnabled: false,
    preventSearch: false,
  });

  it('omits optional catalog providers without configured services', async () => {
    const settings = getSettings();
    const priorLidarr = settings.lidarr;
    const priorReadarr = settings.readarr;
    settings.lidarr = [];
    settings.readarr = [];

    const albumSearch = mock.method(
      MusicBrainz.prototype,
      'searchAlbumWithTotal'
    );
    const artistSearch = mock.method(
      MusicBrainz.prototype,
      'searchArtistWithTotal'
    );
    const bookSearch = mock.method(OpenLibraryAPI.prototype, 'searchBooks');
    const comicSearch = mock.method(ComicVineAPI.prototype, 'searchVolumes');
    mockPrivate(ExternalAPI.prototype, 'get', async (endpoint) => {
      if (endpoint === '/search/multi') {
        return { page: 1, total_pages: 1, total_results: 0, results: [] };
      }

      throw new Error(`Unexpected endpoint: ${String(endpoint)}`);
    });

    try {
      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const res = await agent.get('/search').query({ query: 'optional' });

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.results, []);
      assert.strictEqual(res.body.totalResults, 0);
      assert.strictEqual(albumSearch.mock.callCount(), 0);
      assert.strictEqual(artistSearch.mock.callCount(), 0);
      assert.strictEqual(bookSearch.mock.callCount(), 0);
      assert.strictEqual(comicSearch.mock.callCount(), 0);
    } finally {
      settings.lidarr = priorLidarr;
      settings.readarr = priorReadarr;
    }
  });

  it('keeps healthy magazine matches when another catalog stalls', async () => {
    getSettings().lazylibrarian = [magazineService(1), magazineService(2)];
    let releaseStalledCatalog!: (value: LazyLibrarianMagazine[]) => void;
    const stalledCatalog = new Promise<LazyLibrarianMagazine[]>((resolve) => {
      releaseStalledCatalog = resolve;
    });
    let calls = 0;
    mock.method(LazyLibrarianAPI.prototype, 'getMagazines', () =>
      ++calls === 1
        ? Promise.resolve([{ title: 'Science Monthly' }])
        : stalledCatalog
    );

    try {
      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const res = await agent
        .get('/search')
        .query({ query: 'Science', type: 'magazine' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results[0]?.title, 'Science Monthly');
    } finally {
      releaseStalledCatalog([]);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });

  it('limits concurrent magazine catalog lookups in global search', async () => {
    getSettings().lazylibrarian = [1, 2, 3, 4, 5].map(magazineService);
    let active = 0;
    let peak = 0;
    const getMagazines = mock.method(
      LazyLibrarianAPI.prototype,
      'getMagazines',
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return [{ title: 'Science Monthly' }];
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'Science', type: 'magazine' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(getMagazines.mock.callCount(), 5);
    assert.ok(peak <= 2, `expected at most two lookups, saw ${peak}`);
  });

  it('keeps configured service order when magazine titles overlap', async () => {
    getSettings().lazylibrarian = [magazineService(1), magazineService(2)];
    let calls = 0;
    mock.method(LazyLibrarianAPI.prototype, 'getMagazines', async () => {
      const call = ++calls;
      if (call === 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return [
        {
          title: 'Science Monthly',
          latestCover: `cache/magazine/${(call === 1 ? 'a' : 'b').repeat(40)}.jpg`,
        },
      ];
    });

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'Science', type: 'magazine' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.body.results[0]?.posterPath,
      `/api/v1/magazine/cover/1/${'a'.repeat(40)}`
    );
  });

  it('returns comics from ComicVine, merges local media, and respects the comic type filter', async () => {
    const settings = getSettings();
    const originalComicVineApiKey = settings.main.comicVineApiKey;
    settings.main.comicVineApiKey = 'test-comicvine-key';

    try {
      mock.method(ComicVineAPI.prototype, 'searchVolumes', async () => ({
        error: 'OK',
        limit: 20,
        offset: 0,
        number_of_page_results: 1,
        number_of_total_results: 1,
        status_code: 1,
        results: [
          {
            id: 5678,
            name: 'Global Comic',
            resource_type: 'volume' as const,
          },
        ],
      }));

      const comicMedia = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.COMIC,
          status: MediaStatus.AVAILABLE,
        })
      );
      await getRepository(MediaIdentifier).save(
        new MediaIdentifier({
          media: comicMedia,
          provider: MediaIdentifierProvider.COMICVINE,
          value: '5678',
          canonical: true,
        })
      );

      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const res = await agent
        .get('/search')
        .query({ query: 'global', type: 'comic' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.length, 1);
      const comic = res.body.results[0];
      assert.strictEqual(comic.mediaType, 'comic');
      assert.strictEqual(comic.id, '5678');
      assert.strictEqual(comic.title, 'Global Comic');
      assert.strictEqual(comic.mediaInfo.id, comicMedia.id);
      assert.strictEqual(comic.mediaInfo.status, MediaStatus.AVAILABLE);
    } finally {
      settings.main.comicVineApiKey = originalComicVineApiKey;
    }
  });

  it('searches authors in Open Library and configured Bookshelf services', async () => {
    mock.method(OpenLibraryAPI.prototype, 'searchAuthors', async () => ({
      numFound: 2,
      start: 0,
      docs: [
        {
          key: '/authors/OL1A',
          name: 'Shared Writer',
          top_work: 'First Book',
          work_count: 20,
        },
        { key: '/authors/OL2A', name: 'Open Library Writer' },
      ],
    }));
    mock.method(ReadarrAPI.prototype, 'lookupAuthor', async () => [
      {
        foreignAuthorId: 'bookshelf-author-1',
        authorName: 'Shared Writer',
      },
      {
        foreignAuthorId: 'bookshelf-author-2',
        authorName: 'Bookshelf Writer',
      },
    ]);

    getSettings().readarr = [
      {
        id: 7,
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'test-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'ebook',
      } as ReadarrSettings,
    ];
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'writer',
      type: 'author',
    });

    assert.strictEqual(res.status, 200);
    const authors = res.body.results as {
      id: string;
      mediaType: string;
      name: string;
      provider: string;
    }[];
    assert.deepStrictEqual(authors.map(({ name }) => name).sort(), [
      'Bookshelf Writer',
      'Open Library Writer',
      'Shared Writer',
    ]);
    assert.strictEqual(authors.length, 3);
    assert.ok(authors.every((author) => author.mediaType === 'author'));
    assert.strictEqual(
      authors.find((author) => author.name === 'Shared Writer')?.provider,
      'openlibrary'
    );
  });

  it('rejects missing search queries before provider lookup', async () => {
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search');

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Query must be a string/);
  });

  it('rejects oversized search queries', async () => {
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search/company')
      .query({ query: 'x'.repeat(257) });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /256 characters or fewer/);
  });

  it('rejects array language parameters before provider lookup', async () => {
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'matrix', language: ['en', 'fr'] });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Language must be a string/);
  });

  it('uses the saved metadata language independently from display language', async () => {
    const targetUser = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });
    const userSettings =
      targetUser.settings ?? new UserSettings({ user: targetUser });
    const originalLocale = userSettings.locale;
    const originalMetadataLocale = userSettings.metadataLocale;

    try {
      userSettings.locale = 'de';
      userSettings.metadataLocale = 'fr';
      await getRepository(UserSettings).save(userSettings);

      const searchedLanguages: (string | undefined)[] = [];
      mockPrivate(ExternalAPI.prototype, 'get', async (endpoint, options) => {
        if (endpoint === '/search/multi') {
          searchedLanguages.push(
            (options as { params?: { language?: string } })?.params?.language
          );
          return {
            page: 1,
            total_pages: 1,
            total_results: 0,
            results: [],
          };
        }
        throw new Error(`Unexpected endpoint: ${String(endpoint)}`);
      });
      const user = await loginAs('friend@seerr.dev', 'test1234');

      const preferred = await user.get('/search').query({ query: 'metadata' });
      assert.strictEqual(preferred.status, 200);
      assert.strictEqual(searchedLanguages[0], 'fr');

      const explicit = await user
        .get('/search')
        .query({ query: 'metadata', language: 'ja' });
      assert.strictEqual(explicit.status, 200);
      assert.strictEqual(searchedLanguages[1], 'ja');

      userSettings.metadataLocale = null;
      await getRepository(UserSettings).save(userSettings);

      const displayFallback = await user
        .get('/search')
        .query({ query: 'metadata' });
      assert.strictEqual(displayFallback.status, 200);
      assert.strictEqual(searchedLanguages[2], 'de');
    } finally {
      userSettings.locale = originalLocale ?? '';
      userSettings.metadataLocale = originalMetadataLocale ?? null;
      await getRepository(UserSettings).save(userSettings);
    }
  });

  it('does not return ebook catalog results for an unavailable audiobook service', async () => {
    getSettings().readarr = [{ serviceType: 'ebook' } as ReadarrSettings];
    const bookSearch = mock.method(OpenLibraryAPI.prototype, 'searchBooks');
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'microsoft',
      type: 'book',
      format: 'audiobook',
    });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.results, []);
    assert.strictEqual(res.body.totalResults, 0);
    assert.strictEqual(bookSearch.mock.callCount(), 0);
  });

  it('queries only audiobook Bookshelf services for audiobook searches', async () => {
    getSettings().readarr = [
      {
        id: 1,
        hostname: 'ebookshelf.test',
        port: 8787,
        apiKey: 'ebook-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'ebook',
      } as ReadarrSettings,
      {
        id: 2,
        hostname: 'audiobookshelf.test',
        port: 8787,
        apiKey: 'audio-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'audiobook',
      } as ReadarrSettings,
    ];
    const openLibrarySearch = mock.method(
      OpenLibraryAPI.prototype,
      'searchBooks'
    );
    const audiobookSearch = mock.method(
      ReadarrAPI.prototype,
      'lookupBook',
      async () => []
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'The Da Vinci Code',
      type: 'book',
      format: 'audiobook',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(openLibrarySearch.mock.callCount(), 0);
    assert.strictEqual(audiobookSearch.mock.callCount(), 1);
  });

  it('explains when the configured audiobook catalog is unavailable', async () => {
    getSettings().readarr = [
      {
        id: 1,
        hostname: 'audiobookshelf.test',
        port: 8787,
        apiKey: 'audio-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'audiobook',
      } as ReadarrSettings,
    ];
    const audiobookSearch = mock.method(
      ReadarrAPI.prototype,
      'lookupBook',
      async () => {
        throw new Error('Catalog connection refused');
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'Pacific',
      type: 'book',
      format: 'audiobook',
    });

    assert.strictEqual(res.status, 503);
    assert.deepStrictEqual(res.body, {
      status: 503,
      message:
        'The configured audiobook catalog is unavailable. Please try again.',
    });
    assert.strictEqual(audiobookSearch.mock.callCount(), 1);
  });

  it('does not search an administrator-disabled book format', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.readarr = [{ serviceType: 'ebook' } as ReadarrSettings];
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      ebook: false,
      audiobook: true,
    };
    const bookSearch = mock.method(OpenLibraryAPI.prototype, 'searchBooks');

    try {
      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const res = await agent.get('/search').query({
        query: 'microsoft',
        type: 'book',
        format: 'ebook',
      });

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.results, []);
      assert.strictEqual(res.body.totalResults, 0);
      assert.strictEqual(bookSearch.mock.callCount(), 0);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
      settings.readarr = [];
    }
  });

  it('limits global book keywords to visible title and author fields', async () => {
    const bookSearch = mock.method(
      OpenLibraryAPI.prototype,
      'searchBooks',
      async ({ query }: { query: string }) => {
        assert.strictEqual(
          query,
          '(title:"windows" OR author:"windows" OR subject:"windows") AND (title:"11" OR author:"11" OR subject:"11")'
        );

        return {
          numFound: 2,
          start: 0,
          docs: [
            {
              key: '/works/OLWINDOWS11W',
              title: 'Windows 11 Inside Out',
              author_name: ['Ed Bott'],
            },
            {
              key: '/works/OLHIDDENW',
              title: 'A Completely Unrelated Novel',
              subject: ['Unrelated Fiction'],
            },
          ],
        };
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'windows 11',
      type: 'book',
      format: 'ebook',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(bookSearch.mock.callCount(), 1);
    assert.deepStrictEqual(
      res.body.results.map((result: { title: string }) => result.title),
      ['Windows 11 Inside Out']
    );
  });

  it('finds individual novels by their series subject after the global provider deadline', async () => {
    mock.method(
      OpenLibraryAPI.prototype,
      'searchBooks',
      async ({ query }: { query: string }) => {
        assert.equal(
          query,
          '(title:"kingkiller" OR author:"kingkiller" OR subject:"kingkiller")'
        );
        await new Promise((resolve) =>
          setTimeout(resolve, SEARCH_PROVIDER_TIMEOUT_MS + 100)
        );
        return {
          numFound: 2,
          start: 0,
          docs: [
            {
              key: '/works/OL8479867W',
              title: 'The Name of the Wind',
              author_name: ['Patrick Rothfuss'],
              subject: ['The Kingkiller Chronicle'],
            },
            {
              key: '/works/OL8479869W',
              title: "The Wise Man's Fear",
              author_name: ['Patrick Rothfuss'],
              subject: ['The Kingkiller Chronicle'],
            },
          ],
        };
      }
    );
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const response = await agent
      .get('/search')
      .query({ query: 'kingkiller', type: 'book', format: 'ebook' });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.results.map((book: { id: string }) => book.id),
      ['OL8479867W', 'OL8479869W']
    );
  });

  it('returns a static useful error when the book catalog fails', async () => {
    mock.method(OpenLibraryAPI.prototype, 'searchBooks', async () => {
      throw new Error('private provider credential');
    });
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const response = await agent
      .get('/search')
      .query({ query: 'kingkiller', type: 'book' });
    assert.equal(response.status, 503);
    assert.match(response.body.message, /Open Library.*unavailable/);
    assert(!JSON.stringify(response.body).includes('private'));
  });

  it('keeps the main artist search while refining music by album title', async () => {
    let albumQuery: string | undefined;
    const artistSearch = mock.method(
      MusicBrainz.prototype,
      'searchArtistWithTotal',
      async () => ({
        results: [],
        totalResults: 0,
      })
    );
    mock.method(
      MusicBrainz.prototype,
      'searchAlbumWithTotal',
      async ({ query }: { query: string }) => {
        albumQuery = query;
        return { results: [], totalResults: 0 };
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'Madonna',
      type: 'music',
      resultFilter: 'Prayer',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      albumQuery,
      '(releasegroup:madonna OR artist:madonna OR tag:madonna) AND releasegroup:prayer'
    );
    assert.strictEqual(artistSearch.mock.callCount(), 0);
  });

  it('escapes Lucene special characters in the default music search query', async () => {
    let albumQuery: string | undefined;
    let artistQuery: string | undefined;
    mock.method(
      MusicBrainz.prototype,
      'searchAlbumWithTotal',
      async ({ query }: { query: string }) => {
        albumQuery = query;
        return { results: [], totalResults: 0 };
      }
    );
    mock.method(
      MusicBrainz.prototype,
      'searchArtistWithTotal',
      async ({ query }: { query: string }) => {
        artistQuery = query;
        return { results: [], totalResults: 0 };
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'Say Anything (Live)!',
      type: 'music',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(albumQuery, 'Say Anything \\(Live\\)\\!');
    assert.strictEqual(artistQuery, 'Say Anything \\(Live\\)\\!');
  });

  it('autocomplete searches artist prefixes without fetching albums or dropping mapped artists', async () => {
    const artistId = '79239441-bfd5-4981-a70c-55c3f15c1287';
    await getRepository(MetadataArtist).save(
      new MetadataArtist({ mbArtistId: artistId, tmdbPersonId: '999' })
    );
    const albums = mock.method(
      MusicBrainz.prototype,
      'searchAlbumWithTotal',
      async () => {
        throw new Error('Albums should not be fetched');
      }
    );
    mock.method(
      MusicBrainz.prototype,
      'searchArtistWithTotal',
      async ({ query }: { query: string }) => {
        assert.strictEqual(query, 'artist:Mad*');
        return {
          totalResults: 1,
          results: [
            {
              id: artistId,
              name: 'Madonna',
              type: 'Person',
              score: 100,
              disambiguation: 'US singer',
              'sort-name': 'Madonna',
            },
          ],
        };
      }
    );
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'Mad', type: 'artist' });
    assert.equal(res.status, 200);
    assert.equal(res.body.results[0].id, artistId);
    assert.equal(res.body.results[0].name, 'Madonna');
    assert.equal(albums.mock.callCount(), 0);
  });

  it('rejects book formats on non-book searches', async () => {
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'microsoft',
      type: 'music',
      format: 'ebook',
    });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /only be used with book searches/);
  });

  it('escapes MusicBrainz query operators in album and artist searches', async () => {
    let albumQuery: string | undefined;
    let artistQuery: string | undefined;
    mock.method(
      MusicBrainz.prototype,
      'searchAlbumWithTotal',
      async ({ query }: { query: string }) => {
        albumQuery = query;
        return { results: [], totalResults: 0 };
      }
    );
    mock.method(
      MusicBrainz.prototype,
      'searchArtistWithTotal',
      async ({ query }: { query: string }) => {
        artistQuery = query;
        return { results: [], totalResults: 0 };
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'AC/DC (Live) + 1992',
      type: 'album',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(albumQuery, 'AC\\/DC \\(Live\\) \\+ 1992');
    assert.strictEqual(artistQuery, 'AC\\/DC \\(Live\\) \\+ 1992');
  });

  it('rejects blank keyword searches', async () => {
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search/keyword').query({ query: '   ' });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Query is required/);
  });

  it('returns global video, music, and book results together', async () => {
    getSettings().lidarr = [
      {
        id: 0,
        name: 'Lidarr MP3',
        activeProfileName: 'MP3',
      } as LidarrSettings,
      {
        id: 2,
        name: 'Lidarr FLAC',
        activeProfileName: 'FLAC',
      } as LidarrSettings,
    ];
    mock.method(MusicBrainz.prototype, 'searchAlbumWithTotal', async () => ({
      results: [
        {
          id: 'a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6',
          media_type: 'album',
          title: 'Global Album',
          score: 95,
          'primary-type': 'Album',
          'first-release-date': '2026-02-01',
          'artist-credit': [
            {
              name: 'Global Artist',
              artist: {
                id: 'artist-1',
                name: 'Global Artist',
                'sort-name': 'Artist, Global',
              },
            },
          ],
          posterPath: undefined,
        },
        {
          id: 'A1A2A3A4-B1B2-C1C2-D1D2-E1E2E3E4E5E6',
          media_type: 'album',
          title: 'Global Album',
          score: 94,
          'primary-type': 'Album',
          'first-release-date': '2026-02-01',
          'artist-credit': [
            {
              name: 'Global Artist',
              artist: {
                id: 'artist-1',
                name: 'Global Artist',
                'sort-name': 'Artist, Global',
              },
            },
          ],
          posterPath: undefined,
        },
      ],
      totalResults: 2,
    }));
    mock.method(MusicBrainz.prototype, 'searchArtistWithTotal', async () => ({
      results: [
        {
          id: 'artist-1',
          media_type: 'artist',
          name: 'Global Artist',
          type: 'Group',
          'sort-name': 'Artist, Global',
          score: 90,
        },
      ],
      totalResults: 1,
    }));
    mockPrivate(ExternalAPI.prototype, 'get', async (endpoint) => {
      const endpointString = endpoint as string;
      if (endpointString === '/search/multi') {
        return {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 100,
              media_type: 'movie',
              adult: false,
              backdrop_path: '/movie-backdrop.jpg',
              genre_ids: [18],
              original_language: 'en',
              original_title: 'Global Movie',
              overview: 'Movie result',
              popularity: 50,
              poster_path: '/movie-poster.jpg',
              release_date: '2026-01-01',
              title: 'Global Movie',
              video: false,
              vote_average: 7,
              vote_count: 10,
            },
          ],
        };
      }

      if (endpointString === '/search.json') {
        return {
          numFound: 1,
          start: 0,
          docs: [
            {
              key: '/works/OL123W',
              title: 'Global Book',
              author_name: ['Book Author'],
              first_publish_year: 2026,
              cover_i: 123,
              isbn: ['9780000000002'],
              edition_key: ['OL123M'],
            },
            {
              key: '/works/OL124W',
              title: 'Global Book',
              author_name: ['Book Author'],
              first_publish_year: 2026,
              cover_i: 124,
              isbn: ['9780000000004'],
              edition_key: ['OL124M'],
            },
          ],
        };
      }

      throw new Error(`Unexpected endpoint: ${endpointString}`);
    });
    mock.method(
      TmdbPersonMapper.prototype,
      'batchGetMappings',
      async () => ({})
    );
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    await getRepository(MetadataAlbum).save(
      new MetadataAlbum({
        mbAlbumId: 'a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6',
        caaUrl: 'https://covers.example/album.jpg',
      })
    );
    const musicMedia = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6',
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        availableMusicServiceIds: [0, 2],
      })
    );
    const bookMedia = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media: bookMedia,
        provider: MediaIdentifierProvider.ISBN,
        value: '9780000000002',
        canonical: true,
      })
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({ query: 'global' });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { mediaType: string }) => result.mediaType),
      ['movie', 'album', 'artist', 'book']
    );
    // MusicBrainz's own match count (3: 2 albums + 1 artist) is used for
    // pagination even though this page's app-level de-dup collapses the two
    // duplicate-ID albums down to one displayed result.
    assert.equal(res.body.totalResults, 5);

    const album = res.body.results.find(
      (result: { mediaType: string }) => result.mediaType === 'album'
    );
    assert.equal(album.posterPath, 'https://covers.example/album.jpg');
    assert.equal(album.mediaInfo.id, musicMedia.id);
    assert.deepStrictEqual(album.availableQualities, ['MP3', 'FLAC']);

    const book = res.body.results.find(
      (result: { mediaType: string }) => result.mediaType === 'book'
    );
    assert.equal(book.id, 'OL123W');
    assert.equal(book.isbn13, '9780000000002');
    assert.equal(book.mediaInfo.id, bookMedia.id);
    assert.equal(book.mediaInfo.status, MediaStatus.AVAILABLE);

    const musicOnly = await agent
      .get('/search')
      .query({ query: 'global', type: 'music' });

    assert.strictEqual(musicOnly.status, 200);
    assert.deepStrictEqual(
      musicOnly.body.results.map(
        (result: { mediaType: string }) => result.mediaType
      ),
      ['album', 'artist']
    );
  });

  it('returns completed provider results when another provider exceeds the deadline', async () => {
    let delayedSearchTimer: ReturnType<typeof setTimeout> | undefined;
    const delayedAlbumSearch = new Promise<never[]>((resolve) => {
      delayedSearchTimer = setTimeout(
        () => resolve([]),
        SEARCH_PROVIDER_TIMEOUT_MS + 3_000
      );
    });

    mock.method(MusicBrainz.prototype, 'searchAlbumWithTotal', async () => ({
      results: await delayedAlbumSearch,
      totalResults: 0,
    }));
    mock.method(MusicBrainz.prototype, 'searchArtistWithTotal', async () => ({
      results: [
        {
          id: 'resident-alien-artist',
          media_type: 'artist',
          name: 'Resident Alien Artist',
          type: 'Group',
          'sort-name': 'Artist, Resident Alien',
          score: 90,
        },
      ],
      totalResults: 1,
    }));
    mockPrivate(ExternalAPI.prototype, 'get', async (endpoint) => {
      const endpointString = endpoint as string;
      if (endpointString === '/search/multi') {
        return { page: 1, total_pages: 1, total_results: 0, results: [] };
      }
      if (endpointString === '/search.json') {
        return { numFound: 0, start: 0, docs: [] };
      }
      throw new Error(`Unexpected endpoint: ${endpointString}`);
    });
    mock.method(
      TmdbPersonMapper.prototype,
      'batchGetMappings',
      async () => ({})
    );
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    try {
      const startedAt = Date.now();
      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const res = await agent.get('/search').query({ query: 'resident alien' });
      const elapsedMs = Date.now() - startedAt;

      assert.strictEqual(res.status, 200);
      assert.equal(res.body.results[0].name, 'Resident Alien Artist');
      assert.ok(
        elapsedMs < SEARCH_PROVIDER_TIMEOUT_MS + 1_000,
        `search took ${elapsedMs}ms despite the provider deadline`
      );
    } finally {
      if (delayedSearchTimer) {
        clearTimeout(delayedSearchTimer);
      }
    }
  });

  it('keeps global book and music search active after the first page', async () => {
    let albumSearchOffset: number | undefined;
    let artistSearchOffset: number | undefined;
    let bookSearchPage: number | undefined;

    mock.method(
      MusicBrainz.prototype,
      'searchAlbumWithTotal',
      async (options: unknown) => {
        const { offset } = options as { offset?: number };
        albumSearchOffset = offset;

        return {
          results: [
            {
              id: 'album-page-2',
              media_type: 'album',
              title: 'Paged Album',
              score: 95,
              'primary-type': 'Album',
              'first-release-date': '2026-02-01',
              'artist-credit': [
                {
                  name: 'Paged Artist',
                  artist: {
                    id: 'artist-page-2',
                    name: 'Paged Artist',
                    'sort-name': 'Artist, Paged',
                  },
                },
              ],
              posterPath: undefined,
            },
          ],
          totalResults: 1,
        };
      }
    );
    mock.method(
      MusicBrainz.prototype,
      'searchArtistWithTotal',
      async (options: unknown) => {
        const { offset } = options as { offset?: number };
        artistSearchOffset = offset;

        return {
          results: [
            {
              id: 'artist-page-2',
              media_type: 'artist',
              name: 'Paged Artist',
              type: 'Group',
              'sort-name': 'Artist, Paged',
              score: 90,
            },
          ],
          totalResults: 1,
        };
      }
    );
    mockPrivate(ExternalAPI.prototype, 'get', async (endpoint, options) => {
      const endpointString = endpoint as string;
      if (endpointString === '/search/multi') {
        return {
          page: 2,
          total_pages: 2,
          total_results: 20,
          results: [],
        };
      }

      if (endpointString === '/search.json') {
        bookSearchPage = Number(
          (options as { params?: { page?: string } })?.params?.page
        );

        return {
          numFound: 30,
          start: 20,
          docs: [
            {
              key: '/works/OLPAGE2W',
              title: 'Paged Book',
              author_name: ['Paged Author'],
              first_publish_year: 2026,
              cover_i: 456,
              isbn: ['9780000000003'],
              edition_key: ['OLPAGE2M'],
            },
          ],
        };
      }

      throw new Error(`Unexpected endpoint: ${endpointString}`);
    });
    mock.method(
      TmdbPersonMapper.prototype,
      'batchGetMappings',
      async () => ({})
    );
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({ query: 'paged', page: 2 });

    assert.strictEqual(res.status, 200);
    assert.equal(albumSearchOffset, 20);
    assert.equal(artistSearchOffset, 20);
    assert.equal(bookSearchPage, 2);
    assert.deepStrictEqual(
      res.body.results.map((result: { mediaType: string }) => result.mediaType),
      ['album', 'artist', 'book']
    );
  });

  it('reports enough total pages to page past a capped music/book result page', async () => {
    mock.method(MusicBrainz.prototype, 'searchAlbumWithTotal', async () => ({
      results: [],
      totalResults: 150,
    }));
    mock.method(MusicBrainz.prototype, 'searchArtistWithTotal', async () => ({
      results: [],
      totalResults: 0,
    }));
    mockPrivate(ExternalAPI.prototype, 'get', async (endpoint) => {
      const endpointString = endpoint as string;
      if (endpointString === '/search/multi') {
        return { page: 1, total_pages: 1, total_results: 0, results: [] };
      }
      if (endpointString === '/search.json') {
        return { numFound: 80, start: 0, docs: [] };
      }
      throw new Error(`Unexpected endpoint: ${endpointString}`);
    });
    mock.method(
      TmdbPersonMapper.prototype,
      'batchGetMappings',
      async () => ({})
    );
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({ query: 'popular' });

    assert.strictEqual(res.status, 200);
    // Neither provider returned any items on this page (both were mocked
    // empty), but their true upstream match counts (150 albums, 80 books)
    // must still drive pagination so later pages remain reachable.
    assert.equal(res.body.totalResults, 230);
    assert.ok(
      res.body.totalPages > 1,
      `expected multiple pages, got ${res.body.totalPages}`
    );
  });

  it('returns an Open Library work directly by provider ID', async () => {
    mock.method(OpenLibraryAPI.prototype, 'getWork', async () => ({
      key: '/works/OL45804W',
      title: 'The Left Hand of Darkness',
      description: 'A classic science fiction novel.',
      covers: [1234],
      authors: [{ author: { key: '/authors/OL1A' } }],
      first_publish_date: '1969',
    }));
    mock.method(OpenLibraryAPI.prototype, 'getWorkEditions', async () => ({
      size: 1,
      entries: [
        {
          key: '/books/OL1M',
          title: 'The Left Hand of Darkness',
          isbn_13: ['9780441478125'],
        },
      ],
    }));

    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.BOOK,
        tmdbId: 0,
        status: MediaStatus.PENDING,
      })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.OPENLIBRARY,
        value: 'OL45804W',
        canonical: true,
      })
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'openlibrary:OL45804W' });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.totalResults, 1);
    assert.equal(res.body.results[0].mediaType, 'book');
    assert.equal(res.body.results[0].id, 'OL45804W');
    assert.equal(res.body.results[0].isbn13, '9780441478125');
    assert.equal(res.body.results[0].mediaInfo.status, MediaStatus.PENDING);
  });

  it('returns book results directly by ISBN', async () => {
    mock.method(
      OpenLibraryAPI.prototype,
      'searchBooks',
      async (options: unknown) => {
        assert.deepStrictEqual(options, {
          query: 'isbn:9780441478125',
          page: 1,
          limit: 20,
        });

        return {
          numFound: 1,
          start: 0,
          docs: [
            {
              key: '/works/OL45804W',
              title: 'The Left Hand of Darkness',
              author_name: ['Ursula K. Le Guin'],
              first_publish_year: 1969,
              isbn: ['9780441478125'],
              edition_key: ['OL1M'],
            },
          ],
        };
      }
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'isbn:9780441478125' });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.totalResults, 1);
    assert.equal(res.body.results[0].mediaType, 'book');
    assert.equal(res.body.results[0].id, 'OL45804W');
    assert.equal(res.body.results[0].isbn13, '9780441478125');
  });

  it('returns a MusicBrainz release group directly by provider ID', async () => {
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => ({
      id: '11111111-1111-1111-1111-111111111111',
      media_type: 'album',
      title: 'Direct Album',
      score: 100,
      'primary-type': 'Album',
      'primary-type-id': 'f529b476-6e62-324f-b0aa-1f3e33d313fc',
      'type-id': 'f529b476-6e62-324f-b0aa-1f3e33d313fc',
      'first-release-date': '2026-05-01',
      releasedate: '2026-05-01',
      count: 1,
      'artist-credit': [
        {
          name: 'Direct Artist',
          artist: {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Direct Artist',
            'sort-name': 'Artist, Direct',
          },
        },
      ],
      releases: [],
      posterPath: undefined,
    }));

    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: '11111111-1111-1111-1111-111111111111',
        status: MediaStatus.PENDING,
      })
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({
      query: 'musicbrainz:11111111-1111-1111-1111-111111111111',
    });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.totalResults, 1);
    assert.equal(res.body.results[0].mediaType, 'album');
    assert.equal(res.body.results[0].id, media.mbId);
    assert.equal(res.body.results[0].title, 'Direct Album');
    assert.equal(res.body.results[0].mediaInfo.status, MediaStatus.PENDING);
  });

  it('resolves a MusicBrainz release ID to its release group in search', async () => {
    mock.method(
      MusicBrainz.prototype,
      'getReleaseGroupDetails',
      async (options: unknown) => {
        const { releaseGroupId } = options as { releaseGroupId: string };

        if (releaseGroupId === '33333333-3333-3333-3333-333333333333') {
          throw new Error('not a release group');
        }

        assert.equal(releaseGroupId, '44444444-4444-4444-4444-444444444444');

        return {
          id: releaseGroupId,
          media_type: 'album',
          title: 'Resolved Album',
          score: 100,
          'primary-type': 'Album',
          'primary-type-id': 'f529b476-6e62-324f-b0aa-1f3e33d313fc',
          'type-id': 'f529b476-6e62-324f-b0aa-1f3e33d313fc',
          'first-release-date': '2026-05-02',
          releasedate: '2026-05-02',
          count: 1,
          'artist-credit': [
            {
              name: 'Resolved Artist',
              artist: {
                id: '55555555-5555-5555-5555-555555555555',
                name: 'Resolved Artist',
                'sort-name': 'Artist, Resolved',
              },
            },
          ],
          releases: [],
          posterPath: undefined,
        };
      }
    );
    mock.method(MusicBrainz.prototype, 'getReleaseGroup', async () => {
      return '44444444-4444-4444-4444-444444444444';
    });

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent
      .get('/search')
      .query({ query: 'mbid:33333333-3333-3333-3333-333333333333' });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.totalResults, 1);
    assert.equal(res.body.results[0].mediaType, 'album');
    assert.equal(
      res.body.results[0].id,
      '44444444-4444-4444-4444-444444444444'
    );
    assert.equal(res.body.results[0].title, 'Resolved Album');
  });

  it('keeps unmapped artists visible and suppresses TMDB-mapped duplicates', async () => {
    mockPrivate(ExternalAPI.prototype, 'get', async (endpoint) => {
      const endpointString = endpoint as string;
      if (endpointString === '/search/multi') {
        return {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 500,
              media_type: 'person',
              adult: false,
              known_for: [],
              known_for_department: 'Sound',
              name: 'Mapped Singer',
              popularity: 20,
              profile_path: '/mapped.jpg',
            },
          ],
        };
      }

      if (endpointString === '/search.json') {
        return {
          numFound: 0,
          start: 0,
          docs: [],
        };
      }

      throw new Error(`Unexpected endpoint: ${endpointString}`);
    });
    mock.method(MusicBrainz.prototype, 'searchAlbumWithTotal', async () => ({
      results: [],
      totalResults: 0,
    }));
    mock.method(MusicBrainz.prototype, 'searchArtistWithTotal', async () => ({
      results: [
        {
          id: 'mapped-artist',
          media_type: 'artist',
          name: 'Mapped Singer',
          type: 'Person',
          'sort-name': 'Singer, Mapped',
          score: 99,
        },
        {
          id: 'unmapped-artist',
          media_type: 'artist',
          name: 'Unmapped Singer',
          type: 'Person',
          'sort-name': 'Singer, Unmapped',
          score: 98,
        },
      ],
      totalResults: 2,
    }));
    mock.method(TmdbPersonMapper.prototype, 'batchGetMappings', async () => ({
      'mapped-artist': {
        personId: 500,
        profilePath: 'https://image.tmdb.org/t/p/w500/mapped.jpg',
      },
      'unmapped-artist': {
        personId: null,
        profilePath: null,
      },
    }));
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    await getRepository(MetadataArtist).save(
      new MetadataArtist({
        mbArtistId: 'mapped-artist',
        tmdbPersonId: '500',
      })
    );

    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get('/search').query({ query: 'singer' });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { mediaType: string; name: string }) => ({
        mediaType: result.mediaType,
        name: result.name,
      })),
      [
        { mediaType: 'person', name: 'Mapped Singer' },
        { mediaType: 'artist', name: 'Unmapped Singer' },
      ]
    );
  });
});

describe('search filters behind the OpenAPI validator', () => {
  function createValidatedApp(): Express {
    const validatedApp = express();
    validatedApp.use(express.json());
    validatedApp.use((req, _res, next) => {
      req.user = { id: 1 } as Express.Request['user'];
      next();
    });
    validatedApp.use(
      OpenApiValidator.middleware({
        apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
        validateRequests: true,
        validateSecurity: false,
      })
    );
    validatedApp.use('/api/v1/search', searchRoutes);
    validatedApp.use(
      (
        err: { status?: number; message?: string; errors?: unknown[] },
        _req: express.Request,
        res: express.Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: express.NextFunction
      ) => {
        res.status(err.status ?? 500).json({
          status: err.status ?? 500,
          message: err.message,
          errors: err.errors,
        });
      }
    );
    return validatedApp;
  }

  it('admits the music refinement and both book formats', async () => {
    const validatedApp = createValidatedApp();
    getSettings().lidarr = [];
    getSettings().readarr = [{ serviceType: 'ebook' } as ReadarrSettings];

    const music = await request(validatedApp).get('/api/v1/search').query({
      query: 'madonna',
      type: 'music',
      resultFilter: 'prayer',
      artist: 'Madonna',
      artistId: '79239441-bfd5-4981-a70c-55c3f15c1287',
      primaryReleaseDateGte: '1998-01-01',
      primaryReleaseDateLte: '1998-12-31',
      genre: 'pop',
      releaseType: 'Album',
    });
    const audiobook = await request(validatedApp)
      .get('/api/v1/search')
      .query({ query: 'microsoft', type: 'book', format: 'audiobook' });
    getSettings().readarr = [];
    const authors = await request(validatedApp)
      .get('/api/v1/search')
      .query({ query: 'rowling', type: 'author' });

    getSettings().readarr = [{ serviceType: 'audiobook' } as ReadarrSettings];
    const ebook = await request(validatedApp)
      .get('/api/v1/search')
      .query({ query: 'microsoft', type: 'book', format: 'ebook' });
    const comic = await request(validatedApp)
      .get('/api/v1/search')
      .query({ query: 'saga', type: 'comic' });

    assert.strictEqual(music.status, 200);
    assert.strictEqual(audiobook.status, 200);
    assert.strictEqual(authors.status, 200, JSON.stringify(authors.body));
    assert.strictEqual(ebook.status, 200);
    assert.strictEqual(comic.status, 200, JSON.stringify(comic.body));
    assert.deepStrictEqual(music.body.results, []);
    assert.deepStrictEqual(audiobook.body.results, []);
    assert.deepStrictEqual(authors.body.results, []);
    assert.deepStrictEqual(ebook.body.results, []);
    assert.deepStrictEqual(comic.body.results, []);
  });
});
