import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { getLoopbackHttpResponse } from '../test/loopbackHttpRequest';
import {
  HTTP_SERVER_LIMITS,
  configureHttpServer,
  parseListenPort,
  startLoopbackHttpServer,
} from './httpServer';

describe('parseListenPort', () => {
  it('uses the default only when PORT is unset or empty', () => {
    assert.equal(parseListenPort(), 5055);
    assert.equal(parseListenPort(''), 5055);
    assert.equal(parseListenPort('8080'), 8080);
    assert.equal(parseListenPort(undefined, 'SEERR_HTTPS_PORT', 5056), 5056);
  });

  it('rejects coercible, out-of-range, and malformed values', () => {
    for (const value of [
      '0',
      '65536',
      '-1',
      '1.5',
      ' 5055',
      '5055 ',
      '5e3',
      'Infinity',
    ]) {
      assert.throws(() => parseListenPort(value), /between 1 and 65535/);
    }
    assert.throws(
      () => parseListenPort('abc', 'SEERR_HTTPS_PORT', 5056),
      /SEERR_HTTPS_PORT.*between 1 and 65535/
    );
  });
});

describe('configureHttpServer', () => {
  it('bounds slow requests and per-connection resource use', () => {
    const server = configureHttpServer(http.createServer());

    assert.equal(server.requestTimeout, HTTP_SERVER_LIMITS.requestTimeoutMs);
    assert.equal(server.headersTimeout, HTTP_SERVER_LIMITS.headersTimeoutMs);
    assert.equal(
      server.keepAliveTimeout,
      HTTP_SERVER_LIMITS.keepAliveTimeoutMs
    );
    assert.equal(server.maxHeadersCount, HTTP_SERVER_LIMITS.maxHeadersCount);
    assert.equal(
      server.maxRequestsPerSocket,
      HTTP_SERVER_LIMITS.maxRequestsPerSocket
    );
  });
});

describe('startLoopbackHttpServer', () => {
  it('serves its handler on an ephemeral loopback-only port', async () => {
    const { server, port } = await startLoopbackHttpServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('internal API');
      }
    );

    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      assert.equal(address.address, '127.0.0.1');
      assert.equal(address.port, port);

      const response = await getLoopbackHttpResponse(
        `http://127.0.0.1:${port}/api/v1/movie/1`
      );
      assert.equal(response.statusCode, 200);
      assert.equal(response.body, 'internal API');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
