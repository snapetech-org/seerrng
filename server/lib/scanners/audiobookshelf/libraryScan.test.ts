import type { AudiobookshelfLibraryItem } from '@server/api/audiobookshelf';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS,
  getCompleteAudiobookshelfItemIds,
  hasAudiobookshelfAudioFile,
} from '@server/lib/scanners/audiobookshelf/libraryScan';

describe('Audiobookshelf library scan completeness', () => {
  it('accepts a complete page set with normalized unique item IDs', () => {
    const ids = getCompleteAudiobookshelfItemIds(
      [{ id: ' item-1 ' }, { id: 'item-2' }],
      2
    );

    assert.deepEqual([...(ids ?? [])], ['item-1', 'item-2']);
  });

  it('rejects incomplete, duplicate, or malformed item IDs', () => {
    assert.equal(
      getCompleteAudiobookshelfItemIds([{ id: 'item-1' }], 2),
      undefined
    );
    assert.equal(
      getCompleteAudiobookshelfItemIds([{ id: 'item-1' }, { id: 'item-1' }], 2),
      undefined
    );
    assert.equal(
      getCompleteAudiobookshelfItemIds([{ id: '   ' }], 1),
      undefined
    );
  });

  it('rejects totals above the bounded library scan limit', () => {
    assert.equal(
      getCompleteAudiobookshelfItemIds(
        [],
        AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS + 1
      ),
      undefined
    );
  });
});

describe('Audiobookshelf audio file observations', () => {
  const cases: [string, unknown, boolean][] = [
    [
      'ebook-only regular response',
      { audioFiles: [], ebookFile: { ino: 'ebook-1' } },
      false,
    ],
    ['metadata-only response', { metadata: { title: 'Not a file' } }, false],
    ['regular audio', { audioFiles: [{ ino: 'audio-1' }] }, true],
    ['numeric audio inode', { audioFiles: [{ ino: 1 }] }, true],
    [
      'mixed ebook and audio',
      { audioFiles: [{ ino: 'audio-1' }], ebookFile: { ino: 'ebook-1' } },
      true,
    ],
    [
      'invalid audio',
      { audioFiles: [{ ino: 'audio-1', invalid: true }] },
      false,
    ],
    [
      'excluded audio',
      { audioFiles: [{ ino: 'audio-1', exclude: true }] },
      false,
    ],
    [
      'missing audio',
      { audioFiles: [{ ino: 'audio-1', isMissing: true }] },
      false,
    ],
    [
      'one usable audio file',
      { audioFiles: [{ ino: 'bad', invalid: true }, { ino: 'good' }] },
      true,
    ],
    ['empty audio inode', { audioFiles: [{ ino: ' ' }] }, false],
    ['missing audio inode', { audioFiles: [{}] }, false],
    ['malformed file array', { audioFiles: [null, 'file', []] }, false],
    ['malformed audio field', { audioFiles: 'audio', numAudioFiles: 1 }, false],
    [
      'empty authoritative array overrides count',
      { audioFiles: [], numAudioFiles: 1 },
      false,
    ],
    ['minified audio', { numAudioFiles: 1, numTracks: 1 }, true],
    ['minified count without track field', { numAudioFiles: 1 }, true],
    [
      'ebook-only minified',
      { numAudioFiles: 0, numTracks: 0, ebookFormat: 'epub' },
      false,
    ],
    [
      'audio count with no usable tracks',
      { numAudioFiles: 1, numTracks: 0 },
      false,
    ],
    ['string count', { numAudioFiles: '1' }, false],
    ['fractional count', { numAudioFiles: 0.5 }, false],
    ['negative count', { numAudioFiles: -1 }, false],
    ['unsafe count', { numAudioFiles: Number.MAX_SAFE_INTEGER + 1 }, false],
    ['malformed track count', { numAudioFiles: 1, numTracks: '1' }, false],
    ['missing media', undefined, false],
  ];
  for (const [name, media, expected] of cases)
    it(name, () => {
      assert.equal(
        hasAudiobookshelfAudioFile({
          id: 'item-1',
          mediaType: 'book',
          media,
        } as AudiobookshelfLibraryItem),
        expected
      );
    });
  for (const overrides of [
    { isMissing: true },
    { isInvalid: true },
    { mediaType: 'podcast' },
    { mediaType: 'other' },
  ])
    it(`rejects unavailable item ${JSON.stringify(overrides)}`, () => {
      assert.equal(
        hasAudiobookshelfAudioFile({
          id: 'item-1',
          mediaType: 'book',
          media: { audioFiles: [{ ino: 'audio-1' }] },
          ...overrides,
        }),
        false
      );
    });
});
