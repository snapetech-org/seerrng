import { cloneDeep } from 'lodash';
import NodeCache from 'node-cache';
import { serialize } from 'node:v8';

export type AvailableCacheIds =
  | 'tmdb'
  | 'tmdbscan'
  | 'radarr'
  | 'whisparr'
  | 'sonarr'
  | 'sportarr'
  | 'rt'
  | 'imdb'
  | 'github'
  | 'plexguid'
  | 'plextv'
  | 'plexwatchlist'
  | 'tvdb'
  | 'tvmaze'
  | 'lidarr'
  | 'readarr'
  | 'musicbrainz'
  | 'listenbrainz'
  | 'coverartarchive'
  | 'openlibrary'
  | 'comicvine'
  | 'metron'
  | 'questarr'
  | 'romarr'
  | 'googlebooks'
  | 'wikidata'
  | 'tadb'
  | 'associations'
  | 'trakt'
  | 'anilist'
  | 'mangaupdates'
  | 'ranobedb'
  | 'simkl'
  | 'personallibrary'
  | 'mediaavailability'
  | 'mdblist';

const DEFAULT_TTL = 300;
const DEFAULT_CHECK_PERIOD = 120;
export const DEFAULT_MAX_CACHE_KEYS = 10_000;
export const DEFAULT_MAX_CACHE_BYTES = 64 * 1024 * 1024;

const TMDB_MAX_KEYS = 1000;
const TMDB_SCAN_MAX_KEYS = 2000;
const RADARR_MAX_KEYS = 64;
const SONARR_MAX_KEYS = 64;
const RT_MAX_KEYS = 500;
const IMDB_MAX_KEYS = 500;
const GITHUB_MAX_KEYS = 16;
export const GITHUB_CACHE_TTL_SECONDS = 6 * 60 * 60;
const PLEX_TV_MAX_KEYS = 5000;
const PLEX_WATCHLIST_MAX_KEYS = 500;
const TVDB_MAX_KEYS = 500;
const GOOGLE_BOOKS_MAX_KEYS = 1000;

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  ksize: number;
  vsize: number;
}

export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): boolean;
  del(key: string): number;
  getTtl(key: string): number | undefined;
  getStats(): CacheStats;
  flushAll(): void;
}

export const estimateCacheEntryBytes = (key: string, value: unknown): number =>
  Buffer.byteLength(key, 'utf8') + serialize(value).byteLength;

/** How long an expired provider answer may still be served while a fresh one loads. */
export const DEFAULT_STALE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type StaleEntry = { value: unknown; expiredAt: number; bytes: number };

export interface CacheSnapshotEntry {
  key: string;
  value: unknown;
  /** Epoch ms when the entry stops being fresh (it may then be served stale). */
  expiresAt: number;
}

export interface CacheSnapshot {
  version: 1;
  id: AvailableCacheIds;
  savedAt: number;
  entries: CacheSnapshotEntry[];
}

// ExternalAPI receives the NodeCache, not this wrapper; find the wrapper from it.
const cacheByStore = new WeakMap<object, Cache>();

/**
 * An expired value for this key, if its cache keeps them. Callers must still
 * ask the provider: a stale value only answers while that request is slow or
 * failing, so an outage or a slow provider doesn't block the page.
 */
export const getStaleCacheValue = <T>(
  store: CacheStore | undefined,
  key: string
): T | undefined =>
  store ? cacheByStore.get(store)?.getStale<T>(key) : undefined;

export class Cache {
  public id: AvailableCacheIds;
  public data: NodeCache;
  public name: string;
  private readonly keyOrder = new Map<string, undefined>();
  private readonly keyBytes = new Map<string, number>();
  private readonly maxKeys: number;
  private readonly maxBytes: number;
  private totalBytes = 0;
  private readonly keyExpiries = new Map<string, number>();
  /** Seconds an expired value stays available to getStale (0 = not kept). */
  public readonly staleMaxAge: number;
  /** Saved across restarts (public provider metadata only). */
  public readonly persist: boolean;
  private readonly stale = new Map<string, StaleEntry>();
  private staleBytes = 0;

  constructor(
    id: AvailableCacheIds,
    name: string,
    options: {
      stdTtl?: number;
      checkPeriod?: number;
      maxKeys?: number;
      maxBytes?: number;
      staleMaxAge?: number;
      persist?: boolean;
    } = {}
  ) {
    this.id = id;
    this.name = name;
    this.staleMaxAge = options.staleMaxAge ?? 0;
    this.persist = options.persist ?? false;
    if (!Number.isSafeInteger(this.staleMaxAge) || this.staleMaxAge < 0) {
      throw new Error('Cache stale age must be a non-negative integer.');
    }
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_CACHE_KEYS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_CACHE_BYTES;
    if (!Number.isSafeInteger(this.maxKeys) || this.maxKeys <= 0) {
      throw new Error('Cache key limit must be a positive integer.');
    }
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0) {
      throw new Error('Cache byte limit must be a positive integer.');
    }
    this.data = new NodeCache({
      stdTTL: options.stdTtl ?? DEFAULT_TTL,
      checkperiod: options.checkPeriod ?? DEFAULT_CHECK_PERIOD,
    });
    // Explicit deletion must invalidate stale-only keys too: node-cache emits
    // no del event when a key has already expired.
    const deleteFresh = this.data.del.bind(this.data);
    this.data.del = (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys])
        this.dropStale(String(key));
      return deleteFresh(keys);
    };
    this.data.on('set', (key: string, value: unknown) => {
      this.dropStale(key);
      this.keyExpiries.set(key, this.data.getTtl(key) ?? 0);
      this.totalBytes -= this.keyBytes.get(key) ?? 0;
      let entryBytes: number;
      try {
        entryBytes = estimateCacheEntryBytes(key, value);
      } catch {
        entryBytes = this.maxBytes + 1;
      }
      this.keyBytes.set(key, entryBytes);
      this.totalBytes += entryBytes;
      this.keyOrder.delete(key);
      this.keyOrder.set(key, undefined);

      this.enforceBounds();
    });
    const forgetKey = (key: string) => {
      this.keyOrder.delete(key);
      this.totalBytes -= this.keyBytes.get(key) ?? 0;
      this.keyBytes.delete(key);
      this.keyExpiries.delete(key);
    };
    let deletedExpiry: { key: string; expiresAt: number } | undefined;
    // node-cache reports an expiry as "del" followed by "expired". A plain del
    // (invalidation, eviction) drops any stale copy; only an expiry keeps one.
    this.data.on('del', (key: string) => {
      deletedExpiry = {
        key,
        expiresAt: this.keyExpiries.get(key) ?? Date.now(),
      };
      forgetKey(key);
      this.dropStale(key);
    });
    this.data.on('expired', (key: string, value: unknown) => {
      const expiredAt =
        deletedExpiry?.key === key ? deletedExpiry.expiresAt : Date.now();
      deletedExpiry = undefined;
      forgetKey(key);
      if (this.staleMaxAge > 0) this.keepStale(key, value, expiredAt);
    });
    this.data.on('flush', () => {
      this.keyOrder.clear();
      this.keyBytes.clear();
      this.keyExpiries.clear();
      deletedExpiry = undefined;
      this.totalBytes = 0;
      this.stale.clear();
      this.staleBytes = 0;
    });
    cacheByStore.set(this.data, this);
  }

  private dropStale(key: string): void {
    const entry = this.stale.get(key);
    if (!entry) return;
    this.stale.delete(key);
    this.staleBytes -= entry.bytes;
  }

  private keepStale(key: string, value: unknown, expiredAt: number): void {
    if (value === undefined || Date.now() - expiredAt > this.staleMaxAge * 1000)
      return;
    let bytes: number;
    try {
      bytes = estimateCacheEntryBytes(key, value);
    } catch {
      return;
    }
    if (bytes > this.maxBytes) return;
    this.dropStale(key);
    this.stale.set(key, { value, expiredAt, bytes });
    this.staleBytes += bytes;
    this.enforceBounds();
  }

  private enforceBounds(): void {
    while (
      this.keyOrder.size + this.stale.size > this.maxKeys ||
      this.totalBytes + this.staleBytes > this.maxBytes
    ) {
      const staleKey = this.stale.keys().next().value;
      if (staleKey !== undefined) {
        this.dropStale(staleKey);
        continue;
      }
      const freshKey = this.keyOrder.keys().next().value;
      if (freshKey === undefined) break;
      this.data.del(freshKey);
    }
  }

  public getStale<T>(key: string): T | undefined {
    const entry = this.stale.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.expiredAt > this.staleMaxAge * 1000) {
      this.dropStale(key);
      return undefined;
    }
    return cloneDeep(entry.value) as T;
  }

  /** Fresh and stale entries, for saving across a restart. */
  public snapshot(now = Date.now()): CacheSnapshot {
    const entries: CacheSnapshotEntry[] = [];
    for (const key of this.data.keys()) {
      const expiresAt = this.data.getTtl(key);
      const value = this.data.get(key);
      if (value === undefined || !expiresAt) continue;
      entries.push({ key, value, expiresAt });
    }
    for (const [key, entry] of this.stale) {
      if (this.data.has(key)) continue;
      if (now - entry.expiredAt > this.staleMaxAge * 1000) continue;
      entries.push({ key, value: entry.value, expiresAt: entry.expiredAt });
    }
    return { version: 1, id: this.id, savedAt: now, entries };
  }

  /**
   * Put saved entries back: still-fresh ones as fresh with their remaining
   * lifetime, expired ones (within the stale window) as stale only. Keys that
   * already hold a value are left alone. Returns how many were restored.
   */
  public restore(snapshot: CacheSnapshot, now = Date.now()): number {
    if (snapshot?.version !== 1 || snapshot.id !== this.id) return 0;
    if (!Array.isArray(snapshot.entries)) return 0;
    let restored = 0;
    for (const entry of snapshot.entries) {
      if (
        !entry ||
        typeof entry.key !== 'string' ||
        entry.value === undefined ||
        typeof entry.expiresAt !== 'number' ||
        !Number.isFinite(entry.expiresAt) ||
        this.data.has(entry.key)
      )
        continue;
      const remaining = Math.floor((entry.expiresAt - now) / 1000);
      if (remaining > 0) {
        if (this.data.set(entry.key, entry.value, remaining)) restored += 1;
      } else if (
        this.staleMaxAge > 0 &&
        now - entry.expiresAt <= this.staleMaxAge * 1000
      ) {
        this.keepStale(entry.key, entry.value, entry.expiresAt);
        if (this.stale.has(entry.key)) restored += 1;
      }
    }
    return restored;
  }

  public getStats() {
    return this.data.getStats();
  }

  public flush(): void {
    this.data.flushAll();
  }
}

class CacheManager {
  private availableCaches: Record<AvailableCacheIds, Cache> = {
    trakt: new Cache('trakt', 'Trakt API', {
      maxKeys: 500,
      maxBytes: 8 * 1024 * 1024,
    }),
    anilist: new Cache('anilist', 'AniList API', {
      maxKeys: 500,
      maxBytes: 8 * 1024 * 1024,
    }),
    mangaupdates: new Cache('mangaupdates', 'MangaUpdates API', {
      maxKeys: 500,
      maxBytes: 8 * 1024 * 1024,
    }),
    ranobedb: new Cache('ranobedb', 'RanobeDB API', {
      maxKeys: 500,
      maxBytes: 8 * 1024 * 1024,
    }),
    simkl: new Cache('simkl', 'Simkl API', {
      maxKeys: 500,
      maxBytes: 8 * 1024 * 1024,
    }),
    personallibrary: new Cache('personallibrary', 'Personal media libraries', {
      stdTtl: 30,
      maxKeys: 1000,
      maxBytes: 16 * 1024 * 1024,
    }),
    mediaavailability: new Cache(
      'mediaavailability',
      'Per-user media availability',
      {
        stdTtl: 30,
        maxKeys: 5000,
        maxBytes: 2 * 1024 * 1024,
      }
    ),
    mdblist: new Cache('mdblist', 'MDBList API', {
      stdTtl: 172800,
      maxKeys: 500,
      maxBytes: 8 * 1024 * 1024,
    }),
    tmdb: new Cache('tmdb', 'The Movie Database API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 21600,
      maxKeys: TMDB_MAX_KEYS,
    }),
    tmdbscan: new Cache('tmdbscan', 'The Movie Database API (Library Scans)', {
      stdTtl: 900,
      maxKeys: TMDB_SCAN_MAX_KEYS,
    }),
    radarr: new Cache('radarr', 'Radarr API', { maxKeys: RADARR_MAX_KEYS }),
    whisparr: new Cache('whisparr', 'Whisparr API', {
      maxKeys: RADARR_MAX_KEYS,
    }),
    sonarr: new Cache('sonarr', 'Sonarr API', { maxKeys: SONARR_MAX_KEYS }),
    sportarr: new Cache('sportarr', 'Sportarr API'),
    rt: new Cache('rt', 'Rotten Tomatoes API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 43200,
      maxKeys: RT_MAX_KEYS,
    }),
    imdb: new Cache('imdb', 'IMDB Radarr Proxy', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 43200,
      maxKeys: IMDB_MAX_KEYS,
    }),
    github: new Cache('github', 'GitHub API', {
      stdTtl: GITHUB_CACHE_TTL_SECONDS,
      maxKeys: GITHUB_MAX_KEYS,
    }),
    plextv: new Cache('plextv', 'Plex TV', {
      stdTtl: 86400 * 7, // 1 week cache
      maxKeys: PLEX_TV_MAX_KEYS,
    }),
    plexwatchlist: new Cache('plexwatchlist', 'Plex Watchlist', {
      maxKeys: PLEX_WATCHLIST_MAX_KEYS,
    }),
    tvdb: new Cache('tvdb', 'The TVDB API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 21600,
      maxKeys: TVDB_MAX_KEYS,
    }),
    tvmaze: new Cache('tvmaze', 'TVmaze API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 3600,
      maxKeys: 1000,
      maxBytes: 16 * 1024 * 1024,
    }),
    plexguid: new Cache('plexguid', 'Plex GUID', {
      stdTtl: 86400 * 7,
      checkPeriod: 60 * 30,
    }),
    lidarr: new Cache('lidarr', 'Lidarr API'),
    readarr: new Cache('readarr', 'Bookshelf API'),
    musicbrainz: new Cache('musicbrainz', 'MusicBrainz API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 21600,
      checkPeriod: 60 * 30,
    }),
    listenbrainz: new Cache('listenbrainz', 'ListenBrainz API', {
      stdTtl: 21600,
      checkPeriod: 60 * 30,
    }),
    coverartarchive: new Cache('coverartarchive', 'Cover Art Archive API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    openlibrary: new Cache('openlibrary', 'Open Library API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    comicvine: new Cache('comicvine', 'ComicVine API', {
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    metron: new Cache('metron', 'Metron API', {
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    questarr: new Cache('questarr', 'QuestarrNG catalog', {
      stdTtl: 600,
      maxKeys: 500,
      maxBytes: 16 * 1024 * 1024,
    }),
    romarr: new Cache('romarr', 'ROMarrNG systems', {
      stdTtl: 300,
      maxKeys: 32,
      maxBytes: 4 * 1024 * 1024,
    }),
    googlebooks: new Cache('googlebooks', 'Google Books API', {
      stdTtl: 900,
      maxKeys: GOOGLE_BOOKS_MAX_KEYS,
      checkPeriod: 60 * 5,
    }),
    wikidata: new Cache('wikidata', 'Wikidata API', {
      staleMaxAge: DEFAULT_STALE_MAX_AGE_SECONDS,
      persist: true,
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    tadb: new Cache('tadb', 'TheAudioDB API', {
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    associations: new Cache('associations', 'Cross-Medium Associations', {
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
  };

  public getCache(id: AvailableCacheIds): Cache {
    return this.availableCaches[id];
  }

  public getAllCaches(): Record<string, Cache> {
    return this.availableCaches;
  }
}

const cacheManager = new CacheManager();

export const isAvailableCacheId = (id: string): id is AvailableCacheIds =>
  Object.prototype.hasOwnProperty.call(cacheManager.getAllCaches(), id);

export default cacheManager;
