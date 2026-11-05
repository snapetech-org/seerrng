import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const docker = async (...args) =>
  (await exec('docker', args, { maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const root = resolve(import.meta.dirname, '..');
const containers = new Set();
let image, port, gateway;
const echo = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(req.headers));
});
before(async () => {
  image = [
    ...(await readFile(resolve(root, 'Dockerfile'), 'utf8')).matchAll(
      /^FROM (\S+)/gm
    ),
  ].at(-1)[1];
  gateway = JSON.parse(await docker('network', 'inspect', 'bridge'))[0].IPAM
    .Config[0].Gateway;
  await new Promise((resolve) => echo.listen(0, '0.0.0.0', resolve));
  port = echo.address().port;
});
after(async () => {
  for (const id of containers) await docker('rm', '-f', id);
  echo.closeAllConnections();
  await new Promise((resolve) => echo.close(resolve));
});
const args = (settings = {}) => [
  '--add-host',
  'host.docker.internal:host-gateway',
  '-v',
  `${root}/deploy/15-lumen-trusted-proxies.sh:/qa/trust.sh:ro`,
  '-v',
  `${root}/deploy/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro`,
  '-e',
  `SEERR_URL=http://host.docker.internal:${port}`,
  '-e',
  `SEERR_EXTRAS_URL=http://host.docker.internal:${port}`,
  '-e',
  'SEERR_FULL_URL=https://seerr.example.test',
  ...Object.entries(settings).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
  '--entrypoint',
  'sh',
  image,
  '-c',
  'cp /qa/trust.sh /docker-entrypoint.d/15-lumen-trusted-proxies.sh && chmod 755 /docker-entrypoint.d/15-lumen-trusted-proxies.sh && exec /docker-entrypoint.sh nginx -g "daemon off;"',
];
const paths = [
  '/api/v1/probe',
  '/imageproxy/probe',
  '/avatarproxy/probe',
  '/seerr-classic/probe',
];
async function check(settings, clientIp, scheme, headers = {}) {
  const id = await docker(
    'run',
    '-d',
    '--label',
    'io.snapetech.task=lumen-proxy-tests',
    '-p',
    '127.0.0.1::80',
    ...args(settings)
  );
  containers.add(id);
  try {
    const binding = await docker('port', id, '80/tcp');
    const base = `http://${binding}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/api/v1/probe')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, await docker('logs', id));
    for (const path of paths) {
      const response = await fetch(base + path, {
        headers: {
          'x-forwarded-for': '198.51.100.42',
          'x-real-ip': '198.51.100.43',
          'cf-connecting-ip': '198.51.100.44',
          forwarded: 'for=198.51.100.45;proto=https',
          'x-forwarded-proto': 'https',
          ...headers,
        },
      });
      assert.equal(response.status, 200, path);
      const observed = await response.json();
      assert.equal(observed['x-forwarded-for'], clientIp, path);
      assert.equal(observed['x-real-ip'], clientIp, path);
      assert.equal(observed['x-forwarded-proto'], scheme, path);
      assert.equal(observed['cf-connecting-ip'], undefined, path);
      assert.equal(observed.forwarded, undefined, path);
    }
  } finally {
    await docker('rm', '-f', id);
    containers.delete(id);
  }
}
test('direct visitors cannot forge identity or transport on any proxy route', () =>
  check({}, gateway, 'http'));
test('a configured unrelated proxy does not grant trust to this connection', () =>
  check({ LUMEN_TRUSTED_PROXIES: '192.0.2.0/24' }, gateway, 'http'));
test('only configured connecting proxies may supply the forwarded visitor and scheme', () =>
  check({ LUMEN_TRUSTED_PROXIES: `${gateway}/32` }, '198.51.100.42', 'https'));
test('trusted Cloudflare mode handles IPv6 visitors while stripping the original header', () =>
  check(
    {
      LUMEN_TRUSTED_PROXIES: `${gateway}/32`,
      LUMEN_REAL_IP_HEADER: 'CF-Connecting-IP',
    },
    '2001:db8::42',
    'https',
    { 'cf-connecting-ip': '2001:db8::42' }
  ));
test('even trusted peers cannot forward an invalid scheme list', () =>
  check({ LUMEN_TRUSTED_PROXIES: `${gateway}/32` }, '198.51.100.42', 'http', {
    'x-forwarded-proto': 'https,http',
  }));
test('invalid trust configuration prevents startup', async () => {
  for (const settings of [
    { LUMEN_TRUSTED_PROXIES: '127.0.0.1;include /tmp/evil;' },
    { LUMEN_TRUSTED_PROXIES: '*' },
    { LUMEN_REAL_IP_HEADER: 'Caller-Controlled' },
  ]) {
    await assert.rejects(
      docker('run', '--rm', ...args(settings)),
      /not an address|must be/
    );
  }
});
