import ExternalAPI from '@server/api/externalapi';
import { getRepository } from '@server/datasource';
import Follow from '@server/entity/Follow';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { tmdbPerson } from './tmdbAdapters';

setupTestDb();
const originalAgeGate = getSettings().main.ageGate;
afterEach(() => {
  mock.restoreAll();
  getSettings().main.ageGate = originalAgeGate;
});
const date = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const followFor = async (restricted = false) => {
  const user = await getRepository(User).findOneByOrFail({
    email: 'friend@seerr.dev',
  });
  user.contentRestricted = restricted;
  await getRepository(User).save(user);
  return new Follow({
    user,
    kind: 'tmdb-person',
    subjectKey: 'tmdb:person:99',
    subjectLabel: 'Fixture Person',
    conditions: { ref: { tmdbId: 99 } },
    cursor: null,
  });
};
const provider = (
  options: {
    emptyCredits?: boolean;
    adult?: boolean;
    certification?: string;
    mismatch?: boolean;
  } = {}
) => {
  mock.method(
    ExternalAPI.prototype as unknown as {
      get: (...args: unknown[]) => Promise<unknown>;
    },
    'get',
    async (path: string) =>
      path.includes('combined_credits')
        ? {
            cast: options.emptyCredits
              ? []
              : [
                  {
                    id: 970001,
                    media_type: 'movie',
                    title: 'Fixture Film',
                    adult: false,
                    release_date: date(5),
                  },
                ],
            crew: [],
          }
        : {
            id: options.mismatch ? 970002 : 970001,
            title: 'Fixture Film',
            adult: options.adult ?? false,
            genres: [],
            release_date: date(5),
            release_dates: {
              results: [
                {
                  iso_3166_1: 'US',
                  release_dates: [
                    { certification: options.certification ?? 'R' },
                  ],
                },
              ],
            },
            keywords: { keywords: [] },
            videos: { results: [] },
          }
  );
};
describe('TMDB follow viewer policy', () => {
  it('does not emit an R-rated upcoming title to an age-gated follower without a separate account cap', async () => {
    getSettings().main.ageGate = {
      ...originalAgeGate,
      maxMovieCertification: 'PG',
      maxTvCertification: 'TV-PG',
      certificationCountry: 'US',
      defaultRestricted: false,
    };
    const follow = await followFor(true);
    provider();
    assert.deepEqual((await tmdbPerson(follow)).events, []);
  });
  it('applies the individual movie maturity cap', async () => {
    const follow = await followFor();
    await getRepository(UserSettings).save({
      user: follow.user,
      movieMaturityRatingLimit: 'PG',
    });
    provider();
    assert.deepEqual((await tmdbPerson(follow)).events, []);
  });
  it('rechecks an old pending title before emitting its release-date event', async () => {
    const follow = await followFor();
    follow.lastCheckedAt = new Date(Date.now() - 86400000);
    follow.cursor = {
      known: ['movie:970001'],
      upcoming: [
        {
          id: '970001',
          mediaType: 'movie',
          title: 'Previously safe fixture',
          releaseDate: date(-1),
        },
      ],
    };
    provider({ emptyCredits: true, adult: true });
    assert.deepEqual((await tmdbPerson(follow)).events, []);
  });
  it('does not trust mismatched detail identity for a capped candidate', async () => {
    const follow = await followFor();
    await getRepository(UserSettings).save({
      user: follow.user,
      movieMaturityRatingLimit: 'PG',
    });
    provider({ certification: 'PG', mismatch: true });
    await assert.rejects(tmdbPerson(follow), /identity does not match/);
  });
  it('emits an allowed upcoming title and a bounded pending cursor', async () => {
    const follow = await followFor();
    provider({ certification: 'PG' });
    const result = await tmdbPerson(follow);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].target?.id, '970001');
    assert.equal(result.events[0].reasonKey, 'upcomingVideoTitle');
    assert.equal((result.cursor.upcoming as unknown[]).length, 1);
  });
  it('preserves the prior cursor for retry when details are temporarily unavailable', async () => {
    const follow = await followFor();
    mock.method(
      ExternalAPI.prototype as unknown as {
        get: (...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (path: string) => {
        if (path.includes('combined_credits'))
          return {
            cast: [
              {
                id: 970001,
                media_type: 'movie',
                title: 'Fixture Film',
                adult: false,
                release_date: date(5),
              },
            ],
            crew: [],
          };
        throw new Error('temporary metadata outage');
      }
    );
    await assert.rejects(tmdbPerson(follow), /temporary metadata outage/);
    assert.equal(follow.cursor, null);
  });
});
