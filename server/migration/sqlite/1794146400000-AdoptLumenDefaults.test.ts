import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { AdoptLumenDefaults1794146400000 } from './1794146400000-AdoptLumenDefaults';

test('upgrade adopts Persius for every existing account and future raw inserts while retaining unrelated settings', async () => {
  const ds = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const runner = ds.createQueryRunner();
  try {
    await runner.query(
      `CREATE TABLE user_settings (id integer PRIMARY KEY, interfaceTheme varchar NOT NULL DEFAULT 'seerrOrig', locale varchar NOT NULL DEFAULT 'en')`
    );
    await runner.query(
      `INSERT INTO user_settings (id, interfaceTheme, locale) VALUES (1, 'seerrOrig', 'fr'), (2, 'seerrNGJ', 'ar'), (3, 'custom-theme', 'de')`
    );
    await new AdoptLumenDefaults1794146400000().up(runner);
    await runner.query('INSERT INTO user_settings (id) VALUES (4)');
    assert.deepEqual(
      await runner.query('SELECT * FROM user_settings ORDER BY id'),
      [
        { id: 1, interfaceTheme: 'persiusNG', locale: 'fr' },
        { id: 2, interfaceTheme: 'persiusNG', locale: 'ar' },
        { id: 3, interfaceTheme: 'persiusNG', locale: 'de' },
        { id: 4, interfaceTheme: 'persiusNG', locale: 'en' },
      ]
    );
    await runner.query(
      `UPDATE user_settings SET interfaceTheme='seerrNGJ' WHERE id=2`
    );
    await new AdoptLumenDefaults1794146400000().down(runner);
    assert.equal(
      (
        await runner.query(
          'SELECT interfaceTheme FROM user_settings WHERE id=2'
        )
      )[0].interfaceTheme,
      'seerrNGJ'
    );
  } finally {
    await runner.release();
    await ds.destroy();
  }
});
