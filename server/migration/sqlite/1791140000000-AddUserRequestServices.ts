import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRequestServices1791140000000 implements MigrationInterface {
  name = 'AddUserRequestServices1791140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "requestServices" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "requestServices"`);
  }
}
