import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAurralServiceColumns1795284000000 implements MigrationInterface {
  name = 'AddAurralServiceColumns1795284000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('media', 'musicServiceType'))) {
      await queryRunner.query(
        `ALTER TABLE "media" ADD "musicServiceType" character varying`
      );
    }
    if (!(await queryRunner.hasColumn('track_request', 'backendType'))) {
      await queryRunner.query(
        `ALTER TABLE "track_request" ADD "backendType" character varying(16) NOT NULL DEFAULT 'slskdn'`
      );
    }
    if (!(await queryRunner.hasColumn('track_request', 'externalRequestId'))) {
      await queryRunner.query(
        `ALTER TABLE "track_request" ADD "externalRequestId" character varying(128)`
      );
    }
    if (!(await queryRunner.hasColumn('track_request', 'serverId'))) {
      await queryRunner.query(
        `ALTER TABLE "track_request" ADD "serverId" integer`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('track_request', 'serverId')) {
      await queryRunner.query(
        `ALTER TABLE "track_request" DROP COLUMN "serverId"`
      );
    }
    if (await queryRunner.hasColumn('track_request', 'externalRequestId')) {
      await queryRunner.query(
        `ALTER TABLE "track_request" DROP COLUMN "externalRequestId"`
      );
    }
    if (await queryRunner.hasColumn('track_request', 'backendType')) {
      await queryRunner.query(
        `ALTER TABLE "track_request" DROP COLUMN "backendType"`
      );
    }
    if (await queryRunner.hasColumn('media', 'musicServiceType')) {
      await queryRunner.query(
        `ALTER TABLE "media" DROP COLUMN "musicServiceType"`
      );
    }
  }
}
