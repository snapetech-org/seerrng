import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookOrbitRequestTracking1792600000000 implements MigrationInterface {
  name = 'AddBookOrbitRequestTracking1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn(
        'book_request_search',
        'bookorbitRequestId'
      ))
    )
      await queryRunner.query(
        'ALTER TABLE "book_request_search" ADD "bookorbitRequestId" integer'
      );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn('book_request_search', 'bookorbitRequestId')
    )
      await queryRunner.query(
        'ALTER TABLE "book_request_search" DROP COLUMN "bookorbitRequestId"'
      );
  }
}
