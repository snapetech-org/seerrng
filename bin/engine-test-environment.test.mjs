import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Native Node tooling tests the engine environment helper without application aliases.
import { createIsolatedTestEnvironment } from '../tools/validation-engine/runtime/test-environment.mjs';

test('test child environments drop inherited credentials and retarget user paths', () => {
  const inherited = {
    PATH: '/tools',
    NODE_ENV: 'production',
    NODE_OPTIONS: '--require injected',
    CONFIG_DIRECTORY: '/live',
    HOME: '/live-home',
    GITHUB_TOKEN: 'synthetic-github-token',
    GH_TOKEN: 'synthetic-gh-token',
    AWS_SECRET_ACCESS_KEY: 'synthetic-aws-secret',
    NPM_TOKEN: 'synthetic-npm-token',
    SSH_AUTH_SOCK: '/run/user/1000/agent.sock',
    HTTPS_PROXY: 'http://proxy.example.test',
    DB_PASS: 'synthetic-db-password',
    SEERR_TEST_POSTGRES_URL: 'postgres://synthetic:secret@db.test/seerr',
    ALLOW_NETWORK: 'true',
  };

  const env = createIsolatedTestEnvironment('/owned', inherited);
  assert.equal(env.PATH, '/tools');
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.CONFIG_DIRECTORY, '/owned');
  assert.equal(env.HOME, '/owned');
  assert.equal(env.USERPROFILE, '/owned');
  assert.equal(env.TMPDIR, '/owned');
  assert.equal(env.TMP, '/owned');
  assert.equal(env.TEMP, '/owned');
  assert.equal(env.XDG_CONFIG_HOME, join('/owned', 'xdg-config'));
  assert.equal(env.XDG_CACHE_HOME, join('/owned', 'xdg-cache'));
  assert.equal(env.APPDATA, join('/owned', 'AppData', 'Roaming'));
  assert.equal(env.LOCALAPPDATA, join('/owned', 'AppData', 'Local'));
  assert.equal(env.ALLOW_NETWORK, 'false');
  assert.equal(env.SEERR_TEST_FAIL_ON_NETWORK, 'true');

  for (const key of [
    'NODE_OPTIONS',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'NPM_TOKEN',
    'SSH_AUTH_SOCK',
    'HTTPS_PROXY',
    'DB_PASS',
    'SEERR_TEST_POSTGRES_URL',
  ]) {
    assert.equal(env[key], undefined, `${key} must not reach tests`);
  }

  assert.equal(inherited.GITHUB_TOKEN, 'synthetic-github-token');
  assert.equal(inherited.HOME, '/live-home');
});

test('Vitest bootstrap keeps only framework markers and normalizes CI', () => {
  const inherited = {
    PATH: '/tools',
    CI: 'sensitive-value-is-not-used',
    VITEST: 'true',
    VITEST_POOL_ID: '2',
    VITEST_WORKER_ID: '3',
    GITHUB_TOKEN: 'synthetic-token',
  };

  const env = createIsolatedTestEnvironment('/owned', inherited, {
    includeCi: true,
    includeVitest: true,
  });
  assert.equal(env.CI, 'true');
  assert.equal(env.VITEST, 'true');
  assert.equal(env.VITEST_POOL_ID, '2');
  assert.equal(env.VITEST_WORKER_ID, '3');
  assert.equal(env.GITHUB_TOKEN, undefined);
});
