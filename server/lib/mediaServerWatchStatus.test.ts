import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import JellyfinAPI from '@server/api/jellyfin';
import PlexAPI, { type PlexMetadata } from '@server/api/plexapi';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { getMediaServerWatchStatus } from './mediaServerWatchStatus';

const settings = getSettings();
const originalMediaServerType = settings.main.mediaServerType;

afterEach(() => {
  mock.restoreAll();
  settings.main.mediaServerType = originalMediaServerType;
});

describe('media server watch status', () => {
  it('deduplicates Plex movie roots and retains the existing summary shape', async () => {
    settings.main.mediaServerType = MediaServerType.PLEX;
    const user = new User({
      email: 'plex-watch@example.test',
      plexToken: 'test-plex-token',
    });
    const media = new Media({
      tmdbId: 10,
      mediaType: MediaType.MOVIE,
      ratingKey: 'movie-root',
      ratingKey4k: 'movie-root',
    });
    const getMetadata = mock.method(
      PlexAPI.prototype,
      'getMetadata',
      async () => ({ viewCount: 1 }) as PlexMetadata
    );

    const result = await getMediaServerWatchStatus(media, user, true);

    assert.deepStrictEqual(result, {
      serverType: MediaServerType.PLEX,
      availableCount: 1,
      watchedCount: 1,
      unwatchedCount: 0,
    });
    assert.strictEqual(getMetadata.mock.callCount(), 1);
  });

  for (const [name, serverType] of [
    ['Jellyfin', MediaServerType.JELLYFIN],
    ['Emby', MediaServerType.EMBY],
  ] as const) {
    it(`reads per-user episode history from ${name}`, async () => {
      settings.main.mediaServerType = serverType;
      const user = new User({
        email: `${name.toLocaleLowerCase()}-watch@example.test`,
        jellyfinUserId: '01234567-89ab-cdef-0123-456789abcdef',
        jellyfinAuthToken: 'test-media-server-token',
      });
      const media = new Media({
        tmdbId: 11,
        mediaType: MediaType.TV,
        jellyfinMediaId: 'series-root',
        jellyfinMediaId4k: 'series-root',
      });
      const getEpisodes = mock.method(
        JellyfinAPI.prototype,
        'getUserWatchEpisodes',
        async () => [
          { seasonNumber: 1, episodeNumber: 1, played: true },
          { seasonNumber: 1, episodeNumber: 2, played: false },
        ]
      );

      const result = await getMediaServerWatchStatus(media, user, true);

      assert.strictEqual(result.serverType, serverType);
      assert.strictEqual(result.availableCount, 2);
      assert.strictEqual(result.watchedCount, 1);
      assert.deepStrictEqual(result.seasons?.[0].episodes, [
        { seasonNumber: 1, episodeNumber: 1, watched: true },
        { seasonNumber: 1, episodeNumber: 2, watched: false },
      ]);
      assert.strictEqual(getEpisodes.mock.callCount(), 1);
    });
  }
});
