import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { Client } from 'pg';

import {
  migrate,
  parseArguments,
  projectSeerrSettings,
} from './seerrng-migrate.mjs';

const fixtures = new Set();
const postgresSchemas = new Set();
const postgresTestUrl = process.env.SEERR_MIGRATION_TEST_POSTGRES_URL;

const sourceSettings = () => ({
  clientId: 'source-client',
  sessionSecret: 'source-session-secret',
  vapidPublic: 'public-key',
  vapidPrivate: 'private-key',
  main: {
    apiKey: 'source-api-key',
    applicationTitle: 'Source SeerrNG',
    applicationUrl: 'https://source.invalid',
    defaultPermissions: 4294967329,
    mediaServerType: 1,
    enableBooks: true,
    enabledMediaCategories: { movie: true, tv: true, ebook: true },
  },
  plex: {
    name: 'Plex',
    ip: 'plex.internal',
    port: 32400,
    libraries: [{ id: '1', name: 'Films', enabled: true, type: 'movie' }],
  },
  jellyfin: { name: '', ip: '', port: 8096, libraries: [] },
  tautulli: {
    hostname: 'tautulli.internal',
    port: 8181,
    apiKey: 'tautulli-secret',
  },
  radarr: [
    {
      id: 1,
      name: 'Movies',
      hostname: 'radarr.internal',
      port: 7878,
      apiKey: 'radarr-secret',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'HD',
      activeDirectory: '/movies',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
      minimumAvailability: 'released',
      unsupportedArrOption: 'drop me',
    },
  ],
  sonarr: [],
  public: { initialized: true, enableBooks: true },
  notifications: {
    agents: {
      discord: {
        enabled: true,
        embedPoster: true,
        types: 1048584,
        options: {
          webhookUrl: 'https://discord.invalid/webhook',
          webhookRoleId: '123',
          unsupportedOption: 'drop me',
        },
      },
    },
  },
  jobs: {
    'plex-recently-added-scan': { schedule: '0 */5 * * * *' },
    'book-import': { schedule: '0 0 * * *' },
  },
  network: {
    csrfProtection: false,
    proxy: {
      enabled: false,
      hostname: '',
      port: 0,
      useSsl: false,
      user: '',
      password: '',
    },
    dnsCache: { enabled: true, forceMinTtl: 30 },
  },
  metadataSettings: { tv: 'tmdb', anime: 'tmdb', books: 'openlibrary' },
  migrations: ['ng-only-setting-migration'],
  bookServices: [{ id: 1, apiKey: 'book-secret' }],
});

const seerrSettings = () => ({
  clientId: 'seerr-client',
  sessionSecret: 'seerr-session-secret',
  vapidPublic: 'seerr-vapid-public',
  vapidPrivate: 'seerr-vapid-private',
  main: {
    apiKey: 'seerr-api-key',
    applicationTitle: 'Seerr source',
    applicationUrl: 'https://seerr.invalid',
    defaultPermissions: 32,
    mediaServerType: 4,
  },
  migrations: ['seerr-settings-marker'],
});

const seerrDefaults = () => ({
  clientId: 'target-client',
  sessionSecret: 'target-session',
  vapidPublic: '',
  vapidPrivate: '',
  main: {
    apiKey: '',
    applicationTitle: 'Seerr',
    applicationUrl: '',
    defaultPermissions: 32,
    mediaServerType: 4,
    defaultQuotas: { movie: {}, tv: {} },
  },
  plex: {
    name: '',
    ip: '',
    port: 32400,
    libraries: [],
  },
  jellyfin: { name: '', ip: '', port: 8096, libraries: [] },
  tautulli: {},
  radarr: [],
  sonarr: [],
  public: { initialized: false },
  notifications: {
    agents: {
      discord: {
        enabled: false,
        embedPoster: true,
        types: 0,
        options: { webhookUrl: '', locale: 'en' },
      },
    },
  },
  jobs: { 'plex-recently-added-scan': { schedule: '0 */5 * * * *' } },
  network: {
    csrfProtection: false,
    proxy: {
      enabled: false,
      hostname: '',
      port: 0,
      useSsl: false,
      user: '',
      password: '',
    },
    dnsCache: { enabled: false },
  },
  metadataSettings: { tv: 'tmdb', anime: 'tmdb' },
  migrations: ['seerr-target-migration-marker'],
});

const seerrNgDefaults = () => ({
  ...seerrDefaults(),
  main: {
    ...seerrDefaults().main,
    enabledMediaCategories: { movie: true, tv: true, ebook: true },
    defaultEnabledMediaCategories: { movie: true, tv: true, ebook: true },
  },
  books: { enabled: false },
});

const makeRoot = async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'seerrng-migration-test-')
  );
  fixtures.add(root);
  return root;
};

const createConfig = async (root, name, settings, schema, seed) => {
  const directory = path.join(root, name);
  await fs.mkdir(path.join(directory, 'db'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
    { mode: 0o600 }
  );
  const database = new Database(path.join(directory, 'db', 'db.sqlite3'));
  database.pragma('foreign_keys = ON');
  database.exec(schema);
  if (seed) await seed(database);
  database.close();
  return directory;
};

const postgresUrlForSchema = (schema) => {
  if (!postgresTestUrl)
    throw new Error('PostgreSQL test URL is not configured');
  const url = new URL(postgresTestUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
};

const postgresSchema = (schema) =>
  schema
    .replaceAll(
      /\bid INTEGER PRIMARY KEY\b/gu,
      'id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY'
    )
    .replaceAll(
      /\bpermissions INTEGER NOT NULL\b/gu,
      'permissions BIGINT NOT NULL'
    )
    .replaceAll(
      /\bisBuiltIn INTEGER NOT NULL\b/gu,
      'isBuiltIn BOOLEAN NOT NULL'
    )
    .replaceAll(/CREATE TABLE user \(/gu, 'CREATE TABLE "user" (')
    .replaceAll(/REFERENCES user\(id\)/gu, 'REFERENCES "user"(id)')
    .replaceAll(
      /\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/gu,
      (name) => `"${name}"`
    );

const createPostgresConfig = async (root, name, settings, schema, seed) => {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
    { mode: 0o600 }
  );

  const schemaName = `seerrng_migration_${randomUUID().replaceAll('-', '')}`;
  postgresSchemas.add(schemaName);
  const admin = new Client({ connectionString: postgresTestUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await admin.end();
  }

  const connectionString = postgresUrlForSchema(schemaName);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(postgresSchema(schema));
    if (seed) await seed({ exec: (sql) => client.query(sql) });
  } finally {
    await client.end();
  }
  return { directory, connectionString };
};

const readPostgres = async (connectionString, sql, parameters = []) => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return (await client.query(sql, parameters)).rows;
  } finally {
    await client.end();
  }
};

const withMigrationDatabaseUrls = async (sourceUrl, targetUrl, operation) => {
  const previousSource = process.env.SEERR_MIGRATION_SOURCE_DATABASE_URL;
  const previousTarget = process.env.SEERR_MIGRATION_TARGET_DATABASE_URL;
  if (sourceUrl === undefined) {
    delete process.env.SEERR_MIGRATION_SOURCE_DATABASE_URL;
  } else {
    process.env.SEERR_MIGRATION_SOURCE_DATABASE_URL = sourceUrl;
  }
  if (targetUrl === undefined) {
    delete process.env.SEERR_MIGRATION_TARGET_DATABASE_URL;
  } else {
    process.env.SEERR_MIGRATION_TARGET_DATABASE_URL = targetUrl;
  }
  try {
    return await operation();
  } finally {
    if (previousSource === undefined) {
      delete process.env.SEERR_MIGRATION_SOURCE_DATABASE_URL;
    } else {
      process.env.SEERR_MIGRATION_SOURCE_DATABASE_URL = previousSource;
    }
    if (previousTarget === undefined) {
      delete process.env.SEERR_MIGRATION_TARGET_DATABASE_URL;
    } else {
      process.env.SEERR_MIGRATION_TARGET_DATABASE_URL = previousTarget;
    }
  }
};

const readDatabase = (directory, sql, ...parameters) => {
  const database = new Database(path.join(directory, 'db', 'db.sqlite3'), {
    readonly: true,
  });
  try {
    return database.prepare(sql).all(...parameters);
  } finally {
    database.close();
  }
};

const readDatabaseFile = (directory) =>
  fs.readFile(path.join(directory, 'db', 'db.sqlite3'));

const readSettings = async (directory) =>
  JSON.parse(await fs.readFile(path.join(directory, 'settings.json'), 'utf8'));

const sourceNgSchema = `
  CREATE TABLE migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE typeorm_metadata (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    mediaType TEXT NOT NULL,
    tmdbId INTEGER NOT NULL,
    title TEXT NOT NULL,
    ngOnlyIdentity TEXT
  );
  CREATE TABLE user (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    userType INTEGER NOT NULL,
    permissions INTEGER NOT NULL,
    username TEXT,
    password TEXT,
    musicQuotaLimit INTEGER
  );
  CREATE TABLE media_request (
    id INTEGER PRIMARY KEY,
    mediaId INTEGER NOT NULL REFERENCES media(id),
    requestedById INTEGER NOT NULL REFERENCES user(id),
    type TEXT NOT NULL,
    status INTEGER NOT NULL,
    serviceTargets TEXT,
    watchAheadParentRequestId INTEGER REFERENCES media_request(id)
  );
  CREATE TABLE season_request (
    id INTEGER PRIMARY KEY,
    requestId INTEGER NOT NULL REFERENCES media_request(id),
    seasonNumber INTEGER NOT NULL,
    status INTEGER NOT NULL
  );
  CREATE TABLE watchlist (
    id INTEGER PRIMARY KEY,
    mediaType TEXT NOT NULL,
    mediaId INTEGER NOT NULL REFERENCES media(id),
    requestedById INTEGER NOT NULL REFERENCES user(id)
  );
  CREATE TABLE blocklist (
    id INTEGER PRIMARY KEY,
    mediaType TEXT NOT NULL,
    mediaId INTEGER NOT NULL REFERENCES media(id)
  );
  CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES user(id),
    notificationTypes TEXT,
    enabledMediaCategories TEXT
  );
  CREATE TABLE discover_slider (
    id INTEGER PRIMARY KEY,
    type INTEGER NOT NULL,
    isBuiltIn INTEGER NOT NULL,
    title TEXT
  );
  CREATE TABLE session (id TEXT PRIMARY KEY, expiredAt INTEGER, json TEXT);
  CREATE TABLE ng_feature (id INTEGER PRIMARY KEY, data TEXT);
`;

const seerrSchema = ({
  ngExtras = false,
  requiredTargetColumn = false,
  rejectTvId = false,
} = {}) => `
  CREATE TABLE migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE typeorm_metadata (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    mediaType TEXT NOT NULL${ngExtras ? '' : " CHECK (mediaType IN ('movie', 'tv'))"},
    tmdbId INTEGER NOT NULL${rejectTvId ? ' CHECK (tmdbId <> 200)' : ''},
    title TEXT NOT NULL${ngExtras ? ",\n    ngOnlyIdentity TEXT,\n    ngRequired TEXT NOT NULL DEFAULT 'target-default'" : requiredTargetColumn ? ',\n    requiredByTarget TEXT NOT NULL' : ''}
  );
  CREATE TABLE user (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    userType INTEGER NOT NULL,
    permissions INTEGER NOT NULL,
    username TEXT,
    password TEXT${ngExtras ? ',\n    musicQuotaLimit INTEGER NOT NULL DEFAULT 0' : ''}
  );
  CREATE TABLE media_request (
    id INTEGER PRIMARY KEY,
    mediaId INTEGER NOT NULL REFERENCES media(id),
    requestedById INTEGER NOT NULL REFERENCES user(id),
    type TEXT NOT NULL${ngExtras ? '' : " CHECK (type IN ('movie', 'tv'))"},
    status INTEGER NOT NULL${ngExtras ? ',\n    serviceTargets TEXT,\n    watchAheadParentRequestId INTEGER REFERENCES media_request(id)' : ''}
  );
  CREATE TABLE season_request (
    id INTEGER PRIMARY KEY,
    requestId INTEGER NOT NULL REFERENCES media_request(id),
    seasonNumber INTEGER NOT NULL,
    status INTEGER NOT NULL
  );
  CREATE TABLE watchlist (
    id INTEGER PRIMARY KEY,
    mediaType TEXT NOT NULL${ngExtras ? '' : " CHECK (mediaType IN ('movie', 'tv'))"},
    mediaId INTEGER NOT NULL REFERENCES media(id),
    requestedById INTEGER NOT NULL REFERENCES user(id)
  );
  CREATE TABLE blocklist (
    id INTEGER PRIMARY KEY,
    mediaType TEXT NOT NULL${ngExtras ? '' : " CHECK (mediaType IN ('movie', 'tv'))"},
    mediaId INTEGER NOT NULL REFERENCES media(id)
  );
  CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES user(id),
    notificationTypes TEXT${ngExtras ? ',\n    enabledMediaCategories TEXT' : ''}
  );
  CREATE TABLE discover_slider (
    id INTEGER PRIMARY KEY,
    type INTEGER NOT NULL CHECK (type BETWEEN 1 AND 21),
    isBuiltIn INTEGER NOT NULL,
    title TEXT
  );
  CREATE TABLE session (id TEXT PRIMARY KEY, expiredAt INTEGER, json TEXT);
  CREATE TABLE seerr_private_seed (id INTEGER PRIMARY KEY, label TEXT);
  ${ngExtras ? 'CREATE TABLE ng_feature (id INTEGER PRIMARY KEY, data TEXT);' : ''}
`;

const seedNgSource = async (database) => {
  await database.exec(`
    INSERT INTO migrations VALUES (1, 'ng-migration');
    INSERT INTO "user" VALUES
      (1, 'admin@example.invalid', 99, 4294967331, 'admin', 'bcrypt-hash', 9),
      (2, 'plex@example.invalid', 1, 32, 'plex-user', NULL, 0);
    INSERT INTO media VALUES
      (1, 'movie', 100, 'Movie', 'screen'),
      (2, 'tv', 200, 'Series', 'screen'),
      (3, 'book', 300, 'Book', 'bookshelf');
    INSERT INTO media_request VALUES
      (1, 1, 1, 'movie', 2, '[{"serviceType":"radarr","format":"standard"}]', NULL),
      (2, 2, 2, 'tv', 1, '[{"serviceType":"sonarr","format":"standard"}]', NULL),
      (3, 3, 1, 'book', 2, '[{"serviceType":"readarr","format":"ebook"}]', NULL);
    INSERT INTO season_request VALUES
      (1, 2, 1, 2),
      (2, 3, 1, 2);
    INSERT INTO watchlist VALUES
      (1, 'movie', 1, 1),
      (2, 'book', 3, 1);
    INSERT INTO blocklist VALUES
      (1, 'tv', 2),
      (2, 'book', 3);
    INSERT INTO user_settings VALUES
      (1, 1, '{"discord":1048584,"apprise":8}', '{"movie":true,"book":true}');
    INSERT INTO discover_slider VALUES
      (1, 1, TRUE, 'Recently added'),
      (2, 22, TRUE, 'Popular books');
    INSERT INTO session VALUES ('session-id', 2000000000, '{"userId":1}');
    INSERT INTO ng_feature VALUES (1, 'book-only');
  `);
};

const seedSeerrSource = async (database) => {
  await database.exec(`
    INSERT INTO migrations VALUES (1, 'seerr-migration');
    INSERT INTO "user" VALUES (1, 'admin@example.invalid', 2, 34, 'admin', 'bcrypt-hash');
    INSERT INTO media VALUES
      (1, 'movie', 100, 'Movie'),
      (2, 'tv', 200, 'Series');
    INSERT INTO media_request VALUES
      (1, 1, 1, 'movie', 2),
      (2, 2, 1, 'tv', 1);
    INSERT INTO season_request VALUES (1, 2, 1, 2);
    INSERT INTO watchlist VALUES (1, 'movie', 1, 1);
    INSERT INTO blocklist VALUES (1, 'tv', 2);
    INSERT INTO user_settings VALUES (1, 1, '{"discord":8}');
    INSERT INTO discover_slider VALUES (1, 1, TRUE, 'Recently added');
    INSERT INTO session VALUES ('session-id', 2000000000, '{"userId":1}');
    CREATE TABLE legacy_table (id INTEGER PRIMARY KEY, value TEXT);
    INSERT INTO legacy_table VALUES (1, 'source-only');
  `);
};

const migrationOptions = (direction, sourceDir, targetDir, apply = false) => ({
  direction,
  sourceDir,
  targetDir,
  sourceDb: 'sqlite',
  targetDb: 'sqlite',
  apply,
});

after(async () => {
  if (postgresSchemas.size && postgresTestUrl) {
    const client = new Client({ connectionString: postgresTestUrl });
    await client.connect();
    try {
      for (const schema of postgresSchemas) {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await client.end();
    }
  }
  for (const root of fixtures) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('Seerr and SeerrNG migration settings', () => {
  it('projects NG settings to the target Seerr shape and filters permission bits', () => {
    const projected = projectSeerrSettings(sourceSettings(), seerrDefaults());
    assert.equal(projected.settings.clientId, 'source-client');
    assert.equal(projected.settings.main.defaultPermissions, 32);
    assert.equal(projected.settings.main.enableBooks, undefined);
    assert.equal(projected.settings.main.enabledMediaCategories, undefined);
    assert.equal(projected.settings.plex.libraries[0].name, 'Films');
    assert.equal(projected.settings.tautulli.apiKey, 'tautulli-secret');
    assert.equal(
      projected.settings.notifications.agents.discord.options.webhookRoleId,
      '123'
    );
    assert.equal(projected.settings.notifications.agents.discord.types, 8);
    assert.equal(
      projected.settings.notifications.agents.discord.options.unsupportedOption,
      undefined
    );
    assert.deepEqual(projected.settings.migrations, [
      'seerr-target-migration-marker',
    ]);
    assert(projected.droppedPaths.includes('bookServices'));
    assert(projected.droppedPaths.includes('main.enableBooks'));
    assert(projected.droppedPaths.includes('main.enabledMediaCategories'));
    assert(
      projected.droppedPaths.includes(
        'notifications.agents.discord.types (unsupported notification bits removed)'
      )
    );
    assert(projected.droppedPaths.includes('radarr[0].unsupportedArrOption'));
  });

  it('accepts only the two explicit directions and defaults to a dry plan', () => {
    assert.equal(
      parseArguments([
        '--direction',
        'seerr-to-seerrng',
        '--source-dir',
        '/source',
        '--target-dir',
        '/target',
      ]).apply,
      false
    );
    assert.throws(
      () => parseArguments(['--direction', 'reverse']),
      /--direction must be/u
    );
  });
});

describe('SeerrNG to Seerr', () => {
  it('imports supported settings, users, sessions, requests, and rows; filters NG-only data', async () => {
    const root = await makeRoot();
    const sourceDir = await createConfig(
      root,
      'seerrng',
      sourceSettings(),
      sourceNgSchema,
      seedNgSource
    );
    const targetDir = await createConfig(
      root,
      'seerr',
      seerrDefaults(),
      seerrSchema(),
      (database) => {
        database.exec(`
          INSERT INTO migrations VALUES (1, 'target-seerr-migration');
          INSERT INTO discover_slider VALUES
            (20, 1, 1, 'Target default one'),
            (21, 2, 1, 'Target default two');
        `);
      }
    );
    const beforeSourceSettings = await fs.readFile(
      path.join(sourceDir, 'settings.json'),
      'utf8'
    );
    const beforeSourceDatabase = await readDatabaseFile(sourceDir);
    const beforeTargetSettings = await fs.readFile(
      path.join(targetDir, 'settings.json'),
      'utf8'
    );
    const beforeTargetDatabase = await readDatabaseFile(targetDir);

    const plan = await migrate(
      migrationOptions('seerrng-to-seerr', sourceDir, targetDir)
    );
    assert.equal(plan.mode, 'plan');
    assert.equal(
      plan.database.importedTables.find((table) => table.table === 'user')
        .plannedRows,
      2
    );
    assert.equal(plan.database.skippedRows.unsupportedMediaType.media, 1);
    assert.equal(
      plan.database.skippedRows.unsupportedMediaType.media_request,
      1
    );
    assert.equal(
      plan.database.skippedRows.unsupportedDiscoverSliderType.discover_slider,
      1
    );
    assert.equal(plan.database.maskedUserPermissions, 1);
    assert.equal(plan.database.convertedUserTypes, 1);
    assert.equal(plan.database.sanitizedNotificationSettings, 1);
    assert.equal(
      plan.database.skippedRows.missingReferencedRow.season_request,
      1
    );
    assert.equal(
      plan.database.sourceOnlyTables.find(
        (table) => table.table === 'ng_feature'
      ).rows,
      1
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      0
    );
    assert.equal(
      readDatabase(
        targetDir,
        'SELECT COUNT(*) AS count FROM discover_slider'
      )[0].count,
      2
    );
    assert.equal(
      await fs.readFile(path.join(targetDir, 'settings.json'), 'utf8'),
      beforeTargetSettings
    );
    assert.deepEqual(await readDatabaseFile(targetDir), beforeTargetDatabase);

    const result = await migrate(
      migrationOptions('seerrng-to-seerr', sourceDir, targetDir, true)
    );
    assert.equal(result.mode, 'apply');
    assert.equal(result.settings.copied, true);
    assert.equal(result.database.integrity, 'SQLite foreign_key_check passed');
    assert(
      result.database.droppedColumns.some((entry) => entry.table === 'user')
    );
    assert(
      result.database.droppedColumns.some(
        (entry) => entry.table === 'media_request'
      )
    );

    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM media')[0].count,
      2
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      2
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM media_request')[0]
        .count,
      2
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM season_request')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM watchlist')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM blocklist')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM session')[0].count,
      1
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, mediaType, tmdbId, title FROM media ORDER BY id'
      ),
      [
        { id: 1, mediaType: 'movie', tmdbId: 100, title: 'Movie' },
        { id: 2, mediaType: 'tv', tmdbId: 200, title: 'Series' },
      ]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, mediaId, requestedById, type, status FROM media_request ORDER BY id'
      ),
      [
        { id: 1, mediaId: 1, requestedById: 1, type: 'movie', status: 2 },
        { id: 2, mediaId: 2, requestedById: 2, type: 'tv', status: 1 },
      ]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, requestId, seasonNumber, status FROM season_request ORDER BY id'
      ),
      [{ id: 1, requestId: 2, seasonNumber: 1, status: 2 }]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT mediaType, mediaId, requestedById FROM watchlist'
      ),
      [{ mediaType: 'movie', mediaId: 1, requestedById: 1 }]
    );
    assert.deepEqual(
      readDatabase(targetDir, 'SELECT mediaType, mediaId FROM blocklist'),
      [{ mediaType: 'tv', mediaId: 2 }]
    );
    assert.deepEqual(readDatabase(targetDir, 'SELECT id, json FROM session'), [
      { id: 'session-id', json: '{"userId":1}' },
    ]);
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, email, userType, permissions, username, password FROM user ORDER BY id'
      ),
      [
        {
          id: 1,
          email: 'admin@example.invalid',
          userType: 2,
          permissions: 34,
          username: 'admin',
          password: 'bcrypt-hash',
        },
        {
          id: 2,
          email: 'plex@example.invalid',
          userType: 1,
          permissions: 32,
          username: 'plex-user',
          password: null,
        },
      ]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, userId, notificationTypes FROM user_settings ORDER BY id'
      ),
      [{ id: 1, userId: 1, notificationTypes: '{"discord":8}' }]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, type, title FROM discover_slider ORDER BY id'
      ),
      [{ id: 1, type: 1, title: 'Recently added' }]
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT name FROM migrations')[0].name,
      'target-seerr-migration'
    );

    const importedSettings = await readSettings(targetDir);
    assert.equal(importedSettings.main.applicationTitle, 'Source SeerrNG');
    assert.equal(importedSettings.main.defaultPermissions, 32);
    assert.equal(importedSettings.tautulli.apiKey, 'tautulli-secret');
    assert.equal(importedSettings.bookServices, undefined);
    assert.deepEqual(importedSettings.migrations, [
      'seerr-target-migration-marker',
    ]);
    assert.equal(
      await fs.readFile(path.join(sourceDir, 'settings.json'), 'utf8'),
      beforeSourceSettings
    );
    assert.deepEqual(await readDatabaseFile(sourceDir), beforeSourceDatabase);
    assert.equal(
      readDatabase(sourceDir, 'SELECT COUNT(*) AS count FROM media')[0].count,
      3
    );
    assert.equal(
      readDatabase(sourceDir, 'SELECT COUNT(*) AS count FROM ng_feature')[0]
        .count,
      1
    );
    assert(!JSON.stringify(result).includes('source-api-key'));
    assert(!JSON.stringify(result).includes('book-secret'));
  });
});

describe('Seerr to SeerrNG', () => {
  it('imports the complete Seerr database and overlays its settings onto NG defaults', async () => {
    const root = await makeRoot();
    const sourceSettingsValue = seerrSettings();
    const sourceDir = await createConfig(
      root,
      'seerr',
      sourceSettingsValue,
      seerrSchema(),
      seedSeerrSource
    );
    const ngDefaults = {
      ...seerrNgDefaults(),
      main: { ...seerrNgDefaults().main, enableBooks: false },
      migrations: ['ng-target-migration-marker'],
    };
    const targetDir = await createConfig(
      root,
      'seerrng',
      ngDefaults,
      seerrSchema({ ngExtras: true }),
      (database) => {
        database.exec(`
          CREATE TABLE seerr_migration_lock (id INTEGER PRIMARY KEY, acquiredAt TEXT);
          INSERT INTO seerr_migration_lock VALUES (1, '2026-11-04');
          INSERT INTO migrations VALUES (1, 'target-ng-migration');
          INSERT INTO discover_slider VALUES (20, 1, 1, 'Target default');
        `);
      }
    );
    const sourceSettingsText = await fs.readFile(
      path.join(sourceDir, 'settings.json'),
      'utf8'
    );
    const sourceDatabaseBytes = await readDatabaseFile(sourceDir);
    const targetSettingsText = await fs.readFile(
      path.join(targetDir, 'settings.json'),
      'utf8'
    );
    const targetDatabaseBytes = await readDatabaseFile(targetDir);

    const plan = await migrate(
      migrationOptions('seerr-to-seerrng', sourceDir, targetDir)
    );
    assert.equal(plan.mode, 'plan');
    assert.equal(plan.database.totalImportedRows > 0, true);
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      0
    );
    assert.equal(
      readDatabase(
        targetDir,
        'SELECT COUNT(*) AS count FROM discover_slider'
      )[0].count,
      1
    );
    assert.equal(
      await fs.readFile(path.join(targetDir, 'settings.json'), 'utf8'),
      targetSettingsText
    );
    assert.deepEqual(await readDatabaseFile(targetDir), targetDatabaseBytes);

    const result = await migrate(
      migrationOptions('seerr-to-seerrng', sourceDir, targetDir, true)
    );
    assert.equal(result.settings.copied, true);
    assert.equal(result.database.integrity, 'SQLite foreign_key_check passed');
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM media')[0].count,
      2
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM media_request')[0]
        .count,
      2
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, mediaType, tmdbId, title FROM media ORDER BY id'
      ),
      [
        { id: 1, mediaType: 'movie', tmdbId: 100, title: 'Movie' },
        { id: 2, mediaType: 'tv', tmdbId: 200, title: 'Series' },
      ]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, mediaId, requestedById, type, status FROM media_request ORDER BY id'
      ),
      [
        { id: 1, mediaId: 1, requestedById: 1, type: 'movie', status: 2 },
        { id: 2, mediaId: 2, requestedById: 1, type: 'tv', status: 1 },
      ]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, requestId, seasonNumber, status FROM season_request ORDER BY id'
      ),
      [{ id: 1, requestId: 2, seasonNumber: 1, status: 2 }]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT mediaType, mediaId, requestedById FROM watchlist'
      ),
      [{ mediaType: 'movie', mediaId: 1, requestedById: 1 }]
    );
    assert.deepEqual(
      readDatabase(targetDir, 'SELECT mediaType, mediaId FROM blocklist'),
      [{ mediaType: 'tv', mediaId: 2 }]
    );
    assert.deepEqual(readDatabase(targetDir, 'SELECT id, json FROM session'), [
      { id: 'session-id', json: '{"userId":1}' },
    ]);
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, email, userType, permissions, username, password FROM user ORDER BY id'
      ),
      [
        {
          id: 1,
          email: 'admin@example.invalid',
          userType: 2,
          permissions: 34,
          username: 'admin',
          password: 'bcrypt-hash',
        },
      ]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, userId, notificationTypes FROM user_settings ORDER BY id'
      ),
      [{ id: 1, userId: 1, notificationTypes: '{"discord":8}' }]
    );
    assert.deepEqual(
      readDatabase(
        targetDir,
        'SELECT id, type, title FROM discover_slider ORDER BY id'
      ),
      [{ id: 1, type: 1, title: 'Recently added' }]
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM season_request')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT ngRequired FROM media WHERE id = 1')[0]
        .ngRequired,
      'target-default'
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT name FROM migrations')[0].name,
      'target-ng-migration'
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM ng_feature')[0]
        .count,
      0
    );

    const importedSettings = await readSettings(targetDir);
    assert.equal(importedSettings.main.applicationTitle, 'Seerr source');
    assert.equal(importedSettings.main.enableBooks, false);
    assert.deepEqual(importedSettings.migrations, [
      'ng-target-migration-marker',
    ]);
    assert.deepEqual(importedSettings.books, { enabled: false });
    assert.equal(
      await fs.readFile(path.join(sourceDir, 'settings.json'), 'utf8'),
      sourceSettingsText
    );
    assert.deepEqual(await readDatabaseFile(sourceDir), sourceDatabaseBytes);
    assert.equal(
      readDatabase(sourceDir, 'SELECT COUNT(*) AS count FROM media')[0].count,
      2
    );
    assert.equal(
      result.database.sourceOnlyTables.find(
        (table) => table.table === 'legacy_table'
      ).rows,
      1
    );
  });

  it('round-trips Seerr through SeerrNG and back, reducing trial-only data', async () => {
    const root = await makeRoot();
    const originalSeerrDir = await createConfig(
      root,
      'original-seerr',
      seerrSettings(),
      seerrSchema(),
      seedSeerrSource
    );
    const seerrNgDir = await createConfig(
      root,
      'trial-seerrng',
      seerrNgDefaults(),
      seerrSchema({ ngExtras: true }),
      (database) => {
        database.exec(`
          INSERT INTO migrations VALUES (1, 'ng-target-migration');
          INSERT INTO discover_slider VALUES (20, 1, 1, 'NG default');
        `);
      }
    );

    await migrate(
      migrationOptions('seerr-to-seerrng', originalSeerrDir, seerrNgDir, true)
    );

    const trialSettings = await readSettings(seerrNgDir);
    trialSettings.main.enableBooks = true;
    trialSettings.books = { enabled: true };
    await fs.writeFile(
      path.join(seerrNgDir, 'settings.json'),
      `${JSON.stringify(trialSettings, null, 2)}\n`
    );
    const trialDatabase = new Database(
      path.join(seerrNgDir, 'db', 'db.sqlite3')
    );
    trialDatabase.exec(`
      INSERT INTO media (id, mediaType, tmdbId, title, ngOnlyIdentity)
        VALUES (3, 'book', 300, 'Trial book', 'bookshelf');
      INSERT INTO media_request VALUES (3, 3, 1, 'book', 2, NULL, NULL);
      INSERT INTO season_request VALUES (2, 3, 1, 2);
      INSERT INTO watchlist VALUES (2, 'book', 3, 1);
      INSERT INTO blocklist VALUES (2, 'book', 3);
      INSERT INTO ng_feature VALUES (1, 'trial-only');
    `);
    trialDatabase.close();

    const finalSeerrDir = await createConfig(
      root,
      'final-seerr',
      seerrDefaults(),
      seerrSchema(),
      (database) => {
        database.exec(`
          INSERT INTO migrations VALUES (1, 'seerr-target-migration');
          INSERT INTO discover_slider VALUES (20, 1, 1, 'Seerr default');
        `);
      }
    );
    const trialSettingsText = await fs.readFile(
      path.join(seerrNgDir, 'settings.json'),
      'utf8'
    );
    const trialDatabaseBytes = await readDatabaseFile(seerrNgDir);
    const result = await migrate(
      migrationOptions('seerrng-to-seerr', seerrNgDir, finalSeerrDir, true)
    );

    assert.equal(result.database.integrity, 'SQLite foreign_key_check passed');
    assert.equal(result.database.skippedRows.unsupportedMediaType.media, 1);
    assert.equal(
      result.database.skippedRows.unsupportedMediaType.media_request,
      1
    );
    assert.equal(result.database.skippedRows.unsupportedMediaType.watchlist, 1);
    assert.equal(result.database.skippedRows.unsupportedMediaType.blocklist, 1);
    assert.equal(
      result.database.skippedRows.missingReferencedRow.season_request,
      1
    );
    assert.equal(
      readDatabase(finalSeerrDir, 'SELECT COUNT(*) AS count FROM media')[0]
        .count,
      2
    );
    assert.equal(
      readDatabase(
        finalSeerrDir,
        'SELECT COUNT(*) AS count FROM media_request'
      )[0].count,
      2
    );
    assert.equal(
      readDatabase(
        finalSeerrDir,
        'SELECT COUNT(*) AS count FROM season_request'
      )[0].count,
      1
    );
    assert.equal(
      readDatabase(finalSeerrDir, 'SELECT COUNT(*) AS count FROM watchlist')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(finalSeerrDir, 'SELECT COUNT(*) AS count FROM blocklist')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(finalSeerrDir, 'SELECT COUNT(*) AS count FROM user')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(finalSeerrDir, 'SELECT COUNT(*) AS count FROM session')[0]
        .count,
      1
    );
    assert.equal(
      readDatabase(finalSeerrDir, 'SELECT name FROM migrations')[0].name,
      'seerr-target-migration'
    );
    const finalSettings = await readSettings(finalSeerrDir);
    assert.equal(finalSettings.main.applicationTitle, 'Seerr source');
    assert.equal(finalSettings.main.enableBooks, undefined);
    assert.equal(finalSettings.books, undefined);
    assert.equal(finalSettings.clientId, 'seerr-client');
    assert.deepEqual(
      readDatabase(
        finalSeerrDir,
        'SELECT id, email, userType, permissions, username, password FROM user ORDER BY id'
      ),
      [
        {
          id: 1,
          email: 'admin@example.invalid',
          userType: 2,
          permissions: 34,
          username: 'admin',
          password: 'bcrypt-hash',
        },
      ]
    );
    assert.deepEqual(
      readDatabase(
        finalSeerrDir,
        'SELECT id, mediaId, requestedById, type, status FROM media_request ORDER BY id'
      ),
      [
        { id: 1, mediaId: 1, requestedById: 1, type: 'movie', status: 2 },
        { id: 2, mediaId: 2, requestedById: 1, type: 'tv', status: 1 },
      ]
    );
    assert.deepEqual(
      readDatabase(
        finalSeerrDir,
        'SELECT id, requestId, seasonNumber, status FROM season_request ORDER BY id'
      ),
      [{ id: 1, requestId: 2, seasonNumber: 1, status: 2 }]
    );
    assert.deepEqual(
      readDatabase(
        finalSeerrDir,
        'SELECT id, userId, notificationTypes FROM user_settings ORDER BY id'
      ),
      [{ id: 1, userId: 1, notificationTypes: '{"discord":8}' }]
    );
    assert.deepEqual(
      readDatabase(
        finalSeerrDir,
        'SELECT mediaType, mediaId, requestedById FROM watchlist'
      ),
      [{ mediaType: 'movie', mediaId: 1, requestedById: 1 }]
    );
    assert.deepEqual(
      readDatabase(finalSeerrDir, 'SELECT mediaType, mediaId FROM blocklist'),
      [{ mediaType: 'tv', mediaId: 2 }]
    );
    assert.deepEqual(
      readDatabase(finalSeerrDir, 'SELECT id, json FROM session'),
      [{ id: 'session-id', json: '{"userId":1}' }]
    );
    assert.equal(
      await fs.readFile(path.join(seerrNgDir, 'settings.json'), 'utf8'),
      trialSettingsText
    );
    assert.deepEqual(await readDatabaseFile(seerrNgDir), trialDatabaseBytes);
  });

  it('refuses source and target paths that alias the same SQLite database', async () => {
    const root = await makeRoot();
    const sourceDir = await createConfig(
      root,
      'source',
      seerrSettings(),
      seerrSchema(),
      seedSeerrSource
    );
    const targetDir = await createConfig(
      root,
      'target',
      seerrNgDefaults(),
      seerrSchema({ ngExtras: true })
    );
    const sourceDatabasePath = path.join(sourceDir, 'db', 'db.sqlite3');
    const targetDatabasePath = path.join(targetDir, 'db', 'db.sqlite3');
    const sourceDatabaseBytes = await readDatabaseFile(sourceDir);
    const targetSettingsText = await fs.readFile(
      path.join(targetDir, 'settings.json'),
      'utf8'
    );
    await fs.rm(targetDatabasePath);
    await fs.link(sourceDatabasePath, targetDatabasePath);

    await assert.rejects(
      migrate(migrationOptions('seerr-to-seerrng', sourceDir, targetDir, true)),
      /resolve to the same database/u
    );
    assert.deepEqual(await readDatabaseFile(sourceDir), sourceDatabaseBytes);
    assert.equal(
      await fs.readFile(path.join(targetDir, 'settings.json'), 'utf8'),
      targetSettingsText
    );
  });

  it('refuses to overwrite a target that already has user data', async () => {
    const root = await makeRoot();
    const sourceDir = await createConfig(
      root,
      'source',
      seerrSettings(),
      seerrSchema(),
      seedSeerrSource
    );
    const targetDir = await createConfig(
      root,
      'target',
      seerrNgDefaults(),
      seerrSchema({ ngExtras: true }),
      (database) => {
        database.exec(`
          INSERT INTO user VALUES (1, 'existing@example.invalid', 2, 2, 'existing', NULL, 0);
          INSERT INTO discover_slider VALUES (20, 1, 1, 'Default');
        `);
      }
    );
    await assert.rejects(
      migrate(migrationOptions('seerr-to-seerrng', sourceDir, targetDir, true)),
      /Target database is not empty: user \(1\)/u
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      1
    );
  });

  it('refuses a direction that does not match the initialized target product', async () => {
    const root = await makeRoot();
    const sourceDir = await createConfig(
      root,
      'source',
      seerrSettings(),
      seerrSchema(),
      seedSeerrSource
    );
    const targetDir = await createConfig(
      root,
      'target',
      seerrDefaults(),
      seerrSchema(),
      (database) => database.exec("INSERT INTO migrations VALUES (1, 'target')")
    );
    await assert.rejects(
      migrate(migrationOptions('seerr-to-seerrng', sourceDir, targetDir, true)),
      /target appears to be Seerr/u
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      0
    );
  });

  it('reports target columns with no source value or database default before applying', async () => {
    const root = await makeRoot();
    const sourceDir = await createConfig(
      root,
      'source',
      seerrSettings(),
      seerrSchema(),
      seedSeerrSource
    );
    const targetDir = await createConfig(
      root,
      'target',
      seerrNgDefaults(),
      seerrSchema({ requiredTargetColumn: true }),
      (database) => {
        database.exec(`
          INSERT INTO migrations VALUES (1, 'target');
          INSERT INTO discover_slider VALUES (20, 1, 1, 'Default');
        `);
      }
    );
    const plan = await migrate(
      migrationOptions('seerr-to-seerrng', sourceDir, targetDir)
    );
    assert.deepEqual(
      plan.database.unfillableColumns.find((entry) => entry.table === 'media')
        ?.columns,
      ['requiredByTarget']
    );
    await assert.rejects(
      migrate(migrationOptions('seerr-to-seerrng', sourceDir, targetDir, true)),
      /media\.requiredByTarget/u
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      0
    );
    assert.equal(
      readDatabase(
        targetDir,
        'SELECT COUNT(*) AS count FROM discover_slider'
      )[0].count,
      1
    );
  });

  it('rolls back target rows and settings if a target constraint prevents the import', async () => {
    const root = await makeRoot();
    const sourceDir = await createConfig(
      root,
      'source',
      seerrSettings(),
      seerrSchema(),
      seedSeerrSource
    );
    const targetDir = await createConfig(
      root,
      'target',
      seerrNgDefaults(),
      seerrSchema({ ngExtras: true, rejectTvId: true }),
      (database) => {
        database.exec(`
          INSERT INTO migrations VALUES (1, 'target-migration');
          INSERT INTO discover_slider VALUES (20, 1, 1, 'Default');
        `);
      }
    );
    const originalSettings = await fs.readFile(
      path.join(targetDir, 'settings.json'),
      'utf8'
    );
    await assert.rejects(
      migrate(migrationOptions('seerr-to-seerrng', sourceDir, targetDir, true)),
      /CHECK constraint failed/u
    );
    assert.equal(
      readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
      0
    );
    assert.equal(
      readDatabase(
        targetDir,
        'SELECT COUNT(*) AS count FROM discover_slider'
      )[0].count,
      1
    );
    assert.equal(
      await fs.readFile(path.join(targetDir, 'settings.json'), 'utf8'),
      originalSettings
    );
  });
});

describe('PostgreSQL and mixed-database migration integration', () => {
  it(
    'migrates Seerr from PostgreSQL to SeerrNG SQLite without changing the source',
    { skip: !postgresTestUrl },
    async () => {
      const root = await makeRoot();
      const source = await createPostgresConfig(
        root,
        'seerr-postgres',
        seerrSettings(),
        seerrSchema(),
        seedSeerrSource
      );
      const targetDir = await createConfig(
        root,
        'seerrng-sqlite',
        seerrNgDefaults(),
        seerrSchema({ ngExtras: true }),
        async (database) => {
          database.exec(`
            CREATE TABLE seerr_migration_lock (id INTEGER PRIMARY KEY, acquiredAt TEXT);
          INSERT INTO seerr_migration_lock VALUES (1, '2026-11-04');
          INSERT INTO migrations VALUES (1, 'target-ng-migration');
            INSERT INTO discover_slider VALUES (20, 1, TRUE, 'NG default');
          `);
        }
      );
      const sourceSettingsText = await fs.readFile(
        path.join(source.directory, 'settings.json'),
        'utf8'
      );
      const beforeSource = await readPostgres(
        source.connectionString,
        'SELECT id, email, "userType", permissions FROM "user" ORDER BY id'
      );

      const result = await withMigrationDatabaseUrls(
        source.connectionString,
        undefined,
        () =>
          migrate({
            ...migrationOptions(
              'seerr-to-seerrng',
              source.directory,
              targetDir,
              true
            ),
            sourceDb: 'postgres',
          })
      );

      assert.equal(
        result.database.integrity,
        'SQLite foreign_key_check passed'
      );
      assert.equal(
        readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM user')[0].count,
        1
      );
      assert.equal(
        readDatabase(targetDir, 'SELECT COUNT(*) AS count FROM media')[0].count,
        2
      );
      assert.equal(
        (await readSettings(targetDir)).main.applicationTitle,
        'Seerr source'
      );
      assert.deepEqual(
        await readPostgres(
          source.connectionString,
          'SELECT id, email, "userType", permissions FROM "user" ORDER BY id'
        ),
        beforeSource
      );
      assert.equal(
        await fs.readFile(path.join(source.directory, 'settings.json'), 'utf8'),
        sourceSettingsText
      );
    }
  );

  it(
    'migrates SeerrNG SQLite to Seerr PostgreSQL and resets identity sequences',
    { skip: !postgresTestUrl },
    async () => {
      const root = await makeRoot();
      const sourceDir = await createConfig(
        root,
        'seerrng-sqlite',
        sourceSettings(),
        sourceNgSchema,
        seedNgSource
      );
      const target = await createPostgresConfig(
        root,
        'seerr-postgres',
        seerrDefaults(),
        seerrSchema(),
        async (database) => {
          await database.exec(`
            INSERT INTO migrations VALUES (1, 'target-seerr-migration');
            INSERT INTO discover_slider VALUES (20, 1, TRUE, 'Seerr default');
          `);
        }
      );
      const sourceSettingsText = await fs.readFile(
        path.join(sourceDir, 'settings.json'),
        'utf8'
      );
      const sourceDatabaseBytes = await readDatabaseFile(sourceDir);

      const result = await withMigrationDatabaseUrls(
        undefined,
        target.connectionString,
        () =>
          migrate({
            ...migrationOptions(
              'seerrng-to-seerr',
              sourceDir,
              target.directory,
              true
            ),
            targetDb: 'postgres',
          })
      );

      assert.equal(result.database.integrity, 'PostgreSQL constraints passed');
      assert.equal(
        Number(
          (
            await readPostgres(
              target.connectionString,
              'SELECT COUNT(*) AS count FROM "user"'
            )
          )[0].count
        ),
        2
      );
      assert.deepEqual(
        await readPostgres(
          target.connectionString,
          'SELECT id, "mediaType", "tmdbId", title FROM media ORDER BY id'
        ),
        [
          { id: 1, mediaType: 'movie', tmdbId: 100, title: 'Movie' },
          { id: 2, mediaType: 'tv', tmdbId: 200, title: 'Series' },
        ]
      );
      assert.equal(
        Number(
          (
            await readPostgres(
              target.connectionString,
              `SELECT nextval(pg_get_serial_sequence(format('%I.%I', current_schema(), 'user'), 'id')) AS next_id`
            )
          )[0].next_id
        ),
        3
      );
      const importedSettings = await readSettings(target.directory);
      assert.equal(importedSettings.main.applicationTitle, 'Source SeerrNG');
      assert.equal(importedSettings.main.enableBooks, undefined);
      assert.equal(importedSettings.bookServices, undefined);
      assert.equal(
        await fs.readFile(path.join(sourceDir, 'settings.json'), 'utf8'),
        sourceSettingsText
      );
      assert.deepEqual(await readDatabaseFile(sourceDir), sourceDatabaseBytes);
    }
  );

  it(
    'rolls back a PostgreSQL target transaction and settings after an import constraint failure',
    { skip: !postgresTestUrl },
    async () => {
      const root = await makeRoot();
      const sourceDir = await createConfig(
        root,
        'seerr-sqlite',
        seerrSettings(),
        seerrSchema(),
        seedSeerrSource
      );
      const target = await createPostgresConfig(
        root,
        'seerrng-postgres',
        seerrNgDefaults(),
        seerrSchema({ ngExtras: true, rejectTvId: true }),
        async (database) => {
          await database.exec(`
            CREATE TABLE seerr_migration_lock (id INTEGER PRIMARY KEY, acquiredAt TEXT);
          INSERT INTO seerr_migration_lock VALUES (1, '2026-11-04');
          INSERT INTO migrations VALUES (1, 'target-ng-migration');
            INSERT INTO discover_slider VALUES (20, 1, TRUE, 'NG default');
          `);
        }
      );
      const originalSettings = await fs.readFile(
        path.join(target.directory, 'settings.json'),
        'utf8'
      );

      await assert.rejects(
        withMigrationDatabaseUrls(undefined, target.connectionString, () =>
          migrate({
            ...migrationOptions(
              'seerr-to-seerrng',
              sourceDir,
              target.directory,
              true
            ),
            targetDb: 'postgres',
          })
        ),
        /violates check constraint/u
      );
      assert.equal(
        Number(
          (
            await readPostgres(
              target.connectionString,
              'SELECT COUNT(*) AS count FROM "user"'
            )
          )[0].count
        ),
        0
      );
      assert.deepEqual(
        await readPostgres(
          target.connectionString,
          'SELECT id, title FROM discover_slider'
        ),
        [{ id: 20, title: 'NG default' }]
      );
      assert.equal(
        await fs.readFile(path.join(target.directory, 'settings.json'), 'utf8'),
        originalSettings
      );
    }
  );
});
