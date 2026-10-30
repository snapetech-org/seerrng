import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { RequestFutureSeasons1793400000000 as PostgresMigration } from '../migration/postgres/1793400000000-RequestFutureSeasons';
import { RequestFutureSeasons1793400000000 as SqliteMigration } from '../migration/sqlite/1793400000000-RequestFutureSeasons';
import {
  resolveFutureSeasonMonitoring,
  validateFutureSeasonPreference,
} from './futureSeasonMonitoring';

test('future-season preference is a strict TV-only boolean', () => {
  for (const value of [false, true])
    assert.equal(validateFutureSeasonPreference(value, 'tv'), undefined);
  for (const value of [null, 0, 1, 'true', [], {}])
    assert.ok(validateFutureSeasonPreference(value, 'tv'));
  for (const type of ['book', 'movie', undefined])
    assert.ok(validateFutureSeasonPreference(true, type));
  assert.equal(validateFutureSeasonPreference(undefined, 'movie'), undefined);
});
test('opt-in, opt-out and inherited defaults remain distinct', () => {
  assert.deepEqual(resolveFutureSeasonMonitoring(true, false, 'none'), {
    monitorNewItems: 'all',
    enableFutureSeasons: true,
  });
  assert.deepEqual(resolveFutureSeasonMonitoring(false, false, 'all'), {
    monitorNewItems: 'none',
    enableFutureSeasons: false,
  });
  for (const inherited of ['all', 'none'] as const)
    for (const preference of [undefined, null])
      assert.deepEqual(
        resolveFutureSeasonMonitoring(preference, false, inherited),
        { monitorNewItems: inherited, enableFutureSeasons: false }
      );
});
test('Episode Queue and watch-gate policy override new and legacy preferences', () => {
  for (const preference of [true, false, undefined, null])
    assert.deepEqual(resolveFutureSeasonMonitoring(preference, true, 'all'), {
      monitorNewItems: 'none',
      enableFutureSeasons: false,
    });
});
for (const Migration of [SqliteMigration, PostgresMigration]) {
  test(`${new Migration().name}: migration preserves legacy nulls and survives repeated up/down`, async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(
      'CREATE TABLE media_request (id integer PRIMARY KEY); INSERT INTO media_request (id) VALUES (1)'
    );
    const runner = {
      hasTable: async () => true,
      hasColumn: async (_: string, name: string) =>
        db
          .prepare('PRAGMA table_info(media_request)')
          .all()
          .some((row) => row.name === name),
      query: async (sql: string) => db.exec(sql),
      dropColumn: async (_: string, name: string) =>
        db.exec(`ALTER TABLE media_request DROP COLUMN "${name}"`),
    } as unknown as QueryRunner;
    const migration = new Migration();
    try {
      await migration.up(runner);
      await migration.up(runner);
      assert.equal(
        db.prepare('SELECT monitorFutureSeasons FROM media_request').get()
          ?.monitorFutureSeasons,
        null
      );
      db.exec('UPDATE media_request SET monitorFutureSeasons = 0');
      assert.equal(
        db.prepare('SELECT monitorFutureSeasons FROM media_request').get()
          ?.monitorFutureSeasons,
        0
      );
      await migration.down(runner);
      await migration.down(runner);
      assert.equal(db.prepare('SELECT id FROM media_request').get()?.id, 1);
    } finally {
      db.close();
    }
  });
}
