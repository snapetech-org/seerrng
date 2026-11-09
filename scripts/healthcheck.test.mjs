import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

test('health probes require the exact success status for public liveness and readiness', async () => {
  let status = 200;
  const server = http
    .createServer((_req, res) => {
      res.writeHead(status);
      res.end();
    })
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  const check = async (path) => {
    const child = spawn(process.execPath, ['scripts/healthcheck.mjs', path], {
      env: {
        ...process.env,
        SEERR_TLS_MODE: 'disabled',
        PORT: String(server.address().port),
      },
      stdio: 'ignore',
    });
    return (await once(child, 'exit'))[0];
  };
  try {
    assert.equal(await check('/api/v1/settings/public'), 0);
    assert.equal(await check('/api/v1/status/ready'), 1);
    status = 204;
    assert.equal(await check('/api/v1/status/ready'), 0);
    status = 302;
    assert.equal(await check('/api/v1/settings/public'), 1);
    status = 503;
    assert.equal(await check('/api/v1/status/ready'), 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
