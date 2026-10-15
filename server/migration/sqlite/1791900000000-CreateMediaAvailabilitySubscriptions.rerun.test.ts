import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { CreateMediaAvailabilitySubscriptions1791900000000 } from './1791900000000-CreateMediaAvailabilitySubscriptions';

test('can run up and down repeatedly', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new CreateMediaAvailabilitySubscriptions1791900000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)'
    );
    await queryRunner.query(
      'CREATE TABLE "media" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)'
    );

    await migration.up(queryRunner);
    await migration.up(queryRunner);
    assert.equal(
      await queryRunner.hasTable('media_availability_subscription'),
      true
    );

    await migration.down(queryRunner);
    await migration.down(queryRunner);
    assert.equal(
      await queryRunner.hasTable('media_availability_subscription'),
      false
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
