import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaRequestQuotaException1791150000000 implements MigrationInterface {
  name = 'AddMediaRequestQuotaException1791150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('media_request', 'quotaException')) {
      return;
    }

    await queryRunner.query(
      'ALTER TABLE "media_request" ADD "quotaException" boolean NOT NULL DEFAULT false'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('media_request', 'quotaException'))) {
      return;
    }

    await queryRunner.query(
      'ALTER TABLE "media_request" DROP COLUMN "quotaException"'
    );
  }
}
