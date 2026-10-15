import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { CreatePlexWatchlistSyncEntries1791849700000 } from './1791849700000-CreatePlexWatchlistSyncEntries';

test('Plex watchlist entry migration creates and removes its tracking table', async () => {
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

    assert.equal(await queryRunner.hasTable('plex_watchlist_sync_entry'), true);
    for (const column of [
      'userId',
      'sourcePlexId',
      'tmdbId',
      'mediaType',
      'watchlistedAt',
      'processedSeasonNumbers',
    ]) {
      assert.equal(
        await queryRunner.hasColumn('plex_watchlist_sync_entry', column),
        true
      );
    }

    const indexes = await queryRunner.getTable('plex_watchlist_sync_entry');
    assert.equal(
      indexes?.indices.some(
        (index) =>
          index.name === 'IDX_plex_watchlist_sync_entry_user_source_media' &&
          index.isUnique
      ),
      true
    );

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
