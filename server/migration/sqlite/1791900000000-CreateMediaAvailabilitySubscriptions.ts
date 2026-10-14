import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMediaAvailabilitySubscriptions1791900000000 implements MigrationInterface {
  name = 'CreateMediaAvailabilitySubscriptions1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "media_availability_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "mediaId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "UQ_media_availability_subscription_user_media" UNIQUE ("userId", "mediaId"), CONSTRAINT "FK_media_availability_subscription_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE, CONSTRAINT "FK_media_availability_subscription_media" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_media_availability_subscription_media" ON "media_availability_subscription" ("mediaId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_media_availability_subscription_media"`
    );
    await queryRunner.query(`DROP TABLE "media_availability_subscription"`);
  }
}
