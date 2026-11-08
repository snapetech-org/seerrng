import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { setIsolatedTestEnvironment } from './test-environment.mjs';
const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, original);
});
test('PostgreSQL integration is opt-in and never inherits app database credentials', () => {
  const env = setIsolatedTestEnvironment('/owned-test-config', {
    SEERR_TEST_POSTGRES_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/test',
    DATABASE_URL: 'postgresql://private-app.example/production',
    PGPASSWORD: 'do-not-inherit',
  });
  assert.equal(env.SEERR_TEST_POSTGRES_URL, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PGPASSWORD, undefined);
});
for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
  test(`explicit PostgreSQL mode preserves its loopback URL for ${host}`, () => {
    const value = `postgresql://fixture:fixture@${host}:5432/test`;
    const env = setIsolatedTestEnvironment(
      '/owned-test-config',
      {
        SEERR_TEST_POSTGRES_URL: value,
        DATABASE_URL: 'postgresql://private-app.example/production',
      },
      { includePostgres: true }
    );
    assert.equal(env.SEERR_TEST_POSTGRES_URL, value);
    assert.equal(process.env.SEERR_TEST_POSTGRES_URL, value);
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.ALLOW_NETWORK, 'false');
    assert.equal(env.CONFIG_DIRECTORY, '/owned-test-config');
  });
}
for (const value of [
  undefined,
  '',
  'not-a-url',
  'https://localhost/test',
  'postgresql://remote.example/test',
  'postgresql://127.0.0.1/',
]) {
  test(`explicit PostgreSQL mode rejects unsafe or absent input ${String(value)}`, () => {
    assert.throws(
      () =>
        setIsolatedTestEnvironment(
          '/owned-test-config',
          {
            SEERR_TEST_POSTGRES_URL: value,
          },
          { includePostgres: true }
        ),
      /--postgres requires/
    );
  });
}
