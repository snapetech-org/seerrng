import {
  assertNoSymlinkDirectoryComponents,
  isTolerableChmodError,
} from '@server/lib/pathSecurity';
import logger from '@server/logger';
import AsyncLock from '@server/utils/asyncLock';
import { trackBackgroundTask } from '@server/utils/backgroundTasks';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import {
  getHttpErrorDetails,
  withTransientHttpRetry,
} from '@server/utils/httpError';
import {
  createSafeHttpRequestOptions,
  createSafeHttpUrl,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import axios, { type AxiosInstance } from 'axios';
import rateLimit, { type rateLimitOptions } from 'axios-rate-limit';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { constants, promises } from 'fs';
import mime from 'mime';
import path from 'path';
import sharp from 'sharp';
import { pipeline } from 'stream/promises';

type ImageMeta = {
  revalidateAfter: number;
  curRevalidate: number;
  isStale: boolean;
  etag: string;
  extension: string | null;
  cacheKey: string;
  cacheMiss: boolean;
  lastModified: number;
};

export type ImageResponse = {
  meta: ImageMeta;
  // Exactly one of these is set: a buffer for hot/just-fetched images,
  // or a file path to stream from disk for larger cold images.
  imageBuffer?: Buffer;
  filePath?: string;
};

const baseCacheDirectory = process.env.CONFIG_DIRECTORY
  ? `${process.env.CONFIG_DIRECTORY}/cache/images`
  : path.join(__dirname, '../../config/cache/images');

const WEBP_QUALITY = 80;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const LRU_MAX_BYTES = 64 * 1024 * 1024;
const LRU_MAX_ENTRIES = 512;
// Images larger than this are streamed from disk instead of held in memory.
export const LRU_ITEM_MAX_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
export const MAX_IMAGE_DISK_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_IMAGE_DISK_CACHE_ENTRIES = 20_000;
export const MAX_IMAGE_CACHE_STATS_FILESYSTEM_ENTRIES = 100_000;
export const PRIVATE_IMAGE_CACHE_DIRECTORY_MODE = 0o700;
export const PRIVATE_IMAGE_CACHE_FILE_MODE = 0o600;
const TRANSCODABLE_CONTENT_TYPE = /^image\/(jpe?g|png|webp|avif|bmp|tiff)$/i;
const SAFE_RASTER_CONTENT_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
]);
const DEFAULT_IMAGE_CACHE_MAX_AGE = 86400;
export const MAX_IMAGE_CACHE_MAX_AGE = 365 * 24 * 60 * 60;
const resolvedBaseCacheDirectory = path.resolve(baseCacheDirectory);

export const IMAGE_PROXY_HTTP_OPTIONS = {
  timeout: 10_000,
} as const;

export const resolveImageRequestUrl = (
  imagePath: string,
  baseUrl: string
): string => {
  try {
    // URL rejects an empty base even when imagePath is already absolute.
    // Remote-avatar caching intentionally has no base because its route
    // validates and supplies a complete HTTPS URL.
    return new URL(imagePath, baseUrl || undefined).href;
  } catch {
    throw new Error('Image URL is invalid.');
  }
};

export const parseCacheControlMaxAge = (
  cacheControl: string | undefined
): number => {
  const maxAge = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i);

  if (!maxAge) {
    return DEFAULT_IMAGE_CACHE_MAX_AGE;
  }

  const parsed = Number(maxAge[1]);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_IMAGE_CACHE_MAX_AGE)
    : DEFAULT_IMAGE_CACHE_MAX_AGE;
};

export const parseImageCacheFileMetadata = (
  filename: string,
  now = Date.now()
): {
  maxAge: number;
  expireAt: number;
  etag: string;
  extension: string;
  lastModified: number;
  revalidateAfter: number;
  isStale: boolean;
} | null => {
  const [maxAgeSt, expireAtSt, etag, extension, ...extra] = filename.split('.');

  if (extra.length || !etag || !extension) {
    return null;
  }

  const maxAge = Number(maxAgeSt);
  const expireAt = Number(expireAtSt);

  if (
    !Number.isSafeInteger(maxAge) ||
    maxAge <= 0 ||
    maxAge > MAX_IMAGE_CACHE_MAX_AGE ||
    !Number.isSafeInteger(expireAt) ||
    expireAt <= 0
  ) {
    return null;
  }

  const lastModified = getImageCacheLastModified(expireAt, maxAge, now);
  if (!Number.isFinite(lastModified)) {
    return null;
  }

  return {
    maxAge,
    expireAt,
    etag,
    extension,
    lastModified,
    revalidateAfter: maxAge * 1000 + now,
    isStale: now > expireAt,
  };
};

export const getImageCacheLastModified = (
  expireAt: number,
  maxAge: number,
  now = Date.now()
): number => {
  if (
    Number.isFinite(expireAt) &&
    Number.isFinite(maxAge) &&
    maxAge > 0 &&
    expireAt > 0
  ) {
    return expireAt - maxAge * 1000;
  }

  return now;
};

export const getImageResponseContentType = (
  extension: string | null | undefined
): string => {
  if (!extension) {
    return 'application/octet-stream';
  }

  const contentType = mime.getType(extension);
  return contentType && SAFE_RASTER_CONTENT_TYPES.has(contentType)
    ? contentType
    : 'application/octet-stream';
};

export const getSafeRasterContentType = (
  contentType: string | undefined
): string | undefined => {
  const normalized = contentType?.split(';', 1)[0].trim().toLowerCase();
  return normalized && SAFE_RASTER_CONTENT_TYPES.has(normalized)
    ? normalized
    : undefined;
};

const getHeaderString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === 'string');
  }

  return undefined;
};

const resolveCachePath = (...segments: string[]): string => {
  const resolved = path.resolve(baseCacheDirectory, ...segments);
  const relative = path.relative(resolvedBaseCacheDirectory, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Image cache path escapes cache directory');
  }

  return resolved;
};

const assertCachePath = (target: string): string => {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- the path comes from a fixed allow-list or is containment-checked here, not from user input
  const resolved = path.resolve(target);
  const relative = path.relative(resolvedBaseCacheDirectory, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Image cache path escapes cache directory');
  }

  return resolved;
};

type LruEntry = {
  buffer: Buffer;
  maxAge: number;
  expireAt: number;
  etag: string;
  extension: string | null;
  lastModified: number;
};

/**
 * Process-wide LRU of decoded image bytes, shared across all ImageProxy
 * instances. Cache keys are SHA-256 hashes that already incorporate the
 * proxy key + version + path, so they are globally unique.
 */
class ImageMemoryCache {
  private map = new Map<string, LruEntry>();
  private bytes = 0;

  public get(key: string): LruEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    // Mark as most-recently-used.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  public set(key: string, entry: LruEntry): void {
    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= existing.buffer.length;
      this.map.delete(key);
    }
    this.map.set(key, entry);
    this.bytes += entry.buffer.length;
    this.evict();
  }

  public delete(key: string): void {
    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= existing.buffer.length;
      this.map.delete(key);
    }
  }

  public clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  private evict(): void {
    while (
      (this.bytes > LRU_MAX_BYTES || this.map.size > LRU_MAX_ENTRIES) &&
      this.map.size > 0
    ) {
      const oldestKey = this.map.keys().next().value as string;
      const oldest = this.map.get(oldestKey);
      if (oldest) {
        this.bytes -= oldest.buffer.length;
      }
      this.map.delete(oldestKey);
    }
  }
}

const memoryCache = new ImageMemoryCache();
export const MAX_PENDING_IMAGE_CACHE_WRITES = 512;
const pendingImageCacheWrites = new Map<
  string,
  Promise<ImageResponse | null>
>();

type ImageDiskCacheEntry = {
  directory: string;
  mtimeMs: number;
  size: number;
};

/**
 * Process-wide disk budget for all image providers. The index is built once
 * from disk and every cache write is serialized through the same lock, so
 * concurrent cache misses cannot independently pass the capacity check.
 */
export class ImageDiskCacheBudget {
  private entries: Map<string, ImageDiskCacheEntry> | undefined;
  private readonly lock = new AsyncLock();

  public constructor(
    private readonly rootDirectory: string,
    private readonly maxBytes = MAX_IMAGE_DISK_CACHE_BYTES,
    private readonly maxEntries = MAX_IMAGE_DISK_CACHE_ENTRIES
  ) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error('Image disk cache byte limit must be positive.');
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('Image disk cache entry limit must be positive.');
    }
  }

  public write(
    directory: string,
    filename: string,
    buffer: Buffer
  ): Promise<string> {
    return this.lock.dispatch('image-disk-cache', async () => {
      const safeDirectory = this.assertChildPath(directory);
      if (buffer.length > this.maxBytes) {
        throw new Error('Image exceeds disk cache capacity.');
      }

      const entries = await this.getEntries();
      entries.delete(safeDirectory);

      let totalBytes = 0;
      for (const entry of entries.values()) {
        totalBytes += entry.size;
      }

      const oldest = [...entries.values()].sort(
        (left, right) => left.mtimeMs - right.mtimeMs
      );
      while (
        totalBytes + buffer.length > this.maxBytes ||
        entries.size + 1 > this.maxEntries
      ) {
        const entry = oldest.shift();
        if (!entry) {
          break;
        }
        assertNoSymlinkDirectoryComponents(path.dirname(entry.directory), {
          label: 'Image cache directory',
        });
        await promises.rm(entry.directory, { force: true, recursive: true });
        entries.delete(entry.directory);
        totalBytes -= entry.size;
        memoryCache.delete(path.basename(entry.directory));
      }

      const filePath = await writePrivateImageCacheFile(
        safeDirectory,
        filename,
        buffer
      );
      entries.set(safeDirectory, {
        directory: safeDirectory,
        mtimeMs: Date.now(),
        size: buffer.length,
      });
      return filePath;
    });
  }

  public pruneStale(cacheDirectory: string): Promise<number> {
    return this.lock.dispatch('image-disk-cache', async () => {
      const deletedEntries = await pruneStaleImageCacheEntries(cacheDirectory);
      // Pruning changes the filesystem behind the budget index. Force the
      // next write to rebuild it rather than accounting deleted directories.
      this.entries = undefined;
      return deletedEntries;
    });
  }

  private assertChildPath(candidate: string): string {
    const root = path.resolve(this.rootDirectory);
    const resolved = path.resolve(candidate);
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Image disk cache entry escapes cache directory.');
    }
    return resolved;
  }

  private async getEntries(): Promise<Map<string, ImageDiskCacheEntry>> {
    if (this.entries) {
      return this.entries;
    }

    const entries = new Map<string, ImageDiskCacheEntry>();
    assertNoSymlinkDirectoryComponents(this.rootDirectory, {
      allowMissing: true,
      label: 'Image cache directory',
    });
    const providers = await promises
      .readdir(this.rootDirectory, { withFileTypes: true })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      });

    for (const provider of providers) {
      if (!provider.isDirectory() || provider.isSymbolicLink()) {
        continue;
      }
      const providerDirectory = this.assertChildPath(
        path.join(this.rootDirectory, provider.name)
      );
      const cacheEntries = await promises.readdir(providerDirectory, {
        withFileTypes: true,
      });
      for (const cacheEntry of cacheEntries) {
        if (!cacheEntry.isDirectory() || cacheEntry.isSymbolicLink()) {
          continue;
        }
        const directory = this.assertChildPath(
          path.join(providerDirectory, cacheEntry.name)
        );
        const files = await promises.readdir(directory, {
          withFileTypes: true,
        });
        let size = 0;
        let mtimeMs = 0;
        for (const file of files) {
          if (!file.isFile() || file.isSymbolicLink()) {
            continue;
          }
          const stat = await promises.lstat(path.join(directory, file.name));
          if (stat.nlink !== 1) {
            throw new Error('Image cache files must not be hard-linked.');
          }
          size += stat.size;
          mtimeMs = Math.max(mtimeMs, stat.mtimeMs);
        }
        entries.set(directory, { directory, mtimeMs, size });
      }
    }

    this.entries = entries;
    return entries;
  }
}

const imageDiskCacheBudget = new ImageDiskCacheBudget(
  resolvedBaseCacheDirectory
);

const getImageLogPath = (imagePath: string): string =>
  imagePath.split('?', 1)[0];

export const coalesceImageCacheWrite = (
  cacheKey: string,
  write: () => Promise<ImageResponse | null>
): Promise<ImageResponse | null> => {
  const pending = pendingImageCacheWrites.get(cacheKey);
  if (pending) {
    return pending;
  }

  if (pendingImageCacheWrites.size >= MAX_PENDING_IMAGE_CACHE_WRITES) {
    return Promise.reject(new Error('Image cache write capacity exceeded.'));
  }

  const current = Promise.resolve()
    .then(write)
    .finally(() => {
      if (pendingImageCacheWrites.get(cacheKey) === current) {
        pendingImageCacheWrites.delete(cacheKey);
      }
    });
  pendingImageCacheWrites.set(cacheKey, current);
  return current;
};

const chmodImageCacheDirectoryBestEffort = async (
  directory: string
): Promise<void> => {
  try {
    await promises.chmod(directory, PRIVATE_IMAGE_CACHE_DIRECTORY_MODE);
  } catch (error) {
    if (!isTolerableChmodError(error)) throw error;
    logger.warn(
      'Unable to set restrictive permissions on the image cache directory; continuing with its existing permissions.',
      {
        label: 'Image Proxy',
        directory,
        errorMessage: (error as Error).message,
      }
    );
  }
};

export const writePrivateImageCacheFile = async (
  directory: string,
  filename: string,
  buffer: Buffer
): Promise<string> => {
  if (!filename || path.basename(filename) !== filename) {
    throw new Error('Image cache filename must not contain path segments');
  }

  const parentDirectory = path.dirname(directory);
  assertNoSymlinkDirectoryComponents(parentDirectory, {
    allowMissing: true,
    label: 'Image cache directory',
  });
  await promises.mkdir(parentDirectory, {
    recursive: true,
    mode: PRIVATE_IMAGE_CACHE_DIRECTORY_MODE,
  });
  assertNoSymlinkDirectoryComponents(parentDirectory, {
    label: 'Image cache directory',
  });
  const parentStat = await promises.lstat(parentDirectory);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error('Image cache parent path is not a directory');
  }
  await chmodImageCacheDirectoryBestEffort(parentDirectory);

  const existing = await promises.lstat(directory).catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error('Image cache path is not a directory');
  }

  await promises.rm(directory, { force: true, recursive: true }).catch(() => {
    // A cache miss can race cleanup; mkdir below establishes the final state.
  });
  await promises.mkdir(directory, {
    recursive: true,
    mode: PRIVATE_IMAGE_CACHE_DIRECTORY_MODE,
  });
  assertNoSymlinkDirectoryComponents(directory, {
    label: 'Image cache directory',
  });
  await chmodImageCacheDirectoryBestEffort(directory);

  const filePath = path.join(directory, filename);
  await promises.writeFile(filePath, buffer, {
    flag: 'wx',
    mode: PRIVATE_IMAGE_CACHE_FILE_MODE,
  });
  return filePath;
};

export const readPrivateImageCacheFile = async (
  filePath: string,
  maxBytes = LRU_ITEM_MAX_BYTES
): Promise<Buffer> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Image cache read limit must be positive.');
  }

  const handle = await promises.open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error('Image cache path must be a private regular file.');
    }
    if (stat.size > maxBytes) {
      throw new Error('Image cache file exceeds the in-memory read limit.');
    }

    const buffer = await handle.readFile();
    if (buffer.length > maxBytes) {
      throw new Error('Image cache file exceeds the in-memory read limit.');
    }
    return buffer;
  } finally {
    await handle.close();
  }
};

export const assertRasterPixelBudget = ({
  width,
  frameHeight,
  pages = 1,
}: {
  width: number;
  frameHeight: number;
  pages?: number;
}): void => {
  const pixels = width * frameHeight * pages;

  if (
    !Number.isSafeInteger(pixels) ||
    pixels <= 0 ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new Error('Image exceeds maximum decoded pixel count.');
  }
};

export const prepareRasterImageForCache = async (
  input: Buffer<ArrayBufferLike>,
  contentType: string
): Promise<{ buffer: Buffer<ArrayBufferLike>; extension: string }> => {
  const image = sharp(input, {
    animated: true,
    limitInputPixels: MAX_IMAGE_PIXELS,
  });
  const metadata = await image.metadata();
  assertRasterPixelBudget({
    width: metadata.width ?? 0,
    frameHeight: metadata.pageHeight ?? metadata.height ?? 0,
    pages: metadata.pages ?? 1,
  });

  if (!TRANSCODABLE_CONTENT_TYPE.test(contentType)) {
    return {
      buffer: input,
      extension: mime.getExtension(contentType) || '',
    };
  }

  const buffer = await image.webp({ quality: WEBP_QUALITY }).toBuffer();
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Transcoded image exceeds maximum allowed size.');
  }

  return { buffer, extension: 'webp' };
};

export const getBoundedDirectorySize = async (
  rootDirectory: string,
  maxEntries = MAX_IMAGE_CACHE_STATS_FILESYSTEM_ENTRIES
): Promise<number> => {
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new Error('Directory inspection limit must be positive.');
  }

  const pendingDirectories = [rootDirectory];
  let inspectedEntries = 0;
  let totalSize = 0;

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!;
    const entries = await promises.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      inspectedEntries += 1;
      if (inspectedEntries > maxEntries) {
        throw new Error('Directory exceeds the inspection entry limit.');
      }

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        totalSize += (await promises.lstat(entryPath)).size;
      }
    }
  }

  return totalSize;
};

export const pruneStaleImageCacheEntries = async (
  cacheDirectory: string
): Promise<number> => {
  assertNoSymlinkDirectoryComponents(cacheDirectory, {
    label: 'Image cache directory',
  });
  let deletedEntries = 0;
  const files = await promises.readdir(cacheDirectory);

  for (const file of files) {
    const filePath = path.join(cacheDirectory, file);
    const stat = await promises.lstat(filePath);
    if (!stat.isDirectory()) {
      continue;
    }

    const imageFiles = await promises.readdir(filePath);
    if (
      imageFiles.some(
        (imageFile) => parseImageCacheFileMetadata(imageFile)?.isStale === true
      )
    ) {
      await promises.rm(filePath, { force: true, recursive: true });
      deletedEntries += 1;
    }
  }

  return deletedEntries;
};

/**
 * Writes the response headers and body for a cached image, streaming from
 * disk when the payload was not small enough to keep in memory.
 */
export async function sendImage(
  res: Response,
  imageData: ImageResponse,
  headers: Record<string, string | number>
): Promise<void> {
  if (imageData.imageBuffer) {
    res.writeHead(200, {
      ...headers,
      'Content-Length': imageData.imageBuffer.length,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(imageData.imageBuffer);
    return;
  }

  if (!imageData.filePath) {
    res.status(500).end();
    return;
  }

  let handle: Awaited<ReturnType<typeof promises.open>> | undefined;
  let streamOwnsHandle = false;
  try {
    handle = await promises.open(
      imageData.filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) {
      res.status(500).end();
      return;
    }

    const { size } = stat;
    res.writeHead(200, {
      ...headers,
      'Content-Length': size,
      'X-Content-Type-Options': 'nosniff',
    });
    const stream = handle.createReadStream({ autoClose: true });
    streamOwnsHandle = true;
    await pipeline(stream, res);
  } catch {
    if (res.headersSent) {
      res.destroy();
    } else {
      res.status(500).end();
    }
  } finally {
    if (handle && !streamOwnsHandle) {
      await handle.close().catch(() => undefined);
    }
  }
}

class ImageProxy {
  public static clearMemoryCache(): void {
    memoryCache.clear();
  }

  public static async clearCache(key: string) {
    let deletedImages = 0;
    const cacheDirectory = resolveCachePath(key);

    try {
      deletedImages = await imageDiskCacheBudget.pruneStale(cacheDirectory);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return;
      }
      logger.error('Failed to read directory', {
        label: 'Image Cache',
        message: e.message,
      });
    }

    // On-disk entries were pruned; drop the in-memory mirror so stale
    // bytes are not served from RAM.
    ImageProxy.clearMemoryCache();

    logger.info(`Cleared ${deletedImages} stale image(s) from cache '${key}'`, {
      label: 'Image Cache',
    });
  }

  public static async getImageStats(
    key: string
  ): Promise<{ size: number; imageCount: number }> {
    const cacheDirectory = resolveCachePath(key);

    const imageTotalSize = await ImageProxy.getDirectorySize(cacheDirectory);
    const imageCount = await ImageProxy.getImageCount(cacheDirectory);

    return {
      size: imageTotalSize,
      imageCount,
    };
  }

  private static async getDirectorySize(dir: string): Promise<number> {
    try {
      assertCachePath(dir);
      return await getBoundedDirectorySize(dir);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return 0;
      }
      throw e;
    }
  }

  private static async getImageCount(dir: string) {
    try {
      const files = await promises.readdir(dir);

      return files.length;
    } catch (e) {
      if (e.code === 'ENOENT') {
        return 0;
      }
    }

    return 0;
  }

  private axios: AxiosInstance;
  private cacheVersion;
  private cacheKeyScope?: string;
  private key;
  private baseUrl;
  private allowPrivateAddresses;

  constructor(
    key: string,
    baseUrl: string,
    options: {
      allowPrivateAddresses?: boolean;
      cacheKeyScope?: string;
      cacheVersion?: number;
      rateLimitOptions?: rateLimitOptions;
      headers?: Record<string, string>;
      requestValidator?: () => void;
    } = {}
  ) {
    // Bumped to 2 when WebP transcoding was introduced so previously
    // cached originals are re-fetched and re-encoded.
    this.cacheVersion = options.cacheVersion ?? 2;
    this.cacheKeyScope = options.cacheKeyScope;
    this.key = key;
    this.baseUrl = baseUrl;
    this.allowPrivateAddresses = options.allowPrivateAddresses ?? false;
    this.axios = axios.create({
      baseURL: baseUrl,
      headers: options.headers,
      ...createSafeHttpRequestOptions(options.allowPrivateAddresses ?? false),
      ...IMAGE_PROXY_HTTP_OPTIONS,
    });
    this.axios.interceptors.request.use((config) => {
      options.requestValidator?.();
      return userAgentRequestInterceptor(proxyRequestInterceptor(config));
    });

    if (options.rateLimitOptions) {
      this.axios = rateLimit(this.axios, options.rateLimitOptions);
    }
  }

  public async getImage(
    path: string,
    fallbackPath?: string
  ): Promise<ImageResponse> {
    const imageResponse = await this.getCachedImage(path);

    if (!imageResponse) {
      const cacheKey = this.getCacheKey(path);
      const newImage = await this.set(path, cacheKey);

      if (!newImage) {
        if (fallbackPath) {
          return await this.getImage(fallbackPath);
        } else {
          throw new Error('Failed to load image');
        }
      }

      return newImage;
    }

    return imageResponse;
  }

  /**
   * Returns an image already held in memory or on disk without fetching a
   * missing image from its upstream provider. Stale images are served while
   * they are revalidated in the background.
   */
  public async getCachedImage(path: string): Promise<ImageResponse | null> {
    const cacheKey = this.getCacheKey(path);
    const imageResponse = await this.get(cacheKey);

    if (imageResponse?.meta.isStale) {
      trackBackgroundTask('stale image cache revalidation', () =>
        this.set(path, cacheKey)
      );
    }

    return imageResponse;
  }

  public async clearCachedImage(imagePath: string) {
    // find cacheKey
    const cacheKey = this.getCacheKey(imagePath);
    const directory = resolveCachePath(this.key, cacheKey);

    memoryCache.delete(cacheKey);

    assertNoSymlinkDirectoryComponents(path.dirname(directory), {
      label: 'Image cache directory',
    });

    try {
      await promises.access(directory);
    } catch (e) {
      if (e.code === 'ENOENT') {
        logger.debug(
          `Cache directory '${cacheKey}' does not exist; nothing to clear.`,
          {
            label: 'Image Cache',
          }
        );
        return;
      } else {
        logger.error('Error checking cache directory existence', {
          label: 'Image Cache',
          message: e.message,
        });
        return;
      }
    }

    try {
      const stat = await promises.lstat(directory);
      if (!stat.isDirectory()) {
        logger.error('Cached image path is not a directory', {
          label: 'Image Cache',
          cacheKey,
        });
        return;
      }

      const files = await promises.readdir(directory);

      await promises.rm(directory, { recursive: true });

      logger.debug(`Cleared ${files[0]} from cache 'avatar'`, {
        label: 'Image Cache',
      });
    } catch (e) {
      logger.error('Failed to clear cached image', {
        label: 'Image Cache',
        message: e.message,
      });
    }
  }

  private async get(cacheKey: string): Promise<ImageResponse | null> {
    const now = Date.now();

    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return {
        meta: {
          curRevalidate: cached.maxAge,
          revalidateAfter: cached.expireAt,
          isStale: now > cached.expireAt,
          etag: cached.etag,
          extension: cached.extension,
          cacheKey,
          cacheMiss: false,
          lastModified: cached.lastModified,
        },
        imageBuffer: cached.buffer,
      };
    }

    try {
      const directory = resolveCachePath(this.key, cacheKey);
      const files = await promises.readdir(directory);

      for (const file of files) {
        const filePath = assertCachePath(path.join(directory, file));
        const metadata = parseImageCacheFileMetadata(file, now);
        if (!metadata) {
          continue;
        }

        const meta: ImageMeta = {
          curRevalidate: metadata.maxAge,
          revalidateAfter: metadata.revalidateAfter,
          isStale: metadata.isStale,
          etag: metadata.etag,
          extension: metadata.extension,
          cacheKey,
          cacheMiss: false,
          lastModified: metadata.lastModified,
        };

        const stat = await promises.lstat(filePath);
        if (!stat.isFile() || stat.nlink !== 1) {
          continue;
        }

        const { size } = stat;

        if (size <= LRU_ITEM_MAX_BYTES) {
          // Reopen without following symlinks and validate the descriptor.
          // The earlier lstat is only a cache-size hint; it cannot safely
          // authorize a later pathname read because the entry may be swapped.
          const buffer = await readPrivateImageCacheFile(filePath);
          memoryCache.set(cacheKey, {
            buffer,
            maxAge: metadata.maxAge,
            expireAt: metadata.expireAt,
            etag: metadata.etag,
            extension: metadata.extension,
            lastModified: metadata.lastModified,
          });
          return { meta, imageBuffer: buffer };
        }

        return { meta, filePath };
      }
    } catch {
      // No files. Treat as empty cache.
    }

    return null;
  }

  private async set(
    path: string,
    cacheKey: string
  ): Promise<ImageResponse | null> {
    return coalesceImageCacheWrite(cacheKey, () =>
      this.fetchAndCache(path, cacheKey)
    );
  }

  private async fetchAndCache(
    path: string,
    cacheKey: string
  ): Promise<ImageResponse | null> {
    try {
      let requestPath = resolveImageRequestUrl(path, this.baseUrl);
      const safeUrl = await createSafeHttpUrl(requestPath, {
        allowPrivateAddresses: this.allowPrivateAddresses,
      });
      if (!safeUrl) {
        throw new Error('Image URL is not safe to request.');
      }
      requestPath = stringifySafeHttpUrl(safeUrl);
      const response = await withTransientHttpRetry(
        () =>
          this.axios.get(requestPath, {
            responseType: 'arraybuffer',
            maxContentLength: MAX_IMAGE_BYTES,
            maxBodyLength: MAX_IMAGE_BYTES,
          }),
        {
          onRetry: (error, nextAttempt) => {
            logger.debug('Retrying transient upstream image request', {
              label: 'Image Cache',
              imageProvider: this.key,
              imagePath: getImageLogPath(path),
              nextAttempt,
              ...getHttpErrorDetails(error),
            });
          },
        }
      );

      let buffer: Buffer<ArrayBufferLike> = Buffer.from(
        response.data,
        'binary'
      );
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('Image exceeds maximum allowed size');
      }

      const contentType = getSafeRasterContentType(
        getHeaderString(response.headers['content-type'])
      );
      if (!contentType) {
        throw new Error('Upstream response is not a supported raster image');
      }
      const preparedImage = await prepareRasterImageForCache(
        buffer,
        contentType
      );
      buffer = preparedImage.buffer;
      const extension = preparedImage.extension;

      const maxAge = parseCacheControlMaxAge(
        getHeaderString(response.headers['cache-control'])
      );
      const lastModified = Date.now();
      const expireAt = lastModified + maxAge * 1000;
      const etag = this.getHash([buffer]);

      if (buffer.length <= LRU_ITEM_MAX_BYTES) {
        memoryCache.set(cacheKey, {
          buffer,
          maxAge,
          expireAt,
          etag,
          extension,
          lastModified,
        });
      } else {
        memoryCache.delete(cacheKey);
        try {
          await imageDiskCacheBudget.write(
            resolveCachePath(this.key, cacheKey),
            `${maxAge}.${expireAt}.${etag}.${extension}`,
            buffer
          );
        } catch (error) {
          // Serving the fetched buffer to this request must not fail just
          // because persisting it for future requests did.
          logger.warn('Failed to persist large image to the disk cache', {
            label: 'Image Cache',
            imageProvider: this.key,
            imagePath: getImageLogPath(path),
            errorMessage: (error as Error).message,
          });
        }
      }

      return {
        meta: {
          curRevalidate: maxAge,
          revalidateAfter: expireAt,
          isStale: false,
          etag,
          extension,
          cacheKey,
          cacheMiss: true,
          lastModified,
        },
        imageBuffer: buffer,
      };
    } catch (error) {
      logger.warn('Failed to cache upstream image', {
        label: 'Image Cache',
        imageProvider: this.key,
        imagePath: getImageLogPath(path),
        ...getHttpErrorDetails(error),
      });
      return null;
    }
  }

  private getCacheKey(path: string) {
    return this.getHash([
      this.key,
      this.cacheVersion,
      ...(this.cacheKeyScope ? [this.cacheKeyScope] : []),
      path,
    ]);
  }

  private getHash(items: (string | number | Buffer)[]) {
    const hash = createHash('sha256');
    for (const item of items) {
      if (typeof item === 'number') hash.update(String(item));
      else {
        hash.update(item);
      }
    }
    // See https://en.wikipedia.org/wiki/Base64#Filenames
    return hash.digest('base64').replace(/\//g, '-');
  }

  private getCacheDirectory() {
    return resolveCachePath(this.key);
  }
}

export default ImageProxy;
