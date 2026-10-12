import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
const guardSource = readFileSync(
  new URL('./network-guard.mjs', import.meta.url),
  'utf8'
);

// Execute the actual setup and network guard modules with in-memory transports
// and hooks. No application initialization, real sockets or provider access is
// needed.
function guardFixture({
  env = {},
  file = '/app/unrelated.test.ts',
  code = source,
  guardCode = guardSource,
} = {}) {
  const after = [];
  const forwarded = [];
  const transports = Object.fromEntries(
    ['http', 'https'].map((scheme) => [
      scheme,
      Object.fromEntries(
        ['request', 'get'].map((method) => [
          method,
          (...args) => {
            forwarded.push({ scheme, method, args });
            return 'loopback-response';
          },
        ])
      ),
    ])
  );
  const guardExports = {};
  const guardCompiled = ts.transpileModule(guardCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(guardCompiled, {
    exports: guardExports,
    require: (name) => {
      if (name === 'node:http') return transports.http;
      if (name === 'node:https') return transports.https;
      throw new Error(`Unexpected guard import: ${name}`);
    },
    URL,
    Request,
    fetch: async () => new Response(),
  });
  const dependencies = {
    '@server/lib/settings': { getSettings: () => ({}) },
    '@server/logger': { silent: false },
    './network-guard.mjs': guardExports,
    'node:test': {
      before: () => {},
      after: (callback) => after.push(callback),
    },
  };
  const compiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: {},
    require: (name) => {
      if (!Object.hasOwn(dependencies, name))
        throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
    process: {
      env: { SEERR_TEST_FAIL_ON_NETWORK: 'true', ...env },
      argv: ['node', file],
    },
    URL,
    console,
  });
  assert.equal(after.length, 1);
  return { transports, forwarded, finish: () => after[0]() };
}

describe('strict test network guard', () => {
  it('blocks both formerly deferred hosts even with the retired opt-in flag', () => {
    for (const [file, scheme, host] of [
      [
        '/app/server/lib/availabilitySync.test.ts',
        'https',
        'api.themoviedb.org',
      ],
      ['/app/server/lib/scanners/plex/index.test.ts', 'http', 'plex.local'],
    ]) {
      const fixture = guardFixture({
        file,
        env: { SEERR_TEST_DEFER_KNOWN_NETWORK_GAPS: '2026-10-02' },
      });
      assert.throws(
        () => fixture.transports[scheme].request(`${scheme}://${host}/fixture`),
        /Blocked outbound request/
      );
      assert.equal(fixture.forwarded.length, 0);
      assert.throws(fixture.finish, /Test reached the network/);
    }
  });

  it('fails the after-hook when a test swallows an external request error', () => {
    const fixture = guardFixture();
    try {
      fixture.transports.https.get('https://another.invalid/fixture');
    } catch {
      /* emulate a provider fallback */
    }
    assert.equal(fixture.forwarded.length, 0);
    assert.throws(fixture.finish, /https:\/\/another\.invalid/);
  });

  it('preserves loopback URL and options overloads for local HTTP tests', () => {
    const fixture = guardFixture();
    assert.equal(
      fixture.transports.http.request('http://127.0.0.1:1234/test'),
      'loopback-response'
    );
    assert.equal(
      fixture.transports.http.get({ host: 'localhost:1234' }),
      'loopback-response'
    );
    assert.equal(
      fixture.transports.https.request({ hostname: '[::1]' }),
      'loopback-response'
    );
    assert.equal(fixture.forwarded.length, 3);
    assert.doesNotThrow(fixture.finish);
  });

  it('honors an explicit external hostname overriding a loopback URL', () => {
    const fixture = guardFixture();
    assert.throws(
      () =>
        fixture.transports.http.request('http://localhost/fixture', {
          hostname: 'plex.local',
        }),
      /Blocked outbound request/
    );
    assert.equal(fixture.forwarded.length, 0);
    assert.throws(fixture.finish, /http:\/\/plex\.local/);
  });

  it('detects losing the swallowed-attempt recording contract', () => {
    const mutated = guardSource.replace(
      'blocked.add(target);',
      '/* regression: attempt not recorded */'
    );
    assert.notEqual(mutated, guardSource);
    const fixture = guardFixture({ guardCode: mutated });
    assert.throws(
      () => fixture.transports.http.get('http://plex.local/fixture'),
      /Blocked outbound request/
    );
    // Demonstrate why blocking alone is insufficient: this mutant loses the
    // required final failure, unlike the intact-module cases above.
    assert.doesNotThrow(fixture.finish);
  });
});
