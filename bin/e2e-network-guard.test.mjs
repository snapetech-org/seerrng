import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('offline browser server permits loopback and rejects external socket forms before connecting', () => {
  const guard = fileURLToPath(
    new URL('./e2e-network-guard.cjs', import.meta.url)
  );
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      guard,
      '-e',
      `
    const assert = require('node:assert/strict');
    const net = require('node:net');
    for (const args of [
      [{host: 'example.invalid', port: 443}],
      [443, 'example.invalid'],
      [{host: '192.0.2.1', port: 443}],
    ]) {
      assert.throws(() => net.connect(...args), {code: 'E2E_EXTERNAL_NETWORK_BLOCKED'});
    }
    assert.throws(() => require('node:https').get('https://example.invalid'), {code: 'E2E_EXTERNAL_NETWORK_BLOCKED'});
    assert.throws(() => require('undici').request('https://example.invalid'), {code: 'E2E_EXTERNAL_NETWORK_BLOCKED'});
    fetch('https://example.invalid').then(
      () => { throw new Error('External fetch must be rejected'); },
      error => assert.equal(error.code, 'E2E_EXTERNAL_NETWORK_BLOCKED')
    );
    const server = net.createServer(socket => socket.end());
    server.listen(0, '127.0.0.1', () => {
      const socket = net.connect({host: '127.0.0.1', port: server.address().port});
      socket.on('connect', () => { socket.destroy(); server.close(); });
      socket.on('error', error => { throw error; });
    });
  `,
    ],
    { encoding: 'utf8', timeout: 10000 }
  );
  assert.equal(result.status, 0, result.stderr);
});
