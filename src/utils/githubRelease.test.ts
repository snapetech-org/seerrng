import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_GITHUB_RELEASE_BODY_LENGTH,
  MAX_GITHUB_RELEASES,
  sanitizeGithubReleaseResponse,
} from './githubRelease';

describe('GitHub release response normalization', () => {
  it('returns bounded fields and uses stable provider fallbacks', () => {
    const releases = sanitizeGithubReleaseResponse([
      {
        id: 1,
        name: null,
        tag_name: 'v1.0.0',
        created_at: null,
        published_at: '2026-07-17T00:00:00.000Z',
        html_url:
          'HTTPS://GITHUB.COM/snapetech-org/seerrng/releases/tag/v1.0.0',
        body: 'x'.repeat(MAX_GITHUB_RELEASE_BODY_LENGTH + 1),
        assets: ['provider-only'],
      },
    ]);

    assert.deepStrictEqual(releases[0], {
      id: 1,
      name: 'v1.0.0',
      created_at: '2026-07-17T00:00:00.000Z',
      html_url: 'https://github.com/snapetech-org/seerrng/releases/tag/v1.0.0',
      body: 'x'.repeat(MAX_GITHUB_RELEASE_BODY_LENGTH),
    });
  });

  it('caps rows and drops malformed or off-site releases', () => {
    const releases = sanitizeGithubReleaseResponse([
      null,
      {
        id: 1,
        name: 'Redirected',
        created_at: '2026-07-17T00:00:00.000Z',
        html_url: 'https://attacker.example/release',
      },
      ...Array.from({ length: MAX_GITHUB_RELEASES + 5 }, (_, index) => ({
        id: index + 2,
        name: `Release ${index}`,
        created_at: '2026-07-17T00:00:00.000Z',
        html_url: `https://github.com/snapetech-org/seerrng/releases/tag/${index}`,
        body: null,
      })),
    ]);

    assert.strictEqual(releases.length, MAX_GITHUB_RELEASES - 2);
    assert.strictEqual(releases[0].name, 'Release 0');
    assert.strictEqual(releases[0].body, '');
    assert.deepStrictEqual(sanitizeGithubReleaseResponse({}), []);
  });
});
