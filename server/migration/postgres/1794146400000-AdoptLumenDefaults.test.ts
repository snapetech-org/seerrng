import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { AdoptLumenDefaults1794146400000 } from './1794146400000-AdoptLumenDefaults';

const url = process.env.SEERR_TEST_POSTGRES_URL;
(url ? test : test.skip)(
  'PostgreSQL adopts Persius once without losing user preferences',
  async () => {
    const schema = `lumen_defaults_${randomUUID().replaceAll('-', '')}`;
    const ds = await new DataSource({
      type: 'postgres',
      url,
      schema,
    }).initialize();
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await runner.query(
        `CREATE TABLE user_settings (id integer PRIMARY KEY, "interfaceTheme" varchar NOT NULL DEFAULT 'seerrOrig', locale varchar NOT NULL DEFAULT 'en')`
      );
      await runner.query(
        `INSERT INTO user_settings (id, "interfaceTheme", locale) VALUES (1, 'seerrOrig', 'fr'), (2, 'seerrNGJ', 'ar')`
      );
      const migration = new AdoptLumenDefaults1794146400000();
      await migration.up(runner);
      await runner.query('INSERT INTO user_settings (id) VALUES (3)');
      assert.deepEqual(
        await runner.query('SELECT * FROM user_settings ORDER BY id'),
        [
          { id: 1, interfaceTheme: 'persiusNG', locale: 'fr' },
          { id: 2, interfaceTheme: 'persiusNG', locale: 'ar' },
          { id: 3, interfaceTheme: 'persiusNG', locale: 'en' },
        ]
      );
      await runner.query(
        `UPDATE user_settings SET "interfaceTheme"='seerrNGJ' WHERE id=2`
      );
      await migration.down(runner);
      assert.equal(
        (
          await runner.query(
            'SELECT "interfaceTheme" FROM user_settings WHERE id=2'
          )
        )[0].interfaceTheme,
        'seerrNGJ'
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await ds.destroy();
    }
  }
);
