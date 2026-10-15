import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddUserRequestServices1791920000000 } from './1791920000000-AddUserRequestServices';
import { CreateMediaServiceStatuses1791940000000 } from './1791940000000-CreateMediaServiceStatuses';

test('request service migrations are rerunnable and reversible', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.query(
      'CREATE TABLE "user" ("id" integer PRIMARY KEY, "email" varchar)'
    );
    await queryRunner.query(
      `CREATE TABLE "media" ("id" integer PRIMARY KEY, "mediaType" varchar NOT NULL, "status" integer NOT NULL DEFAULT 1, "status4k" integer NOT NULL DEFAULT 1, "serviceId" integer, "serviceId4k" integer, "externalServiceId" integer, "externalServiceId4k" integer, "externalServiceSlug" varchar, "externalServiceSlug4k" varchar)`
    );
    await queryRunner.query(
      `INSERT INTO "media" ("id", "mediaType", "status", "serviceId", "externalServiceId") VALUES (1, 'movie', 5, 2, 9)`
    );

    const addUser = new AddUserRequestServices1791920000000();
    const create = new CreateMediaServiceStatuses1791940000000();

    await addUser.up(queryRunner);
    await addUser.up(queryRunner);
    await create.up(queryRunner);
    await create.up(queryRunner);

    assert.equal(
      (await queryRunner.query('PRAGMA table_info("user")')).some(
        (column: { name: string }) => column.name === 'requestServices'
      ),
      true
    );
    const rows = await queryRunner.query(
      'SELECT "serviceType", "serverId", "format", "status" FROM "media_service_status"'
    );
    assert.deepEqual(rows, [
      { serviceType: 'radarr', serverId: 2, format: 'standard', status: 5 },
    ]);

    await create.down(queryRunner);
    await create.down(queryRunner);
    await addUser.down(queryRunner);
    await addUser.down(queryRunner);

    assert.equal(await queryRunner.hasTable('media_service_status'), false);
    assert.equal(
      (await queryRunner.query('PRAGMA table_info("user")')).some(
        (column: { name: string }) => column.name === 'requestServices'
      ),
      false
    );
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
