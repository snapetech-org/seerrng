import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DataSource } from 'typeorm';
import { AddPlexAnalysisState1792800000000 } from './1792800000000-AddPlexAnalysisState';
it('persists analysis claims with unique server/season identity and supports idempotent setup and rollback', async () => {
  const db = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const runner = db.createQueryRunner();
  const migration = new AddPlexAnalysisState1792800000000();
  try {
    await migration.up(runner);
    await migration.up(runner);
    await runner.query(
      'INSERT INTO plex_analysis_state ("serverKey","seasonKey","attemptedAt") VALUES (?,?,CURRENT_TIMESTAMP)',
      ['server', '10']
    );
    await assert.rejects(
      runner.query(
        'INSERT INTO plex_analysis_state ("serverKey","seasonKey","attemptedAt") VALUES (?,?,CURRENT_TIMESTAMP)',
        ['server', '10']
      )
    );
    await migration.down(runner);
    assert.equal(await runner.hasTable('plex_analysis_state'), false);
  } finally {
    await runner.release();
    await db.destroy();
  }
});
