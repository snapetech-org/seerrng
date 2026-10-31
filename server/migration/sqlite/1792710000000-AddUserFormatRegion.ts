import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFormatRegion1792710000000 implements MigrationInterface {
  name = 'AddUserFormatRegion1792710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_settings', 'formatRegion'))) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" ADD COLUMN "formatRegion" varchar'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user_settings', 'formatRegion')) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" DROP COLUMN "formatRegion"'
      );
    }
  }
}
