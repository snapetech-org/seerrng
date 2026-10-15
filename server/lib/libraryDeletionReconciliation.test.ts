import type JellyfinAPI from '@server/api/jellyfin';
import type PlexAPI from '@server/api/plexapi';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import dataSource, { getRepository } from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import Issue from '@server/entity/Issue';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { RequestDispatchOutbox } from '@server/entity/RequestDispatchOutbox';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  applyConfirmedVideoDeletion,
  confirmedNotFound,
  LibraryDeletionReconciler,
  mediaServerDeletionPresence,
  type LibraryPresence,
} from './libraryDeletionReconciliation';
import type { RadarrSettings, SonarrSettings } from './settings';

setupTestDb();
let movies: () => Promise<{ tmdbId: number }[]>;
let series: () => Promise<{ tvdbId: number }[]>;
Object.defineProperty(RadarrAPI.prototype, 'getMovies', {
  configurable: true,
  get: () => movies,
  set() {},
});
Object.defineProperty(SonarrAPI.prototype, 'getSeries', {
  configurable: true,
  get: () => series,
  set() {},
});
beforeEach(() => {
  movies = async () => [];
  series = async () => [];
});

async function fixture(overrides: Partial<Media> = {}) {
  const repo = getRepository(Media);
  const saved = await repo.save(
    new Media({
      tmdbId: 100,
      mediaType: MediaType.MOVIE,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
      serviceId: 0,
      externalServiceId: 200,
      ratingKey: 'old',
      ...overrides,
    })
  );
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  await dataSource
    .createQueryBuilder()
    .insert()
    .into(MediaRequest)
    .values({
      status: MediaRequestStatus.COMPLETED,
      type: saved.mediaType,
      media: saved,
      requestedBy: user,
    })
    .callListeners(false)
    .execute();
  await dataSource
    .createQueryBuilder()
    .insert()
    .into(Issue)
    .values({ issueType: 1, media: saved, createdBy: user })
    .callListeners(false)
    .execute();
  return repo.findOneByOrFail({ id: saved.id });
}
const service = {
  id: 0,
  name: 'Test',
  hostname: 'localhost',
  port: 7878,
  apiKey: 'test',
  syncEnabled: true,
  is4k: false,
} as RadarrSettings;
function reconciler(
  probe: (media: Media, q: boolean) => Promise<LibraryPresence> = async () =>
    'absent',
  overrides: Partial<
    ConstructorParameters<typeof LibraryDeletionReconciler>[0]
  > = {}
) {
  return new LibraryDeletionReconciler({
    radarr: [service],
    sonarr: [{ ...service, port: 8989 } as unknown as SonarrSettings],
    mediaServerPresence: probe,
    withOwnerAuthority: async (run) => run(),
    withAuthority: async (_media, run) => run(),
    cancelled: () => false,
    ...overrides,
  });
}
describe('Confirmed library deletion', () => {
  it('removes a last-copy media row and its requests/issues, not another title', async () => {
    const target = await fixture();
    const other = await fixture({ tmdbId: 101 });
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'absent']),
      'removed'
    );
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), false);
    assert.equal(await getRepository(MediaRequest).count(), 1);
    assert.equal(await getRepository(Issue).count(), 1);
    assert.equal(await getRepository(Media).existsBy({ id: other.id }), true);
  });
  it('clears only HD while retaining 4K and all request/issue history', async () => {
    const target = await fixture({
      status4k: MediaStatus.AVAILABLE,
      serviceId4k: 1,
      externalServiceId4k: 300,
      ratingKey4k: 'keep-4k',
    });
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'present']),
      'updated'
    );
    const result = await getRepository(Media).findOneByOrFail({
      id: target.id,
    });
    assert.equal(result.status, MediaStatus.DELETED);
    assert.equal(result.externalServiceId, null);
    assert.equal(result.status4k, MediaStatus.AVAILABLE);
    assert.equal(result.externalServiceId4k, 300);
    assert.equal(result.ratingKey4k, 'keep-4k');
    assert.equal(await getRepository(MediaRequest).count(), 1);
    assert.equal(await getRepository(Issue).count(), 1);
  });
  it('clears only 4K while retaining HD', async () => {
    const target = await fixture({
      status4k: MediaStatus.AVAILABLE,
      serviceId4k: 1,
      externalServiceId4k: 300,
      ratingKey4k: 'old4k',
    });
    await applyConfirmedVideoDeletion(target, ['present', 'absent']);
    const result = await getRepository(Media).findOneByOrFail({
      id: target.id,
    });
    assert.equal(result.status, MediaStatus.AVAILABLE);
    assert.equal(result.externalServiceId, 200);
    assert.equal(result.externalServiceId4k, null);
  });
  it('keeps the blocklist and media but deletes old history; unblock cannot restore stale availability', async () => {
    const target = await fixture({
      status: MediaStatus.BLOCKLISTED,
      status4k: MediaStatus.BLOCKLISTED,
    });
    const block = await getRepository(Blocklist).save(
      new Blocklist({
        media: target,
        mediaType: MediaType.MOVIE,
        tmdbId: 100,
        previousStatus: MediaStatus.AVAILABLE,
        previousStatus4k: MediaStatus.UNKNOWN,
        isMediaPlaceholder: false,
      })
    );
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'absent']),
      'retained'
    );
    assert.equal(await getRepository(Blocklist).count(), 1);
    assert.equal(await getRepository(MediaRequest).count(), 0);
    assert.equal(await getRepository(Issue).count(), 0);
    await Blocklist.removeFromBlocklist(block);
    const result = await getRepository(Media).findOneByOrFail({
      id: target.id,
    });
    assert.equal(result.status, MediaStatus.DELETED);
    assert.equal(result.status4k, MediaStatus.DELETED);
  });
  it('preserves a watchlist entry while clearing obsolete history', async () => {
    const target = await fixture();
    await getRepository(Watchlist).save(
      new Watchlist({
        media: target,
        mediaType: MediaType.MOVIE,
        tmdbId: 100,
        requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
      })
    );
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'absent']),
      'retained'
    );
    assert.equal(await getRepository(Watchlist).count(), 1);
    assert.equal(await getRepository(MediaRequest).count(), 0);
    assert.equal(await getRepository(Issue).count(), 0);
  });
  it('clears an approved request with a processing season after confirmed removal', async () => {
    const target = await fixture({
      mediaType: MediaType.TV,
      tvdbId: 101,
      status: MediaStatus.PARTIALLY_AVAILABLE,
    });
    const user = await getRepository(User).findOneByOrFail({ id: 1 });
    const request = await getRepository(MediaRequest).findOneByOrFail({
      media: { id: target.id },
    });
    await dataSource
      .createQueryBuilder()
      .update(MediaRequest)
      .set({ status: MediaRequestStatus.APPROVED })
      .where('id = :id', { id: request.id })
      .callListeners(false)
      .execute();
    await getRepository(SeasonRequest).save(
      new SeasonRequest({
        request,
        seasonNumber: 1,
        status: MediaRequestStatus.APPROVED,
      })
    );
    await getRepository(Season).save(
      new Season({
        media: Promise.resolve(target),
        seasonNumber: 1,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    await getRepository(Watchlist).save(
      new Watchlist({
        media: target,
        mediaType: MediaType.TV,
        tmdbId: target.tmdbId,
        requestedBy: user,
      })
    );
    const snapshot = await getRepository(Media).findOneByOrFail({
      id: target.id,
    });

    assert.equal(
      await applyConfirmedVideoDeletion(snapshot, ['absent', 'absent']),
      'retained'
    );

    const retained = await getRepository(Media).findOneByOrFail({
      id: target.id,
    });
    const season = await getRepository(Season).findOneByOrFail({
      media: { id: target.id },
      seasonNumber: 1,
    });
    assert.equal(retained.status, MediaStatus.DELETED);
    assert.equal(retained.externalServiceId, null);
    assert.equal(season.status, MediaStatus.DELETED);
    assert.equal(season.status4k, MediaStatus.UNKNOWN);
    assert.equal(await getRepository(MediaRequest).count(), 0);
    assert.equal(await getRepository(SeasonRequest).count(), 0);
    assert.equal(await getRepository(Watchlist).count(), 1);
  });
  it('never treats an unreachable quality as deletion or makes partial changes', async () => {
    const target = await fixture();
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'unknown']),
      'unchanged'
    );
    assert.equal(
      (await getRepository(Media).findOneByOrFail({ id: target.id })).status,
      MediaStatus.AVAILABLE
    );
    assert.equal(await getRepository(MediaRequest).count(), 1);
  });
  it('rejects stale media evidence', async () => {
    const target = await fixture();
    await getRepository(Media).update(target.id, { externalServiceId: 777 });
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'absent']),
      'unchanged'
    );
  });
  it('does not race an in-flight request dispatch', async () => {
    const target = await fixture();
    const request = await getRepository(MediaRequest).findOneByOrFail({
      media: { id: target.id },
    });
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id })
    );
    assert.equal(
      await applyConfirmedVideoDeletion(target, ['absent', 'absent']),
      'unchanged'
    );
  });
  it('updates only the removed TV season quality', async () => {
    const target = await fixture({
      mediaType: MediaType.TV,
      tvdbId: 333,
      status4k: MediaStatus.AVAILABLE,
    });
    await getRepository(Season).save(
      new Season({
        seasonNumber: 1,
        media: Promise.resolve(target),
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      })
    );
    await applyConfirmedVideoDeletion(target, ['absent', 'present']);
    const season = await getRepository(Season).findOneByOrFail({
      seasonNumber: 1,
    });
    assert.equal(season.status, MediaStatus.DELETED);
    assert.equal(season.status4k, MediaStatus.AVAILABLE);
  });
  it('rolls back history deletions if the media deletion fails', async () => {
    const target = await fixture();
    await dataSource.query(
      `CREATE TRIGGER reject_cleanup BEFORE DELETE ON media BEGIN SELECT RAISE(ABORT, 'blocked'); END`
    );
    await assert.rejects(
      applyConfirmedVideoDeletion(target, ['absent', 'absent'])
    );
    await dataSource.query('DROP TRIGGER reject_cleanup');
    assert.equal(await getRepository(Issue).count(), 1);
    assert.equal(await getRepository(MediaRequest).count(), 1);
  });
  it('requires two successful observations and uses canonical IDs rather than saved local IDs', async () => {
    const target = await fixture();
    let calls = 0;
    movies = async () => {
      calls++;
      return [{ tmdbId: 999 }];
    };
    await reconciler().reconcile(target);
    assert.equal(calls, 2);
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), false);
  });
  it('retains an Arr entry even when it is waiting for a replacement file', async () => {
    const target = await fixture();
    movies = async () => [{ tmdbId: 100 }];
    await reconciler().reconcile(target);
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), true);
  });
  it('preserves a title still present in the media server', async () => {
    const target = await fixture();
    await reconciler(async () => 'present').reconcile(target);
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), true);
  });
  it('aborts when a service fails, including on the confirmation read', async () => {
    const target = await fixture();
    let calls = 0;
    movies = async () => {
      if (++calls === 2) throw Error('timeout');
      return [];
    };
    await reconciler().reconcile(target);
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), true);
  });
  it('aborts when a copy returns before confirmation', async () => {
    const target = await fixture();
    let calls = 0;
    movies = async () => (++calls === 1 ? [] : [{ tmdbId: 100 }]);
    await reconciler().reconcile(target);
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), true);
  });
  it('does nothing with no services, disabled sync, or cancelled scans', async () => {
    const target = await fixture();
    for (const override of [
      { radarr: [] },
      { radarr: [{ ...service, syncEnabled: false }] },
      { cancelled: () => true },
    ])
      await reconciler(undefined, override).reconcile(target);
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), true);
  });
  it('honors authority changes before modifying the database', async () => {
    const target = await fixture();
    await assert.rejects(
      reconciler(undefined, {
        withAuthority: async () => {
          throw Error('configuration changed');
        },
      }).reconcile(target)
    );
    assert.equal(await getRepository(Media).existsBy({ id: target.id }), true);
  });
  it('requires structured 404 evidence, not an error string', () => {
    assert.equal(confirmedNotFound(new Error('404')), false);
    assert.equal(confirmedNotFound({ response: { status: 500 } }), false);
    assert.equal(confirmedNotFound({ response: { status: 404 } }), true);
    assert.equal(
      confirmedNotFound(new Error('wrapped', { cause: { statusCode: 404 } })),
      true
    );
  });
  it('clearing a library link can keep media-server evidence until cleanup', () => {
    const media = new Media({
      serviceId: 0,
      externalServiceId: 4,
      ratingKey: '123',
      ratingKey4k: '456',
    });
    media.resetServiceDataForResolution(false, true);
    assert.equal(media.externalServiceId, null);
    assert.equal(media.ratingKey, '123');
    assert.equal(media.ratingKey4k, '456');
    media.resetServiceDataForResolution(false);
    assert.equal(media.ratingKey, null);
  });
});

describe('Media-server deletion evidence', () => {
  const media = new Media({
    mediaType: MediaType.MOVIE,
    tmdbId: 100,
    ratingKey: '123',
    jellyfinMediaId: 'abc',
  });
  const plex = (
    options: Partial<Pick<PlexAPI, 'getStatus' | 'getMetadata'>> = {}
  ) =>
    ({
      getStatus: async () => ({
        MediaContainer: { machineIdentifier: 'server-1', friendlyName: 'Test' },
      }),
      getMetadata: async () => {
        throw { response: { status: 404 } };
      },
      ...options,
    }) as Pick<PlexAPI, 'getStatus' | 'getMetadata'>;
  it('accepts a confirmed item 404 from the configured live Plex server', async () => {
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.PLEX,
        plex(),
        undefined,
        'server-1'
      ),
      'absent'
    );
  });
  for (const status of [401, 403, 429, 500, 503])
    it(`does not delete on Plex HTTP ${status}`, async () => {
      assert.equal(
        await mediaServerDeletionPresence(
          media,
          false,
          MediaServerType.PLEX,
          plex({
            getMetadata: async () => {
              throw { response: { status } };
            },
          }),
          undefined,
          'server-1'
        ),
        'unknown'
      );
    });
  it('rejects a wrong server identity and root endpoint 404', async () => {
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.PLEX,
        plex(),
        undefined,
        'different-server'
      ),
      'unknown'
    );
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.PLEX,
        plex({
          getStatus: async () => {
            throw { response: { status: 404 } };
          },
        }),
        undefined,
        'server-1'
      ),
      'unknown'
    );
  });
  it('does not treat a missing key or malformed metadata as absence', async () => {
    assert.equal(
      await mediaServerDeletionPresence(
        new Media(),
        false,
        MediaServerType.PLEX,
        plex(),
        undefined,
        'server-1'
      ),
      'unknown'
    );
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.PLEX,
        plex({ getMetadata: async () => undefined as never }),
        undefined,
        'server-1'
      ),
      'unknown'
    );
  });
  it('distinguishes HD and 4K sharing one Plex movie key', async () => {
    const client = plex({
      getMetadata: async () =>
        ({
          ratingKey: '123',
          Guid: [{ id: 'tmdb://100' }],
          Media: [{ height: 2160, videoResolution: '4k' }],
        }) as never,
    });
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.PLEX,
        client,
        undefined,
        'server-1'
      ),
      'absent'
    );
    assert.equal(
      await mediaServerDeletionPresence(
        new Media({ ...media, ratingKey4k: '123' }),
        true,
        MediaServerType.PLEX,
        client,
        undefined,
        'server-1'
      ),
      'present'
    );
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        true,
        MediaServerType.PLEX,
        client,
        undefined,
        'server-1'
      ),
      'present',
      'An unlinked surviving quality must still protect the title'
    );
  });
  it('accepts only the strict Jellyfin/Emby lookup and preserves API failures', async () => {
    const client = {
      getSystemInfo: async () => ({ Id: 'server' }),
      getItemDataForDeletionCheck: async () => undefined,
    } as unknown as Pick<
      JellyfinAPI,
      'getSystemInfo' | 'getItemDataForDeletionCheck'
    >;
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.JELLYFIN,
        undefined,
        client
      ),
      'absent'
    );
    client.getItemDataForDeletionCheck = async () => {
      throw { response: { status: 500 } };
    };
    assert.equal(
      await mediaServerDeletionPresence(
        media,
        false,
        MediaServerType.EMBY,
        undefined,
        client
      ),
      'unknown'
    );
  });
});
