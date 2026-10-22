import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserMediaCategoryPreferences1792690000000 implements MigrationInterface {
  name = 'AddUserMediaCategoryPreferences1792690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" ADD COLUMN "enabledMediaCategories" text'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" DROP COLUMN "enabledMediaCategories"'
    );
  }
}
