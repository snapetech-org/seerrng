import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialNarration,
  recommendedNarration,
} from '../../../src/utils/narrationSelection';
import { hasExactEditionFiles, hasRequestedEditionFiles } from './availability';
import { cardFromCatalog, cardFromLookup, normalizeSampleUrl } from './cards';

const card = (id: string, extra = {}) =>
  cardFromLookup(
    {
      foreignEditionId: id,
      title: 'Book',
      monitored: false,
      narrators: ['Narrator'],
      ...extra,
    },
    'audiobook'
  );

test('preserves supplied recording metadata without inventing samples or labels', () => {
  const item = card('e2', {
    audioSeconds: 7500,
    language: 'eng',
    editionInfo: '10th anniversary',
    previewUrl: 'https://cdn.example/audio.mp3',
    subtitle: 'Unabridged',
  });
  assert.equal(item.durationSeconds, 7500);
  assert.equal(item.editionLabel, '10th anniversary');
  assert.equal(item.sampleUrl, 'https://cdn.example/audio.mp3');
  assert.equal(card('unknown').sampleUrl, undefined);
  assert.equal(card('unknown').editionLabel, undefined);
});

test('sample URLs exclude executable, insecure, credential and malformed URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:audio/mp3,a',
    'http://host/audio',
    '//host/audio',
    'https://user:secret@host/audio',
    'https://host/\nfile',
    'https://host/with space',
  ])
    assert.equal(normalizeSampleUrl(url), undefined);
  assert.equal(
    normalizeSampleUrl('https://cdn.example/sample.mp3'),
    'https://cdn.example/sample.mp3'
  );
});

test('only a missing unabridged recording in the viewer language is recommended', () => {
  const records = [
    card('owned', { language: 'eng', subtitle: 'Unabridged' }),
    card('foreign', { language: 'deu', subtitle: 'Unabridged' }),
    card('preferred', { language: 'eng', subtitle: 'Unabridged' }),
  ];
  records[0].owned = true;
  assert.equal(recommendedNarration(records, 'en-CA')?.id, 'preferred');
  assert.equal(recommendedNarration(records, 'ja'), undefined);
  assert.equal(initialNarration(records, 'ja')?.id, 'foreign');
});

test('another owned edition never satisfies the chosen narration', () => {
  const catalog = [
    { foreignEditionId: 'e1', owned: true },
    { foreignEditionId: 'e2', owned: false },
  ];
  assert.equal(hasExactEditionFiles('e2', catalog, [], 7), false);
  assert.equal(hasExactEditionFiles('e1', catalog, [], 7), true);
  assert.equal(hasExactEditionFiles('unknown', catalog, [], 7), false);
});

test('legacy file totals prove ownership only for exactly one matching monitored edition', () => {
  const editions = [
    { foreignEditionId: 'e1', monitored: true },
    { foreignEditionId: 'e2', monitored: false },
  ];
  assert.equal(hasExactEditionFiles('e1', [], editions, 1), true);
  assert.equal(hasExactEditionFiles('e2', [], editions, 1), false);
  editions[1].monitored = true;
  assert.equal(hasExactEditionFiles('e1', [], editions, 1), false);
  assert.equal(hasExactEditionFiles('e1', [], editions, 0), false);
});

test('reconciliation uses exact companion ownership and preserves ordinary requests', async () => {
  const calls: string[] = [];
  const api = {
    getEditionCatalog: async () => {
      calls.push('catalog');
      return [{ foreignEditionId: 'e2', owned: false }] as never[];
    },
    getEditions: async () => {
      calls.push('editions');
      return [];
    },
  };
  const book = {
    id: 4,
    title: 'Book',
    foreignBookId: 'work1',
    statistics: { bookFileCount: 2 },
  };
  assert.equal(await hasRequestedEditionFiles(api, book, 'e2'), false);
  assert.deepEqual(calls, ['catalog']);
  assert.equal(await hasRequestedEditionFiles(api, book), true);
  assert.equal(await hasRequestedEditionFiles(api, undefined, 'e2'), false);
});

test('a catalog row without a provider identity is not requestable', () => {
  const card = cardFromCatalog(
    {
      editionId: 42,
      title: 'A book',
      isEbook: false,
      narrators: [],
      monitored: false,
      owned: false,
      production: 'unknown',
      abridged: 'unknown',
    },
    'audiobook'
  );
  assert.equal(card.requestable, false);
});
