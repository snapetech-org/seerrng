import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BindLinkedAccountsToIssuer1792630000000 implements MigrationInterface {
  name = 'BindLinkedAccountsToIssuer1792630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "linked_accounts" ADD COLUMN "issuer" character varying(2048)'
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."IDX_linked_accounts_provider_sub"'
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_linked_accounts_issuer_sub" ON "linked_accounts" ("issuer", "sub")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."IDX_linked_accounts_issuer_sub"'
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_linked_accounts_provider_sub" ON "linked_accounts" ("provider", "sub")'
    );
    await queryRunner.query(
      'ALTER TABLE "linked_accounts" DROP COLUMN "issuer"'
    );
  }
}
