import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';

import ImageProxy, {
  ImageDiskCacheBudget,
  LRU_ITEM_MAX_BYTES,
  MAX_IMAGE_CACHE_MAX_AGE,
  MAX_IMAGE_PIXELS,
  MAX_PENDING_IMAGE_CACHE_WRITES,
  PRIVATE_IMAGE_CACHE_DIRECTORY_MODE,
  PRIVATE_IMAGE_CACHE_FILE_MODE,
  assertRasterPixelBudget,
  coalesceImageCacheWrite,
  getBoundedDirectorySize,
  getImageCacheLastModified,
  getImageResponseContentType,
  getSafeRasterContentType,
  parseCacheControlMaxAge,
  parseImageCacheFileMetadata,
  prepareRasterImageForCache,
  pruneStaleImageCacheEntries,
  readPrivateImageCacheFile,
  resolveImageRequestUrl,
  sendImage,
  writePrivateImageCacheFile,
} from './imageproxy';

const temporaryDirectories: string[] = [];
// Windows without Developer Mode cannot create the symbolic links exercised by
// these POSIX filesystem-boundary tests, and it does not expose POSIX chmod
// modes. Linux CI still runs every one of them.
const posixIt = process.platform === 'win32' ? it.skip : it;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true }))
  );
});

describe('coalesceImageCacheWrite', () => {
  it('shares concurrent work for the same cache key', async () => {
    let writes = 0;
    let finishWrite: () => void = () => undefined;
    const mayFinish = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const write = async () => {
      writes += 1;
      await mayFinish;
      return null;
    };

    const first = coalesceImageCacheWrite('same-key', write);
    const second = coalesceImageCacheWrite('same-key', write);

    await Promise.resolve();
    assert.equal(writes, 1);
    assert.equal(first, second);
    finishWrite();
    await Promise.all([first, second]);
  });

  it('allows retry after a failed cache write', async () => {
    await assert.rejects(
      coalesceImageCacheWrite('failed-key', async () => {
        throw new Error('write failed');
      }),
      /write failed/
    );

    assert.equal(
      await coalesceImageCacheWrite('failed-key', async () => null),
      null
    );
  });

  it('bounds unique pending writes while retaining same-key coalescing', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const write = async () => {
      writes += 1;
      await held;
      return null;
    };
    const admitted = Array.from(
      { length: MAX_PENDING_IMAGE_CACHE_WRITES },
      (_, index) => coalesceImageCacheWrite(`held-${index}`, write)
    );
    const coalesced = coalesceImageCacheWrite('held-0', write);
    const rejected = coalesceImageCacheWrite('over-capacity', write);

    assert.strictEqual(writes, 0);
    await assert.rejects(rejected, /write capacity exceeded/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(writes, MAX_PENDING_IMAGE_CACHE_WRITES);

    release();
    await Promise.all([...admitted, coalesced]);
    assert.strictEqual(
      await coalesceImageCacheWrite('after-drain', async () => null),
      null
    );
  });
});

describe('ImageProxy cache scoping', () => {
  it('isolates identical image paths across configuration scopes', () => {
    const first = new ImageProxy('avatar', 'http://media.local', {
      cacheKeyScope: 'first-config-digest',
    });
    const second = new ImageProxy('avatar', 'http://media.local', {
      cacheKeyScope: 'second-config-digest',
    });
    const getCacheKey = (proxy: ImageProxy) =>
      (
        proxy as unknown as { getCacheKey: (path: string) => string }
      ).getCacheKey('/Users/abc/Images/Primary');

    assert.notEqual(getCacheKey(first), getCacheKey(second));
    assert.doesNotMatch(getCacheKey(first), /first-config-digest/);
  });
});

describe('resolveImageRequestUrl', () => {
  it('keeps image paths on the configured provider origin', () => {
    const base = 'https://images.example.com';
    assert.equal(
      resolveImageRequestUrl('/poster.jpg', base),
      base + '/poster.jpg'
    );
    assert.throws(
      () =>
        resolveImageRequestUrl('https://other.example.com/poster.jpg', base),
      /Image URL is invalid/
    );
  });

  it('accepts an absolute remote image URL without a configured base URL', () => {
    assert.equal(
      resolveImageRequestUrl('https://plex.tv/users/example/avatar?c=123', ''),
      'https://plex.tv/users/example/avatar?c=123'
    );
  });

  it('rejects a relative image path without a configured base URL', () => {
    assert.throws(
      () => resolveImageRequestUrl('/users/example/avatar', ''),
      /Image URL is invalid/
    );
  });
});

describe('writePrivateImageCacheFile', () => {
  posixIt('creates private cache directories and files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-images-'));
    temporaryDirectories.push(root);
    const directory = path.join(root, 'provider', 'cache-key');

    const filePath = await writePrivateImageCacheFile(
      directory,
      '60.120.etag.webp',
      Buffer.from('image')
    );

    assert.equal(
      (await fs.stat(path.dirname(directory))).mode & 0o777,
      PRIVATE_IMAGE_CACHE_DIRECTORY_MODE
    );
    assert.equal(
      (await fs.stat(directory)).mode & 0o777,
      PRIVATE_IMAGE_CACHE_DIRECTORY_MODE
    );
    assert.equal(
      (await fs.stat(filePath)).mode & 0o777,
      PRIVATE_IMAGE_CACHE_FILE_MODE
    );
  });

  posixIt(
    'rejects a symlinked cache directory without modifying its target',
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-images-'));
      temporaryDirectories.push(root);
      const target = path.join(root, 'unrelated');
      const directory = path.join(root, 'cache-key');
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, 'keep'), 'unchanged');
      await fs.symlink(target, directory);

      await assert.rejects(
        writePrivateImageCacheFile(directory, 'image.webp', Buffer.from('new')),
        /not a directory/
      );
      assert.equal(
        await fs.readFile(path.join(target, 'keep'), 'utf8'),
        'unchanged'
      );
    }
  );

  posixIt('rejects symlinks above the direct cache directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-images-'));
    temporaryDirectories.push(root);
    const targetRoot = path.join(root, 'target');
    const targetDirectory = path.join(targetRoot, 'provider');
    const linkedRoot = path.join(root, 'linked');
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.symlink(targetRoot, linkedRoot);

    await assert.rejects(
      writePrivateImageCacheFile(
        path.join(linkedRoot, 'provider', 'cache-key'),
        '60.120.etag.webp',
        Buffer.from('image')
      ),
      /symlink/i
    );
    assert.deepEqual(await fs.readdir(targetDirectory), []);
  });
});

describe('sendImage disk boundaries', () => {
  const createResponse = () => {
    let statusCode: number | undefined;
    let ended = false;
    const response = {
      status(code: number) {
        statusCode = code;
        return response;
      },
      end() {
        ended = true;
        return response;
      },
    } as unknown as Parameters<typeof sendImage>[0];
    return {
      response,
      get statusCode() {
        return statusCode;
      },
      get ended() {
        return ended;
      },
    };
  };

  posixIt(
    'rejects symlinked and hard-linked cache files at open time',
    async () => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), 'seerr-send-image-')
      );
      temporaryDirectories.push(root);
      const target = path.join(root, 'target.webp');
      const symlink = path.join(root, 'symlink.webp');
      const hardlink = path.join(root, 'hardlink.webp');
      await fs.writeFile(target, 'private');
      await fs.symlink(target, symlink);
      await fs.link(target, hardlink);

      for (const filePath of [symlink, hardlink]) {
        const result = createResponse();
        await sendImage(
          result.response,
          {
            filePath,
            meta: {
              revalidateAfter: 0,
              curRevalidate: 0,
              isStale: false,
              etag: 'etag',
              extension: 'webp',
              cacheKey: 'cache-key',
              cacheMiss: false,
              lastModified: 0,
            },
          },
          {}
        );
        assert.strictEqual(result.statusCode, 500);
        assert.strictEqual(result.ended, true);
      }
    }
  );

  it('does not release a disk response before the stream finishes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-send-image-'));
    temporaryDirectories.push(root);
    const filePath = path.join(root, 'image.webp');
    await fs.writeFile(filePath, 'private-image');
    const chunks: Buffer[] = [];
    const response = new Writable({
      write(chunk, _encoding, callback) {
        setImmediate(() => {
          chunks.push(Buffer.from(chunk));
          callback();
        });
      },
    }) as Writable & {
      headersSent: boolean;
      writeHead: (status: number, headers: Record<string, unknown>) => void;
    };
    response.headersSent = false;
    response.writeHead = () => {
      response.headersSent = true;
    };

    await sendImage(
      response as unknown as Parameters<typeof sendImage>[0],
      {
        filePath,
        meta: {
          revalidateAfter: 0,
          curRevalidate: 0,
          isStale: false,
          etag: 'etag',
          extension: 'webp',
          cacheKey: 'cache-key',
          cacheMiss: false,
          lastModified: 0,
        },
      },
      {}
    );

    assert.strictEqual(response.writableFinished, true);
    assert.strictEqual(Buffer.concat(chunks).toString(), 'private-image');
  });
});

describe('readPrivateImageCacheFile', () => {
  it('reads regular files through a bounded no-follow descriptor', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-read-image-'));
    temporaryDirectories.push(root);
    const filePath = path.join(root, 'image.webp');
    await fs.writeFile(filePath, 'image');

    assert.equal(
      (await readPrivateImageCacheFile(filePath)).toString(),
      'image'
    );
    await assert.rejects(
      readPrivateImageCacheFile(filePath, 4),
      /in-memory read limit/
    );
  });

  posixIt('rejects symlinked and hard-linked cache files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-read-image-'));
    temporaryDirectories.push(root);
    const target = path.join(root, 'target.webp');
    const symlink = path.join(root, 'symlink.webp');
    const hardlink = path.join(root, 'hardlink.webp');
    await fs.writeFile(target, 'private');
    await fs.symlink(target, symlink);
    await fs.link(target, hardlink);

    await assert.rejects(readPrivateImageCacheFile(symlink), {
      code: 'ELOOP',
    });
    await assert.rejects(
      readPrivateImageCacheFile(hardlink),
      /private regular file/
    );
  });
});

describe('getBoundedDirectorySize', () => {
  posixIt('walks nested files without following symlinks', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-stats-'));
    temporaryDirectories.push(root);
    await fs.mkdir(path.join(root, 'provider', 'first'), { recursive: true });
    await fs.mkdir(path.join(root, 'provider', 'second'), { recursive: true });
    await fs.writeFile(path.join(root, 'provider', 'first', 'image'), '1234');
    await fs.writeFile(path.join(root, 'provider', 'second', 'image'), '12');
    await fs.symlink(
      path.join(root, 'provider', 'first'),
      path.join(root, 'provider', 'linked')
    );

    assert.equal(await getBoundedDirectorySize(root), 6);
  });

  it('rejects filesystem trees beyond the inspection budget', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-stats-'));
    temporaryDirectories.push(root);
    await fs.writeFile(path.join(root, 'first'), '1');
    await fs.writeFile(path.join(root, 'second'), '2');

    await assert.rejects(getBoundedDirectorySize(root, 1), /entry limit/);
  });
});

describe('ImageDiskCacheBudget', () => {
  it('evicts the oldest entries before exceeding byte and entry limits', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-budget-'));
    temporaryDirectories.push(root);
    const budget = new ImageDiskCacheBudget(root, 8, 2);
    const first = path.join(root, 'provider', 'first');
    const second = path.join(root, 'provider', 'second');
    const third = path.join(root, 'provider', 'third');

    await budget.write(first, 'image.webp', Buffer.from('1111'));
    await budget.write(second, 'image.webp', Buffer.from('2222'));
    await budget.write(third, 'image.webp', Buffer.from('3333'));

    await assert.rejects(fs.stat(first), { code: 'ENOENT' });
    assert.equal((await fs.stat(second)).isDirectory(), true);
    assert.equal((await fs.stat(third)).isDirectory(), true);
  });

  it('rejects a single entry larger than the total disk budget', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-budget-'));
    temporaryDirectories.push(root);
    const budget = new ImageDiskCacheBudget(root, 4, 2);

    await assert.rejects(
      budget.write(
        path.join(root, 'provider', 'oversized'),
        'image.webp',
        Buffer.from('12345')
      ),
      /capacity/
    );
  });

  it('serializes stale pruning and rebuilds its disk index', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-budget-'));
    temporaryDirectories.push(root);
    const budget = new ImageDiskCacheBudget(root, 16, 2);
    const provider = path.join(root, 'provider');
    const stale = path.join(provider, 'stale');
    const fresh = path.join(provider, 'fresh');

    await budget.write(stale, '60.1.etag.webp', Buffer.from('old'));
    assert.equal(await budget.pruneStale(provider), 1);
    await assert.rejects(fs.stat(stale), { code: 'ENOENT' });

    await budget.write(
      fresh,
      `60.${Date.now() + 60_000}.etag.webp`,
      Buffer.from('new')
    );
    assert.equal((await fs.stat(fresh)).isDirectory(), true);
  });

  it('rejects hard-linked files while indexing the cache', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-budget-'));
    temporaryDirectories.push(root);
    const target = path.join(root, 'outside-image');
    const entry = path.join(root, 'provider', 'existing');
    await fs.mkdir(entry, { recursive: true });
    await fs.writeFile(target, 'outside');
    await fs.link(target, path.join(entry, '60.120.etag.webp'));
    const budget = new ImageDiskCacheBudget(root, 100, 10);

    await assert.rejects(
      budget.write(
        path.join(root, 'provider', 'new'),
        'image.webp',
        Buffer.from('new')
      ),
      /hard-linked/
    );
    assert.equal(await fs.readFile(target, 'utf8'), 'outside');
  });
});

describe('fetchAndCache disk persistence for large images', () => {
  it('persists an image larger than the in-memory threshold to disk and serves it from disk on the next request', async () => {
    const key = `test-large-image-${crypto.randomUUID()}`;
    const imagePath = '/large-image.gif';
    const proxy = new ImageProxy(key, 'http://media.local', {
      allowPrivateAddresses: true,
    });

    try {
      const baseGif = await sharp({
        create: {
          width: 4,
          height: 4,
          channels: 3,
          background: { r: 10, g: 20, b: 30 },
        },
      })
        .gif()
        .toBuffer();
      // GIF decoders stop at the trailer byte, so appended padding inflates
      // the file past the in-memory threshold without touching the image
      // sharp actually decodes for metadata validation.
      const largeGif = Buffer.concat([
        baseGif,
        Buffer.alloc(LRU_ITEM_MAX_BYTES, 1),
      ]);
      assert.ok(largeGif.length > LRU_ITEM_MAX_BYTES);

      const axiosGetMock = mock.method(
        (proxy as unknown as { axios: AxiosInstance }).axios,
        'get',
        async () => ({
          data: largeGif,
          headers: { 'content-type': 'image/gif' },
        })
      );

      const first = await proxy.getImage(imagePath);
      assert.equal(axiosGetMock.mock.callCount(), 1);
      assert.equal(first.imageBuffer?.length, largeGif.length);

      // The second request must be served from the disk cache the first
      // request wrote, not re-fetched from the upstream provider.
      const second = await proxy.getImage(imagePath);
      assert.equal(axiosGetMock.mock.callCount(), 1);
      assert.ok(
        second.filePath,
        'expected the second response to stream from disk'
      );
      const diskBytes = await readPrivateImageCacheFile(
        second.filePath as string,
        largeGif.length
      );
      assert.equal(diskBytes.length, largeGif.length);
    } finally {
      await proxy.clearCachedImage(imagePath);
      // clearCachedImage removes the entry, then refresh the shared budget
      // index so this test does not leave a phantom disk-cache allocation.
      await ImageProxy.clearCache(key);
    }
  });
});

describe('prepareRasterImageForCache', () => {
  it('validates and transcodes supported raster images', async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    const prepared = await prepareRasterImageForCache(png, 'image/png');

    assert.equal(prepared.extension, 'webp');
    assert.equal((await sharp(prepared.buffer).metadata()).format, 'webp');
  });

  it('rejects MIME-spoofed and excessive decoded image payloads', async () => {
    await assert.rejects(
      prepareRasterImageForCache(Buffer.from('not an image'), 'image/gif')
    );
    assert.throws(
      () =>
        assertRasterPixelBudget({
          width: MAX_IMAGE_PIXELS,
          frameHeight: 2,
        }),
      /pixel count/
    );
  });
});

describe('pruneStaleImageCacheEntries', () => {
  it('deletes an entry containing multiple stale files only once', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-images-'));
    temporaryDirectories.push(root);
    const staleDirectory = path.join(root, 'stale');
    const freshDirectory = path.join(root, 'fresh');
    await fs.mkdir(staleDirectory);
    await fs.mkdir(freshDirectory);
    await fs.writeFile(path.join(staleDirectory, '60.100.first.webp'), 'one');
    await fs.writeFile(path.join(staleDirectory, '60.200.second.webp'), 'two');
    await fs.writeFile(
      path.join(freshDirectory, '60.9999999999999.fresh.webp'),
      'fresh'
    );

    assert.equal(await pruneStaleImageCacheEntries(root), 1);
    await assert.rejects(fs.stat(staleDirectory), { code: 'ENOENT' });
    assert.equal((await fs.stat(freshDirectory)).isDirectory(), true);
  });

  posixIt('does not prune through a symlinked cache root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-prune-'));
    temporaryDirectories.push(root);
    const target = path.join(root, 'target');
    const linked = path.join(root, 'linked');
    const entry = path.join(target, 'entry');
    const cachedFile = path.join(entry, '60.100.etag.webp');
    await fs.mkdir(entry, { recursive: true });
    await fs.writeFile(cachedFile, 'image');
    await fs.symlink(target, linked);

    await assert.rejects(pruneStaleImageCacheEntries(linked), /symlink/i);
    assert.equal(await fs.readFile(cachedFile, 'utf8'), 'image');
  });
});

describe('parseCacheControlMaxAge', () => {
  it('parses standard comma-delimited cache-control headers', () => {
    assert.equal(
      parseCacheControlMaxAge('public, max-age=31536000, immutable'),
      31536000
    );
  });

  it('parses max-age regardless of casing and spacing', () => {
    assert.equal(parseCacheControlMaxAge('PRIVATE,  MAX-AGE=7200'), 7200);
  });

  it('falls back to one day when max-age is missing or invalid', () => {
    assert.equal(parseCacheControlMaxAge(undefined), 86400);
    assert.equal(parseCacheControlMaxAge('no-cache'), 86400);
    assert.equal(parseCacheControlMaxAge('public, max-age=0'), 86400);
  });

  it('caps absurd upstream max-age values', () => {
    assert.equal(
      parseCacheControlMaxAge('public, max-age=999999999999'),
      MAX_IMAGE_CACHE_MAX_AGE
    );
  });
});

describe('getImageCacheLastModified', () => {
  it('derives last-modified from valid cache filename metadata', () => {
    assert.equal(getImageCacheLastModified(200000, 100, 12345), 100000);
  });

  it('falls back to now for invalid cache filename metadata', () => {
    assert.equal(getImageCacheLastModified(Number.NaN, 100, 12345), 12345);
    assert.equal(getImageCacheLastModified(200000, 0, 12345), 12345);
  });
});

describe('parseImageCacheFileMetadata', () => {
  it('parses bounded cache filename metadata', () => {
    assert.deepEqual(parseImageCacheFileMetadata('60.120.etag.webp', 90), {
      maxAge: 60,
      expireAt: 120,
      etag: 'etag',
      extension: 'webp',
      lastModified: -59880,
      revalidateAfter: 60090,
      isStale: false,
    });
  });

  it('rejects malformed cache filename metadata', () => {
    assert.equal(parseImageCacheFileMetadata('NaN.120.etag.webp'), null);
    assert.equal(parseImageCacheFileMetadata('60.NaN.etag.webp'), null);
    assert.equal(parseImageCacheFileMetadata('60.120..webp'), null);
    assert.equal(parseImageCacheFileMetadata('60.120.etag'), null);
    assert.equal(parseImageCacheFileMetadata('60.120.etag.webp.extra'), null);
    assert.equal(
      parseImageCacheFileMetadata(
        `${MAX_IMAGE_CACHE_MAX_AGE + 1}.120.etag.webp`
      ),
      null
    );
  });
});

describe('getImageResponseContentType', () => {
  it('uses canonical MIME types for cached image extensions', () => {
    assert.equal(getImageResponseContentType('jpg'), 'image/jpeg');
    assert.equal(getImageResponseContentType('jpeg'), 'image/jpeg');
    assert.equal(getImageResponseContentType('webp'), 'image/webp');
  });

  it('falls back safely for unknown or missing extensions', () => {
    assert.equal(
      getImageResponseContentType('svg'),
      'application/octet-stream'
    );
    assert.equal(
      getImageResponseContentType('custom'),
      'application/octet-stream'
    );
    assert.equal(getImageResponseContentType(null), 'application/octet-stream');
  });
});

describe('getSafeRasterContentType', () => {
  it('accepts supported raster media types with optional parameters', () => {
    assert.equal(getSafeRasterContentType('image/jpeg'), 'image/jpeg');
    assert.equal(
      getSafeRasterContentType('IMAGE/PNG; charset=binary'),
      'image/png'
    );
  });

  it('rejects active SVG and unknown image media types', () => {
    assert.equal(getSafeRasterContentType('image/svg+xml'), undefined);
    assert.equal(
      getSafeRasterContentType('image/svg+xml; charset=utf-8'),
      undefined
    );
    assert.equal(getSafeRasterContentType('image/custom'), undefined);
    assert.equal(getSafeRasterContentType('text/html'), undefined);
  });
});
