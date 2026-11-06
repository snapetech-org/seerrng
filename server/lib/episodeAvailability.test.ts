import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import EpisodeAvailability from '@server/entity/EpisodeAvailability';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import {
  clearSonarrEpisodeAvailabilityForService,
  getActiveEpisodeAvailabilitySources,
  getEpisodeAvailability,
  getSonarrEpisodeAvailabilitySourceId,
  removeMissingEpisodeAvailabilitySeries,
  syncEpisodeAvailabilityForSeries,
  syncSonarrEpisodeAvailability,
} from '@server/lib/episodeAvailability';
import {
  getSettings,
  MetadataProviderType,
  type SonarrSettings,
} from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { it } from 'node:test';

setupTestDb();
const provider = MetadataProviderType.TVDB;
const source = { type: 'sonarr' as const, id: 'sonarr:1' };
async function fixture(tmdbId = 100) {
  const media = await getRepository(Media).save(
    new Media({ tmdbId, mediaType: MediaType.TV })
  );
  const season = await getRepository(Season).save(
    new Season({ media: Promise.resolve(media), seasonNumber: 1 })
  );
  return { media, season };
}
async function sync(tmdbId = 100, is4k = false) {
  await syncEpisodeAvailabilityForSeries({
    source,
    metadataProvider: provider,
    externalSeriesId: 42,
    tmdbId,
    seasons: [{ seasonNumber: 1, episodes: [{ episodeNumber: 1, is4k }] }],
  });
}
it('persists and clears the valid zero-valued Sonarr service', async () => {
  const { season } = await fixture();
  assert.equal(getSonarrEpisodeAvailabilitySourceId(0), 'sonarr:0');
  await syncSonarrEpisodeAvailability(0, 42, [
    { seasonId: season.id, episodes: [{ episodeNumber: 1, is4k: false }] },
  ]);
  assert.equal(await getRepository(EpisodeAvailability).count(), 1);
  await clearSonarrEpisodeAvailabilityForService(0);
  assert.equal(await getRepository(EpisodeAvailability).count(), 0);
});
it('preserves a complete snapshot on an incomplete or malformed inventory', async () => {
  await fixture();
  await sync();
  for (const [ids, complete] of [
    [[], false],
    [[NaN], true],
    [[42, -1], true],
    [[42, 42], true],
  ] as const) {
    await removeMissingEpisodeAvailabilitySeries(
      source,
      provider,
      [...ids],
      complete
    );
    assert.equal(await getRepository(EpisodeAvailability).count(), 1);
  }
});
it('clears only the confirmed empty source and numbering order', async () => {
  await fixture();
  await sync();
  const repository = getRepository(EpisodeAvailability);
  const record = await repository.findOneOrFail({
    where: { externalSeriesId: 42 },
    relations: { season: true },
  });
  await repository.save(
    repository.create({ ...record, id: undefined, sourceId: 'sonarr:2' })
  );
  await removeMissingEpisodeAvailabilitySeries(source, provider, [], true);
  const remaining = await repository.find();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].sourceId, 'sonarr:2');
});
it('keeps source, numbering order, season and quality independent', async () => {
  await fixture();
  await sync(100, true);
  assert.equal(
    (await getEpisodeAvailability(100, 1, provider, [source], false)).size,
    0
  );
  assert.equal(
    (
      await getEpisodeAvailability(
        100,
        1,
        MetadataProviderType.TMDB,
        [source],
        true
      )
    ).size,
    0
  );
  assert.equal(
    (await getEpisodeAvailability(100, 2, provider, [source], true)).size,
    0
  );
  assert.equal(
    (
      await getEpisodeAvailability(
        100,
        1,
        provider,
        [{ ...source, id: 'sonarr:2' }],
        true
      )
    ).size,
    0
  );
  assert.deepEqual(
    (await getEpisodeAvailability(100, 1, provider, [source], true)).get(1)
      ?.sonarrAvailability,
    { hd: false, fourK: true }
  );
});
it('does not erase a prior snapshot when an unknown season prevents reconciliation', async () => {
  await fixture();
  await sync();
  await syncEpisodeAvailabilityForSeries({
    source,
    metadataProvider: provider,
    externalSeriesId: 42,
    tmdbId: 100,
    seasons: [{ seasonNumber: 2, episodes: [] }],
  });
  assert.equal(await getRepository(EpisodeAvailability).count(), 1);
});

it('matches scanner endpoint deduplication after enabled and quality gates', () => {
  const server = (id: number, is4k: boolean, syncEnabled = true) =>
    ({
      id,
      is4k,
      syncEnabled,
      hostname: 'fixture',
      port: 8989,
      useSsl: false,
      baseUrl: '',
    }) as SonarrSettings;
  const settings = getSettings();
  const sourceSettings = {
    sonarr: [server(9, false, false), server(0, true), server(1, false)],
    plex: settings.plex,
    jellyfin: settings.jellyfin,
    mediaServerType: MediaServerType.NOT_CONFIGURED,
  };
  assert.deepEqual(
    getActiveEpisodeAvailabilitySources(provider, sourceSettings, true),
    [{ type: 'sonarr', id: 'sonarr:0' }]
  );
  assert.deepEqual(
    getActiveEpisodeAvailabilitySources(provider, sourceSettings, false),
    [{ type: 'sonarr', id: 'sonarr:1' }]
  );
});
