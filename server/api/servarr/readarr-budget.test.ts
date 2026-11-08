import ReadarrAPI from '@server/api/servarr/readarr';
import { withBookLookupBudget } from '@server/lib/bookLookupBudget';
import type { ReadarrSettings } from '@server/lib/settings';
import {
  getBookshelfBookDetails,
  makeBookshelfBookId,
} from '@server/utils/bookshelfCatalog';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { it } from 'node:test';

const fixture = async (delay: number, empty = false, retryAfter = false) => {
  const requests: {
    path: string;
    term: string | null;
    key: string | undefined;
  }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const term = url.searchParams.get('term');
    requests.push({
      path: url.pathname,
      term,
      key: req.headers['x-api-key'] as string | undefined,
    });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/system/status'))
      return res.end(
        JSON.stringify({ appName: 'Chaptarr', version: '0.9.978' })
      );
    if (url.pathname.endsWith('/system/capabilities'))
      return res.end(
        JSON.stringify({
          contract: 'chaptarrng-seerr-bookshelf',
          contractVersion: 1,
          providerIdDialect: 'hc',
          features: {
            formatScopedFacade: true,
            providerScopedEditionIdentity: true,
          },
        })
      );
    if (retryAfter) {
      res.statusCode = 503;
      res.setHeader('Retry-After', '21600');
      return res.end(JSON.stringify({ message: 'Provider busy' }));
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      res.end(
        JSON.stringify(
          empty
            ? []
            : [
                {
                  foreignBookId: term,
                  title: 'Budget Fixture',
                  author: {
                    foreignAuthorId: 'hc:author:1',
                    authorName: 'Fixture',
                  },
                  editions: [
                    { foreignEditionId: 'hc:edition:1', isEbook: true },
                  ],
                },
              ]
        )
      );
    }, delay);
    timers.add(timer);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const settings = {
    id: 61,
    hostname: '127.0.0.1',
    port: address.port,
    useSsl: false,
    baseUrl: '',
    apiKey: 'budget-key',
    serviceType: 'ebook',
  } as ReadarrSettings;
  return {
    requests,
    settings,
    api: (format: 'ebook' | 'audiobook' = 'ebook', key = 'budget-key') =>
      new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: key,
        mediaType: format,
      }),
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
};

it('lookup budget accepts a 15-second Hardcover success and coalesces identical detail reads', async () => {
  const f = await fixture(15000);
  try {
    const id = makeBookshelfBookId(f.settings.id, '427578');
    const started = Date.now();
    const results = await Promise.all([
      getBookshelfBookDetails([f.settings], id),
      getBookshelfBookDetails([f.settings], id),
    ]);
    assert.ok(Date.now() - started >= 14500);
    assert.ok(Date.now() - started < 24000);
    assert.ok(
      results.every((r) => r?.id === id && r.title === 'Budget Fixture')
    );
    const calls = f.requests.filter((r) => r.path.endsWith('/book/lookup'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].term, 'hc:427578');
    assert.match(calls[0].path, /\/hc\/ebook\//);
  } finally {
    await f.close();
  }
});

it('lookup budget aborts a 60-second provider response without starting alternate fallbacks', async () => {
  const f = await fixture(60000);
  try {
    const started = Date.now();
    await assert.rejects(
      withBookLookupBudget(() => f.api().lookupBook('hc:999'), 300)
    );
    assert.ok(Date.now() - started < 2000);
    assert.equal(
      f.requests.filter((r) => r.path.endsWith('/book/lookup')).length,
      1
    );
  } finally {
    await f.close();
  }
});

it('lookup coalescing preserves destination format and credential boundaries', async () => {
  const f = await fixture(40);
  try {
    await Promise.all([
      f.api().lookupBook('hc:71'),
      f.api('audiobook').lookupBook('hc:71'),
      f.api('ebook', 'another-key').lookupBook('hc:71'),
    ]);
    const calls = f.requests.filter((r) => r.path.endsWith('/book/lookup'));
    assert.equal(calls.length, 3);
    assert.equal(calls.filter((r) => r.path.includes('/audiobook/')).length, 1);
    assert.equal(calls.filter((r) => r.key === 'another-key').length, 1);
  } finally {
    await f.close();
  }
});

it('known Hardcover identity miss never switches into Goodreads', async () => {
  const f = await fixture(1, true);
  try {
    assert.deepEqual(await f.api().lookupBook('hc:71'), []);
    const calls = f.requests.filter((r) => r.path.endsWith('/book/lookup'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].term, 'hc:71');
  } finally {
    await f.close();
  }
});

it('lookup budget cancels Retry-After sleep as well as the HTTP socket', async () => {
  const f = await fixture(0, false, true);
  try {
    const started = Date.now();
    await assert.rejects(
      withBookLookupBudget(() => f.api().lookupBook('hc:999'), 100)
    );
    assert.ok(Date.now() - started < 1000);
    assert.equal(
      f.requests.filter((r) => r.path.endsWith('/book/lookup')).length,
      1
    );
  } finally {
    await f.close();
  }
});

it('legacy Chaptarr can still use its native lookup when provider facades have no index', async () => {
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    res.setHeader('Content-Type', 'application/json');
    if (path.endsWith('/system/status'))
      return res.end(
        JSON.stringify({ appName: 'Chaptarr', version: '0.9.911' })
      );
    if (path.endsWith('/system/capabilities')) {
      res.statusCode = 404;
      return res.end('{}');
    }
    if (path.endsWith('/config/hardcover')) return res.end('{"enabled":true}');
    res.end(
      JSON.stringify(
        path === '/api/v1/book/lookup'
          ? [
              {
                foreignBookId: 'hc:71',
                title: 'Legacy',
                mediaType: 'ebook',
                author: {
                  foreignAuthorId: 'hc:author:1',
                  authorName: 'Fixture',
                },
                editions: [{ foreignEditionId: 'hc:edition:1' }],
              },
            ]
          : []
      )
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const a = server.address();
  assert.ok(a && typeof a !== 'string');
  try {
    const api = new ReadarrAPI({
      url: `http://127.0.0.1:${a.port}/api/v1`,
      apiKey: 'legacy',
      mediaType: 'ebook',
    });
    assert.equal(
      (await api.lookupBookByProviderIdentity('71'))?.foreignBookId,
      'hc:71'
    );
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
