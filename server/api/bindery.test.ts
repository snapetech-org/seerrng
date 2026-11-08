import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import BinderyAPI from '@server/api/bindery';
import type { ReadarrSettings } from '@server/lib/settings';

const fixturePath = join(__dirname, '../test/fixtures/bindery');
const fixture = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(fixturePath, name), 'utf8'));

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
    : undefined;
};

const withBinderyServer = async <T>(
  handler: (
    request: IncomingMessage,
    response: ServerResponse
  ) => void | Promise<void>,
  callback: (port: number) => Promise<T>
): Promise<T> => {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error) => {
      response.destroy(
        error instanceof Error ? error : new Error(String(error))
      );
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    return await callback(address.port);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
};

const makeSettings = (
  port: number,
  overrides: Partial<ReadarrSettings> = {}
): ReadarrSettings =>
  ({
    id: 1,
    name: 'Bindery',
    hostname: '127.0.0.1',
    port,
    apiKey: 'recorded-bindery-key',
    useSsl: false,
    baseUrl: '/bindery',
    activeProfileId: 0,
    activeProfileName: 'Bindery managed',
    activeDirectory: '/',
    tags: [],
    is4k: false,
    isDefault: true,
    syncEnabled: true,
    preventSearch: true,
    tagRequests: false,
    overrideRule: [],
    backend: 'bindery',
    serviceType: 'both',
    ...overrides,
  }) as ReadarrSettings;

describe('BinderyAPI', () => {
  it('uses the API-key header, URL base, and recorded system status', async () => {
    const statusFixture = await fixture('system-status.json');
    let received: { path?: string; apiKey?: string; queryKey?: string | null } =
      {};
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      received = {
        path: `${url.pathname}${url.search}`,
        apiKey: String(request.headers['x-api-key'] ?? ''),
        queryKey: url.searchParams.get('apikey'),
      };
      writeJson(response, 200, statusFixture);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const status = await new BinderyAPI(
        makeSettings(address.port)
      ).getSystemStatus();
      assert.equal(status.version, '1.37.0');
      assert.deepEqual(received, {
        path: '/bindery/api/v1/system/status',
        apiKey: 'recorded-bindery-key',
        queryKey: null,
      });
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('detects only an explicit per-user request capability', async () => {
    const api = new BinderyAPI(makeSettings(8787));
    const legacy = (await fixture('system-status.json')) as Parameters<
      BinderyAPI['supportsForUserRequests']
    >[0];
    const capable = (await fixture(
      'system-status-for-user.json'
    )) as Parameters<BinderyAPI['supportsForUserRequests']>[0];

    assert.equal(api.supportsForUserRequests(legacy), false);
    assert.equal(api.supportsForUserRequests(capable), true);
    assert.equal(
      api.supportsForUserRequests({ features: { requestsForUser: 'true' } }),
      false
    );
  });

  it('uses the Open Library default when the primary provider setting is absent', async () => {
    await withBinderyServer(
      (request, response) => {
        assert.equal(
          request.url,
          '/bindery/api/v1/setting/metadata.primary_provider'
        );
        assert.equal(request.headers['x-api-key'], 'recorded-bindery-key');
        writeJson(response, 404, { error: 'setting not found' });
      },
      async (port) => {
        assert.equal(
          await new BinderyAPI(makeSettings(port)).getPrimaryMetadataProvider(),
          'openlibrary'
        );
      }
    );
  });

  for (const status of [401, 403, 429, 500, 503]) {
    it(`preserves primary provider failures with HTTP ${status}`, async () => {
      await withBinderyServer(
        (_request, response) => {
          writeJson(response, status, { error: 'unavailable' });
        },
        async (port) => {
          await assert.rejects(
            new BinderyAPI(makeSettings(port)).getPrimaryMetadataProvider(),
            { status }
          );
        }
      );
    });
  }

  it('uses Bindery lookup and book-management response fixtures', async () => {
    const lookupFixture = await fixture('book-lookup.json');
    const providerFixture = await fixture('metadata-provider.json');
    const addedFixture = await fixture('book-added.json');
    const received: { method: string; path: string; body?: unknown }[] = [];
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const body = await readBody(request);
      received.push({
        method: request.method ?? 'GET',
        path: `${url.pathname}${url.search}`,
        ...(body === undefined ? {} : { body }),
      });
      if (url.pathname.endsWith('/setting/metadata.primary_provider')) {
        writeJson(response, 200, providerFixture);
      } else if (url.pathname.endsWith('/book/lookup')) {
        writeJson(response, 200, lookupFixture);
      } else if (url.pathname.endsWith('/author/book')) {
        writeJson(response, 201, addedFixture);
      } else {
        writeJson(response, 404, { error: 'not found' });
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const api = new BinderyAPI(makeSettings(address.port));
      assert.equal(await api.getPrimaryMetadataProvider(), 'openlibrary');
      assert.equal(
        (await api.lookupBookByIsbn('9780547928227'))?.foreignBookId,
        'OL27448W'
      );
      const added = await api.addBook({
        foreignBookId: 'OL27448W',
        foreignAuthorId: 'OL23919A',
        authorName: 'J. R. R. Tolkien',
        mediaType: 'ebook',
        searchOnAdd: true,
      });
      assert.equal(added.id, 42);
      assert.deepEqual(received[2], {
        method: 'POST',
        path: '/bindery/api/v1/author/book',
        body: {
          foreignBookId: 'OL27448W',
          foreignAuthorId: 'OL23919A',
          authorName: 'J. R. R. Tolkien',
          mediaType: 'ebook',
          searchOnAdd: true,
        },
      });
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('accepts provider search results without a local Bindery row ID', async () => {
    const searchFixture = await fixture('search-books.json');
    const server = createServer((_request, response) => {
      writeJson(response, 200, searchFixture);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const results = await new BinderyAPI(
        makeSettings(address.port)
      ).searchBooks('The Hobbit');
      assert.deepEqual(results, [
        {
          foreignBookId: 'OL27448W',
          title: 'The Hobbit',
          authorName: 'J. R. R. Tolkien',
        },
      ]);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('paginates imported formats and refuses a repeated or malformed page', async () => {
    const first = await fixture('library-page-first.json');
    const second = await fixture('library-page-second.json');
    const requestedOffsets: string[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      requestedOffsets.push(url.searchParams.get('offset') ?? '');
      writeJson(
        response,
        200,
        url.searchParams.get('offset') === '0' ? first : second
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const books = await new BinderyAPI(
        makeSettings(address.port)
      ).getImportedBooks('ebook');
      assert.deepEqual(
        books.map(({ id }) => id),
        [42, 43]
      );
      assert.deepEqual(requestedOffsets, ['0', '100']);
      await assert.rejects(
        new BinderyAPI(
          makeSettings(address.port, { serviceType: 'ebook' })
        ).getImportedBooks('audiobook'),
        /not configured for audiobook/
      );
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('sends per-user request fields only through the dedicated capability path', async () => {
    const created = await fixture('request-created.json');
    let receivedBody: unknown;
    const server = createServer(async (request, response) => {
      receivedBody = await readBody(request);
      writeJson(response, 201, created);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const result = await new BinderyAPI(
        makeSettings(address.port)
      ).createUserRequest(
        {
          foreignBookId: 'OL27448W',
          mediaType: 'audiobook',
          searchOnAdd: true,
        },
        8
      );
      assert.equal(result.status, 'approved');
      assert.deepEqual(receivedBody, {
        kind: 'book',
        foreignId: 'OL27448W',
        mediaType: 'audiobook',
        forUser: 8,
      });
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('maps Bindery users and reads request and acquisition queue projections', async () => {
    const usersFixture = await fixture('users.json');
    const requestsFixture = await fixture('request-queue.json');
    const queueFixture = await fixture('download-queue.json');
    const received: { method: string; path: string; apiKey?: string }[] = [];
    await withBinderyServer(
      async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        received.push({
          method: request.method ?? 'GET',
          path: `${url.pathname}${url.search}`,
          apiKey: String(request.headers['x-api-key'] ?? ''),
        });
        if (url.pathname.endsWith('/auth/users')) {
          writeJson(response, 200, usersFixture);
        } else if (url.pathname.endsWith('/requests/queue')) {
          writeJson(response, 200, requestsFixture);
        } else if (url.pathname.endsWith('/queue')) {
          writeJson(response, 200, queueFixture);
        } else {
          writeJson(response, 404, { error: 'not found' });
        }
      },
      async (port) => {
        const api = new BinderyAPI(makeSettings(port));
        assert.deepEqual(await api.getUsers(), [
          { id: 7, username: 'reader-one' },
          { id: 8, username: 'reader-two', email: 'reader@example.test' },
        ]);

        const requestQueue = await api.getRequestsById(new Set([91]));
        assert.equal(requestQueue.complete, true);
        assert.equal(requestQueue.requests.get(91)?.status, 'approved');
        assert.equal(requestQueue.requests.get(91)?.resultBookId, 55);

        assert.deepEqual(await api.getQueue(), [
          {
            id: 601,
            bookId: 55,
            status: 'downloading',
            trackedDownloadStatus: 'ok',
          },
          { id: 602, bookId: 56, status: 'importing' },
        ]);
      }
    );

    assert.deepEqual(
      received.map(({ path }) => path),
      [
        '/bindery/api/v1/auth/users',
        '/bindery/api/v1/requests/queue?status=all&limit=200&offset=0',
        '/bindery/api/v1/queue',
      ]
    );
    assert.ok(
      received.every(({ apiKey }) => apiKey === 'recorded-bindery-key')
    );
  });

  it('paginates Bindery requests and reports incomplete target rows safely', async () => {
    const offsets: string[] = [];
    await withBinderyServer(
      (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const offset = Number(url.searchParams.get('offset'));
        offsets.push(String(offset));
        if (offset === 0) {
          writeJson(response, 200, {
            items: Array.from({ length: 200 }, (_, index) => ({
              id: 300 + index,
              kind: 'author',
              foreignId: `author-${index}`,
              mediaType: '',
              status: 'pending',
            })),
            total: 201,
            limit: 200,
            offset,
          });
        } else {
          writeJson(response, 200, {
            items: [
              {
                id: 91,
                kind: 'book',
                foreignId: 'OL27448W',
                mediaType: 'ebook',
                status: 'pending',
              },
            ],
            total: 201,
            limit: 200,
            offset,
          });
        }
      },
      async (port) => {
        const snapshot = await new BinderyAPI(
          makeSettings(port)
        ).getRequestsById(new Set([91]));
        assert.equal(snapshot.complete, true);
        assert.equal(snapshot.requests.get(91)?.status, 'pending');
      }
    );
    assert.deepEqual(offsets, ['0', '200']);

    await withBinderyServer(
      (_request, response) => {
        writeJson(response, 200, {
          items: [
            {
              id: 91,
              kind: 'book',
              foreignId: 'OL27448W',
              mediaType: 'unknown',
              status: 'pending',
            },
          ],
          total: 1,
          limit: 200,
          offset: 0,
        });
      },
      async (port) => {
        const snapshot = await new BinderyAPI(
          makeSettings(port)
        ).getRequestsById(new Set([91]));
        assert.equal(snapshot.complete, false);
        assert.equal(snapshot.requests.size, 0);
      }
    );
  });

  it('declines only a validated Bindery request with the requested reason', async () => {
    const received: { path: string; body?: unknown }[] = [];
    await withBinderyServer(
      async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const body = await readBody(request);
        received.push({
          path: `${url.pathname}${url.search}`,
          ...(body === undefined ? {} : { body }),
        });
        writeJson(response, 200, {
          id: 91,
          kind: 'book',
          foreignId: 'OL27448W',
          mediaType: 'ebook',
          status: 'declined',
        });
      },
      async (port) => {
        await new BinderyAPI(makeSettings(port)).declineRequest(
          91,
          'Withdrawn in SeerrNG.'
        );
      }
    );
    assert.deepEqual(received, [
      {
        path: '/bindery/api/v1/requests/91/decline',
        body: { reason: 'Withdrawn in SeerrNG.' },
      },
    ]);
  });

  it('rejects incomplete user lists and invalid user or withdrawal inputs', async () => {
    const received: string[] = [];
    await withBinderyServer(
      (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        received.push(url.pathname);
        writeJson(response, 200, {
          users: [{ id: 'invalid', username: 'reader-one' }],
        });
      },
      async (port) => {
        const api = new BinderyAPI(makeSettings(port));
        await assert.rejects(
          api.createUserRequest(
            {
              foreignBookId: 'OL27448W',
              mediaType: 'ebook',
              searchOnAdd: true,
            },
            0
          ),
          /user ID is invalid/
        );
        await assert.rejects(
          api.declineRequest(91, ' '.repeat(1)),
          /withdrawal reason is invalid/
        );
        await assert.rejects(
          api.declineRequest(91, 'x'.repeat(513)),
          /withdrawal reason is invalid/
        );
        await assert.rejects(api.getUsers(), /invalid user account/);
      }
    );
    assert.deepEqual(received, ['/bindery/api/v1/auth/users']);
  });
});
