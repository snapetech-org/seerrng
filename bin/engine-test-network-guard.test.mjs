import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import test from 'node:test';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- This focused test exercises the server test bootstrap helper without app aliases.
import { installTestNetworkGuard } from '../server/test/network-guard.mjs';

test('outbound HTTP is blocked while loopback works and fetch redirects fail closed', async (t) => {
  const inheritedNetworkOverride = process.env.ALLOW_NETWORK;
  process.env.ALLOW_NETWORK = 'true';
  const blocked = installTestNetworkGuard();
  if (inheritedNetworkOverride === undefined) delete process.env.ALLOW_NETWORK;
  else process.env.ALLOW_NETWORK = inheritedNetworkOverride;

  await assert.rejects(
    fetch('https://seerrng-network-guard.invalid'),
    /Blocked outbound request to https:\/\/seerrng-network-guard\.invalid/
  );
  assert.throws(
    () => http.request('http://seerrng-network-guard.invalid'),
    /Blocked outbound request to http:\/\/seerrng-network-guard\.invalid/
  );
  assert.throws(
    () => https.request('https://seerrng-network-guard.invalid'),
    /Blocked outbound request to https:\/\/seerrng-network-guard\.invalid/
  );
  assert.deepEqual([...blocked].sort(), [
    'http://seerrng-network-guard.invalid',
    'https://seerrng-network-guard.invalid',
  ]);

  let loopbackRequests = 0;
  const server = http.createServer((request, response) => {
    loopbackRequests += 1;
    if (request.url === '/redirect' || request.url === '/redirect-external') {
      response.writeHead(302, {
        location:
          request.url === '/redirect-external'
            ? 'https://seerrng-network-guard.invalid/path'
            : '/',
      });
      response.end();
      return;
    }
    response.end('loopback-ok');
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(
    () =>
      new Promise((resolveClose, rejectClose) =>
        server.close((error) =>
          error ? rejectClose(error) : resolveClose(undefined)
        )
      )
  );

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}`);
  assert.equal(await response.text(), 'loopback-ok');
  await assert.rejects(
    fetch(`http://127.0.0.1:${address.port}/redirect`),
    /Blocked fetch redirect to http:\/\/127\.0\.0\.1/
  );
  assert.equal(
    loopbackRequests,
    2,
    'fetch must not follow even loopback redirects'
  );
  await assert.rejects(
    fetch(`http://127.0.0.1:${address.port}/redirect-external`),
    /Blocked fetch redirect to https:\/\/seerrng-network-guard\.invalid/
  );
  assert.equal(
    blocked.has('https://seerrng-network-guard.invalid'),
    true,
    'the after-hook must see an external redirect even if its error is caught'
  );
  const manualRedirect = await fetch(
    `http://127.0.0.1:${address.port}/redirect`,
    { redirect: 'manual' }
  );
  assert.equal(manualRedirect.status, 302);
  assert.equal(manualRedirect.headers.get('location'), '/');
  await manualRedirect.body?.cancel();
  assert.equal(loopbackRequests, 4);
});
