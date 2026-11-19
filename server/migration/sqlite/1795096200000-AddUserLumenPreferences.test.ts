import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { AddUserLumenPreferences1795096200000 } from './1795096200000-AddUserLumenPreferences';

test('adds the nullable Lumen preference column without changing saved user settings', async () => {
  const source = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.query(
      'CREATE TABLE "user_settings" ("id" integer PRIMARY KEY, "locale" varchar NOT NULL DEFAULT \'en\')'
    );
    await runner.query(
      `INSERT INTO "user_settings" ("id", "locale") VALUES (1, 'fr')`
    );
    const migration = new AddUserLumenPreferences1795096200000();
    await migration.up(runner);
    await runner.query(
      `UPDATE "user_settings" SET "lumenPreferences" = ? WHERE "id" = 1`,
      [JSON.stringify({ theme: 'light', rows: { hero: false } })]
    );
    await runner.query('INSERT INTO "user_settings" ("id") VALUES (2)');
    assert.deepEqual(
      await runner.query(
        'SELECT "id", "locale", "lumenPreferences" FROM "user_settings" ORDER BY "id"'
      ),
      [
        {
          id: 1,
          locale: 'fr',
          lumenPreferences: '{"theme":"light","rows":{"hero":false}}',
        },
        { id: 2, locale: 'en', lumenPreferences: null },
      ]
    );
    await migration.down(runner);
    assert.equal(
      await runner.hasColumn('user_settings', 'lumenPreferences'),
      false
    );
    assert.equal(
      (
        await runner.query(
          'SELECT "locale" FROM "user_settings" WHERE "id" = 1'
        )
      )[0].locale,
      'fr'
    );
  } finally {
    await runner.release();
    await source.destroy();
  }
});
