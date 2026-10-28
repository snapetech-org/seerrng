import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserInterfaceTheme1792700000000 implements MigrationInterface {
  name = 'AddUserInterfaceTheme1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_settings', 'interfaceTheme'))) {
      await queryRunner.query(
        `ALTER TABLE "user_settings" ADD COLUMN "interfaceTheme" varchar NOT NULL DEFAULT 'seerrOrig'`
      );
    }
    // Preserve the only explicit John-system choice that existed before
    // interface profiles became first-class settings.
    await queryRunner.query(
      `UPDATE "user_settings" SET "interfaceTheme" = 'seerrNGJ' WHERE "advancedThemeOverrides" LIKE '%"preset":"john-redesign"%'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" DROP COLUMN "interfaceTheme"'
    );
  }
}
