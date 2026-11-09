import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { AxiosError } from 'axios';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ReadarrSettings } from '@server/lib/settings';
import BookOrbitAPI from './bookorbit';

class InspectBookOrbitAPI extends BookOrbitAPI {
  public calls: {
    method: string;
    path: string;
    body?: unknown;
    config?: AxiosRequestConfig;
  }[] = [];
  public constructor(private responses: unknown[]) {
    super({
      backend: 'bookorbit',
      bookorbitUsername: 'requester',
      apiKey: 'secret',
      hostname: 'localhost',
      port: 3000,
      useSsl: false,
      baseUrl: '',
    } as ReadarrSettings);
  }
  protected override async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    this.calls.push({ method, path, body, config });
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return { data: response as T } as AxiosResponse<T>;
  }
}

const request = (id: number, mediaKind: 'ebook' | 'audiobook') => ({
  id,
  userId: 4,
  status: 'pending',
  mediaKind,
  matchedBookId: null,
});

describe('BookOrbit acquisition contract', () => {
  it('re-authenticates a stale token before removing its subscription', async () => {
    const api = new InspectBookOrbitAPI([
      { accessToken: 'expired' },
      new AxiosError('Expired', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
      } as AxiosResponse),
      { accessToken: 'fresh' },
      undefined,
    ]);
    await api.unsubscribe(42);
    assert.deepEqual(
      api.calls.map((call) => [call.method, call.path]),
      [
        ['POST', '/api/v1/auth/login'],
        ['DELETE', '/api/v1/book-requests/42/subscription'],
        ['POST', '/api/v1/auth/login'],
        ['DELETE', '/api/v1/book-requests/42/subscription'],
      ]
    );
    assert.equal(api.calls[3].config?.headers?.Authorization, 'Bearer fresh');
  });
  it('tests a requester account and a library read before enabling the connection', async () => {
    const api = new InspectBookOrbitAPI([
      { accessToken: 'token' },
      { version: '1.2.3' },
      { id: 4, permissions: ['book_request_access'] },
      { items: [], total: 0 },
    ]);
    assert.deepEqual(await api.testConnection(), {
      version: '1.2.3',
      userId: 4,
    });
    assert.deepEqual(
      api.calls.map(({ method, path }) => [method, path]),
      [
        ['POST', '/api/v1/auth/login'],
        ['GET', '/api/v1/app-info'],
        ['GET', '/api/v1/auth/me'],
        ['POST', '/api/v1/books/query'],
      ]
    );
    assert.equal(
      (api.calls[0].body as { password: string }).password,
      'secret'
    );
    assert.deepEqual(api.calls[3].config?.headers, {
      Authorization: 'Bearer token',
    });
  });

  it('submits both formats as one pair and rejects mismatched response shapes', async () => {
    const api = new InspectBookOrbitAPI([
      { accessToken: 'token' },
      {
        ebook: { request: request(7, 'ebook') },
        audiobook: { request: request(8, 'audiobook') },
      },
    ]);
    const result = await api.submitPair({
      title: 'Orbit',
      authors: ['Writer'],
    });
    assert.equal(result.ebook.id, 7);
    assert.equal(result.audiobook.id, 8);
    assert.equal(api.calls[1].path, '/api/v1/book-requests/pairs');
    assert.deepEqual(api.calls[1].body, {
      title: 'Orbit',
      authors: ['Writer'],
    });
    const invalid = new InspectBookOrbitAPI([
      { accessToken: 'token' },
      { ebook: { request: request(7, 'ebook') } },
    ]);
    await assert.rejects(
      invalid.submitPair({ title: 'Orbit', authors: [] }),
      /invalid request pair/
    );
  });

  it('scans format-specific inventory without treating metadata and covers as releases', async () => {
    const api = new InspectBookOrbitAPI([
      { accessToken: 'token' },
      {
        items: [
          {
            id: 5,
            title: 'Orbit',
            authors: ['Writer'],
            files: [
              { id: 10, format: 'epub', role: 'content' },
              { id: 11, format: 'm4b', role: 'content' },
              { id: 12, format: 'jpg', role: 'cover' },
            ],
          },
        ],
        total: 1,
      },
    ]);
    const books = await api.getImportedBooks('audiobook');
    assert.equal(books.length, 1);
    assert.equal(BookOrbitAPI.hasFormat(books[0], 'ebook'), true);
    assert.equal(BookOrbitAPI.hasFormat(books[0], 'audiobook'), true);
    assert.equal(api.calls[1].path, '/api/v1/books/query');
  });
});
