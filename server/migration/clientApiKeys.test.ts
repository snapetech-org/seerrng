import { DataSource, type QueryRunner } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { CreateClientApiKeys1794222000000 as PostgresMigration } from './postgres/1794222000000-CreateClientApiKeys';
import { CreateClientApiKeys1794222000000 as SqliteMigration } from './sqlite/1794222000000-CreateClientApiKeys';

describe('client token storage migration', () => {
  it('enforces unique digests and owner deletion, and rolls back cleanly', async () => {
    const source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.query('CREATE TABLE "user" (id integer PRIMARY KEY)');
      await runner.query('INSERT INTO "user" VALUES (1)');
      await new SqliteMigration().up(runner);
      const insert = () =>
        runner.query(
          'INSERT INTO "client_api_key" ("userId", name, "tokenHash", scopes, "credentialVersion", "expiresAt") VALUES (1, ?, ?, ?, ?, ?)',
          ['Fixture', 'a'.repeat(64), '["discover"]', '0', '2026-12-01']
        );
      await insert();
      await expect(insert()).rejects.toThrow(/UNIQUE/);
      await runner.query('DELETE FROM "user" WHERE id = 1');
      expect(await runner.query('SELECT * FROM "client_api_key"')).toEqual([]);
      await new SqliteMigration().down(runner);
      expect(await runner.hasTable('client_api_key')).toBe(false);
    } finally {
      await runner.release();
      await source.destroy();
    }
  });
  it('keeps PostgreSQL expiry timezone-aware and preserves ownership constraints', async () => {
    const queries: string[] = [];
    await new PostgresMigration().up({
      query: async (query: string) => {
        queries.push(query);
      },
    } as QueryRunner);
    expect(queries[0]).toContain('"expiresAt" timestamp with time zone');
    expect(queries[0]).toContain('"tokenHash" varchar(64) NOT NULL UNIQUE');
    expect(queries[0]).toContain('ON DELETE CASCADE');
    expect(new PostgresMigration().name).toBe(new SqliteMigration().name);
  });
});
