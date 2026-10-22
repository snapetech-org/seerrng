import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddUserMediaCategoryPreferences1792690000000 } from './1792690000000-AddUserMediaCategoryPreferences';

test('adds and removes per-user media category preferences', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new AddUserMediaCategoryPreferences1792690000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "user_settings" ("id" integer PRIMARY KEY, "userId" integer, "locale" varchar NOT NULL DEFAULT \'\')'
    );
    await queryRunner.query(
      'INSERT INTO "user_settings" ("id", "userId") VALUES (1, 7)'
    );

    await migration.up(queryRunner);
    await queryRunner.query(
      'UPDATE "user_settings" SET "enabledMediaCategories" = ? WHERE "id" = 1',
      [JSON.stringify({ movie: false })]
    );
    assert.deepEqual(
      await queryRunner.query(
        'SELECT "userId", "enabledMediaCategories" FROM "user_settings" WHERE "id" = 1'
      ),
      [{ userId: 7, enabledMediaCategories: '{"movie":false}' }]
    );

    await migration.down(queryRunner);
    assert.deepEqual(
      (await queryRunner.query('PRAGMA table_info("user_settings")')).map(
        (column: { name: string }) => column.name
      ),
      ['id', 'userId', 'locale']
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
