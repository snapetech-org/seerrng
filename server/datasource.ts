import {
  MAX_POSTGRES_POOL_SIZE,
  parseBooleanConfig,
  parseIntegerConfig,
  readDatabaseTlsFile,
} from '@server/lib/databaseConfig';
import { secureSqliteDatabaseFiles } from '@server/lib/sqliteFileSecurity';
import { isPgsql } from '@server/utils/dbType';
import fs from 'fs';
import 'reflect-metadata';
import type { TlsOptions } from 'tls';
import type { DataSourceOptions, EntityTarget, Repository } from 'typeorm';
import { DataSource } from 'typeorm';

export { isPgsql };

const getMigrationFiles = (directory: string, extension: 'ts' | 'js') =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((file) => /^\d+-[^.]+\.(?:ts|js)$/.test(file))
        .filter((file) => file.endsWith(`.${extension}`))
        .map((file) => `${directory}/${file}`)
    : [];

const getRuntimeFiles = (directory: string, extension: 'ts' | 'js') =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter(
          (file) =>
            file.endsWith(`.${extension}`) &&
            !file.endsWith(`.test.${extension}`)
        )
        .map((file) => `${directory}/${file}`)
    : [];

const DB_SSL_PREFIX = 'DB_SSL_';
const SQLITE_DATABASE_PATH = process.env.CONFIG_DIRECTORY
  ? `${process.env.CONFIG_DIRECTORY}/db/db.sqlite3`
  : 'config/db/db.sqlite3';

export const enforceSqliteDatabasePermissions = (): void => {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.DB_TYPE === 'postgres' ||
    dataSource.isInitialized
  ) {
    return;
  }

  // Closing another descriptor for an open SQLite file drops this process's
  // POSIX locks. Harden files before initialization; SQLite inherits the main
  // database's private mode when it creates its WAL and shared-memory files.
  secureSqliteDatabaseFiles(SQLITE_DATABASE_PATH);
};

function boolFromEnv(envVar: string, defaultVal = false) {
  return parseBooleanConfig(envVar, process.env[envVar], defaultVal);
}

// PostgreSQL advisory-lock coordinators lease a connection while application
// repositories perform the protected work. Keep at least one additional pool
// connection available even when an operator supplies an undersized value.
export const POSTGRES_POOL_SIZE = Math.max(
  2,
  parseIntegerConfig('DB_POOL_SIZE', process.env.DB_POOL_SIZE, 10, {
    min: 1,
    max: MAX_POSTGRES_POOL_SIZE,
  })
);

function stringOrReadFileFromEnv(envVar: string): Buffer | string | undefined {
  if (process.env[envVar]) {
    return process.env[envVar];
  }
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    return readDatabaseTlsFile(filePath);
  }
  return undefined;
}

function buildSslConfig(): TlsOptions | undefined {
  if (!boolFromEnv('DB_USE_SSL')) {
    return undefined;
  }
  return {
    rejectUnauthorized: boolFromEnv(
      `${DB_SSL_PREFIX}REJECT_UNAUTHORIZED`,
      true
    ),
    ca: stringOrReadFileFromEnv(`${DB_SSL_PREFIX}CA`),
    key: stringOrReadFileFromEnv(`${DB_SSL_PREFIX}KEY`),
    cert: stringOrReadFileFromEnv(`${DB_SSL_PREFIX}CERT`),
  };
}

const testConfig: DataSourceOptions = {
  type: 'better-sqlite3',
  database: ':memory:',
  // Test setup owns schema creation and reset. Enabling these here makes
  // initialize() race seedTestDb() with a second schema synchronization.
  synchronize: false,
  dropSchema: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities: getRuntimeFiles('server/entity', 'ts'),
  // Vitest transforms entity modules in-process. Loading every migration via
  // TypeORM's CommonJS loader bypasses that transform and fails on TypeScript
  // syntax, while migration tests import the classes they exercise directly.
  migrations: process.env.VITEST
    ? []
    : getMigrationFiles('server/migration/sqlite', 'ts'),
  subscribers: getRuntimeFiles('server/subscriber', 'ts'),
};

const devConfig: DataSourceOptions = {
  type: 'better-sqlite3',
  database: SQLITE_DATABASE_PATH,
  synchronize: true,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  enableWAL: true,
  entities: getRuntimeFiles('server/entity', 'ts'),
  migrations: getMigrationFiles('server/migration/sqlite', 'ts'),
  subscribers: getRuntimeFiles('server/subscriber', 'ts'),
};

const prodConfig: DataSourceOptions = {
  type: 'better-sqlite3',
  database: SQLITE_DATABASE_PATH,
  synchronize: false,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  enableWAL: true,
  entities: getRuntimeFiles('dist/entity', 'js'),
  migrations: getMigrationFiles('dist/migration/sqlite', 'js'),
  subscribers: getRuntimeFiles('dist/subscriber', 'js'),
};

const postgresDevConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_SOCKET_PATH || process.env.DB_HOST,
  port: process.env.DB_SOCKET_PATH
    ? undefined
    : parseIntegerConfig('DB_PORT', process.env.DB_PORT, 5432, {
        min: 1,
        max: 65535,
      }),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME ?? 'seerr',
  ssl: buildSslConfig(),
  poolSize: POSTGRES_POOL_SIZE,
  synchronize: false,
  migrationsRun: true,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities: getRuntimeFiles('server/entity', 'ts'),
  migrations: getMigrationFiles('server/migration/postgres', 'ts'),
  subscribers: getRuntimeFiles('server/subscriber', 'ts'),
};

const postgresProdConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_SOCKET_PATH || process.env.DB_HOST,
  port: process.env.DB_SOCKET_PATH
    ? undefined
    : parseIntegerConfig('DB_PORT', process.env.DB_PORT, 5432, {
        min: 1,
        max: 65535,
      }),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME ?? 'seerr',
  ssl: buildSslConfig(),
  poolSize: POSTGRES_POOL_SIZE,
  synchronize: false,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities: getRuntimeFiles('dist/entity', 'js'),
  migrations: getMigrationFiles('dist/migration/postgres', 'js'),
  subscribers: getRuntimeFiles('dist/subscriber', 'js'),
};

function getDataSource(): DataSourceOptions {
  if (process.env.NODE_ENV === 'test') {
    return testConfig;
  } else if (process.env.NODE_ENV === 'production') {
    return isPgsql ? postgresProdConfig : prodConfig;
  } else {
    return isPgsql ? postgresDevConfig : devConfig;
  }
}

const dataSource = new DataSource(getDataSource());

enforceSqliteDatabasePermissions();

export const getRepository = <Entity extends object>(
  target: EntityTarget<Entity>
): Repository<Entity> => {
  return dataSource.getRepository(target);
};

export default dataSource;
