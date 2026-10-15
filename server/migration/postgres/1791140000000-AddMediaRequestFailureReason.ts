import {
  TableColumn,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';

export class AddMediaRequestFailureReason1791140000000 implements MigrationInterface {
  name = 'AddMediaRequestFailureReason1791140000000';

  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('media_request', 'failureReason')) {
      return;
    }

    await runner.addColumn(
      'media_request',
      new TableColumn({
        name: 'failureReason',
        type: 'varchar',
        isNullable: true,
      })
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('media_request', 'failureReason'))) {
      return;
    }

    await runner.dropColumn('media_request', 'failureReason');
  }
}
