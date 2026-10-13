import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { MediaServerType } from '@server/constants/server';
import { UserType } from '@server/constants/user';
import * as datasource from '@server/datasource';
import { User } from '@server/entity/User';
import type { ImageResponse } from '@server/lib/imageproxy';
import ImageProxy from '@server/lib/imageproxy';
import * as localAvatar from '@server/lib/localAvatar';
import { getSettings } from '@server/lib/settings';
import express from 'express';
import request from 'supertest';
import avatarproxyRoutes, {
  checkAvatarChanged,
  getAvatarImageProxySettingsKey,
} from './avatarproxy';

const avatarResponse: ImageResponse = {
  meta: {
    cacheKey: 'avatar-cache-key',
    cacheMiss: false,
    curRevalidate: 3600,
    etag: 'avatar-etag',
    extension: 'jpg',
    isStale: false,
    lastModified: Date.UTC(2026, 0, 1, 0, 0, 0),
    revalidateAfter: Date.UTC(2026, 0, 1, 1, 0, 0),
  },
  imageBuffer: Buffer.from('avatar-bytes'),
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/avatarproxy', avatarproxyRoutes);
  return app;
}

function mockAvatarDependencies(
  onGetImage?: (proxy: ImageProxy, path: string) => Promise<ImageResponse>
) {
  mock.method(datasource, 'getRepository', () => ({
    findOne: async (options?: { where?: Record<string, unknown> }) => {
      if (options?.where?.id === 1) {
        return {
          id: 1,
          jellyfinDeviceId: 'device-id',
          jellyfinUserId: 'admin-jellyfin-id',
        };
      }

      if (options?.where?.jellyfinUserId) {
        return {
          avatarVersion: 'version-1',
          email: 'user@example.com',
        };
      }

      return null;
    },
  }));
  const getCachedImageMock = mock.method(
    ImageProxy.prototype,
    'getCachedImage',
    async () => null
  );
  const getImageMock = mock.method(
    ImageProxy.prototype,
    'getImage',
    async function (this: ImageProxy, path: string) {
      return onGetImage ? onGetImage(this, path) : avatarResponse;
    }
  );

  return { getCachedImageMock, getImageMock };
}

afterEach(() => {
  mock.restoreAll();
});

describe('checkAvatarChanged', () => {
  it('persists only avatar cache metadata after external work', async () => {
    const updates: Record<string, unknown>[] = [];
    mock.method(datasource, 'getRepository', () => ({
      findOne: async () => ({
        id: 1,
        jellyfinDeviceId: 'device-id',
        jellyfinUserId: 'admin-jellyfin-id',
      }),
      update: async (_id: number, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { affected: 1 };
      },
    }));
    mock.method(
      ImageProxy.prototype,
      'clearCachedImage',
      async () => undefined
    );
    mock.method(ImageProxy.prototype, 'getImage', async () => avatarResponse);
    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.JELLYFIN;
    settings.jellyfin.ip = 'jellyfin.example.com';
    settings.jellyfin.apiKey = 'avatar-api-key';
    const user = new User({
      id: 2,
      email: 'friend@seerr.dev',
      avatar: 'previous-avatar',
      avatarETag: 'previous-etag',
      avatarVersion: 'previous-version',
      jellyfinUserId: '0123456789abcdef0123456789abcdef',
      permissions: 123,
    });

    const result = await checkAvatarChanged(user);

    assert.strictEqual(result.changed, true);
    assert.strictEqual(updates.length, 1);
    assert.deepEqual(Object.keys(updates[0]).sort(), [
      'avatarETag',
      'avatarVersion',
    ]);
    assert.ok(!('permissions' in updates[0]));
    assert.ok(!('email' in updates[0]));
  });
});

describe('GET /avatarproxy/remote', () => {
  it('never sends media-server authorization to public avatar providers', async () => {
    const authorizationHeaders: unknown[] = [];
    mockAvatarDependencies(async (proxy) => {
      const headers = (
        proxy as unknown as {
          axios: { defaults: { headers: Record<string, unknown> } };
        }
      ).axios.defaults.headers;
      authorizationHeaders.push(
        headers.Authorization ?? headers['X-Emby-Authorization']
      );
      return avatarResponse;
    });

    const res = await request(createApp()).get(
      '/avatarproxy/remote?url=https%3A%2F%2Fsecure.gravatar.com%2Favatar%2Fabc'
    );

    assert.equal(res.status, 200);
    assert.deepEqual(authorizationHeaders, [undefined]);
  });

  it('sends browser cache headers for allowlisted remote avatars', async () => {
    mockAvatarDependencies();

    const res = await request(createApp()).get(
      '/avatarproxy/remote?url=https%3A%2F%2Fsecure.gravatar.com%2Favatar%2Fabc%3Fd%3Dmm'
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers.etag, '"avatar-etag"');
    assert.equal(res.headers['last-modified'], 'Thu, 01 Jan 2026 00:00:00 GMT');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=2592000, stale-if-error=604800'
    );
    assert.equal(res.headers['os-cache-key'], 'avatar-cache-key');
    assert.equal(res.headers['os-cache-status'], 'HIT');
    assert.equal(res.body.toString(), 'avatar-bytes');
  });

  it('keeps the client default visible while refreshing Plex avatars', async () => {
    const { getCachedImageMock, getImageMock } = mockAvatarDependencies();
    const avatarUrl = 'https://plex.tv/users/abc/avatar?c=123';

    const res = await request(createApp())
      .get('/avatarproxy/remote')
      .query({ url: avatarUrl });

    assert.equal(res.status, 204);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(getCachedImageMock.mock.callCount(), 1);
    assert.equal(getCachedImageMock.mock.calls[0].arguments[0], avatarUrl);
    assert.equal(getImageMock.mock.callCount(), 1);
    assert.equal(getImageMock.mock.calls[0].arguments[0], avatarUrl);
  });

  it('returns 304 with cache headers when the browser validator matches', async () => {
    mockAvatarDependencies();

    const res = await request(createApp())
      .get(
        '/avatarproxy/remote?url=https%3A%2F%2Fsecure.gravatar.com%2Favatar%2Fabc%3Fd%3Dmm'
      )
      .set('If-None-Match', '"avatar-etag"');

    assert.equal(res.status, 304);
    assert.equal(res.headers.etag, '"avatar-etag"');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=2592000, stale-if-error=604800'
    );
  });

  it('rejects unsupported remote avatar URLs without caching them', async () => {
    mockAvatarDependencies();

    const res = await request(createApp()).get(
      '/avatarproxy/remote?url=https%3A%2F%2Fexample.com%2Favatar.png'
    );

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Unsupported avatar URL' });
  });

  it('rejects duplicate remote avatar URL query params', async () => {
    mockAvatarDependencies();

    const res = await request(createApp())
      .get('/avatarproxy/remote')
      .query({
        url: [
          'https://secure.gravatar.com/avatar/abc?d=mm',
          'https://secure.gravatar.com/avatar/def?d=mm',
        ],
      });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Avatar URL must be a string' });
  });

  it('rejects oversized allowlisted remote avatar URLs before cache lookup', async () => {
    const { getCachedImageMock, getImageMock } = mockAvatarDependencies();

    const res = await request(createApp())
      .get('/avatarproxy/remote')
      .query({ url: `https://plex.tv/${'x'.repeat(2048)}` });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Unsupported avatar URL' });
    assert.equal(getCachedImageMock.mock.callCount(), 0);
    assert.equal(getImageMock.mock.callCount(), 0);
  });

  it('supports HEAD requests with browser cache headers and no body', async () => {
    mockAvatarDependencies();

    const res = await request(createApp()).head(
      '/avatarproxy/remote?url=https%3A%2F%2Fsecure.gravatar.com%2Favatar%2Fabc%3Fd%3Dmm'
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.headers.etag, '"avatar-etag"');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=2592000, stale-if-error=604800'
    );
    assert.equal(res.text, undefined);
  });

  it('does not expose upstream failure details', async () => {
    mockAvatarDependencies(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:32400');
    });

    const res = await request(createApp()).get(
      '/avatarproxy/remote?url=https%3A%2F%2Fsecure.gravatar.com%2Favatar%2Fabc'
    );

    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { error: 'Unable to load avatar image.' });
    assert.doesNotMatch(JSON.stringify(res.body), /10\.0\.0\.5|ECONNREFUSED/);
  });
});

describe('GET /avatarproxy/local/:userId', () => {
  it('serves the current version with immutable browser caching', async () => {
    const version = 'a'.repeat(64);
    mock.method(datasource, 'getRepository', () => ({
      findOne: async () => ({
        id: 7,
        avatarVersion: version,
        userType: UserType.LOCAL,
      }),
    }));
    mock.method(localAvatar, 'readLocalAvatar', async () =>
      Buffer.from('local-avatar')
    );

    const response = await request(createApp()).get(
      `/avatarproxy/local/7?v=${version}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'image/webp');
    assert.equal(
      response.headers['cache-control'],
      'public, max-age=31536000, immutable'
    );
    assert.equal(response.headers.etag, `"${version}"`);
    assert.equal(response.body.toString(), 'local-avatar');
  });

  it('does not serve an older version after the profile picture changes', async () => {
    const currentVersion = 'b'.repeat(64);
    const readAvatar = mock.method(localAvatar, 'readLocalAvatar', async () =>
      Buffer.from('local-avatar')
    );
    mock.method(datasource, 'getRepository', () => ({
      findOne: async () => ({
        id: 7,
        avatarVersion: currentVersion,
        userType: UserType.LOCAL,
      }),
    }));

    const response = await request(createApp()).get(
      `/avatarproxy/local/7?v=${'c'.repeat(64)}`
    );

    assert.equal(response.status, 404);
    assert.equal(readAvatar.mock.callCount(), 0);
  });
});

describe('GET /avatarproxy/:jellyfinUserId', () => {
  it('rotates authenticated proxies when media-server credentials change', async () => {
    const settings = getSettings();
    const originalApiKey = settings.jellyfin.apiKey;
    const originalMediaServerType = settings.main.mediaServerType;
    const authorizationHeaders: string[] = [];
    mockAvatarDependencies(async (proxy) => {
      const headers = (
        proxy as unknown as {
          axios: { defaults: { headers: Record<string, unknown> } };
        }
      ).axios.defaults.headers;
      authorizationHeaders.push(String(headers.Authorization));
      return avatarResponse;
    });

    try {
      settings.main.mediaServerType = MediaServerType.JELLYFIN;
      settings.jellyfin.apiKey = 'first-avatar-token';
      const firstSettingsKey = getAvatarImageProxySettingsKey();
      const first = await request(createApp()).get(
        '/avatarproxy/0123456789abcdef0123456789abcdef'
      );
      settings.jellyfin.apiKey = 'second-avatar-token';
      const secondSettingsKey = getAvatarImageProxySettingsKey();
      const second = await request(createApp()).get(
        '/avatarproxy/0123456789abcdef0123456789abcdef'
      );

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.notEqual(firstSettingsKey, secondSettingsKey);
      assert.doesNotMatch(firstSettingsKey, /first-avatar-token/);
      assert.match(authorizationHeaders[0], /first-avatar-token/);
      assert.match(authorizationHeaders[1], /second-avatar-token/);
    } finally {
      settings.jellyfin.apiKey = originalApiKey;
      settings.main.mediaServerType = originalMediaServerType;
    }
  });

  it('keeps Emby authorization on private avatar reads', async () => {
    const settings = getSettings();
    const originalApiKey = settings.jellyfin.apiKey;
    const originalMediaServerType = settings.main.mediaServerType;
    let headers: Record<string, unknown> | undefined;
    mockAvatarDependencies(async (proxy) => {
      headers = (
        proxy as unknown as {
          axios: { defaults: { headers: Record<string, unknown> } };
        }
      ).axios.defaults.headers;
      return avatarResponse;
    });

    try {
      settings.main.mediaServerType = MediaServerType.EMBY;
      settings.jellyfin.apiKey = 'emby-avatar-token';
      const response = await request(createApp()).get(
        '/avatarproxy/0123456789abcdef0123456789abcdef'
      );

      assert.equal(response.status, 200);
      assert.equal(headers?.Authorization, undefined);
      assert.match(
        String(headers?.['X-Emby-Authorization']),
        /Token="emby-avatar-token"/
      );
    } finally {
      settings.jellyfin.apiKey = originalApiKey;
      settings.main.mediaServerType = originalMediaServerType;
    }
  });

  it('uses an unauthenticated proxy when a media-server avatar falls back', async () => {
    const calls: { authorization: unknown; path: string }[] = [];
    mockAvatarDependencies(async (proxy, path) => {
      const headers = (
        proxy as unknown as {
          axios: { defaults: { headers: Record<string, unknown> } };
        }
      ).axios.defaults.headers;
      const authorization =
        headers.Authorization ?? headers['X-Emby-Authorization'];
      calls.push({ authorization, path });
      if (authorization) {
        throw new Error('media-server avatar unavailable');
      }
      return avatarResponse;
    });

    const res = await request(createApp()).get(
      '/avatarproxy/0123456789abcdef0123456789abcdef'
    );

    assert.equal(res.status, 200);
    assert.equal(typeof calls[0].authorization, 'string');
    assert.match(calls[0].path, /Images\/Primary|UserImage/);
    assert.equal(calls[1].authorization, undefined);
    assert.match(calls[1].path, /^https:\/\/(?:www\.)?gravatar\.com\//);
  });

  it('rejects malformed Jellyfin user IDs before cache lookup', async () => {
    const getImageMock = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => avatarResponse
    );

    const res = await request(createApp()).get('/avatarproxy/not-a-guid');

    assert.equal(res.status, 400);
    assert.match(res.body.error, /avatar/);
    assert.equal(getImageMock.mock.callCount(), 0);
  });

  it('rejects oversized avatar version parameters', async () => {
    mockAvatarDependencies();

    const res = await request(createApp())
      .get('/avatarproxy/0123456789abcdef0123456789abcdef')
      .query({ v: 'x'.repeat(129) });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Avatar version must be 128 characters/);
  });

  it('uses immutable browser caching for versioned avatar URLs', async () => {
    mockAvatarDependencies();

    const res = await request(createApp())
      .get('/avatarproxy/0123456789abcdef0123456789abcdef?v=version-1')
      .set('If-None-Match', '"avatar-etag"');

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"avatar-etag"');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=2592000, stale-while-revalidate=2592000, stale-if-error=604800, immutable'
    );
    assert.equal(res.body.toString(), 'avatar-bytes');
  });

  it('does not expose media-server or fallback failure details', async () => {
    mockAvatarDependencies(async () => {
      throw new Error('request failed for http://192.168.1.40:8096/private');
    });

    const res = await request(createApp()).get(
      '/avatarproxy/0123456789abcdef0123456789abcdef'
    );

    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { error: 'Unable to load avatar image.' });
    assert.doesNotMatch(JSON.stringify(res.body), /192\.168\.1\.40|private/);
  });
});
