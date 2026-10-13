import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaRequestQuotaException1791140000000 implements MigrationInterface {
  name = 'AddMediaRequestQuotaException1791140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "media_request" ADD "quotaException" boolean NOT NULL DEFAULT 0'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "media_request" DROP COLUMN "quotaException"'
    );
  }
}
