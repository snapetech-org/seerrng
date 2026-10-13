import { AddMediaRequestQuotaException1791140000000 as SqliteQuotaExceptionMigration } from '@server/migration/sqlite/1791140000000-AddMediaRequestQuotaException';

export class AddMediaRequestQuotaException1791140000 extends SqliteQuotaExceptionMigration {
  async up(queryRunner: import('typeorm').QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "media_request" ADD "quotaException" boolean NOT NULL DEFAULT false'
    );
  }

  async down(queryRunner: import('typeorm').QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "media_request" DROP COLUMN "quotaException"'
    );
  }
}
