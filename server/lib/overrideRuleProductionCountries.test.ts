import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import OverrideRule from '@server/entity/OverrideRule';
import type { User } from '@server/entity/User';
import {
  getSettings,
  type RadarrSettings,
  type SonarrSettings,
} from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  catalogOverrideRuleMatches,
  evaluateOverrideRules,
} from './overrideRules';

setupTestDb();

const evaluate = async (
  countryData: unknown,
  mediaType: MediaType.MOVIE | MediaType.TV = MediaType.MOVIE,
  genre = 18,
  language = 'en'
) => {
  const tmdbMedia = {
    genres: [{ id: genre }],
    original_language: language,
    keywords: mediaType === MediaType.TV ? { results: [] } : { keywords: [] },
    ...(countryData === undefined ? {} : { production_countries: countryData }),
  } as unknown as TmdbMovieDetails | TmdbTvDetails;
  return evaluateOverrideRules({
    mediaType,
    is4k: false,
    tmdbMedia,
    requestUser: { id: 1 } as User,
    serviceId: 0,
  });
};

const rules = async (
  mediaType: MediaType.MOVIE | MediaType.TV = MediaType.MOVIE
) => {
  const service = { id: 0, isDefault: true, is4k: false };
  getSettings().radarr = [service as RadarrSettings];
  getSettings().sonarr = [service as SonarrSettings];
  const field =
    mediaType === MediaType.MOVIE ? 'radarrServiceId' : 'sonarrServiceId';
  await getRepository(OverrideRule).save([
    new OverrideRule({ [field]: 0, users: '1', profileId: 7 }),
    new OverrideRule({
      [field]: 0,
      users: '1',
      genre: '18',
      language: 'en',
      productionCountries: 'CA|US',
      profileId: 9,
      languageProfileId: 0,
    }),
  ]);
};

it('falls back safely when production-country metadata is absent or malformed', async () => {
  await rules();
  for (const countries of [
    undefined,
    null,
    {},
    [],
    [{ iso_3166_1: null }],
    [{ iso_3166_1: 'USA' }],
  ]) {
    assert.equal((await evaluate(countries)).profileId, 7);
  }
});

it('matches any selected country while retaining the other conditions and service identity', async () => {
  await rules();
  assert.equal((await evaluate([{ iso_3166_1: 'ca' }])).profileId, 9);
  assert.equal(
    (await evaluate([{ iso_3166_1: 'US' }], MediaType.MOVIE, 35)).profileId,
    7
  );
  assert.equal(
    (await evaluate([{ iso_3166_1: 'US' }], MediaType.MOVIE, 18, 'ko'))
      .profileId,
    7
  );
  assert.equal((await evaluate([{ iso_3166_1: 'JP' }])).profileId, 7);
  await getRepository(OverrideRule).save(
    new OverrideRule({
      radarrServiceId: 12,
      users: '1',
      genre: '18',
      language: 'en',
      productionCountries: 'CA|US',
      profileId: 99,
    })
  );
  const result = await evaluate([{ iso_3166_1: 'US' }]);
  assert.equal(result.profileId, 9);
  assert.equal(result.languageProfileId, null);
});

it('preserves language profile zero for matching Sonarr rules and excludes country rules from catalog matching', async () => {
  await rules(MediaType.TV);
  const result = await evaluate([{ iso_3166_1: 'US' }], MediaType.TV);
  assert.equal(result.profileId, 9);
  assert.equal(result.languageProfileId, 0);
  assert.equal(
    catalogOverrideRuleMatches(
      new OverrideRule({ productionCountries: 'US' }),
      1
    ),
    false
  );
});
