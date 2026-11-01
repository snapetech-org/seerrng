import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPersistedMessageDescriptors1792730000000 implements MigrationInterface {
  name = 'AddPersistedMessageDescriptors1792730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: [string, string][] = [
      ['media_request_status_event', 'messageKey'],
      ['track_request', 'lastErrorMessageKey'],
      ['recording_request', 'lastErrorMessageKey'],
      ['recording_request', 'lastErrorMessageParams'],
    ];
    for (const [table, column] of columns) {
      if (!(await queryRunner.hasColumn(table, column))) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD COLUMN "${column}" ${column.endsWith('Params') ? 'text' : 'varchar(64)'}`
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns: [string, string][] = [
      ['recording_request', 'lastErrorMessageParams'],
      ['recording_request', 'lastErrorMessageKey'],
      ['track_request', 'lastErrorMessageKey'],
      ['media_request_status_event', 'messageKey'],
    ];
    for (const [table, column] of columns) {
      if (await queryRunner.hasColumn(table, column)) {
        await queryRunner.query(
          `ALTER TABLE "${table}" DROP COLUMN "${column}"`
        );
      }
    }
  }
}
