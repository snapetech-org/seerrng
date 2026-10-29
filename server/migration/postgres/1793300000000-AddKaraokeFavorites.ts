import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKaraokeFavorites1793300000000 implements MigrationInterface {
  name = 'AddKaraokeFavorites1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_settings', 'karaokeFavoriteSongIds'))) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" ADD COLUMN "karaokeFavoriteSongIds" text'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user_settings', 'karaokeFavoriteSongIds')) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" DROP COLUMN "karaokeFavoriteSongIds"'
      );
    }
  }
}
