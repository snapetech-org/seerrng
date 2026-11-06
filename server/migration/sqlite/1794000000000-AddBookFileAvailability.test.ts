import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DataSource } from 'typeorm';
import { AddBookFileAvailability1794000000000 } from './1794000000000-AddBookFileAvailability';
it('invalidates unverified legacy manager availability without inventing format evidence and preserves observed copies on rerun', async () => {
  const source = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
  });
  await source.initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.query(
      `CREATE TABLE "media" ("id" integer PRIMARY KEY, "mediaType" varchar, "status" integer, "ratingKey" varchar, "audiobookLibraryServiceId" integer, "audiobookLibraryItemId" varchar)`
    );
    await runner.query(
      `INSERT INTO "media" VALUES (1,'book',5,NULL,NULL,NULL),(2,'book',5,NULL,0,'li_fixture'),(3,'book',5,'123',NULL,NULL),(4,'movie',5,NULL,NULL,NULL)`
    );
    const migration = new AddBookFileAvailability1794000000000();
    await migration.up(runner);
    const rows = await runner.query('SELECT * FROM "media" ORDER BY "id"');
    assert.deepEqual(
      rows.map((r: { status: number }) => r.status),
      [1, 5, 5, 5]
    );
    assert.equal(rows[0].availableEbookServiceIds, null);
    assert.equal(rows[0].availableAudiobookServiceIds, null);
    await runner.query(
      `UPDATE "media" SET "status"=5,"availableEbookServiceIds"='[0]' WHERE "id"=1`
    );
    await migration.up(runner);
    assert.equal(
      (await runner.query('SELECT "status" FROM "media" WHERE "id"=1'))[0]
        .status,
      5
    );
    await migration.down(runner);
    assert.equal(
      await runner.hasColumn('media', 'availableEbookServiceIds'),
      false
    );
    assert.equal(
      (await runner.query('SELECT COUNT(*) AS count FROM "media"'))[0].count,
      4
    );
  } finally {
    await runner.release();
    await source.destroy();
  }
});
