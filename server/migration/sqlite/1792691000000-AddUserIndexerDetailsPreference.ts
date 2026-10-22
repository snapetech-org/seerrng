import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIndexerDetailsPreference1792691000000 implements MigrationInterface {
  name = 'AddUserIndexerDetailsPreference1792691000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" ADD COLUMN "showIndexerDetails" integer'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" DROP COLUMN "showIndexerDetails"'
    );
  }
}
