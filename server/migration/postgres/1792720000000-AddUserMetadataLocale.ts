import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserMetadataLocale1792720000000 implements MigrationInterface {
  name = 'AddUserMetadataLocale1792720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_settings', 'metadataLocale'))) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" ADD COLUMN "metadataLocale" varchar'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user_settings', 'metadataLocale')) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" DROP COLUMN "metadataLocale"'
      );
    }
  }
}
