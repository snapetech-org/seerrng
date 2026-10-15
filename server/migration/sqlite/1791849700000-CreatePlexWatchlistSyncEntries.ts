import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlexWatchlistSyncEntries1791849700000 implements MigrationInterface {
  name = 'CreatePlexWatchlistSyncEntries1791849700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('plex_watchlist_sync_entry')) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "plex_watchlist_sync_entry" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "sourcePlexId" integer NOT NULL,
        "tmdbId" integer NOT NULL,
        "mediaType" varchar(16) NOT NULL,
        "watchlistedAt" datetime NOT NULL,
        "processedSeasonNumbers" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_plex_watchlist_sync_entry_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_plex_watchlist_sync_entry_user_source_media" ON "plex_watchlist_sync_entry" ("userId", "sourcePlexId", "mediaType", "tmdbId")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_plex_watchlist_sync_entry_user_source_media"'
    );
    await queryRunner.query('DROP TABLE IF EXISTS "plex_watchlist_sync_entry"');
  }
}
