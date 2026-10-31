import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverrideRuleLanguageProfile1792720000000 implements MigrationInterface {
  name = 'AddOverrideRuleLanguageProfile1792720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('override_rule', 'languageProfileId'))) {
      await queryRunner.query(
        'ALTER TABLE "override_rule" ADD COLUMN "languageProfileId" integer'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('override_rule', 'languageProfileId')) {
      await queryRunner.query(
        'ALTER TABLE "override_rule" DROP COLUMN "languageProfileId"'
      );
    }
  }
}
