import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserLumenPreferences1795096200000 implements MigrationInterface {
  name = 'AddUserLumenPreferences1795096200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_settings', 'lumenPreferences'))) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" ADD "lumenPreferences" text'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user_settings', 'lumenPreferences')) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" DROP COLUMN "lumenPreferences"'
      );
    }
  }
}
