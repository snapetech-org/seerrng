import type Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  externalSeasonNumberFor,
  getSeasonMappingsForTvdbIdentifier,
  internalSeasonNumberFor,
} from './seasonNumberMapping';

test('maps seasons in both directions and preserves zero as a valid season', () => {
  const mappings = [
    { seasonNumber: 0, externalSeasonNumber: 1 },
    { seasonNumber: 2024, externalSeasonNumber: 7 },
  ];

  assert.equal(externalSeasonNumberFor(0, mappings), 1);
  assert.equal(externalSeasonNumberFor(2024, mappings), 7);
  assert.equal(externalSeasonNumberFor(2, mappings), 2);
  assert.equal(internalSeasonNumberFor(1, mappings), 0);
  assert.equal(internalSeasonNumberFor(7, mappings), 2024);
  assert.equal(internalSeasonNumberFor(2, mappings), 2);
});

test('selects season maps for one Sonarr service and quality tier', () => {
  const media = {
    identifiers: [
      {
        provider: MediaIdentifierProvider.TVDB,
        value: '184871',
        seasonMappings: [
          {
            sonarrServerId: 32,
            is4k: false,
            seasonNumber: 1,
            externalSeasonNumber: 4,
          },
          {
            sonarrServerId: 31,
            is4k: true,
            seasonNumber: 1,
            externalSeasonNumber: 5,
          },
          {
            sonarrServerId: 31,
            is4k: false,
            seasonNumber: 1,
            externalSeasonNumber: 2,
          },
        ],
      },
    ],
  } as unknown as Pick<Media, 'identifiers'>;

  assert.deepStrictEqual(
    getSeasonMappingsForTvdbIdentifier(media, 184_871, 31, false),
    [{ seasonNumber: 1, externalSeasonNumber: 2 }]
  );
  assert.deepStrictEqual(
    getSeasonMappingsForTvdbIdentifier(media, 184_871, 32, false),
    [{ seasonNumber: 1, externalSeasonNumber: 4 }]
  );
  assert.deepStrictEqual(
    getSeasonMappingsForTvdbIdentifier(media, 184_871, 31, true),
    [{ seasonNumber: 1, externalSeasonNumber: 5 }]
  );
});
