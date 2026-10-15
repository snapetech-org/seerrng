import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { CreatePlexWatchlistSyncEntries1791849700000 } from './1791849700000-CreatePlexWatchlistSyncEntries';

test('can run up and down repeatedly', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new CreatePlexWatchlistSyncEntries1791849700000();

  try {
    await queryRunner.query(
      'CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)'
    );

    await migration.up(queryRunner);
    await migration.up(queryRunner);
    assert.equal(await queryRunner.hasTable('plex_watchlist_sync_entry'), true);

    await migration.down(queryRunner);
    await migration.down(queryRunner);
    assert.equal(
      await queryRunner.hasTable('plex_watchlist_sync_entry'),
      false
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
