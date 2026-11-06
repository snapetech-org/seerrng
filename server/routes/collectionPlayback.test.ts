import JellyfinAPI from '@server/api/jellyfin';
import PlexAPI from '@server/api/plexapi';
import PlexCompanionAPI from '@server/api/plexcompanion';
import PlexTvAPI from '@server/api/plextv';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  runWithUserApiKeyAuthorityContext,
  runWithUserCredentialVersionContext,
} from '@server/lib/userSecurityMutation';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import playback from './playback';

setupTestDb();
beforeEach(async () => {
  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.PLEX;
  settings.plex.machineId = 'test';
  await getRepository(User).update(1, {
    permissions: Permission.ADMIN,
    plexToken: 'test',
  });
  vi.spyOn(PlexAPI.prototype, 'replacePlaylist').mockResolvedValue({
    key: '/playlists/100/items',
  } as never);
});
afterEach(() => vi.restoreAllMocks());
const app = (credentialVersion?: number, apiKeyCurrent?: () => boolean) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = new User({ id: 1 });
    if (credentialVersion !== undefined)
      return runWithUserCredentialVersionContext(1, credentialVersion, next);
    if (apiKeyCurrent)
      return runWithUserApiKeyAuthorityContext(1, apiKeyCurrent, next);
    next();
  });
  app.use('/playback', playback);
  return app;
};
describe('playback authority changes during provider reads', () => {
  for (const scope of ['media', 'collection'] as const) {
    for (const change of ['permission', 'unlink', 'credentials'] as const) {
      it(`rejects ${scope} playlist after ${change} changes during catalog loading`, async () => {
        const media = await getRepository(Media).save(
          new Media({
            mediaType: MediaType.MUSIC,
            tmdbId: 0,
            mbId: '11111111-1111-4111-8111-111111111111',
            status: MediaStatus.AVAILABLE,
            ratingKeyMp3: 'album',
          })
        );
        vi.spyOn(PlexAPI.prototype, 'getMetadata').mockImplementation(
          async () => {
            await getRepository(User).update(
              1,
              change === 'permission'
                ? { permissions: Permission.REQUEST_MOVIE }
                : change === 'unlink'
                  ? { plexToken: '' }
                  : { passwordChangedAt: new Date('2030-01-01T00:00:00Z') }
            );
            return { type: 'album', ratingKey: 'album' } as never;
          }
        );
        vi.spyOn(PlexAPI.prototype, 'getChildrenMetadata').mockResolvedValue([
          {
            type: 'track',
            ratingKey: 'mp3',
            title: 'MP3',
            Media: [{ audioCodec: 'mp3' }],
          },
        ] as never);
        const response = await request(app())
          .post(
            scope === 'media'
              ? `/playback/media/${media.id}/playlist`
              : '/playback/collection/playlist'
          )
          .send(
            scope === 'media'
              ? { is4k: false }
              : { mediaIds: [media.id], is4k: false }
          );
        expect(response.status).toBe(403);
        expect(PlexAPI.prototype.replacePlaylist).not.toHaveBeenCalled();
      });
    }
  }
});

describe('device playback admission', () => {
  for (const serverType of [
    MediaServerType.PLEX,
    MediaServerType.JELLYFIN,
    MediaServerType.EMBY,
  ]) {
    for (const scope of ['media', 'collection'] as const) {
      for (const change of [
        'unchanged',
        'permission',
        'unlink',
        'credentials',
      ] as const) {
        it(`${serverType} ${scope} command observes ${change} authority after device discovery`, async () => {
          getSettings().main.mediaServerType = serverType;
          await getRepository(User).update(1, {
            jellyfinUserId: '0123456789abcdef0123456789abcdef',
            jellyfinAuthToken: 'fixture-token',
            jellyfinDeviceId: 'fixture-device',
          });
          const media = await getRepository(Media).save(
            new Media({
              mediaType: MediaType.MOVIE,
              tmdbId: 42,
              status: MediaStatus.AVAILABLE,
              ratingKey: 'movie',
              jellyfinMediaId: 'movie',
            })
          );
          const changeAuthority = async () => {
            if (change === 'permission')
              await getRepository(User).update(1, {
                permissions: Permission.REQUEST_MUSIC,
              });
            if (change === 'unlink')
              await getRepository(User).update(1, {
                plexToken: '',
                jellyfinAuthToken: '',
              });
            if (change === 'credentials')
              await getRepository(User).update(1, {
                passwordChangedAt: new Date('2030-01-01T00:00:00Z'),
              });
          };
          vi.spyOn(PlexAPI.prototype, 'getMetadata').mockResolvedValue({
            type: 'movie',
            ratingKey: 'movie',
            title: 'Fixture movie',
          } as never);
          vi.spyOn(JellyfinAPI.prototype, 'getItemData').mockResolvedValue({
            Type: 'Movie',
            Id: 'movie',
            Name: 'Fixture movie',
          } as never);
          vi.spyOn(PlexTvAPI.prototype, 'getDevices').mockResolvedValue([]);
          vi.spyOn(PlexAPI.prototype, 'getClients').mockImplementation(
            async () => {
              await changeAuthority();
              return [
                {
                  clientIdentifier: 'device',
                  name: 'Fixture player',
                  product: 'Fixture',
                  platform: 'Fixture',
                  connectionUri: 'http://192.168.1.2:32400',
                },
              ] as never;
            }
          );
          vi.spyOn(
            JellyfinAPI.prototype,
            'getControllableSessions'
          ).mockImplementation(async () => {
            await changeAuthority();
            return [{ Id: 'device' }] as never;
          });
          const queue = vi
            .spyOn(PlexAPI.prototype, 'createPlayQueue')
            .mockResolvedValue({
              selectedItemId: 'movie',
              playQueueId: 42,
            } as never);
          const companion = vi
            .spyOn(PlexCompanionAPI.prototype, 'playMedia')
            .mockResolvedValue(undefined);
          const session = vi
            .spyOn(JellyfinAPI.prototype, 'playOnSession')
            .mockResolvedValue(undefined);
          const response = await request(app())
            .post(
              scope === 'media'
                ? `/playback/media/${media.id}/play`
                : '/playback/collection/play'
            )
            .send({
              deviceId: 'device',
              ...(scope === 'collection' ? { mediaIds: [media.id] } : {}),
            });
          expect(response.status).toBe(change === 'unchanged' ? 204 : 403);
          if (change === 'unchanged') {
            if (serverType === MediaServerType.PLEX) {
              expect(queue).toHaveBeenCalledTimes(1);
              expect(companion).toHaveBeenCalledTimes(1);
              expect(session).not.toHaveBeenCalled();
            } else {
              expect(session).toHaveBeenCalledWith('device', ['movie']);
              expect(queue).not.toHaveBeenCalled();
              expect(companion).not.toHaveBeenCalled();
            }
          } else {
            expect(queue).not.toHaveBeenCalled();
            expect(companion).not.toHaveBeenCalled();
            expect(session).not.toHaveBeenCalled();
          }
        });
      }
    }
  }
});

describe('authenticated playback credential context', () => {
  for (const mode of ['stale-session', 'revoked-api-key'] as const) {
    it(`rejects ${mode} even when the route loaded a newer account snapshot`, async () => {
      await getRepository(User).update(1, {
        passwordChangedAt: new Date('2030-01-01T00:00:00Z'),
      });
      const media = await getRepository(Media).save(
        new Media({
          mediaType: MediaType.MOVIE,
          tmdbId: 42,
          ratingKey: 'movie',
          status: MediaStatus.AVAILABLE,
        })
      );
      vi.spyOn(PlexAPI.prototype, 'getMetadata').mockResolvedValue({
        type: 'movie',
        ratingKey: 'movie',
        title: 'Fixture movie',
      } as never);
      const response = await request(
        mode === 'stale-session' ? app(0) : app(undefined, () => false)
      )
        .post(`/playback/media/${media.id}/playlist`)
        .send({});
      expect(response.status).toBe(403);
      expect(PlexAPI.prototype.replacePlaylist).not.toHaveBeenCalled();
    });
  }
});

describe('collection playback', () => {
  it('plays selected albums as audio and does not include the other audio format', async () => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: '11111111-1111-4111-8111-111111111111',
        status: MediaStatus.AVAILABLE,
        ratingKeyMp3: 'album',
      })
    );
    vi.spyOn(PlexAPI.prototype, 'getMetadata').mockResolvedValue({
      type: 'album',
      ratingKey: 'album',
    } as never);
    vi.spyOn(PlexAPI.prototype, 'getChildrenMetadata').mockResolvedValue([
      {
        type: 'track',
        ratingKey: 'mp3',
        title: 'MP3',
        Media: [{ audioCodec: 'mp3' }],
      },
      {
        type: 'track',
        ratingKey: 'flac',
        title: 'FLAC',
        Media: [{ audioCodec: 'flac' }],
      },
    ] as never);
    expect(
      (
        await request(app())
          .post('/playback/collection/playlist')
          .send({ mediaIds: [media.id], is4k: false })
      ).status
    ).toBe(200);
    expect(PlexAPI.prototype.replacePlaylist).toHaveBeenCalledWith(
      'SeerrNG - Current Selection',
      ['mp3'],
      'audio',
      'test'
    );
  });
  it('filters out 4K-only episodes from an HD series playlist', async () => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.TV,
        tmdbId: 55,
        status: MediaStatus.AVAILABLE,
        ratingKey: 'show',
      })
    );
    vi.spyOn(PlexAPI.prototype, 'getMetadata').mockResolvedValue({
      type: 'show',
      ratingKey: 'show',
    } as never);
    vi.spyOn(PlexAPI.prototype, 'getChildrenMetadata').mockImplementation(
      async (id) =>
        id === 'show'
          ? ([
              {
                type: 'season',
                ratingKey: 'season',
                title: 'Season',
                index: 1,
              },
            ] as never)
          : ([
              {
                type: 'episode',
                ratingKey: 'hd',
                title: 'HD',
                Media: [{ videoResolution: '1080' }],
                index: 1,
              },
              {
                type: 'episode',
                ratingKey: '4k',
                title: '4K',
                Media: [{ videoResolution: '4k' }],
                index: 2,
              },
            ] as never)
    );
    expect(
      (
        await request(app())
          .post('/playback/collection/playlist')
          .send({ mediaIds: [media.id], is4k: false })
      ).status
    ).toBe(200);
    expect(PlexAPI.prototype.replacePlaylist).toHaveBeenCalledWith(
      'SeerrNG - Current Selection',
      ['hd'],
      'video',
      'test'
    );
  });
  it('denies playback when the user lacks permissions for the selected media type', async () => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: '11111111-1111-4111-8111-111111111111',
      })
    );
    await getRepository(User).update(1, {
      permissions: Permission.REQUEST_MOVIE,
    });
    expect(
      (
        await request(app())
          .post('/playback/collection/playlist')
          .send({ mediaIds: [media.id] })
      ).status
    ).toBe(403);
    expect(PlexAPI.prototype.replacePlaylist).not.toHaveBeenCalled();
  });
});
