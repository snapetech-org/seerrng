import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddMediaRequestQuotaException1791140000000 } from './1791140000000-AddMediaRequestQuotaException';

test('adds a default-false quota exception marker to existing requests', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new AddMediaRequestQuotaException1791140000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "media_request" ("id" integer PRIMARY KEY, "status" integer NOT NULL)'
    );
    await queryRunner.query(
      'INSERT INTO "media_request" ("id", "status") VALUES (1, 1)'
    );

    await migration.up(queryRunner);

    assert.deepEqual(
      await queryRunner.query(
        'SELECT "quotaException" FROM "media_request" WHERE "id" = 1'
      ),
      [{ quotaException: 0 }]
    );
    await queryRunner.query(
      'UPDATE "media_request" SET "quotaException" = 1 WHERE "id" = 1'
    );
    assert.deepEqual(
      await queryRunner.query(
        'SELECT "quotaException" FROM "media_request" WHERE "id" = 1'
      ),
      [{ quotaException: 1 }]
    );

    await migration.down(queryRunner);
    const columns = await queryRunner.query(
      'PRAGMA table_info("media_request")'
    );
    assert.equal(
      columns.some(
        (column: { name: string }) => column.name === 'quotaException'
      ),
      false
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
