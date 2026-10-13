import { MediaRequestStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCompletedPlexWatchAheadProgress,
  getCompletedWatchAheadProgress,
  getCoveredEpisodeKeys,
  getPlexTvdbId,
  selectNextWatchAheadEpisodeSelections,
  type WatchAheadEpisode,
} from './episodeWatchAhead';

describe('episode watch-ahead selection', () => {
  it('keeps the requested buffer full and groups only missing episodes by season', () => {
    const episodes: WatchAheadEpisode[] = [
      { seasonNumber: 2, episodeNumber: 1, hasFile: false, monitored: false },
      { seasonNumber: 1, episodeNumber: 4, hasFile: false, monitored: false },
      { seasonNumber: 1, episodeNumber: 3, hasFile: true, monitored: false },
      { seasonNumber: 1, episodeNumber: 2, hasFile: false, monitored: true },
      { seasonNumber: 1, episodeNumber: 1, hasFile: false, monitored: false },
    ];

    assert.deepEqual(
      selectNextWatchAheadEpisodeSelections(
        episodes,
        { seasonNumber: 1, episodeNumber: 1 },
        4,
        new Set(),
        false
      ),
      [
        { seasonNumber: 1, episodeNumbers: [4] },
        { seasonNumber: 2, episodeNumbers: [1] },
      ]
    );
  });

  it('counts already requested episodes toward the buffer and skips specials by default', () => {
    const episodes: WatchAheadEpisode[] = [
      { seasonNumber: 0, episodeNumber: 1, hasFile: false, monitored: false },
      { seasonNumber: 1, episodeNumber: 1, hasFile: false, monitored: false },
      { seasonNumber: 1, episodeNumber: 2, hasFile: false, monitored: false },
      { seasonNumber: 1, episodeNumber: 3, hasFile: false, monitored: false },
    ];

    assert.deepEqual(
      selectNextWatchAheadEpisodeSelections(
        episodes,
        { seasonNumber: 0, episodeNumber: 0 },
        2,
        new Set(['1:1']),
        false
      ),
      [{ seasonNumber: 1, episodeNumbers: [2] }]
    );
  });

  it('does not exceed the supported buffer size', () => {
    assert.deepEqual(
      selectNextWatchAheadEpisodeSelections(
        [
          {
            seasonNumber: 1,
            episodeNumber: 2,
            hasFile: false,
            monitored: false,
          },
        ],
        { seasonNumber: 1, episodeNumber: 1 },
        6,
        new Set(),
        false
      ),
      []
    );
  });

  it('does not count failed generated requests as coverage', () => {
    const episodes: WatchAheadEpisode[] = [
      { seasonNumber: 1, episodeNumber: 2, hasFile: false, monitored: false },
    ];
    const failedChild = {
      id: 20,
      status: MediaRequestStatus.FAILED,
      watchAheadParentRequestId: 10,
      seasons: [{ seasonNumber: 1, episodeNumbers: [2] }],
    } as unknown as MediaRequest;
    const activeChild = {
      id: 21,
      status: MediaRequestStatus.APPROVED,
      seasons: [{ seasonNumber: 1, episodeNumbers: [2] }],
    } as unknown as MediaRequest;
    const activeRequestWithDeclinedSelection = {
      id: 22,
      status: MediaRequestStatus.APPROVED,
      seasons: [
        {
          seasonNumber: 1,
          episodeNumbers: [2],
          status: MediaRequestStatus.DECLINED,
        },
      ],
    } as unknown as MediaRequest;
    const declinedChild = {
      id: 23,
      status: MediaRequestStatus.DECLINED,
      watchAheadParentRequestId: 10,
      seasons: [{ seasonNumber: 1, episodeNumbers: [2] }],
    } as unknown as MediaRequest;

    assert.deepEqual(
      [...getCoveredEpisodeKeys([failedChild], 10, episodes)],
      []
    );
    assert.deepEqual(
      [...getCoveredEpisodeKeys([activeChild], 10, episodes)],
      ['1:2']
    );
    assert.deepEqual(
      [
        ...getCoveredEpisodeKeys(
          [activeRequestWithDeclinedSelection],
          10,
          episodes
        ),
      ],
      []
    );
    assert.deepEqual(
      [...getCoveredEpisodeKeys([declinedChild], 10, episodes)],
      ['1:2']
    );
  });
});

describe('episode watch-ahead playback threshold', () => {
  const episode = {
    Id: 'episode-id',
    Name: 'Episode',
    Type: 'Episode' as const,
    HasSubtitles: false,
    LocationType: 'FileSystem' as const,
    MediaType: 'Video',
    ParentIndexNumber: 2,
    IndexNumber: 4,
    RunTimeTicks: 2_400_000_000_000,
    ProviderIds: {},
  };

  it('advances only after Jellyfin marks the matching episode played at 90%', () => {
    const progress = getCompletedWatchAheadProgress(
      {
        Id: 'session',
        DeviceName: 'TV',
        Client: 'Jellyfin',
        IsActive: true,
        SupportsMediaControl: false,
        SupportsRemoteControl: false,
        PlayableMediaTypes: [],
        SupportedCommands: [],
        NowPlayingItem: episode,
        PlayState: { PositionTicks: 2_160_000_000_000, IsPaused: false },
      },
      {
        ...episode,
        ProviderIds: {},
        UserData: { Played: true },
      }
    );

    assert.deepEqual(progress, { seasonNumber: 2, episodeNumber: 4 });
  });

  it('rejects incomplete, paused, mismatched, and unplayed episodes', () => {
    const session = {
      Id: 'session',
      DeviceName: 'TV',
      Client: 'Jellyfin',
      IsActive: true,
      SupportsMediaControl: false,
      SupportsRemoteControl: false,
      PlayableMediaTypes: [],
      SupportedCommands: [],
      NowPlayingItem: episode,
      PlayState: { PositionTicks: 2_000_000_000_000, IsPaused: false },
    };
    const item = {
      ...episode,
      HasSubtitles: false,
      LocationType: 'FileSystem' as const,
      MediaType: 'Video',
      ProviderIds: {},
      UserData: { Played: true },
    };

    assert.equal(getCompletedWatchAheadProgress(session, item), undefined);
    assert.equal(
      getCompletedWatchAheadProgress(
        { ...session, PlayState: { ...session.PlayState, IsPaused: true } },
        item
      ),
      undefined
    );
    assert.equal(
      getCompletedWatchAheadProgress(session, {
        ...item,
        Id: 'another-episode',
      }),
      undefined
    );
    assert.equal(
      getCompletedWatchAheadProgress(session, {
        ...item,
        UserData: { Played: false },
      }),
      undefined
    );
  });

  it('advances a matching Plex episode after 90% playback', () => {
    assert.deepEqual(
      getCompletedPlexWatchAheadProgress({
        ratingKey: 'episode-4',
        grandparentRatingKey: 'series-1',
        type: 'episode',
        index: 4,
        parentIndex: 2,
        viewOffset: 2_160_000,
        duration: 2_400_000,
        state: 'playing',
      }),
      { seasonNumber: 2, episodeNumber: 4 }
    );
  });

  it('rejects incomplete and paused Plex episodes', () => {
    const session = {
      ratingKey: 'episode-4',
      grandparentRatingKey: 'series-1',
      type: 'episode' as const,
      index: 4,
      parentIndex: 2,
      viewOffset: 2_000_000,
      duration: 2_400_000,
      state: 'playing',
    };
    assert.equal(getCompletedPlexWatchAheadProgress(session), undefined);
    assert.equal(
      getCompletedPlexWatchAheadProgress({
        ...session,
        viewOffset: 2_200_000,
        state: 'paused',
      }),
      undefined
    );
  });

  it('resolves a Plex series TVDB identity from its provider GUIDs', () => {
    assert.equal(
      getPlexTvdbId({
        guid: 'plex://show/series-1',
        Guid: [{ id: 'tmdb://100' }, { id: 'tvdb://123456' }],
      }),
      123456
    );
    assert.equal(
      getPlexTvdbId({ guid: 'plex://show/series-1', Guid: [] }),
      undefined
    );
  });
});
