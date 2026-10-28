import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddUserInterfaceTheme1792700000000 } from './1792700000000-AddUserInterfaceTheme';

test('SQLite interface profiles default to Orig and preserve explicit John choices', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new AddUserInterfaceTheme1792700000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "user_settings" ("id" integer PRIMARY KEY, "advancedThemeOverrides" text)'
    );
    await queryRunner.query(
      `INSERT INTO "user_settings" ("id", "advancedThemeOverrides") VALUES (1, NULL), (2, '{"preset":"john-redesign","--theme-page-bg":"#123456"}'), (3, '{"preset":"other"}')`
    );

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    assert.deepEqual(
      await queryRunner.query(
        'SELECT "id", "interfaceTheme" FROM "user_settings" ORDER BY "id"'
      ),
      [
        { id: 1, interfaceTheme: 'seerrOrig' },
        { id: 2, interfaceTheme: 'seerrNGJ' },
        { id: 3, interfaceTheme: 'seerrOrig' },
      ]
    );

    await migration.down(queryRunner);
    assert.equal(
      await queryRunner.hasColumn('user_settings', 'interfaceTheme'),
      false
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
