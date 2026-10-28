import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { afterEach, describe, it, mock } from 'node:test';

import type {
  ReadarrBook,
  ReadarrBookLookupResult,
  ReadarrBookOptions,
} from '@server/api/servarr/readarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import axios from 'axios';

import {
  MAX_SERVARR_COVER_IMAGES,
  MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
} from './base';

type MockableReadarr = {
  get: (
    endpoint: string,
    options?: {
      params?: Record<string, unknown>;
      maxContentLength?: number;
    },
    ttl?: number
  ) => Promise<unknown>;
  post: (
    endpoint: string,
    data?: Record<string, unknown>,
    options?: { params?: Record<string, unknown> }
  ) => Promise<ReadarrBook>;
  request: (
    method: string,
    endpoint: string,
    data?: unknown,
    config?: unknown
  ) => Promise<{ data: unknown }>;
};

describe('ReadarrAPI.getReleaseCalendar', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('keeps the configured book format and requests author details', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'audiobook',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => []
    );

    await api.getReleaseCalendar(
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      false,
      false,
      true
    );

    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/calendar');
    assert.deepStrictEqual(getMock.mock.calls[0].arguments[1], {
      params: {
        mediaType: 'audiobook',
        start: '2026-09-01T00:00:00.000Z',
        end: '2026-10-01T00:00:00.000Z',
        unmonitored: false,
        includeAuthor: true,
      },
    });
    assert.strictEqual(getMock.mock.calls[0].arguments[2], 300);
  });
});

describe('Readarr API key authentication', () => {
  it('authenticates Bookshelf with X-Api-Key instead of a query parameter', async () => {
    let receivedApiKey: string | undefined;
    let receivedQueryApiKey: string | null = null;
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost');
      const apiKeyHeader = request.headers['x-api-key'];
      receivedApiKey = Array.isArray(apiKeyHeader)
        ? apiKeyHeader[0]
        : apiKeyHeader;
      receivedQueryApiKey = requestUrl.searchParams.get('apikey');

      if (receivedApiKey !== 'test-bookshelf-key' || receivedQueryApiKey) {
        writeJson(response, 401, { message: 'Unauthorized' });
        return;
      }

      writeJson(response, 200, [{ id: 1, name: 'Standard' }]);
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'test-bookshelf-key',
      });

      assert.deepEqual(await api.getProfiles(), [{ id: 1, name: 'Standard' }]);
      assert.equal(receivedApiKey, 'test-bookshelf-key');
      assert.equal(receivedQueryApiKey, null);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });
});

const bookOptions: ReadarrBookOptions = {
  title: 'Test Book',
  foreignBookId: 'book-foreign-id',
  qualityProfileId: 1,
  metadataProfileId: 2,
  rootFolderPath: '/books',
  monitored: true,
  tags: [10],
  editions: [
    {
      foreignEditionId: 'edition-foreign-id',
      title: 'Test Book',
      isbn13: '9780000000001',
      monitored: true,
    },
  ],
  addOptions: {
    searchForNewBook: true,
  },
};

const bookOptionsWithoutSearch: ReadarrBookOptions = {
  ...bookOptions,
  addOptions: { searchForNewBook: false },
};

const existingBook = (overrides: Partial<ReadarrBook> = {}): ReadarrBook => ({
  id: 9,
  title: 'Test Book',
  titleSlug: 'test-book',
  foreignBookId: 'book-foreign-id',
  monitored: true,
  editions: [
    {
      foreignEditionId: 'edition-foreign-id',
      title: 'Test Book',
      isbn13: '9780000000001',
      monitored: true,
    },
  ],
  ...overrides,
});

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }

  return body ? JSON.parse(body) : undefined;
};

const writeJson = (
  response: ServerResponse,
  status: number,
  body: unknown
): void => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

const writeRawJson = (
  response: ServerResponse,
  status: number,
  body: string
): void => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(body);
};

describe('ReadarrAPI.getEditions', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches editions for a specific book', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [
        {
          foreignEditionId: 'edition-foreign-id',
          title: 'Test Book',
          isbn13: '9780000000001',
          monitored: true,
        },
      ]
    );

    const result = await api.getEditions(42);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/edition');
    assert.deepStrictEqual(getMock.mock.calls[0].arguments[1], {
      params: { bookId: 42 },
    });
  });
});

describe('Readarr full-library response limit', () => {
  afterEach(() => mock.restoreAll());

  it('applies the finite cap to the unpaged full-library response', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const get = mock.method(
      api as unknown as MockableReadarr,
      'get',
      async () => []
    );

    assert.deepEqual(await api.getBooks(), []);
    assert.equal(get.mock.calls[0].arguments[0], '/book');
    assert.equal(
      get.mock.calls[0].arguments[1]?.maxContentLength,
      MAX_SERVARR_LIBRARY_RESPONSE_BYTES
    );
  });
});

describe('ReadarrAPI.getBook', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches a specific book by ID', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => existingBook({ id: 42 })
    );

    const result = await api.getBook(42);

    assert.strictEqual(result.id, 42);
    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/book/42');
  });

  it('can bypass the metadata cache for lifecycle telemetry', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => existingBook({ id: 42 })
    );

    await api.getBook(42, 0);

    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/book/42');
    assert.strictEqual(getMock.mock.calls[0].arguments[2], 0);
  });
});

describe('ReadarrAPI.getBookCover', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches the first advertised relative cover path outside the API base path', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/base/api/v1',
      apiKey: 'key',
    });
    mock.method(api, 'getBook', async () =>
      existingBook({
        id: 42,
        images: [
          {
            coverType: 'cover',
            url: '/MediaCover/42/cover.jpg',
          },
        ],
      })
    );
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('image-bytes'),
      headers: { 'content-type': 'image/jpeg' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getBookCover(42);

    assert.deepStrictEqual(result.imageBuffer, Buffer.from('image-bytes'));
    assert.strictEqual(result.contentType, 'image/jpeg');
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:8787/base/MediaCover/42/cover.jpg'
    );
  });

  it('falls back to the standard Readarr-compatible cover path', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    mock.method(api, 'getBook', async () => existingBook({ id: 42 }));
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('fallback-image'),
      headers: { 'content-type': 'image/png' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getBookCover(42);

    assert.deepStrictEqual(result.imageBuffer, Buffer.from('fallback-image'));
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:8787/MediaCover/42/cover.jpg'
    );
  });

  it('falls back to an advertised remote cover when local media cover is not an image', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    mock.method(api, 'getBook', async () =>
      existingBook({
        id: 42,
        images: [
          {
            coverType: 'cover',
            url: '/MediaCover/Books/42/cover.jpeg?lastWrite=123',
            remoteUrl: 'https://8.8.8.8/book-cover.jpeg',
          },
        ],
      })
    );
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('login-page'),
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;
    const remoteGetMock = mock.method(axios, 'get', async () => ({
      data: Buffer.from('remote-book-image'),
      headers: { 'content-type': 'image/jpeg' },
    }));

    const result = await api.getBookCover(42);

    assert.deepStrictEqual(
      result.imageBuffer,
      Buffer.from('remote-book-image')
    );
    assert.strictEqual(result.contentType, 'image/jpeg');
    assert.strictEqual(
      remoteGetMock.mock.calls[0].arguments[0],
      'https://8.8.8.8/book-cover.jpeg'
    );
    const options = remoteGetMock.mock.calls[0].arguments[1] as Record<
      string,
      unknown
    >;
    assert.strictEqual(options.responseType, 'arraybuffer');
    assert.strictEqual(options.maxContentLength, 10 * 1024 * 1024);
    assert.strictEqual(options.maxBodyLength, 10 * 1024 * 1024);
    assert.strictEqual(options.timeout, 10_000);
    assert.strictEqual(options.proxy, false);
  });

  it('limits untrusted provider cover entries before trying paths', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    mock.method(api, 'getBook', async () =>
      existingBook({
        id: 42,
        images: Array.from(
          { length: MAX_SERVARR_COVER_IMAGES * 2 },
          (_, index) => ({
            coverType: 'cover',
            url: `/MediaCover/missing-${index}.jpg`,
          })
        ),
      })
    );
    const axiosGetMock = mock.fn(async () => {
      throw new Error('missing image');
    });
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    await assert.rejects(api.getBookCover(42), /Failed to retrieve cover/);
    assert.equal(axiosGetMock.mock.callCount(), MAX_SERVARR_COVER_IMAGES + 2);
  });
});

describe('ReadarrAPI.getAuthorCover', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('uses provider-native author image paths and returns image bytes', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/base/api/v1',
      apiKey: 'key',
    });
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => ({
        id: 42,
        foreignAuthorId: 'goodreads-author-42',
        authorName: 'Test Author',
        images: [
          {
            coverType: 'poster',
            url: '/MediaCover/42/poster.jpg',
            remoteUrl: 'https://covers.example/author.jpg',
          },
        ],
      })
    );
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('author-image'),
      headers: { 'content-type': 'image/jpeg' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getAuthorCover(42);

    assert.deepStrictEqual(result.imageBuffer, Buffer.from('author-image'));
    assert.strictEqual(result.contentType, 'image/jpeg');
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:8787/base/MediaCover/42/poster.jpg'
    );
  });
});

describe('ReadarrAPI.lookupAuthor', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('looks up authors by term', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [
        {
          foreignAuthorId: '656983',
          authorName: 'J.R.R. Tolkien',
        },
      ]
    );

    const result = await api.lookupAuthor('J.R.R. Tolkien');

    assert.strictEqual(result[0].foreignAuthorId, '656983');
    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/author/lookup');
    assert.deepStrictEqual(getMock.mock.calls[0].arguments[1], {
      params: { term: 'J.R.R. Tolkien' },
    });
  });
});

describe('ReadarrAPI media type requests', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('scopes lookups and adds to the configured book format', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'audiobook',
    });
    mock.method(
      api as unknown as { ensureProvider: () => Promise<void> },
      'ensureProvider',
      async () => undefined
    );
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => []
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => existingBook({ id: 11 })
    );

    await api.lookupBook('isbn:9780000000001');
    await api.addBook(bookOptions);

    assert.deepStrictEqual(getMock.mock.calls[0].arguments[1], {
      params: {
        term: 'isbn:9780000000001',
        mediaType: 'audiobook',
      },
    });
    assert.deepStrictEqual(getMock.mock.calls[1].arguments[1], {
      params: { mediaType: 'audiobook' },
      maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
    });
    assert.deepStrictEqual(postMock.mock.calls[0].arguments[2], {
      params: { mediaType: 'audiobook' },
    });
  });

  it('reads only the requested Bookshelf page and preserves its total', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'audiobook',
    });
    mock.method(
      api as unknown as { ensureProvider: () => Promise<void> },
      'ensureProvider',
      async () => undefined
    );
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => ({
        records: [
          {
            id: 51,
            title: 'Paged audiobook',
            foreignBookId: 'hardcover:paged-audio',
          },
        ],
        offset: 50,
        pageSize: 50,
        totalCount: 300,
      })
    );

    const result = await api.getBooksPage(50, 50);

    assert.deepStrictEqual(
      result.books.map((book) => book.id),
      [51]
    );
    assert.strictEqual(result.totalCount, 300);
    assert.strictEqual(getMock.mock.calls[0].arguments[0], '/book/paged');
    assert.deepStrictEqual(getMock.mock.calls[0].arguments[1], {
      params: {
        mediaType: 'audiobook',
        offset: 50,
        pageSize: 50,
        includeUnmonitored: true,
      },
    });
    assert.strictEqual(getMock.mock.calls[0].arguments[2], 0);
  });

  it('falls back to the regular library only when paging is unsupported', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'audiobook',
    });
    mock.method(
      api as unknown as { ensureProvider: () => Promise<void> },
      'ensureProvider',
      async () => undefined
    );
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async (endpoint: string) => {
        if (endpoint === '/book/paged') {
          const error = new axios.AxiosError('Not found');
          error.response = {
            status: 404,
            statusText: 'Not Found',
            headers: {},
            config: {} as never,
            data: {},
          };
          throw error;
        }

        return [
          { id: 1, title: 'First book', foreignBookId: 'first' },
          { id: 2, title: 'Second book', foreignBookId: 'second' },
          { id: 3, title: 'Third book', foreignBookId: 'third' },
        ];
      }
    );

    const result = await api.getBooksPage(1, 1);

    assert.deepStrictEqual(
      result.books.map((book) => book.id),
      [2]
    );
    assert.strictEqual(result.totalCount, 3);
    assert.deepStrictEqual(
      getMock.mock.calls.map((call) => call.arguments[0]),
      ['/book/paged', '/book']
    );
  });
});

describe('ReadarrAPI.getDevelopmentConfig', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches development config', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => ({
        id: 1,
        metadataSource: 'http://127.0.0.1:8790',
        apiKey: 'provider-secret',
        providerOnly: true,
      })
    );

    const result = await api.getDevelopmentConfig();

    assert.strictEqual(result.metadataSource, 'http://127.0.0.1:8790');
    assert.ok(!('apiKey' in result));
    assert.ok(!('providerOnly' in result));
    assert.strictEqual(
      getMock.mock.calls[0].arguments[0],
      '/config/development'
    );
  });
});

describe('ReadarrAPI.addBook', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('searches an existing monitored book when the request asks for acquisition', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const getMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [existingBook()]
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => existingBook({ id: 10 })
    );
    const commandPostMock = mock.fn<
      (
        endpoint: string,
        data?: Record<string, unknown>
      ) => Promise<{ data: { id: number; name: string; status: string } }>
    >(async () => ({
      data: { id: 101, name: 'BookSearch', status: 'started' },
    }));
    (
      api as unknown as {
        axios: { post: typeof commandPostMock };
      }
    ).axios.post = commandPostMock;

    const result = await api.addBook(bookOptions);

    assert.strictEqual(result.id, 9);
    assert.strictEqual(getMock.mock.calls.length, 1);
    assert.strictEqual(postMock.mock.calls.length, 0);
    assert.strictEqual(commandPostMock.mock.calls.length, 1);
    assert.deepStrictEqual(
      (commandPostMock.mock.calls[0].arguments as unknown[])[1],
      {
        name: 'BookSearch',
        bookIds: [9],
      }
    );
  });

  it('matches existing books with normalized ISBNs', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [
        existingBook({
          editions: [
            {
              foreignEditionId: 'other-edition-id',
              title: 'Test Book',
              isbn13: '978-0-000-00000-1',
              monitored: true,
            },
          ],
        }),
      ]
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => existingBook({ id: 10 })
    );

    const result = await api.addBook(bookOptionsWithoutSearch);

    assert.strictEqual(result.id, 9);
    assert.strictEqual(postMock.mock.calls.length, 0);
  });

  it('matches existing books with foreign edition IDs', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [
        existingBook({
          foreignBookId: 'different-book-id',
          editions: [
            {
              foreignEditionId: 'edition-foreign-id',
              title: 'Test Book',
              monitored: true,
            },
          ],
        }),
      ]
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => existingBook({ id: 10 })
    );

    const result = await api.addBook(bookOptionsWithoutSearch);

    assert.strictEqual(result.id, 9);
    assert.strictEqual(postMock.mock.calls.length, 0);
  });

  it('matches existing books with canonicalized Open Library work and edition IDs', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [
        existingBook({
          foreignBookId: '/works/ol123w',
          editions: [
            {
              foreignEditionId: '/books/ol456m',
              title: 'Test Book',
              monitored: true,
            },
          ],
        }),
      ]
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => existingBook({ id: 10 })
    );

    const result = await api.addBook({
      ...bookOptionsWithoutSearch,
      foreignBookId: 'OL123W',
      editions: [
        {
          foreignEditionId: 'OL456M',
          title: 'Test Book',
          monitored: true,
        },
      ],
    });

    assert.strictEqual(result.id, 9);
    assert.strictEqual(postMock.mock.calls.length, 0);
  });

  it('monitors and searches an existing unmonitored book', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const updatedBook = existingBook({ monitored: true });
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [existingBook({ monitored: false })]
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => updatedBook
    );
    const putMock = mock.fn(async () => ({ data: updatedBook }));
    (
      api as unknown as {
        axios: { put: typeof putMock };
      }
    ).axios.put = putMock;

    const result = await api.addBook(bookOptions);

    assert.strictEqual(result.id, 9);
    assert.strictEqual(putMock.mock.calls.length, 1);
    assert.strictEqual(postMock.mock.calls.length, 1);
    assert.deepStrictEqual(postMock.mock.calls[0].arguments[1], {
      name: 'BookSearch',
      bookIds: [9],
    });
  });

  it('sends an empty editions array when monitoring an existing book without editions', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const updatedBook = existingBook({ monitored: true });
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => [existingBook({ monitored: false, editions: undefined })]
    );
    mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => updatedBook
    );
    const putMock = mock.fn(async () => ({ data: updatedBook }));
    (
      api as unknown as {
        axios: { put: typeof putMock };
      }
    ).axios.put = putMock;

    await api.addBook(bookOptions);

    const updatePayload = (
      putMock.mock.calls as unknown as {
        arguments: [string, { editions?: unknown[] }];
      }[]
    )[0].arguments[1];
    assert.deepStrictEqual(updatePayload.editions, []);
  });

  it('posts a new book when no existing match is found', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
    });
    const get = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'get',
      async () => []
    );
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () => existingBook({ id: 11 })
    );

    const result = await api.addBook(bookOptions);

    assert.strictEqual(result.id, 11);
    assert.strictEqual(postMock.mock.calls.length, 1);
    assert.strictEqual(postMock.mock.calls[0].arguments[0], '/book');
    assert.equal(
      get.mock.calls[0].arguments[1]?.maxContentLength,
      MAX_SERVARR_LIBRARY_RESPONSE_BYTES
    );
  });
});

describe('ReadarrAPI Chaptarr compatibility', () => {
  it('preserves fallback provider identities across fresh API instances for both formats', async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      paths.push(url.pathname + url.search);
      if (url.pathname === '/api/v1/system/status') {
        writeJson(response, 200, {
          appName: 'Chaptarr',
          version: '0.9.965.0',
          urlBase: '',
        });
      } else if (url.pathname === '/api/v1/system/capabilities') {
        writeJson(response, 200, {
          contract: 'chaptarrng-seerr-bookshelf',
          contractVersion: 1,
          providerIdDialect: 'hc',
          features: {
            formatScopedFacade: true,
            providerScopedEditionIdentity: true,
          },
        });
      } else if (/^\/readarr\/hc\//.test(url.pathname)) {
        writeJson(response, 200, []);
      } else if (
        /^\/readarr\/gr\//.test(url.pathname) &&
        ['Bret Easton Ellis', 'gr:90439420'].includes(
          url.searchParams.get('term') ?? ''
        )
      ) {
        writeJson(response, 200, [
          {
            title: 'The Shards',
            foreignBookId: '90439420',
            foreignEditionId: '60880820',
            author: {
              authorName: 'Bret Easton Ellis',
              foreignAuthorId: '2751',
            },
            editions: [
              {
                foreignEditionId: '60880820',
                title: 'The Shards',
                monitored: true,
              },
            ],
          },
        ]);
      } else {
        writeJson(response, 404, {});
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      for (const mediaType of ['ebook', 'audiobook'] as const) {
        const options: {
          url: string;
          apiKey: string;
          mediaType: 'ebook' | 'audiobook';
        } = {
          url: `http://127.0.0.1:${address.port}/api/v1`,
          apiKey: 'key',
          mediaType,
        };
        const books: ReadarrBookLookupResult[] = await new ReadarrAPI(
          options
        ).lookupBook('Bret Easton Ellis');
        const book = books[0];
        assert.equal(book.foreignBookId, 'gr:90439420');
        assert.equal(book.foreignEditionId, 'gr:60880820');
        assert.equal(book.author?.foreignAuthorId, 'gr:2751');
        assert.equal(book.editions?.[0].foreignEditionId, 'gr:60880820');
        // Dispatch and details each create a new client with the HC default.
        const restored = await new ReadarrAPI(
          options
        ).lookupBookByProviderIdentity(book.foreignBookId);
        assert.equal(restored?.title, 'The Shards');
        assert.equal(restored?.foreignBookId, 'gr:90439420');
        assert.ok(
          paths.some((path) => {
            const url = new URL(path, 'http://localhost');
            return (
              url.pathname === `/readarr/gr/${mediaType}/api/v1/book/lookup` &&
              url.searchParams.get('term') === 'gr:90439420'
            );
          })
        );
      }
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('uses the explicit Chaptarr integration capabilities before provider settings', async () => {
    const requestedPaths: string[] = [];
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        requestedPaths.push(parsedUrl.pathname);

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Chaptarr',
            version: '0.9.940.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/system/capabilities') {
          writeJson(response, 200, {
            contract: 'chaptarrng-seerr-bookshelf',
            contractVersion: 1,
            providerIdDialect: 'gr',
            mediaTypes: ['ebook', 'audiobook'],
            features: {
              formatScopedFacade: true,
              pagedLibrary: true,
              providerScopedEditionIdentity: true,
              pendingAuthorImports: true,
              pendingImportCancellation: true,
              restrictedServiceApiKey: true,
            },
          });
          return;
        }

        writeJson(response, 404, { message: 'not found' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'ebook',
      });

      await api.getSystemStatus();

      const internalApi = api as unknown as {
        requestBaseUrl?: string;
      };
      assert.equal(
        internalApi.requestBaseUrl,
        `http://127.0.0.1:${address.port}/readarr/gr/ebook/api/v1`
      );
      assert.ok(requestedPaths.includes('/api/v1/system/capabilities'));
      assert.ok(!requestedPaths.includes('/api/v1/config/hardcover'));
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('keeps using the native API when the contract does not advertise a format facade', async () => {
    const requestedPaths: string[] = [];
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        requestedPaths.push(parsedUrl.pathname);

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Chaptarr',
            version: '0.9.940.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/system/capabilities') {
          writeJson(response, 200, {
            contract: 'chaptarrng-seerr-bookshelf',
            contractVersion: 1,
            providerIdDialect: 'gr',
            features: { formatScopedFacade: false },
          });
          return;
        }

        writeJson(response, 404, { message: 'not found' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'ebook',
      });

      await api.getSystemStatus();

      const internalApi = api as unknown as {
        requestBaseUrl?: string;
      };
      assert.equal(internalApi.requestBaseUrl, undefined);
      assert.ok(!requestedPaths.includes('/api/v1/config/hardcover'));
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('uses BookshelfNG format routes only for its supported capability contract', async () => {
    const requestedPaths: string[] = [];
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        requestedPaths.push(parsedUrl.pathname);

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Readarr',
            version: '0.9.940.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/system/capabilities') {
          writeJson(response, 200, {
            contract: 'seerrng-bookshelf',
            contractVersion: 1,
            providerIdDialect: 'gr',
            mediaTypes: ['ebook', 'audiobook'],
            features: {
              formatScopedFacade: true,
              pagedLibrary: true,
              providerScopedEditionIdentity: true,
              pendingAuthorImports: true,
              pendingImportCancellation: true,
              restrictedServiceApiKey: false,
            },
          });
          return;
        }

        writeJson(response, 404, { message: 'not found' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'audiobook',
      });

      await api.getSystemStatus();

      const internalApi = api as unknown as {
        requestBaseUrl?: string;
      };
      assert.equal(
        internalApi.requestBaseUrl,
        `http://127.0.0.1:${address.port}/readarr/gr/audiobook/api/v1`
      );
      assert.ok(requestedPaths.includes('/api/v1/system/capabilities'));
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('returns pending Chaptarr book adds as durable pending results', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string; version?: string };
      chaptarrCapabilities?: {
        features?: { pendingAuthorImports?: boolean };
      };
      ensureProvider: () => Promise<void>;
      findExistingBookForAdd: (
        options: ReadarrBookOptions
      ) => Promise<undefined>;
    };
    internalApi.detectedSystemStatus = { appName: 'Chaptarr' };
    internalApi.chaptarrCapabilities = {
      features: { pendingAuthorImports: true },
    };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    mock.method(internalApi, 'findExistingBookForAdd', async () => undefined);
    const postMock = mock.method(
      ReadarrAPI.prototype as unknown as MockableReadarr,
      'post',
      async () =>
        ({
          PendingId: 901,
          Message: 'Waiting for author metadata.',
        }) as unknown as ReadarrBook
    );

    const result = await api.addBook(bookOptions);

    assert.equal(result.pending, true);
    assert.equal(result.pendingId, 901);
    assert.equal(result.message, 'Waiting for author metadata.');
    assert.equal(result.foreignBookId, bookOptions.foreignBookId);
    assert.equal(result.id, undefined);
    assert.equal(result.createdBook, false);
    assert.equal(postMock.mock.calls.length, 1);
  });

  it('reads and cancels a pending Chaptarr author import', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string; version?: string };
      chaptarrCapabilities?: {
        features?: {
          pendingAuthorImports?: boolean;
          pendingImportCancellation?: boolean;
        };
      };
      ensureProvider: () => Promise<void>;
    };
    internalApi.detectedSystemStatus = { appName: 'Chaptarr' };
    internalApi.chaptarrCapabilities = {
      features: {
        pendingAuthorImports: true,
        pendingImportCancellation: true,
      },
    };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    const getMock = mock.method(
      api as unknown as MockableReadarr,
      'get',
      async () => ({
        Id: 901,
        Status: 'InProgress',
        OverallStatus: 'InProgress',
        EbookStatus: 'Retrying',
        AudiobookStatus: 'NotRequested',
        AttemptCount: 2,
        MaxAttempts: 8,
        NextAttemptAt: '2026-10-04T18:00:00.000Z',
        LastError: 'Author metadata is not available yet.',
      })
    );
    const pendingImport = await api.getPendingAuthorImport(901);

    assert.deepEqual(pendingImport, {
      id: 901,
      status: 'InProgress',
      overallStatus: 'InProgress',
      ebookStatus: 'Retrying',
      audiobookStatus: 'NotRequested',
      attemptCount: 2,
      maxAttempts: 8,
      nextAttemptAt: '2026-10-04T18:00:00.000Z',
      lastError: 'Author metadata is not available yet.',
    });
    assert.equal(
      getMock.mock.calls[0].arguments[0],
      '/pendingauthorimport/901'
    );

    const requestMock = mock.method(
      api as unknown as {
        request: (
          method: string,
          path: string,
          data?: unknown,
          config?: unknown
        ) => Promise<{ data: unknown }>;
      },
      'request',
      async () => ({ data: { message: 'Pending import cancelled' } })
    );
    await api.cancelPendingAuthorImport(901);

    assert.equal(requestMock.mock.calls[0].arguments[0], 'DELETE');
    assert.equal(
      requestMock.mock.calls[0].arguments[1],
      '/pendingauthorimport/901'
    );
  });

  it('does not call pending-import endpoints when the capability is absent', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string };
      chaptarrCapabilities?: {
        features?: {
          pendingAuthorImports?: boolean;
          pendingImportCancellation?: boolean;
        };
      };
      ensureProvider: () => Promise<void>;
    };
    internalApi.detectedSystemStatus = { appName: 'Chaptarr' };
    internalApi.chaptarrCapabilities = { features: {} };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    const getMock = mock.method(
      api as unknown as MockableReadarr,
      'get',
      async () => ({})
    );
    const requestMock = mock.method(
      api as unknown as MockableReadarr,
      'request',
      async () => ({ data: {} })
    );

    assert.equal(await api.getPendingAuthorImport(901), undefined);
    await api.cancelPendingAuthorImport(901);
    assert.equal(getMock.mock.callCount(), 0);
    assert.equal(requestMock.mock.callCount(), 0);
  });

  it('uses the complete library endpoint when paging is not advertised', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string };
      chaptarrCapabilities?: { features?: { pagedLibrary?: boolean } };
      ensureProvider: () => Promise<void>;
    };
    internalApi.detectedSystemStatus = { appName: 'Chaptarr' };
    internalApi.chaptarrCapabilities = { features: { pagedLibrary: false } };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    const getMock = mock.method(
      api as unknown as MockableReadarr,
      'get',
      async () => [{ id: 3, title: 'Unpaged book', foreignBookId: 'hc:3' }]
    );

    const books = await api.getBooks();

    assert.equal(books[0]?.id, 3);
    assert.equal(getMock.mock.calls[0].arguments[0], '/book');
  });

  it('does not trust edition IDs when the provider-scoped identity capability is absent', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string };
      chaptarrCapabilities?: {
        features?: { providerScopedEditionIdentity?: boolean };
      };
      ensureProvider: () => Promise<void>;
    };
    internalApi.detectedSystemStatus = { appName: 'Chaptarr' };
    internalApi.chaptarrCapabilities = {
      features: { providerScopedEditionIdentity: false },
    };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    mock.method(api as unknown as MockableReadarr, 'get', async () => [
      {
        title: 'Different work',
        foreignBookId: 'hc:other-work',
        author: { foreignAuthorId: 'hc:author', authorName: 'Author' },
        editions: [
          { foreignEditionId: 'hc:requested-edition', title: 'Edition' },
        ],
      },
    ]);

    assert.equal(
      await api.lookupBookByProviderIdentity(
        'hc:requested-work',
        'hc:requested-edition'
      ),
      undefined
    );
  });

  it('qualifies a bare numeric Hardcover work ID before lookup', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string };
      chaptarrCapabilities?: {
        features?: { providerScopedEditionIdentity?: boolean };
      };
      chaptarrDialect?: 'hc' | 'gr';
      ensureProvider: () => Promise<void>;
    };
    internalApi.detectedSystemStatus = { appName: 'Chaptarr' };
    internalApi.chaptarrCapabilities = {
      features: { providerScopedEditionIdentity: true },
    };
    internalApi.chaptarrDialect = 'hc';
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    const lookupTerms: string[] = [];
    mock.method(
      api as unknown as {
        lookupBook: (term: string) => Promise<ReadarrBookLookupResult[]>;
      },
      'lookupBook',
      async (term: string) => {
        lookupTerms.push(term);
        return [
          {
            title: 'Example Book',
            foreignBookId: 'hc:374541',
            author: { foreignAuthorId: 'hc:author-1', authorName: 'A. Author' },
            editions: [
              { foreignEditionId: 'hc:edition-1', title: 'Example Book' },
            ],
          },
        ];
      }
    );

    const result = await api.lookupBookByProviderIdentity('374541');
    const isbnResult = await api.lookupBookByProviderIdentity('9780306406157');

    assert.equal(result?.foreignBookId, 'hc:374541');
    assert.equal(isbnResult, undefined);
    assert.deepEqual(lookupTerms, ['hc:374541', '9780306406157']);
  });

  it('uses the supported Chaptarr narrator routes and preserves query values', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'audiobook',
    });
    const internalApi = api as unknown as {
      chaptarrCapabilities?: {
        features?: { seriesNarratorMatrix?: boolean };
      };
      ensureCapabilities: () => Promise<void>;
    };
    internalApi.chaptarrCapabilities = {
      features: { seriesNarratorMatrix: true },
    };
    mock.method(internalApi, 'ensureCapabilities', async () => undefined);
    const requestMock = mock.method(
      api as unknown as MockableReadarr,
      'request',
      async () => ({
        data: {
          seriesId: 21,
          seriesTitle: 'The Long Series Name',
          totalBooks: 2,
          narrators: [],
          books: [],
        },
      })
    );

    await api.getSeriesNarratorMatrix({
      title: 'The Long Series Name',
      authorId: 21,
    });
    await api.setSeriesPreferredNarrator(21, 'Jane Doe');

    assert.equal(requestMock.mock.calls[0].arguments[0], 'GET');
    assert.equal(
      requestMock.mock.calls[0].arguments[1],
      '/series/narrators/matrix'
    );
    assert.deepEqual(
      (requestMock.mock.calls[0].arguments[3] as { params: unknown }).params,
      {
        title: 'The Long Series Name',
        authorId: 21,
        mediaType: 'audiobook',
      }
    );
    assert.equal(requestMock.mock.calls[1].arguments[0], 'PUT');
    assert.equal(
      requestMock.mock.calls[1].arguments[1],
      '/series/21/narrators/preferred'
    );
    assert.deepEqual(requestMock.mock.calls[1].arguments[2], {
      narrator: 'Jane Doe',
      applyToAllBooks: true,
      overrideExisting: false,
    });
  });

  it('sends plus-encoded spaces and the audiobook scope in the narrator query', async () => {
    let receivedUrl: URL | undefined;
    const server = createServer((request, response) => {
      receivedUrl = new URL(request.url ?? '/', 'http://localhost');
      writeJson(response, 200, {
        seriesId: 21,
        seriesTitle: 'The Long Series Name',
        totalBooks: 2,
        narrators: [],
        books: [],
      });
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'audiobook',
      });
      const internalApi = api as unknown as {
        chaptarrCapabilities?: {
          features?: { seriesNarratorMatrix?: boolean };
        };
        ensureCapabilities: () => Promise<void>;
        ensureProvider: () => Promise<void>;
      };
      internalApi.chaptarrCapabilities = {
        features: { seriesNarratorMatrix: true },
      };
      mock.method(internalApi, 'ensureCapabilities', async () => undefined);
      mock.method(internalApi, 'ensureProvider', async () => undefined);

      const result = await api.getSeriesNarratorMatrix({
        title: 'The Long Series Name',
        authorId: 21,
      });

      assert.ok(receivedUrl);
      assert.match(receivedUrl.search, /title=The\+Long\+Series\+Name/);
      assert.equal(
        receivedUrl.searchParams.get('title'),
        'The Long Series Name'
      );
      assert.equal(receivedUrl.searchParams.get('authorId'), '21');
      assert.equal(receivedUrl.searchParams.get('mediaType'), 'audiobook');
      assert.equal(result?.seriesId, 21);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('adds a book without fetching an oversized unfiltered library', async () => {
    const requests: string[] = [];
    const oversizedLibrary = JSON.stringify(
      Array.from({ length: 20_000 }, (_, id) => ({
        id: id + 1,
        title: `Library Book ${id + 1}`,
        foreignBookId: `hc:${id + 1}`,
        overview: 'x'.repeat(900),
        editions: [],
      }))
    );
    assert.ok(Buffer.byteLength(oversizedLibrary) > 16 * 1024 * 1024);

    const scopedBases = [
      '/readarr/hc/ebook/api/v1',
      '/readarr/gr/ebook/api/v1',
    ];
    const addedBook = {
      ...bookOptions,
      id: 42,
      title: 'Large Library Book',
      mediaType: 'ebook' as const,
      monitored: true,
      ebookMonitored: true,
    };
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        const scopedBase = scopedBases.find((base) =>
          parsedUrl.pathname.startsWith(base)
        );
        await readJsonBody(request);
        requests.push(`${request.method ?? 'GET'} ${parsedUrl.pathname}`);

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Chaptarr',
            version: '0.9.936.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/config/hardcover') {
          writeJson(response, 200, { enabled: false });
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book`
        ) {
          writeRawJson(response, 200, oversizedLibrary);
          return;
        }

        if (
          request.method === 'POST' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book`
        ) {
          writeJson(response, 201, 42);
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/42`
        ) {
          writeJson(response, 200, addedBook);
          return;
        }

        writeJson(response, 404, { message: 'not found' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'ebook',
      });

      const result = await api.addBook({
        ...bookOptions,
        title: 'Large Library Book',
        mediaType: 'ebook',
      });

      assert.strictEqual(result.id, 42);
      assert.ok(!requests.includes('GET /readarr/gr/ebook/api/v1/book'));
      assert.ok(!requests.includes('GET /readarr/hc/ebook/api/v1/book'));
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('uses a lookup-provided local ID for an existing Chaptarr book', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      detectedSystemStatus?: { appName?: string; version?: string };
    };
    internalApi.detectedSystemStatus = {
      appName: 'Chaptarr',
      version: '0.9.936.0',
    };
    mock.method(
      api as unknown as { ensureProvider: () => Promise<void> },
      'ensureProvider',
      async () => undefined
    );
    const getBookMock = mock.method(api, 'getBook', async () =>
      existingBook({
        id: 42,
        mediaType: 'ebook',
        monitored: true,
        ebookMonitored: true,
      })
    );
    const searchBookMock = mock.method(
      api,
      'searchBook',
      async () => undefined
    );

    const result = await api.addBook({
      ...bookOptions,
      id: 42,
      mediaType: 'ebook',
    });

    assert.strictEqual(result.id, 42);
    assert.strictEqual(getBookMock.mock.calls.length, 1);
    assert.strictEqual(searchBookMock.mock.calls.length, 1);
  });

  it('paginates Chaptarr library scans with bounded requests', async () => {
    const pageQueries: URLSearchParams[] = [];
    const pages = [
      [
        existingBook({ id: 1, foreignBookId: 'hc:1' }),
        existingBook({ id: 2, foreignBookId: 'hc:2' }),
      ],
      [existingBook({ id: 3, foreignBookId: 'hc:3' })],
    ];
    const scopedBase = '/readarr/gr/ebook/api/v1';
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        await readJsonBody(request);

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Chaptarr',
            version: '0.9.936.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/config/hardcover') {
          writeJson(response, 200, { enabled: false });
          return;
        }

        if (
          request.method === 'GET' &&
          parsedUrl.pathname === `${scopedBase}/book/paged`
        ) {
          pageQueries.push(parsedUrl.searchParams);
          const offset = Number(parsedUrl.searchParams.get('offset'));
          const page = pages[offset / 2] ?? [];
          writeJson(response, 200, {
            records: page,
            totalCount: 3,
            offset,
            pageSize: 2,
          });
          return;
        }

        writeJson(response, 500, { message: 'unexpected request' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'ebook',
      });

      const books = await api.getBooks();

      assert.deepStrictEqual(
        books.map((book) => book.id),
        [1, 2, 3]
      );
      assert.deepStrictEqual(
        pageQueries.map((query) => query.get('offset')),
        ['0', '2']
      );
      for (const query of pageQueries) {
        assert.strictEqual(query.get('pageSize'), '500');
        assert.strictEqual(query.get('includeUnmonitored'), 'true');
        assert.strictEqual(query.get('mediaType'), 'ebook');
      }
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('uses the format facade, falls back to native lookup, and repairs monitoring/search state', async () => {
    const requests: {
      method: string;
      path: string;
      query: URLSearchParams;
      body: unknown;
    }[] = [];
    const lookupResult = {
      title: 'Dune',
      titleSlug: 'dune',
      foreignBookId: 'hc:123',
      mediaType: 'ebook' as const,
      author: {
        foreignAuthorId: 'hc:456',
        authorName: 'Frank Herbert',
      },
      editions: [
        {
          foreignEditionId: 'hc:789',
          title: 'Dune',
          isbn13: '9780000000001',
          monitored: true,
        },
      ],
    };
    const unmonitoredBook = {
      id: 42,
      ...lookupResult,
      monitored: false,
      ebookMonitored: false,
      addOptions: { searchForNewBook: false },
    };
    const monitoredBook = {
      ...unmonitoredBook,
      monitored: true,
      ebookMonitored: true,
      addOptions: { searchForNewBook: true },
    };
    let bookState = unmonitoredBook;
    const scopedBases = [
      '/readarr/hc/ebook/api/v1',
      '/readarr/gr/ebook/api/v1',
    ];
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        const scopedBase = scopedBases.find((base) =>
          parsedUrl.pathname.startsWith(base)
        );
        const body = await readJsonBody(request);
        requests.push({
          method: request.method ?? 'GET',
          path: parsedUrl.pathname,
          query: parsedUrl.searchParams,
          body,
        });

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Chaptarr',
            version: '0.9.911.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/config/hardcover') {
          writeJson(response, 200, { enabled: false });
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/lookup`
        ) {
          writeJson(response, 200, []);
          return;
        }

        if (
          request.method === 'GET' &&
          parsedUrl.pathname === '/api/v1/book/lookup'
        ) {
          writeJson(response, 200, [lookupResult]);
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book`
        ) {
          writeJson(response, 200, []);
          return;
        }

        if (
          request.method === 'POST' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book`
        ) {
          writeJson(response, 201, 42);
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/42`
        ) {
          writeJson(response, 200, bookState);
          return;
        }

        if (
          request.method === 'PUT' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/42`
        ) {
          bookState = monitoredBook;
          writeJson(response, 202, 42);
          return;
        }

        if (
          request.method === 'POST' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/command`
        ) {
          writeJson(response, 201, {});
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/queue`
        ) {
          writeJson(response, 200, {
            page: 1,
            pageSize: 1000,
            totalRecords: 0,
            records: [],
          });
          return;
        }

        writeJson(response, 404, { message: 'not found' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'ebook',
      });

      const lookup = await api.lookupBook('dune');
      assert.strictEqual(lookup[0].foreignBookId, 'hc:123');

      const result = await api.addBook({
        ...bookOptions,
        title: 'Dune',
        foreignBookId: 'hc:123',
        mediaType: 'ebook',
      });
      assert.strictEqual(result.id, 42);
      assert.strictEqual(result.ebookMonitored, true);

      await api.getQueue();

      const scopedPaths = requests
        .filter(({ path }) => path.includes('/readarr/'))
        .map(({ path }) => path);
      assert.deepStrictEqual(scopedPaths, [
        '/readarr/gr/ebook/api/v1/book/lookup',
        '/readarr/hc/ebook/api/v1/book/lookup',
        '/readarr/gr/ebook/api/v1/book',
        '/readarr/gr/ebook/api/v1/book/42',
        '/readarr/gr/ebook/api/v1/book/42',
        '/readarr/gr/ebook/api/v1/book/42',
        '/readarr/gr/ebook/api/v1/command',
        '/readarr/gr/ebook/api/v1/queue',
      ]);

      const nativeLookup = requests.find(
        ({ path }) => path === '/api/v1/book/lookup'
      );
      assert.ok(nativeLookup);
      assert.strictEqual(nativeLookup.query.get('mediaType'), null);

      const post = requests.find(
        ({ method, path }) =>
          method === 'POST' && path === '/readarr/gr/ebook/api/v1/book'
      );
      assert.ok(post);
      assert.deepStrictEqual(
        (post.body as Record<string, unknown>).ebookMonitored,
        true
      );

      const update = requests.find(
        ({ method, path }) =>
          method === 'PUT' && path === '/readarr/gr/ebook/api/v1/book/42'
      );
      assert.ok(update);
      assert.deepStrictEqual(update.body, {
        id: 42,
        mediaType: 'ebook',
        monitored: true,
        ebookMonitored: true,
        addOptions: { searchForNewBook: true },
      });

      const queue = requests.find(({ path }) => path.endsWith('/queue'));
      assert.ok(queue);
      assert.strictEqual(queue.query.get('page'), '1');
      assert.strictEqual(queue.query.get('pageSize'), '1000');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('uses addressable native results when an older Chaptarr build has no ebook lookup index', async () => {
    const requests: {
      method: string;
      path: string;
      query: URLSearchParams;
      body: unknown;
    }[] = [];
    const nativeResult = {
      title: 'The War of the Worlds',
      foreignBookId: 'gr:3194841',
      mediaType: 'audiobook' as const,
      author: {
        foreignAuthorId: 'gr:880695',
        authorName: 'H.G. Wells',
      },
      editions: [
        {
          foreignEditionId: 'gr:8909',
          title: 'The War of the Worlds',
          monitored: true,
        },
      ],
    };
    let bookState = {
      ...nativeResult,
      id: 17,
      mediaType: 'ebook' as const,
      monitored: true,
      ebookMonitored: true,
      addOptions: { searchForNewBook: false },
    };
    const scopedBases = [
      '/readarr/gr/ebook/api/v1',
      '/readarr/hc/ebook/api/v1',
    ];
    const server = createServer((request, response) => {
      void (async () => {
        const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
        const scopedBase = scopedBases.find((base) =>
          parsedUrl.pathname.startsWith(base)
        );
        const body = await readJsonBody(request);
        requests.push({
          method: request.method ?? 'GET',
          path: parsedUrl.pathname,
          query: parsedUrl.searchParams,
          body,
        });

        if (parsedUrl.pathname === '/api/v1/system/status') {
          writeJson(response, 200, {
            appName: 'Chaptarr',
            version: '0.9.911.0',
            urlBase: '',
          });
          return;
        }

        if (parsedUrl.pathname === '/api/v1/config/hardcover') {
          writeJson(response, 200, { enabled: false });
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/lookup`
        ) {
          writeJson(response, 200, []);
          return;
        }

        if (
          request.method === 'GET' &&
          parsedUrl.pathname === '/api/v1/book/lookup'
        ) {
          writeJson(response, 200, [nativeResult]);
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book`
        ) {
          writeJson(response, 200, []);
          return;
        }

        if (
          request.method === 'POST' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book`
        ) {
          writeJson(response, 201, bookState);
          return;
        }

        if (
          request.method === 'GET' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/17`
        ) {
          writeJson(response, 200, bookState);
          return;
        }

        if (
          request.method === 'PUT' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/book/17`
        ) {
          bookState = {
            ...bookState,
            ...(body as Record<string, unknown>),
            addOptions: { searchForNewBook: true },
          };
          writeJson(response, 202, bookState);
          return;
        }

        if (
          request.method === 'POST' &&
          scopedBase &&
          parsedUrl.pathname === `${scopedBase}/command`
        ) {
          writeJson(response, 201, {});
          return;
        }

        writeJson(response, 404, { message: 'not found' });
      })().catch(() => writeJson(response, 500, { message: 'handler failed' }));
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'key',
        mediaType: 'ebook',
      });

      const lookup = await api.lookupBook('the war of the worlds');
      assert.strictEqual(lookup[0].mediaType, 'ebook');
      assert.strictEqual(lookup[0].foreignBookId, nativeResult.foreignBookId);

      const result = await api.addBook({
        ...lookup[0],
        mediaType: 'ebook',
        monitored: true,
        qualityProfileId: 1,
        metadataProfileId: 2,
        rootFolderPath: '/ebooks',
        tags: [],
        addOptions: { searchForNewBook: true },
      });

      assert.strictEqual(result.id, 17);
      assert.strictEqual(result.mediaType, 'ebook');
      const post = requests.find(
        ({ method, path }) =>
          method === 'POST' && path === '/readarr/gr/ebook/api/v1/book'
      );
      assert.ok(post);
      assert.strictEqual(post.query.get('mediaType'), 'ebook');
      assert.strictEqual(
        (post.body as Record<string, unknown>).ebookMonitored,
        true
      );
      assert.ok(
        !requests.some(
          ({ method, path }) =>
            method === 'GET' && path === '/readarr/gr/ebook/api/v1/book'
        )
      );
      const update = requests.find(
        ({ method, path }) =>
          method === 'PUT' && path === '/readarr/gr/ebook/api/v1/book/17'
      );
      assert.ok(update);
      assert.deepStrictEqual(update.body, {
        id: 17,
        mediaType: 'ebook',
        monitored: true,
        ebookMonitored: true,
        addOptions: { searchForNewBook: true },
      });
      assert.ok(
        requests.some(
          ({ method, path }) =>
            method === 'POST' && path === '/readarr/gr/ebook/api/v1/command'
        )
      );
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});

describe('ReadarrAPI Bookshelf media moves', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('uses the bulk preview token flow and sanitizes provider responses', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      ensureProvider: () => Promise<void>;
      request: (
        method: string,
        path: string,
        data?: unknown,
        config?: unknown
      ) => Promise<{ data: unknown }>;
    };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    const requests: { method: string; path: string; data?: unknown }[] = [];
    mock.method(
      internalApi,
      'request',
      async (method: string, path: string, data?: unknown) => {
        requests.push({ method, path, data });
        if (path === '/author')
          return {
            data: [
              {
                id: 4,
                authorName: 'Octavia Butler',
                path: '/media/books',
                ebookPath: '/media/ebooks',
                audiobookPath: '/media/audiobooks',
                statistics: { bookFileCount: 3 },
              },
              { id: 'bad', authorName: 'Ignored' },
            ],
          };
        if (path === '/author/media-move/bulk/preview')
          return {
            data: {
              format: 'ebook',
              destinationRootPath: '/media/new-books',
              previewToken: 'fresh-preview-token',
              authorCount: 1,
              mediaFileCount: 1,
              sidecarFileCount: 1,
              missingFileCount: 0,
              totalSize: 100,
              requiredCopyBytes: 100,
              availableSpace: 10_000,
              canMove: true,
              warnings: [],
              conflicts: [],
              authors: [
                {
                  authorId: 4,
                  authorName: 'Octavia Butler',
                  format: 'ebook',
                  sourcePath: '/media/ebooks/Octavia Butler',
                  destinationPath: '/media/new-books/Octavia Butler',
                  mediaFileCount: 1,
                  sidecarFileCount: 1,
                  missingFileCount: 0,
                  alreadyAtDestinationCount: 0,
                  totalSize: 100,
                  requiredCopyBytes: 100,
                  canMove: true,
                  warnings: [],
                  conflicts: [],
                  files: [
                    {
                      fileType: 'media',
                      sourcePath: '/media/ebooks/book.epub',
                      destinationPath: '/media/new-books/book.epub',
                      status: 'ready',
                      sourceExists: true,
                      destinationExists: false,
                      size: 100,
                    },
                    { fileType: 'unexpected', sourcePath: 'ignored' },
                  ],
                },
              ],
            },
          };
        if (path === '/author/media-move/bulk/start')
          return {
            data: { id: 91, name: 'MoveAuthorMediaBatch', status: 'queued' },
          };
        if (path === '/command/91')
          return {
            data: {
              id: 91,
              name: 'MoveAuthorMediaBatch',
              status: 'completed',
              progress: 100,
            },
          };
        throw new Error(`Unexpected Bookshelf request: ${method} ${path}`);
      }
    );

    const authors = await api.getMediaMoveAuthors();
    assert.deepEqual(authors, [
      {
        id: 4,
        name: 'Octavia Butler',
        path: '/media/books',
        ebookPath: '/media/ebooks',
        audiobookPath: '/media/audiobooks',
        bookFileCount: 3,
      },
    ]);

    const preview = await api.previewMediaMoveBatch({
      authorIds: [4],
      format: 'ebook',
      destinationRootPath: '/media/new-books',
    });
    assert.equal(preview.previewToken, 'fresh-preview-token');
    assert.equal(preview.authors[0].files.length, 1);
    assert.equal(preview.authors[0].files[0].status, 'ready');
    assert.deepEqual(requests[1].data, {
      authorIds: [4],
      format: 'ebook',
      destinationRootPath: '/media/new-books',
    });

    const command = await api.startMediaMoveBatch({
      authorIds: [4],
      format: 'ebook',
      destinationRootPath: '/media/new-books',
      previewToken: preview.previewToken,
    });
    assert.equal(command.id, 91);
    assert.equal(command.status, 'queued');
    assert.deepEqual(requests[2].data, {
      authorIds: [4],
      format: 'ebook',
      destinationRootPath: '/media/new-books',
      previewToken: 'fresh-preview-token',
    });

    assert.equal((await api.getMediaMoveCommand(91)).status, 'completed');
    assert.deepEqual(
      requests.map(({ method, path }) => [method, path]),
      [
        ['GET', '/author'],
        ['POST', '/author/media-move/bulk/preview'],
        ['POST', '/author/media-move/bulk/start'],
        ['GET', '/command/91'],
      ]
    );
  });

  it('rejects incomplete preview responses instead of applying an ambiguous batch', async () => {
    const api = new ReadarrAPI({
      url: 'http://localhost:8787/api/v1',
      apiKey: 'key',
      mediaType: 'ebook',
    });
    const internalApi = api as unknown as {
      ensureProvider: () => Promise<void>;
      request: () => Promise<{ data: unknown }>;
    };
    mock.method(internalApi, 'ensureProvider', async () => undefined);
    mock.method(internalApi, 'request', async () => ({
      data: {
        format: 'ebook',
        destinationRootPath: '/media/new-books',
        previewToken: 'fresh-preview-token',
        authors: [],
      },
    }));

    await assert.rejects(
      api.previewMediaMoveBatch({
        authorIds: [4],
        format: 'ebook',
        destinationRootPath: '/media/new-books',
      }),
      /incomplete media-move preview/
    );
  });
});
