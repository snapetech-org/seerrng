import JellyfinAPI, {
  type JellyfinLibraryItemExtended,
} from '@server/api/jellyfin';
import PlexAPI, { type PlexMetadata } from '@server/api/plexapi';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { it } from 'node:test';
setupTestDb();
for (const source of [
  MediaServerType.JELLYFIN,
  MediaServerType.EMBY,
  MediaServerType.PLEX,
])
  for (const is4k of [false, true])
    for (const allowed of [true, false])
      it(`related availability preserves verified viewer state with private links hidden (${source},4k=${is4k},allowed=${allowed})`, async (t) => {
        const settings = getSettings();
        const original = {
          type: settings.main.mediaServerType,
          jellyfin: settings.jellyfin,
          plex: settings.plex,
        };
        t.after(() => {
          settings.main.mediaServerType = original.type;
          settings.jellyfin = original.jellyfin;
          settings.plex = original.plex;
          cacheManager.getCache('mediaavailability').data.flushAll();
        });
        cacheManager.getCache('mediaavailability').data.flushAll();
        settings.main.mediaServerType = source;
        settings.jellyfin = {
          ...settings.jellyfin,
          ip: 'fixture-media.test',
          port: 8096,
          useSsl: false,
        };
        settings.plex = {
          ...settings.plex,
          ip: 'fixture-media.test',
          port: 32400,
          useSsl: false,
        };
        const viewerId = 'a'.repeat(32),
          nativeId = 'b'.repeat(32),
          plexId = '42';
        const user = await getRepository(User).findOneByOrFail({
          email: 'friend@seerr.dev',
        });
        await getRepository(User).update(user.id, {
          permissions: Permission.REQUEST,
          jellyfinUserId: viewerId,
          jellyfinAuthToken: 'viewer-fixture-token',
          jellyfinDeviceId: 'fixture-device',
          plexId: 777,
          plexToken: 'viewer-plex-token',
        });
        const viewer = await getRepository(User).findOneByOrFail({
          id: user.id,
        });
        const key = is4k ? 'status4k' : 'status';
        const row = await getRepository(Media).save(
          new Media({
            tmdbId: 991592,
            mediaType: MediaType.MOVIE,
            status: is4k ? MediaStatus.UNKNOWN : MediaStatus.AVAILABLE,
            status4k: is4k ? MediaStatus.AVAILABLE : MediaStatus.UNKNOWN,
            jellyfinMediaId: is4k ? null : nativeId,
            jellyfinMediaId4k: is4k ? nativeId : null,
            ratingKey: is4k ? null : plexId,
            ratingKey4k: is4k ? plexId : null,
            externalServiceSlug: 'private-manager-link',
          })
        );
        t.mock.method(
          JellyfinAPI.prototype,
          'getUserItemForAvailabilityCheck',
          async (id: string, viewer: string) => {
            assert.equal(id, nativeId);
            assert.equal(viewer, viewerId);
            if (!allowed) throw new Error('Viewer cannot see this item');
            return {
              Id: nativeId,
              Type: 'Movie',
              ProviderIds: { Tmdb: '991592' },
            } as JellyfinLibraryItemExtended;
          }
        );
        t.mock.method(PlexAPI.prototype, 'getMetadata', async (id: string) => {
          assert.equal(id, plexId);
          if (!allowed) throw new Error('Viewer cannot see this item');
          return {
            ratingKey: plexId,
            type: 'movie',
            Guid: [{ id: 'tmdb://991592' }],
          } as PlexMetadata;
        });
        const detail = await Media.getMedia(991592, MediaType.MOVIE, viewer);
        const related = await Media.getRelatedMedia(viewer, [
          { tmdbId: 991592, mediaType: 'movie' },
        ]);
        assert.equal(related.length, 1);
        assert.equal(
          detail?.[key],
          allowed ? MediaStatus.AVAILABLE : MediaStatus.UNKNOWN
        );
        assert.equal(related[0][key], detail?.[key]);
        for (const value of [detail!, related[0]]) {
          assert.equal(value.jellyfinMediaId, undefined);
          assert.equal(value.jellyfinMediaId4k, undefined);
          assert.equal(value.ratingKey, undefined);
          assert.equal(value.ratingKey4k, undefined);
          assert.equal(value.externalServiceSlug, undefined);
        }
        const persisted = await getRepository(Media).findOneByOrFail({
          id: row.id,
        });
        assert.equal(persisted[key], MediaStatus.AVAILABLE);
      });
