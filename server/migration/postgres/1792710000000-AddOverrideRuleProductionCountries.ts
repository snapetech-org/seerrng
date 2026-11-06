import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverrideRuleProductionCountries1792710000000 implements MigrationInterface {
  name = 'AddOverrideRuleProductionCountries1792710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn('override_rule', 'productionCountries'))
    ) {
      await queryRunner.query(
        'ALTER TABLE "override_rule" ADD COLUMN "productionCountries" character varying'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('override_rule', 'productionCountries')) {
      await queryRunner.query(
        'ALTER TABLE "override_rule" DROP COLUMN "productionCountries"'
      );
    }
  }
}
