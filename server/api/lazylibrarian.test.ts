import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import LazyLibrarianAPI from '@server/api/lazylibrarian';
import { MAX_SAFE_REMOTE_IMAGE_BYTES } from '@server/utils/safeRemoteImage';

describe('LazyLibrarianAPI.getIssues', () => {
  afterEach(() => mock.restoreAll());

  it('reads issue dates from a LazyLibrarian magazine and caches the lookup', async () => {
    const api = new LazyLibrarianAPI({
      url: 'http://localhost:5299',
      apiKey: 'key',
    });
    const mockableApi = api as unknown as {
      get: (
        endpoint: string,
        options?: { params?: Record<string, unknown> },
        ttl?: number
      ) => Promise<unknown>;
    };
    const get = mock.method(
      mockableApi,
      'get',
      async (
        endpoint: string,
        options?: { params?: Record<string, unknown> },
        ttl?: number
      ) => {
        assert.equal(endpoint, '/api');
        assert.equal(options?.params?.cmd, 'getIssues');
        assert.equal(options?.params?.name, 'The Economist');
        assert.equal(ttl, 60);
        return {
          Success: true,
          Data: {
            magazine: [{ Title: 'The Economist' }],
            issues: [
              {
                IssueID: 'economist-2026-09-18',
                Title: 'The Economist',
                IssueNum: '18 Sep',
                IssueDate: '2026-09-18',
              },
            ],
          },
        };
      }
    );

    const result = await api.getIssues('The Economist', undefined, 60);

    assert.equal(result.magazine?.title, 'The Economist');
    assert.equal(result.issues[0].issueDate, '2026-09-18');
    assert.equal(get.mock.calls[0].arguments[2], 60);
  });
});

describe('LazyLibrarianAPI.getMagazineCover', () => {
  afterEach(() => mock.restoreAll());

  it('passes lookup cancellation through to the LazyLibrarian catalog request', async () => {
    const api = new LazyLibrarianAPI({
      url: 'http://localhost:5299',
      apiKey: 'key',
    });
    const controller = new AbortController();
    const get = mock.fn(
      async (url: string, options?: { signal?: AbortSignal }) => {
        assert.ok(url.endsWith('/api'));
        assert.strictEqual(options?.signal, controller.signal);
        return {
          data: [],
          config: {},
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      }
    );
    (
      api as unknown as {
        axios: { get: typeof get };
      }
    ).axios.get = get;

    assert.deepStrictEqual(await api.getMagazines(controller.signal), []);
    assert.strictEqual(
      get.mock.calls[0].arguments[1]?.signal,
      controller.signal
    );
  });

  it('fetches a validated magazine cover below the configured URL base', async () => {
    const api = new LazyLibrarianAPI({
      url: 'http://localhost:5299/lazy',
      apiKey: 'key',
    });
    const get = mock.fn(
      async (url: string, options?: Record<string, unknown>) => {
        assert.ok(url);
        assert.ok(options);
        return {
          data: Buffer.from('image-bytes'),
          headers: { 'content-type': 'image/jpeg; charset=binary' },
        };
      }
    );
    (
      api as unknown as {
        axios: { get: typeof get };
      }
    ).axios.get = get;

    const result = await api.getMagazineCover('A'.repeat(40));

    assert.deepStrictEqual(result, {
      imageBuffer: Buffer.from('image-bytes'),
      contentType: 'image/jpeg',
    });
    assert.strictEqual(
      get.mock.calls[0].arguments[0],
      'http://localhost:5299/lazy/cache/magazine/' + 'a'.repeat(40) + '.jpg'
    );
    const options = get.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.strictEqual(options.responseType, 'arraybuffer');
    assert.strictEqual(options.maxContentLength, MAX_SAFE_REMOTE_IMAGE_BYTES);
    assert.strictEqual(options.maxBodyLength, MAX_SAFE_REMOTE_IMAGE_BYTES);
    assert.deepStrictEqual(options.headers, { Accept: 'image/*' });
  });

  it('rejects unsafe cover IDs before making an upstream request', async () => {
    const api = new LazyLibrarianAPI({
      url: 'http://localhost:5299',
      apiKey: 'key',
    });
    const get = mock.fn(
      async (url: string, options?: Record<string, unknown>) => {
        assert.ok(url);
        assert.ok(options);
        return {
          data: Buffer.from('image-bytes'),
          headers: { 'content-type': 'image/jpeg' },
        };
      }
    );
    (
      api as unknown as {
        axios: { get: typeof get };
      }
    ).axios.get = get;

    await assert.rejects(api.getMagazineCover('../secret'), /invalid/i);
    assert.strictEqual(get.mock.callCount(), 0);
  });

  it('rejects non-raster cover responses', async () => {
    const api = new LazyLibrarianAPI({
      url: 'http://localhost:5299',
      apiKey: 'key',
    });
    const get = mock.fn(
      async (url: string, options?: Record<string, unknown>) => {
        assert.ok(url);
        assert.ok(options);
        return {
          data: Buffer.from('<svg/>'),
          headers: { 'content-type': 'image/svg+xml' },
        };
      }
    );
    (
      api as unknown as {
        axios: { get: typeof get };
      }
    ).axios.get = get;

    await assert.rejects(api.getMagazineCover('b'.repeat(32)), /raster image/i);
  });
});

describe('LazyLibrarian authoritative issue inventories', () => {
  afterEach(() => mock.restoreAll());
  for (const data of [
    {},
    [],
    { issues: {} },
    { issues: [null] },
    { issues: [{}] },
    { issues: [{ Title: 'The Economist', IssueFile: true }] },
    { issues: [], magazine: { Title: 'A different magazine' } },
    { issues: Array(10001).fill({ Title: 'The Economist' }) },
  ]) {
    it(`rejects malformed, unrelated or truncated absence evidence ${Array.isArray(data) ? 'array' : Object.keys(data).join(',')}`, async () => {
      const api = new LazyLibrarianAPI({
        url: 'http://localhost:5299',
        apiKey: 'test',
      });
      mock.method(
        api as unknown as { get: () => Promise<unknown> },
        'get',
        async () => data
      );
      await assert.rejects(
        api.getIssues('The Economist', undefined, 0, { strict: true }),
        /file absence could not be verified/
      );
    });
  }
  it('accepts explicit empty, wanted and downloaded inventories for the requested title', async () => {
    for (const issues of [
      [],
      [{ Title: 'The Economist' }],
      [{ Title: 'The Economist', IssueFile: null }],
      [{ Title: 'The Economist', IssueFile: '/magazine/issue.pdf' }],
    ]) {
      const api = new LazyLibrarianAPI({
        url: 'http://localhost:5299',
        apiKey: 'test',
      });
      const get = mock.method(
        api as unknown as { get: () => Promise<unknown> },
        'get',
        async () => ({ magazine: { Title: '  THE ECONOMIST ' }, issues })
      );
      const result = await api.getIssues('The Economist', undefined, 0, {
        strict: true,
      });
      assert.equal(result.issues.length, issues.length);
      get.mock.restore();
    }
  });
});

it('does not turn a numeric file marker into a downloaded file path in detail responses', async () => {
  const api = new LazyLibrarianAPI({
    url: 'http://localhost:5299',
    apiKey: 'test',
  });
  const get = mock.method(
    api as unknown as { get: () => Promise<unknown> },
    'get',
    async () => ({ issues: [{ Title: 'The Economist', IssueFile: 0 }] })
  );
  try {
    assert.equal(
      (await api.getIssues('The Economist')).issues[0].issueFile,
      undefined
    );
  } finally {
    get.mock.restore();
  }
});
