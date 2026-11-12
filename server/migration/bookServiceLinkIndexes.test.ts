import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { describe, expect, it, test } from 'vitest';
import { AddBookServiceLinkIndexes1794500000000 as PostgresMigration } from './postgres/1794500000000-AddBookServiceLinkIndexes';
import { AddBookServiceLinkIndexes1794500000000 as SqliteMigration } from './sqlite/1794500000000-AddBookServiceLinkIndexes';

const postgresUrl = process.env.SEERR_TEST_POSTGRES_URL;

describe('book service-link index migration', () => {
  it('indexes ebook and audiobook lookups and rolls back cleanly', async () => {
    const source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.query(`
        CREATE TABLE "media" (
          "id" integer primary key,
          "mediaType" varchar NOT NULL,
          "serviceId" integer,
          "externalServiceId" integer,
          "audiobookServiceId" integer,
          "audiobookExternalServiceId" integer
        )
      `);
      const migration = new SqliteMigration();
      await migration.up(runner);
      await migration.up(runner);

      const table = await runner.getTable('media');
      expect(
        table?.indices.find(
          (index) => index.name === 'IDX_media_book_ebook_service_link'
        )?.columnNames
      ).toEqual(['mediaType', 'serviceId', 'externalServiceId']);
      expect(
        table?.indices.find(
          (index) => index.name === 'IDX_media_book_audiobook_service_link'
        )?.columnNames
      ).toEqual([
        'mediaType',
        'audiobookServiceId',
        'audiobookExternalServiceId',
      ]);

      await migration.down(runner);
      const rolledBackTable = await runner.getTable('media');
      expect(
        rolledBackTable?.indices.some(
          (index) => index.name === 'IDX_media_book_ebook_service_link'
        )
      ).toBe(false);
      expect(
        rolledBackTable?.indices.some(
          (index) => index.name === 'IDX_media_book_audiobook_service_link'
        )
      ).toBe(false);
      expect(new PostgresMigration().name).toBe(migration.name);
    } finally {
      await runner.release();
      await source.destroy();
    }
  });

  (postgresUrl ? test : test.skip)(
    'creates and rolls back both service-link indexes on PostgreSQL',
    async () => {
      const schema = `book_service_link_${randomBytes(8).toString('hex')}`;
      const source = await new DataSource({
        type: 'postgres',
        url: postgresUrl,
        schema,
      }).initialize();
      const runner = source.createQueryRunner();
      await runner.connect();
      try {
        await runner.query(`CREATE SCHEMA "${schema}"`);
        await runner.query(`SET search_path TO "${schema}"`);
        await runner.query(`
          CREATE TABLE "media" (
            "id" integer primary key,
            "mediaType" varchar NOT NULL,
            "serviceId" integer,
            "externalServiceId" integer,
            "audiobookServiceId" integer,
            "audiobookExternalServiceId" integer
          )
        `);
        const migration = new PostgresMigration();
        await migration.up(runner);
        await migration.up(runner);

        const table = await runner.getTable('media');
        expect(
          table?.indices.find(
            (index) => index.name === 'IDX_media_book_ebook_service_link'
          )?.columnNames
        ).toEqual(['mediaType', 'serviceId', 'externalServiceId']);
        expect(
          table?.indices.find(
            (index) => index.name === 'IDX_media_book_audiobook_service_link'
          )?.columnNames
        ).toEqual([
          'mediaType',
          'audiobookServiceId',
          'audiobookExternalServiceId',
        ]);

        await migration.down(runner);
        const rolledBackTable = await runner.getTable('media');
        expect(
          rolledBackTable?.indices.some(
            (index) => index.name === 'IDX_media_book_ebook_service_link'
          )
        ).toBe(false);
        expect(
          rolledBackTable?.indices.some(
            (index) => index.name === 'IDX_media_book_audiobook_service_link'
          )
        ).toBe(false);
      } finally {
        await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await runner.release();
        await source.destroy();
      }
    }
  );
});
