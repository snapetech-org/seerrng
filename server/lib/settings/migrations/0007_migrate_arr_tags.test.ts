import assert from 'node:assert/strict';
import { it, mock } from 'node:test';

import dataSource from '@server/datasource';
import { setupTestDb } from '@server/test/db';
import migrationArrTags, {
  reportArrTagMigrationFailure,
} from './0007_migrate_arr_tags';

setupTestDb();

it('does not require user settings columns added by later database migrations', async () => {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(
      'ALTER TABLE "user_settings" DROP COLUMN "mediaFilterPins"'
    );
  } finally {
    await queryRunner.release();
  }

  const migrated = await migrationArrTags({
    migrations: [],
    radarr: [],
    sonarr: [],
  });

  assert.deepStrictEqual(migrated.migrations, ['0007_migrate_arr_tags']);
});

it('logs administrator and provider text as structured data, not a format string', () => {
  const logger = mock.method(console, 'error');
  try {
    reportArrTagMigrationFailure(
      'Radarr',
      '%s\r\nforged entry',
      new Error('%s\r\nprovider response')
    );
  } finally {
    logger.mock.restore();
  }

  assert.deepStrictEqual(logger.mock.calls[0]?.arguments, [
    'Unable to rename Radarr tags to the new format. Please check your Radarr connection settings.',
    {
      instanceName: '%s\r\nforged entry',
      providerError: '%s\r\nprovider response',
    },
  ]);
});
