import type { MigrationInterface, QueryRunner } from 'typeorm';

const hasIndex = async (
  queryRunner: QueryRunner,
  name: string
): Promise<boolean> =>
  (await queryRunner.getTable('media'))?.indices.some(
    (index) => index.name === name
  ) ?? false;

export class AddBookServiceLinkIndexes1794500000000
  implements MigrationInterface
{
  name = 'AddBookServiceLinkIndexes1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasIndex(queryRunner, 'IDX_media_book_ebook_service_link'))) {
      await queryRunner.query(
        'CREATE INDEX "IDX_media_book_ebook_service_link" ON "media" ("mediaType", "serviceId", "externalServiceId")'
      );
    }
    if (
      !(await hasIndex(queryRunner, 'IDX_media_book_audiobook_service_link'))
    ) {
      await queryRunner.query(
        'CREATE INDEX "IDX_media_book_audiobook_service_link" ON "media" ("mediaType", "audiobookServiceId", "audiobookExternalServiceId")'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await hasIndex(queryRunner, 'IDX_media_book_audiobook_service_link')) {
      await queryRunner.query(
        'DROP INDEX "IDX_media_book_audiobook_service_link"'
      );
    }
    if (await hasIndex(queryRunner, 'IDX_media_book_ebook_service_link')) {
      await queryRunner.query('DROP INDEX "IDX_media_book_ebook_service_link"');
    }
  }
}
