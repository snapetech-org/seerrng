import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMediaServiceStatuses1791930000000 implements MigrationInterface {
  name = 'CreateMediaServiceStatuses1791930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('media_service_status')) return;
    await queryRunner.query(
      `CREATE TABLE "media_service_status" ("id" SERIAL NOT NULL, "mediaId" integer NOT NULL, "serviceType" character varying(8) NOT NULL, "serverId" integer NOT NULL, "format" character varying(8) NOT NULL, "status" integer NOT NULL DEFAULT 1, "externalServiceId" integer, "externalServiceSlug" character varying(512), "seasonStatuses" text, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_media_service_status" PRIMARY KEY ("id"), CONSTRAINT "FK_media_service_status_media" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_media_service_status_destination" ON "media_service_status" ("mediaId", "serviceType", "serverId", "format")`
    );
    await queryRunner.query(
      `INSERT INTO "media_service_status" ("mediaId", "serviceType", "serverId", "format", "status", "externalServiceId", "externalServiceSlug") SELECT "id", CASE WHEN "mediaType" = 'movie' THEN 'radarr' ELSE 'sonarr' END, "serviceId", 'standard', "status", "externalServiceId", "externalServiceSlug" FROM "media" WHERE "mediaType" IN ('movie', 'tv') AND "serviceId" IS NOT NULL AND "status" <> 1`
    );
    await queryRunner.query(
      `INSERT INTO "media_service_status" ("mediaId", "serviceType", "serverId", "format", "status", "externalServiceId", "externalServiceSlug") SELECT "id", CASE WHEN "mediaType" = 'movie' THEN 'radarr' ELSE 'sonarr' END, "serviceId4k", '4k', "status4k", "externalServiceId4k", "externalServiceSlug4k" FROM "media" WHERE "mediaType" IN ('movie', 'tv') AND "serviceId4k" IS NOT NULL AND "status4k" <> 1`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('media_service_status'))) return;
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_media_service_status_destination"`
    );
    await queryRunner.query(`DROP TABLE "media_service_status"`);
  }
}
