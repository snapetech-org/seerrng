import { join } from 'node:path';

const inheritedEnvironmentKeys = Object.freeze([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
]);

const vitestEnvironmentKeys = Object.freeze([
  'VITEST',
  'VITEST_POOL_ID',
  'VITEST_WORKER_ID',
]);

export function setIsolatedTestEnvironment(
  directory,
  inherited = process.env,
  { includeCi = false, includeVitest = false, includePostgres = false } = {}
) {
  if (typeof directory !== 'string' || directory.length === 0) {
    throw new Error('Tests require an owned temporary configuration directory');
  }

  const environment = {};
  const allowedKeys = includeVitest
    ? [...inheritedEnvironmentKeys, ...vitestEnvironmentKeys]
    : inheritedEnvironmentKeys;
  const entries = Object.entries(inherited);
  for (const key of allowedKeys) {
    const entry =
      entries.find(([name]) => name === key) ??
      entries.find(([name]) => name.toUpperCase() === key);
    if (entry && typeof entry[1] === 'string') environment[key] = entry[1];
  }

  if (includePostgres) {
    let url;
    try {
      url = new URL(inherited.SEERR_TEST_POSTGRES_URL);
    } catch {
      throw new Error(
        '--postgres requires SEERR_TEST_POSTGRES_URL for a loopback test database'
      );
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !url.pathname ||
      url.pathname === '/'
    ) {
      throw new Error(
        '--postgres requires a PostgreSQL URL for a named loopback test database'
      );
    }
    environment.SEERR_TEST_POSTGRES_URL = url.href;
  }

  if (includeCi && inherited.CI !== undefined) environment.CI = 'true';
  Object.assign(environment, {
    HOME: directory,
    USERPROFILE: directory,
    TMPDIR: directory,
    TMP: directory,
    TEMP: directory,
    XDG_CONFIG_HOME: join(directory, 'xdg-config'),
    XDG_CACHE_HOME: join(directory, 'xdg-cache'),
    APPDATA: join(directory, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(directory, 'AppData', 'Local'),
    NODE_ENV: 'test',
    CONFIG_DIRECTORY: directory,
    ALLOW_NETWORK: 'false',
    SEERR_TEST_FAIL_ON_NETWORK: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  });

  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, environment);
  return environment;
}
