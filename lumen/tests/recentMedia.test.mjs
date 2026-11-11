import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/recentMedia.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { RECENT_MEDIA_QUERY, RECENT_ROW_CACHE_KEY, recentMediaTitles, enrichRecentMediaTitles } =
  await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test('recent videos are filtered before pagination, not dropped from a mixed page', () => {
  assert.equal(
    RECENT_MEDIA_QUERY,
    '/media?filter=allavailable&take=20&sort=mediaAdded&mediaType=movie%2Ctv'
  );
  assert.notEqual(RECENT_ROW_CACHE_KEY, '/lumen/new-on-server');
});

test('all nineteen synthetic movie and TV rows remain in order without detail lookups', () => {
  const rows = Array.from({ length: 19 }, (_, i) => ({
    id: i + 50,
    tmdbId: i + 1000,
    mediaType: i % 2 === 0 ? 'movie' : 'tv',
    title: `Example ${i}`,
    posterPath: `/poster/${i}.jpg`,
    releaseDate: '2026-01-01',
    status: 5,
    mediaAddedAt: '2026-01-01T00:00:00Z',
  }));
  const result = recentMediaTitles(rows);
  assert.equal(result.length, 19);
  assert.equal(result[0].title, 'Example 0');
  assert.equal(result[1].name, 'Example 1');
  assert.equal(result[18].id, 1018);
  assert.ok(result.every((r) => r.mediaInfo.status === 5));
  assert.ok(result.every((r) => r.posterPath));
});

test('missing optional catalog metadata does not silently remove a valid item', () => {
  const cards = recentMediaTitles([
    { id: 1, tmdbId: 21, mediaType: 'movie', status: 5 },
    { id: 2, tmdbId: 22, mediaType: 'book', status: 5 },
    { id: 3, tmdbId: 0, mediaType: 'tv', status: 5 },
    { id: 4, tmdbId: 23, mediaType: 'tv', status: 5 },
  ]);
  assert.deepEqual(cards.map((x) => x.id), [21, 23]);
  assert.equal(cards[0].title, 'Untitled movie');
  assert.equal(cards[1].name, 'Untitled series');
});

test('complete catalog rows need no extra detail requests', async () => {
  const rows = Array.from({ length: 19 }, (_, i) => ({
    tmdbId: 3000 + i,
    mediaType: i % 2 ? 'tv' : 'movie',
    status: 5,
    title: `Title ${i}`,
  }));
  let lookups = 0;
  const titles = await enrichRecentMediaTitles(recentMediaTitles(rows), async () => {
    lookups += 1;
    throw Error('Not needed');
  });
  assert.equal(titles.length, 19);
  assert.equal(lookups, 0);
});

test('missing restricted-view titles are enriched where permitted, not discarded on errors', async () => {
  const cards = recentMediaTitles([
    { tmdbId: 51, mediaType: 'movie', status: 5 },
    { tmdbId: 52, mediaType: 'tv', status: 5 },
    { tmdbId: 53, mediaType: 'movie', status: 5, title: 'Already provided' },
  ]);
  const calls = [];
  const result = await enrichRecentMediaTitles(cards, async (item) => {
    calls.push(item.id);
    if (item.id === 51) return { id: 51, mediaType: 'movie', title: 'Retrieved title', posterPath: '/a.jpg' };
    throw Error('Detail endpoint unavailable');
  });
  assert.deepEqual(calls, [51, 52]);
  assert.equal(result[0].title, 'Retrieved title');
  assert.equal(result[0].posterPath, '/a.jpg');
  assert.equal(result[1].name, 'Untitled series');
  assert.equal(result[2].title, 'Already provided');
  assert.equal(result.length, 3);
});
