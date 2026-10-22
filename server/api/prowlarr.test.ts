import {
  DEFAULT_PROWLARR_CATEGORY_MAPPINGS,
  defaultProwlarrCategoryMappings,
} from '@server/constants/prowlarr';
import {
  sanitizeProwlarrSearchResource,
  summarizeProwlarrCoverage,
} from '@server/lib/prowlarr';
import type { ProwlarrSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { it } from 'node:test';
import ProwlarrAPI from './prowlarr';

const settings = (port: number): ProwlarrSettings => ({
  hostname: '127.0.0.1',
  port,
  useSsl: false,
  baseUrl: '/prowlarr',
  apiKey: 'test-prowlarr-key',
  categoryMappings: defaultProwlarrCategoryMappings(),
});

it('queries Prowlarr with repeated categories, a typed search, and a header API key', async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    assert.equal(url.pathname, '/prowlarr/api/v1/search');
    assert.equal(url.searchParams.get('query'), 'Dune');
    assert.equal(url.searchParams.get('type'), 'movie');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('offset'), '50');
    assert.deepEqual(url.searchParams.getAll('categories'), ['2000', '2010']);
    assert.deepEqual(url.searchParams.getAll('indexerIds'), ['5', '7']);
    assert.equal(request.headers['x-api-key'], 'test-prowlarr-key');
    assert.equal(url.searchParams.has('apikey'), false);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify([{ title: 'Dune 2021' }]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const api = new ProwlarrAPI(
      settings((server.address() as AddressInfo).port)
    );
    const results = await api.search(
      'Dune',
      [2000, 2010],
      50,
      50,
      'movie',
      [5, 7]
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Dune 2021');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('sends only the Prowlarr release identity to the configured download client', async () => {
  let received: unknown;
  const server = createServer((request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/prowlarr/api/v1/search');
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      received = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const api = new ProwlarrAPI(
      settings((server.address() as AddressInfo).port)
    );
    const release = {
      guid: 'https://tracker.example/release/5',
      indexerId: 5,
    };
    assert.deepEqual(await api.grab(release), release);
    assert.deepEqual(received, release);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('reads indexer health and force-tests a Prowlarr indexer without changing settings', async () => {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    calls.push(`${request.method} ${url.pathname}`);
    assert.equal(request.headers['x-api-key'], 'test-prowlarr-key');
    if (url.pathname.endsWith('/indexerstatus')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify([
          {
            id: 3,
            disabledTill: '2026-09-28T12:00:00Z',
            mostRecentFailure: '2026-09-28T11:00:00Z',
          },
        ])
      );
      return;
    }

    assert.equal(url.pathname.endsWith('/indexer/test'), true);
    assert.equal(url.searchParams.get('forceTest'), 'true');
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      assert.deepEqual(JSON.parse(body), {
        id: 3,
        name: 'Example indexer',
        enable: true,
        supportsSearch: true,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify('{}'));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const api = new ProwlarrAPI(
      settings((server.address() as AddressInfo).port)
    );
    const statuses = await api.getIndexerStatuses();
    assert.equal(statuses[0].id, 3);
    const testResult = await api.testIndexer({
      id: 3,
      name: 'Example indexer',
      enable: true,
      supportsSearch: true,
    });
    if (typeof testResult === 'string') assert.equal(testResult, '{}');
    else assert.deepEqual(testResult, {});
    assert.deepEqual(calls, [
      'GET /prowlarr/api/v1/indexerstatus',
      'POST /prowlarr/api/v1/indexer/test',
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('uses the configured reverse-proxy base path and API v1 prefix', () => {
  assert.equal(
    ProwlarrAPI.buildUrl({
      hostname: 'prowlarr.local',
      port: 9696,
      useSsl: true,
      baseUrl: '/indexers',
    }),
    'https://prowlarr.local:9696/indexers/api/v1'
  );
});

it('uses media-specific standard categories across every search medium', () => {
  const mappings = defaultProwlarrCategoryMappings();

  assert.deepEqual(mappings.music, [3000]);
  assert.deepEqual(mappings.ebook, [7020]);
  assert.deepEqual(mappings.audiobook, [3030]);
  assert.deepEqual(mappings.comic, [7030]);
  assert.deepEqual(mappings.magazine, [7010]);
  assert.deepEqual(
    mappings.retro,
    [1010, 1020, 1030, 1040, 1050, 1060, 1070, 1080, 1110, 1120, 1130]
  );
  assert.deepEqual(mappings.modern, [1090, 1140, 1180]);
  assert.deepEqual(mappings.game, [4000]);
});

it('counts searchable indexers by selected standard category groups', () => {
  const coverage = summarizeProwlarrCoverage(
    [
      {
        id: 1,
        name: 'Video and Books',
        enable: true,
        supportsSearch: true,
        protocol: 'torrent',
        capabilities: {
          categories: [
            { id: 2010, name: 'Movies/Foreign' },
            {
              id: 7000,
              name: 'Books',
              subCategories: [{ id: 7030, name: 'Books/Comics' }],
            },
          ],
        },
      },
      {
        id: 2,
        name: 'Disabled Music',
        enable: false,
        supportsSearch: true,
        protocol: 'torrent',
        capabilities: { categories: [{ id: 3000, name: 'Audio' }] },
      },
      {
        id: 3,
        name: 'RSS only',
        enable: true,
        supportsSearch: false,
        protocol: 'usenet',
        capabilities: { categories: [{ id: 5000, name: 'TV' }] },
      },
      {
        id: 4,
        name: 'Audio indexer',
        enable: true,
        supportsSearch: true,
        protocol: 'usenet',
        capabilities: {
          categories: [
            { id: 3010, name: 'Audio/MP3' },
            { id: 3030, name: 'Audio/Audiobook' },
            { id: 3040, name: 'Audio/Lossless' },
          ],
        },
      },
    ],
    DEFAULT_PROWLARR_CATEGORY_MAPPINGS
  );

  assert.equal(coverage.totalIndexers, 4);
  assert.equal(coverage.enabledSearchableIndexers, 2);
  assert.equal(coverage.categories.movie, 1);
  assert.equal(coverage.categories.comic, 1);
  assert.equal(coverage.categories.ebook, 0);
  assert.equal(coverage.categories.audiobook, 1);
  assert.equal(coverage.categories.music, 1);
  assert.equal(coverage.categories.tv, 0);
});

it('hides indexer identity by default and only exposes a sanitized detail link when enabled', () => {
  const result = sanitizeProwlarrSearchResource({
    title: '  Example release  ',
    indexer: 'Example indexer',
    indexerId: 5,
    size: 1024,
    seeders: 12,
    leechers: null,
    grabs: 22,
    protocol: 'Torrent',
    publishDate: '2026-09-28T12:00:00.000Z',
    infoUrl:
      'https://tracker.example/details.php?id=5&apikey=private&pass_key=private&view=full',
    categories: [{ id: 7030, name: 'Books/Comics' }],
  });

  assert.deepEqual(result, {
    title: 'Example release',
    size: 1024,
    seeders: 12,
    leechers: null,
    grabs: 22,
    protocol: 'torrent',
    publishDate: '2026-09-28T12:00:00.000Z',
    infoUrl: null,
    grabId: null,
    categories: [{ id: 7030, name: 'Books/Comics' }],
  });

  const withDetails = sanitizeProwlarrSearchResource(
    {
      indexer: 'Example indexer',
      infoUrl:
        'https://tracker.example/details.php?id=5&apikey=private&view=full',
    },
    { includeIndexerDetails: true, grabId: 'opaque-handle' }
  );
  assert.equal(withDetails.indexer, 'Example indexer');
  assert.equal(
    withDetails.infoUrl,
    'https://tracker.example/details.php?id=5&view=full'
  );
  assert.equal(withDetails.grabId, 'opaque-handle');

  const unsafeLink = sanitizeProwlarrSearchResource({
    title: 'Unsafe',
    infoUrl: 'javascript:alert(1)',
  });
  assert.equal(unsafeLink.infoUrl, null);
  assert.equal('downloadUrl' in unsafeLink, false);
  assert.equal('magnetUrl' in unsafeLink, false);
});
