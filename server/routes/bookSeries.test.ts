import OpenLibraryAPI from '@server/api/openlibrary';
import ReadarrAPI from '@server/api/servarr/readarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import BookSeries from '@server/entity/BookSeries';
import BookSeriesWatchRequest from '@server/entity/BookSeriesWatchRequest';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { backendScope } from '@server/lib/bookSeries';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import bookRoutes from '@server/routes/book';
import bookSeriesRoutes from '@server/routes/bookSeries';
import requestRoutes from '@server/routes/request';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import type { OpenAPIV3 } from 'express-openapi-validator/dist/framework/types';
import session from 'express-session';
import * as yaml from 'js-yaml';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';

const isbn = '9780140328721';
const secondIsbn = '9780261103573';
const app = express();
app.use(express.json());
app.use(
  // Supertest creates this session only for synthetic test users; its secret is
  // random per process and never backs a deployed server.
  // codeql[js/clear-text-cookie]
  session({
    secret: randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
  })
);
// The production checkUser middleware applies authenticatedRouteRateLimit.
// codeql[js/missing-rate-limiting]
app.use(checkUser);
app.use('/auth', authRoutes);
app.use(
  OpenApiValidator.middleware({
    apiSpec: {
      ...(yaml.load(
        readFileSync('seerr-api.yml', 'utf8')
      ) as OpenAPIV3.DocumentV3),
      servers: [{ url: '/' }],
    },
    validateSecurity: false,
    validateResponses: true,
  })
);
// Validate the JSON representation sent over the wire, including Date values.
app.use((_req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body: unknown) => sendJson(JSON.parse(JSON.stringify(body)));
  next();
});
// checkUser above rate-limits all requests; bookRoutes also applies its own
// per-user limiter in production.
// codeql[js/missing-rate-limiting]
app.use('/book', isAuthenticated(), bookRoutes);
app.use('/book-series', isAuthenticated(), bookSeriesRoutes);
// checkUser above rate-limits all requests in production; this Supertest app
// only isolates the request route behavior.
// codeql[js/missing-rate-limiting]
app.use('/request', isAuthenticated(), requestRoutes);
app.use(
  (
    err: { status?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    res.status(err.status ?? 500).json({ message: err.message });
  }
);
setupTestDb();
const server = (id = 1, serviceType: 'ebook' | 'audiobook' = 'ebook') => ({
  id,
  name: `Server ${id}`,
  hostname: 'localhost',
  port: 8787,
  apiKey: 'secret',
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'Default',
  activeDirectory: '/books',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
  serviceType,
});
beforeEach(() => {
  getSettings().main.localLogin = true;
  getSettings().readarr = [server()];
});
afterEach(() => {
  mock.restoreAll();
  getSettings().readarr = [];
});
const login = async (email = 'admin@seerr.dev') => {
  const agent = request.agent(app);
  assert.equal(
    (await agent.post('/auth/local').send({ email, password: 'test1234' }))
      .status,
    200
  );
  return agent;
};
const bind = async (bookId = 1, workId = 'OL1W', serviceId = 1) => {
  const media = await getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: MediaStatus.AVAILABLE,
      externalServiceId: bookId,
      serviceId,
    })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.OPENLIBRARY,
      value: workId,
      canonical: true,
    })
  );
  return media;
};
const native = (ids = [1, 2, 3]) => {
  mock.method(
    ReadarrAPI.prototype,
    'getNativeSeriesBook',
    async (id: number) => ({
      id,
      title: `Book ${id}`,
      authorId: 20,
      editions: [
        { isbn13: id === 1 ? isbn : id === 2 ? secondIsbn : undefined },
      ],
    })
  );
  return mock.method(ReadarrAPI.prototype, 'getSeriesByAuthor', async () => [
    {
      id: 10,
      title: 'Series',
      links: ids.map((bookId, index) => ({
        bookId,
        position: String(index + 1),
      })),
    },
  ]);
};
const discover = async (agent: Awaited<ReturnType<typeof login>>) => {
  const response = await agent.get('/book/OL1W/series');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, 'matched');
  return response.body.series[0].id as number;
};

describe('backend book series routes', () => {
  it('requires authentication and validates IDs', async () => {
    const unauthenticated = await request(app).get('/book-series/1');
    assert.equal(
      unauthenticated.status,
      403,
      JSON.stringify(unauthenticated.body)
    );
    const agent = await login();
    assert.equal((await agent.get('/book-series/0')).status, 400);
    assert.equal((await agent.get('/book/invalid/series')).status, 400);
    assert.equal((await agent.get('/book-series/999')).status, 404);
  });
  it('does no metadata work without a configured server or local book binding', async () => {
    const lookup = native();
    const agent = await login();
    assert.deepEqual((await agent.get('/book/OL1W/series')).body, {
      status: 'not-in-library',
      series: [],
    });
    getSettings().readarr = [];
    assert.deepEqual((await agent.get('/book/OL1W/series')).body, {
      status: 'disabled',
      series: [],
    });
    assert.equal(lookup.mock.callCount(), 0);
  });
  it('uses native membership without a Hardcover credential and persists one series across authors', async () => {
    await bind();
    await bind(2, 'OL2W');
    native();
    mock.method(
      ReadarrAPI.prototype,
      'getNativeSeriesBook',
      async (id: number) => ({ id, title: 'Book', authorId: id + 20 })
    );
    const agent = await login();
    const first = await discover(agent);
    const second = await agent.get('/book/OL2W/series');
    assert.equal(second.body.series[0].id, first);
    assert.equal(await getRepository(BookSeries).count(), 1);
    assert.equal(JSON.stringify(second.body).includes('secret'), false);
  });
  it('ignores same-author series that do not contain the book', async () => {
    await bind();
    native([2, 3]);
    assert.deepEqual((await (await login()).get('/book/OL1W/series')).body, {
      status: 'matched',
      series: [],
    });
  });
  it('preserves a healthy format when another server fails', async () => {
    const media = await bind();
    await getRepository(Media).update(media.id, {
      audiobookServiceId: 2,
      audiobookExternalServiceId: 99,
    });
    getSettings().readarr.push(server(2, 'audiobook'));
    native();
    mock.method(
      ReadarrAPI.prototype,
      'getNativeSeriesBook',
      async (id: number) => {
        if (id === 99) throw new Error('secret');
        return { id, title: 'Book', authorId: 20 };
      }
    );
    const response = await (await login()).get('/book/OL1W/series');
    assert.equal(response.body.status, 'partial');
    assert.equal(response.body.series.length, 1);
    assert.equal(response.body.series[0].format, 'ebook');
  });
  it('keeps identical native IDs separate across configured formats and servers', async () => {
    const media = await bind();
    await getRepository(Media).update(media.id, {
      audiobookServiceId: 2,
      audiobookExternalServiceId: 1,
    });
    getSettings().readarr.push(server(2, 'audiobook'));
    native([1]);
    const response = await (await login()).get('/book/OL1W/series');
    assert.equal(response.body.status, 'matched');
    assert.deepEqual(
      response.body.series.map((entry: { format: string }) => entry.format),
      ['ebook', 'audiobook']
    );
    assert.notEqual(response.body.series[0].id, response.body.series[1].id);
    assert.equal(await getRepository(BookSeries).count(), 2);
  });
  it('distinguishes unsupported series from temporary failure', async () => {
    await bind();
    native();
    const agent = await login();
    mock.method(
      ReadarrAPI.prototype,
      'getSeriesByAuthor',
      async () => undefined
    );
    assert.equal(
      (await agent.get('/book/OL1W/series')).body.status,
      'unsupported'
    );
    mock.method(ReadarrAPI.prototype, 'getSeriesByAuthor', async () => {
      throw new Error('secret');
    });
    const response = await agent.get('/book/OL1W/series');
    assert.deepEqual(response.body, { status: 'unavailable', series: [] });
  });
  it('does not reroute saved pages when a server ID is reused for another endpoint or format', async () => {
    await bind();
    native();
    const agent = await login();
    const id = await discover(agent);
    getSettings().readarr[0].hostname = 'replacement';
    assert.equal((await agent.get(`/book-series/${id}`)).status, 404);
    getSettings().readarr[0].hostname = 'localhost';
    getSettings().readarr[0].serviceType = 'audiobook';
    assert.equal((await agent.get(`/book-series/${id}`)).status, 404);
  });
  it('retains canonical library identity without ISBNs and blocks ambiguous or unmatched candidates', async () => {
    await bind();
    native();
    mock.method(
      ReadarrAPI.prototype,
      'getNativeSeriesBook',
      async (id: number) => ({
        id,
        title: `Book ${id}`,
        authorId: 20,
        editions: id === 2 ? [{ isbn13: secondIsbn }] : [],
      })
    );
    mock.method(OpenLibraryAPI.prototype, 'findWorksByIsbns', async () => [
      { key: '/works/OL2W', title: 'Ambiguous', isbn: [secondIsbn] },
      { key: '/works/OL3W', title: 'Ambiguous', isbn: [secondIsbn] },
    ]);
    const agent = await login();
    const response = await agent.get(`/book-series/${await discover(agent)}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.scope, 'backend-library');
    assert.deepEqual(
      response.body.entries.map((e: { matchStatus: string }) => e.matchStatus),
      ['matched', 'ambiguous', 'unmatched']
    );
    assert.equal(response.body.entries[0].book.id, 'OL1W');
    assert.equal(
      response.body.entries[0].book.mediaInfo.status,
      MediaStatus.AVAILABLE
    );
    assert.equal(response.body.entries[1].book, undefined);
    assert.equal(response.body.entries[2].primary, undefined);
  });
  it('rejects two backend books competing for the same Open Library work', async () => {
    await bind();
    native([1, 2]);
    mock.method(
      ReadarrAPI.prototype,
      'getNativeSeriesBook',
      async (id: number) => ({
        id,
        title: 'Collision',
        authorId: 20,
        editions: [{ isbn13: isbn }],
      })
    );
    mock.method(OpenLibraryAPI.prototype, 'findWorksByIsbns', async () => [
      { key: '/works/OL1W', title: 'Collision', isbn: [isbn] },
    ]);
    const agent = await login();
    const response = await agent.get(`/book-series/${await discover(agent)}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(
      response.body.entries.map((e: { matchStatus: string }) => e.matchStatus),
      ['ambiguous', 'ambiguous']
    );
  });
  it('offers only authorized, supported management links and preserves URL bases', async () => {
    await bind();
    native([1]);
    mock.method(OpenLibraryAPI.prototype, 'findWorksByIsbns', async () => []);
    mock.method(
      ReadarrAPI.prototype,
      'getSeriesManagementPath',
      () => '/series/10'
    );
    getSettings().readarr[0].externalUrl =
      'https://books.example.test/chaptarr/';
    const agent = await login();
    const id = await discover(agent);
    assert.equal(
      (await agent.get(`/book-series/${id}`)).body.managementUrl,
      'https://books.example.test/chaptarr/series/10'
    );
    assert.equal(
      (await (await login('friend@seerr.dev')).get(`/book-series/${id}`)).body
        .managementUrl,
      undefined
    );
    getSettings().readarr[0].externalUrl = 'javascript:alert(1)';
    assert.equal(
      (await agent.get(`/book-series/${id}`)).body.managementUrl,
      undefined
    );
  });
  it('does not expose incomplete evidence or upstream secrets', async () => {
    await bind();
    native();
    mock.method(OpenLibraryAPI.prototype, 'findWorksByIsbns', async () => {
      throw new Error('secret provider details');
    });
    const agent = await login();
    const response = await agent.get(`/book-series/${await discover(agent)}`);
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(response.body).includes('secret'), false);
  });
});

describe('direct book series search', () => {
  const library = () =>
    mock.method(ReadarrAPI.prototype, 'getNativeSeriesLibrary', async () => ({
      supported: true,
      partial: false,
      truncated: false,
      entries: [
        {
          authorId: 20,
          series: {
            id: 10,
            title: 'The Expanse',
            links: [{ bookId: 1, position: '1' }],
          },
        },
      ],
    }));
  const catalog = () =>
    mock.method(ReadarrAPI.prototype, 'searchSeriesCatalog', async () => [
      { providerId: 'hc:123', title: 'A Catalog Series', bookCount: 4 },
    ]);

  it('requires authentication, validates query and format, and does not call providers for invalid searches', async () => {
    const native = library();
    catalog();
    const unauthenticated = await request(app).get(
      '/book-series/search?query=Expanse'
    );
    assert.equal(
      unauthenticated.status,
      403,
      JSON.stringify(unauthenticated.body)
    );
    const agent = await login();
    for (const query of [
      '',
      '?query=a',
      '?query=%20%20',
      '?query=ab&format=both',
      '?query=ab&query=cd',
    ]) {
      assert.equal(
        (await agent.get('/book-series/search' + query)).status,
        400
      );
    }
    assert.equal(native.mock.callCount(), 0);
  });

  it('finds library series without a SeerrNG book binding and opens the existing detail identity', async () => {
    library();
    catalog();
    native([1]);
    mock.method(OpenLibraryAPI.prototype, 'findWorksByIsbns', async () => []);
    const agent = await login();
    const response = await agent.get('/book-series/search?query=expanse');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.status, 'ok');
    assert.equal(response.body.results.length, 2);
    const local = response.body.results.find(
      (r: { source: string }) => r.source === 'library'
    );
    assert.match(local.href, /^\/book-series\/\d+$/);
    assert.equal((await agent.get(local.href)).status, 200);
    assert.equal(
      await getRepository(Media).count(),
      0,
      'search must not add books'
    );
    const again = await agent.get('/book-series/search?query=Expanse');
    assert.equal(again.body.results[0].source, 'catalog');
    assert.equal(
      again.body.results.find((r: { source: string }) => r.source === 'library')
        .href,
      local.href
    );
  });

  it('groups catalog formats while preserving native routes and filtering servers before lookup', async () => {
    getSettings().readarr = [server(1, 'ebook'), server(2, 'audiobook')];
    const inventory = library();
    catalog();
    const agent = await login();
    const response = await agent.get(
      '/book-series/search?query=expanse&format=audiobook'
    );
    assert.equal(response.status, 200);
    assert(
      response.body.results.every(
        (r: { format: string }) => r.format === 'audiobook'
      )
    );
    assert.equal(inventory.mock.callCount(), 1);
    const all = await agent.get('/book-series/search?query=expanse');
    assert.equal(
      new Set(all.body.results.map((r: { key: string }) => r.key)).size,
      3
    );
    const grouped = all.body.results.find(
      (r: { source: string }) => r.source === 'catalog'
    );
    assert.equal(grouped.variants.length, 2);
    assert.deepEqual(
      grouped.variants.map((r: { format: string }) => r.format).sort(),
      ['audiobook', 'ebook']
    );
  });

  it('preserves library results when catalog search fails and reports incomplete results', async () => {
    library();
    mock.method(ReadarrAPI.prototype, 'searchSeriesCatalog', async () => {
      throw new Error('private backend error');
    });
    const response = await (
      await login()
    ).get('/book-series/search?query=expanse');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'partial');
    assert.equal(response.body.results.length, 1);
    assert(!JSON.stringify(response.body).includes('private'));
  });

  it('reports disabled, unsupported, unavailable, and truncation instead of empty-success', async () => {
    getSettings().readarr = [];
    const agent = await login();
    assert.equal(
      (await agent.get('/book-series/search?query=expanse')).body.status,
      'disabled'
    );
    getSettings().readarr = [server()];
    const inv = mock.method(
      ReadarrAPI.prototype,
      'getNativeSeriesLibrary',
      async () => ({
        entries: [],
        supported: false,
        partial: false,
        truncated: false,
      })
    );
    mock.method(
      ReadarrAPI.prototype,
      'searchSeriesCatalog',
      async () => undefined
    );
    assert.equal(
      (await agent.get('/book-series/search?query=expanse')).body.status,
      'unsupported'
    );
    inv.mock.mockImplementation(async () => {
      throw new Error('unavailable');
    });
    assert.equal(
      (await agent.get('/book-series/search?query=expanse')).body.status,
      'unavailable'
    );
    inv.mock.mockImplementation(async () => ({
      entries: [],
      supported: true,
      partial: false,
      truncated: true,
    }));
    assert.equal(
      (await agent.get('/book-series/search?query=expanse')).body.truncated,
      true
    );
  });

  it('bounds previews to the original server scope and never turns provider IDs into book requests', async () => {
    mock.method(
      ReadarrAPI.prototype,
      'getCatalogBookIdentity',
      async () => undefined
    );
    library();
    catalog();
    mock.method(ReadarrAPI.prototype, 'getSeriesCatalogPreview', async () => ({
      foreignSeriesId: 'hc:123',
      title: 'Catalog Series',
      workCount: 1,
      books: [
        { foreignBookId: 'hc:456', title: 'Catalog Book', position: '1' },
      ],
    }));
    const agent = await login();
    const search = await agent.get('/book-series/search?query=series');
    const url = search.body.results[0].href;
    const response = await agent.get(url);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.books[0].title, 'Catalog Book');
    assert.equal(response.body.books[0].foreignBookId, undefined);
    assert.match(
      response.body.managementUrl,
      /\/add\/search\?term=Catalog%20Series$/
    );
    const friend = await login('friend@seerr.dev');
    assert.equal((await friend.get(url)).body.managementUrl, undefined);
    getSettings().readarr[0].externalUrl = 'javascript:alert(1)';
    assert.equal((await agent.get(url)).body.managementUrl, undefined);
    getSettings().readarr[0].hostname = 'replacement.local';
    assert.equal((await agent.get(url)).status, 404);
    assert.equal(await getRepository(Media).count(), 0);
  });
});

it('submits a verified catalog book through normal pending approval through configured server zero', async () => {
  getSettings().readarr = [server(0, 'audiobook')];
  mock.method(ReadarrAPI.prototype, 'getNativeSeriesLibrary', async () => ({
    supported: true,
    partial: false,
    truncated: false,
    entries: [],
  }));
  mock.method(ReadarrAPI.prototype, 'searchSeriesCatalog', async () => [
    { providerId: 'hc:123', title: 'Catalog Series' },
  ]);
  mock.method(ReadarrAPI.prototype, 'getSeriesCatalogPreview', async () => ({
    foreignSeriesId: 'hc:123',
    title: 'Catalog Series',
    workCount: 2,
    books: [
      {
        foreignBookId: 'hc:456',
        title: 'Verified Book',
        isbns: [isbn],
        identifiersComplete: true,
      },
      {
        foreignBookId: 'hc:789',
        title: 'Unresolved Book',
        isbns: [],
        identifiersComplete: true,
      },
    ],
  }));
  mock.method(ReadarrAPI.prototype, 'getCatalogBookIdentity', async () => {
    throw new Error('Catalog evidence should avoid this call');
  });
  mock.method(OpenLibraryAPI.prototype, 'findWorksByIsbns', async () => [
    { key: '/works/OL1W', title: 'Verified Book', isbn: [isbn] },
  ]);
  mock.method(OpenLibraryAPI.prototype, 'getWork', async () => ({
    key: '/works/OL1W',
    title: 'Verified Book',
  }));
  mock.method(OpenLibraryAPI.prototype, 'getWorkEditions', async () => ({
    size: 1,
    entries: [{ key: '/books/OL1M', isbn_13: [isbn] }],
  }));
  const agent = await login('friend@seerr.dev');
  const search = await agent.get('/book-series/search?query=Catalog');
  const preview = await agent.get(search.body.results[0].href);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.managementUrl, undefined);
  assert.equal(preview.body.books[1].book, undefined);
  assert.equal(
    await getRepository(MediaRequest).count(),
    0,
    'reading a catalog must not request books'
  );
  const selected = preview.body.books[0].book;
  const response = await agent.post('/request/bulk').send({
    mediaType: 'book',
    format: preview.body.format,
    items: [
      {
        mediaId: selected.id,
        title: selected.title,
        isbn13: selected.isbn13,
      },
    ],
  });
  assert.equal(response.status, 207, JSON.stringify(response.body));
  assert.equal(response.body.created.length, 1);
  assert.equal(response.body.created[0].requestedBy.email, undefined);
  const requests = await getRepository(MediaRequest).find();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].status, MediaRequestStatus.PENDING);
  assert.equal(requests[0].bookFormat, 'audiobook');
});

describe('backend-owned series watches', () => {
  const target = () => ({
    serverId: 1,
    scope: backendScope(getSettings().readarr[0]),
    providerId: 'hc:988',
    includeExtras: false,
  });
  const backend = () => {
    mock.method(
      ReadarrAPI.prototype,
      'getSeriesWatchCapabilities',
      async () => ({ version: 1, providers: ['hc', 'gr'], futureBooks: true })
    );
    mock.method(ReadarrAPI.prototype, 'getSeriesCatalogPreview', async () => ({
      title: 'The Kingkiller Chronicle',
      foreignSeriesId: 'hc:988',
      workCount: 3,
      books: [],
    }));
    mock.method(ReadarrAPI.prototype, 'getSeriesWatch', async () => ({
      enabled: false,
      watchId: null,
    }));
    return mock.method(
      ReadarrAPI.prototype,
      'setSeriesWatch',
      async (_id: string, options: { enabled: boolean }) => ({
        enabled: options.enabled,
        watchId: 42,
      })
    );
  };
  it('records a pending user request without backend writes and requires a manager to approve', async () => {
    const writes = backend();
    const friend = await login('friend@seerr.dev');
    const pending = await friend.post('/book-series/watch').send(target());
    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    assert.equal(pending.body.status, 'pending');
    assert.equal(writes.mock.callCount(), 0);
    assert.equal(
      (
        await friend.post(
          `/book-series/watch/requests/${pending.body.id}/approve`
        )
      ).status,
      403
    );
    const admin = await login();
    const approved = await admin.post(
      `/book-series/watch/requests/${pending.body.id}/approve`
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, 'active');
    assert.equal(writes.mock.callCount(), 1);
    assert.equal(writes.mock.calls[0].arguments[0], 'hc:988');
    const options = writes.mock.calls[0].arguments[1] as Record<
      string,
      unknown
    >;
    assert.equal(options.rootFolder, '/books');
    assert.equal(options.enabled, true);
  });
  it('deduplicates concurrent submissions and never requests individual Open Library books', async () => {
    const writes = backend();
    const admin = await login();
    const results = await Promise.all([
      admin.post('/book-series/watch').send(target()),
      admin.post('/book-series/watch').send(target()),
    ]);
    assert.ok(
      results.every((result) => result.status === 200),
      JSON.stringify(results.map((result) => result.body))
    );
    assert.equal(results[0].body.id, results[1].body.id);
    assert.equal(writes.mock.callCount(), 1);
    assert.equal(await getRepository(BookSeriesWatchRequest).count(), 1);
    assert.equal(await getRepository(MediaRequest).count(), 0);
  });
  it('keeps a failed dispatch retryable without falsely reporting active', async () => {
    const writes = backend();
    writes.mock.mockImplementationOnce(async () => {
      throw new Error('secret backend error');
    });
    const admin = await login();
    const failed = await admin.post('/book-series/watch').send(target());
    assert.equal(failed.status, 503);
    assert.ok(!JSON.stringify(failed.body).includes('secret backend error'));
    const row = (await getRepository(BookSeriesWatchRequest).find())[0];
    assert.equal(row.status, 'failed');
    const retry = await admin.post(
      `/book-series/watch/requests/${row.id}/approve`
    );
    assert.equal(retry.body.status, 'active');
    assert.equal(await getRepository(BookSeriesWatchRequest).count(), 1);
  });
  it('rejects changed server scope and unsupported backends before writing', async () => {
    const writes = backend();
    const admin = await login();
    assert.equal(
      (
        await admin
          .post('/book-series/watch')
          .send({ ...target(), scope: 'stale' })
      ).status,
      409
    );
    mock.method(
      ReadarrAPI.prototype,
      'getSeriesWatchCapabilities',
      async () => undefined
    );
    assert.equal(
      (await admin.post('/book-series/watch').send(target())).status,
      409
    );
    assert.equal(writes.mock.callCount(), 0);
    assert.equal(await getRepository(BookSeriesWatchRequest).count(), 0);
  });
  it('does not let unprivileged users request watches or see other users requests', async () => {
    const writes = backend();
    const admin = await login();
    await admin.post('/book-series/watch').send(target());
    const user = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    user.permissions = Permission.NONE;
    await getRepository(User).save(user);
    const friend = await login('friend@seerr.dev');
    assert.equal(
      (await friend.post('/book-series/watch').send(target())).status,
      403
    );
    const list = await friend.get('/book-series/watch/requests');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, []);
    assert.equal(writes.mock.callCount(), 1);
  });
  it('requires manager approval when auto-approved book users have finite quotas', async () => {
    const writes = backend();
    const user = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    user.permissions = Permission.REQUEST_BOOK + Permission.AUTO_APPROVE_BOOK;
    user.bookQuotaLimit = 5;
    await getRepository(User).save(user);
    const friend = await login('friend@seerr.dev');
    const result = await friend.post('/book-series/watch').send(target());
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'pending');
    assert.equal(writes.mock.callCount(), 0);
  });
  it('stops a watch through the backend and preserves its request record', async () => {
    const writes = backend();
    const admin = await login();
    const added = await admin.post('/book-series/watch').send(target());
    const result = await admin.post(
      `/book-series/watch/requests/${added.body.id}/stop`
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'stopped');
    assert.equal(writes.mock.calls[1].arguments[1].enabled, false);
    assert.equal(await getRepository(BookSeriesWatchRequest).count(), 1);
  });
  it('validates identities, booleans and format policy', async () => {
    const writes = backend();
    const admin = await login();
    for (const body of [
      { ...target(), includeExtras: 'true' },
      { ...target(), providerId: 'hc:0' },
      { ...target(), serverId: -1 },
      { ...target(), providerId: 'gr:45262' },
    ]) {
      assert.equal(
        (await admin.post('/book-series/watch').send(body)).status,
        400
      );
    }
    assert.equal(writes.mock.callCount(), 0);
  });
});

describe('series card artwork', () => {
  const path = `/MediaCoverProxy/${'a'.repeat(64)}/cover.jpg`;
  it('requires authentication and rejects mixed or stale backend identities', async () => {
    const unauthenticated = await request(app).get(
      '/book-series/covers?seriesId=1'
    );
    assert.equal(
      unauthenticated.status,
      403,
      JSON.stringify(unauthenticated.body)
    );
    const agent = await login();
    assert.equal(
      (await agent.get('/book-series/covers?seriesId=1&serverId=0')).status,
      400
    );
    assert.equal(
      (
        await agent.get(
          '/book-series/covers?serverId=1&scope=old&providerId=hc%3A12'
        )
      ).status,
      404
    );
    assert.equal(
      (await agent.get('/book-series/covers/image?seriesId=1&book=20')).status,
      400
    );
  });
  it('uses lightweight catalog metadata and never exposes backend artwork paths or credentials', async () => {
    const configured = server(0, 'audiobook');
    getSettings().readarr = [configured];
    const lookup = mock.method(
      ReadarrAPI.prototype,
      'getSeriesCatalogPreview',
      async () => ({
        title: 'Series',
        workCount: 2,
        foreignSeriesId: 'hc:12',
        books: [
          {
            foreignBookId: 'hc:2',
            title: 'Second',
            position: '2',
            images: [{ url: 'https://untrusted.test/cover.jpg' }],
          },
          {
            foreignBookId: 'hc:1',
            title: 'First',
            position: '1',
            images: [{ url: path, coverType: 'cover' }],
          },
        ],
      })
    );
    const agent = await login();
    const query = new URLSearchParams({
      serverId: '0',
      scope: backendScope(configured),
      providerId: 'hc:12',
    }).toString();
    const result = await agent.get('/book-series/covers?' + query);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(
      result.body.books.map((b: { title: string }) => b.title),
      ['First', 'Second']
    );
    assert.equal(
      lookup.mock.calls[0].arguments[1],
      false,
      'no ISBN enrichment for artwork'
    );
    assert.equal(result.body.books[1].coverUrl, undefined);
    assert(!JSON.stringify(result.body).includes('MediaCoverProxy'));
    const image = mock.method(
      ReadarrAPI.prototype,
      'getSeriesCoverImage',
      async () => ({
        imageBuffer: Buffer.from('cover'),
        contentType: 'image/jpeg',
      })
    );
    const cover = await agent.get(
      result.body.books[0].coverUrl.replace('/api/v1', '')
    );
    assert.equal(cover.status, 200);
    assert.equal(cover.headers['content-type'], 'image/jpeg');
    assert.match(cover.headers['cache-control'], /^private/);
    assert.equal(image.mock.calls[0].arguments[0], path);
    assert.equal(
      (await agent.get('/book-series/covers/image?' + query + '&book=1'))
        .status,
      404
    );
  });
  it('bounds native previews and leaves missing artwork as title-only members', async () => {
    const configured = server();
    getSettings().readarr = [configured];
    const local = await getRepository(BookSeries).save(
      getRepository(BookSeries).create({
        provider: backendScope(configured),
        providerId: '10',
        authorId: 20,
        title: 'Series',
      })
    );
    const metadata = mock.method(
      ReadarrAPI.prototype,
      'getSeriesByAuthor',
      async () => [
        {
          id: 10,
          title: 'Series',
          links: [],
          books: Array.from({ length: 25 }, (_, i) => ({
            title: `Book ${i + 1}`,
            position: String(i + 1),
          })).reverse(),
        },
      ]
    );
    const perBook = mock.method(
      ReadarrAPI.prototype,
      'getNativeSeriesBook',
      async () => {
        throw new Error('Artwork must not resolve individual books');
      }
    );
    const agent = await login();
    const result = await agent.get('/book-series/covers?seriesId=' + local.id);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.books.length, 20);
    assert.equal(result.body.books[0].title, 'Book 1');
    assert.equal(result.body.books[19].title, 'Book 20');
    assert.equal(perBook.mock.callCount(), 0);
    assert.equal(metadata.mock.calls[0].arguments[0], 20);
  });
});
