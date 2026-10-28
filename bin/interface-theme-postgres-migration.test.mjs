import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { AddUserInterfaceTheme1792700000000 } from '../server/migration/postgres/1792700000000-AddUserInterfaceTheme.ts';

const postgresUrl = process.env.SEERR_MIGRATION_TEST_POSTGRES_URL;
const postgresTest = postgresUrl ? test : test.skip;

postgresTest(
  'PostgreSQL interface-theme migration executes, preserves John, and rolls back',
  async () => {
    const schema = `seerrng_interface_theme_${randomUUID().replaceAll('-', '')}`;
    const admin = await new DataSource({
      type: 'postgres',
      url: postgresUrl,
    }).initialize();

    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const dataSource = await new DataSource({
        type: 'postgres',
        url: postgresUrl,
        schema,
      }).initialize();
      const queryRunner = dataSource.createQueryRunner();
      const migration = new AddUserInterfaceTheme1792700000000();

      try {
        await queryRunner.query(`SET search_path TO "${schema}"`);
        await queryRunner.query(
          'CREATE TABLE "user_settings" ("id" integer PRIMARY KEY, "advancedThemeOverrides" text)'
        );
        await queryRunner.query(
          `INSERT INTO "user_settings" ("id", "advancedThemeOverrides") VALUES (1, NULL), (2, '{"preset":"john-redesign","--theme-page-bg":"#123456"}'), (3, '{"preset":"other"}')`
        );

        await migration.up(queryRunner);
        await migration.up(queryRunner);

        assert.deepEqual(
          await queryRunner.query(
            'SELECT "id", "interfaceTheme" FROM "user_settings" ORDER BY "id"'
          ),
          [
            { id: 1, interfaceTheme: 'seerrOrig' },
            { id: 2, interfaceTheme: 'seerrNGJ' },
            { id: 3, interfaceTheme: 'seerrOrig' },
          ]
        );

        await migration.down(queryRunner);
        assert.equal(
          await queryRunner.hasColumn('user_settings', 'interfaceTheme'),
          false
        );
      } finally {
        await queryRunner.release();
        await dataSource.destroy();
      }
    } finally {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  }
);
