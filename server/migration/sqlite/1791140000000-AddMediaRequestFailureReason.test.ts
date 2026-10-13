import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddMediaRequestFailureReason1791140000000 } from './1791140000000-AddMediaRequestFailureReason';

test('adds and removes request failure reason without losing request rows', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new AddMediaRequestFailureReason1791140000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "media_request" ("id" integer PRIMARY KEY, "status" integer NOT NULL)'
    );
    await queryRunner.query(
      'INSERT INTO "media_request" ("id", "status") VALUES (1, 4)'
    );

    await migration.up(queryRunner);

    const addedColumns = await queryRunner.query(
      'PRAGMA table_info("media_request")'
    );
    assert.equal(
      addedColumns.some(
        (column: { name: string }) => column.name === 'failureReason'
      ),
      true
    );
    await queryRunner.query(
      'UPDATE "media_request" SET "failureReason" = ? WHERE "id" = 1',
      ['tvdb_id_unresolved']
    );
    assert.deepEqual(
      await queryRunner.query(
        'SELECT "id", "status", "failureReason" FROM "media_request" WHERE "id" = 1'
      ),
      [
        {
          id: 1,
          status: 4,
          failureReason: 'tvdb_id_unresolved',
        },
      ]
    );

    await migration.down(queryRunner);
    const removedColumns = await queryRunner.query(
      'PRAGMA table_info("media_request")'
    );
    assert.equal(
      removedColumns.some(
        (column: { name: string }) => column.name === 'failureReason'
      ),
      false
    );
    assert.deepEqual(
      await queryRunner.query(
        'SELECT "id", "status" FROM "media_request" WHERE "id" = 1'
      ),
      [{ id: 1, status: 4 }]
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
