import {
  TableColumn,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';
export class AddBookFileAvailability1794000000000 implements MigrationInterface {
  name = 'AddBookFileAvailability1794000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      'availableEbookServiceIds',
      'availableAudiobookServiceIds',
    ]) {
      if (!(await queryRunner.hasColumn('media', name)))
        await queryRunner.addColumn(
          'media',
          new TableColumn({ name, type: 'text', isNullable: true })
        );
    }
    await queryRunner.query(
      `UPDATE "media" SET "status" = 1 WHERE "mediaType" = 'book' AND "status" = 5 AND COALESCE("ratingKey", '') = '' AND ("audiobookLibraryServiceId" IS NULL OR COALESCE("audiobookLibraryItemId", '') = '') AND "availableEbookServiceIds" IS NULL AND "availableAudiobookServiceIds" IS NULL`
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      'availableAudiobookServiceIds',
      'availableEbookServiceIds',
    ])
      if (await queryRunner.hasColumn('media', name))
        await queryRunner.dropColumn('media', name);
  }
}
