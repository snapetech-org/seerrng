import {
  TableColumn,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';

export class AddTvSeasonNumberMappings1791150000000 implements MigrationInterface {
  name = 'AddTvSeasonNumberMappings1791150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('media_request', 'overrideTvdbId'))) {
      await queryRunner.addColumn(
        'media_request',
        new TableColumn({
          name: 'overrideTvdbId',
          type: 'integer',
          isNullable: true,
        })
      );
    }
    if (await queryRunner.hasTable('media_identifier_season_mapping')) {
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "media_identifier_season_mapping" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaIdentifierId" integer NOT NULL, "sonarrServerId" integer NOT NULL, "is4k" boolean NOT NULL DEFAULT (0), "seasonNumber" integer NOT NULL, "externalSeasonNumber" integer NOT NULL, CONSTRAINT "UNIQUE_MEDIA_IDENTIFIER_SEASON_MAPPING" UNIQUE ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber"), CONSTRAINT "UNIQUE_MEDIA_IDENTIFIER_EXTERNAL_SEASON_MAPPING" UNIQUE ("mediaIdentifierId", "sonarrServerId", "is4k", "externalSeasonNumber"), CONSTRAINT "FK_media_identifier_season_mapping_identifier" FOREIGN KEY ("mediaIdentifierId") REFERENCES "media_identifier" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_media_identifier_season_mapping_identifier" ON "media_identifier_season_mapping" ("mediaIdentifierId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_media_identifier_season_mapping_identifier"`
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "media_identifier_season_mapping"`
    );
    if (await queryRunner.hasColumn('media_request', 'overrideTvdbId')) {
      // A direct drop keeps the table's keys and indexes intact; TypeORM's
      // SQLite dropColumn rebuilds the whole table.
      await queryRunner.query(
        `ALTER TABLE "media_request" DROP COLUMN "overrideTvdbId"`
      );
    }
  }
}
