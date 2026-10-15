import { AddMediaRequestQuotaException1791930000000 as SqliteQuotaExceptionMigration } from '@server/migration/sqlite/1791930000000-AddMediaRequestQuotaException';
import type { QueryRunner } from 'typeorm';

export class AddMediaRequestQuotaException1791930000000 extends SqliteQuotaExceptionMigration {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('media_request', 'quotaException'))) {
      await queryRunner.query(
        'ALTER TABLE "media_request" ADD "quotaException" boolean NOT NULL DEFAULT false'
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('media_request', 'quotaException')) {
      await queryRunner.dropColumn('media_request', 'quotaException');
    }
  }
}
