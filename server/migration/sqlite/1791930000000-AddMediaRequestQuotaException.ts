import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaRequestQuotaException1791930000000 implements MigrationInterface {
  name = 'AddMediaRequestQuotaException1791930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('media_request', 'quotaException'))) {
      await queryRunner.query(
        'ALTER TABLE "media_request" ADD "quotaException" boolean NOT NULL DEFAULT 0'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('media_request', 'quotaException')) {
      await queryRunner.dropColumn('media_request', 'quotaException');
    }
  }
}
