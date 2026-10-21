import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { BindLinkedAccountsToIssuer1792630000000 } from './1792630000000-BindLinkedAccountsToIssuer';

test('binds linked OIDC identities to issuer and subject', async () => {
  const dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  const migration = new BindLinkedAccountsToIssuer1792630000000();

  try {
    await queryRunner.query(
      'CREATE TABLE "linked_accounts" ("id" integer PRIMARY KEY, "provider" varchar(255) NOT NULL, "sub" varchar(255) NOT NULL, "username" varchar NOT NULL)'
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_linked_accounts_provider_sub" ON "linked_accounts" ("provider", "sub")'
    );
    await queryRunner.query(
      `INSERT INTO "linked_accounts" ("id", "provider", "sub", "username") VALUES (1, 'test', 'subject-1', 'legacy')`
    );

    await migration.up(queryRunner);

    const legacyRows = await queryRunner.query(
      'SELECT "issuer" FROM "linked_accounts" WHERE "id" = 1'
    );
    assert.equal(legacyRows[0].issuer, null);

    await queryRunner.query(
      `INSERT INTO "linked_accounts" ("id", "provider", "issuer", "sub", "username") VALUES (2, 'test', 'https://issuer-a.example', 'subject-1', 'issuer-a')`
    );
    await queryRunner.query(
      `INSERT INTO "linked_accounts" ("id", "provider", "issuer", "sub", "username") VALUES (3, 'test', 'https://issuer-b.example', 'subject-1', 'issuer-b')`
    );
    await assert.rejects(
      queryRunner.query(
        `INSERT INTO "linked_accounts" ("id", "provider", "issuer", "sub", "username") VALUES (4, 'renamed-provider', 'https://issuer-a.example', 'subject-1', 'duplicate')`
      )
    );

    await queryRunner.query(
      'DELETE FROM "linked_accounts" WHERE "issuer" IS NOT NULL'
    );
    await migration.down(queryRunner);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
});
