import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRequestServices1791950000000 implements MigrationInterface {
  name = 'AddUserRequestServices1791950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user', 'requestServices')) return;
    await queryRunner.query(`ALTER TABLE "user" ADD "requestServices" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user', 'requestServices'))) return;
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "requestServices"`);
  }
}
