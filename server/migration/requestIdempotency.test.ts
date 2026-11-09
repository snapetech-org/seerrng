import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { AddRequestIdempotency1794400000000 as PostgresMigration } from './postgres/1794400000000-AddRequestIdempotency';
import { AddAvailabilitySubscriptionScope1794400000001 as PostgresScopeMigration } from './postgres/1794400000001-AddAvailabilitySubscriptionScope';
import { AddRequestIdempotency1794400000000 as SqliteMigration } from './sqlite/1794400000000-AddRequestIdempotency';
import { AddAvailabilitySubscriptionScope1794400000001 as SqliteScopeMigration } from './sqlite/1794400000001-AddAvailabilitySubscriptionScope';

describe('request idempotency migration', () => {
  it('adds private nullable keys with uniqueness and rolls back cleanly', async () => {
    const source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.query(
        'CREATE TABLE "media_request" ("id" integer primary key)'
      );
      const migration = new SqliteMigration();
      await migration.up(runner);
      const table = await runner.getTable('media_request');
      expect(table?.columns.map((column) => column.name)).toContain(
        'idempotencyKey'
      );
      expect(table?.columns.map((column) => column.name)).toContain(
        'idempotencyFingerprint'
      );
      expect(
        table?.indices.find(
          (index) => index.name === 'UQ_media_request_idempotency_key'
        )?.isUnique
      ).toBe(true);
      await migration.up(runner);
      await migration.down(runner);
      expect(await runner.hasColumn('media_request', 'idempotencyKey')).toBe(
        false
      );
      expect(new PostgresMigration().name).toBe(migration.name);
    } finally {
      await runner.release();
      await source.destroy();
    }
  });

  it('adds optional quality and season scope without changing existing follows', async () => {
    const source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.query(
        'CREATE TABLE "media_availability_subscription" ("id" integer primary key)'
      );
      await runner.query(
        'INSERT INTO "media_availability_subscription" ("id") VALUES (1)'
      );
      const migration = new SqliteScopeMigration();
      await migration.up(runner);
      await migration.up(runner);
      const rows = await runner.query(
        'SELECT "is4k", "seasonNumber" FROM "media_availability_subscription"'
      );
      expect(rows).toEqual([{ is4k: null, seasonNumber: null }]);
      await migration.down(runner);
      expect(
        await runner.hasColumn(
          'media_availability_subscription',
          'seasonNumber'
        )
      ).toBe(false);
      expect(new PostgresScopeMigration().name).toBe(migration.name);
    } finally {
      await runner.release();
      await source.destroy();
    }
  });
});
