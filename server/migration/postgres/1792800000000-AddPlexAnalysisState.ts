import { Table, type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddPlexAnalysisState1792800000000 implements MigrationInterface {
  name = 'AddPlexAnalysisState1792800000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('plex_analysis_state')) return;
    await queryRunner.createTable(
      new Table({
        name: 'plex_analysis_state',
        columns: [
          { name: 'serverKey', type: 'varchar', length: '64', isPrimary: true },
          { name: 'seasonKey', type: 'varchar', length: '32', isPrimary: true },
          { name: 'attemptedAt', type: 'timestamp' },
          { name: 'queuedAt', type: 'timestamp', isNullable: true },
        ],
      })
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('plex_analysis_state', true);
  }
}
