import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import PlexAPI, { type PlexMetadata } from '@server/api/plexapi';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  enforceTvSeasonWatchGate,
  filterTvSeasonSelectionsByWatchGate,
  TvSeasonWatchGateError,
} from './tvSeasonWatchGate';

const settings = getSettings();
const originalWatchGateSetting = settings.main.tvSeasonWatchGateEnabled;
const originalMediaServerType = settings.main.mediaServerType;
const restoreMethods: (() => void)[] = [];

afterEach(() => {
  restoreMethods.splice(0).forEach((restore) => restore());
  settings.main.tvSeasonWatchGateEnabled = originalWatchGateSetting;
  settings.main.mediaServerType = originalMediaServerType;
});

const makeEpisode = (
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean
): PlexMetadata =>
  ({
    parentIndex: seasonNumber,
    index: episodeNumber,
    viewCount: watched ? 1 : 0,
  }) as PlexMetadata;

const makeUsers = () => ({
  actor: new User({
    email: 'requester@example.test',
    permissions: Permission.REQUEST,
  }),
  requestUser: new User({
    email: 'requester@example.test',
    permissions: Permission.REQUEST,
    plexId: 42,
    plexToken: 'test-token',
  }),
});

const media = () =>
  new Media({
    tmdbId: 10,
    mediaType: MediaType.TV,
    ratingKey: 'series-standard',
    ratingKey4k: 'series-4k',
  });

const catalog = [
  { seasonNumber: 0, episodeCount: 1 },
  { seasonNumber: 1, episodeCount: 2 },
  { seasonNumber: 2, episodeCount: 1 },
];

const selections = [{ seasonNumber: 2 }];

describe('TV season watch gate', () => {
  it('blocks a request when any expected episode in the previous season is unwatched', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor, requestUser } = makeUsers();
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async (rootId: string) =>
        rootId === 'series-standard'
          ? [makeEpisode(1, 1, true), makeEpisode(1, 2, false)]
          : []
    );
    restoreMethods.push(() => leaves.mock.restore());

    await assert.rejects(
      enforceTvSeasonWatchGate(
        actor,
        requestUser,
        media(),
        catalog,
        selections
      ),
      (error: unknown) =>
        error instanceof TvSeasonWatchGateError &&
        error.status === 403 &&
        /Season 1 before requesting Season 2/.test(error.message)
    );
    assert.deepEqual(
      leaves.mock.calls.map(({ arguments: [rootId] }) => rootId),
      ['series-standard', 'series-4k']
    );
  });

  it('allows the request after every episode of the previous season is watched', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor, requestUser } = makeUsers();
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async (rootId: string) =>
        rootId === 'series-standard'
          ? [makeEpisode(1, 1, true), makeEpisode(1, 2, true)]
          : []
    );
    restoreMethods.push(() => leaves.mock.restore());

    await assert.doesNotReject(
      enforceTvSeasonWatchGate(actor, requestUser, media(), catalog, selections)
    );
  });

  it('stages a full-series request at the first season with incomplete playback', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor, requestUser } = makeUsers();
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async (rootId: string) =>
        rootId === 'series-standard'
          ? [makeEpisode(1, 1, true), makeEpisode(1, 2, false)]
          : []
    );
    restoreMethods.push(() => leaves.mock.restore());

    const eligibleSelections = await filterTvSeasonSelectionsByWatchGate(
      actor,
      requestUser,
      media(),
      catalog,
      [{ seasonNumber: 1 }, { seasonNumber: 2 }]
    );

    assert.deepEqual(eligibleSelections, [{ seasonNumber: 1 }]);
  });

  it('rejects staging when no requested season has a complete predecessor', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor, requestUser } = makeUsers();
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async () => []
    );
    restoreMethods.push(() => leaves.mock.restore());

    await assert.rejects(
      filterTvSeasonSelectionsByWatchGate(
        actor,
        requestUser,
        media(),
        catalog,
        [{ seasonNumber: 2 }]
      ),
      (error: unknown) =>
        error instanceof TvSeasonWatchGateError &&
        error.status === 403 &&
        /Add this series to your linked Plex/.test(error.message)
    );
  });

  it('requires a linked playback account for a later-season request', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor } = makeUsers();

    await assert.rejects(
      enforceTvSeasonWatchGate(
        actor,
        new User({ email: 'requester@example.test' }),
        media(),
        catalog,
        selections
      ),
      (error: unknown) =>
        error instanceof TvSeasonWatchGateError &&
        error.status === 403 &&
        /Link your Plex/.test(error.message)
    );
  });

  it('explains when the previous season is absent from the linked library', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor, requestUser } = makeUsers();
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async () => []
    );
    restoreMethods.push(() => leaves.mock.restore());

    await assert.rejects(
      enforceTvSeasonWatchGate(
        actor,
        requestUser,
        media(),
        catalog,
        selections
      ),
      (error: unknown) =>
        error instanceof TvSeasonWatchGateError &&
        error.status === 403 &&
        /Add this series to your linked Plex/.test(error.message)
    );
  });

  it('returns a recoverable service error when the media server cannot be queried', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const { actor, requestUser } = makeUsers();
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async () => {
        throw new Error('provider offline');
      }
    );
    restoreMethods.push(() => leaves.mock.restore());

    await assert.rejects(
      enforceTvSeasonWatchGate(
        actor,
        requestUser,
        media(),
        catalog,
        selections
      ),
      (error: unknown) =>
        error instanceof TvSeasonWatchGateError &&
        error.status === 503 &&
        /Try again later/.test(error.message)
    );
  });

  it('lets request managers bypass the gate without querying playback history', async () => {
    settings.main.tvSeasonWatchGateEnabled = true;
    settings.main.mediaServerType = MediaServerType.PLEX;
    const actor = new User({
      email: 'manager@example.test',
      permissions: Permission.MANAGE_REQUESTS,
    });
    const leaves = mock.method(
      PlexAPI.prototype,
      'getAllLeavesMetadata',
      async () => {
        throw new Error('should not query');
      }
    );
    restoreMethods.push(() => leaves.mock.restore());

    await assert.doesNotReject(
      enforceTvSeasonWatchGate(
        actor,
        new User({ email: 'requester@example.test' }),
        media(),
        catalog,
        selections
      )
    );
    assert.equal(leaves.mock.callCount(), 0);
  });
});
