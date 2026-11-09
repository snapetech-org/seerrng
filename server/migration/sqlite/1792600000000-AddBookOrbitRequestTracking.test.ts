import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { AddBookOrbitRequestTracking1792600000000 } from './1792600000000-AddBookOrbitRequestTracking';

test('adds and rolls back the BookOrbit request reference without changing existing rows', async () => {
  const source = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const runner = source.createQueryRunner();
  const migration = new AddBookOrbitRequestTracking1792600000000();
  try {
    await runner.query(
      'CREATE TABLE "book_request_search" ("id" integer PRIMARY KEY, "requestId" integer NOT NULL)'
    );
    await runner.query(
      'INSERT INTO "book_request_search" ("id", "requestId") VALUES (1, 42)'
    );
    await migration.up(runner);
    await migration.up(runner);
    await runner.query(
      'UPDATE "book_request_search" SET "bookorbitRequestId" = 9 WHERE "id" = 1'
    );
    assert.deepEqual(
      await runner.query(
        'SELECT "bookorbitRequestId" FROM "book_request_search"'
      ),
      [{ bookorbitRequestId: 9 }]
    );
    await migration.down(runner);
    await migration.down(runner);
    assert.deepEqual(
      await runner.query('SELECT "requestId" FROM "book_request_search"'),
      [{ requestId: 42 }]
    );
  } finally {
    await runner.release();
    await source.destroy();
  }
});
