import cacheManager from '@server/lib/cache';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import GithubAPI, {
  sanitizeGithubCommits,
  sanitizeGithubReleases,
} from '@server/api/github';

describe('GitHub update response normalization', () => {
  it('caps releases and exposes only bounded names', () => {
    const releases = sanitizeGithubReleases(
      [
        null,
        { name: {} },
        ...Array.from({ length: 150 }, (_, index) => ({
          name: `Release ${index}`,
          tag_name: `v3.0.${index}`,
          prerelease: false,
          draft: false,
          body: 'provider-only',
        })),
      ],
      500
    );

    assert.strictEqual(releases.length, 98);
    assert.deepStrictEqual(releases[0], {
      name: 'Release 0',
      tag_name: 'v3.0.0',
      prerelease: false,
      draft: false,
    });
  });

  it('caps commits and drops malformed nested commit data', () => {
    const commits = sanitizeGithubCommits(
      [
        null,
        { sha: 'bad', commit: null },
        ...Array.from({ length: 150 }, (_, index) => ({
          sha: `sha-${index}`,
          commit: { message: `Commit ${index}`, verification: 'provider-only' },
          parents: ['provider-only'],
        })),
      ],
      500
    );

    assert.strictEqual(commits.length, 98);
    assert.deepStrictEqual(commits[0], {
      sha: 'sha-0',
      commit: { message: 'Commit 0' },
    });
  });
});

afterEach(() => {
  mock.restoreAll();
  cacheManager.getCache('github').data.flushAll();
});

describe('GitHub version-check request behavior', () => {
  it('suppresses repeated outages and caches successful checks across callers', async () => {
    cacheManager.getCache('github').data.flushAll();
    const api = new GithubAPI();
    let failure = true;
    const client = (
      api as unknown as {
        axios: { get: (...args: unknown[]) => Promise<unknown> };
      }
    ).axios;
    const upstream = mock.method(client, 'get', async () => {
      if (failure) throw new Error('Fixture outage');
      return {
        data: [
          {
            name: 'Release',
            tag_name: 'v3.0.0',
            draft: false,
            prerelease: false,
          },
        ],
      };
    });
    assert.deepEqual(await api.getSeerrReleases(), []);
    assert.deepEqual(await api.getSeerrReleases(), []);
    assert.equal(upstream.mock.callCount(), 1);
    const cache = cacheManager.getCache('github').data;
    const failedTtl = cache.getTtl(cache.keys()[0])! - Date.now();
    assert.ok(failedTtl > 0 && failedTtl <= 5 * 60 * 1000);
    cache.flushAll();
    failure = false;
    assert.equal((await api.getSeerrReleases()).length, 1);
    assert.equal((await api.getSeerrReleases()).length, 1);
    assert.equal(upstream.mock.callCount(), 2);
    assert.ok(cache.getTtl(cache.keys()[0])! - Date.now() > 5 * 60 * 60 * 1000);
  });

  it('sends the requested branch as sha and keeps branch cache entries separate', async () => {
    const api = new GithubAPI();
    const client = (
      api as unknown as {
        axios: { get: (...args: unknown[]) => Promise<unknown> };
      }
    ).axios;
    const upstream = mock.method(
      client,
      'get',
      async (_url: unknown, config: unknown) => {
        const params = (config as { params: { sha: string; branch?: string } })
          .params;
        assert.equal(params.branch, undefined);
        assert.ok(['development', 'main'].includes(params.sha));
        return { data: [{ sha: params.sha, commit: { message: params.sha } }] };
      }
    );
    assert.equal(
      (await api.getSeerrCommits({ branch: 'development' }))[0].sha,
      'development'
    );
    assert.equal(
      (await api.getSeerrCommits({ branch: 'main' }))[0].sha,
      'main'
    );
    assert.equal(
      (await api.getSeerrCommits({ branch: 'development' }))[0].sha,
      'development'
    );
    assert.equal(upstream.mock.callCount(), 2);
  });
});
