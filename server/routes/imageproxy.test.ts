import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { User } from '@server/entity/User';
import type { ImageResponse } from '@server/lib/imageproxy';
import ImageProxy, { IMAGE_PROXY_HTTP_OPTIONS } from '@server/lib/imageproxy';
import express from 'express';
import request from 'supertest';
import imageproxyRoutes, {
  IMAGE_PROXY_CACHE_MISS_LIMIT,
  IMAGE_PROXY_REQUEST_LIMIT,
  IMAGE_WARM_REQUEST_LIMIT,
} from './imageproxy';

const imageResponse: ImageResponse = {
  meta: {
    cacheKey: 'cache-key',
    cacheMiss: false,
    curRevalidate: 3600,
    etag: 'etag-value',
    extension: 'jpg',
    isStale: false,
    lastModified: Date.UTC(2026, 0, 1, 0, 0, 0),
    revalidateAfter: Date.UTC(2026, 0, 1, 1, 0, 0),
  },
  imageBuffer: Buffer.from('image-bytes'),
};

function createApp(authenticated = false) {
  const app = express();
  app.use(express.json());
  if (authenticated) {
    app.use((req, _res, next) => {
      req.user = {
        hasPermission: () => true,
      } as unknown as User;
      next();
    });
  }
  app.use('/imageproxy', imageproxyRoutes);
  return app;
}

afterEach(() => {
  mock.restoreAll();
});

describe('GET /imageproxy/:type/*path', () => {
  it('accepts supported artwork providers through the image cache', async () => {
    mock.method(
      ImageProxy.prototype,
      'getCachedImage',
      async () => imageResponse
    );

    for (const type of [
      'comicvine',
      'comicvinestatic',
      'comicvinestatic1',
      'hardcover',
      'igdb',
      'theaudiodb',
    ]) {
      const response = await request(createApp()).get(
        `/imageproxy/${type}/cover.jpg`
      );
      assert.equal(response.status, 200, type);
    }
  });
  it('bounds upstream image proxy waits', () => {
    assert.equal(IMAGE_PROXY_HTTP_OPTIONS.timeout, 10_000);
  });

  it('serves cache hits without entering the upstream fetch path', async () => {
    const getCachedImage = mock.method(
      ImageProxy.prototype,
      'getCachedImage',
      async () => imageResponse
    );
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => imageResponse
    );

    const res = await request(createApp()).get(
      '/imageproxy/tmdb/t/p/w300/cached-poster.jpg'
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers['os-cache-status'], 'HIT');
    assert.equal(
      Number(res.headers['ratelimit-limit']),
      IMAGE_PROXY_REQUEST_LIMIT
    );
    assert.equal(getCachedImage.mock.callCount(), 1);
    assert.equal(getImage.mock.callCount(), 0);
  });

  it('applies the upstream-fetch budget only after a cache miss', async () => {
    const cacheMissResponse: ImageResponse = {
      ...imageResponse,
      meta: { ...imageResponse.meta, cacheMiss: true },
    };
    const getCachedImage = mock.method(
      ImageProxy.prototype,
      'getCachedImage',
      async () => null
    );
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => cacheMissResponse
    );

    const res = await request(createApp()).get(
      '/imageproxy/tmdb/t/p/w300/uncached-poster.jpg'
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers['os-cache-status'], 'MISS');
    assert.equal(
      Number(res.headers['ratelimit-limit']),
      IMAGE_PROXY_CACHE_MISS_LIMIT
    );
    assert.equal(getCachedImage.mock.callCount(), 1);
    assert.equal(getImage.mock.callCount(), 1);
  });

  it('sends browser cache headers with proxied images', async () => {
    mock.method(ImageProxy.prototype, 'getImage', async () => imageResponse);

    const res = await request(createApp()).get(
      '/imageproxy/tmdb/t/p/w300/poster.jpg'
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers.etag, '"etag-value"');
    assert.equal(res.headers['last-modified'], 'Thu, 01 Jan 2026 00:00:00 GMT');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=2592000, stale-if-error=604800'
    );
    assert.equal(res.headers['os-cache-key'], 'cache-key');
    assert.equal(res.headers['os-cache-status'], 'HIT');
    assert.equal(res.body.toString(), 'image-bytes');
  });

  it('returns 304 with cache headers when the browser validator matches', async () => {
    mock.method(
      ImageProxy.prototype,
      'getCachedImage',
      async () => imageResponse
    );
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => imageResponse
    );

    const res = await request(createApp())
      .get('/imageproxy/tmdb/t/p/w300/poster.jpg')
      .set('If-None-Match', '"etag-value"');

    assert.equal(res.status, 304);
    assert.equal(res.headers.etag, '"etag-value"');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=2592000, stale-if-error=604800'
    );
    assert.equal(res.text, '');
    assert.equal(getImage.mock.callCount(), 0);
  });

  it('keeps query strings in the upstream cache key', async () => {
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => imageResponse
    );

    const res = await request(createApp()).get(
      '/imageproxy/tmdb/t/p/w300/poster.jpg?version=2&language=en'
    );

    assert.equal(res.status, 200);
    assert.equal(
      getImage.mock.calls[0].arguments[0],
      '/t/p/w300/poster.jpg?version=2&language=en'
    );
  });

  it('validates only the path segment when query strings contain URLs', async () => {
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => imageResponse
    );

    const res = await request(createApp()).get(
      '/imageproxy/tmdb/t/p/w300/poster.jpg?source=https%3A%2F%2Fexample.com%2Fposter.jpg'
    );

    assert.equal(res.status, 200);
    assert.equal(
      getImage.mock.calls[0].arguments[0],
      '/t/p/w300/poster.jpg?source=https%3A%2F%2Fexample.com%2Fposter.jpg'
    );
  });

  it('rejects oversized proxied image paths before cache lookup', async () => {
    const getCachedImage = mock.method(
      ImageProxy.prototype,
      'getCachedImage',
      async () => imageResponse
    );
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => imageResponse
    );

    const res = await request(createApp()).get(
      `/imageproxy/tmdb/t/p/w300/${'x'.repeat(2048)}.jpg`
    );

    assert.equal(res.status, 403);
    assert.match(res.text, /Invalid URL for image proxy/);
    assert.equal(getCachedImage.mock.callCount(), 0);
    assert.equal(getImage.mock.callCount(), 0);
  });

  it('rejects backslash paths before URL canonicalization', async () => {
    const getCachedImage = mock.method(
      ImageProxy.prototype,
      'getCachedImage',
      async () => imageResponse
    );
    const getImage = mock.method(
      ImageProxy.prototype,
      'getImage',
      async () => imageResponse
    );

    const res = await request(createApp()).get(
      '/imageproxy/tmdb/%5C%5Cexample.com/poster.jpg'
    );

    assert.equal(res.status, 403);
    assert.equal(getCachedImage.mock.callCount(), 0);
    assert.equal(getImage.mock.callCount(), 0);
  });

  it('supports HEAD requests with browser cache headers and no body', async () => {
    mock.method(ImageProxy.prototype, 'getImage', async () => imageResponse);

    const res = await request(createApp()).head(
      '/imageproxy/tmdb/t/p/w300/poster.jpg'
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.headers.etag, '"etag-value"');
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=3600, stale-while-revalidate=2592000, stale-if-error=604800'
    );
    assert.equal(res.text, undefined);
  });
});

describe('POST /imageproxy/warm', () => {
  it('rejects anonymous cache warming', async () => {
    const res = await request(createApp())
      .post('/imageproxy/warm')
      .send({ urls: ['https://image.tmdb.org/t/p/w300/poster.jpg'] });

    assert.equal(res.status, 403);
  });

  it('rejects malformed warm payloads', async () => {
    const missingUrls = await request(createApp(true))
      .post('/imageproxy/warm')
      .send({});
    const nonStringUrl = await request(createApp(true))
      .post('/imageproxy/warm')
      .send({ urls: ['https://image.tmdb.org/t/p/w300/poster.jpg', 123] });
    const oversizedUrl = await request(createApp(true))
      .post('/imageproxy/warm')
      .send({ urls: [`https://${'x'.repeat(2042)}`] });

    assert.equal(missingUrls.status, 400);
    assert.match(missingUrls.body.error, /urls must be an array/);
    assert.equal(nonStringUrl.status, 400);
    assert.match(nonStringUrl.body.error, /urls must contain strings/);
    assert.equal(oversizedUrl.status, 400);
    assert.match(oversizedUrl.body.error, /2048 characters/);
  });

  it('rejects oversized warm URL batches', async () => {
    const res = await request(createApp(true))
      .post('/imageproxy/warm')
      .send({
        urls: Array.from({ length: 101 }, () => 'https://example.com/a.jpg'),
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /100 values/);
  });

  it('accepts bounded warm URL batches', async () => {
    const res = await request(createApp(true))
      .post('/imageproxy/warm')
      .send({ urls: ['https://image.tmdb.org/t/p/w300/poster.jpg'] });

    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { accepted: true });
    assert.equal(
      Number(res.headers['ratelimit-limit']),
      IMAGE_WARM_REQUEST_LIMIT
    );
  });
});
