import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlexWatchlistSyncEntries1791849700000 implements MigrationInterface {
  name = 'CreatePlexWatchlistSyncEntries1791849700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('plex_watchlist_sync_entry')) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "plex_watchlist_sync_entry" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "sourcePlexId" integer NOT NULL,
        "tmdbId" integer NOT NULL,
        "mediaType" character varying(16) NOT NULL,
        "watchlistedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "processedSeasonNumbers" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_plex_watchlist_sync_entry" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plex_watchlist_sync_entry_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
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
