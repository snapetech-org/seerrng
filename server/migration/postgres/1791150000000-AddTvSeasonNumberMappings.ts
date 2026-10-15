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
      `CREATE TABLE "media_identifier_season_mapping" ("id" SERIAL NOT NULL, "mediaIdentifierId" integer NOT NULL, "sonarrServerId" integer NOT NULL, "is4k" boolean NOT NULL DEFAULT false, "seasonNumber" integer NOT NULL, "externalSeasonNumber" integer NOT NULL, CONSTRAINT "UNIQUE_MEDIA_IDENTIFIER_SEASON_MAPPING" UNIQUE ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber"), CONSTRAINT "UNIQUE_MEDIA_IDENTIFIER_EXTERNAL_SEASON_MAPPING" UNIQUE ("mediaIdentifierId", "sonarrServerId", "is4k", "externalSeasonNumber"), CONSTRAINT "PK_media_identifier_season_mapping" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_media_identifier_season_mapping_identifier" ON "media_identifier_season_mapping" ("mediaIdentifierId")`
    );
    await queryRunner.query(
      `ALTER TABLE "media_identifier_season_mapping" ADD CONSTRAINT "FK_media_identifier_season_mapping_identifier" FOREIGN KEY ("mediaIdentifierId") REFERENCES "media_identifier"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "media_identifier_season_mapping"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN IF EXISTS "overrideTvdbId"`
    );
  }
}
