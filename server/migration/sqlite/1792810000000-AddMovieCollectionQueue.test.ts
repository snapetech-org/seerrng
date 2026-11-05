import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DataSource } from 'typeorm';
import { AddMovieCollectionQueue1792810000000 } from './1792810000000-AddMovieCollectionQueue';
it('creates persistent queue state with owner/quality uniqueness, cascade cleanup and reversible schema', async () => {
  const db = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
  }).initialize();
  const runner = db.createQueryRunner();
  const migration = new AddMovieCollectionQueue1792810000000();
  try {
    await runner.query('CREATE TABLE "user" (id INTEGER PRIMARY KEY)');
    await runner.query('INSERT INTO "user" (id) VALUES (1)');
    await migration.up(runner);
    await migration.up(runner);
    const sql =
      'INSERT INTO movie_collection_queue ("userId","collectionId","movieIds","watchedIds","requestedIds") VALUES (1,55,?,?,?)';
    await runner.query(sql, ['[101,102]', '[]', '[]']);
    await assert.rejects(runner.query(sql, ['[101,102]', '[]', '[]']));
    await runner.query('DELETE FROM "user" WHERE id=1');
    assert.deepEqual(
      await runner.query('SELECT id FROM movie_collection_queue'),
      []
    );
    await migration.down(runner);
    assert.equal(await runner.hasTable('movie_collection_queue'), false);
  } finally {
    await runner.release();
    await db.destroy();
  }
});
