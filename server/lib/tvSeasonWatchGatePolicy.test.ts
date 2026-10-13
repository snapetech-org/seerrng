import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getIncompletePreviousSeasonRequirement,
  getMissingPreviousSeasonHistoryRequirement,
  getSeasonWatchGateRequirements,
  getTvSeasonSelectionsAllowedByWatchGate,
  isTvSeasonFullyWatched,
  type TvSeasonWatchGateCatalogEntry,
  type TvSeasonWatchGateEpisode,
} from './tvSeasonWatchGatePolicy';

const catalog: TvSeasonWatchGateCatalogEntry[] = [
  { seasonNumber: 0, episodeCount: 3 },
  { seasonNumber: 1, episodeCount: 2 },
  { seasonNumber: 2, episodeCount: 3 },
  { seasonNumber: 3, episodeCount: 0 },
  { seasonNumber: 5, episodeCount: 1 },
];

describe('TV season watch gate policy', () => {
  it('requires the nearest earlier regular season and ignores specials and empty seasons', () => {
    assert.deepEqual(
      getSeasonWatchGateRequirements(catalog, [
        { seasonNumber: 0 },
        { seasonNumber: 1 },
        { seasonNumber: 2 },
        { seasonNumber: 5 },
      ]),
      [
        { requestedSeason: 2, requiredSeason: 1 },
        { requestedSeason: 5, requiredSeason: 2 },
      ]
    );
  });

  it('flags selected seasons missing from metadata instead of allowing a bypass', () => {
    assert.deepEqual(
      getSeasonWatchGateRequirements(catalog, [{ seasonNumber: 4 }]),
      [{ requestedSeason: 4, requiredSeason: null }]
    );
  });

  it('requires each expected episode number to be watched exactly once by identity', () => {
    const complete: TvSeasonWatchGateEpisode[] = [
      { seasonNumber: 1, episodeNumber: 1, watched: true },
      { seasonNumber: 1, episodeNumber: 2, watched: true },
      { seasonNumber: 2, episodeNumber: 1, watched: true },
    ];
    assert.equal(isTvSeasonFullyWatched(1, 2, complete), true);
    assert.equal(
      isTvSeasonFullyWatched(1, 2, [
        ...complete,
        { seasonNumber: 1, episodeNumber: 2, watched: false },
      ]),
      true
    );
    assert.equal(
      isTvSeasonFullyWatched(1, 2, [
        complete[0],
        { seasonNumber: 1, episodeNumber: 3, watched: true },
      ]),
      false
    );
    assert.equal(
      isTvSeasonFullyWatched(1, 2, [
        complete[0],
        { seasonNumber: 1, episodeNumber: 2, watched: false },
      ]),
      false
    );
  });

  it('blocks a later season until its immediate regular predecessor is complete', () => {
    const incomplete = getIncompletePreviousSeasonRequirement(
      catalog,
      [{ seasonNumber: 2 }, { seasonNumber: 5 }],
      [{ seasonNumber: 1, episodeNumber: 1, watched: true }]
    );
    assert.deepEqual(incomplete, {
      requestedSeason: 2,
      requiredSeason: 1,
    });

    const complete = getIncompletePreviousSeasonRequirement(
      catalog,
      [{ seasonNumber: 2 }, { seasonNumber: 5 }],
      [
        { seasonNumber: 1, episodeNumber: 1, watched: true },
        { seasonNumber: 1, episodeNumber: 2, watched: true },
        { seasonNumber: 2, episodeNumber: 1, watched: true },
        { seasonNumber: 2, episodeNumber: 2, watched: true },
        { seasonNumber: 2, episodeNumber: 3, watched: true },
      ]
    );
    assert.equal(complete, undefined);
  });

  it('keeps the first eligible season requestable while playback history is unavailable', () => {
    assert.deepEqual(
      getTvSeasonSelectionsAllowedByWatchGate(
        catalog,
        [
          { seasonNumber: 0 },
          { seasonNumber: 1 },
          { seasonNumber: 2 },
          { seasonNumber: 5 },
        ],
        [],
        false
      ),
      [{ seasonNumber: 0 }, { seasonNumber: 1 }]
    );
  });

  it('distinguishes a missing previous-season library from an unwatched season', () => {
    assert.deepStrictEqual(
      getMissingPreviousSeasonHistoryRequirement(
        catalog,
        [{ seasonNumber: 2 }],
        [{ seasonNumber: 2, episodeNumber: 1, watched: false }]
      ),
      { requestedSeason: 2, requiredSeason: 1 }
    );
    assert.strictEqual(
      getMissingPreviousSeasonHistoryRequirement(
        catalog,
        [{ seasonNumber: 2 }],
        [{ seasonNumber: 1, episodeNumber: 1, watched: false }]
      ),
      undefined
    );
  });
});
