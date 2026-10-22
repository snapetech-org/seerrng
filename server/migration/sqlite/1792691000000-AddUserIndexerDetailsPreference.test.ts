import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddUserIndexerDetailsPreference1792691000000 } from './1792691000000-AddUserIndexerDetailsPreference';

test('adds and removes per-user indexer detail visibility', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new AddUserIndexerDetailsPreference1792691000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "user_settings" ("id" integer PRIMARY KEY, "userId" integer, "enabledMediaCategories" text)'
    );
    await queryRunner.query(
      'INSERT INTO "user_settings" ("id", "userId", "enabledMediaCategories") VALUES (1, 7, ?)',
      [JSON.stringify({ movie: false })]
    );
    await migration.up(queryRunner);
    await queryRunner.query(
      'UPDATE "user_settings" SET "showIndexerDetails" = 0 WHERE "id" = 1'
    );
    assert.ok(
      (await queryRunner.query('PRAGMA table_info("user_settings")')).some(
        (column: { name: string }) => column.name === 'showIndexerDetails'
      )
    );
    assert.deepEqual(
      await queryRunner.query(
        'SELECT "enabledMediaCategories", "showIndexerDetails" FROM "user_settings" WHERE "id" = 1'
      ),
      [{ enabledMediaCategories: '{"movie":false}', showIndexerDetails: 0 }]
    );

    await migration.down(queryRunner);
    assert.deepEqual(
      (await queryRunner.query('PRAGMA table_info("user_settings")')).map(
        (column: { name: string }) => column.name
      ),
      ['id', 'userId', 'enabledMediaCategories']
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
