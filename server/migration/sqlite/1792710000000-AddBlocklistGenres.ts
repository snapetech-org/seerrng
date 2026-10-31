import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlocklistGenres1792710000000 implements MigrationInterface {
  name = 'AddBlocklistGenres1792710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('blocklist', 'blocklistedGenres'))) {
      await queryRunner.query(
        'ALTER TABLE "blocklist" ADD COLUMN "blocklistedGenres" varchar'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('blocklist', 'blocklistedGenres')) {
      await queryRunner.query(
        'ALTER TABLE "blocklist" DROP COLUMN "blocklistedGenres"'
      );
    }
  }
}
