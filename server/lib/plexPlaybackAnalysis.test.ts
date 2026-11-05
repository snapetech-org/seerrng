import PlexAPI, {
  type PlexMetadata,
  type PlexPlaybackSession,
} from '@server/api/plexapi';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { PlexAnalysisState } from '@server/entity/PlexAnalysisState';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { PlexPlaybackAnalysis } from './plexPlaybackAnalysis';
setupTestDb();
const session: PlexPlaybackSession = {
  ratingKey: '10',
  grandparentRatingKey: '30',
  type: 'episode',
  index: 2,
  parentIndex: 1,
  viewOffset: 1,
  duration: 100,
  state: 'playing',
};
const metadata = (overrides: Partial<PlexMetadata>): PlexMetadata => ({
  ratingKey: '10',
  type: 'episode',
  parentRatingKey: '20',
  librarySectionID: '1',
  index: 2,
  parentIndex: 1,
  guid: '',
  title: '',
  Guid: [],
  leafCount: 0,
  viewedLeafCount: 0,
  viewCount: 0,
  addedAt: 0,
  updatedAt: 0,
  Media: [],
  ...overrides,
});
let restore: () => void;
beforeEach(async () => {
  const settings = getSettings();
  const originalMain = { ...settings.main };
  const originalPlex = { ...settings.plex };
  restore = () => {
    Object.assign(settings.main, originalMain);
    settings.plex = originalPlex;
  };
  settings.main.mediaServerType = MediaServerType.PLEX;
  settings.plex = {
    name: 'fixture',
    machineId: 'server-one',
    ip: 'plex.test',
    port: 32400,
    analyzeOnPlayback: true,
    libraries: [{ id: '1', name: 'TV', type: 'show', enabled: true }],
  };
  await getRepository(User).update(1, { plexToken: 'fixture-owner-token' });
  mock.method(PlexAPI.prototype, 'getPlaybackSessions', async () => [session]);
  mock.method(PlexAPI.prototype, 'getMetadata', async (key: string) =>
    key === '10'
      ? metadata({})
      : metadata({
          ratingKey: key,
          type: 'season',
          index: 1,
          parentRatingKey: '30',
        })
  );
});
afterEach(() => {
  restore();
  mock.restoreAll();
});
it('queues the playing season before the completion threshold and deduplicates across worker restarts', async () => {
  const analyze = mock.method(
    PlexAPI.prototype,
    'analyzeSeason',
    async () => undefined
  );
  await new PlexPlaybackAnalysis().run();
  await new PlexPlaybackAnalysis().run();
  assert.equal(analyze.mock.callCount(), 1);
  assert.equal(analyze.mock.calls[0].arguments[0], '20');
  assert.equal(await getRepository(PlexAnalysisState).count(), 1);
  assert.ok(
    (
      await getRepository(PlexAnalysisState).findOneByOrFail({
        seasonKey: '20',
      })
    ).queuedAt
  );
});
it('backs off a failed or ambiguous submission for a day', async () => {
  const analyze = mock.method(PlexAPI.prototype, 'analyzeSeason', async () => {
    throw Error('offline');
  });
  await new PlexPlaybackAnalysis().run();
  await new PlexPlaybackAnalysis().run();
  assert.equal(analyze.mock.callCount(), 1);
  const state = await getRepository(PlexAnalysisState).findOneByOrFail({
    seasonKey: '20',
  });
  assert.equal(state.queuedAt, null);
  await getRepository(PlexAnalysisState).update(
    { serverKey: state.serverKey, seasonKey: state.seasonKey },
    { attemptedAt: new Date(Date.now() - 86_400_001) }
  );
  await new PlexPlaybackAnalysis().run();
  assert.equal(analyze.mock.callCount(), 2);
});
for (const scenario of [
  'disabled',
  'jellyfin',
  'no-token',
  'no-library',
  'paused',
  'invalid-key',
  'wrong-episode',
  'wrong-season',
  'wrong-library',
  'wrong-show',
  'server-changed',
  'token-rotated',
] as const) {
  it(`does not analyze when ${scenario}`, async () => {
    const analyze = mock.method(
      PlexAPI.prototype,
      'analyzeSeason',
      async () => undefined
    );
    const settings = getSettings();
    if (scenario === 'disabled') settings.plex.analyzeOnPlayback = false;
    if (scenario === 'jellyfin')
      settings.main.mediaServerType = MediaServerType.JELLYFIN;
    if (scenario === 'no-token')
      await getRepository(User).update(1, { plexToken: null });
    if (scenario === 'no-library') settings.plex.libraries = [];
    if (scenario === 'paused' || scenario === 'invalid-key')
      mock.method(PlexAPI.prototype, 'getPlaybackSessions', async () => [
        {
          ...session,
          ...(scenario === 'paused'
            ? { state: 'paused' }
            : { ratingKey: '../30' }),
        },
      ]);
    if (scenario.startsWith('wrong-'))
      mock.method(PlexAPI.prototype, 'getMetadata', async (key: string) =>
        key === '10'
          ? metadata(
              scenario === 'wrong-episode'
                ? { ratingKey: '11' }
                : scenario === 'wrong-library'
                  ? { librarySectionID: '2' }
                  : {}
            )
          : metadata({
              ratingKey: key,
              type: scenario === 'wrong-season' ? 'show' : 'season',
              index: 1,
              parentRatingKey: scenario === 'wrong-show' ? '31' : '30',
            })
      );
    if (scenario === 'server-changed' || scenario === 'token-rotated')
      mock.method(PlexAPI.prototype, 'getPlaybackSessions', async () => {
        if (scenario === 'server-changed') settings.plex.machineId = 'other';
        else await getRepository(User).update(1, { plexToken: 'new-token' });
        return [session];
      });
    await new PlexPlaybackAnalysis().run();
    assert.equal(analyze.mock.callCount(), 0);
  });
}
it('bounds submission work to two distinct seasons per run', async () => {
  const analyze = mock.method(
    PlexAPI.prototype,
    'analyzeSeason',
    async () => undefined
  );
  mock.method(PlexAPI.prototype, 'getPlaybackSessions', async () =>
    [1, 2, 3, 4].map((n) => ({ ...session, ratingKey: String(n) }))
  );
  mock.method(PlexAPI.prototype, 'getMetadata', async (key: string) =>
    Number(key) < 100
      ? metadata({ ratingKey: key, parentRatingKey: String(100 + Number(key)) })
      : metadata({
          ratingKey: key,
          type: 'season',
          index: 1,
          parentRatingKey: '30',
        })
  );
  await new PlexPlaybackAnalysis().run();
  assert.equal(analyze.mock.callCount(), 2);
});

it('enforces the persisted per-minute cap across worker instances', async () => {
  const analyze = mock.method(
    PlexAPI.prototype,
    'analyzeSeason',
    async () => undefined
  );
  await new PlexPlaybackAnalysis().run();
  const state = await getRepository(PlexAnalysisState).findOneByOrFail({
    seasonKey: '20',
  });
  await getRepository(PlexAnalysisState).save(
    new PlexAnalysisState({
      serverKey: state.serverKey,
      seasonKey: '21',
      attemptedAt: new Date(),
      queuedAt: null,
    })
  );
  mock.method(PlexAPI.prototype, 'getMetadata', async (key: string) =>
    key === '10'
      ? metadata({ parentRatingKey: '22' })
      : metadata({
          ratingKey: key,
          type: 'season',
          index: 1,
          parentRatingKey: '30',
        })
  );
  await new PlexPlaybackAnalysis().run();
  assert.equal(analyze.mock.callCount(), 1);
});
it('permits another analysis after the successful submission cooldown expires', async () => {
  const analyze = mock.method(
    PlexAPI.prototype,
    'analyzeSeason',
    async () => undefined
  );
  await new PlexPlaybackAnalysis().run();
  const state = await getRepository(PlexAnalysisState).findOneByOrFail({
    seasonKey: '20',
  });
  const old = new Date(Date.now() - 31 * 86_400_000);
  await getRepository(PlexAnalysisState).update(
    { serverKey: state.serverKey, seasonKey: state.seasonKey },
    { attemptedAt: old, queuedAt: old }
  );
  await new PlexPlaybackAnalysis().run();
  assert.equal(analyze.mock.callCount(), 2);
});
