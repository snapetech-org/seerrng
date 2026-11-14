import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { describe, it } from 'node:test';

import ReadarrAPI, {
  qualifyChaptarrBookRecord,
  qualifyChaptarrProviderId,
  type ReadarrBookLookupResult,
} from '@server/api/servarr/readarr';

type Backend = {
  appName: string;
  /** Undefined: the backend has no capability endpoint (404). */
  dialect?: 'hc' | 'gr';
  pagedLibrary?: boolean;
  /** Book 7 exists but is not monitored yet. */
  unmonitored?: boolean;
};

type RecordedRequest = {
  method: string;
  path: string;
  search: URLSearchParams;
  body?: Record<string, unknown>;
};

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
};

/** What a ChaptarrNG facade (or plain Readarr) writes for a library book. */
const facadeBook = (overrides: Partial<ReadarrBookLookupResult> = {}) => ({
  id: 7,
  title: 'Project Hail Mary',
  titleSlug: '459744',
  foreignBookId: '459744',
  foreignEditionId: '31922668',
  monitored: true,
  author: { id: 3, authorName: 'Andy Weir', foreignAuthorId: '204214' },
  editions: [
    {
      id: 70,
      foreignEditionId: '31922668',
      title: 'Project Hail Mary',
      isbn13: '9780593135204',
      monitored: true,
    },
  ],
  statistics: { bookFileCount: 1, audiobookFileCount: 1 },
  ...overrides,
});

const libraryBooks = () => [
  facadeBook(),
  // Chaptarr writes an empty work id when no provider id exists for it.
  facadeBook({ id: 8, title: 'No provider id', foreignBookId: '' }),
  facadeBook({ id: 9, title: 'Already qualified', foreignBookId: 'hc:1' }),
  facadeBook({
    id: 10,
    title: 'ISBN identity',
    foreignBookId: '9780593135204',
  }),
  facadeBook({ id: 11, title: 'Opaque', foreignBookId: 'OL123W' }),
];

const withBackend = async (
  backend: Backend,
  run: (url: string, requests: RecordedRequest[]) => Promise<void>
) => {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const body = await readBody(request);
      requests.push({
        method: request.method ?? 'GET',
        path: url.pathname,
        search: url.searchParams,
        body,
      });
      const path = url.pathname.replace(
        /^\/readarr\/(?:hc|gr)\/(?:ebook|audiobook)/,
        ''
      );
      if (url.pathname === '/api/v1/system/status') {
        return writeJson(response, 200, {
          appName: backend.appName,
          version: '0.9.1000.0',
          urlBase: '',
        });
      }
      if (url.pathname === '/api/v1/system/capabilities') {
        return backend.dialect
          ? writeJson(response, 200, {
              contract: 'chaptarrng-seerr-bookshelf',
              contractVersion: 1,
              providerIdDialect: backend.dialect,
              features: {
                formatScopedFacade: true,
                pagedLibrary: backend.pagedLibrary ?? true,
                providerScopedEditionIdentity: true,
              },
            })
          : writeJson(response, 404, {});
      }
      if (path === '/api/v1/book/paged') {
        const books = libraryBooks();
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
        return writeJson(response, 200, {
          records: books.slice(offset, offset + pageSize),
          offset,
          pageSize,
          totalCount: books.length,
        });
      }
      const book7 = () =>
        facadeBook(backend.unmonitored ? { monitored: false } : {});
      if (path === '/api/v1/book' && request.method === 'GET') {
        return writeJson(
          response,
          200,
          url.searchParams.get('titleSlug') || url.searchParams.get('authorId')
            ? [book7()]
            : libraryBooks()
        );
      }
      if (path === '/api/v1/book/7' && request.method === 'GET') {
        return writeJson(response, 200, book7());
      }
      if (path === '/api/v1/book/7' && request.method === 'PUT') {
        // The facade answers in its own (bare) spelling.
        return writeJson(
          response,
          202,
          facadeBook({ monitored: body?.monitored === true })
        );
      }
      if (path === '/api/v1/book/lookup') {
        return writeJson(response, 200, [facadeBook()]);
      }
      if (path === '/api/v1/calendar') {
        return writeJson(response, 200, [facadeBook()]);
      }
      if (path === '/api/v1/command') {
        return writeJson(response, 201, { id: 1, name: 'BookSearch' });
      }
      writeJson(response, 404, { message: `unexpected ${url.pathname}` });
    })().catch(() => writeJson(response, 500, {}));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}/api/v1`, requests);
  } finally {
    server.close();
    await once(server, 'close');
  }
};

const newApi = (url: string, mediaType: 'ebook' | 'audiobook' = 'audiobook') =>
  new ReadarrAPI({ url, apiKey: 'key', mediaType });

describe('qualifyChaptarrProviderId', () => {
  it('qualifies bare provider digits and leaves every other id unchanged', () => {
    assert.equal(qualifyChaptarrProviderId('459744', 'hc'), 'hc:459744');
    assert.equal(qualifyChaptarrProviderId('459744', 'gr'), 'gr:459744');
    assert.equal(qualifyChaptarrProviderId('hc:459744', 'gr'), 'hc:459744');
    assert.equal(
      qualifyChaptarrProviderId('9780593135204', 'hc'),
      '9780593135204'
    );
    assert.equal(qualifyChaptarrProviderId('OL123W', 'hc'), 'OL123W');
    assert.equal(qualifyChaptarrProviderId('', 'hc'), '');
    assert.equal(qualifyChaptarrProviderId(undefined, 'hc'), undefined);
  });

  it('qualifies a record the way lookups always have', () => {
    const book = qualifyChaptarrBookRecord(facadeBook(), 'hc');
    assert.equal(book.foreignBookId, 'hc:459744');
    assert.equal(book.foreignEditionId, 'hc:31922668');
    assert.equal(book.author?.foreignAuthorId, 'hc:204214');
    assert.equal(book.editions?.[0].foreignEditionId, 'hc:31922668');
    assert.equal(book.editions?.[0].isbn13, '9780593135204');
    assert.equal(book.titleSlug, '459744');
  });
});

describe('ChaptarrNG library reads qualify provider ids', () => {
  for (const dialect of ['hc', 'gr'] as const) {
    it(`qualifies ${dialect} library, page, single-book and author reads`, async () => {
      await withBackend(
        { appName: 'Chaptarr', dialect },
        async (url, requests) => {
          const api = newApi(url);
          const books = await api.getBooks();
          assert.deepEqual(
            books.map((book) => book.foreignBookId),
            [`${dialect}:459744`, '', 'hc:1', '9780593135204', 'OL123W']
          );
          assert.equal(books[0].foreignEditionId, `${dialect}:31922668`);
          assert.equal(books[0].author?.foreignAuthorId, `${dialect}:204214`);
          assert.equal(
            books[0].editions?.[0].foreignEditionId,
            `${dialect}:31922668`
          );
          // Library reads went through the facade of that dialect.
          assert.ok(
            requests.some(
              (request) =>
                request.path ===
                `/readarr/${dialect}/audiobook/api/v1/book/paged`
            )
          );

          const page = await newApi(url).getBooksPage(0, 2);
          assert.deepEqual(
            page.books.map((book) => book.foreignBookId),
            [`${dialect}:459744`, '']
          );
          assert.equal(page.totalCount, 5);

          // getBook can be served from the response cache; a fresh client
          // must still detect the facade before returning the record.
          for (const client of [newApi(url), newApi(url)]) {
            const book = await client.getBook(7, 300);
            assert.equal(book.foreignBookId, `${dialect}:459744`);
          }
          assert.equal(
            (await newApi(url).getBookIfExists(7))?.foreignBookId,
            `${dialect}:459744`
          );
          assert.equal(
            (await newApi(url).getBooksByAuthor(3, 0))[0].foreignBookId,
            `${dialect}:459744`
          );
          const calendar = (await newApi(url).getReleaseCalendar(
            '2026-01-01',
            '2026-02-01'
          )) as ReadarrBookLookupResult[];
          assert.equal(calendar[0].foreignBookId, `${dialect}:459744`);

          assert.equal(ReadarrAPI.getKnownLibraryIdDialect(url), dialect);
        }
      );
    });
  }

  it('qualifies the unpaged library of an older ChaptarrNG', async () => {
    await withBackend(
      { appName: 'Chaptarr', dialect: 'hc', pagedLibrary: false },
      async (url) => {
        const books = await newApi(url, 'ebook').getBooks();
        assert.equal(books[0].foreignBookId, 'hc:459744');
        const page = await newApi(url, 'ebook').getBooksPage(0, 1);
        assert.equal(page.books[0].foreignBookId, 'hc:459744');
      }
    );
  });

  it('qualifies a legacy ChaptarrNG without the capability contract', async () => {
    await withBackend({ appName: 'Chaptarr' }, async (url) => {
      const api = newApi(url);
      const books = await api.getBooks();
      assert.equal(books[0].foreignBookId, 'hc:459744');
      // Its bare and qualified spellings are known to be one work.
      assert.ok(
        api.getKnownBookIdentityAliases('459744').includes('hc:459744')
      );
      assert.ok(
        api.getKnownBookIdentityAliases('hc:459744').includes('459744')
      );
      assert.deepEqual(api.getKnownBookIdentityAliases('gr:459744'), [
        'gr:459744',
      ]);
    });
  });

  it('leaves plain Readarr records completely unchanged', async () => {
    await withBackend({ appName: 'Readarr' }, async (url) => {
      const api = newApi(url);
      const books = await api.getBooks();
      assert.deepEqual(books, libraryBooks());
      assert.deepEqual(await newApi(url).getBook(7), facadeBook());
      assert.deepEqual(
        (await newApi(url).getBooksPage(0, 5)).books,
        libraryBooks()
      );
      assert.deepEqual(api.getKnownBookIdentityAliases('459744'), ['459744']);
      assert.equal(ReadarrAPI.getKnownLibraryIdDialect(url), null);
    });
  });
});

describe('qualified ids on the way back to the ChaptarrNG facade', () => {
  it('matches a stored bare provider id against a qualified library book', async () => {
    await withBackend({ appName: 'Chaptarr', dialect: 'hc' }, async (url) => {
      const api = newApi(url);
      const book = await api.getBook(7);
      assert.ok(api.matchesBookProviderIdentity(book, '459744'));
      assert.ok(api.matchesBookProviderIdentity(book, 'hc:459744'));
      assert.ok(!api.matchesBookProviderIdentity(book, 'gr:459744'));
      assert.ok(!api.matchesBookProviderIdentity(book, '459745'));
    });
  });

  it('resolves an old bare id through a qualified facade lookup', async () => {
    await withBackend(
      { appName: 'Chaptarr', dialect: 'hc' },
      async (url, requests) => {
        const book = await newApi(url).lookupBookByProviderIdentity('459744');
        assert.equal(book?.foreignBookId, 'hc:459744');
        const lookup = requests.find((request) =>
          request.path.endsWith('/book/lookup')
        );
        assert.equal(lookup?.path, '/readarr/hc/audiobook/api/v1/book/lookup');
        assert.equal(lookup?.search.get('term'), 'hc:459744');
      }
    );
  });

  it('finds the existing book for a qualified add and updates it on the facade', async () => {
    await withBackend(
      { appName: 'Chaptarr', dialect: 'hc', unmonitored: true },
      async (url, requests) => {
        const api = newApi(url);
        const lookup = (await api.lookupBook('hc:459744'))[0];
        const result = await api.addBook({
          ...lookup,
          id: undefined,
          monitored: true,
          qualityProfileId: 1,
          metadataProfileId: 1,
          rootFolderPath: '/audiobooks',
          editions: (lookup.editions ?? []).map((edition) => ({
            ...edition,
            monitored: true,
          })),
          addOptions: { searchForNewBook: false },
        });

        const exact = requests.find(
          (request) =>
            request.method === 'GET' &&
            request.path === '/readarr/hc/audiobook/api/v1/book' &&
            request.search.get('titleSlug')
        );
        // The facade's exact lookup takes the bare provider number.
        assert.equal(exact?.search.get('titleSlug'), '459744');
        // The qualified request matched the existing row: no duplicate add.
        assert.ok(
          !requests.some(
            (request) =>
              request.method === 'POST' && request.path.endsWith('/book')
          )
        );
        const update = requests.find((request) => request.method === 'PUT');
        assert.equal(update?.path, '/readarr/hc/audiobook/api/v1/book/7');
        // ChaptarrNG's facade accepts provider-qualified ids on writes (bare
        // ids are only normalised to the same qualified form), ignores the
        // work id on updates and keeps stored edition identity by local id.
        assert.equal(update?.body?.id, 7);
        assert.equal(update?.body?.monitored, true);
        assert.equal(update?.body?.foreignBookId, 'hc:459744');
        assert.equal(
          (update?.body?.editions as { id?: number }[] | undefined)?.[0]?.id,
          70
        );
        assert.equal(result.createdBook, false);
        assert.equal(result.foreignBookId, 'hc:459744');
      }
    );
  });
});
