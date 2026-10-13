import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddTvSeasonNumberMappings1791150000000 } from './1791150000000-AddTvSeasonNumberMappings';

test('scopes season maps by TV identity, Sonarr service, and quality', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new AddTvSeasonNumberMappings1791150000000();

  try {
    await queryRunner.query(
      `CREATE TABLE "media_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`
    );
    await queryRunner.query(
      `CREATE TABLE "media_identifier" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`
    );
    await migration.up(queryRunner);

    const requestColumns = await queryRunner.getTable('media_request');
    assert.equal(
      requestColumns?.findColumnByName('overrideTvdbId')?.isNullable,
      true
    );

    await queryRunner.query(`INSERT INTO "media_identifier" ("id") VALUES (1)`);
    await queryRunner.query(
      `INSERT INTO "media_identifier_season_mapping" ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber", "externalSeasonNumber") VALUES (1, 31, false, 0, 1)`
    );
    await queryRunner.query(
      `INSERT INTO "media_identifier_season_mapping" ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber", "externalSeasonNumber") VALUES (1, 31, false, 2024, 7)`
    );
    await queryRunner.query(
      `INSERT INTO "media_identifier_season_mapping" ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber", "externalSeasonNumber") VALUES (1, 32, false, 0, 1)`
    );
    await queryRunner.query(
      `INSERT INTO "media_identifier_season_mapping" ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber", "externalSeasonNumber") VALUES (1, 31, true, 0, 1)`
    );

    await assert.rejects(
      queryRunner.query(
        `INSERT INTO "media_identifier_season_mapping" ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber", "externalSeasonNumber") VALUES (1, 31, false, 2025, 7)`
      )
    );
    await assert.rejects(
      queryRunner.query(
        `INSERT INTO "media_identifier_season_mapping" ("mediaIdentifierId", "sonarrServerId", "is4k", "seasonNumber", "externalSeasonNumber") VALUES (1, 31, false, 0, 9)`
      )
    );

    await migration.down(queryRunner);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
