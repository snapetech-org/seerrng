import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestFutureSeasons1793400000000 implements MigrationInterface {
  name = 'RequestFutureSeasons1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('media_request')) &&
      !(await queryRunner.hasColumn('media_request', 'monitorFutureSeasons'))
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_request" ADD COLUMN "monitorFutureSeasons" boolean'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('media_request')) &&
      (await queryRunner.hasColumn('media_request', 'monitorFutureSeasons'))
    ) {
      await queryRunner.dropColumn('media_request', 'monitorFutureSeasons');
    }
  }
}
