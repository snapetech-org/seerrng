import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import KavitaAPI from '@server/api/kavita';

const servers: Server[] = [];

const startKavita = async (
  handler: (
    url: URL,
    auth: string | undefined,
    method: string
  ) => { status?: number; body: unknown }
) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const { status = 200, body } = handler(
      url,
      request.headers.authorization,
      request.method ?? 'GET'
    );
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return address.port;
};

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  );
});

describe('KavitaAPI', () => {
  it('signs in with the auth key, then pages series with the token', async () => {
    const seen: string[] = [];
    let tokens = 0;
    const port = await startKavita((url, auth, method) => {
      seen.push(`${method} ${url.pathname}${url.search} ${auth ?? '-'}`);
      if (url.pathname === '/kv/api/Plugin/authenticate') {
        tokens += 1;
        return { body: { username: 'reader', token: `jwt-${tokens}` } };
      }
      if (url.pathname === '/kv/api/Library/libraries') {
        return {
          body: [
            { id: 1, name: 'Manga', type: 0, folders: ['/manga'] },
            { id: 2, name: 'Comics', type: 1, folders: ['/comics'] },
            { id: 'bad', name: 'Broken' },
          ],
        };
      }
      if (url.pathname === '/kv/api/Series/all-v2') {
        const page = Number(url.searchParams.get('PageNumber'));
        const rows =
          page === 1
            ? Array.from({ length: 500 }, (_, i) => ({
                id: i + 1,
                libraryId: 1,
                name: `Series ${i + 1}`,
              }))
            : [
                {
                  id: 9001,
                  libraryId: 2,
                  name: 'Watchmen',
                  folderPath: '/comics/DC Comics/Watchmen (1986)',
                  comicVineId: '3344',
                },
              ];
        return { body: rows };
      }
      return { status: 404, body: {} };
    });

    const api = new KavitaAPI({
      hostname: '127.0.0.1',
      port,
      useSsl: false,
      baseUrl: '/kv',
      apiKey: 'auth-key',
    });
    const libraries = await api.getLibraries();
    assert.deepEqual(
      libraries.map((library) => [library.id, library.type, library.folders]),
      [
        [1, 0, ['/manga']],
        [2, 1, ['/comics']],
      ]
    );
    const series = await api.getAllSeries();
    assert.equal(series.length, 501);
    assert.equal(series[500].folderPath, '/comics/DC Comics/Watchmen (1986)');
    assert.equal(series[500].comicVineId, '3344');
    assert.equal(tokens, 1, 'one sign-in for every call');
    assert.equal(
      seen[0],
      'POST /kv/api/Plugin/authenticate?apiKey=auth-key&pluginName=SeerrNG -'
    );
    assert.ok(
      seen.slice(1).every((line) => line.endsWith('Bearer jwt-1')),
      seen.join('\n')
    );
    assert.ok(
      seen.includes(
        'POST /kv/api/Series/all-v2?PageNumber=2&PageSize=500 Bearer jwt-1'
      )
    );
  });

  it('signs in again once when the token has expired', async () => {
    let tokens = 0;
    const port = await startKavita((url, auth) => {
      if (url.pathname === '/api/Plugin/authenticate') {
        tokens += 1;
        return { body: { token: `jwt-${tokens}` } };
      }
      if (auth !== 'Bearer jwt-2') return { status: 401, body: {} };
      return { body: [] };
    });
    const api = new KavitaAPI({
      hostname: '127.0.0.1',
      port,
      useSsl: false,
      apiKey: 'auth-key',
    });
    assert.deepEqual(await api.getLibraries(), []);
    assert.equal(tokens, 2);
  });

  it('fails clearly on a wrong auth key', async () => {
    const port = await startKavita(() => ({ status: 401, body: {} }));
    const api = new KavitaAPI({
      hostname: '127.0.0.1',
      port,
      useSsl: false,
      apiKey: 'wrong',
    });
    await assert.rejects(api.getLibraries());
  });

  it('builds series pages on the external address', () => {
    assert.equal(
      KavitaAPI.buildSeriesUrl(
        {
          hostname: '192.168.1.5',
          port: 5000,
          useSsl: false,
          baseUrl: '/kavita',
          externalUrl: 'https://manga.example.com/',
        },
        3,
        42
      ),
      'https://manga.example.com/library/3/series/42'
    );
    assert.equal(
      KavitaAPI.buildSeriesUrl(
        {
          hostname: '192.168.1.5',
          port: 5000,
          useSsl: false,
          baseUrl: '/kavita/',
        },
        3,
        42
      ),
      'http://192.168.1.5:5000/kavita/library/3/series/42'
    );
  });
});
