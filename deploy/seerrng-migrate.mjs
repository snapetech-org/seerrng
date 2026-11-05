#!/usr/bin/env node
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

const TOOL_VERSION = 1;
const MIGRATION_TABLES = new Set([
  'migrations',
  'typeorm_metadata',
  'seerr_migration_lock',
]);
const SEERR_PERMISSION_MASK = 0x5ffffffen;
const SEERR_NOTIFICATION_MASK = 0x1ffen;
const SEERR_MEDIA_TYPES = new Set(['movie', 'tv']);
const SEERR_USER_TYPES = new Set([1, 2, 3, 4]);
const SEERR_DISCOVER_SLIDER_TYPES = new Set(
  Array.from({ length: 21 }, (_, index) => index + 1)
);
const SEERR_NOTIFICATION_AGENTS = new Set([
  'discord',
  'email',
  'gotify',
  'ntfy',
  'pushbullet',
  'pushover',
  'slack',
  'telegram',
  'webhook',
  'webpush',
]);
const SEERRNG_SETTING_MARKERS = [
  'enabledMediaCategories',
  'defaultEnabledMediaCategories',
  'downloadPathMappings',
  'ageGate',
];
const SEERRNG_TABLE_MARKERS = new Set([
  'media_identifier',
  'media_search_metadata',
  'software_request',
]);
const REQUIRED_CORE_TABLES = ['media', 'media_request', 'user'];

const SETTINGS_ARRAY_ITEM_KEYS = {
  'plex.libraries': ['id', 'name', 'enabled', 'type', 'lastScan'],
  'jellyfin.libraries': ['id', 'name', 'enabled', 'type', 'lastScan'],
  radarr: [
    'id',
    'name',
    'hostname',
    'port',
    'apiKey',
    'useSsl',
    'baseUrl',
    'activeProfileId',
    'activeProfileName',
    'activeDirectory',
    'tags',
    'is4k',
    'isDefault',
    'externalUrl',
    'syncEnabled',
    'preventSearch',
    'tagRequests',
    'overrideRule',
    'minimumAvailability',
  ],
  sonarr: [
    'id',
    'name',
    'hostname',
    'port',
    'apiKey',
    'useSsl',
    'baseUrl',
    'activeProfileId',
    'activeProfileName',
    'activeDirectory',
    'tags',
    'is4k',
    'isDefault',
    'externalUrl',
    'syncEnabled',
    'preventSearch',
    'tagRequests',
    'overrideRule',
    'seriesType',
    'animeSeriesType',
    'activeAnimeProfileId',
    'activeAnimeProfileName',
    'activeAnimeDirectory',
    'activeAnimeLanguageProfileId',
    'activeLanguageProfileId',
    'animeTags',
    'enableSeasonFolders',
    'monitorNewItems',
  ],
};

const SETTINGS_OBJECT_EXTRA_KEYS = {
  plex: ['machineId', 'webAppUrl'],
  jellyfin: ['urlBase', 'externalHostname', 'jellyfinForgotPasswordUrl'],
  tautulli: ['hostname', 'port', 'useSsl', 'urlBase', 'apiKey', 'externalUrl'],
  'network.dnsCache': ['forceMinTtl', 'forceMaxTtl'],
};

const NOTIFICATION_OPTION_KEYS = {
  discord: [
    'botUsername',
    'botAvatarUrl',
    'webhookUrl',
    'webhookRoleId',
    'webhookThreadId',
    'enableMentions',
    'locale',
    'useUserLocale',
  ],
  email: [
    'userEmailRequired',
    'emailFrom',
    'smtpHost',
    'smtpPort',
    'secure',
    'ignoreTls',
    'requireTls',
    'authUser',
    'authPass',
    'allowSelfSigned',
    'senderName',
    'usePublicLogo',
    'pgpPrivateKey',
    'pgpPassword',
  ],
  gotify: ['url', 'token', 'priority', 'locale'],
  ntfy: [
    'url',
    'topic',
    'tags',
    'authMethodUsernamePassword',
    'username',
    'password',
    'authMethodToken',
    'token',
    'priority',
    'locale',
  ],
  pushbullet: ['accessToken', 'channelTag'],
  pushover: ['accessToken', 'userToken', 'sound'],
  slack: ['webhookUrl', 'locale'],
  telegram: [
    'botUsername',
    'botAPI',
    'chatId',
    'messageThreadId',
    'sendSilently',
  ],
  webhook: [
    'webhookUrl',
    'jsonPayload',
    'authHeader',
    'customHeaders',
    'supportVariables',
  ],
  webpush: [],
};

const USAGE = `Usage:
  node deploy/seerrng-migrate.mjs --direction seerr-to-seerrng --source-dir <config> --target-dir <config> [--source-db sqlite|postgres] [--target-db sqlite|postgres] [--apply]
  node deploy/seerrng-migrate.mjs --direction seerrng-to-seerr --source-dir <config> --target-dir <config> [--source-db sqlite|postgres] [--target-db sqlite|postgres] [--apply]

Without --apply, the tool prints a read-only migration plan. PostgreSQL
connection URLs are read from SEERR_MIGRATION_SOURCE_DATABASE_URL and
SEERR_MIGRATION_TARGET_DATABASE_URL. SQLite defaults to <config>/db/db.sqlite3.`;

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeTable = (name) => String(name).toLowerCase();

const clone = (value) => JSON.parse(JSON.stringify(value));

const displayError = (error) =>
  String(error?.message ?? error).replace(
    /postgres(?:ql)?:\/\/[^\s'"<>]+/giu,
    '<redacted PostgreSQL URL>'
  );

export function parseArguments(args) {
  const options = { apply: false, sourceDb: 'sqlite', targetDb: 'sqlite' };
  const valueOptions = new Set([
    '--direction',
    '--source-dir',
    '--target-dir',
    '--source-db',
    '--target-db',
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (!valueOptions.has(argument) || !args[index + 1]) {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    }
    options[
      argument
        .slice(2)
        .replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    ] = args[index + 1];
    index += 1;
  }

  if (options.help) return options;
  if (!['seerr-to-seerrng', 'seerrng-to-seerr'].includes(options.direction)) {
    throw new Error('--direction must be seerr-to-seerrng or seerrng-to-seerr');
  }
  if (!options.sourceDir || !options.targetDir) {
    throw new Error('--source-dir and --target-dir are required');
  }
  for (const field of ['sourceDb', 'targetDb']) {
    if (!['sqlite', 'postgres'].includes(options[field])) {
      throw new Error(
        `--${field.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} must be sqlite or postgres`
      );
    }
  }
  return options;
}

async function checkedConfigFile(directory, name) {
  const filePath = path.join(directory, name);
  const metadata = await fs.lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${filePath} must be a regular file, not a symlink`);
  }
  return filePath;
}

async function readJsonFile(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${displayError(error)}`);
  }
  if (!isObject(parsed)) throw new Error(`${label} must contain a JSON object`);
  return parsed;
}

function mergeSettings(defaults, incoming) {
  if (Array.isArray(incoming)) return clone(incoming);
  if (!isObject(defaults) || !isObject(incoming)) return clone(incoming);

  const result = clone(defaults);
  for (const [key, value] of Object.entries(incoming)) {
    result[key] =
      key in result ? mergeSettings(result[key], value) : clone(value);
  }
  return result;
}

function optionalNotificationKeys(pathname) {
  const match = pathname.match(/^notifications\.agents\.([^.]+)\.options$/u);
  return match ? (NOTIFICATION_OPTION_KEYS[match[1]] ?? []) : [];
}

function settingArrayKeys(pathname, sample) {
  if (SETTINGS_ARRAY_ITEM_KEYS[pathname]) {
    return SETTINGS_ARRAY_ITEM_KEYS[pathname];
  }
  if (pathname === 'notifications.agents.webhook.options.customHeaders') {
    return ['key', 'value'];
  }
  if (sample.length > 0 && isObject(sample[0])) {
    return Object.keys(sample[0]);
  }
  return undefined;
}

function allowedObjectKeys(pathname, defaults) {
  const allowed = new Set(isObject(defaults) ? Object.keys(defaults) : []);
  for (const key of SETTINGS_OBJECT_EXTRA_KEYS[pathname] ?? []) {
    allowed.add(key);
  }
  for (const key of optionalNotificationKeys(pathname)) {
    allowed.add(key);
  }
  return allowed;
}

function projectSeerrSettingsNode(
  value,
  defaults,
  pathname,
  droppedPaths,
  explicitAllowedKeys
) {
  if (pathname === 'migrations') return clone(defaults ?? []);

  if (Array.isArray(value)) {
    if (pathname === 'radarr' || pathname === 'sonarr') {
      const itemKeys = SETTINGS_ARRAY_ITEM_KEYS[pathname];
      return value.map((item, index) =>
        projectSeerrSettingsNode(
          item,
          {},
          `${pathname}[${index}]`,
          droppedPaths,
          itemKeys
        )
      );
    }

    if (pathname === 'plex.libraries' || pathname === 'jellyfin.libraries') {
      const itemKeys = SETTINGS_ARRAY_ITEM_KEYS[pathname];
      return value.map((item, index) =>
        projectSeerrSettingsNode(
          item,
          {},
          `${pathname}[${index}]`,
          droppedPaths,
          itemKeys
        )
      );
    }

    if (pathname === 'notifications.agents.webhook.options.customHeaders') {
      return value.map((item, index) =>
        projectSeerrSettingsNode(
          item,
          {},
          `${pathname}[${index}]`,
          droppedPaths,
          ['key', 'value']
        )
      );
    }

    if (value.every((item) => !isObject(item))) return clone(value);
    const sample = Array.isArray(defaults) && defaults.length ? defaults : [];
    const itemKeys = settingArrayKeys(pathname, sample);
    if (!itemKeys) {
      droppedPaths.push(pathname);
      return [];
    }
    return value.map((item, index) =>
      projectSeerrSettingsNode(
        item,
        sample[0] ?? {},
        `${pathname}[${index}]`,
        droppedPaths,
        itemKeys
      )
    );
  }

  if (isObject(value)) {
    const allowed = explicitAllowedKeys
      ? new Set(explicitAllowedKeys)
      : allowedObjectKeys(pathname, defaults);
    const result = isObject(defaults) ? clone(defaults) : {};
    for (const [key, child] of Object.entries(value)) {
      if (!allowed.has(key)) {
        droppedPaths.push(pathname ? `${pathname}.${key}` : key);
        continue;
      }
      const childPath = pathname ? `${pathname}.${key}` : key;
      const childDefaults = isObject(defaults) ? defaults[key] : undefined;
      result[key] = projectSeerrSettingsNode(
        child,
        childDefaults,
        childPath,
        droppedPaths
      );
    }
    return result;
  }

  if (pathname === 'main.defaultPermissions') {
    const masked = maskPermission(value);
    if (String(masked) !== String(value)) {
      droppedPaths.push(`${pathname} (unsupported permission bits removed)`);
    }
    return masked;
  }
  if (pathname === 'main.mediaServerType') {
    const numericValue = Number(value);
    if (numericValue >= 1 && numericValue <= 4) return numericValue;
    droppedPaths.push(
      `${pathname} (unsupported value reset to target default)`
    );
    return defaults;
  }
  if (/^notifications\.agents\.[^.]+\.types$/u.test(pathname)) {
    const masked = maskBitField(value, SEERR_NOTIFICATION_MASK);
    if (String(masked) !== String(value)) {
      droppedPaths.push(`${pathname} (unsupported notification bits removed)`);
    }
    return masked;
  }
  return clone(value);
}

function maskBitField(value, mask) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+$/u.test(String(value))
  ) {
    return 0;
  }
  try {
    const numeric = BigInt(value);
    return numeric < 0n ? 0 : Number(numeric & mask);
  } catch {
    return 0;
  }
}

function maskPermission(value) {
  return maskBitField(value, SEERR_PERMISSION_MASK);
}

function projectSeerrSettings(source, defaults) {
  const droppedPaths = [];
  const settings = projectSeerrSettingsNode(source, defaults, '', droppedPaths);
  return {
    settings,
    droppedPaths: [...new Set(droppedPaths)].sort(),
  };
}

function quoteIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function sqliteAdapter(databasePath, { readOnly }) {
  const database = new Database(databasePath, {
    readonly: readOnly,
    fileMustExist: true,
    timeout: 5000,
  });
  if (readOnly) database.pragma('query_only = ON');
  else database.pragma('foreign_keys = ON');

  return {
    kind: 'sqlite',
    databasePath,
    async close() {
      database.close();
    },
    async begin({ read = false } = {}) {
      database.exec(read ? 'BEGIN' : 'BEGIN IMMEDIATE');
      if (!read) database.pragma('defer_foreign_keys = ON');
    },
    async commit() {
      database.exec('COMMIT');
    },
    async rollback() {
      if (database.inTransaction) database.exec('ROLLBACK');
    },
    async query(sql, parameters = []) {
      return database.prepare(sql).all(...parameters);
    },
    async exec(sql) {
      database.exec(sql);
    },
    async tables() {
      return database
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
        )
        .all()
        .map((row) => row.name);
    },
    async columns(table) {
      return database
        .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
        .all()
        .map((column) => ({
          name: column.name,
          type: String(column.type ?? '').toLowerCase(),
          notNull: Boolean(column.notnull),
          defaultValue: column.dflt_value,
          primaryKeyOrder: Number(column.pk),
          identity: false,
        }));
    },
    async foreignKeys(table) {
      const rows = database
        .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
        .all();
      const grouped = new Map();
      for (const row of rows) {
        const key = String(row.id);
        const group = grouped.get(key) ?? {
          name: key,
          table: table,
          columns: [],
          referencedTable: row.table,
          referencedColumns: [],
        };
        group.columns[row.seq] = row.from;
        group.referencedColumns[row.seq] = row.to;
        grouped.set(key, group);
      }
      return [...grouped.values()];
    },
    async countRows(table) {
      const rows = await this.query(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`
      );
      return Number(rows[0]?.count ?? 0);
    },
    async rows(table, columns, offset, limit, orderColumns) {
      const orderBy = orderColumns.length
        ? ` ORDER BY ${orderColumns.map(quoteIdentifier).join(', ')}`
        : '';
      return this.query(
        `SELECT * FROM ${quoteIdentifier(table)}${orderBy} LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    },
    async clearTable(table) {
      database.prepare(`DELETE FROM ${quoteIdentifier(table)}`).run();
    },
    async lockTables() {},
    async insertRows(table, columns, rows) {
      if (!rows.length || !columns.length) return;
      const statement = database.prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      );
      const insertMany = database.transaction((values) => {
        for (const value of values) statement.run(...value);
      });
      insertMany(rows.map((row) => columns.map((column) => row[column])));
    },
    async updateRow(table, primaryKey, keyValues, changes) {
      const columns = Object.keys(changes);
      database
        .prepare(
          `UPDATE ${quoteIdentifier(table)} SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')} WHERE ${primaryKey.map((column) => `${quoteIdentifier(column)} = ?`).join(' AND ')}`
        )
        .run(...columns.map((column) => changes[column]), ...keyValues);
    },
    async resetSequence(table, primaryKey) {
      void table;
      void primaryKey;
    },
    async integrityCheck() {
      return database.pragma('foreign_key_check');
    },
  };
}

function postgresAdapter(connectionString, { readOnly }) {
  if (!connectionString) {
    throw new Error(
      `A PostgreSQL URL is required in ${readOnly ? 'SEERR_MIGRATION_SOURCE_DATABASE_URL' : 'SEERR_MIGRATION_TARGET_DATABASE_URL'}`
    );
  }
  const client = new Client({
    connectionString,
    application_name: 'seerrng-migrate',
  });
  let connected = false;

  return {
    kind: 'postgres',
    async connect() {
      await client.connect();
      connected = true;
    },
    async close() {
      if (connected) await client.end();
    },
    async begin({ read = false } = {}) {
      await client.query(
        read ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'
      );
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      await client.query('ROLLBACK');
    },
    async query(sql, parameters = []) {
      const result = await client.query(sql, parameters);
      return result.rows;
    },
    async exec(sql) {
      await client.query(sql);
    },
    async tables() {
      return (
        await this.query(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`
        )
      ).map((row) => row.name);
    },
    async columns(table) {
      const rows = await this.query(
        `SELECT column_name AS name, data_type AS type, is_nullable, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      const keys = await this.query(
        `SELECT kcu.column_name AS name, kcu.ordinal_position FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu USING (constraint_catalog, constraint_schema, constraint_name) WHERE tc.table_schema = current_schema() AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY' ORDER BY kcu.ordinal_position`,
        [table]
      );
      const primaryKeyOrder = new Map(
        keys.map((row) => [row.name, Number(row.ordinal_position)])
      );
      return rows.map((row) => ({
        name: row.name,
        type: String(row.type ?? '').toLowerCase(),
        notNull: row.is_nullable === 'NO',
        defaultValue: row.column_default,
        primaryKeyOrder: primaryKeyOrder.get(row.name) ?? 0,
        identity: row.is_identity === 'YES',
      }));
    },
    async foreignKeys(table) {
      const rows = await this.query(
        `SELECT constraint_data.conname AS name, child_column.attname AS column_name, parent.relname AS referenced_table, parent_column.attname AS referenced_column, key_column.ordinality AS position FROM pg_constraint constraint_data JOIN pg_class child ON child.oid = constraint_data.conrelid JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace JOIN pg_class parent ON parent.oid = constraint_data.confrelid CROSS JOIN LATERAL unnest(constraint_data.conkey) WITH ORDINALITY AS key_column(attnum, ordinality) JOIN LATERAL unnest(constraint_data.confkey) WITH ORDINALITY AS referenced_key(attnum, ordinality) ON referenced_key.ordinality = key_column.ordinality JOIN pg_attribute child_column ON child_column.attrelid = child.oid AND child_column.attnum = key_column.attnum JOIN pg_attribute parent_column ON parent_column.attrelid = parent.oid AND parent_column.attnum = referenced_key.attnum WHERE constraint_data.contype = 'f' AND child_schema.nspname = current_schema() AND child.relname = $1 ORDER BY constraint_data.conname, key_column.ordinality`,
        [table]
      );
      const grouped = new Map();
      for (const row of rows) {
        const group = grouped.get(row.name) ?? {
          name: row.name,
          table,
          columns: [],
          referencedTable: row.referenced_table,
          referencedColumns: [],
        };
        const index = Number(row.position) - 1;
        group.columns[index] = row.column_name;
        group.referencedColumns[index] = row.referenced_column;
        grouped.set(row.name, group);
      }
      return [...grouped.values()];
    },
    async countRows(table) {
      const rows = await this.query(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`
      );
      return Number(rows[0]?.count ?? 0);
    },
    async rows(table, columns, offset, limit, orderColumns) {
      const orderBy = orderColumns.length
        ? ` ORDER BY ${orderColumns.map(quoteIdentifier).join(', ')}`
        : '';
      const selectedColumns = columns
        .map((column) =>
          [
            'date',
            'timestamp without time zone',
            'timestamp with time zone',
          ].includes(column.type)
            ? `${quoteIdentifier(column.name)}::text AS ${quoteIdentifier(column.name)}`
            : quoteIdentifier(column.name)
        )
        .join(', ');
      return this.query(
        `SELECT ${selectedColumns} FROM ${quoteIdentifier(table)}${orderBy} LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    },
    async clearTable(table) {
      await this.exec(`DELETE FROM ${quoteIdentifier(table)}`);
    },
    async lockTables(tables) {
      if (!tables.length) return;
      await this.exec(
        `LOCK TABLE ${tables.map(quoteIdentifier).join(', ')} IN ACCESS EXCLUSIVE MODE`
      );
    },
    async insertRows(table, columns, rows) {
      if (!rows.length || !columns.length) return;
      const identityColumns = await this.columns(table);
      const hasAlwaysIdentity = identityColumns.some(
        (column) => column.identity && columns.includes(column.name)
      );
      const rowWidth = columns.length;
      const values = [];
      const tuples = rows.map((row, rowIndex) => {
        const placeholders = columns.map((column, columnIndex) => {
          values.push(row[column]);
          return `$${rowIndex * rowWidth + columnIndex + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const overriding = hasAlwaysIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
      await client.query(
        `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')})${overriding} VALUES ${tuples.join(', ')}`,
        values
      );
    },
    async updateRow(table, primaryKey, keyValues, changes) {
      const columns = Object.keys(changes);
      const values = columns.map((column) => changes[column]);
      const setParts = columns.map(
        (column, index) => `${quoteIdentifier(column)} = $${index + 1}`
      );
      const whereParts = primaryKey.map(
        (column, index) =>
          `${quoteIdentifier(column)} = $${columns.length + index + 1}`
      );
      await client.query(
        `UPDATE ${quoteIdentifier(table)} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`,
        [...values, ...keyValues]
      );
    },
    async resetSequence(table, primaryKey) {
      if (primaryKey.length !== 1) return;
      const column = primaryKey[0];
      const rows = await this.query(
        `SELECT pg_get_serial_sequence($1, $2) AS sequence_name`,
        [table, column]
      );
      const sequenceName = rows[0]?.sequence_name;
      if (!sequenceName) return;
      await client.query(
        `SELECT setval($1, COALESCE(MAX(${quoteIdentifier(column)}), 1), MAX(${quoteIdentifier(column)}) IS NOT NULL) FROM ${quoteIdentifier(table)}`,
        [sequenceName]
      );
    },
    async integrityCheck() {
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      return [];
    },
    async identity() {
      const rows = await this.query(
        `SELECT current_database() AS database, current_schema() AS schema, COALESCE(inet_server_addr()::text, 'local') AS address, current_setting('port') AS port`
      );
      return rows[0];
    },
  };
}

async function createAdapter(kind, configDirectory, { side, readOnly }) {
  if (kind === 'sqlite') {
    const databasePath = path.join(configDirectory, 'db', 'db.sqlite3');
    try {
      await fs.access(databasePath);
    } catch {
      throw new Error(`${side} SQLite database not found at ${databasePath}`);
    }
    return sqliteAdapter(databasePath, { readOnly });
  }
  const urlVariable =
    side === 'source'
      ? 'SEERR_MIGRATION_SOURCE_DATABASE_URL'
      : 'SEERR_MIGRATION_TARGET_DATABASE_URL';
  const adapter = postgresAdapter(process.env[urlVariable], { readOnly });
  await adapter.connect();
  return adapter;
}

function isInternalTable(table) {
  return MIGRATION_TABLES.has(normalizeTable(table));
}

function keyToken(values) {
  return JSON.stringify(
    values.map((value) => {
      if (Buffer.isBuffer(value)) return { buffer: value.toString('base64') };
      if (value instanceof Date) return { date: value.toISOString() };
      if (typeof value === 'bigint') return { bigint: value.toString() };
      return value;
    })
  );
}

function primaryKey(columns) {
  return columns
    .filter((column) => column.primaryKeyOrder > 0)
    .sort((left, right) => left.primaryKeyOrder - right.primaryKeyOrder)
    .map((column) => column.name);
}

function sharedColumns(sourceColumns, targetColumns) {
  const targetNames = new Set(targetColumns.map((column) => column.name));
  return sourceColumns
    .map((column) => column.name)
    .filter((name) => targetNames.has(name));
}

function orderImportTables(tableNames, definitions) {
  const normalized = new Set(tableNames.map(normalizeTable));
  const edges = new Map(
    tableNames.map((table) => [normalizeTable(table), new Set()])
  );
  const names = new Map(
    tableNames.map((table) => [normalizeTable(table), table])
  );

  for (const table of tableNames) {
    for (const foreignKey of definitions.get(normalizeTable(table))
      .foreignKeys) {
      const parent = normalizeTable(foreignKey.referencedTable);
      const child = normalizeTable(table);
      if (parent !== child && normalized.has(parent))
        edges.get(child).add(parent);
    }
  }

  const ordered = [];
  const pending = new Set(normalized);
  while (pending.size) {
    const ready = [...pending]
      .filter((table) =>
        [...edges.get(table)].every((parent) => !pending.has(parent))
      )
      .sort();
    if (!ready.length) {
      throw new Error(
        `Target schema has a circular foreign-key dependency across ${[...pending].map((table) => names.get(table)).join(', ')}; migration stopped before writing.`
      );
    }
    for (const table of ready) {
      pending.delete(table);
      ordered.push(names.get(table));
    }
  }
  return ordered;
}

function createReport(options) {
  return {
    schema: 'seerrng-migration-report/v1',
    toolVersion: TOOL_VERSION,
    direction: options.direction,
    mode: options.apply ? 'apply' : 'plan',
    sourceUntouched: true,
    targetSettingsMigrationMarkersPreserved: true,
    settings: {
      copied: false,
      droppedPaths: [],
      maskedDefaultPermission: false,
    },
    database: {
      sourceOnlyTables: [],
      targetOnlyTables: [],
      importedTables: [],
      skippedTables: [],
      droppedColumns: [],
      unfillableColumns: [],
      skippedRows: {},
      maskedUserPermissions: 0,
      convertedUserTypes: 0,
      sanitizedNotificationSettings: 0,
      clearedSelfReferences: 0,
      totalSourceRows: 0,
      totalImportedRows: 0,
      integrity: 'not checked in plan mode',
    },
  };
}

function noteSkipped(report, reason, table) {
  const bucket = report.database.skippedRows[reason] ?? {};
  bucket[table] = (bucket[table] ?? 0) + 1;
  report.database.skippedRows[reason] = bucket;
}

function normalizeSupportedRow(
  table,
  row,
  report,
  reverse,
  { count = true } = {}
) {
  const tableName = normalizeTable(table);
  if (!reverse) return { row, skipReason: undefined };

  if (
    ((tableName === 'media' && 'mediaType' in row) ||
      (tableName === 'media_request' && 'type' in row) ||
      ((tableName === 'watchlist' || tableName === 'blocklist') &&
        'mediaType' in row)) &&
    !SEERR_MEDIA_TYPES.has(String(row.mediaType ?? row.type).toLowerCase())
  ) {
    return { row, skipReason: 'unsupportedMediaType' };
  }

  if (
    tableName === 'discover_slider' &&
    'type' in row &&
    !SEERR_DISCOVER_SLIDER_TYPES.has(Number(row.type))
  ) {
    return { row, skipReason: 'unsupportedDiscoverSliderType' };
  }

  const next = { ...row };
  if (tableName === 'user' && 'permissions' in next) {
    const masked = maskPermission(next.permissions);
    if (String(masked) !== String(next.permissions)) {
      next.permissions = masked;
      if (count) report.database.maskedUserPermissions += 1;
    }
  }
  if (tableName === 'user' && 'userType' in next) {
    const userType = Number(next.userType);
    if (!SEERR_USER_TYPES.has(userType)) {
      next.userType = 2;
      if (count) report.database.convertedUserTypes += 1;
    }
  }
  if (tableName === 'user_settings' && 'notificationTypes' in next) {
    const sanitized = sanitizeNotificationTypes(next.notificationTypes);
    if (sanitized.changed) {
      next.notificationTypes = sanitized.value;
      if (count) report.database.sanitizedNotificationSettings += 1;
    }
  }
  return { row: next, skipReason: undefined };
}

function sanitizeNotificationTypes(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { value: null, changed: true };
    }
  }
  if (!isObject(parsed)) return { value: null, changed: true };

  let changed = false;
  const result = {};
  for (const [key, rawValue] of Object.entries(parsed)) {
    if (!SEERR_NOTIFICATION_AGENTS.has(key)) {
      changed = true;
      continue;
    }
    if (
      (typeof rawValue !== 'number' && typeof rawValue !== 'string') ||
      !/^\d+$/u.test(String(rawValue))
    ) {
      changed = true;
      continue;
    }
    const numeric = BigInt(rawValue);
    const masked = numeric & SEERR_NOTIFICATION_MASK;
    if (masked !== numeric) changed = true;
    result[key] = Number(masked);
  }
  return {
    value: typeof value === 'string' ? JSON.stringify(result) : result,
    changed,
  };
}

function referenceKeyName(table, columns) {
  return `${normalizeTable(table)}:${columns.join(',')}`;
}

function rowHasAll(row, columns) {
  return columns.every((column) => Object.hasOwn(row, column));
}

function valuesFor(row, columns) {
  return columns.map((column) => row[column]);
}

function allNull(values) {
  return values.some((value) => value === null || value === undefined);
}

function addReferenceKeys(table, row, definitions, referenceKeys) {
  for (const { foreignKeys } of definitions.values()) {
    for (const foreignKey of foreignKeys) {
      if (
        normalizeTable(foreignKey.referencedTable) !== normalizeTable(table)
      ) {
        continue;
      }
      if (!rowHasAll(row, foreignKey.referencedColumns)) continue;
      const key = referenceKeyName(table, foreignKey.referencedColumns);
      const values = valuesFor(row, foreignKey.referencedColumns);
      if (allNull(values)) continue;
      const keys = referenceKeys.get(key) ?? new Set();
      keys.add(keyToken(values));
      referenceKeys.set(key, keys);
    }
  }
}

function foreignKeyFailure(table, row, foreignKeys, referenceKeys) {
  for (const foreignKey of foreignKeys) {
    const parent = normalizeTable(foreignKey.referencedTable);
    if (parent === normalizeTable(table)) continue;
    if (!rowHasAll(row, foreignKey.columns)) continue;
    const values = valuesFor(row, foreignKey.columns);
    if (allNull(values)) continue;
    const key = referenceKeyName(parent, foreignKey.referencedColumns);
    if (!referenceKeys.get(key)?.has(keyToken(values))) return true;
  }
  return false;
}

function sortColumns(columns) {
  const keys = columns.filter((column) => column.primaryKeyOrder > 0);
  if (!keys.length) return [];
  return keys
    .sort((left, right) => {
      if (left.primaryKeyOrder && right.primaryKeyOrder) {
        return left.primaryKeyOrder - right.primaryKeyOrder;
      }
      if (left.primaryKeyOrder) return -1;
      if (right.primaryKeyOrder) return 1;
      return left.name.localeCompare(right.name);
    })
    .map((column) => column.name);
}

async function readPages(adapter, table, columns, orderColumns, visit) {
  const batchSize = 500;
  let offset = 0;
  while (true) {
    const rows = await adapter.rows(
      table,
      columns,
      offset,
      batchSize,
      orderColumns
    );
    if (!rows.length) break;
    for (const row of rows) await visit(row);
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
}

async function scanPlan({
  source,
  sourceDefinitions,
  targetDefinitions,
  orderedTables,
  reverse,
  report,
}) {
  const retainedReferenceKeys = new Map();
  for (const table of orderedTables) {
    const normalized = normalizeTable(table);
    const sourceDefinition = sourceDefinitions.get(normalized);
    const targetDefinition = targetDefinitions.get(normalized);
    const sourceColumnNames = new Set(
      sourceDefinition.columns.map((column) => column.name)
    );
    const common = sharedColumns(
      sourceDefinition.columns,
      targetDefinition.columns
    );
    const missingTargetKeys = primaryKey(targetDefinition.columns).filter(
      (column) => !sourceColumnNames.has(column)
    );
    const totalRows = await source.countRows(table);
    report.database.totalSourceRows += totalRows;
    const summary = {
      table,
      sourceRows: totalRows,
      plannedRows: 0,
      droppedRows: 0,
      commonColumns: common.length,
    };

    const targetColumnNames = new Set(
      targetDefinition.columns.map((column) => column.name)
    );
    const unfillableColumns = targetDefinition.columns.filter(
      (column) =>
        !sourceColumnNames.has(column.name) &&
        column.notNull &&
        column.defaultValue === null &&
        column.primaryKeyOrder === 0 &&
        !column.identity
    );
    if (totalRows && unfillableColumns.length) {
      report.database.unfillableColumns.push({
        table,
        columns: unfillableColumns.map((column) => column.name),
      });
    }

    if (!common.length || missingTargetKeys.length) {
      summary.droppedRows = totalRows;
      report.database.skippedTables.push({
        table,
        sourceRows: totalRows,
        reason: !common.length
          ? 'no shared columns'
          : `target primary key not present in source (${missingTargetKeys.join(', ')})`,
      });
      for (let index = 0; index < totalRows; index += 1) {
        noteSkipped(
          report,
          !common.length ? 'noSharedColumns' : 'missingTargetPrimaryKey',
          table
        );
      }
      report.database.importedTables.push(summary);
      continue;
    }

    const droppedColumns = sourceDefinition.columns
      .map((column) => column.name)
      .filter((column) => !targetColumnNames.has(column));
    if (droppedColumns.length) {
      report.database.droppedColumns.push({ table, columns: droppedColumns });
    }

    await readPages(
      source,
      table,
      sourceDefinition.columns,
      sortColumns(sourceDefinition.columns),
      (sourceRow) => {
        const supported = normalizeSupportedRow(
          table,
          sourceRow,
          report,
          reverse
        );
        if (supported.skipReason) {
          noteSkipped(report, supported.skipReason, table);
          summary.droppedRows += 1;
          return;
        }
        if (
          foreignKeyFailure(
            table,
            supported.row,
            targetDefinition.foreignKeys,
            retainedReferenceKeys
          )
        ) {
          noteSkipped(report, 'missingReferencedRow', table);
          summary.droppedRows += 1;
          return;
        }
        summary.plannedRows += 1;
        addReferenceKeys(
          table,
          supported.row,
          targetDefinitions,
          retainedReferenceKeys
        );
      }
    );
    report.database.totalImportedRows += summary.plannedRows;
    report.database.importedTables.push(summary);
  }
}

function targetColumnMap(columns) {
  return new Map(columns.map((column) => [column.name, column]));
}

function adaptValue(value, column, targetKind) {
  if (value === undefined) return null;
  if (value instanceof Date)
    return targetKind === 'sqlite' ? value.toISOString() : value;
  if (typeof value === 'bigint') {
    return targetKind === 'sqlite' &&
      value >= BigInt(Number.MIN_SAFE_INTEGER) &&
      value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (
    targetKind === 'sqlite' &&
    typeof value === 'string' &&
    /int|serial|numeric|decimal/u.test(column.type) &&
    /^-?\d+$/u.test(value)
  ) {
    const numeric = BigInt(value);
    if (
      numeric >= BigInt(Number.MIN_SAFE_INTEGER) &&
      numeric <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return Number(numeric);
    }
    return numeric;
  }
  if (targetKind === 'sqlite' && typeof value === 'boolean')
    return value ? 1 : 0;
  if (targetKind === 'sqlite' && isObject(value)) return JSON.stringify(value);
  if (targetKind === 'sqlite' && Array.isArray(value)) {
    return column.type.includes('json')
      ? JSON.stringify(value)
      : value.join(',');
  }
  if (
    targetKind === 'postgres' &&
    column.type.includes('bool') &&
    (value === 1 || value === 0 || value === '1' || value === '0')
  ) {
    return value === 1 || value === '1';
  }
  if (
    targetKind === 'postgres' &&
    ['json', 'jsonb'].includes(column.type) &&
    typeof value === 'string'
  ) {
    return value;
  }
  if (
    targetKind === 'postgres' &&
    ['text', 'character varying', 'character'].includes(column.type) &&
    (isObject(value) || Array.isArray(value))
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function valueFromSourceForTarget(row, column, targetColumns, targetKind) {
  const value = row[column];
  return adaptValue(value, targetColumns.get(column), targetKind);
}

function primaryKeyToken(row, keyColumns) {
  if (!keyColumns.length || !rowHasAll(row, keyColumns)) return undefined;
  const values = valuesFor(row, keyColumns);
  if (values.some((value) => value === null || value === undefined))
    return undefined;
  return keyToken(values);
}

async function applyRows({
  source,
  target,
  sourceDefinitions,
  targetDefinitions,
  orderedTables,
  reverse,
  report,
}) {
  const retainedReferenceKeys = new Map();
  for (const table of orderedTables) {
    const normalized = normalizeTable(table);
    const sourceDefinition = sourceDefinitions.get(normalized);
    const targetDefinition = targetDefinitions.get(normalized);
    const common = sharedColumns(
      sourceDefinition.columns,
      targetDefinition.columns
    );
    const targetColumns = targetColumnMap(targetDefinition.columns);
    const targetKeyColumns = primaryKey(targetDefinition.columns);
    const selfForeignKeys = targetDefinition.foreignKeys.filter(
      (foreignKey) =>
        normalizeTable(foreignKey.referencedTable) === normalized &&
        foreignKey.columns.every((column) => common.includes(column))
    );
    for (const foreignKey of selfForeignKeys) {
      if (
        foreignKey.columns.some(
          (column) => targetColumns.get(column)?.notNull
        ) ||
        !targetKeyColumns.length
      ) {
        throw new Error(
          `Cannot safely defer the self-reference in ${table}; migration stopped before committing.`
        );
      }
    }

    const tableSummary = report.database.importedTables.find(
      (summary) => normalizeTable(summary.table) === normalized
    );
    if (!tableSummary || tableSummary.plannedRows === 0) continue;

    let inserted = 0;
    const batch = [];
    const pendingSelfUpdates = [];
    const batchSize = 200;
    const sourceTotalRows = await source.countRows(table);
    const flush = async () => {
      if (!batch.length) return;
      await target.insertRows(table, common, batch.splice(0));
    };

    await readPages(
      source,
      table,
      sourceDefinition.columns,
      sortColumns(sourceDefinition.columns),
      async (sourceRow) => {
        const supported = normalizeSupportedRow(
          table,
          sourceRow,
          report,
          reverse,
          {
            count: false,
          }
        );
        if (supported.skipReason) return;
        if (
          foreignKeyFailure(
            table,
            supported.row,
            targetDefinition.foreignKeys,
            retainedReferenceKeys
          )
        ) {
          return;
        }
        const destinationRow = {};
        for (const column of common) {
          destinationRow[column] = valueFromSourceForTarget(
            supported.row,
            column,
            targetColumns,
            target.kind
          );
        }

        if (
          normalizeTable(table) === 'user_settings' &&
          'notificationTypes' in destinationRow
        ) {
          const sanitized = sanitizeNotificationTypes(
            destinationRow.notificationTypes
          );
          destinationRow.notificationTypes = adaptValue(
            sanitized.value,
            targetColumns.get('notificationTypes'),
            target.kind
          );
        }

        for (const foreignKey of selfForeignKeys) {
          if (
            !foreignKey.columns.some((column) => destinationRow[column] != null)
          )
            continue;
          const savedValues = valuesFor(destinationRow, foreignKey.columns);
          const parentSourceValues = valuesFor(
            supported.row,
            foreignKey.columns
          );
          for (const column of foreignKey.columns)
            destinationRow[column] = null;
          pendingSelfUpdates.push({
            rowKey: primaryKeyToken(destinationRow, targetKeyColumns),
            savedValues,
            parentSourceValues,
            columns: foreignKey.columns,
            referencedColumns: foreignKey.referencedColumns,
          });
        }

        batch.push(destinationRow);
        inserted += 1;
        addReferenceKeys(
          table,
          supported.row,
          targetDefinitions,
          retainedReferenceKeys
        );
        if (batch.length >= batchSize) await flush();
      }
    );
    await flush();

    if (selfForeignKeys.length) {
      const importedRows = new Map();
      await readPages(
        target,
        table,
        targetDefinition.columns,
        sortColumns(targetDefinition.columns),
        (row) => {
          const token = primaryKeyToken(row, targetKeyColumns);
          if (token) importedRows.set(token, row);
        }
      );
      for (const pending of pendingSelfUpdates) {
        const child = importedRows.get(pending.rowKey);
        const parentKey = keyToken(pending.parentSourceValues);
        const parentSet = retainedReferenceKeys.get(
          referenceKeyName(table, pending.referencedColumns)
        );
        if (child && parentSet?.has(parentKey)) {
          const changes = Object.fromEntries(
            pending.columns.map((column, index) => [
              column,
              pending.savedValues[index],
            ])
          );
          await target.updateRow(
            table,
            targetKeyColumns,
            valuesFor(child, targetKeyColumns),
            changes
          );
        } else {
          report.database.clearedSelfReferences += 1;
        }
      }
    }

    if (inserted !== tableSummary.plannedRows) {
      throw new Error(
        `Source rows changed or compatibility checks differed while importing ${table}; expected ${tableSummary.plannedRows}, inserted ${inserted}. Target transaction rolled back.`
      );
    }

    await target.resetSequence(table, targetKeyColumns);
    tableSummary.importedRows = inserted;
    tableSummary.sourceRows = sourceTotalRows;
  }
}

async function tableDefinitions(adapter, tables) {
  const definitions = new Map();
  for (const table of tables) {
    definitions.set(normalizeTable(table), {
      name: table,
      columns: await adapter.columns(table),
      foreignKeys: await adapter.foreignKeys(table),
    });
  }
  return definitions;
}

async function assertTargetIsFresh(target, targetTables) {
  const populated = [];
  for (const table of targetTables) {
    if (isInternalTable(table)) continue;
    const count = await target.countRows(table);
    if (count === 0) continue;
    if (normalizeTable(table) === 'discover_slider') {
      const columns = await target.columns(table);
      if (!columns.some((column) => column.name === 'isBuiltIn')) {
        populated.push({ table, rows: count });
        continue;
      }
      const customRows = await target.query(
        target.kind === 'postgres'
          ? `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier('isBuiltIn')} IS NOT TRUE`
          : `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE COALESCE(${quoteIdentifier('isBuiltIn')}, 0) = 0`
      );
      if (Number(customRows[0]?.count ?? 0) === 0) continue;
    }
    populated.push({ table, rows: count });
  }
  if (populated.length) {
    const summary = populated
      .map(({ table, rows }) => `${table} (${rows})`)
      .join(', ');
    throw new Error(
      `Target database is not empty: ${summary}. Use a newly initialized target with no users or media data.`
    );
  }
}

async function databaseIdentity(adapter) {
  if (adapter.kind === 'sqlite') {
    const stats = await fs.stat(adapter.databasePath);
    return `sqlite:${stats.dev}:${stats.ino}`;
  }
  const identity = await adapter.identity();
  return `postgres:${identity.address}:${identity.port}:${identity.database}:${identity.schema}`;
}

function isSeerrNgInstallation(settings, tables) {
  return (
    SEERRNG_SETTING_MARKERS.some((key) =>
      Object.hasOwn(settings?.main ?? {}, key)
    ) ||
    tables.some((table) => SEERRNG_TABLE_MARKERS.has(normalizeTable(table)))
  );
}

async function atomicWrite(filePath, contents, mode = 0o600) {
  const temporaryPath = `${filePath}.seerrng-migration-${process.pid}-${randomUUID()}.tmp`;
  const handle = await fs.open(temporaryPath, 'wx', mode);
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

async function prepareSettings(options, sourceDirectory, targetDirectory) {
  const sourcePath = await checkedConfigFile(sourceDirectory, 'settings.json');
  const targetPath = await checkedConfigFile(targetDirectory, 'settings.json');
  const [sourceSettings, targetSettings] = await Promise.all([
    readJsonFile(sourcePath, 'Source settings.json'),
    readJsonFile(targetPath, 'Target settings.json'),
  ]);

  if (options.direction === 'seerrng-to-seerr') {
    const projected = projectSeerrSettings(sourceSettings, targetSettings);
    const sourceDefaultPermissions = sourceSettings?.main?.defaultPermissions;
    return {
      sourcePath,
      targetPath,
      sourceSettings,
      targetSettings,
      originalText: await fs.readFile(targetPath, 'utf8'),
      targetMode: (await fs.stat(targetPath)).mode & 0o777,
      output: `${JSON.stringify(projected.settings, null, 2)}\n`,
      droppedPaths: projected.droppedPaths,
      defaultPermissionMasked:
        sourceDefaultPermissions !== undefined &&
        String(maskPermission(sourceDefaultPermissions)) !==
          String(sourceDefaultPermissions),
    };
  }

  const settings = mergeSettings(targetSettings, sourceSettings);
  settings.migrations = Array.isArray(targetSettings.migrations)
    ? clone(targetSettings.migrations)
    : [];
  return {
    sourcePath,
    targetPath,
    sourceSettings,
    targetSettings,
    originalText: await fs.readFile(targetPath, 'utf8'),
    targetMode: (await fs.stat(targetPath)).mode & 0o777,
    output: `${JSON.stringify(settings, null, 2)}\n`,
    droppedPaths: [],
    defaultPermissionMasked: false,
  };
}

async function migrate(options) {
  const sourceDirectory = await fs.realpath(path.resolve(options.sourceDir));
  const targetDirectory = await fs.realpath(path.resolve(options.targetDir));
  if (sourceDirectory === targetDirectory) {
    throw new Error('Source and target config directories must be different');
  }

  const settings = await prepareSettings(
    options,
    sourceDirectory,
    targetDirectory
  );
  const report = createReport(options);
  report.settings.droppedPaths = settings.droppedPaths;
  report.settings.maskedDefaultPermission = settings.defaultPermissionMasked;
  const source = await createAdapter(options.sourceDb, sourceDirectory, {
    side: 'source',
    readOnly: true,
  });
  let target;
  let sourceTransaction = false;
  let targetTransaction = false;
  let settingsWritten = false;
  let targetOriginalSettings = settings.originalText;

  try {
    target = await createAdapter(options.targetDb, targetDirectory, {
      side: 'target',
      readOnly: !options.apply,
    });
    if ((await databaseIdentity(source)) === (await databaseIdentity(target))) {
      throw new Error(
        'Source and target databases resolve to the same database'
      );
    }

    await source.begin({ read: true });
    sourceTransaction = true;
    const [sourceTables, targetTables] = await Promise.all([
      source.tables(),
      target.tables(),
    ]);
    for (const [side, tables] of [
      ['source', sourceTables],
      ['target', targetTables],
    ]) {
      const tableNames = new Set(tables.map(normalizeTable));
      const missing = REQUIRED_CORE_TABLES.filter(
        (table) => !tableNames.has(table)
      );
      if (missing.length) {
        throw new Error(
          `${side} database is not an initialized Seerr/SeerrNG database; missing ${missing.join(', ')}`
        );
      }
    }
    const targetIsSeerrNg = isSeerrNgInstallation(
      settings.targetSettings,
      targetTables
    );
    const expectsSeerrNgTarget = options.direction === 'seerr-to-seerrng';
    if (targetIsSeerrNg !== expectsSeerrNgTarget) {
      throw new Error(
        `Migration direction does not match the target installation. The target appears to be ${targetIsSeerrNg ? 'SeerrNG' : 'Seerr'}; choose the direction that writes to that product.`
      );
    }
    await assertTargetIsFresh(target, targetTables);

    const reportSourceTables = new Set(sourceTables.map(normalizeTable));
    const reportTargetTables = new Set(targetTables.map(normalizeTable));
    for (const table of sourceTables) {
      if (!reportTargetTables.has(normalizeTable(table))) {
        if (!isInternalTable(table)) {
          report.database.totalSourceRows += await source.countRows(table);
        }
        report.database.sourceOnlyTables.push({
          table,
          rows: await source.countRows(table),
        });
      }
    }
    for (const table of targetTables) {
      if (!reportSourceTables.has(normalizeTable(table))) {
        report.database.targetOnlyTables.push({ table });
      }
    }

    const sourceDefinitions = await tableDefinitions(source, sourceTables);
    const targetDefinitions = await tableDefinitions(target, targetTables);
    const sharedTables = sourceTables.filter(
      (table) =>
        reportTargetTables.has(normalizeTable(table)) && !isInternalTable(table)
    );
    const importableTables = sharedTables.filter((table) => {
      const definition = sourceDefinitions.get(normalizeTable(table));
      const destination = targetDefinitions.get(normalizeTable(table));
      return (
        sharedColumns(definition.columns, destination.columns).length > 0 &&
        primaryKey(destination.columns).every((key) =>
          definition.columns.some((column) => column.name === key)
        )
      );
    });
    const importableSet = new Set(importableTables.map(normalizeTable));
    for (const table of sharedTables) {
      if (importableSet.has(normalizeTable(table))) continue;
      const sourceDefinition = sourceDefinitions.get(normalizeTable(table));
      const targetDefinition = targetDefinitions.get(normalizeTable(table));
      const common = sharedColumns(
        sourceDefinition.columns,
        targetDefinition.columns
      );
      const missingTargetKeys = primaryKey(targetDefinition.columns).filter(
        (key) => !sourceDefinition.columns.some((column) => column.name === key)
      );
      const rows = await source.countRows(table);
      report.database.totalSourceRows += rows;
      report.database.skippedTables.push({
        table,
        sourceRows: rows,
        reason: !common.length
          ? 'no shared columns'
          : `target primary key not present in source (${missingTargetKeys.join(', ')})`,
      });
      report.database.skippedRows[
        !common.length ? 'noSharedColumns' : 'missingTargetPrimaryKey'
      ] = {
        ...report.database.skippedRows[
          !common.length ? 'noSharedColumns' : 'missingTargetPrimaryKey'
        ],
        [table]: rows,
      };
    }
    const orderedTables = orderImportTables(
      importableTables,
      targetDefinitions
    );

    report.database.sourceOnlyTables = report.database.sourceOnlyTables
      .filter((entry) => !isInternalTable(entry.table))
      .sort((left, right) => left.table.localeCompare(right.table));
    report.database.targetOnlyTables = report.database.targetOnlyTables
      .filter((entry) => !isInternalTable(entry.table))
      .sort((left, right) => left.table.localeCompare(right.table));

    await scanPlan({
      source,
      sourceDefinitions,
      targetDefinitions,
      orderedTables,
      reverse: options.direction === 'seerrng-to-seerr',
      report,
    });

    if (options.apply) {
      if (report.database.unfillableColumns.length) {
        const blocked = report.database.unfillableColumns
          .map((entry) => `${entry.table}.${entry.columns.join(', ')}`)
          .join('; ');
        throw new Error(
          `Target schema requires columns with no source value or default: ${blocked}`
        );
      }
      await target.begin();
      targetTransaction = true;
      await target.lockTables(targetTables);
      await assertTargetIsFresh(target, targetTables);
      if (target.kind === 'sqlite') {
        await target.exec('PRAGMA defer_foreign_keys = ON');
      }

      const sliderTable = targetTables.find(
        (table) => normalizeTable(table) === 'discover_slider'
      );
      if (sliderTable) await target.clearTable(sliderTable);

      await applyRows({
        source,
        target,
        sourceDefinitions,
        targetDefinitions,
        orderedTables,
        reverse: options.direction === 'seerrng-to-seerr',
        report,
      });

      const integrityFailures = await target.integrityCheck();
      if (integrityFailures.length) {
        throw new Error(
          `Target foreign-key validation found ${integrityFailures.length} violation(s)`
        );
      }
      report.database.integrity =
        target.kind === 'sqlite'
          ? 'SQLite foreign_key_check passed'
          : 'PostgreSQL constraints passed';

      try {
        await atomicWrite(
          settings.targetPath,
          settings.output,
          settings.targetMode
        );
        settingsWritten = true;
        report.settings.copied = true;
        await source.commit();
        sourceTransaction = false;
        await target.commit();
        targetTransaction = false;
      } catch (error) {
        if (settingsWritten) {
          await atomicWrite(
            settings.targetPath,
            targetOriginalSettings,
            settings.targetMode
          );
          settingsWritten = false;
        }
        throw error;
      }
    }

    if (sourceTransaction) {
      await source.commit();
      sourceTransaction = false;
    }
    report.database.importedTables.sort((left, right) =>
      left.table.localeCompare(right.table)
    );
    report.database.sourceOnlyTables.sort((left, right) =>
      left.table.localeCompare(right.table)
    );
    return report;
  } catch (error) {
    if (targetTransaction && target) {
      try {
        await target.rollback();
      } catch {
        // The transaction may already have been rolled back by the driver.
      }
    }
    if (settingsWritten) {
      try {
        await atomicWrite(
          settings.targetPath,
          targetOriginalSettings,
          settings.targetMode
        );
      } catch (restoreError) {
        throw new Error(
          `${displayError(error)}; restoring target settings also failed: ${displayError(restoreError)}`
        );
      }
    }
    throw error;
  } finally {
    if (sourceTransaction) await source.rollback().catch(() => {});
    await source.close().catch(() => {});
    if (target) await target.close().catch(() => {});
  }
}

export { migrate, projectSeerrSettings, sanitizeNotificationTypes };

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    const report = await migrate(options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.mode === 'plan') {
      process.stdout.write(
        '\nPlan only. Re-run with --apply to import into the empty target.\n'
      );
    }
  } catch (error) {
    process.stderr.write(`Migration failed: ${displayError(error)}\n`);
    process.exitCode = 1;
  }
}
