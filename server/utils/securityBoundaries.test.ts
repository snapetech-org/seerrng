import express from 'express';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import request from 'supertest';
import { isInternalPath } from './internalPath';
import { getTrustedProxyNetworks } from './trustedProxies';

it('does not accept forwarded identity/protocol from an untrusted connection', async () => {
  const app = express();
  app.set('trust proxy', getTrustedProxyNetworks('192.0.2.10/32'));
  app.get('/', (req, res) => res.json({ ip: req.ip, secure: req.secure }));
  const result = await request(app)
    .get('/')
    .set('X-Forwarded-For', '10.0.0.1')
    .set('X-Forwarded-Proto', 'https');
  assert.equal(result.body.secure, false);
  assert.notEqual(result.body.ip, '10.0.0.1');
  app.set('trust proxy', getTrustedProxyNetworks());
  const trusted = await request(app)
    .get('/')
    .set('X-Forwarded-For', '192.0.2.9')
    .set('X-Forwarded-Proto', 'https');
  assert.deepEqual(trusted.body, { ip: '192.0.2.9', secure: true });
  for (const networks of ['', '0.0.0.0/0', '::/0', 'bad-network'])
    assert.throws(() => getTrustedProxyNetworks(networks));
});
it('only accepts internal paths including after URL decoding', () => {
  for (const path of [
    '//evil.example/share',
    '/\\evil.example',
    '/%2f%2fevil.example',
    '/%5cevil.example',
    'https://evil.example',
    '/\n/evil.example',
  ])
    assert.equal(isInternalPath(path), false, path);
  for (const path of [
    '/movie/123',
    '/search?query=hello%20world',
    '/book/OL1W#details',
  ])
    assert.equal(isInternalPath(path), true, path);
});
