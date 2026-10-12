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

export function createIsolatedTestEnvironment(
  directory,
  inherited = process.env,
  { includeCi = false, includeVitest = false } = {}
) {
  if (typeof directory !== 'string' || directory.length === 0)
    throw new Error('Test environment requires an owned temporary directory');

  const env = {};
  const allowedKeys = includeVitest
    ? [...inheritedEnvironmentKeys, ...vitestEnvironmentKeys]
    : inheritedEnvironmentKeys;
  const entries = Object.entries(inherited);
  for (const key of allowedKeys) {
    const entry =
      entries.find(([name]) => name === key) ??
      entries.find(([name]) => name.toUpperCase() === key);
    if (entry && typeof entry[1] === 'string') env[key] = entry[1];
  }

  if (includeCi && inherited.CI !== undefined) env.CI = 'true';

  return {
    ...env,
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
  };
}

export function setIsolatedTestEnvironment(
  directory,
  inherited = process.env,
  options = {}
) {
  const env = createIsolatedTestEnvironment(directory, inherited, options);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  return env;
}
