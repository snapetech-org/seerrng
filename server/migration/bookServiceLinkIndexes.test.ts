import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { AddBookServiceLinkIndexes1794500000000 as PostgresMigration } from './postgres/1794500000000-AddBookServiceLinkIndexes';
import { AddBookServiceLinkIndexes1794500000000 as SqliteMigration } from './sqlite/1794500000000-AddBookServiceLinkIndexes';

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
});
