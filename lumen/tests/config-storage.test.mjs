import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'seerrng-lumen-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = (
    await readFile(
      new URL('../deploy/lumen-config.js', import.meta.url),
      'utf8'
    )
  ).replace(
    "const DIR = '/lumen-data';",
    `const DIR = ${JSON.stringify(dir)};`
  );
  const { default: handlers } = await import(
    `data:text/javascript,${encodeURIComponent(source)}`
  );
  let nextId = 0;
  function request(overrides = {}) {
    const r = {
      method: 'PUT',
      uri: '/lumen/branding/logo',
      headersIn: { 'Content-Type': 'application/json' },
      headersOut: {},
      variables: { request_id: String(++nextId).padStart(32, '0') },
      requestBuffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      requestText: '{}',
      subrequest: async () => ({
        status: 200,
        responseText: JSON.stringify({ permissions: 2 }),
      }),
      return(status, text) {
        this.status = status;
        this.body = JSON.parse(text);
      },
      ...overrides,
    };
    return r;
  }
  return { dir, handlers, request };
}

test('upload preserves the currently configured image until replacement settings commit', async (t) => {
  const { dir, handlers, request } = await fixture(t);
  const first = request();
  await handlers.branding(first);
  assert.equal(first.status, 200);
  const configured = join(dir, first.body.url.slice(1));
  await handlers.save(
    request({
      requestText: JSON.stringify({ branding: { logo: first.body.url } }),
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = request();
  await handlers.branding(second);
  assert.equal(second.status, 200);
  assert.notEqual(second.body.url, first.body.url);
  const rejected = request({ requestText: '[' });
  await handlers.save(rejected);
  assert.equal(rejected.status, 400);
  assert.equal(
    existsSync(configured),
    true,
    'a failed config save must retain the live logo'
  );
  await handlers.save(
    request({
      requestText: JSON.stringify({ branding: { logo: second.body.url } }),
    })
  );
  assert.equal(existsSync(join(dir, second.body.url.slice(1))), true);
});

test('non-admin and malformed settings cannot alter saved defaults or upload branding', async (t) => {
  const { dir, handlers, request } = await fixture(t);
  const path = join(dir, 'lumen-config.json');
  await writeFile(path, '{"branding":{"name":"Original"}}');
  for (const [me, expected] of [
    [{ status: 401 }, 401],
    [{ status: 200, responseText: '{"permissions":32}' }, 403],
    [{ status: 200, responseText: 'bad' }, 502],
  ]) {
    for (const handler of [handlers.save, handlers.branding]) {
      const r = request({ subrequest: async () => me });
      await handler(r);
      assert.equal(r.status, expected);
    }
  }
  for (const text of ['[]', 'null', '"string"', '{']) {
    const r = request({ requestText: text });
    await handlers.save(r);
    assert.equal(r.status, 400);
  }
  assert.equal(
    await readFile(path, 'utf8'),
    '{"branding":{"name":"Original"}}'
  );
});
