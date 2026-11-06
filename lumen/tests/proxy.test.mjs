import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
let extraCalls = 0;
const echo = createServer((req, res) => {
  if (req.url === '/api/v1/auth/me') {
    res.statusCode =
      req.headers.cookie === 'fixture-session=valid'
        ? 200
        : req.headers.cookie === 'fixture-session=forbidden'
          ? 403
          : req.headers.cookie === 'fixture-session=unavailable'
            ? 503
            : 401;
    res.end();
    return;
  }
  if (req.url.startsWith('/seerr-classic/')) extraCalls += 1;
  if (req.url === '/seerr-classic/narration') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ method: req.method, body }));
    });
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(req.headers));
});
before(async () => {
  image = `seerrng-lumen-proxy-qa:${process.pid}-${Date.now()}`;
  await docker(
    'build',
    '--label',
    'io.snapetech.task=lumen-proxy-tests',
    '-t',
    image,
    root
  );
  gateway = JSON.parse(await docker('network', 'inspect', 'bridge'))[0].IPAM
    .Config[0].Gateway;
  await new Promise((resolve) => echo.listen(0, '0.0.0.0', resolve));
  port = echo.address().port;
});
after(async () => {
  for (const id of containers) await docker('rm', '-f', id);
  if (image) await docker('image', 'rm', image);
  echo.closeAllConnections();
  await new Promise((resolve) => echo.close(resolve));
});
const args = (settings = {}) => [
  '--add-host',
  'host.docker.internal:host-gateway',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '-e',
  `SEERR_URL=http://host.docker.internal:${port}`,
  '-e',
  `SEERR_EXTRAS_URL=http://host.docker.internal:${port}`,
  '-e',
  'SEERR_FULL_URL=https://seerr.example.test',
  ...Object.entries(settings).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
  image,
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
    const frontend = await fetch(base + '/');
    assert.equal(frontend.status, 200);
    assert.match(await frontend.text(), /<div id="root"><\/div>/);
    assert.match(
      frontend.headers.get('content-security-policy'),
      /script-src 'self'/
    );
    for (const path of paths) {
      const response = await fetch(base + path, {
        headers: {
          cookie: 'fixture-session=valid',
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
test('the built production image starts with an unprivileged user', async () => {
  const user = await docker(
    'image',
    'inspect',
    '--format',
    '{{.Config.User}}',
    image
  );
  const uid = await docker(
    'run',
    '--rm',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--entrypoint',
    'id',
    image,
    '-u'
  );
  assert.match(
    uid,
    /^[1-9]\d*$/,
    'The actual production process must have a nonzero UID.'
  );
  assert.ok(
    user && user !== 'root' && user !== '0' && user !== '0:0',
    `Expected an explicit non-root production USER, got ${JSON.stringify(user)}`
  );
});
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

test('companion reads and narration writes require a current SeerrNG session', async () => {
  const id = await docker(
    'run',
    '-d',
    '--label',
    'io.snapetech.task=lumen-proxy-tests',
    '-p',
    '127.0.0.1::80',
    ...args()
  );
  containers.add(id);
  try {
    const base = `http://${await docker('port', id, '80/tcp')}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/api/v1/probe')).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const before = extraCalls;
    for (const method of ['GET', 'POST']) {
      const denied = await fetch(base + '/seerr-classic/narration', { method });
      assert.equal(denied.status, 401, `anonymous ${method}`);
      const expired = await fetch(base + '/seerr-classic/narration', {
        method,
        headers: { cookie: 'fixture-session=expired' },
      });
      assert.equal(expired.status, 401, `expired ${method}`);
    }
    for (const [session, status] of [
      ['forbidden', 403],
      ['unavailable', 500],
    ]) {
      const rejected = await fetch(base + '/seerr-classic/narration', {
        method: 'POST',
        headers: { cookie: `fixture-session=${session}` },
      });
      assert.equal(rejected.status, status, session);
    }
    assert.equal(
      extraCalls,
      before,
      'denied requests must never reach the companion'
    );
    assert.equal(
      (await fetch(base + '/_lumen_session_check')).status,
      404,
      'auth check is internal only'
    );
    const accepted = await fetch(base + '/seerr-classic/narration', {
      method: 'POST',
      headers: {
        cookie: 'fixture-session=valid',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bookId: 1, editionId: 2 }),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), {
      method: 'POST',
      body: JSON.stringify({ bookId: 1, editionId: 2 }),
    });
    assert.equal(extraCalls, before + 1);
  } finally {
    await docker('rm', '-f', id);
    containers.delete(id);
  }
});
