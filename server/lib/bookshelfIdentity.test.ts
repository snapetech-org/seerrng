import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { afterEach, describe, it, mock } from 'node:test';

import ReadarrAPI from '@server/api/servarr/readarr';
import {
  expandBookshelfBookIds,
  getBookshelfBookIdAliases,
} from '@server/lib/bookshelfIdentity';
import type { ReadarrSettings } from '@server/lib/settings';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';

const id = makeBookshelfBookId;

const server = (
  serviceId: number,
  hostname: string,
  port = 8787
): ReadarrSettings =>
  ({
    id: serviceId,
    name: hostname,
    hostname,
    port,
    apiKey: 'key',
    useSsl: false,
    serviceType: 'audiobook',
  }) as ReadarrSettings;

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

describe('getBookshelfBookIdAliases', () => {
  it('bridges bare and qualified spellings within the service dialect', () => {
    const aliases = [id(1, '459744'), id(1, 'hc:459744')];
    assert.deepEqual(getBookshelfBookIdAliases(id(1, '459744'), 'hc'), aliases);
    assert.deepEqual(
      new Set(getBookshelfBookIdAliases(id(1, 'hc:459744'), 'hc')),
      new Set(aliases)
    );
    assert.deepEqual(
      new Set(getBookshelfBookIdAliases(id(1, 'hardcover:459744'), 'hc')),
      new Set([id(1, 'hardcover:459744'), ...aliases])
    );
    assert.deepEqual(
      new Set(getBookshelfBookIdAliases(id(4, '90439420'), 'gr')),
      new Set([id(4, '90439420'), id(4, 'gr:90439420')])
    );
  });

  it('never bridges another dialect, an ISBN, an opaque id or an unknown service', () => {
    for (const [value, dialect] of [
      ['gr:459744', 'hc'],
      ['hc:459744', 'gr'],
      ['9780593135204', 'hc'],
      ['OL123W', 'hc'],
      ['0123', 'hc'],
    ] as const) {
      assert.deepEqual(getBookshelfBookIdAliases(id(1, value), dialect), [
        id(1, value),
      ]);
    }
    assert.deepEqual(getBookshelfBookIdAliases(id(1, '459744'), null), [
      id(1, '459744'),
    ]);
    assert.deepEqual(getBookshelfBookIdAliases('OL123W', 'hc'), ['OL123W']);
  });
});

describe('expandBookshelfBookIds', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('expands ids only for services whose library dialect is known', async () => {
    mock.method(ReadarrAPI, 'getKnownLibraryIdDialect', (url: string) =>
      url.includes('hc.test')
        ? 'hc'
        : url.includes('readarr.test')
          ? null
          : undefined
    );
    const expanded = await expandBookshelfBookIds(
      [id(1, 'hc:459744'), id(2, '459744'), id(3, '459744'), id(9, '459744')],
      [server(1, 'hc.test'), server(2, 'readarr.test'), server(3, 'cold.test')]
    );
    assert.deepEqual([...expanded.keys()], [id(1, 'hc:459744')]);
    assert.deepEqual(expanded.get(id(1, 'hc:459744'))?.[0], id(1, 'hc:459744'));
    assert.ok(expanded.get(id(1, 'hc:459744'))?.includes(id(1, '459744')));
  });

  it('detects a cold service once when asked to', async () => {
    let statusCalls = 0;
    const backend = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (path === '/api/v1/system/status') {
        statusCalls += 1;
        return writeJson(response, 200, { appName: 'Chaptarr', version: '1' });
      }
      if (path === '/api/v1/system/capabilities') {
        return writeJson(response, 200, {
          contract: 'chaptarrng-seerr-bookshelf',
          contractVersion: 1,
          providerIdDialect: 'gr',
          features: { formatScopedFacade: true },
        });
      }
      writeJson(response, 404, {});
    });
    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    const address = backend.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const services = [server(5, '127.0.0.1', address.port)];
      const bare = id(5, '90439420');
      assert.equal(
        (await expandBookshelfBookIds([bare], services)).size,
        0,
        'read paths never reach the service'
      );
      assert.equal(statusCalls, 0);
      const [first, second] = await Promise.all([
        expandBookshelfBookIds([bare], services, { detect: true }),
        expandBookshelfBookIds([bare], services, { detect: true }),
      ]);
      assert.ok(first.get(bare)?.includes(id(5, 'gr:90439420')));
      assert.deepEqual(second.get(bare), first.get(bare));
      assert.equal(statusCalls, 1);
    } finally {
      backend.close();
      await once(backend, 'close');
    }
  });
});
