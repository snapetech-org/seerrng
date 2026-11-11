import ReadarrAPI from '@server/api/servarr/readarr';
import { getBookMetadataPendingRetryMs } from '@server/lib/bookMetadataPending';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { it } from 'node:test';

for (const code of ['metadata_pending', 'metadata_unavailable']) {
  it(`preserves ${code} without immediate retries or provider fallback`, async () => {
    const lookups: string[] = [];
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      let status = 200;
      let body: unknown;
      if (path === '/api/v1/system/status')
        body = { appName: 'Chaptarr', version: '0.9.965.0' };
      else if (path === '/api/v1/config/hardcover') body = { enabled: true };
      else if (path.endsWith('/book/lookup')) {
        lookups.push(path);
        status = 503;
        body = { code, retryAfterSeconds: 60 };
        response.setHeader('Retry-After', '60');
      } else {
        status = 404;
        body = {};
      }
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const api = new ReadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v1`,
        apiKey: 'fixture',
        mediaType: 'ebook',
      });
      await assert.rejects(
        api.lookupBook('hc:1930507'),
        (error) => getBookMetadataPendingRetryMs(error) === 60_000
      );
      assert.deepEqual(lookups, ['/readarr/hc/ebook/api/v1/book/lookup']);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
}
