import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookServiceLinkIndexes1794500000000
  implements MigrationInterface
{
  name = 'AddBookServiceLinkIndexes1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasIndex('media', 'IDX_media_book_ebook_service_link'))
    ) {
      await queryRunner.query(
        'CREATE INDEX "IDX_media_book_ebook_service_link" ON "media" ("mediaType", "serviceId", "externalServiceId")'
      );
    }
    if (
      !(await queryRunner.hasIndex(
        'media',
        'IDX_media_book_audiobook_service_link'
      ))
    ) {
      await queryRunner.query(
        'CREATE INDEX "IDX_media_book_audiobook_service_link" ON "media" ("mediaType", "audiobookServiceId", "audiobookExternalServiceId")'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasIndex(
        'media',
        'IDX_media_book_audiobook_service_link'
      )
    ) {
      await queryRunner.query(
        'DROP INDEX "IDX_media_book_audiobook_service_link"'
      );
    }
    if (
      await queryRunner.hasIndex('media', 'IDX_media_book_ebook_service_link')
    ) {
      await queryRunner.query('DROP INDEX "IDX_media_book_ebook_service_link"');
    }
  }
}
