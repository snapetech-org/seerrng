import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEpisodeAvailability1793440362000 implements MigrationInterface {
  name = 'AddEpisodeAvailability1793440362000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('episode_availability'))) {
      await queryRunner.query(`
        CREATE TABLE "episode_availability" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "episodeNumber" integer NOT NULL,
          "serviceId" integer NOT NULL,
          "externalSeriesId" integer NOT NULL,
          "is4k" integer NOT NULL DEFAULT 0,
          "seasonId" integer NOT NULL,
          CONSTRAINT "FK_EPISODE_AVAILABILITY_SEASON" FOREIGN KEY ("seasonId") REFERENCES "season" ("id") ON DELETE CASCADE,
          CONSTRAINT "UNIQUE_EPISODE_AVAILABILITY" UNIQUE ("seasonId", "episodeNumber", "serviceId", "externalSeriesId", "is4k")
        )
      `);
      await queryRunner.query(
        'CREATE INDEX "IDX_EPISODE_AVAILABILITY_SEASON_SERVICE" ON "episode_availability" ("seasonId", "serviceId")'
      );
      await queryRunner.query(
        'CREATE INDEX "IDX_EPISODE_AVAILABILITY_SERVICE_SERIES" ON "episode_availability" ("serviceId", "externalSeriesId")'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "episode_availability"');
  }
}
